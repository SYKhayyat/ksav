//! Turning laid-out pages into SVG, on every core rather than one.
//!
//! # The finding (#218)
//!
//! A 634 KB sefer — 258 pages — took **3.4 s** per compile on the server, and the
//! editor's promise is that the page follows the typing. The audit that filed
//! `#218` blamed the layout, reading 3.4× the bytes for 5.3× the time as a
//! superlinear pagination curve.
//!
//! The curve is not in the layout. Measured on this tree, per page:
//!
//! | pages | layout | preview (all SVGs) | export (+PDF) |
//! |---|---|---|---|
//! | 60 | 8 ms | 131 ms | 154 ms |
//! | 160 | 24 ms | 332 ms | 403 ms |
//! | 260 | 35 ms | 543 ms | 656 ms |
//!
//! Layout is flat and cheap: ~0.13 ms a page, ratio 1.03 across a 4.3× document.
//! **Serialising the pages is 15× the layout**, and `lib.rs` had already recorded
//! the same shape on a 28-page document — layout 42 ms, all 28 SVGs 310 ms. So a
//! keystroke costs what it costs because one thread writes one page at a time.
//!
//! # Why this is safe to parallelise, and how it is proven
//!
//! Serialising a page is a **pure function of the page and the options**: the
//! frame and its fill and bleed in, a string out. No shared state, no I/O, no
//! order dependence — the pages are laid out before this module is called and
//! nothing here touches Typst. So the work divides by page, and the answers are
//! put back in the order they came out, which is the order the client asks for.
//!
//! *Proven*, not asserted: `tests/pagesvg.rs` compiles a document of several
//! pages, serialises it on one thread and on four, and requires the two vectors
//! to be **byte-identical**, element for element — including the empty strings
//! standing in for pages the caller already holds. A parallel writer that
//! reordered a page or produced different bytes fails there rather than in a
//! writer's PDF.
//!
//! # Two threads is not always better than one
//!
//! A short document has one or two pages, and the thread bookkeeping costs more
//! than the page. `MIN_PAGES_PER_THREAD` keeps a one-page preview on the calling
//! thread, which is the common case in an editor and must not pay for machinery
//! it cannot use. The box's own core count caps the rest, and the browser build
//! has no threads at all: it serialises in place, which is the same answer.
//!
//! The fingerprint is computed first, for every page, before any page is
//! serialised — the same decision `lib.rs` records at length: a fingerprint taken
//! from the SVG forces the work it was meant to avoid.

use std::collections::HashSet;

use typst_layout::Page;
use typst_svg::SvgOptions;

/// Pages below this count are serialised on the calling thread.
///
/// The cost of a scoped thread is tens of microseconds; a page is a few
/// milliseconds. Two pages a thread is the point where a thread has paid for
/// itself twice over, and a one-page preview — every keystroke in a short sefer —
/// never reaches here.
const MIN_PAGES_PER_THREAD: usize = 2;

/// How many threads to use for `pages` pages.
///
/// Capped by the box's core count and by the pages there are to write. The knob
/// exists for two reasons this file cannot answer for itself: a caller that knows
/// the machine is busy (the server has `KSAV_POOL_THREADS` compiles in flight
/// already, each of which now wants every core), and a test that needs the
/// sequential answer on a box with many cores.
pub fn threads_for(pages: usize) -> usize {
    let wanted = typst_threads();
    let per = pages / MIN_PAGES_PER_THREAD;
    wanted.min(per).max(1)
}

/// `KSAV_SVG_THREADS` if set, else the box's core count, else 4.
fn typst_threads() -> usize {
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(n) = crate::knobs::number("KSAV_SVG_THREADS") {
            return (n as usize).clamp(1, 16);
        }
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .clamp(1, 16)
    }
    // No threads in the browser build. Same answers, written in place.
    #[cfg(target_arch = "wasm32")]
    {
        1
    }
}

/// What the SVG of each page is, and the fingerprint that identifies the page.
///
/// `have` is the set of fingerprints the caller is still holding: those pages
/// come back as the empty string beside their fingerprint, never serialised. The
/// two vectors are the length of `pages` and in its order.
pub fn serialise(
    pages: &[Page],
    have: &HashSet<String>,
    opts: &SvgOptions,
    threads: usize,
) -> (Vec<String>, Vec<String>) {
    // Fingerprint first, and for every page: it is what decides whether the page
    // is serialised at all, so it cannot be taken from the serialisation.
    let hashes: Vec<String> = pages.iter().map(fingerprint).collect();

    let mut svgs: Vec<String> = vec![String::new(); pages.len()];
    let todo: Vec<usize> = (0..pages.len())
        .filter(|&i| !have.contains(&hashes[i]))
        .collect();

    if threads <= 1 || todo.len() < threads * MIN_PAGES_PER_THREAD {
        for &i in &todo {
            svgs[i] = typst_svg::svg(&pages[i], opts);
        }
        return (hashes, svgs);
    }

    // One chunk a thread, in page order, so nothing has to be sorted afterwards.
    let chunk = todo.len().div_ceil(threads);
    #[cfg(not(target_arch = "wasm32"))]
    {
        let done: Vec<(usize, String)> = std::thread::scope(|scope| {
            let handles: Vec<_> = todo
                .chunks(chunk)
                .map(|ids| {
                    scope.spawn(move || {
                        ids.iter()
                            .map(|&i| (i, typst_svg::svg(&pages[i], opts)))
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            let mut all = Vec::with_capacity(todo.len());
            for h in handles {
                // A panicking serialiser is a bug in Typst or in a font, and the
                // honest answer is to fail the compile rather than to hand back a
                // document with a missing page. `resume_unwind` keeps the panic
                // and its message, which a swallowed one would lose.
                match h.join() {
                    Ok(part) => all.extend(part),
                    Err(payload) => std::panic::resume_unwind(payload),
                }
            }
            all
        });
        for (i, svg) in done {
            svgs[i] = svg;
        }
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = chunk;
        for &i in &todo {
            svgs[i] = typst_svg::svg(&pages[i], opts);
        }
    }

    (hashes, svgs)
}

/// A page's identity for the client's cache: the frame and what is drawn behind
/// and beyond it.
///
/// Not stable across processes, and it does not need to be: the client stores
/// these in memory and hands them straight back, and every response carries a
/// fresh set. A restarted engine simply finds nothing in `have` and sends
/// everything once.
pub fn fingerprint(page: &Page) -> String {
    format!(
        "{:032x}",
        typst::utils::hash128(&(&page.frame, &page.fill, &page.bleed))
    )
}

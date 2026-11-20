//! What a page of a sefer costs to compile, and that the cost per page is flat.
//!
//! # The finding (#218)
//!
//! `POST /compile` at 634 KB — 258 pages — took **3.4 s** on the server, against
//! 634 ms at 188 KB. 3.4× the bytes for 5.3× the time read as a superlinear
//! pagination curve, and the audit filed it as one: *"the growing cost is the
//! layout itself, and it grows faster than the body."*
//!
//! Measured properly, it is not. The layout is ~0.13 ms a page and stays there
//! across a 4.3× document; what grows is the **page writing** — the SVG of every
//! page the caller is not holding — at ~2 ms a page, fifteen times the layout.
//! `example bench-compile-curve` prints both columns; this file is what holds
//! them.
//!
//! # Why a ratio and not a wall clock
//!
//! Because the same box that runs CI also runs a build. An absolute millisecond
//! assertion either fails on a loaded machine or is set so loose it would pass
//! through a real regression. Every number below is therefore compared **against
//! another number measured in the same process, on the same machine, in the same
//! run** — so a slow box is slow in both terms and the ratio holds:
//!
//! - `layout per page` at 260 pages against 60: the curve. A layout that became
//!   superlinear shows here whatever the machine's speed, which is exactly the
//!   thing #218 feared.
//! - `page writing` against `layout` at the largest size: the share of a compile
//!   that is serialisation. If writing got slower the ratio moves, and if layout
//!   came to dominate the reading changes meaning, which is worth knowing too.
//!
//! The absolute numbers are printed on every run, so a human reading the log sees
//! the real milliseconds beside the ratios and can tell a fast fence from a slow
//! one.
//!
//! # Three sizes, and the one the audit measured at
//!
//! 60, 160 and 260 pages — 139 KB, 372 KB and 605 KB, which brackets the 500 KB
//! that `ksav/README.md` calls a 200-page sefer. The fixture is ordinary Hebrew
//! prose with explicit page breaks, so the page count is the number asked for
//! rather than whatever line breaking produced.

use ksav_engine::assets::Assets;
use ksav_engine::pagesvg::threads_for;
use ksav_engine::{compile_doc, compile_parts, probe, DocConfig, Wants};
use std::collections::HashSet;
use std::time::Instant;

/// One page of prose: dense enough to be a real page, plain enough that the
/// measurement is about writing pages rather than about a construct.
pub fn prose_page(page: usize) -> String {
    let mut s = String::new();
    for line in 0..9 {
        s.push_str(&format!(
            "דברי הפוסקים בענין זה ארוכים ומבוארים, ועיין בשו\"ע סימן {page} סעיף {line} \
ובמה שכתבו האחרונים שם, ולענין הלכה יש לדון בכל פרט ופרט היאך הוא, וצריך עיון. "
        ));
        s.push('\n');
    }
    s.push_str("#מעבר_עמוד\n");
    s
}

pub fn body(pages: usize) -> String {
    let mut s = String::new();
    for p in 0..pages {
        s.push_str(&prose_page(p));
    }
    s
}

/// The **least** time of `runs` warm runs, in milliseconds.
///
/// Least, not mean or median: a loaded box only ever adds time, so the minimum is
/// the closest estimate of what the work itself costs. This is the same reason
/// `bench-scaling.rs` warms up before it reads a clock.
fn least_ms(mut f: impl FnMut(), runs: usize) -> f64 {
    f(); // the first pass pays for the prelude, the fonts and the memoisation
    let mut best = f64::INFINITY;
    for _ in 0..runs {
        let t0 = Instant::now();
        f();
        best = best.min(t0.elapsed().as_secs_f64() * 1000.0);
    }
    best
}

/// The curve's ceiling, and the tightest number in this file that is not a
/// measurement.
///
/// The ratio is measured on the **whole compile** — layout plus the SVG of every
/// page — and not on the layout alone, and that was a correction made by
/// measuring: the layout is ~20 ms at 260 pages, so a ratio taken over it swings
/// with whatever else the box is doing. A doubling of layout work moved it from
/// 0.62 to 1.22 on a loaded machine, which is the same territory as noise. The
/// whole compile is ~700 ms at that size and its per-page ratio holds at 0.6–1.0
/// across nine runs, so a fence set here fails on shape and not on weather.
///
/// Measured: 0.56–1.06. The ceiling is a metre above the worst reading.
const RATIO: f64 = 1.6;

/// The tripwire, not the budget. A page whose compile costs this much is a
/// compile nobody can type into, and it is set far above every reading on this
/// tree (release ~4 ms a page, debug ~9) because an absolute ceiling that tries
/// to be tight is an assertion that fails on a loaded CI box and passes through
/// the regression it was written for. Constant-factor regressions are what the
/// example prints for a human; this file holds the shape.
const CEILING_MS_PER_PAGE: f64 = 40.0;

#[test]
fn the_cost_of_a_page_does_not_grow_with_the_sefer() {
    let cfg = DocConfig::default();
    let assets = Assets::default();
    let none: HashSet<String> = HashSet::new();

    // pages, per-page layout, per-page whole compile
    let mut rows: Vec<(usize, f64, f64)> = Vec::new();
    for pages in [60usize, 160, 260] {
        let b = body(pages);
        let laid = probe::page_sizes(&compile_doc(&b, &cfg).expect("compiled")).len();

        let layout = least_ms(
            || {
                compile_doc(&b, &cfg).expect("compiled");
            },
            3,
        );
        // Every page written: the worst case a caller can ask for, and the shape
        // an export takes.
        let whole = least_ms(
            || {
                compile_parts(&b, &cfg, &assets, Wants::default(), &none);
            },
            2,
        );
        rows.push((laid, layout / laid as f64, whole / laid as f64));
        println!(
            "{:4} pages, {:7} bytes: layout {:.3} ms/page, whole compile {:.3} ms/page",
            laid,
            b.len(),
            layout / laid as f64,
            whole / laid as f64
        );
    }

    let first = rows[0].2;
    let last = rows[2].2;
    println!(
        "whole compile per page: {first:.3} ms at {} pages, {last:.3} ms at {} — ratio {:.2}",
        rows[0].0,
        rows[2].0,
        last / first
    );

    // **The curve.** Work that grows with the document shows here whatever the
    // machine's speed, which is the thing #218 was filed about.
    assert!(
        last < first * RATIO,
        "a page cost {:.2}x more to compile at {} pages than at {} — \
         the curve is no longer flat ({:.3} ms/page then, {:.3} now)",
        last / first,
        rows[2].0,
        rows[0].0,
        first,
        last
    );

    // **The share.** Writing the pages is what a compile at this size spends its
    // time on. If layout ever came to dominate, the numbers in `ksav/README.md`
    // would be describing something else.
    let share = rows[2].2 / rows[2].1;
    assert!(
        share > 1.5,
        "the whole compile is only {share:.1}x the layout at {} pages — either \
         writing got much faster or layout got much slower, and both are worth a \
         look before this fence goes on believing its own numbers",
        rows[2].0
    );

    // **And the tripwire**, on the whole compile, which is what a writer waits
    // for: never in any reading on this tree, and impossible to miss when it is.
    assert!(
        rows[2].2 < CEILING_MS_PER_PAGE,
        "a page costs {:.1} ms to compile at {} pages, past the {} ms tripwire — \
         this is a compile nobody can type into",
        rows[2].2,
        rows[2].0,
        CEILING_MS_PER_PAGE
    );
}

#[test]
fn a_keystroke_costs_the_pages_that_moved_and_not_the_sefer() {
    // The path a writer's typing actually takes: the client hands back the
    // fingerprints of the pages it is still holding, and only the pages that
    // changed are written. It is the one measurement where the page-writing cost
    // *leaves* the compile, and the difference is what the client's cache buys.
    let cfg = DocConfig::default();
    let assets = Assets::default();
    let none: HashSet<String> = HashSet::new();
    let b = body(260);

    let laid = probe::page_sizes(&compile_doc(&b, &cfg).expect("compiled")).len();
    let held: HashSet<String> = compile_parts(&b, &cfg, &assets, Wants::default(), &none)
        .pages_hash
        .into_iter()
        .collect();
    assert_eq!(held.len(), laid, "one fingerprint a page");

    let writing = least_ms(
        || {
            compile_parts(&b, &cfg, &assets, Wants::default(), &none);
        },
        2,
    );
    let holding = least_ms(
        || {
            compile_parts(&b, &cfg, &assets, Wants::default(), &held);
        },
        2,
    );
    println!(
        "{} pages: writing every page {writing:.1} ms, holding every page {holding:.1} ms — {:.0}% saved",
        laid,
        (1.0 - holding / writing) * 100.0
    );

    // Holding every page must be *cheaper* than writing every page, or the cache
    // is decoration. It is not asserted to be "fast": the floor is the layout plus
    // the fingerprint of every page, which the cache cannot remove.
    assert!(
        holding < writing,
        "holding every page cost {holding:.1} ms and writing them cost {writing:.1} ms — \
         the client's page cache is not being consulted"
    );
}

#[test]
fn the_serialiser_uses_the_box_it_is_given() {
    // Not a timing test: the *shape* of the decision, at the sizes this file
    // measures and at the size of a one-page preview.
    assert_eq!(
        threads_for(1),
        1,
        "a one-page preview must not spawn a thread"
    );
    assert!(
        threads_for(260) > 1
            || std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(1)
                == 1
    );
}

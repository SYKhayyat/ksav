//! Serialising pages on many threads produces the same bytes as on one (#218).
//!
//! # Why this file exists
//!
//! `src/pagesvg.rs` writes the SVG of every page a caller is not already holding,
//! and it does so on the box's cores rather than on one thread. That is a change
//! to the *shape* of the work in the middle of a compile — the place where a
//! wrong answer reaches the writer as a page in the wrong position, a page
//! rendered twice, or a page missing — so it is proven rather than asserted:
//!
//! - one thread and four threads produce **byte-identical** vectors, element for
//!   element, in page order;
//! - the fingerprint vector is independent of the thread count, because a
//!   fingerprint is what the client's cache is keyed on and a different set
//!   between two compiles would blank the preview;
//! - a page in `have` comes back as the empty string in **its own** slot, never
//!   shifted by one, which is the failure a parallel writer invites;
//! - pages vanish from the work when they are held, rather than being serialised
//!   and thrown away — the mistake `lib.rs` records making once already.
//!
//! The document is real: it is compiled through the same entry point a preview
//! uses, so what is compared is the SVG a writer would actually be sent.

use std::collections::HashSet;

use ksav_engine::pagesvg::{serialise, threads_for};
use ksav_engine::{probe, DocConfig};
use typst_svg::SvgOptions;

/// Four pages of ordinary Hebrew prose, each followed by an explicit break, so
/// the page count is the number written and not an accident of line breaking.
fn four_pages() -> String {
    let mut s = String::new();
    for p in 0..4 {
        for line in 0..8 {
            s.push_str(&format!(
                "דברי הפוסקים בענין זה, ועיין בסימן {p} סעיף {line}, ובמה שכתבו האחרונים. "
            ));
        }
        s.push_str("\n#מעבר_עמוד\n");
    }
    s
}

fn pages() -> Vec<typst_layout::Page> {
    let doc = probe::layout(&four_pages(), &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    doc.pages().to_vec()
}

#[test]
fn many_threads_write_the_same_bytes_as_one() {
    let pages = pages();
    assert!(pages.len() >= 3, "the fixture has to be several pages");

    let opts = SvgOptions::default();
    let none = HashSet::new();
    let (hashes1, one) = serialise(&pages, &none, &opts, 1);
    for threads in [2usize, 3, 4] {
        let (hashes, many) = serialise(&pages, &none, &opts, threads);
        assert_eq!(
            hashes, hashes1,
            "{threads} threads changed the fingerprints"
        );
        assert_eq!(
            many.len(),
            one.len(),
            "{threads} threads changed the page count"
        );
        for (i, (a, b)) in one.iter().zip(many.iter()).enumerate() {
            assert_eq!(
                a,
                b,
                "page {} differs between 1 and {} threads",
                i + 1,
                threads
            );
        }
    }

    // And they are pages, not empty strings: a writer that produced nothing at all
    // on four threads would pass every comparison above.
    for (i, svg) in one.iter().enumerate() {
        assert!(
            svg.contains("<svg") && svg.len() > 500,
            "page {} came back as {} bytes: {svg:.80}",
            i + 1,
            svg.len()
        );
    }
}

#[test]
fn a_held_page_comes_back_empty_in_its_own_place() {
    let pages = pages();
    let opts = SvgOptions::default();
    let all: HashSet<String> = pages
        .iter()
        .map(ksav_engine::pagesvg::fingerprint)
        .collect();
    let (hashes, svgs) = serialise(&pages, &all, &opts, 4);
    assert_eq!(hashes.len(), pages.len());
    assert!(
        svgs.iter().all(|s| s.is_empty()),
        "a caller holding every page is sent {} bytes",
        svgs.iter().map(String::len).sum::<usize>()
    );

    // One page held: that page and no other is blank. The slot is what the client
    // keys on, so an off-by-one here is a preview with the wrong page in it.
    let mut one = HashSet::new();
    one.insert(hashes[1].clone());
    let (_, svgs) = serialise(&pages, &one, &opts, 4);
    for (i, svg) in svgs.iter().enumerate() {
        if i == 1 {
            assert!(svg.is_empty(), "the held page was serialised anyway");
        } else {
            assert!(
                svg.contains("<svg"),
                "page {} was skipped and should not be",
                i + 1
            );
        }
    }
}

#[test]
fn a_short_document_is_written_on_the_calling_thread() {
    // The common case in an editor is a one- or two-page preview, and a thread
    // that costs more than the page it writes is a slowdown dressed as a fix.
    assert_eq!(threads_for(1), 1);
    assert_eq!(threads_for(2), 1);
    assert_eq!(threads_for(3), 1);
    // Two pages a thread, and never more threads than pages.
    for pages in 4..40 {
        assert!(
            threads_for(pages) <= pages / 2,
            "{} pages wanted {} threads",
            pages,
            threads_for(pages)
        );
        assert!(threads_for(pages) >= 1);
    }
    assert!(
        threads_for(260) <= 16,
        "the cap is the box's size, not the page count"
    );
}

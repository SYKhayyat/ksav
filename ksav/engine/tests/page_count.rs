//! A sefer is exactly as long as it needs to be.
//!
//! # The finding
//!
//! **Every document with a page-foot apparatus ended on a blank sheet.** One line
//! of body, one short note, two pages — the second empty but for its page number.
//! It held for the banded apparatus, for a declared region at `מיקום: "רגל"`, and
//! for a note that spills, which got two blanks rather than one.
//!
//! The cause is in `_sn_tail_pages`. The walk that adds continuation pages needs
//! Typst to run another layout pass once the notes have positions, and the only
//! thing Typst watches is a laid-out frame — so the answer is written into one as
//! a hidden numeral. That much is right and is documented there at length. What
//! was missing is that it was emitted **whether or not there was anything to
//! watch**: with no pages to add, a `place`d numeral at the end of a flow with
//! nothing else to carry still needs a frame to hang off, and Typst opened a
//! sheet for it.
//!
//! # Why nothing caught it
//!
//! Every fence in this suite reads **where words landed**, and a blank sheet has
//! no words on it. So every assertion about every apparatus was true, on a
//! document one page longer than the writer wrote. The count itself was the one
//! thing nobody asked for.
//!
//! It is the same shape as the bug `_sn_tail_pages` exists to fix, one sign
//! flipped: that one was pages that were needed and never appeared, and it was
//! found by a person opening a PDF rather than by a test. This file is the fence
//! for both directions, which is why it asserts the exact count and not a bound —
//! `>= 1` passes on the bug it was written for.

use ksav_engine::{probe, DocConfig};

fn pages(body: &str) -> usize {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}\n---\n{body}\n---"));
    probe::page_sizes(&doc).len()
}

/// One line and one note, in each of the ways a note can be filed, is one page.
///
/// Table-driven and not four tests, because the point is that the answer is the
/// same for all of them: the length of a sefer is a property of the sefer, not of
/// which apparatus it happens to use.
#[test]
fn a_short_document_with_notes_is_one_page() {
    let cases: &[(&str, &str)] = &[
        ("no notes at all", "#מסמך[\nשלום.\n]\n"),
        ("a footnote", "#מסמך[\nשלום#הערה[קצרה].\n]\n"),
        ("a page-foot band", "#מסמך[\nשלום#מדף_א[קצרה].\n]\n"),
        (
            "two page-foot bands",
            "#מסמך[\nשלום#מדף_א[קצרה]#מדף_ב[שניה].\n]\n",
        ),
        (
            "a declared region at the foot",
            "#מסמך(אזור_הערות: 3cm)[\n#אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm)\n\
             שלום#הערה(אזור: \"צר\")[קצרה].\n]\n",
        ),
        (
            "a section band",
            "#מסמך[\nשלום#מדור_א[קצרה].\n\n#הערות_מדורגות()\n]\n",
        ),
        (
            "a side note",
            "#מסמך[\n#עם_הערות_צד[\nשלום#הערת_גיליון[קצרה] וסוף.\n]\n]\n",
        ),
    ];
    let wrong: Vec<String> = cases
        .iter()
        .map(|(what, body)| (what, pages(body)))
        .filter(|(_, n)| *n != 1)
        .map(|(what, n)| format!("{what}: {n} pages"))
        .collect();
    assert!(
        wrong.is_empty(),
        "a one-line document came out longer than one page: {wrong:?}"
    );
}

/// A note that spills takes the pages it needs and not one more.
///
/// The corpus documents are the same two `overflow_moves.rs` reads, so a change
/// that moves the cut shows up in both — there as words in the wrong place, here
/// as a sheet nobody asked for.
#[test]
fn a_spilling_note_takes_exactly_the_pages_it_needs() {
    let cut = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/notes-corpus/giant_spill.ksav"),
    )
    .expect("giant_spill.ksav");
    let windowed = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/notes-corpus/giant_spill_uncuttable.ksav"),
    )
    .expect("giant_spill_uncuttable.ksav");
    // Fifty words into a region that holds twenty-eight of them: two pages, and
    // `overflow_moves.rs` says which words are on each.
    assert_eq!(pages(&cut), 2, "the cut note is not two pages");
    assert_eq!(pages(&windowed), 2, "the windowed note is not two pages");
}

/// A sefer grows when something asks it to, and this is what asking looks like.
///
/// The counterweight to the two tests above: an extra page is a defect only when
/// nothing asked for it, so a fence that simply refused to let a document grow
/// would be wrong. `עמוד_חדש` is the ask.
///
/// It also pins the default, which is `auto` and is not "no": each placement
/// keeps its own habit. A region at the back of the sefer **follows on** from the
/// body — it is a section of this volume — and a companion held for a file of its
/// own starts a sheet, because that is what makes it a separate volume. Written
/// as one test over both values so the pair cannot drift into agreeing.
#[test]
fn a_region_opens_its_own_sheet_when_it_is_asked_to() {
    let doc = |extra: &str| {
        format!(
            "#מסמך[\n#אזור(\"ביאורים\", מיקום: \"סוף\"{extra})\n\
             שלום#הערה(אזור: \"ביאורים\")[קצרה].\n]\n"
        )
    };
    assert_eq!(
        pages(&doc("")),
        1,
        "the back of the sefer took a sheet of its own without being asked"
    );
    assert_eq!(
        pages(&doc(", עמוד_חדש: true")),
        2,
        "`עמוד_חדש: true` did not open a sheet"
    );
}

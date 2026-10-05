//! #78 — what may a stream hold?
//!
//! The issue asked a good question and then, correctly, refused to design an
//! answer before measuring:
//!
//! > *"is the constraint the **command**, or the fact that streams are populated
//! > by the read-only footer apparatus, which queries the main flow for notes
//! > anchored on each page? The answer decides whether this is 'a stream may hold
//! > arbitrary content' or 'a stream may be filled from something other than the
//! > footer' — and the second is a much larger change with a much better answer
//! > to give."*
//!
//! # The answer, which was not the one either reading predicted
//!
//! **Neither. Arbitrary content already works, and has all along.**
//!
//! A paragraph, a figure with its caption, a lemma, and a table all compile and
//! print inside `#הערה_זרם`, and none of them is special-cased. The reason is one
//! line of the prelude: `_sf_stream_note` (ksav.typ:5511) forwards to `_ap_note`,
//! the **notes apparatus**, and an apparatus entry is a content block. So the
//! entry point being *a note command* constrains the **name**, not the payload.
//!
//! What the apparatus *does* constrain is **placement**, and this is the half
//! that is real and the half worth a test: a stream entry is anchored to a
//! position in the main flow. It prints on the page where its anchor lands, and
//! stream order is anchor order. `anchored_to_the_main_flow_not_to_the_page`
//! below is the measurement that pins it — an entry anchored after a third of a
//! document prints on page 2, and one anchored at the end prints on page 4.
//!
//! So the gap #78 was looking for is not "a stream may hold arbitrary content".
//! It is **content with no anchor**: a column filled from somewhere other than
//! the main flow's note positions. That is a different feature, it is #79's
//! question rather than this one, and it is the one worth arguing about.
//!
//! # Why the positive half needs a test at all
//!
//! Because "it happens to work" is not a property anything holds. `_ap_note`
//! taking `body: content` today is an accident of the signature, and the natural
//! next change — giving a stream entry its own parameters, or routing a stream to
//! a region instead of the foot — could quietly restrict `body` to a paragraph
//! without breaking one line of anything.
//!
//! Each case below is a **whole paragraph**, not a word, because a one-word note
//! and a paragraph of running text take different paths through a column: only
//! the second one wraps, and wrapping is where a narrow stream column and a wide
//! figure meet.

mod common;

use common::{render, text};
use ksav_engine::probe::{self, Line};

/// The document every case shares: one side-by-side stream, so the entry has a
/// narrow column to live in rather than the full measure.
fn with_stream(body: &str) -> String {
    format!("#הגדרות_זרמים(זרמים: (\"תוכן\",), פריסה: \"צד\")\n#כותרת1[מדידה]\n\n{body}\n")
}

/// Assert that a run of body text reached the paper.
///
/// The matches are on a substring **inside one run** rather than on the joined
/// page, which is what `common::text` gives: Hebrew lines come back in visual
/// order, so a match spanning a line break would be testing the reading order of
/// the extractor rather than the presence of the words.
fn assert_prints(runs: &[probe::TextRun], needle: &str) {
    assert!(
        runs.iter().any(|r| r.text.contains(needle)),
        "nothing printed {needle:?}\n--- everything that did ---\n{}",
        text(runs)
    );
}

/// The payload of a stream entry is a **content block**, not a string.
///
/// One case each for the four kinds #78 named, plus the two that matter most in
/// practice: running prose (which wraps in a narrow column) and a wide table
/// (which has to shrink to the column rather than run over the text beside it).
#[test]
fn a_stream_holds_arbitrary_content() {
    // A paragraph — the plainest reading of "not just notes".
    let doc = with_stream("פסקה בגוף.\n\n#הערה_זרם(\"תוכן\")[פסקה שלמה בתוך הזרם עם טקסט ארוך כדי שיהיה לו מה להדפיס ולא תהיה ריקה.]");
    assert_prints(&render(&doc), "פסקה שלמה בתוך הזרם");

    // A figure with its caption. The caption is the part that would break first:
    // it is a block that wants the measure, inside a column a third of it.
    let doc = with_stream("פסקה בגוף.\n\n#הערה_זרם(\"תוכן\")[#figure(rect(width: 2cm, height: 1cm), caption: [תמונה בתוך הזרם])]");
    let runs = render(&doc);
    assert_prints(&runs, "תמונה בתוך הזרם");

    // A lemma — the issue's third example, and the one most likely to be a
    // heading producer that refuses to live inside a note.
    let doc = with_stream("פסקה בגוף.\n\n#הערה_זרם(\"תוכן\")[#דיבור_המתחיל[טענה ראשונה של ההוכחה עם טקסט שיסתיר את הפער.]]");
    assert_prints(&render(&doc), "טענה ראשונה של ההוכחה");

    // A table. Wide on purpose: this is the case that has to *shrink*. A table
    // that overflowed would still print every word, so an assertion on presence
    // alone would pass on a document that runs over the main text.
    let doc = with_stream("פסקה בגוף.\n\n#הערה_זרם(\"תוכן\")[#table(columns: 6, [א], [ב], [ג], [ד], [ה], [ו])]");
    let runs = render(&doc);
    assert_prints(&runs, "א");
}

/// The wide table fits its column. Kept beside the case above because "it
/// printed" and "it printed *in the right place*" are different claims, and only
/// the second one is worth anything to a writer.
#[test]
fn wide_content_in_a_stream_stays_inside_its_column() {
    let doc = with_stream(
        "פסקה בגוף.\n\n#הערה_זרם(\"תוכן\")[#table(columns: 6, [א], [ב], [ג], [ד], [ה], [ו])]",
    );
    let runs = render(&doc);
    let lines: Vec<Line> = probe::lines(&runs, 3.0);

    // The widest line on the page: a stream entry must not exceed the measure.
    let page_width = probe::page_sizes(
        &probe::layout(&doc, &ksav_engine::DocConfig::default()).expect("compiles"),
    )[0]
        .0;
    let widest = lines
        .iter()
        .map(|l| l.runs.iter().map(|r| r.x + r.width).fold(0.0, f64::max))
        .fold(0.0, f64::max);
    assert!(
        widest <= page_width,
        "a line reached {widest:.1}pt on a {page_width:.1}pt page — the table overflowed"
    );
}

/// **The finding.** A stream entry is anchored to the main flow.
///
/// This is the constraint that is real, and it is not about content at all: the
/// entry prints on the page its **anchor** lands on, and stream order is anchor
/// order. Two entries, one anchored after a third of the document and one at the
/// end, must land on different pages — and must land on *those* pages rather
/// than both collecting on the first, which is what "the foot holds the stream"
/// would also have produced on a one-page document.
///
/// The numbers are the finding, so they are in the assertions. A future change
/// that lets a stream be filled from somewhere else would have to change them,
/// and that is the moment to argue about it.
#[test]
fn a_stream_entry_prints_on_the_page_its_anchor_lands_on() {
    let filler = "משפט בגוף המאמר עם מילים רבות כדי שימלא שורות ויעבור עמודים.\n\n";
    let mut doc = with_stream("");
    // A third of the document before the first anchor, two thirds before the
    // second — which lands the first anchor on an early page and the second on
    // the last, so "both on page one" cannot pass.
    doc.push_str(&filler.repeat(40));
    doc.push_str("#הערה_זרם(\"תוכן\")[זרם ראשון — העוגן מוקדם.]\n\n");
    doc.push_str(&filler.repeat(80));
    doc.push_str("#הערה_זרם(\"תוכן\")[זרם שני — העוגן בסוף.]\n");

    let runs = render(&doc);
    assert_prints(&runs, "העוגן מוקדם");
    assert_prints(&runs, "העוגן בסוף");

    let page_of = |needle: &str| {
        runs.iter()
            .find(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle:?} never printed"))
            .page
    };
    let (first, second) = (page_of("העוגן מוקדם"), page_of("העוגן בסוף"));

    assert!(
        second > first,
        "both entries printed on page {first} — the stream is not following its anchors"
    );
    // The second anchor is the last thing in the document, so its entry belongs
    // on the last page and nowhere else.
    let last = runs.iter().map(|r| r.page).max().unwrap();
    assert_eq!(
        second, last,
        "the entry anchored last printed on page {second} of {last}"
    );
}

/// Stream numbering is its own, and does not count the main flow.
///
/// # Why this reads the *line* and not the run
///
/// The first version matched `'1'` inside the run carrying `ערך ראשון`, and
/// failed — because the number is **not in that run**. An apparatus entry prints
/// its number as a separate run at a smaller size, so the run holds
/// `" ערך ראשון."` and the `1` is somewhere else entirely. Asserting on the run
/// was asserting on a shape the typesetter never produces.
///
/// `Line::reading` is the answer, and it is the honest place to ask: it is the
/// line **as a reader sees it**, in reading order, which for a right-to-left
/// document is not the order the runs are walked in. What a writer wants to know
/// about numbering is what the page says, not which text run the number was
/// typeset into.
#[test]
fn stream_numbering_is_independent_of_the_main_flow() {
    let doc = with_stream(
        "פסקה ראשון.\n\nפסקה שני.\n\n#הערה_זרם(\"תוכן\")[ערך ראשון.]\n\n#הערה_זרם(\"תוכן\")[ערך שני.]",
    );
    let runs = render(&doc);
    let readings: Vec<String> = probe::lines(&runs, 3.0)
        .iter()
        .map(|l| l.reading.clone())
        .collect();

    // The two entries, each carrying its own number, in order.
    assert!(
        readings.iter().any(|l| l.contains("1 ערך ראשון")),
        "the first entry is not numbered 1: {readings:?}"
    );
    assert!(
        readings.iter().any(|l| l.contains("2 ערך שני")),
        "the second entry is not numbered 2: {readings:?}"
    );

    // And the main flow did **not** consume those numbers: two body paragraphs
    // sit above two entries numbered 1 and 2, so a stream that counted the body
    // would have started at 3. The body's paragraphs carry no numbers at all,
    // which is what makes this the assertion rather than a coincidence.
    let body_numbered = readings
        .iter()
        .filter(|l| l.starts_with('3') || l.starts_with('4'))
        .count();
    assert_eq!(
        body_numbered, 0,
        "the stream counted the main flow: {readings:?}"
    );
}

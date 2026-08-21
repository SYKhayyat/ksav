//! The side of the page is a value of the one axis, not a mechanism beside it.
//!
//! `NOTES-PLAN` thing two says a note has **one** question — where it goes — and
//! that everything else follows from the answer. Four of the five answers were
//! placements a channel could name. The fifth, *beside the text*, was reachable
//! only through three commands of its own: `#הערת_גיליון`, `#הערת_ימין` and
//! `#הערת_שמאל`. `#ערוץ("x", מיקום: "צד")` was refused as an unknown placement.
//!
//! Three commands that are one axis with three values is the exact shape the
//! channel model was built to undo — it is what the eighteen note commands were,
//! and what the seven tier commands stopped being when a tier became a built-in
//! channel. So the side is on the axis now, and those three commands are three
//! built-in side channels in the same sense.
//!
//! # Inside and outside are questions about the binding
//!
//! `"חוץ"` and `"פנים"` are binding-relative: on a two-sided sefer the outer edge
//! is one side of a recto and the other side of a verso, so a note that says
//! *outside* changes edge with the page and stays outside. That is what makes a
//! margin apparatus look right in a bound sefer, and an absolute edge cannot do
//! it. `"ימין"` and `"שמאל"` name an edge outright and never move, which is a
//! real thing to want and is why both kinds exist.
//!
//! A one-sided document has no spine to be inside of, so `"חוץ"` keeps the
//! meaning it always had and every document written before this is unchanged.

use ksav_engine::{probe, DocConfig};

fn laid(body: &str, cfg: &DocConfig) -> Vec<probe::TextRun> {
    let doc = probe::layout(body, cfg).unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// The left edge of the run carrying `word`, on `page`.
fn x_of(runs: &[probe::TextRun], page: usize, word: &str) -> f64 {
    runs.iter()
        .find(|r| r.page == page && r.text.contains(word))
        .unwrap_or_else(|| panic!("{word:?} is not on page {page}"))
        .x
}

/// The page a note landed on, and its left edge.
///
/// Found rather than assumed: a side column narrows the text, so how much filler
/// reaches a second page is a property of the layout under test and not
/// something a test should be asserting by accident.
fn note_at(runs: &[probe::TextRun], word: &str) -> (usize, f64) {
    let r = runs
        .iter()
        .find(|r| r.text.contains(word))
        .unwrap_or_else(|| panic!("{word:?} is nowhere in the document"));
    (r.page, r.x)
}

/// A body long enough to run to a second page, with a side note on each.
///
/// The page turn has to be *earned* with text: a side column is a container and
/// Typst refuses a page break inside one, which is the right refusal — the
/// column is the thing being broken.
fn two_pages(channel: &str, place: &str) -> String {
    let filler = "שורה של טקסט למילוי העמוד ולדחיקת ההמשך לעמוד הבא.\n\n".repeat(30);
    format!(
        "#ערוץ(\"{channel}\", מיקום: \"{place}\")\n\
         #עם_הערות_צד[\n\
         פתיחה#הערה(ערוץ: \"{channel}\")[הערה ראשונה] המשך.\n\n\
         {filler}\
         עמוד שני#הערה(ערוץ: \"{channel}\")[הערה שניה] סוף.\n]\n"
    )
}

const ONE: &str = "\
#ערוץ(\"חיצון\", מיקום: \"חוץ\")
#עם_הערות_צד[
פתיחה לגוף הספר, ובה מילים רבות כדי שהעמוד יתמלא ותהיינה שורות רבות זו אחר זו.

טקסט ראשון#הערה(ערוץ: \"חיצון\")[הערה חיצונה] המשך.
]
";

/// A channel can be placed beside the text at all.
#[test]
fn a_channel_can_be_placed_beside_the_text() {
    let runs = laid(ONE, &DocConfig::default());
    assert!(
        runs.iter().any(|r| r.text.contains("הערה חיצונה")),
        "a channel placed at the side printed nothing"
    );
}

/// …and it lands in the margin rather than in the text block.
#[test]
fn a_side_channel_prints_in_the_margin() {
    let runs = laid(ONE, &DocConfig::default());
    let note = x_of(&runs, 1, "הערה חיצונה");
    let body = x_of(&runs, 1, "פתיחה לגוף");
    assert!(
        note < body,
        "the side note at x={note} is not outside the body at x={body}"
    );
}

/// Inside and outside are different edges.
#[test]
fn inside_and_outside_are_opposite_edges() {
    let doc = "\
#ערוץ(\"חיצון\", מיקום: \"חוץ\")
#ערוץ(\"פנימי\", מיקום: \"פנים\")
#עם_הערות_דו_צד[
פתיחה לגוף הספר, ובה מילים רבות כדי שהעמוד יתמלא ותהיינה שורות רבות זו אחר זו.

טקסט ראשון#הערה(ערוץ: \"חיצון\")[הערה חיצונה] המשך.

טקסט שני#הערה(ערוץ: \"פנימי\")[הערה פנימית] סוף.
]
";
    let runs = laid(doc, &DocConfig::default());
    let out = x_of(&runs, 1, "הערה חיצונה");
    let inn = x_of(&runs, 1, "הערה פנימית");
    assert!(
        (out - inn).abs() > 100.0,
        "inside and outside landed in the same column: {out} and {inn}"
    );
}

/// On a bound sefer, *outside* changes edge with the page and stays outside.
///
/// This is the assertion the whole binding-relative idea rests on. Without it
/// `"חוץ"` is just a second spelling of one absolute edge, which is what it was.
#[test]
fn outside_swaps_edges_on_a_two_sided_sefer() {
    let doc = two_pages("חיצון", "חוץ");
    let two = DocConfig {
        two_sided: true,
        ..DocConfig::default()
    };
    let runs = laid(&doc, &two);
    let (p1, recto) = note_at(&runs, "הערה ראשונה");
    let (p2, verso) = note_at(&runs, "הערה שניה");
    assert_ne!(
        p1 % 2,
        p2 % 2,
        "the two notes are on pages of one parity, so this proves nothing: {p1} and {p2}"
    );
    assert!(
        (recto - verso).abs() > 100.0,
        "outside stayed on one edge from page {p1} to page {p2}: {recto} and {verso}"
    );

    // …and on a one-sided document it does not move, because there is no spine
    // to be outside of. The control matters: without it the test above passes on
    // a prelude that alternates edges for every document, bound or not.
    let one = laid(&doc, &DocConfig::default());
    let (_, a) = note_at(&one, "הערה ראשונה");
    let (_, b) = note_at(&one, "הערה שניה");
    assert!(
        (a - b).abs() < 1.0,
        "a one-sided document alternated its margins: {a} and {b}"
    );
}

/// An edge named outright never moves, bound or not.
#[test]
fn a_named_edge_never_moves() {
    let doc = two_pages("ימני", "ימין");
    let runs = laid(
        &doc,
        &DocConfig {
            two_sided: true,
            ..DocConfig::default()
        },
    );
    let (p1, a) = note_at(&runs, "הערה ראשונה");
    let (p2, b) = note_at(&runs, "הערה שניה");
    assert_ne!(
        p1 % 2,
        p2 % 2,
        "both notes landed on pages of one parity, so this proves nothing"
    );
    assert!(
        (a - b).abs() < 1.0,
        "an absolute edge moved with the page: {a} and {b}"
    );
}

/// The old spelling still means what it meant.
#[test]
fn the_old_spelling_of_the_side_still_works() {
    let doc = ONE.replace("\"חוץ\"", "\"צד\"");
    let runs = laid(&doc, &DocConfig::default());
    let by_alias = x_of(&runs, 1, "הערה חיצונה");
    let by_name = x_of(&laid(ONE, &DocConfig::default()), 1, "הערה חיצונה");
    assert!(
        (by_alias - by_name).abs() < 0.5,
        "צד and חוץ are not the same edge: {by_alias} and {by_name}"
    );
}

/// Both spellings of one act give one answer.
///
/// `#הערה(ערוץ: "x")` and `#הערה_זרם("x")` are two doors a writer may use, and
/// they disagreed: a channel placed beside the text printed in the margin
/// through the first and at the foot of the page through the second. The
/// placement is a property of the channel, so it cannot depend on which command
/// was typed — which is the same complaint the eighteen note commands answered.
#[test]
fn both_doors_send_a_side_channel_to_the_side() {
    let body = |door: &str| {
        format!(
            "#ערוץ(\"גיליון\", מיקום: \"חוץ\")\n\
             שורה של גוף הספר ובה די מלים כדי למלא את השורה.{door} וסוף."
        )
    };
    let through_note = laid(
        &body("#הערה(ערוץ: \"גיליון\")[הערת שוליים]"),
        &DocConfig::default(),
    );
    let through_stream = laid(
        &body("#הערה_זרם(\"גיליון\")[הערת שוליים]"),
        &DocConfig::default(),
    );
    // One word, and the line it is on. A margin column is narrow enough that a
    // two-word note wraps, so no line holds the phrase — and a phrase can be
    // split across shaping boundaries even when it does not wrap. Both are
    // questions about where Typst broke rather than where the note landed.
    let x = |runs: &[probe::TextRun]| {
        let lines = probe::lines(runs, 1.0);
        let l = lines
            .iter()
            .find(|l| l.contains("שוליים"))
            .unwrap_or_else(|| panic!("the note printed nowhere"));
        l.runs.iter().map(|r| r.x).fold(f64::MAX, f64::min)
    };
    assert!(
        (x(&through_note) - x(&through_stream)).abs() < 0.5,
        "the two doors put the note in different places: {} and {}",
        x(&through_note),
        x(&through_stream)
    );
}

/// A note can say it may not be moved, and the others go around it.
///
/// The walk clamps, shifts and cascades unconditionally, which keeps decision
/// 6's invariant and gives the writer no say in **which** note moves. A gloss
/// keyed to one word wants to stay beside that word: a note that has drifted
/// four lines down is pointing at the wrong one.
///
/// The naive reading of "do not move me" — leave it at its anchor and carry on —
/// draws it through its neighbour, and decision 6 does not bend for a setting.
/// So a pinned note takes its place *before* the walk, and the walk steps over
/// the space it holds. Which is what the writer meant anyway.
#[test]
fn a_pinned_note_holds_its_place_and_the_rest_go_round() {
    let doc = "#עם_הערות_צד[\nפתיחה. מילה#הערת_גיליון[הערה ארוכה מאוד ראשונה ובה הרבה \
               מילים כדי שתתפוס מקום] מילה#הערת_גיליון(הזזה: false)[קבועה] סוף.\n]";
    let runs = laid(doc, &DocConfig::default());
    let y = |w: &str| {
        probe::lines(&runs, 1.0)
            .into_iter()
            .find(|l| l.contains(w))
            .unwrap_or_else(|| panic!("{w} printed nowhere"))
            .y
    };
    // The pinned one is beside its own line, above the note written before it.
    assert!(
        y("קבועה") < y("ארוכה"),
        "the pinned note at y={} did not keep its place above the note that moved (y={})",
        y("קבועה"),
        y("ארוכה")
    );
    // …and nothing is drawn on top of anything, which is the half a naive
    // "do not move me" gets wrong.
    let mut ys: Vec<f64> = probe::lines(&runs, 1.0)
        .into_iter()
        .filter(|l| l.y > 80.0 && l.runs.iter().any(|r| r.size < 10.0))
        .map(|l| l.y)
        .collect();
    ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
    for w in ys.windows(2) {
        assert!(
            w[1] - w[0] > 1.0,
            "two side notes were drawn at the same height: {w:?}"
        );
    }
}

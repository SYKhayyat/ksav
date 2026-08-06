//! What the markers *look like*.
//!
//! This suite exists because of a bug that three audits and 2,276 green
//! assertions missed and one glance at a rendered page found: the tiered
//! apparatus was numbered upside down. The chooser card described the
//! שער־הציון arrangement in its own words — "the commentary in one block
//! (א,ב,ג) and the he'aros on it in the block beneath (1,2,3)" — and the
//! engine shipped `("1", "א", …)`, so the primary band read ¹ ² and the
//! sub-band read א.
//!
//! Every existing test passed. `chooser.rs` renders every layout and checks
//! that every note reaches a page; `apparatus.rs` checks where things land. A
//! numbering scheme changes neither the page nor the y — it changes the
//! *glyph*, and nothing asserted on glyphs. A reader who has opened a sefer
//! sees it immediately; a coordinate dump does not show it at all.
//!
//! So: the shapes. Which is also the only assertion that can tell a reader's
//! two apparatuses apart, since a footnote `¹` and an endnote `¹` on one page
//! are identical in every measurement except the one that matters.

use ksav_engine::probe::{self, TextRun};
use ksav_engine::DocConfig;

fn render(body: &str) -> Vec<TextRun> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::text_runs(&doc)
}

/// Everything on the page, in one string — for the failure messages.
fn flat(runs: &[TextRun]) -> String {
    probe::lines(runs, 1.0)
        .iter()
        .map(|l| l.text())
        .collect::<Vec<_>>()
        .join(" / ")
}

/// The reference markers in the body text, as the reader meets them.
///
/// A marker sets on its own run — one character, superscript, at its own
/// baseline — so it is neither part of the word before it nor on the same
/// *line* as that word in a probe dump. Which is exactly why a coordinate test
/// could never see this bug, and why an assertion about a glyph has to go
/// looking for the run rather than for a substring of a line.
///
/// Only the first line of the document — not "the top of page 1", which is a
/// different thing and caught me out here. `#הערות_מדורגות` renders in the main
/// flow, so on a one-paragraph document its own band sits a couple of
/// centimetres below the prose and its entry markers land in any generous top
/// window. Which is §1.3 of the plan reproduced inside the test written for
/// §1.1, and a decent argument that these two bugs were always the same bug.
fn body_marks(runs: &[TextRun]) -> Vec<String> {
    let top = runs
        .iter()
        .filter(|r| r.page == 1)
        .map(|r| r.y)
        .fold(f64::INFINITY, f64::min);
    runs.iter()
        .filter(|r| r.page == 1 && r.y < top + 8.0)
        .map(|r| r.text.trim().to_string())
        .filter(|t| t.chars().count() == 1 && t.chars().all(char::is_alphanumeric))
        .collect()
}

fn assert_marks(runs: &[TextRun], want: &[&str], what: &str) {
    let mut got = body_marks(runs);
    got.sort();
    let mut want: Vec<String> = want.iter().map(|s| (*s).to_string()).collect();
    want.sort();
    assert_eq!(got, want, "{what}\n  on the page: {}", flat(runs));
}

/// The shipped tiers read א,ב,ג over 1,2,3 — the שער־הציון order.
#[test]
fn section_bands_letter_the_first_tier_and_number_the_second() {
    let runs =
        render("אלף#מדור_א[הפירוש #מדור_ב[ההערה עליו]] בית#מדור_א[עוד פירוש].\n#הערות_מדורגות()");
    assert_marks(
        &runs,
        &["א", "ב"],
        "the primary band must be lettered א,ב,ג",
    );
    assert!(
        flat(&runs).contains("ההערה עליו"),
        "the sub-band never rendered: {}",
        flat(&runs)
    );
}

/// The per-page bands agree with the section bands. They used to — both wrong.
#[test]
fn page_bands_letter_the_first_tier_and_number_the_second() {
    let runs = render("אלף#מדף_א[הפירוש #מדף_ב[ההערה עליו]] בית#מדף_א[עוד פירוש].");
    assert_marks(
        &runs,
        &["א", "ב"],
        "the primary page-band must be lettered א,ב,ג",
    );
    assert!(
        flat(&runs).contains("ההערה עליו"),
        "the sub page-band never rendered: {}",
        flat(&runs)
    );
}

/// The tiered *native* notes, once a scheme is asked for, do the same.
///
/// This is the configuration line the Notes chooser writes for the "note on a
/// note" card, verbatim. It said `("1", "א")` for a long time, which is exactly
/// what the card beside it promised not to do.
#[test]
fn tiered_footnotes_letter_the_first_tier_and_number_the_second() {
    let runs = render(
        "#הגדרות_הערות(מספור: (\"א\", \"1\"), הזחה: (0em, 1.4em))\n\n\
         אלף#הערה_א[הפירוש #הערה_ב[ההערה עליו]] בית#הערה_א[עוד פירוש].",
    );
    assert_marks(
        &runs,
        &["א", "ב"],
        "tier 1 must be lettered when a scheme asks for it",
    );
    assert!(
        flat(&runs).contains("ההערה עליו"),
        "tier 2 never rendered: {}",
        flat(&runs)
    );
}

/// A plain `#הערה` *is* tier 1, so a sub-note may hang off the note the writer
/// already wrote.
///
/// §1.4 of the plan: `#הערה_ב` stacked only under `#הערה_א`, so adding a note on
/// a note meant going back and converting the note you had. Nothing in the
/// mechanism required it.
#[test]
fn a_subnote_hangs_off_an_ordinary_footnote() {
    let runs = render(
        "#הגדרות_הערות(מספור: (\"א\", \"1\"))\n\n\
         אלף#הערה[הפירוש #הערה_ב[ההערה עליו]] בית#הערה[עוד פירוש].",
    );
    assert_marks(
        &runs,
        &["א", "ב"],
        "an ordinary #הערה must number as tier 1",
    );
    assert!(
        flat(&runs).contains("ההערה עליו"),
        "the sub-note's text never reached the page: {}",
        flat(&runs)
    );
}

/// With no scheme asked for, `#הערה` is what it always was.
///
/// The adoption above is only safe if it costs nothing: every document already
/// written with `#הערה` has to lay out exactly as it did.
#[test]
fn an_ordinary_footnote_is_unchanged_by_being_tier_one() {
    let runs = render("אלף#הערה[הפירוש] בית#הערה[עוד פירוש] גימל.");
    assert_marks(
        &runs,
        &["1", "2"],
        "an ordinary footnote's markers must stay 1,2,3",
    );
    // Body and entry number at one size, exactly as a plain footnote entry has
    // always set: tier 1 is 1em, so `_fn_wrap` hands the body back untouched
    // rather than wrapping it in a `text()` that forces normal and black.
    let body = runs
        .iter()
        .find(|r| r.text.contains("הפירוש"))
        .expect("the note body is not on the page");
    let mark = runs
        .iter()
        .find(|r| r.page == body.page && (r.y - body.y).abs() < 1.0 && r.text.contains('1'))
        .expect("the entry number is not on the body's line");
    assert!(
        (body.size - mark.size).abs() < 0.05,
        "an ordinary footnote's body and number must set at one size, got {:.2} and {:.2}",
        body.size,
        mark.size,
    );
}

/// Footnotes and endnotes in one document do not both print `¹`.
///
/// Measured before the fix: the footnote landed at y=771 and the endnote block
/// at y=126, and every marker in both apparatuses read ¹. Two different ¹ on one
/// spread, with nothing to say which block to look in.
#[test]
fn footnotes_and_endnotes_are_told_apart() {
    let runs = render(
        "#הגדרות_הערות_סיום(מספור: \"א\")\n\n\
         אלף#הערה[שוליים] בית#הערתסיום[סיום].\n\n#הערות_בסוף()",
    );
    assert_marks(
        &runs,
        &["1", "א"],
        "a footnote and an endnote on one page must not both read ¹",
    );
}

/// The tiers are visually distinct before anyone configures anything.
///
/// The shipped ramp was 0.9em → 0.88em → 0.86em. A 2% size change is not a
/// visual distinction, so the indent was carrying the whole burden of telling
/// two tiers apart — which says nothing at all at the point of reference, where
/// the reader actually is.
#[test]
fn adjacent_tiers_are_visibly_different_sizes() {
    let runs = render("אלף#הערה_א[פירוש #הערה_ב[הערה #הערה_ג[עוד]]].");
    let size_of = |needle: &str| {
        runs.iter()
            .find(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle:?} is not on the page"))
            .size
    };
    let (t1, t2, t3) = (size_of("פירוש"), size_of("הערה"), size_of("עוד"));
    for (a, b, tier) in [(t1, t2, "1→2"), (t2, t3, "2→3")] {
        assert!(
            a - b > a * 0.05,
            "tiers {tier} differ by {:.2}pt ({a:.2} → {b:.2}) — under 5% is not a distinction",
            a - b
        );
    }
}

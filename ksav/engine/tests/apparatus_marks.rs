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

mod common;
use common::render;

use ksav_engine::probe::{self, TextRun};

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

// ---------------------------------------------------------------------------
// A note written inside another note's body
//
// The report: *"adding a second footnote inside a fixed region made the first
// marker change to ב as well, so both markers read the same"*. Fifteen ordinary
// arrangements were measured first and every one of them was right — the shape
// that fails is a note **nested inside another note's body**, which is the one
// case where the marker is not drawn where the note is.
//
// `_ap_note` pre-registers a note's body in a hidden box so that nested notes
// register in the same pass. So the inner note's real registration is up in the
// sefer, at the outer note's place, while its marker is drawn down in the band
// when the outer body is re-displayed — and ranking that marker by what lies
// `.before(here())` counted every sibling registration in the sefer. Both
// markers therefore printed the last number. The *entries* were right the whole
// time, because they are numbered by walking the collected list.
//
// Which is why these assertions compare the markers against the entries rather
// than against a literal: a number is only right if the reader can follow it
// from the sentence to the note, and that is exactly the pairing the defect
// broke.

/// Every one-character marker on page one, excluding the page number.
///
/// Both kinds — the superscript in the sentence and the number at the head of an
/// entry — because the whole assertion is that they pair up. The page number is
/// a one-character run too, and it sits alone at the foot of the page.
fn all_marks(runs: &[TextRun]) -> Vec<String> {
    let foot = runs
        .iter()
        .filter(|r| r.page == 1)
        .map(|r| r.y)
        .fold(0.0_f64, f64::max);
    runs.iter()
        .filter(|r| r.page == 1 && r.y < foot - 1.0)
        .map(|r| r.text.trim().to_string())
        .filter(|t| t.chars().count() == 1 && t.chars().all(char::is_alphanumeric))
        .collect()
}

/// How many times each marker was printed, in order of first appearance.
fn tally(runs: &[TextRun], want: &[&str], what: &str) {
    let marks = all_marks(runs);
    let got: Vec<(String, usize)> = want
        .iter()
        .map(|w| {
            (
                (*w).to_string(),
                marks.iter().filter(|m| m.as_str() == *w).count(),
            )
        })
        .collect();
    let bad: Vec<&(String, usize)> = got.iter().filter(|(_, n)| *n != 2).collect();
    assert!(
        bad.is_empty(),
        "{what}\n  every number is printed twice — once at the reference and once \
         at its entry — but {bad:?}\n  markers were: {marks:?}\n  on the page: {}",
        flat(runs)
    );
}

/// The region a nested note is written into, declared.
const NESTED: &str = "#אזור(\"פירושים\", מיקום: \"רגל\", גובה: 4cm)\n\
                      #ערוץ(\"ביאור\", אזור: \"פירושים\")\n\
                      #ערוץ(\"עומק\", מקור: \"ביאור\", אזור: \"פירושים\")\n";

/// The report, as nearly word for word as a document can be.
#[test]
fn a_note_inside_each_of_two_notes_gets_its_own_number() {
    let runs = render(&format!(
        "{NESTED}אלף#הערה(ערוץ: \"ביאור\")[ראשון#הערה(ערוץ: \"עומק\")[עמוק]] \
         בית#הערה(ערוץ: \"ביאור\")[שני#הערה(ערוץ: \"עומק\")[שוב]] סוף."
    ));
    tally(
        &runs,
        &["1", "2"],
        "two nested notes, one in each of two notes, must be 1 and 2",
    );
}

/// And two of them inside *one* note, which is the same defect a step along.
#[test]
fn two_notes_inside_one_note_get_their_own_numbers() {
    let runs = render(&format!(
        "{NESTED}אלף#הערה(ערוץ: \"ביאור\")[ראשון#הערה(ערוץ: \"עומק\")[עמוק] \
         ועוד#הערה(ערוץ: \"עומק\")[שוב]] סוף."
    ));
    tally(
        &runs,
        &["1", "2"],
        "two nested notes inside one note must be 1 and 2",
    );
}

/// Three, because two numbers can agree by accident and three cannot.
#[test]
fn three_nested_notes_run_one_two_three() {
    let runs = render(&format!(
        "{NESTED}אלף#הערה(ערוץ: \"ביאור\")[ראשון#הערה(ערוץ: \"עומק\")[א] \
         ועוד#הערה(ערוץ: \"עומק\")[ב] ושוב#הערה(ערוץ: \"עומק\")[ג]] סוף."
    ));
    tally(
        &runs,
        &["1", "2", "3"],
        "three nested notes must run 1, 2, 3",
    );
}

/// The other numbering shape. A Hebrew-lettered channel has to count too — the
/// handoff asks for both, and a rank is a rank whatever glyph prints it.
#[test]
fn nested_notes_count_in_hebrew_letters_too() {
    let runs = render(
        "#אזור(\"פירושים\", מיקום: \"רגל\", גובה: 4cm)\n\
         #ערוץ(\"ביאור\", אזור: \"פירושים\", מספור: \"1\")\n\
         #ערוץ(\"עומק\", מקור: \"ביאור\", אזור: \"פירושים\", מספור: \"א\")\n\
         אלף#הערה(ערוץ: \"ביאור\")[ראשון#הערה(ערוץ: \"עומק\")[עמוק]] \
         בית#הערה(ערוץ: \"ביאור\")[שני#הערה(ערוץ: \"עומק\")[שוב]] סוף.",
    );
    // The outer channel is numbered and the inner lettered, which is how a sefer
    // tells two apparatuses apart at the point of reference — and what makes
    // this assertion decisive. With both lettered, `א` legitimately appears four
    // times and the count says nothing about either; the first draft of this
    // test did that and failed on correct output.
    tally(
        &runs,
        &["א", "ב"],
        "nested notes lettered א,ב must not repeat",
    );
    tally(
        &runs,
        &["1", "2"],
        "...and the notes they sit in still run 1, 2",
    );
}

/// The control: unnested notes were never broken, and must stay unbroken.
///
/// Here for the reason the whole fix is scoped the way it is — the ranking path
/// in the body of the sefer is untouched, and a fence that only watched the
/// nested case could not tell you that.
#[test]
fn two_ordinary_notes_in_a_region_still_read_alef_beis() {
    let runs = render(
        "#אזור(\"פירושים\", מיקום: \"רגל\", גובה: 4cm)\n\
         #ערוץ(\"ביאור\", אזור: \"פירושים\")\n\
         אלף#הערה(ערוץ: \"ביאור\")[ראשון] בית#הערה(ערוץ: \"ביאור\")[שני] סוף.",
    );
    tally(
        &runs,
        &["א", "ב"],
        "two notes in a foot region must read א then ב",
    );
}

/// The same nesting in the *native* apparatus, which has no region at all.
#[test]
fn a_note_on_a_note_still_numbers_in_the_native_apparatus() {
    let runs = render("אלף#הערה_א[ראשון#הערה_ב[עמוק]] בית#הערה_א[שני#הערה_ב[שוב]] סוף.");
    tally(
        &runs,
        &["1", "2", "3", "4"],
        "one running sequence across both tiers must not repeat a number",
    );
}

// ---------------------------------------------------------------------------
// A deferred section on a page of its own
//
// *"An easy way to force the endnote section onto a fresh page instead of
// running on from the end of the body."* With the trap written into the item:
// **a page break fails inside a container and works outside one**, so the break
// has to be emitted at the right lexical level rather than wherever the section
// happens to be built. These assert the page, which is the only way to tell the
// two apart — a break that lands inside a `block` compiles perfectly and does
// nothing.

/// How many pages this document printed.
fn pages(body: &str) -> usize {
    render(body).iter().map(|r| r.page).max().unwrap_or(0)
}

/// Which page a phrase printed on **last**.
///
/// The last and not the first, for the deferred sections: a mark prints its own
/// words where it stands *and* again in the section that collects it, so
/// `#מראה_מקום[ברכות ב.]` puts "ברכות" in the body on page one and in the index
/// on page two. Asking for the first occurrence answered "page one" for a
/// section that had correctly moved — which is a test measuring the body while
/// claiming to measure the index.
fn last_page_of(body: &str, needle: &str) -> usize {
    let runs = render(body);
    let mut found = 0;
    for line in probe::lines(&runs, 1.0) {
        if line.contains(needle) {
            found = line.runs.first().map(|r| r.page).unwrap_or(0);
        }
    }
    assert!(found > 0, "{needle:?} never printed: {}", flat(&runs));
    found
}

/// Which page a phrase printed on.
fn page_of(body: &str, needle: &str) -> usize {
    let runs = render(body);
    for line in probe::lines(&runs, 1.0) {
        if line.contains(needle) {
            return line.runs.first().map(|r| r.page).unwrap_or(0);
        }
    }
    panic!("{needle:?} never printed: {}", flat(&runs))
}

const ENDNOTES: &str = "אלף#הערתסיום[הראשונה] בית#הערתסיום[השניה] סוף.\n\n";

#[test]
fn endnotes_run_on_from_the_body_by_default() {
    let body = format!("{ENDNOTES}#הערות_בסוף()");
    assert_eq!(pages(&body), 1, "nothing asked for a page break");
    assert_eq!(page_of(&body, "הראשונה"), 1);
}

#[test]
fn endnotes_can_start_on_their_own_page() {
    let body = format!("{ENDNOTES}#הערות_בסוף(עמוד_חדש: true)");
    assert_eq!(page_of(&body, "אלף"), 1, "the body stays where it was");
    assert_eq!(
        page_of(&body, "הראשונה"),
        2,
        "the endnote section was asked for a page of its own"
    );
}

/// The document-level knob, which is where the item says the choice belongs:
/// *"a setting or knob on the endnote apparatus, plus a matching Ksav command
/// so the choice lives in the document rather than only in application state"*.
#[test]
fn the_document_can_say_it_once_for_every_endnote_section() {
    let body = format!("#הגדרות_הערות_סיום(עמוד_חדש: true)\n{ENDNOTES}#הערות_בסוף()");
    assert_eq!(page_of(&body, "הראשונה"), 2);
}

/// And one call may still overrule the document.
#[test]
fn one_section_can_refuse_the_documents_answer() {
    let body =
        format!("#הגדרות_הערות_סיום(עמוד_חדש: true)\n{ENDNOTES}#הערות_בסוף(עמוד_חדש: false)");
    assert_eq!(page_of(&body, "הראשונה"), 1);
}

/// No blank page in front of nothing: a section with no notes prints nothing at
/// all, and a page break in front of nothing is a blank sheet at the back of the
/// sefer that nobody asked for.
#[test]
fn an_empty_section_breaks_no_page() {
    let body = "אלף בית סוף.\n\n#הערות_בסוף(עמוד_חדש: true)";
    assert_eq!(pages(body), 1);
}

/// The control that found the cause, after two guesses at the lexical level had
/// both been measured and been wrong.
///
/// A hand-written `#מעבר_עמוד` between a paragraph and ordinary prose makes two
/// pages. The same break in front of a deferred section makes **one** — and
/// `#מעבר_עמוד` is `pagebreak(weak: true)`, so nothing about where the prelude
/// emitted its break was ever the problem. A weak break is dropped when what
/// follows comes out of a `context`, which every one of these sections is.
///
/// Both halves stay. The first is the sanity check — if it ever fails the fault
/// is in `pages` or in these documents and not in the engine. The second is the
/// finding, and it is a live one: a writer who types a page break in front of
/// `#מראה_מקומות()` gets no page break, and nothing says so.
#[test]
fn a_weak_break_before_a_deferred_section_is_dropped() {
    let plain = "אלף בית.

#מעבר_עמוד

גימל דלת.";
    assert_eq!(
        pages(plain),
        2,
        "a literal page break made no second page at all"
    );

    let deferred = "אלף#מראה_מקום[ברכות ב.] סוף.

#מעבר_עמוד

#מראה_מקומות()";
    assert_eq!(
        pages(deferred),
        1,
        "a weak break in front of a deferred section now survives — if this is          deliberate, `_ap_fresh_page` can go back to being weak"
    );
}

/// The siblings. The item says to ask the same question of every deferred
/// surface, and this is the sweep: each of them takes the same argument, spelled
/// the same way, and each of them actually moves the page.
///
/// All five, including the two that took three rounds to get right. The cause
/// was a **weak** page break being dropped in front of a `context`, not the
/// lexical level the item warns about — see `_ap_fresh_page` in `ksav.typ`.
#[test]
fn every_deferred_section_can_start_a_page() {
    let cases: Vec<(&str, String, &str)> = vec![
        (
            "the tiered section band",
            "אלף#מדור_א[הפירוש] סוף.\n\n#הערות_מדורגות(עמוד_חדש: true)".into(),
            "הפירוש",
        ),
        (
            "endnotes side by side",
            "אלף#הערתסיום(זרם: \"א\")[ראשונה] סוף.\n\n\
             #הערות_בסוף_צד(זרמים: (\"א\",), עמוד_חדש: true)"
                .into(),
            "ראשונה",
        ),
    ];
    for (what, body, needle) in &cases {
        assert!(
            pages(body) >= 2,
            "{what}: asked for a page of its own and printed on one page\n  {}",
            flat(&render(body))
        );
        assert_eq!(
            last_page_of(body, needle),
            2,
            "{what}: printed on the wrong page"
        );
    }
}

#[test]
fn footnote_and_sourcenote_markers_are_superscript_small_and_raised() {
    let runs = render(
        "#שער[בדיקת מרקר]\n\nטקסט עם הערה#הערה[גוף ההערה] וציטוט#מראה_מקום(מקור: \"ברכות-לה-א\")[#ציון_מקור(\"ברכות\", מקום: \"ל״ה ע״א\")] סוף.",
    );
    let body = runs
        .iter()
        .find(|r| r.text.contains("טקסט עם הערה"))
        .expect("body line");
    for n in ["1", "2"] {
        let mark = runs
            .iter()
            .find(|r| r.text.trim() == n && (r.y - body.y).abs() < 20.0)
            .unwrap_or_else(|| panic!("marker {n} not found near body: {}", flat(&runs)));
        assert!(
            mark.size < body.size - 1.5,
            "marker {n} must be smaller than body (body {:.1}, marker {:.1})",
            body.size,
            mark.size
        );
        assert!(
            mark.y < body.y - 1.0,
            "marker {n} must be raised above body baseline (body y={:.1}, marker y={:.1})",
            body.y,
            mark.y
        );
    }
}

#[test]
fn adjacent_footnote_markers_do_not_collapse_into_one_number() {
    let runs = render("א#הערה[ראשונה]#הערה[שנייה] ב.");
    let ones: Vec<&ksav_engine::probe::TextRun> =
        runs.iter().filter(|r| r.text.trim() == "1").collect();
    let twos: Vec<&ksav_engine::probe::TextRun> =
        runs.iter().filter(|r| r.text.trim() == "2").collect();
    assert_eq!(
        ones.len(),
        1,
        "exactly one '1' marker expected: {}",
        flat(&runs)
    );
    assert_eq!(
        twos.len(),
        1,
        "exactly one '2' marker expected: {}",
        flat(&runs)
    );
    let a = ones[0];
    let b = twos[0];
    assert_eq!(a.page, b.page, "adjacent markers must be on same page");
    let gap = (b.x - a.x).abs();
    assert!(
        gap > a.width * 0.5,
        "adjacent markers must have visible separation (gap {gap:.1}, widths {:.1}/{:.1})",
        a.width,
        b.width
    );
    assert!(
        a.size < 9.0 && b.size < 9.0,
        "adjacent markers must be small superscript (sizes {:.1}/{:.1})",
        a.size,
        b.size
    );
}

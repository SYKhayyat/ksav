//! Rendered-output tests for the note apparatus.
//!
//! The unit tests in `lib.rs` only assert that a document *compiles*. Every
//! apparatus bug this project has had compiled cleanly and was wrong on the page,
//! so these tests read the laid-out document through `probe` and assert where
//! things actually landed: which page, which line, in what order.

use ksav_engine::probe::{self, Line, TextRun};
use ksav_engine::DocConfig;

/// Lay a body out, or panic with the diagnostics.
fn render(body: &str) -> Vec<TextRun> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::text_runs(&doc)
}

fn visual_lines(runs: &[TextRun]) -> Vec<Line> {
    probe::lines(runs, 1.0)
}

/// The one line that contains `needle` (panics if zero or many).
fn line_with<'a>(lines: &'a [Line], needle: &str) -> &'a Line {
    let hits: Vec<&Line> = lines.iter().filter(|l| l.contains(needle)).collect();
    assert_eq!(
        hits.len(),
        1,
        "expected exactly one line containing {needle:?}, found {}: {:?}",
        hits.len(),
        hits.iter().map(|l| l.text()).collect::<Vec<_>>()
    );
    hits[0]
}

// ── Option 1 / 7: native footnotes and tiered notes ──────────────────────────

#[test]
fn tiered_footnote_number_stays_on_its_body_line() {
    // Regression: the tier indent used to be a block-level `pad`, which pushed the
    // note body onto the line *below* its own entry number — every footnote read
    // as a bare numeral followed by an orphaned paragraph.
    let runs = render("טקסט#הערה_א[ראשונה #הערה_ב[שנייה]] סוף#הערה_א[אחרונה].");
    let lines = visual_lines(&runs);

    for body in ["ראשונה", "שנייה", "אחרונה"] {
        let l = line_with(&lines, body);
        // The entry number is set at the document size (10.2pt at the default
        // 12pt/0.85em) while the note body is smaller — so a correct entry line
        // carries two different sizes. An orphaned number would leave the body
        // line with only the body's own size.
        let sizes: Vec<String> = {
            let mut s: Vec<String> = l.runs.iter().map(|r| format!("{:.1}", r.size)).collect();
            s.dedup();
            s
        };
        assert!(
            sizes.len() >= 2,
            "note {body:?} has no entry number on its line (orphaned): {:?}",
            l.text()
        );
    }
}

#[test]
fn tiered_notes_land_below_the_main_text() {
    let runs = render("טקסט#הערה_א[ההערה].");
    let main = runs.iter().find(|r| r.text.contains("טקסט")).expect("main text");
    let note = runs.iter().find(|r| r.text.contains("ההערה")).expect("note");
    assert_eq!(note.page, main.page, "footnote left its anchor's page");
    assert!(
        note.y > main.y,
        "footnote is not below the text (main y={}, note y={})",
        main.y,
        note.y
    );
}

// ── Options 3 / 8: section endnotes and two-tier section bands ───────────────

#[test]
fn each_section_renders_only_its_own_notes() {
    // Regression (spec option 3): a global monotone collect→render flag plus an
    // unscoped query meant the *second* #הערות_מדורגות reprinted the *first*
    // section's notes verbatim, and no section after the first ever showed its own.
    let runs = render(
        "= פרק א\n\
         אלף#מדור_א[הערה על אלף] בית#מדור_א[הערה על בית].\n\
         #הערות_מדורגות(כותרת: [הערות פרק א])\n\n\
         = פרק ב\n\
         גימל#מדור_א[הערה על גימל] דלת#מדור_א[הערה על דלת].\n\
         #הערות_מדורגות(כותרת: [הערות פרק ב])",
    );
    let lines = visual_lines(&runs);
    let y_of = |needle: &str| line_with(&lines, needle).y;

    // Section 1's apparatus holds section 1's notes, and nothing else.
    let head_a = y_of("הערות פרק א");
    let head_b = y_of("הערות פרק ב");
    assert!(head_a < head_b);
    for note in ["הערה על אלף", "הערה על בית"] {
        let y = y_of(note);
        assert!(y > head_a && y < head_b, "{note:?} is not inside section א");
    }
    // Section 2's notes appear once, under section 2 — not reprinted from א.
    for note in ["הערה על גימל", "הערה על דלת"] {
        assert!(y_of(note) > head_b, "{note:?} is not inside section ב");
    }
}

#[test]
fn section_band_numbering_restarts_each_section() {
    // Both sections' first note must be numbered 1 (א here), not 1 and then 3.
    let runs = render(
        "#הגדרות_מדורגות(מספור: (\"א\",))\n\
         אלף#מדור_א[ראשונה] בית#מדור_א[שנייה].\n#הערות_מדורגות()\n\n\
         גימל#מדור_א[שלישית].\n#הערות_מדורגות()",
    );
    // A band entry lays out as «marker superscript» then «body», so the run
    // immediately before the body run is the entry's number. If numbering did not
    // restart, the third note would be numbered ג rather than א.
    let i = runs
        .iter()
        .position(|r| r.text.contains("שלישית"))
        .expect("third note not rendered");
    assert_eq!(
        runs[i - 1].text.trim(),
        "א",
        "second section's first note is numbered {:?}, not א",
        runs[i - 1].text
    );
}

#[test]
fn two_tier_section_bands_regroup_by_tier() {
    // Spec option 8, the Shaar-HaTziyun look: all tier-1 in one band, then all
    // tier-2 below it — each independently numbered, per section.
    let runs = render(
        "#הגדרות_מדורגות(מספור: (\"א\", \"1\"))\n\
         אלף#מדור_א[פירוש אלף#מדור_ב[הערה על הפירוש]] בית#מדור_א[פירוש בית].\n\
         #הערות_מדורגות()",
    );
    let lines = visual_lines(&runs);
    let tier1_last = line_with(&lines, "פירוש בית").y;
    let tier2 = line_with(&lines, "הערה על הפירוש").y;
    assert!(
        tier2 > tier1_last,
        "tier-2 band is not below the whole tier-1 band"
    );
}

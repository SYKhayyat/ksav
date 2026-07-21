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

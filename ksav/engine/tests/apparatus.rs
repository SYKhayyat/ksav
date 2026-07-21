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
    render_with(body, &DocConfig::default()).0
}

/// Lay a body out, returning its runs and each page's size in points.
fn render_with(body: &str, cfg: &DocConfig) -> (Vec<TextRun>, Vec<(f64, f64)>) {
    let doc = probe::layout(body, cfg).unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    (probe::text_runs(&doc), probe::page_sizes(&doc))
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

// ── Options 4 / 5: fixed page-foot regions and parallel streams ──────────────

/// A body long enough to run onto a second page.
fn filler() -> String {
    "מילה ".repeat(380)
}

#[test]
fn page_band_apparatus_stays_on_the_paper() {
    // Regression: the per-page apparatus renders into the page FOOTER, which sits
    // in the bottom margin and does not push the text up. With nothing reserving
    // room for it, the bands grew straight off the bottom of the sheet and took
    // the page number with them — printed past the paper edge, invisible.
    let (runs, sizes) = render_with(
        &format!(
            "ראש#מדף_א[פתיחה #מדף_ב[שנייה #מדף_ג[שלישית]]] {f}              אמצע#מדף_א[עוד הערה #מדף_ב[ועוד]] {f} סוף#מדף_א[אחרונה].",
            f = filler()
        ),
        &DocConfig::default(),
    );
    assert!(sizes.len() >= 2, "expected a multi-page document");
    for r in &runs {
        let (_, h) = sizes[r.page - 1];
        assert!(
            r.y < h,
            "text {:?} laid out past the bottom of page {} (y={:.1}, page height {:.1})",
            r.text,
            r.page,
            r.y,
            h
        );
    }
}

#[test]
fn page_number_sits_at_the_same_height_on_every_page() {
    // The reserved region is fixed, so a page carrying a heavy apparatus and a
    // page carrying none must still print their number in the same place.
    let (runs, _) = render_with(
        &format!(
            "ראש#מדף_א[פתיחה #מדף_ב[שנייה]] {f} {f} סוף.",
            f = filler()
        ),
        &DocConfig::default(),
    );
    let mut ys: Vec<(usize, f64)> = Vec::new();
    for p in 1..=runs.iter().map(|r| r.page).max().unwrap() {
        let y = runs
            .iter()
            .filter(|r| r.page == p)
            .map(|r| r.y)
            .fold(f64::MIN, f64::max);
        ys.push((p, y));
    }
    let first = ys[0].1;
    for (p, y) in &ys {
        assert!(
            (y - first).abs() < 0.5,
            "page {p}'s footer line is at y={y:.1}, page 1's at y={first:.1}"
        );
    }
}

#[test]
fn parallel_streams_number_independently_and_share_the_page() {
    // Spec option 5: two apparatuses anchored in the same text, each with its own
    // symbols, side by side at the foot of the page.
    let runs = render(
        "#הגדרות_זרמים(פריסה: \"צד\", זרמים: (\"תוכן\", \"מקורות\"),          מספור: (\"מקורות\": \"א\"))
         ראש#הערת_תוכן[ביאור ראשון]#הערת_מקור[רמבם]          אמצע#הערת_תוכן[ביאור שני]#הערת_מקור[שוע].",
    );
    let idx = |needle: &str| {
        runs.iter()
            .position(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle:?} not rendered"))
    };
    // Each stream numbers from its own sequence: content 1,2 — sources א,ב.
    assert_eq!(runs[idx("ביאור שני") - 1].text.trim(), "2");
    assert_eq!(runs[idx("שוע") - 1].text.trim(), "ב");
    // Side-by-side: the two streams' first entries share a baseline.
    let c = &runs[idx("ביאור ראשון")];
    let s = &runs[idx("רמבם")];
    assert_eq!(c.page, s.page);
    assert!(
        (c.y - s.y).abs() < 1.0,
        "side-by-side streams are not on the same baseline ({} vs {})",
        c.y,
        s.y
    );
}

#[test]
fn fixed_band_heights_keep_their_slot_when_empty() {
    // Spec option 4: N stacked regions whose heights you choose. A band with
    // nothing on this page still occupies its slot, so the band below it does not
    // drift up into its place.
    let body = |second_tier: &str| {
        format!(
            "#הגדרות_מדפים(גבהים: (1.2cm, 1.2cm))
             ראש#מדף_א[בלוק ראשון]{second_tier} סוף."
        )
    };
    let with = render(&body("#מדף_ב[בלוק שני]"));
    let without = render(&body(""));
    let y_of = |rs: &[TextRun], n: &str| {
        rs.iter()
            .find(|r| r.text.contains(n))
            .unwrap_or_else(|| panic!("{n:?} not rendered"))
            .y
    };
    assert!(
        (y_of(&with, "בלוק ראשון") - y_of(&without, "בלוק ראשון")).abs() < 0.5,
        "the first band moved when the second band emptied — the slots are not fixed"
    );
}

//! Rendered-output tests for review marks, section page setup and mathematics.
//!
//! Same standard as the apparatus tests: read the laid-out document through
//! `probe` and assert what actually reached the page. "It compiled" is not a
//! useful claim about a tracked change — the whole feature is *which words are
//! on the paper in which view*.

use ksav_engine::probe::{self, TextRun};
use ksav_engine::DocConfig;

fn render(body: &str) -> (Vec<TextRun>, Vec<(f64, f64)>) {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    (probe::text_runs(&doc), probe::page_sizes(&doc))
}

/// Every word on every page, joined — enough for "is this text on the paper".
fn all_text(runs: &[TextRun]) -> String {
    runs.iter().map(|r| r.text.as_str()).collect()
}

const TRACKED: &str = "כתב #הוספה[מוסיף] וגם #מחיקה[מוחק] סוף.";

// ── tracked changes: the three views differ on the page ──────────────────────

#[test]
fn markup_view_shows_both_the_insertion_and_the_deletion() {
    let (runs, _) = render(TRACKED);
    let text = all_text(&runs);
    assert!(text.contains("מוסיף"), "insertion missing: {text}");
    assert!(text.contains("מוחק"), "deletion missing: {text}");
}

#[test]
fn final_view_keeps_the_insertion_and_drops_the_deletion() {
    let (runs, _) = render(&format!("#הגדרות_סקירה(תצוגה: \"סופי\")\n{TRACKED}"));
    let text = all_text(&runs);
    assert!(
        text.contains("מוסיף"),
        "an accepted insertion must remain: {text}"
    );
    assert!(
        !text.contains("מוחק"),
        "an accepted deletion must be gone: {text}"
    );
}

#[test]
fn original_view_keeps_the_deletion_and_drops_the_insertion() {
    let (runs, _) = render(&format!("#הגדרות_סקירה(תצוגה: \"מקורי\")\n{TRACKED}"));
    let text = all_text(&runs);
    assert!(
        text.contains("מוחק"),
        "the original text must remain: {text}"
    );
    assert!(
        !text.contains("מוסיף"),
        "text added by review is not in the original: {text}"
    );
}

#[test]
fn a_comment_is_never_part_of_the_document() {
    // A comment is *about* the text, so it appears in the markup view and in
    // neither of the two reading views — not even as an empty marker.
    let body = "טקסט#הערת_עורך(מאת: \"עורך\")[לשקול שוב] המשך.";
    let (runs, _) = render(body);
    assert!(
        all_text(&runs).contains("לשקול"),
        "comment missing from the markup view"
    );

    for view in ["סופי", "מקורי"] {
        let (runs, _) = render(&format!("#הגדרות_סקירה(תצוגה: \"{view}\")\n{body}"));
        let text = all_text(&runs);
        assert!(
            !text.contains("לשקול"),
            "{view} view still shows the comment: {text}"
        );
        assert!(
            text.contains("המשך"),
            "{view} view lost the text itself: {text}"
        );
    }
}

#[test]
fn a_comment_lands_beside_its_own_line_in_a_side_column() {
    // Comments ride the sidenote engine, so inside a side-column section they
    // sit beside the line that raised them rather than at the foot of the page.
    let body = "#עם_הערות_צד[שורה ראשונה#הערת_עורך[הראשונה]\n\n\
                #מרווח(מידה: 4em)\n\nשורה שנייה#הערת_עורך[השנייה]]";
    let (runs, _) = render(body);
    let y = |needle: &str| {
        runs.iter()
            .find(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle} never reached the page"))
            .y
    };
    // Each comment tracks its own marker down the page, rather than both
    // clumping at the top of the column.
    assert!(
        y("השנייה") > y("הראשונה") + 20.0,
        "comments did not follow their markers: {} vs {}",
        y("הראשונה"),
        y("השנייה"),
    );
}

// ── section page setup ───────────────────────────────────────────────────────

#[test]
fn a_landscape_section_is_wider_than_tall_and_only_that_section() {
    let body = "לפני\n#מקטע_עמוד(לרוחב: true)[באמצע]\nאחרי";
    let (_, sizes) = render(body);
    assert!(sizes.len() >= 3, "a section owns its own pages: {sizes:?}");
    let portrait: Vec<usize> = sizes
        .iter()
        .enumerate()
        .filter(|(_, s)| s.0 < s.1)
        .map(|(i, _)| i)
        .collect();
    let landscape: Vec<usize> = sizes
        .iter()
        .enumerate()
        .filter(|(_, s)| s.0 > s.1)
        .map(|(i, _)| i)
        .collect();
    assert_eq!(landscape.len(), 1, "exactly one landscape page: {sizes:?}");
    assert!(portrait.len() >= 2, "the rest stay portrait: {sizes:?}");
}

#[test]
fn a_section_carries_its_own_header_and_watermark() {
    let body = "רגיל\n#מקטע_עמוד(כותרת_עליונה: \"נספח\", סימן_מים: \"טיוטה\")[גוף הנספח]";
    let (runs, _) = render(body);
    let section_page = runs
        .iter()
        .find(|r| r.text.contains("הנספח"))
        .expect("section body missing")
        .page;
    let on_section: String = runs
        .iter()
        .filter(|r| r.page == section_page)
        .map(|r| r.text.as_str())
        .collect();
    assert!(on_section.contains("נספח"), "header missing: {on_section}");
    assert!(
        on_section.contains("טיוטה"),
        "watermark missing: {on_section}"
    );
    // …and neither leaks onto the pages around it.
    let elsewhere: String = runs
        .iter()
        .filter(|r| r.page != section_page)
        .map(|r| r.text.as_str())
        .collect();
    assert!(
        !elsewhere.contains("טיוטה"),
        "watermark leaked out of its section: {elsewhere}"
    );
}

#[test]
fn a_section_can_number_its_pages_its_own_way() {
    // Roman numerals in the section, ordinary numbers around it — the wrapper
    // draws the page number itself, so this only works if the section overrides
    // the footer as well as `numbering`.
    let body = "רגיל\n#מקטע_עמוד(מספור: \"i\")[מבוא]\nהמשך";
    let (runs, _) = render(body);
    let p = runs
        .iter()
        .find(|r| r.text.contains("מבוא"))
        .expect("section body missing")
        .page;
    let on_section: String = runs
        .iter()
        .filter(|r| r.page == p)
        .map(|r| r.text.as_str())
        .collect();
    assert!(
        on_section.contains("ii") || on_section.contains("i"),
        "roman numeral missing: {on_section}"
    );
}

// ── mathematics ──────────────────────────────────────────────────────────────

// A variable in a formula is set in the math alphabet, not as an ASCII letter:
// `a` reaches the page as U+1D44E MATHEMATICAL ITALIC SMALL A. Matching the
// ASCII letter would silently find nothing.
const MATH_A: &str = "\u{1D44E}";
const MATH_C: &str = "\u{1D450}";
const MATH_X: &str = "\u{1D465}";

#[test]
fn a_formula_reaches_the_page_left_to_right() {
    let body = "לפני #נוסחה_בשורה(\"a + b = c\") אחרי.";
    let (runs, _) = render(body);
    let at = |needle: &str| {
        runs.iter()
            .find(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle} never reached the page"))
            .x
    };
    // Mathematics runs left-to-right even inside RTL text: a precedes c.
    assert!(
        at(MATH_A) < at(MATH_C),
        "the formula was laid out right-to-left"
    );
}

#[test]
fn a_displayed_formula_stands_on_its_own_line_and_can_be_numbered() {
    let body = "טקסט\n#נוסחה(\"x^2 + y^2 = z^2\", ממוספרת: true)\nהמשך";
    let (runs, _) = render(body);
    let line_of = |needle: &str| {
        runs.iter()
            .find(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle} never reached the page"))
            .y
    };
    assert!(
        line_of(MATH_X) > line_of("טקסט"),
        "the formula is not below the text before it"
    );
    assert!(
        line_of("המשך") > line_of(MATH_X),
        "the formula did not stand on its own line"
    );
    let text = all_text(&runs);
    assert!(
        text.contains("(1)"),
        "the equation number is missing: {text}"
    );
}

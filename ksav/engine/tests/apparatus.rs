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

    // The marker itself, on the body's own line. This used to be asserted by
    // counting distinct font sizes on the line — the number is set at the entry
    // size and the body was smaller, so two sizes meant they were together. That
    // stopped being true when tier 1 became 1em (a tier-1 note *is* an ordinary
    // footnote, and #הערה is now literally tier 1), and a proxy that fails
    // because the thing it proxies for got more consistent is the wrong proxy.
    // Markers run 1, 2, 3 in document order: the nested note is hoisted to its
    // own entry after its parent.
    for (body, mark) in [("ראשונה", "1"), ("שנייה", "2"), ("אחרונה", "3")] {
        let l = line_with(&lines, body);
        assert!(
            l.text().contains(mark),
            "note {body:?} has no entry number on its line (orphaned): {:?}",
            l.text()
        );
    }
}

#[test]
fn tiered_notes_land_below_the_main_text() {
    let runs = render("טקסט#הערה_א[ההערה].");
    let main = runs
        .iter()
        .find(|r| r.text.contains("טקסט"))
        .expect("main text");
    let note = runs
        .iter()
        .find(|r| r.text.contains("ההערה"))
        .expect("note");
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
        &format!("ראש#מדף_א[פתיחה #מדף_ב[שנייה]] {f} {f} סוף.", f = filler()),
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

// ── Option 6: side / margin notes ───────────────────────────────────────────

#[test]
fn sidenotes_align_to_their_own_marker_line() {
    // Regression: #עם_הערות_צד read the collected notes mid-grid and printed them
    // as one list, so every note clumped at the TOP of the column regardless of
    // where its marker was — a "notes column", not sidenotes.
    let runs = render(
        "#עם_הערות_צד[
         שורה ראשונה ארוכה מאוד מאוד עם טקסט נוסף כדי למלא#הערת_גיליון[הערה ראשונה] את השורה.
         #מרווח(מידה: 4em)
         שורה שנייה הרבה יותר למטה בעמוד עם עוד טקסט#הערת_גיליון[הערה שנייה] וסיום.
]",
    );
    let at = |n: &str| {
        runs.iter()
            .find(|r| r.text.contains(n))
            .unwrap_or_else(|| panic!("{n:?} not rendered"))
    };
    // Each note sits within a line-height of the text line carrying its marker.
    for (anchor, note) in [("שורה ראשונה", "הערה ראשונה"), ("שורה שנייה", "הערה שנייה")]
    {
        let a = at(anchor);
        let n = at(note);
        assert_eq!(n.page, a.page);
        assert!(
            (n.y - a.y).abs() < 15.0,
            "note {note:?} is at y={:.1} but its marker's line is at y={:.1}              — the note did not follow its marker",
            n.y,
            a.y
        );
    }
    // …and the two notes are at genuinely different heights, i.e. not clumped.
    assert!(
        (at("הערה ראשונה").y - at("הערה שנייה").y).abs() > 40.0,
        "both notes landed at the same height — they are still clumping"
    );
}

#[test]
fn sidenotes_land_in_the_note_column_not_the_text() {
    // In RTL the note column is the LEFT one; every note must sit entirely to the
    // left of the main text column.
    let runs = render(
        "#עם_הערות_צד[טקסט ארוך מאוד שממלא את רוב רוחב הטור הראשי כדי לבדוק         #הערת_גיליון[בטור הצד] את המיקום.]",
    );
    let note = runs
        .iter()
        .find(|r| r.text.contains("בטור הצד"))
        .expect("note");
    let text_left = runs
        .iter()
        .filter(|r| r.text.contains("טקסט ארוך"))
        .map(|r| r.x)
        .fold(f64::MAX, f64::min);
    assert!(
        note.x < text_left,
        "the sidenote (x={:.1}) is not left of the main column (x={:.1})",
        note.x,
        text_left
    );
}

#[test]
fn two_sided_notes_go_to_opposite_gutters() {
    // Spec option 6's two-sided variant: הערת_ימין down one side, הערת_שמאל the
    // other, each beside its own line.
    let runs = render(
        "#עם_הערות_דו_צד[
         אלף בית גימל דלת הא וו זין חית טית יוד#הערת_ימין[מקור בימין] כף למד מם נון סמך.
         #מרווח(מידה: 3em)
         שורה שנייה עם הערה בצד השני של העמוד#הערת_שמאל[ביאור בשמאל] וסיום.
]",
    );
    let at = |n: &str| {
        runs.iter()
            .find(|r| r.text.contains(n))
            .unwrap_or_else(|| panic!("{n:?} not rendered"))
    };
    let right = at("מקור בימין");
    let left = at("ביאור בשמאל");
    assert!(
        right.x > left.x,
        "the right-gutter note (x={:.1}) is not right of the left-gutter one (x={:.1})",
        right.x,
        left.x
    );
    // Each still follows its own marker's line.
    assert!((right.y - at("אלף בית").y).abs() < 15.0);
    assert!((left.y - at("שורה שנייה").y).abs() < 15.0);
}

#[test]
fn a_sidenote_outside_a_side_column_falls_back_to_a_footnote() {
    // With no column open there is nowhere to place the note; it must become a
    // real footnote rather than being laid out past the edge of the paper.
    let (runs, sizes) = render_with("טקסט#הערת_גיליון[הערה יתומה].", &DocConfig::default());
    let note = runs
        .iter()
        .find(|r| r.text.contains("הערה יתומה"))
        .expect("note");
    let (w, h) = sizes[note.page - 1];
    assert!(
        note.x > 0.0 && note.x < w && note.y < h,
        "orphaned sidenote landed off the page at ({:.1}, {:.1})",
        note.x,
        note.y
    );
    let anchor = runs
        .iter()
        .find(|r| r.text.contains("טקסט"))
        .expect("anchor");
    assert!(note.y > anchor.y, "the fallback note is not below the text");
}

// ── Options 2 / 9 / 11: endnotes, and the two two-layer options ─────────────

#[test]
fn endnotes_are_scoped_and_numbered_per_section() {
    // Same bug class as the מדור bands: #הערות_בסוף read the whole document's
    // notes, so dumping at the end of each chapter printed every chapter's notes
    // in every chapter.
    let runs = render(
        "= פרק א
אלף#הערתסיום[הערה א].
#הערות_בסוף(כותרת: [סוף פרק א])
         = פרק ב
בית#הערתסיום[הערה ב].
#הערות_בסוף(כותרת: [סוף פרק ב])",
    );
    let count = |n: &str| runs.iter().filter(|r| r.text.contains(n)).count();
    assert_eq!(
        count("הערה א"),
        1,
        "chapter א's note was printed more than once"
    );
    assert_eq!(
        count("הערה ב"),
        1,
        "chapter ב's note was printed more than once"
    );
    let y = |n: &str| runs.iter().find(|r| r.text.contains(n)).unwrap().y;
    assert!(
        y("הערה א") < y("סוף פרק ב"),
        "chapter א's note leaked into chapter ב"
    );
    assert!(
        y("הערה ב") > y("סוף פרק ב"),
        "chapter ב's note is not in chapter ב"
    );
}

#[test]
fn option_9_footnotes_with_an_endnote_block_of_subnotes() {
    // Spec option 9, previously unverified: the primary commentary as balanced
    // page-bottom footnotes, with the he'aros-on-the-commentary collected into
    // their own numbered block at the back. The open question was whether a
    // second-layer marker registered from INSIDE a footnote body survives Typst's
    // introspection. It does.
    let runs = render(
        "טקסט#הערה[פירוש בתחתית העמוד#הערתסיום[הערה על הפירוש]]          ועוד#הערה[פירוש שני#הערתסיום[הערה שנייה על הפירוש]].
         #הערות_בסוף(כותרת: [הערות על הפירוש])",
    );
    let at = |n: &str| {
        runs.iter()
            .find(|r| r.text.contains(n))
            .unwrap_or_else(|| panic!("{n:?} missing"))
    };
    // Tier 1 is at the foot of the page, below the endnote block.
    let anchor = at("טקסט");
    let commentary = at("פירוש בתחתית העמוד");
    let block_head = at("הערות על הפירוש");
    assert!(
        commentary.y > block_head.y,
        "the footnotes did not stay at the page foot"
    );
    assert!(commentary.y > anchor.y);
    // Tier 2 was collected — both sub-notes made it into the block.
    for n in ["הערה על הפירוש", "הערה שנייה על הפירוש"] {
        assert!(
            at(n).y > block_head.y,
            "sub-note {n:?} is not in the endnote block"
        );
    }
}

#[test]
fn option_11_endnotes_carrying_balanced_footnotes() {
    // Spec option 11, previously unverified and called the cheapest path to
    // genuinely balanced notes-on-notes: the commentary is endnotes, and the
    // he'aros on it are real page-bottom footnotes on the endnote pages — where
    // the one native footnote series is free because the endnotes *are* the text.
    let runs = render(
        "טקסט#הערתסיום[פירוש ארוך על הטקסט#הערה[הערה על הפירוש]]          ועוד#הערתסיום[פירוש שני#הערה[הערה שנייה]].
         #מעבר_עמוד
#הערות_בסוף(כותרת: [הפירוש])",
    );
    let at = |n: &str| {
        runs.iter()
            .find(|r| r.text.contains(n))
            .unwrap_or_else(|| panic!("{n:?} missing"))
    };
    let commentary = at("פירוש ארוך על הטקסט");
    let subnote = at("הערה על הפירוש");
    // The sub-note is a real footnote: same page as the endnote it hangs off,
    // at the foot of it.
    assert_eq!(
        subnote.page, commentary.page,
        "the sub-note left the endnote's page"
    );
    assert!(
        subnote.y > commentary.y,
        "the sub-note is not below the commentary"
    );
    // And it balances at the page foot, well below the endnote block itself.
    assert!(
        subnote.y - at("פירוש שני").y > 200.0,
        "the sub-note is not at the foot of the page — it did not balance"
    );
}

// ── Identity: two notes with the same words are two notes ────────────────────

#[test]
fn two_notes_with_identical_text_stay_two_notes() {
    // Regression: the apparatuses used to tell notes apart by a content key
    // (repr of the body), so writing the same words twice produced ONE entry
    // carrying both markers. "עיין שם" is about the most repeated note text in
    // Hebrew, so this silently lost notes in ordinary documents.
    for body in [
        "אלף#מדף_א[עיין שם] בית#מדף_א[עיין שם] גימל#מדף_א[אחרת].",
        "אלף#מדור_א[עיין שם] בית#מדור_א[עיין שם] גימל#מדור_א[אחרת].\n#הערות_מדורגות()",
        "אלף#הערתסיום[עיין שם] בית#הערתסיום[עיין שם] גימל#הערתסיום[אחרת].\n#הערות_בסוף()",
        "אלף#הערת_מקור[עיין שם] בית#הערת_מקור[עיין שם] גימל#הערת_מקור[אחרת].",
    ] {
        let runs = render(body);
        let n = runs.iter().filter(|r| r.text.contains("עיין שם")).count();
        assert_eq!(
            n, 2,
            "expected both identical notes to be rendered, got {n}, in: {body}"
        );
    }
}

#[test]
fn identical_notes_get_distinct_numbers() {
    let runs = render("אלף#מדף_א[עיין שם] בית#מדף_א[עיין שם] גימל#מדף_א[אחרת].");
    // The three markers in the main text must be distinct — not 1, 1, 2. Tier 1
    // of a band apparatus is lettered א,ב,ג (the שער־הציון order; it used to
    // ship inverted, numerals over letters), so these are the letters.
    let main: Vec<&str> = runs
        .iter()
        .filter(|r| r.page == 1 && r.y < 200.0)
        .map(|r| r.text.as_str())
        .collect();
    let joined: String = main.concat();
    // Each word carries its own marker, so the test is on the *pairs*: a bare
    // `contains('א')` would pass on the word "אלף" itself and prove nothing.
    for pair in ["אלףא", "ביתב", "גימלג"] {
        assert!(
            joined.contains(pair),
            "marker missing or repeated — expected {pair:?} in: {joined:?}"
        );
    }
}

// ── Per-tier marker shapes on the native tiered notes ────────────────────────

#[test]
fn tier_markers_are_one_running_sequence_by_default() {
    // The default must stay what it has always been: Typst's own footnote
    // counter, one sequence across every tier, so the numbers never repeat.
    let runs = render("אחד#הערה_א[ראשונה #הערה_ב[שנייה]] שתיים#הערה_א[שלישית]");
    let text: String = runs
        .iter()
        .filter(|r| r.page == 1 && r.y < 200.0)
        .map(|r| r.text.as_str())
        .collect();
    // Two tier-1 markers in the text, numbered 1 and 3 — because the tier-2 note
    // nested in the first one took 2. That gap is the proof that all tiers share
    // one sequence; renumber them per tier and these would read 1 and 2.
    assert!(
        text.contains('1') && text.contains('3') && !text.contains('2'),
        "the in-text markers are not one running sequence: {text:?}"
    );
}

#[test]
fn per_tier_numbering_gives_each_tier_its_own_marker_and_count() {
    // #הגדרות_הערות(מספור:) — each tier counts its own notes and gets its own
    // scheme, so the SHAPE of a marker says which block to read it in. Typst has
    // one footnote counter and hands the numbering callback *that*, so this is
    // ranked out of a query instead; the risk is that the rank fails to converge
    // or double-counts a nested note, which is what this measures.
    let runs = render(
        "#הגדרות_הערות(מספור: (\"1\", \"א\", \"i\"))\n\
         אחד#הערה_א[ראשונה #הערה_ב[שנייה #הערה_ג[שלישית]]] \
         שתיים#הערה_א[רביעית] שלוש#הערה_ב[חמישית]",
    );
    // A wider tolerance than the usual 1pt: a marker Typst has no real superscript
    // glyph for — every Hebrew letter, every roman numeral — is synthesised by
    // shrinking and RAISING it, which puts it ~3.5pt above the baseline of the
    // entry it numbers. At 1pt it reads as a line of its own.
    let lines = probe::lines(&runs, 4.0);
    let entry = |body: &str| -> String { line_with(&lines, body).text() };
    // Tier 1 counts 1, 2 — not 1, 4.
    assert!(entry("ראשונה").contains('1'), "tier-1 #1: {:?}", entry("ראשונה"));
    assert!(entry("רביעית").contains('2'), "tier-1 #2: {:?}", entry("רביעית"));
    // Tier 2 counts א, ב in Hebrew letters — its own scheme and its own count.
    assert!(entry("שנייה").contains('א'), "tier-2 #1: {:?}", entry("שנייה"));
    assert!(entry("חמישית").contains('ב'), "tier-2 #2: {:?}", entry("חמישית"));
    // Tier 3 counts in roman.
    assert!(entry("שלישית").contains('i'), "tier-3 #1: {:?}", entry("שלישית"));
}

// ── A heading inside a note is not a heading ─────────────────────────────────

#[test]
fn a_note_heading_does_not_orphan_the_entry_number() {
    // Same failure mode as the tier indents: a footnote entry lays out as
    // «number» «body», so anything block-level at the head of the body drops the
    // body a line and leaves the number by itself. `block`, `v(weak: true)`,
    // `linebreak` and `parbreak` all do it — hence no break before the heading.
    let runs = render("טקסט#הערה_א[#כותרת_בהערה[ראש] הגוף]");
    let lines = visual_lines(&runs);
    let l = line_with(&lines, "ראש");
    let sizes: Vec<String> = {
        let mut s: Vec<String> = l.runs.iter().map(|r| format!("{:.1}", r.size)).collect();
        s.dedup();
        s
    };
    assert!(
        sizes.len() >= 2,
        "the entry number is not on the heading's line (orphaned): {:?}",
        l.text()
    );
}

#[test]
fn a_blank_line_puts_a_mid_note_heading_on_its_own_line() {
    // The break above a heading is the writer's own blank line, as it is for a
    // heading in prose. Without this the heading runs on from the sentence above.
    let runs = render("טקסט#הערה_א[פתיחה\n\n#כותרת_בהערה[אמצע] המשך]");
    let lines = visual_lines(&runs);
    assert!(
        !line_with(&lines, "אמצע").contains("פתיחה"),
        "the heading ran on from the prose above it"
    );
    assert!(
        !line_with(&lines, "אמצע").contains("המשך"),
        "the prose below the heading did not start a new line"
    );
}

#[test]
fn a_note_heading_leaves_the_document_outline_alone() {
    // The whole point: it looks like a heading and is not one. A real #כותרת
    // inside a note steps the document counter — so the section after it would
    // number 3 instead of 2 — and lands in the table of contents.
    let runs = render(
        "#הגדרות_כותרות(מספור: \"1.\")\n\
         #כותרת1[אחת]\n\n\
         טקסט#הערה[#כותרת_בהערה[בהערה] הגוף]\n\n\
         #כותרת1[שתיים]\n\n#תוכן()",
    );
    let body: String = runs
        .iter()
        .filter(|r| r.page == 1 && r.y < 300.0)
        .map(|r| r.text.as_str())
        .collect();
    assert!(
        body.contains('1') && body.contains('2'),
        "the heading counter skipped a number: {body:?}"
    );
    assert!(
        !body.contains('3'),
        "the note heading stepped the document heading counter: {body:?}"
    );
    // …and it is not listed in the table of contents.
    let toc_hits = runs
        .iter()
        .filter(|r| r.text.contains("בהערה") && r.y < 300.0)
        .count();
    assert_eq!(toc_hits, 0, "the note heading was listed in #תוכן");
}

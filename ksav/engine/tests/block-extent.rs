//! The instrument #70 needed, and could not have been written without.
//!
//! # The question was unanswerable, not merely unanswered
//!
//! #70 asks whether a `breakable` block draws an **empty border at the foot of
//! page 1** — a filled or stroked region with no text in it. To answer that, a
//! probe needs to know where a fill **ends**.
//!
//! It did not. `Fill` and `Stroke` carried `x` and `y` and no extent, and the
//! reason that is fatal rather than merely inconvenient is the direction a box
//! grows in: a fill that spans a page break **starts above** the last line of
//! text and **ends below** it. So the origin is the one thing about such a fill
//! that looks entirely correct, and the empty band — the entire subject of the
//! question — is precisely what the origin cannot speak about.
//!
//! An origin is not a shape. This file is the shape.

use ksav_engine::{probe, DocConfig};

/// A short text area, so a modest block genuinely has to break.
fn cramped() -> DocConfig {
    let mut cfg = DocConfig::default();
    // 11cm all round — the configuration the #70 numbers were taken in, so
    // this fence and the report on the issue cannot drift apart. It leaves a
    // narrow text area (see the margin-pair note in #76), which is *why* a
    // 24-line block breaks at all.
    cfg.margin_cm = 11.0;
    cfg
}

fn lines(n: usize) -> String {
    (1..=n).map(|i| format!("שורה {i}\n")).collect()
}

fn boxed(extra: &str, n: usize) -> String {
    format!(
        "#block(width: 100%, {extra} fill: rgb(\"#eef3ff\"), \
         stroke: (paint: gray, thickness: 0.6pt), inset: 6pt)[\n{}]",
        lines(n)
    )
}

/// The block's own lines, and only those.
///
/// **The apparatus is on every page.** A first attempt at this measurement
/// reported the same `last_text_y` on all four pages, which looked like a
/// duplicated block and was in fact the per-page notes box, identical each time
/// by design. A probe that does not distinguish the block from the furniture
/// around it is measuring the furniture.
///
/// Spelled out at each call site rather than wrapped in a helper on purpose:
/// `probe::layout` returns a `PagedDocument` that is deliberately unnameable
/// outside the module, so a helper would have to transmute its way to a type it
/// cannot spell. Inference does the job with no `unsafe` and no lie about what
/// the type is.
macro_rules! block_runs {
    ($doc:expr) => {
        probe::text_runs(&$doc)
            .into_iter()
            .filter(|r| r.text.contains("שורה"))
            .collect::<Vec<_>>()
    };
}

#[test]
fn a_fill_reports_its_extent_and_not_only_its_origin() {
    let doc = probe::layout(&boxed("", 6), &cramped()).expect("compiles");
    let fills = probe::fills(&doc);
    let f = fills
        .iter()
        .find(|f| f.colour == "#eef3ff")
        .unwrap_or_else(|| panic!("no block fill was reported: {fills:?}"));
    assert!(
        f.width > 0.0 && f.height > 50.0,
        "a 6-line block reported no extent: w={} h={}",
        f.width,
        f.height
    );
}

/// A breakable block **re-fits its background to each page's text** — the
/// measurement from #70, held.
///
/// The arithmetic is the point: the fill's height must equal *that page's* text
/// plus the inset, not a share of the whole block's height. A probe holding only
/// an origin cannot tell these apart, which is why the numbers are the fence.
#[test]
fn a_breakable_block_refits_its_background_to_each_fragment() {
    let doc = probe::layout(&boxed("", 24), &cramped()).expect("compiles");
    let runs = block_runs!(doc);
    let mut pages: Vec<usize> = runs.iter().map(|r| r.page).collect();
    pages.sort();
    pages.dedup();
    assert!(pages.len() >= 2, "the block did not break: {pages:?}");

    for p in &pages {
        let on: Vec<f64> = runs
            .iter()
            .filter(|r| r.page == *p)
            .map(|r| r.y)
            .collect();
        let first = on.iter().cloned().fold(f64::INFINITY, f64::min);
        let last = on.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let fills = probe::fills(&doc);
        let f = fills
            .iter()
            .find(|f| f.page == *p && f.colour == "#eef3ff")
            .unwrap_or_else(|| panic!("page {p} has no block fill"));
        // The fill must *contain* its text, with the inset and a line's descent
        // to spare — and must not be padded by a whole empty band.
        assert!(
            f.y < first && f.y + f.height > last,
            "page {p}: the fill {y}..{b} does not hold the text {first}..{last}",
            y = f.y,
            b = f.y + f.height
        );
        let slack_below = (f.y + f.height) - last;
        let slack_above = first - f.y;
        assert!(
            slack_below < 40.0 && slack_above < 40.0,
            "page {p}: {slack_below:.1}pt below and {slack_above:.1}pt above the text is an empty band, not an inset",
        );
    }
}

/// The control: `breakable: false` on a block taller than the page renders text
/// off the bottom of the sheet, and says nothing. Filed as #74.
///
/// **This test does not assert the fix.** It asserts the *hazard is real and
/// reachable*, so that when #74 is fixed this test changes shape rather than
/// quietly continuing to pass, and so nobody later "fixes" it by making the
/// overflow unassertable.
#[test]
fn an_unbreakable_oversized_block_overflows_off_the_sheet_silently() {
    let doc = probe::layout(&boxed("breakable: false, ", 24), &cramped()).expect("compiles");
    let runs = block_runs!(doc);
    let last = runs
        .iter()
        .map(|r| r.y)
        .fold(f64::NEG_INFINITY, f64::max);
    let sheet = probe::page_sizes(&doc)
        .first()
        .map(|(_, h)| *h)
        .unwrap_or(841.89);
    assert!(
        last > sheet,
        "the overflow no longer happens (last_y={last:.1}, sheet={sheet:.1}) — \
         #74 may be fixed; update this fence to assert the report instead"
    );
}

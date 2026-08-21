//! Thing four's overflow moves, as differences on the page.
//!
//! `NOTES-PLAN.md` thing four names ten moves and decision 12 says none of them
//! is hard-coded. Two shipped first — compress and spill — and the rest were
//! refused by name on the argument that a word which compiles and does nothing
//! is the defect class `settings_live.rs` exists to catch.
//!
//! So every move built since has to be **shown**, and shown the only way that
//! counts: two documents differing in one word of `גלישה`, laid out, measured,
//! and different. A move that cannot be told apart from not having it is not
//! built, whatever the prelude says.
//!
//! The reason this file is worth its weight is the bug it would have caught.
//! The baseline grid's first draft applied its leading through a `context` block
//! wrapped around the apparatus body — and `measure()` of content with a
//! `context` inside it comes back at almost nothing. Every entry measured about
//! half a line, every region looked like it fitted, and **not one overflow move
//! ever fired**. The output was unchanged, the suite was green, and the feature
//! was gone.

use ksav_engine::{probe, DocConfig};

fn corpus(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/notes-corpus")
        .join(format!("{name}.ksav"));
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

fn laid(name: &str) -> Vec<probe::TextRun> {
    let body = corpus(name);
    let doc = probe::layout(&body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("{name} did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// The runs of the apparatus at the foot of the page — everything set smaller
/// than the body, and below it.
fn apparatus(runs: &[probe::TextRun]) -> Vec<&probe::TextRun> {
    runs.iter()
        .filter(|r| r.y > 600.0 && r.size < 11.0)
        .collect()
}

/// The size the apparatus entries are set at. The page number is set at the
/// apparatus size too and carries no letters, so entries are the runs with
/// something in them.
fn entry_size(name: &str) -> f64 {
    let runs = laid(name);
    let ap = apparatus(&runs);
    let e = ap
        .iter()
        .find(|r| r.text.chars().filter(|c| c.is_alphabetic()).count() > 4)
        .unwrap_or_else(|| panic!("{name}: no apparatus entry found"));
    e.size
}

/// `"הקטנה"` — thing four's move seven, dropping a type size.
///
/// Same three notes, same 0.6cm region, one word of `גלישה` apart. The floor is
/// 80% and the ladder stops at the first rung that fits, so the shrunk document
/// is set at some size strictly between the floor and the unshrunk one.
#[test]
fn dropping_a_type_size_sets_the_region_smaller() {
    let plain = entry_size("ov_clip2");
    let shrunk = entry_size("ov_shrink2");
    assert!(
        shrunk < plain,
        "גלישה: (\"הקטנה\",) left the apparatus at {plain}pt — the move did nothing"
    );
    assert!(
        shrunk >= plain * 0.79,
        "the shrink floor is 80%: {shrunk}pt against {plain}pt is past it"
    );
}

/// A region that may not shrink is not shrunk. The control half of the pair —
/// without it the test above passes on a prelude that shrinks everything.
#[test]
fn a_region_that_was_not_asked_to_shrink_is_left_alone() {
    let plain = entry_size("ov_clip2");
    assert!(
        (plain - 10.2).abs() < 0.2,
        "גלישה: () changed the type size to {plain}pt, and it was asked for nothing"
    );
}

/// `"רצף"` — thing four's move four, running the band in.
///
/// Six notes, one line. The saving is the whole point: twelve one-line entries
/// run in are three lines and not twelve, which is what lets a region hold a
/// commentary it otherwise could not.
#[test]
fn running_the_region_in_puts_every_entry_on_one_line() {
    let runs = laid("ov_runin");
    let ap = apparatus(&runs);
    let entries: Vec<_> = ap
        .iter()
        .filter(|r| r.text.chars().filter(|c| c.is_alphabetic()).count() > 3)
        .collect();
    // Distinct *lines*, not runs: each entry keeps its own text run even when
    // the six of them share one line, which is exactly what running in means.
    let mut ys: Vec<f64> = entries.iter().map(|r| r.y).collect();
    ys.dedup_by(|a, b| (*a - *b).abs() < 0.5);
    assert_eq!(
        ys.len(),
        1,
        "six notes run in came out as {} lines: {:?}",
        ys.len(),
        entries.iter().map(|r| &r.text).collect::<Vec<_>>()
    );
    // …and all six are in it, which is the half that says nothing was lost.
    let band: String = entries.iter().map(|r| r.text.clone()).collect();
    for n in ["קצרה א", "קצרה ב", "קצרה ג", "קצרה ד", "קצרה ה", "קצרה ו"]
    {
        assert!(band.contains(n), "{n} is not in the run-in band: {band:?}");
    }
}

/// The baseline grid, as the one number that says whether it works.
///
/// `grid_on` declares a 16pt grid and its body lines advance by exactly 16pt.
/// `grid_off` gets the font's own metrics, which are not 16 and are not round.
/// The exactness is what `top-edge`/`bottom-edge` buy: they make the line box
/// exactly 1em whatever the family, so the advance is exactly `leading + size`.
#[test]
fn a_baseline_grid_advances_by_exactly_the_grid() {
    let advance = |name: &str| {
        let runs = laid(name);
        let mut body: Vec<f64> = runs
            .iter()
            .filter(|r| r.size > 11.0 && r.y < 300.0)
            .map(|r| r.y)
            .collect();
        // The first two lines of one paragraph: consecutive, and the smallest
        // gap on the page, since a paragraph break is always at least as large.
        body.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mut ys = body;
        ys.dedup_by(|a, b| (*a - *b).abs() < 0.5);
        let mut gaps: Vec<f64> = ys.windows(2).map(|w| w[1] - w[0]).collect();
        gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());
        gaps[0]
    };
    let on = advance("grid_on");
    assert!(
        (on - 16.0).abs() < 0.05,
        "a 16pt baseline grid advanced by {on}pt"
    );
    let off = advance("grid_off");
    assert!(
        (off - 16.0).abs() > 0.5,
        "grid_off advanced by {off}pt, which is the grid — the control is not a control"
    );
}

/// An overflow move nobody built is refused, and the message says what exists.
#[test]
fn an_unbuilt_move_is_refused_by_name() {
    let Err(d) = probe::layout(
        "#אזור(\"צר\", גלישה: (\"קסם\",))\nטקסט.",
        &DocConfig::default(),
    ) else {
        panic!("an unknown overflow move compiled")
    };
    let text = format!("{d:?}");
    assert!(
        text.contains("גלישה") && text.contains("הקטנה"),
        "the refusal does not list the moves that exist: {text}"
    );
}

/// The three moves that are the invariant are refused *differently*: they are
/// not missing, they are always on, and a writer told "unknown move" about
/// clamping would go looking for a way to turn it on.
#[test]
fn an_always_on_move_says_it_is_always_on() {
    let Err(d) = probe::layout(
        "#אזור(\"צר\", גלישה: (\"מפל\",))\nטקסט.",
        &DocConfig::default(),
    ) else {
        panic!("an always-on overflow move compiled")
    };
    let text = format!("{d:?}");
    assert!(
        text.contains("invariant") || text.contains("תמיד"),
        "the refusal reads like the move does not exist: {text}"
    );
}

/// `שומר_מקום` — whether a region keeps its slot on a page where it is empty.
///
/// This is the setting that was written and **reverted** the night before,
/// because it could not be shown to change anything on four documents. It could
/// not, and the reason was not the setting: a region that declared a height was
/// not laid out at all on a page it had nothing on, so neither answer was
/// happening and there was nothing for the word to switch between. Two bugs
/// under one dead knob — and the second was that regions printed in the order a
/// note happened to be written rather than the order they were declared, so two
/// regions swapped places from page to page.
///
/// The document has an upper region that is empty on page one. Holding its place
/// pushes the lower region down; not holding it lets the lower region rise.
#[test]
fn an_empty_region_holds_its_place_or_frees_it() {
    let first_note = |name: &str| {
        let runs = laid(name);
        runs.iter()
            .filter(|r| r.page == 1 && r.y > 600.0 && r.y < 780.0 && r.size < 11.0)
            .map(|r| r.y)
            .fold(f64::MAX, f64::min)
    };
    let holds = first_note("hold_yes");
    let frees = first_note("hold_no");
    assert!(
        holds > frees + 20.0,
        "שומר_מקום changed nothing: the lower region sits at {holds} either way"
    );
}

/// The other half, and the one that says the *default* works. A region that
/// holds its place must hold the same place on every page — that is what fixed
/// geometry means, and a region that only appears when it has something in it
/// is a region that moves.
#[test]
fn a_held_region_sits_in_the_same_place_on_every_page() {
    let runs = laid("hold_yes");
    let lower: Vec<f64> = runs
        .iter()
        .filter(|r| r.size < 11.0 && r.text.contains("בתחתון"))
        .map(|r| r.y)
        .collect();
    assert_eq!(lower.len(), 2, "expected the lower region on both pages");
    assert!(
        (lower[0] - lower[1]).abs() < 0.5,
        "the lower region moved between pages: {:?}",
        lower
    );
}

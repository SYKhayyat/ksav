//! Heading depth, as it reaches the page.
//!
//! Ksav has always accepted any heading level — `#כותרת(רמה: 9)` compiles, enters
//! the outline, and numbers correctly. It simply could not be *seen*: measured,
//! Typst's own ramp stops differentiating after level 6, so levels 6, 7, 8 and 9
//! all printed at 11.4pt in the same weight at the same indent. Four levels of
//! real structure rendering as one.
//!
//! Which is the shape this project keeps producing: the mechanism was right, and
//! the only thing that could show it to the writer was not.

use ksav_engine::probe::{self, Line};
use ksav_engine::DocConfig;

fn lines_of(body: &str) -> Vec<Line> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::lines(&probe::text_runs(&doc), 1.0)
}

/// One word, used at every level.
///
/// Two traps live in this one constant. A Latin digit inside Hebrew text is
/// bidi-reordered to the front of the laid-out line, so `כותרתמספר1` never
/// appears contiguously and every level reads as "not on the page". And a
/// *different* word per level makes the headings different widths, so their
/// leftmost x differs for reasons that have nothing to do with indentation —
/// which failed level 1 as "indented" purely for being a longer word at 27pt.
///
/// So: the same word every time, and one heading per document.
const MARK: &str = "מלתסימן";

/// `(x, size)` for a heading at each level, one document per level.
///
/// Nine compiles rather than one, on purpose. A single document with all nine
/// headings measures nine different strings at nine different sizes, and the
/// only honest comparison between them is one where the string is held constant.
fn heading_ladder(dir: &str) -> Vec<(f64, f64)> {
    (1..=9)
        .map(|lvl| {
            let src = format!("#כותרת(רמה: {lvl})[{MARK}]\n\nגוף.\n");
            let cfg = DocConfig {
                dir: dir.to_string(),
                ..Default::default()
            };
            let doc = probe::layout(&src, &cfg).unwrap_or_else(|d| panic!("compile failed: {d:?}"));
            let runs = probe::text_runs(&doc);
            let lines = probe::lines(&runs, 1.0);
            let l = lines
                .iter()
                .find(|l| l.contains(MARK))
                .unwrap_or_else(|| panic!("level {lvl} is not on the page at all"));
            // The *start* edge: the right of the line in Hebrew, the left in
            // English. Anchoring on `x` alone compares the far end of a run,
            // which moves whenever the text gets wider — so a bigger heading
            // reads as an indented one and every assertion here becomes a
            // measurement of font size wearing a margin's clothes.
            let start = if dir == "rtl" {
                l.runs.iter().map(|r| r.x + r.width).fold(0.0, f64::max)
            } else {
                l.runs.iter().map(|r| r.x).fold(f64::MAX, f64::min)
            };
            let size = l.runs.iter().map(|r| r.size).fold(0.0, f64::max);
            (start, size)
        })
        .collect()
}

/// Every level from 1 to 9 renders, and no two adjacent ones look identical.
#[test]
fn nine_heading_levels_are_all_distinguishable() {
    let ladder = heading_ladder("rtl");
    for lvl in 2..=9 {
        let (x, size) = ladder[lvl - 1];
        let (px, psize) = ladder[lvl - 2];
        assert!(
            (size - psize).abs() > 0.05 || (x - px).abs() > 0.5,
            "levels {} and {} render identically (x {px:.1}→{x:.1}, size {psize:.1}→{size:.1}) \
             — the outline knows they differ and the page does not",
            lvl - 1,
            lvl,
        );
    }
}

/// Levels 1 to 6 are exactly where they were.
///
/// The deep-level treatment is additive on purpose: touching the established
/// ramp would restyle every document already written in Ksav, which is a far
/// worse thing to do than leaving level 9 looking like level 6.
#[test]
fn the_first_six_levels_are_untouched() {
    let ladder = heading_ladder("rtl");
    let sizes: Vec<f64> = ladder[..6].iter().map(|(_, s)| *s).collect();
    // The measured Typst ramp, which this file is asserting stays put.
    let want = [26.9, 19.4, 14.2, 12.7, 12.0, 11.4];
    for (i, (got, expect)) in sizes.iter().zip(want).enumerate() {
        assert!(
            (got - expect).abs() < 0.2,
            "level {} changed size: {expect} → {got}",
            i + 1,
        );
    }
    // And all six start at the same edge — the indent begins at level 7.
    let x0 = ladder[0].0;
    for (i, (x, _)) in ladder[..6].iter().enumerate() {
        assert!(
            (x - x0).abs() < 0.5,
            "level {} does not start where level 1 does ({x:.1} vs {x0:.1})",
            i + 1,
        );
    }
}

/// The deep indent runs toward the margin the writer reads from.
///
/// `pad` takes physical sides, so an RTL document indented with `pad(left:)`
/// moves nothing visible — it eats space at the far edge. That shipped for
/// exactly one round of this test before being caught, which is the argument for
/// asserting on both directions rather than on the one being developed in.
#[test]
fn deep_headings_indent_from_the_reading_edge() {
    // Hebrew: the text starts at the right, so a deeper level starts further left.
    let rtl = heading_ladder("rtl");
    for lvl in 7..=9 {
        assert!(
            rtl[lvl - 1].0 < rtl[lvl - 2].0 - 0.5,
            "RTL level {lvl} did not step in from level {} ({:.1} vs {:.1})",
            lvl - 1,
            rtl[lvl - 1].0,
            rtl[lvl - 2].0,
        );
    }

    // English: the text starts at the left, so a deeper level starts further right.
    let ltr = heading_ladder("ltr");
    for lvl in 7..=9 {
        assert!(
            ltr[lvl - 1].0 > ltr[lvl - 2].0 + 0.5,
            "LTR level {lvl} did not step in from level {} ({:.1} vs {:.1})",
            lvl - 1,
            ltr[lvl - 1].0,
            ltr[lvl - 2].0,
        );
    }
}

/// A deep heading still reaches the table of contents.
///
/// The structure was never the broken part; this is here so that making the
/// page show depth cannot quietly cost the outline that already worked.
#[test]
fn deep_headings_still_reach_the_table_of_contents() {
    let src = "#תוכן()\n\n#כותרת(רמה: 8)[כותרתעמוקה]\n\nגוף.\n";
    let lines = lines_of(src);
    let hits = lines.iter().filter(|l| l.contains("כותרתעמוקה")).count();
    assert!(
        hits >= 2,
        "a level-8 heading should appear in the contents and in the body, found {hits}",
    );
}

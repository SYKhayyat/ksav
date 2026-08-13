//! The three lines every rendered-output test starts with.
//!
//! # The finding
//!
//! `fn render` appeared **thirteen times** across `tests/`, and the
//! join-every-run-into-a-string helper appeared **eight times under four
//! names** — `page_text` ×4, `all_text` ×2, `flat`, `rendered`. Two of the four
//! names took `&str` and two took `&[TextRun]`, so reading one test file taught
//! you the wrong thing about the next.
//!
//! Rust integration tests are each their own crate, which is why this happened:
//! there is no ambient module to put a helper in, and `mod common;` is the
//! answer the language actually offers. Nothing had used it.
//!
//! # Why this is an extraction and not a rewrite
//!
//! Every one of the thirteen copies was correct. This is bucket 2 of the report's
//! appendix — *live callers, one idea copied N times; extract, never delete* —
//! and the cost of leaving it is not the lines. It is that a change to how a
//! test lays a document out has thirteen places to land, and the last time
//! something like that was true here, four of the copies moved and one did not.

#![allow(dead_code)] // each test crate uses a different subset

use ksav_engine::probe::{self, Fill, Line, TextRun};
use ksav_engine::DocConfig;

/// Lay a body out with the default configuration, or panic with the diagnostics.
///
/// Panicking rather than returning a `Result` is deliberate: a test document
/// that does not compile is a broken test, and the diagnostics are what tells
/// you which of the ninety in this suite it was.
pub fn render(body: &str) -> Vec<TextRun> {
    render_with(body, &DocConfig::default())
}

/// The same, with a configuration of your own — two-sided, LTR, a paper size.
pub fn render_with(body: &str, cfg: &DocConfig) -> Vec<TextRun> {
    let doc = probe::layout(body, cfg).unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::text_runs(&doc)
}

/// The runs and each page's size in points, for the tests that ask where the
/// edge of the paper is.
pub fn render_sized(body: &str, cfg: &DocConfig) -> (Vec<TextRun>, Vec<(f64, f64)>) {
    let doc = probe::layout(body, cfg).unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    (probe::text_runs(&doc), probe::page_sizes(&doc))
}

/// Everything that printed, in layout order, as one string.
///
/// The one name for what was `page_text`, `all_text`, `flat` and `rendered`.
/// Enough for "is this text on the paper at all"; it is deliberately *not*
/// enough for "where did it land", which is what `probe::lines` is for and what
/// every apparatus assertion in this suite actually needs.
pub fn text(runs: &[TextRun]) -> String {
    runs.iter().map(|r| r.text.as_str()).collect()
}

/// The same, straight from a body — the shape four of the copies had.
pub fn page_text(body: &str) -> String {
    text(&render(body))
}

/// Every filled shape a body puts on the page — highlights, cell backgrounds.
pub fn page_fills(body: &str) -> Vec<Fill> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::fills(&doc)
}

/// Runs grouped into visual lines, at the tolerance these tests have always used.
pub fn visual_lines(runs: &[TextRun]) -> Vec<Line> {
    probe::lines(runs, 1.5)
}

/// The line holding `needle`, or a panic naming every line there was.
///
/// The panic message matters more than it looks: "not found" against a page of
/// Hebrew is unactionable, and every copy of this helper that existed printed
/// the lines, because the first person to hit it needed them.
pub fn line_with<'a>(lines: &'a [Line], needle: &str) -> &'a Line {
    lines
        .iter()
        .find(|l| l.contains(needle))
        .unwrap_or_else(|| {
            panic!(
                "no line contains {needle:?}; lines were: {:?}",
                lines.iter().map(|l| l.text()).collect::<Vec<_>>()
            )
        })
}

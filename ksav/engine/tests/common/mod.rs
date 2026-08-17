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

/// The badge an unconsumed structural child wears, in either language.
///
/// The prelude prints one phrase or the other, chosen from the document's own
/// `text.lang` — a badge in an English sefer that reads `פריט מחוץ למקומו`
/// names a command in a language that reader is not writing in. So a test that
/// searches for the English half alone cannot fail on a Hebrew document, and
/// every document in the insertion grid is Hebrew: `insertion.rs` asserts that
/// a *refused* insertion carries the badge, and searching for the wrong half
/// would have turned that into an assertion that passes on nothing.
pub const BADGE_HE: &str = "מחוץ למקומו";
pub const BADGE_EN: &str = "outside its container";

/// Did this page draw the badge, whichever language it drew it in?
pub fn has_badge(page: &str) -> bool {
    page.contains(BADGE_HE) || page.contains(BADGE_EN)
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

/// Reading the repository as a set of files, for the tests whose subject is the
/// tree rather than a laid-out page.
///
/// The same reason the render helpers above are here: `manifests.rs` grew these
/// five functions for one claim, and the second claim that needs them —
/// `deep_link.rs`, whose subject is spread across a manifest, a Rust file and a
/// JSON configuration — would otherwise have copied them. That is the shape this
/// module exists to stop.
pub mod repo {
    use std::fs;
    use std::path::{Component, Path, PathBuf};

    /// The repository root: this crate is `ksav/engine`, so two levels up.
    #[must_use]
    pub fn root() -> PathBuf {
        normalise(&Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
    }

    /// Resolve `.` and `..` textually. Not `canonicalize`: a path dependency
    /// pointing outside the repository may or may not exist on the machine
    /// running the test, and "it does not exist here" is a different failure
    /// from "it points outside", which is the one worth naming.
    #[must_use]
    pub fn normalise(p: &Path) -> PathBuf {
        let mut out = PathBuf::new();
        for c in p.components() {
            match c {
                Component::ParentDir => {
                    out.pop();
                }
                Component::CurDir => {}
                other => out.push(other.as_os_str()),
            }
        }
        out
    }

    /// Every file with this name in the tree, minus build output and
    /// dependencies of other ecosystems.
    #[must_use]
    pub fn named(root: &Path, name: &str) -> Vec<PathBuf> {
        fn walk(dir: &Path, name: &str, out: &mut Vec<PathBuf>) {
            let Ok(entries) = fs::read_dir(dir) else {
                return;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let base = entry.file_name();
                let base = base.to_string_lossy();
                if path.is_dir() {
                    // `target` and `node_modules` hold thousands of manifests
                    // that belong to other people; `.git` holds none.
                    if base == "target" || base == "node_modules" || base == ".git" {
                        continue;
                    }
                    walk(&path, name, out);
                } else if base == name {
                    out.push(path);
                }
            }
        }
        let mut out = Vec::new();
        walk(root, name, &mut out);
        out.sort();
        out
    }

    /// A manifest with `#` comments removed, so that prose *about* a dependency
    /// is not read as one. Both of this module's subjects are discussed at
    /// length in the manifests they govern.
    #[must_use]
    pub fn uncommented(path: &Path) -> String {
        fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("{} is readable: {e}", path.display()))
            .lines()
            .map(|line| match line.find('#') {
                // Inside a string a `#` is content, not a comment. No manifest
                // here has one, and the only way to be sure without a parser is
                // to keep the line whole when it might.
                Some(_) if line.matches('"').count() % 2 == 1 => line.to_string(),
                Some(i) => line[..i].to_string(),
                None => line.to_string(),
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// The value of `key = "…"` on a dependency line.
    #[must_use]
    pub fn field(line: &str, key: &str) -> Option<String> {
        let at = line.find(&format!("{key} = \""))?;
        let rest = &line[at + key.len() + 4..];
        let end = rest.find('"')?;
        Some(rest[..end].to_string())
    }

    /// A path as the reader would name it: relative to the repository root.
    #[must_use]
    pub fn shown(root: &Path, path: &Path) -> String {
        path.strip_prefix(root)
            .unwrap_or(path)
            .display()
            .to_string()
    }
}

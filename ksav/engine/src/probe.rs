//! Render probe — read the *laid-out* document, not just "did it compile".
//!
//! Every apparatus bug in Ksav so far (orphaned tier numbers, sidenotes clumping
//! at the top of the column, a second section reprinting the first section's
//! notes, per-page bands dropping their deepest tier) compiled perfectly and was
//! wrong on the page. `compile().ok()` cannot see any of that.
//!
//! This module walks the laid-out `PagedDocument` and returns every text run with
//! its page, its absolute position on that page, and its font size — so a test can
//! assert *where words actually landed*. It is the only honest way to test a
//! typesetting apparatus.

use typst::layout::{Frame, FrameItem, Point};
use typst_layout::PagedDocument;

/// One laid-out run of text, positioned on its page.
#[derive(Debug, Clone)]
pub struct TextRun {
    /// 1-based page number.
    pub page: usize,
    /// Absolute position on the page, in points, from the top-left corner.
    pub x: f64,
    pub y: f64,
    /// Font size in points (identifies which apparatus tier a run belongs to).
    pub size: f64,
    /// The text of the run.
    pub text: String,
}

/// Every positioned text run in the document, in layout order.
pub fn text_runs(doc: &PagedDocument) -> Vec<TextRun> {
    let mut out = Vec::new();
    for (i, page) in doc.pages().iter().enumerate() {
        walk(&page.frame, Point::zero(), i + 1, &mut out);
    }
    out
}

fn walk(frame: &Frame, origin: Point, page: usize, out: &mut Vec<TextRun>) {
    for (pos, item) in frame.items() {
        let at = origin + *pos;
        match item {
            FrameItem::Group(g) => {
                // A group's own transform can move its contents; for the assertions
                // we make (same line? which page? above/below?) the translation is
                // what matters, and that is already carried by `pos`.
                walk(&g.frame, at, page, out);
            }
            FrameItem::Text(t) => out.push(TextRun {
                page,
                x: at.x.to_pt(),
                y: at.y.to_pt(),
                size: t.size.to_pt(),
                text: t.text.to_string(),
            }),
            _ => {}
        }
    }
}

/// Each page's (width, height) in points — so a test can assert that nothing
/// (apparatus, page number) was laid out past the edge of the paper.
pub fn page_sizes(doc: &PagedDocument) -> Vec<(f64, f64)> {
    doc.pages()
        .iter()
        .map(|p| {
            let s = p.frame.size();
            (s.x.to_pt(), s.y.to_pt())
        })
        .collect()
}

/// All text on a page, joined in layout order — for "does this word appear at all".
pub fn page_text(runs: &[TextRun], page: usize) -> String {
    runs.iter()
        .filter(|r| r.page == page)
        .map(|r| r.text.as_str())
        .collect()
}

/// Runs grouped into visual lines: same page, y within `tol` points.
/// Returns each line's text joined in x order appropriate to the run order.
pub fn lines(runs: &[TextRun], tol: f64) -> Vec<Line> {
    let mut ls: Vec<Line> = Vec::new();
    for r in runs {
        match ls
            .iter_mut()
            .find(|l| l.page == r.page && (l.y - r.y).abs() <= tol)
        {
            Some(l) => {
                l.runs.push(r.clone());
                // keep the line's y as the topmost run's y
                if r.y < l.y {
                    l.y = r.y;
                }
            }
            None => ls.push(Line {
                page: r.page,
                y: r.y,
                runs: vec![r.clone()],
            }),
        }
    }
    for l in &mut ls {
        l.runs
            .sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal));
    }
    ls.sort_by_key(|a| (a.page, ord(a.y)));
    ls
}

fn ord(v: f64) -> i64 {
    (v * 100.0) as i64
}

/// A visual line of text on a page.
#[derive(Debug, Clone)]
pub struct Line {
    pub page: usize,
    pub y: f64,
    pub runs: Vec<TextRun>,
}

impl Line {
    /// The line's text, in x order (so RTL reads reversed — match on substrings).
    pub fn text(&self) -> String {
        self.runs.iter().map(|r| r.text.as_str()).collect()
    }
    /// The line's text in layout (logical) order, which is what a reader of the
    /// source expects for a single-direction line.
    pub fn logical_text(&self) -> String {
        let mut rs = self.runs.clone();
        rs.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal));
        rs.iter().map(|r| r.text.as_str()).collect()
    }
    pub fn contains(&self, needle: &str) -> bool {
        self.runs.iter().any(|r| r.text.contains(needle))
    }
}

/// Compile a body with the given config and return the laid-out pages, or the
/// diagnostics if it failed. Test helper.
pub fn layout(body: &str, cfg: &crate::DocConfig) -> Result<PagedDocument, Vec<crate::Diagnostic>> {
    crate::compile_doc(body, cfg)
}

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
use typst::text::FontStyle;
use typst::visualize::Paint;
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
    /// Advance width of the run, in points.
    ///
    /// Without it there is no way to ask where a run *starts* in a
    /// right-to-left document: `x` is the left edge, which for Hebrew is the
    /// end. Two runs of the same words at different font sizes have different
    /// left edges for reasons that have nothing to do with placement, so an
    /// indent assertion written against `x` alone measures the width of the
    /// text and calls it a margin.
    pub width: f64,
    /// The text of the run.
    pub text: String,
    /// The typographic family the glyphs actually came from.
    ///
    /// Which face a run was set in is the only way to ask whether a *style*
    /// applied. `#נטוי[…]` is `emph`, and emphasis is a request: Typst looks for
    /// an italic face in the family in force and, in a Hebrew family that ships
    /// only a regular, finds none — so the words come out upright and nothing
    /// anywhere says the request was refused. That is exactly the report
    /// *"italic does not apply"*, and until now the probe could not tell the
    /// difference between a style that was ignored and a style that never ran.
    pub font: String,
    /// True when the face is an italic or oblique one.
    pub italic: bool,
    /// The face's weight, 400 for regular and 700 for bold.
    pub weight: u16,
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
            FrameItem::Text(t) => {
                let info = t.font.font().info();
                out.push(TextRun {
                    page,
                    x: at.x.to_pt(),
                    y: at.y.to_pt(),
                    size: t.size.to_pt(),
                    width: t.width().to_pt(),
                    text: t.text.to_string(),
                    font: info.family.clone(),
                    italic: info.variant.style != FontStyle::Normal,
                    weight: info.variant.weight.to_number(),
                })
            }
            _ => {}
        }
    }
}

/// One filled shape on the page: a highlight, a cell background, a rule.
#[derive(Debug, Clone)]
pub struct Fill {
    /// 1-based page number.
    pub page: usize,
    /// Absolute position on the page, in points, from the top-left corner.
    pub x: f64,
    pub y: f64,
    /// The fill colour as `#rrggbb`, lowercase, alpha dropped.
    ///
    /// Alpha is dropped because a highlight is drawn semi-transparent and the
    /// question a test asks is *which colour*, not how much of it. Comparing
    /// eight hex digits would make every assertion depend on Typst's default
    /// opacity as well as on the colour the writer asked for.
    pub colour: String,
}

/// Every filled shape in the document, in layout order.
///
/// The half of the page `text_runs` cannot see. `#סימון(צבע: …)` puts no text on
/// the page at all — it puts a rectangle behind text that was going to be there
/// anyway — so a test written against the runs cannot tell a highlight that
/// applied from one that was silently dropped.
pub fn fills(doc: &PagedDocument) -> Vec<Fill> {
    let mut out = Vec::new();
    for (i, page) in doc.pages().iter().enumerate() {
        walk_fills(&page.frame, Point::zero(), i + 1, &mut out);
    }
    out
}

fn walk_fills(frame: &Frame, origin: Point, page: usize, out: &mut Vec<Fill>) {
    for (pos, item) in frame.items() {
        let at = origin + *pos;
        match item {
            FrameItem::Group(g) => walk_fills(&g.frame, at, page, out),
            FrameItem::Shape(shape, _) => {
                let Some(Paint::Solid(colour)) = shape.fill.as_ref() else {
                    continue;
                };
                let [r, g, b, _] = colour.to_vec4_u8();
                out.push(Fill {
                    page,
                    x: at.x.to_pt(),
                    y: at.y.to_pt(),
                    colour: format!("#{r:02x}{g:02x}{b:02x}"),
                });
            }
            _ => {}
        }
    }
}

/// One stroked line on the page: a rule, an underline, a strike, a border.
#[derive(Debug, Clone, PartialEq)]
pub struct Stroke {
    /// 1-based page number.
    pub page: usize,
    /// Absolute position on the page, in points, from the top-left corner.
    pub x: f64,
    pub y: f64,
    /// The stroke colour as `#rrggbb`, lowercase, alpha dropped — as `Fill`.
    pub colour: String,
    /// How thick it is drawn, in points.
    pub thickness: f64,
}

/// Every stroked shape in the document, in layout order.
///
/// The other half of what `text_runs` cannot see, and it was missing entirely.
/// `fills` reads `shape.fill`, so it finds a highlight — a rectangle *filled*
/// behind the words — and finds nothing at all for a line, which Typst draws as
/// a stroked shape with no fill. That covers `#קו_תחתון`, `#קו_חוצה`,
/// `#קו_מפריד` and every border a block draws, none of which any test could
/// previously see: a strike that silently stopped being drawn passed every
/// assertion in this repository, because the words it goes through are still
/// there and the run reports nothing about the line.
pub fn strokes(doc: &PagedDocument) -> Vec<Stroke> {
    let mut out = Vec::new();
    for (i, page) in doc.pages().iter().enumerate() {
        walk_strokes(&page.frame, Point::zero(), i + 1, &mut out);
    }
    out
}

fn walk_strokes(frame: &Frame, origin: Point, page: usize, out: &mut Vec<Stroke>) {
    for (pos, item) in frame.items() {
        let at = origin + *pos;
        match item {
            FrameItem::Group(g) => walk_strokes(&g.frame, at, page, out),
            FrameItem::Shape(shape, _) => {
                let Some(stroke) = shape.stroke.as_ref() else {
                    continue;
                };
                let Paint::Solid(colour) = &stroke.paint else {
                    continue;
                };
                let [r, g, b, _] = colour.to_vec4_u8();
                out.push(Stroke {
                    page,
                    x: at.x.to_pt(),
                    y: at.y.to_pt(),
                    colour: format!("#{r:02x}{g:02x}{b:02x}"),
                    thickness: stroke.thickness.to_pt(),
                });
            }
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
    ///
    /// There used to be a `logical_text` beside this, documented as giving "the
    /// line's text in layout (logical) order, which is what a reader of the
    /// source expects". It sorted the runs by `x` — which is what this already
    /// does, because `runs` is built in x order — so the two returned the same
    /// string for every input, in a *shipping library*, with a doc comment
    /// claiming otherwise. Nothing called it. A `page_text` went with it, also
    /// uncalled: the `page_text(&runs)` in the tests is each test file's own
    /// local helper and always was.
    pub fn text(&self) -> String {
        self.runs.iter().map(|r| r.text.as_str()).collect()
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

/// Lay out a **whole Typst document** — no Ksav assembly, no prelude resolver.
///
/// The one caller is `tests/assemble.rs`, and the one question is whether what
/// "export .typ" writes is still a document. A compile imports the prelude as a
/// file; the export inlines it. Those are two arrangements of one prelude, and
/// the compiled one would go on working perfectly if the exported one quietly
/// stopped being self-contained — which is a failure with no symptom until
/// somebody opens the file somewhere else.
pub fn layout_plain(source: &str) -> Result<PagedDocument, Vec<crate::Diagnostic>> {
    crate::layout_plain(source)
}

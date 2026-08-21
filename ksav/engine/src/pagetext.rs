//! What each page actually *says* — the printed text, in reading order.
//!
//! # Why this exists
//!
//! Searching a sefer means searching the document, and the document the writer
//! reads is not the string they typed. `#הערה[…]` prints a marker the source
//! never spells; a running head repeats a heading from forty pages back; an
//! auto-numbered siman prints a number nobody wrote; `#כלול` pulls in a file
//! that is not in this buffer at all. In the other direction the source is full
//! of text that never prints: command names, argument names, comments.
//!
//! So a search offered as *"search the preview"* and implemented against the
//! source string is not a slower or coarser answer, it is a **different answer
//! wearing the label of the one that was asked for** — which is this
//! repository's whole failure mode. Either the printed text is read off the
//! laid-out page or the option is not offered.
//!
//! # Reading order is walk order
//!
//! Typst lays a paragraph out in logical order and expresses bidi as
//! *positions*, so the frame's item order is the order the words are read in,
//! for Hebrew as for English. Sorting the runs by `x` would reverse every
//! Hebrew line, and sorting them by `-x` would reverse every English one; the
//! walk needs no direction because it never asks.
//!
//! # Lines, and the two ways a line ends
//!
//! Runs are gathered into lines by baseline, with the tolerance taken from the
//! type size so that a superscript note marker stays on the line it marks
//! rather than becoming a line of its own.
//!
//! A baseline alone is not enough. Parallel streams and a side column put two
//! unrelated stretches of text at the *same* height, and joined they would read
//! as one sentence — inventing a phrase that never appeared on the page and
//! that a search would then find. So a run also has to be horizontally next to
//! what it is joining: a gap of more than three ems starts a new line, which is
//! wider than any inter-word space justification produces and narrower than any
//! column gutter.
//!
//! # It rides on the compile
//!
//! Like [`crate::pagelines`], and for the same reason: the layout that has just
//! happened already knows, and asking separately would be a full layout per
//! question. It is behind [`crate::Wants::text`] because only a search that has
//! been told to look at the preview reads it.

use crate::include::Expanded;
use crate::PagedDocument;
use typst::layout::{Frame, FrameItem, Point};
use typst::syntax::Source;

/// One printed line of one page.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PageLine {
    /// Baseline, in points from the top of the page. What a hit is revealed at.
    pub y: f64,
    /// The words as they printed, in reading order.
    pub text: String,
    /// The included file the line came from, or `None` for the main document.
    /// Filled in by [`relabel`], exactly as `pagelines` does it.
    pub file: Option<String>,
    /// The 1-based line of that file, when the ink can be traced to the
    /// writer's own text. A running head or a note marker often cannot be, and
    /// says so rather than guessing at a nearby line.
    pub line: Option<usize>,
}

/// One laid-out run, before the lines are assembled.
struct Run {
    y: f64,
    x: f64,
    width: f64,
    size: f64,
    text: String,
    line: Option<usize>,
}

/// A line still being built, in the **expanded** body's coordinates.
struct Open {
    y: f64,
    size: f64,
    /// Where the run most recently joined starts and how wide it is, which is
    /// what "next to" is measured from — in either direction.
    last_x: f64,
    last_w: f64,
    order: usize,
    text: String,
    line: Option<usize>,
}

/// Every page's printed lines, in page order, in the expanded body's lines.
pub fn page_text(doc: &PagedDocument, main: &Source, body: &str) -> Vec<Vec<PageLine>> {
    let offset = crate::diagnostics::body_offset_of(main.text(), body);
    let starts = crate::pagelines::line_starts(body);
    doc.pages()
        .iter()
        .map(|page| {
            let mut runs = Vec::new();
            walk(&page.frame, Point::zero(), main, offset, &starts, &mut runs);
            assemble(runs)
        })
        .collect()
}

fn walk(
    frame: &Frame,
    origin: Point,
    main: &Source,
    offset: usize,
    starts: &[usize],
    out: &mut Vec<Run>,
) {
    for (pos, item) in frame.items() {
        let at = origin + *pos;
        match item {
            FrameItem::Group(g) => walk(&g.frame, at, main, offset, starts, out),
            FrameItem::Text(t) => {
                if t.text.is_empty() {
                    continue;
                }
                // The first glyph's span, not every glyph's: a run is one span's
                // worth of text, and resolving per letter is the same answer for
                // an order of magnitude more work.
                let line = t
                    .glyphs
                    .first()
                    .and_then(|g| crate::diagnostics::body_byte_of(g.span.0, main, offset))
                    .map(|byte| crate::pagelines::line_at(starts, byte));
                out.push(Run {
                    y: at.y.to_pt(),
                    x: at.x.to_pt(),
                    width: t.width().to_pt(),
                    size: t.size.to_pt(),
                    text: t.text.to_string(),
                    line,
                });
            }
            // Shapes and images print no words. `pagelines` counts them because
            // it answers "did this line leave ink"; this answers "what does the
            // page say", and a rule says nothing.
            _ => {}
        }
    }
}

/// How far apart two runs are horizontally, whichever way round they sit.
fn gap(open: &Open, run: &Run) -> f64 {
    if run.x >= open.last_x {
        run.x - (open.last_x + open.last_w)
    } else {
        open.last_x - (run.x + run.width)
    }
}

fn assemble(runs: Vec<Run>) -> Vec<PageLine> {
    let mut open: Vec<Open> = Vec::new();
    for (order, run) in runs.into_iter().enumerate() {
        let em = run.size.max(1.0);
        // From the end: the most recently written line is the one this run
        // continues. Searching from the front would let the first column of a
        // two-column spread claim the second column's runs whenever a baseline
        // happened to coincide.
        let found = open.iter().rposition(|o| {
            (run.y - o.y).abs() <= 0.6 * o.size.max(run.size)
                && gap(o, &run) <= 3.0 * em.max(o.size)
        });
        match found {
            Some(i) => {
                let o = &mut open[i];
                o.text.push_str(&run.text);
                o.last_x = run.x;
                o.last_w = run.width;
                o.size = o.size.max(run.size);
                if o.line.is_none() {
                    o.line = run.line;
                }
            }
            None => open.push(Open {
                y: run.y,
                size: run.size,
                last_x: run.x,
                last_w: run.width,
                order,
                text: run.text,
                line: run.line,
            }),
        }
    }
    // Down the page, and where two lines share a baseline, in the order they
    // were laid out.
    open.sort_by(|a, b| {
        a.y.partial_cmp(&b.y)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.order.cmp(&b.order))
    });
    open.into_iter()
        .filter(|o| !o.text.trim().is_empty())
        .map(|o| PageLine {
            y: o.y,
            text: o.text,
            file: None,
            line: o.line,
        })
        .collect()
}

/// Put every line back into the coordinates of the file it came from.
///
/// The counterpart of [`crate::pagelines::relabel`], and simpler than it: a
/// printed line is one line of one file, so there is nothing here to split.
pub fn relabel(expanded: &Expanded, pages: &mut [Vec<PageLine>]) {
    for page in pages.iter_mut() {
        for printed in page.iter_mut() {
            let Some(at) = printed.line else { continue };
            // A line with no origin is a line of the main document that nothing
            // was included into: the two coordinates are the same coordinate.
            if let Some(o) = expanded.origin_of(at) {
                printed.file = o.file.clone();
                printed.line = Some(o.line);
            }
        }
    }
}

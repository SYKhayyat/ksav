//! Which of the writer's lines printed on each page.
//!
//! # The question this answers, and who is asking
//!
//! A pane narrowed to one siman shows that siman and hides the rest of the
//! sefer. The preview beside it should show the *pages of that siman* — and
//! nothing here decides which those are. This module answers only the factual
//! half: for every page, which lines of the writer's own text left ink on it.
//! The client intersects that with the span its pane is narrowed to.
//!
//! # Why it rides on the compile
//!
//! `reveal` already answers "where did this line print", and asking it twice —
//! once for the head of the siman, once for its foot — is the obvious
//! implementation. It is also a **full layout per question**, and the answer
//! goes stale on every keystroke, because a paragraph typed into siman 1 moves
//! every page boundary after it. That is three layouts per pause in typing to
//! draw one pane.
//!
//! The layout that has just happened already knows. Every laid-out glyph carries
//! the [`Span`] of the source it came from — the same fact `jump.rs` leans on —
//! so the answer is a walk over frames that exist, and the walk is a fraction of
//! the cost of the SVG serialisation happening beside it.
//!
//! It is still behind a flag (`Wants::lines`). Nothing but a narrowed preview
//! reads it, and a response that carries what nobody asked for is the mistake
//! `want_pdf` and `want_source` were each introduced to undo.
//!
//! # Runs, not a range
//!
//! A page reports the lines that printed on it as **contiguous runs**, not as a
//! single `from`–`to`. The difference is the running head: it is built from the
//! heading it repeats, so its glyphs carry that heading's span, and a page deep
//! inside siman 3 therefore prints one line from far above it. Collapsed to a
//! minimum and a maximum, that page would claim to hold everything in between —
//! which is most of the sefer, stated with total confidence.
//!
//! So what is recorded is what was seen, and the smallest structure that can say
//! it. No weighting, no "the big run wins", no dropping of a line for being
//! lonely: a heuristic here would be a lie the client cannot check.

use crate::include::Expanded;
use crate::PagedDocument;
use typst::layout::{Frame, FrameItem};
use typst::syntax::{Source, Span};

/// A stretch of one file that printed on a page: 1-based lines, inclusive.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LineRun {
    /// The included file these lines belong to, or `None` for the main document.
    ///
    /// Filled in by [`relabel`]. Until then every run is in the expanded body's
    /// coordinates, which is a concatenation nobody has open — the same two-step
    /// the diagnostics take, and for the same reason: the compile is handed one
    /// string and the writer has several.
    pub file: Option<String>,
    pub from: usize,
    pub to: usize,
}

/// Every page's runs, in page order, in the **expanded** body's coordinates.
pub fn page_lines(doc: &PagedDocument, main: &Source, body: &str) -> Vec<Vec<LineRun>> {
    let offset = crate::diagnostics::body_offset_of(main.text(), body);
    let starts = line_starts(body);
    doc.pages()
        .iter()
        .map(|page| {
            let mut lines = Vec::new();
            collect(&page.frame, main, offset, &starts, &mut lines);
            runs(lines)
        })
        .collect()
}

/// Byte offset of the start of each line of `body`, in order.
///
/// Built once per compile rather than counting newlines per glyph, which is the
/// difference between one pass over the document and one pass **per glyph** — on
/// a 300-page sefer that is the difference between a walk and a wait.
fn line_starts(body: &str) -> Vec<usize> {
    let mut out = vec![0];
    for (i, b) in body.bytes().enumerate() {
        if b == b'\n' {
            out.push(i + 1);
        }
    }
    out
}

/// The 1-based line a byte offset falls on.
fn line_at(starts: &[usize], byte: usize) -> usize {
    match starts.binary_search(&byte) {
        Ok(i) => i + 1,
        Err(i) => i, // `i` is the count of starts at or before `byte`, which is the line.
    }
}

/// One span's line, when it points at the writer's own text.
fn take(span: Span, main: &Source, offset: usize, starts: &[usize], out: &mut Vec<usize>) {
    if let Some(byte) = crate::diagnostics::body_byte_of(span, main, offset) {
        out.push(line_at(starts, byte));
    }
}

/// Every body line that left ink in this frame, unsorted and with repeats.
fn collect(frame: &Frame, main: &Source, offset: usize, starts: &[usize], out: &mut Vec<usize>) {
    // The span of the glyph before this one. Every glyph of a word carries the
    // same span, so without this the resolution below runs once per letter
    // instead of once per run of text — the same answer, an order of magnitude
    // more work.
    let mut last: Option<Span> = None;
    for (_, item) in frame.items() {
        match item {
            FrameItem::Group(group) => collect(&group.frame, main, offset, starts, out),
            FrameItem::Text(text) => {
                for glyph in &text.glyphs {
                    if last == Some(glyph.span.0) {
                        continue;
                    }
                    last = Some(glyph.span.0);
                    take(glyph.span.0, main, offset, starts, out);
                }
            }
            // A rule the writer drew and an image they placed are both on the
            // page as surely as a letter is. A page holding nothing but a
            // full-page figure would otherwise report printing nothing at all.
            FrameItem::Shape(_, span) | FrameItem::Image(_, _, span) => {
                take(*span, main, offset, starts, out)
            }
            // A link has no span of its own, and a tag is introspection
            // machinery rather than ink.
            FrameItem::Link(..) | FrameItem::Tag(_) => {}
        }
    }
}

/// Sorted lines, merged into contiguous runs.
fn runs(mut lines: Vec<usize>) -> Vec<LineRun> {
    lines.sort_unstable();
    lines.dedup();
    let mut out: Vec<LineRun> = Vec::new();
    for line in lines {
        match out.last_mut() {
            Some(last) if line == last.to + 1 => last.to = line,
            _ => out.push(LineRun {
                file: None,
                from: line,
                to: line,
            }),
        }
    }
    out
}

/// Put every run back into the coordinates of the file it came from.
///
/// The counterpart of `include::relabel` for diagnostics, and it has to split
/// rather than translate: one run of the expanded body can cross a `#כלול`
/// boundary, and a page holding the end of one chapter and the head of the next
/// is the ordinary case rather than the exotic one.
pub fn relabel(expanded: &Expanded, pages: &mut [Vec<LineRun>]) {
    for page in pages.iter_mut() {
        let mut out: Vec<LineRun> = Vec::new();
        for run in page.iter() {
            for line in run.from..=run.to {
                let (file, at) = match expanded.origin_of(line) {
                    Some(o) => (o.file.clone(), o.line),
                    // A line the expansion has no origin for is a line of the
                    // main document that nothing was included into — the
                    // ordinary single-file case, where the two coordinates are
                    // the same coordinate.
                    None => (None, line),
                };
                match out.last_mut() {
                    Some(last) if last.file == file && at == last.to + 1 => last.to = at,
                    _ => out.push(LineRun {
                        file,
                        from: at,
                        to: at,
                    }),
                }
            }
        }
        *page = out;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Assets, DocConfig};

    fn lines_of(body: &str) -> Vec<Vec<LineRun>> {
        let cfg = DocConfig::default();
        let doc = crate::compile_doc(body, &cfg).expect("the document lays out");
        let main = Source::detached(crate::main_source(body, &cfg));
        page_lines(&doc, &main, body)
    }

    /// The line-start index and the answer it is there to give.
    #[test]
    fn a_byte_lands_on_its_own_line() {
        let body = "aleph\nbeis\n\ngimmel";
        let starts = line_starts(body);
        assert_eq!(starts, vec![0, 6, 11, 12]);
        assert_eq!(line_at(&starts, 0), 1);
        assert_eq!(line_at(&starts, 4), 1);
        assert_eq!(line_at(&starts, 6), 2);
        assert_eq!(line_at(&starts, 11), 3);
        assert_eq!(line_at(&starts, 12), 4);
        assert_eq!(line_at(&starts, 17), 4);
    }

    /// Runs merge what is contiguous and keep apart what is not — which is the
    /// whole reason a page reports several of them.
    #[test]
    fn lines_become_runs() {
        assert_eq!(runs(vec![]), vec![]);
        assert_eq!(
            runs(vec![7, 3, 1, 2, 3]),
            vec![
                LineRun { file: None, from: 1, to: 3 },
                LineRun { file: None, from: 7, to: 7 },
            ]
        );
    }

    /// A one-page document reports the lines it has, and no others.
    #[test]
    fn one_page_reports_its_own_lines() {
        let pages = lines_of("שורה ראשונה\n\nשורה שלישית");
        assert_eq!(pages.len(), 1, "one page: {pages:?}");
        let all = &pages[0];
        assert!(!all.is_empty(), "the page printed nothing: {pages:?}");
        let lo = all.iter().map(|r| r.from).min().unwrap();
        let hi = all.iter().map(|r| r.to).max().unwrap();
        assert_eq!((lo, hi), (1, 3), "{all:?}");
    }

    /// The claim the narrowed preview rests on: a line that printed on the
    /// second page is reported against the second page and not the first.
    ///
    /// The break is forced with `#מעבר_עמוד` rather than by writing enough text
    /// to fill a sheet, so this stays a test of the mapping rather than of how
    /// many words fit on A4 in whatever font the machine has.
    #[test]
    fn a_second_page_reports_its_own_lines() {
        let body = "ראשון\n\n#מעבר_עמוד\n\nשני";
        let pages = lines_of(body);
        assert_eq!(pages.len(), 2, "two pages: {pages:?}");
        let on = |i: usize, line: usize| pages[i].iter().any(|r| r.from <= line && line <= r.to);
        assert!(on(0, 1), "line 1 is on page 1: {pages:?}");
        assert!(!on(1, 1), "line 1 is not on page 2: {pages:?}");
        assert!(on(1, 5), "line 5 is on page 2: {pages:?}");
        assert!(!on(0, 5), "line 5 is not on page 1: {pages:?}");
    }

    /// Exactly one entry per page, whatever the document is.
    ///
    /// The client indexes this list by page number, against `pages_svg` of the
    /// same response — so a list one short does not report less, it reports the
    /// **wrong page** for everything after the gap. A page with nothing of the
    /// writer's on it answers with an empty list of runs and keeps its place.
    #[test]
    fn there_is_one_answer_per_page() {
        let cfg = DocConfig::default();
        for body in [
            "א",
            "א\n\n#מעבר_עמוד\n\nב",
            // Nothing but a command that prints nothing: a page whose only ink
            // is the prelude's own.
            "#הגדרות_מדפים(מספור: (\"א\",))\n\nא",
        ] {
            let doc = crate::compile_doc(body, &cfg).expect("the document lays out");
            let main = Source::detached(crate::main_source(body, &cfg));
            assert_eq!(
                page_lines(&doc, &main, body).len(),
                doc.pages().len(),
                "one entry per page for {body:?}"
            );
        }
    }

    /// A running head puts one line of the writer's text on every page — so a
    /// page reports **runs**, and not a minimum and a maximum.
    ///
    /// This is the case the whole shape of [`LineRun`] exists for, and it is not
    /// hypothetical: `#כותרת_עליונה` repeats the writer's own markup at the top
    /// of each sheet, and those glyphs carry the span of the line it was written
    /// on. Measured here rather than assumed — the second page comes back as
    /// `[1..1, 8..8]`.
    ///
    /// Collapsed to `1..8`, the second page would claim every line of the
    /// document, and a pane narrowed to a siman on page one would show page two
    /// as well. The narrowing would look like it worked, on a document short
    /// enough to check, and be wrong on the sefer nobody can check by eye.
    #[test]
    fn a_running_head_does_not_swallow_the_lines_between() {
        let body = "#כותרת_עליונה[ראש רץ]\n\n#כותרת[סימן א]\nגוף.\n\n#מעבר_עמוד\n\nאחרון.";
        let pages = lines_of(body);
        assert_eq!(pages.len(), 2, "{pages:?}");
        let second = &pages[1];
        assert!(
            second.len() >= 2,
            "the second page came back as one run, so the running head swallowed the document: {second:?}"
        );
        let covers = |page: &[LineRun], line: usize| page.iter().any(|r| r.from <= line && line <= r.to);
        assert!(covers(second, 1), "the running head's own line: {second:?}");
        assert!(covers(second, 8), "the text actually on the page: {second:?}");
        assert!(
            !covers(second, 4),
            "the second page claims the first page's siman: {second:?}"
        );
    }

    /// Relabelling splits a run where the file changes, and **not** where the
    /// line numbers stop being consecutive.
    ///
    /// Those are different rules, and the shape of a `#כלול` is what tells them
    /// apart. A sefer whose line 12 is `#כלול[פרק א]` expands to: line 11 of the
    /// sefer, then the chapter's own lines 1 to 12, then line 13 of the sefer.
    /// The chapter's last line is 12 and the sefer's next is 13 — consecutive
    /// numbers in two different files. Merging on the numbers alone hands the
    /// sefer's line 13 to the chapter, and the preview of a pane narrowed inside
    /// that chapter picks up a page it has nothing to do with.
    #[test]
    fn a_run_is_split_where_the_file_changes() {
        use crate::include::Origin;
        let origin = |file: Option<&str>, line| Origin {
            file: file.map(str::to_string),
            line,
        };
        let expanded = Expanded {
            text: String::new(),
            origins: vec![
                origin(None, 11),
                origin(Some("פרק א.ksav"), 11),
                origin(Some("פרק א.ksav"), 12),
                origin(None, 13),
            ],
            problems: Vec::new(),
        };
        let mut pages = vec![vec![LineRun { file: None, from: 1, to: 4 }]];
        relabel(&expanded, &mut pages);
        assert_eq!(
            pages[0],
            vec![
                LineRun { file: None, from: 11, to: 11 },
                LineRun { file: Some("פרק א.ksav".into()), from: 11, to: 12 },
                LineRun { file: None, from: 13, to: 13 },
            ],
            "the sefer's own line was merged into the chapter above it"
        );
    }

    /// With nothing included, relabelling is the identity — the expanded body
    /// *is* the writer's document, and inventing a file name for it would make
    /// every client compare a null against a string.
    #[test]
    fn without_inclusions_relabelling_changes_nothing() {
        let before = vec![vec![LineRun { file: None, from: 2, to: 5 }]];
        let mut after = before.clone();
        relabel(&Expanded::default(), &mut after);
        assert_eq!(after, before);
    }

    /// Assets are not in the picture, but the signature is shared with the rest
    /// of the compile — this keeps the import honest if that changes.
    #[test]
    fn a_document_with_assets_still_answers() {
        let cfg = DocConfig::default();
        let body = "שלום";
        let doc = crate::compile_doc_with(body, &cfg, &Assets::default()).unwrap();
        let main = Source::detached(crate::main_source(body, &cfg));
        assert_eq!(page_lines(&doc, &main, body).len(), 1);
    }
}

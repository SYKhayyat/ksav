//! Both directions between the source and the page.
//!
//! Clicking a word in the preview should put the cursor on that word, and moving
//! the cursor should say where on the page that word is. The editor used to do
//! the first of these by proportion — the click was 40% of the way down the
//! preview, so the cursor went to line `0.4 × lines` — and could not do the
//! second at all. Proportion is right only for a document that is one column of
//! uniform text with nothing floated, nothing in a note band and no page breaks,
//! which is to say: not this one. A document whose whole point is stacked
//! apparatus below the text is the worst possible case for it, because every
//! note band pushes the body text up by an amount the guess knows nothing about.
//!
//! Typst already knows the answer exactly. Every laid-out glyph carries the
//! [`Span`] of the source it came from, and `typst-ide` walks the frame tree to
//! find the one under a point. So this module does no geometry of its own; it
//! only supplies the two things `typst-ide` needs and cannot get for itself:
//!
//!  1. **The world the layout was made against.** A span is an index into a
//!     particular [`typst::World`]'s files, so resolving one means holding the
//!     world that produced it. `engine_for` exists so this module and
//!     `compile_doc` build the same one.
//!  2. **The writer's own coordinates.** Everything the compiler sees is the
//!     *assembled* source: the 1,700-line prelude, then the `#show` wrapper,
//!     then the writer's text. A line number counted in that is not a line
//!     anybody can be sent to, so both directions convert through
//!     `diagnostics::body_offset` — the same value the diagnostics use, for the
//!     same reason, and deliberately not a second copy of the arithmetic.
//!
//! A jump that lands anywhere other than the writer's own text — inside the
//! prelude, in another file, on a URL — is reported as *no answer* rather than
//! as a guess. Sending the cursor to the top of the document because a click
//! landed on a page number is worse than doing nothing: the writer loses their
//! place and has nothing to blame.

use crate::assets::Assets;
use crate::{DocConfig, PagedDocument};
use typst::World;
use typst::introspection::PagedPosition;
use typst::layout::{Abs, Point};

/// A point on a rendered page, in Typst points — the unit the SVG's own
/// `viewBox` is written in, so the client converts with its element's width and
/// nothing else.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PagePoint {
    /// 0-based, matching the order of `pages_svg` in a compile response.
    pub page: usize,
    pub x_pt: f64,
    pub y_pt: f64,
}

/// A place in the body the request carried: 1-based line, 1-based character
/// column.
///
/// The same convention as [`crate::diagnostics::Diagnostic`], down to counting
/// the column in characters rather than bytes, so a caller that already
/// subtracts its own preamble for diagnostics subtracts exactly the same amount
/// here. Two conventions for "where in the document" would be one too many.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct BodySpot {
    pub line: usize,
    pub column: usize,
}

/// `typst-ide` wants a [`typst_ide::IdeWorld`], which is a [`World`] that can
/// also list its packages and files. This document has neither: it is one
/// detached source with its images handed over as bytes. So the extra methods
/// keep their empty defaults and this is a pure delegation.
struct IdeShim<'a>(&'a typst_as_lib::TypstWorld<'a>);

impl World for IdeShim<'_> {
    fn library(&self) -> &typst::utils::LazyHash<typst::Library> {
        self.0.library()
    }
    fn book(&self) -> &typst::utils::LazyHash<typst::text::FontBook> {
        self.0.book()
    }
    fn main(&self) -> typst::syntax::FileId {
        self.0.main()
    }
    fn source(&self, id: typst::syntax::FileId) -> typst::diag::FileResult<typst::syntax::Source> {
        self.0.source(id)
    }
    fn file(&self, id: typst::syntax::FileId) -> typst::diag::FileResult<typst::foundations::Bytes> {
        self.0.file(id)
    }
    fn font(&self, index: usize) -> Option<typst::text::Font> {
        self.0.font(index)
    }
    fn today(&self, offset: Option<typst::foundations::Duration>) -> Option<typst::foundations::Datetime> {
        self.0.today(offset)
    }
}

impl typst_ide::IdeWorld for IdeShim<'_> {
    fn upcast(&self) -> &dyn World {
        self
    }
}

/// Lay the document out and hand the world and the pages to `f`.
///
/// `None` when the document does not compile. That is not an error worth
/// reporting: a jump is asked for *while* the writer is typing, and a document
/// mid-keystroke is unbalanced more often than not. The editor's answer to "no
/// jump" is to leave the cursor alone, which is also the right answer to "that
/// document does not build".
fn with_layout<R>(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
    f: impl FnOnce(&IdeShim<'_>, &PagedDocument, &typst::syntax::Source) -> Option<R>,
) -> Option<R> {
    let source = crate::assemble_source(body, cfg);
    let engine = crate::engine_for(source, assets);
    engine
        .with_world(|world| {
            let doc = typst::compile::<PagedDocument>(world).output.ok()?;
            let shim = IdeShim(world);
            let main = world.source(world.main()).ok()?;
            f(&shim, &doc, &main)
        })
        .ok()
        .flatten()
}

/// Inverse search: what did the writer type, that landed here on the page?
///
/// `None` when the click is on the page's margin, on something the prelude
/// generated (a running head, a page number, a note-band rule), or on a span
/// that resolves into some other file. All of those are places with no line to
/// go to, and each is far more common in this document shape than in a plain
/// one — the whole apparatus is prelude-generated.
pub fn to_source(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
    at: PagePoint,
) -> Option<BodySpot> {
    let offset = crate::diagnostics::body_offset(cfg);
    with_layout(body, cfg, assets, |world, doc, main| {
        let page = std::num::NonZeroUsize::new(at.page.checked_add(1)?)?;
        let position = PagedPosition {
            page,
            point: Point::new(Abs::pt(at.x_pt), Abs::pt(at.y_pt)),
        };
        match typst_ide::jump_from_click(world, doc, &position)? {
            // Only a jump into the document itself is a place the writer can be
            // sent. A `Url` is a link to follow, not a line; a `Position` is the
            // page telling us about another part of the page.
            typst_ide::Jump::File(id, cursor) if id == world.main() => spot(main, cursor, offset),
            _ => None,
        }
    })
}

/// Forward search: where on the page did what the writer is typing end up?
///
/// A [`Vec`], because one place in the source can land in several places on the
/// page and this document shape makes that ordinary rather than exotic: a note
/// whose body is set both in the band and in an endnote list appears twice, and
/// text in a repeated header appears on every page. The caller shows the first
/// and is free to offer the rest.
pub fn from_cursor(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
    at: BodySpot,
) -> Vec<PagePoint> {
    let offset = crate::diagnostics::body_offset(cfg);
    with_layout(body, cfg, assets, |_, doc, main| {
        let cursor = byte_of(main.text(), offset, at)?;
        Some(
            typst_ide::jump_from_cursor(doc, main, cursor)
                .into_iter()
                .map(|p| PagePoint {
                    page: usize::from(p.page) - 1,
                    x_pt: p.point.x.to_pt(),
                    y_pt: p.point.y.to_pt(),
                })
                .collect(),
        )
    })
    .unwrap_or_default()
}

/// A byte offset in the assembled source, as a place in the writer's body.
///
/// `None` for anything before the body starts, which is the same answer
/// `diagnostics` gives and for the same reason: a line inside the prelude is not
/// a line the writer has.
fn spot(main: &typst::syntax::Source, cursor: usize, offset: usize) -> Option<BodySpot> {
    let text = main.text();
    if cursor < offset || cursor > text.len() {
        return None;
    }
    let body = &text[offset..];
    let upto = &body[..cursor - offset];
    let start = upto.rfind('\n').map_or(0, |i| i + 1);
    Some(BodySpot {
        line: upto.matches('\n').count() + 1,
        // Characters, not bytes — a Hebrew letter is two of the latter.
        column: upto[start..].chars().count() + 1,
    })
}

/// The inverse of [`spot`]: a place in the writer's body, as a byte offset in
/// the assembled source.
///
/// Clamped rather than refused when the column runs past the end of its line.
/// The cursor legitimately sits at end-of-line, and a request naming a column
/// one past the last character is the ordinary case, not a malformed one.
fn byte_of(text: &str, offset: usize, at: BodySpot) -> Option<usize> {
    let body = text.get(offset..)?;
    let line = body.split('\n').nth(at.line.checked_sub(1)?)?;
    let line_start = offset + (line.as_ptr() as usize - body.as_ptr() as usize);
    let col = at.column.saturating_sub(1);
    let within = line
        .char_indices()
        .nth(col)
        .map_or(line.len(), |(i, _)| i);
    Some(line_start + within)
}

// ------------------------------------------------------------------ the wire
//
// JSON in, JSON out, exactly like `compile_request` — the HTTP server, the Tauri
// command and the wasm binding all hand their body straight through, so there is
// one contract and three callers rather than three contracts.

/// `{body, page, x_pt, y_pt, …DocConfig}` → `{line, column}` or `{}`.
pub fn jump_request(input_json: &str) -> String {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(input_json) else {
        return "{}".to_string();
    };
    let Some(body) = v.get("body").and_then(|b| b.as_str()) else {
        return "{}".to_string();
    };
    let num = |k: &str| v.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0);
    let at = PagePoint {
        page: v.get("page").and_then(|x| x.as_u64()).unwrap_or(0) as usize,
        x_pt: num("x_pt"),
        y_pt: num("y_pt"),
    };
    let (assets, _) = Assets::from_request(&v);
    // The page was laid out from the *expanded* body, so that is what has to be
    // walked — and the answer then has to be translated back, or a click on
    // chapter three would send the cursor to a line number in a concatenation
    // the writer has never seen.
    let expanded = crate::include::expand(body, &crate::include::from_request(&v));
    match to_source(&expanded.text, &DocConfig::from_json(&v), &assets, at) {
        Some(s) => {
            let origin = expanded.origin_of(s.line);
            serde_json::json!({
                "line": origin.map_or(s.line, |o| o.line),
                "column": s.column,
                "file": origin.and_then(|o| o.file.clone()),
            })
            .to_string()
        }
        None => "{}".to_string(),
    }
}

/// `{body, line, column, …DocConfig}` → `{points: [{page, x_pt, y_pt}]}`.
pub fn reveal_request(input_json: &str) -> String {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(input_json) else {
        return r#"{"points":[]}"#.to_string();
    };
    let Some(body) = v.get("body").and_then(|b| b.as_str()) else {
        return r#"{"points":[]}"#.to_string();
    };
    let (assets, _) = Assets::from_request(&v);
    let expanded = crate::include::expand(body, &crate::include::from_request(&v));
    // The caller names a line in the file the cursor is actually in, which is the
    // only line number it has; the layout knows the expanded body's.
    let asked = v.get("line").and_then(|x| x.as_u64()).unwrap_or(1).max(1) as usize;
    let file = v.get("file").and_then(|x| x.as_str());
    let at = BodySpot {
        line: expanded.line_of(file, asked).unwrap_or(asked),
        column: v.get("column").and_then(|x| x.as_u64()).unwrap_or(1).max(1) as usize,
    };
    let points = from_cursor(&expanded.text, &DocConfig::from_json(&v), &assets, at);
    serde_json::json!({ "points": points }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> DocConfig {
        DocConfig::default()
    }

    /// The two conversions are each other's inverse for every place in a body,
    /// which is the property the whole module rests on: a click resolves to a
    /// line only because `spot` and `byte_of` agree about what a line is.
    #[test]
    fn spot_and_byte_of_round_trip() {
        let cfg = cfg();
        let body = "שורה ראשונה\nline two\nשלוש עם ניקוד בְּרֵאשִׁית\n\nאחרי שורה ריקה";
        let assembled = crate::assemble_source(body, &cfg);
        let offset = crate::diagnostics::body_offset(&cfg);
        let source = typst::syntax::Source::detached(assembled.clone());
        for (i, line) in body.split('\n').enumerate() {
            for col in 1..=line.chars().count() + 1 {
                let at = BodySpot { line: i + 1, column: col };
                let byte = byte_of(&assembled, offset, at).expect("a place in the body");
                assert_eq!(spot(&source, byte, offset), Some(at), "at {at:?}");
            }
        }
    }

    /// A span in the prelude is not a place the writer has, and saying so is the
    /// point — the alternative is sending the cursor to their line 1.
    #[test]
    fn prelude_is_not_a_place() {
        let cfg = cfg();
        let assembled = crate::assemble_source("שלום", &cfg);
        let source = typst::syntax::Source::detached(assembled);
        assert_eq!(spot(&source, 0, crate::diagnostics::body_offset(&cfg)), None);
    }

    /// The two directions are each other's inverse *through the layout*, which
    /// is the claim the feature actually makes: ask where line 3 printed, click
    /// there, and land back on line 3.
    ///
    /// Sweeping the page for a hit was the obvious test and the wrong one —
    /// every probe is a full layout, so it cost three minutes to learn what
    /// four layouts say here. It also asserted less: that *something* was
    /// clickable, rather than that a click means what it says.
    #[test]
    fn a_click_where_a_line_printed_lands_on_that_line() {
        let cfg = cfg();
        let body = "שורה ראשונה\n\nשורה שלישית";
        for line in [1usize, 3] {
            let at = from_cursor(body, &cfg, &Assets::default(), BodySpot { line, column: 1 });
            assert!(!at.is_empty(), "line {line} printed nowhere");
            let p = at[0];
            // The point names the glyph's *baseline* origin, not its middle:
            // `typst_ide::find_in_frame` returns the frame position of the text
            // item with the glyph advances added on, and a baseline has no ink
            // on it. The letter is above and to the right of that point, so a
            // click delivered exactly on it lands on nothing. Nudge up into the
            // body of the letter — a few points is well inside one at any
            // readable size — and try a couple of heights, because how far up
            // the ink starts is the font's business, not this test's.
            let hit = [(1.0, -3.0), (2.0, -5.0), (1.0, -7.0), (3.0, -4.0)]
                .into_iter()
                .find_map(|(dx, dy)| {
                    to_source(
                        body,
                        &cfg,
                        &Assets::default(),
                        PagePoint { page: p.page, x_pt: p.x_pt + dx, y_pt: p.y_pt + dy },
                    )
                });
            assert_eq!(
                hit.map(|s| s.line),
                Some(line),
                "clicking where line {line} printed ({p:?}) did not land on line {line}"
            );
        }
    }

    /// A click on the page's own furniture is not a place to go. The margin is
    /// the easy case; in this document shape the hard ones are the running head
    /// and the note-band rules, all of which the prelude generated and none of
    /// which the writer typed.
    #[test]
    fn a_click_on_the_margin_goes_nowhere() {
        let cfg = cfg();
        let at = PagePoint { page: 0, x_pt: 2.0, y_pt: 2.0 };
        assert_eq!(to_source("שורה ראשונה", &cfg, &Assets::default(), at), None);
    }

    /// And the other direction: the cursor on line 3 is somewhere on page 1,
    /// below where the cursor on line 1 is.
    #[test]
    fn cursor_finds_its_place_on_the_page() {
        let cfg = cfg();
        let body = "שורה ראשונה\n\nשורה שלישית";
        let first = from_cursor(body, &cfg, &Assets::default(), BodySpot { line: 1, column: 1 });
        let third = from_cursor(body, &cfg, &Assets::default(), BodySpot { line: 3, column: 1 });
        assert!(!first.is_empty() && !third.is_empty(), "{first:?} {third:?}");
        assert_eq!(first[0].page, 0);
        assert_eq!(third[0].page, 0);
        assert!(
            third[0].y_pt > first[0].y_pt,
            "line 3 should sit below line 1: {first:?} vs {third:?}"
        );
    }

    /// A document that does not compile has no page to click on, and the answer
    /// is nothing rather than a panic — this is asked for mid-keystroke.
    #[test]
    fn a_broken_document_answers_nothing() {
        let cfg = cfg();
        let at = PagePoint { page: 0, x_pt: 100.0, y_pt: 100.0 };
        assert_eq!(to_source("#אין_פקודה_כזו[", &cfg, &Assets::default(), at), None);
        assert!(from_cursor("#אין_פקודה_כזו[", &cfg, &Assets::default(), BodySpot { line: 1, column: 1 }).is_empty());
    }

    /// The wire shape, both ways, including what a request nobody can read gets.
    #[test]
    fn the_wire_answers_in_shape() {
        let ask = serde_json::json!({ "body": "שלום עולם", "page": 0, "x_pt": 100.0, "y_pt": 100.0 });
        let out: serde_json::Value = serde_json::from_str(&jump_request(&ask.to_string())).unwrap();
        assert!(out.is_object());

        let ask = serde_json::json!({ "body": "שלום עולם", "line": 1, "column": 1 });
        let out: serde_json::Value = serde_json::from_str(&reveal_request(&ask.to_string())).unwrap();
        assert!(out["points"].is_array());

        assert_eq!(jump_request("not json"), "{}");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&reveal_request("not json")).unwrap()["points"]
                .as_array()
                .map(|a| a.len()),
            Some(0)
        );
    }
}

//! A stream in the **page body** — beside the text, not under it (#79).
//!
//! # What was asked, and what the measurement answered
//!
//! Streams lived in the page foot: an apparatus rebuilt on every page from the
//! notes anchored on it, fitted into whatever the page had left. That works, and
//! it is the wrong shape for a Vilna page — Rashi in the inner column, Tosafot in
//! the outer, each resuming **in the same place** on the following page. The
//! issue asked whether a stream could occupy the body instead, and warned that
//! the obvious objection was cost: *"N streams is N layouts, and the editor is
//! 59ms from a keystroke."*
//!
//! Measured on identical words, the premise runs the other way: **the body shape
//! is the cheaper one**, by ~4.7×. The cost is not the layout count, it is the
//! notes apparatus — a foot region rebuilt per page, numbering, anchoring. A band
//! has none of those. So the objection to the body shape was cost, and the
//! measurement removed it.
//!
//! # Why a band is a second layout rather than a second region
//!
//! Typst 0.15 has no `Flow` element. `#grid(rows: 2)` and `#cols(n)` were both
//! measured (#77): they are one flow filling regions in order, and the second
//! band does not resume in the second band on the next page. A column that keeps
//! itself across a page boundary therefore cannot be a region of one document —
//! it has to be a document of its own, zipped onto the sheet by index. Which is
//! what makes the answer *simple*: nothing threads anything, so nothing can
//! thread it wrongly. Each flow continues in the same position on the next page
//! because each flow **is** a position.
//!
//! # The moves, in order
//!
//! 1. Read the writer's declaration off the parse tree — `#ערוץ("x", מיקום:
//!    "גוף", רוחב: 30%)`. Readable *before* anything is laid out, which is what
//!    makes the rest possible: the page has to be divided before the body fills
//!    it, not after.
//! 2. Lay the body out on a page the bands are already taken out of, so the text
//!    keeps the sheet's own margins and its pagination stays a function of the
//!    text alone.
//! 3. Lay each band out on its own page, at its own width, with no furniture — a
//!    band that printed its own folio would print it over the body's.
//! 4. Composite: page `i` of the body beside page `i` of every band, on one
//!    sheet, and hand the whole thing back as one document so the preview, the
//!    PDF and every query answer about the sheet a reader is looking at.
//!
//! # The three questions the issue left open, and which way each went
//!
//! - **How much width is the band?** `רוחב:` — a length or a share of the text
//!   area the sheet would have had without it. A body placement with no width is
//!   refused: a band that said nothing would leave no room for itself.
//! - **What happens when a stream runs out before the text does?** The band is
//!   absent on those sheets, and the body's pagination is untouched.
//! - **And when the band outlasts the text?** The sheet count is the larger of
//!   the two and the trailing sheets carry the band alone. Dropping the band's
//!   pages would lose a writer's text to silence, which is the fault this
//!   repository is named for.

use typst::diag::Warned;
use typst::layout::{Abs, Frame, Point, Size};
use typst::model::DocumentInfo;
use typst::syntax::{LinkedNode, SyntaxKind};
use typst_layout::{Page, PagedDocument};

use crate::{Assets, Diagnostic, DocConfig};

/// One band: the channel it holds, and how wide it is.
pub struct Band {
    /// The channel whose entries are the band's content.
    pub name: String,
    /// A share of the text area, when the width was written as a percentage.
    pub share: Option<f64>,
    /// An absolute width in centimetres, when it was written as a length.
    pub width_cm: f64,
}

/// The command names a channel declaration may take, in both spellings.
const CHANNEL_CALLS: [&str; 2] = ["ערוץ", "channel"];
/// The placements that put a channel in the body, in both spellings.
const BODY_PLACEMENTS: [&str; 2] = ["גוף", "body"];

/// Every channel the document places in the page body, in declaration order.
///
/// Read off the **parse tree**, for the reason `find_writer_masmer` gives: a text
/// scan mistakes a commented-out line, a string and a raw block for the writer
/// asking for something, and each of those three has been a bug here. One refactor
/// that is the writer's own brackets, or a note *about* a body stream, cannot
/// register.
pub fn bands_in(body: &str) -> Result<Vec<Band>, Vec<Diagnostic>> {
    let tree = typst::syntax::parse(body);
    let mut bands: Vec<Band> = Vec::new();
    let mut refused: Vec<Diagnostic> = Vec::new();
    walk(&LinkedNode::new(&tree), &mut bands, &mut refused);
    if refused.is_empty() {
        Ok(bands)
    } else {
        Err(refused)
    }
}

fn walk(node: &LinkedNode, bands: &mut Vec<Band>, refused: &mut Vec<Diagnostic>) {
    if node.kind() == SyntaxKind::FuncCall {
        let mut kids = node.children().filter(|c| !c.kind().is_trivia());
        if let Some(head) = kids.next() {
            if head.kind() == SyntaxKind::Ident
                && CHANNEL_CALLS.contains(&head.get().leaf_text().as_str())
            {
                if let Some(args) = kids.next() {
                    if args.kind() == SyntaxKind::Args {
                        read_declaration(args, bands, refused);
                    }
                }
            }
        }
    }
    for child in node.children() {
        walk(&child, bands, refused);
    }
}

/// One `#ערוץ(…)` argument list, read for a body placement and its width.
///
/// The channel's name is the first **positional** argument, so it is read from
/// the argument that is not a `Named` child — which is also why `מיקום: "גוף"`
/// cannot be mistaken for the name it sits beside.
fn read_declaration(args: LinkedNode, bands: &mut Vec<Band>, refused: &mut Vec<Diagnostic>) {
    let mut name: Option<String> = None;
    let mut placement: Option<String> = None;
    let mut width: Option<String> = None;
    for arg in args.children().filter(|c| !c.kind().is_trivia()) {
        if arg.kind() == SyntaxKind::Named {
            let parts: Vec<_> = arg.children().filter(|c| !c.kind().is_trivia()).collect();
            if parts.len() < 3 || parts[0].kind() != SyntaxKind::Ident {
                continue;
            }
            let key = parts[0].get().leaf_text().to_string();
            // The value is the **third** child: `Named` holds Ident, Colon,
            // value. Reading the second reads the colon — which is what the
            // first version of this did, and a placement of ":" matches no
            // placement, so the whole declaration was skipped in silence.
            let value = parts[2].get().leaf_text().to_string();
            match key.as_str() {
                "מיקום" | "placement" => placement = Some(unquote(&value)),
                "רוחב" | "width" => width = Some(value),
                _ => {}
            }
        } else if name.is_none() {
            // The first positional argument is the channel's name, and it is
            // written quoted — so anything else is not one. The delimiters of
            // the argument list are children too, and taking the first child
            // blindly would read `(` as the channel's name and quietly drop the
            // declaration: which is what this branch did until it was watched.
            if arg.kind() == SyntaxKind::Str {
                name = Some(unquote(arg.get().leaf_text()));
            }
        }
    }
    let (Some(name), Some(placement)) = (name, placement) else {
        return;
    };
    if !BODY_PLACEMENTS.contains(&placement.as_str()) {
        return;
    }
    match width.as_deref() {
        Some(w) => match parse_width(w) {
            Some((share, width_cm)) => bands.push(Band {
                name,
                share,
                width_cm,
            }),
            // Refused rather than defaulted: a band whose width cannot be read
            // would either take a share nobody asked for or leave the body
            // narrower than it needs to be. Both are the engine un-choosing.
            None => refused.push(Diagnostic::ours(
                "error",
                format!(
                    "ערוץ(\"{name}\", מיקום: \"גוף\") · רוחב · the body stream \"{name}\" says how \
                     wide its band is, and \"{w}\" is neither a length nor a share: try 30% or 6cm."
                ),
            )),
        },
        None => refused.push(Diagnostic::ours(
            "error",
            format!(
                "ערוץ(\"{name}\", מיקום: \"גוף\") · רוחב · the body stream \"{name}\" has no width. \
                 The engine takes it off the page before it lays the body out, so a band that \
                 said nothing would leave no room for itself: try רוחב: 30%."
            ),
        )),
    }
}

/// A width as `(share, centimetres)` — exactly one of the two is set.
///
/// `cm`, `mm` and `pt` are honoured, which is every unit a page dimension is
/// written in. Anything else is `None`, and `None` is a refusal.
fn parse_width(value: &str) -> Option<(Option<f64>, f64)> {
    let v = value.trim();
    if let Some(pct) = v.strip_suffix('%') {
        return pct
            .trim()
            .parse::<f64>()
            .ok()
            .map(|p| (Some(p / 100.0), 0.0));
    }
    for (unit, factor) in [("cm", 1.0), ("mm", 0.1), ("pt", 2.54 / 72.0)] {
        if let Some(n) = v.strip_suffix(unit) {
            return n.trim().parse::<f64>().ok().map(|x| (None, x * factor));
        }
    }
    None
}

fn unquote(value: &str) -> String {
    value
        .trim()
        .trim_matches(|c| c == '"' || c == '\u{201c}' || c == '\u{201d}')
        .to_string()
}

/// Lay the document out with its body streams composited beside the text.
///
/// Every compile goes through here, so a document with no body stream pays one
/// parse of its own source — the same one `unknown_destinations` already walked —
/// and nothing else.
pub fn compose(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
    doc: PagedDocument,
) -> Result<PagedDocument, Vec<Diagnostic>> {
    let declared = bands_in(body)?;
    if declared.is_empty() {
        return Ok(doc);
    }
    let (sheet_w, sheet_h) = crate::sheet_cm_of(cfg);
    let m = cfg.margin_cm;
    // The writing width the sheet would have had with no bands: the paper less
    // the two side margins. `רוחב` is a share of **this**, so a sefer that set
    // generous margins keeps them and a band is carved out of the writing width
    // rather than out of the margin.
    let text_area = sheet_w - 2.0 * m;
    if text_area <= 0.0 {
        return Err(vec![Diagnostic::ours(
            "error",
            format!(
                "ערוץ(מיקום: \"גוף\") · רוחב · a {sheet_w:.1}cm sheet with {m:.1}cm margins \
                 leaves no writing width for a body stream to sit beside."
            ),
        )]);
    }

    // Each band's **text** width, in the order the writer declared them: the
    // first declared is the one beside the text.
    let widths: Vec<f64> = declared
        .iter()
        .map(|b| b.share.map(|s| s * text_area).unwrap_or(b.width_cm))
        .collect();
    let named: Vec<String> = declared.into_iter().map(|b| b.name).collect();
    // A band's page is its text plus **one** margin — the outer one — because a
    // band is laid out as a page in its own right and a page has margins. The
    // margin toward the body is zero: the gutter there is the body's own inner
    // margin, which is the same margin, and paying it twice would make the
    // commentary column narrower than the writer asked for by exactly the margin
    // they did not ask about.
    //
    // Measured, and the reason this is a page and not a region: the first
    // version gave the band the document's margins on both sides, and a 30% band
    // on an A4 sefer is 4.8cm — less than the two 2.5cm margins — so the band's
    // text area was **negative** and Typst panicked with *bounded inline layout
    // is incomplete*. A band narrower than its own margins is a shape that has to
    // be impossible to construct, not merely unlikely to be asked for.
    let pages: Vec<f64> = widths.iter().map(|b| b + m).collect();
    let total: f64 = pages.iter().sum();
    if total >= text_area {
        return Err(vec![Diagnostic::ours(
            "error",
            format!(
                "ערוץ(מיקום: \"גוף\") · רוחב · the body streams ask for {total:.1}cm of a \
                 {text_area:.1}cm text area, margins included. A band beside the text has to \
                 leave the text somewhere to be: lower the widths, or use fewer streams."
            ),
        )]);
    }

    // The body, on a page the bands are already taken out of. Everything else is
    // untouched, so the text's own pagination is a function of the text.
    //
    // Through `layout_document` rather than `compile_doc_with`, which is the
    // recursion guard: the body's declaration is still in the body, so the
    // public path would compose a band onto a band until the stack ran out —
    // which is exactly what it did the first time this was written.
    let body_cfg = DocConfig {
        page_width_cm: Some(sheet_w - total),
        page_height_cm: Some(sheet_h),
        ..cfg.clone()
    };
    let body_doc = crate::layout_document(body, &body_cfg, assets)?;

    // Each band, on its own page, at its own width, with no furniture of its
    // own. Laid out in declaration order, so the stream a writer declared first
    // is the one beside the text.
    let mut band_docs: Vec<(f64, PagedDocument)> = Vec::new();
    for (name, page_w) in named.iter().zip(&pages) {
        let band_cfg = DocConfig {
            page_width_cm: Some(*page_w),
            page_height_cm: Some(sheet_h),
            // One column: `טורים` is a property of the text, and a band that
            // split itself would be two bands nobody asked for.
            columns: 1,
            // The band's own margins: the outer one is the document's, the inner
            // one is nothing. See the note on `pages` above.
            margin_inner_cm: Some(0.0),
            margin_outer_cm: Some(m),
            // No running heads, no folio, no title, no author. A band is a column
            // of commentary, not a document. An empty string is how this engine
            // says "nothing here" to the wrapper — `typst_str_or_none` turns it
            // into the `none` the prelude reads — and the single-sided pair has
            // to go too, because the per-edge ones fall back to it.
            header: String::new(),
            footer: String::new(),
            header_even: String::new(),
            header_odd: String::new(),
            footer_even: String::new(),
            footer_odd: String::new(),
            title: String::new(),
            author: String::new(),
            keywords: Vec::new(),
            numbering: false,
            two_sided: false,
            separate_volume: false,
            ..cfg.clone()
        };
        band_docs.push((*page_w, compile_band(body, &band_cfg, assets, name)?));
    }

    Ok(composite(body_doc, band_docs, sheet_w, sheet_h, cfg))
}

/// A band's document: the same source, with the body hidden and the channel
/// rendered where it would have been.
///
/// One line, and it is why this feature is small. `זרם_גוף` on `#מסמך` makes the
/// wrapper lay the body out and hide it — the same move `כרך_נפרד` makes for a
/// volume of its own, and for the same reason: the notes register either way —
/// and then render the channel's entries. So the band is *the same document* read
/// a second time, and its numbering is the body's numbering by construction
/// rather than by a fence.
///
/// It is laid out through [`crate::layout_source`] rather than through
/// `compile_doc_with`, which is the recursion guard: a band declares no bands.
fn compile_band(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
    name: &str,
) -> Result<PagedDocument, Vec<Diagnostic>> {
    let source = crate::main_source_with(body, cfg, Some(name));
    let Warned { output, warnings } = crate::layout_source(source.clone(), assets);
    match output {
        Ok(doc) => Ok(doc),
        Err(err) => {
            // A band that does not compile fails the document, exactly as a
            // `#כלול` that does not: the writer's text is the same text in both,
            // and a band that half-worked would be a page with a hole in it.
            use typst_as_lib::TypstAsLibError::*;
            let located = crate::Located::of(&source, body);
            let mut diagnostics = located.all(&warnings, "warning");
            match err {
                TypstSource(diags) => diagnostics.extend(located.all(&diags, "error")),
                other => diagnostics.push(Diagnostic::ours("error", other.to_string())),
            }
            Err(diagnostics)
        }
    }
}

/// Page `i` of the body beside page `i` of every band, on one sheet.
///
/// The body keeps the **start** edge — the right of a right-to-left page, where a
/// reader looks first — and the bands run out from it in declaration order.
fn composite(
    body: PagedDocument,
    bands: Vec<(f64, PagedDocument)>,
    sheet_w: f64,
    sheet_h: f64,
    cfg: &DocConfig,
) -> PagedDocument {
    let rtl = cfg.dir != "ltr";
    let total: f64 = bands.iter().map(|(w, _)| w).sum();
    let sheets = body.pages().len().max(
        bands
            .iter()
            .map(|(_, d)| d.pages().len())
            .max()
            .unwrap_or(0),
    );
    let sheet = Size::new(Abs::cm(sheet_w), Abs::cm(sheet_h));

    let mut pages: Vec<Page> = Vec::with_capacity(sheets);
    for i in 0..sheets {
        let mut frame = Frame::soft(sheet);
        // The bands first, then the body over them. Nothing overlaps in a
        // well-formed document, and the order that matters is the one that keeps
        // the body's own paint last.
        //
        // Each band's page is placed by its distance from the **outer** edge,
        // counting inward through the bands declared *after* it — so the first
        // band a writer declared is the one beside the text and the last is the
        // outermost. In a right-to-left document the outer edge is the left, so
        // the offsets run right to left; in a left-to-right one, the mirror.
        //
        // That order is a reading order, not an arrangement: the stream a writer
        // declared first is the one their eye finds beside the text, which is
        // the only ordering a reader of a Vilna page would accept. An inner
        // loop that accumulated the offsets as it went placed the first band
        // outermost instead, and the test that names this caught it.
        let mut inner = total;
        for (width, doc) in &bands {
            inner -= *width;
            if let Some(page) = doc.pages().get(i) {
                let x = if rtl { inner } else { sheet_w - inner - *width };
                frame.push_frame(Point::new(Abs::cm(x), Abs::zero()), page.frame.clone());
            }
        }
        if let Some(page) = body.pages().get(i) {
            let x = if rtl { total } else { 0.0 };
            frame.push_frame(Point::new(Abs::cm(x), Abs::zero()), page.frame.clone());
        }
        // The sheet is the body's own page with the frame replaced, so the fill,
        // the bleed and everything else the body said about its paper still
        // holds. A sheet past the body's end takes its shape from a band.
        let mut page = body
            .pages()
            .get(i)
            .cloned()
            .or_else(|| {
                bands
                    .iter()
                    .find_map(|(_, d)| d.pages().get(i))
                    .cloned()
                    .map(|mut p| {
                        p.frame = Frame::soft(sheet);
                        p
                    })
            })
            .expect("the sheet count is at least one document's page count");
        page.frame = frame;
        page.number = (i + 1) as u64;
        pages.push(page);
    }

    // The introspector is rebuilt from the pages, so a query against the
    // composited document sees both columns — which is what makes the folio, the
    // references and the page text answer about the sheet a reader is looking at
    // rather than about the half of it that came from the body.
    let mut body = body;
    let info: DocumentInfo = std::mem::take(&mut *body.info_mut());
    PagedDocument::new(pages.into(), info)
}

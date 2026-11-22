//! The compile pipeline: a Typst world, a layout, and the pages written from it.
//!
//! # Why this is a module of its own
//!
//! The third of the three concerns `#222` found in one 6,231-line file, and the
//! one the measurements are about: `#218`'s compile curve and `#219`'s per-pane
//! costs are both this module's territory. It is the only place a
//! `TypstEngine` is built, the only place a document is laid out, and the only
//! place a page becomes a string.
//!
//! It sat two thousand lines away from the prelude it feeds and from the wire that
//! asks it questions, with nothing keeping them apart — which is how a `Typst`
//! value ended up cached in a way nobody could see from the request side.
//!
//! # The shape of a compile, read downwards
//!
//! 1. `engine_for` builds the world: the assembled source, the request's images,
//!    the bundled and user fonts, the package resolvers.
//! 2. `layout_source` runs it; `layout_plain` runs it with no Ksav assembly at all,
//!    which is what proves an exported `.typ` is self-contained.
//! 3. `compile_parts` decides what is *carried back* — the SVGs through
//!    `pagesvg`, the PDF when asked, the line and marker tables when asked.
//! 4. `Compiled` is that answer. `Wants` is what the caller said it wanted, and the
//!    module comment on each field says what it costs to answer.
//!
//! Nothing here reads or writes JSON: that is `wire.rs`.

use typst::diag::Warned;
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;

use crate::assets::{self, Assets};
use crate::diagnostics::{Diagnostic, Located};
use crate::geometry::{auto_notes_region_cm_sheet, channel_declarations, sheet_height_cm};
use crate::lang::commands::{
    bundled_italic_families, calls_with_name, families_with_italic, first_italic,
};
use crate::lang::prelude::{
    assemble_source, grow_inline_reserve, inline_reserve_cm, main_source, package_resolvers,
    prelude_source,
};
use crate::{
    bodystream, named_arg, notemarks, page_ranges_for_export, pagelines, pagesvg, pagetext, parse,
    parse_page_spec, refusal_diagnostic, spec_refusal_diagnostic, spec_refusals_of, DocConfig,
    CHANNEL_ARG, CHANNEL_DECL, FONT_CASCADIA, FONT_DAVID_BOLD, FONT_DAVID_REG, FONT_FRANK_BOLD,
    FONT_FRANK_REG, FONT_NEWCM_MATH, REGION_ARG, REGION_DECL, TIER_CHANNELS,
};

/// Result of a compile pass.
#[derive(Debug, Default)]
pub struct Compiled {
    /// Whether the document laid out at all.
    ///
    /// An explicit flag, not `pdf.is_some()`: previews no longer render a PDF,
    /// and inferring success from a artefact the caller asked us not to produce
    /// would report every successful preview as a failure.
    pub ok: bool,
    /// PDF bytes for export (None if compilation failed or none was asked for).
    pub pdf: Option<Vec<u8>>,
    /// One SVG string per page, for the live preview.
    pub pages_svg: Vec<String>,
    /// One fingerprint per page, in page order.
    ///
    /// Computed from the laid-out page rather than from its SVG, which is what
    /// lets a page the caller already holds be skipped *before* it is
    /// serialised. An entry in `pages_svg` is the empty string exactly when its
    /// fingerprint was in the caller's `have` set.
    pub pages_hash: Vec<String>,
    /// Errors and warnings from the real Typst compiler.
    pub diagnostics: Vec<Diagnostic>,
    /// The full assembled Typst source (prelude + wrapper + body) — the
    /// "export to plain Typst" output.
    ///
    /// Empty unless it was asked for. It is the prelude plus the document, so it
    /// is never smaller than 75 KB, and it used to ride on every keystroke-driven
    /// preview: of an 84 KB response for a one-page document, 75 KB was this and
    /// 4 KB was the page. Exactly one caller reads it — "export .typ" — and that
    /// one compiles for itself. Same story as `pdf`, same answer.
    pub typst_source: String,
    /// Which of the writer's lines printed on each page, in page order.
    ///
    /// Empty unless [`Wants::lines`] asked for it. See [`crate::pagelines`] for
    /// what a run is and why a page reports several of them.
    pub pages_lines: Vec<Vec<pagelines::LineRun>>,
    /// What each page says, in reading order, in page order.
    ///
    /// Empty unless [`Wants::text`] asked for it. See [`crate::pagetext`] for
    /// how a line is assembled and why the walk order is the reading order.
    pub pages_text: Vec<Vec<pagetext::PageLine>>,
    /// Every marker the layout printed, paired with the prose beside it.
    ///
    /// Empty unless [`Wants::markers`] asked for it. Not a list of notes and not
    /// in note order — see [`crate::notemarks`] for what the caller still has to
    /// do with it.
    pub note_markers: Vec<notemarks::NoteMarker>,
}

/// What a compile should carry back, as opposed to what it compiles.
///
/// Three flags that were three positional booleans, which is one more than a
/// reader can hold: `compile_parts(body, &cfg, &assets, false, false, &have)`
/// says nothing about which `false` is the PDF. None of these changes what is
/// laid out — every one of them is about a part of the answer that costs real
/// time to produce and that most callers throw away.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Wants {
    /// The PDF bytes. Around 300 KB per keystroke-driven compile of a 16-page
    /// document, never read by a preview.
    pub pdf: bool,
    /// The assembled Typst source: the prelude plus the document, so never
    /// smaller than 75 KB. One caller, and it compiles for itself.
    pub source: bool,
    /// Which lines printed on which page. One walk over the laid-out frames and
    /// one re-parse of the main source; read only by a narrowed preview.
    pub lines: bool,
    /// What each note's marker printed as. The same walk and the same re-parse
    /// as `lines`, and read only by the notes drawer while it is open.
    pub markers: bool,
    /// What each page printed. The same walk and the same re-parse as `lines`,
    /// and read only by a search that has been told to look at the preview.
    pub text: bool,
}

impl Wants {
    /// What an export asks for: the bytes and the Typst behind them.
    ///
    /// Not "everything". `lines` is off here on purpose — an export produces a
    /// file, and which of the writer's lines landed on which page is a question
    /// only a pane on a screen has.
    pub fn export() -> Self {
        Self {
            pdf: true,
            source: true,
            lines: false,
            markers: false,
            // An export produces a file. What the pages *say* is a question
            // only a search on a screen has, for the same reason `lines` is
            // off here.
            text: false,
        }
    }
}

impl Compiled {
    pub fn ok(&self) -> bool {
        self.ok
    }
}

/// The compiler, configured for one main source and the request's assets.
///
/// The document has no file system to read from, so its images arrive as bytes on
/// the request and are registered under the names the document uses. User fonts
/// arrive the same way and join the bundled ones.
///
/// Separate from [`layout_source`] because two callers want the same engine and
/// only one of them wants the laid-out pages on their own: `jump.rs` needs the
/// [`typst::World`] the layout was produced *against*, because that is what turns
/// a span back into a place in a file. Building the engine twice from the same
/// text would answer with two worlds whose spans do not mean the same thing.
pub(crate) fn engine_for(
    source: String,
    assets: &Assets,
) -> typst_as_lib::TypstEngine<typst_as_lib::TypstTemplateMainFile> {
    let mut fonts = bundled_fonts();
    fonts.extend(assets.fonts.iter().map(|f| f.bytes.as_slice()));
    // **Checked here as well as at the reader**, and the reason is that
    // `compile_with` is `pub`. A request and a `.ksav` are both gated on the way
    // in, but a library caller can hand `Assets` straight to this — and
    // `typst-as-lib` builds a `VirtualPath` from each name and `.expect()`s it,
    // so a name with `..` in it is a **panic**, not a refused compile. A compile
    // panic is answered by `run_bounded` in `server.rs` now — a net, not a reason
    // to rely on one.
    //
    // So the two gates answer two different questions and neither substitutes for
    // the other: the reader's gate is what lets a *writer* be told their file was
    // refused, and this one is what makes the panic unreachable at all.
    let files: Vec<(&str, &[u8])> = assets
        .files
        .iter()
        .filter(|a| assets::diagnose_name(&a.name).is_none())
        .map(|a| (a.name.as_str(), a.bytes.as_slice()))
        .collect();
    // A font is not resolved by name — it is handed to the shaper as bytes — so
    // the gate does not apply to one, and `..` in a font's name is not a panic.
    let mut builder = TypstEngine::builder()
        .main_file(source)
        .fonts(fonts)
        // The prelude, as a file the document imports. `Source` is `Arc`-backed,
        // so this is a pointer copy into a one-entry map — the 111 KB parse
        // behind it happened at the first compile of the process and will not
        // happen again. See `prelude_source`.
        .with_static_source_file_resolver([prelude_source().clone()])
        .with_static_file_resolver(files);
    // Bundled packages, off disk. Last in the chain, so nothing a document
    // carries with it can be shadowed by one. A `@local` root, if the shell set
    // one at startup, is a second resolver after it — see `package_resolvers`,
    // which is where the confinement argument lives.
    for resolver in package_resolvers() {
        builder = builder.add_file_resolver(resolver);
    }
    // Keep Typst's memoization cache alive across compiles instead of throwing it
    // away after each one. `typst-as-lib` defaults `comemo_evict_max_age` to
    // `Some(0)` — evict everything immediately — which is exactly the opposite of
    // what makes `typst-cli --watch` feel live: font loading, glyph shaping and
    // the layout of unchanged regions all get recomputed from scratch on every
    // keystroke. A non-zero age lets those survive, so an edit pays mainly for
    // what actually changed. The main source keeps a stable (detached) FileId
    // across compiles, so the cache can match against it. `10` is the value
    // `--watch` uses: old enough to span a burst of edits, young enough that a
    // long-idle document's cache is eventually reclaimed.
    builder.comemo_evict_max_age(Some(10));
    builder.build()
}

/// The six faces every Ksav document is typeset with.
///
/// One list, because there are two engines now: the one a compile uses, which
/// resolves the prelude as a file, and the bare one `probe::layout_plain` builds
/// to check that an exported `.typ` really is self-contained. The difference
/// between those two engines is the thing under test, so the fonts had better
/// not be a second difference.
/// References that point at an anchor the document has not got.
///
/// # What this is really about
///
/// `#סמן` and `#הפניה` are the two commands in the Reference category, and the
/// margin note says neither renders. Half of that is a misreading and half is
/// this application's fault, which is worth separating.
///
/// `#סמן` renders nothing **because it is an anchor**: it marks a place so that
/// something else can point at it. There is nothing for it to draw, and there
/// never was.
///
/// `#הפניה` does render — it prints the anchor's number. Unless the anchor is
/// not there, in which case the prelude prints `?`, which is the only thing the
/// writer ever sees and says nothing about why. Insert the pair from the
/// toolbar, whose templates are `#סמן("|")` and `#הפניה("|")` with the caret
/// inside an empty string, and you get an anchor named "" and a reference to
/// "" — so the writer meets a bare `?` and a command that appears to do nothing.
///
/// So the question is asked of the whole document at compile time, where both
/// halves are visible, and the answer names the name.
pub(crate) fn dangling_references(root: &typst::syntax::SyntaxNode, body: &str) -> Vec<Diagnostic> {
    let anchors: std::collections::BTreeSet<String> = calls_with_name(root, &["סמן", "anchor"])
        .into_iter()
        .map(|(name, _)| name)
        .collect();
    calls_with_name(root, &["הפניה", "xref"])
        .into_iter()
        .filter(|(name, _)| !anchors.contains(name))
        .map(|(name, at)| {
            let (line, column) = line_column(body, at);
            let mut said = Diagnostic::ours(
                "warning",
                format!(
                    concat!(
                        "אין במסמך סמן בשם {name} — הוסיפו #סמן({name}) במקום שאליו ההפניה מכוונת, ",
                        "או תקנו את האיות · ",
                        "no anchor named {name} in this document — add #anchor({name}) ",
                        "where the reference points, or fix the spelling"
                    ),
                    name = format!("{name:?}"),
                ),
            );
            said.line = Some(line);
            said.column = Some(column);
            said.about = Some("#הפניה".to_string());
            said
        })
        .collect()
}

/// Notes sent to a destination this document never declared.
///
/// # What this is really about
///
/// A note written `#הערה(אזור: "טיפים")` in a document that declares no such
/// region is not an error and not a crash: the note is drawn, in the default
/// apparatus at the foot of the page, numbered, queryable, and perfectly legible.
/// Measured on the 2026-09-27 probe — a typo'd region name lands at y=712.5 on
/// an 841.89 pt sheet, indistinguishable from the note having been filed
/// correctly.
///
/// That is the problem. The writer asked for a named place and got the page foot
/// with no word, and the two are not the same document: their note is in the wrong
/// apparatus, it is not where the reader will look for it, and the region's own
/// height, placement and overflow policy — the whole point of naming it — are not
/// applied to it. The 23 August audit called this the same defect class as its B1,
/// the mixed-`ערוץ:`-and-`אזור:` case where a note was filed under one key and
/// filtered under another and the writer's text appeared on no page at all. B1
/// lost the text; this one keeps the text and loses the destination, which is the
/// quieter half of the same bug.
///
/// A **warning**, on the reasoning `italic_warning` already states and for the
/// same reason: the document compiles, the note is on the page, every other
/// command in it is fine, and a writer part-way through a sefer is entitled to
/// keep working. Refusing would take away working text over a typo in a word that
/// costs them nothing to keep. What must not happen is that they never find out.
///
/// The seven tier channels are the built-in balanced series and reserve nothing,
/// so they are legal undeclared; the rest must be declared by `#ערוץ(…)` or
/// `#אזור(…)`. When a document declares none at all, the message says so rather
/// than listing an empty set — the likeliest cause of a wrong name in a document
/// that declares nothing is a name copied from another document.
pub(crate) fn unknown_destinations(body: &str, shape: &parse::ApparatusShape) -> Vec<Diagnostic> {
    let channels = channel_declarations(body, shape, CHANNEL_DECL);
    let regions = channel_declarations(body, shape, REGION_DECL);
    // A document full of `#הערה(ערוץ: "הערה_ב")` is one writer's ordinary sefer,
    // and warning on it would be the noise that teaches people to skip this list.
    let declared = |name: &str| {
        channels.contains_key(name) || regions.contains_key(name) || TIER_CHANNELS.contains(&name)
    };
    let mut out: Vec<Diagnostic> = Vec::new();
    for call in &shape.calls {
        if !call.hash {
            continue;
        }
        // A `#ערוץ("c", אזור: "r")` *declaration* carries the same argument a note
        // does, and the declaration is what makes the name known.
        if CHANNEL_DECL.contains(&call.name.as_str()) || REGION_DECL.contains(&call.name.as_str()) {
            continue;
        }
        let Some((from, to)) = call.args else {
            continue;
        };
        let Some(name) =
            named_arg(&body[from..to], REGION_ARG).or(named_arg(&body[from..to], CHANNEL_ARG))
        else {
            continue;
        };
        if name.is_empty() || declared(&name) {
            continue;
        }
        // The command's own name, not the first argument: `from` is the byte
        // after the `(`, and the writer is looking for `#הערה`, not for the
        // argument that follows it.
        let at = from.saturating_sub(call.name.len() + 1);
        let (line, column) = line_column(body, at);
        let mut said = Diagnostic::ours(
            "warning",
            if channels.is_empty() && regions.is_empty() {
                format!(
                    concat!(
                        "אין במסמך אזור או ערוץ בשם {name} — ההערה נדפסה באותו מקום, אך לא באזור שביקשתם. ",
                        "הוסיפו #אזור({name}) או #ערוץ({name}) במסמך, או תקנו את האיות · ",
                        "no region or channel named {name} in this document — the note is printed, ",
                        "but not in the apparatus you asked for. Add #region({name}) or ",
                        "#channel({name}), or fix the spelling"
                    ),
                    name = format!("{name:?}"),
                )
            } else {
                let mut known: Vec<&str> = channels.keys().map(String::as_str).collect();
                known.extend(regions.keys().map(String::as_str));
                known.sort_unstable();
                format!(
                    concat!(
                        "אין במסמך אזור או ערוץ בשם {name} — יש: {known}. ",
                        "ההערה נדפסה באותו מקום, אך לא באזור שביקשתם · ",
                        "no region or channel named {name} in this document — declared here: {known}. ",
                        "The note is printed, but not in the apparatus you asked for"
                    ),
                    name = format!("{name:?}"),
                    known = known.join(", "),
                )
            },
        );
        said.line = Some(line);
        said.column = Some(column);
        said.about = Some(format!("#{}", call.name));
        out.push(said);
    }
    out
}

/// A byte offset in the body as a 1-based (line, column), counted in characters.
///
/// The same convention `Diagnostic` states: a Hebrew letter is two bytes and no
/// writer counts in bytes.
pub(crate) fn line_column(body: &str, offset: usize) -> (usize, usize) {
    let upto = &body[..offset.min(body.len())];
    let line = upto.matches('\n').count() + 1;
    let start = upto.rfind('\n').map_or(0, |i| i + 1);
    (
        line,
        body[start..offset.min(body.len())].chars().count() + 1,
    )
}

/// The warning a document earns by asking **Typst itself** for a face its font
/// has not got.
///
/// A warning and not an error: the document compiles, every other command in it
/// is fine, and a writer part-way through a sefer is entitled to keep working.
/// What must not happen is that they keep pressing a button which does nothing
/// and are never told.
///
/// The command named is the one the writer wrote — `#emph` or
/// `#text(style: "italic")` — and the fix it offers is `#נטוי`, which is this
/// prelude's own slant and does not need an italic face. See [`first_italic`]
/// for why the four prelude commands that ship an italic default are no longer
/// on the trigger list: they are served by `_ks_style` and the warning about
/// them was false (#176).
pub(crate) fn italic_warning(
    root: &typst::syntax::SyntaxNode,
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Option<Diagnostic> {
    let (at, command) = first_italic(root, body)?;
    // The bundled answer is cached; only fonts attached to this request are
    // read fresh, and there are usually none.
    let mut with_italic = bundled_italic_families().clone();
    let extra: Vec<&[u8]> = assets.fonts.iter().map(|f| f.bytes.as_slice()).collect();
    if !extra.is_empty() {
        with_italic.extend(families_with_italic(&extra));
    }
    if with_italic.contains(&cfg.font.to_lowercase()) {
        return None;
    }
    let (line, column) = line_column(body, at);
    let mut said = Diagnostic::ours(
        "warning",
        format!(
            concat!(
                "לגופן {font} אין גרסה נטויה, ולכן {cmd} משאיר את הטקסט זקוף. ",
                "השתמשו ב#נטוי, שמטה את הטקסט בכל גופן, או בחרו גופן שיש לו נטויה · ",
                "{font} has no italic face, so {cmd} leaves the text upright. ",
                "Use #נטוי, which slants the text in any font, or choose a font that has one",
            ),
            font = cfg.font,
            // The command the *writer* used. A warning that says `#נטוי` to
            // somebody who typed `#emph` is a warning about a command they
            // cannot find — and the two requests are not the same one: `#נטוי`
            // shears the frame, `#emph` asks the font.
            cmd = format!("#{command}"),
        ),
    );
    said.line = Some(line);
    said.column = Some(column);
    // The command it is about, so the diagnostics view can name it the way it
    // names every other one.
    said.about = Some(format!("#{command}"));
    Some(said)
}

pub(crate) fn bundled_fonts() -> Vec<&'static [u8]> {
    vec![
        FONT_FRANK_REG,
        FONT_FRANK_BOLD,
        FONT_DAVID_REG,
        FONT_DAVID_BOLD,
        FONT_CASCADIA,
        FONT_NEWCM_MATH,
    ]
}

/// A complete Typst document, laid out with **no Ksav assembly and no prelude
/// resolver** — the fonts and nothing else.
///
/// This exists for one question, and it is a question the split into
/// `main_source` and `assemble_source` created: **is what "export .typ" writes
/// actually a document?** The compiled arrangement imports `ksav.typ`, so it
/// would go on working perfectly if the exported one stopped being
/// self-contained — the failure would be invisible here and total for the writer
/// who took the file to a printer. An engine with no source resolver on it
/// cannot resolve an import, so an export that acquired one fails loudly.
pub(crate) fn layout_plain(source: &str) -> Result<PagedDocument, Vec<Diagnostic>> {
    layout_plain_with_files(source, &[])
}

/// [`layout_plain`], with sibling files the document may `#import`.
///
/// This is the *compact* export's arrangement, and it is the only way to check
/// that arrangement means anything: a document that imports `ksav.typ` compiles
/// here only if that file is really supplied, so a compact export whose prelude
/// was incomplete fails in this function rather than in somebody's Typst install.
pub(crate) fn layout_plain_with_files(
    source: &str,
    files: &[(&str, &str)],
) -> Result<PagedDocument, Vec<Diagnostic>> {
    use typst::syntax::{RootedPath, Source, VirtualPath, VirtualRoot};
    let sources: Vec<Source> = files
        .iter()
        .map(|(name, text)| {
            let vpath = VirtualPath::new(*name).expect("a valid virtual path");
            let id = RootedPath::new(VirtualRoot::Project, vpath).intern();
            Source::new(id, (*text).to_string())
        })
        .collect();
    let engine = TypstEngine::builder()
        .main_file(source.to_string())
        .with_static_source_file_resolver(sources)
        .fonts(bundled_fonts())
        .build();
    let Warned { output, warnings } = engine.compile::<PagedDocument>();
    match output {
        Ok(doc) => Ok(doc),
        Err(err) => {
            let located = Located::of(source, "");
            let mut diagnostics = located.all(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(located.all(&diags, "error")),
                other => diagnostics.push(Diagnostic::ours("error", other.to_string())),
            }
            Err(diagnostics)
        }
    }
}

/// Lay out a main source, with the request's assets available to it.
pub(crate) fn layout_source(
    source: String,
    assets: &Assets,
) -> Warned<Result<PagedDocument, typst_as_lib::TypstAsLibError>> {
    engine_for(source, assets).compile::<PagedDocument>()
}

/// Compile and lay out a document, returning the laid-out pages.
///
/// This is what `compile` uses internally; it is public so tests (and the render
/// probe) can inspect *where things actually landed on the page* rather than only
/// whether compilation succeeded.
pub fn compile_doc(body: &str, cfg: &DocConfig) -> Result<PagedDocument, Vec<Diagnostic>> {
    compile_doc_with(body, cfg, &Assets::default())
}

/// A sefer and its companion volume, as two documents from **one source**.
///
/// `NOTES-PLAN`'s `קובץ` destination is a volume of its own — a kuntres of
/// biurim bound behind a sefer, numbered separately from it — and the writer
/// chooses whether it is bound at the back or written out as its own file.
/// This is the second answer.
///
/// # Two compiles, and the boundary comes for free
///
/// The obvious shape is one compile split at the companion's first page, and
/// finding that page means asking the laid-out document where a marker landed.
/// There is a cheaper answer that needs no introspection at all: compile it
/// **once with the companion held out** and once with it bound in. The first is
/// the body file, and its page count *is* where the companion starts in the
/// second. Nothing has to be located, because the difference between the two
/// documents is exactly the thing being looked for.
///
/// It costs a second layout of the same source, and buys a boundary that cannot
/// be off by one.
///
/// # Why the companion is cut out of the bound document rather than rendered alone
///
/// A companion addressed by `ראש: ("עמוד", …)` cites **the sefer's** pages. Laid
/// out on its own, with the body hidden so its notes still register, every one
/// of those addresses would read page 1 — a volume whose whole purpose is to say
/// where in the sefer each entry belongs, saying it wrongly on every line. So
/// the companion is taken from the document that has the body in it, and the
/// addresses are the ones the reader can use.
///
/// Returns the full document and the 1-based page the companion starts on.
/// `None` for that page when the document has no companion volume — the two
/// compiles came out the same length, so there was nothing held out.
pub fn compile_companion(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<(PagedDocument, Option<usize>), Vec<Diagnostic>> {
    let held = DocConfig {
        separate_volume: true,
        ..cfg.clone()
    };
    let body_only = compile_doc_with(body, &held, assets)?;
    let bound = DocConfig {
        separate_volume: false,
        ..cfg.clone()
    };
    let whole = compile_doc_with(body, &bound, assets)?;
    let n = body_only.pages().len();
    let start = if whole.pages().len() > n {
        Some(n + 1)
    } else {
        None
    };
    Ok((whole, start))
}

/// `compile_doc`, with the request's images and fonts available to the document.
pub fn compile_doc_with(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<PagedDocument, Vec<Diagnostic>> {
    // A body stream (#79) turns one layout into three: the body on a page the
    // bands are already taken out of, and each band on its own page. The
    // composition lives **outside** the layout, because the band compiles the
    // same source — so a composition inside it would compose a band onto a band
    // until the stack ran out, which is exactly what it did the first time.
    match layout_document(body, cfg, assets) {
        Ok(doc) => bodystream::compose(body, cfg, assets, doc),
        Err(diags) => Err(diags),
    }
}

/// Lay the document out, with no page-body band composed onto it.
///
/// The band's own body compile and the narrowed body it is composed beside both
/// go through here rather than through `compile_doc_with`, and that is the whole
/// reason this is two functions.
pub(crate) fn layout_document(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<PagedDocument, Vec<Diagnostic>> {
    // **The shape, before the work** (#213). Typst's markup parse is
    // superquadratic in bracket characters, and nothing used to bound how much
    // of it a single request could ask for: a 166 KB body of stray `]` held a
    // compile slot for two minutes and emitted one diagnostic per bracket. The
    // scan is linear and answers in microseconds, so it costs a real document
    // nothing — and it runs before assembly, before the world is built and
    // before the reserve arithmetic, which are all work a refused body should
    // not pay for either.
    if let Some(refused) = crate::shape::refusal(body) {
        return Err(vec![refused]);
    }

    // The too-small switch's "refuse": a writer-fixed reserve smaller than its
    // foot regions' declared heights, where flowing cannot help because every
    // page is equally short. Both numbers, then stop - the one answer that can
    // never lose a reader's text to silence. The writer's number may have
    // arrived through configuration or *inline in the body*, which overrides
    // the wrapper; a policy that read only the configured value would silently
    // set precisely when the writer spoke in the document instead. Found by
    // the stress sitting of 25 August: `refuse` over an inline 1cm reserve
    // under a six-line region compiled and flowed.
    if cfg.reserve_overflow == "refuse" {
        let fixed = cfg.notes_region_cm.or_else(|| inline_reserve_cm(body));
        if let Some(w) = fixed {
            let need = auto_notes_region_cm_sheet(body, sheet_height_cm(cfg));
            if need > w {
                return Err(vec![crate::diagnostics::Diagnostic {
                    severity: "error".to_string(),
                    message: format!(
                        "אזור_הערות: הפסים גבוהים מן השמורה · the foot regions ask for \
                         {need:.1}cm and the reserve holds {w:.1}cm. Raise אזור_הערות, \
                         lower the regions' גבהים, or set reserve_overflow to \"grow\"."
                    ),
                    raw: format!("reserve {w}cm < declared regions {need}cm"),
                    line: None,
                    column: None,
                    about: Some("אזור_הערות".to_string()),
                    did_you_mean: None,
                    file: None,
                }]);
            }
        }
    }
    // The inline grow runs here, where the scan's need and the writer's own
    // number can meet: a fixed reserve smaller than the strips declare is
    // raised (default policy) before anything lays out.
    let body = if cfg.notes_region_cm.is_none()
        && cfg.reserve_overflow != "flow"
        && cfg.reserve_overflow != "refuse"
    {
        let need = auto_notes_region_cm_sheet(body, sheet_height_cm(cfg));
        if need > 0.0 {
            grow_inline_reserve(body, need)
        } else {
            body.to_string()
        }
    } else {
        body.to_string()
    };
    let text = main_source(&body, cfg);
    let Warned { output, warnings } = layout_source(text.clone(), assets);
    match output {
        Ok(doc) => Ok(doc),
        Err(err) => {
            // The same text Typst just parsed, parsed again here so spans can be
            // turned into lines — but only now that there is a diagnostic to
            // locate. See `compile_parts` for why this is not done up front.
            let located = Located::of(&text, &body);
            let mut diagnostics = located.all(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(located.all(&diags, "error")),
                other => diagnostics.push(Diagnostic::ours("error", other.to_string())),
            }
            Err(diagnostics)
        }
    }
}

/// Compile Hebrew Ksav markup into PDF + SVG previews.
pub fn compile(body: &str, cfg: &DocConfig) -> Compiled {
    compile_with(body, cfg, &Assets::default())
}

/// `compile`, with the request's images and fonts available to the document.
pub fn compile_with(body: &str, cfg: &DocConfig, assets: &Assets) -> Compiled {
    compile_parts(body, cfg, assets, Wants::export(), &Default::default())
}

/// Compile, carrying back only the parts of the answer that were asked for.
///
/// The live preview consumes the SVGs and nothing else, yet a PDF was rendered
/// and base64-encoded into every response — around 300 KB per keystroke-driven
/// compile of a 16-page document, none of it ever read. `Wants::pdf` is off for
/// previews and on for export and print, which is the only place the bytes are
/// actually wanted.
///
/// `Wants::source` is the same argument about the same mistake, found later in
/// the same response: the assembled Typst source is the 75 KB prelude plus the
/// document, it was returned unconditionally, and the only caller that reads it
/// ("export .typ") runs its own compile to get it. On a one-page document that
/// was 75 KB of an 84 KB response.
///
/// `Wants::lines` is the third, asked for before it could become the fourth
/// instance: a narrowed preview needs to know which lines printed on which page
/// and every other caller does not.
///
/// No flag changes what is compiled — every one of them is about what is
/// *carried back*.
pub fn compile_parts(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
    wants: Wants,
    // Fingerprints of pages the caller is already holding. A page whose
    // fingerprint is in here is **never serialised** — see `pages_hash` on
    // `Compiled`. Pass an empty set to get every page.
    have: &std::collections::HashSet<String>,
) -> Compiled {
    let source = main_source(body, cfg);
    // The clone is for Typst, which takes the source by value. `source` itself
    // stays here so `Located` has something to parse if it is needed.
    let Warned { output, warnings } = layout_source(source.clone(), assets);

    // Locating a diagnostic means parsing the main source a second time, and
    // `Source::detached` copies it to do so. That was done on every compile
    // whether or not anything had gone wrong: 4.2 ms of a 14.4 ms one-page
    // compile, spent parsing 83 KB of prelude to resolve spans that a clean
    // document does not have. A document with no warnings and no errors now pays
    // none of it — and since the prelude became a file, what gets re-parsed when
    // something *has* gone wrong is two lines and the writer's own text.
    let locate = |diags: &[_], severity: &str| {
        if diags.is_empty() {
            Vec::new()
        } else {
            Located::of(&source, body).all(diags, severity)
        }
    };

    // A request the fonts cannot grant, and a reference with no anchor. Both
    // are questions about the writer's whole text, and **one parse serves
    // both**: each used to walk its own full parse — three per compile on this
    // path — for trees that were identical every time.
    let body_tree = typst::syntax::parse(body);
    let italic = italic_warning(&body_tree, body, cfg, assets);
    let dangling = dangling_references(&body_tree, body);
    // A note filed at a place this document does not have. The same question as
    // the dangling reference — a name the writer used and the document never
    // got — asked of the other place a name can be wrong, and the scan is over
    // the partition `show_rule` already built for the reserve, so it costs
    // nothing extra.
    let stray = unknown_destinations(body, &parse::apparatus_shape(body));

    match output {
        Ok(doc) => {
            let mut diagnostics = locate(&warnings, "warning");
            // A block that cannot split and does not fit loses its content off
            // the bottom of the sheet with nothing reported (#74). The document
            // compiled, so this is the only place the loss is visible.
            diagnostics.extend(crate::diagnostics::overflow_audit(&doc, body));
            diagnostics.extend(italic.clone());
            diagnostics.extend(dangling.clone());
            diagnostics.extend(stray.clone());
            // What the request asked for and did not get. The document compiled;
            // a setting in it did not take effect. A writer who changed a margin
            // and got the old page back has to be told that here rather than
            // discovering it in print.
            diagnostics.extend(cfg.refusals.iter().map(refusal_diagnostic));
            // The same for a setting that is not a length: a `pdf_pages` token
            // the engine could not read, quoted back (#59). It rides the
            // compile response rather than the export's, because that is the
            // one place a writer is looking when they wonder why the range they
            // typed did not happen.
            diagnostics.extend(spec_refusals_of(cfg).iter().map(spec_refusal_diagnostic));
            // Whatever the export has to say, say it. These used to go into
            // `.ok()` and vanish, so a PDF that failed to export came back as
            // `ok: true` with no bytes and no explanation. It mattered little
            // while every export was a plain PDF; the moment a writer asks for
            // PDF/A it matters a great deal, because the standards refuse
            // documents for real, nameable reasons — an unembeddable font, a
            // missing title — that they are entitled to be told about.
            let pdf = if wants.pdf {
                let (bytes, notes) = pdf_bytes(&doc, cfg);
                diagnostics.extend(notes);
                bytes
            } else {
                None
            };
            // The main source is re-parsed here, and only here, because
            // resolving a span means holding a `Source` numbered the same way
            // Typst numbered it — the same trick `Located` uses and the same
            // reason it is built lazily. What gets parsed is the two-line header
            // and the writer's own text; the prelude is a different file.
            //
            // `markers` shares it, so the parse happens once for either or both.
            let parsed = (wants.lines || wants.markers || wants.text)
                .then(|| typst::syntax::Source::detached(source.clone()));
            let pages_lines = match (&parsed, wants.lines) {
                (Some(main), true) => pagelines::page_lines(&doc, main, body),
                _ => Vec::new(),
            };
            let note_markers = match (&parsed, wants.markers) {
                (Some(main), true) => notemarks::note_markers(&doc, main, body),
                _ => Vec::new(),
            };
            let pages_text = match (&parsed, wants.text) {
                (Some(main), true) => pagetext::page_text(&doc, main, body),
                _ => Vec::new(),
            };
            // Fingerprint the **page**, then serialise only what the caller
            // has not got.
            //
            // The fingerprint used to be computed from the SVG, which meant
            // every page had to be serialised before anything could decide
            // whether it was needed. Measured on a 28-page document: layout
            // 42 ms, **SVG serialisation of all 28 pages 310 ms**, fingerprinting
            // 33 ms — so the page cache saved 9.7 MB of bandwidth per keystroke
            // and spent 343 ms producing bytes it then declined to send. That is
            // the same mistake `want_pdf` and `want_source` were introduced to
            // fix, one field further down the same response.
            //
            // `Frame` derives `Hash`, so the answer was available before the
            // work rather than after it. `fill` and `bleed` are in the hash
            // because the SVG is a function of them too and neither is part of
            // the frame — a page whose background colour changed would otherwise
            // come back as "you already have this one".
            //
            // Not stable across processes, and it does not need to be: the
            // client stores these in memory and hands them straight back, and
            // every response carries a fresh set. A restarted engine simply
            // finds nothing in `have` and sends everything once.
            //
            // And **on every core** (#218): serialising is a pure function of the
            // page and the options, so the pages divide by page. `pagesvg` says
            // why that is safe and how it is proven, and the measurement that made
            // it worth doing — 543 ms of SVG for 35 ms of layout at 258 pages.
            let svg_opts = typst_svg::SvgOptions::default();
            let svg_threads = pagesvg::threads_for(doc.pages().len());
            let (pages_hash, pages_svg) =
                pagesvg::serialise(doc.pages(), have, &svg_opts, svg_threads);
            Compiled {
                ok: true,
                pdf,
                pages_svg,
                pages_hash,
                diagnostics,
                typst_source: if wants.source {
                    assemble_source(body, cfg)
                } else {
                    String::new()
                },
                pages_lines,
                pages_text,
                note_markers,
            }
        }
        Err(err) => {
            // Something went wrong, so the second parse is worth its cost here.
            let located = Located::of(&source, body);
            let mut diagnostics = located.all(&warnings, "warning");
            diagnostics.extend(italic);
            diagnostics.extend(dangling);
            diagnostics.extend(stray);
            // A refused setting is worth saying even when the document did not
            // compile: the refusal may be the *reason* it did not, and a writer
            // who cannot see which of their settings was dropped has nothing to
            // change.
            diagnostics.extend(cfg.refusals.iter().map(refusal_diagnostic));
            diagnostics.extend(spec_refusals_of(cfg).iter().map(spec_refusal_diagnostic));
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(located.all(&diags, "error")),
                other => diagnostics.push(Diagnostic::ours("error", other.to_string())),
            }
            Compiled {
                ok: false,
                pdf: None,
                pages_svg: Vec::new(),
                pages_hash: Vec::new(),
                diagnostics,
                pages_lines: Vec::new(),
                pages_text: Vec::new(),
                note_markers: Vec::new(),
                typst_source: if wants.source {
                    assemble_source(body, cfg)
                } else {
                    String::new()
                },
            }
        }
    }
}

/// The PDF export settings a document's config asks for.
///
/// The standard is parsed through serde rather than a hand-written match,
/// because `PdfStandard`'s `#[serde(rename)]` attributes *are* Typst's own
/// spelling of these names (`a-2b`, `ua-1`, `1.7`) and a second table here would
/// be a second source of truth that drifts the first time Typst adds one.
pub(crate) fn pdf_options(
    cfg: &DocConfig,
) -> Result<(typst_pdf::PdfOptions, Vec<Diagnostic>), String> {
    let mut notes = Vec::new();
    let mut opts = typst_pdf::PdfOptions {
        tagged: cfg.pdf_tagged,
        ..Default::default()
    };
    if !cfg.pdf_standard.is_empty() {
        let std: typst_pdf::PdfStandard =
            serde_json::from_value(serde_json::Value::String(cfg.pdf_standard.clone()))
                .map_err(|_| format!("unknown PDF standard \"{}\"", cfg.pdf_standard))?;
        opts.standards =
            typst_pdf::PdfStandards::new(&[std]).map_err(|e| e.message().to_string())?;
    }
    // #59: the empty-result-means-everything rule is gone. `page_ranges_for_export`
    // returns `None` **only** for a request that asked for no restriction, and
    // an `Err` for a spec whose every token was refused. This used to be
    // `if !ranges.is_empty()`, which read a typo as a full-document export.
    //
    // **Parsed here, from `pdf_pages`, rather than from something `from_json`
    // left behind.** A `DocConfig` can be built either way — the struct literal
    // is public, and the tests and `binding.rs` use it — so a cached parse would
    // be `default()` for every one of those, which is *no restriction*, and
    // `a_page_range_exports_fewer_pages` would have started exporting all three
    // pages. Same seam `DocConfig::default()` is documented for, and the same
    // rule applies: anything derived from a setting is derived from the setting.
    match page_ranges_for_export(&parse_page_spec(&cfg.pdf_pages))? {
        None => {}
        Some(ranges) => {
            opts.page_ranges = Some(typst::layout::PageRanges::new(ranges));
            // Typst refuses the combination outright: the accessibility tree spans
            // the whole document, so a subset of pages cannot carry a correct one.
            // Dropping the tags is what the writer wants — they asked for three pages,
            // not for an accessibility tree — but it is still a thing that happened to
            // their export, so it is said out loud rather than done behind their back.
            if opts.tagged {
                opts.tagged = false;
                notes.push(Diagnostic::ours(
                    "warning",
                    "ייצוא של טווח עמודים אינו יכול לשאת תגי נגישות — התגים הושמטו · \
                 Exporting a page range cannot carry PDF tags — tags were dropped"
                        .to_string(),
                ));
            }
        }
    }
    Ok((opts, notes))
}

/// Render the PDF, reporting why rather than returning nothing.
pub(crate) fn pdf_bytes(
    doc: &PagedDocument,
    cfg: &DocConfig,
) -> (Option<Vec<u8>>, Vec<Diagnostic>) {
    let (opts, mut notes) = match pdf_options(cfg) {
        Ok(v) => v,
        Err(m) => return (None, vec![Diagnostic::ours("error", m)]),
    };
    match typst_pdf::pdf(doc, &opts) {
        Ok(bytes) => (Some(bytes), notes),
        Err(diags) => {
            // Export diagnostics carry spans into the assembled source, but they
            // are about the *document as a whole* far more often than about one
            // line of it ("the document title is empty", "this font cannot be
            // embedded"), so they are reported as ours rather than pinned to a
            // line the writer would then stare at in confusion.
            notes.extend(
                diags
                    .iter()
                    .map(|d| Diagnostic::ours("error", d.message.to_string())),
            );
            (None, notes)
        }
    }
}

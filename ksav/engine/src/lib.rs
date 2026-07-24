//! Ksav engine — compiles Hebrew "Ksav" markup into real Typst output.
//!
//! The Hebrew commands are *actual Typst functions* defined in `typst/ksav.typ`.
//! We prepend that prelude to the user's document, inject a `#show: מסמך.with(...)`
//! wrapper driven by the editor settings, then run the genuine Typst compiler to
//! produce a PDF and per-page SVG previews.

use assets::Assets;
use typst::diag::{SourceDiagnostic, Warned};
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;

pub mod assets;
pub mod commands;
pub mod probe;
pub mod spell;
pub mod templates;

// The HTTP server uses tiny_http (net/threads) and can't target wasm.
#[cfg(not(target_arch = "wasm32"))]
pub mod server;

/// The Hebrew prelude, embedded at build time.
const PRELUDE: &str = include_str!("../typst/ksav.typ");

// Bundled Hebrew fonts (self-contained output, no system dependency).
const FONT_FRANK_REG: &[u8] = include_bytes!("../assets/fonts/FrankRuhlHofshi-Regular.otf");
const FONT_FRANK_BOLD: &[u8] = include_bytes!("../assets/fonts/FrankRuhlHofshi-Bold.otf");
const FONT_DAVID_REG: &[u8] = include_bytes!("../assets/fonts/DavidLibre-Regular.ttf");
const FONT_DAVID_BOLD: &[u8] = include_bytes!("../assets/fonts/DavidLibre-Bold.ttf");
const FONT_CASCADIA: &[u8] = include_bytes!("../assets/fonts/CascadiaMono.ttf");
/// The math font (OFL). Typst's math layout needs a font carrying an OpenType
/// MATH table — no Hebrew text font has one — so without this, every formula
/// fails outright with "no font could be found". It is the largest thing the
/// engine bundles (1.3 MB) and the only way `#נוסחה` can work out of the box.
const FONT_NEWCM_MATH: &[u8] = include_bytes!("../assets/fonts/NewCMMath-Regular.otf");

/// Document-level settings, normally supplied by the editor toolbar.
#[derive(Debug, Clone)]
pub struct DocConfig {
    pub font: String,
    pub size_pt: f64,
    pub margin_cm: f64,
    /// "rtl" or "ltr"
    pub dir: String,
    /// BCP-47 language tag for the text (`lang:` in Typst). Empty = follow the
    /// direction: `rtl` → Hebrew, `ltr` → English.
    ///
    /// This is not cosmetic. Typst drives hyphenation, smart-quote shape and its
    /// own generated labels off `lang`, so an English document typeset as Hebrew
    /// gets `”hello”` for `"hello"` (the closing mark on both sides, which is
    /// right for Hebrew and wrong for English) and no hyphenation at all in
    /// justified text, because there are no Hebrew hyphenation patterns.
    pub lang: String,
    /// Show page numbers.
    pub numbering: bool,
    /// Justify paragraphs.
    pub justify: bool,
    /// Line spacing (leading) in em.
    pub line_spacing_em: f64,
    /// Space between paragraphs, in em.
    pub para_spacing_em: f64,
    /// First-line indent, in em (0 = none).
    pub first_line_indent_em: f64,
    /// Number of text columns (1 = single column).
    pub columns: u32,
    /// Paper size (Typst name: "a4", "us-letter", "a5", ...).
    pub paper: String,
    /// Use Hebrew-letter numbering (א,ב,ג) for pages and ordered lists.
    pub hebrew_numbering: bool,
    /// Running header text (empty = none).
    pub header: String,
    /// Running footer text (empty = default page number).
    pub footer: String,
    /// Height in cm reserved at the foot of every page for the per-page note
    /// apparatus (page-bands / streams). `None` = decide automatically from the
    /// document: reserve only when the document actually uses that apparatus.
    pub notes_region_cm: Option<f64>,
}

/// Commands whose notes render into the page *footer* rather than expanding the
/// text region — these are the ones that need a reserved region at the page foot.
const PAGE_APPARATUS_COMMANDS: &[&str] = &[
    "מדף_", "pageband", "הערה_זרם", "stream_note", "הערת_תוכן", "contentnote", "הערת_מקור",
    "sourcenote_stream",
];

/// How much page-foot region a body needs, in cm.
///
/// The per-page apparatus lives in the bottom margin, so with nothing reserved it
/// grows straight off the bottom of the sheet — the single most visible defect in
/// that apparatus. Rather than make every writer discover a knob, reserve a
/// workable default as soon as the document uses one of those commands, and
/// nothing at all otherwise (native footnotes expand the text region themselves
/// and must not lose page height to a reserve they never use).
pub fn auto_notes_region_cm(body: &str) -> f64 {
    if PAGE_APPARATUS_COMMANDS.iter().any(|c| apparatus_is_called(body, c)) {
        3.0
    } else {
        0.0
    }
}

/// Whether `name` (a command, or the common prefix of a family of them) appears
/// as an actual call, not merely as text.
///
/// A bare `body.contains(name)` reserved 3 cm at the foot of every page for any
/// document that so much as mentioned `מדף_` in prose. The names here are prefixes
/// — `מדף_` covers `מדף_א`, `מדף_בדרגה`, … — so this consumes the rest of the
/// identifier after the prefix and then requires the argument bracket that makes
/// it a call: `#מדף_א[…]`, `הערה_זרם(…)`. Prose ("the מדף_ command") has a space
/// or punctuation there, not a bracket, so it no longer triggers the reserve.
fn apparatus_is_called(body: &str, name: &str) -> bool {
    let mut base = 0;
    while let Some(i) = body[base..].find(name) {
        let start = base + i;
        let rest = &body[start + name.len()..];
        // Skip the rest of the identifier (Hebrew letters are alphabetic, so
        // `is_alphanumeric` covers them), then look at the first character after.
        let after_ident = rest
            .char_indices()
            .find(|(_, ch)| !(ch.is_alphanumeric() || *ch == '_'))
            .map(|(idx, _)| idx)
            .unwrap_or(rest.len());
        if matches!(rest[after_ident..].chars().next(), Some('(') | Some('[')) {
            return true;
        }
        base = start + name.len();
    }
    false
}

impl Default for DocConfig {
    fn default() -> Self {
        DocConfig {
            font: "Frank Ruhl Hofshi".to_string(),
            size_pt: 12.0,
            margin_cm: 2.5,
            dir: "rtl".to_string(),
            lang: String::new(),
            numbering: true,
            justify: true,
            line_spacing_em: 0.75,
            para_spacing_em: 1.2,
            first_line_indent_em: 0.0,
            columns: 1,
            paper: "a4".to_string(),
            hebrew_numbering: false,
            header: String::new(),
            footer: String::new(),
            notes_region_cm: None,
        }
    }
}

/// Read a finite number from JSON, clamped to a range the typesetter can use.
///
/// Every one of these values is a *length* or a *count* that goes straight into
/// the Typst prelude. Unvalidated, `size_pt: 0` produced invisible text,
/// `size_pt: -5` and `line_spacing_em: -3` produced garbage, and `columns: 5000`
/// produced a page of hairlines — all of them reported as `ok: true`, which is
/// the worst possible answer: silently wrong output that looks like success.
/// NaN and infinity are rejected outright rather than clamped, because a NaN
/// formatted into the source is not a Typst length at all and fails inside the
/// prelude, pointing the writer at code they never wrote.
fn clamped(v: &serde_json::Value, key: &str, lo: f64, hi: f64) -> Option<f64> {
    let n = v.get(key)?.as_f64()?;
    if !n.is_finite() {
        return None;
    }
    Some(n.clamp(lo, hi))
}

/// A paper name safe to place inside a Typst string literal.
///
/// Typst paper names are lowercase ASCII with hyphens and digits — `a4`,
/// `us-letter`, `presentation-16-9`. Anything else is dropped rather than
/// escaped: this value is interpolated into the prelude, and `paper: "a4\"`
/// used to close the literal early and fail the whole document with "unclosed
/// delimiter" pointing at the prelude instead of at the setting.
/// A language tag reduced to what Typst will actually accept: an ISO 639
/// two- or three-letter code, e.g. `en`, `he`, `yid`.
///
/// Anything else becomes empty, which falls back to the direction default.
/// Filtering the characters is not enough on its own: Typst rejects a tag of the
/// wrong *length* outright, and a rejected tag fails the whole compile with
/// "expected two or three letter language code" — an error about code the writer
/// never wrote, over a setting they may not know exists. Same rule as the
/// numeric fields: refuse the impossible value here, where it can still be
/// ignored, rather than pass it on and blank someone's document.
fn sanitize_lang(l: &str) -> String {
    // A region subtag is a legitimate thing to send (`pt-BR`); Typst carries it
    // separately, so keep the language and drop the rest rather than refusing.
    let base = l.split('-').next().unwrap_or("");
    let letters: String = base
        .chars()
        .filter(char::is_ascii_alphabetic)
        .collect::<String>()
        .to_ascii_lowercase();
    if (2..=3).contains(&letters.len()) {
        letters
    } else {
        String::new()
    }
}

/// The language a document is actually typeset in: the explicit tag when there
/// is one, otherwise the one that goes with its direction.
///
/// Hebrew is the default because Ksav is Hebrew-first, but a left-to-right
/// document is an English one until told otherwise — typesetting it as Hebrew
/// costs it hyphenation and gives it the wrong quotation marks.
pub fn effective_lang(cfg: &DocConfig) -> &str {
    if !cfg.lang.is_empty() {
        &cfg.lang
    } else if cfg.dir == "ltr" {
        "en"
    } else {
        "he"
    }
}

fn sanitize_paper(p: &str) -> String {
    p.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect::<String>()
        .to_ascii_lowercase()
}

impl DocConfig {
    /// Read a config from a JSON object, keeping defaults for missing keys.
    ///
    /// Every numeric field is range-checked. A request that asks for something
    /// impossible gets the nearest possible thing rather than silently garbage
    /// output — see `clamped`.
    pub fn from_json(v: &serde_json::Value) -> DocConfig {
        let mut cfg = DocConfig::default();
        if let Some(f) = v.get("font").and_then(|x| x.as_str()) {
            if !f.is_empty() {
                cfg.font = f.to_string();
            }
        }
        // 1pt is legible-under-a-loupe; 400pt is a poster. Outside that range
        // the number is a mistake, not a choice.
        if let Some(s) = clamped(v, "size_pt", 1.0, 400.0) {
            cfg.size_pt = s;
        }
        // Margins must leave a text region: half of the short side of A5.
        if let Some(m) = clamped(v, "margin_cm", 0.0, 7.0) {
            cfg.margin_cm = m;
        }
        if let Some(d) = v.get("dir").and_then(|x| x.as_str()) {
            cfg.dir = d.to_string();
        }
        // Sanitised like `paper`, and for the same reason: it is formatted into
        // the prelude as a string literal, so it may only ever be a tag.
        if let Some(l) = v.get("lang").and_then(|x| x.as_str()) {
            cfg.lang = sanitize_lang(l);
        }
        if let Some(n) = v.get("numbering").and_then(|x| x.as_bool()) {
            cfg.numbering = n;
        }
        if let Some(j) = v.get("justify").and_then(|x| x.as_bool()) {
            cfg.justify = j;
        }
        if let Some(l) = clamped(v, "line_spacing_em", 0.0, 10.0) {
            cfg.line_spacing_em = l;
        }
        if let Some(p) = clamped(v, "para_spacing_em", 0.0, 20.0) {
            cfg.para_spacing_em = p;
        }
        if let Some(fi) = clamped(v, "first_line_indent_em", 0.0, 20.0) {
            cfg.first_line_indent_em = fi;
        }
        // More columns than this on any real paper is a column of single
        // letters; the layout succeeds and the document is unreadable.
        if let Some(c) = clamped(v, "columns", 1.0, 12.0) {
            cfg.columns = c as u32;
        }
        if let Some(p) = v.get("paper").and_then(|x| x.as_str()) {
            let clean = sanitize_paper(p);
            if !clean.is_empty() {
                cfg.paper = clean;
            }
        }
        if let Some(h) = v.get("hebrew_numbering").and_then(|x| x.as_bool()) {
            cfg.hebrew_numbering = h;
        }
        if let Some(h) = v.get("header").and_then(|x| x.as_str()) {
            cfg.header = h.to_string();
        }
        if let Some(f) = v.get("footer").and_then(|x| x.as_str()) {
            cfg.footer = f.to_string();
        }
        if let Some(n) = clamped(v, "notes_region_cm", 0.0, 20.0) {
            cfg.notes_region_cm = Some(n);
        }
        cfg
    }
}

/// A compiler diagnostic surfaced back to the editor.
#[derive(Debug, Clone)]
pub struct Diagnostic {
    pub severity: String, // "error" | "warning"
    pub message: String,
}

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
    /// Errors and warnings from the real Typst compiler.
    pub diagnostics: Vec<Diagnostic>,
    /// The full assembled Typst source (prelude + wrapper + body) — the
    /// "export to plain Typst" output.
    pub typst_source: String,
}

impl Compiled {
    pub fn ok(&self) -> bool {
        self.ok
    }
}

/// Escape a string for embedding as a Typst string literal.
///
/// The backslash must be doubled *first*: escaping the quote first would turn
/// `"` into `\"` and the following pass would then turn that backslash into
/// `\\"`, closing the literal after all. Every value interpolated into the
/// prelude goes through this or through `sanitize_paper`; nothing else is
/// allowed to build a string literal by hand, which is how `font` and `paper`
/// came to miss the backslash case that `header`/`footer` handled correctly.
fn typst_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// `typst_str`, or the literal `none` when the string is empty.
fn typst_str_or_none(s: &str) -> String {
    if s.is_empty() {
        "none".to_string()
    } else {
        typst_str(s)
    }
}

pub fn assemble_source(body: &str, cfg: &DocConfig) -> String {
    let dir = if cfg.dir == "ltr" { "ltr" } else { "rtl" };
    let columns = cfg.columns.max(1);
    format!(
        "{prelude}\n\
         #show: מסמך.with(\
         גופן: {font}, גודל: {size}pt, שוליים: {margin}cm, כיוון: {dir}, שפה: {lang}, \
         מספור: {numbering}, מספור_עברי: {hebrew_num}, נייר: {paper}, \
         כותרת_עליונה: {header}, כותרת_תחתונה: {footer}, \
         יישור: {justify}, ריווח_שורות: {leading}em, ריווח_פסקאות: {para}em, \
         הזחה_ראשונה: {indent}em, טורים: {columns}, אזור_הערות: {region})\n\n\
         {body}\n",
        prelude = PRELUDE,
        font = typst_str(&cfg.font),
        size = cfg.size_pt,
        margin = cfg.margin_cm,
        dir = dir,
        lang = typst_str(effective_lang(cfg)),
        numbering = if cfg.numbering { "true" } else { "false" },
        hebrew_num = if cfg.hebrew_numbering { "true" } else { "false" },
        paper = typst_str(&sanitize_paper(&cfg.paper)),
        header = typst_str_or_none(&cfg.header),
        footer = typst_str_or_none(&cfg.footer),
        justify = if cfg.justify { "true" } else { "false" },
        leading = cfg.line_spacing_em,
        para = cfg.para_spacing_em,
        indent = cfg.first_line_indent_em,
        columns = columns,
        region = match cfg.notes_region_cm.unwrap_or_else(|| auto_notes_region_cm(body)) {
            r if r <= 0.0 => "none".to_string(),
            r => format!("{r}cm"),
        },
        body = body,
    )
}

fn diag_messages(diags: &[SourceDiagnostic], severity: &str) -> Vec<Diagnostic> {
    diags
        .iter()
        .map(|d| {
            let mut msg = d.message.to_string();
            for hint in &d.hints {
                msg.push_str("\n  ↳ ");
                msg.push_str(&hint.v);
            }
            Diagnostic {
                severity: severity.to_string(),
                message: msg,
            }
        })
        .collect()
}

/// Lay out an assembled source, with the request's assets available to it.
///
/// The document has no file system to read from, so its images arrive as bytes on
/// the request and are registered under the names the document uses. User fonts
/// arrive the same way and join the bundled ones.
fn layout_source(source: String, assets: &Assets) -> Warned<Result<PagedDocument, typst_as_lib::TypstAsLibError>> {
    let mut fonts: Vec<&[u8]> = vec![
        FONT_FRANK_REG,
        FONT_FRANK_BOLD,
        FONT_DAVID_REG,
        FONT_DAVID_BOLD,
        FONT_CASCADIA,
        FONT_NEWCM_MATH,
    ];
    fonts.extend(assets.fonts.iter().map(|f| f.bytes.as_slice()));
    let files: Vec<(&str, &[u8])> = assets
        .files
        .iter()
        .map(|a| (a.name.as_str(), a.bytes.as_slice()))
        .collect();
    let mut builder = TypstEngine::builder()
        .main_file(source)
        .fonts(fonts)
        .with_static_file_resolver(files);
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
    let engine = builder.build();
    engine.compile::<PagedDocument>()
}

/// Compile and lay out a document, returning the laid-out pages.
///
/// This is what `compile` uses internally; it is public so tests (and the render
/// probe) can inspect *where things actually landed on the page* rather than only
/// whether compilation succeeded.
pub fn compile_doc(body: &str, cfg: &DocConfig) -> Result<PagedDocument, Vec<Diagnostic>> {
    compile_doc_with(body, cfg, &Assets::default())
}

/// `compile_doc`, with the request's images and fonts available to the document.
pub fn compile_doc_with(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<PagedDocument, Vec<Diagnostic>> {
    let source = assemble_source(body, cfg);
    let Warned { output, warnings } = layout_source(source, assets);
    match output {
        Ok(doc) => Ok(doc),
        Err(err) => {
            let mut diagnostics = diag_messages(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(diag_messages(&diags, "error")),
                other => diagnostics.push(Diagnostic {
                    severity: "error".to_string(),
                    message: other.to_string(),
                }),
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
    compile_parts(body, cfg, assets, true)
}

/// Compile, optionally skipping the PDF.
///
/// The live preview consumes the SVGs and nothing else, yet a PDF was rendered
/// and base64-encoded into every response — around 300 KB per keystroke-driven
/// compile of a 16-page document, none of it ever read. `want_pdf` is off for
/// previews and on for export and print, which is the only place the bytes are
/// actually wanted.
pub fn compile_parts(body: &str, cfg: &DocConfig, assets: &Assets, want_pdf: bool) -> Compiled {
    let source = assemble_source(body, cfg);
    let typst_source = source.clone();

    let Warned { output, warnings } = layout_source(source, assets);
    let mut diagnostics = diag_messages(&warnings, "warning");

    match output {
        Ok(doc) => {
            let pdf = want_pdf
                .then(|| typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default()).ok())
                .flatten();
            let svg_opts = typst_svg::SvgOptions::default();
            let pages_svg = doc
                .pages()
                .iter()
                .map(|p| typst_svg::svg(p, &svg_opts))
                .collect();
            Compiled {
                ok: true,
                pdf,
                pages_svg,
                diagnostics,
                typst_source,
            }
        }
        Err(err) => {
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(diag_messages(&diags, "error")),
                other => diagnostics.push(Diagnostic {
                    severity: "error".to_string(),
                    message: other.to_string(),
                }),
            }
            Compiled {
                ok: false,
                pdf: None,
                pages_svg: Vec::new(),
                diagnostics,
                typst_source,
            }
        }
    }
}

/// JSON-in / JSON-out compile, shared by the HTTP server and the wasm binding.
/// Input: `{body, font, size_pt, margin_cm, dir, numbering, justify, line_spacing_em,
/// columns, assets: [{name, data}], fonts: [{name, data}]}` — `data` is base64,
/// with or without a `data:` URL prefix.
/// Output: `{ok, pages_svg, pdf_base64, diagnostics, typst_source}`.
pub fn compile_request(input_json: &str) -> String {
    use base64::Engine as _;
    // A request that does not parse is not an empty document.
    //
    // This used to fall back to `Value::Null`, which reads every field as absent:
    // an empty body, which compiles perfectly happily into one blank page and is
    // returned as `ok: true`. A truncated upload or a corrupted request therefore
    // blanked the writer's preview and said nothing about why. The real client
    // always sends valid JSON, so reaching this means something went wrong on the
    // wire, and the honest answer is to say so.
    let v: serde_json::Value = match serde_json::from_str(input_json) {
        Ok(v) => v,
        Err(e) => {
            return serde_json::json!({
                "ok": false,
                "pages_svg": [],
                "pdf_base64": serde_json::Value::Null,
                "diagnostics": [{
                    "severity": "error",
                    "message": format!(
                        "הבקשה לא נקראה — ייתכן שההעברה נקטעה ({e}) · \
                         the request could not be read — the transfer may have been \
                         truncated ({e})"
                    ),
                }],
                "typst_source": "",
                "missing_assets": [],
            })
            .to_string();
        }
    };
    let body = v.get("body").and_then(|x| x.as_str()).unwrap_or("");
    let cfg = DocConfig::from_json(&v);
    // Assets resolve from a per-process cache keyed by content hash, so an
    // unchanged image is not re-sent and re-decoded on every keystroke. Any hash
    // the cache no longer holds comes back so the client re-sends the bytes.
    let (assets, missing_assets) = Assets::from_request(&v);

    // `{"format": "html"}` asks for the web export instead of a paged render.
    if v.get("format").and_then(|x| x.as_str()) == Some("html") {
        return match compile_html(body, &cfg, &assets) {
            Ok(html) => serde_json::json!({ "ok": true, "html": html, "diagnostics": [], "missing_assets": missing_assets }),
            Err(diags) => serde_json::json!({
                "ok": false,
                "html": serde_json::Value::Null,
                "diagnostics": diags
                    .iter()
                    .map(|d| serde_json::json!({ "severity": d.severity, "message": d.message }))
                    .collect::<Vec<_>>(),
                "missing_assets": missing_assets,
            }),
        }
        .to_string();
    }

    // Previews don't want a PDF; export and print do, and say so.
    let want_pdf = v
        .get("want_pdf")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    let result = compile_parts(body, &cfg, &assets, want_pdf);
    let diags: Vec<serde_json::Value> = result
        .diagnostics
        .iter()
        .map(|d| serde_json::json!({ "severity": d.severity, "message": d.message }))
        .collect();
    let pdf_b64 = result
        .pdf
        .as_ref()
        .map(|p| base64::engine::general_purpose::STANDARD.encode(p));
    serde_json::json!({
        "ok": result.ok(),
        "pages_svg": result.pages_svg,
        "pdf_base64": pdf_b64,
        "diagnostics": diags,
        "typst_source": result.typst_source,
        // Hashes the client thought were cached but the engine no longer holds;
        // it re-sends their bytes on the next compile.
        "missing_assets": missing_assets,
    })
    .to_string()
}

/// Compile to Typst's native HTML — real reflowable web content.
///
/// "Export HTML" used to wrap the rendered SVG *page images* in a bit of HTML:
/// fixed-size pictures of pages, not something you can reflow, copy, search or
/// read on a phone. This produces genuine semantic markup instead — headings are
/// `<h1>`…`<h6>`, emphasis is `<strong>`/`<em>`, paragraphs are `<p>`.
///
/// Typst's HTML export is still under development, so this can fail on a
/// document the paged backend handles fine; callers should keep the paged export
/// available and report the diagnostics rather than presenting HTML as
/// equivalent.
pub fn compile_html(body: &str, cfg: &DocConfig, assets: &Assets) -> Result<String, Vec<Diagnostic>> {
    let source = assemble_source(body, cfg);
    let mut fonts: Vec<&[u8]> = vec![FONT_FRANK_REG, FONT_FRANK_BOLD, FONT_DAVID_REG, FONT_DAVID_BOLD, FONT_CASCADIA, FONT_NEWCM_MATH];
    fonts.extend(assets.fonts.iter().map(|f| f.bytes.as_slice()));
    let files: Vec<(&str, &[u8])> = assets.files.iter().map(|a| (a.name.as_str(), a.bytes.as_slice())).collect();
    let engine = TypstEngine::builder().main_file(source).fonts(fonts).with_static_file_resolver(files).build();
    let Warned { output, warnings } = engine.compile::<typst_html::HtmlDocument>();
    match output {
        Ok(doc) => match typst_html::html(&doc, &typst_html::HtmlOptions::default()) {
            Ok(s) => Ok(s),
            Err(diags) => Err(diag_messages(&diags, "error")),
        },
        Err(err) => {
            let mut d = diag_messages(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(x) => d.extend(diag_messages(&x, "error")),
                other => d.push(Diagnostic { severity: "error".into(), message: other.to_string() }),
            }
            Err(d)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------- config validation
    //
    // Every one of these used to return `ok: true` with silently garbage output,
    // which is the worst answer a compiler can give: a page that looks like it
    // worked and is not what anybody asked for.

    fn cfg_from(json: serde_json::Value) -> DocConfig {
        DocConfig::from_json(&json)
    }

    #[test]
    fn the_page_foot_reserve_follows_a_real_call_not_a_prose_mention() {
        // A document that only *talks* about the apparatus must not lose 3 cm at
        // the foot of every page for one it never uses.
        assert_eq!(
            auto_notes_region_cm("כאן נסביר מהו מדף_ וכיצד להשתמש בו בטקסט."),
            0.0,
            "a bare mention should reserve nothing"
        );
        // An actual call — both the bracket form and the paren form, top-level and
        // via the family prefix — reserves the region.
        assert_eq!(auto_notes_region_cm("שלום #מדף_א[הערה] עולם"), 3.0);
        assert_eq!(auto_notes_region_cm("#מדף_בדרגה(2)[הערה]"), 3.0);
        assert_eq!(auto_notes_region_cm("#הערה_זרם(זרם: \"א\")[טקסט]"), 3.0);
        // A document with no apparatus at all reserves nothing.
        assert_eq!(auto_notes_region_cm("סתם טקסט עם #הדגשה[מילה]"), 0.0);
    }

    #[test]
    fn impossible_numbers_are_brought_back_into_range() {
        let c = cfg_from(serde_json::json!({
            "size_pt": 0, "line_spacing_em": -3.0, "columns": 5000, "margin_cm": -1.0,
        }));
        assert!(c.size_pt >= 1.0, "zero-size text is invisible, not a choice");
        assert!(c.line_spacing_em >= 0.0, "negative leading stacks lines on top of each other");
        assert!(c.columns <= 12, "5000 columns is a page of hairlines");
        assert!(c.margin_cm >= 0.0);
    }

    #[test]
    fn a_document_with_impossible_settings_still_renders() {
        let cfg = cfg_from(serde_json::json!({
            "size_pt": -5, "columns": 5000, "line_spacing_em": -3.0, "first_line_indent_em": -9.0,
        }));
        let out = compile("שלום", &cfg);
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn nan_and_infinity_are_refused_rather_than_clamped() {
        // Serde will not parse a bare NaN, so this is the shape that actually
        // reaches us: a string where a number was expected. Either way the
        // default must survive — a NaN formatted into the prelude is not a
        // Typst length and fails inside code the writer never wrote.
        let c = cfg_from(serde_json::json!({ "size_pt": "NaN", "columns": "many" }));
        assert_eq!(c.size_pt, DocConfig::default().size_pt);
        assert_eq!(c.columns, DocConfig::default().columns);
    }

    // ------------------------------------------------------- string escaping

    #[test]
    fn a_backslash_in_a_setting_cannot_escape_its_string_literal() {
        // `paper: "a4\"` used to close the literal early and fail the whole
        // document with "unclosed delimiter" pointing at the prelude rather than
        // at the setting. Every one of these must simply render.
        for cfg in [
            DocConfig { paper: "a4\\".into(), ..Default::default() },
            DocConfig { paper: "a4\"".into(), ..Default::default() },
            DocConfig { font: "Frank\\".into(), ..Default::default() },
            DocConfig { font: "Frank\" ,גודל: 99pt, x: \"".into(), ..Default::default() },
            DocConfig { header: "כותרת\\".into(), ..Default::default() },
            DocConfig { footer: "\\\"".into(), ..Default::default() },
        ] {
            let out = compile("שלום", &cfg);
            assert!(
                out.ok(),
                "a hostile {:?}/{:?} broke the document: {:?}",
                cfg.font,
                cfg.paper,
                out.diagnostics
            );
        }
    }

    #[test]
    fn a_paper_name_is_reduced_to_something_typst_can_read() {
        assert_eq!(sanitize_paper("A4"), "a4");
        assert_eq!(sanitize_paper("us-letter"), "us-letter");
        assert_eq!(sanitize_paper("a4\\\" ,x: \"y"), "a4xy");
        assert_eq!(sanitize_paper("\"\\"), "");
    }

    #[test]
    fn typst_str_doubles_the_backslash_before_the_quote() {
        // Order matters: escaping the quote first would turn `"` into `\"`, and
        // the backslash pass would then produce `\\"` — closing the literal.
        assert_eq!(typst_str("a\\"), "\"a\\\\\"");
        assert_eq!(typst_str("a\"b"), "\"a\\\"b\"");
        assert_eq!(typst_str("\\\""), "\"\\\\\\\"\"");
    }

    // ------------------------------------------------------- preview vs export

    #[test]
    fn a_preview_carries_no_pdf_and_an_export_does() {
        let body = serde_json::json!({ "body": "שלום" }).to_string();
        let preview: serde_json::Value = serde_json::from_str(&compile_request(&body)).unwrap();
        assert_eq!(preview["ok"], true);
        assert!(!preview["pages_svg"].as_array().unwrap().is_empty());
        assert!(
            preview["pdf_base64"].is_null(),
            "the preview must not carry ~300 KB of base64 nothing on screen reads"
        );

        let export = serde_json::json!({ "body": "שלום", "want_pdf": true }).to_string();
        let exported: serde_json::Value = serde_json::from_str(&compile_request(&export)).unwrap();
        assert!(exported["pdf_base64"].as_str().is_some_and(|s| !s.is_empty()));
    }

    #[test]
    fn a_request_that_does_not_parse_is_an_error_not_a_blank_page() {
        // Falling back to an absent body compiled one blank page and called it
        // `ok: true`, so a truncated upload silently wiped the preview.
        for bad in ["", "garbage", "{\"body\": ", "{\"body\":\"a\nb\"}"] {
            let out: serde_json::Value = serde_json::from_str(&compile_request(bad)).unwrap();
            assert_eq!(out["ok"], false, "{bad:?} must not report success");
            assert!(
                out["pages_svg"].as_array().is_some_and(|p| p.is_empty()),
                "{bad:?} must not render a page"
            );
            let msg = out["diagnostics"][0]["message"].as_str().unwrap_or("");
            assert!(
                msg.contains("could not be read"),
                "{bad:?} must say why: {msg}"
            );
        }
        // A well-formed request is unaffected.
        let good = serde_json::json!({ "body": "שלום" }).to_string();
        let out: serde_json::Value = serde_json::from_str(&compile_request(&good)).unwrap();
        assert_eq!(out["ok"], true);
    }

    #[test]
    fn success_is_reported_even_when_no_pdf_was_asked_for() {
        // `ok` used to mean `pdf.is_some()`, which would report every successful
        // preview as a failure the moment previews stopped rendering a PDF.
        let out = compile_parts("שלום", &DocConfig::default(), &Assets::default(), false);
        assert!(out.ok());
        assert!(out.pdf.is_none());
        assert!(!out.pages_svg.is_empty());
    }


    #[test]
    fn every_registered_command_is_defined() {
        // Each command's Hebrew name and English alias must have a matching `#let`
        // in the prelude — otherwise the palette would insert an undefined call.
        let defined = |name: &str| {
            PRELUDE.contains(&format!("#let {name}("))
                || PRELUDE.contains(&format!("#let {name} ="))
                || PRELUDE.contains(&format!("#let {name}("))
                || PRELUDE.contains(&format!("#let {name}\n"))
        };
        for c in commands::COMMANDS {
            assert!(defined(c.he), "Hebrew command not defined in prelude: {}", c.he);
            assert!(defined(c.en), "English alias not defined in prelude: {}", c.en);
        }
    }

    #[test]
    fn config_english_aliases_compile() {
        let body = "#headings_config(מספור: \"1.1\")\n#lists_config(סמן: ([◆],))\n\
                    #tables_config(פסים: true)\n#pagebands_config(מספור: (\"1\", \"א\"))\n\
                    #streams_config(פריסה: \"צד\")\n#h1[פרק]\n#bullets(item[א])\n\
                    #mktable(עמודות: 2, cell[1], cell[2])\n\
                    א#pageband1[ב] ג#contentnote[ד] ה#stream_note(\"x\")[ו]\n\
                    #endnotes_side(זרמים: (\"x\",))";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn compiles_basic_hebrew() {
        let out = compile("#הדגשה[שלום עולם]", &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn deep_cross_nesting_compiles() {
        // table inside footnote inside heading inside list item
        let body = "#רשימה(פריט[\
            #כותרת2[פריט עם כותרת #הערה[\
                #טבלה(עמודות: 2, תא[א], תא[ב], תא[1], תא[2])\
            ]]\
        ])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    /// Full torture test: every structure nested inside every other, footnotes
    /// three deep, lists five deep, headings up to level 10. Renders because
    /// Typst parses the document — nesting is unbounded.
    #[test]
    fn everything_inside_everything() {
        let body = include_str!("../examples/nesting.ksav");
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn footnote_within_footnote() {
        let out = compile("א#הערה[ב#הערה[ג#הערה[ד]]]", &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn deep_note_on_note_separate_blocks() {
        // A note-on-a-note nested 5 deep — each level is hoisted to its own
        // footnote block (sequential numbering, spaced apart via footnote.entry gap).
        let body = "א#הערה[ב#הערה_על_הערה[ג#הערה_על_הערה[ד#הערה_על_הערה[ה\
                    #הערה_על_הערה[ו]]]]] ז#הערה[ח]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn layered_tiered_footnotes() {
        // A note on a note becomes its own stacked block at the foot of the page,
        // 5 tiers deep — native-footnote based, so it must converge (no warnings).
        let body = "טקסט#הערה_א[ראשונה #הערה_ב[שנייה #הערה_ג[שלישית \
                    #הערה_ד[רביעית #הערה_ה[חמישית]]]]] המשך#הערה_א[עוד אחת].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn layered_tiered_footnote_config() {
        // Per-tier styling: custom slant, indent, gap, and bold tier labels.
        let body = "#הגדרות_הערות(סגנון: (\"normal\", \"italic\", \"normal\"), \
                    הזחה: (0em, 1em, 2em), תוויות: (\"\", \"על הערה: \", \"על תת-הערה: \"))\n\
                    א#הערה_א[פ #הערה_ב[ק #הערה_ג[ר]]] ב#הערה_א[ש].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn regrouped_stacked_bands() {
        // Fully regrouped Gemara-style bands (all tier-1, then all tier-2, …),
        // rendered in the main flow — 5 tiers, must compile AND converge.
        let body = "#הגדרות_מדורגות(טורים: (2, 1, 1), מספור: (\"1\", \"א\", \"a\", \"i\", \"1\"))\n\
                    א#מדור_א[ראש #מדור_ב[שני #מדור_ג[שלישי #מדור_ד[רביעי #מדור_ה[חמישי]]]]] \
                    ב#מדור_א[עוד].\n#הערות_מדורגות(כותרת: [הערות])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn per_page_regrouped_bands() {
        // The hard one: fully-regrouped bands (all tier-1, then tier-2, …) at the
        // foot of EACH page, 5 tiers deep, across multiple pages. Read-only footer,
        // so it must converge (no warnings).
        let filler = "מילה ".repeat(400); // push onto a second page
        let body = format!(
            "#הגדרות_מדפים(מספור: (\"1\", \"א\", \"a\", \"i\", \"1\"))\n\
             ראש#מדף_א[פתיחה #מדף_ב[שנייה #מדף_ג[שלישית #מדף_ד[רביעית #מדף_ה[חמישית]]]]] \
             {filler} \
             אמצע#מדף_א[עוד הערה #מדף_ב[ועוד תת-הערה]] {filler} סוף#מדף_א[אחרונה].",
            filler = filler
        );
        let out = compile(&body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(out.pages_svg.len() >= 2, "expected multiple pages");
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn footnote_streams() {
        // Multiple independent per-page footnote streams, side by side, each with
        // its own numbering. Read-only footer ⇒ must converge.
        let body = "#הגדרות_זרמים(פריסה: \"צד\", זרמים: (\"תוכן\", \"מקורות\"), \
                    מספור: (\"מקורות\": \"א\"), כותרות: (\"תוכן\": [ביאורים], \"מקורות\": [מקורות]))\n\
                    טקסט#הערת_תוכן[ביאור ראשון] ועוד#הערת_מקור[רמב\"ם] וגם\
                    #הערת_תוכן[ביאור שני]#הערת_מקור[שו\"ע].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn endnotes_streams_and_cross_nesting() {
        // regular footnote, endnote-with-footnote-inside, footnote-with-endnote-
        // inside, and a second named stream — all rendered.
        let body = "א#הערה[ב] ג#הערתסיום[ד#הערה[ה]] ו#הערה[ז#הערתסיום[ח]] \
                    ט#הערתסיום(זרם: \"מקורות\")[י]\n\
                    #הערות_בסוף(כותרת: [הערות])\n#הערות_בסוף(זרם: \"מקורות\", כותרת: [מקורות])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn endnote_streams_side_by_side() {
        // Three endnote streams rendered side by side, each its own column+title.
        let body = "א#הערתסיום(זרם: \"א\")[ראשון] ב#הערתסיום(זרם: \"ב\")[שני] \
                    ג#הערתסיום(זרם: \"ג\")[שלישי]\n\
                    #הערות_בסוף_צד(זרמים: (\"א\", \"ב\", \"ג\"), \
                    כותרות: (\"א\": [ביאורים], \"ב\": [מקורות], \"ג\": [הוספות]))";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn side_column_notes() {
        let body = "#עם_הערות_צד[טקסט#הערת_גיליון[הערה א] ועוד#הערת_גיליון[הערה ב] סוף.]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn configurable_headings_lists_tables() {
        let body = "#הגדרות_כותרות(גודל: (2em, 1.4em), צבע: (rgb(\"#b91c1c\"), luma(40)), \
                    יישור: (center, right), מספור: \"1.1\", קו: (true, false))\n\
                    #הגדרות_רשימות(סמן: ([◆], [–]), הזחה: 1.5em, הידוק: true)\n\
                    #הגדרות_טבלאות(פסים: true, צבע_פס: luma(240), מרווח: 10pt, קו: 1pt + luma(80))\n\
                    #כותרת1[פרק] #כותרת2[סעיף]\n#רשימה(פריט[א], פריט[ב])\n\
                    #טבלה(עמודות: 2, תא[1], תא[2], תא[3], תא[4])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn per_stream_columns() {
        // A stream with 2 columns next to a 1-column stream — independent counts.
        let body = "#הגדרות_זרמים(טורים: (\"מקורות\": 2))\n\
                    א#הערת_מקור[ראשון] ב#הערת_מקור[שני] ג#הערת_מקור[שלישי] \
                    ד#הערת_תוכן[ביאור].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn toc_number_suppression() {
        // Headers keep a stepping counter, but the TOC must be able to hide the
        // numbers: auto (default, follows heading config = none), explicit false,
        // and explicit true all compile.
        let body = "#כותרת1[פרק]\n#כותרת2[סעיף]\n\
                    #תוכן()\n#תוכן(מספור: false)\n#תוכן(מספור: true)";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn review_marks_in_every_view() {
        // Tracked changes and an editorial comment, in all three review views.
        for view in ["סימון", "סופי", "מקורי"] {
            let body = format!(
                "#הגדרות_סקירה(תצוגה: \"{view}\")\n\
                 כתב #הוספה[מוסיף] ו#מחיקה[מוחק]#הערת_עורך(מאת: \"עורך\")[לבדוק] סוף."
            );
            let out = compile(&body, &DocConfig::default());
            assert!(out.ok(), "{view}: {:?}", out.diagnostics);
        }
    }

    #[test]
    fn review_comment_inside_side_column() {
        // A comment inside a side-column section lands in the column rather than
        // falling back to a footnote.
        let body = "#עם_הערות_צד[טקסט#הערת_עורך[לשקול שוב] ועוד#הערת_עורך[ומכאן].]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn section_page_setup() {
        // Two sections with their own page setup, around ordinary text.
        let body = "רגיל\n#מקטע_עמוד(טורים: 2, כותרת_עליונה: \"נספח\", מספור: \"i\")[\
                    טקסט בשני טורים.]\n\
                    #מקטע_עמוד(לרוחב: true, מסגרת: true, סימן_מים: \"טיוטה\", שוליים: 1.5cm)[\
                    דף לרוחב עם מסגרת.]\nהמשך רגיל.";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(out.pages_svg.len() >= 3, "each section should own its pages");
    }

    #[test]
    fn math_formulas() {
        let body = "בשורה #נוסחה_בשורה(\"a^2 + b^2 = c^2\") וגם מוצגת:\n\
                    #נוסחה(\"sum_(i=1)^n i = (n(n+1))/2\", ממוספרת: true)";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn hebrew_numbering_and_header_footer() {
        let cfg = DocConfig {
            hebrew_numbering: true,
            header: "קונטרס".to_string(),
            footer: "בס\"ד".to_string(),
            paper: "us-letter".to_string(),
            ..DocConfig::default()
        };
        let out = compile("#כותרת1[פרק]\n#ממוספרת(פריט[א], פריט[ב])\n#תוכן()", &cfg);
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }
}

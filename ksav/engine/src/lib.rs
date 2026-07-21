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
    if PAGE_APPARATUS_COMMANDS.iter().any(|c| body.contains(c)) {
        3.0
    } else {
        0.0
    }
}

impl Default for DocConfig {
    fn default() -> Self {
        DocConfig {
            font: "Frank Ruhl Hofshi".to_string(),
            size_pt: 12.0,
            margin_cm: 2.5,
            dir: "rtl".to_string(),
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

impl DocConfig {
    /// Read a config from a JSON object, keeping defaults for missing keys.
    pub fn from_json(v: &serde_json::Value) -> DocConfig {
        let mut cfg = DocConfig::default();
        if let Some(f) = v.get("font").and_then(|x| x.as_str()) {
            if !f.is_empty() {
                cfg.font = f.to_string();
            }
        }
        if let Some(s) = v.get("size_pt").and_then(|x| x.as_f64()) {
            cfg.size_pt = s;
        }
        if let Some(m) = v.get("margin_cm").and_then(|x| x.as_f64()) {
            cfg.margin_cm = m;
        }
        if let Some(d) = v.get("dir").and_then(|x| x.as_str()) {
            cfg.dir = d.to_string();
        }
        if let Some(n) = v.get("numbering").and_then(|x| x.as_bool()) {
            cfg.numbering = n;
        }
        if let Some(j) = v.get("justify").and_then(|x| x.as_bool()) {
            cfg.justify = j;
        }
        if let Some(l) = v.get("line_spacing_em").and_then(|x| x.as_f64()) {
            cfg.line_spacing_em = l;
        }
        if let Some(p) = v.get("para_spacing_em").and_then(|x| x.as_f64()) {
            cfg.para_spacing_em = p;
        }
        if let Some(fi) = v.get("first_line_indent_em").and_then(|x| x.as_f64()) {
            cfg.first_line_indent_em = fi;
        }
        if let Some(c) = v.get("columns").and_then(|x| x.as_u64()) {
            cfg.columns = c as u32;
        }
        if let Some(p) = v.get("paper").and_then(|x| x.as_str()) {
            if !p.is_empty() {
                cfg.paper = p.to_string();
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
        if let Some(n) = v.get("notes_region_cm").and_then(|x| x.as_f64()) {
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
    /// PDF bytes for export (None if compilation failed).
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
        self.pdf.is_some()
    }
}

/// Assemble the full Typst source: prelude + document wrapper + user body.
///
/// Kept public so callers (and tests) can inspect exactly what gets compiled.
/// Escape a string for embedding as a Typst string literal, or "none" if empty.
fn typst_str_or_none(s: &str) -> String {
    if s.is_empty() {
        "none".to_string()
    } else {
        format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
    }
}

pub fn assemble_source(body: &str, cfg: &DocConfig) -> String {
    let dir = if cfg.dir == "ltr" { "ltr" } else { "rtl" };
    let columns = cfg.columns.max(1);
    format!(
        "{prelude}\n\
         #show: מסמך.with(\
         גופן: \"{font}\", גודל: {size}pt, שוליים: {margin}cm, כיוון: {dir}, \
         מספור: {numbering}, מספור_עברי: {hebrew_num}, נייר: \"{paper}\", \
         כותרת_עליונה: {header}, כותרת_תחתונה: {footer}, \
         יישור: {justify}, ריווח_שורות: {leading}em, ריווח_פסקאות: {para}em, \
         הזחה_ראשונה: {indent}em, טורים: {columns}, אזור_הערות: {region})\n\n\
         {body}\n",
        prelude = PRELUDE,
        font = cfg.font.replace('"', "\\\""),
        size = cfg.size_pt,
        margin = cfg.margin_cm,
        dir = dir,
        numbering = if cfg.numbering { "true" } else { "false" },
        hebrew_num = if cfg.hebrew_numbering { "true" } else { "false" },
        paper = cfg.paper.replace('"', ""),
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
    let engine = TypstEngine::builder()
        .main_file(source)
        .fonts(fonts)
        .with_static_file_resolver(files)
        .build();
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
    let source = assemble_source(body, cfg);
    let typst_source = source.clone();

    let Warned { output, warnings } = layout_source(source, assets);
    let mut diagnostics = diag_messages(&warnings, "warning");

    match output {
        Ok(doc) => {
            let pdf = typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default()).ok();
            let svg_opts = typst_svg::SvgOptions::default();
            let pages_svg = doc
                .pages()
                .iter()
                .map(|p| typst_svg::svg(p, &svg_opts))
                .collect();
            Compiled {
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
    let v: serde_json::Value = serde_json::from_str(input_json).unwrap_or(serde_json::Value::Null);
    let body = v.get("body").and_then(|x| x.as_str()).unwrap_or("");
    let cfg = DocConfig::from_json(&v);
    let assets = Assets::from_json(&v);

    // `{"format": "html"}` asks for the web export instead of a paged render.
    if v.get("format").and_then(|x| x.as_str()) == Some("html") {
        return match compile_html(body, &cfg, &assets) {
            Ok(html) => serde_json::json!({ "ok": true, "html": html, "diagnostics": [] }),
            Err(diags) => serde_json::json!({
                "ok": false,
                "html": serde_json::Value::Null,
                "diagnostics": diags
                    .iter()
                    .map(|d| serde_json::json!({ "severity": d.severity, "message": d.message }))
                    .collect::<Vec<_>>(),
            }),
        }
        .to_string();
    }

    let result = compile_with(body, &cfg, &assets);
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
        assert!(out.pages_svg.len() >= 1);
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

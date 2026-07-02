//! Ksav engine — compiles Hebrew "Ksav" markup into real Typst output.
//!
//! The Hebrew commands are *actual Typst functions* defined in `typst/ksav.typ`.
//! We prepend that prelude to the user's document, inject a `#show: מסמך.with(...)`
//! wrapper driven by the editor settings, then run the genuine Typst compiler to
//! produce a PDF and per-page SVG previews.

use typst::diag::{SourceDiagnostic, Warned};
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;

pub mod commands;
pub mod server;
pub mod templates;

/// The Hebrew prelude, embedded at build time.
const PRELUDE: &str = include_str!("../typst/ksav.typ");

// Bundled Hebrew fonts (self-contained output, no system dependency).
const FONT_FRANK_REG: &[u8] = include_bytes!("../assets/fonts/FrankRuhlHofshi-Regular.otf");
const FONT_FRANK_BOLD: &[u8] = include_bytes!("../assets/fonts/FrankRuhlHofshi-Bold.otf");
const FONT_DAVID_REG: &[u8] = include_bytes!("../assets/fonts/DavidLibre-Regular.ttf");
const FONT_DAVID_BOLD: &[u8] = include_bytes!("../assets/fonts/DavidLibre-Bold.ttf");
const FONT_CASCADIA: &[u8] = include_bytes!("../assets/fonts/CascadiaMono.ttf");

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
    /// Number of text columns (1 = single column).
    pub columns: u32,
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
            columns: 1,
        }
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
pub fn assemble_source(body: &str, cfg: &DocConfig) -> String {
    let dir = if cfg.dir == "ltr" { "ltr" } else { "rtl" };
    let columns = cfg.columns.max(1);
    format!(
        "{prelude}\n\
         #show: מסמך.with(\
         גופן: \"{font}\", גודל: {size}pt, שוליים: {margin}cm, כיוון: {dir}, \
         מספור: {numbering}, יישור: {justify}, ריווח_שורות: {leading}em, טורים: {columns})\n\n\
         {body}\n",
        prelude = PRELUDE,
        font = cfg.font.replace('"', "\\\""),
        size = cfg.size_pt,
        margin = cfg.margin_cm,
        dir = dir,
        numbering = if cfg.numbering { "true" } else { "false" },
        justify = if cfg.justify { "true" } else { "false" },
        leading = cfg.line_spacing_em,
        columns = columns,
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

/// Compile Hebrew Ksav markup into PDF + SVG previews.
pub fn compile(body: &str, cfg: &DocConfig) -> Compiled {
    let source = assemble_source(body, cfg);
    let typst_source = source.clone();

    let engine = TypstEngine::builder()
        .main_file(source)
        .fonts([
            FONT_FRANK_REG,
            FONT_FRANK_BOLD,
            FONT_DAVID_REG,
            FONT_DAVID_BOLD,
            FONT_CASCADIA,
        ])
        .build();

    let Warned { output, warnings } = engine.compile::<PagedDocument>();
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

#[cfg(test)]
mod tests {
    use super::*;

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
}

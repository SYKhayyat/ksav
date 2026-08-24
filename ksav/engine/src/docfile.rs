//! What is actually inside a `.ksav` file.
//!
//! # The finding this answers
//!
//! A `.ksav` is *plain text when it can be and JSON when it cannot*. The rule
//! lives in `app/src/docs.ts`: `serializeDoc` returns the body unchanged unless
//! the document carries assets, its own custom commands, or page setup of its
//! own, and wraps it in `{"format": "ksav-document", ...}` when it does. The
//! plain-text case is deliberate and worth keeping — a sefer stays diffable,
//! greppable and openable in any editor.
//!
//! That rule was written on the browser side and told to nobody else. The CLI
//! read every `.ksav` with `read_to_string` and compiled whatever came back, so
//! a document with one image in it compiled **its own JSON wrapper as prose**
//! and reported `compiled ... (16 page(s))` over a PDF of `{"format": ...}`.
//! Its usage line said `ksav <input.ksav>` the whole time. The Emacs package
//! put `.ksav` in `auto-mode-alist` and had the same hole from the other end.
//!
//! Two quieter lies rode along even when the file *was* plain text: the CLI
//! compiled with `DocConfig::default()`, so a document's own paper, margins and
//! direction were dropped and the PDF was not the one the application renders;
//! and nothing outside the browser had ever heard of `customCommands`, so a
//! document that defines its own command could not compile anywhere else.
//!
//! # Why this module rather than a second reader
//!
//! There is one authority for the format and it is `parseDoc`. This is the
//! second implementation of it, which the house rule allows only with an oracle
//! both sides are executed against: `app/tools/emit-docfile-oracle.mjs` runs the
//! real `parseDoc` over a corpus and writes down what it believes, and
//! `tests/docfile_oracle.rs` fails when this file disagrees. The corpus is
//! generated from `serializeDoc` — so the two functions that have to agree are
//! the two the fixture is made of — plus the malformed cases nobody serialises
//! on purpose.
//!
//! The parsing itself is deliberately thin: `DocConfig::from_json` and
//! `Assets::from_request` already exist, already validate, and are what the
//! server calls on the same field names. A `.ksav` is one shape away from a
//! compile request, and this module is that shape.

use crate::assets::Assets;
use crate::DocConfig;

/// The magic string. Restated from `docs.ts`'s `FILE_MAGIC` — and the oracle is
/// what keeps the restatement honest, because a corpus built by `serializeDoc`
/// carries whatever `docs.ts` actually writes.
const FILE_MAGIC: &str = "ksav-document";

/// A `.ksav` file, read.
pub struct DocFile {
    /// The document's own title, when the file carries one. `None` for a plain
    /// text file, which has nowhere to put one — the caller falls back to the
    /// filename, exactly as `parseDoc` falls back to a caller-supplied title.
    pub title: Option<String>,
    /// The writer's text, with no preamble in front of it. Use [`DocFile::source`]
    /// for what the compiler should actually be handed.
    pub body: String,
    /// The document's own page setup, or the shipped defaults.
    pub cfg: DocConfig,
    /// Images and fonts carried with the document.
    pub assets: Assets,
    /// Asset hashes referenced with no bytes behind them. A file always carries
    /// its bytes, so this is empty for a well-formed document and non-empty only
    /// for a hand-edited one; it is reported rather than dropped, because a
    /// missing image is a diagnostic and not a reason to refuse the document.
    pub missing_assets: Vec<String>,
    /// The document's own `#let` commands, empty when it has none.
    pub custom: String,
}

impl DocFile {
    /// The text to compile: the custom-command preamble, then the body.
    ///
    /// Spelt the same way `compile.ts::withPreamble` spells it — the preamble,
    /// a blank line, the writer's first line — because a diagnostic's line
    /// number is counted in what the compiler was handed, and a client that put
    /// a different number of lines in front would report a different line for
    /// the same mistake. [`DocFile::preamble_lines`] is that count, so a caller
    /// can subtract it and name the writer's line instead.
    pub fn source(&self) -> String {
        let custom = self.custom.trim();
        if custom.is_empty() {
            return self.body.clone();
        }
        let mut out = String::with_capacity(custom.len() + self.body.len() + 2);
        out.push_str(custom);
        out.push_str("\n\n");
        out.push_str(&self.body);
        out
    }

    /// How many lines sit in front of the writer's first one in
    /// [`DocFile::source`].
    pub fn preamble_lines(&self) -> usize {
        let custom = self.custom.trim();
        if custom.is_empty() {
            0
        } else {
            custom.lines().count() + 1
        }
    }
}

/// Read a `.ksav`, in either of its two forms.
///
/// **Never fails.** `parseDoc` does not either, and for the same reason: JSON
/// that does not parse, or parses to something that is not one of ours, is a
/// text document that happens to begin with a brace. Refusing it would be
/// refusing a legitimate file on the strength of its first character.
pub fn read(text: &str) -> DocFile {
    // The cheap test first, and it is the common case: a sefer is plain text.
    // `trim_start` rather than a raw index because `serializeDoc`'s output is
    // pretty-printed by whoever last saved it and a leading newline is legal
    // JSON — the same reason `parseDoc` trims before looking.
    if !text.trim_start().starts_with('{') {
        return plain(text);
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text) else {
        return plain(text);
    };
    if v.get("format").and_then(|x| x.as_str()) != Some(FILE_MAGIC) {
        return plain(text);
    }

    // A wrapper whose `body` is missing or is not a string is still one of ours
    // — the magic says so — and `parseDoc` reads it as an empty document rather
    // than as its own JSON. Reading it as text here would put the wrapper on the
    // page, which is the bug this module exists to end.
    let body = v
        .get("body")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();

    let title = v
        .get("title")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let cfg = match v.get("config") {
        Some(c) => DocConfig::from_json(c),
        None => DocConfig::default(),
    };

    // One `assets` array in the file, two lists for the engine: read in one
    // pass over references, with no clone of the entries on the way through.
    // See `Assets::from_docfile`.
    let (assets, missing_assets) = Assets::from_docfile(v.get("assets"));

    let custom = v
        .get("customCommands")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();

    DocFile {
        title,
        body,
        cfg,
        assets,
        missing_assets,
        custom,
    }
}

/// A file that is its own body.
fn plain(text: &str) -> DocFile {
    DocFile {
        title: None,
        body: text.to_string(),
        cfg: DocConfig::default(),
        assets: Assets::default(),
        missing_assets: Vec::new(),
        custom: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_is_a_document() {
        let d = read("#bold[hello]\n");
        assert_eq!(d.body, "#bold[hello]\n");
        assert!(d.title.is_none());
        assert!(d.custom.is_empty());
        assert_eq!(d.source(), "#bold[hello]\n");
    }

    #[test]
    fn a_wrapper_is_unwrapped() {
        let d = read(r#"{"format":"ksav-document","version":1,"title":"kuntres","body":"shalom"}"#);
        assert_eq!(d.body, "shalom");
        assert_eq!(d.title.as_deref(), Some("kuntres"));
    }

    /// The whole point: the wrapper must never reach the page.
    #[test]
    fn the_wrapper_never_becomes_prose() {
        let d = read(r#"{"format":"ksav-document","version":1,"body":"shalom"}"#);
        assert!(!d.source().contains("ksav-document"));
        assert_eq!(d.source(), "shalom");
    }

    /// A text document that opens with a brace is a text document.
    #[test]
    fn a_brace_is_not_a_wrapper() {
        for text in [
            "{ this is prose }",
            r#"{"format":"something-else","body":"x"}"#,
            r##"{"format":"ksav-document","body":"truncated"##,
            "{",
        ] {
            assert_eq!(read(text).body, text, "{text:?} was unwrapped");
        }
    }

    /// An empty title is no title, so the caller falls back to the filename
    /// rather than naming the document with an empty string.
    #[test]
    fn an_empty_title_is_no_title() {
        assert!(read(r#"{"format":"ksav-document","title":"","body":"x"}"#)
            .title
            .is_none());
        assert!(read(r#"{"format":"ksav-document","title":7,"body":"x"}"#)
            .title
            .is_none());
    }

    /// Ours, but malformed: an empty document, never its own JSON.
    #[test]
    fn a_wrapper_with_no_body_is_empty() {
        for text in [
            r#"{"format":"ksav-document","version":1}"#,
            r#"{"format":"ksav-document","body":null}"#,
            r#"{"format":"ksav-document","body":42}"#,
        ] {
            assert_eq!(read(text).body, "", "{text:?}");
        }
    }

    #[test]
    fn page_setup_travels() {
        let d = read(r#"{"format":"ksav-document","body":"x","config":{"size_pt":17.5}}"#);
        assert_eq!(d.cfg.size_pt, 17.5);
        assert_eq!(
            read(r#"{"format":"ksav-document","body":"x"}"#).cfg.size_pt,
            DocConfig::default().size_pt,
            "a file with no config is laid out the shipped way"
        );
    }

    #[test]
    fn custom_commands_go_in_front() {
        let d = read(
            r##"{"format":"ksav-document","body":"#emph[a]","customCommands":"#let emph(x) = x"}"##,
        );
        assert_eq!(d.source(), "#let emph(x) = x\n\n#emph[a]");
        assert_eq!(d.preamble_lines(), 2);
        assert_eq!(
            read(r#"{"format":"ksav-document","body":"x"}"#).preamble_lines(),
            0
        );
    }

    /// Whitespace-only custom commands are no preamble at all — otherwise every
    /// diagnostic in such a document is reported two lines off.
    #[test]
    fn blank_custom_commands_are_no_preamble() {
        let d = read(r#"{"format":"ksav-document","body":"x","customCommands":"   \n  "}"#);
        assert_eq!(d.source(), "x");
        assert_eq!(d.preamble_lines(), 0);
    }

    #[test]
    fn fonts_and_images_are_told_apart() {
        let d = read(
            r#"{"format":"ksav-document","body":"x","assets":[
                 {"name":"logo.png","kind":"image","data":"aGk="},
                 {"name":"f.ttf","kind":"font","data":"aGk="},
                 {"name":"old.png","data":"aGk="}]}"#,
        );
        assert_eq!(d.assets.files.len(), 2, "image, plus the one with no kind");
        assert_eq!(d.assets.fonts.len(), 1);
        assert_eq!(d.assets.files[0].name, "logo.png");
        assert_eq!(d.assets.fonts[0].name, "f.ttf");
    }

    /// A hash with no bytes behind it is reported, not silently dropped.
    #[test]
    fn a_missing_asset_is_named() {
        let d = read(
            r#"{"format":"ksav-document","body":"x","assets":[
                 {"name":"gone.png","kind":"image","hash":"0000000000000000"}]}"#,
        );
        assert!(d.assets.files.is_empty());
        assert_eq!(d.missing_assets, vec!["0000000000000000".to_string()]);
    }
}

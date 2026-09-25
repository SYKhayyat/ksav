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

    /// What a writer should be told about this file before trusting its output.
    ///
    /// One list, one place, because these are the sentences a client prints and
    /// a second formatter is a second wording. `main.rs` has been formatting
    /// `missing_assets` itself; this is where the custom-command one lives, and
    /// putting them side by side is the only way a reader can tell whether the
    /// two are saying the same kind of thing.
    ///
    /// # The custom-command advisory, and what it does *not* say
    ///
    /// A `.ksav` may carry a `#let` preamble, and [`DocFile::source`] puts it in
    /// front of the body, so opening the file **runs** it. Every client has to
    /// say so; none of them did.
    ///
    /// What the advisory deliberately does not claim is that arbitrary code ran.
    /// Two measurements, both in this crate, bound it:
    ///
    ///   - **No network, and no disk outside `packages/`.** `typst-as-lib` offers
    ///     a package resolver that downloads; this one does not take it, and
    ///     builds a resolver whose root *is* the bundled package directory — so
    ///     "a document cannot reach anything else on the disk through it" is
    ///     `lib.rs`'s own comment on `packages_root`, not an inference.
    ///   - **A bounded run.** `server.rs` compiles on its own thread and the pool
    ///     thread only *waits* for it with a timeout, so a preamble that loops
    ///     forever costs a timeout rather than the process.
    ///
    /// So the honest statement is the small one: the document runs the commands
    /// it carries, they can change what the page says, and here they are. A
    /// warning that said "arbitrary code" would be wrong in both directions —
    /// it would send a reader looking for an attack that the sandbox forecloses,
    /// and it would make the real, smaller fact easy to dismiss.
    pub fn advisories(&self) -> Vec<String> {
        let mut out = Vec::new();
        for name in &self.missing_assets {
            out.push(format!(
                "refers to an asset that is not in the file ({name})"
            ));
        }
        let custom = self.custom.trim();
        if !custom.is_empty() {
            let names = defined_let_names(custom);
            let count = custom.lines().count();
            out.push(format!(
                "defines its own commands and they are compiled with it: \
                 {} command{} ({} line{}) — {}",
                names.len(),
                if names.len() == 1 { "" } else { "s" },
                count,
                if count == 1 { "" } else { "s" },
                if names.is_empty() {
                    "none this reader can name, so read the preamble yourself".to_string()
                } else {
                    names.join(", ")
                }
            ));
        }
        out
    }
}

/// The names a preamble binds, in the order it declares them.
///
/// A hand-rolled scan, and the reason it is here rather than in the caller is
/// that **this crate has no regex dependency** and the same twelve lines are
/// wanted by [`DocFile::advisories`] and by the app's `commands.ts::definedIn`.
/// The two must agree, and the agreement that can be run is a test comparing
/// them over the corpus in `tests/docfile_oracle.rs`; the agreement that cannot
/// is somebody reading both and deciding they look the same.
///
/// Both forms of binding are accepted — `#let` and a bare `let` — because a
/// preamble is prepended to a document and a writer reasonably writes either,
/// which is the app's own reason and it is as good a one.
fn defined_let_names(preamble: &str) -> Vec<String> {
    let chars: Vec<char> = preamble.chars().collect();
    let ident = |c: char| c.is_alphanumeric() || c == '_';
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        // `let` at a **word start**, optionally introduced by `#`. The word-start
        // test is what stops `#letter = 3` reading as a `let` of `ter` — without
        // it the scan finds the `let` inside a longer name, which is the shape a
        // naive `match_indices("let")` gets wrong and the shape that would make
        // the advisory name commands the preamble does not define.
        let hashed = chars[i] == '#';
        let start = if hashed { i + 1 } else { i };
        if i.checked_sub(1).and_then(|p| chars.get(p)).is_some_and(|c| ident(*c)) {
            i += 1;
            continue;
        }
        let word: String = chars[start.min(chars.len())..].iter().take(3).collect();
        if !word.eq_ignore_ascii_case("let") {
            i += 1;
            continue;
        }
        // …and the other end of it: `let` must be the **whole** word, so
        // `#letter = 3` is not a `let` of `ter`. The preceding-character test
        // above cannot see that one, because the `#` in front is not a word
        // character and `ter` is a perfectly good identifier tail.
        let after = start + 3;
        if chars.get(after).is_some_and(|c| ident(*c)) {
            i = after;
            continue;
        }
        let mut j = after;
        while j < chars.len() && chars[j].is_whitespace() {
            j += 1;
        }
        let name: String = chars[j..].iter().take_while(|c| ident(**c)).collect();
        if !name.is_empty() {
            out.push(name);
        }
        i = j.max(i + 1);
    }
    out
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

#[cfg(test)]
mod advisory_tests {
    use super::*;

    /// A wrapper the way `serializeDoc` writes one.
    ///
    /// Built by `serde_json` rather than by hand, because a hand-built one is
    /// wrong in a way that hides the test: a raw newline inside a JSON string is
    /// not a newline, and `read` answers invalid JSON with `plain()` — as it
    /// should — so the fixture loses its preamble and the assertion below fails
    /// for a reason that has nothing to do with the advisory.
    fn wrapped(custom: &str) -> String {
        serde_json::json!({
            "format": FILE_MAGIC,
            "version": 1,
            "body": "shalom",
            "customCommands": custom,
        })
        .to_string()
    }

    /// The finding, as a predicate: a `.ksav` that runs code says so.
    ///
    /// Before this there was no signal at all on this path. The CLI compiled the
    /// preamble, printed a success line and wrote a PDF; the Emacs client did the
    /// same from the other end. So the first assertion is the one the issue asked
    /// for — a document carrying commands produces an advisory — and the rest are
    /// about that advisory being *true*, because a warning that overstates is
    /// worse than none: it sends a reader looking for an attack the sandbox
    /// forecloses, and it makes the real and smaller fact easy to wave away.
    #[test]
    fn a_file_that_defines_commands_says_so() {
        let d = read(&wrapped("#let דגש(x) = strong(x)\n#let h2 = heading(level: 2)"));
        let said = d.advisories();
        assert_eq!(said.len(), 1, "{said:?}");
        let line = &said[0];
        assert!(
            line.contains("compiled with it"),
            "the advisory must say the commands run, not merely that they exist: {line}"
        );
        assert!(line.contains("דגש"), "and name them: {line}");
        assert!(line.contains("h2"), "all of them: {line}");
        assert!(line.contains("2 commands"), "and count them: {line}");
        assert!(line.contains("2 lines"), "and the size: {line}");
    }

    /// A plain document says nothing, which is the other half.
    ///
    /// An advisory on every file is an advisory nobody reads, and this is the
    /// overwhelmingly common case: a sefer with no preamble of its own.
    #[test]
    fn a_plain_document_says_nothing() {
        assert!(read("#bold[hello]\n").advisories().is_empty());
        assert!(read(&wrapped("   \n  ")).advisories().is_empty());
    }

    /// Both advisory kinds in one list, and neither shadowing the other.
    ///
    /// The missing-asset warning predates this one and `main.rs` used to format
    /// it itself. One list is the reason a second kind could be added without a
    /// second wording, so both have to come out of the same call.
    #[test]
    fn a_missing_asset_and_a_preamble_are_both_reported() {
        let d = read(
            r##"{"format":"ksav-document","version":1,"body":"x",
                "customCommands":"#let mine(x) = x",
                "assets":[{"name":"logo.png","hash":"0000000000000000"}]}"##,
        );
        assert_eq!(d.missing_assets, vec!["0000000000000000".to_string()]);
        let said = d.advisories();
        assert_eq!(said.len(), 2, "{said:?}");
        assert!(said[0].contains("not in the file"), "{said:?}");
        assert!(said[1].contains("mine"), "{said:?}");
    }

    /// The names, and the two binding spellings.
    ///
    /// `commands.ts::definedIn` is the app's copy of this and the two must agree:
    /// the palette lists the document's commands under a "from document" chip, and
    /// an advisory that named a different set would contradict the panel a writer
    /// is looking at. The shapes that break a naive scan are here — `let` with no
    /// hash, a hash with no `let`, the word `let` inside a longer word, and a
    /// Hebrew identifier, which is the whole point of the language.
    #[test]
    fn the_names_come_out_right() {
        assert_eq!(defined_let_names("#let a(x) = x"), vec!["a"]);
        assert_eq!(defined_let_names("let b = 1"), vec!["b"]);
        assert_eq!(defined_let_names("#let דגש(x) = strong(x)"), vec!["דגש"]);
        // A word containing `let`, and a `#` that introduces nothing.
        assert_eq!(defined_let_names("#letter = 3\n#let = 4"), Vec::<String>::new());
        assert_eq!(
            defined_let_names("#let first = 1\n#let second = 2"),
            vec!["first", "second"]
        );
        // Both spellings, and the order they are written in.
        assert_eq!(defined_let_names("let a = 1\n#let b = 2"), vec!["a", "b"]);
    }

    /// The advisory never claims more than is true.
    ///
    /// Two claims this repository can actually back, both measured in the crate:
    /// packages are bundled and never fetched, and the resolver's root is the
    /// package directory. So a preamble cannot reach the network and cannot
    /// reach the writer's files. A warning saying "arbitrary code" would be
    /// wrong, and this assertion is what stops somebody improving the wording
    /// into it.
    #[test]
    fn the_advisory_does_not_claim_the_wrong_thing() {
        let said = read(&wrapped("#let x = 1")).advisories().join(" ");
        for overclaim in ["arbitrary", "malicious", "untrusted", "attack", "exploit"] {
            assert!(
                !said.to_lowercase().contains(overclaim),
                "the advisory overclaims with {overclaim:?}: {said}"
            );
        }
        // And it does say the true thing.
        assert!(said.contains("compiled with it"), "{said}");
    }
}

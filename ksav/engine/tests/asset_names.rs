//! Asset names, checked before the resolver is asked.
//!
//! # What the issue said, and what is actually there
//!
//! #52: *"asset names unvalidated; `ksav.typ` shadows the prelude"*, with the
//! impact *"a request/`.ksav` with an asset named `ksav.typ` (or absolute/`../..`)
//! replaces or confuses the trusted prelude"*.
//!
//! Measured, the two halves come out differently, and the one that is not in the
//! report is the one that matters.
//!
//! **The shadowing is closed, by resolver order.** `main_source` does
//! `#import "ksav.typ"`, and the chain is
//! `with_static_source_file_resolver([prelude_source()])` **then**
//! `with_static_file_resolver(files)`, so the prelude is consulted first. A
//! document carrying an asset called `ksav.typ` gets its asset shadowed: the
//! attacker's `#let`s never bind and their command is reported as unknown. That
//! is a confusing no-op, not a compromise — and `ksav.TYP` is inert too, because
//! `VirtualPath` is case-sensitive. `nothing_replaces_the_prelude` below is that
//! measurement as a test.
//!
//! **`..` and `\` in a name are a denial of service.** `typst-as-lib` builds a
//! `VirtualPath` from the name and `.expect()`s it
//! (`conversions.rs:23`, `valid virtual path: Escapes` / `: Backslash`). There is
//! no `catch_unwind` in this crate or in `server.rs`, so one unauthenticated
//! request to `ksav serve` with an asset named `../x.png` takes the worker
//! thread down with it. Running the names through `compile_with` is how that was
//! found: the process printed the panic and died. That is the reason
//! `diagnose_name` exists.
//!
//! So the issue's *impact* is wrong and its *fix list* is right, for a worse
//! reason. Every rule below is here because a name reaches something that panics,
//! escapes, or can never be resolved — and the `ksav.typ` rule is here because a
//! name the resolver will never reach is a name that should not be accepted, since
//! the chain is a two-line change and a plausible one.

use ksav_engine::assets::{diagnose_name, Assets, Refused};
use ksav_engine::{compile_with, DocConfig};
use std::sync::Arc;

/// The file an attacker would ship under a name the resolver would find.
const NOT_A_PRELUDE: &[u8] = b"#let attack() = [ATTACKED]\n#let bold(x) = x\n";

fn asset(name: &str) -> Assets {
    Assets {
        files: vec![ksav_engine::assets::Asset {
            name: name.to_string(),
            bytes: Arc::new(NOT_A_PRELUDE.to_vec()),
        }],
        fonts: Vec::new(),
    }
}

/// The panic, as a test.
///
/// This is the finding. Before the gate, this request killed the process; the
/// assertion that it does not is the whole reason `diagnose_name` is a gate
/// rather than a check on one field.
#[test]
fn a_name_that_steps_outside_the_folder_is_refused_rather_than_resolved() {
    for name in [
        "../x.png",
        "a/../../b.png",
        "..\\x.png",
        "C:\\x.png",
        "C:/x.png",
        "/etc/passwd",
    ] {
        let why = diagnose_name(name).unwrap_or_else(|| panic!("{name:?} was accepted"));
        assert!(
            why.contains("..") || why.contains("absolute") || why.contains("outside"),
            "the refusal for {name:?} should say why: {why}"
        );
    }
}

/// The two names that panicked, named apart from the rest.
///
/// Not decoration: `..` and `\` are refused because they *kill the process*, and
/// the other rules are refused because they are wrong. A test that only checked
/// the first would pass on a gate that only checked the first.
#[test]
fn the_two_that_panicked_are_refused_before_anything_is_read() {
    // And the whole point: the compile does not happen at all, so nothing can
    // panic. A gate placed *after* the resolver would be too late and this test
    // would find out the hard way.
    for name in ["../x.png", "C:\\x.png"] {
        let out = compile_with("#שער[מסמך]\n\nשלום\n", &DocConfig::default(), &asset(name));
        assert!(out.ok, "{name:?}: the document should still typeset");
    }
}

/// A legitimate name is a legitimate name.
///
/// The other half, and the one a rule written from a threat model always loses:
/// every shape a writer might actually attach has to survive. A gate that refuses
/// `a..b.png` or `my logo.png` refuses something a person wanted, and the next
/// person removes the gate.
#[test]
fn ordinary_names_are_accepted() {
    for name in [
        "logo.png",
        "sub/dir/photo.jpeg",
        "a..b.png",
        "my logo.png",
        "שם-בעברית.png",
        "logo.PNG",
        "logo.svg",
        "x.png?query=1",
        "..hidden.png",
        "a.b..c.png",
        "2026-09-25_scan.png",
    ] {
        assert_eq!(diagnose_name(name), None, "{name:?} was refused");
    }
}

/// Nothing a document carries replaces the prelude.
///
/// The measurement from the issue, as a test, and it is the half that says the
/// impact was wrong. The attacker's file defines `bold` and `attack`; if the
/// asset were reachable as `ksav.typ` then `attack` would resolve and `ATTACKED`
/// would print.
#[test]
fn nothing_replaces_the_prelude() {
    for name in ["ksav.typ", "ksav.TYP", "sub/ksav.typ"] {
        let out = compile_with(
            "#שער[מסמך]\n\n#import \"ksav.typ\": *\n\n#attack()\n",
            &DocConfig::default(),
            &asset(name),
        );
        let printed = out.pages_svg.concat();
        assert!(
            !printed.contains("ATTACKED"),
            "an asset named {name:?} reached the compiler as the prelude"
        );
        assert!(
            out.diagnostics.iter().any(|d| d.message.contains("attack")),
            "{name:?}: `#attack` should be reported as unknown, so the asset was shadowed"
        );
    }
}

/// A refusal is announced, and announced as a refusal.
///
/// The house rule: a feature that is broken *and silent* is worse than one that
/// is broken and says so. A refused asset that vanished would leave a document
/// with a hole in it and nothing to explain it — so the refusal rides back as a
/// **warning** diagnostic, in both languages the client reads.
#[test]
fn a_refusal_is_announced() {
    let v = serde_json::json!({
        "body": "שלום",
        "assets": [
            { "name": "../x.png", "data": "AAAA" },
            { "name": "logo.png", "data": "AAAA" },
        ],
    });
    let (assets, missing, refused) = Assets::from_request(&v);
    assert_eq!(
        assets.files.len(),
        1,
        "the good one survives: {:?}",
        assets.files.len()
    );
    assert_eq!(assets.files[0].name, "logo.png");
    assert!(missing.is_empty());
    check_refusal(&refused);
}

/// …through the **document file** path too, which is a different reader.
///
/// `from_docfile` used to be a second implementation of the same rule with the
/// same hole in it. A gate on one reader and not the other is a gate that is
/// bypassed by opening the file rather than sending a request, which is the
/// easier thing to do.
#[test]
fn a_refusal_is_announced_from_a_document_file_too() {
    // `from_docfile` takes the **array**, not the object holding it — the
    // document-file shape, which is one array split by each entry's own `kind`.
    let v = serde_json::json!([{ "name": "C:\\x.png", "data": "AAAA" }]);
    let (assets, _missing, refused) = Assets::from_docfile(Some(&v));
    assert!(assets.files.is_empty());
    check_refusal(&refused);
}

fn check_refusal(refused: &Refused) {
    assert!(!refused.is_empty(), "nothing was reported: {refused:?}");
    let diags = refused.diagnostics();
    assert_eq!(diags.len(), refused.names.len());
    for d in &diags {
        assert_eq!(
            d.severity, "warning",
            "a refusal is a warning, not a broken sefer"
        );
        // Bilingual, because the client reads it in whichever language the writer
        // is working in, and a name in a diagnostic is the whole content.
        assert!(d.message.contains('“') || d.message.contains('"'));
    }
}

/// A control character cannot end its own sentence in a diagnostic.
///
/// A diagnostic reaches a page and a terminal, and an asset named `logo\n.png`
/// must not be able to write a second line into either.
#[test]
fn a_control_character_is_refused_and_escaped_in_the_reason() {
    let why = diagnose_name("logo\n.png").expect("a newline in a name is refused");
    assert!(why.contains("\\u{a}"), "the reason should show it: {why}");
    assert!(!why.contains('\n'), "and must not carry it: {why}");
    assert!(
        diagnose_name("logo\u{0}.png").is_some(),
        "a NUL in a name is refused too"
    );
}

/// The rule's own floor.
///
/// A gate that refused everything would pass every assertion above except this
/// one, and `nothing_the_engine_emits_is_refused` in the client is about a
/// different list.
#[test]
fn the_gate_does_not_refuse_an_ordinary_document() {
    // The shapes the editor actually sends: a flat `name`, a `data:` URL as the
    // bytes, and a hash-only entry for an unchanged image. All three must read
    // through untouched, or every document with an image stops previewing.
    let v = serde_json::json!({
        "assets": [
            { "name": "logo.png", "data": "data:image/png;base64,AAAA" },
            { "name": "photo.jpg", "hash": "abc123" },
        ],
        "fonts": [{ "name": "Custom.ttf", "data": "AAAA" }],
    });
    let (assets, _missing, refused) = Assets::from_request(&v);
    assert!(refused.is_empty(), "{refused:?}");
    assert_eq!(assets.files.len(), 1, "the data: entry");
    assert_eq!(assets.fonts.len(), 1, "the font");
}

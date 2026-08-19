//! `docfile::read`, held to what the editor believes a `.ksav` file is.
//!
//! # The finding this answers
//!
//! A `.ksav` is plain text when it can be and JSON when it cannot — the wrapper
//! appears the moment a document carries an image, its own page setup, or its
//! own commands. `app/src/docs.ts` decides that, and for the whole life of the
//! format it was the only thing that knew.
//!
//! So `main.rs` compiled a JSON-form document's **wrapper** as prose, printed
//! `compiled ... (16 page(s))`, exited 0, and wrote a PDF of `{"format":
//! "ksav-document", ...}`. Its usage line said `ksav <input.ksav>` throughout.
//! The Emacs package put `.ksav` in `auto-mode-alist` and had the same hole.
//!
//! `src/docfile.rs` is the second implementation of that format. Two
//! implementations are allowed here only with an oracle both are executed
//! against, and the unit tests beside `docfile.rs` are not one: they were
//! written by somebody who already held a belief about the format, which is the
//! exact class of test that stayed green while the CLI compiled JSON.
//!
//! # What is compared
//!
//! `app/tools/emit-docfile-oracle.mjs` runs the real `parseDoc` over a corpus
//! and writes down five claims per file. Every one of them is a place the two
//! sides can silently disagree:
//!
//!   1. **Wrapped or not** — the decision the CLI got wrong. Both directions:
//!      a wrapper must be unwrapped, and prose that merely opens with a brace
//!      must survive to the byte.
//!   2. **The body**, exactly. This is what reaches the page.
//!   3. **The title**, with the empty string and a non-string reading as no
//!      title, so the caller falls back to the filename.
//!   4. **The custom-command preamble**, which nothing outside the browser had
//!      ever heard of.
//!   5. **Which asset list each entry lands in**, images against fonts.
//!   6. **Which page-setup keys survive the read**, and their values — the one
//!      that catches a renamed `DocConfig` field, since the editor's key names
//!      are the engine's field names and nothing enforced that.
//!
//! The corpus is mostly `serializeDoc`'s own output, so the two functions that
//! have to agree are the two the fixture is made of. The rest is what no
//! serialiser writes: truncated wrappers, wrong magic, a `body` that is not a
//! string, prose in braces.

use ksav_engine::docfile;
use serde_json::Value;

const FIXTURE: &str = include_str!("fixtures/docfile-oracle.json");

/// Two JSON values, compared as the two languages mean them.
///
/// `11` from JavaScript and `11.0` out of a Rust `f64` are the same page-setup
/// value and different `serde_json::Value`s — JSON has one number type and
/// neither side is wrong. Everything else is compared as itself.
fn same(a: &Value, b: &Value) -> bool {
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => x == y,
        _ => a == b,
    }
}

fn fixture() -> Vec<Value> {
    let v: Value = serde_json::from_str(FIXTURE).expect("the fixture is JSON");
    v["docs"].as_array().expect("docs is an array").clone()
}

/// A corpus that shrank is a corpus that stopped covering something, and it
/// would otherwise pass in silence — every assertion below is inside a loop.
#[test]
fn the_corpus_is_there() {
    let docs = fixture();
    assert!(
        docs.len() >= 60,
        "the corpus is {} documents; it was 69 when this was written. \
         Regenerate with `node tools/emit-docfile-oracle.mjs`.",
        docs.len()
    );
    let wrapped = docs.iter().filter(|d| d["wrapped"] == true).count();
    assert!(wrapped >= 20, "only {wrapped} wrapped documents");
    assert!(docs.len() - wrapped >= 20, "too few plain-text documents");
}

#[test]
fn the_body_is_the_body() {
    for d in fixture() {
        let id = d["id"].as_str().unwrap();
        let text = d["text"].as_str().unwrap();
        let got = docfile::read(text);

        // The decision the CLI got wrong, asserted as itself rather than
        // inferred from the body: a file is one of ours, or it is its own text.
        let wrapped = d["wrapped"].as_bool().unwrap();
        assert_eq!(
            got.body != text,
            wrapped,
            "{id}: the editor says wrapped={wrapped} and the engine disagrees"
        );
        if !wrapped {
            assert_eq!(got.body, text, "{id}: a text document was altered");
        }
        assert_eq!(
            got.body,
            d["body"].as_str().unwrap(),
            "{id}: the bodies differ"
        );
        // Whatever else is true, the wrapper never reaches the page — unless
        // the writer's own text is a piece of JSON, which is a document
        // somebody documenting Ksav really writes and is in the corpus for
        // that reason.
        if wrapped && !d["body"].as_str().unwrap().contains("\"format\"") {
            assert!(
                !got.source().contains("\"format\""),
                "{id}: the wrapper is in the source"
            );
        }
    }
}

#[test]
fn the_title_is_the_title() {
    for d in fixture() {
        let id = d["id"].as_str().unwrap();
        let got = docfile::read(d["text"].as_str().unwrap());
        assert_eq!(
            got.title.as_deref(),
            d["title"].as_str(),
            "{id}: the titles differ"
        );
    }
}

#[test]
fn the_preamble_is_the_preamble() {
    for d in fixture() {
        let id = d["id"].as_str().unwrap();
        let got = docfile::read(d["text"].as_str().unwrap());
        let want = d["custom"].as_str().unwrap();
        assert_eq!(got.custom, want, "{id}: the custom commands differ");

        // And what it means for the text the compiler is handed: the preamble
        // in front, a blank line, then the writer's first line — the spelling
        // `compile.ts::withPreamble` uses, because a diagnostic's line number is
        // counted in what the compiler was given.
        if want.trim().is_empty() {
            assert_eq!(
                got.source(),
                got.body,
                "{id}: an empty preamble moved lines"
            );
            assert_eq!(got.preamble_lines(), 0, "{id}");
        } else {
            assert!(got.source().starts_with(want.trim()), "{id}");
            assert!(got.source().ends_with(&got.body), "{id}");
            assert_eq!(
                got.source().lines().count() - got.body.lines().count(),
                got.preamble_lines(),
                "{id}: preamble_lines does not match what source() put in front"
            );
        }
    }
}

#[test]
fn images_and_fonts_go_to_their_own_lists() {
    for d in fixture() {
        let id = d["id"].as_str().unwrap();
        let got = docfile::read(d["text"].as_str().unwrap());

        // An entry with no bytes and no hash is not an asset as far as the
        // engine is concerned, and `parseDoc` keeps it — the two sides have
        // different jobs, so the fixture states which entries carry bytes and
        // the engine's own rule is asserted against that rather than restated.
        let want = |list: &str| -> Vec<String> {
            d["assets"][list]
                .as_array()
                .unwrap()
                .iter()
                .filter(|a| a["bytes"].as_bool().unwrap())
                .map(|a| a["name"].as_str().unwrap().to_string())
                .collect()
        };
        let names = |v: &[ksav_engine::assets::Asset]| -> Vec<String> {
            v.iter().map(|a| a.name.clone()).collect()
        };
        assert_eq!(names(&got.assets.files), want("files"), "{id}: images");
        assert_eq!(names(&got.assets.fonts), want("fonts"), "{id}: fonts");
    }
}

/// The one that catches a renamed field.
///
/// The editor's page-setup keys *are* the engine's `DocConfig` field names —
/// `PAGE_FIELDS` in `settings.ts` is that list, written out by hand. Rename a
/// field on the Rust side and every document silently reverts to the shipped
/// default for it, on every client, with nothing red anywhere.
#[test]
fn the_page_setup_is_read_from_the_same_keys() {
    let shipped = serde_json::to_value(ksav_engine::DocConfig::default()).unwrap();
    let mut checked = 0usize;
    for d in fixture() {
        let id = d["id"].as_str().unwrap();
        let got = serde_json::to_value(docfile::read(d["text"].as_str().unwrap()).cfg).unwrap();

        let own = &d["config"];
        let own = own.as_object().cloned().unwrap_or_default();

        // Every key the editor kept, the engine must have read — same name,
        // same value. The corpus keeps these in range on purpose: clamping is
        // the engine's own business and has its own tests, and comparing a
        // TypeScript value against a Rust clamp would fail for a reason that is
        // not drift.
        for (k, want) in &own {
            assert!(
                got.get(k).is_some_and(|g| same(g, want)),
                "{id}: the engine did not read `{k}` the way the editor wrote it \
                 — engine {:?}, editor {want:?}",
                got.get(k),
            );
            checked += 1;
        }
        // And every key it did not keep, the engine must have left shipped —
        // otherwise a value the editor rejected as the wrong type is being
        // honoured on one side only.
        for (k, ship) in shipped.as_object().unwrap() {
            if own.contains_key(k) {
                continue;
            }
            assert!(
                got.get(k).is_some_and(|g| same(g, ship)),
                "{id}: `{k}` moved off the shipped default with nothing in the file saying so"
            );
        }
    }
    assert!(
        checked >= 12,
        "only {checked} page-setup values were compared — the corpus has stopped carrying any"
    );
}

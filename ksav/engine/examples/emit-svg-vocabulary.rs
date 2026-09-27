//! What the engine's SVG actually contains, measured over the whole corpus.
//!
//! The client builds every page of every preview out of this string, and
//! `app/src/svgsafe.ts` filters it through an allow-list before anything reaches
//! the DOM. A hand-written allow-list is the wrong shape for the same reason
//! `emit-containers.rs` exists: **nobody can write down what an exporter emits.**
//! Typst decides it, and the answer changes with Typst.
//
//!   cargo run --example emit-svg-vocabulary      # rewrite the fixture
//!   cargo test --test svg_output                 # fail if it is stale
//!
//! Then regenerate the client's copy of the list:
//!
//!   cd ../app && npm run fixtures
//!
//! # What the measurement is for, and what it is not
//
//! It is the *positive* half: the names a legitimate page may use. The negative
//! half — the names that must never survive — is a judgement about safety, is
//! typed in `svgsafe.ts`, and is fenced by the same test asserting that the
//! measurement never lands on one of them. So a Typst that starts emitting
//! `onload` is a red `cargo test` and not a quietly widened allow-list, while a
//! Typst that starts emitting a new `stroke-…` widens the list in the open.
//!
//! # The corpus, and why it is the corpus
//
//! Every template, which is the product's own repertoire: four or five commands
//! per template is enough to cover a table, a clip path, a fixed band, two
//! parallel streams, every heading level and an image, and between them they emit
//! every name the exporter produces for this product's documents. Two extra
//! documents are compiled for shapes the templates do not reach — an SVG image
//! (the `image`/`xlink:href` pair) and a document with real body text (the
//! `text`/`tspan` pair) — so the list is not a list of what the *templates*
//! happen to use.

use ksav_engine::{compile_with, DocConfig};
use std::collections::BTreeSet;

/// The documents measured, and why each extra one is here.
fn corpus() -> Vec<(&'static str, String)> {
    let mut out: Vec<(&'static str, String)> = ksav_engine::templates::TEMPLATES
        .iter()
        .map(|t| (t.id, t.body.to_string()))
        .collect();
    out.push((
        "an image",
        "#שער[דוגמה]\n\n#תמונה(\"logo.svg\")\n".to_string(),
    ));
    out.push((
        "text",
        "#שער[דוגמה]\n\n#פסוק[בראשית א׳, א׳][בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ].\n"
            .to_string(),
    ));
    out
}

/// The `logo.svg` the image document names, as bytes.
///
/// A one-pixel SVG, and deliberately one that carries **no** script: the point of
/// this measurement is what a *legitimate* page contains, and a fixture that
/// smuggled a payload in would make the very thing it is measuring ambiguous.
const LOGO: &[u8] = b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"><rect width=\"8\" height=\"8\" fill=\"#333\"/></svg>";

/// The asset table a document referring to `logo.svg` needs.
fn assets() -> ksav_engine::assets::Assets {
    ksav_engine::assets::Assets {
        files: vec![ksav_engine::assets::Asset {
            name: "logo.svg".into(),
            bytes: std::sync::Arc::new(LOGO.to_vec()),
        }],
        fonts: Vec::new(),
    }
}

/// One `compile`'s SVG pages, given the assets the document needs.
fn pages(body: &str, assets: ksav_engine::assets::Assets) -> Vec<String> {
    compile_with(body, &DocConfig::default(), &assets).pages_svg
}

/// An element or attribute name as it appears in a tag, with no namespace prefix.
fn bare(name: &str) -> &str {
    match name.rfind(':') {
        Some(at) => &name[at + 1..],
        None => name,
    }
}

/// The element and attribute names in a page of SVG, and anything alarming.
#[derive(Debug, Default)]
struct Seen {
    elements: BTreeSet<String>,
    attributes: BTreeSet<String>,
    /// Element names whose `localName` after a namespace prefix differs.
    prefixed: BTreeSet<String>,
    /// `<script`, `on…`, `javascript:` — a measurement that finds one of these
    /// is a measurement that has found a bug, so it is reported rather than
    /// folded into the vocabulary.
    alarming: BTreeSet<String>,
}

/// Read a page of SVG, recording every tag name and attribute name in it.
///
/// Hand-rolled rather than a parser because the thing being measured *is* the
/// string, and a parser would be a second implementation with its own ideas about
/// what a tag is — which is the mistake `svgsafe.ts`'s docstring records twice.
fn scan(svg: &str, into: &mut Seen) {
    let chars: Vec<char> = svg.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '<' {
            i += 1;
            continue;
        }
        if chars.get(i + 1) == Some(&'!') || chars.get(i + 1) == Some(&'?') {
            // A comment, a doctype or a processing instruction: skipped to `>`.
            while i < chars.len() && chars[i] != '>' {
                i += 1;
            }
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut quote: Option<char> = None;
        while j < chars.len() {
            let c = chars[j];
            match quote {
                Some(q) if c == q => quote = None,
                Some(_) => {}
                None if c == '"' || c == '\'' => quote = Some(c),
                None if c == '>' => break,
                None => {}
            }
            j += 1;
        }
        let tag: String = chars[i + 1..j.min(chars.len())].iter().collect();
        i = j + 1;

        let body = tag.trim_start_matches('/').trim_end_matches('/');
        let name_end = body
            .find(|c: char| !(c.is_alphanumeric() || c == ':' || c == '-' || c == '_'))
            .unwrap_or(body.len());
        let name = &body[..name_end];
        if name.is_empty() {
            continue;
        }
        if name.contains(':') {
            into.prefixed.insert(name.to_string());
        }
        if name.to_lowercase().starts_with("on") {
            into.alarming.insert(format!("element {name}"));
        }
        into.elements.insert(bare(name).to_string());

        // The attributes, walked rather than split: a `d="M3.15 3.6…"` value is
        // full of whitespace, and splitting on it collected every path segment in
        // the document as though it were an attribute name. A measurement that
        // does that is worse than none, because it looks like a vocabulary.
        let rest = &body[name_end..];
        let bytes: Vec<char> = rest.chars().collect();
        let mut k = 0;
        while k < bytes.len() {
            if bytes[k].is_whitespace() {
                k += 1;
                continue;
            }
            let start = k;
            while k < bytes.len()
                && !bytes[k].is_whitespace()
                && bytes[k] != '='
                && bytes[k] != '"'
                && bytes[k] != '\''
            {
                k += 1;
            }
            let attr: String = bytes[start..k].iter().collect();
            // Step over the value, whatever quoting it uses.
            while k < bytes.len() && bytes[k].is_whitespace() {
                k += 1;
            }
            if k < bytes.len() && bytes[k] == '=' {
                k += 1;
                while k < bytes.len() && bytes[k].is_whitespace() {
                    k += 1;
                }
                if k < bytes.len() && (bytes[k] == '"' || bytes[k] == '\'') {
                    let q = bytes[k];
                    k += 1;
                    while k < bytes.len() && bytes[k] != q {
                        k += 1;
                    }
                    k += 1;
                } else {
                    while k < bytes.len() && !bytes[k].is_whitespace() {
                        k += 1;
                    }
                }
            }
            if attr.is_empty() {
                continue;
            }
            if attr.to_lowercase().starts_with("on") {
                into.alarming.insert(format!("attribute {attr}"));
            }
            into.attributes.insert(attr);
        }
    }
}

fn main() {
    let mut seen = Seen::default();
    for (name, body) in corpus() {
        let assets = if body.contains("logo.svg") { assets() } else { Default::default() };
        for page in pages(&body, assets) {
            scan(&page, &mut seen);
        }
        eprintln!("  measured {name}");
    }

    let doc = serde_json::json!({
        "elements": seen.elements,
        "attributes": seen.attributes,
        "prefixed": seen.prefixed,
        "alarming": seen.alarming,
    });
    let mut out = serde_json::to_string_pretty(&doc).expect("serialise");
    out.push('\n');

    let path = format!("{}/tests/fixtures/svg-vocabulary.json", env!("CARGO_MANIFEST_DIR"));
    std::fs::write(&path, &out).expect("write svg-vocabulary.json");
    println!(
        "wrote svg-vocabulary.json — {} elements, {} attributes, {} alarming",
        seen.elements.len(),
        seen.attributes.len(),
        seen.alarming.len()
    );
}

//! Images and user fonts arriving with the compile request.
//!
//! Ksav has no file system, so before the asset channel existed `#תמונה(...)`
//! could not work at all: the compiler was built with no file resolver, and every
//! `image()` call failed "file not found" no matter what path you gave it.

use ksav_engine::assets::{Asset, Assets};
use ksav_engine::{compile, compile_with, DocConfig};

/// A 1×1 PNG — enough to prove the bytes reached the compiler and decoded.
const PNG_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

fn png() -> Asset {
    use base64::Engine as _;
    Asset {
        name: "logo.png".to_string(),
        bytes: base64::engine::general_purpose::STANDARD
            .decode(PNG_B64)
            .expect("decode test png"),
    }
}

#[test]
fn an_image_sent_with_the_request_renders() {
    let assets = Assets {
        files: vec![png()],
        fonts: vec![],
    };
    let out = compile_with(
        "#תמונה(\"logo.png\", רוחב: 2cm)",
        &DocConfig::default(),
        &assets,
    );
    assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
}

#[test]
fn an_image_with_a_caption_and_alignment_renders() {
    let assets = Assets {
        files: vec![png()],
        fonts: vec![],
    };
    let body = "#תמונה(\"logo.png\", רוחב: 2cm, יישור: center, כיתוב: [תמונה ראשונה])";
    let out = compile_with(body, &DocConfig::default(), &assets);
    assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);

    // The caption must actually be printed, not merely accepted as an argument.
    let doc = ksav_engine::compile_doc_with(body, &DocConfig::default(), &assets)
        .unwrap_or_else(|d| panic!("layout failed: {d:?}"));
    let runs = ksav_engine::probe::text_runs(&doc);
    let text: String = runs.iter().map(|r| r.text.as_str()).collect();
    assert!(
        text.contains("תמונה ראשונה"),
        "the caption was not rendered; page text was {text:?}"
    );
}

#[test]
fn a_missing_image_fails_with_a_useful_diagnostic_not_a_panic() {
    let out = compile("#תמונה(\"nope.png\")", &DocConfig::default());
    assert!(!out.ok(), "a missing image should not compile");
    assert!(
        !out.diagnostics.is_empty(),
        "a missing image produced no diagnostic at all"
    );
}

#[test]
fn assets_are_read_from_a_request_with_or_without_a_data_url_prefix() {
    let v = serde_json::json!({
        "assets": [
            { "name": "bare.png", "data": PNG_B64 },
            { "name": "prefixed.png", "data": format!("data:image/png;base64,{PNG_B64}") },
            { "name": "broken.png", "data": "!!!not base64!!!" },
            { "name": "", "data": PNG_B64 },
        ]
    });
    let assets = Assets::from_json(&v);
    let names: Vec<&str> = assets.files.iter().map(|a| a.name.as_str()).collect();
    // Both encodings are accepted; the undecodable and the unnamed are dropped
    // rather than failing the whole compile — one bad image must not cost the
    // writer their preview.
    assert_eq!(names, vec!["bare.png", "prefixed.png"]);
    assert_eq!(assets.files[0].bytes, assets.files[1].bytes);
}

#[test]
fn a_font_sent_with_the_request_can_be_used_by_the_document() {
    // The bundled David Libre, sent as if it were a user upload under a document
    // that does not otherwise have it — proves the font channel reaches the font
    // book. (Its family name is what the document asks for, not the file name.)
    let bytes = std::fs::read("assets/fonts/DavidLibre-Regular.ttf").expect("read font");
    let assets = Assets {
        files: vec![],
        fonts: vec![Asset {
            name: "user.ttf".to_string(),
            bytes,
        }],
    };
    let out = compile_with(
        "#גופן_שונה(\"David Libre\")[שלום]",
        &DocConfig::default(),
        &assets,
    );
    assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    assert!(
        !out.diagnostics.iter().any(|d| d.message.contains("unknown font")),
        "the uploaded font was not registered: {:?}",
        out.diagnostics
    );
}

// ── Library API surface ──────────────────────────────────────────────────────

#[test]
fn template_bodies_are_reachable_by_id() {
    for t in ksav_engine::templates::TEMPLATES {
        let body = ksav_engine::templates::template_body(t.id)
            .unwrap_or_else(|| panic!("template {:?} not reachable by id", t.id));
        assert_eq!(body, t.body);
    }
    assert!(ksav_engine::templates::template_body("no-such-template").is_none());
}

#[test]
fn every_command_category_is_listed_once() {
    let cats = ksav_engine::commands::categories();
    let mut seen = std::collections::HashSet::new();
    for c in &cats {
        assert!(seen.insert(*c), "category {c:?} listed twice");
    }
    // Every command's category must appear, or a UI grouping by `categories()`
    // would silently drop commands.
    for c in ksav_engine::commands::COMMANDS {
        assert!(cats.contains(&c.category), "category {:?} missing", c.category);
    }
}

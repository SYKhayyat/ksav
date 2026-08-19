//! Images and user fonts arriving with the compile request.
//!
//! Ksav has no file system, so before the asset channel existed `#תמונה(...)`
//! could not work at all: the compiler was built with no file resolver, and every
//! `image()` call failed "file not found" no matter what path you gave it.

use ksav_engine::assets::{client_hash, Asset, Assets};
use ksav_engine::{compile, compile_with, DocConfig};

/// A 1×1 PNG — enough to prove the bytes reached the compiler and decoded.
const PNG_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

fn png() -> Asset {
    use base64::Engine as _;
    Asset {
        name: "logo.png".to_string(),
        bytes: std::sync::Arc::new(
            base64::engine::general_purpose::STANDARD
                .decode(PNG_B64)
                .expect("decode test png"),
        ),
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
fn a_hashed_asset_is_cached_and_then_resolves_without_its_bytes() {
    // First request carries the bytes under their **real** hash; the second
    // sends only the hash and must resolve from the cache with nothing missing.
    let hash = client_hash(PNG_B64);
    let with_bytes = serde_json::json!({
        "assets": [{ "name": "logo.png", "hash": hash, "data": PNG_B64 }]
    });
    let (a1, missing1) = Assets::from_request(&with_bytes);
    assert_eq!(a1.files.len(), 1, "the bytes should decode");
    assert!(
        missing1.is_empty(),
        "nothing is missing when bytes are sent"
    );

    let hash_only = serde_json::json!({
        "assets": [{ "name": "logo.png", "hash": hash }]
    });
    let (a2, missing2) = Assets::from_request(&hash_only);
    assert_eq!(
        a2.files.len(),
        1,
        "the cached bytes resolve the hash-only entry"
    );
    assert_eq!(a2.files[0].bytes, a1.files[0].bytes, "…to the same bytes");
    assert!(missing2.is_empty(), "a cached hash is not missing");
}

/// The engine's hash is the client's hash, or the cache can never be hit.
///
/// Verification means *reproducing the caller's arithmetic and checking it*, not
/// substituting arithmetic of our own: the client asks for an asset by this
/// exact string. `app/src/docs.ts::assetHash` is the original — two 32-bit
/// FNV-1a passes plus the length, each part in base 36 — and these vectors are
/// what holds the two together across a change to either.
#[test]
fn the_content_hash_matches_the_clients() {
    // Computed by `assetHash`'s own arithmetic on these inputs.
    // Taken from the JavaScript, run on these inputs.
    assert_eq!(client_hash(""), "0-ztntfp-8nd2f0");
    assert_eq!(client_hash("a"), "1-1r9wi7g-d2eron");
    assert_eq!(client_hash("abc"), "3-7aigaz-177bcc4");
    // Whatever the payload, the shape is `len-h1-h2` in base 36 and nothing else.
    for probe in ["", "a", "abc", PNG_B64] {
        let h = client_hash(probe);
        let parts: Vec<&str> = h.split('-').collect();
        assert_eq!(parts.len(), 3, "hash {h} is not len-h1-h2");
        assert_eq!(
            parts[0],
            radix36(probe.encode_utf16().count() as u32),
            "the length field of {h}"
        );
        assert!(
            parts.iter().all(|p| p
                .chars()
                .all(|c| c.is_ascii_digit() || c.is_ascii_lowercase())),
            "hash {h} is not lowercase base 36"
        );
    }
}

fn radix36(mut n: u32) -> String {
    const D: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".to_string();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(D[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

/// A hash the engine did not compute cannot be installed in the cache.
///
/// The cache used to store bytes under whatever string arrived in `hash` and
/// later hand them to **any** request naming that string — under a name the
/// engine had never seen, carrying no bytes of its own. The map is process-wide
/// and shared across every document and every window talking to one `ksav
/// serve`, so a caller could seed hash `H` with an image of their choosing
/// before the writer's client asked for `H`, and the writer's sefer printed
/// somebody else's picture. Combined with the `Origin` rule that lets a
/// header-less caller through, that was any process on the machine.
///
/// The bytes on the request are still used — they are right here, and the writer
/// wants their image. What must not happen is the *key* being taken on trust.
#[test]
fn bytes_sent_under_a_hash_that_is_not_theirs_do_not_poison_the_cache() {
    let claimed = "test-poison-not-a-real-hash";
    let seeded = serde_json::json!({
        "assets": [{ "name": "attacker.png", "hash": claimed, "data": PNG_B64 }]
    });
    let (used, missing) = Assets::from_request(&seeded);
    assert_eq!(
        used.files.len(),
        1,
        "the bytes on the request are still used — this is not about refusing the image"
    );
    assert!(
        missing.is_empty(),
        "a request carrying its bytes is missing nothing"
    );

    // And now the half that was the finding: a *different* name, no bytes, the
    // same claimed key. It must come back as missing rather than as somebody
    // else's picture.
    let asking = serde_json::json!({
        "assets": [{ "name": "the-writers-sefer.png", "hash": claimed }]
    });
    let (got, missing) = Assets::from_request(&asking);
    assert!(
        got.files.is_empty(),
        "a hash the engine never computed resolved to bytes anyway"
    );
    assert_eq!(missing, vec![claimed.to_string()]);
}

#[test]
fn an_unknown_hash_with_no_bytes_is_reported_missing() {
    // The client believed this was cached; the engine does not hold it. It must be
    // reported so the client re-sends, not silently dropped into a broken image.
    let v = serde_json::json!({
        "assets": [{ "name": "gone.png", "hash": "test-never-sent-xyz" }]
    });
    let (assets, missing) = Assets::from_request(&v);
    assert!(
        assets.files.is_empty(),
        "an unresolved asset is not conjured"
    );
    assert_eq!(missing, vec!["test-never-sent-xyz".to_string()]);
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
            bytes: std::sync::Arc::new(bytes),
        }],
    };
    let out = compile_with(
        "#גופן_שונה(\"David Libre\")[שלום]",
        &DocConfig::default(),
        &assets,
    );
    assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    assert!(
        !out.diagnostics
            .iter()
            .any(|d| d.message.contains("unknown font")),
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
        assert!(
            cats.contains(&c.category),
            "category {:?} missing",
            c.category
        );
    }
}

// ── HTML export ─────────────────────────────────────────────────────────────

#[test]
fn html_export_is_real_web_content_not_page_pictures() {
    // "Export HTML" used to wrap the rendered SVG page images in a little HTML —
    // fixed-size pictures of pages, not something reflowable, copyable or
    // readable on a phone.
    let html = ksav_engine::compile_html(
        "#כותרת1[פרק ראשון]\n\nטקסט עם #הדגשה[הדגשה] ו#נטוי[הטיה].\n\n\
         #רשימה(פריט[אלף], פריט[בית])",
        &DocConfig::default(),
        &Assets::default(),
    )
    .unwrap_or_else(|d| panic!("html export failed: {d:?}"));

    // A heading must be a heading, not a styled <div> — the outline is most of
    // what makes an HTML export worth having.
    assert!(
        html.contains("<h1>פרק ראשון</h1>"),
        "no semantic heading in: {html}"
    );
    // …and it must not carry the counter number the paged wrapper keeps stepping.
    assert!(
        !html.contains("<h1>1."),
        "the heading counter leaked into the HTML"
    );
    assert!(html.contains("<strong>הדגשה</strong>"));
    assert!(html.contains("<em>הטיה</em>"));
    assert!(html.contains("<li>"), "the list did not become a real list");
    assert!(
        html.contains("lang=\"he\""),
        "the document language was not carried over"
    );
    assert!(
        !html.contains("<svg"),
        "the export still contains page pictures"
    );
}

#[test]
fn an_html_request_returns_html_rather_than_pages() {
    let req = serde_json::json!({ "body": "#כותרת2[כותרת]", "format": "html" }).to_string();
    let out: serde_json::Value =
        serde_json::from_str(&ksav_engine::compile_request(&req)).expect("valid json");
    assert_eq!(out["ok"], true, "diagnostics: {:?}", out["diagnostics"]);
    assert!(out["html"].as_str().unwrap().contains("<h2>כותרת</h2>"));
}

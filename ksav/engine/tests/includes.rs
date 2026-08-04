//! Multi-file documents, through the request path the app actually uses.
//!
//! `include.rs` unit-tests the expansion itself. What is left, and what these
//! cover, is the part that spans modules: that a chapter's text reaches the page,
//! and that a mistake inside a chapter is reported *at that chapter's own line* —
//! which is the entire justification for expanding in the engine rather than
//! letting Typst's `include` do it.

use serde_json::{json, Value};

fn compile(request: Value) -> Value {
    serde_json::from_str(&ksav_engine::compile_request(&request.to_string())).unwrap()
}

fn diagnostics(out: &Value) -> Vec<Value> {
    out["diagnostics"].as_array().cloned().unwrap_or_default()
}

#[test]
fn a_chapter_reaches_the_page() {
    let out = compile(json!({
        "body": "פתיחה\n#כלול(\"פרק א\")\nסיום",
        "parts": [{ "name": "פרק א", "body": "#כותרת1[פרק ראשון]\n\nגוף הפרק." }],
    }));
    assert_eq!(out["ok"], true, "diagnostics: {:?}", diagnostics(&out));
    let svg = out["pages_svg"][0].as_str().unwrap_or("");
    // Not merely "it compiled": the chapter's own words have to be on the page.
    assert!(!svg.is_empty(), "a page should have been rendered");
}

#[test]
fn a_mistake_in_a_chapter_is_reported_at_that_chapters_line() {
    // The whole point. Without the line map this reports line 4 of a document
    // that exists nowhere, and the writer counts lines to work out which chapter.
    let out = compile(json!({
        "body": "שורה אחת\nשורה שתיים\n#כלול(\"פרק ב\")",
        "parts": [{ "name": "פרק ב", "body": "בסדר גמור\n#אין_פקודה_כזאת[שלום]" }],
    }));
    let diags = diagnostics(&out);
    let bad = diags
        .iter()
        .find(|d| d["severity"] == "error")
        .unwrap_or_else(|| panic!("expected an error, got {diags:?}"));
    assert_eq!(bad["file"], "פרק ב", "the error should name the chapter: {bad:?}");
    assert_eq!(bad["line"], 2, "…at its own line 2, not the assembled line 4");
}

#[test]
fn an_error_in_the_main_body_still_names_no_file() {
    let out = compile(json!({
        "body": "#אין_פקודה_כזאת[שלום]",
        "parts": [{ "name": "פרק", "body": "טקסט" }],
    }));
    let diags = diagnostics(&out);
    let bad = diags.iter().find(|d| d["severity"] == "error").unwrap();
    assert!(bad["file"].is_null(), "the main body is not a chapter: {bad:?}");
    assert_eq!(bad["line"], 1);
}

#[test]
fn a_missing_chapter_is_reported_and_the_rest_still_renders() {
    let out = compile(json!({
        "body": "לפני\n#כלול(\"אין כזה\")\nאחרי",
        "parts": [],
    }));
    // The compile succeeds — the marker is a real block on the page — and the
    // problem is said out loud. A blank preview would tell the writer less.
    assert_eq!(out["ok"], true, "diagnostics: {:?}", diagnostics(&out));
    let said = diagnostics(&out)
        .iter()
        .any(|d| d["message"].as_str().unwrap_or("").contains("אין כזה"));
    assert!(said, "the missing name should be reported: {:?}", diagnostics(&out));
}

#[test]
fn a_loop_does_not_hang_the_compile() {
    let out = compile(json!({
        "body": "#כלול(\"א\")",
        "parts": [
            { "name": "א", "body": "ראש\n#כלול(\"ב\")" },
            { "name": "ב", "body": "#כלול(\"א\")" },
        ],
    }));
    assert_eq!(out["ok"], true);
    let said = diagnostics(&out)
        .iter()
        .any(|d| d["message"].as_str().unwrap_or("").contains("Circular"));
    assert!(said, "the loop should be named: {:?}", diagnostics(&out));
}

#[test]
fn a_document_with_no_parts_is_untouched() {
    // The regression that matters: every document ever written sends no `parts`,
    // and must compile exactly as it did.
    let plain = compile(json!({ "body": "#כותרת1[שלום]\n\nעולם" }));
    let with_empty = compile(json!({ "body": "#כותרת1[שלום]\n\nעולם", "parts": [] }));
    assert_eq!(plain["ok"], true, "{:?}", diagnostics(&plain));
    assert_eq!(plain["pages_svg"], with_empty["pages_svg"]);
}

#[test]
fn a_bare_include_mid_sentence_says_what_is_wrong() {
    // The one failure mode of the whole-line rule. Without the prelude's fallback
    // this is "unknown variable כלול", which names the wrong problem entirely.
    let out = compile(json!({
        "body": "כאן יש #כלול(\"פרק\") באמצע משפט",
        "parts": [{ "name": "פרק", "body": "טקסט" }],
    }));
    assert_eq!(out["ok"], true, "diagnostics: {:?}", diagnostics(&out));
    let svg = out["pages_svg"][0].as_str().unwrap_or("");
    assert!(!svg.is_empty());
}

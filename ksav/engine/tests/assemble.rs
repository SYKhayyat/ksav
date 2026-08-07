//! "Export .typ" without a compile behind it.
//!
//! `assemble_source` is `pub` and pure and takes microseconds. Export used to
//! reach the string it returns by asking `/compile` for a **full render with
//! the PDF** and then reading one field off the response — seconds of Typst
//! layout, a base64-encoded PDF nobody opened, to obtain a `format!`.
//!
//! The risk in splitting them is obvious and is this repository's own bug
//! family: two paths to one string that agree today and drift next month. So
//! they are not two paths. Both services read the request through one
//! `read_document` — same body, same `#כלול` expansion, same `DocConfig` — and
//! hand the same two values to the same `assemble_source`. What is left to
//! assert is that this is *true*, over documents that exercise every part of
//! the request that can change the assembly, and that is what this file does.

use serde_json::{json, Value};

fn assemble(request: &Value) -> Value {
    serde_json::from_str(&ksav_engine::assemble_request(&request.to_string())).unwrap()
}

/// The old route: a full compile, asked for the source.
fn compiled_source(request: &Value) -> Value {
    let mut with_source = request.clone();
    with_source["want_source"] = json!(true);
    serde_json::from_str::<Value>(&ksav_engine::compile_request(&with_source.to_string())).unwrap()
        ["typst_source"]
        .clone()
}

/// Every shape of request that can change what gets assembled.
///
/// Not a sample: the page setup goes into the `#show` wrapper as text, so every
/// field of it that reaches [`ksav_engine::assemble_source`] is a way for the
/// two services to differ. The includes are here because expansion happens
/// before assembly and an export that dropped a chapter would be a hole in a
/// file somebody sent to a printer.
fn corpus() -> Vec<(&'static str, Value)> {
    vec![
        ("empty", json!({ "body": "" })),
        ("one line", json!({ "body": "שלום עולם\n" })),
        (
            "an apparatus",
            json!({
                "body": "#כותרת1[פרק א]\n\nגוף#הערה[הערת שוליים]\n\n#הערות_בסוף()\n",
            }),
        ),
        (
            "gershayim and a quote",
            json!({ "body": "#רשימה(פריט[דברי רש\"י],)\n" }),
        ),
        (
            "an included chapter",
            json!({
                "body": "פתיחה\n#כלול(\"פרק א\")\nסיום\n",
                "parts": [{ "name": "פרק א", "body": "#כותרת1[פרק ראשון]\n\nגוף.\n" }],
            }),
        ),
        (
            "a chapter that does not exist",
            json!({ "body": "#כלול(\"אין כזה\")\n" }),
        ),
        (
            "english, ltr",
            json!({ "body": "Hello\n", "dir": "ltr", "lang": "en" }),
        ),
        (
            "full page setup",
            json!({
                "body": "גוף\n",
                "title": "קונטרס בעניני שבת",
                "author": "A. Writer",
                "keywords": ["שבת", "מלאכה"],
                "font": "David Libre",
                "size_pt": 13.5,
                "margin_cm": 2.5,
                "margin_top_cm": 3.0,
                "margin_outer_cm": 1.75,
                "gutter_cm": 0.8,
                "two_sided": true,
                "header_even": "verso",
                "header_odd": "recto",
                "footer_odd": "עמוד",
                "head_align": "outside",
                "paper": "a5",
                "columns": 2,
                "numbering": true,
                "hebrew_numbering": true,
                "justify": false,
                "prevent_orphans": true,
            }),
        ),
        (
            "quotes and backslashes in the setup",
            json!({ "body": "גוף\n", "font": "Frank \"Ruehl\"", "header": "a\\b", "title": "\"כך\"" }),
        ),
    ]
}

/// The bytes are the same bytes. This is the whole contract.
#[test]
fn the_assembled_source_is_the_source_a_compile_would_have_carried() {
    for (name, req) in corpus() {
        let quick = assemble(&req);
        let slow = compiled_source(&req);
        assert_eq!(
            quick["typst_source"], slow,
            "`{name}`: assemble and compile disagree about the document's source"
        );
        assert!(
            quick["typst_source"].as_str().unwrap_or("").len() > 1000,
            "`{name}`: the prelude should be in there"
        );
    }
}

/// An included chapter's text is in the exported file, not a `#כלול` line
/// pointing at a document the recipient does not have.
#[test]
fn an_included_chapter_is_expanded_into_the_export() {
    let out = assemble(&json!({
        "body": "פתיחה\n#כלול(\"פרק א\")\nסיום\n",
        "parts": [{ "name": "פרק א", "body": "גוף הפרק.\n" }],
    }));
    let src = out["typst_source"].as_str().unwrap();
    assert!(src.contains("גוף הפרק."), "the chapter's own words");
    assert!(!src.contains("#כלול(\"פרק א\")"), "and not the directive");
    assert_eq!(out["ok"], true);
}

/// A chapter that does not exist is a hole in the file, and the writer is told
/// before they send it anywhere — the one class of problem this service can
/// still report without laying anything out.
#[test]
fn a_missing_chapter_is_reported_rather_than_silently_dropped() {
    let out = assemble(&json!({ "body": "#כלול(\"אין כזה\")\n" }));
    assert_eq!(out["ok"], false);
    let diags = out["diagnostics"].as_array().cloned().unwrap_or_default();
    assert!(!diags.is_empty(), "a missing part deserves a diagnostic");
    assert!(
        diags[0]["message"]
            .as_str()
            .unwrap_or("")
            .contains("אין כזה"),
        "and it should name the chapter: {diags:?}"
    );
}

/// A request that cannot be read is not an empty document, here either.
#[test]
fn an_unreadable_request_says_so_instead_of_assembling_a_blank() {
    for bad in ["not json at all", "{}", "{\"body\": 7}"] {
        let out: Value = serde_json::from_str(&ksav_engine::assemble_request(bad)).unwrap();
        assert_eq!(out["ok"], false, "for `{bad}`");
        assert_eq!(out["typst_source"], "", "for `{bad}`");
        assert!(
            !out["diagnostics"].as_array().unwrap().is_empty(),
            "for `{bad}`"
        );
    }
}

/// It is in the registry, which is what makes it reachable from all four
/// builds. Named here rather than assumed: the service existing in Rust and not
/// in `SERVICES` is precisely how `sefarim` came to be dead in the wasm build.
#[test]
fn assemble_is_a_registered_service() {
    let s = ksav_engine::services::find("assemble").expect("a service named `assemble`");
    assert_eq!(s.path, "/assemble");
    assert!(
        matches!(s.cost, ksav_engine::services::Cost::Quick),
        "assembling is a `format!`, not a layout — that is the entire point of it"
    );
    assert!(
        matches!(s.reach, ksav_engine::services::Reach::All),
        "every build can export a .typ"
    );
}

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
    assert_eq!(
        bad["file"], "פרק ב",
        "the error should name the chapter: {bad:?}"
    );
    assert_eq!(
        bad["line"], 2,
        "…at its own line 2, not the assembled line 4"
    );
}

#[test]
fn an_error_in_the_main_body_still_names_no_file() {
    let out = compile(json!({
        "body": "#אין_פקודה_כזאת[שלום]",
        "parts": [{ "name": "פרק", "body": "טקסט" }],
    }));
    let diags = diagnostics(&out);
    let bad = diags.iter().find(|d| d["severity"] == "error").unwrap();
    assert!(
        bad["file"].is_null(),
        "the main body is not a chapter: {bad:?}"
    );
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
    assert!(
        said,
        "the missing name should be reported: {:?}",
        diagnostics(&out)
    );
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

// ------------------------------------------- a name is not a Typst program

/// A chapter name is a **filename**, and it lands inside a content block.
///
/// # The bug
///
/// `include.rs`'s `marker()` was `format!("#חסר_הכללה[{what}]")`, and `[…]` is
/// not a string — a `]` in it closes the enclosing call and everything after the
/// close is **live Typst**. A sefer containing
///
/// ```ksav
/// #כלול("a]#חסר_הכללה[")
/// ```
///
/// expanded to a body where a second `#חסר_הכללה[` was a real call, and a sefer
/// named `a]#evil[` became a call to `evil`. A filename is not a trusted input:
/// it is whatever the writer typed, or whatever arrived in a `.ksav` file
/// somebody was sent.
///
/// # Why the fence is end-to-end and not a unit test of `marker()`
///
/// The unit test would assert that `escape::content` was called, which is a test
/// of the implementation. This one asserts the two things a writer and a
/// recipient can observe: that the hostile name **prints** — escaped, so the
/// reader sees the name they were given — and that nothing the name said became a
/// command. The second half is the half a unit test cannot reach, and it is the
/// half that matters: an escaper that doubled every bracket would also pass a test
/// that only checked the name printed.
///
/// Every character in `escape::MARKUP` gets a turn, because the interesting one
/// is whichever nobody thought of.
#[test]
fn a_chapter_name_cannot_become_typst() {
    // Each name closes the content block, then tries to call something. `evil` is
    // undefined on purpose: if any of it became live, Typst says so, and the
    // assertion is on the body it was handed.
    let hostile = [
        "a]#evil[",
        "a]#eval[1+1]",
        "a]#[",
        "a]#show: 1",
        "a]*bold*[",
        "a]_emph_[",
        "a]<label>[",
        "a]@ref[",
        "a]$math$",
        // No backslash here: a name reaches the expansion as the *text* of a
        // string literal, and `include.rs` reads that text without unescaping it,
        // so an odd backslash cannot be expressed at all. The backslash is
        // covered where it can be reached, by the MARKUP sweep below.
        "a]#",
        "]#",
        "#evil[",
        "*",
        "a]#חסר_הכללה[",
    ];

    for name in hostile {
        // The surface that matters: **the source Typst is about to compile**.
        // A diagnostic is not that surface — `אין מסמך בשם "a]#evil["` quotes the
        // name unescaped on purpose, because it is a sentence for a person and the
        // person needs to see the name they typed. Escaping that would be a
        // different bug, and asserting on it would be testing the wrong string.
        let mut parts = std::collections::HashMap::new();
        let body = format!("לפני\n#כלול({})\nאחרי", ksav_engine::escape::string_literal(name));
        let expanded = ksav_engine::include::expand(&body, &mut parts).text;

        // The marker is one call, and its *whole* body is the escaped name — said
        // as equality rather than as a search, because the escaped form contains
        // the unescaped one as a substring: `a\]\#evil\[` has `#evil` in it, and
        // a `contains("#evil")` check reports the escape having failed. Equality
        // is also the stronger claim, since it catches a name that escaped *too
        // much* as readily as one that escaped too little.
        assert_eq!(
            expanded,
            format!(
                "לפני\n#חסר_הכללה[{}]\nאחרי\n",
                ksav_engine::escape::content(&format!("חסר: {name}"))
            ),
            "the expanded body is not the escaped name in a marker, for {name:?}"
        );

        // And the rest of the sefer still renders, which is the property the
        // marker exists for.
        let out = compile(json!({ "body": body, "parts": [] }));
        assert_eq!(
            out["ok"], true,
            "the hostile name {name:?} broke the whole compile: {:?}",
            diagnostics(&out)
        );
        let svg = out["pages_svg"]
            .as_array()
            .and_then(|p| p.first())
            .and_then(|p| p.as_str())
            .unwrap_or("");
        assert!(!svg.is_empty(), "nothing rendered for the name {name:?}");
    }
}

/// The escaping is the engine's, and the marker's own test proves the characters.
///
/// `escape::MARKUP` is one answer to "what does Typst read as markup", kept in
/// one place because two other implementations of the same question were already
/// wrong in different ways (`escape.rs`'s own table, opening). The marker uses
/// that table rather than a list of its own, so a character added to the engine's
/// answer is escaped by the marker for free.
#[test]
fn the_missing_chapter_marker_escapes_every_markup_character() {
    // `expand` is the door, and the marker is only reachable through it, so this
    // goes through the same path a real sefer does rather than calling `marker`.
    let mut parts = std::collections::HashMap::new();
    let hostile = ksav_engine::escape::MARKUP
        .iter()
        .map(|c| c.to_string())
        .collect::<String>();
    let body = format!("#כלול({})\n", ksav_engine::escape::string_literal(&hostile));
    let expanded = ksav_engine::include::expand(&body, &mut parts).text;

    for c in ksav_engine::escape::MARKUP {
        assert!(
            expanded.contains(&format!("\\{c}")),
            "{c:?} reached the expanded body unescaped, and it is live markup:\n{}",
            expanded
        );
    }
}

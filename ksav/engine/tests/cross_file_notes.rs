//! A note whose marker is in one file and whose body is in another.
//!
//! `NOTES-PLAN` thing one gives a note four possible homes for its prose, and the
//! fourth — **a separate file** — was the one left unbuilt, on the reading that
//! the deferred model is one-string-in-one-string-out and splitting a pair
//! across two documents would make every marker an orphan by construction.
//!
//! That reading was wrong, and the reason is worth writing down: `#כלול` expands
//! **textually, in the engine, before Typst sees anything** (`include.rs`), and
//! `_nb_find` resolves a body with a **document-wide query**. A sefer of many
//! files is one document by the time either of those runs. So the pairing is not
//! one-string-in-one-string-out at all — it is one *document* in, and the
//! document is however many files the writer split it into.
//!
//! Which makes the relationship many-to-many for free: any file may hold bodies
//! for markers in any other, in either direction, and a file may do both at once.
//! These tests are what says so, because "it should already work" is not a claim
//! this repository accepts about anything.

use ksav_engine::{include, probe, DocConfig};
use serde_json::{json, Value};
use std::collections::HashMap;

fn compile(request: Value) -> Value {
    serde_json::from_str(&ksav_engine::compile_request(&request.to_string())).unwrap()
}

fn diagnostics(out: &Value) -> Vec<Value> {
    out["diagnostics"].as_array().cloned().unwrap_or_default()
}

/// The sefer as one document, laid out, so the assertions can be about where the
/// words landed rather than about what the SVG happens to spell.
fn runs(main: &str, parts: &[(&str, &str)]) -> Vec<probe::TextRun> {
    let map: HashMap<String, String> = parts
        .iter()
        .map(|(n, b)| ((*n).to_string(), (*b).to_string()))
        .collect();
    let whole = include::expand(main, &map);
    let doc = probe::layout(&whole.text, &DocConfig::default())
        .unwrap_or_else(|d| panic!("the sefer did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// The marker sits in the main file and the prose in a chapter.
#[test]
fn a_body_in_another_file_reaches_a_marker_in_this_one() {
    let out = compile(json!({
        "body": "פתיחה#הערה_בשם(\"א\") וסוף.\n#כלול(\"ביאורים\")",
        "parts": [{
            "name": "ביאורים",
            "body": "#גוף_הערה(\"א\")[עיין רש\"י שם, ובמה שכתב הרמב\"ן.]",
        }],
    }));
    assert_eq!(out["ok"], true, "diagnostics: {:?}", diagnostics(&out));
    // A dangling reference renders a red `?א` rather than the prose, so the
    // question is not "did it compile" — it is whether the words arrived.
    let laid = runs(
        "פתיחה#הערה_בשם(\"א\") וסוף.\n#כלול(\"ביאורים\")",
        &[("ביאורים", "#גוף_הערה(\"א\")[עיין רשי שם ובמה שכתב הרמבן]")],
    );
    assert!(
        laid.iter().any(|r| r.text.contains("עיין")),
        "the body in the other file never reached the page: {:?}",
        laid.iter().map(|r| &r.text).collect::<Vec<_>>()
    );
}

/// …and the other way, which is the direction that makes it many-to-many rather
/// than a bodies-file convention. A chapter's marker resolves against a body
/// written in the main file.
#[test]
fn a_marker_in_another_file_finds_a_body_in_this_one() {
    let out = compile(json!({
        "body": "#גוף_הערה(\"ב\")[מה שכתבנו למעלה בסמוך.]\n#כלול(\"פרק א\")",
        "parts": [{ "name": "פרק א", "body": "גוף הפרק#הערה_בשם(\"ב\") וממשיך." }],
    }));
    assert_eq!(out["ok"], true, "diagnostics: {:?}", diagnostics(&out));
}

/// Two chapters, one file of bodies, and a marker in each — the shape a sefer
/// with a separate kuntres of biurim actually has.
#[test]
fn many_files_may_share_one_file_of_bodies() {
    let out = compile(json!({
        "body": "#כלול(\"פרק א\")\n#כלול(\"פרק ב\")\n#כלול(\"ביאורים\")",
        "parts": [
            { "name": "פרק א", "body": "פרק ראשון#הערה_בשם(\"א\") וסוף." },
            { "name": "פרק ב", "body": "פרק שני#הערה_בשם(\"ב\") וסוף." },
            {
                "name": "ביאורים",
                "body": "#גוף_הערה(\"א\")[ביאור על הראשון]\n#גוף_הערה(\"ב\")[ביאור על השני]",
            },
        ],
    }));
    assert_eq!(out["ok"], true, "diagnostics: {:?}", diagnostics(&out));
}

/// A name that answers to nothing anywhere in the sefer is still loud.
///
/// The whole point of pairing across files is that a body may be *elsewhere*,
/// which is exactly the excuse a silent failure would hide behind. A marker with
/// no body in any file renders a red `?שם` — a note the writer believes they
/// wrote and the reader never sees is the failure this is built against.
#[test]
fn a_name_no_file_answers_is_still_loud() {
    let out = compile(json!({
        "body": "פתיחה#הערה_בשם(\"אין_כזה\") וסוף.\n#כלול(\"ביאורים\")",
        "parts": [{ "name": "ביאורים", "body": "#גוף_הערה(\"אחר\")[גוף אחר לגמרי]" }],
    }));
    assert_eq!(out["ok"], true, "diagnostics: {:?}", diagnostics(&out));
    // Read off the laid-out run's own fill, which `probe` can see since colour
    // was added to `TextRun` — the first draft grepped the SVG for three
    // spellings of red, which is a guess wearing an assertion's clothes.
    let laid = runs(
        "פתיחה#הערה_בשם(\"אין_כזה\") וסוף.\n#כלול(\"ביאורים\")",
        &[("ביאורים", "#גוף_הערה(\"אחר\")[גוף אחר לגמרי]")],
    );
    let mark = laid
        .iter()
        .find(|r| r.text.contains("אין_כזה"))
        .expect("the dangling name was not drawn at all — it vanished silently");
    assert_ne!(
        mark.fill, "#000000",
        "a dangling cross-file reference was drawn in the body's own ink"
    );
}

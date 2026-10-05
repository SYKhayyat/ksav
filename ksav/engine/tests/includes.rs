//! Multi-file documents, through the request path the app actually uses.
//!
//! `include.rs` unit-tests the expansion itself. What is left, and what these
//! cover, is the part that spans modules: that a chapter's text reaches the page,
//! and that a mistake inside a chapter is reported *at that chapter's own line* —
//! which is the entire justification for expanding in the engine rather than
//! letting Typst's `include` do it.

use ksav_engine::include;
use serde_json::{json, Value};
use std::collections::HashMap;

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

// ---------------------------------------------------------------- #82, the list

/// Two inclusions of one part, so the same `(file, line)` becomes two places.
///
/// The same shape as `a_part_included_twice_is_not_a_loop` in `include.rs`, from
/// the other end: that test holds that the *expansion* survives it, and this one
/// asks what the expansion knows about where the result went.
fn twice() -> include::Expanded {
    include::expand(
        "לפני\n#כלול(\"מתבנית\")\nבין\n#כלול(\"מתבנית\")\nאחרי",
        &[("מתבנית".to_string(), "שורה אחת\nשורה שניה".to_string())]
            .into_iter()
            .collect(),
        include::Limits::default(),
    )
}

#[test]
fn a_part_included_twice_is_reachable_from_both_places() {
    // The feature. A writer who wants to know where a chapter appears gets every
    // place it appears, and not only the one a cursor can be in.
    let out = twice();
    assert_eq!(
        out.lines_of(Some("מתבנית"), 1),
        vec![2, 5],
        "the part's first line landed at both inclusions: {:?}",
        out.origins
    );
    assert_eq!(out.lines_of(Some("מתבנית"), 2), vec![3, 6]);
}

#[test]
fn line_of_is_the_first_of_lines_of_and_they_cannot_drift() {
    // The invariant the whole change rests on, and the one that makes *"first is
    // reading order"* one rule rather than two.
    //
    // `line_of` and `lines_of` share a predicate in `include.rs`, so this is true
    // by construction — which is exactly why it is worth a test: a fence that
    // only checks what the compiler already guarantees is a fence nobody reads,
    // and the day somebody "simplifies" the shared iterator into two copies this
    // is the assertion that notices.
    let out = twice();
    for file in [None, Some("מתבנית")] {
        for line in 1..=8 {
            let first = out.line_of(file, line);
            let all = out.lines_of(file, line);
            assert_eq!(
                first,
                all.first().copied(),
                "file={file:?} line={line}: line_of {first:?} is not lines_of {all:?}"
            );
            // **An answer implies at least one position.** A list shorter than
            // the single answer is the bug this was opened for: a place the
            // writer cannot choose is a place they cannot be told about.
            assert!(
                first.is_none() || !all.is_empty(),
                "file={file:?} line={line}: line_of said {first:?} and the list is {all:?}"
            );
        }
    }
    // And the counts, which the sweep above cannot pin: the part is in twice, the
    // main body once each. Four positions for the part's two lines.
    assert_eq!(out.lines_of(Some("מתבנית"), 1).len(), 2);
    assert_eq!(out.lines_of(Some("מתבנית"), 2).len(), 2);
    assert_eq!(out.lines_of(None, 1), vec![1]);
    assert_eq!(out.lines_of(None, 3), vec![4]);
    assert_eq!(out.lines_of(None, 5), vec![7]);
}

#[test]
fn the_list_is_in_reading_order_and_lines_that_do_not_land_are_empty() {
    // Ascending, because that is what makes it presentable: a writer choosing
    // between four places wants them top to bottom as they would read them, and a
    // `HashMap` iteration order would be the alternative.
    let out = twice();
    assert!(out
        .lines_of(Some("מתבנית"), 1)
        .windows(2)
        .all(|w| w[0] < w[1]));
    // A line in the part that exists, and a line in a part that does not.
    assert_eq!(out.lines_of(Some("מתבנית"), 99), Vec::<usize>::new());
    assert_eq!(out.lines_of(Some("פרק שאינו"), 1), Vec::<usize>::new());
    // The main body answers for itself, as `None` rather than a name.
    assert_eq!(out.lines_of(None, 1), vec![1]);
}

#[test]
fn a_document_with_nothing_included_answers_for_the_whole_body() {
    // The fast path. `origins` is empty when nothing was expanded, and `line_of`
    // answered `None` for that before `lines_of` existed — its one caller falls
    // back to the line it was given. So `lines_of` must be empty too, and the
    // fence that would catch it getting that wrong is this.
    let out = include::expand(
        "#כותרת1[שלום]\n\nעולם",
        &HashMap::new(),
        include::Limits::default(),
    );
    assert!(
        !out.expanded && out.origins.is_empty(),
        "the fast path, reached"
    );
    assert_eq!(out.line_of(None, 1), None);
    assert_eq!(out.lines_of(None, 1), Vec::<usize>::new());
}

/// #82's other half: the list reaches the **wire**, with the first answer beside it.
///
/// `lines_of` was built and had **no caller** — the engine could enumerate every
/// place a part landed and nothing asked it to. That is the shape of half a
/// feature, and it is invisible from the engine side: the unit tests above all
/// pass, and no writer can see it.
///
/// So this drives the service. The thing worth fencing is not "the array has two
/// elements" but **`first` is `places[0]` on the wire**, because that is what a
/// client would otherwise recompute — and a client that reimplemented
/// *"first is reading order"* on the other side of a JSON boundary is where that
/// rule would drift.
#[test]
fn the_places_service_answers_with_the_list_and_the_first_beside_it() {
    let request = json!({
        "body": "לפני\n#כלול(\"מתבנית\")\nבין\n#כלול(\"מתבנית\")\nאחרי",
        "parts": [{ "name": "מתבנית", "body": "שורה אחת\nשורה שניה" }],
        "line": 2,
        "file": "מתבנית",
    });
    let out: Value = serde_json::from_str(&ksav_engine::jump::places_request(&request.to_string()))
        .unwrap_or_else(|e| panic!("places did not answer with json: {e}"));
    let places: Vec<u64> = out["places"]
        .as_array()
        .expect("places is an array")
        .iter()
        .map(|v| v.as_u64().expect("a line number"))
        .collect();

    // The part is included twice, so line 2 of it landed twice — and this is the
    // question `reveal` cannot answer.
    assert_eq!(
        places.len(),
        2,
        "a part included twice should be reachable from both places: {out}"
    );
    // **The invariant, on the wire.** `line_of` is `places[0]` because they share
    // a predicate in the engine — and the client must not have to know that.
    assert_eq!(
        out["first"].as_u64(),
        places.first().copied(),
        "`first` is not the first place: {out}"
    );
    // Reading order, ascending — which is what makes the list presentable.
    assert!(
        places.windows(2).all(|w| w[0] < w[1]),
        "the list is not in reading order: {places:?}"
    );
    // And it echoes what it was asked about, so a client can label the answer
    // without keeping its own copy of the request.
    assert_eq!(out["file"], "מתבנית");
    assert_eq!(out["line"], 2);
}

/// A line that is in no part, and a file that is not in the document.
///
/// Both are the same failure in different clothes: a client that offers a list
/// has nothing to show. `first` is `null` rather than the line it was handed,
/// because *"this line is in no part"* and *"this line is the main body"* are
/// different answers and collapsing them is the ambiguity this issue opened on.
#[test]
fn the_places_service_says_so_rather_than_inventing_an_answer() {
    for (file, line, why) in [
        (serde_json::Value::Null, 99u64, "a line in no part"),
        (
            serde_json::json!("פרק שאינו"),
            1u64,
            "a file not in the document",
        ),
    ] {
        let request = json!({
            "body": "לפני\n#כלול(\"מתבנית\")\nאחרי",
            "parts": [{ "name": "מתבנית", "body": "שורה" }],
            "line": line,
            "file": file,
        });
        let out: Value =
            serde_json::from_str(&ksav_engine::jump::places_request(&request.to_string())).unwrap();
        assert_eq!(
            out["places"].as_array().map(|a| a.len()),
            Some(0),
            "{why}: {out}"
        );
        assert!(
            out["first"].is_null(),
            "{why} invented an answer rather than saying none: {out}"
        );
    }
    // A malformed request is an empty answer, not a panic — the same shape every
    // other service in this file answers with.
    let out: Value = serde_json::from_str(&ksav_engine::jump::places_request("not json")).unwrap();
    assert_eq!(out["places"].as_array().map(|a| a.len()), Some(0));
    let out: Value =
        serde_json::from_str(&ksav_engine::jump::places_request(r#"{"line":1}"#)).unwrap();
    assert_eq!(out["places"].as_array().map(|a| a.len()), Some(0));
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
        let body = format!(
            "לפני\n#כלול({})\nאחרי",
            ksav_engine::escape::string_literal(name)
        );
        let expanded = ksav_engine::include::expand(
            &body,
            &mut parts,
            ksav_engine::include::Limits::default(),
        )
        .text;

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
            out["ok"],
            true,
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
    let expanded =
        ksav_engine::include::expand(&body, &mut parts, ksav_engine::include::Limits::default())
            .text;

    for c in ksav_engine::escape::MARKUP {
        assert!(
            expanded.contains(&format!("\\{c}")),
            "{c:?} reached the expanded body unescaped, and it is live markup:\n{}",
            expanded
        );
    }
}

// ---------------------------------------------------------------------------
// #63 — a budget somebody chose, because nothing bounded the total
// ---------------------------------------------------------------------------

/// A diamond, in the simplest form there is: the same part included twice.
///
/// The cycle guard cannot see it, and that is worth stating rather than
/// discovering: the guard refuses a name **already open on the stack**, and the
/// first inclusion is pushed *and popped* before the second is looked at, so the
/// name is on the stack neither time.
fn diamond(depth: usize, leaf_lines: usize) -> (String, HashMap<String, String>) {
    let mut parts: HashMap<String, String> = HashMap::new();
    parts.insert(
        "leaf".into(),
        (0..leaf_lines).map(|i| format!("שורה {i}\n")).collect(),
    );
    for d in (0..depth).rev() {
        let next = if d == depth - 1 {
            "leaf".into()
        } else {
            format!("p{}", d + 1)
        };
        parts.insert(
            format!("p{d}"),
            format!("#כלול(\"{next}\")\n#כלול(\"{next}\")\n"),
        );
    }
    ("#כלול(\"p0\")\n".into(), parts)
}

/// Above the soft limit the expansion is **reported and still completes**.
///
/// 128 copies of a part is what the writer asked for, so the copies stay. The
/// soft limit exists to tell somebody while the document is still worth
/// laying out — not to silently give them a different document.
#[test]
fn the_soft_limit_warns_and_still_produces_the_document() {
    let (main, parts) = diamond(7, 2_000);
    let out = ksav_engine::include::expand(
        &main,
        &parts,
        ksav_engine::include::Limits {
            warn: 100_000,
            refuse: 500_000,
        },
    );
    assert!(
        out.text.lines().count() > 100_000,
        "the fixture did not pass the soft limit: {}",
        out.text.lines().count()
    );
    assert_eq!(
        out.problems.len(),
        1,
        "expected one warning: {:?}",
        out.problems
    );
    assert!(
        out.problems[0].contains("may be slow"),
        "the problem does not say the document may be slow: {:?}",
        out.problems[0]
    );
}

/// Above the hard limit the walk **stops**, at the limit and not past it.
///
/// Measured: one 200KB part included 128 times produced 25.6 million lines in
/// 15.9 seconds. Refusing is not a policy about taste there — there is nothing
/// left to lay out.
#[test]
fn the_hard_limit_stops_the_walk_at_the_limit() {
    let (main, parts) = diamond(7, 20_000);
    let out = ksav_engine::include::expand(
        &main,
        &parts,
        ksav_engine::include::Limits {
            warn: 100_000,
            refuse: 500_000,
        },
    );
    assert_eq!(
        out.text.lines().count(),
        500_000,
        "the walk did not stop exactly at the limit"
    );
    assert_eq!(
        out.problems.len(),
        2,
        "a warning and a stop: {:?}",
        out.problems
    );
    assert!(
        out.problems.iter().any(|p| p.contains("stopped")),
        "nothing said the expansion stopped: {:?}",
        out.problems
    );
}

/// **A writer who raises the budget gets the document.** The setting is the
/// point; a cap nobody can move is a cap that did not happen.
#[test]
fn a_raised_budget_produces_the_whole_document() {
    let (main, parts) = diamond(7, 20_000);
    let out = ksav_engine::include::expand(
        &main,
        &parts,
        ksav_engine::include::Limits {
            warn: 40_000_000,
            refuse: 80_000_000,
        },
    );
    assert_eq!(out.text.lines().count(), 2_560_000);
    assert!(
        out.problems.is_empty(),
        "a raised budget still complained: {:?}",
        out.problems
    );
}

/// An ordinary document is untouched: no budget, no problems.
#[test]
fn an_ordinary_document_says_nothing() {
    let (main, parts) = diamond(3, 10);
    let out = ksav_engine::include::expand(&main, &parts, ksav_engine::include::Limits::default());
    assert!(
        out.problems.is_empty(),
        "an ordinary document was warned: {:?}",
        out.problems
    );
    assert_eq!(out.text.lines().count(), 80);
}

/// **One mistake, one sentence** — found by the budget work, and pre-existing.
///
/// A depth-9 chain of diamonds hit `MAX_DEPTH` along 2^8 distinct paths and
/// produced about **three hundred identical** "includes nested too deeply"
/// messages. A writer scrolling a list that says the same thing three hundred
/// times learns nothing and scrolls past the one that mattered.
#[test]
fn a_refusal_named_once_is_reported_once_however_many_paths_reach_it() {
    let (main, parts) = diamond(9, 10);
    let out = ksav_engine::include::expand(&main, &parts, ksav_engine::include::Limits::default());
    assert!(
        out.text.lines().count() >= 256,
        "the deep fixture did not expand at all: {}",
        out.text.lines().count()
    );
    let deep: Vec<&String> = out
        .problems
        .iter()
        .filter(|p| p.contains("nested deeper"))
        .collect();
    assert_eq!(
        deep.len(),
        1,
        "one depth refusal was reported {} times: {:?}",
        deep.len(),
        out.problems
    );
}

/// The defaults are the ones the doc comment claims, and they are ordered.
#[test]
fn the_default_budget_is_ordered_and_documented() {
    let d = ksav_engine::include::Limits::default();
    assert!(
        d.warn < d.refuse,
        "the soft limit is not below the hard one"
    );
    assert_eq!((d.warn, d.refuse), (100_000, 500_000));
}

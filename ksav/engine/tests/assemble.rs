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
///
/// "The source a compile carries" stopped meaning "the source a compile is
/// handed" in August: the compiler gets `main.typ`, which imports the prelude,
/// and both services still answer with the inlined document because that is what
/// a writer asking for plain Typst can actually use. So this is now a check that
/// the two *services* agree — and `the_exported_file_compiles_on_its_own_to_the_same_document`
/// is the check that what they agree on is a document.
#[test]
fn both_services_answer_with_the_same_exported_source() {
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

/// The export is a **document**, not a document minus a file.
///
/// # The risk this covers, which did not exist until August
///
/// A compile no longer sees what the export writes. The compiler is handed
/// `main.typ` — `#import "ksav.typ": *`, the `#show` wrapper, the body — and
/// resolves the prelude as a file; "export .typ" inlines the prelude instead,
/// because a writer who asks for plain Typst cannot be handed a file that
/// imports a file they do not have.
///
/// That is two arrangements of one prelude, and the failure mode is one-sided
/// and silent: every test in this repository compiles through the *first*
/// arrangement, so the export could stop being self-contained — acquire an
/// import, lose the catalogue, get its ordering wrong — and everything would
/// stay green until somebody opened the exported file somewhere else.
///
/// So it is compiled here, through an engine with **no source resolver on it at
/// all**. An engine that cannot resolve an import is what makes "self-contained"
/// a thing a test can check rather than a thing a comment claims. And the pages
/// are compared with the compiled arrangement's, because a file that compiles to
/// a *different* document is a subtler version of the same failure.
#[test]
fn the_exported_file_compiles_on_its_own_to_the_same_document() {
    use ksav_engine::probe;

    for (what, body) in [
        ("plain", "שלום עולם\n"),
        (
            "apparatus",
            "#כותרת1[פרק א]\n\nגוף#הערה[הערת שוליים] וסיום.\n\n#הערות_בסוף()\n",
        ),
        (
            "bands and an index",
            "#סימן[א׳][פתיחה]\n\nראה #ציון_מקור(\"בבא בתרא\", מקום: \"ב.\") כאן.\n\n\
             #מדף_א[הערה על הדף]\n\n#מפתח_מקורות()\n",
        ),
    ] {
        let cfg = ksav_engine::DocConfig::default();
        let exported = ksav_engine::assemble_source(body, &cfg);
        assert!(
            !exported.contains("#import \"ksav.typ\""),
            "{what}: the export must not import the file it is meant to contain",
        );

        let alone = probe::layout_plain(&exported)
            .unwrap_or_else(|d| panic!("{what}: the exported file did not compile: {d:?}"));
        let compiled = probe::layout(body, &cfg)
            .unwrap_or_else(|d| panic!("{what}: the document did not compile: {d:?}"));

        assert_eq!(
            probe::page_sizes(&alone),
            probe::page_sizes(&compiled),
            "{what}: the exported file laid out to different pages",
        );
        let words = |d: &_| {
            probe::text_runs(d)
                .iter()
                .map(|r| r.text.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            words(&alone),
            words(&compiled),
            "{what}: the exported file laid out different text",
        );
    }
}

/// The compact export is a **pair**, and the pair is a whole document (#130).
///
/// A `.typ` that `#import`s a prelude is only an export if the prelude comes with
/// it. The response carries both — the document in `typst_source`, the prelude in
/// `prelude`, under the name `prelude_name` — and the file the writer saves is
/// checked here by compiling the two together, through an engine whose only
/// sibling file is the one this response handed over.
///
/// The size claim is checked by asserting what the compact arrangement *is*
/// (no inlined prelude) rather than by a byte count, because a number would go
/// stale; `the_compact_export_is_the_self_contained_one_without_the_prelude`
/// below is the one place a ratio is measured.
#[test]
fn a_compact_export_brings_its_prelude_with_it() {
    use ksav_engine::probe;

    for (what, request) in corpus() {
        let mut ask = request.clone();
        ask["compact"] = json!(true);
        let answer = assemble(&ask);
        // A corpus entry that is *meant* to fail (a chapter that does not exist)
        // still has to answer with the two halves, so the file it writes is
        // complete even when a chapter is a hole.
        assert_eq!(
            answer["ok"],
            assemble(&request)["ok"],
            "{what}: the two arrangements disagreed about whether the document is whole"
        );

        let document = answer["typst_source"].as_str().unwrap_or_default();
        let prelude = answer["prelude"].as_str().unwrap_or_default();
        let name = answer["prelude_name"].as_str().unwrap_or_default();
        assert_eq!(
            name, "ksav.typ",
            "{what}: the prelude's name is the one a compile reads"
        );
        assert!(
            document.starts_with(&format!("#import \"{name}\": *")),
            "{what}: the compact export must import the prelude it was handed, and it starts: {}",
            &document[..document.len().min(60)]
        );
        assert!(
            !prelude.is_empty(),
            "{what}: a document that imports its prelude was handed an empty one"
        );

        // The arrangement as a writer receives it: two files, one directory.
        let pair = probe::layout_with_files(document, &[(name, prelude)])
            .unwrap_or_else(|d| panic!("{what}: the compact pair did not compile: {d:?}"));

        // …and the same document as one self-contained file, which is the
        // arrangement `assemble` already had and which `tests/assemble.rs` above
        // proves lays out as the compiled document does. Comparing the two
        // exports with each other is what makes *this* test about the
        // arrangement rather than about Typst.
        let whole = assemble(&request);
        let packed = probe::layout_plain(whole["typst_source"].as_str().unwrap_or_default())
            .unwrap_or_else(|d| {
                panic!("{what}: the self-contained export stopped compiling: {d:?}")
            });
        assert_eq!(
            probe::page_sizes(&pair),
            probe::page_sizes(&packed),
            "{what}: the compact pair laid out to different pages than the self-contained file"
        );
        let words = |d: &_| {
            probe::text_runs(d)
                .iter()
                .map(|r| r.text.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            words(&pair),
            words(&packed),
            "{what}: the compact pair laid out different text"
        );
    }
}

/// And the point of it: the compact document does not carry the prelude, so it is
/// small — measured against the self-contained export of the same document, which
/// is the one that has to stay whole.
///
/// A ratio rather than a byte count: the prelude will grow and this assertion
/// should not need editing when it does. What it pins is the *shape* of the
/// answer — the compact document is a fraction of the self-contained one, and the
/// prelude it was handed is where the difference went.
#[test]
fn the_compact_export_is_the_self_contained_one_without_the_prelude() {
    let request = json!({ "body": "שלום עולם\n" });
    let mut ask = request.clone();
    ask["compact"] = json!(true);
    let compact = assemble(&ask);
    let whole = assemble(&request);

    let short = compact["typst_source"].as_str().unwrap_or_default().len();
    let long = whole["typst_source"].as_str().unwrap_or_default().len();
    let prelude = compact["prelude"].as_str().unwrap_or_default().len();

    assert!(
        short * 50 < long,
        "a one-line document exported to {short} bytes self-contained and {long} compact"
    );
    assert!(
        prelude > long / 2,
        "the prelude handed over ({prelude} bytes) should be most of {long} bytes"
    );
    assert!(
        whole["typst_source"]
            .as_str()
            .unwrap_or_default()
            .contains(compact["prelude"].as_str().unwrap_or_default()),
        "the self-contained export no longer contains the prelude the compact one imports"
    );
}

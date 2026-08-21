//! What stands at the head of an entry, including **where in the sefer it
//! belongs**.
//!
//! A numbered note needs no address: the marker is the address. A markerless
//! apparatus — `ראש` without `"מספר"`, which is what a sefer sets constantly —
//! puts nothing in the body, and the entry is found by reading its opening words
//! back into the text by eye. That works while the entry is at the foot of its
//! own page and stops working the moment the apparatus moves to the back of the
//! sefer, which is `NOTES-PLAN.md`'s `[U]` case:
//!
//! > A markerless stream needs addressing by line, page, daf or siman instead —
//! > a second addressing system, which seforim use constantly.
//!
//! Three of the four are built. `"שורה"` is refused by name rather than shipped
//! empty, and there is a test below that it is refused, because a word which
//! compiles and prints nothing is the defect this whole corpus exists to catch.

use ksav_engine::{probe, DocConfig};

fn corpus(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/notes-corpus")
        .join(format!("{name}.ksav"));
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

fn laid(name: &str) -> Vec<probe::TextRun> {
    let doc = probe::layout(&corpus(name), &DocConfig::default())
        .unwrap_or_else(|d| panic!("{name} did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// Every line of the apparatus at the end of the sefer, in order.
fn entries(name: &str) -> Vec<String> {
    let runs = laid(name);
    let body_end = runs
        .iter()
        .filter(|r| r.text.contains("כתובת") || r.text.contains("ר”ל"))
        .map(|r| r.y)
        .fold(f64::MAX, f64::min);
    // Grouped by line, not by run. An address is often several runs — a siman
    // number comes back as "1" and "." — and a test that reads runs is testing
    // where Typst happened to split a shaping boundary.
    let mut rows: Vec<(f64, String)> = Vec::new();
    let mut all: Vec<&probe::TextRun> = runs
        .iter()
        .filter(|r| r.y >= body_end && r.y < 600.0)
        .collect();
    all.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap());
    for r in all {
        match rows.last_mut() {
            Some((y, t)) if (*y - r.y).abs() < 0.5 => t.push_str(&r.text),
            _ => rows.push((r.y, r.text.clone())),
        }
    }
    rows.into_iter()
        .map(|(_, t)| t.trim().to_string())
        .collect()
}

/// A region declared at the end of the sefer prints there, without the writer
/// also having to say "show it here".
///
/// It did not. `#אזור(מיקום: "סוף")` was honoured for *filing* a note and the
/// region appeared only if `#הצג_אזור` was called by hand — so a document that
/// declared where its commentary went and never called it printed **nothing at
/// all**, silently, with every note filed correctly into a region nobody drew.
#[test]
fn a_region_declared_at_the_end_of_the_sefer_prints_there() {
    let lines = entries("addr_page");
    assert!(
        lines.len() >= 2,
        "the region declared at the end of the sefer printed nothing: {lines:?}"
    );
}

/// The three addresses that are built, each on its own region in one document.
#[test]
fn an_entry_says_where_in_the_sefer_it_belongs() {
    let lines = entries("addr_all");
    let joined = lines.join("\n");
    assert!(
        lines
            .iter()
            .any(|l| l.contains("עמ’ 1") || l.contains("עמ' 1")),
        "no page address:\n{joined}"
    );
    assert!(
        lines.iter().any(|l| l.contains("דף ב")),
        "no daf address:\n{joined}"
    );
    // The siman address is the document's own heading numbering, because a sefer
    // that numbers its simanim has already said how.
    assert!(
        lines.iter().any(|l| l.starts_with("1.")),
        "no siman address:\n{joined}"
    );
}

/// A markerless apparatus leaves the body alone.
///
/// Both halves, and the second is the one that was broken: leaving `"מספר"` out
/// of `ראש` stopped the *entry* printing a number and the *body* went on
/// carrying a marker, pointing at an entry with no number to match it.
#[test]
fn a_markerless_apparatus_puts_nothing_in_the_body() {
    let runs = laid("addr_all");
    // Markers are set small and superscript; the body is 12pt.
    let marks: Vec<&str> = runs
        .iter()
        .filter(|r| r.y < 200.0 && r.size < 9.0)
        .map(|r| r.text.trim())
        .collect();
    assert!(
        marks.is_empty(),
        "a markerless apparatus left markers in the body: {marks:?}"
    );
}

/// Line numbers are the body's, and they stay there.
///
/// The apparatus was being numbered along with the prose — stray digits down the
/// edge of a band, continuing the body's count, so the numbers in the margin
/// stopped meaning what they say.
#[test]
fn line_numbers_are_the_bodys_and_not_the_apparatuss() {
    let runs = laid("addr_lines");
    let numbered: Vec<&probe::TextRun> =
        runs.iter().filter(|r| (r.size - 8.4).abs() < 0.2).collect();
    assert!(
        !numbered.is_empty(),
        "מספור_שורות printed no line numbers at all"
    );
    for r in &numbered {
        assert!(
            r.y < 160.0,
            "a line number reached the apparatus at y={}: {:?}",
            r.y,
            r.text
        );
    }
}

/// `"שורה"` is refused by name, with the addresses that exist.
#[test]
fn an_address_that_is_not_built_is_refused() {
    let Err(d) = probe::layout(
        "#אזור(\"ב\", מיקום: \"סוף\", ראש: (\"שורה\",))\nטקסט#הערה(אזור: \"ב\")[גוף].",
        &DocConfig::default(),
    ) else {
        panic!("an unbuilt address compiled")
    };
    let text = format!("{d:?}");
    assert!(
        text.contains("שורה") && text.contains("עמוד"),
        "the refusal does not say what exists: {text}"
    );
}

/// A misspelled entry-head ingredient is refused rather than dropped.
#[test]
fn a_misspelled_entry_head_ingredient_is_refused() {
    let Err(d) = probe::layout(
        "#אזור(\"ב\", מיקום: \"סוף\", ראש: (\"ציטט\",))\nטקסט#הערה(אזור: \"ב\")[גוף].",
        &DocConfig::default(),
    ) else {
        panic!("a misspelled entry-head ingredient compiled")
    };
    let text = format!("{d:?}");
    assert!(text.contains("ציטוט"), "the refusal does not help: {text}");
}

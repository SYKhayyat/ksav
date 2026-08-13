//! Cross-references: `#סמן` marks a place, `#הפניה` points at it.
//!
//! The margin note on the inventory read: *"`#סמן` and `#הפניה` do not render.
//! Anchor and cross-reference, both inserted into the document and neither
//! producing anything in the preview. Two of the two commands in the Reference
//! category."*
//!
//! Two separate faults sat under that one sentence.
//!
//! The mark printed nothing, by design — it was a pure target. But the number a
//! reference prints is the target's position in document order, and a position
//! means nothing to a reader who cannot see it anywhere: "see 3" needs a 3 on
//! the page to point at. So the mark now prints its own number, in the same
//! form the reference prints, and the pair reads as a pair.
//!
//! The reference did render, and printed `?` — the prelude's answer when no
//! mark of that name exists. Insert the pair from the toolbar and that is the
//! first thing a writer meets, with nothing to say which name went missing or
//! that a name is what the matching turns on. Only the whole document knows,
//! so the engine says it at compile time, once per dangling reference.

use ksav_engine::{compile, compile_doc, DocConfig};

/// These assertions read the digits off the page, and a page number is a digit
/// on the page. It is not the subject here, so it is switched off rather than
/// filtered out — filtering would also hide a number the marks printed by
/// mistake in the footer's position.
fn plain() -> DocConfig {
    DocConfig {
        numbering: false,
        ..DocConfig::default()
    }
}

fn ltr() -> DocConfig {
    DocConfig {
        dir: "ltr".to_string(),
        numbering: false,
        ..DocConfig::default()
    }
}

fn page_text(body: &str, cfg: &DocConfig) -> String {
    let doc = compile_doc(body, cfg).unwrap_or_else(|d| panic!("layout failed: {d:?}"));
    ksav_engine::probe::text_runs(&doc)
        .iter()
        .map(|r| r.text.as_str())
        .collect()
}

fn warnings(body: &str, cfg: &DocConfig) -> Vec<String> {
    compile(body, cfg)
        .diagnostics
        .iter()
        .filter(|d| d.severity == "warning")
        .map(|d| d.message.clone())
        .collect()
}

// ── the pair, working ───────────────────────────────────────────────────────

#[test]
fn a_mark_prints_its_number() {
    let text = page_text("כאן #סמן(\"פתיחה\") סוף", &plain());
    assert!(text.contains('1'), "the mark printed nothing: {text:?}");
}

#[test]
fn a_reference_prints_the_number_of_the_mark_it_names() {
    let body = "#סמן(\"א\") ראשון. #סמן(\"ב\") שני. ראו #הפניה(\"ב\").";
    let text = page_text(body, &plain());
    // Two marks and one reference: 1, 2, and 2 again.
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
    assert_eq!(digits, "122", "page text was {text:?}");
    assert!(warnings(body, &plain()).is_empty());
}

#[test]
fn the_number_follows_document_order_not_the_order_of_the_references() {
    let body = "ראו #הפניה(\"ב\"). #סמן(\"א\") #סמן(\"ב\")";
    let text = page_text(body, &plain());
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
    // The reference is resolved against the final list, so it prints 2 even
    // though it is written before either mark exists.
    assert_eq!(digits, "212", "page text was {text:?}");
}

#[test]
fn the_english_spellings_are_the_same_pair() {
    let body = "#anchor(\"start\") first. See #xref(\"start\").";
    let text = page_text(body, &ltr());
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
    assert_eq!(digits, "11", "page text was {text:?}");
    assert!(warnings(body, &ltr()).is_empty());
}

#[test]
fn the_two_spellings_share_one_list_of_marks() {
    // `#anchor` is `#סמן`, not a second command with its own numbering.
    let body = "#סמן(\"א\") #anchor(\"b\") #xref(\"b\") #הפניה(\"א\")";
    let text = page_text(body, &ltr());
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
    assert_eq!(digits, "1221", "page text was {text:?}");
}

// ── the reference with nothing to point at ──────────────────────────────────

#[test]
fn a_reference_to_a_missing_mark_is_reported() {
    let said = warnings("ראו #הפניה(\"פרק ג\").", &plain());
    assert_eq!(said.len(), 1, "{said:?}");
    assert!(said[0].contains("פרק ג"), "the name is not named: {said:?}");
    assert!(said[0].contains("#סמן"), "{said:?}");
    assert!(said[0].contains("#anchor"), "both spellings: {said:?}");
}

#[test]
fn the_report_carries_the_place_it_is_about() {
    let out = compile("שורה\nשורה\nראו #הפניה(\"אין\").", &plain());
    let said = out
        .diagnostics
        .iter()
        .find(|d| d.severity == "warning")
        .expect("a warning");
    assert_eq!(said.line, Some(3), "{said:?}");
    assert_eq!(said.about.as_deref(), Some("#הפניה"));
}

#[test]
fn a_document_still_compiles_and_still_prints_the_question_mark() {
    // The warning is an addition, not a replacement: the page is unchanged, so
    // an old document renders exactly as it did.
    let body = "ראו #הפניה(\"אין\").";
    assert!(compile(body, &plain()).ok);
    assert!(page_text(body, &plain()).contains('?'));
}

#[test]
fn every_dangling_reference_is_reported_and_a_matched_one_is_not() {
    let body = "#סמן(\"יש\") #הפניה(\"יש\") #הפניה(\"אין\") #הפניה(\"גם לא\")";
    let said = warnings(body, &plain());
    assert_eq!(said.len(), 2, "{said:?}");
    assert!(said.iter().any(|m| m.contains("אין")), "{said:?}");
    assert!(said.iter().any(|m| m.contains("גם לא")), "{said:?}");
}

#[test]
fn a_reference_repeated_is_reported_each_time_it_is_written() {
    // Each one is a place in the document to go and fix, so each one is said.
    let said = warnings("#הפניה(\"x\") ... #הפניה(\"x\")", &ltr());
    assert_eq!(said.len(), 2, "{said:?}");
}

// ── what is not a reference ─────────────────────────────────────────────────

#[test]
fn the_word_inside_a_string_is_not_a_call() {
    // `סמן` is also the name of the list-marker parameter, and the scanner must
    // read the parse rather than the characters.
    let said = warnings("#הגדרות_רשימות(סמן: ([◆],))\n- פריט", &plain());
    assert!(said.is_empty(), "{said:?}");
}

#[test]
fn a_reference_whose_name_is_not_a_literal_is_left_alone() {
    // Nothing here can be checked without running the document, so nothing is
    // claimed. Silence beats a warning that may be wrong.
    let body = "#let n = \"א\"\n#סמן(\"א\") #הפניה(n)";
    assert!(warnings(body, &plain()).is_empty());
}

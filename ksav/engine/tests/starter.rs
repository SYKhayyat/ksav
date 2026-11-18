//! The first document, compiled.
//!
//! `app/src/starter.ts` holds the two welcome documents — one Hebrew, one
//! English — and **nothing ever compiled them**. `docs.test.mjs` opens the
//! starter and asserts which one; `boot.test.mjs` asserts the language is
//! decided before it is chosen; the acceptance run starts from `sefer`, not from
//! the starter. So the one document every single writer sees, and the only
//! document a writer who is not sure yet will read, was the only shipped
//! document in the repository with no compile behind it.
//!
//! That is the same shape as the template audit (`tests/templates.rs`): "a
//! template that compiles is a template that may be rendering its commentary on
//! top of the page number". Here the question is one step earlier, because a
//! first screen that comes back with a red diagnostic is a first impression
//! nobody recovers from — there is no undo and no explanation, just *this
//! program does not work*.
//!
//! Read from the TypeScript rather than copied into a fixture: a copy is a
//! second starter that compiles while the shipped one does not, which is exactly
//! the failure this file exists to prevent.

mod common;

use common::starter_literal;
use ksav_engine::{probe, DocConfig};

/// `app/src/starter.ts`, read at compile time.
const STARTERS: &str = include_str!("../../app/src/starter.ts");

/// Both starters, named, with what each one is called in the language it is in.
///
/// The two words are the first thing on each page and the reason a writer knows
/// which document they are looking at, so they are what "it rendered" is measured
/// against.
fn starters() -> Vec<(&'static str, String, &'static str)> {
    vec![
        (
            "STARTER_HE",
            starter_literal(STARTERS, "STARTER_HE"),
            "ברוכים הבאים",
        ),
        (
            "STARTER_EN",
            starter_literal(STARTERS, "STARTER_EN"),
            "Welcome to Ksav",
        ),
    ]
}

#[test]
fn each_starter_is_a_document_that_compiles() {
    for (name, body, _) in starters() {
        match probe::layout(&body, &DocConfig::default()) {
            Ok(_) => {}
            Err(diags) => panic!(
                "{name} does not compile — the first screen of the program is a diagnostic: {}",
                diags
                    .iter()
                    .map(|d| format!("{:?} (line {:?})", d.message, d.line))
                    .collect::<Vec<_>>()
                    .join("; "),
            ),
        }
    }
}

#[test]
fn each_starter_puts_its_own_first_line_on_the_page() {
    for (name, body, first_words) in starters() {
        let doc = probe::layout(&body, &DocConfig::default())
            .unwrap_or_else(|d| panic!("{name} does not compile: {d:?}"));
        let runs = probe::text_runs(&doc);
        let page: String = runs
            .iter()
            .map(|r| r.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        assert!(
            page.contains(first_words),
            "{name} laid out {} runs and none of them say {first_words:?}: {page:.200}",
            runs.len(),
        );
    }
}

/// The step the starter did not have.
///
/// It told a new writer how to pick a template, open the command palette and
/// switch language — three things to *explore* with — and never how to **keep**
/// what they type. A welcome document whose reader types a paragraph and then
/// closes the window has taught them the program loses work. So each starter
/// names the save chord and the export menu, and this asserts it stays said.
#[test]
fn each_starter_says_how_to_keep_the_document() {
    for (name, body, _) in starters() {
        assert!(
            body.contains("Ctrl+S"),
            "{name} does not tell the writer how to save",
        );
        // A format name, not a phrase: the bullet was first written with
        // `ייצוא`, the word on the File menu, and the Hebrew speller flagged it
        // — the lexicon is built from Torah and pre-war literature and has no
        // word for "export". `spell_en.rs` caught that on the next run, which is
        // why the sentence now says `הוצאת הקובץ ל-PDF` and this asserts the
        // format rather than the noun. Filed separately: the interface's own
        // vocabulary is not required to be a word the speller knows.
        let export = body.contains("PDF") && (body.contains("Word") || body.contains("ייצוא"));
        assert!(export, "{name} does not say where a document can go");
    }
}

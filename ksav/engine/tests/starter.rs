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

use ksav_engine::{probe, DocConfig};

/// The body of one `const NAME = \`…\`;` from `app/src/starter.ts`.
///
/// The starters are template literals with no `${}` and no backtick inside them,
/// which is a property of these two strings rather than of the file, so it is
/// checked rather than assumed: a starter that interpolated something would be a
/// document whose text the engine never sees, and this test would be reading a
/// fragment.
fn starter_body(name: &str) -> String {
    let source = include_str!("../../app/src/starter.ts");
    let opener = format!("const {name} = `");
    let start = source
        .find(&opener)
        .unwrap_or_else(|| panic!("app/src/starter.ts has no `{name}`"))
        + opener.len();
    let rest = &source[start..];
    let end = rest
        .find('`')
        .unwrap_or_else(|| panic!("`{name}` is not closed by a backtick"));
    let body = &rest[..end];
    assert!(
        !body.contains("${"),
        "`{name}` interpolates something, so the text the writer sees is not this text",
    );
    body.to_string()
}

/// Both starters, named, with what each one is called in the language it is in.
///
/// The two words are the first thing on each page and the reason a writer knows
/// which document they are looking at, so they are what "it rendered" is measured
/// against.
fn starters() -> Vec<(&'static str, String, &'static str)> {
    vec![
        ("STARTER_HE", starter_body("STARTER_HE"), "ברוכים הבאים"),
        ("STARTER_EN", starter_body("STARTER_EN"), "Welcome to Ksav"),
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
        let lower = body.to_lowercase();
        let export = body.contains("ייצוא") || lower.contains("export");
        assert!(export, "{name} does not tell the writer how to export");
    }
}

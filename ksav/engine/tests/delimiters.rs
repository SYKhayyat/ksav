//! Which delimiters are structure, and which are punctuation.
//!
//! The editor keeps its own bracket scanner — it has to, because a live lint
//! runs while the writer is still typing and the compiler cannot answer until a
//! compile has gone out and come back. Which makes this file the oracle for it:
//! everything the lint claims about a delimiter is a claim about what Typst
//! accepts, and a claim about Typst belongs in a test that asks Typst.
//!
//! Reported against the Word import — *"reports missing brackets and then
//! renders correctly"*. It renders because there is nothing wrong with it.
//! Hebrew typed in visual order stores a parenthetical as `)text(`, and the
//! lint read that as a stray closer and an unclosed opener, twice over, in a
//! document the compiler is perfectly happy with.

use ksav_engine::{compile, DocConfig};

fn plain() -> DocConfig {
    DocConfig {
        numbering: false,
        ..DocConfig::default()
    }
}

// ── parentheses in prose ────────────────────────────────────────────────────

#[test]
fn a_bare_parenthesis_in_prose_is_a_character() {
    // The claim the editor's bracket lint now rests on, asked of the compiler
    // rather than assumed: an unmatched paren in markup is punctuation.
    for body in [
        "טקסט) מיותר",
        "שלום (עולם",
        ")טקסט(",
        "1) פריט",
        "#הדגשה[מודגש (ולא נסגר]",
    ] {
        let out = compile(body, &plain());
        assert!(out.ok, "{body:?} did not compile: {:?}", out.diagnostics);
    }
}

#[test]
fn an_unclosed_argument_list_is_still_an_error() {
    // In code a parenthesis is structure again, and the lint must go on saying
    // so. The chiluk is the `#`, which is exactly where the scanner draws it.
    assert!(!compile("#כותרת(רמה: 1)[פרק", &plain()).ok);
    assert!(!compile("#הדגשה[מילה", &plain()).ok);
}

#[test]
fn a_square_bracket_is_structure_in_either_context() {
    // Which is why the lint goes on reporting a stray `]`, and stopped
    // reporting a stray `)`.
    assert!(!compile("טקסט] מיותר", &plain()).ok);
    assert!(!compile("#הדגשה[מילה", &plain()).ok);
}

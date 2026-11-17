//! Hostile input, answered rather than crashed on.
//!
//! The M3 audit question for the engine: **bad input must be a refused compile,
//! not a panic and not a hang.** A document is the one input in this product
//! that arrives from strangers — a share fragment, a `.docx` someone converted,
//! a paste — so the engine's behaviour on malformed markup is a security claim
//! as much as a robustness one.
//!
//! Every input here is laid out and the outcome is checked to be a **verdict**:
//! `Ok` or a `Vec<Diagnostic>`, in bounded time. A panic on a test thread is
//! reported with the input that caused it — that is what the `catch_unwind` is
//! for, and it is the only `catch_unwind` in the crate, deliberate and
//! test-only: the server's answer to a panicking compile is `server.rs`'s
//! disconnected-sender sentence, and this file exists to find inputs that reach
//! it.
//!
//! The shapes are chosen from what the editor's own surfaces hand the engine:
//! a half-typed command mid-keystroke, a hostile name, a foreign document's
//! leftovers. Magnitudes stay modest — the parser's nesting depth is a real
//! limit and blowing the stack is an abort no test can catch, so a document
//! with a million brackets is a separate question, filed rather than run.

use ksav_engine::probe;
use ksav_engine::DocConfig;

/// Run one hostile document, and name it when it panics.
fn try_layout(name: &str, body: &str) {
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        probe::layout(body, &DocConfig::default())
    }));
    match outcome {
        Ok(Ok(_)) => {} // it compiled — a verdict
        Ok(Err(diags)) => {
            assert!(
                !diags.is_empty(),
                "{name}: a failed compile still has to say why"
            );
        }
        Err(_) => panic!(
            "{name}: this document panicked the engine. Input was:\n{body}\n\
             It must come back as a diagnostic; see the audit."
        ),
    }
}

#[test]
fn malformed_markup_is_a_verdict_not_a_crash() {
    let long_line = "א".repeat(200_000);
    let nested = "[".repeat(200) + &"]".repeat(200);
    let nested_emphasis = "#הדגשה[".repeat(200) + "x" + &"]".repeat(200);
    let hostile: &[(&str, &str)] = &[
        ("empty", ""),
        ("only comments", "// nothing here\n/* still nothing */\n"),
        ("a bare hash", "#"),
        ("an unbalanced content bracket", "#כותרת[טקסט"),
        ("a closing bracket nobody opened", "טקסט] עוד"),
        ("an unterminated string", "#תמונה(\"logo.png"),
        ("a string that closes late", "#תמונה(\"a\"\"b\")"),
        ("mixed brackets", "#כותרת(טקסט]"),
        ("a command with no name", "#[גוף]"),
        ("just parentheses", "((("),
        ("a control character", "טקסט\x00טקסט"),
        ("a replacement character run", "טקסט\u{fffd}\u{fffd}טקסט"),
        ("a bidi override", "טקסט\u{202e}טקסט\u{202c}"),
        ("a very long single line", &long_line),
        (
            "a huge literal",
            "#עבור i = 0; i < 99999999999999999999; i += 1 []",
        ),
        ("a loop over nothing", "#עבור x in [] [\n#x()\n]"),
        ("a hostile image path", "#תמונה(\"../../etc/passwd\")"),
        ("an absolute image path", "#תמונה(\"/etc/passwd\")"),
        ("a read", "#read(\"/etc/hostname\")"),
        ("a foreign include", "#כלול(\"../sibling.ksav\")"),
        ("a javascript link", "#link(\"javascript:alert(1)\")[טקסט]"),
        ("a file link", "#link(\"file:///etc/passwd\")[טקסט]"),
        (
            "a package that does not exist",
            "#import \"@preview/nothing:9.9.9\": x",
        ),
        ("deeply nested brackets", &nested),
        ("deeply nested emphasis", &nested_emphasis),
        ("a list item outside a list", "פריט[טקסט]"),
        (
            "a note that names itself",
            "#הערה_בשם(\"עצמי\") #גוף_הערה(\"עצמי\")[טקסט]",
        ),
        ("a table with no cells", "#טבלה(עמודות: 2)"),
        (
            "a table with a hostile column count",
            "#טבלה(עמודות: 999999999)",
        ),
        (
            "a heading with a gigantic level",
            "#כותרת_1\n#כותרת_2\n#כותרת_3\n#כותרת_4\n#כותרת_5\n#כותרת_6",
        ),
        (
            "random bytes",
            "\u{fffd}\u{fffd}\u{200d}\u{200b}\u{2066}abc",
        ),
        ("nothing but whitespace", "   \n\t\n  "),
        ("a deferred marker with no body", "#הערה_בשם(\"א\")"),
        ("an include cycle", "#כלול(\"self.ksav\")"),
    ];
    for (name, body) in hostile {
        try_layout(name, body);
    }
}

/// The one row above that used to kill the process, said out loud.
///
/// `#טבלה(עמודות: 999999999)` is not a slow compile and not a page that
/// overflows: Typst asks for a track vector of a thousand million columns and the
/// allocation fails — 34 GB, measured, on the way to `STATUS_STACK_BUFFER_OVERRUN`.
/// A share fragment is one click from a stranger, so before the guard in the
/// prelude this was "open the link, lose your unsaved work".
///
/// The limit stays in the sentence, because a writer who typed a number needs to
/// know which numbers work. Break the guard in `ksav.typ` and this process does
/// not fail this assertion — it dies, which is the point of asserting it here.
#[test]
fn a_hostile_column_count_is_refused_with_the_limit_in_the_sentence() {
    let diags = probe::layout("#טבלה(עמודות: 999999999)[א]", &DocConfig::default())
        .expect_err("a thousand million columns is not a table anybody can print");
    let said = diags
        .iter()
        .map(|d| d.message.clone())
        .collect::<Vec<_>>()
        .join(" | ");
    assert!(
        said.contains("256"),
        "the refusal has to name the limit, not just refuse: {said}"
    );
    assert!(
        said.contains("עמודות") || said.contains("table"),
        "and it has to name the argument that was wrong: {said}"
    );
    assert!(
        !said.contains("unexpected"),
        "a refusal this deliberate is not an unexpected error: {said}"
    );
}

/// And an ordinary table still lays out — the fence on the fence.
#[test]
fn an_ordinary_table_is_still_a_table() {
    let out = probe::layout(
        "#טבלה(עמודות: 2)[#כותרת_תא[א] #כותרת_תא[ב] #תא[1] #תא[2]]",
        &DocConfig::default(),
    );
    assert!(out.is_ok(), "two columns is not a hostile table: {out:?}");
}

/// A document that is *correct* still has to lay out — the file is a fence on
/// itself: a regression that makes everything fail would pass every hostile row
/// above, because "a diagnostic" is what a broken engine produces.
#[test]
fn a_correct_document_still_compiles() {
    let doc = "#שער[שלום]\n\nטקסט הגוף.\n\n#הערה[הערה רגילה.]\n";
    let out = probe::layout(doc, &DocConfig::default());
    assert!(
        out.is_ok(),
        "the control document must compile, or this whole file proves nothing"
    );
}

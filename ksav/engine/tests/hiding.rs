//! The three constructs, from the page's side.
//!
//! The editor offers a writer three ways to mark off a span of source, and the
//! whole of the difference between them is what reaches the page:
//!
//! - `// …` — a line the page never sees.
//! - `/* … */` — a passage the page never sees.
//! - `//{ … //}` — a **fold**: the page sees all of it, and never sees the marks.
//!
//! `app/src/hiding.ts` names them and puts a door on each. This file is the
//! claim underneath: that the fold is free. It is not obviously free — the
//! marks are whole lines of source, and a line of source between two lines of
//! prose is exactly the shape that makes a paragraph break. Typst treats a
//! comment as trivia and does not count its newlines, so a fold placed in the
//! middle of a paragraph leaves the paragraph alone. That is a fact about
//! Typst, not about Ksav, which is precisely why it is worth a test here: if a
//! future Typst decided otherwise, every fold in every sefer would silently
//! start splitting paragraphs.

mod common;
use common::{page_text, render, visual_lines};

/// What the editor writes. Kept as constants so this file and `hiding.ts`
/// cannot drift apart in silence — the app suite reads these very lines.
const FOLD_OPEN: &str = "//{";
const FOLD_CLOSE: &str = "//}";
const LINE: &str = "//";
const BLOCK_OPEN: &str = "/*";
const BLOCK_CLOSE: &str = "*/";

/// The rendered page as one string, with the runs joined.
fn printed(body: &str) -> String {
    page_text(body)
}

/// How the body was laid out: one entry per visual line.
fn shape(body: &str) -> Vec<String> {
    let runs = render(body);
    visual_lines(&runs).iter().map(|l| l.text()).collect()
}

#[test]
fn a_fold_prints_every_word_and_none_of_its_marks() {
    let plain = "אחת שתים שלש";
    let folded = format!("{FOLD_OPEN} שם\nאחת שתים שלש\n{FOLD_CLOSE}");
    assert_eq!(printed(plain), printed(&folded));
    assert!(!printed(&folded).contains('{'), "a mark reached the page");
    assert!(
        !printed(&folded).contains("שם"),
        "the fold's label reached the page"
    );
}

#[test]
fn a_fold_in_the_middle_of_a_paragraph_does_not_break_it() {
    // The one that is not obvious. A comment line sits between two lines of
    // prose, and two newlines with only trivia between them is the shape of a
    // paragraph break in most markup languages. In Typst it is not, so the
    // paragraph stays one paragraph and the fold is free.
    let plain = "אחת\nשתים\nשלש";
    let folded = format!("אחת\n{FOLD_OPEN} שם\nשתים\n{FOLD_CLOSE}\nשלש");
    assert_eq!(shape(plain), shape(&folded));
    assert_eq!(shape(&folded).len(), shape(plain).len());
}

#[test]
fn a_fold_nested_in_a_fold_is_still_free() {
    let plain = "אחת שתים";
    let folded = format!("{FOLD_OPEN} חוץ\n{FOLD_OPEN} פנים\nאחת שתים\n{FOLD_CLOSE}\n{FOLD_CLOSE}");
    assert_eq!(printed(plain), printed(&folded));
}

#[test]
fn a_hidden_line_reaches_nothing() {
    let body = format!("אחת\n{LINE} שתים\nשלש");
    let out = printed(&body);
    assert!(out.contains("אחת") && out.contains("שלש"));
    assert!(!out.contains("שתים"), "a hidden line printed: {out}");
}

#[test]
fn a_hidden_passage_reaches_nothing() {
    let body = format!("אחת {BLOCK_OPEN} שתים {BLOCK_CLOSE} שלש");
    let out = printed(&body);
    assert!(out.contains("אחת") && out.contains("שלש"));
    assert!(!out.contains("שתים"), "a hidden passage printed: {out}");
}

#[test]
fn a_hidden_passage_may_span_lines() {
    // The half the line comment cannot do, and the reason there are two ways to
    // hide rather than one.
    let body = format!("אחת\n{BLOCK_OPEN}\nשתים\nשלש\n{BLOCK_CLOSE}\nארבע");
    let out = printed(&body);
    assert!(out.contains("אחת") && out.contains("ארבע"));
    assert!(!out.contains("שתים") && !out.contains("שלש"), "{out}");
}

#[test]
fn a_command_inside_a_hidden_span_does_not_run() {
    // "Hidden" has to mean hidden from the *compiler*, not merely unprinted:
    // a `#הערה` that still numbered from inside a comment would renumber every
    // note after it while showing nothing.
    let live = printed("אחת#הערה[גוף]\nשתים#הערה[עוד]");
    let hidden = printed(&format!("{LINE} אחת#הערה[גוף]\nשתים#הערה[עוד]"));
    assert!(live.contains('1') && live.contains('2'), "{live}");
    assert!(
        !hidden.contains('2'),
        "a hidden note still took a number: {hidden}"
    );
}

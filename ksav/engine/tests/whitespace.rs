//! What source whitespace does to the page.
//!
//! A writer breaks a long line, indents a nested command, or leaves a blank line
//! between two blocks — for the sake of reading the *source*. Typst has an opinion
//! about all of it, and the opinion is not "nothing": a newline sets a space, a
//! blank line starts a paragraph. So "hidden whitespace" is a real feature request,
//! and the app now has a button for it (`hiddenBreak` in `app/src/main.ts`).
//!
//! What that button inserts is a **block comment across the line break**, because
//! whitespace *inside* a comment is consumed. This file is the proof that it is,
//! and the proof of the two things that surprised on the way:
//!
//! * a `//` comment does **not** do this — it ends at the newline, so the newline
//!   is still there and still sets a space; and
//! * runs of spaces, tabs and leading indentation need no escape at all, because
//!   they collapse to one space before they ever reach the page.
//!
//! The second is why the feature is one action and not a family of them. Both are
//! Typst's behaviour rather than Ksav's, which is precisely why they are pinned
//! here: nothing in this repository would otherwise notice the day they change.

mod common;
use common::render;

use ksav_engine::probe::TextRun;

/// Everything that printed, in layout order, as one string.
fn page_text(body: &str) -> String {
    render(body).iter().map(|r| r.text.as_str()).collect()
}

/// The words of the body only — the page number is drawn by the document wrapper
/// and is not what any of these assertions are about.
fn words(body: &str) -> String {
    page_text(body).replace('1', "")
}

// ── the problem ──────────────────────────────────────────────────────────────

#[test]
fn a_source_newline_sets_a_space() {
    assert_eq!(words("אבג\nדהו"), "אבג דהו");
}

#[test]
fn a_line_comment_does_not_swallow_its_newline() {
    // The one that looks like it should work. `//` ends *at* the break, so the
    // break is outside the comment and prints — which is why the button inserts
    // the block form and why this is asserted rather than assumed.
    assert_eq!(words("אבג // הערה\nדהו"), "אבג דהו");
    assert_eq!(words("אבג\n// שורה שלמה\nדהו"), "אבג דהו");
}

// ── the escape ───────────────────────────────────────────────────────────────

#[test]
fn a_block_comment_across_the_break_prints_nothing() {
    // Exactly what `hiddenBreak` inserts: `/*`, the newline, `*/`.
    assert_eq!(words("אבג/*\n*/דהו"), "אבגדהו");
}

#[test]
fn and_it_eats_blank_lines_too() {
    // Blank lines are the expensive case: without the comment this is a paragraph
    // break, not a space. Inside one, three of them come to nothing.
    assert_eq!(words("אבג/*\n\n\n*/דהו"), "אבגדהו");
}

#[test]
fn the_hidden_break_leaves_one_line() {
    // Not merely "the space is gone" — the two halves have to land on the same
    // line. A paragraph break also prints no space, and would pass the assertion
    // above while being the opposite of what the writer asked for.
    let runs = render("אבג/*\n\n*/דהו");
    let body: Vec<&TextRun> = runs.iter().filter(|r| r.text != "1").collect();
    assert!(!body.is_empty(), "nothing rendered");
    let first = body[0].y;
    assert!(
        body.iter().all(|r| (r.y - first).abs() < 0.01),
        "the halves landed on different lines: {:?}",
        body.iter()
            .map(|r| (r.text.clone(), r.y))
            .collect::<Vec<_>>(),
    );
}

#[test]
fn a_blank_line_without_the_comment_does_start_a_paragraph() {
    // The control for the test above: same source, no comment, two lines.
    let runs = render("אבג\n\nדהו");
    let body: Vec<&TextRun> = runs.iter().filter(|r| r.text != "1").collect();
    let ys: Vec<f64> = body.iter().map(|r| r.y).collect();
    assert!(
        ys.windows(2).any(|w| (w[1] - w[0]).abs() > 0.01),
        "a blank line should have started a new paragraph, got {ys:?}",
    );
}

// ── what needs no escape ─────────────────────────────────────────────────────

#[test]
fn runs_of_spaces_and_tabs_already_collapse() {
    assert_eq!(words("אבג    דהו"), "אבג דהו");
    assert_eq!(words("אבג\t\tדהו"), "אבג דהו");
}

#[test]
fn indentation_already_collapses() {
    // Indenting a continuation line to show that it belongs to what is above it
    // costs nothing on the page — one space, the same as any newline.
    assert_eq!(words("אבג\n        דהו"), "אבג דהו");
}

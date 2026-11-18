//! How deep a document can go, and what happens at the bottom.
//!
//! `tests/hostile.rs` ends with an open question held deliberately rather than
//! guessed at: *"the parser's nesting depth is a real limit and blowing the
//! stack is an abort no test can catch, so a document with a million brackets is
//! a separate question, filed rather than run."* This file is that question,
//! answered by running it.
//!
//! Two different things nest, and they have different answers:
//!
//! * **Typst content** (`#box[#box[…]]`, `#strong[…]`) is parsed recursively and
//!   Typst bounds the recursion itself. At the bound it returns an error, and
//!   Ksav already turns that error into a sentence a writer can act on — in both
//!   languages, naming the structure rather than Typst's internal type. So the
//!   answer is a **verdict**, which is what the M3 audit asked for.
//!
//! * **Plain text brackets** (`[[[[…]]]]`) are *characters*, not nesting: the
//!   markup parser pushes them as literal text. The note above was afraid of a
//!   million of them, so they are run here at 20,000 pairs — two orders of
//!   magnitude past any real document. The *stack* question turns out to be a
//!   non-question: the cost is time, and the time is Typst's own and superlinear
//!   in the number of brackets (measured in release: 10,000 pairs 0.05 s,
//!   40,000 pair-characters and stray `]` at 160,000 cost about two minutes of
//!   CPU — filed as #213, because a compile budget is a decision and not a
//!   bracket-counted magic number to drop into a test).
//!
//! The tests are written so that neither can be satisfied by refusing
//! everything: each depth that is refused is paired with a depth that must
//! compile. A limit that moved because the vendored Typst changed its constant
//! shows up as a red assertion naming both numbers, not as a product discovery.

use ksav_engine::{probe, DocConfig};

/// A document of `n` nested `#box[` blocks.
fn nested_boxes(n: usize) -> String {
    let mut s = String::with_capacity(n * 6 + 8);
    for _ in 0..n {
        s.push_str("#box[");
    }
    s.push('x');
    for _ in 0..n {
        s.push(']');
    }
    s
}

/// A document of `n` plain-text bracket pairs — characters, not content.
fn nested_brackets(n: usize) -> String {
    let mut s = String::with_capacity(n * 2 + 8);
    for _ in 0..n {
        s.push('[');
    }
    s.push('x');
    for _ in 0..n {
        s.push(']');
    }
    s
}

fn refuse_reason(n: usize) -> String {
    match probe::layout(&nested_boxes(n), &DocConfig::default()) {
        Ok(_) => String::new(),
        Err(diags) => diags
            .iter()
            .map(|d| d.message.clone())
            .collect::<Vec<_>>()
            .join(" · "),
    }
}

#[test]
fn content_nested_past_typsts_limit_is_a_sentence_in_both_languages_not_an_abort() {
    // Forty times the depth that is refused: if the bound were not enforced by
    // the parser this is where the stack would go.
    let deep = 4_000;
    let outcome = probe::layout(&nested_boxes(deep), &DocConfig::default());
    let diags = outcome.expect_err("4,000 levels of nesting cannot compile");
    assert_eq!(
        diags.len(),
        1,
        "one refusal, said once — a diagnostic per level would be 4,000 lines of the same \
         sentence. got: {diags:?}"
    );
    let message = &diags[0].message;
    assert_eq!(diags[0].severity, "error", "a refusal is an error");
    // Both languages, and it names the *structure*, not Typst's `depth` field.
    assert!(
        message.contains("קינון") && message.to_lowercase().contains("nesting"),
        "the refusal must say what is wrong in both languages. got: {message}"
    );
    assert!(
        message.contains("Typst") || message.contains("בטיחות"),
        "and that it is the renderer's own safety limit rather than the writer's mistake. \
         got: {message}"
    );
}

#[test]
fn the_limit_is_where_this_test_says_it_is_so_a_change_in_it_is_noticeable() {
    // Both directions, on the same document shape. 64 compiles; 96 is refused.
    // The gap is deliberate: the assertion is about *which side of the limit*
    // each depth falls on, not about the exact constant, so a vendored Typst
    // moving it by one is not a red build — but a change big enough to matter is.
    assert!(
        probe::layout(&nested_boxes(64), &DocConfig::default()).is_ok(),
        "64 nested boxes compiled before this test was written and must still compile"
    );
    assert!(
        probe::layout(&nested_boxes(96), &DocConfig::default()).is_err(),
        "96 nested boxes were refused before this test was written and must still be refused"
    );
    // And the refusal is the nesting sentence rather than something else that
    // happens to be an error at this depth.
    let reason = refuse_reason(96);
    assert!(
        reason.contains("קינון"),
        "the error at 96 is not the nesting limit, so the assertion above is measuring the \
         wrong thing. got: {reason}"
    );
}

#[test]
fn twenty_thousand_plain_brackets_are_text_and_compile() {
    // The "million brackets" the hostile-input note filed rather than ran, at a
    // size a test can afford: brackets that are not preceded by `#` are
    // characters, so the parser must not recurse on them. What this asserts is
    // the *stack* — the walk finishes and compiles — and the bound below is
    // generous on purpose, because the cost question is #213's and a tight
    // number here would fail on a slow machine for a reason that is not this
    // test's subject.
    let body = nested_brackets(20_000);
    let started = std::time::Instant::now();
    let outcome = probe::layout(&body, &DocConfig::default());
    let elapsed = started.elapsed();
    assert!(
        outcome.is_ok(),
        "plain-text brackets are not nesting and must compile. errors: {:?}",
        outcome
            .err()
            .map(|ds| ds.iter().map(|d| d.message.clone()).collect::<Vec<_>>())
    );
    assert!(
        elapsed < std::time::Duration::from_secs(30),
        "200,000 bracket pairs took {elapsed:?}, which is not the linear cost this test \
         claims — the number is generous on purpose, because this is a stack-and-hang \
         question rather than a performance one"
    );
}

#[test]
fn the_same_characters_prefixed_with_a_hash_are_refused_rather_than_stacked() {
    // The honest middle case: `#[` is content, so the same characters *do*
    // nest. If the limit were only enforced for the `#box` spelling, this is
    // where it would show.
    let mut body = String::new();
    for _ in 0..4_000 {
        body.push_str("#[");
    }
    body.push('x');
    for _ in 0..4_000 {
        body.push(']');
    }
    let outcome = probe::layout(&body, &DocConfig::default());
    let diags = outcome.expect_err("4,000 nested content blocks cannot compile");
    assert!(
        diags
            .iter()
            .any(|d| d.message.contains("קינון") || d.message.to_lowercase().contains("nesting")),
        "a nested content block is refused with the nesting sentence too. got: {:?}",
        diags.iter().map(|d| d.message.clone()).collect::<Vec<_>>()
    );
}

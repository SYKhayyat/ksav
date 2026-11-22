//! A document's bracket shape, answered in bounded time (#213).
//!
//! # The finding
//!
//! A 166 KB body of stray `]` took **two minutes** of CPU to lay out and
//! emitted one diagnostic per bracket. Nothing bounded the *work*: the server
//! abandons the wait at its deadline and the compile carries on (Typst offers no
//! interruption), and the editor can only stop waiting. So a paste of a broken
//! document froze the window for minutes, twice over — once for the compile, once
//! for the status list of 160,000 diagnostics.
//!
//! `src/shape.rs` refuses two shapes, both measured (`examples/bench-brackets.rs`):
//! a few hundred stray closers (superquadratic, and every one is an error), and
//! past 48,000 bracket characters (quadratic, and seven times the largest real
//! document measured).
//!
//! # What is pinned here
//!
//! 1. **The resolving test the issue asked for**: 160,000 stray closers is a
//!    verdict in *milliseconds*, with **one** sentence rather than 160,000, and
//!    that sentence names the count in both languages.
//! 2. **The ceiling is not satisfied by refusing everything.** The same number of
//!    *balanced* brackets — 20,000 pairs, the "200,000 plain brackets are text
//!    and compile" case from `tests/nesting.rs` — still compiles, so the refusal
//!    is about the pathological shape and not about bracket characters as such.
//! 3. **A real document is far from both**, and a single typo is a diagnostic
//!    rather than a refusal.
//!
//! The timing assertion is deliberately loose. A pre-scan of a 160 KB string is
//! linear and takes tens of microseconds; what the number has to separate is
//! *that* from the 114 s the same document used to cost, so it is stated in
//! seconds and says so.

use ksav_engine::{probe, shape, DocConfig};
use std::time::{Duration, Instant};

fn stray(n: usize) -> String {
    "]".repeat(n)
}

fn pairs(n: usize) -> String {
    let mut s = String::with_capacity(2 * n + 1);
    for _ in 0..n {
        s.push('[');
    }
    s.push('x');
    for _ in 0..n {
        s.push(']');
    }
    s
}

#[test]
fn a_hundred_and_sixty_thousand_stray_closers_answer_in_milliseconds_with_one_sentence() {
    // 166 KB, the size the issue measured at 113.77 s through `compile`.
    let body = stray(160_000);
    let started = Instant::now();
    let outcome = probe::layout(&body, &DocConfig::default());
    let elapsed = started.elapsed();
    let diags = outcome.expect_err("a body of 160,000 stray closers cannot be laid out");

    assert_eq!(
        diags.len(),
        1,
        "one refusal, said once — a diagnostic per closer is 160,000 lines of the same \
         sentence, which was half the original cost. got {} diagnostics",
        diags.len()
    );
    // A verdict in bounded time. The ceiling is the *scan*'s cost, not Typst's:
    // two seconds is a hundred thousand times the measured scan and still a
    // hundredth of the compile it refuses.
    assert!(
        elapsed < Duration::from_secs(2),
        "the refusal took {elapsed:?}. This document measured 113.77 s to lay out; a \
         pre-scan that takes even a second is not a pre-scan"
    );
    let message = &diags[0].message;
    assert_eq!(diags[0].severity, "error", "a refusal is an error");
    // It says *how many*, so the writer can act, and it says it in both
    // languages, because this is a sentence shown to a person.
    assert!(
        message.contains("160000") || message.contains("160,000"),
        "the refusal must name the count it refused on. got: {message}"
    );
    assert!(
        message.contains("סוגר") && message.to_lowercase().contains("bracket"),
        "the refusal must say what is wrong in both languages. got: {message}"
    );
    // **Which of the two refusals it is.** A stray closer at depth zero is the
    // shape that costs superquadratically and the one this body is; the
    // total-bracket sentence is a different diagnosis, and a fence that accepted
    // either would not notice the census mistaking one for the other.
    assert!(
        message.contains("בלי פתיחה") && message.contains("open nothing"),
        "160,000 stray closers is the stray-closer refusal, not the many-brackets one: \
         the sentence must say that they close nothing. got: {message}"
    );
}

#[test]
fn the_same_number_of_balanced_brackets_still_lays_out() {
    // `tests/nesting.rs`'s answer to the stack question, unchanged by this:
    // 20,000 pairs are 40,000 bracket characters, under the 48,000 ceiling, and
    // they are text. A refusal that took this too would be a ceiling on bracket
    // characters rather than on the shape that costs minutes.
    let body = pairs(20_000);
    assert_eq!(shape::census(&body).stray_closers, 0);
    assert!(shape::census(&body).brackets < shape::BRACKET_CEILING);
    let outcome = probe::layout(&body, &DocConfig::default());
    assert!(
        outcome.is_ok(),
        "balanced plain-text brackets must still compile. errors: {:?}",
        outcome
            .err()
            .map(|ds| ds.iter().map(|d| d.message.clone()).collect::<Vec<_>>())
    );
}

#[test]
fn a_balanced_document_past_the_ceiling_is_refused_by_the_ceiling_it_names() {
    // The other side of that: 40,000 pairs were 6.90 s measured, and the refusal
    // is the *count* sentence rather than the stray-closer one.
    let body = pairs(40_000);
    let diags = probe::layout(&body, &DocConfig::default())
        .expect_err("40,000 pairs is past the bracket ceiling");
    assert_eq!(diags.len(), 1);
    assert!(
        diags[0].message.contains("48000") || diags[0].message.contains("48,000"),
        "the refusal must name the ceiling. got: {}",
        diags[0].message
    );
    assert!(
        diags[0].message.to_lowercase().contains("bracket"),
        "and say what it is about in English. got: {}",
        diags[0].message
    );
}

#[test]
fn a_real_document_is_nowhere_near_either_ceiling_and_one_typo_is_a_diagnostic() {
    // Forty chapters carrying the syntax a sefer really uses: headings, notes,
    // bold, and a great deal of prose. Measured 6,480 bracket characters at
    // 563 KB and 0.22 s.
    let mut body = String::new();
    for c in 0..40 {
        body.push_str(&format!("#כותרת1[פרק {}]\n\n", c + 1));
        for p in 0..40 {
            body.push_str(&format!(
                "ויאמר רבי שמעון בן יוחאי, כל אותן {} שנים, ולמד {}\n",
                p + 1,
                "#הדגשה[סוד]"
            ));
            body.push_str(&format!(
                "וכן אמרו במסכת ברכות עמוד {}, {} {}\n\n",
                p + 2,
                "#הדגשה[עיין שם]",
                "#הערה[ביאור: עיין לעיל.]"
            ));
        }
    }
    let c = shape::census(&body);
    assert!(c.stray_closers == 0, "a real document has no stray closers");
    assert!(
        c.brackets * 3 < shape::BRACKET_CEILING,
        "a real sefer measured {} brackets; the ceiling is meant to sit far above it",
        c.brackets
    );
    assert!(
        probe::layout(&body, &DocConfig::default()).is_ok(),
        "a real sefer must lay out"
    );

    // One missing opener is the writer's typo, and the writer gets told about it
    // by the diagnostic path — not refused the whole document.
    let mut with_a_typo = body.clone();
    with_a_typo.push_str("\nוכן כתוב שם ] סתם\n");
    assert!(shape::refusal(&with_a_typo).is_none());
}

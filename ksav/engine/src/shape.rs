//! A body's shape, judged **before** it is laid out (#213).
//!
//! # Why this file exists
//!
//! Typst's markup parse costs more than linearly in the number of bracket
//! characters, and nothing in the request path bounded that cost: a 166 KB
//! document of stray `]` held a compile slot for two minutes (the server
//! abandons the *wait* at the deadline but the compile keeps running — that is
//! by design, Typst offers no interruption) and emitted one diagnostic per
//! stray closer. The client can refuse to wait; nobody could refuse to *start*.
//!
//! The refusals live here, as a linear scan of the body that runs before the
//! world is built. Two findings from the measurement (examples/bench-brackets.rs,
//! release, on the machine #213 was measured on):
//!
//! | shape | brackets | time |
//! |---|---|---|
//! | stray `]` | 5,000 | 0.43 s |
//! | stray `]` | 10,000 | 1.81 s |
//! | stray `]` | 20,000 | 9.89 s |
//! | stray `]` | 40,000 | 55.3 s |
//! | `[...]` pairs | 10,000 pairs | 0.42 s |
//! | `[...]` pairs | 20,000 pairs | 1.68 s |
//! | `[...]` pairs | 40,000 pairs | 6.90 s |
//! | **a real 563 KB sefer** | **6,480** | **0.22 s** |
//!
//! Two numbers, each chosen from this table and each refusing a different
//! failure:
//!
//! * **A few hundred stray closers** — a `]` with no `[` open. Real documents
//!   have none; each stray closer is also a diagnostic, so this refuses *a
//!   broken draft* rather than *a big document*, and the cost curve is worst
//!   here (superquadratic — the parser appears to rescan for an opener per
//!   closer).
//! * **Forty-eight thousand bracket characters** — seven times the largest real
//!   document measured. Balanced plain-text brackets are legitimate Typst, and
//!   their cost is merely quadratic, so the ceiling sits where a real
//!   document's bracket count could never reach on accident, and a document
//!   under it costs at most a couple of seconds (20,000 pairs measured 1.68 s).
//!
//! Both refusals name their numbers so a writer can act on them, and neither
//! depends on Typst's own opinions: the scan is this crate's, and it answers in
//! microseconds.

use crate::diagnostics::Diagnostic;

/// How many stray closers a body may carry before it is refused.
///
/// Above this, the document is not a draft with typos — it is a shape Typst's
/// parser pays superquadratically for, and the writer gets one sentence instead
/// of thousands of diagnostics.
pub const STRAY_CLOSER_CEILING: usize = 200;

/// How many `[` and `]` characters a body may carry before it is refused.
///
/// Seven times the 6,480 bracket characters a 563 KB sefer measures, so the
/// largest document a writer can realistically produce keeps far to one side.
pub const BRACKET_CEILING: usize = 48_000;

/// What the bracket census of a body found. Public for the fences that assert
/// the *thresholds* on both sides.
pub struct BracketCensus {
    /// `[` and `]` characters in the body.
    pub brackets: usize,
    /// `]` characters that closed nothing — depth was zero when they appeared.
    pub stray_closers: usize,
}

/// One linear pass over the body, counting bracket characters and the closers
/// that close nothing.
///
/// Depth is tracked without regard to context: a `[` inside a comment or a
/// string still costs the parser something, and this scan must never
/// under-count what Typst will pay for. The one thing it does *not* count is
/// brackets the writer cannot have typed — the prelude is added by the caller
/// after this runs, and its cost is constant and measured.
pub fn census(body: &str) -> BracketCensus {
    let mut brackets = 0usize;
    let mut stray_closers = 0usize;
    let mut depth = 0i64;
    for b in body.bytes() {
        match b {
            b'[' => {
                brackets += 1;
                depth += 1;
            }
            b']' => {
                brackets += 1;
                if depth > 0 {
                    depth -= 1;
                } else {
                    stray_closers += 1;
                }
            }
            _ => {}
        }
    }
    BracketCensus {
        brackets,
        stray_closers,
    }
}

/// The refusal a body deserves, or `None` when it may be laid out.
///
/// Called at the top of `layout_document`, before anything is assembled. The
/// two sentences both say *what the count was* and *what to look at*, and both
/// are in the two languages a writer of this application reads — the refusal is
/// the writer's, not a log line's.
pub fn refusal(body: &str) -> Option<Diagnostic> {
    let c = census(body);
    if c.stray_closers > STRAY_CLOSER_CEILING {
        return Some(Diagnostic {
            severity: "error".to_string(),
            message: format!(
                "המסמך מכיל {n} סוגריים סוגרים בלי פתיחה — כאילו נשמטו הפתיחות שלהם. \
                 עלות הסידור גדלה עם ריבוע מספרם, ולכן המסמך נעצר לפני שנפרס דף אחד; \
                 בדקו שכל `]` סוגר `[` שנפתח לפניו · the document holds {n} closing \
                 brackets that open nothing, as if their openers were dropped. The \
                 typesetter's cost grows with the square of that count, so this is \
                 refused before a single page is laid out; check that every `]` closes \
                 a `[` opened before it",
                n = c.stray_closers,
            ),
            raw: format!("{} stray closers", c.stray_closers),
            line: None,
            column: None,
            about: Some("סוגריים".to_string()),
            did_you_mean: None,
            file: None,
        });
    }
    if c.brackets > BRACKET_CEILING {
        return Some(Diagnostic {
            severity: "error".to_string(),
            message: format!(
                "המסמך מכיל {n} תווי סוגריים, מעבר לגבול של {limit}. עלות הסידור \
                 גדלה עם ריבוע מספרם, ולכן מסמך כזה היה תוקע את החלון לדקות; הקטינו \
                 את מספר הסוגריים או פצלו את המסמך · the document carries {n} bracket \
                 characters, past the {limit} limit. The typesetter's cost grows with \
                 the square of that count, so a document shaped like this would hold \
                 the window for minutes; reduce the brackets or split the document",
                n = c.brackets,
                limit = BRACKET_CEILING,
            ),
            raw: format!("{} bracket characters", c.brackets),
            line: None,
            column: None,
            about: Some("סוגריים".to_string()),
            did_you_mean: None,
            file: None,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn the_census_counts_what_typst_will_pay_for() {
        let c = census(&stray(10));
        assert_eq!(c.brackets, 10);
        assert_eq!(c.stray_closers, 10);
        let c = census(&pairs(5));
        assert_eq!(c.brackets, 10);
        assert_eq!(c.stray_closers, 0);
        let c = census("אבל [טקסט] ו]\n[#בלוק[ג]]");
        assert_eq!(c.brackets, 7);
        assert_eq!(c.stray_closers, 1);
        assert_eq!(census("אין כאן סוגריים בכלל").brackets, 0);
    }

    #[test]
    fn both_ceilings_refuse_past_and_allow_up_to() {
        // The two ceilings, from both sides, through the verdict rather than the
        // census — a threshold that moves is a red build naming both numbers.
        assert!(refusal(&stray(STRAY_CLOSER_CEILING)).is_none());
        assert!(refusal(&stray(STRAY_CLOSER_CEILING + 1)).is_some());
        // Stray closers take precedence over the total-bracket ceiling.
        assert!(refusal(&stray(BRACKET_CEILING + 1)).is_some());
        assert!(refusal(&pairs(BRACKET_CEILING / 2)).is_none());
        assert!(refusal(&pairs(BRACKET_CEILING / 2 + 1)).is_some());
    }

    #[test]
    fn a_real_document_is_nowhere_near_either_ceiling() {
        // The same document the benchmark compares against: forty chapters of
        // prose with the syntax a sefer actually carries. Measured 6,480
        // brackets, 0 stray, 0.22 s to lay out.
        let mut body = String::new();
        for _ in 0..40 {
            body.push_str("#כותרת1[פרק]\n\n");
            for _ in 0..10 {
                body.push_str("ויאמר רבי שמעון בן יוחאי \n#הדגשה[סוד]\n#הערה[ביאור]\n\n");
            }
        }
        let c = census(&body);
        assert!(
            c.brackets < BRACKET_CEILING / 3,
            "a real sefer measured {} brackets; the ceiling has 7x headroom by design",
            c.brackets
        );
        assert_eq!(c.stray_closers, 0);
        assert!(refusal(&body).is_none());
    }

    #[test]
    fn one_typo_is_a_diagnostic_not_a_refusal() {
        // The refusal's job is not to hide a writer's mistakes: a stray closer
        // apiece in a real document stays a diagnostic and the document compiles.
        let mut body = String::new();
        for _ in 0..42 {
            body.push_str("...\n");
        }
        body.push_str("טקסט וסוגר סתם ]\n");
        assert_eq!(census(&body).stray_closers, 1);
        assert!(refusal(&body).is_none());
    }
}

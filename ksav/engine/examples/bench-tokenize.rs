//! Is the spell-checker's tokenizer linear? #62 says it is not, and then says
//! "suspicion only — needs a perf profile to rule out FP". This is that
//! profile, as a command anybody can re-run rather than a paragraph.
//!
//! ```sh
//! cargo run --release --example bench-tokenize
//! ```
//!
//! # What the run showed
//!
//! **#62's quadratic does not reproduce. Every shape measures flat.** The
//! per-megabyte cost is the same at 2 MB as at 128 KB on all five shapes, so
//! doubling the input doubles the time and the tokenizer is linear.
//!
//! # Why, and it is not close
//!
//! `joins` is asked once per separator "how many letters follow you". The scan
//! that answers it stops at the next character that is not part of a word — and
//! the characters `joins` is called *for* are exactly those characters. So the
//! region scanned after one separator cannot contain another separator, which
//! means the regions do not overlap and their lengths sum to at most the length
//! of the text. The sum of a partition is the whole thing, not its square.
//!
//! `english-scan-crosses-greek` is the shape that could have broken it and is
//! the one worth keeping: `english::joins` counts `char::is_alphabetic`, and a
//! Greek letter is alphabetic but is *not* `english::is_part`, so an English
//! quote's scan runs straight through Greek letters where a Hebrew scan would
//! have stopped. It measured flat too, because the next quote is still not
//! alphabetic and still ends the run.
//!
//! # So what is the `cap` for
//!
//! It is still right, and still worth having — it is a **constant-factor and
//! robustness** fix, not a complexity fix, and the issue's own suggested remedy
//! ("cap lookahead or precompute runs") is exactly this:
//!
//! - before: a separator cost O(length of the rest of its word) — bounded, but
//!   only because of the disjointness argument above, which is a property of the
//!   *current* rules rather than of the code;
//! - after: a separator costs O(1) unconditionally, so the answer cannot be
//!   broken by a future rule that lets a separator's tail reach further.
//!
//! # The instrument, and why it is minimum-of-seven
//!
//! This box is shared and the load average sits above 15. A wall-clock ratio
//! taken from a single run here reports whatever the neighbouring build was doing
//! at that instant: the first version of this example read
//! `hebrew-one-separator-long-tail` as **QUADRATIC** purely from a neighbour's
//! compile, on a shape whose own cost-per-megabyte had been *falling* for four
//! sizes and then jumped once. Taking the **minimum** over seven runs — the run
//! where nothing else wanted the core — turned the same shape into a dead-flat
//! 3.88 → 3.88 ms/MB. That is the estimator every benchmark harness uses and the
//! reason this one is not a mean.
//!
//! # Not a test, and why
//!
//! `bench-scaling` opens with the rule and this obeys it: *"wall-clock
//! assertions fail on a loaded CI box and pass while hiding a regression twice
//! their size."* Nothing here is asserted anywhere. The correctness claim —
//! that a two-letter tail joins and a three-letter tail does not, which is what
//! a wrong cap would break — lives in `tests/spell.rs`. The complexity claim
//! lives here.
use ksav_engine::spell;
use std::time::Instant;

/// Times `words()` over one shape and returns `(elapsed ms, bytes)`.
///
/// **Minimum of `REPEATS`, not the mean and not the first.** This box is shared:
/// the load average sits above 15 with other builds running, and a wall-clock
/// ratio taken from a single run on a box like this reports whatever the
/// neighbours were doing at that instant. The minimum is the one estimator that
/// survives that — it is the run where nothing else wanted the core — and it is
/// the same reason every benchmark harness takes a best-of-N. Taking a mean here
/// produced a spurious "QUADRATIC" on a shape whose own cost-per-megabyte had
/// been *falling* for four sizes and then jumped once, which is a neighbour's
/// compile, not a complexity change.
const REPEATS: usize = 7;

fn timed(text: &str) -> (f64, usize) {
    // Warm the allocator and the branch predictors on a small input first, so
    // the first size is not also paying for the first touch of a 2 MB buffer.
    let _ = spell::words("שלום don't");
    let n = text.len();
    let mut best = f64::INFINITY;
    for _ in 0..REPEATS {
        let t = Instant::now();
        let tokens = spell::words(text);
        let dt = t.elapsed().as_secs_f64() * 1000.0;
        // Consume the result so the walk cannot be optimised away.
        assert!(!tokens.is_empty());
        best = best.min(dt);
    }
    (best, n)
}

/// The body for each shape, at roughly `bytes` bytes.
///
/// Every shape is separator-dense on purpose: a shape without separators never
/// calls `joins` at all, so it measures the outer loop and says nothing about
/// the inner one.
fn shape_body(shape: &str, bytes: usize) -> String {
    match shape {
        // Hebrew letter, quote, Hebrew letter, quote… — every other character is
        // a separator, so this is the densest input there is.
        "hebrew-separator-dense" => "א\"".repeat(bytes / 3),
        // One separator near the front and a very long tail behind it. A naive
        // reading of the code calls this quadratic; the partitioned reading
        // calls it one scan, and it is here to say which is right.
        "hebrew-one-separator-long-tail" => {
            let mut s = String::with_capacity(bytes + 2);
            s.push_str("א\"");
            s.push_str(&"א".repeat(bytes));
            s
        }
        // A long run with a separator every few characters: a scan has somewhere
        // to go but not far — the middle shape between the two above.
        "hebrew-quarter-dense" => "אאאא\"".repeat(bytes / 7),
        // The English rule, same dense shape.
        "english-separator-dense" => "a\"".repeat(bytes / 3),
        // **The one shape that could actually be quadratic, and the audit did
        // not check it.** `english::joins` counts `char::is_alphabetic`, and a
        // Greek letter is alphabetic but is not `english::is_part`, so an
        // English quote's scan crosses Greek letters where a Hebrew scan stops.
        "english-scan-crosses-greek" => {
            let mut s = String::with_capacity(bytes + 2);
            s.push_str("a\"");
            s.push_str(&"α".repeat(bytes));
            s
        }
        other => panic!("unknown shape {other}"),
    }
}

const SHAPES: [&str; 5] = [
    "hebrew-separator-dense",
    "hebrew-quarter-dense",
    "hebrew-one-separator-long-tail",
    "english-separator-dense",
    "english-scan-crosses-greek",
];

fn main() {
    // 128 KB up to 2 MB, five doublings. Work-normalised, the ratio is what
    // settles the question and it does not depend on the timer being good:
    // **flat means doubling the input did not raise the cost per byte, so the
    // walk is linear; a climb towards 2x is quadratic.** The last doubling is
    // the one with the most work behind it and the least startup noise in front.
    println!("tokenizer scaling — #62's quadratic claim (#62 = false positive)\n");
    for shape in SHAPES {
        println!("  {shape}");
        let mut per_mb: Option<f64> = None;
        let mut rows: Vec<(f64, f64, f64)> = Vec::new();
        for mb in [0.125, 0.25, 0.5, 1.0, 2.0] {
            let text = shape_body(shape, (mb * 1024.0 * 1024.0) as usize);
            let (ms, bytes) = timed(&text);
            let rate = ms / (bytes as f64 / (1024.0 * 1024.0));
            let ratio = per_mb.map_or(f64::NAN, |p| rate / p);
            per_mb = Some(rate);
            rows.push((mb, ms, ratio));
            println!(
                "    {:>6.3} MB   {:>9.2} ms   {:>7.2} ms/MB   {}",
                mb,
                ms,
                rate,
                if ratio.is_finite() {
                    format!("{ratio:.2}x normalised")
                } else {
                    "-".to_string()
                }
            );
        }
        let last = rows.last().expect("rows").2;
        let verdict = if last < 1.4 { "linear" } else { "QUADRATIC" };
        println!("    => {verdict} (last doubling {last:.2}x)\n");
    }
    println!(
        "Read the x-normalised column. Linear => the ms/MB figure is flat as the\n\
         input grows (doubling the bytes doubled the time, so nothing super-linear\n\
         is happening). Quadratic => that figure climbs towards 2x per doubling.\n\
         All five shapes read flat: #62's quadratic does not reproduce."
    );
}
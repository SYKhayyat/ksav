//! What `_ct_fit` costs, against the number the application is.
//!
//! `NOTES-SPILL-FINDINGS.md` lists the measure-and-cut route as the one to
//! watch: *"A binary search per split, re-run on every layout pass, is the thing
//! that could cost the 59ms."* That is the right worry and it deserves a
//! measurement rather than an estimate — Ksav is 234 pages cold in 979ms and
//! **59ms after a one-character edit**, and an editor whose preview lags is the
//! defect this whole engine choice was made to avoid.
//!
//! Two things are measured, and the second is the one that matters:
//!
//!   1. **Cold** — a document with N knees against the same document with the
//!      splits hardcoded. The difference is what the searching costs from
//!      nothing.
//!   2. **Warm** — the same document recompiled after a one-character edit at the
//!      end. This is the number the writer feels, and Typst memoises `measure`,
//!      so a prefix measured on the previous pass should be free.
//!
//! Run: `cargo run --release --example bench-fit`

use ksav_engine::{compile_doc, DocConfig};
use std::time::Instant;

/// `n` knees, each over `words` words beside a neighbour.
fn with_knees(n: usize, words: usize, tweak: &str) -> String {
    let mut s = String::from("#מסמך[\n");
    for k in 0..n {
        let body: Vec<String> = (1..=words).map(|i| format!("מילה{k}_{i:03}")).collect();
        s.push_str(&format!(
            "#ברך(\n  \"{}\",\n  [{}],\n  רוחב: 35%,\n)\n\n",
            body.join(" "),
            "גמרא. ".repeat(18)
        ));
    }
    s.push_str(&format!("{tweak}\n]\n"));
    s
}

/// The same shape with no searching in it: two plain blocks per knee.
fn without_knees(n: usize, words: usize, tweak: &str) -> String {
    let mut s = String::from("#מסמך[\n");
    for k in 0..n {
        let body: Vec<String> = (1..=words).map(|i| format!("מילה{k}_{i:03}")).collect();
        // Split at a fixed word, which is what the prior art does — sefer-engine
        // estimates "~45–50 Hebrew characters per line" and talmudifier renders
        // test PDFs to find out.
        let (head, tail) = body.split_at(6);
        s.push_str(&format!(
            "#grid(columns: (35%, 1fr), column-gutter: 8pt, block(width: 35%)[{}], [{}])\n\
             #block(width: 100%)[{}]\n\n",
            head.join(" "),
            "גמרא. ".repeat(18),
            tail.join(" "),
        ));
    }
    s.push_str(&format!("{tweak}\n]\n"));
    s
}

fn main() {
    let cfg = DocConfig::default();
    println!(
        "{:>6}  {:>10}  {:>10}  {:>10}  {:>10}",
        "knees", "cold fit", "cold fixed", "warm fit", "warm fixed"
    );
    for n in [1usize, 5, 20, 60] {
        let mut row = vec![format!("{n:>6}")];
        for computed in [true, false] {
            let make = |t: &str| {
                if computed {
                    with_knees(n, 50, t)
                } else {
                    without_knees(n, 50, t)
                }
            };
            let a = make("x");
            let b = make("y");
            let t0 = Instant::now();
            let first = compile_doc(&a, &cfg);
            let cold = t0.elapsed();
            assert!(first.is_ok(), "the benchmark document did not compile");
            let t1 = Instant::now();
            let second = compile_doc(&b, &cfg);
            let warm = t1.elapsed();
            assert!(
                second.is_ok(),
                "the edited benchmark document did not compile"
            );
            row.push(format!("{:>9.1}ms", cold.as_secs_f64() * 1000.0));
            row.push(format!("{:>9.1}ms", warm.as_secs_f64() * 1000.0));
        }
        // cold fit, warm fit, cold fixed, warm fixed → reordered for reading
        println!("{}  {}  {}  {}  {}", row[0], row[1], row[3], row[2], row[4]);
    }
    println!();
    println!("The number to judge against is 59ms warm on a 234-page sefer.");
    println!("A knee costs about log2(words) measures, and Typst memoises them.");
}

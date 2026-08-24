//! The scaling datapoints, reproducible.
//!
//! The 23 August audit measured three shapes and recorded them as numbers in
//! prose — a 2 MB single word at 10 s, a 4.7 MB body over HTTP at 20 s, and
//! 240 collected endnotes at 225 ms wall with the endnote path flat. A number
//! in prose is a claim nobody has to keep true; this example is the same three
//! measurements as a command anybody can re-run, so the next audit compares
//! against an instrument instead of a paragraph.
//!
//! ```sh
//! cargo run --release --example bench-scaling
//! ```
//!
//! Not a test on purpose: wall-clock assertions fail on a loaded CI box and
//! pass while hiding a regression twice their size. The numbers are for the
//! human reading them, beside `bench-incr`'s per-keystroke costs.
use ksav_engine::{compile_doc, DocConfig};
use std::time::Instant;

/// One enormous single word: the pathological case, where layout cannot break
/// a line and every shaping attempt covers the whole thing.
fn one_word(mb: usize) -> String {
    // A real Hebrew letter repeated; a single glyph means no font fallback and
    // keeps the measurement about layout rather than about shapings.
    "א".repeat(mb * 1024 * 1024 / 2)
}

/// Many collected endnotes: the apparatus path the audit found flat, held to
/// that finding.
fn endnotes(n: usize) -> String {
    let body = "פסק קצר של טקסט לפני ההערה";
    let mut s = String::new();
    for i in 1..=n {
        s.push_str(&format!("{body}#הערה(ערוץ: \"ג\") [הערה מספר {i} בת ארבע מילים בערך.] "));
    }
    s.push_str("\n#הצג_אזור(\"ג\")\n");
    s
}

fn timed(name: &str, body: &str) {
    let t = Instant::now();
    let out = compile_doc(body, &DocConfig::default());
    let pages = out.as_ref().map(|d| d.pages().len()).unwrap_or(0);
    println!(
        "{name:24} {:>8.0}ms  pages={pages}",
        t.elapsed().as_secs_f64() * 1000.0
    );
}

fn main() {
    println!("single 2 MB word (audit: ~10 s):");
    timed("  one-word 2 MB", &one_word(2));
    println!("collected endnotes (audit: 240 in 225 ms):");
    for n in [120usize, 240] {
        timed(&format!("  {n} endnotes"), &endnotes(n));
    }
}

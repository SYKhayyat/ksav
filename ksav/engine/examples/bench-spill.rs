//! What the cut costs, on the documents that do not use it.
//!
//! The question this answers is not *how fast is the spill* — a note that
//! outgrows its region is rare and a reader would forgive it a millisecond. It is
//! **what does the machinery cost a sefer that never spills**, because that is
//! every sefer, and the number this application is built around is 59ms after a
//! one-character edit.
//!
//! The answer should be nothing at all, and the shape of the code is why:
//!
//!   * `_ap_group` does no cutting unless `חלון > 0pt`, and the walk sets that
//!     only for a group with a note that actually spans pages;
//!   * a note that does span is measured once against the slot before anything
//!     is split, so an entry that fits is one `measure` and out;
//!   * `_ct_text` is tried before `_ct_split`, so a body of plain words is cut as
//!     a string exactly as it was, and the atom walk never runs.
//!
//! Three documents, cold and warm, so the claim is checkable rather than
//! reasoned: one that never spills, one that spills and is cut, one that spills
//! and falls back to the window.
//!
//! Run: `cargo run --release --example bench-spill`

use ksav_engine::{compile_doc, probe, DocConfig};
use std::time::Instant;

fn words(tag: &str, n: usize) -> String {
    (1..=n)
        .map(|i| format!("{tag}{i:03}"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// A sefer with an apparatus that comfortably holds its notes.
fn ordinary(tweak: &str) -> String {
    let mut s =
        String::from("#מסמך(אזור_הערות: 3.5cm)[\n#אזור(\"צר\", מיקום: \"רגל\", גובה: 2.5cm)\n");
    for k in 1..=40 {
        s.push_str(&format!(
            "{}א#הערה(אזור: \"צר\")[{}] סוף.\n\n",
            words(&format!("ג{k}_"), 40),
            words(&format!("ה{k}_"), 6)
        ));
    }
    s.push_str(&format!("{tweak}\n]\n"));
    s
}

/// The same sefer with one note far too tall for the region.
fn spilling(tweak: &str, marked: bool, boxed: bool) -> String {
    let mut s = String::from(
        "#מסמך(אזור_הערות: 3.5cm)[\n\
         #אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: (\"עמוד_הבא\",))\n",
    );
    for k in 1..=40 {
        let note = if k == 5 {
            let long = words("ארוך", 120);
            if boxed {
                format!("{long} #box(width: 4em, height: 0.7em, fill: luma(200))")
            } else if marked {
                format!("*{}* {long}", "מודגש")
            } else {
                long
            }
        } else {
            words(&format!("ה{k}_"), 6)
        };
        s.push_str(&format!(
            "{}א#הערה(אזור: \"צר\")[{note}] סוף.\n\n",
            words(&format!("ג{k}_"), 40)
        ));
    }
    s.push_str(&format!("{tweak}\n]\n"));
    s
}

fn time(make: &dyn Fn(&str) -> String, name: &str) {
    let cfg = DocConfig::default();
    let a = make("x");
    let b = make("y");
    let t0 = Instant::now();
    let first = compile_doc(&a, &cfg);
    let cold = t0.elapsed();
    let pages = match &first {
        Ok(d) => probe::page_sizes(d).len(),
        Err(e) => panic!("{name} did not compile: {e:?}"),
    };
    // The number a writer feels: the same document again with one character
    // changed at the end, which is what typing is.
    let t1 = Instant::now();
    let second = compile_doc(&b, &cfg);
    let warm = t1.elapsed();
    assert!(second.is_ok(), "{name} did not recompile");
    println!(
        "{name:<22} {pages:>4} pages   cold {:>8.1}ms   warm {:>8.1}ms",
        cold.as_secs_f64() * 1000.0,
        warm.as_secs_f64() * 1000.0
    );
}

fn main() {
    println!(
        "{:<22} {:>4}          {:>13}   {:>13}",
        "", "", "cold", "warm"
    );
    time(&ordinary, "no spill at all");
    time(&|t| spilling(t, false, false), "cut, plain words");
    time(&|t| spilling(t, true, false), "cut, with markup");
    time(&|t| spilling(t, false, true), "windowed (a box)");
    println!();
    println!("The number to judge against is 59ms warm on a 234-page sefer.");
    println!("`no spill at all` is the one that matters: it is every sefer.");
}

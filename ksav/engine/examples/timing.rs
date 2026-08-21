//! Where a compile actually spends its time, from Typst's own instrumentation.
//!
//! # Why this exists
//!
//! A collected apparatus — notes gathered into one block rather than sitting at
//! the foot of each page — costs time superlinear in the text collected into it:
//! 30, 60 and 120 notes of 24 words cost 1.4s, 5.6s and 31s on a release build,
//! and the same 120 notes with one-word bodies cost 2.2s.
//!
//! **Five hypotheses were formed from reading and from bisecting documents, and
//! every one of them was refuted by measurement:**
//!
//! 1. the per-entry `_ap_origin` state bracket — removing it makes it *slower*,
//!    12.3s against 5.6s, so the guess was backwards rather than merely wrong;
//! 2. the synthetic oblique, which boxes every word — forcing an upright style
//!    changes nothing;
//! 3. `_nr_numbers` asking `_nr_origin` per entry — a real O(n·m), fixed, and
//!    these documents never reach it because they restart no numbering;
//! 4. the apparatus being re-laid once per page of the **document** — the same
//!    thirty notes in a twelve-page and a thirty-page sefer cost the same;
//! 5. the apparatus being re-laid once per page **it** spans — shrinking its
//!    type so it spans fewer pages made it *slower*, 51s against 31s.
//!
//! Elimination has been taken as far as it goes. Typst records its own spans and
//! the engine already links `typst-timing`; this turns them on and writes a
//! Chrome trace, which answers the question by reading instead of by guessing.
//!
//! ```sh
//! cargo run --release --example timing -- doc.ksav trace.json
//! # then open trace.json at https://ui.perfetto.dev, or:
//! cargo run --release --example timing -- doc.ksav trace.json --summary
//! ```
//!
//! `--summary` prints the total time under each span name, which is usually the
//! whole answer and needs no viewer.

use ksav_engine::{compile_doc, DocConfig};
use std::collections::BTreeMap;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = args
        .get(1)
        .expect("usage: timing <doc.ksav> [trace.json] [--summary]");
    let out = args
        .get(2)
        .filter(|s| !s.starts_with("--"))
        .cloned()
        .unwrap_or_else(|| "trace.json".into());
    let summary = args.iter().any(|a| a == "--summary");

    let body = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("read {path}: {e}"));

    typst_timing::enable();
    let t0 = std::time::Instant::now();
    let doc = compile_doc(&body, &DocConfig::default());
    let elapsed = t0.elapsed();
    assert!(doc.is_ok(), "{path} did not compile: {:?}", doc.err());
    println!("compiled in {:.1}ms", elapsed.as_secs_f64() * 1000.0);

    // Resolved to a line of the prelude by `ksav_engine::span_line`, because the
    // span *name* alone says "a function was called" and the question is which.
    let mut buf = Vec::new();
    typst_timing::export_json(&mut buf, ksav_engine::span_line)
        .expect("the trace could not be written");
    std::fs::write(&out, &buf).unwrap_or_else(|e| panic!("write {out}: {e}"));
    println!("trace: {out} ({} KB)", buf.len() / 1024);

    if !summary {
        return;
    }

    // A Chrome trace is a flat list of begin/end events with microsecond
    // timestamps. Total time per name is one pass with a stack per thread, and
    // it is the number that answers "what is this compile doing".
    let events: serde_json::Value = serde_json::from_slice(&buf).expect("the trace is not JSON");
    let arr = events.as_array().expect("the trace is not an array");
    let mut stacks: BTreeMap<u64, Vec<(String, f64)>> = BTreeMap::new();
    let mut total: BTreeMap<String, (f64, u64)> = BTreeMap::new();
    for e in arr {
        let ph = e["ph"].as_str().unwrap_or("");
        let tid = e["tid"].as_u64().unwrap_or(0);
        let ts = e["ts"].as_f64().unwrap_or(0.0);
        let stack = stacks.entry(tid).or_default();
        if ph == "B" {
            // Keyed by name *and* line: "func call" is every call in the
            // prelude, and the line is the only thing that separates them.
            let name = e["name"].as_str().unwrap_or("?");
            let line = e["args"]["line"].as_u64().unwrap_or(0);
            let key = if line > 0 {
                format!("{name} @ksav.typ:{line}")
            } else {
                name.to_string()
            };
            stack.push((key, ts));
        } else if ph == "E" {
            if let Some((name, start)) = stack.pop() {
                let slot = total.entry(name).or_insert((0.0, 0));
                slot.0 += ts - start;
                slot.1 += 1;
            }
        }
    }
    let mut rows: Vec<(&String, &(f64, u64))> = total.iter().collect();
    rows.sort_by(|a, b| b.1 .0.partial_cmp(&a.1 .0).unwrap());
    println!();
    println!(
        "{:<34} {:>12} {:>10}",
        "span (inclusive)", "total ms", "calls"
    );
    for (name, (us, n)) in rows.iter().take(25) {
        println!("{name:<34} {:>12.1} {n:>10}", us / 1000.0);
    }
}

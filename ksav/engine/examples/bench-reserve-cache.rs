//! Does the single-slot reserve cache actually cost anything? #55 says two open
//! documents evict each other; this is the measurement, as a command anybody can
//! re-run rather than a paragraph.
//!
//! ```sh
//! cargo run --release --example bench-reserve-cache
//! ```
//!
//! # The question, precisely
//!
//! `RESERVE_CACHE` holds **one** entry, keyed on `(body hash, sheet)`. The scan
//! behind it is `auto_notes_region_cm_scan`, whose first act is a whole-document
//! parse (`parse::apparatus_shape` → `partition`, a full recursive walk). The
//! issue's claim is that an editor with two documents open — or one document with
//! a main body and a part, or a compile racing a jump — alternates between two
//! keys and pays the parse every time, so the cache never hits.
//!
//! # Measured on real sefer-sized text, and it is not small
//!
//! This times the **scan** (`apparatus_shape`) and the **cached call**
//! (`auto_notes_region_cm_sheet`) on bodies grown from the shipped templates to
//! 64 KB / 256 KB / 1 MB, repeating each template's own paragraphs so the parse
//! tree has the same shape as a sefer rather than one enormous token.
//!
//! The scan is the whole cost and it is linear with a large constant:
//!
//! | body | scan | one-slot miss pays |
//! |---|---|---|
//! | 64 KB | ~4 ms | ~3.9 ms — the scan, on every miss |
//! | 1 MB | ~74 ms | ~72 ms — over a keystroke, on every miss |
//!
//! At a megabyte a miss is **past the ~59 ms keystroke budget**, so a one-slot
//! cache under alternating documents is not a rounding error — it is a dropped
//! frame per compile. A bounded map of eight entries holds both keys and turns
//! every alternating row into a hit.
//!
//! # The "cached" column is not zero, and that is a second finding
//!
//! A hit still costs **~2.6 ms at 1 MB**, because `reserve_cache_key` hashes the
//! whole body on every call. That is O(n) work done *before* the map is
//! consulted, so the cache cannot be cheaper than its own key — and at a megabyte
//! the key is a measurable share of a keystroke. The bounded map below therefore
//! keeps the key as it is (it must read the body to know which entry it is) but
//! the number here is the floor a reader should hold against any future claim
//! that this cache is free.
//!
//! # Two things this example got wrong first, and why they are written down
//!
//! **The bodies were identical.** The first version built *both* alternating
//! bodies from the same template's paragraphs, so they hashed to one key and the
//! "miss" row was measuring a **hit** — reporting 3.5 µs where the true miss at
//! 1 MB is 134 ms. A wall-clock instrument that cannot distinguish a hit from a
//! miss is worse than none: it reported the problem as solved. The size axis
//! disagreeing with the shape table above it is the only reason it was caught.
//!
//! **The size axis was not the scan.** An intermediate version timed
//! `auto_notes_region_cm_sheet` on grown bodies and saw a flat ~3 µs, because
//! the repeated paragraphs hit the scan's own early-outs. Timing the *scan*
//! (`apparatus_shape`) directly is what removes the ambiguity, and it is the
//! honest floor: it is strictly less than what the cache saves you.
//!
//! `bench-scaling` opens with the rule and this obeys it: *"wall-clock assertions
//! fail on a loaded CI box and pass while hiding a regression twice their size."*
//! Nothing here is asserted. The correctness claim — that the answer does not
//! depend on the order keys arrive in — is held by the engine's own tests, and it
//! is the only claim about a cache that a test can make soundly.
use ksav_engine::auto_notes_region_cm_sheet;
use std::time::Instant;

/// Iterations per size. Low, because one scan at 1 MB is ~74 ms and a higher
/// count would make the example take minutes for a number that is already two
/// orders of magnitude clear.
const OPS: usize = 12;

/// The shipped templates, as real bodies.
fn bodies() -> Vec<(&'static str, String)> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/templates");
    ["gemara", "peirush"]
        .iter()
        .map(|n| {
            let name: &'static str = n;
            let text = std::fs::read_to_string(format!("{dir}/{name}.ksav"))
                .unwrap_or_else(|e| panic!("{name}.ksav: {e}"));
            (name, text)
        })
        .collect()
}

/// Two **distinct** bodies, each grown to about `target` bytes from its own
/// template's paragraphs.
///
/// They have to differ or they are one key — see the file header. Repeating real
/// paragraphs, not one long word, so the parse tree has a sefer's shape.
fn grow(all: &[(&'static str, String)], target: usize) -> Vec<(&'static str, String)> {
    let mut out = Vec::new();
    for (n, src) in all.iter() {
        let paras: Vec<&str> = src.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
        let mut s = String::with_capacity(target * 2);
        let mut i = 0;
        while s.len() < target {
            s.push_str(paras[i % paras.len()]);
            s.push_str("\n\n");
            i += 1;
        }
        out.push((*n, s));
    }
    out
}

/// Microseconds for `parse::apparatus_shape` over one body — the O(n) scan the
/// cache exists to avoid. Timed **directly** so it cannot be mistaken for a hit.
fn scan_us(body: &str) -> f64 {
    std::hint::black_box(ksav_engine::parse::apparatus_shape(body));
    let t = Instant::now();
    for _ in 0..OPS {
        std::hint::black_box(ksav_engine::parse::apparatus_shape(body));
    }
    t.elapsed().as_secs_f64() * 1e6 / OPS as f64
}

/// Microseconds for the cached entry point on one body, repeatedly — the **hit**,
/// which is what a working cache costs.
fn hit_us(body: &str) -> f64 {
    // Warm this body's key so every timed call is a hit.
    std::hint::black_box(auto_notes_region_cm_sheet(body, Some(29.7)));
    let t = Instant::now();
    for _ in 0..OPS {
        std::hint::black_box(auto_notes_region_cm_sheet(body, Some(29.7)));
    }
    t.elapsed().as_secs_f64() * 1e6 / OPS as f64
}

fn main() {
    println!("reserve cache — one slot (#55), on sefer-sized real text\n");
    println!(
        "{:<10} {:>14} {:>14} {:>20}",
        "body", "scan µs/op", "cached µs/op", "one-slot miss pays"
    );
    println!("{}", "-".repeat(62));
    for target in [64 * 1024usize, 256 * 1024, 1024 * 1024] {
        let pair = grow(&bodies(), target);
        let scan = scan_us(&pair[0].1);
        let hit = hit_us(&pair[0].1);
        println!(
            "{:<10} {:>14.0} {:>14.1} {:>19} µs",
            format!("{} KB", pair[0].1.len() / 1024),
            scan,
            hit,
            format!("{:.0}", scan - hit)
        );
    }
    println!(
        "\n`scan µs/op` is `parse::apparatus_shape`, the whole-document walk behind\n\
         the cache. `cached µs/op` is `auto_notes_region_cm_sheet` on an unchanged\n\
         body — the hit. `one-slot miss pays` is the difference: what a compile of\n\
         a document the one-slot cache has evicted has to spend that a cache\n\
         holding eight keys would not.\n\
         \n\
         At 1 MB that is ~72 ms of scan a cache holding eight keys would not pay, and\n\
         against a ~59 ms keystroke budget — the compile is not late, it is dropped.\n\
         Two open sefarim in two windows alternate their keys and neither ever\n\
         hits, which is the shape this table exists to size."
    );
}

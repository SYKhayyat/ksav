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
        s.push_str(&format!(
            "{body}#הערה(ערוץ: \"ג\")[הערה מספר {i} בת ארבע מילים בערך.] "
        ));
    }
    s.push_str("\n#הצג_אזור(\"ג\")\n");
    s
}

/// Many pages, each carrying notes into a fixed foot band: the footer
/// machinery's own scaling shape — the assignment walk runs per page, per
/// footer evaluation, so the question is whether its cost grows quadratically
/// in the page count at sizes a real sefer reaches. Beside it, the same
/// pagination with no apparatus, so the base layout cost can be subtracted
/// rather than guessed.
fn paged_notes(pages: usize, per_page: usize, with_notes: bool) -> String {
    let mut s = String::from("#אזור(\"ב\", מיקום: \"רגל\", גובה: שורות(4))\n");
    for p in 1..=pages {
        for i in 1..=per_page {
            if with_notes {
                s.push_str(&format!(
                    "פסק {p}־{i} קצר לפני הערתו#הערה(אזור: \"ב\")[הערה {p}/{i} בת ארבע מילים בערך.] "
                ));
            } else {
                s.push_str(&format!("פסק {p}־{i} קצר בלי הערה כלל. "));
            }
        }
        s.push_str("\n#מעבר_עמוד\n");
    }
    s
}

fn timed(name: &str, body: &str) {
    let t = Instant::now();
    let out = compile_doc(body, &DocConfig::default());
    let ms = t.elapsed().as_secs_f64() * 1000.0;
    match out {
        Ok(doc) => println!("{name:24} {ms:>8.0}ms  pages={}", doc.pages().len()),
        Err(diags) => {
            let first = diags
                .first()
                .map(|d| d.message.split('·').next().unwrap_or("").trim().to_string())
                .unwrap_or_default();
            println!("{name:24} {ms:>8.0}ms  REFUSED: {first}");
        }
    }
}

fn main() {
    println!("single 2 MB word (audit: ~10 s):");
    timed("  one-word 2 MB", &one_word(2));
    println!("collected endnotes (audit: 240 in 225 ms):");
    for n in [120usize, 240] {
        timed(&format!("  {n} endnotes"), &endnotes(n));
    }
    println!("foot-band notes on every page (the E4/E5 shape):");
    for pages in [10usize, 20, 40] {
        timed(
            &format!("  {pages}p x 4 notes"),
            &paged_notes(pages, 4, true),
        );
        timed(&format!("  {pages}p bare"), &paged_notes(pages, 4, false));
    }
}

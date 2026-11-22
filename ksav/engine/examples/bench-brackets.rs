// What plain brackets cost to lay out, measured rather than remembered (#213).
//
//   cargo run --release --example bench-brackets
//
// The issue's own table was taken before #218 split the compile and before
// `pagesvg` learned to write pages on every core, so the numbers a ceiling is
// chosen from have to be taken again on the code that ships. Two shapes, because
// they were two different findings in the issue and they are two different
// questions here:
//
//   * **stray `]`** — closers that open nothing. Typst's markup parser appears to
//     rescan forward for a matching opener per closer, so the cost is quadratic
//     and each one is also a diagnostic.
//   * **plain `[...]` pairs** — balanced, so a balance check says nothing about
//     them, and the cost is quadratic all the same.
//
// The last row is the one the ceiling is *not* allowed to refuse: a real
// document's own brackets.
use ksav_engine::{probe, DocConfig};
use std::time::Instant;

fn stray(n: usize) -> String {
    let mut s = String::with_capacity(n + 8);
    for _ in 0..n {
        s.push(']');
    }
    s
}

fn pairs(n: usize) -> String {
    let mut s = String::with_capacity(2 * n + 8);
    for _ in 0..n {
        s.push('[');
    }
    s.push('x');
    for _ in 0..n {
        s.push(']');
    }
    s
}

fn time(label: &str, body: &str) -> f64 {
    let started = Instant::now();
    let outcome = probe::layout(body, &DocConfig::default());
    let ms = started.elapsed().as_secs_f64() * 1000.0;
    let verdict = match &outcome {
        Ok(doc) => format!("{} pages", doc.pages().len()),
        Err(diags) => format!("{} diagnostics", diags.len()),
    };
    println!(
        "{label:<28} {:>8.1} KB  {ms:>9.1} ms  {verdict}",
        body.len() as f64 / 1024.0
    );
    ms
}

/// A body of `n` chapters with the syntax a sefer carries: a `#כותרת`, prose with
/// `#הדגשה[…]`, notes, and a numbered list — and not one unpaired bracket.
fn realistic(n: usize) -> String {
    let mut s = String::new();
    for c in 0..n {
        s.push_str(&format!("#כותרת1[פרק {}]\n\n", c + 1));
        for p in 0..40 {
            s.push_str(&format!(
                "ויאמר רבי שמעון בן יוחאי, כל אותן {} שנים שהיה יושב במערה, \
                 היה מתעסק בדברי תורה ובסודות העליונים, ולמד {}\n",
                p + 1,
                "#הדגשה[סוד]"
            ));
            s.push_str(&format!(
                "וכן אמרו במסכת {} עמוד {}, וזהו שאמר הכתוב {}, {}\n\n",
                if p % 2 == 0 { "ברכות" } else { "שבת" },
                p + 2,
                "#קישור_פנימי(\"מבוא\")",
                "#הערה[ביאור: עיין לעיל.]"
            ));
        }
        s.push_str("- ראשון\n- שני\n- שלישי\n\n## כתוביתה\n\n");
    }
    s
}

fn main() {
    println!("stray closers (a `]` that opens nothing):");
    let mut prev: Option<(usize, f64)> = None;
    for n in [5_000, 10_000, 20_000, 40_000] {
        let ms = time(&format!("{n} stray ]"), &stray(n));
        if let Some((pn, pms)) = prev {
            println!(
                "{:<28} {:>9.2}x work for 2x input",
                "",
                if pms > 0.0 { ms / pms } else { 0.0 }
            );
            let _ = pn;
        }
        prev = Some((n, ms));
    }

    println!("\nplain pairs (balanced, so no balance check sees them):");
    let mut prev: Option<f64> = None;
    for n in [5_000, 10_000, 20_000, 40_000] {
        let ms = time(&format!("{n} pairs"), &pairs(n));
        if let Some(pms) = prev {
            println!(
                "{:<28} {:>9.2}x work for 2x input",
                "",
                if pms > 0.0 { ms / pms } else { 0.0 }
            );
        }
        prev = Some(ms);
    }

    // A large real document, as the ceiling's counterweight: forty chapters of
    // Hebrew prose carrying the syntax a writer actually uses (headings, notes,
    // bold, a table), and no plain brackets at all.
    println!("\nfor scale:");
    let sefer = realistic(40);
    time(&format!("a {}-chapter sefer", 40), &sefer);
    let brackets = sefer.matches(['[', ']']).count();
    println!(
        "  it carries {brackets} bracket characters in {} KB",
        sefer.len() as f64 / 1024.0
    );
}

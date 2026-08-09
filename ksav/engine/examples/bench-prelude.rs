//! What the prelude cost per keystroke, and what it costs now.
//!
//! Until the prelude became a resolved file, every compile handed Typst one
//! string: the 34 KB sefer catalogue, then 2,324 lines of `ksav.typ`, then the
//! `#show` wrapper, then the writer's text. Around 111 KB of which all but the
//! last part was byte-identical to the previous keystroke's — and it was
//! *parsed* every time, then parsed a **second** time by `Located` whenever the
//! document produced so much as a warning, then `format!`ed a **third** time by
//! `body_offset` to learn one integer.
//!
//! The before and after are both still here and both still called, which is what
//! makes this an honest measurement rather than a memory of one:
//!
//!   - `assemble_source` is the old arrangement. It has a live caller — "export
//!     .typ" needs one self-contained file — so it is the real thing, not a
//!     reconstruction.
//!   - `main_source` is what a compile is handed now: two lines and the body.
//!
//! Run it:
//!
//!     cargo run --release --example bench-prelude
//!
//! Reported: the string each arrangement builds, the parse of that string, and
//! the end-to-end preview compile the writer actually waits for.
//!
//! **Only the parse column is a before-and-after.** The end-to-end figure is the
//! *after* alone — the old arrangement's compile cannot be measured without
//! putting it back, and it was more than its parse anyway: a main source whose
//! text changed on every keystroke gave comemo a new file to evaluate every
//! time, so all 361 of the prelude's bindings were re-evaluated too. The prelude
//! is a file with a stable id now, so that memoises across keystrokes as well.
//! Numbers on this machine, 2026-08-08:
//!
//! ```text
//!   sections   old bytes   new bytes     old parse     new parse     saved
//!          1      137358        1312        3.70ms        0.03ms     99.1%
//!         10      140887        4841        4.00ms        0.11ms     97.2%
//!         40      152677       16631        4.35ms        0.43ms     90.1%
//! ```

use std::time::Instant;

use ksav_engine::{assemble_source, main_source, DocConfig};

/// A kuntres-shaped document of roughly `sections` simanim, with an apparatus.
///
/// The same shape `bench-export.rs` uses, so the two benchmarks' numbers are
/// about the same documents.
fn document(sections: usize) -> String {
    let mut out = String::from("#שער[קונטרס לדוגמא]\n\n#תוכן()\n\n");
    for i in 1..=sections {
        out.push_str(&format!(
            "#כותרת1[פרק {i}]\n\n\
             הנה מבואר בדברי הראשונים#הערה[עיין שם היטב] שיש בזה שני דרכים, \
             ולפי מה שכתב הרמב\"ם#הערה[הלכות שבת פרק א] נראה כדרך הראשונה.\n\n\
             #ציטוט[ודברי רש\"י כאן צריכים עיון]\n\n\
             #רשימה(\n  פריט[הדרך הראשונה],\n  פריט[הדרך השניה],\n)\n\n"
        ));
    }
    out.push_str("#הערות_בסוף()\n");
    out
}

/// Median of `runs` timings, in milliseconds. Median rather than mean: one
/// scheduler hiccup should not become the headline.
fn median_ms(runs: usize, mut f: impl FnMut()) -> f64 {
    let mut times: Vec<f64> = (0..runs)
        .map(|_| {
            let t = Instant::now();
            f();
            t.elapsed().as_secs_f64() * 1000.0
        })
        .collect();
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    times[times.len() / 2]
}

fn main() {
    let cfg = DocConfig::default();

    // ---------------------------------------------------------- the string
    println!("What the compiler is handed, per keystroke:\n");
    println!(
        "{:>10}  {:>10}  {:>10}  {:>12}  {:>12}  {:>8}",
        "sections", "old bytes", "new bytes", "old parse", "new parse", "saved"
    );
    for sections in [1, 10, 40] {
        let body = document(sections);
        let old = assemble_source(&body, &cfg);
        let new = main_source(&body, &cfg);

        let parse = |text: &str| {
            let text = text.to_string();
            median_ms(21, || {
                std::hint::black_box(typst::syntax::Source::detached(text.clone()));
            })
        };
        let old_ms = parse(&old);
        let new_ms = parse(&new);

        println!(
            "{:>10}  {:>10}  {:>10}  {:>10.2}ms  {:>10.2}ms  {:>7.1}%",
            sections,
            old.len(),
            new.len(),
            old_ms,
            new_ms,
            100.0 * (1.0 - new_ms / old_ms.max(f64::MIN_POSITIVE)),
        );
    }

    // The prelude's own parse, which is what used to be inside every one of the
    // numbers above and is now paid once for the life of the process.
    let prelude = assemble_source("", &cfg);
    let once = median_ms(11, || {
        std::hint::black_box(typst::syntax::Source::detached(prelude.clone()));
    });
    println!(
        "\n{} bytes of prelude, parsed once per process instead of once per keystroke: {once:.2}ms\n",
        prelude.len(),
    );

    // ------------------------------------------------------- the whole compile
    //
    // **The body changes on every run**, which is the only way to measure a
    // keystroke. Compiling the same string five times measures comemo's memo
    // table — it came out at 2.2 ms for a forty-section sefer, which is not a
    // number about typesetting.
    println!("End to end, the preview path the writer waits for:\n");
    println!("{:>10}  {:>12}", "sections", "per keystroke");
    for sections in [1, 10, 40] {
        let base = document(sections);
        let mut typed = 0usize;
        // One first, so the measurement is not of a cold font cache.
        let _ =
            ksav_engine::compile_request(&serde_json::json!({ "body": base.clone() }).to_string());
        let ms = median_ms(5, || {
            typed += 1;
            let body = format!("{base}\n{}", "א".repeat(typed));
            let request = serde_json::json!({ "body": body }).to_string();
            std::hint::black_box(ksav_engine::compile_request(&request));
        });
        println!("{sections:>10}  {ms:>10.1}ms");
    }
}

//! What "export .typ" costs, before and after.
//!
//! The `.typ` a writer exports **is** the string a compile is handed. Export
//! reached it by asking `/compile` for a full render with the PDF and reading
//! one field off the response — so the writer waited for the layout of their
//! whole sefer, plus a base64 PDF nobody opened, to obtain a `format!` the
//! engine does before Typst is invoked at all.
//!
//! `assemble` is that `format!`. This measures the two head to head, in one
//! process, at three document sizes, so the claim in the §5 fix has a number
//! under it that anybody can re-run:
//!
//!     cargo run --release --example bench-export

use std::time::Instant;

/// A kuntres-shaped document of roughly `sections` simanim, with an apparatus.
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

fn main() {
    println!(
        "{:>10}  {:>12}  {:>12}  {:>8}",
        "sections", "compile", "assemble", "ratio"
    );
    for sections in [1, 10, 40] {
        let body = document(sections);
        let request =
            serde_json::json!({ "body": body, "want_pdf": true, "want_source": true }).to_string();
        let quick_request = serde_json::json!({ "body": body }).to_string();

        // One of each first, so neither pays for a cold font cache or a cold
        // `OnceLock` that the other would then be measured against.
        let _ = ksav_engine::compile_request(&request);
        let _ = ksav_engine::assemble_request(&quick_request);

        let t = Instant::now();
        let slow = ksav_engine::compile_request(&request);
        let compile_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Enough repetitions that the timer has something to measure.
        let reps = 200;
        let t = Instant::now();
        let mut quick = String::new();
        for _ in 0..reps {
            quick = ksav_engine::assemble_request(&quick_request);
        }
        let assemble_ms = t.elapsed().as_secs_f64() * 1000.0 / reps as f64;

        // The point of the whole exercise: same bytes.
        let a: serde_json::Value = serde_json::from_str(&quick).unwrap();
        let b: serde_json::Value = serde_json::from_str(&slow).unwrap();
        assert_eq!(
            a["typst_source"], b["typst_source"],
            "the two routes must produce the same file"
        );

        println!(
            "{sections:>10}  {compile_ms:>9.1} ms  {assemble_ms:>9.3} ms  {:>7.0}×",
            compile_ms / assemble_ms
        );
    }
}

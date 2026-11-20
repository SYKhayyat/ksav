//! What one compiled page costs, and how that cost moves with the document.
//!
//! ```sh
//! cargo run --release --example bench-compile-curve
//! ```
//!
//! # The finding this answers
//!
//! `ksav serve` compiled a 634 KB body (258 pages) in **3.4 s warm** and a 188 KB
//! one (77 pages) in 634 ms: 3.4× the bytes for 5.3× the time. The editor's whole
//! promise is that the page follows the typing, and at the size a sefer actually
//! is, it follows three seconds behind. Nothing in the tree measured that curve,
//! so it could only get worse silently (#218).
//!
//! # What it prints
//!
//! ms per page at three real sizes, cold and warm, and the ratio between the
//! largest and the smallest — which is the number that matters. A machine that is
//! twice as slow doubles every row; only the ratio says whether layout cost grows
//! faster than the document. `tests/compile_curve.rs` asserts that ratio; this
//! example prints the absolute numbers a human wants to read next to it.
//!
//! Not a test on purpose, for the reason `bench-scaling.rs` gives: an absolute
//! wall-clock assertion fails on a loaded CI box and passes while hiding a
//! regression twice its size. The ratio is machine-independent, so the fence can
//! hold it and this file can report beside it.
use ksav_engine::assets::Assets;
use ksav_engine::{compile_doc, compile_parts, probe, DocConfig, Wants};
use std::collections::HashSet;
use std::time::Instant;

/// One page of ordinary prose — the audit's body: no notes, no tables, no
/// figures, so the measurement stays about layout and pagination.
///
/// Ends with an explicit break, so `pages` is the number asked for rather than
/// whatever the line-breaking happens to produce. A curve measured against an
/// unpredictable page count is a curve about the fixture.
pub fn prose_page(page: usize) -> String {
    let mut s = String::new();
    for line in 0..9 {
        s.push_str(&format!(
            "דברי הפוסקים בענין זה ארוכים ומבוארים, ועיין בשו\"ע סימן {page} סעיף {line} \
ובמה שכתבו האחרונים שם, ולענין הלכה יש לדון בכל פרט ופרט היאך הוא, וצריך עיון. "
        ));
        s.push('\n');
    }
    s.push_str("#מעבר_עמוד\n");
    s
}

/// A body of roughly `pages` pages.
pub fn body(pages: usize) -> String {
    let mut s = String::new();
    for p in 0..pages {
        s.push_str(&prose_page(p));
    }
    s
}

/// Median of `runs` warm runs of `f`, in milliseconds.
fn warm_ms(mut f: impl FnMut(), runs: usize) -> f64 {
    f(); // the first pass pays for the prelude and the fonts
    let mut times: Vec<f64> = Vec::new();
    for _ in 0..runs {
        let t0 = Instant::now();
        f();
        times.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    times[times.len() / 2]
}

fn main() {
    let cfg = DocConfig::default();
    let assets = Assets::default();
    let none: HashSet<String> = HashSet::new();
    let cores = ksav_engine::pagesvg::threads_for(10_000);

    let cold_body = body(60);
    let t0 = Instant::now();
    let cold = compile_doc(&cold_body, &cfg).expect("compiled");
    println!(
        "cold, first compile in the process: {:.0} ms, {} pages",
        t0.elapsed().as_secs_f64() * 1000.0,
        probe::page_sizes(&cold).len()
    );
    println!("page serialiser: {cores} thread(s) available");

    // The serialiser in both shapes. Page writing is a pure function of the page,
    // so the two answers are the same bytes and the difference is only time —
    // `tests/pagesvg.rs` is what holds that, and this is the number beside it.
    let set_threads = |n: &str| std::env::set_var("KSAV_SVG_THREADS", n);

    println!();
    println!("  pages   bytes    layout    serial  parallel    held   export   ms/page");
    let mut first = f64::NAN;
    for pages in [60usize, 160, 260] {
        let body = body(pages);
        let laid = probe::page_sizes(&compile_doc(&body, &cfg).expect("compiled")).len();

        let layout = warm_ms(
            || {
                compile_doc(&body, &cfg).expect("compiled");
            },
            3,
        );

        set_threads("1");
        let one = warm_ms(
            || {
                compile_parts(&body, &cfg, &assets, Wants::default(), &none);
            },
            2,
        );
        set_threads("16");
        let many = warm_ms(
            || {
                compile_parts(&body, &cfg, &assets, Wants::default(), &none);
            },
            2,
        );

        // What typing actually costs when the pages the client holds are handed
        // back: only the pages whose fingerprint changed are written.
        let held: HashSet<String> = compile_parts(&body, &cfg, &assets, Wants::default(), &none)
            .pages_hash
            .into_iter()
            .collect();
        let typing = warm_ms(
            || {
                compile_parts(&body, &cfg, &assets, Wants::default(), &held);
            },
            2,
        );
        let export = warm_ms(
            || {
                compile_parts(&body, &cfg, &assets, Wants::export(), &none);
            },
            2,
        );

        let per = layout / laid as f64;
        if first.is_nan() {
            first = per;
        }
        println!(
            "  {:5}   {:7}   {:6.0}   {:7.0}   {:7.0}   {:6.0}   {:6.0}     {:.2}",
            pages,
            body.len(),
            layout,
            one,
            many,
            typing,
            export,
            per / first
        );
    }
    std::env::remove_var("KSAV_SVG_THREADS");
    println!();
    println!(
        "Four readings, four questions:\n\
         - **ms/page**: is the layout cost per page flat? It is, near 1.0 across a 4.3x\n\
           document, so the 3.4 s in #218 was never a pagination curve.\n\
         - **serial** against **parallel**: how much of a compile was one thread writing\n\
           pages alone. On a loaded box this understates it; the ratio is the point.\n\
         - **held** against **layout**: the cheapest a keystroke can be — the caller\n\
           hands back the fingerprints of the pages it still holds and only the pages\n\
           that moved are written."
    );
}

//! #77 — **streams**: n independent flows, each resuming in the same band on
//! the next sheet.
//!
//!     cargo run --example streams -- file.ksav [outdir] [n_streams]
//!
//! # Why this exists, since everything here is a consequence of one measurement
//!
//! `#grid(rows: 2)` and `#cols(n)` were rendered and looked at, and **both are
//! one flow filling regions in order**: page 1 is entirely the first cell, the
//! second cell starts at the bottom of page 2, and the "rows" divide a single
//! stream rather than creating two. Typst 0.15 has no `Flow` element, so there
//! is no syntax that asks for the real thing.
//!
//! # The construction
//!
//! **Each stream is laid out as its own document whose page _is the band_**, and
//! the per-stream pages are then zipped onto sheets by index.
//!
//! That is the whole trick, and it is worth being precise about why: the
//! requirement is that a flow "continues into the same position on the next
//! page", and **no page-breaking algorithm has to achieve it**. Stream A laid
//! out alone produces A/1, A/2, A/3 as ordinary pages; zipping puts A/2 in A's
//! band on sheet 2. Nothing is threaded, so nothing can mis-thread.
//!
//! # The cost, stated before it is measured
//!
//! **N streams is N layouts of the same source.** The editor is 59ms from a
//! keystroke and this multiplies the layout work on any document that uses it.
//! That is a constraint on the design rather than a detail of it, so the probe
//! prints the time it took rather than leaving it to be discovered later.

use ksav_engine::{probe, DocConfig};
use std::time::Instant;

/// Split the writer's text into streams on a marker line.
///
/// `%% stream NAME` on a line of its own. Deliberately the crudest possible
/// syntax: the question this probe answers is whether the *architecture* works,
/// and a nicer syntax would be designing the feature before finding out it can
/// be built.
fn split_streams(body: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for line in body.lines() {
        let t = line.trim();
        if let Some(name) = t.strip_prefix("%% stream") {
            out.push((name.trim().to_string(), String::new()));
        } else if let Some(last) = out.last_mut() {
            last.1.push_str(line);
            last.1.push('\n');
        }
    }
    out
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let path = a.first().expect("usage: streams <file> [outdir] [n]");
    let outdir = a.get(1).cloned().unwrap_or_else(|| ".".into());
    let body = std::fs::read_to_string(path).expect("read the document");

    let streams = split_streams(&body);
    if streams.is_empty() {
        eprintln!("no `%% stream NAME` markers found in {path}");
        std::process::exit(1);
    }
    let (sheet_w, sheet_h) = (21.0f64, 29.7f64);
    let n = streams.len();
    let band_w = sheet_w / n as f64;
    println!("{n} stream(s) over a {sheet_w}cm sheet → each band {band_w:.2}cm wide");

    // ---- each stream as its own document, its page being the band
    let started = Instant::now();
    let mut pages_per_stream: Vec<Vec<String>> = Vec::new();
    for (name, text) in &streams {
        let mut cfg = DocConfig::default();
        cfg.page_width_cm = Some(band_w);
        cfg.page_height_cm = Some(sheet_h);
        cfg.margin_cm = 0.8;
        // **`layout` and not `layout_plain`**, and the rendered image is what
        // made the difference visible. `layout_plain` takes no config, so every
        // stream was laid out at the **default A4 width** and then cropped to
        // the band — which is why the first attempt showed every band clipped
        // on its right edge. The numbers said three streams of one page each
        // and the picture said the bands were the wrong shape, and the picture
        // was right: a probe that ignores the geometry it is measuring is not a
        // slow probe, it is a wrong one.
        let doc = match probe::layout(text, &cfg) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("stream {name:?} did not compile: {}", e[0].message);
                std::process::exit(1);
            }
        };
        let opts = typst_svg::SvgOptions::default();
        let svgs: Vec<String> = doc
            .pages()
            .iter()
            .map(|p| typst_svg::svg(p, &opts))
            .collect();
        println!("  {name:>8}: {} page(s) of its own", svgs.len());
        pages_per_stream.push(svgs);
    }
    let elapsed = started.elapsed();

    // ---- zip by index onto sheets
    let sheets = pages_per_stream.iter().map(Vec::len).max().unwrap_or(0);
    println!(
        "\nzipped into {sheets} sheet(s); layout took {:.0}ms",
        elapsed.as_millis()
    );
    for i in 0..sheets {
        let mut svg = String::new();
        svg.push_str(&format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" \
             width=\"{w}\" height=\"{h}\">",
            w = (sheet_w * 28.3465) as i64,
            h = (sheet_h * 28.3465) as i64,
        ));
        for (k, pages) in pages_per_stream.iter().enumerate() {
            match pages.get(i) {
                // The band a stream occupies on this sheet. In a right-to-left
                // page the first band is on the right, which is what a reader of
                // a sefer expects, so the x offset runs from the right.
                Some(inner) => {
                    let x = (sheet_w - band_w * (k as f64 + 1.0)) * 28.3465;
                    svg.push_str(&format!(
                        "<g transform=\"translate({x:.1},0)\"><svg width=\"{bw}\" height=\"{bh}\">{inner}</svg></g>",
                        bw = (band_w * 28.3465) as i64,
                        bh = (sheet_h * 28.3465) as i64,
                    ));
                }
                // A stream that has run out leaves its band **empty**, and that is
                // the honest result: the band belongs to the stream, not to
                // whatever happens to be left over this sheet.
                None => {}
            }
        }
        svg.push_str("</svg>");
        let f = format!("{outdir}/sheet{}.svg", i + 1);
        std::fs::write(&f, svg).expect("write sheet");
        println!("  {f}");
    }
}

//! Dump **every** page of a document as SVG, so a measurement can be *seen*.
//!
//! `examples/svgdump.rs` does page 1 only, which is enough for a test about
//! colour and slant and useless for the question of what happens on page 2 —
//! which is where "does this flow continue here?" is decided.
//!
//!     cargo run --example tmprender -- <file.typ> <out-dir> [max-pages]

use ksav_engine::{probe, DocConfig};

fn main() {
    let mut a = std::env::args().skip(1);
    let path = a.next().expect("usage: tmprender <file> <outdir> [pages]");
    let out = a.next().unwrap_or_else(|| ".".into());
    let max: usize = a.next().and_then(|s| s.parse().ok()).unwrap_or(4);
    let body = std::fs::read_to_string(&path).expect("read the document");

    match probe::layout(&body, &DocConfig::default()) {
        Ok(doc) => {
            let opts = typst_svg::SvgOptions::default();
            let n = doc.pages().len().min(max);
            for (i, p) in doc.pages().iter().take(n).enumerate() {
                let f = format!("{out}/page{}.svg", i + 1);
                std::fs::write(&f, typst_svg::svg(p, &opts)).expect("write svg");
                println!("{f}");
            }
            println!("total pages = {}", doc.pages().len());
        }
        Err(e) => {
            for d in e.iter().take(3) {
                println!("ERR {}", d.message);
            }
            std::process::exit(1);
        }
    }
}

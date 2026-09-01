//! Probe a document's laid-out lines with arbitrary page margins, so the
//! two-document "glue" geometry can be measured: doc A with a deep bottom
//! margin (its text stops at the seam) and doc B with a deep top margin (its
//! text area IS the band below the seam).
//!
//!   cargo run --example glue -- file.ksav [top_cm] [bottom_cm]
//!
//! The margins bypass `DocConfig::from_json`'s 7cm clamp — that clamp exists
//! for the editor's sliders, and the seam idea needs a deeper margin than any
//! slider would offer.

use ksav_engine::{docfile, probe};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let path = args.first().expect("usage: glue file.ksav [top_cm] [bottom_cm] [outdir]");
    let text = std::fs::read_to_string(path).expect("read");
    let doc = docfile::read(&text);
    let body = doc.source();
    let mut cfg = doc.cfg;
    if let Some(t) = args.get(1).and_then(|s| s.parse::<f64>().ok()) {
        cfg.margin_top_cm = Some(t);
    }
    if let Some(b) = args.get(2).and_then(|s| s.parse::<f64>().ok()) {
        cfg.margin_bottom_cm = Some(b);
    }
    let outdir = args.get(3).cloned();
    match probe::layout(&body, &cfg) {
        Ok(laid) => {
            let runs = probe::text_runs(&laid);
            let mut page = 0;
            for l in probe::lines(&runs, 1.0) {
                if l.page != page {
                    page = l.page;
                    println!("──────── page {page} ────────");
                }
                println!("y={:7.2} {}", l.y, l.text());
            }
            println!("pages: {}", probe::page_sizes(&laid).len());
            if let Some(dir) = outdir {
                std::fs::create_dir_all(&dir).expect("mkdir");
                let opts = typst_svg::SvgOptions::default();
                for (i, p) in laid.pages().iter().enumerate() {
                    let svg = typst_svg::svg(p, &opts);
                    std::fs::write(format!("{dir}/glue.page-{}.svg", i + 1), svg)
                        .expect("write svg");
                }
            }
        }
        Err(diags) => {
            for d in diags {
                println!("{}: {}", d.severity, d.message);
            }
        }
    }
}

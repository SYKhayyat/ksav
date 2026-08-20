//! Dump page 1 as SVG, so a test can see colour and slant — which probe.rs cannot.
use ksav_engine::{probe, DocConfig};
use std::io::Read;
fn main() {
    let arg = std::env::args().nth(1);
    let body = match arg {
        Some(p) => std::fs::read_to_string(p).expect("read"),
        None => {
            let mut s = String::new();
            std::io::stdin().read_to_string(&mut s).unwrap();
            s
        }
    };
    match probe::layout(&body, &DocConfig::default()) {
        Ok(doc) => {
            let opts = typst_svg::SvgOptions::default();
            for p in doc.pages().iter().take(1) {
                println!("{}", typst_svg::svg(p, &opts));
            }
        }
        Err(e) => {
            for d in e {
                eprintln!("{}", d.message);
            }
        }
    }
}

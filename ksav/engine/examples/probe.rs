//! Dump the laid-out lines of a Ksav document, so you can *see* where the
//! apparatus actually landed.  `cargo run --example probe -- file.ksav`
//! (with no argument it reads stdin).

use ksav_engine::{probe, DocConfig};
use std::io::Read;

fn main() {
    let arg = std::env::args().nth(1);
    let body = match arg {
        Some(p) => std::fs::read_to_string(p).expect("read"),
        None => {
            let mut s = String::new();
            std::io::stdin().read_to_string(&mut s).expect("stdin");
            s
        }
    };
    match probe::layout(&body, &DocConfig::default()) {
        Ok(doc) => {
            let runs = probe::text_runs(&doc);
            let mut page = 0;
            for l in probe::lines(&runs, 1.0) {
                if l.page != page {
                    page = l.page;
                    println!("──────── page {page} ────────");
                }
                let sizes: Vec<String> = {
                    let mut s: Vec<String> =
                        l.runs.iter().map(|r| format!("{:.1}", r.size)).collect();
                    s.dedup();
                    s
                };
                println!("y={:7.2} [{}] {}", l.y, sizes.join(","), l.text());
            }
        }
        Err(diags) => {
            for d in diags {
                println!("{}: {}", d.severity, d.message);
            }
        }
    }
}

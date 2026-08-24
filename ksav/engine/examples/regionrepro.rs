//! Throwaway repro harness. Deleted after use.

use ksav_engine::{probe, DocConfig};

fn main() {
    for path in std::env::args().skip(1) {
        let body = std::fs::read_to_string(&path).expect("file");
        match probe::layout(&body, &DocConfig::default()) {
            Ok(doc) => {
                let runs = probe::text_runs(&doc);
                let pages = runs.iter().map(|r| r.page).max().unwrap_or(0);
                let below = runs.iter().filter(|r| r.y > 799.02).count();
                println!("{path}: {} pages, below-folio runs {below}", pages);
            }
            Err(d) => println!("{path}: REFUSED {d:?}"),
        }
    }
}

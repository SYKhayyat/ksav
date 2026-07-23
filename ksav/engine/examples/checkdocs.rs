//! Which words in Ksav's own templates do the lexicons flag?
//! The first thing a writer sees should not be underlined.
//! `cargo run --example checkdocs`

use ksav_engine::spell::{english, hebrew, Checker};

fn main() {
    let he = hebrew::Lexicon::bundled();
    let en = english::Lexicon::bundled();
    let checker = Checker::new(Some(&he), Some(&en));
    let mut all: Vec<String> = Vec::new();
    for t in ksav_engine::templates::TEMPLATES {
        for m in checker.check(t.body) {
            all.push(format!("{} [{}] ({})", m.word, m.lang.code(), t.id));
        }
    }
    all.sort();
    all.dedup();
    println!("{} distinct flagged words across the templates:", all.len());
    for w in &all {
        println!("  {w}");
    }
}

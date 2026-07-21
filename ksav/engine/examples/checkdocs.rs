//! Which words in Ksav's own templates does the lexicon flag?
//! The first thing a writer sees should not be underlined.
//! `cargo run --example checkdocs`

use ksav_engine::spell::{self, Lexicon};

fn main() {
    let lex = Lexicon::bundled();
    let mut all: Vec<String> = Vec::new();
    for t in ksav_engine::templates::TEMPLATES {
        for m in spell::check(t.body, &lex) {
            all.push(m.word);
        }
    }
    all.sort();
    all.dedup();
    println!("{} distinct flagged words across the templates:", all.len());
    for w in &all {
        println!("  {w}");
    }
}

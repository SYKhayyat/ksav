//! Measure the lexicon's miss rate on a corpus — the same metric the Hspell
//! research used, so the two are comparable.
//! `cargo run --example spellrate -- file.txt [more.txt ...]`

use ksav_engine::spell::{self, Lexicon};

fn main() {
    let lex = Lexicon::bundled();
    println!("lexicon: {} entries", lex.len());
    for path in std::env::args().skip(1) {
        let text = std::fs::read_to_string(&path).expect("read");
        let total = spell::words(&text)
            .into_iter()
            .filter(|(_, w)| spell::should_check(w))
            .count();
        let misses = spell::check(&text, &lex);
        let rate = if total == 0 { 0.0 } else { 100.0 * misses.len() as f64 / total as f64 };
        println!("{path}: {total} checkable words, {} missed ({rate:.1}%)", misses.len());
        let mut sample: Vec<&str> = misses.iter().map(|m| m.word.as_str()).collect();
        sample.sort_unstable();
        sample.dedup();
        println!("   e.g. {}", sample.iter().take(15).cloned().collect::<Vec<_>>().join(" "));
    }
}

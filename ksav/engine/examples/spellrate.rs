//! Measure the lexicons' miss rate on a corpus — the same metric the Hspell
//! research used, so the two are comparable.
//! `cargo run --example spellrate -- file.txt [more.txt ...]`
//!
//! Reported per language, because one number over a bilingual file hides which
//! half is doing badly.

use ksav_engine::spell::{self, english, hebrew, Checker, Language};

fn main() {
    let he = hebrew::Lexicon::bundled();
    let en = english::Lexicon::bundled();
    println!("Hebrew: {} entries, English: {} entries", he.len(), en.len());
    let checker = Checker::new(Some(&he), Some(&en));

    for path in std::env::args().skip(1) {
        let text = std::fs::read_to_string(&path).expect("read");
        let misses = checker.check(&text);
        println!("{path}:");
        for lang in [Language::Hebrew, Language::English] {
            let total = spell::words(&text)
                .into_iter()
                .filter(|t| t.lang == lang && t.checkable())
                .count();
            if total == 0 {
                continue;
            }
            let mine: Vec<&str> = misses
                .iter()
                .filter(|m| m.lang == lang)
                .map(|m| m.word.as_str())
                .collect();
            let rate = 100.0 * mine.len() as f64 / total as f64;
            let mut sample = mine.clone();
            sample.sort_unstable();
            sample.dedup();
            println!(
                "  {}: {total} checkable words, {} missed ({rate:.1}%)",
                lang.code(),
                mine.len()
            );
            println!(
                "     e.g. {}",
                sample.iter().take(15).cloned().collect::<Vec<_>>().join(" ")
            );
        }
    }
}

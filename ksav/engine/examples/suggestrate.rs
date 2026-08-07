//! Measure whether the "did you mean…?" menu contains the word you meant.
//!
//! `cargo run --release --example suggestrate [max-band]`
//!
//! # Why this exists
//!
//! `spellrate.rs` measures the *other* half — how often the checker wrongly
//! underlines a correct word — and that number was good (0.7% on modern Torah
//! prose) for as long as the suggestion menu itself was useless. Nothing
//! measured the menu, and both Hebrew suggestion tests asserted only
//! `!suggestions.is_empty()`: green, and unable to fail for the thing that was
//! wrong. The intended word came first 20% of the time.
//!
//! Every candidate a one-edit lexicon returns is one edit away by construction,
//! so distance separates none of them and transposition separates only the
//! transposed ones. What was left as the tie-breaker was **alphabetical order**.
//!
//! # It reports both sides, every run
//!
//! The second column rebuilds the lexicon with the frequency bands stripped —
//! the old behaviour, recomputed from the same words. A ranking improvement
//! stated once in a commit message is a number nobody can check a year later,
//! and this repository has a documented history of exactly that.
//!
//! The sampler lives in `spell::measure` so that `tests/spell.rs`, which asserts
//! a floor, is measuring the same thing this prints.

use ksav_engine::spell::{hebrew, measure};

const SAMPLE: usize = 400;

fn main() {
    let max_band: u8 = std::env::args()
        .nth(1)
        .and_then(|a| a.parse().ok())
        .unwrap_or(measure::COMMON_BANDS);

    let banded = hebrew::Lexicon::bundled();
    let flat = measure::without_bands();
    let cases = measure::substitution_typos(max_band, SAMPLE, measure::SEED);

    println!(
        "{} entries; {} substitution typos drawn from the {} words in bands 0..={max_band}\n",
        banded.len(),
        cases.len(),
        measure::banded_words(max_band).len(),
    );

    let with = measure::places(&banded, &cases);
    let without = measure::places(&flat, &cases);

    println!(
        "                       first          in the {}",
        measure::MENU
    );
    println!("  as shipped (banded)  {}", measure::Rate::of(&with));
    println!("  bands stripped       {}", measure::Rate::of(&without));

    let improved = with.iter().zip(&without).filter(|(a, b)| a < b).count();
    let regressed = with.iter().zip(&without).filter(|(a, b)| a > b).count();
    println!(
        "\n  {improved} of {} typos rank higher with the bands, {regressed} lower",
        cases.len()
    );

    // What is still wrong is more use than a percentage, and it separates the
    // two failures an `!is_empty()` assertion could not tell apart: a word
    // ranked sixteenth is a *ranking* problem, and a word not offered at all is
    // a coverage one. Only the second wants a bigger lexicon.
    let mut left: Vec<(usize, &str, &str)> = cases
        .iter()
        .zip(&with)
        .filter(|(_, p)| **p >= measure::MENU)
        .map(|((w, t), p)| (*p, w.as_str(), t.as_str()))
        .collect();
    left.sort_unstable();
    let absent = left.iter().filter(|(p, _, _)| *p == usize::MAX).count();
    println!(
        "  {} still miss the menu — {} ranked too low, {} not offered at all",
        left.len(),
        left.len() - absent,
        absent
    );
    for (p, w, t) in left.iter().take(5) {
        let where_ = if *p == usize::MAX {
            "not offered".to_string()
        } else {
            format!("#{}", p + 1)
        };
        println!("    {t} → {w}: {where_}");
    }
}

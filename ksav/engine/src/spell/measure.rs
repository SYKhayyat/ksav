//! Is the word you meant in the menu? — as a measurement, not an opinion.
//!
//! # Why this is in the library
//!
//! Same reason [`crate::probe`] is: a claim about what the product does has to
//! be checkable by something that runs. `probe` reads the laid-out document so a
//! test can assert where the apparatus landed instead of asserting that the
//! compile returned `Ok`. This reads the suggestion menu so a test can assert
//! that the word the writer meant is *in* it, instead of asserting that the menu
//! is non-empty.
//!
//! That distinction is not academic. Both Hebrew suggestion tests asserted
//! `!suggestions.is_empty()` and both were green while the intended word came
//! first four times in a hundred. A green assertion that cannot fail for the
//! thing that is wrong is the failure mode this repository keeps rebuilding, and
//! the cure is an assertion that has to look at the *order*.
//!
//! # Why the sampler is shared rather than written twice
//!
//! `tests/spell.rs` asserts a floor and `examples/suggestrate.rs` reports the
//! full A/B against a lexicon with the bands stripped. Those are two different
//! jobs over one sample, and a test whose sample differs from the tool's is a
//! test measuring something nobody looked at. One generator, deterministic, in
//! the place both can reach.

use super::hebrew;

/// A deterministic little generator, so the same sample comes out on every
/// machine and a regression reads as a moved number rather than as noise.
pub struct Lcg(u64);

impl Lcg {
    pub fn new(seed: u64) -> Lcg {
        Lcg(seed)
    }
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 16
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

/// The seed every caller uses unless it has a reason not to.
pub const SEED: u64 = 0x5EFE_2026;

/// Bands 0..=2 — the six thousand commonest words of the seforim corpus.
///
/// The default sample, because **the commonest words are the hard case**. A rare
/// word has few neighbours one edit away and was mostly fine before the bands; a
/// common word sits in the thick of the lexicon with dozens of competitors, and
/// it is also the word somebody is most likely to be typing. Sampling across the
/// whole vocabulary flatters every column and measures the wrong thing.
pub const COMMON_BANDS: u8 = 2;

/// The words the generated lexicon banded at or above `max_band`.
pub fn banded_words(max_band: u8) -> Vec<String> {
    let mut out = Vec::new();
    for src in hebrew::Lexicon::bundled_sources() {
        for line in src.lines() {
            if line.starts_with('#') {
                continue;
            }
            let Some((w, band)) = line.split_once('\t') else {
                continue;
            };
            // Three letters up: a two-letter word one substitution from another
            // two-letter word is a coin toss no ranking can win, and there are
            // enough of them to swamp the result in either direction.
            if band.trim().parse::<u8>().is_ok_and(|b| b <= max_band) && w.chars().count() >= 3 {
                out.push(w.to_string());
            }
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

const ALEF_BET: &[char] = &[
    'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק',
    'ר', 'ש', 'ת',
];

/// Replace one letter with a different one.
fn mistype(word: &str, rng: &mut Lcg) -> Option<String> {
    let chars: Vec<char> = word.chars().collect();
    let spots: Vec<usize> = (0..chars.len())
        .filter(|i| ALEF_BET.contains(&chars[*i]))
        .collect();
    if spots.is_empty() {
        return None;
    }
    let at = spots[rng.below(spots.len())];
    let mut out = chars.clone();
    for _ in 0..4 {
        let c = ALEF_BET[rng.below(ALEF_BET.len())];
        if c != chars[at] {
            out[at] = c;
            return Some(out.into_iter().collect());
        }
    }
    None
}

/// `n` (intended word, typo) pairs drawn from words banded at or above
/// `max_band`.
///
/// **Substitutions only, and that is the point.** A transposition already has
/// its own term in [`super::rank`], so transposed typos were largely fine
/// before there was a frequency layer at all. A substitution leaves a candidate
/// that scores identically to every other word one letter away, which is where
/// the whole population lives and where the menu was failing.
///
/// A "typo" that is itself a real word is discarded: the checker is never asked
/// about it, so scoring it would flatter every column equally and measure
/// nothing.
pub fn substitution_typos(max_band: u8, n: usize, seed: u64) -> Vec<(String, String)> {
    let lex = hebrew::Lexicon::bundled();
    let words = banded_words(max_band);
    let mut rng = Lcg::new(seed);
    let mut out = Vec::new();
    // Bounded, so a lexicon that somehow banded nothing fails as an empty sample
    // rather than as a hang.
    let mut tries = 0;
    while out.len() < n && !words.is_empty() && tries < n * 100 {
        tries += 1;
        let word = &words[rng.below(words.len())];
        let Some(typo) = mistype(word, &mut rng) else {
            continue;
        };
        if lex.contains(&typo) {
            continue;
        }
        out.push((word.clone(), typo));
    }
    out
}

/// Where `want` sits in the menu for `typo`, or [`usize::MAX`] if it is absent.
///
/// Asks for more than a menu holds on purpose, so "sixteenth" is distinguishable
/// from "not offered at all" — a ranking problem and a coverage problem, which
/// is exactly the difference an `!is_empty()` assertion cannot see.
pub fn place(lex: &hebrew::Lexicon, typo: &str, want: &str) -> usize {
    lex.suggest(typo, 32)
        .iter()
        .position(|s| s == want)
        .unwrap_or(usize::MAX)
}

/// How often the intended word led the menu, and how often it was in it.
#[derive(Debug, Clone, Copy)]
pub struct Rate {
    pub top1: usize,
    pub top5: usize,
    pub n: usize,
}

/// The size of the menu the editor actually shows.
pub const MENU: usize = 5;

impl Rate {
    pub fn of(places: &[usize]) -> Rate {
        Rate {
            top1: places.iter().filter(|p| **p == 0).count(),
            top5: places.iter().filter(|p| **p < MENU).count(),
            n: places.len(),
        }
    }
    pub fn top1_pct(&self) -> f64 {
        100.0 * self.top1 as f64 / self.n.max(1) as f64
    }
    pub fn top5_pct(&self) -> f64 {
        100.0 * self.top5 as f64 / self.n.max(1) as f64
    }
}

impl std::fmt::Display for Rate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{:3}/{} ({:4.1}%)   {:3}/{} ({:4.1}%)",
            self.top1,
            self.n,
            self.top1_pct(),
            self.top5,
            self.n,
            self.top5_pct()
        )
    }
}

/// Where each case's intended word landed, in the order the cases were given.
pub fn places(lex: &hebrew::Lexicon, cases: &[(String, String)]) -> Vec<usize> {
    cases.iter().map(|(w, t)| place(lex, t, w)).collect()
}

/// The bundled lexicon with every frequency band removed — the ranking exactly
/// as it was before the bands existed, rebuilt from the same words.
///
/// This is what makes the improvement a *measurement* rather than a claim in a
/// commit message: the "before" column is recomputed on every run, so it cannot
/// quietly stop being true.
pub fn without_bands() -> hebrew::Lexicon {
    let mut l = hebrew::Lexicon::empty();
    for src in hebrew::Lexicon::bundled_sources() {
        let stripped: String = src
            .lines()
            .map(|l| l.split('\t').next().unwrap_or(l))
            .collect::<Vec<_>>()
            .join("\n");
        l.add_words(&stripped);
    }
    l
}

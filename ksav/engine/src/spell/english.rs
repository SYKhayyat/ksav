//! English spell-checking, for the other half of what Ksav claims.
//!
//! # Why this exists at all
//!
//! `dir: "ltr"` has always been a real setting and an English document has always
//! typeset correctly. What it did not do was get checked: the old tokenizer threw
//! away any token containing a Latin letter, so an English page with three typos
//! in it came back clean while the toggle still read as on. That is a misleading
//! silence, and a worse failure than an absent feature — an absent feature does
//! not tell you your document is fine.
//!
//! # Why the word list is built the way it is
//!
//! This is the mirror image of the Hebrew problem, which is why it has a
//! different answer. For Hebrew there is one open dictionary and it does not know
//! Torah Hebrew, so Ksav builds its own. For English there is an excellent open
//! word list — Kevin Atkinson's English Speller Database, the source of SCOWL,
//! `wamerican` and Aspell's own dictionaries — and the only thing it lacks is the
//! vocabulary this product's writers use in every paragraph. "The Rambam paskens
//! that one may not daven Mincha after shkiah" is nine words, five of which a
//! general English dictionary rejects. Underline those five and you have
//! reproduced Hspell's failure from the other direction.
//!
//! So `assets/lexicon-en.txt` is ESDB plus the Public Domain Judaic English on
//! Sefaria (biblical proper nouns: Abimelech, Shechem, Mamre), and
//! `assets/lexicon-en-supplement.txt` is a hand-curated list of contemporary
//! transliteration that no public-domain corpus can supply, because the writing
//! that uses it is all in copyright. See `tools/build_english_lexicon.py`.
//!
//! # Case is significant, and asymmetric
//!
//! This is the one structural difference from the Hebrew side, and getting it
//! backwards is the difference between a checker that teaches and one that
//! nags. The rule is the standard one:
//!
//! * an entry written **all lowercase** accepts every capitalisation of itself —
//!   `torah`, `Torah`, `TORAH`;
//! * an entry **carrying a capital** accepts only itself and its all-caps form —
//!   `Rashi` and `RASHI`, but not `rashi`.
//!
//! So a proper noun stays a proper noun and a common noun is free. It follows
//! that the hand supplement is written entirely in lowercase: transliterated
//! words have no settled capitalisation convention, people write both "the
//! Gemara" and "learning gemara", and insisting on one would underline a correct
//! spelling over a style choice.

use super::{edit_distance, is_transposition, letter_mask, rank, ByLength, Dict, Learn};
use std::collections::HashSet;

/// The bundled English lexicon: ESDB plus Public Domain Judaic English.
const LEXICON: &str = include_str!("../../assets/lexicon-en.txt");
/// Hand-curated transliterated Hebrew, Aramaic and Yiddish.
const SUPPLEMENT: &str = include_str!("../../assets/lexicon-en-supplement.txt");

/// The English words the checker accepts.
///
/// Three sets rather than one, because the casing rule needs to distinguish
/// "this entry is written lowercase" from "this entry carries a capital" and
/// still answer an all-caps lookup in constant time.
///
/// Both word sets are bucketed by the character length of their **lowercase**
/// form, and carry the letter mask of that same form — because lowercase is what
/// a lookup and a suggestion are both matched on, so one index serves both and
/// the two can never disagree about which bucket a word is in.
#[derive(Debug, Clone, Default)]
pub struct Lexicon {
    /// Entries written all in lowercase, stored as written.
    lower: ByLength,
    /// Entries carrying a capital, stored as written.
    cased: ByLength,
    /// The lowercase key of every entry in `cased`, so `RASHI` can be answered
    /// without either scanning or storing a second full copy in upper case.
    cased_keys: HashSet<String>,
}

impl Lexicon {
    /// An empty lexicon — accepts nothing.
    pub fn empty() -> Lexicon {
        Lexicon::default()
    }

    /// The generated lexicon plus the curated supplement.
    pub fn bundled() -> Lexicon {
        let mut l = Lexicon::default();
        l.add_words(LEXICON);
        l.add_words(SUPPLEMENT);
        l
    }

    /// Add words from a newline-separated list. `#` comments and blanks are
    /// ignored — which is also how the generated file carries ESDB's licence
    /// notice at its head, where it travels with the data rather than beside it.
    pub fn add_words(&mut self, list: &str) {
        for line in list.lines() {
            let w = normalize(line.trim());
            if w.is_empty() || w.starts_with('#') {
                continue;
            }
            let key = w.to_lowercase();
            let chars: Vec<char> = key.chars().collect();
            let (n, mask) = (chars.len(), letter_mask(&chars));
            if w == key {
                self.lower.insert(&w, n, mask);
            } else {
                self.cased.insert(&w, n, mask);
                self.cased_keys.insert(key);
            }
        }
    }

    pub fn len(&self) -> usize {
        self.lower.len() + self.cased.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Is this exact written form accepted, before any morphology?
    fn known(&self, w: &str) -> bool {
        let key = w.to_lowercase();
        // One length for both sets: an entry is filed under its lowercase form's
        // length whichever set it is in, so `Rashi` and `rashi` land in the same
        // bucket and a lookup never has to guess which.
        let n = key.chars().count();
        self.lower.contains(&key, n)
            || self.cased.contains(w, n)
            // An all-caps word matches a capitalised entry: SHECHEM is Shechem
            // shouted, not a different word. The `w != key` guard is what keeps
            // this from also accepting the lowercase form of a proper noun,
            // which is the whole point of storing case.
            || (w != key && w == w.to_uppercase() && self.cased_keys.contains(&key))
    }

    pub fn contains(&self, word: &str) -> bool {
        let w = normalize(word);
        if self.known(&w) {
            return true;
        }
        // The possessive is the one piece of English morphology worth doing in
        // code. ESDB does list `X's` forms, but only for the words it holds, so
        // every proper noun the corpus and the supplement contribute — Rashi's,
        // Shechem's, the Rambam's — would otherwise be a miss the moment someone
        // wrote about it rather than named it. Stripping it here also let the
        // builder drop 19,000 derivable `X's` entries from the shipped file.
        for suffix in ["'s", "'S"] {
            if let Some(base) = w.strip_suffix(suffix) {
                if !base.is_empty() && self.known(base) {
                    return true;
                }
            }
        }
        self.known_through_prefix(&w)
    }

    /// The one piece of *Hebrew* morphology that survives transliteration.
    ///
    /// Hebrew glues its prepositions and conjunctions onto the front of a word,
    /// and English-language Torah writing carries that over with an apostrophe:
    /// `l'halacha`, `b'shaas`, `d'oraisa`, `v'chulu`, `sh'ma`, `m'dubar`. No
    /// English word list contains any of them, and no amount of listing would
    /// help — the combinations are open-ended, which is exactly why the Hebrew
    /// side strips prefixes rather than enumerating them.
    ///
    /// The bounds are the Hebrew ones, and for the same reason: a stem of at
    /// least three letters, so this cannot turn a two-letter fragment plus a
    /// prefix into an accepted word.
    fn known_through_prefix(&self, w: &str) -> bool {
        const PREFIXES: [&str; 10] = ["b", "d", "h", "k", "l", "m", "sh", "u", "v", "y"];
        let Some((head, stem)) = w.split_once('\'') else {
            return false;
        };
        if stem.chars().count() < 3 || !PREFIXES.contains(&head.to_lowercase().as_str()) {
            return false;
        }
        // The stem carries the word's own capitalisation: `L'Halacha` and
        // `l'halacha` both reduce to a lookup of what follows the apostrophe.
        self.known(stem)
    }

    /// Words within one edit of `word`, best first.
    pub fn suggest(&self, word: &str, limit: usize) -> Vec<String> {
        let mut scored = self.suggest_scored(word);
        scored.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
        // Two entries can re-case to the same suggestion — `The` and `the` both
        // become `The` for a title-case typo — so dedup on the string that would
        // actually be offered, keeping the better-scored one.
        let mut seen = HashSet::new();
        scored
            .into_iter()
            .filter(|(_, w)| seen.insert(w.clone()))
            .take(limit)
            .map(|(_, w)| w)
            .collect()
    }

    /// Candidates with their scores, unsorted; lower is better.
    ///
    /// Matching is case-insensitive — a typo is a typo whatever case it was
    /// typed in — and the case of what the writer actually wrote is then put
    /// back on the suggestion, so replacing `Teh` at the start of a sentence
    /// offers `The` and not `the`.
    ///
    /// Case also *ranks*, and it has to. Sorting one edit's worth of candidates
    /// alphabetically puts every capitalised entry first, because that is what
    /// byte order does — so `teh` came back as `ETH, NEH, Te, Ted, Tet, Tex, Th`
    /// and the list was cut off before it reached `the`.
    ///
    /// A proper noun offered for a plainly lowercase word is the least likely
    /// answer there is, so it **costs a whole edit**: still on the list, never
    /// ahead of a lowercase word that is just as close.
    ///
    /// It used to cost half an edit, and half was not enough to do the job the
    /// half was for. Measured on `tge`: `GTE` is a transposition of it, `the` is a
    /// substitution, and a transposition is worth two edits of advantage — so the
    /// telephone company was offered first for a plainly lowercase typo. Same for
    /// `amd`, where `AMD` lowercases to exactly what was typed and `and` came
    /// fifth.
    fn suggest_scored(&self, word: &str) -> Vec<(usize, String)> {
        let written = normalize(word);
        let target = written.to_lowercase();
        if target.is_empty() {
            return Vec::new();
        }
        let tc: Vec<char> = target.chars().collect();
        let tmask = letter_mask(&tc);
        let shape = Shape::of(&written);
        let mut fold = [' '; super::FOLD_BUF];
        let mut out = Vec::new();
        let candidates = self.lower.near(tc.len()).map(|(w, m)| (w, m, 0)).chain(
            self.cased
                .near(tc.len())
                .map(|(w, m)| (w, m, usize::from(shape == Shape::Lower))),
        );
        for (w, mask, penalty) in candidates {
            // One edit moves at most two letters in or out of a word, so anything
            // further apart than that is not a candidate and never gets read.
            if (mask ^ tmask).count_ones() > 2 {
                continue;
            }
            let Some(cand) = super::fold_into(&mut fold, w.chars().flat_map(char::to_lowercase))
            else {
                continue;
            };
            if let Some(d) = edit_distance(&tc, cand, 1) {
                // Distance, then transposition, then **how common the word is**
                // (B29), then the capitalisation penalty. All three tie-breakers
                // fit inside one edit's worth of scale, so a common word never
                // beats a closer one — see `spell::rank`.
                //
                // This is the layer that was missing. Every candidate here is one
                // edit away by construction, so distance separates none of them,
                // and what was left was the order the lexicon happened to be in:
                // `teh` came back `eh, meh, tea, tech, ted, tee` and `the` fell
                // off the end.
                let common = crate::spell::common::band(w);
                out.push((
                    rank(d, is_transposition(&tc, cand)) + common + rank(penalty, true),
                    shape.apply(w),
                ));
            }
        }
        out
    }
}

impl Dict for Lexicon {
    fn contains(&self, word: &str) -> bool {
        Lexicon::contains(self, word)
    }
    fn suggest(&self, word: &str, limit: usize) -> Vec<String> {
        Lexicon::suggest(self, word, limit)
    }
    fn len(&self) -> usize {
        Lexicon::len(self)
    }
}

impl Learn for Lexicon {
    fn add_words(&mut self, list: &str) {
        Lexicon::add_words(self, list)
    }
    fn suggest_scored(&self, word: &str) -> Vec<(usize, String)> {
        Lexicon::suggest_scored(self, word)
    }
}

/// The capitalisation of the word the writer typed, to be put back on whatever
/// is offered in its place.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Shape {
    Lower,
    Title,
    Upper,
}

impl Shape {
    fn of(word: &str) -> Shape {
        let has_lower = word.chars().any(char::is_lowercase);
        let first_upper = word.chars().next().is_some_and(char::is_uppercase);
        match (first_upper, has_lower) {
            (true, false) => Shape::Upper,
            (true, true) => Shape::Title,
            _ => Shape::Lower,
        }
    }

    /// A candidate re-cased to this shape — but never *down*: `Rashi` offered for
    /// `rashi` stays `Rashi`, because the entry's own capital is a fact about the
    /// word and not about how it was typed.
    fn apply(self, candidate: &str) -> String {
        match self {
            Shape::Upper => candidate.to_uppercase(),
            Shape::Title => {
                let mut cs = candidate.chars();
                match cs.next() {
                    Some(c) => c.to_uppercase().collect::<String>() + cs.as_str(),
                    None => String::new(),
                }
            }
            Shape::Lower => candidate.to_string(),
        }
    }
}

// ---------------------------------------------------------------- the alphabet

/// A character that is part of an English word on its own account.
///
/// Digits are included deliberately. They are not letters and nothing here will
/// check them, but binding them to the run is what keeps `ver2`, `MP3` and `H2O`
/// arriving at [`should_check`] as one identifier to exempt, rather than as a
/// bare `ver` to underline. The Latin-1 and Latin Extended-A ranges are in
/// because ESDB carries accented spellings — café, naïve, résumé — and a word is
/// not a different word for being spelled correctly.
pub(crate) fn is_part(c: char) -> bool {
    c.is_ascii_alphabetic() || c.is_ascii_digit() || matches!(c, '\u{00C0}'..='\u{024F}')
}

/// Does this mark stay inside the English word being read?
///
/// Two marks, for two different reasons.
///
/// **The apostrophe**, with a letter after it: that joins `don't` and `Rashi's`
/// while leaving a closing quotation mark outside the word it closes, and it
/// deliberately drops the trailing apostrophe of a plural possessive — `the
/// bochurim's` is checked as `bochurim`, which is the word in question.
///
/// **Gershayim**, with a one- or two-letter tail: `zt"l`, `shlit"a`, `a"h`,
/// `hy"d`. English Torah writing keeps the Hebrew abbreviation mark even when
/// the letters around it are Latin, and splitting on it produces `zt` and a
/// squiggle. The tail bound is the Hebrew one and does the same work — it is
/// what tells an abbreviation apart from a quotation, since a quotation opens a
/// whole word and a closing quotation mark has nothing after it at all.
pub(crate) fn joins(c: char, rest: &str) -> bool {
    let next = rest.chars().next();
    if matches!(c, '\'' | '\u{2019}' | '\u{02BC}') {
        return next.is_some_and(|n| n.is_alphabetic() && is_part(n));
    }
    if matches!(c, '"' | '\u{201C}' | '\u{201D}') {
        let tail = rest.chars().take_while(|c| c.is_alphabetic()).count();
        return (1..=2).contains(&tail);
    }
    false
}

// --------------------------------------------------------------- normalisation

/// Fold a word to the form the lexicon stores.
///
/// It is not cosmetic: every word processor, every browser and every web page
/// produces the curly apostrophe U+2019, while every word list ever published
/// uses the ASCII one. Without this fold *every* contraction and possessive in a
/// pasted paragraph is a miss — don't, it's, Israel's — which measured as
/// 0.1–0.3 points of miss rate on running prose, all of it noise. Gershayim fold
/// the same way and for the same reason, so `zt”l` typed by an editor that
/// curls quotes matches the `zt"l` in the word list. It is the exact counterpart
/// of the fold on the Hebrew side.
pub fn normalize(word: &str) -> String {
    word.chars()
        .map(|c| match c {
            '\u{2019}' | '\u{02BC}' => '\'',
            '\u{201C}' | '\u{201D}' => '"',
            other => other,
        })
        .collect()
}

/// Should this token be checked at all?
///
/// Three exemptions, each because flagging would be wrong rather than hard:
///
/// * **Anything carrying a digit.** `MP3`, `ver2`, `H2O`, `1st` — an identifier
///   or a number, not prose.
/// * **A single letter.** `a`, `I`, and the `p` of a list marker.
/// * **A short all-caps run.** `USA`, `IDF`, `PDF`, `ZIP` are initialisms, and no
///   dictionary lists them all. Word ignores every uppercase word by default;
///   this is stricter — four letters is the ceiling, so a shouted heading is
///   still checked, case-insensitively, and `TEH QUICK BROWN` is still wrong.
pub fn should_check(word: &str) -> bool {
    if word.is_empty() || word.chars().any(|c| c.is_ascii_digit()) {
        return false;
    }
    let letters = word.chars().filter(|c| c.is_alphabetic()).count();
    if letters < 2 {
        return false;
    }
    if letters <= 4 && !word.chars().any(char::is_lowercase) {
        return false;
    }
    true
}

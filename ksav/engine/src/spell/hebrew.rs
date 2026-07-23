//! Hebrew spell-checking, built on a lexicon Ksav owns.
//!
//! # Why this is not Hunspell
//!
//! There is exactly one open Hebrew spelling dictionary in the world — Hspell,
//! last released in 2017 — and every other tool (Chrome, Firefox, LibreOffice,
//! Google Docs) ships the same data. Two things rule it out as a foundation here:
//!
//! * **Licence.** It is AGPLv3, including the generated word lists, and its
//!   authors read that as covering network use. Embedding it in the binary the
//!   way the fonts are embedded would put Ksav's own licensing in question.
//! * **It does not know Torah Hebrew.** Measured against real text it flags
//!   ~9.5% of Shulchan Arukh, ~8% of Mishnah Berurah and ~26% of Talmudic
//!   Aramaic — the *correct* words — and rejects the everyday citation apparatus
//!   outright (ע"א, שו"ע, עיי"ש, ודו"ק, תוס'). A checker that underlines one
//!   correct word in four in the passage a bochur is quoting does not help them.
//!   It teaches them to ignore every squiggle, which is worse than no checker.
//!
//! So the lexicon is built from Public Domain sources that match what Ksav's
//! users actually write (see `tools/build_lexicon.py`), plus a hand-curated
//! supplement for Talmudic vocabulary and the abbreviation apparatus, plus the
//! writer's own dictionary. Hspell can still be loaded as a user-installed pack
//! for modern Hebrew — [`Lexicon::add_words`] takes any word list — but nothing
//! AGPL is bundled.
//!
//! The English half of this module tells the same story from the other end: see
//! `english.rs`, where an excellent general dictionary does exist and the one
//! thing it does not know is transliterated Hebrew.
//!
//! # What it deliberately does not check
//!
//! **Pointed text.** The lexicon holds no nikud, and neither does any Hebrew
//! dictionary that exists: pointed and unpointed Hebrew are different spelling
//! systems. Checking pointed text against an unpointed lexicon flags ~99% of it.
//! So nikud is stripped before lookup, which means a *wrong vowel is invisible to
//! this checker* — it can never validate nikud, and it does not pretend to.

use super::{edit_distance, is_transposition, rank, Dict, Learn};
use std::collections::HashSet;

/// The bundled Torah lexicon, generated from Public Domain texts.
const LEXICON: &str = include_str!("../../assets/lexicon-he.txt");
/// Hand-curated Talmudic vocabulary and the citation apparatus.
const SUPPLEMENT: &str = include_str!("../../assets/lexicon-he-supplement.txt");

/// The Hebrew words the checker accepts.
#[derive(Debug, Clone, Default)]
pub struct Lexicon {
    words: HashSet<String>,
}

impl Lexicon {
    /// An empty lexicon — accepts nothing but the structural exemptions.
    pub fn empty() -> Lexicon {
        Lexicon::default()
    }

    /// The bundled Torah lexicon plus the curated supplement.
    pub fn bundled() -> Lexicon {
        let mut l = Lexicon::default();
        l.add_words(LEXICON);
        l.add_words(SUPPLEMENT);
        l
    }

    /// Add words from a newline-separated list. `#` comments and blanks are
    /// ignored, and every entry is normalized the same way lookups are, so a
    /// list written with Hebrew gershayim still matches text typed with them.
    pub fn add_words(&mut self, list: &str) {
        for line in list.lines() {
            let w = line.trim();
            if w.is_empty() || w.starts_with('#') {
                continue;
            }
            self.words.insert(normalize(w));
        }
    }

    pub fn len(&self) -> usize {
        self.words.len()
    }

    pub fn is_empty(&self) -> bool {
        self.words.is_empty()
    }

    pub fn contains(&self, word: &str) -> bool {
        let w = normalize(word);
        if self.words.contains(&w) {
            return true;
        }
        // Hebrew glues its prepositions and conjunctions onto the front of the
        // word — ו, ה, ב, כ, ל, מ, ש, and stacks of them (ושה־, ובמ־). A lexicon
        // cannot enumerate every combination, and without this every prefixed
        // form of every word is a miss: ושו"ע and ומג"א are flagged while שו"ע
        // and מג"א are known, which is exactly the case that makes a checker
        // look stupid.
        //
        // Two prefix letters is the practical ceiling, and the stem left behind
        // must be at least three letters. Both bounds are about over-acceptance:
        // this does accept some nonsense that happens to be a prefix plus a real
        // word (the trade every Hebrew checker makes, Hspell included), and
        // allowing a two-letter stem made it much worse — the corpus contains
        // fragments like ומ and לום, which between them let the genuine typo
        // שלומ through as ש+לום or של+ומ.
        let chars: Vec<char> = w.chars().collect();
        for take in 1..=2.min(chars.len().saturating_sub(3)) {
            if !chars[..take].iter().all(|c| is_prefix_letter(*c)) {
                break;
            }
            let rest: String = chars[take..].iter().collect();
            if self.words.contains(&rest) {
                return true;
            }
        }
        false
    }

    /// Words within one edit of `word`, best first — the "did you mean" list.
    ///
    /// Deliberately small and simple: an exhaustive scan with an early length
    /// filter. The lexicon is tens of thousands of entries, not millions, and a
    /// writer asks for suggestions on one word at a time.
    pub fn suggest(&self, word: &str, limit: usize) -> Vec<String> {
        let mut scored = self.suggest_scored(word);
        // Shortest edit first, then alphabetical so the order is stable rather
        // than whatever the hash set happened to yield.
        scored.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
        scored.into_iter().take(limit).map(|(_, w)| w).collect()
    }

    /// Candidates with their edit distances, unsorted — so a layered checker can
    /// merge the writer's own words into the ranking rather than appending them.
    fn suggest_scored(&self, word: &str) -> Vec<(usize, String)> {
        let target = normalize(word);
        if target.is_empty() {
            return Vec::new();
        }
        // Final letters fold onto their medial forms before scoring, so a
        // suggestion differing only in ם/מ ranks as a near miss — which is
        // exactly the mistake a typist makes.
        let tc: Vec<char> = target.chars().map(fold_final).collect();
        self.words
            .iter()
            .filter(|w| {
                let n = w.chars().count();
                n + 1 >= tc.len() && n <= tc.len() + 1
            })
            .filter_map(|w| {
                let cand: Vec<char> = w.chars().map(fold_final).collect();
                edit_distance(&tc, &cand, 1)
                    .map(|d| (rank(d, is_transposition(&tc, &cand)), w.clone()))
            })
            .collect()
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

// ---------------------------------------------------------------- the alphabet

/// Hebrew combining marks: nikud, te'amim and the meteg/rafe family.
fn is_hebrew_mark(c: char) -> bool {
    matches!(c, '\u{0591}'..='\u{05C7}')
}

fn is_hebrew_letter(c: char) -> bool {
    matches!(c, '\u{05D0}'..='\u{05EA}')
}

/// A character that is part of a Hebrew word on its own account, with no need to
/// look at what surrounds it.
pub(crate) fn is_part(c: char) -> bool {
    is_hebrew_letter(c) || is_hebrew_mark(c)
}

/// The letters Hebrew attaches to the front of a word: ו (and), ה (the),
/// ב (in), כ (like), ל (to), מ (from), ש (that).
fn is_prefix_letter(c: char) -> bool {
    matches!(c, 'ו' | 'ה' | 'ב' | 'כ' | 'ל' | 'מ' | 'ש')
}

/// Gershayim (double) — used *between* letters in an acronym: שו"ע, ע"ב.
fn is_gershayim(c: char) -> bool {
    matches!(c, '"' | '\u{05F4}' | '\u{201C}' | '\u{201D}')
}

/// Geresh (single) — used between letters *and* as a trailing abbreviation
/// marker: תוס', סי', וגו'.
fn is_geresh(c: char) -> bool {
    matches!(c, '\'' | '\u{05F3}' | '\u{2018}' | '\u{2019}')
}

/// How many Hebrew letters begin `s`, ignoring the marks that hang off them.
fn run_of_letters(s: &str) -> usize {
    s.chars()
        .take_while(|c| is_hebrew_letter(*c) || is_hebrew_mark(*c))
        .filter(|c| is_hebrew_letter(*c))
        .count()
}

/// Does this mark stay inside the Hebrew word being read, given what follows it?
///
/// A token keeps its gershayim, because in Hebrew they are part of the word:
/// `שו"ע` and `תוס'` are single words, and splitting on the quote would produce
/// three nonsense fragments and three squiggles.
///
/// The two marks need different rules, because Hebrew uses them differently.
/// Gershayim sit BETWEEN letters in an acronym (שו"ע, ע"ב), so they join only
/// with letters on both sides — otherwise a closing quotation mark would glue
/// itself onto the word it closes. But an OPENING quotation mark also has a
/// letter on both sides when it follows a prefix: `ה"והגית` is the prefix ה plus
/// a quoted word, not an acronym. The discriminator is length — the tail of a
/// Hebrew acronym is almost always one or two letters (שו"ע, מהרש"א, נפק"מ,
/// חוה"מ), while a quotation opens a whole word.
///
/// A geresh is also an abbreviation marker at the END of a word (תוס', סי',
/// וגו'), so for it a preceding letter is enough — which the caller has already
/// established by being inside a token.
pub(crate) fn joins(c: char, rest: &str) -> bool {
    let tail = run_of_letters(rest);
    (is_gershayim(c) && (1..=2).contains(&tail)) || is_geresh(c)
}

// --------------------------------------------------------------- normalisation

/// Fold a word to the form the lexicon stores.
///
/// Two normalizations, both mandatory:
/// * **Strip Hebrew marks.** No Hebrew dictionary contains nikud; leaving it in
///   makes essentially every pointed word a miss.
/// * **Fold gershayim to ASCII.** Abbreviations are written with U+05F4 by a
///   Hebrew keyboard and with `"` by the source texts. Without this every single
///   abbreviation fails — which is most of a citation.
pub fn normalize(word: &str) -> String {
    word.chars()
        .filter(|c| !is_hebrew_mark(*c))
        .map(|c| match c {
            '\u{05F4}' | '\u{201C}' | '\u{201D}' => '"',
            '\u{05F3}' | '\u{2018}' | '\u{2019}' => '\'',
            other => other,
        })
        .collect()
}

/// Hebrew final letters map onto their medial forms for scoring only. Typing מ
/// where ם belongs is the commonest Hebrew typo, and it must rank as a near miss
/// rather than falling outside the edit budget.
fn fold_final(c: char) -> char {
    match c {
        'ך' => 'כ',
        'ם' => 'מ',
        'ן' => 'נ',
        'ף' => 'פ',
        'ץ' => 'צ',
        other => other,
    }
}

/// Does this word carry nikud?
///
/// Pointed text is not checkable against an unpointed lexicon, so the checker
/// skips it rather than flagging ~99% of a siddur.
pub fn is_pointed(word: &str) -> bool {
    word.chars().any(is_hebrew_mark)
}

/// Should this token be checked at all?
///
/// Everything exempted here is exempted because flagging it would be wrong, not
/// because it is hard: single letters are used as enumerators (א., ב.) and
/// gematria; a word carrying nikud cannot be validated; and a bare acronym of
/// one letter plus gershayim is a reference, not a word.
///
/// The old rule also threw out anything containing a digit or a Latin letter.
/// That is now the tokenizer's job and not this one's: a Hebrew run ends where a
/// Latin one starts, so a token arriving here cannot contain either.
pub fn should_check(word: &str) -> bool {
    if word.is_empty() || is_pointed(word) || is_hebrew_year(word) {
        return false;
    }
    word.chars().filter(|c| is_hebrew_letter(*c)).count() >= 2
}

/// A Hebrew year, written in letters: תשפ"ה, תש"פ, ה'תשפ"ה, תשע"ד.
///
/// Dates are written this way constantly and there is no dictionary of them —
/// every year is a new word. They are always correct by construction, so they
/// are exempt rather than flagged.
fn is_hebrew_year(word: &str) -> bool {
    let w = normalize(word);
    // Optional millennium marker (ה' / ה), then the year letters with gershayim
    // before the final letter.
    let body = w.strip_prefix("ה'").unwrap_or(&w);
    let letters: String = body.chars().filter(|c| is_hebrew_letter(*c)).collect();
    if letters.chars().count() < 3 || letters.chars().count() > 5 {
        return false;
    }
    // A year must carry gershayim (תשפ"ה) and start with the ת/ש of the current
    // and previous millennia, which is what every year in use looks like.
    body.chars().any(is_gershayim) && letters.starts_with(['ת', 'ש'])
}

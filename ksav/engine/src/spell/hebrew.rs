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
//! # The menu is ranked, and for a while it was not
//!
//! A one-edit lexicon returns candidates that are all, by construction, one edit
//! away — so distance separates none of them, and transposition separates only
//! the transposed ones. What was left underneath was **alphabetical order**, and
//! it showed: `הלכח` ranked `הלכה` twelfth, `ברכח` ranked `ברכה` thirteenth,
//! `שבתת` ranked `שבת` sixteenth, in a menu that shows five.
//!
//! Entries therefore carry a frequency band from the corpus the lexicon was
//! built from, and [`suggest_scored`](Lexicon::suggest_scored) adds it under the
//! transposition step so a common word can never beat a closer one. Measured on
//! four hundred substitution typos of the six thousand commonest words: first
//! place 20% → **55%**, in the menu 59% → **95%**. Re-measure any time with
//! `cargo run --release --example suggestrate`, which reports the same sample
//! against a lexicon with the bands stripped.
//!
//! # What it deliberately does not check
//!
//! **Pointed text.** The lexicon holds no nikud, and neither does any Hebrew
//! dictionary that exists: pointed and unpointed Hebrew are different spelling
//! systems. Checking pointed text against an unpointed lexicon flags ~99% of it.
//! So nikud is stripped before lookup, which means a *wrong vowel is invisible to
//! this checker* — it can never validate nikud, and it does not pretend to.

use super::{edit_distance, is_transposition, letter_mask, rank, ByLength, Dict, Learn};

/// The bundled Torah lexicon, generated from Public Domain texts.
const LEXICON: &str = include_str!("../../assets/lexicon-he.txt");
/// Hand-curated Talmudic vocabulary and the citation apparatus.
const SUPPLEMENT: &str = include_str!("../../assets/lexicon-he-supplement.txt");

/// A word carrying no frequency band. **Unranked, not rare** — that is most of
/// the lexicon, and none of it is being called uncommon.
const UNRANKED: u8 = (super::common::BANDS - 1) as u8;

/// The Hebrew words the checker accepts.
///
/// Bucketed by character length, each entry carrying the letter mask that lets
/// [`suggest_scored`](Lexicon::suggest_scored) dismiss it without allocating. One
/// copy of each word, exactly as a plain set held it — the length is the index
/// rather than something counted per lookup.
#[derive(Debug, Clone, Default)]
pub struct Lexicon {
    words: ByLength,
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

    /// The two bundled lists as text, in the order [`bundled`] adds them.
    ///
    /// Exposed for one caller and it earns its keep: `examples/suggestrate.rs`
    /// rebuilds the lexicon with the frequency bands stripped, so the value of
    /// the bands is measured against the same words rather than asserted. A
    /// claim about ranking that cannot be re-run is a claim that goes stale
    /// silently, which is how the 4%-useful menu shipped for a month.
    pub fn bundled_sources() -> [&'static str; 2] {
        [LEXICON, SUPPLEMENT]
    }

    /// Add words from a newline-separated list. `#` comments and blanks are
    /// ignored, and every entry is normalized the same way lookups are, so a
    /// list written with Hebrew gershayim still matches text typed with them.
    ///
    /// A line may carry an optional tab-separated **band** — `שבת\t0` — saying
    /// how common the word is in the corpus the lexicon was built from. It is
    /// optional because this is also the API for the writer's own dictionary and
    /// for a user-installed Hspell pack, neither of which has counts; a line
    /// without one is *unranked*, which is not the same as rare.
    pub fn add_words(&mut self, list: &str) {
        for line in list.lines() {
            let line = line.trim_end_matches(['\r', '\n']);
            if line.trim().is_empty() || line.trim_start().starts_with('#') {
                continue;
            }
            let (w, band) = match line.split_once('\t') {
                Some((w, b)) => (
                    w.trim(),
                    b.trim()
                        .parse::<u8>()
                        .ok()
                        .filter(|b| usize::from(*b) < super::common::BANDS)
                        .unwrap_or(UNRANKED),
                ),
                None => (line.trim(), UNRANKED),
            };
            if w.is_empty() {
                continue;
            }
            let word = normalize(w);
            // The mask is of the *folded* form, because that is what a suggestion
            // is scored against — ם and מ have to look like the same letter here
            // for the same reason they do in the distance.
            let folded: Vec<char> = word.chars().map(fold_final).collect();
            self.words
                .insert(&word, folded.len(), letter_mask(&folded), band);
        }
    }

    pub fn len(&self) -> usize {
        self.words.len()
    }

    pub fn is_empty(&self) -> bool {
        self.words.len() == 0
    }

    /// Is this exact form in the lexicon, before any prefix morphology?
    fn holds(&self, w: &str) -> bool {
        self.words.contains(w, w.chars().count())
    }

    pub fn contains(&self, word: &str) -> bool {
        let w = normalize(word);
        if self.holds(&w) {
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
            if self.words.contains(&rest, chars.len() - take) {
                return true;
            }
        }
        false
    }

    /// Words within one edit of `word`, best first — the "did you mean" list.
    ///
    /// Still an exhaustive comparison against everything that could possibly
    /// match; what changed is how much "everything" is. Only the three length
    /// buckets around the typed word are looked at, and within them a letter-mask
    /// test throws out the rest before any work is done. Same answers, in the
    /// order this has always produced them.
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
        let tmask = letter_mask(&tc);
        let mut fold = [' '; super::FOLD_BUF];
        let mut out = Vec::new();
        for (w, e) in self.words.near(tc.len()) {
            if (e.mask ^ tmask).count_ones() > 2 {
                continue;
            }
            let Some(cand) = super::fold_into(&mut fold, w.chars().map(fold_final)) else {
                continue; // longer than anything a suggestion could be one edit from
            };
            if let Some(d) = edit_distance(&tc, cand, 1) {
                // Distance, then transposition, then **how common the word is**.
                // The third term is the one that was missing, and it is the whole
                // difference between a menu and a list: every candidate here is
                // one edit away by construction, so distance separates none of
                // them, and what was left was alphabetical order. `הלכח` ranked
                // `הלכה` twelfth, `ברכח` ranked `ברכה` thirteenth, `שבתת` ranked
                // `שבת` sixteenth — and the menu shows five.
                //
                // It fits inside one edit's worth of scale (see `spell::rank`),
                // so a common word never beats a closer one and never beats a
                // transposition at the same distance. The cost of a wrong band is
                // one place; the cost of the wrong scale would be `שבת` offered
                // for `שבתו`.
                out.push((
                    rank(d, is_transposition(&tc, cand)) + usize::from(e.band),
                    w.to_string(),
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

// ---------------------------------------------------------------- the alphabet
//
// Every predicate below used to be written out here, and two of them were
// wrong in the same way.
//
// `is_hebrew_mark` was `'\u{0591}'..='\u{05C7}'` — the whole block, with
// nothing excluded. Four characters in that block are **punctuation that
// separates words**: maqaf ־ (a hyphen), paseq ׀, sof pasuq ׃ (a full stop) and
// nun hafukha ׆. Stripping them glues the words on either side together, so
// `אֶת־הַשָּׁמַיִם` arrived at the lexicon as the single token `אתהשמים` — and since
// `is_part` was built on the same predicate, the tokenizer never split there in
// the first place. Measured on the shipped release example:
//
//     כשכשכשכש-זזזזזז   (ASCII hyphen)   → 2 checkable words, 2 flagged
//     כשכשכשכש־זזזזזז   (maqaf U+05BE)   → 0 checkable words
//
// The checker checked the *wrong* spelling and silently refused the correct
// Hebrew typography. Sof pasuq ends every verse, so **every unpointed pasuk
// went unchecked** — and `tools/build_lexicon.py` had the same omission in
// Python, so the corpus absorbed the glue as vocabulary and the shipped
// dictionary carried `אתהשמים`, `ואתהארץ`, `יראתהשמים` and eighty-odd more as
// words.
//
// The correct rule was already **inside this binary**: `girsa-hebrew` resolved
// through `girsa-source` → `girsa-ref`, and nothing here referenced it. It is
// the same rule `sefarim.rs` names as existing three times, and the comment
// there says all three are held by one oracle — the speller was copy four and
// the lexicon builder copy five, both outside that fence, and both wrong.
//
// So the tables are gone and the crate is the authority. What stays local is
// Ksav's *placement* decisions, which are about spell-checking and not about
// Hebrew: which marks a token keeps (`joins`), where the final fold applies
// (scoring only — folding it into `normalize` would accept `שלומ`), and what is
// too short to be worth checking.
use girsa_hebrew::{is_geresh, is_gershayim, is_hebrew_letter, is_mark as is_hebrew_mark};

/// A character that is part of a Hebrew word on its own account, with no need to
/// look at what surrounds it.
///
/// Maqaf, paseq, sof pasuq and nun hafukha are **not** — they end the word and
/// begin the next one, which is the whole of the fix above.
pub(crate) fn is_part(c: char) -> bool {
    is_hebrew_letter(c) || is_hebrew_mark(c)
}

/// [`is_part`], for `tests/one_want.rs`.
///
/// Exported under a name that says what it means rather than what it is called
/// here, because the oracle's whole business is comparing this answer with four
/// other implementations' and the comparison should read as a sentence.
#[must_use]
pub fn is_part_of_a_word(c: char) -> bool {
    is_part(c)
}

/// The letters Hebrew attaches to the front of a word: ו (and), ה (the),
/// ב (in), כ (like), ל (to), מ (from), ש (that), ד (of, in Aramaic).
///
/// `ד` was missing, and this module's own English half already had it:
/// `english.rs` lists `"d"` and `spell_en.rs` asserts `d'rabbanan` passes. In
/// Hebrew, `דרבנן` and `דאורייתא` are on every page a bochur writes.
fn is_prefix_letter(c: char) -> bool {
    girsa_hebrew::PREFIX_LETTERS.contains(&c)
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
/// established by being inside a token. **With one exception:** the two curly
/// forms are a word processor's punctuation before they are anything else, and
/// text pasted from one closes its quotations with U+2019. A closing mark has no
/// letter after it by definition, so a curly form joins only mid-word — the same
/// rule the English side gives its apostrophe. The canonical spellings a Hebrew
/// keyboard types keep joining at the end of the word, because that is where an
/// abbreviation geresh lives and the lexicon stores them there.
pub(crate) fn joins(c: char, rest: &str) -> bool {
    let tail = run_of_letters(rest);
    if is_gershayim(c) {
        return (1..=2).contains(&tail);
    }
    if !is_geresh(c) {
        return false;
    }
    if matches!(c, '\u{2018}' | '\u{2019}') {
        return tail >= 1;
    }
    true
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
        .map(|c| girsa_hebrew::fold_quote_mark(c).unwrap_or(c))
        .collect()
}

/// Hebrew final letters map onto their medial forms **for scoring only**. Typing
/// מ where ם belongs is the commonest Hebrew typo, and it must rank as a near
/// miss rather than falling outside the edit budget.
///
/// Deliberately not folded into [`normalize`]: the lexicon stores the real
/// spelling, and folding at lookup time would make `שלומ` a word.
fn fold_final(c: char) -> char {
    girsa_hebrew::fold_final(c)
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
///
/// Two bounds keep this exemption from swallowing the rest of the acronym
/// apparatus, which it did for a while: a year's thousands digit is ת (400),
/// always — nothing in use begins with ש, and allowing it exempted שו"ס,
/// שב"ס and every other short ש-initial gershayim abbreviation; and the
/// gershayim sits before the units digit, one letter from the end, which is
/// where a date puts it and an arbitrary acronym does not.
fn is_hebrew_year(word: &str) -> bool {
    let w = normalize(word);
    // Optional millennium marker (ה' / ה), then the year letters with gershayim
    // before the final letter.
    let body = w.strip_prefix("ה'").unwrap_or(&w);
    let letters: String = body.chars().filter(|c| is_hebrew_letter(*c)).collect();
    if !(3..=4).contains(&letters.chars().count()) {
        return false;
    }
    // The thousands glyph, and the gershayim one letter from the end.
    if !letters.starts_with('ת') {
        return false;
    }
    match body.char_indices().find(|(_, c)| is_gershayim(*c)) {
        Some((p, _)) => body[p..].chars().filter(|c| is_hebrew_letter(*c)).count() == 1,
        None => false,
    }
}

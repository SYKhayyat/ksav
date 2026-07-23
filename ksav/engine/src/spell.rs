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
//! for modern Hebrew — `Lexicon::add_words` takes any word list — but nothing
//! AGPL is bundled.
//!
//! # What it deliberately does not check
//!
//! **Pointed text.** The lexicon holds no nikud, and neither does any Hebrew
//! dictionary that exists: pointed and unpointed Hebrew are different spelling
//! systems. Checking pointed text against an unpointed lexicon flags ~99% of it.
//! So nikud is stripped before lookup, which means a *wrong vowel is invisible to
//! this checker* — it can never validate nikud, and it does not pretend to.

use std::collections::HashSet;

/// The bundled Torah lexicon, generated from Public Domain texts.
const LEXICON: &str = include_str!("../assets/lexicon.txt");
/// Hand-curated Talmudic vocabulary and the citation apparatus.
const SUPPLEMENT: &str = include_str!("../assets/lexicon-supplement.txt");

/// One word the checker does not recognise, located in the original text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Misspelling {
    /// Byte offset of the word in the text that was checked.
    pub start: usize,
    /// Byte length of the word as it appears in the text.
    pub len: usize,
    /// The word itself, as written (nikud and all).
    pub word: String,
}

/// The words the checker accepts.
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
        let tc: Vec<char> = target.chars().collect();
        self.words
            .iter()
            .filter(|w| {
                let n = w.chars().count();
                n + 1 >= tc.len() && n <= tc.len() + 1
            })
            .filter_map(|w| edit_distance(&tc, w, 1).map(|d| (d, w.clone())))
            .collect()
    }
}

/// Anything that can answer "is this a word?" and "did you mean…?".
///
/// Exists so `check` works equally against the bundled lexicon and against a
/// lexicon layered with the writer's own dictionary, without either one needing
/// to be a copy of the other.
pub trait Dict {
    fn contains(&self, word: &str) -> bool;
    fn suggest(&self, word: &str, limit: usize) -> Vec<String>;
    fn len(&self) -> usize;
    fn is_empty(&self) -> bool {
        self.len() == 0
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

/// The bundled lexicon with the writer's own words layered on top.
///
/// The overlay is the point. `for_request` used to *clone* the whole
/// 269,385-entry lexicon the moment a writer had added a single word to their
/// dictionary — on every check, forever. Measured: 9 ms became 183 ms, a
/// twentyfold regression, and it applied to exactly the people engaged enough
/// with the feature to have taught it something. The shared lexicon is behind a
/// `OnceLock` precisely so it is built once; copying it per request threw that
/// away. Here the base is borrowed and only the handful of user words is owned.
pub struct Layered<'a> {
    base: &'a Lexicon,
    user: Lexicon,
}

impl<'a> Layered<'a> {
    pub fn new(base: &'a Lexicon, user_words: &str) -> Layered<'a> {
        let mut user = Lexicon::default();
        user.add_words(user_words);
        Layered { base, user }
    }
}

impl Dict for Layered<'_> {
    fn contains(&self, word: &str) -> bool {
        // The user's own list first: it is tiny, and a word they added is the
        // one most likely to be the reason this lookup is happening.
        self.user.contains(word) || self.base.contains(word)
    }

    fn suggest(&self, word: &str, limit: usize) -> Vec<String> {
        let mut scored = self.base.suggest_scored(word);
        scored.extend(self.user.suggest_scored(word));
        scored.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
        scored.dedup_by(|a, b| a.1 == b.1);
        scored.into_iter().take(limit).map(|(_, w)| w).collect()
    }

    fn len(&self) -> usize {
        self.base.len() + self.user.len()
    }
}

/// Hebrew combining marks: nikud, te'amim and the meteg/rafe family.
fn is_hebrew_mark(c: char) -> bool {
    matches!(c, '\u{0591}'..='\u{05C7}')
}

fn is_hebrew_letter(c: char) -> bool {
    matches!(c, '\u{05D0}'..='\u{05EA}')
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
/// gematria; anything with a digit or Latin letter is not Hebrew prose; a word
/// carrying nikud cannot be validated; and a bare acronym of one letter plus
/// gershayim is a reference, not a word.
pub fn should_check(word: &str) -> bool {
    if word.is_empty() || is_pointed(word) || is_hebrew_year(word) {
        return false;
    }
    let mut letters = 0usize;
    for c in word.chars() {
        if c.is_ascii_digit() || c.is_ascii_alphabetic() {
            return false;
        }
        if is_hebrew_letter(c) {
            letters += 1;
        }
    }
    letters >= 2
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

/// How many Hebrew letters begin `s`, ignoring the marks that hang off them.
fn run_of_letters(s: &str) -> usize {
    s.chars()
        .take_while(|c| is_hebrew_letter(*c) || is_hebrew_mark(*c))
        .filter(|c| is_hebrew_letter(*c))
        .count()
}

/// Split text into Hebrew word tokens with their byte offsets.
///
/// A token keeps its gershayim, because in Hebrew they are part of the word:
/// `שו"ע` and `תוס'` are single words, and splitting on the quote would produce
/// three nonsense fragments and three squiggles.
pub fn words(text: &str) -> Vec<(usize, &str)> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut start: Option<usize> = None;
    for (i, c) in text.char_indices() {
        // The two marks need different rules, because Hebrew uses them
        // differently.
        //
        // Gershayim sit BETWEEN letters in an acronym (שו"ע, ע"ב), so they join
        // only with letters on both sides — otherwise a closing quotation mark
        // would glue itself onto the word it closes. But an OPENING quotation
        // mark also has a letter on both sides when it follows a prefix:
        // `ה"והגית` is the prefix ה plus a quoted word, not an acronym. The
        // discriminator is length — the tail of a Hebrew acronym is almost
        // always one or two letters (שו"ע, מהרש"א, נפק"מ, חוה"מ), while a
        // quotation opens a whole word.
        //
        // A geresh is also an abbreviation marker at the END of a word (תוס',
        // סי', וגו'), so for it a preceding letter is enough.
        let tail = run_of_letters(&text[i + c.len_utf8()..]);
        let joins =
            start.is_some() && ((is_gershayim(c) && tail >= 1 && tail <= 2) || is_geresh(c));
        let part = is_hebrew_letter(c) || is_hebrew_mark(c) || joins;
        match (part, start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                out.push((s, &text[s..i]));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        out.push((s, &text[s..bytes.len()]));
    }
    out
}

/// Check a piece of text, returning every word the lexicon does not know.
pub fn check<D: Dict + ?Sized>(text: &str, lexicon: &D) -> Vec<Misspelling> {
    words(text)
        .into_iter()
        .filter(|(_, w)| should_check(w))
        .filter(|(_, w)| !lexicon.contains(w))
        .map(|(start, w)| Misspelling {
            start,
            len: w.len(),
            word: w.to_string(),
        })
        .collect()
}

/// Levenshtein distance between `a` (as chars) and `b`, or `None` above `max`.
///
/// Hebrew final letters are treated as the same letter as their medial form for
/// scoring, so a suggestion differing only in ם/מ ranks as a near miss — which
/// is exactly the mistake a typist makes.
fn edit_distance(a: &[char], b: &str, max: usize) -> Option<usize> {
    let b: Vec<char> = b.chars().map(fold_final).collect();
    let a: Vec<char> = a.iter().copied().map(fold_final).collect();
    if a.len().abs_diff(b.len()) > max {
        return None;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        let mut best = cur[0];
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
            best = best.min(cur[j]);
        }
        if best > max {
            return None; // no path through this row can come in under the cap
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    let d = prev[b.len()];
    (d <= max).then_some(d)
}

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

// ---------------------------------------------------------------- request API

use std::sync::OnceLock;

/// The bundled lexicon, parsed once.
///
/// A quarter of a million entries is not something to rebuild per keystroke, and
/// the editor checks on every pause in typing.
fn shared() -> &'static Lexicon {
    static SHARED: OnceLock<Lexicon> = OnceLock::new();
    SHARED.get_or_init(Lexicon::bundled)
}

/// A lexicon for one request: the bundled one plus the writer's own words.
///
/// The user dictionary is not a nicety. No lexicon can hold every chaburah's
/// terminology, every rebbe's name or a writer's own coinages, and a checker
/// that cannot be taught is one people switch off.
///
/// The shared lexicon is *borrowed*, never copied — see `Layered`.
fn for_request(user_words: &str) -> Layered<'static> {
    Layered::new(shared(), user_words)
}

/// JSON-in / JSON-out spell check, shared by the server, wasm and desktop.
///
/// Input: `{text, user_words?, suggest?}` — `suggest` asks for a suggestion list
/// per miss, which the editor only wants when a menu is actually being opened.
/// Output: `{misspellings: [{start, len, word, suggestions?}], lexicon_size}`.
pub fn spell_request(input_json: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(input_json).unwrap_or(serde_json::Value::Null);
    let text = v.get("text").and_then(|x| x.as_str()).unwrap_or("");
    let user_words = v.get("user_words").and_then(|x| x.as_str()).unwrap_or("");
    let want_suggestions = v.get("suggest").and_then(|x| x.as_bool()).unwrap_or(false);
    let limit = v.get("limit").and_then(|x| x.as_u64()).unwrap_or(5) as usize;

    let lexicon = for_request(user_words);
    let found: Vec<serde_json::Value> = check(text, &lexicon)
        .into_iter()
        .map(|m| {
            // Offsets go out as UTF-16 code units, not bytes.
            //
            // Every consumer of this API is a JavaScript editor, and JS string
            // indices — including CodeMirror's document positions — are UTF-16.
            // Hebrew is two bytes per letter in UTF-8 but one UTF-16 unit, so
            // handing over byte offsets puts every marker at roughly twice its
            // real position: the squiggles land past the end of the document and
            // silently vanish.
            let start = text[..m.start].encode_utf16().count();
            let len = m.word.encode_utf16().count();
            let mut o = serde_json::json!({
                "start": start,
                "len": len,
                "word": m.word,
            });
            if want_suggestions {
                o["suggestions"] = serde_json::json!(lexicon.suggest(&m.word, limit));
            }
            o
        })
        .collect();

    serde_json::json!({
        "misspellings": found,
        "lexicon_size": lexicon.len(),
    })
    .to_string()
}

/// JSON-in / JSON-out suggestions for a single word.
/// Input: `{word, user_words?, limit?}` → `{suggestions: [...]}`.
pub fn suggest_request(input_json: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(input_json).unwrap_or(serde_json::Value::Null);
    let word = v.get("word").and_then(|x| x.as_str()).unwrap_or("");
    let user_words = v.get("user_words").and_then(|x| x.as_str()).unwrap_or("");
    let limit = v.get("limit").and_then(|x| x.as_u64()).unwrap_or(6) as usize;
    let lexicon = for_request(user_words);
    serde_json::json!({ "suggestions": lexicon.suggest(word, limit) }).to_string()
}

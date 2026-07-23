//! Spell-checking, in the two languages Ksav sets.
//!
//! # Why there are two checkers and not one
//!
//! Ksav is Hebrew-first, but `dir: "ltr"` has always been a real setting and an
//! English document typesets correctly. Until this module grew its English half,
//! the checker skipped every token containing a Latin letter — so an English page
//! with three typos in it came back clean, the toggle still read as on, and
//! nothing in the interface said the text had never been looked at. A silence
//! that reads as a clean bill of health is worse than a missing feature.
//!
//! The two languages cannot share a checker, because almost nothing about them
//! is the same:
//!
//! | | Hebrew | English |
//! |---|---|---|
//! | morphology | prepositions glued to the front (ושה־) | inflections listed; case and possessives |
//! | case | none | significant, and asymmetric |
//! | what a word may contain | gershayim, geresh, nikud | apostrophes, accents |
//! | what is unverifiable | pointed text | nothing |
//! | why the general dictionary fails | doesn't know Torah Hebrew | doesn't know transliterated Hebrew |
//!
//! So each language gets its own lexicon and its own rules, in
//! [`hebrew`] and [`english`], and this module owns the two things they share:
//! the tokenizer that decides *which* checker a word belongs to, and the edit
//! distance behind "did you mean…?".
//!
//! # Dispatch is per word, not per document
//!
//! [`Checker`] picks a language from the token's own script rather than from the
//! document's `lang` setting, and that is deliberate. Ksav's documents are
//! routinely bilingual — an English sefer quoting a Gemara, a Hebrew ma'amar
//! citing an English source, a title page with both — and a document-level
//! choice would leave one of the two unchecked in exactly the writing this
//! product exists for. It also means the writer never has to tell it anything.
//!
//! A language with no lexicon loaded is `None` rather than an empty dictionary:
//! an empty dictionary flags every word, and "we do not check this script" and
//! "every word in this script is wrong" must not be the same state.

pub mod english;
pub mod hebrew;

// ------------------------------------------------------------------ languages

/// The languages this module can check, which is also the set of scripts the
/// tokenizer can tell apart.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    Hebrew,
    English,
}

impl Language {
    /// The ISO 639-1 code, as it goes out on the wire.
    pub fn code(self) -> &'static str {
        match self {
            Language::Hebrew => "he",
            Language::English => "en",
        }
    }
}

/// One word the checker does not recognise, located in the original text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Misspelling {
    /// Byte offset of the word in the text that was checked.
    pub start: usize,
    /// Byte length of the word as it appears in the text.
    pub len: usize,
    /// The word itself, as written (nikud, accents and all).
    pub word: String,
    /// Which checker flagged it — so the caller can say *which* dictionary a
    /// word would be taught to, and so a bilingual document's misses can be told
    /// apart when one language's lexicon is the one at fault.
    pub lang: Language,
}

// ---------------------------------------------------------------- dictionaries

/// Anything that can answer "is this a word?" and "did you mean…?".
///
/// Exists so the checker works equally against a bundled lexicon and against one
/// layered with the writer's own dictionary, without either needing to be a copy
/// of the other.
pub trait Dict {
    fn contains(&self, word: &str) -> bool;
    fn suggest(&self, word: &str, limit: usize) -> Vec<String>;
    fn len(&self) -> usize;
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// A dictionary that can be taught from a plain word list.
///
/// Separate from [`Dict`] because [`Layered`] needs to *build* the overlay, and
/// because the scored-candidate list has to be reachable to merge two rankings
/// rather than concatenate them — a user's own word that is a closer match than
/// anything bundled must come out on top, not underneath.
pub trait Learn: Dict + Default {
    /// Add words from a newline-separated list. `#` comments and blanks are
    /// ignored, and every entry is normalised the way lookups are.
    fn add_words(&mut self, list: &str);
    /// Candidates with their scores, unsorted. Lower is better.
    ///
    /// A score, not strictly an edit distance: English ranks a candidate that
    /// matches the typed word's capitalisation above one that does not, and both
    /// above anything a further edit away. The one number keeps [`Layered`]'s
    /// merge a plain sort.
    fn suggest_scored(&self, word: &str) -> Vec<(usize, String)>;
}

/// A bundled lexicon with the writer's own words layered on top.
///
/// The overlay is the point. `for_request` used to *clone* the whole
/// 269,385-entry Hebrew lexicon the moment a writer had added a single word to
/// their dictionary — on every check, forever. Measured: 9 ms became 183 ms, a
/// twentyfold regression, and it applied to exactly the people engaged enough
/// with the feature to have taught it something. The shared lexicons are behind
/// a `OnceLock` precisely so they are built once; copying one per request threw
/// that away. Here the base is borrowed and only the handful of user words is
/// owned.
pub struct Layered<'a, L> {
    base: &'a L,
    user: L,
}

impl<'a, L: Learn> Layered<'a, L> {
    pub fn new(base: &'a L, user_words: &str) -> Layered<'a, L> {
        let mut user = L::default();
        user.add_words(user_words);
        Layered { base, user }
    }
}

impl<L: Learn> Dict for Layered<'_, L> {
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

// ------------------------------------------------------------------ tokenizing

/// One word found in the text, and the language it is written in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Token<'a> {
    /// Byte offset in the text the token was found in.
    pub start: usize,
    /// The token exactly as written.
    pub text: &'a str,
    pub lang: Language,
    /// It is the head of a command call rather than a word: a `#` immediately
    /// precedes it (`#fnote`), or a bracket immediately follows it
    /// (`headcell[…]`, the bare form a call takes inside an argument list).
    pub command: bool,
}

impl Token<'_> {
    /// Should this token be checked at all, by its own language's rules?
    pub fn checkable(&self) -> bool {
        if self.command {
            return false;
        }
        match self.lang {
            Language::Hebrew => hebrew::should_check(self.text),
            Language::English => english::should_check(self.text),
        }
    }
}

/// Split text into word tokens, each tagged with the script it is written in.
///
/// A run of one script ends where the other begins, with no separator needed:
/// `שלוםhello` is two tokens, not one unusable mixture. That matters more than
/// it sounds, because the previous rule — "anything containing a Latin letter is
/// not Hebrew prose, skip it" — was the entire reason English went unchecked.
///
/// Digits bind to a Latin run rather than breaking it, so `ver2`, `MP3` and
/// `COVID` + `19` stay recognisable as identifiers and are exempted by
/// [`english::should_check`] instead of arriving as a bare `ver` to be flagged.
/// A Hebrew run breaks at a digit, which is the behaviour it has always had:
/// `פרק3` is a real word followed by a number.
///
/// A token that is the head of a command call — `#fnote`, or the bare
/// `headcell[…]` a call takes inside an argument list — is marked as such and
/// never checked. The editor already blanks markup before it asks (`spell.ts`,
/// which handles this properly, comments and nesting included), so this is not
/// what keeps `#הערה` out of the squiggles in the app. It is what makes the
/// engine's answer right on its own, for the tests and for anything embedding it
/// as a library: `#mktable` is not a misspelling of anything, and the Hebrew
/// commands only ever escaped notice because their names are Hebrew words.
pub fn words(text: &str) -> Vec<Token<'_>> {
    let mut out: Vec<Token<'_>> = Vec::new();
    let mut start: Option<(usize, Language)> = None;

    for (i, c) in text.char_indices() {
        let rest = &text[i + c.len_utf8()..];
        let kind = if hebrew::is_part(c) {
            Some(Language::Hebrew)
        } else if english::is_part(c) {
            Some(Language::English)
        } else {
            None
        };
        let (ends_here, begins) = match (kind, start) {
            // A letter of the language already being read.
            (Some(l), Some((_, cur))) if l == cur => (false, None),
            // A letter of the *other* language: the run ends here and the next
            // one begins, with no separator between them.
            (Some(l), _) => (true, Some(l)),
            // Not a letter of either. It may still be part of the word being
            // read — a geresh inside a Hebrew abbreviation, an apostrophe inside
            // an English contraction — but only ever of the run it is already in.
            (None, Some((_, cur))) => {
                let joins = match cur {
                    Language::Hebrew => hebrew::joins(c, rest),
                    Language::English => english::joins(c, rest),
                };
                (!joins, None)
            }
            (None, None) => (false, None),
        };
        if ends_here {
            if let Some((s, lang)) = start.take() {
                out.push(Token {
                    start: s,
                    text: &text[s..i],
                    lang,
                    command: is_command(text, s, i),
                });
            }
        }
        if let Some(l) = begins {
            start = Some((i, l));
        }
    }
    if let Some((s, lang)) = start {
        out.push(Token {
            start: s,
            text: &text[s..],
            lang,
            command: is_command(text, s, text.len()),
        });
    }
    out
}

/// Is the token at `start..end` the head of a command call rather than a word?
fn is_command(text: &str, start: usize, end: usize) -> bool {
    text[..start].ends_with('#') || text[end..].starts_with(['[', '('])
}

// -------------------------------------------------------------------- checking

/// The two-language checker.
///
/// Either language may be `None`, meaning "there is no lexicon for this script
/// here, so say nothing about it" — which is what the examples and the
/// Hebrew-only tests want, and is a different thing from an empty dictionary
/// that rejects everything.
pub struct Checker<'a> {
    hebrew: Option<&'a dyn Dict>,
    english: Option<&'a dyn Dict>,
}

impl<'a> Checker<'a> {
    pub fn new(hebrew: Option<&'a dyn Dict>, english: Option<&'a dyn Dict>) -> Checker<'a> {
        Checker { hebrew, english }
    }

    /// A checker that has an opinion about Hebrew and none about anything else.
    pub fn hebrew_only(hebrew: &'a dyn Dict) -> Checker<'a> {
        Checker {
            hebrew: Some(hebrew),
            english: None,
        }
    }

    fn dict(&self, lang: Language) -> Option<&'a dyn Dict> {
        match lang {
            Language::Hebrew => self.hebrew,
            Language::English => self.english,
        }
    }

    /// Every word in `text` that its own language's lexicon does not know.
    pub fn check(&self, text: &str) -> Vec<Misspelling> {
        words(text)
            .into_iter()
            .filter(|t| t.checkable())
            .filter_map(|t| {
                let dict = self.dict(t.lang)?;
                (!dict.contains(t.text)).then(|| Misspelling {
                    start: t.start,
                    len: t.text.len(),
                    word: t.text.to_string(),
                    lang: t.lang,
                })
            })
            .collect()
    }

    /// "Did you mean…?" for one word, from whichever lexicon owns its script.
    pub fn suggest(&self, word: &str, limit: usize) -> Vec<String> {
        self.language_of(word)
            .and_then(|l| self.dict(l))
            .map(|d| d.suggest(word, limit))
            .unwrap_or_default()
    }

    /// The language of a bare word, as the tokenizer would read it.
    pub fn language_of(&self, word: &str) -> Option<Language> {
        words(word).first().map(|t| t.lang)
    }

    /// Entries available, per language — what the interface shows when it says
    /// how much the checker knows.
    pub fn sizes(&self) -> (usize, usize) {
        (
            self.hebrew.map_or(0, |d| d.len()),
            self.english.map_or(0, |d| d.len()),
        )
    }
}

/// The writer's own words, split by the script each one is written in.
///
/// The user dictionary is a single flat list — the writer added words, not
/// words-with-a-language — so it has to be routed before it can be layered. A
/// word goes to the lexicon that would have been asked about it, which keeps an
/// English coinage from turning up as a suggestion for a Hebrew typo.
pub fn split_user_words(list: &str) -> (String, String) {
    let (mut he, mut en) = (String::new(), String::new());
    for line in list.lines() {
        let w = line.trim();
        if w.is_empty() || w.starts_with('#') {
            continue;
        }
        // The first token that is actually a word: `123` tokenizes (digits bind
        // to a Latin run so that `ver2` survives) but it is not English, and
        // filing it under a language would put a number in a dictionary.
        let lang = words(w)
            .iter()
            .find(|t| t.text.chars().any(char::is_alphabetic))
            .map(|t| t.lang);
        match lang {
            Some(Language::Hebrew) => {
                he.push_str(w);
                he.push('\n');
            }
            Some(Language::English) => {
                en.push_str(w);
                en.push('\n');
            }
            None => {}
        }
    }
    (he, en)
}

// --------------------------------------------------------------- edit distance

/// Is `b` `a` with one adjacent pair swapped?
///
/// Used to rank, not to match. Every candidate a lexicon offers is one edit
/// away, and with no frequency data behind them the only thing left to order
/// them by is alphabet — which is how `teh` came back as
/// `eh, meh, tea, tech, ted, tee, tel, ten` with `the` cut off the end of the
/// list. A transposition is a keystroke-*order* error: every letter the writer
/// intended is present, in the right multiset. That is far stronger evidence of
/// what they meant than a substitution, which could as easily be a different
/// word, so transpositions are offered first.
pub(crate) fn is_transposition(a: &[char], b: &[char]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut differing = a
        .iter()
        .zip(b.iter())
        .enumerate()
        .filter(|(_, (x, y))| x != y)
        .map(|(i, _)| i);
    match (differing.next(), differing.next(), differing.next()) {
        (Some(i), Some(j), None) => j == i + 1 && a[i] == b[j] && a[j] == b[i],
        _ => false,
    }
}

/// The rank of a one-edit candidate: distance first, transpositions ahead of
/// everything else at the same distance. Scaled so a language may add its own
/// tie-breaker underneath without ever outweighing either.
pub(crate) fn rank(distance: usize, transposed: bool) -> usize {
    4 * distance + if transposed { 0 } else { 2 }
}

/// Optimal string alignment distance between `a` and `b`, or `None` above `max`.
///
/// Levenshtein plus **transposition**, which is not an optional refinement: in
/// Levenshtein alone `teh` is two edits from `the` and would never be offered as
/// a suggestion for the commonest typo in English. Adjacent transposition is one
/// edit here, so it is.
///
/// Both sides arrive already folded by their own language — Hebrew maps final
/// letters onto their medial forms so that ם/מ ranks as a near miss, English
/// lowercases — because the fold is a property of the language and not of the
/// distance.
pub(crate) fn edit_distance(a: &[char], b: &[char], max: usize) -> Option<usize> {
    if a.len().abs_diff(b.len()) > max {
        return None;
    }
    // Three rows: the one before last is what makes a transposition a single
    // edit rather than a substitution followed by another.
    let mut prev2: Vec<usize> = vec![0; b.len() + 1];
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        let mut best = cur[0];
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            let mut d = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d = d.min(prev2[j - 2] + 1);
            }
            cur[j] = d;
            best = best.min(d);
        }
        if best > max {
            return None; // no path through this row can come in under the cap
        }
        std::mem::swap(&mut prev2, &mut prev);
        std::mem::swap(&mut prev, &mut cur);
    }
    let d = prev[b.len()];
    (d <= max).then_some(d)
}

// ---------------------------------------------------------------- request API

use std::sync::OnceLock;

/// The bundled Hebrew lexicon, parsed once.
///
/// A quarter of a million entries is not something to rebuild per keystroke, and
/// the editor checks on every pause in typing.
fn shared_hebrew() -> &'static hebrew::Lexicon {
    static SHARED: OnceLock<hebrew::Lexicon> = OnceLock::new();
    SHARED.get_or_init(hebrew::Lexicon::bundled)
}

/// The bundled English lexicon, parsed once. Same reasoning.
fn shared_english() -> &'static english::Lexicon {
    static SHARED: OnceLock<english::Lexicon> = OnceLock::new();
    SHARED.get_or_init(english::Lexicon::bundled)
}

/// Both bundled lexicons with the writer's own words layered over each.
///
/// The user dictionary is not a nicety. No lexicon can hold every chaburah's
/// terminology, every rebbe's name or a writer's own coinages, and a checker
/// that cannot be taught is one people switch off.
///
/// The shared lexicons are *borrowed*, never copied — see [`Layered`].
fn for_request(
    user_words: &str,
) -> (
    Layered<'static, hebrew::Lexicon>,
    Layered<'static, english::Lexicon>,
) {
    let (he, en) = split_user_words(user_words);
    (
        Layered::new(shared_hebrew(), &he),
        Layered::new(shared_english(), &en),
    )
}

/// JSON-in / JSON-out spell check, shared by the server, wasm and desktop.
///
/// Input: `{text, user_words?, suggest?}` — `suggest` asks for a suggestion list
/// per miss, which the editor only wants when a menu is actually being opened.
/// Output: `{misspellings: [{start, len, word, lang, suggestions?}],
/// lexicon_size, lexicon_sizes: {he, en}}`.
pub fn spell_request(input_json: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(input_json).unwrap_or(serde_json::Value::Null);
    let text = v.get("text").and_then(|x| x.as_str()).unwrap_or("");
    let user_words = v.get("user_words").and_then(|x| x.as_str()).unwrap_or("");
    let want_suggestions = v.get("suggest").and_then(|x| x.as_bool()).unwrap_or(false);
    let limit = v.get("limit").and_then(|x| x.as_u64()).unwrap_or(5) as usize;

    let (he, en) = for_request(user_words);
    let checker = Checker::new(Some(&he), Some(&en));
    let found: Vec<serde_json::Value> = checker
        .check(text)
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
                "lang": m.lang.code(),
            });
            if want_suggestions {
                o["suggestions"] = serde_json::json!(checker.suggest(&m.word, limit));
            }
            o
        })
        .collect();

    let (he_size, en_size) = checker.sizes();
    serde_json::json!({
        "misspellings": found,
        // Kept as the total for callers that only ever wanted "how much does it
        // know"; the split is what an interface needs to name the languages.
        "lexicon_size": he_size + en_size,
        "lexicon_sizes": { "he": he_size, "en": en_size },
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
    let (he, en) = for_request(user_words);
    let checker = Checker::new(Some(&he), Some(&en));
    serde_json::json!({ "suggestions": checker.suggest(word, limit) }).to_string()
}

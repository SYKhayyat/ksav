//! English spell-checking, and the tokenizer that decides a word is English.
//!
//! The Hebrew half is in `spell.rs`. What is tested here is everything that is
//! *different* about English — case, possessives, transliterated prefixes,
//! transposition — plus the two things that must hold across both: that a
//! bilingual sentence is checked in both languages, and that neither lexicon
//! answers for the other's words.
//!
//! The standing risk in an English checker is the opposite of the Hebrew one.
//! Hebrew's danger is under-acceptance: too small a lexicon and correct Torah
//! writing is covered in squiggles. English's is over-acceptance: a large word
//! list, a hand supplement and two morphological rules between them give a real
//! typo a great many places to hide, so `ordinary_typos_are_still_caught` is as
//! load-bearing as anything else in this file.

use ksav_engine::spell::{self, english, hebrew, Checker, Language};

fn en() -> english::Lexicon {
    english::Lexicon::bundled()
}

fn check(text: &str) -> Vec<spell::Misspelling> {
    let l = en();
    Checker::new(None, Some(&l)).check(text)
}

fn flagged(text: &str) -> Vec<String> {
    check(text).into_iter().map(|m| m.word).collect()
}

#[test]
fn the_bundled_lexicon_is_substantial() {
    let l = en();
    assert!(
        l.len() > 50_000,
        "the English lexicon has only {} entries — did the build run?",
        l.len()
    );
}

#[test]
fn ordinary_english_passes_cleanly() {
    let text = "The quick brown fox jumps over the lazy dog. It doesn't mind, \
                and neither do the dogs' owners, who recognise a well-known \
                phrase when they see one — even at 3 a.m. in a café.";
    assert!(
        flagged(text).is_empty(),
        "clean English was flagged: {:?}",
        flagged(text)
    );
}

#[test]
fn british_canadian_and_australian_spellings_are_all_english() {
    // A bochur in Gateshead writes "recognise" and one in Lakewood writes
    // "recognize". Flagging either is the checker having an opinion it was not
    // asked for; the word list carries every English-speaking spelling.
    for w in [
        "colour",
        "color",
        "recognise",
        "recognize",
        "theatre",
        "theater",
        "practise",
    ] {
        assert!(flagged(w).is_empty(), "{w:?} was flagged");
    }
}

#[test]
fn it_knows_the_words_a_general_english_dictionary_rejects() {
    // The English mirror of the Hspell problem. Every word here is correct,
    // common in the writing this product exists for, and absent from every
    // general English dictionary. Underline them and the checker is useless in
    // exactly the sentence someone wanted to write.
    let must_know = [
        "Shabbos",
        "Shabbat",
        "Shabbes",
        "daven",
        "davening",
        "bentching",
        "gemara",
        "mishnayos",
        "halacha",
        "halachos",
        "posek",
        "poskim",
        "paskens",
        "sefer",
        "seforim",
        "bochur",
        "bochurim",
        "chavrusa",
        "chaburah",
        "rebbe",
        "rebbetzin",
        "kollel",
        "yeshivos",
        "shiur",
        "sugya",
        "machlokes",
        "Rashi",
        "Rambam",
        "Ramban",
        "Tosafos",
        "Maharsha",
        "Acharonim",
        "Rishonim",
        "kashrus",
        "chometz",
        "shkiah",
        "zmanim",
        "minyan",
        "parsha",
        "posuk",
        "Tishrei",
        "Kislev",
        "Elul",
        "Sukkos",
        "Shavuos",
        "Chanukah",
    ];
    let l = en();
    let missing: Vec<&str> = must_know
        .iter()
        .copied()
        .filter(|w| !l.contains(w))
        .collect();
    assert!(
        missing.is_empty(),
        "English lexicon is missing: {missing:?}"
    );
}

#[test]
fn the_interfaces_own_english_is_not_underlined() {
    // The editor's welcome document and its own help text are the first English
    // a writer sees, and `Ctrl` — which the starter names twice — is not in any
    // English dictionary. Whatever else the checker gets wrong, it must not open
    // by underlining the product's own words.
    for w in [
        "Ksav",
        "Typst",
        "Ctrl",
        "Esc",
        "Cmd",
        "typesets",
        "CodeMirror",
    ] {
        assert!(flagged(w).is_empty(), "{w:?} was flagged");
    }
}

#[test]
fn neither_starter_document_opens_covered_in_squiggles() {
    // The templates have had this check since they were written; the two starter
    // documents did not, because they live in the editor rather than in the
    // registry — and the Hebrew one was quietly showing three squiggles on the
    // very first screen. The lexicon is built from Torah texts and from
    // pre-war literature, so it knew no word for "function" or "nesting".
    //
    // Reaching into `main.ts` for the two literals is not elegant. It is the
    // only way to hold text that has to exist before the engine has loaded, and
    // it fails loudly rather than silently if the literals move.
    let source = include_str!("../../app/src/main.ts");
    let he = hebrew::Lexicon::bundled();
    let english = en();
    let checker = Checker::new(Some(&he), Some(&english));
    for name in ["STARTER_HE", "STARTER_EN"] {
        let body = starter(source, name);
        let flagged: Vec<String> = checker.check(&body).into_iter().map(|m| m.word).collect();
        assert!(
            flagged.is_empty(),
            "{name} contains flagged words: {flagged:?}"
        );
    }
}

/// The body of a `const NAME = \`…\`;` template literal in the editor's source.
fn starter(source: &str, name: &str) -> String {
    let head = format!("const {name} = `");
    let start = source
        .find(&head)
        .unwrap_or_else(|| panic!("{name} is no longer declared the way this test looks for it"))
        + head.len();
    let len = source[start..]
        .find('`')
        .unwrap_or_else(|| panic!("{name} has no closing backtick"));
    source[start..start + len].to_string()
}

#[test]
fn a_real_misspelling_is_caught_and_located() {
    let text = "The Rambam writes that this is entirley a machlokes.";
    let found = check(text);
    let hit = found
        .iter()
        .find(|m| m.word == "entirley")
        .unwrap_or_else(|| panic!("the typo was not flagged; found {found:?}"));
    // The offset must index the ORIGINAL text, or the editor underlines the
    // wrong run of characters — which is worse than not underlining at all.
    assert_eq!(&text[hit.start..hit.start + hit.len], "entirley");
    assert_eq!(hit.lang, Language::English);
}

#[test]
fn ordinary_typos_are_still_caught() {
    // The over-acceptance guard. Between a 96,000-entry word list, a hand
    // supplement, possessive stripping and prefix stripping there is a lot of
    // surface for a typo to slip through; these are the commonest English
    // misspellings there are and every one of them must still be wrong.
    let typos = [
        "recieve",
        "seperate",
        "definately",
        "occured",
        "untill",
        "concious",
        "neccessary",
        "acheive",
        "beleive",
        "goverment",
        "publically",
        "wich",
    ];
    for t in typos {
        assert!(!flagged(t).is_empty(), "{t:?} was accepted as a word");
    }
}

// ── case ────────────────────────────────────────────────────────────────────

#[test]
fn a_lowercase_entry_accepts_every_capitalisation() {
    // `halacha` is in the supplement, written lowercase, because transliterated
    // words have no settled capitalisation convention and insisting on one would
    // underline a correct spelling over a style choice.
    for w in ["halacha", "Halacha", "HALACHA"] {
        assert!(flagged(w).is_empty(), "{w:?} was flagged");
    }
}

#[test]
fn a_capitalised_entry_does_not_accept_the_lowercase_form() {
    // The asymmetry is the whole reason case is stored at all. `Abimelech` comes
    // from the JPS 1917 corpus and is a proper noun there; `abimelech` is not a
    // word, and a checker that shrugged at it would be storing case for nothing.
    assert!(
        flagged("Abimelech").is_empty(),
        "the proper noun was flagged"
    );
    assert!(
        flagged("ABIMELECH").is_empty(),
        "the shouted proper noun was flagged"
    );
    assert_eq!(flagged("abimelech"), vec!["abimelech".to_string()]);
}

#[test]
fn a_short_all_caps_run_is_an_initialism_and_not_a_word() {
    // USA, IDF, PDF, ZIP — no dictionary lists them all, and underlining them is
    // the checker being wrong about something that is not prose. Four letters is
    // the ceiling, deliberately stricter than Word, which ignores every
    // uppercase word by default.
    for w in ["USA", "IDF", "ZIP", "OU"] {
        assert!(flagged(w).is_empty(), "{w:?} was flagged");
    }
    // …but a shouted heading is still a heading, and still checked.
    assert_eq!(flagged("MISSPELLLED"), vec!["MISSPELLLED".to_string()]);
}

#[test]
fn an_internal_capital_is_not_a_reason_to_flag_a_word() {
    // Publishers a citation points at are written mid-word-capitalised, and the
    // supplement lists them lowercase precisely so that every casing of them
    // passes — including the one on the spine of the sefer.
    for w in ["ArtScroll", "artscroll", "Feldheim", "HebrewBooks"] {
        assert!(flagged(w).is_empty(), "{w:?} was flagged");
    }
}

// ── morphology ──────────────────────────────────────────────────────────────

#[test]
fn a_possessive_is_not_a_new_word() {
    // ESDB lists `X's` only for the words it holds, so without this every proper
    // noun the corpus and the supplement contribute would be a miss the moment
    // someone wrote *about* it rather than named it.
    for w in ["Rashi's", "Abimelech's", "chavrusa's", "the Rambam's"] {
        assert!(flagged(w).is_empty(), "{w:?} was flagged");
    }
    // The curly apostrophe every word processor produces must fold to the ASCII
    // one the word lists use, or every possessive in a pasted paragraph is a
    // miss.
    assert!(
        flagged("Rashi\u{2019}s").is_empty(),
        "a curly apostrophe broke the possessive"
    );
    // A plural possessive keeps its trailing apostrophe outside the word.
    assert!(flagged("the bochurim' seforim").is_empty());
}

#[test]
fn a_transliterated_prefix_is_stripped() {
    // Hebrew glues its prepositions onto the front of a word and English Torah
    // writing carries that over with an apostrophe. The combinations are
    // open-ended, which is why this is a rule and not a list.
    for w in [
        "l'halacha",
        "b'gemara",
        "v'shabbos",
        "d'rabbanan",
        "d'oraisa",
        "L'Halacha",
    ] {
        assert!(
            flagged(w).is_empty(),
            "{w:?} was not recognised through its prefix"
        );
    }
}

#[test]
fn prefix_stripping_stays_bounded() {
    // The cost of prefix stripping is over-acceptance, and it has to stay
    // bounded the same way the Hebrew side's does: a real prefix letter, and a
    // stem long enough to be a word.
    assert!(!flagged("z'halacha").is_empty(), "z is not a prefix letter");
    assert!(!flagged("l'xyz").is_empty(), "a nonsense stem was accepted");
    assert!(
        !flagged("l'ha").is_empty(),
        "a two-letter stem was accepted"
    );
}

// ── suggestions ─────────────────────────────────────────────────────────────

#[test]
fn a_transposition_is_one_edit() {
    // In plain Levenshtein `teh` is two edits from `the` and would never be
    // offered — for the commonest typo in the language. Adjacent transposition
    // has to count as one edit or the suggestion list is worthless.
    let l = en();
    assert!(
        l.suggest("teh", 8).iter().any(|s| s == "the"),
        "no `the` for `teh`: {:?}",
        l.suggest("teh", 8)
    );
}

#[test]
fn suggestions_come_back_in_the_case_that_was_typed() {
    // Replacing `Teh` at the start of a sentence with `the` would fix the
    // spelling and break the sentence.
    let l = en();
    assert!(
        l.suggest("Teh", 8).iter().any(|s| s == "The"),
        "{:?}",
        l.suggest("Teh", 8)
    );
    assert!(
        l.suggest("TEH", 8).iter().any(|s| s == "THE"),
        "{:?}",
        l.suggest("TEH", 8)
    );
}

#[test]
fn a_suggestion_never_loses_a_proper_nouns_capital() {
    // The capital in `Shechem` is a fact about the word, not about how it was
    // typed, so it survives being suggested for a lowercase typo.
    let l = en();
    let s = l.suggest("shechemm", 8);
    assert!(s.iter().any(|w| w == "Shechem"), "{s:?}");
}

// ── the tokenizer, where the two languages meet ─────────────────────────────

#[test]
fn a_contraction_is_one_word_not_two() {
    let toks: Vec<&str> = spell::words("don't stop, it's Rashi's")
        .iter()
        .map(|t| t.text)
        .collect();
    assert!(toks.contains(&"don't"), "{toks:?}");
    assert!(toks.contains(&"it's"), "{toks:?}");
    assert!(toks.contains(&"Rashi's"), "{toks:?}");
}

#[test]
fn a_hyphenated_compound_is_checked_in_halves() {
    let toks: Vec<&str> = spell::words("well-known").iter().map(|t| t.text).collect();
    assert_eq!(toks, vec!["well", "known"]);
    assert!(flagged("well-known").is_empty());
    assert!(
        !flagged("well-knwon").is_empty(),
        "the misspelled half was not caught"
    );
}

#[test]
fn a_token_carrying_a_digit_is_not_prose() {
    // Binding digits to the run is what keeps `ver2` from arriving as a bare
    // `ver` to be underlined.
    for text in ["MP3", "ver2", "H2O", "1st", "COVID-19"] {
        assert!(
            flagged(text).is_empty(),
            "{text:?} produced squiggles: {:?}",
            flagged(text)
        );
    }
}

#[test]
fn gershayim_hold_an_english_abbreviation_together() {
    // English Torah writing keeps the Hebrew abbreviation mark even when the
    // letters around it are Latin. Splitting on it produces `zt` and a squiggle.
    let toks: Vec<&str> = spell::words("Reb Moshe zt\"l said")
        .iter()
        .map(|t| t.text)
        .collect();
    assert!(
        toks.contains(&"zt\"l"),
        "the abbreviation was split: {toks:?}"
    );
    for w in ["zt\"l", "shlit\"a", "a\"h", "hy\"d"] {
        assert!(flagged(w).is_empty(), "{w:?} was flagged");
    }
    // The curly form an editor produces folds to the same entry.
    assert!(
        flagged("zt\u{201D}l").is_empty(),
        "curly gershayim broke the lookup"
    );
    // …and an ordinary quotation is still punctuation, not part of the word.
    let quoted: Vec<&str> = spell::words("he said \"hello\" then")
        .iter()
        .map(|t| t.text)
        .collect();
    assert!(quoted.contains(&"hello"), "{quoted:?}");
    assert!(
        !quoted.iter().any(|w| w.contains('"')),
        "a quote glued on: {quoted:?}"
    );
}

#[test]
fn a_command_head_is_not_a_word() {
    // The editor blanks markup before it asks, so this is not what keeps
    // `#mktable` out of the squiggles in the app. It is what makes the engine
    // right on raw Ksav source, which is what the template tests and any library
    // embedder feed it. The Hebrew commands only ever escaped notice because
    // their names happen to be Hebrew words.
    assert!(
        flagged("#mktable(columns: 2)").is_empty(),
        "a command head was flagged"
    );
    assert!(
        flagged("headcell[Posek]").is_empty(),
        "a bare call head was flagged"
    );
    // A word is still a word when it is not a call.
    assert_eq!(flagged("entirley"), vec!["entirley".to_string()]);
}

#[test]
fn the_two_scripts_split_without_a_separator() {
    let toks = spell::words("שלוםhello");
    let pairs: Vec<(&str, Language)> = toks.iter().map(|t| (t.text, t.lang)).collect();
    assert_eq!(
        pairs,
        vec![("שלום", Language::Hebrew), ("hello", Language::English)]
    );
}

#[test]
fn a_bilingual_sentence_is_checked_in_both_languages() {
    // The reason dispatch is per word and not per document: Ksav's documents are
    // routinely bilingual, and a document-level choice would leave one half
    // unchecked in exactly the writing this product exists for.
    let he = hebrew::Lexicon::bundled();
    let en = en();
    let checker = Checker::new(Some(&he), Some(&en));
    let text = "The Rambam writes כשכשכשכש about this entirley.";
    let found = checker.check(text);
    let words: Vec<(&str, &str)> = found
        .iter()
        .map(|m| (m.word.as_str(), m.lang.code()))
        .collect();
    assert!(words.contains(&("כשכשכשכש", "he")), "{words:?}");
    assert!(words.contains(&("entirley", "en")), "{words:?}");
    assert_eq!(found.len(), 2, "something else was flagged too: {words:?}");
}

#[test]
fn neither_lexicon_answers_for_the_others_words() {
    // An English word must not be accepted because some Hebrew entry resembles
    // it, and vice versa. With one lexicon loaded and not the other, the missing
    // language is silent — not wrong.
    let he = hebrew::Lexicon::bundled();
    let hebrew_only = Checker::hebrew_only(&he);
    assert!(
        hebrew_only.check("entirley qwertyuiop").is_empty(),
        "a Hebrew-only checker had an opinion about English"
    );
    let l = en();
    let english_only = Checker::new(None, Some(&l));
    assert!(
        english_only.check("כשכשכשכש").is_empty(),
        "an English-only checker had an opinion about Hebrew"
    );
}

#[test]
fn the_writers_own_words_go_to_the_language_they_are_written_in() {
    let (he, en) = spell::split_user_words("קווצקוו\nGuttenberg\n# a comment\n\n123\n");
    assert_eq!(he.lines().collect::<Vec<_>>(), vec!["קווצקוו"]);
    assert_eq!(en.lines().collect::<Vec<_>>(), vec!["Guttenberg"]);
}

// ── the shipped files ───────────────────────────────────────────────────────

#[test]
fn the_supplement_carries_its_weight() {
    // A hand list quietly fills up with words that are already covered. Every
    // entry here has to be one the generated lexicon does not already accept, or
    // it is noise in a file whose whole value is that a person chose each line.
    let generated = {
        let mut l = english::Lexicon::empty();
        l.add_words(include_str!("../assets/lexicon-en.txt"));
        l
    };
    let redundant: Vec<&str> = include_str!("../assets/lexicon-en-supplement.txt")
        .lines()
        .map(str::trim)
        .filter(|w| !w.is_empty() && !w.starts_with('#'))
        .filter(|w| generated.contains(w))
        .collect();
    assert!(
        redundant.is_empty(),
        "the supplement lists words the generated lexicon already knows: {redundant:?}"
    );
}

#[test]
fn the_supplement_is_written_in_lowercase() {
    // Stated as a rule in the file's own header, and enforced here: a capitalised
    // entry would reject the lowercase form, and there is no agreed
    // capitalisation for a transliterated word to reject it in favour of.
    let wrong: Vec<&str> = include_str!("../assets/lexicon-en-supplement.txt")
        .lines()
        .map(str::trim)
        .filter(|w| !w.is_empty() && !w.starts_with('#'))
        .filter(|w| *w != w.to_lowercase())
        .collect();
    assert!(
        wrong.is_empty(),
        "supplement entries carry a capital: {wrong:?}"
    );
}

#[test]
fn the_generated_lexicon_carries_the_licence_it_has_to() {
    // ESDB's licence is permissive but it does require its notice to travel with
    // any word list derived from it, and this word list is compiled into every
    // binary and every wasm module Ksav ships. The notice lives in the file's own
    // header so that it cannot be separated from the data by a build step.
    let head = include_str!("../assets/lexicon-en.txt");
    assert!(
        head.contains("Copyright 2000-2026 by Kevin Atkinson"),
        "the ESDB copyright notice is not in the generated lexicon"
    );
    assert!(
        head.contains("Permission to use, copy, modify, distribute, and sell"),
        "the ESDB permission notice is not in the generated lexicon"
    );
}

// ── the request API ─────────────────────────────────────────────────────────

#[test]
fn a_request_reports_which_language_flagged_a_word() {
    let req = serde_json::json!({
        "text": "The Rambam writes כשכשכשכש about this entirley.",
        "suggest": false,
    })
    .to_string();
    let out: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request(&req)).expect("json");
    let misses = out["misspellings"].as_array().unwrap();
    let pairs: Vec<(&str, &str)> = misses
        .iter()
        .map(|m| (m["word"].as_str().unwrap(), m["lang"].as_str().unwrap()))
        .collect();
    assert!(pairs.contains(&("כשכשכשכש", "he")), "{pairs:?}");
    assert!(pairs.contains(&("entirley", "en")), "{pairs:?}");
}

#[test]
fn a_request_reports_both_lexicon_sizes() {
    // The interface says which languages it checks; it can only say so honestly
    // if the engine tells it what it actually loaded.
    let out: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request("{\"text\":\"\"}")).unwrap();
    let he = out["lexicon_sizes"]["he"].as_u64().unwrap();
    let en = out["lexicon_sizes"]["en"].as_u64().unwrap();
    assert!(he > 30_000, "Hebrew lexicon reported as {he}");
    assert!(en > 50_000, "English lexicon reported as {en}");
    assert_eq!(out["lexicon_size"].as_u64().unwrap(), he + en);
}

#[test]
fn english_offsets_are_utf16_units_not_bytes() {
    // Same trap as the Hebrew side, and worse here: an English miss *after* a run
    // of Hebrew has a byte offset that is nearly twice its UTF-16 one.
    let text = "כתב הרמב\"ם that this is entirley so";
    let req = serde_json::json!({ "text": text }).to_string();
    let out: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request(&req)).unwrap();
    let m = &out["misspellings"][0];
    let start = m["start"].as_u64().unwrap() as usize;
    let len = m["len"].as_u64().unwrap() as usize;
    let utf16: Vec<u16> = text.encode_utf16().collect();
    assert_eq!(
        String::from_utf16(&utf16[start..start + len]).unwrap(),
        "entirley"
    );
}

#[test]
fn a_request_can_teach_the_english_checker_a_word() {
    let text = "My chavrusa is Guttenmacher.";
    let plain = serde_json::json!({ "text": text }).to_string();
    let taught = serde_json::json!({ "text": text, "user_words": "Guttenmacher" }).to_string();
    let a: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request(&plain)).unwrap();
    let b: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request(&taught)).unwrap();
    assert_eq!(a["misspellings"].as_array().unwrap().len(), 1);
    assert_eq!(
        b["misspellings"].as_array().unwrap().len(),
        0,
        "the writer's own word was still flagged"
    );
}

// ── B29: how common a word is, as the tie-breaker ────────────────────────────
//
// > *"The English lexicon has no frequency data. Suggestions rank by edit type
// > and case."*
//
// The order suggests proving the gain with `cargo run --example spellrate`. That
// harness measures the **miss rate** — how many words of a text are not in the
// lexicon — and frequency data does not change it by one word. So the gain is
// measured here instead, on what actually changed: whether the word a writer
// meant is the first thing offered.

/// Every one of these is a real typo whose correction is one edit away and is
/// **not** the alphabetically first candidate. Before B29 the list was ordered by
/// whatever order the lexicon was in.
///
/// `ot` is deliberately **not** here, and it is the interesting case: the lexicon
/// holds `OT`, which lowercased *is* what was typed — distance 0 — so it is
/// offered ahead of `to` at distance 1. That is the distance rule working, not
/// failing. Frequency is a tie-breaker among candidates at the same distance and
/// it is not entitled to overrule one; a writer who typed `ot` may well have meant
/// `OT`, and the list still offers `to` second.
const MEANT: &[(&str, &str)] = &[
    ("teh", "the"),
    ("hte", "the"),
    ("adn", "and"),
    ("nad", "and"),
    ("fo", "of"),
    ("thier", "their"),
    ("wrods", "words"),
    ("liek", "like"),
    ("jsut", "just"),
    ("owrk", "work"),
    ("tiem", "time"),
];

/// The typos frequency actually decides: a **substitution**, where no candidate
/// is a transposition and several are one edit away, so the only thing that can
/// separate them is how likely the word is. These are the ones the transposition
/// rule cannot help with, and they are most of what a keyboard produces.
///
/// Measured: 4 of these 10 came first before B29, 9 after.
///
/// `amd` is the tenth and it is **not fixed**, deliberately. `mad` is a
/// transposition of `amd` and `and` is only a substitution, so the transposition
/// rule puts `mad` first — and in practice `amd` is nearly always `and`. Making
/// frequency win here would mean widening the bands past the two-edit advantage a
/// transposition carries, which is the invariant that stops `the` being offered as
/// the correction for `then`. One misordered suggestion is the cheaper mistake, and
/// `and` is still second.
const SUBSTITUTED: &[(&str, &str)] = &[
    ("tje", "the"),
    ("tge", "the"),
    ("fpr", "for"),
    ("snd", "and"),
    ("wjth", "with"),
    ("thst", "that"),
    ("hsve", "have"),
    ("wornd", "word"),
    ("ppint", "point"),
];

#[test]
fn the_word_a_writer_meant_is_the_first_thing_offered() {
    let l = ksav_engine::spell::english::Lexicon::bundled();
    let mut first = 0;
    let mut missing = Vec::new();
    for (typed, meant) in MEANT {
        let offered = l.suggest(typed, 8);
        match offered.first() {
            Some(top) if top == meant => first += 1,
            _ => missing.push((typed, meant, offered)),
        }
    }
    assert!(
        missing.is_empty(),
        "{first}/{} first; not first: {missing:?}",
        MEANT.len()
    );
}

#[test]
fn a_substituted_letter_is_corrected_to_the_likelier_word() {
    // The dimension frequency governs. Measured: with the band switched off,
    // eleven of the twelve transposed typos above already came first — the
    // transposition rule was doing that work. These are the ones it cannot do.
    let l = ksav_engine::spell::english::Lexicon::bundled();
    let mut missing = Vec::new();
    for (typed, meant) in SUBSTITUTED {
        let offered = l.suggest(typed, 8);
        if offered.first().map(String::as_str) != Some(*meant) {
            missing.push((typed, meant, offered));
        }
    }
    assert!(
        missing.is_empty(),
        "{}/{} first; not first: {missing:?}",
        SUBSTITUTED.len() - missing.len(),
        SUBSTITUTED.len()
    );
}

#[test]
fn a_common_word_never_beats_a_closer_one() {
    // The safety property, and the reason the bands are scaled the way they are.
    // `then` is a word; `the` is a commoner word one edit from it. Offering `the`
    // as the correction for a correctly spelled `then` — or ahead of `hen` for
    // `hten` — would be the tie-breaker outweighing distance.
    let l = ksav_engine::spell::english::Lexicon::bundled();
    assert!(
        l.contains("then"),
        "the premise of this test is that `then` is spelled correctly"
    );
    // `hten` is one transposition from `then` and two edits from `the`.
    let offered = l.suggest("hten", 8);
    assert_eq!(
        offered.first().map(String::as_str),
        Some("then"),
        "a commoner word outranked a nearer one: {offered:?}"
    );
}

#[test]
fn a_transposition_still_beats_a_substitution_however_common() {
    // The order the ranks are in: distance, then transposition, then frequency.
    // `adn` transposes to `and`; `an` is commoner still and is a deletion away.
    let l = ksav_engine::spell::english::Lexicon::bundled();
    let offered = l.suggest("adn", 8);
    assert_eq!(
        offered.first().map(String::as_str),
        Some("and"),
        "{offered:?}"
    );
}

#[test]
fn a_proper_noun_is_still_offered_and_still_ranked_below() {
    // The penalty B29 sits beside, unchanged: a capitalised entry offered for a
    // plainly lowercase word costs half an edit — near enough to stay on the
    // list, far enough not to crowd out the word the writer meant.
    let l = ksav_engine::spell::english::Lexicon::bundled();
    let offered = l.suggest("teh", 12);
    assert_eq!(offered.first().map(String::as_str), Some("the"));
    assert!(
        offered.len() > 1,
        "the other candidates were dropped, not demoted: {offered:?}"
    );
}

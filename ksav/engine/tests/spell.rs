//! Spell-checker behaviour, including the Hebrew-specific traps.
//!
//! The numbers quoted here are the measured miss rates of the *general* Hebrew
//! dictionary (Hspell / Hunspell he_IL) on the same kinds of text — the reason
//! Ksav has its own lexicon at all. See `src/spell/hebrew.rs`.
//!
//! The English half lives in `spell_en.rs`, and the tokenizer that decides which
//! of the two a word belongs to is tested in both.

use ksav_engine::spell::{self, hebrew::Lexicon, measure, Checker};

fn bundled() -> Lexicon {
    Lexicon::bundled()
}

#[test]
fn the_bundled_lexicon_is_substantial() {
    let l = bundled();
    assert!(
        l.len() > 30_000,
        "the lexicon has only {} entries — did the build run?",
        l.len()
    );
}

#[test]
fn it_knows_the_words_a_general_hebrew_dictionary_rejects() {
    // Every word here was measured as REJECTED by Hunspell he_IL. They are the
    // reason a general dictionary is unusable for Torah writing: each one is
    // correct, common, and would be underlined.
    let l = bundled();
    let must_know = [
        // Talmudic vocabulary and Aramaic
        "דלא",
        "אמרינן",
        "איתא",
        "כדאיתא",
        "מתניתין",
        "אביי",
        "סוגיא",
        "ברייתא",
        "תנא",
        "מיגו",
        "חבירו",
        "נוהגין",
        "מתפללין",
        "ליקח",
        // masechtos
        "עירובין",
        "כתובות",
        "גיטין",
        "סנהדרין",
        // the citation apparatus — the part that fails hardest elsewhere
        "ע\"א",
        "ע\"ב",
        "ב\"ב",
        "ב\"ק",
        "ב\"מ",
        "שו\"ע",
        "רשב\"א",
        "ריטב\"א",
        "מהרש\"א",
        "עיי\"ש",
        "ודו\"ק",
        "וצ\"ע",
        "צ\"ע",
        "ר\"ל",
        "נפק\"מ",
        "תוס'",
        "סי'",
        "וגו'",
    ];
    let missing: Vec<&str> = must_know
        .iter()
        .copied()
        .filter(|w| !l.contains(w))
        .collect();
    assert!(missing.is_empty(), "lexicon is missing: {missing:?}");
}

#[test]
fn gershayim_match_whichever_way_they_were_typed() {
    // A Hebrew keyboard produces U+05F4; the source texts use ASCII. If these do
    // not fold together, every single abbreviation is flagged — which measurably
    // took Shulchan Arukh from 9.5% to 13.4% missed words elsewhere.
    let l = bundled();
    assert!(l.contains("שו\"ע"), "ASCII gershayim not found");
    assert!(
        l.contains("שו\u{05F4}ע"),
        "Hebrew gershayim did not fold to ASCII"
    );
    assert!(l.contains("תוס'"), "ASCII geresh not found");
    assert!(
        l.contains("תוס\u{05F3}"),
        "Hebrew geresh did not fold to ASCII"
    );
}

#[test]
fn pointed_text_is_never_flagged() {
    // No Hebrew dictionary contains nikud, so checking pointed text against one
    // flags ~99% of it. Ksav's siddur and bentcher templates are pointed
    // throughout; the honest behaviour is to say nothing about them.
    let siddur = "מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בְּעַרְבִית מִשָּׁעָה שֶׁהַכֹּהֲנִים נִכְנָסִים";
    let found = Checker::hebrew_only(&bundled()).check(siddur);
    assert!(
        found.is_empty(),
        "pointed text produced {} squiggles: {:?}",
        found.len(),
        found.iter().map(|m| &m.word).collect::<Vec<_>>()
    );
}

#[test]
fn a_real_misspelling_is_caught_and_located() {
    let l = bundled();
    let text = "כתב הרמב\"ם בהלכות תפילה כשכשכשכש וכן פסק המחבר";
    let found = Checker::hebrew_only(&l).check(text);
    let hit = found
        .iter()
        .find(|m| m.word == "כשכשכשכש")
        .unwrap_or_else(|| panic!("the nonsense word was not flagged; found {found:?}"));
    // The offset must index the ORIGINAL text, or the editor underlines the
    // wrong run of characters — which is worse than not underlining at all.
    assert_eq!(&text[hit.start..hit.start + hit.len], "כשכשכשכש");
}

#[test]
fn torah_hebrew_passes_cleanly() {
    // The whole point of owning the lexicon: a sentence of ordinary Torah
    // writing, of the kind a general Hebrew dictionary flags heavily, must come
    // through with nothing underlined.
    let l = bundled();
    let text = "כתב הרמב\"ם דלא אמרינן הכי אלא היכא דאיתא בגמרא, \
                ועיין תוס' ב\"ק ע\"א ד\"ה והא, וצ\"ע.";
    let found = Checker::hebrew_only(&l).check(text);
    assert!(
        found.is_empty(),
        "Torah Hebrew produced squiggles: {:?}",
        found.iter().map(|m| &m.word).collect::<Vec<_>>()
    );
}

#[test]
fn structural_tokens_are_left_alone() {
    let l = bundled();
    // Single letters (enumerators, gematria), digits, and — for a checker with
    // no English lexicon loaded — Latin. `Checker::hebrew_only` is the point of
    // that last one: "there is no dictionary for this script" and "every word in
    // this script is wrong" must not be the same state.
    for text in ["א. ב. ג.", "פרק 3", "Typst", "ver2", "5773"] {
        let found = Checker::hebrew_only(&l).check(text);
        assert!(found.is_empty(), "{text:?} produced squiggles: {found:?}");
    }
}

#[test]
fn an_abbreviation_is_one_word_not_three() {
    // Splitting on the quote would turn שו"ע into שו + ע and underline both.
    let toks = spell::words("כתב שו\"ע וכן תוס' שם");
    let found: Vec<&str> = toks.iter().map(|t| t.text).collect();
    assert!(
        found.contains(&"שו\"ע"),
        "abbreviation was split: {found:?}"
    );
    assert!(found.contains(&"תוס'"), "geresh word was split: {found:?}");
}

#[test]
fn an_opening_quote_does_not_glue_to_the_next_word() {
    // A quotation mark before a word is punctuation, not part of it.
    let toks = spell::words("אמר \"שלום\" לחבירו");
    let found: Vec<&str> = toks.iter().map(|t| t.text).collect();
    assert!(found.contains(&"שלום"), "got {found:?}");
    assert!(
        !found.iter().any(|w| w.starts_with('"')),
        "a quote glued on: {found:?}"
    );
}

#[test]
fn suggestions_are_offered_for_a_near_miss() {
    let l = bundled();
    // One letter dropped from a word the lexicon certainly knows.
    let suggestions = l.suggest("שבתת", 5);
    assert!(
        !suggestions.is_empty(),
        "no suggestions for a one-edit typo"
    );
}

// ------------------------------------------------------------------- ordering
//
// **The assertion above is why this section exists.** `!is_empty()` was the only
// thing either Hebrew suggestion test claimed, and it cannot fail for the thing
// that was wrong: the menu did contain suggestions, and the word the writer
// meant was sixteenth in it. Measured across four hundred substitution typos of
// the six thousand commonest words in the corpus, the intended word came first
// **20% of the time** and reached the five-item menu **59%** of the time.
//
// Every candidate a one-edit lexicon returns is one edit away by construction,
// so distance separates none of them and transposition separates only the
// transposed ones. What was left as the tie-breaker was alphabetical order.
// English had a frequency layer and five tests of it; Hebrew — the language this
// product is for — had neither. These are those five tests, in Hebrew, plus the
// two safety properties that say what the ranking must *not* do.
//
// The band data is not invented. It is the corpus counts `build_lexicon.py`
// computes and used to throw away, over the very texts the lexicon is built
// from. Re-measure with `cargo run --release --example suggestrate`, which
// rebuilds the lexicon with the bands stripped and reports both columns.

/// The floors, well under what is measured, because this is a regression fence
/// and not a target. Measured at the time of writing, on four hundred cases:
/// **55.2% first and 94.8% in the menu**, against 20.2% / 59.0% with the bands
/// stripped. A drop back through these numbers means the generated lexicon lost
/// its bands or the ranking stopped reading them.
const FLOOR_TOP1: f64 = 45.0;
const FLOOR_TOP5: f64 = 88.0;

/// The number the fence is really about: what the same sample scored before.
const BEFORE_TOP1: f64 = 25.0;

#[test]
fn the_hebrew_word_a_writer_meant_leads_the_menu() {
    // A floor over a deterministic sample, not a hand-picked list of pairs.
    //
    // The hand-picked list was written first and it was the wrong instrument.
    // Half of its "typos" turned out to be transpositions of *other* real words
    // — `הלכח` transposes to `הכלח` — which the ranking prefers deliberately and
    // correctly, so the test was asserting against the design rather than
    // against the bug. Cherry-picking pairs that pass is then indistinguishable
    // from cherry-picking pairs that flatter, which is how a suite ends up
    // agreeing with itself.
    let l = bundled();
    let cases = measure::substitution_typos(measure::COMMON_BANDS, 400, measure::SEED);
    assert_eq!(
        cases.len(),
        400,
        "the sample did not fill — is the lexicon banded?"
    );
    let rate = measure::Rate::of(&measure::places(&l, &cases));
    assert!(
        rate.top1_pct() >= FLOOR_TOP1 && rate.top5_pct() >= FLOOR_TOP5,
        "the menu regressed: {rate} (floors {FLOOR_TOP1}% / {FLOOR_TOP5}%)"
    );
}

#[test]
fn the_bands_are_what_is_doing_it() {
    // The other half, and the one that makes the test above mean something. A
    // floor alone would still pass if the bands were ignored and the lexicon
    // simply got smaller — so the same sample is scored against the same words
    // with the bands stripped, and that column has to be markedly worse.
    //
    // This is the assertion the original `!suggestions.is_empty()` should have
    // been: it fails if the thing under test stops working, rather than if the
    // thing under test disappears.
    let cases = measure::substitution_typos(measure::COMMON_BANDS, 400, measure::SEED);
    let with = measure::places(&bundled(), &cases);
    let without = measure::places(&measure::without_bands(), &cases);
    let (a, b) = (measure::Rate::of(&with), measure::Rate::of(&without));
    assert!(
        b.top1_pct() < BEFORE_TOP1,
        "the unbanded column scored {b}, which is better than the ranking it replaced — \
         the bands are probably not being stripped"
    );
    assert!(
        a.top1_pct() > b.top1_pct() * 2.0,
        "banded {a} vs unbanded {b}: the bands stopped earning their place"
    );
    let regressed = with.iter().zip(&without).filter(|(x, y)| x > y).count();
    // Some cases do get worse — a tie-breaker moves ties in both directions —
    // and the honest fence is that it is a small minority, not zero.
    assert!(
        regressed * 10 < cases.len(),
        "{regressed} of {} cases rank *lower* with the bands",
        cases.len()
    );
}

#[test]
fn a_common_hebrew_word_never_beats_a_closer_one() {
    // The safety property, and the reason the bands are scaled the way they are.
    // A frequency tie-breaker that could reach into the next distance would
    // offer שבת as the correction for a correctly spelled שבתות, which is worse
    // than offering nothing at all.
    let mut l = Lexicon::empty();
    // שבת banded commonest, שבתות unranked. The typed word is one substitution
    // from שבתות and two edits from שבת, so distance must decide and the band
    // must not be able to reach across it.
    l.add_words("שבת\t0\nשבתות");
    let offered = l.suggest("שבתזת", 8);
    assert_eq!(
        offered.first().map(String::as_str),
        Some("שבתות"),
        "a commoner word outranked a nearer one: {offered:?}"
    );
}

#[test]
fn a_hebrew_transposition_still_beats_a_substitution_however_common() {
    // The order the ranks are in: distance, then transposition, then frequency.
    // `ארמ` transposes to `אמר` and substitutes to `ארץ`; the transposition wins
    // even with the substitution banded commonest and the transposition
    // unranked, which is the strongest form of the claim.
    let mut l = Lexicon::empty();
    l.add_words("ארץ\t0\nאמר");
    let offered = l.suggest("ארמ", 8);
    assert_eq!(
        offered.first().map(String::as_str),
        Some("אמר"),
        "{offered:?}"
    );
}

#[test]
fn a_band_demotes_a_candidate_and_never_drops_it() {
    // The same claim English makes: the other candidates are demoted, not
    // removed. A ranking that shortened the menu would trade one failure for
    // another, and the writer who meant the rare word would have no way back.
    let mut l = Lexicon::empty();
    l.add_words("שבת\t0\nשבח\nשבס");
    let offered = l.suggest("שבב", 12);
    assert_eq!(offered.first().map(String::as_str), Some("שבת"));
    assert_eq!(
        offered.len(),
        3,
        "the demoted candidates were dropped instead: {offered:?}"
    );
}

#[test]
fn a_word_with_no_band_is_unranked_and_not_rare() {
    // Most of the lexicon carries no band, and none of it is being called
    // uncommon: an unbanded word sorts after every banded one and before
    // nothing. This is also the contract for the writer's own dictionary and for
    // a user-installed Hspell pack, neither of which has counts.
    let mut l = Lexicon::empty();
    l.add_words("כתב\nכתד\t0");
    assert_eq!(l.suggest("כתת", 4).first().map(String::as_str), Some("כתד"));
    assert!(
        l.suggest("כתת", 4).contains(&"כתב".to_string()),
        "an unbanded word fell off the list"
    );
}

#[test]
fn the_supplement_cannot_demote_a_word_the_corpus_ranked() {
    // `add_words` is called twice — the generated lexicon, then the hand-curated
    // supplement — and the supplement carries no bands. A plain overwrite would
    // have silently unranked every word both files know, which is precisely the
    // everyday citation apparatus the supplement exists for.
    let mut l = Lexicon::empty();
    l.add_words("שבת\t0");
    l.add_words("שבת"); // the supplement, with no band
    l.add_words("שבח");
    assert_eq!(
        l.suggest("שבב", 4).first().map(String::as_str),
        Some("שבת"),
        "the supplement demoted a word the corpus had ranked"
    );
}

#[test]
fn the_bundled_lexicon_actually_carries_bands() {
    // The fence for the generated asset. Every assertion above would still pass
    // against a lexicon whose bands were all missing, because they build their
    // own — so one of them has to check that the shipped file was regenerated.
    let banded = Lexicon::bundled_sources()
        .iter()
        .flat_map(|s| s.lines())
        .filter(|l| !l.starts_with('#') && l.contains('\t'))
        .count();
    assert!(
        banded > 50_000,
        "only {banded} entries carry a frequency band — rerun tools/build_lexicon.py"
    );
}

#[test]
fn suggestions_treat_a_final_letter_as_the_same_letter() {
    // Typing מ where ם belongs is the commonest Hebrew typo; it must rank as a
    // near miss rather than falling outside the edit budget.
    let mut l = Lexicon::empty();
    l.add_words("שלום\nכתב");
    assert_eq!(l.suggest("שלומ", 3), vec!["שלום".to_string()]);
}

#[test]
fn a_user_dictionary_is_honoured() {
    // The user dictionary is not a nicety here: no lexicon can contain every
    // chaburah's terminology, every rebbe's name, or the writer's own coinages.
    let mut l = bundled();
    assert!(!l.contains("קווצקוו"), "the test word is already known");
    assert!(!Checker::hebrew_only(&l)
        .check("מילה קווצקוו כאן")
        .is_empty());
    l.add_words("# a comment\n\nקווצקוו\n");
    assert!(l.contains("קווצקוו"));
    assert!(
        !Checker::hebrew_only(&l)
            .check("מילה קווצקוו כאן")
            .iter()
            .any(|m| m.word == "קווצקוו"),
        "the user's own word is still flagged"
    );
}

#[test]
fn the_lexicon_holds_no_nikud() {
    // A pointed entry could never be matched (lookups are stripped) and would
    // silently bloat the asset.
    for line in include_str!("../assets/lexicon-he.txt").lines() {
        assert!(
            !spell::hebrew::is_pointed(line),
            "lexicon entry carries nikud: {line:?}"
        );
    }
    for line in include_str!("../assets/lexicon-he-supplement.txt").lines() {
        assert!(
            !spell::hebrew::is_pointed(line),
            "supplement entry carries nikud: {line:?}"
        );
    }
}

// ── the request API ─────────────────────────────────────────────────────────

#[test]
fn a_spell_request_returns_located_misses() {
    let req = serde_json::json!({
        "text": "כתב הרמב\"ם כשכשכשכש בהלכות",
        "suggest": false,
    })
    .to_string();
    let out: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request(&req)).expect("json");
    let misses = out["misspellings"].as_array().unwrap();
    assert_eq!(misses.len(), 1, "got {misses:?}");
    assert_eq!(misses[0]["word"], "כשכשכשכש");
    assert!(out["lexicon_size"].as_u64().unwrap() > 30_000);
}

#[test]
fn offsets_are_utf16_and_correct_across_several_misses() {
    // Two nonsense words with a known Hebrew word between them. Hebrew is two
    // bytes per letter in UTF-8 but one UTF-16 unit, so the expected start is the
    // character index — which is what a JavaScript editor positions by. The
    // conversion is now a single forward pass rather than a prefix re-walk per
    // word, so this pins that it still lands every marker exactly.
    // Three nonsense words, with known Hebrew words between them so the checker
    // has real gaps of multi-byte text to walk over.
    let text = "זזזזזז שלום ססססס עולם טטטטט";
    let req = serde_json::json!({ "text": text }).to_string();
    let out: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request(&req)).unwrap();
    let m = out["misspellings"].as_array().unwrap();
    assert_eq!(m.len(), 3, "got {m:?}");
    // The forward pass must match the straightforward prefix-walk for every word.
    let u16_at = |needle: &str| text[..text.find(needle).unwrap()].encode_utf16().count() as u64;
    for (i, word) in ["זזזזזז", "ססססס", "טטטטט"].iter().enumerate() {
        assert_eq!(m[i]["word"], *word);
        assert_eq!(
            m[i]["start"].as_u64().unwrap(),
            u16_at(word),
            "wrong offset for {word}"
        );
    }
    // …and every offset is a plain character index here (all Hebrew), never the
    // byte offset that would put each marker at roughly twice its real position.
    assert_eq!(m[0]["start"], 0);
    assert_eq!(m[1]["start"], 12); // 6 + 1 + 4 + 1
}

#[test]
fn a_request_can_carry_the_writers_own_dictionary() {
    let text = "מילה כשכשכשכש כאן";
    let plain = serde_json::json!({ "text": text }).to_string();
    let taught = serde_json::json!({ "text": text, "user_words": "כשכשכשכש" }).to_string();

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

#[test]
fn suggestions_can_be_asked_for_inline_or_per_word() {
    let req = serde_json::json!({ "text": "שלומ", "suggest": true, "limit": 3 }).to_string();
    let out: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request(&req)).unwrap();
    let m = &out["misspellings"][0];
    assert!(m["suggestions"].as_array().is_some_and(|s| !s.is_empty()));

    let one = serde_json::json!({ "word": "שלומ", "limit": 3 }).to_string();
    let out2: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::suggest_request(&one)).unwrap();
    assert!(!out2["suggestions"].as_array().unwrap().is_empty());
}

#[test]
fn request_offsets_are_utf16_units_not_bytes() {
    // Every consumer is a JavaScript editor, and JS string indices are UTF-16.
    // Hebrew is 2 bytes per letter in UTF-8 but 1 UTF-16 unit, so byte offsets
    // land the squiggle at roughly twice its real position — past the end of the
    // document, where it silently disappears.
    let text = "אבגד כשכשכשכש";
    let req = serde_json::json!({ "text": text }).to_string();
    let out: serde_json::Value =
        serde_json::from_str(&ksav_engine::spell::spell_request(&req)).unwrap();
    let m = &out["misspellings"][0];
    let start = m["start"].as_u64().unwrap() as usize;
    let len = m["len"].as_u64().unwrap() as usize;

    // Slice the way JavaScript would, and get the word back.
    let utf16: Vec<u16> = text.encode_utf16().collect();
    let sliced = String::from_utf16(&utf16[start..start + len]).unwrap();
    assert_eq!(sliced, "כשכשכשכש", "offsets do not index UTF-16 units");
    assert!(
        start + len <= utf16.len(),
        "the range runs past the document"
    );
}

// ── Hebrew morphology ───────────────────────────────────────────────────────

#[test]
fn a_prefixed_word_is_recognised() {
    // Hebrew glues ו/ה/ב/כ/ל/מ/ש onto the front of a word, including onto
    // abbreviations. A lexicon cannot enumerate every combination, and without
    // prefix stripping ושו"ע is flagged while שו"ע is known — exactly the case
    // that makes a checker look stupid.
    let l = bundled();
    for w in [
        "ושו\"ע",
        "בגמרא",
        "ובגמרא",
        "שבגמרא",
        "כדאיתא",
        "להלכה",
        "מהלכה",
    ] {
        assert!(l.contains(w), "{w:?} was not recognised through its prefix");
    }
}

#[test]
fn prefix_stripping_does_not_swallow_real_typos() {
    // The cost of prefix stripping is over-acceptance, and it has to stay
    // bounded: allowing a two-letter stem let the genuine typo שלומ (missing
    // final mem) through as ש+לום or של+ומ, because the corpus contains those
    // fragments.
    let l = bundled();
    assert!(
        !l.contains("שלומ"),
        "a real typo was accepted through a short stem"
    );
}

#[test]
fn a_hebrew_year_is_not_flagged() {
    // Every year is a new word and no dictionary lists them, but they are
    // correct by construction.
    let l = bundled();
    for y in ["תשפ\"ה", "תשע\"ד", "תש\"פ", "ה'תשפ\"ו"] {
        assert!(
            Checker::hebrew_only(&l).check(y).is_empty(),
            "{y:?} was flagged as a misspelling"
        );
    }
}

#[test]
fn an_opening_quote_after_a_prefix_is_not_part_of_the_word() {
    // `ה"והגית` is the prefix ה plus a quoted word, not an acronym. Hebrew
    // acronyms have a one- or two-letter tail (שו"ע, מהרש"א, נפק"מ); a quotation
    // opens a whole word.
    let toks: Vec<&str> = spell::words("ה\"והגית בם\" נאמר")
        .into_iter()
        .map(|t| t.text)
        .collect();
    assert!(
        toks.contains(&"והגית"),
        "the quoted word was glued to the prefix: {toks:?}"
    );
    // …while a genuine acronym still holds together.
    let acronyms: Vec<&str> = spell::words("כתב שו\"ע וכן מהרש\"א")
        .into_iter()
        .map(|t| t.text)
        .collect();
    assert!(acronyms.contains(&"שו\"ע"), "{acronyms:?}");
    assert!(acronyms.contains(&"מהרש\"א"), "{acronyms:?}");
}

#[test]
fn ksavs_own_templates_are_not_underlined() {
    // The first thing a writer sees must not be covered in squiggles. This is
    // also a standing check on the lexicons: if a template gains a word neither
    // one knows, that shows up here rather than in front of a user.
    //
    // Both languages, because the templates are now both languages.
    let he = bundled();
    let en = ksav_engine::spell::english::Lexicon::bundled();
    let checker = Checker::new(Some(&he), Some(&en));
    let mut flagged: Vec<String> = Vec::new();
    for t in ksav_engine::templates::TEMPLATES {
        for m in checker.check(t.body) {
            flagged.push(format!("{} [{}] ({})", m.word, m.lang.code(), t.id));
        }
    }
    flagged.sort();
    flagged.dedup();
    assert!(
        flagged.is_empty(),
        "templates contain flagged words: {flagged:?}"
    );
}

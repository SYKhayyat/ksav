//! The two vocabularies, the product's own words, and the sentence they have to
//! keep: **the program may not underline a word it writes.**
//!
//! The bundled Hebrew dictionary is now two halves — the Torah half (Mishnah,
//! Shulchan Arukh, Mishnah Berurah, Rashi, plus the hand-curated Talmudic and
//! apparatus list) and the modern half (Project Ben-Yehuda's 26,000
//! public-domain works) — because a writer's Hebrew is not one language. Both are
//! on by default; a writer can turn either off, and each is a working dictionary
//! on its own.
//!
//! Two things could go wrong and both are tested here. A switch could **do
//! nothing** (the request field read, the layer not selected) — so each half is
//! asked for a word only it knows. And the switches could reach **the product's
//! own vocabulary**, which no setting may do: the interface, the two starter
//! documents and the twelve templates ship a word list in
//! `assets/lexicon-he-product.txt`, always loaded, and the whole of every one of
//! those sources is run through the checker under all four combinations.
//!
//! That second test is the one that was missing when the welcome page said
//! `וייצוא` and the speller underlined it: the dictionary is built from Torah and
//! pre-war literature, so a word the product itself uses about *exporting to
//! Word* had nowhere to come from.

use ksav_engine::spell::hebrew::{Layers, Lexicon};
use ksav_engine::spell::{english, Checker};

/// Every text the product puts in front of a writer — the same list
/// `examples/emit-product-words.rs` generates the layer from.
const SOURCES: &[(&str, &str)] = &[
    ("i18n-he.ts", include_str!("../../app/src/i18n-he.ts")),
    ("starter.ts", include_str!("../../app/src/starter.ts")),
    (
        "article-en.ksav",
        include_str!("../templates/article-en.ksav"),
    ),
    ("article.ksav", include_str!("../templates/article.ksav")),
    ("bentcher.ksav", include_str!("../templates/bentcher.ksav")),
    (
        "divrei-torah.ksav",
        include_str!("../templates/divrei-torah.ksav"),
    ),
    ("gemara.ksav", include_str!("../templates/gemara.ksav")),
    ("get.ksav", include_str!("../templates/get.ksav")),
    ("kesubah.ksav", include_str!("../templates/kesubah.ksav")),
    (
        "letter-en.ksav",
        include_str!("../templates/letter-en.ksav"),
    ),
    ("letter.ksav", include_str!("../templates/letter.ksav")),
    ("peirush.ksav", include_str!("../templates/peirush.ksav")),
    ("sefer.ksav", include_str!("../templates/sefer.ksav")),
    ("siddur.ksav", include_str!("../templates/siddur.ksav")),
];

/// The words each half answers for, and a word it must not claim.
///
/// `עיתון` and `מכונית` are modern literary Hebrew with no Sefaria source;
/// `אבוהון` is a Talmudic genitive whose like the modern corpus does not carry.
/// Neither list is a guess: they were read off the two generated files.
const MODERN_ONLY: &[&str] = &["עיתון", "מכונית", "אמוראים"];
const TORAH_ONLY: &[&str] = &["אבוהון", "אבילותו", "אבעבוע"];

/// The product's own vocabulary, which no switch may touch.
const PRODUCT_WORDS: &[&str] = &["תצוגה", "עדכון", "גיבוי", "אחסון"];

fn checker_for(layers: Layers) -> Checker<'static> {
    // Leaked on purpose: `Checker` borrows, this is a test binary of a few
    // megabytes, and the alternative is a lifetime dance in every assertion.
    let he: &'static Lexicon = Box::leak(Box::new(Lexicon::layered(layers)));
    let en: &'static english::Lexicon = Box::leak(Box::new(english::Lexicon::bundled()));
    Checker::new(Some(he), Some(en))
}

fn flagged(checker: &Checker, word: &str) -> bool {
    !checker.check(word).is_empty()
}

#[test]
fn each_half_answers_for_its_own_vocabulary() {
    let modern = checker_for(Layers {
        modern: true,
        rabbinic: false,
    });
    let rabbinic = checker_for(Layers {
        modern: false,
        rabbinic: true,
    });
    let both = checker_for(Layers::default());
    let neither = checker_for(Layers {
        modern: false,
        rabbinic: false,
    });

    for w in MODERN_ONLY {
        assert!(
            !flagged(&modern, w),
            "modern-only word {w:?} was flagged with modern on"
        );
        assert!(!flagged(&both, w), "{w:?} was flagged with both halves on");
        assert!(
            flagged(&rabbinic, w),
            "{w:?} was accepted with modern off and rabbinic on"
        );
    }
    for w in TORAH_ONLY {
        assert!(
            !flagged(&rabbinic, w),
            "Torah-only word {w:?} was flagged with rabbinic on"
        );
        assert!(!flagged(&both, w), "{w:?} was flagged with both halves on");
        assert!(
            flagged(&modern, w),
            "{w:?} was accepted with rabbinic off and modern on"
        );
    }
    // The switch is a switch, not a decoration: with both off, a word from
    // either corpus is gone.
    for w in MODERN_ONLY.iter().chain(TORAH_ONLY) {
        assert!(flagged(&neither, w), "{w:?} survived both halves being off");
    }
}

/// The union file is what the two halves add up to — no more, no less.
///
/// The first draft of the split wrote the *whole* dictionary into the Torah file,
/// because the union reassigned the variable both files read; the layer counts
/// were 262,648 and 250,818 and the split was invisible. A count that is wrong by
/// accident reads exactly like a count that is right, so the file that carries
/// the total (`assets/lexicon-he.txt`, quoted by the documentation) is compared
/// against the two files that are supposed to make it up.
#[test]
fn the_two_halves_add_up_to_the_union() {
    let words = |text: &str| -> std::collections::BTreeSet<String> {
        text.lines()
            .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
            .map(|l| l.split('\t').next().unwrap_or(l).to_string())
            .collect()
    };
    let union = words(include_str!("../assets/lexicon-he.txt"));
    let torah = words(include_str!("../assets/lexicon-he-torah.txt"));
    let modern = words(include_str!("../assets/lexicon-he-modern.txt"));

    // A floor under the reads, since the rest of this test is set arithmetic on
    // whatever the three files turned out to contain.
    assert!(
        union.len() > 200_000 && torah.len() > 30_000 && modern.len() > 200_000,
        "the files read as union {} / torah {} / modern {} — one of them is not what it says it is",
        union.len(),
        torah.len(),
        modern.len()
    );

    let a_union = torah
        .union(&modern)
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();
    let missing: Vec<&String> = union.difference(&a_union).collect();
    assert!(
        missing.is_empty(),
        "{} words are in the union and in neither half, e.g. {:.10?}",
        missing.len(),
        missing
    );
    let extra: Vec<&String> = a_union.difference(&union).collect();
    assert!(
        extra.is_empty(),
        "{} words are in a half and in no union, e.g. {:.10?}",
        extra.len(),
        extra
    );

    // Neither half may be the whole: this is the exact shape of the first draft's
    // bug, where the Torah file was written from the variable the union had
    // already overwritten and held everything. An equality test alone reads that
    // as a clean pass, because a superset still adds up.
    assert!(
        torah.len() < union.len(),
        "the Torah half has as many words as the whole dictionary ({}), so it is not a half",
        torah.len()
    );
    assert!(
        modern.len() < union.len(),
        "the modern half has as many words as the whole dictionary ({}), so it is not a half",
        modern.len()
    );
    assert!(
        !modern.is_subset(&torah) && !torah.is_subset(&modern),
        "one half contains the other — then one switch does nothing"
    );

    // And each half is *complete*, not a remainder: the words both corpora know
    // are in both files, which is what lets either switch alone be a dictionary.
    let shared = torah.intersection(&modern).count();
    assert!(
        shared > 20_000,
        "only {shared} words are in both halves — the halves look like a partition,          and then turning one off leaves holes in the other"
    );
}

#[test]
fn the_products_own_vocabulary_is_on_in_every_combination() {
    for layers in Layers::ALL {
        let checker = checker_for(layers);
        for w in PRODUCT_WORDS {
            assert!(
                !flagged(&checker, w),
                "the product's own word {w:?} was flagged with {layers:?}",
            );
        }
    }
}

/// The sentence the product owes the writer, over everything it says.
///
/// A misspelling whose word has no Hebrew letter is an English miss (an
/// identifier in the string table, a `Typst`), and this file is about Hebrew
/// vocabulary; `spell_en.rs` holds the English side.
#[test]
fn no_hebrew_word_the_product_writes_is_flagged() {
    let mut problems: Vec<String> = Vec::new();
    // What the walk actually looked at, because the loop below `continue`s past
    // English and a reader that stopped finding Hebrew would report the clean
    // bill of health this test exists to withhold.
    let mut looked_at = 0usize;
    for layers in Layers::ALL {
        let checker = checker_for(layers);
        for (name, text) in SOURCES {
            for m in checker.check(text) {
                looked_at += 1;
                if !m
                    .word
                    .chars()
                    .any(|c| ('\u{0590}'..='\u{05FF}').contains(&c))
                {
                    continue;
                }
                problems.push(format!("{name}: {:?} with {layers:?}", m.word));
            }
        }
    }
    // Fourteen sources times four combinations, about 1,400 words each; a floor
    // in the thousands is the shape of the walk, not its exact size.
    assert!(
        looked_at > 3_000,
        "the sweep looked at {looked_at} tokens — it has stopped reading the sources"
    );
    problems.sort();
    problems.dedup();
    assert!(
        problems.is_empty(),
        "the program underlines its own words ({} places) — add them to \
         `assets/lexicon-he-product.txt` by rerunning \
         `cargo run --example emit-product-words`, or to the supplement:\n  {}",
        problems.len(),
        problems
            .iter()
            .take(40)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n  "),
    );
}

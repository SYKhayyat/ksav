//! How ordinary a word is, for ordering suggestions.
//!
//! # What this fixes
//!
//! Every candidate a one-edit lexicon offers is, by construction, one edit away.
//! So distance cannot separate them, and until now nothing else did either:
//! `english.rs` ranked by distance, then transposition, then a proper-noun
//! penalty, and then **whatever order the lexicon happened to be in**. For `teh`
//! that produced `eh, meh, tea, tech, ted, tee, tel, ten` — every one of them a
//! real word one edit from `teh`, and the one the writer meant cut off the end.
//!
//! The transposition rule fixed that particular case. It does not fix the
//! general one: `hte`, `nad`, `adn` are transpositions too, and so are `hat` and
//! `tan` for a `hta`. When several candidates are equally close, the tie-breaker
//! that actually predicts what somebody meant is **how common the word is**.
//!
//! # Why this is a hand-written list and not corpus counts
//!
//! It is what can be justified. Real frequency data means a corpus and a
//! licence, and a made-up number per word dressed up as a count would be worse
//! than none: it would look like evidence. What is here is a short list of the
//! commonest English words in roughly their usual order, which is a thing that
//! can be checked by eye and argued with.
//!
//! # What it bought, measured
//!
//! On ten substitution typos — the kind the transposition rule cannot help with,
//! and most of what a keyboard produces — the word the writer meant came first
//! **4 times out of 10 before, 9 after**. On transposed typos it bought one of
//! twelve, because the transposition rule was already doing that work. Both
//! numbers are in `tests/spell_en.rs`, which is also where the tenth substitution
//! case is written down as a thing this does *not* fix and why.
//!
//! It is deliberately **only a tie-breaker**. A common word never beats a closer
//! one, and never beats a transposition at the same distance — see
//! [`super::rank`]. So the cost of the list being wrong about a word is that one
//! suggestion sits a place or two lower than it might; the cost of getting the
//! scale wrong would be `the` offered for `then`, which is why the bands do not
//! overlap.
//!
//! # Hebrew ranks itself, and this paragraph used to say it could not
//!
//! What stood here was: *"Hebrew gets nothing here. A frequency order for Hebrew
//! that covered seforim rather than newspapers is a real piece of work and
//! guessing at one would be the invented-evidence problem above, in the language
//! this project is actually for."*
//!
//! The principle was right and the paragraph was wrong about its own repository.
//! `tools/build_lexicon.py` counted every word of every Sefaria segment and every
//! Ben-Yehuda work on every run — and then reduced both counters to sets on a
//! threshold and wrote the result alphabetically. The evidence was being computed
//! and thrown away one line later. Ranking off those counts is not guessing; it
//! is *better* provenance than the two-hundred-word list above, which was typed
//! by hand.
//!
//! The cost of the omission was measurable and large. Across four hundred
//! substitution typos of the six thousand commonest words in the corpus, the
//! word the writer meant came first **20%** of the time and reached the
//! five-item menu **59%** of the time. With the bands: **55%** and **95%**.
//!
//! So the mechanism is the same in both languages and the *source* of the
//! ordering differs, which is the honest split: English has no corpus here and
//! uses a short list somebody can argue with by eye; Hebrew has one, and uses
//! it. Hebrew's bands travel in the generated lexicon as a tab-separated field
//! rather than living in this file, because they are data and there are seventy
//! thousand of them — see `hebrew.rs` and `assign_bands()` in the builder.

use std::collections::HashMap;
use std::sync::OnceLock;

/// The commonest English words, most common first.
///
/// The order is the familiar one from word-frequency lists, and it is *roughly*
/// right rather than exactly right — which is all a tie-breaker needs to be. A
/// word not on the list is not rare, it is merely unranked, and sorts after every
/// word that is.
/// Left dense on purpose: `rustfmt` would put each of these on its own line and
/// turn a word list you can read into two hundred lines you cannot.
#[rustfmt::skip]
const COMMON: &[&str] = &[
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on",
    "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say",
    "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so",
    "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like",
    "time", "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some",
    "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over",
    "think", "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
    "even", "new", "want", "because", "any", "these", "give", "day", "most", "us", "is", "was",
    "are", "been", "has", "had", "were", "said", "did", "made", "may", "part", "very", "much",
    "such", "many", "more", "must", "should", "where", "before", "here", "through", "between",
    "under", "again", "same", "another", "while", "little", "own", "each", "both", "against",
    "during", "without", "within", "however", "though", "therefore", "thus", "since", "until",
    "against", "among", "around", "already", "always", "never", "often", "sometimes", "still",
    "almost", "enough", "quite", "rather", "perhaps", "indeed", "instead", "yet", "else", "once",
    // Words a person writing a sefer, a shiur or a letter reaches for. Not a
    // frequency claim about English at large — a claim about this application's
    // writing, which is the only frequency that matters for its suggestions.
    "word", "words", "line", "lines", "page", "pages", "book", "books", "read", "write", "wrote",
    "written", "name", "names", "place", "places", "question", "answer", "reason", "reasons",
    "explain", "explains", "explained", "meaning", "means", "understand", "understood", "learn",
    "learned", "teach", "taught", "study", "example", "examples", "case", "cases", "point",
    "points", "thing", "things", "person", "people", "letter", "letters", "chapter", "chapters",
    "verse", "verses", "law", "laws", "custom", "customs", "prayer", "prayers", "blessing",
    "blessings", "holy", "text", "texts", "source", "sources", "note", "notes", "comment",
    "comments", "commentary", "translation", "quote", "quotes", "quoted",
];

/// Where a word stands, or `None` for one nobody ranked.
fn ranks() -> &'static HashMap<&'static str, usize> {
    static RANKS: OnceLock<HashMap<&'static str, usize>> = OnceLock::new();
    RANKS.get_or_init(|| {
        // First occurrence wins: the list has a couple of words twice, because it
        // was written by hand and a duplicate is a typo rather than a re-ranking.
        let mut out = HashMap::with_capacity(COMMON.len());
        for (nth, word) in COMMON.iter().enumerate() {
            out.entry(*word).or_insert(nth);
        }
        out
    })
}

/// How many bands the tie-breaker has. One more than the highest band, so
/// [`super::rank`] can scale by it and know nothing overflows into the next
/// distance.
pub(crate) const BANDS: usize = 8;

/// Which band a word sits in: 0 for the commonest, [`BANDS`] − 1 for a word
/// nobody ranked.
///
/// Bands and not raw positions, so that the ordering within a band stays
/// alphabetical and predictable. A writer who sees `the` offered before `tea`
/// does not also need `ted` and `tee` reshuffled by a list somebody wrote by
/// hand.
#[must_use]
pub(crate) fn band(word: &str) -> usize {
    let lower = word.to_lowercase();
    match ranks().get(lower.as_str()) {
        // The first fifty are the words that carry sentences.
        Some(nth) if *nth < 50 => 0,
        Some(nth) if *nth < 120 => 1,
        Some(nth) if *nth < 200 => 2,
        Some(_) => 3,
        None => BANDS - 1,
    }
}

#[cfg(test)]
mod tests {
    // A panic in a test is a failure report.
    #![allow(clippy::expect_used, clippy::unwrap_used)]
    use super::*;

    #[test]
    fn the_commonest_words_are_in_the_first_band() {
        for word in ["the", "and", "of", "to", "a", "in", "that"] {
            assert_eq!(band(word), 0, "{word}");
        }
    }

    #[test]
    fn a_word_nobody_ranked_sorts_after_every_word_that_was() {
        // *Unranked* and not *rare*. Nearly the whole 96,184-entry lexicon is
        // unranked, and none of it is being called uncommon.
        assert_eq!(band("chiaroscuro"), BANDS - 1);
        assert!(band("chiaroscuro") > band("commentary"));
        assert!(band("commentary") > band("the"));
    }

    #[test]
    fn capitalisation_does_not_change_how_common_a_word_is() {
        assert_eq!(band("The"), band("the"));
        assert_eq!(band("THE"), band("the"));
    }

    #[test]
    fn every_band_fits_under_the_scale() {
        // The whole safety property: a frequency tie-breaker that could reach into
        // the next distance would offer `the` for `then`, which is worse than
        // offering nothing.
        for word in COMMON {
            assert!(band(word) < BANDS, "{word}");
        }
        assert!(band("chiaroscuro") < BANDS);
    }

    #[test]
    fn a_word_listed_twice_is_ranked_by_its_first_place() {
        // `against` is in the list twice — written by hand, so this will happen
        // again. The first place is the one meant; a later duplicate must not
        // demote it.
        let first = COMMON.iter().position(|w| *w == "against").expect("listed");
        let all: Vec<usize> = COMMON
            .iter()
            .enumerate()
            .filter(|(_, w)| **w == "against")
            .map(|(n, _)| n)
            .collect();
        assert!(
            all.len() > 1,
            "the duplicate this test is about was removed"
        );
        assert_eq!(*ranks().get("against").expect("ranked"), first);
    }
}

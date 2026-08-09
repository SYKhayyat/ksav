//! One want, satisfied once — the engine half of the fence.
//!
//! The Lamdan report's §3 counted eight concepts this repository states two or
//! three times, in two or three languages, with nothing between the copies. Most
//! of them had one authority available and simply were not using it, and those
//! are fixed by *deletion*: `app/src/engine.gen.ts` is generated from the engine
//! and `npm test` fails when it is stale, so the app no longer keeps a second
//! opinion about the defaults, the command pairing or the licence notices.
//!
//! Three of them cannot be fixed that way, and this file is about those. A Typst
//! prelude cannot call Rust; a browser tab cannot call either; and the rule they
//! share is an *algorithm*, not a table, so there is nothing to generate. What is
//! available is an **oracle**: a corpus checked in once, and every implementation
//! executed against it.
//!
//!   1. `fold` — which written spellings of a Hebrew name are the same name.
//!      Rust (catalogue lookup), Typst (`_ix_fold`, the source index),
//!      TypeScript (citation autocomplete). The corpus is
//!      `tests/fixtures/fold-cases.json`; `app/test/sefarim.test.mjs` runs the
//!      third implementation against the same file.
//!   2. `#כלול` — which lines are inclusion directives. Rust splices the
//!      documents; the app decides which ones to *send*, so a disagreement is a
//!      chapter the engine reports as missing and the app never had a reason to
//!      put on the request. `parts.ts` already admitted, in prose, that "the two
//!      implementations have to agree" — this is that sentence, executed.
//!   3. The running head's alignment. `sanitize_head_align` (Rust) and the two
//!      `in (…)` tuples in `מסמך` (Typst) are the same four-spelling table.
//!
//! And one that is a table after all, checked here because the app cannot see
//! the prelude at build time: the engine's `DocConfig::default()` against
//! `מסמך`'s own parameter defaults.

use ksav_engine::{probe, sefarim, DocConfig};
use serde::Deserialize;

const PRELUDE: &str = include_str!("../typst/ksav.typ");

// ------------------------------------------------------------------ 1. fold

#[derive(Deserialize)]
struct Corpus {
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    class: String,
    #[serde(rename = "in")]
    input: String,
    out: String,
}

fn corpus() -> Vec<Case> {
    let raw = include_str!("fixtures/fold-cases.json");
    let c: Corpus = serde_json::from_str(raw).expect("fold-cases.json parses");
    assert!(
        c.cases.len() >= 25,
        "the fold corpus has shrunk to {} cases — a fence that checks nothing \
         passes just as green as one that checks everything",
        c.cases.len()
    );
    c.cases
}

/// The Rust implementation, against the corpus.
#[test]
fn rust_folds_every_case_as_the_corpus_says() {
    for c in corpus() {
        assert_eq!(
            sefarim::fold(&c.input),
            c.out,
            "fold({:?}) — the corpus is the rule; if this changed on purpose, \
             change tests/fixtures/fold-cases.json and re-run all three",
            c.input
        );
    }
}

/// One Typst string literal for `s`.
fn typst_str(s: &str) -> String {
    let mut out = String::from("\"");
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// The Typst implementation, against the same corpus.
///
/// Asserted *inside the compiler* rather than read back off the page: `#assert`
/// compares the strings where they are made, so this tests the fold rather than
/// Typst's line breaking, and a disagreement arrives as a compile diagnostic
/// naming the case that failed. A document that lays out perfectly while folding
/// `ראש־השנה` to `ראשהשנה` is exactly the failure this has to catch.
#[test]
fn the_prelude_folds_every_case_the_same_way() {
    let mut body = String::new();
    for c in corpus() {
        body.push_str(&format!(
            "#assert.eq(_ix_fold({}), {}, message: \"fold({}) in ksav.typ disagrees with fold-cases.json\")\n",
            typst_str(&c.input),
            typst_str(&c.out),
            c.class,
        ));
    }
    if let Err(diags) = probe::layout(&body, &DocConfig::default()) {
        let messages: Vec<String> = diags.iter().map(|d| d.message.clone()).collect();
        panic!(
            "engine/typst/ksav.typ's `_ix_fold` disagrees with the corpus:\n{}",
            messages.join("\n")
        );
    }
}

/// The property all three exist for: same class, same fold.
///
/// The exact-string tests above would pass on an implementation that folded
/// every name to the empty string, as long as the corpus said so. This one says
/// what the fold is *for*: two spellings of one masechta find one entry, and two
/// different masechtos do not collide.
#[test]
fn folding_puts_the_spellings_of_one_name_together_and_others_apart() {
    let cases = corpus();
    for a in &cases {
        for b in &cases {
            let same = sefarim::fold(&a.input) == sefarim::fold(&b.input);
            if a.class == b.class {
                assert!(
                    same,
                    "{:?} and {:?} are both {} and must fold alike",
                    a.input, b.input, a.class
                );
            } else {
                assert!(
                    !same,
                    "{:?} ({}) and {:?} ({}) fold to the same thing — the \
                     catalogue would answer one with the other",
                    a.input, a.class, b.input, b.class
                );
            }
        }
    }
}

// ------------------------------------------------------------- 2. `#כלול`

#[derive(Deserialize)]
struct IncludeCorpus {
    cases: Vec<IncludeCase>,
}

#[derive(Deserialize)]
struct IncludeCase {
    line: String,
    name: Option<String>,
}

/// The engine's reading of the directive, against the shared corpus.
///
/// `app/test/parts.test.mjs` runs the app's reading against the same file. The
/// two decide different halves of one operation — the app decides which chapters
/// to put on the request, the engine decides which ones the document asked for —
/// so a line only one of them recognises is a chapter reported missing on a
/// document that names it correctly.
#[test]
fn the_engine_reads_the_include_directive_as_the_corpus_says() {
    let raw = include_str!("fixtures/include-cases.json");
    let c: IncludeCorpus = serde_json::from_str(raw).expect("include-cases.json parses");
    assert!(c.cases.len() >= 15, "the include corpus has shrunk");
    for case in &c.cases {
        assert_eq!(
            ksav_engine::include::directive(&case.line),
            case.name.as_deref(),
            "directive({:?}) — app/src/parts.ts applies the same rule and the \
             two have to agree",
            case.line
        );
    }
}

// ---------------------------------------------------- 3. the running head

/// The four spellings each of `outside` and `inside`, in both languages.
///
/// Rust narrows them to three canonical values before the source is assembled,
/// so the prelude's Hebrew arms are only reachable when somebody writes
/// `#show: מסמך.with(…)` by hand — which the prelude is published for. Two
/// tables, one setting, and the way that fails is silent: a spelling one side
/// accepts and the other does not falls through to centred, and a page number
/// that should sit on the outside edge sits in the middle instead.
#[test]
fn both_languages_accept_the_same_head_alignments() {
    let line_after = |needle: &str| {
        PRELUDE
            .lines()
            .find(|l| l.contains(needle))
            .unwrap_or_else(|| panic!("ksav.typ no longer contains {needle:?}"))
            .to_string()
    };
    let outside = line_after("let want_outside = יישור_כותרת in");
    let inside = line_after("let want_inside = יישור_כותרת in");

    for spelling in ["חוץ", "חיצוני", "outside", "outer"] {
        assert!(
            outside.contains(&format!("\"{spelling}\"")),
            "the prelude does not accept {spelling:?} as an outside alignment, \
             and lib.rs's sanitize_head_align does"
        );
        assert_eq!(
            ksav_engine::sanitize_head_align(spelling),
            "outside",
            "lib.rs does not accept {spelling:?}, and the prelude does"
        );
    }
    for spelling in ["פנים", "פנימי", "inside", "inner"] {
        assert!(
            inside.contains(&format!("\"{spelling}\"")),
            "the prelude does not accept {spelling:?} as an inside alignment"
        );
        assert_eq!(
            ksav_engine::sanitize_head_align(spelling),
            "inside",
            "lib.rs does not accept {spelling:?}, and the prelude does"
        );
    }
    // Anything else is centred, on both sides, and the prelude reaches that by
    // falling through rather than by listing spellings — so there is nothing to
    // compare except that neither table claims it.
    for spelling in ["center", "מרכז", "", "sideways"] {
        assert_eq!(
            ksav_engine::sanitize_head_align(spelling),
            "center",
            "{spelling:?} should fall through to centred"
        );
        assert!(
            !outside.contains(&format!("\"{spelling}\""))
                && !inside.contains(&format!("\"{spelling}\"")),
            "the prelude treats {spelling:?} as an edge alignment and lib.rs does not"
        );
    }
}

// -------------------------------------------------- 4. the document defaults

/// `DocConfig::default()` and `#let מסמך(…)`'s own defaults are one page setup.
///
/// `assemble_source` passes every parameter explicitly, so the prelude's
/// defaults are only reached by a hand-written `#show: מסמך.with(…)` — which is
/// how the prelude is meant to be usable on its own, and is exactly the reader
/// who would never find out that its idea of a default page is not the app's.
#[test]
fn the_prelude_and_the_engine_agree_about_a_default_page() {
    let cfg = DocConfig::default();
    let param = |name: &str| -> String {
        let at = PRELUDE
            .find("#let מסמך(")
            .expect("the prelude defines #let מסמך");
        PRELUDE[at..]
            .lines()
            .map(str::trim)
            .find(|l| l.starts_with(&format!("{name}: ")))
            .unwrap_or_else(|| panic!("#let מסמך has no {name} parameter"))
            .trim_start_matches(&format!("{name}: "))
            .trim_end_matches(',')
            .to_string()
    };

    for (typst_name, want) in [
        ("גופן", format!("\"{}\"", cfg.font)),
        ("גודל", format!("{}pt", cfg.size_pt as i64)),
        ("שוליים", format!("{}cm", cfg.margin_cm)),
        ("שולי_כריכה", format!("{}cm", cfg.gutter_cm as i64)),
        ("דו_צדדי", cfg.two_sided.to_string()),
        ("יישור", cfg.justify.to_string()),
        ("מספור", cfg.numbering.to_string()),
        ("מספור_עברי", cfg.hebrew_numbering.to_string()),
        ("נייר", format!("\"{}\"", cfg.paper)),
        ("מניעת_יתומים", cfg.prevent_orphans.to_string()),
        ("ריווח_שורות", format!("{}em", cfg.line_spacing_em)),
        ("ריווח_פסקאות", format!("{}em", cfg.para_spacing_em)),
        (
            "הזחה_ראשונה",
            format!("{}em", cfg.first_line_indent_em as i64),
        ),
        ("טורים", cfg.columns.to_string()),
    ] {
        assert_eq!(
            param(typst_name),
            want,
            "#let מסמך's {typst_name} default is not DocConfig::default()'s. \
             They are one page setup written twice; app/src/engine.gen.ts is \
             generated from the Rust side, so this is the copy that drifts."
        );
    }

    // The four per-edge margins and the note region are `none` on both sides,
    // and that is not the same as a number: `none` means "follow the uniform
    // margin" and "decide from the document". A default of 0cm here would pin
    // every hand-written document's margins at nothing.
    for typst_name in [
        "שוליים_עליון",
        "שוליים_תחתון",
        "שוליים_פנימי",
        "שוליים_חיצוני",
        "אזור_הערות",
        // A custom page size is absent by default too, and for a third reason:
        // `none` here means *use `נייר`*, and a number would override the named
        // paper for every document ever written.
        "רוחב_עמוד",
        "גובה_עמוד",
    ] {
        assert_eq!(
            param(typst_name),
            "none",
            "{typst_name} must default to none"
        );
    }
    assert!(cfg.margin_top_cm.is_none() && cfg.notes_region_cm.is_none());
    assert!(cfg.page_width_cm.is_none() && cfg.page_height_cm.is_none());

    // The centre of the alignment table, from the other end: the engine's own
    // default has to be a value the prelude's `יישור_כותרת` understands.
    assert_eq!(cfg.head_align, "center");
    assert_eq!(param("יישור_כותרת"), "\"מרכז\"");
}

// ------------------------------------------- 5. what a Hebrew word boundary is

/// The rule five things in this product were deciding separately.
///
/// `sefarim.rs:256-260` already named it: *"This rule exists three times — here,
/// in `ksav.typ`'s `_ix_fold` and in `app/src/sefarim.ts`… All three are
/// executed against one corpus by `tests/one_want.rs`; edit
/// `tests/fixtures/fold-cases.json`, not one of the three."* That comment is
/// right and its scope was wrong. There were **five**, and the two outside its
/// count were the two that were broken:
///
///   4. `spell/hebrew.rs`'s `is_hebrew_mark` — the whole block `U+0591–U+05C7`
///      with nothing excluded, used by both the tokenizer and `normalize`.
///   5. `tools/build_lexicon.py`'s `NIKUD` — the same omission in Python.
///
/// Maqaf, paseq, sof pasuq and nun hafukha live in that block and separate
/// words. Stripping them turned `אֶת־הַשָּׁמַיִם` into `אתהשמים`; the tokenizer never
/// split there, so the checker asked the lexicon about the glued form, and the
/// lexicon — built by the other broken copy over the same rule — had it. Both
/// halves agreed, so nothing looked wrong from either side, and sof pasuq ends
/// every verse, which took the checker off **every unpointed pasuk**.
///
/// Copies four and five are gone: the speller calls `girsa-hebrew`, and the
/// Python reads `facts.gen.json`. What is left is this — the assertion that they
/// really did go, rather than moving.
mod hebrew_word_boundaries {
    use super::{DocConfig, probe};

    /// The four characters, and nothing else in the block.
    #[test]
    fn the_crate_and_the_engine_agree_about_every_character_in_the_block() {
        for c in '\u{0591}'..='\u{05C7}' {
            let breaking = girsa_hebrew::is_word_breaking_punctuation(c);
            assert_eq!(
                girsa_hebrew::is_mark(c),
                !breaking,
                "U+{:04X} is neither a mark nor word-breaking, which is not a \
                 third thing the block has",
                c as u32
            );
            // The speller's own predicate, from the other side: a character
            // that breaks words is not part of one.
            assert_eq!(
                ksav_engine::spell::hebrew::is_part_of_a_word(c),
                !breaking,
                "the speller and girsa-hebrew disagree about U+{:04X}",
                c as u32
            );
        }
    }

    /// The Typst copy, asked the same question.
    ///
    /// `_ix_fold` is the source index's normaliser and it cannot call Rust. The
    /// fold corpus covers it on names; this covers it on the character rule, in
    /// the compiler, where a disagreement arrives as a diagnostic rather than as
    /// an index entry nobody can find.
    #[test]
    fn the_prelude_breaks_words_on_the_same_four_characters() {
        let mut body = String::new();
        for c in ['\u{05BE}', '\u{05C0}', '\u{05C3}', '\u{05C6}'] {
            body.push_str(&format!(
                "#assert.eq(_ix_fold(\"בן{c}איש\"), \"בן איש\", \
                 message: \"U+{:04X} did not break a word in _ix_fold\")\n",
                c as u32
            ));
        }
        // …and a nikud point still vanishes, or "breaks words" would be
        // satisfied by breaking on everything.
        body.push_str(
            "#assert.eq(_ix_fold(\"בֵּן\"), \"בן\", message: \"a nikud point survived _ix_fold\")\n",
        );
        if let Err(diags) = probe::layout(&body, &DocConfig::default()) {
            let said: Vec<String> = diags.iter().map(|d| d.message.clone()).collect();
            panic!("ksav.typ's `_ix_fold`:\n{}", said.join("\n"));
        }
    }

    /// The Python copy is gone, and stays gone.
    ///
    /// `build_lexicon.py` builds the shipped dictionary and runs on a clone with
    /// no Rust toolchain, so it reads `facts.gen.json` — the same arrangement
    /// `engine.gen.ts` has, for the same reason. This is a text check of a
    /// Python file and that is deliberate: what it forbids is a *literal*, and a
    /// literal is exactly the thing that cannot be caught any other way. It can
    /// only ever produce a loud refusal, never a wrong value.
    #[test]
    fn the_lexicon_builder_keeps_no_character_table_of_its_own() {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tools/build_lexicon.py"
        ))
        .expect("read build_lexicon.py");
        assert!(
            src.contains("facts.gen.json"),
            "build_lexicon.py no longer reads the engine's facts"
        );
        // The character class it used to carry, in the spellings Python writes
        // it. Comments are stripped first — the file *explains* the old class at
        // length, and a check that forbade naming the bug would forbid recording
        // it.
        let code: String = src
            .lines()
            .map(|l| l.split_once('#').map_or(l, |(before, _)| before))
            .collect::<Vec<_>>()
            .join("
");
        for forbidden in ["[֑-ׇ]", r"֑-ׇ", r"֑-ׇ"] {
            assert!(
                !code.contains(forbidden),
                "build_lexicon.py has written the mark block out again ({forbidden}). \
                 It comes from facts.gen.json — see src/facts.rs."
            );
        }
    }

    /// And the corpus that fences the three name-folders knows about it too.
    #[test]
    fn the_fold_corpus_covers_every_word_breaking_character() {
        let raw = include_str!("fixtures/fold-cases.json");
        for c in ['\u{05BE}', '\u{05C0}', '\u{05C3}', '\u{05C6}'] {
            assert!(
                raw.contains(c),
                "no case in fold-cases.json contains U+{:04X}, so none of the \
                 three implementations is being asked about it",
                c as u32
            );
        }
    }
}

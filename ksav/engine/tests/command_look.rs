//! The rule: **anything that is a separate command has a look of its own, and
//! the writer can set it.**
//!
//! Stated on 16 August 2026 and it is a rule about the whole product rather than
//! about one command — *whether heading, source footnote, siman, seif*. What it
//! rules out is the answer this repository gave twice before it: *that thing is
//! really a footnote / really a heading, so style all your footnotes / all your
//! headings*. True about the mechanism, and no use at all to somebody who wants
//! their mareh mekomos set apart from their notes, or their simanim from their
//! other headings.
//!
//! The register that answers it is the one that already resolves a class's look
//! in three layers — the shipped default, the class, this instance — with `כפה`
//! on the global to sweep the one-offs back. A command joins it by being named
//! in `_mk_defaults` and rendering through `_mk_conf`, which is why the
//! implementation of each of these is four lines rather than a subsystem.
//!
//! These tests are about the three things that can go wrong with that: the look
//! has to reach the page, it must not reach anything else, and the *indexes* —
//! which is what several of these commands exist for — must be untouched by any
//! of it.

use ksav_engine::{compile, probe, DocConfig};

/// The text runs on the page, as a reader would see them.
fn runs(body: &str) -> Vec<probe::TextRun> {
    let doc = probe::layout(body, &DocConfig::default()).expect("it lays out");
    probe::text_runs(&doc)
}

/// The size a run of this text was set at, if it printed at all.
fn size_of(body: &str, needle: &str) -> Option<f64> {
    runs(body)
        .iter()
        .find(|r| r.text.contains(needle))
        .map(|r| r.size)
}

#[test]
fn a_source_note_prints_at_the_size_it_always_did() {
    // The value moved from an inline `text(size: 0.92em, …)` into `_mk_defaults`
    // so that a control could read it. If that move changed the number, every
    // sefer written before today reprints differently — which is the one thing
    // this change is not allowed to do.
    let out = compile("שלום#מראה_מקום[ברכות לט:]\n", &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let plain = size_of("שלום#הערה[ברכות לט:]\n", "ברכות לט:").expect("the footnote printed");
    let source =
        size_of("שלום#מראה_מקום[ברכות לט:]\n", "ברכות לט:").expect("the source note printed");
    assert!(
        source < plain,
        "a source note is set smaller than a footnote: {source} vs {plain}"
    );
    // 0.92 of the note text, which is what it has always been.
    let ratio = source / plain;
    assert!(
        (ratio - 0.92).abs() < 0.01,
        "the shipped ratio moved: {ratio}"
    );
}

#[test]
fn the_class_can_be_set_apart_from_the_footnotes_around_it() {
    // The complaint, answered: this changes the mareh mekomos and leaves the
    // ordinary notes exactly where they were.
    let body = "אחד#הערה[רגילה] שנים#מראה_מקום[ברכות לט:]\n";
    let styled = format!("#הגדרות_סימונים(גודל: (\"מראה_מקום\": 0.7em))\n{body}");

    let plain_before = size_of(body, "רגילה").expect("the footnote printed");
    let source_before = size_of(body, "ברכות לט:").expect("the source note printed");
    let plain_after = size_of(&styled, "רגילה").expect("the footnote still printed");
    let source_after = size_of(&styled, "ברכות לט:").expect("the source note still printed");

    assert!(
        source_after < source_before,
        "the class setting reached the source note: {source_after} vs {source_before}"
    );
    assert_eq!(
        plain_before, plain_after,
        "and left the ordinary footnotes alone"
    );
}

#[test]
fn one_source_note_can_differ_from_its_class() {
    let body = "אחד#מראה_מקום[ברכות לט:] שנים#מראה_מקום(גודל: 0.6em)[שבת קיח.]\n";
    let out = compile(body, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let class = size_of(body, "ברכות לט:").expect("the first printed");
    let mine = size_of(body, "שבת קיח.").expect("the second printed");
    assert!(
        mine < class,
        "the instance override reached it: {mine} vs {class}"
    );
}

#[test]
fn the_global_can_sweep_the_one_offs_back() {
    // `כפה` is the switch for making a sefer uniform again, and it has to beat
    // the per-instance override or it does not do that.
    let body = "אחד#מראה_מקום[ברכות לט:] שנים#מראה_מקום(גודל: 0.6em)[שבת קיח.]\n";
    let forced = format!("#הגדרות_סימונים(גודל: (\"מראה_מקום\": 0.8em), כפה: true)\n{body}");
    let a = size_of(&forced, "ברכות לט:").expect("the first printed");
    let b = size_of(&forced, "שבת קיח.").expect("the second printed");
    assert_eq!(a, b, "the overrule swept the instance override back");
}

#[test]
fn none_of_it_touches_the_index() {
    // The index is the reason the command exists. A citation with a `מקור:` is
    // collected whatever it looks like; one without is not collected at all,
    // which is what the editor's info mark on the line says.
    let with_ref =
        "שלום#מראה_מקום(מקור: \"girsa:bavli/berakhot/39b:1\", גודל: 0.6em)[ברכות לט:]\n#מראה_מקומות()\n";
    let page: String = runs(with_ref).iter().map(|r| r.text.clone()).collect();
    assert!(
        page.matches("ברכות לט:").count() >= 2,
        "the citation is in the note and in the index: {page}"
    );

    let no_ref = "שלום#מראה_מקום(גודל: 0.6em)[ברכות לט:]\n#מראה_מקומות()\n";
    let page: String = runs(no_ref).iter().map(|r| r.text.clone()).collect();
    assert_eq!(
        page.matches("ברכות לט:").count(),
        1,
        "a citation with no ref is a footnote and nothing else: {page}"
    );
}

#[test]
fn a_citation_can_be_kept_out_of_the_list_and_stay_a_footnote() {
    // `ברשימה: false` is the knob every other mark class has, and on this one it
    // has to mean *not in the mekoros index* rather than *not a note*.
    let body = "שלום#מראה_מקום(מקור: \"girsa:bavli/berakhot/39b:1\", ברשימה: false)[ברכות לט:]\n#מראה_מקומות()\n";
    let out = compile(body, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let page: String = runs(body).iter().map(|r| r.text.clone()).collect();
    assert_eq!(
        page.matches("ברכות לט:").count(),
        1,
        "printed as a note, absent from the index: {page}"
    );
}

// ---------------------------------------------------------------- the structure
//
// A siman is a heading and a seif is a block, and *"style all your level-1
// headings"* is not an answer to a writer who wants their simanim set apart
// from the other headings in the same sefer.

#[test]
fn a_siman_prints_as_it_always_did() {
    let body = "#סימן[א׳][דין נטילת ידים]\nגוף.\n";
    let out = compile(body, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let page: String = runs(body).iter().map(|r| r.text.clone()).collect();
    assert!(page.contains("סימן"), "the word is still printed: {page}");
    assert!(page.contains("דין נטילת ידים"), "and the title: {page}");
}

#[test]
fn a_siman_can_be_set_apart_from_the_other_headings() {
    let body = "#כותרת1[פרק]\n#סימן[א׳][דין נטילת ידים]\nגוף.\n";
    let styled = format!("#הגדרות_סימונים(גודל: (\"סימן\": 1.6em))\n{body}");
    let heading_before = size_of(body, "פרק").expect("the heading printed");
    let siman_before = size_of(body, "דין נטילת ידים").expect("the siman printed");
    let heading_after = size_of(&styled, "פרק").expect("the heading still printed");
    let siman_after = size_of(&styled, "דין נטילת ידים").expect("the siman still printed");
    assert!(
        siman_after > siman_before,
        "the siman took the setting: {siman_after} vs {siman_before}"
    );
    assert_eq!(
        heading_before, heading_after,
        "and the ordinary heading was left alone"
    );
}

#[test]
fn a_siman_is_still_collected_whatever_it_looks_like() {
    let body = "#סימן(גודל: 2em)[א׳][דין נטילת ידים]\n#רשימת_סימונים(\"סימן\")\n";
    let out = compile(body, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let page: String = runs(body).iter().map(|r| r.text.clone()).collect();
    assert!(
        page.matches("דין נטילת ידים").count() >= 2,
        "printed and listed: {page}"
    );
}

#[test]
fn a_seif_styles_its_letter_and_not_its_halacha() {
    // The look belongs to the letter. A class default that swallowed the body
    // would restyle the halacha along with the letter that opens it.
    let body = "#סעיף[א][גוף ההלכה כאן]\n";
    let styled = format!("#הגדרות_סימונים(גודל: (\"סעיף\": 1.5em))\n{body}");
    let letter_before = size_of(body, "א.").expect("the letter printed");
    let halacha_before = size_of(body, "גוף ההלכה").expect("the halacha printed");
    let letter_after = size_of(&styled, "א.").expect("the letter still printed");
    let halacha_after = size_of(&styled, "גוף ההלכה").expect("the halacha still printed");
    assert!(
        letter_after > letter_before,
        "the letter took the setting: {letter_after} vs {letter_before}"
    );
    assert_eq!(
        halacha_before, halacha_after,
        "and the writer's prose was left alone"
    );
}

#[test]
fn an_os_is_styled_separately_from_a_seif() {
    // Two commands, two looks. A sefer that uses both on one page is the reason
    // they are two commands at all, so one setting must not reach the other.
    let body = "#סעיף[א][ההלכה] ואחריו #אות[ב] הדין.\n";
    let styled = format!("#הגדרות_סימונים(גודל: (\"אות\": 1.6em))\n{body}");
    let seif_before = size_of(body, "א.").expect("the seif's letter printed");
    let seif_after = size_of(&styled, "א.").expect("it still printed");
    let os_after = size_of(&styled, "ב.").expect("the os printed");
    assert_eq!(seif_before, seif_after, "the seif was left alone");
    assert!(os_after > seif_after, "and the os took the setting");
}

#[test]
fn a_misspelled_knob_stops_the_compile_and_names_itself() {
    // The one thing worse than a control that does nothing is an argument that
    // silently does nothing. `_cfg_strict` is what the three banded apparatuses
    // already do, and a footnote-backed mark needs it for the same reason.
    let out = compile(
        "שלום#מראה_מקום(גדול: 0.6em)[ברכות לט:]\n",
        &DocConfig::default(),
    );
    assert!(!out.ok(), "a knob nothing answers to compiled");
    let said = format!("{:?}", out.diagnostics);
    assert!(
        said.contains("גדול"),
        "the message names the argument: {said}"
    );
}

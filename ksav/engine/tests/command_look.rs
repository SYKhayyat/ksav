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

// ------------------------------------------------------- a door of its own
//
// *Set it inside the marks configuration* is not "each thing has its own
// style". A writer setting how a siman looks says so about simanim.

#[test]
fn each_command_has_a_door_named_for_it() {
    let body = "#כותרת1[פרק]\n#סימן[א׳][דין נטילת ידים]\nגוף.\n";
    let styled = format!("#הגדרות_סימן(גודל: 1.6em)\n{body}");
    let out = compile(&styled, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let before = size_of(body, "דין נטילת ידים").expect("the siman printed");
    let after = size_of(&styled, "דין נטילת ידים").expect("it still printed");
    assert!(
        after > before,
        "the siman's own door reached it: {after} vs {before}"
    );
    // And says nothing about anything else.
    assert_eq!(
        size_of(body, "פרק"),
        size_of(&styled, "פרק"),
        "the ordinary heading was left alone"
    );
}

#[test]
fn the_doors_and_the_shared_command_are_one_store() {
    // One authority per class is the whole reason the doors are three lines
    // each: they are how you say it, and `_mk_cfg` is where it is said. Two
    // ways of writing one fact must not be able to disagree.
    let body = "#סימן[א׳][כותרת הסימן]\n";
    let by_door = format!("#הגדרות_סימן(גודל: 1.4em)\n{body}");
    let by_class = format!("#הגדרות_סימונים(גודל: (\"סימן\": 1.4em))\n{body}");
    assert_eq!(
        size_of(&by_door, "כותרת הסימן"),
        size_of(&by_class, "כותרת הסימן"),
        "the two spellings set the same thing"
    );
}

#[test]
fn a_per_class_write_leaves_the_other_classes_alone() {
    // The store is knob-major, so a class-major write has to merge rather than
    // replace: setting the siman must not wipe a size the sefer set for its
    // gemara references two lines earlier.
    let body = "#סימן[א׳][כותרת]\nו#גמרא[ברכות][ב.] כאן.\n";
    let both = format!("#הגדרות_גמרא(גודל: 0.7em)\n#הגדרות_סימן(גודל: 1.5em)\n{body}");
    let out = compile(&both, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let gemara_alone = size_of(&format!("#הגדרות_גמרא(גודל: 0.7em)\n{body}"), "ברכות")
        .expect("the gemara reference printed");
    let gemara_after = size_of(&both, "ברכות").expect("it still printed");
    assert_eq!(
        gemara_alone, gemara_after,
        "the second door left the first one's setting standing"
    );
}

#[test]
fn a_door_can_sweep_its_own_class_and_no_other() {
    // `כפה` through a per-command door is *every siman, no exceptions* — and it
    // has nothing to say about the other classes, which is the difference
    // between a door and the shared command.
    let body = "#סימן[א׳][ראשון]\n#סימן(גודל: 2em)[ב׳][שני]\nו#גמרא[ברכות][ב.] כאן.\n";
    let forced = format!("#הגדרות_סימן(גודל: 1.2em, כפה: true)\n#הגדרות_גמרא(גודל: 0.7em)\n{body}");
    let a = size_of(&forced, "ראשון").expect("the first printed");
    let b = size_of(&forced, "שני").expect("the second printed");
    assert_eq!(a, b, "the overrule swept this class's one-off back");
    let gemara = size_of(&forced, "ברכות").expect("the gemara reference printed");
    let alone =
        size_of(&format!("#הגדרות_גמרא(גודל: 0.7em)\n{body}"), "ברכות").expect("it printed");
    assert_eq!(gemara, alone, "and left the other class exactly as it was");
}

// ------------------------------------------------------------------ the parts
//
// As granular as it goes: a command's own look covers everything it prints, and
// several of them print more than one thing. Setting *the siman* larger should
// make all of it larger; setting *the number* bold should bold the number and
// leave the title alone. That is two settings, and there was one.

#[test]
fn a_pasuks_reference_is_settable_and_was_not() {
    // The plainest case in the prelude: `text(size: 0.82em, fill: luma(95))`
    // written inline, with no way for a writer to reach it.
    let body = "#פסוק[ברכות ב.][שמע ישראל]\n";
    let out = compile(body, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let quote = size_of(body, "שמע ישראל").expect("the quotation printed");
    let refr = size_of(body, "ברכות ב.").expect("the reference printed");
    assert!(
        refr < quote,
        "it ships smaller, as it always has: {refr} vs {quote}"
    );

    let styled = format!("#הגדרות_פסוק(מקור: (גודל: 1.2em))\n{body}");
    let out = compile(&styled, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let after = size_of(&styled, "ברכות ב.").expect("it still printed");
    assert!(
        after > refr,
        "and the writer can now reach it: {after} vs {refr}"
    );
    assert_eq!(
        quote,
        size_of(&styled, "שמע ישראל").expect("the quotation still printed"),
        "without touching the quotation"
    );
}

#[test]
fn a_simans_four_pieces_are_four_settings() {
    let body = "#סימן[א׳][דין נטילת ידים]\n";
    let title = size_of(body, "דין נטילת ידים").expect("the title printed");
    let word = size_of(body, "סימן").expect("the word printed");

    // The title alone.
    let styled = format!("#הגדרות_סימן(כותרת: (גודל: 1.5em))\n{body}");
    let out = compile(&styled, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    assert!(
        size_of(&styled, "דין נטילת ידים").expect("still there") > title,
        "the title took its own setting"
    );
    assert_eq!(
        word,
        size_of(&styled, "סימן").expect("still there"),
        "and the word `סימן` was left alone"
    );

    // …and the command's own look still covers all of it.
    let whole = format!("#הגדרות_סימן(גודל: 1.4em)\n{body}");
    assert!(
        size_of(&whole, "סימן").expect("still there") > word,
        "a size on the siman scales the word too"
    );
}

#[test]
fn a_gemara_reference_sets_its_masechta_and_its_daf_apart() {
    let body = "ועיין #גמרא[ברכות][ב.] שם.\n";
    let out = compile(body, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let styled = format!("#הגדרות_גמרא(מסכת: (גודל: 1.4em))\n{body}");
    let out = compile(&styled, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let masechta_before = size_of(body, "ברכות").expect("the masechta printed");
    let daf_before = size_of(body, "ב.").expect("the daf printed");
    assert!(
        size_of(&styled, "ברכות").expect("still there") > masechta_before,
        "the masechta took the setting"
    );
    assert_eq!(
        daf_before,
        size_of(&styled, "ב.").expect("still there"),
        "and the daf did not"
    );
}

#[test]
fn a_siman_can_say_a_different_word_or_none() {
    // The word `סימן` and the em dash are the command's own, not the writer's,
    // and a sefer that opens `סי׳ א׳` should be able to say so.
    let body = "#סימן[א׳][דין נטילת ידים]\n";
    let plain: String = runs(body).iter().map(|r| r.text.clone()).collect();
    assert!(plain.contains("סימן"), "it ships with the word: {plain}");

    let short = format!("#הגדרות_סימן(קידומת: (טקסט: \"סי׳\"))\n{body}");
    let out = compile(&short, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let page: String = runs(&short).iter().map(|r| r.text.clone()).collect();
    assert!(page.contains("סי׳"), "the writer's word prints: {page}");
    assert!(
        page.contains("דין נטילת ידים"),
        "and the title is untouched: {page}"
    );

    // Dropped entirely, number and all still there.
    let none_ = format!("#הגדרות_סימן(קידומת: (טקסט: \"\"), מפריד: (טקסט: \"\"))\n{body}");
    let out = compile(&none_, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let page: String = runs(&none_).iter().map(|r| r.text.clone()).collect();
    assert!(!page.contains("סימן א"), "the word is gone: {page}");
    assert!(page.contains("א׳"), "the number is not: {page}");
}

#[test]
fn a_piece_that_prints_the_writers_words_has_no_text_of_its_own() {
    // `טקסט` on the title would be accepted and ignored, which is the failure
    // this whole mechanism is against.
    let out = compile(
        "#הגדרות_סימן(כותרת: (טקסט: \"משהו\"))\n#סימן[א׳][כותרת]\n",
        &DocConfig::default(),
    );
    assert!(!out.ok(), "text on a writer's own piece compiled");
    let said = format!("{:?}", out.diagnostics);
    assert!(
        said.contains("כותרת"),
        "the message names the piece: {said}"
    );
}

#[test]
fn a_part_nobody_declared_stops_the_compile_and_names_the_ones_there_are() {
    let out = compile(
        "#הגדרות_סימן(כותרות: (גודל: 1.2em))\n#סימן[א׳][כותרת]\n",
        &DocConfig::default(),
    );
    assert!(!out.ok(), "a misspelled part compiled");
    let said = format!("{:?}", out.diagnostics);
    assert!(
        said.contains("כותרות"),
        "the message names what was written: {said}"
    );
    assert!(said.contains("מספר"), "and what it could have been: {said}");
}

#[test]
fn the_parts_do_not_reach_the_indexes_either() {
    // A siman is collected by its entry string, which is built before any of
    // this and must stay exactly what it was: the index is not a rendering.
    let body = "#הגדרות_סימן(מספר: (משקל: \"bold\"))\n#סימן[א׳][דין נטילת ידים]\n#רשימת_סימונים(\"סימן\")\n";
    let out = compile(body, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let page: String = runs(body).iter().map(|r| r.text.clone()).collect();
    assert!(
        page.matches("דין נטילת ידים").count() >= 2,
        "printed and listed: {page}"
    );
}

// ------------------------------------------------------------------ the blocks
//
// A quotation, a callout, a box, a warning and the title page's two lines drew
// with values written into the call — a callout's blue, a box's grey border,
// the padding they share — which a writer could see on the page and reach in no
// other way. What a block wants set is not a text look, so these have knobs of
// their own: fill, border, padding, corner, width, alignment.

#[test]
fn the_blocks_still_print_what_they_printed() {
    for body in [
        "#ציטוט[דברי הרב]\n",
        "#תיבה[בתוך התיבה]\n",
        "#הערת_צד[שימו לב]\n",
        "#אזהרה[זהירות]\n",
        "#הצלחה[יפה]\n",
        "#מקור[מן הספר]\n",
        "#שער[שם הספר]\n",
        "#תת_שער[תת כותרת]\n",
    ] {
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "{body} — {:?}", out.diagnostics);
        let page: String = runs(body).iter().map(|r| r.text.clone()).collect();
        assert!(!page.trim().is_empty(), "{body} printed nothing");
    }
}

#[test]
fn a_box_takes_its_own_border_and_leaves_the_callout_alone() {
    let body = "#תיבה[בתוך התיבה]\n#הערת_צד[שימו לב]\n";
    let styled = format!("#הגדרות_תיבה(מסגרת: 3pt + luma(0))\n{body}");
    let out = compile(&styled, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    // A border is not a text run, so what is asserted is that it compiles and
    // the text is where it was: the layout probe reads runs, and a stroke that
    // reached the wrong element would move them.
    assert_eq!(
        size_of(body, "שימו לב"),
        size_of(&styled, "שימו לב"),
        "the callout was left alone"
    );
}

#[test]
fn the_title_page_can_be_set() {
    let body = "#שער[שם הספר]\n#תת_שער[תת כותרת]\n";
    let styled = format!("#הגדרות_שער(גודל: 3em)\n{body}");
    let out = compile(&styled, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let before = size_of(body, "שם הספר").expect("the title printed");
    let after = size_of(&styled, "שם הספר").expect("it still printed");
    assert!(
        after > before,
        "the title took the setting: {after} vs {before}"
    );
    assert_eq!(
        size_of(body, "תת כותרת"),
        size_of(&styled, "תת כותרת"),
        "and the subtitle did not"
    );
}

#[test]
fn a_callouts_own_arguments_still_mean_what_they_meant() {
    // `#הערת_צד(גוון: …, קו: …)` was two parameters of one call and is two
    // knobs now. The same sentence in the same words has to keep working.
    let out = compile(
        "#הערת_צד(גוון: rgb(\"#fff7ed\"), קו: rgb(\"#ea580c\"))[שימו לב]\n",
        &DocConfig::default(),
    );
    assert!(out.ok(), "{:?}", out.diagnostics);
}

// -------------------------------------------------------- one for each header
//
// Heading levels had values per level and no way to *say* one: a writer wanting
// level 2 larger wrote the whole six-entry ramp as a tuple and hoped the other
// five were what they already were.

#[test]
fn each_heading_level_has_a_door() {
    let body = "#כותרת1[ראשונה]\n#כותרת2[שניה]\n";
    let styled = format!("#הגדרות_כותרת2(גודל: 2em)\n{body}");
    let out = compile(&styled, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    let one_before = size_of(body, "ראשונה").expect("level 1 printed");
    let two_before = size_of(body, "שניה").expect("level 2 printed");
    assert!(
        size_of(&styled, "שניה").expect("still there") > two_before,
        "level 2 took its own setting"
    );
    assert_eq!(
        one_before,
        size_of(&styled, "ראשונה").expect("still there"),
        "and level 1 was left where it was"
    );
}

#[test]
fn setting_one_level_does_not_flatten_the_ramp() {
    // The knob that is a *scalar* — weight is one value for every level — has to
    // spread into a ramp before one entry is written, or saying something about
    // level 3 says it about all six.
    let body = "#כותרת1[ראשונה]\n#כותרת3[שלישית]\n";
    let styled = format!("#הגדרות_כותרת3(משקל: \"regular\")\n{body}");
    let out = compile(&styled, &DocConfig::default());
    assert!(out.ok(), "{:?}", out.diagnostics);
    // Both still print, and level 1's size ramp is untouched by a weight write.
    assert_eq!(
        size_of(body, "ראשונה"),
        size_of(&styled, "ראשונה"),
        "level 1 is as it was"
    );
}

#[test]
fn a_heading_door_refuses_a_knob_it_has_no_answer_for() {
    let out = compile(
        "#הגדרות_כותרת1(גדול: 2em)\n#כותרת1[א]\n",
        &DocConfig::default(),
    );
    assert!(!out.ok(), "an unknown heading knob compiled");
    assert!(
        format!("{:?}", out.diagnostics).contains("גדול"),
        "the message names it"
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

// ------------------------------------------------------------------ the review
//
// The three review marks are the clearest case the rule has, because they had a
// channel already and it was the wrong one twice over. `#הגדרות_סקירה` took
// `צבע_הוספה`, `צבע_מחיקה` and `צבע_הערה` — three colours and nothing else, so a
// reviewer could recolour a deletion and not unstrike it, nor set it smaller,
// nor set one deletion differently from the rest. And it was a *second* table
// deciding what a mark looks like, beside the register that decides it for
// everything else.
//
// They are classes now. The switch still answers to the three colour names,
// because documents say them — but it writes into the register rather than into
// a store of its own, which is what makes it one setting with two spellings
// instead of two settings that agree until somebody uses both.

/// Every line drawn on the page. A strike and an underline are stroked shapes,
/// not glyphs, so `text_runs` cannot see either of them: a test written against
/// the runs passes exactly as happily when the line is dropped.
///
/// `probe::strokes` did not exist before these tests wanted it. `probe::fills`
/// reads `shape.fill` and finds a highlight; a line has no fill, so it found
/// nothing — which means no test in this repository could see an underline, a
/// strike, a horizontal rule or a block's border, on a page where all four are
/// among the things a reader notices first.
fn lines_on(body: &str) -> Vec<probe::Stroke> {
    let doc = probe::layout(body, &DocConfig::default()).expect("it lays out");
    probe::strokes(&doc)
}

#[test]
fn a_deletion_still_prints_struck_and_in_its_own_red() {
    // The values moved out of `#מחיקה` and into `_mk_defaults`. If that move
    // changed either of them, every review anybody has open redraws.
    let f = lines_on("הטקסט #מחיקה[הזה] נשאר.\n");
    assert!(
        f.iter().any(|f| f.colour == "#b91c1c"),
        "the strike is gone or is a different red: {f:?}"
    );
}

#[test]
fn an_insertion_still_prints_underlined_and_green() {
    let f = lines_on("הטקסט #הוספה[הזה] נוסף.\n");
    assert!(
        f.iter().any(|f| f.colour == "#15803d"),
        "the underline is gone or is a different green: {f:?}"
    );
}

#[test]
fn a_deletion_can_be_recoloured_through_a_door_of_its_own() {
    let f = lines_on("#הגדרות_מחיקה(צבע: rgb(\"#0000ff\"))\nהטקסט #מחיקה[הזה] נשאר.\n");
    assert!(f.iter().any(|f| f.colour == "#0000ff"), "{f:?}");
    assert!(
        !f.iter().any(|f| f.colour == "#b91c1c"),
        "the shipped red is still being drawn as well: {f:?}"
    );
}

#[test]
fn the_review_switch_and_the_class_door_are_one_setting() {
    // The whole point of routing the old spelling rather than keeping it. Two
    // stores would pass every test either of them was written for and disagree
    // the moment a document used both.
    let door = lines_on("#הגדרות_מחיקה(צבע: rgb(\"#0000ff\"))\nה#מחיקה[זה].\n");
    let switch = lines_on("#הגדרות_סקירה(צבע_מחיקה: rgb(\"#0000ff\"))\nה#מחיקה[זה].\n");
    assert!(switch.iter().any(|f| f.colour == "#0000ff"), "{switch:?}");
    assert_eq!(
        door.iter().map(|f| &f.colour).collect::<Vec<_>>(),
        switch.iter().map(|f| &f.colour).collect::<Vec<_>>(),
        "the old spelling paints something else"
    );
    // …and the switch's own settings are still its own.
    let out = compile(
        "#הגדרות_סקירה(תצוגה: \"סופי\")\nה#מחיקה[זה] נשאר.\n",
        &DocConfig::default(),
    );
    assert!(out.ok(), "{:?}", out.diagnostics);
}

#[test]
fn a_deletion_can_lose_the_stroke_it_could_never_reach() {
    // A knob that did not exist an hour ago. `#הגדרות_סקירה` had three colours
    // and no way to say *show me deletions in red without the line through
    // them*, because the `strike(` was written into the command.
    let f = lines_on("#הגדרות_מחיקה(קו_חוצה: false)\nהטקסט #מחיקה[הזה] נשאר.\n");
    assert!(
        !f.iter().any(|f| f.colour == "#b91c1c"),
        "the strike is still drawn: {f:?}"
    );
    // The words are still on the page. Losing the line must not lose the text.
    let out = compile(
        "#הגדרות_מחיקה(קו_חוצה: false)\nהטקסט #מחיקה[הזה] נשאר.\n",
        &DocConfig::default(),
    );
    assert!(out.ok(), "{:?}", out.diagnostics);
    assert!(
        runs("#הגדרות_מחיקה(קו_חוצה: false)\nהטקסט #מחיקה[הזה] נשאר.\n")
            .iter()
            .any(|r| r.text.contains("הזה")),
        "the deleted words went with the line"
    );
}

#[test]
fn a_comment_takes_a_size_and_the_marker_keeps_its_own() {
    // A comment rides the sidenote engine, so it prints a `✎` marker in the
    // line and its body in the margin. The class's size belongs to the body: a
    // comment set at 1.5em with a 1.5em pencil in the middle of the sentence is
    // not what anybody meant by *make my comments bigger*.
    let body = "שורה #הערת_עורך[הערה כאן] המשך.\n";
    let big = "#הגדרות_הערת_עורך(גודל: 1.5em)\nשורה #הערת_עורך[הערה כאן] המשך.\n";
    let before = size_of(body, "הערה כאן").expect("the comment printed");
    let after = size_of(big, "הערה כאן").expect("it still prints");
    assert!(
        after > before,
        "the comment kept its size: {after} vs {before}"
    );
    let marker_before = size_of(body, "✎").expect("the marker printed");
    let marker_after = size_of(big, "✎").expect("the marker still prints");
    assert_eq!(marker_before, marker_after, "the marker grew with the body");
}

#[test]
fn one_review_mark_can_differ_from_the_rest_of_its_class() {
    // The layer the old switch had no room for at all: three colours held one
    // value each, so *this* deletion could not be set apart from the others.
    let f = lines_on("ה#מחיקה(צבע: rgb(\"#0000ff\"))[זה] וגם ה#מחיקה[זה].\n");
    assert!(f.iter().any(|f| f.colour == "#0000ff"), "{f:?}");
    assert!(
        f.iter().any(|f| f.colour == "#b91c1c"),
        "the other one lost its class colour: {f:?}"
    );
}

#[test]
fn the_views_still_decide_what_prints() {
    // The half of `#הגדרות_סקירה` that is not a look, and had better not have
    // moved with the half that is.
    let src = "ה#הוספה[חדש] וה#מחיקה[ישן].\n";
    let final_ = format!("#הגדרות_סקירה(תצוגה: \"סופי\")\n{src}");
    let original = format!("#הגדרות_סקירה(תצוגה: \"מקורי\")\n{src}");
    let text_of = |s: &str| {
        runs(s)
            .iter()
            .map(|r| r.text.clone())
            .collect::<Vec<_>>()
            .join("")
    };
    assert!(
        text_of(&final_).contains("חדש"),
        "the final view lost the insertion"
    );
    assert!(
        !text_of(&final_).contains("ישן"),
        "the final view kept the deletion"
    );
    assert!(
        text_of(&original).contains("ישן"),
        "the original view lost the deletion"
    );
    assert!(
        !text_of(&original).contains("חדש"),
        "the original view kept the insertion"
    );
}

#[test]
fn a_review_knob_nothing_answers_to_stops_the_compile() {
    let out = compile("ה#מחיקה(גדול: 2em)[זה].\n", &DocConfig::default());
    assert!(!out.ok(), "a knob nothing answers to compiled");
    assert!(
        format!("{:?}", out.diagnostics).contains("גדול"),
        "{:?}",
        out.diagnostics
    );
}

// ----------------------------------------------- the four that print elsewhere
//
// A heading inside a note, an endnote's reference mark, and the two formulas.
// What they have in common is that none of them is the thing it looks like: a
// note heading is not one of the document's headings, an endnote mark is not the
// endnote, and a formula is not prose. Each drew a look nobody could reach, and
// one of them drew somebody else's.
//
// `#כותרת_בהערה` is the one worth reading twice. It read its weight and its
// colour off `#הגדרות_כותרות` — the document's real headings — which is a
// sensible default and was the only setting there was. Those stay the base, so
// nothing written before this reprints; what is new is that a sefer can now
// disagree with them.

#[test]
fn a_note_heading_still_follows_the_documents_headings() {
    let body = "#הגדרות_כותרות(צבע: rgb(\"#0000ff\"))\n#הערה[#כותרת_בהערה[פתיחה] הגוף]\n";
    let f = runs(body);
    let head = f
        .iter()
        .find(|r| r.text.contains("פתיחה"))
        .expect("the note heading printed");
    // The heading colour is not on a text run; it is what the run was filled
    // with, and `TextRun` carries no fill — so the assertion that can be made
    // here is the one that matters for the base: the heading is still bold and
    // still larger than the note body around it.
    let gof = f
        .iter()
        .find(|r| r.text.contains("הגוף"))
        .expect("the note body printed");
    assert!(
        head.weight >= 700,
        "the note heading lost its bold: {head:?}"
    );
    assert!(
        head.size > gof.size,
        "the note heading is no longer larger than its note: {head:?} vs {gof:?}"
    );
}

#[test]
fn a_note_heading_can_be_set_apart_from_the_documents_headings() {
    // The whole complaint. A sefer whose chapter titles are set one way and
    // whose lemmas in the notes are set another could not say so — and the two
    // have to move independently, which is two assertions rather than one.
    //
    // Not *larger than the chapter title*: a note heading is sized in ems of the
    // note it sits in, and a note is already 0.85 of the prose. A comparison
    // across the two measures the footnote size and calls it a control.
    let doc = "#כותרת1[פרק]\n\n#הערה[#כותרת_בהערה[פתיחה] הגוף]\n";
    let set = format!("#הגדרות_כותרת_בהערה(גודל: 2em)\n{doc}");
    let (before, after) = (runs(doc), runs(&set));
    let at = |f: &[probe::TextRun], needle: &str| {
        f.iter()
            .find(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle} printed"))
            .size
    };
    assert!(
        at(&after, "פתיחה") > at(&before, "פתיחה") * 1.5,
        "the note heading did not take its own size: {} vs {}",
        at(&after, "פתיחה"),
        at(&before, "פתיחה")
    );
    assert!(
        (at(&after, "פרק") - at(&before, "פרק")).abs() < 0.01,
        "setting the note headings moved the document's headings: {} vs {}",
        at(&after, "פרק"),
        at(&before, "פרק")
    );
}

#[test]
fn one_note_heading_can_differ_from_the_rest() {
    let f =
        runs("#הערה[#כותרת_בהערה(משקל: \"regular\")[רכה] הגוף] #הערה[#כותרת_בהערה[עבה] הגוף]\n");
    let soft = f.iter().find(|r| r.text.contains("רכה")).expect("printed");
    let hard = f.iter().find(|r| r.text.contains("עבה")).expect("printed");
    assert!(
        soft.weight < hard.weight,
        "the instance override did not reach the page: {soft:?} vs {hard:?}"
    );
}

#[test]
fn a_note_heading_refuses_a_knob_nothing_answers_to() {
    let out = compile(
        "#הערה[#כותרת_בהערה(גדול: 2em)[פתיחה] הגוף]\n",
        &DocConfig::default(),
    );
    assert!(!out.ok(), "a knob nothing answers to compiled");
    assert!(
        format!("{:?}", out.diagnostics).contains("גדול"),
        "{:?}",
        out.diagnostics
    );
}

#[test]
fn an_endnote_mark_takes_a_size_and_the_note_body_does_not() {
    // The class covers the mark this command leaves in the text, and nothing
    // else: the body is printed by `#הערות_בסוף`, which is its own command. One
    // command styling another's output is the second authority this register is
    // here to prevent, so the assertion is in two directions.
    let body = "#הגדרות_הערתסיום(גודל: 2em)\nהטקסט#הערתסיום[גוף ההערה] נמשך.\n\n#הערות_בסוף()\n";
    let f = runs(body);
    let note = f
        .iter()
        .find(|r| r.text.contains("גוף ההערה"))
        .expect("the endnote body printed");
    let plain = f
        .iter()
        .find(|r| r.text.contains("נמשך"))
        .expect("the prose printed");
    assert!(
        (note.size - plain.size).abs() < 0.6,
        "the mark's size leaked into the endnote body: {note:?} vs {plain:?}"
    );
    // …and the door reaches the mark, which is the half that would otherwise
    // pass by doing nothing at all.
    assert!(
        f.iter().any(|r| r.size > plain.size * 1.5),
        "nothing on the page took the mark's size: {f:?}"
    );
}

#[test]
fn a_displayed_formula_and_an_inline_one_are_set_separately() {
    // Two commands, two decisions. A sefer that wants its displayed equations
    // smaller than the prose is saying nothing about the `x` mid-sentence, and
    // there was one control for both — which is to say, none.
    let body =
        "#הגדרות_נוסחה(גודל: 2em)\n#נוסחה(\"alpha\")\n\nהטקסט #נוסחה_בשורה(\"beta\") נמשך.\n";
    let f = runs(body);
    // The glyphs are the mathematical-italic codepoints rather than the plain
    // letters — `alpha` in math mode lays out as U+1D6FC — so a search for "α"
    // finds nothing, which is a passing test looking for a missing formula.
    let math = |c: u32| char::from_u32(c).unwrap();
    let big = f
        .iter()
        .find(|r| r.text.contains(math(0x1D6FC)))
        .expect("the displayed formula printed");
    let small = f
        .iter()
        .find(|r| r.text.contains(math(0x1D6FD)))
        .expect("the inline formula printed");
    assert!(
        big.size > small.size * 1.5,
        "one door moved both formulas, or neither: {big:?} vs {small:?}"
    );
}

#[test]
fn a_formula_is_still_set_left_to_right() {
    // `dir: ltr` is not a knob and the register must not have swallowed it.
    // Mathematics reads left to right inside a right-to-left document, which is
    // the entire reason this command wraps `math.equation` at all.
    // Not on the order of `a` and `b`: Typst lays an equation's own glyphs out
    // left to right whatever the surrounding direction, so that assertion is
    // green with the wrapper removed — a test that cannot fail for the reason it
    // was written under, which this repository calls `ONLY_AT_TOP`.
    //
    // What the wrapper actually holds is everything *around* the mathematics.
    // Drop it and the equation goes flush to the left margin instead of centred,
    // and its number comes out `)1(` — the parentheses mirrored, because they
    // are ordinary text in a right-to-left paragraph. Both are on the page, so
    // both are asserted.
    let f = runs("טקסט\n\n#נוסחה(\"a + b\", ממוספרת: true)\n");
    assert!(
        f.iter().any(|r| r.text.contains("(1)")),
        "the equation number came out mirrored: {f:?}"
    );
    let eq = f
        .iter()
        .find(|r| r.text.contains(char::from_u32(0x1D44E).unwrap()))
        .expect("the formula printed");
    assert!(
        eq.x > 100.0,
        "the equation went flush to the left margin: {eq:?}"
    );
}

#[test]
fn a_formula_knob_nothing_answers_to_stops_the_compile() {
    let out = compile("#נוסחה(\"x\", גדול: 2em)\n", &DocConfig::default());
    assert!(!out.ok(), "a knob nothing answers to compiled");
    assert!(
        format!("{:?}", out.diagnostics).contains("גדול"),
        "{:?}",
        out.diagnostics
    );
}

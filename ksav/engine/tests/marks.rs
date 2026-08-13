//! The mark register — a class of marks, gathered, styled as a set, exempted one
//! at a time.
//!
//! The argument this whole mechanism answers, in the writer's own words, about
//! `#דיבור_המתחיל`: *"these should be able to be collected. If not, it is just
//! bold."* It was `strong(body)`. The only thing separating it from typing the
//! formatting by hand was a name in the source, and a name no surface ever reads
//! is decoration.
//!
//! Three claims, and every one of them is read off the rendered page:
//!
//!   1. every mark of a class is gathered, with the page it landed on;
//!   2. a class can be styled as a set;
//!   3. one mark can overrule that, or opt out of it — and `כפה` on the class
//!      overrules both back.

mod common;
use common::{render, render_with, text};

use ksav_engine::probe::{self, TextRun};
use ksav_engine::DocConfig;

// ── reading the page ────────────────────────────────────────────────────────

fn size_of(runs: &[TextRun], needle: &str) -> f64 {
    runs.iter()
        .find(|r| r.text.contains(needle))
        .map(|r| r.size)
        .unwrap_or_else(|| {
            panic!(
                "nothing on the page holds {needle:?}; it held: {:?}",
                runs.iter().map(|r| r.text.as_str()).collect::<Vec<_>>()
            )
        })
}

fn weight_of(runs: &[TextRun], needle: &str) -> u16 {
    runs.iter()
        .find(|r| r.text.contains(needle))
        .map(|r| r.weight)
        .unwrap_or_else(|| panic!("nothing on the page holds {needle:?}"))
}

/// Everything printed from `heading` onwards — the list and nothing before it.
///
/// A mark prints where it was written, so searching the whole document for a
/// lemma finds it in the prose long before it finds the list at the back.
fn list_text(runs: &[TextRun], heading: &str) -> String {
    let all = text(runs);
    let at = all
        .find(heading)
        .unwrap_or_else(|| panic!("{heading:?} was never printed. Page reads: {all}"));
    all[at..].to_string()
}

fn refuses(body: &str) -> String {
    match probe::layout(body, &DocConfig::default()) {
        Ok(_) => panic!("expected a compile error, and it compiled: {body:?}"),
        Err(diags) => diags
            .iter()
            .map(|d| d.message.clone())
            .collect::<Vec<_>>()
            .join(" | "),
    }
}

// ── one mechanism over a class of marks ─────────────────────────────────────

/// The headline claim: a lemma is no longer just bold.
#[test]
fn every_lemma_of_a_class_is_gathered_into_one_list() {
    let body = "\
#דיבור_המתחיל[ותנא קמא] סבר כך.

#מעבר_עמוד

#דיבור_המתחיל[והרמב״ם] פסק אחרת.

#רשימת_סימונים(\"דיבור_המתחיל\")";
    let runs = render(body);
    let list = list_text(&runs, "רשימת הדיבורים המתחילים");
    assert!(
        list.contains("ותנא קמא") && list.contains("והרמב״ם"),
        "both lemmas belong in the list: {list}"
    );
}

/// One printer, not one per mark. The same command, given a different class.
#[test]
fn the_same_command_lists_any_class_of_mark() {
    let body = "\
#גמרא(\"ברכות\", \"ב.\") ו#ציון[רמב״ם הל׳ תפילין]

#רשימת_סימונים(\"גמרא\")
#רשימת_סימונים(\"ציון\")";
    let runs = render(body);
    let gemara = list_text(&runs, "מראי המקומות בגמרא");
    assert!(
        gemara.contains("ברכות ב."),
        "the gemara list should hold the reference: {gemara}"
    );
    let refs = list_text(&runs, "רשימת הציונים");
    assert!(
        refs.contains("רמב״ם"),
        "the reference list should hold the citation: {refs}"
    );
    // Neither list may hold the other's marks. One label, filtered by class — so
    // this is the assertion that the filter is really there.
    let between = &gemara[..gemara.find("רשימת הציונים").unwrap_or(gemara.len())];
    assert!(
        !between.contains("רמב״ם"),
        "a ציון has no business in the gemara list: {between}"
    );
}

/// A page number is a fact about the finished layout, which is the only reason
/// this is worth a mechanism rather than a hand-typed list.
#[test]
fn a_mark_is_listed_with_the_page_it_landed_on() {
    let body = "\
פתיחה.

#מעבר_עמוד

#ציון[שולחן ערוך]

#מעבר_עמוד

#רשימת_סימונים(\"ציון\")";
    let runs = render(body);
    let list = list_text(&runs, "רשימת הציונים");
    assert!(
        list.contains('2'),
        "the citation is on page 2 and the list should say so: {list}"
    );
}

/// The same collapsing the indexes do, because it is the same printer underneath.
#[test]
fn one_mark_repeated_is_one_entry_with_a_range_of_pages() {
    let body = "\
#ציון[רמב״ם]

#מעבר_עמוד

#ציון[רמב״ם]

#מעבר_עמוד

#ציון[רמב״ם]

#רשימת_סימונים(\"ציון\")";
    let runs = render(body);
    let list = list_text(&runs, "רשימת הציונים");
    assert_eq!(
        list.matches("רמב״ם").count(),
        1,
        "one citation, cited three times, is one entry: {list}"
    );
    assert!(list.contains("1–3"), "consecutive pages collapse: {list}");
}

/// Order of first appearance is the order of the sefer, and the default.
#[test]
fn marks_are_listed_in_the_order_they_were_written() {
    let body = "\
#דיבור_המתחיל[תניא] … #דיבור_המתחיל[אביי] … #דיבור_המתחיל[גמרא]

#רשימת_סימונים(\"דיבור_המתחיל\")";
    let runs = render(body);
    let list = list_text(&runs, "רשימת הדיבורים המתחילים");
    let at = |s: &str| list.find(s).unwrap_or_else(|| panic!("{s} missing: {list}"));
    assert!(at("תניא") < at("אביי") && at("אביי") < at("גמרא"), "{list}");
}

#[test]
fn a_list_can_be_sorted_alphabetically_instead() {
    let body = "\
#דיבור_המתחיל[תניא] … #דיבור_המתחיל[אביי] … #דיבור_המתחיל[גמרא]

#רשימת_סימונים(\"דיבור_המתחיל\", מיון: true)";
    let runs = render(body);
    let list = list_text(&runs, "רשימת הדיבורים המתחילים");
    let at = |s: &str| list.find(s).unwrap_or_else(|| panic!("{s} missing: {list}"));
    assert!(at("אביי") < at("גמרא") && at("גמרא") < at("תניא"), "{list}");
}

/// The same rule the indexes keep: nothing marked, nothing printed. A sefer with
/// no lemmas should not grow a page that says "the lemmas" and stops.
#[test]
fn a_list_of_nothing_prints_nothing() {
    let runs = render("סתם טקסט.\n\n#רשימת_סימונים(\"דיבור_המתחיל\")");
    assert!(!text(&runs).contains("רשימת הדיבורים המתחילים"));
}

/// The class the argument was made about is not the only one. A siman is a
/// heading and takes heading styles; it registers all the same, so a sefer can
/// print its own table of simanim without a second mechanism.
#[test]
fn a_heading_mark_registers_without_being_styled_here() {
    let body = "\
#סימן[א׳][דיני תפילין]

גוף.

#סימן[ב׳][דיני ציצית]

גוף.

#רשימת_סימונים(\"סימן\")";
    let runs = render(body);
    let list = list_text(&runs, "רשימת הסימנים");
    assert!(
        list.contains("דיני תפילין") && list.contains("דיני ציצית"),
        "both simanim belong in the list: {list}"
    );
}

/// `#מראה_מקום` and `#מקור_חי` were already collected — by their own label, by
/// their own command. They now register in the same place as everything else, and
/// `#מראה_מקומות` still prints exactly what it printed.
#[test]
fn the_source_notes_still_collect_through_the_shared_register() {
    let body = "\
דבר#מראה_מקום(מקור: \"girsa:bavli/berakhot/2a:1\")[ברכות ב.] אחד.

#מראה_מקומות(כותרת: [מראי מקומות])

#רשימת_סימונים(\"מראה_מקום\")";
    let runs = render(body);
    let all = text(&runs);
    assert!(all.contains("מראי מקומות"), "the old printer still runs: {all}");
    let list = list_text(&runs, "רשימת מראי המקומות");
    assert!(
        list.contains("ברכות ב."),
        "and the general list sees the same mark: {list}"
    );
}

// ── styling a collection ────────────────────────────────────────────────────

/// Layer 1 for a set: every mark of the class, restyled by one line.
#[test]
fn a_class_can_be_styled_as_a_set() {
    let plain = render("#ציון[אחד] ו#ציון[שנים]");
    let styled = render("#הגדרות_סימונים(גודל: (\"ציון\": 2em))\n\n#ציון[אחד] ו#ציון[שנים]");
    assert!(
        size_of(&styled, "אחד") > size_of(&plain, "אחד") + 4.0,
        "the class style did not reach the first mark"
    );
    assert!(
        size_of(&styled, "שנים") > size_of(&plain, "שנים") + 4.0,
        "…nor the second, which is what makes it a set and not an instance"
    );
}

/// One dictionary per knob, keyed by class — so two classes are two keys and
/// neither takes the other's setting.
#[test]
fn styling_one_class_leaves_the_others_alone() {
    let body = "\
#הגדרות_סימונים(גודל: (\"ציון\": 2em))

#ציון[מוגדל] ו#דיבור_המתחיל[רגיל]";
    let runs = render(body);
    assert!(
        size_of(&runs, "מוגדל") > size_of(&runs, "רגיל") + 4.0,
        "the ציון setting reached a דיבור המתחיל"
    );
}

/// A plain value instead of a dictionary is the answer for every class, which is
/// what a writer means by *"make all the marks smaller"*.
#[test]
fn a_scalar_styles_every_class_at_once() {
    let body = "\
#הגדרות_סימונים(גודל: 2em)

#ציון[אחד] ו#דיבור_המתחיל[שנים]";
    let runs = render(body);
    let plain = render("#ציון[אחד] ו#דיבור_המתחיל[שנים]");
    assert!(size_of(&runs, "אחד") > size_of(&plain, "אחד") + 4.0);
    assert!(size_of(&runs, "שנים") > size_of(&plain, "שנים") + 4.0);
}

// ── per-instance override, and the exemption ────────────────────────────────

/// Layer 2. Same shape as every other kind's, because it is the same merge.
#[test]
fn one_mark_can_overrule_its_class() {
    let body = "\
#הגדרות_סימונים(גודל: (\"ציון\": 0.8em))

#ציון[רגיל] ו#ציון(גודל: 2em)[חורג]";
    let runs = render(body);
    assert!(
        size_of(&runs, "חורג") > size_of(&runs, "רגיל") + 4.0,
        "the per-mark override did not reach the page"
    );
}

/// *"and maybe exempt some"* — the word in the request, and a different want from
/// the override: not *this one is set differently* but *this one is not in the
/// set's styling at all*.
#[test]
fn one_mark_can_be_exempted_from_its_class_styling() {
    let body = "\
#הגדרות_סימונים(גודל: (\"ציון\": 2em))

#ציון[בקבוצה] ו#ציון(פטור: true)[פטור]";
    let runs = render(body);
    assert!(
        size_of(&runs, "בקבוצה") > size_of(&runs, "פטור") + 4.0,
        "the exempt mark kept the class's size"
    );
    // Back to the *shipped* look and not to nothing: an exemption is from the
    // class, not from the command.
    let plain = render("#ציון[פטור]");
    assert!(
        (size_of(&runs, "פטור") - size_of(&plain, "פטור")).abs() < 0.01,
        "an exempt ציון should look like a plain one"
    );
}

/// The other half of the exemption, and deliberately a second word: one mark is
/// not worth listing, and that is not the same request as *style it differently*.
#[test]
fn one_mark_can_be_kept_out_of_the_list_while_still_printing() {
    let body = "\
#ציון[ברשימה] ו#ציון(ברשימה: false)[מושמט]

#רשימת_סימונים(\"ציון\")";
    let runs = render(body);
    let all = text(&runs);
    assert!(all.contains("מושמט"), "it still prints where it stands: {all}");
    let list = list_text(&runs, "רשימת הציונים");
    assert!(list.contains("ברשימה"), "the listed one belongs: {list}");
    assert!(!list.contains("מושמט"), "the omitted one does not: {list}");
}

/// Layer 3, and it has to reach past the exemption as well as past the override —
/// an exemption is exactly one of the hundred one-off decisions `כפה` exists to
/// sweep up when a sefer has to be made uniform again.
#[test]
fn the_overrule_switch_stomps_both_the_override_and_the_exemption() {
    let body = "\
#הגדרות_סימונים(כפה: true, גודל: (\"ציון\": 2em))

#ציון[רגיל] ו#ציון(גודל: 0.6em)[חורג] ו#ציון(פטור: true)[פטור]";
    let runs = render(body);
    let plain = size_of(&runs, "רגיל");
    assert!(
        (size_of(&runs, "חורג") - plain).abs() < 0.01,
        "an override survived כפה"
    );
    assert!(
        (size_of(&runs, "פטור") - plain).abs() < 0.01,
        "an exemption survived כפה"
    );
}

/// Without the switch, the same document has three different sizes — the check
/// that the test above is measuring the switch and not a collapsed difference.
#[test]
fn without_the_switch_the_three_marks_differ() {
    let body = "\
#הגדרות_סימונים(גודל: (\"ציון\": 2em))

#ציון[רגיל] ו#ציון(גודל: 0.6em)[חורג] ו#ציון(פטור: true)[פטור]";
    let runs = render(body);
    let plain = size_of(&runs, "רגיל");
    assert!(size_of(&runs, "חורג") < plain - 4.0, "the override should differ");
    assert!(size_of(&runs, "פטור") < plain - 4.0, "the exemption should differ");
}

// ── the shipped look, and the knobs that reach it ───────────────────────────

/// The look each class ships with survives being routed through the register:
/// `#דיבור_המתחיל` is the class whose whole complaint was that bold is *all* it
/// was, and it had better still be bold.
#[test]
fn a_lemma_is_still_bold() {
    let runs = render("#דיבור_המתחיל[מודגש] ורגיל.");
    assert!(weight_of(&runs, "מודגש") >= 600, "the lemma lost its weight");
    assert!(weight_of(&runs, "ורגיל") < 600, "and the prose did not gain any");
}

/// The slant is **not** asserted, and the reason is worth writing down rather
/// than leaving as a gap.
///
/// `italic` on a run is *the face the glyphs came from*, and not one family this
/// engine bundles ships an italic face — which is why `#נטוי` produces a warning
/// saying so (`italic_warning` in `lib.rs`). So `#גמרא`'s italic has never
/// reached a glyph, before this change or after it, and an assertion here would
/// read false either way: a test that cannot pass proves as little as one that
/// cannot fail.
///
/// Size and weight go through the identical two lines of `_mk_render`, and they
/// are asserted above and throughout. What is untested is the font book, not the
/// register.
///
/// The standing defect this leaves — four commands and three `#הגדרות_*` knobs
/// promise a slant the shipped fonts cannot give, and only `#נטוי` says so — is
/// a font-capability problem across the whole prelude rather than this
/// mechanism's, and is recorded as its own piece of work.
#[test]
fn a_slant_the_font_has_not_got_still_leaves_the_words_on_the_page() {
    let runs = render("#גמרא(\"ברכות\", \"ב.\") ורגיל.");
    assert!(
        text(&runs).contains("ברכות ב."),
        "the reference should print whatever the face can manage"
    );
}

/// `סוגריים` was a parameter of `#ציון_מקור` alone and is now one of the register's
/// knobs, so it means the same thing on every class and can be set for a whole
/// class at once.
#[test]
fn the_brackets_knob_works_on_a_class_and_on_one_mark() {
    let none = render("#ציון(סוגריים: false)[בלי]");
    assert!(!text(&none).contains("(בלי)"), "brackets survived being switched off");
    let one = render("#ציון_מקור(\"ברכות\", מקום: \"ב.\", סוגריים: true)");
    assert!(text(&one).contains("(ברכות ב.)"), "the citation should be bracketed");
    let all = render("#הגדרות_סימונים(סוגריים: (\"ציון_מקור\": true))\n\n#ציון_מקור(\"ברכות\", מקום: \"ב.\")");
    assert!(
        text(&all).contains("(ברכות ב.)"),
        "the class setting should bracket every citation"
    );
}

// ── the same commands, in English ───────────────────────────────────────────

#[test]
fn an_english_document_can_name_its_classes_in_english() {
    let body = "\
#marks_config(size: (\"gemara\": 2em))

#gemara(\"Berakhos\", \"2a\") and #gemara(\"Shabbos\", \"3b\", exempt: true)

#marklist(\"gemara\")";
    let runs = render_with(
        body,
        &DocConfig {
            dir: "ltr".to_string(),
            ..DocConfig::default()
        },
    );
    assert!(
        size_of(&runs, "Berakhos") > size_of(&runs, "Shabbos") + 4.0,
        "the English class name did not reach the English mark"
    );
    let list = list_text(&runs, "Berakhos 2a");
    assert!(
        list.contains("Shabbos 3b"),
        "an exemption is from the styling, not from the list: {list}"
    );
}

// ── and a misspelled knob still stops the compile ───────────────────────────

/// The trade this repo has made before and had to undo: an override layer that
/// swallows what it does not recognise has replaced a loud error with a control
/// that silently does nothing.
#[test]
fn a_knob_the_register_has_no_answer_for_is_refused_by_name() {
    let message = refuses("#ציון(גופן: \"David\")[אחד]");
    assert!(
        message.contains("גופן"),
        "the refusal should name the argument: {message}"
    );
}

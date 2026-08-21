//! Numbering that starts again, and the two halves of it that must agree.
//!
//! # The report
//!
//! > *"Note numbering should be restartable rather than running unbroken through
//! > a whole sefer — most importantly in the endnote section, where per-chapter
//! > numbering is the normal convention. Wanted: automatic restart at a chosen
//! > structural level, plus explicit restart and explicit continue commands the
//! > writer can place by hand."*
//!
//! # Why every assertion here reads the page
//!
//! An apparatus numbers twice: the **marker** in the sefer is a query — how many
//! notes lie before this one — and the **entry** in the band is numbered by
//! walking the collected list. The defect immediately before this one was those
//! two disagreeing, and it looked like working software from either side alone.
//! So a restart is only real if both halves restart, and the only way to see
//! both is to read what printed.
//!
//! The bodies are given distinct words for that reason: `שלישי` prints beside
//! its own number wherever the band puts it, and asking which number is on the
//! line that holds it is an assertion no amount of rearranging can fool.

use ksav_engine::{compile_doc, main_source, pagetext, DocConfig};
use typst::syntax::Source;

/// Every printed line of a document, in page order.
fn lines_of(body: &str) -> Vec<String> {
    let cfg = DocConfig::default();
    let doc = compile_doc(body, &cfg).expect("the document lays out");
    let main = Source::detached(main_source(body, &cfg));
    pagetext::page_text(&doc, &main, body)
        .into_iter()
        .flatten()
        .map(|l| l.text)
        .collect()
}

/// The printed line holding `word`, or a failure naming the whole page.
fn line_with(lines: &[String], word: &str) -> String {
    lines
        .iter()
        .find(|l| l.contains(word))
        .unwrap_or_else(|| panic!("nothing printed with {word:?} on it: {lines:?}"))
        .clone()
}

/// The digits on the line holding `word`, in order — the entry's number, and
/// any other number that shares its line.
fn digits_by(lines: &[String], word: &str) -> String {
    line_with(lines, word)
        .chars()
        .filter(char::is_ascii_digit)
        .collect()
}

/// Two chapters, three endnotes, and a knob at the top.
fn sefer(config: &str, second_chapter_prefix: &str) -> String {
    format!(
        "{config}\n= פרק א\n\nאלף#הערתסיום[ראשון] בית#הערתסיום[שני]\n\n\
         = פרק ב\n{second_chapter_prefix}\nגימל#הערתסיום[שלישי]\n\n#הערות_בסוף()\n"
    )
}

#[test]
fn a_sefer_that_says_nothing_numbers_straight_through() {
    // The default, and the reason it is the default: every sefer written in
    // Ksav so far numbers this way, and a scheme that changes under a document
    // on upgrade is not an improvement.
    let lines = lines_of(&sefer("", ""));
    assert_eq!(
        digits_by(&lines, "שלישי"),
        "3",
        "the third endnote should still be 3: {lines:?}"
    );
}

#[test]
fn a_chapter_can_start_the_count_again() {
    // The convention the item is about: per-chapter endnotes.
    let lines = lines_of(&sefer("#הגדרות_מספור(אפס_לפי: 1)", ""));
    assert_eq!(
        digits_by(&lines, "שלישי"),
        "1",
        "the first endnote of chapter two should be 1: {lines:?}"
    );
    assert_eq!(
        digits_by(&lines, "שני"),
        "2",
        "the second endnote of chapter one should still be 2: {lines:?}"
    );
}

#[test]
fn the_marker_restarts_with_the_entry() {
    // **Both halves, or neither.** The marker is a query and the entry is a
    // walk, and the defect before this one was exactly those two disagreeing —
    // an apparatus whose band read 1, 2, 1 while the sefer read ¹ ² ³ would
    // pass every assertion written against the band.
    let lines = lines_of(&sefer("#הגדרות_מספור(אפס_לפי: 1)", ""));
    let body = line_with(&lines, "גימל");
    assert!(
        body.contains("גימל1"),
        "the marker in the sefer did not restart with the entry: {body:?}"
    );
}

#[test]
fn a_writer_can_start_the_count_again_by_hand() {
    // No automatic rule at all: the command alone.
    let lines = lines_of(&sefer("", "#התחל_מספור()"));
    assert_eq!(
        digits_by(&lines, "שלישי"),
        "1",
        "an explicit restart did nothing: {lines:?}"
    );
}

#[test]
fn a_writer_can_carry_the_count_on_through_an_automatic_restart() {
    // The half that makes the automatic rule safe to have. Without it, a rule
    // that is wrong in one chapter is a rule the writer turns off for the whole
    // sefer.
    let lines = lines_of(&sefer("#הגדרות_מספור(אפס_לפי: 1)", "#המשך_מספור()"));
    assert_eq!(
        digits_by(&lines, "שלישי"),
        "3",
        "the count did not carry on through the chapter: {lines:?}"
    );
}

#[test]
fn continuing_carries_on_rather_than_going_back_to_the_start() {
    // `#המשך_מספור` restores the count that was in force *before* the restart
    // above it, not "no restart at all". In a third chapter, continuing has to
    // mean carrying on from chapter two — which, with chapter two having
    // restarted, is 2 and not 4.
    let body = concat!(
        "#הגדרות_מספור(אפס_לפי: 1)\n",
        "= פרק א\n\nאלף#הערתסיום[ראשון]\n\n",
        "= פרק ב\n\nבית#הערתסיום[שני]\n\n",
        "= פרק ג\n#המשך_מספור()\n\nגימל#הערתסיום[שלישי]\n\n",
        "#הערות_בסוף()\n"
    );
    let lines = lines_of(body);
    assert_eq!(
        digits_by(&lines, "שלישי"),
        "2",
        "continuing went back to the start of the sefer: {lines:?}"
    );
}

#[test]
fn a_deeper_heading_does_not_restart_a_chapter_count() {
    // `אפס_לפי: 1` means level one and above, not every heading. A sub-heading
    // inside a chapter restarting the chapter's notes would make the setting
    // useless for the arrangement it exists for.
    let body = concat!(
        "#הגדרות_מספור(אפס_לפי: 1)\n",
        "= פרק א\n\nאלף#הערתסיום[ראשון]\n\n",
        "== סעיף\n\nבית#הערתסיום[שני]\n\n",
        "#הערות_בסוף()\n"
    );
    let lines = lines_of(body);
    assert_eq!(
        digits_by(&lines, "שני"),
        "2",
        "a level-two heading restarted a level-one count: {lines:?}"
    );
}

#[test]
fn the_level_is_the_writers_to_choose() {
    // The same document, restarting at level two because the writer said so.
    let body = concat!(
        "#הגדרות_מספור(אפס_לפי: 2)\n",
        "= פרק א\n\nאלף#הערתסיום[ראשון]\n\n",
        "== סעיף\n\nבית#הערתסיום[שני]\n\n",
        "#הערות_בסוף()\n"
    );
    let lines = lines_of(body);
    assert_eq!(
        digits_by(&lines, "שני"),
        "1",
        "the chosen level did not restart the count: {lines:?}"
    );
}

#[test]
fn footnotes_restart_too_and_not_only_endnotes() {
    // The item names the endnote section as the important case, and this
    // repository's recorded failure is fixing the named instance and leaving
    // the siblings — so the page-foot apparatus is asserted as well.
    let body = concat!(
        "#הגדרות_מספור(אפס_לפי: 1)\n",
        "= פרק א\n\nאלף#הערה[ראשון] בית#הערה[שני]\n\n",
        "= פרק ב\n\nגימל#הערה[שלישי]\n"
    );
    let lines = lines_of(body);
    let at = line_with(&lines, "גימל");
    assert!(
        at.contains("גימל1"),
        "the footnote marker did not restart: {at:?}"
    );
}

#[test]
fn an_unknown_setting_is_refused_rather_than_ignored() {
    // A knob that compiles and does nothing is worse than one that does not
    // compile: the writer reads the page, sees the old numbering, and has no
    // way to tell a misspelling from a feature that does not work.
    let cfg = DocConfig::default();
    assert!(
        compile_doc("#הגדרות_מספור(אפס_לפיי: 1)\nאלף\n", &cfg).is_err(),
        "a misspelt setting compiled"
    );
}

#[test]
fn the_side_column_restarts_too() {
    // **The sibling.** Five of the six note apparatuses reach the restart
    // through `_ap_note` or through the endnote section; the side column
    // numbers itself, in a function of its own, and the first pass through this
    // item left it out. Naming a class in prose, fixing the named instances and
    // leaving a sibling is this repository's recorded failure mode, and it
    // happened again inside the change that was written to end it.
    let body = concat!(
        "#הגדרות_מספור(אפס_לפי: 1)\n",
        "#עם_הערות_צד[\n",
        "= פרק א\n\nאלף#הערת_גיליון[ראשון] בית#הערת_גיליון[שני]\n\n",
        "= פרק ב\n\nגימל#הערת_גיליון[שלישי]\n",
        "]\n"
    );
    let lines = lines_of(body);
    let at = line_with(&lines, "גימל");
    assert!(
        // The side column letters its markers rather than numbering them, so
        // the first note of chapter two reads א. Asserting `1` here would be an
        // assertion about the numbering *scheme* wearing the name of one about
        // the restart — and it would fail on working software.
        at.contains("גימלא"),
        "the sidenote marker did not restart: {at:?}\n  page: {lines:?}"
    );
}

#[test]
fn a_side_column_still_stacks_its_notes_when_two_share_a_number() {
    // The hazard the restart introduces here and nowhere else: the column
    // stacks by measuring every note on the page and matching *itself* among
    // them. Match by the printed number and two notes either side of a restart
    // — which can share one — put each other at the wrong height. Identity is
    // document-wide and only the printed number restarts.
    //
    // Asserted by what a reader would notice: three notes, three distinct
    // heights, none of them on top of another.
    let body = concat!(
        "#הגדרות_מספור(אפס_לפי: 1)\n",
        "#עם_הערות_צד[\n",
        "= פרק א\n\nאלף#הערת_גיליון[ראשון]\n\n",
        "= פרק ב\n\nבית#הערת_גיליון[שני] גימל#הערת_גיליון[שלישי]\n",
        "]\n"
    );
    let cfg = DocConfig::default();
    let doc = compile_doc(body, &cfg).expect("the document lays out");
    let runs = ksav_engine::probe::text_runs(&doc);
    let mut heights: Vec<i64> = ["ראשון", "שני", "שלישי"]
        .iter()
        .map(|word| {
            runs.iter()
                .find(|r| r.text.contains(word))
                .unwrap_or_else(|| panic!("{word} did not print"))
                .y as i64
        })
        .collect();
    heights.sort_unstable();
    heights.dedup();
    assert_eq!(heights.len(), 3, "two sidenotes were stacked at one height");
}

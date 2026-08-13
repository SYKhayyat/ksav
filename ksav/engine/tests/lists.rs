//! What a list looks like at every depth, and where it starts counting.
//!
//! Two knobs describe a whole nest rather than one list. Typst reads a marker
//! array and a numbering pattern **by depth** — `("–", "·")` and `"1.א.i."` —
//! so the second entry is what a sub-list looks like. Passed as a field on the
//! element, which is what `#רשימה` and `#ממוספרת` used to do, the answer
//! reaches that list's own items and stops: the list nested inside an item is a
//! separate call with a separate field, and it falls back to `•` and `1.`. The
//! writer who asked for letters at level two got digits, and nothing said why.
//!
//! Emitted as a set rule scoped to the list, the answer reaches every depth —
//! and, because the rule is scoped, stops at the end of that list. Both halves
//! are here, because a fix for the first that broke the second would style the
//! rest of the document from one list.

mod common;
use common::{page_text, render, visual_lines};

#[test]
fn a_numbering_pattern_reaches_every_depth() {
    let out = page_text("#ממוספרת(מספור: \"1.א.i.\")[א #ממוספרת[ב #ממוספרת[ג]]]");
    assert!(out.contains("1."), "level one: {out}");
    assert!(out.contains("א."), "level two: {out}");
    assert!(out.contains("i."), "level three: {out}");
}

#[test]
fn a_marker_array_reaches_every_depth() {
    let out = page_text("#רשימה(סמן: ([–], [·]))[אחת #רשימה[פנים]]");
    assert!(out.contains('–'), "level one: {out}");
    assert!(out.contains('·'), "level two: {out}");
}

#[test]
fn and_the_document_config_says_it_once_for_every_list() {
    let out = page_text("#הגדרות_רשימות(מספור: \"1.א.\")\n#ממוספרת[א #ממוספרת[ב]]");
    assert!(out.contains("1.") && out.contains("א."), "{out}");
}

#[test]
fn one_lists_scheme_does_not_style_the_next_one() {
    // The other half. A set rule that escaped its block would restyle the rest
    // of the document from whichever list happened to be first.
    let out = page_text("#ממוספרת(מספור: \"A.\")[ראשון]\n\n#ממוספרת[שני]");
    assert!(out.contains("A."), "the list that asked: {out}");
    assert!(out.contains("1."), "and the one that did not: {out}");
}

#[test]
fn and_neither_does_one_lists_marker() {
    let out = page_text("#רשימה(סמן: [–])[אחת]\n\n#רשימה[שתים]");
    assert!(out.contains('–'), "the list that asked: {out}");
    assert!(out.contains('•'), "and the one that did not: {out}");
}

#[test]
fn a_list_can_start_at_zero() {
    // Typst has always taken `start:`. There was no Hebrew name for it, no
    // English one and no control, which is the same as not having it.
    let out = page_text("#ממוספרת(התחלה: 0)[אפס][אחת]");
    assert!(out.contains("0.") && out.contains("1."), "{out}");
}

#[test]
fn and_in_english_too() {
    let out = page_text("#numbered(start: 0)[zero][one]");
    assert!(out.contains("0.") && out.contains("1."), "{out}");
}

#[test]
fn the_document_config_can_start_every_list_at_zero() {
    let out = page_text("#הגדרות_רשימות(התחלה: 0)\n#ממוספרת[אפס][אחת]");
    assert!(out.contains("0."), "{out}");
}

#[test]
fn the_other_list_knobs_still_arrive() {
    // The split that routes `numbering` and `marker` through a set rule must
    // leave every other argument on the element itself.
    let out = page_text("#ממוספרת(הידוק: true, הזחה: 2em)[א][ב]");
    assert!(out.contains("1.") && out.contains("2."), "{out}");
    let tight = page_text("#רשימה(סמן: [–], הידוק: true)[א][ב]");
    assert!(tight.contains('–'), "{tight}");
}

#[test]
fn an_item_can_hold_two_paragraphs() {
    // What `Ctrl+Enter` writes: a blank line inside the item's content block.
    // Enter makes the next item and Shift+Enter makes a line in this one, and a
    // se'if with two paragraphs under one number needs neither. It is legal
    // inside a content block and it stays inside the item, so the item keeps its
    // number and gains a paragraph.
    let out = page_text("#ממוספרת[ראשונה\n\nשניה][אחר]");
    assert!(out.contains("ראשונה") && out.contains("שניה"), "{out}");
    assert!(
        out.contains("1.") && out.contains("2."),
        "two items, not three: {out}"
    );
    assert!(
        !out.contains("3."),
        "the blank line started a new item: {out}"
    );
}

#[test]
fn and_it_really_is_a_paragraph() {
    // Not merely legal — laid out as two blocks. Compared against the same item
    // written on one line, which sets as one.
    let one = visual_lines(&render("#ממוספרת(הזחה: 0em)[ראשונה שניה]")).len();
    let two = visual_lines(&render("#ממוספרת(הזחה: 0em)[ראשונה\n\nשניה]")).len();
    assert!(two > one, "one line {one}, two paragraphs {two}");
}

#[test]
fn a_typst_named_argument_still_wins() {
    // `#רשימה(marker: [★])` is Typst's own spelling and has always been allowed
    // through the sink. It has to survive the split as well.
    let out = page_text("#רשימה(marker: [★])[אחת]");
    assert!(out.contains('★'), "{out}");
}

//! Every placement draws, for a channel that declared no region.
//!
//! `NOTES-PLAN` thing two says a note has one axis — **where it goes** — and that
//! the arrangement follows from it. Four of the five are placements a channel can
//! name: the foot of the page, the end of a section, the end of the sefer, and a
//! companion volume.
//!
//! Three of those four **printed nothing at all** for a channel that named no
//! region. The notes were filed into the right collector, numbered correctly and
//! queryable — and never drawn. A marker in the body pointing at an entry that
//! does not appear anywhere, with no complaint.
//!
//! The cause is one line of reasoning in two places: a channel that names no
//! region **is its own region** (`_ch_region`), and both the document-end dump
//! and the section-end dump were written against `#אזור` — the *declared*
//! regions — rather than against what a placement means. So a writer who said
//! `#ערוץ("ביאורים", מיקום: "סוף")` and nothing else lost every note in it.
//!
//! This file is one test per placement, and it exists because "the model accepts
//! it" turned out three times to be a different claim from "it prints".

use ksav_engine::{probe, DocConfig};

fn laid(body: &str) -> Vec<probe::TextRun> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// The end of the sefer, named by a channel and by nothing else.
#[test]
fn a_channel_at_the_end_of_the_sefer_prints_there() {
    let runs =
        laid("#ערוץ(\"ביאורים\", מיקום: \"סוף\")\nטקסט#הערה(ערוץ: \"ביאורים\")[גוף ההערה] וסוף.");
    assert!(
        runs.iter().any(|r| r.text.contains("גוף ההערה")),
        "the note was filed at the end of the sefer and never drawn"
    );
}

/// A companion volume, likewise — and on a sheet of its own.
#[test]
fn a_channel_in_a_companion_volume_gets_its_own_sheet() {
    let runs =
        laid("#ערוץ(\"ביאורים\", מיקום: \"קובץ\")\nטקסט#הערה(ערוץ: \"ביאורים\")[גוף ההערה] וסוף.");
    let entry = runs
        .iter()
        .find(|r| r.text.contains("גוף ההערה"))
        .expect("the companion volume printed nothing");
    assert!(
        entry.page > 1,
        "the companion volume shares the body's page — it is a section, not a volume"
    );
}

/// The end of a **section**, which is closed by a siman.
///
/// Not by a `show heading` rule: `_ap_bands` draws a band's own title with a raw
/// `heading(level: 3)`, so a rule on headings would fire from inside the thing
/// it is rendering.
#[test]
fn a_channel_at_the_end_of_a_section_prints_at_each_siman() {
    let runs = laid(
        "#ערוץ(\"ביאורים\", מיקום: \"סוף_מדור\")\n\
         #סימן(\"א\", none)\n\nראשון#הערה(ערוץ: \"ביאורים\")[ביאור אלף] וסוף.\n\n\
         #סימן(\"ב\", none)\n\nשני#הערה(ערוץ: \"ביאורים\")[ביאור בית] וסוף.",
    );
    let alef = runs
        .iter()
        .find(|r| r.text.contains("ביאור אלף"))
        .expect("the first section's notes never printed");
    let bet = runs
        .iter()
        .find(|r| r.text.contains("ביאור בית"))
        .expect("the last section's notes never printed");
    // Each at the end of its own section, so the first entry is above the second
    // siman's own heading rather than pooled with it at the back of the sefer.
    assert!(
        alef.y < bet.y,
        "the two sections' notes did not print in section order"
    );
    let siman_bet = runs
        .iter()
        .find(|r| r.text.contains("סימן ב"))
        .expect("the second siman is not on the page");
    assert!(
        alef.y < siman_bet.y,
        "the first section's notes printed after the second siman began"
    );
}

/// A note on a note, landing somewhere else.
///
/// `#ערוץ("שער", מקור: "ביאור")` is thing two's *"true for any note on a note"*:
/// the commentary at the foot, and the note upon it at the back. Both halves have
/// to arrive, and the inner one is the half that did not.
#[test]
fn a_note_on_a_note_reaches_its_own_placement() {
    let runs = laid(
        "#ערוץ(\"ביאור\", מיקום: \"רגל\")\n#ערוץ(\"שער\", מקור: \"ביאור\", מיקום: \"סוף\")\n\
         טקסט#הערה(ערוץ: \"ביאור\")[ביאור על הגוף#הערה(ערוץ: \"שער\")[שער הציון]] וסוף.",
    );
    let outer = runs
        .iter()
        .find(|r| r.text.contains("ביאור על הגוף"))
        .expect("the commentary never printed");
    let inner = runs
        .iter()
        .find(|r| r.text.contains("שער הציון"))
        .expect("the note upon the note never printed");
    assert!(
        outer.y > 600.0,
        "the commentary is not at the foot of the page"
    );
    assert!(
        inner.y < 400.0,
        "the note upon the note printed at the foot rather than at the back"
    );
}

/// A region at the end of the sefer can open a sheet of its own.
///
/// `#הערות_בסוף` has had `עמוד_חדש` since it existed and a region had no way to
/// say it, so a collected apparatus at the back either always broke the page or
/// never could.
#[test]
fn a_region_at_the_end_can_ask_for_a_fresh_page() {
    let on = laid(
        "#אזור(\"סופי\", מיקום: \"סוף\", עמוד_חדש: true)\n\
         טקסט#הערה(אזור: \"סופי\")[גוף ההערה] וסוף.",
    );
    let off = laid("#אזור(\"סופי\", מיקום: \"סוף\")\nטקסט#הערה(אזור: \"סופי\")[גוף ההערה] וסוף.");
    let page_of = |runs: &[probe::TextRun]| {
        runs.iter()
            .find(|r| r.text.contains("גוף ההערה"))
            .expect("the region printed nothing")
            .page
    };
    assert_eq!(
        page_of(&off),
        1,
        "the region broke a page nobody asked it to"
    );
    assert!(
        page_of(&on) > 1,
        "עמוד_חדש did not open a sheet for the region"
    );
}

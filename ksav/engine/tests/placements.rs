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

/// Where the page number sits under the default document. Nothing but the page
/// number may reach it, and nothing may go past it.
const PAGE_FOOT: f64 = 799.02;

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

/// A band **above** the text.
///
/// The fifth kind of place, and the one that is most obviously the page-foot
/// apparatus wearing a different anchor: the same collection, the same per-page
/// assignment, the same overflow moves, the same entry heads. Only the furniture
/// it is painted into differs, which is why `"למעלה"` is a value on the one axis
/// and not a mechanism of its own.
#[test]
fn a_band_above_the_text_prints_above_the_text() {
    let runs = laid(
        "#ערוץ(\"מסורה\", מיקום: \"למעלה\")\n\
         פתיחה לגוף הספר, ובה מילים רבות כדי שהעמוד יתמלא.\n\n\
         טקסט#הערה(ערוץ: \"מסורה\")[הערת מסורה] וסוף.",
    );
    let note = runs
        .iter()
        .find(|r| r.text.contains("הערת מסורה"))
        .expect("the band above the text printed nothing");
    let body = runs
        .iter()
        .find(|r| r.text.contains("פתיחה לגוף"))
        .expect("the body is not on the page");
    assert!(
        note.y < body.y,
        "the band printed at y={} and the body at y={} — it is not above it",
        note.y,
        body.y
    );
}

/// Above and below at once, each working out its own room.
///
/// The two ends are filtered apart **before** the assignment, so a full band at
/// the foot cannot decide what fits at the top. Sharing one answer between two
/// pieces of furniture at opposite ends of the sheet is the defect this
/// arrangement would otherwise have by construction.
#[test]
fn a_page_can_carry_a_band_at_each_end() {
    let runs = laid(
        "#ערוץ(\"מסורה\", מיקום: \"למעלה\")\n#ערוץ(\"ביאור\", מיקום: \"רגל\")\n\
         פתיחה לגוף הספר, ובה מילים רבות כדי שהעמוד יתמלא.\n\n\
         ראשון#הערה(ערוץ: \"מסורה\")[הערת מסורה] המשך.\n\n\
         שני#הערה(ערוץ: \"ביאור\")[ביאור למטה] וסוף.",
    );
    let top = runs
        .iter()
        .find(|r| r.text.contains("הערת מסורה"))
        .expect("the band above the text printed nothing");
    let foot = runs
        .iter()
        .find(|r| r.text.contains("ביאור למטה"))
        .expect("the band below the text printed nothing");
    assert!(
        top.y < 100.0 && foot.y > 600.0,
        "the two bands are not at opposite ends: {} and {}",
        top.y,
        foot.y
    );
}

/// The running head keeps its place whatever the band above carries.
///
/// The same promise the page number is given at the other end: furniture that
/// was already there does not move to make room for an apparatus.
#[test]
fn a_band_above_does_not_move_the_running_head() {
    let with = laid(
        "#ערוץ(\"מסורה\", מיקום: \"למעלה\")\n#מסמך(כותרת_עליונה: \"שם הספר\")[\n\
         טקסט#הערה(ערוץ: \"מסורה\")[הערת מסורה] וסוף.\n]",
    );
    let without = laid("#מסמך(כותרת_עליונה: \"שם הספר\")[\nטקסט וסוף.\n]");
    let head_of = |runs: &[probe::TextRun]| {
        runs.iter()
            .find(|r| r.text.contains("שם הספר"))
            .map(|r| r.y)
            .expect("the running head is not on the page")
    };
    assert!(
        (head_of(&with) - head_of(&without)).abs() < 0.5,
        "the running head moved from {} to {}",
        head_of(&without),
        head_of(&with)
    );
}

/// A height said in lines, which is the unit the work is done in.
///
/// A typesetter adds and removes lines. Points and a percentage of the sheet
/// were the only units on offer, and nobody looks at a page and decides the
/// commentary should be 41.6pt.
///
/// The line is **measured, not derived**: leading + size is the arithmetic and
/// it is not the answer, since an entry is a block with its own spacing and one
/// line of a 10.2pt band measures 9.37pt where the arithmetic predicts 18. A
/// writer who says two lines means two of the lines they can see.
#[test]
fn a_region_can_be_two_lines_tall() {
    let runs = laid(
        "#מסמך(אזור_הערות: 4cm)[\n\
         #אזור(\"צר\", מיקום: \"רגל\", גובה: שורות(2), גלישה: (\"עמוד_הבא\",))\n\
         פתיחה.\n\n\
         א#הערה(אזור: \"צר\")[הערה ראשונה] ב#הערה(אזור: \"צר\")[הערה שניה] \
         ג#הערה(אזור: \"צר\")[הערה שלישית] ד#הערה(אזור: \"צר\")[הערה רביעית]\n]",
    );
    let page_of = |word: &str| {
        runs.iter()
            .find(|r| r.text.contains(word))
            .unwrap_or_else(|| panic!("{word} printed nowhere"))
            .page
    };
    // Two to a page, because two lines is what the region was given.
    assert_eq!(
        page_of("הערה ראשונה"),
        page_of("הערה שניה"),
        "the first two are not together"
    );
    assert_eq!(
        page_of("הערה שלישית"),
        page_of("הערה רביעית"),
        "the second two are not together"
    );
    assert!(
        page_of("הערה שלישית") > page_of("הערה שניה"),
        "four entries fitted a two-line region"
    );
}

/// A region that asks for more room than the page has says so, if asked to.
///
/// Two honest answers and one dishonest one. The dishonest one is to hand back a
/// 2cm region that is not 2cm and say nothing, which is what happened before the
/// room was measured at all. `"צמצום"` clamps and is the default, so nothing
/// already written changes; `"סירוב"` refuses and names the number that would
/// have fitted, which is what a sefer being set to a fixed design wants — a
/// region silently 30pt shorter than the specification is a fault to find now
/// rather than at the printer.
///
/// Since 23 August there is room under the default that did not exist when this
/// test was written: a declared foot region in a document that reserved nothing
/// **grows the reserve to fit** (the owner ruling recorded in the filing-and-
/// drawing chunk), so a fittable declaration with `"סירוב"` set is accepted —
/// there is nothing left to refuse. The refusal fires where growth cannot: an
/// ask taller than everything the sheet has under the text.
#[test]
fn a_region_can_refuse_to_be_quietly_clamped() {
    // A fittable ask, no reserve written: the reserve grows, and the document
    // sets without complaint.
    let grown = "#אזור(\"צר\", מיקום: \"רגל\", גובה: 2cm, חריגה: \"סירוב\")\n\
                 טקסט#הערה(אזור: \"צר\")[גוף] וסוף.";
    let Ok(doc) = probe::layout(grown, &DocConfig::default()) else {
        panic!("a fittable declared region was refused although the reserve grows to fit")
    };
    let runs = probe::text_runs(&doc);
    assert!(
        !runs.iter().any(|r| r.y > PAGE_FOOT),
        "a grown reserve still printed below the text area"
    );

    // An ask taller than the sheet can answer: refused, with both numbers.
    let doc = "#אזור(\"צר\", מיקום: \"רגל\", גובה: 30cm, חריגה: \"סירוב\")\n\
               טקסט#הערה(אזור: \"צר\")[גוף] וסוף.";
    let Err(d) = probe::layout(doc, &DocConfig::default()) else {
        panic!("a region asking for more room than the page has was accepted")
    };
    let text = format!("{d:?}");
    // The numbers, not just a complaint: what it asked for and what there is.
    assert!(
        text.contains("850.4") && text.contains("505.1"),
        "the refusal does not say how much was asked for and how much there is: {text}"
    );

    // …and the default is unchanged, because every document written before this
    // relies on it.
    let clamped = "#אזור(\"צר\", מיקום: \"רגל\", גובה: 2cm)\nטקסט#הערה(אזור: \"צר\")[גוף] וסוף.";
    assert!(
        probe::layout(clamped, &DocConfig::default()).is_ok(),
        "the default stopped clamping"
    );
}

/// The ten placements, read out of `#let _ch_places = (…)` in the prelude.
///
/// Read rather than listed so that a placement added tomorrow is swept the day
/// it is added. Every one of the three that printed nothing was a placement this
/// file did not yet name.
fn placements() -> Vec<String> {
    let prelude = include_str!("../typst/ksav.typ");
    let at = prelude
        .find("#let _ch_places = (")
        .expect("`_ch_places` is not in ksav.typ — has the placement list moved?");
    let rest = &prelude[at..];
    let end = rest.find(')').expect("`_ch_places` is not closed");
    rest[..end]
        .match_indices('"')
        .map(|(i, _)| i)
        .collect::<Vec<_>>()
        .chunks(2)
        .filter(|c| c.len() == 2)
        .map(|c| rest[c[0] + 1..c[1]].to_string())
        .collect()
}

/// Where a word landed, coarsely: the page, and which third of the sheet in each
/// direction.
///
/// Coarse on purpose. The exact coordinates of an entry are the engine's to
/// decide and change when a margin changes; what this file is about is whether a
/// note reached the apparatus it was filed into, and a third of a sheet is
/// enough to separate the foot from the head from either margin.
fn quarter(runs: &[probe::TextRun], word: &str) -> (usize, u8, u8) {
    let r = runs
        .iter()
        .find(|r| r.text.contains(word))
        .unwrap_or_else(|| panic!("{word:?} is nowhere in the document"));
    let third = |v: f64, of: f64| -> u8 { ((v / of) * 3.0).floor().clamp(0.0, 2.0) as u8 };
    (r.page, third(r.x, 595.0), third(r.y, 842.0))
}

/// Every placement means the same thing on a note upon a note.
///
/// `a_note_on_a_note_reaches_its_own_placement` proves one of the ten. The
/// placement belongs to the **channel** and the tier belongs to the **marker**,
/// so all ten ought to be tier-blind — and "ought to" is exactly how three
/// placements came to print nothing at all for a channel that named no region.
///
/// Checked by comparison rather than against coordinates this file picks: the
/// same channel at the same placement, once with its note written in the body
/// and once with the identical note written inside another note. Where the entry
/// lands is the engine's business; that the two agree is the invariant, and it
/// is the one a reader of a Mishna Berura page depends on.
#[test]
fn every_placement_means_the_same_on_a_note_upon_a_note() {
    let mut wrong = Vec::new();
    for place in placements() {
        let flat = format!("#ערוץ(\"ז\", מיקום: \"{place}\")\nטקסט#הערה(ערוץ: \"ז\")[אלף] וסוף.");
        let nested = format!(
            "#ערוץ(\"אב\", מיקום: \"רגל\")\n\
             #ערוץ(\"ז\", מקור: \"אב\", מיקום: \"{place}\")\n\
             טקסט#הערה(ערוץ: \"אב\")[בית#הערה(ערוץ: \"ז\")[אלף]] וסוף."
        );
        let a = quarter(&laid(&flat), "אלף");
        let b = quarter(&laid(&nested), "אלף");
        if a != b {
            wrong.push(format!("{place}: alone {a:?}, upon a note {b:?}"));
        }
    }
    assert!(
        wrong.is_empty(),
        "a placement moved when the note was written upon another note:\n  {}",
        wrong.join("\n  ")
    );
}

/// The too-small switch: a 4cm declared band inside a 1cm writer reserve.
#[test]
fn the_too_small_switch_grows_or_refuses_as_asked() {
    let doc = "#הגדרות_מדפים(גבהים: (4cm,))
פתיחה#מדף_א[גוף ההערה] וסוף.";
    let refuse =
        DocConfig { notes_region_cm: Some(1.0), reserve_overflow: "refuse".to_string(), ..DocConfig::default() };
    let Err(d) = probe::layout(doc, &refuse) else {
        panic!("refuse accepted a reserve smaller than its bands");
    };
    let text = format!("{d:?}");
    assert!(text.contains("4.") && text.contains("1."), "no numbers: {text}");

    let grow = DocConfig { notes_region_cm: Some(1.0), ..DocConfig::default() };
    match probe::layout(doc, &grow) {
        Ok(doc) => {
            let runs = probe::text_runs(&doc);
            assert!(!runs.iter().any(|r| r.y > PAGE_FOOT), "grown printed past the folio");
        }
        Err(d) => panic!("grow failed: {d:?}"),
    }
}

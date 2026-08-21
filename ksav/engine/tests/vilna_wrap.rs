//! A grid region whose shape changes down the page.
//!
//! # What this is for
//!
//! A Vilna daf is three columns at the head — Rashi, the gemara, Tosfos — two
//! where the Rashi runs out, and the full measure below that. `טורים` said one
//! set of widths for the whole region, so every row had the same number of
//! columns, and the page could be drawn by hand (`vilna.ksav` does, with a
//! literal `#table`) but not asked for.
//!
//! Two ways to ask, and both are here because they answer different questions:
//!
//! - **Say the shape.** A list of row plans, used in order, the last repeating.
//!   This is for a page whose shape the writer has decided.
//! - **Let the content say it.** `ריק: "דלג"` drops the cell of a channel with
//!   nothing to say in that row, and the row's remaining columns take the width.
//!   This is the knee: the Rashi column disappears from the row where the Rashi
//!   ends, and nobody counted anything.
//!
//! # How a column count is measured
//!
//! By the **left edges of the cells on a row**, read off the laid-out page. A
//! row of three columns puts its three streams at three x positions; a row of
//! two puts them at two, and the surviving one is wider. Counting distinct x
//! values is the only claim here that does not depend on a coordinate this file
//! picked, which matters because the widths are fractions of a measure that
//! changes with the paper.

use ksav_engine::{probe, DocConfig};
use std::collections::BTreeSet;

fn laid(body: &str) -> Vec<probe::TextRun> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// The distinct left edges of the apparatus runs carrying `needle`, rounded to
/// the point — two runs of one column differ in the third decimal.
fn edges(runs: &[probe::TextRun], needle: &str) -> BTreeSet<i64> {
    runs.iter()
        .filter(|r| r.text.contains(needle))
        .map(|r| r.x.round() as i64)
        .collect()
}

/// A sefer of three commentaries on three simanim, with `region` spelling out
/// how the region is declared.
///
/// The third siman has nothing from the second and third commentary, which is
/// what a wrap is *for*: a Rashi that ends before the daf does.
fn sefer(region: &str) -> String {
    format!(
        "#ערוץ(\"רשי\", אזור: \"דף\")\n\
         #ערוץ(\"גמרא\", אזור: \"דף\")\n\
         #ערוץ(\"תוספות\", אזור: \"דף\")\n\
         {region}\n\
         #כותרת[סימן א]\n\n\
         פתיחה#הערה(ערוץ: \"רשי\")[רשיא]\
         #הערה(ערוץ: \"גמרא\")[גמראא]\
         #הערה(ערוץ: \"תוספות\")[תוספותא] וסוף.\n\n\
         #כותרת[סימן ב]\n\n\
         המשך#הערה(ערוץ: \"רשי\")[רשיב]\
         #הערה(ערוץ: \"גמרא\")[גמראב]\
         #הערה(ערוץ: \"תוספות\")[תוספותב] וסוף.\n\n\
         #כותרת[סימן ג]\n\n\
         סיום#הערה(ערוץ: \"גמרא\")[גמראג] וסוף.\n"
    )
}

/// One shape for every row is what it always was, and still is.
#[test]
fn a_region_that_names_its_widths_once_uses_them_on_every_row() {
    let runs = laid(&sefer(
        "#אזור(\"דף\", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", טורים: (1fr, 2fr, 1fr))",
    ));
    for siman in ["א", "ב"] {
        let cols: BTreeSet<i64> = ["רשי", "גמרא", "תוספות"]
            .iter()
            .filter_map(|c| edges(&runs, &format!("{c}{siman}")).into_iter().next())
            .collect();
        assert_eq!(
            cols.len(),
            3,
            "siman {siman} did not come out in three columns: {cols:?}"
        );
    }
}

/// A list of plans changes the shape from row to row, and the last one repeats.
#[test]
fn a_list_of_row_plans_changes_the_shape_down_the_page() {
    let runs = laid(&sefer(
        "#אזור(\"דף\", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", \
         טורים: ((1fr, 2fr, 1fr), (1fr, 2fr)))",
    ));
    // Row one: three columns, three streams.
    let first: BTreeSet<i64> = ["רשי", "גמרא", "תוספות"]
        .iter()
        .filter_map(|c| edges(&runs, &format!("{c}א")).into_iter().next())
        .collect();
    assert_eq!(
        first.len(),
        3,
        "the first row did not take the first plan: {first:?}"
    );
    let second: BTreeSet<i64> = ["רשי", "גמרא"]
        .iter()
        .filter_map(|c| edges(&runs, &format!("{c}ב")).into_iter().next())
        .collect();
    assert_eq!(
        second.len(),
        2,
        "the second row did not take the second plan: {second:?}"
    );
    // Row two's plan names two columns and the region holds three, so the third
    // channel has something to say and nowhere planned to say it. **It still
    // prints** — a row of its own, at the full measure, under the planned one.
    //
    // The first draft of this file asserted the opposite: that a channel with no
    // column does not print. That is the truncation this whole apparatus is
    // written against, and asserting it would have frozen it in place. A plan is
    // the writer saying how the columns sit, not that a peirush may vanish on
    // the simanim they did not think about.
    let tosfos = edges(&runs, "תוספותב");
    assert!(
        !tosfos.is_empty(),
        "a channel with no column in its row was dropped off the page"
    );
    let planned = edges(&runs, "גמראב").into_iter().next().unwrap();
    assert!(
        tosfos.iter().all(|x| *x != planned),
        "the leftover row did not take the full measure: {tosfos:?} against {planned}"
    );
}

/// …and a sefer whose shape is exact can ask to be stopped instead.
#[test]
fn a_leftover_channel_can_be_a_refusal_rather_than_a_row() {
    let body = sefer(
        "#אזור(\"דף\", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", \
         טורים: ((1fr, 2fr, 1fr), (1fr, 2fr)), עודף: \"סירוב\")",
    );
    let Err(d) = probe::layout(&body, &DocConfig::default()) else {
        panic!("a channel with no column compiled quietly")
    };
    let text = format!("{d:?}");
    assert!(
        text.contains("תוספות") && text.contains("דף"),
        "the refusal names neither the channel nor the region: {text}"
    );
}

/// …or the row can stretch to hold it.
#[test]
fn a_leftover_channel_can_be_a_column_instead() {
    let runs = laid(&sefer(
        "#אזור(\"דף\", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", \
         טורים: ((1fr, 2fr, 1fr), (1fr, 2fr)), עודף: \"טור_נוסף\")",
    ));
    let second: BTreeSet<i64> = ["רשי", "גמרא", "תוספות"]
        .iter()
        .filter_map(|c| edges(&runs, &format!("{c}ב")).into_iter().next())
        .collect();
    assert_eq!(
        second.len(),
        3,
        "the leftover channel did not become a third column: {second:?}"
    );
}

/// `ריק: "דלג"` is the knee: the column that ran out disappears and the rest
/// take its width.
#[test]
fn a_channel_that_ran_out_gives_its_width_to_its_neighbours() {
    let held = laid(&sefer(
        "#אזור(\"דף\", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", \
         טורים: (1fr, 1fr, 1fr))",
    ));
    let dropped = laid(&sefer(
        "#אזור(\"דף\", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", \
         טורים: (1fr, 1fr, 1fr), ריק: \"דלג\")",
    ));
    // The first two simanim have all three, so they are the control: the two
    // documents must agree about them.
    let at =
        |runs: &[probe::TextRun], w: &str| -> Option<i64> { edges(runs, w).into_iter().next() };
    assert_eq!(
        at(&held, "גמראא"),
        at(&dropped, "גמראא"),
        "dropping empty cells moved a row that had no empty cell"
    );
    // The third siman has only the gemara. Held, its cell keeps the middle
    // column's place; dropped, it is the only column and starts at the edge.
    let a = at(&held, "גמראג").expect("the third siman did not print at all");
    let b = at(&dropped, "גמראג").expect("the third siman did not print when its row was dropped");
    assert_ne!(
        a, b,
        "the surviving column did not move when its neighbours were dropped \
         — both at x={a}, so `ריק` changed nothing"
    );
}

/// A row plan can be spelled in English, because a plan is a value and `_en`
/// never sees it.
#[test]
fn a_row_plan_can_be_written_in_english() {
    let runs = laid(&sefer(
        "#region(\"דף\", placement: \"רגל\", layout: \"צד\", unit: \"heading\", \
         columns: ((width: (1fr, 2fr, 1fr),), (width: (1fr, 2fr), channels: (\"רשי\", \"גמרא\"))), \
         empty: \"skip\")",
    ));
    let first: BTreeSet<i64> = ["רשי", "גמרא", "תוספות"]
        .iter()
        .filter_map(|c| edges(&runs, &format!("{c}א")).into_iter().next())
        .collect();
    assert_eq!(
        first.len(),
        3,
        "the English spelling did not draw three columns: {first:?}"
    );
}

/// Every way of getting a row plan wrong is refused in a sentence that names the
/// region and says what was expected.
#[test]
fn a_row_plan_that_makes_no_sense_is_refused_by_name() {
    let cases: &[(&str, &str)] = &[
        (
            "a key nobody has heard of",
            "טורים: ((רוחב: (1fr,), צבע: red),)",
        ),
        ("a plan with no widths", "טורים: ((ערוצים: (\"רשי\",)),)"),
        (
            "more widths than channels named",
            "טורים: ((רוחב: (1fr, 1fr), ערוצים: (\"רשי\",)),)",
        ),
        (
            "a channel that is not in the region",
            "טורים: ((רוחב: (1fr,), ערוצים: (\"פלוני\",)),)",
        ),
        ("more columns than the region holds", "טורים: ((1fr,) * 9,)"),
        ("an empty-cell rule nobody built", "ריק: \"אולי\""),
    ];
    let mut quiet = Vec::new();
    for (what, arg) in cases {
        let body = sefer(&format!(
            "#אזור(\"דף\", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", {arg})"
        ));
        match probe::layout(&body, &DocConfig::default()) {
            Ok(_) => quiet.push(format!("{what}: compiled")),
            Err(d) => {
                let text = format!("{d:?}");
                if !text.contains("דף") {
                    quiet.push(format!(
                        "{what}: the refusal does not name the region: {text}"
                    ));
                }
            }
        }
    }
    assert!(
        quiet.is_empty(),
        "a row plan was accepted or refused without saying why:\n  {}",
        quiet.join("\n  ")
    );
}

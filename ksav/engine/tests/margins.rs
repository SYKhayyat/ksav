//! A setting that was refused, and a margin's limit is the paper's.
//!
//! # What was wrong
//!
//! `DocConfig::from_json` clamped every numeric field and **said nothing**. A
//! request for `margin_top_cm: 21.7` came back laid out at 7 cm, with the
//! document compiling, the page printing, and no diagnostic anywhere: a writer who
//! changed a margin and got the old page back had no way to tell that from a
//! setting that does not work.
//!
//! That is the defect the engine has been bitten by before, one layer down, and
//! the app says it in `settings.ts`: *"a load that falls back to the defaults is a
//! load that has silently un-chosen everything the person chose, and it has to be
//! able to say so."* The engine had the same bug and the same missing sentence.
//!
//! Issue #15 found it and read it as a layout problem — *"the first compile fell
//! back to default margins"* — while building a two-document compositor on top of
//! it. It was a reporting problem, and the compositor was never the fix.
//!
//! # The two changes
//!
//! 1. **A refusal is recorded and reported.** `clamped` now notes what it had to
//!    change, `DocConfig` carries the notes, and `compile` turns each into a
//!    warning carrying the field, what was asked for and what is in force. A
//!    refusal is still not an error: the page is the nearest thing the field
//!    accepts, and the document lays out.
//! 2. **A margin's limit is the sheet's, not a number chosen in advance.** 7 cm was
//!    never a limit — A4 is 29.7 cm tall and a bentcher is larger. It is now
//!    `sheet − MIN_TEXT_CM`, which is the only physical question there is: how much
//!    of the page did the writer ask to give away. The page size is read *before*
//!    the margins, because a margin bounded by a sheet the request has not been
//!    compared against is a bound against a default.

use ksav_engine::{compile, probe, DocConfig};
use serde_json::json;

/// The document every case is compiled as, so a refusal is the only variable.
fn laid(v: serde_json::Value) -> DocConfig {
    DocConfig::from_json(&v)
}

fn said(cfg: &DocConfig) -> Option<String> {
    compile("#שער[מסמך]\n\nטקסט.\n", cfg)
        .diagnostics
        .into_iter()
        .find(|d| d.message.contains("is outside the range"))
        .map(|d| d.message)
}

#[test]
fn a_margin_asks_for_as_much_of_the_page_as_it_wants() {
    // 21.7 cm is the seam #15 measured — a top margin that leaves 8 cm of A4 for
    // text. It was silently refused, and the issue built a compositor around it.
    let cfg = laid(json!({ "margin_top_cm": 21.7 }));
    assert_eq!(cfg.margin_top_cm, Some(21.7), "a legal seam was refused");
    assert!(said(&cfg).is_none(), "and it was reported as one: {:?}", said(&cfg));
}

/// The same for the other three edges, because each is bounded by a different
/// dimension and a shared constant would get one of them wrong.
#[test]
fn each_edge_is_bounded_by_its_own_dimension() {
    // A6 is 10.5 × 14.8 cm. A 13 cm **top** margin is legal — 1.8 cm of text is
    // left — and the same 13 cm **inner** margin is not, because the page is only
    // 10.5 cm wide. A single constant for both would have got one of them wrong,
    // and getting this one wrong is the bug this whole change is about.
    let sheet = json!({ "page_width_cm": 10.5, "page_height_cm": 14.8 });
    // The opposite edge is set to 0 **on purpose**. It used to be left absent,
    // which meant the 2.5cm default bottom margin was silently in the way — and
    // this test then passed a 13cm top margin that had no room to exist. Now
    // that the pair is checked (#76), an absent edge is a real margin, so the
    // comparison has to say what is opposite it.
    let top = DocConfig::from_json(&json!({ "page_width_cm": 10.5, "page_height_cm": 14.8, "margin_top_cm": 13.0, "margin_bottom_cm": 0.0 }));
    assert_eq!(top.margin_top_cm, Some(13.0), "a top margin within the height was refused");
    let inner = DocConfig::from_json(&json!({ "page_width_cm": 10.5, "page_height_cm": 14.8, "margin_inner_cm": 13.0, "margin_outer_cm": 0.0 }));
    assert_eq!(inner.margin_inner_cm, Some(9.5), "an inner margin is bounded by the width, not the height");
    assert_eq!(inner.refusals.len(), 1, "and it is reported");
    assert!(sheet.get("page_height_cm").is_some());
}

/// A value that would leave no text area is refused — and **named**.
#[test]
fn a_margin_that_leaves_no_text_is_refused_by_name() {
    let cfg = laid(json!({ "margin_top_cm": 40.0 })); // A4 is 29.7 cm tall
    let said = said(&cfg).expect("a 40cm margin on A4 must be reported");
    assert!(said.contains("margin_top_cm"), "the message does not name the field: {said}");
    assert!(said.contains("40.00"), "nor what was asked for: {said}");
    assert!(said.contains("28.70"), "nor what is in force instead: {said}");
    // Bilingual, like every sentence this product shows a writer.
    assert!(said.contains("הגדרה"), "the Hebrew half is missing: {said}");
}

/// The page size is read **before** the margins, or the bound is a bound against
/// a default the request never asked for.
#[test]
fn an_explicit_sheet_is_the_bound() {
    let cfg = laid(json!({
        "page_width_cm": 40.0, "page_height_cm": 50.0,
        "margin_top_cm": 45.0,
    }));
    assert_eq!(cfg.margin_top_cm, Some(45.0), "a 45cm margin on a 50cm sheet was refused");
    assert!(cfg.refusals.is_empty(), "and reported: {:?}", cfg.refusals);
}

/// Nothing to say when nothing was refused.
///
/// A warning on every compile would be a warning nobody reads, which is the state
/// this repository is named for.
#[test]
fn an_ordinary_document_is_not_warned_about() {
    for v in [
        json!({}),
        json!({ "margin_top_cm": 3.0, "margin_cm": 2.5 }),
        json!({ "size_pt": 14.0, "columns": 2 }),
        json!({ "font": "Frank Ruhl Hofshi", "two_sided": true }),
    ] {
        let cfg = laid(v.clone());
        assert!(cfg.refusals.is_empty(), "{v} was refused: {:?}", cfg.refusals);
        assert!(said(&cfg).is_none(), "{v} was reported: {:?}", said(&cfg));
    }
}

/// A refused margin really is refused, on the page and not only in the message.
///
/// The warning and the layout are two different claims and a test that only reads
/// the warning would pass if the value were honoured *and* complained about.
#[test]
fn a_refused_margin_is_not_also_honoured() {
    let asked = 40.0;
    let cfg = laid(json!({ "margin_top_cm": asked }));
    let used = cfg.margin_top_cm.expect("a bound value");
    assert!(used < asked, "asked for {asked} and got {used} — that is not a refusal");

    // The text starts below the bound margin, not below the one asked for.
    let doc = probe::layout("#שער[מסמך]\n\nטקסט.\n", &cfg).expect("lays out");
    let (_, h) = probe::page_sizes(&doc)[0];
    let first = probe::text_runs(&doc)
        .iter()
        .filter(|r| r.text.contains("טקסט"))
        .map(|r| r.y)
        .min_by(|a, b| a.partial_cmp(b).unwrap());
    let top = first.expect("the body is on the page");
    let top_pt = used * 72.0 / 2.54;
    assert!(
        top >= top_pt - 6.0 && top <= h,
        "body at y={top} on a {h}pt sheet, with a {used}cm top margin ({top_pt:.1}pt)"
    );
}

/// A refusal is a **warning**, not an error: the document still lays out, because
/// a writer part-way through a sefer keeps working.
#[test]
fn a_refusal_does_not_stop_the_document() {
    let cfg = laid(json!({ "margin_top_cm": 40.0 }));
    let out = compile("#שער[מסמך]\n\nטקסט על הדף.\n", &cfg);
    assert!(out.ok, "a refused margin stopped the document compiling");
    assert!(
        out.diagnostics.iter().all(|d| d.severity != "error"),
        "and it raised an error: {:?}",
        out.diagnostics.iter().map(|d| d.severity.as_str()).collect::<Vec<_>>()
    );
    assert!(
        out.diagnostics.iter().any(|d| d.message.contains("margin_top_cm")),
        "with no warning naming the field"
    );
}

/// NaN and infinity stay refused rather than clamped, because a NaN formatted into
/// the source is not a Typst length at all — and that behaviour predates all of
/// this and must not have been loosened by it.
#[test]
fn nan_and_infinity_are_still_not_clamped() {
    for v in [json!({ "margin_top_cm": f64::NAN }), json!({ "margin_top_cm": f64::INFINITY })] {
        let cfg = laid(v.clone());
        assert_eq!(cfg.margin_top_cm, None, "{v} was turned into a margin");
    }
}

// ---------------------------------------------------------------------------
// #76 — the bound is the sheet's, and the sheet is only half the question
// ---------------------------------------------------------------------------

/// A uniform margin is bounded by the **sheet**, not by a constant.
///
/// `margin_cm` was `0.0..7.0` with the comment *"half of the short side of A5"*,
/// and 7 is the A5 instance of a rule that is right on every sheet: a uniform
/// margin lands on **both** edges of each axis, so the bound is
/// `2m ≤ short_side − MIN_TEXT_CM`. That is 6.9cm on A5 and **10.0cm on A4**.
///
/// So #15 replaced the hardcoded 7 with the sheet on the per-edge path and left
/// the constant standing here — on the path almost every document takes, since
/// four absent edges mean "use `margin_cm`". A4 was still refusing a 9cm margin
/// as out of range.
#[test]
fn a_uniform_margin_is_bounded_by_the_sheet_and_not_by_seven() {
    let a4_nine = DocConfig::from_json(&json!({ "margin_cm": 9.0 }));
    assert_eq!(
        a4_nine.margin_cm, 9.0,
        "A4 is 21cm wide; 9cm all round leaves 3cm of text, and it was refused"
    );
    assert!(
        a4_nine.refusals.is_empty(),
        "a margin the sheet can hold was still refused: {:?}",
        a4_nine.refusals
    );

    // And the A5 figure is still the A5 figure, now derived rather than assumed.
    let a5_twelve = DocConfig::from_json(
        &json!({ "paper": "a5", "margin_cm": 12.0 }),
    );
    assert!(
        a5_twelve.margin_cm < 12.0,
        "A5 is 14.8cm wide; 12cm all round was accepted: {}",
        a5_twelve.margin_cm
    );
    assert!(
        a5_twelve.refusals.iter().any(|r| r.key == "margin_cm"),
        "the refusal was not recorded: {:?}",
        a5_twelve.refusals
    );
}

/// Two opposing margins are checked **as a pair**, which is the whole of #76.
///
/// Each edge is bounded by `sheet − MIN_TEXT_CM` on its own, so each of these
/// is legal. Together they are not, and they used to be accepted in silence: A4
/// is 21.0 × 29.7, so `20` and `20` asks for a text region 19cm wider than the
/// sheet and 10.3cm taller than it.
#[test]
fn opposing_margins_that_cannot_both_fit_are_refused() {
    let cfg = DocConfig::from_json(
        &json!({ "margin_inner_cm": 20.0, "margin_outer_cm": 20.0 }),
    );
    let in_ = cfg.margin_inner_cm.expect("inner");
    let out = cfg.margin_outer_cm.expect("outer");
    assert!(
        in_ + out <= 20.0,
        "the pair still consumes the page: {in_} + {out} on a 21cm sheet"
    );
    assert!(
        cfg.refusals.iter().any(|r| r.key.starts_with("margin_") && r.key.ends_with("cm")),
        "a margin was moved without saying so: {:?}",
        cfg.refusals
    );
}

/// **A value the writer did not set is never the one moved.**
///
/// An absent edge stands in for `margin_cm`, which is a default. Reducing the
/// default would be the app un-choosing on the writer's behalf — the exact
/// defect `settings.ts` names, and the one #15 was filed about. So when only
/// one edge of a pair was asked for, that is the edge that gives way.
#[test]
fn an_edge_the_writer_did_not_set_is_never_the_one_moved() {
    let cfg = DocConfig::from_json(&json!({ "margin_inner_cm": 20.0 }));
    assert_eq!(
        cfg.margin_outer_cm, None,
        "the default outer margin was overwritten: {:?}",
        cfg.margin_outer_cm
    );
    let in_ = cfg.margin_inner_cm.expect("inner was refused, not dropped");
    assert!(
        in_ <= 20.0 - cfg.margin_cm + 0.001,
        "the edge that was set was left at {in_}, leaving no room for the default"
    );
    assert!(
        cfg.refusals.iter().any(|r| r.key == "margin_inner_cm"),
        "the wrong edge was blamed: {:?}",
        cfg.refusals.iter().map(|r| &r.key).collect::<Vec<_>>()
    );
}

/// Asymmetry that fits is left exactly as written.
///
/// The rule bounds a *pair*, not each edge to half of the sheet. A layout that
/// wants 2cm at the binding and 3cm at the fore-edge is a real one, and halving
/// the sheet to "be safe" would throw it away.
#[test]
fn an_asymmetric_pair_that_fits_is_untouched() {
    let cfg = DocConfig::from_json(
        &json!({ "margin_inner_cm": 2.0, "margin_outer_cm": 3.0 }),
    );
    assert_eq!(cfg.margin_inner_cm, Some(2.0));
    assert_eq!(cfg.margin_outer_cm, Some(3.0));
    assert!(
        cfg.refusals.is_empty(),
        "a legal layout was refused: {:?}",
        cfg.refusals
    );
}

/// Whatever happens, at least `MIN_TEXT_CM` of text survives on both axes.
///
/// This is the invariant the other four are arguing for, stated once so that a
/// future change to the rule cannot pass by making the refusal quieter.
#[test]
fn the_text_region_is_never_negative_on_either_axis() {
    for json in [
        json!({ "margin_cm": 9.0 }),
        json!({ "margin_inner_cm": 20.0, "margin_outer_cm": 20.0 }),
        json!({ "margin_top_cm": 20.0, "margin_bottom_cm": 20.0 }),
        json!({ "margin_cm": 12.0 }),
        json!({ "margin_cm": 12.0, "margin_inner_cm": 11.0 }),
        // The pair that broke the first version of the rule: both edges set, the
        // larger one over the allowance, and the *smaller* one already at zero.
        json!({ "page_width_cm": 10.5, "page_height_cm": 14.8, "margin_inner_cm": 13.0, "margin_outer_cm": 0.0 }),
        json!({ "margin_inner_cm": 18.0, "margin_outer_cm": 0.5 }),
        json!({ "margin_top_cm": 28.0, "margin_bottom_cm": 1.0 }),
    ] {
        let cfg = DocConfig::from_json(&json);
        let sheet = json.get("page_width_cm").and_then(|x| x.as_f64());
        let (w, h) = (
            sheet.unwrap_or(21.0),
            json.get("page_height_cm").and_then(|x| x.as_f64()).unwrap_or(29.7),
        );
        let g = cfg.gutter_cm;
        let inner = cfg.margin_inner_cm.unwrap_or(cfg.margin_cm);
        let outer = cfg.margin_outer_cm.unwrap_or(cfg.margin_cm);
        let top = cfg.margin_top_cm.unwrap_or(cfg.margin_cm);
        let bottom = cfg.margin_bottom_cm.unwrap_or(cfg.margin_cm);
        assert!(
            w - inner - outer - g >= 1.0 - 0.001,
            "{json}: text width is {:.2}cm on a {w}cm sheet",
            w - inner - outer - g
        );
        assert!(
            h - top - bottom >= 1.0 - 0.001,
            "{json}: text height is {:.2}cm on a {h}cm sheet",
            h - top - bottom
        );
    }
}

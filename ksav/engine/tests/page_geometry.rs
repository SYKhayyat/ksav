//! The page a sefer is actually printed on, measured off the laid-out document.
//!
//! Everything about a page's *geometry* is a property of the document — B26 put
//! the margins there, and `PAGE_FIELDS` carries them into the file — with one
//! hole: the **size** could only be a name Typst already knew. `a4`, `a5`,
//! `us-letter`. A sefer is routinely printed at a size no standard names —
//! 17×24, 20×27 — and the only answer was the nearest A-size and living with
//! the margins.
//!
//! So `page_width_cm`/`page_height_cm` exist, and this measures what they do
//! rather than asserting that the request carried them. Every apparatus bug this
//! project has had compiled cleanly and was wrong on the page.
//!
//! # Both or neither, which is the whole of the care needed here
//!
//! Typst's `width`/`height` override `paper:` **entirely**. A width with no
//! height therefore does not mean "this wide, and as tall as A4 was" — it means
//! a page whose height Typst decides, which is a shape nobody asked for. The
//! engine reads the pair or ignores it, and that is asserted below in the
//! direction that would otherwise be silent: half a size must leave the named
//! paper alone.

use ksav_engine::{probe, DocConfig};

/// Typst points per centimetre.
const PER_CM: f64 = 72.0 / 2.54;

/// The first page's size, in centimetres.
fn size_cm(cfg: &DocConfig) -> (f64, f64) {
    let doc = probe::layout("#כותרת1[קונטרס]\n\nגוף המסמך.\n", cfg)
        .unwrap_or_else(|d| panic!("it lays out: {:?}", d.iter().map(|x| &x.message).collect::<Vec<_>>()));
    let page = doc.pages().first().expect("a page");
    (
        page.frame.width().to_pt() / PER_CM,
        page.frame.height().to_pt() / PER_CM,
    )
}

fn about(got: f64, want: f64) -> bool {
    (got - want).abs() < 0.02
}

#[test]
fn a_named_paper_is_the_size_it_names() {
    let (w, h) = size_cm(&DocConfig::default());
    assert!(about(w, 21.0) && about(h, 29.7), "A4 came out {w:.2}×{h:.2}");

    let a5 = DocConfig {
        paper: "a5".into(),
        ..Default::default()
    };
    let (w, h) = size_cm(&a5);
    assert!(about(w, 14.8) && about(h, 21.0), "A5 came out {w:.2}×{h:.2}");
}

#[test]
fn a_custom_size_is_the_size_it_asks_for() {
    // The two a sefer is actually printed at.
    for (want_w, want_h) in [(17.0, 24.0), (20.0, 27.0)] {
        let cfg = DocConfig {
            page_width_cm: Some(want_w),
            page_height_cm: Some(want_h),
            ..Default::default()
        };
        let (w, h) = size_cm(&cfg);
        assert!(
            about(w, want_w) && about(h, want_h),
            "asked for {want_w}×{want_h}, got {w:.2}×{h:.2}"
        );
    }
}

#[test]
fn a_custom_size_wins_over_the_named_paper() {
    // Both given. Typst would otherwise be choosing between them, and which one
    // it chose would be a property of the compiler rather than of the document.
    let cfg = DocConfig {
        paper: "a5".into(),
        page_width_cm: Some(17.0),
        page_height_cm: Some(24.0),
        ..Default::default()
    };
    let (w, h) = size_cm(&cfg);
    assert!(about(w, 17.0) && about(h, 24.0), "got {w:.2}×{h:.2}");
}

#[test]
fn half_a_size_is_not_a_size() {
    // The failure this is really about: a width with no height is not "this
    // wide and as tall as before". `width`/`height` override `paper` entirely,
    // so sending one would produce a page whose other dimension Typst decides.
    // A request that names one is treated as having named neither.
    for one in [
        serde_json::json!({ "paper": "a5", "page_width_cm": 17.0 }),
        serde_json::json!({ "paper": "a5", "page_height_cm": 24.0 }),
    ] {
        let cfg = DocConfig::from_json(&one);
        assert!(
            cfg.page_width_cm.is_none() && cfg.page_height_cm.is_none(),
            "half a size was kept: {cfg:?}"
        );
        let (w, h) = size_cm(&cfg);
        assert!(about(w, 14.8) && about(h, 21.0), "A5 became {w:.2}×{h:.2}");
    }
}

#[test]
fn an_impossible_size_is_refused_rather_than_laid_out() {
    // Same rule as every other numeric field: the nearest possible thing, here
    // rather than a blank page from Typst. A negative width is not a page and a
    // two-metre one is not a sefer, but 200 cm stays reachable because a wall
    // poster is a thing somebody prints and refusing it would be a worse
    // mistake than laying it out.
    let cfg = DocConfig::from_json(&serde_json::json!({
        "page_width_cm": -5.0,
        "page_height_cm": 900.0,
    }));
    assert_eq!(cfg.page_width_cm, Some(1.0));
    assert_eq!(cfg.page_height_cm, Some(200.0));
}

#[test]
fn every_margin_is_the_document_s_own() {
    // The other half of "page geometry is per document", asserted on the page
    // rather than in the request. The four per-edge margins are `None` by
    // default and that is an instruction — *follow the one margin* — so this
    // measures the text block rather than reading the config back.
    let uniform = DocConfig {
        margin_cm: 2.0,
        ..Default::default()
    };
    let per_edge = DocConfig {
        margin_cm: 2.0,
        margin_top_cm: Some(5.0),
        ..Default::default()
    };
    let first_baseline = |cfg: &DocConfig| -> f64 {
        let doc = probe::layout("שורה ראשונה\n", cfg).expect("it lays out");
        let runs = probe::text_runs(&doc);
        probe::lines(&runs, 1.0)
            .first()
            .and_then(|l| l.runs.first())
            .map(|r| r.y)
            .expect("a line on the page")
    };
    let plain = first_baseline(&uniform);
    let pushed = first_baseline(&per_edge);
    assert!(
        pushed > plain + 2.0 * PER_CM * 0.9,
        "a 5cm top margin did not move the text down from a 2cm one: {plain:.1} → {pushed:.1}"
    );
}

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
    let doc = probe::layout("#כותרת1[קונטרס]\n\nגוף המסמך.\n", cfg).unwrap_or_else(|d| {
        panic!(
            "it lays out: {:?}",
            d.iter().map(|x| &x.message).collect::<Vec<_>>()
        )
    });
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
    assert!(
        about(w, 21.0) && about(h, 29.7),
        "A4 came out {w:.2}×{h:.2}"
    );

    let a5 = DocConfig {
        paper: "a5".into(),
        ..Default::default()
    };
    let (w, h) = size_cm(&a5);
    assert!(
        about(w, 14.8) && about(h, 21.0),
        "A5 came out {w:.2}×{h:.2}"
    );
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

// --------------------------------------------------------------- the page foot
//
// The apparatus at the foot of the page lives in the bottom margin, and the page
// number lives under it. Three separate pieces of arithmetic had to agree for
// that to come out right, and none of them did.

/// A4's height in points, so a claim about "off the sheet" can be checked.
const A4_PT: f64 = 841.89;

/// Where the running footer line printed, and the lowest thing on the page.
///
/// The footer is given distinctive text rather than left as the page number: a
/// document with footnotes has a `1` in the body, a `1` on the marker and a `1`
/// on the note, and a test that picked the wrong one would be measuring a
/// footnote and calling it a page number.
fn foot(body: &str) -> (f64, f64) {
    let cfg = DocConfig {
        footer: "תחתית".into(),
        // **Numbering off, deliberately.** These tests ask one question: does an
        // apparatus push the footer down the page. The page number is not part
        // of that question, and since a footer and a number now both print —
        // they used to be alternatives, which was the bug — leaving it on would
        // make "the lowest thing on the page" mean the number and turn every
        // assertion below into a statement about a feature these tests are not
        // about.
        numbering: false,
        ..Default::default()
    };
    let doc = probe::layout(body, &cfg).expect("it lays out");
    let runs = probe::text_runs(&doc);
    let line = runs
        .iter()
        .filter(|r| r.page == 1 && r.text.contains("תחתית"))
        .map(|r| r.y)
        .fold(f64::NAN, f64::max);
    assert!(line.is_finite(), "the footer line never printed:\n{body}");
    let lowest = runs
        .iter()
        .filter(|r| r.page == 1)
        .map(|r| r.y)
        .fold(f64::MIN, f64::max);
    (line, lowest)
}

#[test]
fn the_page_foot_line_does_not_move_when_the_document_grows_an_apparatus() {
    // Typst's `footer-descent` defaults to **30% of the bottom margin**, and the
    // reserve for the apparatus is added to that margin — so reserving 3cm also
    // lowered the whole footer by 0.9cm and the page number, printed after the
    // bands, ended up 2.96pt from the bottom of an A4 sheet. Measured, and inside
    // every printer's unprintable border.
    let (plain, _) = foot("טקסט ראשון#הערה[הערה רגילה] וסוף.\n");
    for body in [
        "טקסט#מדף_א[אחת] ועוד#מדף_ב[שתיים] וסוף.\n",
        "#הגדרות_מדפים(גבהים: (1.5cm, 1cm))\n\nטקסט#מדף_א[אחת] ועוד#מדף_ב[שתיים] וסוף.\n",
        "#הגדרות_מדפים(גבהים: (3cm, 2cm))\n\nטקסט#מדף_א[אחת] ועוד#מדף_ב[שתיים] וסוף.\n",
    ] {
        let (line, lowest) = foot(body);
        assert!(
            (line - plain).abs() < 0.5,
            "the foot line moved to {line:.2} (a document with no apparatus puts it at {plain:.2}):\n{body}"
        );
        // And nothing at all prints below it — which is the same statement seen
        // from the other end, and the one that catches a band running off the
        // sheet rather than merely pushing the number down.
        assert!(
            lowest <= line + 0.5,
            "something printed below the foot line ({lowest:.2} > {line:.2}):\n{body}"
        );
        assert!(
            lowest < A4_PT,
            "something printed off the sheet: {lowest:.2}\n{body}"
        );
    }
}

#[test]
fn a_declared_band_height_is_the_height_the_band_gets() {
    // `auto_notes_region_cm` reserved a flat 3cm for any page apparatus and never
    // read `גבהים`, so `(3cm, 2cm)` — five centimetres of declared bands — put the
    // second band at y=879 on an 842pt page. Off the paper, with the prelude's own
    // comment promising it would be clipped instead.
    //
    // Asserted as the distance between the two bands' entries, which is what a
    // declared height actually buys, and against a *difference* of declared
    // heights so the furniture between them cancels out.
    let entries = |heights: &str| -> Vec<f64> {
        let body =
            format!("#הגדרות_מדפים(גבהים: {heights})\n\nטקסט#מדף_א[אחת] ועוד#מדף_ב[שתיים] וסוף.\n");
        let doc = probe::layout(&body, &DocConfig::default()).expect("it lays out");
        let runs = probe::text_runs(&doc);
        let mut ys: Vec<f64> = runs
            .iter()
            .filter(|r| r.page == 1 && (r.text.contains("אחת") || r.text.contains("שתיים")))
            .map(|r| r.y)
            .collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
        ys
    };
    let small = entries("(1cm, 1cm)");
    let large = entries("(3cm, 1cm)");
    assert_eq!(small.len(), 2, "both bands print: {small:?}");
    assert_eq!(large.len(), 2, "both bands print: {large:?}");
    let grew = (large[1] - large[0]) - (small[1] - small[0]);
    let want = 2.0 * PER_CM; // 1cm → 3cm
    assert!(
        (grew - want).abs() < 2.0,
        "asking for 2cm more of band א moved band ב by {grew:.1}pt, not {want:.1}pt"
    );
}

// ─── parallel streams in fixed regions ──────────────────────────────────────
//
// `#הערה_זרם("שם")` is the *other* page-foot apparatus: any number of named peer
// streams, each numbered on its own, each pinnable to a region of its own
// height. It renders into the same reserved block the bands do — and the reserve
// was read off `#הגדרות_מדפים` alone, so a three-stream document with declared
// heights got the flat 3 cm default and printed its third stream at y=823.62,
// below the page number at 799.02 and on its way off the sheet. The bug had just
// been fixed for the bands and never swept to the sibling, which is the shape
// this repository keeps rebuilding.

/// Three declared streams all print, in order, above the page-foot line.
#[test]
fn three_declared_streams_stay_on_the_paper() {
    let body = "#הגדרות_זרמים(גבהים: (\"ביאור\": 2cm, \"מקורות\": 1.5cm, \"נוסחאות\": 1.5cm))\n\n\
                טקסט#הערה_זרם(\"ביאור\")[אחת] ועוד#הערה_זרם(\"מקורות\")[שתיים] \
                ועוד#הערה_זרם(\"נוסחאות\")[שלוש] וסוף.\n";
    let (line, lowest) = foot(body);
    assert!(
        lowest <= line + 0.5,
        "a stream printed below the page-foot line ({lowest:.2} > {line:.2})"
    );
    assert!(
        lowest < A4_PT,
        "something printed off the sheet: {lowest:.2}"
    );

    let doc = probe::layout(body, &DocConfig::default()).expect("it lays out");
    let runs = probe::text_runs(&doc);
    let at = |needle: &str| {
        runs.iter()
            .find(|r| r.page == 1 && r.text.contains(needle))
            .map(|r| r.y)
            .unwrap_or_else(|| panic!("stream text {needle:?} never printed"))
    };
    let (a, b, c) = (at("אחת"), at("שתיים"), at("שלוש"));
    assert!(
        a < b && b < c,
        "the three streams are out of order: {a:.1}, {b:.1}, {c:.1}"
    );
    assert!(
        c < A4_PT,
        "the third stream printed at {c:.1} on an {A4_PT}pt sheet"
    );
}

/// A declared stream height is the height that stream gets.
///
/// Same claim as `a_declared_band_height_is_the_height_the_band_gets`, one
/// apparatus over, and asserted the same way: against a *difference* of declared
/// heights, so the furniture between the two regions cancels out.
#[test]
fn a_declared_stream_height_is_the_height_the_stream_gets() {
    let entries = |heights: &str| -> Vec<f64> {
        let body = format!(
            "#הגדרות_זרמים(גבהים: {heights})\n\n\
             טקסט#הערה_זרם(\"ביאור\")[אחת] ועוד#הערה_זרם(\"מקורות\")[שתיים] וסוף.\n"
        );
        let doc = probe::layout(&body, &DocConfig::default()).expect("it lays out");
        let mut ys: Vec<f64> = probe::text_runs(&doc)
            .iter()
            .filter(|r| r.page == 1 && (r.text.contains("אחת") || r.text.contains("שתיים")))
            .map(|r| r.y)
            .collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
        ys
    };
    let small = entries("(\"ביאור\": 1cm, \"מקורות\": 1cm)");
    let large = entries("(\"ביאור\": 3cm, \"מקורות\": 1cm)");
    assert_eq!(small.len(), 2, "both streams print: {small:?}");
    assert_eq!(large.len(), 2, "both streams print: {large:?}");
    let grew = (large[1] - large[0]) - (small[1] - small[0]);
    let want = 2.0 * PER_CM;
    assert!(
        (grew - want).abs() < 2.0,
        "asking for 2cm more of the ביאור stream moved מקורות by {grew:.1}pt, not {want:.1}pt"
    );
}

/// A region height in percent is a percentage of the sheet.
///
/// Two halves have to agree here: Rust turns `%` into the centimetres it takes
/// off the bottom margin, and the prelude resolves the same ratio against
/// `page.height`. Handed to `block(height:)` raw a ratio resolves against the
/// *reserve block* instead — a percentage of a percentage — and the only visible
/// symptom would be a region a fraction of the size that was asked for.
///
/// Measured on two papers, because "a percentage of the page" is exactly the
/// claim that a single paper cannot distinguish from "some fixed length".
#[test]
fn a_percent_region_is_a_percent_of_the_page() {
    let gap = |paper: &str| -> f64 {
        let cfg = DocConfig {
            paper: paper.into(),
            margin_cm: 1.5,
            ..Default::default()
        };
        let body = "#הגדרות_מדפים(גבהים: (20%, 5%))\n\n\
                    טקסט#מדף_א[אחת] ועוד#מדף_ב[שתיים] וסוף.\n";
        let doc = probe::layout(body, &cfg).expect("it lays out");
        let runs = probe::text_runs(&doc);
        let y = |needle: &str| {
            runs.iter()
                .find(|r| r.page == 1 && r.text.contains(needle))
                .map(|r| r.y)
                .unwrap_or_else(|| panic!("band text {needle:?} never printed on {paper}"))
        };
        y("שתיים") - y("אחת")
    };
    // Band א is 20% of the sheet, so the distance down to band ב is 20% of the
    // sheet plus the divider — and A3 is exactly √2 times as tall as A4.
    let a4 = gap("a4");
    let a3 = gap("a3");
    let want = 0.20 * (42.0 - 29.7) * PER_CM;
    assert!(
        (a3 - a4 - want).abs() < 4.0,
        "20% of the page moved band ב by {:.1}pt going A4→A3, not {want:.1}pt \
         (A4 gap {a4:.1}, A3 gap {a3:.1}) — a ratio resolved against the reserve \
         rather than the page would move by nothing like this",
        a3 - a4
    );
}

/// One stream, carrying tiered notes.
///
/// Streams and tiers are separate apparatuses — a stream is a *where*, a tier is
/// a *layer* — so a note inside a stream's body is an ordinary tiered note and
/// lands in the tiered apparatus, not in the stream. Nothing forbids it and
/// nothing had ever checked it: the two mechanisms are built out of the same
/// `_ap_note`/`_ap_group` machinery, and a shared renderer is exactly where one
/// arrangement quietly eats the other's registration.
#[test]
fn a_stream_can_carry_a_tiered_note() {
    let body = "#הגדרות_זרמים(גבהים: (\"ביאור\": 2.5cm))\n\n\
                טקסט#הערה_זרם(\"ביאור\")[הביאור#הערה[ההערה על הביאור]] וסוף.\n";
    let (line, lowest) = foot(body);
    assert!(
        lowest <= line + 0.5,
        "something printed below the foot line"
    );
    let doc = probe::layout(body, &DocConfig::default()).expect("it lays out");
    let runs = probe::text_runs(&doc);
    let printed = |needle: &str| runs.iter().any(|r| r.page == 1 && r.text.contains(needle));
    assert!(printed("הביאור"), "the stream's own note never printed");
    assert!(
        printed("ההערה על הביאור"),
        "the tiered note inside the stream never printed — the two apparatuses \
         are separate and both belong on the page"
    );
}

// ── a footer and a page number are two different things ─────────────────────

// The footer used to be `if custom … else if מספור`, so writing anything into
// the footer switched the page numbers off: *"The page footer removes page
// numbering. Setting one appears to overwrite the other."*
//
// They were never alternatives. A footer line is what the document says at the
// bottom of every page; the page number is where the reader is. A control that
// silently turns off a control three rows above it in the same panel is
// something a writer discovers by counting pages.

#[test]
fn a_footer_and_a_page_number_both_print() {
    let cfg = DocConfig {
        footer: "ספר הזכרון".to_string(),
        numbering: true,
        ..Default::default()
    };
    let doc = probe::layout("שורה של טקסט.", &cfg).expect("compiles");
    let runs = probe::text_runs(&doc);
    let footer = runs
        .iter()
        .find(|r| r.text.contains("ספר"))
        .expect("the footer line");
    let number = runs
        .iter()
        .find(|r| r.text.trim() == "1" && r.y > 700.0)
        .expect("the page number");
    // Stacked, number underneath, which is the order they are read in.
    assert!(
        number.y > footer.y,
        "footer at {} number at {}",
        footer.y,
        number.y
    );
    // And both inside the paper, not printed off the bottom of it.
    let (_, height) = probe::page_sizes(&doc)[0];
    assert!(number.y + number.size < height, "{} vs {height}", number.y);
}

#[test]
fn a_footer_on_its_own_still_prints_without_a_number() {
    let cfg = DocConfig {
        footer: "ספר הזכרון".to_string(),
        numbering: false,
        ..Default::default()
    };
    let runs = probe::text_runs(&probe::layout("שורה.", &cfg).expect("compiles"));
    assert!(runs.iter().any(|r| r.text.contains("ספר")));
    assert!(!runs.iter().any(|r| r.text.trim() == "1" && r.y > 700.0));
}

#[test]
fn a_number_on_its_own_is_unchanged() {
    let cfg = DocConfig {
        numbering: true,
        ..Default::default()
    };
    let runs = probe::text_runs(&probe::layout("שורה.", &cfg).expect("compiles"));
    assert!(runs.iter().any(|r| r.text.trim() == "1" && r.y > 700.0));
}

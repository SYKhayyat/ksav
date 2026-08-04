//! Rendered-output tests for two-sided page setup and PDF export options.
//!
//! Mirrored margins are the one feature on this list whose whole purpose is that
//! the page is *different* on the left leaf and the right leaf. Asserting that a
//! document compiles proves nothing at all about it — the uniform-margin layout
//! it replaced also compiled, and was wrong for anyone binding a sefer. So every
//! claim here is read off the laid-out page: which edge the text block sits
//! against, on which page number.

use ksav_engine::probe::{self, TextRun};
use ksav_engine::{compile_parts, DocConfig};

/// One paragraph, long enough that its lines run the full width of the measure,
/// repeated across three pages so verso and recto both exist.
///
/// The full width is the whole point. A short line in a right-to-left document
/// starts wherever it starts, so the leftmost glyph on the page reports the
/// length of the sentence rather than the width of the margin — an earlier
/// version of these tests measured exactly that and "proved" a default document
/// had a 12 cm left margin.
const PARA: &str = "בראשית ברא אלקים את השמים ואת הארץ והארץ היתה תהו ובהו וחשך על \
פני תהום ורוח אלקים מרחפת על פני המים ויאמר אלקים יהי אור ויהי אור וירא אלקים את \
האור כי טוב ויבדל אלקים בין האור ובין החשך ויקרא אלקים לאור יום ולחשך קרא לילה \
ויהי ערב ויהי בקר יום אחד ויאמר אלקים יהי רקיע בתוך המים ויהי מבדיל בין מים למים";

/// A short word given a paragraph of its own, so that it is set as a last line:
/// flush against the *inner* edge in a right-to-left document, and therefore a
/// usable probe for where that edge is.
const EDGE: &str = "סימן";

fn long_body() -> String {
    let page = format!("{PARA}\n\n{EDGE}\n");
    format!("{page}\n#מעבר_עמוד\n\n{page}\n#מעבר_עמוד\n\n{page}")
}

fn render(body: &str, cfg: &DocConfig) -> Vec<TextRun> {
    let doc = probe::layout(body, cfg).unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::text_runs(&doc)
}

/// The left edge of the body text on a page — the smallest x of any run big
/// enough to be body text rather than a running head.
///
/// The size filter is what keeps this honest: the header and the page number are
/// set at 0.85em and sit in the *margin*, so including them would report the
/// margin as narrower than it is and the mirroring assertions would pass on a
/// document that never mirrored anything.
fn body_left(runs: &[TextRun], page: usize) -> f64 {
    runs.iter()
        .filter(|r| r.page == page && r.size > 11.0)
        .map(|r| r.x)
        .fold(f64::INFINITY, f64::min)
}

/// Where the inner (right-hand, in Hebrew) edge of the text block is, up to a
/// constant.
///
/// There is no width on a probed run, so the right-hand edge cannot be read off
/// directly the way the left one can. `EDGE` sits alone as a paragraph's last
/// line, flush right, so its start x is `right_edge − width("סימן")` — and that
/// width does not change between two renders of the same document at the same
/// size. Differences in this number are therefore differences in the edge, which
/// is all any assertion here needs.
fn inner_edge(runs: &[TextRun], page: usize) -> f64 {
    runs.iter()
        .find(|r| r.page == page && r.text.contains(EDGE))
        .unwrap_or_else(|| panic!("no {EDGE:?} run on page {page}"))
        .x
}

/// Text on a page, at any size — headers included.
fn page_text(runs: &[TextRun], page: usize) -> String {
    runs.iter()
        .filter(|r| r.page == page)
        .map(|r| r.text.as_str())
        .collect()
}

fn two_sided() -> DocConfig {
    DocConfig {
        margin_inner_cm: Some(4.0),
        margin_outer_cm: Some(1.5),
        two_sided: true,
        ..DocConfig::default()
    }
}

// ── mirrored margins ─────────────────────────────────────────────────────────

#[test]
fn two_sided_margins_swap_between_verso_and_recto() {
    let runs = render(&long_body(), &two_sided());
    // Hebrew binds on the right, so an odd page's inside edge is the right one:
    // the wide margin is on the right and the text starts close to the left edge.
    // On the even page it is the other way round.
    let odd_left = body_left(&runs, 1);
    let even_left = body_left(&runs, 2);
    assert!(
        even_left > odd_left + 20.0,
        "the wide inner margin should move to the left on an even page, \
         but the text starts at {odd_left:.1}pt on page 1 and {even_left:.1}pt on page 2"
    );
    // And page 3, odd again, matches page 1 rather than page 2.
    let third_left = body_left(&runs, 3);
    assert!(
        (third_left - odd_left).abs() < 1.0,
        "page 3 is odd like page 1 and should share its geometry: {third_left:.1} vs {odd_left:.1}"
    );
}

#[test]
fn one_sided_margins_do_not_swap() {
    // The same asymmetric margins without דו_צדדי: inner is simply the right-hand
    // margin on every page. Without this the mirroring would be unavoidable, and
    // a screen-read document would alternate for no reason.
    let cfg = DocConfig {
        two_sided: false,
        ..two_sided()
    };
    let runs = render(&long_body(), &cfg);
    assert!(
        (body_left(&runs, 1) - body_left(&runs, 2)).abs() < 1.0,
        "a one-sided document must lay every page out the same way"
    );
}

#[test]
fn a_default_document_still_has_the_margin_it_was_asked_for() {
    // The regression that matters most: every document written before any of this
    // existed sets none of these fields and must be laid out exactly as it was.
    // 2.5 cm is the default margin, and 2.5 cm is where the text must start.
    let runs = render(&long_body(), &DocConfig::default());
    let expected = 2.5 * 72.0 / 2.54; // cm → points
    let l = body_left(&runs, 1);
    assert!(
        (l - expected).abs() < 1.0,
        "the left margin should be the configured {expected:.1}pt, and is {l:.1}pt"
    );
    assert!(
        (body_left(&runs, 1) - body_left(&runs, 2)).abs() < 0.5
            && (inner_edge(&runs, 1) - inner_edge(&runs, 2)).abs() < 0.5,
        "default pages must not mirror"
    );
}

#[test]
fn the_gutter_widens_only_the_inner_margin() {
    let plain = render(&long_body(), &two_sided());
    let bound = render(
        &long_body(),
        &DocConfig {
            gutter_cm: 1.0,
            ..two_sided()
        },
    );
    let cm = 72.0 / 2.54;
    // Page 1 is bound on the right, so the gutter eats into the right-hand side:
    // the inner edge moves left by exactly the gutter, and the outer edge does
    // not move at all. Exactly, not approximately — a gutter that also shifted
    // the outer margin would be centring the text block rather than binding it.
    assert!(
        (inner_edge(&plain, 1) - inner_edge(&bound, 1) - cm).abs() < 1.0,
        "the inner edge should move in by 1cm ({cm:.1}pt), and moved by {:.1}pt",
        inner_edge(&plain, 1) - inner_edge(&bound, 1)
    );
    assert!(
        (body_left(&bound, 1) - body_left(&plain, 1)).abs() < 0.5,
        "the gutter must not touch the outer margin"
    );
    // On the even page the same gutter belongs to the left edge instead.
    assert!(
        (body_left(&bound, 2) - body_left(&plain, 2) - cm).abs() < 1.0,
        "on an even page the gutter widens the left margin by 1cm, not {:.1}pt",
        body_left(&bound, 2) - body_left(&plain, 2)
    );
}

// ── running heads ────────────────────────────────────────────────────────────

#[test]
fn verso_and_recto_carry_different_running_heads() {
    let cfg = DocConfig {
        header_odd: "פרק ראשון".into(),
        header_even: "מסכת ברכות".into(),
        two_sided: true,
        ..DocConfig::default()
    };
    let runs = render(&long_body(), &cfg);
    let p1 = page_text(&runs, 1);
    let p2 = page_text(&runs, 2);
    assert!(p1.contains("פרק"), "page 1 should carry the recto head: {p1}");
    assert!(!p1.contains("ברכות"), "page 1 must not carry the verso head");
    assert!(p2.contains("ברכות"), "page 2 should carry the verso head: {p2}");
    assert!(!p2.contains("פרק ראשון") || p2.matches("פרק").count() == 0);
}

#[test]
fn a_head_set_on_one_side_only_leaves_the_other_bare() {
    // A sefer that wants the masechta on the verso and nothing on the recto says
    // so by setting one side. The unset side must fall through to the plain
    // header — which is empty here — and print nothing, not repeat its partner.
    let cfg = DocConfig {
        header_even: "מסכת ברכות".into(),
        two_sided: true,
        ..DocConfig::default()
    };
    let runs = render(&long_body(), &cfg);
    assert!(!page_text(&runs, 1).contains("ברכות"));
    assert!(page_text(&runs, 2).contains("ברכות"));
}

#[test]
fn an_outside_aligned_page_number_changes_edge_with_the_leaf() {
    let cfg = DocConfig {
        head_align: "outside".into(),
        two_sided: true,
        ..DocConfig::default()
    };
    let runs = render(&long_body(), &cfg);
    // The page number is the only small-set run in the footer.
    let num_x = |page: usize| {
        runs.iter()
            .filter(|r| r.page == page && r.size < 11.0)
            .map(|r| r.x)
            .fold(f64::INFINITY, f64::min)
    };
    let (p1, p2) = (num_x(1), num_x(2));
    assert!(p1.is_finite() && p2.is_finite(), "expected a page number on both pages");
    assert!(
        (p1 - p2).abs() > 100.0,
        "an outside-aligned number should sit on opposite edges of facing pages, \
         but landed at {p1:.1}pt and {p2:.1}pt"
    );
    // Odd page binds on the right for Hebrew, so its outside edge is the left one.
    assert!(p1 < p2, "the recto number belongs on the left for a right-bound sefer");
}

#[test]
fn head_alignment_is_accepted_in_either_language() {
    let english = render(
        &long_body(),
        &DocConfig {
            head_align: "outside".into(),
            two_sided: true,
            ..DocConfig::default()
        },
    );
    let hebrew = render(
        &long_body(),
        &DocConfig {
            head_align: "חוץ".into(),
            two_sided: true,
            ..DocConfig::default()
        },
    );
    let x = |runs: &[TextRun]| {
        runs.iter()
            .filter(|r| r.page == 1 && r.size < 11.0)
            .map(|r| r.x)
            .fold(f64::INFINITY, f64::min)
    };
    assert!((x(&english) - x(&hebrew)).abs() < 0.01);
}

// ── PDF export options ───────────────────────────────────────────────────────

fn pdf_of(cfg: &DocConfig) -> ksav_engine::Compiled {
    compile_parts(&long_body(), cfg, &ksav_engine::assets::Assets::default(), true, false)
}

#[test]
fn a_plain_export_still_produces_a_pdf() {
    let out = pdf_of(&DocConfig::default());
    assert!(out.ok());
    let pdf = out.pdf.expect("a default export must produce bytes");
    assert!(pdf.starts_with(b"%PDF"));
}

#[test]
fn an_unknown_pdf_standard_is_reported_rather_than_swallowed() {
    // The old code was `typst_pdf::pdf(..).ok()`, so any export failure came back
    // as a successful compile with no PDF and no explanation. That is the exact
    // shape of bug this project has spent months removing from the apparatus.
    let out = pdf_of(&DocConfig {
        pdf_standard: "a-9z".into(),
        ..DocConfig::default()
    });
    assert!(out.pdf.is_none());
    assert!(
        out.diagnostics.iter().any(|d| d.message.contains("a-9z")),
        "the bad standard should be named in a diagnostic, got {:?}",
        out.diagnostics
    );
}

#[test]
fn pdf_a_export_names_what_it_needs() {
    // PDF/A is allowed to refuse a document — an unembeddable font, a missing
    // title. Either outcome is fine; being told nothing is not. This asserts the
    // pairing rather than the verdict, because the verdict depends on the fonts
    // the engine happens to bundle.
    let out = pdf_of(&DocConfig {
        pdf_standard: "a-2b".into(),
        title: "ספר הבדיקה".into(),
        author: "המחבר".into(),
        ..DocConfig::default()
    });
    assert!(
        out.pdf.is_some() || !out.diagnostics.is_empty(),
        "a PDF/A export must produce either bytes or a reason"
    );
    if let Some(pdf) = out.pdf {
        assert!(pdf.starts_with(b"%PDF"));
    }
}

#[test]
fn a_page_range_exports_fewer_pages() {
    let all = pdf_of(&DocConfig::default()).pdf.unwrap();
    let out = pdf_of(&DocConfig {
        pdf_pages: "2".into(),
        ..DocConfig::default()
    });
    let one = out
        .pdf
        .unwrap_or_else(|| panic!("page-range export failed: {:?}", out.diagnostics));
    assert!(
        one.len() < all.len(),
        "one page of three should be smaller than all three: {} vs {}",
        one.len(),
        all.len()
    );
    // Typst cannot tag a subset of pages, so the tags come off — and the writer
    // is told, rather than discovering later that this one export is untagged.
    assert!(
        out.diagnostics
            .iter()
            .any(|d| d.severity == "warning" && d.message.contains("tags were dropped")),
        "dropping the tags should be stated: {:?}",
        out.diagnostics
    );
}

#[test]
fn metadata_reaches_the_file() {
    // Not a PDF parser: the title is written into the XMP packet as plain XML,
    // uncompressed, so its presence in the bytes is a genuine end-to-end check
    // that `set document(title:)` was reached at all — which is the part that
    // could plausibly break, since it is a set rule inside a show rule.
    let out = pdf_of(&DocConfig {
        title: "ShaarHaMetadata".into(),
        ..DocConfig::default()
    });
    let pdf = out.pdf.expect("export should succeed");
    let text = String::from_utf8_lossy(&pdf);
    assert!(
        text.contains("ShaarHaMetadata"),
        "the document title should appear in the PDF metadata"
    );
}

#[test]
fn tags_can_be_turned_off() {
    let tagged = pdf_of(&DocConfig::default()).pdf.unwrap();
    let untagged = pdf_of(&DocConfig {
        pdf_tagged: false,
        ..DocConfig::default()
    })
    .pdf
    .unwrap();
    assert!(
        untagged.len() < tagged.len(),
        "dropping the accessibility tree should shrink the file: {} vs {}",
        untagged.len(),
        tagged.len()
    );
}

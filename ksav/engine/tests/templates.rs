//! What a writer gets when they pick a template — read off the page.
//!
//! Ten templates demonstrated **eight of 115 commands** between them. Five used
//! nothing at all; four used a plain footnote; `sefer.ksav` used `#מראה_מקום`
//! without `מקור:`, so it filed nothing, and the file had no `#מפתח_מקורות()`
//! in it to file into. Zero used any note arrangement past the ordinary
//! footnote. So the one differentiated thing in this product — the apparatus
//! that `spec.md` is about, that `README-notes.md` is about, that 677 lines of
//! `apparatus.rs` hold — was demonstrated from no starting point a writer can
//! reach. A bochur who picked "ספר" got footnotes and a horizontal rule.
//!
//! Two templates were rewritten and two added. This is what holds them.
//!
//! **Probed, never `ok()`ed**, and `README-notes.md:7-17` is unambiguous about
//! why: every apparatus bug this project has had compiled cleanly and was wrong
//! on the page. A template that "compiles" is a template that may be rendering
//! its commentary on top of the page number. So each of these asks where the
//! words landed.

use ksav_engine::probe::{self, TextRun};
use ksav_engine::templates::template_body;
use ksav_engine::DocConfig;

fn render(id: &str) -> Vec<TextRun> {
    laid_out(id).0
}

/// The runs **and** the page sizes from **one** layout.
///
/// One, and that matters: laying the same template out twice and reading runs
/// from the first and sizes from the second gave a run on page 1 against a
/// one-page document. Two compiles of one apparatus document are not guaranteed
/// to agree — convergence is a property this apparatus works hard for and does
/// not get for free — so anything comparing a position to a page reads both from
/// the same layout.
fn laid_out(id: &str) -> (Vec<TextRun>, Vec<(f64, f64)>) {
    let body = template_body(id).unwrap_or_else(|| panic!("no template {id:?}"));
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("template {id:?} does not compile: {d:?}"));
    (probe::text_runs(&doc), probe::page_sizes(&doc))
}

/// Where a phrase printed.
///
/// **A phrase is not always a run.** A slanted one is sheared word by word and
/// every sheared word is a box of its own, so the gemara template's second band —
/// which ships italic, like every tier below the first — has no run holding a
/// sentence. Asking the run alone said the words were not on the page while they
/// were plainly on it at y=761.83.
///
/// So the line is asked when the run cannot answer, and the line's first run is
/// what comes back: every run of a phrase is on the same line at the same size,
/// which is all any caller here reads off it.
fn find<'a>(runs: &'a [TextRun], needle: &str) -> &'a TextRun {
    if let Some(r) = runs.iter().find(|r| r.text.contains(needle)) {
        return r;
    }
    let line = probe::lines(runs, 1.0)
        .into_iter()
        .find(|l| l.contains(needle))
        .unwrap_or_else(|| panic!("{needle:?} is not on the page"));
    let first = line.runs.first().expect("a line has a run").clone();
    runs.iter()
        .find(|r| r.page == first.page && r.y == first.y && r.x == first.x)
        .expect("the line's own run")
}

fn has(runs: &[TextRun], needle: &str) -> bool {
    runs.iter().any(|r| r.text.contains(needle))
        || probe::lines(runs, 1.0).iter().any(|l| l.contains(needle))
}

/// The whole point of the sefer template: notes on notes, and an index.
///
/// It used to be `#מראה_מקום[…]` with no `מקור:`, which files nothing — so the
/// template's one gesture towards the apparatus produced a footnote and an empty
/// promise. Now the commentary is a tiered `#מדור_א`/`#מדור_ב` band, the
/// citations carry `#ציון_מקור`, and both indexes print at the back.
#[test]
fn the_sefer_template_renders_its_apparatus() {
    let runs = render("sefer");
    let body = find(&runs, "אָסוּר");

    // A tier-two note is on the page and below the text it hangs off. The band
    // renders in the page footer, so "below" is the assertion that it landed in
    // the apparatus rather than inline in the prose.
    let tier2 = find(&runs, "ויש שדקדקו");
    assert!(
        tier2.y > body.y,
        "the second-tier note printed above the text it comments on ({} vs {})",
        tier2.y,
        body.y
    );

    // The source index printed, which is what `#ציון_מקור` is for and what the
    // old template's `#מראה_מקום` could never have produced.
    assert!(
        has(&runs, "מפתח המקורות"),
        "the source index is missing — `#מפתח_מקורות()` filed nothing"
    );
    // And it prints the *canonical* spelling, not whatever was typed: the whole
    // reason `#ציון_מקור` exists is that ב״ב and בבא בתרא are one sefer.
    assert!(
        has(&runs, "ברכות") && has(&runs, "שולחן ערוך"),
        "the index has no entries in it"
    );
    assert!(
        has(&runs, "מראי המקומות"),
        "the mareh mekomos list did not print"
    );
}

/// The d'var Torah sheet, with the marginal notes it is actually written with.
#[test]
fn the_divrei_torah_template_puts_its_notes_in_the_margin() {
    let runs = render("divrei-torah");
    let body = find(&runs, "והקשה");
    let side = find(&runs, "מקור הקושיה");

    // A sidenote is beside its text, not under it: same page, and further out
    // horizontally than the body column.
    assert_eq!(
        side.page, body.page,
        "the sidenote left the page its marker is on"
    );
    assert!(
        (side.x - body.x).abs() > 20.0,
        "the sidenote is in the text column, not the margin ({} vs {})",
        side.x,
        body.x
    );
    // The plain footnote still works alongside it — the two mechanisms are
    // independent and a template using both is the case that proves it.
    assert!(has(&runs, "מדרש תנחומא"), "the footnote did not render");
}

/// The Gemara look: fixed regions at the foot, which hold their slot.
#[test]
fn the_gemara_template_lays_out_two_fixed_bands() {
    let (runs, sizes) = laid_out("gemara");
    let body = find(&runs, "כֵּיצַד");
    let first = find(&runs, "כל פרי הגדל באילן");
    let second = find(&runs, "ועיין במה שדנו");

    assert!(
        first.y > body.y && second.y > first.y,
        "the bands are not stacked under the text (body {}, band א {}, band ב {})",
        body.y,
        first.y,
        second.y
    );
    // Both bands are on the paper.
    //
    // This is the first thing in the repository to exercise the note reserve, and
    // it found that `auto_notes_region_cm` returns a flat **3 cm** for any
    // document with a page-foot apparatus in it — it never reads the `גבהים` the
    // document configured. The template asked for 3.5 + 2.5 cm and the second
    // band rendered 51pt below the bottom edge of A4, with the page number under
    // it. The template's heights now fit the reserve; making the reserve read the
    // heights is a real fix and is not this one.
    // `TextRun.page` is 1-based (`probe.rs` walks `enumerate()` and stores `i + 1`).
    let height = sizes[second.page - 1].1;
    assert!(
        second.y < height,
        "the second band ran off the bottom of the paper ({} of {})",
        second.y,
        height
    );
}

/// Two streams, side by side, each numbered on its own.
#[test]
fn the_peirush_template_runs_two_streams_in_parallel() {
    let runs = render("peirush");
    // The two column *headings*, which is the visible claim of this card and the
    // one thing in it that is unambiguous: an entry's text can repeat elsewhere
    // on the page (a canonical sefer name prints again in the source index), and
    // a test that matches the wrong run compares a heading to a body line and
    // reports "stacked" about a layout that is not.
    // The two column *headings*, matched exactly. `contains` found the page's
    // own subtitle first — "ביאורים ומראי מקומות זה לצד זה" holds both words —
    // and comparing a subtitle to a heading reported "stacked" about a layout
    // that is side by side. A substring match on a document that talks about
    // itself is a trap, and this template talks about itself in its subtitle.
    let exact = |needle: &str| {
        runs.iter()
            .find(|r| r.text.trim() == needle)
            .unwrap_or_else(|| panic!("no run is exactly {needle:?}"))
    };
    let content = exact("ביאורים");
    let source = exact("מראי מקומות");

    assert_eq!(
        content.page, source.page,
        "the two streams landed on different pages"
    );
    assert!(
        (content.y - source.y).abs() < 6.0,
        "the streams are stacked rather than side by side ({} vs {})",
        content.y,
        source.y
    );
    assert!(
        (content.x - source.x).abs() > 20.0,
        "the streams share a column ({} vs {})",
        content.x,
        source.x
    );
}

/// Every template compiles and puts words on a page.
///
/// The weakest assertion here, and it is still worth making for the ones with no
/// apparatus in them: `letter`, `kesubah` and `bentcher` are deliberately plain,
/// and "deliberately plain" must not shade into "empty".
#[test]
fn every_template_renders_something() {
    for t in ksav_engine::templates::TEMPLATES {
        let runs = render(t.id);
        assert!(
            runs.len() > 5,
            "template {:?} rendered {} text runs — it is effectively blank",
            t.id,
            runs.len()
        );
    }
}

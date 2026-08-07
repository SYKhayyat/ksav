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
    let body = template_body(id).unwrap_or_else(|| panic!("no template {id:?}"));
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("template {id:?} does not compile: {d:?}"));
    probe::text_runs(&doc)
}

fn find<'a>(runs: &'a [TextRun], needle: &str) -> &'a TextRun {
    runs.iter()
        .find(|r| r.text.contains(needle))
        .unwrap_or_else(|| panic!("{needle:?} is not on the page"))
}

fn has(runs: &[TextRun], needle: &str) -> bool {
    runs.iter().any(|r| r.text.contains(needle))
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
    let runs = render("gemara");
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
    // Both bands are on the paper. A fixed-height apparatus with no reserved
    // note region grows straight off the bottom of the page, taking the page
    // number with it — which is exactly what `auto_notes_region_cm` is for, and
    // this template is the first thing in the repository that exercises it.
    let (_, sizes) = {
        let body_src = template_body("gemara").unwrap();
        let doc = probe::layout(body_src, &DocConfig::default()).unwrap();
        (probe::text_runs(&doc), probe::page_sizes(&doc))
    };
    let height = sizes[second.page].1;
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
    let content = find(&runs, "והטעם, שכל הנהנה");
    let source = find(&runs, "ל״ה ע״א");

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

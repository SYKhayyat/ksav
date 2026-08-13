//! Three page-setup questions the writer could ask and the program could not answer.
//!
//! All three come out of the same review, and all three have the same shape: the
//! engine could already do the thing, and there was no way to say it.
//!
//! 1. **Where the text sits.** `justify` is a boolean, so page setup could say
//!    *justified or not* and had no word at all for *which edge*. A centred
//!    sheet meant wrapping every paragraph in `#מרכז`.
//!
//! 2. **What enters the table of contents.** `#תוכן` took a title and a
//!    numbering scheme. Every heading in the document went in, and the title
//!    page's own heading went in with them.
//!
//! 3. **What runs across the top of the page.** Six settings fields, all of them
//!    strings — so `*שם הספר*` printed its asterisks, and no document could
//!    change its running head between one chapter and the next.
//!
//! Measured off the laid-out page rather than off the assembled source, because
//! all three are claims about where letters end up. A test that asserts the
//! `format!` produced `יישור: "center"` would pass on a prelude that ignores it.

mod common;

use common::{render, render_with, text, visual_lines};
use ksav_engine::probe;
use ksav_engine::DocConfig;

/// The horizontal midpoint of the line holding `needle`, on an A4 page.
fn centre_of(body: &str, cfg: &DocConfig, needle: &str) -> f64 {
    let runs = render_with(body, cfg);
    let lines = visual_lines(&runs);
    let l = common::line_with(&lines, needle);
    let left = l.runs.iter().map(|r| r.x).fold(f64::MAX, f64::min);
    let right = l
        .runs
        .iter()
        .map(|r| r.x + r.width)
        .fold(f64::MIN, f64::max);
    (left + right) / 2.0
}

// ---------------------------------------------------------------- 1. where the text sits

/// A short line, so alignment is visible: a justified line fills the measure and
/// tells you nothing about which edge it was ranged at.
const SHORT: &str = "מלהאחת\n";

#[test]
fn a_document_can_be_centred() {
    let sheet = 595.28; // A4 width in points
    let centred = DocConfig {
        text_align: "center".to_string(),
        justify: false,
        ..Default::default()
    };
    let mid = centre_of(SHORT, &centred, "מלהאחת");
    assert!(
        (mid - sheet / 2.0).abs() < 8.0,
        "a centred line should sit on the middle of the sheet, was at x={mid}"
    );
}

#[test]
fn and_ranged_at_either_edge() {
    let sheet = 595.28;
    let right = centre_of(
        SHORT,
        &DocConfig {
            text_align: "right".to_string(),
            justify: false,
            ..Default::default()
        },
        "מלהאחת",
    );
    let left = centre_of(
        SHORT,
        &DocConfig {
            text_align: "left".to_string(),
            justify: false,
            ..Default::default()
        },
        "מלהאחת",
    );
    assert!(right > sheet / 2.0, "ranged right should sit right of centre, was {right}");
    assert!(left < sheet / 2.0, "ranged left should sit left of centre, was {left}");
    assert!(left < right, "the two edges are not the same place");
}

#[test]
fn an_unrecognised_alignment_falls_back_rather_than_guessing() {
    // Sanitised on the way in, so it never reaches the prelude at all: a
    // nonsense edge leaves the document laid out exactly as its `justify` said.
    let odd = DocConfig {
        text_align: "sideways".to_string(),
        justify: false,
        ..Default::default()
    };
    let plain = DocConfig {
        justify: false,
        ..Default::default()
    };
    assert_eq!(
        centre_of(SHORT, &odd, "מלהאחת"),
        centre_of(SHORT, &plain, "מלהאחת"),
    );
}

#[test]
fn a_document_written_before_this_existed_is_unchanged() {
    // The whole compatibility claim in one assertion: an empty `text_align` is
    // "take `justify`", which is what every document ever saved says.
    let sheet = 595.28;
    let justified = DocConfig::default();
    assert!(justified.text_align.is_empty(), "the shipped default says nothing");
    let long = "מילה ".repeat(60) + "\n";
    let runs = render_with(&long, &justified);
    let lines = visual_lines(&runs);
    // A justified paragraph's inner lines reach both margins. One is enough:
    // this is a control, not a study of justification.
    let first = &lines[0];
    let right = first.runs.iter().map(|r| r.x + r.width).fold(f64::MIN, f64::max);
    assert!(right > sheet * 0.7, "justified text should reach the far margin, ended at {right}");
}

// ---------------------------------------------------------------- 2. the contents

const NESTED: &str = "#תוכן()\n\n#כותרת1[פרקראשון]\n\n#כותרת2[סימןאחד]\n\nגוף.\n";

#[test]
fn every_level_enters_the_contents_by_default() {
    let page = text(&render(NESTED));
    assert!(page.contains("פרקראשון"), "the chapter is in it");
    assert!(page.matches("סימןאחד").count() >= 2, "and so is the sub-heading, twice — contents and body");
}

#[test]
fn a_depth_keeps_the_contents_to_that_many_levels() {
    let shallow = NESTED.replace("#תוכן()", "#תוכן(עומק: 1)");
    let page = text(&render(&shallow));
    assert!(page.contains("פרקראשון"), "level one still enters");
    assert_eq!(
        page.matches("סימןאחד").count(),
        1,
        "level two appears in the body and not in the contents"
    );
}

#[test]
fn and_english_says_depth() {
    let body = "#toc(depth: 1)\n\n#h1[Chapter]\n\n#h2[Section]\n\nBody.\n";
    let cfg = DocConfig {
        dir: "ltr".to_string(),
        ..Default::default()
    };
    let page = text(&render_with(body, &cfg));
    assert!(page.contains("Chapter"));
    assert_eq!(page.matches("Section").count(), 1);
}

#[test]
fn one_heading_can_be_kept_out() {
    // The other half, and the half that has no other spelling: *not this one*.
    let out = NESTED.replace("#כותרת1[פרקראשון]", "#כותרת1(בתוכן: false)[פרקראשון]");
    let page = text(&render(&out));
    assert_eq!(
        page.matches("פרקראשון").count(),
        1,
        "the excluded heading prints in the body and not in the contents"
    );
    assert!(
        page.matches("סימןאחד").count() >= 2,
        "its neighbour is untouched"
    );
}

#[test]
fn and_it_is_still_a_heading() {
    // A heading kept out of the contents is not a paragraph: it still steps the
    // counter, so the one after it is numbered as though both were there.
    let out = "#הגדרות_כותרות(מספור: \"1.\")\n\n#כותרת1(בתוכן: false)[אלף]\n\n#כותרת1[בית]\n";
    let page = text(&render(out));
    assert!(page.contains("2."), "the second heading is still number two, was: {page}");
}

#[test]
fn typsts_own_name_still_works() {
    // `outlined` reached `heading` all along, through the strays path. Adding a
    // Hebrew name must not have taken the English one away.
    let out = NESTED.replace("#כותרת1[פרקראשון]", "#כותרת1(outlined: false)[פרקראשון]");
    assert_eq!(text(&render(&out)).matches("פרקראשון").count(), 1);
}

// ---------------------------------------------------------------- 3. the running heads

#[test]
fn a_running_head_can_be_set_from_the_document() {
    let body = "#כותרת_עליונה[שםהספר]\n\nגוף.\n";
    let page = text(&render(body));
    assert!(page.contains("שםהספר"), "the running head printed, page was: {page}");
}

#[test]
fn and_it_can_carry_markup_which_is_the_whole_point() {
    // The finding, exactly: a settings field is a string, so `*שם*` printed its
    // asterisks. Content does not.
    let body = "#כותרת_עליונה[#הדגשה[שםהספר]]\n\nגוף.\n";
    let page = text(&render(body));
    assert!(page.contains("שםהספר"), "the bold head printed");
    assert!(!page.contains('*'), "and not as asterisks");
}

#[test]
fn the_footer_too_and_the_page_number_survives_it() {
    // A running foot and a page number are not alternatives — this was reported
    // once already, about the settings field, and the command must not
    // reintroduce it.
    let body = "#כותרת_תחתונה[שורתרגל]\n\nגוף.\n";
    let page = text(&render(body));
    assert!(page.contains("שורתרגל"), "the foot printed");
    assert!(page.contains('1'), "and so did the page number, page was: {page}");
}

#[test]
fn a_document_that_says_nothing_gets_nothing() {
    // The compatibility claim for the other side of it: the header is installed
    // unconditionally now, and must render nothing when nothing has been said.
    let plain = text(&render("גוףבלבד.\n"));
    assert!(plain.contains("גוףבלבד"));
    // Only the body and the page number are on the paper.
    assert_eq!(
        plain.replace("גוףבלבד.", "").replace('1', "").trim(),
        "",
        "an empty header printed something: {plain:?}"
    );
}

#[test]
fn the_settings_field_still_works_and_the_command_wins() {
    let cfg = DocConfig {
        header: "מןההגדרות".to_string(),
        ..Default::default()
    };
    let from_field = text(&render_with("גוף.\n", &cfg));
    assert!(from_field.contains("מןההגדרות"), "the field still reaches the page");

    let from_doc = text(&render_with("#כותרת_עליונה[מןהמסמך]\n\nגוף.\n", &cfg));
    assert!(from_doc.contains("מןהמסמך"), "the command's line printed");
    assert!(
        !from_doc.contains("מןההגדרות"),
        "and the field's did not — one running head, not two"
    );
}

#[test]
fn a_running_head_can_change_partway_through() {
    // What a settings field could never say, and what a bound sefer wants: the
    // masechta over one chapter and a different one over the next.
    let body = "#כותרת_עליונה[ראשון]\n\nגוף.\n\n#מעבר_עמוד\n\n#כותרת_עליונה[שני]\n\nעוד.\n";
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    let runs = probe::text_runs(&doc);
    let sizes = probe::page_sizes(&doc);
    assert!(sizes.len() >= 2, "the document should be two pages, was {}", sizes.len());
    // `TextRun::page` is 1-based.
    let page_one: String = runs.iter().filter(|r| r.page == 1).map(|r| r.text.as_str()).collect();
    let page_two: String = runs.iter().filter(|r| r.page == 2).map(|r| r.text.as_str()).collect();
    assert!(page_one.contains("ראשון"), "page one carries the first head: {page_one}");
    assert!(page_two.contains("שני"), "page two carries the second: {page_two}");
    assert!(!page_two.contains("ראשון"), "and not the first as well");
}

#[test]
fn english_names_both_of_them() {
    let cfg = DocConfig {
        dir: "ltr".to_string(),
        ..Default::default()
    };
    let page = text(&render_with(
        "#running_head[Masechta]\n\n#running_foot[Kuntres]\n\nBody.\n",
        &cfg,
    ));
    assert!(page.contains("Masechta"), "the English head printed: {page}");
    assert!(page.contains("Kuntres"), "and the English foot: {page}");
}

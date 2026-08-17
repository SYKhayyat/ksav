//! The five commands that are arguments rather than commands.
//!
//! `#פריט` is one entry of a `#רשימה`; `#תא`, `#כותרת_תא` and `#מיזוג` are cells
//! of a `#טבלה`; `#הגדרה` is a row of a `#רשימת_הגדרות`. The structure lives
//! entirely in the parent, which takes its children as **positional arguments**,
//! so the commas and the parentheses were the whole mechanism and the command
//! name was decoration around them:
//!
//!   #רשימה(פריט[א], פריט[ב])      two bullets — the shape every toolbar writes
//!   #רשימה[#פריט[א] #פריט[ב]]      one bullet, both words inside it
//!   #פריט[א]                       body text, no bullet, and no complaint
//!
//! The second is what a writer types coming from Typst, where `#list[…]` is
//! idiomatic. Nothing caught either, and nothing could have: the toolbar, the
//! docx importer and the list ribbon all emit the paren form, so every path the
//! product drives was correct and only the hand-typed one was on its own. It
//! took writing a sefer by hand to find it.
//!
//! Both halves are asserted here, and the second is the one that matters more:
//! a fix that made the bracket form work by making every child carry a visible
//! mark would pass the first six tests and put a red badge in every correct
//! list in the world. `a_consumed_child_leaves_nothing_behind` is that test.

mod common;
use common::{has_badge, page_text, render, visual_lines, BADGE_EN, BADGE_HE};
use ksav_engine::DocConfig;

fn bullets(body: &str) -> usize {
    page_text(body).matches('•').count()
}

#[test]
fn the_argument_form_is_two_items() {
    // The shape the product writes, and the baseline every other case is read
    // against. If this ever breaks, nothing below means anything.
    assert_eq!(bullets("#רשימה(פריט[אלף], פריט[בית])"), 2);
}

#[test]
fn the_bracketed_form_is_two_items_as_well() {
    // This was one bullet holding both words, silently, for as long as the
    // command has existed.
    let out = page_text("#רשימה[#פריט[אלף] #פריט[בית]]");
    assert_eq!(out.matches('•').count(), 2, "{out}");
    assert!(out.contains("אלף") && out.contains("בית"), "{out}");
}

#[test]
fn plain_content_is_still_one_item_each() {
    // No marks anywhere: a list written before these existed, which is most of
    // the ones in the wild and every one in the fixtures.
    assert_eq!(bullets("#רשימה[הא][ואו]"), 2);
}

#[test]
fn a_numbered_list_counts_the_same_way() {
    let out = page_text("#ממוספרת[#פריט[זין] #פריט[חית]]");
    assert!(out.contains("1.") && out.contains("2."), "{out}");
    assert!(!out.contains("3."), "one item too many: {out}");
}

#[test]
fn a_hebrew_lettered_list_counts_the_same_way() {
    // Routed through #ממוספרת, so the parent the children are checked against is
    // `ממוספרת` and not `ממוספרת_עברית`. Worth its own test precisely because
    // the name in the document is not the name that reaches the check.
    let out = page_text("#ממוספרת_עברית[#פריט[טית] #פריט[יוד]]");
    assert!(out.contains("א.") && out.contains("ב."), "{out}");
}

#[test]
fn a_nested_list_keeps_its_own_depth() {
    // The inner list is inside the body a mark carries, which is the one place
    // the recursion could have lost it.
    let out = page_text("#רשימה(פריט[כף #רשימה(פריט[למד])])");
    assert!(out.contains("כף") && out.contains("למד"), "{out}");
    assert!(out.contains('•') && out.contains('‣'), "two depths: {out}");
}

#[test]
fn a_bracketed_table_is_still_a_table_of_cells() {
    // Four cells in two columns is two rows. Written with brackets it was one
    // positional argument, therefore one cell, therefore one row — and a table
    // that quietly lost three cells looks like a table.
    let rows = visual_lines(&render(
        "#טבלה(עמודות: 2)[#כותרת_תא[ראש] #כותרת_תא[שני] #תא[א] #תא[ב]]",
    ))
    .len();
    let same = visual_lines(&render(
        "#טבלה(עמודות: 2, כותרת_תא[ראש], כותרת_תא[שני], תא[א], תא[ב])",
    ))
    .len();
    assert_eq!(rows, same, "the two spellings lay out differently");
    let out = page_text("#טבלה(עמודות: 2)[#כותרת_תא[ראש] #כותרת_תא[שני] #תא[א] #תא[ב]]");
    for word in ["ראש", "שני", "א", "ב"] {
        assert!(out.contains(word), "cell {word} missing: {out}");
    }
}

#[test]
fn a_merged_cell_survives_the_split() {
    // `#מיזוג` is a real `table.cell(colspan:)`, not the identity — so it goes
    // through the mark as an element rather than as prose, and comes out the
    // other side still a cell.
    let out = page_text("#טבלה(עמודות: 2, מיזוג(2)[רחב], תא[ה], תא[ו])");
    assert!(
        out.contains("רחב") && out.contains("ה") && out.contains("ו"),
        "{out}"
    );
    assert!(!has_badge(&out), "a correct merge wore a badge: {out}");
}

#[test]
fn a_definition_list_takes_its_rows() {
    let out = page_text("#רשימת_הגדרות(הגדרה[מונח][פירוש], הגדרה[שני][שלישי])");
    for word in ["מונח", "פירוש", "שני", "שלישי"] {
        assert!(out.contains(word), "{word} missing: {out}");
    }
    assert!(!has_badge(&out), "{out}");
}

#[test]
fn a_consumed_child_leaves_nothing_behind() {
    // **The guard.** Every correct usage in the language, asserted to be clean.
    //
    // The badge is carried by the child itself and removed by the parent that
    // consumes it — which is what lets a stray announce itself without a
    // document-wide `show metadata:` rule over the apparatus machinery. The
    // whole design rests on the removal being exact, and the failure mode if it
    // is not is a red box in every list, table and definition list ever written.
    for doc in [
        "#רשימה(פריט[א], פריט[ב])",
        "#רשימה[#פריט[א] #פריט[ב]]",
        "#ממוספרת(פריט[א])",
        "#ממוספרת_עברית(פריט[א])",
        "#טבלה(עמודות: 2, תא[א], תא[ב])",
        "#טבלה(עמודות: 2, כותרת_תא[א], כותרת_תא[ב])",
        "#טבלה(עמודות: 1, מיזוג(1)[א])",
        "#רשימת_הגדרות(הגדרה[א][ב])",
    ] {
        let out = page_text(doc);
        assert!(!has_badge(&out), "badge leaked into {doc}: {out}");
    }
}

#[test]
fn a_child_with_no_parent_says_so() {
    let out = page_text("יתום: #פריט[בודד] וזהו");
    assert!(has_badge(&out), "no badge: {out}");
    assert!(
        out.contains("פריט"),
        "the badge does not name the command: {out}"
    );
}

#[test]
fn the_badge_speaks_the_document_s_language() {
    // A diagnostic in a language the reader is not writing in.
    //
    // `#item` and `#פריט` are the same command, and by the time the badge is
    // drawn the alias is gone — so it named the Hebrew spelling in an English
    // sefer, to somebody who had never typed a Hebrew letter. `text.lang` is
    // what the page setup set, which is the same thing the table of contents
    // reads to choose between תוכן העניינים and Contents.
    let hebrew = page_text("יתום: #פריט[בודד] וזהו");
    assert!(hebrew.contains(BADGE_HE), "the Hebrew badge: {hebrew}");
    assert!(
        hebrew.contains("פריט"),
        "names the Hebrew command: {hebrew}"
    );
    assert!(
        !hebrew.contains(BADGE_EN),
        "a Hebrew document was told twice: {hebrew}"
    );

    let english = DocConfig {
        lang: "en".to_string(),
        dir: "ltr".to_string(),
        ..DocConfig::default()
    };
    let out = common::text(&common::render_with(
        "stray: #item[alone] and that",
        &english,
    ));
    assert!(out.contains(BADGE_EN), "the English badge: {out}");
    assert!(
        out.contains("item"),
        "the badge does not name the command this reader typed: {out}"
    );
    assert!(
        !out.contains(BADGE_HE) && !out.contains("פריט"),
        "an English document was shown the Hebrew command: {out}"
    );
}

#[test]
fn every_english_name_the_badge_uses_is_a_real_alias() {
    // `_kd_english` is a second spelling of a name already in the prelude, and
    // the thing that keeps it from being a second *authority* is this: each row
    // must name an alias the prelude actually defines. `"פריט": "items"` is a
    // badge pointing at a command that does not exist, and it would render, and
    // it would be wrong only to a reader — which is the class of defect this
    // whole file is about.
    const PRELUDE: &str = include_str!("../typst/ksav.typ");
    let table = PRELUDE
        .split_once("#let _kd_english = (")
        .expect("the prelude has no _kd_english")
        .1
        .split_once("\n)")
        .expect("unterminated _kd_english")
        .0;
    let mut rows = 0;
    for line in table.lines() {
        let Some((he, rest)) = line.trim().split_once("\": \"") else {
            continue;
        };
        let he = he.trim_start_matches('"');
        let en = rest.split('"').next().expect("a quoted English name");
        rows += 1;
        assert!(
            PRELUDE.contains(&format!("\n#let {en} = {he}\n")),
            "the badge calls `{he}` `{en}`, and the prelude defines no `#let {en} = {he}`"
        );
    }
    assert_eq!(rows, 5, "five commands are structural children, not {rows}");
}

#[test]
fn a_stray_child_still_prints_its_words() {
    // A badge *beside* the words is a writer noticing. A badge *instead of* them
    // is a writer losing a paragraph, which is a worse bug than the one this
    // replaced — the identity function at least printed the text.
    let out = page_text("#פריט[מלים שאסור לאבד]");
    assert!(out.contains("מלים שאסור לאבד"), "the body was eaten: {out}");
}

#[test]
fn a_child_in_the_wrong_parent_says_so_and_is_still_taken() {
    // `#תא` is a cell and a `#רשימה` is not a table. It is consumed anyway —
    // the rest of the list keeps its shape — and it wears the badge.
    let out = page_text("#רשימה(פריט[טוב], תא[רע])");
    assert!(has_badge(&out), "no badge: {out}");
    assert_eq!(
        out.matches('•').count(),
        2,
        "the list lost its shape: {out}"
    );
    assert!(out.contains("טוב") && out.contains("רע"), "{out}");
}

#[test]
fn every_child_the_prelude_marks_is_in_the_parent_table() {
    // The table `_kd_parents` is what decides the badge, and a child added to
    // the language without a row in it would be flagged everywhere — including
    // inside the parent it was written for. `_kd_parents.at(k, default: ())`
    // returns the empty list for an unknown kind, which contains nothing, which
    // is `false` for every parent there is.
    const PRELUDE: &str = include_str!("../typst/ksav.typ");
    let prelude = PRELUDE;
    let table = prelude
        .split_once("#let _kd_parents = (")
        .expect("the prelude has no _kd_parents")
        .1;
    let table = table.split_once("\n)").expect("unterminated _kd_parents").0;
    let mut marked: Vec<&str> = Vec::new();
    for line in prelude.lines() {
        let Some(rest) = line.strip_prefix("#let ") else {
            continue;
        };
        let Some((_, after)) = rest.split_once("= _kd(\"") else {
            continue;
        };
        let kind = after.split('"').next().expect("a quoted kind");
        marked.push(kind);
    }
    assert!(!marked.is_empty(), "no child commands found in the prelude");
    for kind in marked {
        assert!(
            table.contains(&format!("\"{kind}\":")),
            "{kind} is marked as a structural child and has no row in _kd_parents"
        );
    }
}

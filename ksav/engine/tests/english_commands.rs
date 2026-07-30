//! The English half of the command language, read off the laid-out page.
//!
//! "Every command has a collision-free English alias" was only half of what it
//! sounded like. The *parameters* were still Hebrew, so an English table read
//! `#mktable(עמודות: 3, פסים: true)` — which is not English and is not something
//! anyone would type. An English alias now renames its named arguments through
//! one table in the prelude, and still accepts the Hebrew ones, because the point
//! is to accept both rather than to swap one exclusion for another.
//!
//! These assertions render. A wrapper that silently dropped every named argument
//! would compile perfectly and lay out the default document.

use ksav_engine::probe::{self, TextRun};
use ksav_engine::DocConfig;

fn ltr() -> DocConfig {
    DocConfig {
        dir: "ltr".to_string(),
        ..Default::default()
    }
}

fn render(body: &str, cfg: &DocConfig) -> Vec<TextRun> {
    let doc = probe::layout(body, cfg).unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::text_runs(&doc)
}

fn text(runs: &[TextRun]) -> String {
    runs.iter().map(|r| r.text.as_str()).collect()
}

/// How many distinct columns the runs occupy — a table's shape, read off the
/// page rather than taken on trust.
fn distinct_columns(runs: &[TextRun]) -> usize {
    let mut xs: Vec<i64> = runs.iter().map(|r| (r.x * 10.0) as i64).collect();
    xs.sort_unstable();
    xs.dedup();
    xs.len()
}

#[test]
fn an_english_table_takes_english_parameter_names() {
    let body = "#mktable(columns: 3, striped: true,\n  \
                headcell[Posek], headcell[Ruling], headcell[Source],\n  \
                cell[Rambam], cell[Chayav], cell[Hil. Teshuva],\n)";
    let runs = render(body, &ltr());
    let page = text(&runs);
    for word in ["Posek", "Ruling", "Source", "Rambam", "Chayav"] {
        assert!(page.contains(word), "{word:?} is not on the page: {page}");
    }
    // Three columns, not one: a wrapper that dropped `columns:` would have laid
    // this out as a two-column default and every assertion above would still
    // have passed.
    let cells: Vec<TextRun> = runs
        .iter()
        .filter(|r| {
            r.text.contains("Posek") || r.text.contains("Ruling") || r.text.contains("Source")
        })
        .cloned()
        .collect();
    assert_eq!(
        distinct_columns(&cells),
        3,
        "the table is not three columns wide"
    );
}

#[test]
fn the_hebrew_parameter_names_still_work_on_an_english_alias() {
    // Accepting both is the point. Someone converting a Hebrew document command
    // by command must not hit a cliff halfway through.
    let runs = render(
        "#mktable(עמודות: 3, פסים: true, cell[Aleph], cell[Beis], cell[Gimmel])",
        &ltr(),
    );
    let cells: Vec<TextRun> = runs
        .iter()
        .filter(|r| {
            ["Aleph", "Beis", "Gimmel"]
                .iter()
                .any(|w| r.text.contains(w))
        })
        .cloned()
        .collect();
    assert_eq!(cells.len(), 3, "a cell is missing: {:?}", text(&runs));
    assert_eq!(
        distinct_columns(&cells),
        3,
        "Hebrew parameters stopped working"
    );
}

#[test]
fn an_english_contents_takes_an_english_title() {
    let page = text(&render(
        "= A Chapter\n\n#toc(title: [Table of Contents])\n",
        &ltr(),
    ));
    assert!(
        page.contains("Table of Contents"),
        "the title was dropped: {page}"
    );
}

#[test]
fn english_vertical_space_takes_an_amount() {
    let near = render("First#vspace(amount: 0em)\n\nSecond", &ltr());
    let far = render("First#vspace(amount: 8em)\n\nSecond", &ltr());
    let y = |runs: &[TextRun]| {
        runs.iter()
            .find(|r| r.text.contains("Second"))
            .map(|r| r.y)
            .expect("the second line is missing")
    };
    assert!(
        y(&far) > y(&near) + 50.0,
        "`amount:` did not move anything: {} vs {}",
        y(&far),
        y(&near)
    );
}

#[test]
fn the_two_kinds_of_column_keep_their_own_word() {
    // טורים (text columns) and עמודות (table columns) are both "columns" in
    // English, and one global table cannot map one word onto two names. The two
    // functions that need the other reading say so at their own alias, so both
    // spellings of the idea work and neither is renamed to something invented.
    let runs = render(
        "#banded_config(columns: (2, 1))\n\
         Text#band1[a note]\n\n#banded_notes(title: [Notes])",
        &ltr(),
    );
    let page = text(&runs);
    assert!(page.contains("Notes"), "the band title was dropped: {page}");
    assert!(
        page.contains("a note"),
        "the note itself is missing: {page}"
    );
}

#[test]
fn an_english_callout_takes_a_tint_and_an_accent() {
    let page = text(&render(
        "#callout(tint: rgb(\"#fef9c3\"), accent: rgb(\"#ca8a04\"))[Watch this]",
        &ltr(),
    ));
    assert!(
        page.contains("Watch this"),
        "the callout body is missing: {page}"
    );
}

#[test]
fn the_document_wrapper_survives_being_partially_applied() {
    // `#show: document.with(...)` is the one place an alias is used as a value
    // rather than called, and the English aliases are closures now. If `.with`
    // did not carry the renaming through, a writer's own page setup would be
    // silently ignored and the document would lay out at the defaults — which
    // compiles cleanly and looks like nothing happened.
    let big = render("#show: document.with(size: 24pt)\nSized", &ltr());
    let run = big
        .iter()
        .find(|r| r.text.contains("Sized"))
        .expect("no text");
    assert!(
        (run.size - 24.0).abs() < 0.5,
        "`size:` did not reach the document wrapper: {}pt",
        run.size
    );
}

#[test]
fn an_english_review_mark_takes_a_name() {
    let page = text(&render("#inserted(by: \"Shimon\")[a new clause]", &ltr()));
    assert!(page.contains("a new clause"), "{page}");
}

// ── the templates ───────────────────────────────────────────────────────────

#[test]
fn every_template_renders_in_its_own_language() {
    // A template is the first thing a writer sees. One that fails to compile is
    // not a bug they can work around; it is the product not starting.
    for t in ksav_engine::templates::TEMPLATES {
        let cfg = DocConfig {
            dir: if t.lang == "en" { "ltr" } else { "rtl" }.to_string(),
            ..Default::default()
        };
        let doc = probe::layout(t.body, &cfg)
            .unwrap_or_else(|d| panic!("template {:?} failed to compile: {d:?}", t.id));
        let runs = probe::text_runs(&doc);
        assert!(
            !runs.is_empty(),
            "template {:?} laid out an empty page",
            t.id
        );
    }
}

#[test]
fn the_english_templates_are_written_in_english() {
    // Not a translation check — a direction check. The whole reason `lang` is on
    // the template is that the editor has to switch the document over with it:
    // an English letter dropped into a right-to-left document sets flush right,
    // which is nobody's letter.
    for t in ksav_engine::templates::TEMPLATES
        .iter()
        .filter(|t| t.lang == "en")
    {
        let hebrew: String = t
            .body
            .chars()
            .filter(|c| ('\u{05D0}'..='\u{05EA}').contains(c))
            .collect();
        assert!(
            hebrew.is_empty(),
            "the English template {:?} still contains Hebrew: {hebrew:?}",
            t.id
        );
    }
    // …and the Hebrew ones are still Hebrew, which is the default and must not
    // have moved.
    let hebrew_templates = ksav_engine::templates::TEMPLATES
        .iter()
        .filter(|t| t.lang == "he")
        .count();
    assert!(hebrew_templates >= 8, "Hebrew templates went missing");
}

#[test]
fn an_english_template_lays_out_from_the_left() {
    let cfg = DocConfig {
        dir: "ltr".to_string(),
        ..Default::default()
    };
    let body = ksav_engine::templates::template_body("letter-en").expect("letter-en");
    let doc = probe::layout(body, &cfg).expect("compile");
    let runs = probe::text_runs(&doc);
    let (width, _) = probe::page_sizes(&doc)[0];
    // Body text, not the date line: that one is deliberately flush right, which
    // is where an English letter puts its date.
    let body_run = runs
        .iter()
        .find(|r| r.text.contains("honoured"))
        .expect("the letter's opening line is missing");
    assert!(
        body_run.x < width / 4.0,
        "body text starts at {} on a {}pt page — this is not left to right",
        body_run.x,
        width
    );
}

#[test]
fn every_english_alias_in_the_registry_exists_in_the_prelude() {
    // The command registry is what the palette, the toolbar and the completions
    // are built from, so a name in it that the prelude does not define is a
    // command the interface offers and the compiler refuses. Cheap to check, and
    // it is the kind of drift nothing else would catch until a user hit it.
    let prelude = include_str!("../typst/ksav.typ");
    let missing: Vec<&str> = ksav_engine::commands::COMMANDS
        .iter()
        .map(|c| c.en)
        .filter(|en| {
            !prelude.contains(&format!("#let {en} ")) && !prelude.contains(&format!("#let {en}("))
        })
        .collect();
    assert!(
        missing.is_empty(),
        "registry names with no definition: {missing:?}"
    );
}

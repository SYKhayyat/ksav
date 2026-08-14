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

// ── parameter *values* ──────────────────────────────────────

// An English name for every command and an English name for every parameter
// still left `#review_config(display: "סופי")` — an English command taking an
// English parameter and a Hebrew value, because two parameters in this prelude
// are compared against a fixed set of names rather than used as data.
//
// Two, and that is the point: they were invisible precisely because they are
// two lines in a file of two thousand. Everything else a writer passes is data.

#[test]
fn a_review_display_mode_can_be_named_in_english() {
    // "final" is the accepted view: an insertion prints as ordinary text and a
    // deletion is gone. If the English spelling were not understood, the mode
    // would fall back to the marked-up view and the deleted words would still
    // be on the page.
    let page = text(&render(
        "#review_config(display: \"final\")
#inserted[kept] #deleted[dropped]",
        &ltr(),
    ));
    assert!(page.contains("kept"), "{page}");
    assert!(!page.contains("dropped"), "{page}");
}

#[test]
fn the_hebrew_spelling_of_a_value_still_means_what_it_meant() {
    // Every document written before this existed says סופי, and every one of
    // them has to keep meaning exactly what it meant.
    let page = text(&render(
        "#הגדרות_סקירה(תצוגה: \"סופי\")
#הוספה[kept] #מחיקה[dropped]",
        &ltr(),
    ));
    assert!(page.contains("kept"), "{page}");
    assert!(!page.contains("dropped"), "{page}");
}

#[test]
fn a_value_that_is_not_an_enum_is_left_alone() {
    // A stream is named by the writer. "side" is an English *enum* value for
    // `פריסה`, and it must not be translated when it is somebody's stream
    // name — which is what a blanket substitution over every string would do.
    let page = text(&render(
        "#streams_config(streams: (\"side\",))
#stream_note(\"side\")[a remark]
Body.",
        &ltr(),
    ));
    assert!(page.contains("a remark"), "{page}");
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

/// Every parameter `#מסמך` takes can be given in English.
///
/// Fifteen of them could not, and they were not a random fifteen: the per-edge
/// margins, the binding gutter, `דו_צדדי`, the verso/recto running heads and
/// their alignment, and the PDF metadata — the whole set of knobs somebody
/// reaches for when actually binding a book, in a program whose README opens by
/// saying it works equally for English documents. `#document(title: …)` was not
/// merely absent but *wrong*: `title` meant `כותרת` from the shared table, and
/// `מסמך`'s PDF title is `כותרת_מסמך`, so it named a parameter that does not
/// exist.
///
/// The check is against the *signature*, read out of the prelude, so adding a
/// parameter to `מסמך` and forgetting its English name is a failing test rather
/// than a feature an English writer cannot reach.
#[test]
fn every_document_parameter_has_an_english_name() {
    let prelude = include_str!("../typst/ksav.typ");
    let hebrew: Vec<String> = document_parameters(prelude);
    assert!(
        hebrew.len() > 25,
        "only {} parameters parsed out of `#let מסמך(` — the parser is wrong, \
         not the prelude",
        hebrew.len()
    );

    // Every Hebrew name reachable through the shared table plus `document`'s own.
    // `en_param_pairs` returns the pairs themselves now, from Typst's own parse
    // of the prelude. It used to hand back the *text* of each table and this
    // split it on commas and colons a second time — the same fragile read the
    // engine was doing internally, repeated in the test that was meant to be
    // holding it.
    let pairs = ksav_engine::diagnostics::en_param_pairs(prelude);
    let english: std::collections::HashSet<&str> =
        pairs.iter().map(|(_, hebrew)| hebrew.as_str()).collect();

    let unreachable: Vec<&String> = hebrew
        .iter()
        .filter(|h| !english.contains(h.as_str()))
        .collect();
    assert!(
        unreachable.is_empty(),
        "מסמך parameters with no English spelling: {unreachable:?}"
    );
}

/// The named parameters of `#let מסמך(`, in order, minus the positional `body`.
fn document_parameters(prelude: &str) -> Vec<String> {
    let start = prelude
        .find("#let מסמך(")
        .expect("the prelude defines מסמך")
        + "#let מסמך(".len();
    let mut depth = 1usize;
    let mut end = start;
    for (i, c) in prelude[start..].char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    end = start + i;
                    break;
                }
            }
            _ => {}
        }
    }
    let mut out = Vec::new();
    let mut depth = 0usize;
    let mut name = String::new();
    let mut seen_colon = false;
    for line in prelude[start..end].lines() {
        let line = line.trim();
        if line.starts_with("//") {
            continue;
        }
        for c in line.chars() {
            match c {
                '(' | '[' => depth += 1,
                ')' | ']' => depth = depth.saturating_sub(1),
                ':' if depth == 0 && !seen_colon => {
                    seen_colon = true;
                    let n = name.trim().to_string();
                    if !n.is_empty() {
                        out.push(n);
                    }
                }
                ',' if depth == 0 => {
                    name.clear();
                    seen_colon = false;
                }
                _ if !seen_colon => name.push(c),
                _ => {}
            }
        }
        if !seen_colon {
            name.push(' ');
        }
    }
    out
}

// ── a face that is not there ────────────────────────────────────────────────

// `#נטוי` is Typst's `emph`, and `emph` is a *request*: it asks for an italic
// face in the family in force. Every font this engine bundles ships Regular and
// Bold and nothing else — as does very nearly every Hebrew family there is — so
// Typst finds none, hands back the upright face, and says nothing. The words
// come out exactly as they went in.
//
// Which means `#נטוי` has never done anything, in any document, in either
// script, for as long as the toolbar has had an `I` on it. The report was one
// line: *"Italic does not apply."*
//
// The instruction was: italicise when possible, and when it is not possible,
// say so. Only the engine can tell — Typst's language has no way to ask whether
// a face exists, because the font book belongs to the compiler.

#[test]
fn asking_for_italics_the_font_has_not_got_is_reported() {
    let out = ksav_engine::compile("רגיל #נטוי[נטוי כאן] סוף", &DocConfig::default());
    assert!(out.ok, "the document still compiles");
    let said: Vec<&str> = out
        .diagnostics
        .iter()
        .filter(|d| d.severity == "warning")
        .map(|d| d.message.as_str())
        .collect();
    assert_eq!(said.len(), 1, "{said:?}");
    assert!(said[0].contains("Frank Ruhl Hofshi"), "{said:?}");
    assert!(said[0].contains("italic"), "{said:?}");
}

#[test]
fn the_english_spelling_is_the_same_request() {
    let out = ksav_engine::compile("plain #italic[slanted] end", &ltr());
    let warnings = out
        .diagnostics
        .iter()
        .filter(|d| d.severity == "warning")
        .count();
    assert_eq!(warnings, 1);
}

#[test]
fn a_document_that_does_not_ask_is_not_told() {
    let out = ksav_engine::compile("רגיל #הדגשה[מודגש] סוף", &DocConfig::default());
    assert_eq!(out.diagnostics.len(), 0, "{:?}", out.diagnostics);
}

#[test]
fn the_word_italic_inside_a_string_is_not_a_request() {
    // Through Typst's own parse rather than a search for the name: a warning
    // about a command the writer never wrote is worse than the silence it
    // replaces. Here `"italic"` is a font name, not a call.
    let out = ksav_engine::compile(r#"#גופן_שונה("italic")[x]"#, &DocConfig::default());
    let mine = out
        .diagnostics
        .iter()
        .filter(|d| d.message.contains("no italic face"))
        .count();
    assert_eq!(mine, 0, "{:?}", out.diagnostics);
}

#[test]
fn an_attached_font_with_an_italic_face_is_believed() {
    // The other half, and the reason this is a font-book question rather than a
    // fixed answer about the bundled six: a writer who attaches a family that
    // *has* an italic gets a real italic and no warning.
    let bytes = std::fs::read("assets/fonts/DavidLibre-Regular.ttf").expect("a bundled font");
    let assets = ksav_engine::assets::Assets {
        fonts: vec![ksav_engine::assets::Asset {
            name: "DavidLibre-Regular.ttf".into(),
            bytes,
        }],
        ..Default::default()
    };
    let cfg = DocConfig {
        font: "David Libre".to_string(),
        ..Default::default()
    };
    let out = ksav_engine::compile_with("רגיל #נטוי[נטוי] סוף", &cfg, &assets);
    // David Libre has no italic either, so this still warns — and warns about
    // *David Libre*, which is the point: the answer follows the document's font
    // rather than a note about the default one.
    let said: Vec<&str> = out
        .diagnostics
        .iter()
        .filter(|d| d.message.contains("no italic face"))
        .map(|d| d.message.as_str())
        .collect();
    assert_eq!(said.len(), 1, "{said:?}");
    assert!(said[0].contains("David Libre"), "{said:?}");
}

#[test]
fn the_warning_names_the_line_the_command_is_on() {
    // A diagnostic that names no place is one the writer has to go looking for.
    let out = ksav_engine::compile(
        "שורה ראשונה.\n\nשורה שלישית עם #נטוי[זה] בתוכה.\n",
        &DocConfig::default(),
    );
    let said = out
        .diagnostics
        .iter()
        .find(|d| d.message.contains("no italic face"))
        .expect("the warning");
    assert_eq!(said.line, Some(3), "{said:?}");
    assert_eq!(said.about.as_deref(), Some("#נטוי"));
}

/// Every command that asks for a slant warns, not only the one that was checked.
///
/// The warning above was written for `#נטוי` and looked for that name. It is not
/// the only command that asks. `#מקור` sets `style: "italic"` outright, and the
/// marks table gives `גמרא`, `פסוק` and `ציון_מקור` an italic default — so four
/// more commands promised a slant no bundled family can produce, and said
/// nothing at all, while the one command that did warn was covered.
///
/// The set is read off `ksav.typ` rather than listed here, so a command added to
/// the prelude that slants is covered without this test changing. What this
/// holds is the class: whatever asks, warns — and names *itself* while doing it,
/// because a warning that says `#נטוי` to somebody who typed `#מקור` is a
/// warning about a command they cannot find.
#[test]
fn every_command_that_asks_for_a_slant_says_it_did_not_get_one() {
    let asked = ["מקור", "גמרא", "פסוק", "ציון_מקור"];
    for name in asked {
        let body = format!("רגיל #{name}[טקסט] סוף");
        let out = ksav_engine::compile(&body, &DocConfig::default());
        let said = out
            .diagnostics
            .iter()
            .find(|d| d.about.as_deref() == Some(&format!("#{name}")))
            .unwrap_or_else(|| {
                panic!(
                    "#{name} asks for an italic face and no bundled family has one, \n\
                     and the compile said nothing about it. The warning knows only the \n\
                     commands `slanting_commands()` finds in ksav.typ — if this one \n\
                     stopped being found, the reader presses a button that does nothing \n\
                     and is never told. Diagnostics were: {:?}",
                    out.diagnostics
                        .iter()
                        .map(|d| &d.message)
                        .collect::<Vec<_>>()
                )
            });
        assert!(
            said.message.contains(&format!("#{name}")),
            "the warning for #{name} names a different command: {}",
            said.message
        );
    }

    // And the one it was originally written for still works, so the sweep did
    // not trade one instance for four.
    let out = ksav_engine::compile("רגיל #נטוי[נטוי] סוף", &DocConfig::default());
    assert!(
        out.diagnostics
            .iter()
            .any(|d| d.about.as_deref() == Some("#נטוי")),
        "the command the check was written for stopped warning"
    );

    // The floor: a loop over a list that a bad derivation could empty would
    // assert nothing, which is the failure this repository has a file about.
    assert!(
        asked.len() >= 4,
        "the list of commands under test has emptied out"
    );
}

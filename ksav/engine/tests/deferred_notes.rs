//! Rendered-output tests for deferred note bodies (#הערה_בשם / #גוף_הערה).
//!
//! The claim this mechanism makes is unusually strong and unusually testable:
//! *where the prose sits in the source has no effect whatsoever on the page*.
//! So the central test here is not "does it render something plausible" but an
//! equivalence — lay out the inline form and the deferred form of the SAME
//! document and assert every text run landed on the same page, at the same
//! coordinates, at the same size, with the same text. That is checked once per
//! note layout, because "works for footnotes" is not the claim; "works for all
//! eleven layouts" is.
//!
//! Nothing here asserts `ok()`. Every apparatus bug this project has had
//! compiled cleanly and was wrong on the page.

mod common;
use common::{render, render_with, text};

use ksav_engine::probe::{self, Line, TextRun};
use ksav_engine::DocConfig;

fn visual_lines(runs: &[TextRun]) -> Vec<Line> {
    probe::lines(runs, 1.0)
}

fn line_with<'a>(lines: &'a [Line], needle: &str) -> &'a Line {
    let hits: Vec<&Line> = lines.iter().filter(|l| l.contains(needle)).collect();
    assert_eq!(
        hits.len(),
        1,
        "expected exactly one line containing {needle:?}, found {}: {:?}",
        hits.len(),
        hits.iter().map(|l| l.text()).collect::<Vec<_>>()
    );
    hits[0]
}

/// Every text run in the document as a comparable tuple.
fn shape(runs: &[TextRun]) -> Vec<(usize, i64, i64, i64, String)> {
    runs.iter()
        .map(|r| {
            (
                r.page,
                (r.x * 20.0).round() as i64,
                (r.y * 20.0).round() as i64,
                (r.size * 20.0).round() as i64,
                r.text.clone(),
            )
        })
        .collect()
}

/// Assert two sources lay out identically, run for run.
fn assert_same_page(label: &str, inline: &str, deferred: &str) {
    let a = shape(&render(inline));
    let b = shape(&render(deferred));
    assert!(!a.is_empty(), "{label}: the inline form rendered nothing");
    if a != b {
        let first = a
            .iter()
            .zip(b.iter())
            .position(|(x, y)| x != y)
            .unwrap_or(a.len().min(b.len()));
        panic!(
            "{label}: deferred bodies changed the page.\n\
             inline has {} runs, deferred {}; first difference at #{first}\n\
             inline:   {:?}\n\
             deferred: {:?}",
            a.len(),
            b.len(),
            a.get(first),
            b.get(first),
        );
    }
}

// ── the equivalence, once per layout ─────────────────────────────────────────
//
// Each case is the same document twice: bodies inline, then bodies deferred to
// the end. `{}` in the deferred form is where the definitions go, so the
// scaffolding line each layout needs (a dump call, a wrapper) stays put.

/// (label, inline source, deferred source)
fn layout_cases() -> Vec<(&'static str, String, String)> {
    let defs = "\n#גוף_הערה(\"א\")[ביאור ראשון]\n#גוף_הערה(\"ב\")[ביאור שני]\n";
    let mut v: Vec<(&'static str, String, String)> = Vec::new();

    // `tail` is the scaffolding the layout needs (a dump call); it belongs to
    // both forms, since it is not what is under test.
    let case = |label: &'static str, inline: String, refs: String, tail: &str| {
        (
            label,
            format!("{inline}{tail}"),
            format!("{refs}{tail}{defs}"),
        )
    };

    // 1. native footnote
    v.push(case(
        "footnote",
        "ראש#הערה[ביאור ראשון] אמצע#הערה[ביאור שני] סוף.".into(),
        "ראש#הערה_בשם(\"א\") אמצע#הערה_בשם(\"ב\") סוף.".into(),
        "",
    ));
    // 2. note on a note, same apparatus
    v.push(case(
        "subnote",
        "ראש#הערה_על_הערה[ביאור ראשון] אמצע#הערה_על_הערה[ביאור שני] סוף.".into(),
        "ראש#הערה_בשם(\"א\", סוג: הערה_על_הערה) אמצע#הערה_בשם(\"ב\", סוג: הערה_על_הערה) סוף."
            .into(),
        "",
    ));
    // 3. layered (tiered) footnotes — an extra positional argument ahead of the body
    v.push(case(
        "tiered",
        "ראש#הערה_א[ביאור ראשון] אמצע#הערה_בדרגה(2)[ביאור שני] סוף.".into(),
        "ראש#הערה_בשם(\"א\", סוג: הערה_א) אמצע#הערה_בשם(\"ב\", סוג: הערה_בדרגה, 2) סוף.".into(),
        "",
    ));
    // 4. endnotes (a named argument through the wrapper)
    v.push(case(
        "endnote",
        "ראש#הערתסיום[ביאור ראשון] אמצע#הערתסיום[ביאור שני] סוף.".into(),
        "ראש#הערה_בשם(\"א\", סוג: הערתסיום) אמצע#הערה_בשם(\"ב\", סוג: הערתסיום) סוף.".into(),
        "\n#הערות_בסוף(כותרת: [הערות])\n",
    ));
    // 5. endnote streams
    v.push(case(
        "endnote-streams",
        "ראש#הערתסיום(זרם: \"מקורות\")[ביאור ראשון] אמצע#הערתסיום(זרם: \"מקורות\")[ביאור שני]."
            .into(),
        "ראש#הערה_בשם(\"א\", סוג: הערתסיום, זרם: \"מקורות\") אמצע#הערה_בשם(\"ב\", סוג: הערתסיום, זרם: \"מקורות\")."
            .into(),
        "\n#הערות_בסוף(זרם: \"מקורות\", כותרת: [מקורות])\n",
    ));
    // 6. regrouped section bands
    v.push(case(
        "section-bands",
        "ראש#מדור_א[ביאור ראשון] אמצע#מדור_בדרגה(2)[ביאור שני] סוף.".into(),
        "ראש#הערה_בשם(\"א\", סוג: מדור_א) אמצע#הערה_בשם(\"ב\", סוג: מדור_בדרגה, 2) סוף.".into(),
        "\n#הערות_מדורגות(כותרת: [הערות])\n",
    ));
    // 7. per-page bands (these live in the page footer and need the foot reserve)
    v.push(case(
        "page-bands",
        "ראש#מדף_א[ביאור ראשון] אמצע#מדף_בדרגה(2)[ביאור שני] סוף.".into(),
        "ראש#הערה_בשם(\"א\", סוג: מדף_א) אמצע#הערה_בשם(\"ב\", סוג: מדף_בדרגה, 2) סוף.".into(),
        "",
    ));
    // 8. parallel per-page streams
    v.push(case(
        "streams",
        "ראש#הערת_תוכן[ביאור ראשון] אמצע#הערה_זרם(\"מקורות\")[ביאור שני] סוף.".into(),
        "ראש#הערה_בשם(\"א\", סוג: הערת_תוכן) אמצע#הערה_בשם(\"ב\", סוג: הערה_זרם, \"מקורות\") סוף."
            .into(),
        "",
    ));
    // 9. side-column notes
    v.push((
        "sidenotes",
        "#עם_הערות_צד[ראש#הערת_גיליון[ביאור ראשון] אמצע#הערת_גיליון[ביאור שני] סוף.]".into(),
        format!(
            "#עם_הערות_צד[ראש#הערה_בשם(\"א\", סוג: הערת_גיליון) אמצע#הערה_בשם(\"ב\", סוג: הערת_גיליון) סוף.]{defs}"
        ),
    ));
    // 10. notes down both margins
    v.push((
        "two-sided",
        "#עם_הערות_דו_צד[ראש#הערת_ימין[ביאור ראשון] אמצע#הערת_שמאל[ביאור שני] סוף.]".into(),
        format!(
            "#עם_הערות_דו_צד[ראש#הערה_בשם(\"א\", סוג: הערת_ימין) אמצע#הערה_בשם(\"ב\", סוג: הערת_שמאל) סוף.]{defs}"
        ),
    ));
    // 11. the mekoros note
    v.push(case(
        "sourcenote",
        "ראש#מראה_מקום[ביאור ראשון] אמצע#מראה_מקום[ביאור שני] סוף.".into(),
        "ראש#הערה_בשם(\"א\", סוג: מראה_מקום) אמצע#הערה_בשם(\"ב\", סוג: מראה_מקום) סוף.".into(),
        "",
    ));
    v
}

#[test]
fn every_note_layout_lays_out_identically_with_deferred_bodies() {
    for (label, inline, deferred) in layout_cases() {
        assert_same_page(label, &inline, &deferred);
    }
}

// ── the definitions themselves are inert ─────────────────────────────────────

#[test]
fn definitions_print_nothing_and_add_no_page() {
    let bare = render("שלום עולם.");
    let with_defs = render(
        "שלום עולם.\n\
         #גוף_הערה(\"א\")[טקסט שאסור שיודפס]\n\
         #גוף_הערה(\"ב\")[גם זה]\n\
         #גוף_הערה(\"ג\")[וגם זה]\n",
    );
    assert_eq!(
        shape(&bare),
        shape(&with_defs),
        "an unreferenced definition changed the page"
    );
}

#[test]
fn a_long_run_of_definitions_does_not_push_a_blank_page() {
    // Thirty definitions is an ordinary sefer, not a stress test. Each is a line
    // of markup in the main flow, so if they carried any height at all they would
    // eventually spill onto a page of their own — a blank one, since they print
    // nothing.
    let mut src = String::from("שלום עולם.\n#גופי_הערות[\n");
    for i in 0..30 {
        src.push_str(&format!(
            "#גוף_הערה(\"n{i}\")[גוף הערה מספר {i} עם עוד קצת טקסט]\n"
        ));
    }
    src.push_str("]\n");
    let doc = probe::layout(&src, &DocConfig::default()).expect("compile failed");
    assert_eq!(
        probe::page_sizes(&doc).len(),
        1,
        "the definitions region occupies space on the page"
    );
    let runs = probe::text_runs(&doc);
    assert!(
        !text(&runs).contains("גוף הערה מספר"),
        "an undefined-but-unreferenced body was printed"
    );
}

// ── the reference is what decides placement and order ────────────────────────

#[test]
fn markers_number_by_reference_order_not_definition_order() {
    // The definitions are written back-to-front on purpose: the reader's numbers
    // follow the text, and nothing about the order of the prose at the end may
    // leak into them.
    let runs = render(
        "ראש#הערה_בשם(\"שני\") אמצע#הערה_בשם(\"ראשון\") סוף.\n\
         #גוף_הערה(\"ראשון\")[גוף של אמצע]\n\
         #גוף_הערה(\"שני\")[גוף של ראש]\n",
    );
    let i = |needle: &str| {
        runs.iter()
            .position(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle:?} not rendered"))
    };
    // Footnote entries lay out as «number» «body»; the run before a body is its number.
    assert_eq!(runs[i("גוף של ראש") - 1].text.trim(), "1");
    assert_eq!(runs[i("גוף של אמצע") - 1].text.trim(), "2");
}

#[test]
fn a_definition_may_precede_its_reference() {
    // Typst introspection reads the finished document, so the definitions block
    // is not required to come last — a writer who keeps notes per chapter, above
    // the text, gets the same page.
    assert_same_page(
        "definition first",
        "ראש#הערה[הביאור] סוף.",
        "#גוף_הערה(\"א\")[הביאור]\nראש#הערה_בשם(\"א\") סוף.",
    );
}

#[test]
fn definitions_may_sit_far_from_the_reference() {
    // A body defined at the end of a long document still reaches a marker on
    // page 1 — the query is document-wide, not page-local.
    let filler = "מילה ".repeat(400);
    let runs = render(&format!(
        "ראש#הערה_בשם(\"א\") {filler}\n#גוף_הערה(\"א\")[הביאור הרחוק]\n"
    ));
    let note = runs
        .iter()
        .find(|r| r.text.contains("הביאור הרחוק"))
        .expect("the note never rendered");
    assert_eq!(note.page, 1, "the note left its marker's page");
}

// ── nesting ──────────────────────────────────────────────────────────────────

#[test]
fn a_deferred_body_may_contain_an_ordinary_note() {
    // The body is stored in metadata, which is never laid out — so the nested
    // note must fire exactly once, where the reference puts it, and not a second
    // time at the definition site.
    assert_same_page(
        "note inside a deferred body",
        "ראש#הערה[הפירוש#הערה[הערה על הפירוש]] סוף.",
        "ראש#הערה_בשם(\"א\") סוף.\n#גוף_הערה(\"א\")[הפירוש#הערה[הערה על הפירוש]]",
    );
}

#[test]
fn a_deferred_body_may_reference_another_deferred_body() {
    // Deferred notes-on-notes: both layers' prose lives at the end of the file.
    assert_same_page(
        "deferred inside deferred",
        "ראש#הערה[הפירוש#הערה[הערה על הפירוש]] סוף.",
        "ראש#הערה_בשם(\"א\") סוף.\n\
         #גוף_הערה(\"א\")[הפירוש#הערה_בשם(\"ב\")]\n\
         #גוף_הערה(\"ב\")[הערה על הפירוש]",
    );
}

#[test]
fn a_deferred_body_carries_rich_content() {
    // Whatever survives brackets inline must survive the round trip through
    // metadata: emphasis, a list, a table.
    let runs = render(
        "ראש#הערה_בשם(\"א\") סוף.\n\
         #גוף_הערה(\"א\")[#הדגשה[מודגש] ואז #רשימה(פריט[אלף], פריט[בית]) וטבלה #טבלה(עמודות: 2, תא[גימל], תא[דלת])]",
    );
    let text = text(&runs);
    for needle in ["מודגש", "אלף", "בית", "גימל", "דלת"] {
        assert!(
            text.contains(needle),
            "{needle:?} was lost in the deferred body"
        );
    }
}

#[test]
fn the_same_body_may_be_referenced_twice() {
    // Two markers, one definition — a note the writer wants repeated. Both
    // markers get their own entry rather than one silently swallowing the other.
    let runs =
        render("ראש#הערה_בשם(\"א\") אמצע#הערה_בשם(\"א\") סוף.\n#גוף_הערה(\"א\")[הביאור החוזר]");
    let hits = runs
        .iter()
        .filter(|r| r.text.contains("הביאור החוזר"))
        .count();
    assert_eq!(hits, 2, "a body referenced twice rendered {hits} times");
}

// ── the failure modes ────────────────────────────────────────────────────────

#[test]
fn a_dangling_reference_is_loud_and_does_not_break_the_document() {
    // An invisible failure here is the worst one available: a note the writer
    // believes they wrote and the reader never sees.
    let runs =
        render("ראש#הערה_בשם(\"חסר\") אמצע#הערה_בשם(\"קיים\") סוף.\n#גוף_הערה(\"קיים\")[הביאור]");
    let text = text(&runs);
    assert!(
        text.contains("סוף"),
        "the document stopped at the bad reference"
    );
    assert!(text.contains("הביאור"), "the good note was lost too");
    assert!(
        text.contains("חסר"),
        "the missing name is not shown anywhere: {text:?}"
    );
    let marker = runs
        .iter()
        .find(|r| r.text.contains('?'))
        .expect("no question mark marking the dangling reference");
    assert_eq!(marker.page, 1);
}

#[test]
fn a_duplicate_definition_takes_the_first_and_renders_once() {
    let runs = render(
        "ראש#הערה_בשם(\"א\") סוף.\n\
         #גוף_הערה(\"א\")[הראשון]\n\
         #גוף_הערה(\"א\")[השני]",
    );
    let text = text(&runs);
    assert!(text.contains("הראשון"), "the first definition did not win");
    assert!(
        !text.contains("השני"),
        "the shadowed definition rendered too"
    );
}

// ── the name argument ────────────────────────────────────────────────────────

#[test]
fn a_name_may_be_written_in_brackets_like_every_other_argument() {
    // Every command in Ksav's core idea takes brackets; a writer who types
    // #הערה_בשם[א] rather than #הערה_בשם("א") must not meet "expected string,
    // found content".
    assert_same_page(
        "bracketed name",
        "ראש#הערה_בשם(\"א\") סוף.\n#גוף_הערה(\"א\")[הביאור]",
        "ראש#הערה_בשם[א] סוף.\n#גוף_הערה[א][הביאור]",
    );
}

#[test]
fn hebrew_and_latin_and_numeric_names_all_work() {
    for name in ["א", "note-1", "1", "ראשי_פרקים"] {
        let runs = render(&format!(
            "ראש#הערה_בשם(\"{name}\") סוף.\n#גוף_הערה(\"{name}\")[הביאור]"
        ));
        assert!(
            text(&runs).contains("הביאור"),
            "the name {name:?} did not resolve"
        );
    }
}

// ── English ──────────────────────────────────────────────────────────────────

#[test]
fn the_english_aliases_and_parameter_names_work() {
    let cfg = DocConfig {
        dir: "ltr".to_string(),
        ..Default::default()
    };
    let runs = render_with(
        "Start#note_named(\"a\") middle#note_named(\"b\", kind: endnote) end.\n\
         #endnotes(title: [Notes])\n\
         #note_body(\"a\")[the first gloss]\n\
         #note_body(\"b\")[the second gloss]\n",
        &cfg,
    );
    let text = text(&runs);
    for needle in ["the first gloss", "the second gloss", "Notes"] {
        assert!(
            text.contains(needle),
            "{needle:?} missing from the English page"
        );
    }
}

// ── the page-foot reserve ────────────────────────────────────────────────────

#[test]
fn a_deferred_page_apparatus_still_reserves_the_page_foot() {
    // The reserve is decided by reading the source. The deferred form names its
    // layout as a value (`סוג: מדף_בדרגה`) with no bracket after it, so the
    // detector had to learn to see that — otherwise the bands grow straight off
    // the bottom of the sheet, which compiles perfectly and is unreadable.
    for src in [
        "#הערה_בשם(\"א\", סוג: מדף_א)",
        "#הערה_בשם(\"א\", סוג: מדף_בדרגה, 2)",
        "#הערה_בשם(\"א\", סוג: הערה_זרם, \"מקורות\")",
        "#הערה_בשם(\"א\", סוג: הערת_מקור)",
        "#note_named(\"a\", kind: pageband1)",
        "#note_named(\"a\", kind: stream_note, \"src\")",
    ] {
        assert_eq!(
            ksav_engine::auto_notes_region_cm(src),
            3.0,
            "no page-foot reserve for {src:?}"
        );
    }
    // …and a deferred note that lands in the ordinary apparatus must not lose
    // page height to a reserve it never uses.
    for src in [
        "#הערה_בשם(\"א\")",
        "#הערה_בשם(\"א\", סוג: הערתסיום)",
        "#הערה_בשם(\"א\", סוג: מדור_א)",
    ] {
        assert_eq!(
            ksav_engine::auto_notes_region_cm(src),
            0.0,
            "an unnecessary page-foot reserve for {src:?}"
        );
    }
}

#[test]
fn deferred_page_bands_stay_on_the_paper_across_pages() {
    let filler = "מילה ".repeat(380);
    let src = format!(
        "ראש#הערה_בשם(\"א\", סוג: מדף_א) {filler} אמצע#הערה_בשם(\"ב\", סוג: מדף_בדרגה, 2) {filler} סוף.\n\
         #גוף_הערה(\"א\")[ביאור ראשון]\n\
         #גוף_הערה(\"ב\")[ביאור שני]\n"
    );
    let doc = probe::layout(&src, &DocConfig::default()).expect("compile failed");
    let sizes = probe::page_sizes(&doc);
    let runs = probe::text_runs(&doc);
    assert!(sizes.len() >= 2, "expected a multi-page document");
    for r in &runs {
        let (_, h) = sizes[r.page - 1];
        assert!(
            r.y < h,
            "text {:?} laid out past the bottom of page {} (y={:.1}, height {:.1})",
            r.text,
            r.page,
            r.y,
            h
        );
    }
}

// ── mixing deferred and inline in one document ───────────────────────────────

#[test]
fn deferred_and_inline_notes_interleave_in_one_sequence() {
    // A half-converted document is the normal state of a real one. The numbering
    // must run straight through both forms in reading order.
    let runs = render(
        "א#הערה[ראשונה] ב#הערה_בשם(\"x\") ג#הערה[שלישית] ד#הערה_בשם(\"y\") ה.\n\
         #גוף_הערה(\"x\")[שנייה]\n#גוף_הערה(\"y\")[רביעית]\n",
    );
    let i = |needle: &str| {
        runs.iter()
            .position(|r| r.text.contains(needle))
            .unwrap_or_else(|| panic!("{needle:?} not rendered"))
    };
    for (n, body) in [
        ("1", "ראשונה"),
        ("2", "שנייה"),
        ("3", "שלישית"),
        ("4", "רביעית"),
    ] {
        assert_eq!(
            runs[i(body) - 1].text.trim(),
            n,
            "{body:?} is not entry {n}"
        );
    }
}

#[test]
fn section_scoped_endnotes_still_scope_when_the_bodies_are_deferred() {
    // Per-chapter endnotes number from 1 again in each chapter, and a chapter's
    // dump shows only its own notes — none of which may be disturbed by all the
    // bodies living together at the end of the file.
    let runs = render(
        "= פרק א\n\
         אלף#הערה_בשם(\"a1\", סוג: הערתסיום) בית#הערה_בשם(\"a2\", סוג: הערתסיום).\n\
         #הערות_בסוף(כותרת: [הערות פרק א])\n\n\
         = פרק ב\n\
         גימל#הערה_בשם(\"b1\", סוג: הערתסיום).\n\
         #הערות_בסוף(כותרת: [הערות פרק ב])\n\n\
         #גוף_הערה(\"a1\")[על אלף]\n\
         #גוף_הערה(\"a2\")[על בית]\n\
         #גוף_הערה(\"b1\")[על גימל]\n",
    );
    let lines = visual_lines(&runs);
    let y = |needle: &str| line_with(&lines, needle).y;
    let head_a = y("הערות פרק א");
    let head_b = y("הערות פרק ב");
    assert!(head_a < head_b);
    for note in ["על אלף", "על בית"] {
        let ny = y(note);
        assert!(
            ny > head_a && ny < head_b,
            "{note:?} is not inside chapter א"
        );
    }
    assert!(
        y("על גימל") > head_b,
        "chapter ב's note is not in chapter ב"
    );
}

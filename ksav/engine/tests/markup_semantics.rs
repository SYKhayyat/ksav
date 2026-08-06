//! The four facts the editor's scanner is built on.
//!
//! `app/src/spans.ts` is the one place in the front end that decides what a
//! character means in Ksav source — where a call ends, which brackets are
//! structure, which runs are prose. It replaced fourteen private scanners that
//! disagreed about exactly four questions, and it can only replace them because
//! Typst's own answer to those four is knowable and fixed.
//!
//! So they are asserted here, against the real compiler, rather than left as a
//! premise in a comment. This is the same shape as `structure.rs` and
//! `insertion.rs`: the editor makes a claim about what compiles, and the
//! compiler is the only authority on whether it is right.
//!
//! If one of these ever fails, the editor's scanner is wrong about the language
//! it is scanning, and the failure will otherwise show up as a writer's list
//! quietly losing its ribbon — which is the bug that started this.

use ksav_engine::{probe, DocConfig};

/// The text that actually landed on the page, all runs joined.
fn rendered(source: &str) -> String {
    let doc = probe::layout(source, &DocConfig::default())
        .unwrap_or_else(|d| panic!("expected {source:?} to compile, got {d:?}"));
    probe::text_runs(&doc)
        .iter()
        .map(|r| r.text.as_str())
        .collect::<Vec<_>>()
        .join("")
}

/// 1. In **content** mode a `"` is an ordinary character.
///
/// This is the gershayim rule, and it is Typst's rather than a concession Ksav
/// makes to Hebrew. `lists.ts` used to read `"` as a string opener inside an
/// argument list's `[…]` bodies, so `#רשימה(פריט[דברי רש"י],)` scanned to end of
/// document, `listAt` returned null, and every list operation in the ribbon
/// switched itself off — on the most common word in a sefer.
#[test]
fn a_gershayim_in_a_body_is_an_ordinary_character() {
    let out = rendered("#רשימה(\n  פריט[דברי רש\"י],\n  פריט[שני],\n)\n");
    // Typst curls the quote, so compare on the letters around it.
    assert!(
        out.contains("דברי רש"),
        "the first item is missing: {out:?}"
    );
    assert!(out.contains("שני"), "the second item is missing: {out:?}");
}

#[test]
fn a_gershayim_in_a_table_cell_is_too() {
    let out = rendered("#טבלה(עמודות: 2,\n  תא[רש\"י אמר], תא[ב],\n)\n");
    assert!(out.contains("אמר"), "the cell is missing: {out:?}");
    assert!(out.contains("ב"), "the second cell is missing: {out:?}");
}

/// 2. In **code** mode a `"` opens a string, and brackets inside it are inert.
///
/// The other half, and the half `ksav-lang.ts` gave up: its `matchGroup`
/// conceded in its own comment that it could not read `#הערה_זרם("a)b")`. A
/// context-tracked scanner gets both, which is why the two rules did not have to
/// be traded off against each other after all.
#[test]
fn a_bracket_inside_a_code_string_is_not_a_delimiter() {
    let out = rendered("טקסט#הערה_זרם(\"a)b\")[גוף ההערה]\n");
    assert!(out.contains("טקסט"), "the body text is missing: {out:?}");
    assert!(out.contains("גוף ההערה"), "the note is missing: {out:?}");
}

#[test]
fn a_square_bracket_inside_a_code_string_is_not_a_delimiter() {
    let out = rendered("#הערה_זרם(\"x[y\")[גוף]\n");
    assert!(out.contains("גוף"), "the note is missing: {out:?}");
}

/// 3. In content mode a backslash escapes the character after it.
///
/// Two of the fourteen scanners honoured this and twelve did not, so the same
/// document had two different shapes. `brackets.ts` was one of the twelve, which
/// meant it reported an escaped `]` as a stray closer and its one-click heal
/// then deleted the document's real one.
#[test]
fn a_backslash_escapes_a_closing_bracket() {
    let out = rendered("#הדגשה[סוגר \\] בתוך גוף]\n");
    assert!(
        out.contains("סוגר ] בתוך גוף"),
        "the escape did not survive: {out:?}"
    );
}

/// 4. `//` is a line comment in content mode as well as in code.
///
/// The one that is easy to get backwards, because a `//` in the middle of a
/// paragraph looks like prose. It is not: it runs to end of line and takes the
/// closing bracket with it, so a scanner that treated it as text would call this
/// document balanced while the compiler rejects it.
#[test]
fn a_line_comment_in_content_mode_eats_the_rest_of_the_line() {
    let source = "#הדגשה[אלף // בית]\n\nשורה שניה\n";
    assert!(
        probe::layout(source, &DocConfig::default()).is_err(),
        "`//` inside a body no longer swallows the closing bracket — \
         app/src/spans.ts treats it as a comment in content mode and would now \
         be wrong about where this call ends",
    );
}

/// The same `//`, harmless once the bracket is closed before it.
#[test]
fn a_line_comment_after_a_closed_call_is_only_a_comment() {
    let out = rendered("#הדגשה[אלף] // בית\n");
    assert!(out.contains("אלף"), "the body is missing: {out:?}");
    assert!(
        !out.contains("בית"),
        "the comment reached the page: {out:?}"
    );
}

/// `#שער` is not a heading, which is why the outline no longer says it is.
///
/// It is `align(center, text(size: 2em, weight: "bold", …))` with no `heading()`
/// anywhere in it, so it does not number and does not enter `#תוכן` — and the
/// editor's outline pane listed it at level 1 for as long as there was an
/// outline pane. The two surfaces that show a document's structure disagreed
/// about what the structure was, and the compiled page is the one that is right.
#[test]
fn a_title_does_not_enter_the_table_of_contents() {
    let out = rendered("#תוכן()\n\n#שער[הכותרת הגדולה]\n\n#כותרת1[פרק ראשון]\n\nטקסט\n");
    assert!(out.contains("תוכן העניינים"), "no contents block: {out:?}");
    assert!(out.contains("פרק ראשון"), "the heading is missing: {out:?}");
    // The heading's words appear twice — once in the contents, once in the body.
    assert_eq!(
        out.matches("פרק ראשון").count(),
        2,
        "the heading should appear in both the contents and the body: {out:?}",
    );
    // The title's words appear once: on the page, and not in the contents.
    assert_eq!(
        out.matches("הכותרת הגדולה").count(),
        1,
        "#שער must not enter the table of contents: {out:?}",
    );
}

/// `#סימן` *is* a heading, and its level is written into the definition.
///
/// Both halves matter to the editor: it belongs in the outline (which is why a
/// sefer of simanim folds), and there is no spelling of it at level 2 (which is
/// why promote and demote refuse instead of rewriting it into a `#כותרת2` and
/// dropping the siman number).
#[test]
fn a_siman_is_a_level_one_heading() {
    let out = rendered("#תוכן()\n\n#סימן(\"א\", [דיני תפילה])\n\nטקסט\n");
    assert_eq!(
        out.matches("דיני תפילה").count(),
        2,
        "a siman should appear in both the contents and the body: {out:?}",
    );
}

/// And the form the audit used to report that bug does not compile at all.
#[test]
fn a_siman_needs_both_of_its_arguments() {
    assert!(
        probe::layout("#סימן[א]\n", &DocConfig::default()).is_err(),
        "`#סימן` takes (מספר, כותרת); a one-argument form now compiling means \
         the editor's model of it is out of date",
    );
}

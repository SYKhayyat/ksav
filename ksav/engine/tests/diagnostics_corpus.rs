//! Every way a kuntres breaks, compiled for real, read as a writer would read it.
//!
//! `diagnostics.rs` states the rule in its own header: *"Every user-visible
//! failure names (a) what failed in the writer's words, (b) the line or command
//! they can act on, and (c) exactly one place to look"*, and *"Typst's own words
//! are kept, on `raw`, for the bug report. They are never the message."*
//!
//! That rule was checked by `every_rephrasing_is_bilingual`, which walks a
//! hand-written list of six raw strings — every one of them a string the
//! rephraser already handles. It cannot go red for a message the rephraser does
//! **not** handle, because such a message is not in the list. It is
//! `registry.rs`'s `ONLY_AT_TOP` in the module whose entire job is the sentence
//! a writer reads, and it was green while six families reached the writer in
//! Typst's raw English:
//!
//! | raw message | how a Hebrew writer gets it |
//! |---|---|
//! | `unclosed string` | **a gershayim.** `"` is the key you press for רש״י, and inside `(…)` Typst reads it as opening a string |
//! | `missing argument: כותרת` | `#סימן[א]` — one bracket where the command takes two |
//! | `missing argument: body` | the same, on the 89 commands whose positional parameter is still named in English |
//! | ``label `<x>` does not exist`` | a `@ref` to a marker that was never written, or was spelled differently |
//! | `array index out of bounds` | `.at()` past the end |
//! | `cannot add function and integer` | arithmetic on a command |
//!
//! Found by writing a kuntres in the application, not by reading this file.
//!
//! So the fence is the failures themselves. Each case below is a document that
//! really does not compile, run through the real engine, and the assertion is
//! the one the header makes: **what the writer reads is bilingual, and is not
//! Typst's own sentence.** Adding a case the rephraser has no family for is a
//! red test, which is the pressure that was missing.

use ksav_engine::{compile, Diagnostic, DocConfig};

/// A document a writer could plausibly produce, and what is wrong with it.
///
/// Not a sample of Typst's error space — a sample of *this product's*. Each is
/// something somebody typing a sefer does: a gershayim in the wrong bracket, a
/// siman with one argument, a mareh makom pointing at a siman they renamed.
const BROKEN: &[(&str, &str)] = &[
    (
        "a gershayim inside an argument list",
        "#רשימה(\n  פריט[דברי רש\"י],\n  \"והרא\"ש\",\n)",
    ),
    (
        "a gershayim that opens a string and never closes it",
        "#רשימה(פריט[א], \"ב)",
    ),
    ("a siman with only its number", "#סימן[א׳]"),
    ("a seif with only its letter", "#סעיף[א]"),
    ("a heading with nothing in it", "#כותרת_בדרגה(2)"),
    (
        "a reference to a marker nobody wrote",
        "#כותרת1[סימן א]\n\nוכמו שנתבאר ב@סימן_ג לעיל.",
    ),
    ("a misspelled command", "#הדגשא[טעות]"),
    ("a command that does not exist at all", "#אין_פקודה_כזאת[א]"),
    (
        "a table column width given as words",
        "#טבלה(עמודות: \"שתיים\")[א][ב]",
    ),
    (
        "a font size given as text",
        "#הגדרות_עמוד(גודל: \"גדול\")\nשלום",
    ),
    (
        "a font nobody has",
        "#הגדרות_עמוד(גופן: \"NoSuchFontAnywhere\")\nשלום",
    ),
    ("an image that is not attached", "#תמונה(\"nope.png\")"),
    ("an unclosed bracket", "#הדגשה[שלום"),
    ("an unclosed paren", "#רשימה(פריט[א],"),
    ("a stray closing bracket", "שלום]"),
    (
        "a // comment that eats the closing bracket",
        "#הדגשה[אלף // בית]",
    ),
    // `#הערה(צבע: red)[גוף]` used to be this case and is now a feature: a note
    // may be styled for itself, so a colour on one is a per-note override rather
    // than a mistake. The category is still real — a command with a fixed
    // signature and no style of its own — so it moves to one.
    (
        "an argument the command does not take",
        "#הדגשה(צבע: red)[שלום]",
    ),
    ("a named argument spelled wrong", "#טבלה(עמודותת: 2)[א][ב]"),
    ("nesting past Typst's limit", "\u{200E}"), // replaced below
    ("an item past the end of a list", "#((1,2).at(9))"),
    ("arithmetic on a command", "#(הדגשה + 1)"),
    ("a function that is not in that module", "#calc.div(1, 0)"),
    ("a colour that is not one", "#צבע_טקסט(rgb(\"zzz\"))[א]"),
    (
        "a paper size nobody makes",
        "#הגדרות_עמוד(נייר: \"b99\")\nשלום",
    ),
    ("a negative font size", "#הגדרות_עמוד(גודל: -5)\nשלום"),
];

fn errors(body: &str) -> Vec<Diagnostic> {
    let out = compile(body, &DocConfig::default());
    out.diagnostics
        .into_iter()
        .filter(|d| d.severity == "error")
        .collect()
}

fn is_hebrew(c: char) -> bool {
    ('\u{0590}'..='\u{05FF}').contains(&c)
}

/// Every case, with the deep-nesting one built rather than written out.
fn corpus() -> Vec<(&'static str, String)> {
    BROKEN
        .iter()
        .map(|(name, body)| {
            let body = if *name == "nesting past Typst's limit" {
                format!("{}x{}", "#הדגשה[".repeat(90), "]".repeat(90))
            } else {
                body.to_string()
            };
            (*name, body)
        })
        .collect()
}

/// The corpus is a corpus of *failures*. A case that starts compiling has
/// stopped testing anything and should be replaced rather than left in.
#[test]
fn every_case_really_fails() {
    let mut compiling = Vec::new();
    for (name, body) in corpus() {
        if errors(&body).is_empty() {
            compiling.push(name);
        }
    }
    assert!(
        compiling.is_empty(),
        "these no longer fail, so they assert nothing: {compiling:?}"
    );
}

/// **The rule, enforced.** What the writer reads is in their own language.
#[test]
fn no_failure_reaches_the_writer_in_typsts_own_words() {
    let mut raw = Vec::new();
    for (name, body) in corpus() {
        for d in errors(&body) {
            let bilingual = d.message.chars().any(is_hebrew)
                && d.message.chars().any(|c| c.is_ascii_alphabetic())
                && d.message.contains(" · ");
            if !bilingual {
                raw.push(format!("{name}: {}", d.message));
            }
        }
    }
    assert!(
        raw.is_empty(),
        "these reached the writer un-rephrased — add a family to `rephrase`:\n  {}",
        raw.join("\n  ")
    );
}

/// And it is a rephrasing, not a copy: `raw` keeps Typst's sentence for the bug
/// report, and the two are never the same string.
#[test]
fn typsts_own_sentence_is_kept_and_is_never_the_message() {
    let mut copied = Vec::new();
    for (name, body) in corpus() {
        for d in errors(&body) {
            assert!(!d.raw.is_empty(), "{name}: nothing kept for the bug report");
            if d.raw == d.message {
                copied.push(format!("{name}: {}", d.raw));
            }
        }
    }
    assert!(
        copied.is_empty(),
        "the message is Typst's own sentence verbatim:\n  {}",
        copied.join("\n  ")
    );
}

/// A line, or an honest silence. Never a wrong one.
///
/// Some of these genuinely have no line the writer can be sent to — a font that
/// is not installed is about the document, not about a place in it — so the
/// assertion is that a line, when given, is inside the document.
#[test]
fn a_line_when_given_is_a_line_the_writer_has() {
    for (name, body) in corpus() {
        let lines = body.lines().count().max(1);
        for d in errors(&body) {
            if let Some(line) = d.line {
                assert!(
                    line >= 1 && line <= lines + 1,
                    "{name}: line {line} of a {lines}-line document"
                );
            }
        }
    }
}

/// The two cases this whole file was written for, named so a regression reads
/// as itself rather than as "one of the corpus".
#[test]
fn the_gershayim_and_the_siman_say_what_to_do() {
    let quote = errors("#רשימה(פריט[א], \"ב)");
    let said = quote
        .iter()
        .find(|d| d.raw == "unclosed string")
        .expect("the gershayim case still produces `unclosed string`");
    assert!(
        said.message.contains("״"),
        "it should offer the gershayim character itself: {}",
        said.message
    );
    assert!(
        said.message.contains('['),
        "and the bracket that makes it ordinary text: {}",
        said.message
    );

    let siman = errors("#סימן[א׳]");
    let said = siman
        .iter()
        .find(|d| d.raw.starts_with("missing argument"))
        .expect("a siman with one argument still misses one");
    assert!(
        said.message.contains("כותרת"),
        "it should name the missing argument: {}",
        said.message
    );

    // And the one whose name was in English, on 89 commands, visible only here.
    let seif = errors("#סעיף[א]");
    let said = seif
        .iter()
        .find(|d| d.raw.starts_with("missing argument"))
        .expect("a seif with one argument still misses one");
    assert!(
        said.message.contains("גוף"),
        "`body` should reach the writer in Hebrew: {}",
        said.message
    );
    assert!(
        !said.message.contains("missing argument: גוף"),
        "the English half should keep Typst's own parameter name: {}",
        said.message
    );
}

/// The parameter table is the prelude's, not a second copy.
///
/// Checked by asking for a name that only exists because `ksav.typ` says so: if
/// this module ever grows its own table, the entry it is missing is the one it
/// never thought of, and that is the entry a writer hits.
#[test]
fn parameter_names_come_from_the_prelude() {
    // `#טבלה(עמודות: …)` is `columns` in the English alias, and the prelude's
    // `_en_params` is the only place that pairing is written down.
    let d = errors("#טבלה(עמודות: \"שתיים\")[א][ב]");
    assert!(!d.is_empty());
    // A missing-argument message for an English-named parameter has to come
    // back in Hebrew, and the only way to know the Hebrew is that table.
    let heading = errors("#כותרת_בדרגה(2)");
    if let Some(said) = heading
        .iter()
        .find(|x| x.raw.starts_with("missing argument"))
    {
        assert!(said.message.chars().any(is_hebrew), "{}", said.message);
    }
}

// ------------------------------------------------- (b) *the line they can act on*
//
// The header's rule has three parts and the middle one was only half kept. Every
// diagnostic here carries a line, a column, the command it is about and — when
// the name was misspelled — a suggestion, because the browser editor puts a mark
// in its gutter from exactly those fields.
//
// Two of the three surfaces that show a diagnostic threw all of them away. The
// command line printed `[error] {message}`; the Emacs client printed
// `error: {message}`. So a writer compiling a sefer in a terminal read *the
// command here is missing an argument: body* with no idea which command it was
// or which of three hundred lines. Found by compiling a real kuntres.
//
// `Diagnostic::one_line` is where the formatting lives now, so a surface with no
// gutter asks for a line of text rather than inventing one.

#[test]
fn a_diagnostic_can_say_where_it_is() {
    // `#סעיף` takes a letter and a halacha. One bracket is the commonest way a
    // sefer fails to compile, and the message alone does not say which command.
    let body = "פתיחה.\n\nעוד שורה.\n\n#סעיף[א] הטקסט ממשיך.\n";
    let out = compile(body, &DocConfig::default());
    assert!(!out.ok(), "the document compiled");
    let d = out
        .diagnostics
        .iter()
        .find(|d| d.severity == "error")
        .expect("an error");
    let line = d.one_line("kuntres.ksav");
    assert!(
        line.starts_with("kuntres.ksav:5:"),
        "it does not say where: {line}"
    );
    assert!(line.contains("error: "), "nor how bad: {line}");
    // `[#סעיף]`, with one hash. `about` carries its own and this printed
    // `[##סעיף]` until somebody read the output instead of the assertion.
    assert!(
        line.contains("[#סעיף]") && !line.contains("##"),
        "nor which command, which the engine knows: {line}"
    );
}

#[test]
fn a_misspelled_command_offers_the_name_it_meant() {
    let out = compile("#כותרת11[פרק]\n", &DocConfig::default());
    assert!(!out.ok(), "the document compiled");
    let d = out
        .diagnostics
        .iter()
        .find(|d| d.did_you_mean.is_some())
        .expect("a suggestion");
    let line = d.one_line("kuntres.ksav");
    assert!(
        line.contains("did you mean #"),
        "the suggestion never reaches a surface with no gutter: {line}"
    );
}

#[test]
fn a_diagnostic_with_nowhere_to_point_says_only_what_it_is() {
    // Ours rather than Typst's: no span, so no `file:line:` prefix invented for
    // it. A position that is not a position is worse than none — it sends the
    // reader to a line that has nothing wrong with it.
    let d = Diagnostic::ours("error", "אין קובץ · no file".into());
    let line = d.one_line("kuntres.ksav");
    assert!(
        !line.contains("kuntres.ksav"),
        "it invented a place: {line}"
    );
    assert_eq!(line, "error: אין קובץ · no file");
}

#[test]
fn a_line_from_an_included_document_names_that_document() {
    // The reason `file` exists at all: a sefer assembled from twelve chapters
    // reports at a line number in a document that exists nowhere. The one-line
    // form has to keep that, or the field is computed for nobody.
    let mut d = Diagnostic::ours("error", "משהו · something".into());
    d.line = Some(7);
    d.column = Some(3);
    d.file = Some("perek-b.ksav".into());
    assert_eq!(
        d.one_line("kuntres.ksav"),
        "perek-b.ksav:7:3: error: משהו · something"
    );
}

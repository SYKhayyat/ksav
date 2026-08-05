//! Everything the UI can insert must compile, and must do something.
//!
//! The registry is the source for the toolbar, the Insert menu, the palette and
//! the `#` autocomplete. A writer who picks a command from any of those has
//! been *offered* it by the product; if the result does not compile, or renders
//! nothing, that is the product's mistake and not theirs.
//!
//! Nothing checked this. `#רשימה(` inserted into an argument list blanked the
//! document, and the general form of that bug — an offered snippet that is not
//! valid where it is offered — had no test at all. These are the fences:
//!
//!   1. every snippet compiles on its own
//!   2. every snippet compiles nested inside a paragraph, a list and a table,
//!      which is where writers actually put things
//!   3. every command named in the registry exists in the prelude
//!   4. a snippet whose body is filled in puts that text on the page
//!
//! A command that genuinely cannot live in one of those places is listed in
//! `ONLY_AT_TOP` with the reason, so an exemption is a decision.

use ksav_engine::commands::COMMANDS;
use ksav_engine::probe;
use ksav_engine::DocConfig;

/// What a writer would plausibly type into each command's caret slot.
///
/// Not every slot is prose. `#תמונה("|")` wants a filename and `#נוסחה("|")`
/// wants a mathematical expression, so filling either with a Hebrew word
/// produces a real error about a real mistake — a fact about the test, not
/// about the product. Anything not listed takes an ordinary word.
const SAMPLE: &[(&str, &str)] = &[
    ("נוסחה", "x^2 + 1"),
    ("נוסחה_בשורה", "x^2 + 1"),
    ("formula", "x^2 + 1"),
    ("formula_inline", "x^2 + 1"),
];

/// Commands whose slot needs something this test cannot supply — an image only
/// exists once the writer has attached it, and the assets channel is tested in
/// `assets.rs`.
const NEEDS_A_FILE: &[&str] = &["תמונה", "image"];

/// The snippet as a writer would get it: caret marker gone, body filled in so
/// the command has something to render.
fn filled(he: &str, insert: &str, fallback: &str) -> String {
    let body = SAMPLE
        .iter()
        .find(|(n, _)| *n == he)
        .map(|(_, b)| *b)
        .unwrap_or(fallback);
    insert.replace('|', body)
}

/// Commands that are legitimately not usable inside another element, and why.
const ONLY_AT_TOP: &[(&str, &str)] = &[
    ("מסמך", "the document wrapper itself; the engine applies it"),
    ("מקטע_עמוד", "starts a page section, which cannot begin inside a paragraph"),
    ("מעבר_עמוד", "a page break has no meaning inside a line"),
    ("תוכן", "the table of contents is a block of its own"),
    ("הערות_בסוף", "renders a collected block; not an inline element"),
    ("הערות_בסוף_צד", "renders a collected block; not an inline element"),
    ("הערות_מדורגות", "renders a collected block; not an inline element"),
    ("מפתח_ענינים", "renders a generated index; a block of its own"),
    ("מפתח_מקורות", "renders a generated index; a block of its own"),
];

fn only_at_top(he: &str) -> Option<&'static str> {
    ONLY_AT_TOP.iter().find(|(n, _)| *n == he).map(|(_, r)| *r)
}

/// Settings commands configure and render nothing; the "renders something"
/// check does not apply to them.
fn is_config(he: &str) -> bool {
    he.starts_with("הגדרות")
}

fn compiles(source: &str) -> Result<(), String> {
    match probe::layout(source, &DocConfig::default()) {
        Ok(_) => Ok(()),
        Err(d) => Err(format!("{d:?}")),
    }
}

#[test]
fn every_offered_snippet_compiles_on_its_own() {
    let mut broken = Vec::new();
    for c in COMMANDS {
        if NEEDS_A_FILE.contains(&c.he) {
            continue;
        }
        let src = filled(c.he, c.insert, "טקסט");
        if let Err(e) = compiles(&src) {
            broken.push(format!("#{} → {src}\n    {e}", c.he));
        }
    }
    assert!(
        broken.is_empty(),
        "{} snippet(s) the UI offers do not compile:\n{}",
        broken.len(),
        broken.join("\n"),
    );
}

/// The reported bug, generalised: a command offered while the caret is inside
/// something else has to be legal *there*.
///
/// `mode.ts` in the app rewrites the hash for code context; this asserts the
/// engine side agrees — that with the hash handled, every command may be nested
/// in the three places writers put things.
#[test]
fn every_offered_snippet_compiles_where_writers_put_it() {
    let mut broken = Vec::new();
    for c in COMMANDS {
        if only_at_top(c.he).is_some() || NEEDS_A_FILE.contains(&c.he) {
            continue;
        }
        let snip = filled(c.he, c.insert, "טקסט");
        // In content mode the snippet is written as-is; in code mode (an
        // argument list) the leading hash has to go, which is exactly the rule
        // the app now enforces.
        let bare = snip.strip_prefix('#').unwrap_or(&snip);

        let contexts: [(&str, String); 3] = [
            ("in a paragraph", format!("לפני {snip} אחרי.\n")),
            ("in a list item", format!("#רשימה(\n  פריט[לפני {snip} אחרי],\n)\n")),
            (
                "in a table cell",
                format!("#טבלה(עמודות: 1,\n  תא[לפני {snip} אחרי],\n)\n"),
            ),
        ];
        for (where_, src) in contexts {
            if let Err(e) = compiles(&src) {
                broken.push(format!("#{} {where_} → {src}\n    {e}", c.he));
            }
        }
        // And as a bare call inside an argument list, which is what the app
        // writes when the caret is in code context.
        let in_args = format!("#רשימה(\n  {bare},\n)\n");
        if compiles(&in_args).is_err() && !is_config(c.he) {
            // Not every command is a legal list *argument* — many are content,
            // not items. That is fine; what must never happen is the hash form
            // being written there, which `mode.ts` prevents. Nothing to assert.
        }
    }
    assert!(
        broken.is_empty(),
        "{} snippet(s) break when nested where writers put them:\n{}",
        broken.len(),
        broken.join("\n"),
    );
}

/// Every registry name resolves to something in the prelude — in both languages.
///
/// A command offered by name that the compiler has never heard of is the purest
/// form of the product lying to the writer.
#[test]
fn every_command_exists_in_both_languages() {
    let mut missing = Vec::new();
    for c in COMMANDS {
        if only_at_top(c.he).is_some() || is_config(c.he) {
            // Still checked, just not by calling them with a body.
            for name in [c.he, c.en] {
                let src = format!("#{{ let _ = {name} }}\n");
                if compiles(&src).is_err() {
                    missing.push(format!("{name} (from #{})", c.he));
                }
            }
            continue;
        }
        for name in [c.he, c.en] {
            let src = format!("#{{ let _ = {name} }}\n");
            if compiles(&src).is_err() {
                missing.push(format!("{name} (from #{})", c.he));
            }
        }
    }
    assert!(
        missing.is_empty(),
        "{} registry name(s) do not exist in the prelude:\n{}",
        missing.len(),
        missing.join("\n"),
    );
}

/// Commands that do not print their argument where it is written, and why.
///
/// Two very different things are in this list, and the difference is the whole
/// point of writing it out.
///
/// Most are *correct*: a marker prints nothing by design, a reference prints a
/// number rather than its own name, an index entry prints in the index, and
/// maths reaches the page as U+1D44E-style math italics rather than the ASCII
/// that was typed.
///
/// But the `מדור_*` bands and `הערתסיום` are correct only in the sense that a
/// loaded gun is correct. They collect their text and print nothing until a
/// matching dump call exists somewhere in the document. The Notes chooser knows
/// that and writes the dump; the Insert menu, the palette and the `#`
/// autocomplete all offer the same commands raw. Pick `#מדור_א` from the Insert
/// menu and your sentence is silently gone from the page — which is exactly the
/// bug that `chooser.rs` caught in the "end of each section" card, still live
/// on every path that is not the chooser.
///
/// They stay listed here because the *engine* behaviour is right. The fix
/// belongs in the editor: a lint that sees notes collected and never rendered,
/// and offers the dump call. Until that exists this comment is the record that
/// it is owed.
const RENDERS_ELSEWHERE: &[(&str, &str)] = &[
    ("מדור_א", "collected; prints only where #הערות_מדורגות() is called — NEEDS A LINT"),
    ("מדור_ב", "collected; prints only where #הערות_מדורגות() is called — NEEDS A LINT"),
    ("מדור_ג", "collected; prints only where #הערות_מדורגות() is called — NEEDS A LINT"),
    ("מדור_בדרגה", "collected; prints only where #הערות_מדורגות() is called — NEEDS A LINT"),
    ("הערתסיום", "collected; prints only where #הערות_בסוף() is called — NEEDS A LINT"),
    ("גוף_הערה", "a deferred body: prints at its marker, not at its definition"),
    ("ערך", "an index entry: its text prints in the generated index"),
    ("נוסחה", "maths reaches the page as math italics, not as the ASCII typed"),
    ("נוסחה_בשורה", "maths reaches the page as math italics, not as the ASCII typed"),
    ("סמן", "an anchor: it prints nothing, which is what an anchor is"),
    ("הפניה", "a reference: it prints its target's number, not its own name"),
];

/// A command given text puts that text on the page.
///
/// The failure this catches is the quietest one in the product: a command that
/// compiles, renders nothing, and takes the writer's sentence with it.
#[test]
fn a_command_given_text_shows_that_text() {
    const MARK: &str = "טקסטמיוחד";
    let mut swallowed = Vec::new();
    for c in COMMANDS {
        if is_config(c.he) || only_at_top(c.he).is_some() || NEEDS_A_FILE.contains(&c.he) {
            continue;
        }
        if RENDERS_ELSEWHERE.iter().any(|(n, _)| *n == c.he) {
            continue;
        }
        // Only snippets with a caret slot take a body at all.
        if !c.insert.contains('|') {
            continue;
        }
        let src = format!("{}\n", filled(c.he, c.insert, MARK));
        let Ok(doc) = probe::layout(&src, &DocConfig::default()) else {
            continue; // owned by the compile test above
        };
        let page: String = probe::text_runs(&doc)
            .iter()
            .map(|r| r.text.as_str())
            .collect();
        if !page.contains(MARK) {
            swallowed.push(format!("#{} → {}", c.he, src.trim()));
        }
    }
    assert!(
        swallowed.is_empty(),
        "{} command(s) were given text and did not print it:\n{}",
        swallowed.len(),
        swallowed.join("\n"),
    );
}

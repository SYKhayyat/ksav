//! A highlight that takes a colour, and a paragraph break that is not a blank line.
//!
//! Two asks from the same margin, and both were the same shape: the engine could
//! already do the thing and there was no name to say so.
//!
//! `#סימון` and `#רקע` were one Typst function written twice — `highlight(body)`
//! and `highlight(fill: …, body)` — and the toolbar button was wired to the half
//! that cannot take a colour, so *"highlight should offer a colour"* was true of
//! the product and false of the engine. The colour is now an argument on the one
//! command and `#רקע` forwards to it.
//!
//! The paragraph break had no command at all. A blank line is Typst's way of
//! ending a paragraph and it is the wrong tool inside a list item, where a blank
//! line ends the *item*, and inside a note body, where the block swallows it.
//!
//! The colour assertions go through `probe::fills` rather than the text runs.
//! A highlight puts nothing on the page except a rectangle behind words that
//! were going to be there anyway, so a test written against the runs passes just
//! as happily when the colour is dropped.

mod common;
use common::{page_fills, page_text, render, visual_lines};

#[test]
fn a_highlight_takes_a_colour() {
    let fills = page_fills("#סימון(צבע: rgb(\"#ff0000\"))[מודגש]");
    assert!(
        fills.iter().any(|f| f.colour == "#ff0000"),
        "the colour did not reach the page: {fills:?}"
    );
}

#[test]
fn and_in_english() {
    // `#let mark = _en(סימון)`, not a bare alias: an English command that cannot
    // take an English argument name is English in its name only.
    let fills = page_fills("#mark(color: rgb(\"#00ff00\"))[green]");
    assert!(fills.iter().any(|f| f.colour == "#00ff00"), "{fills:?}");
}

#[test]
fn without_a_colour_it_is_still_a_highlight() {
    // The bare form is what the palette and every existing document write, and
    // it must go on drawing Typst's own yellow rather than nothing.
    let fills = page_fills("#סימון[מודגש]");
    assert!(!fills.is_empty(), "the bare highlight drew nothing");
}

#[test]
fn the_older_spelling_paints_the_same_colour() {
    // `#רקע(colour)[…]` is the same command with the colour written first. It is
    // in documents, so it stays — but as a forward to `#סימון`, not as a second
    // implementation that can drift.
    let by_name = page_fills("#סימון(צבע: rgb(\"#0000ff\"))[א]");
    let by_position = page_fills("#רקע(rgb(\"#0000ff\"))[א]");
    assert_eq!(
        by_name.iter().map(|f| f.colour.clone()).collect::<Vec<_>>(),
        by_position
            .iter()
            .map(|f| f.colour.clone())
            .collect::<Vec<_>>(),
    );
}

// ---------------------------------------------------------------- custom styles
//
// `#עיצוב` is what a writer's own paragraph style is made of. It exists so that
// a style is a shape the editor can read back and rewrite, rather than arbitrary
// Typst it can only leave alone — so the assertions that matter are that each
// knob reaches the page, and that a style used inline stays inline.

#[test]
fn a_custom_style_carries_its_knobs() {
    let runs = render("#עיצוב(גודל: 20pt, משקל: \"bold\", צבע: rgb(\"#ff0000\"))[שאלה]");
    let run = runs
        .iter()
        .find(|r| r.text.contains('ש'))
        .unwrap_or_else(|| panic!("nothing set: {runs:?}"));
    assert!((run.size - 20.0).abs() < 0.01, "size: {run:?}");
    assert_eq!(run.weight, 700, "weight: {run:?}");
}

#[test]
fn and_it_is_a_let_a_writer_can_name() {
    // The shape the style editor writes: a `#let` in the document whose body is
    // one `#עיצוב` call. Nothing here is special-cased in the prelude — it is
    // Typst's own binding — which is the reason a custom style needs no storage
    // of its own and travels with the sefer.
    let runs = render("#let שאלה(תוכן) = עיצוב(תוכן, גודל: 20pt)\n#שאלה[מה הדין]");
    assert!(
        runs.iter()
            .any(|r| r.text.contains('מ') && (r.size - 20.0).abs() < 0.01),
        "{runs:?}"
    );
}

#[test]
fn a_style_with_no_block_knob_stays_inside_the_sentence() {
    // Alignment and the two spacings are block-level questions in Typst, so
    // asking either makes the content a block. Asking neither must not: a style
    // that always blocked could not be used on three words mid-sentence, which
    // is most of what an inline style is for.
    // Against the same sentence unstyled, because a page carries a page number
    // and a line count read on its own would be counting that too.
    let plain = visual_lines(&render("לפני באמצע אחרי")).len();
    let inline = visual_lines(&render("לפני #עיצוב(משקל: \"bold\")[באמצע] אחרי")).len();
    assert_eq!(inline, plain, "the style broke the sentence in two");
    let blocked = visual_lines(&render("לפני #עיצוב(יישור: center)[באמצע] אחרי")).len();
    assert!(
        blocked > plain,
        "asking for alignment did not make it a block"
    );
}

#[test]
fn a_custom_style_speaks_english_too() {
    let runs = render("#styled(size: 20pt, weight: \"bold\")[question]");
    assert!(
        runs.iter()
            .any(|r| (r.size - 20.0).abs() < 0.01 && r.weight == 700),
        "{runs:?}"
    );
}

#[test]
fn a_paragraph_break_breaks_the_paragraph() {
    let one = visual_lines(&render("ראשונה שניה")).len();
    let two = visual_lines(&render("ראשונה #מעבר_פסקה שניה")).len();
    assert!(two > one, "one line {one}, two paragraphs {two}");
}

#[test]
fn and_it_works_where_a_blank_line_cannot() {
    // The reason the command exists. A blank line inside a list item ends the
    // item; `#מעבר_פסקה` ends the paragraph and stays inside it, so the item
    // keeps its number.
    let out = page_text("#ממוספרת[ראשונה #מעבר_פסקה שניה][אחר]");
    assert!(
        out.contains("1.") && out.contains("2."),
        "two items, not three: {out}"
    );
    assert!(!out.contains("3."), "the break started a new item: {out}");
    let lines = visual_lines(&render("#ממוספרת(הזחה: 0em)[ראשונה #מעבר_פסקה שניה]")).len();
    let flat = visual_lines(&render("#ממוספרת(הזחה: 0em)[ראשונה שניה]")).len();
    assert!(lines > flat, "flat {flat}, broken {lines}");
}

#[test]
fn and_in_english_too() {
    // `parabreak`, not `parbreak`: binding Typst's own name would shadow the
    // function the Hebrew definition calls. See the prelude.
    let one = visual_lines(&render("first second")).len();
    let two = visual_lines(&render("first #parabreak second")).len();
    assert!(two > one, "one line {one}, two paragraphs {two}");
}

#[test]
fn typsts_own_parbreak_still_reaches_the_writer() {
    // The other half of that naming decision, and the one that would have broken
    // silently: `#parbreak()` is Typst's and the sink has always passed it
    // through.
    let one = visual_lines(&render("first second")).len();
    let two = visual_lines(&render("first #parbreak() second")).len();
    assert!(two > one, "one line {one}, two paragraphs {two}");
}

#[test]
fn the_bare_highlight_is_the_colour_the_toolbar_starts_on() {
    // The toolbar's swatch opens on this colour, so that a writer who never
    // touches it gets the same page as `#סימון[…]` written by hand — which is
    // what the palette and every existing document write. The value is Typst's,
    // not ours, and it is stated in two places: here and `DEFAULT_HIGHLIGHT` in
    // the editor's `styles.ts`. If a Typst release moves it, this is the test
    // that says so and that names the constant to move with it.
    let fills = page_fills("#סימון[א]");
    assert_eq!(
        fills.iter().map(|f| f.colour.as_str()).collect::<Vec<_>>(),
        vec!["#fffd11"],
        "update DEFAULT_HIGHLIGHT in app/src/styles.ts to match",
    );
}

// ------------------------------------------------------------------ inline styles
//
// The class: **an inline style that is not inline.**
//
// `#נטוי` was `skew(ax: -12deg, reflow: true, emph(body))`, and `skew` is a
// layout function — it lays its content out and shears the frame, and a sheared
// frame is a block. So emphasising two words in the middle of a sentence split
// that sentence into three paragraphs, one per baseline. The writer said *"the
// italic seems to make for itself a new paragraph — before and after"*, which
// is precisely what it did.
//
// Every one of these documents compiled cleanly, both before the fix and after,
// which is the whole argument for asserting against the laid-out page. `ok()`
// could not tell the two apart and neither can a screenshot at a glance: it
// reads as a spacing quirk until you measure the baselines.
//
// The sweep is the point. One inline command defined block-level is never one,
// so this asks the same question of every inline style the product offers
// rather than of the one that was reported.

/// Commands that end the paragraph they are written in **on purpose**, with the
/// reason each one is not a bug.
///
/// Everything not named here has to leave the sentence around it alone. The
/// list is the whole content of this fence: adding a name to it is the moment
/// somebody has to say out loud that a new command is block-level, and that is
/// exactly the sentence nobody said about `#הערת_גיליון`.
const BLOCK_ON_PURPOSE: &[(&str, &str)] = &[
    // Headings. A heading is a block by definition, and every one of these is
    // one — `#כותרת_בהערה` included, which is a heading inside a note body.
    ("שער", "a title page's title"),
    ("תת_שער", "and its subtitle"),
    ("כותרת1", "a heading"),
    ("כותרת2", "a heading"),
    ("כותרת3", "a heading"),
    ("כותרת", "a heading at a level the writer names"),
    ("כותרת_בהערה", "a heading inside a note's body"),
    ("סימן", "a siman is a heading"),
    ("סעיף", "a seif is a heading"),
    // Alignment. Aligning something means giving it a line of its own to be
    // aligned within.
    ("מרכז", "alignment"),
    ("ימין", "alignment"),
    ("שמאל", "alignment"),
    ("הזחה", "an indented block"),
    // Lists and tables — grids of text, each row its own line.
    ("רשימה", "a list"),
    ("ממוספרת", "a numbered list"),
    ("ממוספרת_עברית", "a list numbered א ב ג"),
    ("רשימת_הגדרות", "a definition list"),
    ("טבלה", "a table"),
    // Blocks that draw a frame, a rule or a space.
    ("ציטוט", "a block quotation"),
    ("הערת_צד", "a callout"),
    ("אזהרה", "a callout"),
    ("הצלחה", "a callout"),
    ("תיבה", "a framed box"),
    ("קו_מפריד", "a horizontal rule"),
    ("מרווח", "vertical space"),
    ("טורים_בלוק", "a multi-column block"),
    (
        "מעבר_שורה",
        "a line break — ending the line is the whole command",
    ),
    ("מעבר_פסקה", "a paragraph break — likewise"),
    // Page and document structure.
    ("תוכן", "a table of contents"),
    ("כלול", "another file's whole contents"),
    (
        "גופי_הערות",
        "the block of deferred note bodies at the foot of the file",
    ),
    // Arrangements: each of these *is* a page layout, and reserves columns.
    ("עם_פירוש", "a two-column arrangement"),
    ("עם_הערות_צד", "reserves the side column"),
    ("עם_הערות_דו_צד", "reserves both side columns"),
];

/// Snippets this fence cannot put in a sentence, and why.
///
/// Kept separate from the pass so that a command going quiet is not read as a
/// command behaving. A partial result must not wear a complete one's words.
const NOT_EXERCISED: &[(&str, &str)] = &[
    (
        "תמונה",
        "takes a filename, and this fence has no image to give it. \
         `tests/assets.rs` renders it against real bytes.",
    ),
    (
        "נוסחה",
        "takes a formula, and the placeholder word this fence substitutes is not \
         one. Block-level in any case.",
    ),
    (
        "נוסחה_בשורה",
        "the same, and this one *is* inline — so it is the entry here that is \
         worth removing first, with a formula a writer might really type.",
    ),
];

/// **Every** command in the registry keeps the words around it on their line —
/// or is named above as block-level on purpose.
///
/// **Driven off the registry, not off a list written here.** The first version
/// of this fence asked four commands — the one that was reported and its three
/// neighbours in the toolbar. The second asked the `style` category, which holds
/// eighteen. Both were the same mistake at different sizes, and the second one
/// cost a real bug: `#הערת_גיליון` is in the `footnote` category, which holds
/// **forty-two**, and it called a block-level `layout()` from the middle of a
/// sentence for as long as it has existed. Every sidenote in every sefer added
/// about 20pt of stray leading to the body around it — measured at 36.72pt
/// between two lines against 16.92pt everywhere else — in a document class where
/// the notes outnumber the body five to one.
///
/// A fence scoped to the category the bug was *reported* in is this repository's
/// `ONLY_AT_TOP` shape once more: it cannot fail for the reason it was written
/// under, because the sibling it was meant to catch is one category over. So the
/// filter is gone and the whole registry is asked.
///
/// Each command is exercised through its own `insert` snippet, so the arity and
/// the argument names come from the same table the toolbar inserts from rather
/// than from a guess made here about what `#צבע` takes.
#[test]
fn no_command_breaks_the_paragraph_it_was_written_in() {
    let mut broken = Vec::new();
    let mut checked = 0;
    for cmd in ksav_engine::commands::COMMANDS
        .iter()
        .filter(|c| !c.deprecated)
        .filter(|c| !BLOCK_ON_PURPOSE.iter().any(|(n, _)| *n == c.he))
        .filter(|c| !NOT_EXERCISED.iter().any(|(n, _)| *n == c.he))
    {
        for (script, name, (a, b, c)) in [
            ("hebrew", cmd.he, ("אאא", "בבב", "גגג")),
            ("english", cmd.en, ("aaa", "bbb", "ccc")),
        ] {
            // The snippet carries the command's Hebrew name and its `|` caret.
            // Swap in the spelling under test and the middle word.
            let snippet = cmd
                .insert
                .replace(&format!("#{}", cmd.he), &format!("#{name}"));
            // The caret is where a writer would start typing, so the middle word
            // goes there whatever shape the snippet has. The earlier version of
            // this required `…[|]` and reported every other shape as broken,
            // which is why it could only ever have run on one category: two
            // thirds of the registry does not end that way.
            let piece = snippet.replacen('|', b, 1);
            let body = format!("{a} {piece} {c}");
            let Ok(doc) = ksav_engine::probe::layout(&body, &ksav_engine::DocConfig::default())
            else {
                broken.push(format!("#{name} ({script}): did not compile — {body}"));
                continue;
            };
            let runs = ksav_engine::probe::text_runs(&doc);
            // # What "it broke the paragraph" actually means
            //
            // Two metrics were tried here and both were wrong, in opposite
            // directions, and the second was wrong in an interesting way.
            //
            // Comparing all three baselines flags `#עילי` and `#תחתי`, which sit
            // 4.2pt up and 0.9pt down — that is not a break, that is what a
            // superscript is. Counting `probe::lines` flags them too: its
            // tolerance is 1.5pt, so a superscript is already its own "line" by
            // that reckoning. A sheared frame and a raised baseline both move
            // text off the line; only one of them moves the *rest of the
            // sentence*.
            //
            // Which is the writer's own words — *"a new paragraph, before and
            // after"*. So the question is about the words the command was never
            // applied to: `{a}` and `{c}` must stay on one baseline with each
            // other. Italic split them by a full line (78.79 against 123.43);
            // superscript leaves them exactly where they were.
            let y = |needle: &str| {
                runs.iter()
                    .find(|r| r.text.contains(needle))
                    .map(|r| (r.y * 100.0).round() as i64)
            };
            let (Some(before), Some(after)) = (y(a), y(c)) else {
                broken.push(format!("#{name} ({script}): the plain words did not print"));
                continue;
            };
            checked += 1;
            if before != after {
                broken.push(format!(
                    "#{name} ({script}): the words around it split, {before} against {after}"
                ));
            }
            // # Where the command's own word went is a different question
            //
            // The general rule is about the **sentence**: the words the command
            // was never applied to have to stay on one baseline with each other.
            //
            // Where the command's own word ends up is not that question, and
            // asking it of the whole registry gets a wrong answer forty times
            // over. `#הערה`'s word is *supposed* to leave the line — that is what
            // a footnote is, and it lands at y=771 on the same page. `#מדור_א`'s
            // does not print here at all, because a banded note is collected and
            // rendered where `#הערות_מדורגות` is called. `#ערוץ` and every
            // `#הגדרות_*` take no body to print. None of those is a broken
            // paragraph, and every one of them was reported as one.
            //
            // So it stays where it belongs: on the `style` category, whose whole
            // promise is that the words remain in the sentence. That is also the
            // shape of the second half of the italic bug — one box around a long
            // passage makes an unbreakable slab that jumps to a line of its own —
            // and `a_long_italic_passage_flows_rather_than_becoming_a_slab` below
            // holds it at length.
            if cmd.category == "style" {
                let Some(middle) = y(b) else {
                    broken.push(format!("#{name} ({script}): the styled word did not print"));
                    continue;
                };
                // A whole line is 2,230 hundredths at the default size; a
                // superscript is 420 and a subscript 90, so half a line separates
                // the two cases with room on both sides.
                if (middle - before).abs() > 1_000 {
                    broken.push(format!(
                        "#{name} ({script}): the styled word left the line, {middle} against {before}"
                    ));
                }
            }
        }
    }
    // A floor under the `continue`s above. Break the prelude so that nothing
    // prints and every case takes an escape, and without this the test passes
    // having measured none of them — the exact shape `skips.test.mjs` sweeps for,
    // and the shape it caught this file in within an hour of it being written.
    let expected = ksav_engine::commands::COMMANDS
        .iter()
        .filter(|c| !c.deprecated)
        .filter(|c| !BLOCK_ON_PURPOSE.iter().any(|(n, _)| *n == c.he))
        .filter(|c| !NOT_EXERCISED.iter().any(|(n, _)| *n == c.he))
        .count()
        * 2;
    // And a floor under `expected` itself. `assert_eq!(checked, expected)` alone
    // is `0 == 0` the day the filters match nothing — a fully-skipped walk
    // passing on a comparison of two zeroes, which is the exact shape
    // `skips.test.mjs` sweeps for, and it caught this test on that shape rather
    // than on the `continue`s it was written to defend.
    //
    // The floor is stated against the *registry*, not against the survivors of
    // the two exemption lists, so that exempting the whole file one command at a
    // time cannot quietly empty this test out.
    let registry = ksav_engine::commands::COMMANDS
        .iter()
        .filter(|c| !c.deprecated)
        .count();
    assert!(
        registry >= 150,
        "the registry came back with {registry} commands — it is not being read"
    );
    assert!(
        expected >= registry,
        "{} of {registry} commands are exempted from this fence — more than half of \
         the product is declared block-level, which is not a fence any more",
        registry - expected / 2
    );
    // **Named before counted.** Every case that took an escape above also wrote
    // itself into `broken`, so this assertion is the one that says *which*
    // commands are unaccounted for. Asserting the count first reports the number
    // 72 and nothing a person can act on — which is a partial result wearing a
    // complete one's words, one level in.
    assert!(
        broken.is_empty(),
        "commands that broke the paragraph they were written in, or could not be \
         measured at all:\n  {}",
        broken.join("\n  ")
    );
    assert_eq!(
        checked, expected,
        "only {checked} of the {expected} spellings printed anything to measure"
    );
}

/// A long emphasised passage still breaks across lines like prose.
///
/// The second half of the same bug, and the reason the fix boxes each *word*
/// rather than the passage. One `box` around the whole thing makes it inline and
/// makes it unbreakable — so a sentence of italic becomes a slab that cannot fit
/// after the words before it and jumps to a line of its own, which is the
/// original complaint again with a longer input.
#[test]
fn a_long_italic_passage_flows_rather_than_becoming_a_slab() {
    let long = "מלה ".repeat(40);
    let runs = render(&format!("פתיחה #נטוי[{long}] סיום"));
    let opening = runs
        .iter()
        .find(|r| r.text.contains("פתיחה"))
        .expect("the opening word printed");
    // The emphasised words start on the same line the sentence started on. If
    // the passage were one unbreakable box it would begin a line below.
    let first_emphasised = runs
        .iter()
        .find(|r| r.text.trim() == "מלה")
        .expect("the emphasised words printed");
    assert_eq!(
        (opening.y * 100.0).round() as i64,
        (first_emphasised.y * 100.0).round() as i64,
        "the italic passage began on its own line instead of continuing the sentence"
    );
    // And it really did wrap — a forty-word passage that fits on one line would
    // make the assertion above true for the wrong reason.
    let lines: std::collections::BTreeSet<i64> = runs
        .iter()
        .filter(|r| r.text.contains("מלה"))
        .map(|r| (r.y * 100.0).round() as i64)
        .collect();
    assert!(
        lines.len() > 1,
        "the passage fitted on one line, so this proves nothing about breaking"
    );
}

/// Every knob a custom style offers, one at a time, against the sentence it sits in.
///
/// The style dialog is ten controls and a name, and three of them — alignment
/// and the two spacings — are block-level questions in Typst. A writer who sets
/// one of those and applies the style to two words in a sentence gets a
/// paragraph break, which is the same complaint as the italic one arriving by a
/// different door.
///
/// So this states which knobs do that, as a fact rather than as a comment: the
/// seven text knobs must stay inline, and the three block knobs must not
/// pretend. `STYLE_FIELDS` in the editor's `styles.ts` lists the same ten, and
/// `the_dialog_offers_exactly_these_knobs` below keeps the two in step — a knob
/// added there and not here is a knob nothing measures.
#[test]
fn a_custom_styles_knobs_are_inline_except_the_three_that_are_not() {
    let inline = [
        "גודל: 1.2em",
        "משקל: \"bold\"",
        "צבע: rgb(\"#b91c1c\")",
        "סגנון: \"italic\"",
        "מרווח_אותיות: 0.1em",
        "קו_תחתון: true",
        "רברבתי: true",
    ];
    let blocky = ["יישור: center", "ריווח_לפני: 1em", "ריווח_אחרי: 1em"];
    let plain = visual_lines(&render("לפני באמצע אחרי")).len();
    for knob in inline {
        let lines = visual_lines(&render(&format!("לפני #עיצוב({knob})[באמצע] אחרי"))).len();
        assert_eq!(
            lines, plain,
            "#עיצוב({knob}) broke the sentence: {lines} lines against {plain}"
        );
    }
    for knob in blocky {
        let lines = visual_lines(&render(&format!("לפני #עיצוב({knob})[באמצע] אחרי"))).len();
        assert!(
            lines > plain,
            "#עיצוב({knob}) is documented as block-level and did not block"
        );
    }
}

/// A style the writer named, applied to two words, stays in the sentence.
///
/// The shape the dialog actually writes — a `#let` at the top of the document
/// and `#NAME[…]` around the selection — rather than a bare `#עיצוב` call. The
/// binding is Typst's own, so this can only fail if `#עיצוב` changes underneath
/// it, which is exactly the regression worth a test of its own: the previous
/// version of this file measured the command and not the door a writer reaches
/// it through.
#[test]
fn a_named_style_applied_to_two_words_stays_in_the_sentence() {
    let plain = visual_lines(&render("לפני באמצע כאן אחרי")).len();
    let styled = visual_lines(&render(
        "#let שאלה(תוכן) = עיצוב(תוכן, משקל: \"bold\", צבע: rgb(\"#b91c1c\"))\nלפני #שאלה[באמצע כאן] אחרי",
    ))
    .len();
    assert_eq!(styled, plain, "the named style broke its own paragraph");
}

/// Superscript rises and subscript drops, on the line they were written on.
///
/// The other half of the sweep above. That test asks how many *lines* the words
/// landed on, which is the right question for "did the sentence come apart" and
/// deliberately blind to a baseline that moved a few points — so on its own it
/// would go on passing if `#עילי` became a no-op. This says the shift is really
/// there and points the right way, and the two together say what the first,
/// wrong version of the sweep was trying to say: off the baseline, on the line.
#[test]
fn superscript_rises_and_subscript_drops_without_leaving_the_line() {
    for (name, up) in [
        ("עילי", true),
        ("תחתי", false),
        ("sup", true),
        ("sub_", false),
    ] {
        let (a, b) = if name.starts_with(|c: char| c.is_ascii()) {
            ("aaa", "bbb")
        } else {
            ("אאא", "בבב")
        };
        let runs = render(&format!("{a} #{name}[{b}]"));
        let base = runs
            .iter()
            .find(|r| r.text.contains(a))
            .expect("the plain word printed")
            .y;
        let moved = runs
            .iter()
            .find(|r| r.text.contains(b))
            .expect("the shifted word printed")
            .y;
        if up {
            assert!(moved < base, "#{name} did not rise: {moved} against {base}");
        } else {
            assert!(moved > base, "#{name} did not drop: {moved} against {base}");
        }
        // And the shift is a fraction of a line, not a line. `visual_lines`
        // cannot say this — its 1.5pt tolerance already calls a superscript a
        // line of its own — so the claim is made against the line height
        // directly: a break is 22.3pt and these are 4.2 and 0.9.
        assert!(
            (moved - base).abs() < 10.0,
            "#{name} moved {} points, which is a line, not a shift",
            (moved - base).abs()
        );
    }
}

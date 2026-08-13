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

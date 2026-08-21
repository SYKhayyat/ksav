//! What each page says, read off the laid-out page.
//!
//! # The report
//!
//! > *"Search should be configurable to search the source, the preview, or
//! > both."*
//!
//! And the warning it carries: built off the source string under a new label,
//! *"search the preview"* becomes a fake. So the assertions here are all of one
//! kind — **the printed text differs from the typed text, in the direction the
//! page decides**. A test that searched for a word which is identical on both
//! sides would pass just as happily against the source, which is the failure
//! rather than the feature.
//!
//! Every case below is therefore ink the source does not hold, or source the
//! page does not print, or a piece of arrangement — reading order, column
//! separation — that only exists once something has been laid out.

use ksav_engine::{compile_doc, main_source, pagetext, DocConfig};
use typst::syntax::Source;

/// Every page's printed lines, for a document with the default page setup.
fn pages_of(body: &str) -> Vec<Vec<pagetext::PageLine>> {
    let cfg = DocConfig::default();
    let doc = compile_doc(body, &cfg).expect("the document lays out");
    let main = Source::detached(main_source(body, &cfg));
    pagetext::page_text(&doc, &main, body)
}

/// Everything one document printed, as one string per line, pages flattened.
fn lines_of(body: &str) -> Vec<String> {
    pages_of(body)
        .into_iter()
        .flatten()
        .map(|l| l.text)
        .collect()
}

/// Does any printed line hold this phrase?
fn printed(body: &str, phrase: &str) -> bool {
    lines_of(body).iter().any(|l| l.contains(phrase))
}

#[test]
fn a_paragraph_prints_the_words_that_were_typed() {
    // The floor. Everything below is about the difference between the two
    // strings, and a difference is only interesting once the sameness holds.
    assert!(
        printed("שלום עולם", "שלום עולם"),
        "the page says: {:?}",
        lines_of("שלום עולם")
    );
}

#[test]
fn a_command_name_is_not_on_the_page() {
    // The direction the source has more: `#הדגשה` is four letters of markup and
    // prints nothing at all. A search of the preview must not find it, and a
    // "preview" search implemented over the source would.
    let body = "#הדגשה[שלום]";
    assert!(printed(body, "שלום"), "the emphasised word printed");
    assert!(
        !printed(body, "הדגשה"),
        "the command name printed: {:?}",
        lines_of(body)
    );
}

#[test]
fn a_comment_is_not_on_the_page() {
    let body = "שלום\n// זו הערה פנימית\nעולם";
    assert!(
        !printed(body, "הערה פנימית"),
        "a comment printed: {:?}",
        lines_of(body)
    );
}

#[test]
fn a_notes_marker_is_on_the_page_and_in_no_source_string() {
    // The direction the page has more, and the one this whole module exists
    // for. The `1` beside the word was written by the layout; the source holds
    // `#הערה` and a body, and nowhere in it is there a `1` at all.
    let body = "שלום#הערה[ביאור] עולם";
    assert!(
        !body.contains('1'),
        "the source was supposed to hold no digit"
    );
    let lines = lines_of(body);
    assert!(
        lines.iter().any(|l| l.contains('1')),
        "no marker printed: {lines:?}"
    );
}

#[test]
fn a_notes_marker_stays_on_the_line_it_marks() {
    // A superscript sits on its own baseline, a few points above the line it
    // belongs to. Grouped by an exact baseline it would become a line of its
    // own — one page holding a line that says `1` and a line that says the
    // sentence, so a search for "שלום1" would find nothing on a page that
    // plainly shows it.
    let body = "שלום#הערה[ביאור] עולם";
    let lines = lines_of(body);
    assert!(
        lines.iter().any(|l| l.contains("שלום1")),
        "the marker was split from its word: {lines:?}"
    );
}

#[test]
fn the_words_come_back_in_reading_order() {
    // Hebrew is laid out right to left and the frame's items are in *logical*
    // order, so the walk needs no direction. Sorting by `x` — the obvious
    // implementation — reverses every Hebrew line, and the reversal is
    // invisible to any assertion that only counts hits.
    let lines = lines_of("אלף בית גימל");
    assert!(
        lines.iter().any(|l| l.contains("אלף בית גימל")),
        "the line came back out of order: {lines:?}"
    );
}

#[test]
fn an_english_line_reads_the_same_way() {
    // The other direction through the same code, and the reason the walk asks
    // no question about direction: a fix that sorted by `-x` for Hebrew would
    // break this and nothing else would notice.
    let mut cfg = DocConfig::default();
    cfg.dir = "ltr".into();
    let body = "alef beis gimel";
    let doc = compile_doc(body, &cfg).expect("the document lays out");
    let main = Source::detached(main_source(body, &cfg));
    let lines: Vec<String> = pagetext::page_text(&doc, &main, body)
        .into_iter()
        .flatten()
        .map(|l| l.text)
        .collect();
    assert!(
        lines.iter().any(|l| l.contains("alef beis gimel")),
        "the English line came back out of order: {lines:?}"
    );
}

#[test]
fn a_printed_line_says_which_line_of_the_source_it_came_from() {
    // What lets a hit on the page put the caret in the right sentence.
    let body = "אלף\n\nבית\n\nגימל";
    let found = pages_of(body)
        .into_iter()
        .flatten()
        .find(|l| l.text.contains("גימל"))
        .expect("the third paragraph printed");
    assert_eq!(found.line, Some(5), "the wrong source line was reported");
}

#[test]
fn a_running_foot_belongs_to_no_line_of_the_source() {
    // Ink the writer never typed, and the case that must **not** be given a
    // nearby line: naming one would put the caret in a sentence the reader was
    // not looking at, with total confidence.
    let mut cfg = DocConfig::default();
    cfg.footer = "קונטרס בעניני שבת".into();
    let body = "שלום";
    let doc = compile_doc(body, &cfg).expect("the document lays out");
    let main = Source::detached(main_source(body, &cfg));
    let pages = pagetext::page_text(&doc, &main, body);
    let running: Vec<&pagetext::PageLine> = pages
        .iter()
        .flatten()
        .filter(|l| !l.text.contains("שלום"))
        .collect();
    assert!(
        !running.is_empty(),
        "the footer printed nothing to ask about"
    );
    assert!(
        running.iter().all(|l| l.line.is_none()),
        "a running foot claimed a line of the writer's text: {:?}",
        running
            .iter()
            .map(|l| (&l.text, l.line))
            .collect::<Vec<_>>()
    );
}

#[test]
fn two_streams_side_by_side_are_two_lines_and_not_one() {
    // Parallel streams put two unrelated stretches of text at the same height.
    // Joined by baseline alone they would read as one sentence — a phrase that
    // never appeared on the page and that a search would then find, which is a
    // fabricated hit rather than a missing one.
    let body = concat!(
        "#הגדרות_זרמים(זרמים: (\"א\", \"ב\"))\n",
        "שלום#הערה(ערוץ: \"א\")[ראשון]#הערה(ערוץ: \"ב\")[שני]\n"
    );
    let lines = lines_of(body);
    assert!(
        !lines.iter().any(|l| l.contains("ראשוןשני")),
        "two streams were joined into one line: {lines:?}"
    );
}

#[test]
fn a_page_reports_only_its_own_lines() {
    // One entry per page, in page order, so a hit can name the page it is on.
    let body = "אלף\n\n#מעבר_עמוד\n\nבית";
    let pages = pages_of(body);
    assert_eq!(pages.len(), 2, "the break did not make a second page");
    let first: String = pages[0].iter().map(|l| l.text.as_str()).collect();
    let second: String = pages[1].iter().map(|l| l.text.as_str()).collect();
    assert!(first.contains("אלף") && !first.contains("בית"), "{first:?}");
    assert!(
        second.contains("בית") && !second.contains("אלף"),
        "{second:?}"
    );
}

#[test]
fn an_empty_line_is_not_reported() {
    // A page's furniture — a rule, a spacer, a frame with no glyphs — is not a
    // line the page says anything on, and a list of blank rows is a list a
    // reader has to scroll past to reach the answer.
    let pages = pages_of("אלף\n\n\n\nבית");
    assert!(
        pages.iter().flatten().all(|l| !l.text.trim().is_empty()),
        "a blank line was reported"
    );
}

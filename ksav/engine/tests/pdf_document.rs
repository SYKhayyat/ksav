//! What the PDF says about itself, as opposed to what is drawn on its pages.
//!
//! # The finding this file starts from, and it was wrong
//!
//! `NOTES-PLAN.md`'s document-level section says:
//!
//! > **The PDF right-to-left flag.** Ksav does not set it — nothing in `src/`
//! > sets viewer direction, so readers do not open two-page spreads the correct
//! > way. It is the difference between a PDF containing Hebrew and a sefer.
//! > **[U]** whether Typst's export exposes it or it needs post-processing.
//!
//! The premise is right — nothing in `src/` sets it — and the conclusion does
//! not follow. Typst 0.15 writes `/ViewerPreferences << /Direction /R2L >>`
//! itself, derived from **the document's language**, and Ksav's page setup has
//! set `lang: "he"` since it was written. So the flag has been correct the whole
//! time, for a reason nobody here chose, and the item was a hypothesis rather
//! than a finding.
//!
//! Which is exactly why this file exists rather than a line in a plan: the flag
//! is one byte in a PDF that nothing in this repository has ever looked at, so
//! the day Typst changes how it derives that, or a writer sets `שפה` to
//! something else, the sefer opens its spreads the wrong way round and every
//! test stays green. Now one does not.

use ksav_engine::{compile, DocConfig, Wants};

/// The exported PDF, for a document with nothing special in it.
fn pdf(cfg: &DocConfig) -> Vec<u8> {
    compile_pdf("שלום עולם\n", cfg)
}

fn compile_pdf(body: &str, cfg: &DocConfig) -> Vec<u8> {
    let out = compile(body, cfg);
    assert!(out.ok, "the document laid out: {:?}", out.diagnostics);
    out.pdf.expect("a PDF was asked for and produced")
}

/// Is this needle in the file? PDF is mostly binary, so the search is over
/// bytes rather than over a string that may not be valid UTF-8.
fn has(bytes: &[u8], needle: &str) -> bool {
    bytes.windows(needle.len()).any(|w| w == needle.as_bytes())
}

/// A Hebrew sefer opens its two-page spreads the way a Hebrew reader turns
/// pages.
#[test]
fn a_hebrew_document_is_marked_right_to_left_for_the_reader() {
    let bytes = pdf(&DocConfig::default());
    assert!(
        has(&bytes, "/Direction /R2L") || has(&bytes, "/Direction/R2L"),
        "the exported PDF does not tell the reader it is right-to-left, so a \
         two-page spread opens back to front"
    );
}

/// …and an English one is not, which is the half that proves the first is not a
/// constant.
#[test]
fn an_english_document_is_marked_left_to_right() {
    let cfg = DocConfig {
        dir: "ltr".into(),
        lang: "en".into(),
        ..Default::default()
    };
    let bytes = compile_pdf("hello world\n", &cfg);
    assert!(
        has(&bytes, "/Direction /L2R") || has(&bytes, "/Direction/L2R"),
        "an English document was exported as right-to-left"
    );
    assert!(
        !has(&bytes, "/R2L"),
        "an English document carries the right-to-left flag as well"
    );
}

/// A guard on the guard: the flag is not simply always present.
#[test]
fn the_wants_flag_still_governs_whether_a_pdf_is_made_at_all() {
    let out = ksav_engine::compile_parts(
        "שלום\n",
        &DocConfig::default(),
        &Default::default(),
        Wants {
            pdf: false,
            ..Default::default()
        },
        &Default::default(),
    );
    assert!(out.pdf.is_none(), "a PDF was made when none was asked for");
}

/// The continuous mode: one page, as tall as the sefer is.
///
/// `NOTES-PLAN`'s document-level section calls it free, and it is. **Overflow is
/// impossible by definition** when the page grows — a note that will not fit is
/// a sentence about a page bottom, and this has none — so the whole of thing
/// four turns itself off rather than being switched off: `_pg_text_bottom`
/// answers `none`, and both spill walks already read that as *no bottom*.
///
/// The document that proves it is `dense.ksav`, which is the one that reached
/// y=827.27 on an 841.89pt sheet before any of this and needs two pages with
/// spill. Continuous, it needs one.
#[test]
fn a_continuous_document_is_one_page_and_cannot_overflow() {
    let body = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/notes-corpus/dense.ksav"),
    )
    .expect("the corpus document is there");

    let paged = ksav_engine::probe::layout(&body, &DocConfig::default()).expect("it lays out");
    let flowing = ksav_engine::probe::layout(
        &body,
        &DocConfig {
            continuous: true,
            ..Default::default()
        },
    )
    .expect("it lays out continuously");

    let pages = |d: &_| ksav_engine::probe::page_sizes(d).len();
    assert!(
        pages(&paged) > 1,
        "the paged document fitted on one page, so this proves nothing"
    );
    assert_eq!(
        pages(&flowing),
        1,
        "a continuous document broke into pages, which is the one thing it does not do"
    );
    // …and it is *taller* than a sheet, which is what "the page grows" means.
    let (w, h) = ksav_engine::probe::page_sizes(&flowing)[0];
    assert!(
        h > 841.9,
        "the continuous page is {h:.2}pt tall — no taller than A4, so the height \
         is not growing"
    );
    // The width still comes from the paper: a continuous sefer is a column of a
    // stated width, not an infinite plane.
    assert!(
        (w - 595.28).abs() < 0.1,
        "the continuous page is {w:.2}pt wide, and A4 is 595.28"
    );
}

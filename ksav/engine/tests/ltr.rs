//! Rendered-output tests for left-to-right documents.
//!
//! Ksav is Hebrew-first, not Hebrew-only: `dir: "ltr"` has always been a setting.
//! But the direction was the *only* thing that followed it. The prelude pinned
//! `lang: "he"` for every document, and Typst drives three separate things off
//! `lang` — hyphenation patterns, the shape of smart quotes, and the wording of
//! headings it generates itself. So an English document came out with `”hello”`
//! (the closing mark on both sides: right for Hebrew, wrong for English), with no
//! hyphenation at all in justified text, and with a Hebrew table-of-contents
//! heading over its English entries.
//!
//! None of that shows up in a compile check — every one of those documents
//! compiled cleanly. These assertions read the laid-out page.

mod common;
use common::{render, text};

use ksav_engine::probe::{self, TextRun};
use ksav_engine::DocConfig;

fn cfg(dir: &str) -> DocConfig {
    DocConfig {
        dir: dir.to_string(),
        ..Default::default()
    }
}

fn render(body: &str, cfg: &DocConfig) -> Vec<TextRun> {
    let doc = probe::layout(body, cfg).unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::text_runs(&doc)
}

/// Everything on the page as one string, in layout order.

// ── quotation marks ──────────────────────────────────────────────────────────

#[test]
fn english_gets_english_quotation_marks() {
    let text = text(&render("He said \"hello\" and 'goodbye'.", &cfg("ltr")));
    assert!(
        text.contains('\u{201C}') && text.contains('\u{201D}'),
        "expected “…” around the English quotation, got: {text}"
    );
    assert!(
        text.contains('\u{2018}') && text.contains('\u{2019}'),
        "expected ‘…’ around the English single quotation, got: {text}"
    );
    // The regression itself: the *closing* mark used on both sides.
    assert!(
        !text.contains("\u{201D}hello"),
        "opening quote is still the closing mark: {text}"
    );
}

#[test]
fn hebrew_keeps_hebrew_quotation_marks() {
    // The Hebrew default must not move: it was never the thing that was wrong.
    let text = text(&render("אמר \"שלום\" ויצא.", &cfg("rtl")));
    assert!(
        text.contains('\u{201D}'),
        "Hebrew lost its quotation marks: {text}"
    );
    assert!(
        !text.contains('\u{201C}'),
        "Hebrew picked up the English opening quote: {text}"
    );
}

// ── hyphenation ──────────────────────────────────────────────────────────────

#[test]
fn justified_english_is_hyphenated() {
    // Justification without hyphenation is what produces the rivers of white
    // space down a narrow English column. Typst hyphenates from per-language
    // patterns, and there are none for Hebrew, so a document typeset as Hebrew
    // silently got none — the text still filled the line, just badly.
    let body = "The incomprehensibility of administrative responsibilities, \
                notwithstanding the counterrevolutionary establishmentarianism of \
                it all, remains extraordinarily disproportionate.";
    let text = text(&render(body, &cfg("ltr")));
    assert!(
        text.contains('\u{00AD}') || text.contains('-'),
        "no hyphenation in justified English: {text}"
    );
}

// ── generated headings ───────────────────────────────────────────────────────

#[test]
fn contents_heading_follows_the_document_language() {
    let english = text(&render("= A Chapter\n\n#תוכן()\n", &cfg("ltr")));
    assert!(
        english.contains("Contents"),
        "English document has no English contents heading: {english}"
    );
    assert!(
        !english.contains("תוכן העניינים"),
        "English document still carries the Hebrew contents heading: {english}"
    );

    let hebrew = text(&render("= פרק א\n\n#תוכן()\n", &cfg("rtl")));
    assert!(
        hebrew.contains("תוכן העניינים"),
        "Hebrew document lost its contents heading: {hebrew}"
    );
}

#[test]
fn an_explicit_contents_title_still_wins() {
    let text = text(&render(
        "= A Chapter\n\n#תוכן(כותרת: [Table of Contents])\n",
        &cfg("ltr"),
    ));
    assert!(
        text.contains("Table of Contents"),
        "explicit outline title was ignored: {text}"
    );
}

// ── the language override ────────────────────────────────────────────────────

#[test]
fn an_explicit_language_overrides_the_direction() {
    // Direction and language are not the same choice: Yiddish and Arabic are
    // right-to-left and are not Hebrew, and a left-to-right document is not
    // necessarily English. `lang` is what actually reaches Typst.
    let mut c = cfg("ltr");
    c.lang = "de".to_string();
    assert_eq!(ksav_engine::effective_lang(&c), "de");

    let text = text(&render("Er sagte \"hallo\".", &c));
    // German opens its quotation low — nothing else in Ksav produces that mark,
    // so its presence proves the tag reached the compiler.
    assert!(
        text.contains('\u{201E}'),
        "German document did not get German quotation marks: {text}"
    );
}

#[test]
fn an_impossible_language_tag_is_refused_not_forwarded() {
    // `lang` is formatted into the prelude as a string literal, exactly like
    // `paper` and `font`, so it gets the same treatment. But escaping alone is
    // not enough here: Typst rejects a tag of the wrong length outright and
    // fails the *whole compile* with "expected two or three letter language
    // code" — an error about code the writer never wrote. So a tag that cannot
    // work is dropped at the boundary, and the document falls back to its
    // direction's language and still renders.
    for hostile in [
        "en\"), page(fill: red",
        "english",
        "e",
        "",
        "12",
        "../../etc/passwd",
    ] {
        let c = DocConfig::from_json(&serde_json::json!({ "dir": "ltr", "lang": hostile }));
        assert_eq!(
            c.lang, "",
            "{hostile:?} survived sanitising as {:?}",
            c.lang
        );
        assert_eq!(ksav_engine::effective_lang(&c), "en");
        let text = text(&render("Hello.", &c));
        assert!(text.contains("Hello"), "{hostile:?} broke the document");
    }
    // A region subtag is legitimate and keeps its language rather than being
    // thrown away with it.
    let c = DocConfig::from_json(&serde_json::json!({ "lang": "pt-BR" }));
    assert_eq!(c.lang, "pt");
}

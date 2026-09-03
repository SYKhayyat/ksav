//! How a native footnote entry behaves when it is taller than the page foot.
//!
//! A footnote that cannot fit on its page is split by Typst onto the next page.
//! The old claim of this file was that a spilling note carries a `המשך`
//! continuation marker at the top of its next-page share. That marker was drawn
//! by wrapping every entry in a `table` with a repeating header that compared
//! `here().page()` against the note's own page — and the wrapper orphaned every
//! entry number onto its own line, and the page introspection it made the
//! counter depend on did not converge for a note nested five tiers deep
//! (`layered_tiered_footnotes`). Typst has no native continuation hook for a
//! footnote entry, so the marker cannot be drawn without that wrapper. What a
//! spilling note *does* guarantee is that every word prints, exactly once,
//! spread across the pages it touches — which is what these tests pin.

use ksav_engine::{probe, DocConfig};

fn giant_body(n: usize) -> String {
    (0..n)
        .map(|i| format!("משכ{i:03}"))
        .collect::<Vec<_>>()
        .join(" ")
}

#[test]
fn a_giant_footnote_spills_and_prints_every_word_once() {
    let body = format!(
        "#שער[מינימלי]\n\n#כותרת1[פרק א]\n\nגוף קצר עם הערה ענקית#הערה[{}] וסוף הפסקה.\n\n#כותרת1[פרק ב]\n\nגוף נוסף.\n",
        giant_body(700)
    );
    let doc = probe::layout(&body, &DocConfig::default()).expect("compile ok");
    let runs = probe::text_runs(&doc);
    assert!(
        doc.pages().len() >= 2,
        "giant note should spill to 2 pages, got {}",
        doc.pages().len()
    );
    let printed: String = runs.iter().map(|r| r.text.as_str()).collect();
    for i in 0..700usize {
        let word = format!("משכ{i:03}");
        assert_eq!(
            printed.matches(&word).count(),
            1,
            "word {word} printed a number of times other than once"
        );
    }
    assert!(
        runs.iter().any(|r| r.page == 2 && r.text.contains("משכ")),
        "no spill words reached page 2"
    );
}

#[test]
fn a_short_footnote_stays_on_one_page() {
    let body = "גוף קצר#הערה[קצרה] וסוף.";
    let doc = probe::layout(body, &DocConfig::default()).expect("compile ok");
    assert_eq!(doc.pages().len(), 1, "a short note must not spill");
}

//! The knee, and the primitive underneath it.
//!
//! `ברך` — a knee — is the step where a block indents around its neighbour and
//! the text carries on underneath it: the shape of a Vilna daf, where the
//! peirush runs beside the gemara and then continues full width below. The trade
//! has a word for it and `NOTES-PLAN` borrowed "L-shape" and "Vilna wrap" from
//! English tooling instead.
//!
//! # The ❌ it is answering
//!
//! The sefer-engine survey scores Typst ❌ on this, citing Typst's own creator:
//! regions in a sequence must share a width, and regions can only be
//! rectangular. That is **right about the mechanism and wrong as a limit on the
//! page**, because the knee does not need flow — it needs to know where the
//! column runs out, and `measure` answers that exactly.
//!
//! So the ❌ stands for "Typst will not flow this for you" and falls for "this
//! cannot be typeset". The distinction matters because the first is a fact and
//! the second was being treated as one.
//!
//! # And it is the same function as note splitting
//!
//! `_ct_fit` is `fitPrefix(content, width, height) -> (head, tail)`. Applied
//! across a page break it carries the overflow of a note; applied across a
//! corner it is this. They looked like two problems for a long time.

use ksav_engine::{probe, DocConfig};

fn laid(body: &str) -> Vec<probe::TextRun> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// Fifty numbered words beside a neighbour of a stated depth.
fn knee(width: &str) -> Vec<probe::TextRun> {
    let words: Vec<String> = (1..=50).map(|i| format!("מילה{i:03}")).collect();
    let gemara = "גמרא. ".repeat(20);
    laid(&format!(
        "#ברך(\n  \"{}\",\n  [{}],\n  רוחב: {width},\n)\n",
        words.join(" "),
        gemara
    ))
}

/// Every word arrives, once.
///
/// The failure this is really about is a cut that loses what it could not
/// divide, or repeats the seam. Both are silent on the page — a missing word in
/// the middle of a peirush reads as a peirush.
#[test]
fn a_knee_loses_no_words_and_repeats_none() {
    let runs = knee("35%");
    let all: String = runs.iter().map(|r| r.text.clone()).collect();
    for i in 1..=50 {
        let w = format!("מילה{i:03}");
        let n = all.matches(&w).count();
        assert_eq!(n, 1, "{w} appears {n} times, and should appear once");
    }
}

/// The text is continuous across the corner: what is beside the neighbour comes
/// before what is under it, in the order it was written.
#[test]
fn the_text_carries_on_under_the_neighbour() {
    let runs = knee("35%");
    // Lines, not runs. A word can be split across shaping boundaries — the
    // sister test passes because it concatenates everything — so asking a single
    // run whether it contains a word is asking where Typst happened to break.
    let lines = probe::lines(&runs, 1.0);
    let y_of = |w: &str| {
        lines
            .iter()
            .find(|l| l.contains(w))
            .unwrap_or_else(|| panic!("{w} printed nowhere"))
            .y
    };
    assert!(
        y_of("מילה001") < y_of("מילה050"),
        "the tail printed above the head"
    );
    // The neighbour is beside the head and above the tail, which is what makes
    // this a knee rather than two stacked blocks.
    let gem = lines
        .iter()
        .find(|l| l.contains("גמרא"))
        .expect("the neighbour printed nowhere");
    assert!(
        (gem.y - y_of("מילה001")).abs() < 2.0,
        "the neighbour starts at y={} and the column at y={} — they are not level",
        gem.y,
        y_of("מילה001")
    );
    assert!(
        y_of("מילה050") > gem.y,
        "the tail did not carry on below the neighbour"
    );
}

/// A narrower column knees earlier, which is the whole of what "computed" means.
///
/// If the split were a constant this would not move, and a constant is what the
/// prior art uses: "~45–50 Hebrew characters per line", "lines ≈ height / 13.5".
#[test]
fn a_narrower_column_runs_out_sooner() {
    let last_beside = |width: &str| {
        let runs = knee(width);
        let top = runs
            .iter()
            .filter(|r| r.text.contains("מילה"))
            .map(|r| r.y)
            .fold(f64::MAX, f64::min);
        // The words on the first line of the column, which is the widest
        // evidence of how much fitted beside the neighbour.
        let first: String = runs
            .iter()
            .filter(|r| (r.y - top).abs() < 1.0)
            .map(|r| r.text.clone())
            .collect();
        (1..=50)
            .filter(|i| first.contains(&format!("מילה{i:03}")))
            .count()
    };
    let narrow = last_beside("25%");
    let wide = last_beside("45%");
    assert!(
        wide > narrow,
        "a 45% column fitted {wide} words on its first line and a 25% one {narrow} \
         — the split is not being computed"
    );
}

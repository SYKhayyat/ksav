//! #79 — a stream in the **page body**, beside the text.
//!
//! The issue asked one question — *can a stream occupy the page body rather than
//! the read-only footer?* — and warned that the answer would be expensive, since
//! a body stream is a separate layout of the same source and the editor is 59ms
//! from a keystroke.
//!
//! Measured on identical words, the premise inverted: the **body shape is the
//! cheaper one**, by ~4.7×, because the page foot rebuilds the notes apparatus
//! on every page and a band has none. What it does need is the page divided
//! *before* the body is laid out, which is why this is an engine feature rather
//! than a prelude one: the sheet has to be cut so that the text gets the writing
//! width minus the band and the band gets its own document.
//!
//! # What these hold
//!
//! 1. The band's entries are on the same sheet as the text, **beside** it — same
//!    page, different band, no overlap. A band that printed over the body would
//!    still print every word, so an assertion on presence alone would pass it.
//! 2. The band holds its column on every page it reaches (#77's requirement, now
//!    asked of a band rather than of the foot arrangement).
//! 3. The text keeps its own margins and is narrowed by exactly the band — the
//!    body's pagination is a function of the body, so a longer commentary cannot
//!    move a line of text.
//! 4. The numbering agrees: the marker in the text and the number at the head of
//!    the band's entry are the same sequence, which is the property that makes a
//!    band legible at all. It holds by construction — the band is the same
//!    document read a second time — and by a fence, because "true by construction
//!    today" is the sentence that precedes a silent regression.
//! 5. The band continues onto its own page 2, beside the body's page 2. That is
//!    the whole of #77 and #79 in one assertion, and it is the one that cannot
//!    be had from a region: a second band that re-fills per page would put both
//!    bands' entries on whichever page had room.
//! 6. A band that runs dry simply stops, and the body's later pages are
//!    untouched.
//! 7. A band that outlasts the body keeps its pages, on sheets of its own. The
//!    alternative — dropping them — loses a writer's text to silence, which is
//!    the fault this repository is named for.
//! 8. What is refused: a body stream with no width, a band that cannot be read,
//!    and bands that would leave the text nowhere to be. Each of those used to
//!    be a plausible-looking page.

mod common;

use common::{render, render_with, text};
use ksav_engine::probe::{self, TextRun};

/// A stream in the body, beside the text: the arrangement the issue is about.
const BODY: &str = "#ערוץ(\"מקורות\", מיקום: \"גוף\", רוחב: 30%)";

/// The band's width as a share of the writing width, which is what `30%` is
/// resolved against.
const BAND_SHARE: f64 = 0.3;

/// One Hebrew letter on its own: how the per-stream numbering is set.
///
/// A run is compared rather than a line because the number is its own run — the
/// apparatus prints it separately, at a smaller size — which is the same shape
/// `stream_content.rs` had to learn to read.
fn hebrew_letter(text: &str) -> bool {
    let mut chars = text.chars();
    matches!(chars.next(), Some(c) if chars.next().is_none() && ('\u{05d0}'..='\u{05ea}').contains(&c))
}

/// A paragraph of body text long enough to push the anchors onto fresh pages.
fn filler() -> &'static str {
    "משפט בגוף המאמר עם מילים רבות כדי שימלא שורות ויעבור עמודים.\n\n"
}

/// One entry's prose.
///
/// The band is narrow — 30% of a 16cm writing width is 4.8cm, a line or two of
/// commentary — so an entry has to be long before the *band* is more than a
/// page. Four paragraphs is the smallest that puts six of them over three band
/// pages, which is what the "continues" assertions need to see: a band of one
/// page cannot tell continuing from starting over.
fn entry(i: usize) -> String {
    let para = "פסקה ארוכה בהערה, עם מילים רבות מאוד כדי שהטור הצר יתמלא בעין יפה ונראה האם הוא זורם לדף הבא בצד שבו הוא צריך להיות, ואם הוא ממשיך מאותה הנקודה ולא מתחיל מחדש בעמוד הבא.";
    format!("#הערה_זרם(\"מקורות\")[מקורות־{i} · {para}\n\n{para}\n\n{para}\n\n{para}]\n\n")
}

/// A document with one body stream and entries spread over several pages.
fn fixture() -> String {
    let mut doc = format!("{BODY}\n#כותרת1[מדידה]\n\n");
    doc.push_str(&filler().repeat(20));
    for i in 1..=6 {
        doc.push_str(&entry(i));
        doc.push_str(&filler().repeat(14));
    }
    doc
}

/// Everything the band's entries said, in layout order.
fn band_runs<'a>(runs: &'a [TextRun], needle: &str) -> Vec<&'a TextRun> {
    runs.iter().filter(|r| r.text.contains(needle)).collect()
}

/// Everything the band did not: the body.
fn body_runs<'a>(runs: &'a [TextRun], needle: &str) -> Vec<&'a TextRun> {
    runs.iter().filter(|r| r.text.contains(needle)).collect()
}

/// The band's entries are on the sheet beside the text, and not over it.
///
/// The band is at the **end** edge of a right-to-left page — the left, after the
/// text — so its runs are to the left of every body run on the same page. A band
/// that printed over the body would still print every word, which is why this is
/// asked per page rather than of the document.
#[test]
fn the_band_prints_beside_the_text_not_over_it() {
    let runs = render(&fixture());
    let pages: Vec<usize> = {
        let mut p: Vec<usize> = runs.iter().map(|r| r.page).collect();
        p.sort_unstable();
        p.dedup();
        p
    };
    let mut compared = 0;
    for page in pages {
        let mut band: Vec<&TextRun> = band_runs(&runs, "מקורות־")
            .into_iter()
            .filter(|r| r.page == page)
            .collect();
        let mut body: Vec<&TextRun> = body_runs(&runs, "משפט בגוף")
            .into_iter()
            .filter(|r| r.page == page)
            .collect();
        // Filtered to the page **first**, then asked whether there is anything:
        // the other order asks whether the *document* has a band, which every
        // page of it does, and then folds an empty iterator.
        if band.is_empty() || body.is_empty() {
            continue;
        }
        compared += 1;
        let (b_lo, b_hi) = bounds(band.drain(..));
        let (t_lo, t_hi) = bounds(body.drain(..));
        assert!(
            b_hi < t_lo,
            "on page {page} the band [{b_lo:.1}, {b_hi:.1}] reaches into the text \
             [{t_lo:.1}, {t_hi:.1}] — a band over the body still prints every word"
        );
    }
    assert!(
        compared >= 3,
        "only {compared} page(s) carried both columns"
    );
}

fn bounds<'a>(runs: impl Iterator<Item = &'a TextRun>) -> (f64, f64) {
    // A fold over an empty iterator answers `(MAX, MIN)`, which is a number that
    // looks like a measurement and is not. An empty column here means the
    // fixture has nothing to say about that column, and asserting on it anyway
    // is how a fence comes to pass on a document with no band in it.
    let runs: Vec<&TextRun> = runs.collect();
    assert!(
        !runs.is_empty(),
        "no runs to measure — the fixture is empty"
    );
    runs.iter().fold((f64::MAX, f64::MIN), |(lo, hi), r| {
        (lo.min(r.x), hi.max(r.x + r.width))
    })
}

/// The band's column, page by page, and whether it held.
///
/// The column edge rather than a line's left edge, for the reason
/// `parallel_streams.rs` gives: the apparatus is right-aligned, so a wrapped
/// entry moves where its line ends and not where its column starts.
#[test]
fn the_band_holds_its_column_on_every_page_it_reaches() {
    let runs = render(&fixture());
    let mut per_page: Vec<(usize, f64)> = Vec::new();
    for run in band_runs(&runs, "מקורות־") {
        match per_page.iter_mut().find(|(p, _)| *p == run.page) {
            Some(slot) => slot.1 = slot.1.max(run.x + run.width),
            None => per_page.push((run.page, run.x + run.width)),
        }
    }
    assert!(
        per_page.len() >= 3,
        "the band reached only {} page(s): {per_page:?}",
        per_page.len()
    );
    let lo = per_page.iter().map(|(_, x)| *x).fold(f64::MAX, f64::min);
    let hi = per_page.iter().map(|(_, x)| *x).fold(f64::MIN, f64::max);
    // **Measured, not wished:** the spread over five pages is 1.2pt, and what
    // varies is the entry head — a letter's glyph is a different width from its
    // neighbour's, so the rightmost ink on a page is not always at the column's
    // edge. A column that *moved* is a centimetre, not a point.
    assert!(
        hi - lo <= 3.0,
        "the band moved {:.1}pt across its pages — it did not continue in the same \
         position on the next page: {per_page:?}",
        hi - lo
    );
}

/// The body is narrowed by exactly the band, and keeps its own margins.
///
/// A percentage is of the **writing width** the sheet would have had with no
/// bands — the paper less the two side margins — so the text column is the rest,
/// and its own margins are unchanged. A band that took its width out of the
/// margin instead would leave the text in the same place and print the band over
/// the paper's edge.
#[test]
fn the_body_keeps_its_measure_minus_the_band() {
    // One entry, so the band has something to be measured by; the rest of the
    // document is ordinary prose.
    let doc = format!(
        "{BODY}\n#כותרת1[מדידה]\n\n{}\n{}\n",
        filler().repeat(6),
        entry(1)
    );
    let with = probe::layout(&doc, &ksav_engine::DocConfig::default()).expect("compiles");
    let page_w = probe::page_sizes(&with)[0].0;
    let (band_hi, text_lo) = {
        let runs = &probe::text_runs(&with);
        let band = bounds(band_runs(runs, "מקורות־").into_iter());
        let body = bounds(body_runs(runs, "משפט בגוף").into_iter());
        (band.1, body.0)
    };
    // The band's own text starts at the sheet's margin, and the body's starts
    // after the band plus its own margin — so the two columns are separated by
    // a margin on each side, which is what "beside" means on a printed page.
    assert!(
        text_lo > band_hi,
        "the body starts at {text_lo:.1}, inside the band which ends at {band_hi:.1}"
    );
    // The band is the share that was asked for: 30% of the writing width, and
    // the writing width is the sheet less the two side margins.
    let cfg = ksav_engine::DocConfig::default();
    let writing = page_w - 2.0 * cfg.margin_cm * 28.3465;
    let band_w = band_hi - cfg.margin_cm * 28.3465;
    assert!(
        (band_w / writing - BAND_SHARE).abs() < 0.02,
        "the band is {band_w:.1}pt of a {writing:.1}pt writing width — {}%, not {}%",
        100.0 * band_w / writing,
        100.0 * BAND_SHARE
    );
}

/// The band continues onto its own page, beside the body's.
///
/// The property #79 was opened for, and the one a re-filling apparatus cannot
/// give: page 2 of the band is beside page 2 of the body, so the commentary
/// resumes where it left off rather than collecting whatever the foot had room
/// for.
#[test]
fn the_band_continues_onto_the_next_page() {
    let runs = render(&fixture());
    let mut per_page: Vec<usize> = band_runs(&runs, "מקורות־").iter().map(|r| r.page).collect();
    per_page.sort_unstable();
    per_page.dedup();
    assert!(
        per_page.len() >= 3,
        "the band reached only {} page(s) — this fixture cannot see it continue",
        per_page.len()
    );
    // Every page the band reached is a page the body also filled: a band page
    // with no text beside it would be a page the writer did not ask for.
    let body_pages: Vec<usize> = body_runs(&runs, "משפט בגוף")
        .iter()
        .map(|r| r.page)
        .collect();
    for page in &per_page {
        assert!(
            body_pages.contains(page),
            "page {page} carries band entries with no body text beside them"
        );
    }
}

/// The numbering agrees: the marker in the text and the band's own entry.
///
/// By construction the two are one sequence — the band is the same document read
/// a second time — and by fence, because a band that renumbered itself from one
/// would put a marker in the text pointing at the wrong entry, with nothing
/// anywhere saying so. The marker in the text is the visible artifact, so that
/// is what is compared: a body marker headed by anything other than the same
/// glyph as the band's entry is a reader sent to the wrong place.
#[test]
fn the_marker_and_the_entry_agree() {
    let runs = render(&fixture());
    // The two columns are told apart by where they start, not by what they say:
    // the band is 30% of the writing width and sits at the end edge, so its runs
    // are left of the boundary and the body's are right of it. A document whose
    // text is too short to reach the boundary would be a fixture problem, not a
    // product one — hence the assertion that both columns were actually seen.
    let cfg = ksav_engine::DocConfig::default();
    let page_w = probe::page_sizes(&probe::layout(&fixture(), &cfg).expect("compiles"))[0].0;
    let margin = cfg.margin_cm * 28.3465;
    let boundary = margin + BAND_SHARE * (page_w - 2.0 * margin);
    let heads: Vec<String> = runs
        .iter()
        .filter(|r| r.x < boundary && hebrew_letter(&r.text))
        .map(|r| r.text.clone())
        .collect();
    let markers: Vec<String> = runs
        .iter()
        .filter(|r| r.x > boundary && hebrew_letter(&r.text))
        .map(|r| r.text.clone())
        .collect();
    assert_eq!(heads.len(), 6, "the band headed {heads:?}");
    assert_eq!(markers.len(), 6, "the body marked {markers:?}");
    assert_eq!(
        heads, markers,
        "the band's entry heads and the body's markers are different sequences"
    );
    // …and the sequence is the per-stream one, not a restart: a band that
    // numbered itself from one would print `1` over an entry whose marker in the
    // text says `א`.
    assert_eq!(heads, vec!["א", "ב", "ג", "ד", "ה", "ו"]);
}

/// A band that runs dry before the text does leaves the body alone.
#[test]
fn a_band_that_runs_out_leaves_the_body_alone() {
    let mut doc = format!("{BODY}\n#כותרת1[מדידה]\n\n");
    doc.push_str(&filler().repeat(20));
    doc.push_str("#הערה_זרם(\"מקורות\")[מקורות־יחיד]\n\n");
    doc.push_str(&filler().repeat(60));
    let runs = render(&doc);
    let bands = band_runs(&runs, "מקורות־יחיד");
    let bodies = body_runs(&runs, "משפט בגוף");
    let band_pages: Vec<usize> = bands.iter().map(|r| r.page).collect();
    let last_body = bodies.iter().map(|r| r.page).max().expect("a body page");
    // The band stopped, and the body kept going.
    assert!(
        !bands.is_empty() && *band_pages.iter().max().unwrap() < last_body,
        "the band carries {} runs on pages {band_pages:?} against a body of {last_body} pages",
        bands.len()
    );
    // And the body's own width did not change: the band is gone, the writing
    // width it took is not returned.
    let (_, text_hi) = bounds(bodies.iter().copied());
    let page_w = probe::page_sizes(
        &probe::layout(&doc, &ksav_engine::DocConfig::default()).expect("compiles"),
    )[0]
    .0;
    assert!(
        text_hi < page_w,
        "text ran to {text_hi:.1} of a {page_w:.1}pt sheet"
    );
}

/// A document with no body stream is laid out exactly as it was.
///
/// The guard that matters most: the compositor is a no-op for every document that
/// does not ask for a band, and this is the assertion that keeps it one.
#[test]
fn a_document_with_no_body_stream_is_untouched() {
    let plain = "#כותרת1[מדידה]\n\nפסקה בגוף.\n\n#הערה_זרם(\"מקורות\")[הערה רגילה]";
    let runs = render(plain);
    assert!(text(&runs).contains("פסקה בגוף"));
    assert!(text(&runs).contains("הערה רגילה"));
}

/// A body stream with no width says where its notes print and not how wide the
/// column is, which the engine has to know **before** it lays the text out.
#[test]
fn a_body_stream_with_no_width_is_refused() {
    let doc = "#ערוץ(\"מקורות\", מיקום: \"גוף\")\n\nטקסט.\n\n#הערה_זרם(\"מקורות\")[הערה]";
    let err = probe::layout(doc, &ksav_engine::DocConfig::default()).expect_err("refused");
    assert!(
        err.iter().any(|d| d.message.contains("רוחב")),
        "the refusal must name the knob it is about: {err:?}"
    );
}

/// A width nobody can read is refused rather than defaulted.
///
/// The two failures are opposites and both bad: a band that took a share nobody
/// asked for, and a band that left the body narrower than it needs to be. So
/// the reader is told, and told which value it could not read.
#[test]
fn a_width_that_is_neither_a_length_nor_a_share_is_refused() {
    let doc =
        "#ערוץ(\"מקורות\", מיקום: \"גוף\", רוחב: אופקה)\n\nטקסט.\n\n#הערה_זרם(\"מקורות\")[הערה]";
    let err = probe::layout(doc, &ksav_engine::DocConfig::default()).expect_err("refused");
    assert!(
        err.iter().any(|d| d.message.contains("אופקה")),
        "the refusal must quote the value it could not read: {err:?}"
    );
}

/// Bands that would leave the text nowhere to be are refused.
#[test]
fn bands_wider_than_the_text_are_refused() {
    let doc = "#ערוץ(\"א\", מיקום: \"גוף\", רוחב: 60%)\n#ערוץ(\"ב\", מיקום: \"גוף\", רוחב: 60%)\n\nטקסט.\n\n#הערה_זרם(\"א\")[הערה א]\n\n#הערה_זרם(\"ב\")[הערה ב]";
    let err = probe::layout(doc, &ksav_engine::DocConfig::default()).expect_err("refused");
    assert!(
        err.iter().any(|d| d.message.contains("text area")),
        "the refusal must say the text had nowhere to be: {err:?}"
    );
}

/// Two bands, each with its own column, both beside the text.
///
/// One band is the shape the issue describes; two is what "a writer names a
/// channel and puts it on an edge" (`_ch_places`) is for, and it is where the
/// offsets are: the first declared is beside the text, the second outside it,
/// and the two must not be on top of one another.
#[test]
fn two_bands_each_hold_their_own_column() {
    let mut doc =
        String::from("#ערוץ(\"מקורות\", מיקום: \"גוף\", רוחב: 25%)\n#ערוץ(\"ביאור\", מיקום: \"גוף\", רוחב: 25%)\n\n");
    doc.push_str(&filler().repeat(30));
    for i in 1..=4 {
        doc.push_str(&format!("#הערה_זרם(\"מקורות\")[מקורות־{i} · {p}]\n\n", p = "פסקה ארוכה בהערה, עם מילים רבות מאוד כדי שהטור הצר יתמלא בעין יפה ונראה האם הוא זורם לדף הבא.".repeat(6)));
        doc.push_str(&format!("#הערה_זרם(\"ביאור\")[ביאור־{i} · {p}]\n\n", p = "פסקה ארוכה בביאור, עם מילים רבות מאוד כדי שהטור הצר יתמלא בעין יפה ונראה האם הוא זורם לדף הבא.".repeat(6)));
    }
    let runs = render(&doc);
    let (a, b) = (
        bounds(band_runs(&runs, "מקורות־").into_iter()),
        bounds(band_runs(&runs, "ביאור־").into_iter()),
    );
    assert!(
        a.0 > b.1,
        "the first band [{:.1}, {:.1}] and the second [{:.1}, {:.1}] overlap or are the \
         wrong way round — the stream declared first is the one beside the text",
        a.0,
        a.1,
        b.0,
        b.1
    );
    let body = bounds(body_runs(&runs, "משפט בגוף").into_iter());
    assert!(
        body.0 > a.0,
        "the text is not clear of the bands: {body:?} vs {a:?}"
    );
}

/// The band follows the document's direction.
///
/// Every branch of the compositor is either "the body is on the right" or "the
/// body is on the left", and an English sefer is the other one. `browserlang`
/// cannot see this one — it reads the interface, not the page.
#[test]
fn the_band_follows_the_documents_direction() {
    let mut doc = format!("{BODY}\n#כותרת1[מדידה]\n\n");
    doc.push_str(&filler().repeat(30));
    for i in 1..=4 {
        doc.push_str(&entry(i));
        doc.push_str(&filler().repeat(14));
    }
    // The direction comes from the engine's configuration, which is where the
    // application sets it — not from a `#מסמך` line in the fixture. Two reasons,
    // and the second is the one that costs the session: `inject_reserve_…`
    // rewrites a writer's own `#מסמך` call, and doing that to a fixture while
    // measuring the page layout put a byte offset inside a Hebrew character.
    let cfg = ksav_engine::DocConfig {
        dir: "ltr".to_string(),
        ..Default::default()
    };
    let runs = render_with(&doc, &cfg);
    let band = bounds(band_runs(&runs, "מקורות־").into_iter());
    let body = bounds(body_runs(&runs, "משפט בגוף").into_iter());
    assert!(
        body.1 < band.1,
        "in a left-to-right document the band is right of the text, and it is not: \
         band {band:?}, text {body:?}"
    );
}

/// A band that outlasts the body keeps its pages, on sheets of its own.
///
/// Dropping them would lose a writer's text to silence, which is the fault this
/// repository is named for; refusing would stop a sefer compiling because its
/// commentary ran long. So the sheet count is the larger of the two and the
/// trailing sheets carry the band alone.
#[test]
fn a_band_that_outlasts_the_body_keeps_its_pages() {
    let mut doc = format!("{BODY}\n#כותרת1[מדידה]\n\n");
    doc.push_str(&filler().repeat(4));
    for i in 1..=24 {
        doc.push_str(&entry(i));
    }
    let runs = render(&doc);
    let band_last = band_runs(&runs, "מקורות־")
        .iter()
        .map(|r| r.page)
        .max()
        .expect("the band printed something");
    let body_last = body_runs(&runs, "משפט בגוף")
        .iter()
        .map(|r| r.page)
        .max()
        .expect("the body printed something");
    assert!(
        band_last > body_last,
        "the band ended at page {band_last} and the body at {body_last} — this fixture \
         cannot see a band that outlasts its text"
    );
    // And the pages past the body's end carry the band and nothing else, which is
    // what a sheet with no text on it is.
    for page in (body_last + 1)..=band_last {
        assert!(
            !body_runs(&runs, "משפט בגוף").iter().any(|r| r.page == page),
            "page {page} is past the body's end and carries body text"
        );
    }
}

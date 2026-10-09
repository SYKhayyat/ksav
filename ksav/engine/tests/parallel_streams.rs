//! #77 — n independent flows, each continuing into the same position on the
//! next page.
//!
//! The issue asked for exactly one capability:
//!
//! > *"n independent flows on a page, each continuing into the same position on
//! > the next page."*
//!
//! A printed Vilna page is that: Rashi runs in the inner column and Tosafot in
//! the outer, each attached to lines of the text, each resuming **in the same
//! place** on the following page.
//!
//! # What the measurement settled, and what this file holds
//!
//! The capability is delivered by `#הגדרות_זרמים(פריסה: "צד")` — a column per
//! stream, side by side — and it was **measured** before it was believed: two
//! streams, 60 entries each, over seven pages, with each stream's x recorded on
//! every page. Every stream held its column on every page while its content
//! flowed through it, which is the requirement in #77 rather than a weaker
//! cousin of it.
//!
//! What was never fenced is the thing that measurement established: a column
//! held across a page boundary. `parallel_streams_number_independently_and_
//! share_the_page` (in `apparatus.rs`) asks whether two streams share a baseline
//! **on one page**, and a stream that reset its column on every page break —
//! or a second stream that arrived in the first one's band — would pass it.
//! That is not a hypothetical shape: the footer apparatus refills per page, so
//! "held on the page it was measured on" is its own behaviour and not evidence
//! about the next page.
//!
//! # The three properties, and why each needs an assertion
//!
//! 1. **Each stream keeps its column on every page.** `column_of` collects the
//!    x of a stream's entries page by page; the spread is the claim. The
//!    tolerance is a drift, not a wish — a wrapped line ends at a different
//!    left edge than a short one, so the numbers are not bit-identical, and the
//!    measured seven-page spread was 2.6pt. A stream that moved a centimetre
//!    per page break fails; a stream that re-justifies its text does not.
//! 2. **The two flows do not share a column.** Independence means the second
//!    stream's entries never land in the first one's band, on any page. Without
//!    this, two "independent" streams printing over each other would still look
//!    like one flow in the wrong width.
//! 3. **Both flows actually continue.** A stream whose entries stop at the page
//!    its first anchor landed on is not continuing, and a fixture that only
//!    reaches one page cannot see the difference between that and the feature.

mod common;

use common::render;
use ksav_engine::probe::TextRun;

/// Two streams side by side — the arrangement #77 was measured with, and the
/// one the note chooser writes for *parallel streams*.
const HEAD: &str = "#הגדרות_זרמים(פריסה: \"צד\", זרמים: (\"תוכן\", \"מקורות\"))";

/// Where a column may drift, in points.
///
/// **Measured, not wished:** the column edge is exact to under 0.5pt over this
/// fixture (the assertion was run at 0.5 to find that out, and it is why the
/// number is 1 and not 10). What the allowance is *for* is a rounding at the
/// grid's own fraction, not a tolerance for a column that moves.
const COLUMN_TOLERANCE_PT: f64 = 1.0;

/// How far apart two side-by-side columns have to be to be two columns.
///
/// Half the text width on A4 with the default margins is well over 200pt, so
/// this is not a narrow margin: it is the difference between *beside* and
/// *on top of*.
const COLUMN_SEPARATION_PT: f64 = 100.0;

/// A paragraph of body text long enough to push the anchors onto fresh pages.
fn filler() -> &'static str {
    "משפט בגוף המאמר עם מילים רבות כדי שימלא שורות ויעבור עמודים.\n\n"
}

/// The document: two streams, entries anchored at roughly a page apart, each
/// entry naming the stream it belongs to and the order it was written in.
///
/// The anchors are deliberately **uneven**. Both streams have entries on some
/// pages, only one of them on others, and that is the half of the requirement
/// worth fencing: a stream whose neighbour has nothing to say on this page must
/// still hold the column it held on the page before. A fixture where the two
/// streams always arrive together cannot see the difference, because nothing
/// ever re-decides where a column starts — and the footnote apparatus *does*
/// re-decide it per page, from whatever each stream happens to have.
fn fixture() -> String {
    let mut doc = String::from(HEAD);
    doc.push('\n');
    // Enough body before the first anchor that the first page is genuinely
    // full, which is what makes "page 1's column" a measurement rather than a
    // layout default.
    doc.push_str(&filler().repeat(20));
    // Both streams on one page.
    doc.push_str("#הערה_זרם(\"תוכן\")[תוכן־1]\n\n");
    doc.push_str("#הערה_זרם(\"מקורות\")[מקורות־1]\n\n");
    doc.push_str(&filler().repeat(12));
    // תוכן alone — the page where its neighbour is silent.
    doc.push_str("#הערה_זרם(\"תוכן\")[תוכן־2]\n\n");
    doc.push_str(&filler().repeat(12));
    // …and the mirror image, so one stream being early is not the variable.
    doc.push_str("#הערה_זרם(\"מקורות\")[מקורות־2]\n\n");
    doc.push_str(&filler().repeat(12));
    // Together again, and again, so a column held by luck on one page is not
    // the evidence.
    for i in 3..=4 {
        doc.push_str(&format!("#הערה_זרם(\"תוכן\")[תוכן־{i}]\n\n"));
        doc.push_str(&format!("#הערה_זרם(\"מקורות\")[מקורות־{i}]\n\n"));
        doc.push_str(&filler().repeat(12));
    }
    doc
}

/// Every run of body text belonging to one stream, in the order it printed.
fn entries<'a>(runs: &'a [TextRun], stream: &str) -> Vec<&'a TextRun> {
    runs.iter().filter(|r| r.text.contains(stream)).collect()
}

/// The pages a stream reached, and the column edge it held on each.
///
/// The **edge**, not the left edge of one line. The apparatus is right-aligned
/// in a right-to-left document (`ksav.typ:5806`), so every line in a column
/// shares the column's right edge whatever it wraps to — which makes this the
/// measurement of *where the column is* rather than of how long one note
/// happened to be. The left edge moves when a note wraps; the edge does not,
/// and a fence that cannot tell those apart is a fence that fails on a longer
/// footnote.
fn column_of(runs: &[TextRun], stream: &str) -> Vec<(usize, f64)> {
    let mut per_page: Vec<(usize, f64)> = Vec::new();
    for run in entries(runs, stream) {
        match per_page.iter_mut().find(|(p, _)| *p == run.page) {
            Some(slot) => slot.1 = slot.1.max(run.x + run.width),
            None => per_page.push((run.page, run.x + run.width)),
        }
    }
    per_page
}

/// The issue's requirement, held: each flow keeps its column on the next page.
///
/// Every stream, every page it reached, and its x on each of them — because
/// "it held its column on page 1" is the footer apparatus's own behaviour and
/// says nothing about page 2.
#[test]
fn each_stream_keeps_its_column_on_every_page_it_reaches() {
    let runs = render(&fixture());
    for stream in ["תוכן", "מקורות"] {
        let column = column_of(&runs, stream);
        assert!(
            column.len() >= 3,
            "stream {stream} reached only {} page(s) — this fixture cannot see a \
             column that resets on a page break: {column:?}",
            column.len()
        );
        let lo = column.iter().map(|(_, x)| *x).fold(f64::MAX, f64::min);
        let hi = column.iter().map(|(_, x)| *x).fold(f64::MIN, f64::max);
        assert!(
            hi - lo <= COLUMN_TOLERANCE_PT,
            "stream {stream} moved {:.1}pt across its pages — it did not continue in the \
             same position on the next page: {column:?}",
            hi - lo
        );
    }
}

/// Two flows, two columns: the second stream never lands in the first's band.
///
/// The weaker shape this rules out is one column holding both streams' entries
/// — which still prints every word, so an assertion on presence alone passes it
/// — and the stronger shape is a stream that migrates between bands per page,
/// which the per-page comparison catches and a whole-document one does not.
#[test]
fn independent_streams_do_not_share_a_column() {
    let runs = render(&fixture());
    let pages: Vec<usize> = {
        let mut p: Vec<usize> = runs.iter().map(|r| r.page).collect();
        p.sort_unstable();
        p.dedup();
        p
    };
    let mut compared = 0;
    for page in pages {
        let on = |stream: &str| -> Vec<f64> {
            entries(&runs, stream)
                .into_iter()
                .filter(|r| r.page == page)
                .map(|r| r.x)
                .collect()
        };
        let (content, sources) = (on("תוכן"), on("מקורות"));
        if content.is_empty() || sources.is_empty() {
            continue;
        }
        compared += 1;
        let (c_lo, c_hi) = bounds(&content);
        let (s_lo, s_hi) = bounds(&sources);
        assert!(
            c_hi < s_lo || s_hi < c_lo,
            "on page {page} the two streams overlap: תוכן [{c_lo:.1}, {c_hi:.1}] \
             against מקורות [{s_lo:.1}, {s_hi:.1}]"
        );
        let gap = if c_hi < s_lo {
            s_lo - c_hi
        } else {
            c_lo - s_hi
        };
        assert!(
            gap >= COLUMN_SEPARATION_PT,
            "on page {page} the streams are only {gap:.1}pt apart — that is one column \
             shared, not two: תוכן [{c_lo:.1}, {c_hi:.1}], מקורות [{s_lo:.1}, {s_hi:.1}]"
        );
    }
    assert!(
        compared >= 2,
        "only {compared} page(s) carried both streams — the comparison above is not \
         seeing a multi-page document"
    );
}

fn bounds(xs: &[f64]) -> (f64, f64) {
    xs.iter()
        .fold((f64::MAX, f64::MIN), |(lo, hi), x| (lo.min(*x), hi.max(*x)))
}

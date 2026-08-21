//! A companion volume: bound behind the body, or written as its own file.
//!
//! `NOTES-PLAN`'s `קובץ` destination was a placement the model accepted and
//! nothing honoured — the notes were filed, numbered and queryable, and the
//! volume did not exist. It is a fourth placement now, and the writer chooses
//! what they get.
//!
//! The two halves are **one compile of one source**, and that is the whole
//! design. A companion built from a second document would be a second thing to
//! keep correct, and the first note moved would break it.

use ksav_engine::{probe, DocConfig};

const SEFER: &str = "\
#אזור(\"ביאורים\", מיקום: \"קובץ\", כותרת: \"ביאורים\")
#כותרת[פרק ראשון]

גוף הספר כאן#הערה(אזור: \"ביאורים\")[ביאור ראשון על הגוף] וממשיך.

ועוד גוף הספר#הערה(אזור: \"ביאורים\")[ביאור שני על הגוף] וסוף.
";

fn laid(cfg: &DocConfig) -> Vec<probe::TextRun> {
    let doc = probe::layout(SEFER, cfg).unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// Bound at the back: its own sheet, and its own page count.
///
/// The count restarting is what separates a volume from a section. Without it a
/// companion is the back of the sefer with a rule above it, and a reader citing
/// it would be citing this sefer's pages.
#[test]
fn a_companion_bound_at_the_back_starts_its_own_count() {
    let runs = laid(&DocConfig::default());
    let last = runs.iter().map(|r| r.page).max().unwrap();
    assert!(last >= 2, "the companion did not get a sheet of its own");
    // Its entries are on that sheet…
    assert!(
        runs.iter()
            .any(|r| r.page == last && r.text.contains("ביאור ראשון")),
        "the companion volume printed nothing"
    );
    // …and the page number on it reads 1, not the sefer's.
    let foot: Vec<&str> = runs
        .iter()
        .filter(|r| r.page == last && r.y > 780.0)
        .map(|r| r.text.trim())
        .collect();
    assert!(
        foot.contains(&"1"),
        "the companion continued the sefer's page count: {foot:?}"
    );
}

/// Held for a file of its own: the body prints without it.
///
/// Not dropped. Every note in it is still filed, still numbered and still
/// queryable — it is simply not part of *this* document, which is what lets the
/// other half be rendered from the same source.
#[test]
fn a_separate_volume_is_not_bound_into_the_body() {
    let bound = laid(&DocConfig::default());
    let split = laid(&DocConfig {
        separate_volume: true,
        ..DocConfig::default()
    });
    assert!(
        bound.iter().any(|r| r.text.contains("ביאור ראשון")),
        "the control did not bind the companion at all"
    );
    assert!(
        !split.iter().any(|r| r.text.contains("ביאור ראשון")),
        "כרך_נפרד left the companion bound into the body"
    );
    // The body itself is untouched — the same words on the same page.
    let body_of = |runs: &[probe::TextRun]| {
        runs.iter()
            .filter(|r| r.page == 1 && r.size > 11.0)
            .map(|r| r.text.clone())
            .collect::<Vec<_>>()
    };
    assert_eq!(
        body_of(&bound),
        body_of(&split),
        "choosing a separate volume changed the body"
    );
}

/// The markers stay in the body either way.
///
/// A companion volume is where the *entries* live; the reader still has to be
/// able to find one from the sefer, so the marker is not part of what moves.
#[test]
fn the_markers_stay_in_the_body_either_way() {
    let split = laid(&DocConfig {
        separate_volume: true,
        ..DocConfig::default()
    });
    let marks = split.iter().filter(|r| r.page == 1 && r.size < 9.0).count();
    assert!(
        marks >= 2,
        "the markers left the body with the volume — {marks} of two"
    );
}

/// The two halves, from one source, with a boundary that cannot be off by one.
///
/// `compile_companion` compiles the sefer twice — once with the companion held
/// out and once with it bound in — and the first one's page count *is* where
/// the companion starts in the second. Nothing has to be located in a laid-out
/// document, because the difference between the two documents is exactly the
/// thing being looked for.
#[test]
fn a_companion_volume_can_be_cut_out_as_its_own_file() {
    let (whole, start) =
        ksav_engine::compile_companion(SEFER, &DocConfig::default(), &Default::default())
            .expect("the sefer did not compile");
    let start = start.expect("no companion volume was found to cut out");
    let runs = probe::text_runs(&whole);
    // Everything before the boundary is the sefer…
    assert!(
        runs.iter()
            .any(|r| r.page < start && r.text.contains("גוף הספר")),
        "the body is not in the pages before the companion"
    );
    assert!(
        !runs
            .iter()
            .any(|r| r.page < start && r.text.contains("ביאור ראשון")),
        "a companion entry printed in the body's own pages"
    );
    // …and everything from it is the companion.
    assert!(
        runs.iter()
            .any(|r| r.page >= start && r.text.contains("ביאור ראשון")),
        "the companion is not in the pages from the boundary on"
    );
}

/// A sefer with no companion has no boundary, and says so rather than pointing
/// at its last page.
#[test]
fn a_sefer_with_no_companion_has_nothing_to_cut() {
    let (_, start) = ksav_engine::compile_companion(
        "טקסט#הערה[הערה רגילה] וסוף.",
        &DocConfig::default(),
        &Default::default(),
    )
    .expect("the sefer did not compile");
    assert_eq!(start, None, "a document with no companion reported one");
}

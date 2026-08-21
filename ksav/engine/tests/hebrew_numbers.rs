//! The marks inside a Hebrew number.
//!
//! A Hebrew number in a printed sefer carries its own punctuation: a geresh
//! after a single letter — א׳ — and gershayim before the last letter of several
//! — י״ג. Typst's `numbering("א", …)` produces the letters and none of the
//! marks, and a pattern cannot express them, because the mark goes **inside** the
//! number rather than after it: `numbering("א׳", 15)` gives טו׳, which is not a
//! thing anybody prints.
//!
//! It was invisible until note eleven. Every number up to י is a single letter,
//! so the geresh case looked right by accident, and the first two-letter number
//! is where it went wrong — in a system whose whole point is Hebrew typesetting.

use ksav_engine::{probe, DocConfig};

/// The apparatus markers of a document with `n` notes, in order.
fn markers(mode: &str, n: usize) -> Vec<String> {
    let mut body = String::new();
    if !mode.is_empty() {
        body.push_str(&format!("#מסמך(גרשיים: \"{mode}\")[\n"));
    }
    body.push_str("#הגדרות_הערות(מספור: \"א\")\n");
    for _ in 0..n {
        body.push_str("א#הערה[ר] ");
    }
    if !mode.is_empty() {
        body.push_str("\n]");
    }
    let doc = probe::layout(&body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    let runs = probe::text_runs(&doc);
    let mut out: Vec<(f64, String)> = runs
        .iter()
        // Every marker in the document — the ones in the body and the ones at the
        // foot are the same numbers, and a y threshold would have depended on how
        // far up the page a long apparatus starts.
        .filter(|r| r.size < 8.0 && !r.text.trim().is_empty())
        .map(|r| (r.y, r.text.trim().to_string()))
        .collect();
    out.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    out.into_iter().map(|(_, t)| t).collect()
}

/// Left alone, a number is bare — which is what every document written before
/// this got, so nothing already set repaginates.
#[test]
fn the_default_is_what_it_always_was() {
    let m = markers("", 14);
    assert!(
        m.contains(&"יג".to_string()),
        "the bare default changed: {m:?}"
    );
    assert!(
        !m.iter().any(|x| x.contains('״')),
        "gershayim appeared without being asked for: {m:?}"
    );
}

/// Asked for, the marks go where a sefer puts them.
#[test]
fn gershayim_sits_before_the_last_letter() {
    let m = markers("גרשיים", 14);
    assert!(m.contains(&"י״ג".to_string()), "no י״ג among {m:?}");
    assert!(m.contains(&"י״ד".to_string()), "no י״ד among {m:?}");
    // …and a single letter takes a geresh instead, which is the other half of
    // the same convention and the half that looked right by accident.
    assert!(m.contains(&"א׳".to_string()), "no א׳ among {m:?}");
}

/// **לשון נקי**, and it has to survive the hundreds.
///
/// Fifteen is טו and sixteen is טז, never יה or יו, which spell a Name. Typst
/// honours this in its own numbering and the numeral built here has to as well —
/// including at 115, which is קטו and not קיה.
#[test]
fn fifteen_and_sixteen_are_never_a_name() {
    let m = markers("גרשיים", 16);
    assert!(m.contains(&"ט״ו".to_string()), "15 is not ט״ו: {m:?}");
    assert!(m.contains(&"ט״ז".to_string()), "16 is not ט״ז: {m:?}");
    for bad in ["י״ה", "י״ו", "יה", "יו"] {
        assert!(
            !m.iter().any(|x| x == bad),
            "{bad} was printed, which spells a Name: {m:?}"
        );
    }
}

/// A trailing geresh, for a sefer whose house style is that instead.
#[test]
fn a_trailing_geresh_is_its_own_answer() {
    let m = markers("גרש", 14);
    assert!(m.contains(&"יג׳".to_string()), "no יג׳ among {m:?}");
    assert!(
        !m.iter().any(|x| x.contains('״')),
        "גרש produced gershayim: {m:?}"
    );
}

/// A scheme that is not Hebrew letters is left entirely alone.
#[test]
fn a_number_that_is_not_hebrew_gets_no_marks() {
    let body = "#מסמך(גרשיים: \"גרשיים\")[\n#הגדרות_הערות(מספור: \"1\")\nא#הערה[ר] ב#הערה[ר]\n]";
    let doc = probe::layout(body, &DocConfig::default()).expect("compiles");
    let runs = probe::text_runs(&doc);
    assert!(
        !runs
            .iter()
            .any(|r| r.text.contains('״') || r.text.contains('׳')),
        "a digit scheme was given Hebrew marks"
    );
}

/// An unknown house style is refused with the ones that exist.
#[test]
fn an_unknown_setting_is_refused() {
    let Err(d) = probe::layout("#מסמך(גרשיים: \"קסם\")[טקסט]", &DocConfig::default())
    else {
        panic!("an unknown gershayim setting compiled")
    };
    let text = format!("{d:?}");
    assert!(
        text.contains("גרשיים") && text.contains("ללא"),
        "the refusal does not say what exists: {text}"
    );
}

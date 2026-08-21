//! Every inline element a note may be written with survives the cut.
//!
//! # What this asks that `overflow_moves.rs` does not
//!
//! `a_note_with_a_look_on_its_words_is_still_cut` proves the mechanism on two
//! elements — a `strong` and a `highlight` — and the mechanism is a **list**:
//! `_ct_inline` names nine kinds and rebuilds each atom from the element's own
//! fields. Nine kinds, two of them ever compiled, is the same shape as the ten
//! placements of which one was tested, and this repository has been bitten by
//! that shape often enough to stop guessing about it.
//!
//! Two claims per element, and the second is the one that was asked for by name:
//!
//! 1. **The note is cut and not windowed.** Every word prints exactly once, in
//!    order, across however many pages it takes. A body `_ct_split` refuses falls
//!    back to the window, which emits the note whole into every page it spans —
//!    so a word printed twice is the fallback, silently.
//! 2. **No paragraph appears that the writer did not write.** An atom is
//!    rebuilt as `func()(..fields, word)`, one call per word, and the joined
//!    result has to flow as one paragraph. An element that comes back as a block
//!    — or a rebuild that drops a field the element needed to stay inline —
//!    breaks the line at every word, and the note is then a column of one-word
//!    lines that still passes every count.
//!
//! # What a paragraph break costs here, measured rather than assumed
//!
//! Two mutations were run against this file before it was believed. Putting a
//! `parbreak()` in front of every rebuilt atom **changes nothing at all** — no
//! test here moves, and neither does the page. That is not a hole in the sweep:
//! the apparatus renderer does `set block(spacing: 0pt)`, so a paragraph break
//! inside a note costs exactly zero and is invisible by construction.
//!
//! Wrapping each atom in a `block()` **is** visible, and `the marked word sits
//! alone on its line` is what catches it, on eight of the ten elements at once.
//! That is the failure this file is a fence against, and the distinction is
//! worth keeping straight: the danger is not a paragraph, it is a *block*.
//!
//! # `link` is here because it was not in the list
//!
//! `_ct_inline` had nine kinds and a link was none of them, so a note carrying a
//! link fell back to the window — which works, and repeats the whole note in the
//! text layer of every page it spans. A link is one body with a look on it in
//! exactly the sense the list is about: a word out of `link(dest)[א ב]` is that
//! word pointing at the same place.

use ksav_engine::{probe, DocConfig};

/// The inline elements, and how a writer spells each one.
///
/// The marked word is Hebrew in every row so that it shapes into a run of its
/// own rather than splitting at a script boundary, which is how an earlier
/// version of this sweep came to assert against text no instrument would ever
/// return.
const LOOKS: &[(&str, &str, &str)] = &[
    ("strong", "מודגש", "*מודגש*"),
    ("emph", "נטוי", "_נטוי_"),
    ("underline", "קוית", "#underline[קוית]"),
    ("overline", "מעלית", "#overline[מעלית]"),
    ("strike", "מחוקה", "#strike[מחוקה]"),
    ("smallcaps", "קטנה", "#smallcaps[קטנה]"),
    ("sub", "תחתית", "#sub[תחתית]"),
    ("super", "עילית", "#super[עילית]"),
    (
        "highlight",
        "צבועה",
        "#highlight(fill: rgb(\"#00ff00\"))[צבועה]",
    ),
    ("link", "קישור", "#link(\"https://example.com\")[קישור]"),
];

/// A note of fifty numbered words with one word wearing `look`, filed into a
/// region a line and a bit tall so that it has to spill over many pages.
fn sefer(look: &str) -> String {
    let mut words: Vec<String> = (1..=50).map(|i| format!("מילה{i:02}")).collect();
    // In the middle, so that the word has neighbours on both sides on its own
    // line and a paragraph break would be unmistakable.
    words.insert(25, look.to_string());
    format!(
        "#מסמך(אזור_הערות: 3cm)[\n\
         #אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: (\"עמוד_הבא\",))\n\
         פתיחה לגוף הספר.\n\n\
         טקסט ראשון#הערה(אזור: \"צר\")[{}] וסוף.\n\
         ]",
        words.join(" ")
    )
}

/// How far off its neighbours' baseline an inline element may sit and still be
/// on the same line.
///
/// **This number is the difference between a finding and an artifact.** At the
/// 2.0pt every other test in this repository uses, `#super[…]` groups into a
/// line of its own — it is raised about a third of an em — and the sweep reports
/// that a superscript broke the paragraph, which is false and is exactly the
/// kind of confident wrong answer an instrument gives when it is asked a
/// question it cannot see. A superscript is *supposed* to sit off the baseline.
///
/// Safe at this width because the apparatus here is set at 9pt in a region a
/// line and a bit tall: two real lines are more than 10pt apart, and the largest
/// shift any element in the list makes is under 4.
const BASELINE_SLACK: f64 = 5.0;

/// The apparatus's own lines, in the order they are read.
///
/// Found by type size rather than by position: the apparatus is set smaller than
/// the body, and a region at the page foot on a spilling document appears on
/// every page, so "below the text" alone would also collect the body's last line
/// on a page the notes start high on.
fn apparatus_lines(runs: &[probe::TextRun]) -> Vec<String> {
    probe::lines(runs, BASELINE_SLACK)
        .into_iter()
        .filter(|l| l.runs.first().is_some_and(|r| r.size < 11.0) && l.y > 600.0)
        .map(|l| l.reading)
        .collect()
}

/// Every element in the list is cut, keeps every word, and starts no paragraph.
#[test]
fn every_inline_element_is_cut_and_starts_no_paragraph() {
    let expected: Vec<String> = (1..=50).map(|i| format!("מילה{i:02}")).collect();
    let mut wrong: Vec<String> = Vec::new();
    // Counted, because every branch below that reports a fault also `continue`s
    // past the rest of the claims — so a sweep in which every element failed
    // early and every element was reported would otherwise look the same as a
    // sweep of nothing at all.
    let mut checked: Vec<&str> = Vec::new();
    for (name, word, markup) in LOOKS {
        let doc = match probe::layout(&sefer(markup), &DocConfig::default()) {
            Ok(d) => d,
            Err(d) => {
                wrong.push(format!("{name}: did not compile: {d:?}"));
                continue;
            }
        };
        let runs = probe::text_runs(&doc);
        let lines = apparatus_lines(&runs);

        // One: every word once, in order. A repeat is the window.
        let printed: Vec<String> = lines
            .iter()
            .flat_map(|l| l.split_whitespace())
            .filter(|w| w.starts_with("מילה"))
            .map(|w| w.to_string())
            .collect();
        if printed != expected {
            let dupes = printed.len() as i64 - expected.len() as i64;
            wrong.push(format!(
                "{name}: the words came out wrong ({} printed against {}, {dupes:+} — \
                 a repeat is the window and a gap is a lost slice)",
                printed.len(),
                expected.len()
            ));
            continue;
        }

        // Two: the marked word printed, and it is not sitting alone.
        let Some(line) = lines.iter().find(|l| l.contains(*word)) else {
            wrong.push(format!("{name}: the marked word printed nowhere"));
            continue;
        };
        let beside = line
            .split_whitespace()
            .filter(|w| w.starts_with("מילה"))
            .count();
        if beside < 2 {
            wrong.push(format!(
                "{name}: the marked word sits alone on its line — {line:?}"
            ));
        }

        // Three: **the last word lands exactly where it lands without the
        // markup** — a look on one word out of fifty-one does not move the
        // fiftieth.
        //
        // Said plainly, because a test whose reach is oversold is worse than a
        // narrow one: this catches neither mutation above. A `parbreak()` costs
        // nothing in an apparatus that sets `block(spacing: 0pt)`, and one
        // `block()` per marked word turns out not to move the last word either —
        // the last slice starts at the top of the region whatever came before it.
        // What it does catch is a rebuild whose *metrics* are wrong: a field
        // dropped on the way through `fields()`, a word coming back at the
        // document's type size instead of the apparatus's, anything that changes
        // how much fits. Equality, not a tolerance, for that reason.
        let plain = probe::layout(&sefer(word), &DocConfig::default())
            .unwrap_or_else(|d| panic!("{name}: the plain sefer did not compile: {d:?}"));
        //
        // Read off the **line** and not off a run. `מילה50` is Hebrew followed
        // by digits and Typst shapes it into two runs, so no run contains the
        // whole token — `r.text.contains("מילה50")` is `None` on every document
        // ever written, which made the first draft of this claim compare nothing
        // to nothing and pass under both mutations it was written to catch.
        let end_of = |d: &_| -> Option<(usize, i64)> {
            probe::lines(&probe::text_runs(d), BASELINE_SLACK)
                .into_iter()
                .filter(|l| l.runs.first().is_some_and(|r| r.size < 11.0) && l.y > 600.0)
                .find(|l| l.reading.contains("מילה50"))
                .map(|l| (l.page, (l.y * 100.0).round() as i64))
        };
        let got = end_of(&doc);
        let want = end_of(&plain);
        if got.is_none() || want.is_none() {
            // A claim that cannot find its subject fails. Two drafts of this one
            // passed by comparing nothing to nothing.
            wrong.push(format!(
                "{name}: the last word could not be located ({got:?} against {want:?})"
            ));
        } else if got != want {
            wrong.push(format!(
                "{name}: the note's last word landed at {got:?} where the same words \
                 plain land at {want:?} — a paragraph the writer did not write"
            ));
        }
        checked.push(name);
    }
    assert_eq!(
        checked.len(),
        LOOKS.len(),
        "only {checked:?} were carried through every claim, of {} in the list",
        LOOKS.len()
    );
    assert!(
        wrong.is_empty(),
        "an inline element did not survive the cut:\n  {}",
        wrong.join("\n  ")
    );
}

/// The look itself comes through the cut, for the two elements an instrument
/// here can actually read.
///
/// Deliberately narrow. `probe` reads weight and fill; it cannot see an
/// underline's stroke, a strike's rule or a link's destination, and Ksav has no
/// italic Hebrew face — it shears the glyphs, and a shear is a transform this
/// instrument answers "upright" about. Asserting on properties the instrument
/// cannot see is how three claims in this area came to be wrong, so this asserts
/// on the two it can and says so rather than pretending to a sweep.
#[test]
fn the_look_itself_comes_through_the_cut() {
    let doc = probe::layout(&sefer("*מודגש*"), &DocConfig::default())
        .expect("the bolded sefer did not compile");
    let runs = probe::text_runs(&doc);
    let bold = runs
        .iter()
        .find(|r| r.size < 11.0 && r.text.contains("מודגש"))
        .map(|r| r.weight);
    assert!(
        bold.is_some_and(|w| w >= 600),
        "the bolded word came out of the cut unbolded: {bold:?}"
    );

    let doc = probe::layout(
        &sefer("#highlight(fill: rgb(\"#00ff00\"))[צבועה]"),
        &DocConfig::default(),
    )
    .expect("the highlighted sefer did not compile");
    let green: Vec<probe::Fill> = probe::fills(&doc)
        .into_iter()
        .filter(|f| f.colour == "#00ff00" && f.y > 600.0)
        .collect();
    assert!(
        !green.is_empty(),
        "the highlighted word came out of the cut unhighlighted"
    );
    // On one page: two would mean the note was emitted whole into both, which is
    // the window and the cost the cut exists to stop paying.
    let pages: std::collections::BTreeSet<usize> = green.iter().map(|f| f.page).collect();
    assert_eq!(
        pages.len(),
        1,
        "the highlight was painted on more than one page: {pages:?}"
    );
}

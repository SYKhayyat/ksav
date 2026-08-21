//! Every word a writer writes reaches the page.
//!
//! # Why this is a file of its own
//!
//! Truncation is the one failure this application may not have. A note set in
//! the wrong place is a fault the writer can see and fix; a note **short by four
//! words** looks exactly like a note that was four words shorter, and nothing on
//! the page says otherwise. This repository has shipped that bug more than once
//! and each time it was found by a person reading a sefer, never by a test:
//!
//! - notes filed into a collected region printed nowhere at all, on three of the
//!   ten placements, for as long as those placements existed;
//! - a note taller than its region was masked by the region's own `clip: true`,
//!   and `probe` could not see it because a clip is a paint operation;
//! - a slice index computed by float division lost every seventh page of a
//!   spilling note — thirty-three words out of three hundred;
//! - a row plan naming two of three channels dropped the third's notes, which
//!   this file's sibling caught while it was being written.
//!
//! Every one of those is the same claim failing: **the words that went in came
//! out**. So it is asked here directly, over the arrangements a sefer is
//! actually written in, rather than inferred from each mechanism separately.
//!
//! # What counts as an answer
//!
//! Printing every word, or **refusing to compile in a sentence**. Those are the
//! two honest outcomes and this file accepts either. What it does not accept is
//! a document that compiles, looks finished, and is missing text.
//!
//! # The one arrangement that may clip, and it is not silent
//!
//! `גלישה: ()` — the empty list — is a writer saying *a fixed box that stays
//! fixed*, which is a real thing to want and was the only behaviour available
//! before the overflow moves existed. It is the sole exemption, it is named
//! here, and `an_explicitly_fixed_box_is_the_only_thing_that_clips` holds it to
//! being the only one.

use ksav_engine::{probe, DocConfig};

/// Words that shape as one run and sort as one sequence.
fn words(n: usize) -> Vec<String> {
    (1..=n).map(|i| format!("מילה{i:03}")).collect()
}

/// Every word of `words(n)` that reached a page, in reading order.
fn printed(runs: &[probe::TextRun], n: usize) -> Vec<String> {
    probe::lines(runs, 5.0)
        .into_iter()
        .flat_map(|l| {
            l.reading
                .split_whitespace()
                .filter(|w| w.contains("מילה"))
                .map(|w| w.to_string())
                .collect::<Vec<_>>()
        })
        // The **suffix**, not the whole token. A marker is drawn against the
        // first word of its entry and Typst shapes «1» and «מילה001» into one
        // run, so the first word of every note comes back as «1מילה001» and a
        // strict match reports it missing. One word out of sixty, on the two
        // arrangements that draw a marker beside the text — an instrument
        // artifact reported as lost prose, which is the wrong direction for this
        // file to be wrong in.
        .filter_map(|w| words(n).into_iter().find(|x| w.ends_with(x.as_str())))
        .collect()
}

/// A sefer whose note holds `n` numbered words, filed however `region` says.
fn sefer(region: &str, n: usize) -> String {
    format!(
        "#מסמך(אזור_הערות: 3cm)[\n\
         {region}\n\
         פתיחה לגוף הספר, ובה די מילים כדי שהעמוד יתחיל להתמלא כראוי.\n\n\
         טקסט ראשון#הערה({})[{}] וסוף.\n\
         ]",
        if region.contains("#אזור") {
            "אזור: \"צר\""
        } else {
            ""
        },
        words(n).join(" ")
    )
}

/// The arrangements a sefer is written in, and what each one is for.
///
/// Every one of these is a shape somebody asked for: the ordinary page foot, a
/// region a line tall that has to spill, a collected apparatus at the back, a
/// gloss in the margin, and the two overflow policies that make the page's
/// demand smaller instead of spilling.
const WAYS: &[(&str, &str)] = &[
    ("the ordinary page foot", ""),
    (
        "a one-line region that spills",
        "#אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: (\"עמוד_הבא\",))",
    ),
    (
        "a region that shrinks before it spills",
        "#אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: (\"הקטנה\", \"עמוד_הבא\"))",
    ),
    (
        "a region that runs in before it spills",
        "#אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: (\"רצף\", \"עמוד_הבא\"))",
    ),
    (
        "a region that only shrinks",
        "#אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: (\"הקטנה\",))",
    ),
    (
        "a region that only compresses",
        "#אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: (\"דחיסה\",))",
    ),
    (
        "a collected apparatus at the back of the sefer",
        "#אזור(\"צר\", מיקום: \"סוף\")",
    ),
    (
        "a collected apparatus at the end of the section",
        "#אזור(\"צר\", מיקום: \"סוף_מדור\")",
    ),
    ("a gloss in the margin", "#אזור(\"צר\", מיקום: \"חוץ\")"),
    ("a band above the text", "#אזור(\"צר\", מיקום: \"למעלה\")"),
    (
        "a band above the text with a height to overflow",
        "#אזור(\"צר\", מיקום: \"למעלה\", גובה: 1.2cm)",
    ),
];

/// Every arrangement prints every word, or refuses in a sentence.
#[test]
fn no_arrangement_loses_a_word() {
    const N: usize = 60;
    let want = words(N);
    let mut lost: Vec<String> = Vec::new();
    let mut checked = Vec::new();
    let mut refused = Vec::new();
    for (what, region) in WAYS {
        match probe::layout(&sefer(region, N), &DocConfig::default()) {
            // A refusal is an answer. What is not an answer is a page that looks
            // finished and is short.
            Err(_) => {
                refused.push(*what);
                checked.push(*what);
            }
            Ok(doc) => {
                let got = printed(&probe::text_runs(&doc), N);
                if got != want {
                    let missing: Vec<&String> = want.iter().filter(|w| !got.contains(w)).collect();
                    let dupes = got.len() as i64 - want.len() as i64;
                    lost.push(format!(
                        "{what}: {} of {N} words printed ({dupes:+}), missing {:?}",
                        got.len(),
                        missing.iter().take(6).collect::<Vec<_>>()
                    ));
                }
                checked.push(*what);
            }
        }
    }
    assert_eq!(
        checked.len(),
        WAYS.len(),
        "only {checked:?} of the arrangements were reached"
    );
    // **None of these may refuse.** A refusal is an honest answer to a document
    // that cannot be laid out, and not one of the arrangements here is that: they
    // are the ordinary ways a sefer is written. Without this line the whole sweep
    // passes on a corpus that does not compile — which is exactly what it did on
    // its first run, when a stray space between  and  made every document
    // an error and every error an answer.
    assert!(
        refused.is_empty(),
        "an ordinary arrangement did not compile, so nothing about it was checked: {refused:?}"
    );
    assert!(
        lost.is_empty(),
        "text went in and did not come out:\n  {}",
        lost.join("\n  ")
    );
}

/// …and it holds when the sefer is long enough to page.
///
/// A one-page document cannot show a slice index that goes wrong on the seventh
/// page, which is how thirty-three words were lost in a mechanism that had a
/// passing test over two pages.
#[test]
fn a_long_sefer_loses_nothing_either() {
    const N: usize = 400;
    let body = format!(
        "#מסמך(אזור_הערות: 3cm)[\n\
         #אזור(\"צר\", מיקום: \"רגל\", גובה: שורות(1), גלישה: (\"עמוד_הבא\",))\n\
         פתיחה.\n\n\
         א#הערה(אזור: \"צר\")[{}]\n\
         ]",
        words(N).join(" ")
    );
    let doc = probe::layout(&body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("the long sefer did not compile: {d:?}"));
    assert_eq!(
        printed(&probe::text_runs(&doc), N),
        words(N),
        "a note spilling over many pages did not print every word exactly once"
    );
}

/// Several notes in one region keep all of their words, and keep them apart.
#[test]
fn many_notes_in_one_region_lose_nothing() {
    const EACH: usize = 30;
    let mut body = String::from(
        "#מסמך(אזור_הערות: 3cm)[\n\
         #אזור(\"צר\", מיקום: \"רגל\", גובה: שורות(2), גלישה: (\"עמוד_הבא\",))\n\
         פתיחה.\n\n",
    );
    for note in 1..=4 {
        let w: Vec<String> = (1..=EACH).map(|i| format!("נ{note}מילה{i:03}")).collect();
        body.push_str(&format!("א#הערה(אזור: \"צר\")[{}]\n\n", w.join(" ")));
    }
    body.push(']');
    let doc = probe::layout(&body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    let runs = probe::text_runs(&doc);
    let all: Vec<String> = probe::lines(&runs, 5.0)
        .into_iter()
        .flat_map(|l| {
            l.reading
                .split_whitespace()
                .filter(|w| w.starts_with("נ"))
                .map(|w| w.to_string())
                .collect::<Vec<_>>()
        })
        .collect();
    let mut lost = Vec::new();
    for note in 1..=4 {
        let want: Vec<String> = (1..=EACH).map(|i| format!("נ{note}מילה{i:03}")).collect();
        let got: Vec<String> = all.iter().filter(|w| want.contains(w)).cloned().collect();
        if got != want {
            lost.push(format!("note {note}: {} of {EACH} words", got.len()));
        }
    }
    assert!(
        lost.is_empty(),
        "notes lost words:\n  {}",
        lost.join("\n  ")
    );
}

/// The empty spill list keeps the box fixed, and that is the whole of what this
/// file can say about it.
///
/// # What could not be asserted here, and why
///
/// The obvious claim — *a fixed box loses words and everything else keeps them* —
/// cannot be made with this instrument. `probe` walks the laid-out frames and a
/// **clip is a paint operation**, so a masked note and a printed one measure
/// identically; asked whether a fixed box dropped anything it answers no, on a
/// page where the reader sees three lines of a fifteen-line note. `svgdump` is
/// the instrument that sees the rectangle, and it confirms there is one.
///
/// Written down rather than worked around, because the same blind spot applies to
/// every claim above it: this file proves the words reached a **frame**, not that
/// a reader can see them. That is the weaker claim, it still catches every bug
/// listed at the top of this file, and overstating it would be the third time an
/// instrument here was asked a question it cannot see.
///
/// So what is asserted is the thing a fixed box is **for**: the page count does
/// not move. A box that grew, or that spilled anyway, would take more pages.
#[test]
fn an_explicitly_fixed_box_does_not_move_the_page() {
    const N: usize = 300;
    let fixed = probe::layout(
        &sefer("#אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: ())", N),
        &DocConfig::default(),
    )
    .expect("a fixed box did not compile");
    let spilling = probe::layout(
        &sefer("#אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm)", N),
        &DocConfig::default(),
    )
    .expect("the same region with the default policy did not compile");
    let fixed_pages = probe::page_sizes(&fixed).len();
    let spilling_pages = probe::page_sizes(&spilling).len();
    assert_eq!(
        fixed_pages, 1,
        "a box asked to stay fixed took {fixed_pages} pages"
    );
    assert!(
        spilling_pages > fixed_pages,
        "the default policy took {spilling_pages} pages and the fixed box {fixed_pages}; \
         the two are the same layout, so this test reaches neither case"
    );
    // …and the spilling one keeps every word, which is what makes the fixed box a
    // choice rather than a limit.
    assert_eq!(
        printed(&probe::text_runs(&spilling), N),
        words(N),
        "the default policy lost words that only an explicitly fixed box may lose"
    );
}

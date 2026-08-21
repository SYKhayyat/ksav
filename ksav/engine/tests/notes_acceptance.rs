//! What "done" means for the note system, as documents rather than as opinions.
//!
//! `NOTES-PLAN.md` Part 2c lists the corpus documents that had to start passing.
//! Every line of it is a measurement off the laid-out page, because every
//! apparatus bug this project has had compiled cleanly and was wrong on the
//! page — `compile(...).ok()` cannot see a note printed over another note, and
//! it cannot see one printed past the edge of the paper.
//!
//! The corpus itself lives in `tests/notes-corpus/` and `run.sh` there prints
//! these same numbers for a person to read. This file is the half that fails.
//!
//! # Two invariants, and they are the whole of the apparatus's contract
//!
//! From `NOTES-PLAN.md` decision 6, which is the user's own wording:
//!
//! > A note may be moved, shrunk, run in, or pushed to the next page. It may
//! > never be printed on top of another note, and it may never be printed off
//! > the paper.
//!
//! Everything else here is a specific document exercising a specific mechanism.

mod common;

use common::render;
use ksav_engine::{probe, DocConfig};

/// The corpus document by that name.
fn corpus(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/notes-corpus")
        .join(format!("{name}.ksav"));
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

/// Every run of a corpus document, with the pages it was laid out on.
fn laid(name: &str) -> (Vec<probe::TextRun>, Vec<(f64, f64)>) {
    let body = corpus(name);
    let doc = probe::layout(&body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("{name} did not compile: {d:?}"));
    (probe::text_runs(&doc), probe::page_sizes(&doc))
}

/// The lowest point anything printed at, in points from the top of the page.
fn max_y(runs: &[probe::TextRun]) -> f64 {
    runs.iter().fold(0.0_f64, |a, r| a.max(r.y))
}

/// Where the page number sits on an A4 page, and the line nothing may print
/// below.
///
/// **Not the text area's bottom**, which is 771.02 and is a baseline: the last
/// line of a full page of footnotes sits exactly on it, and a footnote entry
/// that packs to the foot can put a descender a point or two under it. Neither
/// is off the paper and neither is a bug.
///
/// This is the number `NOTES-PLAN` Part 2c states, and it is the one that
/// matters: below the page number is the printer's dead zone, which is where
/// every one of the failures this file exists for ended up — 802.57 for a box
/// that overflowed, 827.27 for a side column with no bottom, 1477.69 for a
/// nested band that could not split.
const PAGE_FOOT: f64 = 799.02;

/// Nothing in any corpus document is printed below the page number.
///
/// The invariant, asked of the whole corpus rather than of the document that was
/// reported — which is the difference between fixing an instance and fixing a
/// class. **Two** documents are exempt, and each exemption is a claim about
/// Typst rather than about this apparatus:
///
/// * `spanning` is `NOTES-PLAN` Part 4's proof that **a nested band cannot
///   split**. Its content reaches y=1477.69 on an 841.89pt sheet, and that is
///   the finding: design A wrapped in one parent entry is not a thing that can
///   be made to fit. The document exists to fail.
/// * `rot` is the same for rotation, which does not paginate at all.
///
/// `boxover` and `compose_long` were exempt too, as *"thing four's other half,
/// not yet built"*. They are built: both reached y=802.57 with nine notes
/// visible out of twenty and thirty, and both now print every note across as
/// many pages as it takes with nothing below the page number. An exemption that
/// has stopped being needed is a stale claim, so it is gone rather than left
/// harmlessly true.
#[test]
fn no_corpus_document_prints_below_the_text_area() {
    const DISPROOFS: &[(&str, &str)] = &[
        (
            "spanning",
            "Part 4: a nested band cannot split — the document exists to fail",
        ),
        ("rot", "Part 4: rotation does not paginate"),
    ];
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/notes-corpus");
    let mut over = Vec::new();
    let mut checked = 0;
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .expect("the corpus directory is there")
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".ksav"))
        .map(|n| n.trim_end_matches(".ksav").to_string())
        .collect();
    names.sort();
    for name in &names {
        if DISPROOFS.iter().any(|(n, _)| n == name) {
            continue;
        }
        let (runs, _) = laid(name);
        checked += 1;
        let low = max_y(&runs);
        if let Some(r) = runs.iter().find(|r| r.y > PAGE_FOOT) {
            over.push(format!(
                "{name}: {:.2} — {:?} (max y {low:.2})",
                r.y,
                r.text.trim()
            ));
        }
    }
    assert!(
        checked >= 30,
        "only {checked} corpus documents were read — the directory is not being walked"
    );
    assert!(
        over.is_empty(),
        "corpus documents printing below the page number ({PAGE_FOOT:.2}):\n  {}",
        over.join("\n  ")
    );
}

/// Every side note in a dense document is printed, and each at its own height.
///
/// `dense.ksav` is twenty long notes hung off one paragraph. Before the column
/// was drawn by the page instead of by the paragraph it reached y=827.27 on an
/// 841.89pt sheet — over the page number and into the border no printer will
/// mark — and the notes that would not fit had nowhere at all to go.
#[test]
fn twenty_dense_side_notes_all_print_and_none_overlap() {
    let (runs, _) = laid("dense");
    let mut heads: Vec<(usize, i64)> = runs
        .iter()
        .filter(|r| r.text.contains("הערת צד ארוכה מאוד מספר"))
        .map(|r| (r.page, (r.y * 100.0).round() as i64))
        .collect();
    assert_eq!(
        heads.len(),
        20,
        "twenty notes were written and {} printed",
        heads.len()
    );
    heads.sort();
    let before = heads.len();
    heads.dedup();
    assert_eq!(
        heads.len(),
        before,
        "two notes were printed at the same place on the same page: {heads:?}"
    );
    assert!(
        heads.iter().any(|(p, _)| *p > 1),
        "nothing spilled — twenty long notes cannot fit beside one paragraph, \
         so a one-page answer means they were dropped or overprinted"
    );
}

/// A side note does not change the body around it.
///
/// The same paragraph twice, once with two sidenotes in it. Every line of the
/// writer's prose has to land in the same place both times.
///
/// This is the fence for the *third* instance of a class this repository has now
/// paid for three times: a block-level function called from inside a paragraph
/// ends the line it sits on. `#נטוי` was the first. The registry-wide sweep in
/// `inline_text.rs` is the general form; this is the specific document, kept
/// because it is the one a person can read.
#[test]
fn a_side_note_leaves_the_paragraph_it_is_written_in_alone() {
    let plain = laid("sn_p_none").0;
    let noted = laid("sn_p_note").0;
    let lines = |runs: &[probe::TextRun]| -> Vec<i64> {
        let mut ys: Vec<i64> = runs
            .iter()
            .filter(|r| {
                r.text.contains("בראשית") || r.text.contains("אלקים") || r.text.contains("מרחפת")
            })
            .map(|r| (r.y * 100.0).round() as i64)
            .collect();
        ys.sort();
        ys.dedup();
        ys
    };
    assert_eq!(
        lines(&plain),
        lines(&noted),
        "the body moved when notes were added to it"
    );
}

/// `#הגדרות_הערות(ריווח:)` moves the footnote entries apart.
///
/// It was declared, documented and read by nothing at all. `probe` can see this
/// one, because the entries' positions are what change.
#[test]
fn the_gap_between_note_entries_is_settable() {
    let gap_of = |em: &str| {
        let body = format!(
            "#הגדרות_הערות(ריווח: {em})\nLN1#הערה[one].\n\nLN2#הערה[two].\n\nLN3#הערה[three].\n"
        );
        let runs = render(&body);
        let mut ys: Vec<f64> = runs
            .iter()
            .filter(|r| r.text.contains("one") || r.text.contains("two"))
            .map(|r| r.y)
            .collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!(ys.len() >= 2, "the entries did not print for {em}");
        ys[1] - ys[0]
    };
    let tight = gap_of("0em");
    let loose = gap_of("6em");
    assert!(
        loose > tight + 40.0,
        "0em put the entries {tight:.2}pt apart and 6em {loose:.2}pt — \
         the setting is not reaching the page"
    );
}

/// A slant asked for in *configuration* prints, not only one asked for by
/// command.
///
/// `probe` cannot see a shear directly — it reads text runs — but it can see
/// where the glyphs ended up, and a sheared word is not where an upright one is.
/// That is deliberate: the instrument has to be able to see the property, and
/// the way to know it can is to check that the two documents differ at all.
#[test]
fn a_configured_slant_reaches_the_page() {
    let upright = render("#הגדרות_הערות(סגנון: (\"normal\",))\nשלום#הערה[גוף ההערה כאן].\n");
    let slanted = render("#הגדרות_הערות(סגנון: (\"italic\",))\nשלום#הערה[גוף ההערה כאן].\n");
    let shape = |runs: &[probe::TextRun]| -> Vec<(i64, i64)> {
        runs.iter()
            .map(|r| ((r.x * 100.0).round() as i64, (r.y * 100.0).round() as i64))
            .collect()
    };
    assert_ne!(
        shape(&upright),
        shape(&slanted),
        "`סגנון: \"italic\"` on a note changed nothing on the page"
    );
}

/// Two named series run at once, each with its own shape, and a restart that
/// names one leaves the other alone.
///
/// `NOTES-PLAN` thing five, and the clause that matters is *"not tied to
/// notes"*: a writer numbering a list of opinions or a set of variants wants
/// exactly this and has no note anywhere. Until it existed the only renumbering
/// machinery in this engine was inside the footnote apparatus, which is the same
/// mistake the whole plan is written to undo — a general capability trapped
/// inside one of its customers.
#[test]
fn two_named_series_count_independently_and_restart_separately() {
    let runs = render(
        "#הגדרות_מונה(\"דעות\", מספור: \"א\")\n\
         דעה #מונה(\"דעות\") ראשונה.\n\n\
         דעה #מונה(\"דעות\") שניה.\n\n\
         #הגדרות_מונה(\"נוסחאות\", מספור: \"(1)\")\n\
         נוסח #מונה(\"נוסחאות\") כאן.\n\n\
         דעה #מונה(\"דעות\") שלישית.\n\n\
         #התחל_מספור(שם: \"דעות\")\n\n\
         דעה #מונה(\"דעות\") שוב. ונוסח #מונה(\"נוסחאות\") שוב.\n",
    );
    // Joined in reading order and with the runs' own spacing collapsed: a number
    // is its own run, so the page arrives as "דעה" "א" "ראשונה" and the words
    // between them are what the writer typed.
    let page = runs
        .iter()
        .map(|r| r.text.as_str())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    // The Hebrew series counts א ב ג and then starts again at א; the other one
    // is untouched by that restart and reaches (2).
    for want in ["דעה א ראשונה", "דעה ב שניה", "דעה ג שלישית"] {
        assert!(page.contains(want), "{want:?} is not on the page: {page}");
    }
    assert!(
        page.contains("דעה א שוב"),
        "the named restart did not start the series again: {page}"
    );
    assert!(
        page.contains("ונוסח (2) שוב"),
        "restarting one series restarted the other as well: {page}"
    );
}

/// The writer picks what a full region does, and the three answers are three
/// different pages.
///
/// `NOTES-PLAN` decision 15: spill is the default for every destination **and
/// the writer can pick**. `גלישה` is therefore an ordered list rather than one
/// value — the moves are not alternatives, a writer wants *compress, then
/// spill*, and one value per region would have been the menu of arrangements
/// decision 10 rules out.
///
/// Three are built and only three are accepted. A word that compiles and does
/// nothing is the defect class `settings_live.rs` exists to catch, so asking for
/// one of the six that are not built is refused by name rather than ignored.
#[test]
fn a_regions_overflow_policy_is_the_writers_to_pick() {
    let doc = |policy: &str| {
        let mut body = format!("#אזור(\"מקורות\", מיקום: \"רגל\", גלישה: {policy})\nLN1 טקסט");
        for i in 1..=20 {
            body.push_str(&format!("#הערה_זרם(\"מקורות\")[SRC{i} מקור ארוך כאן]"));
        }
        body.push('\n');
        let runs = render(&body);
        let on_first = runs
            .iter()
            .filter(|r| r.page == 1 && r.text.contains("SRC"))
            .count();
        let pages = runs.iter().map(|r| r.page).max().unwrap_or(0);
        (on_first, pages)
    };
    let (spill_first, spill_pages) = doc("(\"עמוד_הבא\",)");
    let (tight_first, tight_pages) = doc("(\"דחיסה\", \"עמוד_הבא\")");
    let (clip_first, clip_pages) = doc("()");

    assert!(
        spill_pages > 1,
        "spilling put all twenty notes on one page, so nothing spilled"
    );
    // Compressed, more of them fit — which is the whole of what the move is for.
    assert!(
        tight_first > spill_first,
        "compressing fitted {tight_first} notes on the first page against \
         {spill_first} without it, so `דחיסה` is not reaching the page"
    );
    assert!(
        tight_pages <= spill_pages,
        "compressing made the apparatus *longer*: {tight_pages} pages against {spill_pages}"
    );
    // And an empty list is a fixed box that stays fixed. It is the behaviour
    // this apparatus had before spill existed, and it is a real thing to ask
    // for — so it is a value rather than the absence of one.
    assert_eq!(
        clip_pages, 1,
        "`גלישה: ()` spilled anyway, onto {clip_pages} pages"
    );
    assert!(
        clip_first > tight_first,
        "`גלישה: ()` moved notes off the page it was told to keep them on"
    );
}

/// And the same for the mark register, whose shipped defaults ask for it.
///
/// `#גמרא`, `#פסוק` and `#ציון_מקור` carry `סגנון: \"italic\"` in
/// `_mk_defaults` — three of the eight classes — so this is not a knob nobody
/// set. It is a look the register has promised since it was written.
#[test]
fn a_marks_shipped_slant_reaches_the_page() {
    let forced = render("#הגדרות_גמרא(סגנון: \"normal\")\nעיין #גמרא[ברכות][ב.] ובמה שכתב.\n");
    let shipped = render("עיין #גמרא[ברכות][ב.] ובמה שכתב.\n");
    let shape = |runs: &[probe::TextRun]| -> Vec<(i64, i64)> {
        runs.iter()
            .map(|r| ((r.x * 100.0).round() as i64, (r.y * 100.0).round() as i64))
            .collect()
    };
    assert_ne!(
        shape(&forced),
        shape(&shipped),
        "`#גמרא` ships an italic default and it is not printing"
    );
}

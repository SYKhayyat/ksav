//! One paper-size table, and a page that is actually that size — #106.
//!
//! # The bug was three tables, and the audit only saw two
//!
//! The issue named `_pg_paper_width` in the prelude and `paper_cm_of` in
//! `lib.rs`: two tables in two languages, agreeing on three of ten papers and
//! disagreeing on the rest. Asking for B5, the issue said, laid the page out at
//! one width and reserved margins against another, 34 mm apart.
//!
//! Measured, it was worse. **Typst's `paper:` is a closed enum.** It accepts
//! `iso-b5` and rejects `b5` — the name `paper_cm_of` itself published — with a
//! syntax error about `#מסמך` that never mentions the paper. So `b4`, `b5`, `b6`
//! and `letter` were not laid out at the wrong width: they **failed to compile**,
//! and the message pointed at the document wrapper. `a2`, `a6` and `us-legal`
//! were the ones that laid out at A4's width under a different name. And a
//! fourth copy the issue never found — `PAPER_CSS` in `exports.ts` — exported
//! Word documents at A4 whatever the sefer was set on.
//!
//! The shape of the bug is the shape of all of them: the same truth written down
//! more than once, in more than one language, with nothing comparing the copies.
//!
//! # What this file asserts
//!
//! Not that the table has ten rows. That **every name in it is a page of that
//! size in the laid-out document**, in both output modes, and that the names
//! that mean an old spelling of a sheet lay out on that same sheet. A missing
//! entry is a compile error, not an A4. That is the assertion the old tests
//! could not make: no existing fixture used `b5`, so nothing could disagree.

use ksav_engine::{paper_size_cm, probe, DocConfig, PAPERS};

/// Typst points per centimetre.
const PER_CM: f64 = 72.0 / 2.54;

/// The first page's size, in centimetres, for a document set on `paper`.
///
/// `continuous` is the digital mode — one page as tall as the sefer, which is
/// the *only* mode that has to name a width instead of a paper, and therefore
/// the mode the prelude's second table served. It is measured separately here
/// because that table was wrong in a different way from the paged one: it laid
/// every paper out on 210 mm.
fn size_cm(paper: &str, continuous: bool) -> (f64, f64) {
    let cfg = DocConfig {
        paper: paper.to_string(),
        continuous,
        ..DocConfig::default()
    };
    let doc = probe::layout("טקסט קצר\n", &cfg).unwrap_or_else(|d| {
        panic!(
            "paper {paper:?} (continuous: {continuous}) failed to compile: {:?}",
            d.iter().map(|x| &x.message).collect::<Vec<_>>()
        )
    });
    let page = doc.pages().first().expect("one page");
    (
        page.frame.width().to_pt() / PER_CM,
        page.frame.height().to_pt() / PER_CM,
    )
}

fn about(got: f64, want: f64) -> bool {
    (got - want).abs() < 0.02
}

/// Every paper the product offers is a page of the size the table says.
///
/// One assertion per paper, in both modes, read off the rendered page. This is
/// the whole of the fence: if a name is added to `PAPERS` without a size, the
/// first branch panics in `paper_facts`, and if a size is written down wrong,
/// this fails with both numbers.
#[test]
fn every_offered_paper_is_the_page_the_table_says() {
    for name in PAPERS {
        let (w_cm, h_cm) =
            paper_size_cm(name).unwrap_or_else(|| panic!("{name} is in PAPERS and has no size"));

        let (w, h) = size_cm(name, false);
        assert!(
            about(w, w_cm) && about(h, h_cm),
            "paged {name}: the table says {w_cm}×{h_cm}cm and the page came out {w:.2}×{h:.2}cm"
        );

        // Continuous sets `height: auto`, so only the width is comparable — and
        // the width is exactly what the second table got wrong.
        let (cw, _) = size_cm(name, true);
        assert!(
            about(cw, w_cm),
            "continuous {name}: the table says {w_cm}cm wide and the column came out {cw:.2}cm \
             — the continuous path is naming a different paper from the paged one"
        );
    }
}

/// The old spellings are the same sheet, in both modes.
///
/// `b5` and `letter` are what `.ksav` files, share links and the settings drawer
/// said before #106, and Typst rejects both by name. They resolve to `iso-b5`
/// and `us-letter` in `sanitize_paper`, and this is that claim measured: the
/// page an old spelling lays out is the page its canonical name lays out.
#[test]
fn an_old_spelling_is_the_same_sheet() {
    for (old, canonical) in [
        ("b4", "iso-b4"),
        ("b5", "iso-b5"),
        ("b6", "iso-b6"),
        ("letter", "us-letter"),
        // Case and punctuation are stripped as well as the alias resolved, so a
        // hand-edited file that says `US Letter` is the same page too.
        ("US Letter", "us-letter"),
        ("B5", "iso-b5"),
    ] {
        for continuous in [false, true] {
            let old_size = size_cm(old, continuous);
            let new_size = size_cm(canonical, continuous);
            assert!(
                about(old_size.0, new_size.0) && about(old_size.1, new_size.1),
                "{old:?} laid out {old_size:?} and {canonical:?} laid out {new_size:?} \
                 (continuous: {continuous}) — they are the same sheet"
            );
        }
    }
}

/// A name the engine does not know is a page of A4 **and a warning naming it**.
///
/// It used to be neither: the name went to Typst's closed enum and the whole
/// document failed to compile with an error about `#מסמך`. Now the page falls
/// back to A4 — which the warning says — and the writer is told which setting
/// they misspelled. The warning is the point: silence is the failure this issue
/// is about, and an A4 page with no word about it is the same silence the
/// second table produced.
#[test]
fn an_unknown_paper_is_a4_and_says_so() {
    let cfg = DocConfig {
        paper: "bogus".to_string(),
        ..DocConfig::default()
    };
    let doc = probe::layout("טקסט\n", &cfg).expect("an unknown paper still lays out");
    let page = doc.pages().first().expect("a page");
    let w = page.frame.width().to_pt() / PER_CM;
    let h = page.frame.height().to_pt() / PER_CM;
    assert!(
        about(w, 21.0) && about(h, 29.7),
        "an unknown paper came out {w:.2}×{h:.2}cm, not A4 — and A4 is what the warning says"
    );

    // And the word about it, through the public entry point that a caller reads.
    let compiled = ksav_engine::compile("טקסט\n", &cfg);
    let said = compiled
        .diagnostics
        .iter()
        .map(|d| format!("{} {}", d.message, d.raw))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        said.contains("bogus"),
        "the document laid out on A4 and nothing named the paper that was refused: {said}"
    );
}

/// The prelude holds no paper table of its own.
///
/// **This is the sweep the issue asked for** — *"a table written down twice, in
/// two languages, with no cross-check, so the next one is caught by a sweep
/// rather than by a document that happens to use `b5`."* A test that renders
/// each paper fixes today's table; this one makes tomorrow's author add a second
/// copy deliberately, by finding this comment first.
///
/// The prelude may not name a paper size in millimetres or centimetres. It is
/// sent `נייר_רוחב` from the engine's one table instead, so the only lengths it
/// should hold are the margin ratios, which are not paper sizes.
#[test]
fn the_prelude_holds_no_second_paper_table() {
    let cfg = DocConfig::default();
    let prelude = ksav_engine::compile_parts(
        "טקסט\n",
        &cfg,
        &ksav_engine::assets::Assets::default(),
        ksav_engine::Wants::export(),
        &Default::default(),
    )
    .typst_source;
    for (i, line) in prelude.lines().enumerate() {
        // A paper size written as a bare length: `297mm`, `210mm`. These are the
        // widths the second table carried.
        for wrong in [
            "297mm", "148mm", "216mm", "210mm", "420mm", "176mm", "250mm", "125mm",
        ] {
            assert!(
                !line.contains(wrong),
                "the prelude holds the paper width {wrong:?} at line {} — the table lives \
                 in engine/src/lib.rs::paper_cm_of and reaches the prelude as נייר_רוחב; \
                 a length here is a second table coming back (#106):\n  {line}",
                i + 1
            );
        }
    }
    // And the parameter it must use instead exists and is read.
    assert!(
        prelude.contains("נייר_רוחב"),
        "the prelude no longer reads נייר_רוחב — the continuous path has no width again"
    );
}

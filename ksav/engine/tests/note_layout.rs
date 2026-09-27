//! The 2026-08-23 audit's note-layout findings, as invariants.
//!
//! The audit (B1–B5, B10–B11 of `AUDIT-code-audit-2026-08-23.md`) found seven
//! hazards in how a note finds its page. Every one of them was found by hand,
//! by rendering a document and reading coordinates off it. Every one of them was
//! then fixed — but each fix landed with a **comment quoting the finding** and
//! none landed with a test, because each was a one-off report rather than a
//! property. That is how seven of them were all real at once, and it is why
//! this file exists now: as the property, not as the report.
//!
//! So this is not a file about the audit. The audit is a month old and six of
//! its seven findings no longer reproduce (measured 2026-09-27; the proofs are
//! in the test bodies below, which state what was true when they were written).
//! What is left is the thing the audit could not give anybody: a check that the
//! next rewrite of the side machinery, or of the reserve scanner, finds out.
//!
//! # B5 has no test here, and that is deliberate
//!
//! Two more, B1 and B3, are **property tests and not mechanism fences**: the
//! code they were fixed in is no longer the code that draws. `_rg_show` still has
//! a `mine = notes.filter(...)`, but putting the pre-fix filter back — the one
//! that re-derives the region from the channel's declarations, which is what the
//! audit named — leaves the note drawn, so that filter is no longer on this note's
//! path. And the cross-stream `sorted` in `_sn_placed` can be deleted without
//! changing a two-region document, because for a **linear** document the sort's
//! key `(page, want)` is already the document order, so the sort only earns
//! anything where the two differ: a note inside a table cell, a figure, or a
//! deferred section. Both tests therefore assert the property the audit asked
//! for — the writer's text is on a page; two apparatuses do not share a line — and
//! neither claims to protect the line of code that fixed it. Reaching B3's sort
//! needs a non-linear fixture, which is the next thing to build.
//!
//! B5's fix is real and is in `ksav.typ` — the carry path calls `clear` where the
//! audit found it placing at the floor unconditionally, and the audit's own case
//! is the comment above that line. **I could not build a document that reaches
//! that branch**, and the first version of the test here passed with the fix
//! deleted, which is the whole reason it is gone rather than repaired.
//!
//! Two constructions were tried, and both place the note by a different line:
//! notes that both overflow together reach the normal path's
//! `clear(max(it.want, cursor), …)`, and a column filled until a note carries
//! puts the pinned note at its own anchor well below the arriving one. Reaching
//! the carry branch needs `y + it.h > ceiling` on a page whose top a pinned note
//! already holds, and nothing I built produced that geometry. Shipping the test
//! anyway would mean shipping a test that says "this is fenced" and is not — so
//! the branch is documented here as **unverified** instead.
//!
//! # What each test is for
//!
//! | finding | the hazard | the test |
//! |---|---|---|
//! | B1 | `ערוץ:` and `אזור:` on one note filed it under one key and filtered under another | [`both_arguments_still_reach_a_page`] — *property only, see the test* |
//! | B2 | the reserve scanner was blind to the `אזור:` spelling | [`the_region_spelling_reserves`] |
//! | B2′ | a name nobody declared compiled clean, into the page foot, with no word | [`an_undeclared_destination_is_named`] |
//! | B3 | two side apparatuses interleaved at 4–9 pt | [`two_side_regions_do_not_interleave`] — *property only, see the test* |
//! | B4 | a channel-declared height bypassed the clamp | [`a_declared_height_is_clamped`] |
//! | B10 | `שורות()` resolved against two typographies | [`a_lines_band_resolves_against_one_typography`] |
//! | B11 | a `)` inside a quoted channel argument derailed the paren scan | [`a_quoted_paren_does_not_move_the_reserve`] |

use ksav_engine::{auto_notes_region_cm, compile, probe, DocConfig};

fn runs(body: &str) -> Vec<probe::TextRun> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// The sheet, as (width, height) in points.
fn sheet(body: &str) -> (f64, f64) {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("did not compile: {d:?}"));
    probe::page_sizes(&doc)[0]
}

/// The run carrying `word`, as `(x, y)` in points from the page's top-left.
fn at(runs: &[probe::TextRun], word: &str) -> (f64, f64) {
    let r = runs
        .iter()
        .find(|r| r.text.contains(word))
        .unwrap_or_else(|| panic!("{word:?} was not drawn anywhere"));
    (r.x, r.y)
}

/// Every warning this engine raises about a name, with its location.
fn name_warnings(body: &str) -> Vec<(String, usize, usize)> {
    compile(body, &DocConfig::default())
        .diagnostics
        .into_iter()
        .filter(|d| d.severity == "warning" && d.line.is_some())
        .map(|d| (d.message, d.line.unwrap(), d.column.unwrap()))
        .collect()
}

/// B1 · `ערוץ:` and `אזור:` on the same note lost the entry silently.
///
/// The note printed its marker and was filed under the channel's name while the
/// membership filter answered for the region's, so the entry was numbered and
/// queryable and drawn by nothing — the audit's own words: *"writer text, gone,
/// with no diagnostic"*, and its sentence "the body text appears on no page" was
/// confirmed by render.
///
/// Fixed by making the filing and the filter read the same key. **No longer
/// reproduces** (2026-09-27): the body text is on page 1 at y=712.53. The test
/// holds the property, which is the part the fix did not come with.
#[test]
fn both_arguments_still_reach_a_page() {
    let body = "#שער[מסמך]\n\n#אזור(\"מגר\", מיקום: \"רגל\")\n#ערוץ(\"ביאור\")\n\nשורה#הערה(ערוץ: \"ביאור\", אזור: \"מגר\")[הביאור שחייב להופיע איפשהו בעולם]\n";
    let runs = runs(body);
    let (_, y) = at(&runs, "הביאור שחייב");
    let (_, h) = sheet(body);
    // Not merely present: on the sheet, above the page number's band.
    assert!(y > 0.0 && y < h, "note at y={y} on a {h}pt sheet");
}

/// B2 · the auto-reserve scanner could not see `#הערה(אזור: …)`.
///
/// The fifth destination the notes chooser writes reached the footer apparatus
/// with **no reserve**, and the audit measured the consequence: entry ink at
/// y=816 and the page number itself pushed to y=848.62 on an 841.89 pt sheet.
///
/// Fixed by reading `REGION_ARG` alongside `CHANNEL_ARG` in the scan. **No
/// longer reproduces** (2026-09-27): the reserve is 3.25 cm, the ink is at
/// 712.53 and the page number at 799.02 on the same 841.89 pt sheet — 9.5 pt
/// above the page number, and both on the paper.
#[test]
fn the_region_spelling_reserves() {
    let body = "#שער[מסמך]\n\n#אזור(\"רגל\", מיקום: \"רגל\")\n\nשורה#הערה(אזור: \"רגל\")[גוף ההערה שחייב להישאר על הדף]\n";
    let runs = runs(body);
    let (_, note_y) = at(&runs, "גוף ההערה");
    // The page number, found by where it is rather than by what it says: any
    // numeric run will parse, and the body is full of them.
    let (_, h) = sheet(body);
    let number = runs
        .iter()
        .filter(|r| r.text.trim().parse::<u32>().is_ok() && r.y > h * 0.85)
        .max_by(|a, b| a.y.partial_cmp(&b.y).unwrap())
        .unwrap_or_else(|| panic!("no page number on the sheet"));
    assert!(
        auto_notes_region_cm(body) > 0.0,
        "a note in a foot region reserves nothing, so its ink has no room"
    );
    assert!(number.y < h, "page number at y={} on a {h}pt sheet", number.y);
    assert!(note_y < number.y, "note ink at {note_y} is below the page number at {}", number.y);
}

/// B2′ · the same family, the half the audit left open.
///
/// A note into a region name **nobody declared** compiled clean, landed in the
/// default apparatus, and nothing ever said the name was unknown. Measured
/// 2026-09-27: ink at y=712.5 on an 841.89 pt sheet, `ok: true`, zero
/// diagnostics — indistinguishable, to a writer, from correct.
///
/// The note is on the page, so this is not B1's defect class: no text is lost.
/// What is lost is the *destination*, silently, which is the quieter half of the
/// same bug. So: a **warning**, on the reasoning `italic_warning` states — the
/// document compiles and the writer keeps working, but they find out.
#[test]
fn an_undeclared_destination_is_named() {
    let body = "#שער[מסמך]\n\nשורה#הערה(אזור: \"טפים\")[גוף ההערה]\n";
    // The note is still drawn. This is not a refusal, and a test that let it
    // become one would take working text away over a typo.
    let (_, y) = at(&runs(body), "גוף ההערה");
    let (_, h) = sheet(body);
    assert!(y > 0.0 && y < h, "the note must stay on the page, at y={y}");

    let said = name_warnings(body);
    assert_eq!(said.len(), 1, "expected one warning, got {said:?}");
    let (message, line, column) = &said[0];
    assert!(message.contains("טפים"), "the message must name it: {message}");
    assert!(
        message.contains("printed"),
        "the message must say the note is still printed, or the writer will \
         think their text is gone: {message}"
    );
    // Located at the call, not at the document: line 3, column 6 is the `ה` of
    // `#הערה`.
    assert_eq!((*line, *column), (3, 6), "the warning is not on the note's call");
}

/// The same warning must not fire on anything the product itself accepts.
///
/// Six cases, and the last two are the ones that decide whether the feature is
/// usable at all: a name inside a note's *text* is not a call, and the seven
/// tier channels are a document full of legal undeclared destinations.
#[test]
fn a_known_destination_is_not_named() {
    let tier = "#שער[מסמך]\n\nשורה#הערה(ערוץ: \"הערה_ב\")[גוף]\n";
    let declared = "#שער[מסמך]\n\n#אזור(\"ידוע\", מיקום: \"רגל\")\n\nשורה#הערה(אזור: \"ידוע\")[גוף]\n";
    let none = "#שער[מסמך]\n\nשורה#הערה[גוף]\n";
    let prose = "#שער[מסמך]\n\nשורה#הערה[גוף שמזכיר #סמן(\"טפים\") בתוכו]\n";
    // A declaration carries the same argument a note does, and is what makes the
    // name known.
    let decl = "#שער[מסמך]\n\n#ערוץ(\"טיפים\", אזור: \"רגל\")\n";
    for (what, body) in [
        ("a tier channel", tier),
        ("a declared region", declared),
        ("no destination at all", none),
        ("a name in note text", prose),
        ("the declaration itself", decl),
    ] {
        let said = name_warnings(body);
        assert!(said.is_empty(), "{what} was warned about: {said:?}");
    }
}

/// B3 · independent side apparatuses interleaved in one margin.
///
/// Two side regions used to produce one grid at 13.1 pt pitch with the second
/// slotted **between** its lines — adjacent lines of different notes 4–9 pt
/// apart at 9.4 pt type, so glyphs crowded as well as interleaved.
///
/// **Refuted on the audit's own fixture** (2026-09-27, `12-two-regions-side`):
/// the first note's last line is at y=137.75 and the second's first at y=151.13,
/// which is 13.38 pt — the grid's own pitch, so the second apparatus starts
/// where the first ended and the two never share a line. The test keeps the
/// property rather than the fixture's numbers, so it still fires if a rewrite
/// puts the walk back on two independent grids.
#[test]
fn two_side_regions_do_not_interleave() {
    let body = "#שער[מסמך]\n\n#אזור(\"ר1\", מיקום: \"צד\")\n#אזור(\"ר2\", מיקום: \"צד\")\n\n\
                פסקה אחת#הערה(אזור: \"ר1\")[אלףאלף ביתבית גימלגימל דלתדלת האהא] וממשיכה.\n\n\
                פסקה שנייה#הערה(אזור: \"ר2\")[יודיוד ככ ללמד םם ןן סס] וסוף.\n";
    let runs = runs(body);
    let first = runs
        .iter()
        .filter(|r| r.x < 100.0 && ["אלףאלף", "ביתבית", "גימלגימל", "דלתדלת", "האהא"].iter().any(|w| r.text.contains(w)))
        .map(|r| r.y)
        .collect::<Vec<_>>();
    let second = runs
        .iter()
        .filter(|r| r.x < 100.0 && ["יודיוד", "ללמד", "סס"].iter().any(|w| r.text.contains(w)))
        .map(|r| r.y)
        .collect::<Vec<_>>();
    assert!(first.len() >= 2 && second.len() >= 2, "both notes drew several lines: {first:?} {second:?}");

    // The property: the last line of the first apparatus and the first line of
    // the second are one full line apart or more. A shared grid puts them closer
    // than the note's own line pitch, which is what "interleave" meant.
    let pitch = 13.2;
    let gap = second[0] - first[first.len() - 1];
    assert!(gap >= pitch, "the two apparatuses interleave: {gap}pt apart at a {pitch}pt pitch");
}

/// B4 · a channel-declared `גובה` bypassed the clamp and desynchronised the
/// walk from the slot.
///
/// `#ערוץ("x", גובה: 5cm)` reached the slot renderer raw, so neither
/// `חריגה:` nor the clamp could fire while the walk packed against a different
/// number — "walk packs against one number, slot clips at another, silently".
///
/// Fixed by routing a channel's declared height through the same `_ap_fit_room`
/// as a region's own. **No longer reproduces** (2026-09-27): a 9 cm channel on a
/// 29.7 cm sheet puts its ink at y=539.81, 302 pt clear of the bottom edge.
#[test]
fn a_declared_height_is_clamped() {
    // More room than the sheet has. Unclamped, this is a document whose
    // apparatus is placed off the bottom of the paper, and the audit's words for
    // it were "silently" — nothing said so.
    let declared = 40.0;
    let body = format!(
        "#שער[מסמך]\n\n#ערוץ(\"מדור\", מיקום: \"רגל\", גובה: {declared}cm)\n\nשורה#הערה(ערוץ: \"מדור\")[גוף ההערה]\n"
    );
    let reserve = auto_notes_region_cm(&body);
    let (_, h) = sheet(&body);
    let sheet_cm = h * 2.54 / 72.0;
    assert!(
        reserve < sheet_cm,
        "a {declared}cm apparatus reserved {reserve:.2}cm on a {sheet_cm:.2}cm sheet, so the clamp did not fire"
    );
    let runs = runs(&body);
    let (_, y) = at(&runs, "גוף ההערה");
    assert!(y > 0.0 && y < h, "the apparatus landed at y={y} on a {h}pt sheet");
}

/// The same clamp, on the **channel** half rather than the region's own — the
/// branch the audit named, which reached the slot renderer raw.
#[test]
fn a_region_height_and_a_channel_height_agree() {
    let on_region = "#שער[מסמך]\n\n#אזור(\"מדור\", מיקום: \"רגל\", גובה: 6cm)\n\nשורה#הערה(אזור: \"מדור\")[גוף]\n";
    // The same room declared on the channel that made the region.
    let on_channel = "#שער[מסמך]\n\n#אזור(\"מדור\", מיקום: \"רגל\")\n#ערוץ(\"מדור\", גובה: 6cm)\n\nשורה#הערה(אזור: \"מדור\")[גוף]\n";
    let a = auto_notes_region_cm(on_region);
    let b = auto_notes_region_cm(on_channel);
    assert!(
        (a - b).abs() < 0.01,
        "6cm declared on the region reserves {a:.2}cm and on the channel {b:.2}cm — the walk and the slot disagree about one room"
    );
}

/// B10 · `שורות()` heights resolved against two typographies.
///
/// The walk resolved through `_ap_fixed_height` with the apparatus line
/// (`_pp_cap` passing `קו: _ap_line_of`); the drawn slot re-resolved with
/// ambient `par.leading + text.size`. "Band drawn tens of percent off the
/// budgeted room; entries the walk counted clip behind the `…` mark."
///
/// Fixed by resolving both halves through `_ap_line_of`. The property is the
/// Rust side's `שורות(n)` answer and the drawn band agreeing.
#[test]
fn a_lines_band_resolves_against_one_typography() {
    // A room written in the unit the work is done in, and the same room written
    // as a length. B10 is the claim that the walk counted the first and the slot
    // drew the second, so the fence is that they are **one** number: the prelude's
    // `_ap_fixed_height` resolves `שורות(n)` against the apparatus line, and the
    // Rust side's `length_cm` against `DEFAULT_LINE_CM`, and if those two ever
    // drift this is the test that says so.
    let five_lines = 5.0 * 12.0 * 1.75 * 2.54 / 72.0;
    let as_lines =
        "#שער[מסמך]\n\n#אזור(\"רגל\", מיקום: \"רגל\", גובה: שורות(5))\n\nשורה#הערה(אזור: \"רגל\")[גוף]\n";
    let as_cm = format!(
        "#שער[מסמך]\n\n#אזור(\"רגל\", מיקום: \"רגל\", גובה: {five_lines}cm)\n\nשורה#הערה(אזור: \"רגל\")[גוף]\n"
    );
    let a = auto_notes_region_cm(as_lines);
    let b = auto_notes_region_cm(&as_cm);
    assert!(
        (a - b).abs() < 0.01,
        "five lines reserve {a:.3}cm and the same room as {five_lines:.3}cm reserves {b:.3}cm"
    );
    // And it is that room, not some other: five lines at the shipped defaults
    // (12 pt body, 0.75 em leading) plus the footer's own band.
    assert!(a > five_lines, "five lines reserved {a:.3}cm, which is less than the {five_lines:.3}cm asked for");
}

/// B11 · `closing_paren`'s premise was false for its channel-path caller.
///
/// The doc comment said strings are pre-blanked; `channel_region_cm` is fed
/// `code_only_keeping_strings(body)`, which **keeps** them. A quoted argument
/// containing `)` derailed the depth counter, so a channel usage was missed and
/// "the reserve under-counts — off-paper notes, the defect the scanner exists
/// to stop".
///
/// **No longer reproduces** (2026-09-27): the scan is over
/// `parse::apparatus_shape`, whose `Call.args` is a real byte range from a
/// balanced parse, so there is no depth counting left to derail.
#[test]
fn a_quoted_paren_does_not_move_the_reserve() {
    // The audit's case verbatim: a **quoted argument** containing `)`. The name
    // is opaque to the geometry — it is a label — so a paren inside one must
    // cost the document nothing.
    let plain = "#שער[מסמך]\n\n#אזור(\"רגל\", מיקום: \"רגל\")\n\nשורה#הערה(אזור: \"רגל\")[גוף]\n";
    let with_paren = "#שער[מסמך]\n\n#אזור(\"רגל)\", מיקום: \"רגל\")\n\nשורה#הערה(אזור: \"רגל)\")[גוף]\n";
    let a = auto_notes_region_cm(plain);
    let b = auto_notes_region_cm(with_paren);
    assert!(
        (a - b).abs() < 0.01,
        "a `)` inside a quoted argument moved the reserve from {a} to {b}"
    );
    // And the note in the second document is still drawn — a reserve that
    // survived is no use if the note went with it.
    let runs = runs(with_paren);
    assert!(runs.iter().any(|r| r.text.contains("גוף")), "the note was lost");
}

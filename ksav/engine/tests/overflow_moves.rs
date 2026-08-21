//! Thing four's overflow moves, as differences on the page.
//!
//! `NOTES-PLAN.md` thing four names ten moves and decision 12 says none of them
//! is hard-coded. Two shipped first — compress and spill — and the rest were
//! refused by name on the argument that a word which compiles and does nothing
//! is the defect class `settings_live.rs` exists to catch.
//!
//! So every move built since has to be **shown**, and shown the only way that
//! counts: two documents differing in one word of `גלישה`, laid out, measured,
//! and different. A move that cannot be told apart from not having it is not
//! built, whatever the prelude says.
//!
//! The reason this file is worth its weight is the bug it would have caught.
//! The baseline grid's first draft applied its leading through a `context` block
//! wrapped around the apparatus body — and `measure()` of content with a
//! `context` inside it comes back at almost nothing. Every entry measured about
//! half a line, every region looked like it fitted, and **not one overflow move
//! ever fired**. The output was unchanged, the suite was green, and the feature
//! was gone.

use ksav_engine::{probe, DocConfig};

fn corpus(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/notes-corpus")
        .join(format!("{name}.ksav"));
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

fn laid(name: &str) -> Vec<probe::TextRun> {
    let body = corpus(name);
    let doc = probe::layout(&body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("{name} did not compile: {d:?}"));
    probe::text_runs(&doc)
}

/// The runs of the apparatus at the foot of the page — everything set smaller
/// than the body, and below it.
fn apparatus(runs: &[probe::TextRun]) -> Vec<&probe::TextRun> {
    runs.iter()
        .filter(|r| r.y > 600.0 && r.size < 11.0)
        .collect()
}

/// The size the apparatus entries are set at. The page number is set at the
/// apparatus size too and carries no letters, so entries are the runs with
/// something in them.
fn entry_size(name: &str) -> f64 {
    let runs = laid(name);
    let ap = apparatus(&runs);
    let e = ap
        .iter()
        .find(|r| r.text.chars().filter(|c| c.is_alphabetic()).count() > 4)
        .unwrap_or_else(|| panic!("{name}: no apparatus entry found"));
    e.size
}

/// `"הקטנה"` — thing four's move seven, dropping a type size.
///
/// Same three notes, same 0.6cm region, one word of `גלישה` apart. The floor is
/// 80% and the ladder stops at the first rung that fits, so the shrunk document
/// is set at some size strictly between the floor and the unshrunk one.
#[test]
fn dropping_a_type_size_sets_the_region_smaller() {
    let plain = entry_size("ov_clip2");
    let shrunk = entry_size("ov_shrink2");
    assert!(
        shrunk < plain,
        "גלישה: (\"הקטנה\",) left the apparatus at {plain}pt — the move did nothing"
    );
    assert!(
        shrunk >= plain * 0.79,
        "the shrink floor is 80%: {shrunk}pt against {plain}pt is past it"
    );
}

/// A region that may not shrink is not shrunk. The control half of the pair —
/// without it the test above passes on a prelude that shrinks everything.
#[test]
fn a_region_that_was_not_asked_to_shrink_is_left_alone() {
    let plain = entry_size("ov_clip2");
    assert!(
        (plain - 10.2).abs() < 0.2,
        "גלישה: () changed the type size to {plain}pt, and it was asked for nothing"
    );
}

/// `"רצף"` — thing four's move four, running the band in.
///
/// Six notes, one line. The saving is the whole point: twelve one-line entries
/// run in are three lines and not twelve, which is what lets a region hold a
/// commentary it otherwise could not.
#[test]
fn running_the_region_in_puts_every_entry_on_one_line() {
    let runs = laid("ov_runin");
    let ap = apparatus(&runs);
    let entries: Vec<_> = ap
        .iter()
        .filter(|r| r.text.chars().filter(|c| c.is_alphabetic()).count() > 3)
        .collect();
    // Distinct *lines*, not runs: each entry keeps its own text run even when
    // the six of them share one line, which is exactly what running in means.
    let mut ys: Vec<f64> = entries.iter().map(|r| r.y).collect();
    ys.dedup_by(|a, b| (*a - *b).abs() < 0.5);
    assert_eq!(
        ys.len(),
        1,
        "six notes run in came out as {} lines: {:?}",
        ys.len(),
        entries.iter().map(|r| &r.text).collect::<Vec<_>>()
    );
    // …and all six are in it, which is the half that says nothing was lost.
    let band: String = entries.iter().map(|r| r.text.clone()).collect();
    for n in ["קצרה א", "קצרה ב", "קצרה ג", "קצרה ד", "קצרה ה", "קצרה ו"]
    {
        assert!(band.contains(n), "{n} is not in the run-in band: {band:?}");
    }
}

/// The baseline grid, as the one number that says whether it works.
///
/// `grid_on` declares a 16pt grid and its body lines advance by exactly 16pt.
/// `grid_off` gets the font's own metrics, which are not 16 and are not round.
/// The exactness is what `top-edge`/`bottom-edge` buy: they make the line box
/// exactly 1em whatever the family, so the advance is exactly `leading + size`.
#[test]
fn a_baseline_grid_advances_by_exactly_the_grid() {
    let advance = |name: &str| {
        let runs = laid(name);
        let mut body: Vec<f64> = runs
            .iter()
            .filter(|r| r.size > 11.0 && r.y < 300.0)
            .map(|r| r.y)
            .collect();
        // The first two lines of one paragraph: consecutive, and the smallest
        // gap on the page, since a paragraph break is always at least as large.
        body.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mut ys = body;
        ys.dedup_by(|a, b| (*a - *b).abs() < 0.5);
        let mut gaps: Vec<f64> = ys.windows(2).map(|w| w[1] - w[0]).collect();
        gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());
        gaps[0]
    };
    let on = advance("grid_on");
    assert!(
        (on - 16.0).abs() < 0.05,
        "a 16pt baseline grid advanced by {on}pt"
    );
    let off = advance("grid_off");
    assert!(
        (off - 16.0).abs() > 0.5,
        "grid_off advanced by {off}pt, which is the grid — the control is not a control"
    );
}

/// An overflow move nobody built is refused, and the message says what exists.
#[test]
fn an_unbuilt_move_is_refused_by_name() {
    let Err(d) = probe::layout(
        "#אזור(\"צר\", גלישה: (\"קסם\",))\nטקסט.",
        &DocConfig::default(),
    ) else {
        panic!("an unknown overflow move compiled")
    };
    let text = format!("{d:?}");
    assert!(
        text.contains("גלישה") && text.contains("הקטנה"),
        "the refusal does not list the moves that exist: {text}"
    );
}

/// The three moves that are the invariant are refused *differently*: they are
/// not missing, they are always on, and a writer told "unknown move" about
/// clamping would go looking for a way to turn it on.
#[test]
fn an_always_on_move_says_it_is_always_on() {
    let Err(d) = probe::layout(
        "#אזור(\"צר\", גלישה: (\"מפל\",))\nטקסט.",
        &DocConfig::default(),
    ) else {
        panic!("an always-on overflow move compiled")
    };
    let text = format!("{d:?}");
    assert!(
        text.contains("invariant") || text.contains("תמיד"),
        "the refusal reads like the move does not exist: {text}"
    );
}

/// `שומר_מקום` — whether a region keeps its slot on a page where it is empty.
///
/// This is the setting that was written and **reverted** the night before,
/// because it could not be shown to change anything on four documents. It could
/// not, and the reason was not the setting: a region that declared a height was
/// not laid out at all on a page it had nothing on, so neither answer was
/// happening and there was nothing for the word to switch between. Two bugs
/// under one dead knob — and the second was that regions printed in the order a
/// note happened to be written rather than the order they were declared, so two
/// regions swapped places from page to page.
///
/// The document has an upper region that is empty on page one. Holding its place
/// pushes the lower region down; not holding it lets the lower region rise.
#[test]
fn an_empty_region_holds_its_place_or_frees_it() {
    let first_note = |name: &str| {
        let runs = laid(name);
        runs.iter()
            .filter(|r| r.page == 1 && r.y > 600.0 && r.y < 780.0 && r.size < 11.0)
            .map(|r| r.y)
            .fold(f64::MAX, f64::min)
    };
    let holds = first_note("hold_yes");
    let frees = first_note("hold_no");
    assert!(
        holds > frees + 20.0,
        "שומר_מקום changed nothing: the lower region sits at {holds} either way"
    );
}

/// The other half, and the one that says the *default* works. A region that
/// holds its place must hold the same place on every page — that is what fixed
/// geometry means, and a region that only appears when it has something in it
/// is a region that moves.
#[test]
fn a_held_region_sits_in_the_same_place_on_every_page() {
    let runs = laid("hold_yes");
    let lower: Vec<f64> = runs
        .iter()
        .filter(|r| r.size < 11.0 && r.text.contains("בתחתון"))
        .map(|r| r.y)
        .collect();
    assert_eq!(lower.len(), 2, "expected the lower region on both pages");
    assert!(
        (lower[0] - lower[1]).abs() < 0.5,
        "the lower region moved between pages: {:?}",
        lower
    );
}

/// A note taller than its whole region is **cut** across pages, word by word.
///
/// This is the one thing decision 6 forbids that was still happening. A note
/// that did not fit its slot was **truncated** — `_ap_slot` clips, so the second
/// half was masked away and the page read as a short apparatus — and neither
/// `"עמוד_הבא"` nor `"דחיסה"` moved it by a single point, because a page footer
/// is composed afresh on every page and has no continuation.
///
/// So the note spills *into itself*: it occupies as many pages as it takes, and
/// each of them shows one region's worth. Two mechanisms can do that and the
/// engine keeps both, because they fail in opposite directions:
///
///   * **The window** emits the note whole into every page it runs through and
///     paints all but that page's share outside the slot. Exact on any content,
///     and the note lands in the *text layer* of every page it passes through.
///   * **The cut** gives each page only its own words. One text layer, and it
///     only works where the body is words.
///
/// This test is the cut, and what it asserts is the property the window could
/// never have: **every word exactly once, in order, across the pages.** A
/// mechanism that shows the right thing and says it four times is not a
/// mechanism a reader can search, copy out of, or export.
#[test]
fn a_note_taller_than_its_region_is_cut_across_pages() {
    let runs = laid("giant_spill");
    let lines = probe::lines(&runs, 2.0);
    // The apparatus is what is set small and low; `word_pages` is where each
    // word of the note was printed, in the order the pages come.
    let mut word_pages: Vec<(usize, String)> = Vec::new();
    for l in lines
        .iter()
        .filter(|l| l.y > 600.0 && l.runs.first().is_some_and(|r| r.size < 11.0))
    {
        for w in l.reading.split_whitespace() {
            if w.starts_with("מילה") {
                word_pages.push((l.page, w.to_string()));
            }
        }
    }
    let pages: Vec<usize> = {
        let mut p: Vec<usize> = word_pages.iter().map(|(p, _)| *p).collect();
        p.dedup();
        p
    };
    assert!(
        pages.len() >= 2,
        "an over-tall note stayed on {} page(s) — it was truncated, not spilled",
        pages.len()
    );

    // Every word, once. The window's own output on this same corpus put all
    // fifty on page one and all fifty again on page two.
    let printed: Vec<&str> = word_pages.iter().map(|(_, w)| w.as_str()).collect();
    let expected: Vec<String> = (1..=50).map(|i| format!("מילה{i:02}")).collect();
    assert_eq!(
        printed.len(),
        50,
        "fifty words were written and {} were printed: {printed:?}",
        printed.len()
    );
    assert!(
        printed.iter().zip(expected.iter()).all(|(a, b)| a == b),
        "the words came out in the wrong order or with something missing: {printed:?}"
    );

    // The seam is a seam and not a repeat. The equality above already proves it;
    // this names the page it fell on, so a regression reads as a moved cut
    // rather than as fifty words in the wrong order.
    let first_of_second: &str = word_pages
        .iter()
        .find(|(p, _)| *p == pages[1])
        .map(|(_, w)| w.as_str())
        .expect("the second page of the note printed nothing");
    let last_of_first: &str = word_pages
        .iter()
        .rev()
        .find(|(p, _)| *p == pages[0])
        .map(|(_, w)| w.as_str())
        .expect("the first page of the note printed nothing");
    assert_eq!(
        (last_of_first, first_of_second),
        ("מילה28", "מילה29"),
        "the cut moved — the region holds fourteen words to a line and two lines"
    );
}

/// The note's number is printed once, at its head, and not again on every page.
///
/// A continued note has never been set with its number repeated, and the window
/// gets that for free — the marker is at the top of the note and has slid out of
/// the slot. The cut has to be told, and `סימן_בהמשך` is where a sefer that wants
/// it back says so. Asserted because *"the two mechanisms agree"* is a claim, and
/// an unasserted claim about a page is a claim about a page nobody looked at.
#[test]
fn a_cut_note_carries_its_number_only_on_its_first_page() {
    let runs = laid("giant_spill");
    let lines = probe::lines(&runs, 2.0);
    let head = lines
        .iter()
        .find(|l| l.reading.contains("מילה01"))
        .expect("the note's first line is missing");
    assert!(
        head.reading.contains('1'),
        "the note's first line carries no number: {:?}",
        head.reading
    );
    // The head, once. Twice would be the note itself repeated, which is the
    // window's cost and the reason the cut exists.
    assert_eq!(
        lines
            .iter()
            .filter(|l| l.reading.contains("מילה01"))
            .count(),
        1,
        "the note's first words printed on more than one page"
    );
    // …and the continuation begins with a word, not with a number.
    let cont = lines
        .iter()
        .find(|l| l.reading.contains("מילה29") && l.page > head.page)
        .expect("the note's continuation is missing");
    assert!(
        cont.reading.starts_with("מילה29"),
        "the number was repeated on the continuation: {:?}",
        cont.reading
    );
}

/// A body with no text in it keeps the window, and the window still works.
///
/// `_ct_text` answers `none` for anything that is not words — a table, a figure,
/// a nested apparatus, and, as this corpus shows, one bolded word — and there is
/// nothing to cut at. So the note is emitted whole into every page it runs
/// through and slid by exactly one slot each time, which is what this asserts.
///
/// Kept as a test rather than treated as a limitation to be removed, because the
/// two mechanisms are not a stopgap and its replacement: the window is the only
/// one that is exact on arbitrary content, and a sefer that mixes both wants
/// both. What *is* worth removing one day is how little it takes to fall back —
/// one bolded word — and that is `meander`'s recursion into nested content,
/// written down in the decision record and not built here.
#[test]
fn a_body_that_cannot_be_cut_is_still_spilled_by_the_window() {
    let runs = laid("giant_spill_uncuttable");
    let pages: Vec<usize> = {
        let mut p: Vec<usize> = runs
            .iter()
            .filter(|r| r.y > 600.0 && r.y < 790.0 && r.size < 11.0)
            .map(|r| r.page)
            .collect();
        p.sort_unstable();
        p.dedup();
        p
    };
    assert!(
        pages.len() >= 2,
        "an uncuttable over-tall note stayed on {} page(s)",
        pages.len()
    );
    // The whole note on both pages — that is the window's cost, and asserting it
    // is how the cost stays visible instead of being rediscovered later.
    let on = |page: usize| -> usize {
        probe::lines(&runs, 2.0)
            .iter()
            .filter(|l| l.page == page && l.y > 600.0 && l.reading.contains("מילה"))
            .count()
    };
    assert_eq!(
        on(pages[0]),
        on(pages[1]),
        "the window is meant to emit the note whole into both pages"
    );
    // **A whole number of lines, not the height of the slot.** The slot is 1.2cm
    // = 34.02pt and the line advance is 14.38pt, so the slot is 2.34 lines — and
    // sliding by 34.02 put the third line half on one page and half on the next,
    // top of the glyphs here and bottom of them overleaf. It slides by 28.76 now,
    // two whole lines, and is clipped to the same, leaving 5.25pt of white space
    // at the foot of the region. `svgdump` shows both rectangles; `probe` cannot
    // see either, which is why the number below is the one thing asserted here.
    //
    // Exact rather than approximate: a window that drifts is, over enough pages,
    // a note with a line missing from the middle of it.
    let top = |page: usize| {
        runs.iter()
            .filter(|r| r.page == page && r.y > 600.0 && r.y < 790.0 && r.size < 11.0)
            .map(|r| r.y)
            .fold(f64::MAX, f64::min)
    };
    let step = top(pages[0]) - top(pages[1]);
    assert!(
        (step - 28.76).abs() < 0.1,
        "page two resumes {step}pt up, and two lines are 28.76pt — the window drifts"
    );
}

/// A note made of words **with a look on them** is cut, not slid.
///
/// `_ct_text` answers `none` for anything that is not bare words, and until this
/// existed that sent the note to the window — which slides the whole thing by a
/// fixed distance and **cuts through a line of type** to do it. Measured on this
/// corpus before the fix: a line split across two pages, its top half on one and
/// its bottom half on the next. One asterisk was all it took.
///
/// So the words come out of the markup instead. Two claims, and the second is
/// the one that makes it worth doing rather than a way of dropping the styling:
/// every word once, **and the bold word still bold on the other side of it**.
#[test]
fn a_note_with_a_look_on_its_words_is_still_cut() {
    let doc = probe::layout(&corpus("giant_spill_marked"), &DocConfig::default())
        .expect("giant_spill_marked did not compile");
    let runs = probe::text_runs(&doc);
    let fills = probe::fills(&doc);
    let lines = probe::lines(&runs, 2.0);
    let mut printed: Vec<String> = Vec::new();
    for l in lines
        .iter()
        .filter(|l| l.y > 600.0 && l.runs.first().is_some_and(|r| r.size < 11.0))
    {
        for w in l.reading.split_whitespace() {
            if w.starts_with("מילה") {
                printed.push(w.to_string());
            }
        }
    }
    let expected: Vec<String> = (1..=50).map(|i| format!("מילה{i:02}")).collect();
    assert_eq!(
        printed, expected,
        "a note with markup in it lost or repeated words when it was cut"
    );

    // …and the markup came through the cut. A cut that dropped the look would
    // pass the count above and be a worse bug than the window it replaced.
    let looks = |needle: &str| -> Option<(u16, bool)> {
        runs.iter()
            .find(|r| r.size < 11.0 && r.text.contains(needle))
            .map(|r| (r.weight, r.italic))
    };
    assert_eq!(
        looks("מודגש").map(|(w, _)| w >= 600),
        Some(true),
        "the bolded word came out of the cut unbolded: {:?}",
        looks("מודגש")
    );
    // The highlight, which probe reads as a fill rather than as a property of
    // the type. It has to be a fill and not an italic: Ksav has no italic Hebrew
    // face and *shears* the glyphs instead, and a shear is a transform that this
    // instrument cannot see — asked about slant it answers "upright" for a word
    // that is visibly slanted. Same trap as the clip, one property along.
    let green: Vec<&probe::Fill> = fills
        .iter()
        .filter(|f| f.colour == "#00ff00" && f.y > 600.0)
        .collect();
    assert!(
        !green.is_empty(),
        "the highlighted word came out of the cut unhighlighted"
    );
    // On one page. Two pages would be the window: the note emitted whole into
    // both of them, which is the cost the cut exists to stop paying. The count
    // itself is not asserted — Typst paints a highlight once per text run and
    // Hebrew shapes into more than one — so the claim is *where*, not *how many*.
    let pages: std::collections::BTreeSet<usize> = green.iter().map(|f| f.page).collect();
    assert_eq!(
        pages.len(),
        1,
        "the highlight was painted on more than one page: {pages:?}"
    );

    // The plain words beside them are plain, so the look did not leak outward.
    assert_eq!(
        looks("רגיל").map(|(w, i)| (w >= 600, i)),
        Some((false, false)),
        "the look leaked onto a word that never had one"
    );
}

/// A deep spill loses nothing and repeats nothing, over dozens of pages.
///
/// # The bug this is written against
///
/// The slice a page shows was worked out in the renderer as
/// `floor(offset / slot)` — the same number in arithmetic and not in floating
/// point. `slot * k / slot` lands a hair under `k` once `k` is large enough,
/// `floor` takes it to `k - 1`, and that page draws the slice before it again.
///
/// Measured on three hundred words in a one-line region: **words 97–112 printed
/// twice and 113–129 were never printed at all**, and again every seventh page
/// after that. Thirty-three words gone out of three hundred, with nothing on any
/// page to show it — no gap, no warning, no short line. The two-page corpus could
/// not see it, because at `k = 1` the arithmetic is exact.
///
/// So the number is counted rather than divided, and this asks the only question
/// that would have caught it: over twenty-one slices, is every word printed
/// exactly once, in order?
#[test]
fn a_note_spilling_over_many_pages_prints_every_word_once() {
    let body = (1..=300)
        .map(|i| format!("דד{i:03}"))
        .collect::<Vec<_>>()
        .join(" ");
    let doc = format!(
        "#מסמך(אזור_הערות: 3cm)[\n\
         #אזור(\"צר\", מיקום: \"רגל\", גובה: שורות(1), גלישה: (\"עמוד_הבא\",))\n\
         פתיחה.\n\nטקסט#הערה(אזור: \"צר\")[{body}] סוף.\n]\n"
    );
    let laid = probe::layout(&doc, &DocConfig::default())
        .unwrap_or_else(|d| panic!("the deep-spill document did not compile: {d:?}"));
    let runs = probe::text_runs(&laid);
    let mut printed: Vec<String> = Vec::new();
    for l in probe::lines(&runs, 2.0)
        .iter()
        .filter(|l| l.y > 600.0 && l.runs.first().is_some_and(|r| r.size < 11.0))
    {
        for w in l.reading.split_whitespace() {
            if w.starts_with("דד") {
                printed.push(w.to_string());
            }
        }
    }
    let expected: Vec<String> = (1..=300).map(|i| format!("דד{i:03}")).collect();
    // Named separately so a failure says *which* way it went wrong: a count that
    // is short is words lost, a count that is long is words repeated, and the
    // bug that prompted this did both at once and netted out close to right.
    assert_eq!(
        printed.len(),
        300,
        "three hundred words were written and {} were printed",
        printed.len()
    );
    let missing: Vec<&String> = expected.iter().filter(|w| !printed.contains(w)).collect();
    assert!(missing.is_empty(), "words never printed: {missing:?}");
    assert_eq!(printed, expected, "the words came out in the wrong order");
}

/// Three notes spilling through one region keep out of each other's way.
///
/// A region showing the rest of an over-tall note has no room for anything else,
/// which is what `busy` is for — and the way that goes wrong is not a crash but
/// two notes' words interleaved, or a note that waits for ever. Every word of
/// all three, each on its own pages, in order.
#[test]
fn several_spilling_notes_in_one_region_do_not_interleave() {
    let note = |tag: &str| {
        (1..=40)
            .map(|i| format!("{tag}{i:03}"))
            .collect::<Vec<_>>()
            .join(" ")
    };
    let doc = format!(
        "#מסמך(אזור_הערות: 3cm)[\n\
         #אזור(\"צר\", מיקום: \"רגל\", גובה: 1.2cm, גלישה: (\"עמוד_הבא\",))\n\
         פתיחה.\n\n\
         א#הערה(אזור: \"צר\")[{}] ב#הערה(אזור: \"צר\")[{}] ג#הערה(אזור: \"צר\")[{}] סוף.\n]\n",
        note("אא"),
        note("בב"),
        note("גג")
    );
    let laid = probe::layout(&doc, &DocConfig::default())
        .unwrap_or_else(|d| panic!("the three-note document did not compile: {d:?}"));
    let runs = probe::text_runs(&laid);
    let mut printed: Vec<String> = Vec::new();
    for l in probe::lines(&runs, 2.0)
        .iter()
        .filter(|l| l.y > 600.0 && l.runs.first().is_some_and(|r| r.size < 11.0))
    {
        for w in l.reading.split_whitespace() {
            if w.len() > 3 && (w.starts_with("אא") || w.starts_with("בב") || w.starts_with("גג"))
            {
                printed.push(w.to_string());
            }
        }
    }
    let expected: Vec<String> = ["אא", "בב", "גג"]
        .iter()
        .flat_map(|t| (1..=40).map(move |i| format!("{t}{i:03}")))
        .collect();
    assert_eq!(
        printed, expected,
        "three notes spilling through one region came out interleaved, short or repeated"
    );
}

/// A grid region: parallel columns, kept in register by a unit.
///
/// Thing three's other half. `פריסה: "צד"` has meant *"these channels sit beside
/// each other"* since channels existed, and it could not say how wide they were
/// or keep them level. Two keys finish it — `טורים` for the widths and `יחידה`
/// for what the columns are synchronised on — and there is no new word for
/// grid-versus-box, because a region whose channels sit side by side **is** the
/// parallel-column arrangement. The naming record's open question answers itself.
///
/// Register is the whole point. Without `יחידה` each channel is one long cell
/// and the columns drift apart by however much their contents differ, which is
/// what makes amateur parallel typesetting look wrong and what no care inside a
/// column can fix. With it there is one grid row per unit, and a grid row starts
/// level by construction.
#[test]
fn a_grid_region_keeps_its_columns_in_register() {
    let runs = laid("grid_region");
    // Grouped by baseline, not by run. The two columns of a row are two runs at
    // the same y — which is precisely what register means, so a test that counts
    // runs is counting the thing it is supposed to be proving.
    let mut rows: Vec<(f64, String)> = Vec::new();
    let mut band: Vec<&probe::TextRun> = runs
        .iter()
        .filter(|r| r.y > 600.0 && r.y < 780.0 && r.size < 11.0 && r.text.contains("סימן"))
        .collect();
    band.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap());
    for r in band {
        match rows.last_mut() {
            Some((y, t)) if (*y - r.y).abs() < 0.5 => t.push_str(&r.text),
            _ => rows.push((r.y, r.text.clone())),
        }
    }
    assert_eq!(
        rows.len(),
        2,
        "expected one row per siman, got {}: {:?}",
        rows.len(),
        rows.iter().map(|r| &r.1).collect::<Vec<_>>()
    );
    // Both channels of a unit share a row, which is what register *is*: the
    // commentary on siman alef is level with the other commentary on siman alef.
    for (_, t) in &rows {
        assert!(
            t.contains("רשי") && t.contains("תוספות"),
            "a row holds only one channel, so the columns are not in register: {t:?}"
        );
    }
    assert!(
        (rows[0].0 - rows[1].0).abs() > 5.0,
        "the two simanim landed on one row"
    );
}

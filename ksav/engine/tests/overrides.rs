//! Global by default, per-instance by override — the same three rules, nine kinds.
//!
//! The writer's model, in the writer's own words:
//!
//!   1. A **global** layer sets the default for a kind of thing.
//!   2. An **individual** setting on one instance overrules the global.
//!   3. A checkbox on the global — *overrule* — stomps every individual setting.
//!
//! Layer 1 existed for every kind. Layer 2 existed for two of the eight table
//! knobs and for nothing else, and it did not merely go missing — the obvious
//! thing to type reached Typst's own element underneath and **stopped the
//! compile**. `#רשימה(סמן: [–])` is *"unexpected argument: סמן"*; so is
//! `#הערה(גודל: 1em)`, so is `#כותרת1(צבע: red)`, so is `#טבלה(קו: none)`. Layer 3
//! existed nowhere.
//!
//! Every assertion here reads the *rendered page* — a size in points, a slant, an
//! x position — because a styling layer that resolves correctly and reaches no
//! glyph is the failure this repo keeps finding. The prelude is `_cfg_with`, and it
//! is one function for all nine kinds precisely so that these tests can be one
//! shape repeated: set the global, override one instance, force the global back.

mod common;
use common::{render, render_with, text};

use ksav_engine::probe::{self, TextRun};
use ksav_engine::DocConfig;

// ── reading the page ────────────────────────────────────────────────────────

/// The size in points of the first run holding `needle`.
///
/// Size and not colour, because size is the knob every kind has and the probe can
/// read it off the frame. A fill is a paint on a shape, which a text run does not
/// carry — so "did the override apply" is asked in points throughout.
fn size_of(runs: &[TextRun], needle: &str) -> f64 {
    runs.iter()
        .find(|r| r.text.contains(needle))
        .map(|r| r.size)
        .unwrap_or_else(|| {
            panic!(
                "nothing on the page holds {needle:?}; it held: {:?}",
                runs.iter().map(|r| r.text.as_str()).collect::<Vec<_>>()
            )
        })
}

/// Where the left edge of the first run holding `needle` sits.
///
/// The axis for the kinds whose knobs are distances rather than sizes. Left edge
/// and not "start", deliberately: an assertion that says *these two documents put
/// the words in different places* does not need to know which way is inward, and
/// one that claims a direction on an RTL page has to be measured before it is
/// written.
fn x_of(runs: &[TextRun], needle: &str) -> f64 {
    runs.iter()
        .find(|r| r.text.contains(needle))
        .map(|r| r.x)
        .unwrap_or_else(|| {
            panic!(
                "nothing on the page holds {needle:?}; it held: {:?}",
                runs.iter().map(|r| r.text.as_str()).collect::<Vec<_>>()
            )
        })
}

/// A document's diagnostics when it does not lay out, or a panic when it does.
///
/// Half the findings here are *"this used to stop the compile"*, so the other half
/// has to be *"and this still does"* — an override layer that swallows a
/// misspelled knob has replaced a loud error with a control that does nothing,
/// which is the trade this repo has made before and had to undo.
fn refuses(body: &str) -> String {
    match probe::layout(body, &DocConfig::default()) {
        Ok(_) => panic!("expected a compile error, and it compiled: {body:?}"),
        Err(diags) => diags
            .iter()
            .map(|d| d.message.clone())
            .collect::<Vec<_>>()
            .join(" | "),
    }
}

fn ltr() -> DocConfig {
    DocConfig {
        dir: "ltr".to_string(),
        ..DocConfig::default()
    }
}

// ── כותרות · headings ───────────────────────────────────────────────────────

/// Layer 2, which the inventory asked for after layer 1½: *"heading styles per
/// level, then per instance"*.
#[test]
fn a_heading_can_be_sized_for_itself() {
    let runs = render("#כותרת1(גודל: 3em)[גדולה]\n\nגוף\n\n#כותרת1[רגילה]\n\nעוד\n");
    let one = size_of(&runs, "גדולה");
    let two = size_of(&runs, "רגילה");
    assert!(
        one > two + 4.0,
        "the override did not reach the page: {one}pt against {two}pt"
    );
}

/// The state that carries the override from the call site to the show rule has to
/// be cleared, or the first styled heading styles every heading after it.
#[test]
fn one_headings_override_does_not_reach_the_next_heading() {
    let runs = render("#כותרת1(גודל: 3em)[ראשונה]\n\nגוף\n\n#כותרת1[שניה]\n\n#כותרת1[שלישית]\n");
    let plain_second = size_of(&runs, "שניה");
    let plain_third = size_of(&runs, "שלישית");
    assert!(
        (plain_second - plain_third).abs() < 0.01,
        "an override leaked past its own heading: {plain_second}pt then {plain_third}pt"
    );
    assert!(
        size_of(&runs, "ראשונה") > plain_second + 4.0,
        "…and did not reach the heading it belonged to"
    );
}

/// Layer 1, per level — which the engine could already do and no control could
/// reach. Asserted here because the panel now writes these arrays, and a per-level
/// array and a per-instance override have to compose rather than fight.
#[test]
fn the_global_still_takes_one_value_per_level() {
    let runs =
        render("#הגדרות_כותרות(גודל: (3em, 1em))\n\n#כותרת1[פרק]\n\nגוף\n\n#כותרת2[סימן]\n\nעוד\n");
    assert!(
        size_of(&runs, "פרק") > size_of(&runs, "סימן") + 4.0,
        "the per-level array did not separate the levels"
    );
}

/// Layer 3. The switch is on the global and it stomps the instance, which is the
/// direction that had no expression at all before.
#[test]
fn overrule_makes_the_global_win_over_a_heading() {
    let body = "#הגדרות_כותרות(גודל: 1em, כפה: true)\n\n\
                #כותרת1(גודל: 3em)[עקופה]\n\nגוף\n\n#כותרת1[רגילה]\n";
    let runs = render(body);
    let forced = size_of(&runs, "עקופה");
    let plain = size_of(&runs, "רגילה");
    assert!(
        (forced - plain).abs() < 0.01,
        "overrule did not overrule: {forced}pt against {plain}pt"
    );
}

/// …and without it, the same document keeps the override. Without this pair the
/// test above passes on a prelude that ignores per-heading arguments entirely.
#[test]
fn without_overrule_the_same_document_keeps_the_override() {
    let body = "#הגדרות_כותרות(גודל: 1em)\n\n\
                #כותרת1(גודל: 3em)[עקופה]\n\nגוף\n\n#כותרת1[רגילה]\n";
    let runs = render(body);
    assert!(
        size_of(&runs, "עקופה") > size_of(&runs, "רגילה") + 4.0,
        "the instance lost to a global that never asked to win"
    );
}

/// `force:` is the English spelling, and `#h1` had to become an `_en` wrapper to
/// accept `size:` at all — a bare alias is the same function under a second name,
/// so its parameters stayed Hebrew.
#[test]
fn the_english_spellings_carry_the_whole_model() {
    let runs = render_with(
        "#h1(size: 3em)[Big]\n\nbody\n\n#h1[Small]\n\nmore\n",
        &ltr(),
    );
    assert!(
        size_of(&runs, "Big") > size_of(&runs, "Small") + 4.0,
        "an English heading could not be sized for itself"
    );
    let forced = render_with(
        "#headings_config(size: 1em, force: true)\n\n#h1(size: 3em)[Big]\n\nbody\n\n#h1[Small]\n",
        &ltr(),
    );
    assert!(
        (size_of(&forced, "Big") - size_of(&forced, "Small")).abs() < 0.01,
        "`force:` did not overrule"
    );
}

/// A named argument the config does not know goes on to `heading` itself, so the
/// element's own parameters stay reachable and a typo still names itself.
#[test]
fn a_heading_still_takes_typsts_own_arguments() {
    render("#כותרת1(גודל: 2em, outlined: false)[פרק]\n\nגוף\n");
    let said = refuses("#כותרת1(גודלל: 2em)[פרק]\n");
    assert!(
        said.contains("גודלל"),
        "a misspelled knob was swallowed instead of named: {said}"
    );
}

// ── רשימות · lists ──────────────────────────────────────────────────────────

/// *"List styles must be per list."* The marker is the knob a writer reaches for
/// first, and `#רשימה(סמן: …)` used to be a compile error.
#[test]
fn a_list_can_carry_its_own_marker() {
    let runs = render("#רשימה(סמן: [◆], פריט[אחד], פריט[שתים])\n\n#רשימה(פריט[שלש])\n");
    let page = text(&runs);
    assert!(
        page.contains('◆'),
        "the per-list marker never printed: {page}"
    );
}

#[test]
fn a_lists_marker_does_not_become_every_lists_marker() {
    let runs = render("#רשימה(סמן: [◆], פריט[אחד])\n\n#רשימה(פריט[שתים])\n");
    let diamonds = runs.iter().filter(|r| r.text.contains('◆')).count();
    assert_eq!(
        diamonds,
        1,
        "one list's marker reached another list: {}",
        text(&runs)
    );
}

#[test]
fn overrule_makes_the_global_win_over_a_list() {
    let runs = render("#הגדרות_רשימות(סמן: [•], כפה: true)\n\n#רשימה(סמן: [◆], פריט[אחד])\n");
    let page = text(&runs);
    assert!(!page.contains('◆'), "overrule did not overrule: {page}");
    assert!(
        page.contains('•'),
        "…and the global marker did not print: {page}"
    );
}

/// A Ksav knob and a Typst parameter can arrive in the same call, and the Typst
/// one has to keep working: it is what a writer coming from Typst types, and it
/// used to be the *only* thing this call accepted.
#[test]
fn a_list_still_takes_typsts_own_arguments() {
    render("#רשימה(סמן: [◆], tight: true, פריט[אחד], פריט[שתים])\n");
    let said = refuses("#רשימה(סמןן: [◆], פריט[אחד])\n");
    assert!(
        said.contains("סמןן"),
        "a misspelled list knob was swallowed: {said}"
    );
}

/// The one enum-only knob, declared with the config on the day it was written and
/// read by nothing — so the panel could set it, the document could carry it, and
/// the page never moved.
#[test]
fn the_number_to_body_gap_finally_does_something() {
    let wide = x_of(&render("#ממוספרת(ריווח_מספור: 4em, פריט[מילה])\n"), "מילה");
    let tight = x_of(&render("#ממוספרת(פריט[מילה])\n"), "מילה");
    assert!(
        (wide - tight).abs() > 10.0,
        "ריווח_מספור moved nothing: x {wide} against {tight}"
    );
}

/// A Hebrew-lettered list is a list, and used to be the one list that ignored
/// every list setting — it went straight to `enum` with a numbering scheme and
/// nothing else.
#[test]
fn a_hebrew_lettered_list_follows_the_list_settings() {
    let runs = render("#הגדרות_רשימות(הזחה: 5em)\n\n#ממוספרת_עברית(פריט[מילה])\n");
    let indented = x_of(&runs, "מילה");
    let plain = x_of(&render("#ממוספרת_עברית(פריט[מילה])\n"), "מילה");
    assert!(
        (indented - plain).abs() > 10.0,
        "a Hebrew-lettered list ignored the document's list indent: {indented} against {plain}"
    );
    assert!(
        text(&runs).contains('א'),
        "…and stopped being Hebrew-lettered: {}",
        text(&runs)
    );
}

// ── טבלאות · tables ────────────────────────────────────────────────────────

/// Six of the eight table knobs fell through to Typst's `table` and stopped the
/// compile. This is the whole set, in one call, per table.
#[test]
fn every_table_knob_is_also_a_per_table_knob() {
    render(concat!(
        "#טבלה(עמודות: 2, קו: none, מרווח: 4pt, פסים: true, צבע_פס: luma(240), ",
        "צבע_כותרת: luma(200), גודל: 8pt, יישור: center, ",
        "תא[א], תא[ב], תא[ג], תא[ד])\n",
    ));
}

#[test]
fn a_tables_own_size_applies_to_that_table() {
    let runs = render("#טבלה(עמודות: 1, גודל: 20pt, תא[גדול])\n\n#טבלה(עמודות: 1, תא[רגיל])\n");
    let big = size_of(&runs, "גדול");
    let plain = size_of(&runs, "רגיל");
    assert!(
        big > plain + 4.0,
        "the per-table size did not apply: {big}pt against {plain}pt"
    );
}

/// The header cell reads the header fill for itself, so an override on the table
/// has to be visible to the cells of that table — a cell is content built before
/// the table it lands in and cannot be handed anything.
#[test]
fn a_tables_own_settings_reach_its_header_cells() {
    let runs = render(
        "#טבלה(עמודות: 1, גודל: 20pt, כותרת_תא[ראש], תא[גוף])\n\n\
         #טבלה(עמודות: 1, כותרת_תא[אחר], תא[עוד])\n",
    );
    assert!(
        size_of(&runs, "ראש") > size_of(&runs, "אחר") + 4.0,
        "the override stopped at the table and never reached its cells"
    );
}

#[test]
fn overrule_makes_the_global_win_over_a_table() {
    let runs = render(
        "#הגדרות_טבלאות(גודל: 8pt, כפה: true)\n\n\
         #טבלה(עמודות: 1, גודל: 20pt, תא[עקוף])\n\n#טבלה(עמודות: 1, תא[רגיל])\n",
    );
    let forced = size_of(&runs, "עקוף");
    let plain = size_of(&runs, "רגיל");
    assert!(
        (forced - plain).abs() < 0.01,
        "overrule did not overrule: {forced}pt against {plain}pt"
    );
}

// ── הערות · the tiered footnotes ───────────────────────────────────────────

#[test]
fn one_note_can_be_set_apart_from_its_neighbours() {
    let runs = render("א#הערה(גודל: 1.6em)[מיוחדת] ב#הערה[רגילה] ג\n");
    let special = size_of(&runs, "מיוחדת");
    let plain = size_of(&runs, "רגילה");
    assert!(
        special > plain + 3.0,
        "a per-note size did not apply: {special}pt against {plain}pt"
    );
}

/// A per-note override must not touch the sequence: the numbers are the reader's
/// only way back to the marker, and they are counted natively across every tier.
#[test]
fn a_styled_note_still_numbers_with_the_rest() {
    let plain = text(&render("א#הערה[אחת] ב#הערה[שתים] ג#הערה[שלש]\n"));
    let styled = text(&render(
        "א#הערה[אחת] ב#הערה(גודל: 1.6em)[שתים] ג#הערה[שלש]\n",
    ));
    for n in ['1', '2', '3'] {
        assert!(
            plain.contains(n) && styled.contains(n),
            "the numbering changed when one note was styled: {plain} / {styled}"
        );
    }
}

#[test]
fn overrule_makes_the_global_win_over_a_note() {
    let runs = render(
        "#הגדרות_הערות(גודל: 0.8em, כפה: true)\n\nא#הערה(גודל: 1.6em)[עקופה] ב#הערה[רגילה]\n",
    );
    let forced = size_of(&runs, "עקופה");
    let plain = size_of(&runs, "רגילה");
    assert!(
        (forced - plain).abs() < 0.01,
        "overrule did not overrule: {forced}pt against {plain}pt"
    );
}

/// The tier aliases are what people write. An alias that swallowed the override
/// would be a control that works on `#הערה_בדרגה(2, …)` and does nothing on
/// `#הערה_ב[…]`.
#[test]
fn a_tier_alias_forwards_the_override() {
    let runs = render("א#הערה[ראשונה #הערה_ב(גודל: 1.4em)[מיוחדת]] ב#הערה[ב #הערה_ב[רגילה]]\n");
    assert!(
        size_of(&runs, "מיוחדת") > size_of(&runs, "רגילה") + 2.0,
        "#הערה_ב dropped the per-note override on the floor"
    );
}

/// `#הערה_על_הערה` styled itself with two numbers written into its own definition
/// and read `#הגדרות_הערות` not at all — a knob nothing reads and a construct that
/// ignores every knob are the same defect from opposite ends. It is tier 2 now,
/// which is what its own deprecation notice already told writers to use instead.
#[test]
fn a_note_on_a_note_follows_the_note_settings() {
    let runs = render("#הגדרות_הערות(גודל: (1em, 1.8em))\n\nא#הערה[ראשונה #הערה_על_הערה[תת]]\n");
    assert!(
        size_of(&runs, "תת") > size_of(&runs, "ראשונה") + 3.0,
        "the sub-note ignored the tier-2 size it was configured with"
    );
}

// ── מדפים וזרמים · page bands and parallel streams ─────────────────────────

#[test]
fn one_banded_note_can_be_set_apart() {
    let runs = render("א#מדף_א(גודל: 1.4em)[מיוחדת] ב#מדף_א[רגילה] ג\n");
    let special = size_of(&runs, "מיוחדת");
    let plain = size_of(&runs, "רגילה");
    assert!(
        special > plain + 2.0,
        "a banded note's own size did not reach the band: {special}pt against {plain}pt"
    );
}

#[test]
fn overrule_makes_the_global_win_over_a_banded_note() {
    let runs = render(
        "#הגדרות_מדפים(גודל: 0.8em, כפה: true)\n\nא#מדף_א(גודל: 1.4em)[עקופה] ב#מדף_א[רגילה]\n",
    );
    let forced = size_of(&runs, "עקופה");
    let plain = size_of(&runs, "רגילה");
    assert!(
        (forced - plain).abs() < 0.01,
        "overrule did not overrule: {forced}pt against {plain}pt"
    );
}

#[test]
fn one_stream_note_can_be_set_apart() {
    let runs =
        render("א#הערה_זרם(\"מקורות\", גודל: 1.4em)[מיוחדת] ב#הערה_זרם(\"מקורות\")[רגילה] ג\n");
    assert!(
        size_of(&runs, "מיוחדת") > size_of(&runs, "רגילה") + 2.0,
        "a stream note's own size did not reach the stream"
    );
}

/// A banded note has no Typst element underneath to hand a stray argument to — it
/// is metadata and a query, and metadata accepts anything. So the prelude says it
/// rather than formatting nothing.
#[test]
fn a_banded_note_names_an_argument_it_does_not_know() {
    let said = refuses("א#מדף_א(גודלל: 1.4em)[הערה]\n");
    assert!(
        said.contains("גודלל"),
        "a misspelled band knob was swallowed: {said}"
    );
}

// ── what one instance may NOT overrule ─────────────────────────────────────

/// The exclusions, and why they are tests rather than a comment: a knob that
/// describes the *arrangement* — a band's column count, a sidenote column's
/// gutter, a sequence's numbering scheme — has no answer at the level of one
/// member. Accepted quietly, it would be a control that reads back exactly what
/// the writer typed and moves nothing on the page, which is the same failure as
/// the missing layer, wearing the opposite face.
#[test]
fn an_arrangements_knob_is_refused_on_one_member_rather_than_ignored() {
    for (body, word, what) in [
        (
            "א#מדף_א(טורים: 2)[הערה]\n",
            "טורים",
            "a band's column count, answered by one note in it",
        ),
        (
            "#עם_הערות_צד[טקסט#הערת_גיליון(מרווח: 3em)[הערה] סוף.]\n",
            "מרווח",
            "the sidenote column's gutter, answered by one note in it",
        ),
        (
            "א#הערה(מספור: \"א\")[הערה]\n",
            "מספור",
            "a numbering scheme, answered by one note in the sequence",
        ),
        (
            "א#הערה_זרם(\"מקורות\", כותרות: (\"x\",))[הערה]\n",
            "כותרות",
            "the stream titles, answered by one note in a stream",
        ),
    ] {
        let said = refuses(body);
        assert!(
            said.contains(word),
            "{what}: it was accepted or refused without naming {word}: {said}"
        );
    }
}

// ── הערות צד · sidenotes ───────────────────────────────────────────────────

/// The kind where a per-note override is load-bearing twice over: every sidenote
/// on a page measures every other one to stack them, so a note styled only at its
/// own call site would be measured at the wrong height by its neighbours and the
/// column would overlap.
#[test]
fn one_sidenote_can_be_set_apart_from_its_neighbours() {
    let body = "#עם_הערות_צד[טקסט#הערת_גיליון(גודל: 1.4em)[מיוחדת] \
                ועוד#הערת_גיליון[רגילה] סוף.]\n";
    let runs = render(body);
    assert!(
        size_of(&runs, "מיוחדת") > size_of(&runs, "רגילה") + 2.0,
        "a sidenote's own size did not apply"
    );
}

#[test]
fn a_styled_sidenote_does_not_overlap_the_next_one() {
    let body = "#עם_הערות_צד[טקסט#הערת_גיליון(גודל: 2em)[הערה ארוכה מאד שתופסת כמה שורות] \
                ועוד#הערת_גיליון[השניה] סוף.]\n";
    let runs = render(body);
    let first = runs
        .iter()
        .find(|r| r.text.contains("ארוכה"))
        .expect("the first sidenote");
    let second = runs
        .iter()
        .find(|r| r.text.contains("השניה"))
        .expect("the second sidenote");
    assert!(
        second.y > first.y,
        "the neighbour was stacked above a note it was measured against: {} then {}",
        first.y,
        second.y
    );
}

// ── the model itself ───────────────────────────────────────────────────────

/// Nine kinds, one merge. If a tenth config is added and wired to `_cfg_with`,
/// this is the assertion that says the switch came with it — and if it is wired to
/// a private copy of the merge, this is the one that does not care.
#[test]
fn overrule_is_the_same_switch_in_every_kind() {
    /// Each kind is measured on the axis its own knobs move. A list has no size,
    /// so a size assertion would pass on a list whose override was never applied
    /// and never overruled — the vacuous green that this whole suite exists to
    /// avoid.
    type Measure = fn(&[TextRun]) -> f64;
    let by_size: Measure = |runs| size_of(runs, "מילה");
    let by_place: Measure = |runs| x_of(runs, "מילה");

    for (kind, global, with, without, measure) in [
        (
            "כותרות",
            "#הגדרות_כותרות(גודל: 1em, כפה: true)",
            "#כותרת1(גודל: 3em)[מילה]",
            "#כותרת1[מילה]",
            by_size,
        ),
        (
            "רשימות",
            "#הגדרות_רשימות(הזחה: 0em, כפה: true)",
            "#רשימה(הזחה: 6em, פריט[מילה])",
            "#רשימה(פריט[מילה])",
            by_place,
        ),
        (
            "טבלאות",
            "#הגדרות_טבלאות(גודל: 8pt, כפה: true)",
            "#טבלה(עמודות: 1, גודל: 20pt, תא[מילה])",
            "#טבלה(עמודות: 1, תא[מילה])",
            by_size,
        ),
        (
            "הערות",
            "#הגדרות_הערות(גודל: 0.8em, כפה: true)",
            "א#הערה(גודל: 1.6em)[מילה]",
            "א#הערה[מילה]",
            by_size,
        ),
        (
            "מדפים",
            "#הגדרות_מדפים(גודל: 0.8em, כפה: true)",
            "א#מדף_א(גודל: 1.4em)[מילה]",
            "א#מדף_א[מילה]",
            by_size,
        ),
        (
            "זרמים",
            "#הגדרות_זרמים(גודל: 0.8em, כפה: true)",
            "א#הערה_זרם(\"מקורות\", גודל: 1.4em)[מילה]",
            "א#הערה_זרם(\"מקורות\")[מילה]",
            by_size,
        ),
        (
            "הערות צד",
            "#הגדרות_הערות_צד(גודל: 0.7em, כפה: true)",
            "#עם_הערות_צד[טקסט#הערת_גיליון(גודל: 1.6em)[מילה] סוף.]",
            "#עם_הערות_צד[טקסט#הערת_גיליון[מילה] סוף.]",
            by_size,
        ),
    ] {
        let forced = measure(&render(&format!("{global}\n\n{with}\n")));
        let bare = measure(&render(&format!("{global}\n\n{without}\n")));
        assert!(
            (forced - bare).abs() < 0.01,
            "כפה does not overrule in {kind}: {forced} against {bare}"
        );

        // …and the same pair without the switch has to differ, or the assertion
        // above is measuring an override that never applied in the first place.
        let free = global.replace(", כפה: true", "");
        let a = measure(&render(&format!("{free}\n\n{with}\n")));
        let b = measure(&render(&format!("{free}\n\n{without}\n")));
        assert!(
            (a - b).abs() > 1.0,
            "the per-instance override does nothing in {kind}, switch or no switch: \
             {a} against {b}"
        );
    }
}

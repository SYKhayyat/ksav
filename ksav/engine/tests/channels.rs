//! Channels: one concept under eighteen ways to write a note.
//!
//! A channel is a note stream. It owns its numbering, **only notes in the same
//! channel number together**, and two declarations describe one: a *source* (the
//! body text, or another channel) and a *placement* (the foot of the page, the
//! end of the section, the end of the document — optionally into a named
//! region). A region is a fixed area with a size of its own that any channel can
//! be pointed into.
//!
//! What these tests are actually holding is the *payoff*: where a note prints is
//! no longer encoded in which command was typed, so it can be changed after the
//! notes are written. Every assertion below that renders the same document twice
//! with one word different is that claim.
//!
//! The eighteen commands still work and still mean what they meant. They are
//! spellings, and `every_one_of_the_eighteen_expresses_in_the_model` is the
//! fence that says the model covers them.

mod common;

use common::{render, text};
use ksav_engine::probe;
use ksav_engine::DocConfig;

/// Everything that printed, in layout order.
fn out(body: &str) -> String {
    text(&render(body))
}

/// The y of the first run whose text contains `needle`, on the page it landed.
fn where_at(body: &str, needle: &str) -> (usize, f64) {
    let runs = render(body);
    let r = runs
        .iter()
        .find(|r| r.text.contains(needle))
        .unwrap_or_else(|| {
            panic!(
                "`{needle}` never printed. What did: {:?}",
                runs.iter().map(|r| r.text.as_str()).collect::<Vec<_>>()
            )
        });
    (r.page, r.y)
}

/// The marker the entry containing `needle` printed with.
///
/// The rightmost run on that entry's line, because this is a right-to-left
/// document and an apparatus entry is "«number» «body»". Not the first run in
/// the probe's order, and not the first token of the joined line: the probe
/// returns runs in layout order, bidi splits an entry into several of them, and
/// which of those comes first differs between a native footnote entry and a
/// band's. The geometry does not differ, so read the geometry.
///
/// The window is one-sided because the marker is `super`ed — measured 4.2pt
/// above its own body's baseline at the shipped sizes — while the entry *below*
/// starts 12pt down. A symmetric window catches the wrong entry's number.
fn marker_of(body: &str, needle: &str) -> String {
    let runs = render(body);
    let anchor = runs
        .iter()
        .find(|r| r.text.contains(needle))
        .unwrap_or_else(|| {
            panic!(
                "`{needle}` never printed. What did: {:?}",
                runs.iter().map(|r| r.text.as_str()).collect::<Vec<_>>()
            )
        });
    runs.iter()
        .filter(|r| {
            r.page == anchor.page
                && r.y <= anchor.y + 1.0
                && r.y >= anchor.y - 6.0
                && !r.text.trim().is_empty()
        })
        .max_by(|a, b| a.x.total_cmp(&b.x))
        .map(|r| r.text.trim().to_string())
        .unwrap_or_default()
}

/// A body that will not compile, and the message it fails with.
fn refuses(body: &str) -> String {
    match probe::layout(body, &DocConfig::default()) {
        Ok(_) => panic!("compiled, and should not have:\n{body}"),
        Err(d) => d
            .iter()
            .map(|x| x.message.clone())
            .collect::<Vec<_>>()
            .join(" · "),
    }
}

// ---------------------------------------------------------------- the default

#[test]
fn a_plain_note_is_the_default_channel() {
    let s = out("טקסט#הערה[ביאור] סוף.");
    assert!(s.contains("ביאור"), "the note never printed: {s}");
}

#[test]
fn naming_the_default_channel_is_the_same_note() {
    // `#הערה` *is* `#הערה(ערוץ: "הערה")`. If it were not, one of the two would be
    // a second apparatus wearing the same name.
    let plain = out("א#הערה[ראשונה] ב#הערה[שנייה].");
    let named = out("א#הערה(ערוץ: \"הערה\")[ראשונה] ב#הערה(ערוץ: \"הערה\")[שנייה].");
    assert_eq!(plain, named);
}

// ---------------------------------------------------------- source and tier

#[test]
fn a_channel_on_a_channel_is_a_note_on_a_note() {
    // Declared, not typed as a tier: the source is what makes it a sub-note.
    let body = "#ערוץ(\"שער\", מקור: \"הערה\")\n\
                טקסט#הערה[ביאור#הערה(ערוץ: \"שער\")[הערה על הביאור]] סוף.";
    let s = out(body);
    assert!(s.contains("ביאור"), "{s}");
    assert!(s.contains("הערה על הביאור"), "{s}");
}

#[test]
fn a_sourced_channel_at_the_page_foot_indents_against_its_parent() {
    // The shipped tier defaults step the indent, and a declared channel is a
    // tier of the native apparatus when its source chain reaches the default
    // channel. So the sub-note's body starts further in than its parent's.
    let body = "#ערוץ(\"שער\", מקור: \"הערה\")\n\
                טקסט#הערה[ביאור#הערה(ערוץ: \"שער\")[תלוי]] סוף.";
    let runs = render(body);
    let parent = runs
        .iter()
        .find(|r| r.text.contains("ביאור"))
        .expect("parent");
    let child = runs
        .iter()
        .find(|r| r.text.contains("תלוי"))
        .expect("child");
    assert_eq!(parent.page, child.page);
    // RTL: further in means a *smaller* x, since the notes are set to the right.
    assert!(
        child.x < parent.x,
        "the sub-note did not indent against its parent: parent x={} child x={}",
        parent.x,
        child.x
    );
}

#[test]
fn only_notes_in_the_same_channel_number_together() {
    // Two channels, both at the page foot as tiers of the native apparatus, each
    // with its own scheme. Were they one sequence the second channel's first
    // note would be numbered 2, not 1 — which is the whole of what makes a
    // channel a channel rather than a style.
    let body = "#ערוץ(\"ביאור\", מקור: \"הערה\", מספור: \"א\")\n\
                #ערוץ(\"מקורות\", מקור: \"הערה\", מספור: \"1\")\n\
                טקסט#הערה[ראש\
                #הערה(ערוץ: \"ביאור\")[פלוני]\
                #הערה(ערוץ: \"מקורות\")[שלישי]\
                #הערה(ערוץ: \"ביאור\")[אלמוני]\
                #הערה(ערוץ: \"מקורות\")[רביעי]] סוף.";
    assert_eq!(
        marker_of(body, "פלוני"),
        "א",
        "first note of the lettered channel"
    );
    assert_eq!(
        marker_of(body, "אלמוני"),
        "ב",
        "second note of the lettered channel"
    );
    assert_eq!(
        marker_of(body, "שלישי"),
        "1",
        "first note of the numbered channel"
    );
    assert_eq!(
        marker_of(body, "רביעי"),
        "2",
        "second note of the numbered channel"
    );
}

// ------------------------------------------------------------- the placements

#[test]
fn the_same_notes_move_when_the_channel_moves() {
    // The payoff, stated as plainly as it can be: one word changes, no note is
    // touched, and the apparatus is at the back of the sefer instead of the foot
    // of the page. This is what could not be done while the arrangement was
    // welded to the command that was typed.
    let notes = "טקסט#הערה(ערוץ: \"ביאור\")[הביאור] המשך.\n\n#הצג_אזור(\"ביאור\")";
    let (foot_page, foot_y) = where_at(
        &format!("#ערוץ(\"ביאור\", מיקום: \"רגל\", גובה: 2cm)\n{notes}"),
        "הביאור",
    );
    let (end_page, end_y) = where_at(
        &format!("#ערוץ(\"ביאור\", מיקום: \"סוף\")\n{notes}"),
        "הביאור",
    );
    assert_eq!(foot_page, end_page, "one short page either way");
    assert!(
        end_y < foot_y - 100.0,
        "the notes did not move: page foot y={foot_y}, collected y={end_y}"
    );
}

#[test]
fn a_collected_channel_prints_where_the_region_is_shown() {
    let body = "#ערוץ(\"ביאור\", מיקום: \"סוף\")\n\
                טקסט#הערה(ערוץ: \"ביאור\")[הביאור] סוף.\n\n\
                #הצג_אזור(\"ביאור\", כותרת: [ביאורים])";
    let s = out(body);
    assert!(s.contains("ביאורים"), "the region title never printed: {s}");
    assert!(s.contains("הביאור"), "the note never printed: {s}");
    let (_, title) = where_at(body, "ביאורים");
    let (_, note) = where_at(body, "הביאור");
    assert!(note > title, "the note printed above its own title");
}

#[test]
fn a_collected_region_renders_only_what_was_written_since_the_last_call() {
    // The same rule the section bands and the endnotes have: each call is a
    // section boundary, so a dump at every siman does not reprint the last one's
    // notes. Without it, a two-siman sefer prints siman א's notes twice.
    let body = "#ערוץ(\"ביאור\", מיקום: \"סוף_מדור\")\n\
                ראשון#הערה(ערוץ: \"ביאור\")[אלף]\n\n#הצג_אזור(\"ביאור\")\n\n\
                שני#הערה(ערוץ: \"ביאור\")[בית]\n\n#הצג_אזור(\"ביאור\")";
    let s = out(body);
    assert_eq!(
        s.matches("אלף").count(),
        1,
        "the first section's note printed twice: {s}"
    );
    assert_eq!(s.matches("בית").count(), 1, "{s}");
}

#[test]
fn two_collected_regions_do_not_cut_each_others_scopes() {
    // Each region's dump marker is its own. Shared, a per-siman region's dump
    // would close the document-end region's scope at every siman, and the notes
    // written before it would print in neither place.
    let body = "#ערוץ(\"קצר\", מיקום: \"סוף_מדור\")\n\
                #ערוץ(\"ארוך\", מיקום: \"סוף\")\n\
                ראשון#הערה(ערוץ: \"קצר\")[מדורי]#הערה(ערוץ: \"ארוך\")[סופי]\n\n\
                #הצג_אזור(\"קצר\")\n\n\
                שני\n\n#הצג_אזור(\"ארוך\")";
    let s = out(body);
    assert!(s.contains("מדורי"), "the section note never printed: {s}");
    assert!(
        s.contains("סופי"),
        "the document-end note was cut off by the section dump: {s}"
    );
}

// ----------------------------------------------------------------- regions

#[test]
fn two_channels_share_one_region_and_keep_their_own_numbers() {
    let body = "#אזור(\"פירושים\", מיקום: \"סוף\")\n\
                #ערוץ(\"ביאור\", אזור: \"פירושים\")\n\
                #ערוץ(\"מקורות\", אזור: \"פירושים\")\n\
                טקסט#הערה(ערוץ: \"ביאור\")[פלוני]#הערה(ערוץ: \"מקורות\")[שלישי]\
                #הערה(ערוץ: \"ביאור\")[אלמוני] סוף.\n\n\
                #הצג_אזור(\"פירושים\")";
    let s = out(body);
    for n in ["פלוני", "אלמוני", "שלישי"] {
        assert!(s.contains(n), "`{n}` never printed: {s}");
    }
    // The band convention by position in the region: א,ב for the first channel
    // and 1,2 for the second — the שער־הציון order, which the apparatus already
    // holds and the writer does not have to restate.
    assert_eq!(
        marker_of(body, "אלמוני"),
        "ב",
        "the first channel of a region is lettered"
    );
    assert_eq!(
        marker_of(body, "שלישי"),
        "1",
        "the second channel of a region is numbered"
    );
}

#[test]
fn a_region_at_the_page_foot_takes_the_height_it_declared() {
    let tall = "#אזור(\"ביאור\", מיקום: \"רגל\", גובה: 4cm)\n\
                #ערוץ(\"ביאור\", אזור: \"ביאור\")\n\
                טקסט#הערה(ערוץ: \"ביאור\")[הביאור] סוף.";
    let short = tall.replace("4cm", "1cm");
    let (_, tall_y) = where_at(tall, "הביאור");
    let (_, short_y) = where_at(&short, "הביאור");
    assert!(
        tall_y < short_y - 40.0,
        "a taller region did not start higher up the page: 4cm y={tall_y}, 1cm y={short_y}"
    );
}

#[test]
fn a_channel_that_declared_a_height_gets_a_region_of_its_own() {
    // The shortcut the model promises for the common case: one command makes the
    // region and the channel pointed at it.
    let body = "#ערוץ(\"ביאור\", מיקום: \"רגל\", גובה: 3cm)\n\
                טקסט#הערה(ערוץ: \"ביאור\")[הביאור] סוף.";
    let s = out(body);
    assert!(s.contains("הביאור"), "{s}");
    // A page-foot region is *not* Typst's balanced series — it is the read-only
    // footer apparatus — so it lands below the main text in the reserve.
    let (_, note) = where_at(body, "הביאור");
    let (_, prose) = where_at(body, "טקסט");
    assert!(
        note > prose,
        "the region printed above the prose it hangs off"
    );
}

#[test]
fn channels_in_one_region_can_be_set_side_by_side() {
    let stacked = "#אזור(\"פירושים\", מיקום: \"סוף\")\n\
                   #ערוץ(\"ביאור\", אזור: \"פירושים\")\n\
                   #ערוץ(\"מקורות\", אזור: \"פירושים\")\n\
                   טקסט#הערה(ערוץ: \"ביאור\")[שמאלי]#הערה(ערוץ: \"מקורות\")[ימני]\n\n\
                   #הצג_אזור(\"פירושים\")";
    let side = stacked.replace(
        "#אזור(\"פירושים\", מיקום: \"סוף\")",
        "#אזור(\"פירושים\", מיקום: \"סוף\", פריסה: \"צד\")",
    );
    let a = where_at(stacked, "שמאלי");
    let b = where_at(stacked, "ימני");
    assert!(
        b.1 > a.1,
        "stacked: the second channel should sit below the first"
    );
    let a = where_at(&side, "שמאלי");
    let b = where_at(&side, "ימני");
    assert!(
        (a.1 - b.1).abs() < 3.0,
        "side by side: the two channels should share a line, got y={} and y={}",
        a.1,
        b.1
    );
    assert!(a.0 == b.0, "side by side on one page");
}

// -------------------------------------------------------------- styling

#[test]
fn a_channel_styles_its_own_notes() {
    let body = "#ערוץ(\"ביאור\", מקור: \"הערה\", גודל: 6pt)\n\
                טקסט#הערה[רגילה#הערה(ערוץ: \"ביאור\")[קטנה]] סוף.";
    let runs = render(body);
    let small = runs
        .iter()
        .find(|r| r.text.contains("קטנה"))
        .expect("the styled note");
    let plain = runs
        .iter()
        .find(|r| r.text.contains("רגילה"))
        .expect("the plain note");
    assert!(
        small.size < plain.size - 1.0,
        "the channel's own size never reached its notes: {} vs {}",
        small.size,
        plain.size
    );
}

#[test]
fn one_note_still_overrules_its_channel() {
    // Rule 2 of the override model, on the new kind: the global sets the
    // default, an element's own arguments overrule it for that element only.
    let body = "#ערוץ(\"ביאור\", מיקום: \"סוף\", גודל: 6pt)\n\
                טקסט#הערה(ערוץ: \"ביאור\")[רגילה]\
                #הערה(ערוץ: \"ביאור\", גודל: 14pt)[גדולה]\n\n#הצג_אזור(\"ביאור\")";
    let runs = render(body);
    let big = runs
        .iter()
        .find(|r| r.text.contains("גדולה"))
        .expect("the override");
    let small = runs
        .iter()
        .find(|r| r.text.contains("רגילה"))
        .expect("the default");
    assert!(
        big.size > small.size + 4.0,
        "the per-note override did nothing: {} vs {}",
        big.size,
        small.size
    );
}

#[test]
fn a_channel_carries_a_title_into_its_region() {
    let body = "#אזור(\"פירושים\", מיקום: \"סוף\")\n\
                #ערוץ(\"ביאור\", אזור: \"פירושים\", כותרת: [ביאורי הגר\"א])\n\
                טקסט#הערה(ערוץ: \"ביאור\")[גוף] סוף.\n\n#הצג_אזור(\"פירושים\")";
    let s = out(body);
    assert!(
        s.contains("ביאורי הגר"),
        "the channel's title never printed: {s}"
    );
}

// ------------------------------------------------------ saying so, not guessing

#[test]
fn an_unknown_placement_is_refused_by_name() {
    let msg = refuses("#ערוץ(\"ביאור\", מיקום: \"בצד\")\nטקסט");
    assert!(msg.contains("מיקום"), "{msg}");
    assert!(
        msg.contains("בצד"),
        "the message does not name what was written: {msg}"
    );
    assert!(
        msg.contains("רגל"),
        "the message does not say what is allowed: {msg}"
    );
}

#[test]
fn an_unknown_channel_argument_is_refused_by_name() {
    let msg = refuses("#ערוץ(\"ביאור\", מיקומ: \"רגל\")\nטקסט");
    assert!(msg.contains("מיקומ"), "{msg}");
}

#[test]
fn a_cycle_in_the_source_chain_does_not_hang_the_compile() {
    // Two channels each declared as a note on the other. It is a document a
    // writer can type, and a chain walk without a bound would not return.
    let body = "#ערוץ(\"א\", מקור: \"ב\")\n#ערוץ(\"ב\", מקור: \"א\")\n\
                טקסט#הערה(ערוץ: \"א\")[גוף] סוף.";
    let s = out(body);
    assert!(s.contains("גוף"), "{s}");
}

#[test]
fn a_channel_nobody_declared_is_a_page_foot_region_of_its_own() {
    // Naming a channel is not an error, and it is not the default channel
    // either: it numbers on its own, which is what `#הערה_זרם` has always been.
    let body = "טקסט#הערה[רגילה]#הערה(ערוץ: \"מקורות\")[מקור1]\
                #הערה(ערוץ: \"מקורות\")[מקור2] סוף.";
    let s = out(body);
    for n in ["רגילה", "מקור1", "מקור2"] {
        assert!(s.contains(n), "`{n}` never printed: {s}");
    }
}

#[test]
fn moving_a_channel_does_not_renumber_it() {
    // A channel owns its numbering — that is the whole of what makes it a
    // channel — so the scheme has to follow it when its placement changes. It
    // did not: the page-foot apparatus answers "what scheme?" with `1` when
    // nobody asks and the collected one answers with the band convention, so
    // one word in one line silently turned `1, 2` into `א, ב`. Caught by
    // pressing the control in the running application and reading the page.
    let notes = "טקסט#הערה(ערוץ: \"ביאור\")[פלוני]#הערה(ערוץ: \"ביאור\")[אלמוני] סוף.\
                 \n\n#הצג_אזור(\"ביאור\")";
    let foot = format!("#ערוץ(\"ביאור\", מיקום: \"רגל\", גובה: 3cm)\n{notes}");
    let back = format!("#ערוץ(\"ביאור\", מיקום: \"סוף\")\n{notes}");
    assert_eq!(marker_of(&foot, "פלוני"), marker_of(&back, "פלוני"));
    assert_eq!(marker_of(&foot, "אלמוני"), marker_of(&back, "אלמוני"));
    assert_ne!(
        marker_of(&foot, "פלוני"),
        marker_of(&foot, "אלמוני"),
        "two notes of one channel got the same number"
    );
}

#[test]
fn the_marker_and_its_entry_agree_on_the_scheme() {
    // The marker is set where the note is written and the entry where the band
    // is printed, off two reads of the configuration. A marker that says `1`
    // over an entry that says `א` sends the reader to the wrong band, and it is
    // the failure mode a rendered-output test is for: both halves compile.
    let body = "#אזור(\"פירושים\", מיקום: \"רגל\", גובה: 4cm)\n\
                #ערוץ(\"ביאור\", אזור: \"פירושים\")\n#ערוץ(\"מקורות\", אזור: \"פירושים\")\n\
                טקסט#הערה(ערוץ: \"ביאור\")[פלוני]#הערה(ערוץ: \"מקורות\")[שלישי] סוף.";
    let runs = render(body);
    // The markers in the prose: everything on the first line that is not one of
    // the words. Not "the small runs" — Typst uses the font's own superscript
    // glyph where there is one, so `¹` comes back at body size on the body's own
    // baseline while a superscripted `א`, which no Hebrew face has, is scaled and
    // raised. Reading the size would have found one of the two.
    let prose: Vec<String> = runs
        .iter()
        .filter(|r| r.y < 100.0)
        .map(|r| r.text.trim().to_string())
        .filter(|s| !s.is_empty() && s != "טקסט" && s != "סוף.")
        .collect();
    assert_eq!(
        prose.len(),
        2,
        "expected two markers in the prose, got {prose:?}"
    );
    assert_eq!(prose[0], marker_of(body, "פלוני"), "the first channel");
    assert_eq!(prose[1], marker_of(body, "שלישי"), "the second channel");
}

#[test]
fn a_deferred_marker_can_name_a_channel() {
    // The two axes are orthogonal and have to stay so: *where the prose lives in
    // the source* and *where the note prints* are separate questions, and a sefer
    // whose notes outweigh its text answers the first one "at the end" for every
    // note it has. `#הערה_בשם` passes its named arguments through to the command
    // it stands for, so this needs nothing of its own — which is worth an
    // assertion precisely because it needs nothing.
    let body = "#ערוץ(\"ביאור\", מיקום: \"סוף\")\n\
                טקסט#הערה_בשם(\"1\", ערוץ: \"ביאור\") סוף.\n\n\
                #גוף_הערה(\"1\")[הביאור]\n\n#הצג_אזור(\"ביאור\")";
    let s = out(body);
    assert!(s.contains("הביאור"), "the deferred note never printed: {s}");
    let (_, y) = where_at(body, "הביאור");
    assert!(
        y < 300.0,
        "it printed at the page foot rather than in its channel: y={y}"
    );
}

// ------------------------------------------------- the eighteen, in the model

/// Every arrangement the eighteen commands name, written in the model.
///
/// Not "the old command still compiles" — that is what the rest of the suite
/// holds. This is the claim the decision record makes: *tested against the
/// eighteen, every one expresses*. Each row is the arrangement said in channels,
/// and it has to print its notes.
#[test]
fn every_one_of_the_eighteen_expresses_in_the_model() {
    // "foot" = the bottom of the sheet, "back" = collected where the region is
    // shown, which on these one-paragraph documents is straight under the prose.
    // Asserting *where* and not merely that something printed is the whole
    // point: a note that lands in the wrong apparatus still prints.
    let cases: &[(&str, &str, &str, &str)] = &[
        (
            "#הערה — the default channel, at the foot of the page",
            "טקסט#הערה[גוף] סוף.",
            "גוף",
            "foot",
        ),
        (
            "#הערה_ב, #הערה_ג — a channel on that channel, indented in its parent's block",
            "#ערוץ(\"שער\", מקור: \"הערה\")\nטקסט#הערה[אב#הערה(ערוץ: \"שער\")[בן]] סוף.",
            "בן",
            "foot",
        ),
        (
            "#הערתסיום — a channel placed at the end of the document",
            "#ערוץ(\"סיום\", מיקום: \"סוף\")\nטקסט#הערה(ערוץ: \"סיום\")[גוף]\n\n#הצג_אזור(\"סיום\")",
            "גוף",
            "back",
        ),
        (
            "#מדור_א/ב/ג — channels in regions at the end of the section",
            "#אזור(\"מדור\", מיקום: \"סוף_מדור\")\n\
             #ערוץ(\"עליון\", אזור: \"מדור\")\n#ערוץ(\"תחתון\", אזור: \"מדור\")\n\
             טקסט#הערה(ערוץ: \"עליון\")[גוף]#הערה(ערוץ: \"תחתון\")[תחת]\n\n#הצג_אזור(\"מדור\")",
            "תחת",
            "back",
        ),
        (
            "#מדף_א/ב/ג — channels in regions at the foot of the page",
            "#אזור(\"מדף\", מיקום: \"רגל\", גובה: 3cm)\n\
             #ערוץ(\"עליון\", אזור: \"מדף\")\n#ערוץ(\"תחתון\", אזור: \"מדף\")\n\
             טקסט#הערה(ערוץ: \"עליון\")[גוף]#הערה(ערוץ: \"תחתון\")[תחת] סוף.",
            "תחת",
            "foot",
        ),
        (
            "#הערה_זרם(\"x\") — a channel you named",
            "טקסט#הערה(ערוץ: \"מקורות\")[גוף] סוף.",
            "גוף",
            "foot",
        ),
        (
            "streams side by side — two channels sharing one region",
            "#אזור(\"רגל_עמוד\", מיקום: \"רגל\", גובה: 3cm, פריסה: \"צד\")\n\
             #ערוץ(\"ימין\", אזור: \"רגל_עמוד\")\n#ערוץ(\"שמאל\", אזור: \"רגל_עמוד\")\n\
             טקסט#הערה(ערוץ: \"ימין\")[אחת]#הערה(ערוץ: \"שמאל\")[שתיים] סוף.",
            "שתיים",
            "foot",
        ),
    ];
    for (what, body, needle, place) in cases {
        let s = out(body);
        assert!(
            s.contains(needle),
            "{what}\nprinted nothing containing `{needle}`:\n{body}\n---\n{s}"
        );
        let (page, y) = where_at(body, needle);
        assert_eq!(page, 1, "{what}\nspilled onto page {page}");
        match *place {
            "foot" => assert!(y > 600.0, "{what}\nis not at the foot of the page: y={y}"),
            "back" => assert!(y < 300.0, "{what}\nis not collected under the prose: y={y}"),
            other => panic!("unknown expected placement {other}"),
        }
    }
}

/// The channel table is read where the *notes* are, not where the line is.
///
/// Every `#הגדרות_*` command underneath this layer is positional — the apparatus
/// reads its state from the page footer, which resolves it at the page's own
/// position, so a settings line written at the end of the file silently applies
/// to the last page and no other. A channel declaration is a fact about the
/// document and is read with `.final()`, so it does not have that flaw.
#[test]
fn a_channel_declared_at_the_end_of_the_file_still_reaches_the_first_page() {
    let first = "#ערוץ(\"ביאור\", מיקום: \"סוף\")\n\
                 טקסט#הערה(ערוץ: \"ביאור\")[גוף]\n\n#הצג_אזור(\"ביאור\")";
    let last = "טקסט#הערה(ערוץ: \"ביאור\")[גוף]\n\n\
                #ערוץ(\"ביאור\", מיקום: \"סוף\")\n#הצג_אזור(\"ביאור\")";
    assert_eq!(
        out(first),
        out(last),
        "where the declaration sits changed where the notes printed"
    );
}

#[test]
fn two_streams_side_by_side_number_independently_and_in_their_own_schemes() {
    // The arrangement the note chooser writes for "parallel streams in fixed
    // regions", and the two claims its own card makes about it: *כל אחד ממוספר
    // בפני עצמו* — each numbered on its own — and a per-stream `מספור`.
    //
    // Written after reading a page produced by pressing those buttons: a
    // ביאור band numbered 1, 2 and a מראי־מקומות band numbered 2, 3, so one
    // page carried two different notes both marked ², and the `"א"` asked for
    // never appeared at all.
    let head = "#הגדרות_זרמים(זרמים: (\"ביאור\", \"מקורות\"), \
                גבהים: (\"ביאור\": 10%, \"מקורות\": 6%), \
                מספור: (\"מקורות\": \"א\"))";
    let body = format!(
        "{head}\n\
         ראשון#הערה_זרם(\"ביאור\")[ביאור־אחד]\n\n\
         שני#הערה_זרם(\"מקורות\")[מקור־אחד]\n\n\
         שלישי#הערה_זרם(\"מקורות\")[מקור־שתיים]\n\n\
         רביעי#הערה_זרם(\"ביאור\")[ביאור־שתיים]\n"
    );
    let mark = |needle: &str| marker_of(&body, needle);

    // Each stream counts from one, in its own scheme.
    assert_eq!(mark("ביאור־אחד"), "1", "the first ביאור note is not 1");
    assert_eq!(mark("ביאור־שתיים"), "2", "the second ביאור note is not 2");
    assert_eq!(mark("מקור־אחד"), "א", "the first מקורות note is not א");
    assert_eq!(mark("מקור־שתיים"), "ב", "the second מקורות note is not ב");
}

#[test]
fn a_tiered_note_configuration_does_not_take_over_the_streams() {
    // The exact pair the chooser writes when a writer asks for parallel streams
    // and then hangs a note on one of the notes: `#הגדרות_זרמים` for the streams
    // and `#הגדרות_הערות` for the tiers. They are two different apparatus and
    // the second must not renumber the first.
    let head = "#הגדרות_הערות(מספור: (\"א\", \"1\"), הזחה: (0em, 1.4em))\n\n\
                #הגדרות_זרמים(זרמים: (\"ביאור\", \"מקורות\", \"נוסחאות\"), \
                גבהים: (\"ביאור\": 10%, \"מקורות\": 6%, \"נוסחאות\": 6%), \
                מספור: (\"מקורות\": \"א\"), \
                כותרות: (\"מקורות\": [מראי מקומות], \"נוסחאות\": [שינויי נוסחאות]))";
    let body = format!(
        "{head}\n\
         ראשון#הערה_זרם(\"ביאור\")[ביאור־אחד]\n\n\
         שני#הערה_זרם(\"מקורות\")[מקור־אחד]\n\n\
         שלישי#הערה_זרם(\"מקורות\")[מקור־שתיים]\n\n\
         רביעי#הערה_זרם(\"ביאור\")[ביאור־שתיים#הערה_ב[על־ההערה]]\n"
    );
    let mark = |needle: &str| marker_of(&body, needle);
    assert_eq!(mark("ביאור־אחד"), "1", "the first ביאור note is not 1");
    assert_eq!(mark("ביאור־שתיים"), "2", "the second ביאור note is not 2");
    assert_eq!(mark("מקור־אחד"), "א", "the first מקורות note is not א");
    assert_eq!(mark("מקור־שתיים"), "ב", "the second מקורות note is not ב");
}

/// A note written `ערוץ:` **and** `אזור:` into a collected region prints there.
///
/// Filing keys the entry by the channel's name; membership at draw time used to
/// re-derive the region from the channel's *declarations*, and a channel that
/// never declared one answered with its own name — so the entry was numbered,
/// queryable, and drawn by nothing. The writer's text, gone, with no diagnostic.
#[test]
fn a_note_into_a_named_region_prints_when_the_region_is_shown() {
    let body = "#אזור(\"ביאורים\", מיקום: \"סוף\")\n\
                טקסט ראשון#הערה(ערוץ: \"א\", אזור: \"ביאורים\")[הביאור שחייב להיראות] ועוד טקסט.\n\n\
                #הצג_אזור(\"ביאורים\")\n";
    let printed = out(body);
    assert!(
        printed.contains("הביאור שחייב להיראות"),
        "the entry was filed but never drawn. What printed: {printed}"
    );
}

/// …and the same through the per-note spelling alone, which shares the channel
/// named for the region — the control that proves the fix is not narrower than
/// the family.
#[test]
fn a_note_into_a_region_alone_still_prints_and_numbers_with_its_peers() {
    let body = "#אזור(\"ביאורים\", מיקום: \"סוף\")\n\
                טקסט ראשון#הערה(אזור: \"ביאורים\")[ביאור־אחד] ועוד.\n\n\
                טקסט שני#הערה(ערוץ: \"א\", אזור: \"ביאורים\")[ביאור־שני] ודי.\n\n\
                #הצג_אזור(\"ביאורים\")\n";
    let printed = out(body);
    assert!(printed.contains("ביאור־אחד"), "the first entry never printed");
    assert!(printed.contains("ביאור־שני"), "the second entry never printed");
}

//! Every value of every region key, rendered.
//!
//! # What this asks that `region_settings.rs` does not
//!
//! That file asks whether each key **moves the page**, with two values per key.
//! It is the fence against a knob that does nothing. This one asks the cruder
//! question the stress test kept answering badly: does every value of every key
//! *survive contact with the engine at all*, and does every pair of keys that a
//! writer might reasonably set together still compile?
//!
//! The difference matters because the vocabularies are read out of the prelude
//! and are longer than the two values a contrast row uses. `גלישה` has seven
//! moves and `region_settings.rs` renders two of them; `מיקום` has ten
//! placements and it renders two. A move nobody has ever compiled is a move that
//! panics the first time a writer picks it out of the panel — and the panel now
//! offers all of them, which is what makes this worth having.
//!
//! # The three outcomes, and only two of them are allowed
//!
//! 1. **It compiles.** Fine.
//! 2. **It refuses, in a sentence that names the region.** Also fine, and for
//!    `חריגה: "סירוב"` it is the whole point of the key.
//! 3. **Anything else** — a panic with no message, a diagnostic that names
//!    nothing a writer could act on. Not fine, and that is what this catches.
//!
//! A hang is caught by the suite's own timeout rather than here, which is the
//! honest place for it: a test that waits for a hang is a test that hangs.

mod common;

use ksav_engine::{probe, DocConfig};

/// The keys of `#let _rg_own = (…)`, read out of the prelude.
fn region_keys() -> Vec<String> {
    let prelude = include_str!("../typst/ksav.typ");
    let at = prelude
        .find("#let _rg_own = (")
        .expect("`_rg_own` is not in ksav.typ — has the region's key list moved?");
    let rest = &prelude[at..];
    let end = rest.find("\n)").expect("`_rg_own` is not closed");
    rest[..end]
        .match_indices('"')
        .map(|(i, _)| i)
        .collect::<Vec<_>>()
        .chunks(2)
        .filter(|c| c.len() == 2)
        .map(|c| rest[c[0] + 1..c[1]].to_string())
        .collect()
}

/// Every value this file will try for one key.
///
/// Read off the prelude's own vocabularies where there is one, so a move added
/// tomorrow is rendered the day it is added. Written out where the value is a
/// number or a length, because there is no list of those to read.
fn values(key: &str) -> Vec<String> {
    let vocab = |name: &str| -> Vec<String> {
        let prelude = include_str!("../typst/ksav.typ");
        let at = prelude
            .find(&format!("#let {name} = ("))
            .unwrap_or_else(|| panic!("{name} is not in ksav.typ"));
        let open = prelude[at..].find('(').unwrap() + at;
        let mut depth = 0usize;
        let mut close = open;
        for (i, c) in prelude[open..].char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        close = open + i;
                        break;
                    }
                }
                _ => {}
            }
        }
        prelude[open..close]
            .match_indices('"')
            .map(|(i, _)| i)
            .collect::<Vec<_>>()
            .chunks(2)
            .filter(|c| c.len() == 2)
            .map(|c| prelude[open + c[0] + 1..open + c[1]].to_string())
            .collect()
    };
    let quoted = |v: Vec<String>| v.into_iter().map(|s| format!("\"{s}\"")).collect();
    let plain = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    match key {
        "מיקום" => quoted(vocab("_ch_places")),
        // Each move on its own, and the whole list in the order the prelude
        // writes them: a writer who wants everything tried is a writer who
        // ticks every box, and the panel lets them.
        "גלישה" => {
            let mut out: Vec<String> = vocab("_ap_spill_moves")
                .iter()
                .map(|m| format!("(\"{m}\",)"))
                .collect();
            out.push("()".into());
            out.push(format!(
                "({})",
                vocab("_ap_spill_moves")
                    .iter()
                    .map(|m| format!("\"{m}\""))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
            out
        }
        "חריגה" => quoted(vocab("_rg_over")),
        "יחידה" => {
            let mut out: Vec<String> = quoted(vocab("_rg_grid_units"));
            out.push("none".into());
            out
        }
        // Each ingredient alone and all of them together, from the two tuples
        // the prelude keeps them in — `_xa_unbuilt` deliberately left out,
        // because refusing it by name is `entry_address.rs`'s claim, not this
        // file's.
        "ראש" => {
            let mut parts = vocab("_eh_parts");
            parts.extend(vocab("_xa_kinds"));
            let mut out: Vec<String> = parts.iter().map(|p| format!("(\"{p}\",)")).collect();
            out.push(format!(
                "({})",
                parts
                    .iter()
                    .map(|p| format!("\"{p}\""))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
            out
        }
        "פריסה" => plain(&["\"מוערם\"", "\"צד\""]),
        "כותרת" => plain(&["none", "[ביאורים]", "\"ביאורים\""]),
        // Heights in every shape the engine accepts: a length, a percentage of
        // the sheet, a count of lines, and nothing at all.
        "גובה" => plain(&["auto", "1.2cm", "12%", "שורות(1)", "שורות(4)", "40pt"]),
        "שומר_מקום" | "עמוד_חדש" | "סימן_בהמשך" => {
            plain(&["true", "false"])
        }
        "הקטנה_מזערית" => plain(&["0.5", "0.8", "1.0"]),
        "הקטנה_צעד" => plain(&["0.01", "0.1", "0.5"]),
        "כיווץ_מידה" => plain(&["0pt", "-0.06em", "-1pt"]),
        // Zero is a real answer — cut wherever the measurement landed — and a
        // number larger than the note is the other end of it.
        "תפר" => plain(&["0", "8", "500"]),
        "מספור_כתובת" => plain(&["\"1\"", "\"א\"", "\"I\""]),
        "דף_ראשון" => plain(&["1", "2", "40"]),
        "טורים" => plain(&["(1fr,)", "(1fr, 1fr)", "(1fr, 4fr)"]),
        _ => panic!("region_matrix has no values for {key} — add them, or the key is unswept"),
    }
}

/// A note long enough to spill a one-line region, so the overflow keys reach,
/// and no longer: eighty documents is eighty compiles, and every word in this
/// string is paid for eighty times. Two headings, because `יחידה` synchronises
/// on units and one unit is one row — which is what no synchronisation already
/// gives.
fn body() -> String {
    let long = (1..=26)
        .map(|i| format!("מילה{i:02}"))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "פתיחה.\n\n#כותרת[פרק א]\n\n\
         א#הערה(אזור: \"צר\")[{long}] ב#הערה(אזור: \"צר\")[קצרה] \
         ג#הערה(ערוץ: \"שני\")[בערוץ אחר]\n\n\
         #כותרת[פרק ב]\n\nהמשך#הערה(אזור: \"צר\")[עוד אחת] סוף."
    )
}

/// What happened, in the two words this file cares about.
enum Got {
    Rendered,
    Refused(String),
}

fn render(args: &str) -> Got {
    let doc = format!(
        "#מסמך(אזור_הערות: 3.5cm)[\n\
         #אזור(\"צר\"{args})\n\
         #ערוץ(\"שני\", אזור: \"צר\")\n{}\n]\n",
        body()
    );
    match probe::layout(&doc, &DocConfig::default()) {
        Ok(_) => Got::Rendered,
        Err(d) => Got::Refused(
            d.iter()
                .map(|x| x.message.clone())
                .collect::<Vec<_>>()
                .join(" / "),
        ),
    }
}

/// A refusal a writer can act on names the region and says what to do.
fn actionable(msg: &str) -> bool {
    !msg.trim().is_empty() && (msg.contains("אזור") || msg.contains("region"))
}

/// Every value of every key, one at a time.
#[test]
fn every_value_of_every_region_key_renders_or_refuses_in_a_sentence() {
    let keys = region_keys();
    assert!(keys.len() > 10, "only {} region keys parsed", keys.len());
    let mut bad = Vec::new();
    let mut tried = 0;
    for key in &keys {
        for v in values(key) {
            tried += 1;
            let args = format!(", {key}: {v}");
            if let Got::Refused(msg) = render(&args) {
                if !actionable(&msg) {
                    bad.push(format!("#אזור(\"צר\"{args}) — {msg}"));
                }
            }
        }
    }
    assert!(tried > 60, "only {tried} values tried — the table is thin");
    assert!(
        bad.is_empty(),
        "{} of {tried} values failed with nothing a writer could act on:\n{}",
        bad.len(),
        bad.join("\n")
    );
}

/// The pairs a writer actually sets together.
///
/// One key at a time is the cheap sweep and it misses the interesting failures:
/// a placement that needs a height, a spill move that needs a floor, a grid that
/// needs both a column list and a unit. These are the combinations the panel puts
/// in front of somebody in one sitting.
#[test]
fn the_combinations_a_writer_would_reach_for_all_render() {
    let combos: &[(&str, &str)] = &[
        ("a foot region that shrinks then spills", ", מיקום: \"רגל\", גובה: שורות(1), גלישה: (\"הקטנה\", \"עמוד_הבא\"), הקטנה_מזערית: 0.6, הקטנה_צעד: 0.05"),
        ("…and runs its entries in", ", מיקום: \"רגל\", גובה: שורות(2), גלישה: (\"רצף\", \"עמוד_הבא\")"),
        ("…and tightens the letters", ", מיקום: \"רגל\", גובה: שורות(1), גלישה: (\"כיווץ_אותיות\",), כיווץ_מידה: -0.06em"),
        ("…taking what room there is", ", מיקום: \"רגל\", גובה: 20cm, חריגה: \"צמצום\""),
        ("a band above the text", ", מיקום: \"למעלה\", גובה: שורות(2), גלישה: (\"עמוד_הבא\",)"),
        ("the outer margin, two-sided", ", מיקום: \"חוץ\", גובה: 4cm"),
        ("the inner margin", ", מיקום: \"פנים\", גובה: 4cm"),
        ("the back of the sefer with an address", ", מיקום: \"סוף\", כותרת: [ביאורים], ראש: (\"עמוד\", \"מספר\"), מספור_כתובת: \"א\""),
        ("…on a folio count", ", מיקום: \"סוף\", ראש: (\"דף\", \"מספר\"), דף_ראשון: 2"),
        ("…on a sheet of its own", ", מיקום: \"סוף\", עמוד_חדש: true, כותרת: [ביאורים]"),
        ("the end of each section", ", מיקום: \"סוף_מדור\", כותרת: [ביאורי המדור]"),
        ("a companion volume", ", מיקום: \"קובץ\", כותרת: [כרך הביאורים]"),
        ("a grid region kept level by its headings", ", מיקום: \"רגל\", גובה: 3cm, פריסה: \"צד\", טורים: (1fr, 2fr), יחידה: \"כותרת\""),
        ("…by its simanim", ", מיקום: \"רגל\", גובה: 3cm, פריסה: \"צד\", טורים: (1fr, 1fr), יחידה: \"סימן\""),
        ("a region that holds its place and repeats its number", ", מיקום: \"רגל\", גובה: שורות(2), שומר_מקום: true, סימן_בהמשך: true, גלישה: (\"עמוד_הבא\",)"),
        ("a cut that never looks back for a seam", ", מיקום: \"רגל\", גובה: שורות(1), תפר: 0, גלישה: (\"עמוד_הבא\",)"),
        ("…and one that looks further than the note is long", ", מיקום: \"רגל\", גובה: שורות(1), תפר: 500, גלישה: (\"עמוד_הבא\",)"),
    ];
    let mut bad = Vec::new();
    for (what, args) in combos {
        if let Got::Refused(msg) = render(args) {
            bad.push(format!("{what}: {msg}"));
        }
    }
    assert!(
        bad.is_empty(),
        "{} of {} combinations a writer would reach for did not render:\n{}",
        bad.len(),
        combos.len(),
        bad.join("\n")
    );
}

/// `חריגה: "סירוב"` refuses, and the refusal carries the two numbers.
///
/// The one value in the sweep above that is *meant* to stop the compile, kept
/// here rather than in the sweep so that "it refused" is not enough — a refusal
/// that does not say how much room was asked for and how much there is leaves a
/// writer to guess at a length.
#[test]
fn a_region_that_asks_for_more_than_the_page_has_says_by_how_much() {
    match render(", מיקום: \"רגל\", גובה: 20cm, חריגה: \"סירוב\"") {
        Got::Rendered => panic!("a region asking for 20cm under a 3.5cm reserve was allowed"),
        Got::Refused(msg) => {
            assert!(
                msg.contains("pt") && msg.chars().any(|c| c.is_ascii_digit()),
                "the refusal names no numbers, so a writer cannot pick a height: {msg}"
            );
        }
    }
}

//! Which Ksav commands are Typst **containers**, measured by asking Typst.
//!
//! `#מעבר_עמוד` and `#מקטע_עמוד` are page-level: Typst refuses them with
//! *"pagebreaks are not allowed inside of containers"*, from the middle of a
//! blanked preview, in English. So the editor greys them where they would fail
//! — and to do that it has to know which commands are containers.
//!
//! That is not a thing anybody can write down. It is a property of each
//! command's *definition*: `#כותרת1` is a `heading()` and `#הערה` a
//! `footnote()`, both containers, while `#שער` is `align(center, text(…))` and
//! `#הדגשה` a `strong()`, both transparent. Forty of the ninety-seven commands
//! with a body are containers and there is no rule over their names that
//! separates the two lists.
//!
//! `mode.ts`'s `legalAt` used to answer *"is the caret inside any brackets at
//! all"*, which is right for a heading, a note and a list and wrong for every
//! inline command in the language — so the page-break button was greyed inside
//! bold text, inside a title, and inside a note-heading, for nothing. The
//! whole-repo grid found it the day it learned to ask in two languages, which is
//! also the day it gained a `#שער` position.
//!
//! So the answer is measured rather than asserted, and the measurement is the
//! fixture:
//!
//!   cargo run --example emit-containers            # rewrite the fixture
//!   cargo test --test containers                   # fail if it is stale
//!
//! Every name the prelude binds is probed, not only the 115 the registry
//! advertises — a writer's document contains `#הערה_ה` and `#כותרת5` whether or
//! not a toolbar offers them, and the caret can be inside one.

use ksav_engine::{probe, DocConfig};
use std::collections::BTreeSet;

/// Every Hebrew name the prelude binds, in declaration order, deduplicated.
///
/// The same read `app/tools/emit-engine.mjs` does for the alias table, and for
/// the same reason: a `#let` is a declaration in a language, and reading one is
/// how both sides learn about the four tiers per family that the registry
/// deliberately stops short of.
pub fn prelude_commands(prelude: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();
    for line in prelude.lines() {
        let Some(rest) = line.strip_prefix("#let ") else {
            continue;
        };
        let name: String = rest
            .chars()
            .take_while(|c| {
                ('\u{0590}'..='\u{05FF}').contains(c) || *c == '_' || c.is_ascii_digit()
            })
            .collect();
        // Hebrew-named only, and nothing the prelude marks as its own plumbing.
        if name.is_empty() || !name.starts_with(|c: char| ('\u{0590}'..='\u{05FF}').contains(&c)) {
            continue;
        }
        if seen.insert(name.clone()) {
            out.push(name);
        }
    }
    out
}

/// The ways a Ksav command takes a content body, in the order they are tried.
///
/// One shape is not enough, and the shape that is missing is the one that
/// matters: `#סימן("א", [דיני תפילה])` takes its prose in a **second**
/// argument, so `#סימן[…]` fails on arity — which is neither "container" nor
/// "transparent", and a first version of this file filed it under *no content
/// body* and let the editor offer a page break that blanks the page. The grid
/// caught it in four cases the same afternoon.
///
/// So a command is undecidable only when **every** shape refuses to answer, and
/// the undecidable ones are written into the fixture by name rather than
/// counted, because a bucket nobody reads is where the next one will hide.
const SHAPES: &[&str] = &[
    "#{N}[א #מעבר_עמוד ב]",
    "#{N}[א][ב #מעבר_עמוד ג]",
    "#{N}(\"א\")[ב #מעבר_עמוד ג]",
    "#{N}(\"א\", [ב #מעבר_עמוד ג])",
    "#{N}(2)[ב #מעבר_עמוד ג]",
];

/// How the registry says this command is written, with the caret slot filled.
///
/// Tried **first**, because it is not a guess: `insert` is the string the
/// toolbar, the menu and the palette all write, so a command's registry shape is
/// the shape a writer's caret is actually standing in. `#צבע(rgb("#b91c1c"))[|]`
/// and `#טורים_בלוק(2)[|]` are both things no generic shape above would have
/// got right, and both can hold a caret.
///
/// Only the prelude-only names — the tiers past ג, the heading levels past three
/// — fall through to `SHAPES`, and those are all spelt like their advertised
/// siblings.
fn registry_shape(name: &str) -> Option<String> {
    let c = ksav_engine::commands::COMMANDS
        .iter()
        .find(|c| c.he == name || c.en == name)?;
    // A snippet with no caret slot has nowhere to put a page break, so it says
    // nothing about containment and the generic shapes get their turn.
    if !c.insert.contains('|') {
        return None;
    }
    // Nor does a caret **inside a string literal**, and this is the one that was
    // answering wrongly rather than not at all.
    //
    // Ten commands write their caret between quotes — `#ערוץ("|", מיקום: …)`,
    // `#אזור("|", …)`, `#הצג_אזור("|")`, `#הערה_בשם("|")`, `#גוף_הערה("|")[]`,
    // `#ציון_מקור("|", …)`, `#כלול("|")`, `#ערך("|")[]`, `#רשימת_סימונים("|")`,
    // `#תמונה("|", …)`. Filling that slot produced `#ערוץ("א #מעבר_עמוד ב", …)`,
    // where the page break is **string content**: Typst never sees a page break,
    // compiles it happily, and the probe writes down "not a container".
    //
    // Eight of the ten were recorded transparent that way — the editor was told a
    // page break inside them is fine, on the strength of a measurement that
    // measured nothing. So a quoted caret says nothing about containment either,
    // and the generic shapes below get their turn, where the break lands in a
    // real content body.
    if ksav_engine::commands::caret_in_string(c.insert) {
        return None;
    }
    Some(c.insert.replace('|', "א #מעבר_עמוד ב"))
}

/// Does a page break inside this command's body make Typst refuse?
///
/// Three outcomes, and only one of them is "container": it compiles (not a
/// container), it fails with the containers message (a container), or no shape
/// above gets far enough to say — a command that takes no content body at all,
/// or one whose arguments this file has not learned. The third is *not* evidence
/// either way, because a silently miscategorised command is a greyed button
/// nobody can explain, or a blanked page nobody predicted.
pub fn probe_one(name: &str) -> Option<bool> {
    let shapes: Vec<String> = registry_shape(name)
        .into_iter()
        .chain(SHAPES.iter().map(|s| s.replace("{N}", name)))
        .collect();
    for shape in shapes {
        let src = format!("{shape}\n");
        match probe::layout(&src, &DocConfig::default()) {
            Ok(_) => return Some(false),
            Err(diags) => {
                let said = diags
                    .iter()
                    .map(|d| d.message.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                // Typst says it two ways — `pagebreak` and `page` configuration
                // — and `#מקטע_עמוד` is the second. One of them missing is one
                // command silently on the wrong side.
                if said.contains("not allowed inside of containers") {
                    return Some(true);
                }
            }
        }
    }
    None
}

/// The measurement, as `(containers, transparent, undecidable)`.
pub fn measure(prelude: &str) -> (Vec<String>, Vec<String>, Vec<String>) {
    let (mut yes, mut no, mut skip) = (Vec::new(), Vec::new(), Vec::new());
    for name in prelude_commands(prelude) {
        match probe_one(&name) {
            Some(true) => yes.push(name),
            Some(false) => no.push(name),
            None => skip.push(name),
        }
    }
    (yes, no, skip)
}

/// The fixture text, so the writer and the checker cannot format it differently.
pub fn render(containers: &[String], transparent: usize, undecidable: &[String]) -> String {
    let list = |v: &[String]| {
        v.iter()
            .map(|s| format!("  {s:?}"))
            .collect::<Vec<_>>()
            .join(",\n")
    };
    format!(
        "{{\n \"note\": \"generated by engine/examples/emit-containers.rs — \
         measured, not written\",\n \"transparent\": {transparent},\n \
         \"undecidable\": [\n{}\n ],\n \"containers\": [\n{}\n ]\n}}\n",
        list(undecidable),
        list(containers),
    )
}

/// The prelude as text. Read from disk rather than `include_str!`'d, so
/// regenerating after an edit does not need the engine rebuilt first.
pub fn prelude() -> String {
    std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/typst/ksav.typ"))
        .expect("read the prelude")
}

fn main() {
    let (yes, no, skip) = measure(&prelude());
    let text = render(&yes, no.len(), &skip);
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/containers.json"
    );
    std::fs::write(path, &text).expect("write the fixture");
    println!(
        "wrote containers.json — {} containers, {} transparent, {} with no content body",
        yes.len(),
        no.len(),
        skip.len()
    );
}

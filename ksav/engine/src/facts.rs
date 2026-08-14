//! Everything the client generates from the engine, as **values**.
//!
//! # The finding this module answers
//!
//! Four tables in this crate were read by the app's generators by *parsing Rust
//! source text*:
//!
//!   - `impl Default for DocConfig` — `src.indexOf("impl Default for DocConfig")`
//!     then `.slice`, then a regex per field.
//!   - `pub static NOTICES` — slice to `\n];`, split on `Notice {`, regex per field.
//!   - `pub static COMMANDS` — a character-level reader of the `cmd!` macro.
//!   - `pub const SERVICES` — one regex, anchored to one `svc(…)` per line.
//!
//! Two of those had noticed the danger and answered it with a warning:
//! `services.rs` carries a `#[rustfmt::skip]` and a paragraph saying its
//! formatting is a build input. `impl Default for DocConfig` carried nothing —
//! so **reflowing that block changed what the client shipped as its defaults,
//! silently**, because the Rust value always wins on the wire and the app's
//! sliders would simply have read a different number from the page.
//!
//! A `#[rustfmt::skip]` is a symptom fence: it stops one tool from reformatting
//! one table, and says nothing about a human doing it, about a field gaining a
//! comment on its own line, or about the three tables that had no skip. The
//! cause is that **a value crossed a language boundary as source text**. So it
//! stops crossing as text. This module serialises the four tables; the artefact
//! is `engine/facts.gen.json`; `app/tools/facts.mjs` reads that and nothing else.
//! Reflow any of the four files however you like and the client ships exactly
//! the same bytes.
//!
//! # The artefact, and why it is committed
//!
//! `npm test` is a 3-second inner loop with no Rust toolchain in it, on purpose,
//! and `app/tools/*.mjs` run on a clone that has never built the engine. So the
//! JSON is generated, committed and read — the same arrangement `engine.gen.ts`
//! and `services.gen.ts` already are, moved one step back up the chain so that
//! the *first* generated thing is produced by the compiler that owns the values.
//!
//! Regenerate and fence it from here:
//!
//! ```text
//! cargo test --test facts              # fails if facts.gen.json is stale
//! KSAV_BLESS=1 cargo test --test facts # rewrite it
//! ```
//!
//! # What still reads text, and why that is not the same thing
//!
//! `app/tools/facts.mjs` counts declarations — `cmd!(`, `svc(`, `Notice {`, and
//! `pub ` inside `struct DocConfig` — and refuses when a count disagrees with
//! the JSON. That is a text scan of Rust and it is deliberately kept, because it
//! is the *opposite* failure mode: a count that is wrong can only ever produce a
//! loud refusal, never a wrong value, and it is invariant under every reflow
//! rustfmt can perform (a `svc(…)` broken across seven lines is still one
//! `svc(`). It exists so that a Rust edit that was never blessed is caught by
//! `npm test` too, and not only by CI's `cargo test`.

use serde::Serialize;

use crate::commands::{Command, COMMANDS};
use crate::notices::{Notice, NOTICES};
use crate::services::{Service, SERVICES};
use crate::DocConfig;

/// One service, without the function pointer.
///
/// `Service::call` is a `fn(&str) -> String` and there is nothing to say about
/// it on the other side of the seam; everything else on the row is a fact about
/// the service rather than about the build, which is why all four targets carry
/// the whole table.
#[derive(Serialize)]
pub struct ServiceFact {
    pub name: &'static str,
    /// `"get"` or `"post"`. The client maps these to the uppercase spelling
    /// `fetch` wants; the engine's own vocabulary is what travels.
    pub method: &'static str,
    pub path: &'static str,
    /// `"layout"`, `"work"` or `"quick"`.
    pub cost: &'static str,
    /// `"all"` or `"native"`.
    pub reach: &'static str,
}

impl ServiceFact {
    fn of(s: &'static Service) -> Self {
        use crate::services::{Cost, Method, Reach};
        ServiceFact {
            name: s.name,
            method: match s.method {
                Method::Get => "get",
                Method::Post => "post",
            },
            path: s.path,
            cost: match s.cost {
                Cost::Layout => "layout",
                Cost::Work => "work",
                Cost::Quick => "quick",
            },
            reach: match s.reach {
                Reach::All => "all",
                Reach::Native => "native",
            },
        }
    }
}

/// The Hebrew character rules, for the generators that are not Rust.
///
/// `girsa-hebrew` is the authority and every Rust caller simply calls it. Two
/// things in this repository cannot: `engine/typst/ksav.typ`, which is a Typst
/// prelude, and `tools/build_lexicon.py`, which is Python. Both had written the
/// tables out by hand, and the Python one was **wrong in the way that
/// mattered** — it deleted maqaf, paseq and sof pasuq instead of breaking on
/// them, so the corpus it built absorbed `אֶת־הַשָּׁמַיִם` as the single word
/// `אתהשמים` and the shipped dictionary carried eighty-odd non-words.
///
/// It agreed with the checker, which had made the identical omission. Two wrong
/// copies agreeing is the failure mode this whole file exists against, and the
/// answer is the same one: the value crosses the seam **as a value**.
#[derive(Serialize)]
pub struct HebrewFacts {
    /// Hebrew punctuation that lives inside the combining-mark block and
    /// separates words rather than decorating one: ־ maqaf, ׀ paseq, ׃ sof
    /// pasuq, ׆ nun hafukha. A reader that strips these glues two words into
    /// one; a reader that keeps them inside a token never splits at all.
    pub word_breaking: Vec<char>,
    /// The first and last code point of the combining-mark block, inclusive.
    /// Everything in it except `word_breaking` is stripped.
    pub mark_range: (char, char),
    /// The letters Hebrew attaches to the front of a word, `ד` included.
    pub prefix_letters: Vec<char>,
    /// Every spelling of a geresh, and the one character they fold to.
    pub geresh: (Vec<char>, char),
    /// Every spelling of gershayim, and the one character they fold to.
    pub gershayim: (Vec<char>, char),
}

/// Measured off `girsa-hebrew`'s own predicates rather than re-listed here.
///
/// Sweeping the range and asking is what makes this a *reading* of the crate
/// instead of a sixth copy of the table with an extra step. A predicate that
/// changes shows up here on the next `KSAV_BLESS=1`.
fn hebrew_facts() -> HebrewFacts {
    let block: Vec<char> = ('\u{0591}'..='\u{05C7}').collect();
    let letters: Vec<char> = ('\u{05D0}'..='\u{05EA}').collect();
    let quotes: Vec<char> = [
        '\u{05F3}', '\'', '\u{2018}', '\u{2019}', '\u{05F4}', '"', '\u{201C}', '\u{201D}',
    ]
    .into_iter()
    .collect();
    HebrewFacts {
        word_breaking: block
            .iter()
            .copied()
            .filter(|c| girsa_hebrew::is_word_breaking_punctuation(*c))
            .collect(),
        mark_range: ('\u{0591}', '\u{05C7}'),
        prefix_letters: letters
            .into_iter()
            .filter(|c| girsa_hebrew::PREFIX_LETTERS.contains(c))
            .collect(),
        geresh: (
            quotes
                .iter()
                .copied()
                .filter(|c| girsa_hebrew::is_geresh(*c))
                .collect(),
            girsa_hebrew::CANONICAL_GERESH,
        ),
        gershayim: (
            quotes
                .iter()
                .copied()
                .filter(|c| girsa_hebrew::is_gershayim(*c))
                .collect(),
            girsa_hebrew::CANONICAL_GERSHAYIM,
        ),
    }
}

/// The field names of one `Template`, as serde writes them.
///
/// A real one and not a synthesised value: `TEMPLATES` is never empty (the
/// engine ships twelve), and serialising the first is the only reading that
/// honours every serde attribute the struct carries or may grow.
fn template_fields() -> Vec<String> {
    let Some(first) = crate::templates::TEMPLATES.first() else {
        return Vec::new();
    };
    match serde_json::to_value(first) {
        Ok(serde_json::Value::Object(map)) => map.keys().cloned().collect(),
        _ => Vec::new(),
    }
}

/// The four tables the app generates from, as one document.
#[derive(Serialize)]
pub struct Facts {
    /// `DocConfig::default()`, field for field. A `None` per-edge margin
    /// serialises as `null`, which is what the app reads as *absent* — and
    /// absent means "follow the uniform margin", an instruction no number can
    /// stand in for.
    pub doc_defaults: DocConfig,
    pub commands: &'static [Command],
    pub notices: &'static [Notice],
    pub services: Vec<ServiceFact>,
    /// The operations the `git` service answers.
    ///
    /// The registry's own lesson, one level down. `git` is a single service
    /// with a `op` field, so the *name of the operation* is the wire — and a
    /// client keeping its own list of what git can be asked for is exactly the
    /// arrangement `services.rs` exists to have got rid of. Generated into the
    /// client's typed union, so a button wired to an operation the engine does
    /// not answer is a `tsc` error rather than a refusal at the writer.
    pub git_ops: &'static [&'static str],
    /// Read by `tools/build_lexicon.py`, which has no other way to reach
    /// `girsa-hebrew`.
    pub hebrew: HebrewFacts,
    /// The field names of `templates::Template`, in declaration order.
    ///
    /// **Not the templates.** Their bodies are twelve whole documents and the
    /// app fetches them from `/templates` at runtime; what crosses here is the
    /// *shape*, because that is the part the client was re-typing.
    ///
    /// `TemplateDef` in `api.ts` was a hand-written mirror of this struct — the
    /// one Rust→TypeScript table with none of this module's protection. A field
    /// added in Rust simply never reached the client, and a field renamed
    /// silently became `undefined` at every use, which is the failure mode this
    /// whole file exists against.
    ///
    /// Measured by serialising a real `Template` rather than listed here, so a
    /// field that gains `#[serde(rename)]` crosses under the name it goes on the
    /// wire with.
    pub template_fields: Vec<String>,
    /// Every character Typst reads as markup inside a `[…]` body.
    ///
    /// The client had five of these and the shared crate had ten, and both
    /// wrote `#מראה_מקום(מקור: …)[…]` from the same Girsa `display` string. The
    /// five it was missing — `* _ < > @` — are strong, emph, a label and a ref,
    /// and Sefaria titles contain them. See `src/escape.rs`.
    pub markup_escapes: String,
}

/// The git operations, from the module that answers them.
///
/// `git` is native-only — a browser tab has no folder on disk — so the module
/// is not linked into the wasm build and there is nothing there to ask. Empty
/// is the honest answer for that build rather than a second copy of the list
/// kept here to keep both targets compiling; `emit-services.mjs` refuses an
/// empty list outright, so a `facts.gen.json` blessed from a wasm build cannot
/// silently generate a client with no operations in it.
#[cfg(not(target_arch = "wasm32"))]
fn git_ops() -> &'static [&'static str] {
    crate::git::OPERATIONS
}

#[cfg(target_arch = "wasm32")]
fn git_ops() -> &'static [&'static str] {
    &[]
}

/// Everything, gathered.
pub fn facts() -> Facts {
    Facts {
        doc_defaults: DocConfig::default(),
        commands: COMMANDS,
        notices: NOTICES,
        services: SERVICES.iter().map(ServiceFact::of).collect(),
        git_ops: git_ops(),
        hebrew: hebrew_facts(),
        template_fields: template_fields(),
        markup_escapes: crate::escape::MARKUP.iter().collect(),
    }
}

/// `engine/facts.gen.json`, exactly as it is committed.
///
/// Pretty-printed with a trailing newline: it is a file in a repository that
/// people read diffs of, and a one-line 40 KB JSON blob makes "which default
/// changed" unanswerable in review — which is the failure this whole module is
/// about, one layer up.
pub fn facts_json() -> String {
    let mut out = serde_json::to_string_pretty(&facts()).expect("the facts serialise");
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_table_is_present_and_non_empty() {
        let f = facts();
        assert!(f.commands.len() > 100, "commands: {}", f.commands.len());
        assert!(f.notices.len() >= 4, "notices: {}", f.notices.len());
        assert!(f.services.len() >= 10, "services: {}", f.services.len());
    }

    #[test]
    fn the_defaults_serialise_as_the_app_reads_them() {
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&DocConfig::default()).unwrap()).unwrap();
        // The four per-edge margins and the note region are the whole reason
        // this is serialised rather than described: `null` is not `0`.
        for key in [
            "margin_top_cm",
            "margin_bottom_cm",
            "margin_inner_cm",
            "margin_outer_cm",
            "notes_region_cm",
        ] {
            assert_eq!(v[key], serde_json::Value::Null, "{key} should be absent");
        }
        assert_eq!(v["font"], "Frank Ruhl Hofshi");
        assert_eq!(v["size_pt"], 12.0);
        assert_eq!(v["keywords"], serde_json::json!([]));
    }

    /// The reflow this whole module exists to make harmless.
    ///
    /// Serialisation reads the *value*, so a `DocConfig::default()` written on
    /// one line and one written on forty produce the same JSON. There is no way
    /// to assert that against a formatter from in here, so assert the property
    /// that makes it true: nothing in `facts_json` is derived from the source
    /// text of this crate.
    #[test]
    fn the_json_is_values_and_not_source_text() {
        let json = facts_json();
        assert!(!json.contains("cmd!"), "the macro leaked into the artefact");
        assert!(!json.contains("svc("), "the macro leaked into the artefact");
        assert!(
            !json.contains("String::new()") && !json.contains("to_string()"),
            "a Rust expression leaked into the artefact",
        );
    }
}

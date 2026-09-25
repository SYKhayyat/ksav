//! The wire contract stays lean, and the documentation stays in the source.
//!
//! # The finding
//!
//! Issue #29 said the registry "carries long-form *why* essays and deprecation
//! histories inside `cmd!` literals that serialize to the client
//! (`commands_json`) — prose-as-value crossing the boundary `facts.rs` was
//! built to stop". It was filed with a 10% suspicion of being a false positive,
//! and it is one: the essays are `///` doc comments on the struct's fields and
//! `//` comments between the `cmd!` lines, and a Rust comment is not a value.
//! Nothing in `commands.rs` serialises a paragraph. The literals that *do*
//! serialise are the palette's own copy, at a median of 22 characters.
//!
//! That is worth a measurement rather than a paragraph, because the claim is
//! cheap to make and expensive to disprove by reading, and because the failure
//! it describes is entirely possible: someone documenting a command properly
//! would reasonably paste the explanation into the description, where it would
//! compile, pass every floor, ship 37 KB to a browser, and put a paragraph in a
//! tooltip.
//!
//! The measurement, from `src/commands.rs` as committed: 40,053 bytes, of which
//! 15,181 (38%) are comment and 16,035 (40%) are the `cmd!` literals — and of
//! the comments, 4,505 are `///`. The essays are real, and they are all in the
//! 38%. A Rust comment is not a value, so none of it is in `commands_json`, and
//! what is there is 224 bytes a row.
//!
//! # What is fenced, and what is deliberately not
//!
//! `desc_he` and `desc_en` are **wire data and stay**. The palette displays them
//! (`app/src/commands.ts`) and searches them (`matches`, which queries every
//! field a writer might recall the command by), so moving them off the wire
//! would move them onto a *second* wire, which is the disease rather than the
//! cure. The same is true of `deprecated`, which the client filters on.
//!
//! So the fence is not "no prose in the registry". It is:
//!
//!   - no description on the wire is longer than a line of UI, and
//!   - the only descriptions with a second sentence are the deprecation notices,
//!     and there are exactly as many of those as there are deprecated commands
//!     with a replacement.
//!
//! Both are measured off the artefact that actually crosses, so neither can be
//! satisfied by a claim about the source. The column set is fenced too, which
//! is the other half of "lean": not that the values are short, but that the
//! *shape* has not grown a column nothing reads.

use ksav_engine::commands::{commands_json, COMMANDS};

/// The longest a single description may be, and why that number.
///
/// A palette row is one line in a list. The longest description in the registry
/// today is 107 characters — the deprecated `הערה_על_הערה`, which has to name
/// its replacement *and* say what it used to do, because a writer who types it
/// from an old document has to be told what to type instead. 160 leaves room for
/// a genuinely descriptive one in either language without leaving room for a
/// paragraph: the descriptions are Hebrew and English prose, and a paragraph in
/// either runs past it in two sentences.
const LONGEST_UI_COPY: usize = 160;

/// The wire is a palette payload, not a documentation dump.
///
/// Size is the coarse reading and this is the sharp one: a sentence in the
/// `insert` column is not UI copy either, it is a bug — a snippet with a
/// trailing explanation would insert the explanation into a writer's document.
/// The bound is 200 because the longest real `insert` is 105 characters (a
/// fully-specified `#הגדרות_כותרות(…)`).
const LONGEST_INSERT: usize = 200;

/// Every string on the wire, with the column it came from.
fn wire_strings() -> Vec<(&'static str, &'static str, &'static str)> {
    let mut out = Vec::new();
    for c in COMMANDS {
        out.push((c.he, "desc_he", c.desc_he));
        out.push((c.he, "desc_en", c.desc_en));
        out.push((c.he, "insert", c.insert));
        out.push((c.he, "en", c.en));
        out.push((c.he, "category", c.category));
    }
    out
}

/// Every description on the wire is one line, except on a deprecated command,
/// where the second sentence is the deprecation notice.
///
/// # The rule, and why it is this shape
///
/// A description says what the command *does*. The moment it starts saying *why
/// it does it that way*, it is documentation, and documentation has a home: the
/// `///` comment above the row, which `commands.rs` already uses at length and
/// which costs nothing to read and nothing to ship.
///
/// The exception is measured, not granted. Two commands are deprecated with a
/// replacement, and for those the first sentence is the notice and the second
/// says what the command *was* — a writer who types it out of an old document
/// has to be told what to type instead, and the flag alone (`deprecated: true`)
/// does not tell them. Four strings on the wire have a second sentence and all
/// four are on those two commands; this is what keeps that true, because the
/// next one to reach for a second sentence will not be a deprecation.
///
/// A **sentence boundary** is a full stop, question mark or exclamation mark
/// followed by a space and a letter — which is why a command name ending in a
/// period does not count (`#הערה_ב.` is one, `use #הערה_ב.` is not) and why an
/// em-dash never does. An em-dash is the ordinary way these descriptions are
/// built — "Footnote — in a chosen channel, or the default one" — and forty of
/// them use one, so a rule that caught the em-dash would be a rule that banned
/// the house style.
#[test]
fn a_second_sentence_on_the_wire_is_a_deprecation_notice() {
    let sentence_boundary =
        |s: &str| s.char_indices().any(|(i, c)| ".?!".contains(c) && {
            let rest = &s[i + c.len_utf8()..];
            rest.starts_with(' ') && rest[1..].starts_with(|c: char| c.is_alphabetic())
        });

    let mut with_a_second_sentence = Vec::new();
    for c in COMMANDS {
        for (field, value) in [("desc_he", c.desc_he), ("desc_en", c.desc_en)] {
            if sentence_boundary(value) {
                with_a_second_sentence.push((c.he, field, value.to_string(), c.deprecated));
            }
        }
    }

    for (he, field, value, deprecated) in &with_a_second_sentence {
        assert!(
            *deprecated,
            "{he}.{field} has a second sentence and is not deprecated, so it is \
             explaining the command rather than announcing a replacement:\n  {value}\n\
             That belongs in the comment above the cmd! row; what ships is one line."
        );
    }
    // The measured count, so a *removal* is noticed as well as an addition. A
    // deprecation notice quietly dropped from a description is as much a wire
    // change as a paragraph quietly added to one, and this is the only test
    // that would see it.
    assert_eq!(
        with_a_second_sentence.len(),
        4,
        "expected four deprecation notices (two commands, two languages), found {}: {with_a_second_sentence:?}",
        with_a_second_sentence.len()
    );
}

/// No description is longer than a line of UI.
///
/// The size bound stated separately from the prose bound because they fail
/// differently: a paragraph is caught by its shape, and a single unbroken
/// 400-character sentence — which is what a machine-translated description looks
/// like — is caught by this and by nothing else.
#[test]
fn no_description_on_the_wire_is_longer_than_ui_copy() {
    let mut checked = 0;
    for (he, field, value) in wire_strings() {
        let cap = if field == "insert" {
            LONGEST_INSERT
        } else if matches!(field, "desc_he" | "desc_en") {
            LONGEST_UI_COPY
        } else {
            continue;
        };
        checked += 1;
        assert!(
            value.chars().count() <= cap,
            "{he}.{field} is {} characters, over the {cap} a palette row can show:\n  {value}\n\
             The explanation belongs in the comment above the cmd! row.",
            value.chars().count()
        );
    }
    // Two floors, and the second is the sharper one. The literal is what
    // `test/skips.test.mjs` recognises and what catches a `field` rename that
    // matched neither arm above and skipped every row — a walk that checked
    // nothing must not pass, and that is the whole shape of the prohibition. The
    // equality says the *exact* count, because every command contributes three
    // strings and anything else means a row was skipped rather than that the
    // registry grew.
    assert!(
        checked > 400,
        "only {checked} of the {} strings on the wire were length-checked; a field \
         name must have stopped matching the arms above",
        COMMANDS.len() * 3
    );
    assert_eq!(checked, COMMANDS.len() * 3, "every command contributes three strings");
}

/// The wire carries no field the palette does not read.
///
/// The other half of "lean": not that the values are short, but that the
/// *shape* has not grown a column nothing consumes. A field added to
/// `Command` for a Rust consumer's convenience would otherwise serialise into
/// 37 KB of browser payload and every generated artefact, and nothing would
/// notice for as long as the payload stayed under a line in a diff.
///
/// Names, not values: the fence is about the columns, and the values are fenced
/// by the two tests above. A rename is caught by the typechecker on both sides,
/// which is a stronger fence than this one and already in place.
#[test]
fn the_wire_carries_exactly_the_columns_the_palette_reads() {
    let v: serde_json::Value = serde_json::from_str(&commands_json()).expect("valid JSON");
    let row = v
        .as_array()
        .and_then(|a| a.first())
        .and_then(|r| r.as_object())
        .expect("the registry serialises to a non-empty array of objects");
    let mut got: Vec<&str> = row.keys().map(String::as_str).collect();
    got.sort_unstable();
    // The seven columns `app/src/commands.ts`, `api.ts`'s `CommandDef` and
    // `markdown.ts` read. `desc_he`/`desc_en` are displayed and searched,
    // `deprecated` filters the palette and the completion, `insert` is what the
    // writer gets, and `he`/`en`/`category` are the identity and the group chip.
    assert_eq!(
        got,
        [
            "category",
            "deprecated",
            "desc_en",
            "desc_he",
            "en",
            "he",
            "insert",
        ],
        "the wire contract changed; a consumer on either side now needs to know"
    );
}

/// The whole wire is a palette's worth of bytes.
///
/// The coarse bound, kept because the three tests above are all *per row* and
/// this is the one that would notice a new command arriving with a description
/// in a language nobody reads. 40 KB is 3× today's 37.5 KB and still a payload a
/// browser fetches without noticing; 100 KB is a payload somebody measures.
#[test]
fn the_wire_is_a_palette_and_not_a_manual() {
    let json = commands_json();
    assert!(
        json.len() < 40_000,
        "commands_json is {} bytes. That is a manual being shipped to a browser; \
         if a column really is that large, the client should fetch it when it is \
         needed rather than with the palette.",
        json.len()
    );
}

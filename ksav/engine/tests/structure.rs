//! `lib.rs` is a façade, and the five modules behind it have one job each (#222).
//!
//! # The finding
//!
//! `engine/src/lib.rs` was **6,231 lines and 160 top-level items** holding three
//! concerns: the prelude's language knowledge, the compile pipeline, and the wire.
//! The application's own god module had been split (3,536 → 1,473, #22/#188) and
//! fenced; the engine's was never touched, and it was four times the size of the
//! thing that split was written to fix.
//!
//! Nothing held it. `app/tools/imports.mjs` ("acyclic: 159 modules") has no Rust
//! counterpart, and no line of a size claim stood on `lib.rs` anywhere.
//!
//! # The cut, and what this file holds
//!
//! | module | what it is |
//! |---|---|
//! | `config.rs` | the writer's settings, and the refusals rather than clamps |
//! | `geometry.rs` | paper, lengths, the note reservoir's arithmetic |
//! | `lang/` | the prelude's spellings and what a document calls |
//! | `layout.rs` | the Typst world, the layout, the pages written from it |
//! | `wire.rs` | the JSON in and the JSON out |
//!
//! `lib.rs` keeps the module declarations, the re-exports that mean **no caller's
//! path moved**, the bundled-font list, and the two Typst-argument helpers three
//! modules share.
//!
//! The number below is `main.ts`'s rule, mirrored: a ceiling with a little
//! headroom, not an exact count, because the thing worth guarding is that the file
//! does not climb back into the file it was. `main.ts` is held at 1,500 because a
//! shell legitimately assembles a window; a crate root legitimately declares
//! modules and re-exports names, and that is all it should do.
//!
//! # What a move back would look like, and why it fails here
//!
//! Accretion is how the file got there the first time: a helper beside the thing
//! that used it, then another. The three assertions below make each of those
//! moves fail with a sentence naming the module it belongs in — a size ceiling, a
//! "the file holds no types" rule, and a check that the cut modules are still
//! there to hold them.

use std::path::Path;

use ksav_engine::probe;

/// Lines `lib.rs` may have. Measured at 343 after the cut; the ceiling leaves room
/// for a module declaration and a paragraph of reasoning each, which is what a
/// crate root is for, and not for a function.
const LIB_RS_CEILING: usize = 420;

fn engine_src() -> std::path::PathBuf {
    // `CARGO_MANIFEST_DIR` is `ksav/engine` for an integration test in this crate.
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn lines_of(name: &str) -> usize {
    let text = std::fs::read_to_string(engine_src().join(name))
        .unwrap_or_else(|e| panic!("{name} did not read: {e}"));
    text.lines().count()
}

#[test]
fn the_crate_root_is_a_facade_and_not_the_engine() {
    let n = lines_of("lib.rs");
    assert!(
        n <= LIB_RS_CEILING,
        "engine/src/lib.rs is {n} lines, past the {LIB_RS_CEILING} ceiling: \
         something was added to the crate root that belongs in a module — \
         `config`, `geometry`, `lang`, `layout` or `wire`"
    );
}

#[test]
fn the_crate_root_declares_and_re_exports_and_does_not_define() {
    let text = std::fs::read_to_string(engine_src().join("lib.rs")).expect("lib.rs reads");
    // A type in the crate root is a type two thousand lines from whoever needs it,
    // which is the state #222 found. Types live with the behaviour that reads them.
    for banned in [
        "pub struct DocConfig",
        "pub struct Compiled",
        "pub struct Wants",
    ] {
        assert!(
            !text.contains(banned),
            "`{banned}` is back in lib.rs: it belongs with the code that reads it \
             (`DocConfig` → config.rs, `Compiled`/`Wants` → layout.rs)"
        );
    }
    // And the façade must still be a façade rather than an empty file: the paths
    // callers use have to keep working, which is what the re-exports are for.
    for kept in [
        "pub use layout::{",
        "pub use wire::{",
        "pub use geometry::{",
        "pub use config::{",
    ] {
        assert!(
            text.contains(kept),
            "the re-export `{kept}` is gone from lib.rs"
        );
    }
}

#[test]
fn the_five_cuts_are_still_there_and_each_still_has_its_job() {
    // A module deleted or emptied would make the ceiling above pass by moving the
    // code somewhere worse. Each one is named with the reason it exists, and the
    // doc comment that says so is what a reader arriving at the file sees first.
    let modules: [(&str, &str); 6] = [
        ("config.rs", "The document's settings"),
        ("geometry.rs", "A page's geometry"),
        ("lang/mod.rs", "Ksav's language"),
        ("layout.rs", "The compile pipeline"),
        ("wire.rs", "The wire"),
        ("unit_tests.rs", "The engine's unit tests"),
    ];
    for (name, opening) in modules {
        let text = std::fs::read_to_string(engine_src().join(name))
            .unwrap_or_else(|e| panic!("{name} is gone: {e}"));
        assert!(
            text.contains(opening),
            "{name} no longer opens by saying what it is ({opening:?})"
        );
        assert!(
            lines_of(name) > 20,
            "{name} is a stub — the cut moved the code somewhere else instead"
        );
    }
}

#[test]
fn the_engine_still_answers_the_questions_it_answered_before_the_cut() {
    // The whole point of a façade: `ksav_engine::compile` is still there, at the
    // same path, and it still compiles a document. A split that moved a name is a
    // split that broke every caller silently.
    let out = ksav_engine::compile("שלום", &ksav_engine::DocConfig::default());
    assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    assert_eq!(out.pages_svg.len(), 1);
    let doc = probe::layout("שלום", &Default::default()).expect("laid out");
    assert_eq!(probe::page_sizes(&doc).len(), 1);
}

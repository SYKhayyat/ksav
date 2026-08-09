//! `engine/facts.gen.json` is what this crate says it is.
//!
//! # What this replaces
//!
//! The app's generators used to read four Rust tables by parsing this crate's
//! *source text*, and one of the four — `impl Default for DocConfig` — was
//! parsed by byte range with no fence of any kind on it. `services.rs` had
//! noticed the same danger about itself and answered it with `#[rustfmt::skip]`
//! plus a paragraph warning that its formatting was a build input, which stops
//! rustfmt and stops nothing else. The `DocConfig` block had neither, so
//! reflowing it changed what the editor shipped as its document defaults,
//! silently, in the direction that is hardest to see: the Rust value always wins
//! on the wire, so the app's sliders would have read one number while the page
//! was laid out to another.
//!
//! `src/facts.rs` now serialises all four tables. This file is the fence that
//! keeps the committed artefact honest, and it is the only door:
//!
//! ```text
//! cargo test --test facts                 # is it current?
//! KSAV_BLESS=1 cargo test --test facts    # make it current
//! ```
//!
//! # Why a committed artefact and not a build step
//!
//! `app/tools/*.mjs` and `npm test` run on a clone that has never had a Rust
//! toolchain pointed at it, in about three seconds. Making them shell out to
//! cargo would trade a silent-drift bug for a ten-minute inner loop, which is
//! the trade that produced the hand-written copies in the first place. So the
//! artefact is committed, this test is what keeps it true, and
//! `app/tools/facts.mjs` carries a declaration-count check so that an unblessed
//! Rust edit is caught by `npm test` as well as by CI.

use std::path::{Path, PathBuf};

/// `engine/facts.gen.json`.
fn artefact() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("facts.gen.json")
}

#[test]
fn the_committed_facts_are_this_crates_facts() {
    let wanted = ksav_engine::facts::facts_json();
    let path = artefact();

    if std::env::var_os("KSAV_BLESS").is_some() {
        std::fs::write(&path, &wanted).expect("write facts.gen.json");
        eprintln!("wrote {}", path.display());
        return;
    }

    let have = std::fs::read_to_string(&path).unwrap_or_default();
    if have == wanted {
        return;
    }

    // Name the first table that moved rather than printing 40 KB of JSON at
    // somebody. A stale artefact is a failure a reader meets before they know
    // how this repository is put together, and "they differ" without "which
    // one, and what to run" is a dead end.
    let moved = first_difference(&have, &wanted);
    panic!(
        "engine/facts.gen.json is stale{moved}.\n\
         Regenerate it with:\n  \
         KSAV_BLESS=1 cargo test --test facts\n\
         then regenerate the app's copies with:\n  \
         cd ../app && npm run fixtures",
    );
}

/// A short description of where two JSON documents first disagree.
fn first_difference(have: &str, wanted: &str) -> String {
    let (Ok(a), Ok(b)) = (
        serde_json::from_str::<serde_json::Value>(have),
        serde_json::from_str::<serde_json::Value>(wanted),
    ) else {
        return String::new();
    };
    for key in ["doc_defaults", "commands", "notices", "services"] {
        if a.get(key) != b.get(key) {
            return format!(" — `{key}` changed");
        }
    }
    String::new()
}

/// The artefact carries every field of `DocConfig`, including the absent ones.
///
/// The four per-edge margins and the note region serialise as `null`, and the
/// app reads `null` as *absent* rather than as zero, because absent means
/// "follow the uniform margin" — an instruction no number stands in for. A
/// serialiser that skipped `None` would emit a file that parses, typechecks and
/// quietly gives the editor five fewer settings than the engine has.
#[test]
fn an_absent_default_is_present_as_null() {
    let v: serde_json::Value =
        serde_json::from_str(&ksav_engine::facts::facts_json()).expect("valid JSON");
    let defaults = v["doc_defaults"].as_object().expect("an object");
    for key in [
        "margin_top_cm",
        "margin_bottom_cm",
        "margin_inner_cm",
        "margin_outer_cm",
        "notes_region_cm",
    ] {
        assert!(defaults.contains_key(key), "{key} is missing entirely");
        assert!(defaults[key].is_null(), "{key} should be null");
    }
}

/// Every table the app generates from is in there, and none of them is empty.
///
/// An empty table generates a file that typechecks, breaks everything at
/// runtime, and looks like a successful regeneration. The generators each carry
/// their own floor for the same reason; this is the one at the source.
#[test]
fn no_table_is_empty() {
    let v: serde_json::Value =
        serde_json::from_str(&ksav_engine::facts::facts_json()).expect("valid JSON");
    for (key, least) in [
        ("commands", 100),
        ("notices", 4),
        ("services", 10),
        ("doc_defaults", 25),
    ] {
        let n = match &v[key] {
            serde_json::Value::Array(a) => a.len(),
            serde_json::Value::Object(o) => o.len(),
            other => panic!("{key} is {other:?}"),
        };
        assert!(n >= least, "{key}: {n}, expected at least {least}");
    }
}

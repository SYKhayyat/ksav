//! The container fixture is a measurement, and this is the re-measurement.
//!
//! `tests/fixtures/containers.json` says which commands Typst treats as
//! containers, and `mode.ts`'s `legalAt` greys `#מעבר_עמוד` and `#מקטע_עמוד`
//! inside them. A stale entry is a greyed button with no reason behind it or —
//! worse — an offered one that blanks the page, which is the failure the whole
//! insertion grid exists against.
//!
//! So nothing here trusts the file. It asks Typst the same question the
//! generator asked and compares, which makes the fixture a cache rather than a
//! claim. Regenerate with `cargo run --example emit-containers`.
//!
//! The three-way split matters and is asserted as such: a command is a
//! container, or it is transparent, or it has no content body to put a page
//! break inside. Folding the third into either of the first two is how a
//! greyed control gets a reason nobody can explain.

use std::collections::BTreeSet;

// The generator itself, so the check and the write cannot measure differently.
// Its `main` and its renderer are unused here, which is the point: one
// measurement function with two callers beats two functions that agree today.
#[path = "../examples/emit-containers.rs"]
#[allow(dead_code)]
mod emit;

const FIXTURE: &str = include_str!("fixtures/containers.json");

fn names(v: &serde_json::Value, key: &str) -> Vec<String> {
    v[key]
        .as_array()
        .unwrap_or_else(|| panic!("{key} is a list"))
        .iter()
        .map(|c| c.as_str().unwrap().to_string())
        .collect()
}

fn declared() -> (Vec<String>, usize, Vec<String>) {
    let v: serde_json::Value = serde_json::from_str(FIXTURE).expect("the fixture parses");
    (
        names(&v, "containers"),
        v["transparent"].as_u64().expect("transparent count") as usize,
        names(&v, "undecidable"),
    )
}

/// Every command the fixture calls a container really is one, and no other is.
#[test]
fn the_container_list_is_what_typst_says_it_is() {
    let (want, want_transparent, want_undecidable) = declared();
    let (got, no, undecidable) = emit::measure(&emit::prelude());
    let transparent = no.len();

    // A prelude that stopped parsing, or a fixture that lost its rows, both
    // land here as an empty list that agrees with itself.
    assert!(
        got.len() > 30 && transparent > 30,
        "the probe found {} containers and {} transparent commands — the prelude \
         is not being read",
        got.len(),
        transparent
    );

    let want_set: BTreeSet<&str> = want.iter().map(String::as_str).collect();
    let got_set: BTreeSet<&str> = got.iter().map(String::as_str).collect();
    let added: Vec<&&str> = got_set.difference(&want_set).collect();
    let gone: Vec<&&str> = want_set.difference(&got_set).collect();
    assert!(
        added.is_empty() && gone.is_empty(),
        "tests/fixtures/containers.json is stale — run \
         `cargo run --example emit-containers`.\n  now a container: {added:?}\n  \
         no longer one: {gone:?}",
    );
    assert_eq!(
        transparent, want_transparent,
        "the transparent count moved without the container list moving, which \
         means a command changed shape rather than changing side",
    );

    // By name, not by count. This is the bucket that hid `#סימן` — a container
    // whose prose is its *second* argument, so a one-shape probe failed on arity
    // and filed it under "no content body". The editor then offered a page break
    // inside every siman in the corpus, and the fixture said 36 where 36 was
    // the only thing anybody could have checked.
    assert_eq!(
        undecidable, want_undecidable,
        "the set of commands no probe shape can answer for has changed — if a \
         command gained a content body, `SHAPES` in emit-containers.rs needs to \
         know how it is called",
    );
}

/// The claim the editor actually makes, on both sides, in both languages.
///
/// The list above is the mechanism; this is the promise. A page break inside a
/// heading blanks the document and inside a title does not, and the editor is
/// only allowed to grey the first.
#[test]
fn a_page_break_fails_in_a_container_and_works_outside_one() {
    for name in ["כותרת1", "h1", "הערה", "fnote", "רשימה", "bullets"] {
        assert_eq!(
            emit::probe_one(name),
            Some(true),
            "#{name} should be a container"
        );
    }
    for name in ["שער", "title", "הדגשה", "bold", "כותרת_בהערה", "note_heading"] {
        assert_eq!(
            emit::probe_one(name),
            Some(false),
            "#{name} should pass a page break through — the editor offers it there"
        );
    }
}

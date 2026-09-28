//! Typst packages, resolved from a bundled directory.
//!
//! `#import "@preview/meander:0.4.4"` failed with *file not found (searched at
//! typst.toml)*, and grep found no `PackageSpec`, no `@preview` and no package
//! path handling anywhere in the repository, Rust or TypeScript. The whole Typst
//! package ecosystem was unreachable — `meander`'s bisect, `marginalia`'s
//! per-note shift policy, all of it.
//!
//! # Bundled, never fetched
//!
//! `typst-as-lib` offers `with_package_file_resolver`, and it wants `ureq` or
//! `reqwest`: it downloads. That is wrong here twice over. A compile that reaches
//! the network is a compile that can hang, and an editor that is 59ms after a
//! keystroke cannot have one in that path; and Ksav is meant to work on a plane.
//!
//! So packages live on disk in **Typst's own layout** —
//! `<root>/<namespace>/<name>/<version>/…` — which is what lets a vendored
//! package keep its upstream identity and version instead of becoming a fork.

use ksav_engine::{probe, DocConfig};

/// A package imports, and its function runs.
///
/// The fixture is a *real* package — a `typst.toml` with an entrypoint, in the
/// directory layout Typst uses — rather than a mock, because a loader that works
/// on a mock and not on the real layout is a loader that does not work.
#[test]
fn a_bundled_package_can_be_imported() {
    let doc = "#import \"@preview/ksavtest:0.1.0\": hello\n#hello[עולם]";
    let laid = probe::layout(doc, &DocConfig::default())
        .unwrap_or_else(|d| panic!("a bundled package did not import: {d:?}"));
    let runs = probe::text_runs(&laid);
    let all: String = runs.iter().map(|r| r.text.clone()).collect();
    assert!(
        all.contains("שלום") && all.contains("עולם"),
        "the package's function did not render: {all:?}"
    );
}

/// A package that is not bundled says so, rather than half-importing.
#[test]
fn a_package_that_is_not_there_is_an_error() {
    let doc = "#import \"@preview/nothing-here:9.9.9\": x\n#x";
    assert!(
        probe::layout(doc, &DocConfig::default()).is_err(),
        "importing a package that is not bundled compiled anyway"
    );
}

/// A missing package is **named**, and the naming is the fix.
///
/// Asserting `is_err()` was the whole of this test, and it passed while the
/// message said *"a file (e.g. an image) wasn't found — check the path"* — which
/// sends somebody who imported `@preview/meander` to go looking for an image.
/// The loader shipped and left behind the exact diagnostic the issue opened with,
/// so an error that is correct and useless is not a passing test.
#[test]
fn a_missing_package_is_named_in_its_own_words() {
    let doc = "#import \"@preview/nothing-here:9.9.9\": x\n#x";
    let said = probe::layout(doc, &DocConfig::default())
        .unwrap_err()
        .pop()
        .map(|d| d.message)
        .unwrap_or_default();
    assert!(
        said.contains("@preview/nothing-here:9.9.9"),
        "the package was not named: {said}"
    );
    assert!(
        !said.contains("image"),
        "a package import was reported as a missing image: {said}"
    );
    // Bundled, not downloaded — so "not found" does not read as "try again".
    assert!(
        said.contains("bundled") && said.contains("never downloaded"),
        "the message does not say packages ship rather than download: {said}"
    );
}

/// A *wrong version* of a real package is a different sentence from a wrong
/// package, because there is a real fix for it and it is not "add a package".
#[test]
fn a_wrong_version_names_the_version_that_was_asked_for() {
    let doc = "#import \"@preview/ksavtest:0.2.0\": hello\n#hello[x]";
    let said = probe::layout(doc, &DocConfig::default())
        .unwrap_err()
        .pop()
        .map(|d| d.message)
        .unwrap_or_default();
    assert!(
        said.contains("@preview/ksavtest:0.2.0"),
        "the requested version was not named: {said}"
    );
}

/// What is bundled is reported as specs, and the real bundled package is in the
/// list — so the answer to "what can I import?" is in the error itself.
#[test]
fn the_message_lists_what_is_bundled() {
    let said = probe::layout("#import \"@preview/nothing-here:9.9.9\": x\n#x", &DocConfig::default())
        .unwrap_err()
        .pop()
        .map(|d| d.message)
        .unwrap_or_default();
    assert!(
        said.contains("@preview:ksavtest:0.1.0"),
        "the bundled package was not listed: {said}"
    );
}

/// The version is part of the identity.
///
/// Two versions of one package are two directories and two different imports,
/// which is the property that makes bundling different from vendoring: a sefer
/// pinned to 0.1.0 keeps getting 0.1.0.
#[test]
fn the_version_is_part_of_what_is_asked_for() {
    let wrong = "#import \"@preview/ksavtest:0.2.0\": hello\n#hello[עולם]";
    assert!(
        probe::layout(wrong, &DocConfig::default()).is_err(),
        "a version that is not bundled resolved to one that is"
    );
}

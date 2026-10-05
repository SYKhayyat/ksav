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

/// A throwaway `@local` package root, in Typst's own layout.
///
/// **`set_local_packages_root` is a process-global `OnceLock`**, so this can only
/// be set once per test *binary* — and these are the only tests in this file that
/// set it, and they all share the one root built here. That is the constraint the
/// design imposes and the reason it is a good one: a root that any caller could
/// re-point would not be a fence.
fn local_root() -> std::path::PathBuf {
    static ROOT: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
    ROOT.get_or_init(|| {
        let root = std::env::temp_dir().join("ksav-test-local-packages");
        let pkg = root.join("local").join("kavlocal").join("1.0.0");
        std::fs::create_dir_all(&pkg).expect("a @local package root");
        std::fs::write(
            pkg.join("typst.toml"),
            "[package]\nname = \"kavlocal\"\nversion = \"1.0.0\"\n\
             entrypoint = \"lib.typ\"\nlicense = \"MIT\"\n",
        )
        .expect("a @local manifest");
        std::fs::write(pkg.join("lib.typ"), "#let greet(who) = [תוכם #who]\n")
            .expect("a @local entrypoint");
        ksav_engine::set_local_packages_root(&root);
        root
    })
    .clone()
}

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
    let said = probe::layout(
        "#import \"@preview/nothing-here:9.9.9\": x\n#x",
        &DocConfig::default(),
    )
    .unwrap_err()
    .pop()
    .map(|d| d.message)
    .unwrap_or_default();
    assert!(
        said.contains("@preview:ksavtest:0.1.0"),
        "the bundled package was not listed: {said}"
    );
}

/// #73's fence, and the one that survives whatever is decided about `meander`.
///
/// The issue says it directly: *"keep it **optional** — nothing in the prelude
/// may depend on it, so a Ksav without it is still a complete Ksav."*
///
/// That is a property of the prelude, and nothing was checking it. It is the
/// kind of property that holds on the day it is written and is gone the first
/// time somebody adds one convenient `#import "@preview/…"` to solve something —
/// and by then it is not a missing package, it is **every document failing to
/// compile**, which is a far worse day than the one that avoided the import.
///
/// Asserted against the **assembled document** rather than the prelude file,
/// which is strictly stronger: `assemble_source` inlines the whole prelude and
/// adds the import line and the show rule, so an escape in any of the three is
/// caught, and it is the exact string a compiler is handed.
#[test]
fn the_prelude_depends_on_no_third_party_package() {
    let assembled = ksav_engine::assemble_source("טקסט", &DocConfig::default());
    // The two namespaces a bundled package can live in. `@local` is Typst's own
    // name for a packages directory beside the document, so a single `#import
    // "@local/…"` would make every sefer depend on a directory Ksav does not
    // ship — the same failure by a different spelling.
    for ns in ["@preview", "@local"] {
        let hits: Vec<&str> = assembled.lines().filter(|l| l.contains(ns)).collect();
        assert!(
            hits.is_empty(),
            "the assembled document reaches for {ns} — a Ksav without that \
             package must still be a complete Ksav:\n{}",
            hits.join("\n")
        );
    }
    // Belt and braces on the spelling: a package import is `#import "…"`, and
    // the prelude's own imports are relative (`"types.typ"`), so no import in
    // the assembled document may open with a quote at all.
    for (i, line) in assembled.lines().enumerate() {
        if let Some(rest) = line.trim_start().strip_prefix("#import ") {
            assert!(
                !rest.trim_start().starts_with('"'),
                "assembled line {} imports an absolute path: {line}",
                i + 1
            );
        }
    }
}

/// #72: a writer's own Typst library imports by `@local`.
///
/// The issue's *cheap half* — "ship `@local` alone — a packages directory in
/// the app's data dir … and leave the sefer a single file. That answers 'can I
/// bring my own Typst library', which is most of the value, and touches no
/// editor, no autosave and no git."
///
/// Asserted end to end, through `probe::layout`, because the thing that could
/// plausibly break is the *resolver chain*: a second `FileSystemResolver` is
/// consulted, and if it shadowed the bundled one or was consulted in the wrong
/// order, `@preview` would stop working while `@local` worked. The next test
/// holds both at once, which is the only way to catch that.
#[test]
fn a_local_package_imports_and_runs() {
    let _ = local_root();
    let doc = "#import \"@local/kavlocal:1.0.0\": greet\n#greet[עולם]";
    let laid = probe::layout(doc, &DocConfig::default())
        .unwrap_or_else(|d| panic!("a @local package did not import: {d:?}"));
    let all: String = probe::text_runs(&laid)
        .iter()
        .map(|r| r.text.clone())
        .collect();
    assert!(
        all.contains("תוכם") && all.contains("עולם"),
        "the @local package's function did not render: {all:?}"
    );
}

/// Setting a `@local` root must not cost the bundled one.
///
/// **The shadowing fence.** `package_resolvers` returns the bundled resolver
/// first and the local one second; if that order were ever reversed — or if the
/// second resolver replaced rather than followed the first — `@preview/ksavtest`
/// would stop resolving the moment a `@local` root existed, and the failure
/// would only appear for writers who had added a package of their own. So both
/// namespaces are exercised in one test.
#[test]
fn a_local_root_does_not_shadow_the_bundled_one() {
    let _ = local_root();
    // The bundled package still resolves, with a user root in place.
    let bundled = probe::layout(
        "#import \"@preview/ksavtest:0.1.0\": hello\n#hello[עולם]",
        &DocConfig::default(),
    )
    .unwrap_or_else(|d| panic!("the bundled package stopped resolving: {d:?}"));
    let all: String = probe::text_runs(&bundled)
        .iter()
        .map(|r| r.text.clone())
        .collect();
    assert!(all.contains("שלום"), "the bundled package broke: {all:?}");
    // …and both are listed in the "what can I import" answer, so a writer with a
    // user root is not shown only the shipped half. **The list's own spelling is
    // `@ns:name:version` with colons**, which is what `bundled_packages` returns
    // and what the message prints; the *import* is the slash form. Asserting the
    // wrong one of those two would fail while the feature worked perfectly,
    // which is the other thing this test is for.
    let said = probe::layout(
        "#import \"@local/nothing-here:9.9.9\": x\n#x",
        &DocConfig::default(),
    )
    .unwrap_err()
    .pop()
    .map(|d| d.message)
    .unwrap_or_default();
    assert!(
        said.contains("@local:kavlocal:1.0.0"),
        "the @local package was not listed: {said}"
    );
    assert!(
        said.contains("@preview:ksavtest:0.1.0"),
        "the bundled package fell off the list: {said}"
    );
}

/// #72's measured wart: a `@local` root is not called `packages`, and the
/// diagnostic must survive that.
///
/// The measurement on the issue found three searched-at shapes and two wrong
/// answers, because `missing_package` split on the literal `"packages/"`. A user
/// root is chosen by the writer and need not be called `packages`, so that split
/// degraded the message back to *"a file (e.g. an image) wasn't found"* — the
/// wart #67 closed, reopened by the very feature meant to help.
///
/// The temp root here is `ksav-test-local-packages`, which is **not** a directory
/// named `packages`, so this test cannot pass by accident.
#[test]
fn a_missing_local_package_is_named_from_a_root_not_called_packages() {
    let root = local_root();
    assert_ne!(
        root.file_name().and_then(|n| n.to_str()),
        Some("packages"),
        "this test is only meaningful on a root that is not named `packages`"
    );
    let said = probe::layout(
        "#import \"@local/nothing-here:9.9.9\": x\n#x",
        &DocConfig::default(),
    )
    .unwrap_err()
    .pop()
    .map(|d| d.message)
    .unwrap_or_default();
    assert!(
        said.contains("@local/nothing-here:9.9.9"),
        "the @local package was not named: {said}"
    );
    assert!(
        !said.contains("image"),
        "a @local import was reported as a missing image: {said}"
    );
}

/// The confinement is the point, and it is the thing a second root could lose.
///
/// `packages_root`'s comment says its root **is** the package directory, so a
/// document cannot reach anything else on the disk through it. A second root
/// either preserves that or quietly does not, and nothing else in this file would
/// notice.
///
/// So: a document still cannot read `/etc/hostname`, still cannot `read()` a path,
/// and still cannot import a package by a path that is not in a package layout.
/// **All four rows were refused before `@local` existed** and must be refused
/// after it.
#[test]
fn a_local_root_does_not_open_the_disk() {
    let _ = local_root();
    for (what, doc) in [
        ("an absolute import", "#import \"/etc/hostname\"\n#x"),
        ("a relative sibling import", "#import \"helper.typ\"\n#x"),
        ("a read()", "#read(\"names.txt\")"),
        (
            "an escape out of the package root",
            "#import \"@local/../../../etc/hostname\"\n#x",
        ),
    ] {
        assert!(
            probe::layout(doc, &DocConfig::default()).is_err(),
            "a document reached the disk: {what}"
        );
    }
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

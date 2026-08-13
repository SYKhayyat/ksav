//! `ksav://insert?packet=…`, which is three files agreeing or it is nothing.
//!
//! # The finding
//!
//! With Ksav already open, firing a `ksav://` URL started a **second Ksav**. On
//! Windows and Linux the deep-link plugin only ever hears a *cold* start;
//! handing a URL to a process that is already running is
//! `tauri-plugin-single-instance`'s job, it is documented as deep-link's
//! companion on those platforms, and it was never added.
//!
//! What that cost was not one misdelivered quote. `post::INBOX` is a
//! process-local `static`, so the source waited in a window the writer was not
//! typing in — the send looked like it had done nothing at all. And
//! `Desk::open` binds a fresh port and republishes the endpoint file
//! unconditionally, so the duplicate **took the pairing over**: every later send
//! from Girsa went to it, over the loopback as much as over `ksav://`, and when
//! the duplicate was closed its `Desk` drop withdrew the endpoint file and Girsa
//! reported that Ksav was not running while the writer was looking straight at
//! it.
//!
//! # Why this file and not one assertion in `manifests.rs`
//!
//! Because the bug was not in the manifest. A working deep link needs three
//! separate files to agree, and each of them can be edited alone:
//!
//! | file | what it has to say |
//! |---|---|
//! | `app/src-tauri/Cargo.toml` | both plugins, the second one gated to the platforms that need it |
//! | `app/src-tauri/src/lib.rs` | single-instance registered, and registered *first* |
//! | `app/src-tauri/tauri.conf.json` | the scheme `girsa-post` will actually parse |
//!
//! Two of the three were right the whole time. So the tests below are written
//! against the *class* — "a shell that registers a URL scheme", not "this
//! shell" — and the last of them refuses to pass when it finds nothing to check,
//! because a rule that goes quiet when its subject moves is how the first two
//! stayed right while the third was missing.

mod common;

use common::repo::{named, root, shown, uncommented};
use std::path::Path;

/// The shell's manifest, the one file this repository actually has.
fn shell_manifest(root: &Path) -> std::path::PathBuf {
    root.join("ksav")
        .join("app")
        .join("src-tauri")
        .join("Cargo.toml")
}

/// Every manifest in the tree that pulls in the deep-link plugin.
fn deep_linkers(root: &Path) -> Vec<std::path::PathBuf> {
    named(root, "Cargo.toml")
        .into_iter()
        .filter(|m| {
            uncommented(m)
                .lines()
                .any(|l| l.trim_start().starts_with("tauri-plugin-deep-link"))
        })
        .collect()
}

#[test]
fn a_deep_link_plugin_never_ships_without_single_instance() {
    let root = root();
    let found = deep_linkers(&root);

    // The rule is worth nothing if it has nothing to look at. This repository
    // registers a URL scheme; a run in which no manifest does is a run in which
    // the scan broke, not one in which the danger went away.
    assert!(
        !found.is_empty(),
        "no manifest in the tree declares tauri-plugin-deep-link. Either the \n\
         deep link was removed — in which case delete this file deliberately, and \n\
         `post::arrived` with it — or the scan above stopped seeing it, which is \n\
         the failure this assertion exists to make loud.",
    );

    for manifest in found {
        let text = uncommented(&manifest);
        let name = shown(&root, &manifest);

        let line = text
            .lines()
            .map(str::trim)
            .find(|l| l.starts_with("tauri-plugin-single-instance"))
            .unwrap_or_else(|| {
                panic!(
                    "{name} declares tauri-plugin-deep-link and not \n\
                     tauri-plugin-single-instance.\n\
                     On Windows and Linux the deep-link plugin only hears a cold start, so \n\
                     a URL arriving while the application is open starts a *second* one. \n\
                     For Ksav that means the source waits in the wrong process (the inbox \n\
                     is a `static`) and the duplicate republishes the endpoint file, taking \n\
                     the whole Girsa pairing with it. See the note in that manifest."
                )
            });

        // Without the feature the plugin still stops the duplicate, and the URL
        // the duplicate was carrying is dropped on the floor — which is the same
        // silence, arriving through the fix.
        assert!(
            line.contains("\"deep-link\""),
            "{name}: tauri-plugin-single-instance is declared without its \n\
             `deep-link` feature:\n  {line}\n\
             Without it the second process is stopped and the URL it was launched \n\
             with is thrown away, so a send still does nothing — the same silence, \n\
             arriving through the fix for it.",
        );

        // Gated, and gated to the platforms that need it: macOS routes URLs
        // through the app delegate and wants neither plugin. An ungated
        // dependency would compile a Windows workaround into the macOS bundle.
        let block = text
            .lines()
            .filter(|l| l.trim_start().starts_with("[target."))
            .find(|l| l.contains("windows") && l.contains("linux"))
            .unwrap_or_else(|| {
                panic!(
                    "{name}: tauri-plugin-single-instance is not under a \n\
                     `[target.'cfg(any(windows, target_os = \"linux\"))'.dependencies]` \n\
                     block. macOS delivers URLs through the app delegate and needs \n\
                     neither plugin."
                )
            });
        assert!(
            block.contains("dependencies"),
            "{name}: {block} is not a dependencies table",
        );
    }
}

#[test]
fn single_instance_is_registered_before_every_other_plugin() {
    let root = root();
    let lib = root
        .join("ksav")
        .join("app")
        .join("src-tauri")
        .join("src")
        .join("lib.rs");
    let text = std::fs::read_to_string(&lib).expect("the shell's lib.rs is readable");

    // Comment prose in that file is *about* this plugin at length, so the search
    // is for the call and not the name.
    let single = text
        .find("tauri_plugin_single_instance::init")
        .unwrap_or_else(|| {
            panic!(
                "{}: the shell does not call tauri_plugin_single_instance::init. \n\
                 The dependency being present is not the fix; registering it is.",
                shown(&root, &lib)
            )
        });

    // Every *other* plugin registration in the file. The exclusion reads the
    // text at the match and not the matched pattern: `match_indices` hands back
    // the needle it was given, so a filter over that would have excluded nothing
    // and this test would have compared the plugin against itself. It did, and
    // said so — eight bytes apart, which is the length of `.plugin(`.
    const CALL: &str = ".plugin(tauri_plugin_";
    let ours = format!("{CALL}single_instance");
    let first_other = text
        .match_indices(CALL)
        .map(|(at, _)| at)
        .find(|at| !text[*at..].starts_with(&ours))
        .expect("the shell registers other plugins too");

    assert!(
        single < first_other,
        "{}: another plugin is registered before tauri-plugin-single-instance \n\
         (at byte {first_other}, against {single}).\n\
         This is the plugin that decides whether the process is going to be an \n\
         application at all — the second instance forwards its argv and exits from \n\
         inside this plugin's setup, so everything registered above it runs in a \n\
         process that is about to disappear.",
        shown(&root, &lib),
    );
}

#[test]
fn the_registered_scheme_is_the_one_the_parser_reads() {
    let root = root();
    let conf = root
        .join("ksav")
        .join("app")
        .join("src-tauri")
        .join("tauri.conf.json");
    let text = std::fs::read_to_string(&conf).expect("tauri.conf.json is readable");
    let value: serde_json::Value =
        serde_json::from_str(&text).expect("tauri.conf.json is valid JSON");

    let schemes = value
        .pointer("/plugins/deep-link/desktop/schemes")
        .and_then(serde_json::Value::as_array)
        .unwrap_or_else(|| {
            panic!(
                "{}: no plugins.deep-link.desktop.schemes. The installer registers \n\
                 nothing with the operating system, so `ksav://` is an unknown \n\
                 protocol and every citation in every exported PDF is dead.",
                shown(&root, &conf)
            )
        });

    let schemes: Vec<&str> = schemes
        .iter()
        .filter_map(serde_json::Value::as_str)
        .collect();
    assert_eq!(
        schemes,
        vec![ksav_engine::post::scheme()],
        "{}: the scheme registered with the operating system is not the scheme \n\
         `girsa-post` parses ({:?}). A rename on either side gives a deep link that \n\
         opens Ksav and then does nothing with the URL that opened it.",
        shown(&root, &conf),
        ksav_engine::post::scheme(),
    );
}

#[test]
fn the_shell_still_hands_arrivals_to_the_engine() {
    let root = root();
    let lib = root
        .join("ksav")
        .join("app")
        .join("src-tauri")
        .join("src")
        .join("lib.rs");
    let text = std::fs::read_to_string(&lib).expect("the shell's lib.rs is readable");

    // The single-instance plugin forwards argv *into the deep-link listener*, so
    // there is deliberately no second delivery path here. That is the whole
    // reason the `deep-link` feature is asked for above, and it only holds while
    // the listener below is the one place a URL is turned into an arrival.
    for call in ["on_open_url", "girsa_post::deep_link", "post::arrived"] {
        assert!(
            text.contains(call),
            "{}: the shell no longer calls `{call}`. A URL that reaches the right \n\
             process and is not parsed into the inbox is the same silence as one \n\
             that reached the wrong process.",
            shown(&root, &lib),
        );
    }

    // One route, not two: a second `post::arrived` call site would be a second
    // way for a source to arrive, and the two would drift the way the two
    // delivery paths this file exists to collapse already did.
    assert_eq!(
        text.matches("post::arrived").count(),
        1,
        "{}: `post::arrived` is called more than once. The forwarded argv and the \n\
         cold start deliberately share one listener.",
        shown(&root, &lib),
    );

    // And the manifest that carries the reasoning is the one the reader is sent
    // to from three other places.
    let manifest = shell_manifest(&root);
    let raw = std::fs::read_to_string(&manifest).expect("the shell manifest is readable");
    assert!(
        raw.contains("cold") && raw.contains("endpoint file"),
        "{}: the note explaining why single-instance is here is gone. It is a \n\
         platform workaround with no visible symptom on the machine of whoever \n\
         next decides it looks unused.",
        shown(&root, &manifest),
    );
}

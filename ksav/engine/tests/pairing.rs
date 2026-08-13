//! The desk, and the moment it is let go of.
//!
//! # The finding
//!
//! `app/src-tauri/src/lib.rs` held the loopback desk like this:
//!
//! ```text
//! // Kept for the life of the process: dropping it is what
//! // withdraws the endpoint file, which is how Girsa stops
//! // offering to send the moment this window closes.
//! std::mem::forget(desk);
//! ```
//!
//! The comment describes a mechanism. `mem::forget` is the guarantee that the
//! mechanism will never run, on the line below the sentence describing it.
//!
//! Measured on a debug build before it changed: open Ksav, close the window the
//! ordinary way, and `ksav-endpoint.json` is still on disk naming a dead pid.
//! Girsa reads that file to find us, so every ordinary close looked from the
//! other side like a crash — its presence chip reading *"registered but not
//! answering, it may have closed badly"*. `Presence::Stale` exists for the crash
//! case and had become Ksav's permanent state.
//!
//! There was a reason it was written that way, and it was not carelessness:
//! `Builder::run(context)` takes no callback and on Windows never returns, so
//! there was no moment at which anything could be dropped. `mem::forget` was the
//! way to keep the desk alive given that. The fix is to make the moment exist —
//! `build()` then `run(callback)` — not to hold the desk differently.
//!
//! # What is asserted here
//!
//! Two different kinds of claim, because the bug needed both to be false:
//!
//! 1. **The mechanism works.** Dropping a desk really does withdraw the endpoint
//!    file. Nothing in this repository had ever checked that, which is how a
//!    comment could describe it for months while the code below prevented it.
//! 2. **The mechanism is reachable.** The shell keeps a moment to stop in, and
//!    nothing in it is deliberately leaked. Written against the shape that
//!    caused this — `run(context)` — rather than against the symptom, because
//!    any future return to that form brings the whole finding back with it.

mod common;

use common::repo::{root, shown};
use std::path::{Path, PathBuf};

/// Where the shell lives.
fn shell(root: &Path) -> PathBuf {
    root.join("ksav")
        .join("app")
        .join("src-tauri")
        .join("src")
        .join("lib.rs")
}

/// Anything in a directory whose name mentions the endpoint.
fn endpoints(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.contains("endpoint"))
        .collect()
}

#[test]
fn closing_the_desk_withdraws_the_endpoint() {
    // A pairing directory of this test's own. `GIRSA_POST_HOME` is the variable
    // `girsa-post` reads first, and it is the only reason this can run at all
    // without disturbing a Ksav the person running the tests has open.
    //
    // This is the one test in this binary that touches the environment, and it
    // is in a file by itself for that reason: Rust runs a binary's tests on
    // threads of one process, and a second test setting the same variable would
    // make both of them lie.
    let dir = std::env::temp_dir().join(format!("ksav-pairing-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("a directory to pair in");
    std::env::set_var("GIRSA_POST_HOME", &dir);

    assert!(
        endpoints(&dir).is_empty(),
        "the pairing directory starts empty, or the measurement below means nothing",
    );

    let desk = ksav_engine::post::open_desk("0.0.0-test").expect("a desk opens on loopback");
    let published = endpoints(&dir);
    assert_eq!(
        published.len(),
        1,
        "opening a desk publishes exactly one endpoint file; found {published:?}",
    );

    drop(desk);

    let after = endpoints(&dir);
    assert!(
        after.is_empty(),
        "dropping the desk left {after:?} behind. Girsa reads that file to find \n\
         Ksav, so a file that outlives the process is Girsa offering to send a \n\
         source to something that is not there — reported to the reader as a \n\
         crash, because a stale endpoint is what a crash leaves.",
    );

    std::env::remove_var("GIRSA_POST_HOME");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn the_shell_keeps_a_moment_to_stop_in() {
    let root = root();
    let path = shell(&root);
    let text = std::fs::read_to_string(&path).expect("the shell's lib.rs is readable");
    let name = shown(&root, &path);

    // The shape that caused this. `Builder::run(context)` has no callback, and
    // on Windows it never returns — the event loop calls `exit()` — so there is
    // no point at which managed state is dropped and no way to be told the
    // application is stopping. Anything that has to be let go of on the way out
    // cannot be, and the only way to keep it alive is to leak it.
    assert!(
        !text.contains(".run(tauri::generate_context!())"),
        "{name}: the shell is back on `Builder::run(context)`, which takes no \n\
         callback and on Windows never returns. Nothing managed is dropped, so \n\
         the desk cannot be withdrawn and `ksav-endpoint.json` outlives every \n\
         close — which Girsa reports to the reader as a crash. Use \n\
         `.build(context)` and `run(|handle, event| …)`.",
    );
    assert!(
        text.contains(".build(tauri::generate_context!())"),
        "{name}: the shell no longer builds the application separately from \n\
         running it, so there is nowhere to put the exit below.",
    );
    assert!(
        text.contains("tauri::RunEvent::Exit"),
        "{name}: nothing listens for the exit. The moment exists and nothing \n\
         happens in it, which is the same endpoint file left behind.",
    );
}

#[test]
fn nothing_in_the_shell_is_deliberately_leaked() {
    let root = root();
    let path = shell(&root);
    let text = std::fs::read_to_string(&path).expect("the shell's lib.rs is readable");

    // The class, not the instance. `mem::forget` in a process that has no exit
    // hook is how a resource gets kept alive when there is nowhere to release
    // it, and every such resource is something that was supposed to be released
    // — a file, a port, a lock. There is one now; use it.
    //
    // Comment lines are skipped, and they have to be: the shell now explains at
    // length what it used to do, and naming `mem::forget` in that explanation
    // failed this assertion the first time it ran. A rule that cannot tell a
    // call from a sentence about a call would make the fix undocumentable.
    let leak = text
        .lines()
        .enumerate()
        .find(|(_, l)| !l.trim_start().starts_with("//") && l.contains("mem::forget("));
    assert!(
        leak.is_none(),
        "{}:{}: something in the shell is leaked with `mem::forget`:\n  {}\n\
         That was how the desk was held, under a comment describing the drop it \n\
         prevented. The application now has a `RunEvent::Exit` to let go of things \n\
         in — manage it and take it out there instead.",
        shown(&root, &path),
        leak.map_or(0, |(n, _)| n + 1),
        leak.map_or("", |(_, l)| l.trim()),
    );
}

//! The manifests, checked the way the code is.
//!
//! Two facts about this repository were true, load-bearing, and asserted by
//! nothing:
//!
//! 1. **A clone of it builds.** It did not. `girsa-source`, `girsa-ksav` and
//!    `girsa-post` were `path = "../../../sefer-crates/crates/…"` — resolved
//!    from `ksav/engine/`, that is a *sibling of the checkout root*. There is no
//!    submodule, no `[patch]`, no vendor directory and no `.cargo/config.toml`
//!    in the repository, so `git clone ksav && cargo build` failed inside
//!    `cargo metadata`, before a compiler ran, naming a directory the reader had
//!    never heard of. Both workflows carried an extra `actions/checkout` to fake
//!    the desk layout; `ci.yml`'s very first run is the record of what happens
//!    without it. Not one `.md` file in the repository contained the string
//!    "sefer-crates".
//!
//! 2. **One product compiles one sefer-crates.** With path dependencies that was
//!    free — one directory, one copy, nothing to keep in step. Pinning by commit
//!    buys the clone, and the bill is that the SHA is now written out in two
//!    manifests, `engine/Cargo.toml` and `app/src-tauri/Cargo.toml`. The desktop
//!    binary links both of them. Two revs would give it two `girsa-post`s — the
//!    engine's loopback desk and the shell's deep-link parser disagreeing about
//!    the wire between them, which is the exact failure the shared crate exists
//!    to prevent, arriving through the fix for something else.
//!
//! So: every `girsa-*` dependency anywhere in the tree is a git dependency on
//! sefer-crates, every one names the same commit, every lock file records that
//! commit, no path dependency escapes the repository, and the documentation says
//! so. A `path = "../../../…"` restored by a helpful hand, a bumped rev in one
//! manifest and not the other, or a stale lock file each turn this file red by
//! name.
//!
//! # What this reads and what it does not
//!
//! Line scanning with comments stripped, not a TOML parse — the engine has no
//! toml dependency and adding one to assert five lines would be a worse trade
//! than the parse is worth. The cost is that a dependency written as a
//! multi-line `[dependencies.girsa-post]` table would be invisible here. That is
//! why `every_girsa_dependency_is_accounted_for` counts them: four is the number
//! this repository has, and a fifth written in a shape this file cannot read
//! fails the count rather than passing silently.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// The repository root: this crate is `ksav/engine`, so two levels up.
fn root() -> PathBuf {
    normalise(&Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
}

/// Resolve `.` and `..` textually. Not `canonicalize`: a path dependency
/// pointing outside the repository may or may not exist on the machine running
/// the test, and "it does not exist here" is a different failure from "it points
/// outside", which is the one worth naming.
fn normalise(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Every `Cargo.toml` and `Cargo.lock` in the tree, minus build output and
/// dependencies of other ecosystems.
fn manifests(root: &Path, name: &str) -> Vec<PathBuf> {
    fn walk(dir: &Path, name: &str, out: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let base = entry.file_name();
            let base = base.to_string_lossy();
            if path.is_dir() {
                // `target` and `node_modules` hold thousands of manifests that
                // belong to other people; `.git` holds none.
                if base == "target" || base == "node_modules" || base == ".git" {
                    continue;
                }
                walk(&path, name, out);
            } else if base == name {
                out.push(path);
            }
        }
    }
    let mut out = Vec::new();
    walk(root, name, &mut out);
    out.sort();
    out
}

/// A manifest with `#` comments removed, so that prose *about* a path
/// dependency is not read as one. This file's own subject matter is discussed at
/// length in `engine/Cargo.toml`.
fn uncommented(path: &Path) -> String {
    fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("{} is readable: {e}", path.display()))
        .lines()
        .map(|line| match line.find('#') {
            // Inside a string a `#` is content, not a comment. No manifest here
            // has one, and the only way to be sure without a parser is to keep
            // the line whole when it might.
            Some(_) if line.matches('"').count() % 2 == 1 => line.to_string(),
            Some(i) => line[..i].to_string(),
            None => line.to_string(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// `girsa-source = { … }` — the dependency lines this file is about, as
/// (manifest, crate name, the rest of the line).
fn girsa_lines(root: &Path) -> Vec<(PathBuf, String, String)> {
    let mut out = Vec::new();
    for manifest in manifests(root, "Cargo.toml") {
        for line in uncommented(&manifest).lines() {
            let line = line.trim();
            let Some((name, rest)) = line.split_once('=') else {
                continue;
            };
            let name = name.trim();
            if name.starts_with("girsa-") {
                out.push((manifest.clone(), name.to_string(), rest.trim().to_string()));
            }
        }
    }
    out
}

/// The commit every shared crate is pinned to, read from `engine/Cargo.toml` —
/// the manifest that owns the decision.
fn pinned_rev(root: &Path) -> String {
    let engine = root.join("ksav").join("engine").join("Cargo.toml");
    let text = uncommented(&engine);
    let line = text
        .lines()
        .find(|l| l.trim_start().starts_with("girsa-source"))
        .expect("engine/Cargo.toml declares girsa-source");
    field(line, "rev").expect("girsa-source is pinned by rev")
}

/// The value of `key = "…"` on a dependency line.
fn field(line: &str, key: &str) -> Option<String> {
    let at = line.find(&format!("{key} = \""))?;
    let rest = &line[at + key.len() + 4..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

const SEFER_CRATES: &str = "https://github.com/SYKhayyat/sefer-crates";

#[test]
fn no_path_dependency_escapes_the_repository() {
    let root = root();
    for manifest in manifests(&root, "Cargo.toml") {
        let dir = manifest.parent().expect("a manifest has a directory");
        for line in uncommented(&manifest).lines() {
            let line = line.trim();
            // `path = "src/lib.rs"` under `[lib]`/`[[bin]]` is a target, not a
            // dependency. Dependency lines are inline tables.
            if !line.contains("path = \"") || !line.contains('{') {
                continue;
            }
            let value = field(line, "path").expect("the path field parses");
            let resolved = normalise(&dir.join(&value));
            assert!(
                resolved.starts_with(&root),
                "{}: `path = \"{value}\"` resolves to {}, outside the repository.\n\
                 A clone would fail in `cargo metadata`, before a compiler runs, naming a \n\
                 directory the reader has never heard of — which is exactly how this \n\
                 repository could not build itself. Depend on it by git and rev instead; \n\
                 see the note above the girsa dependencies in ksav/engine/Cargo.toml, and \n\
                 .cargo/config.toml.example for editing both halves at once.",
                manifest.strip_prefix(&root).unwrap_or(&manifest).display(),
                resolved.display(),
            );
        }
    }
}

#[test]
fn every_girsa_dependency_is_accounted_for() {
    let root = root();
    let found = girsa_lines(&root);
    let names: BTreeSet<_> = found.iter().map(|(_, n, _)| n.clone()).collect();

    // engine: source, ksav, post. src-tauri: post. Four lines, three crates.
    assert_eq!(
        found.len(),
        4,
        "expected four girsa dependency lines, found {}: {:?}.\n\
         If a shared crate was added, removed, or rewritten as a \n\
         `[dependencies.girsa-…]` table (which the scan in this file cannot see), \n\
         update this count deliberately — silence here is what let the last one \n\
         through.",
        found.len(),
        found
            .iter()
            .map(|(m, n, _)| format!("{}: {n}", m.strip_prefix(&root).unwrap_or(m).display()))
            .collect::<Vec<_>>(),
    );
    assert_eq!(
        names,
        ["girsa-ksav", "girsa-post", "girsa-source"]
            .iter()
            .map(|s| s.to_string())
            .collect::<BTreeSet<_>>(),
    );
}

#[test]
fn one_product_compiles_one_sefer_crates() {
    let root = root();
    let mut revs = BTreeSet::new();
    let mut versions = BTreeSet::new();

    for (manifest, name, rest) in girsa_lines(&root) {
        let shown = manifest.strip_prefix(&root).unwrap_or(&manifest).display();
        let git = field(&rest, "git").unwrap_or_else(|| {
            panic!(
                "{shown}: {name} is not a git dependency — see the note in ksav/engine/Cargo.toml"
            )
        });
        assert_eq!(
            git, SEFER_CRATES,
            "{shown}: {name} points at {git}, not the shared repository",
        );
        let rev = field(&rest, "rev")
            .unwrap_or_else(|| panic!("{shown}: {name} names no rev, so it is not pinned"));
        assert_eq!(
            rev.len(),
            40,
            "{shown}: {name} is pinned to `{rev}`, which is not a full commit SHA. \n\
             A branch or a short rev is not a pin.",
        );
        assert!(rev.chars().all(|c| c.is_ascii_hexdigit()));
        revs.insert(rev);

        // The exact-version requirement is kept beside the rev on purpose: a
        // commit whose manifests say a different version should be a resolution
        // error, not a surprise at the first behaviour difference.
        let version = field(&rest, "version")
            .unwrap_or_else(|| panic!("{shown}: {name} has no version requirement"));
        assert!(
            version.starts_with('='),
            "{shown}: {name} requires `{version}`, which is a range, not a pin",
        );
        versions.insert(version);
    }

    assert_eq!(
        revs.len(),
        1,
        "the shared crates are pinned to {} different commits: {revs:?}.\n\
         The desktop binary links the engine and the Tauri shell together, so two \n\
         revs put two girsa-posts in one process — the loopback desk and the \n\
         deep-link parser disagreeing about the wire between them, which is the \n\
         failure the shared crate exists to prevent.",
        revs.len(),
    );
    assert_eq!(versions.len(), 1, "one version, not {versions:?}");
}

#[test]
fn the_lock_files_record_the_pin() {
    let root = root();
    let rev = pinned_rev(&root);
    let locks = manifests(&root, "Cargo.lock");
    assert!(!locks.is_empty(), "the lock files are committed");

    let mut seen = 0;
    for lock in locks {
        let text = fs::read_to_string(&lock).expect("a lock file is readable");
        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("source = \"git+") || !line.contains("sefer-crates") {
                continue;
            }
            seen += 1;
            assert!(
                line.contains(&rev),
                "{}: a shared crate is locked to a commit the manifests do not name.\n\
                 Locked: {line}\n\
                 Pinned: {rev}\n\
                 Run `cargo update` in each Rust tree after bumping the rev.",
                lock.strip_prefix(&root).unwrap_or(&lock).display(),
            );
        }
    }
    // Cargo.lock is target-independent, so the wasm tree records the shared
    // crates too even though `cfg(not(target_arch = "wasm32"))` keeps them out
    // of the build. Three trees, five crates each (the two transitive ones
    // included): a lock file that recorded none would mean a stale checkout.
    assert!(
        seen >= 5,
        "only {seen} locked shared-crate entries across the lock files — expected \n\
         every tree to record the pin",
    );
}

#[test]
fn the_dependency_is_documented() {
    let root = root();
    // The finding this file exists for was not that the layout was wrong. It was
    // that the layout was wrong *and nothing said so*: the Develop section handed
    // the reader `cargo run --manifest-path engine/Cargo.toml -- serve`, which
    // could not work, and no page anywhere named the reason.
    let readme = root.join("ksav").join("README.md");
    let text = fs::read_to_string(&readme).expect("ksav/README.md exists");
    let design_text =
        fs::read_to_string(root.join("ksav").join("DESIGN.md")).expect("ksav/DESIGN.md exists");

    // The README must say there is a second repository, and say where the rest of
    // the story is. The detail moved to `DESIGN.md` when the README was split
    // (903 lines, two to one against the reader who came to use the thing), and
    // this assertion followed it rather than being relaxed: the finding was never
    // "these four strings are in this file", it was that the build depends on a
    // second repository *and nothing said so*.
    //
    // `## The shared crates` and not the bare phrase: that also appears in
    // cross-references, so the loose form passed with the section renamed out
    // from under it — caught by mutation.
    for claim in ["## The shared crates", "sefer-crates", "DESIGN.md"] {
        assert!(
            text.contains(claim),
            "ksav/README.md no longer mentions `{claim}`. The build depends on a \n\
             second repository; a reader who does not know that finds out from a \n\
             cargo error message.",
        );
    }
    // And the page it sends them to carries what they have to do about it.
    for claim in [
        "## The shared crates",
        ".cargo/config.toml.example",
        "git = \"https://github.com/SYKhayyat/sefer-crates\"",
    ] {
        assert!(
            design_text.contains(claim),
            "ksav/DESIGN.md no longer mentions `{claim}`. The README sends the \n\
             reader here for exactly that.",
        );
    }

    let example = root.join(".cargo").join("config.toml.example");
    assert!(
        example.exists(),
        ".cargo/config.toml.example is what the README tells the reader to copy",
    );
    // And it must not have been committed as the live file, which would put the
    // fresh-clone build straight back where it started.
    assert!(
        !root.join(".cargo").join("config.toml").exists() || is_ignored(&root),
        ".cargo/config.toml exists and is not ignored — it names a directory layout \n\
         that exists on one machine",
    );
}

/// Whether git is ignoring the local override. If git is not available (a
/// tarball, a vendored build), the question cannot be answered and the check
/// above passes on the file's absence alone.
fn is_ignored(root: &Path) -> bool {
    std::process::Command::new("git")
        .args(["check-ignore", "-q", ".cargo/config.toml"])
        .current_dir(root)
        .status()
        .map(|s| s.success())
        .unwrap_or(true)
}

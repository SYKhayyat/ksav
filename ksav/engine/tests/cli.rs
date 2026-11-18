//! The command line, run as a process.
//!
//! This exists because of `lamdan/external-2026-08-18.md` §5.2: the PDF write was
//! checked and the page images' writes were `let _ = std::fs::write(…)` under a
//! `✓ compiled … (43 page(s))` and an exit code of 0. A full disk, a read-only
//! directory or a path too long produced the success line with no SVGs on disk
//! and nothing said.
//!
//! The fix is in `src/main.rs`, and the fence has to be a **process**, because the
//! thing being asserted is an exit code and a line on stderr — neither of which a
//! unit test of the writer can see. `env!("CARGO_BIN_EXE_ksav")` is the binary
//! this crate just built, so there is no path to guess and no second copy of the
//! command to keep in step.
//!
//! The failure is produced the way the class is described rather than by
//! permissions: the *page image's* path is a directory, so the write is refused
//! while the PDF beside it succeeds. That works on every platform — a read-only
//! directory does not refuse a write on Windows, which is how a permissions-based
//! test would have passed here while the bug lived.

use std::path::{Path, PathBuf};
use std::process::Command;

/// A scratch directory of this test's own, removed on drop.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Scratch {
        let dir = std::env::temp_dir().join(format!("ksav-cli-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("a scratch directory");
        Scratch(dir)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn ksav() -> Command {
    Command::new(env!("CARGO_BIN_EXE_ksav"))
}

#[test]
fn a_page_image_that_cannot_be_written_is_an_error_and_a_non_zero_exit() {
    let dir = Scratch::new("svg-write");
    let input = dir.path().join("sefer.ksav");
    std::fs::write(&input, "שלום עולם\n").expect("the input document");

    // The PDF's sibling page image, as a *directory*: the name is taken, and the
    // write is refused. `create_dir_all` makes it, and it is not removed until
    // the scratch directory goes.
    let blocked = dir.path().join("out").join("sefer.page-1.svg");
    std::fs::create_dir_all(&blocked).expect("the blocked page-image path");

    let out = ksav()
        .arg(&input)
        .arg(dir.path().join("out"))
        .output()
        .expect("the binary runs");

    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        !out.status.success(),
        "a page image could not be written and the command still exited 0 — \
         that is the lie this test exists for. stderr:\n{stderr}"
    );
    assert!(
        stderr.contains("cannot write") && stderr.contains("page image"),
        "the failure must name both what could not be written and that it was a \
         page image. stderr:\n{stderr}"
    );
    // The PDF is beside it and did get written, so this is not a test of a
    // directory that cannot be made at all.
    assert!(
        dir.path().join("out").join("sefer.pdf").exists(),
        "the PDF is written before the page images and must still be there"
    );
    // And the success line is not printed over a failure.
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(
        !stdout.contains("✓ compiled"),
        "the success line was printed for a compile whose page images are missing:\n{stdout}"
    );
}

#[test]
fn a_page_image_that_can_be_written_still_says_which_pages_were_produced() {
    // The other half, so the test above cannot be satisfied by refusing every
    // write: the same command with nothing in its way succeeds, writes both, and
    // says so. Without this, `eprintln!` + `ExitCode::from(1)` on every run would
    // pass the fence.
    let dir = Scratch::new("svg-ok");
    let input = dir.path().join("sefer.ksav");
    std::fs::write(&input, "שלום עולם\n").expect("the input document");

    let out = ksav()
        .arg(&input)
        .arg(dir.path().join("out"))
        .output()
        .expect("the binary runs");

    assert!(
        out.status.success(),
        "a document that compiles and writes should exit 0. stderr:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(dir.path().join("out").join("sefer.pdf").exists());
    assert!(
        dir.path().join("out").join("sefer.page-1.svg").exists(),
        "the page image is written when nothing is in its way"
    );
    assert!(String::from_utf8_lossy(&out.stdout).contains("✓ compiled"));
}

//! Who owns `ksav://`, and the rule that stops it changing hands by accident.
//!
//! # The finding
//!
//! Relayed from Girsa as G9 and G10, and they are one key seen from two ends.
//!
//! `app.deep_link().register_all()` ran in `setup`, unconditionally, on every
//! start. On Windows that writes `HKCU\Software\Classes\ksav\shell\open\command`
//! to `"<this exe>" "%1"`; on Linux it writes
//! `~/.local/share/applications/<bin>-handler.desktop` and points `xdg-mime` at
//! it. Both are last-writer-wins, so **whichever copy of Ksav ran most recently
//! owns the scheme** — and the copy that ran most recently, on the machine of
//! anybody working on this, is a `cargo run` build out of `target/debug`. A
//! source sent from Girsa then opens a development build, or a build that has
//! since been deleted, and the pairing looks broken in a way nothing reports.
//!
//! The plugin does not intend this. Its own documentation for `register_all` is
//! *"useful to ensure the schemes are registered even if the user did not
//! install the app properly (e.g. an AppImage that was not properly
//! registered)"*. It is a **repair**, and it was being used as the normal path.
//!
//! The other end is the same key: an uninstall removes what the *installer*
//! wrote and knows nothing about what the *application* wrote at runtime, so
//! `ksav://` stays registered to an executable that is gone. The next thing a
//! writer sends from Girsa opens nothing, with no error anywhere.
//!
//! # The rule
//!
//! Not "register every start", and not "never register" either — an AppImage
//! really does need the repair. What the decision needs is the one thing the
//! plugin cannot answer: `is_registered` tests whether the registered command is
//! *this exe*, so it says "am I the handler", never "is anybody". A build that
//! asks it and finds `false` cannot tell an unclaimed scheme from one another
//! Ksav is holding, and registering on `false` is the original bug with an extra
//! step.
//!
//! So Ksav writes down what it claimed. The marker is a single line — the path
//! it registered from — beside the application's own data, and it turns an
//! unanswerable question into an answerable one:
//!
//! | what we find | what we do |
//! |---|---|
//! | we are already the handler | nothing, and keep the marker current |
//! | nothing has ever claimed it | register: this is the AppImage repair the plugin means |
//! | another copy claimed it, and that file is still there | **leave it**, and say whose it is |
//! | another copy claimed it, and that file is gone | register: this is the uninstall leftover, repaired |
//!
//! The third row is G9 and the fourth is G10. Neither needs the registry to be
//! read back, which is what keeps this dependency-free and the same on both
//! platforms.
//!
//! # What is still the installer's job
//!
//! Removing the key on uninstall, which no running application can do for
//! itself. `installer/uninstall.nsh` deletes both the key and the marker; the
//! fourth row above is what covers a machine that was uninstalled by an older
//! build, or on Linux, where a package manager cannot reach a file in `$HOME`.

use std::path::{Path, PathBuf};

/// What the marker and the plugin together say about the scheme.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Claim {
    /// We are the registered handler. Nothing to do.
    Ours,
    /// Nobody has claimed it. Register — the case the plugin documents.
    Vacant,
    /// A copy that no longer exists claimed it. Register, repairing the leftover.
    Stale { was: PathBuf },
    /// Another live copy holds it. Leave it alone, and name it.
    Theirs { owner: PathBuf },
}

/// The rule, with the world passed in so it can be argued with in a test.
///
/// `handler` is the plugin's `is_registered`, which means *this executable is
/// the registered command* — not that the scheme is spoken for.
pub fn decide(
    handler: bool,
    claimed_by: Option<&Path>,
    me: &Path,
    exists: &dyn Fn(&Path) -> bool,
) -> Claim {
    if handler {
        return Claim::Ours;
    }
    match claimed_by {
        None => Claim::Vacant,
        // A marker naming us while the plugin says we are not the handler means
        // something outside took the scheme after we claimed it — another
        // application, or a user choosing a different default. That is theirs to
        // have: taking it back on the next start is exactly the behaviour this
        // module exists to stop, only aimed at a stranger instead of at another
        // Ksav.
        Some(was) if was == me => Claim::Theirs {
            owner: was.to_path_buf(),
        },
        Some(was) if exists(was) => Claim::Theirs {
            owner: was.to_path_buf(),
        },
        Some(was) => Claim::Stale {
            was: was.to_path_buf(),
        },
    }
}

/// Where the marker lives, given the application's data directory.
pub fn marker_path(data_dir: &Path) -> PathBuf {
    data_dir.join("scheme-owner.txt")
}

/// Read the recorded owner, if there is one.
///
/// An unreadable or empty marker is `None` — the same as never having claimed
/// it. The consequence of guessing wrong here is one unnecessary registration,
/// which is the cheap direction.
pub fn read_marker(path: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(path).ok()?;
    let line = text.lines().next()?.trim();
    if line.is_empty() {
        None
    } else {
        Some(PathBuf::from(line))
    }
}

/// Record that this executable is the handler.
pub fn write_marker(path: &Path, me: &Path) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, format!("{}\n", me.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    #[test]
    fn being_the_handler_is_the_end_of_it() {
        let never = |_: &Path| false;
        assert_eq!(decide(true, None, &p("/a/ksav"), &never), Claim::Ours);
        // Even with a marker naming somebody else: the plugin has just said the
        // registered command is us, and the plugin is looking at the real thing.
        assert_eq!(
            decide(true, Some(&p("/b/ksav")), &p("/a/ksav"), &never),
            Claim::Ours
        );
    }

    #[test]
    fn an_unclaimed_scheme_is_registered() {
        assert_eq!(
            decide(false, None, &p("/a/ksav"), &|_| false),
            Claim::Vacant
        );
    }

    /// G9. The development build must not take the scheme from the installed one.
    #[test]
    fn a_live_copy_keeps_what_it_claimed() {
        let installed = p("/opt/ksav/ksav");
        let dev = p("/home/me/target/debug/app");
        let alive = |q: &Path| q == installed;
        assert_eq!(
            decide(false, Some(&installed), &dev, &alive),
            Claim::Theirs { owner: installed }
        );
    }

    /// G10. An uninstall leaves the key behind; the next real start repairs it.
    #[test]
    fn a_copy_that_is_gone_does_not_keep_it() {
        let removed = p("/opt/ksav-0.1/ksav");
        let now = p("/opt/ksav/ksav");
        assert_eq!(
            decide(false, Some(&removed), &now, &|_| false),
            Claim::Stale { was: removed }
        );
    }

    /// Something outside Ksav took it. Also theirs, and for the same reason.
    #[test]
    fn a_stranger_that_took_it_keeps_it() {
        let me = p("/opt/ksav/ksav");
        assert_eq!(
            decide(false, Some(&me), &me, &|_| true),
            Claim::Theirs { owner: me }
        );
    }

    #[test]
    fn a_marker_round_trips() {
        let dir = std::env::temp_dir().join(format!("ksav-scheme-{}", std::process::id()));
        let path = marker_path(&dir);
        assert_eq!(read_marker(&path), None, "nothing written yet");
        write_marker(&path, &p("/opt/ksav/ksav")).unwrap();
        assert_eq!(read_marker(&path), Some(p("/opt/ksav/ksav")));
        // An empty marker is not a claim, which is what a half-written file on a
        // full disk looks like.
        std::fs::write(&path, "\n").unwrap();
        assert_eq!(read_marker(&path), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

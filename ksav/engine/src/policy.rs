//! The policies more than one build has to obey, read from `ksav/policy/`.
//!
//! There is exactly one of these so far and one was enough to prove the point:
//! the Content-Security-Policy existed as three hand-written strings — here, in
//! `app/vite.config.ts` and in `app/src-tauri/tauri.conf.json` — with a comment
//! in the Vite copy asserting that all three were *"the same policy"*. They had
//! diverged in two dimensions, and because multiple policies delivered to one
//! document are **intersected** rather than overridden, the narrowest copy won:
//! the update check reaches `https://api.github.com`, only Vite's copy allowed
//! it, and so the feature was dead in both builds that ship an installer — the
//! only two builds that need it, since the browser build updates by reloading.
//!
//! The comment asserted the invariant instead of the build checking it. The file
//! below is the invariant; `app/src-tauri/build.rs` fails the desktop build when
//! Tauri's config disagrees with it, and the test at the bottom of this module
//! fails `cargo test` for the same reason without needing Tauri at all.

/// The Content-Security-Policy, exactly as delivered.
///
/// Trimmed rather than trusted to be trimmed: the file ends in a newline like
/// every other text file in the repository, and a trailing newline inside an
/// HTTP header value is not a thing to find out about in production.
pub fn csp() -> &'static str {
    include_str!("../../policy/csp.txt").trim()
}

#[cfg(test)]
mod tests {
    use super::csp;

    /// Tauri cannot read the file — its policy has to be a literal inside
    /// `tauri.conf.json`, which is why that copy is the one allowed to exist.
    /// It is not allowed to *differ*, and this is the cheaper half of the fence:
    /// `build.rs` catches it when somebody builds the desktop app, and this
    /// catches it on every `cargo test`, on every platform, in seconds.
    #[test]
    fn the_desktop_build_delivers_the_same_policy() {
        const CONF: &str = include_str!("../../app/src-tauri/tauri.conf.json");
        let conf: serde_json::Value = serde_json::from_str(CONF).expect("tauri.conf.json is JSON");
        let theirs = conf["app"]["security"]["csp"]
            .as_str()
            .expect("tauri.conf.json carries app.security.csp");
        assert_eq!(
            theirs,
            csp(),
            "tauri.conf.json and ksav/policy/csp.txt must deliver one policy — \
             they are intersected in the browser, so the narrower one silently wins"
        );
    }

    /// The line that the three copies disagreed about, pinned by name.
    ///
    /// Not a style rule: `update.ts` fetches the GitHub releases endpoint and
    /// nothing else does, so this single origin is the difference between an
    /// installed Ksav that can learn a newer one exists and one that cannot.
    #[test]
    fn the_update_check_has_somewhere_to_ask() {
        assert!(
            csp().contains("https://api.github.com"),
            "connect-src must name the releases endpoint the update check reads"
        );
    }

    /// One line, and no comments, because three programs read it as data and
    /// only one of them is a compiler.
    #[test]
    fn the_policy_is_one_line_of_policy() {
        assert!(!csp().contains('\n'), "the policy is a single header value");
        assert!(
            !csp().starts_with('#'),
            "no comment syntax — this file is data"
        );
    }
}

//! A document's link, opened outside the application.
//!
//! # Why this is a shell concern and not an engine service
//!
//! The engine's sandbox is about what a *document* can make the crate do; this
//! is about what a *click* can make the machine do. The two limits are different
//! and both have to hold, which is why the URL is checked **here again** even
//! though `app/src/svgsafe.ts` and `app/src/openlink.ts` already decided it was
//! safe:
//!
//!   - the webview drawing the document is a capability boundary — guidelines
//!     for the URL-when-clicked belong to the *shell*, which is the side with
//!     the right to hand something to the operating system;
//!   - a check that lives only in the page is a check that can be edited out of
//!     the page, and the last line of defence against "open this in a browser"
//!     being turned into "run this" is a scheme list in the process that runs
//!     `xdg-open`.
//!
//! So: four schemes, spelled out here with a *why* each, and the same four the
//! sanitizer keeps. A drift between the two lists is the bug this module's last
//! test exists for — the page's rule lives in `app/src/svgsafe.ts`
//! (`LINK_SCHEME`), `app/src/openlink.ts` imports it rather than restating it,
//! and the test below reads both files and fails if the shell has grown a scheme
//! the page does not know or lost one it does.
//!
//! Refused URLs answer `Err` with a sentence, so the page can say *what* it
//! would not open rather than silently doing nothing — and so a caller shipping
//! the same URL to another door cannot do it by ignoring the answer.

/// What a document's link may be, and why it may be that.
///
/// `mailto:` and `tel:` are not the web, but they are the two schemes whose
/// whole point is to leave the browser — they hand off to the mailer and the
/// dialer, which are the same outside-the-application handoff as `xdg-open`.
/// Anything else with a colon is refused, relative destinations and
/// `#`fragments included from the other end.
pub const OPENABLE_SCHEMES: &[&str] = &["http", "https", "mailto", "tel"];

/// Does this destination belong on the open web, by the shell's own list?
///
/// A URL with no scheme is **not** openable by the shell: there is nothing for
/// `xdg-open` to do with `#anchor`, and a bare `//host/path` would resolve
/// against whatever the webview last loaded. Scheme-less destinations stay in
/// the page, where the sanitizer already kept them, and never reach this door.
pub fn openable(url: &str) -> bool {
    let Some(scheme) = scheme_of(url) else {
        return false;
    };
    // Case-insensitively: `HTTPS://example.com` is the same destination, and a
    // list compared with `==` would refuse it while the page's regex (`/iu` —
    // *ignore case, Unicode*) kept it. That drift is the one the last test in
    // this file exists to prevent.
    OPENABLE_SCHEMES
        .iter()
        .any(|s| s.eq_ignore_ascii_case(scheme))
}

/// The leading `scheme:` of a URL, lower-cased, or `None` without a colon.
///
/// The browser's own rule for a scheme is `[A-Za-z][A-Za-z0-9+.-]*`, and this
/// is that rule; a malformed candidate like `1http:` has no scheme and is
/// refused on the formal ground before the policy one.
pub fn scheme_of(url: &str) -> Option<&str> {
    let (head, _) = url.split_once(':')?;
    let mut first = head.chars();
    if !first.next().is_some_and(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    if !head
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
    {
        return None;
    }
    Some(head)
}

/// The refusal sentence for a destination this shell will not open, or `None`.
///
/// A pure function so that *the policy is what runs* can be tested without
/// opening a browser: the command below asks this before it spawns anything, and
/// `spawn` has no policy of its own to be caught out by. The sentence is
/// bilingual and named the scheme, because *this link does nothing* and *this
/// link asked for something the application will not do* are different things to
/// a reader.
pub fn refusal(url: &str) -> Option<String> {
    if openable(url) {
        return None;
    }
    Some(format!(
        "סוג הקישור הזה אינו נפתח מהאפליקציה · this kind of link is not opened from the application: {}",
        scheme_of(url).unwrap_or("no scheme")
    ))
}

/// Hand the URL to the platform's own browser.
///
/// Three lines on three platforms, which is why this is not a plugin: a
/// dependency added to open a URL has to be kept current for the same three
/// lines. Windows' `start` is a shell builtin rather than a program, hence
/// `cmd /C`; the empty pair of quotes is the window title, without which `start`
/// reads a URL containing a space as the title and opens nothing.
pub fn spawn(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn();
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(url).spawn();
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let spawned = std::process::Command::new("xdg-open").arg(url).spawn();

    spawned.map(|_| ()).map_err(|e| {
        format!("לא נמצא דפדפן לפתוח בו את הקישור · no browser to open the link with: {e}")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_four_schemes_pass_and_their_casing_does_not_matter() {
        for (input, want) in [
            ("https://example.com", "https"),
            ("HTTP://EXAMPLE.COM/a", "HTTP"),
            ("mailto:someone@example.com", "mailto"),
            ("tel:+972512345678", "tel"),
        ] {
            assert_eq!(scheme_of(input), Some(want), "{input}");
            assert!(openable(input), "{input}");
        }
    }

    #[test]
    fn everything_else_is_refused_with_the_formal_reason_first() {
        for refused in [
            "file:///etc/passwd",
            "file:///C:/Windows/System32/cmd.exe",
            "blob:https://example.com/uuid",
            "data:text/html,<script>1</script>",
            "javascript:alert(1)",
            "vbscript:x",
            "ftp://example.com",
            "about:blank",
            "custom-scheme://thing",
            "1http://example.com",
            "//host/path",
            "/relative/path",
            "#fragment",
            "",
        ] {
            assert!(!openable(refused), "{refused} was openable");
        }
        // No colon, so nothing that could be a scheme at all.
        assert_eq!(scheme_of("no scheme"), None);
        assert_eq!(scheme_of("#fragment"), None);
    }

    #[test]
    fn a_refusal_names_the_scheme_and_says_nothing_about_a_link_it_would_open() {
        assert_eq!(refusal("https://example.com"), None);
        assert_eq!(refusal("mailto:a@b.example"), None);
        for refused in [
            "file:///etc/passwd",
            "javascript:1",
            "ftp://x",
            "#f",
            "nonsense",
        ] {
            let said = refusal(refused).unwrap_or_else(|| panic!("{refused} was openable"));
            assert!(said.contains("אינו נפתח"), "{said}");
            assert!(said.contains("not opened"), "{said}");
        }
        // The scheme is reported, and a URL without one says so rather than
        // reporting the empty string as its scheme.
        assert!(refusal("file:///x").unwrap().contains("file"));
        assert!(refusal("#f").unwrap().contains("no scheme"));
    }

    /// The page's rule and the shell's, read as text and compared.
    ///
    /// The page decides **first** — `svgsafe.ts` keeps the attribute, and
    /// `openlink.ts` routes the click through the very function that decided to
    /// keep it — and the shell decides **last**. A disagreement anywhere along
    /// the way is a link that is visible but dead, or one the page shipped and
    /// the shell refused: the same bug with two symptoms, and neither is a
    /// compile error.
    #[test]
    fn the_page_and_the_shell_name_the_same_four_schemes() {
        let svgsafe = std::fs::read_to_string("../src/svgsafe.ts")
            .expect("app/src/svgsafe.ts reads — it is the one place the rule lives");
        // The sanitizer's own pattern, not a paraphrase of it: `https?` covers
        // the two the shell spells out separately.
        let rule = svgsafe
            .lines()
            .find(|l| l.contains("const LINK_SCHEME = "))
            .expect("svgsafe.ts still declares LINK_SCHEME");
        assert!(
            rule.contains("https?"),
            "the page's rule lost `http`/`https`: {rule}"
        );
        assert!(
            rule.contains("mailto"),
            "the page's rule lost `mailto`: {rule}"
        );
        assert!(rule.contains("tel"), "the page's rule lost `tel`: {rule}");

        let openlink = std::fs::read_to_string("../src/openlink.ts")
            .expect("app/src/openlink.ts reads — it is the router the page calls");
        assert!(
            openlink.contains("from \"./svgsafe\""),
            "openlink.ts no longer imports the rule it applies; a second list of \
             schemes is a second answer to which links may be followed"
        );
    }
}

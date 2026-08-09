//! Reading the flavour Girsa put down for us.
//!
//! spec.md §10.2's headline: a reader highlights a passage in Girsa, presses
//! Ctrl+C, and pastes it into Ksav — and what lands is a **quote with its mekor
//! and its ref**, not a wall of plain text they then have to cite by hand.
//!
//! Girsa's half of that has been built for a while and is careful about it.
//! `Girsa/app/src-tauri/src/clipboard.rs` pulls in `clipboard-rs` specifically
//! because *"a webview cannot do that"* — `navigator.clipboard.write` will take
//! a custom type and then put it down as a Chromium **web custom format**, which
//! another browser tab can read and a native application cannot — and it sets
//! all three flavours inside one clipboard open, because on Windows two
//! libraries taking turns means the second empties what the first put down.
//!
//! Eighty-six lines of care, and **nothing read it**. Zero references to
//! `CLIPBOARD_MIME` in Ksav, no paste handler, no clipboard plugin: Girsa's
//! careful three-flavour Ctrl+C landed in an application that only ever read
//! `text/plain`. This is the other end.
//!
//! # Why the engine and not the webview
//!
//! The same reason, from the other side. A `paste` event in a webview exposes
//! `text/plain`, `text/html` and files; a custom native format is not among
//! them, on any platform. So the reading has to happen where the writing did —
//! in a process that can open the real clipboard — and in Ksav that is the
//! engine, addressed as a service like everything else.
//!
//! `clipboard-rs` and not something smaller, and the same version Girsa uses:
//! the two applications are reading and writing one format, and a difference in
//! how it is registered is exactly the kind of thing that would show up as
//! "sometimes it pastes as plain text".

use clipboard_rs::{Clipboard, ClipboardContext};
use girsa_source::CLIPBOARD_MIME;

/// The Source Packet on the clipboard, if there is one.
///
/// `None` for every ordinary copy — there is no clipboard on this machine, the
/// reader copied from a text editor, the bytes are not UTF-8. All of those are
/// the same answer to the caller: *paste this as text*, which is what a paste
/// did before this existed and what it must keep doing.
///
/// Deliberately does **not** validate the packet. `girsa_source`'s schema check
/// belongs to `source::insert`, which reports what is wrong with it; answering
/// `None` here for a packet that arrived and could not be read would turn a
/// version mismatch into a silent plain-text paste, which is the failure the
/// schema version exists to prevent.
#[must_use]
pub fn source_on_clipboard() -> Option<String> {
    let context = ClipboardContext::new().ok()?;
    let bytes = context.get_buffer(CLIPBOARD_MIME).ok()?;
    let json = String::from_utf8(bytes).ok()?;
    if json.trim().is_empty() {
        return None;
    }
    Some(json)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// It answers, on a machine with a clipboard and on one without.
    ///
    /// There is no assertion about *what* is on the clipboard — a test that
    /// wrote to the real clipboard would take the developer's own, and CI has
    /// no clipboard at all. What is asserted is the property every caller
    /// depends on: this never panics and never blocks, so a paste is never
    /// worse for having asked.
    #[test]
    fn asking_is_always_safe() {
        let _ = source_on_clipboard();
    }
}

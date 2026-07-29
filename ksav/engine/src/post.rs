//! The pen's side of the loopback: sources arriving from the library.
//!
//! spec.md §10.6 (in Girsa's spec, which is the shared one). Girsa is the
//! library and Ksav is the pen; when both are running, a source can go straight
//! into the open document without a clipboard, a file, or an export dialog.
//!
//! ```text
//! Girsa ──POST /insert──▶ here     a Source Packet
//!                          │
//!                          ▼
//!                       the inbox
//!                          │
//!            GET /inbox ◀──┘  the editor, which is where a cursor is
//! ```
//!
//! # Why an inbox and not a direct insertion
//!
//! The desk is a listener on a thread; the cursor is in a text editor in a
//! webview. Nothing on this side of the process knows where the reader is
//! typing, and a "helpful" insertion at the end of the document would be a
//! source landing somewhere nobody asked for. So an arrival waits in the inbox
//! until the editor comes and takes it, which is also what makes the same code
//! serve both builds — `ksav serve` in a browser and the desktop shell — with
//! one poll and no second transport.
//!
//! # What arrives is markup, not a packet
//!
//! The packet is turned into real Ksav commands **here**, by [`crate::source`],
//! the moment it arrives. spec.md §10.3: *lightweight means the UI, not the
//! format*. If the editor were handed a packet and left to render it, there
//! would be a second renderer in TypeScript and the two would drift.

use std::sync::Mutex;

use girsa_post::desk::{Desk, Reply};
use girsa_post::App;
use girsa_source::SourcePacket;
use serde::Serialize;

use crate::source::{to_ksav, CitationPlacement};

/// A source that has arrived and is waiting for the cursor.
#[derive(Debug, Clone, Serialize)]
pub struct Arrival {
    /// Real Ksav markup, ready to be inserted as it stands.
    pub markup: String,
    /// How the citation prints, for the line the editor shows afterwards.
    pub display: String,
    /// The ref the document will keep. Carried so the editor can say what it
    /// took, and so nothing has to parse it back out of the markup.
    pub reference: String,
    /// Whether this is a **whole document** rather than a quote to drop in at
    /// the caret — Girsa's buffer, handed over (spec.md §10.3).
    ///
    /// The editor asks before replacing what is open. A hand-over that
    /// silently overwrote the paragraph somebody was in the middle of would be
    /// the single worst thing this pairing could do.
    pub whole: bool,
}

/// Sources waiting to be inserted.
///
/// A `Vec` and not a channel: the editor polls, and a channel that nothing is
/// reading from while the window is closed is a channel that either blocks the
/// sender or throws the source away.
static INBOX: Mutex<Vec<Arrival>> = Mutex::new(Vec::new());

/// Open the desk and start taking sources.
///
/// # Errors
///
/// If loopback cannot be bound or the endpoint file cannot be written. Not a
/// reason to refuse to start: Ksav is a writing application first, and without
/// the desk it simply cannot be handed anything.
pub fn open_desk(version: &str) -> Result<Desk, std::io::Error> {
    let desk = Desk::open(App::Ksav, version)?;
    desk.serve(|path, body| match path {
        "/insert" => take(body),
        "/document" => take_document(body),
        other => Reply::refused(404, format!("no such errand: {other}")),
    });
    Ok(desk)
}

/// A packet arriving from Girsa.
fn take(body: &str) -> Reply {
    let packet = match SourcePacket::from_json(body) {
        Ok(packet) => packet,
        // The schema check is inside `from_json`, and this is where it earns
        // its keep: a packet from a newer Girsa is refused **with both version
        // numbers in the message**, rather than rendering into something that
        // looks reasonable and is slightly wrong in a printed sefer.
        Err(e) => return Reply::refused(400, e.to_string()),
    };
    let arrival = Arrival {
        markup: to_ksav(&packet, CitationPlacement::Mekor),
        display: packet.display.clone(),
        reference: packet.reference.clone(),
        whole: false,
    };
    match INBOX.lock() {
        Ok(mut inbox) => {
            inbox.push(arrival);
            Reply::ok(r#"{"taken":true}"#)
        }
        Err(_) => Reply::refused(500, "the inbox is wedged"),
    }
}

/// A whole buffer, handed over from Girsa's own Ksav buffer.
///
/// It arrives as text and goes in as text: the buffer wrote real Ksav markup
/// from the first keystroke (spec.md §10.3), so **there is nothing to
/// convert** — which is exactly the claim this errand exists to keep true.
fn take_document(body: &str) -> Reply {
    #[derive(serde::Deserialize)]
    struct Handed {
        #[serde(default)]
        name: String,
        text: String,
    }
    let handed: Handed = match serde_json::from_str(body) {
        Ok(handed) => handed,
        Err(e) => return Reply::refused(400, format!("that is not a document: {e}")),
    };
    let arrival = Arrival {
        markup: handed.text,
        display: handed.name,
        reference: String::new(),
        whole: true,
    };
    match INBOX.lock() {
        Ok(mut inbox) => {
            inbox.push(arrival);
            Reply::ok(r#"{"taken":true}"#)
        }
        Err(_) => Reply::refused(500, "the inbox is wedged"),
    }
}

/// Everything waiting, taken off the list.
///
/// Draining rather than reading: two windows asking would otherwise each
/// insert the same source, and a quote in a document twice is worse than one
/// the reader has to ask for again.
#[must_use]
pub fn drain() -> Vec<Arrival> {
    INBOX
        .lock()
        .map(|mut inbox| std::mem::take(&mut *inbox))
        .unwrap_or_default()
}

/// The same, as JSON, for the editor's poll.
#[must_use]
pub fn drain_json() -> String {
    serde_json::to_string(&drain()).unwrap_or_else(|_| "[]".to_string())
}

/// Ask the library where a phrase is from (spec.md §10.4, W18).
///
/// Cite-on-selection: the writer highlights a phrase and asks. **Girsa
/// answers**, because the question is about the corpus — which segments carry
/// these words, how many places they turn up in, and how each of them is
/// cited. Nothing here keeps a copy of any of that.
///
/// What comes back is Girsa's own JSON, handed to the editor unchanged: a
/// shape re-described on the way through is a shape that drifts.
///
/// # Errors
///
/// If Girsa is not running, or refuses — both with the reason, because *no
/// library* and *no such phrase* are entirely different things to a writer.
pub fn where_from(phrase: &str, except: Option<&str>) -> Result<String, String> {
    let errand = serde_json::json!({ "phrase": phrase, "except": except }).to_string();
    girsa_post::send(App::Girsa, "/where-from", Some(&errand)).map_err(|e| e.to_string())
}

/// Nothing fitted: put the phrase in Girsa's search and bring it up.
///
/// The honest end of the road (spec.md §10.4). A citation nobody could settle
/// is not a citation to guess at — it is a search to run.
///
/// # Errors
///
/// If Girsa is not running or refuses.
pub fn search_in_girsa(phrase: &str) -> Result<(), String> {
    let errand = serde_json::json!({ "phrase": phrase }).to_string();
    girsa_post::send(App::Girsa, "/search", Some(&errand))
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Turn the citations in a piece of prose into live refs (spec.md §10.5).
///
/// Girsa finds them — it has the lexicon — and the rewriting happens **here**,
/// in Rust, through `girsa-ksav`: the same writer both applications use, so a
/// linkified citation and one Girsa inserted are the same markup.
///
/// Only what is certain is touched. Everything else comes back exactly as it
/// was written, because a wrong link in a printed sefer cannot be seen.
///
/// # Errors
///
/// If Girsa is not running, or refuses, or answers something unreadable.
pub fn linkify(prose: &str) -> Result<String, String> {
    #[derive(serde::Deserialize)]
    struct Found {
        found: Vec<Linked>,
    }
    #[derive(serde::Deserialize)]
    struct Linked {
        from: usize,
        to: usize,
        text: String,
        reference: String,
    }

    let errand = serde_json::json!({ "text": prose }).to_string();
    let answer = girsa_post::send(App::Girsa, "/linkify", Some(&errand)).map_err(|e| e.to_string())?;
    let found: Found = serde_json::from_str(&answer).map_err(|e| e.to_string())?;

    // Back to front, so an earlier replacement cannot move a later one's
    // offsets. The offsets are in characters, which is what they were counted
    // in — Hebrew is two bytes a letter and a byte offset lands mid-character
    // about half the time.
    let mut chars: Vec<char> = prose.chars().collect();
    for link in found.found.iter().rev() {
        if link.to > chars.len() || link.from >= link.to {
            continue;
        }
        let markup: Vec<char> = girsa_ksav::live_citation(&link.text, &link.reference)
            .chars()
            .collect();
        chars.splice(link.from..link.to, markup);
    }
    Ok(chars.into_iter().collect())
}

/// Whether the library is there, for an affordance that would otherwise fail.
#[must_use]
pub fn girsa() -> girsa_post::Presence {
    girsa_post::presence(App::Girsa)
}

/// Put a source in the inbox directly — the `ksav://insert?packet=…` path,
/// where the operating system hands us a URL rather than a request.
///
/// # Errors
///
/// If the packet does not read, with the reason to show the writer.
pub fn arrived(packet_json: &str) -> Result<(), String> {
    let reply = take(packet_json);
    if reply.status == 200 {
        Ok(())
    } else {
        Err(reply.body)
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]
    use super::*;

    const PACKET: &str = include_str!("../tests/fixtures/girsa-packet.json");

    /// There is one inbox per process — which is right, since there is one
    /// editor — so the tests that use it take turns rather than each seeing
    /// the other's arrivals.
    static ALONE: Mutex<()> = Mutex::new(());

    fn alone() -> std::sync::MutexGuard<'static, ()> {
        let guard = ALONE
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let _ = drain();
        guard
    }

    #[test]
    fn a_packet_from_girsa_waits_in_the_inbox_as_markup() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        let waiting = drain();
        assert_eq!(waiting.len(), 1);
        assert!(waiting[0].markup.contains("#ציטוט["));
        assert!(waiting[0].markup.contains("ראוי לכל ירא שמים"));
        assert_eq!(waiting[0].reference, "girsa:shulchan-arukh/orach-chayim/1:3");
    }

    #[test]
    fn the_inbox_is_drained_and_not_read() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        assert_eq!(drain().len(), 1);
        // Two windows asking would otherwise each insert the same source.
        assert!(drain().is_empty());
    }

    #[test]
    fn a_buffer_handed_over_arrives_whole_and_says_so() {
        let _alone = alone();
        let handed = serde_json::json!({ "name": "חבורה", "text": "#כותרת1[סוגיא]
" });
        let reply = take_document(&handed.to_string());
        assert_eq!(reply.status, 200);
        let waiting = drain();
        assert_eq!(waiting.len(), 1);
        assert!(waiting[0].whole, "a document has to say it is one");
        assert_eq!(waiting[0].markup, "#כותרת1[סוגיא]
");
        assert_eq!(waiting[0].display, "חבורה");
    }

    #[test]
    fn a_packet_from_a_newer_girsa_is_refused_with_both_versions_named() {
        let _alone = alone();
        let why = arrived(r#"{"schema":99,"ref":"girsa:x/1:1","display":"d","text":"t"}"#)
            .expect_err("must refuse");
        assert!(why.contains("99"), "{why}");
    }
}

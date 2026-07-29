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
    fn a_packet_from_a_newer_girsa_is_refused_with_both_versions_named() {
        let _alone = alone();
        let why = arrived(r#"{"schema":99,"ref":"girsa:x/1:1","display":"d","text":"t"}"#)
            .expect_err("must refuse");
        assert!(why.contains("99"), "{why}");
    }
}

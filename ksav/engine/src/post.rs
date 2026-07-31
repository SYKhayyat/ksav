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

use std::path::PathBuf;
use std::sync::Mutex;

use girsa_post::desk::{Desk, Reply};
use girsa_post::{App, Endpoint};
use girsa_source::SourcePacket;
use serde::{Deserialize, Serialize};

use crate::source::{to_ksav, CitationPlacement};

/// A source that has arrived and is waiting for the cursor.
///
/// `Deserialize` as well as `Serialize` because the inbox is written down —
/// see [`remember`].
#[derive(Debug, Clone, Serialize, Deserialize)]
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
///
/// The `Vec` threw the source away too — just at process exit rather than
/// immediately. See [`remember`]; this is now a cache of a file.
static INBOX: Mutex<Vec<Arrival>> = Mutex::new(Vec::new());

/// How many sources may wait at once.
///
/// The inbox was unbounded, so a Ksav whose editor nobody had opened would
/// accept sources for as long as Girsa cared to send them and hold every one.
/// Sixty-four is far more than a writer queues by hand between two glances at
/// the window, which makes the sixty-fifth evidence that the editor is not
/// running — and it is told so, rather than joining a queue nothing drains.
const WAITING_ROOM: usize = 64;

/// Where sources wait between runs.
///
/// Beside the endpoint file, and *derived* from it rather than recomputed:
/// `girsa-post` is what decides where this user's pairing state lives, and
/// what `GIRSA_POST_HOME` does to that. Asking it is what stops this drifting
/// away from it.
fn inbox_path() -> Option<PathBuf> {
    Endpoint::path(App::Ksav)
        .parent()
        .map(|dir| dir.join("ksav-inbox.jsonl"))
}

/// Write down what is waiting.
///
/// `{"taken":true}` is a promise, and until this existed Ksav could not keep
/// it. The inbox was memory only and drained only when the editor polled, so
/// closing the window between the send and the poll destroyed the source —
/// with Girsa already told it had arrived, and no way to learn otherwise.
/// spec.md §10's stated target is AirDrop, and AirDrop does not lose the file
/// when you close the window.
///
/// The whole list is rewritten rather than appended to. An importer in this
/// project once opened its shards in append mode and doubled a graph on the
/// second run; the same mistake here would put a quote in a document twice.
fn remember(waiting: &[Arrival]) {
    let Some(path) = inbox_path() else { return };
    let mut body = String::new();
    for arrival in waiting {
        if let Ok(line) = serde_json::to_string(arrival) {
            body.push_str(&line);
            body.push('\n');
        }
    }
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(&path, body);
}

/// Take back what was still waiting when this process last stopped.
///
/// In front of anything this run has already been handed: those sources were
/// sent first, and the order a writer sent things in is the order they should
/// arrive in.
fn recover() {
    let Some(path) = inbox_path() else { return };
    let Ok(body) = std::fs::read_to_string(&path) else {
        return;
    };
    let mut recovered = Vec::new();
    for (n, line) in body.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<Arrival>(line) {
            Ok(arrival) => recovered.push(arrival),
            // One unreadable line is one source. Said out loud, and the rest
            // still arrive — the same rule the library's loaders keep.
            Err(e) => eprintln!(
                "a source that was waiting will not read ({}: line {}): {e}",
                path.display(),
                n + 1
            ),
        }
    }
    if recovered.is_empty() {
        return;
    }
    if let Ok(mut inbox) = INBOX.lock() {
        recovered.extend(inbox.drain(..));
        *inbox = recovered;
    }
}

/// Put one arrival in the inbox, or say why not.
///
/// One place, so the two errands that take sources cannot disagree about the
/// cap or about being written down.
fn wait(arrival: Arrival) -> Reply {
    match INBOX.lock() {
        Ok(mut inbox) => {
            if inbox.len() >= WAITING_ROOM {
                // Refused, not silently dropped and not queued forever. Girsa
                // shows this sentence, so the writer learns the editor is shut
                // instead of wondering where the quote went.
                return Reply::refused(
                    503,
                    format!(
                        "{WAITING_ROOM} sources are already waiting and nothing has taken \
                         them — open the Ksav editor and they will all go in"
                    ),
                );
            }
            inbox.push(arrival);
            remember(&inbox);
            Reply::ok(r#"{"taken":true}"#)
        }
        Err(_) => Reply::refused(500, "the inbox is wedged"),
    }
}

/// Open the desk and start taking sources.
///
/// # Errors
///
/// If loopback cannot be bound or the endpoint file cannot be written. Not a
/// reason to refuse to start: Ksav is a writing application first, and without
/// the desk it simply cannot be handed anything.
pub fn open_desk(version: &str) -> Result<Desk, std::io::Error> {
    // `mut`, because the desk keeps its serving thread's handle now: dropping it
    // has to close the listener and not merely withdraw the endpoint file
    // (sefer-crates 0.5.0).
    let mut desk = Desk::open(App::Ksav, version)?;
    // Anything a previous run was told it had taken, and had not yet handed to
    // the editor, is still owed to the writer.
    recover();
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
    wait(arrival)
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
    wait(arrival)
}

/// Everything waiting, taken off the list.
///
/// Draining rather than reading: two windows asking would otherwise each
/// insert the same source, and a quote in a document twice is worse than one
/// the reader has to ask for again.
#[must_use]
pub fn drain() -> Vec<Arrival> {
    let taken = INBOX
        .lock()
        .map(|mut inbox| std::mem::take(&mut *inbox))
        .unwrap_or_default();
    if !taken.is_empty() {
        // They are in the editor now, so they are not waiting any more. If
        // this did not happen, the next start would insert them a second time.
        remember(&[]);
    }
    taken
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
    let answer =
        girsa_post::send(App::Girsa, "/linkify", Some(&errand)).map_err(|e| e.to_string())?;
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
        // The inbox is written down now, so without this the suite would be
        // reading and truncating the file belonging to a Ksav somebody is
        // actually running.
        static SCRATCH: std::sync::Once = std::sync::Once::new();
        SCRATCH.call_once(|| {
            let dir = std::env::temp_dir().join("ksav-post-tests");
            let _ = std::fs::remove_dir_all(&dir);
            let _ = std::fs::create_dir_all(&dir);
            std::env::set_var("GIRSA_POST_HOME", &dir);
        });
        let guard = ALONE
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let _ = drain();
        guard
    }

    /// Closing the window between the send and the poll must not lose it.
    ///
    /// A process cannot restart itself inside a test, so this does the one
    /// thing about process death that matters here: it drops the in-memory
    /// inbox without touching what was written down, then opens again.
    #[test]
    fn a_source_taken_before_the_window_closed_is_there_when_it_opens() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");

        // The window closes. Whether `Desk::drop` ran or the process was
        // killed, this `Vec` went with it.
        INBOX.lock().map(|mut inbox| inbox.clear()).unwrap();
        recover();

        let waiting = drain();
        assert_eq!(
            waiting.len(),
            1,
            "Girsa was told the source had arrived, and then it was thrown away"
        );
        assert_eq!(
            waiting[0].reference,
            "girsa:shulchan-arukh/orach-chayim/1:3"
        );
    }

    /// And one the editor already took does not come back on the next start.
    #[test]
    fn a_source_already_inserted_does_not_arrive_a_second_time() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        assert_eq!(drain().len(), 1);

        INBOX.lock().map(|mut inbox| inbox.clear()).unwrap();
        recover();
        assert!(
            drain().is_empty(),
            "a quote in a document twice is worse than one the reader asks for again"
        );
    }

    /// The waiting room has a wall, and it says so instead of growing.
    #[test]
    fn an_inbox_nothing_is_draining_refuses_rather_than_growing() {
        let _alone = alone();
        for _ in 0..WAITING_ROOM {
            arrived(PACKET).expect("a real packet");
        }
        let why = arrived(PACKET).expect_err("the waiting room is full");
        assert!(why.contains("open the Ksav editor"), "{why}");
        assert_eq!(
            drain().len(),
            WAITING_ROOM,
            "refusing the last one must not cost the ones already waiting"
        );
    }

    #[test]
    fn a_packet_from_girsa_waits_in_the_inbox_as_markup() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        let waiting = drain();
        assert_eq!(waiting.len(), 1);
        assert!(waiting[0].markup.contains("#ציטוט["));
        assert!(waiting[0].markup.contains("ראוי לכל ירא שמים"));
        assert_eq!(
            waiting[0].reference,
            "girsa:shulchan-arukh/orach-chayim/1:3"
        );
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
        assert_eq!(
            waiting[0].markup,
            "#כותרת1[סוגיא]
"
        );
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

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
use girsa_post::routes;
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
    /// What this arrival is called, for as long as it is in flight.
    ///
    /// The prerequisite for handing a source out without destroying it. `drain`
    /// used to empty the list **and truncate the file** before the answer had
    /// reached the client, and the client's `inbox()` swallows every failure by
    /// design — *"a build with no Girsa half, or a server that went away, is a
    /// thing to stop asking about quietly"*. So a response lost between the
    /// engine and the tab took the sources with it, from memory and from disk,
    /// with Girsa already told `{"taken":true}`. spec.md §10's stated target is
    /// AirDrop, and AirDrop does not lose the file when you close the window.
    ///
    /// An old inbox file has no `id`; `recover` mints one, because a source that
    /// survived a restart is exactly the one this must not drop.
    #[serde(default = "mint_id")]
    pub id: String,
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

/// Handed to a client, not yet acknowledged.
///
/// The second half of the two-phase handover. An arrival moves here when it is
/// answered to a poll and leaves only when the *next* poll names its id as
/// taken. A client that never comes back — a reload landing between the POST and
/// the parse, a wasm worker killed by the compile timeout mid-poll — leaves it
/// here and on disk, and the next poll is handed it again.
///
/// Re-delivery rather than loss is the right way round: a duplicate is a
/// paragraph the writer deletes, and the alternative is a source that Girsa was
/// told had arrived and that nothing on this machine still holds.
static HANDED: Mutex<Vec<Arrival>> = Mutex::new(Vec::new());

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
    // Unchanged is not written. Every poll used to land here through `persist`
    // and rewrite the file byte-for-byte — disk churn on a timer for an answer
    // that was already on it.
    if let Ok(existing) = std::fs::read_to_string(&path) {
        if existing == body {
            return;
        }
    }
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    // Beside and renamed over, which is the rule `ksav_dictionary_write` states
    // twenty lines of comment away in the Tauri shell: *"a machine that stops
    // mid-write must cost the last word added, not the zman's worth of them."*
    // This is the file that holds sources somebody has already been told
    // arrived, and it was the one place still calling `fs::write` on a path a
    // reader depends on.
    //
    // A rename that fails falls back to writing in place: a torn file is bad and
    // no file at all is worse, and on Windows a rename over an open handle can
    // genuinely fail.
    let temp = path.with_extension("jsonl.writing");
    if std::fs::write(&temp, &body).is_ok() && std::fs::rename(&temp, &path).is_ok() {
        return;
    }
    let _ = std::fs::remove_file(&temp);
    let _ = std::fs::write(&path, body);
}

/// A name for one arrival, unique for as long as it matters.
///
/// A counter and the process start, not a UUID: these live between one poll and
/// the next, the client compares them for equality and nothing else, and a
/// dependency for sixteen bytes of uniqueness is a dependency.
fn mint_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let n = N.fetch_add(1, Ordering::Relaxed);
    let since = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{since:x}-{n:x}")
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
            persist(&inbox);
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
        // `/take-document`, and the name it had while `/document` also meant
        // *a document is saved here* in the other direction — one string, two
        // unrelated errands. Accepting the old name is what lets the two
        // applications release on different days: see the note on [`document`],
        // and `girsa_post::routes` for the pair and the order they come out in.
        p if p == routes::ksav::TAKE_DOCUMENT || p == routes::ksav::LEGACY_DOCUMENT => {
            take_document(body)
        }
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
    // The schema check above cannot see this: double-encoded Hebrew is valid
    // UTF-8 and valid JSON, so it deserializes cleanly and only shows up as
    // garbage once it is in the document. Caught here for the same reason the
    // schema is — a quote that is quietly wrong is the worst thing to deliver.
    if crate::source::looks_double_encoded(&packet.text)
        || crate::source::looks_double_encoded(&packet.display)
    {
        return Reply::refused(422, crate::source::DOUBLE_ENCODED);
    }
    let arrival = Arrival {
        id: mint_id(),
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
    if crate::source::looks_double_encoded(&handed.text) {
        return Reply::refused(422, crate::source::DOUBLE_ENCODED);
    }
    let arrival = Arrival {
        id: mint_id(),
        markup: handed.text,
        display: handed.name,
        reference: String::new(),
        whole: true,
    };
    wait(arrival)
}

/// Write down everything this process is still responsible for.
///
/// Both lists, because an arrival that has been handed out and not acknowledged
/// is still this machine's to keep. Writing only `INBOX` here is the original
/// bug wearing a new name.
fn persist(waiting: &[Arrival]) {
    let handed = HANDED.lock().map(|h| h.clone()).unwrap_or_default();
    let mut all = handed;
    all.extend_from_slice(waiting);
    remember(&all);
}

/// Everything waiting, handed out — and kept until the client says it has it.
///
/// Draining rather than reading, still: two windows asking would each insert the
/// same source, and a quote in a document twice is worse than one the reader has
/// to ask for again. What changed is where the sources go. They move to
/// [`HANDED`] rather than out of existence, and `took` on the *next* poll is
/// what finally lets go of them.
///
/// The previous batch comes first, in front of anything new, for the reason
/// `recover` gives about a restart: the order a writer sent things in is the
/// order they should arrive in.
#[must_use]
pub fn drain(took: &[String]) -> Vec<Arrival> {
    let mut out = Vec::new();
    // **One critical section around the whole handover.** Three separate ones
    // let two concurrent polls each walk the same handed-out list — the same
    // source offered twice, and inserted twice by an idempotent-only-in-one-
    // direction client — and walked an acknowledged arrival through a moment
    // where it sat in neither list.
    match (HANDED.lock(), INBOX.lock()) {
        (Ok(mut handed), Ok(mut inbox)) => {
            // Acknowledged: gone, from memory and from the file below.
            handed.retain(|a| !took.contains(&a.id));
            // Not acknowledged: handed out again. The client is idempotent about
            // this in the only way that matters — it is the same source it did not
            // get.
            out.extend(handed.iter().cloned());
            let waiting = std::mem::take(&mut *inbox);
            handed.extend(waiting.iter().cloned());
            out.extend(waiting);
        }
        _ => return out,
    }
    // The file now says: nothing waiting, these still in flight.
    persist(&[]);
    out
}

/// The same, as JSON, for the editor's poll.
///
/// The request body carries `{"took": [id, …]}` — the ids the client inserted
/// since it last asked. An empty or absent list is a client that has taken
/// nothing, which is what the first poll of a session says and what a client
/// that is still catching up says, and both are answered the same way.
#[must_use]
pub fn drain_json(input_json: &str) -> String {
    let took: Vec<String> = serde_json::from_str::<serde_json::Value>(input_json)
        .ok()
        .and_then(|v| v.get("took").cloned())
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    serde_json::to_string(&drain(&took)).unwrap_or_else(|_| "[]".to_string())
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

/// The errand body for [`refresh`], on its own so it can be asserted on.
fn refresh_errand(markup: &str, style: Option<&str>, nikud: Option<bool>) -> String {
    let mut errand = serde_json::Map::new();
    errand.insert("markup".into(), markup.into());
    // Absent rather than null: Girsa reads absence as *the reader's own
    // setting*, and a document refreshed in the background should not quietly
    // re-point somebody else's library.
    if let Some(style) = style {
        errand.insert("style".into(), style.into());
    }
    if let Some(nikud) = nikud {
        errand.insert("nikud".into(), nikud.into());
    }
    serde_json::Value::Object(errand).to_string()
}

/// One citation in a document, as the corpus stands now.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Refreshed {
    /// The place.
    #[serde(rename = "ref")]
    pub reference: String,
    /// The citation as it prints today.
    pub display: String,
    /// The words today.
    pub text: String,
    /// Why this one could not be refreshed, if it could not.
    #[serde(default)]
    pub trouble: Option<String>,
}

/// Ask the library for every citation in this document again (spec.md §10.2).
///
/// *Regenerate every quote against a corrected edition* is a promise about a
/// **document**, and this is the errand that performs it: one call, one row per
/// citation, in the order they appear. A citation Girsa cannot look up comes
/// back with a reason in it rather than failing the other thirty-nine — that
/// decision is made once, in the library, and not forty times here.
///
/// # Why the rows come back instead of a rewritten document
///
/// Rewriting is not the hard part; **asking** is. A correction in somebody
/// else's library silently changing the words in a sefer somebody is writing is
/// exactly the surprise spec.md §7.1 exists to avoid — a correction is a claim
/// somebody made, not a fact about the sefer. So the writer sees what moved and
/// says yes, and the editor does the replacing, the same way [`where_from`]
/// hands over candidates rather than picking one.
///
/// The rows line up with `girsa_ksav::cited_in` on this buffer, position by
/// position: one scanner, compiled by both applications, so nothing here has to
/// match a ref by string.
///
/// # Errors
///
/// If Girsa is not running, or refuses, or answers something unreadable — all
/// with the reason, because *no library* and *no such sefer* are different
/// things to a writer.
pub fn refresh(
    markup: &str,
    style: Option<&str>,
    nikud: Option<bool>,
) -> Result<Refreshing, String> {
    #[derive(serde::Deserialize)]
    struct Answer {
        quotes: Vec<Refreshed>,
        /// Where the citations that moved point now. Absent from a Girsa older
        /// than the field, which is *nobody told me* and not *nothing moved* —
        /// so it defaults to an empty table and the document is left alone.
        #[serde(default)]
        moved: Vec<girsa_ref::Moved>,
    }
    let errand = refresh_errand(markup, style, nikud);
    let answer =
        girsa_post::send(App::Girsa, "/refresh", Some(&errand)).map_err(|e| e.to_string())?;
    let answer: Answer = serde_json::from_str(&answer).map_err(|e| e.to_string())?;
    let moved = girsa_ref::RedirectTable::of_rows(&answer.moved);
    // Rewritten here, once, and offered rather than applied. A correction in
    // somebody else's library silently changing what a document *says* is the
    // surprise spec.md §7.1 exists to avoid — and a mareh makom is the reader's
    // sentence, not the library's.
    let retargeted = (!moved.is_empty()).then(|| {
        girsa_ksav::retargeted(markup, |old| {
            let now = old.parse().ok().map(|r| moved.follow(&r))?;
            // A place that became several has no single new name, and inventing
            // one would put a citation on words the writer did not quote. The
            // row is still reported; it is the rewriting that declines.
            match now.as_slice() {
                [one] if one.to_string() != old => Some(one.to_string()),
                _ => None,
            }
        })
    });
    Ok(Refreshing {
        quotes: answer.quotes,
        moved,
        retargeted,
    })
}

/// What a refresh came back with.
///
/// # Two answers, because a refresh asks two things at once
///
/// *What do these citations say today* is the errand, and the rows are it.
/// *Are these citations still the right names for those words* is the question
/// nobody was asking: `Open::at` on the far side resolves an address through
/// the corpus's redirect rows, so a mareh makom whose place upstream
/// re-segmented comes back with the right words and no sign that its name is
/// now one that only resolves because a redirect row exists — on **that**
/// machine, against **that** shelf.
///
/// A document is a file somebody emails. `girsa-ref`'s redirect module has said
/// so since day one, in the header that describes refs which *"get stored inside
/// Ksav documents"*, and its `RedirectTable` had no consumer in either
/// application until this.
pub struct Refreshing {
    /// One row per citation, in the order they appear in the document.
    pub quotes: Vec<Refreshed>,
    /// Old ref → where it is now, for the ones that moved. Empty is the
    /// ordinary case.
    pub moved: girsa_ref::RedirectTable,
    /// The document with those citations rewritten, when there were any and
    /// each has a single new name. `None` is *there is nothing to offer*.
    pub retargeted: Option<String>,
}

/// Tell Girsa a document has been saved here, and where (spec.md §10.4).
///
/// # The other half of *where did I use this*
///
/// `girsa-desk`'s document registry, its `who_cites` query and its tests were
/// all built, and **nothing ever sent it a path**. The module's own header is
/// the finding: `who_cites` walked `personal/ksav/` — the documents written in
/// *Girsa's own toy editor*, a text box built so the loop could be demonstrated
/// without Ksav installed — so a `.ksav` written in the real Ksav, the
/// application the entire pairing exists for, answered *nothing cites this*.
///
/// And there is nowhere for Girsa to walk instead. A reader's documents live
/// wherever they keep documents — a Dropbox folder, a shiur directory, a USB
/// stick — and a library application has no business enumerating a disk. So the
/// pen tells it, which is this.
///
/// # What is sent, and what is not
///
/// A **path and a name**. Not the text: Girsa reads the file itself, caching
/// the refs against its modification time, so sending the body would be a
/// second copy of a document with no owner between them — which is the defect
/// `documents.rs` was written against, one layer down.
///
/// `forget: true` takes the row off the list — Ksav saying *I deleted this*.
/// The file is never touched either way.
///
/// # Errors
///
/// If Girsa is not running, refuses, or answers something unreadable. Every
/// caller here treats that as *nothing to do*: this is a courtesy to the
/// sibling application, and a save must never fail because the library is not
/// open.
pub fn document(path: &str, name: Option<&str>, forget: bool) -> Result<(), String> {
    let mut errand = serde_json::Map::new();
    errand.insert("path".into(), path.into());
    if let Some(name) = name {
        errand.insert("name".into(), name.into());
    }
    if forget {
        errand.insert("forget".into(), true.into());
    }
    let errand = serde_json::Value::Object(errand).to_string();
    send_or_legacy(DOCUMENT_SAVED, LEGACY_DOCUMENT, &errand)
}

use routes::girsa::{DOCUMENT_SAVED, LEGACY_DOCUMENT};

/// One errand, addressed to the name Girsa answers to.
///
/// `/document` used to mean two unrelated things depending on which way it was
/// travelling, which is why this direction is `/document-saved` now. The rename
/// looked like it needed both applications in one commit — two repositories, so
/// never. It does not: a path only collides *across* the seam, so each side can
/// answer to both names and each sender can try the new one and fall back. Old
/// Ksav with new Girsa, and new Ksav with old Girsa, both work.
///
/// **404 only.** A refusal for any other reason is Girsa having heard the
/// errand and declined it, and asking again under an older name would be asking
/// a second time for something already answered.
fn send_or_legacy(path: &str, legacy: &str, errand: &str) -> Result<(), String> {
    match girsa_post::send(App::Girsa, path, Some(errand)) {
        Ok(_) => Ok(()),
        Err(girsa_post::PostError::Refused { status: 404, .. }) => {
            girsa_post::send(App::Girsa, legacy, Some(errand))
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Whether the library is there, for an affordance that would otherwise fail.
#[must_use]
pub fn girsa() -> girsa_post::Presence {
    girsa_post::presence(App::Girsa)
}

/// The URL scheme the operating system has to be told about — `ksav`.
///
/// Asked of `girsa-post` rather than written down, because it is `girsa-post`
/// that decides what [`arrived`] will and will not parse. The scheme also has to
/// be registered with the system, and *that* copy lives in
/// `app/src-tauri/tauri.conf.json`, where nothing in Rust can see it: a rename
/// upstream would leave the shell registering a scheme the parser then refuses,
/// which is a deep link that opens Ksav and does nothing. `engine/tests/
/// deep_link.rs` holds the two together.
#[must_use]
pub fn scheme() -> &'static str {
    App::Ksav.as_str()
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

    #[test]
    fn a_refresh_errand_says_nothing_it_was_not_told() {
        // The two optional fields are optional in the wire sense: absent, not
        // null. Girsa reads absence as *the reader's own setting*, and a `null`
        // that deserialized to `Some(None)` on the other side would be this
        // editor quietly re-pointing somebody else's library.
        let plain = refresh_errand("#כותרת1[סוגיא]", None, None);
        assert!(!plain.contains("style"), "{plain}");
        assert!(!plain.contains("nikud"), "{plain}");
        assert!(plain.contains("markup"), "{plain}");

        let asked = refresh_errand("x", Some("hebrew-short"), Some(true));
        assert!(asked.contains("\"style\":\"hebrew-short\""), "{asked}");
        assert!(asked.contains("\"nikud\":true"), "{asked}");
    }

    #[test]
    fn a_document_full_of_markup_travels_as_one_string() {
        // The whole document, escaped as JSON — quote marks and backslashes in
        // a `מקור:` argument included. A body assembled with `format!` would
        // have looked fine until the first citation carrying a gershayim.
        let markup = girsa_ksav::mekor("שו\"ע או\"ח א', א'", Some("girsa:x/1:1"), None);
        let errand = refresh_errand(&markup, None, None);
        let read: serde_json::Value = serde_json::from_str(&errand).expect("it is json");
        assert_eq!(read["markup"], markup);
    }

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
        // Both lists, through the real API: `drain` no longer destroys what it
        // hands out — it moves it to `HANDED` and waits to be told — so a single
        // call leaves the previous test's arrivals in flight, and the next test
        // is handed them. Take everything, then acknowledge everything.
        let ids: Vec<String> = drain(&[]).into_iter().map(|a| a.id).collect();
        let _ = drain(&ids);
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

        let waiting = drain(&[]);
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
    ///
    /// *Took* means acknowledged, which is the whole of the two-phase handover:
    /// handing a source out and hearing nothing back is not evidence that it is
    /// in the document, and it used to be treated as though it were — the list
    /// was emptied and the file truncated before the answer had reached
    /// anybody. Both halves are asserted, because they are the trade being made:
    /// an unacknowledged source survives a restart, an acknowledged one does
    /// not.
    #[test]
    fn a_source_already_inserted_does_not_arrive_a_second_time() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        let handed = drain(&[]);
        assert_eq!(handed.len(), 1);

        // Handed out, nothing heard back, and the process dies. The source is
        // still this machine's to keep — spec.md §10's stated target is AirDrop,
        // and AirDrop does not lose the file when you close the window.
        INBOX.lock().map(|mut inbox| inbox.clear()).unwrap();
        HANDED.lock().map(|mut h| h.clear()).unwrap();
        recover();
        let again = drain(&[]);
        assert_eq!(
            again.len(),
            1,
            "a source handed out and never acknowledged must survive a restart"
        );

        // Now the editor says it has it. *That* is what makes it gone, here and
        // on disk, and a quote in a document twice is worse than one the reader
        // asks for again.
        assert!(drain(&[again[0].id.clone()]).is_empty());
        INBOX.lock().map(|mut inbox| inbox.clear()).unwrap();
        HANDED.lock().map(|mut h| h.clear()).unwrap();
        recover();
        assert!(
            drain(&[]).is_empty(),
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
            drain(&[]).len(),
            WAITING_ROOM,
            "refusing the last one must not cost the ones already waiting"
        );
    }

    #[test]
    fn a_packet_from_girsa_waits_in_the_inbox_as_markup() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        let waiting = drain(&[]);
        assert_eq!(waiting.len(), 1);
        assert!(waiting[0].markup.contains("#ציטוט["));
        assert!(waiting[0].markup.contains("ראוי לכל ירא שמים"));
        assert_eq!(
            waiting[0].reference,
            "girsa:shulchan-arukh/orach-chayim/1:3"
        );
    }

    #[test]
    fn a_source_is_held_until_the_client_says_it_has_it() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        let first = drain(&[]);
        assert_eq!(first.len(), 1);

        // The response was lost — a reload landing between the POST and the
        // parse, a wasm worker killed by the compile timeout mid-poll. The
        // client asks again, having acknowledged nothing, and must be handed the
        // same source rather than nothing at all.
        //
        // `drain` used to empty the list **and truncate the file** in one step,
        // before the answer had reached anybody, and the client's `inbox()`
        // swallows every failure by design — *"a build with no Girsa half, or a
        // server that went away, is a thing to stop asking about quietly"*. So a
        // lost response destroyed the source, from memory and from disk, with
        // Girsa already told `{"taken":true}`. spec.md §10's stated target is
        // AirDrop, and AirDrop does not lose the file when you close the window.
        let again = drain(&[]);
        assert_eq!(
            again.len(),
            1,
            "an unacknowledged source is handed out again"
        );
        assert_eq!(again[0].id, first[0].id, "and it is the same one");

        // Now it is in the document, and the client says so.
        let after = drain(&[first[0].id.clone()]);
        assert!(after.is_empty(), "an acknowledged source is let go of");
        // Two windows asking would otherwise each insert the same source.
        assert!(drain(&[]).is_empty());
    }

    #[test]
    fn every_arrival_is_named() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        arrived(PACKET).expect("a real packet");
        let waiting = drain(&[]);
        assert_eq!(waiting.len(), 2);
        assert!(
            !waiting[0].id.is_empty(),
            "an arrival with no id cannot be acknowledged"
        );
        assert_ne!(waiting[0].id, waiting[1].id, "two arrivals are two names");
    }

    /// Acknowledging one of two does not let go of the other.
    #[test]
    fn only_what_the_client_named_is_released() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        arrived(PACKET).expect("a real packet");
        let both = drain(&[]);
        assert_eq!(both.len(), 2);
        let left = drain(&[both[0].id.clone()]);
        assert_eq!(
            left.len(),
            1,
            "the unacknowledged one is still ours to keep"
        );
        assert_eq!(left[0].id, both[1].id);
    }

    /// The poll's request body is where the acknowledgement travels.
    ///
    /// No second service and no second round trip: the poll is the only errand
    /// there is, and an errand that exists to say "thank you" is a service
    /// nobody would keep.
    #[test]
    fn the_poll_reads_the_ids_the_client_took() {
        let _alone = alone();
        arrived(PACKET).expect("a real packet");
        let handed: Vec<Arrival> =
            serde_json::from_str(&drain_json("{}")).expect("the poll answers a list");
        assert_eq!(handed.len(), 1);
        let ack = serde_json::json!({ "took": [handed[0].id] }).to_string();
        let after: Vec<Arrival> = serde_json::from_str(&drain_json(&ack)).expect("a list");
        assert!(after.is_empty(), "the acknowledged source is gone");
        // A body that is not the shape this expects is a client that has taken
        // nothing, which is what the first poll of a session says.
        assert_eq!(drain_json("not json at all"), "[]");
    }

    #[test]
    fn a_buffer_handed_over_arrives_whole_and_says_so() {
        let _alone = alone();
        let handed = serde_json::json!({ "name": "חבורה", "text": "#כותרת1[סוגיא]
" });
        let reply = take_document(&handed.to_string());
        assert_eq!(reply.status, 200);
        let waiting = drain(&[]);
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

//! Every engine service, once.
//!
//! Ksav ships four ways — `ksav serve`, the Tauri desktop app, the in-browser
//! wasm build, and the Vite dev server proxying to a running engine — and each
//! of them used to carry its own hand-written list of what the engine can do.
//! Adding one function meant editing eight files at eleven sites, of which
//! **exactly one** was visible to a compiler; the other ten failed silently when
//! forgotten. Four of them had already been forgotten, and three were still
//! wrong when this module was written:
//!
//! - `sefarim` existed in the engine, in the wasm binding and in
//!   `WasmBackend.sefarim()`, and was missing from the worker's dispatch table.
//!   The lookup returned `undefined`, the call threw, `sefarim.ts` swallowed it,
//!   and citation autocomplete was simply dead in the offline build with nothing
//!   anywhere reporting it.
//! - The Vite dev proxy carried five of twelve routes, so `/jump`, `/reveal`,
//!   `/sefarim`, `/inbox`, `/mekoros` and `/linkify` all 404'd under
//!   `npm run dev` — including click-to-jump, the feature that put `typst-ide`
//!   in the dependency tree.
//! - The Tauri shell reached the same functions under thirteen different command
//!   names, one of which (`ksav_girsa_presence`) nothing had ever called.
//!
//! None of those are typos. They are what a hand-maintained registry does over
//! time, four times over, with nothing comparing the copies.
//!
//! So the copies are gone. This table is the registry; [`SERVICES`] is iterated
//! by `server.rs` for its routes, by the Tauri shell for its one `ksav_call`
//! command, and by the wasm binding for its one `ksav_call` export.
//! `app/tools/emit-services.mjs` reads this file and writes
//! `app/src/services.gen.ts`, which is what types the client's calls, builds the
//! dev proxy, and makes a wrong service name a `tsc` error instead of a runtime
//! `undefined`. `npm test` fails if the generated copy is stale.
//!
//! Adding a service is now one line here and one `node tools/emit-services.mjs`.
//! Forgetting the second is a red test rather than a dead feature.

use Cost::*;
use Method::*;
use Reach::*;

/// How a service is reached over HTTP.
///
/// The wasm and desktop builds address services by *name* and never form a URL
/// at all — the method and path exist for the two builds that speak HTTP, and
/// for the dev proxy that has to forward exactly the paths the engine answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
}

/// What a call costs, which is the only thing a delivery target needs to decide
/// how to run it.
///
/// - `Layout` lays the document out. On the server it goes through the deadline
///   and the in-flight cap, because Typst cannot be interrupted and a runaway
///   `#for` would otherwise occupy a worker forever; in the desktop app it goes
///   to `spawn_blocking`, because a `#[tauri::command]` runs on the thread that
///   draws the window.
/// - `Work` is real CPU that is not a layout — spell-checking a document,
///   waiting on Girsa over the loopback. Offloaded in the desktop app, not
///   capped on the server.
/// - `Quick` returns a registry, drains a queue, or builds a string. Straight
///   through. `assemble` is here rather than under `Layout` because that is the
///   entire point of it: it is the `format!` that a compile does *before* the
///   seconds of layout, and export used to pay for the layout to get at it.
///
/// This is the one axis on which the four targets legitimately differ, so it is
/// data on the service rather than a rule written out per target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cost {
    Layout,
    Work,
    Quick,
}

/// Which builds can answer at all.
///
/// `Native` means the service needs the *installed* application — something a
/// browser tab has no way to reach. Two things fall under that, and the second
/// one arrived with `git`:
///
///   - the loopback to Girsa, which a tab has neither a listener for nor a
///     token to read;
///   - the machine itself: a folder on disk, and a program to run in it.
///
/// Those services still appear in this table on every target — the name, path
/// and cost are facts about the service, not about the build — but on wasm they
/// answer with a refusal instead of failing to link. The client knows too: the
/// generated table carries `nativeOnly`, which is why `WasmBackend` implements
/// `Backend` and not `Sources`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reach {
    All,
    Native,
}

/// One thing the engine can be asked to do.
pub struct Service {
    /// The name every target uses: the wasm export's argument, the Tauri
    /// command's argument, and the key in the generated TypeScript union.
    pub name: &'static str,
    pub method: Method,
    /// The HTTP path, which is also what the dev proxy forwards.
    pub path: &'static str,
    pub cost: Cost,
    pub reach: Reach,
    /// JSON in, JSON out — the same contract in all four builds. A `Get`
    /// service is handed an empty string.
    pub call: fn(&str) -> String,
}

const fn svc(
    name: &'static str,
    method: Method,
    path: &'static str,
    cost: Cost,
    reach: Reach,
    call: fn(&str) -> String,
) -> Service {
    Service {
        name,
        method,
        path,
        cost,
        reach,
        call,
    }
}

/// The registry. One row per service, and this is the only list of them.
///
/// # The `#[rustfmt::skip]` below is now about taste, and it used to be about
/// correctness
///
/// It was load-bearing: `app/tools/emit-services.mjs` matched one
/// `svc("name", Method, "/path", Cost, Reach, fn)` **per line**, rustfmt's
/// `fn_call_width` is 60, and every row here is longer than that — so a `cargo
/// fmt` would have broken all thirteen across seven lines each and left the
/// emitter parsing a table of nothing. The attribute plus a paragraph saying so
/// was the whole fence.
///
/// It stopped rustfmt. It did not stop a hand, a field gaining a comment of its
/// own, or the **three other tables in this crate read the same way and carrying
/// no skip at all** — one of which, `impl Default for DocConfig`, silently
/// changed what the client shipped as its document defaults when it moved,
/// because the Rust value always wins on the wire.
///
/// So the formatting stopped being a build input instead. `src/facts.rs`
/// serialises this table into `engine/facts.gen.json` as values, the emitter
/// reads that, and `runner.test.mjs` sweeps `test/` and `tools/` for anything
/// that opens a `.rs` file at all. Checked rather than asserted: `cargo fmt` was
/// run over this file, which duly exploded every row to seven lines, and
/// `services.gen.ts` and `sw-services.gen.js` regenerated byte-identical.
///
/// The skip stays because thirteen rows of five short fields read better as
/// thirteen lines than as ninety-one. Reformat it whenever it reads better
/// reformatted; nothing downstream can tell.
#[rustfmt::skip]
pub const SERVICES: &[Service] = &[
    svc("compile", Post, "/compile", Layout, All, crate::compile_request),
    svc("assemble", Post, "/assemble", Quick, All, crate::assemble_request),
    svc("jump", Post, "/jump", Layout, All, crate::jump::jump_request),
    svc("reveal", Post, "/reveal", Layout, All, crate::jump::reveal_request),
    svc("spell", Post, "/spell", Work, All, crate::spell::spell_request),
    svc("suggest", Post, "/suggest", Work, All, crate::spell::suggest_request),
    svc("commands", Get, "/commands", Quick, All, commands),
    svc("templates", Get, "/templates", Quick, All, templates),
    svc("sefarim", Get, "/sefarim", Quick, All, sefarim),
    // A POST, and it looks like a read. It is not one: `inbox` **drains** —
    // it empties the waiting list and truncates the file behind it, because two
    // windows asking would otherwise each insert the same source. That makes it
    // a write wearing a read's clothes, and as a `GET` it was reachable by
    // `<img src="http://localhost:7878/inbox">` on any page the writer had
    // open. An image load sends no `Origin`, so no CORS check anywhere could
    // have caught it; the method is what makes the request unforgeable.
    svc("inbox", Post, "/inbox", Quick, Native, girsa::inbox),
    svc("mekoros", Post, "/mekoros", Work, Native, girsa::mekoros),
    svc("linkify", Post, "/linkify", Work, Native, girsa::linkify),
    svc("refresh", Post, "/refresh", Work, Native, girsa::refresh),
    // spec.md §10.2's Ctrl+C, from this end. Girsa puts a Source Packet on the
    // clipboard under a **real native format**, taking eighty-six lines of care
    // to do it — and nothing here read it, so a careful three-flavour copy
    // landed in an application that only ever took `text/plain`.
    //
    // A service and not a webview call, for exactly the reason Girsa's own
    // module gives for not writing it from a webview: a `paste` event exposes
    // `text/plain`, `text/html` and files, and a custom native format is not
    // among them on any platform. So the reading happens in the process that can
    // open the real clipboard.
    //
    // `Quick`, because it is a clipboard read, and a `POST` because it is asked
    // at the moment of pasting rather than polled.
    svc("clipboard-source", Post, "/clipboard-source", Quick, Native, girsa::clipboard_source),
    // spec.md §10.4's *where did I use this*, from the sending end. Girsa's
    // document registry, its `who_cites` query and its tests were all built and
    // **nothing ever sent it a path** — so the query walked Girsa's own toy
    // editor's directory and a document written in the real Ksav answered
    // *nothing cites this*.
    svc("saved-here", Post, "/saved-here", Quick, Native, girsa::saved_here),
    // Version control, on the git the writer already has. `Work` and not
    // `Quick`: `push` leaves the machine and `status` starts a process, and a
    // `Quick` service runs on the thread that draws the desktop window.
    svc("git", Post, "/git", Work, Native, disk::git),
];

/// The service with this name, if there is one.
pub fn find(name: &str) -> Option<&'static Service> {
    SERVICES.iter().find(|s| s.name == name)
}

/// The service this request addresses, if any.
///
/// Exact paths only. The engine answers a dozen URLs and serves a static file
/// tree under everything else, so a prefix match here would swallow assets.
pub fn route(method: Method, path: &str) -> Option<&'static Service> {
    SERVICES
        .iter()
        .find(|s| s.method == method && s.path == path)
}

/// Call a service by name. Used by the wasm and desktop bindings, which address
/// services by name rather than by URL.
pub fn call(name: &str, input: &str) -> String {
    match find(name) {
        Some(s) => (s.call)(input),
        // Reachable only from a caller that made the name up: the generated
        // TypeScript union is the only thing that produces these strings, and it
        // is generated from the table above. Answered rather than panicked
        // because a wasm panic poisons the module for the rest of the session.
        None => error_json(&format!(
            "אין שירות בשם {name} · no engine service named {name}"
        )),
    }
}

/// The registry as JSON — name, method, path, cost, and whether the service
/// needs the installed application beside Girsa.
///
/// The engine describing itself, so that anything wanting the list can *ask*
/// rather than keep a copy. The wasm smoke test in CI drives what this returns,
/// which is how "the module was built without the service the editor calls"
/// becomes a red build instead of a quiet `undefined`.
pub fn services_json() -> String {
    let list: Vec<serde_json::Value> = SERVICES
        .iter()
        .map(|s| {
            serde_json::json!({
                "name": s.name,
                "method": match s.method { Get => "GET", Post => "POST" },
                "path": s.path,
                "cost": match s.cost { Layout => "layout", Work => "work", Quick => "quick" },
                "nativeOnly": s.reach == Native,
            })
        })
        .collect();
    serde_json::Value::Array(list).to_string()
}

/// A failure, in the shape every caller can read.
///
/// Deliberately a superset: the compile-shaped fields so a failed `/compile`
/// reads identically whatever produced it, and an `error` key so the callers
/// that check `out.error` (mekoros, linkify) see it too. One shape means a
/// refusal never has to be told apart from the failure of the thing refused.
pub fn error_json(message: &str) -> String {
    serde_json::json!({
        "ok": false,
        "error": message,
        "pages_svg": [],
        "pdf_base64": serde_json::Value::Null,
        "diagnostics": [{ "severity": "error", "message": message }],
        "typst_source": "",
    })
    .to_string()
}

fn commands(_: &str) -> String {
    crate::commands::commands_json()
}

fn templates(_: &str) -> String {
    crate::templates::templates_json()
}

fn sefarim(_: &str) -> String {
    crate::sefarim::catalog_json()
}

/// The services that need the machine rather than the sibling application.
///
/// Split by target for the same reason `girsa` below is, and answering with a
/// different sentence: *there is no Girsa here* and *there is no disk here* are
/// two different things to tell a reader, and the browser build can only ever
/// be told the second one.
mod disk {
    #[cfg(not(target_arch = "wasm32"))]
    pub fn git(body: &str) -> String {
        crate::git::git_request(body)
    }

    #[cfg(target_arch = "wasm32")]
    pub fn git(_: &str) -> String {
        super::error_json(
            "ניהול גרסאות זמין ביישום המותקן, שבו למסמך יש מקום בכונן · \
             version control needs the installed application, where a document has a place on disk",
        )
    }
}

/// The three services that talk to Girsa over the loopback.
///
/// Two implementations, chosen by target rather than by feature flag: the
/// `girsa-post` dependency is already native-only in `Cargo.toml`, for the same
/// reason the HTTP server is. What is new is that the wasm build answers these
/// with a sentence instead of not having them — so the table is the same eleven
/// entries everywhere, and "this build cannot do that" is data the client can
/// read rather than a hole it has to know about.
mod girsa {
    #[cfg(not(target_arch = "wasm32"))]
    pub fn inbox(input: &str) -> String {
        crate::post::drain_json(input)
    }

    /// `{"phrase": "…", "except": null, "search": false}` → Girsa's answer.
    ///
    /// `search: true` asks Girsa to open its own search on the phrase instead of
    /// answering — one service rather than two, because it is one question with
    /// two endings and the HTTP contract already said so.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn mekoros(body: &str) -> String {
        #[derive(serde::Deserialize)]
        struct Asked {
            phrase: String,
            #[serde(default)]
            except: Option<String>,
            #[serde(default)]
            search: bool,
        }
        let Ok(asked) = serde_json::from_str::<Asked>(body) else {
            return super::error_json(
                "הבקשה אינה מכילה ביטוי לחיפוש · the request carries no phrase to look for",
            );
        };
        if asked.search {
            return match crate::post::search_in_girsa(&asked.phrase) {
                Ok(()) => r#"{"opened":true}"#.to_string(),
                Err(why) => super::error_json(&why),
            };
        }
        match crate::post::where_from(&asked.phrase, asked.except.as_deref()) {
            Ok(answer) => answer,
            Err(why) => super::error_json(&why),
        }
    }

    /// `{"text": "…"}` → `{"text": "…with the citations live…"}`.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn linkify(body: &str) -> String {
        #[derive(serde::Deserialize)]
        struct Asked {
            text: String,
        }
        let Ok(asked) = serde_json::from_str::<Asked>(body) else {
            return super::error_json(
                "הבקשה אינה מכילה טקסט לסימון · the request carries no text to mark up",
            );
        };
        match crate::post::linkify(&asked.text) {
            Ok(text) => serde_json::json!({ "text": text }).to_string(),
            Err(why) => super::error_json(&why),
        }
    }

    /// `{"markup": "…", "style": null, "nikud": null}` → one row per citation,
    /// as the library has it now.
    ///
    /// spec.md §10.2's promise about a **document** rather than about a place.
    /// The rows come back to the editor unchanged and the editor asks the
    /// writer: a correction somebody else made silently rewriting the words in
    /// a sefer being written is the one surprise the whole arrangement is built
    /// to avoid.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn refresh(body: &str) -> String {
        #[derive(serde::Deserialize)]
        struct Asked {
            markup: String,
            #[serde(default)]
            style: Option<String>,
            #[serde(default)]
            nikud: Option<bool>,
        }
        let Ok(asked) = serde_json::from_str::<Asked>(body) else {
            return super::error_json(
                "הבקשה אינה מכילה מסמך לרענון · the request carries no document to refresh",
            );
        };
        match crate::post::refresh(&asked.markup, asked.style.as_deref(), asked.nikud) {
            // `moved` and `retargeted` are the second answer — see
            // `post::Refreshing`. Offered, never applied: the document is
            // rewritten here so the editor has one thing to insert, and whether
            // to insert it is the writer's.
            Ok(got) => serde_json::json!({
                "quotes": got.quotes,
                "total": got.quotes.len(),
                "trouble": got.quotes.iter().filter(|q| q.trouble.is_some()).count(),
                "moved": got.moved.rows(),
                "retargeted": got.retargeted,
            })
            .to_string(),
            Err(why) => super::error_json(&why),
        }
    }

    /// One sentence per language, and the name of the thing in each — not one
    /// sentence with a bilingual name spliced into it twice, which is what the
    /// first draft of this did and which reads as neither language.
    #[cfg(target_arch = "wasm32")]
    fn no_library(he: &str, en: &str) -> String {
        super::error_json(&format!(
            "{he} זמין רק ביישום המותקן, שגרסא פתוחה לצדו · \
             {en} needs the installed application, where Girsa runs beside it"
        ))
    }

    #[cfg(target_arch = "wasm32")]
    pub fn inbox(_: &str) -> String {
        no_library("תיבת המקורות", "the source inbox")
    }

    #[cfg(target_arch = "wasm32")]
    pub fn mekoros(_: &str) -> String {
        no_library("איתור מקור", "finding a source")
    }

    #[cfg(target_arch = "wasm32")]
    pub fn linkify(_: &str) -> String {
        no_library("סימון ציטוטים", "marking up citations")
    }

    #[cfg(target_arch = "wasm32")]
    pub fn refresh(_: &str) -> String {
        no_library("רענון המקורות", "refreshing a document's sources")
    }

    /// Tell Girsa a document was saved, so *where did I use this* can find it.
    ///
    /// `{"path": "…", "name": "…", "forget": false}` → `{"told": true}`, or
    /// `{"told": false}` when the library is not open — which is **not** an
    /// error. A save must never fail because the sibling application is closed,
    /// and this is a courtesy to it rather than a step in saving.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn saved_here(body: &str) -> String {
        #[derive(serde::Deserialize)]
        struct Saved {
            path: String,
            #[serde(default)]
            name: Option<String>,
            #[serde(default)]
            forget: bool,
        }
        let Ok(saved) = serde_json::from_str::<Saved>(body) else {
            return super::error_json("הבקשה אינה מכילה נתיב · the request carries no path");
        };
        let told = crate::post::document(&saved.path, saved.name.as_deref(), saved.forget).is_ok();
        serde_json::json!({ "told": told }).to_string()
    }

    #[cfg(target_arch = "wasm32")]
    pub fn saved_here(_: &str) -> String {
        // A browser tab has no file path to tell anybody about, and saying so
        // as an *error* would make an ordinary save report a failure.
        serde_json::json!({ "told": false }).to_string()
    }

    /// The Source Packet on the clipboard, **already rendered to markup**.
    ///
    /// `{"markup": null}` is the ordinary answer and is not a failure: the
    /// reader copied from a text editor, or there is no clipboard on this
    /// machine. The caller pastes as text, which is what a paste did before this
    /// existed.
    ///
    /// Rendered here rather than handed over as a packet, for the reason the
    /// arrivals path already gives: there is **one** renderer, in Rust, so a
    /// quote that arrives over the loopback and a quote that arrives on the
    /// clipboard are the same markup. A second renderer on the client is exactly
    /// what spec.md §10.3 rules out.
    ///
    /// A packet that arrives and cannot be read is **not** `null`. It comes back
    /// with the reason — a schema mismatch has both version numbers in it —
    /// because turning that into a silent plain-text paste is what the schema
    /// version exists to prevent.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn clipboard_source(_: &str) -> String {
        let Some(json) = crate::clipboard::source_on_clipboard() else {
            return serde_json::json!({ "markup": serde_json::Value::Null }).to_string();
        };
        match crate::source::insert(&json, girsa_ksav::CitationPlacement::Mekor) {
            Ok(markup) if crate::source::looks_double_encoded(&markup) => {
                super::error_json(crate::source::DOUBLE_ENCODED)
            }
            Ok(markup) => serde_json::json!({ "markup": markup }).to_string(),
            Err(e) => super::error_json(&e.to_string()),
        }
    }

    #[cfg(target_arch = "wasm32")]
    pub fn clipboard_source(_: &str) -> String {
        // Not `no_library`: a browser tab pasting text is not an error and must
        // not be reported as one. The honest answer is *there is no packet*,
        // which is also true and which the caller already knows how to handle.
        serde_json::json!({ "markup": serde_json::Value::Null }).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Names are the wire. Two services with one name would make `call` answer
    /// whichever came first, and the generated union would silently lose one.
    #[test]
    fn every_service_is_named_and_routed_once() {
        for (i, s) in SERVICES.iter().enumerate() {
            for other in &SERVICES[i + 1..] {
                assert_ne!(s.name, other.name, "two services named {}", s.name);
                assert!(
                    !(s.method == other.method && s.path == other.path),
                    "two services on {} {}",
                    s.path,
                    s.name
                );
            }
            assert!(s.path.starts_with('/'), "{} has no leading slash", s.name);
            assert_eq!(
                s.path,
                format!("/{}", s.name),
                "keep the path and the name the same word — the dev proxy, the \
                 wasm dispatch and the Tauri command all key on one of them"
            );
        }
    }

    #[test]
    fn every_service_is_reachable_by_name() {
        for s in SERVICES {
            assert!(
                find(s.name).is_some(),
                "{} is in the table and not findable",
                s.name
            );
            assert!(
                route(s.method, s.path).is_some(),
                "{} is in the table and not routable",
                s.name
            );
        }
    }

    /// The failure that started this: a name nothing answers used to be an
    /// `undefined` in a JavaScript lookup table, which threw, which was caught,
    /// which is how a dead feature stays quiet for a month.
    #[test]
    fn a_name_nothing_answers_is_a_stated_refusal() {
        assert!(find("nonesuch").is_none());
        let out = call("nonesuch", "");
        assert!(out.contains("\"ok\":false"), "{out}");
        assert!(out.contains("no engine service named nonesuch"), "{out}");
    }

    /// Every service the client can name, the engine can answer — including the
    /// one that was in three of the four registries and missing from the fourth.
    #[test]
    fn the_registry_holds_the_services_the_editor_depends_on() {
        for name in [
            "compile",
            "assemble",
            "jump",
            "reveal",
            "spell",
            "suggest",
            "commands",
            "templates",
            "sefarim",
            "inbox",
            "mekoros",
            "linkify",
            "refresh",
            "clipboard-source",
            "saved-here",
            "git",
        ] {
            assert!(find(name).is_some(), "{name} is missing from the registry");
        }
        // No `assert_eq!(SERVICES.len(), 15)`.
        //
        // It was there, with the message "add the new service to this list too",
        // which is a test admitting it goes red for a good change and asking to
        // be edited rather than telling anyone anything. The names above are a
        // real claim — each of those sixteen is a promise to a client that has
        // already shipped, and removing one has to hurt — but a *seventeenth*
        // service is not a defect, and a check that cannot tell those two apart
        // trains people to update the number without reading why it moved.
        //
        // What holds for a sixteenth as much as for these is below. (G6, in the
        // relayed findings: assert the class, not the shape.)
        let mut names: Vec<_> = SERVICES.iter().map(|s| s.name).collect();
        names.sort_unstable();
        let count = names.len();
        names.dedup();
        assert_eq!(names.len(), count, "two services share a name");

        let mut paths: Vec<_> = SERVICES.iter().map(|s| s.path).collect();
        paths.sort_unstable();
        let routes = paths.len();
        paths.dedup();
        assert_eq!(paths.len(), routes, "two services share an HTTP path");

        for s in SERVICES {
            assert!(!s.name.is_empty(), "a service with no name");
            assert!(
                s.path.starts_with('/'),
                "{}: {:?} is not a path the dev proxy can forward",
                s.name,
                s.path
            );
            // The name is what every target keys on — the wasm export's
            // argument, the Tauri command's, and the generated TypeScript union
            // — so a name that is not a plain identifier breaks a build nobody
            // is looking at when it does.
            assert!(
                s.name
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
                "{}: a service name reaches four targets and has to be plain",
                s.name
            );
        }
    }

    /// A layout is the only thing that needs the server's deadline and the
    /// desktop's blocking pool, and it is the only thing that must not be
    /// mistaken for cheap: `Quick` runs on the thread that draws the window.
    #[test]
    fn only_the_services_that_lay_out_a_document_are_marked_layout() {
        let layout: Vec<_> = SERVICES
            .iter()
            .filter(|s| s.cost == Layout)
            .map(|s| s.name)
            .collect();
        assert_eq!(layout, ["compile", "jump", "reveal"]);
    }

    /// The services a browser tab cannot answer say so in the table.
    ///
    /// Two reasons, not one. Six of these need Girsa over the loopback; `git`
    /// needs a folder on disk and a program to run in it. Both are *the
    /// installed application*, which is what `Native` means and what the
    /// generated `nativeOnly` tells the client — but they are named separately
    /// here, because a service moving from one reason to the other is a real
    /// change and a list of seven names cannot see it.
    #[test]
    fn the_services_that_need_the_installed_application_say_so() {
        // Girsa over the loopback, which a tab has neither a listener for nor a
        // token to read.
        let needs_girsa = [
            "inbox",
            "mekoros",
            "linkify",
            "refresh",
            "clipboard-source",
            "saved-here",
        ];
        // A folder on disk and a program to run in it.
        let needs_the_machine = ["git"];

        for name in needs_girsa {
            assert_eq!(find(name).unwrap().reach, Native, "{name} reaches Girsa");
        }
        for name in needs_the_machine {
            assert_eq!(find(name).unwrap().reach, Native, "{name} needs the disk");
        }

        // And every *other* service is reachable everywhere.
        //
        // No `assert_eq!(native.len(), 7)`. That is what this was, and it is the
        // shape G6 rules out — a count of a registry, red for a seventeenth
        // service whether or not anything is wrong with it, and silent about
        // which one moved. What it was reaching for is the claim below: a
        // service marked `Native` by accident is a feature silently missing
        // from the browser build, and this names it.
        // A `continue` over a list is a loop that can check nothing, and
        // `app/test/skips.test.mjs` says so about this one: if the two lists
        // above ever named every service, the assertion below would never run
        // and this test would stay green while claiming to hold the column.
        // So what was actually checked is counted, and there is a floor under
        // it.
        let mut checked = 0;
        for s in SERVICES {
            if needs_girsa.contains(&s.name) || needs_the_machine.contains(&s.name) {
                continue;
            }
            checked += 1;
            assert_eq!(
                s.reach, All,
                "{} is marked native-only, so the browser build answers it with a \
                 refusal — if that is right, add it to one of the two lists above \
                 with the reason",
                s.name
            );
        }
        assert!(
            checked >= 9,
            "only {checked} services were checked against `All` — the two lists \
             above have grown to cover almost the whole registry, and this test \
             is passing by not looking"
        );
    }

    /// A request with no phrase in it is a refusal with a reason, not a panic
    /// and not an empty answer that reads as "nothing was found".
    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn a_malformed_request_is_refused_in_both_languages() {
        let out = call("mekoros", "{}");
        assert!(out.contains("no phrase") && out.contains("ביטוי"), "{out}");
        let out = call("linkify", "not json at all");
        assert!(out.contains("no text") && out.contains("טקסט"), "{out}");
    }
}

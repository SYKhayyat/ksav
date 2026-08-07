//! Minimal local HTTP API for the Ksav editor.
//!
//! - `GET  /`        → the two-panel web editor (bundled at build time)
//! - every service in [`crate::services`], at its own path — `POST /compile`
//!   takes JSON `{body, font, size_pt, margin_cm, dir}` and answers JSON
//!   `{ok, pages_svg, pdf_base64, diagnostics}`, and the rest are listed there.
//!
//! This file used to carry its own copy of that list — a twelve-arm `match`,
//! written out beside three other hand-maintained lists in three other builds.
//! It carries none now: the routing below iterates the registry, so a service
//! added there is served here without this file being touched at all.
//!
//! This is exactly the backend a Tauri or browser front end talks to; the
//! native shell can be wrapped around it later without touching this contract.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use tiny_http::{Header, Method, Response, Server};

// `error_json` lives beside the registry: a refusal from the dispatcher and a
// refusal from the service itself have to be indistinguishable to whoever reads
// the answer, so there is one function that writes both.
use crate::services::{self, error_json, Cost, Service};

/// Content-Security-Policy for the served editor.
///
/// The engine's output becomes HTML in the browser (per-page SVG assigned to
/// `innerHTML`), and `ksav serve` had no CSP at all — so a document arriving from
/// someone else ran with no second line of defence.
///
/// It is [`crate::policy::csp`] and not a string here, because this was one of
/// three copies of that string and the comment above it used to claim all three
/// were the same policy. They were not; see `ksav/policy/README.md`.
fn csp() -> &'static str {
    crate::policy::csp()
}

/// The full built SPA (ksav/app/dist), embedded when `embed-ui` is enabled.
#[cfg(feature = "embed-ui")]
static UI: include_dir::Dir<'_> = include_dir::include_dir!("$CARGO_MANIFEST_DIR/../app/dist");

fn content_type_for(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("json") => "application/json; charset=utf-8",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("png") => "image/png",
        // A manifest served as `application/octet-stream` is ignored outright,
        // so the app is simply not installable and nothing says why.
        Some("webmanifest") => "application/manifest+json; charset=utf-8",
        // And `WebAssembly.instantiateStreaming` *refuses* a module that does not
        // arrive as `application/wasm` — which is the in-browser build, and was
        // already falling back to the slower non-streaming path here.
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

/// The policy a static response of this content type must carry, if any.
///
/// One function rather than an `if` at each site, because it was an `if` at
/// each site and the two sites disagreed: the embedded-SPA branch attached the
/// policy to HTML, and the fallback branch attached nothing to anything, with a
/// comment explaining why that was fine. It was not fine — it was the only
/// response the engine emitted with no policy on it, in the build that receives
/// documents written by other people.
///
/// `None` for everything else is deliberate and is not a gap: a
/// `Content-Security-Policy` header on a stylesheet or a font governs nothing,
/// and attaching it where it does nothing is how a policy stops being read as a
/// statement about anything. HTML is where a document executes.
fn policy_for(content_type: &str) -> Option<&'static str> {
    content_type.starts_with("text/html").then(csp)
}

/// Attach the content type, and the policy if the type calls for one.
fn with_policy(
    resp: Response<impl std::io::Read>,
    content_type: &str,
) -> Response<impl std::io::Read> {
    let mut resp = resp.with_header(header("Content-Type", content_type));
    if let Some(policy) = policy_for(content_type) {
        resp = resp.with_header(header("Content-Security-Policy", policy));
    }
    resp
}

/// The file part of a request URL: no leading slash, no query, no fragment.
///
/// The query used to stay on. `rel` became `sw.js?v=0.1.0`, `include_dir` has no
/// such file, `content_type_for` rsplit it to `js?v=0` and answered with the
/// default type, and the request fell through to a 404 — so **the service worker
/// has never installed under `ksav serve`**. It is registered as
/// `sw.js?v=${CURRENT_VERSION}` on purpose, precisely so a release cannot reuse
/// the previous release's cache, and `registerServiceWorker` catches the failure
/// on purpose, because offline support is a bonus and not worth interrupting a
/// writer over. Two deliberate decisions, each correct, with a 404 between them
/// that nothing was watching. The whole offline build was dead on this line.
///
/// A fragment never reaches a server, but `#doc=` is how this app opens a shared
/// document, so a stray one in a hand-typed URL is likelier here than most
/// places and costs nothing to ignore.
fn asset_path(url: &str) -> &str {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    if path.is_empty() || path == "/" || path == "/index.html" {
        "index.html"
    } else {
        path.trim_start_matches('/')
    }
}

/// Serve a static asset for a GET request. Returns true if it was handled.
fn serve_static(request: tiny_http::Request, url: &str) {
    let rel = asset_path(url);

    #[cfg(feature = "embed-ui")]
    {
        if let Some(file) = UI.get_file(rel) {
            let resp = with_policy(Response::from_data(file.contents()), content_type_for(rel));
            let _ = request.respond(resp);
            return;
        }
    }

    // No app here, and a page that says how to get one.
    //
    // `ksav/engine/web/` used to answer this: a complete second editor — its own
    // starter document, its own toolbar of ten commands, its own debounced
    // compile loop, its own PDF download, 232 lines — touched twice in the
    // project's history while `main.ts` took 79 commits. It was not merely
    // redundant, it was *wrong*: its table insertion carried the bare
    // `עמודות: 2` that `commands.rs:97-102` documents as the defect it fixed
    // (Typst sizes each column to its contents, so an empty new table rendered
    // as a thumbnail shoved against the margin). The fix landed in the registry
    // and not there, because there was invisible to `emit-insertion-fixtures.mjs`
    // — which reads the engine registry and the app's insertion path and has
    // never heard of `data-insert=` attributes inside an `include_str!`ed HTML
    // file. **The repository's most expensive lesson — 384 broken insertions —
    // had a blind spot exactly the shape of that file.**
    //
    // The argument for keeping it was that `cargo run -- serve` on a fresh clone
    // must answer *something* at `/`. It must, and this is it: a bare 404 is a
    // worse first five minutes than a stripped editor, and both are worse than
    // the two commands that produce the real one.
    if rel == "index.html" {
        let resp = with_policy(
            Response::from_string(NO_UI_HTML).with_status_code(404),
            content_type_for("index.html"),
        );
        let _ = request.respond(resp);
        return;
    }

    let _ = request.respond(Response::from_string("not found").with_status_code(404));
}

/// What `/` says when the binary was built without `--features embed-ui`.
///
/// No inline script and no inline style, so it is served under the same policy
/// as everything else rather than needing an exception — which is the mistake
/// the page it replaces made, and had a comment explaining.
const NO_UI_HTML: &str = r#"<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Ksav — the app is not in this binary</title></head>
<body>
<h1>Ksav is running. The editor is not in this binary.</h1>
<p>The engine is answering — its services are on this same origin, and
<code>POST /compile</code> works right now. What is missing is the editor, which is
built separately and embedded at compile time.</p>
<pre>cd ksav/app    &amp;&amp; npm install &amp;&amp; npm run build
cd ksav/engine &amp;&amp; cargo build --release --features embed-ui</pre>
<p>Then run <code>ksav serve</code> again. The order matters: <code>app/dist</code> is
git-ignored, so building the server first fails inside <code>include_dir!</code> with a
message about a missing directory rather than about the step that was skipped.</p>
</body>
</html>
"#;

/// The largest request body the API will read.
///
/// `read_to_string` used to read until end-of-stream with no ceiling at all, so
/// a single client could make the server allocate until it died. A compile
/// request carries the document plus every image and font attached to it, so the
/// limit has to be generous — but it does have to exist.
const MAX_BODY_BYTES: u64 = 64 * 1024 * 1024;

/// How many requests are served at once.
///
/// The server was strictly serial: one loop, one compile at a time, so four
/// concurrent compiles returned in 469/868/1255/1667 ms — a perfect staircase —
/// and a spell check queued behind a compile waited for the whole render. Typst
/// layout is CPU-bound, so the pool is sized to the machine rather than made
/// unbounded: more threads than cores would only trade throughput for context
/// switches, and an unbounded pool would let a stuck client spawn threads until
/// the process fell over.
fn worker_count() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .clamp(2, 16)
}

/// Read a request body, refusing anything over the ceiling.
fn read_body(request: &mut tiny_http::Request) -> Result<String, String> {
    let declared = request.body_length().unwrap_or(0) as u64;
    if declared > MAX_BODY_BYTES {
        return Err(format!("request body over {MAX_BODY_BYTES} bytes"));
    }
    let mut body = String::new();
    // Still capped while reading: `Content-Length` is the client's claim, not a
    // fact, and a chunked body declares no length at all.
    let mut limited = std::io::Read::take(request.as_reader(), MAX_BODY_BYTES + 1);
    std::io::Read::read_to_string(&mut limited, &mut body).map_err(|e| e.to_string())?;
    if body.len() as u64 > MAX_BODY_BYTES {
        return Err(format!("request body over {MAX_BODY_BYTES} bytes"));
    }
    Ok(body)
}

fn json_response(json: String) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(json)
        .with_header(header("Content-Type", "application/json; charset=utf-8"))
}

/// Wall-clock ceiling for a single compile.
///
/// Typst has no mid-compile cancellation, and it does not need malice to run
/// away: `#for i in range(400000) [א ]` is thirty bytes of ordinary typing
/// mistake that pins a core for a minute. Without a ceiling the editor simply
/// stops answering, with no hint why. Overridable for a machine that wants a
/// different budget; the default is generous enough for a real sefer and short
/// enough that a runaway is caught while the writer is still looking at it.
fn compile_deadline() -> Duration {
    std::env::var("KSAV_COMPILE_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|&ms| ms > 0)
        .map(Duration::from_millis)
        .unwrap_or(Duration::from_millis(20_000))
}

/// Compiles in flight right now, including ones that overran their deadline and
/// are still finishing on a detached thread.
static IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);

/// Compile with a deadline, on a thread that is not one of the pool's.
///
/// A compile that overruns cannot be killed (Typst offers no interruption), so
/// two things protect the server instead of one. First, the compile runs on its
/// own thread and the pool thread only *waits* for it with a timeout — so a
/// runaway never occupies a worker, and spell checks, completions and static
/// assets keep being served throughout. Second, the number of concurrent
/// compiles is capped: an overran compile keeps running to completion on its
/// detached thread and holds its slot until it does, so without a cap a stream
/// of bad documents could pile up threads without bound. At the cap a new
/// compile is refused at once with a plain message rather than joining the pile.
///
/// The overran computation is not reclaimed — that would need a separate process
/// to kill, which is a heavier machine than a local single-user editor warrants
/// — but it can no longer hold up anyone else, and the writer is told plainly:
/// the timeout message says the compile was **abandoned and will finish in the
/// background**, and a refusal at the cap names how many are in flight. Those two
/// sentences and this paragraph have to agree, and for a while they did not.
/// Run one service, giving a layout the deadline and the cap it needs.
///
/// A jump costs a full layout, so it goes through the same door as a compile.
/// Both directions between the source and the page have to lay the document out
/// to answer at all — that is what makes the answer exact instead of a guess —
/// which means a document that takes eleven seconds to compile takes eleven
/// seconds to click on. Letting these bypass the cap would mean a writer
/// clicking repeatedly on a slow document could pile up unbounded layouts that
/// the compile path is carefully arranged to prevent.
///
/// A refusal or a timeout comes back as [`error_json`], which carries no `line`
/// and no `points`, so the client reads it as "no answer" and leaves the cursor
/// alone. That is the right behaviour for a busy server and also for a click on
/// a page margin, which keeps the client from having to tell them apart.
///
/// Which services are layouts is [`Cost`] on the service, not a list here.
/// Three of these wrappers used to exist, one per bounded route, and a fourth
/// bounded route would have needed a fourth — written by whoever remembered.
fn run_service(svc: &'static Service, body: String) -> String {
    match svc.cost {
        Cost::Layout => run_bounded(body, compile_deadline(), worker_count(), |b| (svc.call)(&b)),
        // Everything else answers from a registry, a queue or the loopback, and
        // the pool's own worker is the right place for it: capping a spell check
        // behind a stuck compile is the failure the pool exists to prevent.
        Cost::Work | Cost::Quick => (svc.call)(&body),
    }
}

/// The deadline-and-cap machinery, with the actual work passed in.
///
/// Taking the work as a closure keeps this testable without leaning on how long
/// a particular Typst document happens to take to lay out — which varies by
/// build and machine, and which Typst can quietly short-circuit for a truly
/// absurd loop bound. The timeout, the slot accounting and the busy response are
/// what has to be right, and those are exercised directly.
fn run_bounded<F>(body: String, deadline: Duration, max: usize, work: F) -> String
where
    F: FnOnce(String) -> String + Send + 'static,
{
    let taken = IN_FLIGHT.fetch_add(1, Ordering::SeqCst);
    if taken >= max {
        IN_FLIGHT.fetch_sub(1, Ordering::SeqCst);
        // The count, not just the word. "The server is busy" with no number is
        // unfalsifiable to whoever reads it — one genuinely slow sefer and eight
        // abandoned runaways produce the same sentence, and only one of them
        // means "wait a moment". Since an abandoned compile keeps its slot until
        // it truly ends, this number is also the only visible trace that any were
        // abandoned at all.
        return error_json(&format!(
            "השרת עסוק — {taken}/{max} הידורים באוויר, ובהם הידורים שננטשו וממשיכים ברקע; \
             נסו שוב בעוד רגע · the server is busy — {taken}/{max} compiles in flight, \
             including any that were abandoned and are still finishing; try again in a moment",
        ));
    }

    let (tx, rx) = std::sync::mpsc::sync_channel::<String>(1);
    std::thread::spawn(move || {
        let out = work(body);
        // The buffer of one means this send succeeds even after the waiter has
        // given up, so the slot is released exactly when the work truly ends.
        let _ = tx.send(out);
        IN_FLIGHT.fetch_sub(1, Ordering::SeqCst);
    });

    match rx.recv_timeout(deadline) {
        Ok(json) => json,
        // *Abandoned*, not stopped. Typst offers no interruption, so the compute
        // is still running on the detached thread above, still holding one of
        // `max` slots and still burning a core until it finishes on its own. The
        // doc comment on `compile_with_deadline` has always said so; the sentence
        // the writer read said "was stopped", which is the opposite, and it is
        // the reason a later refusal naming the slot count would otherwise look
        // like a lie.
        Err(_) => error_json(&format!(
            "ההידור ארך יותר מ־{secs} שניות ולכן ננטש — הוא ימשיך ברקע עד שיסתיים, \
             ותופס מקום אחד מ־{max} עד אז. לולאה או חזרה עם מספר גדול מאוד עלולה לגרום \
             לכך; בדקו את הגבולות של #עבור/#כלעוד · the compile ran longer than {secs}s \
             and was abandoned — it will finish in the background and holds one of {max} \
             slots until it does. A loop or repetition with a very large count can cause \
             this; check any #for/#while bounds",
            secs = deadline.as_secs().max(1)
        )),
    }
}

/// tiny_http's method, as the registry's — for the two the API answers.
fn asked_method(method: &Method) -> Option<services::Method> {
    match method {
        Method::Get => Some(services::Method::Get),
        Method::Post => Some(services::Method::Post),
        _ => None,
    }
}

/// Handle one request. Runs on a worker thread.
fn handle(mut request: tiny_http::Request, addr_str: &str) {
    let method = request.method().clone();
    let url = request.url().to_string();

    // The API is the registry. Every service is served here, with its own cost,
    // and this file names none of them: the twelve-arm `match` that used to be
    // here was the third of four hand-written copies of that list, and the copy
    // in `vite.config.ts` had six routes missing for a month.
    // Routed on the path alone. `services::route` is an exact match by design —
    // a prefix match would swallow the asset tree — and an exact match against a
    // string with `?v=1` on the end silently becomes "no such service", which is
    // the same failure the static branch had.
    let route_path = url.split(['?', '#']).next().unwrap_or(&url);
    if let Some(svc) = asked_method(&method).and_then(|m| services::route(m, route_path)) {
        // A cross-origin caller is refused, not merely denied the CORS header.
        //
        // Withholding `Access-Control-Allow-Origin` stops the *page* reading the
        // reply. It does not stop the request happening, and for a service that
        // changes state that is the whole of the damage: `/inbox` drains the
        // waiting quotations — empties the list and truncates the file — so any
        // page open in the writer's browser could destroy a source Girsa had
        // handed over, and the fact that it could not read the reply was no
        // consolation at all. Deleted is deleted.
        //
        // The comment further down about this server binding to loopback and
        // holding no secrets was written before `/inbox` existed. It is also not
        // quite true any more: `ksav serve [addr]` takes any bind address.
        if !origin_allowed(&request, addr_str) {
            let _ = request.respond(
                Response::from_string("cross-origin request refused").with_status_code(403),
            );
            return;
        }
        let cors = cors_header(&request, addr_str);
        // A JSON endpoint that reads a body: check the size before doing any
        // work. A GET service is handed nothing, which is what it expects.
        let json = match svc.method {
            services::Method::Post => match read_body(&mut request) {
                Ok(body) => run_service(svc, body),
                Err(e) => error_json(&e),
            },
            services::Method::Get => run_service(svc, String::new()),
        };
        let _ = request.respond(with_cors(json_response(json), cors));
        return;
    }

    match method {
        Method::Options => {
            let cors = cors_header(&request, addr_str);
            let resp = Response::empty(204)
                .with_header(header("Access-Control-Allow-Methods", "POST, GET, OPTIONS"))
                .with_header(header("Access-Control-Allow-Headers", "Content-Type"));
            let _ = request.respond(with_cors(resp, cors));
        }
        Method::Get => serve_static(request, &url),
        _ => {
            let _ = request.respond(Response::from_string("not found").with_status_code(404));
        }
    }
}

pub fn serve(addr: &str) {
    let server = match Server::http(addr) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot bind {addr}: {e}");
            std::process::exit(1);
        }
    };
    let workers = worker_count();
    println!("Ksav editor serving on http://{addr} ({workers} workers)");

    // The loopback desk, so Girsa can hand this editor a source while it runs
    // (spec.md §10.6). Its own listener on a port the system picks, token-gated
    // — deliberately not this server, which is a *web* server with an origin
    // policy and a static file tree, and is the wrong thing to let another
    // application post into. Kept alive for as long as `serve` runs: dropping
    // it is what withdraws the endpoint file.
    let _desk = match crate::post::open_desk(env!("CARGO_PKG_VERSION")) {
        Ok(desk) => {
            // This is *our* port: the desk Girsa may post into. Whether Girsa
            // is there is a different question, and `post::girsa()` is the one
            // that answers it — it reads the endpoint file and then asks it.
            //
            // This line used to read "paired with Girsa on {desk.port()}",
            // which named Ksav's own port and claimed a pairing on the strength
            // of nothing but our own listener having bound. spec.md §10.6 has
            // presence so that *"the affordance is never offered when it would
            // fail"*; announcing a sibling that is not running inverts it.
            println!("listening for Girsa on 127.0.0.1:{}", desk.port());
            match crate::post::girsa() {
                girsa_post::Presence::Live { version } => {
                    println!("Girsa is running (v{version}) and can hand this editor a source");
                }
                girsa_post::Presence::NotRunning => {
                    println!("Girsa is not running — start it to hand sources across");
                }
                girsa_post::Presence::Stale { why } => {
                    println!("Girsa left an endpoint behind but does not answer: {why}");
                }
            }
            Some(desk)
        }
        Err(e) => {
            eprintln!("the Girsa pairing is not open: {e}");
            None
        }
    };
    let server = std::sync::Arc::new(server);
    let addr_str = std::sync::Arc::new(addr.to_string());

    let mut handles = Vec::with_capacity(workers);
    for _ in 0..workers {
        let server = std::sync::Arc::clone(&server);
        let addr_str = std::sync::Arc::clone(&addr_str);
        handles.push(std::thread::spawn(move || {
            // `recv()` on a shared Server is the pool: whichever worker is free
            // takes the next request, so a long compile never blocks a spell
            // check behind it.
            while let Ok(request) = server.recv() {
                handle(request, &addr_str);
            }
        }));
    }
    for h in handles {
        let _ = h.join();
    }
}

/// The origins allowed to call this server.
///
/// The API used to answer every request with `Access-Control-Allow-Origin: *`,
/// which let any page you happened to have open POST to it while `ksav serve`
/// was running. It binds to loopback and holds no secrets, so the risk was
/// small — but "any website can drive your editor's compiler" is not a property
/// worth keeping. Only the app's own origin is allowed now, plus the Vite dev
/// server so `npm run dev` still works against a running engine.
fn allowed_origin(origin: &str, addr: &str) -> bool {
    let port = addr.rsplit(':').next().unwrap_or("7878");
    let mine = [
        format!("http://127.0.0.1:{port}"),
        format!("http://localhost:{port}"),
    ];
    const DEV_SERVERS: &[&str] = &[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
    ];
    mine.iter().any(|m| m == origin) || DEV_SERVERS.contains(&origin)
}

/// The CORS header for this request, or none when the caller is a stranger.
///
/// A same-origin fetch sends no `Origin` at all, so a missing header is fine and
/// simply needs no CORS response.
fn cors_header(request: &tiny_http::Request, addr: &str) -> Option<Header> {
    let origin = origin_of(request)?;
    allowed_origin(&origin, addr).then(|| header("Access-Control-Allow-Origin", &origin))
}

/// The `Origin` header, if the caller sent one.
fn origin_of(request: &tiny_http::Request) -> Option<String> {
    Some(
        request
            .headers()
            .iter()
            .find(|h| h.field.equiv("Origin"))?
            .value
            .as_str()
            .to_string(),
    )
}

/// May this caller reach a service at all?
///
/// A browser sends `Origin` on every cross-origin request and on same-origin
/// *writes*; `curl` and the Tauri shell send none. So an absent header is a
/// local tool and is allowed, and a present-but-foreign one is a page on some
/// other site driving this server — which is refused outright rather than being
/// served and then denied the reply.
fn origin_allowed(request: &tiny_http::Request, addr: &str) -> bool {
    origin_of(request).is_none_or(|o| allowed_origin(&o, addr))
}

/// Attach the CORS header when there is one to attach.
fn with_cors<R: std::io::Read>(resp: Response<R>, cors: Option<Header>) -> Response<R> {
    match cors {
        Some(h) => resp.with_header(h),
        None => resp,
    }
}

fn header(key: &str, value: &str) -> Header {
    Header::from_bytes(key.as_bytes(), value.as_bytes()).expect("valid header")
}

#[cfg(test)]
mod tests {
    use super::{
        allowed_origin, asset_path, compile_deadline, content_type_for, csp, policy_for,
        run_bounded, NO_UI_HTML,
    };
    use std::time::Duration;

    #[test]
    fn work_that_finishes_in_time_returns_its_result() {
        let json = run_bounded("hi".into(), Duration::from_secs(5), 16, |b| {
            format!("{{\"ok\":true,\"body\":\"{b}\"}}")
        });
        assert!(json.contains("\"ok\":true") && json.contains("hi"));
    }

    #[test]
    fn work_that_overruns_the_deadline_is_reported_not_awaited() {
        // The compute keeps running (Typst cannot be interrupted); what must not
        // happen is the caller waiting for it. The waiter returns a timeout
        // diagnostic promptly, and the background thread finishes on its own.
        let started = std::time::Instant::now();
        let json = run_bounded("x".into(), Duration::from_millis(100), 16, |_| {
            std::thread::sleep(Duration::from_millis(600));
            "\"never seen\"".into()
        });
        assert!(
            started.elapsed() < Duration::from_millis(400),
            "must not wait for the slow work"
        );
        assert!(
            json.contains("\"ok\":false"),
            "a timeout is a failed compile"
        );
        assert!(
            json.contains("ran longer than") && json.contains("abandoned"),
            "the diagnostic names the deadline and what became of the work: {json}"
        );
    }

    #[test]
    fn compiles_beyond_the_cap_are_refused_at_once() {
        // With no free slot a new compile is turned away immediately rather than
        // piling another thread onto a server already full of overran work.
        let json = run_bounded("x".into(), Duration::from_secs(5), 0, |_| unreachable!());
        assert!(json.contains("\"ok\":false") && json.contains("busy"));
    }

    /// The message must not claim the compile stopped, because it did not.
    ///
    /// `compile_with_deadline`'s own doc comment says *"the overran computation is
    /// not reclaimed"* and the sentence the writer read said *"was stopped"*. The
    /// abandoned work goes on running on a detached thread, holding one of
    /// `worker_count()` slots and burning a core — and the next compile after
    /// enough of these gets *"the server is busy"* for a reason these messages had
    /// denied. Two lines of one function disagreeing about what happened is worse
    /// than a bug, because it teaches the writer to stop reading.
    #[test]
    fn an_overran_compile_is_reported_as_abandoned_and_not_as_stopped() {
        let json = run_bounded("x".into(), Duration::from_millis(50), 16, |_| {
            std::thread::sleep(Duration::from_millis(400));
            "\"never seen\"".into()
        });
        assert!(
            !json.contains("was stopped") && !json.contains("הופסק"),
            "the compile was not stopped; it is still running: {json}"
        );
        assert!(
            json.contains("abandoned") && json.contains("ננטש"),
            "say what is true, in both languages: {json}"
        );
        assert!(
            json.contains("background") && json.contains("ברקע"),
            "and say where the work went: {json}"
        );
        // Wait for the abandoned thread, so the slot count is not left charged
        // against the next test in this process.
        std::thread::sleep(Duration::from_millis(450));
    }

    /// A refusal names how many are in flight, because that is the whole reason.
    ///
    /// *"The server is busy"* with no number is unfalsifiable to the person
    /// reading it: they cannot tell one slow document from eight abandoned ones.
    /// The count is the difference between a message and a fact.
    #[test]
    fn a_busy_refusal_says_how_many_are_in_flight() {
        let json = run_bounded("x".into(), Duration::from_secs(5), 0, |_| unreachable!());
        assert!(json.contains("busy"), "still says it is busy: {json}");
        // `IN_FLIGHT` is a process-wide static and these tests run in parallel, so
        // the numerator is whatever else is in the air right now. The denominator
        // is the cap this call was given, and that is the deterministic half.
        assert!(
            json.contains("/0 compiles in flight") && json.contains("/0 הידורים באוויר"),
            "the refusal names the slots: {json}"
        );
    }

    /// A state-changing service must not be reachable by a plain browser load.
    ///
    /// `/inbox` **drains**: it empties the waiting quotations and truncates the
    /// file behind them, so two windows asking do not each insert the same
    /// source. As a `GET` that made it forgeable by
    /// `<img src="http://localhost:7878/inbox">` on any page the writer had
    /// open — and an image load sends no `Origin`, so no CORS rule anywhere
    /// could have stopped it. The reply being unreadable was no consolation:
    /// the source was gone from disk either way.
    ///
    /// Asserted against the registry rather than against a running server,
    /// because the method *is* the fix and the registry is where it is declared.
    #[test]
    fn a_service_that_destroys_state_is_not_a_get() {
        let inbox = crate::services::find("inbox").expect("the inbox service exists");
        assert_eq!(
            inbox.method,
            crate::services::Method::Post,
            "draining the inbox is a write and must not be reachable as a GET"
        );
    }

    /// Refused, not merely denied the reply.
    ///
    /// Withholding `Access-Control-Allow-Origin` stops the *page* reading the
    /// answer and does nothing about the request having happened, which for
    /// anything that changes state is the whole of the damage.
    #[test]
    fn a_foreign_origin_is_refused_outright() {
        let addr = "127.0.0.1:7878";
        assert!(!allowed_origin("https://evil.example", addr));
        // And the absent-header case stays allowed, which is what keeps `curl`,
        // the Tauri shell and every same-origin read working.
        assert!(allowed_origin("http://127.0.0.1:7878", addr));
    }

    /// A cache-busted asset is the asset.
    ///
    /// `registerServiceWorker` asks for `sw.js?v=${CURRENT_VERSION}`, deliberately,
    /// so a release cannot serve itself the previous release's cache. This
    /// function used to hand `include_dir` the whole string, query and all,
    /// which matches no file — so the worker 404'd on every load, the
    /// registration's `.catch` swallowed it because offline support is a bonus,
    /// and **the PWA had never once installed under `ksav serve`**. Two correct
    /// decisions with a 404 between them, found by pointing a browser at the
    /// product and reading its console.
    #[test]
    fn an_asset_asked_for_with_a_query_is_still_that_asset() {
        assert_eq!(asset_path("/sw.js?v=0.1.0"), "sw.js");
        assert_eq!(
            asset_path("/assets/index-abc123.js?t=1"),
            "assets/index-abc123.js"
        );
        assert_eq!(asset_path("/sw.js"), "sw.js");
        // The root, however it is spelled, is the document.
        assert_eq!(asset_path("/"), "index.html");
        assert_eq!(asset_path("/?doc=1"), "index.html");
        assert_eq!(asset_path("/index.html"), "index.html");
        assert_eq!(asset_path("/index.html?v=2"), "index.html");
        // A fragment never reaches a server, but `#doc=` is how this app opens a
        // shared document, so a hand-typed one costs nothing to ignore.
        assert_eq!(asset_path("/icons/icon-128.png#x"), "icons/icon-128.png");
    }

    /// And the content type is read off the *file*, not off the query.
    ///
    /// The same bug had a second half: `content_type_for("sw.js?v=0.1.0")`
    /// rsplits on `.` and gets `js?v=0`, which matches no arm, so even a server
    /// that had found the file would have served the module as
    /// `application/octet-stream` — and a service worker with the wrong type is
    /// refused by the browser rather than run.
    #[test]
    fn the_content_type_comes_from_the_file_and_not_the_query() {
        assert_eq!(
            content_type_for(asset_path("/sw.js?v=0.1.0")),
            content_type_for("sw.js")
        );
        assert!(content_type_for(asset_path("/sw.js?v=0.1.0")).starts_with("text/javascript"));
    }

    #[test]
    fn the_deadline_defaults_when_the_env_is_absent() {
        std::env::remove_var("KSAV_COMPILE_TIMEOUT_MS");
        assert_eq!(compile_deadline(), Duration::from_millis(20_000));
    }

    #[test]
    fn only_the_app_and_dev_servers_may_call_the_api() {
        let addr = "127.0.0.1:7878";
        for ok in [
            "http://127.0.0.1:7878",
            "http://localhost:7878",
            "http://localhost:5173", // vite dev server
            "http://localhost:1420", // tauri dev server
        ] {
            assert!(allowed_origin(ok, addr), "{ok} should be allowed");
        }
        // Any page you happen to have open must not be able to drive the local
        // compiler just because `ksav serve` is running.
        for bad in [
            "https://evil.example",
            "http://127.0.0.1:9999",
            "http://localhost:7878.evil.example",
            "null",
            "",
        ] {
            assert!(!allowed_origin(bad, addr), "{bad} should be refused");
        }
    }

    #[test]
    fn the_allowed_origin_follows_the_port_the_server_bound() {
        assert!(allowed_origin("http://127.0.0.1:9000", "127.0.0.1:9000"));
        assert!(!allowed_origin("http://127.0.0.1:7878", "127.0.0.1:9000"));
    }

    // ------------------------------------------------ every page gets the policy
    //
    // The carve-out these replace: `serve_static` answered the fallback editor
    // with no `Content-Security-Policy` header, on purpose, because that page's
    // script was inline and `script-src 'self'` blocks inline script. So the one
    // build that serves documents written by other people had one response with
    // no policy on it, and a comment explaining that this was fine.
    //
    // It is a pair of facts, and both are asserted, because fixing either alone
    // puts it straight back: the page must have no inline script, and the
    // response for a page must carry the policy.

    #[test]
    fn every_html_response_carries_the_policy() {
        assert_eq!(policy_for(content_type_for("index.html")), Some(csp()));
        assert_eq!(policy_for(content_type_for("anything.html")), Some(csp()));
    }

    #[test]
    fn the_policy_goes_only_where_it_governs_something() {
        // Not tidiness. A header that governs nothing, attached everywhere, is
        // how the three copies of this policy got to disagree without anybody
        // noticing which one was doing any work.
        for asset in [
            "editor.js",
            "a.css",
            "a.svg",
            "a.woff2",
            "a.png",
            "a.webmanifest",
        ] {
            assert_eq!(
                policy_for(content_type_for(asset)),
                None,
                "{asset} is not a document and a policy on it governs nothing"
            );
        }
    }

    /// The no-UI page needs nothing the policy refuses.
    ///
    /// It replaces a 232-line second editor (see `serve_static`), and it keeps
    /// the one property that page was tested for: `script-src 'self'` and
    /// `style-src 'self'` block an inline `<script>` or `<style>` outright, and
    /// the previous version of this page was served with **no policy at all**
    /// to work around exactly that. A page with nothing to execute cannot
    /// reintroduce the exemption.
    #[test]
    fn the_no_ui_page_has_nothing_to_execute() {
        assert!(!NO_UI_HTML.contains("<script"), "the no-UI page must not script");
        assert!(!NO_UI_HTML.contains("<style"), "the no-UI page must not style");
        assert!(!NO_UI_HTML.contains("javascript:"));
        // It is worth its bytes only if it says what to do about it.
        assert!(NO_UI_HTML.contains("npm run build"));
        assert!(NO_UI_HTML.contains("--features embed-ui"));
    }

}

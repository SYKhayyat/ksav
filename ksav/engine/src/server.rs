//! Minimal local HTTP API for the Ksav editor.
//!
//! - `GET  /`        → the two-panel web editor (bundled at build time)
//! - `POST /compile` → JSON `{body, font, size_pt, margin_cm, dir}` in,
//!   JSON `{ok, pages_svg, pdf_base64, diagnostics}` out.
//!
//! This is exactly the backend a Tauri or browser front end talks to; the
//! native shell can be wrapped around it later without touching this contract.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use tiny_http::{Header, Method, Response, Server};

/// Fallback single-file editor, used when the `embed-ui` feature is off.
const INDEX_HTML: &str = include_str!("../web/index.html");

/// Content-Security-Policy for the served editor.
///
/// The engine's output becomes HTML in the browser (per-page SVG assigned to
/// `innerHTML`), and `ksav serve` had no CSP at all — so a document arriving from
/// someone else ran with no second line of defence. This is the same policy the
/// Tauri build enforces and the built SPA carries as a `<meta>` tag; setting it as
/// a header too covers the fallback single-file editor, which is not the built
/// bundle. `wasm-unsafe-eval` is harmless here and kept so the one string matches.
#[cfg_attr(not(feature = "embed-ui"), allow(dead_code))]
const CSP: &str = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; \
     img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; \
     worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

/// The full built SPA (ksav/app/dist), embedded when `embed-ui` is enabled.
#[cfg(feature = "embed-ui")]
static UI: include_dir::Dir<'_> = include_dir::include_dir!("$CARGO_MANIFEST_DIR/../app/dist");

#[cfg_attr(not(feature = "embed-ui"), allow(dead_code))]
fn content_type_for(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("json") => "application/json; charset=utf-8",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        _ => "application/octet-stream",
    }
}

/// Serve a static asset for a GET request. Returns true if it was handled.
fn serve_static(request: tiny_http::Request, url: &str) {
    let rel = if url == "/" || url == "/index.html" {
        "index.html"
    } else {
        url.trim_start_matches('/')
    };

    #[cfg(feature = "embed-ui")]
    {
        if let Some(file) = UI.get_file(rel) {
            let mut resp = Response::from_data(file.contents())
                .with_header(header("Content-Type", content_type_for(rel)));
            // The document itself carries the policy; a header is ignored on the
            // other asset types, so attaching it only to HTML keeps it meaningful.
            if rel.ends_with(".html") {
                resp = resp.with_header(header("Content-Security-Policy", CSP));
            }
            let _ = request.respond(resp);
            return;
        }
    }

    // Fallback: the bundled single-file editor at the root.
    //
    // No CSP header here on purpose: this minimal editor is a single self-contained
    // file with an inline <script>, which `script-src 'self'` would block outright.
    // It exists only when the `embed-ui` feature is off — a lean dev build, not the
    // shipping server, which embeds the built SPA and gets the policy above.
    if rel == "index.html" {
        let resp = Response::from_string(INDEX_HTML)
            .with_header(header("Content-Type", "text/html; charset=utf-8"));
        let _ = request.respond(resp);
        return;
    }

    let _ = request.respond(Response::from_string("not found").with_status_code(404));
}

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

fn error_json(message: &str) -> String {
    serde_json::json!({
        "ok": false,
        "pages_svg": [],
        "pdf_base64": serde_json::Value::Null,
        "diagnostics": [{ "severity": "error", "message": message }],
        "typst_source": "",
    })
    .to_string()
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
fn compile_with_deadline(body: &str) -> String {
    run_bounded(body.to_string(), compile_deadline(), worker_count(), |b| {
        crate::compile_request(&b)
    })
}

/// A jump costs a full layout, so it goes through the same door.
///
/// Both directions between the source and the page have to lay the document out
/// to answer at all — that is what makes the answer exact instead of a guess —
/// which means a document that takes eleven seconds to compile takes eleven
/// seconds to click on. Letting these bypass the cap would mean a writer
/// clicking repeatedly on a slow document could pile up unbounded layouts that
/// the compile path is carefully arranged to prevent.
///
/// A refusal or a timeout comes back as `error_json`, which carries no `line`
/// and no `points`, so the client reads it as "no answer" and leaves the cursor
/// alone. That is the right behaviour for a busy server and also for a click on
/// a page margin, which keeps the client from having to tell them apart.
fn jump_with_deadline(body: &str) -> String {
    run_bounded(body.to_string(), compile_deadline(), worker_count(), |b| {
        crate::jump::jump_request(&b)
    })
}

fn reveal_with_deadline(body: &str) -> String {
    run_bounded(body.to_string(), compile_deadline(), worker_count(), |b| {
        crate::jump::reveal_request(&b)
    })
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

/// Handle one request. Runs on a worker thread.
fn handle(mut request: tiny_http::Request, addr_str: &str) {
    let method = request.method().clone();
    let url = request.url().to_string();
    // A JSON endpoint that reads a body: check the size before doing any work.
    let post = |request: &mut tiny_http::Request, f: fn(&str) -> String| match read_body(request) {
        Ok(body) => f(&body),
        Err(e) => error_json(&e),
    };
    match (method, url.as_str()) {
        (Method::Post, "/compile") => {
            let cors = cors_header(&request, addr_str);
            let json = post(&mut request, compile_with_deadline);
            let _ = request.respond(with_cors(json_response(json), cors));
        }
        // Inverse search: a click on the page, as a place in the source.
        (Method::Post, "/jump") => {
            let cors = cors_header(&request, addr_str);
            let json = post(&mut request, jump_with_deadline);
            let _ = request.respond(with_cors(json_response(json), cors));
        }
        // Forward search: the cursor, as a place on the page.
        (Method::Post, "/reveal") => {
            let cors = cors_header(&request, addr_str);
            let json = post(&mut request, reveal_with_deadline);
            let _ = request.respond(with_cors(json_response(json), cors));
        }
        (Method::Post, "/spell") => {
            let cors = cors_header(&request, addr_str);
            let json = post(&mut request, crate::spell::spell_request);
            let _ = request.respond(with_cors(json_response(json), cors));
        }
        (Method::Post, "/suggest") => {
            let cors = cors_header(&request, addr_str);
            let json = post(&mut request, crate::spell::suggest_request);
            let _ = request.respond(with_cors(json_response(json), cors));
        }
        (Method::Get, "/commands") => {
            let cors = cors_header(&request, addr_str);
            let resp = json_response(crate::commands::commands_json());
            let _ = request.respond(with_cors(resp, cors));
        }
        // Sources that arrived from Girsa over the loopback and are waiting
        // for a cursor. Drained, not read — see `crate::post`.
        (Method::Get, "/inbox") => {
            let cors = cors_header(&request, addr_str);
            let resp = json_response(crate::post::drain_json());
            let _ = request.respond(with_cors(resp, cors));
        }
        // Cite-on-selection (W18): the editor asks, this forwards to Girsa,
        // and what comes back is Girsa's answer unchanged.
        (Method::Post, "/mekoros") => {
            let cors = cors_header(&request, addr_str);
            let json = post(&mut request, mekoros_request);
            let _ = request.respond(with_cors(json_response(json), cors));
        }
        // Linkify (W19): Girsa finds the citations, this rewrites them.
        (Method::Post, "/linkify") => {
            let cors = cors_header(&request, addr_str);
            let json = post(&mut request, linkify_request);
            let _ = request.respond(with_cors(json_response(json), cors));
        }
        // The sefer catalogue, for the editor's citation autocomplete. The same
        // list the source index sorts by, so what the editor offers and what the
        // index files it under can never be two different opinions.
        (Method::Get, "/sefarim") => {
            let cors = cors_header(&request, addr_str);
            let resp = json_response(crate::sefarim::catalog_json());
            let _ = request.respond(with_cors(resp, cors));
        }
        (Method::Get, "/templates") => {
            let cors = cors_header(&request, addr_str);
            let resp = json_response(crate::templates::templates_json());
            let _ = request.respond(with_cors(resp, cors));
        }
        (Method::Options, _) => {
            let cors = cors_header(&request, addr_str);
            let resp = Response::empty(204)
                .with_header(header("Access-Control-Allow-Methods", "POST, GET, OPTIONS"))
                .with_header(header("Access-Control-Allow-Headers", "Content-Type"));
            let _ = request.respond(with_cors(resp, cors));
        }
        (Method::Get, _) => serve_static(request, &url),
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

/// `{"phrase": "…", "except": null, "search": false}` → Girsa's answer.
fn mekoros_request(body: &str) -> String {
    #[derive(serde::Deserialize)]
    struct Asked {
        phrase: String,
        #[serde(default)]
        except: Option<String>,
        /// Ask Girsa to open its search on this phrase instead of answering.
        #[serde(default)]
        search: bool,
    }
    let Ok(asked) = serde_json::from_str::<Asked>(body) else {
        return error_json(
            "הבקשה אינה מכילה ביטוי לחיפוש · the request carries no phrase to look for",
        );
    };
    if asked.search {
        return match crate::post::search_in_girsa(&asked.phrase) {
            Ok(()) => r#"{"opened":true}"#.to_string(),
            Err(why) => error_json(&why),
        };
    }
    match crate::post::where_from(&asked.phrase, asked.except.as_deref()) {
        Ok(answer) => answer,
        Err(why) => error_json(&why),
    }
}

/// `{"text": "…"}` → `{"text": "…with the citations live…"}`.
fn linkify_request(body: &str) -> String {
    #[derive(serde::Deserialize)]
    struct Asked {
        text: String,
    }
    let Ok(asked) = serde_json::from_str::<Asked>(body) else {
        return error_json("הבקשה אינה מכילה טקסט לסימון · the request carries no text to mark up");
    };
    match crate::post::linkify(&asked.text) {
        Ok(text) => serde_json::json!({ "text": text }).to_string(),
        Err(why) => error_json(&why),
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
    let origin = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Origin"))?
        .value
        .as_str()
        .to_string();
    allowed_origin(&origin, addr).then(|| header("Access-Control-Allow-Origin", &origin))
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
    use super::{allowed_origin, compile_deadline, run_bounded};
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
}

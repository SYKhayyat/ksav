//! Minimal local HTTP API for the Ksav editor.
//!
//! - `GET  /`        → the two-panel web editor (bundled at build time)
//! - `POST /compile` → JSON `{body, font, size_pt, margin_cm, dir}` in,
//!   JSON `{ok, pages_svg, pdf_base64, diagnostics}` out.
//!
//! This is exactly the backend a Tauri or browser front end talks to; the
//! native shell can be wrapped around it later without touching this contract.

use tiny_http::{Header, Method, Response, Server};

/// Fallback single-file editor, used when the `embed-ui` feature is off.
const INDEX_HTML: &str = include_str!("../web/index.html");

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
            let resp = Response::from_data(file.contents())
                .with_header(header("Content-Type", content_type_for(rel)));
            let _ = request.respond(resp);
            return;
        }
    }

    // Fallback: the bundled single-file editor at the root.
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
            let json = post(&mut request, crate::compile_request);
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
    use super::allowed_origin;

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

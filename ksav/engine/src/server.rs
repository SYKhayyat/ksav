//! Minimal local HTTP API for the Ksav editor.
//!
//! - `GET  /`        → the two-panel web editor (bundled at build time)
//! - `POST /compile` → JSON `{body, font, size_pt, margin_cm, dir}` in,
//!                     JSON `{ok, pages_svg, pdf_base64, diagnostics}` out.
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

pub fn serve(addr: &str) {
    let server = match Server::http(addr) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot bind {addr}: {e}");
            std::process::exit(1);
        }
    };
    println!("Ksav editor serving on http://{addr}");
    let addr_str = addr.to_string();

    for mut request in server.incoming_requests() {
        let method = request.method().clone();
        let url = request.url().to_string();
        match (method, url.as_str()) {
            (Method::Post, "/compile") => {
                let cors = cors_header(&request, &addr_str);
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                let json = handle_compile(&body);
                let resp = Response::from_string(json)
                    .with_header(header("Content-Type", "application/json; charset=utf-8"));
                let _ = request.respond(with_cors(resp, cors));
            }
            (Method::Post, "/spell") => {
                let cors = cors_header(&request, &addr_str);
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                let json = crate::spell::spell_request(&body);
                let resp = Response::from_string(json)
                    .with_header(header("Content-Type", "application/json; charset=utf-8"));
                let _ = request.respond(with_cors(resp, cors));
            }
            (Method::Post, "/suggest") => {
                let cors = cors_header(&request, &addr_str);
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                let json = crate::spell::suggest_request(&body);
                let resp = Response::from_string(json)
                    .with_header(header("Content-Type", "application/json; charset=utf-8"));
                let _ = request.respond(with_cors(resp, cors));
            }
            (Method::Get, "/commands") => {
                let cors = cors_header(&request, &addr_str);
                let resp = Response::from_string(crate::commands::commands_json())
                    .with_header(header("Content-Type", "application/json; charset=utf-8"));
                let _ = request.respond(with_cors(resp, cors));
            }
            (Method::Get, "/templates") => {
                let cors = cors_header(&request, &addr_str);
                let resp = Response::from_string(crate::templates::templates_json())
                    .with_header(header("Content-Type", "application/json; charset=utf-8"));
                let _ = request.respond(with_cors(resp, cors));
            }
            (Method::Options, _) => {
                let cors = cors_header(&request, &addr_str);
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

fn handle_compile(body_json: &str) -> String {
    crate::compile_request(body_json)
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

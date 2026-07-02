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

    for mut request in server.incoming_requests() {
        let method = request.method().clone();
        let url = request.url().to_string();
        match (method, url.as_str()) {
            (Method::Post, "/compile") => {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                let json = handle_compile(&body);
                let resp = Response::from_string(json)
                    .with_header(header("Content-Type", "application/json; charset=utf-8"))
                    .with_header(header("Access-Control-Allow-Origin", "*"));
                let _ = request.respond(resp);
            }
            (Method::Get, "/commands") => {
                let resp = Response::from_string(crate::commands::commands_json())
                    .with_header(header("Content-Type", "application/json; charset=utf-8"))
                    .with_header(header("Access-Control-Allow-Origin", "*"));
                let _ = request.respond(resp);
            }
            (Method::Get, "/templates") => {
                let resp = Response::from_string(crate::templates::templates_json())
                    .with_header(header("Content-Type", "application/json; charset=utf-8"))
                    .with_header(header("Access-Control-Allow-Origin", "*"));
                let _ = request.respond(resp);
            }
            (Method::Options, _) => {
                let resp = Response::empty(204)
                    .with_header(header("Access-Control-Allow-Origin", "*"))
                    .with_header(header("Access-Control-Allow-Methods", "POST, GET, OPTIONS"))
                    .with_header(header("Access-Control-Allow-Headers", "Content-Type"));
                let _ = request.respond(resp);
            }
            (Method::Get, _) => serve_static(request, &url),
            _ => {
                let _ = request.respond(Response::from_string("not found").with_status_code(404));
            }
        }
    }
}

fn header(key: &str, value: &str) -> Header {
    Header::from_bytes(key.as_bytes(), value.as_bytes()).expect("valid header")
}

fn handle_compile(body_json: &str) -> String {
    crate::compile_request(body_json)
}

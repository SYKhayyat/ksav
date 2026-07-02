//! Minimal local HTTP API for the Ksav editor.
//!
//! - `GET  /`        → the two-panel web editor (bundled at build time)
//! - `POST /compile` → JSON `{body, font, size_pt, margin_cm, dir}` in,
//!                     JSON `{ok, pages_svg, pdf_base64, diagnostics}` out.
//!
//! This is exactly the backend a Tauri or browser front end talks to; the
//! native shell can be wrapped around it later without touching this contract.

use base64::Engine as _;
use tiny_http::{Header, Method, Response, Server};

use crate::{compile, DocConfig};

const INDEX_HTML: &str = include_str!("../web/index.html");

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
            (Method::Get, "/") | (Method::Get, "/index.html") => {
                let resp = Response::from_string(INDEX_HTML)
                    .with_header(header("Content-Type", "text/html; charset=utf-8"));
                let _ = request.respond(resp);
            }
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
    let v: serde_json::Value = serde_json::from_str(body_json).unwrap_or(serde_json::Value::Null);
    let src = v.get("body").and_then(|x| x.as_str()).unwrap_or("");

    let mut cfg = DocConfig::default();
    if let Some(f) = v.get("font").and_then(|x| x.as_str()) {
        if !f.is_empty() {
            cfg.font = f.to_string();
        }
    }
    if let Some(s) = v.get("size_pt").and_then(|x| x.as_f64()) {
        cfg.size_pt = s;
    }
    if let Some(m) = v.get("margin_cm").and_then(|x| x.as_f64()) {
        cfg.margin_cm = m;
    }
    if let Some(d) = v.get("dir").and_then(|x| x.as_str()) {
        cfg.dir = d.to_string();
    }
    if let Some(n) = v.get("numbering").and_then(|x| x.as_bool()) {
        cfg.numbering = n;
    }
    if let Some(j) = v.get("justify").and_then(|x| x.as_bool()) {
        cfg.justify = j;
    }
    if let Some(l) = v.get("line_spacing_em").and_then(|x| x.as_f64()) {
        cfg.line_spacing_em = l;
    }
    if let Some(c) = v.get("columns").and_then(|x| x.as_u64()) {
        cfg.columns = c as u32;
    }

    let result = compile(src, &cfg);
    let diags: Vec<serde_json::Value> = result
        .diagnostics
        .iter()
        .map(|d| serde_json::json!({ "severity": d.severity, "message": d.message }))
        .collect();
    let pdf_b64 = result
        .pdf
        .as_ref()
        .map(|p| base64::engine::general_purpose::STANDARD.encode(p));

    serde_json::json!({
        "ok": result.ok(),
        "pages_svg": result.pages_svg,
        "pdf_base64": pdf_b64,
        "diagnostics": diags,
        "typst_source": result.typst_source,
    })
    .to_string()
}

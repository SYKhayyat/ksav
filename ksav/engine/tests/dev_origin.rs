//! The dev origin the server allows is the dev origin the app is served from.
//!
//! # The finding (#111)
//!
//! `allowed_origin`'s dev list was a closed `const` and carried
//! `http://localhost:1420` / `http://127.0.0.1:1420` — Tauri 1's dev port, dead
//! in this repository. Three occurrences of `1420` existed: the two list
//! entries and the test that asserted the list contained them. So the test
//! asserted the list was **unchanged**, not that it was **right**, and a stale
//! entry survived indefinitely behind a green check.
//!
//! The same concept was stated three more times: `vite.config.ts`'s
//! `server.port`, `tauri.conf.json`'s `devUrl`, and the engine's allowlist.
//! This file holds them together and refuses a fourth statement of the same
//! number.
//!
//! ## What "nothing produces it" means here
//!
//! A port in the allowlist is legitimate only if something in the repository
//! actually serves from it. The files that do are `vite.config.ts` and
//! `tauri.conf.json`; a port that appears in neither is an entry no browser can
//! originate from — dead weight that reads as configuration. The sweep asserts
//! that every port the engine allows is produced by one of them.

use std::fs;
use std::path::{Path, PathBuf};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("the engine lives at ksav/engine")
        .to_path_buf()
}

fn app() -> PathBuf {
    root().join("ksav").join("app")
}

/// The port in `tauri.conf.json`'s `devUrl`.
fn dev_url_port() -> u16 {
    let conf = fs::read_to_string(app().join("src-tauri").join("tauri.conf.json"))
        .expect("tauri.conf.json is readable");
    let at = conf
        .find("\"devUrl\"")
        .expect("tauri.conf.json declares a devUrl");
    let rest = &conf[at..];
    let value_at = rest.find("http").expect("the devUrl is a URL");
    let value = &rest[value_at..];
    let value = &value[..value.find('"').expect("the URL is quoted")];
    let port = value.rsplit(':').next().unwrap_or_default();
    port.parse::<u16>()
        .unwrap_or_else(|_| panic!("the devUrl names a port: {value}"))
}

/// The port in `vite.config.ts`'s `server.port`.
fn vite_port() -> u16 {
    let conf =
        fs::read_to_string(app().join("vite.config.ts")).expect("vite.config.ts is readable");
    let at = conf
        .find("port:")
        .expect("vite.config.ts sets a server port");
    let rest = conf[at + "port:".len()..].trim_start();
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits
        .parse::<u16>()
        .unwrap_or_else(|_| panic!("the vite port is a number, not {digits:?}"))
}

/// The three statements of the dev origin agree.
#[test]
fn the_engine_allows_the_origin_the_app_is_served_from() {
    let dev = ksav_engine::server::dev_origins();
    let port = ksav_engine::server::DEV_PORT;

    assert_eq!(
        dev_url_port(),
        port,
        "tauri.conf.json's devUrl and the engine's allowlist name different \
         ports (#111): the shell would load a page the engine refuses"
    );
    assert_eq!(
        vite_port(),
        port,
        "vite's server.port and the engine's allowlist name different ports: \
         `npm run dev` serves an origin every API call is refused from"
    );
    assert!(
        dev.iter().any(|d| d == &format!("http://localhost:{port}")),
        "the allowlist spells the dev origin as `localhost`, which is what \
         `devUrl` says: {dev:?}"
    );
    assert!(
        dev.iter().any(|d| d == &format!("http://127.0.0.1:{port}")),
        "and as `127.0.0.1`, because a browser can reach the dev server either \
         way: {dev:?}"
    );
}

/// Every allowed dev port is one the repository actually serves.
///
/// The stale entry this file was written for: `1420` appeared in the allowlist
/// and nowhere else. A port nothing produces cannot be an origin any browser
/// uses, so it is configuration that describes a deployment that does not
/// exist — and the test that asserted its presence made it look supported.
#[test]
fn no_allowed_dev_port_is_one_nothing_produces() {
    let produced = [
        fs::read_to_string(app().join("vite.config.ts")).expect("vite.config.ts"),
        fs::read_to_string(app().join("src-tauri").join("tauri.conf.json"))
            .expect("tauri.conf.json"),
    ]
    .join("\n");

    let mut dead = Vec::new();
    for origin in ksav_engine::server::dev_origins() {
        let port = origin.rsplit(':').next().unwrap_or_default().to_string();
        if !produced.contains(&port) {
            dead.push(format!("{origin} (port {port} appears in no app file)"));
        }
    }
    assert!(
        dead.is_empty(),
        "the engine allows a dev origin nothing in the repository produces, so \
         it can only ever be dead configuration (#111):\n  {}",
        dead.join("\n  ")
    );
}

/// The removed Tauri 1 entries stay removed.
#[test]
fn the_tauri_one_dev_port_is_not_allowed_any_more() {
    for gone in ["http://localhost:1420", "http://127.0.0.1:1420"] {
        assert!(
            !ksav_engine::server::dev_origins().iter().any(|d| d == gone),
            "{gone} is Tauri 1's dev port and this repository has not used it \
             since; allowing it is a list entry no browser can originate from"
        );
    }
}

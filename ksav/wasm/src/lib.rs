//! WebAssembly binding for the Ksav engine.
//!
//! Exposes the same JSON contract as the HTTP server, so the SPA can run the
//! real Typst compiler entirely in the browser with no server.

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Compile a document. Input/output JSON match the server's `/compile`.
#[wasm_bindgen]
pub fn ksav_compile(input_json: &str) -> String {
    ksav_engine::compile_request(input_json)
}

/// A click on the page, as a place in the source (same as the server's `/jump`).
#[wasm_bindgen]
pub fn ksav_jump(input_json: &str) -> String {
    ksav_engine::jump::jump_request(input_json)
}

/// The cursor, as a place on the page (same as the server's `/reveal`).
#[wasm_bindgen]
pub fn ksav_reveal(input_json: &str) -> String {
    ksav_engine::jump::reveal_request(input_json)
}

/// The command registry as JSON (same as the server's `/commands`).
#[wasm_bindgen]
pub fn ksav_commands() -> String {
    ksav_engine::commands::commands_json()
}

/// The template registry as JSON (same as the server's `/templates`).
#[wasm_bindgen]
pub fn ksav_templates() -> String {
    ksav_engine::templates::templates_json()
}

/// The sefer catalogue as JSON (same as the server's `/sefarim`).
#[wasm_bindgen]
pub fn ksav_sefarim() -> String {
    ksav_engine::sefarim::catalog_json()
}

/// Spell-check text (same as the server's `/spell`).
#[wasm_bindgen]
pub fn ksav_spell(input_json: &str) -> String {
    ksav_engine::spell::spell_request(input_json)
}

/// Suggestions for one word (same as the server's `/suggest`).
#[wasm_bindgen]
pub fn ksav_suggest(input_json: &str) -> String {
    ksav_engine::spell::suggest_request(input_json)
}

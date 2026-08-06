//! WebAssembly binding for the Ksav engine.
//!
//! Exposes the same JSON contract as the HTTP server, so the SPA can run the
//! real Typst compiler entirely in the browser with no server.
//!
//! # One export
//!
//! This file used to carry one `#[wasm_bindgen]` function per service, and the
//! worker on the other side carried a matching table of them. Keeping two
//! hand-written lists in step across a binary boundary went exactly as well as
//! it sounds: `ksav_sefarim` was added here and never added to the worker's
//! table, so the lookup produced `undefined`, the call threw, `sefarim.ts`
//! caught it, and citation autocomplete was dead in the offline build with
//! nothing anywhere saying so. `tsc` could not see it either — the worker's
//! dispatch took a `string`.
//!
//! So there is one export and no list. The name is looked up in
//! `ksav_engine::services`, which is the same registry the HTTP server routes
//! from and the desktop shell invokes through, and the only thing that produces
//! those names on the JavaScript side is `app/src/services.gen.ts`, generated
//! from that same table. A service reaches the browser build by existing.

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Call an engine service by name. JSON in, JSON out — the same contract as the
/// server's route of the same name.
///
/// An unknown name comes back as a failed-call JSON object rather than a panic:
/// a panic in wasm poisons the module for the rest of the session, and the
/// editor would lose its compiler over a typo in a call it should not have been
/// able to make.
#[wasm_bindgen]
pub fn ksav_call(name: &str, input_json: &str) -> String {
    ksav_engine::services::call(name, input_json)
}

/// Every service this build can answer, as JSON — name, method, path, cost and
/// whether it needs the installed application beside Girsa.
///
/// Not used by the editor, which reads the generated TypeScript table at build
/// time. It is here so the module can be *asked* what it holds: the smoke test
/// in CI drives every service the engine claims rather than a list of names
/// somebody typed into the test, which is the same mistake one layer up.
#[wasm_bindgen]
pub fn ksav_services() -> String {
    ksav_engine::services::services_json()
}

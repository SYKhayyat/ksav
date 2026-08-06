//! The desktop build, plus the one thing it is uniquely able to check.
//!
//! Tauri's Content-Security-Policy has to be a literal inside
//! `tauri.conf.json` — it is read by Tauri's own config loader long before any
//! of our code runs, so it cannot be a `readFileSync` the way Vite's copy is or
//! an `include_str!` the way the server's is. That is the entire reason a second
//! copy of the policy is allowed to exist.
//!
//! It is not a reason for the two copies to *differ*, and they did: only Vite's
//! copy allowed `https://api.github.com`, and Tauri's was missing `worker-src`
//! outright. Because a browser **intersects** every policy delivered to a
//! document rather than letting the last one win, the narrowest copy silently
//! decided the answer — which is how the update check, whose whole purpose is
//! that an installed Ksav can learn a newer one exists, came to be dead in both
//! builds that ship an installer and alive only in the one you update by
//! pressing reload.
//!
//! `vite.config.ts` carried a comment asserting the copies were the same policy.
//! This is that comment, rewritten as something that fails.

use std::path::Path;

fn main() {
    let here = Path::new(env!("CARGO_MANIFEST_DIR"));
    let policy = here.join("../../policy/csp.txt");
    let conf = here.join("tauri.conf.json");

    // Both are build inputs now: change either and this runs again.
    println!("cargo:rerun-if-changed={}", policy.display());
    println!("cargo:rerun-if-changed={}", conf.display());

    let want = std::fs::read_to_string(&policy)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", policy.display()));
    let want = want.trim();

    let text = std::fs::read_to_string(&conf)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", conf.display()));
    let json: serde_json::Value = serde_json::from_str(&text)
        .unwrap_or_else(|e| panic!("{} is not valid JSON: {e}", conf.display()));
    let have = json["app"]["security"]["csp"]
        .as_str()
        .unwrap_or_else(|| panic!("{} has no app.security.csp", conf.display()));

    assert!(
        have == want,
        "the desktop app would deliver a different Content-Security-Policy than \
         ksav/policy/csp.txt.\n\
         \n  tauri.conf.json: {have}\n  policy/csp.txt:  {want}\n\n\
         Policies delivered to one document are intersected, not overridden, so \
         the narrower of the two decides — silently. Copy the policy file's line \
         into app.security.csp, or change the policy file if the change is meant."
    );

    tauri_build::build()
}

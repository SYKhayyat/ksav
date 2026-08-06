//! One job: turn a fresh clone's `--features embed-ui` failure into a sentence.
//!
//! `server.rs` embeds the built SPA with
//! `include_dir!("$CARGO_MANIFEST_DIR/../app/dist")`. `dist/` is git-ignored —
//! correctly, it is build output — so on a clone it does not exist, and the
//! macro fails inside the expansion with a message about a directory rather than
//! about the step that was skipped. That command is the *first* one the root
//! README gives, so it is the first thing a new reader runs.
//!
//! This is the second half of the same finding as the shared crates above it in
//! `Cargo.toml`: the repository did not build from a clone, and nothing said
//! why. A path dependency to a sibling checkout was the reason `cargo build`
//! failed; this is the reason `cargo build --features embed-ui` still would.

use std::path::Path;

fn main() {
    // Only the embedding build needs the SPA. `cargo test`, `cargo clippy` and a
    // plain `cargo run -- serve` do not, and must not be made to.
    if std::env::var_os("CARGO_FEATURE_EMBED_UI").is_none() {
        return;
    }

    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("cargo sets this");
    let dist = Path::new(&manifest).join("..").join("app").join("dist");

    // `index.html` and not the directory: a `dist/` left behind by an
    // interrupted build is the case where the macro's own error is least
    // legible.
    if !dist.join("index.html").exists() {
        println!("cargo:warning=");
        println!("cargo:warning=The `embed-ui` feature embeds the built editor, and it has not been built.");
        println!("cargo:warning=");
        println!("cargo:warning=    cd ksav/app && npm install && npm run build");
        println!("cargo:warning=");
        println!(
            "cargo:warning=Then run this command again. (`cargo run -- serve` without the feature"
        );
        println!("cargo:warning=works with no build step; it serves the fallback editor instead.)");
        panic!("ksav/app/dist is missing — build the editor first (see the messages above)");
    }

    // Rebuild the embedding when the editor is rebuilt. Without this, `npm run
    // build` followed by `cargo build --features embed-ui` can ship the previous
    // SPA: cargo has no other reason to think anything changed.
    println!("cargo:rerun-if-changed={}", dist.display());
}

//! Ksav engine — compiles Hebrew "Ksav" markup into real Typst output.
//!
//! The Hebrew commands are *actual Typst functions* defined in `typst/ksav.typ`.
//! We hand Typst a two-line document — an `#import` of that prelude and a
//! `#show: מסמך.with(...)` wrapper driven by the editor settings — with the
//! writer's text after it, and run the genuine Typst compiler to produce a PDF
//! and per-page SVG previews.
//!
//! The prelude is a **resolved file** rather than a prefix, which is a change
//! worth naming here because everything downstream is shaped by it: see
//! [`prelude_source`] for what it replaced and [`main_source`] for what is left.
//! "Export .typ" still inlines it — [`assemble_source`] — because a file a
//! writer takes elsewhere has to stand on its own.

use assets::Assets;
use diagnostics::Located;
use typst_layout::PagedDocument;

pub mod assets;
/// #79 — a stream in the page body, laid out beside the text as its own document
/// and composited onto the sheet by index.
pub mod bodystream;
/// Reading the Source Packet Girsa put on the clipboard — the other end of
/// spec.md §10.2's Ctrl+C, which had a careful producer and no consumer.
#[cfg(not(target_arch = "wasm32"))]
pub mod clipboard;
pub mod commands;
/// The document's settings: what the writer chose, and what a request may ask
/// for, with the refusals it records rather than clamping.
pub mod config;
pub mod diagnostics;
/// What is actually inside a `.ksav` file — plain text, or the JSON wrapper the
/// editor writes for a document carrying images, page setup or its own commands.
/// Every client that is not the browser used to assume the first.
pub mod docfile;
/// Somebody else's text, put into Typst markup. One string-literal escaper and
/// one content escaper, for the four and two copies there used to be.
pub mod escape;
/// A page's geometry: paper sizes, lengths, and the note reservoir's arithmetic.
pub mod geometry;
/// The prelude's language knowledge: what the engine hands Typst, and what a
/// document calls.
pub mod lang;
/// The compile pipeline: the Typst world, the layout, and the pages written
/// from it. `#218`'s curve and `#219`'s pane costs are this module's territory.
pub mod layout;
/// A body's shape, judged before it is laid out — the bracket ceilings `#213`
/// measured, and the sentences a document past them is refused with.
pub mod shape;
/// The wire: the JSON a caller sends and the JSON it is answered with.
pub mod wire;

// ----------------------------------------------------------------- the surface
//
// `#222` cut this file into `config`, `geometry`, `lang`, `layout` and `wire`, and
// the **paths did not move**: everything that was `ksav_engine::compile_doc` is
// still `ksav_engine::compile_doc`. A caller reading the crate's API cannot tell
// which module a name lives in, which is the point of a split — the modules are
// for whoever edits the engine, not for whoever uses it.
//
// The `pub(crate)` re-exports are the same arrangement one visibility down: the
// internal helpers reach each other by the names they had, so a cut never became
// a rename.
pub(crate) use config::*;
pub use config::{
    effective_lang, sanitize_head_align, sanitize_text_align, DocConfig, PAPER_ALIASES,
};
pub use geometry::{
    auto_notes_region_cm, auto_notes_region_cm_on, auto_notes_region_cm_sheet, paper_css,
    paper_size_cm, paper_width_cm_typst, PAPERS,
};
pub use lang::prelude::{
    assemble_source, local_packages_root, main_source, package_resolvers, packages_root,
    set_local_packages_root, span_line, PRELUDE_PATH,
};
pub use layout::{
    compile, compile_companion, compile_doc, compile_doc_with, compile_parts, compile_with,
    Compiled, Wants,
};
pub use wire::{assemble_request, compile_html, compile_request, with_document_direction};

pub(crate) use geometry::*;
pub(crate) use layout::*;
// The prelude's own helpers and the syntax-tree walk are reached from `layout`,
// `wire` and the unit tests; nothing in this file calls them itself.
#[allow(unused_imports)]
pub(crate) use lang::commands::*;
#[allow(unused_imports)]
pub(crate) use lang::prelude::*;
/// The tables the app generates its own copies from, as serialised values
/// rather than as Rust source text for a regex to pick at.
pub mod facts;
/// Version control for a sefer, on the git that is already on the machine.
/// Native-only for the same reason `post` is: a browser tab has no folder on
/// disk to be a repository, and nothing to run.
#[cfg(not(target_arch = "wasm32"))]
pub mod git;
/// A sefer is many files: `#כלול` and the line map that keeps its
/// diagnostics meaningful.
pub mod include;
/// Both directions between a place in the source and a place on the page.
pub mod jump;
/// The deployment limits a server operator can move without a rebuild: the git
/// deadline, the compile slots, the body ceiling and the asset cache cap (#110).
pub mod knobs;
/// What the engine embeds and the notice each embedding owes — one table, tied
/// to the `include_bytes!` lines below and to `THIRD-PARTY-NOTICES.md`.
pub mod notemarks;
pub mod notices;
/// Which of the writer's lines printed on each page — the fact a preview
/// narrowed to one siman is drawn from.
pub mod pagelines;
/// Turning laid-out pages into SVG, on every core rather than one (#218).
pub mod pagesvg;
/// What each page actually *says* — the fact a search of the preview is drawn
/// from, and the one a search of the source cannot answer.
pub mod pagetext;
/// What Typst's own parser says a document is made of — the authority the
/// editor's hand-written scanner is checked against offline, since it cannot
/// ask for the answer mid-keystroke.
pub mod parse;
/// The rules more than one build has to obey, read from `ksav/policy/`.
///
/// Native only. Its one runtime caller is `server::csp`, which is
/// `#[cfg(not(target_arch = "wasm32"))]` — so the wasm module was carrying a
/// Content-Security-Policy for a server it does not contain. That is exactly the
/// finding the comment three lines below is proud of having made about
/// `girsa-source`, uncaught one module away.
#[cfg(not(target_arch = "wasm32"))]
pub mod policy;
/// The loopback to Girsa. Native only, like the server: a browser build has no
/// listener and nothing to hand it a source.
#[cfg(not(target_arch = "wasm32"))]
pub mod post;
pub mod probe;
/// The JSON scan used by the bracket-lint seam in Rust and WASM.
pub mod scan;
/// The catalogue of sefarim, and the order a source index prints them in.
pub mod sefarim;
/// Every engine service, once — what `server.rs`, the wasm binding and the
/// Tauri shell all dispatch through instead of each keeping its own list.
pub mod services;
/// Receiving a Source Packet from Girsa. Native only, and for the same reason
/// `post` is: this module *is* the receiving end of the loopback, `post.rs` is
/// its only caller, and its two dependencies — `girsa-source`, `girsa-ksav` —
/// are the packet schema and the citation writer. Compiled unconditionally,
/// the browser build paid for both to talk to an application that cannot be
/// running beside it.
#[cfg(not(target_arch = "wasm32"))]
pub mod source;
pub mod spell;
pub mod templates;

// The HTTP server uses tiny_http (net/threads) and can't target wasm.
#[cfg(not(target_arch = "wasm32"))]
pub mod server;

// Bundled Hebrew fonts (self-contained output, no system dependency).
const FONT_FRANK_REG: &[u8] = include_bytes!("../assets/fonts/FrankRuhlHofshi-Regular.otf");
const FONT_FRANK_BOLD: &[u8] = include_bytes!("../assets/fonts/FrankRuhlHofshi-Bold.otf");
const FONT_DAVID_REG: &[u8] = include_bytes!("../assets/fonts/DavidLibre-Regular.ttf");
const FONT_DAVID_BOLD: &[u8] = include_bytes!("../assets/fonts/DavidLibre-Bold.ttf");
const FONT_CASCADIA: &[u8] = include_bytes!("../assets/fonts/CascadiaMono.ttf");
/// The math font (OFL). Typst's math layout needs a font carrying an OpenType
/// MATH table — no Hebrew text font has one — so without this, every formula
/// fails outright with "no font could be found". It is the largest thing the
/// engine bundles (1.3 MB) and the only way `#נוסחה` can work out of the box.
const FONT_NEWCM_MATH: &[u8] = include_bytes!("../assets/fonts/NewCMMath-Regular.otf");

const BAND_COMMANDS: &[&str] = &["מדף_", "pageband"];
const BAND_CONFIG: &[&str] = &["הגדרות_מדפים", "pagebands_config"];
const STREAM_COMMANDS: &[&str] = &[
    "הערה_זרם",
    // The page-foot half of that command, which is what it was when the foot was
    // the only place a stream could go. `#הערה_זרם` is a door now — it routes to
    // the margin for a channel placed there — and this is where it lands when it
    // does not. Both spellings reserve, because a document reaching either one
    // still puts an apparatus at the foot of its pages.
    "_sf_stream_note",
    "stream_note",
    "הערת_תוכן",
    "contentnote",
    "הערת_מקור",
    "sourcenote_stream",
];
const STREAM_CONFIG: &[&str] = &["הגדרות_זרמים", "streams_config"];

/// The channel and region declarations, in both spellings.
///
/// A channel placed at the foot of the page is a *fixed region* there and not
/// Typst's balanced series — Typst has exactly one of those and the default
/// channel is it — so it renders into the footer and needs the same reserve the
/// bands and the streams do. Neither list above can see it: a document written
/// in channels contains `#הערה(ערוץ: "ביאור")` and not one of the eighteen
/// command names.
const CHANNEL_DECL: &[&str] = &["ערוץ", "channel"];
const REGION_DECL: &[&str] = &["אזור", "region"];
/// The named argument that puts a note in a channel.
const CHANNEL_ARG: &[&str] = &["ערוץ", "channel"];
/// Placement, and the two spellings of the one value that means the page foot.
const PLACEMENT_ARG: &[&str] = &["מיקום", "placement"];
const FOOT_PLACEMENT: &[&str] = &["רגל", "foot"];
const HEIGHT_ARG: &[&str] = &["גובה", "height"];
const SOURCE_ARG: &[&str] = &["מקור", "source"];
const REGION_ARG: &[&str] = &["אזור", "region"];
/// The seven built-in tier channels, which are Typst's own balanced series and
/// reserve nothing. `ksav.typ` names them once, in `_ch_tiers`, and
/// `the_tier_channels_match_the_prelude` checks this against it.
const TIER_CHANNELS: &[&str] = &[
    "הערה",
    "הערה_ב",
    "הערה_ג",
    "הערה_ד",
    "הערה_ה",
    "הערה_ו",
    "הערה_ז",
];

/// One `#ערוץ(…)` or `#אזור(…)` declaration, as much of it as a text scan can
/// honestly read.
#[derive(Default, Clone)]
struct ChannelDecl {
    placement: Option<String>,
    region: Option<String>,
    height: Option<String>,
    has_source: bool,
}

/// The value of the first of `keys` given as a named argument in `args`.
///
/// `args` is one call's argument list, already bounded by `closing_paren`.
/// Values are taken to the next comma at depth zero, so a tuple or a nested call
/// does not end one early. Quotes are stripped, because every value this reads —
/// a placement, a region name, a channel name — is written as a string.
/// The byte ranges of `s` that lie **outside** a string literal.
///
/// # One walk, because two walks is how this went wrong
///
/// `closing_paren` has always skipped quoted spans — it has to, or a value like
/// `"a)b"` closes the scan one argument in. `named_arg` did not, so it searched
/// **and** measured raw text: an argument list whose earlier string happened to
/// contain `גובה:` answered with the *string's* number, returned before the real
/// one was reached, and the foot band came out the size of the string. Notes then
/// printed off the page with no diagnostic anywhere.
///
/// Two scanners disagreeing about where a string is has happened in this file
/// before (#59: two grammars for one page-range field, compared by nothing), so
/// the walk is factored out and both use it. It is the only place in the crate
/// that needs to know how Typst quotes work.
///
/// Typst has no single-quoted string: a `'` is content. Escapes are honoured,
/// because a `\"` does not end a string and a scanner that thinks it does will
/// treat the rest of the argument list as a string and read nothing from it.
fn code_ranges(s: &str) -> Vec<std::ops::Range<usize>> {
    let mut out: Vec<std::ops::Range<usize>> = Vec::new();
    let mut chars = s.char_indices().peekable();
    let mut open = 0usize;
    while let Some((i, c)) = chars.next() {
        if c != '"' {
            continue;
        }
        // The code run ends at the quote that opened the string.
        out.push(open..i);
        let mut escaped = false;
        let mut end = s.len(); // an unterminated string runs to the end
        for (j, q) in chars.by_ref() {
            if escaped {
                escaped = false;
            } else if q == '\\' {
                escaped = true;
            } else if q == '"' {
                end = j + q.len_utf8();
                break;
            }
        }
        open = end;
    }
    out.push(open..s.len());
    out.retain(|r| r.start < r.end);
    out
}

/// The value of the first of `keys` given as a named argument in `args`.
///
/// **One scanner: [`code_ranges`].** See there for the bug — a string is neither
/// a key nor a boundary, and the previous version searched raw text.
fn named_arg(args: &str, keys: &[&str]) -> Option<String> {
    let code = code_ranges(args);
    for key in keys {
        for span in &code {
            let mut base = span.start;
            while base < span.end {
                let Some(rel) = args[base..span.end].find(key) else {
                    break;
                };
                let start = base + rel;
                base = start + key.len();
                // A whole word: `מיקום` must not match inside `מיקומים`, and
                // `אזור` must not match inside `אזור_הערות`.
                let before_ok = args[..start]
                    .chars()
                    .next_back()
                    .is_none_or(|c| !c.is_alphanumeric() && c != '_');
                let after = args[base..].trim_start();
                let Some(after) = after.strip_prefix(':') else {
                    continue;
                };
                if !before_ok || args[base..].starts_with('_') {
                    continue;
                }
                let after = after.trim_start();
                // Depth-counted over code, so a nested tuple — which is what
                // `גבהים` is — does not end the list at its own bracket, and a
                // comma inside a string does not end the value.
                let mut depth = 0i32;
                let mut end = after.len();
                'value: for r in code_ranges(after) {
                    for (j, c) in after[r.clone()].char_indices() {
                        match c {
                            '(' | '[' => depth += 1,
                            ')' | ']' => {
                                if depth == 0 {
                                    end = r.start + j;
                                    break 'value;
                                }
                                depth -= 1;
                            }
                            ',' if depth == 0 => {
                                end = r.start + j;
                                break 'value;
                            }
                            _ => {}
                        }
                    }
                }
                return Some(after[..end].trim().trim_matches('"').trim().to_string());
            }
        }
    }
    None
}

pub use diagnostics::Diagnostic;

#[cfg(test)]
mod unit_tests;

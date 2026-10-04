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
use std::collections::HashMap;
use typst::diag::Warned;
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;

pub mod assets;
/// Reading the Source Packet Girsa put on the clipboard — the other end of
/// spec.md §10.2's Ctrl+C, which had a careful producer and no consumer.
#[cfg(not(target_arch = "wasm32"))]
pub mod clipboard;
pub mod commands;
pub mod diagnostics;
/// What is actually inside a `.ksav` file — plain text, or the JSON wrapper the
/// editor writes for a document carrying images, page setup or its own commands.
/// Every client that is not the browser used to assume the first.
pub mod docfile;
/// Somebody else's text, put into Typst markup. One string-literal escaper and
/// one content escaper, for the four and two copies there used to be.
pub mod escape;
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
/// What the engine embeds and the notice each embedding owes — one table, tied
/// to the `include_bytes!` lines below and to `THIRD-PARTY-NOTICES.md`.
pub mod notemarks;
pub mod notices;
/// Which of the writer's lines printed on each page — the fact a preview
/// narrowed to one siman is drawn from.
pub mod pagelines;
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

/// The Hebrew prelude, embedded at build time.
const PRELUDE: &str = include_str!("../typst/ksav.typ");

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

/// Document-level settings, normally supplied by the editor toolbar.
///
/// `Serialize` is not decoration and not for the wire: it is how
/// `DocConfig::default()` reaches the app. The defaults used to cross that seam
/// as *source text* — `app/tools/emit-engine.mjs` sliced this file from
/// `impl Default for DocConfig` and ran a regex over the lines — so reflowing
/// that block changed the numbers the editor's sliders read while the page was
/// laid out to the old ones. See `facts.rs`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DocConfig {
    /// A setting that was outside the range this field accepts, and what was used
    /// instead. Filled by `from_json`, read by `compile`.
    ///
    /// Skipped in serialisation: this is a statement about a *request*, and a
    /// `DocConfig` that has been through `compile` once should still compare and
    /// serialise as the configuration it is.
    #[serde(skip)]
    pub refusals: Vec<Refusal>,
    /// A **string** setting that could not be read as written, and what was done
    /// with the token. Filled by `from_json`, read by `compile`.
    ///
    /// Separate from [`refusals`] because those are numeric by construction —
    /// `asked` and `used` are `f64` and the sentence in `refusal_diagnostic` is
    /// about centimetres. There is exactly one caller today (`pdf_pages`), and it
    /// arrived because a token it could not read was **dropped in silence**.
    #[serde(skip)]
    pub spec_refusals: Vec<SpecRefusal>,
    pub font: String,
    pub size_pt: f64,
    pub margin_cm: f64,
    /// Per-edge margins. `None` = take `margin_cm`, so a document that sets none
    /// of them is laid out exactly as it was before these existed.
    ///
    /// `inner`/`outer` are relative to the binding rather than to the paper, and
    /// that is the point: on a two-sided document they swap sides every page, so
    /// the text block sits the same distance from the fold on both leaves. A
    /// left/right pair cannot express that, which is why a uniform `margin_cm`
    /// was a hard stop the first time anyone took a file to a printer.
    pub margin_top_cm: Option<f64>,
    pub margin_bottom_cm: Option<f64>,
    pub margin_inner_cm: Option<f64>,
    pub margin_outer_cm: Option<f64>,
    /// Extra width on the inner margin alone — the strip the binding swallows.
    pub gutter_cm: f64,
    /// Print on both sides: mirror the margins and allow verso/recto running
    /// heads to differ.
    pub two_sided: bool,
    /// Running heads for even (verso) and odd (recto) pages. Empty = use the
    /// single-sided `header`/`footer`.
    pub header_even: String,
    pub header_odd: String,
    pub footer_even: String,
    pub footer_odd: String,
    /// Where the running head sits: `center`, `outside` or `inside`.
    pub head_align: String,
    /// PDF metadata. Without a title the file opens nameless in every reader,
    /// and PDF/A will not validate at all.
    pub title: String,
    pub author: String,
    pub keywords: Vec<String>,
    /// A PDF standard to enforce, as Typst names it (`a-2b`, `a-3b`, `ua-1`,
    /// `1.7`, …). Empty = plain PDF. Printers ask for PDF/A; nothing else does.
    pub pdf_standard: String,
    /// Emit PDF tags (the accessibility tree). On by default, as in Typst.
    pub pdf_tagged: bool,
    /// Which pages to export, `1,3,5-9`. Empty = all of them.
    pub pdf_pages: String,
    /// Keep a one-letter Hebrew word off the end of a line. Off by default: it
    /// changes where lines break, and every document written before it existed
    /// would silently repaginate.
    pub prevent_orphans: bool,
    /// One page, as tall as the sefer is — the digital output mode.
    ///
    /// `NOTES-PLAN`'s document-level section calls it free, and it is: **overflow
    /// is impossible by definition** when the page grows. A note that will not
    /// fit is a sentence about a page bottom, and this has none. Off by default,
    /// because a sefer is a printed object and this is the other thing it can be.
    pub continuous: bool,
    /// A companion volume is written as its own file rather than bound behind
    /// the body.
    ///
    /// The body document then prints without it, and [`compile_companion`]
    /// renders the other half from the **same source** — which is what keeps the
    /// two in step. A companion built from a separate document would be a second
    /// thing to keep correct, and the first note moved would break it.
    pub separate_volume: bool,
    /// "rtl" or "ltr"
    pub dir: String,
    /// BCP-47 language tag for the text (`lang:` in Typst). Empty = follow the
    /// direction: `rtl` → Hebrew, `ltr` → English.
    ///
    /// This is not cosmetic. Typst drives hyphenation, smart-quote shape and its
    /// own generated labels off `lang`, so an English document typeset as Hebrew
    /// gets `”hello”` for `"hello"` (the closing mark on both sides, which is
    /// right for Hebrew and wrong for English) and no hyphenation at all in
    /// justified text, because there are no Hebrew hyphenation patterns.
    pub lang: String,
    /// Show page numbers.
    pub numbering: bool,
    /// Justify paragraphs.
    ///
    /// Half of one control. See [`DocConfig::text_align`], which holds the other
    /// three answers to the same question and takes precedence over this one.
    pub justify: bool,
    /// Where the text sits when it is not justified: `right`, `center`, `left`.
    ///
    /// > *"Justify belongs in one control with right, centre and left."*
    ///
    /// It did not, and could not: `justify` is a boolean, so the panel offered a
    /// tick box whose two states were *justified* and *not justified*, and there
    /// was no document-level way to say **which edge** the unjustified text
    /// should sit at. A writer who wanted a centred sheet had to reach for
    /// `#מרכז` around every paragraph.
    ///
    /// Empty is the ordinary state and means *take `justify`* — which is what
    /// every document written before this field existed says, and why it is a
    /// string with an empty default rather than a fourth boolean. Non-empty wins,
    /// because the panel writes the pair together and a document holding both an
    /// alignment and `justify: true` is one the writer never asked for.
    ///
    /// The prelude takes one parameter for both readings — `יישור` accepts
    /// `true`/`false` or an alignment name — so the two halves stay one control
    /// all the way down to the page rather than being reassembled per layer.
    pub text_align: String,
    /// Line spacing (leading) in em.
    pub line_spacing_em: f64,
    /// Space between paragraphs, in em.
    pub para_spacing_em: f64,
    /// First-line indent, in em (0 = none).
    pub first_line_indent_em: f64,
    /// Number of text columns (1 = single column).
    pub columns: u32,
    /// Paper size (Typst name: "a4", "us-letter", "a5", ...).
    pub paper: String,
    /// A page size in centimetres, when a named paper is not what is wanted.
    ///
    /// **Both or neither.** Typst's `set page(width:, height:)` overrides
    /// `paper:` entirely, and half a size is not a page — a width with no height
    /// would silently keep A4's height and produce a shape nobody asked for. So
    /// `assemble_source` sends them only as a pair and the prelude only reads
    /// them as one.
    ///
    /// `None` is *use the named paper*, which is what every document written
    /// before this existed says, and is why it is an `Option` rather than a
    /// number with a sentinel. A sefer is routinely printed at a size no
    /// standard names — 17×24, 20×27 — and until now the only answer was to
    /// pick the nearest A-size and live with the margins.
    pub page_width_cm: Option<f64>,
    pub page_height_cm: Option<f64>,
    /// Use Hebrew-letter numbering (א,ב,ג) for pages and ordered lists.
    pub hebrew_numbering: bool,
    /// Running header text (empty = none).
    pub header: String,
    /// Running footer text (empty = default page number).
    pub footer: String,
    /// Height in cm reserved at the foot of every page for the per-page note
    /// apparatus (page-bands / streams). `None` = decide automatically from the
    /// document: reserve only when the document actually uses that apparatus.
    pub notes_region_cm: Option<f64>,
    /// What happens when a writer-fixed reserve is smaller than its foot
    /// regions' declared heights: `"grow"` (the default) raises the reserve to
    /// hold them; `"refuse"` stops before layout and names both numbers.
    /// (`"flow"` — keep the strip, let excess entries continue on later pages —
    /// needs the walk to cap at the strip and comes with the overflow-ladder
    /// work.)
    pub reserve_overflow: String,
    /// The two ceilings on an `#כלול` expansion (#63).
    ///
    /// **Two, not one, because they answer different questions.** A part included
    /// 128 times is 128 copies, and the copies are *correct* — the writer asked
    /// for them. What is not correct is that nothing bounded the total: one 200KB
    /// part pulled in 128 times measured **25.6 million lines in 15.9 seconds**
    /// with no error and nothing refused. So this is a budget somebody chose,
    /// where `MAX_DEPTH` was a cap that fell out of the recursion.
    ///
    /// The soft one tells the writer while the document is still worth laying
    /// out; the hard one stops the walk, because past a point there is nothing
    /// left to warn about. Defaults: 100,000 and 500,000 — a chumash is ~30,000
    /// lines and a Vilna Shas ~500,000, and 500,000 lays out in roughly a third
    /// of a second, which is the number that matters for a 59ms editor.
    pub max_lines_warn: f64,
    pub max_lines_refuse: f64,
}

/// Commands whose notes render into the page *footer* rather than expanding the
/// text region — these are the ones that need a reserved region at the page foot.
///
/// These are prefixes: `מדף_` stands for `מדף_א`, `מדף_בדרגה` and the rest of
/// that family. The list is a second statement of something `ksav.typ` already
/// says — which apparatuses register through `_ap_note` with a footer label —
/// and a second statement that nothing compares to the first is how a list goes
/// stale. So `the_page_foot_reserve_list_matches_the_prelude` derives the family
/// out of the prelude and checks this against it in both directions: a new
/// footer-rendered alias that is missing here fails, and an entry here that no
/// longer names anything fails too. The failure it prevents is quiet and ugly —
/// the page keeps its full text height and the apparatus runs off the bottom
/// edge of the sheet.
///
/// It is **two** lists, one per apparatus, and that is not tidiness.
///
/// They are separate mechanisms that share one reserve: `#מדף_א…ז` are *tiers*,
/// ordered layers of one apparatus, and `#הערה_זרם("שם")` are *named peer
/// streams*, independent apparatuses that happen to sit at the same foot. Each
/// declares its fixed region heights in its own configuration command, in its
/// own shape, and the footer renders the bands and then the streams into the
/// same reserved block — so what the page needs is the sum of the two. Held as
/// one list, the reserve could only ever be read off one of them, which is
/// exactly what went wrong: `#הגדרות_זרמים` was never read at all.
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
fn named_arg(args: &str, keys: &[&str]) -> Option<String> {
    for key in keys {
        let mut base = 0;
        while let Some(i) = args[base..].find(key) {
            let start = base + i;
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
            let mut depth = 0i32;
            let mut end = after.len();
            for (j, c) in after.char_indices() {
                match c {
                    '(' | '[' => depth += 1,
                    ')' | ']' => {
                        if depth == 0 {
                            end = j;
                            break;
                        }
                        depth -= 1;
                    }
                    ',' if depth == 0 => {
                        end = j;
                        break;
                    }
                    _ => {}
                }
            }
            return Some(after[..end].trim().trim_matches('"').trim().to_string());
        }
    }
    None
}


/// A Typst length, in cm. `None` for anything font-relative — or for a
/// percentage when the sheet it would be a percentage of is not known.
///
/// `%` is a percentage **of the sheet**, not of anything nearer. That is the one
/// reading a writer means by "make the apparatus a fifth of the page", and it is
/// the reading `_ap_fixed_height` in the prelude resolves against `page.height`
/// so that the two halves of this agree. A bare ratio handed to `block(height:)`
/// would otherwise be a percentage of the reserve block the bands already sit
/// inside — a fraction of a fraction, shrinking as more is asked for.
///
/// Resolving a percentage against a *guessed* sheet is how the reserve and the
/// prelude disagree by exactly the ratio of the guess, silently and in page
/// geometry, so an unknown paper answers `None` here and the height counts as
/// undeclared: the working default, which keeps everything on the page.
/// One line of the document's default text, in cm — the same answer
/// [`crate::typst::ksav`]'s `_ap_fixed_height` gives a `שורות` height when no
/// caller's line is known: `par.leading + text.size` at the shipped defaults
/// (12pt body, 0.75em leading). The two sides of the percent-of-sheet claim
/// meet here; change one, change both.
const DEFAULT_LINE_CM: f64 = 12.0 * (1.0 + 0.75) * 2.54 / 72.0;

fn length_cm(s: &str, page_h_cm: Option<f64>) -> Option<f64> {
    let s = s.trim();
    if let Some(n) = s.strip_suffix('%') {
        let h = page_h_cm?;
        return n.trim().parse::<f64>().ok().map(|v| v / 100.0 * h);
    }
    // A count of lines, in either spelling — resolved against the same
    // default line the drawn slot falls back to, so the reserve the Rust
    // side takes off the margin and the block Typst draws agree.
    for name in ["שורות", "lines"] {
        if let Some(rest) = s.strip_prefix(name) {
            let inner = rest.trim().strip_prefix('(')?;
            let n = inner.trim_end_matches(')').trim().parse::<f64>().ok()?;
            return Some(n * DEFAULT_LINE_CM);
        }
    }
    for (unit, per_cm) in [
        ("cm", 1.0),
        ("mm", 10.0),
        ("pt", 72.0 / 2.54),
        ("in", 1.0 / 2.54),
    ] {
        if let Some(n) = s.strip_suffix(unit) {
            return n.trim().parse::<f64>().ok().map(|v| v / per_cm);
        }
    }
    None
}

/// The reserve for a document on A4, which is what every caller that does not
/// know the paper is really assuming.
///
/// Only a `%` region height needs the sheet, so this is exact for every document
/// that measures its apparatus in centimetres — which is all of them until now.
pub fn auto_notes_region_cm(body: &str) -> f64 {
    auto_notes_region_cm_on(body, paper_height_cm("a4").unwrap_or(29.7))
}

/// The height of a named paper, in cm — what a `%` region height is a percentage
/// of. `None` for a name this side does not know: guessing it would put the
/// reserve's arithmetic on one sheet and the prelude's `page.height` on another.
///
/// Only the papers the product offers.
/// The smallest text area a margin may leave, in centimetres.
///
/// A centimetre fits a line of text and a little air. Below it the page is a
/// margin with a smudge in the middle, and a writer who asked for that has made a
/// mistake worth naming rather than printing.
const MIN_TEXT_CM: f64 = 1.0;

/// The sheet this document will be laid out on, in centimetres.
///
/// An explicit pair, else the named paper, else A4 — the same precedence the
/// prelude uses, so a margin is bounded by the page that will actually obey it.
fn sheet_cm_of(cfg: &DocConfig) -> (f64, f64) {
    match (cfg.page_width_cm, cfg.page_height_cm) {
        (Some(w), Some(h)) => (w, h),
        _ => paper_cm_of(&cfg.paper).unwrap_or((21.0, 29.7)),
    }
}

fn paper_height_cm(paper: &str) -> Option<f64> {
    paper_cm_of(paper).map(|(_, h)| h)
}

/// Both dimensions of a named paper, in centimetres.
///
/// The same list `paper_height_cm` always had, now with the width beside it —
/// which is what a *margin* needs, since a top margin is bounded by the height and
/// an inner one by the width. Two tables would have been two lists to keep in
/// step, and this one already had to exist.
fn paper_cm_of(paper: &str) -> Option<(f64, f64)> {
    Some(match paper {
        "a2" => (42.0, 42.0),
        "a3" => (29.7, 42.0),
        "a4" => (21.0, 29.7),
        "a5" => (14.8, 21.0),
        "a6" => (10.5, 14.8),
        "b4" => (25.0, 35.3),
        "b5" => (17.6, 25.0),
        "b6" => (12.5, 17.6),
        "us-letter" => (21.59, 27.94),
        "us-legal" => (21.59, 35.56),
        _ => return None,
    })
}

/// The sheet this document is laid out on, in cm — or `None` when neither an
/// explicit pair nor a known paper says.
///
/// `page_width_cm`/`page_height_cm` are **both or neither** — the prelude only
/// honours them as a pair, because Typst's `width`/`height` override `paper:`
/// entirely and a width with no height would silently keep the named paper's.
fn sheet_height_cm(cfg: &DocConfig) -> Option<f64> {
    match (cfg.page_width_cm, cfg.page_height_cm) {
        (Some(_), Some(h)) => Some(h),
        _ => paper_height_cm(&sanitize_paper(&cfg.paper)),
    }
}

/// The last answer the reserve gave, keyed by its inputs.
///
/// The scan is a whole-document parse, and it ran at the bottom of
/// `show_rule` — every compile, including the ones a watcher or a settings
/// change asks for with the text untouched. One entry: the previous document's
/// key. A keystroke that changed the text misses it and pays the parse; a
/// compile of unchanged text stops paying for an answer that has not moved.
static RESERVE_CACHE: std::sync::Mutex<Option<(u128, f64)>> = std::sync::Mutex::new(None);

fn reserve_cache_key(body: &str, page_h_cm: Option<f64>) -> u128 {
    // FNV-1a over the body with the sheet folded in at the end. A collision
    // costs one wrong reserve until the next edit — and two distinct bodies
    // colliding here, in a 128-bit space, is not the failure to spend on.
    let mut h: u128 = 0xcbf29ce484222325;
    let mut chunk = |bytes: &[u8]| {
        for b in bytes {
            h ^= *b as u128;
            h = h.wrapping_mul(0x100000001b3);
        }
    };
    chunk(body.as_bytes());
    // A `None` sheet contributes no bytes at all rather than a stand-in value,
    // so it cannot collide with any real height.
    if let Some(h) = page_h_cm {
        chunk(&h.to_bits().to_le_bytes());
    }
    h
}

/// The reserve, given the sheet it is laid out on — or `None` for the sheet,
/// in which case a `%` height counts as undeclared rather than resolved against
/// a guess. The f64 form below is the same scan with the sheet known.
pub fn auto_notes_region_cm_sheet(body: &str, page_h_cm: Option<f64>) -> f64 {
    let key = reserve_cache_key(body, page_h_cm);
    if let Ok(guard) = RESERVE_CACHE.lock() {
        if let Some((k, v)) = *guard {
            if k == key {
                return v;
            }
        }
    }
    let answer = auto_notes_region_cm_scan(body, page_h_cm);
    if let Ok(mut guard) = RESERVE_CACHE.lock() {
        *guard = Some((key, answer));
    }
    answer
}

fn auto_notes_region_cm_scan(body: &str, page_h_cm: Option<f64>) -> f64 {
    let shape = parse::apparatus_shape(body);
    let mut total = 0.0;
    let mut used_any = false;
    // Per apparatus, not once for the document. The footer renders the bands and
    // then the streams into the *same* reserved block, one under the other, so
    // what the page needs is the sum of what each of them needs — and reading the
    // reserve off `#הגדרות_מדפים` alone meant three declared streams got the flat
    // 3 cm default and printed the third at y=823.62, below the page number at
    // 799.02 and on its way off an 841.89pt sheet. The same defect that had just
    // been fixed for the bands, one apparatus over, which is the shape this
    // repository keeps rebuilding: the class is named, one instance is fixed, the
    // sibling is never swept.
    for (commands, config) in [
        (BAND_COMMANDS, BAND_CONFIG),
        (STREAM_COMMANDS, STREAM_CONFIG),
    ] {
        let used = commands
            .iter()
            .any(|c| apparatus_is_called(&shape, c) || apparatus_is_named_as_kind(body, &shape, c));
        if !used {
            continue;
        }
        used_any = true;
        total += match declared_region_cm(body, &shape, config, page_h_cm) {
            // Fixed regions: reserve exactly what the document asked for, plus the
            // furniture the prelude draws around the bands — a rule above the
            // apparatus and a gap between adjacent bands (`ריווח_בין`, 0.35em). Those
            // are small, but they are what pushes the last band past its slot, and a
            // band past its slot is a clipped sentence.
            Some(heights) => {
                let sum: f64 = heights.iter().sum();
                let gaps = (heights.len().saturating_sub(1)) as f64;
                sum + BAND_GAP_CM * gaps + BAND_RULE_CM
            }
            // No declared heights: the regions take the height they need, and a
            // working default is the best that can be said in advance.
            None => DEFAULT_REGION_CM,
        };
    }
    // …and the channels, which are the same footer and the same block. A document
    // may carry both — the eighteen commands still work — so this is a third
    // summand and not a third answer.
    if let Some(cm) = channel_region_cm(body, &shape, page_h_cm) {
        used_any = true;
        total += cm;
    }
    if !used_any {
        return 0.0;
    }
    // The reserve is added to the bottom margin, so a document that asks for more
    // page than there is has no text area left to lay anything out in. `%` makes
    // that a plausible typo rather than an exotic one — `(50%, 40%)` reads as
    // modest right up until it is nine tenths of the sheet. Past this the regions
    // are clipped, which is visible on the page; a document that will not lay out
    // at all is not.
    total.min(page_h_cm.unwrap_or(29.7) * MAX_REGION_SHARE)
}

/// The same scan with the sheet known — the shape every existing caller and
/// test means.
pub fn auto_notes_region_cm_on(body: &str, page_h_cm: f64) -> f64 {
    auto_notes_region_cm_sheet(body, Some(page_h_cm))
}

/// A working reserve for an apparatus that did not say how tall it is.
const DEFAULT_REGION_CM: f64 = 3.0;
/// The most of the sheet the page-foot apparatus may claim.
const MAX_REGION_SHARE: f64 = 0.6;

/// What the prelude draws *between* two adjacent bands: `v(ריווח_בין)`, the short
/// divider rule, `v(ריווח_בין)` again. Measured at 11.6pt (0.41 cm) at the
/// shipped settings; carried at 0.45 so that a document which enlarges the gap a
/// little does not start clipping, and so the allowance does not compound the
/// wrong way down a five-band stack.
const BAND_GAP_CM: f64 = 0.45;
/// The rule above the apparatus as a whole, plus its `rule_gap`.
const BAND_RULE_CM: f64 = 0.25;

// --------------------------------------------------------------------------
// The same answers from the real parser.
//
// The hand scanners this used to be re-lexed Typst — strings, comments, parens,
// identifiers — in a crate that ships the real lexer and already uses it in
// `parse::partition`. The rebuild is one `parse::apparatus_shape(body)` pass
// supplying the calls and the comment/string ranges, and the arithmetic is
// unchanged. The differential gate proved the two halves agreed on the corpus
// before the hand family retired.

/// Whether byte `at` sits in the document's live code — outside every comment
/// and string literal the parser saw.
fn is_live_code(shape: &parse::ApparatusShape, at: usize) -> bool {
    !shape.comments.iter().any(|&(a, b)| a <= at && at < b)
        && !shape.strings.iter().any(|&(a, b)| a <= at && at < b)
}

/// Whether `name` (a command, or the common prefix of a family of them) appears
/// as an actual call. A call is live code by construction, so a prose mention,
/// a comment or a string literal can never be one.
fn apparatus_is_called(shape: &parse::ApparatusShape, name: &str) -> bool {
    shape.calls.iter().any(|c| c.name.starts_with(name))
}

/// Whether `name` is handed to the deferred-note wrapper as its layout — the
/// value of `סוג:`/`kind:`, where there is no bracket for
/// `apparatus_is_called` to find. The key may not sit inside a comment
/// or a string literal.
fn apparatus_is_named_as_kind(body: &str, shape: &parse::ApparatusShape, name: &str) -> bool {
    for key in ["סוג:", "kind:"] {
        let mut base = 0;
        while let Some(i) = body[base..].find(key) {
            let at = base + i;
            if is_live_code(shape, at) && body[at + key.len()..].trim_start().starts_with(name) {
                return true;
            }
            base = at + key.len();
        }
    }
    false
}

/// Every `#name(…)` declaration in the shape, keyed by the first positional
/// argument — which for both of these commands is the thing's own name.
fn channel_declarations(
    body: &str,
    shape: &parse::ApparatusShape,
    names: &[&str],
) -> HashMap<String, ChannelDecl> {
    let mut out: HashMap<String, ChannelDecl> = HashMap::new();
    for call in &shape.calls {
        if !call.hash || !names.contains(&call.name.as_str()) {
            continue;
        }
        let Some((from, to)) = call.args else {
            continue;
        };
        let args = &body[from..to];
        let Some(first) = args.split(',').next() else {
            continue;
        };
        let key = first.trim().trim_matches('"').trim().to_string();
        if key.is_empty() {
            continue;
        }
        let decl = ChannelDecl {
            placement: named_arg(args, PLACEMENT_ARG),
            region: named_arg(args, REGION_ARG),
            height: named_arg(args, HEIGHT_ARG),
            has_source: named_arg(args, SOURCE_ARG).is_some(),
        };
        // A second declaration of the same name adds to the first, exactly as
        // the prelude's own `#ערוץ` does.
        let slot = out.entry(key).or_default();
        slot.placement = decl.placement.or(slot.placement.take());
        slot.region = decl.region.or(slot.region.take());
        slot.height = decl.height.or(slot.height.take());
        slot.has_source |= decl.has_source;
    }
    out
}

/// How much page foot a document's *channels* need, in cm — the parser half of
/// [`channel_region_cm`].
fn channel_region_cm(
    body: &str,
    shape: &parse::ApparatusShape,
    page_h_cm: Option<f64>,
) -> Option<f64> {
    let channels = channel_declarations(body, shape, CHANNEL_DECL);
    let regions = channel_declarations(body, shape, REGION_DECL);

    // Which channels notes were actually written into. `אזור:` names the target
    // too — the filing reads the region's placement, and when both arguments
    // are given the region wins — so a note written `#הערה(אזור: "x")` into a
    // foot region reserves for it exactly as `#הערה(ערוץ: "x")` does.
    let mut used: Vec<String> = Vec::new();
    for call in &shape.calls {
        if !call.hash {
            continue;
        }
        // A `#ערוץ("c", אזור: "r")` *declaration* carries the same argument a
        // note does and writes nothing into anything; counting it would reserve
        // for an apparatus no note ever touched.
        if CHANNEL_DECL.contains(&call.name.as_str()) || REGION_DECL.contains(&call.name.as_str()) {
            continue;
        }
        let Some((from, to)) = call.args else {
            continue;
        };
        let args = &body[from..to];
        let target = named_arg(args, REGION_ARG).or(named_arg(args, CHANNEL_ARG));
        if let Some(name) = target {
            if !name.is_empty() && !used.contains(&name) {
                used.push(name);
            }
        }
    }

    // Each such channel's region, when that region is at the foot of the page.
    let mut feet: Vec<(String, Option<String>)> = Vec::new();
    for name in used {
        if TIER_CHANNELS.contains(&name.as_str()) {
            continue;
        }
        let ch = channels.get(&name).cloned().unwrap_or_default();
        let region = ch.region.clone().unwrap_or_else(|| name.clone());
        let rg = regions.get(&region).cloned().unwrap_or_default();
        // The channel's own placement, else its region's, else the page foot.
        let placement = ch.placement.clone().or(rg.placement.clone());
        if let Some(p) = &placement {
            if !FOOT_PLACEMENT.contains(&p.as_str()) {
                continue;
            }
        }
        // A channel that hangs off another and asked for no region of its own
        // is a tier of the native apparatus — indented in its parent's block,
        // in Typst's balanced series, reserving nothing.
        if ch.has_source && ch.region.is_none() && ch.height.is_none() {
            continue;
        }
        let height = ch.height.clone().or(rg.height.clone());
        if !feet.iter().any(|(r, _)| *r == region) {
            feet.push((region, height));
        }
    }
    if feet.is_empty() {
        return None;
    }
    // Exactly what was asked for plus the furniture the prelude draws, and the
    // working default for a region that did not say — the same arithmetic the
    // bands and streams get, because they share the block.
    let mut total = BAND_RULE_CM + BAND_GAP_CM * (feet.len().saturating_sub(1)) as f64;
    for (_, height) in &feet {
        total += match height.as_deref().and_then(|h| length_cm(h, page_h_cm)) {
            Some(cm) => cm,
            None => DEFAULT_REGION_CM,
        };
    }
    Some(total)
}

/// The band or stream heights a document declared, in cm — the parser half of
/// [`declared_region_cm`]. The search stays inside the call's own argument
/// list, which is now bounded by the parser rather than by a hand-balanced
/// paren scan.
fn declared_region_cm(
    body: &str,
    shape: &parse::ApparatusShape,
    names: &[&str],
    page_h_cm: Option<f64>,
) -> Option<Vec<f64>> {
    for name in names {
        for call in &shape.calls {
            if call.name != *name {
                continue;
            }
            let Some((from, to)) = call.args else {
                continue;
            };
            let rest = &body[from..to];
            for key in ["גבהים", "heights"] {
                let Some(k) = rest.find(key) else {
                    continue;
                };
                let after = rest[k + key.len()..].trim_start();
                let Some(after) = after.strip_prefix(':') else {
                    continue;
                };
                let after = after.trim_start();
                let Some(open) = after.strip_prefix('(') else {
                    continue;
                };
                let Some(close) = open.find(')') else {
                    continue;
                };
                let items: Vec<&str> = open[..close]
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .collect();
                // An entry is either a bare length (the array form) or
                // `"name": length` (the dictionary form), and the height is
                // whatever follows the last colon in either shape. An empty
                // dictionary, `(:)`, leaves nothing after the colon and so
                // reads as *not declared*, which is exactly what it means.
                let parsed: Option<Vec<f64>> = items
                    .iter()
                    .map(|s| length_cm(s.rsplit_once(':').map_or(*s, |(_, v)| v), page_h_cm))
                    .collect();
                // One unreadable entry disqualifies the whole list: a partial
                // sum reserves less than the bands will use, which is the exact
                // defect this function exists to stop.
                if let Some(v) = parsed {
                    if !v.is_empty() {
                        return Some(v);
                    }
                }
                return None;
            }
        }
    }
    None
}

impl Default for DocConfig {
    fn default() -> Self {
        DocConfig {
            refusals: Vec::new(),
            spec_refusals: Vec::new(),
            font: "Frank Ruhl Hofshi".to_string(),
            size_pt: 12.0,
            margin_cm: 2.5,
            margin_top_cm: None,
            margin_bottom_cm: None,
            margin_inner_cm: None,
            margin_outer_cm: None,
            gutter_cm: 0.0,
            two_sided: false,
            header_even: String::new(),
            header_odd: String::new(),
            footer_even: String::new(),
            footer_odd: String::new(),
            head_align: "center".to_string(),
            title: String::new(),
            author: String::new(),
            keywords: Vec::new(),
            pdf_standard: String::new(),
            pdf_tagged: true,
            pdf_pages: String::new(),
            prevent_orphans: false,
            continuous: false,
            separate_volume: false,
            dir: "rtl".to_string(),
            lang: String::new(),
            numbering: true,
            justify: true,
            // Empty is *take `justify`*, which is what every document written
            // before this field existed says. See the field.
            text_align: String::new(),
            line_spacing_em: 0.75,
            para_spacing_em: 1.2,
            first_line_indent_em: 0.0,
            columns: 1,
            paper: "a4".to_string(),
            // A named paper, so nothing changes for a document that never asks.
            page_width_cm: None,
            page_height_cm: None,
            hebrew_numbering: false,
            header: String::new(),
            footer: String::new(),
            notes_region_cm: None,
            reserve_overflow: "grow".to_string(),
            max_lines_warn: include::Limits::default().warn as f64,
            max_lines_refuse: include::Limits::default().refuse as f64,
        }
    }
}

/// Read a finite number from JSON, clamped to a range the typesetter can use.
///
/// Every one of these values is a *length* or a *count* that goes straight into
/// the Typst prelude. Unvalidated, `size_pt: 0` produced invisible text,
/// `size_pt: -5` and `line_spacing_em: -3` produced garbage, and `columns: 5000`
/// produced a page of hairlines — all of them reported as `ok: true`, which is
/// the worst possible answer: silently wrong output that looks like success.
/// NaN and infinity are rejected outright rather than clamped, because a NaN
/// formatted into the source is not a Typst length at all and fails inside the
/// prelude, pointing the writer at code they never wrote.
/// One per-edge margin, read by name, or `None` when the writer did not set it.
///
/// The `None` is load-bearing and is not the same as zero: an absent edge means
/// "take `margin_cm`", and a pair check that treated absent as zero would
/// conclude there was nothing to move and leave a default on the page.
fn margin_slot(cfg: &DocConfig, key: &str) -> Option<f64> {
    match key {
        "margin_top_cm" => cfg.margin_top_cm,
        "margin_bottom_cm" => cfg.margin_bottom_cm,
        "margin_inner_cm" => cfg.margin_inner_cm,
        "margin_outer_cm" => cfg.margin_outer_cm,
        _ => None,
    }
}

fn margin_slot_mut<'a>(cfg: &'a mut DocConfig, key: &str) -> Option<&'a mut Option<f64>> {
    match key {
        "margin_top_cm" => Some(&mut cfg.margin_top_cm),
        "margin_bottom_cm" => Some(&mut cfg.margin_bottom_cm),
        "margin_inner_cm" => Some(&mut cfg.margin_inner_cm),
        "margin_outer_cm" => Some(&mut cfg.margin_outer_cm),
        _ => None,
    }
}

fn clamped(
    cfg: &mut DocConfig,
    v: &serde_json::Value,
    key: &str,
    lo: f64,
    hi: f64,
) -> Option<f64> {
    let n = v.get(key)?.as_f64()?;
    if !n.is_finite() {
        return None;
    }
    let got = n.clamp(lo, hi);
    // **A clamp that says nothing is the wrong answer.** Not for NaN, which is
    // refused above because it is not a length at all — but for an ordinary
    // number outside the range: the writer typed it, the document compiled, and
    // the page came out as though they had not. `margin_top_cm: 21.7` on an A4
    // sheet is 21.7 cm of nothing, and the alternative used to be a document laid
    // out at 7 cm with no diagnostic anywhere. The app has already been bitten by
    // this class — `settings.ts` says it outright, *"a load that falls back to
    // the defaults is a load that has silently un-chosen everything the person
    // chose"* — and the engine had the same bug one layer down.
    if (got - n).abs() > f64::EPSILON {
        cfg.refusals.push(Refusal {
            key: key.to_string(),
            asked: n,
            used: got,
        });
    }
    Some(got)
}

/// One setting that was refused, and what was used instead.
///
/// A refusal is **not** an error. The document lays out; the page is the nearest
/// thing this field accepts. What changes is that the writer is told, at the
/// point their own text said it: the setting they changed has no effect, the
/// value that is in force is named, and both numbers are in the sentence so the
/// correction is obvious.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Refusal {
    /// The field as the request named it, e.g. `margin_top_cm`.
    pub key: String,
    /// What the request asked for.
    pub asked: f64,
    /// What was used instead.
    pub used: f64,
}

/// A refusal, in the writer's own words and in theirs.
///
/// Bilingual for the reason every sentence here is: the machine's half is never
/// the sentence. Both numbers are in it, because "your margin was too large"
/// without saying what it is now leaves the writer guessing between the two.
fn refusal_diagnostic(r: &Refusal) -> Diagnostic {
    let cm = |n: f64| format!("{:.2}", n);
    Diagnostic::ours(
        "warning",
        format!(
            concat!(
                "ההגדרה {key} אינה בתחום המותר — בפועל {used} ס״מ במקום {asked} ס״מ · ",
                "{key} is outside the range this setting accepts — {used} cm is in force, not {asked} cm"
            ),
            key = r.key,
            asked = cm(r.asked),
            used = cm(r.used),
        ),
    )
}

/// One token of a string setting that could not be read, and what was done.
///
/// The twin of [`Refusal`] for the fields that are not lengths. Same argument:
/// *"a setting that says nothing is the wrong answer"* — but the evidence here is
/// worse than a clamped margin, because the old reading of a bad `pdf_pages`
/// token did not quietly use a different number, it **quietly exported the whole
/// document**. Naming the token is what turns that back into a setting the writer
/// can fix.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SpecRefusal {
    /// The field as the request named it — always `pdf_pages` today.
    pub key: String,
    /// The token, quoted exactly as the writer wrote it.
    pub asked: String,
    /// What the field's other, readable tokens are being used for instead.
    pub used: String,
}

/// Every string setting of `cfg` that could not be read, as refusals.
///
/// **Derived from the settings, not from what `from_json` happened to record.**
/// `DocConfig` is a `pub` struct and is built by field in tests, in `binding.rs`
/// and anywhere the engine is embedded as a library — a path that never goes
/// near `from_json`. `from_json` fills `spec_refusals` so a *request* is
/// self-describing, and this reads it, but it also recomputes from `pdf_pages`
/// so a directly-built config cannot have a field it cannot read go unnamed.
/// That is the same seam `page_spec` had: a property that holds only for one of
/// the two ways to build the value is a property nobody can rely on.
fn spec_refusals_of(cfg: &DocConfig) -> Vec<SpecRefusal> {
    let mut out = cfg.spec_refusals.clone();
    for token in parse_page_spec(&cfg.pdf_pages).bad {
        if !out.iter().any(|e| e.key == "pdf_pages" && e.asked == token) {
            out.push(page_spec_refusal(cfg, token));
        }
    }
    out
}

/// The refusal for one unreadable `pdf_pages` token, saying what was used.
fn page_spec_refusal(cfg: &DocConfig, asked: String) -> SpecRefusal {
    let spec = parse_page_spec(&cfg.pdf_pages);
    let used = if spec.ranges.is_empty() {
        // Every token was refused, so there is nothing left to export.
        "the export was refused rather than answered with every page".to_string()
    } else {
        format!(
            "the {} page range(s) that did parse are being exported",
            spec.ranges.len()
        )
    };
    SpecRefusal {
        key: "pdf_pages".into(),
        asked,
        used,
    }
}
///
/// Bilingual for the reason every sentence here is: the machine's half is never
/// the sentence. The token is in it verbatim, because a writer who typed `9-2`
/// and is told *"a token is invalid"* has no idea which one.
fn spec_refusal_diagnostic(r: &SpecRefusal) -> Diagnostic {
    Diagnostic::ours(
        "warning",
        format!(
            concat!(
                "ההגדרה {key} לא הבינה את \"{asked}\" — {used} · ",
                "the {key} setting could not read \"{asked}\" — {used}"
            ),
            key = r.key,
            asked = r.asked,
            used = r.used,
        ),
    )
}

/// A paper name safe to place inside a Typst string literal.
///
/// Typst paper names are lowercase ASCII with hyphens and digits — `a4`,
/// `us-letter`, `presentation-16-9`. Anything else is dropped rather than
/// escaped: this value is interpolated into the prelude, and `paper: "a4\"`
/// used to close the literal early and fail the whole document with "unclosed
/// delimiter" pointing at the prelude instead of at the setting.
/// A language tag reduced to what Typst will actually accept: an ISO 639
/// two- or three-letter code, e.g. `en`, `he`, `yid`.
///
/// Anything else becomes empty, which falls back to the direction default.
/// Filtering the characters is not enough on its own: Typst rejects a tag of the
/// wrong *length* outright, and a rejected tag fails the whole compile with
/// "expected two or three letter language code" — an error about code the writer
/// never wrote, over a setting they may not know exists. Same rule as the
/// numeric fields: refuse the impossible value here, where it can still be
/// ignored, rather than pass it on and blank someone's document.
fn sanitize_lang(l: &str) -> String {
    // A region subtag is a legitimate thing to send (`pt-BR`); Typst carries it
    // separately, so keep the language and drop the rest rather than refusing.
    let base = l.split('-').next().unwrap_or("");
    let letters: String = base
        .chars()
        .filter(char::is_ascii_alphabetic)
        .collect::<String>()
        .to_ascii_lowercase();
    if (2..=3).contains(&letters.len()) {
        letters
    } else {
        String::new()
    }
}

/// The language a document is actually typeset in: the explicit tag when there
/// is one, otherwise the one that goes with its direction.
///
/// Hebrew is the default because Ksav is Hebrew-first, but a left-to-right
/// document is an English one until told otherwise — typesetting it as Hebrew
/// costs it hyphenation and gives it the wrong quotation marks.
pub fn effective_lang(cfg: &DocConfig) -> &str {
    if !cfg.lang.is_empty() {
        &cfg.lang
    } else if cfg.dir == "ltr" {
        "en"
    } else {
        "he"
    }
}

fn sanitize_paper(p: &str) -> String {
    p.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect::<String>()
        .to_ascii_lowercase()
}

impl DocConfig {
    /// Read a config from a JSON object, keeping defaults for missing keys.
    ///
    /// Every numeric field is range-checked. A request that asks for something
    /// impossible gets the nearest possible thing rather than silently garbage
    /// output — see `clamped`.
    pub fn from_json(v: &serde_json::Value) -> DocConfig {
        let mut cfg = DocConfig::default();
        if let Some(f) = v.get("font").and_then(|x| x.as_str()) {
            if !f.is_empty() {
                cfg.font = f.to_string();
            }
        }
        // 1pt is legible-under-a-loupe; 400pt is a poster. Outside that range
        // the number is a mistake, not a choice.
        if let Some(s) = clamped(&mut cfg, v, "size_pt", 1.0, 400.0) {
            cfg.size_pt = s;
        }
        if let Some(d) = v.get("dir").and_then(|x| x.as_str()) {
            // The one config string that was never sanitised: `"RTL"` reached
            // the prelude whole, named no direction anything compared against,
            // and silently meant whatever the reader's default was. Two tags
            // exist, said either case; anything else is dropped here, where it
            // arrives.
            let clean = d.trim().to_ascii_lowercase();
            if clean == "rtl" || clean == "ltr" {
                cfg.dir = clean;
            }
        }
        // Sanitised like `paper`, and for the same reason: it is formatted into
        // the prelude as a string literal, so it may only ever be a tag.
        if let Some(l) = v.get("lang").and_then(|x| x.as_str()) {
            cfg.lang = sanitize_lang(l);
        }
        if let Some(n) = v.get("numbering").and_then(|x| x.as_bool()) {
            cfg.numbering = n;
        }
        if let Some(j) = v.get("justify").and_then(|x| x.as_bool()) {
            cfg.justify = j;
        }
        if let Some(a) = v.get("text_align").and_then(|x| x.as_str()) {
            // Sanitised on the way in rather than on the way out, so a nonsense
            // value is dropped where it arrives instead of reaching the prelude
            // as a string that names no alignment and silently does nothing.
            cfg.text_align = sanitize_text_align(a);
        }
        if let Some(l) = clamped(&mut cfg, v, "line_spacing_em", 0.0, 10.0) {
            cfg.line_spacing_em = l;
        }
        if let Some(p) = clamped(&mut cfg, v, "para_spacing_em", 0.0, 20.0) {
            cfg.para_spacing_em = p;
        }
        if let Some(fi) = clamped(&mut cfg, v, "first_line_indent_em", 0.0, 20.0) {
            cfg.first_line_indent_em = fi;
        }
        // More columns than this on any real paper is a column of single
        // letters; the layout succeeds and the document is unreadable.
        if let Some(c) = clamped(&mut cfg, v, "columns", 1.0, 12.0) {
            cfg.columns = c as u32;
        }
        if let Some(p) = v.get("paper").and_then(|x| x.as_str()) {
            let clean = sanitize_paper(p);
            if !clean.is_empty() {
                cfg.paper = clean;
            }
        }
        if let Some(h) = v.get("hebrew_numbering").and_then(|x| x.as_bool()) {
            cfg.hebrew_numbering = h;
        }
        if let Some(h) = v.get("header").and_then(|x| x.as_str()) {
            cfg.header = h.to_string();
        }
        if let Some(f) = v.get("footer").and_then(|x| x.as_str()) {
            cfg.footer = f.to_string();
        }
        if let Some(n) = clamped(&mut cfg, v, "notes_region_cm", 0.0, 20.0) {
            cfg.notes_region_cm = Some(n);
        }
        if let Some(p) = v.get("reserve_overflow").and_then(|x| x.as_str()) {
            cfg.reserve_overflow = p.to_string();
        }
        // Read through `clamped` like every other number, so a value outside the
        // range is **reported** rather than quietly used — which is the whole of
        // #15, and a cap nobody was told about is a cap that did not happen.
        //
        // The pair is then made coherent. A document asking to be *refused*
        // earlier than it is *warned* about has asked for two contradictory
        // things, and the honest resolution is the nearest coherent one plus a
        // sentence: the soft limit is the one the writer will actually read.
        if let Some(n) = clamped(&mut cfg, v, "max_lines_warn", 1_000.0, 100_000_000.0) {
            cfg.max_lines_warn = n;
        }
        if let Some(n) = clamped(&mut cfg, v, "max_lines_refuse", 1_000.0, 100_000_000.0) {
            cfg.max_lines_refuse = n;
        }
        if cfg.max_lines_refuse < cfg.max_lines_warn {
            let asked = cfg.max_lines_refuse;
            cfg.max_lines_refuse = cfg.max_lines_warn;
            cfg.refusals.push(Refusal {
                key: "max_lines_refuse".into(),
                asked,
                used: cfg.max_lines_refuse,
            });
        }
        // Per-edge margins are clamped on the same range as the uniform one, and
        // stay `None` when absent — an absent edge means "use margin_cm", which
        // is not the same as an edge explicitly set to zero.
        // The range is deliberately wide — 1 cm to 200 cm covers a bentcher and
        // a wall poster — because refusing a size somebody actually prints is
        // worse than laying one out that they will look at once.
        {
            let w = clamped(&mut cfg, v, "page_width_cm", 1.0, 200.0);
            let h = clamped(&mut cfg, v, "page_height_cm", 1.0, 200.0);
            if let (Some(w), Some(h)) = (w, h) {
                cfg.page_width_cm = Some(w);
                cfg.page_height_cm = Some(h);
            }
        }

        // **A margin's limit is the paper's, not a number chosen in advance.**
        //
        // It was 7 cm, which is not a limit — an A4 sheet is 29.7 cm tall and a
        // bentcher is larger. It is the size at which somebody stopped thinking
        // about it, and it was not only arbitrary: it was *silent*. A request for a
        // 21.7 cm seam came back laid out at 7 cm with no diagnostic, so a document
        // came off the printer as though the setting had never been written. #15
        // measured that as "the first compile fell back to default margins" and
        // read it as a layout problem; it was a reporting one.
        //
        // So the bound is **the sheet minus a printable minimum**: as much of the
        // page as the writer asked for, and never so much that no text is left. A
        // value that leaves nothing is still refused — and now says so, which is
        // the whole of what was missing.
        let (sheet_w, sheet_h) = sheet_cm_of(&cfg);

        // **`margin_cm` is bounded by the sheet, and it is bounded here rather
        // than where it used to be.** It was `0.0..7.0`, with the comment
        // *"half of the short side of A5"* — and 7 is the A5 *instance* of a
        // rule that is right on every sheet: a uniform margin lands on **both**
        // edges of each axis, so the honest bound is `2m ≤ short_side −
        // MIN_TEXT_CM`. That is 6.9cm for A5, **10.0cm for A4**, 14.35 for A3.
        //
        // #15 replaced the hardcoded 7 with the sheet on the per-edge path and
        // left the constant standing here — on the path almost every document
        // takes, since four `None` edges mean "use `margin_cm`". So the fix was
        // applied to half the settings, and `margin_cm: 9` on A4 was still being
        // refused as out of range. It also could not have been fixed in place:
        // this line ran *before* the page size was read, so the sheet was not
        // known yet. **A bound that depends on the sheet has to be evaluated
        // after the sheet is known**, which is the whole lesson of #15.
        let uniform_hi = ((sheet_w.min(sheet_h) - MIN_TEXT_CM) / 2.0).max(0.0);
        if let Some(m) = clamped(&mut cfg, v, "margin_cm", 0.0, uniform_hi) {
            cfg.margin_cm = m;
        }

        for (key, lo, hi) in [
            ("margin_top_cm", 0.0, (sheet_h - MIN_TEXT_CM).max(0.0)),
            ("margin_bottom_cm", 0.0, (sheet_h - MIN_TEXT_CM).max(0.0)),
            ("margin_inner_cm", 0.0, (sheet_w - MIN_TEXT_CM).max(0.0)),
            ("margin_outer_cm", 0.0, (sheet_w - MIN_TEXT_CM).max(0.0)),
        ] {
            // The value is resolved before the slot is taken, because `clamped`
            // needs the config to record into and the slot is a borrow of it.
            let m = clamped(&mut cfg, v, key, lo, hi);
            let slot = match key {
                "margin_top_cm" => &mut cfg.margin_top_cm,
                "margin_bottom_cm" => &mut cfg.margin_bottom_cm,
                "margin_inner_cm" => &mut cfg.margin_inner_cm,
                _ => &mut cfg.margin_outer_cm,
            };
            if let Some(m) = m {
                *slot = Some(m);
            }
        }
        // ---- opposing margins, checked as a pair
        //
        // Each edge above is bounded by `sheet − MIN_TEXT_CM`, and bounded
        // *individually*, which answers *"is this margin bigger than the paper?"*
        // and does not answer *"are these two margins bigger than the paper
        // between them."* So both could be legal and together consume the page:
        // `margin_inner_cm: 20, margin_outer_cm: 20` on A4 is 20 ≤ 20 on each
        // edge, accepted without a word, and hands back a text region **19cm
        // wider than the sheet**.
        //
        // **A value the writer did not set is never the one moved.** An absent
        // edge is standing in for `margin_cm`, which is a default, and the app
        // un-choosing on the writer's behalf is the exact defect #15 was filed
        // about — so when only one edge of a pair was asked for, that is the edge
        // that gives way. When both were asked for, the *second* one does and the
        // diagnostic names it and says what it became: the order is arbitrary,
        // and a wrong reference is worse than none, so it is better to be
        // deterministic and loud than clever and silent.
        for (a_key, b_key, allow) in [
            ("margin_top_cm", "margin_bottom_cm", sheet_h - MIN_TEXT_CM),
            ("margin_inner_cm", "margin_outer_cm", sheet_w - MIN_TEXT_CM),
        ] {
            let (a_set, b_set) = (margin_slot(&cfg, a_key), margin_slot(&cfg, b_key));
            let a = a_set.unwrap_or(cfg.margin_cm);
            let b = b_set.unwrap_or(cfg.margin_cm);
            if a + b <= allow {
                continue;
            }
            let (key, asked, other) = match (a_set, b_set) {
                (Some(_), None) => (a_key, a, b),
                (None, Some(_)) => (b_key, b, a),
                // **The larger margin gives way**, not the second one. The first
                // version of this took the second, and it was wrong in a way the
                // pre-existing fence caught at once: `inner 13, outer 0` on a
                // 10.5cm sheet is over by 3.5cm, so "the second" clamped
                // `outer` to 0 — where it already was — and left `inner` at 13.
                // The pair was still 4.5cm too wide and the document laid out
                // anyway. Moving the larger makes the pair sum to exactly the
                // allowance, and the other edge is by construction the smaller,
                // so the result is never negative. A tie goes to the second, so
                // the choice is total and reproducible.
                (Some(_), Some(_)) if a > b => (a_key, a, b),
                (Some(_), Some(_)) => (b_key, b, a),
                (None, None) => continue,
            };
            let used = (allow - other).max(0.0);
            if let Some(slot) = margin_slot_mut(&mut cfg, key) {
                *slot = Some(used);
            }
            cfg.refusals.push(Refusal { key: key.to_string(), asked, used });
        }

        if let Some(g) = clamped(&mut cfg, v, "gutter_cm", 0.0, 5.0) {
            cfg.gutter_cm = g;
        }
        // A custom page size, in centimetres. **Both or neither**: Typst's
        // `width`/`height` override `paper` entirely, so a width with no height
        // would keep the named paper's height and produce a shape nobody asked
        // for. A request that sends one is treated as having sent nothing,
        // which leaves the named paper doing its job rather than half of it.
        //
        if let Some(t) = v.get("two_sided").and_then(|x| x.as_bool()) {
            cfg.two_sided = t;
        }
        for (key, slot) in [
            ("header_even", &mut cfg.header_even),
            ("header_odd", &mut cfg.header_odd),
            ("footer_even", &mut cfg.footer_even),
            ("footer_odd", &mut cfg.footer_odd),
            ("title", &mut cfg.title),
            ("author", &mut cfg.author),
        ] {
            if let Some(s) = v.get(key).and_then(|x| x.as_str()) {
                *slot = s.to_string();
            }
        }
        if let Some(a) = v.get("head_align").and_then(|x| x.as_str()) {
            cfg.head_align = sanitize_head_align(a);
        }
        if let Some(k) = v.get("keywords").and_then(|x| x.as_array()) {
            cfg.keywords = k
                .iter()
                .filter_map(|s| s.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(str::to_string)
                .collect();
        }
        if let Some(s) = v.get("pdf_standard").and_then(|x| x.as_str()) {
            cfg.pdf_standard = s.trim().to_ascii_lowercase();
        }
        if let Some(t) = v.get("pdf_tagged").and_then(|x| x.as_bool()) {
            cfg.pdf_tagged = t;
        }
        if let Some(p) = v.get("pdf_pages").and_then(|x| x.as_str()) {
            cfg.pdf_pages = p.to_string();
            // **Recorded here, where the request is read, and not at export
            // time.** Before, a token that named no page was dropped in silence
            // and the empty result was read as "no restriction" — so `0` exported
            // the whole sefer, and `0-5` exported pages 1–5, and neither said a
            // word. A refusal only reachable on the export path is a refusal
            // nobody sees until they have already printed.
            //
            // The sentence comes from `page_spec_refusal` so this and
            // `spec_refusals_of` — which covers a `DocConfig` built without
            // `from_json` — cannot say different things about the same token.
            for token in parse_page_spec(p).bad {
                cfg.spec_refusals.push(page_spec_refusal(&cfg, token));
            }
        }
        if let Some(o) = v.get("prevent_orphans").and_then(|x| x.as_bool()) {
            cfg.prevent_orphans = o;
        }
        if let Some(c) = v.get("separate_volume").and_then(|x| x.as_bool()) {
            cfg.separate_volume = c;
        }
        if let Some(c) = v.get("continuous").and_then(|x| x.as_bool()) {
            cfg.continuous = c;
        }
        cfg
    }
}

/// The three head placements, in the prelude's own vocabulary.
///
/// Accepts either language on the wire — the app speaks English keys and a
/// writer editing the document speaks Hebrew — and anything unrecognised
/// becomes centred rather than being passed through, since this value reaches
/// the prelude as a string literal and an unknown one would silently pick a
/// branch nobody asked for.
///
/// The prelude states the same four-spellings-each table in `יישור_כותרת`'s two
/// `in (…)` tuples, and it has to: this narrows to three canonical values before
/// the source is assembled, but the prelude is also published for hand-written
/// use, where nothing has narrowed anything. Public so that
/// `tests/one_want.rs` can hold the two tables to each other — a spelling one
/// side accepts and the other does not falls through to centred, which is a
/// running head in the wrong place and no error anywhere.
/// The three edges the text can sit at, or empty for "take `justify`".
///
/// Both spellings, like every other name a writer can type: the editor sends the
/// English word and somebody calling `#מסמך` by hand writes the Hebrew one.
/// Anything else is empty rather than a guess — an unrecognised alignment must
/// fall back to what the document already said, not to an edge nobody chose.
pub fn sanitize_text_align(a: &str) -> String {
    match a.trim() {
        "right" | "ימין" => "right",
        "center" | "centre" | "מרכז" | "אמצע" => "center",
        "left" | "שמאל" => "left",
        _ => "",
    }
    .to_string()
}

pub fn sanitize_head_align(a: &str) -> String {
    match a.trim() {
        "outside" | "outer" | "חוץ" | "חיצוני" => "outside",
        "inside" | "inner" | "פנים" | "פנימי" => "inside",
        _ => "center",
    }
    .to_string()
}

/// One page bound: `None` means "open" — the start of the document for a
/// missing `from`, the end of it for a missing `to`.
type PageBound = Option<std::num::NonZeroUsize>;
/// What a `pdf_pages` spec turned out to mean.
#[derive(Debug, Default, Clone, PartialEq)]
struct PageSpec {
    /// The ranges the writer named, in the order they were written. Empty when
    /// every token was refused, which is **not** the same as "no restriction".
    ranges: Vec<std::ops::RangeInclusive<PageBound>>,
    /// The tokens that named no page, exactly as written, so a diagnostic can
    /// quote the writer's own mistake back at them.
    bad: Vec<String>,
    /// Whether the request asked for a restriction at all. `false` for an
    /// absent or blank `pdf_pages`, which is the one legitimate way to mean
    /// every page.
    restricted: bool,
}

/// One end of a page range, and it has **three** answers rather than two.
///
/// # Why two was the bug
///
/// The first version of this fix had `page_num` return `Option<NonZeroUsize>`,
/// exactly like the parser it replaced — and reintroduced #59 on the way. `None`
/// has to mean both *"there was no bound here"* (`5-`, an open end) and *"the
/// bound here is not a page"* (`0`, `x`). A caller cannot tell them apart, so it
/// read garbage as an open bound: `0-5` parsed as *pages 1 through 5*, which is
/// the precise silent wrong-answer the issue was filed about, and its own test
/// caught it on the first run.
///
/// The three answers are: a page, an open end, and **rubbish**. Rubbish is the
/// one the two-valued version could not say.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Bound {
    /// A real page. Pages are one-indexed, so never zero.
    Page(std::num::NonZeroUsize),
    /// No bound was written: `5-` runs to the end, `-9` runs from the first.
    Open,
    /// Something was written and it is not a page.
    Rubbish,
}

/// Read one end of a range.
///
/// **Empty is `Open` and only empty is `Open`.** Everything else has to be a
/// positive integer or it is `Rubbish` — and that is the distinction the whole of
/// #59 rests on. `0` is `Rubbish` because page zero does not exist; `00` and
/// `+5` and `٣` are `Rubbish` for the same reason `x` is.
fn read_bound(s: &str) -> Bound {
    let t = s.trim();
    if t.is_empty() {
        return Bound::Open;
    }
    match t.parse::<usize>() {
        // `0` parses, so `NonZeroUsize::new` is the check that says no — and it
        // says no *here*, where a caller can act on it, rather than by returning
        // the same `None` an open bound returns.
        Ok(0) => Bound::Rubbish,
        Ok(n) => std::num::NonZeroUsize::new(n).map_or(Bound::Rubbish, Bound::Page),
        Err(_) => Bound::Rubbish,
    }
}

impl Bound {
    /// The `Option` a `RangeInclusive` is built from, or `None` for rubbish.
    fn as_page_bound(self) -> Option<PageBound> {
        match self {
            Bound::Page(n) => Some(Some(n)),
            Bound::Open => Some(None),
            Bound::Rubbish => None,
        }
    }
}

/// Parse `1,3,5-9` into Typst page ranges, one-indexed and inclusive.
///
/// `5-` means "from 5 to the end" and `-9` means "up to 9", which is what makes
/// `None` a legitimate bound rather than an error.
///
/// # The grammar is `pagerange.ts`'s, deliberately
///
/// The editor has always parsed this field itself — `app/src/pagerange.ts` —
/// and that parser keeps the tokens it cannot read in a `bad` list so somebody
/// can be told. The two were the same grammar written twice and compared by
/// nothing, which is how a client and a server come to disagree about what `5-`
/// means. This is now the **same grammar as the app's**, so the two cannot drift
/// again, and it fixes three cases the old one got silently wrong:
///
/// | spec | old | now |
/// |---|---|---|
/// | `0` | empty list → **every page** | refused, and named |
/// | `0-5` | pages 1–5, no error | refused, and named |
/// | `9-2` | an empty range → **no pages** | refused, and named |
///
/// A refused token is still dropped rather than fatal — an export that omits one
/// malformed range still produces the pages the writer *did* name, where
/// refusing produces no PDF at all over a typo in one field. But a spec in which
/// **every** token is refused is no longer the same answer as an empty box: it
/// is a mistake, it is named, and [`pdf_options`] refuses the export rather than
/// answering it with every page.
fn parse_page_spec(spec: &str) -> PageSpec {
    let text = spec.trim();
    if text.is_empty() {
        return PageSpec::default();
    }
    let mut out = PageSpec {
        restricted: true,
        ..PageSpec::default()
    };
    for raw in text.split(',') {
        let part = raw.trim();
        if part.is_empty() {
            continue;
        }
        let Some(dash) = part.find('-') else {
            match read_bound(part).as_page_bound() {
                Some(n) => out.ranges.push(n..=n),
                None => out.bad.push(part.to_string()),
            }
            continue;
        };
        let (lo, hi) = (
            read_bound(&part[..dash]),
            read_bound(&part[dash + 1..]),
        );
        // Any rubbish end takes the whole token with it. `0-5` is **not** "up to
        // 5" — it is a writer who typed a page that does not exist, and reading
        // it as an open bound is the exact silent wrong-answer #59 opened with.
        let (Some(lo), Some(hi)) = (lo.as_page_bound(), hi.as_page_bound()) else {
            out.bad.push(part.to_string());
            continue;
        };
        // A bare `-` names nothing; without this it would read as "every page"
        // and quietly swallow the rest of the spec.
        if lo.is_none() && hi.is_none() {
            out.bad.push(part.to_string());
        } else if matches!((lo, hi), (Some(a), Some(b)) if b < a) {
            // Backwards. The old parser emitted `Some(9)..=Some(2)`, an empty
            // range that matches no page — so `9-2` exported **nothing** and
            // said nothing, which is the same failure as `0` in the other
            // direction: a typo, silently, in either direction.
            out.bad.push(part.to_string());
        } else {
            out.ranges.push(lo..=hi);
        }
    }
    out
}

/// The ranges for [`pdf_options`], or `None` for "export every page".
///
/// The distinction is the whole of #59. `None` — every page — is only ever the
/// answer to **no spec at all**, or to a spec that named at least one page. A
/// spec that named pages and had every one of them refused is an `Err`, not a
/// `None`: it used to be a `None`, and that is how a typo in one field exported
/// the whole sefer.
fn page_ranges_for_export(spec: &PageSpec) -> Result<Option<Vec<std::ops::RangeInclusive<PageBound>>>, String> {
    if !spec.restricted {
        return Ok(None);
    }
    if spec.ranges.is_empty() {
        // **Quoted**, like every other place a token is quoted back. The
        // `spec_refusals` warning says `"0-5"`, and an error saying `0-5` while
        // the warning says `"0-5"` is two shapes for one fact. It also matters
        // for legibility: `-` and `0` unquoted in a list of tokens is a
        // sentence nobody can parse.
        let named = if spec.bad.is_empty() {
            "nothing".to_string()
        } else {
            spec.bad
                .iter()
                .map(|t| format!("{t:?}"))
                .collect::<Vec<_>>()
                .join(", ")
        };
        return Err(format!(
            "pdf_pages named no page at all (offending token(s): {named}) — \
             refusing to export the whole document"
        ));
    }
    Ok(Some(spec.ranges.clone()))
}

pub use diagnostics::Diagnostic;

/// Result of a compile pass.
#[derive(Debug, Default)]
pub struct Compiled {
    /// Whether the document laid out at all.
    ///
    /// An explicit flag, not `pdf.is_some()`: previews no longer render a PDF,
    /// and inferring success from a artefact the caller asked us not to produce
    /// would report every successful preview as a failure.
    pub ok: bool,
    /// PDF bytes for export (None if compilation failed or none was asked for).
    pub pdf: Option<Vec<u8>>,
    /// One SVG string per page, for the live preview.
    pub pages_svg: Vec<String>,
    /// One fingerprint per page, in page order.
    ///
    /// Computed from the laid-out page rather than from its SVG, which is what
    /// lets a page the caller already holds be skipped *before* it is
    /// serialised. An entry in `pages_svg` is the empty string exactly when its
    /// fingerprint was in the caller's `have` set.
    pub pages_hash: Vec<String>,
    /// Errors and warnings from the real Typst compiler.
    pub diagnostics: Vec<Diagnostic>,
    /// The full assembled Typst source (prelude + wrapper + body) — the
    /// "export to plain Typst" output.
    ///
    /// Empty unless it was asked for. It is the prelude plus the document, so it
    /// is never smaller than 75 KB, and it used to ride on every keystroke-driven
    /// preview: of an 84 KB response for a one-page document, 75 KB was this and
    /// 4 KB was the page. Exactly one caller reads it — "export .typ" — and that
    /// one compiles for itself. Same story as `pdf`, same answer.
    pub typst_source: String,
    /// Which of the writer's lines printed on each page, in page order.
    ///
    /// Empty unless [`Wants::lines`] asked for it. See [`crate::pagelines`] for
    /// what a run is and why a page reports several of them.
    pub pages_lines: Vec<Vec<pagelines::LineRun>>,
    /// What each page says, in reading order, in page order.
    ///
    /// Empty unless [`Wants::text`] asked for it. See [`crate::pagetext`] for
    /// how a line is assembled and why the walk order is the reading order.
    pub pages_text: Vec<Vec<pagetext::PageLine>>,
    /// Every marker the layout printed, paired with the prose beside it.
    ///
    /// Empty unless [`Wants::markers`] asked for it. Not a list of notes and not
    /// in note order — see [`crate::notemarks`] for what the caller still has to
    /// do with it.
    pub note_markers: Vec<notemarks::NoteMarker>,
}

/// What a compile should carry back, as opposed to what it compiles.
///
/// Three flags that were three positional booleans, which is one more than a
/// reader can hold: `compile_parts(body, &cfg, &assets, false, false, &have)`
/// says nothing about which `false` is the PDF. None of these changes what is
/// laid out — every one of them is about a part of the answer that costs real
/// time to produce and that most callers throw away.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Wants {
    /// The PDF bytes. Around 300 KB per keystroke-driven compile of a 16-page
    /// document, never read by a preview.
    pub pdf: bool,
    /// The assembled Typst source: the prelude plus the document, so never
    /// smaller than 75 KB. One caller, and it compiles for itself.
    pub source: bool,
    /// Which lines printed on which page. One walk over the laid-out frames and
    /// one re-parse of the main source; read only by a narrowed preview.
    pub lines: bool,
    /// What each note's marker printed as. The same walk and the same re-parse
    /// as `lines`, and read only by the notes drawer while it is open.
    pub markers: bool,
    /// What each page printed. The same walk and the same re-parse as `lines`,
    /// and read only by a search that has been told to look at the preview.
    pub text: bool,
}

impl Wants {
    /// What an export asks for: the bytes and the Typst behind them.
    ///
    /// Not "everything". `lines` is off here on purpose — an export produces a
    /// file, and which of the writer's lines landed on which page is a question
    /// only a pane on a screen has.
    pub fn export() -> Self {
        Self {
            pdf: true,
            source: true,
            lines: false,
            markers: false,
            // An export produces a file. What the pages *say* is a question
            // only a search on a screen has, for the same reason `lines` is
            // off here.
            text: false,
        }
    }
}

impl Compiled {
    pub fn ok(&self) -> bool {
        self.ok
    }
}

/// Escape a string for embedding as a Typst string literal.
///
/// The backslash must be doubled *first*: escaping the quote first would turn
/// `"` into `\"` and the following pass would then turn that backslash into
/// `\\"`, closing the literal after all. Every value interpolated into the
/// prelude goes through this or through `sanitize_paper`; nothing else is
/// allowed to build a string literal by hand, which is how `font` and `paper`
/// came to miss the backslash case that `header`/`footer` handled correctly.
fn typst_str(s: &str) -> String {
    escape::string_literal(s)
}

/// `typst_str`, or the literal `none` when the string is empty.
fn typst_str_or_none(s: &str) -> String {
    if s.is_empty() {
        "none".to_string()
    } else {
        typst_str(s)
    }
}

/// A length in cm, or the literal `none` when the edge was never set.
fn typst_cm_or_none(v: Option<f64>) -> String {
    match v {
        Some(n) => format!("{n}cm"),
        None => "none".to_string(),
    }
}

/// A Typst array literal of strings.
fn typst_str_array(items: &[String]) -> String {
    // The trailing comma matters for the one-element case: `("a")` is a
    // parenthesised string in Typst, not an array of one, and `keywords:`
    // would reject it.
    format!(
        "({})",
        items
            .iter()
            .map(|s| format!("{},", typst_str(s)))
            .collect::<String>()
    )
}

/// The virtual path the prelude is registered at, and the name a document
/// imports it by.
///
/// It is a *file* now, and that is the whole of change #23. See
/// [`prelude_source`].
pub const PRELUDE_PATH: &str = "ksav.typ";

/// The line every compiled document opens with.
const IMPORT_LINE: &str = "#import \"ksav.typ\": *";

/// The prelude and the sefer catalogue, as one parsed Typst file — **once per
/// process**.
///
/// # What this replaces
///
/// Every compile used to hand Typst a single string: the 34 KB sefer catalogue,
/// then the 2,324-line prelude, then the `#show` wrapper, then the writer's
/// text — around 111 KB of which ~110 KB was identical to the last keystroke's.
/// Typst re-parsed all of it, every time, and then two more things did:
/// `Located::of` copied and parsed it a second time to resolve any span, and
/// `body_offset` re-ran the whole `format!` with an empty body to learn one
/// integer.
///
/// Worse than the cost was what it did to the diagnostics. A span into the
/// prelude and a span into the writer's text were the *same file* at different
/// byte offsets, so telling them apart meant arithmetic, and naming the command
/// a prelude span belonged to meant scanning backwards through 111 KB for the
/// nearest column-0 `#let` — a rule held by spelling convention across 361
/// bindings, which needed its own sweeping test to stay true.
///
/// Now the prelude is a file with a [`FileId`], the document `#import`s it, and
/// Typst is handed a main source that is two lines plus the writer's text. A
/// span carries which file it came from, so "is this the writer's line?" is an
/// identity check rather than a comparison against an offset.
///
/// # Why the catalogue is still inside it
///
/// Because the prelude's index functions close over it — a Typst closure
/// captures the scope it was defined in, so a table defined *after* them is a
/// table they cannot see. That was a real constraint on a concatenation, where
/// it dragged the body's offset around; inside one module file it costs nothing
/// and needs nobody to remember it. Both halves are generated from
/// [`sefarim::SEFARIM`] and `typst/ksav.typ`, which are still the one list and
/// the one prelude.
///
/// # Why a `OnceLock` and not a builder argument
///
/// `Source::new` parses, and a `Source` is `Arc`-backed so handing one out is a
/// pointer copy. Registering this with the engine per compile therefore costs a
/// clone of an `Arc` and a one-entry `HashMap`; parsing 111 KB of Typst happens
/// exactly once, at the first compile of the process.
pub(crate) fn prelude_source() -> &'static typst::syntax::Source {
    use typst::syntax::{RootedPath, Source, VirtualPath, VirtualRoot};
    static IT: std::sync::OnceLock<Source> = std::sync::OnceLock::new();
    IT.get_or_init(|| {
        let vpath = VirtualPath::new(PRELUDE_PATH).expect("a valid virtual path");
        let id = RootedPath::new(VirtualRoot::Project, vpath).intern();
        Source::new(id, prelude_text())
    })
}

/// Where a span points, as a file and a one-based line.
///
/// For `examples/timing.rs`, which turns on Typst's own span recorder and needs
/// to say *which* line of the prelude a `func call` came from. A profile that
/// says "1.7 million function calls" and cannot say whose is a profile that
/// answers the easy half of the question.
pub fn span_line(raw: std::num::NonZeroU64) -> (String, u32) {
    use typst::syntax::{Span, SpanKind};
    let src = prelude_source();
    let start = match Span::from_raw(raw).get() {
        SpanKind::Number { id, num } if id == src.id() => match src.range(num, None) {
            Some(r) => r.start,
            None => return ("<document>".to_string(), 0),
        },
        SpanKind::Range { id, range } if id == src.id() => range.start,
        _ => return ("<document>".to_string(), 0),
    };
    let line = src.lines().byte_to_line(start).unwrap_or(0) + 1;
    (PRELUDE_PATH.to_string(), line as u32)
}

/// The prelude module's text: catalogue, then prelude.
///
/// Shared with [`assemble_source`], which is what makes "export .typ" a
/// self-contained document rather than one that imports a file the writer does
/// not have. One string, two arrangements of it, no second copy of the order.
fn prelude_text() -> String {
    format!("{}\n{}\n", sefarim::typst_table(), PRELUDE)
}

/// The `#show: מסמך.with(…)` line: the editor's settings, as Typst.
///
/// Split out of the assembly because there are two arrangements now — the one
/// the compiler sees and the one "export .typ" writes — and a second copy of
/// twenty-nine formatted parameters is exactly the kind of drift this file has
/// been bitten by before. It takes the body because one parameter is derived
/// from it: `אזור_הערות` reserves space at the foot of the page only when the
/// document actually uses the per-page apparatus.
fn show_rule(body: &str, cfg: &DocConfig) -> String {
    let dir = if cfg.dir == "ltr" { "ltr" } else { "rtl" };
    let columns = cfg.columns.max(1);
    format!(
        "#show: מסמך.with(\
         גופן: {font}, גודל: {size}pt, שוליים: {margin}cm, כיוון: {dir}, שפה: {lang}, \
         מספור: {numbering}, מספור_עברי: {hebrew_num}, נייר: {paper}, \
         רוחב_עמוד: {page_w}, גובה_עמוד: {page_h}, \
         כותרת_עליונה: {header}, כותרת_תחתונה: {footer}, \
         שוליים_עליון: {m_top}, שוליים_תחתון: {m_bot}, \
         שוליים_פנימי: {m_in}, שוליים_חיצוני: {m_out}, \
         שולי_כריכה: {gutter}cm, דו_צדדי: {two_sided}, \
         כותרת_זוגי: {head_even}, כותרת_אי_זוגי: {head_odd}, \
         תחתונה_זוגי: {foot_even}, תחתונה_אי_זוגי: {foot_odd}, \
         יישור_כותרת: {head_align}, \
         כותרת_מסמך: {title}, מחבר: {author}, מילות_מפתח: {keywords}, \
         מניעת_יתומים: {orphans}, רציף: {continuous}, \
         כרך_נפרד: {separate_volume}, \
         יישור: {justify}, ריווח_שורות: {leading}em, ריווח_פסקאות: {para}em, \
         הזחה_ראשונה: {indent}em, טורים: {columns}, אזור_הערות: {region})",
        font = typst_str(&cfg.font),
        size = cfg.size_pt,
        margin = cfg.margin_cm,
        m_top = typst_cm_or_none(cfg.margin_top_cm),
        m_bot = typst_cm_or_none(cfg.margin_bottom_cm),
        m_in = typst_cm_or_none(cfg.margin_inner_cm),
        m_out = typst_cm_or_none(cfg.margin_outer_cm),
        gutter = cfg.gutter_cm,
        page_w = typst_cm_or_none(cfg.page_width_cm),
        page_h = typst_cm_or_none(cfg.page_height_cm),
        two_sided = if cfg.two_sided { "true" } else { "false" },
        head_even = typst_str_or_none(&cfg.header_even),
        head_odd = typst_str_or_none(&cfg.header_odd),
        foot_even = typst_str_or_none(&cfg.footer_even),
        foot_odd = typst_str_or_none(&cfg.footer_odd),
        head_align = typst_str(&sanitize_head_align(&cfg.head_align)),
        title = typst_str_or_none(&cfg.title),
        author = typst_str_or_none(&cfg.author),
        keywords = typst_str_array(&cfg.keywords),
        orphans = if cfg.prevent_orphans { "true" } else { "false" },
        continuous = if cfg.continuous { "true" } else { "false" },
        separate_volume = if cfg.separate_volume { "true" } else { "false" },
        dir = dir,
        lang = typst_str(effective_lang(cfg)),
        numbering = if cfg.numbering { "true" } else { "false" },
        hebrew_num = if cfg.hebrew_numbering {
            "true"
        } else {
            "false"
        },
        paper = typst_str(&sanitize_paper(&cfg.paper)),
        header = typst_str_or_none(&cfg.header),
        footer = typst_str_or_none(&cfg.footer),
        // One parameter carrying both readings of one control: `true`/`false`
        // when the answer is "justified or not", and a name when it is "at which
        // edge". `יישור` takes either — see the prelude — so the pair the panel
        // writes together stays one value all the way to the page.
        justify = match sanitize_text_align(&cfg.text_align).as_str() {
            "" => {
                if cfg.justify {
                    "true".to_string()
                } else {
                    "false".to_string()
                }
            }
            edge => typst_str(edge),
        },
        leading = cfg.line_spacing_em,
        para = cfg.para_spacing_em,
        indent = cfg.first_line_indent_em,
        columns = columns,
        // The sheet is handed in because a `%` region height is a percentage of
        // it, and Rust is the half of this that has to turn the writer's `15%`
        // into the centimetres it takes off the bottom margin.
        region = reserve_region_expr(body, cfg),
    )
}

/// The value the wrapper hands `מסמך` for `אזור_הערות`, as Typst source.
///
/// The scan is the second pass; the configured number overrides it under the
/// document's own overflow policy. Shared between the injected wrapper and
/// [`inject_reserve_into_writer_masmer`], so a writer who opens their own
/// `#מסמך(...)` gets exactly the reserve a bare body would have got.
fn reserve_region_expr(body: &str, cfg: &DocConfig) -> String {
    let need = auto_notes_region_cm_sheet(body, sheet_height_cm(cfg));
    match cfg.notes_region_cm {
        // Nothing declared: the scan is the reserve, and zero means no
        // apparatus at all.
        None => {
            if need > 0.0 {
                format!("{need}cm")
            } else {
                "none".to_string()
            }
        }
        Some(w) => {
            // A writer-fixed strip smaller than what its regions declare:
            // "grow" (the default) raises it to hold them, "flow" keeps the
            // writer's number, and "refuse" never reaches here -
            // `compile_doc_with` stops it first.
            let fits = need <= w || need <= 0.0;
            if fits || cfg.reserve_overflow == "flow" {
                if w > 0.0 {
                    format!("{w}cm")
                } else {
                    "none".to_string()
                }
            } else {
                format!("{need}cm")
            }
        }
    }
}

/// A writer-level `#מסמך(...)` in the body becomes the document's own margin
/// setup — and its `אזור_הערות` default is *reserve nothing*, which wiped the
/// scanned reserve the injected wrapper had set and sent every foot-band entry
/// into the bottom margin with the page number behind it. Found by the stress
/// sitting of 25 August: any document opening with its own `#מסמך(...)`
/// printed its apparatus off the paper while the identical document without
/// the wrapper laid out perfectly.
///
/// So when that call does not name the reserve itself, the scanned answer is
/// written into it — the same surgery [`grow_inline_reserve`] performs on the
/// inline number, and for the same reason: the prelude cannot inherit through
/// a nested call, because the nested margin setup would still need the value.
/// An explicit writer value is left exactly where it stands; policy answers
/// to it live in `compile_doc_with`.
///
/// **Off the parse, for #58's reason.** This used to scan for a `#` and read
/// the identifier after it, so a commented-out `#מסמך(` — which is what the
/// editor's own "comment out" command writes, and is how a writer parks a
/// wrapper while they decide about it — had an `אזור_הערות:` argument injected
/// into the middle of a comment. The same disease as the two readers it sits
/// beside, and the same single fix.
fn inject_reserve_into_writer_masmer(body: &str, region_expr: &str) -> String {
    let Some(m) = find_writer_masmer(body) else {
        return body.to_string();
    };
    // A writer who named the reserve keeps their number, exactly.
    if !m.reserve.is_empty() {
        return body.to_string();
    }
    let at = m.args_open;
    // Checked for the same reason `grow_inline_reserve` checks its own span:
    // this rewrites a writer's document, so an out-of-range offset must leave
    // the document alone rather than panic. `body.split_at` is the safe form of
    // the same thing and returns the two halves on success.
    let Some((head, tail)) = body.split_at_checked(at) else {
        return body.to_string();
    };
    if !m.has_parens {
        // The bare `#מסמך[…]` form has no argument list at all; one is minted
        // ahead of the body bracket.
        return format!("{head}(אזור_הערות: {region_expr}){tail}");
    }
    let sep = if tail.trim_start().is_empty() { "" } else { ", " };
    format!("{head}אזור_הערות: {region_expr}{sep}{tail}")
}

/// What the compiler is actually handed: two lines and the writer's text.
///
/// ```text
/// #import "ksav.typ": *
/// #show: מסמך.with(…)
///
/// {body}
/// ```
///
/// The prelude reaches the document as a resolved file rather than as 111 KB of
/// prefix, so Typst parses it once per process instead of once per keystroke,
/// and a diagnostic that came from inside it carries a different [`FileId`]
/// rather than a smaller byte offset.
///
/// **The body still sits in this file rather than in one of its own**, and it is
/// worth saying why, because a `#include "body.typ"` would have made the
/// writer's line numbers exact with no arithmetic at all. Typst gives an
/// included file **its own scope**: it would not see the import above it, so
/// every `#הדגשה` in the writer's text would be an unknown variable. That is the
/// same fact `include.rs` opens with, and it is why `#כלול` is expanded
/// textually by the engine. So there is a prefix, it is two lines and a blank
/// one, and [`diagnostics::body_offset_of`] measures it by subtraction off the
/// two strings the caller already holds.
/// Where the writer's own `#מסמך(…)` keeps its notes reserve, read off the
/// **parsed** tree rather than off the text.
///
/// #58, and the whole of it
///
/// [`inline_reserve_cm`] and [`grow_inline_reserve`] used to `body.find("אזור_הערות")`
/// and read a number after the colon. That found the name wherever it was, and
/// the name is not a rare string — a writer explaining the setting, a `//` line
/// parked while they think, or a string argument all contain it verbatim, and
/// `find` cannot tell those from a call. A document that merely *mentions*
/// `אזור_הערות:` had its page-foot reserve rewritten to whatever the apparatus
/// scan wanted, silently, on every compile.
///
/// `auto_notes_region_cm` stopped having this bug years ago — its own test says
/// *"with the parser now doing the lexing"* — so this is the last hand-rolled
/// scan of its kind, and the right shape was already in the file.
///
/// # One resolution, three callers
///
/// The apparatus scan resolves off the tree and the inline reserve did not, so
/// the same document could answer two different questions about one setting
/// depending on which function ran first. All three of the functions that touch
/// the writer's inline reserve — read it, grow it, and inject it when it is
/// absent — now come through here, so there is one answer to "what does this
/// writer's `#מסמך` say about the reserve", and it is the parsed one.
#[derive(Debug, Clone)]
struct WriterMasmer {
    /// The value of the reserve argument as written — `3.5cm`, `2.5`, `auto`.
    /// Empty when the call does not carry the argument at all, which is the
    /// answer [`inject_reserve_into_writer_masmer`] needs.
    reserve: String,
    /// Byte offset of that value in the body, so it can be rewritten in place.
    reserve_at: Option<(usize, usize)>,
    /// Byte offset of the character just inside the argument list, so an absent
    /// argument can be written there.
    args_open: usize,
    /// Whether the call had an argument list to write into, as opposed to the
    /// bare `#מסמך[…]` form which has to be given one.
    has_parens: bool,
}

/// The two spellings of the reserve argument, as the writer may write either.
const RESERVE_ARGS: [&str; 2] = ["אזור_הערות", "notes_region"];
/// The two spellings of the wrapper this reserve belongs to.
const MASMER_NAMES: [&str; 2] = ["מסמך", "masmer"];

/// The first `#מסמך(…)` in `body` that carries a reserve argument, resolved off
/// the parse.
///
/// Returns `None` when there is no such call — including when there *is* a
/// `#מסמך` but its argument list is still unbalanced and the parser could not
/// read it. That is the honest answer rather than a fallback to the text scan,
/// because the fallback is the bug.
fn find_writer_masmer(body: &str) -> Option<WriterMasmer> {
    use typst::syntax::{LinkedNode, SyntaxKind};
    fn walk(node: &LinkedNode) -> Option<WriterMasmer> {
        if node.kind() == SyntaxKind::FuncCall {
            let mut kids = node.children().filter(|c| !c.kind().is_trivia());
            if let Some(head) = kids.next() {
                // The callee is an `Ident` in `#מסמך(…)`. A call through a
                // variable (`#f(אזור_הערות: 3cm)`) names nothing this can
                // read, so it is left alone rather than guessed at — which is
                // what the old text scan did not do.
                let is_masmer = head.kind() == SyntaxKind::Ident
                    && MASMER_NAMES.contains(&head.get().leaf_text().as_str());
                if is_masmer {
                    if let Some(args) = kids.next() {
                        if args.kind() == SyntaxKind::Args {
                            // Just inside the `(`, or — for the bare `#מסמך[…]`
                            // form, which has no argument list at all — the
                            // front of the content block, which is where one
                            // is minted. **The first non-trivia child**, not a
                            // search for `LeftBracket`: the parser puts that
                            // delimiter inside the `ContentBlock`, so an `Args`
                            // node for `#f[…]` has no `LeftBracket` child of its
                            // own and a search for one finds nothing at all.
                            let first = args.children().find(|c| !c.kind().is_trivia());
                            let has_parens =
                                first.as_ref().is_some_and(|c| c.kind() == SyntaxKind::LeftParen);
                            let open = match first {
                                Some(c) if c.kind() == SyntaxKind::LeftParen => c.offset() + 1,
                                Some(c) => c.offset(),
                                None => args.offset() + args.get().leaf_text().len(),
                            };
                            for named in
                                args.children().filter(|c| c.kind() == SyntaxKind::Named)
                            {
                                let parts: Vec<_> =
                                    named.children().filter(|c| !c.kind().is_trivia()).collect();
                                if parts.len() < 2 || parts[0].kind() != SyntaxKind::Ident {
                                    continue;
                                }
                                if !RESERVE_ARGS
                                    .contains(&parts[0].get().leaf_text().as_str())
                                {
                                    continue;
                                }
                                // Everything after the colon is the value. A
                                // bare `אזור_הערות:` with nothing written after
                                // it is a writer mid-keystroke: there is no
                                // value node, `reserve` comes back empty and
                                // `length_cm` declines it, so nothing is claimed
                                // and nothing is rewritten — but the argument is
                                // recognised, which is what stops `inject` from
                                // writing a second copy of it.
                                let value = parts.get(2);
                                let text = value
                                    .map(|v| v.get().leaf_text().to_string())
                                    .unwrap_or_default();
                                // **`range()`, not `offset() + leaf_text().len()`.**
                                // A value is a `Measure`, `Ratio` or `Decimal`
                                // — inner nodes with several children — and
                                // `leaf_text` concatenates their *text* while
                                // skipping the trivia between them. That sum is
                                // not the source span, so slicing `body` with it
                                // ran off the end of the string and panicked.
                                // `range()` is the span the parser recorded, which
                                // is the only thing safe to rewrite.
                                let at = value.map(|v| {
                                    let r = v.range();
                                    (r.start, r.end)
                                });
                                return Some(WriterMasmer {
                                    reserve: text.trim().to_string(),
                                    // `trim_end` only: a value node's span
                                    // starts at the value, so leading
                                    // whitespace would be *outside* the span
                                    // and there is nothing to strip. If it ever
                                    // is inside, the number is dropped by
                                    // `length_cm` rather than rewritten at a
                                    // shifted offset.
                                    reserve_at: at,
                                    args_open: open,
                                    has_parens,
                                });
                            }
                            // A `#מסמך` with an argument list but no reserve
                            // argument: the writer is entitled to have theirs
                            // written in.
                            return Some(WriterMasmer {
                                reserve: String::new(),
                                reserve_at: None,
                                args_open: open,
                                has_parens,
                            });
                        }
                    }
                }
            }
        }
        node.children().find_map(|c| walk(&c))
    }
    let root = typst::syntax::parse(body);
    walk(&LinkedNode::new(&root))
}

/// The reserve a writer fixed *inline* in the body — `#מסמך(אזור_הערות:
/// 3.5cm)` — if there is one, in centimetres. Both inline policies read this:
/// `"grow"` rewrites the number when it cannot hold the strips, and `"refuse"`
/// compares against it before anything lays out, because a policy that only
/// ever saw the configured value would silently set exactly when the writer
/// had spoken in the document instead.
///
/// **Off the parse, not off the text.** See [`find_writer_masmer`] — the text
/// scan found `אזור_הערות:` in prose, in comments and in strings, and silently
/// rewrote the page-foot reserve because of it.
fn inline_reserve_cm(body: &str) -> Option<f64> {
    let m = find_writer_masmer(body)?;
    if m.reserve.is_empty() {
        return None;
    }
    length_cm(&m.reserve, None)
}

fn grow_inline_reserve(body: &str, need_cm: f64) -> String {
    let Some(m) = find_writer_masmer(body) else {
        return body.to_string();
    };
    // An argument the writer did not write is not rewritten — `inject_
    // reserve_into_writer_masmer` is the one that writes it, and writing it
    // twice is how the scanned value got into a call that never asked for it.
    let Some((start, end)) = m.reserve_at else {
        return body.to_string();
    };
    // **Checked, not trusted.** The span comes from the parser and should be
    // inside `body` always, but this function *rewrites* a writer's own document
    // — so the two operations that can be catastrophic here (a slice off the end,
    // a splice at a shifted offset) are the ones that must be unable to happen
    // even if that invariant is ever broken. Returning the body unchanged is
    // always a legal answer; a panic during a keystroke is not, and there is no
    // `catch_unwind` anywhere in this crate.
    let Some(token) = body.get(start..end) else {
        return body.to_string();
    };
    let Some(w) = length_cm(token, None) else {
        return body.to_string();
    };
    if need_cm <= w {
        return body.to_string();
    }
    format!("{}{:.2}cm{}", &body[..start], need_cm, &body[end..])
}

pub fn main_source(body: &str, cfg: &DocConfig) -> String {
    format!(
        "{IMPORT_LINE}\n{rule}\n\n{body}\n",
        rule = show_rule(body, cfg),
        body = inject_reserve_into_writer_masmer(body, &reserve_region_expr(body, cfg)),
    )
}

/// The same document as one self-contained file — "export .typ".
///
/// This is what a writer gets when they ask for plain Typst, so it cannot
/// `#import` a file they were not given: the prelude is inlined, exactly as it
/// was on every compile before the prelude became a file. Both arrangements are
/// built from the same [`prelude_text`] and the same [`show_rule`], so the
/// exported document and the compiled one cannot come to disagree about what
/// the settings were — `tests/assemble.rs` compiles the export through a bare
/// engine and checks it lays out to the same pages.
pub fn assemble_source(body: &str, cfg: &DocConfig) -> String {
    format!(
        "{prelude}{rule}\n\n{body}\n",
        prelude = prelude_text(),
        rule = show_rule(body, cfg),
        body = inject_reserve_into_writer_masmer(body, &reserve_region_expr(body, cfg)),
    )
}

/// Where a bundled Typst package lives.
///
/// `#import "@preview/meander:0.4.4"` failed with *file not found* until this
/// existed: nothing in the repository handled a package at all, so the whole
/// ecosystem was unreachable — `meander`'s `bisect.typ`, `marginalia`'s per-note
/// shift policy, everything.
///
/// # Resolved from a directory, and never fetched
///
/// `typst-as-lib` offers `with_package_file_resolver`, and it wants `ureq` or
/// `reqwest`: it downloads. That is the wrong shape for this application twice
/// over — a compile that reaches the network is a compile that can hang, and an
/// editor that is 59ms after a keystroke cannot have one in the path; and Ksav is
/// meant to work on a plane.
///
/// So packages are **bundled** and read off disk, in Typst's own layout —
/// `<root>/<namespace>/<name>/<version>/…` — which means a package vendored here
/// keeps its upstream identity and version rather than becoming a fork.
///
/// The resolver is built directly rather than through `with_file_system_resolver`
/// so that its root *is* the package directory: a document cannot reach anything
/// else on the disk through it.
pub fn packages_root() -> std::path::PathBuf {
    // Beside the executable for a shipped build, and in the crate for tests and
    // for `cargo run --example`. Both are checked because the same binary is used
    // both ways and neither is wrong.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let beside = dir.join("packages");
            if beside.is_dir() {
                return beside;
            }
        }
    }
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("packages")
}

// ------------------------------------------------------------------ the @local root
//
// #72, and the seam the issue said did not exist.
//
// The compile channel is `(name, String)` — no path, no `AppHandle`, nothing on
// the request — so a *user* packages directory cannot arrive per-request, and
// that is the correct shape rather than a limitation to work around: a root
// that came on the request could be pointed at any directory by any client of
// the loopback socket, or by the browser build, and the property at
// `packages_root` above — *"its root **is** the package directory: a document
// cannot reach anything else on the disk through it"* — would be gone.
//
// So the root is **set once, by the shell, at startup**. Two rules make that a
// fence rather than a hope:
//
// 1. **Only a root that exists and looks like a package root is accepted.** A
//    directory that is not there is not an error — a writer who has added no
//    packages has none, and refusing to compile would be absurd — but a
//    directory that is there and is not a package root is refused rather than
//    adopted, so a mistyped path cannot silently become a compile that reads
//    arbitrary files.
// 2. **The first `set` wins.** `setup()` runs once per process, and a later call
//    cannot quietly widen what an earlier one granted. If two callers disagree,
//    the second is told so rather than being believed.

/// A second root for packages, read-only, set once by the application at startup.
///
/// `None` — the ordinary state — means the shipped [`packages_root`] only, and
/// a document's `@local/` imports fail the way any unresolvable import does.
static LOCAL_ROOT: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

/// Point `@local` at `dir`, once, at startup.
///
/// The user's own Typst libraries: a `packages/` directory they can drop a
/// `typst.toml` into, resolved through the same read-only resolver as the
/// bundled ones and confined the same way. `dir` is the **root**, the directory
/// whose children are namespaces — so `@local` is served from `<dir>/local/`,
/// and `dir` should be something like `<app_data>/packages`.
///
/// Returns the root in force, and is idempotent: a second call is told what the
/// first one set rather than being allowed to change it. An absent or
/// non-directory leaves the process on the bundled root, which is the state that
/// needs no configuration.
pub fn set_local_packages_root(dir: &std::path::Path) -> std::path::PathBuf {
    if !dir.is_dir() {
        // Not an error. Nobody has added a package, and a missing directory is
        // how that looks. The bundled root serves every `#import "@preview/…"`.
        return packages_root();
    }
    // First `set` wins: a later caller is told what is in force rather than
    // being believed, so two callers cannot disagree about what a document may
    // read.
    let _ = LOCAL_ROOT.set(dir.to_path_buf());
    LOCAL_ROOT.get().cloned().unwrap_or_else(packages_root)
}

/// The `@local` root, if the application set one.
///
/// Deliberately separate from [`packages_root`]: that one is a constant baked in
/// at build time, this one is a decision the shell makes once at startup. Both
/// are read-only roots a document cannot escape.
pub fn local_packages_root() -> Option<&'static std::path::Path> {
    LOCAL_ROOT.get().map(std::path::PathBuf::as_path)
}

/// Every root a document may resolve a package from, bundled first.
///
/// **A list rather than one root**, which is the change #72 needs and the reason
/// it is a change at all. `FileSystemResolver::new` takes one directory as *the*
/// package root and both serves `@ns/name:ver` out of it **and** scopes
/// `.local_package_root` to it, so a second root needs its own resolver — and
/// the bundled one goes first so a user directory can never shadow what ships.
pub fn package_resolvers() -> Vec<typst_as_lib::file_resolver::FileSystemResolver> {
    let bundled = typst_as_lib::file_resolver::FileSystemResolver::new(packages_root())
        .local_package_root(packages_root());
    match local_packages_root() {
        Some(local) => vec![
            bundled,
            typst_as_lib::file_resolver::FileSystemResolver::new(local.to_path_buf())
                .local_package_root(local.to_path_buf()),
        ],
        None => vec![bundled],
    }
}

/// The compiler, configured for one main source and the request's assets.
///
/// The document has no file system to read from, so its images arrive as bytes on
/// the request and are registered under the names the document uses. User fonts
/// arrive the same way and join the bundled ones.
///
/// Separate from [`layout_source`] because two callers want the same engine and
/// only one of them wants the laid-out pages on their own: `jump.rs` needs the
/// [`typst::World`] the layout was produced *against*, because that is what turns
/// a span back into a place in a file. Building the engine twice from the same
/// text would answer with two worlds whose spans do not mean the same thing.
pub(crate) fn engine_for(
    source: String,
    assets: &Assets,
) -> typst_as_lib::TypstEngine<typst_as_lib::TypstTemplateMainFile> {
    let mut fonts = bundled_fonts();
    fonts.extend(assets.fonts.iter().map(|f| f.bytes.as_slice()));
    // **Checked here as well as at the reader**, and the reason is that
    // `compile_with` is `pub`. A request and a `.ksav` are both gated on the way
    // in, but a library caller can hand `Assets` straight to this — and
    // `typst-as-lib` builds a `VirtualPath` from each name and `.expect()`s it,
    // so a name with `..` in it is a **panic**, not a refused compile. There is no
    // `catch_unwind` in this crate or in `server.rs`.
    //
    // So the two gates answer two different questions and neither substitutes for
    // the other: the reader's gate is what lets a *writer* be told their file was
    // refused, and this one is what makes the panic unreachable at all.
    let files: Vec<(&str, &[u8])> = assets
        .files
        .iter()
        .filter(|a| assets::diagnose_name(&a.name).is_none())
        .map(|a| (a.name.as_str(), a.bytes.as_slice()))
        .collect();
    // A font is not resolved by name — it is handed to the shaper as bytes — so
    // the gate does not apply to one, and `..` in a font's name is not a panic.
    let mut builder = TypstEngine::builder()
        .main_file(source)
        .fonts(fonts)
        // The prelude, as a file the document imports. `Source` is `Arc`-backed,
        // so this is a pointer copy into a one-entry map — the 111 KB parse
        // behind it happened at the first compile of the process and will not
        // happen again. See `prelude_source`.
        .with_static_source_file_resolver([prelude_source().clone()])
        .with_static_file_resolver(files);
    // Bundled packages, off disk. Last in the chain, so nothing a document
    // carries with it can be shadowed by one. A `@local` root, if the shell set
    // one at startup, is a second resolver after it — see `package_resolvers`,
    // which is where the confinement argument lives.
    for resolver in package_resolvers() {
        builder = builder.add_file_resolver(resolver);
    }
    // Keep Typst's memoization cache alive across compiles instead of throwing it
    // away after each one. `typst-as-lib` defaults `comemo_evict_max_age` to
    // `Some(0)` — evict everything immediately — which is exactly the opposite of
    // what makes `typst-cli --watch` feel live: font loading, glyph shaping and
    // the layout of unchanged regions all get recomputed from scratch on every
    // keystroke. A non-zero age lets those survive, so an edit pays mainly for
    // what actually changed. The main source keeps a stable (detached) FileId
    // across compiles, so the cache can match against it. `10` is the value
    // `--watch` uses: old enough to span a burst of edits, young enough that a
    // long-idle document's cache is eventually reclaimed.
    builder.comemo_evict_max_age(Some(10));
    builder.build()
}

/// The six faces every Ksav document is typeset with.
///
/// One list, because there are two engines now: the one a compile uses, which
/// resolves the prelude as a file, and the bare one `probe::layout_plain` builds
/// to check that an exported `.typ` really is self-contained. The difference
/// between those two engines is the thing under test, so the fonts had better
/// not be a second difference.
/// The families among the loaded faces that have an italic (or oblique) one.
///
/// # Why the engine has to answer this
///
/// `#נטוי` is Typst's `emph`, and `emph` is a *request*: it asks for an italic
/// face in the family in force. In a family that ships only Regular and Bold —
/// which is every font this engine bundles, and very nearly every Hebrew family
/// there is — Typst finds none, hands back the upright face, and says nothing.
/// The words come out exactly as they went in.
///
/// So `#נטוי` has never done anything, in any document, in either script, for
/// as long as the toolbar has had an `I` on it. Bold works, because there are
/// Bold faces. The report was one line: *"Italic does not apply."*
///
/// The writer's instruction was *italicise when possible, and when it is not
/// possible, say so* — and only the engine can tell. Typst's language has no
/// way to ask whether a face exists; the font book is the compiler's. This is
/// that question, asked of the same bytes the compile is given.
///
/// Lower-cased, because that is how Typst matches a family name.
fn families_with_italic(fonts: &[&[u8]]) -> std::collections::BTreeSet<String> {
    use typst::text::FontStyle;
    let mut out = std::collections::BTreeSet::new();
    for bytes in fonts {
        for font in typst::text::Font::iter(typst::foundations::Bytes::new(bytes.to_vec())) {
            let info = font.info();
            if info.variant.style != FontStyle::Normal {
                out.insert(info.family.to_lowercase());
            }
        }
    }
    out
}

/// The italic families among the **bundled** fonts, read once.
///
/// The bundled set is fixed for the life of the process and the answer is pure
/// over it; reading it per compile cloned every font byte (~2 MB) and iterated
/// every face on the keystroke path. Attached fonts are not here — they arrive
/// and go with requests, and they are read per compile beside this answer.
fn bundled_italic_families() -> &'static std::collections::BTreeSet<String> {
    static ONCE: std::sync::OnceLock<std::collections::BTreeSet<String>> =
        std::sync::OnceLock::new();
    ONCE.get_or_init(|| families_with_italic(&bundled_fonts()))
}

/// Every command in the prelude that asks for a slant, read off the prelude.
///
/// # Why this is derived and was not
///
/// The warning below was written for `#נטוי` and looked for that name and its
/// English alias. `#נטוי` is not the only command that asks: `#מקור` sets
/// `style: "italic"` outright, the marks table gives `גמרא`, `פסוק` and
/// `ציון_מקור` an italic default, and the note apparatus defaults **every tier
/// past the first** to italic — so a sefer with sub-notes asks for a slant it
/// never gets, and the one command that warned about it was the one command
/// nobody had used.
///
/// A list of the other names here would be the same mistake with more rows in
/// it. The prelude is the authority: a `#let` whose body reaches `emph(` or
/// `style: "italic"` is asking, and so is any name the marks table gives an
/// italic style to. Add a command to `ksav.typ` that slants and it is covered
/// without this file changing.
///
/// Names only — the apparatus tiers are a *configuration* default rather than a
/// command, and are handled where the configuration is read, below.
fn slanting_commands() -> &'static std::collections::BTreeSet<String> {
    static ONCE: std::sync::OnceLock<std::collections::BTreeSet<String>> =
        std::sync::OnceLock::new();
    ONCE.get_or_init(|| {
        let mut out = std::collections::BTreeSet::new();
        // `#let name(...) = …` whose right-hand side slants, up to the next
        // `#let` at the start of a line. Two spellings of the request, which are
        // the two Typst has: `emph` and an explicit style.
        for chunk in PRELUDE.split("\n#let ").skip(1) {
            let Some(name) = chunk
                .split(['(', ' ', '='])
                .next()
                .filter(|n| !n.is_empty())
            else {
                continue;
            };
            let body = chunk.split("\n#let ").next().unwrap_or(chunk);
            // `emph(` is no longer a slant that goes missing: `#נטוי`/`#italic`
            // now shear the frame into a synthetic oblique (see `נטוי` in
            // `ksav.typ`), so they are visible with any font and must not warn.
            // Only an explicit `style: "italic"` still hands back the upright
            // face and still earns the warning.
            if body.contains("style: \"italic\"") {
                out.insert(name.to_string());
            }
        }
        // And the marks, whose style is data rather than code: a row of the
        // marks table with an italic style is the same promise made in a
        // different grammar.
        //
        // Keyed off the row rather than off its first key. This used to count
        // quotation marks — `": (סגנון: "` followed by `italic` — which reads
        // `"פסוק": (סגנון: "italic")` and is blind to
        // `"מקור": (גודל: 0.85em, סגנון: "italic", …)`, because there the slant
        // is the second thing said. `#מקור` slants, no bundled family has an
        // italic face, and it warned about that until the day it was given a
        // size as well. A test whose subject is *every* command that asks was
        // reading only the ones that ask first.
        for line in PRELUDE.lines() {
            let Some(rest) = line.trim_start().strip_prefix('"') else {
                continue;
            };
            let Some((name, row)) = rest.split_once("\": (") else {
                continue;
            };
            if row.contains("סגנון: \"italic\"") {
                out.insert(name.to_string());
            }
        }
        // Then the aliases, to a fixed point.
        //
        // Every command in this prelude has an English name given as `#let
        // italic = נטוי` — a body with no `emph(` in it, so the pass above sees
        // nothing. Missing this meant `#italic` stopped warning while `#נטוי`
        // still did, which is the same bug as the one being fixed with the two
        // scripts swapped, and the suite said so immediately.
        loop {
            let mut added = false;
            for line in PRELUDE.lines() {
                let Some(rest) = line.strip_prefix("#let ") else {
                    continue;
                };
                let mut halves = rest.splitn(2, " = ");
                let (Some(name), Some(points_at)) = (halves.next(), halves.next()) else {
                    continue;
                };
                // An alias only: a name, a space, an equals, and one bare name.
                let target = points_at.trim();
                if name.contains('(') || target.contains('(') || target.contains(' ') {
                    continue;
                }
                if out.contains(target) && out.insert(name.to_string()) {
                    added = true;
                }
            }
            if !added {
                break;
            }
        }
        out
    })
}

/// Where the body first asks for a slant, as a byte offset into it.
///
/// Through Typst's own parse rather than a search for a name, for the reason
/// `spans.ts` gives on the other side of the seam: the name inside a string
/// literal is not a call, and a warning about a command the writer never wrote
/// is worse than the silence it replaces.
///
/// The **offset** and not merely a yes, because a diagnostic that names no
/// place is a diagnostic the writer has to go looking for. With one, the status
/// bar's entry becomes a button that goes there and the line is marked, which
/// is the whole difference between being told and being able to act.
fn first_italic(root: &typst::syntax::SyntaxNode) -> Option<(usize, String)> {
    use typst::syntax::{LinkedNode, SyntaxKind};
    fn walk(node: &LinkedNode) -> Option<(usize, String)> {
        if node.kind() == SyntaxKind::Ident {
            let name = node.get().leaf_text();
            if slanting_commands().contains(name.as_str()) {
                return Some((node.offset(), name.to_string()));
            }
        }
        node.children().find_map(|child| walk(&child))
    }
    walk(&LinkedNode::new(root))
}

/// Every call of `names` in the body, as (its first string argument, offset).
///
/// The pair `#סמן`/`#הפניה` needs both halves of the document to answer a
/// question about either of them, which is why this collects rather than
/// finding the first one.
fn calls_with_name(root: &typst::syntax::SyntaxNode, names: &[&str]) -> Vec<(String, usize)> {
    use typst::syntax::{LinkedNode, SyntaxKind};
    fn walk(node: &LinkedNode, names: &[&str], out: &mut Vec<(String, usize)>) {
        if node.kind() == SyntaxKind::FuncCall {
            let mut kids = node.children().filter(|c| !c.kind().is_trivia());
            if let Some(head) = kids.next() {
                if head.kind() == SyntaxKind::Ident
                    && names.contains(&head.get().leaf_text().as_str())
                {
                    // The first string argument, which is the name in both of
                    // these commands. A call written some other way — a variable,
                    // a computed name — is left alone rather than guessed at.
                    let arg = node
                        .children()
                        .flat_map(|a| a.children().collect::<Vec<_>>())
                        .find(|c| c.kind() == SyntaxKind::Str)
                        .map(|c| c.get().leaf_text().to_string());
                    if let Some(raw) = arg {
                        out.push((raw.trim_matches('"').to_string(), head.offset()));
                    }
                }
            }
        }
        for child in node.children() {
            walk(&child, names, out);
        }
    }
    let mut out = Vec::new();
    walk(&LinkedNode::new(root), names, &mut out);
    out
}
/// References that point at an anchor the document has not got.
///
/// # What this is really about
///
/// `#סמן` and `#הפניה` are the two commands in the Reference category, and the
/// margin note says neither renders. Half of that is a misreading and half is
/// this application's fault, which is worth separating.
///
/// `#סמן` renders nothing **because it is an anchor**: it marks a place so that
/// something else can point at it. There is nothing for it to draw, and there
/// never was.
///
/// `#הפניה` does render — it prints the anchor's number. Unless the anchor is
/// not there, in which case the prelude prints `?`, which is the only thing the
/// writer ever sees and says nothing about why. Insert the pair from the
/// toolbar, whose templates are `#סמן("|")` and `#הפניה("|")` with the caret
/// inside an empty string, and you get an anchor named "" and a reference to
/// "" — so the writer meets a bare `?` and a command that appears to do nothing.
///
/// So the question is asked of the whole document at compile time, where both
/// halves are visible, and the answer names the name.
pub(crate) fn dangling_references(root: &typst::syntax::SyntaxNode, body: &str) -> Vec<Diagnostic> {
    let anchors: std::collections::BTreeSet<String> = calls_with_name(root, &["סמן", "anchor"])
        .into_iter()
        .map(|(name, _)| name)
        .collect();
    calls_with_name(root, &["הפניה", "xref"])
        .into_iter()
        .filter(|(name, _)| !anchors.contains(name))
        .map(|(name, at)| {
            let (line, column) = line_column(body, at);
            let mut said = Diagnostic::ours(
                "warning",
                format!(
                    concat!(
                        "אין במסמך סמן בשם {name} — הוסיפו #סמן({name}) במקום שאליו ההפניה מכוונת, ",
                        "או תקנו את האיות · ",
                        "no anchor named {name} in this document — add #anchor({name}) ",
                        "where the reference points, or fix the spelling"
                    ),
                    name = format!("{name:?}"),
                ),
            );
            said.line = Some(line);
            said.column = Some(column);
            said.about = Some("#הפניה".to_string());
            said
        })
        .collect()
}

/// Notes sent to a destination this document never declared.
///
/// # What this is really about
///
/// A note written `#הערה(אזור: "טיפים")` in a document that declares no such
/// region is not an error and not a crash: the note is drawn, in the default
/// apparatus at the foot of the page, numbered, queryable, and perfectly legible.
/// Measured on the 2026-09-27 probe — a typo'd region name lands at y=712.5 on
/// an 841.89 pt sheet, indistinguishable from the note having been filed
/// correctly.
///
/// That is the problem. The writer asked for a named place and got the page foot
/// with no word, and the two are not the same document: their note is in the wrong
/// apparatus, it is not where the reader will look for it, and the region's own
/// height, placement and overflow policy — the whole point of naming it — are not
/// applied to it. The 23 August audit called this the same defect class as its B1,
/// the mixed-`ערוץ:`-and-`אזור:` case where a note was filed under one key and
/// filtered under another and the writer's text appeared on no page at all. B1
/// lost the text; this one keeps the text and loses the destination, which is the
/// quieter half of the same bug.
///
/// A **warning**, on the reasoning `italic_warning` already states and for the
/// same reason: the document compiles, the note is on the page, every other
/// command in it is fine, and a writer part-way through a sefer is entitled to
/// keep working. Refusing would take away working text over a typo in a word that
/// costs them nothing to keep. What must not happen is that they never find out.
///
/// The seven tier channels are the built-in balanced series and reserve nothing,
/// so they are legal undeclared; the rest must be declared by `#ערוץ(…)` or
/// `#אזור(…)`. When a document declares none at all, the message says so rather
/// than listing an empty set — the likeliest cause of a wrong name in a document
/// that declares nothing is a name copied from another document.
pub(crate) fn unknown_destinations(
    body: &str,
    shape: &parse::ApparatusShape,
) -> Vec<Diagnostic> {
    let channels = channel_declarations(body, shape, CHANNEL_DECL);
    let regions = channel_declarations(body, shape, REGION_DECL);
    // A document full of `#הערה(ערוץ: "הערה_ב")` is one writer's ordinary sefer,
    // and warning on it would be the noise that teaches people to skip this list.
    let declared = |name: &str| {
        channels.contains_key(name) || regions.contains_key(name) || TIER_CHANNELS.contains(&name)
    };
    let mut out: Vec<Diagnostic> = Vec::new();
    for call in &shape.calls {
        if !call.hash {
            continue;
        }
        // A `#ערוץ("c", אזור: "r")` *declaration* carries the same argument a note
        // does, and the declaration is what makes the name known.
        if CHANNEL_DECL.contains(&call.name.as_str()) || REGION_DECL.contains(&call.name.as_str()) {
            continue;
        }
        let Some((from, to)) = call.args else {
            continue;
        };
        let Some(name) = named_arg(&body[from..to], REGION_ARG).or(named_arg(&body[from..to], CHANNEL_ARG))
        else {
            continue;
        };
        if name.is_empty() || declared(&name) {
            continue;
        }
        // The command's own name, not the first argument: `from` is the byte
        // after the `(`, and the writer is looking for `#הערה`, not for the
        // argument that follows it.
        let at = from.saturating_sub(call.name.len() + 1);
        let (line, column) = line_column(body, at);
        let mut said = Diagnostic::ours(
            "warning",
            if channels.is_empty() && regions.is_empty() {
                format!(
                    concat!(
                        "אין במסמך אזור או ערוץ בשם {name} — ההערה נדפסה באותו מקום, אך לא באזור שביקשתם. ",
                        "הוסיפו #אזור({name}) או #ערוץ({name}) במסמך, או תקנו את האיות · ",
                        "no region or channel named {name} in this document — the note is printed, ",
                        "but not in the apparatus you asked for. Add #region({name}) or ",
                        "#channel({name}), or fix the spelling"
                    ),
                    name = format!("{name:?}"),
                )
            } else {
                let mut known: Vec<&str> = channels.keys().map(String::as_str).collect();
                known.extend(regions.keys().map(String::as_str));
                known.sort_unstable();
                format!(
                    concat!(
                        "אין במסמך אזור או ערוץ בשם {name} — יש: {known}. ",
                        "ההערה נדפסה באותו מקום, אך לא באזור שביקשתם · ",
                        "no region or channel named {name} in this document — declared here: {known}. ",
                        "The note is printed, but not in the apparatus you asked for"
                    ),
                    name = format!("{name:?}"),
                    known = known.join(", "),
                )
            },
        );
        said.line = Some(line);
        said.column = Some(column);
        said.about = Some(format!("#{}", call.name));
        out.push(said);
    }
    out
}

/// A byte offset in the body as a 1-based (line, column), counted in characters.
///
/// The same convention `Diagnostic` states: a Hebrew letter is two bytes and no
/// writer counts in bytes.
fn line_column(body: &str, offset: usize) -> (usize, usize) {
    let upto = &body[..offset.min(body.len())];
    let line = upto.matches('\n').count() + 1;
    let start = upto.rfind('\n').map_or(0, |i| i + 1);
    (
        line,
        body[start..offset.min(body.len())].chars().count() + 1,
    )
}

/// The warning a document earns by asking for a face its font has not got.
///
/// A warning and not an error: the document compiles, every other command in it
/// is fine, and a writer part-way through a sefer is entitled to keep working.
/// What must not happen is that they keep pressing a button which does nothing
/// and are never told.
pub(crate) fn italic_warning(
    root: &typst::syntax::SyntaxNode,
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Option<Diagnostic> {
    let (at, command) = first_italic(root)?;
    // The bundled answer is cached; only fonts attached to this request are
    // read fresh, and there are usually none.
    let mut with_italic = bundled_italic_families().clone();
    let extra: Vec<&[u8]> = assets.fonts.iter().map(|f| f.bytes.as_slice()).collect();
    if !extra.is_empty() {
        with_italic.extend(families_with_italic(&extra));
    }
    if with_italic.contains(&cfg.font.to_lowercase()) {
        return None;
    }
    let (line, column) = line_column(body, at);
    let mut said = Diagnostic::ours(
        "warning",
        format!(
            concat!(
                "לגופן {font} אין גרסה נטויה, ולכן #{cmd} משאיר את הטקסט זקוף. ",
                "בחרו גופן שיש לו אחת, צרפו קובץ גופן, או השתמשו ב#הדגשה · ",
                "{font} has no italic face, so #{cmd} leaves the text upright. ",
                "Choose a font that has one, attach a font file, or use bold instead",
            ),
            font = cfg.font,
            // The command the *writer* used, not the one this check was first
            // written for. A warning that says `#נטוי` to somebody who typed
            // `#מקור` is a warning about a command they cannot find.
            cmd = command,
        ),
    );
    said.line = Some(line);
    said.column = Some(column);
    // The command it is about, so the diagnostics view can name it the way it
    // names every other one.
    said.about = Some(format!("#{command}"));
    Some(said)
}

fn bundled_fonts() -> Vec<&'static [u8]> {
    vec![
        FONT_FRANK_REG,
        FONT_FRANK_BOLD,
        FONT_DAVID_REG,
        FONT_DAVID_BOLD,
        FONT_CASCADIA,
        FONT_NEWCM_MATH,
    ]
}

/// A complete Typst document, laid out with **no Ksav assembly and no prelude
/// resolver** — the fonts and nothing else.
///
/// This exists for one question, and it is a question the split into
/// `main_source` and `assemble_source` created: **is what "export .typ" writes
/// actually a document?** The compiled arrangement imports `ksav.typ`, so it
/// would go on working perfectly if the exported one stopped being
/// self-contained — the failure would be invisible here and total for the writer
/// who took the file to a printer. An engine with no source resolver on it
/// cannot resolve an import, so an export that acquired one fails loudly.
pub(crate) fn layout_plain(source: &str) -> Result<PagedDocument, Vec<Diagnostic>> {
    let engine = TypstEngine::builder()
        .main_file(source.to_string())
        .fonts(bundled_fonts())
        .build();
    let Warned { output, warnings } = engine.compile::<PagedDocument>();
    match output {
        Ok(doc) => Ok(doc),
        Err(err) => {
            let located = Located::of(source, "");
            let mut diagnostics = located.all(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(located.all(&diags, "error")),
                other => diagnostics.push(Diagnostic::ours("error", other.to_string())),
            }
            Err(diagnostics)
        }
    }
}

/// Lay out a main source, with the request's assets available to it.
fn layout_source(
    source: String,
    assets: &Assets,
) -> Warned<Result<PagedDocument, typst_as_lib::TypstAsLibError>> {
    engine_for(source, assets).compile::<PagedDocument>()
}

/// Compile and lay out a document, returning the laid-out pages.
///
/// This is what `compile` uses internally; it is public so tests (and the render
/// probe) can inspect *where things actually landed on the page* rather than only
/// whether compilation succeeded.
pub fn compile_doc(body: &str, cfg: &DocConfig) -> Result<PagedDocument, Vec<Diagnostic>> {
    compile_doc_with(body, cfg, &Assets::default())
}

/// A sefer and its companion volume, as two documents from **one source**.
///
/// `NOTES-PLAN`'s `קובץ` destination is a volume of its own — a kuntres of
/// biurim bound behind a sefer, numbered separately from it — and the writer
/// chooses whether it is bound at the back or written out as its own file.
/// This is the second answer.
///
/// # Two compiles, and the boundary comes for free
///
/// The obvious shape is one compile split at the companion's first page, and
/// finding that page means asking the laid-out document where a marker landed.
/// There is a cheaper answer that needs no introspection at all: compile it
/// **once with the companion held out** and once with it bound in. The first is
/// the body file, and its page count *is* where the companion starts in the
/// second. Nothing has to be located, because the difference between the two
/// documents is exactly the thing being looked for.
///
/// It costs a second layout of the same source, and buys a boundary that cannot
/// be off by one.
///
/// # Why the companion is cut out of the bound document rather than rendered alone
///
/// A companion addressed by `ראש: ("עמוד", …)` cites **the sefer's** pages. Laid
/// out on its own, with the body hidden so its notes still register, every one
/// of those addresses would read page 1 — a volume whose whole purpose is to say
/// where in the sefer each entry belongs, saying it wrongly on every line. So
/// the companion is taken from the document that has the body in it, and the
/// addresses are the ones the reader can use.
///
/// Returns the full document and the 1-based page the companion starts on.
/// `None` for that page when the document has no companion volume — the two
/// compiles came out the same length, so there was nothing held out.
pub fn compile_companion(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<(PagedDocument, Option<usize>), Vec<Diagnostic>> {
    let held = DocConfig {
        separate_volume: true,
        ..cfg.clone()
    };
    let body_only = compile_doc_with(body, &held, assets)?;
    let bound = DocConfig {
        separate_volume: false,
        ..cfg.clone()
    };
    let whole = compile_doc_with(body, &bound, assets)?;
    let n = body_only.pages().len();
    let start = if whole.pages().len() > n {
        Some(n + 1)
    } else {
        None
    };
    Ok((whole, start))
}

/// `compile_doc`, with the request's images and fonts available to the document.
pub fn compile_doc_with(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<PagedDocument, Vec<Diagnostic>> {
    // The too-small switch's "refuse": a writer-fixed reserve smaller than its
    // foot regions' declared heights, where flowing cannot help because every
    // page is equally short. Both numbers, then stop - the one answer that can
    // never lose a reader's text to silence. The writer's number may have
    // arrived through configuration or *inline in the body*, which overrides
    // the wrapper; a policy that read only the configured value would silently
    // set precisely when the writer spoke in the document instead. Found by
    // the stress sitting of 25 August: `refuse` over an inline 1cm reserve
    // under a six-line region compiled and flowed.
    if cfg.reserve_overflow == "refuse" {
        let fixed = cfg.notes_region_cm.or_else(|| inline_reserve_cm(body));
        if let Some(w) = fixed {
            let need = auto_notes_region_cm_sheet(body, sheet_height_cm(cfg));
            if need > w {
                return Err(vec![crate::diagnostics::Diagnostic {
                    severity: "error".to_string(),
                    message: format!(
                        "אזור_הערות: הפסים גבוהים מן השמורה · the foot regions ask for \
                         {need:.1}cm and the reserve holds {w:.1}cm. Raise אזור_הערות, \
                         lower the regions' גבהים, or set reserve_overflow to \"grow\"."
                    ),
                    raw: format!("reserve {w}cm < declared regions {need}cm"),
                    line: None,
                    column: None,
                    about: Some("אזור_הערות".to_string()),
                    did_you_mean: None,
                    file: None,
                }]);
            }
        }
    }
    // The inline grow runs here, where the scan's need and the writer's own
    // number can meet: a fixed reserve smaller than the strips declare is
    // raised (default policy) before anything lays out.
    let body = if cfg.notes_region_cm.is_none()
        && cfg.reserve_overflow != "flow"
        && cfg.reserve_overflow != "refuse"
    {
        let need = auto_notes_region_cm_sheet(body, sheet_height_cm(cfg));
        if need > 0.0 {
            grow_inline_reserve(body, need)
        } else {
            body.to_string()
        }
    } else {
        body.to_string()
    };
    let text = main_source(&body, cfg);
    let Warned { output, warnings } = layout_source(text.clone(), assets);
    match output {
        Ok(doc) => Ok(doc),
        Err(err) => {
            // The same text Typst just parsed, parsed again here so spans can be
            // turned into lines — but only now that there is a diagnostic to
            // locate. See `compile_parts` for why this is not done up front.
            let located = Located::of(&text, &body);
            let mut diagnostics = located.all(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(located.all(&diags, "error")),
                other => diagnostics.push(Diagnostic::ours("error", other.to_string())),
            }
            Err(diagnostics)
        }
    }
}

/// Compile Hebrew Ksav markup into PDF + SVG previews.
pub fn compile(body: &str, cfg: &DocConfig) -> Compiled {
    compile_with(body, cfg, &Assets::default())
}

/// `compile`, with the request's images and fonts available to the document.
pub fn compile_with(body: &str, cfg: &DocConfig, assets: &Assets) -> Compiled {
    compile_parts(body, cfg, assets, Wants::export(), &Default::default())
}

/// Compile, carrying back only the parts of the answer that were asked for.
///
/// The live preview consumes the SVGs and nothing else, yet a PDF was rendered
/// and base64-encoded into every response — around 300 KB per keystroke-driven
/// compile of a 16-page document, none of it ever read. `Wants::pdf` is off for
/// previews and on for export and print, which is the only place the bytes are
/// actually wanted.
///
/// `Wants::source` is the same argument about the same mistake, found later in
/// the same response: the assembled Typst source is the 75 KB prelude plus the
/// document, it was returned unconditionally, and the only caller that reads it
/// ("export .typ") runs its own compile to get it. On a one-page document that
/// was 75 KB of an 84 KB response.
///
/// `Wants::lines` is the third, asked for before it could become the fourth
/// instance: a narrowed preview needs to know which lines printed on which page
/// and every other caller does not.
///
/// No flag changes what is compiled — every one of them is about what is
/// *carried back*.
pub fn compile_parts(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
    wants: Wants,
    // Fingerprints of pages the caller is already holding. A page whose
    // fingerprint is in here is **never serialised** — see `pages_hash` on
    // `Compiled`. Pass an empty set to get every page.
    have: &std::collections::HashSet<String>,
) -> Compiled {
    let source = main_source(body, cfg);
    // The clone is for Typst, which takes the source by value. `source` itself
    // stays here so `Located` has something to parse if it is needed.
    let Warned { output, warnings } = layout_source(source.clone(), assets);

    // Locating a diagnostic means parsing the main source a second time, and
    // `Source::detached` copies it to do so. That was done on every compile
    // whether or not anything had gone wrong: 4.2 ms of a 14.4 ms one-page
    // compile, spent parsing 83 KB of prelude to resolve spans that a clean
    // document does not have. A document with no warnings and no errors now pays
    // none of it — and since the prelude became a file, what gets re-parsed when
    // something *has* gone wrong is two lines and the writer's own text.
    let locate = |diags: &[_], severity: &str| {
        if diags.is_empty() {
            Vec::new()
        } else {
            Located::of(&source, body).all(diags, severity)
        }
    };

    // A request the fonts cannot grant, and a reference with no anchor. Both
    // are questions about the writer's whole text, and **one parse serves
    // both**: each used to walk its own full parse — three per compile on this
    // path — for trees that were identical every time.
    let body_tree = typst::syntax::parse(body);
    let italic = italic_warning(&body_tree, body, cfg, assets);
    let dangling = dangling_references(&body_tree, body);
    // A note filed at a place this document does not have. The same question as
    // the dangling reference — a name the writer used and the document never
    // got — asked of the other place a name can be wrong, and the scan is over
    // the partition `show_rule` already built for the reserve, so it costs
    // nothing extra.
    let stray = unknown_destinations(body, &parse::apparatus_shape(body));

    match output {
        Ok(doc) => {
            let mut diagnostics = locate(&warnings, "warning");
            // A block that cannot split and does not fit loses its content off
            // the bottom of the sheet with nothing reported (#74). The document
            // compiled, so this is the only place the loss is visible.
            diagnostics.extend(crate::diagnostics::overflow_audit(&doc, body));
            diagnostics.extend(italic.clone());
            diagnostics.extend(dangling.clone());
            diagnostics.extend(stray.clone());
            // What the request asked for and did not get. The document compiled;
            // a setting in it did not take effect. A writer who changed a margin
            // and got the old page back has to be told that here rather than
            // discovering it in print.
            diagnostics.extend(cfg.refusals.iter().map(refusal_diagnostic));
            // The same for a setting that is not a length: a `pdf_pages` token
            // the engine could not read, quoted back (#59). It rides the
            // compile response rather than the export's, because that is the
            // one place a writer is looking when they wonder why the range they
            // typed did not happen.
            diagnostics.extend(spec_refusals_of(cfg).iter().map(spec_refusal_diagnostic));
            // Whatever the export has to say, say it. These used to go into
            // `.ok()` and vanish, so a PDF that failed to export came back as
            // `ok: true` with no bytes and no explanation. It mattered little
            // while every export was a plain PDF; the moment a writer asks for
            // PDF/A it matters a great deal, because the standards refuse
            // documents for real, nameable reasons — an unembeddable font, a
            // missing title — that they are entitled to be told about.
            let pdf = if wants.pdf {
                let (bytes, notes) = pdf_bytes(&doc, cfg);
                diagnostics.extend(notes);
                bytes
            } else {
                None
            };
            // The main source is re-parsed here, and only here, because
            // resolving a span means holding a `Source` numbered the same way
            // Typst numbered it — the same trick `Located` uses and the same
            // reason it is built lazily. What gets parsed is the two-line header
            // and the writer's own text; the prelude is a different file.
            //
            // `markers` shares it, so the parse happens once for either or both.
            let parsed = (wants.lines || wants.markers || wants.text)
                .then(|| typst::syntax::Source::detached(source.clone()));
            let pages_lines = match (&parsed, wants.lines) {
                (Some(main), true) => pagelines::page_lines(&doc, main, body),
                _ => Vec::new(),
            };
            let note_markers = match (&parsed, wants.markers) {
                (Some(main), true) => notemarks::note_markers(&doc, main, body),
                _ => Vec::new(),
            };
            let pages_text = match (&parsed, wants.text) {
                (Some(main), true) => pagetext::page_text(&doc, main, body),
                _ => Vec::new(),
            };
            // Fingerprint the **page**, then serialise only what the caller
            // has not got.
            //
            // The fingerprint used to be computed from the SVG, which meant
            // every page had to be serialised before anything could decide
            // whether it was needed. Measured on a 28-page document: layout
            // 42 ms, **SVG serialisation of all 28 pages 310 ms**, fingerprinting
            // 33 ms — so the page cache saved 9.7 MB of bandwidth per keystroke
            // and spent 343 ms producing bytes it then declined to send. That is
            // the same mistake `want_pdf` and `want_source` were introduced to
            // fix, one field further down the same response.
            //
            // `Frame` derives `Hash`, so the answer was available before the
            // work rather than after it. `fill` and `bleed` are in the hash
            // because the SVG is a function of them too and neither is part of
            // the frame — a page whose background colour changed would otherwise
            // come back as "you already have this one".
            //
            // Not stable across processes, and it does not need to be: the
            // client stores these in memory and hands them straight back, and
            // every response carries a fresh set. A restarted engine simply
            // finds nothing in `have` and sends everything once.
            let svg_opts = typst_svg::SvgOptions::default();
            let mut pages_hash = Vec::with_capacity(doc.pages().len());
            let pages_svg = doc
                .pages()
                .iter()
                .map(|p| {
                    let fp = page_fingerprint(p);
                    let known = have.contains(&fp);
                    pages_hash.push(fp);
                    if known {
                        String::new()
                    } else {
                        typst_svg::svg(p, &svg_opts)
                    }
                })
                .collect();
            Compiled {
                ok: true,
                pdf,
                pages_svg,
                pages_hash,
                diagnostics,
                typst_source: if wants.source {
                    assemble_source(body, cfg)
                } else {
                    String::new()
                },
                pages_lines,
                pages_text,
                note_markers,
            }
        }
        Err(err) => {
            // Something went wrong, so the second parse is worth its cost here.
            let located = Located::of(&source, body);
            let mut diagnostics = located.all(&warnings, "warning");
            diagnostics.extend(italic);
            diagnostics.extend(dangling);
            diagnostics.extend(stray);
            // A refused setting is worth saying even when the document did not
            // compile: the refusal may be the *reason* it did not, and a writer
            // who cannot see which of their settings was dropped has nothing to
            // change.
            diagnostics.extend(cfg.refusals.iter().map(refusal_diagnostic));
            diagnostics.extend(spec_refusals_of(cfg).iter().map(spec_refusal_diagnostic));
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(located.all(&diags, "error")),
                other => diagnostics.push(Diagnostic::ours("error", other.to_string())),
            }
            Compiled {
                ok: false,
                pdf: None,
                pages_svg: Vec::new(),
                pages_hash: Vec::new(),
                diagnostics,
                pages_lines: Vec::new(),
                pages_text: Vec::new(),
                note_markers: Vec::new(),
                typst_source: if wants.source {
                    assemble_source(body, cfg)
                } else {
                    String::new()
                },
            }
        }
    }
}

/// The PDF export settings a document's config asks for.
///
/// The standard is parsed through serde rather than a hand-written match,
/// because `PdfStandard`'s `#[serde(rename)]` attributes *are* Typst's own
/// spelling of these names (`a-2b`, `ua-1`, `1.7`) and a second table here would
/// be a second source of truth that drifts the first time Typst adds one.
fn pdf_options(cfg: &DocConfig) -> Result<(typst_pdf::PdfOptions, Vec<Diagnostic>), String> {
    let mut notes = Vec::new();
    let mut opts = typst_pdf::PdfOptions {
        tagged: cfg.pdf_tagged,
        ..Default::default()
    };
    if !cfg.pdf_standard.is_empty() {
        let std: typst_pdf::PdfStandard =
            serde_json::from_value(serde_json::Value::String(cfg.pdf_standard.clone()))
                .map_err(|_| format!("unknown PDF standard \"{}\"", cfg.pdf_standard))?;
        opts.standards =
            typst_pdf::PdfStandards::new(&[std]).map_err(|e| e.message().to_string())?;
    }
    // #59: the empty-result-means-everything rule is gone. `page_ranges_for_export`
    // returns `None` **only** for a request that asked for no restriction, and
    // an `Err` for a spec whose every token was refused. This used to be
    // `if !ranges.is_empty()`, which read a typo as a full-document export.
    //
    // **Parsed here, from `pdf_pages`, rather than from something `from_json`
    // left behind.** A `DocConfig` can be built either way — the struct literal
    // is public, and the tests and `binding.rs` use it — so a cached parse would
    // be `default()` for every one of those, which is *no restriction*, and
    // `a_page_range_exports_fewer_pages` would have started exporting all three
    // pages. Same seam `DocConfig::default()` is documented for, and the same
    // rule applies: anything derived from a setting is derived from the setting.
    match page_ranges_for_export(&parse_page_spec(&cfg.pdf_pages))? {
        None => {}
        Some(ranges) => {
            opts.page_ranges = Some(typst::layout::PageRanges::new(ranges));
        // Typst refuses the combination outright: the accessibility tree spans
        // the whole document, so a subset of pages cannot carry a correct one.
        // Dropping the tags is what the writer wants — they asked for three pages,
        // not for an accessibility tree — but it is still a thing that happened to
        // their export, so it is said out loud rather than done behind their back.
        if opts.tagged {
            opts.tagged = false;
            notes.push(Diagnostic::ours(
                "warning",
                "ייצוא של טווח עמודים אינו יכול לשאת תגי נגישות — התגים הושמטו · \
                 Exporting a page range cannot carry PDF tags — tags were dropped"
                    .to_string(),
            ));
        }
        }
    }
    Ok((opts, notes))
}

/// Render the PDF, reporting why rather than returning nothing.
fn pdf_bytes(doc: &PagedDocument, cfg: &DocConfig) -> (Option<Vec<u8>>, Vec<Diagnostic>) {
    let (opts, mut notes) = match pdf_options(cfg) {
        Ok(v) => v,
        Err(m) => return (None, vec![Diagnostic::ours("error", m)]),
    };
    match typst_pdf::pdf(doc, &opts) {
        Ok(bytes) => (Some(bytes), notes),
        Err(diags) => {
            // Export diagnostics carry spans into the assembled source, but they
            // are about the *document as a whole* far more often than about one
            // line of it ("the document title is empty", "this font cannot be
            // embedded"), so they are reported as ours rather than pinned to a
            // line the writer would then stare at in confusion.
            notes.extend(
                diags
                    .iter()
                    .map(|d| Diagnostic::ours("error", d.message.to_string())),
            );
            (None, notes)
        }
    }
}

/// A short, stable fingerprint of one rendered page.
///
/// FNV-1a rather than `DefaultHasher`, because this number crosses a wire and is
/// compared against one an *earlier* process produced: it has to mean the same
/// thing in every build of every backend, which the standard hasher does not
/// promise. Sixteen hex digits is far more than enough to tell one page of a
/// document from another, and collisions cost a stale page rather than
/// corruption — the client only ever reuses a page it already had under that
/// same name.
fn page_fingerprint(page: &typst_layout::Page) -> String {
    format!(
        "{:032x}",
        typst::utils::hash128(&(&page.frame, &page.fill, &page.bleed))
    )
}

/// JSON-in / JSON-out compile, shared by the HTTP server and the wasm binding.
/// Input: `{body, font, size_pt, margin_cm, dir, numbering, justify, line_spacing_em,
/// columns, assets: [{name, data}], fonts: [{name, data}], want_pdf, want_source,
/// have_pages: [fingerprint]}` — `data` is base64, with or without a `data:` URL
/// prefix.
/// Output: `{ok, pages_svg, pages_hash, pdf_base64, diagnostics, typst_source}`,
/// where a `pages_svg` entry is `null` for any page whose fingerprint the caller
/// listed in `have_pages`.
/// The response for a request the engine could not make sense of.
///
/// Shared by the two ways that happens — JSON that does not parse, and JSON that
/// parses but carries no usable document — because they need the same answer: a
/// failed compile that says why. Anything that renders a page here would be
/// rendering a page nobody asked for.
fn malformed_request(reason_he: &str, reason_en: &str) -> String {
    serde_json::json!({
        "ok": false,
        "pages_svg": [],
        "pages_hash": [],
        "pdf_base64": serde_json::Value::Null,
        "diagnostics": [{
            "severity": "error",
            "message": format!("{reason_he} · {reason_en}"),
        }],
        "typst_source": "",
        "pages_lines": [],
        "pages_text": [],
        "note_markers": [],
        "missing_assets": [],
    })
    .to_string()
}

/// Why a request could not be read at all, in both languages.
///
/// Carried rather than formatted, because the two services that read a request
/// answer in different shapes — a compile answers with a failed compile, an
/// assembly answers with no source — and neither should be describing the
/// other's response.
struct Unreadable {
    he: String,
    en: String,
}

/// The document a request describes, and nothing about what to do with it.
///
/// Two services need exactly this: `compile`, which lays it out, and
/// `assemble`, which wants only the Typst that would have been laid out. They
/// read it here rather than parsing the same JSON twice, because "export .typ"
/// has to produce the bytes the compile would have produced — and two readers
/// of one request that agree only by inspection is this repository's own bug
/// family with a different noun.
struct DocumentRequest {
    /// The request itself, for the fields that are about the *call* rather than
    /// about the document: `want_pdf`, `have_pages`, `format`.
    v: serde_json::Value,
    /// The body with `#כלול` resolved, and the line map back to each chapter.
    expanded: include::Expanded,
    cfg: DocConfig,
}

/// Read the document out of a request, or say why it could not be read.
///
/// # The validation seam, stated where a client author will read it
///
/// Two philosophies meet at this boundary and **both are deliberate**. A request
/// field this function does not know (`fontX`, `paperX`) is *ignored*: the HTTP
/// contract belongs to clients that ship on their own schedule, and refusing an
/// unknown field would make every older client break against every newer engine
/// instead of simply missing a feature it never asked for. A configuration key
/// the *prelude* does not know (`#הגדרות_הערות(גדול: …)`) is *refused by name*:
/// that text is the writer's own document, a typo there is a dead knob in their
/// sefer, and silence is exactly what this product refuses to be. The first is
/// about versioning across a wire; the second is about honesty inside a page.
fn read_document(input_json: &str) -> Result<DocumentRequest, Unreadable> {
    // A request that does not parse is not an empty document.
    //
    // This used to fall back to `Value::Null`, which reads every field as absent:
    // an empty body, which compiles perfectly happily into one blank page and is
    // returned as `ok: true`. A truncated upload or a corrupted request therefore
    // blanked the writer's preview and said nothing about why. The real client
    // always sends valid JSON, so reaching this means something went wrong on the
    // wire, and the honest answer is to say so.
    let v: serde_json::Value = serde_json::from_str(input_json).map_err(|e| Unreadable {
        he: format!("הבקשה לא נקראה — ייתכן שההעברה נקטעה ({e})"),
        en: format!("the request could not be read — the transfer may have been truncated ({e})"),
    })?;
    // …and neither is a request whose `body` is missing or is not text.
    //
    // The check above caught JSON that fails to parse, but stopped there: JSON
    // that parsed and simply had no `body` — or a `body` that was a number, an
    // object, or `null` — still fell through to `unwrap_or("")` and compiled one
    // blank page reported as `ok: true`. That is the same silent-blank-preview
    // failure, reached by a different route, and it deserves the same answer.
    // An *empty* string stays perfectly legitimate: that is a new document.
    let body = match v.get("body") {
        Some(b) => match b.as_str() {
            Some(s) => s,
            None => {
                return Err(Unreadable {
                    he: "הבקשה לא נקראה — שדה הטקסט של המסמך אינו טקסט".into(),
                    en: "the request could not be read — the document's body field is not text"
                        .into(),
                })
            }
        },
        None => {
            return Err(Unreadable {
                he: "הבקשה לא נקראה — אין במסמך שדה טקסט".into(),
                en: "the request could not be read — it carries no document body".into(),
            })
        }
    };
    let cfg = DocConfig::from_json(&v);
    // A sefer is many files. `#כלול("פרק ג")` is expanded here, before anything is
    // compiled, and the expansion keeps a line map so a diagnostic can still name
    // the chapter it belongs to rather than a line number in a concatenation that
    // exists nowhere. A request with no `parts` expands to itself, at no cost.
    let parts = include::from_request(&v);
    // The writer's own budget, not the default one: the whole point of the setting
    // is that a sefer with a genuinely large apparatus can raise it.
    let limits = include::Limits {
        warn: cfg.max_lines_warn.max(1.0) as usize,
        refuse: cfg.max_lines_refuse.max(1.0) as usize,
    };
    let expanded = include::expand(body, &parts, limits);
    Ok(DocumentRequest { v, expanded, cfg })
}

/// The assembled Typst source for a document, with no compile behind it.
///
/// "Export .typ" used to be a full render — PDF encoded and all — thrown away
/// except for the one string the response happened to carry. `assemble_source`
/// is pure and takes microseconds; the layout it was hiding behind takes
/// seconds on a sefer. Same bytes, same includes, same page setup, because both
/// services read the request through [`read_document`] and hand the same body
/// and config to the same function.
///
/// Input: a compile request. Output: `{ok, typst_source, diagnostics}` — the
/// diagnostics being the ones `#כלול` can produce on its own, since a chapter
/// that does not exist is a hole in the exported file and the writer should be
/// told before they send it to a printer.
pub fn assemble_request(input_json: &str) -> String {
    let d = match read_document(input_json) {
        Ok(d) => d,
        Err(why) => {
            return serde_json::json!({
                "ok": false,
                "typst_source": "",
                "diagnostics": [{
                    "severity": "error",
                    "message": format!("{} · {}", why.he, why.en),
                }],
            })
            .to_string()
        }
    };
    let diagnostics: Vec<Diagnostic> = d
        .expanded
        .problems
        .iter()
        .map(|p| Diagnostic::ours("error", p.clone()))
        .collect();
    serde_json::json!({
        "ok": diagnostics.is_empty(),
        "typst_source": assemble_source(&d.expanded.text, &d.cfg),
        "diagnostics": diagnostics,
    })
    .to_string()
}

pub fn compile_request(input_json: &str) -> String {
    use base64::Engine as _;
    let DocumentRequest { v, expanded, cfg } = match read_document(input_json) {
        Ok(d) => d,
        Err(why) => return malformed_request(&why.he, &why.en),
    };
    let body: &str = &expanded.text;
    // Assets resolve from a per-process cache keyed by content hash, so an
    // unchanged image is not re-sent and re-decoded on every keystroke. Any hash
    // the cache no longer holds comes back so the client re-sends the bytes.
    let (assets, missing_assets, refused) = Assets::from_request(&v);

    // `{"format": "html"}` asks for the web export instead of a paged render.
    if v.get("format").and_then(|x| x.as_str()) == Some("html") {
        return match compile_html(body, &cfg, &assets) {
            Ok(html) => serde_json::json!({ "ok": true, "html": html, "diagnostics": [], "missing_assets": missing_assets }),
            Err(diags) => serde_json::json!({
                "ok": false,
                "html": serde_json::Value::Null,
                "diagnostics": diags,
                "missing_assets": missing_assets,
            }),
        }
        .to_string();
    }

    // Previews don't want a PDF or the assembled source; export and print do,
    // and say so.
    let flag = |k: &str| v.get(k).and_then(|x| x.as_bool()).unwrap_or(false);
    let wants = Wants {
        pdf: flag("want_pdf"),
        source: flag("want_source"),
        // Asked for by a preview pane that is following a narrowed source pane,
        // and by nothing else.
        lines: flag("want_lines"),
        // Asked for by the notes drawer while it is open, and by nothing else.
        markers: flag("want_markers"),
        // Asked for by the find drawer while it is searching the preview, and
        // by nothing else.
        text: flag("want_text"),
    };
    // Pages the client already has, by fingerprint.
    //
    // A one-character edit in a 48-page document leaves 47 pages byte-identical
    // and changes 40 KB of 9.7 MB — and all 9.7 MB used to be serialised, sent,
    // parsed and written into the DOM on every pause in typing. The client says
    // which pages it is still holding; anything it already has comes back as
    // `null` beside its fingerprint, and it puts its own copy back.
    //
    // The engine keeps no per-client state for this. It answers only against the
    // list on the request, so two windows, a reload, or a restarted server can
    // never leave it believing something about a client that is not true.
    let have: std::collections::HashSet<String> = v
        .get("have_pages")
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|h| h.as_str())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let mut result = compile_parts(body, &cfg, &assets, wants, &have);
    // Back into each chapter's own coordinates, and say out loud what the
    // expansion could not do — a name nothing answers to, a loop.
    include::relabel(&expanded, &mut result.diagnostics);
    // The same translation for the page runs, and it is a separate call rather
    // than a line inside the one above because the two carry different things:
    // a diagnostic has one line to move, and a run has to be *split* where a
    // page holds the end of one chapter and the head of the next.
    pagelines::relabel(&expanded, &mut result.pages_lines);
    // And the same for the printed lines, which is simpler than either: a
    // printed line is one line of one file, so there is nothing to split.
    pagetext::relabel(&expanded, &mut result.pages_text);
    // And the third translation, which is a deletion — see `notemarks::keep_main`
    // for why a marker from an included chapter cannot be moved into the open
    // document's coordinates the way a page run can.
    notemarks::keep_main(&expanded, body, &mut result.note_markers);
    for problem in &expanded.problems {
        result
            .diagnostics
            .push(Diagnostic::ours("error", problem.clone()));
    }
    // A refused asset name is a warning, not a problem with the sefer: the
    // document still typesets, the image simply is not there, and the writer is
    // owed the reason. Announced rather than dropped, because the alternative is
    // a file that silently does not appear.
    result.diagnostics.extend(refused.diagnostics());

    // Pages the client already has, by fingerprint.
    //
    // A one-character edit in a 48-page document leaves 47 pages byte-identical
    // and changes 40 KB of 9.7 MB — and all 9.7 MB used to be serialised, sent,
    // parsed and written into the DOM on every pause in typing. The client says
    // which pages it is still holding; anything it already has comes back as
    // `null` beside its fingerprint, and it puts its own copy back.
    //
    // The engine keeps no per-client state for this. It answers only against the
    // list on the request, so two windows, a reload, or a restarted server can
    // never leave it believing something about a client that is not true.
    // The set is read *before* the compile now and handed down, because the
    // saving is in not serialising rather than in not sending. See
    // `compile_parts`.
    let fingerprints = std::mem::take(&mut result.pages_hash);
    let pages: Vec<serde_json::Value> = result
        .pages_svg
        .iter()
        .zip(&fingerprints)
        .map(|(svg, fp)| {
            if have.contains(fp) {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(svg.clone())
            }
        })
        .collect();

    let diags = &result.diagnostics;
    let pdf_b64 = result
        .pdf
        .as_ref()
        .map(|p| base64::engine::general_purpose::STANDARD.encode(p));
    serde_json::json!({
        "ok": result.ok(),
        // Each entry is the page's SVG, or `null` when the client said it already
        // holds the page with that fingerprint.
        "pages_svg": pages,
        // One fingerprint per page, always — it is what the client stores its
        // copy under and what it sends back next time.
        "pages_hash": fingerprints,
        "pdf_base64": pdf_b64,
        "diagnostics": diags,
        "typst_source": result.typst_source,
        // Which of the writer's lines printed on each page — empty unless
        // `want_lines` asked. One entry per page, in page order, so the client
        // can index it by page number; see `pagelines`.
        "pages_lines": result.pages_lines,
        // What each page says — empty unless `want_text` asked. One entry per
        // page, in page order, each line in reading order; see `pagetext`.
        "pages_text": result.pages_text,
        // What each note's marker printed as — empty unless `want_markers`
        // asked. A flat list of (marker, offset) pairs and **not** a list of
        // notes; the client intersects it with the note bodies it already holds.
        // See `notemarks`.
        "note_markers": result.note_markers,
        // Hashes the client thought were cached but the engine no longer holds;
        // it re-sends their bytes on the next compile.
        "missing_assets": missing_assets,
    })
    .to_string()
}

/// Compile to Typst's native HTML — real reflowable web content.
///
/// "Export HTML" used to wrap the rendered SVG *page images* in a bit of HTML:
/// fixed-size pictures of pages, not something you can reflow, copy, search or
/// read on a phone. This produces genuine semantic markup instead — headings are
/// `<h1>`…`<h6>`, emphasis is `<strong>`/`<em>`, paragraphs are `<p>`.
///
/// Typst's HTML export is still under development, so this can fail on a
/// document the paged backend handles fine; callers should keep the paged export
/// available and report the diagnostics rather than presenting HTML as
/// equivalent.
pub fn compile_html(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<String, Vec<Diagnostic>> {
    let source = main_source(body, cfg);
    let located = Located::of(&source, body);
    // `engine_for`, not a second copy of its body.
    //
    // This *was* a copy, and it had lost exactly one line: the
    // `comemo_evict_max_age(Some(10))` that keeps Typst's memoisation cache
    // alive between compiles. `typst-as-lib` defaults it to `Some(0)`, which
    // evicts **everything, globally** — comemo's cache is process-wide, not
    // per-engine, which is the property `layout_source` relies on to survive
    // being run on a fresh thread per compile.
    //
    // So one click on **Export Word** flushed the entire cache and the writer's
    // next keystroke was a cold compile: fonts reloaded, glyphs reshaped, every
    // unchanged region laid out again. That defeated a nine-line comment five
    // hundred lines above explaining why the cache must survive — from a
    // function whose only difference is which document type it asks for.
    let engine = engine_for(source, assets);
    let Warned { output, warnings } = engine.compile::<typst_html::HtmlDocument>();
    match output {
        Ok(doc) => match typst_html::html(&doc, &typst_html::HtmlOptions::default()) {
            Ok(s) => Ok(s),
            Err(diags) => Err(located.all(&diags, "error")),
        },
        Err(err) => {
            let mut d = located.all(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(x) => d.extend(located.all(&x, "error")),
                other => d.push(Diagnostic::ours("error", other.to_string())),
            }
            Err(d)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------- config validation
    //
    // Every one of these used to return `ok: true` with silently garbage output,
    // which is the worst answer a compiler can give: a page that looks like it
    // worked and is not what anybody asked for.

    /// The byte offset just past the `(` that closes the one `s` opens with.
    ///
    /// **This used to be library code.** `inject_reserve_into_writer_masmer`
    /// hand-walked a call's argument list to find out whether the writer had
    /// already named `אזור_הערות`, and needed this to do it. That function now
    /// resolves off the Typst parse (#58) — the parser already knows where the
    /// `)` is, and knows it better than a character counter does — so the only
    /// caller left was the test below and it moved here with them.
    ///
    /// Kept rather than deleted, because the test below is still worth having:
    /// it is the counter's own answers on the shapes a string or a nested tuple
    /// would confuse, and if anything ever walks a call's text again — which is
    /// how #58 happened — these are the cases that counter gets wrong.
    fn closing_paren(s: &str) -> Option<usize> {
        let mut depth = 0usize;
        let mut chars = s.char_indices();
        while let Some((i, c)) = chars.next() {
            match c {
                '"' => {
                    // To the closing quote, honouring backslash escapes. Typst has
                    // no single-quoted string; a `'` is content.
                    let mut escaped = false;
                    for (_, q) in chars.by_ref() {
                        if escaped {
                            escaped = false;
                        } else if q == '\\' {
                            escaped = true;
                        } else if q == '"' {
                            break;
                        }
                    }
                }
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
        }
        None
    }

    fn cfg_from(json: serde_json::Value) -> DocConfig {
        DocConfig::from_json(&json)
    }

    /// Two cm figures that agree to within a rounding error.
    ///
    /// Was a `let near = …` closure written out in each of the reserve tests, and
    /// a fourth copy was one edit away when the channels arrived. The reserve is
    /// arithmetic over declared lengths, so an exact `==` fails on a sum that
    /// went through a percentage.
    fn near(got: f64, want: f64) -> bool {
        (got - want).abs() < 0.001
    }

    /// The built-in channels are the prelude's, and it says so once.
    ///
    /// `TIER_CHANNELS` is why a document full of `#הערה(ערוץ: "הערה_ב")` does not
    /// lose 3 cm off every page for an apparatus it is not using: those seven
    /// names are Typst's own balanced series. A copy of a list is a copy that
    /// goes stale, and this one goes stale *quietly* — the reserve grows and the
    /// sefer repaginates.
    #[test]
    fn the_tier_channels_match_the_prelude() {
        let start = PRELUDE
            .find("#let _ch_tiers = (")
            .expect("`_ch_tiers` is not defined in ksav.typ");
        let open = start + PRELUDE[start..].find('(').unwrap();
        let end = open + closing_paren(&PRELUDE[open..]).expect("unterminated `_ch_tiers`");
        let names: Vec<String> = PRELUDE[open + 1..end]
            .split(',')
            .map(|s| s.trim().trim_matches('"').trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        assert_eq!(
            names, TIER_CHANNELS,
            "the prelude's built-in channels and the reserve's idea of them have \
             parted company"
        );
    }

    #[test]
    fn a_channel_reserves_the_page_foot_only_when_it_lands_there() {
        // The default channel and its tiers are Typst's own balanced series and
        // expand the text region themselves — a reserve would take page height
        // from every document with an ordinary footnote in it.
        assert_eq!(auto_notes_region_cm("טקסט#הערה[גוף]"), 0.0);
        assert_eq!(
            auto_notes_region_cm("טקסט#הערה(ערוץ: \"הערה_ב\")[גוף]"),
            0.0,
            "a built-in tier is the native apparatus"
        );
        assert_eq!(
            auto_notes_region_cm("#ערוץ(\"שער\", מקור: \"הערה\")\nטקסט#הערה(ערוץ: \"שער\")[גוף]"),
            0.0,
            "a channel on a channel, with no region of its own, is a tier too"
        );
        // A channel placed at the back needs no page foot either.
        assert_eq!(
            auto_notes_region_cm(
                "#ערוץ(\"ביאור\", מיקום: \"סוף\")\nטקסט#הערה(ערוץ: \"ביאור\")[גוף]"
            ),
            0.0
        );
        // A channel nobody declared is a page-foot region of its own, and it is
        // the read-only footer apparatus — which is the one that runs off the
        // bottom of the sheet with nothing reserved.
        assert_eq!(
            auto_notes_region_cm("טקסט#הערה(ערוץ: \"מקורות\")[גוף]"),
            DEFAULT_REGION_CM + BAND_RULE_CM
        );
        // Declaring one and never writing into it reserves nothing — the rule the
        // band and stream configuration commands already follow.
        assert_eq!(
            auto_notes_region_cm("#ערוץ(\"ביאור\", מיקום: \"רגל\", גובה: 4cm)\nטקסט"),
            0.0
        );
        // And a declared height is the height that is taken off the margin.
        assert!(near(
            auto_notes_region_cm(
                "#ערוץ(\"ביאור\", מיקום: \"רגל\", גובה: 4cm)\nטקסט#הערה(ערוץ: \"ביאור\")[גוף]"
            ),
            4.0 + BAND_RULE_CM
        ));
        // Both spellings, because a document may be written in either.
        assert!(near(
            auto_notes_region_cm(
                "#channel(\"peirush\", placement: \"foot\", height: 4cm)\n\
                 text#fnote(channel: \"peirush\")[body]"
            ),
            4.0 + BAND_RULE_CM
        ));
    }

    #[test]
    fn channels_sharing_a_region_reserve_it_once() {
        // Two channels, one region, one slot. Reserving per channel would take
        // twice the page foot the apparatus actually occupies.
        let body = "#אזור(\"פירושים\", מיקום: \"רגל\", גובה: 3cm)\n\
                    #ערוץ(\"ביאור\", אזור: \"פירושים\")\n\
                    #ערוץ(\"מקורות\", אזור: \"פירושים\")\n\
                    טקסט#הערה(ערוץ: \"ביאור\")[א]#הערה(ערוץ: \"מקורות\")[ב]";
        assert!(near(auto_notes_region_cm(body), 3.0 + BAND_RULE_CM));
        // …and a channel takes its region's placement, so pointing both at a
        // region declared at the back reserves nothing at all.
        assert_eq!(
            auto_notes_region_cm(&body.replace("\"רגל\", גובה: 3cm", "\"סוף\"")),
            0.0
        );
    }

    #[test]
    fn a_note_written_into_a_region_by_name_reserves_the_region() {
        // `אזור:` is one of the five destinations the chooser writes, and the
        // filing reads the *region's* placement — so it reserves exactly as
        // `ערוץ:` does. Missing this spelling was a reserve of zero for a
        // document whose declared-height region printed off the paper.
        let body = "#אזור(\"צר\", מיקום: \"רגל\", גובה: 2cm)\n\
                    טקסט#הערה(אזור: \"צר\")[גוף]";
        assert!(near(auto_notes_region_cm(body), 2.0 + BAND_RULE_CM));
        // A note carrying both arguments lands in the region, not in two places,
        // so the region is reserved once and the undeclared channel reserves
        // nothing besides it.
        let both = "#אזור(\"r\", מיקום: \"רגל\", גובה: 2cm)\n\
                    טקסט#הערה(ערוץ: \"c\", אזור: \"r\")[גוף]";
        assert!(near(auto_notes_region_cm(both), 2.0 + BAND_RULE_CM));
    }

    #[test]
    fn a_declaration_carrying_a_region_argument_reserves_nothing() {
        // `#ערוץ("c", אזור: "r")` writes no note into anything; the keyed-on-
        // notes rule holds for the region spelling of the argument too.
        assert_eq!(
            auto_notes_region_cm(
                "#ערוץ(\"c\", אזור: \"r\")\n#אזור(\"r\", מיקום: \"רגל\", גובה: 4cm)\nטקסט"
            ),
            0.0
        );
    }

    #[test]
    fn closing_paren_skips_a_quoted_paren() {
        // The channel scans run over text that keeps its string literals, so a
        // value like `"a)b"` used to close the argument list one argument in and
        // the call was read short.
        assert_eq!(closing_paren("(\"a)b\", x)"), Some(9));
        assert_eq!(closing_paren("(\"a\\\"b)\")"), Some(8));
        assert_eq!(closing_paren("(unclosed"), None);
    }

    #[test]
    fn a_commented_out_channel_reserves_nothing() {
        // Parking an apparatus behind `//` while you decide about it must not
        // silently cost 3 cm on every page.
        assert_eq!(
            auto_notes_region_cm("// טקסט#הערה(ערוץ: \"מקורות\")[גוף]\nטקסט"),
            0.0
        );
        // A header whose *text* mentions a channel is text, not an apparatus.
        // The parser only produces a call for real call syntax, so a quoted
        // command in a running head cannot reserve anything — the old hand
        // scanner's known 3 cm over-reserve, written down here so it does not
        // come back.
        assert_eq!(
            auto_notes_region_cm("#כותרת_עליונה(\"ראה #מדף_א[שם]\")"),
            0.0
        );
    }

    /// #58: an inline `אזור_הערות:` that is not an argument is not a setting.
///
/// The reader used to `body.find("אזור_הערות")` and take the number after the
/// colon, so all four of these read as the writer fixing the reserve — and
/// `grow_inline_reserve` **rewrote** it, silently, on every compile:
///
/// | body | what `find` saw |
/// |---|---|
/// | a `//` line mentioning it | the comment's own number |
/// | a `#block` string containing it | the string's number |
/// | prose naming it | the next number in the sentence |
/// | a `#מסמך` *without* it | nothing — but `inject` wrote one into a commented-out call |
///
/// This is the last hand-rolled scan of its kind: `auto_notes_region_cm` had
/// been moved onto the parse long ago (its own test says *"with the parser now
/// doing the lexing"*), and the inline reserve had not. The fence is the four
/// shapes above plus the four that must still work, because a fix that simply
/// stopped finding the name would pass the first half and silently drop every
/// writer's real setting.
#[test]
    fn an_inline_reserve_is_only_read_from_a_call() {
        // **Prose.** The number after the colon is the next one in the sentence.
        assert_eq!(
            inline_reserve_cm("אפשר לכתוב אזור_הערות: 12 ואז לסמן כאן."),
            None,
            "a prose mention set the reserve"
        );
        // **A line comment** — which is what the editor's own "comment out"
        // command writes, so this is the shape a writer actually produces.
        assert_eq!(
            inline_reserve_cm("שלום\n// אזור_הערות: 9cm\nעולם"),
            None,
            "a commented-out reserve was read"
        );
        // **A block comment**, mid-line.
        assert_eq!(
            inline_reserve_cm("שלום /* אזור_הערות: 9cm */ עולם"),
            None,
            "a block-commented reserve was read"
        );
        // **A string.** A header or a note that quotes the argument name.
        assert_eq!(
            inline_reserve_cm("#כותרת_עליונה(\"אזור_הערות: 9cm\")"),
            None,
            "a string was read as a setting"
        );
        assert_eq!(
            inline_reserve_cm("#let x = \"אזור_הערות: 9cm\""),
            None,
            "a let-binding string was read as a setting"
        );
        // **Raw text**, where `#` is not even a code marker.
        assert_eq!(
            inline_reserve_cm("טקסט ```אזור_הערות: 9cm``` יותר"),
            None,
            "raw text was read as a setting"
        );

        // ---- and the shapes that must still be read ----
        // The paren form, both spellings, both units, alone and beside others.
        assert_eq!(inline_reserve_cm("#מסמך(אזור_הערות: 3.5cm)[\nטקסט\n]"), Some(3.5));
        assert_eq!(inline_reserve_cm("#מסמך(אזור_הערות: 2cm)[\nטקסט\n]"), Some(2.0));
        assert_eq!(
            inline_reserve_cm("#masmer(notes_region: 4cm)[\ntext\n]"),
            Some(4.0)
        );
        // Not the first argument.
        assert_eq!(
            inline_reserve_cm("#מסמך(כותרת: \"שם\", אזור_הערות: 2.5cm)[\nטקסט\n]"),
            Some(2.5)
        );
        // And a document that names no reserve at all has none.
        assert_eq!(inline_reserve_cm("סתם טקסט"), None);
        assert_eq!(inline_reserve_cm("#מסמך(כותרת: \"שם\")[\nטקסט\n]"), None);
    }

    /// #58's second half: `grow_inline_reserve` must rewrite a real call and
    /// **nothing else**.
    ///
    /// This is the half that did damage rather than merely misreported. Reading
    /// the wrong number was wrong; *writing over the wrong number* is what
    /// silently shortened a writer's text block, because the page-foot reserve is
    /// subtracted from every page.
    #[test]
    fn growing_the_inline_reserve_rewrites_a_call_and_nothing_else() {
        // The real thing: raised, and only the number changed.
        let grown = grow_inline_reserve("#מסמך(אזור_הערות: 1cm)[\nטקסט\n]", 4.0);
        assert!(
            grown.contains("אזור_הערות: 4.00cm"),
            "the reserve was not raised: {grown}"
        );
        assert!(
            !grown.contains("1cm"),
            "the old number survived: {grown}"
        );
        // Already big enough: untouched, byte for byte.
        let body = "#מסמך(אזור_הערות: 6cm)[\nטקסט\n]";
        assert_eq!(grow_inline_reserve(body, 4.0), body);
        // A mention in a comment is not rewritten — and this is the assertion
        // that would have failed before the fix, because the text scan found the
        // name in the comment and wrote the grown number over the comment's.
        for mention in [
            "שלום\n// אזור_הערות: 1cm\nעולם",
            "שלום /* אזור_הערות: 1cm */ עולם",
            "#כותרת_עליונה(\"אזור_הערות: 1cm\")",
            "#let x = \"אזור_הערות: 1cm\"",
            "אפשר לכתוב אזור_הערות: 1cm כאן.",
        ] {
            assert_eq!(
                grow_inline_reserve(mention, 4.0),
                mention,
                "a mention was rewritten: {mention}"
            );
        }
        // And a call with no reserve argument is *not* given one here — that is
        // `inject_reserve_into_writer_masmer`'s job, and doing it in both places
        // is how the scanned value got into a call that never asked for it.
        let none = "#מסמך(כותרת: \"שם\")[\nטקסט\n]";
        assert_eq!(grow_inline_reserve(none, 4.0), none);
    }

    /// #58's third reader: `inject_reserve_into_writer_masmer` must write into a
    /// real call, and into nothing else.
    ///
    /// The old version scanned for a `#` and read the identifier after it, so a
    /// commented-out `#מסמך(` had an `אזור_הערות:` argument injected into the
    /// middle of the comment — which is the comment the editor writes when a
    /// writer parks a wrapper to think about it.
    #[test]
    fn injecting_the_reserve_touches_a_call_and_not_a_comment() {
        // A bare `#מסמך[…]` is given an argument list.
        let injected = inject_reserve_into_writer_masmer("#מסמך[\nטקסט\n]", "3.00cm");
        assert!(
            injected.contains("#מסמך(אזור_הערות: 3.00cm)["),
            "the bare form was not given an argument list: {injected}"
        );
        // A paren call without the argument gets it, before whatever is there.
        let with_other =
            inject_reserve_into_writer_masmer("#מסמך(כותרת: \"שם\")[\nטקסט\n]", "3.00cm");
        assert!(
            with_other.contains("#מסמך(אזור_הערות: 3.00cm, כותרת:"),
            "the argument was not written: {with_other}"
        );
        // **A commented-out wrapper is not a wrapper.**
        for parked in [
            "// #מסמך[\nטקסט\n]",
            "/* #מסמך(כותרת: \"שם\")[\nטקסט\n] */",
            "#כותרת_עליונה(\"#מסמך(\")",
            "#let tpl = \"#מסמך(\"",
        ] {
            assert_eq!(
                inject_reserve_into_writer_masmer(parked, "3.00cm"),
                parked,
                "a commented-out or quoted wrapper was written into: {parked}"
            );
        }
        // A writer who named the reserve keeps their number, exactly.
        let own = "#מסמך(אזור_הערות: 1cm)[\nטקסט\n]";
        assert_eq!(inject_reserve_into_writer_masmer(own, "3.00cm"), own);
        let own_en = "#מסמך(notes_region: 1cm)[\nטקסט\n]";
        assert_eq!(inject_reserve_into_writer_masmer(own_en, "3.00cm"), own_en);
    }

    #[test]
    fn the_page_foot_reserve_follows_a_real_call_not_a_prose_mention() {
        // A document that only *talks* about the apparatus must not lose 3 cm at
        // the foot of every page for one it never uses.
        assert_eq!(
            auto_notes_region_cm("כאן נסביר מהו מדף_ וכיצד להשתמש בו בטקסט."),
            0.0,
            "a bare mention should reserve nothing"
        );
        // An actual call — both the bracket form and the paren form, top-level and
        // via the family prefix — reserves the region.
        assert_eq!(auto_notes_region_cm("שלום #מדף_א[הערה] עולם"), 3.0);
        assert_eq!(auto_notes_region_cm("#מדף_בדרגה(2)[הערה]"), 3.0);
        assert_eq!(auto_notes_region_cm("#הערה_זרם(זרם: \"א\")[טקסט]"), 3.0);
        // A document with no apparatus at all reserves nothing.
        assert_eq!(auto_notes_region_cm("סתם טקסט עם #הדגשה[מילה]"), 0.0);
    }

    /// The reserve follows the heights the document declared.
    ///
    /// It did not. A flat 3 cm went to every document with a page apparatus,
    /// whatever `#הגדרות_מדפים(גבהים: …)` said — so five centimetres of declared
    /// bands printed the second one **off the sheet** (measured: y=879 on an
    /// 842pt page), and a document asking for one centimetre paid for three.
    /// `page_geometry.rs` holds the same claim against the laid-out page; this
    /// holds the arithmetic, including the reading of the units.
    #[test]
    fn the_reserve_follows_the_declared_band_heights() {
        let with = |heights: &str| {
            auto_notes_region_cm(&format!(
                "#הגדרות_מדפים(גבהים: {heights})\n\n#מדף_א[א] #מדף_ב[ב]"
            ))
        };
        assert!(near(with("(1.5cm, 1cm)"), 2.5 + BAND_GAP_CM + BAND_RULE_CM));
        assert!(near(with("(3cm, 2cm)"), 5.0 + BAND_GAP_CM + BAND_RULE_CM));
        // Every unit Typst writes an absolute length in.
        assert!(near(with("(20mm, 10mm)"), 3.0 + BAND_GAP_CM + BAND_RULE_CM));
        assert!(near(with("(1in,)"), 2.54 + BAND_RULE_CM));
        let pt = with("(72pt, 72pt)");
        assert!(
            near(pt, 2.0 * 2.54 + BAND_GAP_CM + BAND_RULE_CM),
            "got {pt}"
        );
        // A single band has no gap to pay for.
        assert!(near(with("(2cm,)"), 2.0 + BAND_RULE_CM));

        // A length this cannot resolve falls back to the working default rather
        // than to a guess: `em` depends on the font size at the foot of the page,
        // and a wrong number here is wrong in *page geometry*, silently.
        assert_eq!(with("(4em, 3em)"), 3.0);
        // As does a document that declares nothing.
        assert_eq!(auto_notes_region_cm("#מדף_א[א] #מדף_ב[ב]"), 3.0);
        // And declaring heights without ever writing a band still reserves
        // nothing — the gate is the apparatus, not the configuration line.
        assert_eq!(
            auto_notes_region_cm("#הגדרות_מדפים(גבהים: (2cm, 2cm))"),
            0.0
        );
        // A commented-out configuration is not a configuration.
        assert_eq!(
            auto_notes_region_cm("// #הגדרות_מדפים(גבהים: (9cm, 9cm))\n#מדף_א[א]"),
            3.0
        );
        // And the search stays inside the call's own brackets: prose that happens
        // to use the word must not decide how much of every page is reserved.
        assert_eq!(
            auto_notes_region_cm(
                "#הגדרות_מדפים(קו: false)\n\n#מדף_א[א]\n\nעל גבהים: (9cm, 9cm) נדבר להלן."
            ),
            3.0
        );
        // A configuration that sets something else *and* the heights still reads.
        assert!(near(
            auto_notes_region_cm("#הגדרות_מדפים(קו: false, גבהים: (1cm, 1cm))\n#מדף_א[א]"),
            2.0 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // The English spelling reaches the same arithmetic.
        assert!(near(
            auto_notes_region_cm("#pagebands_config(heights: (1cm, 1cm))\n#מדף_א[א]"),
            2.0 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // Any number of bands, not the two or three the UI used to offer. Seven
        // is what מדף_א…ז name, and the arithmetic has to hold at the end of that
        // stack, where the accumulated gaps are what push the last one off.
        assert!(near(
            with("(1cm, 1cm, 1cm, 1cm, 1cm, 1cm, 1cm)"),
            7.0 + BAND_GAP_CM * 6.0 + BAND_RULE_CM
        ));
    }

    /// A region height in percent is a percentage of the **sheet**.
    ///
    /// The prelude resolves the same ratio against `page.height`, so this is one
    /// half of a claim whose other half is `_ap_fixed_height`. They have to agree
    /// on what the percentage is *of*, or the reserve and the band disagree by a
    /// factor of the reserve — and the visible one is the band.
    #[test]
    fn a_percent_region_is_a_percent_of_the_sheet() {
        let with = |heights: &str, sheet: f64| {
            auto_notes_region_cm_on(
                &format!("#הגדרות_מדפים(גבהים: {heights})\n\n#מדף_א[א] #מדף_ב[ב]"),
                sheet,
            )
        };
        // A4: 29.7 cm. 10% + 5% is 2.97 + 1.485.
        assert!(near(
            with("(10%, 5%)", 29.7),
            2.97 + 1.485 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // The same document on A3 reserves proportionally more, which is the
        // entire reason to write a percentage instead of a centimetre.
        assert!(near(
            with("(10%, 5%)", 42.0),
            4.2 + 2.1 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // Mixed units in one tuple: a fixed rule under a proportional band is a
        // real thing to want, and one unreadable entry must not be inferred from
        // the readable ones.
        assert!(near(
            with("(20%, 1cm)", 29.7),
            5.94 + 1.0 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // `em` is still unresolvable — it depends on the font size at the foot of
        // the page, which this scanner does not know and must not guess.
        assert_eq!(with("(4em, 3em)", 29.7), DEFAULT_REGION_CM);
        // And a document that asks for more page than it has gets clipped regions
        // rather than a document that will not lay out at all.
        assert!(near(with("(60%, 50%)", 29.7), 29.7 * MAX_REGION_SHARE));
    }

    /// The streams reserve the page foot too, from their own dictionary.
    ///
    /// They always needed it — `#הערה_זרם` has been on the page-apparatus list
    /// since that list was written — but only the bands' *array* was ever read,
    /// so a three-stream document with declared heights got the flat 3 cm and
    /// printed its third stream at y=823.62 on an 841.89pt sheet, below the page
    /// number at 799.02. The bug had just been fixed one apparatus over.
    #[test]
    fn the_reserve_follows_the_declared_stream_heights() {
        let three = "#הגדרות_זרמים(גבהים: (\"ביאור\": 2cm, \"מקורות\": 1cm, \"נוסחאות\": 1cm))\n\
                     #הערה_זרם(\"ביאור\")[א] #הערה_זרם(\"מקורות\")[ב] #הערה_זרם(\"נוסחאות\")[ג]";
        assert!(near(
            auto_notes_region_cm(three),
            4.0 + BAND_GAP_CM * 2.0 + BAND_RULE_CM
        ));
        // The English spelling of both the command and the key.
        assert!(near(
            auto_notes_region_cm(
                "#streams_config(heights: (\"a\": 2cm, \"b\": 1cm))\n#stream_note(\"a\")[x]"
            ),
            3.0 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // Percent works here too, and against the sheet.
        assert!(near(
            auto_notes_region_cm_on(
                "#הגדרות_זרמים(גבהים: (\"ביאור\": 10%, \"מקורות\": 5%))\n#הערת_תוכן[א]",
                29.7
            ),
            2.97 + 1.485 + BAND_GAP_CM + BAND_RULE_CM
        ));
        // An empty dictionary is the default and declares nothing.
        assert_eq!(
            auto_notes_region_cm("#הגדרות_זרמים(גבהים: (:))\n#הערת_מקור[א]"),
            DEFAULT_REGION_CM
        );
        // Configuring the streams without writing one still reserves nothing.
        assert_eq!(
            auto_notes_region_cm("#הגדרות_זרמים(גבהים: (\"ביאור\": 4cm))"),
            0.0
        );
        // Streams and tiers are separate apparatuses that render into the *same*
        // reserved block, one under the other. A document carrying both needs
        // room for both — the sum, not whichever the scanner happened to find
        // first.
        let both = "#הגדרות_מדפים(גבהים: (1.5cm, 1cm))\n\
                    #הגדרות_זרמים(גבהים: (\"מקורות\": 1cm))\n\
                    #מדף_א[א] #מדף_ב[ב] #הערה_זרם(\"מקורות\")[ג]";
        assert!(near(
            auto_notes_region_cm(both),
            (2.5 + BAND_GAP_CM + BAND_RULE_CM) + (1.0 + BAND_RULE_CM)
        ));
        // …including when only one of the two says how tall it is.
        assert!(near(
            auto_notes_region_cm("#הגדרות_מדפים(גבהים: (1cm,))\n#מדף_א[א] #הערת_מקור[ב]"),
            (1.0 + BAND_RULE_CM) + DEFAULT_REGION_CM
        ));
    }

    /// The reserve survives the shapes the hand scanners were written to
    /// survive, with the parser now doing the lexing.
    ///
    /// These are the cases the differential gate covered before the hand
    /// scanner retired — comments, strings and unbalanced brackets, which are
    /// what a body looks like while its writer is typing. Each assertion pins
    /// the parser's answer so the reserve cannot regress into one of the old
    /// failure modes: a commented-out apparatus reserving a full page foot, a
    /// string that mentions a command counting as a call, or a document that
    /// never finishes a bracket stealing space from every page.
    #[test]
    fn the_reserve_reads_comments_strings_and_unbalanced_brackets() {
        // A comment is a place to park an apparatus, not a document that has one.
        assert_eq!(auto_notes_region_cm("// #מדף_א[הערה]\nטקסט"), 0.0);
        assert_eq!(auto_notes_region_cm("שלום /* #מדף_א[הערה] */ עולם"), 0.0);
        assert_eq!(
            auto_notes_region_cm("// אולי #הערה_זרם(זרם: \"א\")[טקסט]\nעולם"),
            0.0
        );
        // A comment between the halves of a name must not let them meet.
        assert_eq!(auto_notes_region_cm("מד/* x */ף_א[הערה]"), 0.0);
        // A string is text, not a call.
        assert_eq!(auto_notes_region_cm("#let x = \"#מדף_א[א]\""), 0.0);
        assert_eq!(
            auto_notes_region_cm("#כותרת_עליונה(\"ראה #מדף_א[שם]\")"),
            0.0
        );
        // Unbalanced, as a body is while its writer is typing: the reserve must
        // not fall over, and must not invent an apparatus that is not there.
        assert_eq!(auto_notes_region_cm("#הערה("), 0.0);
        assert_eq!(auto_notes_region_cm("טקסט#הערה(ערוץ: \"מקורות\""), 0.0);
        assert_eq!(auto_notes_region_cm("#הגדרות_מדפים(גבהים: (1cm, "), 0.0);
        // …but a real call that merely has not got its bracket yet still counts.
        assert_eq!(auto_notes_region_cm("#מדף_א["), 3.0);
    }

    /// A commented-out apparatus is not an apparatus.
    ///
    /// The case the test above stopped one short of. Parking a band while you
    /// decide about it — `// #מדף_א[…]`, which is what the editor's own
    /// "comment out" command writes — reserved 3 cm at the foot of **every page
    /// in the document**, and the writer's only symptom is that their text block
    /// got shorter for no reason they can see.
    #[test]
    fn a_commented_out_apparatus_reserves_nothing() {
        assert_eq!(
            auto_notes_region_cm(
                "שלום
// #מדף_א[הערה]
עולם"
            ),
            0.0
        );
        assert_eq!(auto_notes_region_cm("שלום /* #מדף_א[הערה] */ עולם"), 0.0);
        assert_eq!(
            auto_notes_region_cm(
                "שלום
// אולי #הערה_זרם(זרם: \"א\")[טקסט]
עולם"
            ),
            0.0
        );
        // And a string is text, not a call: a running head that *mentions* an
        // apparatus is a header, not a document that has one.
        assert_eq!(
            auto_notes_region_cm("#כותרת_עליונה(\"ראה #מדף_א[שם]\")"),
            0.0
        );
        // The apparatus still counts when it is real and a comment is merely
        // nearby — the fix must not blank the wrong half of the line.
        assert_eq!(
            auto_notes_region_cm(
                "// הערה
#מדף_א[הערה]"
            ),
            3.0
        );
        assert_eq!(auto_notes_region_cm("#מדף_א[הערה] // הערה"), 3.0);
    }

    /// Every command in the prelude that puts notes in the page footer, derived
    /// from the prelude rather than remembered.
    ///
    /// Two of the apparatuses in `ksav.typ` render from the page footer, and
    /// both say so the same way: they hand `_ap_note` the label their notes
    /// carry. So the primitives are the `_ap_note` call sites carrying a footer
    /// label, and the family is those plus every one-line alias that delegates
    /// to a member of it, transitively — which is exactly how the aliases are
    /// written (`#let מדף_א(body) = מדף_בדרגה(1, body)`, `#let pageband =
    /// מדף_בדרגה`).
    fn footer_note_commands() -> Vec<String> {
        let mut fam: Vec<String> = Vec::new();

        // The primitives: a `#let` whose body calls `_ap_note` with a label the
        // page footer renders.
        for (i, _) in PRELUDE.match_indices("_ap_note(") {
            // The whole argument list, not up to the first `)` — the arguments
            // contain calls of their own (`_pp_cfg.get()`).
            let mut depth = 0i32;
            let mut end = PRELUDE.len();
            for (j, c) in PRELUDE[i..].char_indices() {
                match c {
                    '(' => depth += 1,
                    ')' => {
                        depth -= 1;
                        if depth == 0 {
                            end = i + j;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            let call = &PRELUDE[i..end];
            if !(call.contains("_pp_label") || call.contains("_sf_label")) {
                continue;
            }
            // Walk back to the `#let` this call belongs to.
            let Some(l) = PRELUDE[..i].rfind("\n#let ") else {
                continue;
            };
            let head = &PRELUDE[l + 6..];
            let name: String = head
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_')
                .collect();
            if !name.is_empty() && !fam.contains(&name) {
                fam.push(name);
            }
        }
        assert!(
            fam.len() >= 2,
            "no footer-rendered note primitives found in the prelude — either the \
             apparatus stopped going through `_ap_note`, or this derivation is \
             reading the wrong thing. Found: {fam:?}"
        );

        // The aliases: `#let X(..) = Y(..)`, `#let X = Y`, or `#let X = _en(Y, …)`
        // — an alias wrapped so its parameters may be given in English — to a
        // fixpoint. The `_en` form is not a curiosity: every alias to a command
        // that takes named arguments has to be wrapped, or its parameters stay
        // Hebrew on the English spelling. So the moment a footer apparatus grew
        // per-note style overrides, `#let pageband = מדף_בדרגה` became
        // `#let pageband = _en(מדף_בדרגה, …)`, this derivation read the target as
        // `_en`, and the whole `pageband*` family stopped being seen as reserving
        // page foot at all. Which the fence below caught, in this direction.
        loop {
            let before = fam.len();
            for line in PRELUDE.lines() {
                let Some(rest) = line.strip_prefix("#let ") else {
                    continue;
                };
                let Some((lhs, rhs)) = rest.split_once('=') else {
                    continue;
                };
                let name: String = lhs
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                let body = rhs.trim_start();
                let body = body.strip_prefix("_en(").unwrap_or(body);
                let target: String = body
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if fam.contains(&target) && !fam.contains(&name) && !name.is_empty() {
                    fam.push(name);
                }
            }

            if fam.len() == before {
                break;
            }
        }
        fam
    }

    /// Every prefix the reserve is decided from, both apparatuses together.
    ///
    /// The runtime keeps them apart because they reserve separately; this fence
    /// asks the other question — whether between them they still name everything
    /// the prelude renders into a page footer — and for that they are one list.
    fn page_apparatus_commands() -> Vec<&'static str> {
        BAND_COMMANDS
            .iter()
            .chain(STREAM_COMMANDS.iter())
            .copied()
            .collect()
    }

    #[test]
    fn the_page_foot_reserve_list_matches_the_prelude() {
        let family = footer_note_commands();
        let listed = page_apparatus_commands();

        // Direction 1: nothing the prelude renders into the footer is missing.
        // A missing one means a document using it keeps its full text height and
        // the apparatus runs off the bottom of the sheet.
        for cmd in &family {
            assert!(
                listed.iter().any(|p| cmd.starts_with(p)),
                "`{cmd}` renders into the page footer and no prefix in \
                 BAND_COMMANDS or STREAM_COMMANDS covers it, so a document using \
                 it reserves no room for its own apparatus.\n\
                 The footer-rendered family, read out of ksav.typ: {family:?}"
            );
        }

        // Direction 2: nothing in the lists names something that no longer
        // exists. A dead prefix is worse than useless — it reads as coverage.
        //
        // **Named in the prelude at all**, rather than named in the derived
        // family. A command may be a *door* — `#הערה_זרם` decides whether the
        // note goes to the margin or the page foot and calls the renderer — and
        // a door does not itself call `_ap_note`, so it is not in the family and
        // is still very much alive. Asking the stricter question failed on the
        // refactor that introduced one, which is the fence complaining about the
        // wrong thing: what makes a prefix dead is the command going away.
        for p in &listed {
            assert!(
                PRELUDE.contains(&format!("#let {p}")) || family.iter().any(|c| c.starts_with(p)),
                "{p:?} is listed as a page-foot apparatus and names nothing in \
                 ksav.typ at all.\n\
                 The footer-rendered family, read out of ksav.typ: {family:?}"
            );
        }

        // And a command may not be in both halves, or its reserve is counted
        // twice and the text block shrinks for no reason the writer can see.
        for c in BAND_COMMANDS {
            assert!(!STREAM_COMMANDS.contains(c), "{c:?} is in both halves");
        }

        // And the reserve really follows from membership, not from the prefix
        // table happening to contain a string. Both ways a footer command can
        // reach a page: called with a bracket, and handed to `#הערה_בשם` as the
        // *value* of `סוג`, where there is no bracket for a scanner to find.
        for cmd in &family {
            assert_eq!(
                auto_notes_region_cm(&format!("פתיחה#{cmd}[הערה] וסוף.")),
                3.0,
                "a document calling `#{cmd}` should reserve the page foot"
            );
            assert_eq!(
                auto_notes_region_cm(&format!(
                    "פתיחה#הערה_בשם(\"א\", סוג: {cmd})\n#גוף_הערה(\"א\")[הערה]\n"
                )),
                3.0,
                "a deferred note printed through `{cmd}` should reserve the page \
                 foot — the command is a value here, with no bracket after it"
            );
        }
    }

    #[test]
    fn impossible_numbers_are_brought_back_into_range() {
        let c = cfg_from(serde_json::json!({
            "size_pt": 0, "line_spacing_em": -3.0, "columns": 5000, "margin_cm": -1.0,
        }));
        assert!(
            c.size_pt >= 1.0,
            "zero-size text is invisible, not a choice"
        );
        assert!(
            c.line_spacing_em >= 0.0,
            "negative leading stacks lines on top of each other"
        );
        assert!(c.columns <= 12, "5000 columns is a page of hairlines");
        assert!(c.margin_cm >= 0.0);
    }

    #[test]
    fn a_document_with_impossible_settings_still_renders() {
        let cfg = cfg_from(serde_json::json!({
            "size_pt": -5, "columns": 5000, "line_spacing_em": -3.0, "first_line_indent_em": -9.0,
        }));
        let out = compile("שלום", &cfg);
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn nan_and_infinity_are_refused_rather_than_clamped() {
        // Serde will not parse a bare NaN, so this is the shape that actually
        // reaches us: a string where a number was expected. Either way the
        // default must survive — a NaN formatted into the prelude is not a
        // Typst length and fails inside code the writer never wrote.
        let c = cfg_from(serde_json::json!({ "size_pt": "NaN", "columns": "many" }));
        assert_eq!(c.size_pt, DocConfig::default().size_pt);
        assert_eq!(c.columns, DocConfig::default().columns);
    }

    // ------------------------------------------------------- string escaping

    #[test]
    fn a_backslash_in_a_setting_cannot_escape_its_string_literal() {
        // `paper: "a4\"` used to close the literal early and fail the whole
        // document with "unclosed delimiter" pointing at the prelude rather than
        // at the setting. Every one of these must simply render.
        for cfg in [
            DocConfig {
                paper: "a4\\".into(),
                ..Default::default()
            },
            DocConfig {
                paper: "a4\"".into(),
                ..Default::default()
            },
            DocConfig {
                font: "Frank\\".into(),
                ..Default::default()
            },
            DocConfig {
                font: "Frank\" ,גודל: 99pt, x: \"".into(),
                ..Default::default()
            },
            DocConfig {
                header: "כותרת\\".into(),
                ..Default::default()
            },
            DocConfig {
                footer: "\\\"".into(),
                ..Default::default()
            },
        ] {
            let out = compile("שלום", &cfg);
            assert!(
                out.ok(),
                "a hostile {:?}/{:?} broke the document: {:?}",
                cfg.font,
                cfg.paper,
                out.diagnostics
            );
        }
    }

    #[test]
    fn a_paper_name_is_reduced_to_something_typst_can_read() {
        assert_eq!(sanitize_paper("A4"), "a4");
        assert_eq!(sanitize_paper("us-letter"), "us-letter");
        assert_eq!(sanitize_paper("a4\\\" ,x: \"y"), "a4xy");
        assert_eq!(sanitize_paper("\"\\"), "");
    }

    #[test]
    fn typst_str_doubles_the_backslash_before_the_quote() {
        // Order matters: escaping the quote first would turn `"` into `\"`, and
        // the backslash pass would then produce `\\"` — closing the literal.
        assert_eq!(typst_str("a\\"), "\"a\\\\\"");
        assert_eq!(typst_str("a\"b"), "\"a\\\"b\"");
        assert_eq!(typst_str("\\\""), "\"\\\\\\\"\"");
    }

    // ------------------------------------------------------- preview vs export

    #[test]
    fn a_preview_carries_no_pdf_and_an_export_does() {
        let body = serde_json::json!({ "body": "שלום" }).to_string();
        let preview: serde_json::Value = serde_json::from_str(&compile_request(&body)).unwrap();
        assert_eq!(preview["ok"], true);
        assert!(!preview["pages_svg"].as_array().unwrap().is_empty());
        assert!(
            preview["pdf_base64"].is_null(),
            "the preview must not carry ~300 KB of base64 nothing on screen reads"
        );

        let export = serde_json::json!({ "body": "שלום", "want_pdf": true }).to_string();
        let exported: serde_json::Value = serde_json::from_str(&compile_request(&export)).unwrap();
        assert!(exported["pdf_base64"]
            .as_str()
            .is_some_and(|s| !s.is_empty()));
    }

    #[test]
    fn a_request_that_does_not_parse_is_an_error_not_a_blank_page() {
        // Falling back to an absent body compiled one blank page and called it
        // `ok: true`, so a truncated upload silently wiped the preview.
        for bad in ["", "garbage", "{\"body\": ", "{\"body\":\"a\nb\"}"] {
            let out: serde_json::Value = serde_json::from_str(&compile_request(bad)).unwrap();
            assert_eq!(out["ok"], false, "{bad:?} must not report success");
            assert!(
                out["pages_svg"].as_array().is_some_and(|p| p.is_empty()),
                "{bad:?} must not render a page"
            );
            let msg = out["diagnostics"][0]["message"].as_str().unwrap_or("");
            assert!(
                msg.contains("could not be read"),
                "{bad:?} must say why: {msg}"
            );
        }
        // A well-formed request is unaffected.
        let good = serde_json::json!({ "body": "שלום" }).to_string();
        let out: serde_json::Value = serde_json::from_str(&compile_request(&good)).unwrap();
        assert_eq!(out["ok"], true);
    }

    #[test]
    fn a_request_with_no_usable_body_is_an_error_not_a_blank_page() {
        // The same failure as above by a different route: JSON that parses fine
        // but whose `body` is missing or is not text used to reach `unwrap_or("")`
        // and compile one blank page reported as `ok: true` — a wiped preview
        // that looks like a successful render.
        let cases = [
            serde_json::json!({}),
            serde_json::json!({ "font": "David Libre" }),
            serde_json::json!({ "body": 12345 }),
            serde_json::json!({ "body": serde_json::Value::Null }),
            serde_json::json!({ "body": ["שלום"] }),
            serde_json::json!({ "body": { "text": "שלום" } }),
        ];
        for bad in cases {
            let out: serde_json::Value =
                serde_json::from_str(&compile_request(&bad.to_string())).unwrap();
            assert_eq!(out["ok"], false, "{bad} must not report success");
            assert!(
                out["pages_svg"].as_array().is_some_and(|p| p.is_empty()),
                "{bad} must not render a page"
            );
            let msg = out["diagnostics"][0]["message"].as_str().unwrap_or("");
            assert!(
                msg.contains("could not be read"),
                "{bad} must say why: {msg}"
            );
        }

        // An *empty* body is not malformed — it is a new document, and it must
        // still render its one blank page rather than being called an error.
        let empty = serde_json::json!({ "body": "" }).to_string();
        let out: serde_json::Value = serde_json::from_str(&compile_request(&empty)).unwrap();
        assert_eq!(out["ok"], true, "an empty document is legitimate");
        assert_eq!(out["pages_svg"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn success_is_reported_even_when_no_pdf_was_asked_for() {
        // `ok` used to mean `pdf.is_some()`, which would report every successful
        // preview as a failure the moment previews stopped rendering a PDF.
        let out = compile_parts(
            "שלום",
            &DocConfig::default(),
            &Assets::default(),
            Wants::default(),
            &Default::default(),
        );
        assert!(out.ok());
        assert!(out.pdf.is_none());
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn a_preview_carries_no_assembled_source_and_an_export_does() {
        // 75 KB of prelude in an 84 KB response, for a one-page document, read by
        // nothing on screen. The one caller that wants it asks.
        let preview = serde_json::json!({ "body": "שלום" }).to_string();
        let p: serde_json::Value = serde_json::from_str(&compile_request(&preview)).unwrap();
        assert_eq!(p["ok"], true);
        assert_eq!(
            p["typst_source"].as_str(),
            Some(""),
            "the preview must not carry the prelude nobody reads"
        );

        let export = serde_json::json!({ "body": "שלום", "want_source": true }).to_string();
        let e: serde_json::Value = serde_json::from_str(&compile_request(&export)).unwrap();
        assert!(
            e["typst_source"]
                .as_str()
                .is_some_and(|s| s.contains("#show: מסמך.with(")),
            "an export must carry the real assembled source"
        );
    }

    #[test]
    fn a_page_the_client_already_holds_comes_back_as_null() {
        // The first compile hands over every page and names them.
        let ask = serde_json::json!({ "body": "שלום עולם" }).to_string();
        let first: serde_json::Value = serde_json::from_str(&compile_request(&ask)).unwrap();
        let hashes: Vec<String> = first["pages_hash"]
            .as_array()
            .unwrap()
            .iter()
            .map(|h| h.as_str().unwrap().to_string())
            .collect();
        assert_eq!(hashes.len(), 1);
        assert!(first["pages_svg"][0].is_string());

        // Asked again by a client that says it still has that page, the engine
        // names it and sends nothing.
        let again =
            serde_json::json!({ "body": "שלום עולם", "have_pages": hashes.clone() }).to_string();
        let second: serde_json::Value = serde_json::from_str(&compile_request(&again)).unwrap();
        assert!(
            second["pages_svg"][0].is_null(),
            "an unchanged page must not be sent twice"
        );
        assert_eq!(second["pages_hash"], first["pages_hash"]);

        // A page it does *not* hold arrives in full, even though it claimed
        // something. Nothing may depend on the two lists lining up by position.
        let other =
            serde_json::json!({ "body": "טקסט אחר לגמרי", "have_pages": hashes }).to_string();
        let third: serde_json::Value = serde_json::from_str(&compile_request(&other)).unwrap();
        assert!(
            third["pages_svg"][0].is_string(),
            "a page the client has never seen must be sent"
        );
    }

    /// Same page, two requests: same name. Different page: different name. This
    /// is the whole contract the client's cache rests on — and it is now checked
    /// through a *compile*, because the fingerprint is of the laid-out page
    /// rather than of its SVG. That is the point of the change: the fingerprint
    /// has to be knowable before the serialisation, or the cache saves bandwidth
    /// by doing all of the work first (310 ms of 343 on a 28-page document).
    #[test]
    fn a_fingerprint_follows_the_page_and_not_the_request() {
        let hashes = |body: &str| {
            compile_parts(
                body,
                &DocConfig::default(),
                &Assets::default(),
                Wants::default(),
                &Default::default(),
            )
            .pages_hash
        };
        let a = hashes("שלום");
        let b = hashes("שלום");
        let c = hashes("טקסט אחר לגמרי");
        assert_eq!(a, b, "the same document fingerprinted differently twice");
        assert_ne!(a, c, "two different pages share a fingerprint");
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].len(), 32, "thirty-two hex digits of a 128-bit hash");
    }

    /// A page the caller already holds is never serialised.
    ///
    /// The assertion the whole change exists for, and it is about *work* rather
    /// than about the answer: the response is identical either way, so nothing
    /// downstream can tell. What tells is that `pages_svg` is empty for a page
    /// whose fingerprint was on the request.
    #[test]
    fn a_page_the_caller_holds_is_not_serialised() {
        let cfg = DocConfig::default();
        let first = compile_parts(
            "שלום",
            &cfg,
            &Assets::default(),
            Wants::default(),
            &Default::default(),
        );
        assert!(
            !first.pages_svg[0].is_empty(),
            "the first ask must send the page"
        );

        let have: std::collections::HashSet<String> = first.pages_hash.iter().cloned().collect();
        let again = compile_parts("שלום", &cfg, &Assets::default(), Wants::default(), &have);
        assert_eq!(again.pages_hash, first.pages_hash, "the fingerprint moved");
        assert!(
            again.pages_svg[0].is_empty(),
            "a page the caller already holds was serialised anyway"
        );
    }

    /// The third `Wants` flag, held to the same bargain as the other two: off by
    /// default, and *actually* off.
    ///
    /// A flag that is read but never gates anything costs exactly what it was
    /// introduced to save, silently, on every keystroke-driven compile in the
    /// application — which is the shape of the mistake `want_pdf` and
    /// `want_source` were each introduced to undo, and there is no way to notice
    /// it from the outside because the answer is correct either way.
    #[test]
    fn the_page_runs_are_only_computed_when_they_are_asked_for() {
        let cfg = DocConfig::default();
        let body = "שורה ראשונה\n\n#מעבר_עמוד\n\nשורה אחרונה";
        let quiet = compile_parts(
            body,
            &cfg,
            &Assets::default(),
            Wants::default(),
            &Default::default(),
        );
        assert!(
            quiet.pages_lines.is_empty(),
            "a compile nobody asked walked every frame anyway: {:?}",
            quiet.pages_lines
        );

        let asked = compile_parts(
            body,
            &cfg,
            &Assets::default(),
            Wants {
                lines: true,
                ..Default::default()
            },
            &Default::default(),
        );
        assert_eq!(
            asked.pages_lines.len(),
            asked.pages_svg.len(),
            "one answer per page: {:?}",
            asked.pages_lines
        );
        assert!(
            asked.pages_lines.iter().any(|p| !p.is_empty()),
            "asked for and answered with nothing: {:?}",
            asked.pages_lines
        );
    }

    /// And the same across the wire, which is the only route the editor takes.
    #[test]
    fn the_wire_carries_the_page_runs_when_asked() {
        let ask = |extra: serde_json::Value| {
            let mut v = serde_json::json!({ "body": "א\n\n#מעבר_עמוד\n\nב" });
            for (k, val) in extra.as_object().unwrap() {
                v[k] = val.clone();
            }
            let out: serde_json::Value =
                serde_json::from_str(&compile_request(&v.to_string())).unwrap();
            out["pages_lines"].as_array().cloned().unwrap_or_default()
        };
        assert!(
            ask(serde_json::json!({})).is_empty(),
            "the runs rode on a request that did not ask for them"
        );
        let asked = ask(serde_json::json!({ "want_lines": true }));
        assert_eq!(asked.len(), 2, "one entry per page: {asked:?}");
        assert!(
            asked[0].as_array().is_some_and(|r| !r.is_empty()),
            "the first page reported no lines at all: {asked:?}"
        );
    }

    /// The fourth flag, held to the same bargain as the other three.
    ///
    /// It shares `lines`'s re-parse of the main source, which is the one part of
    /// the cost that is worth sharing and the one part a test can be fooled by:
    /// a `parsed` computed unconditionally would leave both flags looking gated
    /// while the expensive half ran on every keystroke. So the assertion is
    /// about the **answer** being absent, which is the only thing observable
    /// from out here.
    #[test]
    fn the_note_markers_are_only_computed_when_they_are_asked_for() {
        let cfg = DocConfig::default();
        let body = "שלום#הערה[ראשונה] עולם";
        let quiet = compile_parts(
            body,
            &cfg,
            &Assets::default(),
            Wants::default(),
            &Default::default(),
        );
        assert!(
            quiet.note_markers.is_empty(),
            "a compile nobody asked walked every frame anyway: {:?}",
            quiet.note_markers
        );

        let asked = compile_parts(
            body,
            &cfg,
            &Assets::default(),
            Wants {
                markers: true,
                ..Default::default()
            },
            &Default::default(),
        );
        assert!(
            asked.note_markers.iter().any(|m| m.marker == "1"),
            "asked for and answered with nothing: {:?}",
            asked.note_markers
        );
        assert!(
            asked.pages_lines.is_empty(),
            "asking for the markers turned the page runs on too: {:?}",
            asked.pages_lines
        );
    }

    /// And the same across the wire, which is the only route the editor takes.
    #[test]
    fn the_wire_carries_the_note_markers_when_asked() {
        let ask = |extra: serde_json::Value| {
            let mut v = serde_json::json!({ "body": "שלום#הערה[ראשונה] עולם" });
            for (k, val) in extra.as_object().unwrap() {
                v[k] = val.clone();
            }
            let out: serde_json::Value =
                serde_json::from_str(&compile_request(&v.to_string())).unwrap();
            out["note_markers"].as_array().cloned().unwrap_or_default()
        };
        assert!(
            ask(serde_json::json!({})).is_empty(),
            "the markers rode on a request that did not ask for them"
        );
        let asked = ask(serde_json::json!({ "want_markers": true }));
        assert!(
            asked.iter().any(|m| m["marker"] == "1"),
            "the note's own marker is not in the response: {asked:?}"
        );
    }

    #[test]
    fn every_registered_command_is_defined() {
        // Each command's Hebrew name and English alias must have a matching `#let`
        // in the prelude — otherwise the palette would insert an undefined call.
        let defined = |name: &str| {
            PRELUDE.contains(&format!("#let {name}("))
                || PRELUDE.contains(&format!("#let {name} ="))
                || PRELUDE.contains(&format!("#let {name}\n"))
        };
        for c in commands::COMMANDS {
            assert!(
                defined(c.he),
                "Hebrew command not defined in prelude: {}",
                c.he
            );
            assert!(
                defined(c.en),
                "English alias not defined in prelude: {}",
                c.en
            );
        }
    }

    #[test]
    fn config_english_aliases_compile() {
        let body = "#headings_config(מספור: \"1.1\")\n#lists_config(סמן: ([◆],))\n\
                    #tables_config(פסים: true)\n#pagebands_config(מספור: (\"1\", \"א\"))\n\
                    #streams_config(פריסה: \"צד\")\n#h1[פרק]\n#bullets(item[א])\n\
                    #mktable(עמודות: 2, cell[1], cell[2])\n\
                    א#pageband1[ב] ג#contentnote[ד] ה#stream_note(\"x\")[ו]\n\
                    #endnotes_side(זרמים: (\"x\",))";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn compiles_basic_hebrew() {
        let out = compile("#הדגשה[שלום עולם]", &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn deep_cross_nesting_compiles() {
        // table inside footnote inside heading inside list item
        let body = "#רשימה(פריט[\
            #כותרת2[פריט עם כותרת #הערה[\
                #טבלה(עמודות: 2, תא[א], תא[ב], תא[1], תא[2])\
            ]]\
        ])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    /// Full torture test: every structure nested inside every other, footnotes
    /// three deep, lists five deep, headings up to level 10. Renders because
    /// Typst parses the document — nesting is unbounded.
    #[test]
    fn everything_inside_everything() {
        let body = include_str!("../examples/nesting.ksav");
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn footnote_within_footnote() {
        let out = compile("א#הערה[ב#הערה[ג#הערה[ד]]]", &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn deep_note_on_note_separate_blocks() {
        // A note-on-a-note nested 5 deep — each level is hoisted to its own
        // footnote block (sequential numbering, spaced apart via footnote.entry gap).
        let body = "א#הערה[ב#הערה_על_הערה[ג#הערה_על_הערה[ד#הערה_על_הערה[ה\
                    #הערה_על_הערה[ו]]]]] ז#הערה[ח]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
    }

    #[test]
    fn layered_tiered_footnotes() {
        // A note on a note becomes its own stacked block at the foot of the page,
        // 5 tiers deep — native-footnote based, so it must converge (no warnings).
        let body = "טקסט#הערה_א[ראשונה #הערה_ב[שנייה #הערה_ג[שלישית \
                    #הערה_ד[רביעית #הערה_ה[חמישית]]]]] המשך#הערה_א[עוד אחת].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(!out.pages_svg.is_empty());
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn layered_tiered_footnote_config() {
        // Per-tier styling: custom slant, indent, gap, and bold tier labels.
        let body = "#הגדרות_הערות(סגנון: (\"normal\", \"italic\", \"normal\"), \
                    הזחה: (0em, 1em, 2em), תוויות: (\"\", \"על הערה: \", \"על תת-הערה: \"))\n\
                    א#הערה_א[פ #הערה_ב[ק #הערה_ג[ר]]] ב#הערה_א[ש].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn regrouped_stacked_bands() {
        // Fully regrouped Gemara-style bands (all tier-1, then all tier-2, …),
        // rendered in the main flow — 5 tiers, must compile AND converge.
        let body =
            "#הגדרות_מדורגות(טורים: (2, 1, 1), מספור: (\"1\", \"א\", \"a\", \"i\", \"1\"))\n\
                    א#מדור_א[ראש #מדור_ב[שני #מדור_ג[שלישי #מדור_ד[רביעי #מדור_ה[חמישי]]]]] \
                    ב#מדור_א[עוד].\n#הערות_מדורגות(כותרת: [הערות])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn per_page_regrouped_bands() {
        // The hard one: fully-regrouped bands (all tier-1, then tier-2, …) at the
        // foot of EACH page, 5 tiers deep, across multiple pages. Read-only footer,
        // so it must converge (no warnings).
        let filler = "מילה ".repeat(400); // push onto a second page
        let body = format!(
            "#הגדרות_מדפים(מספור: (\"1\", \"א\", \"a\", \"i\", \"1\"))\n\
             ראש#מדף_א[פתיחה #מדף_ב[שנייה #מדף_ג[שלישית #מדף_ד[רביעית #מדף_ה[חמישית]]]]] \
             {filler} \
             אמצע#מדף_א[עוד הערה #מדף_ב[ועוד תת-הערה]] {filler} סוף#מדף_א[אחרונה].",
            filler = filler
        );
        let out = compile(&body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(out.pages_svg.len() >= 2, "expected multiple pages");
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn footnote_streams() {
        // Multiple independent per-page footnote streams, side by side, each with
        // its own numbering. Read-only footer ⇒ must converge.
        let body = "#הגדרות_זרמים(פריסה: \"צד\", זרמים: (\"תוכן\", \"מקורות\"), \
                    מספור: (\"מקורות\": \"א\"), כותרות: (\"תוכן\": [ביאורים], \"מקורות\": [מקורות]))\n\
                    טקסט#הערת_תוכן[ביאור ראשון] ועוד#הערת_מקור[רמב\"ם] וגם\
                    #הערת_תוכן[ביאור שני]#הערת_מקור[שו\"ע].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        let converged = !out
            .diagnostics
            .iter()
            .any(|d| d.message.contains("converge"));
        assert!(converged, "did not converge: {:?}", out.diagnostics);
    }

    #[test]
    fn endnotes_streams_and_cross_nesting() {
        // regular footnote, endnote-with-footnote-inside, footnote-with-endnote-
        // inside, and a second named stream — all rendered.
        let body = "א#הערה[ב] ג#הערתסיום[ד#הערה[ה]] ו#הערה[ז#הערתסיום[ח]] \
                    ט#הערתסיום(זרם: \"מקורות\")[י]\n\
                    #הערות_בסוף(כותרת: [הערות])\n#הערות_בסוף(זרם: \"מקורות\", כותרת: [מקורות])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn endnote_streams_side_by_side() {
        // Three endnote streams rendered side by side, each its own column+title.
        let body = "א#הערתסיום(זרם: \"א\")[ראשון] ב#הערתסיום(זרם: \"ב\")[שני] \
                    ג#הערתסיום(זרם: \"ג\")[שלישי]\n\
                    #הערות_בסוף_צד(זרמים: (\"א\", \"ב\", \"ג\"), \
                    כותרות: (\"א\": [ביאורים], \"ב\": [מקורות], \"ג\": [הוספות]))";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn side_column_notes() {
        let body = "#עם_הערות_צד[טקסט#הערת_גיליון[הערה א] ועוד#הערת_גיליון[הערה ב] סוף.]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn configurable_headings_lists_tables() {
        let body = "#הגדרות_כותרות(גודל: (2em, 1.4em), צבע: (rgb(\"#b91c1c\"), luma(40)), \
                    יישור: (center, right), מספור: \"1.1\", קו: (true, false))\n\
                    #הגדרות_רשימות(סמן: ([◆], [–]), הזחה: 1.5em, הידוק: true)\n\
                    #הגדרות_טבלאות(פסים: true, צבע_פס: luma(240), מרווח: 10pt, קו: 1pt + luma(80))\n\
                    #כותרת1[פרק] #כותרת2[סעיף]\n#רשימה(פריט[א], פריט[ב])\n\
                    #טבלה(עמודות: 2, תא[1], תא[2], תא[3], תא[4])";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn per_stream_columns() {
        // A stream with 2 columns next to a 1-column stream — independent counts.
        let body = "#הגדרות_זרמים(טורים: (\"מקורות\": 2))\n\
                    א#הערת_מקור[ראשון] ב#הערת_מקור[שני] ג#הערת_מקור[שלישי] \
                    ד#הערת_תוכן[ביאור].";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn toc_number_suppression() {
        // Headers keep a stepping counter, but the TOC must be able to hide the
        // numbers: auto (default, follows heading config = none), explicit false,
        // and explicit true all compile.
        let body = "#כותרת1[פרק]\n#כותרת2[סעיף]\n\
                    #תוכן()\n#תוכן(מספור: false)\n#תוכן(מספור: true)";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn review_marks_in_every_view() {
        // Tracked changes and an editorial comment, in all three review views.
        for view in ["סימון", "סופי", "מקורי"] {
            let body = format!(
                "#הגדרות_סקירה(תצוגה: \"{view}\")\n\
                 כתב #הוספה[מוסיף] ו#מחיקה[מוחק]#הערת_עורך(מאת: \"עורך\")[לבדוק] סוף."
            );
            let out = compile(&body, &DocConfig::default());
            assert!(out.ok(), "{view}: {:?}", out.diagnostics);
        }
    }

    #[test]
    fn review_comment_inside_side_column() {
        // A comment inside a side-column section lands in the column rather than
        // falling back to a footnote.
        let body = "#עם_הערות_צד[טקסט#הערת_עורך[לשקול שוב] ועוד#הערת_עורך[ומכאן].]";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn section_page_setup() {
        // Two sections with their own page setup, around ordinary text.
        let body = "רגיל\n#מקטע_עמוד(טורים: 2, כותרת_עליונה: \"נספח\", מספור: \"i\")[\
                    טקסט בשני טורים.]\n\
                    #מקטע_עמוד(לרוחב: true, מסגרת: true, סימן_מים: \"טיוטה\", שוליים: 1.5cm)[\
                    דף לרוחב עם מסגרת.]\nהמשך רגיל.";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
        assert!(
            out.pages_svg.len() >= 3,
            "each section should own its pages"
        );
    }

    #[test]
    fn math_formulas() {
        let body = "בשורה #נוסחה_בשורה(\"a^2 + b^2 = c^2\") וגם מוצגת:\n\
                    #נוסחה(\"sum_(i=1)^n i = (n(n+1))/2\", ממוספרת: true)";
        let out = compile(body, &DocConfig::default());
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    #[test]
    fn hebrew_numbering_and_header_footer() {
        let cfg = DocConfig {
            hebrew_numbering: true,
            header: "קונטרס".to_string(),
            footer: "בס\"ד".to_string(),
            paper: "us-letter".to_string(),
            ..DocConfig::default()
        };
        let out = compile("#כותרת1[פרק]\n#ממוספרת(פריט[א], פריט[ב])\n#תוכן()", &cfg);
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }

    /// A page range as the numbers it names, for readable assertions.
    fn ranges(spec: &str) -> Vec<(Option<usize>, Option<usize>)> {
        parse_page_spec(spec)
            .ranges
            .into_iter()
            .map(|r| (r.start().map(|n| n.get()), r.end().map(|n| n.get())))
            .collect()
    }

    /// The tokens a spec refused, for readable assertions.
    fn offcuts(spec: &str) -> Vec<String> {
        parse_page_spec(spec).bad
    }

    #[test]
    fn page_ranges_parse_the_shapes_people_type() {
        assert_eq!(ranges("3"), vec![(Some(3), Some(3))]);
        assert_eq!(ranges("1,3"), vec![(Some(1), Some(1)), (Some(3), Some(3))]);
        assert_eq!(ranges("5-9"), vec![(Some(5), Some(9))]);
        // An open end on either side is legitimate, which is the whole reason the
        // bounds are optional rather than defaulted to 1 and the page count.
        assert_eq!(ranges("5-"), vec![(Some(5), None)]);
        assert_eq!(ranges("-9"), vec![(None, Some(9))]);
        // Spaces are a keystroke, not an intention.
        assert_eq!(
            ranges(" 2 , 4 - 6 "),
            vec![(Some(2), Some(2)), (Some(4), Some(6))]
        );
    }

    #[test]
    fn a_malformed_page_range_costs_only_itself() {
        // Dropping the bad part and exporting the rest beats refusing to produce
        // any PDF at all over a typo in one field.
        assert_eq!(
            ranges("2,oops,4"),
            vec![(Some(2), Some(2)), (Some(4), Some(4))]
        );
        // A bare dash names nothing. Read as "every page" it would silently
        // swallow whatever else the writer asked for.
        assert_eq!(ranges("-"), vec![]);
        assert_eq!(ranges(""), vec![]);
        // Page zero does not exist; NonZeroUsize is what says so.
        assert_eq!(ranges("0"), vec![]);
    }

    /// #59: the tokens the parser could not read, named.
    ///
    /// This is the half of the fix the other tests cannot see. `ranges("0")` is
    /// `[]` **both** before the fix and after it — what changed is that `[]` now
    /// means "every token was refused, and here they are" instead of "no
    /// restriction, export everything". The end-to-end proof of that is in
    /// `tests/binding.rs`, which measures exported bytes; this is the grammar
    /// that decides it, and it is the same grammar `app/src/pagerange.ts`
    /// implements.
    #[test]
    fn a_page_range_that_names_no_page_is_refused_by_name() {
        // The four that used to fail silently.
        assert_eq!(offcuts("0"), vec!["0"], "page zero was not named");
        assert_eq!(offcuts("0-5"), vec!["0-5"], "`0-5` was not named");
        assert_eq!(offcuts("9-2"), vec!["9-2"], "a backwards range was not named");
        assert_eq!(offcuts("-"), vec!["-"], "a bare dash was not named");
        assert_eq!(offcuts("x"), vec!["x"], "garbage was not named");
        // A clean spec names nothing.
        assert_eq!(offcuts("1-4"), Vec::<String>::new());
        // And the good tokens in a partly-bad spec still come through — this is
        // the "costs only itself" rule, with the offcuts now visible.
        assert_eq!(offcuts("1,x,5"), vec!["x"]);
        assert_eq!(
            ranges("1,x,5"),
            vec![(Some(1), Some(1)), (Some(5), Some(5))]
        );
        // A spec naming page zero alongside a real one keeps the real one.
        assert_eq!(ranges("0,3"), vec![(Some(3), Some(3))]);
        assert_eq!(offcuts("0,3"), vec!["0"]);
    }

    /// #59: an all-refused spec is **not** an export of everything.
    ///
    /// This is the assertion that does not exist anywhere else and the one that
    /// was the bug. `pdf_options` used to read "no ranges" as "no restriction",
    /// so `0` exported the whole sefer. The distinction now lives here:
    ///
    /// | spec | `restricted` | `ranges` | export |
    /// |---|---|---|---|
    /// | `""` | false | — | every page — **correct**, the writer asked for that |
    /// | `"0"` | true | — | **refused** |
    /// | `"1,x"` | true | one | page 1, and `x` named |
    #[test]
    fn an_all_refused_page_range_is_refused_rather_than_every_page() {
        let named = |s: &str| -> usize {
            s.trim().is_empty()
                .then_some(0)
                .unwrap_or_else(|| parse_page_spec(s).ranges.len())
        };
        assert_eq!(named(""), 0, "an empty box is not a restriction at all");
        assert_eq!(named("0"), 0, "`0` produced no ranges");
        assert_eq!(named("x"), 0, "`x` produced no ranges");
        assert_eq!(named("9-2"), 0, "`9-2` produced no ranges");
        assert_eq!(named("1"), 1);
        // And the export decision itself, which is the thing that was wrong.
        assert!(
            page_ranges_for_export(&parse_page_spec("")).unwrap().is_none(),
            "an empty spec is every page"
        );
        assert!(
            page_ranges_for_export(&parse_page_spec("0")).is_err(),
            "an all-refused spec must not export everything"
        );
        // The error names the offending token, because that is what the writer
        // has to fix.
        let err = page_ranges_for_export(&parse_page_spec("0")).unwrap_err();
        assert!(err.contains("\"0\""), "the token was not named: {err}");
        // …and a partly-good spec still exports what it named.
        let ok = page_ranges_for_export(&parse_page_spec("1,x")).unwrap();
        assert_eq!(ok.map(|r| r.len()), Some(1));
    }

    #[test]
    fn head_alignment_is_read_in_either_language() {
        assert_eq!(sanitize_head_align("חוץ"), "outside");
        assert_eq!(sanitize_head_align("outside"), "outside");
        assert_eq!(sanitize_head_align("פנים"), "inside");
        assert_eq!(sanitize_head_align("inner"), "inside");
        // Anything unrecognised centres rather than reaching the prelude, where it
        // would pick a branch nobody asked for.
        assert_eq!(sanitize_head_align("sideways"), "center");
        assert_eq!(sanitize_head_align(""), "center");
    }

    #[test]
    fn a_keyword_list_of_one_is_still_an_array() {
        // `("a")` is a parenthesised string in Typst, not an array, and
        // `keywords:` rejects it — so the trailing comma is load-bearing.
        assert_eq!(typst_str_array(&["דקדוק".to_string()]), "(\"דקדוק\",)");
        assert_eq!(typst_str_array(&[]), "()");
    }

    #[test]
    fn a_two_sided_document_still_carries_every_setting_it_was_given() {
        // Cheap end-to-end guard on the wrapper's argument list: eighteen new
        // named arguments went into one `format!`, and a typo in any of them is
        // an "unknown argument" that fails the whole document.
        let cfg = DocConfig {
            two_sided: true,
            margin_inner_cm: Some(3.5),
            margin_outer_cm: Some(1.5),
            margin_top_cm: Some(2.0),
            gutter_cm: 0.5,
            header_odd: "פרק א".to_string(),
            footer_even: "ה'תשפ\"ו".to_string(),
            head_align: "outside".to_string(),
            title: "ספר".to_string(),
            author: "המחבר".to_string(),
            keywords: vec!["הלכה".to_string()],
            ..DocConfig::default()
        };
        let out = compile("שלום עולם", &cfg);
        assert!(out.ok(), "diagnostics: {:?}", out.diagnostics);
    }
}

#[cfg(test)]
mod line_height_tests {
    use super::*;

    /// The fence on the percent-of-sheet claim: the Rust scanner and the
    /// Typst slot must resolve a `שורות` height to the same centimetres.
    /// `_ap_fixed_height` falls back to `par.leading + text.size` — 21pt at
    /// the shipped defaults — so three lines are 63pt, not some other number.
    #[test]
    fn a_lines_height_resolves_like_the_drawn_slot() {
        let got = length_cm("שורות(3)", Some(29.7)).expect("שורות resolves");
        let want = 3.0 * 21.0 * 2.54 / 72.0;
        assert!((got - want).abs() < 1e-9, "{got} against {want}");
        let english = length_cm("lines(2)", None).expect("lines resolves without a sheet");
        assert!(
            (english - 2.0 * DEFAULT_LINE_CM).abs() < 1e-9,
            "a count of lines needs no sheet: {english}"
        );
        // …and the scan of a document declaring one reserves it, rather than
        // falling back to the flat default that under-reserved the sitting's
        // sefer into 116 near-blank leaves.
        let body = "#הגדרות_מדפים(גבהים: (שורות(2),))\n#מדף_א[גוף] טקסט.";
        let reserve = auto_notes_region_cm(body);
        assert!(
            reserve >= 2.0 * DEFAULT_LINE_CM,
            "a שורות-declared band reserved {reserve}cm - under its own height"
        );
    }
}

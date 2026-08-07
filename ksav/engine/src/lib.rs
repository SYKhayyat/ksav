//! Ksav engine — compiles Hebrew "Ksav" markup into real Typst output.
//!
//! The Hebrew commands are *actual Typst functions* defined in `typst/ksav.typ`.
//! We prepend that prelude to the user's document, inject a `#show: מסמך.with(...)`
//! wrapper driven by the editor settings, then run the genuine Typst compiler to
//! produce a PDF and per-page SVG previews.

use assets::Assets;
use diagnostics::Located;
use typst::diag::Warned;
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;

pub mod assets;
pub mod commands;
pub mod diagnostics;
/// A sefer is many files: `#כלול` and the line map that keeps its
/// diagnostics meaningful.
pub mod include;
/// Both directions between a place in the source and a place on the page.
pub mod jump;
/// What the engine embeds and the notice each embedding owes — one table, tied
/// to the `include_bytes!` lines below and to `THIRD-PARTY-NOTICES.md`.
pub mod notices;
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
#[derive(Debug, Clone)]
pub struct DocConfig {
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
    pub justify: bool,
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
const PAGE_APPARATUS_COMMANDS: &[&str] = &[
    "מדף_",
    "pageband",
    "הערה_זרם",
    "stream_note",
    "הערת_תוכן",
    "contentnote",
    "הערת_מקור",
    "sourcenote_stream",
];

/// How much page-foot region a body needs, in cm.
///
/// The per-page apparatus lives in the bottom margin, so with nothing reserved it
/// grows straight off the bottom of the sheet — the single most visible defect in
/// that apparatus. Rather than make every writer discover a knob, reserve a
/// workable default as soon as the document uses one of those commands, and
/// nothing at all otherwise (native footnotes expand the text region themselves
/// and must not lose page height to a reserve they never use).
pub fn auto_notes_region_cm(body: &str) -> f64 {
    // Comments first, and this is the eleventh scanner in this repository.
    //
    // `spans.ts` opens with a monument to ten client-side matchers disagreeing
    // about `"`, `\`, `//` and `{}`; that ruling stopped at the wire. This one
    // was a naive `find` with no string or comment tracking, so a **commented-out**
    // `// #מדף_א[…]` — the ordinary way somebody parks an apparatus while they
    // decide about it — reserved 3 cm at the foot of every page in the document.
    // The existing test covered the prose case (`the מדף_ command`) and stopped
    // one case short.
    let visible = code_only(body);
    if PAGE_APPARATUS_COMMANDS
        .iter()
        .any(|c| apparatus_is_called(&visible, c) || apparatus_is_named_as_kind(&visible, c))
    {
        3.0
    } else {
        0.0
    }
}

/// `body` with its comments and string literals blanked out, offsets preserved.
///
/// Blanked rather than removed so that anything reading positions from the
/// result still agrees with the original, and so a comment cannot join the two
/// halves of an identifier it sat between.
///
/// String literals go too: `#כותרת_עליונה("ראה #מדף_א[…]")` is a page header
/// whose *text* mentions an apparatus, not a document that has one. This is the
/// same rule `spans.ts` applies and, deliberately, not the same implementation —
/// a Typst body is not a Ksav editor buffer, and the shared thing worth having
/// is the corpus of documents that must come out the same way, not the code.
fn code_only(body: &str) -> String {
    let mut out = String::with_capacity(body.len());
    let mut chars = body.chars().peekable();
    let mut in_string = false;
    // Blank a character, keeping newlines so line numbers and line starts stay
    // exactly where they were.
    let blank = |c: char| if c == '\n' { '\n' } else { ' ' };
    while let Some(c) = chars.next() {
        if in_string {
            out.push(blank(c));
            if c == '\\' {
                if let Some(n) = chars.next() {
                    out.push(blank(n));
                }
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => {
                in_string = true;
                out.push(' ');
            }
            '/' if chars.peek() == Some(&'/') => {
                out.push(' ');
                for n in chars.by_ref() {
                    out.push(blank(n));
                    if n == '\n' {
                        break;
                    }
                }
            }
            '/' if chars.peek() == Some(&'*') => {
                out.push(' ');
                let mut star = false;
                for n in chars.by_ref() {
                    out.push(blank(n));
                    if star && n == '/' {
                        break;
                    }
                    star = n == '*';
                }
            }
            _ => out.push(c),
        }
    }
    out
}

/// Whether `name` (a command, or the common prefix of a family of them) appears
/// as an actual call, not merely as text.
///
/// A bare `body.contains(name)` reserved 3 cm at the foot of every page for any
/// document that so much as mentioned `מדף_` in prose. The names here are prefixes
/// — `מדף_` covers `מדף_א`, `מדף_בדרגה`, … — so this consumes the rest of the
/// identifier after the prefix and then requires the argument bracket that makes
/// it a call: `#מדף_א[…]`, `הערה_זרם(…)`. Prose ("the מדף_ command") has a space
/// or punctuation there, not a bracket, so it no longer triggers the reserve.
fn apparatus_is_called(body: &str, name: &str) -> bool {
    let mut base = 0;
    while let Some(i) = body[base..].find(name) {
        let start = base + i;
        let rest = &body[start + name.len()..];
        // Skip the rest of the identifier (Hebrew letters are alphabetic, so
        // `is_alphanumeric` covers them), then look at the first character after.
        let after_ident = rest
            .char_indices()
            .find(|(_, ch)| !(ch.is_alphanumeric() || *ch == '_'))
            .map(|(idx, _)| idx)
            .unwrap_or(rest.len());
        if matches!(rest[after_ident..].chars().next(), Some('(') | Some('[')) {
            return true;
        }
        base = start + name.len();
    }
    false
}

/// Whether `name` is handed to the deferred-note wrapper as its layout.
///
/// `#הערה_בשם("א", סוג: מדף_בדרגה, 1)` puts a genuine page-foot apparatus on the
/// page, but names the command as a *value* — there is no bracket after it, so
/// `apparatus_is_called` cannot see it and the page would lose the 3 cm reserve
/// while carrying the very apparatus that needs it. That failure is invisible in
/// a compile check and reads on the page as notes running off the bottom edge.
fn apparatus_is_named_as_kind(body: &str, name: &str) -> bool {
    for key in ["סוג:", "kind:"] {
        let mut base = 0;
        while let Some(i) = body[base..].find(key) {
            let after = base + i + key.len();
            if body[after..].trim_start().starts_with(name) {
                return true;
            }
            base = after;
        }
    }
    false
}

impl Default for DocConfig {
    fn default() -> Self {
        DocConfig {
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
            dir: "rtl".to_string(),
            lang: String::new(),
            numbering: true,
            justify: true,
            line_spacing_em: 0.75,
            para_spacing_em: 1.2,
            first_line_indent_em: 0.0,
            columns: 1,
            paper: "a4".to_string(),
            hebrew_numbering: false,
            header: String::new(),
            footer: String::new(),
            notes_region_cm: None,
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
fn clamped(v: &serde_json::Value, key: &str, lo: f64, hi: f64) -> Option<f64> {
    let n = v.get(key)?.as_f64()?;
    if !n.is_finite() {
        return None;
    }
    Some(n.clamp(lo, hi))
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
        if let Some(s) = clamped(v, "size_pt", 1.0, 400.0) {
            cfg.size_pt = s;
        }
        // Margins must leave a text region: half of the short side of A5.
        if let Some(m) = clamped(v, "margin_cm", 0.0, 7.0) {
            cfg.margin_cm = m;
        }
        if let Some(d) = v.get("dir").and_then(|x| x.as_str()) {
            cfg.dir = d.to_string();
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
        if let Some(l) = clamped(v, "line_spacing_em", 0.0, 10.0) {
            cfg.line_spacing_em = l;
        }
        if let Some(p) = clamped(v, "para_spacing_em", 0.0, 20.0) {
            cfg.para_spacing_em = p;
        }
        if let Some(fi) = clamped(v, "first_line_indent_em", 0.0, 20.0) {
            cfg.first_line_indent_em = fi;
        }
        // More columns than this on any real paper is a column of single
        // letters; the layout succeeds and the document is unreadable.
        if let Some(c) = clamped(v, "columns", 1.0, 12.0) {
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
        if let Some(n) = clamped(v, "notes_region_cm", 0.0, 20.0) {
            cfg.notes_region_cm = Some(n);
        }
        // Per-edge margins are clamped on the same range as the uniform one, and
        // stay `None` when absent — an absent edge means "use margin_cm", which
        // is not the same as an edge explicitly set to zero.
        for (key, slot) in [
            ("margin_top_cm", &mut cfg.margin_top_cm),
            ("margin_bottom_cm", &mut cfg.margin_bottom_cm),
            ("margin_inner_cm", &mut cfg.margin_inner_cm),
            ("margin_outer_cm", &mut cfg.margin_outer_cm),
        ] {
            if let Some(m) = clamped(v, key, 0.0, 7.0) {
                *slot = Some(m);
            }
        }
        if let Some(g) = clamped(v, "gutter_cm", 0.0, 5.0) {
            cfg.gutter_cm = g;
        }
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
        }
        if let Some(o) = v.get("prevent_orphans").and_then(|x| x.as_bool()) {
            cfg.prevent_orphans = o;
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
pub fn sanitize_head_align(a: &str) -> String {
    match a.trim() {
        "outside" | "outer" | "חוץ" | "חיצוני" => "outside",
        "inside" | "inner" | "פנים" | "פנימי" => "inside",
        _ => "center",
    }
    .to_string()
}

/// Parse `1,3,5-9` into Typst page ranges, one-indexed and inclusive.
///
/// `5-` means "from 5 to the end" and `-9` means "up to 9", which is what makes
/// `None` a legitimate bound rather than an error. Anything unparseable is
/// dropped rather than refused: an export that silently omits a malformed range
/// still produces the pages the writer *did* name, where refusing produces no
/// PDF at all over a typo in one field.
fn parse_page_ranges(spec: &str) -> Vec<std::ops::RangeInclusive<Option<std::num::NonZeroUsize>>> {
    let num = |s: &str| {
        s.trim()
            .parse::<usize>()
            .ok()
            .and_then(std::num::NonZeroUsize::new)
    };
    spec.split(',')
        .filter_map(|part| {
            let part = part.trim();
            if part.is_empty() {
                return None;
            }
            match part.split_once('-') {
                None => num(part).map(|n| Some(n)..=Some(n)),
                Some((lo, hi)) => {
                    let (lo, hi) = (num(lo), num(hi));
                    // `-` on its own names nothing; without this it would parse
                    // as "every page", quietly ignoring the rest of the spec.
                    if lo.is_none() && hi.is_none() {
                        None
                    } else {
                        Some(lo..=hi)
                    }
                }
            }
        })
        .collect()
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
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
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

pub fn assemble_source(body: &str, cfg: &DocConfig) -> String {
    let dir = if cfg.dir == "ltr" { "ltr" } else { "rtl" };
    let columns = cfg.columns.max(1);
    format!(
        // The sefer catalogue goes *before* the prelude, because the prelude's
        // index functions close over it: a Typst closure captures the scope it
        // was defined in, so a table defined after them is a table they cannot
        // see. `body_offset` is derived by assembling an empty body rather than
        // counted by hand, so the extra lines shift the diagnostics' idea of
        // where the writer's text starts without anyone having to remember to.
        "{table}\n{prelude}\n\
         #show: מסמך.with(\
         גופן: {font}, גודל: {size}pt, שוליים: {margin}cm, כיוון: {dir}, שפה: {lang}, \
         מספור: {numbering}, מספור_עברי: {hebrew_num}, נייר: {paper}, \
         כותרת_עליונה: {header}, כותרת_תחתונה: {footer}, \
         שוליים_עליון: {m_top}, שוליים_תחתון: {m_bot}, \
         שוליים_פנימי: {m_in}, שוליים_חיצוני: {m_out}, \
         שולי_כריכה: {gutter}cm, דו_צדדי: {two_sided}, \
         כותרת_זוגי: {head_even}, כותרת_אי_זוגי: {head_odd}, \
         תחתונה_זוגי: {foot_even}, תחתונה_אי_זוגי: {foot_odd}, \
         יישור_כותרת: {head_align}, \
         כותרת_מסמך: {title}, מחבר: {author}, מילות_מפתח: {keywords}, \
         מניעת_יתומים: {orphans}, \
         יישור: {justify}, ריווח_שורות: {leading}em, ריווח_פסקאות: {para}em, \
         הזחה_ראשונה: {indent}em, טורים: {columns}, אזור_הערות: {region})\n\n\
         {body}\n",
        table = sefarim::typst_table(),
        prelude = PRELUDE,
        font = typst_str(&cfg.font),
        size = cfg.size_pt,
        margin = cfg.margin_cm,
        m_top = typst_cm_or_none(cfg.margin_top_cm),
        m_bot = typst_cm_or_none(cfg.margin_bottom_cm),
        m_in = typst_cm_or_none(cfg.margin_inner_cm),
        m_out = typst_cm_or_none(cfg.margin_outer_cm),
        gutter = cfg.gutter_cm,
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
        justify = if cfg.justify { "true" } else { "false" },
        leading = cfg.line_spacing_em,
        para = cfg.para_spacing_em,
        indent = cfg.first_line_indent_em,
        columns = columns,
        region = match cfg
            .notes_region_cm
            .unwrap_or_else(|| auto_notes_region_cm(body))
        {
            r if r <= 0.0 => "none".to_string(),
            r => format!("{r}cm"),
        },
        body = body,
    )
}

/// The compiler, configured for one assembled source and the request's assets.
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
    let mut fonts: Vec<&[u8]> = vec![
        FONT_FRANK_REG,
        FONT_FRANK_BOLD,
        FONT_DAVID_REG,
        FONT_DAVID_BOLD,
        FONT_CASCADIA,
        FONT_NEWCM_MATH,
    ];
    fonts.extend(assets.fonts.iter().map(|f| f.bytes.as_slice()));
    let files: Vec<(&str, &[u8])> = assets
        .files
        .iter()
        .map(|a| (a.name.as_str(), a.bytes.as_slice()))
        .collect();
    let mut builder = TypstEngine::builder()
        .main_file(source)
        .fonts(fonts)
        .with_static_file_resolver(files);
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

/// Lay out an assembled source, with the request's assets available to it.
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

/// `compile_doc`, with the request's images and fonts available to the document.
pub fn compile_doc_with(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
) -> Result<PagedDocument, Vec<Diagnostic>> {
    let text = assemble_source(body, cfg);
    let Warned { output, warnings } = layout_source(text.clone(), assets);
    match output {
        Ok(doc) => Ok(doc),
        Err(err) => {
            // The same text Typst just parsed, parsed again here so spans can be
            // turned into lines — but only now that there is a diagnostic to
            // locate. See `compile_parts` for why this is not done up front.
            let located = Located::of(&text, body);
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
    compile_parts(body, cfg, assets, true, true, &Default::default())
}

/// Compile, optionally skipping the PDF and the assembled source.
///
/// The live preview consumes the SVGs and nothing else, yet a PDF was rendered
/// and base64-encoded into every response — around 300 KB per keystroke-driven
/// compile of a 16-page document, none of it ever read. `want_pdf` is off for
/// previews and on for export and print, which is the only place the bytes are
/// actually wanted.
///
/// `want_source` is the same argument about the same mistake, found later in the
/// same response: the assembled Typst source is the 75 KB prelude plus the
/// document, it was returned unconditionally, and the only caller that reads it
/// ("export .typ") runs its own compile to get it. On a one-page document that
/// was 75 KB of an 84 KB response.
///
/// Neither flag changes what is compiled — both are about what is *carried back*.
pub fn compile_parts(
    body: &str,
    cfg: &DocConfig,
    assets: &Assets,
    want_pdf: bool,
    want_source: bool,
    // Fingerprints of pages the caller is already holding. A page whose
    // fingerprint is in here is **never serialised** — see `pages_hash` on
    // `Compiled`. Pass an empty set to get every page.
    have: &std::collections::HashSet<String>,
) -> Compiled {
    let source = assemble_source(body, cfg);
    // The clone is for Typst, which takes the source by value. `source` itself
    // stays here so that it can be handed back as `typst_source` — by move, not
    // by a second copy — and so `Located` has something to parse if it is needed.
    let Warned { output, warnings } = layout_source(source.clone(), assets);

    // Locating a diagnostic means parsing the assembled source a second time, and
    // `Source::detached` copies it to do so. That was done on every compile
    // whether or not anything had gone wrong: 4.2 ms of a 14.4 ms one-page
    // compile, spent parsing 83 KB of prelude to resolve spans that a clean
    // document does not have. A document with no warnings and no errors now pays
    // none of it.
    let locate = |diags: &[_], severity: &str| {
        if diags.is_empty() {
            Vec::new()
        } else {
            Located::of(&source, body).all(diags, severity)
        }
    };

    match output {
        Ok(doc) => {
            let mut diagnostics = locate(&warnings, "warning");
            // Whatever the export has to say, say it. These used to go into
            // `.ok()` and vanish, so a PDF that failed to export came back as
            // `ok: true` with no bytes and no explanation. It mattered little
            // while every export was a plain PDF; the moment a writer asks for
            // PDF/A it matters a great deal, because the standards refuse
            // documents for real, nameable reasons — an unembeddable font, a
            // missing title — that they are entitled to be told about.
            let pdf = if want_pdf {
                let (bytes, notes) = pdf_bytes(&doc, cfg);
                diagnostics.extend(notes);
                bytes
            } else {
                None
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
                typst_source: if want_source { source } else { String::new() },
            }
        }
        Err(err) => {
            // Something went wrong, so the second parse is worth its cost here.
            let located = Located::of(&source, body);
            let mut diagnostics = located.all(&warnings, "warning");
            use typst_as_lib::TypstAsLibError::*;
            match err {
                TypstSource(diags) => diagnostics.extend(located.all(&diags, "error")),
                other => diagnostics.push(Diagnostic::ours("error", other.to_string())),
            }
            drop(located);
            Compiled {
                ok: false,
                pdf: None,
                pages_svg: Vec::new(),
                pages_hash: Vec::new(),
                diagnostics,
                typst_source: if want_source { source } else { String::new() },
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
    let ranges = parse_page_ranges(&cfg.pdf_pages);
    if !ranges.is_empty() {
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
    let expanded = include::expand(body, &parts);
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
    let (assets, missing_assets) = Assets::from_request(&v);

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
    let want_pdf = v.get("want_pdf").and_then(|x| x.as_bool()).unwrap_or(false);
    let want_source = v
        .get("want_source")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
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
    let mut result = compile_parts(body, &cfg, &assets, want_pdf, want_source, &have);
    // Back into each chapter's own coordinates, and say out loud what the
    // expansion could not do — a name nothing answers to, a loop.
    include::relabel(&expanded, &mut result.diagnostics);
    for problem in &expanded.problems {
        result
            .diagnostics
            .push(Diagnostic::ours("error", problem.clone()));
    }

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
    let source = assemble_source(body, cfg);
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

    fn cfg_from(json: serde_json::Value) -> DocConfig {
        DocConfig::from_json(&json)
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

    /// A commented-out apparatus is not an apparatus.
    ///
    /// The case the test above stopped one short of. Parking a band while you
    /// decide about it — `// #מדף_א[…]`, which is what the editor's own
    /// "comment out" command writes — reserved 3 cm at the foot of **every page
    /// in the document**, and the writer's only symptom is that their text block
    /// got shorter for no reason they can see.
    #[test]
    fn a_commented_out_apparatus_reserves_nothing() {
        assert_eq!(auto_notes_region_cm("שלום
// #מדף_א[הערה]
עולם"), 0.0);
        assert_eq!(auto_notes_region_cm("שלום /* #מדף_א[הערה] */ עולם"), 0.0);
        assert_eq!(
            auto_notes_region_cm("שלום
// אולי #הערה_זרם(זרם: \"א\")[טקסט]
עולם"),
            0.0
        );
        // And a string is text, not a call: a running head that *mentions* an
        // apparatus is a header, not a document that has one.
        assert_eq!(auto_notes_region_cm("#כותרת_עליונה(\"ראה #מדף_א[שם]\")"), 0.0);
        // The apparatus still counts when it is real and a comment is merely
        // nearby — the fix must not blank the wrong half of the line.
        assert_eq!(auto_notes_region_cm("// הערה
#מדף_א[הערה]"), 3.0);
        assert_eq!(auto_notes_region_cm("#מדף_א[הערה] // הערה"), 3.0);
    }

    /// Blanking preserves offsets and never joins two identifiers.
    #[test]
    fn blanking_a_comment_keeps_the_document_the_same_length() {
        for doc in [
            "אלף // בית
גימל",
            "אלף /* בית */ גימל",
            "אלף \"בית\" גימל",
            "#מדף_א[א] // #מדף_ב[ב]",
        ] {
            assert_eq!(code_only(doc).chars().count(), doc.chars().count(), "{doc:?}");
        }
        // A comment between two halves of a name must not let them meet.
        assert!(!code_only("מד/* x */ף_א[הערה]").contains("מדף_א"));
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

        // The aliases: `#let X(..) = Y(..)` or `#let X = Y`, to a fixpoint.
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
                let target: String = rhs
                    .trim_start()
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

    #[test]
    fn the_page_foot_reserve_list_matches_the_prelude() {
        let family = footer_note_commands();

        // Direction 1: nothing the prelude renders into the footer is missing.
        // A missing one means a document using it keeps its full text height and
        // the apparatus runs off the bottom of the sheet.
        for cmd in &family {
            assert!(
                PAGE_APPARATUS_COMMANDS.iter().any(|p| cmd.starts_with(p)),
                "`{cmd}` renders into the page footer and no prefix in \
                 PAGE_APPARATUS_COMMANDS covers it, so a document using it \
                 reserves no room for its own apparatus.\n\
                 The footer-rendered family, read out of ksav.typ: {family:?}"
            );
        }

        // Direction 2: nothing in the list names something that no longer exists.
        // A dead prefix is worse than useless — it reads as coverage.
        for p in PAGE_APPARATUS_COMMANDS {
            assert!(
                family.iter().any(|c| c.starts_with(p)),
                "PAGE_APPARATUS_COMMANDS lists {p:?}, which names no \
                 footer-rendered command in ksav.typ.\n\
                 The footer-rendered family, read out of ksav.typ: {family:?}"
            );
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
            false,
            false,
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
                false,
                false,
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
        let first = compile_parts("שלום", &cfg, &Assets::default(), false, false, &Default::default());
        assert!(!first.pages_svg[0].is_empty(), "the first ask must send the page");

        let have: std::collections::HashSet<String> = first.pages_hash.iter().cloned().collect();
        let again = compile_parts("שלום", &cfg, &Assets::default(), false, false, &have);
        assert_eq!(again.pages_hash, first.pages_hash, "the fingerprint moved");
        assert!(
            again.pages_svg[0].is_empty(),
            "a page the caller already holds was serialised anyway"
        );
    }

    #[test]
    fn every_registered_command_is_defined() {
        // Each command's Hebrew name and English alias must have a matching `#let`
        // in the prelude — otherwise the palette would insert an undefined call.
        let defined = |name: &str| {
            PRELUDE.contains(&format!("#let {name}("))
                || PRELUDE.contains(&format!("#let {name} ="))
                || PRELUDE.contains(&format!("#let {name}("))
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
        parse_page_ranges(spec)
            .into_iter()
            .map(|r| (r.start().map(|n| n.get()), r.end().map(|n| n.get())))
            .collect()
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

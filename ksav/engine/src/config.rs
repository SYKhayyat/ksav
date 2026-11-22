//! The document's settings: what the writer chose, and what a request may ask for.
//!
//! # Why this is a module of its own
//!
//! `DocConfig` is the engine's whole input surface — paper, margins, fonts, size,
//! columns, direction, numbering, the note region, the export's page range — plus
//! the refusals it records when a setting arrives outside the range it accepts.
//! It was the last reason `lib.rs` was still a thousand lines (`#222`), and it is
//! the one part of the engine that is *not* about compiling: it is the shape of a
//! writer's choices, and every field's doc comment says which page decision it
//! moves.
//!
//! # Refused rather than clamped, in every direction
//!
//! A setting outside its range is recorded in `refusals` and the writer is told;
//! the value used is the working default. The alternative — a silently clamped
//! number — is a page laid out to something nobody asked for and a slider showing
//! the number that was typed, which is the failure this file's comments were
//! written against. `unit_tests.rs` holds the cases.
//!
//! `Serialize` is not decoration and not for the wire: it is how
//! `DocConfig::default()` reaches the app (`app/tools/emit-engine.mjs` reads it
//! out of `facts.gen.json`), so reflowing the defaults block is safe now and was
//! not always.

use crate::diagnostics::Diagnostic;
use crate::geometry::{paper_cm_of, sheet_cm_of, MIN_TEXT_CM, PAPERS};
use crate::include;

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
pub(crate) fn margin_slot(cfg: &DocConfig, key: &str) -> Option<f64> {
    match key {
        "margin_top_cm" => cfg.margin_top_cm,
        "margin_bottom_cm" => cfg.margin_bottom_cm,
        "margin_inner_cm" => cfg.margin_inner_cm,
        "margin_outer_cm" => cfg.margin_outer_cm,
        _ => None,
    }
}

pub(crate) fn margin_slot_mut<'a>(
    cfg: &'a mut DocConfig,
    key: &str,
) -> Option<&'a mut Option<f64>> {
    match key {
        "margin_top_cm" => Some(&mut cfg.margin_top_cm),
        "margin_bottom_cm" => Some(&mut cfg.margin_bottom_cm),
        "margin_inner_cm" => Some(&mut cfg.margin_inner_cm),
        "margin_outer_cm" => Some(&mut cfg.margin_outer_cm),
        _ => None,
    }
}

pub(crate) fn clamped(
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
pub(crate) fn refusal_diagnostic(r: &Refusal) -> Diagnostic {
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
pub(crate) fn spec_refusals_of(cfg: &DocConfig) -> Vec<SpecRefusal> {
    let mut out = cfg.spec_refusals.clone();
    for token in parse_page_spec(&cfg.pdf_pages).bad {
        if !out.iter().any(|e| e.key == "pdf_pages" && e.asked == token) {
            out.push(page_spec_refusal(cfg, token));
        }
    }
    // A paper name the engine does not have. This used to be invisible: the name
    // was passed to Typst's closed `paper:` enum, which rejects `b5` (the name
    // the product itself published) with a syntax error about `#מסמך` that never
    // mentioned the paper — and the margin bound read a *different* lookup that
    // silently answered A4. Now the name is resolved here, one way, and one it
    // cannot resolve is named as the setting that is wrong (#106).
    if paper_cm_of(&cfg.paper).is_none() && !cfg.paper.trim().is_empty() {
        out.push(SpecRefusal {
            key: "paper".into(),
            asked: cfg.paper.clone(),
            used: format!(
                "the page is A4; the names it knows are {}",
                PAPERS.join(", ")
            ),
        });
    }
    out
}

/// The refusal for one unreadable `pdf_pages` token, saying what was used.
pub(crate) fn page_spec_refusal(cfg: &DocConfig, asked: String) -> SpecRefusal {
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
pub(crate) fn spec_refusal_diagnostic(r: &SpecRefusal) -> Diagnostic {
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
///
/// (A paper note used to sit above this function, having drifted off
/// [`sanitize_paper`] — which is where the Typst-literal safety argument lives.)
pub(crate) fn sanitize_lang(l: &str) -> String {
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

/// The one spelling of a paper name the rest of the engine uses.
///
/// Strips anything that is not a letter, a digit or a dash, lowercases, and then
/// The spellings that mean a sheet this product already has, under another name.
///
/// `(alias, canonical)`. Every pair here exists because some real surface says
/// the left and the engine says the right: `.ksav` files and share links written
/// before #106 say `b5` and `letter`, and Typst's `paper:` — a closed enum that
/// rejects `b5` outright — says `iso-b5` and `us-letter`. One table, so the
/// client's chooser and the engine's sanitiser resolve an old name the same way.
pub const PAPER_ALIASES: &[(&str, &str)] = &[
    // ISO B-series: the product has always called these `b4`/`b5`/`b6`, and
    // Typst spells the identical sheet `iso-b4`/`iso-b5`/`iso-b6`.
    ("b4", "iso-b4"),
    ("b5", "iso-b5"),
    ("b6", "iso-b6"),
    // `letter` is US Letter; there is no other letter in this table, and Typst's
    // own name for it is `us-letter`.
    ("letter", "us-letter"),
];

/// The paper name, canonical, and guaranteed to be one Typst accepts.
///
/// `typst`'s `paper:` is a **closed enum**: a name that is not in it does not
/// fall back to A4, it fails the whole compile with a syntax error about
/// `#מסמך` that never mentions the paper. So an unrecognised name is replaced
/// here by A4 — which is what [`spec_refusals_of`] already says the page is —
/// and the writer is told which setting is wrong by the warning beside it. The
/// alternative is a document that refuses to compile over a misspelling, with a
/// message pointing at the prelude.
pub(crate) fn typst_paper(name: &str) -> String {
    let clean = sanitize_paper(name);
    if paper_cm_of(&clean).is_some() {
        clean
    } else {
        "a4".to_string()
    }
}

/// The one spelling of a paper name the rest of the engine uses.
///
/// Strips anything that is not a letter, a digit, a dash, a space or an
/// underscore, lowercases, joins words with a dash, and then resolves the
/// spellings that mean the same sheet under a different name. This is the alias
/// layer, and it exists because Typst's `paper:` parameter is a **closed enum**
/// — it accepts `iso-b5` and rejects `b5` with a syntax error — while the
/// product's own table, the settings drawer and every `.ksav` file written
/// before this fix say `b5`. A name that means a real sheet but is spelled the
/// old way is translated here, once, rather than at each of the four call sites
/// that used to disagree about whether to sanitise at all (#106).
///
/// It is also the guard that keeps the name safe to place inside a Typst string
/// literal: the result is lowercase ASCII letters, digits and hyphens, so a
/// `paper: "a4\"` cannot close the literal early and fail the whole document
/// with "unclosed delimiter" pointing at the prelude instead of at the setting.
pub(crate) fn sanitize_paper(p: &str) -> String {
    // A space or an underscore between words is a *separator*, not noise: a
    // hand-edited file writing `US Letter` must be US Letter, and stripping the
    // space instead produced `usletter` — a name that matches nothing and would
    // lay the sefer out on A4. Every other strip is the injection guard in the
    // comment above.
    let clean: String = p
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == ' ' || *c == '_')
        .collect::<String>()
        .to_ascii_lowercase()
        .split([' ', '_'])
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    match PAPER_ALIASES.iter().find(|(from, _)| *from == clean) {
        Some((_, to)) => (*to).to_string(),
        None => clean,
    }
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
            cfg.refusals.push(Refusal {
                key: key.to_string(),
                asked,
                used,
            });
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
pub(crate) type PageBound = Option<std::num::NonZeroUsize>;
/// What a `pdf_pages` spec turned out to mean.
#[derive(Debug, Default, Clone, PartialEq)]
pub(crate) struct PageSpec {
    /// The ranges the writer named, in the order they were written. Empty when
    /// every token was refused, which is **not** the same as "no restriction".
    pub(crate) ranges: Vec<std::ops::RangeInclusive<PageBound>>,
    /// The tokens that named no page, exactly as written, so a diagnostic can
    /// quote the writer's own mistake back at them.
    pub(crate) bad: Vec<String>,
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
pub(crate) enum Bound {
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
pub(crate) fn read_bound(s: &str) -> Bound {
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
pub(crate) fn parse_page_spec(spec: &str) -> PageSpec {
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
        let (lo, hi) = (read_bound(&part[..dash]), read_bound(&part[dash + 1..]));
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
pub(crate) fn page_ranges_for_export(
    spec: &PageSpec,
) -> Result<Option<Vec<std::ops::RangeInclusive<PageBound>>>, String> {
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

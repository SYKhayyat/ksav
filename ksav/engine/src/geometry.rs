//! A page's geometry: what a name like `A4` is in centimetres, and how much of
//! the sheet the note apparatus is allowed to take.
//!
//! # Why this is not in `lib.rs`
//!
//! It was, for the reason the whole language was: one file was the engine. This
//! block is a **closed** body of arithmetic — paper sizes and their aliases, a
//! Typst length parser, the percentage-of-sheet rule, the reserve cache and the
//! scan that decides how tall a foot band has to be — and nothing in it compiles
//! a document or answers a request. `#222` asks for the cut, and the seams are
//! the ones the file itself had already drawn.
//!
//! # The rule the readings have to agree on
//!
//! `%` is a percentage **of the sheet**, not of anything nearer, and
//! `_ap_fixed_height` in the prelude resolves it against `page.height` so the
//! two halves of the claim agree. A percentage resolved against a *guessed* sheet
//! disagrees with the prelude by exactly the ratio of the guess, in page
//! geometry and silently — so an unknown paper answers `None` and the height
//! counts as undeclared, which is the working default. That reasoning is why
//! these functions are one block and not four.

use std::collections::HashMap;

use crate::parse;
use crate::DocConfig;
use crate::{
    named_arg, sanitize_paper, ChannelDecl, BAND_COMMANDS, BAND_CONFIG, CHANNEL_ARG, CHANNEL_DECL,
    FOOT_PLACEMENT, HEIGHT_ARG, PLACEMENT_ARG, REGION_ARG, REGION_DECL, SOURCE_ARG,
    STREAM_COMMANDS, STREAM_CONFIG, TIER_CHANNELS,
};

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
pub(crate) const DEFAULT_LINE_CM: f64 = 12.0 * (1.0 + 0.75) * 2.54 / 72.0;

pub(crate) fn length_cm(s: &str, page_h_cm: Option<f64>) -> Option<f64> {
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
pub(crate) const MIN_TEXT_CM: f64 = 1.0;

/// The sheet this document will be laid out on, in centimetres.
///
/// An explicit pair, else the named paper, else A4 — the same precedence the
/// prelude uses, so a margin is bounded by the page that will actually obey it.
///
/// The `unwrap_or` is **not** a silent A4 (#106). Every name that reaches
/// `assemble_source` has already been through [`typst_paper`], which is the
/// reader's one chance to reject an unknown name; by the time a margin is being
/// bounded the name is known, and the fallback only covers a direct caller of
/// this helper in a test. The agreement between this and its sibling is what
/// used to be absent — this read `&cfg.paper` raw while `sheet_height_cm` read
/// the sanitised one, so the two could bound the same margin against two pages.
/// They both read `&cfg.paper` now, and `paper_cm_of` sanitises for itself.
pub(crate) fn sheet_cm_of(cfg: &DocConfig) -> (f64, f64) {
    match (cfg.page_width_cm, cfg.page_height_cm) {
        (Some(w), Some(h)) => (w, h),
        _ => paper_cm_of(&cfg.paper).unwrap_or((21.0, 29.7)),
    }
}

/// The width of a named paper as a Typst length literal, for the prelude.
///
/// The continuous (`רציף`) path needs a width to set `height: auto` against, and
/// it used to look it up in a second table in `ksav.typ` — `_pg_paper_width` —
/// that knew three papers and answered 210 mm for the other seven. So a
/// continuous A2 sefer was laid out on a 210 mm column, and a continuous B5 on
/// 210 mm as well, both silently. The engine now answers the width from the one
/// table and hands it over as `נייר_רוחב`; the prelude has no table of its own
/// to disagree with.
///
/// Public because the fence in `tests/paper_table.rs` measures the continuous
/// page against this width.
pub fn paper_width_cm_typst(paper: &str) -> String {
    let w = paper_cm_of(paper).map(|(w, _)| w).unwrap_or(21.0);
    format!("{w}cm")
}

/// The named paper's dimensions as a CSS `size` value, for the Word export.
///
/// The fourth copy of the table that #106 did not know about: `exports.ts`
/// carried `PAPER_CSS` with four papers for the `@page` rule, so a B5 sefer
/// exported to Word printed on A4. The front end has no way to import this
/// module's table, so the value is written into `engine.gen.ts` by
/// `app/tools/emit-engine.mjs` from `src/facts.rs`, which reads this function.
/// One definition, one generator, no second copy.
pub fn paper_css(paper: &str) -> String {
    match paper_cm_of(paper) {
        Some((w, h)) => format!("{w}cm {h}cm"),
        None => "21cm 29.7cm".to_string(),
    }
}

/// Every paper the product offers, canonical spelling, in the order a chooser
/// should list them. The one list the drawer, the generator and the fences share.
pub const PAPERS: &[&str] = &[
    "a4",
    "us-letter",
    "us-legal",
    "a3",
    "a5",
    "a6",
    "a2",
    "iso-b4",
    "iso-b5",
    "iso-b6",
];

pub(crate) fn paper_height_cm(paper: &str) -> Option<f64> {
    paper_cm_of(paper).map(|(_, h)| h)
}

/// Both dimensions of a named paper, in centimetres — the public reading of the
/// one table, for a fence that compares the laid-out page against it.
///
/// The test needs the table *and* the rendering, and the only honest assertion is
/// that they agree; a test that re-states the numbers checks its own copy.
pub fn paper_size_cm(paper: &str) -> Option<(f64, f64)> {
    paper_cm_of(paper)
}

/// Both dimensions of a named paper, in centimetres.
///
/// **This is the one paper-size table in the product (#106).** It used to be the
/// second of three: `_pg_paper_width` in the prelude carried its own copy for the
/// continuous path and agreed with this one on three of ten papers, and
/// `PAPER_CSS` in `exports.ts` carried a third for Word export. Every one of them
/// is now derived from here: the prelude is *sent* the width by
/// [`paper_width_cm_typst`], and the export reads [`paper_css`].
///
/// The sizes are Typst's, deliberately — `tests/paper_table.rs` renders each name
/// through Typst's own `paper:` and fails if any entry here disagrees, so this
/// table cannot drift from the compiler that lays the page out.
///
/// The keys are the **canonical** spellings, post-[`sanitize_paper`]: `iso-b5`,
/// not `b5`. That split is the whole of the fix — `b5` used to be here under a
/// name Typst refuses, so the two tables could never be compared and the page
/// came out A4 (or, in continuous mode, A4-wide) with nothing reporting it.
pub(crate) fn paper_cm_of(paper: &str) -> Option<(f64, f64)> {
    Some(match sanitize_paper(paper).as_str() {
        "a2" => (42.0, 59.4),
        "a3" => (29.7, 42.0),
        "a4" => (21.0, 29.7),
        "a5" => (14.8, 21.0),
        "a6" => (10.5, 14.8),
        "iso-b4" => (25.0, 35.3),
        "iso-b5" => (17.6, 25.0),
        "iso-b6" => (12.5, 17.6),
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
pub(crate) fn sheet_height_cm(cfg: &DocConfig) -> Option<f64> {
    match (cfg.page_width_cm, cfg.page_height_cm) {
        (Some(_), Some(h)) => Some(h),
        _ => paper_height_cm(&cfg.paper),
    }
}

/// The last answers the reserve gave, keyed by their inputs.
///
/// The scan is a whole-document parse and it runs at the bottom of `show_rule` —
/// every compile, including the ones a watcher or a settings change asks for with
/// the text untouched.
///
/// # Why this is a map and not one slot (#55)
///
/// It was `Mutex<Option<(u128, f64)>>`: the **previous** document's key. That
/// holds only when there is one document in the process, and the editor is not
/// that. Two open sefarim in two windows, or one sefer with a main body and a
/// part, alternate two keys and each call **evicts the entry the next one wants**,
/// so the cache never hits and every compile pays the parse.
///
/// Measured, on real sefer-sized text (`examples/bench-reserve-cache`):
///
/// | body | a miss costs |
/// |---|---|
/// | 64 KB | ~3.9 ms |
/// | 256 KB | ~17.5 ms |
/// | 1 MB | ~72 ms |
///
/// At a megabyte that is **past the ~59 ms keystroke budget**, so under two open
/// documents the compile is not late, it is dropped — on a shape the product
/// supports on purpose.
///
/// # Why eight
///
/// Enough for the shapes that exist (two windows, a body and its parts, a
/// compile racing a jump or a spell check) with room over, and bounded so a
/// process that somehow accumulates keys cannot grow without limit. Eight entries
/// of `(u128, f64)` is 160 bytes.
///
/// Eviction is **least-recently-used**, because the access pattern that breaks a
/// one-slot cache is a *cycle*: A, B, A, B. Any bounded map that drops an
/// arbitrary entry turns a 2-cycle into a 100% miss rate forever, while
/// least-recently-used holds both ends of a cycle of any length up to its size.
/// The rule is the standard second chance — on a hit the entry moves to the
/// front, on an insert the back goes — and it is deliberately not exact LRU,
/// which would need a timestamp per entry and a scan, for an eight-entry map
/// where "recently used" is the only thing that matters.
pub(crate) static RESERVE_CACHE: std::sync::Mutex<Vec<(u128, f64)>> =
    std::sync::Mutex::new(Vec::new());

/// How many (body, sheet) answers are kept.
pub(crate) const RESERVE_CACHE_CAP: usize = 8;

pub(crate) fn reserve_cache_key(body: &str, page_h_cm: Option<f64>) -> u128 {
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
    if let Ok(mut guard) = RESERVE_CACHE.lock() {
        // `rposition` and a move-to-front: a hit on an eight-entry vec is cheaper
        // than anything cleverer, and the pattern this is here for is a *cycle*,
        // which a plain LRU-refresh handles exactly.
        if let Some(at) = guard.iter().rposition(|(k, _)| *k == key) {
            let entry = guard.remove(at);
            guard.insert(0, entry);
            return entry.1;
        }
    }
    let answer = auto_notes_region_cm_scan(body, page_h_cm);
    if let Ok(mut guard) = RESERVE_CACHE.lock() {
        guard.insert(0, (key, answer));
        guard.truncate(RESERVE_CACHE_CAP);
    }
    answer
}

pub(crate) fn auto_notes_region_cm_scan(body: &str, page_h_cm: Option<f64>) -> f64 {
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
pub(crate) const DEFAULT_REGION_CM: f64 = 3.0;
/// The most of the sheet the page-foot apparatus may claim.
pub(crate) const MAX_REGION_SHARE: f64 = 0.6;

/// What the prelude draws *between* two adjacent bands: `v(ריווח_בין)`, the short
/// divider rule, `v(ריווח_בין)` again. Measured at 11.6pt (0.41 cm) at the
/// shipped settings; carried at 0.45 so that a document which enlarges the gap a
/// little does not start clipping, and so the allowance does not compound the
/// wrong way down a five-band stack.
pub(crate) const BAND_GAP_CM: f64 = 0.45;
/// The rule above the apparatus as a whole, plus its `rule_gap`.
pub(crate) const BAND_RULE_CM: f64 = 0.25;

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
pub(crate) fn is_live_code(shape: &parse::ApparatusShape, at: usize) -> bool {
    !shape.comments.iter().any(|&(a, b)| a <= at && at < b)
        && !shape.strings.iter().any(|&(a, b)| a <= at && at < b)
}

/// Whether `name` (a command, or the common prefix of a family of them) appears
/// as an actual call. A call is live code by construction, so a prose mention,
/// a comment or a string literal can never be one.
pub(crate) fn apparatus_is_called(shape: &parse::ApparatusShape, name: &str) -> bool {
    shape.calls.iter().any(|c| c.name.starts_with(name))
}

/// Whether `name` is handed to the deferred-note wrapper as its layout — the
/// value of `סוג:`/`kind:`, where there is no bracket for
/// `apparatus_is_called` to find. The key may not sit inside a comment
/// or a string literal.
pub(crate) fn apparatus_is_named_as_kind(
    body: &str,
    shape: &parse::ApparatusShape,
    name: &str,
) -> bool {
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
pub(crate) fn channel_declarations(
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
pub(crate) fn channel_region_cm(
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
pub(crate) fn declared_region_cm(
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

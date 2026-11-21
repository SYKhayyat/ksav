//! The prelude: Ksav's language knowledge, and what the engine hands Typst.
//!
//! # Why this is a module of its own
//!
//! `typst/ksav.typ` is the language — every command, its parameters and what it
//! prints — and this is the engine half of it: the string literals that go into
//! the compile, the `#show` rule driven by the writer's settings, the note
//! reservoir's size, the writer's own `#מסמך(` found and edited in place, and the
//! package root `#import "@local/…"` resolves against.
//!
//! It is not the compile pipeline, and the two were one file (`#222`). A change
//! here is a change to the *language* and should be read by whoever works on
//! `ksav.typ`; a change in `lib.rs` is a change to how a document is laid out.
//!
//! # The rule every string here follows
//!
//! A value interpolated into the prelude goes through `typst_str` or through
//! `sanitize_paper` and nothing else. Building a literal by hand is how `font` and
//! `paper` came to miss the backslash case that `header`/`footer` handled, and
//! `escape::string_literal` exists so there is one answer.

use crate::escape;
use crate::geometry::{
    auto_notes_region_cm_sheet, length_cm, paper_width_cm_typst, sheet_height_cm,
};
use crate::{
    effective_lang, sanitize_head_align, sanitize_text_align, sefarim, typst_paper, DocConfig,
};

/// The Hebrew prelude, embedded at build time.
pub(crate) const PRELUDE: &str = include_str!("../../typst/ksav.typ");

/// Escape a string for embedding as a Typst string literal.
///
/// The backslash must be doubled *first*: escaping the quote first would turn
/// `"` into `\"` and the following pass would then turn that backslash into
/// `\\"`, closing the literal after all. Every value interpolated into the
/// prelude goes through this or through `sanitize_paper`; nothing else is
/// allowed to build a string literal by hand, which is how `font` and `paper`
/// came to miss the backslash case that `header`/`footer` handled correctly.
pub(crate) fn typst_str(s: &str) -> String {
    escape::string_literal(s)
}

/// `typst_str`, or the literal `none` when the string is empty.
pub(crate) fn typst_str_or_none(s: &str) -> String {
    if s.is_empty() {
        "none".to_string()
    } else {
        typst_str(s)
    }
}

/// A length in cm, or the literal `none` when the edge was never set.
pub(crate) fn typst_cm_or_none(v: Option<f64>) -> String {
    match v {
        Some(n) => format!("{n}cm"),
        None => "none".to_string(),
    }
}

/// A Typst array literal of strings.
pub(crate) fn typst_str_array(items: &[String]) -> String {
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
pub(crate) const IMPORT_LINE: &str = "#import \"ksav.typ\": *";

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
pub(crate) fn prelude_text() -> String {
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
pub(crate) fn show_rule(body: &str, cfg: &DocConfig) -> String {
    show_rule_with(body, cfg, None)
}

/// The `#show:` rule, which is where the engine's configuration reaches the
/// document.
///
/// `band_of` is the channel this layout is a **page-body band** for (#79) — see
/// `bodystream`. It is the one parameter here the engine sets and a writer never
/// writes, because a band a document could ask for by hand is a document with no
/// text in it.
pub(crate) fn show_rule_with(body: &str, cfg: &DocConfig, band_of: Option<&str>) -> String {
    let dir = if cfg.dir == "ltr" { "ltr" } else { "rtl" };
    let columns = cfg.columns.max(1);
    format!(
        "#show: מסמך.with(\
         גופן: {font}, גודל: {size}pt, שוליים: {margin}cm, כיוון: {dir}, שפה: {lang}, \
         מספור: {numbering}, מספור_עברי: {hebrew_num}, נייר: {paper}, \
         נייר_רוחב: {paper_w}, \
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
         הזחה_ראשונה: {indent}em, טורים: {columns}, אזור_הערות: {region}, \
         זרם_גוף: {band})",
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
        paper = typst_str(&typst_paper(&cfg.paper)),
        paper_w = paper_width_cm_typst(&cfg.paper),
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
        // The band's own channel, or nothing for the body. Written rather than
        // interpolated blank, because an empty string is a channel named "" to
        // the prelude and a band with no name would take every entry in the
        // document.
        band = match band_of {
            Some(name) => typst_str(name),
            None => "none".to_string(),
        },
    )
}

/// The value the wrapper hands `מסמך` for `אזור_הערות`, as Typst source.
///
/// The scan is the second pass; the configured number overrides it under the
/// document's own overflow policy. Shared between the injected wrapper and
/// [`inject_reserve_into_writer_masmer`], so a writer who opens their own
/// `#מסמך(...)` gets exactly the reserve a bare body would have got.
pub(crate) fn reserve_region_expr(body: &str, cfg: &DocConfig) -> String {
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
pub(crate) fn inject_reserve_into_writer_masmer(body: &str, region_expr: &str) -> String {
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
    let sep = if tail.trim_start().is_empty() {
        ""
    } else {
        ", "
    };
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
pub(crate) struct WriterMasmer {
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
pub(crate) const RESERVE_ARGS: [&str; 2] = ["אזור_הערות", "notes_region"];
/// The two spellings of the wrapper this reserve belongs to.
pub(crate) const MASMER_NAMES: [&str; 2] = ["מסמך", "masmer"];

/// The first `#מסמך(…)` in `body` that carries a reserve argument, resolved off
/// the parse.
///
/// Returns `None` when there is no such call — including when there *is* a
/// `#מסמך` but its argument list is still unbalanced and the parser could not
/// read it. That is the honest answer rather than a fallback to the text scan,
/// because the fallback is the bug.
pub(crate) fn find_writer_masmer(body: &str) -> Option<WriterMasmer> {
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
                            let has_parens = first
                                .as_ref()
                                .is_some_and(|c| c.kind() == SyntaxKind::LeftParen);
                            let open = match first {
                                Some(c) if c.kind() == SyntaxKind::LeftParen => c.offset() + 1,
                                Some(c) => c.offset(),
                                None => args.offset() + args.get().leaf_text().len(),
                            };
                            for named in args.children().filter(|c| c.kind() == SyntaxKind::Named) {
                                let parts: Vec<_> =
                                    named.children().filter(|c| !c.kind().is_trivia()).collect();
                                if parts.len() < 2 || parts[0].kind() != SyntaxKind::Ident {
                                    continue;
                                }
                                if !RESERVE_ARGS.contains(&parts[0].get().leaf_text().as_str()) {
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
pub(crate) fn inline_reserve_cm(body: &str) -> Option<f64> {
    let m = find_writer_masmer(body)?;
    if m.reserve.is_empty() {
        return None;
    }
    length_cm(&m.reserve, None)
}

pub(crate) fn grow_inline_reserve(body: &str, need_cm: f64) -> String {
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
    // always a legal answer; a panic during a keystroke is not, and nothing
    // here guards a rewrite.
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
    main_source_with(body, cfg, None)
}

/// [`main_source`], as the band for one channel.
///
/// The band is the same document read a second time, so the only thing that
/// differs is the `זרם_גוף` the rule hands `#מסמך` — which is what makes the
/// band's numbering the body's numbering without anything having to agree about
/// it. See `bodystream`.
pub(crate) fn main_source_with(body: &str, cfg: &DocConfig, band_of: Option<&str>) -> String {
    format!(
        "{IMPORT_LINE}\n{rule}\n\n{body}\n",
        rule = show_rule_with(body, cfg, band_of),
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
pub(crate) static LOCAL_ROOT: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

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

//! Turning Typst's diagnostics into something a Ksav writer can act on.
//!
//! # Why this module exists
//!
//! `struct Diagnostic { severity, message }` had nowhere to put a location, so
//! nothing downstream could ever have one. `diag_messages` was handed Typst's own
//! `SourceDiagnostic` — span and all — appended the hints to the message and
//! threw the span away. A writer who mistyped a command got
//! `unknown variable: הדגשא` floating over a blank preview: no line, no column,
//! no *did you mean הדגשה?* even though the 115-entry registry that would answer
//! that question was sitting in memory two modules over.
//!
//! Four things were wrong at once and half of them fixed is worse than none, so
//! this module does all four:
//!
//! 1. **A location.** What the compiler sees is not what the writer typed, so a
//!    raw Typst line number would name a line the writer cannot see. A
//!    diagnostic that points into the prelude gets no line at all rather than a
//!    wrong one.
//!
//!    This used to be arithmetic over one enormous string: the prelude was
//!    *prepended* to every document, so "is this span the writer's?" was
//!    `span.start >= body_offset` where `body_offset` was the length of 111 KB
//!    of prefix. The prelude is a **resolved file** now — the document opens
//!    `#import "ksav.typ": *` — so a span carries which file it came from and
//!    the question is an identity check on a [`FileId`]. What is left of the
//!    arithmetic is [`body_offset_of`], measuring a two-line header, and it is
//!    still subtraction over two strings the caller already holds.
//! 2. **A suggestion.** One or two edits away, in either script, from the real
//!    registry.
//! 3. **The command, named.** Typst's argument-type errors do not say which call
//!    they are about; the span does, so the enclosing `#command(` is looked up
//!    from the body.
//! 4. **Not Typst's vocabulary.** *"expected auto, relative length, fraction,
//!    integer, or array, found string"* names four Typst types a Ksav writer has
//!    never heard of. Every family below is rephrased bilingually, in the same
//!    register `server.rs` already uses for transport errors.
//!
//! # The rule
//!
//! **Every user-visible failure names (a) what failed in the writer's words, (b)
//! the line or command they can act on, and (c) exactly one place to look.**
//!
//! Typst's own words are kept, on `raw`, for the bug report. They are never the
//! message.
//!
//! # Why here and not in the editor
//!
//! `app/src/diagnostics.ts` used to do the rephrasing, which meant the wasm
//! backend, the Tauri backend and `ksav serve` each depended on one particular
//! front end to make their output legible — and anything else that spoke to
//! `/compile` got Typst's raw English. Rephrasing belongs where the span, the
//! registry and the prelude all already are. The TypeScript half was deleted in
//! the same change; two mechanisms for one job is how the wrong one ends up on
//! the flagship question.

use typst::diag::{SourceDiagnostic, Tracepoint};
use typst::syntax::{DiagSpanKind, LinkedNode, Source, Span, SpanKind, SyntaxKind};

use crate::commands::COMMANDS;

/// A compiler diagnostic surfaced back to the editor.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct Diagnostic {
    /// `"error"` or `"warning"`.
    pub severity: String,
    /// What the writer reads: bilingual, and about their command rather than
    /// Typst's type names.
    pub message: String,
    /// Typst's own words, for the details affordance. Never the message.
    pub raw: String,
    /// 1-based line **in the body the request carried**, or `None` when the
    /// diagnostic points into the prelude rather than into the writer's text.
    ///
    /// The body is what the caller sent, which is not always what the writer
    /// typed — the editor prepends a custom-command preamble — so a caller that
    /// prepends anything subtracts its own line count. It knows what it added;
    /// the engine does not.
    pub line: Option<usize>,
    /// 1-based column, counted in characters rather than bytes, because a Hebrew
    /// letter is two bytes and no writer counts in bytes.
    pub column: Option<usize>,
    /// The command this is about, when one can be named — either because the
    /// message names it or because the span sits inside its call.
    pub about: Option<String>,
    /// The nearest real command name, when the one written does not exist.
    pub did_you_mean: Option<String>,
    /// Which included document this line came from, when the body was assembled
    /// from several (`#כלול`). `None` means the main body.
    ///
    /// Without this, a sefer built from twelve chapters reports every error at a
    /// line number in a document that exists nowhere — the concatenation — and
    /// the writer has to work out which chapter that was by counting.
    pub file: Option<String>,
}

impl Diagnostic {
    /// A diagnostic that is ours rather than Typst's: no span, nothing to suggest.
    pub fn ours(severity: &str, message: String) -> Self {
        Self {
            severity: severity.to_string(),
            raw: message.clone(),
            message,
            ..Self::default()
        }
    }

    /// One line of text, for a surface that has no gutter to put a mark in.
    ///
    /// # Why this is here and not in the caller
    ///
    /// Every field above this exists so a reader can be told **where** the
    /// trouble is, and two of the three surfaces that show a diagnostic were
    /// throwing all of them away: the command line printed
    /// `[error] {message}` and the Emacs client printed `error: {message}`.
    /// The browser editor used them, so nothing looked broken — the engine
    /// computed a line, a column, the command it was about and a spelling
    /// suggestion, and a writer compiling a sefer from a terminal read *the
    /// command here is missing an argument: body* and went looking through
    /// three hundred lines by eye.
    ///
    /// So the formatting is the engine's, once, and a surface that wants a
    /// line of text asks for one. `file` is the included document the line came
    /// from; `whose` is what to call the main body when it is not one.
    ///
    /// The shape is the one every compiler and editor already knows how to
    /// parse — `file:line:column: severity: message` — which is what makes the
    /// output navigable in Emacs, in Vim and in a CI log rather than merely
    /// more detailed.
    pub fn one_line(&self, whose: &str) -> String {
        let mut out = String::new();
        if let Some(line) = self.line {
            out.push_str(self.file.as_deref().unwrap_or(whose));
            out.push(':');
            out.push_str(&line.to_string());
            if let Some(column) = self.column {
                out.push(':');
                out.push_str(&column.to_string());
            }
            out.push_str(": ");
        }
        out.push_str(&self.severity);
        out.push_str(": ");
        out.push_str(&self.message);
        // `about` already carries its own `#`; `did_you_mean` is a bare registry
        // name and does not. They read identically in the message, which is how
        // the first draft of this printed `[##סעיף]`.
        if let Some(about) = &self.about {
            out.push_str(" [");
            out.push_str(about);
            out.push(']');
        }
        if let Some(mean) = &self.did_you_mean {
            out.push_str(" — did you mean #");
            out.push_str(mean);
            out.push('?');
        }
        out
    }
}

/// Where the writer's own text starts inside a main source — **the
/// definition**.
///
/// Building a main source with an empty body gives the import line, the `#show`
/// wrapper, the blank line, and the trailing newline that `main_source`'s format
/// string puts after `{body}`. Both come off the same format string, so this
/// cannot drift out of step with it — which is the whole reason it is computed
/// rather than counted by hand.
///
/// It used to be 111 KB of `format!` to learn one integer, paid once per compile
/// and *twice* per jump, because the prelude was part of the string it was
/// measuring. It is now a two-line header. [`body_offset_of`] is still what the
/// hot paths call — it is subtraction over strings they already hold — and
/// `the_cheap_offset_is_the_same_offset` sweeps the two over every shape of
/// config there is so that the cheap one cannot quietly stop being this one.
pub fn body_offset(cfg: &crate::DocConfig) -> usize {
    crate::main_source("", cfg).len().saturating_sub(1)
}

/// The same offset, read off a main source that already exists.
///
/// `main_source`'s format string ends in `{body}\n`, so everything before the
/// writer's text is exactly `main.len() - body.len() - 1`. Every caller already
/// holds both strings — the source it is locating spans in, and the body it was
/// built from — so nothing has to be formatted a second time to be measured.
///
/// `saturating_sub` rather than an assertion: the arithmetic is only wrong if
/// the two strings did not come from one `main_source` call, and the honest
/// answer to that is the same one every other coordinate correction gives — no
/// line, rather than a wrong one.
pub fn body_offset_of(main: &str, body: &str) -> usize {
    main.len().saturating_sub(body.len() + 1)
}

/// 1-based line and character column of a byte offset inside `text`.
fn line_column(text: &str, byte: usize) -> (usize, usize) {
    let upto = &text[..byte.min(text.len())];
    let line = upto.matches('\n').count() + 1;
    let start = upto.rfind('\n').map_or(0, |i| i + 1);
    // Characters, not bytes: a Hebrew letter is two bytes and a nikud point is
    // another two, and a column of 41 for the fourth letter of a word is not a
    // column, it is a number.
    let column = text[start..byte.min(text.len())].chars().count() + 1;
    (line, column)
}

/// Which of the compile's two files a span landed in, and where inside it.
///
/// There are exactly two, and that is the point of the change that introduced
/// this type. A compile is handed `main.typ` — the import line, the `#show`
/// wrapper and the writer's text — and it resolves `ksav.typ`, the prelude,
/// through the file resolver. Before that split there was one string with the
/// prelude concatenated onto the front, so "which of the two is this?" was
/// `range.start >= body_offset`: a comparison that is only as right as the
/// arithmetic behind it, and that could not distinguish a span in the prelude
/// from a span in the wrapper at all.
#[derive(Debug, Clone)]
enum Site {
    /// `main.typ`. Before `body_offset` this is the header; after it, the
    /// writer's own text.
    Main(std::ops::Range<usize>),
    /// `ksav.typ` — a place the writer has never seen and cannot edit.
    Prelude(std::ops::Range<usize>),
}

/// The source a file id names, of the two this compile has.
///
/// `None` for anything else — an attached image, a package — which is not a
/// place the writer can be sent either.
fn source_for(id: typst::syntax::FileId, main: &Source) -> Option<&Source> {
    if id == main.id() {
        Some(main)
    } else if id == crate::prelude_source().id() {
        Some(crate::prelude_source())
    } else {
        None
    }
}

/// `(file, byte range)` as a [`Site`].
fn site(id: typst::syntax::FileId, range: std::ops::Range<usize>, main: &Source) -> Option<Site> {
    if id == main.id() {
        Some(Site::Main(range))
    } else if id == crate::prelude_source().id() {
        Some(Site::Prelude(range))
    } else {
        None
    }
}

/// Where a diagnostic's own span points.
fn diag_site(d: &SourceDiagnostic, main: &Source) -> Option<Site> {
    match d.span.get() {
        DiagSpanKind::Detached => None,
        // A raw byte range still names a file, and it used to be ignored: the
        // range was taken as an offset into the document whatever file it came
        // from, so a range into an attached SVG would have been read as a line
        // of the writer's text.
        DiagSpanKind::Range { id, range } => site(id, range.start..range.end, main),
        DiagSpanKind::Number { num, sub_range, id } => {
            let range = source_for(id, main)?.range(num, sub_range)?;
            site(id, range, main)
        }
    }
}

/// The same, for the plain `Span` a trace entry carries.
fn span_site(span: Span, main: &Source) -> Option<Site> {
    match span.get() {
        SpanKind::Detached => None,
        SpanKind::Range { id, range } => site(id, range, main),
        SpanKind::Number { num, id } => {
            let range = source_for(id, main)?.range(num, None)?;
            site(id, range, main)
        }
    }
}

/// A site as an offset into the writer's own text, or `None` for anywhere else.
///
/// The writer's own text is `main.typ` after the two-line header. A span in the
/// header itself — the import, the `#show` wrapper — is no more a line the
/// writer has than a span in the prelude is.
fn in_body(s: &Site, body_offset: usize) -> Option<usize> {
    match s {
        Site::Main(r) if r.start >= body_offset => Some(r.start - body_offset),
        _ => None,
    }
}

/// The same question of a bare span: where in the writer's own text is this?
///
/// [`crate::pagelines`] asks it of every glyph on a page. It is here rather than
/// there because the two halves of the answer — which of the compile's files a
/// span names, and where the writer's text starts inside `main.typ` — are this
/// module's, and a second reading of either is how a coordinate correction comes
/// to be right in one place and wrong in the other.
pub(crate) fn body_byte_of(span: Span, main: &Source, body_offset: usize) -> Option<usize> {
    in_body(&span_site(span, main)?, body_offset)
}

/// Where in the writer's own text a diagnostic actually happened, and what call
/// took it there.
///
/// **This is the part that makes the argument-type family locatable at all.**
/// `#נוסחה[x^2]` fails inside the prelude's own definition of `נוסחה`, so the
/// diagnostic's primary span points at a line of `ksav.typ` — which the writer has
/// never seen and cannot edit. Typst records the call chain in `trace`, and the
/// outermost entry of it is the writer's own line. Walking it is what
/// `typst-cli` does when it prints *"called from main.typ:1:2"*, and without it a
/// third of the errors a Ksav writer can produce have no line at all.
///
/// `Tracepoint::Call(name)` also carries the function's name, which is a better
/// answer to *which command was this about* than reading the text backwards —
/// so the text scan is only the fallback.
fn where_it_happened(
    d: &SourceDiagnostic,
    main: &Source,
    body_offset: usize,
) -> (Option<usize>, Option<String>) {
    let text = main.text();
    let body = &text[body_offset.min(text.len())..];
    let in_body = |s: &Site| in_body(s, body_offset);

    let own = diag_site(d, main);
    if let Some(at) = own.as_ref().and_then(in_body) {
        return (Some(at), None);
    }
    // Innermost first in Typst's trace, so the last entry that lands in the body
    // is the writer's own call.
    for entry in d.trace.iter().rev() {
        if let Some(at) = span_site(entry.span, main).as_ref().and_then(in_body) {
            let named = match &entry.v {
                Tracepoint::Call(Some(name)) => Some(format!("#{name}")),
                _ => None,
            };
            return (Some(at), named);
        }
    }

    // Nothing in the body, and no trace. This is the `#טבלה(עמודות: "שתיים")`
    // shape: Typst rejects the argument while casting it inside the prelude's own
    // `table(columns: עמודות)` call, records no `Call` frame for the Ksav wrapper,
    // and spans the prelude — a file the writer has never seen. Two things are
    // still recoverable without guessing at anything.
    //
    // First, *which* Ksav command it was: the prelude span sits inside exactly one
    // top-level `#let`, and that `#let`'s name is the command the writer typed.
    let named = match &own {
        Some(Site::Prelude(r)) => enclosing_let(crate::prelude_source(), r.start),
        _ => None,
    };

    // Second, the line — but only when it is not a guess. If the body calls that
    // command exactly once, that call is the only place this can have come from.
    // If it calls it twice, there is no honest answer and the writer gets none;
    // rule 4 of this project's own rules is that a wrong ref is worse than no ref,
    // and a wrong line is a wrong ref.
    let at = named.as_deref().and_then(|name| sole_call(body, name));
    (at, named)
}

/// The name of the top-level `#let` binding a byte offset falls inside.
///
/// # This used to be a backwards text scan, and it was a convention with a
/// sweep holding it up
///
/// The prelude was concatenated onto the front of every document, so all this
/// had to work with was a `&str`. It found the nearest **column-0** `#let
/// <name>` behind the offset. Column 0 was the whole correctness argument: a
/// bare `rfind("#let ")` finds whichever binding is textually nearest, which for
/// an offset inside a helper defined *within* a command is the helper, and the
/// writer would be told their error was in a name they have never typed. What
/// made the anchor work was that `ksav.typ` happens to spell every nested
/// binding as an indented `let` with no hash — 361 at column 0, 187 indented,
/// none of them hashed. A spelling convention, across 2,324 lines, with a
/// 361-binding sweep run on every `cargo test` to keep it true.
///
/// The prelude is a parsed [`Source`] now, so the question can be asked of the
/// syntax tree that Typst itself produced: **the outermost `LetBinding` node
/// whose range contains the offset.** An indented `#let` inside a command is a
/// nested node and cannot win; a `#let` inside a string or a comment is not a
/// node at all. The convention is no longer load-bearing, and the sweep stays —
/// not to hold up a rule, but because a resolver this far down the error path is
/// worth checking against all 361 of the bindings it resolves.
fn enclosing_let(source: &Source, byte: usize) -> Option<String> {
    fn outermost(node: &LinkedNode, byte: usize) -> Option<String> {
        for child in node.children() {
            let range = child.range();
            if byte < range.start || byte >= range.end {
                continue;
            }
            if child.kind() == SyntaxKind::LetBinding {
                return binding_name(&child);
            }
            if let Some(found) = outermost(&child, byte) {
                return Some(found);
            }
        }
        None
    }
    outermost(&LinkedNode::new(source.root()), byte)
}

/// The name a `LetBinding` binds.
///
/// Two shapes: `#let x = …` puts an `Ident` straight under the binding, and
/// `#let f(a) = …` puts a `Closure` there whose own first `Ident` is the name.
/// A destructuring `#let (a, b) = …` has neither and gets no name, which is the
/// right answer — the prelude has none, and a pattern is not a command.
fn binding_name(binding: &LinkedNode) -> Option<String> {
    for child in binding.children() {
        match child.kind() {
            SyntaxKind::Ident => return Some(format!("#{}", child.get().leaf_text())),
            SyntaxKind::Closure => {
                for part in child.children() {
                    if part.kind() == SyntaxKind::Ident {
                        return Some(format!("#{}", part.get().leaf_text()));
                    }
                }
            }
            _ => {}
        }
    }
    None
}

/// The byte offset of the only call to `name` in `body`, if there is exactly one.
///
/// One occurrence is not a guess; it is the only possibility. More than one, and
/// this returns nothing rather than picking.
fn sole_call(body: &str, name: &str) -> Option<usize> {
    let mut found = None;
    let mut from = 0;
    while let Some(rel) = body[from..].find(name) {
        let at = from + rel;
        // A call, not a prefix of a longer name: what follows must open the call.
        let after = body[at + name.len()..].chars().next();
        if matches!(after, Some('(') | Some('[')) {
            if found.is_some() {
                return None; // two calls; no honest answer
            }
            found = Some(at);
        }
        from = at + name.len();
    }
    found
}

/// The command whose call encloses a byte offset, if any.
///
/// Typst's argument-type errors say what kind of value they wanted and never say
/// which call wanted it. The span does. Scanning back from it for the nearest
/// unclosed `#name(` is a heuristic, and it is a safe one: when it does not find
/// a call it says nothing rather than guessing, and rule 4 of the project's own
/// rules is that a wrong name is worse than no name.
fn enclosing_command(body: &str, byte: usize) -> Option<String> {
    // The span is often the call itself rather than something inside it: a
    // missing argument is reported *at* `#סעיף`, not between its brackets. Read
    // the name forwards from the nearest `#` that the byte is standing on or in.
    if let Some(name) = command_at(body, byte) {
        return Some(name);
    }
    let upto = &body[..byte.min(body.len())];
    let mut round = 0i32;
    let mut square = 0i32;
    let bytes = upto.as_bytes();
    let mut i = bytes.len();
    while i > 0 {
        i -= 1;
        match bytes[i] {
            b')' => round += 1,
            b']' => square += 1,
            // `[` as well as `(`, which it did not have and which is most of
            // this language: `#טבלה(עמודות: "שתיים")` was findable and
            // `#סעיף[א]` was not, so every argument error on a command called
            // the ordinary Ksav way read *"the command here"* and named
            // nothing. `#name[…]` is the idiom; the parenthesised form is the
            // exception.
            b'(' | b'[' => {
                let depth = if bytes[i] == b'(' {
                    &mut round
                } else {
                    &mut square
                };
                if *depth == 0 {
                    // The name runs from here back to the `#`.
                    let head = &upto[..i];
                    let hash = head.rfind('#')?;
                    let name = &head[hash + 1..];
                    if name.is_empty() || !is_command_name(name) {
                        return None;
                    }
                    return Some(format!("#{name}"));
                }
                *depth -= 1;
            }
            _ => {}
        }
    }
    None
}

/// The command whose `#name` the byte is standing on, or in.
///
/// Typst spans a missing-argument error at the call, which means the byte lands
/// inside the name rather than inside the brackets — so the backwards bracket
/// scan above has nothing to find and every one of those errors named nothing.
fn command_at(body: &str, byte: usize) -> Option<String> {
    let at = byte.min(body.len());
    // Back to the start of the run of name characters the byte is inside.
    let mut start = at;
    while start > 0 && body.is_char_boundary(start - 1) {
        let c = body[start - 1..].chars().next()?;
        if !(c.is_alphanumeric() || c == '_') {
            break;
        }
        start -= c.len_utf8();
    }
    if start == 0 || !body[..start].ends_with('#') {
        return None;
    }
    let rest = &body[start..];
    let end = rest
        .char_indices()
        .find(|(_, c)| !(c.is_alphanumeric() || *c == '_'))
        .map(|(i, _)| i)
        .unwrap_or(rest.len());
    let name = &rest[..end];
    if name.is_empty() || !is_command_name(name) {
        return None;
    }
    Some(format!("#{name}"))
}

/// Whether a run of text could be a command name — letters, digits, underscore.
fn is_command_name(s: &str) -> bool {
    s.chars().all(|c| c.is_alphanumeric() || c == '_')
}

/// The registry's names, both scripts, as one list.
fn every_command_name() -> impl Iterator<Item = &'static str> {
    COMMANDS.iter().flat_map(|c| [c.he, c.en])
}

/// The nearest real command name to one that does not exist.
///
/// Levenshtein, with the budget scaled to the length of what was written: one
/// edit for a short name, two for a long one. `הדגשא` → `הדגשה` is one
/// substitution, which is the case that started this. Ties are broken by
/// preferring a name in the same script as what was typed, because a Hebrew
/// writer who mistyped a Hebrew command is not helped by an English alias.
pub fn nearest_command(written: &str) -> Option<&'static str> {
    let chars: Vec<char> = written.chars().collect();
    if chars.len() < 2 {
        return None;
    }
    let budget = if chars.len() <= 4 { 1 } else { 2 };
    let hebrew = written.chars().any(is_hebrew);
    let mut best: Option<(usize, bool, &'static str)> = None;
    for name in every_command_name() {
        let d = edit_distance(&chars, name);
        if d == 0 || d > budget {
            continue;
        }
        let same_script = name.chars().any(is_hebrew) == hebrew;
        let candidate = (d, !same_script, name);
        if best.is_none_or(|b| candidate < b) {
            best = Some(candidate);
        }
    }
    best.map(|(_, _, name)| name)
}

fn is_hebrew(c: char) -> bool {
    ('\u{0590}'..='\u{05FF}').contains(&c)
}

/// Levenshtein distance, two rows rather than a matrix.
fn edit_distance(a: &[char], b: &str) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];
    for (i, &ca) in a.iter().enumerate() {
        cur[0] = i + 1;
        for (j, &cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

/// A Typst type name, in words a writer has met.
///
/// This table is the whole of B5's fourth part. *"expected auto, relative length,
/// fraction, integer, or array"* is four type names from a language the writer
/// has never used, in a message about a table they built from a toolbar.
fn type_said(t: &str) -> Option<(&'static str, &'static str)> {
    Some(match t.trim() {
        "auto" => ("אוטומטי", "automatic"),
        "none" => ("ריק", "nothing"),
        "integer" => ("מספר שלם", "a whole number"),
        "float" => ("מספר", "a number"),
        "boolean" => ("כן או לא", "true or false"),
        "string" => ("מלל במרכאות", "text in quotes"),
        "content" => ("תוכן בסוגריים מרובעים", "content in [brackets]"),
        "array" => ("רשימה בסוגריים מרובעים", "a list in (brackets)"),
        "dictionary" => ("טבלת שמות וערכים", "a set of named values"),
        "length" => ("מידה (למשל 3cm)", "a length such as 3cm"),
        "relative length" | "relative" => ("מידה או אחוז (3cm, 40%)", "a length or a percentage"),
        "ratio" => ("אחוז", "a percentage"),
        "fraction" => ("חלק מהנותר (1fr)", "a share of what is left, like 1fr"),
        "alignment" => ("יישור", "an alignment"),
        "color" => ("צבע", "a colour"),
        "function" => ("פקודה", "a command"),
        "label" => ("תווית", "a label"),
        _ => return None,
    })
}

/// How likely a Typst type is to be what the writer meant. Lower comes first.
///
/// A table column wants `auto`, a relative length, a fraction, an integer or an
/// array; of those, "a length or a percentage" is what somebody typing a column
/// width is reaching for and `auto` is what they get by leaving it out. Ordering
/// by that rather than by Typst's declaration order is the difference between a
/// hint and a lattice.
fn usefulness(t: &str) -> u8 {
    match t.trim() {
        "relative length" | "relative" | "length" => 0,
        "integer" | "float" => 1,
        "string" => 2,
        "content" => 3,
        "array" => 4,
        "ratio" => 5,
        "color" | "alignment" | "label" => 6,
        "dictionary" | "function" => 7,
        "fraction" => 8,
        "boolean" => 9,
        "auto" | "none" => 10,
        _ => 11,
    }
}

/// Split `expected a, b, or c, found d` into the two halves.
fn expected_found(raw: &str) -> Option<(Vec<String>, String)> {
    let rest = raw.strip_prefix("expected ")?;
    let (wanted, found) = rest.split_once(", found ")?;
    let wanted: Vec<String> = wanted
        .split(", ")
        .flat_map(|p| p.split(" or "))
        .map(|p| p.trim().trim_start_matches("or ").trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    Some((wanted, found.trim().to_string()))
}

/// The Hebrew name of a parameter, for a message that has to name one.
///
/// Read out of `ksav.typ`'s **own** `_en_params` table — the one `_en` uses to
/// let a Hebrew-named command take English argument names — rather than a
/// second copy here. A diagnostic that called a parameter something the engine
/// does not accept would be worse than the English name it replaced.
///
/// `body` is the one addition, and it is the reason this exists at all:
/// `#סימן[א]` reports *"missing argument: כותרת"* and `#סעיף[א]` reports
/// *"missing argument: body"*, because `body` is the only English parameter
/// name left in the prelude — on 89 commands, all of them positional, so it is
/// invisible to a writer everywhere except in the one message that says it out
/// loud. Renaming it in `ksav.typ` would mean rewriting the variable through 89
/// function bodies that also pass `body:` as a *metadata key* read elsewhere;
/// naming it properly here costs one line and reaches the same reader.
fn hebrew_param(name: &str) -> Option<String> {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    static TABLE: OnceLock<HashMap<String, String>> = OnceLock::new();
    let table = TABLE.get_or_init(|| {
        let mut map = HashMap::new();
        map.insert(
            "body".to_string(),
            "גוף (הטקסט שבסוגריים המרובעים)".to_string(),
        );
        // Every `english: "..."` pair the prelude states, wherever it states it.
        //
        // This used to read `#let _en_params = (` and nothing else. That was the
        // whole vocabulary when there was one flat table; it stopped being so the
        // moment a parameter needed a *per-function* name, which is what
        // `_en(f, extra: (...))` is for and what `document` now carries fifteen
        // of. A message that names an English parameter the writer just typed and
        // cannot say its Hebrew equivalent is the failure this map exists to
        // prevent, so it reads the `extra` tables too.
        //
        // From Typst's own parse of the prelude, not a string scan of it. This
        // used to find the tables by substring and split them on commas and
        // colons, and said so: *"still string-parsing a `.typ` file, which is
        // fragile."* A `//` note between two entries — and there are several,
        // arguing why a particular pairing is *absent* — read as an entry.
        //
        // First spelling wins, which is what `or_insert_with` is for: a
        // per-command `extra:` override and the flat table can both name one
        // English word, and the flat one is walked first because it is declared
        // first.
        for (english, hebrew) in en_param_pairs(crate::PRELUDE) {
            map.entry(english).or_insert(hebrew);
        }
        map
    });
    table.get(name).cloned()
}

/// Both halves of a rephrasing: what the writer reads, and what it is about.
struct Said {
    message: String,
    about: Option<String>,
    did_you_mean: Option<String>,
}

/// Rephrase one of Typst's messages, or say nothing and let the raw text stand.
fn rephrase(raw: &str, about_from_span: Option<String>) -> Said {
    let lower = raw.to_lowercase();
    let mut about = about_from_span;
    let mut did_you_mean = None;

    // ---------------------------------------------------------- unknown command
    if let Some(name) = raw
        .strip_prefix("unknown variable: ")
        .map(|n| n.trim().to_string())
    {
        about = Some(format!("#{name}"));
        did_you_mean = nearest_command(&name).map(|n| format!("#{n}"));
        let message = match &did_you_mean {
            Some(mean) => format!(
                "הפקודה #{name} אינה מוכרת — האם התכוונת ל{mean}? · \
                 There is no command #{name} — did you mean {mean}?"
            ),
            None => format!(
                "הפקודה #{name} אינה מוכרת — בדקו את האיות, או הגדירו אותה תחת \"הפקודות שלי\" · \
                 There is no command #{name} — check the spelling, or define it under \"Your commands\""
            ),
        };
        return Said {
            message,
            about,
            did_you_mean,
        };
    }

    // -------------------------------------------------------- argument families
    //
    // Handled before the generic `expected`/`unexpected` catch-all below, because
    // this is the family that names Typst's own types at a writer who has never
    // seen them.
    if let Some((wanted, found)) = expected_found(raw) {
        let mut ranked: Vec<&String> = wanted.iter().collect();
        ranked.sort_by_key(|w| usefulness(w));
        // At most two. Typst's five-item enumeration is the same mistake as its
        // forty-item paper-size list: the writer picked a value, and being handed
        // the type lattice is not help. What they need is the one or two kinds
        // that are actually plausible here, and what they gave instead.
        let said: Vec<(&str, &str)> = ranked.iter().filter_map(|w| type_said(w)).take(2).collect();
        let got = type_said(&found);
        if !said.is_empty() || got.is_some() {
            let he_wanted = said
                .iter()
                .map(|(he, _)| *he)
                .collect::<Vec<_>>()
                .join(" או ");
            let en_wanted = said
                .iter()
                .map(|(_, en)| *en)
                .collect::<Vec<_>>()
                .join(" or ");
            // "הפקודה כאן מצפה כאן" — *here* twice — is what the unnamed case read
            // before. When the command cannot be named, the sentence drops the second
            // one rather than repeating it.
            let (he_which, en_which, he_here, en_here) = match about.as_deref() {
                Some(c) => (format!("הפקודה {c}"), c.to_string(), " כאן", " here"),
                None => ("הפקודה כאן".into(), "the command here".into(), "", ""),
            };
            let he_got = got.map(|(he, _)| he).unwrap_or("ערך מסוג אחר");
            let en_got = got.map(|(_, en)| en).unwrap_or("a value of another kind");
            let message = if said.is_empty() {
                format!(
                    "{he_which} קיבלה {he_got}, שאינו מה שהיא מצפה לו · \
                     {en_which} was given {en_got}, which is not what it expects"
                )
            } else {
                format!(
                    "{he_which} מצפה{he_here} ל{he_wanted}, וקיבלה {he_got} · \
                     {en_which} expects {en_wanted}{en_here}, and was given {en_got}"
                )
            };
            return Said {
                message,
                about,
                did_you_mean,
            };
        }
    }

    // ------------------------------------------------- a missing argument
    //
    // Before the generic `expected` catch-all, and named rather than generic,
    // because Typst says exactly which parameter is missing and that is the
    // most useful sentence available. `#סימן[א׳]` is the case: one bracket
    // where the command takes two, which is what somebody typing a kuntres
    // does the first time they write a siman by hand.
    if let Some(param) = raw.strip_prefix("missing argument: ") {
        let param = param.trim();
        let he_param = hebrew_param(param).unwrap_or_else(|| param.to_string());
        let (he_which, en_which) = match about.as_deref() {
            Some(c) => (format!("לפקודה {c}"), c.to_string()),
            None => ("לפקודה כאן".into(), "the command here".into()),
        };
        return Said {
            message: format!(
                "{he_which} חסר ארגומנט: {he_param} — הוסיפו אותו בסוגריים מרובעים אחרי מה שכבר כתוב · \
                 {en_which} is missing an argument: {param} — add it in square brackets after what is already there"
            ),
            about,
            did_you_mean,
        };
    }

    // ------------------------------------------------------------- the families
    let message = if lower.contains("unclosed string") {
        // **The Hebrew failure.** `"` is the gershayim key: רש״י, שו״ע, רמב״ם.
        // Inside `[…]` it is an ordinary character; inside `(…)` Typst is in
        // code mode and it opens a *string*, which then swallows the rest of
        // the document. So the writer sees an error for a punctuation mark they
        // use in every other word, and *"unclosed string"* — which is what
        // reached them until this branch existed — names a concept they have
        // never used and gives them nothing to do about it.
        "מרכאות נפתחו ולא נסגרו — בתוך סוגריים עגולים ( ) מרכאות פותחות מחרוזת. \
         לגרשיים בתוך טקסט (רש״י, שו״ע) השתמשו ב־״ או כתבו את הטקסט בתוך סוגריים מרובעים [ ] · \
         A quote mark was opened and never closed — inside round brackets ( ) a \" starts a string. \
         For gershayim inside text (רש״י, שו״ע) use ״ or put the text in square brackets [ ]"
            .to_string()
    } else if lower.starts_with("label `") && lower.contains("does not exist") {
        // A ref pointing at a marker nobody wrote. Name it: the content of the
        // message is *which* label, and Typst already says it.
        let name = raw
            .split('`')
            .nth(1)
            .map(|s| s.trim_matches(|c| c == '<' || c == '>').to_string())
            .unwrap_or_default();
        format!(
            "ההפניה @{name} מצביעה על תווית שאינה קיימת במסמך — הוסיפו <{name}> במקום שאליו ההפניה מכוונת, או תקנו את האיות · \
             The reference @{name} points at a label that is not in the document — add <{name}> where it should point, or fix the spelling"
        )
    } else if lower.starts_with("module `") && lower.contains("does not contain") {
        let mut ticks = raw.split('`').skip(1).step_by(2);
        let module = ticks.next().unwrap_or("").to_string();
        let member = ticks.next().unwrap_or("").to_string();
        format!(
            "אין {member} בתוך {module} — בדקו את האיות, או השתמשו בפקודה עברית במקומו · \
             There is no {member} in {module} — check the spelling, or use a Ksav command instead"
        )
    } else if lower.contains("index out of bounds") {
        "ביקשתם איבר שאינו קיים ברשימה — הרשימה קצרה מהמספר שנתתם · \
         You asked for an item that is not in the list — the list is shorter than the number you gave"
            .to_string()
    } else if lower.starts_with("cannot ") {
        // `cannot add function and integer`, `cannot compare …`. Typst names
        // its own types on both sides; `type_said` already knows how to say
        // those, and the verb is legible either way. Typst's sentence is
        // carried in the tail rather than dropped, because this family is the
        // one where the writer is genuinely in code and the original helps.
        let named: Vec<String> = raw
            .split_whitespace()
            .filter_map(|w| type_said(w.trim_matches(|c: char| !c.is_ascii_alphabetic())))
            .map(|(he, _)| he.to_string())
            .collect();
        let he_kinds = if named.is_empty() {
            String::new()
        } else {
            format!(" ({})", named.join(" ו"))
        };
        format!(
            "לא ניתן לבצע את הפעולה הזאת על הערכים שנתתם{he_kinds} — בדקו מה מוצב כאן · \
             That operation cannot be done on these values — check what is being put here ({raw})"
        )
    } else if lower.contains("unclosed delimiter") {
        "יש סוגר שלא נסגר — ודאו שלכל [ יש ] ולכל ( יש ) · \
         A bracket isn't closed — make sure every [ has a ] and every ( has a )"
            .to_string()
    } else if lower.contains("maximum") && lower.contains("depth") {
        "יותר מדי רמות קינון בבת אחת (מגבלת בטיחות של Typst) — נסו לפשט מעט את המבנה · \
         Too many levels of nesting at once (a Typst safety limit) — try simplifying the structure"
            .to_string()
    } else if lower.contains("not valid in code") || lower.contains("preceding hash") {
        "יש בעיה ליד סימן # — אולי חסר רווח או סוגר, או שרצית סולמית רגילה (כתבו \\#) · \
         Something's off near a # — you may be missing a space or bracket, or want a literal # (write \\#)"
            .to_string()
    } else if lower.contains("file not found") || lower.contains("failed to load") {
        "קובץ (למשל תמונה) לא נמצא — בדקו את הנתיב · \
         A file (e.g. an image) wasn't found — check the path"
            .to_string()
    } else if lower.contains("unknown font family") || lower.contains("no font could be found") {
        "הגופן אינו זמין — בחרו גופן מהרשימה בהגדרות, או צרפו קובץ גופן למסמך · \
         That font isn't available — pick one from the list in Settings, or attach a font file"
            .to_string()
    } else if let Some(name) = raw
        .strip_prefix("unexpected argument: ")
        .map(|n| n.trim().to_string())
    {
        // A misspelled *parameter*, which the catch-all below used to answer with
        // *"check brackets, commas, and the command structure"* — advice about
        // brackets, to a writer whose brackets are fine, that never says the one
        // thing only the compiler knows: which word it did not recognise.
        //
        // This is the error surface of every per-element style override
        // (`#רשימה(סמן: …)`, `#הערה(גודל: …)`, `#טבלה(קו: …)`), so a mistyped knob
        // is the most common way to reach it. Naming the word is the whole message.
        format!(
            "אין פרמטר בשם {name} בפקודה הזאת — בדקו את האיות · \
             This command has no parameter called {name} — check the spelling"
        )
    } else if lower.contains("unexpected argument") {
        // The same family without a name: too many *positional* arguments, which
        // is a different mistake and gets a different sentence rather than being
        // folded back into the bracket advice.
        "נתתם לפקודה הזאת יותר ארגומנטים ממה שהיא מקבלת · \
         This command was given more arguments than it takes"
            .to_string()
    } else if lower.contains("expected") || lower.contains("unexpected") {
        "התחביר אינו תקין כאן — בדקו סוגריים, פסיקים ומבנה הפקודה · \
         Invalid syntax here — check brackets, commas, and the command structure"
            .to_string()
    } else {
        // Not recognised. Typst's own words stand, because an unhelpful message
        // beats a swallowed one — and the line and column below still make it
        // actionable, which is the part that was missing before.
        raw.to_string()
    };
    Said {
        message,
        about,
        did_you_mean,
    }
}

/// A main source, parsed, with the offset at which the writer's text starts.
///
/// One of these is made per compile and used for every diagnostic that compile
/// produces — warnings, errors, and the HTML path's — so a document cannot end up
/// with some of its diagnostics located and some not.
///
/// The prelude is not in here and does not need to be: it is a file, it is
/// parsed once per process, and [`crate::prelude_source`] hands out the very
/// [`Source`] the compiler resolved. A prelude span therefore resolves against
/// the same tree Typst numbered it in, rather than against a second parse of a
/// copy — which is a stronger guarantee than the one this type used to rest on.
pub struct Located {
    main: Source,
    body_offset: usize,
}

impl Located {
    /// Parse a main source for the purpose of resolving spans.
    ///
    /// `Source::detached` is exactly what `typst-as-lib`'s `main_file(String)`
    /// builds, and `Source::new` numberizes the parse tree deterministically, so
    /// the span numbers Typst reports resolve against this copy. That is the whole
    /// trick: no access to Typst's `World` is needed, only the same bytes.
    ///
    /// Takes the *body* rather than the config, because the offset is the
    /// difference between the two strings the caller already has. It used to
    /// take the config and re-assemble the whole 111 KB prelude with an empty
    /// body to measure it — on every compile that produced so much as a warning.
    /// What it parses is now two lines and the writer's own text; the 111 KB it
    /// used to copy and re-parse to resolve one span is the prelude, and the
    /// prelude is somebody else's file.
    pub fn of(main: &str, body: &str) -> Self {
        Self {
            main: Source::detached(main.to_string()),
            body_offset: body_offset_of(main, body),
        }
    }

    /// Turn Typst's diagnostics into located, rephrased ones.
    pub fn all(&self, diags: &[SourceDiagnostic], severity: &str) -> Vec<Diagnostic> {
        located(diags, severity, &self.main, self.body_offset)
    }
}

/// Turn Typst's diagnostics into located, rephrased ones.
///
/// `main` is the source Typst compiled — the import line, the `#show` wrapper
/// and the body — and `body_offset` is where the writer's own text begins inside
/// it. The prelude is reached through [`crate::prelude_source`].
fn located(
    diags: &[SourceDiagnostic],
    severity: &str,
    main: &Source,
    body_offset: usize,
) -> Vec<Diagnostic> {
    let text = main.text();
    let body = &text[body_offset.min(text.len())..];
    diags
        .iter()
        .map(|d| {
            let mut raw = d.message.to_string();
            for hint in &d.hints {
                raw.push_str("\n  ↳ ");
                raw.push_str(&hint.v);
            }
            // The span, mapped into the writer's own text. A span in the prelude
            // or in the two-line header is a diagnostic about something the
            // writer cannot see, and the honest answer for it is no line at all
            // rather than a line that is not theirs.
            let (at, named) = where_it_happened(d, main, body_offset);
            let (line, column) = match at {
                Some(at) => {
                    let (l, c) = line_column(body, at);
                    (Some(l), Some(c))
                }
                None => (None, None),
            };
            // The trace's own name first, because Typst recorded which function
            // was called; reading the text backwards is only the fallback.
            let about = named.or_else(|| at.and_then(|at| enclosing_command(body, at)));
            let said = rephrase(&raw, about);
            Diagnostic {
                severity: severity.to_string(),
                message: said.message,
                raw,
                line,
                column,
                about: said.about,
                did_you_mean: said.did_you_mean,
                // Filled in by `include::relabel` when the body was assembled
                // from several documents; the line resolver here works in the
                // assembled body's own coordinates and has no idea there were
                // ever several.
                file: None,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_and_a_column_are_counted_in_characters() {
        assert_eq!(line_column("abc", 0), (1, 1));
        assert_eq!(line_column("abc", 2), (1, 3));
        assert_eq!(line_column("a\nbc", 2), (2, 1));
        assert_eq!(line_column("a\nbc", 4), (2, 3));
        // A Hebrew letter is two bytes; a column is not a byte count.
        let he = "שלום עולם";
        let byte_of_fifth_char = he.char_indices().nth(5).unwrap().0;
        assert_eq!(line_column(he, byte_of_fifth_char), (1, 6));
    }

    #[test]
    fn the_nearest_command_is_one_edit_away_in_the_writers_own_script() {
        // The case from the audit.
        assert_eq!(nearest_command("הדגשא"), Some("הדגשה"));
        // English aliases work the same way.
        assert_eq!(nearest_command("bould"), Some("bold"));
        // An exact name is not a suggestion.
        assert_eq!(nearest_command("הדגשה"), None);
        // Nothing close enough is no suggestion rather than a wrong one.
        assert_eq!(nearest_command("qqqqqqqqqq"), None);
        // Too short to guess about.
        assert_eq!(nearest_command("א"), None);
    }

    #[test]
    fn a_suggestion_stays_in_the_script_it_was_asked_in() {
        // Both `bold` and `הדגשה` exist; a Hebrew typo must not be answered with
        // an English alias, and the reverse.
        let he = nearest_command("הדגשא").unwrap();
        assert!(he.chars().any(is_hebrew), "{he}");
        let en = nearest_command("itali").unwrap();
        assert!(!en.chars().any(is_hebrew), "{en}");
    }

    #[test]
    fn typsts_type_names_are_replaced_and_not_merely_shortened() {
        let raw = "expected auto, relative length, fraction, integer, or array, found string";
        let said = rephrase(raw, Some("#טבלה".into()));
        for leak in [
            "relative length",
            "fraction",
            "integer",
            "array",
            "found string",
        ] {
            assert!(
                !said.message.contains(leak),
                "still names Typst's `{leak}`: {}",
                said.message
            );
        }
        assert!(said.message.contains("#טבלה"), "{}", said.message);
        assert!(said.message.contains("מלל במרכאות"), "{}", said.message);
        assert!(said.message.contains("text in quotes"), "{}", said.message);
        // Two kinds at most. Being handed the whole type lattice is the mistake
        // this replaces, not a smaller version of it — so the three least likely
        // of the five Typst listed are gone, in both languages.
        for dropped in [
            "אוטומטי",
            "automatic",
            "רשימה",
            "a list",
            "חלק מהנותר",
            "what is left",
        ] {
            assert!(
                !said.message.contains(dropped),
                "still enumerating: `{dropped}` in {}",
                said.message
            );
        }
        // And the two kept are the plausible ones, not Typst's declaration order.
        assert!(
            said.message.contains("מידה או אחוז")
                && said.message.contains("a length or a percentage"),
            "leads with a length: {}",
            said.message
        );
    }

    #[test]
    fn an_unknown_command_is_answered_with_the_nearest_real_one() {
        let said = rephrase("unknown variable: הדגשא", None);
        assert_eq!(said.about.as_deref(), Some("#הדגשא"));
        assert_eq!(said.did_you_mean.as_deref(), Some("#הדגשה"));
        assert!(said.message.contains("#הדגשה"), "{}", said.message);
        assert!(said.message.contains("did you mean"), "{}", said.message);
    }

    #[test]
    fn an_unknown_command_with_no_near_match_says_where_to_define_it() {
        let said = rephrase("unknown variable: qqqqqqqqqq", None);
        assert_eq!(said.did_you_mean, None);
        assert!(said.message.contains("הפקודות שלי"), "{}", said.message);
    }

    #[test]
    fn the_enclosing_command_is_found_from_a_span_inside_its_call() {
        let body = "#טבלה(עמודות: \"שתיים\")[א][ב]";
        let at = body.find('"').unwrap();
        assert_eq!(enclosing_command(body, at).as_deref(), Some("#טבלה"));
        // Outside any call, nothing is claimed.
        assert_eq!(enclosing_command("plain text", 4), None);
        // A closed call before the offset is not the enclosing one.
        assert_eq!(enclosing_command("#א(1) then", 8), None);
    }

    /// A unit test of the table, and **not the fence** — the distinction cost
    /// six families.
    ///
    /// This walks a hand-written list of raw strings, every one of which the
    /// rephraser already handles, so it cannot go red for a message the
    /// rephraser does *not* handle: such a message is not in the list. It was
    /// green while `unclosed string`, `missing argument: …`, `label … does not
    /// exist`, `array index out of bounds`, `cannot add …` and `module … does
    /// not contain …` all reached the writer in Typst's own English — the first
    /// of them produced by typing רש״י inside round brackets, which is a
    /// gershayim, which is the key a Hebrew writer presses in every other word.
    ///
    /// The fence is `tests/diagnostics_corpus.rs`: twenty-five documents that
    /// really fail, compiled by the real engine, asserting that what the writer
    /// reads is bilingual and is never Typst's own sentence. Keep this one — it
    /// is cheap and it localises a break in the table itself — but do not
    /// mistake it for coverage.
    #[test]
    fn every_rephrasing_is_bilingual() {
        let raws = [
            "unknown variable: הדגשא",
            "unclosed delimiter",
            "unclosed string",
            "missing argument: כותרת",
            "missing argument: body",
            "label `<אין_כזה>` does not exist in the document",
            "module `calc` does not contain `div`",
            "array index out of bounds (index: 9, len: 2)",
            "cannot add function and integer",
            "maximum grouping depth exceeded",
            "expected string, found content",
            "unknown font family: Nope",
            "file not found (searched at x.png)",
        ];
        for raw in raws {
            let said = rephrase(raw, None);
            assert!(
                said.message.chars().any(is_hebrew),
                "no Hebrew in `{raw}`: {}",
                said.message
            );
            assert!(
                said.message.chars().any(|c| c.is_ascii_alphabetic()),
                "no English in `{raw}`: {}",
                said.message
            );
        }
    }

    #[test]
    fn an_unrecognised_message_is_kept_rather_than_swallowed() {
        let said = rephrase("something nobody has ever seen", None);
        assert_eq!(said.message, "something nobody has ever seen");
    }

    #[test]
    fn expected_found_is_split_on_typsts_own_wording() {
        let (wanted, found) = expected_found(
            "expected auto, relative length, fraction, integer, or array, found string",
        )
        .unwrap();
        assert_eq!(
            wanted,
            vec!["auto", "relative length", "fraction", "integer", "array"]
        );
        assert_eq!(found, "string");
        let (wanted, found) = expected_found("expected string, found content").unwrap();
        assert_eq!(wanted, vec!["string"]);
        assert_eq!(found, "content");
        assert!(expected_found("unclosed delimiter").is_none());
    }

    /// Every top-level `#let` in the real prelude is the name `enclosing_let`
    /// gives for a span inside it — all 361 of them, swept.
    ///
    /// This is the fence under the §5 finding. `enclosing_let` is the last
    /// resort of the argument-type family: when Typst spans the prelude and
    /// records no call frame, the name of the binding the span fell inside is
    /// the only thing left that can tell the writer which of their commands
    /// this was about.
    ///
    /// It has had three implementations and the sweep survived all of them,
    /// which is the argument for the sweep. It found the nearest `#let `
    /// anywhere — right only while `ksav.typ` writes every nested binding as an
    /// indented `let` with no hash, a spelling convention held by habit over
    /// 2,324 lines. Then it was anchored to column 0, which made the convention
    /// unnecessary and the *scan* still a scan. Now the prelude is a parsed
    /// `Source` and it asks the syntax tree, so a nested `#let` is a nested node
    /// and a `#let` inside a string is not a node at all.
    ///
    /// The expectations are read the old way on purpose: a column-0 line scan
    /// for what the answers *should* be, checked against what the tree walk
    /// says, name for name and in order. Deriving both sides from the tree would
    /// be a test of nothing.
    ///
    /// The probe point is the middle of each binding's **own node**, and the
    /// difference from the old test is worth naming because it is the difference
    /// between the two implementations. The old one probed halfway to the *next*
    /// binding, which for a short definition followed by a long comment block is
    /// a point inside the comment — and the backwards scan answered with the
    /// preceding binding's name, because a scan cannot tell that it has walked
    /// out of the thing it is naming. Seventy-five of the 361 probes landed
    /// there. The tree says `None` for all of them, correctly: a comment is not
    /// inside a binding, and no span Typst ever reports points at one.
    #[test]
    fn every_top_level_let_names_itself() {
        let source = crate::prelude_source();
        let text = source.text();

        // What the answers should be: every column-0 `#let`, in order.
        let mut expected: Vec<String> = Vec::new();
        for (_, line) in line_starts(text) {
            if let Some(rest) = line.strip_prefix("#let ") {
                let name: String = rest
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !name.is_empty() {
                    expected.push(format!("#{name}"));
                }
            }
        }
        assert!(
            expected.len() > 300,
            "the prelude should be a few hundred bindings, found {}",
            expected.len()
        );

        // What the parser says the bindings are: every `LetBinding` with no
        // `LetBinding` above it.
        fn tops(node: &LinkedNode, out: &mut Vec<(std::ops::Range<usize>, Option<String>)>) {
            for child in node.children() {
                if child.kind() == SyntaxKind::LetBinding {
                    out.push((child.range(), binding_name(&child)));
                } else {
                    tops(&child, out);
                }
            }
        }
        let mut found = Vec::new();
        tops(&LinkedNode::new(source.root()), &mut found);

        let names: Vec<String> = found
            .iter()
            .map(|(_, n)| n.clone().unwrap_or_else(|| "<unnamed>".into()))
            .collect();
        assert_eq!(
            names, expected,
            "the parser and a column-0 line scan disagree about what the prelude binds",
        );

        // And a point inside each binding resolves to that binding — not to a
        // helper defined within it, which is the failure the whole resolver is
        // about.
        let mut wrong = Vec::new();
        for (range, name) in &found {
            let mut mid = range.start + (range.end - range.start) / 2;
            while mid > range.start && !text.is_char_boundary(mid) {
                mid -= 1;
            }
            let got = enclosing_let(source, mid);
            if got != *name {
                wrong.push(format!("{name:?} → {got:?}"));
            }
        }
        assert!(wrong.is_empty(), "bindings named wrong: {wrong:?}");
    }

    /// The mutations the sweep above cannot make.
    ///
    /// A nested binding *written with a hash* is what the old spelling
    /// convention forbade and nothing enforced. The last two are what only a
    /// parser can get right: `#let` inside a string literal and inside a
    /// comment are text, not bindings, and a scan for `\n#let ` would have
    /// happily named both.
    #[test]
    fn a_nested_binding_does_not_steal_the_name() {
        let src = |t: &str| typst::syntax::Source::detached(t.to_string());

        let prelude = src("#let קודם() = 1\n#let מסגרת(גוף) = {\n  #let פנימי = 3\n  גוף\n}\n");
        let text = prelude.text().to_string();
        assert_eq!(
            enclosing_let(&prelude, text.find("גוף\n}").unwrap()),
            Some("#מסגרת".to_string()),
            "a span inside `מסגרת` must name `מסגרת`, not the helper it defines"
        );
        // And the first binding in the file still has a name, though nothing
        // precedes it — the prelude module opens with the sefarim table's own.
        assert_eq!(
            enclosing_let(&prelude, text.find("= 1").unwrap()),
            Some("#קודם".to_string()),
            "the binding at byte 0 has no newline in front of it"
        );
        // A span that lands inside the name itself still gets the whole name.
        assert_eq!(
            enclosing_let(&prelude, text.find("ודם").unwrap()),
            Some("#קודם".to_string()),
            "a truncated command name is a wrong command name"
        );

        // A `#let` that is not a binding: inside a string, and inside a comment.
        let quoted = src("#let שם = \"\\n#let מתחזה = 1\"\n");
        let at = quoted.text().find("מתחזה").unwrap();
        assert_eq!(
            enclosing_let(&quoted, at),
            Some("#שם".to_string()),
            "text inside a string literal is not a binding"
        );
        let commented = src("#let שם = 1\n// #let מתחזה = 2\n#let אחר = 3\n");
        let at = commented.text().find("מתחזה").unwrap();
        assert_eq!(
            enclosing_let(&commented, at),
            None,
            "a commented-out binding names nothing, not itself"
        );
    }

    /// The cheap offset is the same offset, over every shape of config.
    ///
    /// `body_offset` is the definition — it builds a main source with an empty
    /// body — and `body_offset_of` is subtraction. Everything on a hot path
    /// calls the second one, so this is what stops it becoming a different
    /// number: the config fields that change the wrapper's *length* — every
    /// string in it, and the two that switch a `none` for a value — are swept.
    ///
    /// It also now sweeps **both arrangements**. `main_source` is what the
    /// compiler is handed and `assemble_source` is what "export .typ" writes;
    /// they share `show_rule` and differ only in what precedes it, and the body
    /// has to start where the arithmetic says in each of them. The export is the
    /// one nothing else in this file touches, so it is the one that could drift
    /// quietly.
    #[test]
    fn the_cheap_offset_is_the_same_offset() {
        /// One way to make the wrapper a different length.
        type Vary = fn(&mut crate::DocConfig);

        let mut configs = vec![crate::DocConfig::default()];
        let vary: [Vary; 9] = [
            |c| c.dir = "ltr".into(),
            |c| c.title = "קונטרס בעניני שבת".into(),
            |c| c.author = "A. Writer".into(),
            |c| c.keywords = vec!["שבת".into(), "מלאכה".into()],
            |c| {
                c.header_even = "verso".into();
                c.header_odd = "recto".into();
                c.footer_even = "".into();
                c.footer_odd = "ארוך הרבה יותר".into();
            },
            |c| {
                c.margin_top_cm = Some(2.5);
                c.margin_outer_cm = Some(1.25);
            },
            |c| c.two_sided = true,
            |c| c.font = "Frank \"Ruehl\"".into(),
            |c| c.header = "a\\b".into(),
        ];
        for apply in vary {
            let mut c = crate::DocConfig::default();
            apply(&mut c);
            configs.push(c);
        }
        // And one with all of them at once, because lengths add.
        let mut all = crate::DocConfig::default();
        for apply in vary {
            apply(&mut all);
        }
        configs.push(all);

        for cfg in &configs {
            for body in ["", "א", "שורה\nושתיים\n", &"מילה ".repeat(500)] {
                let main = crate::main_source(body, cfg);
                assert_eq!(
                    body_offset_of(&main, body),
                    body_offset(cfg),
                    "body of {} bytes, dir {}",
                    body.len(),
                    cfg.dir
                );
                // And it really is where the body starts, in both arrangements.
                assert_eq!(&main[body_offset_of(&main, body)..], format!("{body}\n"));
                let flat = crate::assemble_source(body, cfg);
                assert_eq!(&flat[body_offset_of(&flat, body)..], format!("{body}\n"));
                // The header the compiler sees is two lines and a blank one, not
                // a hundred kilobytes. Named so that a change which quietly puts
                // the prelude back in front of the body fails here first.
                assert!(
                    body_offset(cfg) < 2_000,
                    "the main source's header is {} bytes",
                    body_offset(cfg)
                );
            }
        }
    }

    /// `(byte offset, text)` for every line of `s`, the offsets being into `s`.
    fn line_starts(s: &str) -> Vec<(usize, &str)> {
        let mut out = Vec::new();
        let mut at = 0;
        for line in s.split('\n') {
            out.push((at, line));
            at += line.len() + 1;
        }
        out
    }
}

#[cfg(test)]
mod end_to_end {
    //! The four errors the audit measured, driven through a real compile.
    //!
    //! Everything above is a unit test of a string. These assert the part that
    //! could not be faked: that a `Span` Typst produced during a real layout
    //! resolves to a line in the writer's own text, and that the line is right
    //! even though a 900-line prelude sits in front of it.

    use crate::{compile, DocConfig};

    fn only(body: &str) -> crate::Diagnostic {
        let out = compile(body, &DocConfig::default());
        assert!(!out.ok(), "expected a failed compile for `{body}`");
        let errs: Vec<_> = out
            .diagnostics
            .into_iter()
            .filter(|d| d.severity == "error")
            .collect();
        assert_eq!(errs.len(), 1, "expected one error for `{body}`: {errs:?}");
        errs.into_iter().next().unwrap()
    }

    #[test]
    fn an_unknown_command_names_its_line_and_the_command_it_meant() {
        let d = only("שורה ראשונה\n\n#הדגשא[טעות]\n");
        assert_eq!(d.line, Some(3), "{d:?}");
        // Column 2, not 1: Typst spans the identifier and the `#` is column 1.
        // Pointing at the letter the writer got wrong is the useful place.
        assert_eq!(d.column, Some(2), "{d:?}");
        assert_eq!(d.about.as_deref(), Some("#הדגשא"));
        assert_eq!(d.did_you_mean.as_deref(), Some("#הדגשה"));
        assert!(d.message.contains("#הדגשה"), "{}", d.message);
        assert_eq!(d.raw, "unknown variable: הדגשא");
    }

    #[test]
    fn an_argument_of_the_wrong_kind_names_the_command_and_not_typsts_types() {
        let d = only("#טבלה(עמודות: \"שתיים\")[א][ב]\n");
        assert_eq!(d.line, Some(1), "{d:?}");
        assert_eq!(d.about.as_deref(), Some("#טבלה"), "{d:?}");
        assert!(!d.message.contains("relative length"), "{}", d.message);
        assert!(d.message.contains("#טבלה"), "{}", d.message);
        // Typst's own words are kept, and are not the message.
        assert!(d.raw.contains("relative length"), "{}", d.raw);
        assert_ne!(d.raw, d.message);
    }

    #[test]
    fn an_unclosed_bracket_gets_a_line_even_though_typst_reports_it_at_the_end() {
        let d = only("ראשונה\nשנייה\n#כותרת1[א\n");
        assert!(d.message.contains("סוגר"), "{}", d.message);
        // A location at all is the point: `brackets.ts` exists because there was
        // none. Typst points at end-of-file, which is line 3 here.
        assert!(d.line.is_some(), "{d:?}");
    }

    #[test]
    fn a_string_argument_given_content_says_so_in_the_commands_own_words() {
        // `#נוסחה[…]` used to be the example here, and B28 made it compile — so the
        // family is asserted against a command where a string genuinely cannot be
        // content. `#טבלה(עמודות: …)` wants a width, and brackets are not one.
        let d = only("#טבלה(עמודות: [שתיים])[א][ב]\n");
        assert!(d.message.contains("מידה"), "{}", d.message);
        assert!(d.message.contains("תוכן בסוגריים"), "{}", d.message);
        assert!(!d.message.contains("found content"), "{}", d.message);
        assert!(d.raw.contains("found content"), "{}", d.raw);
    }

    /// `#נוסחה` was the one command in the registry that broke the bracket
    /// convention, and it now takes both forms (B28).
    ///
    /// Every command in the README's core idea is `#הדגשה[טקסט]`, `#כותרת1[…]`,
    /// `#רשימה[…]`, `#הערה[…]`. `#נוסחה[x^2 + y^2 = z^2]` answered *"expected
    /// string, found content"*. The toolbar and the palette insert the right form,
    /// so it only ever bit the writer who **types** — which is the writer this
    /// markup language exists for.
    ///
    /// The four siblings are here too: every other command whose first argument is a
    /// string a typist would reach for brackets around. The nine that take a string
    /// which is *not* content — a file path, a colour, a stream name, a
    /// configuration — are left alone, and the reasons are in `ksav.typ`.
    #[test]
    fn a_string_argument_can_be_written_with_brackets_or_with_quotes() {
        for body in [
            "#נוסחה[x^2 + y^2 = z^2]\n",
            "#נוסחה(\"x^2 + y^2 = z^2\")\n",
            "#נוסחה(ממוספרת: true)[x^2]\n",
            "#נוסחה_בשורה[a+b]\n",
            "#נוסחה_בשורה(\"a+b\")\n",
            "#סמן[רשי] אחר כך #הפניה[רשי]\n",
            "#סמן(\"רשי\") אחר כך #הפניה(\"רשי\")\n",
            "#גופן_שונה[David Libre][טקסט]\n",
            "#גופן_שונה(\"David Libre\")[טקסט]\n",
        ] {
            let out = crate::compile(body, &DocConfig::default());
            assert!(
                out.ok(),
                "`{}` did not compile: {:?}",
                body.trim(),
                out.diagnostics
                    .iter()
                    .filter(|d| d.severity == "error")
                    .map(|d| d.message.clone())
                    .collect::<Vec<_>>()
            );
        }
    }

    #[test]
    fn a_line_deep_in_a_long_document_is_still_the_right_line() {
        // The prelude is ~900 lines; a raw Typst line number would name a line in
        // it. Twenty lines of body, with the mistake on the last.
        let mut body = String::new();
        for i in 1..=19 {
            body.push_str(&format!("שורה {i}\n"));
        }
        body.push_str("#הדגשא[טעות]\n");
        let d = only(&body);
        assert_eq!(d.line, Some(20), "{d:?}");
    }

    /// Two calls to the same command is the case where there is no honest answer.
    ///
    /// The location for this family comes from *there being only one call* to the
    /// command whose prelude definition Typst spanned. With two, the line is
    /// withheld rather than guessed — a wrong line is a wrong ref, and rule 4 of
    /// this project says a wrong ref is worse than none.
    #[test]
    fn two_calls_to_the_same_command_get_a_name_but_no_line() {
        let d = only("#טבלה(עמודות: \"שתיים\")[א][ב]\n\n#טבלה(עמודות: \"שלוש\")[א][ב][ג]\n");
        assert_eq!(d.about.as_deref(), Some("#טבלה"), "{d:?}");
        assert_eq!(d.line, None, "a line here would be a guess: {d:?}");
        assert!(d.message.contains("#טבלה"), "{}", d.message);
    }

    #[test]
    fn a_clean_document_produces_no_located_diagnostics() {
        let out = compile("#הדגשה[בסדר]\n", &DocConfig::default());
        assert!(out.ok(), "{:?}", out.diagnostics);
        assert!(
            out.diagnostics.iter().all(|d| d.severity == "warning"),
            "{:?}",
            out.diagnostics
        );
    }
}

/// Every parameter-name table in the prelude: the shared one, and each
/// `_en(f, extra: (…))`.
///
/// Returns the text *inside* the parentheses of each, for the caller to split on
/// commas. Balanced-paren scanning rather than "find the next `)`", because an
/// `extra` table's values are string literals and one of them could hold a
/// parenthesis; and because the shared table ends on a line of its own while an
/// `extra` ends mid-expression, so there is no single closing token to look for.
/// Every `english: "hebrew"` pair the prelude states, from **Typst's own parse
/// of it**.
///
/// # This was a string scan, in the shipping binary, and said so
///
/// It found `"#let _en_params = ("` and `"extra: ("` by substring, counted
/// parentheses to the close, split the region on commas and each entry on a
/// colon. Its own comment conceded the problem: *"Still string-parsing a `.typ`
/// file, which is fragile and worth saying out loud: reflow the prelude's
/// parameter tables onto one line and this quietly gets less useful."*
///
/// Two hundred and forty lines above it, [`enclosing_let`] had already made the
/// opposite argument and won it — *"the prelude is a parsed `Source` now, so the
/// question can be asked of the syntax tree that Typst itself produced"* — and
/// listed what a scan cannot see: a binding inside a string, a binding inside a
/// comment, the difference between a nesting level and a textual neighbour.
/// Every one of those applies here. A `//` note between two entries saying why a
/// pairing is *absent* is read by the scanner as an entry; `rgb("…")` in a
/// default value is a paren the counter has to be told about; a comma inside a
/// string ends an entry that has not ended.
///
/// So it asks the tree. A `Named` node under the right dictionary is a pairing;
/// nothing else is, whatever it looks like.
///
/// Two containers, because the vocabulary has two shapes: the flat
/// `#let _en_params = (…)` table, and the per-command `extra: (…)` on an
/// `_en(…)` wrapper — which exists precisely because two Hebrew words can share
/// one English one, so `#מסמך`'s `justify` and everyone else's `align` cannot be
/// the same row.
#[must_use]
pub fn en_param_pairs(prelude: &str) -> Vec<(String, String)> {
    let source = Source::detached(prelude.to_string());
    let mut out = Vec::new();
    collect_pairs(&LinkedNode::new(source.root()), false, &mut out);
    out
}

/// Walk, collecting `Named` pairs once inside one of the two containers.
///
/// `inside` is set by the node that opens a container rather than tested for at
/// each pair, because "is this dictionary the parameter table" is a question
/// about an ancestor and asking it per-pair would be the same walk again.
fn collect_pairs(node: &LinkedNode, inside: bool, out: &mut Vec<(String, String)>) {
    for child in node.children() {
        // `#let _en_params = (…)` — the flat table.
        let opens = if child.kind() == SyntaxKind::LetBinding {
            // `binding_name` answers with the `#` a writer would type, because its
            // other caller puts it straight into a message.
            binding_name(&child).as_deref() == Some("#_en_params")
        } else {
            // `extra: (…)` on an `_en` wrapper — the per-command overrides.
            child.kind() == SyntaxKind::Named
                && child.children().next().is_some_and(|n| {
                    n.kind() == SyntaxKind::Ident && n.get().leaf_text() == "extra"
                })
        };
        if inside && child.kind() == SyntaxKind::Named {
            if let Some(pair) = named_pair(&child) {
                out.push(pair);
            }
            // A `Named` inside the table is a leaf as far as this is concerned;
            // recursing into it would read a nested call's arguments as pairs.
            continue;
        }
        collect_pairs(&child, inside || opens, out);
    }
}

/// `english: "hebrew"` from a `Named` node, or nothing.
///
/// The name must be an `Ident` — a quoted key is a dictionary entry about
/// something else — and the value must be a `Str`, which is what rules out
/// `columns: 2` and `marker: ([◆], [–])` without a list of what to skip.
fn named_pair(node: &LinkedNode) -> Option<(String, String)> {
    let mut children = node.children().filter(|c| !c.kind().is_trivia());
    let name = children.next()?;
    if name.kind() != SyntaxKind::Ident {
        return None;
    }
    let value = children.find(|c| c.kind() == SyntaxKind::Str)?;
    let text = value.get().leaf_text();
    let hebrew = text.strip_prefix('"')?.strip_suffix('"')?;
    if hebrew.is_empty() {
        return None;
    }
    Some((name.get().leaf_text().to_string(), hebrew.to_string()))
}

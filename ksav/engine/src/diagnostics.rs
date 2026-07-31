//! Turning Typst's diagnostics into something a Ksav writer can act on.
//!
//! # Why this module exists
//!
//! `struct Diagnostic { severity, message }` had nowhere to put a location, so
//! nothing downstream could ever have one. `diag_messages` was handed Typst's own
//! `SourceDiagnostic` — span and all — appended the hints to the message and
//! threw the span away. A writer who mistyped a command got
//! `unknown variable: הדגשא` floating over a blank preview: no line, no column,
//! no *did you mean הדגשה?* even though the 104-entry registry that would answer
//! that question was sitting in memory two modules over.
//!
//! Four things were wrong at once and half of them fixed is worse than none, so
//! this module does all four:
//!
//! 1. **A location.** The prelude is prepended to every document, so a raw Typst
//!    line number would name a line the writer cannot see. `body_offset` is the
//!    byte at which the writer's own text begins, derived from the same
//!    `assemble_source` that built the string, so it cannot drift. A diagnostic
//!    that points into the prelude gets no line at all rather than a wrong one.
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
use typst::syntax::{DiagSpanKind, Source, Span, SpanKind};

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
}

/// Where the writer's own text starts inside an assembled source.
///
/// Assembling with an empty body gives prelude + wrapper + the trailing newline
/// that `assemble_source`'s format string puts after `{body}`. Both come off the
/// same format string, so this cannot drift out of step with it — which is the
/// whole reason it is computed rather than counted by hand.
pub fn body_offset(cfg: &crate::DocConfig) -> usize {
    crate::assemble_source("", cfg).len().saturating_sub(1)
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

/// The byte range a diagnostic's own span points at, in the assembled source.
fn diag_span_range(d: &SourceDiagnostic, source: &Source) -> Option<std::ops::Range<usize>> {
    match d.span.get() {
        DiagSpanKind::Detached => None,
        DiagSpanKind::Range { range, .. } => Some(range.start..range.end),
        DiagSpanKind::Number {
            num, sub_range, id, ..
        } => {
            // Only spans into the document itself can be resolved here; a span
            // into some other file is not a line the writer can be sent to.
            if id != source.id() {
                return None;
            }
            source.range(num, sub_range)
        }
    }
}

/// The byte range a plain `Span` points at — the shape a trace entry carries.
fn span_range(span: Span, source: &Source) -> Option<std::ops::Range<usize>> {
    match span.get() {
        SpanKind::Detached => None,
        SpanKind::Range { range, .. } => Some(range),
        SpanKind::Number { num, id } => {
            if id != source.id() {
                return None;
            }
            source.range(num, None)
        }
    }
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
    source: &Source,
    body_offset: usize,
) -> (Option<usize>, Option<String>) {
    let text = source.text();
    let body = &text[body_offset.min(text.len())..];
    let in_body =
        |r: std::ops::Range<usize>| (r.start >= body_offset).then(|| r.start - body_offset);

    let own = diag_span_range(d, source);
    if let Some(at) = own.clone().and_then(in_body) {
        return (Some(at), None);
    }
    // Innermost first in Typst's trace, so the last entry that lands in the body
    // is the writer's own call.
    for entry in d.trace.iter().rev() {
        if let Some(at) = span_range(entry.span, source).and_then(in_body) {
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
    // `#let`, and that `#let`'s name is the command the writer typed.
    let named = own
        .filter(|r| r.start < body_offset)
        .and_then(|r| enclosing_let(&text[..body_offset], r.start));

    // Second, the line — but only when it is not a guess. If the body calls that
    // command exactly once, that call is the only place this can have come from.
    // If it calls it twice, there is no honest answer and the writer gets none;
    // rule 4 of this project's own rules is that a wrong ref is worse than no ref,
    // and a wrong line is a wrong ref.
    let at = named.as_deref().and_then(|name| sole_call(body, name));
    (at, named)
}

/// The name of the `#let` binding a byte offset falls inside.
///
/// Scans back for the nearest `#let <name>(` — the prelude is a flat list of
/// them, so the nearest one before an offset is the one that contains it.
fn enclosing_let(prelude: &str, byte: usize) -> Option<String> {
    let upto = &prelude[..byte.min(prelude.len())];
    let at = upto.rfind("#let ")?;
    let rest = &upto[at + "#let ".len()..];
    let name: String = rest
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_')
        .collect();
    (!name.is_empty()).then(|| format!("#{name}"))
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
    let upto = &body[..byte.min(body.len())];
    let mut depth = 0i32;
    let bytes = upto.as_bytes();
    let mut i = bytes.len();
    while i > 0 {
        i -= 1;
        match bytes[i] {
            b')' => depth += 1,
            b'(' => {
                if depth == 0 {
                    // The name runs from here back to the `#`.
                    let head = &upto[..i];
                    let hash = head.rfind('#')?;
                    let name = &head[hash + 1..];
                    if name.is_empty() || !is_command_name(name) {
                        return None;
                    }
                    return Some(format!("#{name}"));
                }
                depth -= 1;
            }
            _ => {}
        }
    }
    None
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

    // ------------------------------------------------------------- the families
    let message = if lower.contains("unclosed delimiter") {
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

/// An assembled source, parsed, with the offset at which the writer's text starts.
///
/// One of these is made per compile and used for every diagnostic that compile
/// produces — warnings, errors, and the HTML path's — so a document cannot end up
/// with some of its diagnostics located and some not.
pub struct Located {
    source: Source,
    body_offset: usize,
}

impl Located {
    /// Parse an assembled source for the purpose of resolving spans.
    ///
    /// `Source::detached` is exactly what `typst-as-lib`'s `main_file(String)`
    /// builds, and `Source::new` numberizes the parse tree deterministically, so
    /// the span numbers Typst reports resolve against this copy. That is the whole
    /// trick: no access to Typst's `World` is needed, only the same bytes.
    pub fn of(assembled: &str, cfg: &crate::DocConfig) -> Self {
        Self {
            source: Source::detached(assembled.to_string()),
            body_offset: body_offset(cfg),
        }
    }

    /// Turn Typst's diagnostics into located, rephrased ones.
    pub fn all(&self, diags: &[SourceDiagnostic], severity: &str) -> Vec<Diagnostic> {
        located(diags, severity, &self.source, self.body_offset)
    }
}

/// Turn Typst's diagnostics into located, rephrased ones.
///
/// `source` is the assembled source Typst compiled — prelude, wrapper and body —
/// and `body_offset` is where the writer's own text begins inside it.
fn located(
    diags: &[SourceDiagnostic],
    severity: &str,
    source: &Source,
    body_offset: usize,
) -> Vec<Diagnostic> {
    let text = source.text();
    let body = &text[body_offset.min(text.len())..];
    diags
        .iter()
        .map(|d| {
            let mut raw = d.message.to_string();
            for hint in &d.hints {
                raw.push_str("\n  ↳ ");
                raw.push_str(&hint.v);
            }
            // The span, mapped into the writer's own text. A span that lands
            // before the body is a diagnostic about the prelude, and the honest
            // answer for it is no line at all rather than a line the writer
            // cannot see.
            let (at, named) = where_it_happened(d, source, body_offset);
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

    #[test]
    fn every_rephrasing_is_bilingual() {
        let raws = [
            "unknown variable: הדגשא",
            "unclosed delimiter",
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

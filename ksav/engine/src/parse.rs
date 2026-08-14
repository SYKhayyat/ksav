//! What Typst's own parser says a document is made of.
//!
//! # Why this exists
//!
//! `app/src/spans.ts` is a hand-written scanner. It has to be: `proseMode` is a
//! CodeMirror `StateField` whose decorations are derived from `EditorState`
//! *synchronously*, and `insertionAt` has to decide whether to write a `#`
//! inside the same click handler that dispatches the edit. Neither can await an
//! engine round trip, and a compile is 14–30 ms for one page and 5.6 s at 170.
//!
//! But "the editor cannot ask the engine" was only ever true of the **compiler**.
//! `typst::syntax::Source::detached` parses with no world, no fonts, no assets
//! and no layout, and it is already a direct dependency used by `diagnostics.rs`
//! and `jump.rs`. So the scanner cannot be replaced at runtime — and it can be
//! **checked**, offline, against the only authority there is.
//!
//! That check is `tests/scan_oracle.rs`, and it is the only mechanism in this
//! repository that would have caught the `(` bug, because it does not depend on
//! anybody thinking to type a parenthesis. The bug: a bare `(` in markup opened
//! *code* in the scanner, so `(רש"י)` — the commonest construction in the
//! language — put the gershayim into a string literal, and the speculative heal
//! rewrote the writer's document around a bracket that was never opened.
//!
//! # What is compared, and what deliberately is not
//!
//! The tempting claim is "the two agree at every offset". They do not, and they
//! should not: `#הדגשה[…]` puts `הדגשה` in a Typst `Ident` under `Code`, while
//! the scanner records a *head* and stays in content — it has no reason to model
//! the callee as code and every reason not to. A per-offset assertion would
//! drown in disagreements that are correct.
//!
//! So the oracle compares the four things where both sides make the same claim
//! and disagreement is always a bug. See `tests/scan_oracle.rs` for the
//! assertions; this module supplies the Typst half:
//!
//!   - **Text.** Every character Typst lexed as markup `Text` is prose. The
//!     scanner saying `code` there is the `(` bug's exact signature.
//!   - **Strings.** A `Str` node is a string literal and nothing else is. This
//!     is checked in *both* directions, and the reverse direction — the scanner
//!     claiming a string Typst does not have — is what actually fired.
//!   - **Comments.** `//` and `/* */`, exactly, both directions.
//!   - **Content blocks.** Every `[…]` Typst calls a `ContentBlock` must be a
//!     group the scanner found. Not the converse: a bare `[` in markup is
//!     literal `Text` to Typst and a (harmless, still-content) group to the
//!     scanner.
//!
//! # Not a service
//!
//! The report that asked for this asked for a `parse` **service** as the
//! vehicle. There is no client for one. Every runtime caller of the scanner is
//! on a path that cannot await, the engine is tree-shaken out of the browser
//! build entirely, and a service in the registry that only a test dispatches
//! through is precisely the half-wired surface the rest of that report is about.
//! The function is public, the oracle calls it directly, and if a caller that
//! can await ever appears, `services.rs` is four lines away.

use typst::syntax::{Source, SyntaxKind, SyntaxNode};

/// Which of Typst's three worlds a byte sits in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Markup. Prose, `*strong*`, list markers — `"` is a character here.
    Content,
    /// Code. `"` opens a string literal, `(` opens an argument list or an array.
    Code,
    /// Math, inside `$…$`. The scanner has no notion of it and does not need
    /// one; the oracle skips these ranges rather than pretending they agree.
    Math,
}

/// One leaf token, with the mode it was lexed in.
#[derive(Debug, Clone)]
pub struct Leaf {
    pub kind: SyntaxKind,
    /// Byte offsets into the text that was parsed.
    pub from: usize,
    pub to: usize,
    pub mode: Mode,
}

/// A `[…]` group Typst parsed as a content block: the range **inside** the
/// brackets, matching what the scanner calls a content group.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ContentBlock {
    pub from: usize,
    pub to: usize,
}

/// Everything the oracle needs from one parse.
#[derive(Debug, Clone, Default)]
pub struct Partition {
    pub leaves: Vec<Leaf>,
    pub content_blocks: Vec<ContentBlock>,
    /// Every raw region, backticks included.
    ///
    /// A *node*, not a leaf, which is why `of_kind(SyntaxKind::Raw)` finds
    /// nothing: Typst wraps the delimiters and the text inside a `Raw` and only
    /// its children reach `leaves`. The oracle needs the whole span, because
    /// what it is comparing is the region in which nothing is a command.
    pub raws: Vec<ContentBlock>,
}

/// The kinds that are markup's own children.
///
/// Read off `parser.rs`'s `markup_expr` rather than guessed: everything it eats
/// or wraps while the lexer is in markup mode. Anything else appearing under a
/// `Markup` node arrived through `embedded_code_expr`, which is to say after a
/// `#`, which is to say it is code.
///
/// `Hash` is here on purpose. The `#` itself belongs to the markup that hosts
/// it — the scanner agrees, because the frame a `#let` opens starts *at* the
/// hash and `ctxAt` treats a position at a frame's opener as outside it.
fn markup_native(kind: SyntaxKind) -> bool {
    use SyntaxKind::*;
    matches!(
        kind,
        Markup
            | Text
            | Space
            | Linebreak
            | Parbreak
            | Escape
            | Shorthand
            | SmartQuote
            | Strong
            | Emph
            | Raw
            | RawLang
            | RawDelim
            | RawTrimmed
            | Link
            | Label
            | Ref
            | RefMarker
            | Heading
            | HeadingMarker
            | ListItem
            | ListMarker
            | EnumItem
            | EnumMarker
            | TermItem
            | TermMarker
            | Equation
            | Hash
            | Shebang
            | Star
            | Underscore
            | LineComment
            | BlockComment
            | Error
            | End
    )
}

/// The mode a node establishes, given the mode it was reached in.
fn mode_of(kind: SyntaxKind, outer: Mode) -> Mode {
    match kind {
        // The three nodes that *are* a mode.
        SyntaxKind::Markup => Mode::Content,
        SyntaxKind::Code => Mode::Code,
        SyntaxKind::Math => Mode::Math,
        // A comment is lexed in whatever surrounds it and says nothing about
        // mode; classing it as code would make every `//` in prose a mismatch.
        SyntaxKind::LineComment | SyntaxKind::BlockComment => outer,
        // Anything under markup that markup does not itself produce got there
        // through `#`. `Math` mode is left alone: nothing below it is compared.
        _ if outer == Mode::Content && !markup_native(kind) => Mode::Code,
        _ => outer,
    }
}

/// Parse `text` and flatten it to leaves with modes, plus its content blocks.
///
/// Detached: no `FileId`, no world, no fonts. This is the parser alone, which
/// is the entire point — it is available in a test, in CI, and in principle
/// mid-keystroke, where a compile is not.
pub fn partition(text: &str) -> Partition {
    let source = Source::detached(text.to_string());
    let mut out = Partition::default();
    walk(source.root(), 0, Mode::Content, &mut out);
    out
}

fn walk(node: &SyntaxNode, at: usize, outer: Mode, out: &mut Partition) {
    let mode = mode_of(node.kind(), outer);
    if node.kind() == SyntaxKind::Raw {
        out.raws.push(ContentBlock {
            from: at,
            to: at + node.len(),
        });
    }
    if node.kind() == SyntaxKind::ContentBlock {
        // `[` and `]` are the first and last children; the group is what is
        // between them, which is the range `spans.ts` records.
        out.content_blocks.push(ContentBlock {
            from: at + 1,
            to: at + node.len() - 1,
        });
    }
    if node.children().len() == 0 {
        out.leaves.push(Leaf {
            kind: node.kind(),
            from: at,
            to: at + node.len(),
            mode,
        });
        return;
    }
    let mut cursor = at;
    for child in node.children() {
        walk(child, cursor, mode, out);
        cursor += child.len();
    }
}

impl Partition {
    /// Every leaf of one kind, in document order.
    pub fn of_kind(&self, kind: SyntaxKind) -> impl Iterator<Item = &Leaf> {
        self.leaves.iter().filter(move |l| l.kind == kind)
    }

    /// The comment ranges, both spellings, in document order.
    pub fn comments(&self) -> impl Iterator<Item = &Leaf> {
        self.leaves
            .iter()
            .filter(|l| matches!(l.kind, SyntaxKind::LineComment | SyntaxKind::BlockComment))
    }

    /// Whether any byte of `[from, to)` lies inside a `$…$`.
    ///
    /// The scanner has no math mode, so a range that is math to Typst is not a
    /// disagreement — it is a question the scanner was never asked.
    pub fn touches_math(&self, from: usize, to: usize) -> bool {
        self.leaves
            .iter()
            .any(|l| l.mode == Mode::Math && l.from < to && from < l.to)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn modes(text: &str) -> Vec<(String, Mode)> {
        partition(text)
            .leaves
            .into_iter()
            .filter(|l| !text[l.from..l.to].trim().is_empty())
            .map(|l| (text[l.from..l.to].to_string(), l.mode))
            .collect()
    }

    fn mode_at(text: &str, byte: usize) -> Mode {
        partition(text)
            .leaves
            .into_iter()
            .find(|l| l.from <= byte && byte < l.to)
            .map(|l| l.mode)
            .expect("every byte is in some leaf")
    }

    #[test]
    fn prose_is_content_and_a_bare_paren_does_not_change_that() {
        // The bug this whole module exists for. `(` in markup is a character.
        let text = "דברי (רש\"י) כאן";
        for (i, _) in text.char_indices() {
            assert_eq!(
                mode_at(text, i),
                Mode::Content,
                "byte {i} of {text:?} is not content"
            );
        }
        // And there is no string literal anywhere in it.
        assert_eq!(partition(text).of_kind(SyntaxKind::Str).count(), 0);
    }

    #[test]
    fn a_paren_after_a_hash_call_is_code_and_the_body_inside_it_is_not() {
        let text = "#רשימה(פריט[דברי (רש\"י) כאן])";
        let p = partition(text);
        // The gershayim is still not a string.
        assert_eq!(p.of_kind(SyntaxKind::Str).count(), 0);
        // The argument list is code...
        let paren = text.find('(').expect("a paren");
        assert_eq!(mode_at(text, paren + 1), Mode::Code);
        // ...and the content block inside it is not.
        let word = text.find("דברי").expect("the words");
        assert_eq!(mode_at(text, word), Mode::Content);
    }

    #[test]
    fn a_string_in_an_argument_list_is_a_string() {
        let text = "#סימן(\"א\", [דיני תפילה])";
        let p = partition(text);
        let strs: Vec<_> = p.of_kind(SyntaxKind::Str).collect();
        assert_eq!(strs.len(), 1, "{:?}", p.leaves);
        assert_eq!(&text[strs[0].from..strs[0].to], "\"א\"");
        assert_eq!(strs[0].mode, Mode::Code);
    }

    #[test]
    fn a_let_statement_is_code_to_the_end_of_its_line_and_not_past_it() {
        let text = "#let x = 1\nטקסט";
        assert_eq!(mode_at(text, 5), Mode::Code); // inside `let`
        let prose = text.find("טקסט").expect("the prose");
        assert_eq!(mode_at(text, prose), Mode::Content);
    }

    #[test]
    fn a_content_block_is_reported_by_its_inside() {
        let text = "#הדגשה[אלף]";
        let p = partition(text);
        assert_eq!(p.content_blocks.len(), 1);
        let b = p.content_blocks[0];
        assert_eq!(&text[b.from..b.to], "אלף");
    }

    #[test]
    fn a_bare_bracket_in_prose_is_text_and_not_a_content_block() {
        // The one asymmetry the oracle is built around: `spans.ts` records this
        // as a group, Typst calls it `Text`, and both are right about the mode.
        let text = "אלף [בית] גימל";
        let p = partition(text);
        assert!(p.content_blocks.is_empty(), "{:?}", p.content_blocks);
        assert!(modes(text).iter().all(|(_, m)| *m == Mode::Content));
    }

    #[test]
    fn math_is_its_own_world_and_is_marked_as_such() {
        let text = "טקסט $x^2 + 1$ עוד";
        let dollar = text.find('$').expect("a dollar");
        assert_eq!(mode_at(text, dollar + 1), Mode::Math);
        assert!(partition(text).touches_math(dollar, dollar + 3));
        assert!(!partition(text).touches_math(0, 4));
    }

    #[test]
    fn a_comment_takes_the_mode_it_was_written_in() {
        let text = "טקסט // הערה\nעוד";
        let p = partition(text);
        let c: Vec<_> = p.comments().collect();
        assert_eq!(c.len(), 1);
        assert_eq!(&text[c[0].from..c[0].to], "// הערה");
        assert_eq!(c[0].mode, Mode::Content);
    }

    #[test]
    fn every_byte_is_covered_exactly_once() {
        // The walk carries its own cursor, so an off-by-one in `len()`
        // arithmetic would silently shift every offset after it.
        for text in [
            "#רשימה(\n  פריט[ראשון],\n  פריט[שני],\n)",
            "#כותרת1[פרק] גוף $a$ // סוף\n",
            "טקסט#הערה[הערה פנימית] המשך.",
        ] {
            let p = partition(text);
            let mut at = 0;
            for l in &p.leaves {
                assert_eq!(l.from, at, "gap or overlap before {l:?} in {text:?}");
                at = l.to;
            }
            assert_eq!(at, text.len(), "leaves stop short in {text:?}");
        }
    }
}

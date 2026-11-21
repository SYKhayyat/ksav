//! What the document *calls*, as a question the compiler can answer.
//!
//! # Why this is a module of its own
//!
//! `calls_with_name` is the engine's only reader of Typst's syntax tree by
//! command name: it walks a parsed document for the calls a name refers to and
//! answers where each one is. `dangling_references` and the apparatus checks in
//! `lib.rs` are built on it, and nothing in the compile pipeline is. It sat two
//! thousand lines from the prelude it is about (`#222`).
//!
//! The italic question is the same shape of knowledge — what the *fonts* can do,
//! asked so the editor can tell a writer that `#נטוי` will print as upright rather
//! than doing it silently — so it lives here too, beside the walk that reports it.

use crate::bundled_fonts;

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
pub(crate) fn families_with_italic(fonts: &[&[u8]]) -> std::collections::BTreeSet<String> {
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
pub(crate) fn bundled_italic_families() -> &'static std::collections::BTreeSet<String> {
    static ONCE: std::sync::OnceLock<std::collections::BTreeSet<String>> =
        std::sync::OnceLock::new();
    ONCE.get_or_init(|| families_with_italic(&bundled_fonts()))
}

/// Where the **writer's own text** asks Typst for an italic face.
///
/// # What this used to be, and why it was wrong (#176)
///
/// It read the prelude for commands that ask for a slant — `#מקור` and the three
/// marks whose default style is italic — and warned for each one the writer
/// used. That was true when it was written: those commands passed
/// `style: "italic"` to `text()`, every bundled family has only Regular and
/// Bold, and Typst handed back the upright face in silence.
///
/// Then `_ks_style` arrived: the prelude now shears the frame into a synthetic
/// oblique (`_ks_skew` in `ksav.typ`), the five sites that ask for a slant all
/// reach it, and **no path in the prelude passes `style:` to `text()` any
/// more**. So the warning became a sentence about nothing — and it was not
/// rare: ten of the twelve bundled templates opened with it in the status strip,
/// before a keystroke, saying *"#מקור leaves the text upright"* about text that
/// was sheared on the page. A diagnostic the writer did nothing to cause, and
/// that is not true, is how a diagnostics strip stops being read.
///
/// # What is left
///
/// A *direct* request from the writer, which nothing in the product intercepts:
/// `#emph[…]` — Typst's own emphasis, not this prelude's `#נטוי` — and
/// `#text(style: "italic")[…]` written out by hand. Both still come back
/// upright in a Hebrew family, both are worth one sentence, and both are rare
/// enough that the sentence means something when it appears.
///
/// Through Typst's own parse rather than a search for the word, for the reason
/// `spans.ts` gives on the other side of the seam: a name inside a string
/// literal is not a call, and a warning about a command the writer never wrote
/// is worse than the silence it replaces.
pub(crate) fn first_italic(
    root: &typst::syntax::SyntaxNode,
    body: &str,
) -> Option<(usize, String)> {
    use typst::syntax::{LinkedNode, SyntaxKind};

    /// Is this call one of the two ways a writer asks Typst itself?
    fn asks(node: &LinkedNode, body: &str) -> Option<String> {
        let mut children = node.children();
        let callee = children.next()?;
        if callee.kind() != SyntaxKind::Ident {
            return None;
        }
        let name = callee.get().leaf_text().to_string();
        match name.as_str() {
            // `emph` and nothing else: `#נטוי`/`#italic` are the prelude's own
            // names for the shear, and they arrive here as their own idents.
            "emph" => Some(name),
            // The written-out form. The argument list is read as text because
            // the question is about a *named argument's value*, and a call whose
            // fourth argument is a string is not something to walk for.
            "text" => {
                let args = children.find(|c| c.kind() == SyntaxKind::Args)?;
                let said = &body[args.range()];
                let flat: String = said.split_whitespace().collect::<Vec<_>>().join(" ");
                let asks =
                    flat.contains("style: \"italic\"") || flat.contains("style: \"oblique\"");
                asks.then(|| "text(style: \"italic\")".to_string())
            }
            _ => None,
        }
    }

    fn walk(node: &LinkedNode, body: &str) -> Option<(usize, String)> {
        if node.kind() == SyntaxKind::FuncCall {
            if let Some(name) = asks(node, body) {
                return Some((node.offset(), name));
            }
        }
        node.children().find_map(|child| walk(&child, body))
    }

    walk(&LinkedNode::new(root), body)
}

/// Every call of `names` in the body, as (its first string argument, offset).
///
/// The pair `#סמן`/`#הפניה` needs both halves of the document to answer a
/// question about either of them, which is why this collects rather than
/// finding the first one.
pub(crate) fn calls_with_name(
    root: &typst::syntax::SyntaxNode,
    names: &[&str],
) -> Vec<(String, usize)> {
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

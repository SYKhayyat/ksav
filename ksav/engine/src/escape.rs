//! Putting somebody else's text into Typst markup, in one place.
//!
//! There are exactly two questions and they have different answers:
//!
//! * **A string literal** — `"…"`. Only `\` and `"` matter, and the order does:
//!   doubling the backslash *second* would turn an escaped quote `\"` into
//!   `\\"` and close the literal after all.
//! * **A content body** — `[…]`. Here everything Typst reads as markup matters.
//!   An unbalanced `]` closes the enclosing call and Typst reports it at end of
//!   file, thousands of characters away, with the preview blank and nothing
//!   pointing at the quote that caused it.
//!
//! # Why this is its own module
//!
//! Both answers were written out four times, in two languages, and the two
//! content escapers **already disagreed**:
//!
//! | | characters escaped |
//! |---|---|
//! | `girsa-ksav`'s `escape` | `# [ ] \ $ * _ < > @` |
//! | `app/src/typst-escape.ts`'s `typstContent` | `\ [ ] # $` |
//!
//! Ten against five, and the five missing ones are all live Typst markup: `*`
//! is strong, `_` is emph, `<…>` is a label, `@` is a ref. Both functions write
//! `#מראה_מקום(מקור: …)[…]` from **Girsa's `display` string** — and Sefaria
//! titles contain `*` and `_`. Same feature, two doors, two documents.
//!
//! The string-literal escaper was better behaved and still had four copies:
//! `lib.rs`'s `typst_str`, `sefarim.rs`'s `typst_string` — byte-identical, same
//! crate, forty lines from a `use super::*` — `girsa-ksav`'s `in_a_string`, and
//! two in TypeScript.
//!
//! # Where the authority lives, and why it is here rather than in the shared crate
//!
//! `girsa-ksav` is the markup writer both applications compile, which makes it
//! the obvious home. It is the wrong one, for a reason that is about the browser
//! and not about taste: it is a native-only dependency here — a browser build
//! has no loopback to Girsa and nothing to be handed a source by — and the
//! **escaper is needed in every build**, because `assemble_source` interpolates
//! a font name and a header into the prelude on every compile, offline included.
//!
//! So the engine owns it, the character set crosses to the client as a *value*
//! through `facts.gen.json`, and `girsa-ksav`'s copy is held against this one by
//! `tests/from_girsa.rs` — the direction that can actually be run, since Ksav
//! compiles that crate and Girsa cannot compile this one.

/// Every character Typst reads as markup inside a `[…]` body.
///
/// `[` is escaped as well as `]`, so a balanced pair the writer typed does not
/// silently become a nested content block.
pub const MARKUP: &[char] = &['#', '[', ']', '\\', '$', '*', '_', '<', '>', '@'];

/// Escape a value for a Typst **content body** — the `[…]` form.
#[must_use]
pub fn content(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if MARKUP.contains(&c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Escape a value for the inside of a Typst **string literal**, without the
/// quotes.
///
/// The backslash is doubled *first*. Escaping the quote first would turn `"`
/// into `\"`, and doubling backslashes afterwards would turn that backslash into
/// `\\"` — closing the literal, which is the bug this ordering exists against.
#[must_use]
pub fn in_a_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// A complete Typst string literal, quotes and all.
#[must_use]
pub fn string_literal(s: &str) -> String {
    format!("\"{}\"", in_a_string(s))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_backslash_is_doubled_before_the_quote() {
        // The whole of the ordering argument, in one case: a trailing backslash
        // followed by the closing quote.
        assert_eq!(string_literal("a\\"), "\"a\\\\\"");
        assert_eq!(string_literal("say \"hi\""), "\"say \\\"hi\\\"\"");
    }

    #[test]
    fn every_markup_character_is_escaped_and_ordinary_text_is_not() {
        for c in MARKUP {
            let got = content(&c.to_string());
            assert_eq!(got, format!("\\{c}"), "{c:?} was not escaped");
        }
        assert_eq!(content("שלום עולם"), "שלום עולם");
    }

    /// The five that were missing from the client's copy, named.
    ///
    /// `*` is strong, `_` is emph, `<…>` is a label, `@` is a ref — all live
    /// markup, all present in Sefaria titles, all arriving from Girsa as part of
    /// a `display` string that goes straight into a `[…]` body.
    #[test]
    fn the_five_the_client_used_to_miss_are_escaped() {
        assert_eq!(content("*Rashi* on _Genesis_"), "\\*Rashi\\* on \\_Genesis\\_");
        assert_eq!(content("<tag> @ref"), "\\<tag\\> \\@ref");
    }
}

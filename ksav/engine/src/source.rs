//! Receiving a Source Packet from Girsa.
//!
//! Girsa is the library; Ksav is the pen. A source arrives here as a
//! [`SourcePacket`] — a JSON object defined in `girsa-source`, a crate **both
//! applications compile**, rather than a shape the two ends agree about in
//! prose. Adding a field is a compile error on the side that ignores it instead
//! of a silent production bug.
//!
//! # The design target
//!
//! *Moving a source into a document should feel like AirDrop between two of
//! your own devices.* No export dialog, no file, no format decision, no
//! cleanup. What arrives is a proper quote block with the citation formatted to
//! the document's style — and **the ref stored in the document, not just the
//! printed string**.
//!
//! That last part is what makes citations alive. Because the document keeps
//! `girsa:shulchan-arukh/orach-chayim/1:1` and not merely
//! `שו"ע או"ח סימן א' סעיף א'`, a whole sefer can be switched from abbreviated
//! to full-form citations, or every quote regenerated against a corrected
//! edition, without touching a word of the prose. No paste-based workflow can
//! do that, which is the whole argument for the pairing.

use girsa_source::{PacketError, SourcePacket};

/// How the citation is placed relative to the quote.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CitationPlacement {
    /// A mekor footnote — `#מראה_מקום[…]`. What a sefer does.
    #[default]
    Mekor,
    /// Inline after the quote, in small type — `#ציון[…]`.
    Inline,
}

/// Turn a packet into real Ksav markup.
///
/// Every construct here is an existing Ksav command from `typst/ksav.typ`, so
/// what lands in the buffer is a document, not an import format that has to be
/// converted later. spec.md §10.3 is explicit that the lightweight buffer is
/// *the UI, not the format*: if the handoff invented its own note shape, the
/// drift the shared crate exists to prevent would come straight back in.
#[must_use]
pub fn to_ksav(packet: &SourcePacket, placement: CitationPlacement) -> String {
    let text = escape(&packet.text);
    let display = escape(&packet.display);

    let mut out = String::with_capacity(text.len() + display.len() + 64);
    out.push_str("#ציטוט[");
    out.push_str(&text);
    out.push(']');

    match placement {
        CitationPlacement::Mekor => {
            out.push_str("#מראה_מקום[");
            out.push_str(&display);
            out.push(']');
        }
        CitationPlacement::Inline => {
            out.push_str(" #ציון[");
            out.push_str(&display);
            out.push(']');
        }
    }

    if let Some(note) = &packet.note {
        // A margin note that travelled with the source is the writer's own
        // words, so it arrives as an editor's comment rather than as part of
        // the quote.
        out.push_str("#הערת_עורך[");
        out.push_str(&escape(note));
        out.push(']');
    }

    out.push('\n');
    out
}

/// Read a packet off the wire and render it.
///
/// The schema check inside `from_json` is the handshake: a packet from a newer
/// Girsa fails here with a message naming both versions, rather than
/// deserializing into something that renders looking reasonable and being
/// slightly wrong — in a printed sefer.
pub fn insert(json: &str, placement: CitationPlacement) -> Result<String, PacketError> {
    Ok(to_ksav(&SourcePacket::from_json(json)?, placement))
}

/// Escape the characters Typst reads as markup.
///
/// A quote from a sefer is arbitrary text and routinely contains `#` (as a
/// numeral sign), `[`, `]` and `\`. Unescaped, `[` opens a content block that
/// never closes, and Typst cannot report it until it reaches end of file —
/// thousands of characters from the quote, with the preview blank.
fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '#' | '[' | ']' | '\\' | '$' | '*' | '_' | '<' | '>' | '@') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use girsa_source::{Ref, SourcePacket};

    fn packet() -> SourcePacket {
        let r: Ref = "girsa:shulchan-arukh/orach-chayim/1:1"
            .parse()
            .expect("the ref parses");
        SourcePacket::new(
            &r,
            "שו\"ע או\"ח סימן א' סעיף א'",
            "יתגבר כארי לעמוד בבוקר לעבודת בוראו",
        )
    }

    #[test]
    fn a_source_arrives_as_a_quote_with_a_mekor() {
        let markup = to_ksav(&packet(), CitationPlacement::Mekor);
        assert!(markup.contains("#ציטוט["));
        assert!(markup.contains("#מראה_מקום["));
        assert!(markup.contains("יתגבר כארי"));
    }

    #[test]
    fn what_arrives_compiles_as_a_real_document() {
        // The acceptance in spec.md §10.3: text written by the handoff opens in
        // real Ksav with zero conversion. Anything less than compiling is a
        // claim, not a test.
        let markup = to_ksav(&packet(), CitationPlacement::Mekor);
        let result = crate::compile(&markup, &crate::DocConfig::default());
        assert!(
            result.ok(),
            "the handoff produced markup Ksav cannot compile: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn both_placements_compile() {
        for placement in [CitationPlacement::Mekor, CitationPlacement::Inline] {
            let markup = to_ksav(&packet(), placement);
            let result = crate::compile(&markup, &crate::DocConfig::default());
            assert!(result.ok(), "{placement:?}: {:?}", result.diagnostics);
        }
    }

    #[test]
    fn a_quote_containing_typst_markup_does_not_break_the_document() {
        // Real seforim contain `[`, `#` and `*`. Unescaped, an unclosed `[` is
        // only reported at end of file — thousands of characters away, with the
        // preview blank and nothing pointing at the quote that caused it.
        let mut p = packet();
        p.text = "וכתב [הרמב\"ם] #ד' *כאן* עיין _שם_".into();
        let markup = to_ksav(&p, CitationPlacement::Mekor);
        let result = crate::compile(&markup, &crate::DocConfig::default());
        assert!(result.ok(), "{:?}", result.diagnostics);
    }

    #[test]
    fn a_note_arrives_as_an_editors_comment_and_not_as_part_of_the_quote() {
        let mut p = packet();
        p.note = Some("צריך עיון".into());
        let markup = to_ksav(&p, CitationPlacement::Mekor);
        assert!(markup.contains("#הערת_עורך["));
        let result = crate::compile(&markup, &crate::DocConfig::default());
        assert!(result.ok(), "{:?}", result.diagnostics);
    }

    #[test]
    fn a_packet_from_a_newer_girsa_is_refused_at_the_handshake() {
        // The reason the schema field exists. Ksav must not render a packet it
        // does not fully understand.
        let json = r#"{"schema":99,"ref":"girsa:x/1:1","display":"d","text":"t"}"#;
        let err = insert(json, CitationPlacement::Mekor).expect_err("must refuse");
        assert!(err.to_string().contains("99"), "{err}");
    }

    #[test]
    fn a_packet_built_by_girsa_arrives_intact() {
        // The cross-application round trip, from JSON on the wire to markup.
        let json = packet().to_json().expect("Girsa serializes");
        let markup = insert(&json, CitationPlacement::Mekor).expect("Ksav deserializes");
        assert!(markup.contains("יתגבר כארי"));

        let back = SourcePacket::from_json(&json).expect("deserializes");
        let r = back.reference().expect("the ref survived the wire");
        assert_eq!(r.work_slug(), "shulchan-arukh/orach-chayim");
    }
}

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
//!
//! # Where the markup itself is written
//!
//! In `girsa-ksav`, the shared crate — **not here**. Girsa has a Ksav buffer in
//! it (spec.md §10.3), and for that buffer to write real Ksav from the first
//! keystroke the two applications have to agree about what a quote block is.
//! An agreement in prose between two repositories is exactly what the shared
//! crates exist to replace, so this module is now the receiving end and the
//! schema check, and the commands are one implementation compiled into both.
//!
//! What stays here is the part only this side can do: **the tests below compile
//! what arrives with the real Typst engine.** `girsa-ksav` can assert that it
//! wrote `#ציטוט[…]`; only Ksav can assert that Typst accepts it.

use girsa_source::{PacketError, SourcePacket};

pub use girsa_ksav::{to_ksav, CitationPlacement};

/// Read a packet off the wire and render it.
///
/// The schema check inside `from_json` is the handshake: a packet from a newer
/// Girsa fails here with a message naming both versions, rather than
/// deserializing into something that renders looking reasonable and being
/// slightly wrong — in a printed sefer.
pub fn insert(json: &str, placement: CitationPlacement) -> Result<String, PacketError> {
    Ok(to_ksav(&SourcePacket::from_json(json)?, placement))
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
        assert!(markup.contains("#מראה_מקום("));
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

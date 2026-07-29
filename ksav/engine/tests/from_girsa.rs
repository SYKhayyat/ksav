//! A Source Packet that **Girsa really produced**, landing on a Ksav page.
//!
//! The unit tests in `source.rs` build a packet by hand, which proves the
//! shape both applications compile agrees with itself. It cannot prove the
//! other half: that what the library actually puts on the clipboard is what
//! the pen actually reads. So the fixture beside this file is not written by
//! hand — it is the last line of
//!
//! ```sh
//! cargo run -p girsa-app --example send -- \
//!     corpus "שולחן ערוך, אורח חיים סימן א' סעיף ג'"
//! ```
//!
//! run against the real corpus, copied here verbatim. Regenerate it the same
//! way when the packet changes; a fixture nobody can reproduce is a fixture
//! that will be wrong quietly.
//!
//! And it asserts the page rather than the compile. Every apparatus bug this
//! project has had compiled cleanly and was wrong on the page.

use girsa_source::SourcePacket;
use ksav_engine::probe::{self, Line, TextRun};
use ksav_engine::source::{insert, CitationPlacement};
use ksav_engine::DocConfig;

/// Verbatim off Girsa's clipboard. See the module note.
const PACKET: &str = include_str!("fixtures/girsa-packet.json");

fn render(body: &str) -> Vec<TextRun> {
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::text_runs(&doc)
}

fn on_the_page(needle: &str, lines: &[Line]) -> bool {
    lines.iter().any(|l| l.contains(needle))
}

#[test]
fn a_source_from_girsa_arrives_as_a_quote_with_its_mekor_on_the_page() {
    let markup = insert(PACKET, CitationPlacement::Mekor).expect("Ksav reads Girsa's packet");
    let lines = probe::lines(&render(&markup), 1.0);

    // The words of the se'if.
    assert!(
        on_the_page("ראוי לכל ירא שמים", &lines),
        "the quote is not on the page: {:?}",
        lines.iter().map(Line::text).collect::<Vec<_>>()
    );
    // And the mekor, printed as Girsa printed it — one formatter, two
    // applications (spec.md §12).
    assert!(
        on_the_page("שולחן ערוך", &lines),
        "the citation is not on the page: {:?}",
        lines.iter().map(Line::text).collect::<Vec<_>>()
    );
}

#[test]
fn the_document_keeps_the_place_and_not_only_the_printed_string() {
    // The whole argument for the pairing (spec.md §10.2): because the ref
    // travels, a sefer can be re-styled or regenerated against a corrected
    // edition without touching the prose.
    let packet = SourcePacket::from_json(PACKET).expect("a packet");
    let reference = packet.reference().expect("the ref parses on this side");
    assert_eq!(reference.work_slug(), "shulchan-arukh/orach-chayim");
    assert_eq!(reference.from().to_string(), "1:3");
    assert_eq!(packet.display, "שולחן ערוך, אורח חיים סימן א' סעיף ג'");
}

#[test]
fn what_the_library_says_about_the_edition_is_still_here_when_it_is_printed() {
    // spec.md §13 — provenance costs nothing to carry and is the only thing
    // preserving the option to distribute publicly later.
    let packet = SourcePacket::from_json(PACKET).expect("a packet");
    assert!(
        packet.version.edition.contains("Lemberg"),
        "{:?}",
        packet.version
    );
    assert!(packet.version.provenance.contains("sefaria.org"));
}

#[test]
fn both_placements_of_a_real_packet_lay_out() {
    for placement in [CitationPlacement::Mekor, CitationPlacement::Inline] {
        let markup = insert(PACKET, placement).expect("reads");
        let lines = probe::lines(&render(&markup), 1.0);
        assert!(on_the_page("ראוי לכל ירא שמים", &lines), "{placement:?}");
    }
}

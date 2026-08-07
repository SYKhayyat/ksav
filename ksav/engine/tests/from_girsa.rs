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

mod common;
use common::{render};

use girsa_source::SourcePacket;
use ksav_engine::probe::{self, Line, TextRun};
use ksav_engine::source::{insert, CitationPlacement};
use ksav_engine::DocConfig;

/// Verbatim off Girsa's clipboard. See the module note.
const PACKET: &str = include_str!("fixtures/girsa-packet.json");

/// A buffer written in Girsa's own Ksav buffer (spec.md §10.3), by
///
/// ```sh
/// cargo run -p girsa-app --example write -- corpus personal ///     "השכמת הבוקר" "שולחן ערוך, אורח חיים סימן א' סעיף ג'"
/// ```
///
/// Copied here byte for byte. **No conversion step exists** — that is the
/// claim, and this is what checks it.
const BUFFER: &str = include_str!("fixtures/girsa-buffer.ksav");

fn on_the_page(needle: &str, lines: &[Line]) -> bool {
    lines.iter().any(|l| l.contains(needle))
}

/// There is one endpoint file per application per user — which is the right
/// design for the product, and means the two loopback tests are talking about
/// the same file. They take turns, in a scratch directory, so the suite never
/// touches the endpoint file of a Ksav somebody is actually running.
fn alone() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    static SCRATCH: std::sync::Once = std::sync::Once::new();
    SCRATCH.call_once(|| {
        let dir = std::env::temp_dir().join("ksav-loopback-tests");
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::create_dir_all(&dir);
        std::env::set_var("GIRSA_POST_HOME", &dir);
    });
    let guard = LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let _ = ksav_engine::post::drain();
    guard
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
fn half_a_se_if_says_which_half_and_the_page_does_not_show_it() {
    // The range is stored, not printed — the same bargain the ref makes. A
    // reader sees the citation; the document knows which characters of the
    // place were quoted, so regenerating against a corrected edition hands
    // back the half that was quoted and not the se'if around it.
    //
    // Only this side can check the half that matters: that `תווים:` is an
    // argument the **real Typst engine** accepts. `girsa-ksav` can assert it
    // wrote the string; a template that never learned the argument would fail
    // here, in the writer's preview, on every quote.
    let mut packet = SourcePacket::from_json(PACKET).expect("a packet");
    packet.range = Some(girsa_source::Range {
        from: 0,
        to: Some(9),
    });
    let json = packet.to_json().expect("serializes");
    let markup = insert(&json, CitationPlacement::Mekor).expect("Ksav reads it");
    assert!(
        markup.contains("תווים: \"0-9\""),
        "the range is not in the markup: {markup}"
    );

    let lines = probe::lines(&render(&markup), 1.0);
    assert!(
        on_the_page("שולחן ערוך", &lines),
        "the citation is not on the page: {:?}",
        lines.iter().map(Line::text).collect::<Vec<_>>()
    );
    // And the offsets are not. A document that printed `0-9` at the reader
    // would be showing them a number they never asked for.
    assert!(
        !on_the_page("0-9", &lines),
        "the range is being printed: {:?}",
        lines.iter().map(Line::text).collect::<Vec<_>>()
    );
}

#[test]
fn a_whole_se_if_is_still_written_the_way_it_always_was() {
    // Every document already on disk. If the whole-place case grew an
    // argument, every one of them would be a different string from what this
    // version writes, and `cited_in` would be reading two spellings.
    let packet = SourcePacket::from_json(PACKET).expect("a packet");
    assert!(packet.range.is_none() || packet.range.expect("some").is_all());
    let markup = insert(PACKET, CitationPlacement::Mekor).expect("Ksav reads it");
    assert!(!markup.contains("תווים"), "{markup}");
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
fn a_source_sent_over_the_loopback_arrives_and_is_ready_to_insert() {
    // The transport, end to end and through a real socket: Girsa's client, the
    // token, Ksav's desk, and the inbox the editor polls. What it does not
    // cross is a process boundary — but every line of code between the two
    // applications is the same as the one that would.
    let _alone = alone();
    let _desk = ksav_engine::post::open_desk("test").expect("the desk opens");
    assert!(
        girsa_post::presence(girsa_post::App::Ksav).is_live(),
        "Girsa would not offer to send: {:?}",
        girsa_post::presence(girsa_post::App::Ksav)
    );

    // Exactly what Girsa's `send_to_ksav` puts on the wire.
    girsa_post::send(girsa_post::App::Ksav, "/insert", Some(PACKET)).expect("Ksav takes it");

    let waiting = ksav_engine::post::drain();
    assert_eq!(waiting.len(), 1);
    assert!(waiting[0].markup.contains("ראוי לכל ירא שמים"));
    assert_eq!(waiting[0].display, "שולחן ערוך, אורח חיים סימן א' סעיף ג'");

    // And it is a document, not an import format: what the editor is about to
    // paste in compiles as it stands.
    let lines = probe::lines(&render(&waiting[0].markup), 1.0);
    assert!(on_the_page("ראוי לכל ירא שמים", &lines));
}

#[test]
fn a_stranger_on_the_machine_cannot_hand_ksav_a_source() {
    // Localhost is not private. Without the token — which lives in a file only
    // this user can read — the desk refuses before it looks at the path.
    let _alone = alone();
    let desk = ksav_engine::post::open_desk("test").expect("the desk opens");
    girsa_post::Endpoint {
        app: girsa_post::App::Ksav,
        port: desk.port(),
        token: "0".repeat(32),
        pid: 0,
        version: "test".into(),
    }
    .publish()
    .expect("publishes");

    match girsa_post::send(girsa_post::App::Ksav, "/insert", Some(PACKET)) {
        Err(girsa_post::PostError::Refused { status, .. }) => assert_eq!(status, 401),
        other => panic!("expected a refusal, got {other:?}"),
    }
    assert!(ksav_engine::post::drain().is_empty());
}

#[test]
fn a_buffer_written_in_girsa_opens_in_real_ksav_with_zero_conversion() {
    // spec.md §10.3's acceptance, from the other side. What Girsa's buffer
    // wrote is a Ksav document: a heading, a quote block, a mekor footnote and
    // a line of the writer's own — compiled here by the real Typst engine and
    // read off the page.
    let lines = probe::lines(&render(BUFFER), 1.0);
    for words in ["השכמת הבוקר", "ראוי לכל ירא שמים", "וצריך עיון"]
    {
        assert!(
            on_the_page(words, &lines),
            "{words:?} is not on the page: {:?}",
            lines.iter().map(Line::text).collect::<Vec<_>>()
        );
    }
    // And the mekor is a footnote, which is what a sefer does: it is set below
    // the text it hangs off rather than beside it.
    let quote = lines
        .iter()
        .find(|l| l.contains("ראוי לכל ירא שמים"))
        .expect("the quote");
    let mekor = lines
        .iter()
        .find(|l| l.contains("שולחן ערוך"))
        .expect("the mekor");
    assert!(
        mekor.runs.first().map(|r| r.y) > quote.runs.first().map(|r| r.y),
        "the mekor is not below the quote"
    );
}

#[test]
fn the_ref_is_in_the_document_and_the_mareh_mekomos_is_a_sort_and_a_print() {
    // spec.md §10.2 and §10.4. The document keeps `girsa:…/1:3`, printed
    // nowhere, and `#מראה_מקומות()` collects every citation that carried one
    // into a list at the back — cheap by construction, because the refs were
    // already there.
    assert!(
        BUFFER.contains("מקור: \"girsa:shulchan-arukh/orach-chayim/1:3\""),
        "the buffer does not keep the place: {BUFFER}"
    );

    let with_a_list = format!(
        "{BUFFER}
#מראה_מקומות(כותרת: [מראה מקומות])
"
    );
    let lines = probe::lines(&render(&with_a_list), 1.0);
    assert!(
        on_the_page("מראה מקומות", &lines),
        "no source list was printed"
    );

    // The citation appears twice now — once as the footnote where it was
    // cited, once in the list — and the list is at the end.
    let printed: Vec<&Line> = lines.iter().filter(|l| l.contains("שולחן ערוך")).collect();
    assert!(
        printed.len() >= 2,
        "the source list did not print the mekor"
    );
}

#[test]
fn both_placements_of_a_real_packet_lay_out() {
    for placement in [CitationPlacement::Mekor, CitationPlacement::Inline] {
        let markup = insert(PACKET, placement).expect("reads");
        let lines = probe::lines(&render(&markup), 1.0);
        assert!(on_the_page("ראוי לכל ירא שמים", &lines), "{placement:?}");
    }
}

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
use common::render;

use girsa_source::SourcePacket;
use ksav_engine::probe::{self, Line};
use ksav_engine::source::{insert, CitationPlacement};

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

/// The prelude as text, for the two tests below. Read from disk rather than
/// `include_str!`'d so an edit to the prelude does not need the engine rebuilt
/// before the check can see it.
fn prelude() -> String {
    std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/typst/ksav.typ"))
        .expect("read the prelude")
}

/// Is `name` bound by the prelude at all, under either spelling?
fn bound(prelude: &str, name: &str) -> bool {
    prelude
        .lines()
        .filter_map(|l| l.strip_prefix("#let "))
        .any(|rest| rest.starts_with(name) && rest[name.len()..].starts_with([' ', '(', '=']))
}

/// Girsa reads a Ksav document with Ksav's own names, in both spellings.
///
/// `girsa-ksav`'s reader is what puts a shelved document's *structure* on the
/// shelf — its headings become the levels of the address, its items and rows
/// become addressable text. It carries its own table of the forty-odd commands
/// that are structure, and it has to: putting Typst inside a library that
/// shelves a paragraph is not a trade anybody is making.
///
/// A private table in another repository is the shape this project keeps
/// getting wrong, so the check runs in the direction that is actually possible.
/// Ksav compiles `girsa-ksav` and Ksav owns the prelude, so **here** is where a
/// pair can be held against the thing that really binds both names. Girsa's
/// side cannot do this — it has no prelude — which is why the test lives in the
/// dependent rather than the dependency.
///
/// What it caught: nothing, at the time it was written. What it exists for is
/// that the reader matched **Hebrew names only** until this afternoon, and an
/// English sefer came off the shelf as an undifferentiated run of paragraphs —
/// no headings, no list items, no header row, every footnote spliced into the
/// middle of its sentence. Not an error anywhere; `Inline` is the right answer
/// for a name nobody knows.
#[test]
fn every_name_girsa_reads_is_a_name_the_prelude_binds() {
    let prelude = prelude();
    let mut missing = Vec::new();
    for (he, en) in girsa_ksav::ALIASES {
        if !bound(&prelude, he) {
            missing.push(format!("#let {he} — the Hebrew name is not in the prelude"));
        }
        // The English spelling, in the two forms the prelude writes it:
        // `#let h4 = כותרת4` for a plain rename, `#let mktable = _en(טבלה)`
        // where the parameters are renamed too.
        let plain = format!("#let {en} = {he}\n");
        let wrapped = format!("#let {en} = _en({he}");
        if !prelude.contains(&plain) && !prelude.contains(&wrapped) {
            missing.push(format!(
                "#let {en} = … {he} — the pair is not in the prelude"
            ));
        }
    }
    // The parameter names are a different table in the prelude — one dictionary
    // for the whole language rather than a binding each.
    for (he, en) in girsa_ksav::PARAM_ALIASES {
        if !prelude.contains(&format!("{en}: \"{he}\"")) {
            missing.push(format!("{en}: \"{he}\" — not in `_en_params`"));
        }
    }
    assert!(
        missing.is_empty(),
        "girsa-ksav's reader names {} thing(s) this prelude does not bind. \
         Either the prelude renamed a command and the reader now silently reads \
         it as body text, or the reader's table has a typo:\n  {}",
        missing.len(),
        missing.join("\n  ")
    );

    // A floor, or a table that lost its rows would pass by being empty — which
    // is the failure this whole sweep is named after.
    assert!(
        girsa_ksav::ALIASES.len() > 30,
        "the alias table has {} rows",
        girsa_ksav::ALIASES.len()
    );
}

/// Every refusal the post can make has a Hebrew sentence waiting for it.
///
/// `PostError` is the one error type that crosses between the two repositories,
/// and both frontends had to say something about it to a Hebrew reader. Both did
/// it by regular expression over the English `Display` — four
/// character-identical regexes in `Girsa/app/src/trouble.ts` and
/// `Ksav/app/src/diagnostics.ts` — which made every word of those strings
/// load-bearing API between two repositories, in the crate that exists so the
/// two sides need not agree in prose.
///
/// `PostError::code()` names them now. This is the half of the fence that lives
/// here: a code the crate can send and this application has no line for prints
/// English into a Hebrew UI, which is the original bug both `presence.ts` and
/// `trouble.ts` cite as their reason for existing.
///
/// It reads TypeScript as text, and that is the right instrument for once:
/// what it checks is *membership*, so it can only ever produce a loud refusal,
/// never a wrong value — the same argument `app/tools/facts.mjs` makes for
/// counting `cmd!(` in Rust source.
#[test]
fn every_post_error_code_has_a_sentence_in_the_editor() {
    use girsa_post::PostError;
    let src = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../app/src/diagnostics.ts"
    ))
    .expect("read diagnostics.ts");
    let missing: Vec<&str> = PostError::CODES
        .iter()
        .copied()
        .filter(|c| !src.contains(&format!("\"{c}\"")))
        .collect();
    assert!(
        missing.is_empty(),
        "girsa-post can send {missing:?} and app/src/diagnostics.ts has no line \
         for it — a reader would be shown the English."
    );
    assert!(
        !PostError::CODES.is_empty(),
        "PostError::CODES is empty, so this test passes by checking nothing"
    );

    // And the codes really are what the messages lead with, so the editor's
    // `codeOf` — which splits on the first `": "` — finds them.
    let e = PostError::NotRunning(girsa_post::App::Girsa);
    assert_eq!(e.code(), Some("post-not-running"));
    assert!(e.to_string().starts_with("post-not-running: "), "{e}");
}

/// Both doors into a citation escape the same characters.
///
/// A place lands in a Ksav document two ways: Girsa hands over a packet and
/// `girsa_ksav::to_ksav` renders it, or the writer picks a hit in the Mekoros
/// panel and `citation.ts` writes it. Same feature, same `display` string off
/// the same corpus, and the two escapers had **ten characters against five**.
/// The five the editor was missing — `*` strong, `_` emph, `<`/`>` a label, `@`
/// a ref — are all live Typst markup and all occur in Sefaria titles, so the two
/// doors produced two different documents for one source.
///
/// The list lives in `engine/src/escape.rs` rather than in the shared crate,
/// because a browser build has no loopback to Girsa and so does not compile
/// `girsa-ksav` — but it does interpolate a font name into the prelude on every
/// compile. This is the fence that keeps the two in step, in the direction that
/// can be run.
#[test]
fn the_two_doors_into_a_citation_escape_the_same_characters() {
    use ksav_engine::escape;
    assert_eq!(
        escape::MARKUP,
        girsa_ksav::MARKUP,
        "the engine and girsa-ksav disagree about what Typst reads as markup"
    );
    // …and the two functions really do use their lists, rather than agreeing
    // about a constant neither of them reads.
    let nasty: String = escape::MARKUP.iter().collect();
    assert_eq!(
        escape::content(&nasty),
        girsa_ksav::escape(&nasty),
        "the two escapers disagree on the characters they both claim to escape"
    );
    // The title that made this findable.
    assert_eq!(
        escape::content("*Rashi* on _Genesis_"),
        girsa_ksav::escape("*Rashi* on _Genesis_")
    );
}

/// The buffer Girsa wrote reads back as the document it is.
///
/// The pairing above is a name check; this is the claim. `BUFFER` is a real
/// Ksav document written by Girsa's own buffer, and reading it has to produce a
/// heading, a quote and a mekor note — the three things a shelf address is
/// built out of. It compiles two files above; here it is read.
#[test]
fn the_buffer_girsa_wrote_reads_back_with_its_structure_intact() {
    use girsa_ksav::{Block, NoteKind};
    let blocks = girsa_ksav::read(BUFFER);
    assert!(
        blocks
            .iter()
            .any(|b| matches!(b, Block::Heading { text, .. } if text.contains("השכמת הבוקר"))),
        "the heading did not come back as a heading: {blocks:#?}"
    );
    assert!(
        blocks
            .iter()
            .any(|b| matches!(b, Block::Quote(t) if t.contains("ראוי לכל ירא שמים"))),
        "the quote did not come back as a quote: {blocks:#?}"
    );
    assert!(
        blocks.iter().any(|b| matches!(
            b,
            Block::Note { kind: NoteKind::Mekor, text, .. } if text.contains("שולחן ערוך")
        )),
        "the mekor did not come back as a citation: {blocks:#?}"
    );
}

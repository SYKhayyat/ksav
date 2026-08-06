//! Rendered-output tests for the two indexes.
//!
//! An index is a claim about *page numbers*, and a page number is a fact about
//! the finished layout. There is no version of this that a compile check can
//! test: an index that lists every term under page 1 compiles perfectly. So
//! every assertion here reads the laid-out document and asks what is printed
//! where, in what order.
//!
//! The two things worth watching, because they are the two things a
//! general-purpose indexer gets wrong in Hebrew:
//!
//!   · A term must sort by its *letters*. The gershayim is U+05F4, above every
//!     Hebrew letter, so a raw sort exiles every abbreviated term past the end
//!     of its own letter's run.
//!   · A masechta must sort where it sits in Shas. Alphabetically בבא בתרא
//!     comes before בבא מציעא; in Shas it comes after.

use ksav_engine::probe::{self, TextRun};
use ksav_engine::DocConfig;

fn render(body: &str) -> Vec<TextRun> {
    render_with(body, &DocConfig::default())
}

fn render_with(body: &str, cfg: &DocConfig) -> Vec<TextRun> {
    let doc = probe::layout(body, cfg).unwrap_or_else(|d| panic!("compile failed: {d:?}"));
    probe::text_runs(&doc)
}

/// Everything printed, in layout order, as one string.
///
/// Runs are joined without separators because Typst breaks a line into runs at
/// shaping boundaries — a page number and its entry can arrive as three runs —
/// and any separator would break the `contains` assertions that matter.
fn all_text(runs: &[TextRun]) -> String {
    runs.iter().map(|r| r.text.as_str()).collect()
}

/// Where `needle` first appears in the printed order, for asserting that one
/// entry comes before another.
fn position_of(runs: &[TextRun], needle: &str) -> usize {
    let text = all_text(runs);
    text.find(needle)
        .unwrap_or_else(|| panic!("{needle:?} was never printed. Page reads: {text}"))
}

/// Everything printed from `heading` onwards — the index and nothing before it.
///
/// Ordering assertions have to be made inside this and not over the whole
/// document, because a citation *prints where it was written*: searching the
/// document for בבא בתרא finds the citation on page 1, not the index entry at
/// the back, and every ordering test then passes or fails on the order the
/// writer happened to cite things in.
fn index_text(runs: &[TextRun], heading: &str) -> String {
    all_text(runs)[position_of(runs, heading)..].to_string()
}

fn assert_order(index: &str, entries: &[&str]) {
    let mut last = 0usize;
    let mut last_name = "the heading";
    for entry in entries {
        let at = index
            .find(entry)
            .unwrap_or_else(|| panic!("{entry:?} is missing from the index: {index}"));
        assert!(
            at > last,
            "{entry:?} should print after {last_name:?}, but landed at {at} and {last}\n{index}"
        );
        last = at;
        last_name = entry;
    }
}

/// Three pages, so a page number is a real answer and not always 1.
fn across_pages(mark: &dyn Fn(usize) -> String, tail: &str) -> String {
    let mut out = String::new();
    for page in 1..=3 {
        out.push_str(&mark(page));
        out.push_str("\n\n#מעבר_עמוד\n\n");
    }
    out.push_str(tail);
    out
}

// ── the topic index ──────────────────────────────────────────────────────────

#[test]
fn a_topic_index_prints_its_terms_with_their_pages() {
    let body = across_pages(
        &|p| match p {
            1 => "#ערך(\"שבת\")[מלאכת בורר] ועוד דברים.".to_string(),
            2 => "#ערך(\"תפילין\")[הנחת תפילין] בבוקר.".to_string(),
            _ => "#ערך(\"שבת\")[הדלקת נרות] בערב.".to_string(),
        },
        "#מפתח_ענינים(טורים: 1)",
    );
    let runs = render(&body);
    let text = all_text(&runs);
    // The marked words print where they were written — the writer does not type
    // the term twice.
    assert!(
        text.contains("מלאכת בורר"),
        "the marked phrase should print: {text}"
    );
    assert!(
        text.contains("מפתח הענינים"),
        "the index heading should print"
    );
    // שבת was marked on pages 1 and 3, תפילין only on 2.
    let idx = index_text(&runs, "מפתח הענינים");
    assert!(idx.contains("שבת"), "שבת should be in the index: {idx}");
    assert!(
        idx.contains("תפילין"),
        "תפילין should be in the index: {idx}"
    );
    assert!(
        idx.contains("1, 3") || idx.contains("3, 1"),
        "שבת was marked on pages 1 and 3 and should say so: {idx}"
    );
}

#[test]
fn consecutive_pages_collapse_into_a_range() {
    // The difference between an index and a list of numbers.
    let body = across_pages(
        &|_| "#ערך(\"ברכות\")[ברכת המזון]".to_string(),
        "#מפתח_ענינים(טורים: 1)",
    );
    let runs = render(&body);
    let idx = index_text(&runs, "מפתח הענינים");
    assert!(
        idx.contains("1–3"),
        "pages 1, 2, 3 should print as a range: {idx}"
    );
}

#[test]
fn a_term_sorts_by_its_letters_and_not_by_its_punctuation() {
    // The gershayim is U+05F4, which sits *above every Hebrew letter* in code
    // point order. Sorted raw, an abbreviated term is exiled past the end of its
    // own letter's run — ר״ה would file after רשות and after everything else
    // beginning with ר, which is the last place a reader would look for it.
    let body = "\
#ערך(\"רשות\")[א] #ערך(\"ר״ה\")[ב] #ערך(\"רבים\")[ג]

#מפתח_ענינים(טורים: 1)";
    let runs = render(body);
    let idx = index_text(&runs, "מפתח הענינים");
    // רבים · ר״ה · רשות — sorted on ב, then ה, then ש. The mark is not a letter.
    assert_order(&idx, &["רבים", "ר״ה", "רשות"]);
}

#[test]
fn terms_are_in_hebrew_alphabetical_order() {
    let body = "\
#ערך(\"קידוש\")[א] #ערך(\"סוכה\")[ב] #ערך(\"נר\")[ג] #ערך(\"אתרוג\")[ד]

#מפתח_ענינים(טורים: 1)";
    let runs = render(body);
    assert_order(
        &index_text(&runs, "מפתח הענינים"),
        &["אתרוג", "נר", "סוכה", "קידוש"],
    );
}

#[test]
fn sub_entries_sit_under_their_term() {
    let body = "\
#ערך(\"שבת\", תת: \"בורר\")[א]

#מעבר_עמוד

#ערך(\"שבת\", תת: \"אופה\")[ב]

#מפתח_ענינים(טורים: 1)";
    let runs = render(body);
    // One heading, two sub-entries under it, alphabetical: אופה before בורר.
    let text = all_text(&runs);
    assert_eq!(
        text.matches("שבת").count(),
        1,
        "the term should print once, not once per sub-entry: {text}"
    );
    assert_order(&index_text(&runs, "מפתח הענינים"), &["שבת", "אופה", "בורר"]);
}

#[test]
fn an_index_of_nothing_prints_nothing() {
    // Not an empty heading over an empty list. A sefer with no marked terms
    // should not grow a page that says "Index" and stops.
    let runs = render("סתם טקסט בלי שום ערך.\n\n#מפתח_ענינים()");
    assert!(!all_text(&runs).contains("מפתח הענינים"));
}

#[test]
fn the_index_follows_the_documents_own_page_numbering() {
    // A sefer numbered א,ב,ג gets a Hebrew index, with nothing to configure.
    let cfg = DocConfig {
        hebrew_numbering: true,
        ..DocConfig::default()
    };
    // Text before the break, because `#מעבר_עמוד` is a *weak* pagebreak: at the
    // top of a document there is nothing to break away from and it does nothing,
    // which quietly put the mark back on page 1 and made this test assert
    // nothing at all.
    let body = "\
פתיחה.

#מעבר_עמוד

#ערך(\"גמרא\")[סוגיא דידן]

#מפתח_ענינים(טורים: 1)";
    let runs = render_with(body, &cfg);
    let idx = index_text(&runs, "מפתח הענינים");
    // The mark is on the second page, and the second page of a Hebrew-numbered
    // sefer is ב. Nothing in the index was configured to say so.
    assert!(
        idx.contains("גמרא ב") || idx.ends_with("ב"),
        "page 2 of a Hebrew-numbered sefer is ב, not 2: {idx}"
    );
    assert!(
        !idx.contains("2"),
        "an Arabic 2 has no business here: {idx}"
    );
}

// ── the source index ─────────────────────────────────────────────────────────

#[test]
fn a_citation_prints_in_one_spelling_however_it_was_typed() {
    // The copy-editing pass nobody has time for: ב״ב on one page and
    // בבא בתרא on another are one masechta and print as one name.
    let runs = render("#ציון_מקור(\"ב״ב\", מקום: \"ג.\") ו#ציון_מקור(\"בבא בתרא\", מקום: \"ד:\")");
    let text = all_text(&runs);
    assert!(
        text.contains("בבא בתרא ג."),
        "expected the canonical name: {text}"
    );
    assert!(
        !text.contains("ב״ב "),
        "the abbreviation should not print: {text}"
    );
}

#[test]
fn the_source_index_sorts_in_shas_order_and_not_the_alphabet() {
    // The flagship claim. Alphabetically בבא בתרא comes first (ב before מ and ק);
    // in Shas the order is קמא, מציעא, בתרא. No general indexer can do this.
    let body = "\
#ציון_מקור(\"ב״ב\", מקום: \"ג.\")
#ציון_מקור(\"ב״ק\", מקום: \"ב.\")
#ציון_מקור(\"ב״מ\", מקום: \"ה:\")

#מפתח_מקורות(טורים: 1)";
    let runs = render(body);
    assert_order(
        &index_text(&runs, "מפתח המקורות"),
        &["בבא קמא", "בבא מציעא", "בבא בתרא"],
    );
}

#[test]
fn tanach_precedes_shas_precedes_the_poskim() {
    let body = "\
#ציון_מקור(\"או״ח\", מקום: \"סי׳ א\")
#ציון_מקור(\"ברכות\", מקום: \"ב.\")
#ציון_מקור(\"בראשית\", מקום: \"א, א\")

#מפתח_מקורות(טורים: 1)";
    let runs = render(body);
    // Each sefer under its own group heading, and the groups in their own order.
    assert_order(
        &index_text(&runs, "מפתח המקורות"),
        &["תנ״ך", "בראשית", "משנה וגמרא", "ברכות", "הלכה", "אורח חיים"],
    );
}

#[test]
fn dapim_sort_by_gematria_and_then_by_amud() {
    // ב. < ב: < ג. — the ordering a reader expects, and the one a plain string
    // sort of those three does not give.
    let body = "\
#ציון_מקור(\"שבת\", מקום: \"ג.\")
#ציון_מקור(\"שבת\", מקום: \"ב:\")
#ציון_מקור(\"שבת\", מקום: \"ב.\")
#ציון_מקור(\"שבת\", מקום: \"קיג.\")

#מפתח_מקורות(טורים: 1)";
    let runs = render(body);
    let idx = index_text(&runs, "מפתח המקורות");
    let order: Vec<usize> = ["ב.", "ב:", "ג.", "קיג."]
        .iter()
        .map(|p| {
            idx.find(p)
                .unwrap_or_else(|| panic!("{p} missing from {idx}"))
        })
        .collect();
    assert!(
        order.windows(2).all(|w| w[0] < w[1]),
        "dapim out of order in: {idx}"
    );
}

#[test]
fn a_sefer_the_catalogue_never_heard_of_still_gets_indexed() {
    // Dropped citations would be the worst possible failure here: the index
    // would look complete and be missing exactly the sefarim the writer cared
    // enough about to cite by name.
    let body = "\
#ציון_מקור(\"שו״ת נודע ביהודה\", מקום: \"מהדו״ת סי׳ י\")
#ציון_מקור(\"ברכות\", מקום: \"ב.\")

#מפתח_מקורות(טורים: 1)";
    let runs = render(body);
    let text = all_text(&runs);
    assert!(text.contains("נודע ביהודה"), "it must appear: {text}");
    // After everything the catalogue does know, where a reader will look for it.
    assert_order(
        &index_text(&runs, "מפתח המקורות"),
        &["ברכות", "נודע ביהודה"],
    );
}

#[test]
fn one_masechta_gathers_all_its_dapim_under_one_heading() {
    let body = "\
#ציון_מקור(\"ברכות\", מקום: \"ב.\")

#מעבר_עמוד

#ציון_מקור(\"ברכות\", מקום: \"ג.\")

#מפתח_מקורות(טורים: 1)";
    let runs = render(body);
    let idx = index_text(&runs, "מפתח המקורות");
    assert_eq!(
        idx.matches("ברכות").count(),
        1,
        "the masechta should head its dapim once: {idx}"
    );
}

#[test]
fn an_empty_source_index_prints_nothing() {
    let runs = render("טקסט בלי מקורות.\n\n#מפתח_מקורות()");
    assert!(!all_text(&runs).contains("מפתח המקורות"));
}

#[test]
fn both_indexes_can_stand_in_one_document() {
    // They query different labels, so neither should see the other's marks.
    let body = "\
#ערך(\"עירוב\")[דיני עירוב] ו#ציון_מקור(\"עירובין\", מקום: \"ב.\")

#מפתח_ענינים(טורים: 1)
#מפתח_מקורות(טורים: 1)";
    let runs = render(body);
    let text = all_text(&runs);
    assert!(text.contains("מפתח הענינים") && text.contains("מפתח המקורות"));
    let topics = &text[position_of(&runs, "מפתח הענינים")..position_of(&runs, "מפתח המקורות")];
    assert!(topics.contains("עירוב"), "the topic belongs here: {topics}");
    assert!(
        !topics.contains("עירובין ב."),
        "the citation does not belong in the topic index: {topics}"
    );
}

#[test]
fn the_prelude_folds_a_name_the_way_the_engine_did() {
    // The one duplicated rule in this feature: the engine folds spellings when
    // it generates the catalogue, the prelude folds the writer's input before
    // looking it up, and the two are separate implementations in separate
    // languages. This is the check that they agree — on the page, where it
    // matters, rather than on two unit tests that could both be self-consistent
    // and disagree with each other.
    for spelling in ["ב״ב", "ב\"ב", "ב׳׳ב", "בבא בתרא", "  בבא   בתרא  "] {
        // The ASCII double quote has to be escaped on its way into a Typst string
        // literal, or the argument ends halfway through the masechta and the
        // failure is a parse error about brackets rather than anything to do with
        // folding. That is Typst's syntax and not this feature's problem — but a
        // test that cannot express the case is not testing it.
        let escaped = spelling.replace('"', "\\\"");
        let runs = render(&format!("#ציון_מקור(\"{escaped}\", מקום: \"ג.\")"));
        let text = all_text(&runs);
        assert!(
            text.contains("בבא בתרא"),
            "{spelling:?} should resolve to בבא בתרא, printed: {text}"
        );
    }
    // And a maqaf where a space would do — the fold that U+05BE being inside the
    // Hebrew points range quietly broke.
    let runs = render("#ציון_מקור(\"ראש־השנה\", מקום: \"ב.\")");
    assert!(all_text(&runs).contains("ראש השנה"));
}

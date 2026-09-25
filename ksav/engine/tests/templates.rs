//! What a writer gets when they pick a template — read off the page.
//!
//! Ten templates demonstrated **eight of 115 commands** between them. Five used
//! nothing at all; four used a plain footnote; `sefer.ksav` used `#מראה_מקום`
//! without `מקור:`, so it filed nothing, and the file had no `#מפתח_מקורות()`
//! in it to file into. Zero used any note arrangement past the ordinary
//! footnote. So the one differentiated thing in this product — the apparatus
//! that `spec.md` is about, that `README-notes.md` is about, that 677 lines of
//! `apparatus.rs` hold — was demonstrated from no starting point a writer can
//! reach. A bochur who picked "ספר" got footnotes and a horizontal rule.
//!
//! Two templates were rewritten and two added. This is what holds them.
//!
//! **Probed, never `ok()`ed**, and `README-notes.md:7-17` is unambiguous about
//! why: every apparatus bug this project has had compiled cleanly and was wrong
//! on the page. A template that "compiles" is a template that may be rendering
//! its commentary on top of the page number. So each of these asks where the
//! words landed.

use ksav_engine::probe::{self, TextRun};
use ksav_engine::templates::template_body;
use ksav_engine::DocConfig;

fn render(id: &str) -> Vec<TextRun> {
    laid_out(id).0
}

/// The runs **and** the page sizes from **one** layout.
///
/// One, and that matters: laying the same template out twice and reading runs
/// from the first and sizes from the second gave a run on page 1 against a
/// one-page document. Two compiles of one apparatus document are not guaranteed
/// to agree — convergence is a property this apparatus works hard for and does
/// not get for free — so anything comparing a position to a page reads both from
/// the same layout.
fn laid_out(id: &str) -> (Vec<TextRun>, Vec<(f64, f64)>) {
    let body = template_body(id).unwrap_or_else(|| panic!("no template {id:?}"));
    let doc = probe::layout(body, &DocConfig::default())
        .unwrap_or_else(|d| panic!("template {id:?} does not compile: {d:?}"));
    (probe::text_runs(&doc), probe::page_sizes(&doc))
}

/// Where a phrase printed.
///
/// **A phrase is not always a run.** A slanted one is sheared word by word and
/// every sheared word is a box of its own, so the gemara template's second band —
/// which ships italic, like every tier below the first — has no run holding a
/// sentence. Asking the run alone said the words were not on the page while they
/// were plainly on it at y=761.83.
///
/// So the line is asked when the run cannot answer, and the line's first run is
/// what comes back: every run of a phrase is on the same line at the same size,
/// which is all any caller here reads off it.
fn find<'a>(runs: &'a [TextRun], needle: &str) -> &'a TextRun {
    if let Some(r) = runs.iter().find(|r| r.text.contains(needle)) {
        return r;
    }
    let line = probe::lines(runs, 1.0)
        .into_iter()
        .find(|l| l.contains(needle))
        .unwrap_or_else(|| panic!("{needle:?} is not on the page"));
    let first = line.runs.first().expect("a line has a run").clone();
    runs.iter()
        .find(|r| r.page == first.page && r.y == first.y && r.x == first.x)
        .expect("the line's own run")
}

fn has(runs: &[TextRun], needle: &str) -> bool {
    runs.iter().any(|r| r.text.contains(needle))
        || probe::lines(runs, 1.0).iter().any(|l| l.contains(needle))
}

/// The whole point of the sefer template: notes on notes, and an index.
///
/// It used to be `#מראה_מקום[…]` with no `מקור:`, which files nothing — so the
/// template's one gesture towards the apparatus produced a footnote and an empty
/// promise. Now the commentary is a tiered `#מדור_א`/`#מדור_ב` band, the
/// citations carry `#ציון_מקור`, and both indexes print at the back.
#[test]
fn the_sefer_template_renders_its_apparatus() {
    let runs = render("sefer");
    let body = find(&runs, "אָסוּר");

    // A tier-two note is on the page and below the text it hangs off. The band
    // renders in the page footer, so "below" is the assertion that it landed in
    // the apparatus rather than inline in the prose.
    let tier2 = find(&runs, "ויש שדקדקו");
    assert!(
        tier2.y > body.y,
        "the second-tier note printed above the text it comments on ({} vs {})",
        tier2.y,
        body.y
    );

    // The source index printed, which is what `#ציון_מקור` is for and what the
    // old template's `#מראה_מקום` could never have produced.
    assert!(
        has(&runs, "מפתח המקורות"),
        "the source index is missing — `#מפתח_מקורות()` filed nothing"
    );
    // And it prints the *canonical* spelling, not whatever was typed: the whole
    // reason `#ציון_מקור` exists is that ב״ב and בבא בתרא are one sefer.
    assert!(
        has(&runs, "ברכות") && has(&runs, "שולחן ערוך"),
        "the index has no entries in it"
    );
    assert!(
        has(&runs, "מראי המקומות"),
        "the mareh mekomos list did not print"
    );

    // The topic index, which until the collective gate was in no template at
    // all: the product has the command, the palette offers it, and a writer who
    // picked "sefer" had never seen one. Asserted the same way as the source
    // index — the heading printed *and* it has an entry in it, because
    // `#מפתח_ענינים()` over zero marks prints a heading and nothing else.
    assert!(
        has(&runs, "מפתח הענינים"),
        "the topic index did not print — `#מפתח_ענינים()` found no `#ערך` marks"
    );
    assert!(
        has(&runs, "ברכה קודם הנאה"),
        "the topic index printed with nothing in it, so the `#ערך` mark filed nothing"
    );

    // The tiered note, which is the arrangement the aside is now written with.
    // A note *on a note* has to be on the paper and below the note it hangs off,
    // which is the same assertion as the bands above and for the same reason: a
    // tier-2 note that printed inline would be a tier-2 note nobody can tell
    // from tier 1.
    let parent = find(&runs, "עיין רמב״ן בפנים");
    let tier2 = find(&runs, "הרש״״ש");
    assert!(
        tier2.y > parent.y,
        "the tier-two note printed above the note it comments on ({} vs {})",
        tier2.y,
        parent.y
    );
}

/// The deferred note resolves, or the template says so in red.
///
/// `#הערה_בשם` answers a missing body by printing a red `?` followed by the
/// name — deliberately, because a note the writer believes they wrote and the
/// reader never sees is the worse failure. So the assertion here is the
/// negative one, and it is the sharpest probe this file has: a body that
/// compiles, files, and renders a question mark in the middle of an article
/// would pass every "it compiles" test in the repository.
///
/// The positive half is checked too — a template where the marker is missing
/// altogether also passes a red-free check, and that is a template whose
/// apparatus is in the file and not on the page.
#[test]
fn the_article_template_resolves_its_deferred_note() {
    let runs = render("article");
    assert!(
        !runs.iter().any(|r| r.text.contains("?תחום הדיון")),
        "the deferred note rendered as a red `?` — the body `#גוף_הערה` files \
         under a name the marker does not use"
    );
    assert!(
        has(&runs, "הדיון כאן הוא בגדרי חיובו"),
        "the deferred note's body did not reach the page"
    );
    assert!(
        has(&runs, "סופרי החידות"),
        "the note's own text is not on the page, so only its marker rendered"
    );
}

/// The d'var Torah sheet, with the marginal notes it is actually written with.
#[test]
fn the_divrei_torah_template_puts_its_notes_in_the_margin() {
    let runs = render("divrei-torah");
    let body = find(&runs, "והקשה");
    let side = find(&runs, "מקור הקושיה");

    // A sidenote is beside its text, not under it: same page, and further out
    // horizontally than the body column.
    assert_eq!(
        side.page, body.page,
        "the sidenote left the page its marker is on"
    );
    assert!(
        (side.x - body.x).abs() > 20.0,
        "the sidenote is in the text column, not the margin ({} vs {})",
        side.x,
        body.x
    );
    // The plain footnote still works alongside it — the two mechanisms are
    // independent and a template using both is the case that proves it.
    assert!(has(&runs, "מדרש תנחומא"), "the footnote did not render");
}

/// The Gemara look: fixed regions at the foot, which hold their slot.
#[test]
fn the_gemara_template_lays_out_two_fixed_bands() {
    let (runs, sizes) = laid_out("gemara");
    let body = find(&runs, "כֵּיצַד");
    let first = find(&runs, "כל פרי הגדל באילן");
    let second = find(&runs, "ועיין במה שדנו");

    assert!(
        first.y > body.y && second.y > first.y,
        "the bands are not stacked under the text (body {}, band א {}, band ב {})",
        body.y,
        first.y,
        second.y
    );
    // Both bands are on the paper.
    //
    // This is the first thing in the repository to exercise the note reserve, and
    // it found that `auto_notes_region_cm` returns a flat **3 cm** for any
    // document with a page-foot apparatus in it — it never reads the `גבהים` the
    // document configured. The template asked for 3.5 + 2.5 cm and the second
    // band rendered 51pt below the bottom edge of A4, with the page number under
    // it. The template's heights now fit the reserve; making the reserve read the
    // heights is a real fix and is not this one.
    // `TextRun.page` is 1-based (`probe.rs` walks `enumerate()` and stores `i + 1`).
    let height = sizes[second.page - 1].1;
    assert!(
        second.y < height,
        "the second band ran off the bottom of the paper ({} of {})",
        second.y,
        height
    );
}

/// Two streams, side by side, each numbered on its own.
#[test]
fn the_peirush_template_runs_two_streams_in_parallel() {
    let runs = render("peirush");
    // The two column *headings*, which is the visible claim of this card and the
    // one thing in it that is unambiguous: an entry's text can repeat elsewhere
    // on the page (a canonical sefer name prints again in the source index), and
    // a test that matches the wrong run compares a heading to a body line and
    // reports "stacked" about a layout that is not.
    // The two column *headings*, matched exactly. `contains` found the page's
    // own subtitle first — "ביאורים ומראי מקומות זה לצד זה" holds both words —
    // and comparing a subtitle to a heading reported "stacked" about a layout
    // that is side by side. A substring match on a document that talks about
    // itself is a trap, and this template talks about itself in its subtitle.
    let exact = |needle: &str| {
        runs.iter()
            .find(|r| r.text.trim() == needle)
            .unwrap_or_else(|| panic!("no run is exactly {needle:?}"))
    };
    let content = exact("ביאורים");
    let source = exact("מראי מקומות");

    assert_eq!(
        content.page, source.page,
        "the two streams landed on different pages"
    );
    assert!(
        (content.y - source.y).abs() < 6.0,
        "the streams are stacked rather than side by side ({} vs {})",
        content.y,
        source.y
    );
    assert!(
        (content.x - source.x).abs() > 20.0,
        "the streams share a column ({} vs {})",
        content.x,
        source.x
    );
}

/// Every template compiles and puts words on a page.
///
/// The weakest assertion here, and it is still worth making for the ones with no
/// apparatus in them: `letter`, `kesubah` and `bentcher` are deliberately plain,
/// and "deliberately plain" must not shade into "empty".
#[test]
fn every_template_renders_something() {
    for t in ksav_engine::templates::TEMPLATES {
        let runs = render(t.id);
        assert!(
            runs.len() > 5,
            "template {:?} rendered {} text runs — it is effectively blank",
            t.id,
            runs.len()
        );
    }
}

// ---------------------------------------------------------------- the gate

/// The apparatus, as a **reachable set**: one row per capability, and the
/// commands that demonstrate it.
///
/// # Why this table and not the per-template probes above
///
/// The probes are excellent and they are per template: `gemara` lays out two
/// fixed bands, `peirush` runs two streams in parallel. What none of them says
/// is the claim `src/templates.rs` makes in prose — *"the one thing this product
/// does that Word cannot was reachable from no starting point at all"*. That is
/// a statement about the **union** of the templates, and a union cannot be
/// established one element at a time. Ten templates each demonstrating one thing
/// can cover nothing between them, and did: the audit found ten templates
/// covering eight of 115 commands, five of them using no apparatus at all.
///
/// So the claim becomes a predicate over a declared set, and the set is here
/// rather than in a comment so that adding a command to the registry and
/// forgetting this is a **visible** omission rather than a silent one.
///
/// # What belongs in it, and what deliberately does not
///
/// A **kind** is an arrangement a writer recognises on sight, not a parameter of
/// one: `#הערה_בדרגה(2)` and `#הערה_בדרגה(3)` are one kind, and listing both
/// would let the set be satisfied by a template that demonstrates one tier. The
/// five tiers of `#הערה_בדרגה` are one row. `#מדור_א`/`#מדור_ב` are one kind
/// (stacked bands) rather than two, and the same for `#מדף_א`/`#מדף_ב`.
///
/// Not in it: every command. A template is a starting point, not a catalogue,
/// and "every one of 167 commands appears in some template" is a different and
/// much larger project that nobody asked for. What is in it is what
/// `src/templates.rs` claims and what `spec.md` is about — the arrangements
/// themselves, and the two indexes.
const COVERED: &[(&str, &[&str])] = &[
    ("a plain footnote", &["#הערה["]),
    (
        "a note on a note, at a tier the writer picks",
        &["#הערה_בדרגה("],
    ),
    ("a side note", &["#הערת_צד["]),
    (
        "a section whose notes run in a side column",
        &["#עם_הערות_צד(", "#הערת_גיליון["],
    ),
    (
        "a note whose text is written at the end of the document",
        &["#הערה_בשם(", "#גופי_הערות[", "#גוף_הערה("],
    ),
    (
        "bands stacked at the end of a section",
        &["#הערות_מדורגות(", "#מדור_א[", "#מדור_ב["],
    ),
    (
        "fixed bands at the foot of the page",
        &["#מדף_א[", "#מדף_ב["],
    ),
    (
        "endnotes in two independently numbered streams, side by side",
        &["#הערות_בסוף_צד(", "#הערתסיום(זרם:"],
    ),
    (
        "the source index",
        &["#מפתח_מקורות()", "#ציון_מקור("],
    ),
    (
        "the topic index",
        &["#מפתח_ענינים()", "#ערך("],
    ),
];

/// The name a probe is asserting about, read off its leading `#identifier`.
///
/// A **probe** is a substring of a template body, and it is the `#identifier` at
/// its front that has to be a command the registry declares. Deriving one from
/// the other means the table cannot drift into asserting that `#הערה_בדרגה_של_מי`
/// is a thing, and it is also why a probe carries a tail — `#הערות_בסוף_צד(` and
/// `#הערתסיום(זרם:` are about the *shape* of a call, and a command whose body
/// bracket is written `[` because it takes no arguments would otherwise satisfy
/// a probe meant to catch it.
fn probed_command(probe: &str) -> &str {
    probe
        .strip_prefix('#')
        .unwrap_or(probe)
        .trim_end_matches(['(', '['])
        .trim_end_matches("זרם:")
        .split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .next()
        .unwrap_or(probe)
}

/// Every declared capability is reachable by picking a template.
///
/// The gate the per-template probes could not be. A capability is demonstrated
/// when **one** template body contains every probe its row names — not when the
/// corpus between them contains them, which is the arrangement that let the
/// apparatus go unreachable in the first place.
#[test]
fn every_declared_capability_is_reachable_from_a_template() {
    let bodies: Vec<(&str, &str)> = ksav_engine::templates::TEMPLATES
        .iter()
        .map(|t| (t.id, t.body))
        .collect();

    let mut unreachable = Vec::new();
    for (what, probes) in COVERED {
        // The template that covers it, for the message: "no template has all of
        // A, B" is a question; "A is only in divrei-torah and B is in no template
        // at all" is a diagnosis.
        let covering: Vec<&str> = bodies
            .iter()
            .filter(|(_, body)| probes.iter().all(|p| body.contains(p)))
            .map(|(id, _)| *id)
            .collect();
        if covering.is_empty() {
            let partial: Vec<String> = probes
                .iter()
                .map(|p| {
                    let in_one: Vec<&str> = bodies
                        .iter()
                        .filter(|(_, body)| body.contains(p))
                        .map(|(id, _)| *id)
                        .collect();
                    if in_one.is_empty() {
                        format!("{p} — in no template at all")
                    } else {
                        format!("{p} — only in {}", in_one.join(", "))
                    }
                })
                .collect();
            unreachable.push(format!("{what}\n      {}", partial.join("\n      ")));
        }
    }
    assert!(
        unreachable.is_empty(),
        "a writer cannot reach:\n    {}\n    \
         The prose in src/templates.rs claims they can. Either add the card or \
         remove the row and say why it is not a thing a writer meets.",
        unreachable.join("\n    ")
    );
}

/// The gate's own floor, and its own sanity check.
///
/// A walk that stopped finding templates would report the set as unreachable,
/// which is loud. A walk that found no *rows* would report it as satisfied, and
/// a row naming a command the registry does not declare would report a missing
/// template for ever, which is the right failure and the wrong diagnosis.
#[test]
fn the_covered_set_is_not_empty_and_names_real_commands() {
    assert!(
        COVERED.len() >= 10,
        "the covered set is down to {} rows, which cannot be the apparatus",
        COVERED.len()
    );
    let declared: std::collections::HashSet<&str> = ksav_engine::commands::COMMANDS
        .iter()
        .map(|c| c.he)
        .collect();
    let mut probes = 0;
    for (what, row) in COVERED {
        assert!(!row.is_empty(), "{what} names no command at all");
        for p in *row {
            probes += 1;
            let name = probed_command(p);
            assert!(
                declared.contains(name),
                "{what} names {p:?}, and #{name} is not in the registry at all"
            );
        }
    }
    assert!(
        probes >= COVERED.len() + 4,
        "only {probes} probes across {} rows — the set is not specific enough to \
         mean anything",
        COVERED.len()
    );
}


// ------------------------------------------------- the two translated pairs

/// One declared difference between a translated pair, and why it is allowed.
///
/// `en` empty means the Hebrew copy has a command the English copy has no
/// counterpart for; `he` empty means the English copy has one the Hebrew does
/// not. Both sides may not be empty — that would be a command neither has, which
/// is a typo rather than a translation decision.
struct Allowed {
    he: &'static str,
    en: &'static str,
    why: &'static str,
}

const fn only(he: &'static str, en: &'static str, why: &'static str) -> Allowed {
    Allowed { he, en, why }
}

/// The `-en` copies are held to the Hebrew ones, with the differences that are
/// allowed **declared** rather than tolerated.
///
/// # Why a test and not a convention
///
/// `letter-en` and `article-en` exist because a letter is a letter in either
/// language, and an English writer should not open a Hebrew document and delete
/// it. That is a real gain and it costs a maintenance bill: two copies of a
/// document, which is the arrangement that produces two copies that disagree.
///
/// Nothing notices a disagreement on its own. The English copy is not compiled
/// by anything that reads the Hebrew one, the editor does not offer them as a
/// pair, and a command added to `letter.ksav` leaves `letter-en.ksav` a document
/// that no longer demonstrates what the Hebrew one does. This is the collective
/// claim of `every_declared_capability_is_reachable_from_a_template` applied to
/// the *pair* rather than to the corpus: not "the templates cover the apparatus"
/// but "a translated template covers the same ground as the template it is a
/// translation of".
///
/// # The differences, and why they are differences
///
/// Both are **direction**, and neither is a translation decision:
///
///   - the Hebrew letter wraps `ב"ה` and the telephone number in
///     `#משמאל_לימין`. A left-to-right run inside a right-to-left paragraph has
///     to be told, and without the wrapper the digits print in the wrong order.
///     The English letter is already left to right; the wrapper would be a no-op
///     around a thing that is already correct.
///   - the English article writes `#bold[…]` around the label inside its callout
///     where the Hebrew one writes nothing. In a right-to-left column the colon
///     already separates the label; in a left-to-right one the eye has nothing to
///     catch on and the label disappears into the sentence.
///
/// So the test is not "the two files are identical", which would forbid both. It
/// is "the two files differ in exactly these declared ways", which is a fence
/// that can still fail — and which fails *in the direction that matters*, since
/// a command added to the Hebrew copy and not the English one is the case the
/// convention was supposed to prevent.
const TRANSLATED_PAIRS: &[(&str, &str, &[Allowed])] = &[
    (
        "letter",
        "letter-en",
        &[
            only(
                "משמאל_לימין",
                "",
                "an LTR run inside RTL text needs telling; the LTR copy does not",
            ),
            only(
                "משמאל_לימין",
                "",
                "…and the same, for the telephone number at the foot",
            ),
            only(
                "שמאל",
                "right_",
                "the same slot in both — the end of the line, which is the left in \
                 a right-to-left document and the right in a left-to-right one, so \
                 the two copies use *opposite* alignment commands for one gesture",
            ),
            only(
                "שמאל",
                "right_",
                "…and again for the date under it",
            ),
        ],
    ),
    (
        "article",
        "article-en",
        &[only(
            "",
            "bold",
            "the callout label needs `#bold` to be findable in an LTR column",
        )],
    ),
];

/// Every `#command` a body names, in order, whichever script it is written in.
fn commands_in(body: &str) -> Vec<String> {
    let chars: Vec<char> = body.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '#' {
            i += 1;
            continue;
        }
        i += 1;
        let start = i;
        while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
            i += 1;
        }
        if i > start {
            out.push(chars[start..i].iter().collect());
        }
    }
    out
}

/// The English alias of a Hebrew command, from the pairing the prelude declares.
fn english_of(he: &str) -> Option<String> {
    ksav_engine::diagnostics::command_aliases(include_str!("../typst/ksav.typ"))
        .into_iter()
        .find(|(_, h)| h == he)
        .map(|(en, _)| en)
}

/// The two copies agree, once the declared differences are removed.
///
/// The comparison is a **longest common subsequence** over the two command
/// lists — the Hebrew one mapped through the prelude's own pairing, against the
/// English one as written — and the assertion is on what is *left over*. A plain
/// `zip` would not do: one extra command in either file shifts every position
/// after it and reports twelve differences for one mistake, which is a message
/// nobody reads and a fence nobody trusts.
#[test]
fn the_translated_templates_keep_their_hebrew_originals_in_step() {
    let bodies: std::collections::HashMap<&str, &str> = ksav_engine::templates::TEMPLATES
        .iter()
        .map(|t| (t.id, t.body))
        .collect();

    let mut drift = Vec::new();
    for (he_id, en_id, allowed) in TRANSLATED_PAIRS {
        let he_body = bodies[he_id];
        let en_body = bodies[en_id];

        // The Hebrew side, in the language the English side is written in.
        let mut he_as_en = Vec::new();
        let mut he_names = Vec::new();
        for c in commands_in(he_body) {
            if c.chars().next().is_some_and(|c| ('\u{05D0}'..='\u{05EA}').contains(&c)) {
                match english_of(&c) {
                    Some(en) => he_as_en.push(en),
                    None => {
                        drift.push(format!(
                            "{he_id}: #{c} has no English alias in the prelude, so \
                             {en_id} cannot contain it at all"
                        ));
                        continue;
                    }
                }
            } else {
                // An ASCII-named binding in the Hebrew copy: the two files should
                // not be mixing scripts, and if one does the diff below is
                // comparing two different languages.
                drift.push(format!("{he_id}: #{c} is written in English"));
                continue;
            }
            he_names.push(c);
        }
        let en = commands_in(en_body);
        if en.iter().any(|c| c.chars().next().is_some_and(|c| ('\u{05D0}'..='\u{05EA}').contains(&c)))
        {
            drift.push(format!("{en_id} is written in Hebrew"));
            continue;
        }

        // Longest common subsequence, and the two remainders.
        let (matched, extra_in_en, extra_in_he) = lcs_remainder(&he_as_en, &en, &he_names);
        let leftovers = matched + extra_in_en.len() + extra_in_he.len();
        if leftovers == 0 {
            continue;
        }

        // The floor, which the `continue` above cannot supply for itself. Two
        // files that stopped parsing to commands at all would compare empty
        // against empty, find no leftovers, and pass — so the assertion is on
        // how much was actually compared. The letter matches fourteen commands
        // and the article seventeen; 8 is a long way below either and well above
        // the declared differences.
        assert!(
            matched >= 8,
            "{he_id} → {en_id}: only {matched} commands matched, out of {} in the \
             Hebrew copy and {} in the English one. A pair with nothing to \
             compare is not a pair in step.",
            he_as_en.len(),
            en.len()
        );
        assert!(
            he_as_en.len() >= 12 && en.len() >= 12,
            "{he_id} → {en_id}: the two copies hold {} and {} commands. Either a \
             template lost its apparatus or the reader stopped at the first `#`.",
            he_as_en.len(),
            en.len()
        );
        // Every leftover has to be accounted for by a declaration, and a
        // declaration can be of three kinds — so the matching is a matching
        // rather than two `any` calls:
        //
        //   - **one-sided**: the Hebrew copy has a command the English one has no
        //     counterpart for (`Allowed { en: "" }`), or the other way round.
        //   - **cross**: the two copies use *different* commands for one gesture,
        //     which is what the letter does — the end of the line is the left in
        //     a right-to-left document and the right in a left-to-right one, so
        //     `#שמאל` and `#right_` are the same slot.
        //
        // Crosses are consumed first, because they are the only kind that claims
        // a leftover on *both* sides, and doing them in the other order would
        // let a one-sided declaration swallow half of a cross.
        let mut unclaimed_he = extra_in_he.clone();
        let mut unclaimed_en = extra_in_en.clone();
        let mut used = 0;
        for a in allowed.iter().filter(|a| !a.he.is_empty() && !a.en.is_empty()) {
            if let (Some(hi), Some(ei)) = (
                unclaimed_he.iter().position(|x| *x == a.he),
                unclaimed_en.iter().position(|x| *x == a.en),
            ) {
                unclaimed_he.remove(hi);
                unclaimed_en.remove(ei);
                used += 1;
            }
        }
        for a in allowed.iter().filter(|a| !a.he.is_empty() && a.en.is_empty()) {
            if let Some(hi) = unclaimed_he.iter().position(|x| *x == a.he) {
                unclaimed_he.remove(hi);
                used += 1;
            }
        }
        for a in allowed.iter().filter(|a| a.he.is_empty() && !a.en.is_empty()) {
            if let Some(ei) = unclaimed_en.iter().position(|x| *x == a.en) {
                unclaimed_en.remove(ei);
                used += 1;
            }
        }

        for name in &unclaimed_he {
            drift.push(format!(
                "{he_id} → {en_id}: #{name} is in the Hebrew copy and not the \
                 English one, and it is not a declared difference"
            ));
        }
        for name in &unclaimed_en {
            drift.push(format!(
                "{he_id} → {en_id}: #{name} is in the English copy and not the \
                 Hebrew one, and it is not a declared difference"
            ));
        }
        // A declared difference nobody used is the other half: a comment that has
        // quietly stopped describing the files is the first thing to go stale in
        // a pair held together by its own declarations.
        if used < allowed.len() {
            for a in &allowed[used..] {
                drift.push(format!(
                    "{he_id} → {en_id}: the declared difference #{} → #{} ({}) is no \
                     longer there",
                    a.he, a.en, a.why
                ));
            }
        }
    }
    assert!(
        drift.is_empty(),
        "the translated templates have drifted:\n    {}\n    \
         Add the command to both copies, or change the declaration in \
         TRANSLATED_PAIRS and say in `why` why the copies are allowed to differ.",
        drift.join("\n    ")
    );
}

/// The three sets a sequence comparison needs: what matched, and what is left on
/// each side.
///
/// `he_names` is carried alongside `he_as_en` so the caller can report a Hebrew
/// command rather than its English spelling — a writer looking at the failure
/// wants to search the file they wrote, not the file they did not.
fn lcs_remainder<'a>(
    a: &'a [String],
    b: &'a [String],
    a_names: &'a [String],
) -> (usize, Vec<String>, Vec<String>) {
    let (n, m) = (a.len(), b.len());
    let mut table = vec![vec![0usize; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            table[i][j] = if a[i] == b[j] {
                table[i + 1][j + 1] + 1
            } else {
                table[i + 1][j].max(table[i][j + 1])
            };
        }
    }
    let mut i = 0;
    let mut j = 0;
    let mut matched = 0;
    let mut only_a = Vec::new();
    let mut only_b = Vec::new();
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            matched += 1;
            i += 1;
            j += 1;
        } else if j >= m || (i < n && table[i + 1][j] >= table[i][j + 1]) {
            only_a.push(a_names[i].clone());
            i += 1;
        } else {
            only_b.push(b[j].clone());
            j += 1;
        }
    }
    (matched, only_b, only_a)
}

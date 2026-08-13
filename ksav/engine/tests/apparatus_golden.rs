//! A pinned rendering of every band apparatus, across every knob it has.
//!
//! `apparatus.rs` asserts *properties* of the laid-out page — this note is below
//! that one, this band is on page 2, this tier is smaller. Properties are the
//! right shape for describing intent, and they are the wrong shape for one job:
//! proving that a refactor of the renderer changed nothing at all. A property
//! test passes when the page is *plausible*; only a byte-comparison of the whole
//! layout passes exactly when the page is *the same*.
//!
//! This file exists because `ksav.typ` wrote the three band apparatuses —
//! section bands (`#מדור_`), per-page bands (`#מדף_`) and streams
//! (`#הערה_זרם`) — three times over, and the א,ב,ג-over-1,2,3 numbering
//! correction had to be applied by hand to two of the copies, months apart. The
//! three were collapsed onto one implementation; this is the evidence that the
//! collapse moved nothing on the page.
//!
//! Every case is rendered to `page · x · y · size · text` for every run, and the
//! whole dump is compared against `fixtures/apparatus-golden.txt`. The knobs are
//! the point: the three copies differed most in the paths nothing else reaches —
//! fixed band heights, multi-column bands, side-by-side streams, per-band labels,
//! explicit stream order, custom numbering schemes.
//!
//! Regenerate deliberately, and read the diff:
//!
//! ```text
//! KSAV_UPDATE_GOLDEN=1 cargo test --test apparatus_golden
//! ```

use ksav_engine::probe::{self, TextRun};
use ksav_engine::DocConfig;

const GOLDEN: &str = include_str!("fixtures/apparatus-golden.txt");

/// The one config every case is rendered with. The page-foot reserve is pinned
/// rather than left to `auto_notes_region_cm`, so a case's layout says something
/// about the apparatus and nothing about the reserve heuristic.
fn probe_config() -> DocConfig {
    DocConfig {
        notes_region_cm: Some(4.0),
        ..DocConfig::default()
    }
}

/// Enough prose to fill lines and force a page break where a case wants one.
fn prose(n: usize) -> String {
    (1..=n)
        .map(|i| format!("שורה {i} של הגוף, ובה די מלים כדי למלא את רוחב השורה עד סופה ממש.\n\n"))
        .collect()
}

/// (name, source) — the corpus. Ordering is stable; append, don't insert.
fn corpus() -> Vec<(&'static str, String)> {
    let mut v: Vec<(&'static str, String)> = Vec::new();
    let mut case = |name: &'static str, src: String| v.push((name, src));

    // ── section bands (#מדור_ / #הערות_מדורגות) ─────────────────────────────
    //
    // The in-flow apparatus: numbering runs within the section, and a second
    // dump call starts a second section.

    case(
        "band/one-tier",
        "פתיחה#מדור_א[ביאור ראשון] והמשך#מדור_א[ביאור שני].\n\n#הערות_מדורגות()\n".into(),
    );
    case(
        "band/three-tiers",
        "פתיחה#מדור_א[ביאור#מדור_ב[הערה על הביאור#מדור_ג[ועוד]]] וסוף.\n\n#הערות_מדורגות()\n"
            .into(),
    );
    case(
        "band/title",
        "פתיחה#מדור_א[ביאור].\n\n#הערות_מדורגות(כותרת: [מקורות])\n".into(),
    );
    case(
        "band/two-sections",
        concat!(
            "חלק ראשון#מדור_א[ביאור א].\n\n#הערות_מדורגות()\n\n",
            "חלק שני#מדור_א[ביאור ב].\n\n#הערות_מדורגות()\n"
        )
        .into(),
    );
    case(
        "band/no-rules",
        "#הגדרות_מדורגות(קו: false, קו_בין: false)\nפתיחה#מדור_א[א#מדור_ב[ב]].\n\n#הערות_מדורגות()\n"
            .into(),
    );
    case(
        "band/columns",
        format!(
            "#הגדרות_מדורגות(טורים: (2, 1))\n{}\n\n#הערות_מדורגות()\n",
            (1..=6)
                .map(|i| format!("קטע {i}#מדור_א[ביאור מספר {i} ובו כמה מלים]. "))
                .collect::<String>()
        ),
    );
    case(
        "band/labels",
        "#הגדרות_מדורגות(תוויות: true)\nפתיחה#מדור_א[א#מדור_ב[ב]].\n\n#הערות_מדורגות()\n".into(),
    );
    case(
        "band/numbering",
        "#הגדרות_מדורגות(מספור: (\"1\", \"א\", \"i\"))\nפתיחה#מדור_א[א#מדור_ב[ב#מדור_ג[ג]]].\n\n#הערות_מדורגות()\n"
            .into(),
    );
    case(
        "band/spacing",
        "#הגדרות_מדורגות(ריווח_בין: 1.4em, ריווח_פריט: 0.9em)\nפתיחה#מדור_א[א#מדור_ב[ב]] ועוד#מדור_א[ג].\n\n#הערות_מדורגות()\n"
            .into(),
    );
    case(
        "band/style",
        "#הגדרות_מדורגות(גודל: (1.1em, 0.7em), סגנון: (\"italic\", \"normal\"), צבע: (luma(30), luma(140)))\nפתיחה#מדור_א[א#מדור_ב[ב]].\n\n#הערות_מדורגות()\n"
            .into(),
    );
    case(
        "band/deep-seven",
        "פתיחה#מדור_בדרגה(7)[עמוק] ועוד#מדור_א[רגיל].\n\n#הערות_מדורגות()\n".into(),
    );
    case(
        "band/english",
        "Opening#band1[first gloss#band2[a gloss on the gloss]] and the rest.\n\n#banded_notes()\n"
            .into(),
    );

    // ── per-page bands (#מדף_ / footer) ─────────────────────────────────────
    //
    // The footer apparatus: numbering is document-wide, the band is filtered to
    // the page, and fixed heights make every configured band appear on every
    // apparatus page whether or not it has anything in it.

    case(
        "pageband/one-tier",
        "פתיחה#מדף_א[ביאור ראשון] והמשך#מדף_א[ביאור שני].\n".into(),
    );
    case(
        "pageband/three-tiers",
        "פתיחה#מדף_א[ביאור#מדף_ב[הערה על הביאור#מדף_ג[ועוד]]] וסוף.\n".into(),
    );
    case(
        "pageband/two-pages",
        format!(
            "עמוד ראשון#מדף_א[ביאור א].\n\n{}#pagebreak()\nעמוד שני#מדף_א[ביאור ב].\n",
            prose(4)
        ),
    );
    case(
        "pageband/fixed-heights",
        "#הגדרות_מדפים(גבהים: (1.6cm, 1cm))\nפתיחה#מדף_א[ביאור#מדף_ב[הערה על הביאור]].\n".into(),
    );
    case(
        "pageband/fixed-heights-empty-slot",
        // Only tier 1 is written; tier 2 keeps its reserved slot empty. This is
        // the whole point of the fixed-region layout and the path where the two
        // `גבהים` implementations disagreed.
        "#הגדרות_מדפים(גבהים: (1.6cm, 1cm))\nפתיחה#מדף_א[ביאור יחיד].\n".into(),
    );
    case(
        "pageband/columns",
        format!(
            "#הגדרות_מדפים(טורים: (2, 1))\n{}\n",
            (1..=6)
                .map(|i| format!("קטע {i}#מדף_א[ביאור מספר {i} ובו כמה מלים]. "))
                .collect::<String>()
        ),
    );
    case(
        "pageband/no-rules",
        "#הגדרות_מדפים(קו: false, קו_בין: false)\nפתיחה#מדף_א[א#מדף_ב[ב]].\n".into(),
    );
    case(
        "pageband/numbering",
        "#הגדרות_מדפים(מספור: (\"1\", \"א\", \"i\"))\nפתיחה#מדף_א[א#מדף_ב[ב#מדף_ג[ג]]].\n".into(),
    );
    case(
        "pageband/spacing",
        "#הגדרות_מדפים(ריווח_בין: 1.2em, ריווח_פריט: 0.8em)\nפתיחה#מדף_א[א#מדף_ב[ב]] ועוד#מדף_א[ג].\n"
            .into(),
    );
    case(
        "pageband/style",
        "#הגדרות_מדפים(גודל: (1.05em, 0.68em), סגנון: (\"italic\", \"normal\"), צבע: (luma(30), luma(150)))\nפתיחה#מדף_א[א#מדף_ב[ב]].\n"
            .into(),
    );
    case(
        "pageband/deep-seven",
        "פתיחה#מדף_בדרגה(7)[עמוק] ועוד#מדף_א[רגיל].\n".into(),
    );
    case(
        "pageband/english",
        "Opening#pageband1[first gloss#pageband2[a gloss on the gloss]] and the rest.\n".into(),
    );

    // ── streams (#הערה_זרם / footer) ────────────────────────────────────────
    //
    // The same footer mechanism grouped by a name rather than a tier, plus two
    // things the tiered bands do not have: per-group headings and a
    // side-by-side layout.

    case(
        "stream/stacked",
        "פתיחה#הערה_זרם(\"תוכן\")[ביאור] ומקור#הערה_זרם(\"מקורות\")[ב\"ב ט'].\n".into(),
    );
    case(
        "stream/aliases",
        "פתיחה#הערת_תוכן[ביאור] ומקור#הערת_מקור[ב\"ב ט'].\n".into(),
    );
    case(
        "stream/side-by-side",
        "#הגדרות_זרמים(פריסה: \"צד\")\nפתיחה#הערת_תוכן[ביאור] ומקור#הערת_מקור[ב\"ב ט'].\n".into(),
    );
    case(
        "stream/headings",
        "#הגדרות_זרמים(כותרות: (\"מקורות\": [מקורות], \"תוכן\": [ביאורים]))\nפתיחה#הערת_תוכן[ביאור] ומקור#הערת_מקור[ב\"ב ט'].\n"
            .into(),
    );
    case(
        "stream/explicit-order",
        "#הגדרות_זרמים(זרמים: (\"מקורות\", \"תוכן\"))\nפתיחה#הערת_תוכן[ביאור] ומקור#הערת_מקור[ב\"ב ט'].\n"
            .into(),
    );
    case(
        "stream/fixed-heights",
        "#הגדרות_זרמים(גבהים: (\"מקורות\": 1.2cm, \"תוכן\": 1cm))\nפתיחה#הערת_תוכן[ביאור] ומקור#הערת_מקור[ב\"ב ט'].\n"
            .into(),
    );
    case(
        "stream/fixed-heights-empty-slot",
        // A stream with a reserved slot and nothing on this page still occupies
        // it — the streams' half of the same rule as `pageband/…-empty-slot`.
        "#הגדרות_זרמים(גבהים: (\"מקורות\": 1.2cm, \"תוכן\": 1cm))\nפתיחה#הערת_תוכן[ביאור בלבד].\n"
            .into(),
    );
    case(
        "stream/columns",
        format!(
            "#הגדרות_זרמים(טורים: (\"תוכן\": 2))\n{}\n",
            (1..=6)
                .map(|i| format!("קטע {i}#הערת_תוכן[ביאור מספר {i} ובו כמה מלים]. "))
                .collect::<String>()
        ),
    );
    case(
        "stream/numbering",
        "#הגדרות_זרמים(מספור: (\"מקורות\": \"א\"))\nפתיחה#הערת_תוכן[ביאור] ומקור#הערת_מקור[ב\"ב ט'].\n"
            .into(),
    );
    case(
        "stream/no-rules",
        "#הגדרות_זרמים(קו: false, קו_בין: false)\nפתיחה#הערת_תוכן[ביאור] ומקור#הערת_מקור[מקור].\n"
            .into(),
    );
    case(
        "stream/spacing",
        "#הגדרות_זרמים(ריווח_בין: 1.3em, ריווח_פריט: 0.7em)\nפתיחה#הערת_תוכן[ביאור] ועוד#הערת_תוכן[שני] ומקור#הערת_מקור[מקור].\n"
            .into(),
    );
    case(
        "stream/style",
        "#הגדרות_זרמים(גודל: 1.05em, סגנון: \"italic\", צבע: luma(90))\nפתיחה#הערת_תוכן[ביאור].\n"
            .into(),
    );
    case(
        "stream/two-pages",
        format!(
            "עמוד ראשון#הערת_תוכן[ביאור א].\n\n{}#pagebreak()\nעמוד שני#הערת_תוכן[ביאור ב].\n",
            prose(4)
        ),
    );
    case(
        "stream/three-streams-side",
        "#הגדרות_זרמים(פריסה: \"צד\", זרמים: (\"א\", \"ב\", \"ג\"))\nפתיחה#הערה_זרם(\"א\")[ראשון]#הערה_זרם(\"ב\")[שני]#הערה_זרם(\"ג\")[שלישי].\n"
            .into(),
    );
    case(
        "stream/english",
        "Opening#contentnote[a gloss] and a source#sourcenote_stream[BB 9a].\n".into(),
    );

    // ── the apparatuses together ────────────────────────────────────────────
    //
    // Section bands render in the flow while page bands and streams share one
    // footer; the `_ksav_real` bracket that keeps a re-displayed body from
    // re-registering is global, so the combination is its own case.

    case(
        "mixed/bands-and-streams",
        "פתיחה#מדף_א[בפוטר]#הערת_תוכן[בזרם]#מדור_א[בזרימה].\n\n#הערות_מדורגות()\n".into(),
    );
    case(
        "mixed/footnote-and-bands",
        "פתיחה#הערה[רגילה]#מדור_א[מדור] וסוף.\n\n#הערות_מדורגות()\n".into(),
    );

    v
}

/// One case's laid-out page, as comparable text.
fn dump(name: &str, src: &str) -> String {
    // Deterministic, and generous enough that the footer apparatus is never
    // clipped by the page edge in a way that depends on the default heuristic.
    let cfg = probe_config();
    let mut out = format!("## {name}\n");
    match probe::layout(src, &cfg) {
        Ok(doc) => {
            for r in probe::text_runs(&doc) {
                out.push_str(&format!(
                    "{} {:.2} {:.2} {:.2} {}\n",
                    r.page, r.x, r.y, r.size, r.text
                ));
            }
        }
        Err(d) => {
            // A case that stops compiling is a change too, and a louder one.
            out.push_str(&format!(
                "COMPILE FAILED: {}\n",
                d.iter()
                    .map(|x| x.message.clone())
                    .collect::<Vec<_>>()
                    .join(" | ")
            ));
        }
    }
    out
}

fn render_all() -> String {
    corpus()
        .iter()
        .map(|(name, src)| dump(name, src))
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn the_band_apparatus_lays_out_exactly_as_it_did() {
    let now = render_all();

    // Updating the pinned layout rewrites the thing this test compares against.
    // It does not get to skip the comparison.
    //
    // The `return` that used to be here made `KSAV_UPDATE_GOLDEN` a switch that
    // turns the fence into a test that writes a file and reports success — a
    // check passing because it did not run. One `export` in a shell profile
    // disables it for every run on that machine, silently. So the variable is
    // refused on a remote, and where it is meant the file is re-read below and
    // compared like any other run: `GOLDEN` is `include_str!` and therefore the
    // *old* text, so the comparison after a write is against what actually
    // landed on disk rather than against what was intended to.
    let updating = std::env::var("KSAV_UPDATE_GOLDEN").is_ok();
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/apparatus-golden.txt");
    if updating {
        assert!(
            std::env::var_os("CI").is_none(),
            "KSAV_UPDATE_GOLDEN is set in CI. Rewriting the pinned layout on a \
             remote would report success for a comparison nobody made. Update it \
             on a desk and commit the result.",
        );
        std::fs::write(&path, &now).expect("write golden");
        eprintln!("wrote {}", path.display());
    }
    let pinned = if updating {
        std::fs::read_to_string(&path).expect("read back the golden that was just written")
    } else {
        GOLDEN.to_string()
    };
    let pinned = pinned.as_str();
    if now == pinned {
        return;
    }
    // Report the first differing case, not the first differing byte: a run's
    // coordinates mean nothing without knowing which document produced them.
    let a: Vec<&str> = pinned.split("\n## ").collect();
    let b: Vec<&str> = now.split("\n## ").collect();
    let mut msg = String::from("the band apparatus renders differently than the pinned layout.\n");
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (
            a.get(i).copied().unwrap_or(""),
            b.get(i).copied().unwrap_or(""),
        );
        if x != y {
            let name = y.lines().next().or_else(|| x.lines().next()).unwrap_or("?");
            msg.push_str(&format!(
                "\nfirst differing case: {}\n",
                name.trim_start_matches("## ")
            ));
            for (j, (lx, ly)) in x.lines().zip(y.lines()).enumerate() {
                if lx != ly {
                    msg.push_str(&format!("  line {j}\n  golden: {lx}\n  now:    {ly}\n"));
                    break;
                }
            }
            let (nx, ny) = (x.lines().count(), y.lines().count());
            if nx != ny {
                msg.push_str(&format!("  golden has {nx} runs, now {ny}\n"));
            }
            break;
        }
    }
    msg.push_str(
        "\nIf the change is intended, regenerate with KSAV_UPDATE_GOLDEN=1 and read the diff.\n",
    );
    panic!("{msg}");
}

// ── the prohibition ──────────────────────────────────────────────────────────
//
// The golden above proves the collapse changed nothing. It does not stop a
// fourth apparatus from being written out longhand next to the other three,
// which is exactly how there came to be three. A pinned layout cannot see that
// — a new copy renders a new page and the golden is silent about it.
//
// So the parts are counted. Each of these strings is a decision the banded
// apparatus makes once; a second occurrence means somebody has begun a second
// copy, and this is the test that says so before it ships and has to be
// corrected twice.

const PRELUDE: &str = include_str!("../typst/ksav.typ");

/// (needle, how many times it may appear, what a second one would mean)
const SINGLE_SOURCE: &[(&str, usize, &str)] = &[
    (
        r#"("א", "1", "a", "i", "*", "א", "1", "a", "i")"#,
        1,
        "the band numbering convention — א,ב,ג over 1,2,3. This array shipped \
         backwards once and the correction then had to be made by hand in a \
         second copy of it. Reference `_ap_numbering` instead of spelling it out.",
    ),
    (
        "line(length: 100%, stroke: 0.5pt + luma(140))",
        1,
        "the rule above a banded apparatus. It belongs to `_ap_bands`.",
    ),
    (
        "stroke: 0.4pt + luma(185)",
        1,
        "the divider between adjacent bands. It belongs to `_ap_bands`.",
    ),
    (
        "box(place(hide(body)))",
        1,
        "the force-registration that makes a note's nested notes register in the \
         same layout pass. It belongs to `_ap_note`.",
    ),
    (
        "block(width: 100%, height: _ap_fixed_height(h), clip: true",
        1,
        "the fixed-height band slot. It was written twice — array-indexed for the \
         page bands, dictionary-keyed for the streams — and belongs to `_ap_group`.",
    ),
    (
        "h * page.height",
        1,
        "resolving a percentage region height against the *sheet* rather than \
         against the block it sits in. A second copy is a second answer to \
         \"a percentage of what\", and the reserve the Rust side takes off the \
         bottom margin only agrees with one of them.",
    ),
];

#[test]
fn the_banded_apparatus_is_written_once() {
    for (needle, allowed, what) in SINGLE_SOURCE {
        let n = PRELUDE.matches(needle).count();
        assert_eq!(
            n, *allowed,
            "`ksav.typ` contains {n} copies of {needle:?}, expected {allowed}.\n\
             That string is {what}"
        );
    }
}

/// Every banded apparatus goes through the shared collector and the shared
/// renderer. Counting the definitions is not enough — a new apparatus could
/// define its own and leave the old ones alone.
#[test]
fn all_three_apparatuses_route_through_the_shared_core() {
    // one definition + one call site per apparatus
    //
    // Four apparatuses now, not three: a channel placed at the end of a section
    // or of the document collects through `_cn_note` and prints at `#הצג_אזור`.
    // It is a fourth *collector* and deliberately not a fourth implementation —
    // it exists because `#הערות_מדורגות` renders every group in its section, so
    // a channel sharing that label would print in a band it was never pointed
    // at. Everything below the label is this same shared core.
    for (name, expect, whose) in [
        (
            "_ap_note(",
            5,
            "section bands, page bands, streams, collected channels",
        ),
        (
            "_ap_bands(",
            5,
            "section bands, page bands, streams, collected channels",
        ),
    ] {
        let n = PRELUDE.matches(name).count();
        assert_eq!(
            n, expect,
            "`ksav.typ` mentions `{name}` {n} times, expected {expect} \
             (its definition plus one call each for: {whose}).\n\
             A banded apparatus that does not call it is a second implementation."
        );
    }
    // and each public collector really is the thin wrapper it claims to be
    for cmd in ["מדור_בדרגה", "מדף_בדרגה", "הערה_זרם", "_cn_note"] {
        let def = format!("#let {cmd}(");
        let at = PRELUDE
            .find(&def)
            .unwrap_or_else(|| panic!("`{cmd}` is not defined in ksav.typ"));
        // The first few lines of the definition, and *lines* rather than a byte
        // count: `&tail[..400]` panicked the day one of these wrappers grew past
        // four hundred bytes and the boundary landed inside a Hebrew letter. A
        // fence that reads Hebrew source may not slice it by bytes.
        let body: String = PRELUDE[at..].lines().take(8).collect::<Vec<_>>().join("\n");
        assert!(
            body.contains("_ap_note("),
            "`{cmd}` does not go through `_ap_note` — it is collecting notes its own way:\n{}",
            body.lines().take(6).collect::<Vec<_>>().join("\n")
        );
    }
}

/// The corpus is only an oracle if it actually reaches the apparatus. A case
/// that silently renders no notes would pin an empty page and pass forever.
#[test]
fn every_case_renders_its_notes() {
    let cfg = probe_config();
    for (name, src) in corpus() {
        let doc =
            probe::layout(&src, &cfg).unwrap_or_else(|d| panic!("{name}: compile failed: {d:?}"));
        let runs: Vec<TextRun> = probe::text_runs(&doc);
        assert!(!runs.is_empty(), "{name}: rendered nothing at all");
        // The apparatus is set at a different size from the body text and the
        // body text is always present, so two distinct sizes is the cheapest
        // true test that the notes reached the page. It holds for every case
        // including the ones that override `גודל` — checked by removing the
        // exemption that was written for them and finding it wasn't needed.
        let sizes: Vec<i64> = {
            let mut s: Vec<i64> = runs.iter().map(|r| (r.size * 100.0) as i64).collect();
            s.sort_unstable();
            s.dedup();
            s
        };
        assert!(
            sizes.len() > 1,
            "{name}: every run is the same size — the apparatus probably rendered nothing"
        );
    }
}

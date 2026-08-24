//! Every knob a writer can turn has to move something on the page.
//!
//! # The finding
//!
//! Two settings in one configuration block were **declared, documented, and read
//! by nothing**: `#הגדרות_הערות(ריווח:)` had a name, a default and a line in the
//! documentation, and the value went into a state dictionary that no renderer
//! ever looked at. `סגנון: "italic"` was worse — it *was* read, and handed to
//! `text(style:)`, which is a request for an italic face that no Hebrew family
//! this engine bundles ships, so Typst returned the upright one. Three of the
//! eight mark classes shipped that as their default.
//!
//! Both look exactly like working features from every angle except the page.
//!
//! # Why the two obvious fences do not work
//!
//! **Grep does not work.** Searching `ksav.typ` for each key name gives 28 hits
//! over 120 keys and **27 of them are false positives**, because the mark
//! register looks its knobs up through a string variable — `c.at(key)` — so the
//! literal never appears near the thing that reads it.
//!
//! **`probe` alone does not work.** It reads text runs: page, x, y, size, text.
//! It cannot see a fill, a stroke or a shear. Asked whether colour was live it
//! answered *no difference*, which is byte-for-byte what a passing test looks
//! like — and colour was live the whole time. An instrument that cannot see the
//! property under test reports every value of it as the same value.
//!
//! So: **render twice on an instrument that can see the whole page, and diff.**
//! Text runs for position and size, fills for colour, strokes for rules and
//! borders, page sizes for geometry. A key whose two renderings are identical in
//! all four is a key that does nothing.
//!
//! # The two ways this test fails, and both are the point
//!
//! 1. **A key changed nothing.** That is the bug it was written for.
//! 2. **A key has no contrasting value in [`CONTRAST`].** That is the fence
//!    against the fence going stale: a knob added tomorrow with a name nobody
//!    has used before cannot quietly opt out of being checked. A hand-kept list
//!    of *what to check* rots silently; a hand-kept list of *how to vary each
//!    kind of value* fails loudly the first time it is incomplete.

use ksav_engine::{probe, DocConfig};

/// The settings dictionaries in `ksav.typ`, each with the command that writes it
/// and a document that puts something on the page for it to style.
///
/// The document matters as much as the command: a knob on the endnote block only
/// moves the page if the document *has* an endnote block, and a fence whose
/// document renders nothing reports every key as dead — which is the same
/// failure as reporting every key as live, one sign flipped.
const BLOCKS: &[Block] = &[
    Block {
        dict: "_fn_defaults",
        before: "",
        command: "הגדרות_הערות",
        document: "פתיחה#הערה[גוף ההערה הראשונה]. המשך#הערה_ב[הערה על הערה]. סיום#הערה[גוף ההערה השניה].\n",
        groups: &[],
    },
    Block {
        dict: "_sn_defaults",
        before: "",
        command: "הגדרות_הערות_צד",
        // A paragraph long enough to wrap. `מרווח` is the gutter between the two
        // columns, so it changes how wide the main column is — and a document of
        // one short line wraps the same at any width, which reported the gutter
        // as a dead setting.
        document: "#עם_הערות_צד[\nבראשית ברא אלקים את השמים ואת הארץ והארץ היתה תהו ובהו וחשך על פני תהום#הערת_גיליון[הערת צד ראשונה] ורוח אלקים מרחפת על פני המים ויאמר אלקים יהי אור#הערת_גיליון[הערת צד שניה] ויהי אור וירא אלקים את האור כי טוב.\n]\n",
        groups: &[],
    },
    Block {
        dict: "_md_defaults",
        before: "",
        command: "הגדרות_מדורגות",
        document: "פתיחה#מדור_א[הערת מדור]. המשך#מדור_ב[הערה על ההערה].\n\n#הערות_מדורגות()\n",
        groups: &[],
    },
    Block {
        dict: "_pp_defaults",
        before: "",
        command: "הגדרות_מדפים",
        document: "פתיחה#מדף_א[הערת מדף]. המשך#מדף_ב[הערה על ההערה].\n",
        groups: &[],
    },
    Block {
        dict: "_sf_defaults",
        before: "",
        command: "הגדרות_זרמים",
        document: "פתיחה#הערה_זרם(\"מקורות\")[ברכות ב.]. המשך#הערה_זרם(\"תוכן\")[גוף ההערה].\n",
        groups: &["מקורות", "תוכן"],
    },
    Block {
        dict: "_hd_defaults",
        before: "",
        command: "הגדרות_כותרות",
        // With a Latin word in the heading, because `רברבתי` is small capitals
        // and Hebrew has no case: a Hebrew-only heading is a document in which
        // that setting cannot do anything, which is not the same claim as the
        // setting being dead.
        document: "#כותרת1[שער Title]\n\nגוף המסמך.\n\n#כותרת2[תת שער]\n\nעוד גוף.\n",
        groups: &[],
    },
    Block {
        dict: "_ls_defaults",
        before: "",
        command: "הגדרות_רשימות",
        // **Both kinds of list**, because half this block's keys are about the
        // number: `מספור`, `ריווח_מספור` and `התחלה` have nothing to say about a
        // bulleted list, and a document with only bullets in it reported all
        // three as dead settings. A fence's document is as much a claim as its
        // assertion.
        document: "#רשימה[פריט ראשון][פריט שני]\n\n#ממוספרת[פריט ראשון][פריט שני][פריט שלישי]\n",
        groups: &[],
    },
    Block {
        dict: "_tb_defaults",
        // Striped, so that `צבע_פס` has stripes to paint — and asked for *before*
        // the key under test, so that `פסים` itself is still the fence's to set.
        before: "#הגדרות_טבלאות(פסים: true)\n",
        command: "הגדרות_טבלאות",
        // With a header row, for the same reason: `צבע_כותרת` paints nothing in a
        // table that has none.
        document: "#טבלה(עמודות: 2)[#כותרת_תא[ראש א]][#כותרת_תא[ראש ב]][תא א][תא ב][תא ג][תא ד]\n",
        groups: &[],
    },
    Block {
        dict: "_es_defaults",
        before: "",
        command: "הגדרות_הערות_סיום",
        document: "פתיחה#הערתסיום[גוף הערת הסיום]. סיום#הערתסיום[הערה שניה].\n\n#הערות_בסוף()\n",
        groups: &[],
    },
    Block {
        dict: "_nr_defaults",
        before: "",
        command: "הגדרות_מספור",
        document: "#כותרת1[פרק א]\n\nפתיחה#הערה[הערה]. \n\n#כותרת1[פרק ב]\n\nהמשך#הערה[הערה].\n",
        groups: &[],
    },
    Block {
        dict: "_rv_defaults",
        before: "",
        command: "הגדרות_סקירה",
        // With a name on the change, because `שמות` decides whether the
        // reviewer's name is printed and there is nothing to print without one.
        document: "פתיחה #הוספה(מאת: \"שאול\")[מלה שנוספה] #מחיקה(מאת: \"שאול\")[מלה שנמחקה] סיום.\n",
        groups: &[],
    },
];

/// A settings dictionary, its command, and a document that exercises it.
struct Block {
    /// The `#let _X_defaults = (…)` binding in `ksav.typ`, which is where the
    /// keys are read from. Never a list written here — that list is the thing
    /// that goes stale.
    dict: &'static str,
    /// The `#הגדרות_*` command that writes it.
    command: &'static str,
    /// Settings this block's document needs in force *before* the key under
    /// test — put in front of the fence's own line, so the key under test still
    /// wins when it is the same one.
    ///
    /// `צבע_פס` paints nothing in a table with no stripes, and asking for the
    /// stripes in the document — which comes *after* — overwrote `פסים` itself
    /// and reported it dead. Order is the whole of the difference.
    before: &'static str,
    /// A document with something on the page for the setting to reach.
    document: &'static str,
    /// The group names this block's dictionary-shaped keys are keyed by — stream
    /// names, for the apparatus that has them. Empty when the block has none.
    groups: &'static [&'static str],
}

/// How to vary a value, by the name of the key that holds it.
///
/// Keyed by **name** rather than by (dictionary, name) on purpose: `גודל` means
/// a size in all eleven blocks that have one, and a twelfth apparatus that grows
/// a `גודל` tomorrow is covered by the row that is already here. The rows that
/// have to be added are the ones for a genuinely new idea, and those are exactly
/// the ones somebody should have to think about.
///
/// Both values must be *valid* for the key. A pair that fails to compile is
/// reported as such rather than counted as a difference — an error message is
/// not evidence that a setting works.
const CONTRAST: &[(&str, &str, &str)] = &[
    // lengths and spacings
    ("גודל", "0.6em", "1.4em"),
    ("ריווח", "0em", "6em"),
    ("ריווח_בין", "0em", "4em"),
    ("ריווח_פריט", "0em", "3em"),
    ("ריווח_לפני", "0em", "5em"),
    ("ריווח_אחרי", "0em", "5em"),
    ("ריווח_מספור", "0em", "3em"),
    ("מרווח", "0em", "4em"),
    ("מרווח_אותיות", "0pt", "4pt"),
    ("הזחה", "0em", "5em"),
    ("הזחת_גוף", "0em", "5em"),
    ("גבהים", "1cm", "6cm"),
    ("יחס", "1.2", "6"),
    // colour, which only `probe::fills` and the text runs' own fill can see
    ("צבע", "rgb(\"#ff0000\")", "rgb(\"#0000ff\")"),
    ("צבע_פס", "rgb(\"#ff0000\")", "rgb(\"#0000ff\")"),
    ("צבע_כותרת", "rgb(\"#ff0000\")", "rgb(\"#0000ff\")"),
    // the enumerations
    ("סגנון", "\"normal\"", "\"italic\""),
    ("משקל", "\"regular\"", "\"bold\""),
    ("פריסה", "\"מוערם\"", "\"צד\""),
    ("תצוגה", "\"סימון\"", "\"סופי\""),
    ("יישור", "\"ימין\"", "\"מרכז\""),
    // A per-tier array where the block takes one — `_fn_defaults` and the banded
    // apparatuses read `מספור` as a tuple, and a bare string falls through their
    // `type(…) == array` test and is ignored. `shaped` gives it the default's
    // own shape, so one row covers both readings.
    ("מספור", "\"1\"", "\"א\""),
    ("סמן", "\"•\"", "\"—\""),
    // the switches
    ("קו", "false", "true"),
    ("קו_בין", "false", "true"),
    ("קו_תחתון", "false", "true"),
    ("רברבתי", "false", "true"),
    ("פסים", "false", "true"),
    ("הידוק", "false", "true"),
    ("עמוד_חדש", "false", "true"),
    ("שמות", "false", "true"),
    ("תוויות", "false", "true"),
    // the rest
    ("טורים", "1", "2"),
    ("התחלה", "1", "7"),
    ("אפס_לפי", "0", "1"),
    ("גופן", "\"Frank Ruhl Hofshi\"", "\"Noto Serif Hebrew\""),
    ("כותרת", "[אחת]", "[אחרת ארוכה יותר]"),
    ("כותרות", "[אחת]", "[אחרת ארוכה יותר]"),
    ("סימן", "(גודל: 0.6em)", "(גודל: 1.6em)"),
    ("זרמים", "(\"מקורות\", \"תוכן\")", "(\"תוכן\", \"מקורות\")"),
    // What stands at the head of an entry. Already a compound value, so `shaped`
    // passes it through whole — and the two ends of the axis are the one the
    // apparatus ships with and the one that says *nothing at all*, which is the
    // fourth of the plan's four ingredients and the one that has to take the
    // marker with it.
    ("ראש", "(\"מספר\", \"תווית\")", "()"),
    // The words an address prints around its numbers — one row covers every
    // apparatus that grew the knob, because the key name is shared vocabulary.
    ("כתובות", "(עמוד: \"עמ'\")", "(עמוד: \"p.\")"),
];

/// Where a shared key name means something else in one block, said out loud.
///
/// The premise of [`CONTRAST`] is that a key name is shared vocabulary — `גודל`
/// is a size everywhere, `קו` is *draw a rule* everywhere. Where that is not
/// true, this is the list, and the list is worth having for its own sake: a name
/// that means one thing in eleven places and another in the twelfth is a thing a
/// writer will get wrong, and it should have to be written down to survive.
///
/// `_tb_defaults.קו` is the one real instance. Everywhere else `קו` is *is there
/// a rule*; on a table it is *how thick the rules are*, because a table without
/// any is a different request (`קו: none`).
const OVERRIDE: &[(&str, &str, &str, &str)] = &[
    // Everywhere else `קו` is *is there a rule*; on a table it is *how thick the
    // rules are*, because a table without any is a different request (`קו: none`).
    ("_tb_defaults", "קו", "0.5pt", "4pt"),
    // `תוויות` is a per-tier array of label prefixes on the footnote apparatus
    // and a plain switch on the banded ones. Two settings, one word — worth
    // knowing, and arguably worth renaming.
    (
        "_fn_defaults",
        "תוויות",
        "(\"\", \"\")",
        "(\"\", \"על הערה: \")",
    ),
    // A font this engine actually bundles. The six faces are Frank Ruhl Hofshi,
    // David Libre, Cascadia Mono and New Computer Modern Math; naming anything
    // else asks Typst for a family it does not have, which falls back to the
    // document's own and renders identically — a *missing font* reported as a
    // dead setting.
    (
        "_hd_defaults",
        "גופן",
        "\"Frank Ruhl Hofshi\"",
        "\"David Libre\"",
    ),
    (
        "_tb_defaults",
        "גופן",
        "\"Frank Ruhl Hofshi\"",
        "\"David Libre\"",
    ),
    (
        "_es_defaults",
        "גופן",
        "\"Frank Ruhl Hofshi\"",
        "\"David Libre\"",
    ),
];

/// Everything a rendered page carries, in a form two renders can be compared by.
///
/// Four instruments and not one, because each of them is blind to something the
/// others see. That is not belt and braces — it is the whole finding of this
/// file said in code.
fn shape(body: &str) -> Result<String, String> {
    let doc = probe::layout(body, &DocConfig::default()).map_err(|d| {
        d.iter()
            .map(|x| x.message.clone())
            .collect::<Vec<_>>()
            .join("; ")
    })?;
    let mut out = String::new();
    // Position, size, and the face the glyphs actually came from — the last of
    // which is how a *style* is asked about at all. `#נטוי` on a family with no
    // italic comes back upright and nothing in the run's position says the
    // request was refused, which is the bug that put `font` and `italic` on this
    // struct in the first place.
    for r in probe::text_runs(&doc) {
        out.push_str(&format!(
            "t {} {:.2} {:.2} {:.2} {:.2} {} {} {} {} {}\n",
            r.page, r.x, r.y, r.size, r.width, r.font, r.italic, r.weight, r.fill, r.text
        ));
    }
    for f in probe::fills(&doc) {
        out.push_str(&format!(
            "f {} {:.2} {:.2} {}\n",
            f.page, f.x, f.y, f.colour
        ));
    }
    for s in probe::strokes(&doc) {
        out.push_str(&format!(
            "s {} {:.2} {:.2} {} {:.2}\n",
            s.page, s.x, s.y, s.colour, s.thickness
        ));
    }
    for (w, h) in probe::page_sizes(&doc) {
        out.push_str(&format!("p {w:.2} {h:.2}\n"));
    }
    Ok(out)
}

/// The prelude, as text. `include_str!` and not the crate's own copy: the one
/// inside the library is `pub(crate)`, and an integration test is a separate
/// crate. `apparatus_golden.rs` reads it exactly this way and for the same
/// reason.
const PRELUDE: &str = include_str!("../typst/ksav.typ");

/// The keys of one `#let _X_defaults = (…)` dictionary, read out of `ksav.typ`.
///
/// Off the prelude and never off a list here: a key added to a dictionary is
/// checked from the moment it exists, which is the property that makes this a
/// fence rather than a snapshot of one afternoon.
fn keys_of(dict: &str) -> Vec<(String, String)> {
    let head = format!("\n#let {dict} = (\n");
    let start = PRELUDE.find(&head).unwrap_or_else(|| {
        panic!("{dict} is not in ksav.typ — the fence is reading the wrong name")
    }) + head.len();
    let rest = &PRELUDE[start..];
    let end = rest
        .find("\n)")
        .unwrap_or_else(|| panic!("{dict} has no closing paren"));
    let mut out = Vec::new();
    for line in rest[..end].lines() {
        // A key line starts at exactly two spaces of indent — anything deeper is
        // inside a nested value, and anything shallower is not in the dictionary.
        let Some(body) = line.strip_prefix("  ") else {
            continue;
        };
        if body.starts_with(' ') || body.starts_with("//") {
            continue;
        }
        let Some((name, value)) = body.split_once(':') else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() || !name.chars().all(|c| c == '_' || !c.is_ascii()) {
            continue;
        }
        // The default, up to the comment that explains it. Only its *shape* is
        // wanted — array, dictionary or scalar — so that the contrasting value
        // can be given the same one.
        let value = value
            .split("//")
            .next()
            .unwrap_or("")
            .trim()
            .trim_end_matches(',');
        out.push((name.to_string(), value.to_string()));
    }
    out
}

/// A contrasting value, shaped like the default it replaces.
///
/// An apparatus whose `גודל` is a per-tier array cannot be handed one length:
/// `_ap_pick` would read the scalar as the answer for every group, which is a
/// different setting doing a different thing, and a fence that changes two
/// things at once has proved nothing about either.
fn shaped(scalar: &str, default: &str, groups: &[&str]) -> Option<String> {
    // A candidate that is already a compound value is its own shape. `סימן` is
    // the marker's own look — `(גודל: 0.6em)` — and its default is an empty
    // dictionary, which is indistinguishable from a per-group one by looking at
    // it. The row in `CONTRAST` says what it is by giving it whole.
    if scalar.starts_with('(') {
        return Some(scalar.to_string());
    }
    if default.starts_with('(') && default.ends_with(')') {
        let inner = &default[1..default.len() - 1];
        if inner.trim() == ":" || inner.contains(':') {
            // A dictionary, keyed by group. With no groups declared there is
            // nothing to key it by and the block says so rather than guessing.
            if groups.is_empty() {
                return None;
            }
            let body: Vec<String> = groups
                .iter()
                .map(|g| format!("\"{g}\": {scalar}"))
                .collect();
            return Some(format!("({})", body.join(", ")));
        }
        // An array: the same length, so the per-tier reading is unchanged.
        let n = inner
            .split(',')
            .filter(|s| !s.trim().is_empty())
            .count()
            .max(1);
        let body: Vec<&str> = (0..n).map(|_| scalar).collect();
        return Some(format!("({},)", body.join(", ")));
    }
    Some(scalar.to_string())
}

#[test]
fn every_setting_changes_the_page() {
    let mut dead = Vec::new();
    let mut unknown = Vec::new();
    let mut failed = Vec::new();
    let mut checked = 0;

    for block in BLOCKS {
        for (key, default) in keys_of(block.dict) {
            let over = OVERRIDE
                .iter()
                .find(|(d, n, _, _)| *d == block.dict && *n == key)
                .map(|(_, _, a, b)| (*a, *b));
            let Some((a, b)) = over.or_else(|| {
                CONTRAST
                    .iter()
                    .find(|(n, _, _)| *n == key)
                    .map(|(_, a, b)| (*a, *b))
            }) else {
                unknown.push(format!("{}.{key}", block.dict));
                continue;
            };
            let (Some(a), Some(b)) = (
                shaped(a, &default, block.groups),
                shaped(b, &default, block.groups),
            ) else {
                unknown.push(format!(
                    "{}.{key}: its default is a dictionary and the block declares no groups to key it by",
                    block.dict
                ));
                continue;
            };
            let doc = |v: &str| {
                format!(
                    "{}#{}({key}: {v})\n{}",
                    block.before, block.command, block.document
                )
            };
            let (one, two) = (shape(&doc(&a)), shape(&doc(&b)));
            match (one, two) {
                (Ok(one), Ok(two)) => {
                    checked += 1;
                    if one == two {
                        dead.push(format!(
                            "#{}({key}: …) — {a} and {b} render byte-identical pages",
                            block.command
                        ));
                    }
                }
                (Err(e), _) | (_, Err(e)) => {
                    failed.push(format!("#{}({key}: …) did not compile: {e}", block.command))
                }
            }
        }
    }

    // Named, never counted. A key this fence could not exercise is a key nobody
    // is watching, and the number of them is not the interesting part.
    assert!(
        unknown.is_empty(),
        "these keys have no contrasting value in CONTRAST, so nothing checks them:\n  {}\n\
         Add a row for each — the list is keyed by key name, so one row usually covers \
         every apparatus that has grown the same knob.",
        unknown.join("\n  ")
    );
    assert!(
        failed.is_empty(),
        "these settings did not compile with the values this fence gave them, so \
         nothing was learnt about them:\n  {}",
        failed.join("\n  ")
    );
    // The floor. Without it the day a parse change makes `keys_of` return nothing
    // is the day this passes having measured nothing at all — the shape
    // `skips.test.mjs` sweeps the suite for.
    assert!(
        checked >= 80,
        "only {checked} settings were exercised; the prelude has far more than that, \
         so the dictionaries are not being read"
    );
    assert!(
        dead.is_empty(),
        "settings that are declared and change nothing on the page:\n  {}",
        dead.join("\n  ")
    );
}

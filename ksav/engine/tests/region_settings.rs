//! Every key `#אזור` accepts changes the page.
//!
//! `settings_live.rs` sweeps the `#let _X_defaults = (…)` dictionaries and asks
//! of each key whether two renderings differ. A **region's** keys are not in one
//! of those dictionaries — they are arguments to `#אזור` — so the sweep walked
//! straight past them, and that blind spot was predicted in writing the night
//! before it was landed in:
//!
//! > `settings_live.rs` covers `_X_defaults` dictionaries, not `_rg_own`, so
//! > that fence would not have caught this one.
//!
//! It did not. Four of `#אזור`'s keys turned out to be read by nothing —
//! `גלישה` never reached the overflow cap, `גובה` never reached it either,
//! `ראש` reached neither the renderer nor the marker, and `שומר_מקום` had no
//! layout to switch between — and every one was found by a person trying to use
//! the feature rather than by a test.
//!
//! So: the same idea, region-shaped. The key list is read **out of the prelude**
//! rather than written here, because a list written here is the thing that goes
//! stale — a key added tomorrow is swept the moment it is added, or this fails.

mod common;

use ksav_engine::{probe, DocConfig};

/// The keys of `#let _rg_own = (…)`, read out of `ksav.typ`.
fn region_keys() -> Vec<String> {
    let prelude = include_str!("../typst/ksav.typ");
    let at = prelude
        .find("#let _rg_own = (")
        .expect("`_rg_own` is not in ksav.typ — has the region's key list moved?");
    let rest = &prelude[at..];
    let end = rest.find("\n)").expect("`_rg_own` is not closed");
    rest[..end]
        .match_indices('"')
        .map(|(i, _)| i)
        .collect::<Vec<_>>()
        .chunks(2)
        .filter(|c| c.len() == 2)
        .map(|c| rest[c[0] + 1..c[1]].to_string())
        .collect()
}

/// How to vary each key, and what to put on the page for it to reach.
///
/// `body` is spliced after the region declaration. Two values per key, both
/// valid — a pair that fails to compile is reported as such rather than counted
/// as a difference, because an error is not evidence that a setting works.
struct Vary {
    a: &'static str,
    b: &'static str,
    /// Extra region arguments both renderings carry, when the key needs company
    /// to mean anything.
    with: &'static str,
    body: &'static str,
}

/// A region one line tall that continues what does not fit onto the next page.
///
/// Company for the two keys that only mean something once a note is spilling.
const SPILLING: &str = ", מיקום: \"רגל\", גובה: שורות(1), גלישה: (\"עמוד_הבא\",)";

const NOTES: &str = "פתיחה.\n\nא#הערה(אזור: \"צר\")[הערה ראשונה] ב#הערה(אזור: \"צר\")[הערה שניה] \
                     ג#הערה(אזור: \"צר\")[הערה שלישית] ד#הערה(אזור: \"צר\")[הערה רביעית]";

/// A grid region of two channels over three simanim, the second channel silent
/// in the third.
///
/// Company for the four keys the row plan reads. Every one of them needs a page
/// the others do not: `מחזור` needs a **third** row, or repeating the last plan
/// and cycling the list agree; `ריק` needs a cell with nothing in it, or holding
/// the place and dropping it agree; and both gaps need two of something to put a
/// gap between. The silent one is the **second** channel on purpose: the first
/// column is the one at the right edge in a Hebrew sefer, so dropping its
/// neighbour leaves it exactly where it was and every one of these keys would
/// report itself dead. Dropping the *first* moves the second, and that is the
/// difference these renders are looking for.
const WRAP_GRID: &str = ", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\"";

const WRAP: &str = "#ערוץ(\"א\", אזור: \"צר\")\n#ערוץ(\"ב\", אזור: \"צר\")\n\
                    #כותרת[פרק א]\n\n\
                    ראשון#הערה(ערוץ: \"א\")[אלף] וגם#הערה(ערוץ: \"ב\")[בית] סוף.\n\n\
                    #כותרת[פרק ב]\n\n\
                    שני#הערה(ערוץ: \"א\")[גימל] וגם#הערה(ערוץ: \"ב\")[דלת] סוף.\n\n\
                    #כותרת[פרק ג]\n\n\
                    שלישי#הערה(ערוץ: \"ב\")[הא] סוף.";

fn vary(key: &str) -> Option<Vary> {
    let notes = Vary {
        a: "",
        b: "",
        with: "",
        body: NOTES,
    };
    Some(match key {
        "מיקום" => Vary { a: "\"רגל\"", b: "\"סוף\"", ..notes },
        // The row plan. Two shapes and three rows, so that the third row is the
        // one the two answers disagree about: repeat the last plan, or start the
        // list again.
        "מחזור" => Vary {
            a: "false",
            b: "true",
            with: ", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", \
                  טורים: ((1fr, 1fr), (1fr,))",
            body: WRAP,
        },
        "מרווח_טורים" => Vary { a: "0pt", b: "4em", with: WRAP_GRID, body: WRAP },
        "ריווח_טורים" => Vary { a: "0pt", b: "3em", with: WRAP_GRID, body: WRAP },
        "ריק" => Vary { a: "\"ריק\"", b: "\"דלג\"", with: WRAP_GRID, body: WRAP },
        // A channel with something to say and no column in its row: a row of
        // its own, or a column added to the one it was left out of. The third
        // answer is a refusal, which cannot be a contrast because a document
        // that does not compile is not a page to compare.
        // A box told not to spill, with far more in it than it can hold: the
        // mark at the clipped edge, or the clean edge for a writer who knows
        // what they are choosing.
        "סימן_חיתוך" => Vary {
            a: "none",
            b: "\"…\"",
            with: ", מיקום: \"רגל\", גובה: שורות(1), גלישה: ()",
            ..notes
        },
        "עודף" => Vary {
            a: "\"שורה_נוספת\"",
            b: "\"טור_נוסף\"",
            with: ", מיקום: \"רגל\", פריסה: \"צד\", יחידה: \"כותרת\", טורים: ((1fr,),)",
            body: WRAP,
        },
        "גובה" => Vary { a: "1cm", b: "4cm", with: ", מיקום: \"רגל\"", ..notes },
        "כותרת" => Vary { a: "none", b: "\"ביאורים\"", with: ", מיקום: \"סוף\"", ..notes },
        "גלישה" => Vary {
            a: "()",
            b: "(\"הקטנה\",)",
            with: ", מיקום: \"רגל\", גובה: שורות(2)",
            ..notes
        },
        // The rest of the shrink ladder, and the tightening. Both are judgements
        // about *this* sefer — how far a peirush may be dropped before it stops
        // being a peirush, and how much may come out between its letters before
        // it stops being readable — which is why they belong to a region and not
        // to the apparatus in general.
        "הקטנה_צעד" => Vary {
            a: "0.02",
            b: "0.3",
            with: ", מיקום: \"רגל\", גובה: שורות(1), גלישה: (\"הקטנה\",), הקטנה_מזערית: 0.5",
            ..notes
        },
        "כיווץ_מידה" => Vary {
            a: "0pt",
            b: "-0.06em",
            with: ", מיקום: \"רגל\", גובה: שורות(1), גלישה: (\"כיווץ_אותיות\",)",
            ..notes
        },
        "הקטנה_מזערית" => Vary {
            a: "0.95",
            b: "0.6",
            with: ", מיקום: \"רגל\", גובה: שורות(1), גלישה: (\"הקטנה\",)",
            ..notes
        },
        "שומר_מקום" => Vary {
            a: "true",
            b: "false",
            with: ", מיקום: \"רגל\", גובה: שורות(1)",
            body: "#אזור(\"תחתון\", מיקום: \"רגל\", גובה: שורות(1))\nפתיחה#הערה(אזור: \"תחתון\")[למטה] וסוף.",
        },
        "ראש" => Vary {
            a: "(\"מספר\",)",
            b: "(\"עמוד\", \"מספר\")",
            with: ", מיקום: \"סוף\"",
            ..notes
        },
        "מספור_כתובת" => Vary {
            a: "\"1\"",
            b: "\"א\"",
            with: ", מיקום: \"סוף\", ראש: (\"עמוד\",)",
            ..notes
        },
        "דף_ראשון" => Vary {
            a: "2",
            b: "40",
            with: ", מיקום: \"סוף\", ראש: (\"דף\",)",
            ..notes
        },
        "עמוד_חדש" => Vary { a: "false", b: "true", with: ", מיקום: \"סוף\"", ..notes },
        "פריסה" | "טורים" | "יחידה" => Vary {
            a: match key {
                "פריסה" => "\"מוערם\"",
                "טורים" => "(1fr, 1fr)",
                _ => "none",
            },
            b: match key {
                "פריסה" => "\"צד\"",
                "טורים" => "(1fr, 4fr)",
                _ => "\"כותרת\"",
            },
            // `פריסה` must not appear twice, so the key under test never comes
            // with a value of its own for company.
            with: if key == "פריסה" {
                ", מיקום: \"רגל\""
            } else {
                ", מיקום: \"רגל\", פריסה: \"צד\""
            },
            // **Two** units, each with a note in both channels. One unit is one
            // row, and one row is exactly what no synchronisation already gives —
            // so a document with a single heading cannot tell `יחידה` from its
            // own absence, and would report a live key dead.
            body: "#ערוץ(\"א\", אזור: \"צר\")\n#ערוץ(\"ב\", אזור: \"צר\")\n\
                   #כותרת[פרק א]\n\n\
                   ראשון#הערה(ערוץ: \"א\")[אלף] וגם#הערה(ערוץ: \"ב\")[בית] סוף.\n\n\
                   #כותרת[פרק ב]\n\n\
                   שני#הערה(ערוץ: \"א\")[גימל] וגם#הערה(ערוץ: \"ב\")[דלת] סוף.",
        },
        // A note that outgrows its region is continued, and these two say how.
        // Both need a note that actually spills, which none of the documents
        // above has: a region of one line and forty words in one note.
        "תפר" => Vary {
            // Zero cuts wherever the measurement landed and never looks back;
            // twenty is far enough to reach the sentence that ends two words
            // earlier. The seam is the only difference between the two pages.
            a: "0",
            b: "20",
            with: SPILLING,
            body: "פתיחה.\n\nא#הערה(אזור: \"צר\")[מילה01 מילה02 מילה03 מילה04 מילה05 מילה06 מילה07 מילה08 מילה09 מילה10 מילה11 מילה12. מילה13 מילה14 מילה15 מילה16 מילה17 מילה18 מילה19 מילה20 מילה21 מילה22 מילה23 מילה24 מילה25 מילה26 מילה27 מילה28 מילה29 מילה30 מילה31 מילה32 מילה33 מילה34 מילה35 מילה36 מילה37 מילה38 מילה39 מילה40]",
        },
        "סימן_בהמשך" => Vary {
            a: "false",
            b: "true",
            with: SPILLING,
            body: "פתיחה.\n\nא#הערה(אזור: \"צר\")[מילה01 מילה02 מילה03 מילה04 מילה05 מילה06 מילה07 מילה08 מילה09 מילה10 מילה11 מילה12 מילה13 מילה14 מילה15 מילה16 מילה17 מילה18 מילה19 מילה20 מילה21 מילה22 מילה23 מילה24 מילה25 מילה26 מילה27 מילה28 מילה29 מילה30 מילה31 מילה32 מילה33 מילה34 מילה35 מילה36 מילה37 מילה38 מילה39 מילה40]",
        },
        // `סירוב` refuses to compile by design, so it cannot be told from
        // `צמצום` by diffing two pages. It has a test of its own that reads the
        // refusal and the numbers in it — see `placements.rs`.
        "חריגה" => return None,
        _ => return None,
    })
}

/// The document one rendering is made from, so a failure can be reproduced by
/// hand rather than reasoned about.
fn render_doc(key: &str, value: &str, v: &Vary) -> String {
    let arg = if value.is_empty() {
        String::new()
    } else {
        format!(", {key}: {value}")
    };
    format!(
        "#מסמך(אזור_הערות: 4cm)[
#אזור(\"צר\"{}{})
{}
]",
        v.with, arg, v.body
    )
}

/// Render a region with one value of one key.
fn render(key: &str, value: &str, v: &Vary) -> Option<(Vec<probe::TextRun>, Vec<probe::Fill>)> {
    let arg = if value.is_empty() {
        String::new()
    } else {
        format!(", {key}: {value}")
    };
    let doc = format!(
        "#מסמך(אזור_הערות: 4cm)[\n#אזור(\"צר\"{}{})\n{}\n]",
        v.with, arg, v.body
    );
    let laid = probe::layout(&doc, &DocConfig::default())
        .unwrap_or_else(|d| panic!("{key}: {value} did not compile: {d:?}\n{doc}"));
    Some((probe::text_runs(&laid), probe::fills(&laid)))
}

/// Every key `#אזור` takes does something, or is declared not to.
#[test]
fn every_region_key_changes_the_page() {
    let keys = region_keys();
    assert!(
        keys.len() >= 10,
        "only {} region keys were read out of the prelude — is `_rg_own` still a \
         tuple of string literals?",
        keys.len()
    );

    let mut dead = Vec::new();
    let mut unswept = Vec::new();
    for key in &keys {
        let Some(v) = vary(key) else {
            // Not an escape hatch: a key with no way to vary it is reported, and
            // the only ones that may be are the ones named in `vary` with a
            // reason. A key nobody has thought about falls through to here.
            if key != "חריגה" {
                unswept.push(key.clone());
            }
            continue;
        };
        let (a_runs, a_fills) = render(key, v.a, &v).unwrap();
        let (b_runs, b_fills) = render(key, v.b, &v).unwrap();
        let same_text = a_runs.len() == b_runs.len()
            && a_runs.iter().zip(&b_runs).all(|(x, y)| {
                x.page == y.page
                    && (x.x - y.x).abs() < 0.01
                    && (x.y - y.y).abs() < 0.01
                    && (x.size - y.size).abs() < 0.01
                    && x.text == y.text
                    && x.fill == y.fill
            });
        let same_fills = a_fills.len() == b_fills.len();
        if same_text && same_fills {
            dead.push(format!("{key} (in: {})", render_doc(key, v.b, &v)));
        }
    }

    assert!(
        unswept.is_empty(),
        "these region keys have no contrasting values, so nothing checks them: {unswept:?}\n\
         Add a row to `vary` — a key that cannot be told apart from its own absence \
         is the defect this file exists to catch."
    );
    assert!(
        dead.is_empty(),
        "these region keys changed nothing on the page: {dead:?}\n\
         A key `#אזור` accepts and nothing reads is a control that lies."
    );
}

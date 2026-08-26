//! The sitting stress: large mixed documents driven end to end.
//!
//! Every fence in this repository was written against one mechanism in
//! isolation, which is exactly how the 23 August audit found its worst
//! defects — in the seams, where two answers that were each fenced met and
//! disagreed. These documents stack mechanisms the way a real sefer does:
//! several regions and channels at once, native footnotes beside collected
//! ones, names and referrals and one name given twice, a restart, a spilling
//! giant under the tripwire, a quoted parenthesis in a declared name, carried
//! margin notes meeting pinned glosses. Each assertion asks about the
//! combination, not about any part.

use ksav_engine::{probe, DocConfig};

/// Where a well-behaved page stops: the folio's own line.
const PAGE_FOOT: f64 = 799.02;

/// Words that shape as one run and sort as one sequence.
fn words(n: usize, tag: &str) -> Vec<String> {
    (1..=n).map(|i| format!("{tag}{i:03}")).collect()
}

fn all_text(runs: &[probe::TextRun]) -> String {
    probe::lines(runs, 5.0)
        .into_iter()
        .map(|l| l.reading)
        .collect::<Vec<_>>()
        .join("\n")
}

// ---------------------------------------------------------------------------
// One: the whole sefer at once.
// ---------------------------------------------------------------------------

fn the_sefer() -> String {
    let giant = words(300, "ענק").join(" ");
    let mut s = String::from(
        "#מסמך(אזהרת_גלישה: 2)[\n\
         #תוכן()\n\
         #אזור(\"מרגליות\", מיקום: \"רגל\", גובה: שורות(4))\n\
         #ערוץ(\"מפרש\", אזור: \"מרגליות\")\n\
         #ערוץ(\"ביאור(חדש)\", מיקום: \"חוץ\")\n",
    );
    for p in 1..=8usize {
        s.push_str(&format!("= פרק {p}\n\n"));
        for i in 1..=14usize {
            let mut para = format!("פסוק {p}.{i} וזהו גופו של ענין ודיו למלא את השורה כראוי.");
            match (p + i) % 5 {
                0 => para.push_str(&format!("#הערה[הערת ברירת המחדל של פסוק {p}.{i}.] ")),
                1 => para.push_str(&format!(
                    "#הערה(ערוץ: \"מפרש\")[מפרש על {p}.{i}: פירוש קצר ולענין.] "
                )),
                // A margin column wraps every word onto its own line, so this
                // note carries a single shaped token the assertions can find.
                2 => para.push_str(&format!(
                    "#הערה(ערוץ: \"ביאור(חדש)\")[ביאור בשם־מכיל־סוגריים {p}־{i}.] "
                )),
                3 => para.push_str(&format!("#הערת_גיליון[גיליון על {p}.{i}, בצד הדף.] ")),
                _ => {}
            }
            if p == 2 && i == 7 {
                para.push_str(&format!("#הערה(ערוץ: \"מפרש\")[{giant}] "));
            }
            if p == 3 && i == 1 {
                para.push_str("#הערה(ערוץ: \"מפרש\", שם: \"מקור\")[הראשונה שנקראה בשם מקור.] ");
            }
            if p == 5 && i == 4 {
                para.push_str("#הערה(ערוץ: \"מפרש\", שם: \"מקור\")[השניה שיש לה אותו שם.] ");
            }
            if p == 6 && i == 2 {
                para.push_str(
                    "ועיין הפניה#הפניה_להערה(\"מקור\"). והשניה#הפניה_להערה(\"מקור\") כפולה. ",
                );
            }
            if p == 2 && i == 3 {
                para.push_str("#הגדרות_מונה(\"דעות\", מספור: \"א\")דעה #מונה(\"דעות\") לפני. ");
            }
            if p == 4 && i == 9 {
                para.push_str("#התחל_מספור(שם: \"דעות\")דעה #מונה(\"דעות\") אחת. ");
            }
            if p == 6 && i == 11 {
                para.push_str("דעה #מונה(\"דעות\") שנית. ");
            }
            s.push_str(&para);
            s.push_str("\n\n");
        }
        s.push_str("#מעבר_עמוד\n");
    }
    s.push_str("]\n");
    s
}

#[test]
fn the_whole_sefer_at_once_holds_every_rule_together() {
    let doc = match probe::layout(&the_sefer(), &DocConfig::default()) {
        Ok(d) => d,
        Err(diags) => panic!(
            "the mixed sefer refused to compile: {:?}",
            diags.first().map(|d| d.message.clone())
        ),
    };
    let runs = probe::text_runs(&doc);
    let page = all_text(&runs);

    assert!(
        doc.pages().len() >= 12,
        "an eight-siman sefer with apparatus laid out as {} pages",
        doc.pages().len()
    );

    // Nothing prints below the folio, wherever this document's own geometry
    // puts the folio: a scanned band legitimately slides it down from the
    // default line, so the bound is relative, not the constant other
    // documents fence against. Two tiers: at most one run per page below the
    // ordinary foot line and it must read as a page number; nothing at all
    // within a centimetre of the sheet's edge.
    for pg in 1..=doc.pages().len() {
        let mine: Vec<_> = runs.iter().filter(|r| r.page == pg).collect();
        let low: Vec<_> = mine.iter().filter(|r| r.y > PAGE_FOOT + 1.0).collect();
        assert!(
            low.iter().all(|r| {
                let t = r.text.trim();
                !t.is_empty()
                    && (t.chars().all(|c| c.is_ascii_digit())
                        || t.chars().all(|c| ('\u{5D0}'..='\u{5EA}').contains(&c)))
            }),
            "page {pg} has non-folio ink below the foot line: {:?}",
            low.iter()
                .map(|r| (r.y, r.text.clone()))
                .collect::<Vec<_>>()
        );
        assert!(
            low.len() <= 1,
            "page {pg} has {} runs below the foot line",
            low.len()
        );
        let deepest = mine.iter().map(|r| r.y).fold(0.0f64, f64::max);
        assert!(
            deepest < 830.0,
            "page {pg}'s lowest ink sits at {deepest}pt, inside a centimetre of the sheet's edge"
        );
    }

    assert!(
        !runs.iter().any(|r| r.text.contains('?')),
        "a question mark reached the page: an unresolved reference"
    );

    assert!(
        runs.iter().any(|r| r.text.contains("כפול")),
        "the duplicated name passed in silence"
    );

    assert!(
        page.contains("הגלישה נמשכת"),
        "a 300-word note in a four-line band tripped no wire"
    );
    let got = words(300, "ענק")
        .iter()
        .filter(|w| page.contains(w.as_str()))
        .count();
    assert_eq!(got, 300, "{got} of 300 giant-note words reached a page");

    // The quoted-parenthesis channel reserved and drew: its note is on the
    // paper, not filed into silence. Sought in fragments — a margin column
    // breaks the sentence across lines.
    // The quoted-parenthesis channel reserved and drew: its notes are on the
    // paper, not filed into silence. Each carries one shaped token, since a
    // margin column wraps every word onto its own line.
    for p in 1..=8usize {
        for i in 1..=14usize {
            if (p + i) % 5 == 2 {
                let tag = format!("{p}־{i}");
                assert!(
                    page.contains(&tag),
                    "the parenthesised channel's note {tag} never printed"
                );
            }
        }
    }

    // The restart governed its own series: א before it, א again after it, ב
    // next — and nothing else in the sefer renumbered with it.
    assert!(
        page.contains("דעה א לפני"),
        "the pre-restart member is wrong"
    );
    assert!(
        page.contains("דעה א אחת"),
        "the restarted series did not begin again at alef"
    );
    assert!(
        page.contains("דעה ב שנית"),
        "the post-restart count skipped"
    );
}

// ---------------------------------------------------------------------------
// Two: two margins, one occupancy, and a carry that lands on a pinned gloss.
// ---------------------------------------------------------------------------

fn the_margins() -> String {
    let long = words(60, "ארוך").join(" ");
    let filler = "טקסט צפוף למלא את השורה ולדחוק את השוליים עוד ועוד ועוד. ".repeat(6);
    let mut s = String::from("#עם_הערות_צד[\n");
    // Three dense stretches whose glosses fill both margin columns, with a
    // long note at each stretch's end — several of these must be carried
    // onward. Every stretch opens with a pinned gloss (הזזה: false), so
    // whichever page a carried note lands on, a pin is there ahead of it.
    // No explicit break: a pagebreak may not live inside a container, so the
    // pagination here is the text's own.
    for stretch in 1..=3usize {
        s.push_str(&format!(
            "נעוצה{stretch} בראש#הערת_גיליון(הזזה: false)[הגהה {stretch} נעוצה במקומה ואינה זזה למען אף שכנה.] "
        ));
        for i in 1..=10usize {
            let w = match (stretch + i) % 3 {
                0 => format!("מילה{i}#הערת_ימין[ימין {stretch}/{i}: קצר.] "),
                _ => format!("מילה{i}#הערת_גיליון[גיליון {stretch}/{i}: קצר גם כן.] "),
            };
            s.push_str(&w);
            s.push_str(&filler);
        }
        if stretch < 3 {
            s.push_str(&format!("סוף הקטע#הערת_גיליון[{long}] "));
        }
        s.push_str("\n\n");
    }
    s.push_str("]\n");
    s
}

#[test]
fn margins_share_one_occupancy_and_a_carry_never_overprints_a_pin() {
    let doc = match probe::layout(&the_margins(), &DocConfig::default()) {
        Ok(d) => d,
        Err(diags) => panic!(
            "the margins document refused to compile: {:?}",
            diags.first().map(|d| d.message.clone())
        ),
    };
    let runs = probe::text_runs(&doc);
    let page = all_text(&runs);

    let below: Vec<_> = runs.iter().filter(|r| r.y > PAGE_FOOT + 1.0).collect();
    assert!(
        below.is_empty(),
        "{} runs print below the folio",
        below.len()
    );

    // Nothing lost from either column, including every word of the two
    // carried sixty-word notes.
    for w in words(60, "ארוך") {
        assert!(
            page.contains(w.as_str()),
            "a carried note lost {w} somewhere across the breaks"
        );
    }

    // Wherever a carried note and a pinned gloss share a page and a column,
    // the carry cleared the pin rather than stacking onto it.
    let pins: Vec<&probe::TextRun> = runs
        .iter()
        .filter(|r| r.text.starts_with("נעוצה"))
        .collect();
    assert!(pins.len() >= 3, "a pinned gloss went missing");
    let mut colocated = 0;
    for pin in &pins {
        let near: Vec<f64> = runs
            .iter()
            .filter(|r| r.page == pin.page && r.text.contains("ארוך"))
            .map(|r| r.y)
            .collect();
        if near.is_empty() {
            continue;
        }
        colocated += 1;
        let nearest = near.iter().fold(f64::MAX, |m, y| m.min((y - pin.y).abs()));
        assert!(
            nearest > 4.0,
            "carried ink sits {nearest}pt from the pinned gloss it must clear"
        );
    }
    assert!(
        colocated > 0,
        "no carried note ever shared a page with a pin: the scenario proves nothing"
    );
}

// ---------------------------------------------------------------------------
// Three: an over-asked reserve under each policy, and the quoted paren.
// ---------------------------------------------------------------------------

fn over_asked() -> String {
    let body = words(40, "מ").join(" ");
    format!(
        "#מסמך(אזור_הערות: 1cm)[\n\
         #אזור(\"ב\", מיקום: \"רגל\", גובה: שורות(6))\n\
         פתיחה#הערה(אזור: \"ב\")[{body}] וסוף.\n\
         ]"
    )
}

fn policy(grow_flow_refuse: &str) -> DocConfig {
    DocConfig {
        reserve_overflow: grow_flow_refuse.to_string(),
        ..Default::default()
    }
}

#[test]
fn the_three_policies_answer_an_over_asked_inline_reserve() {
    // Grow, the default: the inline 1cm is raised, everything prints, the
    // folio keeps its line.
    let grown = probe::layout(&over_asked(), &policy("grow")).expect("grow refused");
    let runs = probe::text_runs(&grown);
    let page = all_text(&runs);
    for w in words(40, "מ") {
        assert!(page.contains(w.as_str()), "grow lost {w}");
    }
    assert!(runs.iter().all(|r| r.y <= PAGE_FOOT + 1.0));

    // Flow: the writer's strip stays, the excess continues on later leaves —
    // still nothing off the paper.
    let flowed = probe::layout(&over_asked(), &policy("flow")).expect("flow refused");
    let runs = probe::text_runs(&flowed);
    let page = all_text(&runs);
    for w in words(40, "מ") {
        assert!(page.contains(w.as_str()), "flow lost {w}");
    }
    assert!(runs.iter().all(|r| r.y <= PAGE_FOOT + 1.0));

    // Refuse: stops before layout with both numbers.
    let err = probe::layout(&over_asked(), &policy("refuse")).expect_err("refuse set");
    let said = err.iter().map(|d| d.message.clone()).collect::<String>();
    assert!(said.contains("cm"), "the refusal named no numbers: {said}");
}

#[test]
fn a_channel_named_with_a_parenthesis_reserves_and_draws() {
    let doc = "#ערוץ(\"כלי(שרת)\", מיקום: \"רגל\")\n\
               גוף#הערה(ערוץ: \"כלי(שרת)\")[הערה בתוך שם משוער בסוגריים.] וסוף.";
    let out = probe::layout(doc, &DocConfig::default()).expect("parenthesised name refused");
    let page = all_text(&probe::text_runs(&out));
    assert!(
        page.contains("הערה בתוך שם משוער בסוגריים"),
        "the parenthesised channel's note never printed"
    );
}

//! The catalogue of sefarim a Torah document cites, and the order they go in.
//!
//! This exists for one feature and it is worth stating what that feature is,
//! because the shape of everything here follows from it: **every sefer has a
//! מפתח מקורות at the back, everybody builds it by hand, and everybody's is
//! wrong.** Building it automatically needs three things a plain string cannot
//! give you — that ב״ב and בבא בתרא are the same masechta, that בבא בתרא comes
//! after בבא מציעא and not after אבות, and that ג. comes before ג: which comes
//! before ד. Alphabetical order is the *wrong* order for a source index; a
//! reader looks for a masechta where it sits in Shas.
//!
//! So the catalogue carries a canonical name, a sort rank, and the abbreviations
//! people actually write. It lives in Rust rather than in the Typst prelude for
//! two reasons: the prelude cannot be queried by the editor, and the editor wants
//! the same table for autocomplete. `typst_table()` generates the prelude's copy,
//! so there is exactly one list and it is this one.

/// Where a sefer sits in the traditional order.
///
/// The numbers are spaced so a sefer can be inserted between two others without
/// renumbering, and grouped so that a whole class sorts together: all of Tanach
/// before all of Shas, all of Shas before the poskim.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Tanach,
    Mishnah,
    Midrash,
    Rambam,
    Poskim,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Tanach => "tanach",
            Kind::Mishnah => "mishnah",
            Kind::Midrash => "midrash",
            Kind::Rambam => "rambam",
            Kind::Poskim => "poskim",
        }
    }

    /// The Hebrew group heading a source index prints above this class.
    pub fn heading(self) -> &'static str {
        match self {
            Kind::Tanach => "תנ״ך",
            Kind::Mishnah => "משנה וגמרא",
            Kind::Midrash => "מדרש",
            Kind::Rambam => "רמב״ם",
            Kind::Poskim => "הלכה",
        }
    }
}

pub struct Sefer {
    /// The name the index prints, however the writer spelled it.
    pub canonical: &'static str,
    pub kind: Kind,
    /// Sort rank within the whole catalogue.
    pub order: u32,
    /// The abbreviations and spellings that mean this sefer. The canonical name
    /// is always matched too and is not repeated here.
    pub aliases: &'static [&'static str],
}

macro_rules! s {
    ($name:literal, $kind:ident, $order:literal $(, $alias:literal)* $(,)?) => {
        Sefer {
            canonical: $name,
            kind: Kind::$kind,
            order: $order,
            aliases: &[$($alias),*],
        }
    };
}

/// Every sefer the index knows, in the order it prints them.
///
/// Not exhaustive and not meant to be — a document may cite anything, and one
/// that does gets its citation in a final "others" group sorted alphabetically
/// (see `rank`). What this list buys is that the sefarim a Torah document cites
/// *most* land in the right place without anyone configuring anything.
pub const SEFARIM: &[Sefer] = &[
    // ── תנ״ך ──────────────────────────────────────────────────────────────
    s!("בראשית", Tanach, 1001, "בר'", "בר"),
    s!("שמות", Tanach, 1002, "שמ'"),
    s!("ויקרא", Tanach, 1003, "ויק'"),
    s!("במדבר", Tanach, 1004, "במד'"),
    s!("דברים", Tanach, 1005, "דב'"),
    s!("יהושע", Tanach, 1011, "יהו'"),
    s!("שופטים", Tanach, 1012, "שופ'"),
    s!("שמואל א", Tanach, 1013, "ש\"א", "שמואל א'"),
    s!("שמואל ב", Tanach, 1014, "ש\"ב", "שמואל ב'"),
    // Deliberately *not* מ"א and מ"ב. Those are read as מגן אברהם and משנה
    // ברורה far more often than as Melachim, and an index that silently files a
    // Magen Avraham citation under Melachim is worse than one that asks for the
    // longer form. `every_alias_is_unambiguous` is what found this.
    s!("מלכים א", Tanach, 1015, "מל\"א", "מלכים א'"),
    s!("מלכים ב", Tanach, 1016, "מל\"ב", "מלכים ב'"),
    s!("ישעיהו", Tanach, 1017, "ישעיה", "יש'"),
    s!("ירמיהו", Tanach, 1018, "ירמיה", "יר'"),
    s!("יחזקאל", Tanach, 1019, "יחז'"),
    s!("הושע", Tanach, 1020),
    s!("יואל", Tanach, 1021),
    s!("עמוס", Tanach, 1022),
    s!("עובדיה", Tanach, 1023),
    s!("יונה", Tanach, 1024),
    s!("מיכה", Tanach, 1025),
    s!("נחום", Tanach, 1026),
    s!("חבקוק", Tanach, 1027),
    s!("צפניה", Tanach, 1028),
    s!("חגי", Tanach, 1029),
    s!("זכריה", Tanach, 1030),
    s!("מלאכי", Tanach, 1031),
    s!("תהלים", Tanach, 1041, "תה'", "תהילים"),
    s!("משלי", Tanach, 1042, "מש'"),
    s!("איוב", Tanach, 1043),
    s!("שיר השירים", Tanach, 1044, "שה\"ש", "שיר השירים רבה"),
    s!("רות", Tanach, 1045),
    s!("איכה", Tanach, 1046),
    s!("קהלת", Tanach, 1047, "קה'"),
    s!("אסתר", Tanach, 1048),
    s!("דניאל", Tanach, 1049, "דנ'"),
    s!("עזרא", Tanach, 1050),
    s!("נחמיה", Tanach, 1051),
    s!("דברי הימים א", Tanach, 1052, "דה\"י א", "דבה\"י א"),
    s!("דברי הימים ב", Tanach, 1053, "דה\"י ב", "דבה\"י ב"),
    // ── סדר זרעים ─────────────────────────────────────────────────────────
    s!("ברכות", Mishnah, 2001, "ברכ'"),
    s!("פאה", Mishnah, 2002),
    s!("דמאי", Mishnah, 2003),
    s!("כלאים", Mishnah, 2004),
    s!("שביעית", Mishnah, 2005),
    s!("תרומות", Mishnah, 2006),
    s!("מעשרות", Mishnah, 2007),
    s!("מעשר שני", Mishnah, 2008, "מע\"ש"),
    s!("חלה", Mishnah, 2009),
    s!("ערלה", Mishnah, 2010),
    s!("ביכורים", Mishnah, 2011, "בכורים"),
    // ── סדר מועד ──────────────────────────────────────────────────────────
    s!("שבת", Mishnah, 2101),
    s!("עירובין", Mishnah, 2102, "עיר'", "ערובין"),
    s!("פסחים", Mishnah, 2103, "פס'"),
    s!("שקלים", Mishnah, 2104),
    s!("יומא", Mishnah, 2105),
    s!("סוכה", Mishnah, 2106, "סוכ'"),
    s!("ביצה", Mishnah, 2107),
    s!("ראש השנה", Mishnah, 2108, "ר\"ה", "ראה\"ש"),
    s!("תענית", Mishnah, 2109, "תע'"),
    s!("מגילה", Mishnah, 2110, "מג'"),
    s!("מועד קטן", Mishnah, 2111, "מו\"ק"),
    s!("חגיגה", Mishnah, 2112, "חג'"),
    // ── סדר נשים ──────────────────────────────────────────────────────────
    s!("יבמות", Mishnah, 2201, "יבמ'"),
    s!("כתובות", Mishnah, 2202, "כתו'", "כת'"),
    s!("נדרים", Mishnah, 2203, "נד'"),
    s!("נזיר", Mishnah, 2204),
    s!("סוטה", Mishnah, 2205),
    s!("גיטין", Mishnah, 2206, "גיט'"),
    s!("קידושין", Mishnah, 2207, "קיד'", "קדושין"),
    // ── סדר נזיקין ────────────────────────────────────────────────────────
    s!("בבא קמא", Mishnah, 2301, "ב\"ק"),
    s!("בבא מציעא", Mishnah, 2302, "ב\"מ"),
    s!("בבא בתרא", Mishnah, 2303, "ב\"ב"),
    s!("סנהדרין", Mishnah, 2304, "סנה'"),
    s!("מכות", Mishnah, 2305),
    s!("שבועות", Mishnah, 2306, "שבו'"),
    s!("עדיות", Mishnah, 2307, "עדויות"),
    s!("עבודה זרה", Mishnah, 2308, "ע\"ז"),
    s!("אבות", Mishnah, 2309, "פרקי אבות"),
    s!("הוריות", Mishnah, 2310),
    // ── סדר קדשים ─────────────────────────────────────────────────────────
    s!("זבחים", Mishnah, 2401, "זב'"),
    s!("מנחות", Mishnah, 2402, "מנ'"),
    s!("חולין", Mishnah, 2403, "חול'"),
    s!("בכורות", Mishnah, 2404, "בכו'"),
    s!("ערכין", Mishnah, 2405),
    s!("תמורה", Mishnah, 2406),
    s!("כריתות", Mishnah, 2407),
    s!("מעילה", Mishnah, 2408),
    s!("תמיד", Mishnah, 2409),
    s!("מידות", Mishnah, 2410, "מדות"),
    s!("קינים", Mishnah, 2411, "קנים"),
    // ── סדר טהרות ─────────────────────────────────────────────────────────
    s!("כלים", Mishnah, 2501),
    s!("אהלות", Mishnah, 2502, "אוהלות"),
    s!("נגעים", Mishnah, 2503),
    s!("פרה", Mishnah, 2504),
    s!("טהרות", Mishnah, 2505),
    s!("מקוואות", Mishnah, 2506, "מקואות"),
    s!("נדה", Mishnah, 2507, "נידה"),
    s!("מכשירין", Mishnah, 2508),
    s!("זבים", Mishnah, 2509),
    s!("טבול יום", Mishnah, 2510),
    s!("ידים", Mishnah, 2511, "ידיים"),
    s!("עוקצין", Mishnah, 2512),
    // ── מדרש ──────────────────────────────────────────────────────────────
    s!("מדרש רבה", Midrash, 3001, "מד\"ר"),
    s!("תנחומא", Midrash, 3002),
    s!("ספרא", Midrash, 3003, "תורת כהנים", "תו\"כ"),
    s!("ספרי", Midrash, 3004),
    s!("מכילתא", Midrash, 3005),
    s!("פסיקתא", Midrash, 3006),
    s!("ילקוט שמעוני", Midrash, 3007, "ילק\"ש", "ילקוט"),
    s!("תלמוד ירושלמי", Midrash, 3010, "ירושלמי", "י-מי"),
    s!("זוהר", Midrash, 3020, "זהר"),
    // ── רמב״ם ─────────────────────────────────────────────────────────────
    s!("הלכות מדע", Rambam, 4001, "ספר המדע", "מדע"),
    s!("הלכות אהבה", Rambam, 4002, "ספר אהבה", "אהבה"),
    s!("הלכות זמנים", Rambam, 4003, "ספר זמנים", "זמנים"),
    s!("הלכות נשים", Rambam, 4004, "ספר נשים"),
    s!("הלכות קדושה", Rambam, 4005, "ספר קדושה"),
    s!("הלכות הפלאה", Rambam, 4006, "ספר הפלאה"),
    s!("הלכות זרעים", Rambam, 4007, "ספר זרעים"),
    s!("הלכות עבודה", Rambam, 4008, "ספר עבודה"),
    s!("הלכות קרבנות", Rambam, 4009, "ספר קרבנות"),
    s!("הלכות טהרה", Rambam, 4010, "ספר טהרה"),
    s!("הלכות נזקים", Rambam, 4011, "ספר נזיקין", "ספר נזקים"),
    s!("הלכות קנין", Rambam, 4012, "ספר קנין"),
    s!("הלכות משפטים", Rambam, 4013, "ספר משפטים"),
    s!("הלכות שופטים", Rambam, 4014, "ספר שופטים"),
    // ── טור ושולחן ערוך ──────────────────────────────────────────────────
    s!("אורח חיים", Poskim, 5001, "או\"ח"),
    s!("יורה דעה", Poskim, 5002, "יו\"ד"),
    s!("אבן העזר", Poskim, 5003, "אה\"ע", "אבהע\"ז"),
    s!("חושן משפט", Poskim, 5004, "חו\"מ"),
    s!("משנה ברורה", Poskim, 5010, "מ\"ב", "משנ\"ב"),
    s!("ביאור הלכה", Poskim, 5011, "ביה\"ל"),
    s!("שער הציון", Poskim, 5012, "שעה\"צ"),
    s!("ערוך השולחן", Poskim, 5013, "ערוה\"ש"),
];

/// The rank an unrecognised sefer gets: after everything in the catalogue.
///
/// Not dropped and not refused. A writer citing a sefer this list has never
/// heard of still wants it in the index; it simply goes in a final group, in
/// alphabetical order, where the reader will think to look for it.
pub const UNKNOWN_ORDER: u32 = 9000;

/// Strip a Hebrew string down to what two spellings of the same name share.
///
/// Three things vary freely in how people type a sefer name and none of them
/// change which sefer it is: the nikud (rare but real in a title), which of the
/// four gershayim characters got typed (״ ” " and a doubled ׳ all mean the same
/// mark), and how much whitespace ended up between the words. Folding all three
/// away is the whole of why `ב״ב`, `ב"ב` and `ב ״ ב` find the same masechta.
pub fn fold(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut last_space = true; // leading space is already "collapsed"
    for ch in name.chars() {
        match ch {
            // The maqaf is a *word separator* and must be tested before the
            // points range, because U+05BE sits inside it: matched there it was
            // deleted rather than spaced, and ראש־השנה folded to ראשהשנה, which
            // matches nothing.
            '־' | '-' => {
                if !last_space {
                    out.push(' ');
                }
                last_space = true;
                continue;
            }
            // Hebrew points and cantillation: never part of the identity, and
            // they do not break a run of spaces either — `continue` rather than
            // falling through to the `last_space = false` below.
            '\u{0591}'..='\u{05C7}' => continue,
            // Every gershayim and geresh spelling folds to the ASCII pair, so
            // that a doubled geresh (׳׳) and a real gershayim (״) compare equal.
            '\u{05F4}' | '\u{201C}' | '\u{201D}' | '"' => out.push('"'),
            '\u{05F3}' | '\u{2019}' | '\'' => out.push('\''),
            c if c.is_whitespace() => {
                if !last_space {
                    out.push(' ');
                }
                last_space = true;
                continue;
            }
            c => out.push(c),
        }
        last_space = false;
    }
    // A doubled geresh is how a keyboard without ״ types it.
    let out = out.replace("''", "\"");
    out.trim().to_string()
}

/// The sefer a written name refers to, if the catalogue knows it.
pub fn lookup(name: &str) -> Option<&'static Sefer> {
    let want = fold(name);
    if want.is_empty() {
        return None;
    }
    SEFARIM
        .iter()
        .find(|s| fold(s.canonical) == want || s.aliases.iter().any(|a| fold(a) == want))
}

/// The name a source index should print for whatever the writer typed.
pub fn canonical(name: &str) -> String {
    lookup(name)
        .map(|s| s.canonical.to_string())
        .unwrap_or_else(|| name.trim().to_string())
}

/// The sort rank of a written name.
pub fn rank(name: &str) -> u32 {
    lookup(name).map_or(UNKNOWN_ORDER, |s| s.order)
}

/// A Typst dictionary literal mapping every spelling to `(canonical, order, kind)`.
///
/// Generated rather than hand-written into the prelude, because a second copy of
/// this list is a second copy that drifts — and the drift is invisible: a
/// masechta simply sorts in the wrong place, which nobody notices until the
/// index is printed and bound.
pub fn typst_table() -> String {
    let mut out = String::from("#let _ix_sefarim = (\n");
    for s in SEFARIM {
        for spelling in std::iter::once(s.canonical).chain(s.aliases.iter().copied()) {
            // The key is the folded spelling, because the prelude folds its
            // input the same way before looking it up.
            out.push_str(&format!(
                "  {}: (שם: {}, סדר: {}, סוג: {}),\n",
                typst_key(&fold(spelling)),
                typst_string(s.canonical),
                s.order,
                typst_string(s.kind.as_str()),
            ));
        }
    }
    out.push_str(")\n#let _ix_kind_titles = (\n");
    for kind in [
        Kind::Tanach,
        Kind::Mishnah,
        Kind::Midrash,
        Kind::Rambam,
        Kind::Poskim,
    ] {
        out.push_str(&format!(
            "  {}: {},\n",
            typst_key(kind.as_str()),
            typst_string(kind.heading()),
        ));
    }
    out.push_str(")\n");
    out
}

/// The catalogue as JSON, for the editor's autocomplete.
pub fn catalog_json() -> String {
    let entries: Vec<serde_json::Value> = SEFARIM
        .iter()
        .map(|s| {
            serde_json::json!({
                "canonical": s.canonical,
                "kind": s.kind.as_str(),
                "order": s.order,
                "aliases": s.aliases,
            })
        })
        .collect();
    serde_json::json!({ "sefarim": entries }).to_string()
}

/// A Typst string literal.
fn typst_string(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// A dictionary key. Typst allows a quoted string as a key, which is what makes
/// a name with a space or a gershayim in it usable as one at all.
fn typst_key(s: &str) -> String {
    typst_string(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_abbreviation_finds_its_masechta() {
        assert_eq!(canonical("ב\"ב"), "בבא בתרא");
        assert_eq!(canonical("ב״ב"), "בבא בתרא");
        assert_eq!(canonical("בבא בתרא"), "בבא בתרא");
        assert_eq!(canonical("ר\"ה"), "ראש השנה");
        assert_eq!(canonical("מו\"ק"), "מועד קטן");
        assert_eq!(canonical("או\"ח"), "אורח חיים");
    }

    #[test]
    fn the_three_things_that_vary_are_folded_away() {
        // The four ways a keyboard produces the mark — the real gershayim, the
        // ASCII double quote, a smart quote, and two gereshim typed in a row on a
        // layout that has no gershayim key.
        for spelling in ["ב\"ב", "ב״ב", "ב׳׳ב", "ב”ב"] {
            assert_eq!(canonical(spelling), "בבא בתרא", "failed on {spelling:?}");
        }
        assert_eq!(canonical("בְּרָכוֹת"), "ברכות");
        // Spacing around the words, and a maqaf where a space would do.
        assert_eq!(canonical("  ראש   השנה "), "ראש השנה");
        assert_eq!(canonical("ראש־השנה"), "ראש השנה");
        // …but a space that separates two words is not noise. Losing it would
        // merge שמואל א into a different string entirely.
        assert_eq!(canonical("שמואל א"), "שמואל א");
        assert_ne!(canonical("שמואלא"), "שמואל א");
    }

    #[test]
    fn shas_order_is_shas_order_and_not_the_alphabet() {
        // The entire point of the catalogue. Alphabetically בבא בתרא precedes
        // בבא מציעא (ב < מ), and in Shas it follows it.
        assert!(rank("בבא מציעא") < rank("בבא בתרא"));
        assert!(rank("ברכות") < rank("שבת"));
        assert!(rank("שבת") < rank("בבא קמא"));
        // And all of Tanach precedes all of Shas.
        assert!(rank("מלאכי") < rank("ברכות"));
    }

    #[test]
    fn a_sefer_nobody_listed_sorts_last_rather_than_vanishing() {
        assert_eq!(rank("שו״ת נודע ביהודה"), UNKNOWN_ORDER);
        // …and keeps the writer's own spelling, since there is nothing better.
        assert_eq!(canonical("שו״ת נודע ביהודה"), "שו״ת נודע ביהודה");
    }

    #[test]
    fn every_alias_is_unambiguous() {
        // Two sefarim claiming the same abbreviation would make `lookup` depend
        // on list order, which is exactly the kind of thing that is discovered
        // once a document is already printed.
        let mut seen: Vec<String> = Vec::new();
        for s in SEFARIM {
            for spelling in std::iter::once(s.canonical).chain(s.aliases.iter().copied()) {
                let key = fold(spelling);
                assert!(
                    !seen.contains(&key),
                    "{spelling:?} is claimed twice (second time by {})",
                    s.canonical
                );
                seen.push(key);
            }
        }
    }

    #[test]
    fn the_generated_table_covers_every_spelling() {
        let table = typst_table();
        for s in SEFARIM {
            assert!(
                table.contains(&format!("\"{}\"", fold(s.canonical))),
                "{} missing from the generated table",
                s.canonical
            );
        }
        assert!(
            table.contains("\"ב\\\"ב\""),
            "the folded alias should be a key"
        );
    }
}

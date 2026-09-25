//! Pre-built document templates, embedded at build time.
//!
//! Each `body` is Ksav markup (the same thing a user types); the engine wraps
//! it with the document settings when compiling. The UI lists these as starting
//! points and loads `body` into the editor.
//!
//! # Why templates carry a language
//!
//! Every template used to be Hebrew, so an English writer's first screen was
//! Hebrew text they had to delete. That is the right default for a Hebrew-first
//! tool and the wrong first impression for the other half of what Ksav claims.
//!
//! The fix is not to translate the Torah templates: a siddur, a bentcher, a
//! kesubah and a get are Hebrew *because of what they are*, and an English
//! kesubah is not a document anyone wants. It is to write the general ones —
//! a letter, an article — in English as well, as documents of their own rather
//! than as translations, and to let the interface show the language a writer is
//! working in first.
//!
//! `lang` is also what tells the editor which direction to switch to when the
//! template is loaded. A left-to-right template dropped into a right-to-left
//! document sets an English letter flush right, which is nobody's letter.

use serde::Serialize;

#[derive(Serialize, Clone, Copy)]
pub struct Template {
    pub id: &'static str,
    pub he: &'static str,
    pub en: &'static str,
    pub category: &'static str,
    /// The language the body is written in: `"he"` or `"en"`. Drives the
    /// direction the editor switches to, and the order the menu lists them in.
    pub lang: &'static str,
    pub desc_he: &'static str,
    pub desc_en: &'static str,
    pub body: &'static str,
}

pub static TEMPLATES: &[Template] = &[
    Template {
        id: "letter",
        he: "מכתב",
        en: "Letter",
        category: "general",
        lang: "he",
        desc_he: "מכתב רשמי בעברית",
        desc_en: "A formal Hebrew letter",
        body: include_str!("../templates/letter.ksav"),
    },
    Template {
        id: "article",
        he: "מאמר",
        en: "Article",
        category: "general",
        lang: "he",
        desc_he: "מאמר עם כותרות, הערות וטבלה",
        desc_en: "Article with headings, footnotes, a table",
        body: include_str!("../templates/article.ksav"),
    },
    // The two English ones, and what "kept in step" means for them.
    //
    // `letter.ksav` and `article.ksav` have an English copy each, and the copy
    // is a **translation, not a variant**: same document, same shape, same
    // commands in the same places. The reason they exist at all is in the module
    // comment — a letter is a letter in either language and an English writer
    // should not start from a document they have to delete.
    //
    // What is deliberately *not* kept in step is typography, and the differences
    // are two, both of them the same difference: **direction**.
    //
    //   - `letter.ksav` wraps `ב"ה` and the telephone number in `#משמאל_לימין`.
    //     Hebrew is right to left, so a left-to-right run inside it has to be
    //     told, and without the wrapper the number prints in the wrong order.
    //     `letter-en.ksav` is already left to right and the wrapper would be a
    //     no-op wrapped around a thing that is already correct.
    //   - `article-en.ksav` writes `#bold[L'maaseh:]` inside the callout where
    //     `article.ksav` writes `נפקא־מינה למעשה:` with nothing around it. In a
    //     right-to-left column the colon already separates it; in a left-to-right
    //     one the eye has nothing to catch on and the label disappears into the
    //     sentence. The extra `#bold` is the translation of a visual fact, not a
    //     different document.
    //
    // `tests/templates.rs` declares both, so the two copies cannot drift apart
    // silently — the English one gaining a command, or the Hebrew one, is a red
    // test naming the pair and the difference it did not expect. That is the
    // whole arrangement: the copies are held together, and the two places they
    // are allowed to differ are written down where the test reads them.
    Template {
        id: "letter-en",
        he: "מכתב באנגלית",
        en: "Letter (English)",
        category: "general",
        lang: "en",
        desc_he: "מכתב רשמי באנגלית, משמאל לימין",
        desc_en: "A formal English letter, left to right",
        body: include_str!("../templates/letter-en.ksav"),
    },
    Template {
        id: "article-en",
        he: "מאמר באנגלית",
        en: "Article (English)",
        category: "general",
        lang: "en",
        desc_he: "מאמר באנגלית עם הערות, מקורות וטבלה",
        desc_en: "English article with footnotes, sources, a table",
        body: include_str!("../templates/article-en.ksav"),
    },
    Template {
        id: "sefer",
        he: "ספר",
        en: "Sefer",
        category: "torah",
        lang: "he",
        desc_he: "ספר תורני במבנה סימן וסעיף עם מראי מקומות",
        desc_en: "Rabbinic sefer: siman/seif with mekoros",
        body: include_str!("../templates/sefer.ksav"),
    },
    Template {
        id: "divrei-torah",
        he: "דברי תורה",
        en: "Divrei Torah",
        category: "torah",
        lang: "he",
        desc_he: "דבר תורה על הפרשה עם מקורות",
        desc_en: "A dvar Torah on the parsha with sources",
        body: include_str!("../templates/divrei-torah.ksav"),
    },
    // The two the apparatus never had.
    //
    // Ten templates demonstrated eight of 115 commands between them, and zero
    // used any note arrangement past the plain footnote — so the one thing this
    // product does that Word cannot was reachable from no starting point at all.
    // A bochur who picked "ספר" got footnotes and a horizontal rule.
    //
    // These two are the arrangements a Torah writer actually recognises on
    // sight: the Gemara look (fixed bands at the foot of the page, so an empty
    // band holds its slot instead of letting the others drift) and a peirush
    // with its mareh mekomos in a second, independently numbered stream beside
    // it. Both exercise `auto_notes_region_cm`, which is the point — a template
    // that reserves no note region is a template whose apparatus grows off the
    // bottom of the paper.
    //
    // **And the paragraph above is now a predicate rather than a promise.**
    // `tests/templates.rs` holds a declared set of the arrangements a writer must
    // be able to reach, and asserts each is in *one* template's body — not in the
    // corpus between them, which is the arrangement that let the apparatus go
    // unreachable in the first place. It found three things this paragraph was
    // claiming and nothing here demonstrated: a note on a note, a note whose text
    // is written at the end of the document, and the topic index. A claim that
    // can only be checked by reading is a claim that regresses one command at a
    // time, which is what this one did.
    Template {
        id: "gemara",
        he: "דף גמרא",
        en: "Gemara page",
        category: "torah",
        lang: "he",
        desc_he: "פנים ופירוש באזורים קבועים בתחתית העמוד",
        desc_en: "Text with commentary in fixed regions at the foot of the page",
        body: include_str!("../templates/gemara.ksav"),
    },
    Template {
        id: "peirush",
        he: "פירוש עם מראי מקומות",
        en: "Commentary with sources",
        category: "torah",
        lang: "he",
        desc_he: "שני זרמי הערות במקביל — ביאורים ומראי מקומות",
        desc_en: "Two parallel note streams — commentary and mareh mekomos",
        body: include_str!("../templates/peirush.ksav"),
    },
    Template {
        id: "siddur",
        he: "סידור",
        en: "Siddur",
        category: "torah",
        lang: "he",
        desc_he: "נוסח תפילה עם ניקוד והנחיות",
        desc_en: "Prayer text with nikud and instructions",
        body: include_str!("../templates/siddur.ksav"),
    },
    Template {
        id: "bentcher",
        he: "ברכת המזון",
        en: "Bentcher",
        category: "torah",
        lang: "he",
        desc_he: "ברכת המזון עם ניקוד",
        desc_en: "Birkas Hamazon with nikud",
        body: include_str!("../templates/bentcher.ksav"),
    },
    Template {
        id: "kesubah",
        he: "כתובה",
        en: "Kesubah",
        category: "torah",
        lang: "he",
        desc_he: "נוסח כתובה מסורתי",
        desc_en: "Traditional kesubah text",
        body: include_str!("../templates/kesubah.ksav"),
    },
    Template {
        id: "get",
        he: "גט",
        en: "Get",
        category: "torah",
        lang: "he",
        desc_he: "מבנה שטר גט (להסבר)",
        desc_en: "Structure of a get document (informational)",
        body: include_str!("../templates/get.ksav"),
    },
];

/// Templates as JSON (metadata + body), for the front end.
pub fn templates_json() -> String {
    serde_json::to_string(TEMPLATES).unwrap_or_else(|_| "[]".to_string())
}

/// Look up a template body by id.
///
/// The bundled front ends read the whole registry as JSON and never call this,
/// but it is the natural entry point for anything embedding the engine as a
/// library (`ksav_engine::templates::template_body("sefer")`), so it stays.
pub fn template_body(id: &str) -> Option<&'static str> {
    TEMPLATES.iter().find(|t| t.id == id).map(|t| t.body)
}

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

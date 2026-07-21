//! Pre-built document templates, embedded at build time.
//!
//! Each `body` is Ksav markup (the same thing a user types); the engine wraps
//! it with the document settings when compiling. The UI lists these as starting
//! points and loads `body` into the editor.

use serde::Serialize;

#[derive(Serialize, Clone, Copy)]
pub struct Template {
    pub id: &'static str,
    pub he: &'static str,
    pub en: &'static str,
    pub category: &'static str,
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
        desc_he: "מכתב רשמי בעברית",
        desc_en: "A formal Hebrew letter",
        body: include_str!("../templates/letter.ksav"),
    },
    Template {
        id: "article",
        he: "מאמר",
        en: "Article",
        category: "general",
        desc_he: "מאמר עם כותרות, הערות וטבלה",
        desc_en: "Article with headings, footnotes, a table",
        body: include_str!("../templates/article.ksav"),
    },
    Template {
        id: "sefer",
        he: "ספר",
        en: "Sefer",
        category: "torah",
        desc_he: "ספר תורני במבנה סימן וסעיף עם מראי מקומות",
        desc_en: "Rabbinic sefer: siman/seif with mekoros",
        body: include_str!("../templates/sefer.ksav"),
    },
    Template {
        id: "divrei-torah",
        he: "דברי תורה",
        en: "Divrei Torah",
        category: "torah",
        desc_he: "דבר תורה על הפרשה עם מקורות",
        desc_en: "A dvar Torah on the parsha with sources",
        body: include_str!("../templates/divrei-torah.ksav"),
    },
    Template {
        id: "siddur",
        he: "סידור",
        en: "Siddur",
        category: "torah",
        desc_he: "נוסח תפילה עם ניקוד והנחיות",
        desc_en: "Prayer text with nikud and instructions",
        body: include_str!("../templates/siddur.ksav"),
    },
    Template {
        id: "bentcher",
        he: "ברכת המזון",
        en: "Bentcher",
        category: "torah",
        desc_he: "ברכת המזון עם ניקוד",
        desc_en: "Birkas Hamazon with nikud",
        body: include_str!("../templates/bentcher.ksav"),
    },
    Template {
        id: "kesubah",
        he: "כתובה",
        en: "Kesubah",
        category: "torah",
        desc_he: "נוסח כתובה מסורתי",
        desc_en: "Traditional kesubah text",
        body: include_str!("../templates/kesubah.ksav"),
    },
    Template {
        id: "get",
        he: "גט",
        en: "Get",
        category: "torah",
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

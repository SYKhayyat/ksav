//! The Ksav command registry — the bidirectional Hebrew/English mapping layer.
//!
//! One source of truth describing every command: its Hebrew name, English
//! alias, category, bilingual description, and the snippet to insert. The UI
//! consumes this (as JSON) to build the command palette, the toolbar tooltips,
//! and the generated documentation. Every command here has a matching `#let`
//! in `typst/ksav.typ`.

use serde::Serialize;

#[derive(Serialize, Clone, Copy)]
pub struct Command {
    /// Hebrew command name (as written after `#`).
    pub he: &'static str,
    /// English alias (a collision-free `#let` in the prelude).
    pub en: &'static str,
    /// Category key (UI groups + localizes these).
    pub category: &'static str,
    /// Hebrew description.
    pub desc_he: &'static str,
    /// English description.
    pub desc_en: &'static str,
    /// Text to insert; `|` marks the desired cursor position.
    pub insert: &'static str,
}

macro_rules! cmd {
    ($he:literal, $en:literal, $cat:literal, $dhe:literal, $den:literal, $ins:literal) => {
        Command { he: $he, en: $en, category: $cat, desc_he: $dhe, desc_en: $den, insert: $ins }
    };
}

pub static COMMANDS: &[Command] = &[
    // ---- style ----
    cmd!("הדגשה", "bold", "style", "טקסט מודגש", "Bold text", "#הדגשה[|]"),
    cmd!("נטוי", "italic", "style", "טקסט נטוי", "Italic text", "#נטוי[|]"),
    cmd!("קו_תחתון", "uline", "style", "קו תחתון", "Underline", "#קו_תחתון[|]"),
    cmd!("קו_חוצה", "sthrough", "style", "קו חוצה", "Strikethrough", "#קו_חוצה[|]"),
    cmd!("סימון", "mark", "style", "הדגשה בצבע רקע", "Highlight", "#סימון[|]"),
    cmd!("רברבתי", "scaps", "style", "אותיות רבתי", "Small caps", "#רברבתי[|]"),
    cmd!("עילי", "sup", "style", "כתב עילי", "Superscript", "#עילי[|]"),
    cmd!("תחתי", "sub_", "style", "כתב תחתי", "Subscript", "#תחתי[|]"),
    cmd!("גדול", "big", "style", "טקסט מוגדל", "Larger text", "#גדול[|]"),
    cmd!("קטן", "tiny", "style", "טקסט מוקטן", "Smaller text", "#קטן[|]"),
    cmd!("צבע", "color", "style", "צבע טקסט", "Text color", "#צבע(rgb(\"#b91c1c\"))[|]"),
    cmd!("רקע", "bg", "style", "צבע רקע", "Background color", "#רקע(yellow)[|]"),
    cmd!("גופן_שונה", "usefont", "style", "החלפת גופן", "Change font", "#גופן_שונה(\"David Libre\")[|]"),
    cmd!("קוד", "mono", "style", "טקסט מונו (קוד)", "Monospace / code", "#קוד[|]"),
    // ---- heading / title ----
    cmd!("שער", "title", "heading", "כותרת ראשית ממורכזת", "Centered document title", "#שער[|]"),
    cmd!("תת_שער", "subtitle", "heading", "כותרת משנה ממורכזת", "Centered subtitle", "#תת_שער[|]"),
    cmd!("כותרת1", "h1", "heading", "כותרת רמה 1", "Heading level 1", "#כותרת1[|]"),
    cmd!("כותרת2", "h2", "heading", "כותרת רמה 2", "Heading level 2", "#כותרת2[|]"),
    cmd!("כותרת3", "h3", "heading", "כותרת רמה 3", "Heading level 3", "#כותרת3[|]"),
    cmd!("כותרת", "hlevel", "heading", "כותרת בכל רמה", "Heading at any level", "#כותרת(רמה: 4)[|]"),
    // ---- align / direction ----
    cmd!("מרכז", "center_", "align", "יישור למרכז", "Center align", "#מרכז[|]"),
    cmd!("ימין", "right_", "align", "יישור לימין", "Right align", "#ימין[|]"),
    cmd!("שמאל", "left_", "align", "יישור לשמאל", "Left align", "#שמאל[|]"),
    cmd!("משמאל_לימין", "ltr_", "align", "קטע משמאל לימין", "Left-to-right run", "#משמאל_לימין[|]"),
    cmd!("מימין_לשמאל", "rtl_", "align", "קטע מימין לשמאל", "Right-to-left run", "#מימין_לשמאל[|]"),
    // ---- lists ----
    cmd!("רשימה", "bullets", "list", "רשימת תבליטים", "Bulleted list", "#רשימה(\n  פריט[|],\n  פריט[],\n)"),
    cmd!("ממוספרת", "numbered", "list", "רשימה ממוספרת", "Numbered list", "#ממוספרת(\n  פריט[|],\n  פריט[],\n)"),
    cmd!("פריט", "item", "list", "פריט ברשימה", "List item", "פריט[|]"),
    cmd!("רשימת_הגדרות", "deflist", "list", "רשימת הגדרות", "Definition list", "#רשימת_הגדרות(\n  הגדרה[מונח][|],\n)"),
    // ---- table ----
    cmd!("טבלה", "mktable", "table", "טבלה", "Table", "#טבלה(עמודות: 2,\n  כותרת_תא[|], כותרת_תא[],\n  תא[], תא[],\n)"),
    cmd!("תא", "cell", "table", "תא בטבלה", "Table cell", "תא[|]"),
    cmd!("כותרת_תא", "headcell", "table", "תא כותרת", "Header cell", "כותרת_תא[|]"),
    cmd!("מיזוג", "colspan_", "table", "מיזוג עמודות", "Merge columns", "#מיזוג(2)[|]"),
    // ---- footnote ----
    cmd!("הערה", "fnote", "footnote", "הערת שוליים", "Footnote", "#הערה[|]"),
    // ---- blocks ----
    cmd!("ציטוט", "blockquote", "block", "ציטוט בלוק", "Block quote", "#ציטוט[|]"),
    cmd!("הערת_צד", "callout", "block", "תיבת הדגשה (כחול)", "Callout (blue)", "#הערת_צד[|]"),
    cmd!("אזהרה", "warnbox", "block", "תיבת אזהרה (אדום)", "Warning box (red)", "#אזהרה[|]"),
    cmd!("הצלחה", "okbox", "block", "תיבת הצלחה (ירוק)", "Success box (green)", "#הצלחה[|]"),
    cmd!("תיבה", "framebox", "block", "תיבה ממוסגרת", "Framed box", "#תיבה[|]"),
    cmd!("מקור", "cite_", "block", "ציטוט מקור (אפור)", "Source citation", "#מקור[|]"),
    // ---- layout ----
    cmd!("קו_מפריד", "hrule", "layout", "קו מפריד", "Horizontal rule", "#קו_מפריד"),
    cmd!("מרווח", "vspace", "layout", "רווח אנכי", "Vertical space", "#מרווח(מידה: 1em)"),
    cmd!("מעבר_עמוד", "pbreak", "layout", "מעבר עמוד", "Page break", "#מעבר_עמוד"),
    cmd!("הזחה", "indent_", "layout", "בלוק מוזח", "Indented block", "#הזחה[|]"),
    cmd!("טורים_בלוק", "cols", "layout", "טורים מרובים", "Multiple columns", "#טורים_בלוק(2)[|]"),
    cmd!("חסר", "blank", "layout", "שורת מילוי (טופס)", "Fill-in blank", "#חסר"),
    // ---- torah / yeshiva ----
    cmd!("סימן", "siman", "torah", "כותרת סימן", "Siman heading", "#סימן[א׳][|]"),
    cmd!("סעיף", "seif", "torah", "סעיף הלכתי ממוספר", "Lettered halacha", "#סעיף[א][|]"),
    cmd!("פסוק", "verse", "torah", "פסוק עם מקור", "Verse with reference", "#פסוק[מקור][|]"),
    cmd!("מראה_מקום", "sourcenote", "torah", "מראה מקום (הערה)", "Source footnote", "#מראה_מקום[|]"),
    cmd!("ציון", "refmark", "torah", "ציון מקור בסוגריים", "Inline reference", "#ציון[|]"),
    cmd!("גמרא", "gemara", "torah", "מראה מקום לגמרא", "Gemara reference", "#גמרא[ברכות][ב.]"),
    cmd!("דיבור_המתחיל", "dh", "torah", "דיבור המתחיל", "Lemma (d\"h)", "#דיבור_המתחיל[|]"),
];

/// The registry serialized to JSON, for the front end.
pub fn commands_json() -> String {
    serde_json::to_string(COMMANDS).unwrap_or_else(|_| "[]".to_string())
}

/// Distinct category keys, in first-seen order.
pub fn categories() -> Vec<&'static str> {
    let mut seen = Vec::new();
    for c in COMMANDS {
        if !seen.contains(&c.category) {
            seen.push(c.category);
        }
    }
    seen
}

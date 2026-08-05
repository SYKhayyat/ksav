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
    /// Still compiles, no longer advertised.
    ///
    /// A command that exists in documents cannot simply be deleted, and one that
    /// misleads cannot keep a toolbar button. `הערה_על_הערה` is the case that
    /// forced the field: it *sounds* like the tiered mechanism and is
    /// `footnote(text(size: 0.94em, style: "italic", …))` — measured against a
    /// plain nested footnote, 10.2pt against 9.6pt in the same block with the
    /// same rhythm. Deprecated commands still resolve, still complete, and are
    /// kept out of the toolbar, the Insert menu and the palette.
    pub deprecated: bool,
}

macro_rules! cmd {
    ($he:literal, $en:literal, $cat:literal, $dhe:literal, $den:literal, $ins:literal) => {
        cmd!($he, $en, $cat, $dhe, $den, $ins, false)
    };
    ($he:literal, $en:literal, $cat:literal, $dhe:literal, $den:literal, $ins:literal, $dep:literal) => {
        Command {
            he: $he,
            en: $en,
            category: $cat,
            desc_he: $dhe,
            desc_en: $den,
            insert: $ins,
            deprecated: $dep,
        }
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
    cmd!("כתב_רשי", "rashi", "style", "כתב רש״י (דורש גופן מצורף)", "Rashi script (needs an attached font)", "#כתב_רשי[|]"),
    cmd!("עילי", "sup", "style", "כתב עילי", "Superscript", "#עילי[|]"),
    cmd!("תחתי", "sub_", "style", "כתב תחתי", "Subscript", "#תחתי[|]"),
    cmd!("גדול", "big", "style", "טקסט מוגדל", "Larger text", "#גדול[|]"),
    cmd!("קטן", "tiny", "style", "טקסט מוקטן", "Smaller text", "#קטן[|]"),
    cmd!("צבע", "color", "style", "צבע טקסט", "Text color", "#צבע(rgb(\"#b91c1c\"))[|]"),
    cmd!("רקע", "bg", "style", "צבע רקע", "Background color", "#רקע(yellow)[|]"),
    cmd!("גופן_שונה", "usefont", "style", "החלפת גופן", "Change font", "#גופן_שונה(\"David Libre\")[|]"),
    cmd!("קוד", "mono", "style", "טקסט מונו (קוד)", "Monospace / code", "#קוד[|]"),
    cmd!("גודל_גופן", "fsize", "style", "גודל גופן מדויק", "Exact font size", "#גודל_גופן(14pt)[|]"),
    cmd!("מרווח_אותיות", "track", "style", "מרווח בין אותיות", "Letter spacing", "#מרווח_אותיות(0.1em)[|]"),
    // ---- heading / title ----
    cmd!("שער", "title", "heading", "כותרת ראשית ממורכזת", "Centered document title", "#שער[|]"),
    cmd!("תת_שער", "subtitle", "heading", "כותרת משנה ממורכזת", "Centered subtitle", "#תת_שער[|]"),
    cmd!("כותרת1", "h1", "heading", "כותרת רמה 1", "Heading level 1", "#כותרת1[|]"),
    cmd!("כותרת2", "h2", "heading", "כותרת רמה 2", "Heading level 2", "#כותרת2[|]"),
    cmd!("כותרת3", "h3", "heading", "כותרת רמה 3", "Heading level 3", "#כותרת3[|]"),
    cmd!("כותרת", "hlevel", "heading", "כותרת בכל רמה", "Heading at any level", "#כותרת(רמה: 4)[|]"),
    cmd!("כותרת_בהערה", "note_heading", "heading", "כותרת בתוך הערה — נראית ככותרת, אינה נכנסת לתוכן ואינה מקדמת מספור", "Heading inside a note — looks like one, but stays out of the outline and the numbering", "#כותרת_בהערה[|]"),
    cmd!("הגדרות_כותרות", "headings_config", "heading", "עיצוב הכותרות (גודל/צבע/יישור/מספור/קו לכל רמה)", "Configure headings (size/colour/align/numbering/rule per level)", "#הגדרות_כותרות(גודל: (2em, 1.4em), צבע: (rgb(\"#b91c1c\"), luma(40)), מספור: \"1.1\", קו: (true, false))|"),
    // ---- align / direction ----
    cmd!("מרכז", "center_", "align", "יישור למרכז", "Center align", "#מרכז[|]"),
    cmd!("ימין", "right_", "align", "יישור לימין", "Right align", "#ימין[|]"),
    cmd!("שמאל", "left_", "align", "יישור לשמאל", "Left align", "#שמאל[|]"),
    cmd!("משמאל_לימין", "ltr_", "align", "קטע משמאל לימין", "Left-to-right run", "#משמאל_לימין[|]"),
    cmd!("מימין_לשמאל", "rtl_", "align", "קטע מימין לשמאל", "Right-to-left run", "#מימין_לשמאל[|]"),
    // ---- lists ----
    cmd!("רשימה", "bullets", "list", "רשימת תבליטים", "Bulleted list", "#רשימה(\n  פריט[|],\n  פריט[],\n)"),
    cmd!("ממוספרת", "numbered", "list", "רשימה ממוספרת", "Numbered list", "#ממוספרת(\n  פריט[|],\n  פריט[],\n)"),
    cmd!("ממוספרת_עברית", "henum", "list", "רשימה ממוספרת עברית (א,ב,ג)", "Hebrew-lettered list", "#ממוספרת_עברית(\n  פריט[|],\n  פריט[],\n)"),
    cmd!("תוכן", "toc", "list", "תוכן העניינים", "Table of contents", "#תוכן()"),
    cmd!("פריט", "item", "list", "פריט ברשימה", "List item", "פריט[|]"),
    cmd!("רשימת_הגדרות", "deflist", "list", "רשימת הגדרות", "Definition list", "#רשימת_הגדרות(\n  הגדרה[מונח][|],\n)"),
    cmd!("הגדרות_רשימות", "lists_config", "list", "עיצוב הרשימות (סמן/הזחה/ריווח/מספור)", "Configure lists (marker/indent/spacing/numbering)", "#הגדרות_רשימות(סמן: ([◆], [–]), הזחה: 1.5em, הידוק: true)|"),
    // ---- table ----
    // A new table spans the text width and arrives with a header row and two
    // body rows. The old default was a bare `עמודות: 2`, which lets Typst size
    // each column to its contents — so an empty new table rendered as a
    // thumbnail-sized box shoved against the margin. Valid, and nothing like
    // what pressing "table" in a word processor is supposed to produce.
    cmd!("טבלה", "mktable", "table", "טבלה", "Table", "#טבלה(עמודות: (1fr, 1fr),\n  כותרת_תא[|], כותרת_תא[],\n  תא[], תא[],\n  תא[], תא[],\n)"),
    cmd!("תא", "cell", "table", "תא בטבלה", "Table cell", "תא[|]"),
    cmd!("כותרת_תא", "headcell", "table", "תא כותרת", "Header cell", "כותרת_תא[|]"),
    cmd!("הגדרות_טבלאות", "tables_config", "table", "עיצוב הטבלאות (קו/מרווח/פסים/צבע כותרת/גופן)", "Configure tables (stroke/inset/striping/header fill/font)", "#הגדרות_טבלאות(פסים: true, צבע_כותרת: rgb(\"#dbeafe\"), מרווח: 10pt)|"),
    cmd!("מיזוג", "colspan_", "table", "מיזוג עמודות", "Merge columns", "#מיזוג(2)[|]"),
    // ---- footnote ----
    cmd!("הערה", "fnote", "footnote", "הערת שוליים", "Footnote", "#הערה[|]"),
    // A sub-note in the NATIVE apparatus is not a second block: Typst has one
    // page-bottom footnote series, so these land in the same block as #הערה, in
    // the same running sequence, distinguished only by size/slant/indent. The
    // descriptions used to promise "a separate block" and deliver italics —
    // which is exactly what it looked like from the writer's chair. For real
    // separate blocks see #מדור_א/#מדור_ב (+#הערות_מדורגות) or #מדף_א/#מדף_ב.
    // Deprecated, and the toolbar's `⁑` now points at #הערה_ב instead. This one
    // is a cosmetic alias wearing a mechanism's name: it renders 0.6pt smaller
    // and slanted, in the same block and the same sequence, while the real
    // tiered note (#הערה_א/#הערה_ב/#הערה_ג) indents a tier, steps size and
    // colour, and can carry its own numbering scheme. The writer clicked the
    // thing the toolbar offered, and the toolbar offered the wrong thing.
    cmd!("הערה_על_הערה", "subnote", "footnote", "מיושן — השתמשו ב#הערה_ב. הערה על הערה באותו בלוק ובאותו מספור, קטנה ונטויה", "Deprecated — use #הערה_ב. A note on a note in the same block and the same numbering, set smaller and italic", "#הערה_על_הערה[|]", true),
    // layered (tiered) footnotes — one block, one sequence, a tier per indent
    cmd!("הערה_א", "tier1", "footnote", "הערה שכבתית — דרגה א (על הגוף)", "Layered note — tier A (on the text)", "#הערה_א[|]"),
    cmd!("הערה_ב", "tier2", "footnote", "הערה על הערה — דרגה ב (מוזחת באותו בלוק)", "Note on a note — tier B (indented in the same block)", "#הערה_ב[|]"),
    cmd!("הערה_ג", "tier3", "footnote", "הערה על הערה — דרגה ג (מוזחת באותו בלוק)", "Note on a note — tier C (indented in the same block)", "#הערה_ג[|]"),
    cmd!("הערה_בדרגה", "tier", "footnote", "הערה שכבתית בכל דרגה", "Layered note at any tier", "#הערה_בדרגה(2)[|]"),
    cmd!("הגדרות_הערות", "footnote_config", "footnote", "עיצוב ההערות השכבתיות (גודל/סגנון/הזחה/תוויות/מספור לכל דרגה)", "Configure layered notes (size/style/indent/labels/numbering per tier)", "#הגדרות_הערות(סגנון: (\"normal\", \"italic\"), הזחה: (0em, 1em), מספור: (\"א\", \"1\", \"i\"))"),
    // regrouped stacked bands (Gemara / critical-apparatus) — collect then render
    cmd!("מדור_א", "band1", "footnote", "מדור א — בלוק ההערות הראשון (כל דרגה 1)", "Band A — the first note block (all tier-1)", "#מדור_א[|]"),
    cmd!("מדור_ב", "band2", "footnote", "מדור ב — הערות על מדור א", "Band B — notes on band A", "#מדור_ב[|]"),
    cmd!("מדור_ג", "band3", "footnote", "מדור ג — הערות על מדור ב", "Band C — notes on band B", "#מדור_ג[|]"),
    cmd!("מדור_בדרגה", "band", "footnote", "מדור בכל דרגה", "Band at any tier", "#מדור_בדרגה(2)[|]"),
    cmd!("הערות_מדורגות", "banded_notes", "footnote", "הצגת המדורים כבלוקים נערמים (בסוף הקטע)", "Render the bands, stacked (at end of section)", "#הערות_מדורגות(כותרת: [הערות])"),
    cmd!("הגדרות_מדורגות", "banded_config", "footnote", "עיצוב המדורים (מספור/טורים/צבע לכל דרגה)", "Configure bands (numbering/columns/colour per tier)", "#הגדרות_מדורגות(טורים: (2, 1, 1))"),
    cmd!("הערתסיום", "endnote", "footnote", "הערת סיום (נאספת בסוף)", "Endnote (collected at end)", "#הערתסיום[|]"),
    cmd!("הערות_בסוף", "endnotes", "footnote", "הצגת הערות הסיום", "Render collected endnotes", "#הערות_בסוף(כותרת: [הערות])"),
    cmd!("הגדרות_הערות_סיום", "endnotes_config", "footnote", "מספור הערות הסיום — כדי שיֵראו אחרת מהערות השוליים", "Endnote numbering — so they do not look identical to the footnotes", "#הגדרות_הערות_סיום(מספור: \"א\")"),
    cmd!("הערות_בסוף_צד", "endnotes_side", "footnote", "הערות סיום — כמה זרמים זה לצד זה", "Endnotes — several streams side by side", "#הערות_בסוף_צד(זרמים: (\"א\", \"ב\"), כותרות: (\"א\": [ביאורים], \"ב\": [מקורות]))"),
    // per-page regrouped bands — the Gemara look at the foot of EACH page
    cmd!("מדף_א", "pageband1", "footnote", "מדף א — בלוק הערות בתחתית העמוד (כל דרגה 1)", "Page-band A — foot-of-page block (all tier-1)", "#מדף_א[|]"),
    cmd!("מדף_ב", "pageband2", "footnote", "מדף ב — הערות על מדף א (בלוק נפרד בעמוד)", "Page-band B — notes on band A (separate page block)", "#מדף_ב[|]"),
    cmd!("מדף_ג", "pageband3", "footnote", "מדף ג — הערות על מדף ב", "Page-band C — notes on band B", "#מדף_ג[|]"),
    cmd!("מדף_בדרגה", "pageband", "footnote", "מדף בכל דרגה (בתחתית העמוד)", "Page-band at any tier (foot of page)", "#מדף_בדרגה(2)[|]"),
    cmd!("הגדרות_מדפים", "pagebands_config", "footnote", "עיצוב המדפים בעמוד (מספור/טורים/צבע לכל דרגה)", "Configure page-bands (numbering/columns/colour per tier)", "#הגדרות_מדפים(מספור: (\"א\", \"1\", \"a\"))"),
    // multiple independent footnote streams (per page, stacked or side by side)
    cmd!("הערה_זרם", "stream_note", "footnote", "הערת שוליים בזרם נפרד (מספור עצמאי)", "Footnote in a separate stream (independent numbering)", "#הערה_זרם(\"מקורות\")[|]"),
    cmd!("הערת_תוכן", "contentnote", "footnote", "הערת תוכן — זרם \"תוכן\"", "Content note — the \"content\" stream", "#הערת_תוכן[|]"),
    cmd!("הערת_מקור", "sourcenote_stream", "footnote", "הערת מקור — זרם \"מקורות\"", "Source note — the \"sources\" stream", "#הערת_מקור[|]"),
    cmd!("הגדרות_זרמים", "streams_config", "footnote", "עיצוב זרמי ההערות (פריסה מוערמת/צד, מספור, כותרות)", "Configure footnote streams (stacked/side-by-side, numbering, titles)", "#הגדרות_זרמים(פריסה: \"צד\", זרמים: (\"תוכן\", \"מקורות\"))"),
    // deferred note bodies — the marker inline, the prose gathered at the end
    cmd!("הערה_בשם", "note_named", "footnote", "הערה שגופה נכתב בסוף המסמך", "A note whose text is written at the end of the document", "#הערה_בשם(\"|\")"),
    cmd!("גוף_הערה", "note_body", "footnote", "גוף הערה (נכתב בסוף, מופיע במקום הסימון)", "A note body (written at the end, printed at its marker)", "#גוף_הערה(\"|\")[]"),
    cmd!("גופי_הערות", "note_bodies", "footnote", "אזור גופי ההערות בסוף המסמך", "The note-bodies region at the end of the document", "#גופי_הערות[|]"),
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
    // Written with its parentheses, unlike the four content-valued commands
    // around it: `חסר` is a *function*, so the bare form is a function value
    // rather than a call, and inside an argument list — pressing this while the
    // caret sits between two list items — Typst answered "expected content,
    // found a command". The parentheses also terminate the name, so it can no
    // longer fuse with the word after it either.
    cmd!("חסר", "blank", "layout", "שורת מילוי (טופס)", "Fill-in blank", "#חסר()"),
    cmd!("מעבר_שורה", "lbreak", "layout", "מעבר שורה", "Line break", "#מעבר_שורה"),
    cmd!("מעבר_טור", "cbreak", "layout", "מעבר טור", "Column break", "#מעבר_טור"),
    cmd!("רווח_אופקי", "hspace", "layout", "רווח אופקי", "Horizontal space", "#רווח_אופקי(מידה: 1em)"),
    // ---- images ----
    cmd!("תמונה", "img", "image", "הוספת תמונה", "Insert an image", "#תמונה(\"|\", רוחב: 60%)"),
    // ---- torah / yeshiva ----
    cmd!("סימן", "siman", "torah", "כותרת סימן", "Siman heading", "#סימן[א׳][|]"),
    cmd!("סעיף", "seif", "torah", "סעיף הלכתי ממוספר", "Lettered halacha", "#סעיף[א][|]"),
    cmd!("פסוק", "verse", "torah", "פסוק עם מקור", "Verse with reference", "#פסוק[מקור][|]"),
    cmd!("מראה_מקום", "sourcenote", "torah", "מראה מקום (הערה)", "Source footnote", "#מראה_מקום[|]"),
    cmd!("ציון", "refmark", "torah", "ציון מקור בסוגריים", "Inline reference", "#ציון[|]"),
    cmd!("גמרא", "gemara", "torah", "מראה מקום לגמרא", "Gemara reference", "#גמרא[ברכות][ב.]"),
    cmd!("אות", "osource", "torah", "אות מודגשת בתחילת קטע", "Bold paragraph letter", "#אות[|]"),
    cmd!("דיבור_המתחיל", "dh", "torah", "דיבור המתחיל", "Lemma (d\"h)", "#דיבור_המתחיל[|]"),
    // The indexes. `ציון_מקור` and `ערך` are marks, and the two `מפתח_` commands
    // print what the marks collected — so they belong at the *back* of the
    // document, which is the one thing about them a writer has to be told.
    cmd!("ציון_מקור", "sourceref", "torah", "ציון מקור — נכנס למפתח המקורות", "Cite a sefer — indexed", "#ציון_מקור(\"|\", מקום: \"ב.\")"),
    cmd!("כלול", "include_part", "block", "הכללת מסמך אחר (פרק) — בשורה משלו", "Include another document (a chapter) — on its own line", "#כלול(\"|\")"),
    cmd!("מפתח_מקורות", "sourceindex", "torah", "מפתח המקורות (בסוף הספר)", "Source index (at the back)", "#מפתח_מקורות()"),
    cmd!("ערך", "indexentry", "torah", "סימון ערך למפתח הענינים", "Mark a term for the topic index", "#ערך(\"|\")[]"),
    cmd!("מפתח_ענינים", "topicindex", "torah", "מפתח הענינים (בסוף הספר)", "Topic index (at the back)", "#מפתח_ענינים()"),
    cmd!("עם_פירוש", "commentary", "torah", "טקסט עם פירוש בצד העמוד", "Text with side commentary", "#עם_פירוש([|], [הפירוש])"),
    cmd!("עם_הערות_צד", "sidenotes", "torah", "קטע עם הערות בטור צדדי", "Section with side-column notes", "#עם_הערות_צד[|]"),
    cmd!("הערת_גיליון", "sidenote", "torah", "הערה בטור הצד (בתוך עם_הערות_צד)", "Side note (inside side-column section)", "#הערת_גיליון[|]"),
    cmd!("עם_הערות_דו_צד", "twosided", "torah", "קטע עם הערות משני הצדדים", "Section with notes on both sides", "#עם_הערות_דו_צד[|]"),
    cmd!("הערת_ימין", "noteright", "torah", "הערה בטור הימני (דו-צדדי)", "Right-side note (two-sided)", "#הערת_ימין[|]"),
    cmd!("הערת_שמאל", "noteleft", "torah", "הערה בטור השמאלי (דו-צדדי)", "Left-side note (two-sided)", "#הערת_שמאל[|]"),
    // ---- review (tracked changes + editorial comments) ----
    cmd!("הוספה", "inserted", "review", "סימון הוספה (שינוי עקוב)", "Mark an insertion (tracked change)", "#הוספה[|]"),
    cmd!("מחיקה", "deleted", "review", "סימון מחיקה (שינוי עקוב)", "Mark a deletion (tracked change)", "#מחיקה[|]"),
    cmd!("הערת_עורך", "comment_", "review", "הערת עורך בשוליים", "Editorial margin comment", "#הערת_עורך[|]"),
    cmd!("הגדרות_סקירה", "review_config", "review", "תצוגת הסקירה (סימון / סופי / מקורי)", "Review view (markup / final / original)", "#הגדרות_סקירה(תצוגה: \"סופי\")"),
    // ---- section page setup ----
    cmd!("מקטע_עמוד", "page_section", "layout", "מקטע עם הגדרות עמוד משלו (טורים/שוליים/כותרות/סימן מים)", "Section with its own page setup (columns/margins/headers/watermark)", "#מקטע_עמוד(טורים: 2)[|]"),
    // ---- math ----
    cmd!("נוסחה", "formula", "math", "נוסחה מוצגת (שורה משלה)", "Displayed formula (own line)", "#נוסחה(\"|\")"),
    cmd!("נוסחה_בשורה", "iformula", "math", "נוסחה בתוך השורה", "Inline formula", "#נוסחה_בשורה(\"|\")"),
    // ---- cross-references ----
    cmd!("סמן", "anchor", "reference", "סמן יעד להפניה", "Mark a reference target", "#סמן(\"|\")"),
    cmd!("הפניה", "xref", "reference", "הפניה ליעד (מספר מתעדכן)", "Reference (auto number)", "#הפניה(\"|\")"),
];

/// The registry serialized to JSON, for the front end.
pub fn commands_json() -> String {
    serde_json::to_string(COMMANDS).unwrap_or_else(|_| "[]".to_string())
}

/// Distinct category keys, in first-seen order.
///
/// Like `template_body`, this is library API rather than something the bundled
/// front ends use — they group the JSON registry themselves. It is the
/// definition of the category order a UI should present.
pub fn categories() -> Vec<&'static str> {
    let mut seen = Vec::new();
    for c in COMMANDS {
        if !seen.contains(&c.category) {
            seen.push(c.category);
        }
    }
    seen
}

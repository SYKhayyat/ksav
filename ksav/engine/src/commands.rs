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
    ///
    /// # What a category is, and what it is not
    ///
    /// It says **what this command is about** — the subject a writer would name
    /// when looking for it. Nothing more: it is not a claim about which menu
    /// shows the command, which is the client's question and is answered in the
    /// client (`app/src/menus.ts`), because this crate has never seen a menubar.
    ///
    /// Two categories are distinct when a writer would go looking under one and
    /// not the other. That is why `list` and `table` are separate despite both
    /// being grids of text — somebody wanting a table does not look under lists
    /// — and it is why `#תוכן` left `list` for `reference`: a table of contents
    /// is not a list you type, it is generated from the headings, which is the
    /// same thing a cross-reference is and nothing that a bulleted list is.
    pub category: &'static str,
    /// Hebrew description.
    pub desc_he: &'static str,
    /// English description.
    pub desc_en: &'static str,
    /// Text to insert; `|` marks the desired cursor position.
    ///
    /// # No placeholder content
    ///
    /// A slot the writer has to fill is left **empty**, never filled with a word
    /// standing in for what belongs there. `#רשימת_הגדרות` used to arrive as
    /// `הגדרה[מונח][]` and `#גמרא` as `[ברכות][ב.]`, which put the words *term*,
    /// *Berachos* and *2a* into the document looking exactly like text the writer
    /// had typed — so the writer either shipped them or deleted them by hand,
    /// and the sample taught nothing either way. Four commands did this.
    ///
    /// What the slots are *for* is a question the interface answers where the
    /// command is offered, in the language the writer reads. A document is not
    /// the place to keep documentation.
    ///
    /// A **default** is a different thing and stays: `#הערות_בסוף(כותרת: [הערות])`
    /// titles a block that needs a title, and `#סימן[א׳]` starts a series the
    /// numbering commands continue from. Neither is standing in for something.
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
    // A look, as one command — the knobs a custom paragraph style is made of.
    // Rarely typed by hand: it is what a `#let` written by the style editor
    // calls, and what lets the editor read that `#let` back.
    cmd!("עיצוב", "styled", "style", "עיצוב מותאם (גודל, משקל, צבע, יישור)", "A custom look (size, weight, colour, alignment)", "#עיצוב(גודל: 1.1em)[|]"),
    cmd!("סימון", "mark", "style", "הדגשה בצבע רקע", "Highlight", "#סימון[|]"),
    // `#רקע` is the same command with the colour written first, and it stays:
    // documents have it. `#סימון(צבע: …)` is what the toolbar writes.
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
    cmd!("הגדרות_כותרת_בהערה", "note_heading_config", "heading", "עיצוב הכותרות שבתוך ההערות", "How headings inside notes are set", "#הגדרות_כותרת_בהערה(צבע: luma(60))|"),
    cmd!("הגדרות_כותרות", "headings_config", "heading", "עיצוב הכותרות (גודל/צבע/יישור/מספור/קו לכל רמה)", "Configure headings (size/colour/align/numbering/rule per level)", "#הגדרות_כותרות(גודל: (2em, 1.4em), צבע: (rgb(\"#b91c1c\"), luma(40)), מספור: \"1.1\", קו: (true, false))|"),
    // One for each level, because a heading level is a command of its own and
    // the rule covers it: until these, saying anything about level 2 meant
    // writing the whole six-entry ramp and hoping the other five entries were
    // what they already were.
    cmd!("הגדרות_כותרת1", "h1_config", "heading", "עיצוב כותרות רמה 1", "How level 1 headings are set", "#הגדרות_כותרת1(גודל: 2em)|"),
    cmd!("הגדרות_כותרת2", "h2_config", "heading", "עיצוב כותרות רמה 2", "How level 2 headings are set", "#הגדרות_כותרת2(גודל: 1.5em)|"),
    cmd!("הגדרות_כותרת3", "h3_config", "heading", "עיצוב כותרות רמה 3", "How level 3 headings are set", "#הגדרות_כותרת3(גודל: 1.25em)|"),
    cmd!("הגדרות_כותרת4", "h4_config", "heading", "עיצוב כותרות רמה 4", "How level 4 headings are set", "#הגדרות_כותרת4(גודל: 1.1em)|"),
    cmd!("הגדרות_כותרת5", "h5_config", "heading", "עיצוב כותרות רמה 5", "How level 5 headings are set", "#הגדרות_כותרת5(גודל: 1em)|"),
    cmd!("הגדרות_כותרת6", "h6_config", "heading", "עיצוב כותרות רמה 6", "How level 6 headings are set", "#הגדרות_כותרת6(גודל: 0.95em)|"),
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
    cmd!("פריט", "item", "list", "פריט ברשימה", "List item", "פריט[|]"),
    cmd!("רשימת_הגדרות", "deflist", "list", "רשימת הגדרות", "Definition list", "#רשימת_הגדרות(\n  הגדרה[|][],\n)"),
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
    //
    // # Channels
    //
    // Eighteen commands wrote a note before this, and they were never eighteen
    // ideas: three arrangements by three tiers plus the escape hatches, exposed
    // as *cells* rather than as *axes*. `#מדף_ב` is not something a writer would
    // want to say — it is *tier two, printed at the foot of the page*, which is
    // two settings wearing a command's clothes.
    //
    // A **channel** is a note stream. It owns its numbering, only notes in the
    // same channel number together, and two declarations describe one: a source
    // (the body text, or another channel) and a placement (the foot of the page,
    // the end of the section, the end of the document — optionally into a named
    // region). Everything below the first three entries is a spelling of that.
    cmd!("הערה", "fnote", "footnote", "הערת שוליים — ב#ערוץ שנבחר, או בברירת המחדל", "Footnote — in a chosen channel, or the default one", "#הערה[|]"),
    cmd!("ערוץ", "channel", "footnote", "הגדרת ערוץ הערות — על מה הוא נסמך והיכן הוא מודפס", "Declare a note channel — what it hangs off and where it prints", "#ערוץ(\"|\", מיקום: \"רגל\")"),
    cmd!("אזור", "region", "footnote", "אזור קבוע שערוצים מופנים אליו, עם גובה משלו", "A fixed region channels are pointed into, with a height of its own", "#אזור(\"|\", מיקום: \"רגל\", גובה: 3cm)"),
    cmd!("הצג_אזור", "show_region", "footnote", "הצגת ערוצי האזור כאן (בסוף המדור או המסמך)", "Print a region's channels here (end of the section or the document)", "#הצג_אזור(\"|\")"),
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
    // Deprecated, and it is the same case as `הערה_על_הערה` one line up: a second
    // name for something the writer already has. `#let הערה(body) =
    // הערה_בדרגה(1, body)` — tier א *is* the ordinary footnote — so the Insert
    // menu was offering "footnote" and "layered note — tier א (on the text)" as
    // two choices for one function, which reads as "the layered kind is a
    // different thing you must switch to before you can hang a note off it".
    // Nothing has required that since the engine adopted the plain note. Still
    // compiles, still completes, no longer advertised.
    cmd!("הערה_א", "tier1", "footnote", "מיושן — זהו #הערה עצמה. דרגה א היא הערת השוליים הרגילה", "Deprecated — this is #הערה itself. Tier A is the ordinary footnote", "#הערה[|]", true),
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
    cmd!("הגדרות_הערתסיום", "endnote_config", "footnote", "עיצוב סימני הערות הסיום", "How endnote marks are set", "#הגדרות_הערתסיום(צבע: luma(90))|"),
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
    cmd!("הגדרות_קו_מפריד", "hrule_config", "layout", "עיצוב הקווים המפרידים (עובי/צבע/רוחב/יישור)", "How horizontal rules are set (thickness/colour/width/alignment)", "#הגדרות_קו_מפריד(עובי: 1pt)|"),
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
    // A paragraph break as a command, for the places a blank line cannot be one:
    // inside a list item, a note body or a cell. See the prelude for why the
    // English name is `parabreak` and not Typst's own `parbreak`.
    cmd!("מעבר_פסקה", "parabreak", "layout", "מעבר פסקה (בלי שורה ריקה)", "Paragraph break (without a blank line)", "#מעבר_פסקה"),
    cmd!("מעבר_טור", "cbreak", "layout", "מעבר טור", "Column break", "#מעבר_טור"),
    cmd!("רווח_אופקי", "hspace", "layout", "רווח אופקי", "Horizontal space", "#רווח_אופקי(מידה: 1em)"),
    // ---- images ----
    cmd!("תמונה", "img", "image", "הוספת תמונה", "Insert an image", "#תמונה(\"|\", רוחב: 60%)"),
    cmd!("הגדרות_תמונה", "image_config", "image", "עיצוב התמונות והכיתובים", "How pictures and their captions are set", "#הגדרות_תמונה(רוחב: 60%, יישור: \"center\")|"),
    // ---- torah / yeshiva ----
    cmd!("סימן", "siman", "torah", "כותרת סימן", "Siman heading", "#סימן[א׳][|]"),
    cmd!("סעיף", "seif", "torah", "סעיף הלכתי ממוספר", "Lettered halacha", "#סעיף[א][|]"),
    cmd!("פסוק", "verse", "torah", "פסוק עם מקור", "Verse with reference", "#פסוק[|][]"),
    cmd!("מראה_מקום", "sourcenote", "torah", "מראה מקום (הערה)", "Source footnote", "#מראה_מקום[|]"),
    cmd!("ציון", "refmark", "torah", "ציון מקור בסוגריים", "Inline reference", "#ציון[|]"),
    cmd!("גמרא", "gemara", "torah", "מראה מקום לגמרא", "Gemara reference", "#גמרא[|][]"),
    cmd!("אות", "os", "torah", "אות פותחת של סעיף, מודגשת עם הנקודה — בתוך פסקה רצה", "The letter that opens a clause, bold with its stop — inline, unlike #סעיף", "#אות[|]"),
    cmd!("דיבור_המתחיל", "dh", "torah", "דיבור המתחיל", "Dibbur hamaschil (d\"h)", "#דיבור_המתחיל[|]"),
    // The indexes. `ציון_מקור` and `ערך` are marks, and the two `מפתח_` commands
    // print what the marks collected — so they belong at the *back* of the
    // document, which is the one thing about them a writer has to be told.
    cmd!("ציון_מקור", "sourceref", "torah", "ציון מקור — נכנס למפתח המקורות", "Cite a sefer — indexed", "#ציון_מקור(\"|\", מקום: \"\")"),
    cmd!("כלול", "include_part", "block", "הכללת מסמך אחר (פרק) — בשורה משלו", "Include another document (a chapter) — on its own line", "#כלול(\"|\")"),
    cmd!("מפתח_מקורות", "sourceindex", "torah", "מפתח המקורות (בסוף הספר)", "Source index (at the back)", "#מפתח_מקורות()"),
    cmd!("ערך", "indexentry", "torah", "סימון ערך למפתח הענינים", "Mark a term for the topic index", "#ערך(\"|\")[]"),
    cmd!("מפתח_ענינים", "topicindex", "torah", "מפתח הענינים (בסוף הספר)", "Topic index (at the back)", "#מפתח_ענינים()"),
    // The mark register. Every collectable mark — ציון, גמרא, דיבור_המתחיל,
    // פסוק, סימן, ערך, ציון_מקור, מראה_מקום — is gathered by class, so one
    // command lists any of them and one command styles a whole class. The class
    // is the first argument, and it is the command's own name.
    cmd!("רשימת_סימונים", "marklist", "torah", "רשימת כל הסימונים מסוג אחד (בסוף הספר)", "List every mark of one kind (at the back)", "#רשימת_סימונים(\"|\")"),
    // Deprecated: every styled command has a door named for it, and this is the
    // one that named none of them. `#הגדרות_סימונים(גודל: ("סימן": 1.6em))` and
    // `#הגדרות_סימן(גודל: 1.6em)` are one setting written two ways, and the
    // second is what a writer setting how simanim look would type — the first
    // reads as a class name buried in a call about marks in general.
    //
    // It also could not refuse a knob. A door stops the compile on one its class
    // has no answer for; this wrote a fill onto a gemara reference, stored it,
    // and never read it. So the panel offered fourteen controls whatever the
    // class was, half of them doing nothing for most of them.
    //
    // Still compiles, because documents have it. No longer offered.
    cmd!("הגדרות_סימונים", "marks_config", "torah", "עיצוב כמה סוגים בבת אחת", "Style several kinds at once", "#הגדרות_סימונים(סגנון: (\"|\": \"italic\"))", true),
    // A door per command, which is the rule: anything that is a separate
    // command has a style you can set, said about *that* command rather than
    // named inside a call about marks in general. They all write to one store,
    // so `#הגדרות_סימן(גודל: 1.6em)` and the row for `"סימן"` in the command
    // above are two spellings of one fact and cannot disagree.
    cmd!("הגדרות_סימן", "siman_config", "torah", "עיצוב הסימנים", "How simanim are set", "#הגדרות_סימן(גודל: 1.2em)|"),
    cmd!("הגדרות_סעיף", "seif_config", "torah", "עיצוב אות הסעיף", "How a seif's letter is set", "#הגדרות_סעיף(משקל: \"bold\")|"),
    cmd!("הגדרות_אות", "os_config", "torah", "עיצוב האות הפותחת", "How the opening letter is set", "#הגדרות_אות(משקל: \"bold\")|"),
    cmd!("הגדרות_מראה_מקום", "sourcenote_config", "torah", "עיצוב מראי המקומות", "How source notes are set", "#הגדרות_מראה_מקום(גודל: 0.9em)|"),
    cmd!("הגדרות_ציון", "ref_config", "torah", "עיצוב הציונים", "How inline references are set", "#הגדרות_ציון(גודל: 0.85em)|"),
    cmd!("הגדרות_גמרא", "gemara_config", "torah", "עיצוב מראי המקומות בגמרא", "How gemara references are set", "#הגדרות_גמרא(סגנון: \"italic\")|"),
    cmd!("הגדרות_דיבור_המתחיל", "dh_config", "torah", "עיצוב הדיבורים המתחילים", "How dibburim hamaschilim are set", "#הגדרות_דיבור_המתחיל(משקל: \"bold\")|"),
    cmd!("הגדרות_פסוק", "verse_config", "torah", "עיצוב הפסוקים", "How verses are set", "#הגדרות_פסוק(סגנון: \"italic\")|"),
    cmd!("הגדרות_ציון_מקור", "sourceref_config", "torah", "עיצוב ציוני המקור", "How cited sefarim are set", "#הגדרות_ציון_מקור(סגנון: \"italic\")|"),
    cmd!("הגדרות_ערך", "indexentry_config", "torah", "עיצוב ערכי המפתח", "How index terms are set", "#הגדרות_ערך(גודל: 1em)|"),
    // The blocks, whose looks were written into the commands themselves — a
    // callout's blue, a box's grey border, the padding they share. What a block
    // wants set is not a text look, so these take a fill, a border, padding, a
    // corner, a width and an alignment as well.
    cmd!("הגדרות_ציטוט", "blockquote_config", "block", "עיצוב הציטוטים", "How block quotations are set", "#הגדרות_ציטוט(סגנון: \"italic\")|"),
    cmd!("הגדרות_הערת_צד", "callout_config", "block", "עיצוב הערות הצד", "How callouts are set", "#הגדרות_הערת_צד(קו: rgb(\"#2563eb\"))|"),
    cmd!("הגדרות_אזהרה", "warnbox_config", "block", "עיצוב האזהרות", "How warnings are set", "#הגדרות_אזהרה(גוון: rgb(\"#fef2f2\"))|"),
    cmd!("הגדרות_הצלחה", "okbox_config", "block", "עיצוב תיבות ההצלחה", "How success boxes are set", "#הגדרות_הצלחה(גוון: rgb(\"#f0fdf4\"))|"),
    cmd!("הגדרות_תיבה", "framebox_config", "block", "עיצוב התיבות", "How boxes are set", "#הגדרות_תיבה(מסגרת: 1pt + luma(120))|"),
    cmd!("הגדרות_מקור", "cite_config", "block", "עיצוב ציטוטי המקור", "How source citations are set", "#הגדרות_מקור(סגנון: \"italic\")|"),
    cmd!("הגדרות_שער", "title_config", "heading", "עיצוב השער", "How the title is set", "#הגדרות_שער(גודל: 2em)|"),
    cmd!("הגדרות_תת_שער", "subtitle_config", "heading", "עיצוב תת השער", "How the subtitle is set", "#הגדרות_תת_שער(גודל: 1.2em)|"),
    cmd!("עם_פירוש", "commentary", "torah", "טקסט עם פירוש בצד העמוד", "Text with side commentary", "#עם_פירוש([|], [])"),
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
    cmd!("הגדרות_הוספה", "inserted_config", "review", "עיצוב סימוני ההוספה", "How insertions are set", "#הגדרות_הוספה(צבע: green)|"),
    cmd!("הגדרות_מחיקה", "deleted_config", "review", "עיצוב סימוני המחיקה", "How deletions are set", "#הגדרות_מחיקה(קו_חוצה: false)|"),
    cmd!("הגדרות_הערת_עורך", "comment_config", "review", "עיצוב הערות העורך", "How editorial comments are set", "#הגדרות_הערת_עורך(גודל: 0.9em)|"),
    // ---- section page setup ----
    cmd!("מקטע_עמוד", "page_section", "layout", "מקטע עם הגדרות עמוד משלו (טורים/שוליים/כותרות/סימן מים)", "Section with its own page setup (columns/margins/headers/watermark)", "#מקטע_עמוד(טורים: 2)[|]"),
    // The running heads, as document content rather than as two boxes in the
    // settings drawer. The report's words: *"they are document content in a
    // settings control"* — and being a string in a settings field is what made
    // a bold word or a mixed run inexpressible. These take content, and a
    // document may set them more than once, which is what a sefer whose running
    // head names the current masechta actually needs.
    cmd!("כותרת_עליונה", "running_head", "layout", "כותרת רצה בראש העמוד", "Running head at the top of the page", "#כותרת_עליונה[|]"),
    cmd!("כותרת_תחתונה", "running_foot", "layout", "כותרת רצה בתחתית העמוד", "Running foot at the bottom of the page", "#כותרת_תחתונה[|]"),
    // ---- math ----
    cmd!("נוסחה", "formula", "math", "נוסחה מוצגת (שורה משלה)", "Displayed formula (own line)", "#נוסחה(\"|\")"),
    cmd!("נוסחה_בשורה", "iformula", "math", "נוסחה בתוך השורה", "Inline formula", "#נוסחה_בשורה(\"|\")"),
    cmd!("הגדרות_נוסחה", "formula_config", "math", "עיצוב הנוסחאות המוצגות", "How displayed formulas are set", "#הגדרות_נוסחה(גודל: 0.95em)|"),
    cmd!("הגדרות_נוסחה_בשורה", "iformula_config", "math", "עיצוב הנוסחאות שבתוך השורה", "How inline formulas are set", "#הגדרות_נוסחה_בשורה(גודל: 0.95em)|"),
    // ---- cross-references ----
    //
    // The table of contents lives here, and it used to live under `list`. Nobody
    // had ever written down why, and there is no why: a table of contents is not
    // a list the writer types, it is generated from the headings, exactly like a
    // cross-reference is generated from the target it points at. Both go stale
    // if the document moves and both fix themselves when it recompiles, which is
    // the property this category is about. Word files it the same way, under
    // References, which is where a writer arriving from Word goes looking.
    cmd!("תוכן", "toc", "reference", "תוכן העניינים", "Table of contents", "#תוכן()"),
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

/// Does this snippet's caret slot sit inside a string literal?
///
/// # Why the library answers this
///
/// `examples/emit-containers.rs` probes each command by filling the caret slot
/// with a page break and asking Typst whether it refuses — a page break inside a
/// body Typst will not allow one in is what makes a command a *container*, and
/// the editor reads the answer to decide whether it may offer one at a caret.
///
/// Ten commands write their caret between quotes: `#ערוץ("|", מיקום: …)`,
/// `#אזור("|", …)`, `#הצג_אזור("|")`, `#הערה_בשם("|")`, `#גוף_הערה("|")[]`,
/// `#ציון_מקור("|", …)`, `#כלול("|")`, `#ערך("|")[]`, `#רשימת_סימונים("|")` and
/// `#תמונה("|", …)`. Filling those produced `#ערוץ("א #מעבר_עמוד ב", …)`, where
/// the page break is **string content** — Typst never sees a page break at all,
/// compiles it happily, and the probe writes down "not a container".
///
/// Eight of the ten were recorded transparent on that basis, which is the
/// editor being told a page break inside them is fine by a measurement that
/// measured nothing. `#כלול` was one, and it is a container.
///
/// Here rather than in the example so it can be held to the commands it is about:
/// an example's `#[cfg(test)]` module is not run by `cargo test`.
///
/// Counted rather than parsed. These are snippet templates a few characters
/// long and the only quotes in them are real ones, so an odd number before the
/// `|` means it is inside one.
#[must_use]
pub fn caret_in_string(insert: &str) -> bool {
    let Some(at) = insert.find('|') else {
        return false;
    };
    insert[..at].matches('"').count() % 2 == 1
}

#[cfg(test)]
mod caret_tests {
    use super::*;

    #[test]
    fn a_caret_between_quotes_is_no_place_for_a_page_break() {
        assert!(caret_in_string(r#"#ערוץ("|", מיקום: "רגל")"#));
        assert!(caret_in_string(r#"#הצג_אזור("|")"#));
        // A caret in a body, after a string argument, is a real content slot.
        assert!(!caret_in_string(r#"#סימן("א")[|]"#));
        assert!(!caret_in_string("#הדגשה[|]"));
        assert!(!caret_in_string("#תוכן()"));
    }

    /// The class, over the registry the probe actually reads.
    #[test]
    fn every_snippet_with_a_quoted_caret_is_known_to_be_one() {
        let quoted: Vec<&str> = COMMANDS
            .iter()
            .filter(|c| caret_in_string(c.insert))
            .map(|c| c.he)
            .collect();
        // A floor, because a helper that stopped matching would empty this list
        // and the probe would go back to measuring string contents in silence.
        assert!(
            quoted.len() >= 8,
            "only {} snippets have a quoted caret, which is fewer than the ten this \n\
             was written for — either the registry changed or `caret_in_string` \n\
             stopped seeing them, and the container probe is measuring string \n\
             contents again. Found: {quoted:?}",
            quoted.len()
        );
        for name in ["ערוץ", "הצג_אזור", "כלול"] {
            assert!(
                quoted.contains(&name),
                "#{name} writes its caret inside a string and the probe no longer \n\
                 knows it. Found: {quoted:?}"
            );
        }
    }
}

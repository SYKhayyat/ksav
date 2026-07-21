// The Notes chooser — pick a note layout by intent, not by command name.
//
// The engine offers eleven distinct note layouts, and they were exposed as ~25
// raw commands sitting in one "Notes" group: הערה, הערה_על_הערה, הערה_א…ז,
// מדור_א…ז, מדף_א…ז, הערה_זרם, הערת_תוכן, הערת_מקור, הערתסיום, הערות_בסוף_צד,
// הערת_גיליון, הערת_ימין/הערת_שמאל. A writer cannot possibly know which to pick,
// and the wall of near-duplicate names is the single thing that most makes the
// app not feel like something a bochur would want to use.
//
// The redundancy is a *presentation* problem, not a reason to drop mechanisms:
// each of the eleven is a real sefer layout somebody wants. So this module asks
// the question the writer can actually answer — "where should the note go?" —
// and emits the right commands, including any scaffolding the layout needs.
//
// Every option here renders correctly; see spec.md and engine/README-notes.md.

export type NoteLayers = "one" | "two";

export interface NoteChoice {
  id: string;
  layers: NoteLayers;
  /** Short label, in each UI language. */
  he: string;
  en: string;
  /** One line saying where the notes land and what they look like. */
  descHe: string;
  descEn: string;
  /** A tiny page diagram: each string is a row of the page. */
  sketch: string[];
  /** Inserted at the cursor. `|` marks where the caret ends up. */
  insert: string;
  /**
   * A second marker for the upper layer, offered after the first for two-layer
   * layouts (e.g. the he'ara that hangs off the commentary).
   */
  insert2?: string;
  /** A line that must exist once, at the end of the document. */
  tail?: string;
  /**
   * This layout needs the section it applies to wrapped in a command. The
   * document is wrapped only if it is not wrapped already.
   */
  wrap?: { open: string; close: string };
  /** Shown when the layout needs the writer to know something. */
  noteHe?: string;
  noteEn?: string;
}

export const NOTE_CHOICES: NoteChoice[] = [
  // ---- one layer -----------------------------------------------------------
  {
    id: "footnote",
    layers: "one",
    he: "בתחתית העמוד",
    en: "At the foot of the page",
    descHe: "הערות רגילות, ממוספרות 1,2,3, מאוזנות מול הטקסט לאורך העמודים.",
    descEn: "Ordinary footnotes, numbered 1,2,3, balanced against the text across page breaks.",
    sketch: ["▤▤▤▤▤▤", "▤▤▤▤▤▤", "──────", "¹ ▪▪▪▪▪"],
    insert: "#הערה[|]",
  },
  {
    id: "endnote",
    layers: "one",
    he: "בסוף המסמך",
    en: "Collected at the end",
    descHe: "כל ההערות נאספות לרשימה אחת בסוף המסמך.",
    descEn: "Every note collected into one list at the very end of the document.",
    sketch: ["▤▤▤▤▤▤", "▤▤▤▤▤▤", "", "הערות", "1. ▪▪▪▪"],
    insert: "#הערתסיום[|]",
    tail: "#הערות_בסוף(כותרת: [הערות])",
  },
  {
    id: "section-endnote",
    layers: "one",
    he: "בסוף כל מדור",
    en: "At the end of each section",
    descHe: "ההערות נאספות בסוף כל קטע (למשל כל משנה), ליד הטקסט שלהן. המספור מתחיל מחדש בכל מדור.",
    descEn:
      "Notes collected at the end of each section (each mishnah, say), near the text they belong to. Numbering restarts each section.",
    sketch: ["▤▤▤▤▤▤", "1. ▪▪▪▪", "▤▤▤▤▤▤", "1. ▪▪▪▪"],
    insert: "#הערתסיום[|]",
    noteHe: "הוסיפו #הערות_בסוף() בסוף כל מדור — כל קריאה מציגה רק את ההערות שנכתבו מאז הקודמת.",
    noteEn:
      "Put #הערות_בסוף() at the end of each section — each call renders only the notes written since the previous one.",
  },
  {
    id: "sidenote",
    layers: "one",
    he: "בשולי העמוד, לצד השורה",
    en: "Down the margin, beside its line",
    descHe: "הערות בטור צדדי, כל הערה ממש לצד השורה שלה.",
    descEn: "Notes in a side column, each one right beside the line it hangs off.",
    sketch: ["▪▪ ▤▤▤▤", "   ▤▤▤▤", "▪▪ ▤▤▤▤", "   ▤▤▤▤"],
    insert: "#הערת_גיליון[|]",
    wrap: { open: "#עם_הערות_צד[\n", close: "\n]" },
  },
  {
    id: "twosided",
    layers: "one",
    he: "בשני צדי העמוד",
    en: "Down both margins",
    descHe: "שני זרמי הערות, אחד בכל צד של הטקסט — למשל ביאורים מימין ומקורות משמאל.",
    descEn:
      "Two note streams, one down each side of the text — commentary on one side, sources on the other.",
    sketch: ["▪ ▤▤▤▤ ▫", "  ▤▤▤▤", "▪ ▤▤▤▤ ▫"],
    insert: "#הערת_ימין[|]",
    insert2: "#הערת_שמאל[|]",
    wrap: { open: "#עם_הערות_דו_צד[\n", close: "\n]" },
  },
  {
    id: "streams",
    layers: "one",
    he: "שני מנגנונים במקביל",
    en: "Two apparatuses side by side",
    descHe:
      "שני זרמי הערות עצמאיים בתחתית העמוד, כל אחד עם מספור משלו — פירוש ומראי מקומות.",
    descEn:
      "Two independent note streams at the foot of the page, each numbered on its own — a peirush and mareh mekomos.",
    sketch: ["▤▤▤▤▤▤", "▤▤▤▤▤▤", "──────", "¹▪▪ │ א▪▪"],
    insert: "#הערת_תוכן[|]",
    insert2: "#הערת_מקור[|]",
    tail: '#הגדרות_זרמים(פריסה: "צד", זרמים: ("תוכן", "מקורות"), מספור: ("מקורות": "א"))',
  },
  {
    id: "bands",
    layers: "one",
    he: "אזורים קבועים בתחתית העמוד",
    en: "Fixed regions at the foot of the page",
    descHe: "אזורים בגובה קבוע בתחתית כל עמוד; אזור ריק נשאר ריק ואינו זז.",
    descEn:
      "Fixed-height regions at the foot of every page; an empty region stays empty instead of letting the others drift.",
    sketch: ["▤▤▤▤▤▤", "──────", "¹ ▪▪▪▪", "──────", "א ▫▫▫▫"],
    insert: "#מדף_א[|]",
    insert2: "#מדף_ב[|]",
    tail: "#הגדרות_מדפים(גבהים: (1.5cm, 1cm))",
  },
  // ---- two layers ----------------------------------------------------------
  {
    id: "nested",
    layers: "two",
    he: "הערה על הערה — רצף אחד",
    en: "A note on a note, one sequence",
    descHe:
      "שתי השכבות יורדות לתחתית העמוד ברצף מספרים אחד (1,2,3,4). ללא הפרדה חזותית בין השכבות.",
    descEn:
      "Both layers fall to the page bottom in one running sequence (1,2,3,4). No visual separation between them.",
    sketch: ["▤▤▤▤▤▤", "──────", "¹ ▪▪▪▪²", "² ▪▪▪▪"],
    insert: "#הערה[|]",
    insert2: "#הערה[|]",
  },
  {
    id: "two-bands",
    layers: "two",
    he: "שני מדורים נפרדים",
    en: "Two separately-numbered blocks",
    descHe:
      "הפירוש במדור אחד (א,ב,ג) וההערות עליו במדור שמתחתיו (1,2,3) — מראה שער־הציון. בסוף המדור או המסמך.",
    descEn:
      "The commentary in one block (א,ב,ג) and the he'aros on it in the block beneath (1,2,3) — the Shaar-HaTziyun look. At section or document end.",
    sketch: ["▤▤▤▤▤▤", "──────", "א ▪▪¹▪▪", "──────", "1 ▫▫▫▫"],
    insert: "#מדור_א[|]",
    insert2: "#מדור_ב[|]",
    tail: "#הערות_מדורגות()",
  },
  {
    id: "footnote-plus-endnotes",
    layers: "two",
    he: "הערות בעמוד + הערות עליהן בסוף",
    en: "Footnotes on the page, he'aros on them at the back",
    descHe:
      "הפירוש כהערות שוליים מאוזנות בתחתית העמוד, וההערות עליו נאספות לבלוק ממוספר משלהן בסוף.",
    descEn:
      "The commentary as balanced page-bottom footnotes, with the he'aros on it collected into their own numbered block at the back.",
    sketch: ["▤▤▤▤▤▤", "──────", "¹ ▪▪¹▪▪", "", "בסוף:", "1. ▫▫▫"],
    insert: "#הערה[|]",
    insert2: "#הערתסיום[|]",
    tail: "#הערות_בסוף(כותרת: [הערות על הפירוש])",
    noteHe: "השכבה הראשונה היחידה שנשארת באמת מאוזנת בעמוד.",
    noteEn: "The only two-layer option that keeps the primary apparatus genuinely balanced on the page.",
  },
  {
    id: "endnotes-with-footnotes",
    layers: "two",
    he: "פירוש בסוף + הערות מאוזנות עליו",
    en: "Commentary at the back, with balanced footnotes on it",
    descHe:
      "הפירוש נאסף בסוף, וההערות עליו הן הערות שוליים אמיתיות ומאוזנות בתחתית עמודי הפירוש. הדרך הזולה ביותר להערות־על־הערות מאוזנות באמת.",
    descEn:
      "The commentary is collected at the back, and the he'aros on it are real, balanced footnotes at the foot of the commentary pages. The cheapest genuinely balanced notes-on-notes.",
    sketch: ["▤▤▤▤▤▤", "", "בסוף:", "1. ▪▪¹▪", "──────", "¹ ▫▫▫▫"],
    insert: "#הערתסיום[|]",
    insert2: "#הערה[|]",
    tail: "#הערות_בסוף(כותרת: [הפירוש])",
    noteHe: "הפירוש אינו לצד הטקסט אלא בסוף — מתאים לכרך פירוש.",
    noteEn: "The commentary is not beside the main text but at the back — right for a commentary volume.",
  },
  {
    id: "companion",
    layers: "two",
    he: "כרך נפרד להערות",
    en: "A companion volume for the he'aros",
    descHe:
      "הפירוש כהערות שוליים, וההערות עליו כמסמך נפרד הממוספר בהתאמה — כפי שרוב ספרי ההערות נדפסים בפועל.",
    descEn:
      "The commentary as footnotes, and the he'aros on it as a separate document numbered to match — how most he'aros seforim actually ship.",
    sketch: ["▤▤▤▤▤▤", "──────", "¹ ▪▪▪▪", "", "כרך ב׳"],
    insert: "#הערה[|]",
    noteHe: "צרו מסמך שני בתפריט המסמכים והקלידו בו את ההערות לפי המספרים.",
    noteEn: "Create a second document from the Documents menu and write the he'aros there, numbered to match.",
  },
];

/** Does the document already end with (or contain) this scaffolding line? */
export function hasLine(doc: string, line: string): boolean {
  const head = line.split("(")[0].trim();
  return head.length > 0 && doc.includes(head);
}

/**
 * Apply a choice to a document.
 *
 * Returns the new text plus where the caret should land. The chooser does the
 * scaffolding a layout needs — the dump call at the end, the wrapper around the
 * section — because forgetting it is the single most common way these layouts
 * "don't work": the notes are collected and then never rendered.
 */
export function applyChoice(
  doc: string,
  selectionFrom: number,
  choice: NoteChoice,
  which: "primary" | "secondary" = "primary",
): { text: string; caret: number } {
  const snippet = (which === "secondary" ? choice.insert2 : choice.insert) ?? choice.insert;
  const caretInSnippet = snippet.indexOf("|");
  const clean = snippet.replace("|", "");

  let text = doc.slice(0, selectionFrom) + clean + doc.slice(selectionFrom);
  let caret = selectionFrom + (caretInSnippet < 0 ? clean.length : caretInSnippet);

  if (choice.wrap && !doc.includes(choice.wrap.open.trim())) {
    // Wrap the whole document: the note has to live inside the wrapper or it has
    // no column to land in.
    const before = text.length;
    text = choice.wrap.open + text + choice.wrap.close;
    caret += text.length - before - choice.wrap.close.length;
  }

  if (choice.tail && !hasLine(text, choice.tail)) {
    text = text.replace(/\s*$/, "") + "\n\n" + choice.tail + "\n";
  }

  return { text, caret };
}

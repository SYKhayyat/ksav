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

import { deferSnippet, fileNewBody, nextName } from "./deferred";
import { enclosing } from "./mode";

export type NoteLayers = "one" | "two";

/**
 * The two questions a writer can actually answer.
 *
 * Twelve cards each encoded a *where* and a *how* together, and the writer had
 * to decode which was which from a four-line ASCII sketch. Worse, nothing in the
 * grid distinguished "at the foot of every page" from "at the end of the
 * document" — so `#הערות_מדורגות`, which is an *end* apparatus and therefore
 * lands wherever the prose stops, looked broken on a short document (measured:
 * the band rendered at y=126 on an 842pt page, i.e. near the top) while the
 * page-bottom equivalent `#מדף_א`/`#מדף_ב` sat correctly at y=741 with nothing
 * in the UI saying they were different questions.
 *
 * So the chooser asks the two axes and the twelve cards become the cells.
 */
export type NoteWhere = "page" | "section" | "document" | "margin" | "volume";
export type NoteHow = "one" | "stacked" | "parallel" | "fixed" | "split";

export const NOTE_WHERE: NoteWhere[] = ["page", "section", "document", "margin", "volume"];
export const NOTE_HOW: NoteHow[] = ["one", "stacked", "parallel", "fixed", "split"];

export interface NoteChoice {
  id: string;
  layers: NoteLayers;
  /**
   * Word's own name for this arrangement, when it has one.
   *
   * Not a synonym for the sefer name — a second name, shown beside it. Someone
   * who has only ever used Word looks for "footnote" and "endnote"; someone
   * setting a sefer looks for שער־הציון. Both are looking at the same card, and
   * neither should have to learn the other's vocabulary to find it.
   */
  word?: "footnote" | "endnote";
  /** Which cells of the where × how grid this arrangement fills. */
  where: NoteWhere[];
  how: NoteHow;
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
   * A line that must exist once, at the **top** of the document.
   *
   * The distinction is not cosmetic. A `#הערות_בסוף` dump renders what came
   * before it, so it belongs at the end — but a `#הגדרות_…` line is a Typst
   * `state.update`, and the apparatus reads that state from the *page footer*,
   * which resolves it at the page's own position. Written at the end of the
   * file, the settings therefore take effect on the last page and no other:
   * the fixed band heights the writer asked for silently apply to one page of
   * a twenty-page sefer. Configuration goes first, dumps go last.
   */
  head?: string;
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
    word: "footnote",
    where: ["page"],
    how: "one",
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
    word: "endnote",
    where: ["document"],
    how: "one",
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
    where: ["section"],
    how: "one",
    layers: "one",
    he: "בסוף כל מדור",
    en: "At the end of each section",
    descHe: "ההערות נאספות בסוף כל קטע (למשל כל משנה), ליד הטקסט שלהן. המספור מתחיל מחדש בכל מדור.",
    descEn:
      "Notes collected at the end of each section (each mishnah, say), near the text they belong to. Numbering restarts each section.",
    sketch: ["▤▤▤▤▤▤", "1. ▪▪▪▪", "▤▤▤▤▤▤", "1. ▪▪▪▪"],
    insert: "#הערתסיום[|]",
    // One dump, at the end, even though the writer will move and multiply it.
    // Without it this card collected notes and rendered none of them: the page
    // came out with the markers and not one word of the prose. The chooser
    // cannot know where the sections are, but it can refuse to write a document
    // that loses text.
    tail: "#הערות_בסוף()",
    noteHe:
      "נכתבה קריאת #הערות_בסוף() אחת בסוף הקובץ. העבירו/שכפלו אותה לסוף כל מדור — כל קריאה מציגה רק את ההערות שנכתבו מאז הקודמת.",
    noteEn:
      "One #הערות_בסוף() call was written at the end of the file. Move or repeat it at the end of each section — each call renders only the notes written since the previous one.",
  },
  {
    id: "sidenote",
    where: ["margin"],
    how: "one",
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
    where: ["margin"],
    how: "parallel",
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
    where: ["page"],
    how: "parallel",
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
    head: '#הגדרות_זרמים(פריסה: "צד", זרמים: ("תוכן", "מקורות"), מספור: ("מקורות": "א"))',
  },
  {
    id: "bands",
    where: ["page"],
    how: "fixed",
    layers: "one",
    he: "אזורים קבועים בתחתית העמוד",
    en: "Fixed regions at the foot of the page",
    descHe: "אזורים בגובה קבוע בתחתית כל עמוד; אזור ריק נשאר ריק ואינו זז.",
    descEn:
      "Fixed-height regions at the foot of every page; an empty region stays empty instead of letting the others drift.",
    sketch: ["▤▤▤▤▤▤", "──────", "¹ ▪▪▪▪", "──────", "א ▫▫▫▫"],
    insert: "#מדף_א[|]",
    insert2: "#מדף_ב[|]",
    head: "#הגדרות_מדפים(גבהים: (1.5cm, 1cm))",
    noteHe:
      "הגבהים נקבעים בשורת #הגדרות_מדפים שבראש הקובץ — שנו אותם שם. מה שחורג מגובה האזור נחתך.",
    noteEn:
      "The heights live in the #הגדרות_מדפים line at the top of the file — change them there. Anything past a region's height is clipped.",
  },
  // ---- two layers ----------------------------------------------------------
  {
    id: "nested",
    where: ["page"],
    how: "stacked",
    layers: "two",
    he: "הערה על הערה — בבלוק אחד בתחתית העמוד",
    en: "A note on a note, in the one block at the page foot",
    descHe:
      "שתי השכבות יורדות לאותו בלוק בתחתית העמוד — הפירוש ממוספר א,ב,ג והערות עליו 1,2,3 ומוזחות, כך שרואים לאיזו שכבה שייך כל סימן.",
    descEn:
      "Both layers fall into the same block at the foot of the page — the commentary lettered א,ב,ג and the he'aros on it numbered 1,2,3 and indented, so a marker says which layer it belongs to.",
    sketch: ["▤▤▤▤▤▤", "──────", "א ▪▪¹▪▪", "  1 ▫▫▫"],
    insert: "#הערה_א[|]",
    insert2: "#הערה_ב[|]",
    // א,ב,ג for the commentary and 1,2,3 for the notes on it — the שער־הציון
    // order. This line said the opposite for a long time, and so did the engine
    // defaults, while the card beside it promised the right thing.
    head: '#הגדרות_הערות(מספור: ("א", "1"), הזחה: (0em, 1.4em))',
    noteHe:
      "בלוק אחד ולא שניים — לטיפוסט יש סדרת הערות שוליים מאוזנת אחת בלבד. לשני בלוקים נפרדים בחרו באפשרות הבאה.",
    noteEn:
      "One block, not two — Typst has exactly one balanced page-bottom series. For two genuinely separate blocks, take the next option.",
  },
  {
    id: "two-bands",
    where: ["section", "document"],
    how: "stacked",
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
    where: ["page"],
    how: "split",
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
    // Both apparatuses printed `¹`. A reader met two different ¹ on one page
    // with nothing to say which block to look in, and the product had no way to
    // tell them apart either. The back matter gets letters; the page keeps its
    // numbers. Only the layouts that actually mix the two are configured — a
    // document with endnotes alone is right to number them 1,2,3.
    head: '#הגדרות_הערות_סיום(מספור: "א")',
    noteHe: "השכבה הראשונה היחידה שנשארת באמת מאוזנת בעמוד.",
    noteEn: "The only two-layer option that keeps the primary apparatus genuinely balanced on the page.",
  },
  {
    id: "endnotes-with-footnotes",
    where: ["document"],
    how: "split",
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
    head: '#הגדרות_הערות_סיום(מספור: "א")',
    noteHe: "הפירוש אינו לצד הטקסט אלא בסוף — מתאים לכרך פירוש.",
    noteEn: "The commentary is not beside the main text but at the back — right for a commentary volume.",
  },
  {
    id: "companion",
    where: ["volume"],
    how: "split",
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

// ---------------------------------------------------------------- the grid

/** The arrangement in a cell of the where × how grid, if one exists. */
export function choiceAt(where: NoteWhere, how: NoteHow): NoteChoice | undefined {
  return NOTE_CHOICES.find((c) => c.where.includes(where) && c.how === how);
}

/**
 * Why a cell is empty — an i18n key, never silence.
 *
 * An impossible combination is greyed *with its reason* rather than hidden,
 * because a writer who cannot see that "fixed regions at the end of the
 * document" was considered has no way to know whether they asked the wrong
 * question or found a gap in the product.
 */
export function whyNot(where: NoteWhere, how: NoteHow): string {
  if (choiceAt(where, how)) return "";
  if (how === "fixed") return "whyFixedNeedsPage";
  if (where === "volume") return "whyVolumeIsSplit";
  if (how === "parallel") return "whyParallelNeedsPageOrMargin";
  if (where === "margin") return "whyMarginIsOneColumn";
  if (how === "split") return "whySplitNeedsTwoPlaces";
  return "whyNoSuchArrangement";
}

// ---------------------------------------------------------------- one path in
//
// §1.5 of the plan, and the complaint that produced it: *"I have to go into the
// menu to pick an org-mode one each time."* `settings.deferNoteBodies` was
// persisted correctly and read by exactly one caller — the Notes chooser. The
// toolbar `†`, `Ctrl+Shift+F` and the command palette each spliced `#הערה[|]`
// straight into the buffer, so a writer who had said "note bodies at the end of
// the file" got it only when they went through the modal.
//
// Four call sites, four authors, one preference honoured once. The fix is not to
// wire the other three: it is that there is one producer of note markup, and
// every surface reaches it *by inserting the ordinary snippet*. `noteFor` is
// what makes that possible — it recognises a raw registry snippet as the marker
// of a known layout, so `insertSnippet` can route it without any of its callers
// knowing that notes are special.

/** The layout (and layer) a raw snippet is the marker of, if any. */
export function noteFor(
  snippet: string,
): { choice: NoteChoice; which: "primary" | "secondary"; marker: string } | null {
  const s = snippet.trim();
  for (const choice of NOTE_CHOICES) {
    if (choice.insert === s) return { choice, which: "primary", marker: s };
  }
  for (const choice of NOTE_CHOICES) {
    if (choice.insert2 === s) return { choice, which: "secondary", marker: s };
  }
  // Tiers ג and below. `nested` names only the first two markers because a card
  // has to show something a person can read, but tier ד is the same layout and
  // needs the same configuration line — the one that makes the tiers legible.
  const nested = NOTE_CHOICES.find((c) => c.id === "nested");
  if (nested && /^#הערה_[גדהוז]\[\|?\]$/.test(s)) {
    return { choice: nested, which: "secondary", marker: s };
  }
  return null;
}

/** Every command that opens a note body — used to read the tier at the caret. */
const NOTE_COMMANDS = [
  "הערה",
  "הערה_א",
  "הערה_ב",
  "הערה_ג",
  "הערה_ד",
  "הערה_ה",
  "הערה_ו",
  "הערה_ז",
  "הערה_בדרגה",
  "הערה_על_הערה",
  "מראה_מקום",
  "הערתסיום",
  "מדור_א",
  "מדור_ב",
  "מדור_ג",
  "מדור_בדרגה",
  "מדף_א",
  "מדף_ב",
  "מדף_ג",
  "מדף_בדרגה",
  "הערת_גיליון",
  "הערת_ימין",
  "הערת_שמאל",
  "הערת_תוכן",
  "הערת_מקור",
  "הערה_זרם",
];

/** How many notes enclose this position. 0 in ordinary prose. */
export function noteDepthAt(doc: string, pos: number): number {
  return enclosing(doc, pos).filter((n) => NOTE_COMMANDS.includes(n)).length;
}

/**
 * The tiered-note command to write here.
 *
 * The toolbar's `⁑` used to insert `#הערה_על_הערה`, which is a cosmetic alias —
 * `footnote(text(size: 0.94em, style: "italic", …))`, measured at 10.2pt against
 * a plain nested footnote's 9.6pt, in the same block with the same rhythm. The
 * real tiered mechanism had no button at all. Now the button writes the real
 * thing, and it reads the caret: a tiered note inside one note is tier ב, inside
 * two is tier ג, and standing in ordinary prose it is tier א.
 */
export function tieredNoteAt(doc: string, pos: number): string {
  const tier = Math.min(noteDepthAt(doc, pos) + 1, TIER_NAMES.length);
  return `#${TIER_NAMES[tier - 1]}[|]`;
}

const TIER_NAMES = ["הערה_א", "הערה_ב", "הערה_ג", "הערה_ד", "הערה_ה", "הערה_ו", "הערה_ז"];

// ---------------------------------------------------------------- the index
//
// Word's navigation pane, for notes. Anyone with more than ten notes works by
// scanning the list and jumping, not by scrolling the source looking for the
// one that started "ועיין". Ksav had no such list, and the notes are exactly the
// text a writer most often needs to get back to.

export interface NoteSpan {
  /** Offset of the `#`. */
  from: number;
  /** Offset just past the closing bracket. */
  to: number;
  /** Offset of the first character of the body. */
  bodyFrom: number;
  /** The command, without the hash. */
  command: string;
  /** The note's text, brackets and nested markup included. */
  text: string;
  /** How many notes enclose this one: 0 for a note on the body. */
  depth: number;
}

/**
 * Every note in the document, in document order, nested ones included.
 *
 * A hand-rolled bracket walk rather than a regex, because a note body contains
 * arbitrary markup — brackets inside strings, escaped brackets, comments, and
 * other notes — and a regex that stops at the first `]` truncates any note with
 * emphasis in it. Unclosed notes are reported to where the text runs out, so a
 * document mid-edit still gets a list.
 */
export function notesIn(doc: string): NoteSpan[] {
  const out: NoteSpan[] = [];
  // One frame per open bracket: the index of the note it opened, or null for an
  // ordinary content block, or "paren" for an argument list. The last is not
  // decoration — a string only exists inside an argument list, and a `[` inside
  // a string opens nothing.
  const stack: (number | null | "paren")[] = [];
  let depth = 0;
  let i = 0;
  while (i < doc.length) {
    const c = doc[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"' && stack[stack.length - 1] === "paren") {
      i++;
      while (i < doc.length && doc[i] !== '"') i += doc[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (c === "/" && doc[i + 1] === "/") {
      while (i < doc.length && doc[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && doc[i + 1] === "*") {
      const close = doc.indexOf("*/", i + 2);
      i = close < 0 ? doc.length : close + 2;
      continue;
    }
    if (c === "#") {
      const m = /^#([A-Za-z0-9֐-׿_]+)[ \t]*(\()?/.exec(doc.slice(i, i + 48));
      if (m && NOTE_COMMANDS.includes(m[1])) {
        // Step over an argument list — `#הערה_בדרגה(2)[…]` — to reach the body.
        let j = i + m[0].length;
        if (m[2]) {
          let d = 1;
          while (j < doc.length && d > 0) {
            if (doc[j] === "(") d++;
            else if (doc[j] === ")") d--;
            j++;
          }
        }
        while (j < doc.length && /\s/.test(doc[j])) j++;
        if (doc[j] === "[") {
          out.push({
            from: i,
            to: doc.length,
            bodyFrom: j + 1,
            command: m[1],
            text: "",
            depth,
          });
          stack.push(out.length - 1);
          depth++;
          i = j + 1;
          continue;
        }
      }
      i++;
      continue;
    }
    if (c === "(") {
      stack.push("paren");
      i++;
      continue;
    }
    if (c === ")") {
      if (stack[stack.length - 1] === "paren") stack.pop();
      i++;
      continue;
    }
    if (c === "[") {
      stack.push(null);
      i++;
      continue;
    }
    if (c === "]") {
      const top = stack.pop();
      if (typeof top === "number") {
        out[top].to = i + 1;
        out[top].text = doc.slice(out[top].bodyFrom, i);
        depth--;
      }
      i++;
      continue;
    }
    i++;
  }
  // Anything still open ran off the end of the document; report it as far as it
  // got rather than dropping it, since a half-typed note is the common case.
  for (const n of out) if (!n.text) n.text = doc.slice(n.bodyFrom, n.to);
  return out;
}

/** The innermost note containing `pos`, if any. */
export function noteAt(doc: string, pos: number): NoteSpan | null {
  let best: NoteSpan | null = null;
  for (const n of notesIn(doc)) {
    if (n.from <= pos && pos <= n.to && (!best || n.from > best.from)) best = n;
  }
  return best;
}

/**
 * Rewrite one note as a different kind, keeping its text.
 *
 * The consolation prize for §1.4 — a tier-1 collector adopting the note the
 * writer already has is the real fix, and `#הערה` now *is* tier 1, but the band
 * apparatuses (`#מדור_*`, `#מדף_*`) collect their own markers and cannot adopt a
 * native footnote without printing it twice. For those, converting the note in
 * place beats retyping it.
 */
export function convertNote(doc: string, note: NoteSpan, command: string): { text: string; caret: number } {
  const body = doc.slice(note.bodyFrom, note.to - 1);
  const replacement = `#${command}[${body}]`;
  return {
    text: doc.slice(0, note.from) + replacement + doc.slice(note.to),
    caret: note.from + replacement.length - 1,
  };
}

/** Delete a note and its marker, leaving the surrounding prose joined up. */
export function deleteNote(doc: string, note: NoteSpan): { text: string; caret: number } {
  return { text: doc.slice(0, note.from) + doc.slice(note.to), caret: note.from };
}

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
  deferred = false,
  /**
   * The writer's selection, when they had one.
   *
   * A toolbar button pressed with text selected wraps that text — which is what
   * every word processor does and what the old direct splice did. Routing the
   * toolbar through the chooser's producer would have quietly dropped it, so
   * the producer learns about selections instead.
   *
   * With deferred bodies the selected text goes into the *body* at the end of
   * the file, not into the marker: the marker is a name, and there is nothing to
   * wrap there.
   */
  sel: { to?: number; text?: string; marker?: string } = {},
): { text: string; caret: number } {
  // `marker` overrides the layout's own: tiers ג and below are the same layout
  // as ב and want the same configuration line, but not the same command.
  const chosen =
    sel.marker ?? (which === "secondary" ? choice.insert2 : choice.insert) ?? choice.insert;
  // Where the prose is written is orthogonal to where the note prints, so it is
  // a rewrite of the snippet rather than a twelfth layout: the same eleven
  // choices, each available either way round.
  const pair = deferred ? deferSnippet(chosen, nextName(doc)) : null;
  const taken = sel.text ?? "";
  const snippet = pair ? pair.marker : chosen;
  const filled = pair ? snippet : snippet.replace("|", taken + "|");
  const caretInSnippet = filled.indexOf("|");
  const clean = filled.replace("|", "");

  const to = Math.max(selectionFrom, sel.to ?? selectionFrom);
  let text = doc.slice(0, selectionFrom) + clean + doc.slice(to);
  let caret = selectionFrom + (caretInSnippet < 0 ? clean.length : caretInSnippet);

  if (choice.wrap && !doc.includes(choice.wrap.open.trim())) {
    // Wrap the whole document: the note has to live inside the wrapper or it has
    // no column to land in.
    const before = text.length;
    text = choice.wrap.open + text + choice.wrap.close;
    caret += text.length - before - choice.wrap.close.length;
  }

  if (choice.head && !hasLine(text, choice.head)) {
    // First line of the file, before any wrapper: the apparatus reads this state
    // from the page footer, so anything it sits after is a page it never reaches.
    const line = choice.head + "\n\n";
    text = line + text;
    caret += line.length;
  }

  if (choice.tail && !hasLine(text, choice.tail)) {
    text = text.replace(/\s*$/, "") + "\n\n" + choice.tail + "\n";
  }

  // The body last, so it is filed *after* the layout's own scaffolding rather
  // than being pushed below it — and the caret follows the writer to it, since
  // the prose is what they are about to type.
  if (pair) {
    const body = pair.body.replace("|", taken + "|");
    const filed = fileNewBody(text, body.replace("|", ""));
    text = filed.text;
    caret = filed.at + body.indexOf("|");
  }

  return { text, caret };
}

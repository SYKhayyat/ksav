// Turning compiler output into something a writer can act on.
//
// Typst's diagnostics are written for someone who is writing Typst. Ksav's
// writer is not: they typed a Hebrew command, or picked a value from a menu, and
// what came back was "unknown variable: הדגשה" or — genuinely, for one wrong
// paper name — a forty-item enumeration of every paper size Typst knows, in the
// status bar, to a person who had chosen from a menu of four.
//
// Two rules. Anything we understand is rephrased in both languages at once, so
// it helps whichever one the reader has. Anything we do not understand is still
// shown, because an unhelpful message beats a swallowed one — but it is shown
// short, with the full text kept on hover for the bug report.

/**
 * How much raw compiler output the status bar will show.
 *
 * Typst's longest diagnostics are enumerations of every valid value. They fill
 * the status bar, push the word count off screen, and tell the writer nothing.
 */
export const MAX_DIAGNOSTIC_CHARS = 160;

/** A rephrasing of a compiler message, or null if we do not recognise it. */
export function friendlyPair(msg: string): { he: string; en: string } | null {
  const m = msg.toLowerCase();
  const unknown = msg.match(/unknown variable:\s*(\S+)/);
  if (unknown)
    return {
      he: `הפקודה #${unknown[1]} אינה מוכרת — בדקו את האיות, או הגדירו אותה תחת "הפקודות שלי".`,
      en: `Unknown command #${unknown[1]} — check the spelling, or define it under "Your commands".`,
    };
  if (m.includes("unclosed delimiter"))
    return {
      he: "יש סוגר שלא נסגר — ודאו שלכל [ יש ] ולכל ( יש ).",
      en: "A bracket isn't closed — make sure every [ has a ] and every ( has a ).",
    };
  if (m.includes("maximum") && m.includes("depth"))
    return {
      he: "יותר מדי רמות קינון בבת אחת (מגבלת בטיחות של Typst). נסו לפשט מעט את המבנה.",
      en: "Too many levels of nesting at once (a Typst safety limit). Try simplifying the structure a little.",
    };
  if (m.includes("not valid in code") || m.includes("preceding hash"))
    return {
      he: "יש בעיה ליד סימן # — אולי חסר רווח או סוגר, או שרצית סולמית רגילה (כתבו \\#).",
      en: "Something's off near a # — you may be missing a space or bracket, or want a literal # (write \\#).",
    };
  if (m.includes("file not found") || m.includes("failed to load"))
    return {
      he: "קובץ (למשל תמונה) לא נמצא — בדקו את הנתיב.",
      en: "A file (e.g. an image) wasn't found — check the path.",
    };
  // An unknown paper size makes Typst enumerate every name it knows — around
  // forty of them, in one unbroken line. The writer picked from a menu of four;
  // naming those four is the entire useful content.
  if (m.includes("expected") && (m.includes('"a4"') || m.includes('"us-letter"')))
    return {
      he: "גודל דף לא מוכר — בחרו A4, Letter, A5 או A3 בהגדרות (⚙).",
      en: "Unknown paper size — choose A4, Letter, A5 or A3 in Settings (⚙).",
    };
  if (m.includes("unknown font family") || m.includes("no font could be found"))
    return {
      he: "הגופן אינו זמין — בחרו גופן מהרשימה בהגדרות, או צרפו קובץ גופן למסמך.",
      en: "That font isn't available — pick one from the list in Settings, or attach a font file to the document.",
    };
  if (m.includes("expected") || m.includes("unexpected"))
    return {
      he: "התחביר אינו תקין כאן — בדקו סוגריים, פסיקים ומבנה הפקודה.",
      en: "Invalid syntax here — check brackets, commas, and the command structure.",
    };
  return null;
}

/**
 * The other half of the same job: a *caught* error, rather than a compiler
 * diagnostic.
 *
 * `friendlyPair` above handles what the compiler says. Nothing handled what a
 * `catch` caught, so six sites did `${t("saveFailed")} — ${String(e)}` and one
 * did `setStatus(String(e))` — a translated label with an untranslated English
 * `Error` glued to it, or nothing but the English. That is the same class of
 * defect as the compiler layer had before this module existed: a mechanism that
 * is right, reporting itself in the wrong vocabulary.
 *
 * `said` is bilingual, like everything else here, and `detail` is the machine's
 * own string — for `title`, never for the sentence.
 */
export type Doing = "compile" | "save_file" | "reach_girsa" | "linkify" | "general";

const DOING: Record<Doing, { he: string; en: string }> = {
  compile: { he: "ההידור", en: "the compile" },
  save_file: { he: "השמירה לקובץ", en: "saving to the file" },
  reach_girsa: { he: "הקשר עם גִּרְסָא", en: "reaching Girsa" },
  linkify: { he: "סימון המקורות", en: "marking the citations" },
  general: { he: "הפעולה", en: "the operation" },
};

const TROUBLES: { match: RegExp; he: (d: { he: string }) => string; en: (d: { en: string }) => string }[] = [
  {
    // `PostError::NotRunning` — Girsa is simply not open. Not a fault.
    match: /\bis not running\b/i,
    he: () => "גִּרְסָא אינה פועלת — פתחו אותה ונסו שוב",
    en: () => "Girsa isn't running — open it and try again",
  },
  {
    // `PostError::Unreachable` — the endpoint file outlived the listener.
    match: /could not reach|timed out|timeout/i,
    he: (d) => `${d.he} לא נענה בזמן — ייתכן שהיישום נסגר שלא כשורה`,
    en: (d) => `${d.en} did not answer in time — the other application may have closed badly`,
  },
  {
    match: /refused it\b|connection refused|actively refused/i,
    he: (d) => `${d.he} נדחה על ידי הצד השני`,
    en: (d) => `${d.en} was refused by the other side`,
  },
  {
    match: /failed to fetch|networkerror|load failed/i,
    he: (d) => `${d.he} לא הגיע לשרת — בדקו שהמנוע פועל`,
    en: (d) => `${d.en} never reached the server — check the engine is running`,
  },
  {
    match: /notallowederror|permission denied|access is denied/i,
    he: (d) => `${d.he} נמנעה — אין הרשאה לקובץ`,
    en: (d) => `${d.en} was blocked — no permission for the file`,
  },
  {
    match: /notfounderror|no such file|os error 2\b/i,
    he: (d) => `${d.he} נכשלה — הקובץ אינו נמצא במקום שנרשם`,
    en: (d) => `${d.en} failed — the file is not where it was recorded`,
  },
  {
    match: /quotaexceeded/i,
    he: (d) => `${d.he} נכשלה — אין מקום פנוי באחסון`,
    en: (d) => `${d.en} failed — there is no storage space left`,
  },
];

export interface Trouble {
  /** The bilingual sentence. Always present. */
  said: string;
  /** The machine's own string, for the details affordance. Never the message. */
  detail: string;
}

/** Whatever a `catch` caught, as something a writer can act on. */
export function troubleSaid(e: unknown, doing: Doing = "general"): Trouble {
  const detail = rawOf(e);
  const d = DOING[doing] ?? DOING.general;
  for (const fam of TROUBLES) {
    if (fam.match.test(detail)) return { said: `${fam.he(d)}  ·  ${fam.en(d)}`, detail };
  }
  // Unrecognised: still name what failed, still say where the rest of it is.
  return {
    said: `${d.he} נכשלה · פרטים בהצבה על ההודעה  ·  ${d.en} failed · details on hover`,
    detail,
  };
}

/** The machine's own string, however the error arrived. */
export function rawOf(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** One line for the status bar: rephrased if we can, shortened if we cannot. */
export function friendlyError(msg: string): string {
  const p = friendlyPair(msg);
  if (p) return `${p.he}  ·  ${p.en}`;
  const oneLine = msg.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_DIAGNOSTIC_CHARS
    ? oneLine.slice(0, MAX_DIAGNOSTIC_CHARS - 1) + "…"
    : oneLine;
}

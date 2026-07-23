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

/** One line for the status bar: rephrased if we can, shortened if we cannot. */
export function friendlyError(msg: string): string {
  const p = friendlyPair(msg);
  if (p) return `${p.he}  ·  ${p.en}`;
  const oneLine = msg.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_DIAGNOSTIC_CHARS
    ? oneLine.slice(0, MAX_DIAGNOSTIC_CHARS - 1) + "…"
    : oneLine;
}

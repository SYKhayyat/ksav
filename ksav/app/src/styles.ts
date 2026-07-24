// Reading and writing the document's own styling commands.
//
// Ksav had three styling systems that did not know about each other:
//
//   1. the Settings drawer (font, size, margins, spacing) — real app settings;
//   2. one-click Skins, which silently `Object.assign`ed over those settings, so
//      choosing one threw away your font with no undo affordance;
//   3. `#הגדרות_כותרות` / `_רשימות` / `_טבלאות` in the document, which are the
//      most powerful styling in the product and had no UI at all — the only way
//      to reach per-level heading design was to type Typst-ish markup.
//
// A writer had no mental model of where their formatting lived. This module is
// the missing half: it lets the UI read the current in-document styling and
// write it back, so those commands can be controls like everything else.
//
// It is deliberately conservative. A `#הגדרות_*` call is Typst source and may
// contain anything; the panel understands a specific set of keys and **preserves
// every key it does not recognise verbatim**, so opening the panel can never
// silently discard styling a writer typed by hand.

export type StyleCommand = "headings" | "lists" | "tables" | "review";

const COMMAND_NAMES: Record<StyleCommand, string[]> = {
  headings: ["הגדרות_כותרות", "headings_config"],
  lists: ["הגדרות_רשימות", "lists_config"],
  tables: ["הגדרות_טבלאות", "tables_config"],
  // Not styling, but the same shape — one `#הגדרות_*` call whose named arguments
  // the UI reads and writes — so it uses the same machinery rather than a second
  // copy of it. This one carries which review view the document is read in.
  review: ["הגדרות_סקירה", "review_config"],
};

/** The canonical (Hebrew) name we write. */
function canonical(kind: StyleCommand): string {
  return COMMAND_NAMES[kind][0];
}

/**
 * The English spelling of every argument name this panel writes.
 *
 * The panel speaks Hebrew internally — those are the canonical keys — and this
 * translates on the way out. Without it, opening the Styles panel on an English
 * document rewrote `#headings_config(numbering: "1.1")` as
 * `#הגדרות_כותרות(מספור: "1.1")`: still correct Typst, since every command and
 * parameter accepts both, and still a writer's English document turning Hebrew
 * underneath them because they clicked a control.
 *
 * A subset of `_en_params` in `engine/typst/ksav.typ`, which is the authority.
 * Only the keys this panel actually writes are here; anything else it finds in
 * the document is preserved verbatim under whatever name it already had.
 */
const EN_ARGS: Record<string, string> = {
  הזחה: "indent",
  הידוק: "tight",
  יישור: "align",
  מספור: "numbering",
  מרווח: "inset",
  סמן: "marker",
  פסים: "striped",
  צבע: "colour",
  צבע_כותרת: "header_fill",
  קו: "rule",
  קו_תחתון: "underline",
  רברבתי: "smallcaps",
  תצוגה: "display",
};
const HE_ARGS: Record<string, string> = Object.fromEntries(
  Object.entries(EN_ARGS).map(([he, en]) => [en, he]),
);

/** The language a document's commands are written in. */
export type CommandLang = "he" | "en";

/** An argument name in the form the panel reasons about (Hebrew). */
function canonicalKey(key: string): string {
  return HE_ARGS[key] ?? key;
}

/** An argument name in the form the document is written in. */
function keyIn(lang: CommandLang, key: string): string {
  return lang === "en" ? (EN_ARGS[key] ?? key) : key;
}

export interface StyleCall {
  /** Byte range of the whole `#command(...)` in the document. */
  from: number;
  to: number;
  /** Argument name → its source text, in order. Names are canonicalised to
   *  Hebrew, so a caller never has to know which language the document used. */
  args: Map<string, string>;
  /** Which language the call was written in, so a rewrite stays in it. */
  lang: CommandLang;
}

/** Split a Typst argument list into `name: value` pairs, respecting nesting. */
function splitArgs(src: string): Map<string, string> {
  const out = new Map<string, string>();
  let depth = 0;
  let inString = false;
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const colon = findTopLevelColon(t);
    if (colon < 0) continue; // positional argument — not something we manage
    out.set(t.slice(0, colon).trim(), t.slice(colon + 1).trim());
  }
  return out;
}

function findTopLevelColon(s: string): number {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}

/** Find the document's `#הגדרות_*` call of this kind, if it has one. */
export function findStyleCall(doc: string, kind: StyleCommand): StyleCall | null {
  for (const name of COMMAND_NAMES[kind]) {
    const at = doc.indexOf("#" + name);
    if (at < 0) continue;
    const open = at + 1 + name.length;
    if (doc[open] !== "(") continue;
    let depth = 1;
    let inString = false;
    let i = open + 1;
    for (; i < doc.length && depth > 0; i++) {
      const c = doc[i];
      if (inString) {
        if (c === "\\") i++;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    if (depth !== 0) continue; // unbalanced — leave it alone
    const raw = splitArgs(doc.slice(open + 1, i - 1));
    const args = new Map([...raw].map(([k, v]) => [canonicalKey(k), v]));
    return { from: at, to: i, args, lang: name === canonical(kind) ? "he" : "en" };
  }
  return null;
}

/**
 * Set (or clear) named arguments on the document's styling command.
 *
 * A value of `null` removes that argument. Arguments the caller does not mention
 * are left exactly as they were, including ones this UI knows nothing about.
 * Returns the new document text and where the call now ends.
 *
 * `lang` decides the language of a *new* call. An existing one keeps the
 * language it was already written in, whatever the document's direction says —
 * the writer's own text wins over a setting.
 */
export function setStyleArgs(
  doc: string,
  kind: StyleCommand,
  changes: Record<string, string | null>,
  lang: CommandLang = "he",
): string {
  const existing = findStyleCall(doc, kind);
  const args = existing ? new Map(existing.args) : new Map<string, string>();
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) args.delete(k);
    else args.set(k, v);
  }

  if (args.size === 0) {
    // Nothing left to say: remove the call rather than leaving `#הגדרות_כותרות()`
    // sitting in the document doing nothing.
    if (!existing) return doc;
    return trimBlankLine(doc.slice(0, existing.from) + doc.slice(existing.to));
  }

  const out = existing ? existing.lang : lang;
  const name = out === "en" ? COMMAND_NAMES[kind][1] : canonical(kind);
  const rendered =
    "#" +
    name +
    "(" +
    [...args.entries()].map(([k, v]) => `${keyIn(out, k)}: ${v}`).join(", ") +
    ")";

  if (existing) return doc.slice(0, existing.from) + rendered + doc.slice(existing.to);
  // A new styling command goes at the very top: these are document-wide set
  // rules read at each element's own location, so anything above them would be
  // styled by the previous settings.
  return rendered + "\n" + doc;
}

function trimBlankLine(s: string): string {
  return s.replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------- value coding
//
// The panel deals in plain JS values; the document deals in Typst source. These
// convert between the two for the specific shapes the panel exposes.

export function typstString(v: string): string {
  return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function typstBool(v: boolean): string {
  return v ? "true" : "false";
}

/** `#rrggbb` → a Typst colour literal. */
export function typstColor(hex: string): string {
  return `rgb(${typstString(hex)})`;
}

/** Read a Typst colour literal back to `#rrggbb`, or null if it is not one. */
export function readColor(src: string | undefined): string | null {
  if (!src) return null;
  const m = /rgb\(\s*"(#[0-9a-fA-F]{3,8})"\s*\)/.exec(src);
  if (m) return m[1];
  const luma = /luma\(\s*(\d+)\s*\)/.exec(src);
  if (luma) {
    const n = Math.max(0, Math.min(255, parseInt(luma[1], 10)));
    const h = n.toString(16).padStart(2, "0");
    return `#${h}${h}${h}`;
  }
  return null;
}

export function readString(src: string | undefined): string | null {
  if (!src) return null;
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(src.trim());
  return m ? m[1].replace(/\\(.)/g, "$1") : null;
}

export function readBool(src: string | undefined): boolean | null {
  if (!src) return null;
  const t = src.trim();
  return t === "true" ? true : t === "false" ? false : null;
}

/** Read a length like `1.5em` / `10pt` / `1cm`, returning its number. */
export function readLength(src: string | undefined, unit: string): number | null {
  if (!src) return null;
  const m = new RegExp(`^(-?[\\d.]+)${unit}$`).exec(src.trim());
  return m ? parseFloat(m[1]) : null;
}

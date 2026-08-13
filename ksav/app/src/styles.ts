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

import { bothSpellings } from "./engine.gen";
import { scan, splitArgs, topLevelColon } from "./spans";
import { typstString } from "./typst-escape";

export type StyleCommand =
  | "headings"
  | "lists"
  | "tables"
  | "review"
  | "notes"
  | "bands"
  | "streams";

const COMMAND_NAMES: Record<StyleCommand, string[]> = {
  headings: ["הגדרות_כותרות", "headings_config"],
  lists: ["הגדרות_רשימות", "lists_config"],
  tables: ["הגדרות_טבלאות", "tables_config"],
  // Not styling, but the same shape — one `#הגדרות_*` call whose named arguments
  // the UI reads and writes — so it uses the same machinery rather than a second
  // copy of it. This one carries which review view the document is read in.
  review: ["הגדרות_סקירה", "review_config"],
  // The tiered notes. Every knob the apparatus has — per-tier size, slant,
  // colour, indent, numbering scheme, label prefix, the gap between entries —
  // has always been configurable and none of it was reachable except by typing
  // the command. And the shipped ramp was 0.9em → 0.88em → 0.86em, so a writer
  // who *did* find it was tuning something they could not see.
  notes: ["הגדרות_הערות", "footnote_config"],
  // The fixed page-foot regions. Its `גבהים` tuple is the one setting in the
  // product that changes **page geometry** — the engine reserves the foot of
  // every page from it — and the only instruction for changing it was the note
  // on the chooser card: *"the heights live in the #הגדרות_מדפים line at the top
  // of the file — change them there."* Telling a writer to go and edit Typst is
  // not a control.
  bands: ["הגדרות_מדפים", "pagebands_config"],
  // The other page-foot apparatus, and the one that had no UI at all.
  //
  // `#הערה_זרם("שם")` gives any number of independent peer streams — a peirush,
  // a mareh mekomos, a nuschaos band — and `גבהים` pins each to a region of its
  // own height, in the same page foot the bands reserve. Every one of its knobs
  // (the order, the per-stream numbering, the titles, stacked versus side by
  // side, the heights) was reachable only by typing the command, which is the
  // same complaint that produced `bands` one entry up.
  streams: ["הגדרות_זרמים", "streams_config"],
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
  כפה: "force",
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
  גודל: "size",
  סגנון: "style",
  תוויות: "labels",
  ריווח: "spacing",
  גבהים: "heights",
  זרמים: "streams",
  פריסה: "layout",
  כותרות: "titles",
  קו_בין: "rule_between",
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

/**
 * Split a Typst argument list into `name: value` pairs, respecting nesting.
 *
 * Both halves come from `spans.ts`. The two loops that used to be here — and
 * the third inside `findStyleCall`, and the fourth inside `readTuple` — each
 * opened a string on any `"`, including inside a `[…]` body where Typst reads
 * it as an ordinary character. Four scanners in one file, none of them counted
 * by the survey that found the other ten.
 */
function splitStyleArgs(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of splitArgs(src, 0, src.length)) {
    const colon = topLevelColon(src, g.from, g.to);
    if (colon < 0) continue; // positional argument — not something we manage
    out.set(src.slice(g.from, colon).trim(), src.slice(colon + 1, g.to).trim());
  }
  return out;
}

/** Find the document's `#הגדרות_*` call of this kind, if it has one. */
export function findStyleCall(doc: string, kind: StyleCommand): StyleCall | null {
  for (const name of COMMAND_NAMES[kind]) {
    const node = scan(doc).nodes.find((n) => n.hash && n.name === name && n.args);
    if (!node) continue; // absent, or unbalanced — leave it alone
    const raw = splitStyleArgs(doc.slice(node.args!.from, node.args!.to));
    const args = new Map([...raw].map(([k, v]) => [canonicalKey(k), v]));
    return { from: node.from, to: node.args!.to + 1, args, lang: name === canonical(kind) ? "he" : "en" };
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

// ------------------------------------------------------- the per-instance layer
//
// The writer's model has three layers, and only the first was reachable from a
// control:
//
//   1. a **global** layer sets the default for a kind of thing;
//   2. an **individual** setting on one element overrules the global for it;
//   3. `כפה` (`force`) on the global overrules every individual setting back.
//
// Layer 2 is named arguments on the element itself — `#רשימה(סמן: [–], …)`,
// `#כותרת1(צבע: red)[פרק]`, `#הערה(גודל: 1em)[…]` — which `engine/typst/ksav.typ`
// resolves through one shared merge for every kind. This half is what lets a
// control write it: which commands carry the override, which of a kind's knobs one
// element may answer, and how to put an argument on a call **without reflowing
// the writer's own text**.

/** The switch that makes the global win over every per-element setting. */
export const OVERRULE = "כפה";

/**
 * The commands whose calls carry a per-instance override, per kind.
 *
 * Hebrew names only; both spellings are matched, through the generated pairing.
 * `review` is empty on purpose — which view a document is read in is not a style
 * of anything, so there is no element to put it on.
 *
 * `bands` is the **page** bands and not the section ones: the section apparatus is
 * `#הגדרות_מדורגות`, a fourth configuration with no panel section of its own, and
 * writing `#מדור_א`'s override against the page-band global would compare a
 * setting to the wrong default.
 */
const INSTANCE_COMMANDS: Record<StyleCommand, readonly string[]> = {
  headings: ["כותרת", "כותרת1", "כותרת2", "כותרת3", "כותרת4", "כותרת5", "כותרת6"],
  lists: ["רשימה", "ממוספרת", "ממוספרת_עברית"],
  tables: ["טבלה"],
  review: [],
  notes: [
    "הערה",
    "הערה_בדרגה",
    "הערה_א",
    "הערה_ב",
    "הערה_ג",
    "הערה_ד",
    "הערה_ה",
    "הערה_ו",
    "הערה_ז",
    "הערה_על_הערה",
  ],
  bands: ["מדף_בדרגה", "מדף_א", "מדף_ב", "מדף_ג", "מדף_ד", "מדף_ה", "מדף_ו", "מדף_ז"],
  streams: ["הערה_זרם", "הערת_תוכן", "הערת_מקור"],
};

/** The Hebrew names, for a caller checking them against the prelude. */
export function instanceCommands(kind: StyleCommand): readonly string[] {
  return INSTANCE_COMMANDS[kind];
}

const INSTANCE_NAMES: Record<StyleCommand, Set<string>> = Object.fromEntries(
  Object.entries(INSTANCE_COMMANDS).map(([kind, names]) => [
    kind,
    new Set(names.flatMap((n) => bothSpellings(n))),
  ]),
) as Record<StyleCommand, Set<string>>;

/**
 * How one knob is shown and what it means — the whole per-instance surface.
 *
 * `size-em` and friends name the control, and the *keys of this table* are what
 * one element of the kind may overrule. One table and not two, deliberately: a
 * knob listed as overridable with no control beside it is a knob nobody can reach,
 * and the way to make that impossible is for the list and the controls to be the
 * same object.
 */
export type FieldKind =
  | "size-em"
  | "size-pt"
  | "length-em"
  | "length-pt"
  | "colour"
  | "slant"
  | "weight"
  | "bool"
  /** A border: present, or the word `none`, which is not the same as absent. */
  | "rule"
  | "marker"
  | "align"
  | "numbering"
  | "text";

export interface Field {
  kind: FieldKind;
  /** The i18n key naming this knob, in the words of a single element. */
  label: string;
}

/**
 * What **one element** of each kind may overrule, and how to show each knob.
 *
 * The key sets are the prelude's own lists, which is why
 * `test/enginefacts.test.mjs` reads them out of `ksav.typ` and fails when the two
 * disagree. The panel cannot be allowed a second opinion: offering a control the
 * engine refuses is a control that stops the compile, and hiding one it accepts is
 * a setting reachable only by typing the command — which is the complaint that
 * produced this panel in the first place.
 *
 * Headings, lists and tables answer for every knob their global has: each one is a
 * property of a heading, a list, a table. The apparatus kinds answer for their own
 * text and no more — a band's column count, a sidenote column's gutter and a
 * sequence's numbering scheme describe the *arrangement*, and one member of it has
 * no answer to give.
 */
export const INSTANCE_FIELDS: Record<StyleCommand, Readonly<Record<string, Field>>> = {
  headings: {
    גודל: { kind: "size-em", label: "knobSize" },
    משקל: { kind: "weight", label: "knobWeight" },
    צבע: { kind: "colour", label: "knobColour" },
    סגנון: { kind: "slant", label: "knobSlant" },
    יישור: { kind: "align", label: "knobAlign" },
    ריווח_לפני: { kind: "length-em", label: "knobSpaceBefore" },
    ריווח_אחרי: { kind: "length-em", label: "knobSpaceAfter" },
    קו_תחתון: { kind: "bool", label: "knobUnderline" },
    קו: { kind: "bool", label: "knobRule" },
    מספור: { kind: "numbering", label: "knobNumbering" },
    רברבתי: { kind: "bool", label: "knobSmallcaps" },
    מרווח_אותיות: { kind: "length-pt", label: "knobTracking" },
  },
  lists: {
    סמן: { kind: "marker", label: "knobMarker" },
    הזחה: { kind: "length-em", label: "knobIndent" },
    הזחת_גוף: { kind: "length-em", label: "knobBodyIndent" },
    ריווח: { kind: "length-em", label: "knobSpacing" },
    הידוק: { kind: "bool", label: "knobTight" },
    מספור: { kind: "numbering", label: "knobNumbering" },
    ריווח_מספור: { kind: "length-em", label: "knobNumberGap" },
  },
  tables: {
    קו: { kind: "rule", label: "knobBorder" },
    מרווח: { kind: "length-pt", label: "knobInset" },
    יישור: { kind: "align", label: "knobAlign" },
    פסים: { kind: "bool", label: "knobStriped" },
    צבע_פס: { kind: "colour", label: "knobStripeColour" },
    צבע_כותרת: { kind: "colour", label: "knobHeaderFill" },
    גופן: { kind: "text", label: "knobFont" },
    גודל: { kind: "size-pt", label: "knobSize" },
  },
  review: {},
  notes: {
    גודל: { kind: "size-em", label: "knobSize" },
    סגנון: { kind: "slant", label: "knobSlant" },
    צבע: { kind: "colour", label: "knobColour" },
    הזחה: { kind: "length-em", label: "knobIndent" },
    תוויות: { kind: "text", label: "knobLabel" },
  },
  bands: {
    גודל: { kind: "size-em", label: "knobSize" },
    סגנון: { kind: "slant", label: "knobSlant" },
    צבע: { kind: "colour", label: "knobColour" },
  },
  streams: {
    גודל: { kind: "size-em", label: "knobSize" },
    סגנון: { kind: "slant", label: "knobSlant" },
    צבע: { kind: "colour", label: "knobColour" },
  },
};

/** The same set as names, for the fence that compares it against the prelude. */
export const INSTANCE_KEYS: Record<StyleCommand, readonly string[]> = Object.fromEntries(
  Object.entries(INSTANCE_FIELDS).map(([kind, fields]) => [kind, Object.keys(fields)]),
) as unknown as Record<StyleCommand, readonly string[]>;

/** One element of a styleable kind, and the arguments it already carries. */
export interface InstanceCall {
  kind: StyleCommand;
  /** The command as the document spells it. */
  name: string;
  lang: CommandLang;
  /** Named arguments already on the call, canonicalised to Hebrew. */
  args: Map<string, string>;
  /** The `#`, for a caller that wants to put the caret on the command. */
  from: number;
  /** Just past the name, which is where an argument list goes when there is none. */
  nameTo: number;
  /** Inside the `(…)`, or null when the call has no argument list at all. */
  argList: { from: number; to: number } | null;
}

/**
 * The innermost element of `kind` that `pos` sits inside, if any.
 *
 * Innermost, because a note inside a heading inside a list is all three at once and
 * a control has to act on the one the caret is actually in. Deepest wins, and among
 * equals the latest — which for nested calls is the same answer arrived at twice.
 */
export function findInstance(doc: string, kind: StyleCommand, pos: number): InstanceCall | null {
  const names = INSTANCE_NAMES[kind];
  if (!names.size) return null;
  let best: InstanceCall | null = null;
  let bestDepth = -1;
  for (const n of scan(doc).nodes) {
    if (!names.has(n.name)) continue;
    if (pos < n.from || pos > n.to) continue;
    if (n.depth < bestDepth) continue;
    const raw = n.args ? argSpans(doc, n.args.from, n.args.to) : [];
    bestDepth = n.depth;
    best = {
      kind,
      name: n.name,
      lang: n.lang,
      args: new Map(raw.map((a) => [canonicalKey(a.key), doc.slice(a.valueFrom, a.valueTo)])),
      from: n.from,
      nameTo: n.nameTo,
      argList: n.args ? { from: n.args.from, to: n.args.to } : null,
    };
  }
  return best;
}

interface ArgSpan {
  key: string;
  /** The whole `name: value` segment, without the commas around it. */
  from: number;
  to: number;
  valueFrom: number;
  valueTo: number;
}

/** `[from, to)` with the whitespace at either end left outside it. */
function tight(doc: string, from: number, to: number): { from: number; to: number } {
  let a = from;
  let b = to;
  while (a < b && /\s/u.test(doc[a])) a++;
  while (b > a && /\s/u.test(doc[b - 1])) b--;
  return { from: a, to: b };
}

/** Every named argument in `[from, to)`, with the ranges a rewrite needs. */
function argSpans(doc: string, from: number, to: number): ArgSpan[] {
  const out: ArgSpan[] = [];
  for (const g of splitArgs(doc, from, to)) {
    const colon = topLevelColon(doc, g.from, g.to);
    if (colon < 0) continue; // positional — an item, a cell, a tier number
    const head = tight(doc, g.from, colon);
    const value = tight(doc, colon + 1, g.to);
    if (head.to <= head.from) continue;
    out.push({
      key: doc.slice(head.from, head.to),
      from: head.from,
      to: value.to,
      valueFrom: value.from,
      valueTo: value.to,
    });
  }
  return out;
}

/**
 * Set (or, with `null`, remove) named arguments on one element.
 *
 * **In place**, argument by argument, and that is the whole design. A list is
 * written across five lines with a trailing comma; a table across forty. Rebuilding
 * the argument list from parsed pieces would reflow all of it the first time
 * somebody ticked a checkbox — the writer's own text rearranged as a side effect of
 * a styling control, which is the sort of thing that makes a person stop trusting a
 * panel. So an existing argument has its value replaced, a new one is inserted just
 * inside the `(`, and every byte the panel was not asked about stays where it is.
 *
 * Edits are collected against the document as passed and applied last-first, so
 * each one's offsets are still the ones it was computed from.
 */
export function setInstanceArgs(
  doc: string,
  call: InstanceCall,
  changes: Record<string, string | null>,
): string {
  const spans = call.argList ? argSpans(doc, call.argList.from, call.argList.to) : [];
  const byKey = new Map(spans.map((s) => [canonicalKey(s.key), s]));
  const edits: { from: number; to: number; text: string }[] = [];
  const fresh: string[] = [];

  for (const [key, value] of Object.entries(changes)) {
    const found = byKey.get(key);
    if (found && value !== null) {
      edits.push({ from: found.valueFrom, to: found.valueTo, text: value });
    } else if (found) {
      // The comma goes with it, or removing the first of two arguments leaves the
      // call opening on one. Which comma depends on where the argument sits: the
      // one after it, unless it was the last, in which case the one before.
      const end = call.argList?.to ?? doc.length;
      let to = found.to;
      while (to < end && (doc[to] === "," || doc[to] === " " || doc[to] === "\t")) to++;
      let from = found.from;
      if (to >= end) {
        while (from > 0 && (doc[from - 1] === "," || doc[from - 1] === " " || doc[from - 1] === "\t")) {
          from--;
        }
      }
      edits.push({ from, to, text: "" });
    } else if (value !== null) {
      fresh.push(`${keyIn(call.lang, key)}: ${value}`);
    }
  }

  if (fresh.length) {
    const written = fresh.join(", ");
    if (!call.argList) {
      // No argument list at all — `#כותרת1[פרק]`. One is added, and the body it
      // already carries stays exactly where it was.
      edits.push({ from: call.nameTo, to: call.nameTo, text: `(${written})` });
    } else if (spans.length === 0 && doc.slice(call.argList.from, call.argList.to).trim() === "") {
      edits.push({ from: call.argList.from, to: call.argList.to, text: written });
    } else {
      edits.push({ from: call.argList.from, to: call.argList.from, text: `${written}, ` });
    }
  }

  let out = doc;
  for (const e of edits.sort((a, b) => b.from - a.from)) {
    out = out.slice(0, e.from) + e.text + out.slice(e.to);
  }
  return out;
}

/** Is this kind's global set to overrule every per-element setting? */
export function isOverruled(doc: string, kind: StyleCommand): boolean {
  return readBool(findStyleCall(doc, kind)?.args.get(OVERRULE)) === true;
}

// ---------------------------------------------------------------- value coding
//
// The panel deals in plain JS values; the document deals in Typst source. These
// convert between the two for the specific shapes the panel exposes.

/**
 * A Typst string literal.
 *
 * Re-exported rather than written, and it *was* written: byte-for-byte the same
 * expression as `typst-escape.ts`'s, in the module whose own header says it is
 * *"the one shared escaper every such panel now goes through"*. The engine had
 * the identical pair inside one crate — `lib.rs`'s `typst_str` and
 * `sefarim.rs`'s `typst_string`, forty lines from a `use super::*`, under a
 * comment there saying *"nothing else is allowed to build a string literal by
 * hand"*. Four copies of eleven characters, all agreeing, all of them written
 * after the rule forbidding them.
 *
 * Kept exported from here because the panel imports `styles.typstString` in a
 * dozen places and the name is right where it is used.
 */
export { typstString };

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

/**
 * Read a Typst tuple — `("א", "1")`, `(0em, 1.4em)`, `(luma(0), luma(55))`.
 *
 * Every per-tier setting is one of these, and the panel edits one tier at a
 * time, so it has to take the tuple apart and put it back without disturbing
 * the tiers it is not showing.
 */
export function readTuple(src: string | undefined): string[] | null {
  if (!src) return null;
  const t = src.trim();
  if (!t.startsWith("(") || !t.endsWith(")")) return null;
  const inner = t.slice(1, -1).trim();
  if (!inner) return [];
  return splitArgs(inner, 0, inner.length).map((g) => inner.slice(g.from, g.to).trim());
}

/** The inverse. A one-element tuple keeps its trailing comma, as Typst wants. */
export function typstTuple(items: string[]): string {
  if (items.length === 1) return `(${items[0]},)`;
  return `(${items.join(", ")})`;
}

/**
 * Replace one tier's entry in a per-tier tuple, growing it if need be.
 *
 * `fill` is what the tiers in between get when the writer configures tier 3 of
 * a tuple that only mentions two — the engine's own default for that tier, so
 * writing tier 3 never silently restyles tier 2.
 */
export function withTier(src: string | undefined, tier: number, value: string, fill: string[]): string {
  const items = readTuple(src) ?? [];
  while (items.length < tier) items.push(fill[items.length] ?? fill[fill.length - 1] ?? value);
  items[tier - 1] = value;
  return typstTuple(items);
}

/**
 * Drop one entry from a per-tier tuple.
 *
 * The other half of `withTier`, and it did not exist: the fixed-region panel
 * could grow the tuple and never shrink it, so a writer who turned on a fourth
 * region could not turn it back off without editing Typst by hand. Returns
 * `null` when nothing is left, which is the caller's cue to remove the argument
 * entirely rather than write `()` — an empty tuple is not the same as no fixed
 * heights, and only one of the two means "each region takes what it needs".
 */
export function withoutTier(src: string | undefined, tier: number): string | null {
  const items = readTuple(src) ?? [];
  if (tier < 1 || tier > items.length) return items.length ? typstTuple(items) : null;
  items.splice(tier - 1, 1);
  return items.length ? typstTuple(items) : null;
}

/**
 * Read a Typst dictionary — `("מקורות": 1.5cm, "ביאור": 2cm)`.
 *
 * The streams are keyed by name rather than by position, because a stream *is* a
 * name: `#הערה_זרם("מקורות")` says which one it belongs to. So every per-stream
 * setting is a dictionary where the per-tier ones are tuples, and the panel has
 * to take one apart the same way — one stream at a time, leaving the rest, and
 * the keys it does not recognise, exactly as written.
 *
 * Entries in order, because a dictionary's order is the order the streams print
 * in when `זרמים` does not say otherwise.
 */
export function readDict(src: string | undefined): [string, string][] | null {
  if (!src) return null;
  const t = src.trim();
  if (!t.startsWith("(") || !t.endsWith(")")) return null;
  const inner = t.slice(1, -1).trim();
  // `(:)` is Typst's empty dictionary — distinct from `()`, the empty array.
  if (inner === ":" || inner === "") return [];
  const out: [string, string][] = [];
  for (const g of splitArgs(inner, 0, inner.length)) {
    const colon = topLevelColon(inner, g.from, g.to);
    if (colon < 0) return null;
    const key = readString(inner.slice(g.from, colon).trim());
    if (key === null) return null;
    out.push([key, inner.slice(colon + 1, g.to).trim()]);
  }
  return out;
}

/** The inverse. An empty dictionary is `(:)`, which `()` would not be. */
export function typstDict(entries: [string, string][]): string {
  if (!entries.length) return "(:)";
  return `(${entries.map(([k, v]) => `${typstString(k)}: ${v}`).join(", ")})`;
}

/**
 * Set (or, with `value === null`, drop) one key of a dictionary argument.
 *
 * `null` back means the dictionary is now empty and the argument should go
 * rather than be written as `(:)` — the same distinction `withoutTier` draws.
 */
export function withDictKey(
  src: string | undefined,
  key: string,
  value: string | null,
): string | null {
  const entries = (readDict(src) ?? []).filter(([k]) => k !== key);
  if (value !== null) entries.push([key, value]);
  return entries.length ? typstDict(entries) : null;
}

/** Rename one key, keeping its place in the order. */
export function renameDictKey(src: string | undefined, from: string, to: string): string | null {
  const entries = readDict(src) ?? [];
  const renamed = entries.map(([k, v]): [string, string] => (k === from ? [to, v] : [k, v]));
  return renamed.length ? typstDict(renamed) : null;
}

/** Read a length like `1.5em` / `10pt` / `1cm`, returning its number. */
export function readLength(src: string | undefined, unit: string): number | null {
  if (!src) return null;
  const m = new RegExp(`^(-?[\\d.]+)${unit}$`).exec(src.trim());
  return m ? parseFloat(m[1]) : null;
}

/**
 * A region height, as the number and the unit it was written in.
 *
 * `cm` and `%` are two answers to one question and the panel shows them in one
 * control, because they are not interchangeable: a centimetre is a measurement
 * somebody took off a printed page, and a percentage is a proportion that
 * survives the sefer moving from A4 to A5. Both are what the engine reserves
 * the page foot from, so both have to round-trip exactly.
 */
export function readRegionHeight(src: string | undefined): { n: number; unit: "cm" | "%" } | null {
  if (!src) return null;
  const m = /^(-?[\d.]+)\s*(cm|%)$/.exec(src.trim());
  return m ? { n: parseFloat(m[1]), unit: m[2] as "cm" | "%" } : null;
}

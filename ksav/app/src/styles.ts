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
import type { Scan } from "./spans";
import { typstString } from "./typst-escape";

export type StyleCommand =
  | "headings"
  | "lists"
  | "tables"
  | "review"
  | "notes"
  | "bands"
  | "streams"
  // The two apparatuses that had every control an apparatus can have and no
  // section to reach them from. Written down in this file at INSTANCE_COMMANDS
  // as "a fourth configuration with no panel section of its own", and left
  // there: the in-flow tiers a sefer stacks under its text, and the notes that
  // run down a side column. Typing the command was the whole interface.
  | "tiers"
  | "sidenotes"
  /**
   * The look every note apparatus falls back to.
   *
   * Not an apparatus: `#הגדרות_טקסט_הערות` styles no element of its own, it is
   * what the other six consult for a knob they were not given. So it has a
   * section and a command like the rest, and no per-instance layer at all —
   * "this one shared default" names nothing.
   */
  | "noteText"
  /**
   * The endnote section's own look.
   *
   * It had no section here and, until the shared layer, no ink knobs in the
   * engine either — `#הגדרות_הערות_סיום` carried a numbering scheme and
   * nothing else. Half of *"either should be easy to change on its own"* was
   * therefore not a UI gap but a missing feature.
   */
  | "endnotes"
  | "marks";

/**
 * A section that has one `#הגדרות_*` command behind it.
 *
 * Every kind but `marks`. A mark class is styled through a door named for it —
 * `#הגדרות_סימן`, `#הגדרות_פסוק` — so the Marks section has one command per
 * class rather than one command with the class keyed inside it, and asking for
 * "the marks command" is a question with no answer.
 */
export type SectionCommand = Exclude<StyleCommand, "marks">;

/**
 * One mark class's own door, as a target this panel can read and write.
 *
 * `markDoor("סימן")` is `#הגדרות_סימן`. The prefix keeps a class name from
 * colliding with a section kind, and makes a target that is not one of the two
 * a type error rather than a lookup that returns undefined.
 */
export type MarkDoor = `door:${string}`;

/** What the panel reads and writes against: a section's command, or a door. */
export type StyleTarget = SectionCommand | MarkDoor;

/** One mark class's door. */
export function markDoor(cls: string): MarkDoor {
  return `door:${cls}`;
}

/** The class behind a door, or `null` for a section command. */
export function doorClass(target: StyleTarget): string | null {
  return target.startsWith("door:") ? target.slice("door:".length) : null;
}

/**
 * The `#הגדרות_*` command each section reads and writes, by its Hebrew name.
 *
 * Hebrew only, and the English spelling comes from the generated pairing rather
 * than from a second column here. Eight commands with both names written side by
 * side is a copy of the registry, which is what `test/enginefacts.test.mjs`
 * refuses in any module — and it refused this one the moment the eighth section
 * was added, which is the fence doing precisely its job.
 */
const COMMAND_NAMES: Record<SectionCommand, string> = {
  headings: "הגדרות_כותרות",
  lists: "הגדרות_רשימות",
  tables: "הגדרות_טבלאות",
  // Not styling, but the same shape — one `#הגדרות_*` call whose named arguments
  // the UI reads and writes — so it uses the same machinery rather than a second
  // copy of it. This one carries which review view the document is read in.
  review: "הגדרות_סקירה",
  // The tiered notes. Every knob the apparatus has — per-tier size, slant,
  // colour, indent, numbering scheme, label prefix, the gap between entries —
  // has always been configurable and none of it was reachable except by typing
  // the command. And the shipped ramp was 0.9em → 0.88em → 0.86em, so a writer
  // who *did* find it was tuning something they could not see.
  notes: "הגדרות_הערות",
  // The fixed page-foot regions. Its `גבהים` tuple is the one setting in the
  // product that changes **page geometry** — the engine reserves the foot of
  // every page from it — and the only instruction for changing it was the note
  // on the chooser card: *"the heights live in the #הגדרות_מדפים line at the top
  // of the file — change them there."* Telling a writer to go and edit Typst is
  // not a control.
  bands: "הגדרות_מדפים",
  // The other page-foot apparatus, and the one that had no UI at all.
  //
  // `#הערה_זרם("שם")` gives any number of independent peer streams — a peirush,
  // a mareh mekomos, a nuschaos band — and `גבהים` pins each to a region of its
  // own height, in the same page foot the bands reserve. Every one of its knobs
  // (the order, the per-stream numbering, the titles, stacked versus side by
  // side, the heights) was reachable only by typing the command, which is the
  // same complaint that produced `bands` one entry up.
  streams: "הגדרות_זרמים",
  // The section apparatus, which is the one a sefer with a peirush under the
  // text actually uses. Its knobs are per tier, exactly as the page bands' are.
  tiers: "הגדרות_מדורגות",
  // The side column. Its ratio and gutter are page geometry rather than ink —
  // the same shape as the bands' heights, and offered on the same terms.
  sidenotes: "הגדרות_הערות_צד",
  // The layer under all six. See the note on the `noteText` kind: a sefer with
  // footnotes at the page foot and endnotes at the back had two apparatuses
  // shipping their own size, slant, colour and gap, so *"make the notes a
  // little smaller"* was six edits — and the two most seforim have looked
  // different from each other for no reason anybody chose.
  noteText: "הגדרות_טקסט_הערות",
  endnotes: "הגדרות_הערות_סיום",
};

/**
 * The apparatuses that read the shared note style — the prelude's `_nt_under`
 * call sites, as section kinds.
 *
 * Written down once because two surfaces need it: the panel marks each of these
 * sections when it is overruling the shared layer, and `styles.test.mjs` holds
 * the list against the prelude. The sweep the report asks for is exactly this
 * set being six rather than the two that were reported.
 */
export const NOTE_KINDS: readonly SectionCommand[] = [
  "notes",
  "endnotes",
  "bands",
  "streams",
  "tiers",
  "sidenotes",
];

/**
 * The mark classes a control may style, in the order the panel offers them.
 *
 * `marks.ts` owns the list, because *what a mark class is* is one question and
 * the module that walks the document for them is the one that has to answer it.
 * Re-exported under the name the panel uses.
 */
export { STYLED_CLASSES as MARK_CLASSES } from "./marks";
import { NO_INSTANCE, STYLED_CLASSES } from "./marks";

/** The canonical (Hebrew) name we write. */
function canonical(target: StyleTarget): string {
  const cls = doorClass(target);
  return cls === null ? COMMAND_NAMES[target as SectionCommand] : `הגדרות_${cls}`;
}

/** Both spellings of this section's command — Hebrew first, then the alias. */
function spellings(target: StyleTarget): readonly string[] {
  return bothSpellings(canonical(target));
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
  התחלה: "start",
  מרווח: "inset",
  סמן: "marker",
  פסים: "striped",
  צבע: "colour",
  צבע_כותרת: "header_fill",
  קו: "rule",
  קו_תחתון: "underline",
  קו_חוצה: "strike",
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
  // Eight of these were missing while the panel was already writing them, so an
  // English document that had a heading weight or a table's stripe colour set
  // from a control came out with a Hebrew argument name on an English command.
  // Still legal Typst, still not what the writer typed. `test/styles.test.mjs`
  // now reads `_en_params` out of the prelude and fails on any key this panel
  // writes without a spelling here, which is what would have caught them.
  משקל: "weight",
  // Whether this note may be moved to avoid a neighbour — see `_sn_assign`.
  הזזה: "shift",
  // Not looks, but the panel writes them onto a note like everything else here,
  // so they need the engine’s own English spelling for a document written in
  // English commands. See `_en_args` in the prelude.
  ציטוט: "quote",
  צף: "floats",
  גופן: "font",
  ריווח_לפני: "space_before",
  ריווח_אחרי: "space_after",
  מרווח_אותיות: "tracking",
  הזחה_מרבית: "max_indent",
  הזחת_גוף: "body_indent",
  ריווח_מספור: "number_spacing",
  צבע_פס: "stripe",
  סוגריים: "brackets",
  פטור: "exempt",
  ברשימה: "listed",
  // The block knobs, which the classes that draw a block answer to.
  גוון: "tint",
  מסגרת: "frame",
  רדיוס: "radius",
  רוחב: "width",
  עובי: "thickness",
  מיון: "sort",
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

/**
 * What this panel would call an argument in an English document.
 *
 * Exported for the fence that compares the whole of `EN_ARGS` against the
 * prelude's `_en_params`, which is the authority. Eight knobs the panel already
 * wrote were missing from that table, and nothing compared the two.
 */
export function englishArg(key: string): string | undefined {
  return EN_ARGS[key];
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
export function findStyleCall(doc: string, target: StyleTarget): StyleCall | null {
  for (const name of spellings(target)) {
    const node = scan(doc).nodes.find((n) => n.hash && n.name === name && n.args);
    if (!node) continue; // absent, or unbalanced — leave it alone
    const raw = splitStyleArgs(doc.slice(node.args!.from, node.args!.to));
    const args = new Map([...raw].map(([k, v]) => [canonicalKey(k), v]));
    return { from: node.from, to: node.args!.to + 1, args, lang: name === canonical(target) ? "he" : "en" };
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
  target: StyleTarget,
  changes: Record<string, string | null>,
  lang: CommandLang = "he",
): string {
  const existing = findStyleCall(doc, target);
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
  const name = out === "en" ? (spellings(target)[1] ?? canonical(target)) : canonical(target);
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
 * `bands` is the **page** bands and not the section ones, and the section ones
 * are `tiers` — which for a while was "a fourth configuration with no panel
 * section of its own", written in this comment and left there. Writing
 * `#מדור_א`'s override against the page-band global would compare a setting to
 * the wrong default, which is why they are two kinds and not one.
 */
/**
 * The kinds that have an element to point at.
 *
 * Two do not, and for the same reason in both cases: `noteText` is a default
 * six apparatuses fall back to, and `endnotes` is a whole section at the back.
 * Neither has a *this one* — see the note on each in `StyleCommand`.
 */
export type InstanceCommand = Exclude<StyleCommand, "noteText" | "endnotes">;

const INSTANCE_COMMANDS: Record<InstanceCommand, readonly string[]> = {
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
  tiers: ["מדור_בדרגה", "מדור_א", "מדור_ב", "מדור_ג", "מדור_ד", "מדור_ה"],
  sidenotes: ["הערת_גיליון", "הערת_ימין", "הערת_שמאל"],
  // Every styled class except the ones whose command takes no arguments —
  // see `marks.NO_INSTANCE`. A panel that offered to overrule `#קו_מפריד`
  // where it stands would write a call the command cannot accept.
  marks: STYLED_CLASSES.filter((c) => !NO_INSTANCE.includes(c)),
};

/** The Hebrew names, for a caller checking them against the prelude. */
export function instanceCommands(kind: StyleCommand): readonly string[] {
  return INSTANCE_COMMANDS[kind as InstanceCommand] ?? [];
}

const INSTANCE_NAMES: Record<InstanceCommand, Set<string>> = Object.fromEntries(
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
  /**
   * A typographic family, by name.
   *
   * Offered as the fonts this installation actually has, and still typable: a
   * sefer is often written on one machine and printed on another, and a family
   * this machine does not have is a legitimate thing to name.
   */
  | "font"
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
  /**
   * A numbering scheme **per depth** — digits at the top, letters underneath.
   *
   * A separate kind from `numbering` because Typst reads an enum's pattern one
   * symbol per level (`"1.א.i."`) and a heading's as one scheme for the whole
   * tree. One five-option picker served both, so the level-two answer a writer
   * wanted could be picked and never written.
   */
  | "numbering-levels"
  /** A whole number a list starts counting from — 1, or the 0 people want. */
  | "count"
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
export const INSTANCE_FIELDS: Record<
  InstanceCommand,
  Readonly<Record<string, Field>>
> = {
  headings: {
    גופן: { kind: "font", label: "knobFont" },
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
    הזחה: { kind: "length-em", label: "knobIndent" },
    הזחה_מרבית: { kind: "length-em", label: "knobMaxIndent" },
  },
  lists: {
    סמן: { kind: "marker", label: "knobMarker" },
    הזחה: { kind: "length-em", label: "knobIndent" },
    הזחת_גוף: { kind: "length-em", label: "knobBodyIndent" },
    ריווח: { kind: "length-em", label: "knobSpacing" },
    הידוק: { kind: "bool", label: "knobTight" },
    מספור: { kind: "numbering-levels", label: "knobNumbering" },
    ריווח_מספור: { kind: "length-em", label: "knobNumberGap" },
    התחלה: { kind: "count", label: "knobStart" },
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
    משקל: { kind: "weight", label: "knobWeight" },
    // Not looks. `ציטוט` is the words this note is **on** — the dibbur hamaschil
    // an entry head prints — and `צף` is the note saying *"if something has to
    // move, move me"* when its region has to give something up. They travel in
    // the same per-note dictionary as the looks because that dictionary is
    // already carried to the walk that decides, and the panel offers them for
    // the same reason: they are set on one note and on nothing else.
    ציטוט: { kind: "text", label: "knobQuote" },
    צף: { kind: "bool", label: "knobFloat" },
  },
  streams: {
    גודל: { kind: "size-em", label: "knobSize" },
    סגנון: { kind: "slant", label: "knobSlant" },
    צבע: { kind: "colour", label: "knobColour" },
    משקל: { kind: "weight", label: "knobWeight" },
    // Not looks. `ציטוט` is the words this note is **on** — the dibbur hamaschil
    // an entry head prints — and `צף` is the note saying *"if something has to
    // move, move me"* when its region has to give something up. They travel in
    // the same per-note dictionary as the looks because that dictionary is
    // already carried to the walk that decides, and the panel offers them for
    // the same reason: they are set on one note and on nothing else.
    ציטוט: { kind: "text", label: "knobQuote" },
    צף: { kind: "bool", label: "knobFloat" },
  },
  // The same three the bands take, because they are the same apparatus with a
  // different scope — `_ap_own_keys` is one list in the prelude and the fence in
  // `enginefacts.test.mjs` holds all three kinds to it.
  tiers: {
    גודל: { kind: "size-em", label: "knobSize" },
    סגנון: { kind: "slant", label: "knobSlant" },
    צבע: { kind: "colour", label: "knobColour" },
    משקל: { kind: "weight", label: "knobWeight" },
    // Not looks. `ציטוט` is the words this note is **on** — the dibbur hamaschil
    // an entry head prints — and `צף` is the note saying *"if something has to
    // move, move me"* when its region has to give something up. They travel in
    // the same per-note dictionary as the looks because that dictionary is
    // already carried to the walk that decides, and the panel offers them for
    // the same reason: they are set on one note and on nothing else.
    ציטוט: { kind: "text", label: "knobQuote" },
    צף: { kind: "bool", label: "knobFloat" },
  },
  sidenotes: {
    גודל: { kind: "size-em", label: "knobSize" },
    סגנון: { kind: "slant", label: "knobSlant" },
    משקל: { kind: "weight", label: "knobWeight" },
    צבע: { kind: "colour", label: "knobColour" },
    // Not a look: this note’s answer to *may you be moved to avoid a neighbour*.
    // A gloss keyed to one word wants to stay beside that word, and a note that
    // has drifted four lines down is pointing at the wrong one.
    הזזה: { kind: "bool", label: "knobShift" },
  },
  // The two at the end are not a look at all, and they are two wants and not one:
  // `פטור` says *this mark is not in its class's styling*, `ברשימה` says *this
  // mark is not in its class's list*. A writer who wants a lemma set differently
  // and a writer who wants one kept out of the index are not the same writer.
  marks: {
    גודל: { kind: "size-em", label: "knobSize" },
    // The block knobs, which only the classes that draw a block answer to —
    // a fill on a gemara reference is a control with nothing behind it, and
    // `_mk_knobs_of` in the prelude is what makes that per class.
    גוון: { kind: "colour", label: "knobTint" },
    קו: { kind: "colour", label: "knobAccent" },
    מסגרת: { kind: "rule", label: "knobBorder" },
    מרווח: { kind: "length-pt", label: "knobPadding" },
    רדיוס: { kind: "length-pt", label: "knobRadius" },
    רוחב: { kind: "text", label: "knobWidth" },
    יישור: { kind: "align", label: "knobAlign" },
    סגנון: { kind: "slant", label: "knobSlant" },
    משקל: { kind: "weight", label: "knobWeight" },
    צבע: { kind: "colour", label: "knobColour" },
    קו_תחתון: { kind: "bool", label: "knobUnderline" },
    קו_חוצה: { kind: "bool", label: "knobStrike" },
    סוגריים: { kind: "bool", label: "knobBrackets" },
    פטור: { kind: "bool", label: "knobExempt" },
    ברשימה: { kind: "bool", label: "knobListed" },
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
  // The two kinds with no element to point at answer `null` here rather than
  // being a lookup that returns undefined and crashes on `.size`.
  const names = INSTANCE_NAMES[kind as InstanceCommand];
  if (!names || !names.size) return null;
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

/** Is this target's global set to overrule every per-element setting? */
export function isOverruled(doc: string, target: StyleTarget): boolean {
  return readBool(findStyleCall(doc, target)?.args.get(OVERRULE)) === true;
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

/**
 * The counting symbols Typst understands, one per level of a nested list.
 *
 * `"1.א.i."` is three levels: digits, Hebrew letters, lower roman. Everything
 * between one symbol and the next is that level's suffix.
 */
const COUNT_SYMBOLS = "1aAiIא*";

/**
 * The colour a bare `#סימון[…]` paints — Typst's own default highlight fill.
 *
 * The toolbar's highlighter opens on it, so a writer who never touches the
 * swatch gets exactly the page that `#סימון[…]` written by hand gives, which is
 * what the palette, the Insert menu and every existing document write. It is
 * Typst's value and not ours: `engine/tests/inline_text.rs` asserts that a bare
 * highlight still paints it, and names this constant when it does not.
 */
export const DEFAULT_HIGHLIGHT = "#fffd11";

/**
 * A numbering pattern as the levels it describes.
 *
 * `"1.א.i."` → `["1.", "א.", "i."]`. A prefix before the first symbol goes with
 * the level it introduces, so `"(1)"` is one level and not a stray bracket.
 */
export function readLevels(src: string | undefined): string[] {
  const s = readString(src);
  if (s === null) return [];
  const out: string[] = [];
  let pending = "";
  for (const ch of s) {
    if (COUNT_SYMBOLS.includes(ch)) {
      out.push(pending + ch);
      pending = "";
    } else if (out.length) {
      out[out.length - 1] += ch;
    } else {
      pending += ch;
    }
  }
  return out;
}

// ---------------------------------------------------------------- custom styles
//
// A paragraph style of the writer's own.
//
// The paragraph-style dropdown offered nine heading levels and body text, and
// the margin asked for the tenth entry every word processor has: *other* — make
// a style, name it, apply it. Ksav's answer to "a named look" was already in the
// language and unreachable from the interface: a `#let`.
//
//     #let שאלה(תוכן) = עיצוב(תוכן, גודל: 1.15em, משקל: "bold")
//     #שאלה[מה הדין ב…]
//
// Two decisions are worth stating, because both could have gone the other way.
//
// **It lives in the document**, not in the settings drawer's `#let` preamble.
// A style belongs to the sefer the way `#הגדרות_כותרות` does: it travels with
// the file, it is visible in the source, and a reader who opens the file gets
// the writer's styles rather than their own. The preamble is for a person's own
// commands across every document, which is a different thing wearing the same
// syntax.
//
// **The body is one `#עיצוב` call**, not arbitrary Typst. Arbitrary Typst is
// what a writer could always type and what no control could ever read back — the
// panel can rewrite a `#הגדרות_*` call because it knows its shape. So the
// definition has a shape too, and a style the editor made is a style the editor
// can still edit. A `#let` of any other shape is simply not a *custom style* as
// far as this module is concerned: it is left completely alone, offered nowhere,
// and never rewritten.

/**
 * The knobs a custom style is made of — `#עיצוב`'s own arguments.
 *
 * Deliberately the same set, with the same `Field` kinds and the same labels, as
 * a heading's. There is no second vocabulary in this product for *what a piece
 * of text looks like*, and inventing one here would have been the third.
 */
export const STYLE_FIELDS: Readonly<Record<string, Field>> = {
  גופן: { kind: "font", label: "knobFont" },
  גודל: { kind: "size-em", label: "knobSize" },
  משקל: { kind: "weight", label: "knobWeight" },
  צבע: { kind: "colour", label: "knobColour" },
  סגנון: { kind: "slant", label: "knobSlant" },
  מרווח_אותיות: { kind: "length-pt", label: "knobTracking" },
  קו_תחתון: { kind: "bool", label: "knobUnderline" },
  רברבתי: { kind: "bool", label: "knobSmallcaps" },
  יישור: { kind: "align", label: "knobAlign" },
  ריווח_לפני: { kind: "length-em", label: "knobSpaceBefore" },
  ריווח_אחרי: { kind: "length-em", label: "knobSpaceAfter" },
};

/**
 * The knobs that turn a style into a paragraph style.
 *
 * Alignment and the two spacings are block-level questions in Typst, so
 * `#עיצוב` puts its content in a block when any of them is set — which means a
 * style carrying one of these cannot be applied to two words in the middle of a
 * sentence without breaking the sentence into three paragraphs. That is the
 * italic bug (`#נטוי` was a sheared frame, and a sheared frame is a block)
 * arriving through a different door, and the door here is the style dialog,
 * which offered all ten knobs as one flat list with nothing to say that three of
 * them change what the style can be used on.
 *
 * Stated once, because it is used three times: the dialog groups these under
 * their own heading, `styles.test.mjs` checks the set against `STYLE_FIELDS`,
 * and the engine's `a_custom_styles_knobs_are_inline_except_the_three_that_are_not`
 * measures that these three and only these three really do block.
 */
export const PARAGRAPH_KNOBS: readonly string[] = ["יישור", "ריווח_לפני", "ריווח_אחרי"];

/**
 * The knobs the shared note style carries — `_nt_keys` in the prelude.
 *
 * Exactly the ink: what the text looks like and how far apart the entries sit.
 * Not indent, not numbering, not a label prefix, and not a height — each of
 * those is a property of *one* apparatus's arrangement, and a shared default
 * for "how deep is tier 3 indented" would be a default for a question the side
 * column and the endnote section do not have.
 */
export const SHARED_NOTE_FIELDS: Readonly<Record<string, Field>> = {
  גופן: { kind: "font", label: "knobFont" },
  גודל: { kind: "size-em", label: "knobSize" },
  סגנון: { kind: "slant", label: "knobSlant" },
  צבע: { kind: "colour", label: "knobColour" },
  ריווח: { kind: "length-em", label: "knobSpacing" },
};

/** One `#let NAME(תוכן) = עיצוב(תוכן, …)` in the document. */
export interface CustomStyle {
  /** The name the writer gave it — what `#NAME[…]` applies. */
  name: string;
  /** What the definition calls its content, so a rewrite keeps the writer's word. */
  param: string;
  /** Byte range of the whole definition. */
  from: number;
  to: number;
  /** Knob → its source text, canonicalised to Hebrew like every other call here. */
  args: Map<string, string>;
  lang: CommandLang;
}

// The head of a definition, anchored to the end of what comes before the
// `#עיצוב` call. A Hebrew identifier is in `֐-׿`, which is the whole
// point of the language.
const STYLE_HEAD =
  /(?:^|\n)([ \t]*)#?let[ \t]+([A-Za-z֐-׿_][\w֐-׿]*)[ \t]*\([ \t]*([A-Za-z֐-׿_][\w֐-׿]*)[ \t]*\)[ \t]*=[ \t]*$/;

/**
 * Every custom style the document defines, in the order they are written.
 *
 * Found through `scan`, which sees the call *without* its `#` — inside a `#let`
 * body Typst is in code context, so `עיצוב(…)` is written bare. A regex over
 * `#עיצוב` would have found none of them.
 */
// Derived from the scan and cached on it, the way `headings.ts` caches on the
// same object. The scan is already the per-version memo; anything computed from
// it should hang off that rather than be rebuilt. `updateContextBar` calls this
// on every arrow key to fill the paragraph-style `<select>`, so without the map
// a caret move re-walked every node — and re-copied the whole document prefix
// per style, below — for a result that almost never changes.
const STYLES_CACHED = new WeakMap<Scan, CustomStyle[]>();

export function findCustomStyles(doc: string): CustomStyle[] {
  const s = scan(doc);
  const hit = STYLES_CACHED.get(s);
  if (hit) return hit;
  const names = bothSpellings("עיצוב");
  const out: CustomStyle[] = [];
  for (const n of s.nodes) {
    if (!n.args || !names.includes(n.name)) continue;
    // The definition head sits on the line the call opens on, so look only at
    // that line rather than copying the entire prefix of the document (which,
    // with an unanchored `^|\n` regex, was O(document) per style — O(styles ×
    // document) overall). The window starts at the newline before the call so
    // the `(?:^|\n)` anchor still has its boundary to match.
    const nl = doc.lastIndexOf("\n", n.from - 1);
    const start = nl < 0 ? 0 : nl;
    const head = STYLE_HEAD.exec(doc.slice(start, n.from));
    if (!head) continue;
    const raw = splitStyleArgs(doc.slice(n.args.from, n.args.to));
    out.push({
      name: head[2],
      param: head[3],
      // `head.index` is the start of the `\n` for every match but one, so step
      // over it — the definition is the line, not the break before it.
      from: start + head.index + (head[0].startsWith("\n") ? 1 : 0),
      to: n.args.to + 1,
      args: new Map([...raw].map(([k, v]) => [canonicalKey(k), v])),
      lang: n.name === "עיצוב" ? "he" : "en",
    });
  }
  STYLES_CACHED.set(s, out);
  return out;
}

/** One by name, or null. */
export function findCustomStyle(doc: string, name: string): CustomStyle | null {
  return findCustomStyles(doc).find((s) => s.name === name) ?? null;
}

/**
 * The custom style the caret is standing in, innermost first.
 *
 * What the paragraph-style dropdown reads to show where you *are* rather than
 * what was last pressed — the same job `headingAt` does for a heading. The
 * definition itself does not count as being inside the style: standing on the
 * `#let` line is standing in the document, not in styled text.
 */
export function customStyleAt(doc: string, pos: number): CustomStyle | null {
  const styles = findCustomStyles(doc);
  if (!styles.length) return null;
  const byName = new Map(styles.map((s) => [s.name, s]));
  let best: CustomStyle | null = null;
  let bestDepth = -1;
  for (const n of scan(doc).nodes) {
    const style = byName.get(n.name);
    if (!style || !n.hash) continue;
    if (pos < n.from || pos > n.to) continue;
    if (n.depth < bestDepth) continue;
    bestDepth = n.depth;
    best = style;
  }
  return best;
}

function renderCustomStyle(
  name: string,
  param: string,
  args: Map<string, string>,
  lang: CommandLang,
): string {
  const call = lang === "en" ? (bothSpellings("עיצוב")[1] ?? "עיצוב") : "עיצוב";
  const named = [...args].map(([k, v]) => `${keyIn(lang, k)}: ${v}`);
  return `#let ${name}(${param}) = ${call}(${[param, ...named].join(", ")})`;
}

/**
 * Set or clear knobs on a custom style, leaving the ones not mentioned alone.
 *
 * Unlike `setStyleArgs`, an empty argument list is **not** a reason to delete the
 * definition: a style with no knobs left is still a name the document uses, and
 * removing the `#let` would stop the sefer compiling. Deleting a style is a
 * different act with a different door.
 */
export function setCustomStyleArgs(
  doc: string,
  style: CustomStyle,
  changes: Record<string, string | null>,
): string {
  const args = new Map(style.args);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) args.delete(k);
    else args.set(k, v);
  }
  return (
    doc.slice(0, style.from) +
    renderCustomStyle(style.name, style.param, args, style.lang) +
    doc.slice(style.to)
  );
}

/**
 * Add a style definition to the document, at the top.
 *
 * At the top because Typst binds in reading order: a `#let` written under the
 * paragraph that uses it is an unknown-variable error, and the paragraph in hand
 * can be anywhere. Returns the document unchanged if that name is already a
 * style — applying an existing style is what the dropdown does with it, and
 * defining it twice would shadow the writer's own.
 */
export function defineCustomStyle(
  doc: string,
  name: string,
  args: Record<string, string> = {},
  lang: CommandLang = "he",
): string {
  if (findCustomStyle(doc, name)) return doc;
  const param = lang === "en" ? "body" : "תוכן";
  const line = renderCustomStyle(name, param, new Map(Object.entries(args)), lang);
  // Under the styles already there, so a second one does not jump the first.
  const existing = findCustomStyles(doc);
  const at = existing.length ? existing[existing.length - 1].to : 0;
  return at === 0 ? `${line}\n${doc}` : `${doc.slice(0, at)}\n${line}${doc.slice(at)}`;
}

/**
 * Whether a name may be used for a style.
 *
 * A Typst identifier, and not one the registry already has — shadowing `#הערה`
 * with a paragraph style would take the footnote away from the whole document,
 * silently, and the error would surface a hundred lines later.
 */
export function styleNameError(name: string, taken: readonly string[]): string | null {
  const n = name.trim();
  if (!n) return "styleNameEmpty";
  if (!/^[A-Za-z֐-׿_][\w֐-׿]*$/.test(n)) return "styleNameBad";
  if (taken.includes(n)) return "styleNameTaken";
  return null;
}

/** The levels back as a pattern, or null when every level said nothing. */
export function typstLevels(levels: (string | null)[]): string | null {
  const said = levels.filter((l): l is string => !!l);
  return said.length ? typstString(said.join("")) : null;
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
    const raw = inner.slice(g.from, colon).trim();
    // Typst writes a dictionary key either way — `("ציון": …)` and `(ציון: …)`
    // are the same dictionary — and this read only the quoted form, so a
    // hand-typed key made the whole argument unreadable and the panel showed
    // nothing set. The panel keeps writing the quoted form; it just no longer
    // insists the writer did.
    const key = readString(raw) ?? (/^[\p{L}\p{N}_]+$/u.test(raw) ? raw : null);
    if (key === null) return null;
    out.push([key, inner.slice(colon + 1, g.to).trim()]);
  }
  return out;
}

// ------------------------------------------------------- a knob, keyed by class
//
// The mark register's globals are knob-major: `גודל: ("ציון": 0.8em)` — one
// dictionary per knob, keyed by the class it applies to — and a plain value
// instead of a dictionary is the answer for *every* class. That second shape is
// the one a scalar-only reader gets wrong: a document that says `גודל: 0.9em`
// has set every class to 0.9em, and a control showing one class has to say so.

/** What one class shows for a knob whose value may be a dictionary or a scalar. */
export function classValue(src: string | undefined, cls: string): string | undefined {
  if (src === undefined) return undefined;
  const dict = readDict(src);
  if (!dict) return src; // a scalar applies to every class, so it is this one's
  const found = dict.find(([k]) => k === cls);
  return found ? found[1] : undefined;
}

/**
 * Set (or, with `null`, drop) one class's entry in a knob-major argument.
 *
 * `classes` is what the *other* classes keep when a scalar has to become a
 * dictionary: a document that said `גודל: 0.9em` said it for all of them, and
 * setting one class must not quietly restyle the other five back to their
 * shipped sizes. The same reasoning as `withTier`'s `fill`, one shape along.
 */
export function withClassKey(
  src: string | undefined,
  cls: string,
  value: string | null,
  classes: readonly string[],
): string | null {
  const dict = readDict(src);
  const entries: [string, string][] = dict
    ? dict.filter(([k]) => k !== cls)
    : src === undefined
      ? []
      : classes.filter((c) => c !== cls).map((c): [string, string] => [c, src]);
  if (value !== null) entries.push([cls, value]);
  return entries.length ? typstDict(entries) : null;
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
/**
 * A text size, as the number and the unit the writer is thinking in.
 *
 * Two units and not one, because `em` and `pt` answer different questions. `em`
 * is a *proportion* — 115% of whatever this text sits inside — and it is what a
 * style should almost always say, because a style used in a heading and in a
 * footnote has to be right in both. `pt` is a measurement, and a writer setting
 * a title to exactly 24pt means exactly 24pt.
 *
 * The panel spells `em` as a percentage, which is what every word processor
 * calls it and what `1.15em` means. The conversion is exact both ways at the one
 * decimal place the control offers, so a value typed here and read back is the
 * same value.
 */
export function readTextSize(src: string | undefined): { n: number; unit: "%" | "pt" } | null {
  if (!src) return null;
  const m = /^(-?[\d.]+)\s*(em|pt)$/.exec(src.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === "em" ? { n: Math.round(n * 1000) / 10, unit: "%" } : { n, unit: "pt" };
}

/** The source text for a size the panel is showing. The inverse of `readTextSize`. */
export function writeTextSize(n: number, unit: "%" | "pt"): string {
  return unit === "%" ? `${Math.round((n / 100) * 1000) / 1000}em` : `${n}pt`;
}

/**
 * The action id a custom style answers to.
 *
 * A style is an *action*, which is the whole of how it gets a key. `actions()`
 * already turns every saved macro into one and everything downstream — the
 * palette, the keys drawer, the chord printed beside a menu row, the vim and
 * Emacs command names — follows from being in that list. A second, parallel
 * "style bindings" table would have been a second answer to a question this
 * application already answers once.
 *
 * Prefixed, and the prefix is not decoration: a style may be named anything a
 * Typst identifier may be named, including `bold`, and an unprefixed id would
 * have quietly taken over an action that already exists.
 */
export function styleActionId(name: string): string {
  return `style.${name}`;
}

/** The style behind an action id, or `null` if it is not one. */
export function styleOfAction(id: string): string | null {
  return id.startsWith("style.") ? id.slice("style.".length) : null;
}

export function readRegionHeight(src: string | undefined): { n: number; unit: "cm" | "%" } | null {
  if (!src) return null;
  const m = /^(-?[\d.]+)\s*(cm|%)$/.exec(src.trim());
  return m ? { n: parseFloat(m[1]), unit: m[2] as "cm" | "%" } : null;
}

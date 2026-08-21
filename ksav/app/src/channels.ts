// Channels, from the editor's side.
//
// Eighteen commands wrote a note before this, and the decision record's
// diagnosis of them is why this file exists: *"they are not eighteen ideas. They
// are a cross product — three arrangements by three tiers, plus the any-tier
// escape hatches — exposed as cells rather than as axes."*
//
// The engine has the axes now. A **channel** is a note stream: it owns its
// numbering, only notes in the same channel number together, and two
// declarations describe one —
//
//   · a **source**: the body text, or another channel (a note on a note);
//   · a **placement**: the foot of the page, the end of the section, the end of
//     the document — optionally into a named **region**, which is a fixed area
//     with a size of its own that any number of channels can be pointed into.
//
// This module reads those declarations out of the source and writes them back.
// It is the editor's half of one authority, not a second one: every name and
// value here is the prelude's, and `enginefacts.test.mjs` holds the tables
// against `ksav.typ` in both directions.
//
// What the surfaces get from it: a channel list that is the *document's* rather
// than a fixed menu of arrangements, and — the payoff the whole model exists for
// — an edit that moves an apparatus from the foot of the page to the back of the
// sefer without touching one note.

import { COMMAND_EN, bothSpellings } from "./engine.gen";
import { scan, splitArgs } from "./spans";
import type { Group, Node } from "./spans";

/** The command that declares a channel. */
export const CHANNEL_COMMAND = "ערוץ";
/** The command that declares a region. */
export const REGION_COMMAND = "אזור";
/** The command that prints a collected region. */
export const SHOW_REGION_COMMAND = "הצג_אזור";
/** The command that writes a note. */
export const NOTE_COMMAND = "הערה";

/**
 * The channel `#הערה[…]` writes into when nothing says otherwise.
 *
 * `ksav.typ`'s `_ch_default`. Named here because "is this the default channel"
 * is a question three surfaces ask and none of them should answer with a string
 * literal of its own.
 */
export const DEFAULT_CHANNEL = "הערה";

/**
 * The placements, in the order a chooser offers them.
 *
 * The decision record names five. Three of them are the ones a writer chooses;
 * the other two are consequences. *Indented inside its parent's block* is what a
 * channel gets when its source is a channel and both sit at the page foot — it
 * cannot be indented inside a block three hundred pages away — and *a named
 * region* is an argument every placement takes.
 */
export const PLACEMENTS = [
  "רגל",
  "למעלה",
  "חוץ",
  "פנים",
  "ימין",
  "שמאל",
  "צד",
  "סוף_מדור",
  "סוף",
  "קובץ",
] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** How a region lays out the channels pointed into it. */
export const LAYOUTS = ["מוערם", "צד"] as const;

/** The built-in channels: the seven tiers of the native apparatus. */
export const TIER_CHANNELS: readonly string[] = [
  "הערה",
  "הערה_ב",
  "הערה_ג",
  "הערה_ד",
  "הערה_ה",
  "הערה_ו",
  "הערה_ז",
];

/**
 * The argument names this module writes, and their English spellings.
 *
 * A subset of `_en_params` in the prelude, which is the authority; the same
 * arrangement `styles.ts` uses, for the same reason. Opening a panel on an
 * English document must not turn it Hebrew because the writer clicked a control.
 */
const EN_ARGS: Record<string, string> = {
  ערוץ: "channel",
  מקור: "source",
  מיקום: "placement",
  אזור: "region",
  גובה: "height",
  פריסה: "layout",
  כותרת: "title",
};
const HE_ARGS: Record<string, string> = Object.fromEntries(
  Object.entries(EN_ARGS).map(([he, en]) => [en, he]),
);

/**
 * The parameter **values**, which is a third table and not a detail.
 *
 * `#channel("x", placement: "רגל")` is an English command taking an English
 * parameter and a Hebrew value — the exact defect `_en_values` was added to the
 * prelude to end. A placement is compared against a fixed set of names rather
 * than used as data, so it has to be said in both languages.
 */
const EN_VALUES: Record<string, string> = {
  רגל: "foot",
  // A band above the text, which is the page-foot apparatus at the other end of
  // the sheet — same collection, same overflow, different furniture.
  למעלה: "top",
  // Beside the text. "חוץ"/"פנים" are binding-relative and swap on facing pages;
  // "ימין"/"שמאל" name an edge outright. "צד" is the old spelling of "חוץ".
  חוץ: "outside",
  פנים: "inside",
  ימין: "right",
  שמאל: "left",
  // "צד" is below, where it has been since regions had layouts: one word for
  // *beside* — a region whose channels sit side by side, and a note placed
  // beside the text. Both are "side" in English and there is one entry for it.
  סוף_מדור: "section",
  סוף: "document",
  מוערם: "stacked",
  צד: "side",
  // A companion volume: its own sheet and its own page count. The spelling was
  // written here before the engine had the placement, and `caveatsFor` said so
  // in words until it did; the caveat retired itself the moment `PLACEMENTS`
  // grew, which is what that mechanism was for.
  קובץ: "file",
};
const HE_VALUES: Record<string, string> = Object.fromEntries(
  Object.entries(EN_VALUES).map(([he, en]) => [en, he]),
);

/** Exported for the fence that reads `_en_params`/`_en_values` off the prelude. */
export function englishArg(key: string): string | undefined {
  return EN_ARGS[key];
}
export function englishValue(value: string): string | undefined {
  return EN_VALUES[value];
}

/** A name, value or command in the language a document is written in. */
function sayArg(key: string, lang: "he" | "en"): string {
  return lang === "en" ? (EN_ARGS[key] ?? key) : key;
}
function sayValue(value: string, lang: "he" | "en"): string {
  return lang === "en" ? (EN_VALUES[value] ?? value) : value;
}
function sayCommand(name: string, lang: "he" | "en"): string {
  return lang === "en" ? (COMMAND_EN[name] ?? name) : name;
}

/** One `#ערוץ(…)` or `#אזור(…)` declaration, as the document wrote it. */
export interface Declared {
  /** The name its first positional argument gave it. */
  name: string;
  /** The `#`. */
  from: number;
  /** Past the end of the call. */
  to: number;
  /** The command as the document spells it — `ערוץ` or `channel`. */
  command: string;
  /** Named arguments, keyed by their Hebrew reading, values as written. */
  args: Record<string, string>;
}

/** A channel resolved against its region and the built-ins. */
export interface Channel {
  name: string;
  /** The channel this one hangs off, or null for a note on the body text. */
  source: string | null;
  placement: Placement;
  /** The region it is pointed into — its own name when it named none. */
  region: string;
  /** A declared height, as written (`3cm`, `10%`), or null. */
  height: string | null;
  /** Where its declaration is, or null for a channel nobody declared. */
  at: { from: number; to: number } | null;
  /**
   * Which collector it lands in.
   *
   * `native` is Typst's own balanced series — the default channel and the chain
   * hanging off it. `foot` is a fixed region at the page foot; `collected` is
   * printed where `#הצג_אזור` is called. This mirrors `_ch_kind` in the prelude,
   * and `channels.test.mjs` holds the two together.
   */
  kind: "native" | "foot" | "collected";
}

/** Is this name either spelling of `canonical`? */
function isCommand(name: string, canonical: string): boolean {
  return bothSpellings(canonical).includes(name);
}

/** A string literal down to its contents; anything else as written. */
export function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return s;
}

/**
 * The named arguments of one call, keyed by their **Hebrew** reading.
 *
 * A document may be written in either language, and a panel that read only one
 * of them would show an English document as having declared nothing — the defect
 * this repository has now found in a dozen places, each time in a hand-written
 * table that only one language ever walked.
 */
function namedArgs(doc: string, args: Group | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!args) return out;
  for (const g of splitArgs(doc, args.from, args.to)) {
    const raw = doc.slice(g.from, g.to);
    const m = /^\s*([\p{L}\p{N}_]+)\s*:([\s\S]*)$/u.exec(raw);
    if (!m) continue;
    out[HE_ARGS[m[1]] ?? m[1]] = m[2].trim();
  }
  return out;
}

/** The first positional argument of a call, unquoted. */
function firstPositional(doc: string, n: Node): string {
  if (!n.args) return "";
  for (const g of splitArgs(doc, n.args.from, n.args.to)) {
    const raw = doc.slice(g.from, g.to);
    if (/^\s*[\p{L}\p{N}_]+\s*:/u.test(raw)) continue;
    return unquote(raw);
  }
  return "";
}

/** Every `#ערוץ(…)` (or `#אזור(…)`) in the document, in reading order. */
export function declarationsIn(doc: string, which: string): Declared[] {
  const out: Declared[] = [];
  for (const n of scan(doc).nodes) {
    if (!n.hash || !isCommand(n.name, which)) continue;
    const name = firstPositional(doc, n);
    if (!name) continue;
    out.push({ name, from: n.from, to: n.to, command: n.name, args: namedArgs(doc, n.args) });
  }
  return out;
}

/**
 * Every channel the document has: the seven built-in tiers, everything a `#ערוץ`
 * line declared, and everything a note was written into.
 *
 * Undeclared channels are in the list, and that is not tidiness: naming a
 * channel is not an error — it is a page-foot region of its own, which is what
 * `#הערה_זרם("מקורות")` has always been — so a writer who typed one and never
 * declared it still has an apparatus on their page, and a panel that hid it
 * would be hiding that.
 */
export function channelsIn(doc: string): Channel[] {
  const regionArgs = new Map<string, Record<string, string>>();
  for (const r of declarationsIn(doc, REGION_COMMAND)) {
    regionArgs.set(r.name, { ...(regionArgs.get(r.name) ?? {}), ...r.args });
  }

  const order: string[] = [];
  const args = new Map<string, Record<string, string>>();
  const at = new Map<string, { from: number; to: number }>();
  const add = (name: string) => {
    if (!args.has(name)) {
      args.set(name, {});
      order.push(name);
    }
  };
  TIER_CHANNELS.forEach((name, i) => {
    add(name);
    if (i > 0) args.set(name, { מקור: `"${TIER_CHANNELS[i - 1]}"` });
  });
  for (const d of declarationsIn(doc, CHANNEL_COMMAND)) {
    add(d.name);
    args.set(d.name, { ...args.get(d.name), ...d.args });
    at.set(d.name, { from: d.from, to: d.to });
  }
  for (const name of usedChannels(doc)) add(name);

  const source = (name: string): string | null => {
    const raw = args.get(name)?.["מקור"];
    if (!raw || raw === "auto" || raw === "none") return null;
    return unquote(raw);
  };
  const regionName = (name: string): string => {
    const raw = args.get(name)?.["אזור"];
    return raw ? unquote(raw) : name;
  };
  const placement = (name: string): Placement => {
    const raw = args.get(name)?.["מיקום"] ?? regionArgs.get(regionName(name))?.["מיקום"];
    if (!raw) return "רגל";
    const v = unquote(raw);
    const he = HE_VALUES[v] ?? v;
    return (PLACEMENTS as readonly string[]).includes(he) ? (he as Placement) : "רגל";
  };
  const height = (name: string): string | null =>
    args.get(name)?.["גובה"] ?? regionArgs.get(regionName(name))?.["גובה"] ?? null;

  /**
   * Typst has exactly one balanced page-bottom series and the default channel is
   * it, so a channel is native only when its source chain reaches that channel
   * with every link at the page foot and none of them asking for a region. A
   * *second* root channel at the page foot is a fixed region there instead —
   * which is why it costs the reserve the engine takes off the bottom margin,
   * and why the distinction is worth carrying into the editor.
   *
   * Bounded, because `#ערוץ("א", מקור: "ב")` beside `#ערוץ("ב", מקור: "א")` is a
   * document a writer can type and a walk without a bound does not return.
   */
  const isNative = (name: string): boolean => {
    let cur = name;
    for (let guard = 0; guard < 16; guard++) {
      if (placement(cur) !== "רגל") return false;
      const own = args.get(cur) ?? {};
      if (own["אזור"] || own["גובה"]) return false;
      const src = source(cur);
      if (src === null || src === cur) return cur === DEFAULT_CHANNEL;
      cur = src;
    }
    return false;
  };

  return order.map((name) => ({
    name,
    source: source(name),
    placement: placement(name),
    region: regionName(name),
    height: height(name),
    at: at.get(name) ?? null,
    kind: isNative(name) ? "native" : placement(name) === "רגל" ? "foot" : "collected",
  }));
}

/**
 * The channels notes are actually written into, in reading order.
 *
 * Read off `ערוץ:` on any call rather than off `#הערה` alone, because a deferred
 * marker takes the same argument — and a sefer whose notes outweigh its text is
 * exactly the one written that way.
 */
export function usedChannels(doc: string): string[] {
  const out: string[] = [];
  for (const n of scan(doc).nodes) {
    if (!n.hash || !n.args) continue;
    const raw = namedArgs(doc, n.args)["ערוץ"];
    if (!raw) continue;
    const name = unquote(raw);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** One note written into a named channel, and where it sits. */
/**
 * The series a note is numbered in — its channel, under whichever spelling.
 *
 * Notes number **per series**, and every surface that shows a note has to know
 * which one it is in or it is describing the wrong document. The notes drawer
 * did not: it numbered ten notes 1 to 10 in a sefer whose pages numbered them
 * 1, 2 in one band and א, ב in another, so the panel for finding a note by its
 * number printed an ordinal that appears nowhere.
 *
 * Four spellings reach one answer, which is the whole reason this is a function
 * and not a field read: a positional stream name (`#הערה_זרם("ביאור")`), a named
 * channel (`#הערה(ערוץ: "ביאור")`), the two commands that name a stream in their
 * own name (`#הערת_מקור`, `#הערת_תוכן`), and the tier commands, which are the
 * built-in channels written the short way. Anything else is the default.
 */
export function seriesOf(command: string, args: string): string {
  const named = /(?:^|,)\s*(?:ערוץ|channel)\s*:\s*("[^"]*")/u.exec(args);
  if (named) {
    const name = unquote(named[1]);
    if (name) return name;
  }
  // `#הערה_זרם("מקורות")` — the stream is the first positional argument, which
  // is why `channelNotesIn`'s named-argument read cannot see it.
  if (isCommand(command, "הערה_זרם")) {
    const first = /^\s*"([^"]*)"/u.exec(args);
    if (first?.[1]) return first[1];
  }
  for (const [name, stream] of NAMED_STREAM_COMMANDS) {
    if (isCommand(command, name)) return stream;
  }
  const tier = TIER_CHANNELS.find((t) => isCommand(command, t));
  return tier ?? DEFAULT_CHANNEL;
}

/** The two commands whose own name says which stream they write into. */
const NAMED_STREAM_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ["הערת_מקור", "מקורות"],
  ["הערת_תוכן", "תוכן"],
];

export interface ChannelNote {
  channel: string;
  /** The `#`. */
  from: number;
  /** Past the command's name — what a warning underlines. */
  to: number;
  command: string;
}

/**
 * Every note that names a channel, in reading order.
 *
 * Positions, not just names, because the "collected and never rendered" warning
 * has to land on a line. A note in the default channel is not here: it prints
 * itself, and there is nothing that could fail to render it.
 */
export function channelNotesIn(doc: string): ChannelNote[] {
  const out: ChannelNote[] = [];
  for (const n of scan(doc).nodes) {
    if (!n.hash || !n.args) continue;
    const raw = namedArgs(doc, n.args)["ערוץ"];
    if (!raw) continue;
    const channel = unquote(raw);
    if (!channel) continue;
    out.push({ channel, from: n.from, to: n.nameTo, command: n.name });
  }
  return out;
}

/** Every region a `#הצג_אזור(…)` call prints, with the call's position. */
export function regionsShownIn(doc: string): { region: string; from: number }[] {
  return declarationsIn(doc, SHOW_REGION_COMMAND).map((d) => ({ region: d.name, from: d.from }));
}

/** How many notes are written into each channel. */
export function noteCounts(doc: string): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (name: string) => out.set(name, (out.get(name) ?? 0) + 1);
  for (const n of scan(doc).nodes) {
    if (!n.hash) continue;
    const raw = n.args ? namedArgs(doc, n.args)["ערוץ"] : undefined;
    if (raw) {
      bump(unquote(raw));
      continue;
    }
    // The tier commands are the built-in channels written the short way, and
    // `#הערה_א` is the default channel under its deprecated second name.
    const tier = TIER_CHANNELS.find((t) => isCommand(n.name, t));
    if (tier) bump(tier);
    else if (isCommand(n.name, "הערה_א")) bump(DEFAULT_CHANNEL);
  }
  return out;
}

/**
 * Where a region prints, as the document declared it.
 *
 * `רגל` when it said nothing, which is the prelude's own default — and the
 * distinction that decides whether the region needs a dump call at all: a region
 * at the page foot is painted by the page furniture, and one anywhere else
 * prints where `#הצג_אזור` asks for it. Calling for the first kind renders its
 * notes a second time; not calling for the second renders them nowhere.
 */
export function regionPlacement(doc: string, name: string): Placement {
  const raw = regionsIn(doc).find((r) => r.name === name)?.args["מיקום"];
  if (!raw) return "רגל";
  const v = unquote(raw);
  const he = HE_VALUES[v] ?? v;
  return (PLACEMENTS as readonly string[]).includes(he) ? (he as Placement) : "רגל";
}

/** The regions the document declared, in declaration order, once each. */
export function regionsIn(doc: string): Declared[] {
  const seen = new Set<string>();
  const out: Declared[] = [];
  for (const d of declarationsIn(doc, REGION_COMMAND)) {
    if (seen.has(d.name)) continue;
    seen.add(d.name);
    out.push(d);
  }
  return out;
}

export interface ChannelFields {
  source?: string | null;
  placement?: Placement;
  region?: string | null;
  height?: string | null;
}

/**
 * A `#ערוץ(…)` line for these settings, in the document's language.
 *
 * Names and placements go in as strings, which is what the prelude reads and
 * what a writer editing the line by hand recognises; a height is a length and
 * goes in bare.
 */
export function channelLine(name: string, f: ChannelFields, lang: "he" | "en" = "he"): string {
  const parts = [`"${name}"`];
  if (f.source) parts.push(`${sayArg("מקור", lang)}: "${f.source}"`);
  if (f.placement) parts.push(`${sayArg("מיקום", lang)}: "${sayValue(f.placement, lang)}"`);
  if (f.region) parts.push(`${sayArg("אזור", lang)}: "${f.region}"`);
  if (f.height) parts.push(`${sayArg("גובה", lang)}: ${f.height}`);
  return `#${sayCommand(CHANNEL_COMMAND, lang)}(${parts.join(", ")})`;
}

/** An `#אזור(…)` line for these settings, in the document's language. */
export function regionLine(
  name: string,
  f: { placement?: Placement; height?: string | null; layout?: string | null; title?: string | null },
  lang: "he" | "en" = "he",
): string {
  const parts = [`"${name}"`];
  if (f.placement) parts.push(`${sayArg("מיקום", lang)}: "${sayValue(f.placement, lang)}"`);
  if (f.height) parts.push(`${sayArg("גובה", lang)}: ${f.height}`);
  if (f.layout) parts.push(`${sayArg("פריסה", lang)}: "${sayValue(f.layout, lang)}"`);
  if (f.title) parts.push(`${sayArg("כותרת", lang)}: [${f.title}]`);
  return `#${sayCommand(REGION_COMMAND, lang)}(${parts.join(", ")})`;
}

/** A `#הצג_אזור("name")` call, in the document's language. */
export function showRegionLine(name: string, lang: "he" | "en" = "he"): string {
  return `#${sayCommand(SHOW_REGION_COMMAND, lang)}("${name}")`;
}

/** A note written into a channel, in the document's language. */
export function noteLine(channel: string | null, lang: "he" | "en" = "he"): string {
  const cmd = sayCommand(NOTE_COMMAND, lang);
  if (!channel || channel === DEFAULT_CHANNEL) return `#${cmd}[|]`;
  return `#${cmd}(${sayArg("ערוץ", lang)}: "${channel}")[|]`;
}

/**
 * The document with one channel's declaration rewritten, or the line added.
 *
 * Added at the **top** of the file when it is new — where a reader looks for a
 * document's apparatus, and where every `#הגדרות_*` line has to go because those
 * are read at the position they are written. The channel table is read with
 * `.final()`, so for *this* line the position is a courtesy rather than a
 * requirement, which is exactly the property the eighteen commands could not
 * offer.
 *
 * A field left `undefined` keeps whatever the document already said; a field set
 * to `null` clears it. Those are two different edits and conflating them is how
 * a panel that writes one knob wipes the three beside it.
 */
export function writeChannel(
  doc: string,
  name: string,
  f: ChannelFields,
  lang: "he" | "en" = "he",
): { text: string; at: number } {
  const existing = declarationsIn(doc, CHANNEL_COMMAND).find((d) => d.name === name);
  const keep = (key: string): string | null => {
    const raw = existing?.args[key];
    if (!raw) return null;
    const v = unquote(raw);
    return v === "auto" || v === "none" ? null : v;
  };
  const placement = f.placement !== undefined ? f.placement : keep("מיקום");
  const line = channelLine(
    name,
    {
      source: f.source !== undefined ? f.source : keep("מקור"),
      placement: placement ? ((HE_VALUES[placement] ?? placement) as Placement) : undefined,
      region: f.region !== undefined ? f.region : keep("אזור"),
      height: f.height !== undefined ? f.height : (existing?.args["גובה"] ?? null),
    },
    lang,
  );
  if (existing) {
    return {
      text: doc.slice(0, existing.from) + line + doc.slice(existing.to),
      at: existing.from + line.length,
    };
  }
  return { text: line + "\n" + doc, at: line.length };
}

// ============================================================================
//  Destinations — the one pick a writer makes when they write a note
// ============================================================================
//
// The eleven-cell `where` x `how` grid in `notes.ts` is gone, and this is what
// replaced it. A writer picks **where the note prints**, and nothing else: the
// destination *is* the stream, so there is no stream to declare first, no
// arrangement to choose beside it, and no cell to land in.
//
// Five of the six are singular — there is one page foot, one back of the sefer,
// one side column, one companion volume, and one end for the section the caret
// is in. The sixth is a **named list**: regions are made and named by the writer
// in the page-layout surface, and "a region" expands to "which region". That is
// what recovers the case a flat five would foreclose — two separately-numbered
// apparatuses in the same place are two named regions placed there.
//
// Two facts about this table that are easy to miss and load-bearing:
//
//   - **A destination's channel name and its placement are the same word.** The
//     destination is the stream, so the stream is named for its place: a note
//     sent to the back is `#הערה(ערוץ: "סוף")`, and `סוף` is also the value
//     `#ערוץ(מיקום:)` takes. One word, one meaning, written once.
//   - **The id is the English spelling.** `foot`, `end`, `section`, `side` and
//     `file` are the names the prelude's `_en_values` reads, so an English
//     document writes `#fnote(channel: "end")` without a second table saying so.
//
// Settings — numbering, size, columns, title — live on the destination, written
// as `#ערוץ("סוף", מספור: "א", …)`. The writer never meets the word "channel";
// the machinery above is what carries it.

/** The six picks, in the order a chooser offers them. */
export type DestinationId = "foot" | "end" | "section" | "side" | "file" | "region";

export interface Destination {
  /** Stable name, and the English spelling of the channel. */
  id: DestinationId;
  /**
   * The channel name written into `ערוץ:`, in Hebrew — `null` for `region`,
   * whose stream is named by the writer and written into `אזור:` instead.
   *
   * This is also the placement the engine has to give the channel, because a
   * destination is a place: see the note above.
   */
  channel: string | null;
  /**
   * A tiny page diagram, one string per row of the page.
   *
   * Kept from the cards this table replaced, deliberately. They are the one
   * thing about the old chooser worth carrying forward — a pick has to show
   * what it builds — and the new screen needs them more, not less.
   */
  sketch: readonly string[];
}

export const DESTINATIONS: readonly Destination[] = [
  {
    id: "foot",
    channel: "רגל",
    sketch: ["▤▤▤▤▤▤", "▤▤▤▤▤▤", "──────", "¹ ▪▪▪▪▪"],
  },
  {
    id: "end",
    channel: "סוף",
    sketch: ["▤▤▤▤▤▤", "▤▤▤▤▤▤", "┄┄┄┄┄┄", "1. ▪▪▪▪", "2. ▪▪▪▪"],
  },
  {
    id: "section",
    channel: "סוף_מדור",
    sketch: ["▤▤▤▤▤▤", "1. ▪▪▪▪", "▤▤▤▤▤▤", "1. ▪▪▪▪"],
  },
  {
    id: "side",
    channel: "צד",
    sketch: ["▪▪ ▤▤▤▤", "   ▤▤▤▤", "▪▪ ▤▤▤▤", "   ▤▤▤▤"],
  },
  {
    id: "file",
    channel: "קובץ",
    sketch: ["▤▤▤▤▤▤", "▤▤▤▤▤▤", "", "▭▭▭▭▭▭", "1. ▪▪▪▪"],
  },
  {
    id: "region",
    channel: null,
    sketch: ["▤▤▤▤▤▤", "──────", "¹ ▪▪▪▪", "──────", "א ▫▫▫▫"],
  },
];

export const DESTINATION_IDS: readonly DestinationId[] = DESTINATIONS.map((d) => d.id);

/** The destination with this id. */
export function destinationOf(id: DestinationId): Destination {
  const d = DESTINATIONS.find((x) => x.id === id);
  if (!d) throw new Error("no such destination: " + id);
  return d;
}

/**
 * The destination a channel name is, under either spelling, or `null`.
 *
 * `null` covers two different documents and both are ordinary: a channel a
 * writer named themselves before this model existed, and the default channel,
 * which prints at the foot without ever saying so. `pickFor` answers for those.
 */
export function destinationForChannel(name: string): DestinationId | null {
  // The id *is* the English spelling, so an English document needs no second
  // table — which is the whole reason the ids were chosen to be those words.
  const byId = DESTINATIONS.find((d) => d.channel !== null && d.id === name);
  if (byId) return byId.id;
  const he = HE_VALUES[name] ?? name;
  return DESTINATIONS.find((d) => d.channel === he)?.id ?? null;
}

/**
 * One answer to "where should this note print".
 *
 * `region` is set exactly when `dest` is `"region"` — an unnamed region is a
 * half-answered question, not a destination, and `caveatsFor` says so rather
 * than letting `#הערה(אזור: "")` into the document.
 */
export interface NotePick {
  dest: DestinationId;
  region: string | null;
}

/** The everyday pick: an ordinary note at the foot of the page. */
export const DEFAULT_PICK: NotePick = { dest: "foot", region: null };

/** Are these the same answer? */
export function samePick(a: NotePick, b: NotePick): boolean {
  return a.dest === b.dest && (a.region ?? null) === (b.region ?? null);
}

/**
 * The argument that sends a note to this destination, in the document's
 * language — `ערוץ: "סוף"`, `אזור: "שער_הציון"` — or `""` for the page foot.
 *
 * **Empty for the foot, and that is the model rather than a shortcut.** The
 * default channel already lives at the live page foot, so a note that says
 * nothing is already there. `רגל` names the foot as a *place*; writing it as a
 * second stream name would take the note out of Typst's one balanced series and
 * into a fixed box at the bottom, which is the opposite of what "bottom, the
 * live page foot" means. `pickFor` reads `ערוץ: "רגל"` back as the foot, so a
 * document written the long way is understood — nothing writes it.
 *
 * The value is the destination's **id** in an English document, because the ids
 * are the English spellings the prelude's `_en_values` reads. One table, not two.
 */
export function destinationArg(pick: NotePick, lang: "he" | "en" = "he"): string {
  if (pick.dest === "region") {
    return sayArg("אזור", lang) + ': "' + (pick.region ?? "") + '"';
  }
  const channel = destinationOf(pick.dest).channel as string;
  if (channel === "רגל") return "";
  return sayArg("ערוץ", lang) + ': "' + (lang === "en" ? pick.dest : channel) + '"';
}

/**
 * The note this pick writes, in the document's language. `|` marks the caret.
 *
 * The whole of the gesture. There is no scaffolding in it and no second command
 * beside it, because the destination is the stream: `#ערוץ` only ever carries
 * *settings*, and a destination whose settings are its defaults needs no line.
 */
export function pickLine(pick: NotePick, lang: "he" | "en" = "he"): string {
  const cmd = sayCommand(NOTE_COMMAND, lang);
  const arg = destinationArg(pick, lang);
  return arg ? "#" + cmd + "(" + arg + ")[|]" : "#" + cmd + "[|]";
}

/**
 * Where a note command prints when nothing on the call says otherwise.
 *
 * Only the commands that are *not* at the page foot are listed: the foot is the
 * default and listing it would be a second copy of `DEFAULT_PICK`. The tier and
 * band families are absent for the same reason — every one of them is a stream
 * at the foot — except `#מדור_*`, which `#הערות_מדורגות` dumps at the end.
 */
const COMMAND_DESTINATIONS: ReadonlyArray<readonly [string, DestinationId]> = [
  ["הערתסיום", "end"],
  ["הערת_גיליון", "side"],
  ["הערת_ימין", "side"],
  ["הערת_שמאל", "side"],
  ...["א", "ב", "ג", "ד", "ה", "ו", "ז"].map(
    (tier) => ["מדור_" + tier, "end"] as readonly [string, DestinationId],
  ),
  ["מדור_בדרגה", "end"],
];

/**
 * The destination a note already written into the document is going to.
 *
 * Read off the note's own arguments first — `ערוץ:` and `אזור:` are the whole
 * of the model at the point of writing a note — and off the command's name only
 * when they say nothing. A document written before this model existed is full of
 * the second kind, and every one of them still prints somewhere: `#הערתסיום` at
 * the back, `#הערת_גיליון` down the side, and everything else at the foot.
 */
export function pickFor(command: string, args: string): NotePick {
  const region = /(?:^|,)\s*(?:אזור|region)\s*:\s*"([^"]*)"/u.exec(args)?.[1];
  if (region) return { dest: "region", region };
  const named = /(?:^|,)\s*(?:ערוץ|channel)\s*:\s*"([^"]*)"/u.exec(args)?.[1];
  if (named) {
    const dest = destinationForChannel(named);
    if (dest) return { dest, region: null };
    // A channel a writer named themselves is a region of its own — which is
    // what the prelude does with it, and what `#הערה_זרם("מקורות")` has always
    // been. Reported as the region it is rather than as a note at the foot,
    // because the two are numbered separately and every surface showing a note
    // has to know which series it is in.
    return { dest: "region", region: named };
  }
  // `#הערה_זרם("מקורות")` names its stream positionally, which is the fourth
  // spelling `seriesOf` exists for and the one a named-argument read cannot see.
  if (isCommand(command, "הערה_זרם")) {
    const first = /^\s*"([^"]*)"/u.exec(args)?.[1];
    if (first) return { dest: "region", region: first };
  }
  for (const [name, dest] of COMMAND_DESTINATIONS) {
    if (isCommand(command, name)) return { dest, region: null };
  }
  return { dest: DEFAULT_PICK.dest, region: DEFAULT_PICK.region };
}

// ---------------------------------------------------------------- refusals
//
// **Impossible combinations say why, they do not merely grey out.** That was the
// one genuinely good half of the grid this replaced, and it is carried forward
// with its shape intact: a *table* of reasons, never a fallthrough chain of
// `if`s. A chain always has an answer, so it can never be incomplete, so nothing
// can notice that two of its answers were false against the shipped engine —
// which is what happened, twice, and what `channels.test.mjs` now holds.
//
// Each reason is an i18n key, and a fence checks that both dictionaries carry
// it: a refusal that renders as `whySecondFootIsABox` is worse than no refusal.

export interface Caveat {
  /** The i18n key of the sentence to show. */
  why: string;
  /** True when the pick cannot be written at all, rather than merely costing. */
  blocks: boolean;
}

/**
 * What is wrong with this pick against this document, in reading order.
 *
 * Empty for the ordinary case, which is most of them. Everything here is a fact
 * about the *document in hand* rather than about a cell in a grid, which is the
 * other half of what went wrong before: "fixed regions at the end of the
 * document" was refused statically and forever, and the refusal was false.
 */
export function caveatsFor(doc: string, pick: NotePick): Caveat[] {
  const out: Caveat[] = [];
  if (pick.dest === "region") {
    if (!pick.region) out.push({ why: "whyRegionNeedsAName", blocks: true });
    else if (!regionsIn(doc).some((r) => r.name === pick.region)) {
      out.push({ why: "whyRegionNotDeclared", blocks: false });
    }
  }
  const channel = pick.dest === "region" ? null : destinationOf(pick.dest).channel;
  // The engine places a channel by its `מיקום`, and `PLACEMENTS` is this side's
  // copy of the set it accepts — fenced against `_ch_places` in both directions
  // by `enginefacts.test.mjs`, so this widens by itself the day the engine grows
  // one. Until then, saying so is the whole job: a note sent to a place the
  // engine cannot yet reach still prints, in a region at the page foot, and a
  // writer who is not told that goes looking at the wrong end of their sefer.
  if (channel && !(PLACEMENTS as readonly string[]).includes(channel)) {
    out.push({ why: "whyNotPlaced." + pick.dest, blocks: false });
  }
  // Typst has exactly one balanced page-bottom series and the default channel is
  // it. A second apparatus at the live foot is therefore a fixed box, not a
  // second balanced series — the plan's own example of a refusal that has to say
  // why rather than grey out.
  if (pick.dest === "foot" && footRivals(doc).length > 0) {
    out.push({ why: "whySecondFootIsABox", blocks: false });
  }
  return out;
}

/** Can this pick be written into this document at all? */
export function blockedFor(doc: string, pick: NotePick): boolean {
  return caveatsFor(doc, pick).some((c) => c.blocks);
}

/**
 * The channels already competing for the live page foot.
 *
 * A channel the editor calls `foot` is one the engine puts in a **fixed region**
 * at the page bottom, because it could not join the one balanced series. So the
 * presence of any of them — with notes actually written into it — is precisely
 * the condition under which a further apparatus at the foot becomes a box.
 */
export function footRivals(doc: string): Channel[] {
  const used = new Set(usedChannels(doc));
  return channelsIn(doc).filter((c) => c.kind === "foot" && used.has(c.name));
}

// ---------------------------------------------------------------- presets
//
// **Derived from the axes, never a separate list.** A preset is a *value* of the
// one axis there is — a destination, and for the ones that need it a region — so
// picking one leaves the writer holding an ordinary pick they can take apart. A
// preset that cannot be dismantled is a cell, and cells are what this replaced.

export interface Preset {
  id: string;
  /** The pick it sets. Nothing else: a preset is a value, not a mechanism. */
  pick: NotePick;
  /** The region it makes first, when its pick names one nothing declared. */
  makes?: { name: string; placement: Placement; height?: string };
}

export const PRESETS: readonly Preset[] = [
  // The two everyday ones, which are bare destinations and nothing else.
  { id: "footnote", pick: { dest: "foot", region: null } },
  { id: "endnote", pick: { dest: "end", region: null } },
  // The Mishna Berura page: the commentary in the live foot, the Shaar HaTziyun
  // in a fixed box under it. Two apparatuses at the foot, which is exactly the
  // case a flat five forecloses and a named region recovers.
  {
    id: "shaarhatziyun",
    pick: { dest: "region", region: "שער_הציון" },
    makes: { name: "שער_הציון", placement: "רגל", height: "15%" },
  },
  // The commentary beside the text, which is what a Gemara page is before any
  // second apparatus is added to it.
  { id: "sidecolumn", pick: { dest: "side", region: null } },
  // Mekoros at the back in a block of their own, beside whatever else is there.
  {
    id: "mekoros",
    pick: { dest: "region", region: "מקורות" },
    makes: { name: "מקורות", placement: "סוף" },
  },
];

/** The preset with this id, or null. */
export function presetOf(id: string): Preset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * The lines a preset writes before its first note, in the document's language.
 *
 * A region has to exist and has to be printed, and forgetting either is the
 * "collected and never rendered" failure this application has performed on its
 * own writers twice. Both lines are idempotent — `scaffold` in `notes.ts` skips
 * whichever the document already carries.
 */
export function presetLines(
  p: Preset,
  lang: "he" | "en" = "he",
): { head: string[]; tail: string[] } {
  if (!p.makes) return { head: [], tail: [] };
  const head = [
    regionLine(p.makes.name, { placement: p.makes.placement, height: p.makes.height }, lang),
  ];
  // A region at the page foot is painted by the page furniture and needs no dump
  // call; one anywhere else prints where it is asked to.
  const tail = p.makes.placement === "רגל" ? [] : [showRegionLine(p.makes.name, lang)];
  return { head, tail };
}

// ---------------------------------------------------------------- settings
//
// **Settings live on the destination**, which is the other half of "the
// destination is the stream": a writer who wants their haaros lettered rather
// than numbered changes one line, not three hundred notes. `#ערוץ` is the line,
// and the writer never sees the word — the panel says *the back of the sefer*
// and writes `#ערוץ("סוף", מספור: "א")`.

/** The knobs a destination carries, keyed by their Hebrew argument name. */
export interface DestinationSettings {
  /** `מספור` — the numbering scheme: `1`, `א`, `(1)`, roman. */
  numbering?: string | null;
  /** `גודל` — the type size of an entry, as written (`0.9em`, `9pt`). */
  size?: string | null;
  /** `טורים` — how many columns the block is set in. */
  columns?: string | null;
  /** `כותרת` — the heading over the block, as content. */
  title?: string | null;
}

/**
 * Every knob this side writes, paired with the prelude's name for it.
 *
 * A list, not four `if`s, because `writeDestination` and the panel that fills it
 * in are the same question asked from two directions and a knob that exists in
 * one of them is a control that does nothing.
 */
export const DESTINATION_KNOBS: ReadonlyArray<{
  key: keyof DestinationSettings;
  /** The prelude's own name for it — a member of `_ch_own`. */
  arg: string;
  /** Its i18n key, so a knob cannot exist without a label. */
  label: string;
  /** What a plausible value looks like, in the empty field. */
  hint: string;
  /** Content (`[…]`) rather than a string literal. */
  content?: boolean;
}> = [
  { key: "numbering", arg: "מספור", label: "destNumbering", hint: "א" },
  { key: "size", arg: "גודל", label: "destSize", hint: "0.9em" },
  { key: "columns", arg: "טורים", label: "destColumns", hint: "2" },
  { key: "title", arg: "כותרת", label: "destTitle", hint: "", content: true },
];

/**
 * The settings a document has given a destination, as it wrote them.
 *
 * Both spellings of the channel name are looked for, because the document may be
 * written in either — the same rule `namedArgs` states about the arguments,
 * applied to the one value that is also a *name*.
 */
export function settingsOf(doc: string, pick: NotePick): DestinationSettings {
  const names = [destinationChannelName(pick), destinationChannelName(pick, "en")];
  if (!names[0]) return {};
  const found = declarationsIn(doc, CHANNEL_COMMAND).find((d) => names.includes(d.name));
  const out: DestinationSettings = {};
  if (!found) return out;
  for (const knob of DESTINATION_KNOBS) {
    const raw = found.args[knob.arg];
    if (raw === undefined) continue;
    out[knob.key] = knob.content ? raw.replace(/^\[|\]$/g, "") : unquote(raw);
  }
  return out;
}

/**
 * The channel a pick's settings hang off.
 *
 * For a region that is the region's own name, because a region is a place and a
 * channel pointed into one takes the region's placement — asking both is asking
 * the same question twice and letting the two answers disagree.
 */
export function destinationChannelName(pick: NotePick, lang: "he" | "en" = "he"): string | null {
  if (pick.dest === "region") return pick.region;
  const channel = destinationOf(pick.dest).channel as string;
  // The foot destination *is* the default channel — see `destinationArg`. Its
  // settings therefore hang off `#ערוץ("הערה", …)`, which is the line the
  // prelude reads for every ordinary note, and not off a second stream nothing
  // writes into.
  //
  // `_ch_default` is a Hebrew literal in the prelude and is not a translated
  // value, so this one name stays Hebrew in an English document too: writing
  // `#channel("fnote", …)` would declare a *new* channel rather than configure
  // the one every ordinary note goes into.
  if (channel === "רגל") return DEFAULT_CHANNEL;
  // Everywhere else the channel is named by its destination, so it is spelt the
  // way the note that goes into it spells it — one literal, not two. An English
  // document that declared `#channel("סוף")` and then wrote
  // `#fnote(channel: "end")` would be naming two different streams, and the
  // notes would land in the one nothing prints.
  return lang === "en" ? pick.dest : channel;
}

/**
 * The document with a destination's settings written or rewritten.
 *
 * A field left `undefined` keeps what the document said; a field set to `null`
 * clears it. Those are two different edits, and conflating them is how a panel
 * that writes one knob wipes the three beside it — the same rule `writeChannel`
 * states, applied to the knobs it does not carry.
 */
export function writeDestination(
  doc: string,
  pick: NotePick,
  s: DestinationSettings,
  lang: "he" | "en" = "he",
): { text: string; at: number } {
  const name = destinationChannelName(pick, lang);
  if (!name) return { text: doc, at: 0 };
  const names = [destinationChannelName(pick), destinationChannelName(pick, "en")];
  const existing = declarationsIn(doc, CHANNEL_COMMAND).find((d) => names.includes(d.name));
  const parts: string[] = ['"' + name + '"'];
  // Everything the declaration already carried that this call is not about,
  // in the prelude's own order, so a rewrite is a rewrite and not a reset.
  for (const [key, raw] of Object.entries(existing?.args ?? {})) {
    if (DESTINATION_KNOBS.some((k) => k.arg === key)) continue;
    parts.push(sayArg(key, lang) + ": " + raw);
  }
  for (const knob of DESTINATION_KNOBS) {
    const asked = s[knob.key];
    const raw =
      asked === undefined
        ? existing?.args[knob.arg]
        : asked === null || asked === ""
          ? undefined
          : knob.content
            ? "[" + asked + "]"
            : '"' + asked + '"';
    if (raw === undefined) continue;
    parts.push(sayArg(knob.arg, lang) + ": " + raw);
  }
  const line = "#" + sayCommand(CHANNEL_COMMAND, lang) + "(" + parts.join(", ") + ")";
  if (existing) {
    return {
      text: doc.slice(0, existing.from) + line + doc.slice(existing.to),
      at: existing.from + line.length,
    };
  }
  return { text: line + "\n" + doc, at: line.length };
}

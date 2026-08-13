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
 * The three placements, in the order a chooser offers them.
 *
 * The decision record names five. Three of them are the ones a writer chooses;
 * the other two are consequences. *Indented inside its parent's block* is what a
 * channel gets when its source is a channel and both sit at the page foot — it
 * cannot be indented inside a block three hundred pages away — and *a named
 * region* is an argument every placement takes.
 */
export const PLACEMENTS = ["רגל", "סוף_מדור", "סוף"] as const;
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
  סוף_מדור: "section",
  סוף: "document",
  מוערם: "stacked",
  צד: "side",
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

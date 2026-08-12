// Help, generated.
//
// A hand-written help page is correct on the day it is typed and wrong by the
// end of the week. That is the same failure this codebase has spent its whole
// history producing in other clothes: something exists, and the surface that
// tells the writer about it does not know. So help is *derived* — from the
// keybindings, the structural registry, the hydras, the saved macros and the
// command registry the engine itself publishes.
//
// The consequence worth stating: there is no way to add an operation and forget
// to document it, because the documentation is a projection of the operation.
// And `help.test.mjs` asserts the projection is total, so an operation that
// somehow escapes every section fails the build rather than quietly going
// undocumented.

import { DEFAULT_KEYS, readable } from "./bindings";
import { allHydras } from "./hydra";
import { actionIdOf, describe as describeMacro, parseAll } from "./macros";
import type { Macro } from "./macros";
import { STRUCTURE_ACTIONS } from "./structure";
import type { Structure } from "./structure";

export interface HelpEntry {
  /** What it does, already in the reader's language. */
  what: string;
  /** How to do it: a key, a hydra letter, a menu path. */
  how: string;
  /** The action id this came from, so coverage can be checked. */
  id?: string;
}

export interface HelpSection {
  /** i18n key for the section title. */
  title: string;
  /** i18n key for a line of context, if the section needs one. */
  lede?: string;
  entries: HelpEntry[];
}

export interface HelpInput {
  /** Translate an i18n key. */
  t: (key: string) => string;
  /** Bindings in force — the shipped table with the writer's changes over it. */
  keys: Record<string, string>;
  /** Whatever is in settings, unparsed. */
  macros?: unknown;
  /** The engine's command registry, if it has been fetched. */
  commands?: { he: string; en: string; category: string; desc_he: string; desc_en: string }[];
  /** Which language the reader is reading in. */
  lang: "he" | "en";
  /** Per-operation hydra key overrides. */
  hydraKeys?: Record<string, string>;
}

/** The name of a structural operation, in the reader's language. */
function labelOf(id: string, t: (k: string) => string): string {
  const a = STRUCTURE_ACTIONS.find((x) => x.id === id);
  return a ? t(a.label) : t("sc." + id);
}

/**
 * The shortcut table.
 *
 * Read from `DEFAULT_KEYS` with the writer's overrides on top, so a rebound key
 * is documented as the key it now is. Help that shows the shipped binding to
 * someone who changed it is worse than no help: it is help that is confidently
 * wrong, which costs the reader the time to disbelieve it.
 */
function shortcuts(input: HelpInput): HelpSection {
  const entries: HelpEntry[] = [];
  for (const id of Object.keys(DEFAULT_KEYS)) {
    const key = input.keys[id];
    if (!key) continue; // unbound by the writer: nothing to document
    entries.push({ id, what: labelOf(id, input.t), how: readable(key) });
  }
  return { title: "helpShortcuts", lede: "helpShortcutsLede", entries };
}

/** One section per structure — what the ribbon offers where. */
function structures(input: HelpInput): HelpSection[] {
  const kinds: Structure[] = [];
  for (const a of STRUCTURE_ACTIONS) if (!kinds.includes(a.structure)) kinds.push(a.structure);
  return kinds.map((kind) => ({
    title: "structure." + kind,
    lede: "helpStructureLede",
    entries: STRUCTURE_ACTIONS.filter((a) => a.structure === kind).map((a) => {
      const key = input.keys[a.id];
      return {
        id: a.id,
        what: input.t(a.label),
        // The key if it has one, otherwise the ribbon glyph — which is what the
        // reader is looking at when they come here asking "what is that button".
        how: key ? readable(key) : a.glyph,
      };
    }),
  }));
}

/** The hydras, letter by letter. */
function hydras(input: HelpInput): HelpSection {
  const entries: HelpEntry[] = [];
  for (const h of allHydras(input.hydraKeys ?? {})) {
    for (const e of h.entries) {
      entries.push({
        id: e.action.id,
        what: `${input.t("structure." + h.structure)} · ${input.t(e.action.label)}`,
        how: e.key,
      });
    }
  }
  return { title: "helpHydras", lede: "helpHydrasLede", entries };
}

/** Whatever this writer has recorded. */
function macroSection(input: HelpInput): HelpSection {
  const all: Macro[] = parseAll(input.macros);
  return {
    title: "macros",
    lede: "macroRecordLede",
    entries: all.map((m) => ({
      id: actionIdOf(m),
      what: m.name,
      how: input.keys[actionIdOf(m)]
        ? readable(input.keys[actionIdOf(m)])
        : describeMacro(m, (id) => labelOf(id, input.t)),
    })),
  };
}

/** The engine's own commands, grouped by category. */
function commandSections(input: HelpInput): HelpSection[] {
  if (!input.commands?.length) return [];
  const cats: string[] = [];
  for (const c of input.commands) if (!cats.includes(c.category)) cats.push(c.category);
  return cats.map((cat) => ({
    title: "cat." + cat,
    entries: input.commands!
      .filter((c) => c.category === cat)
      .map((c) => ({
        what: input.lang === "he" ? c.desc_he : c.desc_en,
        how: "#" + (input.lang === "he" ? c.he : c.en),
      })),
  }));
}

/**
 * Every mark the editor puts in the margin or under the text.
 *
 * One table, and it is the *only* statement of what these mean — `changes.ts`
 * names its three from it, `styles.css` colours them, and this section prints
 * it. A legend that is a second hand-written list is a legend that goes stale
 * the first time a mark is added.
 *
 * The inventory's line was: *the change gutter's red wedge means something
 * exact and is unlabelled*. It is not one wedge. There are three marks in that
 * gutter alone, plus a fold arrow, a squiggle and a highlighted line, and not
 * one of them said anything anywhere.
 */
export const MARKS: { id: string; glyph: string; what: string }[] = [
  { id: "mark.added", glyph: "▍", what: "mark.added" },
  { id: "mark.changed", glyph: "▍", what: "mark.changed" },
  { id: "mark.removed", glyph: "◤", what: "mark.removed" },
  { id: "mark.fold", glyph: "▾", what: "mark.fold" },
  { id: "mark.spell", glyph: "﹏", what: "mark.spell" },
  { id: "mark.error", glyph: "▮", what: "mark.error" },
];

/** The legend, as a help section. */
function marks(input: HelpInput): HelpSection {
  return {
    title: "helpMarks",
    lede: "helpMarksLede",
    entries: MARKS.map((m) => ({ id: m.id, what: input.t(m.what), how: m.glyph })),
  };
}

/** Everything, in the order a reader wants it. */
export function helpSections(input: HelpInput): HelpSection[] {
  return [
    shortcuts(input),
    marks(input),
    ...structures(input),
    hydras(input),
    macroSection(input),
    ...commandSections(input),
  ].filter((s) => s.entries.length > 0);
}

/** Filter by a search string, matching either column. */
export function search(sections: HelpSection[], query: string): HelpSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((s) => ({
      ...s,
      entries: s.entries.filter(
        (e) => e.what.toLowerCase().includes(q) || e.how.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.entries.length > 0);
}

/** Every action id the help mentions — for the coverage test. */
export function documentedIds(sections: HelpSection[]): Set<string> {
  const out = new Set<string>();
  for (const s of sections) for (const e of s.entries) if (e.id) out.add(e.id);
  return out;
}

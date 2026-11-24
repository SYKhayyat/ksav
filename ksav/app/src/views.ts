// Views: what a box shows, and the one registry everything that shows is built from.
//
// `decisions/2026-11-23-frontends-are-views-in-boxes.md` is the design. The
// model is Emacs: a few concepts, each fully general, so that features are
// combinations rather than code. A **view** is a **scope** (which part of which
// document) times a **mode** (how that part is drawn and edited). A box holds
// one view, and a **link** says which other box it follows. **Layers** decide
// what the commands and keys mean in the focused box.
//
// # One registry, and the built-ins go through it
//
// Parts, modes, link modes and layers are all *registered*, and Ksav's own are
// registered here through the same `register*` calls a user's would be
// (`views-builtin.ts`). There is no private table a built-in reaches into and a
// contribution cannot: that is the property that keeps a scripting layer a
// later addition rather than a redesign. Emacs's core is written in Elisp for
// the same reason.
//
// # Why this module is pure
//
// No DOM, no CodeMirror, no settings. A refusal is an i18n key, not a sentence,
// and the note spans a scope is evaluated over arrive as an argument. Whether a
// combination works is decided here, where it can be tested, and the boxes only
// draw the answer.

import type { NoteSpan } from "./notes";

// ------------------------------------------------------------------ the data

/** Which part of a document a scope takes. Open to registration. */
export type Part = "body" | "notes" | "file" | (string & {});

/** The narrowing filters a part may accept. */
export type Filter = "series" | "depth" | "under" | "within";

/**
 * Which part of which document, written as data (Q3, Q4).
 *
 * Every case the design asked for is this one shape: the main text, one
 * series, notes on notes, the sub-notes of the caret's note, one pinned note,
 * one siman, the raw file, and another document altogether.
 */
export interface Scope {
  /** Null or absent: whichever document is focused. A string pins one (Q11). */
  doc?: string | null;
  part: Part;
  /** Notes: which series (`NoteSpan.series`). Absent is all of them. */
  series?: string[];
  /** Notes: 1 is notes on the body, 2 notes on notes. A pair is a range. */
  depth?: number | [number, number];
  /** Notes: everything, the children of the leader's caret note, or one pinned note. */
  under?: "all" | "caret" | (string & {});
  /** Narrowing: inside one section only, by its title. */
  within?: string;
}

/** What a box shows. */
export interface View {
  scope: Scope;
  mode: string;
}

export type LinkMode = "unlinked" | "scroll" | "aligned" | (string & {});

/** Which box this one follows, and how (Q5, Q6). */
export interface Link {
  /** A box id, or null for no leader at all. */
  leader: string | null;
  mode: LinkMode;
}

export const UNLINKED: Link = Object.freeze({ leader: null, mode: "unlinked" });

/**
 * Why a combination cannot work: an i18n key, and its arguments.
 *
 * A sentence rather than a hidden menu entry. A writer who asks for a paged
 * preview of one note is told *a note has no pages of its own*, which teaches
 * them something; a writer who never sees the entry learns that Ksav cannot do
 * a thing it may well do another way.
 */
export interface Refusal {
  key: string;
  args?: string[];
}

// ------------------------------------------------------------------ the registry

export interface PartDef {
  id: string;
  /** i18n key of its name. */
  name: string;
  /** Which `Scope` filters make sense for it. Any other is refused. */
  filters: readonly Filter[];
}

export interface ModeDef {
  id: string;
  name: string;
  /** Whether it edits. Preview and outline do not: a click jumps instead. */
  edits: boolean;
  /** A scope this mode cannot draw, and why. */
  refuses?: (scope: Scope) => Refusal | null;
}

export interface LinkModeDef {
  id: string;
  name: string;
  /** A pairing this link cannot make, and why. */
  refuses?: (follower: View, leader: View) => Refusal | null;
}

/** Where a layer sits. Later levels win (Q8). */
export type Level = "global" | "mode" | "scope" | "box";
export const LEVELS: readonly Level[] = ["global", "mode", "scope", "box"];

/** What a layer is asked about: the focused box. */
export interface LayerContext {
  box: string | null;
  view: View;
}

export interface LayerDef {
  id: string;
  level: Level;
  /** Whether it is in force for this box. Absent: always. */
  when?: (ctx: LayerContext) => boolean;
  /**
   * Command remaps: `from → to` runs `to` when `from` is asked for, and
   * `from → null` hides `from` here. A command absent from every layer is
   * itself.
   */
  commands?: Readonly<Record<string, string | null>>;
  /** Key bindings: `key → command`, and `key → null` unbinds it here. */
  keys?: Readonly<Record<string, string | null>>;
}

interface Registry {
  parts: Map<string, PartDef>;
  modes: Map<string, ModeDef>;
  links: Map<string, LinkModeDef>;
  layers: LayerDef[];
}

const REG: Registry = { parts: new Map(), modes: new Map(), links: new Map(), layers: [] };

function into<T extends { id: string }>(map: Map<string, T>, what: string, def: T): () => void {
  // Refused, not overwritten. Two contributions claiming one id is a conflict
  // the second author has to hear about, and the last one silently winning is
  // how a built-in disappears because a user's file loaded after it.
  if (map.has(def.id)) throw new Error(`views: ${what} "${def.id}" is already registered`);
  map.set(def.id, def);
  return () => {
    if (map.get(def.id) === def) map.delete(def.id);
  };
}

/** Register a part. Returns the way to take it back. */
export function registerPart(def: PartDef): () => void {
  return into(REG.parts, "part", def);
}

/** Register a mode. Returns the way to take it back. */
export function registerMode(def: ModeDef): () => void {
  return into(REG.modes, "mode", def);
}

/** Register a link mode. Returns the way to take it back. */
export function registerLinkMode(def: LinkModeDef): () => void {
  return into(REG.links, "link mode", def);
}

/** Register a layer. Returns the way to take it back. */
export function registerLayer(def: LayerDef): () => void {
  if (REG.layers.some((l) => l.id === def.id)) throw new Error(`views: layer "${def.id}" is already registered`);
  REG.layers.push(def);
  return () => {
    const at = REG.layers.indexOf(def);
    if (at >= 0) REG.layers.splice(at, 1);
  };
}

export const parts = (): readonly PartDef[] => [...REG.parts.values()];
export const modes = (): readonly ModeDef[] => [...REG.modes.values()];
export const linkModes = (): readonly LinkModeDef[] => [...REG.links.values()];
export const layers = (): readonly LayerDef[] => [...REG.layers];
export const partOf = (id: string): PartDef | undefined => REG.parts.get(id);
export const modeOf = (id: string): ModeDef | undefined => REG.modes.get(id);
export const linkModeOf = (id: string): LinkModeDef | undefined => REG.links.get(id);

/** For tests: forget everything, so a test can register from nothing. */
export function _resetRegistry(): void {
  REG.parts.clear();
  REG.modes.clear();
  REG.links.clear();
  REG.layers.length = 0;
}

// ------------------------------------------------------------------ refusals

const FILTERS: readonly Filter[] = ["series", "depth", "under", "within"];

/** Why a scope is malformed, before any mode is asked. */
export function scopeRefusal(scope: Scope): Refusal | null {
  const part = REG.parts.get(scope.part);
  if (!part) return { key: "view.unknownPart", args: [scope.part] };
  for (const f of FILTERS) {
    if (scope[f] !== undefined && !part.filters.includes(f)) {
      return { key: "view.filterNotFor", args: [f, part.id] };
    }
  }
  const d = scope.depth;
  if (d !== undefined) {
    const [lo, hi] = typeof d === "number" ? [d, d] : d;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi < lo) {
      return { key: "view.badDepth" };
    }
  }
  return null;
}

/** Why this view cannot be shown, or null when it can. */
export function viewRefusal(view: View): Refusal | null {
  const bad = scopeRefusal(view.scope);
  if (bad) return bad;
  const mode = REG.modes.get(view.mode);
  if (!mode) return { key: "view.unknownMode", args: [view.mode] };
  return mode.refuses?.(view.scope) ?? null;
}

/**
 * Why `follower` cannot follow `leader` this way, or null when it can.
 *
 * `leaderOf` answers the current link of any box, so a cycle is found by
 * walking from the proposed leader up its own chain. Chains are allowed —
 * notes on notes follow the footnotes, which follow the body — and a cycle is
 * refused at the moment it would be made, because a loop of boxes each
 * scrolling to the one before has no answer to where any of them should be.
 */
export function linkRefusal(
  follower: { id: string; view: View },
  leader: { id: string; view: View } | null,
  mode: LinkMode,
  leaderOf: (box: string) => string | null,
): Refusal | null {
  const def = REG.links.get(mode);
  if (!def) return { key: "view.unknownLink", args: [mode] };
  if (mode === "unlinked") return null;
  if (!leader) return { key: "view.linkNeedsLeader" };
  if (leader.id === follower.id) return { key: "view.linkSelf" };
  const seen = new Set<string>();
  for (let at: string | null = leader.id; at; at = leaderOf(at)) {
    if (at === follower.id) return { key: "view.linkCycle" };
    if (seen.has(at)) break; // a cycle already there is not this link's to report
    seen.add(at);
  }
  return def.refuses?.(follower.view, leader.view) ?? null;
}

// ------------------------------------------------------------------ layers

/** What the focused box's layers make of the commands and keys. */
export interface Resolved {
  /** The layers in force, lowest first. */
  layers: readonly string[];
  /** `command → what runs`, or null where a layer hides it. Absent: itself. */
  commands: ReadonlyMap<string, string | null>;
  /** `key → command`, or null where a layer unbinds it. */
  keys: ReadonlyMap<string, string | null>;
}

/**
 * Resolve the layers for one box: global, then mode, then scope, then box.
 *
 * Within a level, registration order, so a later contribution overrides an
 * earlier one at the same level — which is how a user's layer beats a
 * built-in of its own level without either of them knowing the other exists.
 */
export function resolveLayers(ctx: LayerContext): Resolved {
  const live = LEVELS.flatMap((lvl) => REG.layers.filter((l) => l.level === lvl && (l.when?.(ctx) ?? true)));
  const commands = new Map<string, string | null>();
  const keys = new Map<string, string | null>();
  for (const l of live) {
    for (const [k, v] of Object.entries(l.commands ?? {})) commands.set(k, v);
    for (const [k, v] of Object.entries(l.keys ?? {})) keys.set(k, v);
  }
  return { layers: live.map((l) => l.id), commands, keys };
}

/** What runs when `command` is asked for in this resolution, or null if hidden here. */
export function commandIn(r: Resolved, command: string): string | null {
  // Followed, because a remap may land on a command another layer remaps too.
  // Bounded, because two layers can remap into each other.
  let at: string | null = command;
  for (let i = 0; i < 8 && at !== null && r.commands.has(at); i++) {
    const next: string | null = r.commands.get(at)!;
    if (next === at) break;
    at = next;
  }
  return at;
}

// ------------------------------------------------------------------ scope evaluation

/** What a notes scope needs from outside the scope itself. */
export interface ScopeContext {
  /** The note the leader's caret is in, for `under: "caret"`. */
  caretNote?: NoteSpan | null;
  /** The note a pin names, or null when that note is gone. */
  pinned?: (id: string) => NoteSpan | null;
  /** The range of a section, by title, for `within`. */
  section?: (title: string) => { from: number; to: number } | null;
}

/** Whether `inner` lies inside `outer`'s prose. */
function inside(inner: NoteSpan, outer: NoteSpan): boolean {
  return inner.from >= outer.bodyFrom && inner.to <= outer.bodyTo && inner !== outer;
}

/**
 * The notes a notes scope takes, in document order.
 *
 * `NoteSpan.depth` counts enclosing notes, so a note on the body is 0 there and
 * 1 here: the scope speaks the writer's language, *notes on the body* and
 * *notes on notes*, not the index's.
 *
 * `under` is relative to its anchor: under the caret's footnote, depth 1 is
 * that footnote's own notes. A pinned note is the note itself, and a pin that
 * names a note that is gone is the empty list. It never guesses.
 */
export function notesInScope(spans: readonly NoteSpan[], scope: Scope, ctx: ScopeContext = {}): NoteSpan[] {
  if (scope.part !== "notes") return [];
  const under = scope.under ?? "all";
  if (under !== "all" && under !== "caret") {
    const one = ctx.pinned?.(under) ?? null;
    return one ? [one] : [];
  }
  let anchor: NoteSpan | null = null;
  if (under === "caret") {
    anchor = ctx.caretNote ?? null;
    if (!anchor) return [];
  }
  const base = anchor ? anchor.depth + 1 : 0;
  const [lo, hi] =
    scope.depth === undefined ? [1, Infinity] : typeof scope.depth === "number" ? [scope.depth, scope.depth] : scope.depth;
  const range = scope.within ? (ctx.section?.(scope.within) ?? null) : null;
  if (scope.within && !range) return [];
  return spans.filter((n) => {
    if (anchor && !inside(n, anchor)) return false;
    const d = n.depth - base + 1;
    if (d < lo || d > hi) return false;
    if (scope.series && !scope.series.includes(n.series)) return false;
    if (range && (n.from < range.from || n.to > range.to)) return false;
    return true;
  });
}

// ------------------------------------------------------------------ equality and naming

/** Two scopes ask for the same thing. */
export function sameScope(a: Scope, b: Scope): boolean {
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

function normal(s: Scope): unknown {
  return [s.doc ?? null, s.part, s.series ? [...s.series].sort() : null, s.depth ?? null, s.under ?? "all", s.within ?? null];
}

/**
 * The mode line's scope part, as an i18n key and its arguments.
 *
 * Read in the order a writer would say it: *footnotes, of the caret's note,
 * in siman 3*. The pieces are keys so the line re-localises like everything
 * else on screen.
 */
export function scopeLabel(scope: Scope): Refusal[] {
  const out: Refusal[] = [];
  if (scope.part === "notes") {
    if (scope.series?.length) out.push({ key: "scope.series", args: [scope.series.join(" · ")] });
    else out.push({ key: "scope.notes" });
    const d = scope.depth;
    if (d !== undefined && d !== 1) {
      const lo = typeof d === "number" ? d : d[0];
      out.push({ key: "scope.depth", args: [String(lo)] });
    }
    if (scope.under === "caret") out.push({ key: "scope.underCaret" });
    else if (scope.under && scope.under !== "all") out.push({ key: "scope.pinned" });
  } else {
    out.push({ key: REG.parts.get(scope.part)?.name ?? scope.part });
  }
  if (scope.within) out.push({ key: "scope.within", args: [scope.within] });
  return out;
}

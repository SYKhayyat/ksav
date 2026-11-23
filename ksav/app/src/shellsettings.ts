// The `shell` settings (#233, step 3; `docs/ui-architecture.md` §7).
//
// What the writer can change about the furniture: which of the three shells is
// drawn, whether the tabs variant folds the menu bar into `☰ תפריט`, which tab
// the toolbar variant pins, how buttons are labelled, and whether the contextual
// tabs appear. Every one of them changes the *view* of one action list; none of
// them changes what an action is or which key runs it (§7: "the keyboard map is
// the same under every setting").
//
// # Why a leaf
//
// `settings.ts` reads its stored blob at module scope, and the reader below runs
// inside that read. A module it imported that imported it back would be
// evaluated with `settings.ts` half-built, and a `const` here would be in its
// temporal dead zone when `loadSettings` reached it — the exact failure
// `loadSettings`'s doc comment records ("no preference has ever survived a
// reload"). So this file imports nothing at all, and the boot fence in
// `test/shellsettings.test.mjs` holds it to that.

/** The three shells. `menus` is the floor; `toolbar` adds one row; `tabs` is the ribbon. */
export type ShellVariant = "menus" | "toolbar" | "tabs";

export interface ShellSettings {
  /** Which shell is drawn. */
  variant: ShellVariant;
  /** The tabs variant: `auto` folds the menu bar into `☰ תפריט`, `always` keeps it. */
  menubar: "auto" | "always";
  /** The tab the toolbar variant pins. An unknown id falls back to Home where it is drawn. */
  toolbarTab: string;
  /** A button always has its name; this says whether its glyph sits beside it. */
  labels: "names" | "names+glyphs";
  /** The table and notes tabs that appear while the caret stands in one. */
  contextual: boolean;
  /** The writer's own ribbon (§8). Absent is the default ribbon of §5; reset deletes it. */
  ribbon?: RibbonLayout;
}

// ---------------------------------------------------------------- the writer's ribbon
//
// The data of §8, and only its shape: what each id *means* — which action, which
// default tab — is `ribbonlayout.ts`'s, because knowing it needs the placements and
// this file imports nothing.
//
// There is no field here that names a menu, and there must never be one: the
// menus are not editable (§8), which is why a customisation can never make a
// command unfindable. `test/ribbonlayout.test.mjs` holds the interfaces to that.

/** One button: which action, and whether it is on the face or behind `⋯`. */
export interface RibbonItem {
  action: string;
  face: boolean;
}

export interface RibbonGroup {
  /** A default group's id, or `user:<id>` for one the writer made. */
  id: string;
  /** Set when renamed or made by the writer; a default group's name otherwise follows `lang`. */
  name?: string;
  items: RibbonItem[];
}

export interface RibbonTab {
  /** A built-in tab id, or `user:<id>`. */
  id: string;
  /** The built-in tabs this one is, or merges — where a later version's new commands land. */
  from?: string[];
  name?: string;
  hidden?: boolean;
  groups: RibbonGroup[];
}

export interface RibbonLayout {
  version: 1;
  tabs: RibbonTab[];
  /** Every action id that existed when it was saved: what is *not* here is new. */
  known: string[];
}

const ID = /^(?:[a-z][a-zA-Z]*|user:[A-Za-z0-9-]{1,64})$/;
const NAME_MAX = 80;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const nameOf = (v: unknown): { name?: string } => {
  const n = typeof v === "string" ? v.trim().slice(0, NAME_MAX) : "";
  return n ? { name: n } : {};
};

/** Each element that `one` accepts, first of each id — the rest dropped, never the whole list. */
function each<T extends { id: string }>(v: unknown, one: (r: Record<string, unknown>) => T | null): T[] {
  const out: T[] = [];
  if (!Array.isArray(v)) return out;
  for (const x of v) {
    const r = obj(x);
    const t = r ? one(r) : null;
    if (t && !out.some((o) => o.id === t.id)) out.push(t);
  }
  return out;
}

/**
 * A stored or imported ribbon, made whole — or `undefined` when it is not one.
 *
 * Like `readShell`, a bad part costs that part: a tab with a broken group keeps
 * its other groups, a group with a junk item keeps its other items. Whether an
 * action *exists* is not asked here; that is version migration's question.
 */
export function readRibbon(raw: unknown): RibbonLayout | undefined {
  const r = obj(raw);
  if (!r || r.version !== 1 || !Array.isArray(r.tabs)) return undefined;
  const items = (v: unknown): RibbonItem[] => {
    const out: RibbonItem[] = [];
    if (!Array.isArray(v)) return out;
    for (const x of v) {
      const i = obj(x);
      if (!i || typeof i.action !== "string" || !i.action || i.action.length > 200) continue;
      if (out.some((o) => o.action === i.action)) continue;
      out.push({ action: i.action, face: i.face === true });
    }
    return out;
  };
  const tabs = each<RibbonTab>(r.tabs, (t) => {
    if (typeof t.id !== "string" || !ID.test(t.id)) return null;
    const from = Array.isArray(t.from) ? t.from.filter((f): f is string => typeof f === "string" && /^[a-z]+$/.test(f)) : undefined;
    const groups = each<RibbonGroup>(t.groups, (g) =>
      typeof g.id === "string" && ID.test(g.id) ? { id: g.id, ...nameOf(g.name), items: items(g.items) } : null,
    );
    return { id: t.id, ...(from ? { from } : {}), ...nameOf(t.name), ...(t.hidden === true ? { hidden: true } : {}), groups };
  });
  const known = Array.isArray(r.known) ? [...new Set(r.known.filter((k): k is string => typeof k === "string"))] : [];
  return { version: 1, tabs, known };
}

export const SHELL_VARIANTS: readonly ShellVariant[] = ["menus", "toolbar", "tabs"];

export const SHELL_DEFAULTS: Readonly<ShellSettings> = {
  variant: "tabs",
  menubar: "auto",
  toolbarTab: "home",
  labels: "names+glyphs",
  contextual: true,
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * The stored `shell` value, made whole.
 *
 * Field by field, so one hand-edited or out-of-date field costs that field and
 * not the rest: a blob that says `variant: "tabs"` and `labels: 7` keeps its
 * tabs. Anything that is not an object is the defaults.
 */
export function readShell(raw: unknown): ShellSettings {
  const r = obj(raw) ?? {};
  const ribbon = readRibbon(r.ribbon);
  return {
    variant: pick(r.variant, SHELL_VARIANTS, SHELL_DEFAULTS.variant),
    menubar: pick(r.menubar, ["auto", "always"] as const, SHELL_DEFAULTS.menubar),
    toolbarTab:
      typeof r.toolbarTab === "string" && ID.test(r.toolbarTab) ? r.toolbarTab : SHELL_DEFAULTS.toolbarTab,
    labels: pick(r.labels, ["names", "names+glyphs"] as const, SHELL_DEFAULTS.labels),
    contextual: typeof r.contextual === "boolean" ? r.contextual : SHELL_DEFAULTS.contextual,
    ...(ribbon ? { ribbon } : {}),
  };
}

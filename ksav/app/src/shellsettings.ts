// The `shell` settings (#233; `docs/ui-architecture.md` §7).
//
// There is one shell, the ribbon, and what the writer can change about it is
// small: whether it is collapsed to its tab row (Ctrl+F1), what they added to
// Quick Access beside the fixed save, undo and redo, and their own ribbon (§8).
// None of it changes what an action is or which key runs it.
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

export interface ShellSettings {
  /** The ribbon shows only its tab row; a tab opens over the page and closes after one command. */
  collapsed: boolean;
  /** The actions the writer added to Quick Access, after the fixed save, undo and redo. */
  quick: string[];
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

export const SHELL_DEFAULTS: Readonly<ShellSettings> = {
  collapsed: false,
  quick: [],
};

/** Quick Access holds a row of icons, not a second ribbon. */
const QUICK_MAX = 16;

/**
 * The stored `shell` value, made whole.
 *
 * Field by field, so one hand-edited or out-of-date field costs that field and
 * not the rest. Anything that is not an object is the defaults.
 */
export function readShell(raw: unknown): ShellSettings {
  const r = obj(raw) ?? {};
  const ribbon = readRibbon(r.ribbon);
  const quick = Array.isArray(r.quick)
    ? [...new Set(r.quick.filter((q): q is string => typeof q === "string" && q.length > 0 && q.length <= 200))].slice(0, QUICK_MAX)
    : [];
  return {
    collapsed: r.collapsed === true,
    quick,
    ...(ribbon ? { ribbon } : {}),
  };
}

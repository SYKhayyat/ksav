// The writer's own ribbon, as data (#233, step 7; `docs/ui-architecture.md` §8).
//
// Owns: the default layout (§5, copied in on the first edit), version migration
// against `known`, the tree the tab renderer draws from a layout, and import and
// export. Defers: the shape and its validation to `shellsettings.ts` (a leaf, so
// `settings.ts` can read it at boot), what each action is to `placement.ts`, and
// all drawing to `shelltabs.ts`. Refuses: naming a menu. A layout arranges the
// tabs however it likes; every command keeps its one menu row whatever it says.
//
// Pure, like `tabTree`: every function takes the placed list and returns data,
// so the migration fences need no DOM and no running app.

import { MAX_FACE, TABS, tabTree, type PlacedAction, type TabGroup, type TabId } from "./placement";
import { hasKey, t } from "./i18n";
import { readRibbon, type RibbonGroup, type RibbonLayout, type RibbonTab } from "./shellsettings";

/** One tab as the renderer draws it: a default tab, or a layout's. */
export interface ShownTab {
  /** A built-in `TabId`, or `user:<id>`. */
  tab: string;
  /** The built-in tabs it is — how a contextual tab or a pinned toolbar finds it. */
  from: TabId[];
  /** The writer's name for it; absent, the built-in name in the current language. */
  name?: string;
  hidden: boolean;
  groups: TabGroup[];
}

const isTab = (id: string): id is TabId => (TABS as readonly string[]).includes(id);

/** The built-in tabs a saved tab stands for: what it says, else itself if it is one. */
export function fromOf(t: Pick<RibbonTab, "id" | "from">): TabId[] {
  return (t.from ?? [t.id]).filter(isTab);
}

/**
 * Which actions a layout stores. A custom style is the document's, not the
 * writer's — it comes and goes with the file — so the `styles` group draws the
 * document's styles itself and the layout never names one.
 */
const stored = (a: PlacedAction) => a.kind !== "style";

/** The default ribbon of §5 as a layout: what the first edit copies in. */
export function defaultLayout(list: readonly PlacedAction[]): RibbonLayout {
  const groupOf = (g: TabGroup): RibbonGroup => ({
    id: g.group,
    items: [
      ...g.face.filter(stored).map((a) => ({ action: a.id, face: true })),
      ...[...g.more, ...g.gear].filter(stored).map((a) => ({ action: a.id, face: false })),
    ],
  });
  return {
    version: 1,
    tabs: tabTree(list).map((n) => ({ id: n.tab, from: [n.tab], groups: n.groups.map(groupOf) })),
    known: list.filter(stored).map((a) => a.id),
  };
}

export interface Migrated {
  layout: RibbonLayout;
  /** Ids that are new since the layout was saved and were placed on it — the dialog marks them *new*. */
  added: string[];
  /** Ids the layout named that this version does not have, each counted once. */
  dropped: string[];
}

/**
 * A saved layout, brought up to this version (§8 "The data").
 *
 * - An action that no longer exists is dropped, silently, and never throws.
 * - An action not in `known` is new: it joins its default group in every saved
 *   tab whose `from` lists its default tab, keeping its default face. If no tab
 *   kept that default tab, it goes behind the `⋯` of the first tab the writer
 *   kept. It is never dropped — and if there are no tabs at all it is still in
 *   its menu, which is the floor.
 *
 * `known` comes back as this version's ids, so migrating twice is migrating once.
 */
export function migrate(saved: RibbonLayout, list: readonly PlacedAction[]): Migrated {
  const ids = new Set(list.filter(stored).map((a) => a.id));
  const known = new Set(saved.known);
  const dropped = new Set<string>();
  const tabs: RibbonTab[] = saved.tabs.map((t) => ({
    ...t,
    groups: t.groups.map((g) => ({
      ...g,
      items: g.items.filter((i) => ids.has(i.action) || (dropped.add(i.action), false)),
    })),
  }));

  const added = new Set<string>();
  const put = (tab: RibbonTab, group: string, action: string, face: boolean) => {
    let g = tab.groups.find((x) => x.id === group);
    if (!g) tab.groups.push((g = { id: group, items: [] }));
    if (!g.items.some((i) => i.action === action)) g.items.push({ action, face });
    added.add(action);
  };
  for (const dt of defaultLayout(list).tabs) {
    const homes = tabs.filter((t) => fromOf(t).includes(dt.id as TabId));
    for (const dg of dt.groups) {
      for (const it of dg.items) {
        if (known.has(it.action)) continue;
        if (homes.length) for (const h of homes) put(h, dg.id, it.action, it.face);
        else {
          const kept = tabs.find((t) => !t.hidden) ?? tabs[0];
          if (kept) put(kept, kept.groups.at(-1)?.id ?? dg.id, it.action, false);
        }
      }
    }
  }
  return { layout: { version: 1, tabs, known: [...ids] }, added: [...added], dropped: [...dropped] };
}

/** The tabs a layout draws, resolved against the placed list. */
export function layoutTree(layout: RibbonLayout, list: readonly PlacedAction[]): ShownTab[] {
  const byId = new Map(list.map((a) => [a.id, a]));
  const styles = list.filter((a) => a.kind === "style").slice(0, MAX_FACE);
  return layout.tabs.map((t) => ({
    tab: t.id,
    from: fromOf(t),
    ...(t.name ? { name: t.name } : {}),
    hidden: !!t.hidden,
    groups: t.groups
      .map((g) => {
        const out: TabGroup = { group: g.id, face: [], more: [], gear: [], missing: [], ...(g.name ? { name: g.name } : {}) };
        if (g.id === "styles") out.face.push(...styles);
        for (const i of g.items) {
          const a = byId.get(i.action);
          if (!a) continue;
          // `⚙` is a rule, not a choice: a `*_config` command is never a face (§10).
          (a.gear ? out.gear : i.face ? out.face : out.more).push(a);
        }
        return out;
      })
      .filter((g) => g.face.length || g.more.length || g.gear.length),
  }));
}

/**
 * What the renderer draws: the writer's ribbon when there is one, else §5.
 * The saved layout is migrated on the way, so a version that added or removed
 * commands draws correctly before anything is written back.
 */
export function shownTabs(saved: RibbonLayout | undefined, list: readonly PlacedAction[]): ShownTab[] {
  if (saved) return layoutTree(migrate(saved, list).layout, list);
  return tabTree(list).map((n) => ({ tab: n.tab, from: [n.tab], hidden: false, groups: n.groups }));
}

/** A tab's name: the writer's when they gave one, else the built-in one in the current language. */
export function tabName(n: { tab: string; name?: string }): string {
  return n.name ?? (hasKey("tab." + n.tab) ? t("tab." + n.tab) : n.tab);
}

/** A group's name, the same way. */
export function groupLabel(id: string, name?: string): string {
  return name ?? (hasKey("grp." + id) ? t("grp." + id) : id);
}

// ---------------------------------------------------------------- import / export

/** The file's marker, so an import can tell a ribbon from any other JSON. */
const MARK = "ksav-ribbon";

/** A layout as a file a chavrusa can be sent. */
export function exportLayout(layout: RibbonLayout): string {
  return JSON.stringify({ kind: MARK, ...layout }, null, 2) + "\n";
}

export type Imported =
  | { ok: true; layout: RibbonLayout; added: string[]; unknown: number }
  | { ok: false; reason: "notJson" | "notRibbon" };

/**
 * A layout file, validated before anything is applied (§8).
 *
 * Unknown actions are dropped and counted — *N commands in this file do not
 * exist in this version* — and nothing in the file is ever run: an id is only
 * ever looked up in the placed list. Commands the sender's version did not
 * have are added as any migration adds them.
 */
export function importLayout(text: string, list: readonly PlacedAction[]): Imported {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // silent: the failure is the answer — the dialog tells the writer the file is not JSON.
    return { ok: false, reason: "notJson" };
  }
  const kind = raw && typeof raw === "object" ? (raw as { kind?: unknown }).kind : undefined;
  const layout = kind === MARK ? readRibbon(raw) : undefined;
  if (!layout) return { ok: false, reason: "notRibbon" };
  const m = migrate(layout, list);
  return { ok: true, layout: m.layout, added: m.added, unknown: m.dropped.length };
}

// The edits the customize dialog makes to a writer's ribbon (#233, step 8;
// `docs/ui-architecture.md` §8 "What a writer can do").
//
// Owns: every operation on a `RibbonLayout` — tabs, groups and commands added,
// renamed, hidden, removed, reordered and merged, a face toggled, a tab reset.
// Defers: what a layout is and how it is read to `shellsettings.ts`, the default
// and migration to `ribbonlayout.ts`, and every pixel to `ribboncustomize.ts`.
// Refuses: naming a menu. Nothing here can make a command unfindable, because
// nothing here can reach the menus.
//
// Pure. Every edit takes a layout and returns a new one; the one it was given is
// never touched, so the dialog can hold the last layout it wrote and compare.

import type { PlacedAction } from "./placement";
import type { RibbonGroup, RibbonLayout, RibbonTab } from "./shellsettings";
import { defaultLayout, fromOf, migrate } from "./ribbonlayout";

/** A node of the dialog's tree: a tab, a group in it, or a command in that. */
export type Node =
  | { tab: string }
  | { tab: string; group: string }
  | { tab: string; group: string; action: string };

const copy = (l: RibbonLayout): RibbonLayout => JSON.parse(JSON.stringify(l)) as RibbonLayout;
const NAME_MAX = 80;
const clean = (name: string) => name.trim().slice(0, NAME_MAX);

/** The layout an edit starts from: the writer's, brought up to date, or §5 on the first edit. */
export function begin(saved: RibbonLayout | undefined, list: readonly PlacedAction[]): RibbonLayout {
  return saved ? migrate(saved, list).layout : defaultLayout(list);
}

/** A fresh `user:` id no tab or group in `l` already has. */
export function freshId(l: RibbonLayout, rand: () => string = () => Math.random().toString(36).slice(2, 10)): string {
  const taken = new Set(l.tabs.flatMap((t) => [t.id, ...t.groups.map((g) => g.id)]));
  for (;;) {
    const id = "user:" + rand().replace(/[^A-Za-z0-9-]/g, "").slice(0, 32);
    if (id.length > 5 && !taken.has(id)) return id;
  }
}

function tabOf(l: RibbonLayout, id: string): RibbonTab | undefined {
  return l.tabs.find((t) => t.id === id);
}

function groupOf(l: RibbonLayout, n: { tab: string; group: string }): RibbonGroup | undefined {
  return tabOf(l, n.tab)?.groups.find((g) => g.id === n.group);
}

/** Move `xs[i]` by `delta` places, clamped. */
function shift<T>(xs: T[], i: number, delta: number): void {
  const j = Math.max(0, Math.min(xs.length - 1, i + delta));
  if (i < 0 || i === j) return;
  const [x] = xs.splice(i, 1);
  xs.splice(j, 0, x);
}

// ---------------------------------------------------------------- tabs

/** A new, empty tab of the writer's own, after `after` (or last), with one empty group. */
export function addTab(l: RibbonLayout, name: string, after?: string, id = freshId(l)): { layout: RibbonLayout; id: string } {
  const out = copy(l);
  const group = freshId({ ...out, tabs: [...out.tabs, { id, groups: [] }] });
  const tab: RibbonTab = { id, from: [], name: clean(name) || id, groups: [{ id: group, items: [] }] };
  const at = after ? out.tabs.findIndex((t) => t.id === after) : -1;
  out.tabs.splice(at < 0 ? out.tabs.length : at + 1, 0, tab);
  return { layout: out, id };
}

/** The writer's name for a tab or a group; an empty name puts a built-in one back on its catalogue name. */
export function rename(l: RibbonLayout, n: Node, name: string): RibbonLayout {
  const out = copy(l);
  const target = "group" in n ? groupOf(out, n) : tabOf(out, n.tab);
  if (!target || "action" in n) return out;
  const v = clean(name);
  if (v) target.name = v;
  else if (!target.id.startsWith("user:")) delete target.name;
  return out;
}

/** 👁: hide a tab, or show it again. A hidden tab keeps everything in it. */
export function toggleHidden(l: RibbonLayout, tab: string): RibbonLayout {
  const out = copy(l);
  const t = tabOf(out, tab);
  if (t) {
    if (t.hidden) delete t.hidden;
    else t.hidden = true;
  }
  return out;
}

/** Remove a tab, a group, or a command from a group. The menus still hold every one of them. */
export function remove(l: RibbonLayout, n: Node): RibbonLayout {
  const out = copy(l);
  if ("action" in n) {
    const g = groupOf(out, n);
    if (g) g.items = g.items.filter((i) => i.action !== n.action);
  } else if ("group" in n) {
    const t = tabOf(out, n.tab);
    if (t) t.groups = t.groups.filter((g) => g.id !== n.group);
  } else {
    out.tabs = out.tabs.filter((t) => t.id !== n.tab);
  }
  return out;
}

/** Alt+↑/↓: move a tab, a group or a command one place within what holds it. */
export function move(l: RibbonLayout, n: Node, delta: number): RibbonLayout {
  const out = copy(l);
  if ("action" in n) {
    const g = groupOf(out, n);
    if (g) shift(g.items, g.items.findIndex((i) => i.action === n.action), delta);
  } else if ("group" in n) {
    const t = tabOf(out, n.tab);
    if (t) shift(t.groups, t.groups.findIndex((g) => g.id === n.group), delta);
  } else {
    shift(out.tabs, out.tabs.findIndex((t) => t.id === n.tab), delta);
  }
  return out;
}

/**
 * Merge `second` into `first`: its groups are appended, and the merged tab is
 * both built-in tabs at once — a contextual Table still finds it. The merged tab
 * keeps the first's name until it is renamed. A group id the two share is
 * folded into one group rather than drawn twice.
 */
export function merge(l: RibbonLayout, first: string, second: string): RibbonLayout {
  const out = copy(l);
  const a = tabOf(out, first);
  const b = tabOf(out, second);
  if (!a || !b || a === b) return out;
  // The first's name needs no copying: a built-in tab's name follows its id, and the id stays.
  a.from = [...new Set([...fromOf(a), ...fromOf(b)])];
  for (const g of b.groups) {
    const same = a.groups.find((x) => x.id === g.id);
    if (!same) a.groups.push(g);
    else for (const i of g.items) if (!same.items.some((x) => x.action === i.action)) same.items.push(i);
  }
  out.tabs = out.tabs.filter((t) => t !== b);
  return out;
}

// ---------------------------------------------------------------- groups

/** A new, empty group of the writer's own, at the end of `tab`. */
export function addGroup(l: RibbonLayout, tab: string, name: string, id = freshId(l)): { layout: RibbonLayout; id: string } {
  const out = copy(l);
  tabOf(out, tab)?.groups.push({ id, name: clean(name) || id, items: [] });
  return { layout: out, id };
}

/** Move a group to the end of another tab. */
export function moveGroupTo(l: RibbonLayout, n: { tab: string; group: string }, tab: string): RibbonLayout {
  const out = copy(l);
  const from = tabOf(out, n.tab);
  const to = tabOf(out, tab);
  const g = from?.groups.find((x) => x.id === n.group);
  if (!from || !to || !g || from === to) return out;
  if (to.groups.some((x) => x.id === g.id)) return out;
  from.groups = from.groups.filter((x) => x !== g);
  to.groups.push(g);
  return out;
}

// ---------------------------------------------------------------- commands

/**
 * Put a command in a group — on the face, unless `face` says behind `⋯`.
 * A command may be on more than one tab (§8); in one group it is there once.
 */
export function addItem(l: RibbonLayout, n: { tab: string; group: string }, action: string, face = true): RibbonLayout {
  const out = copy(l);
  const g = groupOf(out, n);
  if (g && !g.items.some((i) => i.action === action)) g.items.push({ action, face });
  if (!out.known.includes(action)) out.known.push(action);
  return out;
}

/** `Space`: on the ribbon (●) or behind `⋯` (○). */
export function toggleFace(l: RibbonLayout, n: { tab: string; group: string; action: string }): RibbonLayout {
  const out = copy(l);
  const i = groupOf(out, n)?.items.find((x) => x.action === n.action);
  if (i) i.face = !i.face;
  return out;
}

/** Every tab and group a command is in, in this layout. */
export function whereIs(l: RibbonLayout, action: string): { tab: string; group: string; face: boolean }[] {
  return l.tabs.flatMap((t) =>
    t.groups.flatMap((g) => g.items.filter((i) => i.action === action).map((i) => ({ tab: t.id, group: g.id, face: i.face }))),
  );
}

// ---------------------------------------------------------------- reset

/**
 * One built-in tab back to §5: its name, its groups, its commands, shown. A
 * merged tab goes back to the first tab it was; a tab of the writer's own has
 * no default and is left as it is.
 */
export function resetTab(l: RibbonLayout, tab: string, list: readonly PlacedAction[]): RibbonLayout {
  const out = copy(l);
  const i = out.tabs.findIndex((t) => t.id === tab);
  const base = i < 0 ? undefined : fromOf(out.tabs[i])[0];
  const fresh = base && defaultLayout(list).tabs.find((t) => t.id === base);
  if (!fresh) return out;
  out.tabs[i] = fresh;
  // Two tabs with one id is two tabs the renderer cannot tell apart.
  out.tabs = out.tabs.filter((t, j) => j === i || t.id !== fresh.id);
  return out;
}

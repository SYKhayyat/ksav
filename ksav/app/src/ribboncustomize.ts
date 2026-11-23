// Customize the ribbon (#233, step 8; `docs/ui-architecture.md` §8).
//
// Owns: the customize drawer — the writer's ribbon as a `tree` on one side,
// every command as a searchable list on the other — and the right-click quick
// path on a ribbon button and a tab header. Every edit is written at once, so
// the ribbon above changes while the drawer is open.
//
// Defers: every edit to `ribbonedit.ts` (pure), the default, migration and
// import/export to `ribbonlayout.ts`, the drawing of the ribbon to
// `shelltabs.ts` (which imports this file for its right-click, never the other
// way), and the frame of the drawer and the popup to `panels.ts`.
//
// Refuses: the menus. The drawer says so in one line, and nothing it can do
// reaches them — which is why it can be this powerful.

import { el, pickFile } from "./dom";
import { isRtlUi, t, tf } from "./i18n";
import { setSetting, settings } from "./settings";
import { readShell, type RibbonLayout, type RibbonTab } from "./shellsettings";
import type { PlacedAction } from "./placement";
import { currentPlaced, shellLabel } from "./shellmenu";
import { defaultLayout, exportLayout, groupLabel, importLayout, migrate, tabName } from "./ribbonlayout";
import * as E from "./ribbonedit";
import type { Node as TreeNode } from "./ribbonedit";
import { closeMenus, closePanel, isPanelOpen, mountPanel, openPanel } from "./panels";
import * as files from "./files";
import { askText } from "./formmodal";
import { voidAction } from "./asyncaction";
import * as runtime from "./runtime";
import { setStatus } from "./runtime";

// ---------------------------------------------------------------- the state

/** What the drawer is showing: the layout it last wrote, and where the writer is in it. */
interface State {
  layout: RibbonLayout;
  /** Whether `layout` is the writer's (in `shell.ribbon`) or still §5. */
  custom: boolean;
  sel: TreeNode | null;
  expanded: Set<string>;
  query: string;
  /** `all`, `off` (not on my ribbon), or `menu:<id>`. */
  filter: string;
  /** The command chosen in the list, to add. */
  pick: string | null;
  /** Commands new since the layout was saved — marked *new* this once. */
  fresh: Set<string>;
  status: string;
}

let st: State | null = null;
/** Set by a keyboard edit, so the redraw puts focus back on the node. */
let refocus = false;
/** The selected treeitem as last drawn — where `refocus` puts focus. */
let selEl: HTMLElement | null = null;
const focusSelected = () => selEl?.focus?.();

const keyOf = (n: TreeNode) => [n.tab, "group" in n ? n.group : "", "action" in n ? n.action : ""].join("\u0000");
const same = (a: TreeNode | null, b: TreeNode) => !!a && keyOf(a) === keyOf(b);
const stored = (list: readonly PlacedAction[]) => list.filter((a) => a.kind !== "style");

function nameOfTab(tab: RibbonTab): string {
  return tabName({ tab: tab.id, ...(tab.name ? { name: tab.name } : {}) });
}

function label(id: string, list: readonly PlacedAction[]): string {
  const a = list.find((x) => x.id === id);
  return a ? shellLabel(a) : id;
}

/** Write the layout and redraw — the ribbon above follows through `applyChange("shell")`. */
function commit(next: RibbonLayout, status = ""): void {
  if (!st) return;
  st.layout = next;
  st.custom = true;
  st.status = status;
  setSetting("shell", { ...readShell(settings.shell), ribbon: next });
  render();
}

/** An edit from the tree or a right-click, applied to the layout the drawer is showing — or to the live one. */
function edit(f: (l: RibbonLayout, list: readonly PlacedAction[]) => RibbonLayout, status = ""): void {
  const list = currentPlaced();
  if (!st || !isPanelOpen("ribbon-drawer")) {
    st = null;
    // A right-click with the drawer closed: the same edit, written straight through.
    setSetting("shell", { ...readShell(settings.shell), ribbon: f(E.begin(readShell(settings.shell).ribbon, list), list) });
    return;
  }
  commit(f(st.layout, list), status);
}

// ---------------------------------------------------------------- the door

/** `כלים ▸ התאמת הסרגל…`: open the drawer on the writer's ribbon, or on §5 if they have none yet. */
export function openCustomize(at?: TreeNode): void {
  closeMenus();
  closePanel("ribbon-menu");
  const list = currentPlaced();
  const saved = readShell(settings.shell).ribbon;
  const m = saved ? migrate(saved, list) : null;
  st = {
    layout: m ? m.layout : defaultLayout(list),
    custom: !!saved,
    sel: at ?? null,
    expanded: new Set(at ? [at.tab] : []),
    query: "",
    filter: "all",
    pick: null,
    fresh: new Set(m?.added ?? []),
    status: "",
  };
  if (!st.sel && st.layout.tabs[0]) st.sel = { tab: st.layout.tabs[0].id };
  render();
  openPanel("ribbon-drawer");
}
runtime.onOpenCustomize(() => openCustomize());

// ---------------------------------------------------------------- the tree

/** The nodes the tree shows, in order: tabs, and the groups and commands of the open ones. */
export function visibleNodes(l: RibbonLayout, expanded: ReadonlySet<string>): TreeNode[] {
  const out: TreeNode[] = [];
  for (const tab of l.tabs) {
    out.push({ tab: tab.id });
    if (!expanded.has(tab.id)) continue;
    for (const g of tab.groups) {
      out.push({ tab: tab.id, group: g.id });
      if (!expanded.has(tab.id + "\u0000" + g.id)) continue;
      for (const i of g.items) out.push({ tab: tab.id, group: g.id, action: i.action });
    }
  }
  return out;
}

const openKey = (n: TreeNode) => ("group" in n ? n.tab + "\u0000" + n.group : n.tab);

/**
 * A key in the tree, as an edit or a move — the ARIA tree pattern plus §8's
 * keys. `→`/`←` follow the interface's flow: in Hebrew ← opens, as it moves
 * forward. Returns whether the key was the tree's.
 */
export function treeKey(e: Pick<KeyboardEvent, "key" | "altKey">): boolean {
  if (!st || !st.sel) return false;
  const sel = st.sel;
  const nodes = visibleNodes(st.layout, st.expanded);
  const i = nodes.findIndex((n) => same(sel, n));
  const inward = isRtlUi() ? "ArrowLeft" : "ArrowRight";
  const outward = isRtlUi() ? "ArrowRight" : "ArrowLeft";
  const go = (n: TreeNode | undefined) => {
    if (!n || !st) return;
    st.sel = n;
    refocus = true;
    render();
  };
  switch (e.key) {
    case "ArrowDown":
    case "ArrowUp": {
      const d = e.key === "ArrowDown" ? 1 : -1;
      if (e.altKey) {
        refocus = true;
        edit((l) => E.move(l, sel, d));
      } else go(nodes[i + d]);
      return true;
    }
    case "Home":
      go(nodes[0]);
      return true;
    case "End":
      go(nodes.at(-1));
      return true;
    case inward:
      if ("action" in sel) return true;
      if (!st.expanded.has(openKey(sel))) {
        st.expanded.add(openKey(sel));
        go(sel);
      } else go(nodes[i + 1]);
      return true;
    case outward:
      if (!("action" in sel) && st.expanded.has(openKey(sel))) {
        st.expanded.delete(openKey(sel));
        go(sel);
      } else if ("action" in sel) go({ tab: sel.tab, group: sel.group });
      else if ("group" in sel) go({ tab: sel.tab });
      return true;
    case " ":
      if ("action" in sel) {
        refocus = true;
        edit((l) => E.toggleFace(l, sel));
      }
      return true;
    case "Delete":
      removeSelected();
      return true;
    case "F2":
      voidAction("general", renameSelected);
      return true;
    case "Enter":
      if (!("action" in sel)) {
        const k = openKey(sel);
        if (st.expanded.has(k)) st.expanded.delete(k);
        else st.expanded.add(k);
        go(sel);
      }
      return true;
  }
  return false;
}

function removeSelected(): void {
  if (!st?.sel) return;
  const sel = st.sel;
  const nodes = visibleNodes(st.layout, st.expanded);
  const i = nodes.findIndex((n) => same(sel, n));
  // Focus goes to the node before, so Delete held down walks up rather than off the tree.
  st.sel = nodes[i - 1] ?? nodes[i + 1] ?? null;
  if (st.sel && "tab" in sel && !("group" in sel) && st.sel.tab === sel.tab) st.sel = nodes.find((n) => n.tab !== sel.tab) ?? null;
  refocus = true;
  edit((l) => E.remove(l, sel));
}

async function renameSelected(): Promise<void> {
  if (!st?.sel || "action" in st.sel) return;
  const sel = st.sel;
  const tab = st.layout.tabs.find((x) => x.id === sel.tab);
  const g = "group" in sel ? tab?.groups.find((x) => x.id === sel.group) : undefined;
  const now = g ? groupLabel(g.id, g.name) : tab ? nameOfTab(tab) : "";
  const name = await askText(t("rcRenamePrompt"), now, { title: t("rcRename"), okLabel: t("rcRename") });
  if (name === null) return;
  refocus = true;
  edit((l) => E.rename(l, sel, name));
}

function treeItem(n: TreeNode, level: number, text: (globalThis.Node | string)[], expandable: boolean, tools: HTMLElement[] = []): HTMLElement {
  const s = st!;
  const selected = same(s.sel, n);
  const item = el(
    "li",
    {
      role: "treeitem",
      class: "rc-node",
      "aria-level": String(level),
      "aria-selected": String(selected),
      tabindex: selected ? "0" : "-1",
      "data-node": keyOf(n),
      ...(expandable ? { "aria-expanded": String(s.expanded.has(openKey(n))) } : {}),
      onClick: (e: Event) => {
        e.stopPropagation();
        s.sel = n;
        if (expandable && (e.target as HTMLElement).closest?.(".rc-twisty")) {
          const k = openKey(n);
          if (s.expanded.has(k)) s.expanded.delete(k);
          else s.expanded.add(k);
        }
        refocus = true;
        render();
      },
    },
    [
      el("span", { class: "rc-row" }, [
        ...(expandable ? [el("span", { class: "rc-twisty", "aria-hidden": "true" }, [s.expanded.has(openKey(n)) ? "▾" : isRtlUi() ? "◂" : "▸"])] : []),
        el("span", { class: "rc-name" }, text),
        ...tools,
      ]),
    ],
  );
  if (selected) selEl = item;
  return item;
}

function tool(glyph: string, key: string, run: () => void): HTMLElement {
  return el("button", {
    type: "button",
    class: "rc-tool",
    tabindex: "-1",
    title: t(key),
    "aria-label": t(key),
    onClick: (e: Event) => {
      e.stopPropagation();
      run();
    },
  }, [glyph]);
}

function buildTree(list: readonly PlacedAction[]): HTMLElement {
  const s = st!;
  const rows: HTMLElement[] = [];
  for (const tab of s.layout.tabs) {
    const tn: TreeNode = { tab: tab.id };
    rows.push(
      treeItem(tn, 1, [nameOfTab(tab), ...(tab.hidden ? [el("span", { class: "rc-note" }, [" · " + t("rcHidden")])] : [])], true, [
        tool("👁", tab.hidden ? "rcShow" : "rcHide", () => edit((l) => E.toggleHidden(l, tab.id))),
        tool("✎", "rcRename", () => { s.sel = tn; voidAction("general", renameSelected); }),
        tool("🗑", "rcDelete", () => { s.sel = tn; removeSelected(); }),
      ]),
    );
    if (!s.expanded.has(tab.id)) continue;
    for (const g of tab.groups) {
      const gn: TreeNode = { tab: tab.id, group: g.id };
      rows.push(treeItem(gn, 2, [groupLabel(g.id, g.name)], true));
      if (!s.expanded.has(openKey(gn))) continue;
      for (const i of g.items) {
        const an: TreeNode = { tab: tab.id, group: g.id, action: i.action };
        rows.push(
          treeItem(an, 3, [
            (i.face ? "● " : "○ ") + label(i.action, list),
            ...(i.face ? [] : [el("span", { class: "rc-note" }, [" · " + t("rcBehindMore")])]),
            ...(s.fresh.has(i.action) ? [el("span", { class: "rc-new" }, [" " + t("rcNew")])] : []),
          ], false),
        );
      }
    }
  }
  return el(
    "ul",
    {
      role: "tree",
      class: "rc-tree",
      "aria-label": t("rcMine"),
      onKeydown: (e: KeyboardEvent) => {
        if (treeKey(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
    rows,
  );
}

// ---------------------------------------------------------------- the commands

/** Where a command lives: its menu, and every tab of this layout it is on. */
export function whereLabel(a: PlacedAction, l: RibbonLayout): string {
  const menu = t("menu." + a.place.menu);
  const tabs = [...new Set(E.whereIs(l, a.id).map((w) => w.tab))]
    .map((id) => l.tabs.find((x) => x.id === id))
    .filter((x): x is RibbonTab => !!x)
    .map(nameOfTab);
  return [menu, ...tabs].join(" · ");
}

/** The commands the list shows for a query and a filter. */
export function listed(list: readonly PlacedAction[], l: RibbonLayout, query: string, filter: string): PlacedAction[] {
  const q = query.trim().toLowerCase();
  return stored(list).filter((a) => {
    if (filter === "off" && E.whereIs(l, a.id).length) return false;
    if (filter.startsWith("menu:") && a.place.menu !== filter.slice(5)) return false;
    if (!q) return true;
    const words = [shellLabel(a), a.id, a.command?.he ?? "", a.command?.en ?? ""].join(" ").toLowerCase();
    return words.includes(q);
  });
}

/** Where ← Add puts a command: the group selected, or the one the selected command is in, or the selected tab's last. */
function target(l: RibbonLayout, sel: TreeNode | null): { tab: string; group: string } | null {
  if (!sel) return null;
  if ("group" in sel) return { tab: sel.tab, group: sel.group };
  const g = l.tabs.find((x) => x.id === sel.tab)?.groups.at(-1);
  return g ? { tab: sel.tab, group: g.id } : null;
}

function addPicked(): void {
  const s = st;
  if (!s?.pick) return;
  const at = target(s.layout, s.sel);
  if (!at) {
    s.status = t("rcPickGroup");
    render();
    return;
  }
  const action = s.pick;
  s.expanded.add(at.tab).add(at.tab + "\u0000" + at.group);
  s.sel = { ...at, action };
  edit((l) => E.addItem(l, at, action));
}

function buildList(list: readonly PlacedAction[]): HTMLElement {
  const s = st!;
  const menus = [...new Set(stored(list).map((a) => a.place.menu))];
  const search = el("input", {
    type: "search",
    class: "set-input rc-search",
    placeholder: t("rcSearch"),
    "aria-label": t("rcSearch"),
    onInput: (e: Event) => {
      s.query = (e.target as HTMLInputElement).value;
      fillOptions();
    },
  });
  search.value = s.query;
  const filter = el(
    "select",
    {
      class: "set-input rc-filter",
      "aria-label": t("rcFilter"),
      onChange: (e: Event) => {
        s.filter = (e.target as HTMLSelectElement).value;
        fillOptions();
      },
    },
    [
      el("option", { value: "all" }, [t("rcFilterAll")]),
      el("option", { value: "off" }, [t("rcFilterOff")]),
      ...menus.map((m) => el("option", { value: "menu:" + m }, [t("menu." + m)])),
    ],
  );
  filter.value = s.filter;
  const box = el("ul", { role: "listbox", class: "rc-list", "aria-label": t("rcAll") });
  const fillOptions = () => {
    box.replaceChildren(
      ...listed(list, s.layout, s.query, s.filter).map((a) =>
        el(
          "li",
          {
            role: "option",
            class: "rc-option",
            "data-action": a.id,
            "aria-selected": String(s.pick === a.id),
            tabindex: "0",
            onClick: () => {
              s.pick = a.id;
              fillOptions();
            },
            onDblclick: () => {
              s.pick = a.id;
              addPicked();
            },
            onKeydown: (e: KeyboardEvent) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              s.pick = a.id;
              addPicked();
            },
          },
          [el("span", { class: "rc-name" }, [shellLabel(a)]), el("span", { class: "rc-where" }, [whereLabel(a, s.layout)])],
        ),
      ),
    );
  };
  fillOptions();
  return el("section", { class: "rc-side rc-commands" }, [
    el("h4", {}, [t("rcAll")]),
    el("div", { class: "rc-find" }, [search, filter]),
    box,
    el("button", { type: "button", class: "note-use rc-add", "data-rc": "add", onClick: addPicked }, [t("rcAdd")]),
  ]);
}

// ---------------------------------------------------------------- the drawer

function button(key: string, run: () => void, data: string, on = true): HTMLElement {
  return el("button", { type: "button", class: "sc-key", "data-rc": data, ...(on ? {} : { disabled: "disabled" }), onClick: run }, [t(key)]);
}

/** Read a layout file and apply it, or say why not. Exported for the fence, which has no file picker. */
export function applyImport(text: string): void {
  if (!st) return;
  const r = importLayout(text, currentPlaced());
  if (!r.ok) {
    st.status = t(r.reason === "notJson" ? "rcImportNotJson" : "rcImportNotRibbon");
    render();
    return;
  }
  st.fresh = new Set(r.added);
  st.sel = r.layout.tabs[0] ? { tab: r.layout.tabs[0].id } : null;
  commit(r.layout, r.unknown ? tf("rcImportUnknown", String(r.unknown)) : t("rcImported"));
}

/** Every tab back to §5: the writer's ribbon is deleted, not overwritten with a copy. */
function resetAll(): void {
  if (!st) return;
  const shell = { ...readShell(settings.shell) };
  delete shell.ribbon;
  st.layout = defaultLayout(currentPlaced());
  st.custom = false;
  st.fresh.clear();
  st.sel = st.layout.tabs[0] ? { tab: st.layout.tabs[0].id } : null;
  st.status = t("rcResetDone");
  setSetting("shell", shell);
  render();
}

/** The layout as a file. Said back by name, on the drawer's line and the status bar, as every handover is. */
function exportNow(): void {
  if (!st) return;
  const name = "ksav-ribbon.json";
  files.download(name, exportLayout(st.layout));
  st.status = tf("exported", name);
  setStatus(`✓ ${tf("exported", name)}`, "ok");
  render();
}

function render(): void {
  const s = st;
  const body = document.getElementById("ribbon-drawer-body");
  if (!s || !body) return;
  const list = currentPlaced();
  const sel = s.sel;
  const selTab = sel ? s.layout.tabs.find((x) => x.id === sel.tab) : undefined;
  const tabIdx = selTab ? s.layout.tabs.indexOf(selTab) : -1;
  const next = s.layout.tabs[tabIdx + 1];
  const isGroup = !!sel && "group" in sel && !("action" in sel);
  const builtIn = !!selTab && !selTab.id.startsWith("user:");

  const addTab = async () => {
    const name = await askText(t("rcNewTabPrompt"), "", { title: t("rcAddTab"), okLabel: t("rcAddTab") });
    if (name === null || !st) return;
    const r = E.addTab(st.layout, name || t("rcNewTabName"), sel?.tab);
    st.sel = { tab: r.id };
    st.expanded.add(r.id);
    commit(r.layout);
  };
  const addGroup = async () => {
    if (!selTab) return;
    const name = await askText(t("rcNewGroupPrompt"), "", { title: t("rcAddGroup"), okLabel: t("rcAddGroup") });
    if (name === null || !st) return;
    const r = E.addGroup(st.layout, selTab.id, name || t("rcNewGroupName"));
    st.sel = { tab: selTab.id, group: r.id };
    st.expanded.add(selTab.id);
    commit(r.layout);
  };

  const moveTo = isGroup
    ? el(
        "select",
        {
          class: "set-input rc-move-to",
          "aria-label": t("rcMoveGroupTo"),
          onChange: (e: Event) => {
            const to = (e.target as HTMLSelectElement).value;
            if (!to || !sel || !("group" in sel)) return;
            s.sel = { tab: to, group: sel.group };
            s.expanded.add(to);
            edit((l) => E.moveGroupTo(l, sel, to));
          },
        },
        [
          el("option", { value: "" }, [t("rcMoveGroupTo")]),
          ...s.layout.tabs.filter((x) => x.id !== sel?.tab).map((x) => el("option", { value: x.id }, [nameOfTab(x)])),
        ],
      )
    : null;

  selEl = null;
  const tree = buildTree(list);
  body.replaceChildren(
    el("p", { class: "styles-lede rc-floor", "data-rc": "floor" }, [t("rcFloor")]),
    el("div", { class: "rc-columns" }, [
      el("section", { class: "rc-side rc-mine" }, [
        el("h4", {}, [t("rcMine")]),
        tree,
        el("div", { class: "rc-tools" }, [
          button("rcAddTab", () => voidAction("general", addTab), "addTab"),
          button("rcAddGroup", () => voidAction("general", addGroup), "addGroup", !!selTab),
          button("rcMerge", () => next && selTab && edit((l) => E.merge(l, selTab.id, next.id)), "merge", !!next),
          button("rcUp", () => sel && edit((l) => E.move(l, sel, -1)), "up", !!sel),
          button("rcDown", () => sel && edit((l) => E.move(l, sel, 1)), "down", !!sel),
          button("rcToggleFace", () => sel && "action" in sel && edit((l) => E.toggleFace(l, sel)), "face", !!sel && "action" in sel),
          ...(moveTo ? [moveTo] : []),
        ]),
      ]),
      buildList(list),
    ]),
    el("div", { class: "rc-foot" }, [
      button("rcResetTab", () => selTab && edit((l, pl) => E.resetTab(l, selTab.id, pl)), "resetTab", builtIn),
      button("rcResetAll", resetAll, "resetAll", s.custom),
      button("rcImport", () => voidAction("general", async () => {
        const f = await pickFile(".json,application/json");
        if (f) applyImport(await f.text());
      }), "import"),
      button("rcExport", exportNow, "export"),
    ]),
    el("p", { class: "set-note rc-status", role: "status", "data-rc": "status" }, [s.status]),
  );
  if (refocus) {
    refocus = false;
    focusSelected();
  }
}

// ---------------------------------------------------------------- right-click

interface MenuRow {
  key: string;
  run: () => void;
}

function popup(rows: MenuRow[], x: number, y: number): HTMLElement {
  closePanel("ribbon-menu");
  const items = rows.map((r) =>
      el("button", {
        type: "button",
        class: "pal-item",
        role: "menuitem",
        "data-rc-menu": r.key,
        onClick: () => {
          closePanel("ribbon-menu");
          r.run();
        },
      }, [t(r.key)]),
  );
  const box = el("div", { class: "spell-menu ribbon-menu", role: "menu" }, items);
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  mountPanel("ribbon-menu", box, document.body);
  items[0]?.focus?.();
  return box;
}

/**
 * A ribbon button's right-click: *move to ⋯ / remove from tab / add to Home /
 * customize…*. `tab` and `group` are the ones it was drawn in.
 */
export function buttonMenu(tab: string, group: string, action: string, x: number, y: number): HTMLElement {
  const n = { tab, group, action };
  const onFace = () => E.whereIs(E.begin(readShell(settings.shell).ribbon, currentPlaced()), action).some((w) => w.tab === tab && w.group === group && w.face);
  return popup(
    [
      ...(onFace() ? [{ key: "rcMenuMoveMore", run: () => edit((l) => E.toggleFace(l, n)) }] : []),
      { key: "rcMenuRemove", run: () => edit((l) => E.remove(l, n)) },
      ...(tab !== "home"
        ? [{ key: "rcMenuAddHome", run: () => edit((l) => {
            const home = l.tabs.find((x) => x.id === "home") ?? l.tabs.find((x) => !x.hidden);
            const g = home?.groups.at(-1);
            return home && g ? E.addItem(l, { tab: home.id, group: g.id }, action) : l;
          }) }]
        : []),
      { key: "rcMenuCustomize", run: () => openCustomize(n) },
    ],
    x,
    y,
  );
}

/** A tab header's right-click: *rename / hide / customize…*. */
export function tabMenu(tab: string, x: number, y: number): HTMLElement {
  return popup(
    [
      {
        key: "rcRename",
        run: () => {
          const l = E.begin(readShell(settings.shell).ribbon, currentPlaced());
          const tb = l.tabs.find((v) => v.id === tab);
          voidAction("general", async () => {
            const name = await askText(t("rcRenamePrompt"), tb ? nameOfTab(tb) : "", { title: t("rcRename"), okLabel: t("rcRename") });
            if (name !== null) edit((ll) => E.rename(ll, { tab }, name));
          });
        },
      },
      { key: "rcHide", run: () => edit((l) => E.toggleHidden(l, tab)) },
      { key: "rcMenuCustomize", run: () => openCustomize({ tab }) },
    ],
    x,
    y,
  );
}

/** For the fence: whether the drawer is holding a layout, and the one it is. */
export function customizeState(): Readonly<State> | null {
  return st;
}

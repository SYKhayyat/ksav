// The tab strip, drawn from the placements (#233, step 4; `docs/ui-architecture.md` §4–§6).
//
// The *tabs* shell: `☰ תפריט`, then a `tablist` of the §5 tabs, then the open
// tab's groups — each its face buttons, then `⋯` (the rest of the group, as the
// same rows the menu draws), then `⚙` (its `הגדרות_…` commands) when it has any.
// `tabTree` says what each tab holds; this file only draws it.
//
// A tab is a view, never a home (§3): every button here is an action whose menu
// row exists, so `☰` is the floor and turning the tabs off loses nothing. The
// menu bar folds into that button unless `shell.menubar` is `always`.

import { el } from "./dom";
import { getLang, t, tf, hasKey, isRtlUi } from "./i18n";
import { ALIGN_ORDER, settings } from "./settings";
import { readShell } from "./shellsettings";
import * as runtime from "./runtime";
import { alignEdgeOf, highlightControl, lazyMenu, missingControl, paragraphStyleControl } from "./ribbon";
import { actionName } from "./actions";
import { savedNameMap } from "./macros";
import { hintFor } from "./keyhint";
import { btnKey, type PlacedAction, type TabGroup } from "./placement";
import { groupLabel, shownTabs, tabName, type ShownTab } from "./ribbonlayout";
import { currentPlaced, here, row, runPlaced, shellLabel } from "./shellmenu";
import { buttonMenu, tabMenu } from "./ribboncustomize";

/**
 * The open tab. Session state, not a setting: the strip opens where the writer
 * left it across a redraw (a language switch, a theme), and on Home after a
 * reload — which is where a word processor opens.
 */
let openTab = "home";

// ---------------------------------------------------------------- contextual tabs
//
// Table and Notes are also *contextual* (§4, §5): standing in a table or a note
// brings its tab forward. `contextbar.ts` knows where the caret is and calls
// `runtime.caretContext` on every move, which lands in `setContext` below;
// nothing here reads the document.

/** The tabs a caret can ask for. */
export type ContextTab = "table" | "notes";

/** What the caret is in now, and the tab that was open before it got there. */
let context: ContextTab | null = null;
let beforeContext: string | null = null;

/** The open strip's way to switch tab, while a strip is mounted. */
let showTab: ((tab: string) => void) | null = null;

/** The tabs drawn now: the writer's ribbon (§8) when there is one, else the default of §5. */
function shown(): ShownTab[] {
  return shownTabs(readShell(settings.shell).ribbon, currentPlaced());
}

/** The tab a contextual answer, or a pinned toolbar, means: the one that is that built-in tab. */
function tabFor(tabs: readonly ShownTab[], id: string): ShownTab | undefined {
  return tabs.find((n) => n.tab === id) ?? tabs.find((n) => (n.from as readonly string[]).includes(id));
}

const groupName = (g: TabGroup) => groupLabel(g.group, g.name);

/** Which contextual tab a caret asks for: a table wins over the note around it, being the nearer thing. */
export function contextOf(structureHere: string | undefined, noteDepth: number): ContextTab | null {
  if (structureHere === "table") return "table";
  if (noteDepth > 0) return "notes";
  return null;
}

/**
 * The caret moved into, out of, or between contexts.
 *
 * Under *tabs* the contextual tab opens, marked, and leaving puts back the tab
 * the writer had, unless they chose another in the meantime. Under *toolbar*
 * the tab is a second row, captioned, under the pinned one. Under *menus* there
 * are no tabs to bring forward, and with `shell.contextual` off nothing moves.
 * A move that does not change the answer does nothing, so this is cheap on
 * every arrow key.
 */
export function setContext(next: ContextTab | null): void {
  const shell = readShell(settings.shell);
  const want = shell.contextual && shell.variant !== "menus" ? next : null;
  if (want === context) return;
  const was = context;
  context = want;
  if (showTab && shell.variant === "tabs") {
    if (want && !was) beforeContext = openTab;
    if (want) showTab(tabFor(shown(), want)?.tab ?? want);
    else if (was && openTab === tabFor(shown(), was)?.tab && beforeContext) showTab(beforeContext);
    else showTab(openTab);
    if (!want) beforeContext = null;
  }
  fillContextRow();
}
runtime.onCaretContext((structureHere, noteDepth) => setContext(contextOf(structureHere, noteDepth)));

/** The toolbar shell's second row: empty and hidden until the caret is in a table or a note. */
export function contextRow(): HTMLElement {
  const row = el("div", {
    class: "toolbar ribbon-pinned ribbon-contextual",
    id: "ribbon-contextual",
    role: "toolbar",
    "data-open": "false",
    onContextmenu: faceMenu(() => (context ? tabFor(shown(), context)?.tab : undefined)),
  });
  fillContextRow(row);
  return row;
}

function fillContextRow(row = document.getElementById("ribbon-contextual")): void {
  if (!row) return;
  const node = context ? tabFor(shown(), context) : undefined;
  row.setAttribute("data-open", String(!!node));
  row.setAttribute("aria-label", node ? tabName(node) : t("toolbar"));
  if (!node) {
    row.replaceChildren();
    return;
  }
  const glyphs = readShell(settings.shell).labels === "names+glyphs";
  row.setAttribute("data-tab", node.tab);
  row.replaceChildren(
    el("span", { class: "ribbon-contextual-name" }, [tabName(node)]),
    ...node.groups.map((g) => groupBox(g, glyphs)),
  );
}

/** The words on a face button: the short label where one is written, else the action's own name. */
export function faceLabel(a: PlacedAction): string {
  const key = btnKey(a);
  if (hasKey(key)) return t(key);
  if (a.kind === "macro" || a.kind === "style") return a.name ?? a.id;
  if (a.kind === "command" && a.command) {
    return getLang() === "he" ? a.command.he.replace(/_/g, " ") : a.command.en.replace(/_/g, " ");
  }
  return shellLabel(a);
}

/** What the tooltip says: what the button does, and its key. */
function faceTitle(a: PlacedAction): string {
  const what = a.command ? (getLang() === "he" ? a.command.desc_he : a.command.desc_en) : actionName(a.id, savedNameMap());
  const key = hintFor(a.id);
  return key ? `${what} · ${key}` : what;
}

/**
 * One face button. Two faces are more than a button, and they are the two the
 * hand-built toolbar had earned: the highlighter carries its colour, and an
 * alignment button says whether the paragraph is already aligned that way —
 * `refreshAlignState` fills `aria-pressed` from the text the caret is in.
 */
function faceButton(a: PlacedAction, glyphs: boolean): HTMLElement {
  const glyph = glyphs && a.place.glyph ? a.place.glyph + " " : "";
  if (a.command?.he === "סימון") return highlightControl(glyph + faceLabel(a));
  const edge = alignEdgeOf(a.command?.he);
  return el(
    "button",
    {
      class: "tb-btn ribbon-btn" + (edge ? " tb-align-btn" : ""),
      type: "button",
      "data-action": a.id,
      ...(a.command ? { "data-command": a.command.he } : {}),
      ...(edge ? { "data-align": edge, "aria-pressed": "false" } : {}),
      title: faceTitle(a),
      onClick: () => runPlaced(a),
    },
    [glyph + faceLabel(a)],
  );
}

/** The words a missing face would have had: its short label, else its name. */
function missingLabel(key: string): string {
  return hasKey("btn." + key) ? t("btn." + key) : key.replace(/_/g, " ");
}

/** The alignment faces in screen order (#136); every other face keeps its place after them. */
function screenOrder(face: readonly PlacedAction[]): PlacedAction[] {
  const rank = (a: PlacedAction) => {
    const edge = alignEdgeOf(a.command?.he);
    return edge ? ALIGN_ORDER.indexOf(edge) : ALIGN_ORDER.length;
  };
  return [...face].sort((x, y) => rank(x) - rank(y));
}

/** One group: caption, face, `⋯`, `⚙`. */
function groupBox(g: TabGroup, glyphs: boolean): HTMLElement {
  const name = groupName(g);
  const aligns = g.face.some((a) => alignEdgeOf(a.command?.he));
  const controls: HTMLElement[] = [
    // The paragraph-style dropdown: what every word processor's Styles group
    // opens with — body text, the nine levels, this document's styles, and new.
    ...(g.group === "styles" ? [paragraphStyleControl()] : []),
    ...(aligns ? screenOrder(g.face) : g.face).map((a) => faceButton(a, glyphs)),
    ...g.missing.map((k) => missingControl(missingLabel(k), k)),
  ];
  if (g.more.length) {
    controls.push(
      lazyMenu("more-" + g.group, "⋯", () => {
        const h = here();
        return g.more.map((a) => row(a, h));
      }, tf("ribbonMore", name)),
    );
  }
  if (g.gear.length) {
    controls.push(
      lazyMenu("gear-" + g.group, "⚙", () => {
        const h = here();
        return g.gear.map((a) => row(a, h));
      }, tf("ribbonGear", name)),
    );
  }
  // `tb-align` pins the row left-to-right in `styles.css`; the caption keeps the interface's direction.
  const cls = "tb-group ribbon-group" + (aligns ? " tb-align" : "");
  return el("div", { class: cls, role: "group", "aria-label": name, "data-group": g.group }, [
    el("div", { class: "tb-group-row" }, controls),
    el("span", { class: "tb-group-label", "aria-hidden": "true" }, [name]),
  ]);
}

/**
 * Right-click on a face is the quick path of §8: move it, remove it, or open
 * the dialog there. One handler on the surface rather than one per button, and
 * `tab` is asked at the click, because the panel's tab changes under it.
 */
function faceMenu(tab: () => string | undefined): (e: MouseEvent) => void {
  return (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-action]");
    const action = b?.getAttribute("data-action");
    const group = b?.closest?.("[data-group]")?.getAttribute("data-group");
    const on = tab();
    if (!action || !group || !on || currentPlaced().find((a) => a.id === action)?.kind === "style") return;
    e.preventDefault();
    buttonMenu(on, group, action, e.clientX, e.clientY);
  };
}

/** The next tab for an arrow key, along the interface's flow (§9): in Hebrew ← is forward. */
export function stepTab(tabs: readonly string[], from: string, key: string, rtl: boolean): string | null {
  const i = tabs.indexOf(from);
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return tabs[(i + 1) % tabs.length];
  if (key === back) return tabs[(i - 1 + tabs.length) % tabs.length];
  if (key === "Home") return tabs[0];
  if (key === "End") return tabs[tabs.length - 1];
  return null;
}

/**
 * The strip and the open tab's panel, as one element.
 *
 * A `tablist` with roving focus: one tab is in the tab order, the arrows move
 * along the flow and open as they go, which is the ARIA pattern a screen-reader
 * user already knows. Choosing a tab redraws only the panel.
 */
export function buildRibbon(): HTMLElement {
  const glyphs = readShell(settings.shell).labels === "names+glyphs";
  const tree = shown().filter((n) => !n.hidden && n.groups.length);
  const ids = tree.map((n) => n.tab);
  if (!ids.includes(openTab)) openTab = ids[0] ?? "home";

  const panel = el("div", { class: "ribbon-panel", role: "tabpanel", id: "ribbon-panel", onContextmenu: faceMenu(() => openTab) });
  const buttons = new Map<string, HTMLElement>();

  const show = (tab: string) => {
    openTab = tab;
    const marked = context ? tabFor(tree, context)?.tab : undefined;
    for (const [id, b] of buttons) {
      b.setAttribute("aria-selected", String(id === tab));
      b.setAttribute("tabindex", id === tab ? "0" : "-1");
      b.setAttribute("data-contextual", String(id === marked));
    }
    panel.setAttribute("aria-labelledby", "ribbon-tab-" + tab);
    panel.replaceChildren(...(tree.find((n) => n.tab === tab)?.groups ?? []).map((g) => groupBox(g, glyphs)));
  };

  for (const n of tree) {
    buttons.set(
      n.tab,
      el(
        "button",
        {
          class: "ribbon-tab",
          type: "button",
          role: "tab",
          id: "ribbon-tab-" + n.tab,
          "data-tab": n.tab,
          "aria-controls": "ribbon-panel",
          onClick: () => show(n.tab),
          onContextmenu: (e: MouseEvent) => {
            e.preventDefault();
            tabMenu(n.tab, e.clientX, e.clientY);
          },
          onKeydown: (e: KeyboardEvent) => {
            const next = stepTab(ids, openTab, e.key, isRtlUi());
            if (!next) return;
            e.preventDefault();
            show(next);
            buttons.get(next)?.focus?.();
          },
        },
        [tabName(n)],
      ),
    );
  }
  show(openTab);
  showTab = (tab) => {
    if (buttons.has(tab)) show(tab);
  };
  return el("div", { class: "ribbon", "data-ribbon": "tabs" }, [
    el("div", { class: "ribbon-tabs", role: "tablist", "aria-label": t("ribbonTabs") }, [...buttons.values()]),
    panel,
    // A narrow window folds the strip into `☰` rather than scroll it sideways (§8), and says so.
    el("p", { class: "ribbon-narrow", role: "note" }, [t("rcNarrow")]),
  ]);
}

/**
 * The *toolbar* shell: one tab, pinned, with no strip above it (§6) — Home, unless
 * `shell.toolbarTab` names another. The same renderer as the tabs, so the
 * toolbar is the placements too and nothing in it is laid out by hand.
 *
 * No commands at all is not a state this product can be in, and drawing a
 * shorter toolbar would present it as one. It is said in words instead, in the
 * surface the writer is looking at.
 */
export function buildPinnedTab(): HTMLElement {
  const shell = readShell(settings.shell);
  const attrs = { class: "toolbar", role: "toolbar", "aria-label": t("toolbar") };
  if (runtime.commandsReg.length === 0) {
    return el("div", { ...attrs, class: "toolbar toolbar-empty" }, [
      el("span", { class: "toolbar-failed", role: "status" }, [t("registriesFailed")]),
    ]);
  }
  const tree = shown();
  const node = tabFor(tree, shell.toolbarTab) ?? tabFor(tree, "home") ?? tree[0];
  const glyphs = shell.labels === "names+glyphs";
  return el(
    "div",
    { ...attrs, class: "toolbar ribbon-pinned", "data-tab": node?.tab ?? "home", onContextmenu: faceMenu(() => node?.tab) },
    (node?.groups ?? []).map((g) => groupBox(g, glyphs)),
  );
}

/**
 * `☰ תפריט`: the menu bar, folded (§6). It always has its name, and it opens the
 * same menus the bar holds — so the floor is one press away under every ribbon.
 */
export function menuToggle(menubar: HTMLElement): HTMLElement {
  let open = false;
  const btn = el(
    "button",
    {
      class: "menu-btn shell-menu-btn",
      type: "button",
      "aria-expanded": "false",
      "aria-controls": "shell-menubar",
      onClick: () => {
        open = !open;
        btn.setAttribute("aria-expanded", String(open));
        menubar.setAttribute("data-folded", open ? "open" : "folded");
      },
    },
    [t("shellMenuButton")],
  );
  return btn;
}

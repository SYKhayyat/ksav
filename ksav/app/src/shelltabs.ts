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
import { settings } from "./settings";
import { readShell } from "./shellsettings";
import { lazyMenu } from "./ribbon";
import { actionName } from "./actions";
import { savedNameMap } from "./macros";
import { hintFor } from "./keyhint";
import { btnKey, tabTree, type PlacedAction, type TabGroup, type TabId, type TabNode } from "./placement";
import { currentPlaced, here, row, runPlaced, shellLabel } from "./shellmenu";

/**
 * The open tab. Session state, not a setting: the strip opens where the writer
 * left it across a redraw (a language switch, a theme), and on Home after a
 * reload — which is where a word processor opens.
 */
let openTab: TabId = "home";

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

function faceButton(a: PlacedAction, glyphs: boolean): HTMLElement {
  const glyph = glyphs && a.place.glyph ? a.place.glyph + " " : "";
  return el(
    "button",
    {
      class: "tb-btn ribbon-btn",
      type: "button",
      "data-action": a.id,
      ...(a.command ? { "data-command": a.command.he } : {}),
      title: faceTitle(a),
      onClick: () => runPlaced(a),
    },
    [glyph + faceLabel(a)],
  );
}

/** One group: caption, face, `⋯`, `⚙`. */
function groupBox(g: TabGroup, glyphs: boolean): HTMLElement {
  const name = t("grp." + g.group);
  const controls: HTMLElement[] = g.face.map((a) => faceButton(a, glyphs));
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
  return el("div", { class: "tb-group ribbon-group", role: "group", "aria-label": name, "data-group": g.group }, [
    el("div", { class: "tb-group-row" }, controls),
    el("span", { class: "tb-group-label", "aria-hidden": "true" }, [name]),
  ]);
}

/** The next tab for an arrow key, along the interface's flow (§9): in Hebrew ← is forward. */
export function stepTab(tabs: readonly TabId[], from: TabId, key: string, rtl: boolean): TabId | null {
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
  const tree: TabNode[] = tabTree(currentPlaced()).filter((n) => n.groups.length);
  const ids = tree.map((n) => n.tab);
  if (!ids.includes(openTab)) openTab = ids[0] ?? "home";

  const panel = el("div", { class: "ribbon-panel", role: "tabpanel", id: "ribbon-panel" });
  const buttons = new Map<TabId, HTMLElement>();

  const show = (tab: TabId) => {
    openTab = tab;
    for (const [id, b] of buttons) {
      b.setAttribute("aria-selected", String(id === tab));
      b.setAttribute("tabindex", id === tab ? "0" : "-1");
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
          onKeydown: (e: KeyboardEvent) => {
            const next = stepTab(ids, openTab, e.key, isRtlUi());
            if (!next) return;
            e.preventDefault();
            show(next);
            buttons.get(next)?.focus?.();
          },
        },
        [t("tab." + n.tab)],
      ),
    );
  }
  show(openTab);
  return el("div", { class: "ribbon", "data-ribbon": "tabs" }, [
    el("div", { class: "ribbon-tabs", role: "tablist", "aria-label": t("ribbonTabs") }, [...buttons.values()]),
    panel,
  ]);
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

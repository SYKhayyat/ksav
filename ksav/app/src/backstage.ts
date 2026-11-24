// File is a backstage (#233, `docs/ui-architecture.md` §6).
//
// `קובץ` is not a tab: it opens a full-window page over the document, a column
// of sections on the start side and the chosen section's page beside it —
// Word's shape. The sections are `placement.backstageTree`, built from the File
// and Documents groups and their extras, so a command placed in File is here
// without a line of layout; this file only draws the tree.
//
// Two things make it a page and not a menu. It is a registered panel (`PANELS`
// in `panels.ts`), so Escape closes it by existing, and its `←` is `panelHead`'s
// way out like every ×. And leaving it puts the writer back where they were:
// the editor keeps its selection while the page covers it, so focusing the
// editor again is the caret coming back.

import * as runtime from "./runtime";
import { el } from "./dom";
import { icon, UI_ICONS } from "./icons";
import { t } from "./i18n";
import { closeMenus, closePanel, mountPanel, openPanel, panelHead, wirePanel } from "./panels";
import { backstageTree, type BackstageId } from "./placement";
import { currentPlaced, extraRows, here, row, type MenuExtraRenderers } from "./shellmenu";
import { buildAbout } from "./about";

/** The column's icon for each section. */
const SECTION_ICON: Readonly<Record<BackstageId, string>> = {
  new: UI_ICONS.fileNew,
  open: UI_ICONS.fileOpen,
  save: UI_ICONS.fileSave,
  share: UI_ICONS.fileShare,
  export: UI_ICONS.fileExport,
  print: UI_ICONS.filePrint,
  versions: UI_ICONS.fileVersions,
  settings: UI_ICONS.settings,
  about: UI_ICONS.info,
};

/** The section a bare open lands on: the documents, as Word's lands on Home's recents. */
const FIRST: BackstageId = "open";

let renderers: MenuExtraRenderers | null = null;
let current: BackstageId = FIRST;

/** A section's page: its rows, or the About text. */
function page(section: BackstageId, r: MenuExtraRenderers): (Node | string)[] {
  if (section === "about") return buildAbout();
  const node = backstageTree(currentPlaced()).find((n) => n.section === section)!;
  const h = here();
  return [
    ...node.before.flatMap((x) => extraRows(x, r)),
    el("div", { class: "backstage-rows", "data-rows": section }, node.items.map((a) => row(a, h))),
    ...node.after.flatMap((x) => extraRows(x, r)),
  ];
}

/** The sections the column lists: every one with something on it, and Settings and About always. */
function sections(): BackstageId[] {
  return backstageTree(currentPlaced())
    .filter((n) => n.section === "settings" || n.section === "about" || n.items.length || n.before.length || n.after.length)
    .map((n) => n.section);
}

function draw(r: MenuExtraRenderers): HTMLElement {
  const list = sections();
  if (!list.includes(current)) current = FIRST;
  const pageBox = el("section", {
    class: "backstage-page",
    role: "tabpanel",
    id: "backstage-page",
    "aria-labelledby": "backstage-tab-" + current,
    "data-section": current,
  }, [el("h2", {}, [t("bs." + current)]), ...page(current, r)]);
  // Anything on the page that acts leaves the page first — before its own
  // handler, so a dialog the action opens is the one that ends up with focus.
  // What edits the page in place (×, ⌄, the pages box) stays.
  pageBox.addEventListener(
    "click",
    (e) => {
      const b = (e.target as Element | null)?.closest("button");
      if (b && !b.hasAttribute("disabled") && (b.classList.contains("menu-item") || b.classList.contains("menu-newtab"))) {
        closePanel("backstage");
      }
    },
    true,
  );

  const tabs = list.map((s) =>
    el(
      "button",
      {
        class: "backstage-tab" + (s === "settings" ? " backstage-tab-end" : ""),
        type: "button",
        role: "tab",
        id: "backstage-tab-" + s,
        "data-section": s,
        // A narrow window draws the icon alone; the name stays.
        "aria-label": t("bs." + s),
        title: t("bs." + s),
        "aria-selected": String(s === current),
        "aria-controls": "backstage-page",
        tabindex: s === current ? "0" : "-1",
        onClick: () => choose(s),
      },
      [icon(SECTION_ICON[s], 20), el("span", {}, [t("bs." + s)])],
    ),
  );
  const column = el("nav", { class: "backstage-nav", "aria-label": t("menu.file") }, [
    panelHead("backstage", "menu.file", { cls: "backstage-head", back: icon(UI_ICONS.back, 20) }),
    el(
      "div",
      {
        class: "backstage-tabs",
        role: "tablist",
        "aria-orientation": "vertical",
        // Up and down walk the column, Home and End jump, as the ribbon's tabs do across.
        onKeydown: (e: KeyboardEvent) => {
          const at = list.indexOf(current);
          const to =
            e.key === "ArrowDown" ? list[(at + 1) % list.length]
            : e.key === "ArrowUp" ? list[(at - 1 + list.length) % list.length]
            : e.key === "Home" ? list[0]
            : e.key === "End" ? list[list.length - 1]
            : undefined;
          if (!to) return;
          e.preventDefault();
          choose(to);
        },
      },
      tabs,
    ),
  ]);
  return el("div", { class: "backstage", id: "backstage", role: "dialog", "aria-modal": "true", "aria-label": t("menu.file") }, [
    column,
    pageBox,
  ]);
}

/** Show a section. Settings is not a page: it is the settings drawer, over the document. */
function choose(s: BackstageId): void {
  if (s === "settings") {
    closePanel("backstage");
    openPanel("settings-drawer");
    return;
  }
  current = s;
  redraw();
  document.getElementById("backstage-tab-" + s)?.focus();
}

function redraw(): void {
  const old = document.getElementById("backstage");
  if (old && renderers) old.replaceWith(draw(renderers));
}

/** Open File, on `section` or the documents. The header hands it the menus' renderers. */
export function openBackstage(r: MenuExtraRenderers, section: BackstageId = FIRST): void {
  renderers = r;
  current = section;
  closeMenus();
  wirePanel("backstage", {
    open: () => document.getElementById("backstage-tab-" + current)?.focus(),
    // Back to the document: the editor kept its selection, so focus is the caret
    // coming back. Unless what was chosen already moved focus — a dialog it opened.
    close: () => {
      const a = document.activeElement;
      if (!a || a === document.body) runtime.view?.focus();
    },
    // A language flip, or a document deleted from the list, redraws the page.
    rebuild: redraw,
  });
  mountPanel("backstage", draw(r), document.getElementById("app") ?? document.body);
}

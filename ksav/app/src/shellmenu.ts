// The menu bar, drawn from the placements (#233, step 2).
//
// Every menu used to be a hand-written list in `ribbon.ts`, and the lists were
// the taxonomy: which menu held a thing was whichever builder someone had added
// it to. `placement.ts` is now the statement of where each action lives, and
// this file only draws it — one `lazyMenu` per `MENUS` entry, one heading per
// group, one row per placed action, plus the named rows that are not actions
// (`MENU_EXTRAS`: the document lists, the templates, the page box).
//
// Each row keeps what the old menus taught: it prints the live key, it is greyed
// *with its reason on screen* where the caret cannot take it, and it is rebuilt
// on every open so the reason is about this caret. A row is `data-action=<id>`,
// which is the identity anything outside this file (the acceptance run) uses.
//
// The DOM half of `placement.ts`: this reads the four sources off the running
// application, so the pure module never has to.

import * as runtime from "./runtime";
import * as structure from "./structure";
import * as heads from "./headings";
import * as notes from "./notes";
import * as macros from "./macros";
import * as styles from "./styles";
import * as docs from "./docs";
import * as opendocs from "./opendocs";
import * as tabstrip from "./tabstrip";
import * as files from "./files";
import * as exports from "./exports";
import * as pagerange from "./pagerange";
import { EXPORTS, saveAsLabel } from "./header";
import { getLang, t, hasKey } from "./i18n";
import { el, glyphBtn } from "./dom";
import { icon } from "./icons";
import { closeMenus } from "./panels";
import { keybindings, hintFor } from "./keyhint";
import { actionName } from "./actions";
import { askText } from "./formmodal";
import { docLang, insertSnippet } from "./insert";
import { closeOpenDoc, removeDoc } from "./docswitch";
import { savedMacros, playMacro, deleteMacro, currentRecording, savedNameMap } from "./macros";
import { legalAt } from "./mode";
import { voidAction } from "./asyncaction";
import { BUILT_IN, runAction } from "./actionsurface";
import { chromeWiring, contentsDepthRow, docTextNow, keyCode, lazyMenu } from "./ribbon";
import { menuTree, placed, type MenuExtra, type PlacedAction } from "./placement";

/** Every placed action, read off the running application. */
export function currentPlaced(): PlacedAction[] {
  return placed({
    builtIns: BUILT_IN.map((a) => a.id),
    commands: runtime.commandsReg,
    macros: savedMacros().map((m) => ({ id: macros.actionIdOf(m), name: m.name })),
    styles: runtime.view
      ? styles.findCustomStyles(docTextNow()).map((s) => ({ id: styles.styleActionId(s.name), name: s.name }))
      : [],
  });
}

/** The extras a menu draws that need something only the header has. */
export interface MenuExtraRenderers {
  pages: () => (Node | string)[];
  templates: () => (Node | string)[];
}

/** What the caret is standing in, read once per menu open. */
export interface Here {
  doc: string;
  pos: number;
  /** The structure the caret is near, for the structural actions' reasons. */
  structPos: number;
  kb: Record<string, string>;
}

export function here(): Here {
  const doc = docTextNow();
  const pos = runtime.view?.state.selection.main.from ?? 0;
  const caret = runtime.view?.state.selection.main.head ?? 0;
  return { doc, pos, structPos: structure.structureNear(doc, caret)?.pos ?? caret, kb: keybindings() };
}

/**
 * Why this row cannot act here, or `null`.
 *
 * One function for every rule the old menus spelled one at a time: the
 * structural actions ask `structure.whyNot`, a command (or the door to one)
 * asks the grid, a note on a note needs a note, the contents exists once, and
 * an export route says when it cannot honour a page range.
 */
function whyNot(a: PlacedAction, h: Here): string | null {
  const act = structure.actionById(a.id);
  if (act) return structure.whyNot(act, h.doc, h.structPos);
  if (a.id === "tieredNote" && notes.noteDepthAt(h.doc, h.pos) <= 0) return "whyNoteOnNoteNeedsANote";
  if (a.id === "toc" && !heads.canAddContents(h.doc)) return "why.contentsAlready";
  if (a.command) {
    const legality = legalAt(h.doc, h.pos, a.command.he);
    if (!legality.ok) return legality.reason!;
  }
  if ((EXPORTS as readonly string[]).includes(a.id) && exports.pagesSpec().spans) return pagerange.whyNoRange(a.id);
  return null;
}

/** A shell action's label, with the two that read differently by circumstance. */
export function shellLabel(a: PlacedAction): string {
  if (a.id === "saveAs") return saveAsLabel(files.supportsRealFiles());
  if (a.id === "macroRecord" && currentRecording()) return t("macroStop");
  return actionName(a.id, savedNameMap());
}

/** Run a placed action, the one way every surface does: a command inserts, a structure action goes through the chrome, anything else is `runAction`. */
export function runPlaced(a: PlacedAction): void {
  closeMenus();
  if (a.kind === "command") {
    insertSnippet(a.command!.insert);
    return;
  }
  const act = structure.actionById(a.id);
  if (act) {
    chromeWiring().runStructureAction(act, true);
    return;
  }
  runAction(a.id);
}

/** One row: a placed action. The tabs' `⋯` and `⚙` lists are these rows too. */
export function row(a: PlacedAction, h: Here): HTMLElement {
  const why = whyNot(a, h);
  const attrs: Record<string, string | null> = {
    class: "menu-item" + (a.command ? " menu-cmd" : "") + (why ? " disabled" : ""),
    "data-action": a.id,
    disabled: why ? "true" : null,
    title: why ? t(why) : "",
  };
  // The export rows keep the attribute the acceptance run has always clicked.
  if ((EXPORTS as readonly string[]).includes(a.id)) attrs["data-export"] = a.id;
  const gear = a.gear ? "⚙ " : "";
  let body: (Node | string)[];
  if (a.kind === "command") {
    const c = a.command!;
    body = [
      el("b", {}, [gear + (getLang() === "he" ? c.desc_he : c.desc_en)]),
      // The name the writer will find in their own source, in the document's
      // language rather than the menu's.
      el("code", {}, ["#" + (docLang() === "he" ? c.he : c.en)]),
    ];
  } else {
    body = [...(a.place.icon ? [icon(a.place.icon, 16)] : []), el("b", {}, [gear + shellLabel(a)]), keyCode(a.id, h.kb, "menu-key")];
    if (a.kind === "macro") {
      const m = savedMacros().find((x) => macros.actionIdOf(x) === a.id);
      if (m) body.push(el("span", { class: "menu-desc" }, [macros.describe(m, (id) => actionName(id, savedNameMap()))]));
    } else if (hasKey(a.id + "Lede")) {
      body.push(el("span", { class: "menu-desc" }, [t(a.id + "Lede")]));
    }
  }
  if (why) body.push(el("span", { class: "menu-why" }, [t(why)]));
  const btn = el("button", { ...attrs, onClick: () => runPlaced(a) }, body);
  return a.kind === "macro" ? macroRow(a, btn) : btn;
}

/** A saved macro: play it, play it n times, or delete it. */
function macroRow(a: PlacedAction, btn: HTMLElement): HTMLElement {
  const m = savedMacros().find((x) => macros.actionIdOf(x) === a.id)!;
  btn.classList.add("menu-item-main");
  return el("div", { class: "menu-item-row" }, [
    btn,
    // Repeat, which is the reason a macro exists: the writer did the thing
    // once and has eleven more to go.
    el("button", {
      class: "menu-del",
      title: t("macroRepeat"),
      onClick: async (e: Event) => {
        e.stopPropagation();
        const n = parseInt((await askText(t("macroRepeatPrompt"), "10")) ?? "", 10);
        if (Number.isFinite(n) && n > 0) {
          closeMenus();
          playMacro(m, Math.min(n, 500));
        }
      },
    }, ["×n"]),
    el("button", {
      class: "menu-del",
      title: t("delete"),
      "aria-label": t("delete"),
      onClick: (e: Event) => {
        e.stopPropagation();
        deleteMacro(m.id);
      },
    }, ["×"]),
  ]);
}

/** A document row, open or in the library. */
function docRow(id: string, title: string, desc: string, mark: string, active: boolean, last: HTMLElement): HTMLElement {
  return el("div", { class: "menu-item-row" }, [
    el(
      "button",
      {
        class: "menu-item menu-item-main" + (active ? " active" : ""),
        // Which document this row switches to. The title is not an identity:
        // two documents may share one, and it is translated besides.
        "data-doc": id,
        onClick: () => {
          closeMenus();
          voidAction("save_file", () => tabstrip.enterDoc(id));
        },
      },
      [el("b", {}, [mark + title]), el("span", { class: "menu-desc" }, [desc])],
    ),
    // `⧉` opens a second window and destroys nothing, `⌄` puts a document away
    // and destroys nothing, `×` destroys it. Three amounts of destruction, so
    // three glyphs — and a legend drawn with them (#128).
    glyphBtn(
      "⧉",
      t("openInNewTab"),
      (e: Event) => {
        e.stopPropagation();
        voidAction("save_file", () => tabstrip.openInNewTab(id));
      },
      "menu-newtab",
    ),
    last,
  ]);
}

/** The rows that are not actions. */
export function extraRows(x: MenuExtra, r: MenuExtraRenderers): (Node | string)[] {
  switch (x) {
    case "pages":
      return r.pages();
    case "templates":
      return r.templates();
    case "contentsDepth":
      return [contentsDepthRow()];
    case "macroNone":
      return savedMacros().length ? [] : [el("div", { class: "menu-desc", style: "padding: 6px 9px" }, [t("macroNone")])];
    case "docsLegend":
      return [el("div", { class: "menu-legend", "data-glyph-legend": "docs" }, [t("rowGlyphLegend")])];
    case "openDocs": {
      // The open set, most recently focused first — the switcher's order. Two
      // lists because they are two facts: what this session holds, and what
      // exists.
      const open = opendocs.openDocs();
      if (open.length <= 1) return [];
      const out: (Node | string)[] = [
        el("div", { class: "menu-sep" }),
        el("div", { class: "menu-cat" }, [`${t("openDocs")} · ${hintFor("switcher")}`]),
      ];
      for (const entry of open) {
        const meta = docs.library().find((e) => e.id === entry.id);
        if (!meta) continue;
        const isHere = entry.id === opendocs.focusedId();
        out.push(
          docRow(
            entry.id,
            meta.title,
            meta.fileName ?? "",
            isHere ? "● " : "",
            isHere,
            glyphBtn(
              "⌄",
              t("closeDoc"),
              (e: Event) => {
                e.stopPropagation();
                voidAction("save_file", () => closeOpenDoc(entry.id));
              },
              "menu-close",
            ),
          ),
        );
      }
      return out;
    }
    case "library": {
      const out: (Node | string)[] = [el("div", { class: "menu-sep" }), el("div", { class: "menu-cat" }, [t("library")])];
      for (const entry of docs.library()) {
        const isHere = entry.id === opendocs.focusedId();
        out.push(
          docRow(
            entry.id,
            entry.title,
            [entry.fileName, new Date(entry.updated).toLocaleString()].filter(Boolean).join(" · "),
            isHere ? "● " : opendocs.isOpen(entry.id) ? "◦ " : "",
            isHere,
            el("button", {
              class: "menu-del",
              title: t("delete"),
              "aria-label": t("delete"),
              onClick: (e: Event) => {
                e.stopPropagation();
                voidAction("save_file", () => removeDoc(entry.id));
              },
            }, ["×"]),
          ),
        );
      }
      return out;
    }
  }
}

/** One menu's rows, built on open. */
function menuItems(menu: string, r: MenuExtraRenderers): (Node | string)[] {
  const h = here();
  const node = menuTree(currentPlaced()).find((m) => m.menu === menu)!;
  const out: (Node | string)[] = [];
  node.groups.forEach((g, i) => {
    if (i) out.push(el("div", { class: "menu-sep" }));
    out.push(el("div", { class: "menu-cat", "data-group": g.group }, [t("grp." + g.group)]));
    for (const x of g.before) out.push(...extraRows(x, r));
    for (const a of g.items) out.push(row(a, h));
    for (const x of g.after) out.push(...extraRows(x, r));
  });
  return out;
}

/** The menu bar: every menu, in `MENUS` order. */
export function buildMenus(r: MenuExtraRenderers): HTMLElement[] {
  return menuTree([]).map(({ menu }) => lazyMenu(menu, t("menu." + menu), () => menuItems(menu, r)));
}

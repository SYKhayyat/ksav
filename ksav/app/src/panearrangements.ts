// Arrangements of one's own: the six shipped shapes, the picker, and the
// writer's own saved ones beside them.
// Owns: `openArrangements` and its rows, saving an arrangement under a name,
// fresh-id minting on the way back in, the swap rows and the page view.
// Defers: the tree and the current pane to `panestate`; the swap and the
// second tab to `panedrag` and `tabstrip`; storage to `settings`.
// Refuses: deciding what an arrangement is — that is `panes.ARRANGEMENTS`,
// and this module only lists and applies.

import * as panestate from "./panestate";
import * as panedrag from "./panedrag";
import * as tabstrip from "./tabstrip";
import * as panes from "./panes";
import { settings, saveSettings } from "./settings";
import { t, tf } from "./i18n";
import { el, glyphBtn } from "./dom";
import { openPanel, closePanel } from "./panels";
import { hintFor } from "./keyhint";
import { rerenderChrome, setStatus } from "./runtime";

// ------------------------------------------------- arrangements of one's own
//
// The shipped six are the common shapes. What they cannot be is *the one this
// writer built* — gemara in one pane, their kuntres in another, the printed page
// underneath — and an arrangement that takes four gestures to build and is gone
// at the next restart is one nobody builds twice.
//
// Stored as the tree itself, with fresh ids minted on the way back in. Two tabs
// opened from one saved arrangement must not share pane ids: `paneplaces` is
// keyed by pane id, and two panes claiming to be the same one would each be
// standing where the other left off.

interface SavedArrangement {
  id: string;
  name: string;
  tree: panes.PaneNode;
}

/** The writer's own arrangements, as storage has them. */
function savedArrangements(): SavedArrangement[] {
  const raw = settings.savedArrangements;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is SavedArrangement =>
      !!a && typeof a === "object" && typeof (a as SavedArrangement).name === "string" && !!(a as SavedArrangement).tree?.kind,
  );
}

/**
 * Every pane id in a tree replaced with a new one.
 *
 * Not an optimisation and not tidiness: pane ids key `paneplaces`, the table of
 * where each pane was standing in each document, and the renderer decides which
 * editors it may leave alone by comparing leaves. A saved tree used twice with
 * its stored ids would give two live panes one identity, and they would fight
 * over one remembered place.
 */
function withFreshIds(node: panes.PaneNode): panes.PaneNode {
  if (node.kind === "leaf") return { ...node, id: panes.paneId() };
  return { ...node, id: panes.paneId(), a: withFreshIds(node.a), b: withFreshIds(node.b) };
}

/** Keep the window as it stands now, under a name. */
export async function saveArrangementHere() {
  const name = (await panestate.paneWiring().askText(t("arrangementName"), ""))?.trim();
  if (!name) return;
  const list = savedArrangements();
  // A name used twice replaces, rather than making two rows a writer cannot
  // tell apart. Saving over one is what somebody typing the same name means.
  const kept: SavedArrangement = { id: `sa${Date.now().toString(36)}`, name, tree: withFreshIds(panestate.paneTree) };
  const at = list.findIndex((a) => a.name === name);
  if (at >= 0) list[at] = { ...kept, id: list[at].id };
  else list.push(kept);
  settings.savedArrangements = list;
  saveSettings();
  setStatus(tf("arrangementSaved", name), "ok");
}

/** The writer's own arrangements, as rows in the picker. */
function savedArrangementRows(): Node[] {
  const mine = savedArrangements();
  if (!mine.length) return [];
  return [
    el("div", { class: "menu-cat" }, [t("myArrangements")]),
    ...mine.map((a) =>
      el("div", { class: "pal-row" }, [
        el("button", {
          class: "pal-item",
          "data-saved-arrangement": a.name,
          onClick: () => {
            closePanel("arrangement");
            settings.pageView = false;
            applyPageView();
            panestate.setTree(withFreshIds(a.tree));
            rerenderChrome();
          },
        }, [el("b", {}, [a.name])]),
        glyphBtn(
          "×",
          t("forgetArrangement"),
          () => {
            settings.savedArrangements = savedArrangements().filter((x) => x.id !== a.id);
            saveSettings();
            openArrangements();
          },
          "pal-x",
        ),
      ]),
    ),
    el("div", { class: "menu-sep" }),
  ];
}

/**
 * The arrangements this application ships, as a list to choose from.
 *
 * A **picker**, and that is the whole of what replaced the two chips that used
 * to cycle. Every option is on screen at once with the one you are in marked, so
 * choosing costs one press and choosing wrong costs one more — where a cycle of
 * four cost up to seven and never showed you what you were choosing between.
 *
 * The page view sits in the same list, because from a writer's side it is the
 * same kind of choice: what the window looks like. It is not an arrangement
 * underneath — it is a source pane dressed as a sheet of paper — and keeping
 * that distinction in the code while hiding it in the interface is the right way
 * round.
 */
export function openArrangements() {
  const here = panes.arrangementOf(panestate.paneTree);
  const list = document.getElementById("arrangement-list")!;
  list.replaceChildren(
    el("div", { class: "menu-cat" }, [t("arrangement")]),
    ...panes.ARRANGEMENTS.map((a) =>
      el(
        "button",
        {
          class: "pal-item" + (a.id === here && !settings.pageView ? " active" : ""),
          onClick: () => {
            closePanel("arrangement");
            settings.pageView = false;
            applyPageView();
            panestate.setTree(a.build());
            rerenderChrome();
          },
        },
        [
          el("b", {}, [(a.id === here && !settings.pageView ? "● " : "") + t("arr." + a.id)]),
          el("span", { class: "menu-desc" }, [t("arrDesc." + a.id)]),
        ],
      ),
    ),
    el("div", { class: "menu-sep" }),
    ...savedArrangementRows(),
    // Keeping the window as it stands, beside the list it will appear in.
    el(
      "button",
      {
        class: "pal-item",
        "data-save-arrangement": "",
        onClick: () => {
          closePanel("arrangement");
          saveArrangementHere();
        },
      },
      [
        el("b", {}, [t("saveArrangement")]),
        el("span", { class: "menu-desc" }, [t("saveArrangementDesc")]),
      ],
    ),
    el("div", { class: "menu-sep" }),
    // Swapping, where the arrangements are — because "which pane is on which
    // side" is the same question as "what does the window look like", and a
    // writer who wants the preview on the other side comes here to look for it.
    //
    // The rows are the four commands themselves, each printing its own key, so
    // this is a place to *discover* the keyboard rather than a second interface
    // that has to be kept in step with it. Only with something to swap: at one
    // pane the whole section would be four rows that do nothing.
    ...(panes.leaves(panestate.paneTree).length > 1 ? swapRows() : []),
    // **The route to a second arrangement that is not inside the tab strip.**
    //
    // The strip hides itself at one tab, which is right — a row of chrome
    // showing a single tab says nothing — but the `+` lives in the strip, so
    // with the strip hidden there would be no way to make a second arrangement
    // at all. The record is explicit that the strip "must never be the only
    // route in"; this is the other one, and `newTab` is bound to a key besides.
    el(
      "button",
      {
        class: "pal-item",
        onClick: () => {
          closePanel("arrangement");
          tabstrip.newTab();
        },
      },
      [el("b", {}, [t("newTab")]), el("span", { class: "menu-desc" }, [t("newTabDesc")])],
    ),
    el("div", { class: "menu-sep" }),
    el(
      "button",
      {
        class: "pal-item" + (settings.pageView ? " active" : ""),
        onClick: () => {
          closePanel("arrangement");
          settings.pageView = true;
          applyPageView();
          panestate.setTree(panes.ARRANGEMENTS.find((a) => a.id === "sourceOnly")!.build());
          rerenderChrome();
        },
      },
      [
        el("b", {}, [(settings.pageView ? "● " : "") + t("arr.page")]),
        el("span", { class: "menu-desc" }, [t("arrDesc.page")]),
      ],
    ),
  );
  openPanel("arrangement");
}

/**
 * The four swap commands, as rows in the arrangement panel.
 *
 * A row is greyed when there is no pane on that side, and it is greyed rather
 * than dropped: a list whose length changes as the caret moves between panes is
 * a list nobody can learn. Which side is which is read through `paneLayout`, so
 * in Hebrew "left" is the pane on the left of the screen.
 */
function swapRows(): Node[] {
  const here = panestate.currentPane();
  const layout = panestate.paneLayout();
  const SIDES: [panes.Side, string][] = [
    ["left", "side.left"],
    ["right", "side.right"],
    ["up", "side.top"],
    ["down", "side.bottom"],
  ];
  return [
    el("div", { class: "menu-cat" }, [t("swapPanes")]),
    el("div", { class: "menu-desc" }, [t("swapPanesDesc")]),
    ...SIDES.map(([side, label]) => {
      const there = here ? panes.neighbor(panestate.paneTree, here, side, layout) : undefined;
      return el(
        "button",
        {
          class: "pal-item",
          disabled: there ? undefined : "",
          "data-swap": side,
          onClick: () => {
            closePanel("arrangement");
            panedrag.swapPaneToward(side);
          },
        },
        [
          el("b", {}, [t(label)]),
          el("span", { class: "menu-desc" }, [hintFor(`pane.swap${side[0].toUpperCase()}${side.slice(1)}`)]),
        ],
      );
    }),
    el("div", { class: "menu-sep" }),
  ];
}

/** Dress the source pane as a sheet of paper, or stop. */
export function applyPageView() {
  const app = document.getElementById("app")!;
  if (settings.pageView) app.dataset.page = "1";
  else delete app.dataset.page;
  saveSettings();
}

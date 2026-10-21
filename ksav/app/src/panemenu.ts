// ------------------------------------------------------------- the pane menu
// Everything a pane can do that is not worth a glyph in its strip.
// Owns: the `⋯` menu — swap by pane number, move to an edge, move to another
// tab, save this arrangement — and the role names a list asks for.
// Defers: the operations themselves (swap to `panedrag`, tab moves to
// `tabstrip`, saving to `panearrangements`); the tree and its numbers to
// `panestate`; the menu mount to `panels`.
// Refuses: arranging anything itself. It reads the arrangement to describe it,
// and every row is a callback into the module that owns the verb.

import * as panestate from "./panestate";
import * as panedrag from "./panedrag";
import * as tabstrip from "./tabstrip";
import * as panearrangements from "./panearrangements";
import * as panes from "./panes";
import * as tabs from "./tabs";
import * as docs from "./docs";
import { t, tf } from "./i18n";
import { setStatus } from "./runtime";
import { el } from "./dom";
import { mountPanel, closePanel } from "./panels";
import { voidAction } from "./asyncaction";

// ------------------------------------------------------------ the pane menu
//
// Everything a pane can do that is not worth a glyph in its strip. The strip
// carries what a writer reaches for while writing — split, close, link — and
// this carries what they reach for while *arranging*, which is a rarer and more
// deliberate act.
//
// The reason it exists at all is the question the window could not answer:
// *"what if it gets more complicated?"*. The directional commands are fine for
// two panes and meaningless for six, so the operations here are all named by
// **number** instead of by side. A number works at any depth, and the strip
// prints each pane's own so the list can be read against the window.

/**
 * Open the ⋯ menu for a pane, under its button.
 *
 * Rebuilt on every open rather than kept: every row in it is a statement about
 * the arrangement as it stands right now, and a menu built once would offer to
 * swap with panes that have since been closed.
 */
export function openPaneMenu(pane: panes.Leaf, at: HTMLElement) {
  const others = panes.leaves(panestate.paneTree).filter((l) => l.id !== pane.id);
  const layout = panestate.paneLayout();
  // The edge forms, not the list forms: these land inside a sentence.
  const SIDES: [panes.Side, string][] = [
    ["left", "edge.left"],
    ["right", "edge.right"],
    ["up", "edge.top"],
    ["down", "edge.bottom"],
  ];
  const rows: Node[] = [];

  // Swap with any pane, by number.
  if (others.length) {
    rows.push(el("div", { class: "menu-cat" }, [t("swapWithWhich")]));
    rows.push(el("div", { class: "menu-desc" }, [t("swapWithWhichDesc")]));
    for (const other of others) {
      rows.push(
        el("button", {
          class: "pal-item",
          "data-swap-with": String(panestate.paneNumberOf(other.id)),
          onClick: () => {
            closeFloating();
            panedrag.swapPanes(pane.id, other.id);
          },
        }, [
          el("b", {}, [tf("swapWithPane", String(panestate.paneNumberOf(other.id)))]),
          el("span", { class: "menu-desc" }, [t(PANE_ROLE_NAME[other.role])]),
        ]),
      );
    }
    rows.push(el("div", { class: "menu-sep" }));

    // Move to an edge of the whole window — the operation a swap cannot express.
    rows.push(el("div", { class: "menu-cat" }, [t("movePaneTo")]));
    rows.push(el("div", { class: "menu-desc" }, [t("movePaneToDesc")]));
    for (const [side, label] of SIDES) {
      rows.push(
        el("button", {
          class: "pal-item",
          "data-move-edge": side,
          onClick: () => {
            closeFloating();
            const next = panes.moveToEdge(panestate.paneTree, pane.id, side, layout);
            if (next === panestate.paneTree) return;
            panestate.setTree(next);
            panestate.setActivePane(pane.id);
            setStatus(t("paneMoved"), "ok");
          },
        }, [el("b", {}, [tf("movePaneEdge", t(label))])]),
      );
    }
    rows.push(el("div", { class: "menu-sep" }));
  }

  // Move the pane out of this arrangement altogether.
  rows.push(el("div", { class: "menu-cat" }, [t("movePaneToTab")]));
  rows.push(el("div", { class: "menu-desc" }, [t("movePaneToTabDesc")]));
  const titleOf = (id: string) => docs.library().find((e) => e.id === id)?.title;
  tabs.all().forEach((tab, i) => {
    if (i === tabs.activeIndex()) return;
    rows.push(
      el("button", {
        class: "pal-item",
        "data-move-tab": String(i),
        onClick: () => {
          closeFloating();
          tabstrip.movePaneToTab(pane, i);
        },
      }, [el("b", {}, [tabs.label(tab, titleOf, t("untitled"))])]),
    );
  });
  rows.push(
    el("button", {
      class: "pal-item",
      "data-move-tab": "new",
      onClick: () => {
        closeFloating();
        tabstrip.movePaneToTab(pane, -1);
      },
    }, [el("b", {}, [t("movePaneToNewTab")])]),
    el("div", { class: "menu-sep" }),
    el("button", {
      class: "pal-item",
      "data-save-arrangement": "",
      onClick: () => {
        closeFloating();
        voidAction("save_file", () => panearrangements.saveArrangementHere());
      },
    }, [
      el("b", {}, [t("saveArrangement")]),
      el("span", { class: "menu-desc" }, [t("saveArrangementDesc")]),
    ]),
  );

  // Anchored under the button, and clamped to the window: the strip of the
  // bottom-right pane is a few pixels from two edges, and a menu that opened
  // off-screen there would be a menu that pane never has.
  const box = el("div", { class: "spell-menu pane-menu" }, rows) as HTMLElement;
  const anchor = at.getBoundingClientRect();
  box.style.visibility = "hidden";
  mountPanel("pane-menu", box, document.body);
  const size = box.getBoundingClientRect();
  const pad = 8;
  const left = Math.max(pad, Math.min(anchor.left, window.innerWidth - size.width - pad));
  const top =
    anchor.bottom + size.height + pad < window.innerHeight
      ? anchor.bottom + 4
      : Math.max(pad, anchor.top - size.height - 4);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.visibility = "";
}

/** Shut the pane menu, from a row that has just done something. */
function closeFloating() {
  closePanel("pane-menu");
}

/** The pane roles, named for a list rather than for a strip. */
const PANE_ROLE_NAME: Record<string, string> = {
  source: "source",
  preview: "preview",
  outline: "outlinePane",
  notes: "notesPaneRole",
  marks: "marksPane",
};

// Dragging a pane by its strip, and the resize handle between two panes.
// Owns: the pointer-event drag (why it is not HTML5 drag-and-drop is written
// above `wirePaneDrag`), the drop-intent reading, move-beside and the two swap
// commands, and `splitterFor`.
// Defers: the tree and its persistence to `panestate`; the DOM host building
// to `panehost`.
// Refuses: knowing who renders — every tree write goes through
// panestate's setters, which redraw and remember in one turn.

import * as panestate from "./panestate";
import * as panes from "./panes";
import { t } from "./i18n";
import { setStatus } from "./runtime";
import { el } from "./dom";

// ------------------------------------------------------------ dragging a pane
//
// # Why this is pointer events and not HTML5 drag-and-drop
//
// It was drag-and-drop: `head.draggable = true`, a private MIME type, and
// `dragover`/`drop` on each pane. It was reported as simply not working —
// *"I would like to use the mouse to switch, but that does not work, I cannot
// drag it"* — and it does not, for a reason that is structural rather than a
// bug to find:
//
//   • **The drop target is a text editor.** A source pane's section contains a
//     CodeMirror view, which registers its own `drop` handling for dragging text
//     about, and it is the innermost handler. Dropping a pane onto the *text* —
//     which is nearly all of the target a person aims at — never reached the
//     section's listener at all. Only the strip and the margins worked, which
//     from the outside is a feature that does nothing.
//   • **Nothing said it was draggable.** No cursor change, no ghost, no lit
//     drop target until the pointer happened to cross a working strip. A gesture
//     whose whole discoverability is "try dragging and see" has to answer on the
//     first pixel of movement.
//
// Pointer events have none of that: one capture, no negotiation with any other
// handler, and every pane is a drop target whatever is inside it. It also
// unlocks the thing a swap cannot express — dropping onto an *edge* of a pane
// moves the pane there instead of trading places, which is the second half of
// what the margin asked for.

/** How far the pointer must travel before this is a drag and not a click. */
const DRAG_SLOP = 4;

/**
 * What a drop at this point over this pane would do.
 *
 * The geometry is `panes.dropIntentAt`, which is where it can be tested; this
 * is the two things that need a DOM.
 *
 * **A drop on the target's own strip is always a swap.** The gesture is carried
 * *by* a strip, so strip-to-strip is the motion a writer makes without being
 * taught it — and a strip sits at the top of its pane, which is to say squarely
 * inside the "up" band. The most natural aim in the whole gesture was the one
 * that reliably split the window instead of swapping it, which is most of what
 * *"it tends to split in half the other way, not switch"* is describing.
 */
function dropIntent(section: HTMLElement, x: number, y: number): panes.Side | "swap" {
  const head = section.querySelector<HTMLElement>(":scope > .pane-head");
  if (head) {
    const hb = head.getBoundingClientRect();
    if (y >= hb.top && y <= hb.bottom && x >= hb.left && x <= hb.right) return "swap";
  }
  const box = section.getBoundingClientRect();
  return panes.dropIntentAt(box.width, box.height, x - box.left, y - box.top);
}

/** The pane the pointer is over, if it is over one. */
function paneUnderPointer(x: number, y: number): { id: string; section: HTMLElement } | null {
  for (const node of document.elementsFromPoint(x, y)) {
    const section = (node as HTMLElement).closest?.<HTMLElement>("[data-pane]");
    if (section) return { id: section.dataset.pane!, section };
  }
  return null;
}

/**
 * Carry this pane by its strip.
 *
 * The pointer is captured on the strip, so every move and the release come back
 * here whatever they pass over — including the middle of another pane's editor,
 * which is the target that drag-and-drop could never be given.
 */
export function wirePaneDrag(pane: panes.Leaf, head: HTMLElement) {
  head.addEventListener("pointerdown", (e: PointerEvent) => {
    // Left button only, and never from a control: the strip is full of buttons
    // and a press on one of them is a press on it.
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let lit: HTMLElement | null = null;
    panestate.setActivePane(pane.id);

    const clear = () => {
      lit?.classList.remove("pane-drop");
      lit?.removeAttribute("data-drop");
      lit?.removeAttribute("data-drop-label");
      lit = null;
    };

    const move = (m: PointerEvent) => {
      if (!dragging) {
        if (Math.abs(m.clientX - startX) < DRAG_SLOP && Math.abs(m.clientY - startY) < DRAG_SLOP) return;
        dragging = true;
        // Capture so the move and the release come back here whatever they pass
        // over — including the middle of another pane's editor, which is the
        // target the old drag-and-drop could never be given. Guarded because a
        // pointer that has already been released or cancelled makes this throw,
        // and a throw here would leave the drag half-started with no way out.
        try {
          head.setPointerCapture(m.pointerId);
        } catch {
          /* the pointer is gone; the window listeners still finish the drag */
        }
        document.body.classList.add("dragging-pane");
      }
      const over = paneUnderPointer(m.clientX, m.clientY);
      if (!over || over.id === pane.id) {
        clear();
        return;
      }
      if (lit !== over.section) clear();
      lit = over.section;
      lit.classList.add("pane-drop");
      // Which of the two things a release would do, said on the target itself
      // so the reader is never guessing. `styles.css` draws the edge bands.
      const intent = dropIntent(over.section, m.clientX, m.clientY);
      lit.dataset.drop = intent;
      // In words as well as in the picture. The wash says *where* the carried
      // pane would land and the band draws it, but "the whole pane is lit" and
      // "the top third is lit" are only distinguishable if you already know the
      // rule — and a writer who has just been surprised by a split is the one
      // person who does not.
      lit.dataset.dropLabel = intent === "swap" ? t("dropSwap") : t("dropMove");
    };

    const up = (u: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("dragging-pane");
      if (head.hasPointerCapture?.(u.pointerId)) head.releasePointerCapture(u.pointerId);
      const intent = lit?.dataset.drop as panes.Side | "swap" | undefined;
      const target = lit?.dataset.pane;
      clear();
      if (!dragging || !target || target === pane.id) return;
      if (intent === "swap") swapPanes(pane.id, target);
      else if (intent) movePaneBeside(pane.id, target, intent);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}

/**
 * Put one pane on a given side of another, rather than trading them.
 *
 * The drop-on-an-edge gesture, and the operation `swap` cannot express: the
 * carried pane leaves its split — which collapses behind it — and takes its
 * place in a new split beside the target. `panes.moveToEdge` does the same thing
 * against the whole window; this does it against one pane, which is what a
 * pointer over that pane means.
 */
function movePaneBeside(id: string, targetId: string, side: panes.Side) {
  const moved = panes.find(panestate.paneTree, id);
  if (!moved || id === targetId) return;
  const without = panes.closePane(panestate.paneTree, id);
  // The only pane there is: nothing to move it beside.
  if (without === panestate.paneTree) return;
  // The target may have been the sibling that took the collapsed split's space,
  // so it is looked for in the tree the move actually starts from.
  if (!panes.find(without, targetId)) return;
  const vertical = side === "up" || side === "down";
  const layout = panestate.paneLayout();
  const first = vertical ? side === "up" : layout.rtl ? side === "right" : side === "left";
  const next = panes.replaceLeaf(without, targetId, (target) => ({
    kind: "split" as const,
    id: panes.paneId(),
    dir: vertical ? ("col" as const) : ("row" as const),
    frac: 0.5,
    a: first ? moved : target,
    b: first ? target : moved,
  }));
  panestate.setTree(next);
  panestate.setActivePane(id);
  panestate.paneViewOf(id)?.focus();
  setStatus(t("paneMoved"), "ok");
}

/** Trade two panes' places, and say so. */
export function swapPanes(a: string, b: string) {
  const next = panes.swap(panestate.paneTree, a, b);
  if (next === panestate.paneTree) return;
  panestate.setTree(next);
  // The pane the writer was in went somewhere; keeping it active means a second
  // press of the same key brings it back rather than picking up its new
  // neighbour. `setTree` rebuilds the DOM, so the focus has to be asked for
  // again — a swap that lands the caret in another pane would be a swap that
  // moved the writer as well as the window.
  panestate.setActivePane(a);
  panestate.paneViewOf(a)?.focus();
  setStatus(t("swapped"), "ok");
}

/** Swap the pane the writer is in with the one on a given side of it. */
export function swapPaneToward(side: panes.Side): boolean {
  const here = panestate.currentPane();
  if (!here) return true;
  const there = panes.neighbor(panestate.paneTree, here, side, panestate.paneLayout());
  // Nothing on that side. Said out loud rather than swallowed: a key that does
  // nothing in silence is indistinguishable from one that is broken, which is
  // how the whole of this session's list of complaints started.
  if (!there) {
    setStatus(t("noPaneThatWay"), "");
    return true;
  }
  swapPanes(here, there);
  return true;
}

export function splitterFor(node: panes.Split): HTMLElement {
  const bar = el("div", {
    class: "splitter",
    role: "separator",
    tabindex: "0",
    "aria-label": t("previewSide"),
    "data-i18n-label": "previewSide",
  });
  let dragging = false;
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const box = bar.parentElement!.getBoundingClientRect();
    const frac =
      node.dir === "row" ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height;
    // The tree is the authority, and the DOM follows it — so a drag survives a
    // rebuild rather than being a style somebody set once.
    panestate.setPaneTree(panes.resize(panestate.paneTree, node.id, frac));
    const live = panes.splits(panestate.paneTree).find((s) => s.id === node.id)!;
    (bar.previousElementSibling as HTMLElement).style.flex = `${live.frac} 1 0`;
    (bar.nextElementSibling as HTMLElement).style.flex = `${1 - live.frac} 1 0`;
  };
  const onUp = () => {
    dragging = false;
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    panestate.rememberPanes();
  };
  bar.addEventListener("pointerdown", (e) => {
    dragging = true;
    (e as PointerEvent).preventDefault();
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
  return bar;
}

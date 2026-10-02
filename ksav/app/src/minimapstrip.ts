// #89 — the floating, draggable strip.
//
// # Why the strip is not a panel body
//
// `overlayPanel` builds a box with a scrim and a head. This is neither: it is a strip
// the writer **puts somewhere and drags**, so it has no scrim (behind it is the
// document — dimming the page to announce a canvas would be declaring it a modal, and
// it is not one) and it takes its `×` from `panelHead`, which is the one piece of the
// registry this genuinely is: a declared surface with a declared way out.
//
// # Why the drag is on the head and the whole strip
//
// Both, deliberately. The head is the obvious handle and the affordance every window in
// the world uses. The whole strip is the handle **because the strip is mostly canvas**:
// dragging a 90-pixel-wide target by a 20-pixel grab area is fiddly, and a writer doing
// this once a session should not have to aim.
//
// The one thing that is never a drag handle is the `×`, because a `×` that drags the
// window instead of closing it is the worst bug a draggable panel can have.

import { minimapHost, clampPlacement, defaultPlacement, type Placement } from "./minimap";
import { mountPanel, closePanel, panelHead, wirePanel } from "./panels";

/** How wide the strip is, in pixels. Narrow on purpose: it is a picture, not a pane. */
export const MINIMAP_WIDTH = 92;

export interface MinimapDeps {
  /** The document's direction — the reading edge decides the default side. */
  dir: () => "rtl" | "ltr";
  /** Where the writer last put it, if they have. */
  saved: () => Placement | undefined;
  /** Called on release, to remember the place. */
  remember: (p: Placement) => void;
  /** Close it. The `×` and Escape both come through here. */
  close: () => void;
}

let open: HTMLElement | null = null;

/** Is the strip on screen? */
export const minimapIsOpen = (): boolean => open !== null;

/**
 * Build the strip, or return the one already there.
 *
 * Idempotent on purpose: the key and the settings toggle both land here, and opening
 * twice must not leave two strips fighting over one canvas.
 */
/**
 * Wire the strip's teardown into the registry — **once**, at module load.
 *
 * # The bug this fixes, which is "you cannot close it"
 *
 * `panelHead`'s `×` and the Escape sweep both close a surface by calling the
 * registry's `closePanel`. Before this hook existed, that removed the `open` class and
 * ran no teardown, so **the strip stayed on screen after being closed** — and so did
 * every attempt to close it: the `×`, Escape, and the key. All three "worked" and none
 * of them closed anything.
 *
 * Three tests were green throughout, because every one of them asked whether the strip
 * *opens* and about the geometry of a drag. None of them ever closed it.
 *
 * `wirePanel` is the registry's own answer and it throws on a name that is not a
 * declared surface, so this cannot be wired to a panel that does not exist.
 */
export function wireMinimapPanel(deps: MinimapDeps): void {
  wirePanel("minimap", { close: () => deps.close() });
}

export function openMinimap(deps: MinimapDeps): HTMLElement {
  if (open) return open;
  const box = document.createElement("div");
  box.className = "ksav-minimap";
  // **`id` is not cosmetic.** `nodesOf` finds a surface by
  // `document.getElementById(p.id)`, so a box without one is invisible to
  // `closePanel` — which is what the `×` and the Escape sweep both call. With no id
  // the strip could be *opened* and never closed, by anything, and every test was
  // green because every one of them opened it.
  box.id = "minimap";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "minimap");

  // The head — and the `×` in it — come from `panelHead`, **not** from a hand-built
  // one. `chrome.test.mjs` asks every declared surface to have its `×` built through
  // that function, and it is right to: a strip with its own close button is a second
  // close path, and a second close path is how a surface ends up with one that
  // forgets to run its own teardown. The registry owns the way out.
  const head = panelHead("minimap", "minimapLabel", { cls: "ksav-minimap-head" });
  box.appendChild(head);
  box.appendChild(minimapHost());

  // The strip goes where the writer left it, or to the far side from the reading edge.
  const size = { w: MINIMAP_WIDTH, h: Math.round(window.innerHeight * 0.6) };
  const bounds = { w: window.innerWidth, h: window.innerHeight };
  const place = deps.saved() ?? defaultPlacement(size, bounds, deps.dir());
  box.style.left = `${place.x}px`;
  box.style.top = `${place.y}px`;

  makeDraggable(box, head, deps);
  // Through `mountPanel`, so the registry knows this surface is on screen: the Escape
  // sweep, the "only one popup at a time" rule and the chrome's own checks all read
  // that, and a strip appended straight to `document.body` is invisible to every one
  // of them. That is the whole reason `panels.ts` exists.
  mountPanel("minimap", box, document.body);
  open = box;
  return box;
}

/**
 * Take it off the screen, for good.
 *
 * Calls `closePanel` rather than removing the element directly, so the registry is
 * told the surface has gone — and `closePanel` runs this function back through the hook,
 * which is guarded so the recursion stops.
 */
let closing = false;
export function closeMinimap(): void {
  if (closing) return;
  // **The flag has to be set, not just declared.** The first version declared
  // `let closing = false` and never assigned it, so closing recursed:
  // the `×` → `closePanel` → the hook → `deps.close` → `closeMinimap` →
  // `closePanel`, and the strip never came off the screen. The second version of this
  // function is one line longer and is the one that closes anything.
  closing = true;
  try {
    closePanel("minimap");
    open?.remove();
    open = null;
  } finally {
    closing = false;
  }
}

/**
 * Drag by pointer, on the head **or** anywhere on the strip that is not the `×`.
 *
 * Pointer capture, so the drag survives the pointer leaving the strip — which it will,
 * immediately, because the handle is 92 pixels wide and the pointer is not magic.
 *
 * `clampPlacement` runs on **every** move rather than on release, because the clamp is
 * also what stops the strip being dragged to a place it cannot be dragged back from.
 * Remembering only the release means the window can be put somewhere unrecoverable and
 * then saved there.
 */
function makeDraggable(box: HTMLElement, head: HTMLElement, deps: MinimapDeps): void {
  let dragging = false;
  let grabX = 0;
  let grabY = 0;
  let originX = 0;
  let originY = 0;

  head.addEventListener("pointerdown", (e) => {
    // Any **control**, not one class name. `panelHead` puts the `×` inside the head,
    // so a drag handler that `preventDefault`s on `pointerdown` **swallows the
    // click** and the `×` does nothing — which is what happened, and it is why the
    // `×` closed nothing while Escape and the key both worked.
    //
    // The rule is "anything you can press is not a handle", by tag, because that
    // holds for a control nobody has heard of yet.
    if ((e.target as HTMLElement | null)?.closest("button, a, input, select, textarea")) {
      return;
    }
    dragging = true;
    grabX = e.clientX;
    grabY = e.clientY;
    originX = box.offsetLeft;
    originY = box.offsetTop;
    head.setPointerCapture(e.pointerId);
    box.classList.add("dragging");
    e.preventDefault();
  });

  head.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const size = { w: box.offsetWidth, h: box.offsetHeight };
    const bounds = { w: window.innerWidth, h: window.innerHeight };
    const next = clampPlacement(
      { x: originX + (e.clientX - grabX), y: originY + (e.clientY - grabY) },
      size,
      bounds,
    );
    box.style.left = `${next.x}px`;
    box.style.top = `${next.y}px`;
  });

  const release = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    box.classList.remove("dragging");
    try {
      head.releasePointerCapture(e.pointerId);
    } catch {
      /* the capture is already gone, which is fine */
    }
    // Remembered on release, which is the only moment the writer has finished deciding.
    deps.remember({ x: box.offsetLeft, y: box.offsetTop });
  };
  head.addEventListener("pointerup", release);
  head.addEventListener("pointercancel", release);
}
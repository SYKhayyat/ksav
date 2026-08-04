// Clicking the page to find the source, and asking the source where it printed.
//
// The engine half is `engine/src/jump.rs`, which asks Typst — the actual
// compiler, holding the actual layout — which glyph is under a point and which
// glyph a span became. This half is the arithmetic on either side of that:
// turning a mouse event into a page coordinate, and a page coordinate back into
// somewhere to scroll.
//
// # What this replaces
//
// ```ts
// const f = (preview.scrollTop + (e.clientY - rect.top)) / preview.scrollHeight;
// const line = Math.round(f * view.state.doc.lines);
// ```
//
// A click 40% of the way down the preview put the cursor 40% of the way down the
// document. That is correct for a document of uniform single-column text with no
// page breaks and nothing floated — and this application exists to typeset the
// opposite of that. A page carrying four stacked note bands is mostly apparatus
// by area and mostly body text by line count, so the guess was not merely
// imprecise, it was biased: it always landed too early in documents with notes,
// by an amount that grew with how much apparatus the page had.
//
// # The unit
//
// Typst points, in both directions, because that is what a page's own SVG
// `viewBox` is written in. Nothing here converts through the zoom, the
// fit-to-width setting or the device pixel ratio: the drawn element's own
// bounding box carries all three, and dividing by it cancels all three at once.
// The one thing that would break this is an SVG drawn with a transform of its
// own, which Typst does not emit.
//
// The geometry is pure and takes rectangles rather than elements, so it can be
// tested without a browser — which matters, because "off by the page margin" and
// "off by the scroll position" produce answers that look plausible in a
// screenshot and are wrong by a paragraph.

import type { PagePoint } from "./api";

/** A rectangle, in the shape `getBoundingClientRect` gives one. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A page's own size, in Typst points. */
export interface Box {
  width: number;
  height: number;
}

/**
 * Where on the page a click landed, in Typst points.
 *
 * `null` for a click outside the drawn page or on a page of no size — both of
 * which mean there is nothing under the pointer to ask about.
 *
 * Note what is *not* consulted: the scroll position. `getBoundingClientRect`
 * already reports the element where it currently is on screen, so subtracting
 * the scroll offset — which the code this replaces did — counts it twice.
 */
export function pointInPage(page: number, rect: Rect, box: Box, x: number, y: number): PagePoint | null {
  if (rect.width <= 0 || rect.height <= 0 || box.width <= 0 || box.height <= 0) return null;
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
  return { page, x_pt: fx * box.width, y_pt: fy * box.height };
}

/**
 * The inverse: where a point on the page sits inside the drawn element, in CSS
 * pixels from its top-left corner.
 *
 * Unclamped on purpose. A point slightly off the page is a real answer about a
 * real layout — an overfull line, something absolutely placed past the margin —
 * and clamping it would draw the marker on the edge and quietly claim the text
 * is there.
 */
export function pixelInPage(at: PagePoint, rect: { width: number; height: number }, box: Box): { x: number; y: number } {
  return { x: (at.x_pt / box.width) * rect.width, y: (at.y_pt / box.height) * rect.height };
}

/**
 * The `.page` element a click landed in, and which page it is.
 *
 * `data-page` is written by `preview.render`, so this asks the DOM what it was
 * told rather than counting siblings — a pane mid-rebuild has the wrong number
 * of children for exactly as long as it takes to add them.
 */
export function pageUnder(target: EventTarget | null): { node: HTMLElement; index: number } | null {
  const el = target instanceof Element ? target.closest(".page") : null;
  if (!(el instanceof HTMLElement)) return null;
  const index = Number(el.dataset.page);
  return Number.isInteger(index) && index >= 0 ? { node: el, index } : null;
}

/**
 * Whether this click is a click rather than the end of a drag.
 *
 * Selecting text in the preview to copy a rendered line used to be impossible:
 * click-to-jump fired on mouseup, so the caret moved and the selection was gone
 * the instant the mouse was released. A collapsed selection means nothing was
 * dragged.
 */
export function isPlainClick(sel: { isCollapsed: boolean } | null): boolean {
  return !sel || sel.isCollapsed;
}

// ------------------------------------------------------------------- the mark
//
// Forward search needs to say *there* about a spot on a page that is otherwise
// undistinguished. Scrolling to it is not enough — the reader is looking at a
// page of Hebrew and has no idea which word was meant.

/** How long the mark stays up. Long enough to find with the eye, short enough
 *  that it is gone before it becomes furniture. */
export const MARK_MS = 1400;

/**
 * Draw the mark at a point inside a page node.
 *
 * Returns the element so a caller can take it away early; it removes itself
 * otherwise. Positioned in percentages rather than pixels so that a page
 * redrawn at another zoom — or a splitter dragged while the mark is up — keeps
 * it on the same word instead of leaving it behind at a stale pixel offset.
 *
 * `left`, not `inset-inline-start`: the preview pane reads right-to-left for a
 * Hebrew document (`preview.applyPreview`), and the logical property would
 * measure from the right edge — putting the mark exactly as far from the wrong
 * side of the page. The page's own x coordinate is measured from its left in
 * every script, because that is what a `viewBox` means.
 */
export function drawMark(node: HTMLElement, at: PagePoint, box: Box): HTMLElement {
  node.querySelectorAll(".jump-mark").forEach((m) => m.remove());
  const mark = document.createElement("div");
  mark.className = "jump-mark";
  mark.style.left = `${(at.x_pt / box.width) * 100}%`;
  mark.style.top = `${(at.y_pt / box.height) * 100}%`;
  node.append(mark);
  setTimeout(() => mark.remove(), MARK_MS);
  return mark;
}

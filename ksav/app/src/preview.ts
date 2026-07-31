// How wide the page draws in the preview pane, and which way that pane reads.
//
// A page drawn wider than the pane it sits in is a horizontal scroller, and a
// horizontal scroller starts at `scrollLeft: 0` — which in a left-to-right
// container is the *left* edge, which in a Hebrew document is the *end* of every
// line. On a 1366×768 laptop the split gives the preview 680 px and an A4 page
// drew at 860, so the reader met the flagship feature showing the tail of every
// line: `הקושיה` drawn as `ה`, `המקורות` as `ות`. At 1920 there is no overflow,
// which is why nobody who built this ever saw it.
//
// Two things close it and both live here rather than in the stylesheet, so a
// test can hold them:
//
//  1. **The page fits the pane by default.** That is what Word does, and it is
//     why nobody meets this bug there. There is now a control for it beside the
//     zoom, and it starts on.
//  2. **The pane reads in the document's own direction.** One property, applied
//     unconditionally, so a reader who chooses a zoom that *does* overflow still
//     gets the origin at the edge a line starts at rather than the edge it ends
//     at. A conditional here would be a second thing to keep in step; there is
//     nothing to gain by making it one.
//
// Nothing in this module touches the DOM except `applyPreview`, so the geometry
// is testable without a browser.

import { docConfig, settings } from "./settings";

/** The drawn width of an A4 page at 100%, in CSS pixels. */
export const PAGE_PX = 820;

/** `#preview`'s own padding, per side. Mirrors `#preview` in `styles.css`. */
export const PREVIEW_PAD = 20;

/**
 * Fitting never scales past the zoom control's own ceiling.
 *
 * Without a cap, a maximised single-pane preview on a wide monitor would draw an
 * A4 page at 250% and call it "fit", which is not what the reader asked for.
 */
export const MAX_FIT = 2;

export interface Geometry {
  /** What `--page-width` becomes; `.page` is `width: var(--page-width)`. */
  pageWidthCss: string;
  /** The same width in pixels, for the pane width this was computed against. */
  pageWidth: number;
  /** Everything inside the scroller, padding included. */
  contentWidth: number;
  /** `direction` for the scroll container. */
  direction: "rtl" | "ltr";
  /** Whether the reader has to scroll sideways to see a whole line. */
  overflows: boolean;
}

export interface GeometryInput {
  /** `#preview`'s `clientWidth` — the pane, padding included. */
  paneWidth: number;
  /** The document's direction, not the interface's. */
  dir: "rtl" | "ltr";
  /** Fit the page to the pane, ignoring `zoom`. */
  fitWidth: boolean;
  /** The reader's zoom, used only when `fitWidth` is off. */
  zoom: number;
  pagePx?: number;
  padding?: number;
}

/**
 * The page's width and the pane's reading direction, for one pane width.
 *
 * `pageWidthCss` is what the browser is given and `pageWidth` is what that comes
 * to here; both come off the same branch, so the model a test asserts against
 * and the stylesheet a reader sees cannot disagree about which mode is on.
 */
export function previewGeometry(o: GeometryInput): Geometry {
  const pagePx = o.pagePx ?? PAGE_PX;
  const pad = o.padding ?? PREVIEW_PAD;
  const inner = Math.max(0, o.paneWidth - pad * 2);

  let pageWidthCss: string;
  let pageWidth: number;
  if (o.fitWidth) {
    // `100%` rather than a pixel count, so dragging the splitter reflows without
    // anything having to notice.
    const cap = pagePx * MAX_FIT;
    pageWidthCss = `min(100%, ${cap}px)`;
    pageWidth = Math.min(inner, cap);
  } else {
    pageWidthCss = `calc(${pagePx}px * ${o.zoom})`;
    pageWidth = pagePx * o.zoom;
  }

  const contentWidth = pageWidth + pad * 2;
  return {
    pageWidthCss,
    pageWidth,
    contentWidth,
    direction: o.dir,
    overflows: contentWidth > o.paneWidth + 0.5,
  };
}

/**
 * The slice of the page the reader sees before touching anything, in content
 * coordinates measured from the content's left edge.
 *
 * This is the whole finding expressed as arithmetic. A scroller's resting
 * `scrollLeft` is its inline start: the left edge under `ltr`, the right edge
 * under `rtl`. Get it wrong for a Hebrew page and the window opens over the end
 * of every line.
 */
export function visibleWindow(g: Geometry, paneWidth: number): { from: number; to: number } {
  const width = Math.min(paneWidth, g.contentWidth);
  return g.direction === "rtl"
    ? { from: g.contentWidth - width, to: g.contentWidth }
    : { from: 0, to: width };
}

/**
 * Whether the beginning of a line of a `docDir` document is on screen without
 * scrolling.
 *
 * `docDir` is the *document's* direction and is deliberately not read off the
 * geometry, because the whole finding was a pane whose direction disagreed with
 * its document's: an RTL page in a container inheriting `main { direction: ltr }`.
 * Asking the geometry which way it reads would have agreed with itself and
 * reported the bug as fine.
 *
 * The leading run of an RTL line sits at the content's right edge and of an LTR
 * line at its left, so this is the property the pane has to hold at any pane
 * width, in either script, at any zoom.
 */
export function lineStartVisible(
  g: Geometry,
  paneWidth: number,
  docDir: "rtl" | "ltr",
): boolean {
  const w = visibleWindow(g, paneWidth);
  return docDir === "rtl" ? w.to >= g.contentWidth - 0.5 : w.from <= 0.5;
}

/**
 * Push the geometry at the DOM.
 *
 * Called after a compile writes new pages, when the zoom or the fit changes, and
 * when the document's direction changes — everything that can move either input.
 */
export function applyPreview() {
  // The open document's direction (B26), not the application's.
  const dir: "rtl" | "ltr" = docConfig().dir === "ltr" ? "ltr" : "rtl";
  const fitWidth = settings.fitWidth !== false;
  const panes = [document.getElementById("preview"), document.getElementById("preview-modal-body")];
  for (const pane of panes) {
    if (!pane) continue;
    const g = previewGeometry({ paneWidth: pane.clientWidth, dir, fitWidth, zoom: settings.zoom });
    pane.style.direction = g.direction;
    pane.dataset.fit = fitWidth ? "width" : "zoom";
    pane.style.setProperty("--page-width", g.pageWidthCss);
  }
}

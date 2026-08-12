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

  const { pageWidthCss, direction } = previewStyle(o);
  const pageWidth = o.fitWidth ? Math.min(inner, pagePx * MAX_FIT) : pagePx * o.zoom;

  const contentWidth = pageWidth + pad * 2;
  return {
    pageWidthCss,
    pageWidth,
    contentWidth,
    direction,
    overflows: contentWidth > o.paneWidth + 0.5,
  };
}

/**
 * The two things the pane is actually *given* — and the fact that neither of
 * them depends on how wide the pane currently is.
 *
 * That fact is the whole reason this function exists separately. `applyPreview`
 * used to build a full [`Geometry`], which meant reading `pane.clientWidth`
 * straight after the pages had been written — and reading a layout property
 * after a mutation forces the browser to lay the whole subtree out then and
 * there, synchronously, before it will answer. On a 48-page document that is
 * 82,525 nodes of SVG and the answer took **7690 ms**, on the main thread, on
 * every pause in typing. It was the single most expensive thing in the pipeline,
 * larger than the compile and larger than drawing the pages, and every one of
 * those milliseconds bought a number that was then thrown away: `pageWidthCss` is
 * `min(100%, …)` or `calc(820px * zoom)`, and `direction` is the document's.
 *
 * `previewGeometry` still computes the measured half, because the *tests* want
 * it — whether a line's beginning is on screen at a given pane width is a real
 * question. It is just not a question the DOM has to be interrupted to answer.
 */
export function previewStyle(o: {
  dir: "rtl" | "ltr";
  fitWidth: boolean;
  zoom: number;
  pagePx?: number;
}): { pageWidthCss: string; direction: "rtl" | "ltr" } {
  const pagePx = o.pagePx ?? PAGE_PX;
  return {
    // `100%` rather than a pixel count, so dragging the splitter reflows without
    // anything having to notice — which is also why no measurement is needed.
    pageWidthCss: o.fitWidth
      ? `min(100%, ${pagePx * MAX_FIT}px)`
      : `calc(${pagePx}px * ${o.zoom})`,
    direction: o.dir,
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

// ------------------------------------------------------------------ the pages
//
// Two separate savings live here, and they close two different measurements.
//
// **Only redraw what changed.** `preview.innerHTML = every page` was the single
// most expensive thing the editor did: **1227 ms** on a 48-page document, on
// every pause in typing, to deliver 40 KB of change out of a 9.7 MB redraw. The
// engine names every page it renders, so this compares names instead of ten
// megabytes of markup.
//
// **Only keep on screen what is on screen.** Even with one page rewritten, a
// 48-page document is ~82,500 SVG nodes in one scroller, and the browser spent
// **1.3–2.7 s** per compile laying out and rasterising all of it — with only
// ~60 ms of that being script, which is why it was invisible to every profile
// that looked at JavaScript. So a page that is nowhere near the viewport holds
// no SVG at all: just an empty box of exactly the right size, filled the moment
// it comes near and emptied again when it leaves.
//
// The size is the part that has to be right. Each box is given the page's own
// aspect ratio, taken from the SVG it would hold, so an empty page occupies
// precisely the height a full one would. Nothing moves under the reader when a
// page fills in, and the scrollbar means the same thing at every moment.

/** How far outside the pane a page is still kept drawn: one and a half panes of
 *  scrolling in each direction, so ordinary scrolling never outruns it. */
const KEEP_MARGIN = "150% 0px";

interface Windowed {
  pages: string[];
  hashes: string[];
  /** The page boxes, in order — the nodes this pane is known to own. */
  nodes: HTMLElement[];
  /** What each node is currently showing — the empty string for an empty box. */
  showing: string[];
  observer: IntersectionObserver | null;
}

const windows = new WeakMap<Element, Windowed>();

/** The pages of the open document, so a second pane can draw the same ones. */
let current: { pages: string[]; hashes: string[] } | null = null;

/**
 * A rendered page's own dimensions, read from the SVG's header.
 *
 * Typst writes `viewBox="0 0 595.28 841.89"` at the front of every page, so this
 * only ever looks at the first line and never parses the megabyte behind it.
 *
 * The unit is Typst points, which is also the unit `jump.ts` speaks in both
 * directions. That is the whole reason this returns the numbers rather than only
 * their ratio: the ratio sizes an empty box, but converting a click into a place
 * on the page needs the page's actual size, and reading the header twice in two
 * modules is how the two would come to disagree.
 */
export function pageBox(svg: string | undefined | null): { width: number; height: number } | null {
  const m = svg ? /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg.slice(0, 400)) : null;
  const width = m ? Number(m[1]) : 0;
  const height = m ? Number(m[2]) : 0;
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The width-to-height ratio of a rendered page.
 *
 * A page whose header cannot be read gets A4, which is the paper it almost
 * certainly is and in any case only affects a box nobody has scrolled to yet.
 */
export function pageAspect(svg: string): number {
  const box = pageBox(svg);
  return box ? box.width / box.height : 210 / 297;
}

function fill(w: Windowed, node: HTMLElement, i: number) {
  if (w.showing[i] === w.hashes[i]) return;
  node.innerHTML = w.pages[i];
  w.showing[i] = w.hashes[i];
}

function empty(w: Windowed, node: HTMLElement, i: number) {
  if (!w.showing[i]) return;
  node.replaceChildren();
  w.showing[i] = "";
}

/**
 * Draw `pages` into `host`, keeping only what is near the viewport.
 *
 * `hashes` names each page. Without them — an older engine, or any caller with
 * no names to give — everything is drawn at once, which is what this always did.
 */
export function drawPages(host: HTMLElement, pages: string[], hashes?: string[]) {
  // Recorded whether or not there are names for the pages. This used to be
  // `null` without them, which was right for `drawCurrentInto` — a second pane
  // reuses the windowing and the windowing needs hashes — and wrong for
  // `currentPages`, which is about *what is on the screen* and is what Print
  // reads. An engine too old to send hashes would have printed nothing.
  current = { pages, hashes: hashes && hashes.length === pages.length ? hashes : [] };
  render(host, pages, hashes);
}

/** Draw the open document's pages into another pane — the full-screen preview. */
export function drawCurrentInto(host: HTMLElement) {
  if (current?.hashes.length) render(host, current.pages, current.hashes);
}

/**
 * Every element the pages should be drawn into.
 *
 * The pane tree's preview panes, plus the full-screen overlay. Several previews
 * of one document share **one compile** and are drawn from its result — which is
 * the whole cost argument for allowing more than one: a second preview of the
 * same document is a second scroll position and not a second layout.
 */
export function previewHosts(): HTMLElement[] {
  const out = [...document.querySelectorAll<HTMLElement>(".preview-host")];
  const modal = document.getElementById("preview-modal-body");
  if (modal) out.push(modal);
  return out;
}

/** Draw a fresh compile into every preview pane there is. */
export function drawPagesEverywhere(pages: string[], hashes?: string[]) {
  const hosts = previewHosts();
  // The first call records what is on screen (see `currentPages`); the rest
  // reuse it, so a document with four previews still compiles once.
  if (!hosts.length) return;
  drawPages(hosts[0], pages, hashes);
  for (const host of hosts.slice(1)) drawCurrentInto(host);
}

/**
 * The pages that are **on screen**, which is not the same as the last compile.
 *
 * `runtime.lastResult` is the last thing the engine returned, stored
 * unconditionally — including a failed compile, whose `pages_svg` is `[]`. The
 * redraw is skipped in that case, deliberately: a writer mid-keystroke should
 * keep looking at the last good page rather than at a blank rectangle.
 *
 * So after a failed compile the two records disagree, and every consumer that
 * wanted *the pages* and reached for `lastResult` got the empty one. Print is
 * the route where that is worst: it produces a **blank sheet**, silently, on the
 * one output that is paper and cannot be undone by scrolling.
 *
 * This is the other record, and it is the one that is true by construction —
 * `drawPages` is what put them on the screen, so what it last drew is what is
 * there. Click-to-jump and reveal-the-cursor read it too: measuring a click
 * against a page the reader is not looking at is the same defect with a
 * different symptom.
 *
 * `lastResult` keeps its other consumers, which want the *compile* and not the
 * pages — diagnostics, the healed count, whether it succeeded at all.
 */
export function currentPages(): readonly string[] {
  return current?.pages ?? [];
}

function render(host: HTMLElement, pages: string[], hashes?: string[]) {
  // No names, or no observer to tell us what is on screen (a very old webview):
  // draw the lot, exactly as this did before either mechanism existed.
  if (!hashes || hashes.length !== pages.length || typeof IntersectionObserver === "undefined") {
    host.innerHTML = pages.map((s) => `<div class="page">${s}</div>`).join("");
    windows.delete(host);
    return;
  }

  let w = windows.get(host);
  if (!w) {
    w = { pages, hashes, nodes: [], showing: [], observer: null };
    w.observer = new IntersectionObserver(
      (entries) => {
        const state = windows.get(host);
        if (!state) return;
        for (const e of entries) {
          const node = e.target as HTMLElement;
          const i = Number(node.dataset.page);
          // A node this pane no longer owns — removed, or left over from a pane
          // something else rebuilt. Reporting it would write the page into a
          // node nobody can see and, worse, mark the page as drawn.
          if (!(i >= 0) || state.nodes[i] !== node) continue;
          if (e.isIntersecting) fill(state, node, i);
          else empty(state, node, i);
        }
      },
      { root: host, rootMargin: KEEP_MARGIN },
    );
    windows.set(host, w);
  }

  // Is this still the pane we left? Everything below is bookkeeping about
  // particular nodes, and all of it is worthless if something else has replaced
  // them — the blind full-redraw path does exactly that, and so would any future
  // caller that clears the pane. Believing stale bookkeeping shows the reader a
  // row of empty boxes, so the check is by identity and the answer is to start
  // again rather than to guess which half is still true.
  if (w.nodes.length !== host.children.length || w.nodes.some((n, i) => n !== host.children[i])) {
    w.observer?.disconnect();
    host.replaceChildren();
    w.nodes = [];
    w.showing = [];
  }
  w.pages = pages;
  w.hashes = hashes;

  // Pages the document no longer has, first, so index `i` means the same page
  // everywhere below.
  while (w.nodes.length > pages.length) {
    const last = w.nodes.pop();
    w.showing.pop();
    if (last) {
      w.observer?.unobserve(last);
      last.remove();
    }
  }
  while (w.nodes.length < pages.length) {
    const i = w.nodes.length;
    host.insertAdjacentHTML("beforeend", '<div class="page"></div>');
    const node = host.lastElementChild as HTMLElement;
    node.dataset.page = String(i);
    w.nodes.push(node);
    w.showing[i] = "";
    w.observer?.observe(node);
  }

  for (let i = 0; i < pages.length; i++) {
    const node = w.nodes[i];
    // The empty box has to be exactly as tall as the full one, or filling it in
    // shoves everything below it down under the reader's eyes.
    node.style.aspectRatio = String(pageAspect(pages[i]));
    // A page already on screen is refreshed here rather than left to the
    // observer, which would not fire for a node that never moved.
    if (w.showing[i]) fill(w, node, i);
  }
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
  // Computed once and read from nothing: see `previewStyle`. This runs straight
  // after the pages are written, so a single layout read here would force the
  // whole preview to be laid out before it could answer.
  const s = previewStyle({ dir, fitWidth, zoom: settings.zoom });
  // Every preview there is, and not a list of two ids. A window is a tree of
  // panes now, so "the preview" is however many the writer opened — and the
  // margin comment that asked for several previews of one document asked for
  // exactly this: *"multiple previews or sources open at one time, meaning all
  // of the same doc, so you can look in one place as you type."*
  for (const pane of previewHosts()) {
    pane.style.direction = s.direction;
    pane.dataset.fit = fitWidth ? "width" : "zoom";
    pane.style.setProperty("--page-width", s.pageWidthCss);
  }
}

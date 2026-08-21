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

import type { LineRun, PrintedLine } from "./api";
import { tf } from "./i18n";
import { docConfig, settings } from "./settings";

/**
 * The stretch of a document a narrowed preview is following, in lines.
 *
 * Lines rather than the byte offsets a narrowed pane's `Span` carries, because
 * the other half of the answer — which lines printed on which page — is the
 * engine's, and the engine counts in lines. `file` is the included document
 * these lines belong to, or `null` for the one the writer has open.
 *
 * Declared here rather than in `narrowing.ts`, where the rest of narrowing
 * lives, for one reason: that module is built on CodeMirror and this one is
 * deliberately free of it. `narrowing.ts` imports the type back — which costs
 * nothing, being erased — so the direction of the dependency is the one that
 * keeps the geometry testable without a browser.
 */
export interface LineWindow {
  file: string | null;
  from: number;
  to: number;
}

/**
 * Which pages a stretch of lines printed on.
 *
 * The whole of the narrowed preview's decision, and deliberately the smallest
 * rule that can be right: a page is in when any run of the writer's lines on it
 * overlaps the window, **in the same file**.
 *
 * The file check is not a formality. A sefer that includes chapters is one
 * compile of one concatenation, so lines 10–20 of chapter two and lines 10–20 of
 * the sefer itself are different text with the same numbers. Dropping the
 * comparison would show a reader the pages of a chapter they are not narrowed
 * to, which is the failure this feature exists to prevent, arrived at from the
 * other side.
 *
 * An empty answer is a real answer and means what it says: this siman printed
 * nowhere. That happens while a document is broken, and while a section holds
 * nothing but commands that produce no ink. The caller says so out loud rather
 * than falling back to every page — a preview quietly showing the whole sefer is
 * indistinguishable from one that was never narrowed.
 */
export function pagesOfLines(
  pages: readonly (readonly LineRun[])[],
  win: LineWindow,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].some((r) => r.file === win.file && r.from <= win.to && win.from <= r.to)) {
      out.push(i);
    }
  }
  return out;
}

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
//
// # What the first version of that got wrong, and what it cost
//
// Both savings above are real and both are kept. What was wrong was *when* the
// work happened, and the writer reported it as the application's worst defect:
// *"BIG BUG — the scroll is terrible and it stutters on the preview. This goes
// on throughout the document."* Measured on their own 19-page document, in the
// pane they were reading:
//
//   • One page of this document is **358 KB of SVG containing 2,254 `<use>`
//     elements** over 150 glyph `<symbol>`s. Every `<use>` instantiates a shadow
//     subtree, so writing one page into the DOM costs **335 ms** — and only
//     28 ms of that is the HTML parser. The rest is layout of the instances.
//   • That 335 ms ran **inside the IntersectionObserver callback**, which is to
//     say inside the frame the reader was scrolling. One page boundary crossed,
//     one third of a second of frozen window.
//   • And it ran **again every time a page came back**, because a page that left
//     the margin was emptied immediately. Scrolling up and down over one page
//     boundary paid 335 ms in each direction, for ever.
//
// # The shape now
//
// Three changes, and the third is the one that matters:
//
//   • **`content-visibility: auto` on every page box** (`styles.css`). This is
//     the browser's own version of the second saving, and it is far better at it
//     than this file was: a hydrated page that is off screen costs nothing to
//     keep, and bringing one back on screen costs **10.7 ms** instead of 335.
//   • **Hydration happens in idle time, never in the observer callback.** The
//     observer now only *records* which pages are wanted; `drain` fills them one
//     per slice, nearest to the viewport first. The reader's frame is never the
//     frame that pays.
//   • **A page is not emptied when it leaves.** It is emptied only when the pane
//     is holding more than `KEEP_PAGES` of them, and then the furthest one goes.
//     Since keeping one is now free, evicting eagerly bought nothing and charged
//     335 ms to undo. This is the whole difference between a preview that
//     stutters on every page boundary and one that pays for a page once.
//
// Measured after, on the same document and the same scroll: worst frame 591 ms
// → 46 ms. See `decisions/2026-08-17-the-frame-the-reader-is-in.md`.

/**
 * How far outside the pane a page is hydrated ahead of the reader.
 *
 * Three panes of scrolling in each direction rather than one and a half. The
 * margin is not a memory budget any more — `KEEP_PAGES` is — so its only job is
 * to be far enough ahead that idle-time hydration finishes before the reader
 * arrives, and being early costs nothing a reader can see.
 */
const KEEP_MARGIN = "300% 0px";

/**
 * How many hydrated pages one pane keeps before it starts letting them go.
 *
 * A cap and not a window: pages are evicted because there are too many, not
 * because the reader scrolled past them. Forty pages of this document is roughly
 * 14 MB of markup, which is a fair price for never paying 335 ms twice for the
 * same page — and a 300-page sefer still cannot fill memory, which is the reason
 * there is a cap at all.
 */
export const KEEP_PAGES = 40;

interface Windowed {
  pages: string[];
  hashes: string[];
  /**
   * Pages already flattened, by the name the engine gave them.
   *
   * `fill` used to call `flattenGlyphs` every time a page was drawn, and
   * `evictIfCrowded` empties pages beyond `KEEP_PAGES` — so scrolling back and
   * forth across a long document re-flattened the *same* SVG over and over: two
   * global regex passes and a rebuild of a multi-hundred-kilobyte string, in
   * idle time, but paid every time. The result is a pure function of the page,
   * and every page already has a stable name in `hashes[i]` — the key `fill`
   * compares against to decide whether to draw at all.
   *
   * On the window and **not** on the module, which is not a detail. A hash is
   * only meaningful inside the draw that produced it: `pagecache.test.mjs` draws
   * a document with no names, then draws different pages under the names an
   * earlier draw used, and asserts — correctly — that names from before a blind
   * fallback are not trusted. A module-global map would have shown the reader
   * the previous document's page. Scoped here, the cache lives exactly as long
   * as the pages it describes, which is the whole of the case it was added for.
   */
  flattened: Map<string, string>;
  /** The page boxes, in order — the nodes this pane is known to own. */
  nodes: HTMLElement[];
  /** What each node is currently showing — the empty string for an empty box. */
  showing: string[];
  observer: IntersectionObserver | null;
  /**
   * The pages the observer last said were near the viewport.
   *
   * Kept apart from `wanted` because they answer different questions. This one
   * is *where the reader is*, and it is what decides whether a page that changed
   * under a compile has to be drawn now or can wait until somebody scrolls to
   * it. Redrawing a page nobody is near is the 9.7 MB-per-keystroke defect this
   * whole file exists to close, and it stays closed.
   */
  near: Set<number>;
  /**
   * Pages that are near and whose drawing is not what the document now says.
   *
   * The observer and the compile both write this and neither draws. Hydrating a
   * page costs real time and both of them run in a frame somebody is using — the
   * observer inside a scroll, the compile inside typing — so both record the
   * intent and `drain` does the work in idle time.
   */
  wanted: Set<number>;
  /** Whether a drain is already booked, so scrolling does not book fifty. */
  draining: boolean;
}

const windows = new WeakMap<Element, Windowed>();

/** The pages of the open document, so a second pane can draw the same ones. */
let current: { pages: string[]; hashes: string[] } | null = null;

/**
 * Which lines printed on which page, from the last compile that said.
 *
 * Kept beside `current` rather than read off `runtime.lastResult`, and for the
 * same reason `current` exists at all: a failed compile is stored there with no
 * pages and no runs, while the *pages on screen* are still the last good ones.
 * A narrowed preview reading the failed result would decide that this siman
 * printed nowhere and blank itself, mid-keystroke, on every unbalanced bracket.
 */
let currentLines: LineRun[][] = [];

/**
 * What each page on screen *says*, from the last compile that was asked.
 *
 * Beside `currentLines` and for its reason, which by now is a rule this
 * repository has been bitten by three times: a failed compile is stored in
 * `runtime.lastResult` with no pages and no text, while the pages on screen are
 * still the last good ones. A find drawer reading the failed result would
 * announce that the phrase the writer is looking at printed nowhere, mid
 * keystroke, on every unbalanced bracket.
 */
let currentText: PrintedLine[][] = [];

/**
 * What each preview host is narrowed to, if anything.
 *
 * A property of the *host* and not of the application: the point of the whole
 * feature is one preview holding one siman while the preview beside it holds the
 * sefer. Empty for a host showing everything, which is almost all of them.
 */
const windows_of = new WeakMap<Element, LineWindow>();

/**
 * Narrow a preview host to a stretch of the document, or widen it with `null`.
 *
 * Only records and redraws. *Which* stretch is `main.ts`'s question — it is the
 * one that holds the pane tree and can see that this preview is following a
 * narrowed source pane — and *which pages* is `narrowing.pagesOfLines`.
 */
export function narrowPreview(host: HTMLElement, win: LineWindow | null, label = ""): void {
  const had = windows_of.get(host);
  if (!win) {
    windows_of.delete(host);
    labels.delete(host);
    if (!had) return;
  } else {
    labels.set(host, label);
    windows_of.set(host, win);
    if (had && had.file === win.file && had.from === win.from && had.to === win.to) {
      // The same window as before, but the pages under it may have moved and
      // the strip is written from the count. Redrawn rather than returned on.
      drawCurrentInto(host);
      return;
    }
  }
  drawCurrentInto(host);
}

/** What each narrowed preview calls the siman it is following. */
const labels = new WeakMap<Element, string>();

/**
 * Is any preview on screen narrowed?
 *
 * What `compile.ts` asks before setting `want_lines`. The runs cost a walk over
 * every laid-out frame and a re-parse of the source, and with no narrowed
 * preview open nothing would read them — the same argument as `want_pdf`, asked
 * by the same request.
 */
export function anyPreviewNarrowed(): boolean {
  return previewHosts().some((h) => windows_of.has(h));
}

/**
 * Are there runs for the pages currently drawn?
 *
 * What `main.ts` asks to decide whether narrowing a preview has to ask the
 * engine a question it has not asked yet. It used to ask `runtime.lastResult`
 * instead, which is the *last compile* and not *what is on screen* — the same
 * two records `currentPages` exists to keep apart, and reading the wrong one
 * here means a preview that is narrowed and never told which pages that is.
 */
export function hasPageLines(): boolean {
  return currentLines.length > 0;
}

/**
 * The pages this host draws: every page, or the ones its siman printed on.
 *
 * `null` means *all of them*, which is not the same as *an empty list*. An empty
 * list is a narrowed preview whose siman printed nowhere, and it must show
 * nothing rather than quietly showing the whole sefer — see `pagesOfLines`.
 */
function shownBy(host: Element, pages: string[]): Set<number> | null {
  const win = windows_of.get(host);
  if (!win) return null;
  // No runs at all means the engine was never asked, or the answer has not
  // arrived. Showing every page is right for that moment and wrong afterwards:
  // it is what an un-narrowed preview looks like, and the strip beside it still
  // names the siman. `compile.ts` asks on the very next compile, so this is the
  // one frame between narrowing and being told.
  if (!currentLines.length) return null;
  return new Set(pagesOfLines(currentLines.slice(0, pages.length), win));
}

/**
 * The last page set each document was seen with — so coming back to one shows
 * it rather than a blank pane and a wait.
 *
 * # Why a document is not blanked when you leave it
 *
 * A tab that is not on screen compiles nothing, which is the right answer for a
 * laptop with six seforim open. The wrong answer that usually comes with it is
 * an empty pane on the way back, for as long as a layout takes — 0.4 to 3
 * seconds, and the longer end is exactly the long sefer somebody keeps in a
 * second tab.
 *
 * So the pages are kept. Switching draws the ones this document had when it was
 * last looked at, immediately, and the fresh compile replaces them when it
 * lands. It is the same rule the Emacs package follows for a document that has
 * stopped compiling, and for the same reason: **a writer moves through states
 * where the page is not current, continuously, and blanking it makes the
 * preview useless exactly when it is being used.**
 *
 * Capped, because these are megabytes of SVG. The cap is generous next to the
 * number of documents anybody has open at once, and evicting the least recently
 * seen is the only policy that cannot throw away the tab you are about to
 * return to.
 */
const remembered = new Map<string, { pages: string[]; hashes: string[] }>();

/** How many documents' pages are kept. */
export const REMEMBERED_DOCUMENTS = 8;

/**
 * File a page set under the document it belongs to.
 *
 * The one writer of `remembered`, so the eviction policy is stated once. Both
 * callers reach it: leaving a document files what is on screen, and a background
 * compile files a page set that was never on screen at all.
 */
export function filePages(docId: string, pages: string[], hashes: string[] | undefined): void {
  if (!docId || !pages.length) return;
  // Names or no names: `render` copes with either, and a page set with no hashes
  // is still the right thing to show. An engine too old to send them would
  // otherwise remember nothing at all.
  hashes = hashes && hashes.length === pages.length ? hashes : [];
  // Deleted first so the re-insert moves it to the end: a `Map` keeps insertion
  // order, which is the whole of the eviction policy.
  remembered.delete(docId);
  remembered.set(docId, { pages, hashes });
  while (remembered.size > REMEMBERED_DOCUMENTS) {
    const oldest = remembered.keys().next();
    if (oldest.done) break;
    remembered.delete(oldest.value);
  }
}

/** Keep what is on screen now, filed under the document it belongs to. */
export function rememberPages(docId: string): void {
  if (!current) return;
  filePages(docId, current.pages, current.hashes);
}

/**
 * Draw what this document last looked like. `false` when nothing is kept, which
 * is the caller's cue to blank the pane rather than leave the last document's
 * pages standing under a different document's name.
 */
export function drawRemembered(docId: string): boolean {
  const had = remembered.get(docId);
  if (!had?.pages.length) return false;
  drawPagesEverywhere(had.pages, had.hashes);
  return true;
}

/**
 * Empty every preview pane.
 *
 * Used when there is nothing true to show — a document opened for the first
 * time, or the `onSwitch` policy, where the writer has asked for no kept pages.
 * The alternative is not "a blank pane" but "the previous sefer's pages under
 * this sefer's name", which is the defect this whole mechanism exists to close.
 */
export function clearPages(): void {
  drawPagesEverywhere([], []);
  for (const host of previewHosts()) {
    host.innerHTML = "";
    windows.delete(host);
  }
}

/** A document that is gone takes its pages with it. */
export function forgetPages(docId: string): void {
  remembered.delete(docId);
}

/** For tests, and for a reader wanting to know what is being held. */
export function rememberedCount(): number {
  return remembered.size;
}

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

/**
 * A `<symbol>` holding exactly one plain `<path d="…"/>`, which is what every
 * glyph Typst emits looks like. Anything else is left alone — see `flattenGlyphs`.
 */
const GLYPH_SYMBOL = /<symbol id="([^"]+)"[^>]*>\s*<path d="([^"]*)"\s*\/?>(?:<\/path>)?\s*<\/symbol>/g;

/** A `<use>` of one, in either spelling. */
const GLYPH_USE = /<use\s+xlink:href="#([^"]+)"([^>]*?)\s*(?:\/>|><\/use>)/g;

/**
 * Draw every glyph directly, instead of pointing at one.
 *
 * # Why this exists
 *
 * Typst writes a page as a glyph table plus references to it: 150 `<symbol>`s
 * holding the letterforms, and one `<use>` per letter on the page — 2,254 of
 * them on a page of this document. That is exactly the right way to write an SVG
 * file and very close to the worst way to put one in a browser. Measured, one
 * page:
 *
 *     as the engine sends it (2,254 `<use>`)     496 ms
 *     each `<use>` swapped for its `<path>`       21 ms
 *
 * A factor of **nineteen**, and it is the whole reason the preview stuttered:
 * that 496 ms was being spent in the frame the reader was scrolling, at every
 * page boundary, in both directions.
 *
 * # The one thing that was tried and is wrong
 *
 * `<use>` is *defined* as generating a `<g>` holding the referenced content, so
 * the obviously-correct substitution is a `<g transform="translate(x y)">`. That
 * spelling measures **384 ms** — barely better than the `<use>` it replaces. The
 * cost is not the number of elements (5,830 nodes against 3,618) and it is not
 * the shadow tree: it is *a container element carrying a transform*. The same
 * translate on the `<path>` itself is free. So the substitution has to flatten to
 * a leaf or it buys nothing, which is why this function refuses any symbol that
 * is not a single bare path rather than wrapping the general case.
 *
 * # What it refuses
 *
 * A symbol holding anything but one `<path d="…"/>` — no transform of its own, no
 * second element, no other attributes to merge. Those keep their `<use>`, and the
 * `<defs>` is kept whenever even one did, so nothing is ever left pointing at a
 * definition that has been deleted. On the documents this was measured against
 * nothing is refused; the branch is there because a glyph table is the engine's
 * business and not this file's, and a preview that silently drops a letterform
 * would be a far worse defect than a slow one.
 */
export function flattenGlyphs(svg: string): string {
  const paths = new Map<string, string>();
  let simple = 0;
  GLYPH_SYMBOL.lastIndex = 0;
  for (let m = GLYPH_SYMBOL.exec(svg); m; m = GLYPH_SYMBOL.exec(svg)) {
    paths.set(m[1], m[2]);
    simple++;
  }
  if (!simple) return svg;

  let missed = 0;
  GLYPH_USE.lastIndex = 0;
  const out = svg.replace(GLYPH_USE, (all, id: string, rest: string) => {
    const d = paths.get(id);
    if (d === undefined) {
      missed++;
      return all;
    }
    const x = /\sx="([^"]*)"/.exec(rest)?.[1] ?? "0";
    const y = /\sy="([^"]*)"/.exec(rest)?.[1] ?? "0";
    // Everything the `<use>` carried except its position, which becomes the
    // transform. `d` comes first so that a symbol that somehow named the same
    // attribute wins: HTML keeps the first of a repeated attribute, and the
    // referenced content is what should override the reference.
    const keep = rest.replace(/\s(?:x|y)="[^"]*"/g, "");
    const move = x !== "0" || y !== "0" ? ` transform="translate(${x} ${y})"` : "";
    return `<path d="${d}"${move}${keep}/>`;
  });

  // Nothing points at the table any more, so the table can go — a third of the
  // bytes, and 120 elements the browser would otherwise build and never draw.
  // Kept in full the moment even one `<use>` survived, because a definition that
  // is still referenced must still be there.
  return missed ? out : out.replace(/<defs>.*?<\/defs>/gs, "");
}

/**
 * How many flattened pages one window keeps.
 *
 * The values are the expensive thing — a flattened page is rendered SVG — so
 * this is bounded even though a window's own page count bounds it already: a
 * four-hundred-page sefer scrolled end to end would otherwise hold every page it
 * had ever drawn. Least-recently-used by re-insertion, the same way `partMemo`
 * is, and comfortably above `KEEP_PAGES` so the pages actually on screen are
 * never the ones evicted.
 */
const FLATTENED_MAX = 48;

function flattenedPage(w: Windowed, i: number): string {
  const hash = w.hashes[i];
  if (!hash) return flattenGlyphs(w.pages[i]);
  const had = w.flattened.get(hash);
  if (had !== undefined) {
    w.flattened.delete(hash);
    w.flattened.set(hash, had);
    return had;
  }
  const out = flattenGlyphs(w.pages[i]);
  w.flattened.set(hash, out);
  while (w.flattened.size > FLATTENED_MAX) {
    const oldest = w.flattened.keys().next();
    if (oldest.done) break;
    w.flattened.delete(oldest.value);
  }
  return out;
}

function fill(w: Windowed, node: HTMLElement, i: number) {
  if (w.showing[i] === w.hashes[i]) return;
  node.innerHTML = flattenedPage(w, i);
  w.showing[i] = w.hashes[i];
}

function empty(w: Windowed, node: HTMLElement, i: number) {
  if (!w.showing[i]) return;
  node.replaceChildren();
  w.showing[i] = "";
}

/**
 * How far page `i` is from the middle of what the reader is looking at.
 *
 * Falls back to the page's **index** when the pane has no geometry to offer.
 * That is not defensive padding: a pane that has just been built has not been
 * laid out yet, and `offsetTop` on a node with no layout is `0` for every page —
 * so without this, "nearest first" would silently become "whichever the set
 * iterated first" at exactly the moment the whole document is waiting to be
 * drawn. Index order is the honest answer there, and it is also the right one.
 */
function gapFromReader(host: HTMLElement, node: HTMLElement, i: number): number {
  const mid = host.scrollTop + host.clientHeight / 2;
  const at = node.offsetTop + node.offsetHeight / 2;
  return Number.isFinite(at) && Number.isFinite(mid) && (at !== 0 || mid !== 0) ? Math.abs(at - mid) : i;
}

/** How many pages this pane is currently holding drawn. */
function drawnCount(w: Windowed): number {
  let n = 0;
  for (const h of w.showing) if (h) n++;
  return n;
}

/**
 * Run a slice of work when the browser has nothing better to do.
 *
 * `requestIdleCallback` with a deadline, because a page that never hydrates is
 * worse than one that hydrates in a busy frame: a reader who scrolls fast enough
 * to outrun idle time must still be given their page. Safari only grew
 * `requestIdleCallback` in 16.4, so the timeout path is the whole implementation
 * on anything older rather than a fallback nobody reaches.
 */
function whenIdle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(fn, { timeout: 200 });
  else setTimeout(fn, 16);
}

/**
 * Hydrate the pages this pane has been told it wants, one per slice.
 *
 * **Nearest first**, measured against the middle of the pane, so a reader who
 * jumps to page 40 gets page 40 and not pages 1 through 39 on the way. The order
 * is recomputed each slice rather than sorted once, because the reader keeps
 * scrolling while this runs and the nearest page is a moving answer.
 *
 * One page per slice and then a fresh booking, rather than a loop with a
 * deadline check. A single page is 170 ms even with the contents skipped, so any
 * loop that checked a deadline *between* pages would still overrun it by a whole
 * page — the granularity of this work is one page, and pretending otherwise
 * would only make the overrun harder to read.
 */
function drain(host: HTMLElement): void {
  const w = windows.get(host);
  if (!w) return;
  w.draining = false;
  if (!w.wanted.size) return;

  let best = -1;
  let bestGap = Infinity;
  for (const i of w.wanted) {
    const node = w.nodes[i];
    // A page that has gone — the document recompiled shorter while this was
    // booked. Dropped rather than drawn into a node nobody owns.
    if (!node || w.showing[i] === w.hashes[i]) {
      w.wanted.delete(i);
      continue;
    }
    const gap = gapFromReader(host, node, i);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  if (best < 0) return;
  w.wanted.delete(best);
  fill(w, w.nodes[best], best);
  evictIfCrowded(w, host);
  if (w.wanted.size) book(host);
}

/** Book a drain, unless one is already booked. */
function book(host: HTMLElement): void {
  const w = windows.get(host);
  if (!w || w.draining) return;
  w.draining = true;
  whenIdle(() => drain(host));
}

/**
 * Let go of the furthest pages, once this pane is holding more than it should.
 *
 * Distance from the reader and not "left the margin", which is the change that
 * closes the stutter: a page just off the top of the pane is the page the reader
 * is most likely to want next, and emptying it charged 335 ms to get it back.
 * Since `content-visibility` makes a held page free to keep, the only reason
 * left to let one go is the cap — so that is the only reason it happens.
 */
function evictIfCrowded(w: Windowed, host: HTMLElement): void {
  let held = drawnCount(w);
  if (held <= KEEP_PAGES) return;
  const drawn: { i: number; gap: number }[] = [];
  for (let i = 0; i < w.nodes.length; i++) {
    if (!w.showing[i]) continue;
    drawn.push({ i, gap: gapFromReader(host, w.nodes[i], i) });
  }
  drawn.sort((a, b) => b.gap - a.gap);
  for (const { i } of drawn) {
    if (held <= KEEP_PAGES) break;
    empty(w, w.nodes[i], i);
    held--;
  }
}

/**
 * Draw `pages` into `host`, keeping only what is near the viewport.
 *
 * `hashes` names each page. Without them — an older engine, or any caller with
 * no names to give — everything is drawn at once, which is what this always did.
 */
export function drawPages(host: HTMLElement, pages: string[], hashes?: string[], lines?: LineRun[][]) {
  setCurrent(pages, hashes, lines);
  render(host, pages, hashes);
}

/**
 * Record what the open document's pages now are.
 *
 * Recorded whether or not there are names for them. This used to be `null`
 * without them, which was right for `drawCurrentInto` — a second pane reuses the
 * windowing and the windowing needs hashes — and wrong for `currentPages`, which
 * is about *what is on the screen* and is what Print reads. An engine too old to
 * send hashes would have printed nothing.
 */
function setCurrent(pages: string[], hashes?: string[], lines?: LineRun[][], text?: PrintedLine[][]) {
  current = { pages, hashes: hashes && hashes.length === pages.length ? hashes : [] };
  // Replaced, never merged, and emptied when a page set arrives without them.
  //
  // The runs describe *these* pages. Keeping the last set alive across a page
  // set that has none would mean a narrowed preview hiding pages of the document
  // you just switched to according to where the simanim were in the one you
  // left — which is the same defect the kept-pages cache was built to close, one
  // field along. Empty is the honest state, `shownBy` reads it as *not told yet*,
  // and the compile that follows says.
  currentLines = lines ?? [];
  currentText = text ?? [];
}

/**
 * Draw the open document's pages into another pane — a second preview, the
 * full-screen one, or a preview whose window has just changed.
 *
 * Guarded on *having drawn something*, not on having names for it. The guard
 * used to be `current?.hashes.length`, on the reasoning that a second pane
 * reuses the windowing and the windowing needs names — but `render` has a whole
 * branch for having none, and with that guard it could never be reached from
 * here. An engine that sends no fingerprints therefore left every second preview
 * blank, and, once a preview could narrow, left a widened one still holding the
 * pages of a siman it was no longer following.
 */
export function drawCurrentInto(host: HTMLElement) {
  if (current) render(host, current.pages, current.hashes);
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

/**
 * Draw a fresh compile into every preview pane there is.
 *
 * `lines` is the compile's answer to *which of the writer's lines printed on
 * which page*, when one was asked for — which is when a preview on screen is
 * narrowed, and not otherwise.
 */
export function drawPagesEverywhere(
  pages: string[],
  hashes?: string[],
  lines?: LineRun[][],
  text?: PrintedLine[][],
) {
  const hosts = previewHosts();
  // Recorded **before** the early return, and this is not a tidy-up.
  //
  // A source-only layout has no preview host at all, and this used to return
  // without touching `current` — so with the preview pane closed, `current` went
  // on holding whatever was last drawn while a preview was open. `currentPages`
  // is what Print and the page-range chooser read, so printing from a
  // source-only pane printed the pages of a document you had since left, at the
  // length of a document you were not looking at. The one output that is paper.
  setCurrent(pages, hashes, lines, text);
  if (!hosts.length) return;
  // The first pane draws; the rest reuse what it recorded, so a document with
  // four previews still compiles once. Each of them still decides for itself
  // *which* of the pages to show — one compile, and a window per pane.
  render(hosts[0], pages, hashes);
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

/**
 * What the pages on screen say, or nothing when the engine was never asked.
 *
 * The find drawer's preview half, and the only door to it. Empty is the honest
 * state and the drawer reports it as *not laid out yet* rather than as *no
 * matches* — see `find.FindResult.previewUnavailable`.
 */
export function currentPageText(): readonly (readonly PrintedLine[])[] {
  return currentText;
}

function render(host: HTMLElement, pages: string[], hashes?: string[]) {
  // Which of them this host is showing. `null` is every page.
  //
  // The pages it is *not* showing are hidden rather than left out, and that is
  // the whole of how narrowing a preview stays honest. A sliced list would
  // renumber every page after the first one dropped — and the page number is
  // what a click sends to `jump`, what the page-range chooser counts in, and
  // what the reader is reading. Hiding keeps `data-page` true, costs nothing
  // (a hidden box never intersects, so its SVG is never built), and needs no
  // second coordinate system to undo.
  const only = shownBy(host, pages);
  const shown = (i: number) => !only || only.has(i);

  // No names, or no observer to tell us what is on screen (a very old webview):
  // draw the lot, exactly as this did before either mechanism existed.
  if (!hashes || hashes.length !== pages.length || typeof IntersectionObserver === "undefined") {
    // **Not** through `flattenedPage`. This branch is reached precisely when the
    // names cannot be trusted — no `hashes` at all, or a list whose length
    // disagrees with the pages — so `hashes[i]` is either absent or naming a
    // different page, and caching under it would hand that page's SVG to this
    // one on the next draw. The cache is keyed on a name; a branch that exists
    // because there is no reliable name does not get to use it.
    host.innerHTML = pages.map((s) => `<div class="page">${flattenGlyphs(s)}</div>`).join("");
    windows.delete(host);
    // Hidden afterwards rather than written into the markup, so both paths
    // through this function narrow by setting the same property on the same
    // node — one rule, and no `hidden=""` for a reader of the markup to notice
    // is missing from the other branch.
    //
    // Only when there is a window. The nodes were built by the assignment above
    // and are visible by construction, so an un-narrowed host has nothing to
    // clear and this does not have to walk it.
    if (only) {
      for (let i = 0; i < host.children.length; i++) {
        (host.children[i] as HTMLElement).hidden = !shown(i);
      }
    }
    sayWindow(host, only);
    return;
  }

  let w = windows.get(host);
  if (!w) {
    w = {
      pages,
      hashes,
      flattened: new Map(),
      nodes: [],
      showing: [],
      observer: null,
      near: new Set(),
      wanted: new Set(),
      draining: false,
    };
    w.observer = new IntersectionObserver(
      (entries) => {
        const state = windows.get(host);
        if (!state) return;
        let book_ = false;
        for (const e of entries) {
          const node = e.target as HTMLElement;
          const i = Number(node.dataset.page);
          // A node this pane no longer owns — removed, or left over from a pane
          // something else rebuilt. Reporting it would write the page into a
          // node nobody can see and, worse, mark the page as drawn.
          if (!(i >= 0) || state.nodes[i] !== node) continue;
          // **Recorded, not drawn.** This callback runs in the frame the reader
          // is scrolling; drawing a page here is the 335 ms that made the
          // preview stutter at every page boundary. `drain` does it in idle
          // time. A page that leaves keeps its drawing — see `evictIfCrowded`
          // for the only reason one is ever given up.
          if (e.isIntersecting) {
            state.near.add(i);
            if (state.showing[i] !== state.hashes[i]) {
              state.wanted.add(i);
              book_ = true;
            }
          } else {
            state.near.delete(i);
            state.wanted.delete(i);
          }
        }
        if (book_) book(host);
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
    // The bookings went with the nodes they named. A drain that survived this
    // would look up `w.nodes[i]` for a page index that now means a different
    // page, which is the one thing the identity check exists to prevent.
    w.wanted.clear();
    w.near.clear();
  }
  // The flattened pages named by the *previous* list, dropped whenever that list
  // is not this one.
  //
  // A page's name is only meaningful inside the draw that produced it. The blind
  // full-redraw path above hands out no names at all, so a draw after it can
  // legitimately reuse a name for different content — which is exactly what
  // `pagecache.test.mjs` does, and what it is right to insist on. Cleared here
  // rather than per page, because the question is about the list.
  //
  // Nothing is lost by it: the repeated work this cache exists to remove is
  // `fill` re-flattening the same page as the reader scrolls back and forth
  // *between* draws, and that all happens after this line.
  if (w.hashes.length !== hashes.length || w.hashes.some((h, i) => h !== hashes[i])) {
    w.flattened.clear();
  }
  w.pages = pages;
  w.hashes = hashes;

  // Pages the document no longer has, first, so index `i` means the same page
  // everywhere below.
  while (w.nodes.length > pages.length) {
    const last = w.nodes.pop();
    w.showing.pop();
    w.wanted.delete(w.nodes.length);
    w.near.delete(w.nodes.length);
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
    // The property rather than `setAttribute`, because it reflects the attribute
    // both ways on a real element and is a plain assignment everywhere else.
    node.hidden = !shown(i);
    if (shown(i)) {
      // A page whose content has changed **and that the reader is near**. Booked
      // rather than rewritten here: this runs on every compile, and rewriting
      // inline is time spent in whatever frame the compile landed in — which,
      // since compiles follow typing, is a frame the writer is in.
      //
      // `near` and not `showing` is the load-bearing word. A page that changed
      // while the reader is forty pages away is left holding what it holds; it
      // is stale, `fill` knows it is stale from the hash, and it is redrawn the
      // moment the observer says somebody has come back to it. Redrawing all of
      // them here is the 9.7 MB-per-keystroke defect this file exists to close.
      if (w.near.has(i) && w.showing[i] !== w.hashes[i]) w.wanted.add(i);
    } else {
      // Emptied as well as hidden. The observer will not fire for a box with no
      // layout, so a page that was on screen when the pane narrowed would keep
      // its megabyte of SVG for as long as the session lasted. This is the one
      // eager empty left, and it is not about distance from the reader: a hidden
      // page is not coming back until the pane is widened.
      w.wanted.delete(i);
      w.near.delete(i);
      empty(w, node, i);
    }
  }
  if (w.wanted.size) book(host);
  sayWindow(host, only);
}

/**
 * Write what this preview is holding into its pane's strip.
 *
 * A preview showing four pages of a forty-page sefer, with nothing anywhere
 * saying why, is the failure this whole repository keeps finding: a working
 * mechanism behind a surface that does not admit to it. The strip names the
 * siman and counts the pages, so a short pane is a *stated* short pane.
 *
 * The empty case is the one that earns it. A siman that has printed nowhere —
 * a broken document, or a section holding nothing that leaves ink — gives a
 * blank pane, and a blank pane is what a crash looks like. It says so instead.
 */
function sayWindow(host: HTMLElement, only: Set<number> | null) {
  const strip = host.parentElement?.querySelector?.<HTMLElement>("[data-preview-window]");
  if (!strip) return;
  const label = labels.get(host) ?? "";
  // `""` rather than removing the attribute: `.pane-window:empty` is what makes
  // the strip collapse when nothing is narrowed, and the count is only ever read
  // as `[data-pages="0"]`.
  strip.dataset.pages = only ? String(only.size) : "";
  strip.textContent = !only
    ? ""
    : only.size
      ? tf(only.size === 1 ? "previewOfOnePage" : "previewOfPages", label, only.size)
      : tf("previewOfNothing", label);
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

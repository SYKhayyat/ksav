// Linked scrolling between panes, and the follow of the caret they serve.
// Owns: the scroll floor (who is driving), the echo recognition, the per-frame
// follow, the exact settle against the compiler's answer, the printed map that
// the follow interpolates over, and the caret-follow timer.
// Defers: which panes exist and what they are to `panestate`; the printed map's
// prefix arithmetic to `scrollmap`; the actual page drawing to `preview`.
// Refuses: reaching into the views map wholesale — every read goes through
// paneLookup functions, so the arrangement can change under a scroll without
// a stale reference surviving it.

import * as panestate from "./panestate";
import * as panes from "./panes";
import * as runtime from "./runtime";
import * as docs from "./docs";
import { settings, docConfig } from "./settings";
import { currentPages, pageBox } from "./preview";
import { pixelInPage } from "./jump";
import { bodyOnScreen } from "./compile";
import { printedPrefix, fractionAtLine, lineAtFraction, anchorFor, worthFollowing, withinBlock, interpolateAcrossLine } from "./scrollmap";
import { docTextOf } from "./spans";

/**
 * Scroll, remembered per pane and optionally tied to a sibling's.
 *
 * The link is per pane and off by default on a pane a writer opened deliberately
 * to look somewhere else, which is the only default that makes the feature worth
 * having: a second view whose scroll follows the first is the first view again.
 */
// ---------------------------------------------------------------- linked scroll
//
// # The defect this shape exists to close
//
// Linked scrolling used to be guarded by a boolean: set `mirroring`, write the
// other pane's `scrollTop`, clear `mirroring` in a `finally`. **That guard never
// guarded anything**, and the writer reported the result as the worst thing in
// the application: *"the scroll is terrible and it stutters on the preview. This
// makes the source also stutter."*
//
// A scroll event is not dispatched when `scrollTop` is assigned. It is queued
// and delivered later, at frame time — so by the time the other pane's handler
// ran, the `finally` had already put `mirroring` back to `false`. Every write
// therefore came back as an event indistinguishable from a person scrolling,
// and the two panes spent the whole scroll answering each other. Measured on a
// real document, forty wheel notches of 50px each:
//
//   • **67 scroll events for 40 notches**, and the two panes converging on each
//     other in between.
//   • The source travelled **1086px of the 2000px asked for** — the sync ate
//     nearly half of every scroll, because each echo dragged the reader back
//     toward where the *preview* thought they should be.
//   • Worst frame **591 ms**, against 38 ms with the link switched off. The
//     echoes were forcing CodeMirror to re-measure and the preview to re-draw
//     pages several times per frame.
//
// # The shape now: somebody is driving
//
// A boolean cannot express this because the question is not *are we inside a
// mirror* — it is *whose scroll is this*. So:
//
//   • The pane a person is actually scrolling **takes the floor**, and holds it
//     for `SCROLL_FLOOR_MS` past its last event. While it is held, every other
//     pane's scroll events are echoes by definition and are ignored.
//   • A write is also **remembered exactly**, and an event arriving at that
//     value is an echo whoever holds the floor. This is what makes the floor
//     short: the timer is a backstop for rounding, not the mechanism.
//   • The follow itself is **batched into one animation frame**. Scroll events
//     can outpace frames, and syncing per event meant several `lineBlockAtHeight`
//     measurements — each of which can force layout — for one frame of movement.
//
// The two together mean a linked pane follows and never talks back, which is
// what "linked" was always supposed to mean.

/**
 * How long the pane being scrolled keeps the floor after its last event.
 *
 * Long enough to cover the gap between a scroll event and the echo it provokes,
 * which is a frame or two; short enough that moving the mouse to the other pane
 * and scrolling it does not feel refused. Renewed on every event of the pane
 * that holds it, so a continuous scroll holds the floor for as long as it lasts.
 */
const SCROLL_FLOOR_MS = 150;

/** The pane whose scroll everything else is currently following. */
let scrollFloor: { pane: string; until: number } | null = null;

/**
 * What was last written into each pane's scroller, by us and not by a person.
 *
 * Read back after the assignment rather than stored as the value asked for: the
 * browser clamps a scroll to the scrollable range, so asking for 90,000 and
 * remembering 90,000 would leave the echo at 16,000 looking like a person.
 */
const scrollWritten = new Map<string, number>();

/** The follow booked for the next frame, if one is booked. */
let scrollBooked: {
  from: panes.Leaf;
  to: panes.Leaf;
  top: number;
  /** Which way the pane that is leading moved: `+1` down, `-1` up. */
  dir: -1 | 0 | 1;
} | null = null;

let scrollFrame = 0;

export function wirePaneScroll(pane: panes.Leaf, host: HTMLElement) {
  const scroller = () =>
    pane.role === "source" ? (panestate.paneViewOf(pane.id)?.scrollDOM ?? host) : host;
  host.addEventListener(
    "scroll",
    () => {
      const top = scroller().scrollTop;
      const now = performance.now();

      // Our own write coming back. Recorded — this pane really is at that
      // position — but it claims no floor and starts no follow, because the
      // only reason it moved is that some other pane moved first.
      const echo = scrollWritten.get(pane.id);
      if (echo !== undefined && Math.abs(top - echo) <= 1) {
        scrollWritten.delete(pane.id);
        pane.scrollTop = top;
        return;
      }
      // Somebody else is driving and this is not the value we wrote — a
      // rounding-off echo, or a follow that overshot into another follow.
      // Either way it is not a person, and treating it as one is the loop.
      if (scrollFloor && scrollFloor.pane !== pane.id && now < scrollFloor.until) return;

      // **The dead zone.** A trackpad emits an event for a two-pixel drift and
      // following one is a preview that shivers while a hand rests on the pad.
      // Read before the floor is claimed, so a shiver does not make this pane
      // the leader either — otherwise the drift would lock the *other* pane out
      // for the length of the floor while doing nothing itself.
      const was = pane.scrollTop ?? top;
      const moved = top - was;
      if (!worthFollowing(moved, settings.syncDeadZone)) return;

      scrollWritten.delete(pane.id);
      scrollFloor = { pane: pane.id, until: now + SCROLL_FLOOR_MS };
      pane.scrollTop = top;
      // Down or up, which is what the anchor is chosen from. Zero only if the
      // pane genuinely has not moved, which the dead zone has already excluded.
      const dir: -1 | 0 | 1 = moved > 0 ? 1 : moved < 0 ? -1 : 0;
      // Both halves, and they are not the same claim. `linked` says these two
      // panes are a pair — an arrangement, remembered with the tab. The setting
      // says pairs follow each other at all, and until now it said nothing:
      // "synced scrolling" was the one checkbox in the application that could
      // not turn synced scrolling off.
      if (settings.syncScroll === false) return;
      if (!pane.linked) return;
      const other = panes.sibling(panestate.paneTree, pane.id);
      if (!other || !other.linked) return;
      bookLinkedScroll(pane, other, top, dir);
    },
    true,
  );
}

/**
 * Follow, once, on the next frame.
 *
 * Overwritten rather than queued: two scroll events in one frame mean the reader
 * is somewhere newer, and following the older position first would be work done
 * to be immediately undone.
 */
export function bookLinkedScroll(from: panes.Leaf, to: panes.Leaf, top: number, dir: -1 | 0 | 1 = 0) {
  scrollBooked = { from, to, top, dir };
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const job = scrollBooked;
    scrollBooked = null;
    if (!job) return;
    // Re-read the panes: an arrangement can change between the event and the
    // frame, and writing into a pane that has been closed is a null dereference
    // in the middle of a scroll.
    const live = panes.find(panestate.paneTree, job.to.id);
    if (!live || !live.linked || !panes.find(panestate.paneTree, job.from.id)) return;
    const target = live.role === "source" ? panestate.paneViewOf(live.id)?.scrollDOM : panestate.paneHostOf(live.id);
    if (!target) return;
    syncLinkedScroll(job.from, live, job.top, target, job.dir ?? 0);
    // Estimate now, exact when the hand stops. See `settleExactly`.
    settleExactly(job.from, live, job.dir ?? 0);
    // What we wrote, as the browser actually clamped it, so the echo is
    // recognised. See `scrollWritten`.
    scrollWritten.set(live.id, target.scrollTop);
  });
}

/**
 * Once the hand stops, put the preview where the sefer actually printed.
 *
 * **Estimate while moving, exact when it settles.** The follow above reads
 * `scrollmap.ts`'s printed map, which is a line-height model: it costs nothing,
 * it is continuous, and it is an estimate — a page break, a note band, a figure
 * or a fold all move the real answer away from it, and on a long sefer the
 * error accumulates down the page. The exact answer is the compiler's, and
 * asking it per scroll event would be a layout per frame.
 *
 * So the estimate lands immediately and this settles afterwards, at
 * `syncSettleMs` after the last movement — one layout per gesture rather than
 * one per frame.
 *
 * Only source → preview: the map's error is the *printed* position of a source
 * line, and the other direction has no compiler question to ask. And only while
 * nothing else has taken the floor, so a settle that arrives after the writer
 * has started scrolling something else is dropped rather than yanking the pane
 * out from under them.
 */
let settleTimer = 0;

function settleExactly(from: panes.Leaf, to: panes.Leaf, dir: -1 | 0 | 1) {
  clearTimeout(settleTimer);
  if (settings.syncExact === false) return;
  if (from.role !== "source" || to.role !== "preview") return;
  const delay = Math.max(0, settings.syncSettleMs ?? 150);
  settleTimer = window.setTimeout(() => {
    void settleNow(from, to, dir);
  }, delay);
}

async function settleNow(from: panes.Leaf, to: panes.Leaf, dir: -1 | 0 | 1) {
  const view = panestate.paneViewOf(from.id);
  const host = panestate.paneHostOf(to.id);
  // The arrangement can change between the gesture and the settle.
  if (!view || !host || !runtime.backend) return;
  if (!panes.find(panestate.paneTree, from.id) || !panes.find(panestate.paneTree, to.id)) return;
  const pages = currentPages();
  if (!pages.length) return;
  const mp = matchFraction(dir);
  // The line at the pane's own match point — the same anchor the estimate used,
  // so the settle is a correction to it rather than a different question.
  const anchorY = view.scrollDOM.scrollTop + mp * view.scrollDOM.clientHeight;
  const block = view.lineBlockAtHeight(anchorY);
  const line = view.state.doc.lineAt(block.from);
  const { body, offset } = bodyOnScreen();
  const points = await runtime.backend
    .reveal(
      body,
      docConfig(),
      { line: line.number + offset, column: 1 },
      docs.requestAssets(runtime.currentDoc?.assets ?? []),
    )
    // A line that prints nothing — a comment, a `#הגדרות_*` line, a fold's
    // marker — is not an error and not worth a word in the status bar. The
    // estimate stands, which is what it is for.
    .catch(() => []);
  const at = points[0];
  const box = at ? pageBox(pages[at.page]) : null;
  if (!at || !box) return;
  // Somebody started scrolling while the compiler was thinking. Their gesture
  // wins: a preview that jumps a second after you have moved on is worse than
  // one that is a few pixels out.
  if (scrollFloor && scrollFloor.pane !== from.id && performance.now() < scrollFloor.until) return;
  const node = host.querySelector<HTMLElement>(`.page[data-page="${at.page}"]`);
  if (!node) return;
  const spot = pixelInPage(at, node.getBoundingClientRect(), box);
  const y = node.offsetTop + spot.y - mp * host.clientHeight;
  const want = clampScroll(y, host);
  if (Math.abs(want - host.scrollTop) < 1) return;
  host.scrollTop = want;
  // Our own write, so the pane's own handler recognises the echo rather than
  // treating the settle as a person scrolling and following it back.
  scrollWritten.set(to.id, host.scrollTop);
}

/**
 * Move a linked pane to where its partner is, in the currency each understands.
 *
 * Two source panes, or two previews, are the same kind of thing and follow each
 * other by fraction. A source and a preview are not, and go through the printed
 * map in `scrollmap.ts` for the reason that module exists: a fraction of the
 * source's pixels is not a fraction of the printed pixels in any document with
 * comments or folds in it.
 */
export function syncLinkedScroll(
  from: panes.Leaf,
  to: panes.Leaf,
  top: number,
  target: HTMLElement,
  dir: -1 | 0 | 1 = 0,
) {
  if (from.role === to.role) {
    const src = from.role === "source" ? panestate.paneViewOf(from.id)!.scrollDOM : panestate.paneHostOf(from.id)!;
    target.scrollTop = (top / Math.max(1, src.scrollHeight)) * target.scrollHeight;
    return;
  }
  // Where the two panes line up — the top, middle or bottom of the viewport.
  // The line at this point of one side is put at the same point of the other,
  // so a writer who sets it to the middle watches the line they are on stay put
  // in both panes rather than at the very top edge.
  const mp = matchFraction(dir);
  if (from.role === "source") {
    const view = panestate.paneViewOf(from.id)!;
    // The point `mp` down the source viewport, in document pixels.
    const anchorY = top + mp * view.scrollDOM.clientHeight;
    // The printed fraction of *that pixel* — not of the line it lands in. The
    // map answers per line, so a raw `fractionAtLine` moves the preview only when
    // the anchor crosses a line boundary and holds it still in between, which is
    // the "does not scroll smoothly at all" the report was about: the preview
    // jumps a line's worth at a time. Interpolating between this line's fraction
    // and the next by how far the anchor is *through* the line's height makes the
    // follow continuous.
    const block = view.lineBlockAtHeight(anchorY);
    const lineNo = view.state.doc.lineAt(block.from).number - 1;
    const within = withinBlock(anchorY, block);
    const map = printedMap();
    const frac = interpolateAcrossLine(map, lineNo, within);
    target.scrollTop = clampScroll(frac * target.scrollHeight - mp * target.clientHeight, target);
  } else {
    const host = panestate.paneHostOf(from.id)!;
    const view = panestate.paneViewOf(to.id)!;
    const map = printedMap();
    const frac = (top + mp * host.clientHeight) / Math.max(1, host.scrollHeight);
    // The line the fraction reaches, and how far past that line's own printed
    // fraction it is — the same interpolation the other way, so scrolling the
    // preview glides the source rather than snapping it one line at a time.
    const lineNo = lineAtFraction(map, frac);
    const g0 = fractionAtLine(map, lineNo);
    const g1 = fractionAtLine(map, lineNo + 1);
    const within = g1 > g0 ? clamp01((frac - g0) / (g1 - g0)) : 0;
    const doc = view.state.doc;
    const block = view.lineBlockAt(doc.line(Math.max(1, Math.min(lineNo + 1, doc.lines))).from);
    const sourceY = block.top + within * block.height;
    target.scrollTop = clampScroll(sourceY - mp * target.clientHeight, target);
  }
}

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const clampScroll = (y: number, el: HTMLElement) =>
  Math.max(0, Math.min(y, el.scrollHeight - el.clientHeight));

/**
 * Move the preview to where the caret is — *"if the cursor is somewhere, that is
 * what should match."*
 *
 * Fired when the caret moves and nothing else, so it never fights a scroll: a
 * held arrow key or a click brings the preview to the caret's line, but dragging
 * the scrollbar does not, because dragging does not move the caret. Cheap on
 * purpose — it reads the printed map, not the compiler, so it costs nothing and
 * is safe to run on every cursor move. The exact, glyph-level answer is the
 * click-to-reveal, which is worth the layout because a click asks for it.
 *
 * Only the plain one-source-one-preview arrangement; a split window has more than
 * one of each and the scroll-floor follow already keeps those in step.
 */
let caretFollowTimer = 0;

export function followCaretInPreview() {
  if (settings.followCaret === false) return;
  clearTimeout(caretFollowTimer);
  caretFollowTimer = window.setTimeout(() => {
    // Not while a pane is being scrolled by hand: that is the writer reading
    // somewhere the caret is not, and yanking the preview back is the opposite
    // of help.
    if (scrollFloor && performance.now() < scrollFloor.until) return;
    const hosts = document.querySelectorAll<HTMLElement>(".preview-host");
    if (hosts.length !== 1) return;
    const host = hosts[0];
    const view = runtime.view;
    if (!view) return;
    const head = view.state.selection.main.head;
    const lineNo = view.state.doc.lineAt(head).number - 1;
    const map = printedMap();
    // Interpolate between this line and the next by how far down the line
    // block the caret *visually* sits — the same currency `syncLinkedScroll`
    // interpolates in. The first cut of this used the caret's character offset
    // within the line (`(head - block.from) / block.length`), which is a
    // horizontal quantity: typing along a line walked the preview toward the
    // next printed line, and a caret at the end of the document — the maximum
    // offset — pinned every short document to its bottom. The visual y of the
    // caret is what a fraction of a line has anything to do with, and the
    // helper is one function both callers share so this cannot drift apart
    // again. #119.
    //
    // Also avoids jumping to the bottom when the caret is at the end of a
    // short document: a visual y near the top of the last line keeps the
    // fraction at that line's own prefix, and `clampScroll` bounds the rest.
    const block = view.lineBlockAt(head);
    const coords = view.coordsAtPos(head);
    const within = coords ? withinBlock(coords.top, block) : 0;
    const frac = interpolateAcrossLine(map, lineNo, within);
    const mp = matchFraction();
    const at = clampScroll(frac * host.scrollHeight - mp * host.clientHeight, host);
    // Claim the floor and record the write so the preview's own scroll event —
    // which this assignment provokes — is recognised as an echo rather than a
    // person, the same way `bookLinkedScroll` does. `wirePaneScroll` keys on the
    // pane id, which is the host's element id with its prefix removed.
    const paneId = host.id.replace("pane-host-", "");
    scrollFloor = { pane: "caret", until: performance.now() + SCROLL_FLOOR_MS };
    scrollWritten.set(paneId, at);
    host.scrollTop = at;
  }, 100);
}

/**
 * Where two linked panes line up, for a movement in this direction.
 *
 * `direction` — the default — is the report: *"scrolling down should match
 * top-to-top, scrolling up should match bottom-to-bottom"*. Going down, the
 * line the reader wants is the one arriving at the top of the pane; coming
 * back, it is the one arriving at the bottom. A fixed anchor is wrong in one of
 * the two directions by half a viewport, every time.
 *
 * `dir` is `+1` down, `-1` up, `0` when nobody is moving — a caret follow or a
 * click, which have no direction and take the middle.
 */
export function matchFraction(dir: -1 | 0 | 1 = 0): number {
  return anchorFor(settings.syncMatch, dir);
}

/**
 * The printed-character prefix sum for the document as it stands.
 *
 * Rebuilt lazily and cached against the document's length and its first
 * changed-marker, because it is a full pass over the text and the thing that
 * asks for it is a scroll event. Invalidated by `invalidateScrollMap`, which
 * the update listener calls on every document change — one comparison per
 * keystroke, one rebuild per scroll after a change.
 */
let scrollPrefix: number[] | null = null;

export function invalidateScrollMap() {
  scrollPrefix = null;
}

function printedMap(): number[] {
  if (!scrollPrefix) scrollPrefix = printedPrefix(docTextOf(runtime.view.state.doc));
  return scrollPrefix;
}
/** Record what we wrote into a pane's scroller, so the event that comes
 * back is recognised as an echo rather than as a person scrolling. */
export function noteScrollWrite(id: string, top: number): void {
  scrollWritten.set(id, top);
}

/** Somebody claims the scroll floor outside a scroll event: a click in the
 * preview has just moved the caret, and the follow it would provoke is the
 * one thing that should not steer. */
export function claimFloor(pane: string): void {
  scrollFloor = { pane, until: performance.now() + SCROLL_FLOOR_MS };
}

/** A click in the source has asked for the exact reveal, so the cheap
 * caret-follow it would otherwise double is cancelled, not rescheduled. */
export function cancelCaretFollow(): void {
  clearTimeout(caretFollowTimer);
}

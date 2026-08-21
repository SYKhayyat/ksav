// Keeping the source and the preview on the same place in the document.
//
// # The defect
//
// Synced scrolling was two scrollbars kept at the same fraction:
//
//     dst.scrollTop = (src.scrollTop / srcExtent) * dstExtent
//
// with a comment beside it calling that "percentage-based, which is all a
// scrollbar can honestly be". That claim is false in this application, and the
// writer who found it said why in the same breath: *"the scrolls are not
// aligned — I am locked at a different point in the source in preview. This
// might be because I have so many comments."*
//
// They are right, and the reasoning is worth writing down because it decides
// the fix. A fraction of the **source's pixels** equals a fraction of the
// **printed pixels** only if every line of source prints. In a Ksav document a
// great deal of it does not:
//
//   - `//` comments and `/* … */` blocks, which are the whole point of a
//     marked-up document and were most of that writer's file;
//   - command heads — `#הערה[`, `#טבלה(עמודות: 2,` — which are syntax, not ink;
//   - the closing brackets, the blank structural lines, the `#כלול` directives.
//
// A page of margin notes is a page of source and no page of print, so the two
// scrollbars come apart exactly in proportion to how much a writer has
// annotated — which is to say, the harder somebody works on a document, the
// more wrong this gets. That is the shape of defect worth fixing at the root
// rather than nudging.
//
// # The fix
//
// Keep the proportion; change the **currency**. Instead of asking what fraction
// of the source's height is above the fold, ask what fraction of the document's
// *printing characters* is above it. Comments weigh nothing, command heads weigh
// nothing, and the fraction means the same thing on both sides again.
//
// # What this is not
//
// It is not exact, and it does not pretend to be. `backend.reveal` answers
// exactly — that is forward search, `revealCursor` — and it costs a full layout
// of the document per question, which is fine once on a keystroke and absurd
// sixty times a second while somebody drags a scrollbar. What is here is the
// cheap answer made honest: one pass over the text when it changes, an array
// lookup per scroll event.
//
// # The residue, and its repair
//
// That comment used to end here, with the residue stated and left: a
// **deferred** note body prints at the foot of the page its marker is on, not
// where its text sits in the source, so a document keeping all its bodies in a
// block at the end drifts across that whole block. It was written off as
// needing "the engine's own mapping", and that is not true — it needs the
// engine's mapping to be exact, and this map has never been exact. It is a
// proportion, and the fix is a proportion too.
//
// A deferred body is *text that prints somewhere else*. So count it somewhere
// else: strike its weight from where it is written and add the same weight at
// its **marker**, which is the one place in the source that knows where the
// body will actually appear. The body still weighs what it weighs; the sefer's
// printed length is unchanged; what moves is the position that weight is
// attributed to, which is the only thing this map was ever measuring.
//
// It is still not exact — a body prints at the foot of its marker's page rather
// than at the marker itself, which is up to a page out. But the error is now
// bounded by a page, where before it was bounded by *the distance from the
// marker to the end of the document*, and it grows with the number of notes
// rather than with how far away the writer files them. For the writer whose
// report started all of this — *"this might be because I have so many
// comments"* — that is the difference between unusable and slightly off.
//
// An orphan body, one no marker names, contributes nothing anywhere: it does
// not print, so it does not weigh. That is not an edge case in this
// application, it is what a note looks like for the seconds between filing the
// body and writing the marker.

import { proseRegions } from "./spell";
import { scan } from "./deferred";

/**
 * How many printing characters sit above the start of each line.
 *
 * Index `i` is the count for lines `0 … i-1`, so the array has one more entry
 * than the document has lines and the last entry is the total. A prefix sum
 * rather than a per-line array because every reader wants "how much is above
 * here", and asking that of a per-line array is a loop per scroll event.
 *
 * "Printing" is [`proseRegions`]' answer and deliberately not a second one.
 * That function exists so the spell-checker does not underline command names,
 * which is the same question this asks — *what of this text will a reader
 * actually see* — and this repository has been bitten enough times by two
 * modules holding separate opinions about the markup.
 */
export function printedPrefix(text: string): number[] {
  // A mask, so the region list can be consulted once rather than per line.
  const prints = new Uint8Array(text.length);
  for (const r of proseRegions(text)) {
    for (let i = r.from; i < r.to; i++) prints[i] = 1;
  }

  // Weight a deferred body carries to its marker, added at the marker's own
  // position. Sparse because most documents have no deferred notes at all and
  // an array the length of a sefer would be paid for by everybody.
  const carried = deferredCarry(text, prints);

  const out: number[] = [0];
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    total += carried.get(i) ?? 0;
    if (text.charCodeAt(i) === 10) {
      out.push(total);
      continue;
    }
    // Whitespace inside a printing region is real — it is the space between
    // words — but a line of nothing but indentation is not content, and
    // counting it as such is how a deeply nested table drags the preview
    // forward. Newlines are counted above; everything else that prints counts.
    if (prints[i]) total++;
  }
  out.push(total);
  return out;
}

/**
 * Move every deferred body's weight to the marker that summons it.
 *
 * **Mutates `prints`**, striking the body out where it is written — which is
 * the half that makes this a move rather than a duplication. Getting only the
 * addition right would count every note twice and make the map worse than the
 * one it replaces, so the two happen in one place and neither can be forgotten.
 *
 * The weight is counted from the mask rather than from the body's length, so a
 * body containing a comment or a nested command head weighs what it prints and
 * not what it occupies — the same currency as everything else here.
 *
 * Two markers naming one body is legal and means the note is cited twice. The
 * weight goes to the **first** marker only: the body is printed once, at the
 * first page that calls for it, and splitting it between the two would invent a
 * quantity of ink that does not exist.
 */
function deferredCarry(text: string, prints: Uint8Array): Map<number, number> {
  const carried = new Map<number, number>();
  // Cheap out before scanning. `scan` walks the document and most documents
  // have no deferred notes; this map is rebuilt whenever the text changes.
  if (!text.includes("#")) return carried;

  const { refs, defs } = scan(text);
  if (!defs.length) return carried;

  // First marker per name, in source order — which is reading order, and so the
  // order the pages will call for the bodies in.
  const firstRef = new Map<string, number>();
  for (const r of refs) {
    if (!firstRef.has(r.name)) firstRef.set(r.name, r.from);
  }

  for (const d of defs) {
    // What this body prints, before it is struck out.
    let weight = 0;
    for (let i = d.bodyFrom; i < d.bodyTo; i++) if (prints[i]) weight++;
    // Struck from where it is written whether or not anybody names it. An
    // orphan body prints nowhere, so leaving it counted here would put printed
    // length in the one place the reader is guaranteed never to see it.
    for (let i = d.from; i < d.to; i++) prints[i] = 0;
    const at = firstRef.get(d.name);
    if (at === undefined) continue;
    carried.set(at, (carried.get(at) ?? 0) + weight);
  }
  return carried;
}

/**
 * How far down a pane a point sits: 0 its top edge, 1 its bottom.
 *
 * The unit `clickTarget: "keep"` is expressed in. A click three quarters of the
 * way down the source should be answered three quarters of the way down the
 * preview, and that is the only thing either side needs to agree on — not
 * pixels, which differ between the panes, and not lines, which is the question
 * being answered rather than a way of asking it.
 *
 * A pane of no height answers 0 rather than dividing by it. That happens for
 * real: a pane mid-collapse, or one being measured before layout.
 */
export function viewportFraction(top: number, height: number, y: number): number {
  if (height <= 0) return 0;
  return Math.max(0, Math.min(1, (y - top) / height));
}

/**
 * The fraction of the document that has printed above a line.
 *
 * Zero when nothing prints at all, which is a real state — a brand-new document,
 * or one that is currently all comments — and the honest answer there is "the
 * top", not a division by zero.
 */
export function fractionAtLine(prefix: number[], line: number): number {
  const total = prefix[prefix.length - 1];
  if (!total) return 0;
  const at = prefix[Math.max(0, Math.min(line, prefix.length - 1))];
  return Math.max(0, Math.min(1, at / total));
}

/**
 * The line that fraction of the printed document reaches — the inverse.
 *
 * Binary search, because this runs on every scroll event of the preview and a
 * sefer is tens of thousands of lines. Returns the **last** line at or below the
 * target rather than the first line above it: scrolling to a fraction should
 * leave the content at that fraction visible at the top of the pane, and
 * overshooting by a line puts it just off the top.
 *
 * The search stops one short of the end of the array, and that is not an
 * off-by-one. The prefix has one entry per line *boundary*, so its last index
 * is the position after the final line — a real answer to "how much printed",
 * and not a line anybody can scroll to. Returning it made the caller clamp,
 * which is the wrong place: a function called `lineAtFraction` should hand back
 * a line.
 */
export function lineAtFraction(prefix: number[], f: number): number {
  const total = prefix[prefix.length - 1];
  const last = Math.max(0, prefix.length - 2);
  if (!total) return 0;
  const want = Math.max(0, Math.min(1, f)) * total;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (prefix[mid] <= want) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// ---------------------------------------------------------------- the anchor
//
// Where two linked panes line up. Here rather than in the shell because it is a
// rule and not a rendering — the shell had it as one line of nested ternaries
// inside `matchFraction`, which is exactly the shape that gets a fourth answer
// added to it wrongly.

/** The four answers a writer can give. */
export type SyncMatch = "direction" | "top" | "middle" | "bottom";

/**
 * The point down the viewport the two panes line up on, `0` top and `1` bottom.
 *
 * `direction` is the report: *"scrolling down should match top-to-top,
 * scrolling up should match bottom-to-bottom."* Which is what reading wants and
 * what no fixed anchor can give — going down, the line the reader cares about
 * is the one arriving at the **top**; coming back, it is the one arriving at
 * the **bottom**. A fixed middle is wrong in both directions by half a
 * viewport, and a fixed top is right going down and useless coming back.
 *
 * `dir` is `+1` down, `-1` up, and `0` for the things that have no direction —
 * a caret follow, a click on the page. Those take the middle, because a reader
 * who asked to be shown one place wants it where they can see it rather than at
 * an edge.
 */
export function anchorFor(match: SyncMatch | undefined, dir: -1 | 0 | 1): number {
  switch (match ?? "direction") {
    case "top":
      return 0;
    case "bottom":
      return 1;
    case "middle":
      return 0.5;
    default:
      return dir > 0 ? 0 : dir < 0 ? 1 : 0.5;
  }
}

/**
 * Does a movement of `moved` pixels deserve a follow?
 *
 * A trackpad emits an event for a two-pixel drift, and following one is a
 * preview that shivers while a hand rests on the pad. `dead` of zero is the old
 * behaviour, kept for anybody who wants it.
 */
export function worthFollowing(moved: number, dead: number | undefined): boolean {
  return Math.abs(moved) >= Math.max(0, dead ?? 0);
}

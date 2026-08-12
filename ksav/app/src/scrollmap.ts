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
// The residue, stated so nobody has to discover it twice: a **deferred** note
// body prints at the foot of the page its marker is on, not where its text sits
// in the source, so a document that keeps all its note bodies in a block at the
// end still drifts across that block. Fixing that needs the engine's own
// mapping, and it is a different piece of work from this one.

import { proseRegions } from "./spell";

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

  const out: number[] = [0];
  let total = 0;
  for (let i = 0; i < text.length; i++) {
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

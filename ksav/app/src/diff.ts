// What has changed since the last snapshot, by line.
//
// Typstify diffs the buffer against `git show HEAD:file` and draws the hunks in
// the gutter. The idea is right and the baseline is wrong for this app: a bochur
// writing a sefer has no git repository, and the question he actually asks is
// *"what did I change since Shabbos"* — which Ksav can already answer, because
// `docs.ts` keeps periodic snapshots of every document.
//
// So: same feature, same gutter, baseline taken from the version history.
//
// Everything here is a pure function of two strings. That is deliberate — a diff
// is exactly the kind of thing that looks right on the three cases you tried and
// is wrong on the fourth, and the only way to know is to be able to run it a
// hundred times without an editor in the way.

export type HunkKind = "added" | "changed" | "removed";

/**
 * A run of lines that differ, in **current-document** line numbers (1-based).
 *
 * A `removed` hunk is zero-width: `from === to` and it marks the line the
 * deleted text used to sit above, because there is no line left to mark.
 */
export interface Hunk {
  from: number;
  to: number;
  kind: HunkKind;
}

/**
 * How much work is worth doing before giving up and saying "this whole region
 * changed".
 *
 * Myers' algorithm is O((N+M)·D) in time and stores one row per edit step, so an
 * unbounded run on two documents with nothing in common allocates in proportion
 * to their size — for a gutter decoration, which is a hint. Past these bounds
 * the honest answer is that the middle changed, and it costs the reader nothing
 * because a region that different has no fine structure worth drawing anyway.
 */
const MAX_REGION_LINES = 2000;
const MAX_EDIT_DISTANCE = 256;

/**
 * The lines of `current` that differ from `baseline`.
 *
 * Empty when the two are identical, which is the common case and is why the
 * cheap prefix/suffix trim comes first: an edit in the middle of a 4000-line
 * sefer leaves 3990 lines matching, and those never reach the expensive part.
 */
export function lineHunks(baseline: string, current: string): Hunk[] {
  if (baseline === current) return [];
  return lineHunksOf(baseline.split("\n"), current.split("\n"));
}

/**
 * The array form of {@link lineHunks}, for callers that already hold the split
 * baseline. The change gutter recomputes on every keystroke and the baseline
 * does not move between snapshots, so splitting it once and keeping the array
 * spares one full-document `split("\n")` per document-changing transaction —
 * the allocation the prefix/suffix trim below cannot save because it runs after
 * the arrays already exist.
 */
export function lineHunksOf(a: string[], b: string[]): Hunk[] {
  // A deletion is drawn at the line the removed text sat above — and when the
  // removal was at the *end* of the document there is no such line, so the
  // marker lands one past the last one. Every hunk is clamped on the way out
  // rather than each producer remembering to: a gutter decoration on a line
  // that does not exist is a thrown range error in CodeMirror, not a cosmetic
  // problem.
  const clamp = (h: Hunk): Hunk => ({
    ...h,
    from: Math.min(Math.max(h.from, 1), b.length),
    to: Math.min(Math.max(h.to, 1), b.length),
  });
  const out = (hunks: Hunk[]) => {
    const clamped = hunks.map(clamp);
    // Clamping can collide two markers onto the same line; one mark is enough.
    return clamped.filter(
      (h, i) => clamped.findIndex((o) => o.from === h.from && o.to === h.to && o.kind === h.kind) === i,
    );
  };

  // Trim what is common at both ends. In ordinary editing this is nearly
  // everything, and it is what keeps the bounded region below genuinely small.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  // Nothing removed: everything in the middle of `current` is new.
  if (midA.length === 0) {
    return midB.length === 0 ? [] : out([{ from: head + 1, to: head + midB.length, kind: "added" }]);
  }
  // Nothing added: the removal collapses to a marker where it happened.
  if (midB.length === 0) {
    return out([{ from: head + 1, to: head + 1, kind: "removed" }]);
  }

  const script =
    midA.length + midB.length > MAX_REGION_LINES
      ? null
      : editScript(midA, midB, MAX_EDIT_DISTANCE);
  if (!script) {
    // Too big or too different to describe line by line. Saying "all of it" is
    // not a failure to be hidden — it is the true answer at this resolution.
    return out([{ from: head + 1, to: head + midB.length, kind: "changed" }]);
  }
  return out(groupHunks(script, head));
}

/** One elementary edit, in the trimmed region's own coordinates. */
interface Edit {
  /** Index into `current`'s middle, 0-based. A deletion names where it happened. */
  at: number;
  kind: "add" | "del";
}

/**
 * Myers' greedy shortest-edit-script, bounded.
 *
 * Returns `null` rather than the truth when the two sides are further apart than
 * `maxD` steps — the caller then draws the whole region, which is both cheaper
 * and, at gutter resolution, indistinguishable from the truth.
 */
function editScript(a: string[], b: string[], maxD: number): Edit[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max;
  let v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= Math.min(max, maxD); d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      // Which of the two neighbours to extend from: down (an insertion) when we
      // are on the lower edge or the neighbour below reaches further.
      const down = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]);
      let x = down ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m, off);
    }
    v = v.slice();
  }
  return null;
}

/** Walk the trace back to the elementary edits, in document order. */
function backtrack(trace: Int32Array[], n: number, m: number, off: number): Edit[] {
  const edits: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = v[off + prevK];
    const prevY = prevX - prevK;
    // The diagonal: lines that matched, and are not edits.
    while (x > prevX && y > prevY) {
      x--;
      y--;
    }
    // `down` moved along k+1, which is an insertion into `b`; otherwise a
    // deletion from `a`. A deletion is recorded at the position in `b` where the
    // removed line used to be, because that is the only place left to draw it.
    edits.push(down ? { at: y - 1, kind: "add" } : { at: y, kind: "del" });
    x = prevX;
    y = prevY;
  }
  return edits.reverse();
}

/** Runs of adjacent edits, as hunks in whole-document line numbers. */
function groupHunks(edits: Edit[], head: number): Hunk[] {
  const added = new Set<number>();
  const deletedAt = new Set<number>();
  for (const e of edits) {
    if (e.kind === "add") added.add(e.at);
    else deletedAt.add(e.at);
  }
  const out: Hunk[] = [];
  const lines = [...added].sort((p, q) => p - q);
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1] === lines[j] + 1) j++;
    const from = head + lines[i] + 1;
    const to = head + lines[j] + 1;
    // An added run that also swallowed a deletion is a *change*, not an
    // addition — which is the distinction a reader of the gutter actually wants:
    // green for new text, a different colour for text that replaced something.
    const replaced = [...deletedAt].some((d) => d >= lines[i] && d <= lines[j] + 1);
    out.push({ from, to, kind: replaced ? "changed" : "added" });
    for (const d of [...deletedAt]) if (d >= lines[i] && d <= lines[j] + 1) deletedAt.delete(d);
    i = j + 1;
  }
  // Deletions with no neighbouring addition: text removed and nothing put back.
  for (const d of [...deletedAt].sort((p, q) => p - q)) {
    const at = head + d + 1;
    if (!out.some((h) => h.from === at && h.kind === "removed")) {
      out.push({ from: at, to: at, kind: "removed" });
    }
  }
  return out.sort((p, q) => p.from - q.from || p.to - q.to);
}

/** Every line covered by a hunk, for the overview ruler. */
export function changedLines(hunks: Hunk[]): number[] {
  const lines = new Set<number>();
  for (const h of hunks) {
    for (let n = h.from; n <= h.to; n++) lines.add(n);
  }
  return [...lines].sort((a, b) => a - b);
}

/**
 * The smallest single replacement that turns `prev` into `next`.
 *
 * Every producer in this app that rewrites a document returns the **whole new
 * text**, and that is the right shape for a pure function: `applyPick`,
 * `promote`, `moveSection`, `healAll` and the rest are testable precisely
 * because they take a string and give a string back. The mistake was dispatching
 * it as `{from: 0, to: doc.length}`.
 *
 * CodeMirror treats that as "every character in the document was replaced", so
 * it throws away the syntax tree, every decoration, every lint mark and **every
 * open fold** — including the `//{ … //}` regions the app itself invites you to
 * make. On a 500 KB sefer that happened on every `†`. The document ends up
 * identical and the writer's screen does not: everything they had collapsed is
 * open again, and the caret is the only thing that survived.
 *
 * A common prefix and a common suffix is enough to fix it and cannot be wrong:
 * whatever the two strings share at each end is text that did not move, so
 * replacing only the middle produces exactly `next` while leaving the state
 * either side of it addressed by unchanged positions.
 *
 * Deliberately one span rather than a real diff. A note insertion changes one
 * place, and this finds it exactly. A layout that also writes a configuration
 * line at the top and a dump call at the bottom changes three, and this returns
 * one span covering all of them — which is no worse than what it replaces, and
 * happens once per document per layout rather than once per note.
 *
 * `from === to` with an empty insert means the strings are equal; callers use
 * that to skip the dispatch entirely rather than pushing an empty transaction
 * into the history.
 */
export interface Replacement {
  from: number;
  to: number;
  insert: string;
}

export function minimalChange(prev: string, next: string): Replacement {
  if (prev === next) return { from: 0, to: 0, insert: "" };
  const max = Math.min(prev.length, next.length);
  let head = 0;
  while (head < max && prev.charCodeAt(head) === next.charCodeAt(head)) head++;
  // Do not split a surrogate pair: a common prefix ending between the two halves
  // of an astral character would hand CodeMirror a position that is not a
  // character boundary. Hebrew is in the BMP, but a document can hold an emoji
  // in a heading and this must not be the thing that breaks it.
  if (head > 0 && head < max && isLowSurrogate(next.charCodeAt(head))) head--;

  let tail = 0;
  const limit = max - head;
  while (
    tail < limit &&
    prev.charCodeAt(prev.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
  ) {
    tail++;
  }
  if (tail > 0 && tail < limit && isLowSurrogate(next.charCodeAt(next.length - tail))) tail--;

  return { from: head, to: prev.length - tail, insert: next.slice(head, next.length - tail) };
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

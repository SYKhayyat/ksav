// Paragraph alignment: the three edges as a property of a paragraph.
//
// # The finding (#175)
//
// The three alignment buttons were built the same way as **B**/**I**/**U** —
// `insertSnippet(c.insert)` with the registry's `#מרכז[|]` — and `insert.plan`
// had no case for them, so the snippet was spliced in at the caret. A caret in
// the middle of a word therefore produced
//
//     של#מרכז[]ום עולם
//
// : an **empty** call, splitting the word, in a document where nothing moved on
// the page. If the line was already aligned, the same press wrapped one more
// call around part of it and the paragraph stopped being aligned at all. Both
// are the same mistake: alignment is a *paragraph* property, and the button was
// asking for an *inline span*.
//
// # What a press of one of them means
//
// Word's answer, which is what a writer has in their hands:
//
//   - no selection — the paragraph the caret is in;
//   - a selection — every paragraph it touches, each aligned on its own;
//   - an alignment the paragraph already has — pressing it again takes it off
//     (that is what a toggle is in every word processor);
//   - a different one — the name in place is *replaced*, so a paragraph never
//     collects two alignments, and never loses the one it had to a stray click.
//
// One case is left to the caller on purpose: a **blank** paragraph. There is
// nothing to align, so the press splices `#מרכז[|]` with the caret between the
// brackets and leaves it to be typed into — an empty call that stays empty only
// until the writer types, and is how a centred paragraph is started. Everywhere
// else an empty call is the fault this module was written for, and
// `align.test.mjs` sweeps every other document for one.
//
// The paragraph is the blank-line-delimited run of lines, the same definition
// `focus.paragraphAt` uses for dimming and the same one Typst uses. This module
// reads a string rather than an `EditorState` — `insert.plan` is a pure function
// of text — and `align.test.mjs` holds the two definitions to each other over a
// corpus rather than trusting them to keep agreeing.
//
// # Why a rewrite rather than a splice
//
// Every answer here changes text *outside* `[from, to)`: the wrapper's name is
// before the caret, the closing `]` is after the selection, and unwrapping takes
// both away. That is the `rewrite` kind `lists.makeList` already uses, so the
// shell needed no new branch — `insertSnippet` performs it with `editDoc`.

import { COMMAND_EN } from "./engine.gen";
import { matchGroup } from "./spans";
import { nameIn, modeAt } from "./mode";

/** The three edges, in the order every surface offers them (`settings.ALIGN_ORDER`). */
export const ALIGN_EDGES = ["left", "center", "right"] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];

/**
 * The engine's name for each edge, in English.
 *
 * The three aliases the prelude defines (`#center_ = מרכז`) are the only place
 * this mapping exists; writing `מרכז → center` a second time here is how the
 * two spellings of a command come to differ between the button and the file.
 */
const EDGE_OF_ENGLISH: Record<string, AlignEdge> = {
  left_: "left",
  center_: "center",
  right_: "right",
};

/** The command each edge is written as, Hebrew spelling — the canonical one. */
export const COMMAND_OF_EDGE: Record<AlignEdge, string> = (() => {
  const out = {} as Record<AlignEdge, string>;
  for (const [he, en] of Object.entries(COMMAND_EN)) {
    const edge = EDGE_OF_ENGLISH[en];
    if (edge) out[edge] = he;
  }
  return out;
})();

const EDGE_OF_NAME: Record<string, AlignEdge> = (() => {
  const out: Record<string, AlignEdge> = {};
  for (const [edge, he] of Object.entries(COMMAND_OF_EDGE)) {
    out[he] = edge as AlignEdge;
    out[COMMAND_EN[he] ?? he] = edge as AlignEdge;
  }
  return out;
})();

/**
 * The edge a command name asks for, whichever language it is spelt in.
 *
 * Null for every other command, which is the question the insertion path leads
 * with: a name that is not one of the six is simply not this module's business.
 */
export function edgeOf(name: string): AlignEdge | null {
  return EDGE_OF_NAME[name] ?? null;
}

/** The same edge, spelt the way this document is written. */
export function alignCommand(edge: AlignEdge, lang: "he" | "en"): string {
  return nameIn(COMMAND_OF_EDGE[edge], lang);
}

// ------------------------------------------------------------------ the paragraph

const BLANK = (line: string) => line.trim() === "";

function lineFrom(doc: string, pos: number): number {
  const p = Math.min(Math.max(pos, 0), doc.length);
  return p === 0 ? 0 : doc.lastIndexOf("\n", p - 1) + 1;
}

function lineTo(doc: string, pos: number): number {
  const nl = doc.indexOf("\n", Math.min(Math.max(pos, 0), doc.length));
  return nl < 0 ? doc.length : nl;
}

/**
 * The paragraph containing `pos`, as character offsets.
 *
 * A caret *on* a blank line is between paragraphs and gets that line alone, for
 * the reason `focus.paragraphAt` gives: reflowing the paragraph you just
 * finished the instant you press Enter is the worst answer available.
 */
export function paragraphIn(doc: string, pos: number): { from: number; to: number } {
  let from = lineFrom(doc, pos);
  let to = lineTo(doc, pos);
  if (BLANK(doc.slice(from, to))) return { from, to };
  for (;;) {
    if (from === 0) break;
    const prev = lineFrom(doc, from - 1);
    if (BLANK(doc.slice(prev, lineTo(doc, prev)))) break;
    from = prev;
  }
  while (to < doc.length) {
    const next = to + 1;
    const end = lineTo(doc, next);
    if (BLANK(doc.slice(next, end))) break;
    to = end;
  }
  return { from, to };
}

/**
 * Every paragraph the selection touches, in document order.
 *
 * A selection that begins or ends inside a paragraph takes that whole paragraph,
 * because that is what the button is about to change; a selection of plain text
 * across three paragraphs centres three paragraphs and not one.
 */
export function paragraphsIn(doc: string, from: number, to: number): { from: number; to: number }[] {
  const first = paragraphIn(doc, from);
  if (to <= first.to) return [first];
  const out = [first];
  let pos = first.to;
  while (pos < to) {
    // Past the line break and any blank lines, which are separators rather than
    // paragraphs of their own.
    while (pos < doc.length && doc[pos] === "\n") pos++;
    if (pos >= to) break;
    const next = paragraphIn(doc, pos);
    out.push(next);
    if (next.to <= first.to) break; // a document that cannot advance; never loop
    pos = next.to;
  }
  return out;
}

// ------------------------------------------------------------------ the wrapper

/** An alignment call that is a whole paragraph, and where its pieces are. */
export interface AlignWrapper {
  edge: AlignEdge;
  /** The `#`. */
  hashAt: number;
  nameFrom: number;
  nameTo: number;
  /** Inside the `[` … the `]`. */
  bodyFrom: number;
  bodyTo: number;
}

/**
 * The alignment call this paragraph *is*, if it is one.
 *
 * The whole paragraph, not any call inside it: `#ימין[שלום] עוד` is a paragraph
 * with an aligned fragment in it, and centring that paragraph wraps the
 * paragraph. Only `#ימין[שלום]` and nothing else is a paragraph whose alignment
 * can be retargeted in place, and reading it that way is what keeps a press from
 * nesting one call inside another every time.
 *
 * Whitespace around the call is allowed and stays outside the rewrite, so an
 * indented `  #מרכז[…]` keeps its indentation.
 */
export function wrapperIn(doc: string, from: number, to: number): AlignWrapper | null {
  let a = from;
  let b = to;
  while (a < b && /\s/u.test(doc[a]!)) a++;
  while (b > a && /\s/u.test(doc[b - 1]!)) b--;
  if (doc[a] !== "#") return null;
  const m = /^#([A-Za-z0-9֐-׿_]+)/u.exec(doc.slice(a, b));
  if (!m) return null;
  const edge = edgeOf(m[1]!);
  if (!edge) return null;
  const nameTo = a + m[0].length;
  let open = nameTo;
  while (open < b && /\s/u.test(doc[open]!)) open++;
  // A call with arguments — `#ימין(…)` — is not how the registry writes one, and
  // its body is then a second question this rewrite would be guessing at.
  if (doc[open] !== "[") return null;
  const close = matchGroup(doc, open);
  if (close == null || close !== b - 1) return null;
  return { edge, hashAt: a, nameFrom: a + 1, nameTo, bodyFrom: open + 1, bodyTo: close };
}

// ------------------------------------------------------------------ the answer

/** One character-range replacement, in the coordinates it was read from. */
export interface Edit {
  from: number;
  to: number;
  insert: string;
}

export interface AlignEdit {
  /** The whole document, rewritten. */
  text: string;
  /** Where the caret lands. */
  caret: number;
  /** What the press did, for the surfaces that say so (`aria-pressed`). */
  how: "wrap" | "retarget" | "unwrap";
}

/**
 * Apply non-overlapping edits and carry the caret through them.
 *
 * The caret is mapped rather than recomputed: it is inside the paragraph being
 * wrapped, and a caret that jumped to the start of the paragraph whenever the
 * writer pressed an alignment button would be a second bug in the fix for the
 * first. An edit that ends at or before the caret moves it by the length change;
 * one that starts after it is irrelevant to it.
 */
function applyEdits(doc: string, edits: Edit[], caret: number): { text: string; caret: number } {
  const sorted = [...edits].sort((x, y) => x.from - y.from || x.to - y.to);
  let out = "";
  let at = 0;
  let shift = 0;
  for (const e of sorted) {
    out += doc.slice(at, e.from);
    out += e.insert;
    at = e.to;
    if (e.to <= caret) shift += e.insert.length - (e.to - e.from);
  }
  out += doc.slice(at);
  const mapped = caret + shift;
  return { text: out, caret: Math.min(Math.max(mapped, 0), out.length) };
}

/**
 * What a press of an alignment button does to this document, or null.
 *
 * Null means "not this module's question": the caret is in code mode, where a
 * paragraph is not a paragraph and `#מרכז[…​]` is not a legal expression. The
 * caller then splices the snippet as it always did, which is right there.
 */
export function alignPlan(
  doc: string,
  from: number,
  to: number,
  edge: AlignEdge,
  lang: "he" | "en",
): AlignEdit | null {
  if (modeAt(doc, from) !== "content") return null;
  const caret = to;
  const edits: Edit[] = [];
  let how: AlignEdit["how"] = "wrap";

  for (const para of paragraphsIn(doc, from, to)) {
    const w = wrapperIn(doc, para.from, para.to);
    if (w) {
      if (w.edge === edge) {
        // Off again. The body stays exactly as the writer wrote it.
        edits.push({ from: w.hashAt, to: w.bodyFrom, insert: "" });
        edits.push({ from: w.bodyTo, to: w.bodyTo + 1, insert: "" });
        how = "unwrap";
      } else {
        edits.push({ from: w.nameFrom, to: w.nameTo, insert: alignCommand(edge, lang) });
        if (how !== "unwrap") how = "retarget";
      }
      continue;
    }
    // Nothing to retarget, so the paragraph gets a call of its own — around the
    // whole paragraph, which is the part the empty `#מרכז[]` got wrong.
    let a = para.from;
    let b = para.to;
    while (a < b && /\s/u.test(doc[a]!)) a++;
    while (b > a && /\s/u.test(doc[b - 1]!)) b--;
    if (a === b) continue; // nothing to align on a blank line
    const name = alignCommand(edge, lang);
    edits.push({ from: a, to: a, insert: `#${name}[` });
    edits.push({ from: b, to: b, insert: "]" });
  }

  if (!edits.length) return null;
  const done = applyEdits(doc, edits, caret);
  return { text: done.text, caret: done.caret, how };
}

/**
 * Which edge a document position is already aligned to, for the ribbon's own
 * state: `null` in ordinary prose, which is not "left" — it is whatever the
 * document says, and the button that would have to be pressed to change it is
 * nobody's guess.
 */
export function edgeAt(doc: string, pos: number): AlignEdge | null {
  const para = paragraphIn(doc, pos);
  return wrapperIn(doc, para.from, para.to)?.edge ?? null;
}

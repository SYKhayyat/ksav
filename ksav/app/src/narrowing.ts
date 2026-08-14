// A pane locked to one section, while its neighbour shows the whole sefer.
//
// # What was asked, and what it means here
//
// From the open questions in the marked-up inventory: *"whether narrowing — one
// pane restricted to a single siman while another shows the whole sefer — is
// wanted now"*. It is. What follows is the whole of the model, because the
// obvious reading of "restricted" is the wrong one and the difference matters.
//
// Narrowing is a property of a **pane**, never of the document. The document is
// unchanged, every pane onto it still holds all of it, and — the part that
// decides the design — **the compile is unchanged**. A narrowed pane is a window
// with a smaller opening; it is not a smaller document. Compiling only the
// section would give a preview whose page numbers, note numbers and running
// heads all belong to a sefer nobody has, which is a lie told in the one place
// this application cannot afford one.
//
// The reference is Emacs, and the fidelity is exact in the half that matters:
// the inaccessible portion cannot be seen and **cannot be edited**. That second
// half is not decoration. A pane a writer has deliberately restricted to siman 3
// must not be able to eat siman 40 because a `Ctrl+A` reached further than the
// eye did.
//
// # Where the span lives
//
// In the pane's own `EditorState`, as a field, and not on the `Leaf` in
// `panes.ts`. One reason, and it is decisive: the span has to move when the text
// above it does. A writer narrowed to siman 3 who types a paragraph into siman 1
// — in the other pane, which is the entire point of narrowing — must still be
// narrowed to siman 3 and not to whatever now sits at those offsets. CodeMirror
// maps positions through changes as a matter of course, and every change reaches
// every pane's state (see `mirrorChange`). Keeping the anchor anywhere else means
// writing that mapping again, by hand, and being wrong about it on the day
// somebody pastes.
//
// What is stored is an **anchor**, one position, not a range — and the section is
// re-derived from it on every read. So a section that grows as it is written
// stays narrowed to all of itself, which a stored range could not do.
//
// # What is here and what is in `main.ts`
//
// Everything except the wiring: the span, the anchor's mapping, the decorations
// that hide the rest, the refusal that keeps edits inside, and the question
// "does this change fall outside?" — which `main.ts` asks *before* forwarding a
// mirror's edit to the primary, because by the time a change has been recorded
// on the primary it is too late to refuse it in the pane it came from.

import { EditorState, StateEffect, StateField, type ChangeSet, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { headings, sectionAt, sectionEnd, type HeadingInfo } from "./headings";
import { docTextOf } from "./spans";

/** The stretch of source a narrowed pane can see, and what to call it. */
export interface Span {
  from: number;
  to: number;
  /**
   * The heading's own start — what gets stored, and not `from`.
   *
   * `from` is snapped back to the start of the line for the block decorations,
   * and in a document where a heading does not begin its line those are two
   * different positions. Storing the snapped one would anchor the pane at a
   * point that resolves to the *previous* section, so narrowing would jump one
   * section up the moment anything moved.
   */
  anchor: number;
  /** The heading's title, for the pane's own strip. */
  title: string;
}

/**
 * The section a position is in, snapped to whole lines.
 *
 * Whole lines because the ranges hidden either side are **block** decorations,
 * and CodeMirror requires those to begin and end at a line boundary — a block
 * range that stops mid-line throws, and it would throw from inside a decoration
 * computation, which is the least legible place in this application for a
 * document to arrive at. A heading call starts its own line in every document
 * anybody has written; the snap is what makes that a fact rather than a hope.
 *
 * `null` when the position is above the first heading. That is a real state — a
 * document that opens with two paragraphs of introduction — and the honest
 * answer is that there is no section here, not that the section is the whole
 * document.
 */
export function spanAt(doc: string, pos: number): Span | null {
  const all = headings(doc);
  const here = sectionAt(doc, pos, all);
  if (!here) return null;
  return spanOf(doc, here, all);
}

function spanOf(doc: string, here: HeadingInfo, all: HeadingInfo[]): Span {
  const end = sectionEnd(doc, here, all);
  return {
    from: lineStart(doc, here.from),
    to: lineEnd(doc, end),
    anchor: here.from,
    title: doc.slice(here.bodyFrom, here.bodyTo).trim(),
  };
}

function lineStart(doc: string, pos: number): number {
  const nl = doc.lastIndexOf("\n", Math.max(0, pos - 1));
  return nl < 0 ? 0 : nl + 1;
}

function lineEnd(doc: string, pos: number): number {
  // A section ends *at* the next heading, which is the start of that heading's
  // line — so the position handed here is already a boundary and walking
  // forward from it would swallow the next section's first line. Back up over
  // the newline that separates them instead.
  if (pos > 0 && doc[pos - 1] === "\n") return pos - 1;
  const nl = doc.indexOf("\n", pos);
  return nl < 0 ? doc.length : nl;
}

/**
 * Does this change reach outside the span?
 *
 * The question `main.ts` asks before letting an edit out of a narrowed pane.
 * Insertions exactly at either edge count as inside: typing at the end of the
 * last line of a section is writing in that section, and a rule that said
 * otherwise would make the last character of every narrowed pane unreachable.
 */
export function reaches(span: Span, from: number, to: number): boolean {
  return from < span.from || to > span.to;
}

/** The same question of a whole changeset. */
export function changeReachesOut(span: Span, changes: ChangeSet): boolean {
  let out = false;
  changes.iterChanges((fromA, toA) => {
    if (reaches(span, fromA, toA)) out = true;
  });
  return out;
}

/** Narrow to the section around a position, or widen with `null`. */
export const setNarrow = StateEffect.define<number | null>();

/**
 * The anchor, mapped through every change that reaches this pane.
 *
 * Mapped with an association of `-1` — the anchor is the head of a section, and
 * text inserted exactly at that point belongs to what is above it, not to the
 * section being anchored. Getting that backwards means a paragraph typed at the
 * very top of siman 3 pushes the anchor into siman 4.
 */
export const narrowAnchor = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setNarrow)) return e.value;
    if (value === null) return null;
    return tr.changes.mapPos(value, -1);
  },
});

/** What this pane is narrowed to right now, if anything. */
export function narrowedTo(state: EditorState): Span | null {
  const at = state.field(narrowAnchor, false);
  if (at === null || at === undefined) return null;
  // `docTextOf` and not `state.doc.toString()`: this runs on every change, and
  // that call allocates the whole sefer as a string each time. The memo is keyed
  // on the `Text` object, which is what makes the scan below free as well.
  return spanAt(docTextOf(state.doc), Math.min(at, state.doc.length));
}

/**
 * The two block ranges that hide everything else.
 *
 * `Decoration.replace` with no widget rather than a widget saying "42 lines
 * hidden": a fold already means *there is more here, click to see it*, and a
 * narrowed pane means *this pane is the section*. Two collapsed things that look
 * alike and behave differently is how the fold, the line comment and the block
 * comment came to be indistinguishable, which is a mistake this repository has
 * already paid for once.
 */
function hidden(state: EditorState): DecorationSet {
  const span = narrowedTo(state);
  if (!span) return Decoration.none;
  const deco = [];
  const block = Decoration.replace({ block: true });
  // The arithmetic either side is the line-boundary rule and not an off-by-one.
  // `span.from` is a line *start*, so the last hidden position above it is the
  // newline before it — one back. `span.to` is a line *end*, so the first hidden
  // position below is the line start after that newline — one on. Handing
  // CodeMirror a block range that stops mid-line is a throw, and an empty one
  // with no widget is a second throw, which is what both guards are for.
  const above = span.from - 1;
  const below = span.to + 1;
  if (above > 0) deco.push(block.range(0, above));
  if (below < state.doc.length) deco.push(block.range(below, state.doc.length));
  return Decoration.set(deco);
}

/**
 * Everything a narrowed source pane needs.
 *
 * The atomic ranges are not a nicety. Without them `Ctrl+Home` puts the caret
 * inside a region the writer cannot see, where the next character they type
 * lands in a part of the sefer they are not looking at — or, with the refusal
 * below, silently does nothing. A hidden range you can still walk into is worse
 * than no hiding at all.
 */
export const narrowing: Extension = [
  narrowAnchor,
  // Computed from the state rather than from a view plugin, and that is a
  // requirement rather than a preference: CodeMirror refuses block decorations
  // that replace line breaks when they come from a plugin, because a plugin
  // cannot be consulted before the viewport is measured. These hide most of the
  // document, which is nothing but line breaks.
  EditorView.decorations.compute([narrowAnchor, "doc"], hidden),
  EditorView.atomicRanges.of((view) => hidden(view.state)),
];

/**
 * Put the caret inside the section, so narrowing does not leave it stranded.
 *
 * Returned rather than dispatched, because the caller is already building the
 * transaction that sets the anchor and two dispatches would put an intermediate
 * state — narrowed, caret outside — on screen for a frame.
 */
export function insideSpan(span: Span, head: number): number {
  return Math.max(span.from, Math.min(span.to, head));
}

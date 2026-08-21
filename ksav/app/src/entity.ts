// Selecting a whole construct, and taking one off again.
//
// # The report
//
// > *"Deleting a construct currently means hand-deleting a command name, its
// > parentheses, its brackets and its arguments. It is confusing and easy to
// > get wrong, leaving unbalanced delimiters that then fail to compile."*
//
// Which is true, and the second sentence is the sharp end of it: a half-deleted
// `#הערה(ערוץ: "ביאור")[` does not merely lose the note, it stops the sefer
// compiling, and the writer is then looking at a diagnostic about a bracket
// rather than at the sentence they were writing.
//
// # Three acts, one mechanism
//
// `spans.ts` already knows where every construct starts and ends — that is what
// `scan` is — and `stackAt` already returns the whole nest of calls around a
// position, outermost first. So none of this needs a parser: it needs the three
// things a writer actually wants to do with a construct they can see.
//
//   - **Select it**, so its extent is visible before anything happens to it.
//     Pressed again it widens to the construct around that one, which is the
//     behaviour every editor's expand-selection has and the reason it is the
//     first of the three: *see what you are about to lose*.
//   - **Unwrap it** — the command goes, the words stay. This is the default,
//     because in a sefer the words inside a construct are almost always the
//     writer's own text and the wrapper is markup they are undoing.
//   - **Remove it** — the whole thing, words included.
//
// # Generic on purpose
//
// The handoff asks that this work *"for every construct the editor knows, not
// only notes: styles, notes, siman/seif, tables, lists, callouts, fixed
// regions"*. So it is written against `Node`, which is every call the scanner
// finds, rather than against a list of command names — a list would have been
// the fourth in this repository and the one missing whichever construct the
// writer was standing in.
//
// The two exceptions are refusals rather than omissions, and both are stated at
// `unwrap` below.

import { docTextOf, nodeAt, scan, stackAt } from "./spans";
import type { Node, Scan } from "./spans";

/** A rewrite, in the shape every editing module here returns. */
export interface Edit {
  text: string;
  /** Where to put the caret afterwards. */
  caret: number;
  /** The extent to select afterwards, when the act is a selection. */
  to?: number;
}

/**
 * The construct to act on, given where the caret is and what is selected.
 *
 * With nothing selected this is the innermost call around the caret. With a
 * selection, it is the innermost call that **strictly contains** it — which is
 * what makes repeated presses widen: once the selection is exactly one
 * construct, the only call that still contains it is its parent.
 */
export function entityAt(doc: string, from: number, to: number = from): Node | null {
  const sc: Scan = scan(doc);
  if (from === to) return nodeAt(sc, from);
  const around = stackAt(sc, from).filter(
    (n) => n.from <= from && n.to >= to && !(n.from === from && n.to === to),
  );
  // Innermost, which is the last of a stack ordered outermost-first.
  return around.length ? around[around.length - 1] : null;
}

/** Select the construct around the caret, or the one around the selection. */
export function select(doc: string, from: number, to: number = from): Edit | null {
  const node = entityAt(doc, from, to);
  if (!node) return null;
  return { text: doc, caret: node.from, to: node.to };
}

/**
 * The body whose words survive an unwrap.
 *
 * The **last** group, and that is not arbitrary: `#גוף_הערה[א][…]` names a
 * deferred note in its first group and carries its prose in the second, so
 * keeping the first would keep the label and throw away the note. Every
 * one-group construct is unaffected by the rule, which is nearly all of them.
 */
export function keptBody(node: Node): { from: number; to: number } | null {
  if (!node.bodies.length) return null;
  const last = node.bodies[node.bodies.length - 1];
  return { from: last.from, to: last.to };
}

/**
 * Take the wrapper off and keep the words.
 *
 * Refused in two cases, and a refusal is the honest answer rather than a
 * best-effort rewrite:
 *
 *   - **A construct with no body at all** — `#מעבר_עמוד`, a fixed region's
 *     declaration, `#הגדרות_*`. There are no words to keep, so "unwrap" and
 *     "remove" are the same act and the caller should offer the one that says
 *     what it does.
 *   - **A construct whose text is not in a body** — `#סימן("א", [דיני תפילה])`
 *     carries the siman *number* as an argument, and unwrapping to the body
 *     alone would silently drop it. That is the same rule `headings.ts` already
 *     applies to a heading whose level the prelude fixes, and it is here for the
 *     same reason: the number is the writer's text.
 */
export function unwrap(doc: string, node: Node): Edit | null {
  const body = keptBody(node);
  if (!body) return null;
  // An argument list carrying content — `[…]` inside `(…)` — means words live
  // outside the body being kept.
  if (node.args && /\[/.test(doc.slice(node.args.from, node.args.to))) return null;
  const kept = doc.slice(body.from, body.to);
  return {
    text: doc.slice(0, node.from) + kept + doc.slice(node.to),
    caret: node.from,
    to: node.from + kept.length,
  };
}

/** Take the whole construct, words and all. */
export function remove(doc: string, node: Node): Edit {
  return { text: doc.slice(0, node.from) + doc.slice(node.to), caret: node.from };
}

/** Whether unwrapping this construct would keep anything. */
export function canUnwrap(doc: string, node: Node): boolean {
  return unwrap(doc, node) !== null;
}

/** The construct's name, for a menu row that says what it is about to act on. */
export function nameOf(node: Node): string {
  return node.name;
}

/** The same three, from a document object rather than a string. */
export function entityIn(
  doc: { toString(): string } | string,
  from: number,
  to: number = from,
): Node | null {
  return entityAt(docTextOf(doc), from, to);
}

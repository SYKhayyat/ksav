// A series whose numbers no longer say where its members are.
//
// `numbering.ts` is the model — which members there are and what each ought to
// be numbered. This is the mark on the line and the one click that fixes it.
//
// # Why a lint and not only an automatic renumber
//
// The insertion path already resequences: add a siman in the middle and the run
// after it counts on. That covers *insert*, which is the case the margin note
// named. It cannot cover the other two the same note names — **delete** and
// **move** — because those are not an insertion path. A writer deletes a siman
// by selecting it and pressing a key, and drags one by cut and paste, and there
// is no moment in either where this application is asked a question.
//
// So the document is watched instead of the gesture. That is also the honest
// shape for a document opened from a file, or edited by somebody else, or
// merged: whatever put the numbers out of order, they are out of order now.
//
// # Why `warning` and not `info`
//
// Because unlike a source note without a ref, this is not a capability being
// pointed at. Two simanim numbered ב׳ is wrong on the page, in the printed
// sefer, in the index and in the outline — and it is wrong in a way that reads
// as a typo the writer made rather than as a consequence of the edit they made
// three screens ago.

import { linter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { t, tf } from "./i18n";
import { outOfSequence, resequence } from "./numbering";
import { docTextOf } from "./spans";

/** One number that disagrees with its position: a range and what it should say. */
export interface NumberMark {
  from: number;
  to: number;
  written: string;
  wanted: string;
}

/**
 * Every number in the document that disagrees with its position.
 *
 * Separated from the `linter()` below so the answer can be asserted without an
 * editor — the split `insert.ts` makes, for the same class of bug: a model that
 * is right and a mark on the wrong span is a defect no test of the model
 * catches, and here the span is a numeral three characters wide.
 */
export function numberMarks(text: string): NumberMark[] {
  return outOfSequence(text).map((n) => ({
    from: n.from,
    to: n.to,
    written: n.written,
    wanted: n.wanted,
  }));
}

/** Put every series back in sequence. Returns how many numbers changed. */
export function renumberAll(view: EditorView): number {
  const text = docTextOf(view.state.doc);
  const { text: next, changed } = resequence(text);
  if (!changed) return 0;
  const caret = view.state.selection.main.head;
  let moved = caret;
  for (const n of outOfSequence(text)) {
    if (n.to <= caret) moved += n.wanted.length - n.written.length;
  }
  view.dispatch({
    changes: { from: 0, to: text.length, insert: next },
    selection: { anchor: Math.min(moved, next.length) },
  });
  return changed;
}

const numberingLinter = linter((view): Diagnostic[] =>
  numberMarks(docTextOf(view.state.doc)).map((m) => ({
    from: m.from,
    to: m.to,
    severity: "warning" as const,
    message: tf("numberOutOfSequence", m.written, m.wanted),
    actions: [{ name: t("renumberSeries"), apply: (v: EditorView) => void renumberAll(v) }],
  })),
);

export const numberingMarks = [numberingLinter];

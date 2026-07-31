// The lines the compiler is complaining about, marked in the editor.
//
// `brackets.ts` already marks an unclosed opener, and it exists *because* Typst
// reports an unclosed `[` at end of file and there was no other way to point at
// the real place. Every other class of error had no location at all: the writer
// got a sentence in the status bar and a blank preview, and had to find the line
// themselves.
//
// Now that the engine reports one (`engine/src/diagnostics.rs`), this is where it
// lands. Deliberately the same shape as `spell.ts` — an effect, a state field
// that maps its marks through edits, and a view plugin that draws them — because
// two mechanisms for "underline something in the editor" is one more than the
// editor needs.
//
// The marks are on whole lines rather than on the span, because the engine reports
// a line and a column but not an end: Typst's span covers the node it blamed,
// which for an argument-type error is inside the prelude. A line is what can
// honestly be claimed, so a line is what is drawn.

import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";

/** Replace the set of lines holding a compile error. */
export const setErrorLines = StateEffect.define<number[]>();

const errorLine = Decoration.line({ class: "cm-error-line" });

export const errorLines = StateField.define<number[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setErrorLines)) return e.value;
    // Not mapped through edits, unlike a spelling squiggle: a *line number* is
    // still the same line number after an edit on it, and after an edit that
    // inserts a line above it the next compile is a quarter of a second away.
    // Shifting them by hand here would be a second mechanism for something the
    // recompile already fixes.
    return value;
  },
});

export const errorLineDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.state.field(errorLines) !== u.startState.field(errorLines)) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function build(view: EditorView): DecorationSet {
  const lines = view.state.field(errorLines, false) ?? [];
  const total = view.state.doc.lines;
  const ranges = lines
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b)
    .map((n) => errorLine.range(view.state.doc.line(n).from));
  return Decoration.set(ranges, true);
}

/**
 * The character offset of a line and column.
 *
 * Only the arithmetic. Going there is `runtime.jumpTo`, which already exists and
 * is what the outline and the review panel use — a second function that moves the
 * cursor would be a second mechanism, and this file is not the place to grow one.
 *
 * A column past the end of the line is clamped rather than refused: a column is a
 * hint about where to look, and landing on the right line beats not going.
 */
export function offsetOf(view: EditorView, line: number, column: number | null): number | null {
  const total = view.state.doc.lines;
  if (line < 1 || line > total) return null;
  const l = view.state.doc.line(line);
  return column == null ? l.from : Math.min(l.to, l.from + Math.max(0, column - 1));
}

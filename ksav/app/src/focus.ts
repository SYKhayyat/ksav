// Focus mode and typewriter scrolling.
//
// Two separate settings that get written about as one thing, and they are not:
//
//   · **Focus** dims everything except the paragraph being written. It is about
//     what you can see.
//   · **Typewriter** keeps the caret line at the middle of the window, so the
//     text comes up to meet you instead of your eyes travelling down the screen.
//     It is about where the line you are on sits.
//
// Either is useful alone, which is why they are two checkboxes and not one
// "distraction-free" switch that does both and can only be argued with.

import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { Compartment, RangeSet } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";

export const focusCompartment = new Compartment();

/**
 * The paragraph the cursor is in, as a pair of line numbers.
 *
 * A paragraph is the run of non-blank lines around the caret — the same
 * definition the writer has in their head, and the same one Typst uses to decide
 * what a paragraph is. A caret *on* a blank line is between paragraphs and gets
 * that line alone, rather than arbitrarily joining the one above: dimming the
 * paragraph you just finished the instant you press Enter is the single most
 * annoying thing this feature could do.
 */
export function paragraphAt(state: EditorState, pos: number): { from: number; to: number } {
  const doc = state.doc;
  const here = doc.lineAt(Math.min(Math.max(pos, 0), doc.length)).number;
  if (doc.line(here).text.trim() === "") return { from: here, to: here };
  let from = here;
  while (from > 1 && doc.line(from - 1).text.trim() !== "") from--;
  let to = here;
  while (to < doc.lines && doc.line(to + 1).text.trim() !== "") to++;
  return { from, to };
}

const dimmed = Decoration.line({ class: "cm-dimmed" });

/**
 * Dim every line outside the current paragraph.
 *
 * Built over the *viewport* rather than the document: a decoration for a line
 * nobody can see costs the same as one they can, and a 4000-line sefer would pay
 * for 3960 of them on every cursor movement.
 */
function dimDecorations(view: EditorView): DecorationSet {
  const { from, to } = paragraphAt(view.state, view.state.selection.main.head);
  const ranges = [];
  for (const range of view.visibleRanges) {
    let line = view.state.doc.lineAt(range.from);
    while (line.from <= range.to) {
      if (line.number < from || line.number > to) ranges.push(dimmed.range(line.from));
      if (line.to + 1 > view.state.doc.length) break;
      line = view.state.doc.lineAt(line.to + 1);
    }
  }
  return ranges.length ? Decoration.set(ranges, true) : RangeSet.empty;
}

export const focusMode = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = dimDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = dimDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Keep the caret line in the middle of the window.
 *
 * The scroll is dispatched from an animation frame and not from `update`,
 * because dispatching a transaction while one is being applied is not allowed —
 * and doing it on a timer instead would land after the paint, which reads as a
 * visible jerk rather than as the page moving under the caret.
 *
 * Only on a selection change, never on a plain scroll: reacting to scrolling
 * would drag the view back to the caret the instant the writer tried to look at
 * anything else, which is a fight the writer always loses.
 */
export const typewriterMode = ViewPlugin.fromClass(
  class {
    frame = 0;
    constructor(readonly view: EditorView) {
      this.centre();
    }
    update(u: ViewUpdate) {
      if (u.selectionSet || u.docChanged) this.centre();
    }
    centre() {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => {
        const head = this.view.state.selection.main.head;
        this.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: "center" }) });
      });
    }
    destroy() {
      cancelAnimationFrame(this.frame);
    }
  },
);

/**
 * The extension for a pair of settings.
 *
 * Typewriter scrolling wants room to centre the *last* line of a document, which
 * it cannot do without something below it — so the scroller grows half a
 * viewport of bottom padding while the mode is on, and only while it is on.
 */
export function focusExtension(focus: boolean, typewriter: boolean): Extension {
  const parts: Extension[] = [];
  if (focus) parts.push(focusMode);
  if (typewriter) {
    parts.push(typewriterMode);
    parts.push(EditorView.theme({ "&": { "--ksav-typewriter-pad": "40vh" } }));
    parts.push(EditorView.contentAttributes.of({ "data-typewriter": "true" }));
  }
  return parts;
}

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
 * Where the caret line sits, as a fraction of the pane from its top.
 *
 * A number rather than three branches, because the same fraction answers two
 * questions that have to agree: where to scroll the line to, and how much empty
 * space the content needs above and below so the line can *get* there. Stating
 * it once is the only way those two stay in step.
 */
export const TYPEWRITER_ANCHORS = { upper: 1 / 3, center: 1 / 2, lower: 2 / 3 } as const;

export type TypewriterAnchor = keyof typeof TYPEWRITER_ANCHORS;

export function anchorFraction(anchor: TypewriterAnchor | undefined): number {
  return TYPEWRITER_ANCHORS[anchor ?? "center"] ?? TYPEWRITER_ANCHORS.center;
}

/**
 * The empty space the mode needs above and below the text, as CSS lengths.
 *
 * **This is the half that was missing, and its absence made the whole feature
 * invisible.** There was bottom padding and no top padding, so the scroller's
 * only scrollable range was below the text. Centring line 5 of a document wants
 * a negative scroll offset, a scroller clamps that to zero, and the caret sits
 * exactly where it sits with the mode off — for every line of a short document
 * and the first half-screen of a long one. Measured in the running app before
 * this was changed: `padding-top: 4px`, `scrollTop: 0`, caret at the top of the
 * pane with the mode plainly on.
 *
 * `vh` over-states a pane that is shorter than the window, and over-stating is
 * the safe direction: too much padding leaves slack the scroll then takes up,
 * where too little is a line that cannot reach its anchor.
 */
export function typewriterPadding(anchor: TypewriterAnchor | undefined): {
  top: string;
  bottom: string;
} {
  const f = anchorFraction(anchor);
  return { top: `${(f * 100).toFixed(2)}vh`, bottom: `${((1 - f) * 100).toFixed(2)}vh` };
}

/**
 * Keep the caret line at its anchor in the window.
 *
 * The scroll is dispatched from an animation frame and not from `update`,
 * because dispatching a transaction while one is being applied is not allowed —
 * and doing it on a timer instead would land after the paint, which reads as a
 * visible jerk rather than as the page moving under the caret.
 *
 * `y: "start"` with a margin rather than `y: "center"`, because a margin can say
 * "a third of the way down" and `center` can only say the one thing. At a half
 * they are the same scroll; the fraction is what makes the other two settings
 * possible at all.
 *
 * Only on a selection change, never on a plain scroll: reacting to scrolling
 * would drag the view back to the caret the instant the writer tried to look at
 * anything else, which is a fight the writer always loses.
 */
export function typewriterPlugin(anchor: TypewriterAnchor | undefined) {
  const f = anchorFraction(anchor);
  return ViewPlugin.fromClass(
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
          const yMargin = Math.max(0, Math.round(this.view.scrollDOM.clientHeight * f));
          this.view.dispatch({
            effects: EditorView.scrollIntoView(head, { y: "start", yMargin }),
          });
        });
      }
      destroy() {
        cancelAnimationFrame(this.frame);
      }
    },
  );
}

/** The centred plugin, for callers that never asked for an anchor. */
export const typewriterMode = typewriterPlugin("center");

/**
 * The extension for a pair of settings.
 *
 * Typewriter scrolling needs room on **both** sides to put a line at its anchor:
 * half a viewport above so the first line can come down to meet the caret, and
 * the rest below so the last line can come up. See `typewriterPadding` for what
 * having only one of those looked like.
 */
export function focusExtension(
  focus: boolean,
  typewriter: boolean,
  anchor: TypewriterAnchor = "center",
): Extension {
  const parts: Extension[] = [];
  if (focus) parts.push(focusMode);
  if (typewriter) {
    const pad = typewriterPadding(anchor);
    parts.push(typewriterPlugin(anchor));
    parts.push(
      EditorView.theme({
        "&": { "--ksav-typewriter-pad-top": pad.top, "--ksav-typewriter-pad": pad.bottom },
      }),
    );
    parts.push(EditorView.contentAttributes.of({ "data-typewriter": "true" }));
  }
  return parts;
}

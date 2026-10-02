// #85 — dim every line outside the tag the caret is in.
//
// Focus mode (`focus.ts`) dims outside the **paragraph**. This is the same idea one
// size up: it dims outside the **tag**, which answers a question a paragraph cannot —
// *"which `#הערה[` am I inside?"* — without a hover.
//
// # Three decisions, and the two that were mine to pick
//
// **The strength is a setting, not a constant.** Dimming is calibrated for code. In a
// Hebrew sefer a long line is *already* hard — RTL, Latin in the middle, gershayim,
// foreign phrases — and dimming most of the screen adds a second burden to a reader
// who is carrying the first. Focus mode is what you turn on when you want to be
// *elsewhere*; this is for when you are working inside a note and want the rest of
// the apparatus present but quiet. One mechanism, two numbers.
//
// **There are levels, and they come from nesting rather than from a setting.** A caret
// three notes deep sits inside three tags. The lines of the *middle* one are outside
// the caret's tag but inside an enclosing one, and they should not be as faint as the
// lines outside every tag — otherwise the block you are in loses its shape at exactly
// the depth where the shape matters. So the fade is graded by how many enclosing tags
// a line has, relative to how many the caret has.
//
// **With focus mode as well, both are satisfied.** The caret's paragraph is inside the
// caret's tag, so the intersection is the paragraph: focus mode stays the strong rule
// and this is the weak one, and neither needs to know about the other.
//
// # Why it costs nothing while it is off
//
// `strength === 0` returns an empty set, and an empty `DecorationSet` skips the whole
// block. This is a view over data the editor already has — `framesAt` is the same scan
// `structureAt` and the bracket lint already pay for.

import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { RangeSet, Compartment } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import { scan } from "./spans";

export const tagDimCompartment = new Compartment();

/** The nesting, at a line, in `[`, that the caret's tag sits at. */
export interface TagNesting {
  /** The caret's innermost tag, as line numbers. `null` when the caret is in none. */
  caret: { from: number; to: number } | null;
  /** How many `[` enclose the caret. */
  caretDepth: number;
  /** How many enclose a line, by line number. */
  depthAtLine: (line: number) => number;
}

/**
 * What the fade should be for one line, as a fraction of full dimming.
 *
 * `0` is undimmed, `1` is fully dimmed. Pure arithmetic over depths, so it is
 * testable without a `DOM` — which this suite cannot build.
 *
 * The scale is **relative to the caret's depth**, so it behaves the same at one tag
 * deep and at nine: the lines just outside are always a fraction of the way out, and
 * the lines outside everything are always fully out. An absolute step per level would
 * make a single-tag document dim almost nothing at full strength.
 */
export function dimAmount(
  nesting: TagNesting,
  line: number,
  strength: number,
): number {
  if (!nesting.caret) return 0; // nowhere to be "outside of" — dim nothing
  if (line >= nesting.caret.from && line <= nesting.caret.to) return 0;
  // Normalised by the caret's own depth, so the scale is *relative*: a line in an
  // enclosing tag is `1/caretDepth` of the way out, and a line outside every tag is
  // all the way out.
  //
  // The first version had this **inverted** — it multiplied the gap by a step and
  // subtracted it, so the further out a line was the *brighter* it got, and the
  // outermost lines came out at zero. A test caught it, which is the only reason it
  // was caught: "levels are strictly ordered" is an assertion a subtly reversed
  // grader fails, and a screenshot at one nesting depth would not have.
  const gap = nesting.caretDepth - nesting.depthAtLine(line);
  return Math.max(0, Math.min(1, strength * Math.min(1, gap / Math.max(1, nesting.caretDepth))));
}

/** The tag nesting the caret is in, for the whole document. */
export function nestingAt(state: EditorState, pos: number): TagNesting {
  const doc = state.doc;
  const text = doc.toString();
  const s = scan(text);
  // Only `[` tags: a parenthesis in a sentence is a parenthesis in a sentence.
  const frames = s.frames.filter((f) => text[f.open] === "[");
  const lineOf = (at: number) => doc.lineAt(Math.max(0, Math.min(at, doc.length))).number;
  const enclosing = frames.filter((f) => f.open < pos && pos <= f.close);
  const caretFrame = enclosing[enclosing.length - 1];
  const depths = doc.lines;
  const depthOf = (line: number) => {
    const from = doc.line(line).from;
    return frames.filter((f) => f.open < from && from <= f.close).length;
  };
  void depths;
  return {
    caret: caretFrame ? { from: lineOf(caretFrame.open), to: lineOf(caretFrame.close) } : null,
    caretDepth: enclosing.length,
    depthAtLine: depthOf,
  };
}

/**
 * Dimmed lines over the **viewport**, never the document.
 *
 * The same argument as `focus.ts` makes: a decoration for a line nobody can see costs
 * the same as one they can, and a 4000-line sefer would pay for 3960 of them on every
 * caret movement.
 */
export function tagDimDecorations(view: EditorView, strength: number): DecorationSet {
  if (!strength) return RangeSet.empty;
  const { state } = view;
  const nesting = nestingAt(state, state.selection.main.head);
  if (!nesting.caret) return RangeSet.empty;
  const ranges: Range<Decoration>[] = [];
  for (const range of view.visibleRanges) {
    let line = state.doc.lineAt(range.from);
    while (line.from <= range.to) {
      const amount = dimAmount(nesting, line.number, strength);
      if (amount > 0) ranges.push(dimLine(amount).range(line.from));
      if (line.to + 1 > state.doc.length) break;
      line = state.doc.lineAt(line.to + 1);
    }
  }
  return ranges.length ? Decoration.set(ranges, true) : RangeSet.empty;
}

/** One step's worth of fade, as an inline opacity so `strength` is a real dial. */
const dimLine = (amount: number) =>
  Decoration.line({ attributes: { style: `opacity:${(1 - amount).toFixed(3)}` } });

/**
 * The dimming itself.
 *
 * `strength` is read per rebuild rather than captured, so the setting reconfigures
 * instead of needing the view to be thrown away and made again.
 */
export function tagDim(read: () => number): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = tagDimDecorations(view, read());
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged) {
          this.decorations = tagDimDecorations(u.view, read());
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
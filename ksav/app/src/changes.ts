// The change gutter: what has moved since the last snapshot.
//
// The CodeMirror half of `diff.ts`. Same shape as `spell.ts` and
// `errorlines.ts` — an effect, a state field, decorations built from it —
// because a third mechanism for "mark something in the editor" would be a third
// mechanism to keep in step with prose mode's replace ranges.
//
// The baseline is the newest version-history snapshot rather than a git HEAD.
// That is not a compromise: "what did I change since Shabbos" is the question a
// bochur actually asks, and the snapshots are already being taken.

import { docTextOf } from "./spans";
import { Decoration, EditorView, ViewPlugin, gutter, GutterMarker } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField, RangeSet } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { lineHunks } from "./diff";
import type { Hunk } from "./diff";

export interface ChangeState {
  /** What the document looked like at the baseline, or null when there is none. */
  baseline: string | null;
  hunks: Hunk[];
}

const EMPTY: ChangeState = { baseline: null, hunks: [] };

/** Replace the baseline and recompute against the current document. */
export const setBaseline = StateEffect.define<string | null>();

export const changes = StateField.define<ChangeState>({
  create: () => EMPTY,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setBaseline)) {
        return e.value === null
          ? EMPTY
          : { baseline: e.value, hunks: lineHunks(e.value, docTextOf(tr.state.doc)) };
      }
    }
    // Recomputed on every document change rather than mapped through it. A hunk
    // is a *comparison*, not a range the writer placed: mapping the old answer
    // through an edit gives a plausible, wrong answer that drifts further from
    // the truth with every keystroke, and the recomputation is a prefix/suffix
    // trim over two strings — cheap enough that being right is affordable.
    if (tr.docChanged && value.baseline !== null) {
      return { baseline: value.baseline, hunks: lineHunks(value.baseline, docTextOf(tr.state.doc)) };
    }
    return value;
  },
});

/**
 * What each mark means, in the reader's language.
 *
 * Injected rather than looked up, for the reason `spellTooltip` gives: this
 * module keeps no opinion about the interface's language, and `main.ts` owns
 * `i18n`. Empty until the shell says otherwise, which is also what a test
 * without a shell sees.
 *
 * It exists at all because a coloured wedge in the margin is a claim nobody can
 * check. Three of them — green, blue, and a wedge for text that is no longer
 * there — and the inventory's note was simply *the change gutter's red wedge
 * means something exact and is unlabelled*.
 */
let names: Partial<Record<Hunk["kind"], string>> = {};

/** Name the three marks. Called by the shell at boot and on a language change. */
export function nameMarks(said: Record<Hunk["kind"], string>): void {
  names = said;
}

class ChangeMarker extends GutterMarker {
  constructor(readonly kind: Hunk["kind"]) {
    super();
  }
  eq(other: ChangeMarker) {
    return other.kind === this.kind;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = `cm-change-mark cm-change-${this.kind}`;
    const said = names[this.kind];
    if (said) el.title = said;
    return el;
  }
}

const MARKERS: Record<Hunk["kind"], ChangeMarker> = {
  added: new ChangeMarker("added"),
  changed: new ChangeMarker("changed"),
  removed: new ChangeMarker("removed"),
};

/** The hunk covering a line, if any. */
export function hunkAtLine(state: EditorState, line: number): Hunk | null {
  return state.field(changes, false)?.hunks.find((h) => line >= h.from && line <= h.to) ?? null;
}

export const changeGutter = gutter({
  class: "cm-change-gutter",
  lineMarker(view, block) {
    const line = view.state.doc.lineAt(block.from).number;
    const hunk = hunkAtLine(view.state, line);
    return hunk ? MARKERS[hunk.kind] : null;
  },
  // Rebuilt when the comparison changes, and not otherwise.
  lineMarkerChange: (u) => u.state.field(changes, false) !== u.startState.field(changes, false),
  initialSpacer: () => MARKERS.added,
});

// A changed line also gets a faint background, so the change is visible when the
// gutter is scrolled out of view in the narrow layout.
const changedLine = Decoration.line({ class: "cm-changed-line" });

export const changeHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view.state);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.state.field(changes, false) !== u.startState.field(changes, false)) {
        this.decorations = build(u.state);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function build(state: EditorState): DecorationSet {
  const hunks = state.field(changes, false)?.hunks ?? [];
  const total = state.doc.lines;
  const ranges = [];
  for (const h of hunks) {
    // `removed` is a marker with no text behind it: highlighting the line below
    // a deletion would claim that line changed, and it did not.
    if (h.kind === "removed") continue;
    for (let n = h.from; n <= Math.min(h.to, total); n++) {
      ranges.push(changedLine.range(state.doc.line(n).from));
    }
  }
  return ranges.length ? Decoration.set(ranges, true) : RangeSet.empty;
}

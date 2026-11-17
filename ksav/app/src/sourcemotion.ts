// The motion keys of the source: what `Ctrl+Left/Right` and `Alt+Left/Right`
// do while a document is open (#126).
//
// `motion.ts` is the fact — where the caret may stand next, at one granularity,
// in one direction. This module is the preference: it decides which keys call
// which facts, and it returns **no bindings at all** while the `sourceMotions`
// setting is `"raw"`, so a writer who has not opted in sees exactly today's
// editor. The spec's escape hatch is inside a semantic setup: `Alt+Arrow` is
// one character at a time, the raw motion, because the whole point of the
// mode is that the writer can drop out of the skipping when they need to.
//
// Two details that are easy to get wrong and have tests:
//
// - A command that *reaches* a boundary reports false. CodeMirror keymaps are a
//   chain: a binding that "handled" a key at the end of the document would eat
//   the key for every listener below it, whether there was a move to make or
//   not. `preventDefault` is a promise; `false` is a hand-off.
// - Selection: when the caret is inside a non-empty selection, the first
//   motion collapses it to the edge in the movement's direction — cursor-left
//   with a selection "goes to the left end", which is what every editor means —
//   and with `Shift`, the same stops that move the caret extend the selection.
//   The spec asks for the *same* boundaries, not a second set.

import { EditorSelection, Extension, Prec } from "@codemirror/state";
import { EditorView, KeyBinding, keymap } from "@codemirror/view";
import { cursorCharLeft, cursorCharRight } from "@codemirror/commands";
import { settings } from "./settings";
import { nextStop } from "./motion";
import { scan, Scan } from "./spans";

/**
 * The keymap for the source's movement, for the `motionCompartment`.
 *
 * Empty for `"raw"` — by return, not by comment: a writer who turned the
 * setting off must be able to trust that nothing here is in their way, and an
 * empty array is the only guarantee that holds.
 */
export function motionKeymap(): KeyBinding[] {
  if ((settings.sourceMotions ?? "raw") !== "semantic") return [];
  return [
    { key: "Mod-ArrowLeft", run: move("word", -1), shift: move("word", -1, true) },
    { key: "Mod-ArrowRight", run: move("word", 1), shift: move("word", 1, true) },
    // The escape hatch: raw movement, one character at a time, the two default
    // commands CodeMirror itself ships — no second implementation of "a step".
    { key: "Alt-ArrowLeft", run: cursorCharLeft },
    { key: "Alt-ArrowRight", run: cursorCharRight },
    { key: "Shift-Alt-ArrowLeft", run: cursorCharLeft },
    { key: "Shift-Alt-ArrowRight", run: cursorCharRight },
  ];
}

/**
 * The compartment's value: the keymap, above the defaults.
 *
 * Exported so the live setting change and the state builder ask the same
 * question — a precedence written twice is a precedence that drifts, and the
 * one that drifts is always the path the writer's keypress takes.
 */
export function motionExtension(): Extension {
  return Prec.high(keymap.of(motionKeymap()));
}

/** One scanned text, reused across a run of motion keys on the same text. */
let lastText: string | null = null;
let lastScan: Scan | null = null;

function cachedScan(text: string): Scan {
  if (text !== lastText) {
    lastScan = scan(text);
    lastText = text;
  }
  return lastScan!;
}

/** The motion command: `granularity` in `dir`, collapsing or extending. */
function move(
  granularity: "word" | "char",
  dir: 1 | -1,
  extend = false,
): (view: EditorView) => boolean {
  return (view: EditorView): boolean => {
    const ranges = view.state.selection.ranges;
    // One caret is the contract this mode names; any other selection shape is
    // CodeMirror's own business, and the honest answer is "not my key".
    if (ranges.length !== 1) return false;
    const sel = ranges[0];
    if (!sel.empty) {
      // Collapse to the edge in the movement's direction.
      if (extend) return false;
      view.dispatch({ selection: EditorSelection.cursor(dir === 1 ? sel.to : sel.from) });
      return true;
    }
    const text = view.state.doc.toString();
    const stop = nextStop(cachedScan(text), sel.head, dir, granularity);
    if (stop === sel.head) return false;
    view.dispatch({
      selection: extend ? EditorSelection.range(sel.anchor, stop) : EditorSelection.cursor(stop),
      effects: EditorView.scrollIntoView(stop),
    });
    return true;
  };
}
// The motion keys simplify to nothing (#126) — what the setting buys and what
// it costs when it is off.
//
// `motion.test.mjs` proves where the caret may stand. This file proves the two
// promises around it that are about *keys* rather than about positions:
//
//   1. `"raw"` — the default — returns **no bindings at all**, so a writer who
//      never opened this setting sees exactly the editor they had.
//   2. `"semantic"` binds the spec's four combinations, and the keys that are
//      bound do what the spec says: a word step crosses a command in one move,
//      the body's bracket is a stop, the Alt escape hatch is still one
//      character, and a key with nowhere to go is handed on rather than eaten.
//
// The view here is a two-method stub over a real `EditorState`: `state.update`
// applies the transaction, which is enough to see where a binding puts a caret
// without a browser. A DOM-mounted view would test jsdom, not this file.

import { EditorState, EditorSelection } from "@codemirror/state";
import { cursorCharLeft, cursorCharRight } from "@codemirror/commands";
import { check, ok } from "./harness.mjs";
import { settings } from "../.tmp-test/settings.mjs";
import { motionKeymap, motionExtension } from "../.tmp-test/sourcemotion.mjs";

/** A view with the two members the bindings touch. */
function view(doc, anchor, head = anchor) {
  const v = {
    state: EditorState.create({ doc, selection: EditorSelection.range(anchor, head) }),
    dispatch(spec) {
      this.state = this.state.update(spec).state;
    },

  };
  return v;
}

/** The binding for a key string, or undefined. */
const bind = (key) => motionKeymap().find((b) => b.key === key);

export async function run() {
  const was = settings.sourceMotions;

  // ------------------------------------------------ 1. raw is silence
  {
    settings.sourceMotions = "raw";
    check("raw binds nothing", motionKeymap(), []);
    // And the extension is still a legal, empty keymap — the compartment must
    // never be handed a value it cannot reconfigure to.
    ok("the extension exists for raw too", !!motionExtension());
  }

  // ------------------------------------------------ 2. semantic binds the spec's keys
  settings.sourceMotions = "semantic";
  {
    const keys = motionKeymap().map((b) => b.key);
    for (const key of ["Mod-ArrowLeft", "Mod-ArrowRight", "Alt-ArrowLeft", "Alt-ArrowRight"]) {
      ok(`${key} is bound`, keys.includes(key), JSON.stringify(keys));
    }
    ok("nothing else is bound", keys.length === 6, JSON.stringify(keys));
  }

  // ------------------------------------------------ 3. what a word step crosses
  //
  // The issue's own example. Caret on the `#`; one right step and it is on the
  // body's open bracket, with nothing in between — not the name, not one
  // character of it.
  {
    const text = "טקסט #הדגשה[מודגש] סוף";
    const hash = text.indexOf("#");
    const open = text.indexOf("[");
    const v = view(text, hash);
    ok("the right step is handled", bind("Mod-ArrowRight").run(v));
    check("…and lands on the body's bracket", v.state.selection.main.head, open);
    ok("the left step is handled", bind("Mod-ArrowLeft").run(v));
    check("…and comes back to the hash", v.state.selection.main.head, hash);
    // And in prose it is a *word* step, not a character one: this is the half
    // that separates the two granularities, and without it a binding that
    // skipped units but walked letters would pass every assertion above.
    const prose = view("שלום עולם", 0);
    ok("the prose step is handled", bind("Mod-ArrowRight").run(prose));
    check("…and crosses the word", prose.state.selection.main.head, 4);
  }

  // ------------------------------------------------ 4. the shift form extends
  //
  // The same stops, with the anchor held: the spec asks for one set of
  // boundaries, not a second one for selections.
  {
    const text = "טקסט #הדגשה[מודגש] סוף";
    const hash = text.indexOf("#");
    const open = text.indexOf("[");
    const v = view(text, hash);
    const shift = motionKeymap().find((b) => b.key === "Mod-ArrowRight" && b.shift);
    ok("the shift form exists", !!shift);
    // CodeMirror calls a binding's `shift` member, not its `run`, when a
    // selection is being extended.
    ok("…and is handled", shift.shift(v));
    check("the head moved to the bracket", v.state.selection.main.head, open);
    check("the anchor stayed", v.state.selection.main.anchor, hash);
  }

  // ------------------------------------------------ 5. a selection collapses
  //
  // Cursor-left with a selection goes to the selection's left end — what every
  // editor means — and cursor-right goes to its right end. It does not skip
  // past the selection, which would be the caret running away from the writer.
  {
    const text = "שלום עולם";
    const v = view(text, 0, 9);
    ok("left collapses the selection", bind("Mod-ArrowLeft").run(v));
    check("…to its left end", v.state.selection.main.head, 0);
    const v2 = view(text, 0, 9);
    ok("right collapses the selection", bind("Mod-ArrowRight").run(v2));
    check("…to its right end", v2.state.selection.main.head, 9);
  }

  // ------------------------------------------------ 6. the Alt escape hatch
  //
  // Still one character: the writer who needs to work inside a command head has
  // a key for it, and it is not the one that skips.
  //
  // The binding is held to `@codemirror/commands`' own character motion rather
  // than to a result, and deliberately: that command is bidi- and
  // grapheme-aware through the live view (`moveByChar`), which a headless test
  // cannot stand in for, and a hand-rolled `head ± 1` here would be the one
  // place in the app where Hebrew was stepped over by code that did not know
  // which way it runs. So the assertion is "the escape hatch is that command",
  // and a rewrite that swapped in a stepper of its own would redden it.
  {
    check("the left escape is CodeMirror's character motion", bind("Alt-ArrowLeft").run, cursorCharLeft);
    check("the right escape is CodeMirror's character motion", bind("Alt-ArrowRight").run, cursorCharRight);
    check("the shift form too", bind("Shift-Alt-ArrowRight").run, cursorCharRight);
  }

  // ------------------------------------------------ 7. nowhere to go is a hand-off
  //
  // The last position of the document, moving right. A binding that answered
  // `true` here would swallow the key for every listener below it while doing
  // nothing, which is indistinguishable from a broken arrow key.
  {
    const text = "טקסט";
    const v = view(text, text.length);
    check("the end of the document is not handled", bind("Mod-ArrowRight").run(v), false);
    const back = view(text, 0);
    check("the start of the document is not handled", bind("Mod-ArrowLeft").run(back), false);
  }

  // ------------------------------------------------ 8. multi-caret is not ours
  //
  // A rectangular selection or two carets keep CodeMirror's own behaviour: this
  // mode's contract is about one caret and one line of prose, and claiming a
  // key it does not fully handle is the failure mode above.
  {
    // A *shape*, not a state: `EditorState.create` normalises a multi-caret
    // selection down to one range (measured), so the case is written as the two
    // members the binding actually reads. What is asserted is the guard, and a
    // shape CodeMirror will not build is the only way to reach it.
    const caret = { from: 0, to: 0, anchor: 0, head: 0, empty: true };
    const v = {
      state: { doc: { toString: () => "אבג" }, selection: { ranges: [caret, caret], main: caret } },
      dispatch() {
        throw new Error("a multi-caret selection must not be dispatched to");
      },
    };
    check("multi-caret is handed on", bind("Mod-ArrowRight").run(v), false);
  }

  settings.sourceMotions = was;
}

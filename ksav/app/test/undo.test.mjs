// The undo stack across a document swap.
//
// This is the bug that ate a document, and it is worth stating exactly, because
// the symptom does not sound like data loss. A writer opened a second document;
// the first one left the screen; Ctrl+Z brought the first one's *text* back —
// into the second one's identity, where the change listener then saved it. Two
// documents afterwards, one of them wearing the other's body.
//
// The cause was that `openDoc` switched documents by replacing the text of one
// long-lived editor, and that editor's `history()` had no idea a swap had
// happened. A swap is a `{from: 0, to: doc.length}` change like any other, so it
// went on the undo stack like any other.
//
// The rule was already in the repository, in the comment above
// `swapUntouchedStarter`: "there is no undo across a document swap". Stated in
// one place, implemented in none — this repository's own defect family.
//
// # Why this file no longer tests a reset
//
// The first fix was a history compartment the swap threw away. That was correct
// and it is gone, because the open set removed the swap: an open document *is*
// an `EditorState` (see `opendocs.ts`), and a state carries its own history. So
// the guarantee is no longer "we remember to clear the stack" — it is "there was
// never one stack", which is the difference between a rule and a structure.
//
// The assertions are therefore about two states standing side by side, which is
// exactly what the application holds. A test of a reset would now be a test of
// something no writer can reach.

import { check, ok } from "./harness.mjs";
import { EditorState } from "@codemirror/state";
import { undo } from "@codemirror/commands";
import * as runtime from "../.tmp-test/runtime.mjs";

const FIRST = "הקדמה\nמה שכתבתי אתמול\n";
const SECOND = "פרק א׳\n";

/** A document, the way the open set holds one: text plus its own history. */
function stateFor(body) {
  return EditorState.create({ doc: body, extensions: [runtime.historyExtension()] });
}

/** Apply a transaction to a state, the way a view would. */
function edit(state, spec) {
  return state.update(spec).state;
}

/** Run undo against a state and hand back whatever it became. */
function undone(state) {
  let next = state;
  undo({ state, dispatch: (tr) => (next = tr.state) });
  return next;
}

export async function run() {
  // ---------------------------------------------- the sequence that ate a document

  {
    // The writer types in their first document, so there is something to lose.
    let first = stateFor(FIRST);
    first = edit(first, {
      changes: { from: FIRST.length, insert: "ועוד שורה\n" },
      userEvent: "input.type",
    });
    ok("the first document has the writer's edit in it", first.doc.toString().endsWith("ועוד שורה\n"));

    // ...and opens another one. Which is not an edit to anything: it is a second
    // state, and the view is handed it whole.
    const second = stateFor(SECOND);
    check("the second document is what it is", second.doc.toString(), SECOND);

    // The keystroke that used to do the damage.
    const after = undone(second);
    check("undo does not reach into the other document", after.doc.toString(), SECOND);

    // Twice, because a half-working fix would leave one entry reachable.
    check("and still does not, pressed again", undone(after).doc.toString(), SECOND);
  }

  // ------------------------------------------------ undo still works inside a document
  //
  // The half a fix by amputation would fail: separating the histories is only
  // correct if each history is otherwise intact. A writer who cannot undo their
  // own typing has been handed a worse bug than the one being fixed.

  {
    let s = stateFor(SECOND);
    s = edit(s, {
      changes: { from: SECOND.length, insert: "מה שהתחלתי היום\n" },
      userEvent: "input.type",
    });
    ok("an edit lands", s.doc.toString() !== SECOND);
    check("and undo takes it back", undone(s).doc.toString(), SECOND);
  }

  // ------------------------------------------------ each document keeps its own
  //
  // The property the open set is built on, and the one a single shared history
  // could never have: two documents edited in turn, each with its own stack, and
  // undoing in one leaves the other exactly where it was.

  {
    let a = stateFor(FIRST);
    let b = stateFor(SECOND);
    a = edit(a, { changes: { from: 0, insert: "א" }, userEvent: "input.type" });
    b = edit(b, { changes: { from: 0, insert: "ב" }, userEvent: "input.type" });

    const aUndone = undone(a);
    check("undoing in one document undoes its own edit", aUndone.doc.toString(), FIRST);
    check("...and leaves the other's alone", b.doc.toString(), "ב" + SECOND);

    const bUndone = undone(b);
    check("and the other undoes its own", bUndone.doc.toString(), SECOND);
    check("...without reaching back into the first", aUndone.doc.toString(), FIRST);
  }

  // ------------------------------------------------ a state is a complete document
  //
  // Text, caret and history in one value is what makes switching a `setState`
  // rather than a reconstruction — and what makes the caret come back where the
  // writer left it, which no amount of resetting a shared history would have done.

  {
    let s = stateFor(FIRST);
    s = edit(s, { selection: { anchor: 7 } });
    check("a state carries the caret", s.selection.main.head, 7);
    const other = stateFor(SECOND);
    check("...and another state has its own", other.selection.main.head, 0);
    check("the first is untouched by the second existing", s.selection.main.head, 7);
  }
}

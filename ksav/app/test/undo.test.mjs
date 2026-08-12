// The undo stack across a document swap.
//
// This is the bug that ate a document, and it is worth stating exactly, because
// the symptom does not sound like data loss. A writer opened a second document;
// the first one left the screen; Ctrl+Z brought the first one's *text* back —
// into the second one's identity, where the change listener then saved it. Two
// documents afterwards, one of them wearing the other's body.
//
// The cause is that `openDoc` switches documents by replacing the text of one
// long-lived editor, and that editor's `history()` had no idea a swap had
// happened. A swap is a `{from: 0, to: doc.length}` change like any other, so it
// went on the undo stack like any other.
//
// The rule was already in the repository, in the comment above
// `swapUntouchedStarter`: "there is no undo across a document swap". Stated in
// one place, implemented in none — this repository's own defect family. So the
// test is not "does the compartment reconfigure": it is the writer's sequence,
// run against the same extension and the same function the application installs.

import { check, ok, fakeView } from "./harness.mjs";
import { undo } from "@codemirror/commands";
import * as runtime from "../.tmp-test/runtime.mjs";

const FIRST = "הקדמה\nמה שכתבתי אתמול\n";
const SECOND = "פרק א׳\n";

export async function run() {
  // ---------------------------------------------- the sequence that ate a document

  {
    const v = fakeView(FIRST, FIRST.length, [runtime.historyExtension()]);
    runtime.setView(v);

    // The writer types in their first document, so there is something to lose.
    v.dispatch({
      changes: { from: FIRST.length, insert: "ועוד שורה\n" },
      selection: { anchor: FIRST.length + 9 },
      userEvent: "input.type",
    });
    const typed = v.text();
    ok("the first document has the writer's edit in it", typed.endsWith("ועוד שורה\n"));

    // ...and opens another one.
    runtime.swapDocument(SECOND);
    check("the second document is on screen", v.text(), SECOND);

    // The keystroke that used to do the damage.
    undo({ state: v.state, dispatch: (tr) => v.dispatch(tr) });
    check("undo does not reach back past the swap", v.text(), SECOND);

    // Twice, because a two-transaction reset that only half worked would leave
    // one entry on the stack and pass a single press.
    undo({ state: v.state, dispatch: (tr) => v.dispatch(tr) });
    check("and still does not, pressed again", v.text(), SECOND);
  }

  // ------------------------------------------------ undo still works inside a document
  //
  // The other half, and the one a fix by amputation would fail: resetting the
  // history is only correct if the history is otherwise intact. A writer who
  // cannot undo their own typing has been handed a worse bug than the one being
  // fixed.

  {
    const v = fakeView(SECOND, SECOND.length, [runtime.historyExtension()]);
    runtime.setView(v);
    v.dispatch({
      changes: { from: SECOND.length, insert: "מה שהתחלתי היום\n" },
      selection: { anchor: SECOND.length + 15 },
      userEvent: "input.type",
    });
    ok("an edit lands", v.text() !== SECOND);
    undo({ state: v.state, dispatch: (tr) => v.dispatch(tr) });
    check("and undo takes it back", v.text(), SECOND);
  }

  // ------------------------------------------- a swap after a swap is still a wall
  //
  // The compartment is reconfigured twice per swap. If the second swap's reset
  // were a no-op — which is exactly what happens if you reconfigure to an
  // equivalent value without removing the extension first — the second document
  // would be reachable from the third.

  {
    const v = fakeView(FIRST, 0, [runtime.historyExtension()]);
    runtime.setView(v);
    runtime.swapDocument(SECOND);
    runtime.swapDocument("שלישי\n");
    undo({ state: v.state, dispatch: (tr) => v.dispatch(tr) });
    check("the third swap resets as thoroughly as the first", v.text(), "שלישי\n");
  }

  // ---------------------------------------------- the reset is not a document change
  //
  // `main.ts` schedules the autosave, the compile, the word count and the macro
  // recorder off `docChanged`. Two reconfiguration transactions that claimed to
  // change the document would fire all four on every swap, and the autosave is
  // the one that would write.

  {
    const v = fakeView(FIRST, 0, [runtime.historyExtension()]);
    runtime.setView(v);
    let changed = 0;
    const real = v.dispatch;
    v.dispatch = (spec) => {
      real(spec);
      if (spec.changes) changed++;
    };
    runtime.resetHistory();
    check("resetting the history changes no text", changed, 0);
    check("and leaves the document where it was", v.text(), FIRST);
  }
}

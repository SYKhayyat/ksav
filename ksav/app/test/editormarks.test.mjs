// The three things drawn *on* the text, and the state they are drawn from.
//
// `errorlines.ts`, `changes.ts` and `nikud.ts` were all unreachable from the
// test suite. They are grouped here because they are the same construct three
// times, and both files say so in their own headers: an effect, a state field,
// and decorations built from it — "a third mechanism for marking something in
// the editor would be a third mechanism to keep in step with prose mode's
// replace ranges."
//
// The interesting assertions are about the *field*, not the pixels. Both fields
// make a deliberate, unusual choice about what happens to their marks when the
// writer types, each field's comment argues for it, and neither had a test:
// `errorLines` does **not** map through edits (a recompile is a quarter of a
// second away) and `changes` recomputes rather than mapping (a hunk is a
// comparison, not a range the writer placed). Those are exactly the decisions
// that get quietly reversed by somebody tidying up.

import { check, ok, notOk, fakeView, installChrome } from "./harness.mjs";
import { EditorState } from "@codemirror/state";
import { errorLines, setErrorLines, offsetOf } from "../.tmp-test/errorlines.mjs";
import { HEBREW, markPattern } from "../.tmp-test/engine.gen.mjs";
import { changes, setBaseline, hunkAtLine } from "../.tmp-test/changes.mjs";
import { NIKUD, insertNikud, nikudKeymap } from "../.tmp-test/nikud.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { settings } from "../.tmp-test/settings.mjs";

const DOC = "שורה ראשונה\nשורה שנייה\nשורה שלישית\n";

export async function run() {
  const chrome = installChrome();
  try {
    // ------------------------------------------------ the compiler's lines

    {
      const v = fakeView(DOC, 0, [errorLines]);
      check("no errors to begin with", v.state.field(errorLines), []);
      v.dispatch({ effects: setErrorLines.of([2]) });
      check("the engine's line lands in the field", v.state.field(errorLines), [2]);
      v.dispatch({ effects: setErrorLines.of([]) });
      check("and a clean compile clears it", v.state.field(errorLines), []);
    }

    {
      // The decision, asserted: a mark is *not* moved by an edit. The comment
      // argues that a line number is still the same line number after an edit
      // on it, and that shifting them by hand would be a second mechanism for
      // something the recompile already fixes. If somebody adds mapping, this
      // goes red and they have to argue with the comment rather than around it.
      const v = fakeView(DOC, 0, [errorLines]);
      v.dispatch({ effects: setErrorLines.of([3]) });
      v.dispatch({ changes: { from: 0, to: 0, insert: "שורה חדשה\n" } });
      check("an insert above does not shift the mark", v.state.field(errorLines), [3]);
    }

    {
      // Lines outside the document are dropped rather than throwing. The engine
      // reports against the text it was *sent* — prelude included — so a line
      // number past the end is a routine arrival, not a bug.
      const v = fakeView("שורה אחת\n", 0, [errorLines]);
      v.dispatch({ effects: setErrorLines.of([1, 99]) });
      check("the field keeps what it was given", v.state.field(errorLines), [1, 99]);
      ok("and the document has fewer lines than that", v.state.doc.lines < 99);
    }

    {
      // `offsetOf` is the arithmetic behind "click the diagnostic, go to the
      // line". A column past the end of a line is clamped, on the stated
      // grounds that landing on the right line beats not going.
      const v = fakeView(DOC, 0);
      check("line 1, column 1 is the start", offsetOf(v, 1, 1), 0);
      check("no column means the start of the line", offsetOf(v, 2, null), DOC.indexOf("שורה שנייה"));
      check("a column past the end clamps to the end", offsetOf(v, 1, 999), DOC.indexOf("\n"));
      check("line 0 is refused", offsetOf(v, 0, 1), null);
      check("and so is a line past the document", offsetOf(v, 99, 1), null);
    }

    // ------------------------------------------------ what changed since Shabbos

    {
      const v = fakeView(DOC, 0, [changes]);
      check("no baseline, no hunks", v.state.field(changes).hunks, []);
      v.dispatch({ effects: setBaseline.of(DOC) });
      check("a document compared with itself has no hunks", v.state.field(changes).hunks, []);
      check("but it does have a baseline", v.state.field(changes).baseline, DOC);
    }

    {
      // The decision, asserted: the comparison is recomputed on every edit
      // rather than mapped through it. Mapping gives "a plausible, wrong answer
      // that drifts further from the truth with every keystroke" — and drift is
      // invisible, which is why it needs an assertion rather than a comment.
      const v = fakeView(DOC, 0, [changes]);
      v.dispatch({ effects: setBaseline.of(DOC) });
      v.dispatch({ changes: { from: 0, to: 4, insert: "מלה" } });
      const hunks = v.state.field(changes).hunks;
      ok("editing line 1 produces a hunk", hunks.length > 0);
      ok("on line 1", hunkAtLine(v.state, 1) !== null);
      notOk("and not on the untouched last line", hunkAtLine(v.state, 3));

      // Now put it back. A mapped answer would still be reporting a change; a
      // recomputed one sees that there is nothing left to report.
      v.dispatch({ changes: { from: 0, to: 3, insert: "שורה" } });
      check("undoing the edit clears the hunk", v.state.field(changes).hunks, []);
    }

    {
      // Dropping the baseline drops everything, rather than leaving a stale
      // comparison against a document nobody has.
      const v = fakeView(DOC, 0, [changes]);
      v.dispatch({ effects: setBaseline.of("אחר לגמרי\n") });
      ok("a different baseline produces hunks", v.state.field(changes).hunks.length > 0);
      v.dispatch({ effects: setBaseline.of(null) });
      check("clearing it clears the hunks", v.state.field(changes).hunks, []);
      check("and the baseline itself", v.state.field(changes).baseline, null);
    }

    {
      // `hunkAtLine` on a state with no field at all returns null rather than
      // throwing — the gutter asks before the field is installed during boot.
      const bare = EditorState.create({ doc: DOC });
      check("asking a state with no field is safe", hunkAtLine(bare, 1), null);
    }

    // ------------------------------------------------ pointing the text

    {
      // A vowel is a combining mark, so it goes *after* the letter and the pair
      // composes. Getting the offset wrong here puts the point on the wrong
      // letter, which in a siddur is not a cosmetic bug.
      const v = fakeView("שבת", 1);
      runtime.setView(v);
      let refreshed = 0;
      insertNikud("ַ", () => refreshed++);
      check("the mark lands after the letter the caret was on", v.text(), "שַבת");
      check("and the caret is after the mark", v.caret(), 2);
      check("and the bar is told to refresh", refreshed, 1);
    }

    {
      // A selection is *pointed*, not replaced. Inserting ordinary text would
      // delete the selected word and leave a floating vowel; a diacritic points
      // the letter before it, so it goes at the end of the selection.
      const v = fakeView("שבת קודש", 0);
      v.dispatch({ selection: { anchor: 0, head: 3 } });
      runtime.setView(v);
      insertNikud("ָ", () => {});
      check("the selected word survives", v.text(), "שבתָ קודש");
    }

    {
      // Every mark in the bar is a real Hebrew combining point, has a name, and
      // has a key. The table is the product knowledge here — the module argues
      // there is no letter-to-vowel mnemonic in Hebrew, so the key assignment is
      // a decision and duplicates in it are a silent loss of a mark.
      const keys = NIKUD.map(([, , k]) => k);
      check("no two marks share a key", keys.length, new Set(keys).size);
      const marks = NIKUD.map(([m]) => m);
      check("no mark is listed twice", marks.length, new Set(marks).size);
      // The range is `markPattern()`'s and not this file's. It was
      // `/^[֑-ׇ]$/` here — the whole block, which is *not* "the combining
      // marks": maqaf, paseq, sof pasuq and nun hafukha sit inside it and
      // separate words. Nothing in this bar is one of the four, so the
      // assertion passed; it would also have passed if one had been added,
      // which is the difference between a check and a coincidence.
      const isMark = (m) => m.length === 1 && markPattern("u").test(m);
      check(
        "every one is a combining mark in the Hebrew block",
        NIKUD.filter(([m]) => !isMark(m)).map(([, n]) => n),
        [],
      );
      check(
        "…and word-breaking punctuation would not qualify",
        [...HEBREW.wordBreaking].filter(isMark),
        [],
      );
      check(
        "every one has a name and an Alt key",
        NIKUD.filter(([, n, k]) => !n || !k.startsWith("Alt-")).map(([m]) => m),
        [],
      );
    }

    {
      // The keymap is built from the same table, so the bar and the keyboard
      // cannot disagree about what a key types — the two-surfaces-one-fact
      // failure this repository is named for.
      const km = nikudKeymap(() => {});
      check("one binding per mark", km.length, NIKUD.length);
      check(
        "and every key in the table has one",
        NIKUD.filter(([, , k]) => !km.some((b) => b.key === k)).map(([, n]) => n),
        [],
      );

      // And the bar's own switch is honoured: with pointing off, the key does
      // not type into the document. A key that fires while its surface is
      // hidden is the same family of defect from the other direction.
      const v = fakeView("שבת", 3);
      runtime.setView(v);
      settings.nikud = false;
      check("with the bar off the key declines", km[0].run(), false);
      check("and types nothing", v.text(), "שבת");
      settings.nikud = true;
      check("with it on the key handles the event", km[0].run(), true);
      ok("and a mark was typed", v.text().length === 4);
    }
  } finally {
    chrome.restore();
  }
}

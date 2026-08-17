import { check, ok } from "./harness.mjs";
import { proseMode } from "../.tmp-test/ksav-lang.mjs";
import { EditorState } from "@codemirror/state";

// Prose mode, driven by the real CodeMirror.
//
// This is the one view whose whole promise is "it looks like the page", it is
// the most decoration-dense code in the app, and it had no test.
//
// It used to run a second, private esbuild here, on the stated grounds that
// "every other test file externalises `@codemirror/*` and prose mode is a
// StateField that cannot run without it." That reason was wrong twice over.
// Externalising is what makes this work: the module and this file then resolve
// `@codemirror/state` to the *same* copy in `node_modules`, so the `StateField`
// the mode defines is the one `state.field()` is asked for — a private bundle
// is the arrangement that risks two of them. And the real reason the private
// build existed was that `ksav-lang.ts` was not on `run.mjs`'s hand-written
// module list, so there was nothing in `.tmp-test/` to import. The list is read
// off `src/` now and the workaround is gone with the hole that caused it.
//
// What it catches is the failure mode that module actually has: two `replace`
// decorations over overlapping ranges, which CodeMirror rejects at the moment
// the set is built ("Ran out of text content"). It shows up as a blank editor,
// not as a wrong pixel, and it depends on where the caret is — `touchedAt`
// suppresses ranges under the cursor, so a document can decorate cleanly at
// every offset but one. Hence: every offset.

/** Documents that have historically been where decoration bugs live. */
const DOCS = {
  // deferred note bodies — markers, definitions, and the region
  "deferred: plain pair": `ראש#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[הביאור]\n`,
  "deferred: layouts": `ראש#הערה_בשם("1", סוג: הערתסיום) אמצע#הערה_בשם("2", סוג: מדף_א) סוף.\n#גוף_הערה("1")[א]\n#גוף_הערה("2")[ב]\n`,
  "deferred: bracket form": `ראש#הערה_בשם[א] סוף.\n#גוף_הערה[א][הביאור]\n`,
  "deferred: region": `טקסט#הערה_בשם("1").\n#גופי_הערות[\n#גוף_הערה("1")[הביאור]\n]\n`,
  "deferred: definition first": `#גוף_הערה("1")[הביאור]\nראש#הערה_בשם("1") סוף.\n`,
  "deferred: dangling": `ראש#הערה_בשם("חסר") סוף.\n`,
  "deferred: orphan": `ראש סוף.\n#גוף_הערה("1")[יתום]\n`,
  "deferred: mixed with inline": `א#הערה[ראשונה] ב#הערה_בשם("1") ג#מדור_א[שלישית].\n#גוף_הערה("1")[שנייה]\n`,
  "deferred: rich body": `א#הערה_בשם("1").\n#גוף_הערה("1")[#הדגשה[מודגש] ו#רשימה(פריט[א], פריט[ב])]\n`,
  "deferred: nested": `א#הערה_בשם("1").\n#גוף_הערה("1")[חיצונית#הערה_בשם("2")]\n#גוף_הערה("2")[פנימית]\n`,
  "deferred: multi-line body": `א#הערה_בשם("1").\n#גוף_הערה("1")[\n  שורה ראשונה\n  שורה שנייה\n]\n`,
  "deferred: commented out": `// #הערה_בשם("1")\nא#הערה_בשם("2") ב.\n#גוף_הערה("2")[הביאור]\n`,
  "deferred: table in a body": `א#הערה_בשם("1").\n#גוף_הערה("1")[#טבלה(עמודות: 2, תא[א], תא[ב])]\n`,
  "deferred: marker inside an inline note": `א#הערה[חיצונית #הערה_בשם("1")] ב.\n#גוף_הערה("1")[פנימית]\n`,
  "deferred: gershayim": `א#הערה_בשם("1").\n#גוף_הערה("1")[עיין רש"י שם ובשו"ע]\n`,
  "deferred: half typed": `א#הערה_בשם("1"\n#גוף_הערה("2")[חצי\n`,
  // the rest of the mode, which was never covered either
  "inline notes, nested": `א#הערה[חיצונית #הערה[פנימית]] ב.\n`,
  "list with a note in an item": `#רשימה(\n  פריט[אלף#הערה[הערה]],\n  פריט[בית],\n)\n`,
  table: `#טבלה(עמודות: 2,\n  כותרת_תא[א], כותרת_תא[ב],\n  תא[1], תא[2],\n)\n`,
  "headings and emphasis": `#כותרת1[פרק]\nטקסט עם #הדגשה[מודגש] ו#נטוי[נטוי].\n`,
  "hidden break": `שורה // מעבר\nהמשך\n`,
  "block comment": `לפני /* פנים\nעוד */ אחרי\n`,
  // Two bodies on one command — four of the commands a sefer is written with.
  "two bodies": `#גמרא[ברכות][ב.] ו#פסוק[בראשית א, א][בראשית ברא] ו#סעיף[א][גוף] סוף.\n`,
  "two bodies, one empty": `#גמרא[][] סוף.\n`,
  "two bodies with an argument": `#גמרא[ברכות][ב.] ו#ציון(פטור: true)[רמב״ם] סוף.\n`,
  empty: ``,
};

export async function run() {
  let clean = 0;
  for (const [name, doc] of Object.entries(DOCS)) {
    let failure = null;
    for (let pos = 0; pos <= doc.length && !failure; pos++) {
      try {
        const state = EditorState.create({
          doc,
          selection: { anchor: pos },
          extensions: [proseMode],
        });
        const it = state.field(proseMode).deco.iter();
        while (it.value) {
          if (it.from > it.to) throw new Error(`inverted range ${it.from}>${it.to}`);
          it.next();
        }
      } catch (e) {
        failure = `@${pos}: ${e.message}`;
      }
    }
    check(`prose: ${name}`, failure, null);
    if (!failure) clean++;
  }
  ok("prose: every document decorated", clean === Object.keys(DOCS).length);

  // The claim the deferred work makes about this view: a marker collapses to a
  // chip, and the definitions region reads as a numbered list — neither is left
  // as raw markup in the mode whose promise is that there isn't any.
  const doc = `ראש#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[הביאור]\n`;
  // Caret at 0, so nothing is "touched" and every decoration is emitted.
  const state = EditorState.create({ doc, selection: { anchor: 0 }, extensions: [proseMode] });
  const spans = [];
  const it = state.field(proseMode).deco.iter();
  while (it.value) {
    spans.push(doc.slice(it.from, it.to));
    it.next();
  }
  ok(
    "prose: the marker is covered",
    spans.some((s) => s === `#הערה_בשם("1")`),
  );
  ok(
    "prose: the definition's markup is covered",
    spans.some((s) => s === `#גוף_הערה("1")[`),
  );
  ok(
    "prose: the body's own text is not",
    !spans.some((s) => s.includes("הביאור")),
  );

  // A command with two bodies. This hid the opening through the end of the first
  // body and the bracket after it, so `#גמרא[ברכות][ב.]` read as *ברכות[ב.]* — the
  // second body's brackets sitting in the prose, in the view whose one promise is
  // that there is no markup in it.
  {
    const two = `#גמרא[ברכות][ב.] סוף.\n`;
    const st = EditorState.create({
      doc: two,
      selection: { anchor: two.length - 1 },
      extensions: [proseMode],
    });
    const covered = [];
    const it2 = st.field(proseMode).deco.iter();
    while (it2.value) {
      covered.push(two.slice(it2.from, it2.to));
      it2.next();
    }
    ok("prose: the opening of a two-bodied command is covered", covered.includes("#גמרא["));
    ok("prose: so is the bracket pair between its bodies", covered.includes("]["));
    ok("prose: and the last body's closing bracket", covered.filter((c) => c === "]").length === 1);
    // Both halves of the reference are styled, not only the first.
    ok("prose: the masechta is marked", covered.includes("ברכות"));
    ok("prose: and so is the daf", covered.includes("ב."));
  }

  // ---- moving the caret never leaves it buried -----------------------------
  //
  // Everything above builds a state at a position. A writer *moves* to one, and
  // a move takes a different path through the field: the recompute is deferred
  // so that holding an arrow key down through a sefer does not pay for a pass
  // over the whole document per repeat.
  //
  // What may not be deferred is the caret arriving inside markup that is
  // currently replaced. A replaced range has no DOM of its own, so a selection
  // there has nowhere to be — CodeMirror's tile walker runs off the end of the
  // tree looking for it, which Firefox reports as `parents.pop() is undefined`,
  // once per keypress, from inside the library. Nothing threw, nothing turned
  // red, and the caret was inside text nobody could see.
  //
  // So: after a move, no range still hiding text may contain the caret unless a
  // freshly computed state at that position hides it too. Subset rather than
  // equality on purpose — revealing *more* than a fresh pass would is what the
  // narrow uncover does for one frame, and it is not a defect.
  const hidingAt = (state, at) => {
    const found = [];
    const it = state.field(proseMode).deco.iter();
    while (it.value) {
      // `point` with a non-empty range is `Decoration.replace` — the only kind
      // that takes text off the screen. Marks style what is there; line and
      // widget decorations are empty ranges.
      if (it.value.point && it.from < at && it.to > at) found.push(`${it.from}-${it.to}`);
      it.next();
    }
    return found;
  };
  // The caret is *walked* rather than placed, one position at a time, from a
  // single state — which is the arrangement the deferral creates and the only
  // one in which this can go wrong. Placed fresh at a position, the caret is
  // never inside hidden markup, because the state that computed the decorations
  // already knew where it was; `touchedAt` uncovered the span on the way in. A
  // pair of fresh states cannot see this bug at all, and the first version of
  // this check was written that way and could not fail.
  let buried = null;
  let moves = 0;
  for (const [name, doc] of Object.entries(DOCS)) {
    let st = EditorState.create({ doc, selection: { anchor: 0 }, extensions: [proseMode] });
    for (let pos = 1; pos <= doc.length && !buried; pos++) {
      st = st.update({ selection: { anchor: pos } }).state;
      const fresh = EditorState.create({ doc, selection: { anchor: pos }, extensions: [proseMode] });
      const should = new Set(hidingAt(fresh, pos));
      const extra = hidingAt(st, pos).filter((r) => !should.has(r));
      if (extra.length) buried = `${name} @${pos}: still hidden ${extra.join(",")}`;
      moves++;
    }
  }
  check("prose: a caret walked into markup is never left buried inside it", buried, null);
  ok("prose: and it was walked over the whole corpus", moves > 400);
}

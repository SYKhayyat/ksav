// #86 — the two paths that both know where a tag ends.
//
// #86's resolving test, written down in the issue before the feature existed:
//
// > the range from the opener's frame equals the range from the delimiter scan for
// > every tag in a document, and the two paths cannot disagree — which is the shape
// > of bug `deferred.ts:1520` records, where a rewriter silently reshaped a writer's
// > own source
//
// `scan()` pairs delimiters into `Frame { open, close }`. `delimiters()` walks the
// same document independently and reports every bracket with an `opener` flag.
// They were written separately, months apart, and both answer "where does this
// `[` end?". A feature built on one of them inherits a silent disagreement if the
// other is not asked the same question on every bracket.
//
// So this file pairs the openers independently — its own stack, its own logic —
// and requires that it lands where `scan()` says, for every bracket in every
// fixture. Not a spot check. Every one.

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { scan, delimiters } from "../.tmp-test/spans.mjs";
import { tagAtOpener, tagContaining, rangeFor, typingRestoresBrackets } from "../.tmp-test/tagselect.mjs";

export async function run() {

  /** Pair `[` to `]` over a flat delimiter list, with an independent stack. */
  function pairIndependently(delims) {
    const stack = [];
    const pairs = new Map();
    for (const d of delims) {
      if (d.ch === "[" || d.ch === "(" || d.ch === "{") {
        if (!d.structural) continue;
        stack.push(d);
      } else if (d.structural) {
        const open = stack.pop();
        if (open) pairs.set(open.pos, d.pos);
      }
    }
    // Openers with no closer never appear in the map, which is the point.
    return pairs;
  }

  const DOCS = [
    "#הערה[טקסט]\n",
    "#הערה[טקסט עם #מקור[הערה פנימית] בפנים]\n",
    "#ציטוט[ראשון][שני]\n",
    "#רשימה[\n  = א\n  = ב\n]\n",
    "טקסט לפני\n#הערה[א]\nטקסט אחרי\n",
    "#הערה[לא נסגר",
    "#הערה[]\n",
    // Brackets that are **not** structure. A `[` in prose is a character, and
    // pairing it would make a tag-selection feature reach into somebody's text.
    "רואים [סוגריים] באמצע משפט.\n#הערה[כן]\n",
    "/* [בתוך הערה] */ #הערה[כן]\n",
    "`קוד [שם]` ואחריו #הערה[כן]\n",
    "#הערה[\n  #מקור[פנימי]\n]\n",
    "",
  ];

  {
    // The heart of it. For every structural opener in every fixture, an
    // independently-computed closer must equal the one `scan()` reports.
    let compared = 0;
    const disagreements = [];
    for (const doc of DOCS) {
      const s = scan(doc);
      const mine = pairIndependently(delimiters(doc).delims);
      for (const f of s.frames) {
        const expected = mine.get(f.open);
        compared++;
        // A frame running to the end of the document is unclosed, and the
        // independent pass must agree that it found no closer at all.
        if (expected === undefined && f.close === doc.length) continue;
        if (expected !== f.close) disagreements.push(`${JSON.stringify(doc)} @${f.open}`);
      }
    }
    ok("every structural opener pairs to the same closer in both scans", disagreements.length === 0,
      `disagreed on: ${disagreements.join(", ")}`);
    // Guard against the assertion passing because **nothing was compared**. A
    // fixture list that lost its brackets would read as agreement forever, so the
    // count is held against the number of frames the fixtures actually contain —
    // an invariant, not a number someone picked to be true today.
    const totalFrames = DOCS.reduce((n, d) => n + scan(d).frames.length, 0);
    ok("and it compared every frame there is, not a sample", compared === totalFrames,
      `compared ${compared} of ${totalFrames}`);
  }

  // The geometry the feature uses, held directly.

  {
    const doc = "#הערה[שלום עולם]";
    const tag = tagAtOpener(doc, doc.indexOf("["));
    check("body is the words inside the brackets", tag.body, { from: 6, to: 15 });
    check("whole is the call including them", tag.whole, { from: 0, to: 16 });
    ok("clicking the opener finds the tag", tag !== null);
    ok("clicking prose does not", tagAtOpener(doc, 8) === null);
  }

  {
    // The strictness is deliberate: a click just inside the brackets is a click on
    // the writer's words. Only the `[` itself starts a selection.
    const doc = "#הערה[שלום]";
    ok("the character before the bracket is not the bracket", tagAtOpener(doc, doc.indexOf("[") - 1) === null);
    ok("the character after it is not either", tagAtOpener(doc, doc.indexOf("[") + 1) === null);
  }

  {
    // Innermost wins, for the same reason `structureAt` says so.
    const doc = "#הערה[ראש #מקור[פנימי] אחרון]";
    const inner = doc.indexOf("[", doc.indexOf("[") + 1);
    // The caret sits in `פנימי`, so the tag it is in is the **inner** one — which is
    // the point: the outer note is a perfectly good tag and not the one asked for.
    const tag = tagContaining(doc, inner + 1);
    check("the innermost enclosing tag is the one found", tag.body,
      { from: inner + 1, to: doc.indexOf("]") });
    ok("the outer one is still reachable from its own text",
      tagContaining(doc, doc.indexOf("ראש") + 1).body.from < inner);
  }

  {
    // Not inside any tag at all — top-level prose. Null, and the key binding does
    // nothing rather than selecting the whole document.
    const doc = "טקסט רגיל בלי תג\n";
    ok("prose is in no tag", tagContaining(doc, 5) === null);
  }

  {
    // An unclosed tag: the caret is inside it, the frame runs to the end, and the
    // body is "from the `[` to the end" — which is what the writer is looking at.
    const doc = "#הערה[לא נסגר";
    const tag = tagContaining(doc, doc.length);
    check("an unclosed tag still has a body", tag.body, { from: 6, to: doc.length });
  }

  {
    const doc = "#הערה[טקסט]\n";
    const tag = tagAtOpener(doc, doc.indexOf("["));
    check("body mode selects the words", rangeFor(tag, "body"), { from: 6, to: 10 });
    // `Node.to` is one **past** the `]` while `Frame.close` is the `]` itself, so
    // body stops at 10 and whole reaches 11. Two different conventions for the same
    // bracket, and the ranges above are only correct because each uses the one its
    // own source uses.
    check("whole mode selects the call", rangeFor(tag, "whole"), { from: 0, to: 11 });
  }

  // # The rule that had to be written: typing over a whole-tag selection keeps
  // the tag. Decided in #86 and unchanged — silently losing `#הערה[` and `]` is
  // `brackets.ts:3`'s "worst moment in Ksav" happening **as a feature**.
  {
    const doc = "#הערה[ישן]";
    const tag = tagAtOpener(doc, doc.indexOf("["));
    const spec = typingRestoresBrackets(tag, "whole", "חדש");
    // The replacement is checked by *applying* it and looking at the tag that
    // comes out. A string comparison would pass while the selection had quietly
    // become a cursor, and undo/delete would stop working.
    const after = doc.slice(0, tag.whole.from) + spec.changes.insert + doc.slice(tag.whole.to);
    check("typing over a whole tag types it back", after, "#הערה[חדש]");
    // And it is symmetric: the result is still a tag, with the same shape.
    const again = tagAtOpener(after, after.indexOf("["));
    check("so the result is still a tag", again.body, { from: 6, to: 9 });
    ok("with the command still attached", again.name === "הערה");
  }

  {
    // Body mode must NOT wrap. Replacing one word inside a note and wrapping the
    // result would put a note inside every note the writer ever retyped a word
    // in — not a restore, a second edit nobody asked for.
    const doc = "#הערה[ישן]";
    const tag = tagAtOpener(doc, doc.indexOf("["));
    ok("typing over a body selection replaces the words only",
      typingRestoresBrackets(tag, "body", "חדש") === null);
  }

  {
    // An unclosed tag has no `]` to put back, so it is not wrapped. Printing a
    // `]` the writer never typed is the mirror image of the bug this rule exists
    // to prevent: inventing structure rather than losing it.
    const doc = "#הערה[לא נסגר";
    const tag = tagContaining(doc, doc.length);
    ok("an unclosed tag is not given a bracket it never had",
      typingRestoresBrackets(tag, "whole", "x") === null);
  }

  {
    // A bare `[…]` with no command: the tag is the brackets, and wrapping keeps
    // brackets because that is all it ever was.
    const doc = "[טקסט]";
    const tag = tagAtOpener(doc, 0);
    const spec = typingRestoresBrackets(tag, "whole", "חדש");
    ok("a bare group keeps its brackets", spec.changes.insert === "[חדש]");
  }

  // The wiring fence.
  //
  // Everything above is pure geometry, and the *whole feature* — the click, the
  // setting, the two keys — lives outside it. A mutation that deleted the
  // `tagSelectExtension(...)` line would leave every assertion above green and
  // ship a feature that does nothing on click. `whitespace.test.mjs` records the
  // same accident from #83: `Located` sat there declared and imported by nobody for
  // the whole life of a bug. **A fence that cannot fail on "this is not used" is
  // not a fence.**
  {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    ok(
      "the extension is in the editor's list, not merely exported",
      /tagSelectExtension\(\(\) => settings\.clickSelectsTag \?\? "whole"\)/u.test(main),
      "without this the click does nothing and every pure test still passes",
    );
    ok("the setting has a row in Settings", /selectRow\("clickSelectsTagLabel"/u.test(main));
    ok(
      "both keys resolve against the shared registry",
      /kb\[mode === "whole" \? "selectTagWhole" : "selectTagBody"\]/u.test(main),
      "a hard-coded key here would ignore a rebind in Settings",
    );
    // The click is the feature; without `Alt` one of the two answers is unreachable
    // by hand, which is the whole reason the setting exists.
    const src = readFileSync(new URL("../src/tagselect.ts", import.meta.url), "utf8");
    ok(
      "and `Alt`+click reaches the other answer",
      /event\.altKey \? otherSelection\(mode\(\)\) : mode\(\)/u.test(src),
    );
  }

  // Only `[`.
  //
  // #86 is about *tags*. `scan()` frames `(…)` and `{…}` as well — it has to, they
  // are structure and the rest of the editor needs them — and a click handler that
  // answered for all three would select an argument list as though it were a note.
  //
  // This block exists because a mutation removing the `[`-only filter **survived**:
  // every fixture above is square brackets, so the branch had nothing to fail on.
  // That is the same lesson as every other silent green in this repository, found
  // by the instrument rather than by reading the code.
  {
    const code = '#let זוג = ("אלף", "בית")';
    ok("a parenthesis in code is not a tag", tagAtOpener(code, code.indexOf("(")) === null);
    ok("nor is a caret inside one", tagContaining(code, code.indexOf("אלף")) === null);
  }
  {
    const block = "#if true { שלום }";
    ok("a brace in code is not a tag", tagAtOpener(block, block.indexOf("{")) === null);
    ok("nor is a caret inside one", tagContaining(block, block.indexOf("שלום")) === null);
  }
  {
    // And the rule is about the *bracket*, not the command: a `[` inside a note is
    // a tag even though the note is a `#let`, and a `[` in prose is not.
    const real = "#let ערך = [#הערה[כן]]";
    ok("a bracket inside a code block is still a tag",
      tagAtOpener(real, real.lastIndexOf("[")) !== null);
    ok("and the array's own bracket is one too",
      tagAtOpener(real, real.indexOf("[")) !== null);
  }
}

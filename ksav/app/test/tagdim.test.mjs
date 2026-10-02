// #85 — dimming outside the tag, held without a DOM.
//
// The geometry and the fade are both pure functions of the document and the caret, so
// they can be held here. The suite has no `DOM`, so what cannot be held is that the
// right pixels come out — which is what `tools/eyes.mjs` is for.
//
// Three decisions under test:
//   · the strength is a **setting**, so one mechanism serves two needs
//   · there are **levels**, graded by nesting rather than by another setting
//   · with focus mode on as well, **both are satisfied** — the paragraph is inside
//     the tag, so the intersection is the paragraph

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { dimAmount, nestingAt, tagDimDecorations } from "../.tmp-test/tagdim.mjs";

export async function run() {


  const at = (doc, head) => nestingAt(EditorState.create({ doc, selection: { anchor: head } }), head);

  {
    // The caret is in no tag at all — top-level prose. There is nothing to be outside
    // of, so **nothing is dimmed**. Dimming the whole document because the caret
    // happens to sit in plain text would be the worst possible reading of the feature.
    const doc = "טקסט רגיל ללא תג כלל\n";
    const n = at(doc, 5);
    check("no tag means no caret range", n.caret, null);
    check("and nothing is dimmed", dimAmount(n, 1, 0.8), 0);
  }

  {
    // The ordinary case: one tag, caret inside it, a line outside it.
    const doc = "#הערה[גוף ההערה]\nטקסט מחוץ להערה\n";
    const head = doc.indexOf("גוף");
    const n = at(doc, head);
    check("the caret's tag is the line it is on", n.caret, { from: 1, to: 1 });
    check("caretDepth is one", n.caretDepth, 1);
    check("its own line is undimmed", dimAmount(n, 1, 0.8), 0);
    ok("and a line outside it is dimmed", dimAmount(n, 2, 0.8) > 0);
  }

  {
    // # The levels. Three tags nested, caret in the innermost.
    //
    // Four kinds of line: inside the caret's tag, inside a middle tag but outside the
    // caret's, and outside every tag. The middle one is the whole point of having levels
    // — the block you are in keeps its shape at exactly the depth where shape matters.
    const doc = "#א[שורה אחת שתי שלוש\n#ב[ראש שני שלוש\n#ג[פנימי אחד שתי שלוש\nסיום שלוש שתי אחת]]]\n";
    const head = doc.indexOf("פנימי");
    const n = at(doc, head);
    check("three tags deep", n.caretDepth, 3);
    const inner = dimAmount(n, 3, 1);
    const middle = dimAmount(n, 2, 1);
    const outer = dimAmount(n, 1, 1);
    check("the caret's own line is undimmed", inner, 0);
    ok("a line in a middle tag is dimmed but less than one outside everything",
      middle < outer, `middle=${middle}, outer=${outer}`);
    ok("and neither is undimmed", middle > 0 && outer > 0);
    // The ordering is the assertion. A grader that made every outside-line the same
    // would also be "graded" and would show nothing.
    ok("levels are strictly ordered inner to outer", inner < middle && middle < outer);
  }

  {
    // # The strength is a setting, and it is a real dial.
    const doc = "#הערה[גוף ההערה]\nטקסט מחוץ להערה\n";
    const n = at(doc, doc.indexOf("גוף"));
    check("no dimming at zero", dimAmount(n, 2, 0), 0);
    const quarter = dimAmount(n, 2, 0.25);
    const half = dimAmount(n, 2, 0.5);
    const full = dimAmount(n, 2, 1);
    ok("and it scales monotonically", quarter < half && half < full);
    check("reaching one at full strength", full, 1);
    // Out-of-range values must not produce nonsense opacity like -3 or 7.
    check("over 1 is clamped", dimAmount(n, 2, 4), 1);
    check("negative is clamped to nothing", dimAmount(n, 2, -2), 0);
  }

  {
    // # Both rules satisfied at once.
    //
    // Focus mode dims outside the paragraph; this dims outside the tag. A paragraph is
    // inside a tag, so the visible range is the paragraph and neither rule has to know
    // the other exists. Asserted here as the geometry that makes it true.
    const doc = "#הערה[שורה ראשונה שתי שלוש\n\nשורה שנייה כמה מילים עוד כאן]\n";
    const head = doc.indexOf("שורה שנייה");
    const n = at(doc, head);
    ok("the caret is inside a tag", n.caret !== null);
    ok("whose lines include the caret's paragraph", n.caret.to >= doc.slice(0, head).split("\n").length);
  }

  {
    // The viewport walk, which is the part that decides whether this costs anything.
    const doc = Array.from({ length: 500 }, (_, i) => `#הערה[שורה ${i} כמה מילים עוד כאן]`).join("\n");
    // The caret sits **inside** the first tag's body. Position 5 is the `[`
    // itself, which is the opener and not inside it — the same distinction
    // `tagselect.ts` insists on, and the reason a first attempt at this failed.
    const state = EditorState.create({ doc, selection: { anchor: 10 } });
    ok("a five-hundred-line document scans", nestingAt(state, 10).caretDepth === 1);
    // And `strength === 0` must cost nothing at all, so the feature is free while off.
    const view = { state, visibleRanges: [{ from: 0, to: doc.length }], dom: null };
    const empty = tagDimDecorations(view, 0);
    check("nothing is built while it is off", empty.size, 0);
  }

  // # The cost claim, held as a cost.
  //
  // "Off costs nothing" is a **performance** promise, so no assertion about what the
  // function returns can hold it. With `strength === 0` the fade is already 0, so
  // removing the early return leaves the answer **identical** and every other
  // assertion here green — a mutation that passed.
  //
  // What the early return actually buys is not entering `nestingAt` at all, which is
  // a whole-document `scan()`. So it is measured: off against on, over a document big
  // enough for the difference to be many times the noise, and asserted as a **ratio**
  // so no absolute millisecond figure has to hold on somebody else's machine.
  {
    const big = Array.from(
      { length: 400 },
      (_, i) => `#הערה[שורה ${i} עם כמה מילים עוד כאן בתוכה]`,
    ).join("\n");
    const state = EditorState.create({ doc: big, selection: { anchor: 12 } });
    const view = { state, visibleRanges: [{ from: 0, to: big.length }], dom: null };
    const perCall = (n, f) => {
      f();
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < n; i++) f();
      return Number(process.hrtime.bigint() - t0) / 1e6 / n;
    };
    const off = perCall(20, () => tagDimDecorations(view, 0));
    const on = perCall(20, () => tagDimDecorations(view, 0.8));
    // The floor is 3×. `scan()` over 400 lines is an order of magnitude more work
    // than the viewport walk being skipped, so a removed early return cannot meet it.
    ok(
      `off is far cheaper than on (\u00d7${(on / off).toFixed(1)})`,
      on / off > 3,
      `off ${off.toFixed(3)} ms, on ${on.toFixed(3)} ms — if these are close, the early return is gone`,
    );
  }

  // The wiring fence: the mechanism can be perfect and the feature still not exist.
  {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    ok("the dimming is in the editor's extension list", /tagDim\(/u.test(main),
      "without this every assertion above still passes");
    ok("and the setting feeds it", /settings\.dimOutsideTag/u.test(main));
  }
}

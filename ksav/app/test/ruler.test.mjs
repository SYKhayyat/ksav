// The overview ruler's arithmetic and its precedence rule.
//
// The strip itself is DOM and is not tested here. What is tested is the two
// things that would be wrong in a way nobody would notice: which mark wins when
// a line has several, and where a mark sits on a strip of a given height.
//
// The second one matters more than it looks. A ruler is only useful if a tick
// three quarters of the way down means the line three quarters of the way
// through the document — the entire value of the feature is that the position is
// trustworthy, and an off-by-one in the mapping makes it a decoration.

import { check, ok } from "./harness.mjs";
import { mergeMarks, markTop, KINDS } from "../.tmp-test/ruler.mjs";

export function run() {
  // -------------------------------------------------------------- precedence
  //
  // A line with a compile error and a misspelling on it is one problem to look
  // at, and it is the error: the error is why the page is blank and the
  // misspelling is not. Drawn as two ticks it reads as two problems and makes
  // the strip's density a lie about how much is wrong.
  {
    const merged = mergeMarks([
      { line: 5, kind: "spelling" },
      { line: 5, kind: "error" },
      { line: 5, kind: "change" },
    ]);
    check("one line, one mark", merged.length, 1);
    check("…and it is the most severe", merged[0].kind, "error");
  }

  check(
    "severity order is error, warning, spelling, change",
    KINDS,
    ["error", "warning", "spelling", "change"],
  );

  {
    // Order-independent: whichever arrives first, the same mark wins.
    const forwards = mergeMarks([{ line: 1, kind: "warning" }, { line: 1, kind: "error" }]);
    const backwards = mergeMarks([{ line: 1, kind: "error" }, { line: 1, kind: "warning" }]);
    check("precedence does not depend on arrival order", forwards[0].kind, backwards[0].kind);
  }

  {
    const merged = mergeMarks([
      { line: 9, kind: "change" },
      { line: 2, kind: "error" },
      { line: 5, kind: "spelling" },
    ]);
    check("marks come out in line order", merged.map((m) => m.line), [2, 5, 9]);
  }

  check("nothing wrong is no marks", mergeMarks([]), []);

  // ------------------------------------------------------------- positioning
  //
  // The strip spans the document: the first line is at the top edge and the last
  // at the bottom. Mapping to `line / count` instead would leave the last line a
  // full line short of the bottom, which on a ten-line document is a tenth of
  // the strip of visible, unexplained gap.
  check("the first line is at the top", markTop(1, 100), 0);
  check("the last line is at the bottom", markTop(100, 100), 1);
  check("the middle is in the middle", markTop(51, 101), 0.5);

  // A one-line document has no span to divide by, and must not produce NaN —
  // which would reach the DOM as `top: NaN%` and put every tick at the top with
  // no indication anything was wrong.
  check("a one-line document does not divide by zero", markTop(1, 1), 0);
  check("nor an empty one", markTop(1, 0), 0);

  // Out-of-range lines are clamped rather than allowed off the strip. They
  // should not happen — every producer filters — but a tick drawn at `-40%` is
  // invisible, and an invisible tick is a problem the writer is never told
  // about, which is the failure this whole feature exists to prevent.
  ok("a line before the start clamps to the top", markTop(-5, 50) === 0);
  ok("a line past the end clamps to the bottom", markTop(999, 50) === 1);

  // Monotonic: further down the document is further down the strip, always.
  {
    let previous = -1;
    let monotonic = true;
    for (let line = 1; line <= 200; line++) {
      const top = markTop(line, 200);
      if (top < previous) monotonic = false;
      if (top < 0 || top > 1) monotonic = false;
      previous = top;
    }
    ok("every position is inside the strip and in order", monotonic);
  }
}

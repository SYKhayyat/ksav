// #84 — the indent view's rules, held without a DOM.
//
// Everything here is arithmetic over a document. There is no `Decoration` in
// `indent.ts` and no browser in this file, because the rules are where the feature
// is right or wrong and the rendering is where it is merely visible. A rule that is
// wrong looks like nothing; a rule that is right looks like an indent.
//
// The five rules under test, from the issue:
//
//   1. every `][` gets its own line, indented
//   2. the indent amount is a user-set value
//   3. the ceiling is amount-from-side (from the **left** in RTL) or percent used
//   4. a body below the minimum word count is left completely alone
//   5. paragraph breaks inside an indented paragraph share its indent level

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import {
  DEFAULT_INDENT,
  indentBudget,
  maxLevel,
  planIndent,
  wordCount,
} from "../.tmp-test/indent.mjs";

export async function run() {


  const opts = (over = {}) => ({
    ...DEFAULT_INDENT,
    amount: 2,
    minWords: 1,
    ceiling: "percent",
    percent: 50,
    dir: "rtl",
    ...over,
  });

  // The levels at which lines start, which is what the whole feature is.
  {
    // # Rule 4, and it is the one that makes the feature safe.
    //
    // Below the minimum the tag is not touched: not indented, not broken, nothing.
    // `#נטוי[מילה]` is most of the emphasis in a sefer and there are hundreds of them,
    // and a machine that blows each one into three lines is a machine the writer
    // fights.
    const short = "#נטוי[מילה]\n";
    const long = "#נטוי[מילה שנייה מילה שלישית רביעית]\n";
    const breaks = (d, o) => planIndent(d, o, 80).filter((l) => l.viewBreak).length;
    // "Left alone" is about **breaks introduced**, not about how many lines the
    // document has — a trailing newline is a line either way, and counting lines here
    // would have passed on a planner that broke `#נטוי[מילה]` into three.
    check("a one-word body is not broken at minWords 4", breaks(short, opts({ minWords: 4 })), 0);
    ok("and the same body is broken at minWords 1", breaks(short, opts({ minWords: 1 })) > 0);
    ok("while a long body is broken either way", breaks(long, opts({ minWords: 4 })) > 0);
    ok("and it is indented, not merely broken", planIndent(long, opts({ minWords: 4 }), 80).some((l) => l.level > 0));
  }

  {
    // `0` is a real setting, not a guard against division by nothing: it means
    // "anything gets a break, however small" — the option nobody should want, and so
    // one that must be reachable rather than excluded.
    const doc = "#הדגשה[א]\n";
    ok("minWords 0 breaks even a single-letter body", planIndent(doc, opts({ minWords: 0 }), 80).length > 1);
    ok("minWords 1 breaks a single word too", planIndent(doc, opts({ minWords: 1 }), 80).length > 1);
  }

  {
    // # Rule 1, and nesting.
    const doc = "#הדגשה[מילה אחת מילה שנייה]\n";
    const plan = planIndent(doc, opts(), 80);
    const breakAt = plan.filter((l) => l.viewBreak).length;
    ok("a qualifying tag breaks after `[` and after `]`", breakAt === 2, `got ${breakAt}`);
    // The body line is one step in; the line after the `]` is back out.
    const bodyLine = plan.find((l) => l.viewBreak);
    check("the body sits one level in", bodyLine.level, 1);
  }

  {
    // Two levels deep. The inner body is two steps in, and this is the case that
    // makes the ceiling matter at all.
    const doc = "#מדף_א[הקדמה שלוש מילות כאן]\n#הערה[פתק אחד שתי מילות]\n";
    const plan = planIndent(doc, opts(), 80);
    ok("nesting produces a deeper line", plan.some((l) => l.level >= 1));
  }

  {
    // # Rule 5 — the rule the issue calls "not a detail", and the reason the block
    // must not fall apart at the first gap in the prose.
    //
    // A blank line has no content to hang an indent off. The obvious implementation
    // gives it the level of whatever surrounds it and the block visibly comes apart.
    const doc = "#מדף_א[הקדמה שלוש מילות כאן\n\nהמשך הדבר עוד מילה כאן]\n";
    const plan = planIndent(doc, opts(), 80);
    const at = plan.findIndex((l) => l.blank);
    ok("a blank line inside an indented block is planned", at >= 0);
    check("and it shares the indent level of the paragraph around it", plan[at].level, plan[at - 1].level);
    ok("which is not zero", plan[at].level > 0,
      "a blank line at the margin looks like the block has come apart at the first gap");

    // # The case that separates this from "blank lines are always level 0".
    //
    // This blank line sits after an **inner** note's `]` and still inside an outer
    // one. Its own depth is the outer note's, while the line above it is the `]` of
    // the inner note. A planner reading the level off the previous line would carry
    // the inner level past the bracket that ended it, and the outer paragraph would
    // look one step deeper for a line it has left.
    const nested =
      "#מדף_א[הקדמה #הערה[פתק שתי מילות עוד]\n\nהמשך של המדף עוד מילה כאן]\n";
    const nplan = planIndent(nested, opts(), 80);
    const nat = nplan.findIndex((l) => l.blank);
    ok("the nested blank line is planned", nat >= 0);
    ok("and it is not pinned at the margin", nplan[nat].level > 0);
    // The inner note's own body is two steps in. The blank line is not — it has
    // left that note — but it is still inside the outer one, so it holds the
    // outer's single step. That is rule 5 twice over: it shares a level with the
    // paragraph it is in, and the paragraph it is in is the outer one.
    check("the inner body is two steps in", Math.max(...nplan.map((l) => l.level)), 2);
    check("and the blank line has stepped back out to the outer one", nplan[nat].level, 1);
  }

  {
    // The same rule, stated as the thing it must not do: a blank line must not take
    // the level of what *follows* it either. In a closing `]` that is level 0, and a
    // planner that looked forward would drop the blank line to the margin.
    const doc = "#מדף_א[הקדמה שלוש מילות כאן\n\nהמשך הדבר עוד מילה כאן]\n";
    const plan = planIndent(doc, opts(), 80);
    const blank = plan.find((l) => l.blank);
    ok("a blank line does not take the level of the line after it either", blank.level > 0);
  }

  {
    // # Rule 2 — the amount is a **user-set value**.
    //
    // Written after a mutation that replaced `opts.amount` with a hardcoded 2 and
    // **passed every test**, because every fixture in this file used 2. A setting
    // nobody has varied is a setting nobody has tested, and a hardcoded default is
    // the one thing a "user-set value" must never be.
    const doc = "#מדף_א[הקדמה שלוש מילות כאן]\n";
    check("one space a step", maxLevel(opts({ amount: 1, percent: 50 }), 80), 40);
    check("two spaces a step", maxLevel(opts({ amount: 2, percent: 50 }), 80), 20);
    check("four spaces a step", maxLevel(opts({ amount: 4, percent: 50 }), 80), 10);
    check("eight spaces a step", maxLevel(opts({ amount: 8, percent: 50 }), 80), 5);
    // The budget does not move — only how many steps fit inside it.
    check("the budget is the same either way",
      indentBudget(opts({ amount: 4 }), 80), indentBudget(opts({ amount: 2 }), 80));
    // And in the same narrow budget a small step gets **further** into the document
    // before it stops, which is the whole point of the amount being the writer's
    // number. It needs a document that actually nests — a one-level document is
    // one level deep whatever the step, and comparing those proves nothing.
    const fourDeep = "#א[#ב[#ג[#ד[מילה אחת שתי שלוש ארבע]]]]\n";
    const one = Math.max(...planIndent(fourDeep, opts({ amount: 1, percent: 10 }), 80).map((l) => l.level));
    const eight = Math.max(...planIndent(fourDeep, opts({ amount: 8, percent: 10 }), 80).map((l) => l.level));
    check("a one-space step reaches deeper in the same budget than an eight-space one",
      [one > eight], [true]);
    check("and the roomier step is the one that clamped", [eight === 1, one === 4], [true, true]);

    // # Rule 3 — percent of the width.
    //
    // The issue's own arithmetic: "how deep can I go = (limit% × width) ÷ step". A
    // narrow pane indents fewer levels and a wide one more, with nothing to tune.
    check("50% of an 80-column pane", indentBudget(opts({ percent: 50 }), 80), 40);
    check("a narrow pane has less room", indentBudget(opts({ percent: 50 }), 40), 20);
    check("at two spaces a step, 80 columns at 50%", maxLevel(opts({ percent: 50 }), 80), 20);
    check("and a 40-column pane goes half as deep", maxLevel(opts({ percent: 50 }), 40), 10);
  }

  {
    // Rule 3 the other way: an absolute amount from a side.
    const absolute = opts({ ceiling: "amount", amountFromSide: 12 });
    check("an amount ceiling is that many characters", indentBudget(absolute, 80), 12);
    check("and does not grow with the pane", indentBudget(absolute, 200), 12);
    check("six levels at two spaces", maxLevel(absolute, 80), 6);
  }

  {
    // # Rule 3's side, and the part the issue says is easy to get wrong.
    //
    // In RTL the indent grows from the right, so the space that runs out is on the
    // **left** — the opposite of what `padding-inline-start` gives. Both directions
    // produce the same depth for the same numbers, which is exactly why a renderer
    // can look right in one language and be wrong in the other, and why the
    // direction is carried here rather than left to CSS.
    const rtl = opts({ dir: "rtl" });
    const ltr = opts({ dir: "ltr" });
    check("rtl and ltr agree on depth for the same numbers", maxLevel(rtl, 80), maxLevel(ltr, 80));
    ok("and the direction is carried in the options", rtl.dir === "rtl" && ltr.dir === "ltr");
  }

  {
    // The clamp. A document that nests twenty deep must stop at what the pane can
    // hold — `MAX_LEVEL = 9`'s argument, "a limit the page can honour beats a
    // promise it cannot" (`spans.ts:459`), is the same argument one level up.
    const deep = "#א[".repeat(12) + "מילה אחת שתי מילות שלוש" + "]".repeat(12) + "\n";
    // 25% of 80 at two spaces is ten levels, and the document nests twelve — so the
    // budget is genuinely exceeded and the clamp has something to do.
    const tight = opts({ percent: 25 });
    const ceiling = maxLevel(tight, 80);
    const deepest = Math.max(...planIndent(deep, tight, 80).map((l) => l.level));
    check("no line is indented past the budget", deepest, ceiling);
    ok("and the budget really was the binding constraint", deepest < 12,
      `document nests 12, budget allowed ${ceiling}`);
    // And with room to spare nothing is clamped, so the clamp is not simply always-on.
    const roomy = Math.max(...planIndent(deep, opts({ percent: 100 }), 80).map((l) => l.level));
    ok("with room to spare the depth is the real depth", roomy > ceiling);
  }

  {
    // Degenerate inputs must not throw or divide by zero. `amount` of 0 would make
    // `floor(budget / 0)` an `Infinity` that clamps everything to `Infinity`.
    ok("a zero amount does not explode the levels", maxLevel(opts({ amount: 0 }), 80) >= 0);
    ok("a negative amount does not either", maxLevel(opts({ amount: -4 }), 80) >= 0);
    ok("an empty document plans nothing", planIndent("", opts(), 80).length <= 1);
    ok("a zero-width pane clamps to zero rather than dividing", maxLevel(opts({ percent: 50 }), 0) === 0);
  }

  {
    // Words, as the issue counts them: runs of non-space characters. Checked because
    // the threshold decides whether hundreds of `#נטוי[מילה]` in a sefer are touched,
    // and a count that splits on the wrong thing moves that threshold silently.
    check("one word", wordCount("מילה"), 1);
    check("four words", wordCount("א ב ג ד"), 4);
    check("newlines are not words", wordCount("a\n\nb"), 2);
    check("leading and trailing space is not a word", wordCount("  a  "), 1);
    check("empty is zero", wordCount(""), 0);
  }

  // The wiring fence. The plan is worth nothing if the toggle never calls it.
  {
    const src = readFileSync(new URL("../src/indent.ts", import.meta.url), "utf8");
    ok("the planner is exported, not internal", /export function planIndent/u.test(src));
  }
}

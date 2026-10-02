// #84 — the indent view.
//
// Six rules, all of them settled in the issue and none of them about rendering:
//
//   1. every `][` gets its own line, indented
//   2. the indent amount is a user-set value
//   3. the ceiling is named either as an amount from a side — **in RTL, from the
//      left** — or as a percent of the width
//   4. a body below the minimum word count is left completely alone
//   5. paragraph breaks inside an indented paragraph share its indent level
//   6. it is a toggleable view; the file is never changed
//
// This module is rules 1–5 and none of rule 6. It is pure arithmetic over the
// document: **what the view should look like**, with no `Decoration` in it and no
// `DOM`. That split is deliberate — the rules are where the feature is right or
// wrong, and this suite cannot build a `DOM`, so a planner can be held and a
// rendering cannot.
//
// # Why a *planner* and not a formatter
//
// Rule 6 says nothing is written to the file, so there is no rewrite to make
// idempotent, no undo step to invent, and no `git` noise to apologise for. What is
// left is a *description* of visual lines — where one begins and how deep it sits —
// and something later turns that into decorations. Two consequences worth stating
// because they are easy to get wrong when writing the renderer:
//
//   · **A line break inside a tag's body is a space on the page.** `main.ts:5910`
//     is explicit that Typst turns a newline into a space and a *blank* line into
//     a paragraph break. So the breaks this plan introduces are display-only, and
//     the only reason that is safe is that they are never text.
//   · **A blank line is not an empty line.** It is a paragraph break on the page,
//     which is why rule 5 exists and why `viewBreak` and `blank` are separate fields
//     here. A view that treats the two alike will be wrong on the printed page even
//     when it looks right on screen.

import { scan } from "./spans";

/** The dials, as the issue names them. */
export interface IndentOptions {
  /** Spaces of indent per level of nesting. Default 2, per `table.ts:258`. */
  amount: number;
  /**
   * Minimum words in a body before it is re-presented at all.
   *
   * The load-bearing knob. Below it the tag is not touched — not indented, not
   * broken, nothing — because `#נטוי[מילה]` is most of the emphasis in a sefer and
   * there are hundreds of them. `0` means "anything gets a break, however small",
   * which is the setting nobody should want and which must therefore be *reachable*
   * rather than excluded.
   */
  minWords: number;
  /** How the ceiling is named: an absolute amount, or a share of the width. */
  ceiling: "amount" | "percent";
  /** Characters of indent allowed when `ceiling` is `"amount"`. */
  amountFromSide: number;
  /** Share of the pane width allowed when `ceiling` is `"percent"`, as 0–100. */
  percent: number;
  /** Which edge the indent grows from — and therefore which side the ceiling is measured from. */
  dir: "rtl" | "ltr";
}

/** The issue's own numbers: two spaces, 50%, and a minimum nobody has measured yet. */
export const DEFAULT_INDENT: IndentOptions = {
  amount: 2,
  // Four words. `#נטוי[מילה]` is one and stays one line; a note is a sentence or
  // more and gains a break. Named as a default and changeable, which is what the
  // issue asked for — it is the writer's number, not a fact.
  minWords: 4,
  ceiling: "percent",
  amountFromSide: 40,
  percent: 50,
  dir: "rtl",
};

/**
 * How many characters of indent the pane has room for.
 *
 * Both ways of naming the ceiling reduce to one number, and the level count is
 * `floor(that ÷ amount)` — the arithmetic the issue gives in a line: *"how deep can
 * I go = (limit% × width) ÷ step"*.
 *
 * ## The side, and why `rtl` measures from the left
 *
 * In a Hebrew document the indent grows from the **right**, so the space that runs
 * out is the space on the **left**. That is stated in the issue and it is the
 * opposite of what `padding-inline-start` gives, which is what I would have written
 * without being told. So the side is not decoration here: it is which edge the
 * ceiling is measured from, and getting it backwards indents a `rtl` document until
 * it runs off the wrong edge.
 *
 * Both options are expressed as **characters of indent available**, because that is
 * what either one ultimately means, and the difference between them is only which
 * word the writer reaches for. A width that is not yet known falls back to a column
 * count, since a pane is never narrower than the text it is showing.
 */
export function indentBudget(opts: IndentOptions, width: number): number {
  const chars = opts.ceiling === "percent" ? (width * opts.percent) / 100 : opts.amountFromSide;
  return Math.max(0, chars);
}

/** The deepest level that fits, never below zero and never above the budget. */
export function maxLevel(opts: IndentOptions, width: number): number {
  const step = Math.max(1, opts.amount);
  return Math.max(0, Math.floor(indentBudget(opts, width) / step));
}

/** Words in a body, as the issue counts them: runs of non-space characters. */
export function wordCount(body: string): number {
  const m = body.match(/\S+/gu);
  return m ? m.length : 0;
}

/** One visual line in the plan. */
export interface VisualLine {
  /** Document position where the line starts. */
  from: number;
  /** Indent levels. Already clamped to what the pane has room for. */
  level: number;
  /**
   * Is the break at `from` one the view introduced?
   *
   * `true` at the position just after a qualifying `[` or `]` — **not** at a
   * newline the writer typed, and never at a blank line. The renderer needs the
   * difference because a break the writer typed already has a line to sit on.
   */
  viewBreak: boolean;
  /**
   * Is this line blank — a **paragraph break**, which prints?
   *
   * Rule 5: a blank line inside an indented paragraph **shares that paragraph's
   * indent level**. It is not left at the margin looking empty, and it is not given
   * the level of whatever follows it. Both of those make the block look like it has
   * come apart at the first gap in the prose.
   */
  blank: boolean;
}

/**
 * Every visual line the view should draw, in document order.
 *
 * Rule 1 — a qualifying tag's body starts its own line, and the text after its `]`
 * starts another. Rule 4 — a tag below the minimum is not a tag this plan breaks at
 * all, so its body stays wherever the writer's own newlines put it. Rule 5 — a
 * blank line takes the level of the line above it, which is what "shares an indent
 * level" means.
 */
export function planIndent(doc: string, opts: IndentOptions, width: number): VisualLine[] {
  const ceiling = maxLevel(opts, width);
  const s = scan(doc);
  const structural = s.frames.filter((f) => doc[f.open] === "[");

  // Rule 4, once per frame: does this body earn a break?
  const qualifies = new Set<number>();
  for (const f of structural) {
    const body = doc.slice(f.open + 1, Math.min(f.close, doc.length));
    if (wordCount(body) >= opts.minWords) qualifies.add(f.open);
  }

  /** Rule 5's shared level, and rule 1's breaks, all from one walk. */
  const starts = new Map<number, { viewBreak: boolean; blank: boolean }>();
  const noteStart = (from: number, viewBreak: boolean, blank: boolean) => {
    if (!starts.has(from)) starts.set(from, { viewBreak, blank });
  };

  // Every line the writer wrote is a line, whatever else happens.
  let at = 0;
  for (let i = 0; i <= doc.length; i++) {
    if (i === doc.length || doc[i] === "\n") {
      noteStart(at, false, doc.slice(at, i).trim() === "");
      at = i + 1;
    }
  }

  // Rule 1 — the break after each qualifying bracket.
  for (const open of qualifies) {
    const frame = structural.find((f) => f.open === open)!;
    noteStart(open + 1, true, false);
    // After the `]`. For an unclosed tag `close` is the end of the document, and
    // there is no line to begin there — so nothing is added, and the plan stays a
    // plan rather than inventing a position that is not in the text.
    if (frame.close < doc.length) noteStart(frame.close + 1, true, false);
  }

  // Depth at a position: how many qualifying brackets enclose it. The last one to
  // close is the innermost, so counting the enclosing set is the same as counting
  // out.
  const depthAt = (pos: number): number => {
    let d = 0;
    for (const open of qualifies) {
      const frame = structural.find((f) => f.open === open)!;
      if (frame.open < pos && pos <= frame.close) d++;
    }
    return d;
  };

  const out: VisualLine[] = [];
  for (const from of [...starts.keys()].sort((a, b) => a - b)) {
    const meta = starts.get(from)!;
    // # Rule 5, and why there is no special case for it here
    //
    // The rule reads "paragraph breaks within an indented paragraph share that
    // indent level", and the first thing written here was an explicit `above`
    // clause to do it — take the level of the line above. A mutation that removed
    // that clause **passed every test**, and the reason is worth more than the
    // clause: a line is planned at every depth transition, including just after
    // each `]`, so the line above a blank line is already at the depth that
    // `depthAt` computes for the blank line itself. The two are not merely equal on
    // the fixtures I had — they are equal because a blank line cannot be reached
    // without having crossed a planned boundary.
    //
    // So the clause was dead code with a persuasive comment attached, and it is
    // gone. Rule 5 is held below by `depthAt` **and by a test that fails when
    // `depthAt` is made to ignore blank lines** — which is the assertion that was
    // missing when the clause seemed necessary.
    out.push({
      from,
      level: Math.min(depthAt(from), ceiling),
      viewBreak: meta.viewBreak,
      blank: meta.blank,
    });
  }
  return out;
}
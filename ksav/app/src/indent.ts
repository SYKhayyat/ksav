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
// ------------------------------------------------------------------ rendering
//
// The planner above says *what*; this says how it is drawn. Two widgets and two
// kinds of decoration, and the whole design is one sentence: **a line break in this
// view is a block element, not a character.** Nothing here writes to the document,
// which is what makes rule 6 true rather than aspirational — there is no code path
// from this module to a `Transaction` with changes.

import { EditorView, WidgetType, Decoration, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import type { Extension, EditorState } from "@codemirror/state";

/** The `[` or `]`, drawn as a block so the text after it starts a line. */
class BracketBlock extends WidgetType {
  constructor(readonly ch: string) {
    super();
  }
  eq(other: BracketBlock) {
    return other.ch === this.ch;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "ksav-indent-bracket";
    s.textContent = this.ch;
    return s;
  }
}

/**
 * The indent, as padding on the line's first character.
 *
 * `padding-inline-start` is right in **both** directions, and that is not luck: in
 * RTL it is the right edge, which is where a Hebrew line is indented from, and in
 * LTR it is the left. The opposite-of-`padding-inline-start` warning in the issue
 * is about the **ceiling** — in RTL the space that runs out is on the left — and the
 * ceiling is arithmetic in `indentBudget`, not CSS.
 */
class IndentPad extends WidgetType {
  constructor(
    readonly level: number,
    readonly amount: number,
    /** The character this widget stands in for, so the line does not lose one. */
    readonly text: string,
  ) {
    super();
  }
  eq(other: IndentPad) {
    return other.level === this.level && other.amount === this.amount && other.text === this.text;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "ksav-indent-pad";
    s.style.paddingInlineStart = `${this.level * this.amount}ch`;
    s.textContent = this.text;
    return s;
  }
}

/**
 * One spec per decoration rather than one shared spec with a factory.
 *
 * The obvious `Decoration.widget({ widget: (v) => ... })` cannot work: that factory
 * is handed the **view**, not the data, so a level computed per line has nowhere to
 * arrive. CodeMirror compares widgets with `eq`, which is why a fresh spec per
 * decoration costs nothing at redraw.
 */
function blockAt(ch: string) {
  return Decoration.replace({ widget: new BracketBlock(ch), block: true });
}
/**
 * The indent, as a **replace** over the line's first character rather than a widget
 * inserted before it.
 *
 * `Decoration.widget({ side: -1 })` at the position just after a block replacement
 * builds cleanly and renders **nothing** — the mark is counted, the field is
 * correct, and there is no `.ksav-indent-pad` in the DOM. An inline widget landing on
 * the first position of a block's content is absorbed into that block.
 *
 * So the pad replaces one character and draws that character itself, with the
 * padding in front of it. One character in, one character out, and the indent is
 * part of the same node as the text it indents — which also means it cannot be
 * dropped without the text going with it.
 */
function padAt(level: number, amount: number, text: string) {
  return Decoration.replace({ widget: new IndentPad(level, amount, text) });
}

/**
 * How many characters wide the editor is, for the ceiling.
 *
 * Measured, not assumed: the ceiling is a fraction of the pane, so an estimate that
 * is 20% out moves the cap by 20%.
 */
export function charsWide(view: EditorView): number {
  const dom = view.dom.querySelector(".cm-content") as HTMLElement | null;
  if (!dom) return 0;
  const width = dom.clientWidth;
  if (!width) return 0;
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  probe.textContent = "0".repeat(100);
  dom.appendChild(probe);
  const ch = probe.getBoundingClientRect().width / 100 || 1;
  probe.remove();
  return Math.max(1, Math.floor(width / ch));
}

// ------------------------------------------------------------------ the state
//
// # Why a `StateField` and not a `ViewPlugin`
//
// The obvious implementation is a `ViewPlugin` returning `Decoration.replace({
// block: true })`, and CodeMirror **refuses it**:
//
// > `RangeError: Block decorations may not be specified via plugins`
//
// A block widget changes how the lines are laid out rather than marking a range of
// one, so it cannot be recomputed outside the state without the block structure and
// the state disagreeing. The same argument as every other "derive it from one place"
// decision in this repository, arrived at by a thrown exception.
//
// # And why the declarations below are in this exact order
//
// A `ViewPlugin` constructor is allowed to dispatch, and a field's `create` runs
// during `EditorState.create`. With code splitting, `main.ts`'s top-level editor
// construction and the evaluation of *this* module can interleave, so anything a
// field's `create` reaches for must already be initialised. The first version
// declared `indentDecorations` **before** the `indentSettings` it reads and before
// the `cfgOf` arrow it calls, and the result was:
//
// > `ReferenceError: Cannot access 'n' before initialization`
//
// thrown from inside `StateField.create` — in a *different* chunk, which is why it
// arrived as a minified name with no local clue. Two things follow: the helpers are
// `function` declarations so they are hoisted regardless of order, and every field
// is declared after everything it reads.
//
// This is the eighth instrument-shaped failure of the session, and the only one
// where the instrument was **my own eye**: the screenshot showed an indent view that
// was not indenting, with every setting correctly in localStorage.

const setIndentWidth = StateEffect.define<number>();
const setIndentSettings = StateEffect.define<IndentOptions & { on: boolean }>();

/** Nothing to compute from a state that has no settings yet. */
function cfgOf(state: EditorState): IndentOptions & { on: boolean } {
  return state.field(indentSettings, false) ?? { ...DEFAULT_INDENT, on: false };
}

/** The pane width, carried **in the state**, because that is where decorations come from. */
const indentWidth = StateField.define<number>({
  create: () => 0,
  update(w, tr) {
    for (const e of tr.effects) if (e.is(setIndentWidth)) return e.value;
    return w;
  },
});

/**
 * The current settings, kept **on the state** rather than read through a closure.
 *
 * A closure would have worked and been wrong: the field would read a setting the
 * writer has since changed, and the change would appear only when something else
 * happened to dispatch a transaction.
 */
const indentSettings = StateField.define<IndentOptions & { on: boolean } | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setIndentSettings)) return e.value;
    return v;
  },
});

const indentDecorations = StateField.define<DecorationSet>({
  create(state) {
    return build(state, state.field(indentWidth, false) ?? 0, cfgOf(state));
  },
  update(deco, tr) {
    const cfg = cfgOf(tr.state);
    const w = tr.state.field(indentWidth, false) ?? 0;
    const before = cfgOf(tr.startState);
    if (tr.docChanged || cfg !== before || w !== (tr.startState.field(indentWidth, false) ?? 0)) {
      return build(tr.state, w, cfg);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function build(
  state: EditorState,
  width: number,
  cfg: IndentOptions & { on: boolean },
): DecorationSet {
  if (!cfg.on || !width) return Decoration.none;
  const b = new RangeSetBuilder<Decoration>();
  const doc = state.doc.toString();
  const plan = planIndent(doc, cfg, width);
  const breaksAt = new Set(plan.filter((l) => l.viewBreak).map((l) => l.from));
  const s = scan(doc);

  // # One sorted pass, not "blocks first, then padding"
  //
  // `RangeSetBuilder` requires strictly increasing positions and throws otherwise.
  // Adding every block and then every pad walks the document **backwards** the
  // moment a tag has a body — positions 5, 15, then 6 — and the throw is swallowed
  // by CodeMirror's field machinery, which keeps the previous (empty) set. The
  // symptom is the exact one this module had for an hour: no decorations, no error,
  // every setting correct.
  //
  // So both kinds are collected first and added in one order. Sorting by `from` and
  // then by `to` also puts an insertion at a position before a range starting there,
  // which is the order `RangeSetBuilder` wants for the two.
  const marks: { from: number; to: number; deco: Decoration }[] = [];
  for (const f of s.frames) {
    if (doc[f.open] !== "[" || !breaksAt.has(f.open + 1)) continue;
    // Rule 1: a block at the opener and a block at the closer. The closer is
    // omitted for a tag that never closes, because `close` is the end of the
    // document and there is nothing after it to begin a line.
    marks.push({ from: f.open, to: f.open + 1, deco: blockAt("[") });
    if (f.close < doc.length) marks.push({ from: f.close, to: f.close + 1, deco: blockAt("]") });
  }
  for (const line of plan) {
    if (line.level > 0 && line.from > 0 && line.from < doc.length) {
      marks.push({
        from: line.from,
        to: line.from + 1,
        deco: padAt(line.level, cfg.amount, doc[line.from]),
      });
    }
  }
  marks.sort((a, c) => a.from - c.from || a.to - c.to);
  for (const m of marks) b.add(m.from, m.to, m.deco);
  return b.finish();
}

/**
 * The indent view: the fields above, plus the one thing the state cannot know.
 *
 * Width needs the **view** and a `StateField` cannot see one, so the measurement
 * goes in as an effect. The settings go in the same way, because a `ViewPlugin`'s
 * constructor is not the only place they can change and a compartment rebuild is
 * too coarse to rely on.
 */
export function indentView(read: () => IndentOptions & { on: boolean }): Extension {
  return [
    indentWidth,
    indentSettings,
    indentDecorations,
    ViewPlugin.fromClass(
      class {
        // # Nothing happens in the constructor. That is the whole fix.
        //
        // The first version dispatched `setIndentSettings.of(read())` here, and
        // `read()` is `main.ts`'s closure over the live `settings` binding. A
        // `ViewPlugin` constructor runs **inside `EditorState.create`**, which runs
        // inside `new EditorView`, which `boot()` calls at module scope — so the
        // closure read a binding that was not initialised yet:
        //
        // > `CodeMirror plugin crashed: ReferenceError: Cannot access 'n' before initialization`
        //
        // And CodeMirror **catches a plugin constructor error and silently disables
        // that plugin**. No throw reaches the page, `update` is never called again,
        // the settings never arrive, `cfgOf` hands `build` the default `on: false`,
        // and the feature renders nothing while every setting in `localStorage` is
        // correct. `ctor: 1, update: 0, destroy: 0` was the whole fingerprint.
        //
        // Two faults were stacked here and either one alone hides the other: the
        // width was measured before layout (`clientWidth` is 0), and the settings
        // were read before the module graph finished. Both are "too early", so both
        // are deferred by one frame, and the constructor is left empty.
        constructor(view: EditorView) {
          requestAnimationFrame(() => {
            view.dispatch({ effects: setIndentSettings.of(read()) });
            this.measure(view);
          });
        }
        measure(view: EditorView) {
          const w = charsWide(view);
          if (w && w !== view.state.field(indentWidth, false)) {
            view.dispatch({ effects: setIndentWidth.of(w) });
          }
        }
        update(u: ViewUpdate) {
          const now = read();
          const cur = u.state.field(indentSettings, false);
          if (!cur || cur.amount !== now.amount || cur.minWords !== now.minWords ||
              cur.percent !== now.percent || cur.on !== now.on) {
            // **Never dispatch from `update`.** CodeMirror is mid-update and says so:
            //
            // > Calls to EditorView.update are not allowed while an update is in progress
            //
            // One frame later is late enough for the writer and early enough that no
            // frame is drawn with the old settings, which is the same trick the
            // constructor uses for the same underlying reason.
            requestAnimationFrame(() => u.view.dispatch({ effects: setIndentSettings.of(now) }));
          }
          // Re-measure whenever the width is still unknown. "No decoration" and
          // "not ready yet" are otherwise indistinguishable, which is how this
          // rendered nothing at all while every setting was correct.
          if (u.geometryChanged || !u.state.field(indentWidth, false)) {
            requestAnimationFrame(() => this.measure(u.view));
          }
        }
      },
      {},
    ),
  ];
}

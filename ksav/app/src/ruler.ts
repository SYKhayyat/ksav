// The overview ruler: everything wrong with the document, on one strip.
//
// Taken from typstify's `editor/ruler.go`, and the reason it is worth taking is
// that Ksav already computes all of this and then throws away the only view that
// makes it useful at length. Compile errors, misspellings, unclosed brackets,
// orphaned deferred notes and the change gutter each know their own line
// numbers; in a three-hundred-page sefer, knowing that there are four problems
// *somewhere* is not knowledge. The strip turns it into "they are all in perek
// gimmel", at a glance and without scrolling.
//
// It is a view over data that already exists. Nothing here computes a mark; the
// producers are unchanged and none of them knows this file exists.

import { EditorView, ViewPlugin } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { forEachDiagnostic, setDiagnosticsEffect } from "@codemirror/lint";
import { errorLines } from "./errorlines";
import { misspellings } from "./spell";
import { changes } from "./changes";
import { changedLines } from "./diff";

/**
 * What a tick can mean, most severe first.
 *
 * The order is the priority: a line with both a compile error and a spelling
 * mistake is drawn as an error, because the error is why the page is blank and
 * the misspelling is not.
 */
export const KINDS = ["error", "warning", "spelling", "change"] as const;
export type MarkKind = (typeof KINDS)[number];

export interface RulerMark {
  line: number;
  kind: MarkKind;
}

/**
 * One mark per line, keeping the most severe.
 *
 * Without this a line with an error, a warning and a misspelling draws three
 * overlapping ticks — which reads as three problems, and makes the strip's
 * density a lie about how much is wrong.
 */
export function mergeMarks(marks: RulerMark[]): RulerMark[] {
  const best = new Map<number, MarkKind>();
  for (const m of marks) {
    const had = best.get(m.line);
    if (had === undefined || KINDS.indexOf(m.kind) < KINDS.indexOf(had)) best.set(m.line, m.kind);
  }
  return [...best.entries()]
    .map(([line, kind]) => ({ line, kind }))
    .sort((a, b) => a.line - b.line);
}

/**
 * Where a mark sits on the strip, as a fraction from the top.
 *
 * Line 1 sits at the very top and the last line at the very bottom, so the strip
 * spans the document rather than stopping one line short of it — which on a
 * short document is a visible and confusing gap. A single-line document puts its
 * mark at the top rather than dividing by zero.
 */
export function markTop(line: number, lineCount: number): number {
  if (lineCount <= 1) return 0;
  const clamped = Math.min(Math.max(line, 1), lineCount);
  return (clamped - 1) / (lineCount - 1);
}

/** Every mark the state currently justifies, merged and in line order. */
export function marksIn(state: EditorState): RulerMark[] {
  const marks: RulerMark[] = [];
  const total = state.doc.lines;
  const lineAt = (pos: number) => state.doc.lineAt(Math.min(Math.max(pos, 0), state.doc.length)).number;

  for (const line of state.field(errorLines, false) ?? []) {
    if (line >= 1 && line <= total) marks.push({ line, kind: "error" });
  }
  for (const m of state.field(misspellings, false) ?? []) {
    marks.push({ line: lineAt(m.start), kind: "spelling" });
  }
  // The bracket and deferred-note linters. Their findings are held by
  // `@codemirror/lint`, which is the only reason this can read both of them
  // without either knowing about the ruler.
  forEachDiagnostic(state, (d, from) => {
    marks.push({ line: lineAt(from), kind: d.severity === "error" ? "error" : "warning" });
  });
  for (const line of changedLines(state.field(changes, false)?.hunks ?? [])) {
    if (line >= 1 && line <= total) marks.push({ line, kind: "change" });
  }
  return mergeMarks(marks);
}

/**
 * The strip, drawn beside the scrollbar.
 *
 * Pinned to the inline-end edge with logical properties rather than to `right`,
 * because the editor's direction is the *document's* — a Hebrew sefer puts its
 * scrollbar on the left, and a ruler nailed to the right would sit at the far
 * side of the text from the bar it is meant to annotate.
 */
export const overviewRuler = ViewPlugin.fromClass(
  class {
    strip: HTMLElement;
    /** What is currently drawn, to skip the DOM work when nothing moved. */
    signature = "";

    constructor(readonly view: EditorView) {
      this.strip = document.createElement("div");
      this.strip.className = "cm-overview-ruler";
      this.strip.setAttribute("aria-hidden", "true");
      this.strip.addEventListener("mousedown", (e) => this.jump(e));
      view.dom.appendChild(this.strip);
      this.draw();
    }

    update(u: ViewUpdate) {
      // Redrawn when what the strip *shows* changes, not on every transaction.
      // `u.state !== u.startState` is true for a bare caret move, which changes
      // nothing on the strip — so the guard was a tautology and `draw()` (which
      // walks every misspelling, diagnostic and hunk to build a signature) ran
      // on every arrow key. The strip is a function of the document plus the
      // three mark fields plus the lint diagnostics; compare those by identity.
      if (
        u.docChanged ||
        u.state.field(misspellings, false) !== u.startState.field(misspellings, false) ||
        u.state.field(errorLines, false) !== u.startState.field(errorLines, false) ||
        u.state.field(changes, false) !== u.startState.field(changes, false) ||
        u.transactions.some((tr) => tr.effects.some((e) => e.is(setDiagnosticsEffect)))
      ) {
        this.draw();
      }
    }

    destroy() {
      this.strip.remove();
    }

    draw() {
      const marks = marksIn(this.view.state);
      const total = this.view.state.doc.lines;
      const signature = total + "|" + marks.map((m) => m.line + m.kind).join(",");
      if (signature === this.signature) return;
      this.signature = signature;
      this.strip.replaceChildren();
      this.strip.style.display = marks.length ? "" : "none";
      for (const m of marks) {
        const tick = document.createElement("div");
        tick.className = `cm-ruler-tick cm-ruler-${m.kind}`;
        tick.style.top = `${markTop(m.line, total) * 100}%`;
        this.strip.appendChild(tick);
      }
    }

    /** A click on the strip goes to the line it points at. */
    jump(e: MouseEvent) {
      const box = this.strip.getBoundingClientRect();
      if (!box.height) return;
      const fraction = (e.clientY - box.top) / box.height;
      const total = this.view.state.doc.lines;
      const line = Math.min(Math.max(Math.round(fraction * (total - 1)) + 1, 1), total);
      const pos = this.view.state.doc.line(line).from;
      this.view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "center" }),
      });
      this.view.focus();
      e.preventDefault();
    }
  },
);

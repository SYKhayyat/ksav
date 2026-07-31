// Putting a diagnostic somewhere the writer can act on it.
//
// The engine now reports a line, a column, the command a message is about and the
// nearest real command when the one written does not exist (see
// `engine/src/diagnostics.rs`). This module is the other half: turning that into
// one line of status bar, one mark in the editor, and one click that goes there.
//
// Two arithmetic facts have to be right and are the whole reason this is a module
// with tests rather than four lines in `main.ts`:
//
//  1. **The engine counts lines in the body it was sent, not in the document the
//     writer sees.** `compile.ts` prepends the custom-command preamble, so every
//     line the engine reports is offset by however many lines that preamble has.
//     The caller knows what it prepended; the engine cannot.
//  2. **Bracket healing does not move lines.** The speculative compile sends the
//     *healed* copy, so a line number could in principle be about text the writer
//     did not type. It cannot be: healing only inserts closers and deletes stray
//     ones, and neither is a newline. There is a test below that holds that,
//     because if it ever stops being true every line number here becomes a lie.

import type { Diagnostic } from "./api";

export interface Shown {
  /** The diagnostic, unchanged. */
  d: Diagnostic;
  /** 1-based line in the *writer's* document, or null when there is none. */
  line: number | null;
  /** 1-based column, or null. */
  column: number | null;
  /** The one line the status bar shows. */
  said: string;
}

/**
 * How many lines a preamble occupies in front of the body.
 *
 * `compile.ts` builds `preamble + "\n\n" + body`, so the body starts on the line
 * after the blank one — that is `lines(preamble) + 2` lines down, and the offset
 * to subtract is one less than the line the body's first line becomes.
 */
export function preambleLines(preamble: string | undefined): number {
  const text = preamble?.trim();
  if (!text) return 0;
  return text.split("\n").length + 1;
}

/** An engine line, in the writer's own document. */
export function lineInDocument(engineLine: number | null | undefined, offset: number): number | null {
  if (engineLine == null) return null;
  const line = engineLine - offset;
  // A line inside the preamble is not a line in the document. Saying nothing is
  // the honest answer; pointing at the writer's line 1 would be a wrong ref.
  return line >= 1 ? line : null;
}

/** How much of a message the status bar will show before it is cut. */
export const MAX_MESSAGE_CHARS = 200;

export function shorten(msg: string, max = MAX_MESSAGE_CHARS): string {
  const oneLine = msg.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

/**
 * One diagnostic, ready to show.
 *
 * The line comes first, because it is the thing the writer acts on, and it is
 * omitted rather than faked when there is none.
 */
export function show(d: Diagnostic, offset: number): Shown {
  const line = lineInDocument(d.line, offset);
  const column = line == null ? null : (d.column ?? null);
  const where = line == null ? "" : `שורה ${line}${column == null ? "" : `:${column}`} · `;
  return { d, line, column, said: where + shorten(d.message) };
}

export function shown(diags: Diagnostic[], offset: number): Shown[] {
  return diags.map((d) => show(d, offset));
}

/**
 * The lines to mark in the editor, deduplicated and in order.
 *
 * Two diagnostics on one line is one mark. Marking twice draws the underline
 * twice and makes a single mistake look like two.
 */
export function markedLines(list: Shown[]): number[] {
  const lines = new Set<number>();
  for (const s of list) if (s.line != null && s.d.severity === "error") lines.add(s.line);
  return [...lines].sort((a, b) => a - b);
}

/** Installed by the shell, so this module need not know about CodeMirror. */
let goToLine: (line: number, column: number | null) => void = () => {};
export function onGoToLine(fn: (line: number, column: number | null) => void) {
  goToLine = fn;
}

/** Installed by the shell: mark these lines as holding an error, and no others. */
let markLines: (lines: number[]) => void = () => {};
export function onMarkLines(fn: (lines: number[]) => void) {
  markLines = fn;
}

/**
 * Draw the diagnostics into the status bar, and mark their lines.
 *
 * Each one is a button rather than text: it names a line, so it should go there.
 * The raw compiler string is on `title` — kept for the bug report, never the
 * message.
 */
export function drawDiagnostics(into: HTMLElement, list: Shown[]) {
  into.replaceChildren();
  markLines(markedLines(list));
  for (const s of list) {
    if (s.line == null) {
      const span = document.createElement("span");
      span.className = "diag";
      span.textContent = s.said;
      if (s.d.raw) span.title = s.d.raw;
      into.append(span);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "diag diag-go";
    button.textContent = s.said;
    if (s.d.raw) button.title = s.d.raw;
    const { line, column } = s;
    button.addEventListener("click", () => goToLine(line, column));
    into.append(button);
  }
}

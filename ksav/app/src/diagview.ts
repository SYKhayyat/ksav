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
  // The preamble offset belongs to the *open* document. A line reported from an
  // included chapter is already that chapter's own line — the engine's line map
  // put it there — and subtracting a preamble the chapter never carried would
  // move it, always in the direction of pointing at the wrong line.
  const fromPart = !!d.file;
  const line = fromPart ? (d.line ?? null) : lineInDocument(d.line, offset);
  const column = line == null ? null : (d.column ?? null);
  const at = line == null ? "" : `שורה ${line}${column == null ? "" : `:${column}`}`;
  // The chapter's name in front of the line number, because in a twelve-chapter
  // sefer "line 12" is not a location.
  const where = !at && !fromPart ? "" : `${d.file ? `${d.file} · ` : ""}${at}${at ? " · " : ""}`;
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
  // Only the open document's own errors. A line number from an included chapter
  // means nothing here, and underlining it would mark an innocent line.
  for (const s of list) {
    if (s.line != null && s.d.severity === "error" && !s.d.file) lines.add(s.line);
  }
  return [...lines].sort((a, b) => a - b);
}

/** Installed by the shell, so this module need not know about CodeMirror. */
let goToLine: (line: number, column: number | null) => void = () => {};
export function onGoToLine(fn: (line: number, column: number | null) => void) {
  goToLine = fn;
}

/**
 * Installed by the shell: go to a line in an *included* document.
 *
 * Separate from `goToLine` because it is a different act — that one moves the
 * cursor, this one opens another document first. Without it, clicking an error
 * from chapter three would move the cursor to line 12 of whatever is open, which
 * is a confidently wrong answer and worse than no link at all.
 */
let goToPart: (file: string, line: number, column: number | null) => void = () => {};
export function onGoToPart(fn: (file: string, line: number, column: number | null) => void) {
  goToPart = fn;
}

/** Installed by the shell: mark these lines as holding an error, and no others. */
let markLines: (lines: number[]) => void = () => {};
export function onMarkLines(fn: (lines: number[]) => void) {
  markLines = fn;
}

/**
 * The diagnostics the writer has waved away — each one, by what it says.
 *
 * A compile fires on a 250 ms debounce after every keystroke, so a message about
 * something the writer is not currently editing — a font with no italic, say —
 * redraws itself over and over and there has to be a way to make it stop.
 *
 * This was one signature over the whole *set*, and it did not work, in two
 * separate ways that the report *"I have to re-dismiss the italics warning on
 * each new compile"* only shows the first of:
 *
 *   - the signature contained each diagnostic's **line number**, so typing
 *     anything above the warning renumbered it and dropped the dismissal — see
 *     `keyOf`;
 *   - and it was one key for the whole list, so fixing an unrelated error
 *     changed the set and brought every waved-away warning back with it.
 *
 * Both are the same mistake: the dismissal was attached to something other than
 * the thing being dismissed. A `Set` of individual keys is what "I have seen
 * this one" actually means, and it keeps the property the old design was after —
 * a genuinely new message has a key nobody has dismissed, so it is never
 * swallowed.
 */
const dismissed = new Set<string>();

/**
 * What identifies **one** diagnostic, for as long as the writer keeps typing.
 *
 * The file and the message, and deliberately **not the line**.
 *
 * # Why the line had to go
 *
 * The report was *"I have to re-dismiss the italics warning on each new
 * compile"*, and the reason is that this key used to be `line:said` over the
 * whole set. A compile fires 250 ms after a keystroke; a keystroke on any line
 * above the `#נטוי` renumbers it; the key changes; the dismissal is gone. So the
 * one act that redraws the banner — typing — was also the act that un-dismissed
 * it, and the feature could only work for a writer who had stopped writing.
 *
 * A warning that a font has no italic face is not *about* a line. It is about
 * the document's typography, and it is the same warning wherever the words move
 * to. Keying on what a diagnostic *says* rather than where it currently sits is
 * what makes "I have seen this" mean anything across an edit.
 *
 * # What that costs, stated rather than discovered
 *
 * Two occurrences of one message at two places share a key, so dismissing
 * either dismisses both. For the warnings this is aimed at — a missing face, a
 * font substitution, a capability the family does not have — that is not a cost
 * but the point: it is one fact about the document, reported once per site.
 *
 * It would be a real cost for errors, where two unclosed brackets are two
 * separate things to go and fix. Which is why errors are not dismissible at
 * all; see `canDismiss`.
 */
function keyOf(s: Shown): string {
  return `${s.d.file ?? ""} ${s.said}`;
}

/**
 * Whether the writer may wave this one away.
 *
 * Warnings, and only warnings. An error means the document did not compile —
 * there is no page, and a banner offering to stop mentioning that would be the
 * product agreeing to lie about whether the writer's sefer exists. The old
 * dismissal made no distinction and could silence a failed compile, which
 * nobody had noticed because it also silenced itself on the next keystroke.
 */
function canDismiss(s: Shown): boolean {
  return s.d.severity !== "error";
}

/**
 * Forget every dismissal — called when the writer opens another document.
 *
 * The keys carry no document in them, and giving them one would be the wrong
 * repair: these messages come from the *engine*, about a compile, and the
 * engine's `file` is a part of the sefer rather than a library id. Clearing on
 * open says the same thing more simply, and says it in the place that knows a
 * document changed.
 *
 * It matters because the warnings this silences are claims about a document's
 * own typography. "This family has no italic face" is true of the sefer being
 * set, not of Ksav, and carrying a dismissal from one document into the next
 * would hide a real fact about the second one on the strength of the writer
 * having accepted it about the first.
 */
export function forgetDismissed(): void {
  dismissed.clear();
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
  // Per diagnostic, not per set. Dismissal used to be one signature over the
  // whole list, so fixing an unrelated error changed the set and brought every
  // waved-away warning back with it — which is the same defect as the line
  // numbers, one level up: the dismissal was attached to something other than
  // the thing dismissed.
  //
  // An error is never suppressed whatever is in the set; see `canDismiss`.
  const shown = list.filter((s) => !(canDismiss(s) && dismissed.has(keyOf(s))));
  // The tints follow what is actually being said. A warning nobody is being
  // shown must not leave its line coloured, or the banner is quiet and the
  // document still looks wrong with no way to ask why.
  markLines(markedLines(shown));
  if (!shown.length) return;
  if (shown.some(canDismiss)) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "diag-dismiss";
    close.textContent = "×";
    close.setAttribute("aria-label", "dismiss");
    close.title = "dismiss";
    close.addEventListener("click", () => {
      // Only what it is entitled to silence. With an error and a warning both
      // up, the × takes the warning and leaves the error standing, rather than
      // clearing the bar and hiding a document that does not compile.
      for (const s of shown) if (canDismiss(s)) dismissed.add(keyOf(s));
      drawDiagnostics(into, list);
    });
    into.append(close);
  }
  for (const s of shown) {
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
    const file = s.d.file;
    button.addEventListener("click", () =>
      file ? goToPart(file, line, column) : goToLine(line, column),
    );
    into.append(button);
  }
}

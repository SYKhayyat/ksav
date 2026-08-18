// The three constructs that mark off a span of source, and the one question a
// writer has to be able to answer about each of them: **does this reach the
// page?**
//
// # The finding
//
// Ksav has had all three for as long as it has had an editor, and no writer
// could tell them apart:
//
//   - `// …`        — a line the page never sees.
//   - `/* … */`     — a passage the page never sees.
//   - `//{ … //}`   — a *fold*: the page sees all of it, and never sees the
//                     marks. It exists so a 300-page sefer can be navigated.
//
// Two of them print nothing and one prints everything, which is the whole of
// the distinction and was nowhere on screen. The line comment had no door at
// all — no button, no menu entry, no palette command, no key. The block comment
// answered to `Ctrl+/` under the name "Comment out". And the fold had the one
// visible door of the three, a toolbar button labelled **Region**, which is a
// word that says nothing about folding, nothing about printing, and — since
// `#אזור` became a real command naming a fixed area on the page — now means
// something else entirely. The margin note on that button read *"I have no clue
// what region does"*, and the same reader asked, a few lines later, for the fold
// to be built. It already existed. Nothing said so.
//
// So: `fold` is a fold, and the two that hide say **hide**.
//
// # Why the fold's marks are three characters and not one
//
// The ask was for something brace-like and short enough to type all day, and
// `//{` was named as not that. It is nevertheless the floor. A fold's marks must
// be invisible to the compiler, Typst's only invisibilities are `//` and
// `/* */`, and the shortest brace-like thing that can follow a two-character
// comment opener is one brace. There is no two-character form, and a bare `{`
// is a Typst code block — it would print, or fail to.
//
// What can be bought instead is the typing: the closer is written by the editor
// (see [`foldCloser`]), so the three characters are typed once and the fold is
// complete. `engine/tests/hiding.rs` holds the other half of the promise — that
// the marks change nothing about the page, not even the paragraph they sit in.

import { delimiters } from "./spans";

/** Typst's line comment. Everything after it on the line is not the document. */
export const LINE = "//";
/** Typst's block comment, which may span lines. */
export const BLOCK_OPEN = "/*";
export const BLOCK_CLOSE = "*/";
/**
 * The fold's marks — line comments, so they are invisible to the compiler, and
 * braces, so they are legible to a person.
 */
export const FOLD_OPEN = "//{";
export const FOLD_CLOSE = "//}";

/** A whole-document replacement, and where the selection lands after it. */
export interface Edit {
  text: string;
  from: number;
  to: number;
  select: [number, number];
}

/** Is this line one of the fold's marks rather than an ordinary comment? */
export function isFoldMark(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith(FOLD_OPEN) || t.startsWith(FOLD_CLOSE);
}

function lineStartOf(doc: string, pos: number): number {
  const nl = doc.lastIndexOf("\n", pos - 1);
  return nl < 0 ? 0 : nl + 1;
}

function lineEndOf(doc: string, pos: number): number {
  const nl = doc.indexOf("\n", pos);
  return nl < 0 ? doc.length : nl;
}

/**
 * Hide — or stop hiding — whole lines with `//`.
 *
 * A toggle, because that is what `Ctrl+/` is everywhere and because the writer
 * who hid a paragraph to see the page without it needs it back. Blank lines are
 * left alone in both directions: a `//` on an empty line is noise, and its
 * absence must not be what stops the block coming back.
 *
 * A fold's own marks are not ordinary comments and are never stripped — hiding
 * a passage that contains a fold and then unhiding it must give back the fold,
 * not a `{` sitting in the prose.
 */
export function hideLines(doc: string, from: number, to: number): Edit {
  const start = lineStartOf(doc, from);
  const end = lineEndOf(doc, to);
  const lines = doc.slice(start, end).split("\n");
  const live = lines.filter((l) => l.trim() !== "");
  // Nothing to hide: put the mark down and let the writer type after it.
  if (!live.length) {
    const text = LINE + " ";
    return { text, from: start, to: end, select: [start + text.length, start + text.length] };
  }
  const hidden = live.every((l) => l.trimStart().startsWith(LINE) && !isFoldMark(l));
  const out = lines.map((l) => {
    if (l.trim() === "") return l;
    if (!hidden) {
      const indent = l.length - l.trimStart().length;
      return l.slice(0, indent) + LINE + " " + l.slice(indent);
    }
    if (isFoldMark(l)) return l;
    const indent = l.length - l.trimStart().length;
    const rest = l.slice(indent + LINE.length);
    return l.slice(0, indent) + (rest.startsWith(" ") ? rest.slice(1) : rest);
  });
  const text = out.join("\n");
  return { text, from: start, to: end, select: [start, start + text.length] };
}

/** The block comment the position sits inside, if it is inside one. */
export function blockAround(doc: string, pos: number): { from: number; to: number } | null {
  for (const c of delimiters(doc).comments) {
    if (!doc.startsWith(BLOCK_OPEN, c.from)) continue;
    if (pos >= c.from && pos <= c.to) return { from: c.from, to: c.to };
  }
  return null;
}

/**
 * Hide a passage with `/* … *\/`, or reveal the one the caret is standing in.
 *
 * The block form and not the line form, because this is the one that survives a
 * passage with blank lines in it and the one that can be opened at the end of a
 * line and closed at the start of the next — which is what `hiddenBreak` is,
 * and why that action calls this one rather than growing a second copy of the
 * padding rules.
 */
export function hideBlock(doc: string, from: number, to: number, label: string): Edit {
  const inside = from === to ? blockAround(doc, from) : null;
  if (inside) {
    const body = doc.slice(inside.from + BLOCK_OPEN.length, inside.to - BLOCK_CLOSE.length);
    const text = body.replace(/^ /, "").replace(/ $/, "");
    return { text, from: inside.from, to: inside.to, select: [inside.from, inside.from + text.length] };
  }
  const body = doc.slice(from, to) || label;
  const text = `${BLOCK_OPEN} ${body} ${BLOCK_CLOSE}`;
  const at = from + BLOCK_OPEN.length + 1;
  return { text, from, to, select: [at, at + body.length] };
}

/**
 * The `//{ … //}` fold a writer collapses a chunk of sefer into.
 *
 * Here, and not in the shell, for a reason that is not tidiness: the `//{`
 * **must** begin its own line or the fold service, which keys on a line
 * starting with `//{`, does not see it — so the fold a writer just made refuses
 * to fold, with nothing on screen to say why. That rule is worth a test, and a
 * test needs it out of `main.ts`.
 */
export function foldAround(doc: string, from: number, to: number, label: string): Edit {
  const selText = doc.slice(from, to);
  const atLineStart = from === 0 || doc[from - 1] === "\n";
  const lead = atLineStart ? "" : "\n";
  const text = `${lead}${FOLD_OPEN} ${label}\n${selText}\n${FOLD_CLOSE}\n`;
  // Start of the label, so it can be renamed immediately: `//{ ` is four
  // characters after whatever newline had to be prepended.
  const at = from + lead.length + FOLD_OPEN.length + 1;
  return { text, from, to, select: [at, at + label.length] };
}

/**
 * What to write when the writer finishes typing `//{` by hand.
 *
 * The whole of the answer to "three characters is too many". The opener is
 * typed; the closer, the blank line between them and the caret's position are
 * the editor's. Returns `null` when the line is not a bare opener — a `//{`
 * with prose already after it is a fold being renamed, not one being made, and
 * a fold that already has a closer below it does not want a second.
 */
export function foldCloser(doc: string, from: number): { insert: string; caret: number } | null {
  // `{` is being typed at `from`, the character that completes `//{`. Work
  // against the real document and account for the one pending brace, rather than
  // concatenating a whole fresh copy of the sefer (`doc.slice(0, from) + "{" +
  // doc.slice(to)`) on every `{` a writer types.
  const start = lineStartOf(doc, from);
  const line = doc.slice(start, from) + "{";
  if (line.trimStart() !== FOLD_OPEN) return null;
  if (from < doc.length && doc[from] !== "\n") return null;
  const indent = line.slice(0, line.length - line.trimStart().length);
  // Only when the document is left with an opener that has no closer — which is
  // the whole question, and the reason it is asked of the *whole* file rather
  // than by looking for the next `//}` below. Inside an outer fold that is
  // already closed, the next `//}` below belongs to the outer one and the fold
  // being opened here still needs one of its own; a forward scan cannot tell
  // those apart and a balance can.
  let open = 1; // the opener being completed by this very keystroke
  for (const l of doc.split("\n")) {
    const t = l.trimStart();
    if (t.startsWith(FOLD_OPEN)) open++;
    else if (t.startsWith(FOLD_CLOSE)) open--;
  }
  if (open <= 0) return null;
  // The caret stays on the opener, after a space, because the name is the whole
  // value of a fold once it is collapsed — an unnamed one shows "…" and tells
  // the writer nothing. The body is one line down and they are already going
  // there; the name is the thing they would otherwise have to come back for.
  const insert = ` \n${indent}\n${indent}${FOLD_CLOSE}`;
  // `from` + the `{` about to be inserted + the leading space of `insert`.
  return { insert, caret: from + 2 };
}

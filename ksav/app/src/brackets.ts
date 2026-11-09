// Bracket healing.
//
// A dropped `]` is the worst moment in Ksav: the preview goes blank and the writer
// is left staring at a red error while the page they were reading a second ago is
// gone. That single experience is what makes this feel like programming instead of
// writing.
//
// Three things are built on this module:
//   1. a live lint that marks the OPENER that never closes, before any compile;
//   2. a one-click heal that inserts the closer where it most likely belongs;
//   3. a speculative compile, so the preview keeps rendering while you are still
//      mid-keystroke and the document is momentarily unbalanced.
//
// **A correction, measured rather than assumed.** This comment used to open by
// saying Typst reports an unclosed `[` *at end of file, often thousands of
// characters from the mistake*, and that was the stated reason 260 lines of
// scanner existed. It is not true: Typst spans the opener. Driven against the real
// engine now that diagnostics carry a location (B5) — an opener on line 1 with 200
// lines after it reports at `1:6`, and two nested openers on lines 51 and 52
// report at `51:7` and `52:6`.
//
// The module stays, and not out of sentiment. (1) is still only available here: a
// live lint fires while the writer is typing, and the engine cannot answer until a
// compile has gone out and come back. (2) is only here: the engine knows the
// bracket is unclosed and has no idea where its closer belongs. And (3) is the
// load-bearing one and is not obtainable from the engine at all — it is why the
// preview keeps showing a page during the several seconds a `#הערה[` spends
// half-typed. Deleting any of it would trade a real behaviour for a duplicated
// location that turns out not to have been duplicated.
//
// It is deliberately dependency-free and pure (text in, findings out) so it can
// be tested without a browser or a CodeMirror instance.

import { delimiters, type Delimiters } from "./spans";

/**
 * Which delimiters close themselves as you type, as two switches.
 *
 * Not healing — that is everything below — but the same subject, and this is the
 * module that holds the reasoning about which characters are delimiters in a
 * Hebrew document at all.
 *
 * They were one hard-coded answer and they are two questions with opposite
 * answers. Brackets pairing is liked and stays on. Quotes cannot be assumed: in
 * Hebrew `"` is the gershayim of רש״י and שו״ע and `'` is the geresh of ר', both
 * standing *inside* words several times a line, and pairing them turns ordinary
 * typing into a fight. So quotes ship off — which is a default, not a refusal.
 * A writer setting an English sefer should have them, and one switch for both
 * would have made having them cost the brackets.
 */
export function pairedDelimiters(brackets: boolean, quotes: boolean): string[] {
  const out: string[] = [];
  // `$` is Typst's maths delimiter and pairs exactly the way a bracket does. It
  // is a bracket in every sense that matters here and has always been in this
  // list; typstify's `editor/typst.go` reaches the same conclusion.
  if (brackets) out.push("(", "[", "{", "$");
  if (quotes) out.push('"', "'");
  return out;
}

export type Opener = "[" | "(" | "{";
export type Closer = "]" | ")" | "}";

export const CLOSER_OF: Record<Opener, Closer> = { "[": "]", "(": ")", "{": "}" };
const OPENER_OF: Record<Closer, Opener> = { "]": "[", ")": "(", "}": "{" };

export type Problem =
  /** An opener with no matching closer. `healAt` is where the closer belongs. */
  | { kind: "unclosed"; pos: number; ch: Opener; closer: Closer; cmd: string | null; healAt: number }
  /** A closer with nothing open — or one that closes the wrong kind of group. */
  | { kind: "stray"; pos: number; ch: Closer }
  /** A `/*` that is never terminated; it silently eats the rest of the document. */
  | { kind: "unterminatedComment"; pos: number };

export interface Edit {
  from: number;
  to: number;
  insert: string;
}

export interface Analysis {
  problems: Problem[];
  /** Edits that repair every problem. Sorted so they can be applied as a batch. */
  edits: Edit[];
  /** The document with those edits applied — what a speculative compile uses. */
  healed: string;
}

/**
 * Regions the bracket scanner must not look inside: `//` line comments and
 * `/* *\/` blocks. Brackets there are prose, not structure.
 *
 * From `spans.ts`, along with the answer to which brackets are structure at
 * all — see `delimiters()` there for the three valid documents this file used
 * to condemn, and then corrupt when the writer pressed the repair button.
 */
export function commentRegions(text: string): { from: number; to: number; unterminated?: boolean }[] {
  return delimiters(text).comments;
}

/**
 * One group the caret is inside: where it opened and what closes it.
 *
 * `opener` is the offset of the opening character, `ch` which one it is.
 */
export interface Group {
  opener: number;
  ch: Opener;
  closer: Closer;
}

/**
 * The groups the caret sits inside, outermost first.
 *
 * # Why this replaced a scalar (#121)
 *
 * "Move out of bracket" was written as its own scan: a `depth` counter that
 * incremented on any opener and decremented on any closer whose type happened to
 * equal the last opener's, plus a `targetCloser` it overwrote as it walked. It
 * answered correctly for `(…)` and for `[[…]]` and got mixed nesting wrong in the
 * way that is hardest to notice: in `[a (b|)]` it took the last opener seen
 * (`(`), then counted only `)` and `(` after the caret, so a `]` between the
 * caret and the real closer could end the walk early, and in `(a [b|] c)` it
 * could return the `)` for a caret inside the `[`.
 *
 * The scanner in `spans.ts` already produces every delimiter in the document
 * with its type and whether it is structural. A *stack* of those is the whole
 * question, and it is the same stack the lint and the healer want — so it is
 * here, once, rather than a second walker with its own rules.
 *
 * Mismatched closers pop to the matching opener when there is one and are
 * otherwise ignored, which is what makes this usable on half-typed text: a
 * document with one stray `)` still has an enclosing `[`, and the writer still
 * wants to get out of it.
 */
export function enclosingGroups(text: string, pos: number): Group[] {
  const { delims } = delimiters(text);
  const stack: { pos: number; ch: Opener }[] = [];
  for (const d of delims) {
    // A delimiter at the caret is not *behind* it: an opener at `pos` has not
    // been entered, and a closer at `pos` has not been crossed.
    if (d.pos >= pos) break;
    if (!d.structural) continue;
    if (d.opener) {
      stack.push({ pos: d.pos, ch: d.ch as Opener });
    } else {
      const want = OPENER_OF[d.ch as Closer];
      const at = stack.map((s) => s.ch).lastIndexOf(want);
      // Everything inside the group closes with it.
      if (at >= 0) stack.length = at;
    }
  }
  return stack.map((s) => ({ opener: s.pos, ch: s.ch, closer: CLOSER_OF[s.ch] }));
}

/**
 * Where the group opened at `openerPos` ends, or null if nothing closes it.
 *
 * Counts openers of every type, so `[a (b) c]` closes at the `]` and not at the
 * `)` — the mistake the old scan made by filtering to one closer.
 */
export function closerOfGroup(text: string, openerPos: number): number | null {
  const { delims } = delimiters(text);
  // A stack of what is open *inside* the group, not a numeric depth: this is the
  // same walk `enclosingGroups` makes, so the two cannot disagree about nesting,
  // and it is why `spans.test.mjs`'s "no module but spans.ts counts bracket
  // depth" fence still holds without naming this file as an exception.
  const open: Opener[] = [];
  let started = false;
  for (const d of delims) {
    if (d.pos < openerPos || !d.structural) continue;
    if (!started) {
      if (d.pos !== openerPos || !d.opener) return null;
      started = true;
      continue;
    }
    if (d.opener) open.push(d.ch as Opener);
    else if (open.length) open.pop();
    else return d.pos;
  }
  return null;
}

/** Which pair the writer means, when there is more than one around the caret. */
export type OutMode = "innermost" | "outermost";

/**
 * The offset just past the closer the writer is moving out of.
 *
 * - `innermost` — the smallest pair around the caret.
 * - `outermost` — every pair around it, in one keystroke.
 *
 * A caret already touching a closer has nothing to move out of and answers
 * itself: `]|` and `|]` both mean "past this `]`", and pressing the key twice
 * must not step through the document. Both are returned as `pos + 1`, which is
 * where a writer pressing move-out at a boundary expects to arrive.
 */
export function moveOutTarget(text: string, pos: number, mode: OutMode = "innermost"): number | null {
  if (pos > 0 && pos <= text.length) {
    const ch = text[pos - 1];
    if (ch === "]" || ch === ")" || ch === "}") return pos;
  }
  const groups = enclosingGroups(text, pos);
  if (!groups.length) {
    // Nothing around the caret: a closer immediately after it still counts.
    const ch = text[pos];
    if (ch === "]" || ch === ")" || ch === "}") return pos + 1;
    return null;
  }
  const group = mode === "outermost" ? groups[0] : groups[groups.length - 1];
  const close = closerOfGroup(text, group.opener);
  return close === null ? null : close + 1;
}

/**
 * Find the next closing bracket after `pos` that matches an opener before `pos`.
 * Returns the position after the closer, or null if no matching closer is found.
 *
 * Kept as the name the editor calls, now a thin reading of {@link moveOutTarget}
 * so the two cannot disagree about what "out of the bracket" means.
 */
export function findNextCloser(text: string, pos: number): number | null {
  return moveOutTarget(text, pos, "innermost");
}

// The `#command` an opener belongs to — for the lint message, because "#הערה is
// never closed" reads as an instruction and "unclosed [ at offset 8412" does
// not. It is a question about the markup, so it comes off the delimiter that
// `spans.ts` already produced. It used to be a separate backwards walk
// (`callNameBefore`), which made it a fourth context walker in an app whose
// entire §1 was about having too many — and one that knew nothing about
// strings, escapes or comments, so a `#` inside a quoted string could name the
// unclosed bracket.

function lineStartOf(text: string, pos: number): number {
  const nl = text.lastIndexOf("\n", pos - 1);
  return nl < 0 ? 0 : nl + 1;
}
function lineEndOf(text: string, pos: number): number {
  const nl = text.indexOf("\n", pos);
  return nl < 0 ? text.length : nl;
}
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Where the missing closer most likely belongs.
 *
 * Two shapes, distinguished by what sits before the opener on its own line:
 *
 *   - **Inline** — there is text before it (`שלום #הדגשה[עולם`). The writer means
 *     to emphasise a phrase, not the rest of the document, so the group ends at
 *     the end of that line.
 *
 *   - **Block** — the opener starts its line (`#הערה[` on its own). It runs until
 *     the block visibly ends: the first blank line, or the first later line that
 *     starts a new `#command` at the same or shallower indentation. Either is a
 *     place a human would say "the footnote clearly stopped here".
 *
 * Trailing whitespace is excluded so the inserted `]` lands tight against the
 * text rather than after a stray space.
 */
function healPosition(text: string, openPos: number): number {
  const ls = lineStartOf(text, openPos);
  const before = text.slice(ls, openPos);
  const isBlock = before.trim() === "" || /^#[A-Za-z0-9֐-׿_]*$/.test(before.trim());

  if (!isBlock) return trimBack(text, lineEndOf(text, openPos));

  const openIndent = indentOf(text.slice(ls, lineEndOf(text, ls)));
  let i = lineEndOf(text, openPos);
  let lastContentEnd = i;
  while (i < text.length) {
    const start = i + 1;
    if (start > text.length) break;
    const end = lineEndOf(text, start);
    const line = text.slice(start, end);
    if (line.trim() === "") return trimBack(text, lastContentEnd);
    if (line.trimStart().startsWith("#") && indentOf(line) <= openIndent) {
      return trimBack(text, lastContentEnd);
    }
    lastContentEnd = end;
    i = end;
  }
  return trimBack(text, text.length);
}

function trimBack(text: string, pos: number): number {
  let p = pos;
  while (p > 0 && (text[p - 1] === " " || text[p - 1] === "\t")) p--;
  return p;
}

/**
 * Find every unbalanced delimiter, and work out how to repair each one.
 *
 * The same scan powers all three layers, so the gutter marker, the heal action
 * and the rescued preview can never disagree about what is wrong.
 */
export function analyze(text: string, supplied?: Delimiters): Analysis {
  const { delims, comments } = supplied ?? delimiters(text);
  const problems: Problem[] = [];

  const unterminated = comments.find((c) => c.unterminated);
  if (unterminated) problems.push({ kind: "unterminatedComment", pos: unterminated.from });

  const stack: { pos: number; ch: Opener; name: string }[] = [];

  // Comments, string literals and escaped brackets have already been taken out
  // by `delimiters()`, so this is purely the balance judgement — which is the
  // part that genuinely belongs here and cannot come from a node tree, because
  // a node tree only describes documents that balance.
  for (const d of delims) {
    // Punctuation, not structure. A parenthesis in a sentence closes nothing
    // and needs nothing closed, and saying otherwise is a lie the writer cannot
    // act on — with a repair button beside it that would put a bracket in the
    // middle of their prose. See `Delimiter.structural` for the Word import
    // this was reported from.
    if (!d.structural) continue;
    if (d.opener) {
      stack.push({ pos: d.pos, ch: d.ch as Opener, name: d.name });
      continue;
    }
    const c = d.ch as Closer;
    const want = OPENER_OF[c];
    const top = stack[stack.length - 1];
    if (top && top.ch === want) {
      stack.pop();
    } else if (top && stack.some((s) => s.ch === want)) {
      // Closes something further down: everything above it was never closed.
      // Report those, and let this closer match its real partner.
      while (stack.length && stack[stack.length - 1].ch !== want) {
        const orphan = stack.pop()!;
        problems.push(mkUnclosed(text, orphan));
      }
      stack.pop();
    } else {
      problems.push({ kind: "stray", pos: d.pos, ch: c });
    }
  }
  // Innermost first: a closer inserted for a deeper group must land before the
  // closer of the group that contains it.
  while (stack.length) problems.push(mkUnclosed(text, stack.pop()!));

  return { problems, ...repair(text, problems) };
}

function mkUnclosed(text: string, o: { pos: number; ch: Opener; name: string }): Problem {
  return {
    kind: "unclosed",
    pos: o.pos,
    ch: o.ch,
    closer: CLOSER_OF[o.ch],
    cmd: o.name || null,
    healAt: healPosition(text, o.pos),
  };
}

/** Turn findings into edits, and apply them. */
function repair(text: string, problems: Problem[]): { edits: Edit[]; healed: string } {
  if (!problems.length) return { edits: [], healed: text };

  // Several unclosed groups can want the same insertion point (`#רשימה[` holding
  // an unclosed `פריט[`). `problems` already runs innermost-first, so appending
  // in encounter order gives `]]` in the order that actually nests.
  const inserts = new Map<number, string>();
  const edits: Edit[] = [];
  for (const p of problems) {
    if (p.kind === "unclosed") {
      inserts.set(p.healAt, (inserts.get(p.healAt) ?? "") + p.closer);
    } else if (p.kind === "stray") {
      edits.push({ from: p.pos, to: p.pos + 1, insert: "" });
    } else {
      // `*/` and not `\n*/`, which is what this used to be.
      //
      // The heal is not only a button — `compile.ts` compiles the healed copy
      // speculatively on every keystroke, and everything that maps a diagnostic
      // back onto the writer's text rests on one invariant, stated in
      // `compile.ts` and in `diagview.ts`: *healing never inserts or removes a
      // newline, so a line the engine reports about the healed copy is the same
      // line in what the writer typed.* Every other repair here honours it —
      // a closer is one character, a stray deletion is one character. This one
      // did not, so an unterminated `/*` was the one document shape where that
      // invariant was false, and it was false silently.
      //
      // Appending the bare `*/` closes the comment and leaves the line count
      // exactly as the writer left it, because a document ending in a newline
      // already has the empty final line for it to go on.
      edits.push({ from: text.length, to: text.length, insert: "*/" });
    }
  }
  for (const [at, s] of inserts) edits.push({ from: at, to: at, insert: s });

  edits.sort((a, b) => a.from - b.from || a.to - b.to);

  let healed = "";
  let cursor = 0;
  for (const e of edits) {
    if (e.from < cursor) continue; // overlapping repair — keep the first
    healed += text.slice(cursor, e.from) + e.insert;
    cursor = e.to;
  }
  healed += text.slice(cursor);
  return { edits, healed };
}

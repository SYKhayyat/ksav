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
 * Note this deliberately does NOT skip string literals. Hebrew abbreviations are
 * written with gershayim — רש"י, שו"ע, ע"ב — so treating `"` as a string
 * delimiter swallows everything between two unrelated abbreviations. The same
 * trade-off (and the bug it once caused) is documented on `matchGroup` in
 * ksav-lang.ts; the two scanners must agree or the lint would contradict the
 * renderer.
 */
function commentRegions(text: string): { from: number; to: number; unterminated?: boolean }[] {
  const out: { from: number; to: number; unterminated?: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "/") continue;
    // `://` is a URL, not a comment — matches scanComments in ksav-lang.ts.
    if (text[i + 1] === "/" && text[i - 1] !== ":") {
      const nl = text.indexOf("\n", i);
      const to = nl < 0 ? text.length : nl;
      out.push({ from: i, to });
      i = to;
    } else if (text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) {
        out.push({ from: i, to: text.length, unterminated: true });
        break;
      }
      out.push({ from: i, to: end + 2 });
      i = end + 1;
    }
  }
  return out;
}

const NAME_CH = /[A-Za-z0-9֐-׿_]/;

/**
 * The `#command` an opener belongs to, for the lint message — "#הערה is never
 * closed" reads as an instruction; "unclosed [ at offset 8412" does not.
 *
 * Skips back over a complete `(...)` argument group first, so the body bracket of
 * `#כותרת(רמה: 2)[…]` still knows it belongs to #כותרת.
 */
function cmdNameBefore(text: string, pos: number): string | null {
  let i = pos - 1;
  if (text[i] === ")") {
    let depth = 1;
    i--;
    while (i >= 0 && depth > 0) {
      if (text[i] === ")") depth++;
      else if (text[i] === "(") depth--;
      i--;
    }
    if (depth !== 0) return null;
  }
  const end = i + 1;
  while (i >= 0 && NAME_CH.test(text[i])) i--;
  if (i < 0 || text[i] !== "#" || i + 1 === end) return null;
  return text.slice(i + 1, end);
}

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
export function analyze(text: string): Analysis {
  const comments = commentRegions(text);
  const problems: Problem[] = [];

  const unterminated = comments.find((c) => c.unterminated);
  if (unterminated) problems.push({ kind: "unterminatedComment", pos: unterminated.from });

  // Ordered, non-overlapping — so one moving cursor is enough to skip them.
  let ci = 0;
  const stack: { pos: number; ch: Opener }[] = [];

  for (let i = 0; i < text.length; i++) {
    while (ci < comments.length && comments[ci].to <= i) ci++;
    if (ci < comments.length && i >= comments[ci].from) {
      i = comments[ci].to - 1;
      continue;
    }
    const c = text[i];
    if (c === "[" || c === "(" || c === "{") {
      stack.push({ pos: i, ch: c });
    } else if (c === "]" || c === ")" || c === "}") {
      const want = OPENER_OF[c as Closer];
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
        problems.push({ kind: "stray", pos: i, ch: c as Closer });
      }
    }
  }
  // Innermost first: a closer inserted for a deeper group must land before the
  // closer of the group that contains it.
  while (stack.length) problems.push(mkUnclosed(text, stack.pop()!));

  return { problems, ...repair(text, problems) };
}

function mkUnclosed(text: string, o: { pos: number; ch: Opener }): Problem {
  return {
    kind: "unclosed",
    pos: o.pos,
    ch: o.ch,
    closer: CLOSER_OF[o.ch],
    cmd: cmdNameBefore(text, o.pos),
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
      edits.push({ from: text.length, to: text.length, insert: "\n*/" });
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

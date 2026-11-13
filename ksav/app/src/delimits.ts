// ------------------------------------------------------- the delimiter list
//
// The brackets of a document, in document order, for the one reader that wants
// them as objects: the bracket lint, compile's speculative heal, and the export
// warning count.
//
// # Why this is its own file
//
// #182 was the finding. `lexCore` allocated a `Delimiter` per bracket — 30,780
// of them at 1,000 pages, 6.2% of the scan plus a visible share of its garbage —
// into `Scan.delims`, which is read on the pause paths and never during a
// keystroke. Nobody was wrong about wanting the list; the mistake was building
// it three hundred milliseconds before the reader asked.
//
// So the lexer records numbers (the openers come free with `frames`, the closers
// are one packed integer each) and this file turns them back into the objects,
// once, when somebody asks.
//
// It is a separate module because it is a *derived* structure, not part of the
// lex: `spans.ts` was over the repository's 2,000-line ledger line, and this is
// the part of it that could be lifted without moving a rule. The only edge back
// to `spans.ts` is a type import, which is erased.

import type { Delimiter, Frame, Scan } from "./spans";

/** The character a bracket position holds, by its code point. */
const DELIM_CH: Record<number, Delimiter["ch"]> = {
  0x5b: "[", 0x28: "(", 0x7b: "{",
  0x5d: "]", 0x29: ")", 0x7d: "}",
};

/** What the lexer kept, of the two lists a delimiter list is a merge of. */
export interface RecordedBrackets {
  frames: Frame[];
  /** Closer positions and structural bits, packed as `position * 2 + bit`. */
  closers: number[];
}

/**
 * The delimiter objects, from the numbers the lex actually recorded.
 *
 * Both inputs are in document order, so this is a two-cursor merge and not a
 * sort. Nothing here decides anything: `structural` and the head name were
 * decided by the lexer in the pass that saw the bracket, and this only writes
 * them down.
 *
 * Reconstructed rather than remembered, so there is still exactly one place in
 * the app that decides what a bracket is.
 */
export function delimsOf(lex: RecordedBrackets, text: string): Delimiter[] {
  const out: Delimiter[] = [];
  const openers = lex.frames;
  const closers = lex.closers;
  let o = 0;
  let c = 0;
  while (o < openers.length || c < closers.length) {
    const frame = openers[o];
    const packed = closers[c];
    const close = packed === undefined ? -1 : packed >> 1;
    if (frame !== undefined && (close < 0 || frame.open < close)) {
      const ch = text.charCodeAt(frame.open);
      // `frames` is every mode-bearing region, and `#let`/`#set`/`#show` push one
      // at the `#` itself — a frame with no bracket in it. Those are not
      // delimiters. An early version of this emitted `ch: undefined` for them,
      // the bracket lint reported a valid document as broken, and the one-click
      // heal wrote the word `undefined` into it; `spans.test.mjs` caught it.
      // Reading the character back out of the text is what makes that visible
      // here rather than three files away.
      if (DELIM_CH[ch] === undefined) {
        o++;
        continue;
      }
      out.push({
        pos: frame.open,
        ch: DELIM_CH[ch],
        opener: true,
        name: frame.name,
        // `[` is structure wherever it appears; the other two only in code.
        structural: ch === 0x5b || frame.ctx === "code",
      });
      o++;
    } else {
      out.push({
        pos: close,
        ch: DELIM_CH[text.charCodeAt(close)],
        opener: false,
        name: "",
        structural: (packed & 1) === 1,
      });
      c++;
    }
  }
  return out;
}

/**
 * One rebuilt list per lex, shared by `Scan.delims` and `delimiters()`.
 *
 * Keyed on the lex object rather than on the text, because the lex *is* what the
 * list is derived from — and a text can be in the lex cache twice (strict and
 * recovery), whose two lists are not the same list.
 */
const DELIMS_OF = new WeakMap<object, Delimiter[]>();

export function delimsOfLex(lex: RecordedBrackets, text: string): Delimiter[] {
  let built = DELIMS_OF.get(lex);
  if (built === undefined) {
    built = delimsOf(lex, text);
    DELIMS_OF.set(lex, built);
  }
  return built;
}

/**
 * Make `scan.delims` answer on first read instead of before it.
 *
 * The accessor replaces itself with a plain value the first time it is read, so
 * the second reader — usually the lint and then the compile — pays nothing, and
 * no consumer can tell the difference. A scan that arrived over the wire already
 * has its list, and never comes through here.
 */
export function demandDelims(scan: Scan, lex: RecordedBrackets, text: string): void {
  Object.defineProperty(scan, "delims", {
    configurable: true,
    enumerable: true,
    get(this: Scan) {
      const built = delimsOfLex(lex, text);
      Object.defineProperty(this, "delims", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: built,
      });
      return built;
    },
  });
}

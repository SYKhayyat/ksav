// Citation autocomplete: the sefer names, offered where a sefer name goes.
//
// The catalogue itself lives in the engine (`engine/src/sefarim.rs`) and reaches
// here over `/sefarim`, so the list the editor offers and the list the source
// index sorts by are the same list. Two copies of it would drift in the way that
// matters least visibly and costs most: the editor would happily accept a
// spelling the index then files under a different heading, and nobody would
// notice until the index was printed.
//
// This module is deliberately pure apart from `load` — the argument-detection
// and the matching are functions of a string and a position, which is what makes
// them testable without an editor.

import type { Backend, SeferDef } from "./api";

/**
 * The commands whose first argument is a sefer name.
 *
 * Both spellings, because the prelude gives every command an English alias and a
 * writer who used the alias is no less entitled to the completion.
 */
const CITE_COMMANDS = ["ציון_מקור", "sourceref", "גמרא", "gemara"];

let catalogue: SeferDef[] = [];
let asked = false;

/** Every sefer the engine knows. Empty until `load` has been away and back. */
export function all(): SeferDef[] {
  return catalogue;
}

/**
 * Fetch the catalogue once.
 *
 * Failure is silent *here* and only here: a catalogue that did not arrive costs
 * the writer an autocomplete they may not have been about to use, and there is
 * nothing they could do about it. Every other consequence of the engine being
 * unreachable is already reported by the thing that needed it.
 */
export async function load(backend: Backend | null | undefined): Promise<void> {
  if (asked || !backend) return;
  asked = true;
  try {
    catalogue = await backend.sefarim();
  } catch {
    catalogue = [];
    // Ask again next time rather than remembering a failure forever: the very
    // common case is a desktop build racing its own engine at start-up.
    asked = false;
  }
}

/** Reset, for tests. */
export function _reset(list: SeferDef[] = []): void {
  catalogue = list;
  asked = list.length > 0;
}

export interface SeferArg {
  /** Document offset where the name being typed starts. */
  from: number;
  /** Document offset where it ends — the cursor. */
  to: number;
  /** What has been typed so far. */
  query: string;
}

/**
 * Is the cursor inside the *sefer-name* argument of a citation command?
 *
 * Scans back from the cursor for an unclosed `"` and then checks that what
 * precedes it is one of the citation commands with an open paren. Deliberately
 * not a parser: the editor's own scanner is a regex scanner too, and a document
 * that is mid-keystroke is usually not parseable anyway — which is exactly when
 * a completion is wanted.
 *
 * Returns `null` for a closed string, for a newline in between (a string
 * argument does not span lines here), and for the *second* argument, which is a
 * daf and not a sefer.
 */
export function seferArgAt(text: string, pos: number): SeferArg | null {
  // Walk back to the opening quote of the string the cursor is in.
  let i = pos - 1;
  let quote = -1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "\n") return null;
    if (ch === '"') {
      // An escaped quote is part of the name (ב\"ב), not the end of it.
      if (i > 0 && text[i - 1] === "\\") {
        i -= 2;
        continue;
      }
      quote = i;
      break;
    }
    i -= 1;
  }
  if (quote < 0) return null;
  // Everything between the command and the quote must be an open paren and
  // nothing else. A comma there means this is a later argument — the daf — and
  // a sefer list would be actively unhelpful.
  const before = text.slice(0, quote);
  const open = before.match(/#([A-Za-z֐-׿_]+)\(\s*$/u);
  if (!open) return null;
  if (!CITE_COMMANDS.includes(open[1])) return null;
  return { from: quote + 1, to: pos, query: text.slice(quote + 1, pos) };
}

/**
 * Fold a name to what two spellings of it share.
 *
 * The same three rules as the engine's `fold` — points away, every gershayim
 * spelling to one, runs of space collapsed — because a writer typing ב"ב should
 * be offered בבא בתרא whichever quote character their keyboard produced.
 */
export function fold(name: string): string {
  return name
    .replace(/[֑-ֽֿ-ׇ]/gu, "")
    .replace(/[־-]/gu, " ")
    .replace(/[״“”]/gu, '"')
    .replace(/[׳’]/gu, "'")
    .replace(/''/gu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * The sefarim a partly-typed name could be, best first.
 *
 * Ranked by *where* the match landed, because a writer three letters into a name
 * means the name that starts with those letters far more often than one that
 * merely contains them: exact spelling, then a canonical name starting with it,
 * then an alias starting with it, then anything containing it.
 */
export function suggest(query: string, limit = 12): SeferDef[] {
  const q = fold(query);
  if (!q) return catalogue.slice(0, limit);
  const scored: { s: SeferDef; rank: number }[] = [];
  for (const s of catalogue) {
    const canon = fold(s.canonical);
    const aliases = s.aliases.map(fold);
    let rank = -1;
    if (canon === q || aliases.includes(q)) rank = 0;
    else if (canon.startsWith(q)) rank = 1;
    else if (aliases.some((a) => a.startsWith(q))) rank = 2;
    else if (canon.includes(q)) rank = 3;
    if (rank >= 0) scored.push({ s, rank });
  }
  // Ties break on the traditional order, so the eleven masechtos beginning with
  // מ come out in seder order rather than in whatever order the array held.
  scored.sort((a, b) => a.rank - b.rank || a.s.order - b.s.order);
  return scored.slice(0, limit).map((x) => x.s);
}

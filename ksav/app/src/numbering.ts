// The number a new siman or seif gets, taken from the document rather than from
// the snippet.
//
// **Found by writing a kuntres.** `commands.rs` spells the siman snippet
// `#סימן[א׳][|]` and the seif snippet `#סעיף[א][|]` — the number is a literal
// in the registry and the caret (`|`) is placed *past* it, in the title. So a
// writer building a sefer the way the toolbar invites them to gets סימן א׳,
// סימן א׳, סימן א׳, and never sees the field that is wrong, because the caret
// never visits it. The outline pane shows it plainly and nothing says a word.
//
// It is not a placeholder. `#רשימה(פריט[|],)` inserts an *empty* item, which is
// a placeholder; `א׳` is a value, and it is the only value the toolbar can
// produce. A siman is the one structure in this product whose number is written
// into the source by hand, so the insertion has to know what came before it.
//
// The engine cannot: `insert` is a static string in a registry that has never
// seen the document. `insertSnippet` has both, and is **the** insertion path —
// toolbar, Insert menu, palette, hydra, macro and key binding all end there —
// so this is one rule in one place, in the same shape as `noteFor`, `legalAt`
// and `insertionAt` beside it.

import { scan } from "./spans";

/**
 * Letter values, largest first, which is the order a numeral is built in.
 *
 * The same table the prelude's `_ix_gematria` reads with — that one is a
 * *reader* (numeral → number, for sorting the source index) and there was no
 * writer anywhere in the repository, because until now nothing had to produce
 * a Hebrew numeral outside Typst.
 */
const VALUES: readonly (readonly [string, number])[] = [
  ["ת", 400], ["ש", 300], ["ר", 200], ["ק", 100],
  ["צ", 90], ["פ", 80], ["ע", 70], ["ס", 60], ["נ", 50],
  ["מ", 40], ["ל", 30], ["כ", 20], ["י", 10],
  ["ט", 9], ["ח", 8], ["ז", 7], ["ו", 6], ["ה", 5],
  ["ד", 4], ["ג", 3], ["ב", 2], ["א", 1],
];

/** Final forms, worth what their base letter is worth. */
const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

const VALUE_OF = new Map<string, number>(VALUES.map(([l, n]) => [l, n]));

/** Punctuation a numeral is written with: geresh, gershayim, and their ASCII twins. */
const MARKS = /[׳״'"־\-\s.]/gu;

/**
 * A Hebrew numeral as a number. `0` for anything that is not one.
 *
 * **Summing is not reading.** The prelude's `_ix_gematria` sums, and is right
 * to: it is scoring a sefer's name for a sort order, where every string has a
 * score. Here the question is different — *is this a numeral at all* — and a
 * sum answers yes to every Hebrew word there is. `#סימן[פתיחה]` sums to 504 and
 * would have been "continued" to `#סימן[תקד]`, renumbering somebody's
 * introduction into a scheme they never chose. (Written as a sum first, and
 * that is exactly what the test caught.)
 *
 * So a string is a numeral only if it is *the* numeral for its own value —
 * letters in descending order, `טו`/`טז` spelled the one way they are spelled.
 * `hebrewNumeral` is the definition and this checks against it, which means the
 * two cannot disagree about what a numeral looks like.
 *
 * Codepoints, not clusters, and marks stripped first — the same two lessons
 * `_ix_fold` records in the prelude, for the same reason: a pointed letter is
 * one cluster carrying its nikud, and scoring clusters scores it zero.
 */
export function gematria(numeral: string): number {
  let total = 0;
  let letters = "";
  for (const c of numeral.replace(MARKS, "")) {
    const letter = FINALS[c] ?? c;
    const value = VALUE_OF.get(letter);
    // One character that is not a letter and this is not a numeral — `#סימן[1]`
    // is a scheme, and guessing a successor for it would be inventing one.
    if (value === undefined) return 0;
    letters += letter;
    total += value;
  }
  return letters && hebrewNumeral(total) === letters ? total : 0;
}

/**
 * A number as a Hebrew numeral.
 *
 * `15` and `16` are `טו` and `טז`, never `יה` and `יו`: those spell the Name,
 * and a sefer that printed סימן י״ה would be wrong in a way no reader would
 * forgive. It is the one exception in the whole scheme and it is why this is a
 * function rather than a `join`.
 */
export function hebrewNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1) return "";
  let left = n;
  let out = "";
  for (const [letter, value] of VALUES) {
    // 15 and 16 are written from 9 + 6 and 9 + 7 rather than from 10.
    if (left === 15) return out + "טו";
    if (left === 16) return out + "טז";
    while (left >= value) {
      out += letter;
      left -= value;
    }
  }
  return out;
}

/**
 * A running series: the command that carries it, and what resets it.
 *
 * `סעיף` restarts inside each siman, which is how a sefer is numbered and is
 * the only reason `resetBy` exists. Both spellings of each, because a document
 * written in English says `#siman` and must keep saying it.
 */
interface Series {
  /** Every spelling of the command whose first argument is the number. */
  names: readonly string[];
  /** Counting starts again after any of these. Empty means the whole document. */
  resetBy: readonly string[];
  /** What the shipped snippet writes, which is also what a fresh series gets. */
  first: string;
}

const SERIES: readonly Series[] = [
  { names: ["סימן", "siman"], resetBy: [], first: "א׳" },
  { names: ["סעיף", "seif"], resetBy: ["סימן", "siman"], first: "א" },
];

/** The series a snippet belongs to, if any. */
function seriesFor(snippet: string): { series: Series; name: string } | null {
  const m = /^#([A-Za-z0-9֐-׿_]+)\[/u.exec(snippet.trim());
  if (!m) return null;
  const series = SERIES.find((s) => s.names.includes(m[1]));
  return series ? { series, name: m[1] } : null;
}

/**
 * How the previous numeral in a series was punctuated, so the next one matches.
 *
 * A kuntres writes `א׳` and a שולחן ערוך style writes `א` — the document has
 * already decided, and following it is the difference between continuing a
 * series and starting a competing one.
 */
function suffixOf(numeral: string): string {
  const m = /[׳״'"]+$/u.exec(numeral.trim());
  return m ? m[0] : "";
}

/**
 * The snippet, with its number continued from the document.
 *
 * Returns the snippet unchanged when there is nothing to continue from — a
 * first siman, a series the writer numbers some other way (`#סימן[1]`,
 * `#סימן[פתיחה]`), or a command that carries no series at all. Declining is
 * the right answer to all three: the alternative is renumbering somebody's
 * sefer into a scheme they did not choose.
 */
export function continueSeries(doc: string, at: number, snippet: string): string {
  const found = seriesFor(snippet);
  if (!found) return snippet;
  const { series } = found;

  const nodes = scan(doc).nodes.filter((n) => n.from < at);
  // Where the count starts: after the last thing that resets it.
  let from = 0;
  if (series.resetBy.length) {
    for (const n of nodes) if (series.resetBy.includes(n.name) && n.from >= from) from = n.from;
  }
  const previous = nodes
    .filter((n) => series.names.includes(n.name) && n.from >= from && n.bodies.length > 0)
    .pop();
  if (!previous) return snippet;

  const written = doc.slice(previous.bodies[0].from, previous.bodies[0].to);
  const value = gematria(written);
  if (value === 0) return snippet;
  const next = hebrewNumeral(value + 1) + suffixOf(written);
  // Only the first group. The title is the writer's and the caret is in it.
  return snippet.replace(/\[[^\]]*\]/u, `[${next}]`);
}

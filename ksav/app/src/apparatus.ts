// Notes that were collected and never rendered.
//
// Two of Ksav's note commands store their text instead of printing it, and wait
// for a matching dump call to render the collected block:
//
//   #הערתסיום[…]  →  #הערות_בסוף()      (or #הערות_בסוף_צד listing its stream)
//   #מדור_א[…]     →  #הערות_מדורגות()
//
// With no dump call the marker prints and the prose does not. Not an error, not
// a warning — the document compiles, the page looks finished, and a sentence is
// gone. It is the quietest failure in the product.
//
// The Notes chooser has always written the dump call, which is why this never
// showed up there. But the Insert menu, the command palette and `#` autocomplete
// all offer the same commands raw, and none of them wrote anything. A writer who
// found `#הערתסיום` in the Insert menu — where it is listed, described, and
// perfectly reachable — lost every note they wrote with it.
//
// A test caught it (`engine/tests/registry.rs`, "a command given text shows that
// text"). This is the fix: see it in the source, say so on the line, and offer
// the missing call.
//
// The five other collect-then-render commands (`מדף_*`, `הערה_זרם`,
// `הערת_תוכן`, `הערת_מקור`, `הערת_גיליון`, `הערת_ימין`/`שמאל`) were checked by
// rendering and need nothing: the engine reserves their region and wraps them
// automatically. Guessing that they behaved alike would have produced four
// false warnings.

/** A collecting command, and the call that renders what it collected. */
interface Rule {
  /** Command names, both languages. */
  collectors: string[];
  /** The dump call's names, both languages. */
  dumps: string[];
  /** What to write when the writer accepts the fix. */
  fix: string;
  /** Does this collector's stream matter when matching a dump? */
  streamed: boolean;
}

const RULES: Rule[] = [
  {
    collectors: ["הערתסיום", "endnote"],
    dumps: ["הערות_בסוף", "endnotes", "הערות_בסוף_צד", "endnotes_side"],
    fix: "#הערות_בסוף()",
    streamed: true,
  },
  {
    collectors: [
      "מדור_א", "מדור_ב", "מדור_ג", "מדור_ד", "מדור_ה", "מדור_ו", "מדור_ז",
      "מדור_בדרגה",
      "band1", "band2", "band3", "band4", "band5", "band6", "band7", "band",
    ],
    dumps: ["הערות_מדורגות", "banded_notes"],
    fix: "#הערות_מדורגות()",
    streamed: false,
  },
];

export interface Unrendered {
  /** Where the collecting command sits. */
  from: number;
  to: number;
  /** The command as written. */
  command: string;
  /** The call that would render it. */
  fix: string;
  /** The stream it collects into, when it has one. */
  stream?: string;
}

const NAME_CH = /[A-Za-z0-9֐-׿_]/;

/** Every `#name` occurrence of any of these names, at a real command position. */
function occurrences(doc: string, names: string[]): { at: number; end: number; name: string }[] {
  const out: { at: number; end: number; name: string }[] = [];
  for (const name of names) {
    for (let at = doc.indexOf("#" + name); at >= 0; at = doc.indexOf("#" + name, at + 1)) {
      const end = at + 1 + name.length;
      // Not a longer command that merely starts with this name.
      if (NAME_CH.test(doc[end] ?? "")) continue;
      if (inCommentOrString(doc, at)) continue;
      out.push({ at, end, name });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** A crude but adequate check: a `#` inside a comment is not a command. */
function inCommentOrString(doc: string, at: number): boolean {
  const lineStart = doc.lastIndexOf("\n", at - 1) + 1;
  const line = doc.slice(lineStart, at);
  if (line.includes("//")) return true;
  // Inside a `/* … */` block.
  const open = doc.lastIndexOf("/*", at);
  if (open >= 0) {
    const close = doc.indexOf("*/", open + 2);
    if (close < 0 || close > at) return true;
  }
  return false;
}

/** The stream named in a call's arguments, if it names one. */
function streamOf(doc: string, end: number): string | undefined {
  // `#הערתסיום(זרם: "מקורות")[…]` — only a parenthesised argument list can carry it.
  if (doc[end] !== "(") return undefined;
  const close = doc.indexOf(")", end);
  if (close < 0) return undefined;
  const m = /(?:זרם|stream)\s*:\s*"([^"]*)"/u.exec(doc.slice(end + 1, close));
  return m ? m[1] : undefined;
}

/** Does this dump call render the given stream? */
function dumpCovers(doc: string, end: number, stream: string): boolean {
  if (doc[end] !== "(") return true; // `#הערות_בסוף` bare: the default stream
  const close = matchParen(doc, end);
  if (close < 0) return true;
  const args = doc.slice(end + 1, close);
  const named = /(?:זרם|stream)\s*:\s*"([^"]*)"/u.exec(args);
  if (named) return named[1] === stream;
  // `#הערות_בסוף_צד(זרמים: ("תוכן", "מקורות"))` — a list of streams.
  const list = /(?:זרמים|streams)\s*:\s*\(([^)]*)\)/u.exec(args);
  if (list) return list[1].includes(`"${stream}"`);
  return stream === DEFAULT_STREAM;
}

const DEFAULT_STREAM = "הערות";

function matchParen(doc: string, open: number): number {
  let depth = 0;
  let inString = false;
  for (let i = open; i < doc.length; i++) {
    const c = doc[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Every note in the document that is collected and never rendered.
 *
 * A dump call renders what was collected *before* it, so a marker is satisfied
 * by any matching dump that comes after it — which is also what makes the
 * per-section arrangement work.
 */
export function unrendered(doc: string): Unrendered[] {
  const out: Unrendered[] = [];
  for (const rule of RULES) {
    const dumps = occurrences(doc, rule.dumps);
    if (dumps.length === 0) {
      for (const c of occurrences(doc, rule.collectors)) {
        out.push({
          from: c.at,
          to: c.end,
          command: c.name,
          fix: rule.fix,
          stream: rule.streamed ? (streamOf(doc, c.end) ?? DEFAULT_STREAM) : undefined,
        });
      }
      continue;
    }
    for (const c of occurrences(doc, rule.collectors)) {
      const stream = rule.streamed ? (streamOf(doc, c.end) ?? DEFAULT_STREAM) : undefined;
      const covered = dumps.some(
        (d) => d.at > c.at && (stream === undefined || dumpCovers(doc, d.end, stream)),
      );
      if (!covered) {
        out.push({ from: c.at, to: c.end, command: c.name, fix: rule.fix, stream });
      }
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/**
 * Write the missing dump call at the end of the document.
 *
 * The end is where it belongs for a document-wide block, and it is the only
 * placement that is right without knowing where the writer's sections are —
 * moving it up is an edit they can make; losing the prose is not.
 *
 * A stream that is not the default has to be named, or the call renders a
 * different stream and the notes stay invisible.
 */
export function addDump(doc: string, p: Unrendered): { text: string; caret: number } {
  const call =
    p.stream && p.stream !== DEFAULT_STREAM
      ? p.fix.replace("()", `(זרם: "${p.stream}")`)
      : p.fix;
  const body = doc.replace(/\s*$/, "");
  const text = `${body}\n\n${call}\n`;
  return { text, caret: body.length + 2 };
}

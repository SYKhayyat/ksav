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
// A test caught it ("a command given text shows that text", now in
// `engine/tests/insertion.rs`). This is the fix: see it in the source, say so on
// the line, and offer the missing call — and `app/test/lints.test.mjs` holds the
// button that does it, which is what that test's own comment said was owed.
//
// The five other collect-then-render commands (`מדף_*`, `הערה_זרם`,
// `הערת_תוכן`, `הערת_מקור`, `הערת_גיליון`, `הערת_ימין`/`שמאל`) were checked by
// rendering and need nothing: the engine reserves their region and wraps them
// automatically. Guessing that they behaved alike would have produced four
// false warnings.

import { scan as scanDeferred } from "./deferred";
import { BAND_FAMILY } from "./note-commands";
import { scan as scanSpans, type Node } from "./spans";

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
    // The whole family, both languages, from the one list — a band tier that
    // exists but is missing here is a document that silently prints nothing.
    collectors: [...BAND_FAMILY],
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

/**
 * Every occurrence of any of these commands, as a scanned node.
 *
 * This used to be `doc.indexOf("#" + name)` in a loop with a hand-written
 * "is that `#` inside a comment?" test that its own comment called *"a crude
 * but adequate check"* — it looked for `//` earlier on the line and scanned
 * backwards for an unterminated `/*`, so a `//` inside a string argument hid
 * every command after it on that line. `spans.ts` does not emit nodes inside
 * comments at all, and it knows what a string is, so crude is no longer on
 * offer.
 */
function occurrences(doc: string, names: string[]): Node[] {
  return scanSpans(doc).nodes.filter((n) => n.hash && names.includes(n.name));
}

/** One place a collecting note is written, in either spelling. */
interface Site {
  from: number;
  /** Where the warning underlines to. */
  to: number;
  /** The collecting command, whether it was called or named. */
  command: string;
  /** The argument text that could carry a stream. */
  args: string;
}

/**
 * Every place one of these commands collects — called, or named as a value.
 *
 * A deferred note names its layout as a *value*: `#הערה_בשם("1", סוג: הערתסיום)`
 * has no `#הערתסיום` anywhere in it, so a scan for calls finds nothing, and the
 * quietest failure in the product went back to being silent the moment a writer
 * turned on "note bodies at the end of the file". Verified against the
 * compiler, both spellings: with no dump call, the marker prints and the prose
 * does not — the same page, byte for byte, either way.
 *
 * The engine had already learned this once. `lib.rs`'s
 * `apparatus_is_named_as_kind` exists so that a document of deferred page-bands
 * still reserves room at the foot of the page; this is the same fact, on the
 * editor's side of the wire.
 */
function sites(doc: string, collectors: string[]): Site[] {
  const out: Site[] = occurrences(doc, collectors).map((n) => ({
    from: n.from,
    // The command name alone: the writer's eye needs to land on the word.
    to: n.nameTo,
    command: n.name,
    args: n.args ? doc.slice(n.args.from, n.args.to) : "",
  }));
  for (const r of scanDeferred(doc).refs) {
    if (!r.kind || !collectors.includes(r.kind)) continue;
    // The whole marker, because `#הערה_בשם` is not the name of the problem —
    // the `סוג:` inside it is, and underlining the two together is what makes
    // the message about `#הערתסיום` legible on a line that never says it.
    out.push({ from: r.from, to: r.to, command: r.kind, args: r.rest });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The stream named in a call's arguments, if it names one. */
function streamOf(site: Site): string | undefined {
  // `#הערתסיום(זרם: "מקורות")[…]` — only a parenthesised argument list can carry it.
  const m = /(?:זרם|stream)\s*:\s*"([^"]*)"/u.exec(site.args);
  return m ? m[1] : undefined;
}

/** Does this dump call render the given stream? */
function dumpCovers(doc: string, n: Node, stream: string): boolean {
  if (!n.args) return true; // `#הערות_בסוף` bare: the default stream
  const args = doc.slice(n.args.from, n.args.to);
  const named = /(?:זרם|stream)\s*:\s*"([^"]*)"/u.exec(args);
  if (named) return named[1] === stream;
  // `#הערות_בסוף_צד(זרמים: ("תוכן", "מקורות"))` — a list of streams.
  const list = /(?:זרמים|streams)\s*:\s*\(([^)]*)\)/u.exec(args);
  if (list) return list[1].includes(`"${stream}"`);
  return stream === DEFAULT_STREAM;
}

const DEFAULT_STREAM = "הערות";

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
    // A dump call is never deferred: it takes no note body, so there is nothing
    // to exile and `#הערה_בשם` cannot stand for one.
    const dumps = occurrences(doc, rule.dumps);
    for (const c of sites(doc, rule.collectors)) {
      const stream = rule.streamed ? (streamOf(c) ?? DEFAULT_STREAM) : undefined;
      const covered = dumps.some(
        (d) => d.from > c.from && (stream === undefined || dumpCovers(doc, d, stream)),
      );
      if (!covered) {
        out.push({ from: c.from, to: c.to, command: c.command, fix: rule.fix, stream });
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

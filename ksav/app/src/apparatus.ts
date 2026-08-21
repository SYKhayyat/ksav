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
//
// **And the channels.** A channel placed at the end of a section or of the
// document is the same failure with a new spelling — the note is collected and
// nothing prints it until `#הצג_אזור` is called for its region — so it is the
// first thing this checks. Whether a channel collects is a fact about the
// document's declarations rather than about the command that was typed, which is
// the whole of the model, so the rule below cannot express it and the channels
// get a pass of their own.

import { channelNotesIn, channelsIn, regionsShownIn, showRegionLine } from "./channels";
import { scan as scanDeferred } from "./deferred";
import { docLang, nameIn, paramIn } from "./mode";
import { BAND_FAMILY } from "./note-commands";
import { langOf, scan as scanSpans, type Node } from "./spans";

/** A collecting command, and the call that renders what it collected. */
interface Rule {
  /** Command names, both languages. */
  collectors: string[];
  /** The dump call's names, both languages. */
  dumps: string[];
  /**
   * The command to call, **in Hebrew**. Spelt for the document by `fixFor`.
   *
   * It used to be the whole literal `"#הערות_בסוף()"`, written straight into
   * the writer's document by a button labelled "render the notes". Detection
   * here has been bilingual from the start — `collectors` and `dumps` both list
   * the English aliases, and `BAND_FAMILY` supplies the whole family in both —
   * so an English `#endnote` was found correctly and then repaired with a
   * Hebrew call. The streamed case was worse still: a Hebrew command, a Hebrew
   * parameter name and the writer's English stream name in one call.
   *
   * This is the surface with the least excuse for it, because repairing a
   * document is the whole of what it is for.
   */
  render: string;
  /** Does this collector's stream matter when matching a dump? */
  streamed: boolean;
}

const RULES: Rule[] = [
  {
    collectors: ["הערתסיום", "endnote"],
    dumps: ["הערות_בסוף", "endnotes", "הערות_בסוף_צד", "endnotes_side"],
    render: "הערות_בסוף",
    streamed: true,
  },
  {
    // The whole family, both languages, from the one list — a band tier that
    // exists but is missing here is a document that silently prints nothing.
    collectors: [...BAND_FAMILY],
    dumps: ["הערות_מדורגות", "banded_notes"],
    render: "הערות_מדורגות",
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
export function unrendered(doc: string, whenSilent: "he" | "en" = "he"): Unrendered[] {
  const out: Unrendered[] = [];
  // Once, at the top, and carried on every problem. Detection here reads both
  // languages and always has; the repair read one, so an English document was
  // diagnosed correctly and then mended in Hebrew. The lint message quotes
  // `fix` too, so deciding the language here is also what makes the sentence on
  // the line and the text the button writes the same string.
  const lang = docLang(doc, doc.length, whenSilent);
  // Channels first, because they are the same failure under the new spelling
  // and the sweep is the point: a channel placed at the end of a section or of
  // the document collects its notes and prints nothing until `#הצג_אזור` is
  // called for its region. Naming a class of bug and fixing one instance of it
  // is this repository's most-repeated mistake; the eighteen commands are two
  // rules below, and a document written in channels would have been silent.
  {
    const shown = regionsShownIn(doc);
    const byName = new Map(channelsIn(doc).map((c) => [c.name, c]));
    for (const note of channelNotesIn(doc)) {
      const c = byName.get(note.channel);
      if (!c || c.kind !== "collected") continue;
      if (shown.some((s) => s.from > note.from && s.region === c.region)) continue;
      out.push({
        from: note.from,
        to: note.to,
        command: note.command,
        fix: showRegionLine(c.region, lang),
        // The region, not the stream — the same field, because what the fix has
        // to name is "which collection is missing its call" either way.
        stream: c.region,
      });
    }
  }
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
        out.push({ from: c.from, to: c.to, command: c.command, fix: fixFor(rule, lang), stream });
      }
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The bare dump call a rule offers, spelt for the document. */
function fixFor(rule: Rule, lang: "he" | "en"): string {
  return `#${nameIn(rule.render, lang)}()`;
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
  // `p.fix` is already spelt for the document — `unrendered` decided that. The
  // parameter name has to be spelt too, and separately, because the *value* is
  // the writer's own stream name and must go in exactly as they wrote it.
  // Running the whole call through `translated` would have turned a stream
  // called "מקורות" into "Sources" and pointed the dump at a stream nobody
  // collects into, which is the same silent-empty-block failure this module
  // exists to end, arriving through the fix for it.
  const named = /^#([A-Za-z0-9֐-׿_]+)/u.exec(p.fix)?.[1] ?? "";
  const stream = paramIn(named, "זרם", langOf(named));
  const call =
    // A channel's fix already names its region — `#הצג_אזור("ביאור")` — so there
    // is nothing to fill in, and filling it in would append a second argument
    // list to a call that has one.
    p.fix.includes("()") && p.stream && p.stream !== DEFAULT_STREAM
      ? p.fix.replace("()", `(${stream}: "${p.stream}")`)
      : p.fix;
  return fileAtEnd(doc, call);
}

/**
 * Put a rendering call at the end of the document.
 *
 * Exported because the Styles panel's "print the collected notes here" button
 * needs exactly this rule, and splicing at the caret is not it: a dump renders
 * what was written *before* it, so a call inserted where the writer happens to
 * be standing — which on a fresh document is the first line — renders nothing at
 * all and leaves the lint standing. Found by pressing the button in the running
 * app, not by any test: every assertion about this call had gone through
 * `addDump`, and the new button had its own copy of the idea.
 */
export function fileAtEnd(doc: string, call: string): { text: string; caret: number } {
  const body = doc.replace(/\s*$/, "");
  return { text: `${body}\n\n${call}\n`, caret: body.length + 2 };
}

/**
 * The dump call a collecting command needs, spelt for `lang`, or null.
 *
 * The same rules the lint reads, asked the other way round: the lint finds a
 * collector with no dump and offers the call; this is asked *while writing* one,
 * so the document never reaches the state the lint exists to report.
 *
 * The destination model does not need this — `#הערה(ערוץ: "סוף")` is placed by
 * its channel and printed by `#הצג_אזור` — but the collecting commands are still
 * in the registry, still in the palette, and still work. A writer who reaches
 * for `#הערתסיום` by name gets the command they asked for and the call that
 * renders it, rather than the command they asked for and a lint.
 */
export function dumpFor(command: string, lang: "he" | "en" = "he"): string | null {
  const rule = RULES.find((r) => r.collectors.includes(command));
  return rule ? fixFor(rule, lang) : null;
}

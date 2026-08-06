// Making a mixed-direction source file sit still.
//
// Typesetting input is a strange kind of text: it is source code, but it is
// mostly natural language, and here that language runs right to left. The
// Unicode bidi algorithm is doing exactly what it is told, and the result is
// still unreadable, because the thing it is told is wrong in two specific ways
// that this module corrects. Both come from Katvan (github.com/IgKh/katvan), a
// Qt editor with the same problem; the mechanisms are CodeMirror's and the
// diagnoses are its author's.
//
// ## 1. The whole file is given one direction
//
// The editor sets `dir` once, from the document's own setting, and every line
// inherits it. So an English paragraph inside a Hebrew document is laid out in
// an RTL paragraph: its full stop moves to the left of the sentence, and a line
// that wraps wraps from the wrong side. The fix is a base direction *per line*,
// which is what `EditorView.perLineTextDirection` measures against and what the
// `dir` attribute on each line supplies.
//
// A line with any letter in it answers for itself. The interesting case is the
// line with no strong character at all — a blank one, or a line holding nothing
// but `]` — because "no answer" is where every editor quietly falls back to the
// application's locale, and on an LTR system that means a blank line between two
// Hebrew paragraphs is LTR. The visible symptom is the caret getting stuck: you
// press Home on the blank line and land somewhere that makes no sense, because
// that line reads the other way from its neighbours. Katvan lists fixing this as
// a 1.0 blocker, which is a good sign it is not a theoretical problem.
//
// So a directionless line inherits, in this order:
//
//   1. the direction of the line that opened the group it is inside — so the
//      blank lines and the closing `]` of a `#הערה[…]` read the way its opener
//      does, rather than the way the last line of its body happened to;
//   2. the previous line's resolved direction;
//   3. the document's own.
//
// The blast radius is deliberately tiny: this chain is consulted only for lines
// containing no letter in any script. Anything with a letter uses its own.
//
// ## 2. The syntax is not separated from the prose
//
// `#צבע(rgb("#b91c1c"))[טקסט]` in a right-to-left paragraph does not display in
// that order. The Latin run, the digits, and the brackets around them are laid
// out by an algorithm that has no idea `(` belongs to `rgb` — so the parentheses
// migrate, and editing the argument means chasing a caret that jumps across the
// call. The cure is to isolate each piece of syntax so it is one opaque object
// to the surrounding paragraph, which is what Unicode isolates are for.
//
// Katvan does this by building a shadow copy of every line with LRI/RLI/FSI and
// PDI characters injected, plus an offset map to keep cursor positions meaning
// something — genuinely unpleasant code (`core/katvan_editorlayout.cpp`).
// CodeMirror has the mechanism built in: a mark decoration carrying
// `bidiIsolate`, registered through `EditorView.bidiIsolatedRanges`, both styles
// the range and tells CodeMirror's own bidi pass about it. Both halves matter.
// The CSS alone would reorder the text on screen while the editor still computed
// caret positions from the unisolated order, which is a worse bug than the one
// being fixed: the text would look right and the cursor would lie.
//
// `bidiIsolates()` from `@codemirror/language` would do this for free, but it
// works off Lezer nodes marked as isolating, and Ksav has no Lezer grammar. The
// ranges therefore come from `spans.ts`, which is now a real containment tree
// rather than a regex sweep — so the isolates, the highlighter, prose mode and
// the structural editors all agree about where a command is by construction
// rather than by everybody's private matcher happening to concur.
//
// Everything above the CodeMirror section is pure text in, answers out.

import { Decoration, EditorView, ViewPlugin, highlightSpecialChars } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { Direction } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { scan } from "./spans";

export type Dir = "rtl" | "ltr";

/**
 * The scripts whose letters are strongly right-to-left.
 *
 * Scripts rather than code-point ranges, so this says what it means and stays
 * right when Unicode adds a block. Combining marks are excluded by the `\p{L}`
 * test below, which is not an oversight but the rule: nikud is bidi class NSM —
 * it takes the direction of the letter it sits on and has none of its own, so a
 * word of pure nikud (which does not exist, but a truncated paste can be one)
 * must not decide a line's direction.
 */
const RTL_LETTER =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;
const LETTER = /\p{L}/u;

/** The isolate controls, which delimit a run whose direction is its own. */
const ISOLATE_START = /[⁦⁧⁨]/; // LRI, RLI, FSI
const PDI = "⁩";

/**
 * How far into a line to look for the character that decides its direction.
 *
 * A base direction is decided by the *first* strong character, so the answer is
 * almost always in the first few. The cap is for the pathological line — a
 * 200 KB single-line paste — where scanning to the end on every keystroke is the
 * only cost this module could ever impose. Katvan caps at 100; the number is not
 * load-bearing, having one is.
 */
export const SCAN_LIMIT = 200;

/**
 * The direction a run of text has of its own accord, or `null` for one that has
 * none.
 *
 * `null` is a real answer and the reason this returns three things rather than
 * two. "This line does not say" is what the inheritance chain exists to answer,
 * and collapsing it into a default here would make that chain unreachable.
 *
 * Text inside an isolate is skipped, because that is what an isolate means: a
 * `#הערה` wrapped in LRI…PDI must not make the paragraph around it left-to-right.
 */
export function naturalDirection(text: string, limit = SCAN_LIMIT): Dir | null {
  let depth = 0;
  let seen = 0;
  for (const ch of text) {
    if (seen++ >= limit) break;
    if (ISOLATE_START.test(ch)) {
      depth++;
      continue;
    }
    if (ch === PDI) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0 || !LETTER.test(ch)) continue;
    return RTL_LETTER.test(ch) ? "rtl" : "ltr";
  }
  return null;
}

/**
 * A base direction for every line, resolving the ones that have none.
 *
 * The group stack is the part worth explaining. It is built from a bare count of
 * `[({` against `])}`, with no idea about strings or comments — a bracket inside
 * a Typst string literal will push a level that never pops. That is tolerable
 * here in a way it would not be in the bracket linter, because of what the stack
 * is *used for*: it only ever supplies a direction to a line that has no letter
 * in it, and only when the previous line would otherwise. The worst a miscount
 * can do is make a blank line inherit from the wrong earlier line, in a document
 * where those two lines usually read the same way anyway.
 *
 * `spans.ts` knows how to do this properly and is deliberately not used here:
 * it scans a whole document, and this runs against a viewport on every scroll.
 * It is the one bracket count in `src/` that is allowed to be approximate, and
 * `spans.test.mjs` names it as the single exemption rather than leaving it to
 * look like one more scanner nobody got round to.
 */
export function resolveLineDirections(lines: string[], fallback: Dir, seed: Dir | null = null): Dir[] {
  const out: Dir[] = [];
  const openers: Dir[] = [];
  let previous: Dir | null = seed;
  for (const line of lines) {
    const own = naturalDirection(line);
    // The group's opener before the previous line: a closing `]` should read the
    // way the call it closes reads, not the way the last line of the body did.
    const dir = own ?? openers[openers.length - 1] ?? previous ?? fallback;
    out.push(dir);
    previous = dir;
    // Applied after this line has been given its direction, so the line holding
    // the closer still sees the group it is closing.
    for (const ch of line) {
      if (ch === "[" || ch === "(" || ch === "{") openers.push(dir);
      else if (ch === "]" || ch === ")" || ch === "}") openers.pop();
    }
  }
  return out;
}

/** A run of syntax to hold apart from the prose around it. */
export interface Isolate {
  from: number;
  to: number;
  /** `null` means "decide from the run's own first strong character" — Unicode's
   *  FSI, and the right answer for a call whose name is Hebrew but whose
   *  arguments are not, or the reverse. */
  dir: Dir | null;
}

/**
 * The runs of `text` that should be isolated from the paragraph they sit in.
 *
 * Two kinds, and no more: a comment, and a command's *head* — `#name` together
 * with its `(…)` arguments, but never its `[…]` body. The body is the writer's
 * prose and belongs to the paragraph; the head is machinery.
 *
 * The result is sorted and strictly non-overlapping. Nesting is real —
 * `#צבע(rgb("#b91c1c"))` contains a call inside its own argument list — and an
 * inner isolate buys nothing once its container is isolated, so only the
 * outermost is kept. (`#b91c1c` itself is no longer among them: the scanner
 * tracks code-mode strings, so a colour literal is text rather than a command
 * that happens to start with a hash.)
 */
export function isolateSpans(text: string): Isolate[] {
  const spans: Isolate[] = [];
  const s = scan(text);
  for (const c of s.comments) {
    spans.push({ from: c.from, to: c.to, dir: naturalDirection(text.slice(c.from, c.to)) });
  }
  for (const n of s.nodes) {
    const to = n.args ? n.args.to + 1 : n.nameTo;
    spans.push({ from: n.from, to, dir: naturalDirection(text.slice(n.from, to)) });
  }
  spans.sort((a, b) => a.from - b.from || b.to - a.to);
  const kept: Isolate[] = [];
  for (const s of spans) {
    if (s.to <= s.from) continue;
    const last = kept[kept.length - 1];
    if (last && s.from < last.to) continue; // inside, or straddling, one already kept
    kept.push(s);
  }
  return kept;
}

// ------------------------------------------------------------- the CodeMirror

/**
 * How far back to look for the direction a viewport's first line inherits.
 *
 * The chain is transitive, so answering "which way does line 4,000 read?"
 * strictly means resolving lines 1 to 3,999. That would make every scroll cost a
 * pass over the document. In practice the answer is settled by the nearest line
 * with a letter in it, and a run of two hundred consecutive letterless lines is
 * not a document anybody is writing. Past that the document's own direction is
 * used, which is what happens today for every line.
 */
const SEED_LINES = 200;

function lineDecorations(view: EditorView, fallback: Dir): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  // Two visible ranges can meet on one line — the end of one is the start of the
  // next — and a builder rejects the same position twice. Tracking the last line
  // emitted is cheaper than reasoning about when that happens.
  let emitted = 0;
  for (const { from, to } of view.visibleRanges) {
    const first = Math.max(doc.lineAt(from).number, emitted + 1);
    const last = doc.lineAt(to).number;
    if (last < first) continue;
    const seedFrom = Math.max(1, first - SEED_LINES);
    const lines: string[] = [];
    for (let n = seedFrom; n <= last; n++) lines.push(doc.line(n).text);
    const dirs = resolveLineDirections(lines, fallback);
    for (let n = first; n <= last; n++) {
      builder.add(doc.line(n).from, doc.line(n).from, LINE_DIR[dirs[n - seedFrom]]);
    }
    emitted = last;
  }
  return builder.finish();
}

const LINE_DIR: Record<Dir, Decoration> = {
  rtl: Decoration.line({ attributes: { dir: "rtl" } }),
  ltr: Decoration.line({ attributes: { dir: "ltr" } }),
};

// The `dir` attribute and the `bidiIsolate` spec have to say the same thing:
// one is what the browser lays out, the other is what CodeMirror measures. The
// class supplies `unicode-bidi: isolate`, which is the half that makes `dir`
// mean "this run is its own" rather than "override everything from here on".
const ISOLATE_DECO = {
  rtl: Decoration.mark({ class: "ksav-isolate", attributes: { dir: "rtl" }, bidiIsolate: Direction.RTL }),
  ltr: Decoration.mark({ class: "ksav-isolate", attributes: { dir: "ltr" }, bidiIsolate: Direction.LTR }),
  // `bidiIsolate: null` is CodeMirror's spelling of `dir=auto`.
  auto: Decoration.mark({ class: "ksav-isolate", attributes: { dir: "auto" }, bidiIsolate: null }),
};

function isolateDecorations(view: EditorView): DecorationSet {
  const ranges: { from: number; deco: Decoration; to: number }[] = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const s of isolateSpans(text)) {
      ranges.push({
        from: from + s.from,
        to: from + s.to,
        deco: s.dir ? ISOLATE_DECO[s.dir] : ISOLATE_DECO.auto,
      });
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges.map((r) => r.deco.range(r.from, r.to)), true);
}

// -------------------------------------------------- the marks you cannot see
//
// When the heuristics above get it wrong — and on a line that is one Hebrew
// word, one English word and a bracket, they eventually will — the writer's only
// recourse is to place a Unicode control character by hand. Which is a fine
// escape hatch and a terrible one to debug, because the characters are invisible
// and take a cursor keypress to step over: a file with a stray RLM in it looks
// exactly like a file without one, and behaves differently.
//
// So the marks are drawn. Katvan ships a whole font for this
// (`assets/KatvanControl.otf`) to get real glyphs; a small labelled chip in the
// text costs nothing and says more, since the point is to tell RLM from LRM
// rather than to admire either.

/** Every bidi control character, by code point, with what to call it. */
export const BIDI_MARKS: Record<number, { tag: string; he: string; en: string }> = {
  0x200e: { tag: "LRM", he: "סימון שמאל־לימין", en: "left-to-right mark" },
  0x200f: { tag: "RLM", he: "סימון ימין־לשמאל", en: "right-to-left mark" },
  0x061c: { tag: "ALM", he: "סימון ערבי", en: "Arabic letter mark" },
  0x202a: { tag: "LRE", he: "הטמעה שמאל־לימין", en: "left-to-right embedding" },
  0x202b: { tag: "RLE", he: "הטמעה ימין־לשמאל", en: "right-to-left embedding" },
  0x202c: { tag: "PDF", he: "סוף הטמעה", en: "pop directional formatting" },
  0x202d: { tag: "LRO", he: "כפיית שמאל־לימין", en: "left-to-right override" },
  0x202e: { tag: "RLO", he: "כפיית ימין־לשמאל", en: "right-to-left override" },
  0x2066: { tag: "LRI", he: "בידוד שמאל־לימין", en: "left-to-right isolate" },
  0x2067: { tag: "RLI", he: "בידוד ימין־לשמאל", en: "right-to-left isolate" },
  0x2068: { tag: "FSI", he: "בידוד לפי התוכן", en: "first-strong isolate" },
  0x2069: { tag: "PDI", he: "סוף בידוד", en: "pop directional isolate" },
};

/** The same set as a regex, built from the table so the two cannot drift. */
export const BIDI_MARK_RE = new RegExp(
  "[" + Object.keys(BIDI_MARKS).map((c) => "\\u" + Number(c).toString(16).padStart(4, "0")).join("") + "]",
  "gu",
);

/** The characters an isolate is written with: open, and the one closer. */
export const ISOLATE_OPEN: Record<Dir | "auto", string> = {
  ltr: "⁦",
  rtl: "⁧",
  auto: "⁨",
};
export const ISOLATE_CLOSE = "⁩";

/**
 * Wrap `text` in an isolate, or unwrap it if it is already wrapped in one.
 *
 * A toggle rather than an insert, because the mistake this exists to fix is
 * usually made twice: you isolate a run, the line still looks wrong because the
 * problem was elsewhere, and now there is an invisible pair in the file that
 * nobody will ever find by reading it.
 */
export function toggleIsolate(text: string, kind: Dir | "auto" = "auto"): string {
  const open = Object.values(ISOLATE_OPEN);
  if (text.length >= 2 && open.includes(text[0]) && text[text.length - 1] === ISOLATE_CLOSE) {
    return text.slice(1, -1);
  }
  return ISOLATE_OPEN[kind] + text + ISOLATE_CLOSE;
}

/**
 * Per-line direction and isolated syntax, for a document whose own direction is
 * `defaultDir()`.
 *
 * A function rather than a value because the document's direction is a setting
 * the writer can change while the editor is open, and reading it once at
 * construction would leave the fallback pointing at whatever it was at boot.
 */
export function bidiSupport(defaultDir: () => Dir): Extension {
  const isolates = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = isolateDecorations(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = isolateDecorations(u.view);
      }
    },
    {
      decorations: (v) => v.decorations,
      // The same set, twice, on purpose: once so the ranges are drawn with the
      // isolating style, and once so CodeMirror's own bidi computation knows
      // about them. Registering only the first is the bug described at the top —
      // text that looks right with a caret that does not follow it.
      provide: (plugin) =>
        EditorView.bidiIsolatedRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
    },
  );

  const perLine = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = lineDecorations(view, defaultDir());
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged)
          this.decorations = lineDecorations(u.view, defaultDir());
      }
    },
    { decorations: (v) => v.decorations },
  );

  return [EditorView.perLineTextDirection.of(true), perLine, isolates];
}

/**
 * Draw every bidi control character as a labelled chip.
 *
 * Deliberately *not* part of [`bidiSupport`]: it must never be on at the same
 * time as prose mode. Both work by replacing ranges of the document, and two
 * replacements over one range is not a cosmetic clash — CodeMirror rejects the
 * decoration set outright ("Ran out of text content") and the editor goes blank.
 * Prose mode hides command syntax, a mark can sit inside command syntax, so the
 * overlap is reachable. The caller puts the two in one compartment, which makes
 * "never both" a fact about the code rather than a rule somebody has to keep.
 */
export function visibleBidiMarks(name: (code: number) => string): Extension {
  return highlightSpecialChars({
    addSpecialChars: BIDI_MARK_RE,
    render: (code, _description, placeholder) => {
      const mark = BIDI_MARKS[code];
      const span = document.createElement("span");
      span.className = mark ? "cm-specialChar ksav-bidi-mark" : "cm-specialChar";
      span.textContent = mark ? mark.tag : placeholder;
      span.title = name(code);
      // The chip is scenery around a real character. Without this a screen
      // reader announces "RLM" as text the document does not contain.
      span.setAttribute("aria-hidden", "true");
      return span;
    },
  });
}

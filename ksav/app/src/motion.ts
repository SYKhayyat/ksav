// Source motion over prose — what the caret steps over (#126, route B).
//
// The decision record `decisions/2026-11-17-source-navigation-spec.md` is the
// rule; this module is its pure half. Motion asks the scan's runs — never a new
// syntax walk — and answers *where the caret may land next* in one direction,
// at one granularity. The keymap that binds it to keys lives elsewhere and is
// deliberately not here: a movement rule is a fact, a key is a preference, and
// the felt behaviour has to be confirmed on the owner's machine before the
// setting ships as the default. This file's job is only that the fact is right.
//
// # The one rule
//
// **Entering a body is okay; leaving a body is not.** The writer may step into
// `[…]` — that is where the prose is, and the reveal mechanism's whole reason
// to exist is that the caret can reach hidden syntax. So a forward motion that
// meets a `#` or a `(` must skip the whole command (name, argument list, every
// trailing body) and land at its far edge; a backward motion meets the same
// scaffold and skips it the other way. The bodies themselves stay reachable
// from both sides: the caret lands *on* a body's open bracket, steps in, and
// only ever skips a scaffold *unit*, never a body's contents.
//
// # The units
//
// Everything below is derived from `spans.scan`, so the runs table in the spec
// and this module cannot disagree about what the classes are — the fence for
// that is `motion.test.mjs`, which drives this module over the documents the
// scan itself is tested on.

import type { Scan } from "./spans";

/** One character of syntax, as far as motion is concerned. */
export interface Unit {
  from: number;
  /** One past the end — the position the caret can stand *after* the unit. */
  to: number;
  /** Why it is skipped, for the reader of a failing test. */
  kind: string;
}

/**
 * Every scaffold interval in the document, derived from the scan.
 *
 * Intervals are *unmerged* on purpose: `#הדגשה` is one unit and `[` is a
 * different one even when they touch, because the caret may land between them —
 * it must be able to stand on the body's open bracket to step into the prose.
 * What gets merged is a whole call's span only where the spec says one unit:
 * the `#name(…)` head, a string literal, a comment, a raw region.
 */
export function scaffoldUnits(scan: Scan): Unit[] {
  const out: Unit[] = [];
  const push = (from: number, to: number, kind: string) => {
    if (to > from) out.push({ from, to, kind });
  };
  // The head of every call: `#` + the name. Bare calls (written inside code
  // without the `#`) have `hash: false` and start at `nameFrom`.
  for (const n of scan.nodes) {
    push(n.hash ? n.nameFrom - 1 : n.nameFrom, n.nameTo, "command name");
    if (n.args) {
      // The parentheses and every comma inside — the whole argument list is one
      // unit, so a motion cannot pause on a comma that belongs to a command.
      push(n.args.from - 1, n.args.to + 1, "argument list");
    }
  }
  // The brackets of every content group — the body's edges. Contents are prose
  // and appear nowhere here: `contentGroups` is exactly "the parts of the
  // document that are prose", so anything outside it that is not a unit below
  // is whitespace, which motion walks one step at a time.
  for (const g of scan.contentGroups) {
    push(g.from - 1, g.from, "body open bracket");
    push(g.to, g.to + 1, "body close bracket");
  }
  // Strings and comments are opaque: one unit, delimiters included, brackets
  // inside inert. A motion crosses a whole comment in one step the way it
  // crosses a whole command name.
  for (const s of scan.strings) push(s.from - 1, s.to + 1, "string");
  for (const c of scan.comments) push(c.from - 1, c.to + 1, "comment");
  for (const r of scan.raws) push(r.from, r.to, "raw region");
  // A body can sit **inside** an argument list — `#סימן(\"א\", [דיני תפילה])` —
  // and the list's parentheses then span the prose. Left whole, crossing the
  // argument list would jump over the body as well, which is the one thing the
  // rule forbids: entering a body is allowed. So every scaffold interval loses
  // the prose inside it, and what is left is the syntax around the prose.
  const prose = scan.contentGroups.map((g) => ({ from: g.from, to: g.to }));
  return without(out, prose);
}

/** `units` with every `holes` interval cut out, in document order. */
function without(units: Unit[], holes: { from: number; to: number }[]): Unit[] {
  if (holes.length === 0) return units;
  const out: Unit[] = [];
  for (const u of units) {
    let pieces: { from: number; to: number }[] = [{ from: u.from, to: u.to }];
    for (const h of holes) {
      const next: { from: number; to: number }[] = [];
      for (const p of pieces) {
        if (h.to <= p.from || h.from >= p.to) {
          // Disjoint: the piece survives whole.
          next.push(p);
          continue;
        }
        if (h.from <= p.from && h.to >= p.to) {
          // The piece is *nested inside* the prose — a command written inside a
          // body — and it is a unit in its own right, reported separately by the
          // scan. Cutting it here would delete the syntax a writer most wants to
          // step over, which is a `#` inside a paragraph.
          next.push(p);
          continue;
        }
        if (h.from > p.from) next.push({ from: p.from, to: h.from });
        if (h.to < p.to) next.push({ from: h.to, to: p.to });
      }
      pieces = next;
    }
    for (const p of pieces) if (p.to > p.from) out.push({ ...p, kind: u.kind });
  }
  return out;
}

/** The unit whose body contains `pos` (a position inside it), if any. */
function unitAt(units: Unit[], pos: number): Unit | undefined {
  // Few units and a linear scan is fine: this is called once per keypress, and
  // the scan itself is the same order of cost. A binary search would be a
  // second opinion about a table this small.
  //
  // **Innermost wins.** Units nest — a string sits inside an argument list, and
  // a command sits inside a body — and the first match in document order is the
  // *outer* one. Taking it skipped a whole argument list when the caret was
  // inside its string, so a motion over a quoted value silently jumped to the
  // closing parenthesis. The largest `from` among the containing units is the
  // innermost.
  let best: Unit | undefined;
  for (const u of units) {
    if (u.from <= pos && pos < u.to && (!best || u.from >= best.from)) best = u;
  }
  return best;
}

/**
 * The next position the caret may stand, in `dir`.
 *
 * `granularity` is the spec's two kinds of motion:
 *
 * - `"char"` — the arrow keys. One character through prose and whitespace, and
 *   the far edge of a scaffold unit when the motion would enter one: the writer
 *   never has to click past a `#הדגשה(` one character at a time.
 * - `"word"` — word-over-word through prose, whole-unit over scaffolding. A
 *   command name is one word however many letters it has.
 *
 * Both directions are the same rule read backwards: a forward motion skips a
 * unit to its far edge, a backward motion to its near edge, and a body's
 * brackets are units too — so leaving a body (forward out of `]`, backward out
 * of `[`) is a skip, while entering it is a single step onto the bracket.
 */
export function nextStop(
  scan: Scan,
  pos: number,
  dir: 1 | -1,
  granularity: "char" | "word",
): number {
  const units = scaffoldUnits(scan);
  // Inside a unit (or at its near edge, moving forward — the unit that *starts*
  // here): cross it whole. At a unit's far edge moving forward, or its near edge
  // moving backward, the unit is behind us and we step normally.
  // A unit is crossed to its far edge — but never *past* another unit's edge on
  // the way. Crossing the argument list of `#סימן("א", [דיני תפילה])` reaches the
  // closing parenthesis, and the body's `[` sits inside that span: jumping over
  // it is the one thing the rule forbids, because the body is where the prose
  // is. So the target is clamped to the nearest inner boundary.
  const cross = (from: number, target: number): number => {
    if (dir === 1) {
      const inner = units.filter((u) => u.from > from && u.from < target).map((u) => u.from);
      return inner.length ? Math.min(...inner) : target;
    }
    const inner = units.filter((u) => u.to < from && u.to > target).map((u) => u.to);
    return inner.length ? Math.max(...inner) : target;
  };
  const at = unitAt(units, pos);
  if (at) {
    if (dir === 1) return cross(pos, at.to);
    // Standing exactly on a unit's near edge and moving backwards: that edge is
    // where we already are, so the unit is *behind* us. Returning `at.from`
    // here was a motion that could not move — a caret stuck on a bracket, which
    // the backward-symmetry assertions below caught.
    if (at.from < pos) return cross(pos, at.from);
  }
  // Not inside a unit. If a unit starts exactly here and we are moving forward,
  // the caret is about to enter syntax: skip it.
  if (dir === 1 && pos < scan.text.length) {
    const starts = units.find((u) => u.from === pos);
    if (starts) return cross(pos, starts.to);
  }
  if (dir === -1 && pos > 0) {
    const ends = units.find((u) => u.to === pos);
    if (ends) return cross(pos, ends.from);
  }
  // Prose or whitespace. One character for `"char"`; for `"word"`, skip to the
  // next boundary — a change of whitespace, or the edge of the next unit, or
  // the edge of the document. The rule is deliberately simple (whitespace
  // splits words; a direction change inside one word does not — see the spec's
  // rule 2 and the mixed-run test that asserts it).
  if (granularity === "char") {
    return Math.max(0, Math.min(scan.text.length, pos + dir));
  }
  return wordEdge(scan, units, pos, dir);
}

/**
 * The next word boundary in `dir`.
 *
 * Two boundaries exist, and only two: a change between whitespace and not, and
 * a scaffold unit's edge. That is deliberately the whole rule — the spec's rule
 * 2 says a direction change inside a run does **not** split a word, so a Hebrew
 * word and an English word written without a space between them are one word
 * here, which is what `bidi.ts` also says about them.
 *
 * The consequence worth stating, because it is the visible one: from the end of
 * a word, word motion stops *on* the space, and from the space it stops on the
 * next word's first character. Landing on a space looks odd and is right — it is
 * where the two words meet — and it makes the motion exactly reversible, which
 * the word assertions in `motion.test.mjs` check.
 */
function wordEdge(scan: Scan, units: Unit[], pos: number, dir: 1 | -1): number {
  const text = scan.text;
  const isSpace = (i: number) => /\s/u.test(text[i] ?? "");
  let at = pos;
  for (;;) {
    const next = at + dir;
    if (next < 0) return 0;
    if (next > text.length) return text.length;
    if (next === text.length) return text.length;
    // A scaffold edge is a boundary in its own right, and the step that enters a
    // unit is `nextStop`'s job rather than this loop's: stopping on the edge is
    // the same answer either way.
    if (units.some((u) => (dir === 1 ? u.from === next : u.to === next))) return next;
    if (isSpace(next) !== isSpace(at)) return next;
    at = next;
  }
}

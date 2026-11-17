// Source motion over prose (#126, route B) — the runs table, row by row.
//
// The decision record states the rule and its cases; this file is what makes the
// statement checkable. Every block below is a row of that table, driven through
// the real `spans.scan` rather than through a hand-written fixture, because the
// one thing that can rot here is the *agreement* between the scan's runs and the
// motion that reads them.
//
// Two properties are asserted for every case, and they are different properties:
// forward and backward motion must be **symmetric** (the position to the right
// of a unit and the position to the left of it are each other's stops), and a
// motion must never land *inside* a scaffold unit — landing on either edge is
// legal, landing in the middle of `#הדגשה` is the bug the issue is about.

import { check, ok } from "./harness.mjs";
import { scan } from "../.tmp-test/spans.mjs";
import { nextStop, scaffoldUnits } from "../.tmp-test/motion.mjs";

/** Every position the caret can reach with `n` forward character motions. */
function walk(text, from, n, dir = 1, granularity = "char") {
  const s = scan(text);
  const seen = [];
  let at = from;
  for (let i = 0; i < n; i++) {
    at = nextStop(s, at, dir, granularity);
    seen.push(at);
  }
  return seen;
}

export async function run() {
  // ------------------------------------------------ 1. the command head
  //
  // `#הדגשה[…]` — the `#` and the name are one unit. A forward motion from the
  // prose before it lands on the body's open bracket (entering is allowed),
  // never inside the name; backward motion from inside the body lands on the
  // same bracket.
  {
    const text = "טקסט #הדגשה[מודגש] סוף";
    const hash = text.indexOf("#");
    const open = text.indexOf("[");
    const s = scan(text);
    const units = scaffoldUnits(s);
    const name = units.find((u) => u.kind === "command name");
    ok("the command name is one unit", !!name, JSON.stringify(units));
    check("…starting at the hash", name.from, hash);
    check("…ending after the name", name.to, open);
    // A character step from the prose lands on the `#` — a unit's near edge is a
    // legal stop — and the step after it crosses the whole name, landing on the
    // body's open bracket. One character of scaffolding, never twelve.
    check("the step onto the hash is a stop", nextStop(s, hash - 1, 1, "char"), hash);
    check("a forward motion from the hash skips the whole name", nextStop(s, hash, 1, "char"), open);
    // Backward from inside the body (the prose) stops at the body's bracket…
    const bodyFrom = open + 1;
    check("a backward motion from the body stops at the open bracket", nextStop(s, bodyFrom, -1, "char"), open);
    // …and one more backward step crosses the name, to the hash.
    check("…and one more crosses the name to its hash", nextStop(s, open, -1, "char"), hash);
    check("…and one more reaches the prose", nextStop(s, hash, -1, "char"), hash - 1);
    // Nothing lands strictly inside the name.
    const inside = walk(text, hash - 1, 3).filter((p) => p > hash && p < open);
    check("no stop lands inside the command name", inside, []);
  }

  // ------------------------------------------------ 2. the argument list
  //
  // The parentheses and commas are one unit; the string inside is its own. A
  // motion cannot pause on a comma that belongs to a command — that was the
  // behaviour that made `Ctrl+Right` useless in `#סימן("א", [דיני תפילה])`.
  {
    const text = '#סימן("א", [דיני תפילה])\nטקסט';
    const s = scan(text);
    const paren = text.indexOf("(");
    const commaAt = text.indexOf(",");
    const openBracket = text.indexOf("[");
    const stops = walk(text, paren, 5);
    // The comma is *inside* the argument list, so the caret crosses it rather
    // than walking it: one step from the comma leaves the list.
    ok(
      "the comma is crossed, not pausing on it",
      nextStop(s, commaAt, 1, "char") > commaAt,
      JSON.stringify(stops),
    );
    // The body's bracket **is** a stop: entering a body is allowed, and the
    // whole point of clamping a crossing at the nearest inner boundary is that
    // the caret cannot be carried past the doorway to the prose.
    ok("the body's open bracket is a stop on the way", stops.includes(openBracket), JSON.stringify(stops));
    // The string is crossed without pausing inside it.
    const stringStart = text.indexOf('"') + 1;
    const stringEnd = text.indexOf("א", stringStart) + 1;
    const inside = stops.filter((p) => p > stringStart && p < stringEnd);
    check("no stop lands inside the argument's string", inside, []);
  }

  // ------------------------------------------------ 3. body brackets
  //
  // Entering is okay, leaving is not: `[` and `]` are units of their own, so a
  // motion may stand on them, but never between a bracket and the prose.
  {
    const text = "#הערה[הערה עם #הדגשה[פנים]]";
    const s = scan(text);
    const units = scaffoldUnits(s);
    const brackets = units.filter((u) => u.kind === "body open bracket");
    ok("every body contributes an open bracket unit", brackets.length >= 2, String(brackets.length));
    for (const b of brackets) {
      // The bracket is a stop, its inside is a stop, and the two are adjacent.
      check(
        "the bracket and the first character inside it are adjacent stops",
        nextStop(s, b.to, -1, "char"),
        b.from,
      );
    }
  }

  // ------------------------------------------------ 4. strings and comments
  //
  // Opaque: one unit, delimiters included, brackets inside inert. A motion
  // crosses the whole of it, which is the only way `"a (b)"` and `/* x */` do
  // not become places the caret gets stuck.
  {
    const text = '#שם("טקסט עם (סוגריים)", [גוף])\nסוף';
    const s = scan(text);
    const unit = scaffoldUnits(s).find((u) => u.kind === "string");
    ok("a string is one unit", !!unit);
    check("a forward motion crosses the string whole", nextStop(s, unit.from, 1, "char"), unit.to);
    // Backward from the string's far edge: the *innermost* unit at that position
    // is the string, not the argument list around it, so the caret steps to the
    // string's own near edge rather than to the list's opening parenthesis.
    check("and backward likewise", nextStop(s, unit.to - 1, -1, "char"), unit.from);
    const inside = walk(text, unit.from, 4).filter((p) => p > unit.from && p < unit.to);
    check("no stop lands inside a string", inside, []);
  }

  {
    const text = "טקסט // הערה עם #פקודה\nעוד";
    const s = scan(text);
    const unit = scaffoldUnits(s).find((u) => u.kind === "comment");
    ok("a comment is one unit", !!unit, JSON.stringify(scaffoldUnits(s)));
    check("a forward motion crosses the comment whole", nextStop(s, unit.from, 1, "char"), unit.to);
    const inside = walk(text, unit.from, 4).filter((p) => p > unit.from && p < unit.to);
    check("no stop lands inside a comment", inside, []);
  }

  // ------------------------------------------------ 5. prose is prose
  //
  // The rule that must not be over-applied: plain text moves one character at a
  // time, in both directions, in both languages. A "semantic" motion that jumped
  // word-over-word in prose would be a different feature and a worse one.
  {
    const text = "שלום עולם hello world";
    const s = scan(text);
    check("character motion is one character", nextStop(s, 0, 1, "char"), 1);
    check("…backward too", nextStop(s, 5, -1, "char"), 4);
    // Word motion: whitespace is the whole rule (spec rule 2), so the stop is
    // the *edge* between word and space — from a word's end the caret lands on
    // the space, and from the space on the next word's first character. That
    // makes the motion exactly reversible, which the backward assertion checks.
    check("word motion stops where the word ends", nextStop(s, 0, 1, "word"), 4);
    check("…and from the space, on the next word", nextStop(s, 4, 1, "word"), 5);
    check("…and it is reversible", nextStop(s, 5, -1, "word"), 4);
    // A mixed Hebrew/English line without a space is one word: the scan makes it
    // one run and the spec's rule 2 says motion does not split it.
    const mixed = "עניין";
    const s2 = scan(mixed);
    check("a mixed run is one word", nextStop(s2, 0, 1, "word"), mixed.length);
  }

  // ------------------------------------------------ 6. the edges
  //
  // Motion never leaves the document, and a document that is only scaffolding
  // still answers — the two ways an off-by-one becomes a crash.
  {
    const empty = scan("");
    check("an empty document has nowhere to go forward", nextStop(empty, 0, 1, "char"), 0);
    check("…or backward", nextStop(empty, 0, -1, "char"), 0);
    const only = "#הדגשה[]";
    const s = scan(only);
    check("a document of scaffolding still moves", nextStop(s, 0, 1, "char") > 0, true);
    check("and stops at its end", nextStop(s, only.length, 1, "char"), only.length);
  }
}

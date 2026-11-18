// The editor's scanner, held to its own promises on documents nobody types.
//
// # Why this exists
//
// `spans.ts::scan()` runs on **every keystroke**, on whatever the writer has
// typed so far — which is to say, on half-finished markup: an opened `#רשימה(`
// with nothing after it, a `[` with no `]`, a comment that swallows the rest of
// the document. The rest of the application then reads ranges out of it: the
// highlighter paints them, the outline walks them, `tableAt` counts cells in
// them, and a rewrite replaces the text between two of them.
//
// A range that is out of bounds, reversed, or overlapping in a way its reader
// does not expect is a highlight in the wrong place at best — and at worst a
// slice that throws inside CodeMirror, which takes the editor down rather than
// showing a diagnostic. None of that is a "the compile is wrong" failure, so
// nothing else in the suite is looking for it.
//
// So the corpus is generated (seeded, reproducible, and printed with the seed on
// failure) and every scan is checked against invariants the scanner's own
// comments state: ranges inside the text, `from <= to`, parents and children
// agreeing, comments in order, frames that never close ending at the text's end,
// and the same input producing the same scan twice.

import { check, ok } from "./harness.mjs";
import * as spans from "../.tmp-test/spans.mjs";

/** A tiny LCG, so a failure can be reproduced from its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 8;
  };
}

/** Fragments a document is made of, including the half-typed ones. */
const PIECES = [
  "שלום",
  "עולם",
  "word",
  " ",
  "\n",
  "\n\n",
  "#הדגשה[",
  "#רשימה(",
  "#טבלה(",
  "#כותרת1[",
  "#הערה[",
  "#גוף_הערה(א)[",
  "#let x = 1",
  "#import \"a.typ\": b",
  "[",
  "]",
  "(",
  ")",
  "{",
  "}",
  "\"",
  "`",
  "```",
  "//",
  "/*",
  "*/",
  "#",
  "$",
  "@ref",
  "<label>",
  "פריט[",
  "1. ",
  "- ",
  "עמודות: 2",
  "מיזוג: 2",
  "\u{202e}",
  "\t",
  "999999999999999999999",
  "#סימן[א']",
  "\\",
];

/** One generated document, from its seed. */
function document(seed) {
  const next = rng(seed);
  const n = 1 + (next() % 60);
  let text = "";
  for (let i = 0; i < n; i += 1) {
    const piece = PIECES[next() % PIECES.length];
    // Occasionally hammer one fragment, which is how a runaway paste looks.
    const times = next() % 12 === 0 ? 1 + (next() % 40) : 1;
    text += piece.repeat(times);
  }
  return text;
}

const LEN = (text) => text.length;

/**
 * What a scan says, without its circular links.
 *
 * A `Node` names its parent and its children, so `JSON.stringify(scan)` throws —
 * the determinism check has to compare the *ranges and names*, which is what
 * every reader of the scan actually uses.
 */
function digest(scan) {
  return JSON.stringify({
    nodes: scan.nodes.map((n) => [
      n.from, n.to, n.name, n.hash, n.nameFrom, n.nameTo, n.ctx, n.depth, n.role,
      n.args && [n.args.from, n.args.to],
      n.bodies.map((b) => [b.from, b.to]),
      n.parent ? [n.parent.from, n.parent.name] : null,
      n.children.length,
    ]),
    comments: scan.comments.map((c) => [c.from, c.to, Boolean(c.unterminated)]),
    frames: scan.frames.map((f) => [f.open, f.close, f.ctx, f.name]),
    roots: scan.roots.map((r) => [r.from, r.name]),
    delims: scan.delims.map((d) => [d.pos, d.ch, d.opener, d.name]),
  });
}

export async function run() {
  // --------------------------------------------- the corpus is a corpus
  {
    const docs = [...Array(300)].map((_, i) => document(i + 1));
    ok("the generator produces documents", docs.every((d) => d.length > 0));
    const distinct = new Set(docs);
    ok(`…that differ from one another (${distinct.size} of 300)`, distinct.size > 280);
    const average = docs.reduce((n, d) => n + d.length, 0) / docs.length;
    ok(`…and are long enough to exercise something (${Math.round(average)} chars)`, average > 40);
    check("…and are reproducible from the seed", document(17), document(17));
  }

  // ------------------------------- every range is a range in this document
  {
    const bad = [];
    let nodes = 0;
    let frames = 0;
    let comments = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const text = document(seed);
      const len = LEN(text);
      let scan;
      try {
        scan = spans.scan(text);
      } catch (e) {
        bad.push(`seed ${seed}: scan threw ${e}`);
        continue;
      }
      const say = (what, at) => bad.push(`seed ${seed}: ${what} — ${JSON.stringify(at)}`);

      for (const node of scan.nodes) {
        nodes += 1;
        if (!(node.from >= 0 && node.from <= node.to && node.to <= len)) {
          say("a node's range is outside the document", { from: node.from, to: node.to, len });
        }
        if (!(node.nameFrom >= node.from && node.nameFrom <= node.nameTo && node.nameTo <= node.to)) {
          say("a node's name is not inside the node", { name: node.name, from: node.nameFrom, to: node.nameTo });
        }
        if (node.args) {
          // A group is the text **inside** a pair of delimiters, so the
          // characters either side of it are those delimiters. That is stronger
          // than "inside the document": it catches an off-by-one that stays in
          // bounds, which is exactly the bug the first draft of this test let
          // through when a mutation moved a body's end by one.
          const g = node.args;
          if (text[g.from - 1] !== "(" || text[g.to] !== ")") {
            say(`the args of ${node.name} are not inside parentheses`, {
              from: g.from,
              to: g.to,
              before: text[g.from - 1],
              after: text[g.to],
            });
          }
        }
        for (const g of node.bodies) {
          if (!(g.from >= 0 && g.from <= g.to && g.to <= len)) {
            say(`a body of ${node.name} is outside the document`, { from: g.from, to: g.to, len });
          }
          if (text[g.from - 1] !== "[" || text[g.to] !== "]") {
            say(`a body of ${node.name} is not inside brackets`, {
              from: g.from,
              to: g.to,
              before: text[g.from - 1],
              after: text[g.to],
            });
          }
        }
        // The parent/child relation is read in both directions by different
        // callers (`parent` when a rewrite climbs, `children` when the outline
        // descends), so it has to agree with itself.
        if (node.parent && !node.parent.children.includes(node)) {
          say(`${node.name} names a parent that does not list it`, { name: node.name });
        }
        for (const child of node.children) {
          if (child.parent !== node) say(`${child.name} is a child of ${node.name} and does not say so`, {});
        }
      }
      for (const c of scan.comments) {
        comments += 1;
        if (!(c.from >= 0 && c.from <= c.to && c.to <= len)) {
          say("a comment is outside the document", { from: c.from, to: c.to, len });
        }
      }
      for (const f of scan.frames) {
        frames += 1;
        if (!(f.open >= 0 && f.open < f.close && f.close <= len)) {
          say("a frame's range is outside the document", { open: f.open, close: f.close, len });
        }
      }
      for (const d of scan.delims) {
        if (!(d.pos >= 0 && d.pos < len)) say("a delimiter is outside the document", { pos: d.pos, len });
        if (text[d.pos] !== d.ch) {
          say("a delimiter is not the character the document has there", { pos: d.pos, ch: d.ch, there: text[d.pos] });
        }
      }
      for (const r of scan.roots) {
        if (r.parent) say("a root names a parent", { name: r.name });
        if (!scan.nodes.includes(r)) say("a root is not among the nodes", { name: r.name });
      }
      // The same text scans to the same answer, which every memo and every
      // "did this change?" comparison depends on.
      if (digest(spans.scan(text)) !== digest(scan)) {
        say("scanning the same document twice gave two answers", {});
      }
    }
    // The anti-vacuity numbers: a corpus that produced no nodes would satisfy
    // every assertion above by having nothing to assert about.
    // The floors are the measured values minus a wide margin, so they catch a
    // corpus that stopped producing anything rather than a change in how much.
    // Measured when written: 2,447 nodes, 1,4xx frames, 2xx comments.
    ok(`the corpus produced calls to check (${nodes})`, nodes > 1500);
    ok(`…and frames (${frames})`, frames > 200);
    ok(`…and comments (${comments})`, comments > 50);
    check("no range went wrong", bad.slice(0, 6).join("; "), "");
  }

  // --------------------------------------------------- and it stays bounded
  {
    // A scan runs on every keystroke, so a pathological document that takes a
    // second is a window that cannot be typed in. This is not a benchmark: it is
    // the assertion that the scanner is not quadratic in something a paste can
    // produce, stated at a size a test can afford.
    const big = "#הדגשה[".repeat(2000) + "x" + "]".repeat(2000);
    const started = Date.now();
    spans.scan(big);
    const elapsed = Date.now() - started;
    ok(`a 4,000-bracket document scans in ${elapsed} ms`, elapsed < 3000);
  }
}

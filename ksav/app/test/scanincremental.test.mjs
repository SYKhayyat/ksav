// An edited document's scan, held to the scan of the same text from nothing.
//
// #238: a keystroke used to re-lex and re-assemble the whole document — 23 ms
// at 634 KB, on the editor's own keystroke path. `spans.ts::rescan` now lexes
// only between the newlines at rest around the edit and takes the rest of the
// old scan, the prefix as the same objects and the tail moved. That is only
// worth having if it is *exactly* the answer a fresh scan gives, so this edits
// documents at random — chained, each edit scanned from the last one's
// incremental result — and compares every field of the two scans.
//
// The edits are the ones that move the seams: newlines, brackets opened and
// closed, `#let` lines, comments that swallow what follows, backticks, escapes.

import { check, ok } from "./harness.mjs";
import * as spans from "../.tmp-test/spans.mjs";
import { sefer, table, list } from "../tools/seferfixture.mjs";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 8;
  };
}

const PIECES = [
  "א", "word", " ", "\n", "\n\n", "\t",
  "#הדגשה[", "#הערה[", "#כותרת1[", "#כותרת(רמה: 2)[", "#סימן(\"א\", [דין])",
  "#רשימה(", "פריט[", "#טבלה(עמודות: (2fr, 1fr),", "תא[", "מיזוג(2)[",
  "#let x = 1", "#set text(size: 9pt)", "#let ר = [רבי]\n",
  "[", "]", "(", ")", "{", "}", "\"", "`", "```", "//", "/*", "*/", "\\", "#", ":",
  "#הדגשה[x]", "#הערה[עיין שם]", "רש\"י", "\n#כותרת2[סימן]\n",
];

/** A scan as plain data: every field, the tree as indices. */
function plain(scan) {
  const at = new Map(scan.nodes.map((n, i) => [n, i]));
  const idx = (n) => (n ? at.get(n) ?? `foreign:${n.from}` : null);
  const nodes = scan.nodes.map((n) => {
    const o = {};
    for (const k of Object.keys(n).sort()) {
      if (k === "parent") o.parent = idx(n.parent);
      else if (k === "children") o.children = n.children.map(idx);
      else if (k === "cells") o.cells = n.cells.map(idx);
      else o[k] = n[k];
    }
    return o;
  });
  return {
    text: scan.text,
    nodes,
    roots: scan.roots.map(idx),
    comments: scan.comments,
    recoveryComments: scan.recoveryComments,
    delims: scan.delims,
    raws: scan.raws,
    strings: scan.strings,
    contentGroups: scan.contentGroups,
    byStart: [...scan.byStart].map(([k, n]) => [k, idx(n)]),
    closes: [...scan.closes],
    frames: scan.frames,
  };
}

/** The first field where two plain scans part, or null. */
function firstDifference(a, b) {
  for (const k of Object.keys(a)) {
    const x = JSON.stringify(a[k]);
    const y = JSON.stringify(b[k]);
    if (x === y) continue;
    let i = 0;
    while (i < x.length && x[i] === y[i]) i++;
    return `${k} @${i}: …${x.slice(Math.max(0, i - 60), i + 60)}… vs …${y.slice(Math.max(0, i - 60), i + 60)}…`;
  }
  return null;
}

function edit(text, next) {
  const at = next() % (text.length + 1);
  const kind = next() % 3;
  const cut = kind === 1 ? 0 : Math.min(text.length - at, next() % 8);
  const ins = kind === 2 ? "" : Array.from({ length: 1 + (next() % 3) }, () => PIECES[next() % PIECES.length]).join("");
  return text.slice(0, at) + ins + text.slice(at + cut);
}

/** Run `steps` chained random edits from `start`; return how many differed. */
function chain(name, start, seed, steps) {
  const next = rng(seed);
  spans.clearScanCache();
  let text = start;
  spans.scan(text);
  let bad = 0;
  for (let step = 0; step < steps; step++) {
    text = edit(text, next);
    const got = spans.scan(text);
    const want = spans.scanFromScratch(text);
    const diff = firstDifference(plain(got), plain(want));
    if (diff && bad++ < 3) ok(`${name}, seed ${seed}, edit ${step}: the edited scan is the fresh one`, false, diff);
  }
  return bad;
}

export async function run() {
  const docs = {
    sefer: sefer(30),
    tables: Array.from({ length: 120 }, (_, i) => `#כותרת1[${i}]\n\n${table(6)}\n${list(4)}`).join("\n"),
    configured: Array.from({ length: 300 }, (_, i) => `#let a${i} = [רבי]\n#set par(leading: 1em)\nשורה ${i} עם #הדגשה[x] ו\`קוד #הערה[לא]\` כאן // הערה\n/* חסום\nעוד */\n`).join(""),
  };
  for (const [name, doc] of Object.entries(docs)) {
    ok(`${name} is big enough to be edited incrementally`, doc.length >= 16_384, doc.length);
    let bad = 0;
    for (let seed = 1; seed <= 6; seed++) bad += chain(name, doc, seed * 7919, 60);
    check(`${name}: 360 chained edits, every scan the fresh one`, bad, 0);
  }

  // The path is taken, and taken cheaply: one edit in the middle of a large
  // document lexes a window, not the document.
  {
    spans.clearScanCache();
    const doc = sefer(200);
    const a = spans.scan(doc);
    const mid = doc.indexOf("\n", doc.length >> 1) + 1;
    const b = spans.scan(doc.slice(0, mid) + "א" + doc.slice(mid));
    ok("the prefix is the same objects", b.nodes[0] === a.nodes[0]);
    ok("the tail is moved, not shared", b.nodes[b.nodes.length - 1] !== a.nodes[a.nodes.length - 1] &&
      b.nodes[b.nodes.length - 1].from === a.nodes[a.nodes.length - 1].from + 1);
    const c = spans.scan(doc.slice(0, mid) + "ב" + doc.slice(mid));
    ok("a same-length edit shares the tail as well", c.nodes[c.nodes.length - 1] === b.nodes[b.nodes.length - 1]);
  }

  // An edit that unbalances the document is the recovery pass's, which is whole.
  {
    spans.clearScanCache();
    const doc = sefer(40);
    spans.scan(doc);
    const broken = doc.slice(0, 5000) + "#f(]" + doc.slice(5000);
    check("an unbalancing edit still scans right", firstDifference(plain(spans.scan(broken)), plain(spans.scanFromScratch(broken))), null);
  }
}

// What one keystroke and one caret move cost, at the size a sefer actually is.
//
//   npm run bench            (from ksav/app)
//
// # What this used to measure, and why it could not see anything
//
// It measured one thing — `availableAt` deciding which ribbon controls are
// enabled — on documents up to 18 KB, holding `doc` fixed in every iteration.
// Both of those made it blind.
//
// **18 KB is one twenty-eighth of a real document.** A 200-page sefer is around
// 500 KB and 8,800 syntax nodes. At the size this file used, a caret move
// reported 1.0 ms; at real scale it is 10.7 ms.
//
// **A fixed `doc` is not typing.** `scan()` is memoised, so every iteration
// after the first was a memo *hit* — which is precisely the operation that was
// broken. The memo linear-probes its slots comparing text, and while somebody is
// writing, every slot holds a document of the same length differing by one
// character, so each probe was a full comparison of half a megabyte. 0.002 ms
// with one entry, 0.435 ms with the editing set: a 200× regression on the
// operation the memo exists to make free, invisible to a benchmark that never
// changed the document.
//
// So this measures the *keystroke* as well as the caret move, at three sizes,
// and reports the shape rather than one number. What to watch for is a column
// growing faster than the document does.

import { EditorState } from "@codemirror/state";
import { foldService } from "@codemirror/language";
import { loadMany } from "./load.mjs";

const { structure, spans, headings, "ksav-lang": lang } = await loadMany([
  "structure",
  "spans",
  "headings",
  "ksav-lang",
]);

// ------------------------------------------------------------------ documents

function table(rows) {
  const body = Array.from(
    { length: rows },
    (_, r) => `  תא[א${r}], תא[ב${r}], תא[ג${r}],`,
  ).join("\n");
  return `#טבלה(עמודות: 3, פסים: true,\n${body}\n)\n`;
}

function list(items) {
  const body = Array.from({ length: items }, (_, i) => `  פריט[סעיף ${i}],`).join("\n");
  return `#רשימה(\n${body}\n)\n`;
}

/**
 * A sefer, in the shape Ksav documents are actually written in.
 *
 * Not a wall of one construct: headings, prose, notes, citations and the
 * occasional list and table, because the cost of a scan is in the *nodes* and a
 * document of nothing but table cells has a node profile no writer produces.
 */
function sefer(sections) {
  const out = [];
  for (let i = 0; i < sections; i++) {
    out.push(`#כותרת1[פרק ${i}]`, "");
    out.push(`#כותרת2[סימן ${i}]`, "");
    for (let p = 0; p < 6; p++) {
      out.push(
        `דברי הפוסקים בענין זה, ועיין ב#הדגשה[שולחן ערוך] סימן ${p}, ` +
          `ובמה שכתב שם (רש"י) בד"ה כך.#הערה[עיין שם באריכות, ${i}.${p}]`,
        "",
      );
    }
    out.push("#רשימה(", `  פריט[ראשית ${i}],`, `  פריט[שנית ${i}],`, ")", "");
    if (i % 5 === 0) out.push(table(3), "");
  }
  return out.join("\n");
}

const SIZES = [
  ["small  (~15pp)", sefer(12)],
  ["medium (~59pp)", sefer(48)],
  ["sefer  (~235pp)", sefer(190)],
];

// -------------------------------------------------------------- measurements

/**
 * Time `fn`, after warming it.
 *
 * The warm-up is not politeness, it is correctness: the first measured loop in
 * this file pays for V8 compiling everything under it, and without this the
 * *first row of the table* reported a keystroke at 92 ms and the same work
 * measured second reported 30 ms. A benchmark whose first number is three times
 * its true value is worse than no benchmark, because it will be believed.
 */
const ms = (fn, n) => {
  for (let i = 0; i < Math.max(3, n >> 2); i++) fn(i);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  return (performance.now() - t0) / n;
};

/**
 * The document with one character typed into the middle of it.
 *
 * Built with `join` rather than `a + ch + b`, and that is a measurement decision
 * rather than a style one. Concatenating long strings in V8 produces a *cons*
 * string — a tree of the pieces, flattened only when somebody walks it — so a
 * benchmark that concatenates measures the flattening as part of the scan and
 * reports the keystroke 40% more expensive than it is. CodeMirror's own
 * `doc.toString()` builds a flat string, so `join` is what the editor actually
 * hands the scanner.
 *
 * The edit is in the middle on purpose: appending is the cheap case for anything
 * that walks forward, and nobody writes a sefer by only appending.
 */
const typedInto = (doc, at, i) =>
  [doc.slice(0, at), String.fromCharCode(0x5d0 + (i % 22)), doc.slice(at)].join("");

/**
 * One keystroke: the document changes, so nothing is a memo hit.
 *
 * This is the measurement the old file had no way to make, and the one every
 * per-keystroke cost in the editor is paid against. The edit is in the *middle*
 * on purpose — appending is the cheap case for anything that walks forward.
 */
function perKeystroke(doc, n) {
  const at = Math.floor(doc.length / 2);
  return {
    // The scan itself, with the editing set in the cache — so this includes the
    // memo probe that a keystroke always pays and a fixed-document benchmark
    // never sees.
    scan: ms((i) => spans.scan(typedInto(doc, at, i)), n),
    // Everything the editor asks *after* the scan, on the same text, so these
    // are memo hits on the scan and their own work on top of it.
    rest: ms((i) => {
      const typed = typedInto(doc, at, i);
      spans.scan(typed);
      const t0 = performance.now();
      headings.headings(typed);
      structure.availableAt(typed, at);
      return performance.now() - t0;
    }, n),
  };
}

/**
 * A memo hit, with the *editing set* in the cache rather than one entry.
 *
 * Priming with three near-identical documents is not a contrivance: it is what
 * the cache holds while somebody types — the previous keystroke, the current
 * text, and the speculatively healed copy the compiler was handed beside it.
 */
function perMemoHit(doc, n) {
  const at = Math.floor(doc.length / 2);
  spans.clearScanCache();
  // **Same length**, one character different. That detail is the whole
  // measurement: `===` on two strings of different lengths is a length check and
  // returns immediately, so priming with an *insertion* measures nothing and
  // reports the probe as free. What a writer's cache actually holds is documents
  // that differ by a substitution somewhere in the middle — the character just
  // overtyped, the speculatively healed copy — and comparing those runs to the
  // first difference.
  for (let i = 1; i <= 3; i++) {
    spans.scan(doc.slice(0, at) + String.fromCharCode(0x5d0 + i) + doc.slice(at + 1));
  }
  spans.scan(doc);
  return ms(() => spans.scan(doc), n);
}

/** One caret move: the scan is warm, and only the position changed. */
function perCaretMove(doc, pos, n) {
  structure.availableAt(doc, pos);
  // Alternating positions, because a caret that never moves is not a caret move:
  // this has to defeat any memo keyed on the position as well as the document.
  return ms((i) => structure.availableAt(doc, pos + (i % 2)), n);
}

/**
 * One fold query, at the **last** heading in the document.
 *
 * The worst case on purpose, and compared across sizes rather than against the
 * first heading: a first-versus-last ratio inside one document is two sub-
 * microsecond numbers divided by each other, which is noise wearing a
 * measurement's clothes. Read down the column instead — the same query on a
 * document four times the size should cost about the same, and under the old
 * per-line walk it cost sixteen times as much.
 */
function foldAtEnd(doc) {
  const state = EditorState.create({ doc, extensions: [lang.ksavFold] });
  const service = state.facet(foldService)[0];
  const last = doc.lastIndexOf("#כותרת1[פרק ");
  const line = state.doc.lineAt(last);
  return ms(() => service(state, line.from, line.to), 500);
}

// ------------------------------------------------------------------- the runs

const KB = (s) => (s.length / 1024).toFixed(0).padStart(4) + " KB";

console.log("\nOne keystroke, one memo hit, one caret move — at three sizes.\n");
console.log(
  "document".padEnd(16) +
    "size".padStart(8) +
    "nodes".padStart(7) +
    "scan".padStart(10) +
    "+asks".padStart(9) +
    "memo hit".padStart(11) +
    "caret".padStart(9) +
    "fold@end".padStart(11),
);

for (const [name, doc] of SIZES) {
  const nodes = spans.scan(doc).nodes.length;
  const n = doc.length > 200_000 ? 20 : 60;
  const pos = doc.indexOf("סימן 3");
  const key = perKeystroke(doc, n);
  console.log(
    name.padEnd(16) +
      KB(doc).padStart(8) +
      String(nodes).padStart(7) +
      (key.scan.toFixed(1) + "ms").padStart(10) +
      (key.rest.toFixed(1) + "ms").padStart(9) +
      (perMemoHit(doc, 2000).toFixed(3) + "ms").padStart(11) +
      (perCaretMove(doc, pos, n * 4).toFixed(2) + "ms").padStart(9) +
      (foldAtEnd(doc).toFixed(3) + "ms").padStart(11),
  );
}

// `fold@end` is the column that catches the shape, not the size: it is the same
// query in every row, at the *last* heading of the document. The section fold
// used to ask every line from there to the end of the document what level it
// was, restarting a walk over every node each time, so this column grew with the
// square of the document. It should now be flat.

// ------------------------------------------------- and the original question
//
// `availableAt` used to decide which controls are enabled by *running* every
// operation — eighteen table layouts, eighteen re-renders and eighteen copies of
// the document, per arrow key: quadratic in the table times eighteen, 93 ms on a
// six-hundred-row table, the caret lagging the keyboard in the one place a
// writer holds an arrow key down. Kept because it is the reason this file
// exists, and because the ratio is what says the `can`/`run` split is still
// intact.

function perMoveDoing(doc, pos, n) {
  const kind = structure.structureAt(doc, pos);
  const here = structure.STRUCTURE_ACTIONS.filter((a) => a.structure === kind);
  here.forEach((a) => a.run(doc, pos));
  return ms((i) => here.forEach((a) => a.run(doc, pos + (i % 2))), n);
}

const SHAPES = [
  ["table, 100 rows", table(100), (d) => d.indexOf("ב50")],
  ["table, 600 rows", table(600), (d) => d.indexOf("ב300")],
  ["list, 600 items", list(600), (d) => d.indexOf("סעיף 300")],
];

console.log("\nAsking versus doing, in the structures that get big.\n");
// Every "asking" measurement first, and only then the "doing" ones: performing
// eighteen operations allocates eighteen copies of the document per iteration,
// and the garbage that leaves behind lands on whatever is measured next. The
// first version of this file interleaved them and reported a caret move as
// twenty times more expensive than it is.
const runs = SHAPES.map(([name, doc, at]) => {
  const pos = at(doc);
  const n = doc.length > 40000 ? 50 : 400;
  return { name, doc, pos, n, asking: perCaretMove(doc, pos, n) };
});
for (const r of runs) r.doing = perMoveDoing(r.doc, r.pos, Math.max(5, r.n / 10));

for (const r of runs) {
  const offered = structure.availableAt(r.doc, r.pos).length;
  console.log(
    `${r.name.padEnd(16)}${KB(r.doc).padStart(8)}  ` +
      `${r.asking.toFixed(3).padStart(8)} ms/caret move   ${offered} controls   ` +
      `×${(r.doing / r.asking).toFixed(0).padStart(3)} cheaper than doing them`,
  );
}
console.log();

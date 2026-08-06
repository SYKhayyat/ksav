// What one caret move costs the contextual ribbon.
//
//   node tools/bench-structure.mjs
//
// The number this exists to keep honest: `availableAt` decides which controls
// are enabled, and it used to decide by *running* every operation — eighteen
// table layouts, eighteen re-renders and eighteen copies of the document, per
// arrow key. That is quadratic in the table (`render` walked the cell list once
// per row) times eighteen, which on a six-hundred-row table was 93 ms: the caret
// lagging the keyboard in the one place a writer holds an arrow key down.
//
// Run it against a commit and against its parent to compare; the shape to watch
// for is the cost growing faster than the table.

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

async function load(name) {
  const dir = mkdtempSync(join(tmpdir(), "ksav-bench-"));
  try {
    const out = join(dir, `${name}.mjs`);
    await build({
      entryPoints: [join(APP, "src", `${name}.ts`)],
      outfile: out,
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
    });
    return await import(pathToFileURL(out).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const structure = await load("structure");

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

function headings(sections) {
  return Array.from(
    { length: sections },
    (_, i) => `#כותרת2[סימן ${i}]\n\nטקסט הסימן הזה, שורה אחת.\n`,
  ).join("\n");
}

/** Milliseconds per caret move, with the scan already warm — an arrow key. */
function perMove(doc, pos, n) {
  structure.availableAt(doc, pos);
  const t0 = performance.now();
  // Alternating positions, because a caret that never moves is not a caret move:
  // this has to defeat any memo keyed on the position as well as the document.
  for (let i = 0; i < n; i++) structure.availableAt(doc, pos + (i % 2));
  return (performance.now() - t0) / n;
}

const CASES = [
  ["table, 20 rows", table(20), (d) => d.indexOf("ב10")],
  ["table, 100 rows", table(100), (d) => d.indexOf("ב50")],
  ["table, 200 rows", table(200), (d) => d.indexOf("ב100")],
  ["table, 600 rows", table(600), (d) => d.indexOf("ב300")],
  ["list, 200 items", list(200), (d) => d.indexOf("סעיף 100")],
  ["list, 600 items", list(600), (d) => d.indexOf("סעיף 300")],
  ["300 sections", headings(300), (d) => d.indexOf("סימן 150")],
];

/** What the same caret move costs if every operation is actually performed. */
function perMoveDoing(doc, pos, n) {
  const kind = structure.structureAt(doc, pos);
  const here = structure.STRUCTURE_ACTIONS.filter((a) => a.structure === kind);
  here.forEach((a) => a.run(doc, pos));
  const t0 = performance.now();
  for (let i = 0; i < n; i++) here.forEach((a) => a.run(doc, pos + (i % 2)));
  return (performance.now() - t0) / n;
}

// Every "asking" measurement first, and only then the "doing" ones: performing
// eighteen operations allocates eighteen copies of the document per iteration,
// and the garbage that leaves behind lands on whatever is measured next. The
// first version of this file interleaved them and reported a caret move as
// twenty times more expensive than it is.
const runs = CASES.map(([name, doc, at]) => {
  const pos = at(doc);
  const n = doc.length > 40000 ? 50 : 400;
  return { name, doc, pos, n, asking: perMove(doc, pos, n) };
});

for (const r of runs) r.doing = perMoveDoing(r.doc, r.pos, Math.max(5, r.n / 10));

for (const r of runs) {
  const offered = structure.availableAt(r.doc, r.pos).length;
  console.log(
    `${r.name.padEnd(16)} ${(r.doc.length / 1024).toFixed(0).padStart(4)} KB  ` +
      `${r.asking.toFixed(3).padStart(8)} ms/caret move   ${offered} controls   ` +
      `×${(r.doing / r.asking).toFixed(0).padStart(3)} cheaper than doing them`,
  );
}

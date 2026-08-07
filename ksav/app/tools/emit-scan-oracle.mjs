// What `src/spans.ts` believes about every document in the repository — for
// Typst's own parser to contradict.
//
// # Why
//
// `spans.ts` is the editor's scanner and it cannot be replaced at runtime:
// `proseMode` is a `StateField` whose decorations must come out of
// `EditorState` synchronously, and `insertionAt` decides whether to write a `#`
// inside the same click handler that dispatches the edit. Neither can await an
// engine round trip.
//
// But the *parser* is not the compiler. `typst::syntax::Source::detached`
// parses with no world, no fonts and no layout, and the engine has depended on
// it all along. So the scanner cannot be replaced — and it can be **checked**,
// here, against the only authority that exists.
//
// The bug that makes this worth a fixture: a bare `(` in markup opened *code*,
// so `(רש"י)` — the commonest construction in the language — put the gershayim
// into a string literal and the speculative heal rewrote the writer's document
// around a bracket nobody opened. Fourteen unit tests of the scanner passed,
// because every one of them was written by somebody who already believed the
// rule. An oracle does not have to think of the parenthesis.
//
//   node tools/emit-scan-oracle.mjs          # rewrite the fixture
//   node tools/emit-scan-oracle.mjs --check  # fail if it is stale
//
// `npm test` runs the --check form; `cargo test --test scan_oracle` is the
// oracle itself. The staleness check is what makes the pair work: change
// `spans.ts` and this file no longer matches, so the regeneration is forced and
// the next `cargo test` compares the *new* beliefs against Typst.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runAsScript } from "./generated.mjs";
import { load } from "./load.mjs";
import { ENGINE, SRC } from "./paths.mjs";

const OUT = join(ENGINE, "tests", "fixtures", "scan-oracle.json");

const { scan, ctxAt } = await load("spans");

/**
 * The two documents a writer meets before they have written anything.
 *
 * Read out of `main.ts` rather than restated, the same way
 * `tests/spell_en.rs` reads them — a second copy of the starter would be a
 * document the oracle checks and the product does not ship.
 */
function starters() {
  const src = readFileSync(join(SRC, "main.ts"), "utf8");
  const out = [];
  for (const name of ["STARTER_HE", "STARTER_EN"]) {
    const at = src.indexOf(`const ${name} = \``);
    if (at < 0) throw new Error(`${name} is not in main.ts`);
    const from = src.indexOf("`", at) + 1;
    let to = from;
    while (to < src.length && !(src[to] === "`" && src[to - 1] !== "\\")) to++;
    // The literal is a template string: `\`` and `\${` are the only escapes a
    // Ksav document can plausibly contain in one.
    out.push([`starter:${name}`, src.slice(from, to).replace(/\\`/g, "`").replace(/\\\$/g, "$")]);
  }
  return out;
}

/**
 * The documents that broke, kept as documents.
 *
 * The corpus below is generated, and that is its whole value — nobody chose it,
 * so it does not share the author's blind spot. But a generated corpus only
 * contains what the generators happen to produce, and the sentence that started
 * this — `(רש"י)` — is not in any template, because a template is written by
 * somebody who is not currently making the mistake.
 *
 * So the bug reports live here as text. Each of these is a construction a
 * writer typed; two of them are from the audit that produced this file, and the
 * gershayim ones are the whole reason the string comparison in
 * `scan_oracle.rs` is checked in both directions.
 */
const REGRESSIONS = {
  "paren-gershayim": "פסק כדברי (רש\"י) ולא כדברי הרמב\"ם, עיין שם.",
  "paren-gershayim-in-item": "#רשימה(\n  פריט[דברי (רש\"י) כאן],\n  פריט[שני],\n)",
  "paren-gershayim-in-body": "#הדגשה[שו\"ע או\"ח (סימן א׳) סעיף ב׳]",
  "paren-opens-a-line": "(א) ראשית הכל.\n(ב) ואחר כך.",
  "gershayim-then-comma": "#טבלה(עמודות: 2,\n  תא[ע\"א], תא[ע\"ב],\n)",
  "string-and-gershayim-together": "#סימן(\"א\", [דיני רש\"י ותוספות])",
  "escaped-bracket-in-prose": "אלף \\] בית [גימל] דלת",
  "comment-inside-a-body": "#הדגשה[אלף]\n// הערה על השורה\nבית",
  "let-then-prose": "#let ר = [רבי]\n#ר יוחנן אמר (בגמרא) כך.",
  "math-beside-prose": "הנוסחה $x^2 + 1$ ואחריה (הסבר) בעברית.",
};

/** `[id, text]` for every document the oracle sweeps. */
function corpus() {
  const docs = Object.entries(REGRESSIONS).map(([k, t]) => [`regression:${k}`, t]);

  const templates = join(ENGINE, "templates");
  for (const f of readdirSync(templates).sort()) {
    if (f.endsWith(".ksav")) docs.push([`template:${f}`, readFileSync(join(templates, f), "utf8")]);
  }

  docs.push(...starters());

  const fixtures = join(ENGINE, "tests", "fixtures");
  docs.push([
    "fixture:girsa-buffer.ksav",
    readFileSync(join(fixtures, "girsa-buffer.ksav"), "utf8"),
  ]);

  // The insertion grid: every command the UI offers, spliced into every kind of
  // caret position. This is the part that makes the sweep worth having — 1,035
  // documents nobody wrote by hand, which is exactly the property the scanner's
  // own unit tests lack.
  //
  // Only the cases the product says are legal. An illegal one is a document
  // Typst error-recovers through, and a recovered tree is not an oracle; the
  // *reason* those are illegal is already asserted by `insertion.rs`.
  const insertions = JSON.parse(readFileSync(join(fixtures, "insertions.json"), "utf8"));
  for (const c of insertions.cases) {
    if (c.legal) docs.push([`insertion:${c.ctx}:${c.cmd}`, c.source]);
  }

  // Everything the two other generators write, for the same reason: it is
  // markup the application produced rather than markup a person chose.
  for (const [file, key] of [
    ["note-layouts.json", "id"],
    ["structure-edits.json", "name"],
  ]) {
    const j = JSON.parse(readFileSync(join(fixtures, file), "utf8"));
    for (const c of j.cases) docs.push([`${file.replace(".json", "")}:${c[key]}`, c.source]);
  }

  return docs;
}

/** Merge touching or overlapping ranges, which the run-length walk below emits. */
function merge(ranges) {
  const out = [];
  for (const [from, to] of ranges) {
    const last = out[out.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/**
 * What the scanner says about one document.
 *
 * Offsets are UTF-16 units, which is what a JavaScript string index *is*; the
 * Rust side converts once per document rather than this side pretending to
 * count bytes.
 */
function beliefs(text) {
  const s = scan(text);
  const code = [];
  for (let i = 0; i < text.length; i++) {
    if (ctxAt(s, i) !== "code") continue;
    const last = code[code.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else code.push([i, i + 1]);
  }
  return {
    code: merge(code),
    // Contents only, without the quotes — which is what `Scan.strings` holds.
    strings: s.strings.map((g) => [g.from, g.to]),
    comments: s.comments.map((c) => [c.from, c.to]),
    groups: s.contentGroups.map((g) => [g.from, g.to]),
  };
}

export function buildFixture() {
  const docs = corpus().map(([id, text]) => ({ id, text, ...beliefs(text) }));
  // One document per line, and no indentation inside it. The other generators
  // pretty-print, because a note layout or an insertion is something a person
  // reads when a test fails. This one is a thousand documents' worth of integer
  // ranges: indented it is 661 KB and every regeneration is an unreadable diff
  // either way, so the line is the unit and `grep` is the reader.
  const note = "generated by app/tools/emit-scan-oracle.mjs — what src/spans.ts believes";
  return `{\n "note": ${JSON.stringify(note)},\n "docs": [\n${docs
    .map((d) => "  " + JSON.stringify(d))
    .join(",\n")}\n ]\n}\n`;
}

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, buildFixture(), "scan-oracle.json"]];

runAsScript(import.meta.url, OUTPUTS, "scan oracle", "node tools/emit-scan-oracle.mjs");

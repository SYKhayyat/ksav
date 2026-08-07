// Every command the UI offers, inserted at every kind of caret position, as the
// app's own insertion path would write it — for the engine to compile.
//
// This is the fence for the worst bug the product has had. A writer put the
// caret between two list items and pressed the bullet button, and the document
// blanked. It was not one bug: sweeping the whole grid — every registry snippet
// against every kind of position a caret can be in — **384 of 1,026 documents
// would not compile**, including three positions where *every command without
// exception* was broken. `engine/tests/registry.rs` missed all of it, because it
// compiles each snippet standalone and in three fixed nestings; it never asks
// what happens when one is spliced into the middle of an argument list, which is
// where the writer actually was.
//
// So the grid is the test. It runs in a few seconds and it would have caught
// every one of those on the day they were written.
//
// Both directions are asserted, and the second matters as much as the first:
//   - a case the product says is legal must compile
//   - a case the product greys out must genuinely fail
// Without the second, greying everything would turn the suite green.
//
//   node tools/emit-insertion-fixtures.mjs          # rewrite the fixture
//   node tools/emit-insertion-fixtures.mjs --check  # fail if it is stale
//
// `npm test` runs the --check form; `cargo test --test insertion` compiles it.

// Through esbuild's JS API, not by running `node node_modules/esbuild/bin/esbuild`:
// that path is a JavaScript shim on Windows and the **native executable** on Linux,
// where npm's platform package overwrites it — so handing it to `node` threw
// `SyntaxError: Invalid or unexpected token` and took the editor job in CI down on
// every push, while working perfectly on the machine that wrote it. `card.mjs` and
// `test/run.mjs` had always imported `build` from "esbuild"; this is the same thing.
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runAsScript } from "./generated.mjs";
import { commands } from "./commands.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..");
const OUT = join(APP, "..", "engine", "tests", "fixtures", "insertions.json");

/**
 * Every kind of place a caret can be, with `@` marking it.
 *
 * Nine, and they are not arbitrary: three of them (`list-between-items`,
 * `list-after-open`, `table-between-cells`) are the code-mode positions where
 * the editor used to be broken for all 114 commands, and the rest are the
 * ordinary places a writer stands — mid-word in prose, inside a heading, inside
 * a note, inside a cell, and two levels down.
 */
export const CONTEXTS = {
  prose: "שורה של פרוזה ובה מלים@אחרות להמשך.",
  "heading-body": "#כותרת1[פרק @ראשון]\n\nגוף.",
  "note-body": "טקסט#הערה[הערה @פנימית] המשך.",
  "list-in-item": "#רשימה(\n  פריט[ראשון @כאן],\n  פריט[שני],\n)",
  "list-between-items": "#רשימה(\n  פריט[ראשון],@\n  פריט[שני],\n)",
  "list-after-open": "#רשימה(@\n  פריט[ראשון],\n  פריט[שני],\n)",
  "table-in-cell": "#טבלה(עמודות: (1fr, 1fr),\n  תא[אחד @כאן], תא[שתים],\n)",
  "table-between-cells": "#טבלה(עמודות: (1fr, 1fr),\n  תא[אחד],@ תא[שתים],\n)",
  "nested-deep": "#רשימה(\n  פריט[ראשון #הערה[בהערה @כאן] סוף],\n)",
};

/**
 * What a writer would plausibly type into each command's caret slot.
 *
 * Left empty for most: an empty body is the state the document is in one
 * keystroke after the click, which is exactly the state that used to blank the
 * page. A few slots are not prose and a Hebrew word in them would be a real
 * mistake about a real argument — those get something the command can use.
 */
const SAMPLE = {
  נוסחה: "x^2 + 1",
  נוסחה_בשורה: "x^2 + 1",
  כלול: "",
};

/** Build a `src/*.ts` module to something node can import. */
async function load(name) {
  const dir = mkdtempSync(join(tmpdir(), "ksav-fixtures-"));
  try {
    const out = join(dir, name + ".mjs");
    await build({
      entryPoints: [join(APP, "src", name + ".ts")],
      outfile: out,
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
    });
    return await import(pathToFileURL(out).href);
  } finally {
    // The import above is async and the directory is read synchronously by it;
    // deleting here is safe because esbuild has already written the file and
    // node has it open.
    setTimeout(() => rmSync(dir, { recursive: true, force: true }), 2000).unref?.();
  }
}

/**
 * The registry, read from the engine source rather than a running server.
 *
 * From `tools/commands.mjs`. This used to be a fourth implementation of the
 * same read — the two test files' regex minus one group — and the whole point
 * of this generator is that a registry command and the insertion path must not
 * be able to disagree. Two readers of the registry is that disagreement one
 * level up.
 *
 * Imported *and* re-exported: `export … from` creates no local binding, so
 * `buildFixture` below would not have seen it.
 */
export { commands };

export async function buildFixture() {
  const { insertionAt, legalAt } = await load("mode");
  const all = commands();
  const cases = [];
  for (const [ctx, tpl] of Object.entries(CONTEXTS)) {
    const at = tpl.indexOf("@");
    const doc = tpl.replace("@", "");
    for (const c of all) {
      const snippet = insertionAt(doc, at, c.insert);
      const body = SAMPLE[c.he] ?? "";
      const clean = snippet.replace("|", body);
      const legality = legalAt(doc, at, c.he);
      const source = doc.slice(0, at) + clean + doc.slice(at);
      cases.push({
        ctx,
        cmd: c.he,
        // The English pair, carried so `insertion.rs` can check both spellings
        // resolve. `registry.rs` used to hold that check and a skip list beside
        // it; the skip list is gone and the check moved here, where the grid it
        // belongs to already is.
        en: c.en,
        legal: legality.ok,
        reason: legality.reason ?? null,
        source,
      });
    }
  }
  return JSON.stringify(
    { note: "generated by app/tools/emit-insertion-fixtures.mjs", cases },
    null,
    1,
  );
}

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, await buildFixture(), "insertions.json"]];

runAsScript(import.meta.url, OUTPUTS, "insertion fixtures", "node tools/emit-insertion-fixtures.mjs");

// Build the modules under test, then run every test file.
//
// The old script built exactly one module by name and ran exactly one test
// file. Adding a second test meant editing package.json, which is a small
// friction that reliably compounds into "one test file for fifteen modules".
// This builds whatever `MODULES` lists and runs whatever `test/*.test.mjs`
// exists, so adding a test is adding a file.

import { build } from "esbuild";
import { readdir, rm, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { buildableModules } from "./modules.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const APP = path.resolve(HERE, "..");
const OUT = path.join(APP, ".tmp-test");

/**
 * The modules a test may import. Bundled, so their own imports come along.
 *
 * Read off `src/` rather than written out, because a hand-written list is a
 * second statement of what the application consists of and it drifted: it named
 * 43 of 62 modules, and the nineteen it left out had no test between them.
 * `test/modules.mjs` holds the two exemptions and `runner.test.mjs` checks both
 * of them against reality.
 */
const MODULES = buildableModules(path.join(APP, "src"));

await rm(OUT, { recursive: true, force: true });

await build({
  entryPoints: MODULES.map((m) => path.join(APP, "src", `${m}.ts`)),
  outdir: OUT,
  outExtension: { ".js": ".mjs" },
  format: "esm",
  bundle: true,
  // One copy of each module across the whole build, not one per entry point.
  //
  // Without this esbuild inlines a private copy of every dependency into every
  // entry, so `.tmp-test/exports.mjs` and `.tmp-test/runtime.mjs` held two
  // different `runtime` singletons and a test could not put a document in front
  // of the module it was testing. Every cross-module fact in the application —
  // the editor, the backend, the last compile, the open document, all of which
  // live in exactly one place at runtime — was therefore untestable, silently:
  // the calls succeed, they just land on a different copy. Code splitting makes
  // the test build agree with the shipped one, where there is one of each.
  splitting: true,
  platform: "neutral",
  // Nothing under test imports these, and pulling them in would make a unit
  // test of a data module depend on the whole editor.
  external: ["@codemirror/*", "@lezer/*", "@tauri-apps/*"],
  logLevel: "warning",
});

const files = (await readdir(HERE)).filter((f) => f.endsWith(".test.mjs")).sort();

// The harness keeps one running tally across every file, so a test that forgets
// to report cannot hide a failure.
const { counts, resetStorage } = await import(pathToFileURL(path.join(HERE, "harness.mjs")).href);

for (const f of files) {
  const mod = await import(pathToFileURL(path.join(HERE, f)).href);
  if (typeof mod.run !== "function") {
    console.log(`FAIL ${f} exports no run()`);
    process.exit(1);
  }
  const before = counts();
  await resetStorage();
  await mod.run();
  const after = counts();
  const failed = after.fail - before.fail;
  console.log(
    `${failed ? "✗" : "✓"} ${f.padEnd(24)} ${after.pass - before.pass} passed` +
      (failed ? `, ${failed} FAILED` : ""),
  );
}

const { pass, fail } = counts();
console.log(`\n${files.length} files · ${pass} passed, ${fail} failed`);

// ------------------------------------------- the two numbers only this knows
//
// `ksav/README.md` tells a developer what to expect from `npm test`, and told
// them "389 assertions across 9 files" for as long as there were 2,723 across
// 44. Every other counted claim is fenced by `documentation.test.mjs`, which
// cannot fence these two: how many assertions the suite runs is knowable only
// once it has run, and that file runs *inside* it. So the check lives where the
// answer is, after the tally — and deliberately outside it, because an assertion
// that counts itself is a number that can never settle.
//
// Skipped when something already failed: a red suite has a better thing to say.
if (!fail) {
  const { CLAIMS, RUNTIME, group, livingPages, numericClaimsIn, ROOT } = await import(
    pathToFileURL(path.join(HERE, "docfacts.mjs")).href
  );
  const measured = { appAssertions: pass + fail, appTestFiles: files.length };
  const wrong = [];
  // Forward: each declared claim must be spelled with the number this run got.
  for (const [file, factName, text] of CLAIMS) {
    if (!RUNTIME.includes(factName)) continue;
    const want = text(measured[factName]);
    const body = await readFile(path.join(ROOT, file), "utf8");
    if (!body.includes(want)) wrong.push(`${file} does not say "${want}"`);
  }
  // Backward: and no living page may state a *different* one somewhere else.
  // `documentation.test.mjs`'s sweep has to wave these two through — it cannot
  // know what the right answer is — so the second sentence in `ksav/README.md`
  // that quotes an assertion count is checked here or nowhere.
  for (const file of livingPages()) {
    const body = await readFile(path.join(ROOT, file), "utf8");
    for (const c of numericClaimsIn(body)) {
      if (!RUNTIME.includes(c.fact)) continue;
      if (c.number !== measured[c.fact]) wrong.push(`${file}: "${c.said}" — it was ${group(measured[c.fact])}`);
    }
  }
  if (wrong.length) {
    console.log(`\n✗ the documentation disagrees with this run:`);
    for (const w of wrong) console.log(`  ${w}`);
    console.log(`  (${group(measured.appAssertions)} assertions across ${measured.appTestFiles} files)`);
    process.exit(1);
  }
}

process.exit(fail ? 1 : 0);

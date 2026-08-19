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
import { APP, TEST as HERE, SRC, TMP_TEST as OUT } from "../tools/paths.mjs";
import { staleOutputs } from "../tools/generated.mjs";

/**
 * Which test files to run — `npm test -- panels` runs `panels.test.mjs`.
 *
 * There was no way to do this at all. The inner loop was the whole suite,
 * always, which is a real tax on the one activity a suite exists to support:
 * changing one module and asking whether it still works. Substring match rather
 * than exact, because `panels`, `panels.test` and `panels.test.mjs` are all what
 * somebody means.
 *
 * A filter narrows the *run*, so the two things that describe the whole suite —
 * the assertion tally and the documentation fence over it — are skipped and say
 * so. A partial run reporting a total would be a worse number than none.
 */
const FILTER = process.argv.slice(2).filter((a) => !a.startsWith("-"));

/**
 * The generated files, checked in this process.
 *
 * `package.json` used to chain five `node tools/emit-*.mjs --check` calls in
 * front of the suite with `&&`. Six process spawns, and on Windows they cost
 * **~7.8 s of the 14.2 s warm inner loop — 55% of it** — to do work that is a
 * string comparison. They are imports now; each generator exports its `OUTPUTS`
 * and keeps a footer so `node tools/emit-engine.mjs` still rewrites by hand.
 */
const GENERATORS = [
  ["services", "emit-services.mjs"],
  ["engine facts", "emit-engine.mjs"],
  ["note fixtures", "emit-note-fixtures.mjs"],
  ["structure fixtures", "emit-structure-fixtures.mjs"],
  ["insertion fixtures", "emit-insertion-fixtures.mjs"],
  ["note insertion fixtures", "emit-note-insertion-fixtures.mjs"],
  ["scan oracle", "emit-scan-oracle.mjs"],
  // What a `.ksav` file *is*, for the engine's second reader of it to be held
  // to. Both sides of that format now have an implementation, and the CLI
  // compiled the JSON wrapper as prose for as long as only one of them did.
  ["docfile oracle", "emit-docfile-oracle.mjs"],
  // The fifth target for one registry: `editors/emacs/ksav-services.el`. The
  // elisp cannot import `services.gen.ts`, so it gets its own generated copy
  // rather than a hand-written fifth list — see the header of
  // `tools/emit-emacs.mjs` for what the previous four cost.
  ["emacs services", "emit-emacs.mjs"],
  // The asset names a release attaches, which `release.yml` reads as its build
  // matrix and `ksav-release.el` is generated from — a workflow that uploads
  // files and elisp that downloads them, agreeing by construction rather than
  // by somebody noticing a 404.
  ["release assets", "emit-release-assets.mjs"],
];

/**
 * The modules a test may import. Bundled, so their own imports come along.
 *
 * Read off `src/` rather than written out, because a hand-written list is a
 * second statement of what the application consists of and it drifted: it named
 * 43 of 62 modules, and the nineteen it left out had no test between them.
 * `test/modules.mjs` holds the two exemptions and `runner.test.mjs` checks both
 * of them against reality.
 */
const MODULES = buildableModules(SRC);

// Before anything else, because a stale generated file makes every downstream
// failure a mystery: the suite is testing a copy of the engine's facts that the
// engine has stopped agreeing with.
{
  const stale = [];
  for (const [what, file] of GENERATORS) {
    const { OUTPUTS } = await import(pathToFileURL(path.join(APP, "tools", file)).href);
    for (const label of staleOutputs(OUTPUTS)) stale.push([label, file, what]);
  }
  if (stale.length) {
    console.log("✗ generated files are stale:");
    for (const [label, file] of stale) console.log(`  ${label} — run: node tools/${file}`);
    process.exit(1);
  }
}

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

const all = (await readdir(HERE)).filter((f) => f.endsWith(".test.mjs")).sort();
const files = FILTER.length ? all.filter((f) => FILTER.some((q) => f.includes(q))) : all;
if (FILTER.length && !files.length) {
  console.log(`no test file matches ${FILTER.join(" ")} — of ${all.length}`);
  process.exit(1);
}

// The harness keeps one running tally across every file, so a test that forgets
// to report cannot hide a failure.
const { counts, resetStorage, summary } = await import(
  pathToFileURL(path.join(HERE, "harness.mjs")).href
);

/** Files whose `run()` threw rather than reporting. */
const thrown = [];

/**
 * Files whose `run()` returned having asserted nothing at all.
 *
 * The quietest failure a suite has. A file that reports no assertions cannot go
 * red — it is a green tick beside a name, in a list of green ticks, and it looks
 * exactly like a file that passed. Every way of getting there is a defect: a
 * `run()` that returns early, a loop over a fixture that arrived empty, a
 * condition that is false on this machine.
 *
 * This is the editor's half of the rule the engine's tests hold with a counted
 * floor (`assert!(checked > 0)`): a check that cannot run must fail, not pass.
 */
const silent = [];

for (const f of files) {
  const mod = await import(pathToFileURL(path.join(HERE, f)).href);
  if (typeof mod.run !== "function") {
    console.log(`FAIL ${f} exports no run()`);
    process.exit(1);
  }
  const before = counts();
  await resetStorage();
  // Contained.
  //
  // This was a bare `await mod.run()`, and a *thrown* test — not a failed
  // assertion, a `TypeError` — unwound into an unhandled rejection, killed all
  // sixty files, and skipped the documentation fence below because that sits
  // inside `if (!fail)`. It is not hypothetical: `coverage.test.mjs:102-108`
  // does `ok(…, !!filter)` and then immediately `filter[1].replace(…)`, so
  // renaming a local in `main.ts` takes the whole suite down with a stack trace
  // instead of one named failure. It happened twice while this report was being
  // answered, both times from a test written to check that a fix worked.
  //
  // A throw is now one file's problem, counted as a failure, with the other
  // fifty-nine still reported.
  let threw = null;
  try {
    await mod.run();
  } catch (e) {
    threw = e;
    thrown.push(f);
  }
  const after = counts();
  const failed = after.fail - before.fail + (threw ? 1 : 0);
  const said = after.pass - before.pass + (after.fail - before.fail);
  if (!threw && said === 0) silent.push(f);
  console.log(
    `${failed || (!threw && said === 0) ? "✗" : "✓"} ${f.padEnd(24)} ${after.pass - before.pass} passed` +
      (failed ? `, ${failed} FAILED` : "") +
      (!threw && said === 0 ? " — ASSERTED NOTHING" : ""),
  );
  if (threw) console.log(`  threw: ${threw?.stack ?? threw}`);
}

const { pass, fail } = counts();
const broke = thrown.length;
// Through the harness, which is where that sentence lives. This file wrote it
// out by hand while `harness.mjs` exported an uncalled `summary()` saying the
// same thing with a different separator — the 9 August report's `delete` list,
// answered with the caller rather than the removal.
console.log("");
summary(`${files.length} files`, broke ? `${broke} threw` : "");
if (broke) console.log(`  threw: ${thrown.join(", ")}`);
if (silent.length) {
  console.log(`\n✗ ${silent.length} file(s) asserted nothing: ${silent.join(", ")}`);
  console.log(
    "  A file that reports no assertions cannot go red. Whatever it was going to",
  );
  console.log(
    "  check, it did not — an empty fixture, an early return, or a condition that",
  );
  console.log("  is false on this machine. Say what was absent, and fail on it.");
}

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
// Skipped on a filtered run too, and this is not a convenience — the numbers
// describe *the whole suite*, and checking a partial tally against the
// documentation would fail every single-file run and teach everybody to ignore
// the one fence that catches a stale count.
if (!fail && !broke && !silent.length && !FILTER.length) {
  const { CLAIMS, RUNTIME, group, livingPages, numericClaimsIn, says, ROOT } = await import(
    pathToFileURL(path.join(HERE, "docfacts.mjs")).href
  );
  const measured = { appAssertions: pass + fail, appTestFiles: files.length };
  const wrong = [];
  // Forward: each declared claim must be spelled with the number this run got.
  for (const [file, factName, text] of CLAIMS) {
    if (!RUNTIME.includes(factName)) continue;
    const want = text(measured[factName]);
    const body = await readFile(path.join(ROOT, file), "utf8");
    if (!says(body, want)) wrong.push(`${file} does not say "${want}"`);
  }
  // Backward: and no living page may state a *different* one somewhere else.
  // `documentation.test.mjs`'s sweep has to wave these two through — it cannot
  // know what the right answer is — so the second sentence in `ksav/README.md`
  // that quotes an assertion count is checked here or nowhere.
  for (const file of livingPages()) {
    const body = await readFile(path.join(ROOT, file), "utf8");
    for (const c of numericClaimsIn(body)) {
      // A noun can name more than one fact; only the runtime ones are this
      // run's business, and a claim about any of them has to match.
      for (const f of c.facts) {
        if (!RUNTIME.includes(f)) continue;
        if (c.number !== measured[f]) wrong.push(`${file}: "${c.said}" — it was ${group(measured[f])}`);
      }
    }
  }
  if (wrong.length) {
    console.log(`\n✗ the documentation disagrees with this run:`);
    for (const w of wrong) console.log(`  ${w}`);
    console.log(`  (${group(measured.appAssertions)} assertions across ${measured.appTestFiles} files)`);
    process.exit(1);
  }
}

if (FILTER.length) {
  console.log(`(filtered to ${FILTER.join(" ")} — the documentation fence needs a full run)`);
}

process.exit(fail || broke || silent.length ? 1 : 0);

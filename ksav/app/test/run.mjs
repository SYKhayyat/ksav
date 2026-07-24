// Build the modules under test, then run every test file.
//
// The old script built exactly one module by name and ran exactly one test
// file. Adding a second test meant editing package.json, which is a small
// friction that reliably compounds into "one test file for fifteen modules".
// This builds whatever `MODULES` lists and runs whatever `test/*.test.mjs`
// exists, so adding a test is adding a file.

import { build } from "esbuild";
import { readdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const APP = path.resolve(HERE, "..");
const OUT = path.join(APP, ".tmp-test");

/** The modules a test may import. Bundled, so their own imports come along. */
const MODULES = ["brackets", "docs", "store", "markdown", "review", "styles", "table", "spell", "typst-escape"];

await rm(OUT, { recursive: true, force: true });

await build({
  entryPoints: MODULES.map((m) => path.join(APP, "src", `${m}.ts`)),
  outdir: OUT,
  outExtension: { ".js": ".mjs" },
  format: "esm",
  bundle: true,
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
process.exit(fail ? 1 : 0);

// Which modules the test build produces, and the two kinds of exemption.
//
// This used to be a hand-written array of names inside `run.mjs`, and nothing
// compared it to the directory. It listed 43 of the 62 modules in `src/`. The
// other nineteen — 9,081 lines, including `exports.ts`, `compile.ts`, `save.ts`,
// `files.ts`, `deferred-lint.ts` and `ksav-lang.ts` — could not be imported by
// any test, and no test imported them. Not one. A suite cannot report a hole it
// has no way to see, so the hole was invisible for as long as it existed, and
// the workaround was visible instead: `prose.test.mjs` ran a *second, private*
// esbuild because `ksav-lang.ts` was not on the list.
//
// The list is read off the disk now. What is left is two exemptions, and each
// one is a claim the runner's own test checks rather than a name somebody
// forgot — an exemption nothing verifies is how the first list got to 43.

import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * Modules that genuinely cannot be bundled for the tests, and why.
 *
 * `runner.test.mjs` builds each of these and fails if one *succeeds*: the day
 * the reason stops being true, the exemption goes rather than quietly outliving
 * it.
 */
export const UNBUILDABLE = new Map([
  [
    "wasm-worker",
    "imports the wasm binary as `…?url`, which is a Vite resolution — esbuild " +
      "has no loader for `.wasm` and the worker is driven from `api.ts` anyway",
  ],
]);

/**
 * Modules that build, and that a test must never import at the top, and why.
 *
 * Building them is still worth doing: it is the cheapest possible check that
 * the application still bundles, and `npm test` does not run `tsc`. What must
 * not happen is a test *evaluating* one, because evaluating this one boots the
 * app.
 */
export const NOT_IMPORTABLE = new Map([
  [
    "main",
    "boots the application on import — `boot()` runs at module scope, reaches " +
      "for `document`, and takes the runner down with it",
  ],
]);

/** Every module in `src/`, in the order `readdir` gives them. */
export function sourceModules(SRC) {
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

/** The ones the test build should produce. */
export function buildableModules(SRC) {
  return sourceModules(SRC).filter((m) => !UNBUILDABLE.has(m));
}

export const SRC_DIR = (HERE) => path.resolve(HERE, "..", "src");

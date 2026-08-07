// Build a `src/*.ts` module to something node can import, and import it.
//
// # The finding
//
// Four copies — `emit-note-fixtures.mjs` (as `loadNotes`), `emit-structure-
// fixtures.mjs`, `emit-insertion-fixtures.mjs`, `bench-structure.mjs` — and
// they had drifted in the way copies do: three different temp-directory
// prefixes, one that deletes the directory synchronously in `finally` while the
// dynamic `import` is still resolving out of it, one that defers the delete two
// seconds, one that never noticed. The version below defers, because the
// synchronous one is a race that only loses on a cold cache.
//
// The esbuild note the three generators each carried a verbatim copy of, kept
// once here, because it is the reason this is `build` from the JS API and not a
// spawn:
//
//   `node node_modules/esbuild/bin/esbuild` is a JavaScript shim on Windows and
//   the **native executable** on Linux, where npm's platform package overwrites
//   it — so handing it to `node` threw `SyntaxError: Invalid or unexpected
//   token` and took the editor job in CI down on every push, while working
//   perfectly on the machine that wrote it.

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SRC } from "./paths.mjs";

/**
 * Bundle `src/<name>.ts` and import it.
 *
 * Bundled, so the module's own imports come with it — these run outside vite,
 * where a bare `./spans` specifier means nothing.
 */
export async function load(name) {
  return (await loadMany([name]))[name];
}

/**
 * The same, for several modules at once, keyed by name.
 *
 * One esbuild invocation and — through `splitting` — **one copy of each shared
 * module**, which is the property `test/run.mjs` learned the hard way: without
 * it each entry point gets a private copy of every dependency, and two entries
 * hold two different singletons.
 */
export async function loadMany(names) {
  const dir = mkdtempSync(join(tmpdir(), "ksav-load-"));
  await build({
    entryPoints: names.map((n) => join(SRC, `${n}.ts`)),
    outdir: dir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    splitting: true,
    format: "esm",
    // Neutral rather than node, with the editor packages left external: these
    // are the settings `test/run.mjs` uses, and the reason is that a unit test
    // of a data module should not pull the whole editor in behind it. For a
    // module that imports none of them the two settings are the same build.
    platform: "neutral",
    external: ["@codemirror/*", "@lezer/*", "@tauri-apps/*"],
    logLevel: "silent",
  });
  const out = {};
  for (const n of names) out[n] = await import(pathToFileURL(join(dir, `${n}.mjs`)).href);
  // After every import has resolved, not in a `finally` beside them: node reads
  // the files during `import`, and two of the four copies deleted the directory
  // out from under it. The timer is unref'd so it cannot hold the process open.
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 2000).unref?.();
  return out;
}

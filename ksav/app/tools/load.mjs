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
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { APP, SRC } from "./paths.mjs";

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
  // Inside the app, not in the system temp directory.
  //
  // The editor packages are left `external` below, so the built module still
  // carries bare `@codemirror/view` specifiers — and node resolves those
  // relative to the *importing file*. From `%TEMP%` there is no `node_modules`
  // above it, so importing any module that reaches the editor died with
  // `ERR_MODULE_NOT_FOUND`, naming a package that is installed. All four
  // original copies had this, and none of them had ever loaded such a module;
  // `test/run.mjs` builds into `.tmp-test/` for exactly this reason and the
  // reason had not travelled with the code.
  sweepStaleLoads();
  const dir = mkdtempSync(join(APP, ".tmp-load-"));
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
  // And on the way out, because an unref'd two-second timer in a process that
  // exits in eighty milliseconds never fires at all — which is every unit test
  // here. **2,187** `.tmp-load-*` directories had accumulated in `app/` before
  // anybody counted them, each an esbuild of part of the application, and a
  // full disk on this project does not fail cleanly: rustc leaves truncated
  // rlibs whose errors read like code faults.
  //
  // `exit` is safe where the `finally` was not: nothing can still be importing
  // by then, since no further asynchronous work can run.
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return out;
}

/**
 * Is this leftover directory old enough that nothing can still be using it?
 *
 * Whoever left it behind is long gone — but another test process may be
 * running *right now* with a directory of its own, so age is the only honest
 * test. An hour is far beyond any run of this suite and far below anything
 * that would still be a problem.
 */
export function staleLoad(name, mtimeMs, now) {
  return name.startsWith(".tmp-load-") && now - mtimeMs > 60 * 60 * 1000;
}

/** Whatever earlier runs left behind. Best-effort: a race here costs nothing. */
export function sweepStaleLoads(now = Date.now()) {
  let gone = 0;
  for (const name of readdirSync(APP)) {
    const full = join(APP, name);
    try {
      if (!staleLoad(name, statSync(full).mtimeMs, now)) continue;
      rmSync(full, { recursive: true, force: true });
      gone++;
    } catch {
      // Being swept by somebody else, or not ours to remove. Either is fine.
    }
  }
  return gone;
}

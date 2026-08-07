// The runner's own fence: a test suite that can see the whole application.
//
// `run.mjs` used to hold a hand-written array of module names, and nothing in
// the repository compared it to `src/`. It listed 43 of 62 modules. The other
// nineteen — 9,081 lines, including `exports.ts`, `compile.ts`, `save.ts`,
// `files.ts`, `deferred-lint.ts` and `ksav-lang.ts` — could not be imported by a
// test, and no test imported them, because there was nothing in `.tmp-test/` to
// import. Nobody had decided that; the array had simply stopped growing.
//
// That is this repository's own bug family told from the inside: a working thing
// behind a surface that reports on it and does not know what it is missing. The
// suite said "44 files, 2,723 assertions" and could not have said "and 43% of
// the application is unreachable from here", because the number it would need
// was never computed.
//
// So the list is read off the disk now, and this file is the part that keeps it
// honest. Three sweeps, and the shape they share is `chrome.test.mjs`'s best
// idea — an exemption is a *claim with a test attached*, never a name on a skip
// list:
//
//   1. every module in `src/` was built, or is declared unbuildable *with a
//      reason that this file executes* — the declaration fails if the module
//      turns out to build fine
//   2. every buildable module is imported by at least one test file, or is
//      declared un-importable with a reason, and nothing may import those
//   3. no test file builds its own private copy of a module, which is the
//      workaround the hole produced last time and the way it would hide again

import { check, ok } from "./harness.mjs";
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { UNBUILDABLE, NOT_IMPORTABLE, sourceModules, buildableModules } from "./modules.mjs";
import { dirOf, TEST, TOOLS } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const APP = path.resolve(HERE, "..");
const SRC = path.join(APP, "src");
const OUT = path.join(APP, ".tmp-test");

export async function run() {
  const all = sourceModules(SRC);
  ok("there is an application to check", all.length > 50);

  // ------------------------------------------------ 1. everything is built

  {
    const missing = buildableModules(SRC).filter((m) => !existsSync(path.join(OUT, `${m}.mjs`)));
    check("every module in src/ was built for the tests", missing, []);
  }

  {
    // An exemption for a file that no longer exists is a comment, not a rule.
    const ghosts = [...UNBUILDABLE.keys(), ...NOT_IMPORTABLE.keys()].filter(
      (m) => !all.includes(m),
    );
    check("every exemption names a module that exists", ghosts, []);
  }

  {
    // The claim, executed. `wasm-worker.ts` is exempt because esbuild has no
    // loader for the `?url` wasm import Vite resolves — so it must actually
    // fail. The day that stops being true the exemption goes, rather than
    // sitting here outliving its reason the way the old array did.
    const builtAnyway = [];
    for (const m of UNBUILDABLE.keys()) {
      try {
        await build({
          entryPoints: [path.join(SRC, `${m}.ts`)],
          outdir: path.join(APP, ".tmp-test-probe"),
          outExtension: { ".js": ".mjs" },
          format: "esm",
          bundle: true,
          platform: "neutral",
          external: ["@codemirror/*", "@lezer/*", "@tauri-apps/*"],
          logLevel: "silent",
        });
        builtAnyway.push(m);
      } catch {
        // Which is what the exemption says will happen.
      }
    }
    check("every unbuildable module really is unbuildable", builtAnyway, []);
    check("the reasons are written down", [...UNBUILDABLE.values()].filter((r) => !r || r.length < 20), []);
  }

  // ------------------------------------------------ 2. everything is imported

  const testFiles = (await readdir(HERE)).filter((f) => f.endsWith(".test.mjs"));
  const bodies = new Map();
  const codeOnly = new Map();
  for (const f of testFiles) {
    const body = await readFile(path.join(HERE, f), "utf8");
    bodies.set(f, body);
    // Comments discuss these modules by name — this file's own header names six
    // of them — so the sweeps below read code, not prose. `chrome.test.mjs` was
    // rewritten for the opposite of this bug: a comment mentioning a function
    // turned an assertion *green*. A comment turning one red is the safe
    // direction and still wrong.
    codeOnly.set(
      f,
      body
        .split(String.fromCharCode(10))
        .filter((l) => {
          const t = l.trim();
          return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .join(String.fromCharCode(10)),
    );
  }

  {
    // The assertion the old runner could not make. A module nothing imports is a
    // module with no test, and until now the suite had no way to say so — which
    // is exactly why sixteen of them had none.
    const importers = (m) =>
      [...codeOnly].filter(([, b]) => b.includes(`.tmp-test/${m}.mjs`)).map(([f]) => f);
    const untested = buildableModules(SRC)
      .filter((m) => !NOT_IMPORTABLE.has(m))
      .filter((m) => importers(m).length === 0);
    check("every module is imported by at least one test", untested, []);
  }

  {
    // And the other direction: a module declared un-importable must not be
    // imported. `main.ts` boots the application at module scope; importing it
    // in a test takes the runner down, and the reason it is still *built* is
    // that bundling it is the cheapest check that the app still bundles at all
    // — `npm test` does not run `tsc`.
    const violations = [];
    for (const m of NOT_IMPORTABLE.keys()) {
      for (const [f, b] of codeOnly) {
        if (b.includes(`.tmp-test/${m}.mjs`)) violations.push(`${f} imports ${m}`);
      }
      if (!existsSync(path.join(OUT, `${m}.mjs`))) violations.push(`${m} was not built`);
    }
    check("nothing imports a module that boots the app", violations, []);
    check(
      "the reasons are written down",
      [...NOT_IMPORTABLE.values()].filter((r) => !r || r.length < 20),
      [],
    );
  }

  // ------------------------------------------------ 3. no private builds

  {
    // `prose.test.mjs` ran a second esbuild for two years' worth of commits
    // because `ksav-lang.ts` was not on the list, and that private build was
    // the only visible symptom of the hole. A test that bundles its own copy of
    // a module is a test that has routed around the runner, and the next time
    // the runner is wrong nobody will notice for the same reason.
    //
    // `tools/card.mjs` is not a test and is not swept: it generates a shipped
    // documentation card and legitimately bundles the bindings for it. This
    // file is the one test allowed to reach for esbuild, and only to *execute*
    // the unbuildable claim above — a sweep that cannot run the compiler it is
    // making a claim about is the kind of check this whole file exists against.
    const privateBuilds = [];
    for (const [f, b] of bodies) {
      if (f === "runner.test.mjs") continue;
      b.split("\n").forEach((line, i) => {
        const s = line.trim();
        if (s.startsWith("//") || s.startsWith("*")) return;
        if (/from\s+["']esbuild["']/.test(line)) privateBuilds.push(`${f}:${i + 1}`);
      });
    }
    check("no test file bundles its own copy of a module", privateBuilds, []);
  }

  {
    // The runner reaches `src/` through `modules.mjs` and nowhere else, so
    // there is one statement of what the application consists of.
    const runner = await readFile(path.join(HERE, "run.mjs"), "utf8");
    ok("the runner reads its list off the disk", runner.includes("buildableModules"));
    ok(
      "and does not carry a second one",
      !/const MODULES = \[/.test(runner),
    );
  }

  nothingIsCopiedBackIn();
}

// The sweeps have never looked where the duplication actually lives.
//
// `spans.test.mjs` and `enginefacts.test.mjs` read `src/`. `test/` and `tools/`
// are 60-odd files that nothing sweeps at all — and that is precisely where the
// appendix of the 7 August report found the copies that survived: one path
// expression in 22 files, an esbuild loader in ten, four parsers of one Rust
// table.
//
// Each of these is a *prohibition*, not a count: the extracted helper exists, so
// writing the copy again is the failure. Comments are stripped first, because
// every paragraph in this suite that explains what the old arrangement was would
// otherwise trip the test that forbids it.
export function nothingIsCopiedBackIn() {
  const strip = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");

  const files = [];
  for (const dir of [TEST, TOOLS]) {
    for (const name of readdirSync(dir)) {
      // This file states each forbidden pattern as a string literal in order to
      // look for it, which is the one exemption every prohibition sweep in this
      // suite needs and the only one any of them has.
      if (!name.endsWith(".mjs") || name === "runner.test.mjs") continue;
      files.push([path.join(dir, name), strip(readFileSync(path.join(dir, name), "utf8"))]);
    }
  }
  ok("the sweep found the helper directories", files.length > 50, `${files.length} files`);

  // `.pathname` on a `file://` URL is still percent-encoded, so a checkout under
  // `C:\Users\Some One\Ksav` resolves to `Some%20One` and every one of these
  // fails to find `src/` — the whole suite dying at import time with a path
  // nobody can read. `fileURLToPath` decodes. `tools/paths.mjs` is the one place
  // that knows this.
  {
    const guilty = files
      .filter(([f]) => path.basename(f) !== "paths.mjs")
      .filter(([, s]) => s.includes("import.meta.url).pathname"))
      .map(([f]) => path.basename(f));
    check("nothing hand-rolls a path from import.meta.url", guilty, []);
  }

  // Ten copies of a `build()` from esbuild, three of which disagreed about when
  // to delete the directory they had just imported out of.
  {
    const guilty = files
      .filter(([f]) => !["load.mjs", "run.mjs"].includes(path.basename(f)))
      .filter(([, s]) => s.includes('from "esbuild"'))
      .map(([f]) => path.basename(f));
    check("only tools/load.mjs and test/run.mjs invoke esbuild", guilty, []);
  }

  // Four parsers of `commands.rs`, two of them byte-identical.
  {
    const guilty = files
      .filter(([f]) => path.basename(f) !== "commands.mjs")
      .filter(([, s]) => s.includes("cmd!("))
      .map(([f]) => path.basename(f));
    check("only tools/commands.mjs parses the command macro", guilty, []);
  }
}

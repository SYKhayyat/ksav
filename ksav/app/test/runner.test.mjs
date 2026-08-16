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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { UNBUILDABLE, NOT_IMPORTABLE, sourceModules, buildableModules } from "./modules.mjs";
import { dirOf, TEST, TOOLS } from "../tools/paths.mjs";
import { staleLoad } from "../tools/load.mjs";
import { facts, disagreements } from "../tools/facts.mjs";

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

  // ------------------------------------- 3b. and no test reaches into src/

  {
    // The other way around the runner, and it is worse than a private build
    // because it can pass on the machine it was written on.
    //
    // `emacs.test.mjs` shipped with `import { SERVICES } from
    // "../src/services.gen.ts"`. Node 26 strips TypeScript types by itself, so
    // it ran here; CI pins Node 20, which does not, and the whole editor job
    // died with `ERR_UNKNOWN_FILE_EXTENSION` before a single assertion — a red
    // build for a green suite. Every other test imports from `.tmp-test/`,
    // which is what the runner builds.
    //
    // Two reasons this is a rule rather than that one fix. A `.ts` import
    // depends on the developer's Node version, which is the least reproducible
    // thing about a checkout; and a module reached directly is a module the
    // runner did not build, so it arrives without the bundling that makes the
    // shared singletons in `src/` behave as one copy — which is the fault
    // `modules.mjs` exists to prevent, arrived at from the other side.
    const reachIns = [];
    for (const [f, b] of bodies) {
      b.split("\n").forEach((line, i) => {
        const s = line.trim();
        if (s.startsWith("//") || s.startsWith("*")) return;
        // A dynamic `import("../src/x")` as well as a static one. It reaches the
        // same unbundled module by the same relative path and was not covered:
        // the sweep read the spelling that had gone wrong once rather than the
        // rule it was written for.
        if (/from\s+["']\.\.\/src\/|import\s*\(\s*["']\.\.\/src\//.test(line)) {
          reachIns.push(`${f}:${i + 1}`);
        }
      });
    }
    check("no test imports out of src/ directly", reachIns, []);
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
      // `prohibitions.test.mjs` states every forbidden pattern as a literal in
      // order to sweep the repository for it — the same exemption this file
      // takes for itself, and the reason both exist: this one sweeps the two
      // helper directories, where a copy of a helper hides; that one sweeps the
      // tree, where a copy of a *rule* hides.
      if (!name.endsWith(".mjs")) continue;
      if (name === "runner.test.mjs" || name === "prohibitions.test.mjs") continue;
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

  // Four parsers of `commands.rs`, two of them byte-identical — and then the
  // parser itself, because the cause was never the duplication.
  //
  // Four Rust tables were read across this seam as **source text**: the command
  // registry, the service registry, the redistribution notices, and
  // `impl Default for DocConfig`. The last had no fence of any kind on it, so
  // reflowing that block changed the defaults the client shipped, silently —
  // the Rust value wins on the wire, so the sliders read one number and the page
  // was laid out to another. `services.rs` had noticed the risk about itself and
  // answered with `#[rustfmt::skip]`, which stops rustfmt and stops nothing else.
  //
  // The engine serialises all four now (`engine/src/facts.rs` →
  // `engine/facts.gen.json`), so the prohibition is the whole class rather than
  // one macro: **nothing here opens a `.rs` file to read a value out of it.**
  // Two exemptions, both of which read Rust for something that is not a value:
  //
  //   - `tools/facts.mjs` counts declarations (`cmd!(`, `svc(`, `Notice {`) to
  //     catch an unblessed edit. A count can only ever refuse loudly, and it
  //     survives every reflow rustfmt can perform.
  //   - `docfacts.mjs` counts files and lines for the documentation fence. It
  //     never looks inside one.
  //   - `wire.test.mjs` reads the **key names** of the engine's response
  //     literals, and no value. It is the instrument the 9 August report gives
  //     to Girsa — *"a generator catches a stale copy of a registry, never a
  //     wrong one"* — and the whole reason it reads Rust rather than importing
  //     a generated table is that a generated table would be the engine
  //     agreeing with itself. Nothing it reads reaches the shipping bundle; it
  //     can only refuse. If it ever reads a *value* out of a `.rs` file, this
  //     prohibition is right and the exemption is wrong.
  //   - `skips.test.mjs` reads the **shape** of `#[test]` bodies — does this one
  //     skip cases, does it assert a floor, does it let an environment variable
  //     decide whether it checks anything. No value it reads reaches anything;
  //     the only thing it can do with what it finds is fail. The same sentence
  //     as `wire.test.mjs`, and the same condition on it.
  {
    const allowed = ["facts.mjs", "docfacts.mjs", "wire.test.mjs", "skips.test.mjs"];
    const guilty = files
      .filter(([f]) => !allowed.includes(path.basename(f)))
      .filter(([, s]) => /\.rs"|\.rs'|\.rs`/.test(s))
      .map(([f]) => path.basename(f));
    check("nothing outside tools/facts.mjs reads the engine's Rust", guilty, []);
  }

  // …and the artefact it reads instead is real. A generator that silently read
  // an empty table writes a file that typechecks and breaks at runtime, which is
  // the failure every floor check in `tools/` exists to turn into a sentence.
  {
    const f = facts();
    ok("the engine's facts artefact has all four tables", f.commands.length > 100 &&
      f.services.length >= 10 && f.notices.length >= 4 &&
      Object.keys(f.doc_defaults).length >= 25);
    check("…and it agrees with the Rust it was serialised from", disagreements(), []);
  }

  // ------------------------------------------ and the suite cleans up after itself
  //
  // `tools/load.mjs` builds each module into `app/.tmp-load-XXXXXX` and deleted
  // it on an unref'd two-second timer — in processes that exit in eighty
  // milliseconds. The timer never fired. **2,187** of those directories had
  // accumulated in `app/`, each holding an esbuild of part of the application,
  // and on this project a full disk does not fail cleanly: rustc leaves
  // truncated rlibs whose errors read exactly like code faults.
  //
  // What is asserted is the rule the sweep runs on, because the sweep itself
  // cannot be: another test process may be holding a directory of its own
  // right now, so *age* is the only safe test, and getting the age wrong in
  // either direction is the whole bug — too eager deletes a live build, too
  // lax leaves the pile.
  {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    ok("a directory from a finished run is swept", staleLoad(".tmp-load-abc", now - 2 * hour, now));
    ok("…one a live run may still be using is not", !staleLoad(".tmp-load-abc", now - 1000, now));
    ok("…and nothing else in app/ is touched", !staleLoad("src", 0, now));
    check("no build directory is left over from this suite", readdirSync(APP)
      .filter((n) => n.startsWith(".tmp-load-"))
      .filter((n) => staleLoad(n, statSync(path.join(APP, n)).mtimeMs, Date.now())), []);
  }

}

// The module surface: nobody reads this, so it should not be here.
//
// # Why this exists (#223)
//
// Eight values were exported and read by **nothing** — not another module, not
// their own file past the declaration, not a test:
//
//     brackets.ts:commentRegions   channels.ts:LAYOUTS     entity.ts:entityIn
//     focus.ts:typewriterMode      panes.ts:EDITABLE       spans.ts:roleAt
//     tagdim.ts:tagDimCompartment  tagselect.ts:setTagSelection
//
// An export promises a reader. `typewriterMode` was the one that showed what that
// costs: the typewriter is implemented, so a reader who started from the
// half-abandoned export and not from the working code built on nothing. `cargo`
// says `never used` for these; `tsc` cannot, because an export is a *use*.
//
// Fifty-seven more were exported and read only inside their own file — a module
// boundary around a private function. Each is a keyword either way, and the
// keyword was wrong.
//
// # The two rules
//
// 1. **An export nobody reads is a lie.** Not another module, not the declaring
//    file, not a test: dead. (Gone; the rule keeps it gone.)
// 2. **An export read only by its own file is not an export.** A test may read
//    it — tests are a legitimate reader of a module's internals — but if nothing
//    outside the module does, the declaration is `function`, not `export
//    function`.
//
// Types are not covered, deliberately: `export interface` and `export type` cost
// nothing at runtime, are the way a module documents its own vocabulary, and are
// erased before anything a reader would ever hold.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ok } from "./harness.mjs";
import { srcOf, sourceFiles } from "./source.mjs";
import { TEST, TOOLS } from "../tools/paths.mjs";

/** Everything outside `src/` that may name a module's internals. */
function outsideText() {
  const out = [];
  for (const dir of [TEST, TOOLS]) {
    for (const name of readdirSync(dir)) {
      if (/\.(mjs|cjs|js|json|ts)$/u.test(name)) out.push(readFileSync(path.join(dir, name), "utf8"));
    }
  }
  return out.join("\n");
}

/** Every `export function|const|let|class` in `src/`, with its counts. */
function exportedValues() {
  const outside = outsideText();
  // `wasmpkg/` is `wasm-bindgen`'s output: declarations the *engine* generates
  // and JavaScript calls by name, not this program's surface. An export there
  // with no reader on this side is the glue working.
  const bodies = new Map(
    sourceFiles()
      .filter((f) => !f.startsWith("wasmpkg/"))
      .map((f) => [f, srcOf(f)]),
  );
  const out = [];
  for (const [file, body] of bodies) {
    const re = /^export (?:async )?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gmu;
    for (const m of body.matchAll(re)) {
      const name = m[1];
      const word = new RegExp(`\\b${name.replace(/\$/gu, "\\$")}\\b`, "gu");
      const own = [...body.matchAll(word)].length;
      let others = 0;
      for (const [other, text] of bodies) if (other !== file) others += [...text.matchAll(word)].length;
      out.push({ file, name, own, others, inTests: word.test(outside) });
    }
  }
  return out;
}

export async function run() {
  const exports = exportedValues();

  ok(
    "the sweep found the module surface, so it has a subject",
    exports.length > 900,
    `${exports.length} exported values`,
  );

  // Rule 1: nobody reads it. `own === 1` is the declaration itself.
  {
    const dead = exports.filter((e) => e.others === 0 && e.own <= 1 && !e.inTests);
    ok(
      "no export is read by nothing at all",
      dead.length === 0,
      dead.length ? `dead: ${dead.map((e) => `${e.file}:${e.name}`).join(", ")}` : "none",
    );
  }

  // Rule 2: only its own file reads it, and no test does.
  {
    const privateOnly = exports.filter((e) => e.others === 0 && e.own > 1 && !e.inTests);
    ok(
      "no export is read only by its own file",
      privateOnly.length === 0,
      privateOnly.length ? `over-exported: ${privateOnly.map((e) => `${e.file}:${e.name}`).join(", ")}` : "none",
    );
  }

  // The other direction, so a sweep that stopped seeing exports cannot pass:
  // the surface really is used from outside, and the test seams really are
  // named by tests. A broken word-boundary or a moved directory shows up here.
  {
    ok(
      "and most of it is read from another module",
      exports.filter((e) => e.others > 0).length > exports.length / 2,
      `${exports.filter((e) => e.others > 0).length} of ${exports.length}`,
    );
    ok(
      "and some are read by tests alone — the seam the rule allows",
      exports.filter((e) => e.others === 0 && e.inTests).length > 10,
      `${exports.filter((e) => e.others === 0 && e.inTests).length} test seams`,
    );
  }
}

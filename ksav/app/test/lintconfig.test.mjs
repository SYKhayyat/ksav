// The lint pass, and the four rules it is for (#224).
//
// # Why a fence over a config file
//
// `clippy -D warnings` is a clause in every engine commit because it is in the
// gate. The app had no equivalent at all, so its guarantees lived in hand-built
// fences — fifty of them, each with prose — while the two things a linter is
// actually good at went unchecked: a promise nobody awaits, and a cast that
// re-declares a type it was supposed to read. The second one is #221, filed
// against this codebase, hidden from `tsc` by `as unknown as`.
//
// A linter that is not in the gate is a suggestion. This file asserts the three
// places that make it a rule: the config enables the rules by name, `npm run
// lint` exists, and the gate runs it — so "we lint" cannot become true in the
// README and false in the runner.
//
// # What this file cannot do
//
// Run ESLint. It takes about thirty seconds over the typed program, which is the
// whole gate's budget for one check, so `node test/run.mjs` would go from a
// minute to three. The behavioural proof happened when the rules were turned on
// and the tree was fixed (98 findings, 0 now); what is asserted here is that the
// switch stays on.

import { ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SRC } from "../tools/paths.mjs";
import { sourceFiles } from "./source.mjs";

const APP = path.resolve(SRC, "..");

const read = (rel) => readFileSync(path.join(APP, rel), "utf8");

/** The rules that must be on, and the bug class each one is for. */
const REQUIRED = [
  ["@typescript-eslint/no-floating-promises", "a promise nobody awaits is a save that may not happen"],
  ["@typescript-eslint/no-misused-promises", "a promise handed where a `void` was wanted"],
  ["@typescript-eslint/no-unnecessary-type-assertion", "an assertion that re-states what the type already says"],
  ["@typescript-eslint/no-unsafe-assignment", "an assignment out of `any`"],
];

export async function run() {
  const config = read("eslint.config.mjs");

  for (const [rule, why] of REQUIRED) {
    // `"error"`, not `"warn"` or `"off"`: a warning in CI is a warning nobody
    // reads, and this tree's own history is that unread reds accumulate.
    ok(
      `${rule} is an error in the config — ${why}`,
      new RegExp(`"${rule}":\\s*"error"`, "u").test(config),
    );
  }

  ok(
    "the typed rules are given the program, not just the file",
    /projectService:\s*true/u.test(config),
    "`no-floating-promises` is a question about an expression's type",
  );

  ok(
    "the generated wasm glue and the fixtures are not linted",
    /wasmpkg\//u.test(config) && /\.tmp-test\//u.test(config),
  );

  {
    const pkg = JSON.parse(read("package.json"));
    ok("`npm run lint` exists", typeof pkg.scripts?.lint === "string", pkg.scripts?.lint);
    ok("…and it lints `src/`", /eslint[^\n]*src/u.test(pkg.scripts?.lint ?? ""));
  }

  {
    const gate = read("../tools/gate.mjs");
    const block = /id: "editor-lint",[\s\S]*?\n  \},/u.exec(gate)?.[0] ?? "";
    ok("the gate has an editor-lint check", block !== "");
    ok("…in the editor group, so `node tools/gate.mjs editor` runs it", /group: "editor"/u.test(block));
    ok("…that runs eslint over `src`", /eslint/u.test(block) && /"src"/u.test(block));
    ok("…and says why beside it, the way every other check does", /why:/.test(block));
  }

  // A rule set with nothing to check is a rule set that has silently stopped
  // matching anything: the globs, the directory, or the whole config could rot
  // and every assertion above would still pass.
  {
    const files = sourceFiles().filter((f) => !f.startsWith("wasmpkg/"));
    ok("and there is a tree for it to have an opinion about", files.length > 100, `${files.length} modules`);
  }
}

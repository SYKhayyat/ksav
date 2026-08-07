// Check a generated file against what would be generated now, or rewrite it.
//
// # The finding
//
// Five generators held the same twenty-line block: read the file, compare,
// `process.exit(1)` with a "run this to regenerate" message, else write. One
// comment paragraph was copy-pasted verbatim into three of them.
//
// That is bucket 2 in the appendix's ordering — live callers, one idea copied N
// times — and the reason it matters is not tidiness. `package.json` ran the five
// checks as **five separate `node` processes** chained with `&&`, plus the suite
// itself: six process spawns, ~7.8 s of the 14.2 s warm inner loop on Windows,
// 55% of it. Folding them into one process is only possible if the check is a
// function rather than a script's trailing `if`.
//
// So each generator exports `OUTPUTS` — `[absolutePath, wanted, label]` — and
// `test/run.mjs` imports all five and checks them in-process. The trailing
// footer stays so `node tools/emit-engine.mjs` still rewrites the file by hand.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Is this module the one node was asked to run? */
export function isMain(url) {
  return !!process.argv[1] && pathToFileURL(process.argv[1]).href === url;
}

/**
 * The labels of the outputs that no longer match what would be generated.
 *
 * A missing file counts as stale, which is the right answer: the check exists to
 * say "the generated copy does not agree with its source", and no copy at all is
 * the strongest form of that.
 */
export function staleOutputs(outputs) {
  const out = [];
  for (const [file, wanted, label] of outputs) {
    let have = null;
    try {
      have = readFileSync(file, "utf8");
    } catch {
      /* missing counts as stale */
    }
    if (have !== wanted) out.push(label);
  }
  return out;
}

/** Write every output, reporting each. */
export function writeOutputs(outputs) {
  for (const [file, wanted, label] of outputs) {
    writeFileSync(file, wanted);
    console.log("wrote " + label);
  }
}

/**
 * The trailing footer every generator shares: `--check` compares, anything else
 * rewrites.
 *
 * `hint` is the command that regenerates, and it is not decoration — a stale
 * generated file is the one failure a developer meets before they know how this
 * repository is put together, and "it is stale" without "run this" is a dead end.
 */
export function runAsScript(url, outputs, what, hint) {
  if (!isMain(url)) return;
  if (process.argv.includes("--check")) {
    const stale = staleOutputs(outputs);
    if (stale.length) {
      console.error(`${stale.join(", ")} is stale — regenerate with:\n  ${hint}`);
      process.exit(1);
    }
    console.log(`${what} up to date`);
    return;
  }
  writeOutputs(outputs);
}

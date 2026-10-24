// The lint glue's own fence. Three lints (deferred-editor, numbering, bracket)
// re-derived the same scan-guard verbatim — read the text, ask the backend,
// stand down if the writer typed while the scan was in flight. `lintkit.ts`
// owns the guard now, and this file holds two claims about it:
//
//   1. The guard is written **once**: the stale-document check appears in
//      exactly one module, and it is lintkit's.
//   2. The three lints route through it — each calls `scanLinter`, and none
//      of them still imports `scanForBackend` (a lint that scans on its own
//      is the second copy this file exists to prevent).
//
// The *models* are deliberately out of scope: `numberMarks`, `analyze`,
// `problems` and friends keep their own tests.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ok } from "./harness.mjs";
import { dirOf } from "../tools/paths.mjs";
import { scanLinter } from "../.tmp-test/lintkit.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const strip = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => {
      const at = l.indexOf("//");
      return at < 0 ? l : l.slice(0, at);
    })
    .join("\n");

export async function run() {
  ok("the kit is the one thing that stands down on a stale document",
     typeof scanLinter === "function");

  const sources = new Map(
    readdirSync(SRC)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => [f, strip(readFileSync(path.join(SRC, f), "utf8"))]),
  );
  const kit = sources.get("lintkit.ts") ?? "";
  const guardCount = [...sources.values()].filter((s) =>
    s.includes("view.state.doc !== doc) return []"),
  ).length;
  ok("the stale-document guard is written exactly once — in lintkit", guardCount === 1 && kit.includes("view.state.doc !== doc) return []"));

  for (const f of ["deferred-editor.ts", "numbering-lint.ts", "bracket-lint.ts"]) {
    const s = sources.get(f) ?? "";
    ok(`${f} routes through scanLinter`, s.includes("scanLinter("));
    ok(`${f} does not scan on its own`, !s.includes("scanForBackend("));
  }
}

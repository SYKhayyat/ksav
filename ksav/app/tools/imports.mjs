// The import graph, checked the way the split plan's rules 4, 5 and 9 state it:
//
//   1. The graph stays acyclic. With ~20 new modules coming out of main.ts,
//      a cycle is how a tree dies into a hairball — one file-to-file back
//      import and "the unknowns resolve from one place" stops being true, and
//      no typecheck will say so.
//
//   2. No module named misc, utils, helpers or common. Rule 9: when a third
//      module needs to import from a "leftovers" file, the region is wrong
//      and gets re-grouped, not renamed — so the name is refused at birth.
//
// Fails naming the cycle (path form) or the offending file name. Exits 0 when
// src/ imports only what the DAG allows and every name names itself.
//
// `import type … from` and `export type … from` are not edges. A type-only
// import is erased at emit — no runtime identity, no runtime cycle — and TS
// holds the fib at compile time; the tree had three such one-way edges at
// birth (git→api, notes→structure, docs→runtime, all type-only) and they are
// not what rule 5 names. A *value* import in either direction across any
// feature is.
//
// Relative imports only, which is the only kind the rule governs: `./x`,
// `../x`, `import("./x")` and `export … from "./x"` are all edges; package
// imports and the stylesheet are not.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..", "src");

const isModule = (f) => f.endsWith(".ts") && !f.endsWith(".d.ts");
const modules = readdirSync(SRC).filter(isModule);

// ------------------------------------------------------------- the name gate

const REFUSED = ["misc", "utils", "helpers", "common"];
const refused = modules.filter((m) => REFUSED.includes(m.replace(/\.ts$/, "")));
if (refused.length) {
  console.error(
    `src/ holds a module whose name does not name anything:\n` +
      refused.map((m) => `  ${m}\n`).join("") +
      `Rule 9 of the split: when a third module would import from a "leftovers"` +
      ` file, the region is wrong and gets re-grouped, not renamed.`,
  );
  process.exit(1);
}

// ------------------------------------------------------------ the edge table

// Comments out first: prose says `from "./x"` in several files, and a fence
// that fires on its own documentation is a fence people learn to disable.
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[ \t].*$/gm, "");

const edges = new Map(modules.map((m) => [m, []]));
for (const file of modules) {
  const code = stripComments(readFileSync(path.join(SRC, file), "utf8"));
  // A `from` declaration carries a *preamble* that answers whether the edge
  // is erased: `import type …` and `export type …` are not edges, everything
  // else is. Matched whole because the quote alone cannot tell; the negative
  // lookahead keeps a value import of the same module next to an erased one.
  for (const m of [
    ...code.matchAll(/^(?:import|export)(?!\s+type)[\s\S]*?from\s*["'](\.[^"']+)["']/gm),
    ...code.matchAll(/import\s*\(\s*["'](\.[^"']+)["']/g),
    ...code.matchAll(/^import\s*["'](\.[^"']+)["']/gm),
  ]) {
    const target = path.resolve(SRC, path.dirname(file), m[1]);
    const asModule = target.endsWith(".ts") ? target : `${target}.ts`;
    const name = path.basename(asModule);
    if (isModule(name) && existsSync(asModule)) edges.get(file).push(name);
  }
}

// ------------------------------------------------------------ the cycle walk
//
// Depth-first with a colour map; the reported cycle is the path from the first
// revisit back to itself, read in the order that makes them easy to find.

const state = new Map(); // module -> "in" | "done"
const stack = [];
const cycles = [];

const walk = (node) => {
  state.set(node, "in");
  stack.push(node);
  for (const next of edges.get(node) ?? []) {
    if (state.get(next) === "in") {
      const at = stack.indexOf(next);
      cycles.push([...stack.slice(at), next]);
    } else if (!state.has(next)) {
      walk(next);
    }
  }
  stack.pop();
  state.set(node, "done");
};
for (const m of modules) if (!state.has(m)) walk(m);

if (cycles.length) {
  console.error(
    `src/'s import graph has ${cycles.length} cycle${cycles.length === 1 ? "" : "s"}:\n` +
      cycles.map((c) => `  ${c.join(" → ")}\n`).join("") +
      `Rule 5 of the split: cross-feature references route through runtime.ts,` +
      ` store.ts or api.ts — never file-to-file, never backwards.`,
  );
  process.exit(1);
}
// The size ledger, not a gate: the split's goal was a main.ts that only
// assembles, and a file crossing ~2,000 lines is a passenger worth naming —
// but the honest number belongs to whoever is changing the file, so this
// warns and does not fail (the audit's #156).
const SIZE_WARN = 2_000;
const oversize = [];
for (const m of modules) {
  const n = readFileSync(path.join(SRC, m), "utf8").split("\n").length;
  if (n > SIZE_WARN) oversize.push(`  ${m}: ${n} lines`);
}
console.log(`acyclic: ${modules.length} modules, no forbidden names.`);
if (oversize.length) {
  console.log(`size ledger (over ${SIZE_WARN} lines, a warning and not a gate):`);
  for (const l of oversize) console.log(l);
}

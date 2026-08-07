// One reader of `engine/src/commands.rs`, for everybody.
//
// # The finding this file answers
//
// Seven files read the command registry, in **four** different implementations,
// and they already disagreed about how many commands exist.
//
//   - `coverage.test.mjs` and `notecommands.test.mjs` held a **byte-identical**
//     200-character regex. Two files, one string, no import between them.
//   - `emit-insertion-fixtures.mjs` held the same regex minus one group.
//   - `emit-engine.mjs` held a real character-level reader — the correct one,
//     and the source of what is below.
//   - `docfacts.mjs` and `tools/card.mjs` both counted with the naive
//     `/^\s*cmd!\(/gmu`.
//
// The naive pair is the one that mattered, because it counts **the macro's own
// recursive expansion**. `commands.rs:39` is
//
//     ($he:literal, …, $ins:literal) => { cmd!($he, …, $ins, false) };
//
// — the six-argument arm of `macro_rules! cmd` delegating to the seven-argument
// arm. It is a `cmd!(` at the start of a line and it is not a command. So the
// structured parsers saw **115** and the counters saw **116**, and since
// `docfacts.mjs` is the fence that guards this repository's counted claims, the
// wrong number was the *enforced* one: `ksav/README.md` twice and
// `docs/start-here.md` once told the reader there are 116 commands.
//
// Nothing here is subtle. The duplication had no purpose; both *uses* did.
// There was nothing to delete — there was one module to extract, and this is
// the shape the appendix calls bucket 2: **the mechanism that prevents bucket
// 3.** With one parser there cannot be a 116/115 disagreement, and the three
// user-facing lines are right without anybody editing them.
//
// It reads the file rather than taking text, because every caller wants the same
// file and passing a path around was one more thing to get wrong.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `engine/src/commands.rs`, the one registry. */
export const REGISTRY = path.resolve(HERE, "..", "..", "engine", "src", "commands.rs");

/**
 * Read one Rust string literal starting at `i` (which must be the opening `"`).
 *
 * Hand-rolled rather than regexed because the `insert:` snippets carry escaped
 * quotes — `"#צבע(rgb(\"#b91c1c\"))[|]"` — and a regex that stops at the first
 * `"` cuts them in half. Returns the decoded value and the index just past the
 * closing quote.
 */
export function readString(src, i) {
  if (src[i] !== '"') return null;
  let out = "";
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") {
      const n = src[j + 1];
      out += n === "n" ? "\n" : n === "t" ? "\t" : n;
      j++;
      continue;
    }
    if (c === '"') return { value: out, end: j + 1 };
    out += c;
  }
  return null;
}

/** The `cmd!(…)` arguments of one macro call, as decoded strings/booleans. */
function readCmdArgs(src, from) {
  const args = [];
  let i = from;
  for (;;) {
    while (i < src.length && /[\s,]/.test(src[i])) i++;
    if (src[i] === ")") return { args, end: i + 1 };
    if (src[i] === '"') {
      const s = readString(src, i);
      if (!s) return null;
      args.push(s.value);
      i = s.end;
      continue;
    }
    // The only non-string argument the macro takes is the `deprecated` flag.
    if (src.startsWith("true", i)) {
      args.push(true);
      i += 4;
      continue;
    }
    if (src.startsWith("false", i)) {
      args.push(false);
      i += 5;
      continue;
    }
    return null;
  }
}

/**
 * Every command in the registry, in the order the table declares them.
 *
 * Each is `{ he, en, category, desc_he, desc_en, insert, deprecated }`.
 *
 * The slice to `pub static COMMANDS` is what keeps the macro definition out —
 * both `macro_rules!` arms sit above it — and it is why this reader has always
 * been right where the counters were wrong.
 */
export function commands(src = readFileSync(REGISTRY, "utf8")) {
  const table = src.slice(src.indexOf("pub static COMMANDS"));
  const out = [];
  let i = 0;
  for (;;) {
    const at = table.indexOf("cmd!(", i);
    if (at < 0) break;
    i = at + 5;
    const parsed = readCmdArgs(table, i);
    if (!parsed || parsed.args.length < 6) continue;
    const [he, en, category, desc_he, desc_en, insert, deprecated] = parsed.args;
    out.push({
      he,
      en,
      category,
      desc_he,
      desc_en,
      insert,
      deprecated: deprecated === true,
    });
    i = parsed.end;
  }
  return out;
}

/**
 * How many commands the registry declares.
 *
 * The number the documentation is fenced against. It is a function rather than
 * a constant so that nothing can cache a stale one, and it goes through the same
 * parser as everything else so it cannot disagree with what the app offers.
 */
export function commandCount(src) {
  return commands(src).length;
}

// Reading the application's own source, for the fences that are about text.
//
// # Why this exists
//
// Some facts about this program are facts about *text*: a module does not spell
// a keyboard chord by hand, a surface does not reach for a stale preset list, a
// file does not import another one. Those cannot be asserted by importing the
// module, because the thing being asserted is that the code is **not there**.
//
// The idea of this module is that an absence claim is only worth its bytes if it
// is a claim about **everything**. *"`main.ts` does not contain X"* is trivially
// true once X has moved to `ribbon.ts` — and `main.ts` is exactly the file things
// move out of, because the split waves emptied it (3,536 → 1,473 lines). A fence
// written that way still passes, still reads like evidence, and no longer is.
// `main.ts` was the subject of nine of these; #212 is that bill.
//
// So the absence form is `whereInSource(pattern)`, which answers **which files
// match**, over the whole of `src/`. An empty list is the fact; a non-empty list
// names the file that has to be fixed, which is what a red fence should say.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SRC } from "../tools/paths.mjs";

/** Every `.ts` file under `src/`, relative, sorted. */
export function sourceFiles() {
  const walk = (dir, prefix) => {
    const out = [];
    for (const name of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      if (name.isDirectory()) out.push(...walk(path.join(dir, name.name), rel));
      else if (name.name.endsWith(".ts")) out.push(rel);
    }
    return out;
  };
  return walk(SRC, "");
}

/** One module's source text. */
export function srcOf(name) {
  return readFileSync(path.join(SRC, name), "utf8");
}

/**
 * The names of the files under `src/` that contain `pattern`.
 *
 * `pattern` may be a regex or a plain string; a string is a literal containment
 * test, because half of these fences are about `menu.includes("…")` and turning
 * a literal into a hand-escaped regex is how a fence starts testing its own
 * escaping.
 */
export function whereInSource(pattern) {
  const test =
    typeof pattern === "string"
      ? (text) => text.includes(pattern)
      : (text) => pattern.test(text);
  return sourceFiles().filter((name) => test(srcOf(name)));
}

/**
 * How every assertion above is written: the answer must be *nowhere*, and the
 * message is the list of files that match, so a regression names where it is.
 *
 * `check` would print `got ["ribbon.ts"], want ""`, which is fine too — this
 * exists so the call site reads as the sentence it is asserting.
 */
export const nowhere = (pattern) => whereInSource(pattern).join(", ");

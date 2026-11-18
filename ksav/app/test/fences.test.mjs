// The fences that read source text, held to the strength of the claim they make.
//
// # The finding (#212)
//
// Seventeen test files read `src/main.ts` as text and assert on what they find.
// That is legitimate — some facts about this program really are facts about
// text, because what is being asserted is that some code is **not there**. But
// `main.ts` is the one file things *leave*: the split waves took 2,063 lines out
// of it (3,536 → 1,473). So the two shapes are not equally safe:
//
// * **A positive regex** (`ok(/wireMinimapPanel\\(/.test(MAIN))`) is
//   self-policing. The symbol leaves, the regex stops matching, the assertion
//   goes red, and the person who moved the code finds out immediately.
//
// * **An absence claim** (`notOk(/readable\\(kb\\[/.test(MAIN))`) is the dangerous
//   one. It is *trivially true* of a file the code has left. It still passes, it
//   still reads like evidence, and it no longer is. `find.test.mjs` had one,
//   `panelede.test.mjs` had one, `styleediting.test.mjs` had two — including a
//   union of three named surfaces, which is safe against a move into a fourth.
//
// All four now ask the whole of `src/` (see `test/source.mjs`), which is what
// they were trying to say in the first place.
//
// # The rule this file is
//
// **No test asserts that a pattern is absent from `main.ts`.** An absence claim
// is about all of `src/` (`nowhere(…)`), or about a module that is a subject in
// its own right — `panesystem.test.mjs`'s *"`ribbon.ts` does not import
// `./main`"* is about `ribbon.ts`'s habits, not about a file the code evacuates.
// Every exemption is listed below with its reason, and an exemption whose file
// no longer needs it fails, so the list can only shrink.
//
// This is deliberately a rule about *text fences over `main.ts`* rather than a
// ban on reading source text: the last section of this file asserts that reading
// is still happening, because a rule that quietly stopped applying would be the
// same defect one level up.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { check, ok } from "./harness.mjs";
import { TEST } from "../tools/paths.mjs";

/** Files under `src/` that tests are meant to be able to read as text. */
const MAIN = "main.ts";

/**
 * Exemptions, each with the reason it is not the vacuous shape.
 *
 * Empty on purpose: the four that existed are fixed. An entry here has to say
 * why its subject is a module rather than the file everything leaves, and the
 * check below fails an entry that no longer has a violation to excuse.
 */
const EXEMPT = new Map();

/** Every test file, sorted, and its text. */
function testFiles() {
  return readdirSync(TEST)
    .filter((n) => n.endsWith(".test.mjs"))
    .map((n) => [n, readFileSync(path.join(TEST, n), "utf8")]);
}

/** The names a file binds the text of `main.ts` to (`MAIN`, `main`, …). */
function mainTextNames(text) {
  const names = new Set();
  // A binding whose initialiser reads `main.ts` — however it spells the path,
  // because the seventeen files do it three different ways:
  // `path.join(SRC, "main.ts")`, `new URL("../src/main.ts", import.meta.url)`
  // and a bare `"src/main.ts"`. Matching the *statement* rather than the path
  // literal is what makes that one rule instead of three.
  for (const m of text.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=[\s\S]{0,400}?;/gu)) {
    if (m[0].includes("readFileSync") && m[0].includes("main.ts")) names.add(m[1]);
  }
  return names;
}

/** Every `notOk(…)` call in a file, as `{ line, body }`. */
function absenceCalls(text) {
  const out = [];
  const needle = "notOk(";
  let at = text.indexOf(needle);
  while (at !== -1) {
    const line = text.slice(0, at).split("\n").length;
    // Balanced scan to the closing paren, so a nested call or a regex containing
    // parentheses does not truncate the body.
    // A scan that knows about strings and escapes, because a fence *about text*
    // is full of both: `"loadBody(tpl.body)"` is a balanced string, and a regex
    // saying `/trim\(/` is an escaped parenthesis that must not count. Counting
    // every character made `retention.test.mjs`'s call look unclosed and blamed
    // the wrong assertion — the first version of this file reported a `main.ts`
    // violation in a test that only reads `docs.ts`.
    let depth = 0;
    let quote = null;
    let i = at + needle.length - 1;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        continue;
      }
      if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ line, body: text.slice(at, i + 1) });
    at = text.indexOf(needle, i + 1);
  }
  return out;
}

export async function run() {
  const files = testFiles();

  // ------------------------------------------------- what the rule is about
  {
    const readers = files.filter(([, text]) => mainTextNames(text).size > 0);
    ok(
      `some tests do read ${MAIN} as text, so this rule has a subject (${readers.length} files)`,
      readers.length > 0,
    );
  }

  // ------------------------------------------------------- the rule itself
  {
    const offenders = [];
    for (const [name, text] of files) {
      const names = mainTextNames(text);
      if (!names.size) continue;
      if (EXEMPT.has(name)) continue;
      for (const call of absenceCalls(text)) {
        const found = [...names].filter((n) => new RegExp(`\\b${n}\\b`, "u").test(call.body));
        if (found.length) {
          offenders.push(`${name}:${call.line} (` + found.join(", ") + ")");
        }
      }
    }
    check(
      `no test asserts a pattern is absent from ${MAIN} — that is true of a file the code has left`,
      offenders.join("; "),
      "",
    );
  }

  // --------------------------------------------------- exemptions still owed
  {
    const stale = [];
    for (const name of EXEMPT.keys()) {
      const entry = files.find(([n]) => n === name);
      if (!entry) {
        stale.push(`${name} (no such test file)`);
        continue;
      }
      const names = mainTextNames(entry[1]);
      const still = absenceCalls(entry[1]).some((c) =>
        [...names].some((n) => new RegExp(`\\b${n}\\b`, "u").test(c.body)),
      );
      if (!still) stale.push(`${name} (no violation left to excuse)`);
    }
    check(
      "every exemption still has a violation to excuse, so the list can only shrink",
      stale.join("; "),
      "",
    );
  }

  // -------------------------------------- the whole-source form is the one
  {
    // `nowhere(…)` is the shape the four conversions took, and it is only worth
    // anything if it reads *all* of `src/` rather than a list somebody maintains.
    const { sourceFiles, whereInSource } = await import("./source.mjs");
    const all = sourceFiles();
    ok(`the whole-source reader sees every module (${all.length})`, all.length > 100);
    ok("…including the one things leave", all.includes(MAIN));
    // A pattern that is certainly present somewhere, so the reader cannot pass by
    // finding nothing at all.
    ok(
      "…and it finds what is there",
      whereInSource(/export function/).length > 5,
    );
    check(
      "…and reports nothing for a pattern that is not",
      whereInSource("this string is not in the source of this application").join(", "),
      "",
    );
  }
}

// The catches that decide the writer does not need to know, and say why.
//
// # Why this exists (#220)
//
// Fifty-two `catch` blocks in `src/` discard the exception and answer a default
// — an empty list, `false`, `null`, nothing at all. Some are right: polling a
// server that is down, a picker the writer cancelled, a `localStorage` write in
// a browser out of room. Some are how a failure becomes invisible, which is the
// one thing this repository is named for.
//
// Nothing distinguished the two. The reasons lived in prose comments of wildly
// varying quality — from four careful lines to *none at all*:
//
//     *.ts:385   // A word list is a few kilobytes; if this fails the browser is out of room
//     files.ts:593   return false;                 (a permission probe, no reason)
//     store.ts:312   return false;                 (a capability probe, no reason)
//
// So the rule is a **marker**, not a review: a catch that swallows its exception
// must carry a `// silent:` line naming what was swallowed and why silence is
// the honest answer. The marker is the reason in the place a reader of the catch
// is already looking, and a fence can hold it — which a prose comment cannot.
//
// # What counts as silent
//
// A catch whose body is empty, or is nothing but a `return` of something that
// cannot itself fail — a literal, a name, `null`, `[]`, `false`, an object
// literal of defaults. A catch that calls something is **not** counted: this
// sweep cannot tell a pure default from a report, and guessing at function names
// is how a fence starts lying. Four of #220's fifty-two fell on that line by
// this definition and are not in the count; the marker rule had nothing to hold
// them by.
//
// That trap is worth naming, because it recurs: a test that keeps the
// interesting half of a problem and stops is prettier than no test and worse
// than an honest one.
//
// The count is asserted. Growth is a decision somebody writes down.

import { check, ok } from "./harness.mjs";
import { srcOf, sourceFiles } from "./source.mjs";

/** Source with comments blanked — offsets and newlines preserved. */
function bare(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      out += "  ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < text.length) {
        out += text[i];
        if (text[i] === "\\") {
          out += text[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Every catch in `src/` whose body answers a default, and whether it says why. */
function silentCatches() {
  const found = [];
  for (const file of sourceFiles()) {
    // `wasm-bindgen`'s glue is not this program's writing.
    if (file.startsWith("wasmpkg/")) continue;
    const raw = srcOf(file);
    const body = bare(raw);
    for (const m of body.matchAll(/catch\s*(?:\([^)]*\))?\s*\{/gu)) {
      const open = m.index + m[0].length - 1;
      let depth = 0;
      let end = -1;
      for (let i = open; i < body.length; i += 1) {
        if (body[i] === "{") depth += 1;
        else if (body[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) continue;
      const inner = body.slice(open + 1, end).trim();
      // Empty, or one `return` of something that cannot itself fail.
      const silent = inner === "" || /^return\s+[^;()]*;?$/u.test(inner);
      if (!silent) continue;
      const whole = raw.slice(m.index, end + 1);
      // The reason may be inside the block or on the line above it — a `catch`
      // whose reason is written above is the same claim in the same place.
      const above = raw.slice(raw.lastIndexOf("\n", m.index - 1) + 1, m.index);
      found.push({
        file,
        line: raw.slice(0, m.index).split("\n").length,
        why: /silent:/u.test(whole) || /silent:/u.test(above),
        body: inner.replace(/\s+/gu, " ").slice(0, 50),
      });
    }
  }
  return found;
}

/** How many silent catches the tree has, as a claim rather than a tally. */
const TOTAL = 49;

export async function run() {
  const silent = silentCatches();

  ok("the sweep found silent catches, so it has a subject", silent.length > 30, `${silent.length} catches`);

  check(
    "every catch that swallows its exception says why silence is honest",
    silent.filter((s) => !s.why).map((s) => `${s.file}:${s.line}`),
    [],
  );

  check(
    `the tree has exactly the ${TOTAL} silent catches reasoned about here`,
    silent.length,
    TOTAL,
  );

  // A catch that does something with the failure is not this file's subject, and
  // saying so keeps the sweep from being read as "all 55 catches are silent".
  {
    const total = [...sourceFiles().filter((f) => !f.startsWith("wasmpkg/"))]
      .map((f) => [...bare(srcOf(f)).matchAll(/catch\s*(?:\([^)]*\))?\s*\{/gu)].length)
      .reduce((a, b) => a + b, 0);
    ok("and the ones that report, retry or fall back are not counted as silent", total > silent.length);
  }
}

// A check that cannot run must fail, not pass.
//
// # The finding
//
// Relayed from Girsa: a check there returned success on machines with no
// browser, under a comment saying *"CI that wants it enforced can set the
// variable"* — and no CI job ever set it. The check was green everywhere and
// ran nowhere.
//
// The class is wider than the browser, and this repository has its own members.
// A sweep found 634 Rust tests and four of them could report success having
// checked nothing:
//
//   - `facts.rs` and `apparatus_golden.rs` each read an environment variable
//     that *rewrites the thing the test compares against* and then returned.
//     One `export KSAV_BLESS=1` in a shell profile turned the stale-artefact
//     fence into a test that writes a file and passes, on that machine, for
//     good, without a word.
//   - `chooser.rs` and `structure.rs` each skip cases for good reasons and had
//     no floor under the skipping. Rename one field in the chooser's output, or
//     break the prelude so nothing compiles, and the loop takes the `continue`
//     every time and the test is green.
//
// # The two rules
//
// **Blessing is not passing.** A test that reads an environment variable must
// refuse to honour it where nobody could have meant it — which in practice
// means naming `CI`. The check itself must still happen: both of the two above
// now write the file and then compare against what actually landed on disk.
//
// **A skip needs a floor.** A test that `continue`s past cases must assert it
// reached some. The floor may live in a helper the test calls — `scan_oracle.rs`
// does exactly that, and its `assert_clean` is the shape to copy — so this
// looks one level through.
//
// # The editor's half
//
// `test/run.mjs` holds the same rule dynamically: a file whose `run()` returns
// having asserted nothing is a failure, by name. It cannot be checked
// statically here — a JavaScript test asserts by calling `ok()`, and whether it
// called it is a fact about the run — so it is checked where the answer is, and
// this file only asserts the guard is still there.

import { check, ok } from "./harness.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../tools/paths.mjs";

/** Directories that hold other people's code, or build output. */
const SKIP = new Set(["target", "node_modules", ".git", "dist", ".tmp-test"]);

/** Every Rust file in the repository. */
function rustFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".rs")) out.push(full);
    }
  };
  walk(ROOT);
  return out;
}

/**
 * Line comments out.
 *
 * Every paragraph in this file's subjects explains what the old arrangement
 * was, and several of them quote `continue` and `KSAV_BLESS` while doing it. A
 * sweep that read prose would report the explanation as the defect.
 */
const strip = (s) => s.replace(/^\s*\/\/.*$/gmu, "");

/**
 * The same text with every string and character literal blanked out, character
 * for character, so offsets still line up.
 *
 * Not fastidiousness. Counting braces without this is wrong in the direction
 * that matters: `manifests.rs` contains `line.contains('{')`, a lone opening
 * brace inside a character literal, and a naive counter walked straight past
 * the end of that test and swallowed the two after it — inheriting a floor from
 * a sibling and reporting the file clean. A sweep that silently over-reads its
 * subject is the failure with the worst shape, because it reports green.
 */
function masked(text) {
  const out = text.split("");
  const n = text.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const c = text[i];
    // `r"…"`, `r#"…"#`, `r##"…"##`
    if (c === "r" && (text[i + 1] === '"' || text[i + 1] === "#")) {
      let j = i + 1;
      let hashes = 0;
      while (text[j] === "#") (hashes++, j++);
      if (text[j] === '"') {
        const close = `"${"#".repeat(hashes)}`;
        const end = text.indexOf(close, j + 1);
        const stop = end < 0 ? n : end + close.length;
        blank(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      blank(i, j);
      i = j;
      continue;
    }
    // A character literal, and not a lifetime: `'x'` closes, `'a` does not.
    if (c === "'") {
      const m = /^'(?:\\.|[^'\\])'/u.exec(text.slice(i, i + 6));
      if (m) {
        blank(i, i + m[0].length);
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return out.join("");
}

/** `[from, to)` of the body of a `{ … }` whose brace is at `open`. */
function block(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return [open + 1, i];
  }
  return [open + 1, code.length];
}

/** `[name, from, to]` for every `#[test]` function, read off the masked text. */
function tests(code) {
  const out = [];
  for (const m of code.matchAll(/#\[test\]\s*(?:#\[[^\]]*\]\s*)*fn\s+([a-z0-9_]+)\s*\(\s*\)\s*\{/gu)) {
    out.push([m[1], ...block(code, m.index + m[0].length - 1)]);
  }
  return out;
}

/**
 * `[name, from, to]` for every function that is *not* a test.
 *
 * Tests are excluded deliberately. A test may borrow a floor from a helper it
 * calls; it may not borrow one from an unrelated sibling that happens to share
 * a word with it, which is what including them allowed.
 */
function helperRanges(code) {
  const testAt = new Set(
    [...code.matchAll(/#\[test\]\s*(?:#\[[^\]]*\]\s*)*fn\s+([a-z0-9_]+)/gu)].map((m) => m[1]),
  );
  const out = [];
  for (const m of code.matchAll(/\bfn\s+([a-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/gu)) {
    if (testAt.has(m[1])) continue;
    const open = code.indexOf("{", m.index);
    if (open < 0) continue;
    out.push([m[1], ...block(code, open)]);
  }
  return out;
}

/**
 * A count with a number under it.
 *
 * Spelled as four shapes rather than one, because the repository already writes
 * the floor four ways and a rule that only recognised `> 0` would make three
 * correct tests look wrong — which is how a sweep gets a blanket exemption.
 */
const FLOOR = [
  /assert!\s*\(\s*[\w.()]+\s*>=?\s*\d/u,
  /assert!\s*\(\s*!\s*[\w.()]+\.is_empty\(\)/u,
  /assert_ne!\s*\(\s*[\w.()]+\s*,\s*0\b/u,
  /assert_eq!\s*\(\s*[\w.()]+\.len\(\)\s*,/u,
];

const hasFloor = (body) => FLOOR.some((r) => r.test(body));

export async function run() {
  const files = rustFiles();
  ok("there are Rust files to sweep", files.length > 0);

  const swept = [];
  const envGated = [];
  const floorless = [];

  for (const full of files) {
    const rel = path.relative(ROOT, full).replace(/\\/gu, "/");
    // This file names both forbidden shapes in order to look for them, and
    // `skipscan` prose above quotes them too — but it is JavaScript, so it is
    // not in this sweep at all. The exemption every prohibition needs, taken
    // by construction rather than by name.
    const text = strip(readFileSync(full, "utf8"));
    // Structure is read off the masked copy so a brace in a string cannot move
    // a function's end; content — `"CI"` — is read off the text itself, at the
    // same offsets, because masking is what removes it.
    const code = masked(text);
    const helpers = helperRanges(code).map(([n, a, b]) => [n, code.slice(a, b)]);

    for (const [name, from, to] of tests(code)) {
      swept.push(`${rel}::${name}`);
      const body = code.slice(from, to);
      const said = text.slice(from, to);

      // Rule one: a variable that changes what the test does must be refused
      // where nobody chose it.
      if (/\benv::var(?:_os)?\s*\(/u.test(body) && !/"CI"/u.test(said)) {
        envGated.push(`${rel}::${name}`);
      }

      // Rule two: skipping needs a floor — here, or in something this test
      // calls. One level, which is what `scan_oracle.rs::assert_clean` needs.
      if (!/\bcontinue\b/u.test(body)) continue;
      if (hasFloor(body)) continue;
      const through = helpers
        .filter(([n]) => n !== name && new RegExp(String.raw`\b${n}\s*\(`, "u").test(body))
        .some(([, b]) => hasFloor(b));
      if (!through) floorless.push(`${rel}::${name}`);
    }
  }

  // The fence's own floor, which is the rule applied to the rule. A walk that
  // silently stopped finding Rust files would report both sweeps clean.
  ok(
    `the sweep reached ${swept.length} Rust tests`,
    swept.length > 500,
    );

  check(
    "no test lets an environment variable decide whether it checks anything" +
      (envGated.length
        ? `\n    ${envGated.join("\n    ")}\n    Such a test passes on any machine where the variable is set, and it` +
          " is set by\n    an `export` somebody forgot about. Honour it only where it was chosen:" +
          '\n    assert `env::var_os("CI").is_none()` beside it, and do the comparison anyway.'
        : ""),
    envGated.length,
    0,
  );

  check(
    "no test can skip every case and still pass" +
      (floorless.length
        ? `\n    ${floorless.join("\n    ")}\n    Count what was actually checked and assert a floor under it — directly,` +
          " or in a\n    helper the test calls, the way `scan_oracle.rs::assert_clean` does."
        : ""),
    floorless.length,
    0,
  );

  // And the editor's half, which is enforced at run time rather than here.
  const runner = readFileSync(path.join(ROOT, "ksav/app/test/run.mjs"), "utf8");
  ok(
    "the editor runner still fails a file that asserted nothing",
    runner.includes("ASSERTED NOTHING") && runner.includes("silent.length ? 1 : 0"),
  );
}

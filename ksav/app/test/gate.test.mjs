// One runner for the gate, and a fence against it growing a list again.
//
// # The finding
//
// The README told a developer to run six commands and `ci.yml` wrote nine steps
// out again beside them. What that arrangement produced is measurable: for four
// consecutive pushes the **only** red job on `main` was `formatting`, failing at
// its first step in eleven seconds while every other job went green, and
// fifty-four unformatted hunks accumulated underneath it.
//
// The gate was there. It was cheap. It was the seventh thing to remember, so it
// was the first thing forgotten.
//
// `ksav/tools/gate.mjs` is now the only place a check command is written. This
// file is the reason that stays true, and it sweeps in both directions:
//
//   forward   every group the runner declares is run by some job in `ci.yml`
//   backward  no check command appears as a literal anywhere else
//
// The backward sweep is the one that matters. A single runner other files are
// free to route around is a single runner for about a month — the second copy
// always arrives as one convenient line in one workflow step, which is exactly
// how the nine steps this replaces came to exist.
//
// # What is deliberately not swept
//
// `app/package.json`. Its `test` script is the *definition* of `npm test` and
// the thing the runner calls; its `build` script typechecks as part of building.
// Neither is a second statement of the gate, and gating them would mean the
// runner could not call anything.
//
// `decisions/` and the other dated logs. A log records what was run on a day,
// and a record of the past is not a rule that can drift — `livingPages()` draws
// that line for the whole documentation fence and this uses the same one.

import { check, ok } from "./harness.mjs";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { CHECKS, GROUPS, GATE_VERBS, KSAV } from "../../tools/gate.mjs";
import { ROOT, livingPages } from "./docfacts.mjs";

/** The workflow the *forward* sweep is about: the one that runs on every push. */
const WORKFLOW = ".github/workflows/ci.yml";
const RUNNER = "tools/gate.mjs";

/**
 * Every workflow, because the backward sweep was written against `ci.yml` alone
 * and that was not enough by five.
 *
 * `release.yml` ran `npx tsc --noEmit`, `npm test` and `cargo test --release`
 * twice over, and `deploy.yml` ran `npm test` — and `deploy.yml`'s copy had
 * already drifted, running the suite without the typechecker beside it, which
 * is the drift in miniature: two lines to remember, one of them remembered.
 * A fence aimed at one file would have waved all five through while the
 * README's own section was clean.
 */
function workflows() {
  const dir = path.join(ROOT, ".github", "workflows");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => `.github/workflows/${f}`);
}

/** Every line of a file, with its 1-based number, minus YAML comments. */
function codeLines(text) {
  return text
    .split(/\r?\n/)
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => !line.trim().startsWith("#"));
}

/**
 * The lines inside fenced code blocks of a markdown page.
 *
 * Prose is not swept, and that is a distinction rather than a shortcut: this
 * README says "`cargo test` fails on any English supplement entry" as a fact
 * about the engine, and a fence that could not tell that from an instruction to
 * run `cargo test` would be one people learn to work around.
 */
function fencedLines(text) {
  const out = [];
  let inside = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trimStart().startsWith("```")) {
      inside = !inside;
      return;
    }
    if (inside) out.push([i + 1, line]);
  });
  return out;
}

/**
 * Is this line allowed to name a check command?
 *
 * One way, and only one: it carries a filter. A filtered run is by construction
 * not the gate — `npm test -- panels` is the inner loop, the thing a developer
 * runs forty times an hour, and routing it through a whole-gate runner would be
 * worse documentation, not better.
 *
 * Deliberately *not* "the line also invokes the runner". That reads like a
 * sensible escape and it is a hole the exact width of the finding:
 * `node tools/gate.mjs editor && cargo test` would sail through it. Nothing
 * needs the escape anyway — a line that only calls the runner names no verb.
 */
function permitted(line) {
  return /npm test --\s+\S/.test(line);
}

/** The gate verbs a line names. */
function verbsIn(line) {
  return GATE_VERBS.filter((v) => line.includes(v));
}

export async function run() {
  // ------------------------------------------------ the runner describes itself

  ok("the gate has checks in it", CHECKS.length > 0);
  check("every check has a distinct id", new Set(CHECKS.map((c) => c.id)).size, CHECKS.length);

  for (const c of CHECKS) {
    ok(`${c.id} runs somewhere real`, existsSync(path.join(KSAV, c.cwd)));
    ok(`${c.id} is a command`, Array.isArray(c.command) && c.command.length > 0);
    // The reason is not decoration. Every check here is one somebody will
    // eventually want to delete on a slow morning, and the four that were
    // already missing — clippy on two of the three Rust trees, formatting on
    // two of them — went missing because nothing said what they were for.
    ok(`${c.id} says what it is for`, typeof c.why === "string" && c.why.length > 20);
    ok(`${c.id} belongs to a group`, GROUPS.includes(c.group));
  }

  // ------------------------------------------------------- forward: CI runs them

  const workflowPath = path.join(ROOT, WORKFLOW);
  ok(`${WORKFLOW} exists`, existsSync(workflowPath));
  const workflow = readFileSync(workflowPath, "utf8");
  const wLines = codeLines(workflow);

  // Every group named on a runner invocation in the workflow. An invocation
  // with no group runs everything, so it covers all of them.
  const invoked = new Set();
  let invocations = 0;
  for (const [, line] of wLines) {
    if (!line.includes(RUNNER)) continue;
    invocations += 1;
    const after = line.slice(line.indexOf(RUNNER) + RUNNER.length).trim();
    const named = after.split(/\s+/).filter((w) => w && !w.startsWith("-"));
    if (!named.length) for (const g of GROUPS) invoked.add(g);
    for (const w of named) invoked.add(w);
  }

  ok("the workflow calls the runner", invocations > 0);

  // A group named in the workflow that the runner does not have runs nothing at
  // all, and a step that runs nothing exits 0. That is the failure shape G3 is
  // about: a check that passes because it could not run.
  for (const g of invoked) {
    ok(`ci.yml names a real group: ${g}`, GROUPS.includes(g));
  }

  // And the other direction, which is the one a new check gets wrong: added to
  // the runner, run on the desk, never run on the remote.
  for (const g of GROUPS) {
    ok(`ci.yml runs the ${g} group`, invoked.has(g));
  }

  // -------------------------------------------- backward: nobody else lists them

  const files = workflows();
  ok("there are workflows to sweep", files.length > 0);
  ok("ci.yml is one of them", files.includes(WORKFLOW));

  const strays = [];
  for (const file of files) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    for (const [n, line] of codeLines(text)) {
      if (permitted(line)) continue;
      for (const verb of verbsIn(line)) strays.push([file, n, verb, line.trim()]);
    }
  }

  for (const page of livingPages()) {
    const text = readFileSync(path.join(ROOT, page), "utf8");
    for (const [n, line] of fencedLines(text)) {
      if (permitted(line)) continue;
      for (const verb of verbsIn(line)) strays.push([page, n, verb, line.trim()]);
    }
  }

  ok(
    "no file outside the runner spells a check command out" +
      (strays.length
        ? `\n    ${strays
            .map(([f, n, v, l]) => `${f}:${n} names \`${v}\` — ${l}`)
            .join("\n    ")}\n    Every check lives in ksav/${RUNNER}. Call it by group instead;` +
          " a second copy of a command is the drift this fence exists to catch."
        : ""),
    strays.length === 0,
  );

  // ------------------------------------------------ and the README points at it

  const readme = readFileSync(path.join(ROOT, "ksav/README.md"), "utf8");
  ok(
    "the README tells a developer the one command",
    fencedLines(readme).some(([, l]) => l.includes(RUNNER)),
  );
}

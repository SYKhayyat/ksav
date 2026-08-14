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
  // A filtered run.
  if (/npm test --\s+\S/.test(line)) return true;
  // A run that **writes** rather than checks.
  //
  // `KSAV_BLESS=1 cargo test --test facts` regenerates
  // `engine/facts.gen.json`; the gate's engine check runs the same test in its
  // verifying mode. So this is not a second copy of a check — it is the only
  // way to perform a different operation, and it is by construction not the
  // gate for the same reason a filtered run is not.
  //
  // Found by writing a contributor guide: the sweep refused it, correctly by
  // its own rule, and the rule was wrong. What that surfaced is worse than the
  // refusal — **the bless command was in no living page at all**, so anybody
  // editing a table in Rust had no documented way to regenerate what depends on
  // it, and would meet it as a red suite instead.
  //
  // Narrow on purpose: the escape is the environment variable, not the verb. A
  // bare `cargo test` in a page is still refused.
  if (/\bKSAV_BLESS=1\b/.test(line)) return true;
  return false;
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

  // ------------------------------------- the release engine check is not an hour
  //
  // `--release` brings `lto = "thin"` with it, and `ksav/engine/tests/` is forty
  // files, so cargo links forty binaries and each one is a whole-program
  // optimisation pass over the whole Typst compiler. Measured on the runner:
  // seventy-five minutes, of which clippy is 31 seconds and the tests are
  // eleven. `CARGO_PROFILE_RELEASE_LTO` on the step is what takes it off.
  //
  // Swept rather than written once, because there are three of these steps
  // across two workflows and the fourth one is the one that will be added
  // without it — a step that is merely *slow* fails no check and nobody reads a
  // green job's duration. This is the only thing here that would notice.
  {
    const LTO_OFF = "CARGO_PROFILE_RELEASE_LTO";
    const missing = [];
    for (const file of files) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      // Steps are list items at six spaces in both workflows; splitting there
      // gives one string per step, which is the scope the `env:` belongs to.
      for (const step of text.split(/^ {6}- /m).slice(1)) {
        if (!/gate\.mjs\s+engine\s+--release/.test(step)) continue;
        if (!step.includes(LTO_OFF)) missing.push(`${file}: ${step.split("\n")[0].trim()}`);
      }
    }
    ok(
      `every release engine check turns link-time optimisation off` +
        (missing.length
          ? `\n    ${missing.join("\n    ")}\n    Without ${LTO_OFF}: "false" that step links forty` +
            " test binaries with thin LTO, which measured seventy-five minutes."
          : ""),
      missing.length === 0,
    );
    // And the sweep has something to sweep. Written after the first draft passed
    // on a regex that matched no step at all — the same shape as the `#preview`
    // selector that reported `0 pages` for thirteen runs.
    const found = files
      .map((f) => readFileSync(path.join(ROOT, f), "utf8"))
      .flatMap((t) => t.split(/^ {6}- /m).slice(1))
      .filter((s) => /gate\.mjs\s+engine\s+--release/.test(s));
    ok(`there are release engine checks to sweep (${found.length})`, found.length >= 3);
  }

  // ------------------------------------------------ and the README points at it

  const readme = readFileSync(path.join(ROOT, "ksav/README.md"), "utf8");
  ok(
    "the README tells a developer the one command",
    fencedLines(readme).some(([, l]) => l.includes(RUNNER)),
  );
}

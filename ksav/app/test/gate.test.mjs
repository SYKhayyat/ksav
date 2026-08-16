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
import { CHECKS, GROUPS, TREES, NAMES, GATE_VERBS, KSAV, select, summarise } from "../../tools/gate.mjs";
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
    ok(`${c.id} belongs to a tree`, TREES.includes(c.tree));
  }

  // --------------------------------------- naming a tree checks the whole tree
  //
  // The finding, and it is the file header's own finding recurring one level in:
  // `gate.mjs engine` ran clippy and the engine tests and skipped `fmt-engine`,
  // a one-second `cargo fmt -- --check` **in the same crate**. It printed "the
  // gate is green", the push went out, and `formatting` was the only red job on
  // `main` — which is verbatim the four-push failure this runner was built to
  // end. The cause was one namespace holding two axes: `fmt` names a kind of
  // check, `engine` names a body of code, and selecting on one silently dropped
  // the other's checks over the very same source.
  //
  // So: every check about a tree runs when that tree is named. Not a property of
  // today's list — a property `select` has to keep as checks are added, which is
  // why it is swept rather than spot-checked.
  {
    const missed = [];
    for (const c of CHECKS) {
      if (!select([c.tree]).includes(c)) missed.push(`${c.id} is about ${c.tree} and \`gate.mjs ${c.tree}\` does not run it`);
    }
    ok(
      "naming a tree runs every check about that tree" +
        (missed.length
          ? `\n    ${missed.join("\n    ")}\n    A name that reads as "check the engine" has to check the engine;` +
            " the last time it did not, the only red job on main was formatting."
          : ""),
      missed.length === 0,
    );
    // The same for a group, which is the axis `ci.yml` selects on.
    const dropped = CHECKS.filter((c) => !select([c.group]).includes(c));
    ok(`naming a group runs every check in it`, dropped.length === 0);
    // Same cwd, same tree. Two checks over one directory that disagreed about
    // which tree they are about would reopen the hole from the other side.
    for (const cwd of new Set(CHECKS.map((c) => c.cwd))) {
      const trees = new Set(CHECKS.filter((c) => c.cwd === cwd).map((c) => c.tree));
      ok(`every check in ${cwd} names the same tree`, trees.size === 1);
    }
    ok("every name selects something", NAMES.every((n) => select([n]).length > 0));
  }

  // ------------------------------------ a partial run says what it did not run
  //
  // "the gate is green — 2 checks" is what a two-of-nine run used to print. The
  // sentence is false and it is false in the direction that matters: it is the
  // answer a developer reads immediately before pushing. Same shape as the
  // acceptance run that stopped halfway and reported that nothing had failed —
  // a partial result wearing a complete one's words.
  //
  // Selecting a group stays correct and normal; `ci.yml` does it in five jobs.
  // What changed is that the summary now names the checks that did not run.
  {
    const green = (checks) =>
      summarise(
        checks.map((check) => ({ check, ok: true, secs: 0.1, shown: check.command.join(" ") })),
        CHECKS.filter((c) => !checks.includes(c)),
      ).join("\n");

    const whole = green(CHECKS);
    ok("a whole green run says the gate is green", whole.includes("the gate is green"));

    const part = green(select(["editor"]));
    ok("a partial green run does not claim the gate is green", !part.includes("the gate is green"));
    const unrun = CHECKS.filter((c) => c.group !== "editor" && c.tree !== "editor");
    ok("there are checks a partial run misses", unrun.length > 0);
    const unnamed = unrun.filter((c) => !part.includes(c.id));
    ok(
      "a partial green run names every check it did not run" +
        (unnamed.length ? `\n    unnamed: ${unnamed.map((c) => c.id).join(", ")}\n    ${part}` : ""),
      unnamed.length === 0,
    );

    // A red run reports the failure and nothing else — the reproduction command
    // is the only thing anybody reads at that point, and burying it under six
    // lines of what-did-not-run is how it stops being read.
    const red = summarise(
      [{ check: CHECKS[0], ok: false, secs: 0.1, shown: CHECKS[0].command.join(" ") }],
      CHECKS.slice(1),
    ).join("\n");
    ok("a red run leads with the failure", red.includes("failed. To reproduce:"));
    ok("a red run does not call itself green", !red.includes("the gate is green"));
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
    if (!named.length) for (const g of NAMES) invoked.add(g);
    for (const w of named) invoked.add(w);
  }

  ok("the workflow calls the runner", invocations > 0);

  // A name in the workflow that the runner does not have selects nothing at
  // all, and a step that runs nothing exits 0. That is the failure shape G3 is
  // about: a check that passes because it could not run.
  for (const g of invoked) {
    ok(`ci.yml names something real: ${g}`, NAMES.includes(g));
  }

  // And the other direction, which is the one a new check gets wrong: added to
  // the runner, run on the desk, never run on the remote.
  //
  // Per **check**, not per group. Asking whether every group name appears is a
  // weaker question than it looks — a check can be added to an existing group
  // whose name is already in the workflow, and the group sweep goes green
  // without the new check having run anywhere. The union of what the jobs
  // select has to be the whole gate, and nothing less says that.
  {
    const unrun = CHECKS.filter((c) => !invoked.has(c.group) && !invoked.has(c.tree));
    ok(
      "every check in the runner is run by some job in ci.yml" +
        (unrun.length
          ? `\n    ${unrun.map((c) => `${c.id} — no job selects ${c.group} or ${c.tree}`).join("\n    ")}` +
            `\n    ci.yml selects: ${[...invoked].join(" ")}`
          : ""),
      unrun.length === 0,
    );
  }

  // ------------------------------ a job installs the components its checks need
  //
  // `cargo clippy` and `cargo fmt` are rustup components, not part of a minimal
  // toolchain, and `dtolnay/rust-toolchain` installs a minimal one. Every job
  // that selects a check needing a component has to ask for it — and until this
  // swept, the desktop job had been running clippy for weeks on nothing but the
  // runner image happening to ship it, which is a green that belongs to Azure's
  // packaging decisions rather than to this repository.
  //
  // It bit for real when a name started selecting on the tree axis: `engine` and
  // `shell` began pulling their formatting checks in, and three jobs across two
  // workflows would have started running `cargo fmt` without declaring rustfmt.
  // Per job, because that is the scope an installed component has.
  {
    const NEEDS = [
      ["cargo clippy", "clippy"],
      ["cargo fmt", "rustfmt"],
    ];
    const undeclared = [];
    let jobsSweeping = 0;
    for (const file of workflows()) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      // Jobs are the two-space keys under `jobs:`; everything below one, until
      // the next, is its steps — which is the scope a toolchain install has.
      const after = text.slice(text.indexOf("\njobs:"));
      for (const block of after.split(/^ {2}(?=[A-Za-z][\w-]*:$)/m).slice(1)) {
        const job = block.split(":")[0];
        const names = new Set();
        for (const line of block.split(/\r?\n/)) {
          if (!line.includes(RUNNER) || line.trim().startsWith("#")) continue;
          const rest = line.slice(line.indexOf(RUNNER) + RUNNER.length).trim();
          const said = rest.split(/\s+/).filter((w) => w && !w.startsWith("-"));
          for (const n of said.length ? said : NAMES) names.add(n);
        }
        if (!names.size) continue;
        jobsSweeping += 1;
        const commands = select([...names]).map((c) => c.command.join(" "));
        for (const [verb, component] of NEEDS) {
          if (!commands.some((c) => c.startsWith(verb))) continue;
          if (new RegExp(`components:.*\\b${component}\\b`).test(block)) continue;
          undeclared.push(`${file} · ${job}: runs \`${verb}\` and never installs ${component}`);
        }
      }
    }
    ok(`there are gate jobs to sweep for components (${jobsSweeping})`, jobsSweeping >= 4);
    ok(
      "every job installs the rustup components its checks need" +
        (undeclared.length
          ? `\n    ${undeclared.join("\n    ")}\n    dtolnay/rust-toolchain installs a minimal toolchain;` +
            " clippy and rustfmt are components and have to be asked for by name."
          : ""),
      undeclared.length === 0,
    );
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

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
import {
  CHECKS,
  GROUPS,
  TREES,
  NAMES,
  GATE_VERBS,
  KSAV,
  NEED_FIELD,
  howToRun,
  missingNeed,
  select,
  summarise,
  verdict,
} from "../../tools/gate.mjs";
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
function codeLines(text, comments = ["#"]) {
  return text
    .split(/\r?\n/)
    .map((line, i) => [i + 1, line])
    // A comment is not an instruction. The marker set is per language, because
    // `#` is a comment in YAML and shell and a heading in Markdown.
    .filter(([, line]) => !comments.some((c) => line.trim().startsWith(c)));
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
 * The trees the sweep reads, by extension.
 *
 * `ksav/app/tools/`, `ksav/packaging/` and `.github/scripts/` were outside the
 * fence entirely (#115). Each carries a comment marker here so a sentence
 * *about* a command is told from an *instruction* to run one — `emit-engine.mjs`
 * says "`cargo test` in CI" in prose and does not mean it.
 */
const SWEPT_TREES = [
  { dir: "ksav/app/tools", ext: [".mjs", ".js"], comments: ["//", ";;", "*", "/*"] },
  { dir: "ksav/packaging", ext: [".sh", ".js", ".mjs", ".Dockerfile"], comments: ["#"] },
  { dir: ".github/scripts", ext: [".mjs", ".js"], comments: ["//"] },
];

/** Every swept file, deduplicated. */
function sweptFiles() {
  const out = new Set(workflows());
  for (const page of livingPages()) out.add(page);
  for (const tree of SWEPT_TREES) {
    const root = path.join(ROOT, tree.dir);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!tree.ext.some((e) => entry.name.endsWith(e) || entry.name.endsWith(".Dockerfile"))) continue;
      out.add(`${tree.dir}/${entry.name}`);
    }
  }
  return [...out];
}

/** The comment markers that apply to a path. */
function commentsOf(file) {
  const tree = SWEPT_TREES.find((t) => file.startsWith(`${t.dir}/`));
  return tree?.comments ?? ["#"];
}

/**
 * Every swept line, with the file it came from.
 *
 * Markdown contributes only its fenced blocks and YAML only its non-comment
 * lines — the existing rules — while a code file contributes its whole text,
 * with each line's own comment marker stripped out of the comparison later.
 */
function sweptLines() {
  const out = [];
  for (const file of sweptFiles()) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    const lines = file.endsWith(".md")
      ? fencedLines(text)
      : codeLines(text, commentsOf(file));
    for (const [n, line] of lines) out.push([file, [n, line]]);
  }
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

  // ------------------------------------- a check this shell cannot build (#181)
  //
  // Four checks of the `shell` group went red on a desk where nothing was wrong
  // with the tree: WebKitGTK is in `desktopPkgs` in `flake.nix`, which is the
  // **`desktop`** shell, and the gate was run in the default one. What the reader
  // got was sixty lines of `pkg-config` transcript and no sentence saying so.
  //
  // The rule is that a missing system library is a fact about the machine and
  // not a verdict about the code, so it has its own mark (`–`), its own
  // sentence, and its own exit semantics — a failure only when the run asks for
  // it (`--require`, which every workflow invocation now passes).
  {
    const shell = CHECKS.filter((c) => c.group === "shell");
    ok("the shell group is where this matters", shell.length >= 3, `${shell.length} checks`);
    const weak = shell.filter((c) => c.command[0] === "cargo" && c.command[1] !== "fmt" && !c.needs);
    check(
      "every shell check that builds something says what it needs",
      weak.map((c) => c.id),
      [],
    );
    check(
      "…and the field it says it in is the one exported for the sweep",
      shell.filter((c) => c.needs).map((c) => c.needs.pkg).filter((p, i, all) => all.indexOf(p) === i),
      ["gdk-3.0"],
      NEED_FIELD,
    );

    const lints = CHECKS.find((c) => c.id === "shell-clippy");
    ok("a library that is here is not a reason to skip", missingNeed(lints, () => true) === null);
    const gone = missingNeed(lints, () => false);
    ok("…and one that is not is", !!gone && gone.pkg === "gdk-3.0");
    ok("…and it knows which shell has it", gone.shell === "desktop");
    ok("a check with no needs is never skipped", missingNeed(CHECKS[0], () => false) === null);
    ok(
      "the way to measure it names the desktop shell and a gate group",
      howToRun(lints).includes("nix develop .#desktop") && howToRun(lints).includes("tools/gate.mjs shell"),
      howToRun(lints),
    );
    ok(
      "…and the command it replaces, when nothing is missing",
      howToRun(CHECKS[0]) === `cd ksav/${CHECKS[0].cwd} && ${CHECKS[0].command.join(" ")}`,
      howToRun(CHECKS[0]),
    );

    // The summary, with one of the three in it: the mark, the sentence, the way
    // out — and no claim that the gate is green, and no claim that anything
    // failed either.
    const results = CHECKS.map((check) =>
      check === lints
        ? { check, secs: 0, ok: true, shown: check.command.join(" "), unmeasured: check.needs }
        : { check, ok: true, secs: 0.1, shown: check.command.join(" ") },
    );
    const said = summarise(results, [], []).join("\n");
    ok("a check that could not run is marked and not ticked", said.includes("– desktop shell lints"), said);
    ok("…and says what is missing", said.includes("gdk-3.0"), said);
    ok("…and does not call the run green", !said.includes("the gate is green"), said);
    ok("…and does not call it a failure", !said.includes("failed. To reproduce"), said);

    // The exit code, which is the part that decides whether a push is stopped.
    const pass = [{ check: CHECKS[0], ok: true, secs: 0, shown: "" }];
    const skip = [{ check: lints, ok: true, secs: 0, shown: "", unmeasured: lints.needs }];
    const broke = [{ check: CHECKS[0], ok: false, secs: 0, shown: "" }];
    check("a clean run passes", verdict(pass, true), 0);
    check("a desk without the library passes", verdict(skip, false), 0);
    check("…and fails when the run requires it", verdict(skip, true), 1);
    check("a real failure fails either way", [verdict(broke, false), verdict(broke, true)], [1, 1]);
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
  const unrequired = [];
  for (const [, line] of wLines) {
    if (!line.includes(RUNNER)) continue;
    invocations += 1;
    const after = line.slice(line.indexOf(RUNNER) + RUNNER.length).trim();
    const named = after.split(/\s+/).filter((w) => w && !w.startsWith("-"));
    if (!named.length) for (const g of NAMES) invoked.add(g);
    for (const w of named) invoked.add(w);
    // A runner cannot answer "is this machine able to build the shell?" honestly
    // by guessing, and a check it could not measure is a check it did not run. On
    // CI that is a broken image, not a desk with the wrong shell open, so every
    // invocation there requires what it selects (#181).
    if (!after.split(/\s+/).includes("--require")) unrequired.push(line.trim());
  }
  check("every invocation on a runner requires what it runs", unrequired, []);

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
  //
  // A **target** is the same rule one word over (#172): `dtolnay/rust-toolchain`
  // installs the host target and nothing else, so a check that says
  // `--target wasm32-unknown-unknown` fails on a runner with `can't find crate
  // for core` — a red about the job's install, dressed as a red about the code,
  // which is the shape that makes people stop reading. Two lists, one sweep.
  {
    const NEEDS = [
      ["cargo clippy", "clippy"],
      ["cargo fmt", "rustfmt"],
    ];
    const TARGETS = [["--target wasm32-unknown-unknown", "wasm32-unknown-unknown"]];
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
        for (const [flag, target] of TARGETS) {
          if (!commands.some((c) => c.includes(flag))) continue;
          if (new RegExp(`targets:.*\\b${target}\\b`).test(block)) continue;
          undeclared.push(`${file} · ${job}: runs \`${flag}\` and never installs ${target}`);
        }
      }
    }
    ok(`there are gate jobs to sweep for components (${jobsSweeping})`, jobsSweeping >= 4);
    ok(
      "every job installs the rustup components and targets its checks need" +
        (undeclared.length
          ? `\n    ${undeclared.join("\n    ")}\n    dtolnay/rust-toolchain installs a minimal toolchain and` +
            " the host target alone: clippy and rustfmt are components, and another" +
            " architecture is a target, and both have to be asked for by name."
          : ""),
      undeclared.length === 0,
    );
  }

  // ------------------------------------ a retired runner image is a silent cancel
  //
  // GitHub retires images on a date, and the failure is not an error anyone
  // sees: `runs-on: macos-14` was queued and **cancelled about one second
  // later** with no steps and no runner, so the run's overall conclusion became
  // `cancelled` — which reads like a superseded push, not like a job that never
  // ran. Behind it: a red browser engine and a red desktop shell, sixteen
  // pushes, and a macOS job that had never executed a step (#173).
  //
  // The list below is the only part of that which can be checked on the desk. It
  // will always trail GitHub by however long it takes somebody to notice the
  // next retirement — so the workflows name `-latest` where the exact image is
  // not the point, and this catches the case where a *number* was written down.
  {
    const RETIRED = [
      "macos-11",
      "macos-12",
      "macos-13",
      "macos-14",
      "ubuntu-18.04",
      "ubuntu-20.04",
      "windows-2016",
      "windows-2019",
    ];
    const stale = [];
    let labels = 0;
    for (const file of workflows()) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().startsWith("#")) continue;
        const m = /^\s*runs-on:\s*(.+)$/u.exec(line);
        if (!m) continue;
        // `${{ matrix.platform }}` and friends are a job's own choice and are
        // resolved by the runner; only a literal label can be judged here.
        if (m[1].includes("${{")) continue;
        for (const label of m[1].split(/[\s,[\]]+/).filter(Boolean)) {
          labels += 1;
          if (RETIRED.includes(label)) stale.push(`${file}: runs-on: ${label}`);
        }
      }
    }
    ok(`there are literal runner labels to sweep (${labels})`, labels > 0);
    ok(
      "every job runs on a runner image that still exists" +
        (stale.length
          ? `\n    ${stale.join("\n    ")}\n    GitHub retires images on a date and cancels the job in a second;` +
            " the run then reads `cancelled`, which hides every red behind it."
          : ""),
      stale.length === 0,
    );
  }

  // -------------------------------------------- backward: nobody else lists them

  //
  // # What the sweep looks at (#115)
  //
  // It used to look at exactly two classes — the workflows and the living pages
  // — which left `ksav/app/tools/`, `ksav/packaging/` and `.github/scripts/`
  // structurally exempt. `ksav/packaging/entrypoint.sh` re-spelled `npm test`,
  // a verb the list already held, in a directory nothing opened; the container
  // build ran a second copy of a check and no fence could notice it drift.
  //
  // So the classes are named here as *populations with a comment syntax* rather
  // than as two filenames, and a directory added tomorrow is covered by adding
  // its extension to the list rather than by remembering this file.

  const files = workflows();
  ok("there are workflows to sweep", files.length > 0);
  ok("ci.yml is one of them", files.includes(WORKFLOW));

  const strays = [];
  for (const [file, [n, line]] of sweptLines()) {
    if (permitted(line)) continue;
    for (const verb of verbsIn(line)) strays.push([file, n, verb, line.trim()]);
  }

  // The sweep must be able to see the trees it now claims to read. Written
  // because a sweep that quietly matches nothing is the failure this whole file
  // is about: `permitted()` once had a regex that matched no line at all and the
  // check stayed green for thirteen runs.
  for (const tree of SWEPT_TREES) {
    ok(
      `the sweep reads ${tree.dir}`,
      sweptFiles().some((f) => f.startsWith(`${tree.dir}/`)),
    );
  }
  ok(
    "the sweep reads the build recipe, not only check commands",
    GATE_VERBS.includes("wasm-pack build"),
  );

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
            " test binaries with thin LTO, which measured seventy-six minutes."
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

  // ------------------------------------------ an exported constant has readers
  //
  // `facts.mjs` exports `REGENERATE` — the one blessed spelling of the
  // regenerate command — *for the express purpose* of being imported, and
  // nothing imported it: three files in the same directory re-typed it
  // byte-identically (#115). An export nobody imports is a single source with no
  // consumers, which is worse than a duplicate because it looks solved.
  {
    const facts = readFileSync(path.join(ROOT, "ksav/app/tools/facts.mjs"), "utf8");
    ok("facts.mjs still publishes the regenerate command", /export const REGENERATE/.test(facts));
    const readers = readdirSync(path.join(ROOT, "ksav/app/tools"))
      .filter((f) => f.endsWith(".mjs") && f !== "facts.mjs")
      .filter((f) =>
        /\bREGENERATE\b/.test(readFileSync(path.join(ROOT, "ksav/app/tools", f), "utf8")),
      );
    ok(
      "an imported constant is imported" +
        (readers.length
          ? ""
          : "\n    Nothing outside facts.mjs mentions REGENERATE: the one blessed spelling has no" +
            " readers, and every generator re-types it instead."),
      readers.length >= 2,
    );
    // And nobody spells it out again.
    const respelled = sweptLines().filter((entry) => {
      const [file, [, line]] = entry;
      // `facts.mjs` is the one file allowed to state it: that is the definition.
      const source = file === "ksav/app/tools/facts.mjs";
      return !source && file.startsWith("ksav/app/tools/") && /cargo test --test facts/u.test(line);
    });
    ok(
      "the regenerate command has one spelling" +
        (respelled.length
          ? `\n    ${respelled.map(([f, [n, l]]) => `${f}:${n} — ${l.trim()}`).join("\n    ")}`
          : ""),
      respelled.length === 0,
    );
  }

  // --------------------------------------- a repository path is worked out once
  //
  // `tools/paths.mjs` opens with "where things are, worked out once" and is
  // imported by 8 of 22 tools. Three more recomputed
  // `join(here, "..", "..", "editors", "emacs")` by hand — correctly, which is
  // why the existing prohibition test (aimed at the *broken* spelling) passed
  // them. This is an ownership rule rather than a pattern rule: a tool computes
  // a repository path through `paths.mjs`, and a tool added tomorrow is covered
  // by existing.
  {
    const strays = [];
    for (const file of readdirSync(path.join(ROOT, "ksav/app/tools")).filter((f) => f.endsWith(".mjs"))) {
      if (file === "paths.mjs") continue;
      const text = readFileSync(path.join(ROOT, "ksav/app/tools", file), "utf8");
      for (const [n, line] of codeLines(text, ["//", "/*", "*"])) {
        if (/join\(here,\s*"\.\."|resolve\(here,\s*"\.\."/.test(line)) {
          strays.push(`tools/${file}:${n} — ${line.trim()}`);
        }
      }
    }
    ok(
      "a tool finds a repository path through paths.mjs" +
        (strays.length
          ? `\n    ${strays.join("\n    ")}\n    Work it out once, in tools/paths.mjs; a second` +
            " spelling is a path that will be right until the tree moves."
          : ""),
      strays.length === 0,
    );
  }
}

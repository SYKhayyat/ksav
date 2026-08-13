// Everything that has to pass before a push, as one command.
//
//   node tools/gate.mjs                 every check
//   node tools/gate.mjs fmt engine      only those groups
//   node tools/gate.mjs engine --release  as `ci.yml` runs it
//
// # The finding
//
// The README's Test section listed six commands and `ci.yml` spelled nine steps
// out again beside them. Nobody runs six commands. What actually happened is
// what the arrangement makes likely: `cargo fmt -- --check` was the **only** red
// job in CI for four consecutive pushes — eleven seconds, first step, while
// every other job went green — and fifty-four unformatted hunks accumulated
// under it, all of them introduced by the four commits that pushed past it.
//
// The gate existed. It was cheap. It was never run, because running it was the
// seventh thing to remember. Nine things to remember is zero things enforced.
//
// So the list of commands lives here, once, and everything else calls this:
// `ci.yml` selects a group by name, the README documents one invocation, and
// `app/test/gate.test.mjs` fails if a check command reappears as a literal
// anywhere else. That last part is the load-bearing one — a single runner that
// other files are free to route around is a single runner for about a month.
//
// # What this is not
//
// The gate is what a developer can run from a plain checkout. CI does more than
// this — it builds the wasm engine and runs it, it builds the app into the
// server and drives a real browser through it — and those need a toolchain, a
// browser and several minutes that no inner loop should pay. Those jobs are
// deliberately not checks here, and `gate.test.mjs` only requires the reverse
// direction: every group named here must be run by some job in `ci.yml`, so a
// check cannot be added to the gate and quietly go unrun on the remote.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `ksav/` — every `cwd` below is relative to it. */
export const KSAV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The whole gate, in the order it should be met.
 *
 * Cheapest first, and that ordering is a judgement about people rather than
 * about machines: formatting and the typechecker answer in seconds, so a run
 * that is going to fail mostly fails early, and the developer who has thirty
 * seconds spends them on the checks most likely to catch them.
 *
 * `releasable` marks the cargo checks that accept `--release`. Only the engine
 * tests are run that way on the remote — compiling documents through a debug
 * Typst is slow enough to matter there — and a developer's warm debug target is
 * the faster answer locally. One command, one flag, rather than two lists.
 */
export const CHECKS = [
  {
    id: "fmt-engine",
    group: "fmt",
    name: "engine formatting",
    cwd: "engine",
    command: ["cargo", "fmt", "--", "--check"],
    why: "The engine job has installed rustfmt since it was written and never invoked it.",
  },
  {
    id: "fmt-wasm",
    group: "fmt",
    name: "browser engine formatting",
    cwd: "wasm",
    command: ["cargo", "fmt", "--", "--check"],
    why: "A separate crate with its own manifest; formatting it is not implied by the engine.",
  },
  {
    id: "fmt-shell",
    group: "fmt",
    name: "desktop shell formatting",
    cwd: "app/src-tauri",
    command: ["cargo", "fmt", "--", "--check"],
    why: "The third Rust tree, and the one that used to hold most of the drift.",
  },
  {
    id: "editor-types",
    group: "editor",
    name: "editor typecheck",
    cwd: "app",
    command: ["npx", "tsc", "--noEmit"],
    why: "The suite runs bundled modules, so a type error can pass every assertion.",
  },
  {
    id: "editor-suite",
    group: "editor",
    name: "editor suite",
    cwd: "app",
    // Not `npm test`: one process fewer, and the filtered form (`npm test --
    // panels`) stays what it is — the inner loop, deliberately not the gate.
    command: ["node", "test/run.mjs"],
    why: "Every module in src/ built, every test/*.test.mjs run, and the documentation fence over both.",
  },
  {
    id: "engine-clippy",
    group: "engine",
    name: "engine lints",
    cwd: "engine",
    command: ["cargo", "clippy", "--all-targets", "--", "-D", "warnings"],
    why: "The engine's standard is zero warnings; this enforces it rather than trusting it.",
  },
  {
    id: "engine-tests",
    group: "engine",
    name: "engine tests",
    cwd: "engine",
    command: ["cargo", "test"],
    releasable: true,
    why: "The compiler, the registries and every fence written against them.",
  },
  {
    id: "shell-clippy",
    group: "shell",
    name: "desktop shell lints",
    cwd: "app/src-tauri",
    command: ["cargo", "clippy", "--all-targets", "--", "-D", "warnings"],
    // Added with this runner. Clippy was gated on one of the three Rust trees,
    // which is the same shape as the formatting gap: a rule stated once and
    // applied where somebody happened to write the step.
    why: "The shell is Rust too, and nothing was linting it.",
  },
  {
    id: "shell-tests",
    group: "shell",
    name: "desktop shell tests",
    cwd: "app/src-tauri",
    command: ["cargo", "test"],
    why: "The path allowlist, the deep link and the Girsa desk.",
  },
];

/** The groups, in the order they appear above. */
export const GROUPS = [...new Set(CHECKS.map((c) => c.group))];

/**
 * The command shapes that belong to this file and nowhere else.
 *
 * `app/test/gate.test.mjs` sweeps the workflow and every living page for these,
 * so the list is exported rather than written twice. A mention in prose is not a
 * command — the sweep looks inside shell fences and `run:` values only.
 */
export const GATE_VERBS = [
  "cargo fmt",
  "cargo clippy",
  "cargo test",
  "npx tsc",
  "npm test",
  "node test/run.mjs",
];

/** One check, run where it belongs. Returns the seconds it took, or null if it failed. */
function runCheck(check, release) {
  const cwd = path.join(KSAV, check.cwd);
  const argv = [...check.command];
  if (release && check.releasable) argv.push("--release");
  const shown = argv.join(" ");

  console.log(`\n→ ${check.name}  (${check.cwd}: ${shown})`);
  const began = process.hrtime.bigint();
  // Through a shell, because `npx` and `cargo` are `.cmd` shims on Windows and
  // spawn will not find them otherwise. One string rather than a command and an
  // argument array: node deprecates the second form under `shell: true`
  // (DEP0190) precisely because the arguments are concatenated anyway. Every
  // word here is a literal in this file, so there is nothing to inject.
  const done = spawnSync(shown, { cwd, stdio: "inherit", shell: true });
  const secs = Number(process.hrtime.bigint() - began) / 1e9;

  if (done.error) {
    console.log(`✗ ${check.name} could not start: ${done.error.message}`);
    return { check, secs, ok: false, shown };
  }
  return { check, secs, ok: done.status === 0, shown };
}

function main() {
  const args = process.argv.slice(2);
  const release = args.includes("--release");
  const wanted = args.filter((a) => !a.startsWith("-"));

  const unknown = wanted.filter((g) => !GROUPS.includes(g));
  if (unknown.length) {
    console.error(`no such group: ${unknown.join(", ")}\ngroups: ${GROUPS.join(" ")}`);
    process.exit(2);
  }

  const chosen = wanted.length ? CHECKS.filter((c) => wanted.includes(c.group)) : CHECKS;
  console.log(
    `${chosen.length} check${chosen.length === 1 ? "" : "s"}` +
      (wanted.length ? ` in ${wanted.join(", ")}` : "") +
      (release ? ", release" : ""),
  );

  // Every check runs, even after one fails. The failure this file exists to
  // stop is a red that hid behind another red — or rather, a red that everybody
  // stopped reading. Stopping at the first one would report a single name and
  // leave the rest of the answer unmeasured.
  const results = [];
  for (const check of chosen) results.push(runCheck(check, release));

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "-".repeat(60));
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.check.name.padEnd(32)} ${r.secs.toFixed(1)}s`);
  }

  if (!failed.length) {
    console.log(`\nthe gate is green — ${results.length} checks`);
    return;
  }
  console.log(`\n${failed.length} of ${results.length} failed. To reproduce:`);
  for (const r of failed) console.log(`  cd ksav/${r.check.cwd} && ${r.shown}`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const check of CHECKS) {
    if (!existsSync(path.join(KSAV, check.cwd))) {
      console.error(`${check.id}: ${check.cwd} does not exist under ${KSAV}`);
      process.exit(2);
    }
  }
  main();
}

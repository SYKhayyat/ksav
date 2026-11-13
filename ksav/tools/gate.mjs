// Everything that has to pass before a push, as one command.
//
//   node tools/gate.mjs                 every check
//   node tools/gate.mjs engine          every check about the engine crate
//   node tools/gate.mjs fmt             every formatting check, all three trees
//   node tools/gate.mjs engine --release  as `ci.yml` runs it
//   node tools/gate.mjs --require       a check this shell cannot build is a failure
//
// A check that needs a system library this shell does not have is reported as
// **not measured here**, with the shell that has it, rather than as a failure
// (#181). `--require` turns those into failures, and CI passes it.
//
// A name is a group (`fmt`, `editor`, `engine`, `shell`) or a tree (`engine`,
// `wasm`, `shell`, `editor`), and a partial run always ends by naming the
// checks it did not run.
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
 *
 * # Two axes, and why a check carries both
 *
 * `group` is the *kind* of check and answers "what does this cost" — it is what
 * `ci.yml` splits jobs on, because formatting needs no build and the engine
 * tests need the whole Typst compiler. `tree` is the *code* the check is about.
 *
 * They were one field, and the collision cost a red build. `fmt-engine` and
 * `engine-tests` run in the same crate and answer about the same source, but
 * one was in the `fmt` group and the other in `engine`, so `gate.mjs engine`
 * ran clippy and the tests and skipped the one-second formatting check **on the
 * crate it had just been asked about**. It went green, the push went out, and
 * `formatting` was the only red job on `main` — which is, to the letter, the
 * finding this whole file was written to end. A name that reads as "check the
 * engine" has to check the engine.
 *
 * So a name selects on either axis and the union runs. `gate.mjs engine` is
 * every check about the engine crate; `gate.mjs fmt` is still every formatting
 * check across the three Rust trees, which is what `ci.yml`'s cheap job wants.
 */
export const CHECKS = [
  {
    id: "fmt-engine",
    group: "fmt",
    tree: "engine",
    name: "engine formatting",
    cwd: "engine",
    command: ["cargo", "fmt", "--", "--check"],
    why: "The engine job has installed rustfmt since it was written and never invoked it.",
  },
  {
    id: "fmt-wasm",
    group: "fmt",
    tree: "wasm",
    name: "browser engine formatting",
    cwd: "wasm",
    command: ["cargo", "fmt", "--", "--check"],
    why: "A separate crate with its own manifest; formatting it is not implied by the engine.",
  },
  {
    id: "fmt-shell",
    group: "fmt",
    tree: "shell",
    name: "desktop shell formatting",
    cwd: "app/src-tauri",
    command: ["cargo", "fmt", "--", "--check"],
    why: "The third Rust tree, and the one that used to hold most of the drift.",
  },
  {
    id: "editor-imports",
    group: "editor",
    tree: "editor",
    name: "editor import graph",
    cwd: "app",
    command: ["node", "tools/imports.mjs"],
    why: "The main.ts split adds modules by the wave; the rule is one-waypoint " +
      "imports and an acyclic graph, and no typecheck will say so. Type-only " +
      "imports are erased at emit and are not edges; junk names (misc, utils, " +
      "helpers, common) are refused by the same walk.",
  },
  {
    id: "editor-types",
    group: "editor",
    tree: "editor",
    name: "editor typecheck",
    cwd: "app",
    command: ["npx", "tsc", "--noEmit"],
    why: "The suite runs bundled modules, so a type error can pass every assertion.",
  },
  {
    id: "editor-suite",
    group: "editor",
    tree: "editor",
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
    tree: "engine",
    name: "engine lints",
    cwd: "engine",
    command: ["cargo", "clippy", "--all-targets", "--", "-D", "warnings"],
    why: "The engine's standard is zero warnings; this enforces it rather than trusting it.",
  },
  {
    id: "engine-tests",
    group: "engine",
    tree: "engine",
    name: "engine tests",
    cwd: "engine",
    command: ["cargo", "test"],
    releasable: true,
    why: "The compiler, the registries and every fence written against them.",
  },
  {
    id: "engine-wasm",
    group: "engine",
    tree: "engine",
    name: "engine builds for the browser",
    cwd: "engine",
    // `check`, not `build`: this is not about the artefact, it is about whether
    // the crate has a second target at all. It is the cheapest question that
    // can be asked of it — the compiler and nothing else.
    command: ["cargo", "check", "--lib", "--target", "wasm32-unknown-unknown"],
    // The check that was missing for sixteen pushes (#172): `facts.rs` named
    // `crate::server`, `server` is `#[cfg(not(target_arch = "wasm32"))]`, and
    // nothing on this desk ever asked the engine to compile for a target that
    // does not have it. `ci.yml`'s wasm job builds the browser engine, so the
    // red existed — for a quarter of an hour, in a job that a cancelled macOS
    // run (#173) hid from the run list. A failed build is not a fence until it
    // is one command away from the person who broke it.
    why: "The browser engine is a shipping target and the only way to know the engine still has one.",
  },
  {
    id: "shell-clippy",
    group: "shell",
    tree: "shell",
    name: "desktop shell lints",
    cwd: "app/src-tauri",
    // Asked before it runs rather than discovered in a pkg-config transcript
    // (#181). The shell links WebKitGTK, which only the `desktop` dev shell
    // carries — see NEED_FIELD below.
    needs: { pkg: "gdk-3.0", shell: "desktop" },
    // `dpr-probe` so the render check's command is linted somewhere. A check
    // that is compiled only by the check that runs it is a check whose code can
    // rot unobserved, and the next person to run it gets a clippy error on code
    // they have never read.
    command: ["cargo", "clippy", "--all-targets", "--features", "dpr-probe", "--", "-D", "warnings"],
    // Added with this runner. Clippy was gated on one of the three Rust trees,
    // which is the same shape as the formatting gap: a rule stated once and
    // applied where somebody happened to write the step.
    why: "The shell is Rust too, and nothing was linting it.",
  },
  {
    id: "shell-tests",
    group: "shell",
    tree: "shell",
    name: "desktop shell tests",
    cwd: "app/src-tauri",
    needs: { pkg: "gdk-3.0", shell: "desktop" },
    command: ["cargo", "test", "--features", "dpr-probe"],
    why: "The path allowlist, the deep link and the Girsa desk.",
  },
  {
    id: "shell-render",
    group: "shell",
    tree: "shell",
    name: "desktop render scale",
    needs: { pkg: "gdk-3.0", shell: "desktop" },
    // `app/src-tauri`, not `app`: a check belongs in the cwd of the tree it is
    // about, and the editor checks already own `app`. The script sits in
    // `app/tools` with the app's other tooling and resolves its own paths, so it
    // does not care which directory it is called from.
    cwd: "app/src-tauri",
    command: ["node", "../tools/render-check.mjs"],
    // The first check here that opens a window, and the only one that can fail
    // for a reason no amount of `cargo test` can see: WebKitGTK handing the page
    // a device scale of -1/96 under native Wayland, which collapses the chrome
    // and makes the editor unusable while every unit test stays green (#101).
    why: "The shipped UI had no coverage at all — a cargo test never opens a window.",
  },
];

/**
 * What a check needs from the machine, and how to get it.
 *
 * #181: four checks of the `shell` group went red on a desk where nothing was
 * wrong with the tree — WebKitGTK is in `desktopPkgs` in
 * `flake.nix`, which is the **`desktop`** shell, and the gate was being run in
 * the default one. What the reader got was sixty lines of `pkg-config`
 * transcript and no sentence saying which shell has these packages. Two things
 * were wrong with that:
 *
 *   - a missing system library is not a verdict about the tree. The same commit
 *     is green on CI and green here under the right shell, and reporting it in
 *     the same red as a real failure teaches people that the gate is red for
 *     reasons that mean nothing;
 *   - the way from the red to `nix develop .#desktop` did not exist in the
 *     output at all.
 *
 * So a check may declare `needs: { pkg, shell }`. Before it runs, `pkg-config
 * --exists` is asked; if the answer is no, the check is **not measured here**
 * and says so, with the command that would measure it. It fails the run only
 * when the run is asked to require it (`--require`, which is what CI passes), so
 * a local reader gets an honest "not measured" instead of a red about their
 * machine.
 */
export const NEED_FIELD = "needs";

/** The groups, in the order they appear above. */
export const GROUPS = [...new Set(CHECKS.map((c) => c.group))];

/** The trees, in the order they appear above. */
export const TREES = [...new Set(CHECKS.map((c) => c.tree))];

/** Every name the command line accepts. */
export const NAMES = [...new Set([...GROUPS, ...TREES])];

/**
 * The checks a list of names asks for. No names means the whole gate.
 *
 * A name matches on either axis, so `engine` is the engine group *and* the
 * engine tree. The union, never the intersection — the failure this replaces
 * was a selection that quietly returned less than the name promised.
 */
export function select(names) {
  if (!names.length) return CHECKS;
  return CHECKS.filter((c) => names.includes(c.group) || names.includes(c.tree));
}

/**
 * Can this machine build what this check is about?
 *
 * `has` is injected so a test can ask both answers without a machine that lacks
 * WebKitGTK. In a real run it is `pkg-config --exists`, which is the same
 * question the cargo build will ask four minutes later — asked in a millisecond,
 * before the reader has started waiting.
 */
export function missingNeed(check, has = pkgConfigHas) {
  if (!check.needs) return null;
  if (has(check.needs.pkg)) return null;
  return check.needs;
}

function pkgConfigHas(name) {
  const done = spawnSync("pkg-config", ["--exists", name], { stdio: "ignore" });
  return done.status === 0;
}

/**
 * The command that would measure a check this shell cannot.
 *
 * Printed instead of the check's own command, because the check's own command is
 * what the reader already has and what just failed to make sense.
 */
export function howToRun(check, names) {
  const inner = `cd ksav/${check.cwd} && ${check.command.join(" ")}`;
  if (!check.needs) return inner;
  const group = names?.length ? names.join(" ") : check.group;
  return (
    `nix develop .#${check.needs.shell} --command bash -c ` +
    `"cd ksav && node tools/gate.mjs ${group}"`
  );
}

/**
 * The exit code, as a question about three facts rather than nine branches.
 *
 * A failure is a failure. A check that could not be measured here is **not** one
 * — unless the run was asked to require it, which is what CI does, because a
 * runner without WebKitGTK is a broken runner (#181).
 */
export function verdict(results, require) {
  if (results.some((r) => !r.ok)) return 1;
  if (require && results.some((r) => r.unmeasured)) return 1;
  return 0;
}

/**
 * What to say when the run is over.
 *
 * Split out of `main` so it can be tested, and it needs testing because the
 * sentence it used to print was false. A run of two checks out of nine ended
 * with **"the gate is green"**, which is the same shape as the acceptance run
 * that stopped halfway and reported that nothing had failed: a partial answer
 * wearing a complete one's words. Selecting a group is a normal, correct thing
 * to do — `ci.yml` does it in five jobs — so the fix is not to forbid it but to
 * say which checks did not run, every time, by name.
 */
export function summarise(results, skipped, names = []) {
  const failed = results.filter((r) => !r.ok);
  const unmeasured = results.filter((r) => r.unmeasured);
  // `–` for a check this machine cannot build, `✓` for one that passed, `✗` for
  // one that failed. Three marks, because they are three different facts and
  // the whole of #181 is that the first was being reported as the third.
  const lines = results.map((r) =>
    r.unmeasured
      ? `– ${r.check.name.padEnd(32)} not measured here: ${r.unmeasured.pkg} is not in this shell`
      : `${r.ok ? "✓" : "✗"} ${r.check.name.padEnd(32)} ${r.secs.toFixed(1)}s`,
  );

  if (unmeasured.length) {
    lines.push(`\n${unmeasured.length} not measured here, and not a verdict on the tree:`);
    for (const r of unmeasured) lines.push(`  ${r.check.id}: ${howToRun(r.check, names)}`);
  }
  if (failed.length) {
    lines.push(`\n${failed.length} of ${results.length} failed. To reproduce:`);
    for (const r of failed) lines.push(`  ${howToRun(r.check, names)}`);
    return lines;
  }
  // The floor from the other side: a run where everything was skipped is not a
  // green run, it is a run that measured nothing.
  if (unmeasured.length === results.length) {
    lines.push(`\nnothing was measured — every chosen check needs a library this shell does not have.`);
    return lines;
  }
  const passed = results.filter((r) => r.ok && !r.unmeasured).length;
  const unmeasuredNote = unmeasured.length
    ? `, ${unmeasured.length} not measured here`
    : "";

  if (!skipped.length) {
    lines.push(
      unmeasured.length
        ? `\n${passed} of ${results.length} checks passed${unmeasuredNote}.` +
            ` Not the whole gate: the checks above were not run.`
        : `\nthe gate is green — ${results.length} checks`,
    );
    return lines;
  }
  lines.push(
    `\n${passed} of ${CHECKS.length} checks passed${unmeasuredNote}. This was not the whole gate —` +
      ` ${skipped.length} did not run:`,
  );
  for (const c of skipped) lines.push(`  ${c.id.padEnd(16)} ${c.cwd}: ${c.command.join(" ")}`);
  const elsewhere = skipped.filter((c) => c.needs);
  if (elsewhere.length) {
    lines.push(
      `\n${elsewhere.length} of those need the desktop shell, which is where their system libraries are:`,
    );
    lines.push(`  ${howToRun(elsewhere[0])}`);
  }
  lines.push(`\nnode tools/gate.mjs   — all of them`);
  return lines;
}

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
  "tools/render-check.mjs",
  // A **build** recipe, and the first one here (#115). The list held only check
  // commands, so `wasm-pack build --target web --release --out-dir pkg` was free
  // to be re-spelled in four files — two of them in directories the sweep never
  // opened. It lives in `ksav/tools/wasmbuild.mjs` now.
  "wasm-pack build",
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
  // `--require` makes a check this shell cannot build a failure. CI passes it,
  // because a runner with no WebKitGTK is a broken runner and should say so;
  // a desk where the same commit is green under `nix develop .#desktop` is not,
  // and saying so in the same red as a real failure is what teaches people to
  // stop reading the gate (#181).
  const require = args.includes("--require");
  const wanted = args.filter((a) => !a.startsWith("-"));

  const unknown = wanted.filter((g) => !NAMES.includes(g));
  if (unknown.length) {
    console.error(`no such group or tree: ${unknown.join(", ")}\nnames: ${NAMES.join(" ")}`);
    process.exit(2);
  }

  const chosen = select(wanted);
  console.log(
    `${chosen.length} check${chosen.length === 1 ? "" : "s"}` +
      (wanted.length ? ` in ${wanted.join(", ")}` : "") +
      (release ? ", release" : ""),
  );

  // Every check runs, even after one fails. The failure this file exists to
  // stop is a red that hid behind another red — or rather, a red that everybody
  // stopped reading. Stopping at the first one would report a single name and
  // leave the rest of the answer unmeasured.
  // Asked before anything runs: a missing system library is a fact about this
  // shell, and learning it in a millisecond rather than after a build's worth of
  // pkg-config transcript is the difference between a message and a mystery.
  const results = [];
  for (const check of chosen) {
    const need = missingNeed(check);
    if (need) {
      console.log(
        `\n– ${check.name}  (${check.cwd}) — not run: ${need.pkg} is not in this shell`,
      );
      results.push({ check, secs: 0, ok: true, shown: check.command.join(" "), unmeasured: need });
      continue;
    }
    results.push(runCheck(check, release));
  }

  console.log("\n" + "-".repeat(60));
  const skipped = CHECKS.filter((c) => !chosen.includes(c));
  for (const line of summarise(results, skipped, wanted)) console.log(line);

  const unmeasured = results.filter((r) => r.unmeasured);
  const code = verdict(results, require);
  if (code && unmeasured.length && !results.some((r) => !r.ok)) {
    console.log(
      `\n--require: ${unmeasured.length} check(s) could not be measured in this shell,` +
        ` and this run was asked to require them.`,
    );
  }
  if (code) process.exit(code);
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

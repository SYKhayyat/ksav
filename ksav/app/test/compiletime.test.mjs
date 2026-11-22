// The compile budget, as the client learns it.
//
// # The finding (#109)
//
// `transports.ts` held `const COMPILE_TIMEOUT_MS = 20_000` under the comment
// *"mirroring the server's"*. It mirrored the server's **default** and could
// never mirror anything else: the engine's `compile_deadline()` reads
// `KSAV_COMPILE_TIMEOUT_MS`, and the client constant was compiled into the
// bundle. A deployer who set `KSAV_COMPILE_TIMEOUT_MS=60000` for a large sefer
// got a server that waited sixty seconds, a wasm/desktop client that abandoned
// at twenty, and a sentence telling the writer the compile *"will finish in the
// background"* — a promise the client half had already disowned.
//
// The two numbers are no longer two numbers. The engine serves its own budget
// to the page it serves (`<meta name="ksav-compile-timeout-ms">`), the desktop
// shell hands the same value to the page it draws
// (`window.__ksavCompileTimeoutMs`), and `compiletime.ts` reads whichever is
// there. The offline wasm build has neither and keeps the default.
//
// What this file asserts:
//
//   1. the reader's precedence and its refusals (zero, negative, NaN, absent);
//   2. the default is the engine's default — read from the engine's published
//      fact, so the comment cannot rot into a lie the way it did;
//   3. the transport actually asks the reader rather than carrying its own
//      literal.

import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../tools/paths.mjs";
import { facts } from "../tools/facts.mjs";
import { check, ok } from "./harness.mjs";
import {
  compileDeadlineMs,
  budgetFromSettings,
  DEFAULT_COMPILE_TIMEOUT_MS,
} from "../.tmp-test/compiletime.mjs";

const transports = readFileSync(path.join(ROOT, "ksav/app/src/transports.ts"), "utf8");

/** A page-shaped stand-in carrying whichever metas a build would serve. */
function page(metas) {
  return {
    querySelector(sel) {
      const m = sel.match(/^meta\[name="([^"]+)"\]$/);
      if (!m) return null;
      const content = metas?.[m[1]];
      return content === undefined ? null : { getAttribute: () => content };
    },
  };
}

export async function run() {
  // ------------------------------------------------------------ the default

  check("a build told nothing waits the documented twenty seconds", compileDeadlineMs({}), 20_000);
  check("and the constant says the same", DEFAULT_COMPILE_TIMEOUT_MS, 20_000);

  // Through `facts.gen.json`, not by reading Rust: a value crossing the
  // Rust→JS boundary crosses as a value (see `engine/src/facts.rs`), and this
  // test is a consumer of that fact rather than a second parser of it.
  const engineDefault = facts().compile_timeout_ms;
  ok("the engine publishes its default as a fact", typeof engineDefault === "number");
  check("the client default is the engine's default", DEFAULT_COMPILE_TIMEOUT_MS, engineDefault);
  // The engine's served number is held to its constant by the Rust test
  // `the_page_carries_the_budget_the_server_will_use`; this file does not parse
  // Rust, because a value crossing the boundary crosses as a value.

  // --------------------------------------------------------- what it listens to

  check(
    "a served page's budget is used",
    compileDeadlineMs(page({ "ksav-compile-timeout-ms": "60000" })),
    60_000,
  );
  check(
    "the desktop shell's value is used",
    compileDeadlineMs({ __ksavCompileTimeoutMs: 5_000 }),
    5_000,
  );
  check(
    "the shell wins over the page when both are there",
    compileDeadlineMs({ __ksavCompileTimeoutMs: 7_000, ...page({ "ksav-compile-timeout-ms": "60000" }) }),
    7_000,
  );

  // A deadline of nothing is not a deadline: the server filters these the same
  // way (`filter(|&ms| ms > 0)`), and the client must not turn a typo into a
  // compile that is abandoned instantly.
  for (const [what, v] of [
    ["zero", 0],
    ["negative", -1],
    ["not a number", "soon"],
    ["NaN", NaN],
    ["empty", ""],
    ["infinity", Infinity],
  ]) {
    check(`${what} falls back to the default`, compileDeadlineMs({ __ksavCompileTimeoutMs: v }), 20_000);
  }
  check(
    "and a page's zero does too",
    compileDeadlineMs(page({ "ksav-compile-timeout-ms": "0" })),
    20_000,
  );

  // ---------------------------------------------------- the transport asks

  ok("transports.ts no longer carries its own ceiling", !/= 20_000/.test(transports));
  ok("transports.ts asks the reader instead", /compileDeadlineMs\(\)/.test(transports));
  ok(
    "and the reader it asks is the module, not a local stand-in",
    transports.includes('from "./compiletime"'),
  );
  ok(
    "and does not cache it at module load, which would run before the shell speaks",
    !/const COMPILE_DEADLINE = compileDeadlineMs/.test(transports),
  );

  // ------------------------------------------- the writer's own number (#213)

  // Until a writer touches the box, the build's number stands — which is what
  // keeps an operator's raised budget working for everyone who never asked.
  budgetFromSettings(() => undefined);
  check(
    "an unset setting leaves the page's budget alone",
    compileDeadlineMs(page({ "ksav-compile-timeout-ms": "60000" })),
    60_000,
  );
  check("and leaves the shell's alone", compileDeadlineMs({ __ksavCompileTimeoutMs: 5_000 }), 5_000);
  check("and the default is still the default", compileDeadlineMs({}), 20_000);

  // Set, it outranks both: the writer is the one waiting.
  budgetFromSettings(() => 45);
  check(
    "the writer's seconds win over the page",
    compileDeadlineMs(page({ "ksav-compile-timeout-ms": "60000" })),
    45_000,
  );
  check("and over the shell", compileDeadlineMs({ __ksavCompileTimeoutMs: 5_000 }), 45_000);
  check("seconds, not milliseconds", compileDeadlineMs({}), 45_000);

  // A number the writer cannot mean is refused rather than clamped: a cleared
  // number input reads as `NaN`, and taking it at its word would abandon every
  // compile instantly — the failure mode this setting exists to prevent, with a
  // worse symptom than a slow compile.
  for (const [what, v] of [
    ["NaN (a cleared box)", NaN],
    ["zero", 0],
    ["negative", -30],
    ["Infinity", Infinity],
    ["a non-numeric string", "soon"],
  ]) {
    budgetFromSettings(() => v);
    check(`${what} falls back to the build's number`, compileDeadlineMs({}), 20_000);
  }
  // A numeric string is a number, though: the box writes numbers, and a blob
  // hand-edited to hold `"45"` means forty-five seconds.
  budgetFromSettings(() => "45");
  check("a numeric string is read as seconds", compileDeadlineMs({}), 45_000);
  budgetFromSettings(() => undefined);

  // --------------------------------------------------- the row and its words

  const drawer = readFileSync(path.join(ROOT, "ksav/app/src/settingsdrawer.ts"), "utf8");
  ok(
    "the drawer has a row for it",
    /optNumberRow\("compileBudgetLabel", "compileBudgetS"/.test(drawer),
  );
  // `optNumberRow`, not `numberRow`: the unset state is the ordinary one, and
  // `numberRow` prints "undefined" into the box and writes `0` when cleared.
  ok(
    "as an optional number, so a cleared box is not a zero",
    !/numberRow\("compileBudgetLabel"/.test(drawer),
  );
  // The reader is handed over rather than imported, because `settings.ts`
  // importing `transports.ts`-side code would close a loop — and a module that
  // silently stops being asked is exactly the #109 shape this file is about.
  const settingsTs = readFileSync(path.join(ROOT, "ksav/app/src/settings.ts"), "utf8");
  ok(
    "settings hands its reader over to the module that asks",
    /budgetFromSettings\(\(\) => settings\.compileBudgetS\)/.test(settingsTs),
  );
  ok("and the field it reads exists", /compileBudgetS\?: number/.test(settingsTs));

  // What the desktop shell does with the budget is held by the engine's own
  // sweep (`tests/deep_link.rs`), because it is Rust and this file does not
  // parse Rust.
}

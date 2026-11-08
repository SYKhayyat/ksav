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
import { compileDeadlineMs, DEFAULT_COMPILE_TIMEOUT_MS } from "../.tmp-test/compiletime.mjs";

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

  // What the desktop shell does with the budget is held by the engine's own
  // sweep (`tests/deep_link.rs`), because it is Rust and this file does not
  // parse Rust.
}

// Something has to look at the screen — and it has to keep looking.
//
// # The finding
//
// Relayed from Girsa (G4). Every guard in this repository reads source. Girsa's
// two worst bugs were a commentary block at `opacity: 0` and a pane title
// measured at 0px, and a source sweep is constitutionally unable to see either:
// both files said exactly what they should say.
//
// `.github/scripts/acceptance.mjs` already drove a real Chrome through eight
// steps of using the product, and every assertion in it was a count or a string.
// The browser was open on the real stylesheet and nothing asked it what was on
// the screen. It now measures: a non-zero box, an effective opacity above zero
// computed **through the ancestors**, no `display: none` or `visibility: hidden`
// anywhere in that chain, and a box that intersects the viewport.
//
// # What this file is for
//
// The measuring lives in a browser and cannot run here — this suite has no
// Chrome and no server, by design. What can be checked here is everything about
// that sweep which is a fact about source, and per G3 the important one is that
// **its absence must be a failure**. A visibility sweep that is quietly deleted,
// or quietly stops covering a surface, is worse than never having had one: the
// job still goes green and the question still looks answered.
//
// So this file holds three claims:
//
//   the plan     every surface `panels.ts` declares is measured or is named with
//                a reason, and there is no third option — a twenty-third panel
//                fails here, by name, before anybody boots a browser
//   the eyes     the script still contains the measuring, still walks ancestors,
//                and still carries its counted floor
//   the clicks   no click in the eight steps bypasses the measurement, which is
//                the rule that stops this decaying one convenient line at a time
//
// The third is the one that matters most and is least obvious. Playwright's own
// actionability check calls an element visible when it has a non-empty box and
// no `visibility: hidden` — and **`opacity: 0` passes it**. So a bare
// `page.click` looks like it proves something about the screen and does not.

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../tools/paths.mjs";
import { CORE, HOW, RECIPES, measurable, planFor } from "../tools/surfaces.mjs";
import { PANELS } from "../.tmp-test/panels.mjs";

const SCRIPT = ".github/scripts/acceptance.mjs";
const WORKFLOW = ".github/workflows/ci.yml";

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

/** A reason has to be long enough to be a reason. `gate.mjs` uses the same bar. */
const REASON = 20;

export async function run() {
  const script = read(SCRIPT);

  // ------------------------------------------------------------------ the plan

  let plan = [];
  let threw = null;
  try {
    plan = planFor(PANELS);
  } catch (e) {
    threw = e.message;
  }
  ok(`every declared surface is classified${threw ? `\n    ${threw}` : ""}`, !threw);
  check("the plan covers the whole registry", plan.length, PANELS.length);
  ok("there are surfaces to measure", measurable(plan).length > 0);

  // Half is the ceiling, and it is checked here as well as inside `planFor`,
  // because the number that matters is the one a reader can see going up.
  const excused = plan.filter((e) => e.how === HOW.unreachable);
  ok(
    `fewer than half the surfaces are excused — ${excused.length} of ${plan.length}` +
      (excused.length ? `: ${excused.map((e) => e.panel.id).join(", ")}` : ""),
    excused.length * 2 < plan.length,
  );

  for (const e of plan) {
    // A chip is its own claim: the pairing either opens the panel in the real
    // browser or it does not. Everything else is a departure from the registry's
    // own mechanism and owes a sentence.
    if (e.how === HOW.chip) {
      ok(`${e.panel.id} names the chip that opens it`, typeof e.chip === "string" && !!e.chip);
      continue;
    }
    ok(
      `${e.panel.id} says why it is not opened by a chip`,
      typeof e.why === "string" && e.why.length >= REASON,
    );
    if (e.how === HOW.driven) ok(`${e.panel.id} has a recipe`, typeof e.drive === "function");
  }

  // A recipe for a panel that no longer exists is the drift this whole item is
  // about, pointed the other way: the surface was renamed and the entry outlived
  // it, so the sweep silently measures twenty-one of twenty-two.
  const ids = new Set(PANELS.map((p) => p.id));
  for (const id of RECIPES.keys()) ok(`there is still a panel called ${id}`, ids.has(id));

  // And the thing that makes the whole arrangement worth having.
  //
  // A twenty-third surface cannot arrive unmeasured. Note the shape used here: a
  // plain `presence: "class"` drawer, the *easiest* kind to wave through, and the
  // kind a fallback would have swallowed without a word. There is no fallback, so
  // it throws with its own name in the message.
  for (const presence of ["class", "mounted"]) {
    const twentyThird = [
      ...PANELS,
      { id: "a-new-surface", kind: "modal", presence, escape: true, exits: [{ via: "head" }] },
    ];
    let named = null;
    try {
      planFor(twentyThird);
    } catch (e) {
      named = e.message;
    }
    ok(`a new ${presence} surface with no recipe is refused`, !!named);
    ok(`and the refusal names it (${presence})`, !!named?.includes("a-new-surface"));
  }

  // ------------------------------------------------------------------ the core

  ok("the chrome outside the registry is measured too", CORE.length > 0);
  for (const c of CORE) {
    ok(`${c.name} has a selector`, typeof c.selector === "string" && !!c.selector);
    // The same bar `gate.mjs` sets on its checks, for the same reason: every
    // entry here is one somebody will want to delete on a slow morning, and the
    // four checks that went missing from the gate went missing because nothing
    // said what they were for.
    ok(`${c.name} says what it is for`, typeof c.why === "string" && c.why.length >= REASON);
    ok(`${c.name} is looked for by the script`, script.includes(c.selector));
  }

  // ------------------------------------------------------------------ the eyes

  // G3, applied to this: a check that cannot run must fail rather than pass. The
  // way this one stops running is not an exception — it is somebody deleting the
  // measurement and leaving the eight steps, which is exactly the state the file
  // was in when the finding was filed, and every job stayed green.
  ok("the script measures a box", script.includes("getBoundingClientRect"));
  ok("the script reads computed style", script.includes("getComputedStyle"));
  ok(
    "the script walks up to the ancestors — the half `opacity: 0` hides in",
    script.includes("parentElement"),
  );
  ok("the script reads the viewport", script.includes("window.innerWidth"));
  ok("the script derives its surfaces from the registry", script.includes("planFor"));
  ok("the script loads the registry as data, not as text", script.includes('load("panels")'));

  // The counted floor. Every loop in the sweep can `continue`, so a run that
  // inspected nothing at all would raise no failures and print that the
  // application works.
  ok("the sweep counts what it visited", script.includes("the sweep visited every reachable surface"));
  ok("and refuses a run that looked at nothing", script.includes("the run looked at the screen at all"));

  // ------------------------------------------------------- the screenshot tool
  //
  // `tools/eyes.mjs` is how a person *sees* the editor, and it is the only check
  // that can tell a feature renders from a feature that is green. Both halves of
  // that sentence have already cost time:
  //
  //  - it could not launch a browser at all, and reported the failure as
  //    `spawn /usr/bin EACCES`, because its search returned a **directory** as
  //    though it were an executable;
  //  - it had no way to photograph any document but its own, so `--set=
  //    showWhitespace:true` produced a screenshot **byte-identical** to the one
  //    with it off — the built-in starter is hand-written Hebrew prose, which has
  //    no tabs, no double spaces and no trailing whitespace, and `whitespaceRuns`
  //    marks only those. Identical to a broken feature, and identical to a working
  //    one, with nothing in between to say which.
  //
  // So the three things it must be able to do, each of which was a separate bug.
  const eyes = read("ksav/app/tools/eyes.mjs");

  ok("the eyes can photograph a document you choose", /--doc=/.test(eyes));
  ok(
    "and actually read that document, not just accept the flag",
    /readFileSync\(docArg/.test(eyes),
  );
  ok(
    "and put it in the editor rather than the built-in one",
    /\{ doc, caret \}/.test(eyes),
  );
  // The launcher half. A search that returns a directory is worse than one that
  // returns nothing, because the error it produces blames permissions.
  ok(
    "the eyes find a versioned Playwright browser",
    // `chromium-<revision>`, not `chromium` — an exact name never matched, which
    // is why the guess below it is what actually finds anything.
    /startsWith\(`\$\{pkg\}-\`\)/.test(eyes) && /chrome-linux64/.test(eyes),
  );
  ok(
    "and do not mistake a bin directory for an executable",
    !/endsWith\("\/bin"\)\s*\n?\s*return root/.test(eyes),
  );
  ok(
    "and say 'no browser' rather than an EACCES when there is none",
    /no Chromium found/.test(eyes),
  );

  // ---------------------------------------------------------------- the clicks
  //
  // Helpers above `step(0`, steps below it. Everything below has to go through
  // `clickVisible`, and the boundary is what makes the rule checkable without
  // parsing JavaScript.

  const lines = script.split(/\r?\n/);
  const zero = lines.findIndex((l) => l.includes("step(0,"));
  ok("the script still has steps in it", zero > 0);

  const bare = [];
  lines.forEach((line, i) => {
    if (i <= zero) return;
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    if (/page\.click\(/.test(line) || /\)\.click\(/.test(line)) {
      bare.push(`${SCRIPT}:${i + 1} — ${line.trim()}`);
    }
  });
  ok(
    "every click in the steps is measured first" +
      (bare.length
        ? `\n    ${bare.join("\n    ")}\n    Playwright's own visibility check passes an element at` +
          " `opacity: 0`, so a bare click proves nothing about the screen. Use clickVisible."
        : ""),
    bare.length === 0,
  );
  // The helper it must go through, and the reason it is not enough for the
  // helper merely to exist.
  ok("clickVisible measures before it clicks", /async function clickVisible[\s\S]{0,400}await visible\(/.test(script));

  // ----------------------------------------------------------- ruling out me
  //
  // G7: rule out your own setup before filing a finding. Both of these were paid
  // for in this session rather than imagined.
  //
  // A key pressed as `Control+Shift+k` makes Playwright send `key: "k"` with
  // `shiftKey: true`, which no browser does — a real one sends `"K"`. CodeMirror
  // reads its binding name off `event.key`, so the run tested `Ctrl-k`, opened
  // the command palette, and thirteen shortcuts were filed as broken. They were
  // not. The driver was.
  const rawPresses = [];
  lines.forEach((line, i) => {
    if (i <= zero) return;
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    if (/page\.keyboard\.press\(/.test(line)) rawPresses.push(`${SCRIPT}:${i + 1} — ${line.trim()}`);
  });
  ok(
    "every keypress in the steps goes through the guard" +
      (rawPresses.length
        ? `\n    ${rawPresses.join("\n    ")}\n    Use press(), which refuses a shape a browser` +
          " would not send."
        : ""),
    rawPresses.length === 0,
  );
  ok(
    "…and the guard refuses Shift with a lowercase letter",
    /function press\([\s\S]{0,600}Shift\\\+\(\[a-z\]\)/.test(script),
  );

  // And the setup error that costs the most: `include_dir!` bakes `app/dist`
  // into the server at compile time, so a binary older than `dist/` drives the
  // previous build and every result is about code nobody is looking at.
  ok("the run refuses a server older than the app inside it", script.includes("function assertFresh"));
  // Inside that function, not merely somewhere after it.
  //
  // The first spelling was `/assertFresh[\s\S]{0,1800}process\.exit\(1\)/`, and
  // it stayed green when the exit was deleted — because the *next* function's
  // exit was within reach of the window. A guard with a fixed lookahead over
  // source is a guard that matches whatever happens to be nearby, which is the
  // same mistake `chrome.test.mjs` records about a 70%-of-the-file window.
  const fresh = script.slice(script.indexOf("function assertFresh"));
  ok(
    "…and exits rather than warning",
    fresh.slice(0, fresh.indexOf("\n}")).includes("process.exit(1)"),
  );

  // The same class, one layer over, and **it had already cost a finding**.
  //
  // `assertFresh` above is about `include_dir!` baking `dist/` into the server
  // binary. `browserlang.test.mjs` is about the other consumer of the same
  // directory: it serves `dist/` to Chromium and reads the window. Nothing
  // checked that the copy on disk matched the sources beside it — `gate.mjs`
  // does not build `dist/`, and the CI app job runs the suite *before* its
  // `npx vite build`, so in CI this file always skips and the gap is invisible
  // there.
  //
  // So #81's fix landed (`showChromeNotice` passes the key, the banner carries
  // `data-i18n`, `localise()` re-renders it) and the fence stayed red, on
  // identical code. The recorded conclusion was a false claim about the product
  // — *"the sweep does not reach the notice host"* — which then sat in
  // `PLAN.md` and `SESSION_LOG.md` as an open half of the issue. The real cause
  // was a `dist/` built the day before the commit it was being asked about.
  // It was also not the boot-order race the same entries concluded next.
  {
    const lang = read("ksav/app/test/browserlang.test.mjs");
    ok("the browser test has the same guard", lang.includes("function assertFreshBuild"));
    // **Throws rather than skips, and throws rather than `check`s.** Both
    // distinctions are findings.
    //
    // A stale `dist/` is not this machine being unable to run the test, it is the
    // test about to report a confident fictional result. Skipping would be the
    // same silence wearing a different sign.
    //
    // It used to `check(...)`, which is a *failed assertion* — one failure, zero
    // passes — and `run.mjs` then reported the file as `0 passed`, i.e.
    // **"asserted nothing"**. That is what CI showed, and it is the least useful
    // sentence available: it reads like a test file that lost its body, when the
    // truth is that there is no build to measure (#91). The comment this replaces
    // even noticed the trap — *"red anyway — but only by accident, and with no
    // explanation"* — and worked around it. `throw` removes the accident: the
    // failure names itself, and a stale build stays distinguishable from a gutted
    // test file, which are different faults with different fixes.
    const guard = lang.slice(lang.indexOf("function assertFreshBuild"));
    const body = guard.slice(0, guard.indexOf("\n}"));
    ok("…and refuses rather than skipping", body.includes("throw new Error("), body.slice(0, 400));
    ok(
      "…and the refusal names the rebuild rather than the assertion",
      body.includes("npm run build"),
      body.slice(0, 400),
    );
    // And it is reached **before** anything is measured, which is the whole
    // value of it: a guard that runs after the window has been read has already
    // let the measurement happen.
    //
    // **The call, and not the name.** The first spelling of this was
    // `indexOf("assertFreshBuild()") < indexOf("await browser()")`, and it
    // stayed green when the call was moved to *after* `await browser()` —
    // because `indexOf` found the **declaration**, `function assertFreshBuild()`
    // at line 120, which is always before anything. A positional fence written
    // over source finds the first spelling of a name, and a name has two
    // spellings. This is the same trap twenty lines above in this file, about a
    // fixed lookahead over source matching whatever happens to be nearby, and I
    // walked into it while adding a fence twenty lines below it.
    //
    // `!assertFreshBuild()` is only ever written at the call, so it is the call.
    ok(
      "…before it opens a browser",
      lang.indexOf("!assertFreshBuild()") > 0 &&
        lang.indexOf("!assertFreshBuild()") < lang.indexOf("await browser()"),
      `guard call at ${lang.indexOf("!assertFreshBuild()")}, browser at ${lang.indexOf("await browser()")}`,
    );
    // The one that bit the author of that guard: a fresh build returned nothing
    // and the call site read the answer as a boolean, so the file skipped itself
    // on every run and `run.mjs` reported "asserted nothing". Assert the
    // `true` is there, since a bare `return` is the spelling that reproduces it.
    ok(
      "…and says so when the build is fresh, rather than returning nothing",
      /if \([^)]*\) return true;/.test(guard.slice(0, guard.indexOf("\n}"))),
      guard.slice(0, 400),
    );
  }

  // -------------------------------------- an assertion that cannot be vacuous

  // There are two functions called `check` in this repository's test tooling
  // and they disagree about their own arguments: here it is
  // `check(name, got, want)`, and in the acceptance script it is
  // `check(name, condition, detail)`. The confusion is one-directional and
  // therefore quiet — using this file's shape over there **passes whenever the
  // value is truthy**, asserting that something exists and nothing about what
  // it is.
  //
  // It happened. The version-control step compared a `data-git` attribute to
  // `"unavailable"` in the detail position, so it would have been satisfied by
  // `no-git`, by `no-repo`, by any state at all — and it was only noticed
  // because a mutation run made the attribute `null`. A sweep found no second
  // instance and a sweep is the wrong instrument: the next one is written by
  // whoever last used this file's `check`. So the script refuses it at the
  // call, and this holds the refusal there.
  {
    const at = script.indexOf("function check(");
    ok("the acceptance script has its own check", at > 0);
    const body = script.slice(at, script.indexOf("\n}", at));
    ok(
      "…which refuses anything but a boolean condition",
      /typeof condition !== "boolean"/.test(body) && body.includes("throw"),
      body.slice(0, 200),
    );
  }

  // ------------------------------------------- and the tally cannot flatter it

  // A run that breaks halfway is not a run that passed, and for three
  // consecutive pushes the tally could not tell them apart: a menu left open
  // over the editor aborted the script at check 150 of 579, and the last lines
  // of the red job read `0 failed:` under an empty list. Whoever looked saw a
  // clean run exiting non-zero and read the redness as infrastructure. The
  // stack trace was in the log, four hundred lines above the summary, which is
  // upward of where anybody scrolls.
  //
  // Run rather than read. The tally is nine lines of branching at the foot of
  // the script and a regex over it would assert its spelling; this evaluates
  // the real source with the counters handed in, which is the only way to hold
  // *what it says* rather than what it looks like it says.
  {
    // Anchored to the shutdown rather than to anything inside the tally: the
    // tally is *whatever runs after the browser is closed*, so a rewrite of it
    // still lands in this slice and still gets evaluated. An anchor on a line
    // of the tally itself would be moved by the same edit that reintroduces the
    // bug, and this would go quiet exactly when it was needed — the fixed
    // lookahead mistake, one file over.
    const after = script.indexOf("await shutdown();");
    ok("the acceptance script closes the browser at the end", after > 0);
    const tail = script.slice(script.indexOf("\n}", after) + 2);
    ok("…and tallies after it", tail.includes("assembled application works"), tail.slice(0, 200));
    const say = (checks, failures, code) => {
      const said = [];
      const fakeConsole = { log: (s) => said.push(String(s)), error: (s) => said.push(String(s)) };
      const fakeProcess = { exit: (c) => { throw { exited: c }; } };
      let exited = 0;
      try {
        new Function("checks", "failures", "code", "console", "process", tail)(
          checks, failures, code, fakeConsole, fakeProcess,
        );
      } catch (e) {
        if (typeof e?.exited !== "number") throw e;
        exited = e.exited;
      }
      return { said: said.join("\n"), exited };
    };

    const broke = say(150, [], 1);
    ok("a run that stopped early does not report zero failures", !/\bfailed\b/.test(broke.said), broke.said);
    ok("…it says it stopped, and how far it got", broke.said.includes("150") && /stopped|never ran/.test(broke.said), broke.said);
    ok("…and it is still an exit code of 1", broke.exited === 1);
    ok(
      "…and it does not claim the application works",
      !broke.said.includes("assembled application works"),
      broke.said,
    );

    const red = say(579, ["a check that failed"], 0);
    ok("a finished run with a failure names it", red.said.includes("a check that failed"), red.said);
    ok("…and exits 1", red.exited === 1);

    const green = say(579, [], 0);
    ok("a finished clean run reports its total", green.said.includes("579 checks"), green.said);
    ok("…and says so", green.said.includes("assembled application works"), green.said);
    ok("…and does not exit non-zero", green.exited === 0);
  }

  // ----------------------------------------------------------- and CI runs it

  // The forward half of `gate.test.mjs`'s shape. A sweep nothing invokes is the
  // same failure as a sweep that inspects nothing, one level up.
  const workflow = read(WORKFLOW);
  ok("some job runs the acceptance script", workflow.includes("npm run accept"));
  const pkg = JSON.parse(read("ksav/app/package.json"));
  ok("and `npm run accept` is that script", (pkg.scripts?.accept ?? "").includes("acceptance.mjs"));
}

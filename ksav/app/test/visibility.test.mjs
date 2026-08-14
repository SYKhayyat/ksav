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

  // ----------------------------------------------------------- and CI runs it

  // The forward half of `gate.test.mjs`'s shape. A sweep nothing invokes is the
  // same failure as a sweep that inspects nothing, one level up.
  const workflow = read(WORKFLOW);
  ok("some job runs the acceptance script", workflow.includes("npm run accept"));
  const pkg = JSON.parse(read("ksav/app/package.json"));
  ok("and `npm run accept` is that script", (pkg.scripts?.accept ?? "").includes("acceptance.mjs"));
}

// Where a silent render check says to look next.
//
// # The finding (#188)
//
// `desktop shell`'s render check timed out on `main`, and the message it printed
// ended with one fixed guess: "the page loaded and did not run the probe". That
// is true for one of the three states a timeout can be in, and it is the one
// that sends a reader to the frontend. The state that was actually true — the
// shell reached its setup, declared its window under another label, and so never
// found one to evaluate the measurement in — was reported the same way, with no
// line naming the label that was there instead.
//
// Measured, by relabelling `tauri.conf.json`'s window to `primary` from `main`:
// 25 seconds, a boot record saying the window existed, and a message blaming the
// page. The variable is the one word.
//
// So the decision is a function of two facts — the labels the shell recorded and
// the label the probe asked for — and this file asserts all three answers,
// because each answer is a claim about which half of the program to open.

import { readFileSync } from "node:fs";
import { ok, check } from "./harness.mjs";
import { whyNoAnswer, whyNoWindow } from "../tools/render-check.mjs";

/** A source file this test reads as text, relative to `app/`. */
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

export async function run() {
  // --- a clean exit is not a webview fault (#196) ---------------------------
  //
  // `tauri-plugin-single-instance` hands a second launch to the first and exits
  // **0**. The check read that exit as "the webview did not start" — the sentence
  // #189 is an open investigation into — so a developer who hit it locally
  // believed they had reproduced a runner failure. Three states, three answers,
  // and the difference between them is the exit status alone.
  {
    const handover = whyNoWindow({ status: 0, signal: null, timedOut: false });
    check("a clean exit 0 without a window is a handover", handover.kind, "handover");
    ok("…and it says so instead of blaming the webview", !handover.sentence.includes("webview did not start"), handover.sentence);
    ok("…and it names the plugin's behaviour as the cause", handover.advice.includes("single-instance"));
    ok("…and it says what to do about it", handover.advice.includes("Close the running Ksav"));

    // A webview that never starts does not exit successfully, and this is the
    // only place the two are told apart.
    const dead = whyNoWindow({ status: 1, signal: null, timedOut: false });
    check("a non-zero exit is still a dead webview", dead.kind, "no-webview");
    ok("…and keeps the old sentence for the case it is right about", dead.sentence.includes("webview did not start"));
    const killed = whyNoWindow({ status: null, signal: "SIGSEGV", timedOut: false });
    check("a signal is a dead webview too", killed.kind, "no-webview");

    // Neither of those. Still running at the deadline with no window record — the
    // measured state in CI, and the one that used to be reported as "the webview
    // did not start": a cause named from an absence, which is the sentence #189
    // has been open about for three rounds of investigation.
    const stalled = whyNoWindow({ status: null, signal: "SIGTERM", timedOut: true });
    check("still alive at the deadline is its own answer", stalled.kind, "stalled");
    ok(
      "…which says what was measured, not what caused it",
      stalled.sentence.includes("still running at the deadline") &&
        !stalled.sentence.includes("webview did not start"),
      stalled.sentence,
    );
    ok(
      "…and its advice names both possibilities rather than choosing one",
      stalled.advice.includes("webview never started") && stalled.advice.includes("stalled"),
    );
    ok("…and points at the evidence knob", stalled.advice.includes("KSAV_RENDER_KEEP"));
    // A timeout with no signal recorded is the same state; a handover cannot be
    // faked by one, because `status` is null and never 0.
    check("a bare timeout is a stall too", whyNoWindow({ status: null, signal: null, timedOut: true }).kind, "stalled");
    // **The shape `spawnSync` actually returns**, which is what the first version
    // of this branch got wrong: no `timedOut` field at all, the deadline reported
    // as `error.code`. The assertion above handed the function the property it
    // wanted and stayed green while the real run printed the old sentence.
    check(
      "and spawnSync's own shape is recognised, not a property nothing sets",
      whyNoWindow({ status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } }).kind,
      "stalled",
    );
  }

  // --- the shell never got as far as a window -------------------------------

  {
    const said = whyNoAnswer(null, "main");
    ok("no window record points at the shell, not the page", said.includes("did not reach its setup"));
    ok("and it says the webview did not start", said.includes("webview did not start"));
  }

  // --- a window exists, and it is not the one the probe asks for ------------

  {
    const said = whyNoAnswer(["primary"], "main");
    ok("a label mismatch names the label the shell does have", said.includes('"primary"'));
    ok("and names the label the probe wanted", said.includes('"main"'));
    ok("and says nothing was ever asked of the page", said.includes("nothing was ever asked"));
    ok(
      "and it does NOT blame the page — this is the #188 mistake",
      !said.includes("the page is the\n  side to look at"),
    );
    ok(
      "and it names both files whose labels have to agree",
      said.includes("tauri.conf.json") && said.includes("render_probe::WINDOW_LABEL"),
    );
  }

  // --- the window the probe asks for is there -------------------------------

  {
    const said = whyNoAnswer(["main"], "main");
    ok(
      "a window under the asked label points at the page",
      said.includes("the page is the\n  side to look at"),
    );
    ok("and does not claim a missing window", !said.includes("has no window labelled"));
  }

  // --- more than one window, and one of them matches ------------------------

  {
    const said = whyNoAnswer(["secondary", "main"], "main");
    ok(
      "one matching label among several is still the page's problem",
      said.includes("the page is the\n  side to look at"),
    );
  }

  // --- the failing run collects what the passing run never needed -----------
  //
  // WebKitGTK is silent at its default verbosity. Every attempt at #189 came
  // back with one AT-SPI warning line and no more information than "the window
  // was never created", and the reason is measurable: on a forced timeout
  // `app.err.log` is 0 bytes and the same run with the webview's logging on is
  // 2,525. So the check asks for that itself, on the failure path, because the
  // environment has to be decided before the child starts.
  {
    const source = read("tools/render-check.mjs");
    ok(
      "a run that never answers re-runs the child with WebKit's logging on",
      /WEBKIT_DEBUG:\s*"all"/.test(source) && /G_MESSAGES_DEBUG:\s*"all"/.test(source),
    );
    ok(
      "…and keeps that output beside the rest of the evidence",
      source.includes('"app.err.debug.log"'),
    );
    // The order is the assertion: asking for the log before the run fails would
    // pay a second 25 seconds on every green pass.
    const failedAt = source.indexOf("if (!existsSync(answer)) {");
    const retryAt = source.indexOf("WEBKIT_DEBUG:");
    ok(
      "…only after the first run has been found to have failed",
      failedAt > 0 && retryAt > failedAt,
    );
    ok(
      "…and the failure message says how much it collected",
      source.includes("WebKit was asked to explain itself and said"),
    );
  }

  // --- an upgrade that left the old record shape behind ---------------------

  {
    const said = whyNoAnswer([], "main");
    ok("an empty label list is a mismatch, not a success", said.includes("has no window labelled"));
  }

  // --- the chosen environment is the one the window gets (#227) -------------
  //
  // `renderEnv` is tested on its own, and a check that computed the right
  // environment and then started the child without it would pass every one of
  // those assertions. So the seam is asserted here, in the source, the way the
  // rest of this file reads it: the child's environment is the session's plus
  // what was chosen, and nothing is taken back out of it afterwards.
  {
    const source = read("tools/render-check.mjs");
    const composed = source.indexOf("{ ...process.env, ...env,");
    ok("the child is started with the session's environment plus the chosen one", composed > 0);
    ok(
      "…and nothing is deleted from it afterwards",
      !/delete\s+childEnv\[/u.test(source),
    );
    // The record keeps what was chosen, so a red run can be read without
    // guessing which backend it measured.
    ok("…and the run records it", source.includes("env,\n    notes,"));
  }
}

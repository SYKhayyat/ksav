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

import { ok, check } from "./harness.mjs";
import { whyNoAnswer, whyNoWindow } from "../tools/render-check.mjs";

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

    // Neither of those. Alive, and never reached setup: the app's own start
    // stalled, which is a third place to look.
    const stalled = whyNoWindow({ status: null, signal: null, timedOut: false });
    check("alive and windowless is its own answer", stalled.kind, "hung");
    ok("…and it does not send the reader to the webview", !stalled.sentence.includes("webview did not start"));
    check("a timeout is not a handover", whyNoWindow({ status: null, signal: null, timedOut: true }).kind, "no-webview");
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

  // --- an upgrade that left the old record shape behind ---------------------

  {
    const said = whyNoAnswer([], "main");
    ok("an empty label list is a mismatch, not a success", said.includes("has no window labelled"));
  }
}

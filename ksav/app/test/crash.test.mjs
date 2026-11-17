// The last line of defence, and the one nobody can see working.
//
// When something throws that nobody caught, `crash.ts` does three things in
// order: synchronously park the document in `localStorage`, offer it as a
// download, show what happened. The first two are the point and the third is
// for the bug report. This module had no test between it and the writer, which
// is the one gap a repository with `crash.ts` in it should not have — every
// claim worth making about a crash handler is a claim about the order things
// happen, and order is exactly what a test can see.
//
// The `reported` flag and `stash`'s synchronous localStorage write are the two
// details the rest of the file's comments argue about, and both are asserted
// below: one panel per process no matter how often the render loop throws, and
// no point pretending a rescue happened if the write did not land before the
// next line ran.

import { check, ok, notOk, installChrome } from "./harness.mjs";
import {
  stash,
  recovery,
  clearRecovery,
  worthOffering,
  describe,
  install,
  _resetReported,
} from "../.tmp-test/crash.mjs";

export async function run() {
  // A window that actually dispatches: `install` listens on `window`, and the
  // harness's default stub records nothing and fires nothing, so a handler
  // installed on it could never be exercised here.
  const listeners = new Map();
  const fakeWindow = {
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
    },
    dispatchEvent(e) {
      for (const fn of listeners.get(e.type) ?? []) fn(e);
      return true;
    },
  };
  const chrome = installChrome({ window: fakeWindow });
  try {
    // ---------------------------------------------- the synchronous rescue

    {
      notOk("an empty body is not a rescue", stash("דף", "", "d1"), "empties");
      check("a body is parked synchronously", stash("דף", "הטקסט", "d1"), true);
      const r = recovery();
      check("…and comes back", r?.body, "הטקסט");
      check("with the title, for the offer to say which document", r?.title, "דף");
      check("and the id, so the next session can compare", r?.id, "d1");
      ok("with an at, so a stale one can be recognised", typeof r?.at === "number", String(r?.at));
      clearRecovery();
      check("clearing removes it", recovery(), null);
    }

    {
      check("no rescue yet is no rescue", recovery(), null);
      localStorage.setItem("ksav.recovery", "not json");
      check("garbage is treated as none", recovery(), null);
      localStorage.setItem("ksav.recovery", JSON.stringify({ at: 1, title: "x", body: "" }));
      check("a rescue with no text is treated as none", recovery(), null);
      localStorage.clear();
    }

    // ----------------------------------------- the offer is not a nuisance
    //
    // The reported symptom: a crash notice on opening a document that then
    // loads perfectly, because autosave had already written the text. The
    // offer is worth nothing if the text it holds is already somewhere the
    // writer can reach, and `worthOffering` is that comparison.
    {
      localStorage.setItem("ksav.recovery", JSON.stringify({ at: 1, title: "x", body: "  המאמר  " }));
      ok(
        "a rescue whose text is already safe is not offered",
        !worthOffering(recovery(), ["המאמר", "other"]),
        "the duplicate from a loaded document",
      );
      ok(
        "the same text the library holds is not offered either",
        !worthOffering(recovery(), [null, "המאמר"]),
        "known is a list of copies, and one matches",
      );
      ok(
        "a rescue with no known copy is offered",
        worthOffering(recovery(), ["שונה", null, ""]),
        "nothing matches",
      );
      localStorage.setItem("ksav.recovery", JSON.stringify({ at: 1, title: "x", body: " \n " }));
      ok("only-whitespace is not offered", !worthOffering(recovery(), []), "nothing to offer");
      localStorage.clear();
    }

    // ------------------------------------------- the sentence and the detail
    {
      const e = new Error("يبطئ");
      e.stack = "at line 12";
      check("an Error keeps the message for the panel", describe(e).said, "يبطئ");
      check("and the stack for the report", describe(e).detail, "at line 12");
      check("a string is both", describe("disk is full").said, "disk is full");
      check("anything else is turned into something printable", describe({ a: 1 }).said, "[object Object]");
    }

    // --------------------- the handler: one panel, and the text at crash time
    {
      _resetReported();
      let shown = 0;
      let stashTitle = "";
      const untrash = install(
        () => ({ title: (stashTitle = "בזמן הקריסה"), body: "כאן הייתה הבעיה", id: "d9" }),
        () => {
          shown++;
        },
      );
      fakeWindow.dispatchEvent({ type: "error", error: new Error("boom") });
      fakeWindow.dispatchEvent({ type: "error", error: new Error("boom again") });
      check("the panel appears exactly once per process", shown, 1);
      check("…even though the loop kept throwing", recovery()?.body, "כאן הייתה הבעיה");
      check("the text is read at crash time, not held onto", stashTitle, "בזמן הקריסה");
      untrash();
      _resetReported();
    }

    {
      // A crash handler that crashes is how an app stops being able to tell
      // anyone anything: `text()` must be allowed to throw, and the panel
      // must still show.
      _resetReported();
      let shown = 0;
      const untrash = install(
        () => {
          throw new Error("storage gone");
        },
        () => {
          shown++;
        },
      );
      fakeWindow.dispatchEvent({ type: "error", error: new Error("boom") });
      check("a throwing rescue still shows the crash", shown, 1);
      untrash();
      _resetReported();
    }
  } finally {
    localStorage.clear();
    chrome.restore();
  }
}
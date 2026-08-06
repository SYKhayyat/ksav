// The shell's small parts: the crash rescue, the DOM helpers, the mode loader,
// and the worker-host module swap.
//
// Four modules, none of them reachable from the test suite until now. Two of
// them are load-bearing in a way their size hides:
//
// **`crash.ts` is the last thing that runs before the writer loses an evening.**
// Its whole design is an ordering argument — stash the text synchronously,
// *then* offer it, *then* say what happened — and it carries a `_resetReported`
// function whose doc comment is the word "tests". There were none.
//
// **`wasm-worker-host` is a build decision expressed as a module.** Two files,
// four lines of code, twenty-five of explanation: Vite's worker plugin resolves
// `new Worker(new URL(…))` during graph-walk, before dead-code elimination, so
// the guard has to be a *module swap* rather than an `if`. Nothing checked that
// the two halves of the swap still have the same shape, which is the one way
// that arrangement breaks.

import { check, ok, notOk, rejects, installChrome } from "./harness.mjs";
import { stash, recovery, clearRecovery, describe, install, _resetReported } from "../.tmp-test/crash.mjs";
import { escapeAttr, humanSize } from "../.tmp-test/dom.mjs";
import { MODES, isMode, loadError, setSaveCommand, extensionFor } from "../.tmp-test/keymodes.mjs";
import { createEngineWorker } from "../.tmp-test/wasm-worker-host.stub.mjs";
import * as realHost from "../.tmp-test/wasm-worker-host.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = path.resolve(HERE, "..", "src");

export async function run() {
  // ------------------------------------------------ rescuing the document

  {
    clearRecovery();
    check("nothing to recover from a clean start", recovery(), null);
    ok("a document is stashed", stash("קונטרס", "כל מה שכתבתי הערב\n"));
    const r = recovery();
    ok("and comes back", !!r);
    check("with the text intact", r.body, "כל מה שכתבתי הערב\n");
    check("and the title, so the offer can name it", r.title, "קונטרס");
    ok("stamped, so a stale one can be recognised", typeof r.at === "number" && r.at > 0);
    clearRecovery();
    check("and clearing it clears it", recovery(), null);
  }

  {
    // An empty document is not worth rescuing, and offering to restore nothing
    // over somebody's actual work is worse than not offering.
    clearRecovery();
    notOk("an empty document is not stashed", stash("ריק", ""));
    check("and nothing is offered", recovery(), null);
  }

  {
    // The quota. `localStorage.setItem` is the *only* synchronous write in the
    // browser, which is the whole reason it is the rescue — but it is also the
    // one that throws when full. A crash handler that throws inside the crash
    // is how an application stops being able to tell anybody anything.
    clearRecovery();
    localStorage.quota = 10;
    notOk("a full store is reported rather than thrown", stash("ארוך", "x".repeat(500)));
    localStorage.quota = Infinity;
    check("and nothing half-written is left behind", recovery(), null);
  }

  {
    // Garbage in storage reads as "nothing to recover", not as a crash on boot.
    // This runs during startup, which is the worst possible place to throw.
    localStorage.setItem("ksav.recovery", "{not json");
    check("unparseable storage is survived", recovery(), null);
    localStorage.setItem("ksav.recovery", JSON.stringify({ at: 1, title: "t" }));
    check("and so is a record with no body", recovery(), null);
    clearRecovery();
  }

  {
    // The split that `sources.test.mjs` exists to protect, at the one place it
    // is most tempting to break: the sentence a person reads and the machine's
    // own string are two different values, and the panel gets both separately.
    const e = new Error("הכל נשבר");
    const d = describe(e);
    check("the sentence is the message", d.said, "הכל נשבר");
    ok("the detail is the stack", d.detail.includes("Error"));
    notOk("and the sentence is not the stack", d.said.includes("at "));

    check("a thrown string is its own sentence", describe("סתם מחרוזת").said, "סתם מחרוזת");
    ok("and an object still produces both", !!describe({ a: 1 }).said);
    ok("with an Error that has no message, the name stands in", describe(new TypeError()).said.length > 0);
  }

  {
    // The panel appears once. "A broken render loop can throw sixty times a
    // second, and a crash reporter that stacks sixty dialogs is a second crash."
    const chrome = installChrome();
    try {
      const handlers = {};
      chrome.set("window", {
        addEventListener: (name, fn) => (handlers[name] = fn),
        removeEventListener: (name) => delete handlers[name],
        setTimeout: (fn) => fn,
      });
      _resetReported();
      clearRecovery();
      let shown = 0;
      const uninstall = install(() => ({ title: "ט", body: "הטקסט שנשמר" }), () => shown++);
      ok("both listeners are installed", !!handlers.error && !!handlers.unhandledrejection);

      handlers.error({ error: new Error("first") });
      check("the first crash is reported", shown, 1);
      ok("and the document was rescued", recovery()?.body === "הטקסט שנשמר");

      handlers.error({ error: new Error("second") });
      handlers.unhandledrejection({ reason: new Error("third") });
      check("and sixty more report nothing", shown, 1);

      uninstall();
      check("uninstalling removes the listeners", Object.keys(handlers), []);
      clearRecovery();
      _resetReported();
    } finally {
      chrome.restore();
    }
  }

  {
    // The rescue must survive its own text function throwing — that function
    // reaches into an editor that is, by construction, in an unknown state.
    const chrome = installChrome();
    try {
      const handlers = {};
      chrome.set("window", {
        addEventListener: (n, f) => (handlers[n] = f),
        removeEventListener: () => {},
        setTimeout: (fn) => fn,
      });
      _resetReported();
      let shown = 0;
      install(
        () => {
          throw new Error("the editor is gone too");
        },
        () => shown++,
      );
      handlers.error({ error: new Error("boom") });
      check("the panel is still shown when the rescue itself fails", shown, 1);
      _resetReported();
    } finally {
      chrome.restore();
    }
  }

  // ------------------------------------------------ the DOM helpers

  {
    // `escapeAttr` guards every place a document's *title* reaches HTML — the
    // print window, the Word envelope, the page-image export. A title with a
    // quote in it is not exotic; `שו"ת` is how half of them are written.
    check("quotes are escaped", escapeAttr('שו"ת'), "שו&quot;ת");
    check("ampersands first, so nothing is double-escaped", escapeAttr("&amp;"), "&amp;amp;");
    check("and angle brackets", escapeAttr("<script>"), "&lt;script>");
    check("ordinary Hebrew is left alone", escapeAttr("קונטרס"), "קונטרס");
  }

  {
    check("bytes read as KB", humanSize(2048), "2 KB");
    check("and megabytes at the boundary", humanSize(1024 * 1024), "1.0 MB");
    check("just under it is still KB", humanSize(1024 * 1024 - 1), "1024 KB");
    check("nothing is 0 KB rather than blank", humanSize(0), "0 KB");
  }

  // ------------------------------------------------ vim, emacs, and neither

  {
    check("three modes and no more", MODES, ["default", "vim", "emacs"]);
    ok("a stored mode is recognised", isMode("vim"));
    notOk("and a stored anything-else is not", isMode("kakoune"));
    notOk("including a non-string", isMode(3));
    notOk("and undefined, which is what a fresh profile has", isMode(undefined));
  }

  {
    // Plain editing is not a package: asking for it must not touch the network,
    // and must not leave an error behind from a previous failed load.
    check("the default mode is no extension at all", await extensionFor("default"), []);
    check("and nothing failed", loadError(), null);
    setSaveCommand(() => {});
  }

  // ------------------------------------------------ the module swap

  {
    // The stub's contract is that it *throws*, and says which build to use.
    // Silently returning something worker-shaped would produce an engine that
    // never answers, which is the failure the whole arrangement exists to make
    // impossible.
    let threw = null;
    try {
      createEngineWorker();
    } catch (e) {
      threw = e;
    }
    ok("the stub refuses rather than returning a dud", !!threw);
    ok("and names the build that has the engine", String(threw.message).includes("VITE_WASM=1"));
  }

  {
    // The swap only works if both halves answer to the same name. `vite.config.ts`
    // aliases one file to the other, so a rename on either side produces a build
    // that fails at the alias — or, worse, one where the alias silently misses and
    // the 29 MB wasm module comes back into the download this arrangement exists
    // to prevent.
    check(
      "both halves export the same thing",
      Object.keys(realHost).sort(),
      ["createEngineWorker"],
    );
    const config = await readFile(path.resolve(SRC, "..", "vite.config.ts"), "utf8");
    ok("and the alias is still wired", config.includes("wasm-worker-host"));

    // And the reason the split exists at all: the `new Worker` construct must be
    // in exactly one of them, because Vite's plugin resolves it eagerly wherever
    // it appears. The stub having one would undo the whole thing silently.
    const real = await readFile(path.join(SRC, "wasm-worker-host.ts"), "utf8");
    const stub = await readFile(path.join(SRC, "wasm-worker-host.stub.ts"), "utf8");
    // Code only: the stub's own comment says the words "new Worker", which is
    // the correct thing for it to say and would fool a naive grep.
    const code = (src) =>
      src
        .split(String.fromCharCode(10))
        .filter((l) => {
          const t = l.trim();
          return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .join(" ");
    ok("the real host spawns a worker", /new Worker\(/.test(code(real)));
    notOk("and the stub has none for the plugin to find", /new Worker\(/.test(code(stub)));
  }
}

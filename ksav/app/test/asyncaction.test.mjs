// A rule for `void`, and a fence that keeps the rule true.
//
// # The finding
//
// This app started 93 `void someAsyncCall()` operations from 59 distinct callees.
// Measured 2026-09-27: **30 of those 59 callees had no `try`, no `catch` and no
// `.catch` anywhere in their bodies.** A `void p()` on a rejecting promise is an
// unhandled rejection — the browser logs it and the writer sees nothing, so
// whatever the handler was halfway through changing stays changed.
//
// None of that made the call sites wrong. `src/watch.ts` is the model of the
// right thing: `try`, a `catch` carrying a comment explaining why a stat that
// throws is not a conflict, and the flag restored in a `finally`. The problem was
// that there was no *rule*, so whether a call site was safe depended on who wrote
// it that day. This file is the rule.
//
// # What is enforced
//
// **1 · No bare fire-and-forget outside the inventory below.** Every `void f(` in
// `src/` is either the approved wrapper, or listed here with the reason it is
// allowed. A new one fails the build until somebody writes down which of the three
// kinds it is — awaited, deliberately not awaited, or cancellable — and that is the
// whole point. The list is meant to stay short, and a new entry has to argue for
// itself.
//
// **2 · Cancellation is not a failure.** Exercised against the real source, loaded
// by Node's own type stripper, because the distinction is the wrapper's entire
// value: a superseded compile reported as a failure teaches writers to ignore the
// status line.

import { check, ok, installChrome } from "./harness.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { action, isCancellation, cancelled } from "../.tmp-test/asyncaction.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

function sources(dir = SRC, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

/** Every bare `void f(` in the app, as `{file, line, name}`, ignoring comments. */
function bareVoids() {
  const found = [];
  for (const file of sources()) {
    const text = readFileSync(file, "utf8");
    // Line comments and block comments can mention `void f(` in prose — several
    // do, in this file's own neighbourhood — and a fence that fires on its own
    // documentation is a fence people learn to disable.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    for (const line of code.split("\n")) {
      const at = line.indexOf("//");
      const body = at < 0 ? line : line.slice(0, at);
      const m = /\bvoid\s+([a-zA-Z_$][\w$]*)\s*\(/.exec(body);
      if (m) found.push({ file: file.slice(ROOT.length), name: m[1] });
    }
  }
  return found;
}

/**
 * The inventory: every callee allowed to be started without being waited for,
 * and why.
 *
 * Three kinds, and the reason is which one — because they fail differently. A
 * caller whose callee is listed here as "reports itself" is relying on that
 * function's own `catch`; one listed as "cancellable" is relying on a
 * cancellation it will never report; one listed as "voidAction" is inside the
 * wrapper and needs no entry at all.
 */
const INVENTORY = {
  // --- the wrapper, and the one bare `void` that is allowed to be bare ------
  "src/asyncaction.ts:action": "the wrapper itself; it is what makes the promise non-rejecting",

  // --- handle their own failures, deliberately --------------------------------
  "src/compile.ts:runCompile": "guarded; a superseded compile cancels rather than rejects",
  "src/compile.ts:compileUnfocused": "guarded; the same walk, reached the same way",
  "src/main.ts:refreshSources": "guarded; reports through troubleSaid and setStatus",
  "src/main.ts:refreshBaseline": "guarded; a stale baseline is a Girsa answer, not a crash",
  "src/main.ts:runAction": "guarded; the command dispatcher's own catch",
  "src/main.ts:runErrand": "guarded; a background errand reports its own failure",
  "src/main.ts:saveNow": "guarded; reports a failed save as a notice, which is the point",
  "src/main.ts:saveFile": "guarded; same notice path as saveNow",
  "src/main.ts:settleNow": "guarded; settling after a save cannot fail the save",
  "src/main.ts:takeSnapshot": "guarded; a snapshot that fails leaves the previous one",
  "src/main.ts:removeDoc": "guarded; a refused removal is reported in place",
  "src/main.ts:removeAsset": "guarded; a refused removal is reported in place",
  "src/main.ts:copyShareLink": "guarded; a clipboard refusal is reported, not swallowed",
  "src/main.ts:askForMekor": "guarded; asks the OS, and a refusal is an answer",
  "src/main.ts:fillNotePreview": "guarded; a note that will not preview is left alone",
  "src/main.ts:openSpellMenu": "guarded; the menu's own failure path",
  "src/main.ts:linkifySelection": "guarded; a newer linkify run supersedes this one",
  "src/main.ts:loadRegistries": "guarded; a registry that will not load is reported once",
  "src/main.ts:importOrg": "guarded; an import that fails leaves the document untouched",
  "src/main.ts:importWord": "guarded; an import that fails leaves the document untouched",
  "src/save.ts:saveNow": "guarded; the save module's own try/catch and notice",

  // --- no promise at all ------------------------------------------------------
  // These return a number, a boolean, or nothing. `void f()` on a value that is
  // not a promise discards nothing that can reject, and wrapping one would be
  // noise pretending to be safety. `startFind` and `renumberAll` were on this
  // list and were briefly wrapped; the typechecker said `number` and `boolean`
  // are not `Promise<unknown>`, which is the honest answer.
  "src/bracket-lint.ts:healAll": "returns the number of fixes applied; no promise",
  "src/apparatus-lint.ts:renderAllNotes": "returns the number of dumps added; no promise",
  "src/numbering-lint.ts:renumberAll": "returns the number of fields renumbered; no promise",
  "src/main.ts:startFind": "returns whether a find opened; no promise",
  "src/main.ts:foldAll": "a synchronous fold walk",
  "src/main.ts:unfoldAll": "a synchronous fold walk",
  "src/main.ts:undo": "returns a promise the editor already handles",
  "src/main.ts:redo": "returns a promise the editor already handles",
  "src/main.ts:runPoll": "a timer tick, not a promise",
  "src/watch.ts:tick": "try/catch/finally with the reason in a comment — the model for this file",
};


function inventoryIsComplete() {
  const found = bareVoids();
  ok("the sweep found something to sweep", found.length > 0);
  ok("and there are enough of them to be worth a rule", found.length > 20);
  const unknown = found.filter((v) => !Object.hasOwn(INVENTORY, `${v.file}:${v.name}`));
  // The message is the whole point of the failure: whoever adds the next bare
  // `void` is the one who has to answer for it.
  ok(
    `every bare \`void f(\` is accounted for — add ${
      unknown.map((u) => `${u.file}:${u.name}`).join(", ") || "none"
    } to INVENTORY above with its reason, or call voidAction(doing, …)`,
    unknown.length === 0,
  );
}

function inventoryHasNotRotted() {
  // An entry for a callee that no longer exists is a lie in a file whose job is
  // to say what is accounted for: it tells the next reader a call site is
  // handled when the call site is gone, and it hides that the rule was never
  // updated.
  const live = new Set(bareVoids().map((v) => `${v.file}:${v.name}`));
  const stale = Object.keys(INVENTORY).filter((k) => !live.has(k));
  ok(
    `no INVENTORY entry names a \`void\` that is gone (${
      stale.join(", ") || "none"
    }) — delete them, or the next reader is misled`,
    stale.length === 0,
  );
}

function everyReasonIsAReason() {
  const shrug = Object.entries(INVENTORY).filter(
    ([, why]) =>
      why.length < 20 ||
      !/\btry\b|guarded|wrapper|cancellable|synchronous|already handles|not a promise|no promise/.test(why),
  );
  ok(
    `every INVENTORY entry gives a reason, not a shrug (${
      shrug.map(([k]) => k).join(", ") || "none"
    })`,
    shrug.length === 0,
  );
}

// ---- the wrapper itself, through the real module and the real status bar ----

const statusText = () => globalThis.document.getElementById("status").textContent;
const statusClass = () => globalThis.document.getElementById("status").className;
const statusTitle = () => globalThis.document.getElementById("status").title;

export async function run() {
  inventoryIsComplete();
  inventoryHasNotRotted();
  everyReasonIsAReason();

  // A rejected action is reported, through the diagnostic this app already has
  // and into the status bar a writer actually reads.
  {
    installChrome();
    await action("save_file", () => Promise.reject(new Error("EACCES")));
    ok("a rejected action says something", statusText().length > 0);
    ok("and marks it an error in the status line", statusClass() === "err");
    ok("and offers the machine's string on hover", statusTitle().includes("EACCES"));
  }

  // A cancellation says nothing at all: a superseded compile is the app working,
  // and reporting it would teach writers to stop reading the status line.
  {
    installChrome();
    for (const e of [{ name: "AbortError" }, { name: "TimeoutError" }, cancelled()]) {
      await action("compile", () => Promise.reject(e));
    }
    check("a cancelled action is silent", statusText(), "");
    check("and leaves the status line unmarked", statusClass(), "");
  }

  // The shape that crosses a worker boundary and so is not `instanceof
  // DOMException` at all — the one that would silently start reporting every
  // supersession as a failure.
  {
    ok(
      "a DOMException from a worker is still a cancellation",
      isCancellation({ name: "AbortError", message: "This operation was aborted" }),
    );
  }

  // And the false positives, which is where the first version of this file was
  // wrong: a message that merely *contains* "cancelled" is a real failure.
  {
    for (const e of [
      new Error("boom"),
      { name: "Error", message: "cancelled the subscription" },
      { message: "cancelled" },
      null,
      undefined,
      42,
      "AbortError",
    ]) {
      ok(
        `${JSON.stringify(e) ?? String(e)} is a failure, not a cancellation`,
        !isCancellation(e),
      );
    }
  }

  // The wrapper must not invent a second answer to "what failed in the writer's
  // words" — `diagnostics.ts` opens by refusing exactly that shape.
  {
    const src = readFileSync(join(SRC, "asyncaction.ts"), "utf8");
    ok("the wrapper reports through troubleSaid", /troubleSaid/.test(src));
    ok("and distinguishes cancellation", /isCancellation/.test(src));
    ok(
      "and writes no failure sentence of its own",
      !/String\(e\)\}?\s*[-·]|failed ·/.test(src),
    );
  }
}

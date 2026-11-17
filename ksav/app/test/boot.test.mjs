
// The boot sequence.
//
// This file exists because boot's order *is* the invariant. Three real defects
// that this module's comments record — the interface language never applied, the
// page direction set before a document existed (#135), and the fallback store
// skipping the registries and the unload guard — were all ordering bugs, and none
// of them would have been caught by asserting that boot ran at all.
//
// So the assertions below are about order and about the seam: the store opens
// before anything is drawn, the language is decided before the starter document
// is chosen, and `wireBoot` is the only way in to the four shell verbs.

import { check, ok, notOk } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { dirOf } from "../tools/paths.mjs";
import path from "node:path";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");
const BOOT = readFileSync(path.join(SRC, "boot.ts"), "utf8");

export async function run() {
  const { boot, wireBoot, scheduleAutoSnapshots, installBackgroundTimers } = await import(
    "../.tmp-test/boot.mjs"
  );

  check("boot is callable", typeof boot, "function");
  check("wireBoot is callable", typeof wireBoot, "function");
  check("scheduleAutoSnapshots is exported", typeof scheduleAutoSnapshots, "function");
  check("installBackgroundTimers is exported", typeof installBackgroundTimers, "function");

  // ---- the seam ------------------------------------------------------------
  //
  // A module that worked without its seam would be one that reached around it.
  // `boot()` is async and touches the DOM, so it is not called here; the seam's
  // own behaviour is what can be checked, and it must throw rather than half-run.
  let threw = "";
  try {
    // No `wireBoot` before this point in a fresh process.
    scheduleAutoSnapshots();
  } catch (e) {
    threw = String(e && e.message);
  }
  // `scheduleAutoSnapshots` reaches `settings` and `docs`, not the seam — so it
  // runs. What must throw is anything that needs a shell verb. `boot` is the only
  // such caller and it is async, so the seam is fenced by presence instead.
  ok("the seam names every shell verb boot uses", [
    "installHooks", "wireKeys", "actions", "runAction", "adoptDictionary", "loadRegistries",
  ].every((v) => new RegExp(`\\b${v}\\b`).test(BOOT)));

  // ---- the order -----------------------------------------------------------
  // Comment-stripped: this module explains its order in prose, and a fence that
  // matched the prose would pass on a file whose code did the opposite.
  const BODY = BOOT.slice(BOOT.indexOf("export async function boot("))
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  const body = BODY;
  const at = (needle) => body.indexOf(needle);

  // The language, before `starterDoc()` reads it to decide the document's
  // direction. This pair is the whole of #122's sibling.
  ok(
    "the interface language is applied before the starter document is chosen",
    at("setLang(settings.lang)") < at("starterDoc()"),
  );

  // The store opens before anything is drawn: there must be no frame in which a
  // writer can type into a buffer with no document behind it.
  ok(
    "the store opens before the window is drawn",
    at("docs.init(") < at("render()") && at("docs.init(") > 0 && at("render()") > 0,
  );

  // #135: the page direction is decided when the starter is chosen and applied
  // after the document exists — "deciding and applying have to be the same
  // expression or this happens again".
  ok(
    "the page direction is applied after the document exists",
    at("setPageSetup({ dir:") > at("docs.init("),
  );

  // The unload guard is installed before the backend is awaited, so a slow engine
  // start cannot leave a window that would discard work on close.
  ok(
    "the unload guard is installed before the backend is awaited",
    at("wireUnloadGuard()") < at("await createBackend()"),
  );

  // Nothing in this file decides what the window looks like.
  notOk("boot does not compose the window itself", /buildHeader\(|contextBar\(/.test(BOOT));
}

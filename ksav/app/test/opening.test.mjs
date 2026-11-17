// Opening a document: where it lands, and the door it has to come through.
//
// # The report
//
// *"Opening a document replaces the one you had open."* True, and true of
// **every** route in: the switcher panel, the Documents menu's open set, the
// library, opening a file, reopening a bound file, an import, a share link, a
// rescued draft, a duplicate, a new blank document, and an error in an included
// chapter. Each one called `openDoc`, which puts the arriving sefer into the
// panes the writer was standing in. Nothing was lost from disk. What was lost
// was the arrangement — which, for somebody comparing two seforim side by side,
// is the work.
//
// The `⧉` control on two menu rows already opened a second arrangement, so the
// capability existed and only the default was wrong.
//
// # And the one that was not an `openDoc` call at all
//
// Picking a **template** dispatched the template body over the open document's
// text: `loadBody(tpl.body)`, a single transaction replacing the whole
// document. Sweeping the `openDoc` call sites and stopping there would have
// left the sharpest instance of the reported class untouched, because it did
// not look like the others. It is here for that reason.
//
// # What is asserted
//
// Three kinds. `tabs.showing` is real behaviour and is unit-tested. The setting
// is checked for existing with the default the report argues for. And the
// wiring is read out of `main.ts` and `tabstrip.ts` as text — the established
// technique in this repository for *"which function got called"*, which is what
// this defect was and what no amount of green arithmetic could see. (The funnel
// and the routes it serves moved to `tabstrip.ts` in the wave-2 carve; the
// fence follows the code, and the prohibition did not loosen with it.)

import { check, ok, notOk } from "./harness.mjs";
import * as tabs from "../.tmp-test/tabs.mjs";
import * as panes from "../.tmp-test/panes.mjs";
import * as settings from "../.tmp-test/settings.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const MAIN = readFileSync(path.join(SRC, "main.ts"), "utf8");
const SETTINGS_DRAWER = readFileSync(path.join(SRC, "settingsdrawer.ts"), "utf8");
const TAB = readFileSync(path.join(SRC, "tabstrip.ts"), "utf8");
// The setting's own doc comment is where the contract lives (#138).
const SETTINGS_SRC = readFileSync(path.join(SRC, "settings.ts"), "utf8");
const DOCSWITCH = readFileSync(path.join(SRC, "docswitch.ts"), "utf8");
// Wave 11: the templates and the file doors call the funnel from their own files.
const FILEUI = readFileSync(path.join(SRC, "fileui.ts"), "utf8");
const TEMPLATES = readFileSync(path.join(SRC, "templates.ts"), "utf8");
// Wave 2 of #188: the header's menus are where three template/file routes are
// clicked from, so its lines are scanned with the rest.
const APPHEADER = readFileSync(path.join(SRC, "appheader.ts"), "utf8");

/** Every file that can open a document, as one line list tagged with its source. */
const LINES = [
  ...MAIN.split("\n").map((line, i) => ({ src: "main.ts", n: i + 1, line })),
  ...TAB.split("\n").map((line, i) => ({ src: "tabstrip.ts", n: i + 1, line })),
  // The switch paths moved to `docswitch.ts` in wave 10; their call sites are
  // attributed there the same way.
  ...DOCSWITCH.split("\n").map((line, i) => ({ src: "docswitch.ts", n: i + 1, line })),
  ...FILEUI.split("\n").map((line, i) => ({ src: "fileui.ts", n: i + 1, line })),
  ...TEMPLATES.split("\n").map((line, i) => ({ src: "templates.ts", n: i + 1, line })),
  ...APPHEADER.split("\n").map((line, i) => ({ src: "appheader.ts", n: i + 1, line })),
];

/** Every line of either file calling `name(`, with its position in `LINES`. */
function callsTo(name) {
  const re = new RegExp(`(^|[^\\w.])${name}\\(`);
  return LINES.map((l, at) => ({ ...l, at })).filter(
    ({ line }) => re.test(line) && !line.trim().startsWith("*") && !line.trim().startsWith("//"),
  );
}

/** A one-pane arrangement showing `docId`. */
function arrangement(docId) {
  const leaf = panes.leaf("source", docId);
  return { tree: leaf, focused: leaf.id };
}

export async function run() {
  // --------------------------------------------------- which tab shows what

  {
    tabs.reset();
    const a = arrangement("alef");
    tabs.add(a.tree, a.focused);
    const b = arrangement("beis");
    tabs.add(b.tree, b.focused);

    check("the tab showing a document is found", tabs.showing("alef"), 0);
    check("...and so is the other one", tabs.showing("beis"), 1);
    // -1 and not 0: a falsy index that reads as "the first tab" is how a
    // reuse rule turns into "everything opens in tab one".
    check("a document no tab shows is not found", tabs.showing("gimel"), -1);
  }

  {
    // Two arrangements onto one sefer is legitimate — that is what `⧉` makes,
    // and what `tabs.ts` says a tab is for. `showing` names the first, which is
    // the one a writer means by "take me back to it".
    tabs.reset();
    const a = arrangement("alef");
    tabs.add(a.tree, a.focused);
    const again = arrangement("alef");
    tabs.add(again.tree, again.focused);
    check("two tabs on one document resolve to the first", tabs.showing("alef"), 0);
  }

  {
    // A tab whose focused pane was closed still names its document — the same
    // fallback `label` relies on — or the reuse rule would miss it and open a
    // third arrangement onto a sefer already twice on screen.
    tabs.reset();
    const leaf = panes.leaf("source", "alef");
    tabs.add(leaf, "a-pane-that-is-gone");
    check("a stale focused pane does not hide the document", tabs.showing("alef"), 0);

    // And the question #138 asked: does a document named by a pane that is *not*
    // focused count as shown? No — and the assertion is that this is deliberate,
    // because a pane does not hold a document of its own (the window renders one
    // at a time; `panes.ts` says so). Counting it would send `reuse` to a tab
    // that does not have the writer's sefer in it, which is worse than the new
    // arrangement it would have made.
    tabs.reset();
    const alef = panes.leaf("source", "alef");
    const pinned = panes.leaf("source", "beis");
    const tree = { kind: "row", a: alef, b: pinned, fraction: 0.5 };
    tabs.add(tree, alef.id);
    check("a tab is named by its focused pane's document", tabs.showing("alef"), 0);
    check(
      "...and a document merely pinned in a sibling pane is not a tab's answer",
      tabs.showing("beis"),
      -1,
    );
    ok(
      "...which `tabs.ts` states rather than leaving as a reader's guess",
      /a pane does not hold a document of its own/.test(
        readFileSync(path.join(SRC, "tabs.ts"), "utf8"),
      ),
    );
  }

  // ------------------------------------------------------------- the setting

  {
    const shipped = settings.DEFAULTS ?? {};
    // The default is UAT item 34's answer, and the reason it moved is written
    // down in `Settings.openIn`: two reports about the same act, disagreeing.
    // *"Opening a document replaces the one I had open"* is answered by the
    // choice existing, not by the default being the choice; the writer's stated
    // model — Emacs — is `C-x b`, which opens here. What the first report needed
    // was `newTab` and `⧉` to exist, and both do.
    check("openIn ships as current, the Emacs answer (C-x b)", shipped.openIn, "current");
    ok(
      "...and the three answers are all offered in the drawer",
      SETTINGS_DRAWER.includes('["reuse", t("openIn.reuse")]') &&
        SETTINGS_DRAWER.includes('["newTab", t("openIn.newTab")]') &&
        SETTINGS_DRAWER.includes('["current", t("openIn.current")]'),
    );
    // The list reads as "this, unless". A default in the middle of a menu is
    // the same information with the recommendation hidden.
    const offered = [...SETTINGS_DRAWER.matchAll(/\["(current|reuse|newTab)", t\("openIn\./g)].map(
      (m) => m[1],
    );
    check("the drawer lists the default first", offered, ["current", "reuse", "newTab"]);

    // And the fallback in the funnel is that same value. Two readers — one of
    // `DEFAULTS`, one of `enterDoc` — must not be able to disagree about what
    // happens to somebody who never opened the settings drawer.
    const fallback = /settings\.openIn \?\? "(current|reuse|newTab)"/.exec(TAB)?.[1];
    check("the funnel's fallback is the shipped default", fallback, shipped.openIn);

    // The contract names the commands it is a contract with. Prose that says
    // "Emacs-like" without naming which command is prose a reader cannot check.
    const spec = SETTINGS_SRC;
    ok("the setting's own doc states the C-x b mapping", /`C-x b`/.test(spec));
    ok("...and the C-x 4 f one", /`C-x 4 f`/.test(spec));
    ok(
      "...and says the arrangement survives the open, which is the whole claim",
      /keeps the arrangement/.test(spec),
    );
  }

  // -------------------------------------------------------------- the wiring

  {
    // The prohibition. `openDoc` puts a document into the arrangement on
    // screen, which is right for *switching* and wrong for *opening*; these are
    // the switch paths, and every one of them is a document arriving into an
    // arrangement that already exists rather than a writer asking for one.
    //
    // A new call site fails here by existing. That is the point: the nineteenth
    // route into a document is the one this test is written for, and the
    // question it has to answer out loud is "is this a switch or an opening".
    const ALLOWED = new Map([
      ["goToLastDoc", "the previous document, into the arrangement you are in"],
      ["closeOpenDoc", "the document that takes the closed one's place"],
      ["removeDoc", "the same, after a deletion"],
      ["newNamedDoc", "the fallback when the last open document goes away"],
      ["openInNewTab", "the arrangement was made one line above"],
      ["enterDoc", "the funnel itself"],
      ["selectTab", "restoring the document a tab was showing"],
      ["closeTab", "the document the tab that takes its place was showing"],
      ["installHooks", "the pane wiring: the handed-over call tabstrip routes through"],
    ]);
    // Attribution is by the *enclosing top-level function*, found by scanning
    // for every `function` at column zero — not by "the nearest permitted name
    // above the call". The first draft of this test did the latter, and a call
    // in `importAs` was attributed to `closeTab` a thousand lines earlier
    // because `closeTab` happened to be the last allowed name before it. It
    // passed a deliberate regression. Which is the shape this repository calls
    // `ONLY_AT_TOP`, and the reason a fence nobody has watched fail is not one.
    const owners = LINES.map(
      ({ line }) => /^(?:export )?(?:async )?function (\w+)\b/.exec(line)?.[1] ?? null,
    );
    const owner = (n) => {
      for (let i = n - 1; i >= 0; i--) if (owners[i]) return owners[i];
      return null;
    };
    for (const fn of ALLOWED.keys()) {
      ok(`${fn} is still a top-level function, so calls can be attributed to it`, owners.includes(fn));
    }
    const stray = callsTo("openDoc").filter(
      ({ at, line }) =>
        !/^(?:export )?(?:async )?function openDoc\b/.test(line.trim()) && !ALLOWED.has(owner(at)),
    );
    check(
      `openDoc is called only from the switch paths (stray: ${stray
        .map((s) => `${s.src}:${s.n}: ${s.line}`)
        .join(" · ")})`,
      stray.length,
      0,
    );
    ok("...and there is a funnel to call instead", /async function enterDoc\(/.test(TAB));
    ok("...which reads the setting", /settings\.openIn \?\? "current"/.test(TAB));
    ok("...and there are routes coming through it", callsTo("enterDoc").length >= 10);
  }

  {
    // The template half. `loadBody` is a whole-document replacement and stays
    // one — snapshot restore, a git restore and a re-read from disk are all
    // *this* document under another version of itself. What must not go through
    // it is a template, which is a different document.
    // The template half lives in `templates.ts` since wave 11 — the
    // prohibition reads both files, or it guards a file that no longer writes
    // templates.
    notOk(
      "a stock template no longer overwrites the open document",
      MAIN.includes("loadBody(tpl.body)") || TEMPLATES.includes("loadBody(tpl.body)"),
    );
    notOk(
      "nor does a saved one",
      MAIN.includes("loadBody(ut.body)") || TEMPLATES.includes("loadBody(ut.body)"),
    );
    ok("both start a document instead", callsTo("startFromTemplate").length >= 3);
    ok(
      "...and an empty document still takes one in place, so a first template costs no tab",
      /runtime\.docText\(\)\.trim\(\) === ""/.test(TEMPLATES),
    );
  }
}

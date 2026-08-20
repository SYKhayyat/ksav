// The writer's preferences: whether they survive a reload, and what happens
// when they cannot be read.
//
// # Why this file exists
//
// `settings.ts` decides everything a person has chosen about how they work —
// theme, layout, prose mode, spell-check, sync scrolling, every keybinding, the
// editing mode — and it had **no test file**. That is the tell this repository
// has learned to read, and this is what was behind it:
//
//     const settings = loadSettings();   // line 167
//     …
//     export const PAGE_FIELDS = [ … ];  // line 190
//
// `loadSettings` reads `PAGE_FIELDS`. It is called at module scope, above the
// `const` that declares it, so it ran inside that binding's temporal dead zone
// and threw `ReferenceError: Cannot access 'PAGE_FIELDS' before initialization`
// — on every boot, in every build, since the day page setup was split out.
//
// The `catch` then did exactly what it was written to do: returned the shipped
// defaults. It was written for a corrupted JSON blob, and it absorbed a
// **programming error** with the same shrug. So no preference had ever survived
// a reload, and nothing anywhere said so. The settings drawer stayed honest for
// the length of one session, because `settings` is mutated in place, and every
// reload quietly un-chose all of it.
//
// That is the whole of "emacs mode does nothing": `boot` reads
// `settings.editingMode`, found `"default"`, and never applied the mode. The
// keymap-precedence investigation that preceded this was chasing a tie that was
// never contested.
//
// So the assertions here are of two kinds. Some are "does a stored preference
// come back", which is the feature. The rest are "does a failure to load say
// so", which is the reason this one lasted years.

import { check, ok, notOk, resetStorage } from "./harness.mjs";
import * as settings from "../.tmp-test/settings.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");

/**
 * Read the preferences that would be loaded from a given stored blob.
 *
 * `loadSettings` is exported for exactly this. The alternative — importing the
 * module afresh per case so the `settings` binding is re-evaluated — depends on
 * the module cache and on `localStorage` having been cleared in the right
 * order, and the first draft of this file was quietly reading the previous
 * case's blob because of it. The function *is* the unit; the exported `settings`
 * is one call to it.
 */
function stored(raw) {
  localStorage.clear();
  if (raw !== undefined) localStorage.setItem("ksav.settings", raw);
  return settings.loadSettings();
}

export async function run() {
  // ---------------------------------------------------- the module itself loaded
  //
  // Read before anything else touches storage, because this is the state left by
  // *importing* the module — the one moment the original bug happened.
  //
  // And this is now the fence, by construction. The `catch` used to swallow the
  // `ReferenceError` and hand back the defaults, so a broken loader looked
  // exactly like a first run. It does not catch it any more: only the `JSON.parse`
  // is guarded, so a dead-zone error propagates out of module evaluation, the
  // import of `settings.mjs` throws, and **every test file that imports it dies
  // loudly**. The failure has gone from invisible to unmissable, which is worth
  // more than any assertion here.
  check("importing the module read the store rather than giving up", settings.settingsLoadFailure(), null);

  await resetStorage();
  // ------------------------------------------------------ a preference survives

  {
    const s = stored(JSON.stringify({ editingMode: "emacs", theme: "dark", prose: false }));
    check("no failure to report", settings.settingsLoadFailure(), null);
    check("the editing mode comes back", s.editingMode, "emacs");
    check("...and the theme", s.theme, "dark");
    check("...and a false is not mistaken for absent", s.prose, false);
    // The one that mattered: `boot` gates on exactly this expression.
    ok(
      "boot's own gate would apply the mode",
      !!(s.editingMode && s.editingMode !== "default"),
    );
  }

  {
    // The defaults still underlie whatever was not stored — a blob written by an
    // older build must not blank the fields it had never heard of.
    const s = stored(JSON.stringify({ theme: "dark" }));
    check("what was stored wins", s.theme, "dark");
    check("and what was not falls back", s.layout, "two");
    check("...including one that is not in the blob at all", s.spellcheck, true);
  }

  {
    // Nothing stored at all: a first run, and every default in force.
    const s = stored(undefined);
    check("a first run reports no failure", settings.settingsLoadFailure(), null);
    check("and gets the shipped defaults", s.editingMode, "default");
  }

  // --------------------------------------------------- the migration still runs
  //
  // The page fields used to live at the top level of this blob. They are dropped
  // from the app settings and rescued into `newDocument`, and that code sits
  // *after* the point where the load used to throw — so none of it had ever run
  // in a browser either.

  {
    const s = stored(JSON.stringify({ theme: "dark", dir: "ltr", size_pt: 13, font: "David Libre" }));
    check("a page field is off the app settings", s.dir, undefined);
    check("...and so is the next one", s.size_pt, undefined);
    ok("but it was rescued rather than discarded", !!s.newDocument);
    check("with its value intact", s.newDocument.dir, "ltr");
    check("and the app field beside it is untouched", s.theme, "dark");
  }

  {
    // The old `layout: "one"` value, migrated. Same argument: this line is above
    // the throw, so it did run — but it is the only part of the loader that did,
    // and a test that only covered it would have been green throughout.
    const s = stored(JSON.stringify({ layout: "one" }));
    check("the retired layout value is migrated", s.layout, "source");
  }

  // ------------------------------------------------ a failure has somewhere to go

  {
    const s = stored("{not json at all");
    ok("unreadable storage is reported", !!settings.settingsLoadFailure());
    check("and the defaults are in force", s.theme, "light");
  }

  {
    // A blob that parses but is not a settings object. `{...DEFAULTS, ...raw}`
    // over an array would spread its indices in as keys, which is a shape
    // nothing downstream expects.
    const s = stored("[1,2,3]");
    ok("a non-object blob is reported too", !!settings.settingsLoadFailure());
    check("and does not leak its indices in", s[0], undefined);
  }

  // ------------------------------------------ the dead zone, fenced by position
  //
  // The fix is an ordering, and an ordering is exactly the kind of thing a
  // later tidy-up reverses without noticing. `tsc` cannot catch it: a `const`
  // read by a function that is *called* at module scope is legal to write and
  // only fails at run time. So the position is asserted directly.
  //
  // It is not the only thing standing between here and a repeat — the narrowed
  // `catch` is, and it turns a repeat into a failed import. This is the signal
  // that *names* the mistake, so whoever moves the block is told what they broke
  // instead of reading a `ReferenceError` out of a stack trace.

  {
    const src = readFileSync(path.join(SRC, "settings.ts"), "utf8");
    const fields = src.indexOf("export const PAGE_FIELDS");
    const loader = src.indexOf("function loadSettings()");
    const binding = src.indexOf("export const settings: Settings = loadSettings()");
    ok("PAGE_FIELDS is declared", fields > 0);
    ok("the loader reads it", src.includes("for (const key of PAGE_FIELDS)"));
    ok("...and is declared before the loader that reads it", fields < loader);
    ok("...which is before the call that evaluates it at module scope", loader < binding);
  }

  {
    // The other half of the fix, and the more important one. The catch that
    // returned the defaults absorbed a `ReferenceError` because it caught
    // everything. Only the JSON parse is inside a try now, so a defect in the
    // rest of the loader is a crash somebody can see rather than a preference
    // that quietly reverts.
    const src = readFileSync(path.join(SRC, "settings.ts"), "utf8");
    const loader = src.slice(src.indexOf("function loadSettings()"), src.indexOf("export const settings"));
    const tries = loader.split("try {").length - 1;
    check("the loader has exactly one try, around the parse", tries, 1);
    const guarded = loader.slice(loader.indexOf("try {"), loader.indexOf("} catch"));
    ok("and what it guards is the parse", guarded.includes("JSON.parse"));
    notOk("...and nothing else", guarded.includes("PAGE_FIELDS"));
  }

  // ---------------------------------------------------------------- one control
  //
  // > *"Justify belongs in one control with right, centre and left."*
  //
  // Underneath there are two fields, and that is deliberate: every document ever
  // saved holds `justify: true|false` and nothing else, so a single four-valued
  // field would have had to guess what those documents meant. The pair keeps the
  // old answer readable and lets the new one win. These two functions are the
  // only place in the application that knows the pair exists.
  {
    check("the four answers, in the order the panel offers them", [...settings.ALIGN_CHOICES], [
      "justify",
      "right",
      "center",
      "left",
    ]);
  }

  {
    // A document written before `text_align` existed. Both readings of the old
    // boolean have to land on a real choice, or the control shows nothing
    // selected for every document in the library.
    check("justified", settings.alignChoice({ justify: true, text_align: "", dir: "rtl" }), "justify");
    check(
      "and ragged is the reading edge, which in Hebrew is the right",
      settings.alignChoice({ justify: false, text_align: "", dir: "rtl" }),
      "right",
    );
    check(
      "…and the left in English",
      settings.alignChoice({ justify: false, text_align: "", dir: "ltr" }),
      "left",
    );
  }

  {
    // The new answer wins over the old one, in both directions — a document
    // holding an edge *and* `justify: true` is one the writer never asked for,
    // and it must not read as justified.
    check("an edge wins", settings.alignChoice({ justify: true, text_align: "center", dir: "rtl" }), "center");
    check("in either direction", settings.alignChoice({ justify: true, text_align: "left", dir: "rtl" }), "left");
    check(
      "and an unrecognised one falls back rather than guessing",
      settings.alignChoice({ justify: true, text_align: "sideways", dir: "rtl" }),
      "justify",
    );
  }

  {
    check("choosing justified clears the edge", settings.alignSetup("justify"), {
      justify: true,
      text_align: "",
    });
    check("choosing an edge turns justification off", settings.alignSetup("center"), {
      justify: false,
      text_align: "center",
    });
    // The round trip, which is the property that matters: what the panel writes
    // is what the panel reads back, for all four and in both directions.
    const trips = settings.ALIGN_CHOICES.flatMap((choice) =>
      ["rtl", "ltr"].map((dir) => [
        choice,
        settings.alignChoice({ ...settings.alignSetup(choice), dir }),
      ]),
    );
    check(
      "every choice reads back as itself",
      trips.filter(([want, got]) => want !== got),
      [],
    );
  }

  {
    // Both halves travel with the document, which is the whole point of B26: a
    // sefer set centred stays centred when it is opened on another machine.
    const page = settings.PAGE_FIELDS;
    ok("justify is page setup", page.includes("justify"));
    ok("and so is the edge", page.includes("text_align"));
  }

  everyPreferenceHasAControl();
  eachSyncSwitchGatesItsOwnBehaviour();
}

// ---------------------------------------------------------------- reachable
//
// A preference nothing can change is not a preference, it is a constant with a
// loader in front of it — and this file already holds one story about a
// preference that silently reverted for years, which is the same failure seen
// from the other side.
//
// Every shipped default is therefore named as a string somewhere in `main.ts`:
// as a `selectRow`/`checkRow`/`numberRow` key in the settings drawer, or as the
// field a purpose-built control writes. That is a weak check on purpose — it
// cannot tell a live control from a dead mention — but the thing it catches is
// the thing that actually happens: a field added to `Settings` and `DEFAULTS`
// with the control forgotten, which reads to a writer as a feature that does not
// exist.
function everyPreferenceHasAControl() {
  const main = readFileSync(path.join(SRC, "main.ts"), "utf8");
  // The two that are not typed into a row and never will be. `layout` is which
  // arrangement of panes is on screen — chosen from the view menu by pressing
  // the arrangement itself — and `previewFrac` is where the divider between the
  // source and the page was left, which is set by dragging it. Naming them here
  // is the point: an exemption anybody can read beats a check nobody wrote.
  const NOT_A_ROW = ["layout", "previewFrac"];
  const missing = Object.keys(settings.DEFAULTS).filter(
    (key) => !NOT_A_ROW.includes(key) && !main.includes(`"${key}"`),
  );
  check("every shipped preference is reachable from the application", missing, []);
  for (const key of NOT_A_ROW) {
    ok(`${key} is still a shipped preference`, key in settings.DEFAULTS);
  }
}

/**
 * Each sync switch gates the behaviour it is named after, and only that one.
 *
 * # The defect
 *
 * There was one setting, `syncScroll`, labelled *"synced scrolling"*. It gated
 * two things — the preview following the caret, and a click in the source
 * revealing its place in the preview — and it did **not** gate scrolling one
 * pane and having the other follow, which is what its name means and what a
 * writer turning it off is trying to stop. Meanwhile clicking the *preview* to
 * move the caret had no gate at all: not off, not on, simply unswitchable.
 *
 * So the report — *"there should be a way to disable that clicking on src
 * brings to preview and the opposite, each independently"* — was three separate
 * complaints wearing one checkbox, and the checkbox's label named the fourth
 * behaviour, the one it did not touch.
 *
 * # Why this is a source-reading test
 *
 * The four behaviours all end in a scroll position, and a unit test that drove
 * them would be asserting against a fake scroller, which is the mechanism and
 * not the wiring. What went wrong here was never arithmetic — every one of
 * those functions did its job correctly — it was *which flag was consulted at
 * the top of which function*. That is a fact about the source text, so this
 * reads the source text.
 *
 * The pairing is the whole assertion. A gate that drifts onto the wrong setting
 * puts two behaviours behind one switch again, and the switch a writer reaches
 * for stops doing what it says — which is the shape this repository keeps
 * finding, and the shape that has no symptom until somebody turns it off.
 */
function eachSyncSwitchGatesItsOwnBehaviour() {
  const main = readFileSync(path.join(SRC, "main.ts"), "utf8");
  // Behaviour → the function that performs it → the setting that must gate it.
  const GATES = [
    ["linked panes scrolling together", "wirePaneScroll", "syncScroll"],
    ["the preview following the caret", "followCaretInPreview", "followCaret"],
    ["a source click revealing in the preview", "revealFromSourceClick", "clickToPreview"],
    ["a preview click moving the caret", "jumpFromClick", "clickToSource"],
  ];
  for (const [what, fn, key] of GATES) {
    const at = main.indexOf(`function ${fn}(`);
    ok(`${fn} is still a function in main.ts`, at >= 0);
    if (at < 0) continue;
    // To the next line that closes at column zero — the end of the function,
    // since everything inside it is indented.
    const end = main.indexOf("\n}", at);
    const body = main.slice(at, end < 0 ? main.length : end);
    ok(`${what} is gated on settings.${key}`, body.includes(`settings.${key} === false`));
    // And on nothing else from this family. This is the half that catches the
    // original defect: `followCaretInPreview` reading `syncScroll` passed every
    // question anybody thought to ask about it for as long as it existed.
    for (const [, , other] of GATES) {
      if (other === key) continue;
      notOk(
        `${what} does not also answer to settings.${other}`,
        body.includes(`settings.${other} ===`),
      );
    }
  }
  // Every one of them is a real shipped preference with a default, or the gate
  // above reads `undefined`, compares false, and the switch is decorative.
  for (const [, , key] of GATES) {
    ok(`${key} ships with a default`, key in settings.DEFAULTS);
    check(`${key} defaults to on`, settings.DEFAULTS[key], true);
  }
}

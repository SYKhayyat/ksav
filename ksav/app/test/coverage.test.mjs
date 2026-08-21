import { ok, check } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { commands } from "../tools/commands.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";
import * as settings from "../.tmp-test/settings.mjs";
import { STYLE_SECTIONS } from "../.tmp-test/panelviews.mjs";
import { DESTINATION_KNOBS, REGION_KNOBS } from "../.tmp-test/channels.mjs";
import { dirOf } from "../tools/paths.mjs";

// Is it reachable from the chrome at all?
//
// The endnote is the case that forced this file. `#הערתסיום` has been in the
// engine since the first wave, is documented, renders correctly, and appeared
// in the product **only inside a chooser card** — no toolbar button, no Insert
// item, no key. Reaching it from the command palette silently lost every note,
// because nothing wrote the `#הערות_בסוף()` that prints them. And the tiered
// note, the one real note-on-a-note mechanism, had no button either while a
// cosmetic alias for it sat next to `†` in the toolbar.
//
// Every test in the suite passed. There is no assertion anywhere that a
// mechanism is *offered* — only that, once written, it compiles and lands on
// the page. So: every command in the registry appears in at least one surface a
// pointer or a keyboard can reach, or carries a written exemption saying why
// not.
//
// The exemptions are the interesting part of the file. Each one is a claim, and
// a claim about a command is checkable: a deprecated command must be marked
// deprecated in the registry, a command that only a generated panel writes must
// actually appear in that panel's source.

const HERE = dirOf(import.meta.url);
const SRC = path.join(HERE, "..", "src");
const read = (f) => readFileSync(path.join(SRC, f), "utf8");

/**
 * The registry, read from the engine's own source — by `tools/commands.mjs`.
 *
 * This used to be a 200-character regex, byte-identical to the one in
 * `notecommands.test.mjs`, with no import between them. Seven files read this
 * registry in four implementations and they disagreed about how many commands
 * exist; see the module comment there for the 116-against-115 that reached three
 * user-facing lines because of it.
 */
const registry = commands;

/**
 * Commands that legitimately reach no *dedicated* control, and the evidence.
 *
 * `deprecated` — the registry says so, and the palette and the menus filter it
 *   out on that flag rather than on a list kept here.
 * `panel: "<file>"` — a generated panel writes it. The file has to mention it.
 * `argument` — it is an argument to another command (`פריט` inside `רשימה`),
 *   never written on its own, and the structural operations produce it.
 */
const NOT_OFFERED = {
  הערה_על_הערה: { kind: "deprecated" },
  // A second name for `#הערה`. The prelude has `#let הערה(body) =
  // הערה_בדרגה(1, body)` — tier א *is* the ordinary footnote — so the Insert
  // menu was listing one function twice, as "footnote" and as "layered note —
  // tier א", which reads as "the layered kind is a different thing you have to
  // switch to before a note can hang off one". Nothing has required that since
  // the engine adopted the plain note.
  הערה_א: { kind: "deprecated" },
  // Styling several mark classes in one call. Every styled command has a door
  // named for it now — `#הגדרות_סימן`, not `#הגדרות_סימונים(גודל: ("סימן": …))`
  // — and a door refuses a knob its class has no answer for, which this could
  // not: it stored a fill on a gemara reference and never read it. Documents
  // have the line, so it still compiles; it is no longer offered anywhere.
  הגדרות_סימונים: { kind: "deprecated" },
  // Written by the Styles panel, from controls, never as a raw snippet. The
  // evidence is two-sided: `styles.ts` has to know the command, *and* main.ts
  // has to have a control that writes that kind. Either alone would pass on a
  // panel that was declared and never built — which is the exact failure this
  // whole file is about.
  הגדרות_הערות: { kind: "panel", kindKey: "notes" },
  הגדרות_כותרות: { kind: "panel", kindKey: "headings" },
  הגדרות_רשימות: { kind: "panel", kindKey: "lists" },
  הגדרות_טבלאות: { kind: "panel", kindKey: "tables" },
  הגדרות_סקירה: { kind: "panel", kindKey: "review" },
  // Structural arguments: the list and table operations write these.
  פריט: { kind: "argument", by: "lists.ts" },
  תא: { kind: "argument", by: "table.ts" },
  כותרת_תא: { kind: "argument", by: "table.ts" },
  מיזוג: { kind: "argument", by: "table.ts" },
};

export async function run() {

const MAIN = read("main.ts");
const commands = registry();
ok("the registry was parsed at all", commands.length > 90);

// A command is offered if the Insert menu can write it.
//
// This used to be `const inInsertMenu = (c) => !c.deprecated`, asserted once per
// command — about a hundred assertions restating their own premise. The file's
// stated purpose is "every command is reachable from a surface a pointer can
// touch", and **it never looked at a surface**: it asked the registry a question
// about the registry and agreed with itself, which is the exact failure it was
// written to catch, one layer up.
//
// So the surface is read. `main.ts` builds the Insert menu by walking the
// registry and dropping exactly one thing, and that is what makes `!deprecated`
// a true statement about reachability rather than a definition of it. If the
// generator ever grows a second filter, this goes red and the ~100 per-command
// claims below stop being true all at once — which is why they can now be one
// `filter` instead of a hundred `ok`s.
{
  const build = MAIN.slice(MAIN.indexOf("const cats: string[] = []"));
  const loop = build.slice(0, build.indexOf("\n  }\n"));
  ok("the Insert menu is built from the registry, not a list", /for \(const c of runtime\.commandsReg/.test(loop));
  ok("its categories come from the registry too", /for \(const c of runtime\.commandsReg\) if \(!cats\.includes/.test(build));
  ok("it writes the registry's own snippet", /insertSnippet\(c\.insert\)/.test(loop));
  const filter = /commandsReg\.filter\(\(x\) => ([^)]*)\)/.exec(loop);
  ok("the menu's filter was found", !!filter);
  check(
    "and the only command it drops is a deprecated one",
    filter[1].replace(/x\.category === cat && ?/, "").trim(),
    "!x.deprecated",
  );
  // Greyed, not hidden: a command that is illegal where the caret is stays in
  // the menu with the reason on it. That is what keeps "offered" and "usable
  // here" two different questions, and it is the reason this file can talk
  // about reachability without knowing where the caret is.
  ok("an illegal command is greyed rather than dropped", /disabled: legality\.ok \? null/.test(loop));
}

const inInsertMenu = (c) => !c.deprecated;
check(
  "every command with no written exemption is offered in the chrome",
  commands.filter((c) => !NOT_OFFERED[c.he] && !inInsertMenu(c)).map((c) => c.he),
  [],
);

for (const c of commands) {
  const exempt = NOT_OFFERED[c.he];
  if (!exempt) continue;
  switch (exempt.kind) {
    case "deprecated":
      ok(`#${c.he}: exempt as deprecated, and the registry agrees`, c.deprecated);
      break;
    case "panel":
      ok(
        `#${c.he}: styles.ts knows the command`,
        read("styles.ts").includes(c.he),
      );
      ok(
        `#${c.he}: and a control in main.ts writes it`,
        // Either through the panel's own helper or through `styles.setStyleArgs`
        // directly — the review view is set from the review drawer, not from
        // the Styles panel, and both are controls a person can press.
        MAIN.includes(`setStyleArgs("${exempt.kindKey}"`) ||
          MAIN.includes(`setStyleArgs(doc, "${exempt.kindKey}"`),
      );
      break;
    case "argument":
      ok(
        `#${c.he}: exempt as a structural argument, and ${exempt.by} writes it`,
        read(exempt.by).includes(c.he),
      );
      break;
    default:
      ok(`#${c.he}: carries a kind of evidence this test can check`, false);
  }
}

// An exemption for a command that no longer exists is a stale claim, and stale
// claims are how the welcome overlay stayed exempt from the reachability test
// while having no way out at all.
for (const name of Object.keys(NOT_OFFERED)) {
  ok(`the exemption for #${name} is for a command that exists`, commands.some((c) => c.he === name));
}

// ------------------------------------------------- the notes specifically
//
// The four that had no button between them. Each must be reachable from a
// pointer — the toolbar or the Insert menu — and not only from the modal.

for (const [what, needle] of [
  ["the footnote", 'noteBtn("footnote"'],
  ["the endnote", 'noteBtn("endnote"'],
]) {
  ok(`${what} has a toolbar button`, MAIN.includes(needle));
}
// The tiered note is the deliberate exception, and the assertion is inverted
// rather than dropped so that putting it back is a decision somebody has to make
// here. It is a real sefer apparatus used by very few documents, and the toolbar
// is the most expensive surface in the product: it keeps the Insert menu, the
// chooser and its key — checked immediately below — and gives up the button.
ok(
  "the tiered note is not in the toolbar",
  !MAIN.includes('noteBtn("tieredNote"'),
);
for (const action of ["footnote", "endnote", "tieredNote"]) {
  ok(
    `${action} is in the Insert menu`,
    new RegExp(`noteItem\\(\\s*"${action}"`).test(MAIN),
  );
}
// …and the note on a note is not a *top-level* offer, which is what the margin
// note asked for. It sat third, above the chooser, as though it were one of the
// two things a person opens Insert to do; it is a second note hung off one that
// already exists, so in ordinary prose there is nothing for it to hang off.
{
  const chooser = MAIN.indexOf("onClick: openNotesChooser");
  const tiered = MAIN.search(/noteItem\(\s*"tieredNote"/);
  ok("the note on a note is offered below the chooser, not above it", chooser < tiered);
  // Greyed with its reason where it cannot act, which is this menu's own rule
  // for every other command: an item that silently vanishes when the caret moves
  // is a product that looks broken.
  const item = MAIN.slice(tiered, tiered + 500);
  ok("…and it says why when the caret is not in a note", item.includes("whyNoteOnNoteNeedsANote"));
  ok("…on the evidence of the caret, not of a setting", item.includes("noteDepthAt("));
}

// And the cosmetic alias is no longer advertised anywhere.
ok(
  "the toolbar no longer points ⁑ at הערה_על_הערה",
  !/b\("הערה_על_הערה"/.test(MAIN),
);

// ---------------------------------------------- the two tombstones, retired
//
// `#הערה_על_הערה` and `#הערה_א` are second names for things the writer already
// has — the first is `#הערה_ב`, the second *is* `#הערה` — and under the channel
// model they are not even second mechanisms: a tier is a channel, and both of
// these name a channel that already exists. They still compile, because a
// command that exists in documents cannot simply be deleted, and they are
// offered nowhere.
for (const name of ["הערה_על_הערה", "הערה_א"]) {
  const c = registry().find((x) => x.he === name);
  ok(`${name} is still in the registry`, !!c);
  ok(`…and marked deprecated, which is what keeps it out of the menus`, !!c?.deprecated);
  ok(
    `…and its description says what to use instead`,
    /מיושן|Deprecated/.test((c?.desc_he ?? "") + (c?.desc_en ?? "")),
  );
}

// ------------------------------------------------- channels reach a control
//
// The whole point of the model is that *where* a note prints stops being welded
// to the command that got typed — and a model the engine has and the interface
// cannot say is a model nobody can use. Which is this file's own thesis, applied
// to the thing this file's thesis was written about.
{
  // Asserted against the section table rather than against `main.ts` as text.
  // It was `MAIN.includes('t("styleChannels")')`, and it went red when the
  // section list moved into a module — correctly, because a check that reads a
  // file for a string cannot tell "this section is gone" from "this section is
  // declared somewhere better". `panels.test.mjs` opens with a longer version
  // of this complaint about reading `main.ts` as text.
  ok(
    "the Styles panel has a destinations section",
    STYLE_SECTIONS.some((s) => s.kind === "destinations"),
  );
  ok("…which reads the document's own streams", MAIN.includes("channels.channelsIn("));
  ok("…and writes a declaration back", MAIN.includes("channels.writeDestination("));
  // The payoff, as a control: the knobs that belong to a *place* — its
  // numbering, its size, its columns, its heading — read off the one table that
  // pairs each with the prelude's own argument name, so a knob in the model with
  // no control here is a red test rather than something nobody built.
  // Every knob a destination has, with a label, from the one table. The panel
  // draws a row per entry, so a knob in the model with no control is not
  // expressible — which is stronger than what stood here, a check that `main.ts`
  // *mentioned* the table by name and passed on any mention of it at all.
  ok("…offering every knob a destination has", MAIN.includes("for (const knob of channels.DESTINATION_KNOBS)"));
  for (const knob of DESTINATION_KNOBS) {
    ok(`…and ${knob.key} is labelled in Hebrew`, !!DICTS.he[knob.label], knob.label);
    ok(`…and in English`, !!DICTS.en[knob.label], knob.label);
  }
  // And the writer never meets the word. A channel is the machinery underneath;
  // what is on this surface is a place.
  ok(
    "…without the word 'channel' on the surface",
    !DICTS.he.styleDestinationsNote.includes("ערוץ") && !DICTS.en.styleDestinationsNote.includes("channel"),
    DICTS.en.styleDestinationsNote,
  );
  // A collected channel prints nowhere until its region is shown, which is the
  // "collected and then never rendered" failure every one of the eighteen
  // commands could produce. Offered as a button rather than as a lint after the
  // fact.
  ok("…and a way to print a collected region", MAIN.includes("channels.showRegionLine("));
  // The other half of the same panel, and the half that was missing: a region is
  // a place on the page and not only a stream, and the seventeen knobs that
  // decide how that place behaves had no control at all.
  // The region's own controls are built in `panelviews.ts`, where
  // `panelviews.test.mjs` presses each one and reads back the Typst it writes.
  // What is left for this file is the half only the shell can do: that the panel
  // is reached at all, and reached on the destination that is a place.
  ok("…offering a region its own controls", MAIN.includes("panelviews.regionPanel("));
  ok("…on the destination that is a place", MAIN.includes("rows.push(...regionRows(doc, stylePick.region))"));
  for (const knob of REGION_KNOBS) {
    ok(`…and the region's ${knob.key} is labelled in Hebrew`, !!DICTS.he[knob.label], knob.label);
    ok(`…and in English`, !!DICTS.en[knob.label], knob.label);
  }
}

// Both directions of "where do the note bodies live", which is only *changeable
// after the notes exist* if it is changeable both ways.
{
  const LINT = read("deferred-lint.ts");
  ok("every note can be sent to the end", LINT.includes("export function deferAll("));
  ok("and every note can be brought back", LINT.includes("export function inlineAll("));
  for (const id of ["deferAll", "deferRecallAll", "deferSort"]) {
    ok(`${id} is an action, not only a button in a modal`, MAIN.includes(`id: "${id}"`));
  }
}

// --------------------------------------------------- a list you can make
//
// *"It looks like it is not a list"*, in the margin of a document whose 156
// numbered items are `#הדגשה[45.]` paragraphs. There was no verb: the bullet
// button inserted an **empty** list, and pressed over a selection it wrapped the
// whole selection inside one bullet. A few lines later the same margin records
// that the structure controls were greyed with no reason — correct, because the
// caret was in prose, and useless, because what to do about that is exactly the
// verb that did not exist.
{
  const LISTS = read("lists.ts");
  ok("there is a verb", LISTS.includes("export function makeList("));
  ok("…and it refuses out loud", LISTS.includes("export function canMakeList("));
  // Through `plan`, so the toolbar, the menu, the palette and the keyboard all
  // do it — one producer, which is the rule this file exists to keep.
  ok("the bullet button makes one of a selection", read("insert.ts").includes('kind: "rewrite"'));
  ok("…and the shell performs it", MAIN.includes('plan.kind === "rewrite"'));
  ok("it is an action of its own", MAIN.includes('id: "makeList"'));
  ok("…named in the Format menu", MAIN.includes('t("makeList")'));
  for (const lang of ["he", "en"]) {
    ok(`…and described in ${lang}`, !!DICTS[lang].makeListLede);
  }
  // The prose caret, which is where the margin note was written. A strip that
  // vanishes reads as the product breaking; it says what can be made instead.
  //
  // **And it is off by default**, because read from the other side the same
  // strip is *"an annoying popup that says 'Prose — not structure here to act
  // on'. I don't know why it popped up or what it is."* Two writers, two
  // moments, both right — so the sentence stays available and stops appearing
  // over a paragraph somebody is typing. Both halves are asserted: a strip that
  // was deleted would pass "it is off" just as well as one that is behind a
  // preference, and deleting it would throw away the answer the first note
  // asked for.
  ok("prose says what it is", MAIN.includes('t("inProse")'));
  ok("…only when asked to", MAIN.includes("settings.proseStrip &&"));
  check("…and it is not asked to by default", settings.DEFAULTS.proseStrip, false);
  for (const lang of ["he", "en"]) {
    ok(`…with the switch named in ${lang}`, !!DICTS[lang].proseStripLabel);
    ok(`…and explained in ${lang}`, !!DICTS[lang].proseStripNote);
  }
  // A second paragraph under one number: the third reading of Enter in a list,
  // and the one that had no key at all.
  ok("an item can hold two paragraphs", LISTS.includes("export function paraInItem("));
  ok("…as an operation like the rest", read("structure.ts").includes('id: "list.paraInItem"'));
  ok("…with a key", read("bindings.ts").includes('"list.paraInItem"'));
  // Per level, which Typst has always read and no control could write.
  ok("numbering is per level", read("styles.ts").includes('"numbering-levels"'));
  ok("…and the panel composes the pattern", MAIN.includes("function levelsControl("));
  ok("a list can start at a number of its own", read("styles.ts").includes("התחלה: { kind:"));
}

// --------------------------------------- the three constructs, named and open
//
// Two hide a span from the page and one folds a span that still prints, and the
// only thing a writer needs from the interface is which is which. All three
// shipped for as long as there has been an editor. The line comment had no door
// of any kind — no button, no menu entry, no palette command, no key — and the
// fold's one door was a toolbar button labelled **Region**, which says nothing
// about folding, nothing about printing, and now names something else: `#אזור`,
// a fixed area on the page. The margin note on that button read *"I have no clue
// what region does"*, and the same reader then asked for the fold to be built.
{
  const HIDING = read("hiding.ts");
  ok("one module owns the marks", HIDING.includes("export const FOLD_OPEN"));
  ok("…and nothing else spells them", !read("main.ts").includes('"//{'));
  for (const id of ["hideLine", "hideBlock", "fold"]) {
    ok(`${id} is an action`, MAIN.includes(`id: "${id}"`));
    // A name and a description, in the menu, at the point of use — the lede is
    // where "does this reach the page?" is actually answered.
    ok(`…${id} names itself in the Insert menu`, MAIN.includes(`name: "${id}"`));
    for (const lang of ["he", "en"]) {
      ok(`…and says what it does in ${lang}`, !!DICTS[lang][id + "Lede"], id);
    }
  }
  ok("the toolbar button says fold", MAIN.includes('iconBtn("▤", t("fold")'));
  ok("…and not region", !MAIN.includes('t("region")'));
  // Fold *to a depth*, which is what somebody with a 300-page sefer wants and
  // which this editor could not do: `foldAll` takes everything down at once.
  ok("the outline folds to a level", read("headings.ts").includes("export function sectionsToFold("));
  for (const level of [1, 2, 3]) {
    ok(`foldLevel${level} is an action`, MAIN.includes("id: `foldLevel${level}`"));
  }
  ok("…and reaches the Format menu", MAIN.includes('t("foldLevels")'));
}

// ------------------------------------------------- every action has a key
//
// A binding table with an action missing is an operation with no keyboard, and
// the Settings panel lists what this table holds, so it would be invisible
// there as well.
const BINDINGS = read("bindings.ts");
for (const action of ["footnote", "endnote", "tieredNote"]) {
  ok(`${action} has a shipped binding`, new RegExp(`^\\s{2}${action}:`, "m").test(BINDINGS));
}
// Word's own two, which is the whole reason two other actions moved.
ok("Ctrl+Alt+F reaches the footnote", BINDINGS.includes('footnote: ["Mod-Alt-f"]'));
ok("Ctrl+Alt+D reaches the endnote", BINDINGS.includes('endnote: "Mod-Alt-d"'));
// And nothing else may hold those, or the alias is dropped and the binding lost.
const claimed = [...BINDINGS.matchAll(/^\s{2}([\w.]+):\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]);
const holders = (key) => claimed.filter(([, k]) => k === key).map(([id]) => id);
check("Mod-Alt-f is unclaimed by any other action", holders("Mod-Alt-f").join(","), "");
check("Mod-Alt-d belongs to the endnote alone", holders("Mod-Alt-d").join(","), "endnote");

}

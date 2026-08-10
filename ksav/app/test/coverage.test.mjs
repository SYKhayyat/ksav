import { ok, check } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { commands } from "../tools/commands.mjs";
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
  ok(`${action} is in the Insert menu`, MAIN.includes(`noteItem("${action}"`));
}

// And the cosmetic alias is no longer advertised anywhere.
ok(
  "the toolbar no longer points ⁑ at הערה_על_הערה",
  !/b\("הערה_על_הערה"/.test(MAIN),
);

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

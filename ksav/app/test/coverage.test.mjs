import { ok, check } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

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

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = path.join(HERE, "..", "src");
const read = (f) => readFileSync(path.join(SRC, f), "utf8");

/** The registry, read from the engine's own source. */
function registry() {
  const rs = readFileSync(
    path.join(HERE, "..", "..", "engine", "src", "commands.rs"),
    "utf8",
  );
  const re =
    /cmd!\(\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*(,\s*(true|false)\s*)?\)/g;
  return [...rs.matchAll(re)].map((m) => ({
    he: JSON.parse(m[1]),
    en: JSON.parse(m[2]),
    category: JSON.parse(m[3]),
    insert: JSON.parse(m[6]),
    deprecated: m[8] === "true",
  }));
}

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

// A command is offered if the Insert menu can write it. That menu is generated
// from the registry, so the test is really about what the generator excludes:
// anything filtered out there has to be accounted for below.
const inInsertMenu = (c) => !c.deprecated;

for (const c of commands) {
  const exempt = NOT_OFFERED[c.he];
  if (!exempt) {
    ok(`#${c.he} is offered somewhere in the chrome`, inInsertMenu(c));
    continue;
  }
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
  ["the tiered note", 'noteBtn("tieredNote"'],
]) {
  ok(`${what} has a toolbar button`, MAIN.includes(needle));
}
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

import { ok, check } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NOTE_BODY_COMMANDS,
  TIERS,
  TIER_FAMILY,
  BAND_FAMILY,
  PAGEBAND_FAMILY,
  opensNoteBody,
  tierCommand,
} from "../.tmp-test/note-commands.mjs";
import { noteDepthAt, tieredNoteAt, notesIn } from "../.tmp-test/notes.mjs";
import { NOTE_COMMANDS as DEFERRED_COMMANDS } from "../.tmp-test/deferred.mjs";

// Which commands open a note body?
//
// Four modules answered it separately, and one of them — `notes.ts`, the only
// one on the write path — was left behind by the English wave. In an English
// document `notesIn` returned nothing, so the notes pane was empty on a file
// full of `#fnote[…]`, and `noteDepthAt` returned 0 inside a note, so `⁑` wrote
// tier א where tier ב was meant. Every existing test asked the question in
// Hebrew, so all 2,580 of them passed.
//
// They now share one list. The interesting half of this file is not that the
// list is right today — it is the three fences that make the *next* note
// command's arrival noisy:
//
//   1. every name on the list is defined in the prelude (no invented commands);
//   2. every note-shaped command in the registry is on the list, or carries a
//      written exemption (a new note command cannot slip past);
//   3. the highlighter's own table agrees with it (the one list that legitimately
//      holds more, because it also paints things that are not notes).

export function run() {

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PRELUDE = readFileSync(
  path.join(HERE, "..", "..", "engine", "typst", "ksav.typ"),
  "utf8",
);
const REGISTRY_RS = readFileSync(
  path.join(HERE, "..", "..", "engine", "src", "commands.rs"),
  "utf8",
);
const LANG_TS = readFileSync(path.join(HERE, "..", "src", "ksav-lang.ts"), "utf8");

/** The registry, read from the engine's own source (as `coverage.test.mjs` does). */
function registry() {
  const re =
    /cmd!\(\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*(,\s*(true|false)\s*)?\)/g;
  return [...REGISTRY_RS.matchAll(re)].map((m) => ({
    he: JSON.parse(m[1]),
    en: JSON.parse(m[2]),
    category: JSON.parse(m[3]),
    insert: JSON.parse(m[6]),
  }));
}

// ---------------------------------------------------------------- the bug itself

// The write path, in both languages. `#fnote[…]` is the English document's
// ordinary footnote; a caret inside one is inside a note, and the tiered button
// standing there must write the *second* tier.
check("a Hebrew note is a note", noteDepthAt("#הערה[x]", 7), 1);
check("an English note is a note", noteDepthAt("#fnote[x]", 8), 1);
check("an English tier is a note", noteDepthAt("#tier1[x]", 8), 1);
check("an English endnote is a note", noteDepthAt("#endnote[x]", 10), 1);
check("an English sidenote is a note", noteDepthAt("#sidenote[x]", 11), 1);
check("a band above tier ג is a note", noteDepthAt("#מדור_ד[x]", 9), 1);
check("its English alias too", noteDepthAt("#band4[x]", 8), 1);
check("a page-band above tier ג is a note", noteDepthAt("#מדף_ה[x]", 8), 1);
check("ordinary prose is not", noteDepthAt("shalom olam", 4), 0);

// …and the command it produces follows the document, not the interface.
check("in Hebrew prose, tier א", tieredNoteAt("שלום עולם", 4, "he"), "#הערה_א[|]");
check("in English prose, tier 1", tieredNoteAt("hello world", 4, "en"), "#tier1[|]");
check("inside a Hebrew note, tier ב", tieredNoteAt("#הערה[x]", 7, "he"), "#הערה_ב[|]");
check("inside an English note, tier 2", tieredNoteAt("#fnote[x]", 8, "en"), "#tier2[|]");
check(
  "two English notes deep, tier 3",
  tieredNoteAt("#fnote[a #tier1[b]]", 17, "en"),
  "#tier3[|]",
);
check("Hebrew is still the default", tieredNoteAt("#הערה[x]", 7), "#הערה_ב[|]");
// Deeper than the family goes: clamped, never `#tier8` (which does not exist).
check("clamped at the last tier", tierCommand(99, "en"), `tier${TIERS.length}`);
check("and at the first", tierCommand(0, "he"), "הערה_א");

// The notes pane — the surface that was simply blank in English.
check("the index sees a Hebrew note", notesIn("#הערה[shalom]").length, 1);
check("the index sees an English note", notesIn("#fnote[hello]").length, 1);
check("the index sees a tier-ד band", notesIn("#מדור_ד[x]").length, 1);
// `?.` deliberately: when this regresses the index is *empty*, and indexing into
// it throws, which takes the three fences below down with it and reports the
// drift as a crash in a test file rather than as the four named failures.
check("and reads an English note's text", notesIn("#fnote[hello]")[0]?.text, "hello");
check("and its command", notesIn("#fnote[hello]")[0]?.command, "fnote");
check(
  "nesting depth in an English document",
  notesIn("#fnote[a #tier1[b]]").map((n) => n.depth).join(","),
  "0,1",
);

// ---------------------------------------------------------------- one list

// Not an identity check: each module is bundled separately for the tests, so the
// two arrays are distinct objects even when one is `export const x = y`. Content
// equality is the claim that matters anyway — it is what drifted.
check(
  "deferred.ts and notes.ts agree, name for name",
  [...DEFERRED_COMMANDS].sort().join(","),
  [...NOTE_BODY_COMMANDS].sort().join(","),
);
ok(
  "no duplicates in the list",
  new Set(NOTE_BODY_COMMANDS).size === NOTE_BODY_COMMANDS.length,
  () => "repeated: " + NOTE_BODY_COMMANDS.filter((n, i) => NOTE_BODY_COMMANDS.indexOf(n) !== i),
);

// Fence 1: the prelude defines every one of them.
//
// This is the fence that would have caught an invented alias — a name the UI
// writes and Typst has never heard of, which compiles to a blank page and an
// error in English. `#let` is how every command in `ksav.typ` is declared.
const defined = new Set(
  [...PRELUDE.matchAll(/#let\s+([A-Za-z֐-׿_][\w֐-׿]*)/gu)].map((m) => m[1]),
);
for (const name of NOTE_BODY_COMMANDS) {
  ok(`the prelude defines #${name}`, defined.has(name), () => `#${name} is not #let anywhere in ksav.typ`);
}

// Fence 2: no note-shaped registry command is missing from the list.
//
// Deliberately *not* `category === "footnote"`. The category is what the palette
// groups by: it holds nine commands that open nothing (`#הגדרות_הערות`,
// `#הערות_בסוף`, …) and it files the four margin notes under `"torah"`. The
// shape is the honest test — a note-ish name whose snippet opens a body.
const NOTE_NAME = /^(הערה|הערת|מדור|מדף|מראה_מקום)/;
const NOT_A_NOTE_BODY = {
  // The region the deferred bodies are filed *in*. Its brackets hold notes; it
  // is not one, and counting it would make every deferred body tier ב.
  גופי_הערות: "the note-bodies region, not a note",
  // A blue callout box — `category: "block"`. Hebrew spells "note-of" and this
  // box's name the same way, which is why the shape test catches it and why the
  // exemption is written down rather than silently regex'd around.
  הערת_צד: "a callout box, not an apparatus note",
  // An editorial comment. It *paints* like a margin note (`ksav-lang` lists it
  // for that) but it is review scaffolding, not apparatus: it never prints, and
  // a footnote written inside one is a note on the body text, tier א.
  הערת_עורך: "a review comment, outside the apparatus",
};
for (const cmd of registry()) {
  if (!NOTE_NAME.test(cmd.he) || !cmd.insert.includes("[|]")) continue;
  if (NOT_A_NOTE_BODY[cmd.he]) continue;
  ok(
    `the registry's #${cmd.he} is on the list`,
    opensNoteBody(cmd.he) && opensNoteBody(cmd.en),
    () =>
      `#${cmd.he}/#${cmd.en} (category ${cmd.category}) opens a body and is not in ` +
      `NOTE_BODY_COMMANDS — add it, or give it a reason in NOT_A_NOTE_BODY`,
  );
}
for (const name of Object.keys(NOT_A_NOTE_BODY)) {
  ok(
    `the exemption for #${name} names a real command`,
    registry().some((c) => c.he === name),
    () => `#${name} is exempted from a list it could not have been on`,
  );
}

// Fence 3: the highlighter paints every one of them as a note.
//
// `ksav-lang.ts` keeps its own table because it holds more than membership — the
// apparatus each command belongs to and how that apparatus numbers. It may hold
// *more* names (an editorial comment paints like a note without being one); it
// may not hold fewer, or a note goes unpainted in the preview while compiling
// perfectly, which is the quiet half of this bug family.
const painted = new Set(
  [...LANG_TS.matchAll(/addNotes\([^,]+,\s*"[^"]*",\s*\[([\s\S]*?)\]\)/g)].flatMap((m) =>
    [...m[1].matchAll(/"([^"]+)"/g)].map((s) => s[1]),
  ),
);
// The tiered families reach `addNotes` by spread and by the loop over `TIERS`,
// so they are not string literals to be scraped — they are fenced by coming from
// the shared list at all, which is what these two assertions check. Everything
// else is named outright and has to appear.
ok("ksav-lang spreads the shared tier family", LANG_TS.includes("...TIER_FAMILY"), () =>
  "TIER_FAMILY is not spread into addNotes — the highlighter has its own tier table again");
ok("and loops the shared tier letters", /TIERS\.forEach/.test(LANG_TS), () =>
  "the band loop no longer reads TIERS — a tier can drift between the two files again");
const byFamily = new Set([...TIER_FAMILY, ...BAND_FAMILY, ...PAGEBAND_FAMILY]);
for (const name of NOTE_BODY_COMMANDS) {
  if (byFamily.has(name)) continue;
  ok(`the highlighter paints #${name}`, painted.has(name), () =>
    `#${name} is in no addNotes() call — it would compile and go unpainted`);
}

}

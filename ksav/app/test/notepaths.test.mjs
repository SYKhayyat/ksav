import { ok, check } from "./harness.mjs";
import { dirOf } from "../tools/paths.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NOTE_BODY_COMMANDS } from "../.tmp-test/note-commands.mjs";
import {
  NOTE_CHOICES,
  applyChoice,
  noteFor,
  notesIn,
  noteAt,
  convertNote,
  deleteNote,
  tieredNoteAt,
  choiceAt,
  whyNot,
  BLOCKED,
  NOTE_WHERE,
  NOTE_HOW,
} from "../.tmp-test/notes.mjs";

// One way in.
//
// `settings.deferNoteBodies` — "write my note bodies at the end of the file" —
// was persisted correctly and read by exactly one caller out of four. The
// toolbar `†`, `Ctrl+Shift+F` and the command palette each spliced `#הערה[|]`
// into the buffer and never went near it, so a writer who had set the
// preference got it only when they went through the modal. Which is precisely
// the complaint that produced it: *"I have to go into the menu to pick an
// org-mode one each time."*
//
// The fix is not to wire the other three. It is that there is one producer of
// note markup and every surface reaches it by inserting the ordinary snippet —
// `noteFor` recognises a raw registry snippet as a layout's marker, so
// `insertSnippet` routes it without any caller knowing notes are special. This
// file holds that property, from both ends: the recogniser knows every marker,
// and `main.ts` has no second way to write one.

const HERE = dirOf(import.meta.url);
const MAIN = readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");

export async function run() {

// ------------------------------------------------- every marker is recognised

for (const c of NOTE_CHOICES) {
  const primary = noteFor(c.insert);
  ok(`${c.id}: its own marker is recognised as a note`, !!primary);
  check(`${c.id}: and resolves to a layout`, !!primary?.choice, true);
  if (c.insert2) {
    ok(`${c.id}: the second layer's marker is recognised too`, !!noteFor(c.insert2));
  }
}

// A command that is not a note must not be swallowed by the note path.
for (const notNote of ["#הדגשה[|]", "#רשימה(\n  פריט[|],\n)", "#תוכן()", "#טבלה(עמודות: 2)"]) {
  check(`${notNote} is not routed as a note`, noteFor(notNote), null);
}

// ------------------------------------------------- the four surfaces agree

// The exact strings the four surfaces put into `insertSnippet`: the toolbar's
// registry entry, the keyboard action, the palette row, and the chooser's own
// card. All four are the same string, and this is the assertion that they stay
// so — the moment one of them writes its own variant, it stops being routed.
const SURFACES = {
  "toolbar †": "#הערה[|]",
  "Ctrl+Shift+F": "#הערה[|]",
  "palette הערה": "#הערה[|]",
  "Insert ▸ endnote": "#הערתסיום[|]",
  "toolbar ⁋": "#הערתסיום[|]",
};

const DOC = "פתיחה של פסקה, ואחריה עוד מלים.";
const AT = 12;

for (const deferred of [false, true]) {
  const produced = new Map();
  for (const [surface, snippet] of Object.entries(SURFACES)) {
    const found = noteFor(snippet);
    ok(`${surface}: goes through the note path`, !!found);
    if (!found) continue;
    const r = applyChoice(DOC, AT, found.choice, found.which, deferred, { marker: found.marker });
    const key = snippet;
    if (produced.has(key)) {
      check(
        `${surface}: byte-identical to the other surface writing ${key} (deferred=${deferred})`,
        r.text,
        produced.get(key),
      );
    } else {
      produced.set(key, r.text);
    }
  }
  // And the preference is actually honoured on that one path, or none of the
  // above means anything.
  const foot = noteFor("#הערה[|]");
  const r = applyChoice(DOC, AT, foot.choice, foot.which, deferred, { marker: foot.marker });
  if (deferred) {
    ok("deferred: the marker is a name and the body is filed at the end", r.text.includes("#הערה_בשם"));
    ok("deferred: a body region exists", r.text.includes("גוף_הערה"));
  } else {
    ok("inline: the prose is written at the caret", r.text.includes("#הערה[]"));
  }
}

// ------------------------------------------------- and no second way in

// `main.ts` may not splice a note marker directly. Every occurrence has to be
// an argument to `insertSnippet`, which routes it. A `view.dispatch` that
// inserts `#הערה[` is the bug this file exists to prevent, and it would be
// invisible to every other test in the suite.
//
// Derived, not listed. It was six Hebrew literals — and the hole was exactly
// the shape of what was not being fixed the day it was written: **no English
// spellings**, so `#fnote[` and `#endnote[` could be spliced directly and this
// file would say nothing; **no side, stream or margin command**; and not
// `#מראה_מקום`, which is the most sefer-specific note in the product and was in
// fact the one being spliced raw by the Mekoros panel.
//
// `NOTE_BODY_COMMANDS` is the list every module on the note path already reads,
// in both languages, and `notecommands.test.mjs` fences *it* against the prelude
// and the registry from both ends. Deriving from it means a new note command
// arrives here for free, which is the only version of this check that is still
// true a year from now.
const MARKERS = [...NOTE_BODY_COMMANDS].map((c) => `#${c}[`);
for (const marker of MARKERS) {
  for (let at = MAIN.indexOf(marker); at >= 0; at = MAIN.indexOf(marker, at + 1)) {
    const line = MAIN.slice(MAIN.lastIndexOf("\n", at) + 1, MAIN.indexOf("\n", at));
    ok(
      `main.ts writes ${marker} only through insertSnippet — ${line.trim().slice(0, 70)}`,
      // `noteBtn` and `noteItem` are the toolbar's and the menu's two-line
      // wrappers, and both hand the snippet straight to `insertSnippet` — they
      // exist so the button can also print its shortcut, not to write markup.
      /insertSnippet|noteBtn\(|noteItem\(/.test(line) ||
        line.trim().startsWith("//") ||
        line.trim().startsWith("*"),
    );
  }
}

// The selection survives the routing. A toolbar button pressed with text
// selected has wrapped that text since the first version of the product, and
// funnelling the toolbar through the chooser's producer is exactly the kind of
// refactor that drops it silently.
{
  const found = noteFor("#הערה[|]");
  const r = applyChoice("אבג דהו", 4, found.choice, found.which, false, {
    to: 7,
    text: "דהו",
    marker: found.marker,
  });
  check("a selection is wrapped, not discarded", r.text, "אבג #הערה[דהו]");
}

// ------------------------------------------------- the tier reads the caret

// Tier א is `#הערה` — the prelude makes them one function, so in prose the
// tiered button writes the note anybody would have written, and tier ב hangs off
// *that* with no conversion in between.
check("in prose, the tiered note is the ordinary note", tieredNoteAt("שלום עולם", 4), "#הערה[|]");
{
  const doc = "טקסט#הערה[בתוך ההערה] סוף";
  const inside = doc.indexOf("בתוך") + 2;
  check("inside a note, it is tier ב", tieredNoteAt(doc, inside), "#הערה_ב[|]");
  const outside = doc.length - 1;
  check("outside it again, the ordinary note", tieredNoteAt(doc, outside), "#הערה[|]");
}
{
  const doc = "א#הערה[ב#הערה_ב[ג]]";
  check("two notes deep, it is tier ג", tieredNoteAt(doc, doc.indexOf("ג")), "#הערה_ג[|]");
}
ok("a deep tier is still recognised as the tiered layout", noteFor("#הערה_ג[|]")?.choice.id === "nested");

// ------------------------------------------------- the grid is complete

const reachable = new Set();
for (const where of NOTE_WHERE) {
  for (const how of NOTE_HOW) {
    const c = choiceAt(where, how);
    // An arrangement may fill more than one cell — the stacked bands are the
    // same apparatus at a section end and at the document end — so this counts
    // arrangements reached, not cells filled.
    if (c) reachable.add(c.id);
    else ok(`the empty cell ${where}/${how} says why`, whyNot(where, how).length > 0);
  }
}
check("every arrangement is reachable from the grid", reachable.size, NOTE_CHOICES.length);
// No two arrangements may claim one cell, or picking it would be ambiguous.
const seen = new Set();
for (const c of NOTE_CHOICES) {
  for (const w of c.where) {
    const key = `${w}/${c.how}`;
    ok(`${c.id}: ${key} is not already taken`, !seen.has(key));
    seen.add(key);
  }
}

// ------------------------------------------------- the notes index

{
  const doc = "פתיחה#הערה[ראשונה #הדגשה[מודגש] סוף] אמצע#הערתסיום[שניה] סיום.";
  const found = notesIn(doc);
  check("two notes found", found.length, 2);
  check("the first is a footnote", found[0].command, "הערה");
  check("its body survives inner brackets", found[0].text, "ראשונה #הדגשה[מודגש] סוף");
  check("the second is an endnote", found[1].command, "הערתסיום");
  check("both are at depth 0", found.map((n) => n.depth).join(","), "0,0");
}
{
  const doc = "א#הערה[ב#הערה_ב[ג]]";
  const found = notesIn(doc);
  check("a nested note is found too", found.length, 2);
  check("and knows it is nested", found[1].depth, 1);
  check("the outer body spans the inner note", found[0].text, "ב#הערה_ב[ג]");
}
{
  // A bracket inside a string inside an argument list opens nothing.
  const doc = 'א#הערה[ב #תמונה("צד[ימין") ג]';
  const found = notesIn(doc);
  check("a bracket in a string does not end the note", found.length, 1);
  ok("and the whole body is captured", found[0].text.endsWith(" ג"));
}
{
  const doc = "א#הערה[חצי";
  const found = notesIn(doc);
  check("a half-typed note is still listed", found.length, 1);
  check("reported as far as it got", found[0].text, "חצי");
}
{
  const doc = "א#הערה[גוף] ב";
  const n = noteAt(doc, doc.indexOf("גוף"));
  ok("noteAt finds the note under the caret", !!n);
  check("convert rewrites the command and keeps the text", convertNote(doc, n, "הערתסיום").text, "א#הערתסיום[גוף] ב");
  check("delete takes the marker with it", deleteNote(doc, n).text, "א ב");
  check("noteAt is null in plain prose", noteAt("שלום עולם", 3), null);
}


  everyGridCellIsAnswered();
}

// Every cell of the where x how grid is either a card or a stated refusal.
//
// The greying used to be a five-`if` fallthrough over axis values, which always
// has an answer and therefore never fails -- so two cells were greyed with
// reasons that were false against the shipped engine and nothing could notice.
// A table can be incomplete, and this is what makes an incomplete one a red
// test rather than a plausible sentence in the UI.
function everyGridCellIsAnswered() {
  const unexplained = [];
  const doubled = [];
  for (const where of NOTE_WHERE) {
    for (const how of NOTE_HOW) {
      const filled = !!choiceAt(where, how);
      const blocked = BLOCKED.find((b) => b.where === where && b.how === how);
      if (!filled && !blocked) unexplained.push(`${where} x ${how}`);
      if (filled && blocked) doubled.push(`${where} x ${how}`);
    }
  }
  check("every empty cell says why it is empty", unexplained, []);
  check("and no cell is both offered and refused", doubled, []);
  // The two the report caught, by name, so a regression is legible rather than
  // a count going down by one.
  ok("a second stream at the back is offered", !!choiceAt("document", "parallel"));
  ok("section-end split is offered", !!choiceAt("section", "split"));
  // Each refusal names a string both languages have. A greyed cell whose reason
  // renders as `whyFixedNeedsPage` is worse than one with no reason at all.
  for (const b of BLOCKED) {
    ok(`${b.where} x ${b.how} has a reason in Hebrew`, !!DICTS.he[b.why], b.why);
    ok(`${b.where} x ${b.how} has a reason in English`, !!DICTS.en[b.why], b.why);
  }
}

import { check, notOk, ok } from "./harness.mjs";
import { dirOf } from "../tools/paths.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DICTS } from "../.tmp-test/i18n.mjs";
import { VOCABULARY } from "../.tmp-test/engine.gen.mjs";
import { NOTE_BODY_COMMANDS } from "../.tmp-test/note-commands.mjs";
import {
  DEFAULT_CHANNEL,
  DESTINATIONS,
  DESTINATION_IDS,
  PLACEMENTS,
  PRESETS,
  REGION_KNOBS,
  TIER_CHANNELS,
  blockedFor,
  caveatsFor,
  channelLine,
  channelsIn,
  englishValue,
  footRivals,
  noteCounts,
  noteLine,
  presetLines,
  regionLine,
  regionSettingsOf,
  regionsIn,
  setDeclaredArgs,
  samePick,
  settingsOf,
  showRegionLine,
  usedChannels,
  writeChannel,
  writeDestination,
  writeRegion,
} from "../.tmp-test/channels.mjs";
import {
  applyPick,
  deleteNote,
  noteAt,
  noteDestination,
  noteFor,
  notesIn,
  retargetNote,
  tieredNoteAt,
} from "../.tmp-test/notes.mjs";

const HERE = dirOf(import.meta.url);
const MAIN = readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");

// The editor's half of the channel model.
//
// The engine's half is `engine/tests/channels.rs`, which renders documents and
// asserts where the notes landed. This one asks the question the editor actually
// has to answer — *what channels does this document have, and what does each one
// do* — off the source, in both languages, without compiling anything.
//
// The pair matters more than either half: a panel that reads a channel one way
// and an engine that places it another is the failure family this repository
// keeps rebuilding, and `kindsAgree` below is the crossing point.

const channel = (doc, name) => channelsIn(doc).find((c) => c.name === name);

export async function run() {
  // ---------------------------------------------------------- the built-ins

  {
    const cs = channelsIn("טקסט");
    check(
      "channels: an empty document already has the seven tiers",
      cs.slice(0, TIER_CHANNELS.length).map((c) => c.name).join(","),
      TIER_CHANNELS.join(","),
    );
    check("channels: the default channel is native", channel("טקסט", DEFAULT_CHANNEL).kind, "native");
    check("channels: the default channel has no source", channel("טקסט", DEFAULT_CHANNEL).source, null);
    check("channels: tier two hangs off it", channel("טקסט", "הערה_ב").source, DEFAULT_CHANNEL);
    check("channels: and is native too", channel("טקסט", "הערה_ב").kind, "native");
  }

  // ------------------------------------------------------------ declarations

  {
    const doc = '#ערוץ("ביאור", מקור: "הערה", מיקום: "רגל")\nטקסט#הערה(ערוץ: "ביאור")[גוף]';
    const c = channel(doc, "ביאור");
    check("channels: a declared source is read", c.source, "הערה");
    check("channels: a declared placement is read", c.placement, "רגל");
    check(
      "channels: a channel on the default one, at the foot, is a tier of the native apparatus",
      c.kind,
      "native",
    );
    ok("channels: the declaration's position is reported", c.at && c.at.from === 0);
  }

  {
    // A *second* root channel at the page foot cannot join Typst's one balanced
    // series, so it is a fixed region there — which is what costs a reserve.
    const doc = '#ערוץ("מקורות", מיקום: "רגל")\nטקסט#הערה(ערוץ: "מקורות")[גוף]';
    check("channels: a second root at the foot is a region", channel(doc, "מקורות").kind, "foot");
    check("channels: and its own region is named after it", channel(doc, "מקורות").region, "מקורות");
  }

  {
    const doc = '#ערוץ("ביאור", מיקום: "סוף")\nטקסט#הערה(ערוץ: "ביאור")[גוף]';
    check("channels: a channel at the back is collected", channel(doc, "ביאור").kind, "collected");
  }

  {
    // A channel takes its region's placement. Asking the channel *and* the
    // region where the notes go is asking the same question twice and letting
    // the two answers disagree.
    const doc =
      '#אזור("פירושים", מיקום: "סוף")\n#ערוץ("ביאור", אזור: "פירושים")\nא#הערה(ערוץ: "ביאור")[גוף]';
    check("channels: a channel inherits its region's placement", channel(doc, "ביאור").placement, "סוף");
    check("channels: and is collected with it", channel(doc, "ביאור").kind, "collected");
    check("channels: the region is the one it was pointed at", channel(doc, "ביאור").region, "פירושים");
    check("channels: the region is listed", regionsIn(doc).map((r) => r.name).join(","), "פירושים");
  }

  {
    // A height with no region is the shortcut: one command makes both.
    const doc = '#ערוץ("ביאור", גובה: 3cm)\nא#הערה(ערוץ: "ביאור")[גוף]';
    check("channels: a declared height is read as written", channel(doc, "ביאור").height, "3cm");
    check("channels: and it is a page-foot region", channel(doc, "ביאור").kind, "foot");
  }

  {
    // The whole point of the model: this document is one word away from the
    // previous one and the apparatus is at the other end of the sefer.
    const notes = 'טקסט#הערה(ערוץ: "ביאור")[גוף]';
    const foot = `#ערוץ("ביאור", מיקום: "רגל")\n${notes}`;
    const back = `#ערוץ("ביאור", מיקום: "סוף")\n${notes}`;
    check("channels: placement is the only difference", channel(foot, "ביאור").kind, "foot");
    check("channels: …and it moves the apparatus", channel(back, "ביאור").kind, "collected");
    ok(
      "channels: not one note changed",
      foot.slice(foot.indexOf("טקסט")) === back.slice(back.indexOf("טקסט")),
    );
  }

  // -------------------------------------------------------------- both languages

  {
    const doc = '#channel("peirush", placement: "foot", height: 3cm)\ntext#fnote(channel: "peirush")[body]';
    const c = channel(doc, "peirush");
    check("channels: an English declaration is read", c.placement, "רגל");
    check("channels: including its height", c.height, "3cm");
    check("channels: and its kind", c.kind, "foot");
    check("channels: an English note names its channel", usedChannels(doc).join(","), "peirush");
  }

  {
    // An English command with a Hebrew value, which is the defect `_en_values`
    // exists to end — accepted, because that is what the prelude does.
    const doc = '#channel("peirush", placement: "רגל")\ntext#fnote(channel: "peirush")[body]';
    check("channels: a Hebrew value on an English command still reads", channel(doc, "peirush").placement, "רגל");
  }

  // ------------------------------------------------------------------ counting

  {
    const doc =
      'א#הערה[אחת] ב#הערה[שתיים] ג#הערה(ערוץ: "מקורות")[שלוש] ד#הערה_ב[ארבע]';
    const n = noteCounts(doc);
    check("channels: the default channel's notes are counted", n.get(DEFAULT_CHANNEL), 2);
    check("channels: a named channel's are its own", n.get("מקורות"), 1);
    check("channels: a tier command counts as its channel", n.get("הערה_ב"), 1);
  }

  {
    // A deferred marker takes the same argument, and a sefer whose notes
    // outweigh its text is written that way.
    const doc = 'א#הערה_בשם("1", ערוץ: "ביאור")\n#גוף_הערה("1")[גוף]';
    check("channels: a deferred marker names its channel", usedChannels(doc).join(","), "ביאור");
  }

  {
    // Off the one scanner: a channel named inside a comment is not a channel.
    const doc = '// #ערוץ("ביאור", מיקום: "סוף")\nטקסט';
    ok(
      "channels: a commented-out declaration declares nothing",
      !channelsIn(doc).some((c) => c.name === "ביאור"),
    );
  }

  // ------------------------------------------------------------------- writing

  {
    check(
      "channels: a declaration line, in Hebrew",
      channelLine("ביאור", { placement: "סוף" }),
      '#ערוץ("ביאור", מיקום: "סוף")',
    );
    check(
      "channels: …and in English, values included",
      channelLine("peirush", { placement: "סוף", height: "3cm" }, "en"),
      '#channel("peirush", placement: "document", height: 3cm)',
    );
    check(
      "channels: a region line",
      regionLine("פירושים", { placement: "רגל", height: "10%", layout: "צד" }),
      '#אזור("פירושים", מיקום: "רגל", גובה: 10%, פריסה: "צד")',
    );
    check(
      "channels: a region line in English",
      regionLine("peirushim", { placement: "רגל", layout: "צד" }, "en"),
      '#region("peirushim", placement: "foot", layout: "side")',
    );
    check("channels: the dump call", showRegionLine("פירושים"), '#הצג_אזור("פירושים")');
    check("channels: the dump call in English", showRegionLine("peirushim", "en"), '#show_region("peirushim")');
    check("channels: a note in the default channel is a plain note", noteLine(null), "#הערה[|]");
    check("channels: a note in a named channel names it", noteLine("ביאור"), '#הערה(ערוץ: "ביאור")[|]');
    check("channels: …in English", noteLine("peirush", "en"), '#fnote(channel: "peirush")[|]');
  }

  {
    const doc = 'טקסט#הערה(ערוץ: "ביאור")[גוף]';
    const added = writeChannel(doc, "ביאור", { placement: "סוף" });
    ok("channels: a new declaration goes to the top of the file", added.text.startsWith("#ערוץ("));
    check("channels: and the document is otherwise untouched", added.text.split("\n")[1], doc);
  }

  {
    // A field left alone keeps what the document said; the defect this guards
    // is a panel that writes one knob and wipes the three beside it.
    const doc = '#ערוץ("ביאור", מקור: "הערה", גובה: 2cm)\nטקסט';
    const moved = writeChannel(doc, "ביאור", { placement: "סוף" });
    ok("channels: rewriting a declaration keeps the source", moved.text.includes('מקור: "הערה"'));
    ok("channels: …and the height", moved.text.includes("גובה: 2cm"));
    ok("channels: …and applies the change", moved.text.includes('מיקום: "סוף"'));
    check("channels: exactly one declaration remains", moved.text.split("#ערוץ(").length - 1, 1);
  }

  {
    // …and `null` is a different instruction from "leave it alone".
    const doc = '#ערוץ("ביאור", מקור: "הערה")\nטקסט';
    const cleared = writeChannel(doc, "ביאור", { source: null });
    ok("channels: null clears a field", !cleared.text.includes("מקור"));
  }

  {
    const doc = '#channel("peirush", placement: "foot")\ntext';
    const moved = writeChannel(doc, "peirush", { placement: "סוף" }, "en");
    ok(
      "channels: an English document stays English when a control edits it",
      moved.text.includes('#channel("peirush", placement: "document")'),
    );
  }

  // ------------------------------------------------------------------ the axes

  // The whole axis: the foot of the page, a band above it, four edges beside it,
  // the end of the section, the end of the sefer, and a companion volume. The
  // count is asserted rather than "more than one" because what this line is
  // really about is that they are **values on one axis** and not commands — the
  // number growing is the axis widening, which is the point, and a number that
  // could drift silently would stop saying so.
  ok("channels: one axis of placements, not eighteen commands", PLACEMENTS.length === 10);
  ok(
    "channels: every placement round-trips through a written line",
    PLACEMENTS.every((p) => {
      const doc = channelLine("x", { placement: p }) + "\nא#הערה(ערוץ: \"x\")[גוף]";
      return channel(doc, "x").placement === p;
    }),
  );
  ok(
    "channels: …in English too",
    PLACEMENTS.every((p) => {
      const doc = channelLine("x", { placement: p }, "en") + "\na#fnote(channel: \"x\")[body]";
      return channel(doc, "x").placement === p;
    }),
  );

  // ==========================================================================
  //  Destinations — the one pick, and everything `notepaths.test.mjs` held
  // ==========================================================================
  //
  // `app/test/notepaths.test.mjs` was the `where` x `how` grid's fence: it
  // imported `NOTE_CHOICES`, `choiceAt`, `whyNot`, `BLOCKED`, `NOTE_WHERE` and
  // `NOTE_HOW`, and it asserted that thirty cells were each either a card or a
  // stated refusal. **Deleting it was the acceptance criterion for replacing the
  // grid** — if `NOTE_CHOICES` is still imported anywhere, the cell grid is still
  // alive — and everything it actually held is below, re-asked against the model
  // that replaced it.
  //
  // Three properties came across unchanged, because they were never about the
  // grid: there is **one producer** of note markup and every surface reaches it,
  // a refusal **says why** in both languages, and `main.ts` has **no second way
  // in**. The fourth — "every cell is filled or explained" — became "every
  // destination is reachable and every caveat is a sentence", which is the same
  // property over an axis instead of a cross product.

  // ------------------------------------------------- one producer, one path in

  // `settings.deferNoteBodies` was persisted correctly and read by exactly one
  // caller out of four. The toolbar `†`, `Ctrl+Shift+F` and the command palette
  // each spliced `#הערה[|]` into the buffer and never went near it, so a writer
  // who had set the preference got it only through the modal — which is exactly
  // the complaint that produced it: *"I have to go into the menu to pick an
  // org-mode one each time."*
  //
  // The fix is not to wire the other three. It is that there is one producer and
  // every surface reaches it by inserting the ordinary snippet, so `noteFor` has
  // to recognise every note command there is.
  {
    const unrouted = [];
    for (const command of NOTE_BODY_COMMANDS) {
      if (!noteFor(`#${command}[|]`)) unrouted.push(command);
    }
    check("notes: every note command is routed through the note path", unrouted, []);
  }

  // A command that is not a note must not be swallowed by it.
  for (const notNote of ["#הדגשה[|]", "#רשימה(\n  פריט[|],\n)", "#תוכן()", "#טבלה(עמודות: 2)"]) {
    check(`notes: ${notNote} is not routed as a note`, noteFor(notNote), null);
  }

  // The exact strings the surfaces put into `insertSnippet`: the toolbar's
  // registry entry, the keyboard action, the palette row. The same snippet
  // through any of them writes the same bytes, and this is the assertion that it
  // stays so — the moment one of them writes its own variant, it stops being
  // routed.
  {
    const DOC = "פתיחה של פסקה, ואחריה עוד מלים.";
    const AT = 12;
    const SURFACES = {
      "toolbar †": "#הערה[|]",
      "Ctrl+Shift+F": "#הערה[|]",
      "palette הערה": "#הערה[|]",
      "Insert ▸ endnote": "#הערתסיום[|]",
      "toolbar ⁋": "#הערתסיום[|]",
    };
    for (const home of ["inline", "file"]) {
      const produced = new Map();
      for (const [surface, snippet] of Object.entries(SURFACES)) {
        const found = noteFor(snippet);
        ok(`notes: ${surface} goes through the note path`, !!found);
        if (!found) continue;
        const r = applyPick(DOC, AT, found.pick, home !== "inline", { marker: found.marker });
        if (produced.has(snippet)) {
          check(
            `notes: ${surface} is byte-identical to the other surface writing ${snippet} (${home})`,
            r.text,
            produced.get(snippet),
          );
        } else {
          produced.set(snippet, r.text);
        }
      }
      // And the preference is actually honoured on that one path, or none of the
      // above means anything.
      const foot = noteFor("#הערה[|]");
      const r = applyPick(DOC, AT, foot.pick, home !== "inline", { marker: foot.marker });
      if (home === "inline") {
        ok("notes: inline, the prose is written at the caret", r.text.includes("#הערה[]"));
      } else {
        ok("notes: deferred, the marker is a name", r.text.includes("#הערה_בשם"));
        ok("notes: deferred, the body is filed at the end", r.text.includes("גוף_הערה"));
      }
    }
  }

  // The selection survives the routing. A toolbar button pressed with text
  // selected has wrapped that text since the first version of the product, and
  // funnelling the toolbar through one producer is exactly the kind of refactor
  // that drops it silently.
  {
    const found = noteFor("#הערה[|]");
    const r = applyPick("אבג דהו", 4, found.pick, false, {
      to: 7,
      text: "דהו",
      marker: found.marker,
    });
    check("notes: a selection is wrapped, not discarded", r.text, "אבג #הערה[דהו]");
  }

  // ------------------------------------------------- and no second way in

  // `main.ts` may not splice a note marker directly. Every occurrence has to be
  // an argument to `insertSnippet`, which routes it. A `view.dispatch` that
  // inserts `#הערה[` is the bug this exists to prevent, and it would be invisible
  // to every other test in the suite.
  //
  // Derived, not listed. It was six Hebrew literals — and the hole was exactly
  // the shape of what was not being fixed the day it was written: **no English
  // spellings**, so `#fnote[` and `#endnote[` could be spliced directly and this
  // would say nothing; **no side, stream or margin command**; and not
  // `#מראה_מקום`, which is the most sefer-specific note in the product and was in
  // fact the one being spliced raw by the Mekoros panel.
  {
    for (const command of NOTE_BODY_COMMANDS) {
      const marker = `#${command}[`;
      for (let at = MAIN.indexOf(marker); at >= 0; at = MAIN.indexOf(marker, at + 1)) {
        const line = MAIN.slice(MAIN.lastIndexOf("\n", at) + 1, MAIN.indexOf("\n", at));
        ok(
          `notes: main.ts writes ${marker} only through insertSnippet — ${line.trim().slice(0, 70)}`,
          // `noteBtn` and `noteItem` are the toolbar's and the menu's two-line
          // wrappers, and both hand the snippet straight to `insertSnippet` —
          // they exist so the button can also print its shortcut, not to write
          // markup.
          /insertSnippet|noteBtn\(|noteItem\(/.test(line) ||
            line.trim().startsWith("//") ||
            line.trim().startsWith("*"),
        );
      }
    }
  }

  // ------------------------------------------------- the tier reads the caret

  // A sub-note's parent is whatever note the caret is inside — determined, never
  // chosen. Tier א is `#הערה`: the prelude makes them one function, so in prose
  // the tiered button writes the note anybody would have written, and tier ב
  // hangs off *that* with no conversion in between.
  check("notes: in prose, the tiered note is the ordinary note", tieredNoteAt("שלום עולם", 4), "#הערה[|]");
  {
    const doc = "טקסט#הערה[בתוך ההערה] סוף";
    const inside = doc.indexOf("בתוך") + 2;
    check("notes: inside a note, it is tier ב", tieredNoteAt(doc, inside), "#הערה_ב[|]");
    check("notes: outside it again, the ordinary note", tieredNoteAt(doc, doc.length - 1), "#הערה[|]");
  }
  {
    const doc = "א#הערה[ב#הערה_ב[ג]]";
    check("notes: two notes deep, it is tier ג", tieredNoteAt(doc, doc.indexOf("ג")), "#הערה_ג[|]");
  }
  check("notes: a deep tier is still a note at the page foot", noteFor("#הערה_ג[|]")?.pick.dest, "foot");

  // ------------------------------------------------- every destination is real

  // The grid's own completeness check, over one axis instead of thirty cells:
  // every destination the chooser offers writes markup, and that markup reads
  // back as the destination it was written for. A destination that could be
  // picked and not written is the "dead control" this replaced eleven cards to
  // be rid of.
  {
    const doc = "פתיחה של פסקה, ואחריה עוד מלים.\n";
    for (const d of DESTINATIONS) {
      const pick = { dest: d.id, region: d.id === "region" ? "שער_הציון" : null };
      const r = applyPick(doc, 6, pick, false);
      ok(`notes: ${d.id} writes something`, r.text.length > doc.length, r.text);
      const written = notesIn(r.text);
      check(`notes: ${d.id} writes exactly one note`, written.length, 1);
      check(`notes: ${d.id} reads back as itself`, noteDestination(r.text, written[0]).dest, d.id);
      // And a sketch, because a pick has to show what it builds. This is the one
      // thing the eleven cards got right and it is the reason the table carries
      // a diagram at all.
      ok(`notes: ${d.id} has a page sketch`, d.sketch.length >= 3, d.sketch.join("|"));
    }
  }

  // Four singular destinations and a named list — the shape the plan asks for,
  // asserted rather than assumed. A sixth singular destination would be a cell
  // arriving by the back door.
  check(
    "notes: exactly one destination is a named list",
    DESTINATIONS.filter((d) => d.channel === null).map((d) => d.id),
    ["region"],
  );

  // ------------------------------------------------- a refusal says why

  // **Impossible combinations say why, they do not merely grey out.** The one
  // genuinely good half of the grid, carried forward with its shape intact: a
  // *table* of reasons, never a fallthrough chain. A chain always has an answer,
  // so it can never be incomplete, so nothing can notice that two of its answers
  // were false against the shipped engine — which is what happened, twice.
  {
    // The plan's own example, and the reason it is a sentence rather than a
    // greyed cell: *"two balanced apparatuses at the live page foot — Typst has
    // one, so the second becomes a box."*
    const clean = "טקסט#הערה[גוף]";
    check(
      "notes: one apparatus at the foot costs nothing",
      caveatsFor(clean, { dest: "foot", region: null }),
      [],
    );
    const busy = '#ערוץ("מקורות", מיקום: "רגל")\nטקסט#הערה(ערוץ: "מקורות")[גוף]';
    const why = caveatsFor(busy, { dest: "foot", region: null });
    check("notes: a second one at the foot says what it costs", why.length, 1);
    check("notes: …by name", why[0]?.why, "whySecondFootIsABox");
    notOk("notes: …and is still allowed", why[0]?.blocks ?? false);
    ok("notes: the rival is named", footRivals(busy).some((c) => c.name === "מקורות"));
  }
  {
    // A region with no name is a half-answered question, not a destination — the
    // one refusal in the model that actually blocks.
    const why = caveatsFor("טקסט", { dest: "region", region: null });
    check("notes: an unnamed region is refused", why[0]?.why, "whyRegionNeedsAName");
    ok("notes: …and blocks the write", blockedFor("טקסט", { dest: "region", region: null }));
    // A region nobody declared is a warning, not a refusal: the note is still
    // written and still prints, and the region can be made afterwards.
    const undeclared = caveatsFor("טקסט", { dest: "region", region: "שער" });
    check("notes: an undeclared region says so", undeclared[0]?.why, "whyRegionNotDeclared");
    notOk("notes: …without blocking", undeclared[0]?.blocks);
    // …and once it is declared, there is nothing to say.
    check(
      "notes: a declared region costs nothing",
      caveatsFor('#אזור("שער", מיקום: "רגל")\nטקסט', { dest: "region", region: "שער" }),
      [],
    );
  }
  {
    // A destination the engine cannot place yet is offered **with its reason**,
    // because a note sent there still prints — in a region at the page foot —
    // and a writer who is not told that goes looking at the wrong end of their
    // sefer. Derived from `PLACEMENTS`, so the day the engine grows the
    // placement this stops firing without anyone editing a list.
    const pending = DESTINATIONS.filter(
      (d) => d.channel !== null && !PLACEMENTS.includes(d.channel),
    ).map((d) => d.id);
    for (const dest of pending) {
      const why = caveatsFor("טקסט", { dest, region: null });
      check(`notes: ${dest} says the engine cannot place it yet`, why[0]?.why, `whyNotPlaced.${dest}`);
      notOk(`notes: …and does not refuse the note`, why[0]?.blocks);
    }
    for (const d of DESTINATIONS) {
      if (d.channel === null || pending.includes(d.id)) continue;
      check(
        `notes: ${d.id} is placed, so it says nothing`,
        caveatsFor("טקסט", { dest: d.id, region: null }),
        [],
      );
    }
  }

  // Every reason is a sentence in both languages. A refusal that renders as
  // `whySecondFootIsABox` is worse than no refusal at all, and this is the check
  // the grid's own fence had — the one thing about it worth keeping verbatim.
  {
    const docs = [
      "טקסט",
      '#ערוץ("מקורות", מיקום: "רגל")\nטקסט#הערה(ערוץ: "מקורות")[גוף]',
    ];
    const reasons = new Set();
    for (const doc of docs) {
      for (const d of DESTINATIONS) {
        for (const region of [null, "שער"]) {
          for (const c of caveatsFor(doc, { dest: d.id, region })) reasons.add(c.why);
        }
      }
    }
    // Three, not four. `whyNotPlaced.*` used to be reachable because the engine
    // could not place a note beside the text or in a companion volume, and the
    // panel said so in words rather than greying the destination out. Both are
    // placements now, so that caveat has nothing left to warn about and retired
    // itself — which is exactly what it was built to do the day `PLACEMENTS`
    // grew. The ones that remain are about the *document*: a region with no
    // name, a region never declared, and a second apparatus at the live foot.
    ok("notes: the caveats are reachable at all", reasons.size >= 3, [...reasons].join(", "));
    ok(
      "notes: no destination is refused for want of a placement",
      ![...reasons].some((r) => r.startsWith("whyNotPlaced")),
      [...reasons].join(", "),
    );
    for (const why of reasons) {
      ok(`notes: ${why} has a reason in Hebrew`, !!DICTS.he[why], why);
      ok(`notes: ${why} has a reason in English`, !!DICTS.en[why], why);
    }
  }

  // ------------------------------------------------- presets are picks

  // **Derived from the axes, never a separate list** (decision 11). A preset that
  // cannot be taken apart is a cell, so the assertion is that every preset *is*
  // a value of the one axis and nothing more — press one, and what you are left
  // holding is an ordinary pick.
  {
    for (const p of PRESETS) {
      ok(`notes: preset ${p.id} names a destination`, DESTINATION_IDS.includes(p.pick.dest), p.id);
      check(
        `notes: preset ${p.id} names a region exactly when it is one`,
        p.pick.region !== null,
        p.pick.dest === "region",
      );
      if (p.makes) {
        check(`notes: preset ${p.id} makes the region it names`, p.makes.name, p.pick.region);
        ok(
          `notes: preset ${p.id} declares that region`,
          presetLines(p).head.some((l) => l.includes(p.makes.name)),
        );
      }
      // The taking-apart, in one line: the pick a preset sets is a pick, so it
      // survives being changed to any other destination and back.
      const taken = { dest: "end", region: null };
      notOk(`notes: preset ${p.id} can be taken apart`, samePick(p.pick, taken) && p.id !== "endnote");
    }
    // A preset's region prints. Forgetting the dump call is the
    // collected-and-never-rendered failure this application has performed on its
    // own writers twice — and a region at the page foot must *not* get one, or
    // its notes render a second time.
    for (const p of PRESETS.filter((x) => x.makes)) {
      const lines = presetLines(p);
      check(
        `notes: preset ${p.id} prints its region exactly when it is not at the foot`,
        lines.tail.length > 0,
        p.makes.placement !== "רגל",
      );
    }
  }

  // ------------------------------------------------- settings live on the destination

  // *"You move three hundred haaros to the back by changing one setting, not
  // three hundred notes."* The settings are keyed by destination, written as a
  // `#ערוץ` line, and the writer never meets the word.
  {
    const doc = 'טקסט#הערה(ערוץ: "סוף")[גוף]';
    const back = { dest: "end", region: null };
    check("notes: a destination with no settings says nothing", settingsOf(doc, back), {});
    const numbered = writeDestination(doc, back, { numbering: "א" });
    ok("notes: a numbering scheme is written on the destination", numbered.text.includes('מספור: "א"'));
    check("notes: …and read back", settingsOf(numbered.text, back).numbering, "א");
    // A field left alone keeps what the document said; the defect this guards is
    // a panel that writes one knob and wipes the three beside it.
    const sized = writeDestination(numbered.text, back, { size: "0.9em" });
    ok("notes: a second knob keeps the first", sized.text.includes('מספור: "א"'), sized.text);
    ok("notes: …and adds its own", sized.text.includes('גודל: "0.9em"'), sized.text);
    check("notes: exactly one declaration", sized.text.split("#ערוץ(").length - 1, 1);
    // …and `null` is a different instruction from "leave it alone".
    const cleared = writeDestination(sized.text, back, { numbering: null });
    notOk("notes: null clears a knob", cleared.text.includes("מספור"));
    ok("notes: …and leaves the others", cleared.text.includes('גודל: "0.9em"'));
    // Not one note changed, which is the whole payoff.
    ok("notes: and not one note changed", cleared.text.includes('#הערה(ערוץ: "סוף")[גוף]'));
  }

  // The declaration is position-independent, and that is not a detail: `#ערוץ`
  // is read with `.final()` precisely so a line written at the bottom of the file
  // reaches page one. It is the opposite of the `#הגדרות_*` trap — a
  // `state.update` read from a page footer takes effect only on the pages after
  // it — and the reason the note fixture marks no case `exercisesHead`.
  {
    const notes = 'טקסט#הערה(ערוץ: "סוף")[גוף]';
    const top = `#ערוץ("סוף", מיקום: "סוף")\n${notes}`;
    const bottom = `${notes}\n#ערוץ("סוף", מיקום: "סוף")`;
    check(
      "notes: a declaration at the foot of the file says the same thing",
      channelsIn(top).find((c) => c.name === "סוף")?.placement,
      channelsIn(bottom).find((c) => c.name === "סוף")?.placement,
    );
  }

  // Two destinations in one document get **two** placement lines and two dump
  // calls. This is the trap in the de-duplication, and it was live: the check
  // for "does the document already carry this line" compared *command names*,
  // which is right for `#הערות_בסוף()` — there is one of those per document —
  // and wrong for every line this model writes, because they all name
  // something. So the second destination got no placement and no dump call: its
  // notes were collected into a stream the engine had never been told where to
  // print, and never rendered. Third instance of that failure in this
  // application, arriving through the one function whose job is to prevent it.
  {
    const doc = "טקסט ראשון כאן וגם עוד מלים.\n";
    let r = applyPick(doc, 5, { dest: "end", region: null }, false);
    r = applyPick(r.text, r.text.indexOf("עוד"), { dest: "section", region: null }, false);
    for (const name of ["סוף", "סוף_מדור"]) {
      ok(`notes: ${name} is placed`, r.text.includes(`#ערוץ("${name}", מיקום: "${name}")`), r.text);
      ok(`notes: ${name} is printed`, r.text.includes(`#הצג_אזור("${name}")`), r.text);
    }
    // …and asking for the same one twice still writes it once.
    const again = applyPick(r.text, 5, { dest: "end", region: null }, false);
    check("notes: one placement line per destination", again.text.split('#ערוץ("סוף",').length - 1, 1);
    check("notes: one dump call per destination", again.text.split('#הצג_אזור("סוף")').length - 1, 1);
  }

  // ------------------------------------------------- the notes index

  // The pane, the jump list and the right-click menu are all built on these two.
  {
    const doc = "פתיחה#הערה[ראשונה #הדגשה[מודגש] סוף] אמצע#הערתסיום[שניה] סיום.";
    const found = notesIn(doc);
    check("notes: two notes found", found.length, 2);
    check("notes: the first is a footnote", found[0].command, "הערה");
    check("notes: its body survives inner brackets", found[0].text, "ראשונה #הדגשה[מודגש] סוף");
    check("notes: the second is an endnote", found[1].command, "הערתסיום");
    check("notes: both are at depth 0", found.map((n) => n.depth).join(","), "0,0");
    check("notes: and they go to different places", noteDestination(doc, found[1]).dest, "end");
  }
  {
    const doc = "א#הערה[ב#הערה_ב[ג]]";
    const found = notesIn(doc);
    check("notes: a nested note is found too", found.length, 2);
    check("notes: and knows it is nested", found[1].depth, 1);
    check("notes: the outer body spans the inner note", found[0].text, "ב#הערה_ב[ג]");
  }
  {
    // A bracket inside a string inside an argument list opens nothing.
    const doc = 'א#הערה[ב #תמונה("צד[ימין") ג]';
    const found = notesIn(doc);
    check("notes: a bracket in a string does not end the note", found.length, 1);
    ok("notes: and the whole body is captured", found[0].text.endsWith(" ג"));
  }
  {
    const doc = "א#הערה[חצי";
    const found = notesIn(doc);
    check("notes: a half-typed note is still listed", found.length, 1);
    check("notes: reported as far as it got", found[0].text, "חצי");
  }
  {
    const doc = "א#הערה[גוף] ב";
    const n = noteAt(doc, doc.indexOf("גוף"));
    ok("notes: noteAt finds the note under the caret", !!n);
    check(
      "notes: sending it elsewhere keeps its prose and changes one argument",
      retargetNote(doc, n, { dest: "end", region: null }).text,
      'א#הערה(ערוץ: "סוף")[גוף] ב',
    );
    check("notes: delete takes the marker with it", deleteNote(doc, n).text, "א ב");
    check("notes: noteAt is null in plain prose", noteAt("שלום עולם", 3), null);
  }
  {
    // The deferred spelling: the prose does not move, the marker's argument does.
    const doc = 'א#הערה_בשם("1") ב\n#גוף_הערה("1")[גוף]';
    const n = noteAt(doc, doc.indexOf("1") + 1);
    ok("notes: a deferred note is found", !!n);
    const moved = retargetNote(doc, n, { dest: "end", region: null });
    ok("notes: its marker names the destination", moved.text.includes('ערוץ: "סוף"'), moved.text);
    ok("notes: and its prose has not moved", moved.text.includes('#גוף_הערה("1")[גוף]'), moved.text);
    check("notes: which reads back", noteDestination(moved.text, noteAt(moved.text, 3)).dest, "end");
  }

  // ---------------------------------------------------------------- regions
  //
  // **A destination is a stream and a region is a place**, and this module wrote
  // four of a region's eighteen keys. Everything that makes a region behave —
  // what it does when a note outgrows it, whether it holds its slot on a page it
  // has nothing on, what an entry says before it says anything of its own — was
  // reachable only by typing into the source.
  {
    // The table against the prelude's own key list, so a key added to `#אזור`
    // tomorrow has to arrive with a control. **All eighteen**, with no exception:
    // the first draft left `מיקום` out on the reasoning that the chooser owns it,
    // and the chooser writes a placement exactly once, when a preset creates the
    // region. After that a region's placement was changeable nowhere in the
    // application — and not through the channel either, because a channel
    // pointed into a region takes the region's placement and its own is ignored.
    const covered = new Set(REGION_KNOBS.map((k) => k.arg));
    check(
      "regions: every key #אזור accepts has a knob",
      VOCABULARY.regionKeys.filter((k) => !covered.has(k)),
      [],
    );
    check(
      "regions: …and no knob names a key #אזור does not accept",
      REGION_KNOBS.map((k) => k.arg).filter((a) => !VOCABULARY.regionKeys.includes(a)),
      [],
    );
    for (const knob of REGION_KNOBS) {
      ok(`regions: ${knob.key} is labelled in Hebrew`, !!DICTS.he[knob.label], knob.label);
      ok(`regions: …and in English`, !!DICTS.en[knob.label], knob.label);
      if (knob.choices) {
        for (const m of knob.choices) {
          const key = "regionValue." + (englishValue(m) ?? m);
          ok(`regions: ${m} is a word in Hebrew`, !!DICTS.he[key], key);
          ok(`regions: …and in English`, !!DICTS.en[key], key);
        }
      }
    }
  }
  {
    const doc = 'טקסט#הערה(אזור: "צר")[גוף]';
    const added = writeRegion(doc, "צר", { height: "1.2cm" });
    ok("regions: a new declaration goes to the top of the file", added.text.startsWith("#אזור("));
    check("regions: and the document is otherwise untouched", added.text.split("\n")[1], doc);
    check(
      "regions: a height is written bare",
      added.text.split("\n")[0],
      '#אזור("צר", גובה: 1.2cm)',
    );
  }
  {
    // The rule the destination knobs state, applied here: `undefined` keeps,
    // `null` clears, and a rewrite of one knob leaves the sixteen beside it.
    const doc = '#אזור("צר", מיקום: "רגל", גובה: 1.2cm, חריגה: "צמצום")\nגוף';
    const one = writeRegion(doc, "צר", { keepsPlace: "false" });
    check(
      "regions: writing one knob keeps the rest, placement included",
      one.text.split("\n")[0],
      '#אזור("צר", מיקום: "רגל", גובה: 1.2cm, חריגה: "צמצום", שומר_מקום: false)',
    );
    const cleared = writeRegion(doc, "צר", { overflow: null });
    check(
      "regions: and null clears exactly one",
      cleared.text.split("\n")[0],
      '#אזור("צר", מיקום: "רגל", גובה: 1.2cm)',
    );
  }
  {
    // A set-valued knob. The order is the policy for `גלישה` — the moves are
    // tried in the order they are listed — so it is written in the prelude's own
    // order and not in the order the boxes were ticked.
    const doc = '#אזור("צר", מיקום: "רגל")\nגוף';
    const many = writeRegion(doc, "צר", { spill: "עמוד_הבא,הקטנה" });
    ok(
      "regions: a set knob writes a tuple",
      many.text.includes('גלישה: ("עמוד_הבא", "הקטנה")'),
      many.text.split("\n")[0],
    );
    const one = writeRegion(doc, "צר", { spill: "הקטנה" });
    ok(
      "regions: a tuple of one keeps its comma, or Typst reads a string",
      one.text.includes('גלישה: ("הקטנה",)'),
      one.text.split("\n")[0],
    );
    const none = writeRegion(doc, "צר", { spill: "" });
    ok(
      "regions: and an empty one is a box that stays fixed",
      none.text.includes("גלישה: ()"),
      none.text.split("\n")[0],
    );
    check(
      "regions: a tuple reads back as its members",
      regionSettingsOf(many.text, "צר").spill,
      "עמוד_הבא,הקטנה",
    );
  }
  {
    // Both languages, in both directions. A panel that wrote a Hebrew argument
    // name into an English document would be performing the defect `_en_params`
    // exists to end.
    const en = writeRegion("גוף", "narrow", {
      height: "1.2cm",
      overflow: "צמצום",
      spill: "הקטנה,עמוד_הבא",
      head: "עמוד,מספר",
      unit: "כותרת",
      newPage: "true",
    }, "en");
    check(
      "regions: an English document gets English names and English values",
      en.text.split("\n")[0],
      '#region("narrow", height: 1.2cm, spill: ("shrink", "next_page"), ' +
        'overflow: "fit", head: ("page", "number"), new_page: true, unit: "heading")',
    );
    check(
      "regions: and reads back in the prelude's own words",
      regionSettingsOf(en.text, "narrow"),
      {
        height: "1.2cm",
        spill: "הקטנה,עמוד_הבא",
        overflow: "צמצום",
        head: "עמוד,מספר",
        newPage: "true",
        unit: "כותרת",
      },
    );
  }
  {
    // A title is content and not a string, which is the same distinction
    // `DESTINATION_KNOBS` draws — a heading a writer can set in bold is a heading
    // whose brackets have to survive the round trip.
    const w = writeRegion("גוף", "צר", { title: "ביאורים" });
    ok("regions: a title goes in as content", w.text.includes("כותרת: [ביאורים]"), w.text);
    check("regions: and comes back without its brackets", regionSettingsOf(w.text, "צר").title, "ביאורים");
  }


}

// ---- setDeclaredArgs: the region-height editor's pure half -----------------

{
  const doc = "#אזור(\"ב\", מיקום: \"רגל\", גובה: שורות(2))\n#הערה(אזור: \"ב\")[גוף]";
  const d = regionsIn(doc)[0];
    ok("replaces an existing value", setDeclaredArgs(doc, d, { "גובה": "4cm" }).includes("גובה: 4cm"));
  const noPlace = setDeclaredArgs(doc, d, { "מיקום": null });
  ok(`removal yields: ${JSON.stringify(noPlace)}`, !noPlace.includes("מיקום"));
  const bare = "#אזור(\"ב\", מיקום: \"רגל\")\nx";
  const grown = setDeclaredArgs(bare, regionsIn(bare)[0], { "גובה": "3cm" });
  ok("append lands inside the parens", /, גובה: 3cm\)$/.test(grown.split("\n")[0]), grown);
}

// Every note layout, inserted at every kind of caret position, compiled.
//
// # Why this exists beside `emit-insertion-fixtures.mjs` and not inside it
//
// That grid runs `insertionAt` over every registry command, and it is the best
// fence in this repository: it found 384 broken documents in 1,026, including
// three caret positions where *every command without exception* wrote markup
// that would not compile.
//
// It could not see the note path, and the reason is one line in `insert.ts`:
//
//     const note = noteFor(snippetInSeries);
//     if (note) return { kind: "note", … };   // ← before legalAt, before insertionAt
//
// A note is a *layout*, not a string — it may carry a wrapper, a configuration
// line at the top of the file, a dump call at the bottom, and with deferred
// bodies its prose does not go in at the caret at all — so `plan` answers it
// early and hands the whole job to `notes.applyChoice`. Which is correct, and
// which meant the one insertion path in the product that never passed through
// the code-mode rule was the one with the most moving parts.
//
// # What that cost
//
// Swept the same way — every choice in `NOTE_CHOICES`, every tier a choice
// offers, inline and deferred, in both languages, at all thirteen positions:
// **1,248 documents, 288 of which would not compile**, with a single engine
// message between them (*the character `#` is not valid in code*) and this
// distribution:
//
//     list-after-open       96/96
//     list-between-items    96/96
//     table-between-cells   96/96
//     the other ten          0/96
//
// Not 288 bugs. One: every note, in every code-mode position — the same three
// positions that broke all 114 registry commands the first time anybody swept
// for this, found again in the single path the fix had been exempted from.
//
// A writer found it, and then apologised for it: *"I found the footnote error —
// it was my error (it was not in brackets where I placed it)."* It was not their
// error. A toolbar writes something that compiles where the caret is, or greys
// itself out and says why. That standard is already this repository's; the note
// button was simply outside every check that enforced it.
//
// # The shape
//
// Deliberately the same as the insertion grid's, down to the context table —
// which is imported rather than restated, because two lists of "where a caret
// can be" would drift the way every duplicated table in this project has, and
// a position missing from one of them is a position with no fence.
//
//   node tools/emit-note-insertion-fixtures.mjs          # rewrite the fixture
//   node tools/emit-note-insertion-fixtures.mjs --check  # fail if it is stale
//
// `npm test` runs the --check form; `cargo test --test note_insertion` compiles
// what it produces.

import { join } from "node:path";
import { runAsScript } from "./generated.mjs";
import { load } from "./load.mjs";
import { ENGINE } from "./paths.mjs";
import { CONTEXTS, LANGS } from "./emit-insertion-fixtures.mjs";

const OUT = join(ENGINE, "tests", "fixtures", "note-insertions.json");

export async function buildFixture() {
  const { applyPick, noteFor, tieredNoteAt } = await load("notes");
  const { DESTINATIONS, PRESETS, presetOf } = await load("channels");
  const cases = [];

  // Every destination, plus every preset — a preset is a value of the one axis,
  // and the region declaration it writes is a second line at the top of the
  // file, which is exactly the kind of thing a code-mode caret breaks on.
  const picks = [
    ...DESTINATIONS.filter((d) => d.id !== "region").map((d) => ({
      id: d.id,
      pick: { dest: d.id, region: null },
      preset: null,
    })),
    ...PRESETS.map((p) => ({ id: p.id, pick: p.pick, preset: p.id })),
  ];

  // Where a sub-note can be sent. The five singular destinations, plus a region
  // — through the preset that makes one, because a note in a fixed region under
  // the live page foot *is* the Mishna Berura page and there is nothing else to
  // build it out of. The presets whose pick is a bare destination are left out:
  // they would be the same nested document twice under two names.
  const subPicks = [
    ...DESTINATIONS.filter((d) => d.id !== "region").map((d) => ({
      id: d.id,
      pick: { dest: d.id, region: null },
      preset: null,
    })),
    ...PRESETS.filter((p) => p.pick.dest === "region").map((p) => ({
      id: p.id,
      pick: p.pick,
      preset: p.id,
    })),
  ];

  /** How a case names the stream it writes into. */
  const choiceOf = (pick) => (pick.region ? `region/${pick.region}` : pick.dest);

  /** One insertion, at `at`, with everything the app would pass. */
  const write = (doc, at, pick, preset, lang, home, marker) =>
    applyPick(
      doc,
      at,
      pick,
      home !== "inline",
      marker ? { marker } : {},
      lang,
      false,
      preset ? presetOf(preset) : null,
      home,
    );

  for (const [ctx, tpls] of Object.entries(CONTEXTS)) {
    for (const lang of LANGS) {
      const tpl = tpls[lang];
      const at = tpl.indexOf("@");
      const doc = tpl.replace("@", "");
      // Both, because where the prose *lives* is orthogonal to where it prints
      // and the two go through different code: deferred rewrites the snippet
      // into a marker/body pair and files the body elsewhere in the document, so
      // it is not the inline case with an extra line.
      //
      // Three homes rather than two, and for the same reason: filing at the end
      // of a *section* takes a different path through `fileNewBody`, and a path
      // with no fence is where the 384 uncompilable documents came from.
      for (const home of ["inline", "file", "section"]) {
        for (const { id, pick, preset } of picks) {
          const out = write(doc, at, pick, preset, lang, home);
          cases.push({
            ctx,
            lang,
            choice: choiceOf(pick),
            id,
            layer: 0,
            deferred: home !== "inline",
            source: out.text,
          });
        }

        // ---- the layers -------------------------------------------------
        //
        // **A layer is a fact about the caret, not an axis of the chooser.** It
        // used to be one: a card carried up to three markers and the emitter
        // walked `markersOf`, so "layer" meant "the writer picked the second
        // button on this card". A sub-note's parent is now whatever note the
        // caret is *inside* — determined, never chosen, which is what a writer
        // means anyway — so nothing is picked and the depth is read.
        //
        // That makes it more this file's business, not less. This suite is about
        // **caret positions**, and *inside another note's body* is a position
        // like any other: it is a content group opened by a call, it is the one
        // place a marker and its prose can be in different apparatuses, and with
        // a deferred body it is a caret at the end of the file writing into
        // `#גוף_הערה("1")[…]` while its marker sits pages away. None of that was
        // swept by the layer-0 half above.
        //
        // The outer note is always the page foot, because that is the note a
        // writer already has when they reach for a second one.
        const parent = write(doc, at, { dest: "foot", region: null }, null, lang, home);

        // A sub-note in a different apparatus from its parent — Mishna Berura at
        // the live foot with Shaar HaTziyun in the box beneath it, and the same
        // shape for every other place a sub-note can be sent.
        for (const { id, pick, preset } of subPicks) {
          const out = write(parent.text, parent.caret, pick, preset, lang, home);
          cases.push({
            ctx,
            lang,
            choice: choiceOf(pick),
            id,
            layer: 1,
            deferred: home !== "inline",
            source: out.text,
          });
        }

        // …and the native chain, where the sub-note stays in its parent's
        // apparatus and is a *tier* of it. `tieredNoteAt` reads the caret, in
        // the document's own language, so this is the same string the toolbar's
        // `⁑` would put in — two levels deep, because tier ג inside tier ב is
        // where a depth counted rather than declared would first go wrong.
        let held = parent;
        for (let depth = 1; depth <= 2; depth++) {
          const marker = tieredNoteAt(held.text, held.caret, lang);
          const found = noteFor(marker);
          held = write(held.text, held.caret, found.pick, null, lang, home, found.marker);
          cases.push({
            ctx,
            lang,
            choice: `tier${depth + 1}`,
            id: "tier",
            layer: depth,
            deferred: home !== "inline",
            source: held.text,
          });
        }
      }
    }
  }

  return JSON.stringify(
    { note: "generated by app/tools/emit-note-insertion-fixtures.mjs", cases },
    null,
    1,
  );
}

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, await buildFixture(), "note-insertions.json"]];

runAsScript(
  import.meta.url,
  OUTPUTS,
  "note insertion fixtures",
  "node tools/emit-note-insertion-fixtures.mjs",
);

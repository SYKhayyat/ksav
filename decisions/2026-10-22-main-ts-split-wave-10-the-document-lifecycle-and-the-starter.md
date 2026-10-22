# The main.ts split, wave 10: the document lifecycle and the starter

Frontend · 2026-10-22 · decided by Shaul

## The decision

The split's last planned wave. Two files:

- `docswitch.ts` (426 lines): the switch machine — `openDoc` with its
  switch-generation ticket (the guard that is a ticket, not a flag),
  `openSwitcher`/`goToLastDoc`, `stashFocused`, `closeOpenDoc`,
  `refreshBaseline`, the create/duplicate/delete/rename verbs, and
  `updateTitleBar` with the honest dirty dot. Behind a `DocswitchWiring`
  (`makeState`, `syncGlobals`): the state factory and the compartment sweep
  are the notebook assembly the plan keeps in main, and the wiring names the
  seam rather than copying either.
- `starter.ts` (141 lines): the two starter documents, `starterDoc`,
  `swapUntouchedStarter` (the guard is exact equality — a writer's first
  character ends the arrangement), and CodeMirror's translated search phrases
  (`SEARCH_WORDS`/`searchPhrases`). Behind a `StarterWiring` (`loadBody`,
  `setSetting`).

main.ts 5,536 → 5,068 lines. The import graph stands at 132 modules, acyclic
(`78d0e68`). 15 definitions moved by the census (21 counting the two wirings
and the close-hook state), 0 wiring drift.

## What the plan said, what the carve said

1. **The opendocs split went to `docswitch.ts`, the plan's own escape
   hatch.** opendocs.ts owns the document set's metadata and its per-document
   editor states; the machine that swaps them is a second thing. The plan
   said "move with it or split to docswitch.ts if the file then names two
   things" — it names two.
2. **syncGlobals and setEditingMode stayed main, against the plan's move
   list.** The move list named them; the stay list claims "its extension
   composition, buildShortcutKeymap+reconfigureShortcuts". They are
   compartment composition — `syncGlobals` reconfigures seven compartments
   main owns, `setEditingMode` rebuilds the keymap through them. Moving them
   would have wired main to docswitch for main's own assembly. The stay list
   is the more specific holding; on record.
3. **`settlePendingModals` is a lesson applied.** Boot's form-modal close
   hook used to reach into `modalOk`/`modalDismiss`; when wave 9 gave the
   modal its own file, the hook got a door that says what it does. Wave 10's
   wirings (`DocswitchWiring`, `StarterWiring`) are the same shape decided
   before the fact: state stays with its owner, and what crosses the seam
   crosses as a named door.
4. **main.ts's header is now the map.** The end-state acceptance's rule 10:
   the header names every module the shell wires and the reason for each, so
   the reader's entry point is one file, by design.

## What the fences said, and what was rekeyed

- paneplaces' `bodyOf` follows `openDoc` into docswitch.ts; opening's line
  list gains docswitch.ts (attribution by enclosing top-level function, so
  the switch verbs must be findable there) and its definition regex accepts
  the `export async` spelling.
- language's SEARCH_WORDS fence reads starter.ts; the two engine oracles
  (emit-scan-oracle, emit-docfile-oracle) read starter.ts for the starter
  literals; `spell_en.rs`'s `include_str!` follows — the engine test that
  holds the starter against its own lexicon red before the gate did, which
  is the fence working.
- asyncaction's INVENTORY follows `refreshBaseline`'s boot call site (it is
  still main's `void refreshBaseline()`) and renameDoc's `saveNow`.
- docs.test registers both wirings (handback identity) for the runner's
  every-module-imported fence.
- README's count rekeyed (12,902 → 12,905).

## The end state, honestly counted

All ten waves of §3 are closed, each with its move commit, docs commit, and
green gate. What §4 asked for, command by command:

1. **main.ts ≤ ~1,500 lines, boot + assembly + wiring glue only** — the
   *contents* test is met (boot, the notebook assembly the plan's wave 10
   explicitly retained, the wirings, the editor-verb glue the chrome wiring
   names); the *number* is not: main.ts is 5,068 lines. The census the
   number came from predates two facts the waves surfaced: the assembly
   itself is ~3,700 lines of comment-dense code (makeState's extension list,
   the reveal/places machinery, the editor verbs), and one feature region —
   templates/exports, ~950 lines under the pairing banner's neighbour — was
   never slated to any wave in §3. Recorded, not laundered: closing the gap
   is one more wave-shaped move (templates/exports → their own files), which
   §3 does not authorise on its own.
2. **No new module singletons** — the import graph is acyclic at 132
   modules; module-level `let`s live in their owners (the wave modules hold
   their own timers, caches and picks).
3. **No misc/utils/helpers/common** — the gate refuses the names; the wave
   files are named by what they own.
4. **Every wave's end commit green** — tsc, build, the full suite including
   the browser fence, and the 11-check gate under `.#desktop`.
5. **Zero drift on every pure move** — moved.mjs per wave, on record in each
   commit message.
6. **The Aug-30 audit's recurrent item 3** — closed wave by wave in
   decisions/ and PLAN.md.
7. **Ten waves, verifiable** — this record is the last of them.

## What the carve caught in the monolith

`openDoc`'s switch-generation ticket was guarding a function that yields
three times and mutates global state after each — the comment said "a newer
switch has won" and nothing else asked. The move did not change that; it
made the ticket the module's own state, where the next reader of the switch
machine will meet it first. And the starter's exact-equality guard — the
line that decides whether a language switch may rewrite a writer's document
— now sits in a file whose only other content is the two documents it
guards.

## The end state

main.ts 5,068 lines: boot, the notebook assembly, the wirings, and the
header that maps them. 132 modules, acyclic. Waves 1–10 closed; the one
recorded gap is §4 item 1's number, with the shape of the move that would
close it.

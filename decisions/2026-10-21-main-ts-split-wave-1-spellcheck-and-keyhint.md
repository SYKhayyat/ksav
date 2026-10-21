# The main.ts split, wave 1: the spell-check UI, and what the move verifier caught

Frontend · 2026-10-21 · decided by Shaul

## The decision

The Aug-30 lamdan audit's recurrent item 3 prescribed splitting the 15,658-line
`ksav/app/src/main.ts`; the granularity call was Shaul's: *fine-grained modules,
even at the expense of reading flow, paid for by naming and comments discipline
and one-waypoint imports* (rule 4 of the wave plan). Wave 1 — the spell-check UI
region — was the proving wave: the smallest coherent region, zero chrome
dependencies, and the wave that builds `tools/moved.mjs`.

## What landed

- `ksav/app/tools/moved.mjs` (`2496cd8`): the pure-move verifier. Rule 1 of the
  split — a move commit relocates code verbatim, and that is a checkable claim —
  exists as a command now. It walks every top-level declaration in `src/*.ts`,
  finds the same-named declaration at a commit, and token-compares the two;
  comments and whitespace travel, renames and reformats inside a moved body are
  drift. Duplicate names across files are reported as duplicates or ambiguous,
  never guessed.
- The move commit (`0bade6a`): 21 declarations moved, zero drift — the spell
  region (banner `spell check` through `closeNoteMenu`) to `spellcheck.ts`, and
  the key-hint trio (`keybindings`, `hintFor`, `hintIsMode`) to `keyhint.ts`.
  Gates green at the commit: tsc, vite build, full suite 124 files / 12,775
  assertions / 0 failed.

## What the plan did not say, and the moves say

1. **`hintFor` was not free.** The plan's wave-1 region includes `snapshotNote`,
   which calls `hintFor`, and `keybindings`/`hintFor`/`hintIsMode` lived in
   main.ts itself with ~38 call sites and two source fences on them. Importing
   `hintFor` from main.ts was the first module cycle, the exact failure rule 4
   and wave 2's cycle check exist to prevent. Resolved per Shaul's call that day:
   the trio moved too, verbatim, to a new leaf, `keyhint.ts`, which nothing else
   the split creates can need to reach around.
2. **`autoExtension` did not move.** It shared the spell-check banner by file
   order only. It is autocomplete — its completion source `ksavCompletions`, the
   registries and the insertion seam live with the extension assembly in
   main.ts — and moving it would have made spellcheck.ts answer for a feature it
   does not own, for no reader's benefit. It stays with the assembly, which wave
   10 keeps in main.ts anyway.
3. **The spell state was shared, contrary to the plan's "nothing shared".** Three
   main.ts sites wrote the spell dirty/pending bookkeeping directly: the document
   swap reset, the dictionary word removal, and `importDictionary`. Since an
   imported `let` cannot be reassigned, the owner exports two explicit
   mutations — `spellCheckFromScratch()` (the same three assignments the swap did
   inline) and `runFullSpellCheck()` (pending + run now) — and the three call
   sites read better for it. No behavior changed; `moved.mjs` cannot verify
   *call sites*, so these three lines are the honest diff the move commit owns.
4. **An INVENTORY rekey was written into the wave plan and is not right.**
   `asyncaction.test.mjs`'s sweep keys an entry by the *file containing the
   call*, and `void openSpellMenu(` is called in main.ts twice, neither in the
   moved code. The key stayed `src/main.ts:openSpellMenu`. The plan's instruction
   would have rotted the sweep (unknown flag on two call sites, stale key on
   one) for a passenger that did not travel.
5. **The notelangs menu sweep was vacuous before this wave.** Its slice ended at
   `function closeNoteMenu` — which sat some six thousand lines *above* its
   start anchor, so `indexOf` returned a smaller offset and the sweep read an
   empty string, passing without looking at anything. Re-anchored to
   openNoteMenu's own body (`function editDoc(`); the fence now actually reads.

## The end state

`main.ts` at 15,321 lines from 15,640. `spellcheck.ts` (352 lines) and
`keyhint.ts` (46 lines) each carry their own rule-7 fence
(`spellcheck.test.mjs`, `keyhint.test.mjs`): the first holds the widening
arithmetic, the export list main.ts's wiring leans on, and the no-`./main`
import rule; the second holds "a rebinding moves the chord, the unbound print
nothing, no module-level state". `.tmp-test` now builds both, and the runner's
"every module is imported by at least one test" check is why they had to.

Waves 2–10 remain as written, with the cycle check to land in wave 2 before
anything could create one.

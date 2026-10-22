# The main.ts split, wave 7: version control, the drawers, macros and the hydra

Frontend · 2026-10-22 · decided by Shaul

## The decision

Wave 7 made the shell's four isolated surfaces their own modules. The
version-control drawer — the state, `refreshGit`/`runGit`/`openGit`/`forgetGit`,
`gitForHeader` for the chipbar and the three commit verbs — moved to
`gitui.ts` (315 lines) behind a `GitWiring`. The commands drawer's search half
moved to `commandsdrawer.ts` (85 lines). The help panel's *builder*
(`buildHelpPanel`) joined `help.ts`, where wave 5 had already put its render.
The macro recorder — the recording state, the cache, the three note hooks,
record/finish/play/delete and `macroName` — moved into `macros.ts` (361 lines)
beside the pure engine. The hydra's panel half (render, the window-capture
listener, the reset) moved into `hydra.ts` (374 lines) beside its pinned kinds
table.

main.ts is 8,948 → 8,319 lines. The import graph stands at 121 modules,
acyclic (`0bbabc0`). 47 definitions moved, 26 drifted.

## What the plan said, what the carve said

1. **gitui.ts keeps git's meanings away from the drawer's verbs.** The plan put
   the git service in `git.ts` and the face in the new module; the carve
   additionally split the drawer's *wiring-worthy* halves: the modal question
   (`ask`) and the body swap of a commit restore (`loadBody`) arrive
   registered, with `restoreCommit` snapshotting *first* exactly as a snapshot
   restore does — the one thing a restore must never skip.
2. **The keys drawer's view stayed in main; its door did not.** `renderKeysPanel`
   is a pure function of the shortcut registries main still owns
   (`actions()`, `reconfigureShortcuts`, `captureShortcut` arriving through
   settingsdrawer's wiring) — staying there was the honest read of the census.
   But
   `openKeys` is a drawer door like `openCommands`, so it went into
   `commandsdrawer.ts` with its sibling. Recorded, not laundered: the file is
   named for one drawer and holds the other's three-line door beside it.
3. **Macro recording is engine-adjacent state, not a separate module.** The
   recorder's three ears (`noteAction`, `noteTyped`, `noteSnippet`),
   `recording`/`replaying`, the cached saved-list, and the whole
   record/finish/play/delete surface move into `macros.ts` — the pure
   step-engine module whose contract they exist to drive. `runAction` and
   `inAction` stay in main: the action door is the shell's, and every replayed
   step reaches it through the wiring (`actionById`), never recorded.
4. **The hydra is one vocabulary, now one file.** The pure table over
   `STRUCTURE_ACTIONS` and its legend/capture were two halves of one contract
   (the plan's own acceptance named the pinned kinds contract); keeping the
   render and the cap listener in main would have meant a wiring to the
   wiring. `runStructureAction` stays main (it is `editDoc` + the note hook);
   hydra reaches it through `HydraWiring`, and `resetHydra` owns the
   close-hook state the panel registry's hook runs.
5. **`commandsdrawer.ts` and `gitui.ts` similar in size but different in kind.**
   The commands drawer is three functions whose data is all pure modules; git
   UI is a stateful engine flap with subprocess outcomes. The split is where
   the plan drew it.

## What the fences said, and what was rekeyed

- `hydra.test`'s capture fences read `hydra.ts` — the window-add/remove
  assertions now read the file that owns the listener; the close-hook pairing
  assertions read `resetHydra`'s own source, with `MAIN` keeping
  `wirePanel("hydra", { close: () => resetHydra() })` as the registered door.
  One assertion was *renamed* ("by the panel registry's close hook" keeps its
  sentence; a new one asserts main names the function).
- `styleediting.test`'s "a style row in the keys drawer is named" fence reads
  `macros.ts` for `styles.styleOfAction` — the resolver moved with the
  recorder.
- `panelrows.test` extends the row-dress block to the commands surface
  (`commandsdrawer` imported; `LOOKS.commands.row === LOOKS.palette.row`, the
  shared dress the drawer renders through), feeding the runner's
  every-module-imported fence.
- `docs.test` registers the `GitWiring` (handback identity), the other half of
  the same runner fence for `gitui.ts`.
- The action-only-through-runAction fence in chrome.test keeps its shape:
  `playMacro`'s documented exception now lives in macros.ts, and the fence's
  `enclosing` walk still reads main — the calls it cares about are the ones
  main retains.
- README's assertion count rekeyed (12,891 → 12,896): the git wiring
  handback, the commands-surface row-dress row and hydra's named-door fence.

## What the carve caught in the monolith

The version-control region had been hiding two drawers in one: git's own and
the keys panel — a leftover of wave 3's chrome work whose view really sits
with settings. The macro recorder's play path had *one* decision living in
main (`runAction`/`inAction`) whose every other input (the recorder, the
steps, the cache, the names) now sits one import away. The hydra's own name
collisions (`openState` etc. inside hydra) resolved by keeping the original
names in the module scope, no aliases.

## The end state

main.ts 8,319 lines from 8,948; three drawer lives and the whole recorder and
hydra machinery own their files. Wave 8 — the styles system, ~1,600 lines —
is the biggest single region left; it is next.

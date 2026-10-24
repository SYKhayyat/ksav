# The main.ts split, wave 6: the settings drawer, the list-shaped panels and the snapshots

Frontend · 2026-10-22 · decided by Shaul

## The decision

Wave 6 emptied the bin main had left: the settings drawer — the largest
single surface in main.ts — moves to `settingsdrawer.ts` (1,048 lines) with
its row builders (numberRow, optNumberRow, selectRow, checkRow, textRow,
textAreaRow, listRow, alignRow, noteBodyRows, reserveRow, clearPageField),
the font picker, the about/notices sections and the keys-capture path
(captureShortcut, exportDictionary, importDictionary, resetShortcuts). The
row machinery shared by four panels and the palette — LOOKS, drawList,
drawRow, runRow, goToOffset, the pane toggles/renders and `openNoteMenu` —
moves to `rowlists.ts` (593 lines). Version history (`takeSnapshot`,
`restoreSnapshot`, `openHistory`, `closeHistory`, `renderHistory`) moves to
`snapshots.ts` (144 lines).

main.ts is 10,471 → 8,948 lines. The import graph stands at 119 modules,
acyclic (`7f9e25b`). 49 definitions moved, 26 drifted.

## What the plan said, what the carve said

1. **One rowlists.ts instead of the plan's panelviews.ts half.** The plan
   pointed the shared list machinery at a *pure* panelviews module. The carve
   disagreed, and the disagreement is structural, not taste: drawList already
   rerenders chrome state (`rerenderChrome` on toggle), drawRow reads live
   settings, runRow runs registry actions, and goToOffset calls into the
   editor. A "pure view" module would have needed a second wiring at the
   moment of its creation. The row dress, draw and dispatch stayed together;
   the deviation is recorded, not laundered.
2. **Three wirings, same shape as waves 4–5.** `RowWiring` (wireRows:
   runAction, restore, swapDoc, revealCaret) carries the shell verbs the row
   dispatcher fans out to; `restore` travels as main's guarded verb
   (`voidAction("save_file", …)`), not a bare call — which is why
   asyncaction's inventory lost nothing this wave. `SettingsWiring`
   (wireSettings: runList, openKeys, eventToKey, whose, reconfigure,
   swapRunningHead, confirm, noteHome, attachFont, dropAsset, live, pageSet,
   write, adoptDefault) keeps the drawer honest about refusing to mutate:
   `write` is a method, not an import. `SnapshotsWiring` (wireSnapshots:
   confirm, refreshBaseline, loadBody) lets snapshots.ts import drawList and
   LOOKS from rowlists.ts without a reverse edge.
3. **The settings mutations stayed in main.** `setSetting`, `setPageSetup`
   and `adoptPageSetupAsDefault` sit on dirCompartment, themeCompartment and
   the compile schedule — editor machinery the plan's own region map holds.
   They arrive as wiring methods; their bodies are wave 7+ material, and a
   wave that deep would rename itself.
4. **The keys drawer's door stayed in main.** *(Amended 2026-10-22: wave 7
   moved `openKeys` to `commandsdrawer.ts` with the drawers' doors — the
   reading below was the honest one for wave 6 and did not survive its
   neighbour's carve.)* `openKeys` is three lines
   (closeMenus + openPanel("keys-drawer")) whose only drawer call sites are
   the settings drawer and main's own registry; `eventToKey` and `whose`
   (drawer 231: `hasKey(key)` truthy naming) join them. What moved is what
   captures, shows and writes — not the panel the drawer opens into.
5. **`whose` renamed out of the capture path, kept main-held.** captureShortcut
   still asks who holds a chord (`whoHolds`, bindings.ts), but keybinds
   themselves read through `keyhint.keybindings` — a rename that stops
   settingsdrawer and main both declaring the drawer's authority.
6. **`spell` became `spellN` inside the drawer.** The module imports the
   dictionary namespace (`spell.ts`) as a distinct name so the prose that
   keeps saying "spell" about misspellings stays true where it appears at
   the bottom of the drawer.

## What the fences said, and what was rekeyed

- `chrome.test`'s palette-filtering fence ("restores first-row selection")
  sliced "function drawList" out of main; drawList is rowlists.ts's now, so
  it reads ROWLISTS from the same source map.
- `panelrows.test` imports LOOKS from the built rowlists module and asserts
  the five list surfaces each have their row dress — the runner's
  "every module is imported" fence now has the module on record.
- `docs.test` registers and re-reads the snapshots wiring (the handback is
  identity), which feeds the same runner fence for snapshots.ts.
- `deferred.test`'s note-body placements read settingsdrawer.ts for
  `"data-setting": "noteBodyHome"` and the DESTINATIONS row loop.
- `find.test` splits: `renderFindPane`'s printed-half fence reads rowlists.ts
  (the window widened 1400 → 2400 characters because the moved comment block
  travelled nearer the function than the old census had it); the scope row
  ("selectRow(\"searchScope\", …)") reads settingsdrawer.ts; MAIN keeps
  startFind, the chooser and `wirePanel("find-drawer", …)`.
- `notelangs.test`'s menu sweep re-reads openNoteMenu from rowlists.ts, with
  the sweep's end anchor rekeyed to `drawList(` (the next function after the
  menu in the module), prose recording the full anchor history now.
- `opening.test`'s open-in trio reads settingsdrawer.ts; MAIN keeps the
  prohibition walls.
- `retention.test`: the history fences follow what moved — the cost/why/clear
  assertions read snapshots.ts, the footer re-render fence slices
  renderHistory from snapshots.ts (not a MAIN.slice of a function that has
  moved), and the manual third answer reads settingsdrawer.ts.
- `restarts.test`'s renumber rows (which say "this drawer carries") read
  settingsdrawer.ts; NL keeps the renumber engine's own half.
- `settings.test` got three rekeys: the drawer-note proximity walk now reads
  settingsdrawer.ts for the row census; everyPreferenceHasAControl counts a
  setting as reachable if settingsdrawer.ts names it; the goToOffset block
  reads rowlists.ts (renamed "goToOffset is a function in rowlists.ts", and
  the reveal half's fence rekeyed to `revealCaret` — the wiring verb the panes
  now ask for).
- `tagselect.test` splits by residence: the extension and the shared-registry
  fence stay on main.ts (the keymap machinery is the editor's), the *row*
  fence reads settingsdrawer.ts.
- `whitespace.test`'s row and note fences read settingsdrawer.ts.
- `asyncaction.test`'s inventory: the owed entry for
  `settingsdrawer.ts:settingsWiring` never needed to exist — the drawer's
  `void settingsWiring().dropAsset(...)` row argues with itself (the wired
  half is guarded with voidAction in main; the void keyword on a call
  returning void is a phase). The keyword is gone at the call site and the
  inventory keeps its row shape; the stale `src/main.ts:removeAsset` row is
  dropped in the same commit.
- README's assertion count rekeyed (12,884 → 12,891): panelrows' row dress
  and docs' wiring handback added the five net assertions.

## What the carve caught in the monolith

The drawer's 950 lines sat as one wall under the version-control region's
banner; settingsdrawer.ts's header now says the drawer owns the fields and
defers every write, which is the *same* hold/give split the plan's wiring
table stated in kinds. The carve also surfaced a seam the census would not
have spotted as text: openNoteMenu, the note menu, and the note-layout
chooser's drawer row — three pieces of one note story — now live in two
modules (rowlists.ts and settingsdrawer.ts) whose only shared vocabulary is
the wiring name. Nothing was displaced-docs this wave; the drawer's banners
moved with their code.

## The end state

main.ts 8,948 lines from 10,471; three more surfaces own their reading and
writing; the row machinery that four panels borrow is one file. Waves 7–10
remain as written; wave 7 (macros) is next.

# The main.ts split, wave 4: the palette, girsa, and the series machinery

Frontend · 2026-10-21 · decided by Shaul

## The decision

Wave 4 moved three self-named banner regions out of the monolith: the command
palette (Mod+K's surface, the arrow-key lineage and its operations list) into
`palette.ts` (151 lines), the citation plumbing — `linkifySelection` (spec.md
§10.5), the refresh rows and their normal `Refreshing` state, the mekoros
popup and its keyboard, `askForMekor`, the lint's way in
(`attachRefToNote`), the drop-into-Girsa door and the courtesy call
(`tellGirsaWhereItIs`) — into `girsa.ts` (491 lines), and the series keepers
(`scheduleRenumber`, `renumberNow`) into `numbering-lint.ts`, joining
`renumberAll`, both now exported. main.ts is 11,336 → 10,738 lines. The
import graph stands at 116 modules, acyclic (`57d443b`). 21 definitions
moved, 3 drifted — every drift one of the two rule-4 seams below.

## What the plan said, what the graph said

1. **Numbering-lint, not numbering, for the series machinery.** The plan
   slated the region for `numbering.ts`, where the model lives. The callers
   say otherwise: `renumberNow` calls `renumberAll`, which lives in
   numbering-lint (it is state the linter owns — the `NumberMark` list the
   click-to-fix fence answers through), and `numbering.ts` is the leaf that
   numbering-lint already imports from. The reverse import would be the
   precise cycle this split exists to avoid. Recorded as the plan's
   deviation.
2. **One runtime hook for the insertion path.** Girsa's `take()` writes
   citations through `insertSnippet`, main-held until wave 5 moves it to
   `insert.ts`. A per-caller import of main is forbidden, so `runtime.ts`
   gains `onInsertSnippet`/`insertSnippet` in the shape of `onRerenderChrome`
   — `let hook = () => false`, main's `installHooks` registers its own
   `insertSnippet`, girsa calls `runtime.insertSnippet`. This is *interim by
   design, and recorded as such*: wave 5's insert.ts is the direct import,
   and the hook retires with the move. moved.mjs caught the one drifted
   token; the drift list is the record.
3. **PaletteWiring for what the rows can be.** The palette lists what the
   shell can run beyond the content registry: the shell's action
   arrangement (`actions()`), the macro ids' names, and the shared list
   renderer (`drawList`/`LOOKS`, main-held until wave 6's panel work — its
   `drawRow` runs main-held `runAction`/`insertSnippet`/`closePalette`, so
   it cannot move first). These arrive as one `PaletteWiring` object
   (`wirePalette`, `paletteWiring()`), declared in `palette.ts`, registered
   by main's boot beside `wireChrome`, guard text mirroring the chrome's
   ("wirePalette was never called: the palette wiring is missing"). The
   renderer is behind the wiring deliberately: palette.ts never imports
   main's `Look` type, it hands a `PanelList` (computed via
   `panelrows.paletteList`) to the wiring's `render` and the shell draws it
   where it lives.
4. **The reveal cluster stays in main, against the plan's "state bits travel
   with girsa".** `placesAnswer` and `revealClickTimer` were slated to ride
   along; the call sites say no — the cluster (`revealCursor`,
   `revealPlaces`, `renderPlaces`, `revealToExpandedLine`,
   `revealFromSourceClick`) is follow-the-jump machinery: it answers a jump
   request (`jump.ts` reaches it: "which source did this printed mark come
   from, and expand to it"), while girsa answers "whose verse is this
   phrase". Same mekoros popup behind both, different question — honest
   ownership beats the slate. Girsa keeps the citation half only, and
   `tellGirsaWhereItIs` is the *only* main→girsa courtesy call; the census
   is on record in the plan's #22 addenda.

## What the fences said, and what was rekeyed

- `restarts.test` now reads two files, named in a comment: `MAIN` keeps the
  shell's change path (`scheduleRenumber()` in the update handler) and the
  settings rows; `NL` (numbering-lint.ts) holds the machinery checks —
  debounce, the two refusals, the report.
- `asyncaction`'s INVENTORY documents girsa's own `askForMekor` void
  (structure-dependent refinement of main's entry, same reason) and keeps
  main's registry call sites (`refreshSources`, `linkifySelection`,
  `askForMekor`) — the `void` lives where the call runs, and the registry's
  is in main. The sweep's message is the teacher here: it failed pointing at
  the correct file both times, and the fix was to believe it.
- `chrome.test` gains the wave-4 wiring fence grouped with wave 3's: imports
  `.tmp-test/girsa.mjs` + `.tmp-test/palette.mjs`, asserts the palette guard
  and that registration answers back, and that the four surfaces are
  reachable from their own modules; the runner's every-module-imported rule
  is satisfied by the same block.
- README's assertion count rekeyed (12,880 → 12,883): the chrome fence and
  the tower additions net three assertions.

## What the carve caught in the monolith

The series banner's five-paragraph doc names `insertSnippet` twice — that is
the doc's point (insertions renumber, deletes and moves do not) — and it
travelled with the region into numbering-lint.ts, reading correctly from
there. No displaced-docs problem this wave: all three regions ended
cleanly at their next banner, and the word-count cluster (`countTimer`,
`updateCounts`, `countNow`) that sits between the series banner and the
girsa banner stayed in main — the main doc-change handler owns it.

## The end state

main.ts 10,738 lines from 11,336. The palette, the citation path and the
series machinery now have fence surfaces, girsa answered for by its runtime
hook (which retires in wave 5), the palette and the chrome registered by the
same boot. Waves 5–10 remain as written; wave 5 (insert/snippets/tables/help,
the into-existing-owners wave) is next.

# The main.ts split, wave 2: the pane system, and what the cycle check changed

Frontend · 2026-10-21 · decided by Shaul

## The decision

Wave 2 was the largest move the plan names — the pane tree, its editors, its
strip, its drag, its scroll link, its menu, its arrangements, and the tab
strip, ~2,600 lines of the 15,321-line main.ts — and the wave that lands the
plan's rule-5 fence: the import-cycle walk (`tools/imports.mjs`, gate check
#10, `8ef5208`), placed *before* the move so the move could not create the
cycle it was most likely to create.

## What landed

- The gate (`8ef5208`): `imports.mjs` walks src/*.ts value imports (type-only
  edges erased at emit, with three pre-existing type-only cycles declared as
  such in the header), refuses the plan's rule-9 junk names, and fails naming
  the cycle. Mutation-verified before it guarded anything.
- The move (`b574007`): eight modules — `panestate.ts` (460), `paneview.ts`
  (147), `panehost.ts` (735), `panedrag.ts` (261), `panescroll.ts` (443),
  `panemenu.ts` (170), `panearrangements.ts` (269), `tabstrip.ts` (409) — 96
  declarations out of main.ts (12,721 lines now). 39 declarations drift, all
  state-direction rewrites and enumerated in the commit. `panesystem.test.mjs`
  (99 assertions) is the wave's rule-7 fence. Gates green: tsc, build, 125
  files / 12,881 assertions / 0 failed, DAG acyclic at 112 modules.

## What the plan did not say, and the graph says

1. **The wiring object was the missing mechanism.** The plan said panestate is
   "the shared leaf" and main "wires" it, but not how the leaf calls back
   without a cycle. The answer is `PaneWiring`: an interface panestate declares
   and main.ts registers once in `installHooks` (`wirePanes({...})`) — the
   state factory, the prose flag, the editing modes, the side-pane draws, the
   handed-over `openDoc`, `askText`, and the two render hooks. Every pane
   module reaches main.ts only through `paneWiring()`; `imports.mjs` holds the
   consequence (no pane module imports main, no cycle anywhere).
2. **The plan's five files became eight.** The plan's wave-2 list had
   panestate/panehost/panedrag/panescroll/panemenu/panearrangements plus a
   wave-3 merge of tabstrip. What the carve found: `paneview.ts` had to split
   out of panehost (the `EditorView` factory + dispatch policy is the one part
   narrow/widen and the mirrored-change engine share, and panehost is already
   the largest module), and tabstrip merged *into* this wave as the plan's own
   W3 note allows — its `handOverPages` is a pane-system behaviour, not chrome.
3. **Three functions moved to a different module than the plan named, each
   because the cycle check said so:**
   - `previewWindowOf`/`applyPreviewWindows` → panestate, not panehost: paneview's
     narrow/widen must refresh the preview windows, and paneview cannot import
     the host that builds it.
   - `applyPaneZoom`/`cyclePaneZoom` → panehost, not panearrangements: main's
     `pane.zoom` key and the strip's zoom chip both ask, and arrangements
     reading panehost is the arrow the plan drew the other way.
   - `showPagesFor` → preview.ts, not "stays in main": both its callers are
     `openDoc` (main) and `handOverPages` (tabstrip), and tabstrip cannot
     import main. The function documents preview policy (`tabCompile`), and
     its neighbours `drawRemembered`/`clearPages` already lived there.
4. **Rule 3 cost three small exports where state stopped being file-local.**
   `scrollWritten` (the echo ledger), `scrollFloor` (the "somebody is driving"
   floor) and the caret-follow timer were private to the linked-scroll block
   while `renderPanes`, `jumpFromClick` and `revealCursor` wrote them from
   outside. panescroll exports `noteScrollWrite`, `claimFloor`,
   `cancelCaretFollow` — named for the act, not the field — and `clamp01`/
   `clampScroll`, which main's reveal arithmetic still performs and which are
   now the only scroll arithmetic the suite can hold without a DOM.
5. **`openDoc` inside tabstrip had to fork by intent.** A plain open is
   `runtime.openDoc` (the hook main registered in wave −1); the handed-over
   open — "the pages are already drawn, do not do it again" — cannot go
   through `runtime` (which carries no options) and goes through the wiring's
   `openDocHanded`. The two names are the two meanings; `opening.test.mjs`'s
   prohibition fence attributes both (the wiring's `installHooks` is now an
   allowed owner, named for exactly what it is).

## What the fences said, and what was rekeyed

- `opening.test.mjs` attributed `openDoc` calls by the enclosing top-level
  function *in main.ts*. With the funnel in tabstrip.ts, attribution now runs
  across both files; the ALLOWED map is unchanged except for the wiring entry.
- `asyncaction.test.mjs`'s INVENTORY keys by the file holding the call —
  `settleNow`'s entry moved to `src/panescroll.ts:settleNow`.
- `jump`, `paneplaces`, `retention`, `settings` fences that grepped main.ts
  follow the moved code (the module list is named in each fence).

## What the carve caught in the monolith

Two pre-existing anomalies that a per-declaration carver cannot paper over,
kept verbatim rather than silently fixed: a `jumpFromClick` doc-comment
sitting two functions above its function (main.ts:4641, directly ahead of
`gotoPart`'s), and a mirrored `applyPaneZoom` doc above `toggleMinimap`'s.
The carver's own off-by-one at the `mirrorChange` doc seam (a stray `*/` left
in main, the doc not yet attached to its function) was the one defect of the
tooling, fixed in the same commit the doc landed in paneview.ts.

## The end state

main.ts 12,721 lines from 15,321. The pane-cycle fixes the wave exists for
(#138/#139's class) now land in ~700-line files with their fences beside
them. Waves 3–10 remain as written; wave 3 (app chrome) is next.

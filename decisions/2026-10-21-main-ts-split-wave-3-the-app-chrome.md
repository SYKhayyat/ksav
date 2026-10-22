# The main.ts split, wave 3: the app chrome, and where the strip's verbs waited

Frontend · 2026-10-21 · decided by Shaul

## The decision

Wave 3 moved the second-largest surface out of the monolith: the toolbar, every
menu hung under it, the paragraph-style and highlight controls, the key-cap
builders and the lazy-menu mechanism into `ribbon.ts` (1,288 lines), and the
caret-following strip — the half-second door between every arrow key and the
writer's sense of place — into `contextbar.ts` (258 lines). main.ts is 12,721 →
11,336 lines. The import graph stands at 114 modules, acyclic (`7db65c4`).

## What the plan said, what the graph said

1. **A per-call-site sweep, act names over proximity.** The plan named one
   wiring reach (`updateContextBar`'s shell behaviours); a call-site sweep over
   the carved bodies found ~30 main-held verbs the ribbon calls — editing
   primitives, folding, the styles drawer, the document verbs, the macro state.
   Routing them as ~30 individual runtime hooks would have been invisible; the
   wave-2 `PaneWiring` pattern scales: one `ChromeWiring` object, declared and
   registered in `ribbon.ts` (`wireChrome`, `chromeWiring`), filled by main's
   boot in `installHooks`. contextbar's five shell needs share it through its
   own ribbon import — `contextbar → ribbon`, never `→ main`.
2. **`structureMenuItems` stays in ribbon.** The plan slated it for contextbar
   at the wave's end; the callers say otherwise — it feeds the format and
   insert menus, and its data comes from ribbon's `fillParagraphStyles` and
   `paragraphStyleAt`. Moving it would have made the two modules import each
   other, the precise cycle this wave exists to avoid. Recorded as the plan's
   deviation; a later wave that moves the menus can revisit.
3. **`editDoc` became a real runtime export.** Its dependencies (`minimalChange`,
   the view) were already runtime-side; seventeen main call sites keep their
   names while `replaceAll` stands on top of it untouched. The rule-4 rule says
   imports of pure leaves beat indirection every time.
4. **Build-time reads are part of the wiring contract.** `buildToolbar` asks
   `chromeWiring().docLang()` while building, not on click — which is why
   `chrome.test`'s new fence registers a wiring before it touches the surface
   and asserts the guard: the chrome answers for nothing until boot registers
   it. Rule 3's named mutators appear as wiring methods, named for the act:
   `openStylesFor(level)` (the styles drawer's level+open pair as one verb),
   `dismissForeignHydra(structure|null)`, `refreshContextBar`,
   `refreshStylesPanel`, `reconfigureShortcuts`.

## What the fences said, and what was rekeyed

- `toolbar.test` reads `ribbon.ts` for its group scan; `coverage.test` reads
  ribbon for the Insert menu's registry walk and contextbar for the prose
  strip; `notelangs`' sweep anchor (`function editDoc(`) had floated off with
  wave 1's empty-sweep lesson still on record — now `function replaceAll(`,
  the menu's actual successor; `panelede` and `styleediting` read ribbon for
  surfaces and contextbar for the keymap churn; `asyncaction`'s INVENTORY
  documents ribbon's `chromeWiring`/`unfoldAll` voids and dropped main's stale
  `removeDoc` entry. chrome.test gains the wiring guard/registration fence;
  chrome.test additionally imports the two modules, satisfying the runner's
  every-module-imported rule.
- README's assertion count rekeyed (12,881 → 12,880): the wave-3 rekeys net
  one assertion.

## What the carve caught in the monolith

Two doc comments (the CHIP_RUN doc and the startFind doc) were riding the
toolbar region's tail exactly as wave 2's displaced docs had; both were
reattached before `startFind` in main. `main.ts` keeps `menu()`'s builder
imported *from* ribbon — the app-chrome banner's file-menu half went with
buildHeader, and that seam is the wave-4 palette/insert region's neighbour, not
this wave's refusals.

## The end state

main.ts 11,336 lines from 12,721; the chrome that the acceptance run drives by
selector now has a fence surface (`chrome.test` reads all files, and the two
new modules build cold). Waves 4–10 remain as written; wave 4 (palette, girsa,
series machinery) is next.

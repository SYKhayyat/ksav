# The main.ts split, wave 8: the styles system

Frontend · 2026-10-22 · decided by Shaul

## The decision

Wave 8 moved the formatting panel — the biggest single region left in the
main.ts split — out into two modules, split where the plan's second name said
what it took:

- `stylespanel.ts` (1,676 lines): the render and every styling *section* —
  `renderStylesPanel`, the layer model that writes the document's default, an
  element's own settings, or the overrule (`styleScopes`, `styleInstance`,
  `setStyleArgsIn`), the headings' per-level ramps, the notes' three tiers,
  bands, streams, the mark register's class-keyed doors — and the shared row
  family (`styleRow`, `fieldControl`, the select/unit/size/font/colour/levels
  controls) that the destinations, the keys drawer and wave 9's other tenants
  borrow.
- `customstyles.ts` (222 lines): the writer's own paragraph styles —
  `applyCustomStyle` (whole paragraph when nothing is selected), `unwrap`,
  `takenStyleNames` over the registry, the knob form (`styleKnobRows`),
  `openNewStyle`/`openStyleEditor`.

main.ts 8,319 → 6,540 lines, well inside five after two waves that were in the
eight thousands. The import graph stands at 123 modules, acyclic (`2a6a767`).
58 definitions moved (51 stylespanel, 7 customstyles), 0 drift.

## What the plan said, what the carve said

1. **The two-module split is where the second name says it took.** The census
   argued the same split from the other direction: the classes the panel
   carries are of two kinds — *what the panel can show* (every section's rows)
   and *what a style is* (the gestures that put one on a paragraph, take it
   off, name a new one). The rule followed: `customstyles.ts` refuses to
   answer for the panel, `stylespanel.ts` refuses to answer for what a custom
   style is — the header lists both.
2. **The one shared edge runs one way: gestures borrow the dress.**
   `customstyles.ts` imports `styleRow`/`fieldControl` from `stylespanel.ts`;
   the reverse edge (`myStyleRows`'s edit affordance opening
   `openStyleEditor`) is not an import — it is a wiring entry
   (`StylesWiring.openStyleEditor`), wired from main. The alternative — one
   module owning the row family — would have put the panel's dress in the
   gesture file that two of its ten sections do not use.
3. **The renderer pays for its borrowings honestly, into the `StylesWiring`.**
   `destinationRows` (a destination is the document's own declaration; its
   rows read the living document and are still main until wave 9),
   `applySkin`/`undoSkin` (settings mutations — main-held with the other
   compartment machinery as wave 6 set), and `reconfigureShortcuts` (the
   shortcut compartments) arrive registered. `applySkin`/`undoSkin` stay
   whole in main including their panel-restore dance — the wave renders like
   before with borrowed hands.
4. **`entityAct` and `styleActions` stay main.** They sat physically inside
   the styles region, but `entityAct` answers for every construct, not for
   styles, and `styleActions` is the open document's own action list feeding
   `actions()` — the shell's, per the wave-7 holding. The carve cut two
   blocks around the former and left the latter above them. The honest budge
   beats the tidy region.
5. **`openStylesFor` became a named export.** The ribbon's level picker said
   `headingLevel = level; openStyles();` inline; with `headingLevel` now
   panel state, the door is `openStylesFor` and main's wiring is a plain
   reference. Panel-adjacent panel state leaves at birth rather than
   surfacing through a setter.

## What the fences said, and what was rekeyed

- coverage's "a control writes it" fence reads `stylespanel.ts` for
  headings/lists/tables/notes and still main — plus main's `setStyleArgs(doc,`
  arm — for review, whose writer is the review drawer that wave 9 holds.
- notestyle's precedence fences (`overridingShared`, `SHARED_NOTE_FIELDS`,
  the `NOTE_KINDS` includes-sweep, `sharedNoteRows`/`endnoteStyleRows`) read
  the panel file.
- styleediting's my-styles row fences and the sizeControl/ramp fences read
  the panel file; the keys-drawer-name fence (wave 7) already read
  `macros.ts`.
- docs.test registers both wirings (handback identity) — feeding the
  runner's every-module-imported fence, which had named neither new module.
- README's count rekeyed (12,896 → 12,899).
- The plan's acceptance — styles.test registry invariant and the
  uilanguage copies — held without edits: the third uilang copy sat between
  the writer and the door and travelled with them.

## What the carve caught in the monolith

The "Styles › My styles" row was the place where the styles system's two
owners met: a row in the panel whose chord capture runs the keys drawer's
`captureShortcut`, whose edit opens `openModal` (from the form-modal region),
whose replay door is the ribbon's — three wirings in oneassium row, now each
arriving through the seam that owns it. And `renderStylesPanel` turned out
to live in the destinations banner (it assembles every section), which the
wave took whole rather than leaving an assembler where only wave 9's rows
guessed it would find it.

## The end state

main.ts 6,540 lines; the styles system answers for itself in two files with
its borrowings named at boot. Wave 9 (destinations, the form modal, review,
section setup, formulas, the notes chooser, assets) and wave 10 (document
lifecycle and boot) remain.

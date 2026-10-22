# The main.ts split, wave 9: the form's doors and the document's tenants

Frontend · 2026-10-22 · decided by Shaul

## The decision

Wave 9 emptied the monolith's remaining feature regions into seven files, one
shape each: a feature with its rows, its door, and nothing it answers for
beyond that.

- `formmodal.ts` (196): `openModal`, `closeModal`, `ask`, `askArrival`,
  `askText`, and `settlePendingModals` — the close-hook state the panel
  registry's Escape path must settle, exported under a name that says what it
  does rather than reached into from boot.
- `destinations.ts` (261): the document's own note-stream declarations and
  their region rows, the one styles-panel section that edits declarations
  rather than `#הגדרות_*` calls.
- `reviewpanel.ts` (125): the marks, the comments, the reading view, the
  decisions.
- `sectionsetup.ts` (59), `formulas.ts` (77): the two form doors the modal
  region was written for.
- `noteschooser.ts` (297): the pick, its preview, the per-region heights, and
  the errand that files a note body into a companion document.
- `assets.ts` (139): room, attach, insert, the font door, and the removal
  that reclaims.

main.ts 6,540 → 5,536 lines, under five and a half thousand. The import graph
stands at 130 modules, acyclic (`1a83d80`). 46 definitions moved, 0 drift.

## What the plan said, what the carve said

1. **The destinations' rows went to `destinations.ts`, not `panelrows.ts`.**
   The plan left the choice to the census: "split rows into panelrows.ts if
   they are panel rows, else destinations.ts". They are rows *in* a panel,
   but their shape is destinations — a pick, a label, a region, a write-back
   through `channels.ts` — and `panelrows.ts` is not a module this codebase
   has; the name would have invented a second home for list-row machinery
   that rowlists.ts (wave 6) already owns. Taken the other way, on record.
2. **The form modal stopped being a wiring the moment it became a module.**
   Wave 8 wired `wireCustomStyles({ openModal })` because main held the
   modal; wave 9 made customstyles import it from formmodal directly and
   retired `CustomStylesWiring` — a wiring whose only purpose was a wave
   boundary that has now passed. The same arithmetic says `settlePendingModals`
   is an *export*, not a wiring: boot's panel-registry close hook calls a
   function, it does not borrow a capability.
3. **What cannot be imported stays wired.** Destinations borrows the
   editor's whole-document write-back (`replaceAll`) through
   `DestinationsWiring` — wave 10's carve of the editor's write path will
   move it again, and the wiring names the seam instead of a copy. Everything
   else the seven files needed was already wired at an earlier wave
   (`destinationRows` into `wireStyles` at wave 8, `applyNotePick` into
   `wireInsert` at wave 5, `askText` into `ChromeWiring` and
   `MacrosWiring`, `bodyHome` into `SettingsWiring`) — which is why the
   wave's drift count is zero. The borrowings preceded the move.
4. **The notes chooser keeps the errand.** Writing a note body into a
   companion document is a library-shaped operation, but `deferred.ts` is
   pure by design and the chooser is the only caller; the piece stays where
   its only entry point is, with the failure reported either way as the
   marker-with-no-note comment already argued.

## What the fences said, and what was rekeyed

- asyncaction's INVENTORY follows `runErrand`/`fillNotePreview` into
  `noteschooser.ts` — two bare `void`s whose reasons travel with them.
- coverage's destination fences read `destinations.ts`; the review writer's
  arm (`setStyleArgs(doc, "review"`) gained `reviewpanel.ts`, and the fence
  message now says "a control writes it" rather than naming main.
- insert's guarded-form fence (no caller compiles after an insertion it did
  not check) reads the three callers that insert on their own behalf —
  sectionsetup, assets, reviewpanel — joined to main's read.
- docs.test registers `wireDestinations` (handback identity) and imports all
  wave-9 modules for the runner's every-module-imported fence.
- README's count rekeyed (12,899 → 12,902).

## What the carve caught in the monolith

The `replaceDoc` in the review region and the `replaceAll` in the
destinations region were two answers to one question (put this text, land
the caret) at two scopes; both stay single — `replaceDoc` whole in
reviewpanel.ts, `replaceAll` main-held behind the destinations wiring. And
`settlePendingModals` exists because boot's form-modal close hook was
reaching into the modal's private state (`modalOk`, `modalDismiss`) across a
file boundary the moment the modal got its own file — the registry's Escape
path now settles through a door that says what it does.

## The end state

main.ts 5,536 lines: the editor, the chrome, the panels, and boot. Wave 10 —
the document lifecycle and boot itself — is the last wave, and the first one
where main.ts's own name describes what is left of it.

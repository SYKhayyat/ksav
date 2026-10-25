# Accepted debts — the one ledger

The split's decisions records each said "recorded, not laundered" about the
items its carve chose not to do. This file is the single ledger those records
point at, so no item lives in three places that must be kept in sync by hand
(the audit's #144 finding).

Each entry names its origin, its cost, and the condition under which it should
be paid. An entry with no such condition is not a debt, it is a complaint —
and does not belong here.

## On the ledger

1. **`openKeys` (the keys drawer's door) lives in `commandsdrawer.ts`** — a
   file named for a different drawer.
   From: wave 7 (§ the keys-drawer bucket decision). Cost: a reader looking
   for the keys drawer's open door finds a commands file. Pay when: the keys
   drawer gets its own module (it is currently three: panelviews' view,
   settingsdrawer's capture, commandsdrawer's door).

2. **`syncGlobals`/`setEditingMode` stayed in main.ts against the plan's wave-10
   move list** — they are compartment composition, and moving them would wire
   main to docswitch for main's own assembly.
   From: wave 10. Cost: main.ts holds two functions the plan named for
   docswitch. Pay when: the compartment machinery itself moves (the plan's
   wave-10 stay-list would have to be amended first).

3. **§4 item 1's line number (main.ts ≤ ~1,500) is not met** — 3,980 lines
   after wave 12 part 1 (as measured on this date). The contents test is met (boot + assembly + wirings +
   the header map, no feature region); the remainder is the notebook assembly
   the plan's wave 10 explicitly retains.
   From: wave 10, re-counted in wave 11. Pay when: the plan is amended to
   move the assembly itself — a decision, not a cleanup.

4. **The Girsa handoff poll and onboarding are still main.ts's** — wave 12
   part 1 moved the reveal feature; these two tangled their extractions and
   were reverted rather than shipped.
   From: wave 12 part 1 (#147). Cost: ~270 lines of feature code under an
   assembly name. Pay when: a session can run the app in a browser — the
   onboarding overlay and the poll's visibility behaviour are not
   verifiable from text fences alone.
   **Paid 2026-10-25** (#147): both moved and driven in Chromium against
   the live engine — the overlay's whole lifecycle and a
   visibility/focus flurry over the poll, zero page errors.

5. **The noteStyleRows/tierStyleRows merge and the default-rows migration to
   `fieldControl`** — the two have drifted beyond a safe parameterisation
   (different knobs, engine defaults, option lists), and the skip-on-default
   magic is per-knob judgement.
   From: #152. Cost: ~130 duplicated lines in stylespanel.ts and two
   vocabularies for one knob at the default scope. Pay when: a UI-verification
   session (the styles panel open in a browser).

6. **The 2-preview desync** — `followCaretInPreview`, `settleExactly` and
   `previewWindowOf` are single-preview; a 2-source/2-preview arrangement
   builds and silently stops syncing.
   From: #153. Cost: a latent behaviour gap behind a feature nobody has built.
   Pay when: someone builds a multi-preview arrangement.

7. **The `e.code`/`e.key` split between the window resolver and CodeMirror** —
   decided by record (#148), with its boundary stated at the derivation site:
   character-key bindings resolve in the editor and not outside it.
   From: #148. Pay when: a binding table entry actually needs a character key
   outside the editor.

8. **The download-tier binding persisted in HANDLES** duplicates a fact
   `LibraryEntry.fileName` holds — the right artifact is `kind` on the library
   entry.
   From: #154. Cost: one redundant store row per download-bound document.
   Pay when: the binding store is next touched.

9. **api.ts is four things in one file** — the jump/reveal/places triplication
   is fixed (#149); the wire-vocabulary / cache / transports / scan-memo file
   split is not.
   From: #149. Cost: adding an engine service touches one file that could be
   four. Pay when: the next engine service lands.

10. **The perf items below the measured line** — spans' linear positional
    queries, rowlists' JSON.stringify row equality, the notes index's rescan
    cascade, the scan-cache full-string probes.
    From: #157. Cost: unmeasured at 1,000-page scale. Pay when: the profiling
    fixture (a 1,000-page sefer through `tools/bench-structure.mjs`) exists.

11. **Two garbled commit messages** (`0bbabc0` "Buffy", `2a6a767` a stray
    Cyrillic word) — left in pushed history deliberately; rewriting pushed
    history costs more than the typo. The same sentences are clean in the
    decisions records and SESSION_LOG.
    From: #144. No pay condition; recorded so nobody "fixes" it with a force-push.

## Not on the ledger

Anything a fence holds. A fence is a debt that cannot quietly grow.

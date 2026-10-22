# The main.ts split, wave 5: the insertion path and help's render

Frontend · 2026-10-21 · decided by Shaul

## The decision

Wave 5 moved the one insertion path to where its decision already lived.
`insertSnippet` — **the** path every toolbar button, menu entry, palette row,
key binding and snippet expansion ends at — plus `snippetMap`, `snippetTab`,
`insertCommand`, `tieredNoteHere` and the document-language pair (`docLang`,
`dirLang`) joined `plan` in `insert.ts` (164 → 414 lines). The module's own
header says what this is: the decision engine and the performer are now one
file, and the fixtures can import both halves. Help's render (`openHelp`,
`renderHelp`) joined the registries it derives from in `help.ts` (319 → 364).
The runtime hook wave 4 used as a bridge retires; girsa calls `insertSnippet`
through a direct import, which was the point of building the hook the shape
it had.

main.ts is 10,738 → 10,471 lines. The import graph stands at 116 modules,
acyclic (`4c1a8f3`). 8 definitions moved, 2 drifted.

## What the plan said, what the graph said

1. **InsertWiring for what `plan` cannot answer.** `insertSnippet`'s two
   shell-owned decisions — is the macro recorder listening (`!inAction`), and
   the chooser's own `applyNotePick` — stay main-held (the macros are wave 7's
   region, the chooser's is its own later wave). They arrive as one
   `InsertWiring` object (`wireInsert`/`insertWiring()`), registered from
   main's boot beside `wirePalette`/`wireChrome`, and the `!inAction` gate
   rides inside the registered `noteSnippet` rather than being carried into
   insert.ts — the replay counter is macros' state, and the recorder decides.
   Wave 4's interim bridge (`onInsertSnippet`/`insertSnippet` in runtime.ts)
   is deleted in the same commit; a bridge that has served lasts until the
   ferry arrives.
2. **HelpWiring for the row runner.** Help's entries are clickable and they
   speak `panelrows.RowAction` — the same vocabulary the palette, the outline
   and the notes list speak. `runRow` (which builds that dispatcher out of
   main-held verbs) stays with the shared list machinery for wave 6, so the
   render reaches it through a registered `HelpWiring` (`wireHelp`), guard
   text mirroring the other three wirings.
3. **The hiding trio, list/contents/running-head verbs and `startFind` stay
   in main.** They looked like part of the snippet banner but the census says
   otherwise: each has its producer in a pure module already
   (`hiding.ts`, `lists.ts`, `headings.ts`), and what is left is the shell's
   three-line perform half plus the drawer/previews around it. Moving them
   would have renamed the wave into "everything main still does".
4. **The table bucket was already overtaken.** The plan's "table editing →
   table.ts" pointed at a region whose contents wave 3 had already moved:
   the model was in `table.ts` before the plan was written, the operations
   registry lives in `structure.ts`, and the caret strip that region defined
   (`contextBar`, `updateContextBar`) went with wave 3 to `ribbon.ts`/
   `contextbar.ts`. What remains table-branded in main is the two column
   arrows' direction logic and the structure keymap — keymap machinery, at
   home with `reconfigureShortcuts`. Bucket closed without a move; recorded.
5. **`docLang`/`dirLang` travelled with the path.** The plan for wave 5 does
   not mention them, but the census says: all eighteen main call sites and
   the pure modules' `dirLang` argument are about *generated commands*, and
   `tieredNoteHere` cannot function without them. They are exported from
   `insert.ts` — the module whose concern "what language does this document
   speak" genuinely is.

## What the fences said, and what was rekeyed

- `chrome.test`'s recorder fence ("a command inserted with no action behind
  it is recorded too") read main for adjacency between `insertSnippet` and
  `noteSnippet`; the path and the gate no longer share a file, so it reads
  `insert.ts` for the wiring call. The test reads `INSERT` from the same
  source map it already scans all files through.
- `coverage.test`'s make-list-performs check read main for
  `plan.kind === "rewrite"` — the perform branch is insert.ts's now, and the
  local is `answer`. Retargeted with the module's own prose kept.
- `insert.test`'s "says whether anything went in" prose-expander retargeted
  to the `export function insertSnippet` form; its comment now names both
  halves and points at the caller scans staying main-held.
- README's assertion count rekeyed (12,883 → 12,884), the net of the
  retargeted prose.

## What the carve caught in the monolith

The insertion trio sat inside the "the open document" region at an awkward
seam: `snippetMap` and `snippetTab` lived before the keyboard-shortcuts
directive, `insertCommand` after it, and the language pair further down. All
three weave-into-one now: the expansion (Tab), the command door (registry by
name) and the path itself, with the pure decision they all route through.
Nothing was displaced-docs this wave; the snippets banner travelled with the
path and the region's remainder (`applyHiding` and kin) reads correctly under
no banner, its functions' own docs carrying them.

## The end state

main.ts 10,471 lines from 10,738; the insertion path — the seam §7 of the
7 August report named the costliest — is testable end to end, decision and
performance in one importable file. girsa has no bridge left to call. Waves
6–10 remain as written; wave 6 (settings drawer, the small panes, snapshots)
is next.

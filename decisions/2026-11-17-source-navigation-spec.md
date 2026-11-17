# Source navigation: the specification (#126)

Written to answer UAT item 14 — *"In source mode, cursor movement should skip
Typst syntax unless a mode or key explicitly asks to navigate markup"* — for the
same reason this repository always writes the contract before the key handler:
the issue's own scope list names eleven behaviours, several of which interact,
and each one decides the others. This is that definition, in the decision
record; the implementation is a follow-up that has to be felt in the app.

## The model

A document has **two surfaces** in the editor. The **prose view** (the default
for a newly opened document) hides command syntax behind replace decorations and
reveals it under the caret. The **raw view** shows every character. Item 14 asks
for a third notion — motion over *prose*, whichever surface is underneath.

The model therefore adds one setting and one movement rule, and declares the
rule to be about *what the caret steps over*, not about what is visible:

- **`sourceMotions`** — `"semantic"` (default) or `"raw"`.
- **Semantic movement** steps over typst scaffolding and stops at prose
  boundaries. Scaffolding is `#`, command names, argument parentheses and their
  commas, body brackets, string literals and comments — but **not the bodies
  the brackets carry**, which are prose and stay reachable. The runs table
  below is the rule, per run.
- **Raw movement** is today's movement: every character is a character, and a
  modifier key forces it on a semantic setup.

The escape hatch is always available: on a semantic setup, `Alt+Left/Right`
navigates raw, and the `"raw"` setting makes plain word movement raw.

## What moves

The scan (`spans.scan`) already classifies every run. Semantic motion uses the
classes, never a new syntax walk:

| run | moved over | stopped at |
|---|---|---|
| prose text (Hebrew or English, any direction) | — (it is the prose) | its boundaries |
| `#` + command name (`הדגשה`, `הערה`, …) | always | its end |
| argument list `(…, …)` — the parentheses and commas | always, when empty or all-arguments | its end |
| argument list around a body `(…)[…]` — same | same | — |
| body `[…]` contents | **kept as prose**; the brackets themselves | skipped |
| string literals inside an argument list | skipped as one unit | whole |
| comment `#__name[…]` contents | skipped as one unit | whole |
| list scaffolding (the `#רשימה(` opener, the per-item punctuation) | skipped | the item's own text |
| whitespace | walked | next run boundary |

Two rules make it deterministic where the fence otherwise blurs:

1. **Entering a body is okay; leaving a body is not** — the caret may step into
   `[…]` (the writer edits the argument), but a *forward* motion that enters a
   command name or `(` must skip the whole of it and land in the body or at the
   next prose run. Symmetrically for backward motion.
2. **In a mixed run (left-to-right inside right-to-left, or vice versa), the
   boundary is the visual order direction's run boundary** — `bidi.ts` already
   computes runs; motion uses the same edges so the caret cannot be made to
   skip across a direction change inside one word.

## Deterministic cases (the sibling list, answered)

- **Arrow keys**: in semantic mode a left/right arrow stops at the nearest
  prose-run boundary in that direction, not at every character of scaffolding.
  Character-by-character navigation remains available because the boundary set
  includes each scaffold character individually when `sourceMotions: "raw"`.
- **Word movement**: `Ctrl/Cmd+Left/Right` moves word-over-word over prose and
  whole-run over scaffolding. A command name is one word regardless of the
  number of letters in it.
- **Home/End**: still line/paragraph ends in document order; they exist to
  escape a run, so they are never offset by semantic filtering.
- **Selection expansion**: `Shift`ed movement extends the selection over the
  same boundary the unshifted movement would move to. A selection may contain
  scaffolding inside it; the selection's edges are prose boundaries.
- **Search hits and diagnostics**: both operate on raw offsets today and stay
  that way; a search hit inside a command body is a hit. Item 14 is movement,
  and it must not redecorate search results.
- **Bracket/tag selection**: `brackets.ts` selects structurally and is not a
  motion; unchanged.
- **Vim/Emacs modes**: both modes bind their own `w`/`e`/`b` and
  `Alt+f`/`Alt+b` against the underlying keymap; the semantic boundary set is
  what those report, so the two modes inherit the same stops. The modes are
  `Prec.highest` over every other keymap and are not regressed by adding a
  compartment underneath them.
- **Mixed Hebrew/English**: rule 2 above. A Hebrew word and an English word
  merged without space — `"עני" + "in"` — are one prose run in the scan and
  one word under this rule; only a direction change inside a *single* run
  splits it.

## What must not change

- `runtime.jumpTo()`, the switcher, the outline and the notes pane jump by
  document offset and are not motions; item 14 is about the caret.
- Prose view's reveal: a hidden command under the caret must reveal when the
  caret arrives (semantic motion can land on `#` only in raw mode), and the
  existing `proseReveal` behaviour stays the source of truth.
- Nothing about typing. Motion rules may filter *where the caret goes*; they
  never filter what an inserted character changes.

## Two implementation routes, and why the decision matters

**Route A — atomic ranges on hidden syntax (prose view only).** Declare the
hidden decoration ranges atomic so the caret cannot be placed inside them.
Small, standard CodeMirror, and wrong in prose view: the reveal mechanism
exists precisely so a hidden command *can* be reached (click or reveal-all),
and atomic ranges make that impossible without reworking reveal — the interaction
was measured here (cursor can currently traverse hidden text, which is why
`proseReveal` exists). It fixes prose view and leaves raw view unanswered,
which is most of UAT 14.

**Route B — a motion keymap over the scan's runs.** Two or four commands
(forward/backward × word/move-to-boundary) computed on the current `spans.scan`
of the document, installed in a compartment beside `structureCompartment`, bound
to `Alt-Left/Right` and `Ctrl-Left/Right` when `settings.sourceMotions ===
"semantic"`, with the raw escape built into the same keymap. This answers raw
view and prose view alike because both ask the scan. It is the larger route, and
the only one that satisfies "a default source-navigation mode" rather than a
redecoration.

Choose B when implementing; do not implement A first "cheaply" — it buys a
regression of reveal for half the issue. Implement B behind the setting, fence
each case table row above as a unit assertion over the pure boundary function,
and have the felt behaviour confirmed on the owner's machine before the setting
ships as the default.
# 2026-08-25 · The reserve in the writer's hands

The editor half of the reserve work — HANDOFF item #30's fixed-region-resize
half, four commits across the evening of 24 August. The engine's knobs
existed; not one of them had a surface a writer could reach.

## The page-foot reserve row (`3be84ab`)

The settings drawer gains the strip itself: a length (`2cm`, `40pt`, `30mm`,
`1in`) or a percent of a chosen base — the sheet or the text block. The
percent is converted to centimetres *in the editor*, using the open
document's own sheet and margins, because the engine's knob is centimetres
and the number the writer sees should be the number layout gets. Blank means
absent, and absent means decide from the document: `clearPageField` removes
the key entirely rather than storing an empty value merging cannot distinguish
from a zero.

Beside it, the `reserve_overflow` selector — grow / refuse / flow — exposed
with its Hebrew and English words from the generated parameter table.

## Dragging is typing (`5e8db78`)

The same row under a slider: dragging writes one value at a time through the
same `setSetting` path typing uses, so there is one write story and the text
field follows the thumb.

## Per-region heights in the chooser (`13a1df0`, `accf803`)

Under the notes chooser, one row per declared region with that region's
`גובה`. The edit goes through `setDeclaredArgs` (`channels.ts`) — a pure
splicer that re-locates the declaration node, reads keys in either language,
replaces or appends or removes named arguments in place, and returns the next
document unchanged when nothing would change. Removing a height leaves the
declaration without the key: the engine decides again. Tested for replace,
remove and append-inside-the-parens.

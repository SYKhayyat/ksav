# Three panes, one caret

**2026-08-16**

A window with three source panes onto one sefer has three places in it. The open
set has one slot, and switching to another document and back put all three panes
at the focused pane's caret.

The code said so. `showInEveryPane` carried it as a comment:

> What is *not* preserved is where each pane was standing in the document being
> returned to — every pane comes back to the focused pane's caret, because the
> open set stores one state per document rather than one per pane per document.
> That is a real limit and it is filed as its own item rather than left here as
> a comment nobody will find.

Which is the right way to leave a known gap — named, filed, and not pretending.
This is the item.

## Why the open set is not where this belongs

One `EditorState` per document is correct for what it holds: one text, one undo
history. The caret is the field in it that is *not* a property of the document —
it is a property of a view onto the document, and a window has as many of those
as the writer split it into. A pane holding the sugya being compared against is
the entire reason to open a second pane, and rebuilding it by hand on every
document switch is what made the second pane not worth opening.

## Why a third table

**Not a field on `Leaf`.** The pane tree is rebuilt by structural sharing, and
the renderer decides which editors it may leave alone by comparing leaves with
`===`. A growing per-document map hanging off a leaf would mean every caret move
rebuilds that leaf — and a rebuilt leaf is a rebuilt `EditorView`, which throws
away the caret, the scroll and the folds of the pane whose caret moved. The cure
would be the disease `panes.ts` was written to avoid.

**Not a field on `OpenDoc`.** The open set is deliberately pane-free: it is which
documents are open globally. A document that knew about panes would have to be
told when one closes, when a tab is switched, and when an arrangement is
replaced.

So `paneplaces.ts`: keyed by both, owned by neither, pure, and holding three
numbers per pane per document. Losing it is a worse experience and never a wrong
document.

## Two things it does not do

**It does not invent an answer.** A pane that has never shown a document has no
remembered place, and is left holding the document's own caret — where the
writer last was in it. Not the top, and not another pane's place.

**It does not trust its own offsets.** The document can be edited from another
pane, another tab, or by an import, while this pane is showing something else, so
a remembered offset is a claim about a text that may no longer be that long.
Clamped rather than discarded: the end of a document is a worse answer than
where you were and a much better one than the top.

## The same complaint, one pane over

A preview pane's scroll had the same shape: per pane, not per document, so
returning to a sefer with the source at siman fifty showed the printed page at
page one. Same table, same keys — and restored *after* `showPagesFor`, because a
scroll into an element with no pages in it yet is silently clamped to zero.

## Forgetting, swept rather than wired

A pane's places go when the pane does, and closing a pane is not the only way one
goes: replacing the arrangement drops panes too, and that does not look like
closing one. So `setTree` sweeps — every pane the table knows about, against
every tab's tree, not just the one on screen. The other tabs' panes are alive and
merely not visible, and forgetting them there would lose exactly what this item
is about.

A document's places go when the document is closed or deleted. Keeping them
would put a pane back at a place in a sefer measured against a text edited since.

## The fence

`paneplaces.test.mjs`, in two halves, because the fix has two. The module is
pure and is tested as such. The wiring is in `main.ts`, which boots the
application on import and cannot be evaluated from a test — so what is checked
there is read out of `openDoc`'s own body, sliced by name rather than matched
against ten thousand lines, which is the mistake `chrome.test.mjs` documents at
length.

The order is the whole meaning and is asserted: remembering *after* the state has
been replaced would record the incoming document's caret against the outgoing
document's name, which is worse than not remembering at all.

Mutated and watched to fail: the restore removed (`…and puts them back`), the
remember moved after the switch (`…before the document is taken away`), and the
clamp turned into identity (`a place past the end comes back inside the
document`).

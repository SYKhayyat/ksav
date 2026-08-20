# 2026-08-20 · Opening is not switching

The report was one sentence — *"opening a document replaces the one you had
open"* — and it was true of every route into a document. There are eleven of
them, and each one called `openDoc`, which puts the arriving sefer into the
panes the writer is standing in.

Nothing was lost from disk. The open set keeps every document's text, caret and
undo history, and `openDoc` stashes the one being left. What was lost was the
**arrangement**: for a writer comparing two seforim in a split, the panes *are*
the work, and the second sefer landed in them.

## What made this invisible

The capability was already built. `openInNewTab` exists, it is correct, and its
own comment says why it was written:

> every route into a document — the Documents menu, the switcher, the library —
> opened it **here**, over the arrangement the writer was standing in. Which is
> the right default and was the only behaviour.

So a previous sitting found the gap, built the mechanism, hung it on a `⧉`
glyph on two menu rows, and left the default alone — with the parenthesis *"which
is the right default"* standing unexamined. It is not the right default; it is
the reported bug. This is the repository's own recurring shape from the other
side: not a mechanism that does not work, but a working mechanism the surface
does not reach for.

## The setting

`openIn`, three answers, `reuse` by default:

| | |
|---|---|
| `reuse` | Go to the arrangement already showing that document; make a new one only if there is none. What an editor does. |
| `newTab` | Always a new arrangement, even onto a sefer already on screen. |
| `current` | Open it here, over what you were reading. The old behaviour. |

`reuse` and not `newTab` because `newTab` grows an arrangement every time a
writer clicks through the switcher, and "take me back to it" is what clicking a
document that is already open means. It costs a single-document writer nothing:
the sefer they open is in no tab, so they get the one tab they had.

## Opening and switching are two acts

The distinction is the whole fix, and it is what the funnel encodes. Four paths
deliberately do **not** come through it — `goToLastDoc`, closing a document,
deleting one, and a tab restoring what it was showing. Each of those picks a
document to put into an arrangement that already exists. A new tab for any of
them is a tab nobody asked for.

## The one that was not an `openDoc` call

Picking a **template** never went near `openDoc`. It dispatched the template
body over the open document's text — one transaction replacing the whole
document. Sweeping the `openDoc` call sites and stopping there would have left
the sharpest instance of the reported class in place, because it did not look
like the others.

A template now starts a document of its own, placed by `openIn` like everything
else, *unless* what is on screen is empty — which is the first thing a new
writer meets, and which should not cost them a second untitled document in the
library. Direction is applied after the document arrives rather than before, or
a template that starts a new document would flip the direction of the sefer
being left behind.

`loadBody` stays a whole-document replacement for the three callers that are
genuinely *this* document under another version of itself: a snapshot restore, a
git restore, and a re-read from disk.

## The fence, and the first version of it that could not fail

`test/opening.test.mjs` reads `main.ts` as text and asserts that `openDoc` is
called **only** from the four switch paths, by name. A twelfth route into a
document fails it by existing, and the question it forces out loud is the one
this record is about: is this a switch or an opening?

The first version of that fence attributed each call to *the nearest permitted
function name above it*, which is not the enclosing function at all. A
deliberate regression — putting the import path back to `openDoc` — passed,
because the call sat a thousand lines below `closeTab` and was credited to it.
Attribution is by the enclosing top-level function now, and the same regression
fails and names the line. `ONLY_AT_TOP` again, in a test written the same hour
as the rule it was written to hold.

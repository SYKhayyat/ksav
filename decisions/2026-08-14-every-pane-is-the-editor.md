# Every pane is the editor — 14 August 2026

Three faults, one shape. Configuration that belongs to the *application* was
applied to `runtime.view` — the pane that happened to have focus — and every
other pane in the window kept whatever it had. The window is split; the code
was not.

## What was measured

Not read. Each of these was driven in the assembled application first, because
the diagnosis taken off the source was how the first two got their names and
reading is not how a claim about a running product gets earned.

**A pane kept the document you switched away from.** Two source panes, open a
different sefer: the focused pane changed, the other went on rendering the
document that had just been left — under the incoming document's name, because
`retargetPanes` relabels every pane while `openDoc` re-stated one. The window
showed two documents and claimed to show one.

**Typing into that pane threw, silently, once per character.** Edits are
forwarded to the primary and mirrored back as changesets carrying the primary's
positions. Once the two documents were different lengths, every keystroke raised
`Applying change set to a document with the wrong length` — uncaught, nothing
changing on screen, nothing said. Three characters typed, three exceptions, an
unchanged document and no message. A pane that has stopped being an editor looks
exactly like a pane whose writer has stopped typing.

**And a pane made by splitting had no editing mode in it.** This is the one
worth being exact about, because "vim is missing" understates it by a category.
A pane with no vim does not decline to move the cursor; it **writes the commands
into the sefer**. The probe typed `iZAYIN` into the pane that had focus and got
`ZAYIN` — the `i` opened insert. The same keys in the pane beside it produced
`iCHET`, letter for letter. `dd` in that pane is not a deletion, it is the
letters `dd` in somebody's sefer.

A fourth was found by sweeping rather than by running: `reconfigureShortcuts`
had the same shape, so rebinding a key with the window split left the other pane
on the old binding — a shortcut list that is true of half the screen.

## The rule

A source pane is a **viewport onto shared text**. What it owns is where it is
looking: caret, scroll, folds, narrowing. Everything else — which document, the
theme, the direction, the keymap, the editing mode — belongs to the application
and must reach every pane or it is not the application's.

So `sourceViews()` exists and the four call sites use it. Not a helper for
tidiness: the reason all four were wrong the same way is that each was written
when `runtime.view` was the only view there was, and each looked correct in
isolation afterwards.

## What is not fixed, and it is filed

Returning to a document puts every pane at the focused pane's caret, because the
open set stores one state per document rather than one per pane per document. A
pane's *place* is exactly the thing a pane owns, so this is the wrong answer —
it is only a smaller wrong answer than holding a different document. It is filed
as its own item rather than left here as a comment somebody has to find.

## Why nothing caught any of it

Step 11 of the acceptance run switches documents and passes. It switches them
with one pane open. Every one of these faults needs two panes and a change of
state, and the number of panes was never a dimension the run varied — so the
steps were a straight line through a product that has a second axis.

That is now two steps of its own, and the console check is part of it: the
uncaught exception was the only evidence the writing half of this ever produced,
and an assertion about the text alone would have passed the day the crash was
reintroduced.

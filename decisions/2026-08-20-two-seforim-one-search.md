# 2026-08-20 · Two seforim, one search

> *"Search should be configurable to search the source, the preview, or both."*

The item carries its own warning, and it is the whole design:

> *"Searching the preview means matching **laid-out** text, not the source under
> a different label. In the laid-out text, words break across lines, note bodies
> print pages away from where they are written, and commands do not appear as
> text at all. Built carelessly this becomes a fake — the source search with a
> new name — which is exactly the class of defect this repository keeps
> producing."*

So the question this had to answer first was not *how do we search the preview*
but *what does the preview say*, and until today nothing in the application
could answer it.

## The engine grew a fact it did not have

`pagelines` already answers *which of the writer's lines left ink on each page*
— which is a question about the source, asked of the layout. What nothing
answered is the other direction: **what does the page say**. `pagetext.rs` is
that, and it rides on the compile for `pagelines`' reason. Asking separately
would be a full layout per question, and the layout that has just happened
already knows.

Two decisions inside it are the ones worth arguing with later.

**Reading order is walk order.** Typst lays a paragraph out in logical order and
expresses bidi as *positions*, so the frame's item order is the order the words
are read in — for Hebrew as for English. Sorting the runs by `x` reverses every
Hebrew line and sorting by `-x` reverses every English one, and both failures
are invisible to any assertion that only counts hits. The walk needs no
direction because it never asks, and there is a test in each language for the
day somebody decides it does.

**A line is a baseline *and* a neighbourhood.** Baseline alone puts a superscript
note marker on a line of its own, so `שלום1` — which is plainly what the page
shows — would be unfindable. Baseline alone also joins two parallel streams and
a side column into one sentence that never appeared anywhere, which is worse: a
missing hit is a gap, a fabricated one is a lie. So a run joins a line only if it
is also within three ems of it, which is wider than any inter-word space
justification produces and narrower than any column gutter.

## Words break across lines, so a page is one string

The item names this trap by hand. A phrase the reader sees plainly is, on the
page's own terms, the tail of one line and the head of the next, and a per-line
search finds nothing at all for it — on the surface whose entire job is finding
things.

Each page is therefore matched as one string with its lines joined by a space,
and a hit is reported against the line it **starts** on, which is where the eye
goes and where the caret belongs. A *page* and not the whole document: two
halves of a phrase on two different pages did not appear anywhere, and finding
that would be an invention rather than a convenience.

## A hit is not always a place to type

A printed hit that traces back to the writer's own text can put the caret on
itself. A running head, an auto-numbered siman and a note's marker cannot,
because the words are not in the source at all — and a row that jumped to
"somewhere near" would put the caret in the wrong sentence and look exactly like
working software. Those rows show the page and leave the caret alone.

That is also why the engine reports `line: None` for such a line rather than
naming the nearest one it can find. A guess made in Rust is a guess every client
inherits.

## The default does not move

`searchScope` ships as `source`, and under it the `find` action opens the
editor's own find panel exactly as it always has. A new scope is an option, not
a change of what happens to a writer who never opens the settings. The other two
open the find drawer, which is the only surface that can show a hit on a page.

One action and two surfaces rather than two actions: *"find"* is one thing a
writer wants, and a second chord for "find, but in the preview" would be
something to remember for a question they have already answered.

## Where the pages come from, which is the part that was nearly wrong

`renderFindPane` reads `preview.currentPageText()`. The first draft read
`runtime.lastResult?.pages_text`, and `prohibitions.test.mjs` failed it by name.

The class is stated there and this is its **third** instance: the last compile is
not the pages on screen. A failed compile is stored in `lastResult` with no pages
and no text, and the redraw is deliberately skipped so the writer keeps looking
at the last good page — from which moment the two records disagree. A find
drawer reading the failed one would announce that the phrase the writer is
looking at printed nowhere, mid keystroke, on every unbalanced bracket. The
record of what is drawn is written by drawing, in `preview.ts`, and
`currentPageText()` is now what asks it.

Worth saying plainly: the fence caught this while it was being written, which is
what a fence is for, and the reason it could is that somebody wrote the class
down rather than only the instance.

## The cost, and when it is paid

`want_text` is off unless a search that reads the page is **on screen** — the
scope is not `source` *and* the find drawer is open. A setting is not a
subscription. Opening the drawer under such a scope, or switching into one, asks
for the compile that fills it in; without that the drawer would report the
preview unavailable until some unrelated keystroke happened to trigger a layout.

## What is not here

No regular expressions, no whole-word matching, no ignore-nikud. Each is a real
want and none of them is this item; the scope chooser is what was asked for and
what the trap was about. `FindOptions` is where they go, and `caseSensitive` is
already there to show the shape.

The find drawer is classified `HOW.class` in `tools/surfaces.mjs` rather than
`HOW.chip`, with the reason written out: the chip opens it only under a
non-default scope, and the acceptance harness drives clicks and keystrokes
rather than `<select>` values. That is an honest gap in the measurement, not a
covered one, which is why it is named there and here.

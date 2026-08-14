# The pages of one siman — 14 August 2026

Narrowing gave a pane one siman and left the preview beside it showing the whole
sefer. The preview follows now, and the interesting part is not the following —
it is what had to be true for the following to be honest.

Filed when narrowing shipped, in its own decision entry, as *"a different piece
of work… it needs `reveal`, which is a full layout per question, so it has a cost
question of its own"*. This is the answer to that cost question, and the answer
turned out to be that `reveal` is the wrong instrument.

## Why not `reveal`

`reveal` says where a place in the source printed. Ask it twice — the head of the
siman and its foot — and you have the range. It is also **a full layout per
question**, and the answer is stale the moment anything above the siman is typed,
because a paragraph added to siman 1 moves every page boundary after it. That is
three layouts per pause in typing to draw one pane, on a sefer where one layout
is the thing the whole application is organised around not repeating.

The layout that has just happened already knows. Every laid-out glyph carries the
`Span` of the source it came from — the fact `jump.rs` has always leaned on — so
the answer is a walk over frames that already exist, and the walk is a fraction
of the SVG serialisation happening beside it. `engine/src/pagelines.rs` does that
walk, and the compile carries the answer back.

Behind a flag, and the flag is the third of its kind. `want_pdf` and
`want_source` each exist because a response was carrying something expensive that
almost nobody read; `want_lines` was written that way from the start rather than
after the measurement. Three positional booleans is one more than a reader can
hold — `compile_parts(body, &cfg, &assets, false, false, &have)` says nothing
about which `false` is the PDF — so they are a `Wants` struct now.

## Runs, not a range

A page reports the lines that printed on it as **contiguous runs**. That looked
like over-engineering until it was measured, and the measurement is in the test:

    page 1: [1..1, 3..4]
    page 2: [1..1, 8..8]

Line 1 is `#כותרת_עליונה[…]`, the running head. Its glyphs carry the span of the
line the writer typed it on, so **one line of the writer's text prints on every
page of the sefer**. Collapsed to a minimum and a maximum, page 2 would report
lines 1 through 8 — that is, all of them — and a pane narrowed to a siman on page
1 would show page 2 as well. It would look like it worked on a document short
enough to check by eye, and be wrong on the sefer nobody can check by eye.

So the engine records what it saw and no more. No weighting, no "the biggest run
wins", no dropping a line for being lonely: a heuristic there would be a lie the
client cannot check.

## The file a line belongs to

A sefer that includes chapters is one compile of one concatenation, so lines
10–20 of chapter two and lines 10–20 of the sefer are different text with the same
numbers. Every run carries the file it came from and the intersection compares
it.

The subtle half is *where a run is split*. Not where the numbers stop being
consecutive — where the **file** changes, and those are different rules. A sefer
whose line 12 is `#כלול[פרק א]` expands to: sefer line 11, the chapter's lines 1
to 12, sefer line 13. The chapter's last line is 12 and the sefer's next is 13:
consecutive numbers, two files. Merging on the numbers alone hands the sefer's
line 13 to the chapter, and a preview narrowed inside that chapter picks up a
page it has nothing to do with. The first version of that test used a fixture
where the two rules happened to agree, so the mutation survived and the test
proved nothing; it is written around the `#כלול` shape now.

## Hidden, not sliced

A narrowed preview keeps all its page boxes and hides the ones it is not
showing. Slicing the list is the obvious implementation and it renumbers every
page after the first one dropped — and the page number is what a click sends to
`jump`, what the page-range chooser counts in, and what the reader is reading. A
hidden box costs nothing (it never intersects the viewport, so its SVG is never
built) and needs no second coordinate system to undo.

## Said, not merely done

The strip names the siman and counts the pages: `⊡ סימן התצוגה · 2 עמודים`. A pane
showing four pages of a forty-page sefer with nothing saying why is this
repository's own recurring failure — a working mechanism behind a surface that
does not admit to it.

The empty case is what earns it. A siman that printed nowhere — a document that is
mid-keystroke and broken, a section holding nothing that leaves ink — draws no
pages, and a blank pane is what a crash looks like. It says `· עדיין לא נדפס`
instead. The temptation is to treat "no pages" as "no information, show
everything"; that produces a pane holding the whole sefer under a strip naming
one siman, which is indistinguishable from a narrowing that silently failed. The
mutation that does exactly that is in the fence.

## Two things found on the way

**`drawCurrentInto` could never draw without page names.** It was guarded on
`current?.hashes.length`, on the reasoning that a second pane reuses the
windowing and the windowing needs names — but `render` has a whole branch for
having none, and that guard meant the branch was unreachable from here. An engine
that sends no fingerprints left every second preview blank. Once a preview could
narrow it also left a *widened* one still holding the pages of a siman it was no
longer following, which is how it was found.

**The blind branch was narrowing in a second place.** `render` has two paths —
the windowed one, and the one for a webview with no `IntersectionObserver` — and
the first draft wrote `hidden=""` into the markup on one and set the property on
the other. One rule, set the same way, on both; and the test deletes the observer
so the old-webview path is actually driven rather than assumed.

## What this does not do

The compile is unchanged, which is the rule narrowing was built on and this
inherits: page numbers, note numbers and running heads still belong to the whole
sefer. A narrowed preview is a smaller opening onto the same document. The first
page of a siman still carries the tail of the one before it, and that is correct
— it is what the paper will say.

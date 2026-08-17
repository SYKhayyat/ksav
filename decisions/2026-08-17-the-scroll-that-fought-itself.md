# 2026-08-17 · The scroll that fought itself

A third sitting on 17 August, and the first one that was not about writing. The
report was *"Ksav is not usable yet"*, and the list under it was six items: a
ribbon group labelled **Heading** over the style dropdown, four complaints about
the panes, a search panel drawn over the menu that opened after it, and — marked
as the important one — *"the scroll is terrible and it stutters on the preview.
This makes the source also stutter."*

The document was `ksav-how-it-works.ksav`: 52,021 characters, 886 lines, nineteen
pages, comments throughout. Everything below was measured in the assembled
application on that document, not reasoned about.

## 1 · The stutter was three defects wearing one coat

The report said *the preview stutters, and that makes the source stutter too*.
That reads as one problem with a downstream effect. It was three, and two of them
were in the source pane, not the preview.

### The linked-scroll mirror fed itself

`main.ts` mirrored a scroll from one pane to its linked neighbour, and guarded
against the echo with a boolean set before the write and cleared after it:

    mirroring = true;
    other.scrollTop = top;
    mirroring = false;

That guard never guarded once. **Scroll events are not dispatched synchronously.**
The browser coalesces them and fires at frame time, so the flag is always back to
`false` by the time the echo arrives, and every mirrored write returns looking
exactly like a person scrolling — which mirrors back, which arrives next frame,
and so on for as long as the wheel keeps turning.

Measured: forty wheel ticks asking for 2,000 px moved the source **1,086 px**,
produced 67 scroll events, and the worst frame took **591 ms**. The reader is
fighting the mirror for control of `scrollTop`, and the mirror is winning about
half the pixels.

A flag cannot express this. The replacement says what is actually true — *this
pane is currently the one driving, and the value I wrote is the value I expect to
see come back*:

- `scrollFloor: {pane, until}` — whoever scrolls last holds the link for
  `SCROLL_FLOOR_MS` (150 ms), which is longer than the echo takes to arrive;
- `scrollWritten: Map<string, number>` — the clamped position each pane was
  written to, so an event within a pixel of it is recognised as the echo and
  dropped rather than treated as intent;
- one `requestAnimationFrame` per burst, not one write per event.

After: 2,000 px asked, **2,000 px moved**, worst frame **67 ms**.

The clamped value matters. Writing `scrollTop = 4000` to a pane whose maximum is
3,600 yields an event reporting 3,600, which does not equal what we asked for and
so reads as a person — the exact case a linked source and preview of different
heights hits on every scroll near the end of a document.

### A page was hydrated inside the observer callback

`preview.ts` windows the pages with an IntersectionObserver. The callback called
`fill()`, and `fill()` did `node.innerHTML = page` on a **358 KB** SVG. Inside
the callback. On the frame the page came into view. And again every time it came
back, because leaving emptied it.

The observer now only records intent — `near` for what the reader is beside,
`wanted` for what is beside them *and* out of date — and the drawing is drained
in `requestIdleCallback`, nearest page first. Leaving a page no longer empties
it; eviction is by cap (`KEEP_PAGES = 40`, furthest from the reader first), so
scrolling back over a page you just read costs nothing at all.

`content-visibility: auto` with `contain-intrinsic-size` on `.page` does the rest:
the browser skips layout and paint for the pages that are off screen, which is the
native version of the windowing this file has always hand-rolled. The
`.page:has(svg){aspect-ratio:auto}` rule came out, because an intrinsic size and
an auto aspect ratio disagree about how tall an unrendered page is, and the
disagreement is visible as the scrollbar jumping while you scroll.

### Typst's glyph tables are the expensive part

Even drawn at idle, one page cost **496 ms**. Typst emits every glyph once as a
`<symbol>` and then references it: this document's pages carry **2,254**
`<use xlink:href="#g123">` elements each. Blink instantiates a shadow tree per
`<use>`, and a shadow tree costs more than the `<path>` inside it — by roughly an
order of magnitude, at this count.

`flattenGlyphs` reads the symbol table into a map and rewrites each `<use>` as
the `<path>` it points at, moving `x`/`y` into a `transform` and dropping the
`<defs>` block once nothing refers to it. **496 ms → 20 ms.**

The middle option was tried and rejected: substituting `<g transform="…">` around
the path measured **384 ms**, barely better than `<use>`, because most of the cost
that is not shadow-tree instantiation is the container element carrying a
transform. Removing the indirection is not the win; removing the *element* is.
The export path in `exports.ts` applies the same function, so print and preview
receive the same SVG.

## 2 · The efficiency sweep found one more, and only at scale

Asked to check that everything else was fast, the caret was the thing that turned
up. `ksav-lang.ts` rebuilds the prose-mode decorations — the ones that reveal the
markup on the line your cursor is in — whenever the selection crosses a mark
boundary. The rebuild is a pass over the whole document, so its cost is a fact
about length: unnoticeable on this one, and **80–180 ms per arrow key** on a
520 KB sefer, which is not a dropped frame, it is five of them, per repeat.

`proseReveal` defers the rebuild: leading edge on the next animation frame,
trailing edge after 90 ms of quiet. On the same 520 KB document that is **14–30 ms
per move**. On a 52 KB one it is a wash — the rebuild was already cheap there and
the deferral has its own small cost — which is the correct shape for a fix whose
whole subject is scale.

The field's comparison had a real bug in it too, and the deferral would have made
it visible. It compared the new selection against `tr.startState.selection` — the
selection *before this transaction* — when the question is whether the marks
changed since the decorations were last **computed**. Those are the same thing
only when every transaction recomputes. The value now carries `at`, the selection
it was built for, and compares against that.

### And the deferral, written the obvious way, was wrong

This is the part worth keeping. Deferring *every* flip is a bug, and the bug does
not throw in the code that caused it.

A caret that moves **into** markup is moving into a range that is currently
`Decoration.replace`d — hidden text, with no DOM of its own. A selection there
has nowhere to be. CodeMirror's tile walker runs off the end of the tree looking
for a position to put it, and Firefox logs `parents.pop() is undefined`, once per
keypress, from inside the library. Nothing threw, nothing turned red, the writer
saw a caret sitting in text that was not on the screen, and the whole editor
suite was green over it. It was found by counting console errors in a browser,
against the same run at `HEAD` as a control — which is the only reason it is not
still there.

So the two directions are not the same and only one of them may wait:

- **Entering** is answered in the transaction that causes it, but *narrowly* —
  every decoration touching the entered span is dropped, which is what uncovering
  markup looks like, and costs a range-set update over that span rather than a
  pass over the sefer. The exact drawing arrives a frame later with the deferred
  rebuild. As a side effect the reveal is now **immediate** rather than one frame
  behind, which is what it should always have been.
- **Leaving** is the markup closing up behind the caret. Nothing depends on it
  having happened yet, so that is the half that waits — and it is where the
  saving lives, because a held arrow key runs through prose, and prose is mostly
  not commands.

`prose.test.mjs` holds it: the caret is **walked** through every document in the
corpus one position at a time, and after each step no range still hiding text may
contain it that a freshly computed state would not hide too. The first version of
that check placed two fresh states side by side instead of walking, and could not
fail for the reason it was written — placed fresh at a position, the caret is
never buried, because the state that computed the decorations already knew where
it was. Only a walk creates the gap. The rewritten check fails on the mutation
and names the document and the offset.

## 3 · The panes, which were four complaints and are one design

The four: *I can only split horizontally; I can only minimize, not close; I don't
know how to arrange more than two; I can't drag.* Taken together they say the
pane strip was not a control surface, it was two buttons.

It now carries, left to right: the pane's **number**, a split **across**, a split
**down** — both present at one pane, which is the answer to the first complaint —
a `⋯` menu, and an **`×`**. The `–` that used to be there did close the pane; it
just looked like *minimize*, and a control that lies about what it does is
indistinguishable from a missing one.

Dragging replaced the HTML5 machinery with pointer events. That machinery had
shipped earlier the same day —
[Three haaros from the writing side](2026-08-17-three-haaros-from-the-writing-side.md)
added *"four directional keys and a drag"* — and the drag half was reported
broken by the first person to reach for it, in the installed desktop app.

The code was not wrong. Tauri v2's `dragDropEnabled` defaults to **true**, and
with the native drag-and-drop handler attached, WebView2 on Windows intercepts
drag events before the page sees them: HTML5 drag-and-drop inside the webview
does not fire. `tauri.conf.json` never set the flag, so the desktop build has had
it on since the day it existed. Turning it off would fix the pane drag and
disable dropping a file onto the window, which is a worse trade — and the same
gesture on a touch screen never had an HTML5 drag to lose. Nothing caught it
either way, because nothing in this repository can test an HTML5 drag.

The replacement is pointer events —
and, more usefully, gained a second meaning. Drop **in the middle** of another
pane and the two trade places, which is what the keyboard swap has always done.
Drop **on an edge** (`DROP_EDGE`, the outer quarter) and the carried pane moves
*there*, splitting that pane along the edge you chose. Swapping is a permutation
of a fixed layout; moving changes the layout. The report's "what if it gets more
complicated?" is the second one, and no keystroke had ever offered it.

The `⋯` menu answers the same question three more ways, all of which the reply to
my questions asked for explicitly: **swap with pane *N*** by its number, **move to
an edge** by name, **move to another tab** — including a tab that does not exist
yet, which creates it — and **save this arrangement**, which puts it in the menu
under a name for every document afterwards. Tabs here are arrangements, not
documents; the open document set is global, so moving a pane between tabs moves a
view, never a file.

Two things fell out on the way. The `⋯` menu closed itself on the click that
opened it, because `panels.ts` sweeps popups on any outside click and the opening
click is outside until the popup exists. And toggling the scroll-link chip called
`setTree`, which rebuilds every editor — so linking two panes threw the reader
back to line 1 of a nineteen-page document. Neither was in the report. Both were
found by using the thing.

## 4 · The search panel, and a generated class name

Open find-and-replace, then open a dropdown: the dropdown draws *under* the
search panel, even though it was opened later.

`.cm-panels { z-index: 5 }` in `styles.css` had no effect, and the reason is
worth writing down. CodeMirror injects its base theme as `.ͼ1 .cm-panels` — a
generated scope class — which is specificity (0,2,0) against our (0,1,0), so the
library's `z-index: 300` won every time. `#app .cm-panels` is (1,1,0) and wins
without `!important`, which would have worked and would have said nothing about
why.

While in there, the twelve magic z-indexes in that file became a named scale —
`--z-editor-marks: 2` through `--z-notice: 9999` — because "the search panel is
over the dropdown" is a question you cannot answer by reading twelve numbers
scattered across a stylesheet.

## 5 · Heading, over the styles

The smallest item and the one with the shortest fix: the ribbon group above the
style dropdown was labelled with `cat.heading`, so a control offering *body,
heading 1, heading 2, quote, verse* announced itself as **Heading**. It is
`styleGroup` now — **סגנונות** / **Styles** — which is what the control is.

## What holds this

- `pagecache.test.mjs` was rewritten to the new contract, and the rewrite is the
  interesting part. My first cut both deferred the fill *and* stopped emptying,
  which broke a real invariant the file had always held: **an off-screen page is
  not redrawn just because it changed.** Thirteen tests said so, correctly. The
  `near` set exists to keep that true — a post-compile refresh only queues pages
  the reader is beside — and the cap has its own test.
- `visibility.test.mjs` and `tools/surfaces.mjs` demanded the pane menu be
  classified before it could ship, which is the fence working as designed.
- `panels.test.mjs` had hardcoded the one popup it expected Escape to skip. A
  third popup made it one short. It derives the set from the registry now.

**6,593 assertions across 96 files, green.**

## 6 · Firefox, which is what the writer actually uses

Everything above was measured in Chromium, through `/browse`. The writer uses
Firefox, and the two costs this record is mostly about — `<use>` instantiation
and `content-visibility` — are exactly the two that differ most between engines.
So it was run there too, with a Playwright Firefox (153) driving the same
document, and against a `git worktree` at `HEAD` on a second dev server as the
control. That control is what turned a performance check into a bug report; a
one-sided run would have shown a green board.

| | Firefox |
|---|---|
| `content-visibility`, `contain-intrinsic-size`, `requestIdleCallback`, `elementsFromPoint` | all supported |
| glyphs on a drawn page | 0 `<use>`, 0 `<symbol>`, 2,216 `<path>` — flattening is engine-independent, being string work |
| linked scroll | 2,000 px asked, 2,000 px moved, 32 events, one frame over 33 ms |
| reaching an undrawn page | drawn 46–74 ms later, worst frame 28 ms, **no** frame over 33 ms |
| scrolling back over pages already read | nothing redrawn, worst frame 17 ms |
| the pane strip | number, `◫`, `⊟`, `⋯`, `×`, each with its Hebrew title |

One thing to note rather than fix: seeding a document into Firefox for a test
needs a fresh context and an init script, because `indexedDB.databases()` does
not exist there. Deleting the library "by enumerating it" silently enumerates
nothing, and the app opens its own starter instead — which reads exactly like a
seeding bug in the test and is a missing API in the browser.

## What is still open

Nothing from this list. The one measurement that stays uncomfortable is 14–30 ms
per caret move on a 520 KB document: three to six times better than it was, and
still not one frame. The remaining cost is CodeMirror's own redraw rather than
our pass, which is a different piece of work from this one.

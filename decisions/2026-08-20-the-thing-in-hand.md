# 2026-08-20 · The thing in hand, and the surfaces that would not say

Seven reports from the same wave. They look unrelated and they are not: every
one of them is a mechanism that works behind a surface that will not answer a
question about it. That sentence is the handoff's own description of how this
repository fails, and it is quoted here because all seven were found by asking
it rather than by reading the code.

## #32 · Selecting and removing a whole construct

> *"Deleting a construct currently means hand-deleting a command name, its
> parentheses, its brackets and its arguments. It is confusing and easy to get
> wrong, leaving unbalanced delimiters that then fail to compile."*

The second sentence is the sharp end. Losing a note is a mistake a writer sees;
leaving `#הערה(ערוץ: "ביאור")[` behind stops the sefer compiling, and the writer
is then reading a diagnostic about a bracket instead of the sentence they were
writing.

`spans.ts` has known where every construct starts and ends since it was written,
and `stackAt` has returned the whole nest around a position. So `entity.ts` is
forty lines over `Node` and no parser: **select** (widening on each press),
**unwrap** (the wrapper goes, the words stay — the default, because in a sefer
the words inside a construct are almost always the writer's own), and **remove**.

Generic over `Node` rather than over a list of command names, deliberately: a
list would have been the fourth in this repository and the one missing whichever
construct the writer was standing in. The two refusals are stated rather than
best-effort — a construct with no body has nothing to keep, and
`#סימן("א", […])` carries the siman *number* as an argument, so unwrapping to
the body would silently drop the writer's text. That is the rule `headings.ts`
already applies to a heading whose level the prelude fixes.

## #27 · Folding to a depth

Fold-to-a-level already existed for headings, at levels 1, 2 and 3 — which was
the count of *keys somebody had bound*, quietly become the count of depths the
product could fold to. It offers every level now, counted off `MAX_LEVEL`.

Simanim needed nothing: `#סימן` is `heading(level: 1, …)`, so the heading levels
already reach them. Lists needed their own, because a list's depth is its own
and no surface could ask about it. Depth among **lists** and not among calls: a
list inside a footnote inside a heading is still a top-level list to the reader,
and counting the wrappers would fold it as though it were three deep.

## #21 · Three list panes that would not say which was which

> *"The marks pane reads as a second siman/seif outline and gives no indication
> of what it actually lists."*

It did read that way: three drawers on the same edge, each a list of Hebrew
phrases with a chip, and only a heading to tell them apart — and "Marks" is not
a word that explains itself.

All three get a sentence, and that is the fix rather than an extra. Labelling
only the pane that was reported leaves it beside two unlabelled panes it is
confused with; the confusion is *between* them. The marks pane's sentence names
the outline it is not, because a description that could equally describe its
neighbour is not a distinction.

## #25 · Manual compile, and a preview that admits it

A third value on `previewDelay`. The mode is trivial; the report's second
sentence is the feature: *"the preview must clearly say when it is stale,
otherwise the mode is a way to look at an old page and believe it is current."*

So the staleness is set inside `scheduleCompile`, at the moment it declines to
lay the sefer out — part of the mechanism rather than something a shell might
forget — and the banner is drawn on the page it is about, with the way out on
it. `compileNow` is bound under every setting, not only `manual`: "compile now"
in the middle of a relaxed wait is a thing writers press, and a control that
exists only under one setting is one nobody learns.

## #23 · What a history costs

`MAX_SNAPSHOTS = 50` and `MAX_HISTORY_BYTES = 2MB` were judgement calls written
as constants, and both are settings now with those values as their defaults.
Clamped in `docs.historyLimits` rather than in the row that sets them, because
what a sane ceiling is belongs to the feature.

The two problems the item names beyond configurability are the real ones.
Snapshots hold whole document bodies rather than diffs, so **the biggest seforim
hit the byte ceiling first and end up with the fewest restore points** — and the
only evidence of that was restore points quietly not being there. The history
now says what it costs, says *why* a big sefer keeps fewer, and offers a way to
stop paying it. A number a writer can see with no way to act on it is a
complaint, not a control.

## #9 · Through the grid

`Tab` walks the cells in the order they are written, which is the order a table
is filled in. It is not the order one is read: a writer checking the third
column of every row is moving down a column, and following the sequence costs a
keystroke per column.

`stepGrid` walks the **geometry** and not arithmetic on cell indices, and two
existing fences proved why within minutes of the first draft. A merged cell is
one placement across three columns, so `col + 1` was still the same cell and the
caret did not move — caught by *"never leaves the caret where it was"*. And a
ragged last row is padded to a rectangle by `geometry`, so stepping against the
unpadded layout landed on a placement whose cell was never in the source and put
the caret inside `#טבלה(`'s arguments — caught by *"no operation leaves the
caret outside the body it was in"*.

The two column actions are **startward** and **endward**, not left and right.
Which arrow means "the next column" depends on the direction the sefer is set in
— in a Hebrew table column 0 is the rightmost — and the registry has never seen
a document. The shell binds the arrows, because the shell knows the direction.
Getting that backwards is not a preference: it is a table that navigates
backwards for half the seforim in the product, and it would look exactly like
working software to whoever wrote it in the other language.

## #5 · The scroll sync

> *"Direction-aware anchor: scrolling down should match top-to-top, scrolling up
> should match bottom-to-bottom."*

Which is what reading wants and what no fixed anchor can give. Going down, the
line the reader cares about is the one arriving at the **top**; coming back it
is the one arriving at the **bottom**. A fixed middle is wrong in both
directions by half a viewport, and it shipped as the default. `direction` is the
default now; the three fixed answers stay, because a writer who wants the line
they are on pinned to one place while they read wants exactly that.

The dead zone is a setting because a trackpad emits an event for a two-pixel
drift, and following one is a preview that shivers under a resting hand. It is
read **before** the floor is claimed — otherwise a shiver would lock the other
pane out for the length of the floor while following nothing itself.

**Estimate while moving, exact when it settles.** The follow reads
`scrollmap.ts`'s printed map, which is a line-height model: continuous, free,
and an estimate — a page break, a note band or a fold moves the real answer away
from it, and the error accumulates down a long sefer. The exact answer is the
compiler's, and asking it per scroll event would be a layout per frame. So the
estimate lands immediately and the settle follows `syncSettleMs` after the last
movement: one layout per gesture. A gesture that starts while the compiler is
thinking wins, because a preview that jumps a second after you have moved on is
worse than one that is a few pixels out.

Both rules live in `scrollmap.ts` rather than in the shell — `anchorFor` and
`worthFollowing` — because they are rules and not renderings, and because the
first of them was a line of nested ternaries inside `matchFraction`, which is
exactly the shape a fourth answer gets added to wrongly.

## What was loosened, and why

`hydra.test.mjs` asserted *"all but two"* of the table hydra's keys are drawn
from their operation's own name. That is a statement about a hydra of twenty
rather than about the assignment: a longer list has exhausted more of its own
letters by the end, so four new operations pushed a bound that was never about
them. Growing the slack every time the list grows is a fence that reports
nothing, so it asserts what a writer actually meets instead — the first twelve
keys are mnemonic, everything has a key, and no two share one. None of those
move when the list grows.

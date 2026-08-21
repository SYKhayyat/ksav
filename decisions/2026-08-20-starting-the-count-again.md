# 2026-08-20 · Starting the count again, and the list at the foot of the file

Three reports. Two of them end with the same sentence, which is why the handoff
says to build them on one mechanism and why they are one section here.

## #36 and #13 · One mechanism, two things being counted

> *"Note numbering should be restartable rather than running unbroken through a
> whole sefer — most importantly in the endnote section, where per-chapter
> numbering is the normal convention. Wanted: automatic restart at a chosen
> structural level, plus explicit restart and explicit continue commands the
> writer can place by hand."*

> *"Restart the count automatically by nesting level, plus explicit restart
> *and* explicit continue commands so an automatic rule can be overridden
> locally."*

One vocabulary, therefore: `#הגדרות_מספור(אפס_לפי: N)` says at which heading
level a count starts again, `#התחל_מספור()` starts one again here, and
`#המשך_מספור()` carries one on through the restart above it. The prelude reads
all three for the **notes**; `numbering.ts` reads all three for the **numerals a
siman carries in the source**. What differs is only what is being counted, and a
writer who has learnt "start the count again here" has learnt it once.

### Why it is a marker and not a counter

A note's number in Ksav is a **query** — how many notes lie before this one —
and has been since counters were found not to converge under page breaking. You
cannot restart a query by setting something to zero; you restart it by moving
where the counting *starts*. So every restart point drops a marker, `_nr_origin`
answers "which marker governs this spot", and the count is taken `.after()` it.
Nothing is stored, nothing has to converge, and the answer is the same on every
layout pass.

Every heading emits an `("auto", level)` marker unconditionally and whether it
restarts anything is decided against `אפס_לפי` when the origin is computed. That
way changing the setting changes the answer without the markers having to be
re-emitted, and a document with the setting off pays one metadata element per
heading — nothing beside the query it already runs per note.

### `continue` means carry on, not start over

It restores the origin that was in force *before* the restart immediately in
front of it. Clearing the origin altogether would mean that a `#המשך_מספור` in
chapter four counted from the beginning of the sefer, which is not what the word
says. One value and one previous value, which is exactly enough — a deeper
history would be a stack whose behaviour nobody can predict from reading the
source.

### The half that would have been missed

An apparatus numbers **twice**: the marker in the sefer is a query, and the
entry in the band is numbered by walking the collected list. Those two
disagreeing is the defect immediately before this one (#31), and it looks like
working software from either side alone.

The first attempt restarted the markers and nothing else — the sefer read ¹ ² ¹
while the endnote section read 1. 2. 3., and every assertion written against the
band would have passed. The endnote section is printed as Typst `enum`s, which
is right (the numbering scheme, the gap and the hanging indent are all `enum`'s)
and an `enum` counts from one — so a restart there is a *second* `enum`, and the
whole of restarting an endnote section is deciding where to cut. `renumbering.rs`
asserts both halves of every case, off the printed page.

### Two costs, and where they were refused

`_nr_any` is a **state** read and not a query, and that is load-bearing rather
than tidy. Everything downstream has to ask "does anything restart here" before
it can decide how to number, and asking it as a query would be one query per
note in every document ever written — which is precisely the Θ(n²) the comment
above `_ap_entries` says was this apparatus's performance defect. The cheap
guard is also what lets the default channel keep Typst's own balanced footnote
counter: it moves onto the query path only in a document that actually restarts
something.

`#הגדרות_מספור` validates its arguments **at the call** and not inside the state
update. A state's update closure runs only when something reads the state, so a
document that restarts nothing would never run it — and a misspelt knob would
compile, print the old numbering, and give the writer no way to tell a typo from
a feature that does not work.

### What the editor renumbers, and what it refuses to

> *"Renumber automatically on delete and on move, and report that it happened
> (configurable; default is to report)."*

The insertion path has renumbered since the day `continueSeries` was written.
Delete and move are not insertions and have no moment where this application is
asked a question — a writer deletes a siman by selecting it and pressing a key,
and drags one by cut and paste. So the **document** is watched rather than the
gesture, which is also the honest shape for a sefer opened from a file, edited
by somebody else, or merged.

Two refusals, both about not fighting the writer: a selection covering a number
about to be rewritten is an edit in progress, and a caret inside one of those
numerals is somebody typing it — the one case where the document is out of order
*on purpose*, for as long as it takes to finish the word. The wait is a full
second for the same reason.

And it says so. Software that rewrites the writer's own characters and says
nothing is software the writer cannot trust, however right it is. Both halves
are settings, and they are two settings rather than one: whether to rewrite and
whether to announce it are different questions.

A siman is itself a heading at level 1, so the restart rule skips headings that
are members of the series being counted. Without that, `אפס_לפי: 1` would have
every siman restart the siman count and the sefer would read א׳ א׳ א׳ — which is
the bug `continueSeries` was written to end, arriving from the other direction.

**A known seam**: the editor's model of a heading is Ksav's heading commands
(`#כותרת1`, `#h1`, `#סימן`). The prelude restarts on *any* Typst heading,
including a raw `= chapter` written by hand. Nothing else in the editor models
markup headings either, so this is the existing boundary rather than a new one —
but it is a place the two halves can disagree, and it is written down here
rather than discovered later.

## #35 · One block per apparatus at the foot of the file

> *"Deferred bodies for footnotes and endnotes are interleaved in one run, which
> is confusing to read and to edit. Add an option to keep each apparatus's
> bodies in its own block, with a heading or separator. This must hold together
> with the existing rule that deferred bodies are filed in reading order… The
> insertion logic must know about the grouping too, or the setting is true only
> until the writer adds a note."*

Grouping is a **first** sort key, not a replacement: within each block the
bodies are still in the order a reader meets their markers. The blocks
themselves are in reading order too — the apparatus whose first marker appears
first comes first — because there is no natural precedence between a footnote
and an endnote, and a fixed order would shuffle somebody's file for a reason
nobody can see on the page.

The separator is a **comment**. It has to name the block, print nothing, and
survive being written again; a heading would print, and `#גופי_הערות` is an
engine construct with meaning. A comment is the only thing in this language
addressed to the person reading the source and to nobody else, which is exactly
what this is. It is stripped before every re-sort, so the tidy is idempotent and
turning the option off takes the headings away with their own lines.

The item's last sentence is the half that makes the option true tomorrow, and it
is built: `neighbours` takes the block as its first key and reading order as its
second — the *same two keys in the same order* as the sort — so a body filed
after the tidy lands inside its own block, including when that block has nothing
in it yet. Every path that files a body asks the setting; `deferred.ts` still
imports none, and `deferred-lint.ts` reads it once and hands it down.

**It found a latent bug.** `fileNewBody`'s "this is the first body" branch
inserted at the *preceding newline* rather than at a line start, which appends
the entry to whatever is on the line above. That was harmless while the line
above was always blank, and stopped being harmless the moment a separator could
be there: the body landed inside a comment, where the scanner rightly could not
see it, and the note simply had no prose. It was wrong before the grouping
existed; the grouping is what made it visible.

## What is deliberately not here

A `#המשך_מספור` that restores more than one level of history. A restart level
for the *bands* separately from the notes. A block order the writer chooses.
Each is a real want and none of them is any of these three items; the shapes
they would go in — `_nr_defaults`, `apparatusOrder` — are named here so the next
sitting does not have to find them.

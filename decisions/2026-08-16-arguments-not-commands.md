# Five commands that were arguments, and the identity function they hid behind

*16 August 2026.*

Found the same way as [the diagnostics record](2026-08-16-where-the-trouble-is.md)
— by writing a sefer by hand — and the finding is the shape of the language
rather than a defect in one command.

Five commands in Ksav mean nothing on their own:

| command | is one | of |
|---|---|---|
| `#פריט` | entry | `#רשימה`, `#ממוספרת`, `#ממוספרת_עברית` |
| `#הגדרה` | row | `#רשימת_הגדרות` |
| `#תא` | cell | `#טבלה` |
| `#כותרת_תא` | header cell | `#טבלה` |
| `#מיזוג` | merged cell | `#טבלה` |

The structure lives entirely in the parent, which takes its children as
**positional arguments** and hands them to Typst's `list` / `table` / `terms`.
One positional argument in, one bullet or one cell out. So the commas and the
parentheses were the whole mechanism, and two of the five —

```typst
#let פריט(body) = body
#let תא(body) = body
```

— were the identity function, decoration around the punctuation that was doing
the work.

## What that cost

```typst
#רשימה(פריט[א], פריט[ב])      two bullets — the shape every toolbar writes
#רשימה[#פריט[א] #פריט[ב]]      ONE bullet, both words inside it
#פריט[א]                       body text, no bullet, and no complaint
```

The second is what a writer types coming from Typst, where `#list[…]` is
idiomatic. It compiled, it rendered, and it silently collapsed the list into one
item. The third printed the word and said nothing at all.

**Nothing in the product writes the wrong form.** The toolbar inserts
`#רשימה(\n  פריט[|],\n)`, the docx importer emits the same shape, and the list
ribbon parses it. Every automated path was correct; only the hand-typed one was
on its own — which is why no test could have caught this and why writing in the
thing is the only way it was ever going to surface.

## The decision

Liberal where the intent is unambiguous, loud where it is not. Four changes, and
the four together are the whole of it.

### 1. The mark, and why it is not a show rule

A child now returns three things in a row: a `metadata` carrying its kind and
its real body, a red badge naming itself, and the body.

```typst
#let _kd(kind, body) = [#metadata((ksav_child: kind, גוף: body))#_kd_stray(kind)#body]
```

Two consequences, and they are the design:

- **A parent that consumes it takes `.גוף` off the mark** and drops the rest, so
  the badge exists only in a document where nobody consumed it. Correct usage
  renders exactly as it always did.
- **A parent can find the marks inside a content block**, so the bracket form is
  no longer a silent collapse — it lays out the list the writer obviously meant.

The body is read out of the mark rather than sliced off the front of the
sequence, so no index can be wrong and leak a badge into a consumed child.

The first design was a document-level `#show metadata:` rule that turned any
surviving mark into the badge. It works — it was built and measured. It was
thrown away because this prelude runs its **entire apparatus** on `metadata` +
`query` + convergence: a note re-emits its metadata on every layout pass and the
footer counts on the introspection settling. Putting a show rule over every
metadata element in the document, to catch a case the mark can announce by
itself, is a hand on exactly that machinery for no gain.

A stray also keeps printing its body. A badge beside the words is a writer
noticing; a badge instead of them is a writer losing a paragraph, which is a
worse bug than the one being fixed — the identity function at least printed the
text.

### 2. One list, and it is load-bearing

```typst
#let _kd_parents = (
  "פריט": ("רשימה", "ממוספרת", "ממוספרת_עברית"),
  "הגדרה": ("רשימת_הגדרות",),
  "תא": ("טבלה",),
  "כותרת_תא": ("טבלה",),
  "מיזוג": ("טבלה",),
)
```

`_kd_items` reads it to decide whether a child gets the badge, so it is not a
comment that can drift. `app/tools/emit-engine.mjs` generates the editor's copy
(`STRUCTURAL_CHILDREN`), which is what lets `mode.ts` grey a `#תא` button outside
a table without a second list saying the same thing in TypeScript.

A child in the *wrong* parent is consumed anyway — the rest of the list keeps its
shape — and wears the badge.

### 3. The gate, and the rule that was almost wrong

`legalAt` greys a structural child written anywhere but inside its parent. The
first version asked "is a list anywhere on the frame stack", which is wrong in
exactly the position a writer is most likely to be standing in:

```typst
#רשימה(פריט[ראשון #פריט[]כאן], פריט[שני])
```

That inner `#פריט` is inside an *item's body*. It is not a positional argument of
the list, the engine badges it, and the gate offered it. The rule is the
**innermost** frame, not any frame: a child is an argument of its parent, so one
frame is the whole question.

This was not spotted by reading. `insertion.rs`'s grid compiles what the chrome
offers at ~900 caret positions in two languages, and it now reads the laid-out
page for the badge as well as for a compile error — it had ten of these on the
first run.

### 4. The lint, and the offer

Two entries on the existing lint surface:

- **An orphan is an error**, marked where it was typed. The engine's badge says
  it where the *page* is; for a mistake made while typing that is not the same
  thing. No quick fix: the writer may have meant to open a list around it or to
  have typed something else, and a fix that guesses wrong on a structural command
  is worse than none.
- **A bracket-form list is an offer, not an error.** It prints correctly, so
  calling it an error is how a writer learns to ignore the gutter. But
  `lists.ts` operates only on the argument form — every operation in it writes
  into the argument list — so the ribbon is grey until the list is converted, and
  the lint offers the one click that converts it. Recognising the bracket form
  far enough to enable the ribbon, without teaching six operations a second
  syntax, would turn a list that renders correctly into one the ribbon corrupts
  on the first click.

## What this changed that was already decided

`#מיזוג` was the one member of the five that `legalAt` already guarded, and both
halves of that rule were wrong in opposite directions.

It refused a merge anywhere in a table's argument list, on the argument that a
merged cell spliced between two existing cells overflows the row. It allowed one
inside a cell body, on the note that the raw command is *"for writing a merge
into a cell you are composing, so that is where it stays offered."*

- A merge inside a cell body does nothing. `#מיזוג` is a `table.cell(colspan:)`;
  nested in another cell's content it is not a cell of anything. A writer turns a
  cell into a merge by replacing `תא[…]` with `מיזוג(2)[…]`.
- The argument list is the only place it works.
  `#טבלה(עמודות: 2, מיזוג(2)[רחב], תא[א], תא[ב])` is correct and lays out.

So the command was **offered nowhere at all**: refused throughout the one
position where it is valid, offered in the one position where it does nothing.
The refusal is now narrowed to what it always described — a cell already before
the caret and another already after it, in this table. Appending a merge, or
writing one into an empty table, is a writer composing a row and is allowed.

## The guard

`children.rs`'s `a_consumed_child_leaves_nothing_behind` compiles every correct
spelling in the language and asserts the page is clean. The whole design rests on
the mark being removed exactly, and the failure mode if it is not is a red box in
every list, table and definition list ever written — which would pass every other
test in this file.

The second guard is `insertion.rs`'s
`every_offered_insertion_lands_somewhere_it_belongs`: ~900 positions where the
chrome and the engine have to reach the same verdict, decided on both sides from
`_kd_parents`. Before it there was no test that could have noticed them
disagreeing — compiling was the only question the grid knew how to ask, and for
these five commands compiling was never the bar.

## The one that was worse, and was found on the way

The bracket form is not only second-class in the ribbon. `interchange.ts` — the
one walker behind the Markdown, Org, plain-text and docx exports — walked a
list's **first body only**, with `listKind` set, which suppresses every character
that is not inside an item. That suppression is right: the commas and indentation
between `פריט[…]` calls are punctuation of the source, not of the document, and
they used to arrive in the export as a line beginning `, - ב`.

Put together with a single body, it meant this:

```
#רשימה[א][ב]   →   ""
```

Two bodies, no item command, two perfectly good bullets on the page — and the
export was the empty string. The second body was never visited; the first had its
text suppressed for not being in an item. `#טבלה(עמודות: 2)[א][ב]` did the same
and vanished entirely, from the same cause: no `#תא` node to find, so no cells,
so no table.

Silent loss of the writer's words, in the one direction where nothing on the page
can show it. Both now walk every group, and a group with no child command in it is
one item or one cell; a list is numbered one to *n* across the whole list rather
than per body, which a walk-per-body could not do because its counter is local to
the call. `markdown.test.mjs` asserts all three list spellings produce the same
Markdown and both table spellings the same table.

## What is not decided here

Whether `#פריט` outside a list should **refuse to compile** rather than badge.
It cannot, as things stand: `#פריט[א]` is evaluated to content before `#רשימה`
is ever called, so a state flag set by the parent cannot be read by the child —
the child has already run. Typst has no "am I inside a call". The badge is what
is available, and the lint is what makes it precise.

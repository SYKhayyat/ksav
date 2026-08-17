# What a newline does

**17 August 2026.** Two asks, both of them phrased as *"maybe we have them"*: a
new page, and a new paragraph without needing two lines. Both existed. Neither
could be found, and finding out which of those two sentences is true is the whole
of this record.

## The state before

| | Command | Key | Named row |
|---|---|---|---|
| Hidden line break | — (a comment pair) | `Ctrl+Alt+/` | yes, without its key |
| Line break | `#מעבר_שורה` | none | no |
| Paragraph break | `#מעבר_פסקה` | `Ctrl+Alt+Enter` | yes, without its key |
| Column break | `#מעבר_טור` | none | no |
| Page break | `#מעבר_עמוד` | none | no |

Every one of the five compiled and did exactly what it says. Two of them were
reachable only **by name**, from the registry section at the bottom of the Insert
menu — which is to say reachable by somebody who already knew Ksav had them. The
two with keys sat in a named row that printed neither, twenty lines above three
rows that print theirs.

So the report *"maybe we have them"* is the finding. Nothing was broken; the
product could not say what it had.

## The rule underneath all five

A single newline in the source is a **space** on the page. That is Typst's rule,
it is right — a paragraph wrapped across four lines is one paragraph — and it is
the single thing about writing here that surprises everybody arriving from Word,
because it means the shortest way to any visible break is *two* lines.

Which makes these five one question asked five ways: **what does this newline do
on the page?** Nothing at all, a line, a paragraph, a column, a page. That is the
order they are listed in now, and the reason they are listed together.

## `Ctrl+Enter`, and a comment that was wrong

Word's page break is `Ctrl+Enter`. Ksav had given that combination to
`list.paraInItem` — a second paragraph under one number — on this reasoning,
written in `bindings.ts`:

> Word puts nothing here because Word has no third reading; `Ctrl+Enter` is free
> and adjacent.

The first clause is true. The second does not follow, and it is the error worth
naming: the question asked was *what does Word do with this combination inside a
list*, and the answer to that is genuinely nothing. Word binds it **globally**.
Checking the narrow case found free a combination that is not.

Put to the user, who chose to leave it alone: the paragraph-under-one-number key
is one writers already have, and moving it to hand `Ctrl+Enter` to a page break
would take a working key away to give a new one. The page break took
`Ctrl+Shift+Enter`, the free neighbour.

The cost is real and is recorded rather than smoothed over: a writer arriving
from Word presses `Ctrl+Enter` outside a list and still gets nothing. If page
breaks turn out to be the commoner ask, that is the argument to reopen.

## The family is a list, and the list is checked

Writing five rows out by hand is how the two doorless breaks arrived in the first
place — *a hand-kept list is the thing that goes stale*, which this repository has
paid for in a byte-compile step, a generator registry and a workflow matrix
already.

So `actions.BREAKS` is the family, `BREAK_COMMAND` is what each one inserts,
`BREAK_GLYPH` is what each row is drawn with, and `actions.test.mjs` holds all
three against the engine: **every command in the registry whose name begins
`מעבר_` must have a door**, every door must name a command the engine still
defines, and every member must have a glyph and both a name and a lede in both
languages. A sixth break added to the prelude is a failing test naming the
command, rather than a row nobody remembered to write.

Mutation-tested in both directions. Dropping the column break from
`BREAK_COMMAND` — which is the state this was in an hour earlier — goes red
twice, naming `מעבר_טור` from the engine's side and `columnBreak` from the list's.
Dropping one English lede names `columnBreak`.

Two of the five are in `ACTION_COMMAND` now rather than hand-written in `main.ts`,
which is what makes the registry row for each print the key that also runs it. The
other three are deliberately not: the invariant there is that an id in that table
has a shipped binding, and `actions.test.mjs` asserts it. A break with a row and
no key is a legitimate thing to be; an entry in that table with no key is the
drift the table exists to prevent.

## Run, not merely tested

The menu rows are built in `main.ts`, which no test can import, so the fences
above prove the *tables* and nothing about what is on screen. Driven in the real
application:

- all five rows render, in order, each with its glyph, its name, its lede, and its
  key where it has one — `Ctrl+Alt+/`, `Ctrl+Alt+Enter`, `Ctrl+Shift+Enter`;
- clicking the page-break row inserts `#מעבר_עמוד` at the caret;
- `Ctrl+Shift+Enter` in a Hebrew document writes `#מעבר_עמוד` and in an English
  one writes `#pbreak`, which is the insertion path translating for the
  *document's* language rather than the interface's;
- `Ctrl+Alt+Enter` writes `#מעבר_פסקה`;
- and a document carrying a page break compiles to two pages in 17 ms.

That pass is also what caught the one real bug in this chunk. The named rows were
built without a legality check, twenty lines above the registry rows that have
one — and `#מעבר_עמוד` inside a table or a note body does not break the page, it
**fails to compile**, which `engine/tests/containers.rs` already asserts. A menu
that offers an insertion the grid knows is broken is precisely the family this
repository counted 384 instances of. The rows read `legalAt` now, on the same
caret as every other row in the menu: greyed inside a table, with its reason
underneath, enabled in prose.

## What this cost the counts

Seventy-nine bindings rather than seventy-eight, in two living pages; the shortcut
card regenerated from `bindings.ts`; and the editor suite's assertion count moved
twice before it settled, which is the lesson about fixing counts last, obeyed
after being disobeyed once.

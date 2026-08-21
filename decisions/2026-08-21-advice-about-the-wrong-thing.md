# 2026-08-21 · Advice about the wrong thing

`NOTES-PLAN` Part 5's last bug, and it is one sentence long:

> `diagnostics.rs:930` maps a Typst error to *"Invalid syntax here — check
> brackets, commas."* The error I triggered was a wrongly-shaped dictionary; no
> bracket was missing. The sibling message is precise: *"no parameter called `x`
> — check the spelling."* Wrong name gets a real answer; wrong value sends you
> hunting.

## What Typst was actually saying

Four malformed documents through the real engine, and the raw messages are
**precise in every one of them**, in a shape the mapping had no branch for:

| what a writer typed | Typst says | what they were told |
|---|---|---|
| `#אזור("שער", מיקום: "רגל" גובה: 3cm)` | `expected comma` | check brackets, commas |
| `#הערה(ערוץ: )[גוף]` | `expected expression` | check brackets, commas |
| `#הגדרות_כותרות(גודל: (1.4em 1.2em))` | `expected comma` | check brackets, commas |
| `#מסמך(שוליים: )[שלום]` | `expected expression` | check brackets, commas |

Neither has a *found* and neither has a type, so both fell past the
`expects X, was given Y` branch and landed in the catch-all. The brackets were
fine in all four.

They now say what is missing — *"there is a comma missing between two
arguments"*, *"something has no value here — a name and a colon with nothing
after them"* — in both languages, like every other message in that file.

## The table is closed on purpose

An `expected X` whose `X` is not in the table **falls through to the generic
branch** rather than being half-translated into "X is missing". That is the
decision, and it is the opposite of the obvious one: a wrong specific answer is
worse than a vague one, because the writer acts on it. The vague sentence at
least sends them to read their own line.

## Two things that made this findable at all

`probe` prints Typst's raw sentence beside the translation now. An instrument
that shows only what the writer reads cannot tell you **why** a message came out
generic, which is the one question it gets used for here — and the whole finding
was one `raw:` line away the entire time.

And the fence is `diagnostics_corpus.rs`, which is built the right way round: it
is a list of documents that really do not compile, and adding one the rephraser
has no family for turns it red. Both new cases went in as documents, not as
strings — *"a comma left out between two arguments"* and *"an argument named and
then left empty"*, which are things somebody typing a sefer does.

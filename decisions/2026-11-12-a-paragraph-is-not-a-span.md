# A paragraph is not a span — #175

**2026-11-12.** The fix for #175: the three alignment buttons wrote an empty
`#מרכז[]` into the middle of a word, and took the paragraph's existing alignment
away. The record is the reasoning; the mechanism is `app/src/alignment.ts` plus
four lines in `insert.plan`. The fences are `app/test/align.test.mjs`.

## What the buttons were

`ribbon.ts` built the three of them with the same helper as **B**/**I**/**U** —
`b(he, glyph)` → `insertSnippet(c.insert)` — so a press spliced the registry's
`#מרכז[|]` at the caret. `insert.plan` has no case for that snippet, and its
generic answer is *splice it at `[sel.from, sel.to)`*. Five rows measured in a
running app, and every one of them produced something a writer would call broken:

| line | caret | what appeared |
|---|---|---|
| `#ימין[שלום]` | line start | `#מרכז[]שלום` |
| `#ימין[שלום]` | mid-word | `שלום#מרכז[]` |
| `#ימין[שלום]` | line end | `#ימין[שלום#מרכז[]]` |
| `שלום עולם` | mid-word | `של#מרכז[]ום עולם` |
| `#מרכז[שלום]` | inside | `שלום#מרכז[]` |

**In four of the five, the alignment the paragraph already had was gone.** The
button that says *centre this paragraph* did the one thing that cannot centre
anything: it wrote a zero-length span.

## The mistake, named

The registry entry is `cmd!("מרכז", "center_", "align", …)`: one row in a table
whose every other row *is* a span — bold, italic, underline, highlight, colour.
`insert.plan` treats the registry as a list of strings to splice, which is true of
thirty-eight of them and false of the alignment three. The category was in the
engine the whole time (`"align"`); nothing in the editor read it.

So the fix is not "special-case the button". It is that `insert.plan` now answers
a third kind of question, the one `lists.makeList` already answers for the bullet
button: **this command is about the paragraph the caret is in, not about the
characters at the caret**, and the answer is a whole-document rewrite.

## What a press means now

Word's answer, because that is the muscle memory of everyone who will press it:

- **no selection** — the paragraph the caret is in, which is the blank-line run
  of lines (`focus.paragraphIn`'s definition, held to `focus.paragraphAt` by a
  corpus in the fence);
- **a selection** — every paragraph it touches, each one aligned on its own, so
  each stays independently toggleable afterwards;
- **the edge it already has** — pressing it again takes it off;
- **a different edge** — the name in place is replaced. No paragraph ever
  collects two alignments, and no press ever loses one.

The one deliberate exception is a **blank** paragraph: there is nothing to align,
so the press still splices `#מרכז[|]` and puts the caret between the brackets.
That is how a centred paragraph is started, and it is the only empty call the
editor can now produce.

## Why a rewrite and not a splice

Every answer changes text outside the selection: the wrapper's name sits *before*
the caret and its closing `]` after it, and a toggle removes both. `Insertion`
already had a `rewrite` kind for exactly this shape of edit (`lists.makeList`),
so the shell gained no branch — `insertSnippet` performs it with `editDoc`, which
is one transaction and therefore one undo.

## What shows the state

A word processor shows the paragraph's alignment the way it shows bold: pressed.
`ribbon.refreshAlignState` fills `aria-pressed` from `alignment.edgeAt` on every
caret move, from `contextbar.updateContextBar` — the hook that already exists for
"the caret moved and something on screen describes it". Read off the document
rather than remembered, because the writer can edit `#ימין[…]` by hand and a
remembered value would then be a control lying about the file.

## The fences, and the mutants that killed them

`align.test.mjs` carries the five measured rows, both spellings, the selection
and multi-paragraph cases, a code-mode refusal, and the class: a sweep over
documents × positions × all six names asserting that **no press produces an empty
alignment call**, naming the one that did.

Two mutants, both red and both naming instances:

1. `insert.plan` no longer calls `alignPlan` (the pre-fix splice) — **403 red**,
   starting with *"caret at the line start retargets in place"*.
2. A retarget that appends instead of replacing — 4 red, naming *"caret at the
   line start retargets in place"* and *"…and the other edge retargets"*.

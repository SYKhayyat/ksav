# 2026-08-21 · The community already answered this, and one thing not to copy

Notes from reading two Typst packages and a forum thread against what Ksav does.
Most of it confirms the architecture rather than changing it, which is worth
writing down on its own — an architecture nobody else arrived at independently is
a warning sign, and this one has been arrived at twice.

## Run-in is impossible natively, and everyone works around it the same way

`runin.ksav` and `runin2.ksav` record that running an apparatus in — one
paragraph rather than one line per note — cannot be done with Typst's native
footnote rendering. The forum thread *"How to create Running footnotes"* has two
answers and **both agree**, and both work around it exactly as Ksav does:
collapse the native entry and draw the apparatus yourself in the page footer.

Our `[X]` was right, and it is the community's answer as well as ours.

## The incantation, which is the switch between the two regimes

```typst
#show footnote.entry: none
#set footnote.entry(separator: none, clearance: 0pt, gap: 0pt, indent: 0pt)
```

Collapse the entry and you render everything yourself — with **no splitting
available**, because the thing that splits is the native area you just emptied.
Leave it populated and Typst renders *and splits* for you, and you give up
control of the arrangement.

That is the whole of the choice `NOTES-SPILL-FINDINGS.md` calls Route A. Anybody
working on it needs to know these two lines are the thing they must **not** do,
and anybody reading the current footer needs to know they are already done.

## One pattern in that thread not to adopt

Its second answer collects entries during layout:

```typst
#show footnote.entry: it => state.update(...)
```

That is **writing state during layout**, which is exactly the defect
`_ksav_rank` exists to avoid. A page footer is laid out many times while Typst
breaks pages; a counter written from it does not converge, and the numbers change
between passes. The first answer's `query(footnote).filter(…)` is the shape this
prelude already uses, everywhere, for this reason.

The rule this repository has held since the apparatus was rebuilt: **page
furniture may query and must never update.**

## Two packages worth taking from

**`meander`** (MIT) has `src/bisect.typ`, which is the `fitPrefix(content, width,
height) → (head, tail)` primitive the note-splitting and the berech both reduce
to — already written, ~3,000 lines, with a hyphenation fallback for a single
overlong word. It also threads text between containers of *different widths*,
which is the fact that reopens the L-shape question.

Two things decide whether Ksav uses it, and one is disqualifying if it goes
wrong: it works on the **main flow** and not the page footer, so it does not
solve note spill either way; and there are **zero occurrences of `rtl`, `ltr` or
`dir` in its entire source.** For a layout engine that is not fine-by-inheritance
— container alignment is precisely where an LTR assumption hides, and it hides
silently. A Hebrew test is the gate on adopting it, not a formality.

**`marginalia`** has the per-note shift policy Ksav's side column does not:
`shift: false / auto / true / "avoid" / "ignore"`, with configurable clearance.
Ksav's clamp-and-shift is unconditional, and the standing preference here is that
a judgement-call constant becomes a setting with the old value as its default. It
also has labelled, referenceable notes — `#note[]<xyz>` then `@xyz` — which is
worth having whatever else is taken.

## And a cost to carry, not to hide

The forum thread notes that a footer laid out as a grid *"could mess with
readers. So the PDF probably is not fully accessible."* That is the same class of
cost as the windowed spill's duplicated text layer: an arrangement that is
correct on paper and worse in the file. Both belong in whatever the writer is
told, rather than in a comment nobody reads.

## What Ksav is ahead on

Their content-length analysis for choosing a layout is talmudifier's algorithm,
which repeatedly generates test PDFs to measure column heights — its own author
calls it *"ponderous and very hacky"*. sefer-engine estimates: *"~45–50 Hebrew
characters per line"*, *"lines ≈ height / 13.5"*. Ksav has `measure()` returning
real geometry at compile time, in one pass. On this one question we are
straightforwardly ahead of the prior art, and the berech is where it shows.

Their linking panel scans for references pointing at markers that do not exist.
`problems()` already reports dangling, orphan and duplicate in **both**
directions, with jump-to-the-other-half on one key, and it runs live in the
editor rather than as a pre-print scan.

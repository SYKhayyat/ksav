# Borrowed Wave — what Katvan already knew (2026-08-04)

[Katvan](https://github.com/IgKh/katvan) is a Qt editor for Typst with, in its
author's words, "a strong bias for Right-to-Left editing". Same typesetter, same
language, same reader, arrived at from a different direction — and its author has
been round several corners this project had not turned yet. Reading it produced
three changes and one confirmation.

Katvan is GPL-3.0 and Ksav is MIT/Apache-2.0, so **no code came across**. What
came across is which problems are real and what the shape of a solution is; in
two of the three cases CodeMirror already had the mechanism and nobody had
called it.

## 1. The preview knows where things are, and we were guessing

`main.ts` turned a click on the preview into a cursor position like this:

```ts
const f = (preview.scrollTop + (e.clientY - rect.top)) / preview.scrollHeight;
const line = Math.round(f * view.state.doc.lines);
```

A click 40% down the preview put the cursor 40% down the document. That is right
for one column of uniform text with no page breaks and nothing floated, which is
the precise opposite of what this application exists to typeset: a page with four
stacked note bands is mostly apparatus by area and mostly body text by line
count, so the error was not merely imprecise, it was **biased** — always landing
early, by an amount that grew with how much apparatus the page carried.

Typst has known the answer all along. Every laid-out glyph carries the `Span` of
the source it came from, and `typst-ide` — the crate the Typst CLI's own editor
integrations use, which this project simply had never depended on — walks the
frame tree for it. `engine/src/jump.rs` is now that, in both directions:

| | |
|---|---|
| **Inverse search** | `POST /jump` — a click, as a place in the source. `{}` for a click on a margin, a running head or a note-band rule, all of which the prelude generated and the writer did not type. |
| **Forward search** | `POST /reveal` — the cursor, as a place on the page. A list, because in this document shape text really does print more than once: a note set in both a band and an endnote list, or anything in a running head. |
| **The unit** | Typst points, both ways, because that is what each page's own SVG `viewBox` is written in. The client divides by the drawn element's bounding box, which cancels zoom, fit-to-width and device pixel ratio at once — none of the three appears anywhere in `app/src/jump.ts`, and that is the property its tests assert. |
| **The line** | Counted in the body that was *sent*, exactly as `diagnostics[].line` is, and put through the same `lineInDocument` subtraction. Two conventions for "where in the document" would have been one too many. |
| **Cost** | A full layout per answer — that is what makes it exact — so both go through the compile deadline and concurrency cap, and forward search is a keystroke (`Ctrl+Alt+P`) rather than something that follows the caret. |

Proof that it is not another guess: the tests in `jump.rs` ask where line 3
printed, click there, and require line 3 back. The same round trip over HTTP
against the release server returns `{"line":3,"column":11}` — column 11 being the
*last* character, because the point named is the glyph's left edge and the line
is RTL, which is Typst being right about bidi rather than this being wrong.

## 2. Mixed-direction source, and the two separate reasons it moved

Katvan's roadmap lists "give blank lines the base direction of the previous line"
as a 1.0 blocker, with the reason attached: otherwise the logical cursor gets
stuck between two RTL paragraphs when the system language is LTR. That is a bug
report from someone who has hit it, not a theoretical concern, and Ksav had the
same hole — one `dir` on the content element, inherited by every line.

`app/src/bidi.ts` fixes two things that look like one:

- **A base direction per line.** Any line with a letter in it answers for itself.
  A line with none — blank, or holding only `]` — inherits: from the line that
  opened the group it is inside, then the previous line, then the document. The
  first of those is Katvan's `findMatchingIndentBlock`, and it is why the closing
  bracket of an English block reads the way the block does rather than the way
  its last line happened to.
- **Isolated syntax.** A call like `#צבע(rgb(...))` in a Hebrew sentence used to
  scatter its brackets through the words around it. Katvan solves this by
  building a shadow copy of every line with LRI/RLI/FSI and PDI injected plus an
  offset map to keep cursor positions meaning something
  (`core/katvan_editorlayout.cpp`, and it is as unpleasant as it sounds).
  CodeMirror has it built in: `Decoration.mark({bidiIsolate})` registered through
  `EditorView.bidiIsolatedRanges`. **Both halves are required.** The CSS alone
  would reorder the text on screen while CodeMirror still measured the old order
  — text that looks right with a caret that lies, which is worse than the bug.

`bidiIsolates()` from `@codemirror/language` would have done the second for free,
but it works off Lezer nodes marked as isolating and Ksav's highlighter is a
regex scanner with no grammar behind it. So the ranges come off the same scan the
highlighter uses, which at least means the two cannot disagree about where a
command is.

The blast radius is deliberately small: the inheritance chain is consulted **only**
for lines containing no letter in any script.

## 3. The characters you cannot see

When the heuristics lose — and on a line of one Hebrew word, one English word and
a bracket, eventually they will — the only recourse is a control character placed
by hand, which is invisible and takes a keypress to step over. A file with a
stray RLM in it reads identically to one without and behaves differently.

So `Ctrl+Alt+X` wraps the selection in an isolate (and a second press unwraps
it), and every bidi control character in the document is drawn as a small
labelled tag. Katvan ships a font for this (`assets/KatvanControl.otf`); a chip
costs nothing and says more, since the point is telling RLM from LRM.

The drawing shares a compartment with prose mode, so the two can never both be
installed. Not a rule anybody has to remember: both work by replacing ranges, a
control character can sit inside hidden command syntax, and two replacements over
one range makes CodeMirror reject the whole decoration set and blank the editor.

## And the confirmation: `notes.typ`

[tudborg/notes.typ](https://github.com/tudborg/notes.typ) was read for the same
reason and yielded nothing. It is one file of about a hundred lines: a `state()`
array, a `counter()`, and a render function. `typst/ksav.typ` is two thousand-odd
lines of regrouped stacked bands, per-tier numbering, per-page `query` footers and
section-scoped dedup. (Written as an order of magnitude on purpose: this document
has quoted three different exact line counts for that file, every one of them
stale within the month.) Its one idea Ksav lacks — reusing an index when two notes
share identical text — Ksav had, tried, and **deliberately removed**
(`ksav.typ:152`).

Nor does it have deferred bodies. `#notes()` chooses where notes *render*; the
question of where their prose *sits in your file* is the one "The other axis"
answers above, and notes.typ does not ask it.

## What this wave did not do

- **Nobody has clicked any of this in a browser.** The headless browser on this
  machine cannot reach loopback. What is verified is 1,075 app unit tests, the
  engine suite, a clean production build, and a live HTTP round trip through the
  real compiler on the release binary — which covers the arithmetic and the wire
  and does not cover the pixels.
- **The wasm module must be rebuilt** for the browser backend to have `ksav_jump`
  and `ksav_reveal`. The Rust and the type stubs are in; `wasm-pack build` is not
  part of a normal checkout's build and has not been run here.
- **`typst-ide` brings three more things nobody took**: `autocomplete`, `tooltip`
  and `definition`, all compiler-driven and all better than the hand-rolled
  tables. They are left alone on purpose — raw Typst completions would spill
  English identifiers into a Hebrew surface, so taking them means routing them
  through `commands.rs` first, which is a wave of its own.

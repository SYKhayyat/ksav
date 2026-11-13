# The delimiter list is rebuilt on demand — #182

**2026-11-13.** The scan allocated 30,780 `Delimiter` objects on every keystroke
for an array only the pause paths read. It records numbers now — the openers come
free with `frames`, the closers are one packed integer each — and the list is
rebuilt the first time somebody asks. Measured 7–19% off the scan, by size.

This is the second half of #169's profile; the first half is
`2026-11-13-the-scan-does-not-ask-twice.md`.

## What was happening

`lexCore`'s delimiter branch pushed an object per bracket:

```ts
delims.push({ pos: i, ch: DELIM_CH[c], opener: true, name: head.name, structural });
```

At 1,000 pages (634 KB, 15,390 nodes) that is **30,780** allocations per
keystroke — 3.3% of the scan for the openers, 2.9% for the closers, and a visible
share of the 16.8% the garbage collector was taking. The readers are three, and
none of them is a keystroke:

- `bracket-lint.ts` — a CodeMirror `linter`, which CodeMirror runs on a debounce;
- `compile.ts`'s `analyze` — the speculative heal, on a compile;
- `exports.ts` — a warning count taken when exporting.

So the work was *right*, in the wrong moment: it is spent on every character
typed on behalf of a reader that arrives after the writer stops.

## What it does instead

The lexer records what a rebuild needs and nothing more:

- **Openers** are already in `frames` — one per mode-bearing region, in document
  order, carrying `open`, `ctx` and `name`. A `Delimiter` opener is `pos`, `ch`
  (read back from the text), `opener: true`, `name` (the frame's) and
  `structural` (`[` anywhere, or a frame whose context is code).
- **Closers** are pushed as one packed integer each: `position * 2 +
  (structural ? 1 : 0)`. One number per closer instead of a five-field object.
- `delimsOf` merges the two sorted lists in one pass — two cursors, no sort — and
  `demandDelims` makes `Scan.delims` an accessor that replaces itself with the
  built array the first time it is read, so the second reader (usually the lint
  and then the compile) pays nothing.

The rebuild lives in `src/delimits.ts` rather than in `spans.ts`. Two reasons,
and the second is the honest one: it is a structure *derived* from the lex and
not part of it, and lifting it put `spans.ts` back under the repository's
2,000-line ledger line, which it had just crossed. The one edge back is a type
import, which is erased, so the module graph stays acyclic.

`delimiters()` hands back the same array, because the rebuild is memoised on the
**lex object** (`DELIMS_OF`, a `WeakMap`) rather than on the text: a text can be
in the lex cache twice — strict and recovery — and those two lists are not the
same list.

Nothing about the decision is duplicated: the rebuild reads the same
`structural` flag the lexer computed, in the same pass that decided it.

## The bug the first version had, and what caught it

`frames` is *not* a list of brackets. `#let`/`#set`/`#show` push a frame at the
`#` itself, to put the rest of the line in code mode. The first version emitted
an opener for every frame and got `ch: DELIM_CH[0x23]` — **undefined** — for each
one. Three assertions in `spans.test.mjs` went red on a document the writer is
allowed to write:

```
FAIL "#let זוג = ("אלף", "בית")\n#הדגשה[ג": the bracket linter finds nothing wrong
FAIL …so healing is a no-op
  got  "#let זוג = ("אלף", "בית")undefined\n#הדגשה[גוף]"
```

A valid document was reported broken and the one-click heal inserted the word
`undefined` into it — which is the exact failure `brackets.ts` was written about.
The fix is to read the character back out of the text and skip frames that have
no bracket in them, which is also why the rebuild reads the text rather than
trusting a frame to be about a bracket.

## The fence had the same disease

The two prohibitions added for #169 used a `functionBody` helper that counted
braces from the first `{` after the function's name. For `lexCore` that brace is
its **return type annotation**, so the #182 prohibition was inspecting a type
declaration, finding no allocation in it, and passing — while the allocation it
was written to forbid sat 400 lines below. It was caught by reintroducing the
violation and finding the sweep still green.

`functionBody` is now "from this top-level declaration to the next one", which is
also how a reader finds a function, and all three prohibitions were verified red
against a reintroduced instance of what they forbid and green on restore.

## Measured

Paired interleaved rounds in one process, CPU time, median of per-round ratios —
`old` being the #169 commit, `new` this one:

| document | new / old | ratio of minima |
|---|---|---|
| 993 pp, 634 KB | 0.896, 0.937, 0.834 | 0.876, 0.900, 0.888 |
| 235 pp, 148 KB | 0.881 | 0.867 |
| 59 pp, 37 KB | 0.897 | 0.934 |

(the box was at load 3–5 throughout, which is the spread in the column)

The new profile at 634 KB shows the allocation gone from the lexer and the
collector's share down from 16.8% to 12.5%.

An honest caveat about the bench: on this machine the scan column now reads
34.6 ms at 634 KB at load 3.1, against 93.6 ms at the start of the session at
load 5–9. Most of that difference is the machine, not the code, which is why the
claim above is the paired ratio and not a before-and-after wall time.

## What is still there

Two position-keyed hash tables, from the same profile: `closes.set` 7.9% and
`byStart.set` 3.1% to build, `closes.get` 5.2% to read. Left open in #182 with
the reason each is not a line edit — a typed array over a 634 KB position space
is *slower* than the Map it would replace (2.75 ms against 1.08 ms, measured), so
the next attempt has to be a packed `(open, close)` pair array walked with a
forward cursor, which means `Scan.closes` stops being a `Map`.

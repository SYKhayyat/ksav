# 2026-08-21 · A layout engine with no direction

`meander` (MIT, 0.4.4) was the strongest candidate to come out of the prior-art
reading. Its `src/bisect.typ` is the `fitPrefix(content, width, height) →
(head, tail)` primitive that note-splitting and the berech both reduce to —
already written, tested, with a hyphenation fallback for a single overlong word —
and it threads text between containers of *different widths*, which is the fact
that reopens the L-shape question.

The note that raised it also raised the thing that decides it:

> there are zero occurrences of `rtl`, `ltr` or `dir` in its entire source — for a
> layout engine that is not "fine by inheritance," since container align handling
> is exactly where LTR assumptions hide. A Hebrew test is the gate on adopting
> it, not a formality.

## The gate, run

Confirmed first: `grep -riE "\brtl\b|\bltr\b|\bdir\b"` over `meander/src/` returns
**0** across roughly three thousand lines of layout engine.

Then the same document twice, differing only in direction — one obstacle placed
`top + right`, text meant to flow around it:

| | the placed block's x | page width |
|---|---|---|
| **Hebrew, RTL** | **621.1 → 742.5** | 595.28 — **off the sheet** |
| English, LTR | 349.0 | 595.28 — on it |

In an RTL document the obstacle is placed past the right edge of the paper.
Nothing about the call changed; only `dir` did.

## The verdict

**Not adoptable as it stands.** A layout package that puts a block off the page
in the only direction this application sets text in is not a dependency, whatever
else is good in it — and quite a lot is.

Three things follow rather than one.

**`_ct_fit` stays ours.** It is built, it is tested, and the reason to prefer
somebody else's was that theirs was mature. Maturity that has never seen an RTL
page is not maturity for this problem.

**`bisect.typ` is still worth reading.** It is direction-*independent* by nature —
it asks about heights and content, not about edges — and it has two things ours
does not: recursion into nested content, and splitting a word with hyphenation
when a single word overruns. Those are the two cases `_ct_fit` currently answers
by handing back the whole thing. Worth porting the ideas; not worth taking the
package.

**And the ❌ it refutes still stands refuted.** The sefer-engine survey scores
Typst ❌ on threading text between regions of different widths, citing Typst's
creator on same-width rectangular regions. meander does thread between containers
of different widths, so the ❌ is about the *native region model* and not about
the achievable page — which the berech demonstrates independently, and which does
not depend on meander being usable.

## The general point

This is the second time in two days that a claim about capability turned out to
be a claim about a *mechanism*. Typst-has-no-frame-chaining is true and does not
mean the page cannot be made; meander-does-L-shapes is true and does not mean it
can be used here. Both need the question asked one level down: **not "can it", but
"can it, in Hebrew, on this page".**

The vendored copy has been removed. `packages/` keeps a one-function fixture so
the loader is tested against a real package rather than a mock.

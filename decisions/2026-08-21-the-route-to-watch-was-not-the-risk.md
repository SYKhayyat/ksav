# 2026-08-21 · The route to watch was not the risk

`NOTES-SPILL-FINDINGS.md` costs four ways out of the page-footer spill problem
and flags one of them:

> **C (measure and cut)** — the one to watch. A binary search per split, re-run on
> every layout pass, is the thing that could cost the 59ms. Benchmark it before
> committing to it.

That was the right instinct and the right instruction. The benchmark says the
opposite of what the reasoning predicted, and the reason is worth keeping.

## The measurement

`examples/bench-fit.rs`, on documents made entirely of knees — each one a
`_ct_fit` binary search over fifty words — against the same shape with the split
hardcoded, which is what the prior art does.

| knees | cold, computed | cold, hardcoded | **warm, computed** | **warm, hardcoded** |
|---:|---:|---:|---:|---:|
| 1 | 84.6ms | 10.9ms | 11.7ms | 10.5ms |
| 5 | 85.0ms | 43.6ms | 11.9ms | 9.5ms |
| 20 | 197.3ms | 75.3ms | **7.5ms** | **7.4ms** |
| 60 | 369.6ms | 174.0ms | **16.5ms** | 12.5ms |

Warm is a one-character edit at the end of the document, which is the thing a
writer feels and the number this application is: 234 pages cold in 979ms and
**59ms after a keystroke**.

## What it says

**Warm cost is within noise.** 7.5ms against 7.4ms at twenty knees; 16.5ms
against 12.5ms at sixty, on a document that is *nothing but* knees, which no real
sefer is. Against a 59ms budget there is an order of magnitude of headroom.

**Cold roughly doubles**, and that is a one-time cost on opening a document
rather than a per-keystroke one.

The reason is `measure` being memoised. A binary search over prefixes asks about
the same prefixes on the next layout pass, and Typst answers those for free. The
worry assumed the search re-runs; what re-runs is the *lookup*.

## Why the prediction was wrong, and it is not a silly reason

The cost model in the findings document is right about the shape — a binary
search per split, re-run per pass — and wrong about the constant, because it
reasoned about the algorithm rather than about the engine underneath it. That is
exactly the failure mode this repository keeps writing down in the other
direction: an instrument that cannot see the property returns a plausible answer.
Here it was an *estimate* that could not see memoisation.

Which is also the argument the RavText note makes about the prior art:
sefer-engine estimates *"~45–50 Hebrew characters per line"* and talmudifier
renders test PDFs to measure column heights. Estimating is what you do when
measuring is expensive. Measuring is cheap here, and it was cheap for this
question too.

## What follows

The route is viable, and combined with the fact that `fitPrefix` is **one
function two problems reduce to** — the note split across a page break and the
berech across a corner — it stops being the expensive option and becomes the
obvious one. The berech is built on it already.

The one thing that has not changed is its limit, and it should ship stated: the
cut is between **words**. A note or a column carrying a table, a figure or a
nested structure has no seam, and for those the windowed spill remains the
fallback — exact on any content, at the cost of a repeated text layer.

**Caveat on the numbers.** Debug build with `opt-level = 1`, which is the inner
loop this repository develops in. Release will be faster and the *ratio* is what
the argument rests on.

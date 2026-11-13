# The closer table does not pay — #182

**2026-11-13.** `Scan.closes` and the lexer's `closes` were a
`Map<number, number>`, which #169's profile charged 7.9% of the scan to build and
5.2% to read. I built the replacement that the micro-benchmark said would win — a
sorted pair array with a forward cursor — and measured it in the scan. **It is not
faster.** Reverted, uncommitted, and written down here so that neither this design
nor the one before it is tried a third time.

## What was built, and why it looked right

Pairs are recorded in two halves: `open(pos)` reserves a slot when the opener is
met, `close(slot, pos)` fills it when a closer answers. That is required, and it
was the first bug: appending whole pairs at close time looks fine and is wrong,
because **closers arrive in nested order and openers do not** — the inner pair
closes before the outer one, so the array ends up descending and the binary search
lands nowhere. `lists.ts` said so within a minute, with
`Cannot read properties of null (reading 'items')`, because it could no longer
find the body of a list.

The read side was a forward cursor with two fallbacks: a backward jump searches
and leaves the cursor alone, and 32 steps of forward walking give up and search
too. So no caller had to promise to be tidy.

In isolation it was a clear win, 15,390 pairs over 634 KB:

| | `Map` | pairs + cursor |
|---|---|---|
| build | 1.10 ms | 0.41 ms |
| read, ascending | 0.46 ms | 0.10 ms |

A plain binary search over the same array was *slower* than `Map.get` (0.66 ms
ascending, 1.67 ms random), which is why the cursor was there at all.

## What the scan said

Paired interleaved rounds in one process, CPU time, median of per-round ratios,
old = `5968ae0` (the delimiter-list commit), new = the closer table:

| document | new / old |
|---|---|
| 1,620 sections, ~1.3 MB | 1.038, 1.024, 1.012 |
| 235 pp, 148 KB | 1.017, 1.025, 1.002, 0.981 |
| 993 pp, 634 KB | 0.978, 0.948, 0.977 |

Neutral at 634 KB, slightly *worse* where the document is big enough to swamp the
noise. The box was at load 5–9 throughout; the 1.3 MB row is the one to trust,
because a 3% effect on 70 ms is above the noise floor there and the sign is
consistent.

## Why the micro-benchmark was wrong

- **An isolated table has no neighbours.** `Map.get` on small integer keys is
  inlined and cheap; the profile's 7.9% was attributed to `closes.set` but a good
  part of it is the incremental marking that the *allocation* triggers, which the
  previous commit already took away by removing thirty thousand objects. Charging
  the whole line to the hash is what a profile does when you ask it for lines
  rather than for work.
- **Two-phase recording costs more than one `set`.** `open()` is a push and a
  length read, `close()` is an out-of-order store into a growing array; the `Map`
  did it in one call, and V8's inline cache for a monomorphic `set` is good.
- **`get` became a method call on a class instance.** The `Map`'s was inlined at
  every call site.

The lesson is the one #169 already taught about measurement, arriving from the
other direction: a micro-benchmark can be honest about the thing it measures and
wrong about the thing you care about. **A structure that wins in isolation has not
been measured; the scan has to answer for itself.**

## Where #182 stands

The delimiter list is done (`5968ae0`, 6–17% off the scan). What is left is
`byStart` (3.1% to build) and whatever part of `closes` is genuinely hashing rather
than garbage — and there are now two measured dead ends on `closes`:

1. a position-indexed `Int32Array` over the whole text (2.75 ms to rebuild,
   15,390 keys in 634 KB = 2.5 MB of first touch, against 1.08 ms for the `Map`'s
   30,000 reads) — #169's record;
2. a sorted pair array with a cursor (this one).

Both were reasonable. Both were slower. The next attempt should start from a
profile of the *current* tree rather than from #169's, because the largest single
item in that profile may no longer be there.

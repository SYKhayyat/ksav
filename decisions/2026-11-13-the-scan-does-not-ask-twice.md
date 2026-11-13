# The scan does not ask a cache twice, or a table per node — #169

**2026-11-13.** Profiled the scan at 1,000 pages and took the top three items out
of it: a duplicate lex-cache probe, a second 15,390-entry hash table, and a
command-name ladder that ran per node. The fences are two prohibitions in
`app/test/prohibitions.test.mjs` and one lexical-pass count in
`app/test/scan-service.test.mjs`.

## The issue's premise did not reproduce, and that is the first finding

#169 said: `scan` 21.4 ms per keystroke, `scanWire` 3.3 ms, therefore *the cost
is in `assembleScan`, not in the lexer*.

A `--cpu-prof` run on the same fixture shape (634 KB, 15,390 nodes, one character
typed into the middle per iteration) says the split is not 15/85:

| where the samples went | share |
|---|---|
| `lexCore` | 36.1% |
| `assembleScan` | 20.7% |
| garbage collector | 16.8% |
| `classify` | 6.1% |
| `scanUncached` (the object spread) | 4.8% |
| `lexical` (the cache probe) | 4.1% |

Line by line, the lexer's own character loop is **3.5%**. The rest of `lexCore` is
bookkeeping: `closes.set` 8.0%, `openerOf.set` 5.9%, one `Delimiter` object per
opening bracket 3.3%, one per closing bracket 2.9%. The assembly's biggest single
line is not its walk either — it is `closes.get`, at 5.5%.

So the honest statement of the class is not "the assembly is the problem". It is:

> **at 1,000 pages the scan's cost is in the hash tables and objects it builds to
> answer questions, in both halves.**

The 3.3 ms figure was measured through `scanWire`, which reuses a warm
`LEX_CACHE` entry; the assembly has no such cache, so the comparison was not
like-for-like. Recorded here rather than in the issue, because the issue's number
was right about the application and wrong about the split.

## What came out

1. **One cache probe instead of two.** `scanUncached` called `lexical(text)` and
   then `delimiters(text)` — the same four-slot cache asked again, four
   comparisons of a half-megabyte string each — and then spread ten arrays into a
   copy of the object it had just found. On a balanced document `delimiters`
   answers out of the strict pass anyway, so the copy was of the lex already in
   hand. The recovery pass is now asked for only when the strict lex reports
   `needsRecovery`.
2. **One position table instead of two.** `openerOf` (closer → opener) existed
   only so `headBefore` could hop back over the group just written. It is an
   `Int32Array` now, zero-filled by the allocator, values stored `+1` so a zero
   reads as "nothing opens here", writes arriving in document order. That was
   5.9% of the scan, most of it a 15,390-entry table growing.
3. **One table lookup per node instead of eight.** `classify` ran
   `NOT_HEADINGS.has` then three `Record` reads then three `Set.has` calls then
   `CELL_KINDS` against *every* node — up to eight hash lookups to decide that
   `#תא` is a cell, on a document where `הערה` and `פריט` and `תא` are each
   written thousands of times. `kindOf` memoises the decision per distinct name;
   the tables are module constants with no writer, so the answer cannot change
   inside a document or between them. That was 4.5%.

**Measured effect**: the machine this was developed on was carrying somebody
else's load (1-minute average 3–10 on 8 cores, most of the session above 5), so
wall time was worthless and single runs disagreed by 20%. Two things make the
comparison defensible anyway: both builds are imported into **one process** and
measured back to back in each round, so drift and load cancel; and the number
quoted is the median of the per-round **ratios**, not a median of times. CPU time
(`process.cpuUsage`), not wall time, so a round the scheduler abandoned does not
count as the scan being slow.

| document | new / old, median of 40 paired rounds |
|---|---|
| 993 pp, 634 KB | 0.898, 0.906, 0.950, 1.006 |
| 235 pp, 148 KB | 0.931, 0.953 |
| 59 pp, 37 KB | 0.910 |

So **≈5–10% less CPU per keystroke**, and the spread is the machine rather than
the change. The arithmetic that supports it is exact and load-free: one cache
probe per scan instead of two, one 15,390-entry hash table per lex instead of
two, and one table lookup per node instead of up to eight — measured as 4.1% +
4.8% + 5.9% + 4.5% ≈ 19% of the samples, of which what survives is the memo and
array cost that replaced them.

## A negative result worth keeping

Position-keyed typed arrays looked like the answer to `closes`, and they are not.
At 15,390 entries in a 634 KB position space (2.4% density, 2.5 MB of array):

| operation | cost |
|---|---|
| rebuild an `Int32Array` from the map | 2.75 ms |
| the 30,000 `closes.get` calls the assembly then makes | 1.08 ms |
| scattered `Int32Array` writes, then 15,390 and 30,000 reads | 2.28 ms |
| the `Map` equivalent | 2.04 ms |
| the same writes in document order | 1.84 ms |
| the `Map` equivalent, sequential keys | 2.45 ms |

The reason is first touch: 2.5 MB of pages for 15,390 values, plus a
zero-fill pass, costs more than hashing 15,390 small integers. `openOf` escapes
that because its writes are sequential — which is why the same trick in the same
function is a win, and why it is not used for `closes`, which the assembly reads
at `+1`-sized random offsets.

## What was not done, and why

- **`delims` (6.2% plus its GC).** 30,780 `Delimiter` objects are built per
  keystroke and read only by `analyze` — the bracket lint, the compile heal, the
  export count — which runs when the writer pauses. Deferring them is a real
  design change (reconstructing them later needs `frames`, every closer position
  and the stray closers, so the lexer has to record them), not a line edit.
  Filed as #182 with these numbers.
- **`byStart` (4.4%).** Same shape as `closes`: 15,390 `Map.set` for a structure
  every consumer asks for, so laziness shifts rather than removes the cost.
- **Incremental scanning.** The one change that would take the whole 73 ms off
  the keystroke is scanning the edit instead of the document. It is a different
  issue, and it needs the identity-keyed discipline #167 and #168 established
  before it can be measured honestly.

## The fences

- `prohibitions.test.mjs`: *the scan takes its delimiters from the lex it already
  probed* — no `delimiters(` inside `scanUncached`.
- `prohibitions.test.mjs`: *a command name is classified in one place, not per
  node* — `classify` may not read any of the eight tables itself. This is the
  half that matters: a table read creeping back into `classify` is a second
  dispatch path that disagrees with the memo the day one of them is edited.
- `scan-service.test.mjs`: *a scan of a balanced document is one lexical pass*.

Both prohibitions were verified red against a deliberately reintroduced instance
of what they forbid, and green again on restore.

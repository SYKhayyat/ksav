# 2026-09-08 · The two library scans become one

Fixes #26 (Ksav Lamdan 5). `includedParts` built its two maps off the in-memory
library index with two full scans — a loop for `idOf`, then a
`new Map(docs.library().map(...))` for `updatedOf` — and both ran on the
debounced typing path, the exact place this repository spends its whole perf
budget. One loop now builds both maps from a single pass over `library()`,
which the function already had to touch once. Behavior is untouched: titles
still resolve newest-first (the first title seen wins), and every id still
carries its `updated` stamp.

## The second copy that was not a walk anymore

`parts.collect` (sync) was the graph-walk's other implementation. Its only
caller was `parts.test.mjs`; the live path had used `collectAsync` since the
external audit, and a sync twin exists to diverge — two copies of the
visit/cycle/`MAX_DEPTH` logic can disagree about exactly the cap semantics the
test was written to pin, and the test would then be pinning a code path nothing
runs. It is deleted. `collectAsync` is the one walk, the test drives it, and
the "two implementations have to agree" hazard shrinks by one.

## The permanent net

`compile.test.mjs` gained two things. First, the behavior the refactor must not
move: a chapter is resolved by title with one read per name asked for, and when
two documents share a title the newer one wins — assertions that run the real
`includedParts` through `compileForExport` against the real library index.
Second, a source fence read the way this suite already reads source
(`reflowableHtml` sets no status): `includedParts` is asserted to scan the
library once. A future edit that re-adds a second `docs.library()` on this path
is a failing test, not a re-review item.

The parts suite kept every one of its cases — a chapter is collected, a chain
is followed, a loop terminates, an unknown name is simply not sent, a document
with no inclusions costs no lookups, and a runaway chain is cut — now all
against the single async walk.

Counts: 7,579 editor assertions became 7,583 across the same 106 files (the
four new assertions above); the engine was not touched, so its 980 stay 980.
# 2026-08-23 · The four small lies

The audit's nits, each a sentence or a tag quietly asserting something false.

**A stale count in prose.** The Girsa module's doc comment said the service
table was "the same eleven entries everywhere" against sixteen rows — in a
repository founded on *a number in a living page is a claim somebody has to
keep true*. The count is gone; the claim that matters (same table everywhere)
stays.

**A duplicated arm in the prelude-definition fence.** `every_registered_command_is_defined`
checked `#let name(` twice and `#let name\n` once. Harmless to the result,
false to the reader about what is being distinguished.

**Dialog commands parked a runtime worker on `rx.recv()`.** The Open dialog,
Save-As dialog and overwrite confirmation each blocked a shared async worker
until the writer answered — which could be forever. The blocking half of each
now runs in `spawn_blocking`.

**`Quick` cost tags on services that do neither.** `inbox` truncates and
rewrites the inbox file; `saved-here` waits on Girsa over the loopback. A
`Quick` service runs on the thread that draws the desktop window; both are
`Work` now, beside `git`, whose comment already stated the rule.

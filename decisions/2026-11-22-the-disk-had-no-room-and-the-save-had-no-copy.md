# The disk had no room, and the save had no copy

A verification sitting, 22 November 2026. Four things were concluded, and the
fourth was found only because the third was done instead of skipped.

## Driven, not read

`app/test/importui.test.mjs` boots the built bundle against the real engine and
presses **File ▸ Import from Word** and **▸ Import from Org**. The one thing a
browser test cannot have is the operating system's dialog, so
`HTMLInputElement.prototype.click` is replaced for the duration of one import and
answers with a `File` this file built — including a real `.docx`, a stored zip
assembled byte by byte. Everything after the click is the product's own path.

`app/test/girsaabsence.test.mjs` calls the three routes a writer presses with no
Girsa at all (linkify, refresh, ask for a mekor) and requires the sentence, the
prose and the selection to come back unchanged — and requires a Girsa that *has*
a loopback and cannot reach it to say something **else**, because telling a writer
to open software that is already running is the wrong fact.

That closes #134: all eight UAT items have a measurement and a fence that goes red
when the fix is reverted. The full evidence table is in the issue.

## A report nobody could read (#231)

The import succeeded and the status slot read `✓ 1 עמ׳ · 21ms` where it should
have read the import's own sentence — *"did not come across: …"* — because the
compile that follows an import writes into the same slot a few milliseconds
later. `runtime.holdStatus` now remembers the sentence and the compile puts it
back at the end; the next edit releases it. Suppressing the compile's verdict
instead was tried first and was worse: the compile also writes `rendering…` when
it *starts*, so the slot sat on that for as long as the hold lived.

## Two fences were reading a stopwatch

`browserlang.test.mjs` waited a fixed 2500 ms for the boot and then counted the
ribbon's groups; inside the full suite the ribbon was still being built and the
failure reported **#228's defect — no toolbar — on a build that had one**.
`paneRefresh.test.mjs` compared two costs in one process, which is the right
shape, and still wobbled, because a scheduling pause moves an *average* and lands
in whichever loop decides the ratio.

Both now wait for a condition — the ribbon exists; the status slot has stopped
changing — and the timing fence takes the cheapest of five rounds on both sides.
The rule that came out of it: **if a fence can be green on an idle machine and red
on a busy one, it is measuring the wrong thing**, and the gate is the worst place
for that, because a false red teaches the next reader to re-run it.

## The lint ignore that matched nothing (#224)

`eslint.config.mjs` ignored `"wasmpkg/**"`. Patterns in a flat config are
anchored at the config's directory and the glue `wasm-bindgen` writes lives at
`src/wasmpkg/`, so the pattern matched no file — twenty-two findings about
`console` and `WebAssembly` in generated code. The fence had asserted
`/wasmpkg\//.test(config)`, i.e. that the *word* was present. It was.

Same class as `indexOf(a) < indexOf(b)` reading `true` when `a` is absent: a
**fence over a string where the question was a pattern.** The fence now evaluates
the patterns and asserts the glue is ignored *and* `src/compile.ts` is not, so an
over-broad `**` cannot pass. It could not surface earlier because this machine had
never finished a 35-minute wasm build: a lint pass over a file that does not exist
has nothing to say.

## Filling the disk found the bug the case existed for (#230, #232)

`ulimit -f` gives EFBIG — a different errno and a different sentence; a 512 kB
filesystem needs `mount -t tmpfs`, which needs `CAP_SYS_ADMIN`. So #230 was filed
rather than skipped, with the recipe. Mounted one and the case ran — and its second
assertion, that the file already on the disk still holds its bytes, failed on the
first attempt:

```
left:  "טקסט חדש טקסט חדש טקסט חדש …"     ← half of the version that failed to land
right: "הטקסט שהיה על הדיסק"               ← what was there
```

`std::fs::write` truncates the target and *then* writes. A save that runs out of
room reported ENOSPC correctly and destroyed the sefer anyway. None of the other
five disk refusals could have shown it: read-only file, read-only directory and
missing parent all fail **before** anything is truncated. ENOSPC is the only one
that arrives after the file is already empty.

`write_beside` writes a pid-suffixed neighbour in the same directory and renames
it over the target — the shape `ksav_dictionary_write` had used since the
dictionary was written, and for the same reason. The target is opened for writing
**without truncation** first, because a `rename` needs write permission on the
*directory* and not on the file: without that open, the fix would have silently
replaced read-only documents, i.e. opened a hole exactly where the bug was.

## What this sitting is for

Three of the four findings came from running the thing rather than reading it, and
the fourth came from a privilege nobody wanted to spend. The lesson is the one this
repository keeps re-learning in different clothes: **a fence asserts less than it
appears to until something is made to fail against it.** Every claim above was
mutated and watched go red before it was written down.

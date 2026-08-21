# 2026-08-21 · The same product, built by someone else

`Sovichea/typsastra` (MIT, v0.7.0) is Ksav for Khmer. Tauri desktop app, Typst at
the centre, live PDF preview, complex-script-first editing, per-language editing
policy, spellcheck, word completion, diacritic-aware search, multi-file projects,
shipping `.msi` / `.AppImage` / `.deb`. Research papers rather than seforim, so
not a competitor — and the most useful thing to read against for the **editor**
half rather than the engine half.

## What they have that we do not: budgets for the experience

Their `benchmarks/results/*.json` carries a **`budgets`** table — named
thresholds for the whole interaction, not just the compile:

```
usableEditorMs            2500      previewMotionHandlerP95Ms    8
providerInitializationMs  2500      finalDestinationPageP95Ms  500
firstDiagnosticMs         3000      compilerRecoveryMs        3000
previewCompileOnePageMs   2000      spellcheckP95Ms            100
previewFirstPageMs        1000      suggestionP95Ms             50
visiblePageRenderMs        500      maxResidentPdfPages          7
zoomSettleMs               750      maxQueuedLanguageRequests    1
```

Ksav has `bench-incr.rs`, `bench-export.rs`, `bench-prelude.rs`, `spellrate.rs`
and `suggestrate.rs`. Every one measures **the compiler**. Not one of them
measures *how long until the writer can type*, *how long until the first
diagnostic*, or *how long a zoom takes to settle* — and those are what a person
actually experiences.

Two things to take, and they are separable:

**The budget table itself.** A number with a name and a threshold is a claim that
can fail; a number printed to stdout is a number somebody reads once. This
repository already believes that about page geometry — `settings_live.rs` exists
because a measurement nobody asserts on is a measurement that rots — and has not
applied it to speed.

**Machine-stamped, versioned results.** Theirs record platform, CPU, logical
cores, total memory, `bun`/`typst`/`tinymist` versions, git revision, **and
`workingTreeDirty: true`**. Ours print to a terminal and vanish. The dirty-tree
flag is the detail worth stealing: it is the difference between a benchmark and
an anecdote.

## What we have that they do not

**We embed the compiler; they shell out to it.** Their `firstProcessOnePageMs` is
535.78 and their warm medians are 298ms for one page and 470ms for a hundred.
Ksav is 234 pages cold in 979ms and **59ms after a one-character edit**, in
process, with `comemo` kept alive across compiles.

That is not a criticism of them — a CLI subprocess is a completely reasonable
architecture and it is why their `previewCompileOnePageMs` budget is 2000. It is
worth recording because the embedding decision is one Ksav paid for in
complexity, and this is the first outside number that says what it bought.

**And they patch `pdfjs-dist`, not Typst.** Same instinct as ours: the engine is
upstream and the viewer is ours to bend.

## What is worth reading next, and was not read here

`third_party/` and `src-tauri/src/segmentation/` — they built their own
segmentation rather than living with the defaults, and there is a
`KHMER_SEGMENTER_IMPLEMENTATION_PLAN.md` beside it. Khmer word segmentation and
Hebrew are different problems, but *"the defaults are wrong for our script and we
wrote our own"* is the same decision Ksav made about spell-checking, and their
plan document is the kind of thing worth comparing notes on.

`src-tauri/resources/examples/02-multilingual-writing/…/02-bidirectional-rendering`
is a worked bidi example. Unread here.

## The honest summary

Nothing in it changes the engine. One thing in it should change the project: we
measure what is easy to measure — a compile — and they measure what is worth
measuring — an editor. That is a real gap and it is ours, not theirs.

# audit/ — what this was, and why there is nothing else here

**This directory used to hold 120 tracked files — fixtures, probe output, screenshots and
tooling — that no test ran, no CI job referenced, and no source file mentioned.** It looked
like a gate. It could not fail, because nothing ever asked it anything.

The 119 files are gone. This README is what replaces them.

## Why it looked like a gate

The shapes were right: numbered fixtures with names like `01-fn-balance.ksav`, `results/`
holding probe transcripts with exact page coordinates, `shots/` holding rendered pages. A
directory like that reads as the output of a test harness, and a reader who has not checked
will assume a harness consumes it.

Nothing did. `grep -rn "audit/" ksav .github` returns nothing.

Part of it was never about this repository at all. `tools/run-harness.sh:10` hardcodes
`/mnt/c/Users/Administrator/Videos/Nexus/linix` and drives Docker against a sibling project on a
Windows path. Whatever that harness measured, it did not measure Ksav.

## Why deleting it lost no coverage

**Because nothing had any.** Every question the audit asked of Ksav is now asked by a test that
runs:

| audit fixture | live test |
|---|---|
| `01-fn-balance` — a note taller than the foot | `tests/footnote_continuation.rs` |
| `02-sn-align`, `03-sn-dense` — side notes | `tests/side_placement.rs` |
| `05-spill-cut`, `06-spill-window` — overflow moves | `tests/overflow_moves.rs` |
| `07a-clip-mark`, `07b-clip-quiet` — region clipping | `tests/region_matrix.rs` |
| `10a-deferred`, `10b-inline-twin` — deferred note bodies | `tests/deferred_notes.rs` |
| `12-two-regions-side` | `tests/region_matrix.rs` |
| `11-perf-120`, `13-perf-240` | `examples/bench-*.rs` |
| `fuzz/f01`–`f05`, `f11` — truncated wrappers, wrong magic, a `body` that is not a string, prose in braces | `tests/docfile_oracle.rs`, whose header lists exactly these |
| `fuzz/f07-deep-nest` — nesting past the limit | `tests/diagnostics_corpus.rs`, which builds 90 nested `#הדגשה[` rather than writing them out |

`fuzz/f13-bad-region-ref` is a case that **aged into a different question**: it calls
`#אזור(מקור: …)`, and `#אזור` no longer takes `מקור`, so the file now exercises
"unrecognised argument" rather than "region refers to nothing". It found a real defect on the
way — see below — which is the only thing in `audit/` that earned its keep.

(`documentation.test.mjs`'s "every source path a page names in prose exists" fence caught the
deletion while this file was being written — it resolves a `fuzz/…` reference in this README as
a path that must exist. Correct behaviour: a README that names a deleted file is a broken link.
It then caught my *fix* for the same reason, because the sentence explaining the fix quoted the
path again. That is the fence working twice for one typo, which is more than it needed.)

## The one thing worth keeping, and it was not a fixture

Writing the fuzz corpus against the live engine turned up a defect none of the 32 hand-written
cases in `diagnostics_corpus.rs` could see:

```
error: panicked with: הגדרות_זרמים: ארגומנט לא מוכר · unrecognised argument: טורים_שגוי — זרמים, פריסה, …
```

A writer who mistypes a setting name was told **the program crashed** — in front of a sentence
the prelude had already written, already bilingual, and already listing the keys that would
have worked. Thirty-five `panic(` sites in `ksav.typ` do this.

Fixed in `diagnostics.rs::rephrase`, with the fence
`no_writer_mistake_is_reported_as_a_crash` in `diagnostics_corpus.rs` and a corpus case for it.
The bilingual fence above it could not catch this: `panicked with: X · Y` satisfies every
clause of "is it in both languages with a separator", which is the argument for writing a
second check rather than a cleverer one.

## The categories that were never wired, and still are not

Honest accounting. These fixture families existed, were never run, and I could not establish
that anything covers them today:

- **raw binary input** (`f08-binary`) — a `.ksav` that is not text at all
- **NUL bytes inside a body** (`f09-nulbytes`)
- **a pathologically long single line** (`f06-huge-line`)

`docfile_oracle.rs` covers *malformed JSON*, which is a different question from *not text at
all*. If these matter, they want three cases in a docfile-level test — which is a small piece
of work, and is not this directory's job.

## If you are adding probe output here

Don't. A probe nobody runs is a screenshot of a bug that is still there. Either the probe
becomes a test that fails, or the finding becomes a paragraph in this file.
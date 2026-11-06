# One paper-size table — #106

**2026-11-06.** The fix for #106, the worst finding of the 2026-10-16 config
audit. The record is the *reasoning*; the mechanism is `engine/src/lib.rs`
(`paper_cm_of`, `PAPERS`, `PAPER_ALIASES`), `ksav.typ` (`נייר_רוחב`),
`facts.rs` / `emit-engine.mjs` (`PAPERS` in the client), `exports.ts` and
`settingsdrawer.ts`. The fence is `engine/tests/paper_table.rs`.

## What the issue said, and what measuring found

The issue named two tables: `_pg_paper_width` in the prelude (`ksav.typ`) and
`paper_cm_of` in the engine (`lib.rs`). It predicted a page laid out at one
width and margins reserved against another, 34 mm apart for B5.

Measuring the rendered page found it was worse than either copy of the claim:

- **Typst's `paper:` is a closed enum.** It accepts `iso-b5` and rejects `b5`
  outright with a syntax error *about `#מסמך`* that never mentions the paper.
  So `b4`, `b5`, `b6` and `letter` — names the engine's own table published —
  did not lay out at the wrong width: they **failed to compile**.
- **A fourth copy the issue never found:** `PAPER_CSS` in `app/src/exports.ts`,
  four papers wide, with an A4 fallback. A B5 sefer exported to Word carried
  `@page { size: 21cm 29.7cm }` and printed on A4.
- The continuous (`רציף`) path — the second table's *only* job — was wrong for
  **seven of ten** papers: `_pg_paper_width` knew `a3`/`a5`/`us-letter`/`letter`
  and answered 210 mm for everything else, so a continuous A2 or A6 sefer was a
  210 mm column.
- The margin bound read `&cfg.paper` raw in one place and the sanitised name in
  the other, so the two bound the same margin against two pages.

The shape is the shape of every bug in this repository: the same truth written
down more than once, in more than one language, with nothing comparing the
copies.

## The decision

**One table, in the engine, and the two languages read from it rather than
re-stating it.**

1. `paper_cm_of` is the one table. Its keys are the **canonical** spellings
   (`iso-b5`, not `b5`) — the post-`sanitize_paper` names, because those are the
   names Typst will accept, and a table whose keys Typst rejects can never be
   compared against the page that lays out.
2. `sanitize_paper` becomes the alias layer: `b5 → iso-b5`, `letter →
   us-letter`, plus the separator fix (a space between words is a separator, not
   noise — `US Letter` must not become the unmatchable `usletter`). One map,
   `PAPER_ALIASES`, generated into the client so the chooser and the engine
   resolve an old name the same way.
3. The prelude has **no paper table**. The continuous path is sent `נייר_רוחב`,
   the width computed from `paper_cm_of`. A length in `ksav.typ` is a second
   table coming back.
4. The Word export reads `PAPERS` (generated via `facts.rs` →
   `emit-engine.mjs`), not a local `PAPER_CSS`. The drawer's paper chooser reads
   `PAPERS` too, so it offers what the engine can actually lay out — B4/B5/B6
   and Legal, which it never did.
5. An unknown name is **named**, not silent: `spec_refusals_of` emits a warning
   saying which setting is wrong and that the page is A4, and `typst_paper`
   substitutes A4 so the compile does not fail with an error about the wrapper.
   This is the same pattern the audit prescribes for every setting that "says
   nothing": *"a setting that says nothing is the wrong answer."*

## What was considered and rejected

- **Add the missing names to the prelude's table instead.** That makes two
  tables agree *today*, and the audit's whole point is that nothing compares
  them tomorrow. The issue's proposed resolving test — render each paper and
  read the page off the output — is kept, and it is a sweep now, not a fixture.
- **Make the prelude table the source and the Rust read it.** The prelude is
  Typst and the engine is Rust; the engine cannot import a Typst table, and the
  two are compiled in the same crate so there is no reason to make the awkward
  one the source.
- **Keep `b5` in the table under a name Typst rejects.** A table that contains
  a page it can never lay out is a table that will disagree with the laid-out
  page by construction. The canonical names are the ones the fence can compare.
- **Leave the margin-bound disagreement alone** (raw vs sanitised). They read
  the same `&cfg.paper` now because `paper_cm_of` sanitises for itself; the two
  functions could not drift even if they wanted to.

## Why the `b5 → iso-b5` translation is not itself a second table

The alias list is not a *size* table, it is a *spelling* table, and its rows are
asserted by `tests/paper_table.rs` (`an_old_spelling_is_the_same_sheet` renders
both spellings and checks they are one page). The distinction matters because
the failure mode of a size table is a page that is the wrong size with nothing
saying so; the failure mode of a spelling table is a page that is *refused*.
Both are caught.

## The fence

`tests/paper_table.rs`:

- **Every offered paper is the page the table says**, in both paged and
  continuous modes, read off the rendered document. A missing name is a compile
  error, not an A4.
- **An old spelling is the same sheet** — `b5` vs `iso-b5`, `letter` vs
  `us-letter`, `US Letter` vs `us-letter`, in both modes.
- **An unknown paper is A4 and says so** — lays out on A4 and carries a warning
  naming the setting.
- **The prelude holds no second paper table** — the sweep the issue asked for:
  a bare `297mm`/`210mm`/etc in `ksav.typ` is a second table coming back, and
  the `נייר_רוחב` parameter must be present and read.

Three mutants were checked: a wrong entry in `paper_cm_of` (red), a second
paper width reintroduced in `ksav.typ` (red), and the `b5` alias dropped (red).

The `english_commands` fence also caught the new parameter: every `מסמך`
parameter must have an English spelling, so `paper_width: "נייר_רוחב"` was
added to `_en_params`.

## Found on the way, and filed rather than folded in

The `desktop shell` CI job was red on `main` before this work and had been for
days. Two layers of it were fixed here because they blocked the gate and were
unambiguous — `tsconfig.json` using `baseUrl`, which the TypeScript the job
actually ran rejects, and the job installing Node but never the frontend's
dependencies. A third layer surfaced once those were gone: the webview under the
CI runner never answers within the check's 25-second budget. That is not
slowness (the same check answers in about 1 s here, on a real display and under
Xvfb), so raising the timeout was rejected — it would turn a 25-second false
failure into a 60-second one. Filed as #171 rather than guessed at.

The lesson is the same one this issue is about, one level up: a check whose two
earlier failures masked it looked green-adjacent for weeks while never running
the thing it exists to run. See #171.

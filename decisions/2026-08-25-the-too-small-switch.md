# 2026-08-25 · The too-small switch

The refuse-or-grow question of 21 August, closed as a writer-facing policy
rather than an engine opinion. When the page-foot reserve is fixed smaller
than its foot regions' declared heights ask for, three answers exist and the
document now chooses among them:

- **`grow`** (the default) raises the reserve to hold what the regions
  declare. Nothing goes off the paper; the taller strip on the next render is
  the announcement.
- **`refuse`** stops in `compile_doc_with` before layout and names both
  numbers — the one answer that can never lose a reader's text to silence.
- **`flow`** keeps the writer's number and lets excess entries continue on
  later leaves, under the spill ladder the apparatus already had.

## What was built

`reserve_overflow` joined `DocConfig` as a typed string (`af3ffa7`), read
from document configuration like every fact about geometry, so it travels
with the file (`e2895fa`: `PAGE_FIELDS`, `facts.gen.json`, the generated API
surface). The `"refuse"` half refuses in `compile_doc_with`, where the scan's
need and the writer's number can be compared before anything lays out, with a
diagnostic that states both centimetres and all three ways out. The
`"grow"` half answers in `show_rule` for reserves set through configuration,
and separately for reserves fixed *inline* — `#מסמך(אזור_הערות: …)` written
in the body overrides the wrapper's injected value, so `b2ea01b` rewrites
that number where it stands when the scan says it cannot hold. `"flow"`
keeps the writer's number untouched at both sites.

Supporting work: the scanner learned to price a `שורות(n)` region height on
the Rust side against the same default line the drawn slot falls back to
(`a93fd91`, one constant shared by both halves of the percent-of-sheet claim,
fenced by unit test); and the heading fence reads the scanner's own table
rather than a hand-kept list (`d1f37bb`).

## What was checked

A 4cm band inside a 1cm reserve grows and sets; the same document under
`"refuse"` stops with both numbers; under `"flow"` it sets with the 1cm strip
and flows. An explicit regional `גלישה` still beats every default. The
inline-grow path is fenced through `compile_doc_with` end to end, not by
calling the rewriter directly.

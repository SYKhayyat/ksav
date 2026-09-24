# 2026-09-23 · The English parameter tables cross as values

Fixes #27. `PARAM_EN` and `PARAM_EN_BY_COMMAND` in `engine.gen.ts` were built by
`emit-engine.mjs` with a ~200-line regex-and-paren-counting parser over
`ksav.typ` — the same "value crosses a language boundary as source text" bug
`facts.rs` was invented to end, recreated one layer over at the English seam.
A param *rename* (the normal edit) passed the floor checks silently and shipped
a wrong English snippet.

## What the engine serialises now

`diagnostics::param_tables` walks Typst's own parse of the prelude and returns
both shapes the vocabulary has:

- `global` — every `english: "hebrew"` under `#let _en_params = (…)`, in
  declaration order.
- `by_command` — each `#let … = _en(המפקד, extra: (…))`, keyed by the Hebrew
  command (the first argument to `_en`), pairs in declaration order.

Only a `LetBinding` whose value is a `FuncCall` to `_en` opens a by-command
row, so `_en`'s own definition (a `Closure`) and the three unrelated `extra:`
sites in the prelude (`_mk_mark`, `ערך`, `ציון_מקור`) cannot be mistaken for
wrappers. `en_param_pairs` — what `hebrew_param` and two english_commands tests
flatten — is now a thin view over the same tables, so there is one walk and not
two that can drift.

`facts()` carries the tables as `param_en`; `KSAV_BLESS=1 cargo test --test
facts` writes them into `facts.gen.json`. The generator reads that as its
source of truth. Declaration order is preserved because the first English
spelling of a Hebrew word (`colour` before `color`) wins when the client builds
`PARAM_EN`.

## The fence that stays

`preludeParamsFromText` still reads the prelude the old way — substring,
paren-count, regex — but only as a cross-check. Every pair is compared; any
disagreement is a loud `process.exit(1)` naming the key, never a wrong value.
That is the opposite failure mode from regex-as-source: the text scan can only
refuse, never ship.

## What was proven before the old path stopped being the source

`PARAM_EN`, `PARAM_EN_BY_COMMAND` and `paramsOf` came out of the first
regeneration **byte-identical** to the pre-change `engine.gen.ts`. Only the
doc comments at the top of those sections changed (they now say facts rather
than prelude text). Two new facts tests pin the floors (≥40 global, ≥10
wrappers) and the two ambiguities the prelude's own comments are about
(`colour → צבע`, `מסמך.extra.columns → טורים`); a third asserts the flattened
pairs equal the structured tables.

Editor assertions unchanged at 7,592 / 106 files. Engine tests 984 → 986.
README's tally updated to match.

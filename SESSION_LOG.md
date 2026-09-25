# Session running record

Chronological log of work in this session (append-only; newest at bottom).

---

## 2026-09-23 · #27 param_en half (closed → reopened for remainder)

### Done and committed as `7223939`

- `diagnostics::param_tables` / `ParamTables` / `en_wrapper`: Typst-AST walk of `#let _en_params` + every `_en(…, extra: (…))`; only `FuncCall` to `_en` opens a by-command row.
- `facts().param_en` → blessed `facts.gen.json`.
- `emit-engine.mjs`: `PARAM_EN` / `PARAM_EN_BY_COMMAND` generate from facts; old paren-count read kept only as a loud cross-check.
- First regeneration **byte-identical** on all three tables (only doc comments changed).
- New facts tests: floors (≥40 global, ≥10 by_command), colour→צבע, document.columns→טורים, flatten≡structured.
- Decision record: `decisions/2026-09-23-the-english-parameter-tables-cross-as-values.md` + index row.
- PLAN.md checked; README tallies updated.
- Tests green: facts 5→6 (later 6), english_commands 27, clippy clean, npm then 7592/106 → after later additions 7607/107.
- Pushed; **#27 closed**.

### Confidence review (user asked)

- Very sure: byte-identical output; full green; scope held to `param_en` only.
- Limit: cross-check and facts could share a blind spot; `COMMAND_EN` still text-read; no mutation proof yet.
- Net: ship; residual risk = cross-check independence, not table correctness today.

### Follow-up (user: add tests + reopen unclosed part)

- **Refactor** `emit-engine.mjs`: pure `paramsFromFacts(pe)` + `paramProblems(global, byCommand, textGlobal, textBy)` (exported); `crossCheckParamsAgainstPrelude` only turns non-empty problems into `process.exit(1)`.
- **New** `ksav/app/test/paramen.test.mjs` (fourteen checks): happy path facts≡prelude text; mutations for wrong global pair, missing wrapper, missing override, wrong override value, size skew — each must name the Hebrew key.
- **New** Rust `the_walk_only_opens_rows_for_real_en_wrappers` in `tests/facts.rs`: `_en` def closure, non-`_en` traps (`_mk_mark` shape, etc.), bare/empty `extra:`, comments between `_en_params` entries / inside `extra:`.
- **Reopened #27**: remaining scope = `COMMAND_EN` still from `readAliases()` line-regex over `ksav.typ`; refine = facts value + cross-check, same as param_en.
- PLAN.md: #27 back to `[ ]`, text narrowed to “param_en done; COMMAND_EN still prelude-line regex”; #27 removed from Done list.
- README: engine tests 986→**987**; editor assertions climbed 7,593→7,606→**7,607** / **107 files** (docs claim fence; last README fix for 7,607 pending full-run confirm).

### State at log write

| Item | State |
|------|--------|
| #27 GitHub | **OPEN** (COMMAND_EN half) |
| `paramen.test.mjs` | fourteen checks, all green (filtered + full run) |
| facts tests | 6/6 |
| english_commands | 27/27 |
| npm full | **7,607 / 107 files, 0 failed** (confirmed after log wording fix) |
| Commit for tests+reopen | **`a8e0d45` pushed** (paramen fence, pure `paramProblems`/`paramsFromFacts`, AST-trap test, PLAN remainder, README 987 / 7,607 / 107, this log) |

### Next move

1. Leave **#27 OPEN** until `COMMAND_EN` crosses as a value (`readAliases()` still line-regex).
2. On next session: pick up #27 COMMAND_EN refine from the reopen comment.

---

## 2026-09-25 · #27 COMMAND_EN half (closed)

### Starting state

All three repos (`ksav/`, `lamdan/`, `audit/`) clean and level with `origin/main`.
No unpushed commits, no uncommitted work, no half-finished branch. So the plan's
next unchecked item, the `#27` remainder, was the right thing to pick up.

### The finding, and the part of the story that was wrong first

`COMMAND_EN` was the last of the three English tables still built by a regex over
`ksav.typ`: `readAliases()` ran `/^#let ([A-Za-z][A-Za-z0-9_]*) = …/` once per
line. Replaced by `diagnostics::command_aliases` (Typst-AST walk) →
`facts().command_en` → `aliasesFromFacts`.

Three things were wrong in my first attempt at the walk and the tests are what
found them — this is the third time in this repository that the shape of the
answer was the interesting part:

1. **The `Hash` is a sibling of the `LetBinding`, not a child.** Requiring one
   under the binding found **zero** aliases. The dump of Typst's tree is what
   showed it: `Markup > Hash, LetBinding`. The rule that actually decides "is this
   a command" is the *parent kind* — a document-level `#let` is a markup
   expression (`Markup`), a function-local `let` sits under `Code`. That is a
   fact about the language rather than a pattern, and it is the only thing that
   separates the prelude's local bindings in function bodies from its
   aliases.
2. **Typst will not parse a `#let` whose value is on the next line.** I had built
   the whole justification on the regex missing a wrapped value; it is an
   `Error` node, so no bare alias can ever be one reader's find and the other's
   miss. Stated honestly in the record now, with the real traps instead.
3. **`// #let bold = הדגשה` is *not* read by the regex** — the anchor needs `#`
   first. I wrote a test asserting it was, and the test went red. The real
   over-reads are a *block* comment with the alias on a line of its own, a
   multi-line string quoting a command, and a fenced raw block. Under-reads:
   `#box[#let cell = תא]` and `_en((מדור_בדרגה))`. All six are now pinned in
   `commanden.test.mjs` against a copy of the regex, so the record stays a
   measurement.

`_en (מדור_בדרגה)` with a space is **not** an example: Typst rejects it. It was
in the first draft of the comment and the test caught that too.

### What shipped

- `engine/src/diagnostics.rs`: `command_aliases`, `collect_aliases`, `alias_pair`,
  `en_wrapper_command`, `is_command_alias_name`, `is_hebrew_command_name`.
  Parent-kind rule, first-*positional*-argument rule (a `Named` ends the search),
  parenthesised argument unwrapped.
- `engine/src/facts.rs`: `Facts::command_en: Vec<(String, String)>` = `(english,
  hebrew)` in declaration order — **both** `os` and `osource` for `אות`, because
  first-wins is the reader's rule and the reader is the client.
- `engine/facts.gen.json`: regenerated, +763 lines.
- `app/tools/emit-engine.mjs`: `aliasesFromFacts` (pure, exported),
  `preludeAliasesFromText` (the old regex, now a fence), `aliasProblems` (pure,
  exported, reports **both** directions), `crossCheckAliasesAgainstPrelude`.
- `app/src/engine.gen.ts`: `COMMAND_EN` **byte-identical**; only its doc comment
  changed to say `command_en` where it said "the prelude's own `#let` lines".
- Floors: `aliases (engine/typst/ksav.typ)` → `aliases (engine/facts.gen.json)`.

### Tests, all of which can fail

- `engine/tests/facts.rs`: `the_command_pairing_is_present` (floor, string-pair
  shape, both `אות` spellings present), `the_first_english_spelling_of_a_command_wins`,
  `the_alias_walk_only_opens_for_document_commands` (6 over-reads, 6 under-reads,
  4 non-aliases), `every_registry_command_agrees_with_the_preludes_spelling`
  (registry ≡ prelude, asked from Rust, and caps the registry-only twin fallback
  at 5). `first_difference` learned `command_en`, so a stale artefact names the
  table.
- `app/test/commanden.test.mjs`: the assertions cover the wire shape, the
  first-wins rule, the happy path, and the fence firing for a wrong pair, an
  invented pair, a missing pair and a size skew, each naming it in Hebrew.

### Fence verified by mutation, not inspection

- `הדגשה → strong` in `facts.gen.json` → `node tools/emit-engine.mjs --check`
  exits 1: *"הדגשה: facts say strong, prelude text says bold"*.
- `#let brandnew = גדול` added to `ksav.typ`, artefact not re-blessed → exits 1,
  naming both spellings of the Hebrew name.
- Both mutations reverted; `ksav.typ` restored from git and the registry test
  confirmed the restore.

### Numbers

Editor assertions 7,607 / 107 files → **7,632 / 108**. Engine tests 987 → **991**.
README's three tallies updated (`ksav/README.md`); the documentation fence is
what asked.

### Confidence review

- Very sure: `COMMAND_EN` byte-identical; the four Rust tests and the JS assertions
  each demonstrated red; the fence's exit-1 demonstrated on two real mutations.
- Limits worth stating: the line-regex fence and the walk could in principle share
  a blind spot — mitigated by construction (different parsers, different
  languages) and by `commanden.test.mjs` pinning the regex's blind spots
  directly. The `every_registry_command_agrees…` twin cap of 5 is a judgement, not
  a measurement; there are 2 today.
- Net: ship, and close #27. Both halves of the issue are now facts values with
  loud fences behind them.

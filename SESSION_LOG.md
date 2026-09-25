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

---

## 2026-09-25 · #29 registry "docs in the wire" (closed as a measured false positive)

### Why this one is a verdict and not a fix

`PLAN.md`'s next item, and the first one on the list that turned out not to be a
finding at all. #29 claimed the registry "carries long-form *why* essays and
deprecation histories inside `cmd!` literals that serialize to the client
(`commands_json`)". Filed with 10% suspicion of being a false positive. It is
one, and the reason is worth recording because it is not visible from reading
the issue.

Measured off `src/commands.rs` as committed: **40,053 bytes, of which 15,181
(38%) are comment and 16,035 (40%) are the `cmd!` literals**; 4,505 of the
comment bytes are `///`. Median description **22 characters**. `commands_json()` is
**37,472 bytes for the whole registry, 224 bytes a row**, 32% of it the two
description columns. The essays are real — this repository argues in comments as policy — and
every one is in the 38%. A Rust comment is not a value, so none of it is in the
wire. There was no prose on the wire to remove.

And the descriptions have to stay: `app/src/commands.ts` displays them and
`matches` searches them, because `matches` queries every field a writer might
recall a command by. Moving them off the wire would move them onto a second
wire.

### What was actually missing, and is now fenced

A prohibition. The failure #29 describes is plausible rather than far-fetched: an
author documenting a command properly reaches for the description field, because
it is right there and the comment is twenty lines up. The paragraph compiles,
passes every floor, ships 37 KB to a browser, and lands in a tooltip. Same shape
as the `DocConfig` default that `facts.rs` was written against — a value that
grows rather than a value that is wrong.

`engine/tests/registry_wire.rs`, four tests, all measured off the artefact that
crosses:

- `the_wire_carries_exactly_the_columns_the_palette_reads` — the seven columns by
  name. Not that the values are short but that the *shape* has not grown a column
  nothing reads.
- `no_description_on_the_wire_is_longer_than_ui_copy` — 160 for a description,
  200 for an `insert` (longest real: 105, a fully-specified `#הגדרות_כותרות(…)`).
- `a_second_sentence_on_the_wire_is_a_deprecation_notice` — the only descriptions
  with a second sentence are the deprecation notices: four of them, two commands,
  two languages, **pinned in both directions**.
- `the_wire_is_a_palette_and_not_a_manual` — 40 KB, three times today's payload.

### Two fences of the repository's own, and they were right both times

- `skips.test.mjs` rejected the length test: *"Count what was actually checked and
  assert a floor under it."* The loop `continue`s, so it counted nothing, and a
  field rename that matched neither arm would have skipped every row and passed.
  Now a literal floor (`> 400`) **and** the exact count, because every command
  contributes three strings.
- `documentation.test.mjs`'s living-page sweep rejected `PLAN.md` and the
  decision record for numbers beside a fenced noun. Reworded, not deleted.

### One rule of mine that was wrong on the first attempt

The second-sentence test treated an **em-dash** as prose. It went red on forty
descriptions — "Footnote — in a chosen channel, or the default one", "Band C —
notes on band B". That is the house style for a one-line description, so the rule
would have banned the style rather than caught the problem. The rule is now a
**sentence boundary**: a full stop, question mark or exclamation mark followed by
a space and a letter, which is why `use #הערה_ב.` is not a second sentence and an
em-dash never is.

### Every fence shown red, for the reason it was written

| Mutation | Caught by | Named |
|---|---|---|
| a 235-character description pasted into `הדגשה` | the sentence test *and* the length test | `הדגשה.desc_en has a second sentence and is not deprecated`, then `is 235 characters, over the 160` |
| a `rationale: &'static str` column added to `Command` | the column test | `the wire contract changed`, with the eighth column listed |
| a deprecation notice deleted from `הערה_על_הערה` | the count in the sentence test | `expected four deprecation notices … found 3` |

All three reverted; `commands.rs` restored, `git diff` empty for that file.

### Also

`commands.rs`'s module comment now states the split — seven columns on the wire,
the essays in the comments — and points at the fence, so the next person to
consider a description as a place for an explanation is told where they go.

Engine tests 991 → 995, binaries 68 → 69, editor assertions 7,632 → 7,633.
README's tallies updated; `PLAN.md` SKIP gained #29 with the measurements;
`decisions/README.md` row added.

### Confidence review

- Very sure: the false-positive verdict, which is four numbers rather than an
  argument; the four fences, each demonstrated red.
- Limit: the length bound (160) and the size bound (40 KB) are judgements with
  headroom rather than derived numbers, and both would need revisiting if the
  palette ever moved to a multi-line row. Stated as constants with their reasons
  so a reader can move them knowingly.
- Net: close as a false positive *and* ship the fence. The issue was wrong about
  the wire and right about there being nothing holding it.

---

## 2026-09-25 · #28 the templates' collective guarantee (closed)

### The plan item, and why it was two gates rather than one

`#28` asked for *"one test that walks every template probe and asserts a declared
covered set is present in some `template_body`"*, and for the `-en` copies to fail
if one alone drifts structurally. Phase 1's last item, and the first one that was
a real finding rather than a refactor.

### Gate one, and the three things it found

`COVERED` in `engine/tests/templates.rs` is ten capabilities, each with the
commands that demonstrate it. A capability is reachable only when **one** template
body holds every command in its row — not when the corpus between them does, which
is the arrangement that let the apparatus go unreachable the first time (ten
templates between them, eight commands, five of the ten using no apparatus at all).

What it found, none of it demonstrated by anything:

| Capability | Was in | Now in |
|---|---|---|
| a note on a note, at a tier the writer picks | no template at all | `sefer.ksav` |
| a note whose text is written at the end of the document | no template at all | `article.ksav` + `article-en.ksav` |
| the topic index | no template at all | `sefer.ksav` |

The topic index is the one that stings: `מפתח_ענינים` has been in the registry, in
the palette and in the toolbar this whole time with nothing on the far side of it.

### Probed, never `ok()`ed — and the third capability earned it

This file's header rule is that every apparatus bug this project has had compiled
cleanly and was wrong on the page. So the new apparatus got rendering probes, and
the deferred note is asserted by its **failure mode**: `#הערה_בשם` answers a
missing body with a red `?` and the name, deliberately. So the article test is
`!runs.any(|r| r.text.contains("?תחום הדיון"))` plus two positive halves — a
template whose marker vanished also passes a red-free check.

### Gate two, and the differences that are allowed

`TRANSLATED_PAIRS` declares the `-en` copies and the differences between them, and
the test asserts the differences are *exactly* those. LCS over the command lists,
the Hebrew one mapped through the prelude's pairing, the English one as written; the
assertion is on the two remainders. A plain `zip` would report twelve differences
for one mistake, which is a message nobody reads.

All three allowed differences are **direction**:
- the Hebrew letter wraps `ב"ה` and the phone number in `#משמאל_לימין` (an LTR run
  inside RTL text has to be told or the digits print backwards);
- the English article writes `#bold[…]` around the callout label (in an RTL column
  the colon already separates it; in an LTR one the eye has nothing to catch on);
- and the one this found, a **cross**: `#שמאל` against `#right_`. Same slot — the
  end of the line, left in RTL and right in LTR — so the two copies use opposite
  alignment commands for one gesture. Reading that as drift, or "fixing" it, would
  have made one of the two letters wrong.

### The gate caught this work's own drift, on the first run

`article-en` was named, with the three commands just added to `article.ksav`. A
deferred note is a *document feature*, not a Hebrew one, so both copies have it
now — translated, in the same slot.

### Fences, each shown red for the reason it was written

| Mutation | Caught by | Named |
|---|---|---|
| `#הדגשה[…]` added to `letter.ksav` only | the in-step gate | `#הדגשה is in the Hebrew copy and not the English one, and it is not a declared difference` |
| `#מפתח_ענינים()` removed from `sefer.ksav` | the coverage gate | `the topic index` / `#מפתח_ענינים() — in no template at all` |
| `Adret` in the new English text | `spell.rs::ksavs_own_templates_are_not_underlined` | `templates contain flagged words: ["Adret [en] (article-en)"]` |

The third is the standing lexicon check earning its place. `adret`/`adrett` went
into the hand-curated supplement beside `gra` and `rambam` — the generated lexicon
is **not** regenerated, because the supplement is compiled in separately and the
generated file's own header says hand additions belong there.

### Two of the repository's fences were right again

`skips.test.mjs` rejected the in-step gate for no floor under its `continue` (two
files that stopped parsing to commands would compare empty against empty and pass);
it now asserts at least eight commands matched and each copy holds at least twelve.
`documentation.test.mjs` rejected the log, `PLAN.md` and the README for a stale
engine-test tally. Fixed at the source in each case.

### Phase 1 is now complete

#25, #27, #28, #29 — all four closed. Next is Phase 2, security criticals, starting
with **#50** (the missing-chapter marker injecting a name into Typst unescaped).

Engine tests 995 → 999. Editor assertions unchanged at 7,633. The two oracle
fixtures regenerate because the templates are in them — the staleness fence doing
its job.

---

## 2026-09-25 · #50 a chapter name is not a Typst program (closed)

### Phase 2, first item. The bug

`include.rs`'s `marker()` was `format!("#חסר_הכללה[{what}]")`, and `what` is a
chapter name out of the sefer. A content block is not a string: a `]` inside `[…]`
closes the enclosing call and everything after it is **live Typst**. A sefer with a
part called `a]#evil[` compiled a call to `evil`. A file name is not a trusted
input — it is whatever the writer typed, or whatever arrived in a `.ksav` file
somebody was sent.

Three call sites reached it (missing part, cycle, over-deep nesting), all building
the same string for the same reason.

### The fix, and where it lives

`marker` now runs its argument through `escape::content` — the engine's one answer
to "what does Typst read as markup", the table `escape.rs`'s own header records as
having been copied wrong twice already.

It is in `marker` and not at the three call sites on purpose: an escaper somebody
has to remember to call is missed on the fourth `format!` at 3am, and
`marker(what: &str) -> String` leaves no way to reach the content block without
going through it.

### Both halves of the test went red on the fix, and that is the record

**1.** The first version asserted on the **diagnostics** and failed. The
missing-document problem reads `אין מסמך בשם "a]#evil["` — it quotes the name
**unescaped on purpose**, because it is a sentence for a person who needs to see
the name they typed. Escaping that would be a different bug, and asserting on it
tests the wrong string. The surface that matters is the compiled body.

**2.** The second version asserted `!expanded.contains("#evil")` and failed too:
the *escaped* form is `a\]\#evil\[`, which **contains** `#evil` as a substring. A
`contains` check cannot tell an escape from a hole. The assertion is now
**equality** against `#חסר_הכללה[` + `escape::content(…)` + `]`, which is also the
stronger claim — it catches a name that escaped too *much* as readily as one that
escaped too little.

### The class, as a new prohibition

`prohibitions.test.mjs` gained a repo-wide rule: a `format!` that builds Typst
markup with a `{…}` in a **content block**. That is the interpolation
`escape::content` answers and the dangerous one; a `{…}` inside a *string literal*
argument is `escape::string_literal`'s job, and the two are not interchangeable —
which is why the rule names the bracket rather than the brace.

Scoped to `ksav/engine/src/*.rs`, with `include.rs` the one exemption: a claim
with a Rust test attached, not a name on a skip list, so the marker ceasing to
escape takes the exemption with it.

**Shown to fire**: a `format!("#הערת_צד[על {title}]", …)` added to `lib.rs` turns
the sweep red — in a file holding twenty-nine *correct* interpolations. That
discrimination is the rule's whole worth; a prohibition that flagged `show_rule`
would have been switched off within a week.

### A limit stated rather than fixed

`include.rs` reads the name as the *text* of a string literal without unescaping
it, so a name cannot contain a quote and cannot express an odd backslash. Minor and
not injecting, so out of scope; the backslash is covered in the test by the
`MARKUP` sweep, which reaches it through `expand` directly. Recorded so the next
reader does not read the omission in the hostile-name list as an oversight.

Engine tests 999 → 1001. Editor assertions 7,633 → 7,638. Next in Phase 2:
**#51**, opening a `.ksav` executing `customCommands` with no warning.

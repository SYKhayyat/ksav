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

---

## 2026-09-25 · #51 a document that runs code says so (closed)

### The measurement that changed the fix

The report says a shared `.ksav` "ships arbitrary `#let`/loop/package code that
runs on open/compile with no prompt or diagnostic". Two facts in the engine bound
that before I wrote a line of the fix:

- **No network, no disk outside `packages/`.** `typst-as-lib` offers a resolver
  that *downloads*; this one declines it and builds a resolver whose root **is**
  the bundled package directory. `lib.rs` on `packages_root`: *"a document cannot
  reach anything else on the disk through it."*
- **A bounded run.** `server.rs` compiles on its own thread; the pool thread only
  *waits*, with a timeout.

So the honest sentence is the small one — *the document runs the commands it
carries, they can change what the page says, and here they are* — and I pinned the
wording against five overclaims (`arbitrary`, `malicious`, `untrusted`, `attack`,
`exploit`) because "improving" a warning into a scary one is the likely next edit
and it would be wrong in both directions.

### Which clients were actually silent: three different answers

| Client | Before | Now |
|---|---|---|
| browser | **not silent** — the palette lists the document's commands, chipped `fromDocument` | unchanged; `commands.test.mjs` already fences it |
| CLI | silent | one `warning:` line naming them |
| Emacs | silent | one `message`, once per open |

The browser was the informative measurement. `available()` already carries
`from: "document"` and `i18n.ts` has `fromDocument`. What it does *not* do is show
the preamble's **text** — the names, not the code. That is a UI decision rather
than a defect, so it is written up on the issue, not decided here.

### The two halves

`DocFile::advisories()` is one list holding both kinds: the missing-asset warning
that predated it, and the new one. `main.rs` used to format the first itself, and a
second formatter is a second wording.

In Emacs, `ksav--announce-preamble` fires from `ksav--unwrap` — the single door
where a file's container is adopted.

### Two traps in the Emacs half, both recorded in the code

**The first name-scanning regex matched nothing, and the suite was green.**
`\\(?:#\\)?let[ \t]+\\([^ \t\n()\[\]{};,]+\\)` — bisected in a file rather than
through shell-escaped `--eval`, the culprit is Emacs's regex reader taking `}` in
a bracket expression as the start of an interval, so adding `{` to a negated class
made the whole pattern match no preamble at all. `[[:alnum:]_]` is the fix and the
better class anyway: an identifier is a run of word characters, and a negated
class has to escape brackets, braces and commas to say the same thing.

**`with-message-to-string` does not exist** — the name sounds right. And
`message-function` is read by the interactive `message` *command*, not the
function, so binding it captures nothing and the test passes for the wrong reason.
The capture is `cl-letf` over `message`, and the docstring on `ksav--say` says why
both of the others are wrong.

### Fences, each shown to do its job

| Where | Mutation | Result |
|---|---|---|
| `docfile.rs` | the advisory suppressed | three tests red |
| CLI | a `.ksav` carrying a preamble | `warning: … defines its own commands and they are compiled with it: …` — it names both, `דגש, mine`, and their size, two of them over two lines |
| CLI | a plain `.ksav` | nothing; the compile line otherwise identical |
| `ksav.el` | the announcement suppressed | `ksav-the-announcement-names-the-commands-and-their-size` red |

The negative half is asserted as firmly as the positive one in both languages: most
`.ksav` files are plain text, and an announcement on every open is one nobody
reads.

Engine tests 1001 → 1006. Editor assertions 7,638 → 7,639. Emacs 60 → 63. Next in
Phase 2: **#53**, the engine's SVG `innerHTML` and attribute passthrough.

---

## 2026-09-25 · #53 engine SVG innerHTML (closed)

### Measured first, and the measurement changed the verdict

Built the hostile file the issue describes — a `.ksav` carrying an SVG asset with
`<script>`, `onload` and a `foreignObject` — and compiled it:

```
warning: hostile.ksav:3:1: image contains foreign object
<image xlink:href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0i…" width="30" …/>
grep -c script  hostile.page-1.svg  →  0
```

Typst does **not** inline an SVG image; it base64-encodes it into an `href`. And
it escapes text, so a document whose body is `<script>alert(1)</script>` is text.
So both obvious payload routes were already closed, and the finding that survives
is the **absence of a fence** — a path safe today because of an upstream encoder
is one Typst version from not being, and nothing here would notice.

The number that replaces the argument: `alarming: []` over the whole corpus.

### The allow-list is generated, and the reason is one name

`emit-svg-vocabulary.rs` compiles every template plus two documents for shapes
they do not reach, scans every page, and writes `svg-vocabulary.json`;
`emit-svg-vocabulary.mjs` turns it into `svg-vocabulary.gen.ts`. Ten elements,
twenty-two attributes.

And there is a name in that list nobody would have written down: **`<a>`** — Typst
emits an `<a>` with a transparent `<rect>` and no `href` for a link's hit area. A
list written by reading the markup drops **every link in every document**, silently,
and no test in this repository renders a document and asserts anything about links.

The **denied** list is not generated: refusing a name is a judgement, and
`svg_output.rs` asserts the two never disagree about a name the engine actually
emits — the only disagreement with a consequence.

### Three bugs the tests found

1. **Dropping a tag is not dropping the thing.** Dropping `<style>` and passing the
   body through emitted `*{background:url(javascript:…)}` as text. The
   hostile-input list caught it because the string still said `javascript:`. A
   filter that removes a tag and keeps what was between them has reclassified it,
   and "inert text" is a claim about a consumer nobody has checked.
2. **A denied *self-closing* element spun the scanner for ever.**
   `<animate attributeName="href" values="javascript:1"/>` — the branches that
   handle a refused element advanced `i` only when it had content to skip. A
   **crash**; the process dumped core. The two shapes that hang are the two no
   engine output has ever contained.
3. **The measurement itself was wrong first.** Its attribute reader split a tag
   body on whitespace, so every path segment in every `d="M3.15 3.6…"` became an
   attribute name — 30,000 names that were numbers. A measurement that does that
   is worse than none, because it looks like a vocabulary.

### `DOMParser` was the first shape, and the harness decided it

Parse with `DOMParser` and build with `createElementNS` is structurally the best
answer: a name not on the list is never created. It is also untestable here —
`test/harness.mjs` says a `document` on `globalThis` is enough to convince
`@codemirror/view` it is in a browser, so it installs none, and a fence needing a
real DOM is a fence that gets skipped wherever it is inconvenient.

The same constraint answered the wiring. My first attempt built the page panes with
`document.createElement` and **three suites went red with `ReferenceError: document
is not defined`** — the harness's own comment refusing exactly that. The fake
host's `innerHTML` setter parses `<div class="page">` runs because that is the
shape `drawPages` emitted before; the wrapper is our markup and the string inside
it has been through the filter, so composing through the host is both supported
and safe.

### A prohibition, with three claims rather than three skips

`prohibitions.test.mjs` forbids engine SVG reaching `innerHTML` (`= ""` is allowed
— that is a pane being emptied). The three exempt files are claims the harness
checks are *still* true of each: `svgsafe.ts` is the allow-list; `preview.ts`
composes a wrapper around a filtered page; `ksav-lang.ts` is a CodeMirror widget
rendering the **application's own** table markup, and it is listed because it is
the *other* `innerHTML` in `src/`.

### Fences, each shown to do its job

| Where | Mutation | Result |
|---|---|---|
| `svgsafe.ts` | a `<style>` body | the body leaked as text; the test said `javascript:` |
| `svgsafe.ts` | a denied self-closing element | the scanner hung and the process died |
| `preview.ts` | back to `node.innerHTML = …` | the prohibition went red on `preview.ts` |
| the fixture | `<a>` removed | the generator refuses; `svg_output.rs` goes red |
| `skips.test.mjs` | — | rejected the staleness test for no floor; it now asserts ≥14 pages came back |

`skips.test.mjs` has made that same complaint four times today and has been right
every time: a walk that stopped finding pages would measure an empty vocabulary,
write it, and leave everything else green over a measurement of nothing.

Engine tests 1006 → 1009, binaries 69 → 70, editor assertions 7,639 → 7,775 across
109 files. Next in Phase 2: **#52**, asset names unvalidated and `ksav.typ`
shadowing the prelude.

---

## 2026-09-26 · #52 asset names (closed) — and Phase 2 complete

### The issue's impact is wrong, and the real one is worse

`#52` said a `.ksav` with an asset named `ksav.typ` "replaces or confuses the
trusted prelude". Measured, the shadowing is **closed by resolver order** —
`with_static_source_file_resolver([prelude_source()])` comes *before*
`with_static_file_resolver(files)`, so the prelude is consulted first, the
attacker's `#let`s never bind, and `#attack` is reported as unknown. `ksav.TYP` is
inert too: `VirtualPath` is case-sensitive.

The rule is kept anyway, for the honest reason: a name the resolver will never
reach is a name that should not be accepted, and the chain is a two-line change
and a plausible one. `ksav.TYP` is deliberately **not** a rule — a rule I cannot
justify trains people to skip the list.

### What nobody had looked at

I walked a list of hostile names through `compile_with`. Two **killed the
process**:

```
panicked at typst-as-lib-0.16.0/src/conversions.rs:23:44:
valid virtual path: Escapes      ← ".."
valid virtual path: Backslash    ← "C:\"
```

`.expect()` on a `VirtualPath`, and **no `catch_unwind` in this crate or in
`server.rs`**. So one unauthenticated request to `ksav serve` with an asset named
`../x.png` takes the worker thread down. That is a denial of service, not a
compromise — and it is why `diagnose_name` is a gate rather than a check.

### Two gates, and the tests are split to say so

- **the reader's**, so a *writer is told* — and before the payload is decoded, so
  a multi-megabyte blob for a refused name is never decoded to find out.
- **`compile_with`'s**, which is `pub` and is what makes the panic unreachable.

Mutation-tested independently: removing the `compile_with` filter brings the
panic back; removing the reader gate leaves the no-panic test green and turns the
two "a refusal is announced" tests red. Either can be deleted without the other
noticing, which is what a single test would have hidden.

### A refusal is not a missing asset

The existing `Vec<String>` means *"a hash this engine does not hold — send the
bytes again"*, and the client's answer is to re-send. A refusal reported there
would **loop for ever**, so it is a different type rendering as a **warning**
diagnostic. On the `.ksav` path it rides on `advisories()` beside the other two,
because a refused name and a missing one look identical to a writer — an image
that is not on the page — and only one is fixable by sending the file again.

`read_list`/`read_one` were a second reader with the same hole in both; they are
**removed** rather than fixed, so `from_json` goes through the cached reader with
a throwaway `missing`.

### The half a threat-model rule always loses

Eleven ordinary names must survive, and they are in a test: `sub/dir/photo.jpeg`,
`a..b.png`, `my logo.png`, `שם-בעברית.png`, `..hidden.png`. So `..` is checked as
a **segment**, not a substring — `a..b.png` is a legal file name, and a gate that
refuses it is a gate somebody deletes.

### A test bug of my own

`with_asset` took a `&str` into a `json!` array, so it produced an array of
**strings**; the reader finds no object and reads it as nothing, so the test was
asserting an empty list for a reason unrelated to the name it was about. The
helper takes a `serde_json::Value` now, and its docstring says why.

### Phase 2 complete

#50 (chapter name into Typst), #51 (a document that runs code says so), #53 (the
engine's SVG through a measured allow-list), #52 (asset names). Next is Phase 3,
correctness highs, starting with **#2** — note-layout hazards, marked Critical.

Engine tests 1009 → 1019, binaries 70 → 71, editor assertions 7,775 → 7,776.
Emacs 63.

### The two clarifying comments asked for, filed under #64 and #68

- **#64** gained the two things its body did not say: that the ordering key is a
  title that is **set** rather than a header that happens to be there (with the
  case that settles it — a commentary keyed to *"where Rashi and the Tosafot
  differ"* has no header to derive from, so a model that only reads headers cannot
  order it at all), and that the sort needs a **footnote-interweave toggle**: a
  unit of B carrying its own notes, anchored inside a footnote of the base text,
  either interleaves with the base's footnote flow or appends to the end, and those
  are two documents rather than a formatting preference.
- The comment also asks the question that decides how big that toggle is:
  interleaving either **reserves a sequence** for the commentary's notes or
  **renumbers the base text's own footnotes**, and the first re-numbers notes the
  writer has already seen numbered.
- **#68** (the companion that mirrors A's structure into the sorted result) gained
  the parts that reach its own resolving test — and one consequence specific to it:
  if the title used for matching is *not* displayed, a transferred heading must not
  be promoted to a title, or a second sort would read the heading it injected as the
  anchor and re-order against it.

Recorded in the SESSION_LOG so there is a trail in the repository, and in the
issues themselves where the work will be picked up.

---

## 2026-09-27 · #2 note-layout hazards — six of seven were already fixed, and the fence is the deliverable

### The audit is a month old and the code moved

`#2` tracks seven hazards from the 2026-08-23 audit (B1–B5, B10, B11), each
`[render-verified]` or `[code-verified]` with a line number. I checked all seven
before touching anything, and **six no longer reproduce**:

| | finding | measured 2026-09-27 |
|---|---|---|
| B1 | `ערוץ:`+`אזור:` filed under one key, filtered under another | note drawn at y=712.5 — does not reproduce |
| B2 | the reserve scanner was blind to the `אזור:` spelling | reserve 3.25cm, ink 712.5, page number 799.02 on an 841.89pt sheet — does not reproduce |
| B3 | two side apparatuses interleaved at 4–9pt | fixture `12-two-regions-side`: first note's last line 137.75, second's first 151.13 — a full 13.38pt pitch apart, **stacked, not interleaved** |
| B4 | a channel-declared height bypassed the clamp | `_ch_region_height` routes it through `_ap_fit_room` now |
| B5 | a carried note arrived at the floor over a pinned one | the carry path calls `clear` now |
| B10 | `שורות()` resolved against two typographies | both halves go through `_ap_line_of` now |
| B11 | a `)` in a quoted argument derailed the paren scan | the scan is over a real parse, not a depth counter |

The fixes each landed **with a comment quoting the finding**, which is how I found
each one. So the code is in better shape than the issue says.

### And that is exactly why the issue is still open

Seven findings, seven comments, **zero tests**. Nothing in `engine/tests/` mentions
any of the audit's own fixtures. The code was fixed by hand and the property was
never written down, so the next rewrite of the side machinery or the reserve
scanner has nothing to fail. That is the whole of #2's remaining value, and it is
`engine/tests/note_layout.rs` — one render regression per finding, each doc
comment recording what was true when it was written.

### The seventh finding was real: a name nobody declared

B2's audit text has a sibling it flags as still open — "a note into a region name
that was never declared compiles clean ... no diagnostic ever says the name is
unknown". Measured: `ok: true`, **zero diagnostics**, ink at y=712.5, which is
exactly where a correctly-filed note lands. Indistinguishable, to a writer, from
right.

So the note is drawn. Nothing is lost. What is lost is the *destination*, and
silently, which is the quieter half of B1's defect class — B1 lost the text, this
loses the place. `unknown_destinations` is a **warning**, on the reasoning
`italic_warning` already states: the document compiles, the note is on the page,
and a writer part-way through a sefer keeps working. What must not happen is that
they never find out. It names the unknown name, lists the declared ones when the
document declares any, and locates the call (3:6, the `ה` of `#הערה`).

The seven tier channels are exempt because they are Typst's own balanced series —
warning on `#הערה(ערוץ: "הערה_ב")`, which is an ordinary sefer, is the noise that
teaches people to skip the list.

### Three of the four mutations fire, and two fences were vacuous

Mutation-tested, one at a time, restoring by md5 because I destroyed a working
tree restoring a stale backup:

- the warning not collected → `an_undeclared_destination_is_named` fails
- the tier channels not exempt → `a_known_destination_is_not_named` fails, and the
  panic prints the exact false positive a writer would have met
- the declared-name check never skips → the same test fails
- the reserve cap `total.min(page_h_cm * MAX_REGION_SHARE)` deleted →
  `a_declared_height_is_clamped` fails
- the channel-declared height ignored → `a_region_height_and_a_channel_height_agree` fails
- the scanner blind to `REGION_ARG` again → `the_region_spelling_reserves` fails
- the `שורות` unit unrecognised → `a_lines_band_resolves_against_one_typography` fails

**Three tests I wrote passed with the fix deleted, and are labelled accordingly
rather than shipped as fences:**

- **B1** — putting the pre-fix filter back (`_rg_show` re-deriving the region from
  the channel's declarations, which is what the audit named) leaves the note
  drawn. That filter is no longer on this note's path. Two document shapes later
  — a channel declaring no region, then a *named* region the channel never
  mentions — it still does not reproduce. The test asserts the property; it does
  not claim to protect that line.
- **B3** — deleting the cross-stream `sorted` in `_sn_placed` changes nothing for a
  two-region document, because for a **linear** document the sort's key
  `(page, want)` is already the document order. The sort only earns anything where
  the two differ: a note inside a table cell, a figure, a deferred section.
- **B5** — I could not build a document that reaches the carry branch at all. Two
  constructions both place the note by a different line, and the first version of
  that test passed with `clear` deleted, so it is **gone** rather than repaired.
  The branch is documented as unverified; a non-linear fixture is the next thing
  to build for B3, and a bounded-ceiling geometry for B5.

That is three of nine. The other six fire.

### A test bug worth the space it took

`a_carried_note_steps_over_a_pinned_one` asserted `carried.page == pinned.page`
under an `if`, so when the two notes landed on different pages — where the bug is
not reachable — it asserted nothing and passed. The mutation found it. It is now
`assert_eq!((pinned_page, carried_page), (2, 2), "the two notes must carry onto
the same page for this to be the bug")`: if the geometry ever moves them apart, the
test says so instead of skipping.

Engine tests 1019 → 1028, binaries 71 → 72, editor assertions 7,776 → 7,777.
Emacs 63, 0 unexpected.

### #2 closed; the verification gap is its own plan item

Filed the two unverified branches as `#2′` rather than leaving them as a paragraph
inside a test file: a non-linear note fixture is what reaches B3's cross-stream
sort, and a bounded-ceiling geometry is what reaches B5's carry path. A sentence
in a doc comment is a promise with no owner; a plan line is a task.

---

## 2026-09-27 · #6 fire-and-forget — the rule, and 43 call sites that did not have one

### Measured first, and the number is worse than the issue's word "many"

93 `void someAsyncCall()` sites, 59 distinct callees. Of those 59, **30 had no
`try`, no `catch` and no `.catch` anywhere in their body** — 51 of the 93 sites.
A `void p()` on a rejecting promise is an unhandled rejection: the browser logs
it, the writer sees nothing, and whatever the handler was halfway through
changing stays changed.

The issue's word for that state was "without an exhaustive policy, a new failure
*can* silently leave stale UI". Measured, 51 existing sites already could.

### `watch.ts` already knew the answer, which is why there was no rule

`src/watch.ts` is the model: `try`, a `catch` carrying a comment that says why a
`stat` that throws is a file that was unplugged and not a conflict, and `busy`
restored in a `finally`. The problem was never that the call sites were wrong. It
was that whether a call site was safe depended on who wrote it that day, and
nothing recorded the answer.

### One function, and the distinction it draws is cancellation from failure

`src/asyncaction.ts`: `action(doing, body)` returns a promise that never rejects,
and `voidAction(doing, body)` is the approved fire-and-forget form. A failure goes
through `troubleSaid` — the repository's existing answer to a caught error, so the
sentence is the reader's and the machine's string is behind the details
affordance — and lands in the status bar. A **cancellation says nothing at all**,
because a superseded compile is the app working and reporting it would teach
writers to ignore the status line.

**48 call sites converted**, the 26 that change which document is open or what is
on the page (`enterDoc`, `openDoc`, `closeOpenDoc`, `newDocTab`, `openInNewTab`,
`newBlankDoc`, `newNamedDoc`, `duplicateDoc`, `reloadFromDisk`, `loadTemplate`,
`setEditingMode`, `saveArrangementHere`, `restoreSnapshot`, `addFont`,
`importDictionary`) plus the 22 unguarded ones elsewhere (`refreshGit`, `runGit`,
`restoreCommit`, `revertCommit`, `compareWithCommit`, `renderHistory`,
`revealCursor`, `jumpFromClick`, `offerRecovery`, `maybeCheckForUpdate`,
`openSharedIfLinked`, `saveFileAs`, `startFromTemplate`, `healAll`, `renumberAll`).

One of them was **awaited**: `void setEditingMode(value).then(rerenderChrome)`
chains `.then`, so it became `action`, not `voidAction` — which is the distinction
the wrapper exists to make visible at the call site.

### Three of them were never promises

`healAll` returns the number of fixes applied, `renumberAll` the number of fields
renumbered, `startFind` whether a find opened. `void f()` on a number discards
nothing that can reject. The typechecker said `Type 'number' is not assignable to
type 'Promise<unknown>'`, which is the honest answer, and they went back to bare
`void` with a note saying why. A rule that wraps a synchronous call to look
careful is a rule that teaches people the wrapper does not mean what it says.

So the sweep now finds 47 sites, 32 distinct, and **every one either returns no
promise or carries its own error handling**. That is the answer to the issue's
"inventory all user-triggered handlers and classify each", arrived at by
measurement rather than by assertion.

### My first `isCancellation` swallowed real failures

It matched a message merely *containing* "cancelled" — so
`Error("cancelled the subscription")`, a broken subscription, reported nothing.
That is precisely the defect this file exists to remove, and a test case in my own
file caught it. The heuristic is gone: a cancellation is `AbortError`,
`TimeoutError`, or this app's own `cancelled()` marker, which is an object rather
than a string so nothing that merely says the word is mistaken for one.

### The fence, and four mutations

`test/asyncaction.test.mjs` sweeps every `void f(` in `src/`, comments stripped
(several mention `void` in prose, and a fence that fires on its own documentation
is a fence people learn to disable). It requires each to be in an inventory with a
reason, requires the inventory not to name a `void` that is gone, and requires
every reason to contain a justification keyword rather than a shrug.

Wrapper behaviour is asserted through the **real built module** and the **real
status bar** — `installChrome()` and `document.getElementById("status")`, the
harness this repository built for exactly this class of bug. My first version
instead read the source, stripped it with Node's own `stripTypeScriptTypes`, and
evaluated it with two dependencies replaced; that worked and it was the wrong
call, since it tests a copy. The version I kept also has a comment about why the
replacement is *named functions* and not inline arrows: substituting a callee with
an arrow expression in place turns `f(a, b)` into `(x, y) => …(a, b)`, and the
arrow body swallows the call.

Four mutations, each run:

- a new bare `void newNamedDoc()` → the sweep fires and names the exact site
- every failure swallowed as if it were a cancellation → the three reporting
  assertions go red
- no cancellation recognised at all → the same three go red
- the wrapper writing its own failure sentence, bypassing `troubleSaid` → the
  "writes no sentence of its own" check goes red

`runner.test.mjs`'s "every module is imported by at least one test" caught that
`asyncaction.ts` was not, which is how it ended up on the normal build path
instead of in `NOT_IMPORTABLE`.

Editor assertions 7,777 → 7,798, test files 109 → 110.

### #6 closed; the inventory is the deliverable, not the wrapper

The wrapper is 60 lines and could have been written in ten. The 32-entry
inventory with a measured reason beside each is the part that stops the next
`void`, and the "may not name a `void` that is gone" rule is what stops the
inventory itself from becoming the thing it replaced — a list that rots into
permission.

---

## 2026-09-27 · #2′ the two branches #2 could not reach

Both closed by finding the geometry, and in both cases the geometry is the lesson.

### B3: one `place` away

`_sn_placed` sorts the streams together with `items.sorted(key: it => (it.page,
it.want))`. I had deleted that sort and **two documents came out byte-identical**:
two side regions with one note each, and two table cells. The reason is the key —
for a linear document `(page, want)` *is* the document order, and two cells in a row
share a baseline, so a tie keeps the order. A sort that cannot change anything is
not a sort that can be tested.

What it protects is worth more than the audit's interleaving. Anchor one note 300pt
down the page and the next at the top, so the source order is the **reverse** of the
reading order — which is the only situation where the sort does anything:

```
#place(dy: 300pt)[#הערה(אזור: "ר1")[הערה במקום גבוה]]
#place(dy: 0pt)[#הערה(אזור: "ר2")[הערה במקום נמוך]]
```

With the sort: 406.08 and 106.08, each at its own marker. **Without it: 406.08 and
432.66** — the second note drawn 326pt from the word it belongs to, in the other
apparatus's band. A note a reader cannot find from its marker is B1's defect class
arrived at from the other direction: the text is drawn, and it is somewhere else.

### B5: four wrong documents, and the fourth is the whole one

1. **A page with no paper grows.** The carry branch's guard is
   `y + it.h > ceiling`; `ceiling` is `_pg_text_bottom()`, which is `none` unless
   `page.height` is a length. `רציף` (continuous) is off by default, but
   `page.height` is still `auto` unless `#מסמך[…]` is the thing carrying the
   setting — so the document has to be *inside* one.
2. **The note has to be too long for its page.** A 500pt note anchored at the top
   of page 1 fits, and then there is nothing to carry. 200 repetitions of a phrase
   does not.
3. **The pinned note has to hold the top of the page being carried *onto*.**
4. **And `clear` was a no-op while the pinned note was the immediately preceding
   item** — because `cursor` is already `y + it.h + gap`, the same arithmetic
   `clear` performs. My first two attempts died on exactly this, and a test that
   could not fail is worse than no test. Hence a page break: the pinned note is the
   first line of page 2, and the carried note arrives at the top of page 2 having
   been anchored on page 1.

Measured with `clear` deleted: carried at **y=90.24**, pinned at **y=95.63**, same
column, same page — 5.4pt apart, and the two are 40pt and 500pt tall. That is the
audit's sentence, reproduced: *a note printed straight through it*. With the fix,
135.40, which is 39.8pt below the pinned note's top — its height, exactly.

Both mutations confirmed to fail with the fix deleted. `note_layout.rs` is eleven
tests and **nine of them now fire with their fix removed**; B1 and B3's stacking
property test are the two that do not, and both say so in their own doc comments.

### The documentation fence caught me stating a count as prose

The #6 mutation table gave a count. `documentation.test.mjs` refuses a
numeric claim in a living page that no declaration backs — and it is right: I had
written a mutation result in the shape of a suite fact, which is exactly what that
fence exists to stop. Spelled out as "the three reporting assertions go red", which
is what it was.

Engine tests 1028 → 1030.

---

## 2026-09-27 · #5 config setters — sixteen of fifty, and the check was in the wrong place

### What the audit said, and what it was

"Several config setters accept unknown keys while sibling setters reject them;
typos become dead settings." Measured across all fifty `הגדרות_*` commands: **16
of 50 compiled clean on a misspelled knob.** Not a degraded page — an *unchanged*
one, with the writer's control reading back exactly what they typed and nothing
happening.

My first sweep was wrong twice before it was right. A static scan for `_cfg_strict`
reported **45 of 55 loose**, because most of those delegate to `_mk_set` and my
scan only looked at each command's own body. Then a sweep keyed on the string
"unrecognised argument" reported 17, of which two refused in their own words
("אין הגדרה בשם") and one for a missing positional — the *inverse* error, calling
a strict command a gap. The sweep that was right asked one question: does the
document compile?

### The root cause is better than "somebody forgot"

Seventeen of them validated **inside their `update` closure**, and a state's update
closure runs only when something reads the state. So the check was not a check; it
was a rule that fired on the next note. Against the pre-fix prelude, measured:

```
#הגדרות_טקסט_הערות(טיפא: true)   ok: true      …and one #הערה      ok: false
#הגדרות_כותרת1(טיפא: true)        ok: true      …and one = כותרת   ok: false
```

Two failures, and the second is worse. The document compiled when the writer typed
the typo, and stopped compiling later, on an unrelated edit, naming an argument
written a page ago. `#הגדרות_מספור` was already checked outside its closure and
says why in a comment — the difference between the two was which line somebody
happened to edit.

### The helper already existed, and I wrote a second one

`_cfg_validate`'s doc comment claims it is *"at the public boundary of every
settings command"*. Four commands used it. I did not look before writing, so I
wrote `_cfg_knobs`, put it after the commands that needed it — **and broke
`הגדרות_טקסט_הערות`**, because Typst has no forward references. The only thing
that noticed was the container probe, which filed a working command as
*undecidable* because every shape it tried now failed. That is the argument for
the probe existing.

Deleted mine, and strengthened the real one: it takes the named half of the
arguments (so a command handed a dictionary can use it), accepts either a defaults
dictionary or a bare list of keys, accepts extras, and **prints the legal list**
with the refusal. Twelve commands route through it now.

### Three of my own errors, and what caught each

- **Braces.** Wrapping `_hd_set` in a block without closing it broke the whole
  prelude from that line on: 65 tests red, and the first failure was a registry
  test that disagreed with itself about which `#let`s exist.
- **`type array has no method 'keys'`.** `_nt_keys` is a list, and I passed it
  where a dictionary was expected. The *typo sweep* caught this, not the test
  suite — because a panic is a non-compile too, and the sweep was only asking
  "did it fail". It now requires the message to **name the key the writer typed**,
  which is what distinguishes a refusal from any other failure.
- **A static fence that cried wolf.** `no_settings_command_skips_the_key_check`
  first read one line per command and reported seven violations, every one a
  command whose check is on line two. Then, after reading whole bodies, it
  reported 26 — because it took the first `{` after the name, which for
  `#let הגדרות_ציון(..opts) = _mk_set("ציון", …)` is the *next command's* brace. It
  reads balanced-one-line or brace-matched, and it recognises the phrasing
  `הגדרות_מספור` uses, because a sweep that calls a command which checks a
  violation gets deleted rather than amended.

### The other four sub-items, which are not code

- **`purge_ratio`** has no owner anywhere in this repository, and `issue-notes.md`
  already said so: *"adding that setting would invent a contract"*. Not added.
  A safety value with no subsystem that needs it is dead configuration with a
  domain test attached to it.
- **Tool probing is already bounded and machine-readable.** `git_run` has a
  120-second `DEADLINE` with a kill, and `version()` reads
  `"git version 2.54.0.windows.1"` with `rsplit(' ').next()` — no locale, no
  substring match — cached in a `OnceLock` because git does not upgrade itself
  under an open drawer.
- **Installer and Windows archive names**: there is no installer here. `packaging/`
  is a Dockerfile and two shell scripts; no Rust code writes an archive, so
  "reserved-name and traversal handling" has no site to be right or wrong in.
- **Grammar spans**: `line_column` exists in the engine and carries 1-based
  line and character column, and a `DOMException` crossing a worker boundary is
  matched by name for the same reason `isCancellation` matches by name.

### What is fenced

`engine/tests/settings_keys.rs`, six tests. All fifty setters must refuse an
unknown knob **by name**; the refusal must happen in a document with nothing that
reads the state; **every key the refusal offers must itself be accepted** (a list
that offers a key it then refuses is worse than no list); a global knob is still
global; and no settings command may skip the check, read out of the prelude so a
fiftyth command added next year is swept without a line being written here.

Five of the six fail against the actual pre-fix `ksav.typ`, restored from git —
which is the mutation that matters, rather than a reconstruction of it. An earlier
attempt at the "inside the closure" mutation passed all six, and the honest
conclusion is that my reconstruction was not faithful; the real pre-fix file is
what proves the claim.

`skips.test.mjs` then called the static sweep by name for keeping its assertions
inside a loop, and it is right: a sweep that matches nothing passes everything it
has. It now asserts a floor on the number of commands examined.

Engine tests 1030 → 1036, binaries 72 → 73. Editor assertions unchanged at 7,798.
The container fixture is **byte-identical** — `emit-containers` learned to tell
"I refuse this argument" from "I am not a container", so a strict setter stays
`transparent` rather than being reclassified.

### #5 closed, and the four sub-items that were never code

Worth saying plainly, because the shape recurs across this plan: an audit lists
five findings, one is a live defect with a root cause nobody had named, and four
are either already done or describe software this repository does not have. The
useful move was to say which, with the measurement, rather than to invent work to
match the list.

---

## 2026-09-27 · #3 i18n — eleven strings, and the hole is smaller than the issue's framing

### The infrastructure was already there

`setSetting("lang", …)` already called `localise()` and `rebuildOpenPanels()`, and
`localise` already sweeps all four label kinds — `data-i18n`, `-title`, `-label`,
`-placeholder`. A previous fix did the hard part. The issue's framing ("a complete,
testable localization architecture") describes the absence of *evidence*, not of
code.

### What was actually wrong, and it is not "Hebrew left on screen"

`t` falls back to `DICTS.en[key] ?? key`, and the i18n module says why that is right
at a call site — *"a writer sees a word rather than `sc.hiddenBreak`"*. So a key
with no English entry does not look missing. **It looks like a developer name.**
Measured against the built module:

```
setLang("en"); t("refreshTitle")  →  "refreshTitle"
setLang("en"); t("sourcePasted")  →  "sourcePasted"
```

Eleven of them — and not in a corner. `refreshTitle` is a **panel heading** and
`sourcePasted` is a **status line**. An English writer was not seeing Hebrew, which
is the defect everybody looks for; they were seeing a key name, which nobody looks
for. 919 Hebrew keys, 908 English.

This is why a dictionary test is not enough. `hasKey` answers *"is this in either
shelf"*, and a Hebrew-only key answers yes. The question is the other one: **is it
in the one the user is reading?**

### A Latin-script detail that would have shipped wrong

`sourcePasted` in Hebrew interpolates `${GIRSA}`. My first English version did the
same, which produced *"A source was pasted from גִּרְסָא"* — a Hebrew product name
inside an English sentence, which is the exact defect `language.test.mjs` exists
to prevent, in the one file meant to prevent it. Every other English line spells it
`Girsa`. Fixed.

### Two rules in the fence that were wrong, both catching good translations

The check I wanted was "no English value is its own key name". First attempt flagged
`words: "words"`, `chars: "chars"` and `recovered: "recovered"` — all real, all
with a Hebrew entry that differs. Second attempt went after "looks like an
identifier" and flagged `importWord: "Import from Word (.docx)…"`,
`copyFailed: "Copy failed — use \"Word (.doc)\" instead."` and
`git.installGit: "Install git: git-scm.com"` — a file extension and a URL.

What survives both is exact: **the value is the key, and the key is a name** —
camelCase or dotted. `refreshTitle: "refreshTitle"` is that; nothing in a real
translation is. The three cognates are now named in the test with their Hebrew
entries, so the next reader does not re-litigate them.

### The e2e the issue asks for, and the part that cannot be one

`installChrome` gives a `document` whose `querySelectorAll` returns `[]`
unconditionally — so `localise(document)` is a no-op that passes everything asked
of it. A browser test is not available and a test that claimed to open every panel
would open none.

What *is* testable is the real `localise` against the real dictionaries, on a root
implementing exactly the four selectors and the setters the sweep uses. That catches
the realistic regression — a dropped `data-i18n-title` line — and drops one `say(…)`
from `panels.ts` to confirm. Recorded as a gap, not approximated.

### Two vacuous assertions of my own, both in the same line

The per-attribute loop filtered on `n._attr`, which the rewritten node factory no
longer carried, so `mine` was empty and `every` on an empty array is true — and it
only *read*, so it compared Hebrew nodes against an English test. Two bugs pointing
at one assertion that could not fail. Found by the idempotence check immediately
after it, which is the only reason it was found at all.

### Mutations

- a new Hebrew-only key → "every Hebrew key has an English entry" and the size check
- an English value reverted to its own key name → two assertions, naming the key
- the `data-i18n-title` sweep dropped from `localise` → four assertions

Editor assertions 7,798 → 7,836, test files 110 → 111. Engine untouched.

### #3 closed; the browser harness is the honest remainder

The issue's own acceptance criteria are not all met, and the record says which:
"no visible or accessible text left in the old language" is fenced against the
sweep, but "open every panel, switch, read the screen, reload" needs a browser this
suite does not have. The gap is in the issue, not in the work.

---

## 2026-09-27 · #3′, asked for directly: can the language switch be tested for real?

### Yes, and the answer is that the unit test was measuring the wrong thing

A browser was here the whole time — `playwright-core` with a Chromium already in
`~/.cache/ms-playwright`. It would not start, because Nix keeps each shared library
in its own store path and none is on the default search path. About twenty were
missing; resolving them by name and walking the list until `ldd` came back clean
took four passes, and two of them — `libasound`, `libudev` — are present in a
32-bit and a 64-bit build, so the resolver has to check `EI_CLASS` and the failure
otherwise reads `wrong ELF class: ELFCLASS32`, which names nothing.

Then it worked, and the built application booted: **7,845 characters of Hebrew UI,
zero console errors**, the settings drawer open, thirty-one headings.

And the switch works. `dir` flips `rtl`→`ltr`, `lang` becomes `en`, the chrome
turns English, the choice is written to `localStorage` and survives a reload.

### And 114 Hebrew strings were still standing

That is the finding, and it is a whole layer the dictionary fence cannot see.

**Fifty of them are keys that have an English entry already** — `previewSide`,
`closeTab`, `searchScope.source`, `retrySave`, `untitled`, `zoomPane`,
`splitAcross`, the five `*Lede`s. They are written into `aria-label` and `title` at
boot, and `localise()` cannot reach them because nothing tagged them. This is the
defect `i18n.ts` already describes — *"a title that looked right until somebody
changed language, and then stayed in the language it was born in"* — fixed for
`panelHead` and never swept for the other twenty-odd sites. The `*Lede` family is
the systematic case: `panelHead` tags the head, the lede is the panel's own child,
so **every panel with a lede has an untagged one**.

**Sixty-four are composed strings** — `"פתח · Alt+a"`, `"Rename: ללא שם"`,
`"⟳ התצוגה אינה מעודכנת"`. A label, a separator and a shortcut, concatenated. One
attribute holds one `t(key)`, so these need a message *with parts*, which is a new
mechanism rather than a missing tag — and the reason the residue cannot be closed
by sweeping for `[data-i18n]`.

### The shape of the blindness is the lesson

`uilanguage.test.mjs` proves the catalogues hold the same keys in both languages
and that `localise()` sweeps the four attribute kinds it is given. Both true.
Neither says anything about **what the DOM holds**, and the defect lives entirely
in the gap. A catalogue test is a test of the *data*; a language switch is a
property of the *rendering*. I said that gap needed a browser, and it did, and the
browser found on the first run seven keys a hand-written `RESIDUE` list had
missed — which is the argument for measuring rather than listing.

### What ships

`test/browserlang.test.mjs`, twelve assertions against the real window: the toggle
is pressed the way a writer presses it (found by its accessible name *in the old
language*, which is the only way a writer can find it), `dir`/`lang` flip, the
header reads English with a document's own title excluded because a Hebrew
document's title is supposed to be Hebrew, the choice is written down and survives
a reload.

The residue is a **ceiling, not a zero**. A test asserting zero would be red on
arrival, and a red test is a complaint rather than a fence. The direction that
matters is enforced instead — *no catalogue key stands in Hebrew that the file has
not recorded* — and a mutation confirms it fires by name. The recorded set is
allowed to be a superset of what is visible, because which panels are open changes
the visible set and a fence that fails for a reason outside what it watches is a
fence people switch off.

It skips **loudly** where there is no Chromium, naming which of the two it lacked,
rather than failing for a reason that has nothing to do with the application.

### Two fences caught me being lazy

`gate.test.mjs` refused a README note that spelled `npm test` — correctly, since a
second copy of a check command is the drift that fence exists to catch. And the
`Rename: ללא שם` in my header assertion was a false positive: a document's own name
in its own language is correct, and only the verb is this app's text.

Filed as **#71**, with the 31 keys named and the two defects separated, because they
have different sizes: one is a sweep, the other is a mechanism that does not exist
yet.

Editor assertions 7,836 → 7,848, test files 111 → 112.

---

## 2026-09-27 · #71, first slice — the mechanism, and 9 of 50 keys

### Fifty keys with an English entry and no way to be re-localised

The residue was not fifty missing translations. It was fifty strings written into
`aria-label` and `title` at boot, holding keys the catalogue already answers, in
elements nothing had tagged. Three changes to `localise`, each for a shape the
measurement forced:

- **`data-i18n-both`** — `iconBtn` and `glyphBtn` both write `title` *and*
  `aria-label` from one argument, so tagging such a button meant writing the same
  key twice, and at twenty-odd call sites that is twenty-odd chances to write one
  and forget the other. One marker, both attributes.
- **`data-i18n-args`** — for a key whose value is a template. 64 of the strings
  were *composed*: `"פתח · Alt+a"`, `"Rename: ללא שם"`. One attribute holds one
  `t(key)`, so a sentence with a part in it needed something that did not exist.
- **A leading `:` means "this argument is a key".** A chord is a chord in either
  language; the label beside it is `sc.open` and is not. Guessing which is which
  from the catalogue is precisely the trap `hasKey`'s own comment describes, so
  it is spelled in the value instead.
- **Per-attribute arguments**, because the ribbon's button carries *different*
  strings: `title` says `name · shortcut` and `aria-label` says `name` alone,
  since a screen reader has no use for a chord. One shared list would have forced
  the accessible name to gain "· Alt+a".

### One function builds the whole note ribbon

`noteBtn` — a title of `t("sc." + action) + " · " + hint`, passed to `iconBtn`.
One site, thirteen buttons, and the chord is an argument rather than part of the
key. Verified in a real window: `"הערת שוליים · Ctrl+Shift+F"` →
**`"Footnote · Ctrl+Shift+F"`**.

The pane cluster went with it: `splitAcross`, `splitDown`, `zoomPane`/`unzoomPane`
(whose marker is itself a ternary, or the button would re-localise to the state it
was *not* in), `paneMenu`, `closePane`, `scrollLinked`, `previewStaleHow`.

**31 keys → 22. 64 composed → 41.**

### The ceiling could not see its own mechanism, and a mutation said so

With the `:` convention deleted, `tf` receives `":sc.footnote"` untranslated and
produces `":sc.footnote · Ctrl+Shift+F"` — which is **not Hebrew**. The residue
count goes *down*, and the ceiling is satisfied by a window that is worse than
before. A ceiling measures *less bad*; it cannot see *differently* bad.

So the mechanism is asserted directly: after a switch, no attribute value and no
text may be an unsubstituted `{0}` or a `:key`. The same mutation now fails with
`aria-label=":sc.footnote · Ctrl+Shift+F"` named in the message.

### Three of my own errors, each caught by something

- Wrote the new helper in the wrong place and **broke a command** — Typst has no
  forward references — and the only thing that noticed was a container probe.
- Set `data-i18n-both-args` on an element carrying `data-i18n-title`, so the
  marker was inert. Only a DOM dump showed the attributes were missing while the
  isolated unit test passed.
- A codemod matched the **wrong `glyphBtn`**: it produced a duplicate
  `data-i18n-both` on `splitAcross` while aiming at `scrollLinked`. `tsc` caught it
  (`TS1117`), which is the whole argument for a typechecker on a codemod.

And a stale `.tmp-test` bundle made the isolated test report `"{0} · {1}"` as the
translated value, which looked exactly like a mechanism failure.

### What is left, measured

22 catalogue keys: tab and pane furniture, the two view panes' own names, the
nikud toggle, the four search-scope rows, and the ledes — `outlineLede`,
`notesPaneLede`, `marksPaneLede`, `findLede`, `previewFollowsLede`, `welcomeTitle`,
`narrowLede`, `notesPaneEmpty`, `mark.added`. **Every lede is a `panelHead`
sibling**, so the systematic fix is for `panelHead` to tag the panel's lede rather
than twenty panels each doing it.

41 composed, of which about 13 are the file and theme ribbon (`פתח · Alt+a`,
`סגול · Alt+d`, `חטף סגול · Alt+z`) — the same family as `noteBtn`, a different
builder. The rest are legitimate: niqqud letter samples (`אְ אֱ אֲ`), Hebrew
document source in textarea placeholders, and English text *about* Hebrew
("Off by default: in Hebrew the geresh and gershayim"). Those are counted by the
ceiling and should not be chased.

Editor assertions 7,848 → 7,849. Engine untouched.

---

## 2026-09-27 · #71, the rest of the keys — 50 → 2

### The ledes were one missing helper, not five missing attributes

Every drawer's lede was `el("p", { class: "pane-lede" }, [t("someLede")])`. The
head beside it is tagged by `panelHead`; the lede was not. Five were standing in
Hebrew — `outlineLede`, `notesPaneLede`, `marksPaneLede`, `findLede`,
`previewFollowsLede` — and the *class* they all share is not a tag: `localise`
reads attributes, and nothing there had one. So the lede got the helper the head
got (`panelLede`, with `panelHead`'s own contract that the argument is a key), and
`welcomeBody` and `welcomeTitle` came with it.

That is the shape worth keeping: **five attributes versus one helper**, and the
helper is the only version that also stops the sixth drawer doing it wrong.

### A shared class is a naming convention, and `hasKey` is how you check one

`selectRow` takes a `labelKey`, and its options are `[value, label]`. The option
keys are `<labelKey>.<value>` — `searchScope.source` for the `searchScope` row —
and that is a *convention*, not a contract. So the convention is **checked**:
`selectRow` tags an option only when `hasKey(\`${labelKey}.${value}\`)` is true. A
row that does not follow it goes untagged, which is the old behaviour, rather than
being re-localised to a key that means something else. Guessing a key name and
building an attribute from it is the failure mode `hasKey`'s own comment describes,
and a check is the whole difference between a convention and a guess.

The same four `searchScope.*` keys were standing in **two** places — the settings
drawer and the find panel — and one count would not have shown that. Both tagged.

### Two elements that are built by something else

- `head.title = t("swapPaneDrag")` — a **property** assignment on a head built
  earlier. `localise` reads attributes, so the handle also gets
  `setAttribute("data-i18n-title", …)`; a tooltip set after the fact is a tooltip
  that cannot be re-localised.
- `nameMarks({ added: t("mark.added"), … })` — the change-gutter marker is
  **built by CodeMirror**, so it is never handed back to a builder that would know
  to tag it, and by the time the marker existed the key was gone. `nameMarks` now
  takes the keys beside the sentences, and `toDOM` writes both.

### Fifty keys → two

`untitled` and `welcomeTitle` are what is left, and they are the right two:

- **`untitled` is a document's own name.** It reaches the tab, the title bar and
  `<title>`. A document created while the interface was Hebrew is called `ללא שם`,
  and in English it reads `Untitled` — a document named in the language it was
  created in, which is right. Tagging it would **rename a writer's file on a
  language switch**, which is a considerably worse bug than a Hebrew string.
- **`welcomeTitle`** is one untagged `<span>` outside the document editor — a
  second rendering of a string `panelHead` already tags correctly. Not a
  systematic case, and I did not find the site by reading; the browser found it by
  asking which element held the text.

The ceiling in `browserlang.test.mjs` is now `keys: 2, composed: 41`, re-measured
rather than edited by hand, and every recorded key carries why it is still there.

### Two fences caught me being careless, and both were right

- `panelede.test.mjs` asserts `t("marksPaneLede")` appears in `main.ts`. Moving
  the `t()` into a helper **broke a test that was checking the wrong thing** — it
  asks whether the pane says what it lists, not which line renders it. Widened to
  accept either spelling, with the reason written down, rather than reverting the
  helper.
- `readme.test.mjs` refuses a living page that names a shortcut the product does
  not bind. My session log illustrated the point with an invented chord — one this
  product does not bind — written in the backticks the sweep looks for, which is
  the violation reproduced inside the sentence reporting it. Rewritten to say
  that a chord is a chord in either language, which is the same point and survives
  the sweep. The fence is doing exactly what it is for: a plausible sentence about
  chords, in a document that names chords, is a claim about which chords exist —
  including when the sentence is *about* the claim.

### #71: 114 → 43, and the two that must stay

The headline number moved from 114 to 43, and the composition of it matters more
than the total: two catalogue keys (one of which is correct) and 41 composed
strings, of which about thirteen are the file and theme ribbon — the same shape as
`noteBtn`, in a different builder — and the rest are Hebrew that *should* stay
(letter samples in the niqqud bar, Hebrew document source in placeholders, English
text about Hebrew). Chasing the last thirteen is the next piece; the ceiling in the
browser test is what says when it is done.

---

## 2026-09-27 · #71, the niqqud bar — and a misreading worth recording

### I read "פתח · Alt+a" as "Open · Alt+a" and built a plan around it

The residue list had fourteen strings of the shape `<name> · Alt+<letter>`, and I
named them *"the file/theme ribbon"* in the plan and in a comment, and said the next
piece was to find the file and theme builder. `פתח` is **patach**. `קמץ` is
**kamatz**, `סגול` is **segol**, `חולם` is **holam**. They are the fourteen niqqud,
and the builder was `buildNikudBar` — the first place I had already been, where I
had tagged the bar's `aria-label` and its hint and moved on.

The tell was available and I walked past it twice: the strings sat on
`class="nikud-btn"`, and I had *just* edited that file. Reading a Hebrew string and
inferring its English is the exact move this repository keeps refusing to make
programmatically — `hasKey` exists because "the value equals the key" cannot tell a
cognate from a hole — and I made it with my own eyes.

### The table held sentences, which is the same defect twice

`NIKUD` was `[mark, name, chord]` with `name` the **translated** string. So the key
was gone before the button existed, and the bar could say nothing else. That is
`nameMarks` again, in a second file, and the fix is the same shape: the table now
carries a key, and `t(nameKey)` is called at the point of use.

Fourteen keys in each half, and the English is **transliterated** — decided rather
than guessed, because it is a product call and the code cannot answer it. The bar
is a Hebrew learner's instrument, and a learner in an English interface needs the
romanisation they will meet in a grammar book: `patach`, `kamatz`, `segol`, `tsere`,
`hiriq`, `holam`, `kubbutz`, `sheva`, `dagesh`, `shin, right dot`, `shin, left dot`,
`shindot segol`, `shindot patach`, `shindot kamatz`. The mark itself is the glyph
beside the label and stays Hebrew in both; only the *name* changes.

### And specimens are not a missing translation

The count was also charging for `אְ אֱ אֲ` — the `א` with each mark on it, shown
because a learner needs to *see* the mark. A font specimen in its own script is not
a string this application failed to translate, and a ceiling nobody can reach is a
comment. The exclusion is deliberately narrow: one base letter plus marks, nothing
else. `אְ` is a specimen; `הערה` is a sentence somebody has to read.

### 41 → 11 composed, and six of the eleven are right

| | |
|---|---|
| `#let דגש(x) = …`, `בסד = בס"ד` | a Hebrew document's own source, in the placeholders offering a first document |
| "Off by default: in Hebrew the geresh…", "Hebrew numbering (א,ב,ג)", "Keep a one-letter word…" | English sentences *about* Hebrew, correct in English and wrong translated |
| `Rename: ללא שם` | the verb is already English; the name is the document's own |

So the real residue is five: `חלונית 1`/`חלונית 2` (a pane number with no key),
`⟳ התצוגה אינה מעודכנת` (the stale-preview notice), `כתב עברי`, and the status line
that carries **both** languages on purpose — `troubleSaid` emits `"he · en"` so a
writer sees theirs whichever it is, which means an English interface reads it
Hebrew-first. That last one is a decision, not a bug, and it is written down rather
than fixed here.

### The fence caught me committing the violation I had just described

Last round `readme.test.mjs` refused my session log for naming an unbound chord, and
the log entry I wrote *about that* quoted the chord in the backticks the sweep looks
for. A sentence about the violation, containing the violation. It has been rewritten
to describe the chord without naming it, which is the only way to write it down —
and the fence is right for a second reason I had not thought of: it does not care
whether a claim is being made or being reported, and neither should it.

Editor assertions unchanged at 7,849. Engine untouched.

---

## 2026-09-27 · #71, the last five — and a fence that caught the fourth

### Two of the five were the document's own text

`כתב עברי` sits in `DIV.cm-content` and `ברוכים הבאים לכְּתָב` sits inside
`BUTTON.outline-item` in `DIV.outline-list`. The first is the document the writer is
looking at; the second is that document's first heading, listed in the outline. A
Hebrew sefer read in an English interface is still a Hebrew sefer, and a writer types
Hebrew into an English interface **on purpose**. Excluding them is not a
convenience — it is the only correct answer, and the fence now skips anything
inside `.cm-content` or `.outline-list`.

Which also removed `welcomeTitle` from the count without my finding its site: the
span the browser kept reporting was the outline's row, not a second rendering of a
head. The browser had told me the element's parent chain three times and I read it
as a bug instead of as an answer.

### The other two were one-line gaps, and one is a template

- `paneNumbered` is `{0}` — the pane's number in its tooltip — and the span was
  untagged. It is a template, so it wanted the argument list, and the number is a
  bare number in either language, so it is not marked with `:`.
- The stale-preview notice was `"⟳ " + t("previewStale")`, a glyph and a word. A
  glyph is not language-dependent, so `msg.glyphThen` puts it in the template and
  passes it as a literal.

### The new one: an error path, because the registries do not load headless

`registriesFailed` appeared, and the reason it is *here* is that the registries do
not load in a headless run — which is exactly the state it exists for. A writer with
no registry gets a sentence saying so, and in an English interface that sentence was
Hebrew. The issue lists status and error paths among the surfaces a switch has to
reach, and this is the first one that turned out not to be tagged. Recorded rather
than fixed here, because the honest fix belongs with the registries and not with a
language fence.

### And then the prohibition fence caught me writing the mark block by hand

To exclude specimens I wrote `/^[א-ת]{1,3}[marks]*$/` and needed the marks. So I
wrote the range. `prohibitions.test.mjs` has forbidden exactly that since the class
was got wrong three separate times, and its comment says why: **`U+0591–U+05C7` is
not "the marks"**, because four characters in it are punctuation that separates
words — maqaf, paseq, sof pasuq, nun hafukha.

The repository had already solved it and I had read the answer an hour ago:
`markPattern()` in `engine.gen.ts` builds the class from the generated authority with
a **negated lookahead, so there is no range to split**. The fence was not
obstructive; it was pointing at a helper I had quoted from two files above.

And it took three attempts to get right, each an off-by-N in the same direction:

1. `U+0590–U+05AF` — stops one codepoint **before** the niqqud, so all fourteen
   specimens counted.
2. `U+0591–U+05BD` — covers the points and the dagesh, and stops six codepoints
   **short of the shin and sin dots** at U+05C1 and U+05C2, which are two of the
   fourteen marks the bar exists for.
3. `U+0591–U+05C7` — correct, and still hand-written, and therefore still wrong in
   the way the fence means.

Every version of that bound was a hand-split range with a hole in it. Which is the
fence's whole argument, restated by me three times.

### 114 → 9, and the ceiling says what the nine are

Two catalogue keys — `untitled`, which is a document's own name and would rename a
file on a language switch if tagged, and `registriesFailed`, an error path. Seven
composed, all of them Hebrew that should be there: a Hebrew starter's own source in
placeholders, English sentences *about* Hebrew, `Rename: <the document's name>`, and
the status line that carries both languages on purpose.

That last one is the one thing left to argue about rather than fix. `troubleSaid`
emits `"he · en"` so a writer sees theirs whichever language this is, which is a
good rule — and it means an English interface reads it Hebrew-first. A decision, and
it is written down rather than made here.

---

## 2026-09-27 · #15 — the premise, the seam, and the silence

### I mis-described the proposal, and checking it was worth more than the summary

I told the user the glue would "keep all 30 notes in the band on every page", and
asked why we would do that. **They were right to ask, and the answer is that the
issue never proposed it** — it says outright that a flow is a queue and not a
per-page assignment. My phrasing implied repetition and was simply wrong.

But checking before defending turned up something better. The issue measures itself:

> Doc B: **30 entries → 5 pages**; each page's band holds ~7

And the box today, measured here: **30 entries → 4 pages**, 9 per page, lowest ink
787.51 on an 841.89 pt sheet, **nothing clipped, nothing overlapping, nothing off
the page**. So the list under *"why it buys what a box cannot"* — no nine-note cap,
no clip, no overlap, nothing off-paper, spill-is-pagination-for-free — is a list of
properties the thing it would replace **already has**, and in the issue's own
numbers the proposal costs a page.

That does not mean there is no case. A commentary book with a hundred notes might
want a fixed band and a text that keeps filling the page above it, and the current
design cannot give that. But the issue does not show that case, and its numbers
point the other way. It is posted back with the measurement rather than closed on
my say-so.

### The one solid thing in it, and what it actually was

`DocConfig::from_json` clamped every numeric field and **said nothing**. A request
for `margin_top_cm: 21.7` came back laid out at 7 cm, compiled, printed, no
diagnostic: a writer who changed a margin and got the old page back could not tell
that from a setting that does not work.

That is the bug the app already names, one layer up — `settings.ts`: *"a load that
falls back to the defaults is a load that has silently un-chosen everything the
person chose, and it has to be able to say so."* The engine had the same defect and
no sentence, and #15 read it as *"the first compile fell back to default margins"*
and built a compositor around it. **It was a reporting problem, and the compositor
was never the fix.**

So, with the user's agreement:

- **A refusal is recorded and reported.** `clamped` notes what it changed,
  `DocConfig` carries the notes as a `#[serde(skip)]` field, and `compile` turns
  each into a warning naming the field, what was asked for and what is in force. A
  refusal is still **not** an error: the page is the nearest thing the field accepts
  and the document lays out.
- **A margin's limit is the sheet's, not a number chosen in advance.** 7 cm was
  never a limit — A4 is 29.7 cm tall. It is now `sheet − 1 cm`, which is the only
  physical question there is: how much of the page did the writer ask to give away.
  Measured: **21.7 cm now works**; 40 cm on A4 is refused at 28.70 and **says so**;
  a 50 cm sheet admits a 45 cm margin.

The page size has to be read *before* the margins, because a margin bounded by a
sheet the request was never compared against is a bound against a default — and the
first version of this clamped at 7 cm for exactly that reason, which is how the
silent failure survived the fix.

### Three of my own errors, and one that had been hidden all along

- **`ס"מ` inside a format string** closes it. Gershayim — `ס״מ`, U+05F4 — is both
  the correct Hebrew abbreviation and needs no escape.
- **A python write that reported success and did nothing.** Two edits I had
  "applied" and verified by *building* were absent from the file, and I only found
  out because the probe still returned 7.00. Verified by grep from then on.
- **`facts.mjs` counted a struct against a table that does not describe it.** Its
  own comment says it reads the struct "rather than `impl Default`" because
  rustfmt keeps the struct one field per line — and then the first attempt to
  exclude the `#[serde(skip)]` field stripped the *attribute* and left
  `pub refusals: …` to be counted, which is the same 41. It has to be the attribute
  **and** the field it applies to.

The last one is the shape worth remembering: a check written to compare two things
that were once the same, and which a new field made different, is not wrong in its
arithmetic. It is wrong in its question, and it will not say so.

Engine tests 1036 → 1044, binaries 73 → 74. Editor assertions unchanged at 7,849.

---

## 2026-09-28 · #67 — the ecosystem arrived, and then told you the wrong thing

### A decision that had already been made, in writing, for a good reason

The issue is one of the few that says outright that it is not a bug: *"a decision for
Shaul"* — vendor the source, wire offline resolution, or fetch over the network. It
has been sitting here as if it were still open.

It is not. `engine/src/lib.rs` has carried the answer since August, in a doc comment
that names this issue's own import as the reason it exists:

> `#import "@preview/meander:0.4.4"` failed with *file not found* until this existed

`typst-as-lib` offers `with_package_file_resolver` and it wants `ureq` or `reqwest`:
**it downloads.** The comment rejects that twice over — *"a compile that reaches the
network is a compile that can hang, and an editor that is 59ms after a keystroke
cannot have one in the path; and Ksav is meant to work on a plane."* So packages are
bundled in Typst's own `<root>/<ns>/<name>/<version>/` layout, built directly rather
than through `with_file_system_resolver` so that a document cannot reach anything
else on the disk through it.

**Option 2, chosen, with the reasoning attached, and `tests/packages.rs` holding it
in place.** The right thing to do with a decision recorded this well is read it
rather than re-litigate it.

So the remaining gap was not the decision. It was the *sentence*.

### The loader shipped, and left behind the exact wart the issue opened with

`#import "@preview/meander:0.4.4"` today produces:

> **A file (e.g. an image) wasn't found — check the path**

Wrong advice, and specifically wrong: somebody who imported `meander` is sent to hunt
for a missing image. The issue's headline complaint was *"file not found (searched at
typst.toml)"* — **the same misleading message, from the same source.** Building the
loader did not remove the thing the loader was opened for.

And the test that should have caught it asserted `is_err()`. Full stop. A missing
package that reports itself as a missing image, in a diagnostic layer whose entire
purpose is saying the useful thing, was a **passing test.** An error that is correct
and useless is not a passing test.

### Naming it, and the one thing Typst hands you for free

Typst reports the failure with the directory it searched:

```
file not found (searched at …/packages/preview/nothing-here/9.9.9/typst.toml)
```

That path **is** the answer. Three segments after `packages` and a manifest at the
end is a shape, not a wording, so keying on it cannot fire on a missing image and
survives Typst rewording its error. And because the searched path *names* the package
and version, the message can report the spec **as the writer wrote it** —
`@preview/meander:0.4.4` — which is the one string they can go and correct in their
source.

The second half of the sentence matters more than the first. Ksav bundles and never
downloads, deliberately, for the reasons above. So **"not found" must not read as
"try again" or "check your connection"** — it means *this one is not in the box*. The
message therefore lists what **is** in the box, read on the error path only, because
a writer told "`meander` is not here" still has to guess what is, and the answer is
one `read_dir` away.

`bundled_packages` renders specs as `@namespace:name:version` — which is *not* a
Typst spec, and is not pretending to be: it is a list of what is on disk, and the
`@preview:ksavtest:0.1.0` shape cannot be pasted into an import and should not be.

Three tests, all of which fail against the old sentence: the package is named, the
word *image* is **absent**, and a wrong version is reported as a wrong version —
a different sentence with a different fix, since there is no need to add a package
that already exists.

### Two of my own, again

- **An off-by-one in the shape I had just described.** Having written *"three segments
  after `packages` and a `typst.toml` at the end"*, I destructured **three** parts and
  then asked the **third** — the version — whether it ended in `typst.toml`. It never
  did, so `missing_package` returned `None` on every input and the branch was dead.
  The prose was right and the code was the thing I had actually reasoned about.
- **A `let … else` against the wrong type**, twice, on `file_name()` returning
  `OsString` and not `Option`. Guessing an API I had not looked up in the same breath
  as describing it.

The pattern is now familiar enough to be worth naming: I write the *argument* first
and the code second, and the argument is where the care is. When the two disagree the
argument is usually the one that is right — which means the fix is to go read the
type, not to adjust the claim.

Engine tests 1044 → 1047, binaries 74 (72 integration + lib unit + doc-test — and the
README's "74" was right all along; I had recorded a correction that was not needed).
Editor assertions unchanged at 7,849.

---

## 2026-09-28 · #72, #73 — the sandbox nobody wrote down, and the shelf that is empty

### The question I had flagged and never answered, answered by accident

Two questions came back at the end of the #67 work — *"the different blocks thing"* and
*"the ability to take typst libraries"*. While measuring the second I ran the
indentation probe I had flagged much earlier and never got to, and it is worth
recording because the answer is **yes, it works**:

    plain paragraph   x=499.56  w=24.85  right=524.41
    #ציטוט (quote)    x=487.56  w=24.85  right=512.41

Same string, so the 12pt is the inset and nothing else. And it moved the **right**
edge — the reading edge in Hebrew — which is the correct side. A block that indents
from the left under RTL is a real class of bug, and Ksav does not have it.

The first attempt at this probe was `#בלוק(לשון: "משנה", inset: (right: 1cm))`, and
the **typo sweep caught my own invented command** and answered with the legal list.
That is the fence from #5 working on me, unprompted, in a language I invented. Also
learned: the box is `תיבה` and the quote is `ציטוט`, and `#הזחה(2)[…]` is not its
signature.

One loose thread from that probe, **not** claimed as a finding: `#מקור` with the
same text came out at `right=523.69`, barely inside the margin, with a *narrower*
run (21.12 vs 24.85) — so it sets a smaller size, and its inset may be scaled to the
font or may be nearly absent. One data point with a confounded variable is not a
defect. Worth a probe, not worth a claim.

### A sefer cannot read the disk, and that was never a decision anyone made

Four ways a Typst document reaches a file, all measured here:

    #import "helper.typ"   refused
    #import "/etc/hostname" refused
    read("names.txt")      refused
    @preview/ksavtest      works      (#67)

**The document has no file system.** Images and user fonts arrive as bytes on the
request; everything else is `include_bytes!` in the binary.

That was the *right* call, and the reason is in `packages_root()`'s own comment: the
resolver is built directly rather than through `with_file_system_resolver` so that a
document cannot reach anything else on the disk through it. For one pasted snippet, a
total sandbox is correct.

The cost is that **a sefer is one file, forever.** No splitting a 40-chapter sefer,
no shared file for a recurring kuntres used 300 times, no `read()` of a list of
parshiyos, no personal `.typ` of house conventions. For Torah work that ceiling is
higher than the package question, and it had never been written down as a choice.

The proposal is not a new mechanism — it is `packages_root()` **a second time**:
give each sefer a read-only root. Sibling files import by relative path, a `packages/`
subdirectory is `@local` (Typst's own name for this, so nothing is invented), and
confinement survives. Filed as a **decision** rather than a task, because a sefer
stops being a path and becomes a tree, and that has consequences in autosave, in
`engine/src/git.rs`, in the absence of any file-tree UI, and in what happens to the
single-file sefarim that already exist. Not mine to pick. With the cheap half spelled
out too: **`@local` alone**, in the `app_data_dir()` that already holds the
dictionary, answers "can I bring my own library" for most of the value and touches no
editor, no autosave, no git.

### The shelf is empty, and the order matters more than the answer

#70 deferred `meander` and #67 then made it possible. So the blocker is no longer
technical — it is licensing, repository size, and one uncomfortable dependency
question: **page-breaking is the thing a typesetting app most needs to control**, and
delegating it to a package is how a bug becomes unfixable-in-place.

So #73 argues for measuring **#70 first**, and the argument is not caution, it is
that #70 decides whether a third-party threader is addressing our problem or
inheriting it. If Typst's own blocks do not thread cleanly across a page break, a
package built on them inherits that, and we would be importing a workaround for our
own first attempt. Vendoring first and measuring second pays the cost before knowing
the benefit — and #70's own text already says *"report the measurement, then decide."*

**#70 is the next piece of work, and it is one probe.** Two issues filed, both
decisions, neither actioned.

---

## 2026-09-28 · #70 measured — the artifact is not there, and three real things were

### The question was not merely unanswered. It was unanswerable.

#70 asks whether a breakable block draws an **empty border at the foot of page 1**.
To answer that, a probe needs to know where a fill *ends*.

It did not. `Fill` and `Stroke` carried `x` and `y` and no extent, and the reason
that is fatal rather than merely inconvenient is **the direction a box grows in**: a
fill that spans a page break *starts above* the last line of text and *ends below* it.
So the origin is the one property of such a fill that looks entirely correct, and the
empty band — the entire subject of the question — is exactly what the origin cannot
speak about. **An origin is not a shape.** `width`/`height` are now derived from
`Shape::geometry`: `Rect` size, `Line` endpoint difference, `Curve` reported as zero
rather than guessed.

### The result is the opposite of the forwarded claim

    13.9 (above first line) + 169.2 (six lines) + 22.9 (below last line) = 206.0 = the fill height

The background is **re-fitted to each page's own six lines**, not distributed from the
whole block's height. No empty band, no stray border, on any of the four pages. A
breakable block threads correctly across a page break in Typst 0.15.

That removes the strongest reason to vendor `meander` (#73): the argument for measuring
this first was precisely that a threader built on badly-threading blocks would inherit
the problem, and we would be importing a workaround for our own first attempt. They
thread cleanly.

### The control found the actual bug

`breakable: false`, same block, 24 lines: all on one page, `first_y=325.7`,
`last_y=1104.1` — **the sheet is 841.89pt tall.** The block's own fill ends at 530.1.
So about **18 of 24 lines are printed nowhere**, outside their own background, with no
error, no warning, no overflow diagnostic.

Filed as **#74**, and deliberately *not* as a defect Ksav has: `#תיבה` has no
`breakable: false` anywhere, which is exactly why it is worth filing now — **#65**
(berech) and **#43** (top/bottom streams) both *need* atomic blocks by design, and the
failure mode is silent content loss rather than a box that looks wrong. A defect found
before the feature that triggers it is worth much more than one found after.

### Two smaller things, both from the same afternoon

**#75** — Typst 0.15 dropped bare hex colour literals. `#block(fill: #eef3ff)` is
rejected with *"something's off near a #"*, and **the `#` is the one character that was
right**. Ksav's own surface is clean — all 167 `insert` strings use `rgb(...)`, zero
bare hexes — so nobody is handed a broken example; it is a writer's first attempt at
colour that gets confidently wrong advice.

**#76** — and this one is a gap in my own #15 work, four days old. The new clamp bounds
each margin against the sheet and never against *the other margin*, so `margin_cm: 11`
on A4 is accepted: `11 ≤ 28.7` on every edge, and the text area comes back **negative
width** (21.0 − 11 − 11 = −1.0cm). A `width: 100%` block in it laid out 28.3pt wide on
a 595.3pt sheet. It is #15's own sentence arriving by another door — *a load that falls
back to the defaults has silently un-chosen everything the person chose.*

### How the probe went wrong before it went right

`Iterator::max` needs `Ord` and `f64` has only `PartialOrd`, so the first version would
not compile; `probe::PagedDocument` is deliberately unnameable outside its module, so a
test helper would have needed an `unsafe transmute` to a type it cannot spell — spelled
out at each call site instead, with inference doing the work. And the extent came back
as **`w=-28.35`**: a right-to-left `width: 100%` box is emitted by Typst as a rect with
a *negative* `size.x` and the origin already moved to the other edge. An extent is a
magnitude; a negative one is a coordinate that has been asked a question about size.

Then a wrong turn worth recording: I "fixed" the cramped margins to 3cm, and 60 lines
rendered to `y=183.6` — nonsense, and I could not explain it inside a sensible budget.
Rather than keep iterating I reverted to the exact 11cm configuration the #70 numbers
came from, **so the fence and the report on the issue cannot drift apart.** A test that
passes under conditions nobody can reproduce is not a fence, and an unexplicable
measurement is not a measurement.

Engine tests 1047 → 1050, binaries 74 → 75. Clippy clean.

---

## 2026-09-28 · parallel streams already work, and a bug I did not file

### The question, and the answer that made the issue unnecessary

*"Is there a way to have that box without a different background colour, so it is more
like parallel streams?"*

**It already has no background colour.** `#תיבה`'s defaults are

    (מסגרת: 0.75pt + luma(150), מרווח: 12pt, רדיוס: 6pt, רוחב: 100%)

— a border, an inset, a radius and a width, and **no `גוון`**. And `גוון` *is* the fill
key: `_mk_block_knobs` is `("גוון", "קו", "מסגרת", "מרווח", "רדיוס", "רוחב", "יישור")`
and line 1196 is `if "גוון" in c { args.insert("fill", c.גוון) }`. So a `#תיבה` with no
`גוון` is a box with no `fill` argument at all, which is not the same as a box whose
fill was set to nothing — it is a box that never asked.

Measured, `fills` counted from the frame:

    #תיבה[פירוש]                        fills=0  strokes=1   x=424.8
    #תיבה(מסגרת: none)[פירוש]           fills=0  strokes=0   x=424.8
    #תיבה(מסגרת: none, מרווח: 0pt)[פירוש]  fills=0 strokes=0  x=436.8
    פירוש (no box at all)                fills=0  strokes=0   x=436.8

**The last two agree exactly.** A borderless, zero-inset `#תיבה` places its text
**identically to writing no box at all** — so the parallel-stream layout is one global
setting away and needs nothing built:

    #הגדרות_תיבה(מסגרת: none, מרווח: 0pt)

and the whole apparatus reads as a stream beside the source rather than a stack of
coloured cards. It also flows, which is the other half of why streams are the right
shape: a stream has no box to run off the foot of a page.

### A bug I nearly filed, and the reason I nearly filed it

`#אזהרה(גוון: none)` reported `fills=1`, and I read that as *"the tint is still drawn"* —
which is a bug, exactly the bug asked about, in exactly the place it would hurt. It is
not a bug:

    #אזהרה                 fills = ["#fef2f2", "#dc2626"]   tint + accent
    #אזהרה(גוון: none)     fills = ["#dc2626"]               tint gone
    #הצלחה(גוון: none)     fills = ["#16a34a"]               tint gone

The remaining fill is the **accent stripe**, and it is deliberate. I had measured a
count and read it as a background without asking *which* fill.

That is the same failure as #70's `last_text_y`: **a number that answers a different
question than the one being asked, read as though it answered yours.** Twice in one
afternoon, both times about a probe reporting something real that was not the thing
under discussion. The count was never wrong. The question was.

So no issue was filed, which is the correct outcome and would not have been had I
trusted the first reading. `#אזהרה`, `#הצלחה` and `#הערת_צד` all accept `גוון: none`
today, and the tint is the only thing standing between a writer and a stream.

### And the question I was asked twice and did not answer well

*"Why would we ever say not to split?"* — I answered as though #74 were a live hazard,
and the honest answer is **nothing in Ksav does, and the two proposals that might
(#65 berech, #43 top/bottom streams) may not either.** A stream does not need an atomic
block; if anything the wrap work wants the opposite. So #74 is **latent insurance**,
cheap to keep as a known trap and not worth engineering against until something asks
for it. The plan now says so, in those words, rather than dressing it up as a
correctness bug.

---

## 2026-09-28 · "anything, not just notes" — and two of my own corrections

### Columns work. I said they did not, twice, for the same reason.

`#טורים_בלוק(2)` and `#cols(2)` measured **identical** — 35 distinct x-origins, first at
295.2 — and with three columns, 23 origins at 295.2 / 390.8 / … So the page divides
into N columns of arbitrary content, and Ksav's wrapper is byte-identical to Typst's
own.

Before that I reported "nothing changed" and then "everything identical, probably the
sefer machinery". **Both were wrong, and for one reason: columns fill vertically first.**
I handed `#cols(2)` two lines of text, which fit in column 1, so there was nothing to
see. `#grid` *did* split on the same input — A at 459.0, B at 390.5 — because a grid
places by cell rather than by overflow, so it is the one that showed me my probe was
wrong.

That is the **fourth** time in two days that a probe answered faithfully and I read the
wrong thing off it: `last_text_y` that was the notes box, `fills=1` that was the accent
stripe, a `f64: Ord` that would not compile, and now a column that had nothing to
column. The counts were never wrong. **I kept asking the probe a different question from
the one I meant**, and the fix is always the same — work out what the thing *does*
before measuring whether it *works*.

### The user's question, and the real gap

*"This can be infinite, no? Not just for notes, but for anything you want to put inside.
You can break up the page no matter how."*

Mostly **already true**, and it is worth separating two things I had merged:

    divide a page into N columns of arbitrary content      ✅ measured
    content crossing column and page boundaries            ✅ measured
    anything placed BESIDE the source at body size          ✅ measured (#הערת_צד)
    named streams (הערה_זרם, הערות_בסום_צד)                present, unverified by me
    ADDRESSING — send *this* content to *that* stream       ❌ absent

**Typst 0.15 has no `Flow` element.** Every crate in the dependency set checked; the only
`Flow` in the registry is GTK's `flow_box` and a parser's AST node.

And that distinction is the whole answer. A column is a **region you fill in order**,
not an **address you send something to**. Once text is in `cols(2)`, the first thing to
arrive is in the first column. There is no way to say *"this lemma goes beside that
verse"* and have the rest of the page make room.

### The correction that matters, posted to #73

I wrote on #70 that the measurement "removed the strongest reason to vendor `meander`".
**That was too quick.** #70 measured whether a **block** splits across a page boundary
— one block, one boundary. It says nothing about **routing**, which is sending a chosen
piece of content into a chosen channel while everything else reflows around it. I
collapsed two capabilities into one sentence, and #70 only ever spoke to the first.

So the original *note-spill* framing was right that #70 helps — a spilling note is just a
block that breaks, and blocks break cleanly. But **the framing was too narrow, and it
made the case look weaker than it is.** The real capability is: put a lemma, a figure, a
summary, a translation, a proof into a named stream beside the source, and have the page
reflow. For a sefer that is the difference between *notes in a box* and *an apparatus
that is part of the page*.

Caveat stated in the issue rather than glossed: **I cannot verify what `meander` does.**
It is not bundled and I have not read it. Everything above about Ksav and Typst is
measured; the claim that `meander` supplies this routing comes from its description in
#73 and is not verified. Vendoring is also **reversible** — #67's resolver reads a
directory, so removing the directory removes the capability with no code change.

---

## 2026-09-28 · rendered it, looked at it, and the answer is no

### Asking the question by looking instead of by counting

*"…should work for two rows on each page, flowing into that row on the next page, no?"*

I had been answering this with y-coordinates, which is the wrong instrument for a
question about the *shape* of a page. `examples/svgdump.rs` only emits page 1, so it
could not show this at all — the answer lives on page 2. So `examples/render-pages.rs`
now emits every page as SVG, and I converted them with `pdftoppm`/`magick` and **read
the images**.

The document: two 400-line streams, A (`אורייתא`) and B (`פירוש`), in
`#grid(rows: 2, columns: 1, [A], [B])`.

**Page 1:** entirely A.
**Page 2:** A down to line 399, and then **B starts at the bottom of the same page**,
running on into pages 3 and 4.

So it is **one flow**. Cell 1, then cell 2, in reading order, across page boundaries.
`grid(rows: 2)` divides a single stream into two bands; it does not create two streams,
and the second band does not resume in the same band on the next page.

### The distinction, now with a picture behind it

- **works:** `#cols(n)` — divide a page into n bands that **one** flow fills in reading
  order. Measured at 2, 3, 6, 8 and 12, text intact in every case.
- **does not work:** n **independent** flows, each continuing into the same band of the
  next page. That is what was asked for. It is not what a grid or a `cols` does.

And it is not a matter of finding the right Typst incantation. **Typst 0.15 has no
`Flow` element** — every crate in the dependency set checked; the only `Flow` in the
registry is GTK's `flow_box` and a parser's AST node. A column is a *region you fill in
order*; what is wanted is an *address you send content to*, and nothing in the language
has one.

**So this is the concrete case for #73, and it is the first one that is not a guess.** The
earlier arguments were note-spill and "routing", both of which could be dismissed as
speculative. This one is a rendered page saying no. `meander`'s description in #73 —
*page layout with text threading* — is exactly this feature, and it is still unverified
because it is not bundled.

Vendoring it remains reversible: #67's resolver reads a directory, and deleting the
directory removes the capability with no code change. And the measurement is now
reproducible by anyone:

    cargo run --example render-pages -- doc.typ out/ 3

---

## 2026-09-28 · #76 — a gap in my own work, and a wrong report about it

### I measured a path the application does not have

Filed #76 saying `margin_cm: 11` is "accepted silently" on A4. **It is not.** Through
`from_json` it is clamped to 7.0, a refusal is recorded, and a diagnostic is emitted:

    {"margin_cm": 11.0} → margin_cm = 7.0, refusal "margin_cm: 11→7"

The reason is the fifth instance of one habit: **I set `cfg.margin_cm` in Rust**, so
`from_json` — the thing the issue is about — never ran. I built a probe that bypassed
the code under discussion and reported its result as the code's behaviour.

The finding survived; the evidence was mine, not the code's. Corrected on the issue
before touching it, because a defect filed on invented evidence is worse than no issue.

### Two defects, and one of them is a regression of #15

**The pair.** `margin_inner_cm: 20, margin_outer_cm: 20` is 20 ≤ 20 on *each* edge, so
both are accepted with no refusal, and A4 hands back a text region **19cm wider than the
sheet**. Real, and exactly as filed.

**The constant that survived.** `margin_cm` was `0.0..7.0`, commented *"half of the short
side of A5"*. And 7 is the A5 **instance of a rule that is right on every sheet**: a
uniform margin lands on both edges of each axis, so the bound is `2m ≤ short_side − 1`.
That is 6.9cm on A5, **10.0cm on A4**, 14.35 on A3.

So **#15 replaced the hardcoded 7 with the sheet on the per-edge path and left the
constant standing on the uniform path** — the one almost every document takes, since
four absent edges mean "use `margin_cm`". A4 was still refusing a 9cm margin that it
holds comfortably. The generalisation was right and applied to half the settings, and
it *could not* have been fixed in place: the line ran before the page size was read, so
the sheet was not known yet. **A bound that depends on the sheet must be evaluated after
the sheet is known** — which is the entire lesson of #15, learned by breaking it.

Both fixed. `margin_cm: 9` on A4 is now accepted; `margin_cm: 12` is refused to 10.00
and says so.

### The rule for a pair, and the fence that caught me being wrong about it

**A value the writer did not set is never the one moved.** An absent edge is standing in
for `margin_cm`, which is a default, and reducing a default is the app un-choosing on
the writer's behalf — the sentence `settings.ts` already says and #15 exists to fix.
So with one edge set, that edge gives way; with both set, something has to be chosen.

My first choice was **the second edge**, and it was wrong in a way the *pre-existing*
fence caught immediately. `inner 13, outer 0` on a 10.5cm sheet is over by 3.5cm, so
"the second" clamped `outer` to 0 — where it already was — and left `inner` at 13. The
pair was still 4.5cm too wide and the document laid out anyway. **The invariant held for
every case I had invented and failed for the one I had not.**

**The larger margin gives way.** The other edge is then the smaller by construction, so
`allowance − other` is never negative and the pair sums to exactly the allowance. A tie
goes to the second, so the choice is total.

That test also had to change, and its change is the real content: it had been leaving
the opposite edge absent, which meant the 2.5cm default was silently in the way, and it
was **passing a 13cm top margin that had no room to exist**. Now that a pair is checked,
an absent edge is a real margin — so the comparison has to say what is opposite it.

Six new tests, and one of them states the invariant once, over a sheet per case, so a
later change to the rule cannot pass by making the refusal quieter.

Engine tests 1050 → 1055, binaries 75. Editor assertions 7,849 — and the documentation
fence caught the stale count before I looked for it, which is what it is for.

---

## 2026-09-28 · #75 — the `#` was the character that was right

### The message told a correct character it was wrong

Typst 0.15 dropped the bare hex colour literal, so `#eef3ff` fails with *"the character
`#` is not valid in code"*. The translation answered it with the sentence for a missing
space, an unclosed bracket, or a literal hash in prose. The writer has typed the obvious
thing for twenty years and been told they have mistyped it.

**The line had to be consulted, because the raw error cannot tell the two apart.** A
removed colour and a genuine stray `#` produce byte-identical Typst text. So `rephrase`
now takes the offending line and looks for a `#` followed by 3, 4, 6 or 8 hex digits.
A `#` before Hebrew, a space or a bracket is a real syntax error and still gets the real
sentence — which is the half that keeps the fix honest, and the half that would be
easiest to break by accident.

### Two things I got wrong inside the fix

**The helper never fired.** I wrote it as "try 8, then 6, then 4, then 3, give up after
the first fails". For `#eef3ff` the 8-character window is `eef3ff)[`, which is not all
hex digits, so the helper failed on 8, **broke**, and never tried 6. Taken as the
maximal hex run and then checked against the legal lengths, it is right immediately.
The lesson is the one I keep re-learning and should stop re-discovering: *a loop that
gives up on the first attempt is a loop that only ever tests the first case.*

**A false positive that looked like a success.** `#1234zz` has a hex run of 4, so it
matched, and the message said *"write `rgb("#1234")`"* — advice that **cannot work**,
because `rgb("#1234zz")` is not a colour either. The run is a colour only if the token
is *delimited*: nothing alphanumeric or `_` may follow it. With that, `#eef3ff)` and
`#eef3ff\n` match and `#1234zz` and `#eef3ff_x` do not.

### One mistake is one message

`#block(fill: #eef3ff)` produced **two** errors: the real one, and then *"there is a
comma missing between two arguments"* — the parser recovering from the first and
blaming the punctuation around the hole it left. That second one is advice a writer can
act on and cannot fix, and it arrives *after* the sentence that already explains
everything, so it reads as a second problem where there is one.

Suppressed, tested on Typst's **raw** text rather than our translated message (`expected
comma` is the engine's wording and is not translated), and only for a comma on a line
that already reported a colour — so a genuine missing comma on a line that happens to
contain a colour survives.

### Gates

Six tests. Two of them are about what must **not** fire, which is the honest half: a
stray `#` still gets the syntax sentence, a hex run inside a word is not a colour, and a
colour on line 1 is not blamed for an error on line 2 — that last one needed a helper
that filters diagnostics *by line*, because several tests here are about not blaming the
wrong line.

Engine tests 1055 → 1061, binaries 75. Editor assertions 7,849.

---

## 2026-09-28 · #74 — an unsplittable block, reported rather than obeyed

### The failure was always going to be silence

`breakable: false` on a block taller than the text area is a legitimate request that
cannot be granted. The measured result was the worst kind of failure: 24 lines to
`y=1104.1` on an 841.89pt sheet, the block's own fill ending at 530.1, so **about 18
lines rendered below the bottom of the page**, outside their own background, with the
document compiling and nothing reported at all.

**The content still goes off the sheet.** Nothing was changed about the layout,
deliberately: the honest answer to a request that cannot be granted is to say so, and
moving the content silently would be the same defect one layer down — a page that is
not what the writer asked for, arriving without a sentence. So the fix is a sentence.

### The threshold is the page, and that is the whole design

A layout audit wants to compare content against *somewhere*, and the obvious place is
the text area. **That would have been a defect on every document with a running head or
a folio**, because both live in the margins quite legally. Comparing against the
**page** removes the ambiguity entirely: *a folio cannot be below the bottom of the
page*. Off the sheet means off the sheet, and nothing else means that, so no
header/footer bookkeeping is needed and none can rot.

The second question is whether the writer asked for this, because a document with no
`breakable: false` cannot reach the state. So the audit scans the writer's own text —
not the 75KB of prelude in front of it — and an ordinary document pays one pass over
its lines and nothing else. A scan rather than a parse, and the report names the line,
which is the one thing the writer can change.

Measured: 285pt of a block reported as not printed at all, naming line 1. The same
content splittable: silent. An unsplittable block that comfortably fits: silent. A
document with no unsplittable block: no diagnostics at all.

### The fence changed shape, which is what it asked for

`an_unbreakable_oversized_block_overflows_off_the_sheet_silently` asserted only that the
overflow *happened*, and its own comment said to rewrite it when the fix landed —
because it would have kept passing after the audit was added and proved nothing about
it. It now asserts **both** halves: the content still goes off the sheet, *and* the
document says so. And the report is checked **through `compile`**, not by calling the
audit directly, because the hook into the success path is half of what was fixed.

The other two new tests are about what must **not** fire. A warning on every long
block is a warning nobody reads, and an unsplittable block that fits is a legal request
so silence is the correct answer rather than an omission.

Engine tests 1061 → 1063, binaries 75. Editor assertions 7,849.

---

## 2026-09-28 · #77 — the decision was to build it, and it turns out it is built

### "Lets build the possibility. the user should be able to do it if he wants."

So #77 stopped being a question. The shape is now construction, and the measurements
already settled three things about it: Typst 0.15 has no `Flow` element so this is
Ksav's work; `#grid`/`#cols` are one flow filling regions in order so a compositor over
one flow cannot do it; and Ksav already compiles one source into two documents with the
boundary coming for free.

The construction I had in mind: **each stream is laid out as its own document whose page
*is the band*, and the per-stream pages are zipped onto sheets by index.** The appeal is
that the requirement — *a flow continues into the same position on the next page* — is
not something a page-breaking algorithm has to achieve. Stream A laid out alone produces
A/1, A/2, A/3 as ordinary pages; the zip puts A/2 in A's band on sheet 2. Nothing is
threaded, so nothing can mis-thread.

`examples/streams.rs` does it. Three streams, six band-pages, rendered and looked at:
`מקור` exhausted so its band is nearly empty while `פירוש` and `מערה` both continue, in
the bands they held on the previous sheet. The cost is real and printed rather than
assumed: **N streams is N layouts of the same source**, and this is a 59ms editor.

### And then I read Ksav's own prelude instead of only Typst's

```typst
#הגדרות_זרמים(זרמים: ("תוכן", "מקורות"), פריסה: "צד")
```

**`פריסה: "צד"` is side by side, a column per stream**, and the same command carries
`טורים` — a per-stream column count. Measured, two streams of 60 notes each, across
seven pages:

    p1  תוכן x=509.4   מקורות x=263.4
    p2  תוכן x=507.3   מקורות x=261.2
    p3  תוכן x=506.9   מקורות x=260.9
    ...
    p7  תוכן x=506.8   מקורות x=260.8

**Each stream keeps its column on every page and its content flows continuously through
it.** That is #77's requirement, measured and working, in the product today.

### The same mistake, for the seventh time, and the largest one yet

I measured **Typst** — `#grid`, `#cols`, the absence of a `Flow` element — and concluded
"not possible, this is Ksav's work". **I never opened `הגדרות_זרמים`.** The conclusion
was true of Typst and irrelevant to Ksav, and the gap between the two is the entire
product.

#76 I measured a Rust field instead of `from_json`. This time I measured the language
underneath instead of the product above it. Both times the number was right and the
question was mine. **The two failures are the same failure**: reaching for the thing that
is easy to measure instead of the thing the question is about.

### What the build actually is now

Already there: named streams, side-by-side placement, a column per stream, per-stream
column counts, numbering and headings, and each stream holding its band on every page.

Genuinely open, and small: **arbitrary content** in a stream — `הערה_זרם` is a *note*
command, and the original question said *not just notes* — and **where the streams
live**, since the apparatus is the read-only footer and the question is whether a stream
can occupy the page body.

Both are extensions of an existing apparatus with an existing vocabulary. That is the
difference between a feature and a competitor.

The probe stays as evidence and **must not become a second mechanism**: two ways to do
one thing is how a product grows a setting nobody can find. It also caught its own bug —
the first render clipped every band on the right edge, because `probe::layout_plain`
takes no config and laid each stream out at A4 before cropping. The numbers said three
streams of one page each; the picture said the bands were the wrong shape.

---

## 2026-09-28 · #63 — the exponential is real, and the proposed fix would not have helped

### The mechanism, and why the cycle guard does not catch it

A diamond reduced to its simplest form: the same part included twice. `expand_into` only
guards against a name **already open on the stack**, and the first inclusion is pushed
**and popped** before the second is looked at — so the name is not on the stack either
time, and the guard has nothing to say. What is left is `MAX_DEPTH = 8`.

### Two fixtures that measured the wrong thing, faithfully

    depth 8, leaf 20 lines   → 256 lines   (looked like 2^8 = 256 copies)

**That 256 was the cap, not the growth.** `MAX_DEPTH` refuses before the leaf is
reached, so depth 8 never got there. Only when the leaf was given its own name — and
the chain shortened by one — did the real shape appear:

    depth 4 → 16    depth 5 → 32    depth 6 → 64    depth 7 → 128    depth 8 → capped

And the first fixture was worse: it used `p{depth-1}` for the leaf, which the
construction loop then **overwrote with a self-include**, so the cycle guard fired
correctly and the output was 256 marker lines whatever the leaf's size — which is
exactly why depth 8 "looked" like the growth. The numbers were true. The questions were
mine, for the eighth time, and the second one is a new shape of it: **I used the
recursion's own guard as if it were the thing under test.**

### The cost at the ceiling

One 200KB part included 128 times:

    leaf lines      copies   output lines      time
         20           128           2,560        5ms
        200           128          25,600       22ms
      2,000           128         256,000      355ms
     20,000           128       2,560,000    1,532ms
    200,000           128      25,600,000   15,901ms

**Sixteen seconds and twenty-five million lines, from a document that compiled.** No
error, no warning, nothing refused.

### Memoizing would not have fixed it, and that is the finding

The issue proposes *"memoize per name"*, and it is a genuine inefficiency: 128 inclusions
re-walk the part 128 times. But the cost is not 128× *work*, it is 128× **content**, and
the content has to be there — the writer wrote `#כלול("x")` 128 times and the expanded
document is supposed to contain 128 copies. `Expanded::text` is a flat string. Memoizing
the expansion saves the re-walk, roughly a constant factor, and cannot touch it.

**The exponential is real but it is not the hazard. The hazard is that nothing bounds
the total**, and the bound that exists is a proxy that fell out of the recursion rather
than a budget anybody chose. So the fix is a **total-size budget with a diagnostic**, in
the shape `reserve_overflow: "refuse"` already uses.

The remaining question is **policy, and it is a product call**: proportional or total, and
refuse or warn. The engine has both vocabularies — a refusal from #15 is a warning that
lays the document out, `reserve_overflow: "refuse"` stops the compile — and my
recommendation is **a proportional budget that refuses**, because the failure is not a
wrong page but a document that cannot be laid out at all. Posted on the issue rather than
assumed.

And the second half of the issue, `line_of` ambiguity, is **already documented and is not
a defect**: a file and a line is genuinely ambiguous when a chapter is pulled in twice, and
first-in-reading-order is the only honest answer available. The comment says so.

---

## 2026-09-28 · #63 — a budget in two limits, and one lesson I nearly repeated

### What the measurement said, and what the issue proposed

The exponential is real and the cycle guard cannot see it: the guard refuses a name
**already open on the stack**, and the first inclusion is pushed *and popped* before the
second is looked at. So the same part, included twice, expands twice, and a chain of them
doubles at every level. `MAX_DEPTH = 8` bounds it at 2^8 copies — and that bound is a
*proxy that fell out of the recursion*, not a budget anyone chose.

**Memoizing per name was the wrong fix**, and saying so is most of this entry. The cost is
not 128× the *work*, it is 128× the **content**: the writer asked for 128 copies, so the
flat `Expanded::text` has to hold 128 copies. Memoizing saves the re-walk — a constant
factor. What was missing was that nothing bounded the total: one 200KB part included 128
times measured **25.6M lines in 15.9 seconds**, silently.

### Two limits, because they answer different questions

`max_lines_warn` (100,000) **reports and still lays out** — the copies are correct, so the
document is still the one the writer asked for. `max_lines_refuse` (500,000) **stops the
walk at the limit**, measured at exactly 500,000. Past a point there is nothing left to
warn about: 25.6M lines is not a slow page, it is a document that cannot be laid out.

Both are settings, per Shaul's decision, and both go through `clamped` so an out-of-range
value is *reported* like every other number — a cap nobody was told about is a cap that did
not happen. The pair is made coherent: a document asking to be refused earlier than it is
warned about has asked two contradictory things, and the soft limit is the one anybody
reads.

Defaults from the measured table: a chumash is ~30,000 lines and a Vilna Shas ~500,000,
and 500,000 lays out in roughly a third of a second — which is the number that matters for
a 59ms editor.

### Two things I got wrong inside the fix, both caught by looking

**`out.text.lines().count()` in the walk loop is O(n) per line**, which makes the whole
walk O(n²) — a budget that quadrupled its own cost would be a wonderful joke, and the walk
is the thing the budget exists to keep affordable. `origins.len()` is the same number and
is O(1); the `debug_assert_eq!` in `push_line` already says they agree.

**A depth-9 diamond produced ~300 identical "nested too deeply" messages.** Pre-existing,
not mine, and not small: the refusal was pushed once per inclusion path and nothing
deduplicated it. A writer scrolling a list that says the same thing three hundred times
learns nothing and scrolls past the one that mattered. Now each named refusal is said
once, and the test fences the *count*.

### What I did not land, on purpose

The settings-dialog rows for the two numbers. The keys and the type are in and
`enginefacts` is green — that fence is the one that says *"a document falls back to the
engine's defaults, field for field"*, and it caught the new fields immediately, which is
exactly what it is for. But adding the two `numberRow`s and their labels turned
`browserlang`'s residue fence red, and **I would not land a red suite to save a dialog
row.**

Checked before concluding that: on a **clean tree**, with every one of my changes stashed,
`browserlang` fails the same two assertions. So they are pre-existing — `registriesGaveUp`
and `retrySave` stand in Hebrew without being in the recorded `RESIDUE` list, **and both
have English values in the catalogue**, which means something is rendering them Hebrew
rather than that they are legitimate residue. Not diagnosed, and **not added to the list to
make the fence green** — that would be the exact move #71 was closed for.

Engine tests 1063 → 1069, binaries 75, clippy clean. Editor 7,849, all green — the
`browserlang` fence turned out to be a real bug and is fixed below.

---

## 2026-09-28 · #81 — the red fence was right, and I nearly "fixed" it the wrong way

### A red fence I could not paper over

Adding the two settings rows turned `browserlang` red over `registriesGaveUp` and
`retrySave`. The tempting fix is to add both to the test's `RESIDUE` list — and **that is
the exact move #71 was closed for**, because `RESIDUE` is a *reviewed* list of strings
that are legitimately Hebrew, and these two assertions fail precisely because **neither
of them is**: both keys have English values in `i18n.ts`.

So I went looking instead, and the cause is real and simple. `showChromeNotice` resolved
its strings **at call time** and appended the result; nothing re-renders the banner when
the language changes. A notice born in Hebrew stayed Hebrew for as long as the problem
lasted — and a registry failure lasts the session. Same bug in `reportSaveFailure`'s
button.

### The fix that is right, and what it rules out

I applied the pattern `panels.ts` already uses for headings: pass the **key**, set
`data-i18n`, guard with `hasKey` — which exists for exactly this, *"a call site passed the
answer where the question belonged"*. `NoticeAct` grew a `key`; the call sites now pass
`"registriesGaveUp"` and `key: "retrySave"`.

**It did not turn the fence green**, and that is the finding. The attribute is right, so
the sweep must not reach the notice host — the banner is appended outside whatever
subtree `localise()` walks. So the remaining work is the *scope*, and filed as **#81** with
the two options: widen the sweep, or re-run it over notices appended at runtime — which is
the better one, because a notice can be raised *after* a switch too.

### And the fence is a boot-order hostage, which I proved by accident

The suite came back **7,851/0 failed** and then **7,849/2 failed** on identical code, in
alternating runs. The test's own comment explains it: the registries failing to load is a
boot race, so the visible set changes. **Any single run of `browserlang` is not evidence of
whether it is green**, and I was one step from believing a green run and calling it fixed.
That is now in #81 and in the plan, because the next person will otherwise trust a run.

### And the settings rows went in

With the residue keys understood rather than silenced, the two `numberRow`s and their two
labels went in and the suite is where it was: 7,851 assertions, 0 failed.

---

## 2026-09-30 · #81 — the fix works, and it was never the sweep that was missing

### What I went looking for

Three issues in the plan turned out to be decisions rather than tasks — #72, #80,
#73 — and I deferred each with a note on the issue. #81 was next, and it was
marked `[~]`: half committed, one identified gap, *"the attribute is right and the
language sweep does not reach the notice host"*.

So the first thing to do was check that claim rather than build on it.

### The claim is false, and here is the window

Driven in Chromium against `dist/`, at four points during boot and once after a
switch:

```
boot   #notices inside document.body                        true
  0s   data-i18n="registriesFailed"    Hebrew sentence
  2.5s  data-i18n="registriesGaveUp"    Hebrew sentence
       data-i18n="retrySave"            נסה שוב
switch
       data-i18n="registriesGaveUp"    "The command list did not load — the
                                         toolbar and menus will stay empty.
                                         Reload the page."
       data-i18n="retrySave"            "Try again"
```

The sweep reaches the notice host. `noticeHost()` appends to `#app`, `localise()`
defaults to `document`, and `rerenderChrome()` calls it on the toggle. The fix in
`7e14220` is correct and complete.

### So why was the fence red?

Not a boot-order race, which is what the previous entry concluded after the first
conclusion was wrong. `browserlang.test.mjs` serves `dist/`, and:

- `dist/` is git-ignored;
- `gate.mjs`'s `editor` check runs `node test/run.mjs` and **does not build it**;
- the CI app job runs `node tools/gate.mjs editor` and *then* `npx vite build`.

So in CI the file always skips, the gap is invisible, and on a machine with a
local `dist/` the one test in the repository that opens a real window can be
served **any build from the past** and reports on it in the present tense.

Measured: `dist/` was built 2026-09-28 04:42. Commit `7e14220` landed
2026-09-29 13:22. The fence was red about a fix it had never seen.

Two conclusions were recorded on the strength of it — *"the sweep does not reach
the notice host"*, then *"the fence is a boot-order hostage"*. Both are false,
and the second one is worse than the first: it taught the next reader that a
single run is not evidence, which was a true statement with a false reason, and
therefore no reason at all.

### The fence was real after all

Deleting the two `data-i18n` attributes and rebuilding:

```
FAIL no catalogue key stands in Hebrew that this file has not recorded
  got  ["registriesGaveUp","retrySave"]
FAIL the recorded set is a superset of what is standing (3 of 2)
✗ browserlang.test.mjs     11 passed, 2 FAILED      — four runs out of four
```

Unmutated, against a correct build: **13 passed, six runs out of six.** The fence
was never the problem. It was answering correctly about the wrong build.

### The fix, and what it is not

`assertFreshBuild()` compares newest-of-`src/` against newest-of-`dist/` and
**refuses**. Red, with both timestamps and the one command — not a skip, because
the two are different sentences: *"this machine cannot run this test"* is a
complaint about the machine and the file already says so; *"`dist/` is a day old"*
is the test about to report a confident fictional finding. A skip would have been
the same silence with a friendlier sign.

Newest-of-each on both sides, because `vite` writes many chunks and `src/` is
many files. And `src/` against `dist/`, not against `test/`, so fixing a wrong
test does not make the build stale and does not go red for no reason.

Fenced from both ends in `visibility.test.mjs`, next to the acceptance script's
`assertFresh`, which has fenced this exact class for the server binary since it
was written. Four mutations, all caught:

| mutation | caught by |
|---|---|
| guard renamed away | 3 assertions red |
| refusal downgraded to a skip | 1 |
| call moved **after** `await browser()` | 1 |
| fresh path returns `undefined` again | 1 |

Two of those are worth recording rather than counting.

**The fourth was mine, and it is the oldest bug in this file's genre.** The guard
ended with a bare `return` on the fresh path; the call site read the answer as a
boolean, so a *fresh* `dist/` was indistinguishable from a refusal and the file
skipped itself on every run, printing nothing. `run.mjs`'s "asserted nothing"
check is what caught it — that check earning its keep twice — and the fence now
asserts the `true` is there, because a bare `return` is the spelling that
reproduces it.

**The third is a fence I wrote that could not fail.** I asserted the guard ran
before the browser with `indexOf("assertFreshBuild()") < indexOf("await
browser()")`, and it stayed green when I moved the call to *after* `await
browser()` — because `indexOf` found the **declaration**, `function
assertFreshBuild()` at line 120, which is always before anything. A positional
fence written over source finds the first spelling of a name, and a name has two
spellings. This is the same trap twenty lines above in the same file, about a
fixed lookahead matching whatever happens to be nearby, and I walked into it
while adding a fence twenty lines below it. `!assertFreshBuild()` is only ever
written at the call, so it is the call.

### Also fixed, and it was landing red before I started

The documentation fence was **already failing on a clean tree**: `SESSION_LOG.md`
said "7,851 assertions", the backward sweep read it as a claim about today, and
#81 landed with a red suite. Confirmed by stashing everything of mine.

The two honest-looking fixes are both wrong. Rewriting the number destroys the
record; dropping the sentence does too. **The instrument was wrong, not the
log.** `LOGS` exempted `decisions/` and `lamdan/`, both directories whose files
carry a date **in their name**, and `SESSION_LOG.md` is thirty-two days in one
file with the dates in its **headings** — the same lifecycle, held differently,
which the exemption could not express.

So `logDate` learned to read a body: a dated `## …` heading, newest wins. And
`SESSION_LOG.md` joined `LOGS` with the reason stated. Three mutations, all
caught: dropping it from `LOGS` (the exemption stops excusing anything real),
disabling the body branch (it stops being a dated record), and widening the
exemption to `docs/start-here.md` — which fails three ways, including the
pre-existing *"no exemption reaches a page that is documentation"*.

This is the sweep working as designed, one level up: the same check that caught
`decisions/` being extended to reach a living page is what makes adding a record
here cost something. An exemption that buys nothing is refused.

### Three issues deferred, with the measurement attached

Not "no time" — each one is a decision, and each comment says what was measured.

- **#72**, `app_data_dir()` for `@local`. The cheap half is blocked on a seam that
  does not exist: `packages_root()` is the engine's only root and it is hardcoded,
  and the shell's only two references to the engine are `services::find` and
  `(svc.call)(&input)` — **the compile channel is `(name, String)`**, no path, no
  `AppHandle`. So it needs a new process-global in the place this repository has
  deliberately never had one, and whether that root is set by the app at startup or
  arrives on the request is the difference between a feature and the sandbox
  gone. One measured trap recorded either way: `diagnostics::missing_package()`
  recovers `@ns/name:version` by splitting on the literal `"packages/"`, and a
  user root not so named degrades the message back to *"a file (e.g. an image)
  wasn't found"* — the wart #67 closed.
- **#80**, reledmac/reledpar. The forwarded "Bug C" is **already built** —
  `footnote_streams`, `ksav/engine/src/lib.rs:4650`, two registers side by side
  with independent per-stream numbering, fenced to converge. So the residue is
  exactly two features: line numbers (nothing in the prelude) and lemmata
  (`rg -i lemmat` returns one hit, and it is `PLAN.md`). I would do #73 first.
- **#73**, bundling `meander`. Its own precondition is discharged — #70 measured
  that a breakable Typst block threads cleanly — but reading `meander` means
  vendoring it, which is a licence and a permanent weight with a name on it. I
  offered the reversible half: the resolver reads a directory, so removing the
  directory removes the capability with no code change.

### State at log write

| item | state |
|---|---|
| #81 | fixed — `assertFreshBuild()`, fenced from both ends, 4/4 mutations caught |
| pre-existing red | fixed — `SESSION_LOG.md` exempted as a record, 3/3 mutations caught |
| #72, #80, #73 | deferred, with a measured comment on each |
| #82 | not started |

Editor **7,849 → 7,858** across 112 files, all green. Engine untouched (1,069
tests, 75 binaries). `tsc --noEmit` clean.

### Next move

#82 — `Expanded::lines_of`, with `line_of` fenced as its first element.

---

## 2026-09-30 · #82 — the engine half is built, and the product half has no site at all

### What the issue asked for, in two halves

`Expanded::lines_of`, and a second gesture that offers every place a part appears
instead of only the first. The first is a clear task. The second is not, and
finding out why is the substance of this entry.

### `lines_of`, and the invariant made structural

```rust
fn matching<'a>(&'a self, file: Option<&'a str>, line: usize)
    -> impl Iterator<Item = usize> + 'a
```

Both `line_of` and `lines_of` are built from it. The issue asked for "`line_of`
fenced as its first element so the two cannot drift" — and a fence is a promise
that somebody will keep checking. Making them share one predicate **removes the
possibility** rather than watching for it, which is strictly better, and the
fence is still there in `tests/includes.rs` for the reason the house has
recorded about fences that check what the compiler already guarantees: a thing
true by construction today can be true by accident tomorrow, and what is worth
holding is the *sentence* — **first is reading order** — not the identity.

`line_of` stays lazy (`.next()`, not `lines_of(..).into_iter().next()`). It is on
the reveal path, and it is overwhelmingly the first match that answers, so the
lazy form allocates nothing per keystroke. Measured: it has exactly one caller,
`jump.rs:285`.

### Why the product half cannot be built, and it is not a matter of effort

I went looking for the site and it is not there.

- `BodySpot` is `{line, column}` — **`api.ts:670`, no `file` field.**
- `reveal_request` reads `file` off the request (`jump.rs:283`) — and the app
  never sends it, because there is nowhere to send it from.
- So `lines_of` is reached with `file: None`, and a **main-body line maps to
  exactly one expanded line**. The list is always length one.

There is no ambiguity to offer a list of, because the app cannot address a place
inside a part *at all*. The ambiguity #82 describes needs the writer to be
standing in `perek-3` line 2, and the only document the editor holds is the one
in front of it. This is #72's *"the app has no file tree and a part is not an
addressable thing"*, arriving from the other direction.

Left open, deliberately, and the order is written down: **#83, then #72's
decision, then this.**

### #83, found while looking, and it is the worse half

Click a word on the page that came from an included chapter and the caret lands
at that line number **in the parent**. Not ambiguous — simply wrong, and with no
hint that it is wrong.

The engine is right. `jump.rs:262` returns `{line, column, file}`, and
`tests/includes.rs` fences it for diagnostics (`a_mistake_in_a_chapter_is_
reported_at_that_chapters_line`, asserting `file == "פרק ב"` and `line == 2`,
*"not the assembled line 4"*).

The file is lost **at the wire reader**, `api.ts:1126`:

```ts
function readSpot(v: unknown): BodySpot | null {
  const o = v as { line?: unknown; column?: unknown } | null;
  …
  return { line: o.line, column: … };
}
```

So `rg "spot\." src/main.ts` returns `spot?.line` and `spot?.column` and nothing
else — not because `main.ts` ignores the file, but because it was never in `spot`.

Two things make this worse than a plain omission:

**`Located` (`api.ts:704`) declares `file` and is imported nowhere.** `rg
"Located" app/src` returns the declaration and nothing else, so the type that was
written to say the file *is not decoration* is not decoration and not anything —
it is dead.

**`wire.test.mjs` cannot see it.** That fence reads the engine's `json!` literals
and asks whether *an interface declares* each key. `Located` does declare `file`,
so it passes. The failure is a **reader narrowing a response**, and that is the
direction the fence does not run in. A declared key is not a read key, and the
repository has a fence for the first and not the second.

And the fix is already written, ten lines away, for the sibling case.
`diagview.ts:74` does `const fromPart = !!d.file`;
`diagview.ts:100` refuses to underline a chapter's line in the parent (*"would
mark an innocent line"*); `diagview.ts:276` dispatches

```ts
file ? goToPart(file, line, column) : goToLine(line, column)
```

and `onGoToPart` (`main.ts:14847`) **opens the chapter and jumps to the line**.

So the app knows exactly how to get inside a part, uses it for every diagnostic,
and does not use it for the one gesture the setting is named after
(`settings.clickToSource`). #83 also does not wait for #82: the ambiguity needs a
part included **twice**; this happens the first time one is included **once**.

### Fences

`tests/includes.rs`, four tests. The one that matters is
`line_of_is_the_first_of_lines_of_and_they_cannot_drift`, which sweeps every
`(file, line)` in the document and asserts `line_of == lines_of.first()`, plus
the counts the sweep cannot pin — the part is in twice, the main body once each,
four positions for the part's two lines.

`a_document_with_nothing_included_answers_for_the_whole_body` is the one I would
have forgotten: `origins` is empty on the fast path, `line_of` answered `None`
there before `lines_of` existed, and the new method had to agree rather than
invent an answer for a document nothing was included into.

Two of my own errors, both caught before they landed:

- the first `twice()` fixture had a stray `\בין` where a newline belonged, and an
  assertion that every match has length 2 — **false for the main body**, which is
  once each. The sweep would have gone red on the fixture, not on the code, which
  is the worst place for it to go red;
- the invariant test's original shape asserted `all.len() == 2` whenever
  `line_of` answered, which is a claim about the fixture rather than about the
  property. Replaced with *"an answer implies at least one position"* — a list
  shorter than the single answer is the bug this was opened for.

### State at log write

| item | state |
|---|---|
| #82 | engine half done, product half blocked on #83 and #72 — issue left **open** |
| #83 | filed and placed in Phase 3, with the three-step loss and the existing fix |
| #81, #72, #80, #73 | as logged above |

### Mutations

Two, and they are the two distinct properties rather than two spellings of one.

| mutation | caught by |
|---|---|
| `line_of` answers `.last()` | 1 test, and the panic names it: `line_of Some(5) is not lines_of [2, 5]` |
| `lines_of` given its own, broader predicate | **3** tests |

The second is the one worth having. Giving `lines_of` its own predicate is exactly
the drift the shared iterator exists to prevent, and it broke three separate
assertions — `lines_of [4, 7]` where `line_of` said `None`, and `[1, 4, 7]` where
the main body's line 1 was asked for. Three because the property is asserted from
three directions, which is what I wanted and could not have predicted.

### The one place I did not follow the gate, and why

`gate.mjs`'s `engine` check is `cargo test --release` over **all 75 binaries**.
I did not run all 75. Ten targets, chosen to cover what this change can reach:

```
src/lib.rs (249)        ← jump.rs is `line_of`'s only caller, and services.rs
tests/includes.rs (19)  ← the change
tests/assemble.rs (6)   tests/note_layout.rs (12)
tests/assets.rs (13)    tests/pagetext.rs (12)
tests/channels.rs (29)  tests/docfile_oracle.rs (7)
tests/deep_link.rs (6)  tests/entry_address.rs (7)
```

**all green**, and `--lib` is the one that matters most: `line_of` has exactly one
caller and it lives there.

The reason is measured rather than chosen. This machine has 11 GB of RAM and the
default job count runs ~9 concurrent `rustc`, each statically linking the whole of
Typst; at `-j 9` the box fell to **1 GB available under load 27**, and single
binaries sat at 65% CPU for 29 minutes. Dropping to `-j 3` freed 5 GB and took each
to **~90%**. At that rate 75 binaries is roughly 4½ hours of linking for 65 of
them that cannot reach `include.rs`. Ten targets is thorough where it matters and
is not the same claim as all 75, so it is written down rather than rounded up.

Also recorded: `cargo fmt --check` is **already red on a clean tree** under this
machine's rustfmt 1.9.0 — `src/lib.rs` alone has 27 diffs, `include.rs` 6,
`tests/includes.rs` 12. My change adds **zero** new diffs (same 6 and 12 before and
after), so this is a toolchain-version question I cannot answer from here: CI
installs its own rustfmt and I do not know whether it agrees with 1.9.0.

Engine `#[test]` count 1,069 → **1,073** (`engineTests` is counted live off
`#[test]`, so the README moved with it). Editor **7,858**, all green. `tsc` clean.

### Next move

#83. It is the smaller patch and it unblocks #82's product half.

---

## 2026-09-30 · #83 — the file was dropped at the reader, and the fix is a type

### Three steps, and the loss is in the first

1. `engine/src/jump.rs:262` answers `{line, column, file}`. Fenced for diagnostics
   by `a_mistake_in_a_chapter_is_reported_at_that_chapters_line`, which asserts
   `file == "פרק ב"` and `line == 2`, *"not the assembled line 4"*.
2. `readSpot` returned `BodySpot` — `{line, column}` — and `BodySpot` is **the shape
   a request carries**. So the loss is at the *type*: naming a request shape as a
   response type is something neither compiler nor reader can see.
3. `main.ts` therefore had nothing to use. It is not that `jumpFromClick` ignored
   the file; `rg "spot\."` found only `line` and `column` because the file was
   never in `spot`.

### And the fence is a type, not a test

`readSpot` now returns `Located`. That is the whole fence for this class: a
reader that forgets a field **does not type-check**. Proven, not asserted —

```
src/api.ts(1143,3): error TS2741: Property 'file' is missing in type
  '{ line: number; column: number; }' but required in type 'Located'.
```

which is the old bug, spelled out by the compiler.

### One question, one function

`diagview.show` has asked *"did this line come from another document?"* for
diagnostics all along (`const fromPart = !!d.file`, `diagview.ts:74`), and
`diagview.ts:276` has dispatched `file ? goToPart(...) : goToLine(...)`. The click
path did not ask. So the question is now `clickedChapter(file, openTitle)` in
`jump.ts`, and `gotoPart` — extracted from the inline body of the boot wiring —
is the one thing that opens a chapter. Two paths to a chapter, one function.

`gotoPart` answers **nowhere rather than at the top**: `offsetOf` returns `null`
for a line past the end, and the old `?? 0` would have put the caret on line 1 of
the *right* document — the same class of wrong as the bug, one step further from
the truth.

### Fences, and a second fence that could not have failed

- **`services.test.mjs`** — all three transports, three engine answers: a line
  from a chapter, a line of the sefer, and **no answer at all**. The third is why
  the test says what it means: `{}` must not produce `undefined`, because
  `undefined` is a third answer to a two-way question. Plus the declaration
  itself, so a reader that keeps `file` while the *type* still says two keys is
  also caught.
- **`jump.test.mjs`** — the decision, and that `main.ts` calls it.
- **`tsc`** — the field cannot be dropped.

Mutations, five, all caught:

| mutation | caught by |
|---|---|
| reader keeps the type, discards `file` | every transport |
| `jump`'s declared type reverted to `BodySpot` | the declaration check |
| `clickedChapter` ignores the open document | 2 |
| the click branch removed from `main.ts` | 2 |
| the branch hands over raw `file`, not the decision | 1 |

**The last two exist because the first three did not cover `main.ts` at all**, and
that is the second time today a fence of mine passed while guarding nothing (the
first: an `indexOf` that found a function's *declaration*). `clickedChapter` could
have been correct, tested, and never called — which is **exactly what `Located`
was**. So there is now an assertion that `main.ts` names it twice and hands the
answer to `gotoPart`, with comments stripped on `prohibitions.test.mjs`'s rule
(a block comment must begin its own line, because `i18n.ts` holds a `/*` inside a
Hebrew string and a greedy strip deletes three hundred lines).

### One fence caught me, and it was right

`asyncaction.test.mjs` went red on the new `void gotoPart(…)`:

> *every bare `void f(` is accounted for — add src/main.ts:gotoPart to INVENTORY
> above with its reason, or call voidAction(doing, …)*

Both offered answers were wrong: an inventory entry saying "guarded" when it is
not, and `void`. `gotoPart` awaits `enterDoc`, so the promise can reject — and
`jumpFromClick` is an event handler, so a rejection there is an unhandled one.
`action(...)` on the awaited path and `voidAction(...)` on the diagnostic path,
both reported rather than swallowed. `Doing` is a closed union, so `"general"`,
and the reason is written down rather than left to look like a default.

### What I did not fence, and why that is a decision

**`wire.test.mjs` checks that a shape is *declared*. It cannot check that a shape is
*read*.** Measured across every seam row: **five** more wire interfaces are
declared and named nowhere outside their own declaration — `ClipboardSource`,
`Linkified`, `RefreshResult`, `Revealed`, `ServiceRow`.

So a blanket "a declared wire shape must be named somewhere" rule would be red on
five innocent ones, and I did not add it. All five are single-field or flat shapes
read structurally (`readPoints` returns `PagePoint[]`, not `Revealed`), so the rule
would be *wrong*, not merely noisy. `Located` was the only shape where a reader
returned a **different interface**, and that is now a compile error — which is the
honest fence for it.

### State at log write

Editor **7,858 → 7,878** across 112 files, 0 failed. `tsc` clean. Engine
untouched — this was a client-side fix and the engine was already right, which is
the finding: `jump.rs` has been sending the file correctly all along.

### Next move

#82's product half, now that #83 made a place inside a part addressable at all.

---

## 2026-09-30 · #60 — the loss was a `?`, and base64 has four spellings

### The line

```rust
let bytes = decode_payload(data)?;      // in a fn returning Option<Asset>
if name.is_empty() || bytes.is_empty() { return None; }
```

One `?` on an `Option`, and both failures were **silent**. A payload in any spelling this build did not accept, or one corrupted byte in a megabyte, produced *nothing*: the asset did not exist, the writer's sefer lost an image, and no diagnostic, status line or anything else said a word.

`Refused` was already there — a named entry per refused asset, surfaced as warnings through `lib.rs:3313` — and the unreadable case never used it.

### Four, not one, and the order is an argument

`decode_payload` took `STANDARD`. That is **one of four** ways to write the same bytes: `-`/`_` instead of `+`/`/`, and padding present or absent. A decoder that accepts one and refuses three is not being strict, it is picking one and calling it correct.

All four are now tried, and the ordering is not "whichever succeeds":

- the two **alphabets are disjoint** — `-` and `_` are illegal in `STANDARD`, `+` and `/` illegal in `URL_SAFE` — so a payload can only decode under the one it was written in. Nothing is ranked.
- the **padding pair is not** disjoint: the same string without its `=` decodes identically under `*_NO_PAD`. Trying padded first costs one extra attempt and never changes the answer.

So `STANDARD`, `URL_SAFE`, `STANDARD_NO_PAD`, `URL_SAFE_NO_PAD`.

### Fenced end to end, and the encodings are done by hand

`spelled(alphabet, pad)` writes base64 out itself, and the reason is the comment on it: **a helper that encodes with the crate agrees with the crate's own idea of what is valid**, which is the thing under test. It is also why the fixture is the 1×1 PNG already in this file rather than a round trip through `png().bytes`.

Four tests:

- all four spellings must yield **four identical byte strings** — four encodings of one image must not be four different images;
- **one corrupted byte** in a perfect payload must produce a **warning naming the asset**;
- an asset with a name and **no bytes** is reported separately, because *"unreadable"* and *"empty"* are not the same thing to go and fix;
- **a document with one unreadable image still renders.** That last one is what rules out the tempting wrong fix: a refusal that failed the compile would be a different bug, and #60 is not it.

The pre-existing `assets_are_read_from_a_request_with_or_without_a_data_url_prefix` test asserted `(assets, _)` — **the shape a test has when the second value is not asserted because there was nothing to assert.** Both of its drops went into a `Refused` nobody read. It now holds both sentences, and says what that `_` was.

### Also found, while in there

`name.is_empty()` in that condition was **unreachable**: `diagnose_name` refuses an empty name eight lines earlier, with the better sentence — *"an asset needs a name"*. So the condition had a branch that could not fire. Removed, and the removal is written down rather than left as a silent simplification.

### Why the whole condition is now two sentences

Undecodable bytes and empty bytes are two different mistakes — a broken transfer or a wrong paste, versus a client that sent a name and no content — and one sentence covering both would send a writer to the wrong place. Neither is worth refusing a compile over, which is why this **reports and continues**, exactly as a refused *name* does.

### Also filed: #84, the indent idea — and the argument I made that was wrong

Shaul's proposal, measured against the tree before it was written down — and the finding is that **nesting is already understood and simply not shown**. `spans.ts:scan()` produces `frames` outermost-first, `mode.ts:enclosing` and `structure.ts:structureAt` both read it, and `MAX_LEVEL = 9` already argues the case for a ceiling. So it is a view over existing state rather than new parsing, and `#הגדרות_כותרות`'s `הזחה`/`הזחה_מרבית` is already the step-and-a-cap shape this asks for.

Placed in Phase 5 per the routing rule, with the broader "put IDE features in" half as a second list ordered by what a *Hebrew* sefer writer loses. **Hover scope preview is the top of it, and it is deliberately not a tab bar** — a forty-tab apparatus is worse than one status line answering *"which `#הערה[` am I inside?"*, which `framesAt` can already answer.

### #84, and the five-line spec that settled it

I got this wrong **four times**, each time confidently, and the reason is worth one
paragraph because it is the same reason four times over today.

The first three, briefly: I filed it as margin guides and argued the source must not be
touched; I turned "percent used" into a share of nesting levels and reached for
`MAX_LEVEL = 9` as its precedent; and I read "indented source" as *rewriting your file*
and spent three paragraphs on idempotence and `git` noise. Then **I invented a `#כלול`
problem that did not exist** — I asked whether a chapter's indentation should follow it
in and out of a note, and wrote a careful recommendation about it, and the whole question
only exists if indenting *writes files*.

**The shape of all four is the same: I found a nearby thing sharing a name and answered
from it.** Also #81's stale `dist/`, also #82's unreachable product half, also
`wire.test.mjs` checking declarations rather than reads. Four times in one day, and the
correction each time came from asking what the thing is *for*.

The spec, which supersedes every inference:

> every `][` in its own line, indented. the amount we indent is a user set value. the
> point at which indenting stops can be defined by amount from side (in rtl languages,
> from left side) or percent used. there is a setting for minimum words to indent. if you
> make paragraph breaks within an indented paragraph, they share an indent level. there is
> absolutely no change to the real file. and all this is a view, which you can turn on or
> off.

Two things in it I had backwards, both recorded so the next person does not "correct"
them:

- **the RTL side is the LEFT.** That is the opposite of `padding-inline-start`, which is
  what I would have written without being told.
- **paragraph breaks share the indent level** — and this is a *rule*, not a detail. A
  blank line has no content to hang an indent off, so the obvious implementation gives it
  none and the block visibly falls apart at the first gap in the prose.

And the last line answers the question I had open: **it is a toggleable view and the file
never changes**, so there is nothing to save, nothing to undo, nothing to keep idempotent
and no `git` noise. Every one of my four worries was about a rewrite that does not happen.

Defaults left to me: **2 spaces** (`table.ts:258`, the one place here that already
pretty-prints), **50 percent**, and a minimum-words number.

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

---

## 2026-09-25 · #51 a document that runs code says so (closed)

### The measurement that changed the fix

The report says a shared `.ksav` "ships arbitrary `#let`/loop/package code that
runs on open/compile with no prompt or diagnostic". Two facts in the engine bound
that before I wrote a line of the fix:

- **No network, no disk outside `packages/`.** `typst-as-lib` offers a resolver
  that *downloads*; this one declines it and builds a resolver whose root **is**
  the bundled package directory. `lib.rs` on `packages_root`: *"a document cannot
  reach anything else on the disk through it."*
- **A bounded run.** `server.rs` compiles on its own thread; the pool thread only
  *waits*, with a timeout.

So the honest sentence is the small one — *the document runs the commands it
carries, they can change what the page says, and here they are* — and I pinned the
wording against five overclaims (`arbitrary`, `malicious`, `untrusted`, `attack`,
`exploit`) because "improving" a warning into a scary one is the likely next edit
and it would be wrong in both directions.

### Which clients were actually silent: three different answers

| Client | Before | Now |
|---|---|---|
| browser | **not silent** — the palette lists the document's commands, chipped `fromDocument` | unchanged; `commands.test.mjs` already fences it |
| CLI | silent | one `warning:` line naming them |
| Emacs | silent | one `message`, once per open |

The browser was the informative measurement. `available()` already carries
`from: "document"` and `i18n.ts` has `fromDocument`. What it does *not* do is show
the preamble's **text** — the names, not the code. That is a UI decision rather
than a defect, so it is written up on the issue, not decided here.

### The two halves

`DocFile::advisories()` is one list holding both kinds: the missing-asset warning
that predated it, and the new one. `main.rs` used to format the first itself, and a
second formatter is a second wording.

In Emacs, `ksav--announce-preamble` fires from `ksav--unwrap` — the single door
where a file's container is adopted.

### Two traps in the Emacs half, both recorded in the code

**The first name-scanning regex matched nothing, and the suite was green.**
`\\(?:#\\)?let[ \t]+\\([^ \t\n()\[\]{};,]+\\)` — bisected in a file rather than
through shell-escaped `--eval`, the culprit is Emacs's regex reader taking `}` in
a bracket expression as the start of an interval, so adding `{` to a negated class
made the whole pattern match no preamble at all. `[[:alnum:]_]` is the fix and the
better class anyway: an identifier is a run of word characters, and a negated
class has to escape brackets, braces and commas to say the same thing.

**`with-message-to-string` does not exist** — the name sounds right. And
`message-function` is read by the interactive `message` *command*, not the
function, so binding it captures nothing and the test passes for the wrong reason.
The capture is `cl-letf` over `message`, and the docstring on `ksav--say` says why
both of the others are wrong.

### Fences, each shown to do its job

| Where | Mutation | Result |
|---|---|---|
| `docfile.rs` | the advisory suppressed | three tests red |
| CLI | a `.ksav` carrying a preamble | `warning: … defines its own commands and they are compiled with it: …` — it names both, `דגש, mine`, and their size, two of them over two lines |
| CLI | a plain `.ksav` | nothing; the compile line otherwise identical |
| `ksav.el` | the announcement suppressed | `ksav-the-announcement-names-the-commands-and-their-size` red |

The negative half is asserted as firmly as the positive one in both languages: most
`.ksav` files are plain text, and an announcement on every open is one nobody
reads.

Engine tests 1001 → 1006. Editor assertions 7,638 → 7,639. Emacs 60 → 63. Next in
Phase 2: **#53**, the engine's SVG `innerHTML` and attribute passthrough.

---

## 2026-09-25 · #53 engine SVG innerHTML (closed)

### Measured first, and the measurement changed the verdict

Built the hostile file the issue describes — a `.ksav` carrying an SVG asset with
`<script>`, `onload` and a `foreignObject` — and compiled it:

```
warning: hostile.ksav:3:1: image contains foreign object
<image xlink:href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0i…" width="30" …/>
grep -c script  hostile.page-1.svg  →  0
```

Typst does **not** inline an SVG image; it base64-encodes it into an `href`. And
it escapes text, so a document whose body is `<script>alert(1)</script>` is text.
So both obvious payload routes were already closed, and the finding that survives
is the **absence of a fence** — a path safe today because of an upstream encoder
is one Typst version from not being, and nothing here would notice.

The number that replaces the argument: `alarming: []` over the whole corpus.

### The allow-list is generated, and the reason is one name

`emit-svg-vocabulary.rs` compiles every template plus two documents for shapes
they do not reach, scans every page, and writes `svg-vocabulary.json`;
`emit-svg-vocabulary.mjs` turns it into `svg-vocabulary.gen.ts`. Ten elements,
twenty-two attributes.

And there is a name in that list nobody would have written down: **`<a>`** — Typst
emits an `<a>` with a transparent `<rect>` and no `href` for a link's hit area. A
list written by reading the markup drops **every link in every document**, silently,
and no test in this repository renders a document and asserts anything about links.

The **denied** list is not generated: refusing a name is a judgement, and
`svg_output.rs` asserts the two never disagree about a name the engine actually
emits — the only disagreement with a consequence.

### Three bugs the tests found

1. **Dropping a tag is not dropping the thing.** Dropping `<style>` and passing the
   body through emitted `*{background:url(javascript:…)}` as text. The
   hostile-input list caught it because the string still said `javascript:`. A
   filter that removes a tag and keeps what was between them has reclassified it,
   and "inert text" is a claim about a consumer nobody has checked.
2. **A denied *self-closing* element spun the scanner for ever.**
   `<animate attributeName="href" values="javascript:1"/>` — the branches that
   handle a refused element advanced `i` only when it had content to skip. A
   **crash**; the process dumped core. The two shapes that hang are the two no
   engine output has ever contained.
3. **The measurement itself was wrong first.** Its attribute reader split a tag
   body on whitespace, so every path segment in every `d="M3.15 3.6…"` became an
   attribute name — 30,000 names that were numbers. A measurement that does that
   is worse than none, because it looks like a vocabulary.

### `DOMParser` was the first shape, and the harness decided it

Parse with `DOMParser` and build with `createElementNS` is structurally the best
answer: a name not on the list is never created. It is also untestable here —
`test/harness.mjs` says a `document` on `globalThis` is enough to convince
`@codemirror/view` it is in a browser, so it installs none, and a fence needing a
real DOM is a fence that gets skipped wherever it is inconvenient.

The same constraint answered the wiring. My first attempt built the page panes with
`document.createElement` and **three suites went red with `ReferenceError: document
is not defined`** — the harness's own comment refusing exactly that. The fake
host's `innerHTML` setter parses `<div class="page">` runs because that is the
shape `drawPages` emitted before; the wrapper is our markup and the string inside
it has been through the filter, so composing through the host is both supported
and safe.

### A prohibition, with three claims rather than three skips

`prohibitions.test.mjs` forbids engine SVG reaching `innerHTML` (`= ""` is allowed
— that is a pane being emptied). The three exempt files are claims the harness
checks are *still* true of each: `svgsafe.ts` is the allow-list; `preview.ts`
composes a wrapper around a filtered page; `ksav-lang.ts` is a CodeMirror widget
rendering the **application's own** table markup, and it is listed because it is
the *other* `innerHTML` in `src/`.

### Fences, each shown to do its job

| Where | Mutation | Result |
|---|---|---|
| `svgsafe.ts` | a `<style>` body | the body leaked as text; the test said `javascript:` |
| `svgsafe.ts` | a denied self-closing element | the scanner hung and the process died |
| `preview.ts` | back to `node.innerHTML = …` | the prohibition went red on `preview.ts` |
| the fixture | `<a>` removed | the generator refuses; `svg_output.rs` goes red |
| `skips.test.mjs` | — | rejected the staleness test for no floor; it now asserts ≥14 pages came back |

`skips.test.mjs` has made that same complaint four times today and has been right
every time: a walk that stopped finding pages would measure an empty vocabulary,
write it, and leave everything else green over a measurement of nothing.

Engine tests 1006 → 1009, binaries 69 → 70, editor assertions 7,639 → 7,775 across
109 files. Next in Phase 2: **#52**, asset names unvalidated and `ksav.typ`
shadowing the prelude.

---

## 2026-09-26 · #52 asset names (closed) — and Phase 2 complete

### The issue's impact is wrong, and the real one is worse

`#52` said a `.ksav` with an asset named `ksav.typ` "replaces or confuses the
trusted prelude". Measured, the shadowing is **closed by resolver order** —
`with_static_source_file_resolver([prelude_source()])` comes *before*
`with_static_file_resolver(files)`, so the prelude is consulted first, the
attacker's `#let`s never bind, and `#attack` is reported as unknown. `ksav.TYP` is
inert too: `VirtualPath` is case-sensitive.

The rule is kept anyway, for the honest reason: a name the resolver will never
reach is a name that should not be accepted, and the chain is a two-line change
and a plausible one. `ksav.TYP` is deliberately **not** a rule — a rule I cannot
justify trains people to skip the list.

### What nobody had looked at

I walked a list of hostile names through `compile_with`. Two **killed the
process**:

```
panicked at typst-as-lib-0.16.0/src/conversions.rs:23:44:
valid virtual path: Escapes      ← ".."
valid virtual path: Backslash    ← "C:\"
```

`.expect()` on a `VirtualPath`, and **no `catch_unwind` in this crate or in
`server.rs`**. So one unauthenticated request to `ksav serve` with an asset named
`../x.png` takes the worker thread down. That is a denial of service, not a
compromise — and it is why `diagnose_name` is a gate rather than a check.

### Two gates, and the tests are split to say so

- **the reader's**, so a *writer is told* — and before the payload is decoded, so
  a multi-megabyte blob for a refused name is never decoded to find out.
- **`compile_with`'s**, which is `pub` and is what makes the panic unreachable.

Mutation-tested independently: removing the `compile_with` filter brings the
panic back; removing the reader gate leaves the no-panic test green and turns the
two "a refusal is announced" tests red. Either can be deleted without the other
noticing, which is what a single test would have hidden.

### A refusal is not a missing asset

The existing `Vec<String>` means *"a hash this engine does not hold — send the
bytes again"*, and the client's answer is to re-send. A refusal reported there
would **loop for ever**, so it is a different type rendering as a **warning**
diagnostic. On the `.ksav` path it rides on `advisories()` beside the other two,
because a refused name and a missing one look identical to a writer — an image
that is not on the page — and only one is fixable by sending the file again.

`read_list`/`read_one` were a second reader with the same hole in both; they are
**removed** rather than fixed, so `from_json` goes through the cached reader with
a throwaway `missing`.

### The half a threat-model rule always loses

Eleven ordinary names must survive, and they are in a test: `sub/dir/photo.jpeg`,
`a..b.png`, `my logo.png`, `שם-בעברית.png`, `..hidden.png`. So `..` is checked as
a **segment**, not a substring — `a..b.png` is a legal file name, and a gate that
refuses it is a gate somebody deletes.

### A test bug of my own

`with_asset` took a `&str` into a `json!` array, so it produced an array of
**strings**; the reader finds no object and reads it as nothing, so the test was
asserting an empty list for a reason unrelated to the name it was about. The
helper takes a `serde_json::Value` now, and its docstring says why.

### Phase 2 complete

#50 (chapter name into Typst), #51 (a document that runs code says so), #53 (the
engine's SVG through a measured allow-list), #52 (asset names). Next is Phase 3,
correctness highs, starting with **#2** — note-layout hazards, marked Critical.

Engine tests 1009 → 1019, binaries 70 → 71, editor assertions 7,775 → 7,776.
Emacs 63.

### The two clarifying comments asked for, filed under #64 and #68

- **#64** gained the two things its body did not say: that the ordering key is a
  title that is **set** rather than a header that happens to be there (with the
  case that settles it — a commentary keyed to *"where Rashi and the Tosafot
  differ"* has no header to derive from, so a model that only reads headers cannot
  order it at all), and that the sort needs a **footnote-interweave toggle**: a
  unit of B carrying its own notes, anchored inside a footnote of the base text,
  either interleaves with the base's footnote flow or appends to the end, and those
  are two documents rather than a formatting preference.
- The comment also asks the question that decides how big that toggle is:
  interleaving either **reserves a sequence** for the commentary's notes or
  **renumbers the base text's own footnotes**, and the first re-numbers notes the
  writer has already seen numbered.
- **#68** (the companion that mirrors A's structure into the sorted result) gained
  the parts that reach its own resolving test — and one consequence specific to it:
  if the title used for matching is *not* displayed, a transferred heading must not
  be promoted to a title, or a second sort would read the heading it injected as the
  anchor and re-order against it.

Recorded in the SESSION_LOG so there is a trail in the repository, and in the
issues themselves where the work will be picked up.

---

## 2026-09-27 · #2 note-layout hazards — six of seven were already fixed, and the fence is the deliverable

### The audit is a month old and the code moved

`#2` tracks seven hazards from the 2026-08-23 audit (B1–B5, B10, B11), each
`[render-verified]` or `[code-verified]` with a line number. I checked all seven
before touching anything, and **six no longer reproduce**:

| | finding | measured 2026-09-27 |
|---|---|---|
| B1 | `ערוץ:`+`אזור:` filed under one key, filtered under another | note drawn at y=712.5 — does not reproduce |
| B2 | the reserve scanner was blind to the `אזור:` spelling | reserve 3.25cm, ink 712.5, page number 799.02 on an 841.89pt sheet — does not reproduce |
| B3 | two side apparatuses interleaved at 4–9pt | fixture `12-two-regions-side`: first note's last line 137.75, second's first 151.13 — a full 13.38pt pitch apart, **stacked, not interleaved** |
| B4 | a channel-declared height bypassed the clamp | `_ch_region_height` routes it through `_ap_fit_room` now |
| B5 | a carried note arrived at the floor over a pinned one | the carry path calls `clear` now |
| B10 | `שורות()` resolved against two typographies | both halves go through `_ap_line_of` now |
| B11 | a `)` in a quoted argument derailed the paren scan | the scan is over a real parse, not a depth counter |

The fixes each landed **with a comment quoting the finding**, which is how I found
each one. So the code is in better shape than the issue says.

### And that is exactly why the issue is still open

Seven findings, seven comments, **zero tests**. Nothing in `engine/tests/` mentions
any of the audit's own fixtures. The code was fixed by hand and the property was
never written down, so the next rewrite of the side machinery or the reserve
scanner has nothing to fail. That is the whole of #2's remaining value, and it is
`engine/tests/note_layout.rs` — one render regression per finding, each doc
comment recording what was true when it was written.

### The seventh finding was real: a name nobody declared

B2's audit text has a sibling it flags as still open — "a note into a region name
that was never declared compiles clean ... no diagnostic ever says the name is
unknown". Measured: `ok: true`, **zero diagnostics**, ink at y=712.5, which is
exactly where a correctly-filed note lands. Indistinguishable, to a writer, from
right.

So the note is drawn. Nothing is lost. What is lost is the *destination*, and
silently, which is the quieter half of B1's defect class — B1 lost the text, this
loses the place. `unknown_destinations` is a **warning**, on the reasoning
`italic_warning` already states: the document compiles, the note is on the page,
and a writer part-way through a sefer keeps working. What must not happen is that
they never find out. It names the unknown name, lists the declared ones when the
document declares any, and locates the call (3:6, the `ה` of `#הערה`).

The seven tier channels are exempt because they are Typst's own balanced series —
warning on `#הערה(ערוץ: "הערה_ב")`, which is an ordinary sefer, is the noise that
teaches people to skip the list.

### Three of the four mutations fire, and two fences were vacuous

Mutation-tested, one at a time, restoring by md5 because I destroyed a working
tree restoring a stale backup:

- the warning not collected → `an_undeclared_destination_is_named` fails
- the tier channels not exempt → `a_known_destination_is_not_named` fails, and the
  panic prints the exact false positive a writer would have met
- the declared-name check never skips → the same test fails
- the reserve cap `total.min(page_h_cm * MAX_REGION_SHARE)` deleted →
  `a_declared_height_is_clamped` fails
- the channel-declared height ignored → `a_region_height_and_a_channel_height_agree` fails
- the scanner blind to `REGION_ARG` again → `the_region_spelling_reserves` fails
- the `שורות` unit unrecognised → `a_lines_band_resolves_against_one_typography` fails

**Three tests I wrote passed with the fix deleted, and are labelled accordingly
rather than shipped as fences:**

- **B1** — putting the pre-fix filter back (`_rg_show` re-deriving the region from
  the channel's declarations, which is what the audit named) leaves the note
  drawn. That filter is no longer on this note's path. Two document shapes later
  — a channel declaring no region, then a *named* region the channel never
  mentions — it still does not reproduce. The test asserts the property; it does
  not claim to protect that line.
- **B3** — deleting the cross-stream `sorted` in `_sn_placed` changes nothing for a
  two-region document, because for a **linear** document the sort's key
  `(page, want)` is already the document order. The sort only earns anything where
  the two differ: a note inside a table cell, a figure, a deferred section.
- **B5** — I could not build a document that reaches the carry branch at all. Two
  constructions both place the note by a different line, and the first version of
  that test passed with `clear` deleted, so it is **gone** rather than repaired.
  The branch is documented as unverified; a non-linear fixture is the next thing
  to build for B3, and a bounded-ceiling geometry for B5.

That is three of nine. The other six fire.

### A test bug worth the space it took

`a_carried_note_steps_over_a_pinned_one` asserted `carried.page == pinned.page`
under an `if`, so when the two notes landed on different pages — where the bug is
not reachable — it asserted nothing and passed. The mutation found it. It is now
`assert_eq!((pinned_page, carried_page), (2, 2), "the two notes must carry onto
the same page for this to be the bug")`: if the geometry ever moves them apart, the
test says so instead of skipping.

Engine tests 1019 → 1028, binaries 71 → 72, editor assertions 7,776 → 7,777.
Emacs 63, 0 unexpected.

### #2 closed; the verification gap is its own plan item

Filed the two unverified branches as `#2′` rather than leaving them as a paragraph
inside a test file: a non-linear note fixture is what reaches B3's cross-stream
sort, and a bounded-ceiling geometry is what reaches B5's carry path. A sentence
in a doc comment is a promise with no owner; a plan line is a task.

---

## 2026-09-27 · #6 fire-and-forget — the rule, and 43 call sites that did not have one

### Measured first, and the number is worse than the issue's word "many"

93 `void someAsyncCall()` sites, 59 distinct callees. Of those 59, **30 had no
`try`, no `catch` and no `.catch` anywhere in their body** — 51 of the 93 sites.
A `void p()` on a rejecting promise is an unhandled rejection: the browser logs
it, the writer sees nothing, and whatever the handler was halfway through
changing stays changed.

The issue's word for that state was "without an exhaustive policy, a new failure
*can* silently leave stale UI". Measured, 51 existing sites already could.

### `watch.ts` already knew the answer, which is why there was no rule

`src/watch.ts` is the model: `try`, a `catch` carrying a comment that says why a
`stat` that throws is a file that was unplugged and not a conflict, and `busy`
restored in a `finally`. The problem was never that the call sites were wrong. It
was that whether a call site was safe depended on who wrote it that day, and
nothing recorded the answer.

### One function, and the distinction it draws is cancellation from failure

`src/asyncaction.ts`: `action(doing, body)` returns a promise that never rejects,
and `voidAction(doing, body)` is the approved fire-and-forget form. A failure goes
through `troubleSaid` — the repository's existing answer to a caught error, so the
sentence is the reader's and the machine's string is behind the details
affordance — and lands in the status bar. A **cancellation says nothing at all**,
because a superseded compile is the app working and reporting it would teach
writers to ignore the status line.

**48 call sites converted**, the 26 that change which document is open or what is
on the page (`enterDoc`, `openDoc`, `closeOpenDoc`, `newDocTab`, `openInNewTab`,
`newBlankDoc`, `newNamedDoc`, `duplicateDoc`, `reloadFromDisk`, `loadTemplate`,
`setEditingMode`, `saveArrangementHere`, `restoreSnapshot`, `addFont`,
`importDictionary`) plus the 22 unguarded ones elsewhere (`refreshGit`, `runGit`,
`restoreCommit`, `revertCommit`, `compareWithCommit`, `renderHistory`,
`revealCursor`, `jumpFromClick`, `offerRecovery`, `maybeCheckForUpdate`,
`openSharedIfLinked`, `saveFileAs`, `startFromTemplate`, `healAll`, `renumberAll`).

One of them was **awaited**: `void setEditingMode(value).then(rerenderChrome)`
chains `.then`, so it became `action`, not `voidAction` — which is the distinction
the wrapper exists to make visible at the call site.

### Three of them were never promises

`healAll` returns the number of fixes applied, `renumberAll` the number of fields
renumbered, `startFind` whether a find opened. `void f()` on a number discards
nothing that can reject. The typechecker said `Type 'number' is not assignable to
type 'Promise<unknown>'`, which is the honest answer, and they went back to bare
`void` with a note saying why. A rule that wraps a synchronous call to look
careful is a rule that teaches people the wrapper does not mean what it says.

So the sweep now finds 47 sites, 32 distinct, and **every one either returns no
promise or carries its own error handling**. That is the answer to the issue's
"inventory all user-triggered handlers and classify each", arrived at by
measurement rather than by assertion.

### My first `isCancellation` swallowed real failures

It matched a message merely *containing* "cancelled" — so
`Error("cancelled the subscription")`, a broken subscription, reported nothing.
That is precisely the defect this file exists to remove, and a test case in my own
file caught it. The heuristic is gone: a cancellation is `AbortError`,
`TimeoutError`, or this app's own `cancelled()` marker, which is an object rather
than a string so nothing that merely says the word is mistaken for one.

### The fence, and four mutations

`test/asyncaction.test.mjs` sweeps every `void f(` in `src/`, comments stripped
(several mention `void` in prose, and a fence that fires on its own documentation
is a fence people learn to disable). It requires each to be in an inventory with a
reason, requires the inventory not to name a `void` that is gone, and requires
every reason to contain a justification keyword rather than a shrug.

Wrapper behaviour is asserted through the **real built module** and the **real
status bar** — `installChrome()` and `document.getElementById("status")`, the
harness this repository built for exactly this class of bug. My first version
instead read the source, stripped it with Node's own `stripTypeScriptTypes`, and
evaluated it with two dependencies replaced; that worked and it was the wrong
call, since it tests a copy. The version I kept also has a comment about why the
replacement is *named functions* and not inline arrows: substituting a callee with
an arrow expression in place turns `f(a, b)` into `(x, y) => …(a, b)`, and the
arrow body swallows the call.

Four mutations, each run:

- a new bare `void newNamedDoc()` → the sweep fires and names the exact site
- every failure swallowed as if it were a cancellation → the three reporting
  assertions go red
- no cancellation recognised at all → the same three go red
- the wrapper writing its own failure sentence, bypassing `troubleSaid` → the
  "writes no sentence of its own" check goes red

`runner.test.mjs`'s "every module is imported by at least one test" caught that
`asyncaction.ts` was not, which is how it ended up on the normal build path
instead of in `NOT_IMPORTABLE`.

Editor assertions 7,777 → 7,798, test files 109 → 110.

### #6 closed; the inventory is the deliverable, not the wrapper

The wrapper is 60 lines and could have been written in ten. The 32-entry
inventory with a measured reason beside each is the part that stops the next
`void`, and the "may not name a `void` that is gone" rule is what stops the
inventory itself from becoming the thing it replaced — a list that rots into
permission.

---

## 2026-09-27 · #2′ the two branches #2 could not reach

Both closed by finding the geometry, and in both cases the geometry is the lesson.

### B3: one `place` away

`_sn_placed` sorts the streams together with `items.sorted(key: it => (it.page,
it.want))`. I had deleted that sort and **two documents came out byte-identical**:
two side regions with one note each, and two table cells. The reason is the key —
for a linear document `(page, want)` *is* the document order, and two cells in a row
share a baseline, so a tie keeps the order. A sort that cannot change anything is
not a sort that can be tested.

What it protects is worth more than the audit's interleaving. Anchor one note 300pt
down the page and the next at the top, so the source order is the **reverse** of the
reading order — which is the only situation where the sort does anything:

```
#place(dy: 300pt)[#הערה(אזור: "ר1")[הערה במקום גבוה]]
#place(dy: 0pt)[#הערה(אזור: "ר2")[הערה במקום נמוך]]
```

With the sort: 406.08 and 106.08, each at its own marker. **Without it: 406.08 and
432.66** — the second note drawn 326pt from the word it belongs to, in the other
apparatus's band. A note a reader cannot find from its marker is B1's defect class
arrived at from the other direction: the text is drawn, and it is somewhere else.

### B5: four wrong documents, and the fourth is the whole one

1. **A page with no paper grows.** The carry branch's guard is
   `y + it.h > ceiling`; `ceiling` is `_pg_text_bottom()`, which is `none` unless
   `page.height` is a length. `רציף` (continuous) is off by default, but
   `page.height` is still `auto` unless `#מסמך[…]` is the thing carrying the
   setting — so the document has to be *inside* one.
2. **The note has to be too long for its page.** A 500pt note anchored at the top
   of page 1 fits, and then there is nothing to carry. 200 repetitions of a phrase
   does not.
3. **The pinned note has to hold the top of the page being carried *onto*.**
4. **And `clear` was a no-op while the pinned note was the immediately preceding
   item** — because `cursor` is already `y + it.h + gap`, the same arithmetic
   `clear` performs. My first two attempts died on exactly this, and a test that
   could not fail is worse than no test. Hence a page break: the pinned note is the
   first line of page 2, and the carried note arrives at the top of page 2 having
   been anchored on page 1.

Measured with `clear` deleted: carried at **y=90.24**, pinned at **y=95.63**, same
column, same page — 5.4pt apart, and the two are 40pt and 500pt tall. That is the
audit's sentence, reproduced: *a note printed straight through it*. With the fix,
135.40, which is 39.8pt below the pinned note's top — its height, exactly.

Both mutations confirmed to fail with the fix deleted. `note_layout.rs` is eleven
tests and **nine of them now fire with their fix removed**; B1 and B3's stacking
property test are the two that do not, and both say so in their own doc comments.

### The documentation fence caught me stating a count as prose

The #6 mutation table gave a count. `documentation.test.mjs` refuses a
numeric claim in a living page that no declaration backs — and it is right: I had
written a mutation result in the shape of a suite fact, which is exactly what that
fence exists to stop. Spelled out as "the three reporting assertions go red", which
is what it was.

Engine tests 1028 → 1030.

---

## 2026-09-27 · #5 config setters — sixteen of fifty, and the check was in the wrong place

### What the audit said, and what it was

"Several config setters accept unknown keys while sibling setters reject them;
typos become dead settings." Measured across all fifty `הגדרות_*` commands: **16
of 50 compiled clean on a misspelled knob.** Not a degraded page — an *unchanged*
one, with the writer's control reading back exactly what they typed and nothing
happening.

My first sweep was wrong twice before it was right. A static scan for `_cfg_strict`
reported **45 of 55 loose**, because most of those delegate to `_mk_set` and my
scan only looked at each command's own body. Then a sweep keyed on the string
"unrecognised argument" reported 17, of which two refused in their own words
("אין הגדרה בשם") and one for a missing positional — the *inverse* error, calling
a strict command a gap. The sweep that was right asked one question: does the
document compile?

### The root cause is better than "somebody forgot"

Seventeen of them validated **inside their `update` closure**, and a state's update
closure runs only when something reads the state. So the check was not a check; it
was a rule that fired on the next note. Against the pre-fix prelude, measured:

```
#הגדרות_טקסט_הערות(טיפא: true)   ok: true      …and one #הערה      ok: false
#הגדרות_כותרת1(טיפא: true)        ok: true      …and one = כותרת   ok: false
```

Two failures, and the second is worse. The document compiled when the writer typed
the typo, and stopped compiling later, on an unrelated edit, naming an argument
written a page ago. `#הגדרות_מספור` was already checked outside its closure and
says why in a comment — the difference between the two was which line somebody
happened to edit.

### The helper already existed, and I wrote a second one

`_cfg_validate`'s doc comment claims it is *"at the public boundary of every
settings command"*. Four commands used it. I did not look before writing, so I
wrote `_cfg_knobs`, put it after the commands that needed it — **and broke
`הגדרות_טקסט_הערות`**, because Typst has no forward references. The only thing
that noticed was the container probe, which filed a working command as
*undecidable* because every shape it tried now failed. That is the argument for
the probe existing.

Deleted mine, and strengthened the real one: it takes the named half of the
arguments (so a command handed a dictionary can use it), accepts either a defaults
dictionary or a bare list of keys, accepts extras, and **prints the legal list**
with the refusal. Twelve commands route through it now.

### Three of my own errors, and what caught each

- **Braces.** Wrapping `_hd_set` in a block without closing it broke the whole
  prelude from that line on: 65 tests red, and the first failure was a registry
  test that disagreed with itself about which `#let`s exist.
- **`type array has no method 'keys'`.** `_nt_keys` is a list, and I passed it
  where a dictionary was expected. The *typo sweep* caught this, not the test
  suite — because a panic is a non-compile too, and the sweep was only asking
  "did it fail". It now requires the message to **name the key the writer typed**,
  which is what distinguishes a refusal from any other failure.
- **A static fence that cried wolf.** `no_settings_command_skips_the_key_check`
  first read one line per command and reported seven violations, every one a
  command whose check is on line two. Then, after reading whole bodies, it
  reported 26 — because it took the first `{` after the name, which for
  `#let הגדרות_ציון(..opts) = _mk_set("ציון", …)` is the *next command's* brace. It
  reads balanced-one-line or brace-matched, and it recognises the phrasing
  `הגדרות_מספור` uses, because a sweep that calls a command which checks a
  violation gets deleted rather than amended.

### The other four sub-items, which are not code

- **`purge_ratio`** has no owner anywhere in this repository, and `issue-notes.md`
  already said so: *"adding that setting would invent a contract"*. Not added.
  A safety value with no subsystem that needs it is dead configuration with a
  domain test attached to it.
- **Tool probing is already bounded and machine-readable.** `git_run` has a
  120-second `DEADLINE` with a kill, and `version()` reads
  `"git version 2.54.0.windows.1"` with `rsplit(' ').next()` — no locale, no
  substring match — cached in a `OnceLock` because git does not upgrade itself
  under an open drawer.
- **Installer and Windows archive names**: there is no installer here. `packaging/`
  is a Dockerfile and two shell scripts; no Rust code writes an archive, so
  "reserved-name and traversal handling" has no site to be right or wrong in.
- **Grammar spans**: `line_column` exists in the engine and carries 1-based
  line and character column, and a `DOMException` crossing a worker boundary is
  matched by name for the same reason `isCancellation` matches by name.

### What is fenced

`engine/tests/settings_keys.rs`, six tests. All fifty setters must refuse an
unknown knob **by name**; the refusal must happen in a document with nothing that
reads the state; **every key the refusal offers must itself be accepted** (a list
that offers a key it then refuses is worse than no list); a global knob is still
global; and no settings command may skip the check, read out of the prelude so a
fiftyth command added next year is swept without a line being written here.

Five of the six fail against the actual pre-fix `ksav.typ`, restored from git —
which is the mutation that matters, rather than a reconstruction of it. An earlier
attempt at the "inside the closure" mutation passed all six, and the honest
conclusion is that my reconstruction was not faithful; the real pre-fix file is
what proves the claim.

`skips.test.mjs` then called the static sweep by name for keeping its assertions
inside a loop, and it is right: a sweep that matches nothing passes everything it
has. It now asserts a floor on the number of commands examined.

Engine tests 1030 → 1036, binaries 72 → 73. Editor assertions unchanged at 7,798.
The container fixture is **byte-identical** — `emit-containers` learned to tell
"I refuse this argument" from "I am not a container", so a strict setter stays
`transparent` rather than being reclassified.

### #5 closed, and the four sub-items that were never code

Worth saying plainly, because the shape recurs across this plan: an audit lists
five findings, one is a live defect with a root cause nobody had named, and four
are either already done or describe software this repository does not have. The
useful move was to say which, with the measurement, rather than to invent work to
match the list.

---

## 2026-09-27 · #3 i18n — eleven strings, and the hole is smaller than the issue's framing

### The infrastructure was already there

`setSetting("lang", …)` already called `localise()` and `rebuildOpenPanels()`, and
`localise` already sweeps all four label kinds — `data-i18n`, `-title`, `-label`,
`-placeholder`. A previous fix did the hard part. The issue's framing ("a complete,
testable localization architecture") describes the absence of *evidence*, not of
code.

### What was actually wrong, and it is not "Hebrew left on screen"

`t` falls back to `DICTS.en[key] ?? key`, and the i18n module says why that is right
at a call site — *"a writer sees a word rather than `sc.hiddenBreak`"*. So a key
with no English entry does not look missing. **It looks like a developer name.**
Measured against the built module:

```
setLang("en"); t("refreshTitle")  →  "refreshTitle"
setLang("en"); t("sourcePasted")  →  "sourcePasted"
```

Eleven of them — and not in a corner. `refreshTitle` is a **panel heading** and
`sourcePasted` is a **status line**. An English writer was not seeing Hebrew, which
is the defect everybody looks for; they were seeing a key name, which nobody looks
for. 919 Hebrew keys, 908 English.

This is why a dictionary test is not enough. `hasKey` answers *"is this in either
shelf"*, and a Hebrew-only key answers yes. The question is the other one: **is it
in the one the user is reading?**

### A Latin-script detail that would have shipped wrong

`sourcePasted` in Hebrew interpolates `${GIRSA}`. My first English version did the
same, which produced *"A source was pasted from גִּרְסָא"* — a Hebrew product name
inside an English sentence, which is the exact defect `language.test.mjs` exists
to prevent, in the one file meant to prevent it. Every other English line spells it
`Girsa`. Fixed.

### Two rules in the fence that were wrong, both catching good translations

The check I wanted was "no English value is its own key name". First attempt flagged
`words: "words"`, `chars: "chars"` and `recovered: "recovered"` — all real, all
with a Hebrew entry that differs. Second attempt went after "looks like an
identifier" and flagged `importWord: "Import from Word (.docx)…"`,
`copyFailed: "Copy failed — use \"Word (.doc)\" instead."` and
`git.installGit: "Install git: git-scm.com"` — a file extension and a URL.

What survives both is exact: **the value is the key, and the key is a name** —
camelCase or dotted. `refreshTitle: "refreshTitle"` is that; nothing in a real
translation is. The three cognates are now named in the test with their Hebrew
entries, so the next reader does not re-litigate them.

### The e2e the issue asks for, and the part that cannot be one

`installChrome` gives a `document` whose `querySelectorAll` returns `[]`
unconditionally — so `localise(document)` is a no-op that passes everything asked
of it. A browser test is not available and a test that claimed to open every panel
would open none.

What *is* testable is the real `localise` against the real dictionaries, on a root
implementing exactly the four selectors and the setters the sweep uses. That catches
the realistic regression — a dropped `data-i18n-title` line — and drops one `say(…)`
from `panels.ts` to confirm. Recorded as a gap, not approximated.

### Two vacuous assertions of my own, both in the same line

The per-attribute loop filtered on `n._attr`, which the rewritten node factory no
longer carried, so `mine` was empty and `every` on an empty array is true — and it
only *read*, so it compared Hebrew nodes against an English test. Two bugs pointing
at one assertion that could not fail. Found by the idempotence check immediately
after it, which is the only reason it was found at all.

### Mutations

- a new Hebrew-only key → "every Hebrew key has an English entry" and the size check
- an English value reverted to its own key name → two assertions, naming the key
- the `data-i18n-title` sweep dropped from `localise` → four assertions

Editor assertions 7,798 → 7,836, test files 110 → 111. Engine untouched.

### #3 closed; the browser harness is the honest remainder

The issue's own acceptance criteria are not all met, and the record says which:
"no visible or accessible text left in the old language" is fenced against the
sweep, but "open every panel, switch, read the screen, reload" needs a browser this
suite does not have. The gap is in the issue, not in the work.

---

## 2026-09-27 · #3′, asked for directly: can the language switch be tested for real?

### Yes, and the answer is that the unit test was measuring the wrong thing

A browser was here the whole time — `playwright-core` with a Chromium already in
`~/.cache/ms-playwright`. It would not start, because Nix keeps each shared library
in its own store path and none is on the default search path. About twenty were
missing; resolving them by name and walking the list until `ldd` came back clean
took four passes, and two of them — `libasound`, `libudev` — are present in a
32-bit and a 64-bit build, so the resolver has to check `EI_CLASS` and the failure
otherwise reads `wrong ELF class: ELFCLASS32`, which names nothing.

Then it worked, and the built application booted: **7,845 characters of Hebrew UI,
zero console errors**, the settings drawer open, thirty-one headings.

And the switch works. `dir` flips `rtl`→`ltr`, `lang` becomes `en`, the chrome
turns English, the choice is written to `localStorage` and survives a reload.

### And 114 Hebrew strings were still standing

That is the finding, and it is a whole layer the dictionary fence cannot see.

**Fifty of them are keys that have an English entry already** — `previewSide`,
`closeTab`, `searchScope.source`, `retrySave`, `untitled`, `zoomPane`,
`splitAcross`, the five `*Lede`s. They are written into `aria-label` and `title` at
boot, and `localise()` cannot reach them because nothing tagged them. This is the
defect `i18n.ts` already describes — *"a title that looked right until somebody
changed language, and then stayed in the language it was born in"* — fixed for
`panelHead` and never swept for the other twenty-odd sites. The `*Lede` family is
the systematic case: `panelHead` tags the head, the lede is the panel's own child,
so **every panel with a lede has an untagged one**.

**Sixty-four are composed strings** — `"פתח · Alt+a"`, `"Rename: ללא שם"`,
`"⟳ התצוגה אינה מעודכנת"`. A label, a separator and a shortcut, concatenated. One
attribute holds one `t(key)`, so these need a message *with parts*, which is a new
mechanism rather than a missing tag — and the reason the residue cannot be closed
by sweeping for `[data-i18n]`.

### The shape of the blindness is the lesson

`uilanguage.test.mjs` proves the catalogues hold the same keys in both languages
and that `localise()` sweeps the four attribute kinds it is given. Both true.
Neither says anything about **what the DOM holds**, and the defect lives entirely
in the gap. A catalogue test is a test of the *data*; a language switch is a
property of the *rendering*. I said that gap needed a browser, and it did, and the
browser found on the first run seven keys a hand-written `RESIDUE` list had
missed — which is the argument for measuring rather than listing.

### What ships

`test/browserlang.test.mjs`, twelve assertions against the real window: the toggle
is pressed the way a writer presses it (found by its accessible name *in the old
language*, which is the only way a writer can find it), `dir`/`lang` flip, the
header reads English with a document's own title excluded because a Hebrew
document's title is supposed to be Hebrew, the choice is written down and survives
a reload.

The residue is a **ceiling, not a zero**. A test asserting zero would be red on
arrival, and a red test is a complaint rather than a fence. The direction that
matters is enforced instead — *no catalogue key stands in Hebrew that the file has
not recorded* — and a mutation confirms it fires by name. The recorded set is
allowed to be a superset of what is visible, because which panels are open changes
the visible set and a fence that fails for a reason outside what it watches is a
fence people switch off.

It skips **loudly** where there is no Chromium, naming which of the two it lacked,
rather than failing for a reason that has nothing to do with the application.

### Two fences caught me being lazy

`gate.test.mjs` refused a README note that spelled `npm test` — correctly, since a
second copy of a check command is the drift that fence exists to catch. And the
`Rename: ללא שם` in my header assertion was a false positive: a document's own name
in its own language is correct, and only the verb is this app's text.

Filed as **#71**, with the 31 keys named and the two defects separated, because they
have different sizes: one is a sweep, the other is a mechanism that does not exist
yet.

Editor assertions 7,836 → 7,848, test files 111 → 112.

---

## 2026-09-27 · #71, first slice — the mechanism, and 9 of 50 keys

### Fifty keys with an English entry and no way to be re-localised

The residue was not fifty missing translations. It was fifty strings written into
`aria-label` and `title` at boot, holding keys the catalogue already answers, in
elements nothing had tagged. Three changes to `localise`, each for a shape the
measurement forced:

- **`data-i18n-both`** — `iconBtn` and `glyphBtn` both write `title` *and*
  `aria-label` from one argument, so tagging such a button meant writing the same
  key twice, and at twenty-odd call sites that is twenty-odd chances to write one
  and forget the other. One marker, both attributes.
- **`data-i18n-args`** — for a key whose value is a template. 64 of the strings
  were *composed*: `"פתח · Alt+a"`, `"Rename: ללא שם"`. One attribute holds one
  `t(key)`, so a sentence with a part in it needed something that did not exist.
- **A leading `:` means "this argument is a key".** A chord is a chord in either
  language; the label beside it is `sc.open` and is not. Guessing which is which
  from the catalogue is precisely the trap `hasKey`'s own comment describes, so
  it is spelled in the value instead.
- **Per-attribute arguments**, because the ribbon's button carries *different*
  strings: `title` says `name · shortcut` and `aria-label` says `name` alone,
  since a screen reader has no use for a chord. One shared list would have forced
  the accessible name to gain "· Alt+a".

### One function builds the whole note ribbon

`noteBtn` — a title of `t("sc." + action) + " · " + hint`, passed to `iconBtn`.
One site, thirteen buttons, and the chord is an argument rather than part of the
key. Verified in a real window: `"הערת שוליים · Ctrl+Shift+F"` →
**`"Footnote · Ctrl+Shift+F"`**.

The pane cluster went with it: `splitAcross`, `splitDown`, `zoomPane`/`unzoomPane`
(whose marker is itself a ternary, or the button would re-localise to the state it
was *not* in), `paneMenu`, `closePane`, `scrollLinked`, `previewStaleHow`.

**31 keys → 22. 64 composed → 41.**

### The ceiling could not see its own mechanism, and a mutation said so

With the `:` convention deleted, `tf` receives `":sc.footnote"` untranslated and
produces `":sc.footnote · Ctrl+Shift+F"` — which is **not Hebrew**. The residue
count goes *down*, and the ceiling is satisfied by a window that is worse than
before. A ceiling measures *less bad*; it cannot see *differently* bad.

So the mechanism is asserted directly: after a switch, no attribute value and no
text may be an unsubstituted `{0}` or a `:key`. The same mutation now fails with
`aria-label=":sc.footnote · Ctrl+Shift+F"` named in the message.

### Three of my own errors, each caught by something

- Wrote the new helper in the wrong place and **broke a command** — Typst has no
  forward references — and the only thing that noticed was a container probe.
- Set `data-i18n-both-args` on an element carrying `data-i18n-title`, so the
  marker was inert. Only a DOM dump showed the attributes were missing while the
  isolated unit test passed.
- A codemod matched the **wrong `glyphBtn`**: it produced a duplicate
  `data-i18n-both` on `splitAcross` while aiming at `scrollLinked`. `tsc` caught it
  (`TS1117`), which is the whole argument for a typechecker on a codemod.

And a stale `.tmp-test` bundle made the isolated test report `"{0} · {1}"` as the
translated value, which looked exactly like a mechanism failure.

### What is left, measured

22 catalogue keys: tab and pane furniture, the two view panes' own names, the
nikud toggle, the four search-scope rows, and the ledes — `outlineLede`,
`notesPaneLede`, `marksPaneLede`, `findLede`, `previewFollowsLede`, `welcomeTitle`,
`narrowLede`, `notesPaneEmpty`, `mark.added`. **Every lede is a `panelHead`
sibling**, so the systematic fix is for `panelHead` to tag the panel's lede rather
than twenty panels each doing it.

41 composed, of which about 13 are the file and theme ribbon (`פתח · Alt+a`,
`סגול · Alt+d`, `חטף סגול · Alt+z`) — the same family as `noteBtn`, a different
builder. The rest are legitimate: niqqud letter samples (`אְ אֱ אֲ`), Hebrew
document source in textarea placeholders, and English text *about* Hebrew
("Off by default: in Hebrew the geresh and gershayim"). Those are counted by the
ceiling and should not be chased.

Editor assertions 7,848 → 7,849. Engine untouched.

---

## 2026-09-27 · #71, the rest of the keys — 50 → 2

### The ledes were one missing helper, not five missing attributes

Every drawer's lede was `el("p", { class: "pane-lede" }, [t("someLede")])`. The
head beside it is tagged by `panelHead`; the lede was not. Five were standing in
Hebrew — `outlineLede`, `notesPaneLede`, `marksPaneLede`, `findLede`,
`previewFollowsLede` — and the *class* they all share is not a tag: `localise`
reads attributes, and nothing there had one. So the lede got the helper the head
got (`panelLede`, with `panelHead`'s own contract that the argument is a key), and
`welcomeBody` and `welcomeTitle` came with it.

That is the shape worth keeping: **five attributes versus one helper**, and the
helper is the only version that also stops the sixth drawer doing it wrong.

### A shared class is a naming convention, and `hasKey` is how you check one

`selectRow` takes a `labelKey`, and its options are `[value, label]`. The option
keys are `<labelKey>.<value>` — `searchScope.source` for the `searchScope` row —
and that is a *convention*, not a contract. So the convention is **checked**:
`selectRow` tags an option only when `hasKey(\`${labelKey}.${value}\`)` is true. A
row that does not follow it goes untagged, which is the old behaviour, rather than
being re-localised to a key that means something else. Guessing a key name and
building an attribute from it is the failure mode `hasKey`'s own comment describes,
and a check is the whole difference between a convention and a guess.

The same four `searchScope.*` keys were standing in **two** places — the settings
drawer and the find panel — and one count would not have shown that. Both tagged.

### Two elements that are built by something else

- `head.title = t("swapPaneDrag")` — a **property** assignment on a head built
  earlier. `localise` reads attributes, so the handle also gets
  `setAttribute("data-i18n-title", …)`; a tooltip set after the fact is a tooltip
  that cannot be re-localised.
- `nameMarks({ added: t("mark.added"), … })` — the change-gutter marker is
  **built by CodeMirror**, so it is never handed back to a builder that would know
  to tag it, and by the time the marker existed the key was gone. `nameMarks` now
  takes the keys beside the sentences, and `toDOM` writes both.

### Fifty keys → two

`untitled` and `welcomeTitle` are what is left, and they are the right two:

- **`untitled` is a document's own name.** It reaches the tab, the title bar and
  `<title>`. A document created while the interface was Hebrew is called `ללא שם`,
  and in English it reads `Untitled` — a document named in the language it was
  created in, which is right. Tagging it would **rename a writer's file on a
  language switch**, which is a considerably worse bug than a Hebrew string.
- **`welcomeTitle`** is one untagged `<span>` outside the document editor — a
  second rendering of a string `panelHead` already tags correctly. Not a
  systematic case, and I did not find the site by reading; the browser found it by
  asking which element held the text.

The ceiling in `browserlang.test.mjs` is now `keys: 2, composed: 41`, re-measured
rather than edited by hand, and every recorded key carries why it is still there.

### Two fences caught me being careless, and both were right

- `panelede.test.mjs` asserts `t("marksPaneLede")` appears in `main.ts`. Moving
  the `t()` into a helper **broke a test that was checking the wrong thing** — it
  asks whether the pane says what it lists, not which line renders it. Widened to
  accept either spelling, with the reason written down, rather than reverting the
  helper.
- `readme.test.mjs` refuses a living page that names a shortcut the product does
  not bind. My session log illustrated the point with an invented chord — one this
  product does not bind — written in the backticks the sweep looks for, which is
  the violation reproduced inside the sentence reporting it. Rewritten to say
  that a chord is a chord in either language, which is the same point and survives
  the sweep. The fence is doing exactly what it is for: a plausible sentence about
  chords, in a document that names chords, is a claim about which chords exist —
  including when the sentence is *about* the claim.

### #71: 114 → 43, and the two that must stay

The headline number moved from 114 to 43, and the composition of it matters more
than the total: two catalogue keys (one of which is correct) and 41 composed
strings, of which about thirteen are the file and theme ribbon — the same shape as
`noteBtn`, in a different builder — and the rest are Hebrew that *should* stay
(letter samples in the niqqud bar, Hebrew document source in placeholders, English
text about Hebrew). Chasing the last thirteen is the next piece; the ceiling in the
browser test is what says when it is done.

---

## 2026-09-27 · #71, the niqqud bar — and a misreading worth recording

### I read "פתח · Alt+a" as "Open · Alt+a" and built a plan around it

The residue list had fourteen strings of the shape `<name> · Alt+<letter>`, and I
named them *"the file/theme ribbon"* in the plan and in a comment, and said the next
piece was to find the file and theme builder. `פתח` is **patach**. `קמץ` is
**kamatz**, `סגול` is **segol**, `חולם` is **holam**. They are the fourteen niqqud,
and the builder was `buildNikudBar` — the first place I had already been, where I
had tagged the bar's `aria-label` and its hint and moved on.

The tell was available and I walked past it twice: the strings sat on
`class="nikud-btn"`, and I had *just* edited that file. Reading a Hebrew string and
inferring its English is the exact move this repository keeps refusing to make
programmatically — `hasKey` exists because "the value equals the key" cannot tell a
cognate from a hole — and I made it with my own eyes.

### The table held sentences, which is the same defect twice

`NIKUD` was `[mark, name, chord]` with `name` the **translated** string. So the key
was gone before the button existed, and the bar could say nothing else. That is
`nameMarks` again, in a second file, and the fix is the same shape: the table now
carries a key, and `t(nameKey)` is called at the point of use.

Fourteen keys in each half, and the English is **transliterated** — decided rather
than guessed, because it is a product call and the code cannot answer it. The bar
is a Hebrew learner's instrument, and a learner in an English interface needs the
romanisation they will meet in a grammar book: `patach`, `kamatz`, `segol`, `tsere`,
`hiriq`, `holam`, `kubbutz`, `sheva`, `dagesh`, `shin, right dot`, `shin, left dot`,
`shindot segol`, `shindot patach`, `shindot kamatz`. The mark itself is the glyph
beside the label and stays Hebrew in both; only the *name* changes.

### And specimens are not a missing translation

The count was also charging for `אְ אֱ אֲ` — the `א` with each mark on it, shown
because a learner needs to *see* the mark. A font specimen in its own script is not
a string this application failed to translate, and a ceiling nobody can reach is a
comment. The exclusion is deliberately narrow: one base letter plus marks, nothing
else. `אְ` is a specimen; `הערה` is a sentence somebody has to read.

### 41 → 11 composed, and six of the eleven are right

| | |
|---|---|
| `#let דגש(x) = …`, `בסד = בס"ד` | a Hebrew document's own source, in the placeholders offering a first document |
| "Off by default: in Hebrew the geresh…", "Hebrew numbering (א,ב,ג)", "Keep a one-letter word…" | English sentences *about* Hebrew, correct in English and wrong translated |
| `Rename: ללא שם` | the verb is already English; the name is the document's own |

So the real residue is five: `חלונית 1`/`חלונית 2` (a pane number with no key),
`⟳ התצוגה אינה מעודכנת` (the stale-preview notice), `כתב עברי`, and the status line
that carries **both** languages on purpose — `troubleSaid` emits `"he · en"` so a
writer sees theirs whichever it is, which means an English interface reads it
Hebrew-first. That last one is a decision, not a bug, and it is written down rather
than fixed here.

### The fence caught me committing the violation I had just described

Last round `readme.test.mjs` refused my session log for naming an unbound chord, and
the log entry I wrote *about that* quoted the chord in the backticks the sweep looks
for. A sentence about the violation, containing the violation. It has been rewritten
to describe the chord without naming it, which is the only way to write it down —
and the fence is right for a second reason I had not thought of: it does not care
whether a claim is being made or being reported, and neither should it.

Editor assertions unchanged at 7,849. Engine untouched.

---

## 2026-09-27 · #71, the last five — and a fence that caught the fourth

### Two of the five were the document's own text

`כתב עברי` sits in `DIV.cm-content` and `ברוכים הבאים לכְּתָב` sits inside
`BUTTON.outline-item` in `DIV.outline-list`. The first is the document the writer is
looking at; the second is that document's first heading, listed in the outline. A
Hebrew sefer read in an English interface is still a Hebrew sefer, and a writer types
Hebrew into an English interface **on purpose**. Excluding them is not a
convenience — it is the only correct answer, and the fence now skips anything
inside `.cm-content` or `.outline-list`.

Which also removed `welcomeTitle` from the count without my finding its site: the
span the browser kept reporting was the outline's row, not a second rendering of a
head. The browser had told me the element's parent chain three times and I read it
as a bug instead of as an answer.

### The other two were one-line gaps, and one is a template

- `paneNumbered` is `{0}` — the pane's number in its tooltip — and the span was
  untagged. It is a template, so it wanted the argument list, and the number is a
  bare number in either language, so it is not marked with `:`.
- The stale-preview notice was `"⟳ " + t("previewStale")`, a glyph and a word. A
  glyph is not language-dependent, so `msg.glyphThen` puts it in the template and
  passes it as a literal.

### The new one: an error path, because the registries do not load headless

`registriesFailed` appeared, and the reason it is *here* is that the registries do
not load in a headless run — which is exactly the state it exists for. A writer with
no registry gets a sentence saying so, and in an English interface that sentence was
Hebrew. The issue lists status and error paths among the surfaces a switch has to
reach, and this is the first one that turned out not to be tagged. Recorded rather
than fixed here, because the honest fix belongs with the registries and not with a
language fence.

### And then the prohibition fence caught me writing the mark block by hand

To exclude specimens I wrote `/^[א-ת]{1,3}[marks]*$/` and needed the marks. So I
wrote the range. `prohibitions.test.mjs` has forbidden exactly that since the class
was got wrong three separate times, and its comment says why: **`U+0591–U+05C7` is
not "the marks"**, because four characters in it are punctuation that separates
words — maqaf, paseq, sof pasuq, nun hafukha.

The repository had already solved it and I had read the answer an hour ago:
`markPattern()` in `engine.gen.ts` builds the class from the generated authority with
a **negated lookahead, so there is no range to split**. The fence was not
obstructive; it was pointing at a helper I had quoted from two files above.

And it took three attempts to get right, each an off-by-N in the same direction:

1. `U+0590–U+05AF` — stops one codepoint **before** the niqqud, so all fourteen
   specimens counted.
2. `U+0591–U+05BD` — covers the points and the dagesh, and stops six codepoints
   **short of the shin and sin dots** at U+05C1 and U+05C2, which are two of the
   fourteen marks the bar exists for.
3. `U+0591–U+05C7` — correct, and still hand-written, and therefore still wrong in
   the way the fence means.

Every version of that bound was a hand-split range with a hole in it. Which is the
fence's whole argument, restated by me three times.

### 114 → 9, and the ceiling says what the nine are

Two catalogue keys — `untitled`, which is a document's own name and would rename a
file on a language switch if tagged, and `registriesFailed`, an error path. Seven
composed, all of them Hebrew that should be there: a Hebrew starter's own source in
placeholders, English sentences *about* Hebrew, `Rename: <the document's name>`, and
the status line that carries both languages on purpose.

That last one is the one thing left to argue about rather than fix. `troubleSaid`
emits `"he · en"` so a writer sees theirs whichever language this is, which is a
good rule — and it means an English interface reads it Hebrew-first. A decision, and
it is written down rather than made here.

---

## 2026-09-27 · #15 — the premise, the seam, and the silence

### I mis-described the proposal, and checking it was worth more than the summary

I told the user the glue would "keep all 30 notes in the band on every page", and
asked why we would do that. **They were right to ask, and the answer is that the
issue never proposed it** — it says outright that a flow is a queue and not a
per-page assignment. My phrasing implied repetition and was simply wrong.

But checking before defending turned up something better. The issue measures itself:

> Doc B: **30 entries → 5 pages**; each page's band holds ~7

And the box today, measured here: **30 entries → 4 pages**, 9 per page, lowest ink
787.51 on an 841.89 pt sheet, **nothing clipped, nothing overlapping, nothing off
the page**. So the list under *"why it buys what a box cannot"* — no nine-note cap,
no clip, no overlap, nothing off-paper, spill-is-pagination-for-free — is a list of
properties the thing it would replace **already has**, and in the issue's own
numbers the proposal costs a page.

That does not mean there is no case. A commentary book with a hundred notes might
want a fixed band and a text that keeps filling the page above it, and the current
design cannot give that. But the issue does not show that case, and its numbers
point the other way. It is posted back with the measurement rather than closed on
my say-so.

### The one solid thing in it, and what it actually was

`DocConfig::from_json` clamped every numeric field and **said nothing**. A request
for `margin_top_cm: 21.7` came back laid out at 7 cm, compiled, printed, no
diagnostic: a writer who changed a margin and got the old page back could not tell
that from a setting that does not work.

That is the bug the app already names, one layer up — `settings.ts`: *"a load that
falls back to the defaults is a load that has silently un-chosen everything the
person chose, and it has to be able to say so."* The engine had the same defect and
no sentence, and #15 read it as *"the first compile fell back to default margins"*
and built a compositor around it. **It was a reporting problem, and the compositor
was never the fix.**

So, with the user's agreement:

- **A refusal is recorded and reported.** `clamped` notes what it changed,
  `DocConfig` carries the notes as a `#[serde(skip)]` field, and `compile` turns
  each into a warning naming the field, what was asked for and what is in force. A
  refusal is still **not** an error: the page is the nearest thing the field accepts
  and the document lays out.
- **A margin's limit is the sheet's, not a number chosen in advance.** 7 cm was
  never a limit — A4 is 29.7 cm tall. It is now `sheet − 1 cm`, which is the only
  physical question there is: how much of the page did the writer ask to give away.
  Measured: **21.7 cm now works**; 40 cm on A4 is refused at 28.70 and **says so**;
  a 50 cm sheet admits a 45 cm margin.

The page size has to be read *before* the margins, because a margin bounded by a
sheet the request was never compared against is a bound against a default — and the
first version of this clamped at 7 cm for exactly that reason, which is how the
silent failure survived the fix.

### Three of my own errors, and one that had been hidden all along

- **`ס"מ` inside a format string** closes it. Gershayim — `ס״מ`, U+05F4 — is both
  the correct Hebrew abbreviation and needs no escape.
- **A python write that reported success and did nothing.** Two edits I had
  "applied" and verified by *building* were absent from the file, and I only found
  out because the probe still returned 7.00. Verified by grep from then on.
- **`facts.mjs` counted a struct against a table that does not describe it.** Its
  own comment says it reads the struct "rather than `impl Default`" because
  rustfmt keeps the struct one field per line — and then the first attempt to
  exclude the `#[serde(skip)]` field stripped the *attribute* and left
  `pub refusals: …` to be counted, which is the same 41. It has to be the attribute
  **and** the field it applies to.

The last one is the shape worth remembering: a check written to compare two things
that were once the same, and which a new field made different, is not wrong in its
arithmetic. It is wrong in its question, and it will not say so.

Engine tests 1036 → 1044, binaries 73 → 74. Editor assertions unchanged at 7,849.

---

## 2026-09-28 · #67 — the ecosystem arrived, and then told you the wrong thing

### A decision that had already been made, in writing, for a good reason

The issue is one of the few that says outright that it is not a bug: *"a decision for
Shaul"* — vendor the source, wire offline resolution, or fetch over the network. It
has been sitting here as if it were still open.

It is not. `engine/src/lib.rs` has carried the answer since August, in a doc comment
that names this issue's own import as the reason it exists:

> `#import "@preview/meander:0.4.4"` failed with *file not found* until this existed

`typst-as-lib` offers `with_package_file_resolver` and it wants `ureq` or `reqwest`:
**it downloads.** The comment rejects that twice over — *"a compile that reaches the
network is a compile that can hang, and an editor that is 59ms after a keystroke
cannot have one in the path; and Ksav is meant to work on a plane."* So packages are
bundled in Typst's own `<root>/<ns>/<name>/<version>/` layout, built directly rather
than through `with_file_system_resolver` so that a document cannot reach anything
else on the disk through it.

**Option 2, chosen, with the reasoning attached, and `tests/packages.rs` holding it
in place.** The right thing to do with a decision recorded this well is read it
rather than re-litigate it.

So the remaining gap was not the decision. It was the *sentence*.

### The loader shipped, and left behind the exact wart the issue opened with

`#import "@preview/meander:0.4.4"` today produces:

> **A file (e.g. an image) wasn't found — check the path**

Wrong advice, and specifically wrong: somebody who imported `meander` is sent to hunt
for a missing image. The issue's headline complaint was *"file not found (searched at
typst.toml)"* — **the same misleading message, from the same source.** Building the
loader did not remove the thing the loader was opened for.

And the test that should have caught it asserted `is_err()`. Full stop. A missing
package that reports itself as a missing image, in a diagnostic layer whose entire
purpose is saying the useful thing, was a **passing test.** An error that is correct
and useless is not a passing test.

### Naming it, and the one thing Typst hands you for free

Typst reports the failure with the directory it searched:

```
file not found (searched at …/packages/preview/nothing-here/9.9.9/typst.toml)
```

That path **is** the answer. Three segments after `packages` and a manifest at the
end is a shape, not a wording, so keying on it cannot fire on a missing image and
survives Typst rewording its error. And because the searched path *names* the package
and version, the message can report the spec **as the writer wrote it** —
`@preview/meander:0.4.4` — which is the one string they can go and correct in their
source.

The second half of the sentence matters more than the first. Ksav bundles and never
downloads, deliberately, for the reasons above. So **"not found" must not read as
"try again" or "check your connection"** — it means *this one is not in the box*. The
message therefore lists what **is** in the box, read on the error path only, because
a writer told "`meander` is not here" still has to guess what is, and the answer is
one `read_dir` away.

`bundled_packages` renders specs as `@namespace:name:version` — which is *not* a
Typst spec, and is not pretending to be: it is a list of what is on disk, and the
`@preview:ksavtest:0.1.0` shape cannot be pasted into an import and should not be.

Three tests, all of which fail against the old sentence: the package is named, the
word *image* is **absent**, and a wrong version is reported as a wrong version —
a different sentence with a different fix, since there is no need to add a package
that already exists.

### Two of my own, again

- **An off-by-one in the shape I had just described.** Having written *"three segments
  after `packages` and a `typst.toml` at the end"*, I destructured **three** parts and
  then asked the **third** — the version — whether it ended in `typst.toml`. It never
  did, so `missing_package` returned `None` on every input and the branch was dead.
  The prose was right and the code was the thing I had actually reasoned about.
- **A `let … else` against the wrong type**, twice, on `file_name()` returning
  `OsString` and not `Option`. Guessing an API I had not looked up in the same breath
  as describing it.

The pattern is now familiar enough to be worth naming: I write the *argument* first
and the code second, and the argument is where the care is. When the two disagree the
argument is usually the one that is right — which means the fix is to go read the
type, not to adjust the claim.

Engine tests 1044 → 1047, binaries 74 (72 integration + lib unit + doc-test — and the
README's "74" was right all along; I had recorded a correction that was not needed).
Editor assertions unchanged at 7,849.

---

## 2026-09-28 · #72, #73 — the sandbox nobody wrote down, and the shelf that is empty

### The question I had flagged and never answered, answered by accident

Two questions came back at the end of the #67 work — *"the different blocks thing"* and
*"the ability to take typst libraries"*. While measuring the second I ran the
indentation probe I had flagged much earlier and never got to, and it is worth
recording because the answer is **yes, it works**:

    plain paragraph   x=499.56  w=24.85  right=524.41
    #ציטוט (quote)    x=487.56  w=24.85  right=512.41

Same string, so the 12pt is the inset and nothing else. And it moved the **right**
edge — the reading edge in Hebrew — which is the correct side. A block that indents
from the left under RTL is a real class of bug, and Ksav does not have it.

The first attempt at this probe was `#בלוק(לשון: "משנה", inset: (right: 1cm))`, and
the **typo sweep caught my own invented command** and answered with the legal list.
That is the fence from #5 working on me, unprompted, in a language I invented. Also
learned: the box is `תיבה` and the quote is `ציטוט`, and `#הזחה(2)[…]` is not its
signature.

One loose thread from that probe, **not** claimed as a finding: `#מקור` with the
same text came out at `right=523.69`, barely inside the margin, with a *narrower*
run (21.12 vs 24.85) — so it sets a smaller size, and its inset may be scaled to the
font or may be nearly absent. One data point with a confounded variable is not a
defect. Worth a probe, not worth a claim.

### A sefer cannot read the disk, and that was never a decision anyone made

Four ways a Typst document reaches a file, all measured here:

    #import "helper.typ"   refused
    #import "/etc/hostname" refused
    read("names.txt")      refused
    @preview/ksavtest      works      (#67)

**The document has no file system.** Images and user fonts arrive as bytes on the
request; everything else is `include_bytes!` in the binary.

That was the *right* call, and the reason is in `packages_root()`'s own comment: the
resolver is built directly rather than through `with_file_system_resolver` so that a
document cannot reach anything else on the disk through it. For one pasted snippet, a
total sandbox is correct.

The cost is that **a sefer is one file, forever.** No splitting a 40-chapter sefer,
no shared file for a recurring kuntres used 300 times, no `read()` of a list of
parshiyos, no personal `.typ` of house conventions. For Torah work that ceiling is
higher than the package question, and it had never been written down as a choice.

The proposal is not a new mechanism — it is `packages_root()` **a second time**:
give each sefer a read-only root. Sibling files import by relative path, a `packages/`
subdirectory is `@local` (Typst's own name for this, so nothing is invented), and
confinement survives. Filed as a **decision** rather than a task, because a sefer
stops being a path and becomes a tree, and that has consequences in autosave, in
`engine/src/git.rs`, in the absence of any file-tree UI, and in what happens to the
single-file sefarim that already exist. Not mine to pick. With the cheap half spelled
out too: **`@local` alone**, in the `app_data_dir()` that already holds the
dictionary, answers "can I bring my own library" for most of the value and touches no
editor, no autosave, no git.

### The shelf is empty, and the order matters more than the answer

#70 deferred `meander` and #67 then made it possible. So the blocker is no longer
technical — it is licensing, repository size, and one uncomfortable dependency
question: **page-breaking is the thing a typesetting app most needs to control**, and
delegating it to a package is how a bug becomes unfixable-in-place.

So #73 argues for measuring **#70 first**, and the argument is not caution, it is
that #70 decides whether a third-party threader is addressing our problem or
inheriting it. If Typst's own blocks do not thread cleanly across a page break, a
package built on them inherits that, and we would be importing a workaround for our
own first attempt. Vendoring first and measuring second pays the cost before knowing
the benefit — and #70's own text already says *"report the measurement, then decide."*

**#70 is the next piece of work, and it is one probe.** Two issues filed, both
decisions, neither actioned.

---

## 2026-09-28 · #70 measured — the artifact is not there, and three real things were

### The question was not merely unanswered. It was unanswerable.

#70 asks whether a breakable block draws an **empty border at the foot of page 1**.
To answer that, a probe needs to know where a fill *ends*.

It did not. `Fill` and `Stroke` carried `x` and `y` and no extent, and the reason
that is fatal rather than merely inconvenient is **the direction a box grows in**: a
fill that spans a page break *starts above* the last line of text and *ends below* it.
So the origin is the one property of such a fill that looks entirely correct, and the
empty band — the entire subject of the question — is exactly what the origin cannot
speak about. **An origin is not a shape.** `width`/`height` are now derived from
`Shape::geometry`: `Rect` size, `Line` endpoint difference, `Curve` reported as zero
rather than guessed.

### The result is the opposite of the forwarded claim

    13.9 (above first line) + 169.2 (six lines) + 22.9 (below last line) = 206.0 = the fill height

The background is **re-fitted to each page's own six lines**, not distributed from the
whole block's height. No empty band, no stray border, on any of the four pages. A
breakable block threads correctly across a page break in Typst 0.15.

That removes the strongest reason to vendor `meander` (#73): the argument for measuring
this first was precisely that a threader built on badly-threading blocks would inherit
the problem, and we would be importing a workaround for our own first attempt. They
thread cleanly.

### The control found the actual bug

`breakable: false`, same block, 24 lines: all on one page, `first_y=325.7`,
`last_y=1104.1` — **the sheet is 841.89pt tall.** The block's own fill ends at 530.1.
So about **18 of 24 lines are printed nowhere**, outside their own background, with no
error, no warning, no overflow diagnostic.

Filed as **#74**, and deliberately *not* as a defect Ksav has: `#תיבה` has no
`breakable: false` anywhere, which is exactly why it is worth filing now — **#65**
(berech) and **#43** (top/bottom streams) both *need* atomic blocks by design, and the
failure mode is silent content loss rather than a box that looks wrong. A defect found
before the feature that triggers it is worth much more than one found after.

### Two smaller things, both from the same afternoon

**#75** — Typst 0.15 dropped bare hex colour literals. `#block(fill: #eef3ff)` is
rejected with *"something's off near a #"*, and **the `#` is the one character that was
right**. Ksav's own surface is clean — all 167 `insert` strings use `rgb(...)`, zero
bare hexes — so nobody is handed a broken example; it is a writer's first attempt at
colour that gets confidently wrong advice.

**#76** — and this one is a gap in my own #15 work, four days old. The new clamp bounds
each margin against the sheet and never against *the other margin*, so `margin_cm: 11`
on A4 is accepted: `11 ≤ 28.7` on every edge, and the text area comes back **negative
width** (21.0 − 11 − 11 = −1.0cm). A `width: 100%` block in it laid out 28.3pt wide on
a 595.3pt sheet. It is #15's own sentence arriving by another door — *a load that falls
back to the defaults has silently un-chosen everything the person chose.*

### How the probe went wrong before it went right

`Iterator::max` needs `Ord` and `f64` has only `PartialOrd`, so the first version would
not compile; `probe::PagedDocument` is deliberately unnameable outside its module, so a
test helper would have needed an `unsafe transmute` to a type it cannot spell — spelled
out at each call site instead, with inference doing the work. And the extent came back
as **`w=-28.35`**: a right-to-left `width: 100%` box is emitted by Typst as a rect with
a *negative* `size.x` and the origin already moved to the other edge. An extent is a
magnitude; a negative one is a coordinate that has been asked a question about size.

Then a wrong turn worth recording: I "fixed" the cramped margins to 3cm, and 60 lines
rendered to `y=183.6` — nonsense, and I could not explain it inside a sensible budget.
Rather than keep iterating I reverted to the exact 11cm configuration the #70 numbers
came from, **so the fence and the report on the issue cannot drift apart.** A test that
passes under conditions nobody can reproduce is not a fence, and an unexplicable
measurement is not a measurement.

Engine tests 1047 → 1050, binaries 74 → 75. Clippy clean.

---

## 2026-09-28 · parallel streams already work, and a bug I did not file

### The question, and the answer that made the issue unnecessary

*"Is there a way to have that box without a different background colour, so it is more
like parallel streams?"*

**It already has no background colour.** `#תיבה`'s defaults are

    (מסגרת: 0.75pt + luma(150), מרווח: 12pt, רדיוס: 6pt, רוחב: 100%)

— a border, an inset, a radius and a width, and **no `גוון`**. And `גוון` *is* the fill
key: `_mk_block_knobs` is `("גוון", "קו", "מסגרת", "מרווח", "רדיוס", "רוחב", "יישור")`
and line 1196 is `if "גוון" in c { args.insert("fill", c.גוון) }`. So a `#תיבה` with no
`גוון` is a box with no `fill` argument at all, which is not the same as a box whose
fill was set to nothing — it is a box that never asked.

Measured, `fills` counted from the frame:

    #תיבה[פירוש]                        fills=0  strokes=1   x=424.8
    #תיבה(מסגרת: none)[פירוש]           fills=0  strokes=0   x=424.8
    #תיבה(מסגרת: none, מרווח: 0pt)[פירוש]  fills=0 strokes=0  x=436.8
    פירוש (no box at all)                fills=0  strokes=0   x=436.8

**The last two agree exactly.** A borderless, zero-inset `#תיבה` places its text
**identically to writing no box at all** — so the parallel-stream layout is one global
setting away and needs nothing built:

    #הגדרות_תיבה(מסגרת: none, מרווח: 0pt)

and the whole apparatus reads as a stream beside the source rather than a stack of
coloured cards. It also flows, which is the other half of why streams are the right
shape: a stream has no box to run off the foot of a page.

### A bug I nearly filed, and the reason I nearly filed it

`#אזהרה(גוון: none)` reported `fills=1`, and I read that as *"the tint is still drawn"* —
which is a bug, exactly the bug asked about, in exactly the place it would hurt. It is
not a bug:

    #אזהרה                 fills = ["#fef2f2", "#dc2626"]   tint + accent
    #אזהרה(גוון: none)     fills = ["#dc2626"]               tint gone
    #הצלחה(גוון: none)     fills = ["#16a34a"]               tint gone

The remaining fill is the **accent stripe**, and it is deliberate. I had measured a
count and read it as a background without asking *which* fill.

That is the same failure as #70's `last_text_y`: **a number that answers a different
question than the one being asked, read as though it answered yours.** Twice in one
afternoon, both times about a probe reporting something real that was not the thing
under discussion. The count was never wrong. The question was.

So no issue was filed, which is the correct outcome and would not have been had I
trusted the first reading. `#אזהרה`, `#הצלחה` and `#הערת_צד` all accept `גוון: none`
today, and the tint is the only thing standing between a writer and a stream.

### And the question I was asked twice and did not answer well

*"Why would we ever say not to split?"* — I answered as though #74 were a live hazard,
and the honest answer is **nothing in Ksav does, and the two proposals that might
(#65 berech, #43 top/bottom streams) may not either.** A stream does not need an atomic
block; if anything the wrap work wants the opposite. So #74 is **latent insurance**,
cheap to keep as a known trap and not worth engineering against until something asks
for it. The plan now says so, in those words, rather than dressing it up as a
correctness bug.

---

## 2026-09-28 · "anything, not just notes" — and two of my own corrections

### Columns work. I said they did not, twice, for the same reason.

`#טורים_בלוק(2)` and `#cols(2)` measured **identical** — 35 distinct x-origins, first at
295.2 — and with three columns, 23 origins at 295.2 / 390.8 / … So the page divides
into N columns of arbitrary content, and Ksav's wrapper is byte-identical to Typst's
own.

Before that I reported "nothing changed" and then "everything identical, probably the
sefer machinery". **Both were wrong, and for one reason: columns fill vertically first.**
I handed `#cols(2)` two lines of text, which fit in column 1, so there was nothing to
see. `#grid` *did* split on the same input — A at 459.0, B at 390.5 — because a grid
places by cell rather than by overflow, so it is the one that showed me my probe was
wrong.

That is the **fourth** time in two days that a probe answered faithfully and I read the
wrong thing off it: `last_text_y` that was the notes box, `fills=1` that was the accent
stripe, a `f64: Ord` that would not compile, and now a column that had nothing to
column. The counts were never wrong. **I kept asking the probe a different question from
the one I meant**, and the fix is always the same — work out what the thing *does*
before measuring whether it *works*.

### The user's question, and the real gap

*"This can be infinite, no? Not just for notes, but for anything you want to put inside.
You can break up the page no matter how."*

Mostly **already true**, and it is worth separating two things I had merged:

    divide a page into N columns of arbitrary content      ✅ measured
    content crossing column and page boundaries            ✅ measured
    anything placed BESIDE the source at body size          ✅ measured (#הערת_צד)
    named streams (הערה_זרם, הערות_בסום_צד)                present, unverified by me
    ADDRESSING — send *this* content to *that* stream       ❌ absent

**Typst 0.15 has no `Flow` element.** Every crate in the dependency set checked; the only
`Flow` in the registry is GTK's `flow_box` and a parser's AST node.

And that distinction is the whole answer. A column is a **region you fill in order**,
not an **address you send something to**. Once text is in `cols(2)`, the first thing to
arrive is in the first column. There is no way to say *"this lemma goes beside that
verse"* and have the rest of the page make room.

### The correction that matters, posted to #73

I wrote on #70 that the measurement "removed the strongest reason to vendor `meander`".
**That was too quick.** #70 measured whether a **block** splits across a page boundary
— one block, one boundary. It says nothing about **routing**, which is sending a chosen
piece of content into a chosen channel while everything else reflows around it. I
collapsed two capabilities into one sentence, and #70 only ever spoke to the first.

So the original *note-spill* framing was right that #70 helps — a spilling note is just a
block that breaks, and blocks break cleanly. But **the framing was too narrow, and it
made the case look weaker than it is.** The real capability is: put a lemma, a figure, a
summary, a translation, a proof into a named stream beside the source, and have the page
reflow. For a sefer that is the difference between *notes in a box* and *an apparatus
that is part of the page*.

Caveat stated in the issue rather than glossed: **I cannot verify what `meander` does.**
It is not bundled and I have not read it. Everything above about Ksav and Typst is
measured; the claim that `meander` supplies this routing comes from its description in
#73 and is not verified. Vendoring is also **reversible** — #67's resolver reads a
directory, so removing the directory removes the capability with no code change.

---

## 2026-09-28 · rendered it, looked at it, and the answer is no

### Asking the question by looking instead of by counting

*"…should work for two rows on each page, flowing into that row on the next page, no?"*

I had been answering this with y-coordinates, which is the wrong instrument for a
question about the *shape* of a page. `examples/svgdump.rs` only emits page 1, so it
could not show this at all — the answer lives on page 2. So `examples/render-pages.rs`
now emits every page as SVG, and I converted them with `pdftoppm`/`magick` and **read
the images**.

The document: two 400-line streams, A (`אורייתא`) and B (`פירוש`), in
`#grid(rows: 2, columns: 1, [A], [B])`.

**Page 1:** entirely A.
**Page 2:** A down to line 399, and then **B starts at the bottom of the same page**,
running on into pages 3 and 4.

So it is **one flow**. Cell 1, then cell 2, in reading order, across page boundaries.
`grid(rows: 2)` divides a single stream into two bands; it does not create two streams,
and the second band does not resume in the same band on the next page.

### The distinction, now with a picture behind it

- **works:** `#cols(n)` — divide a page into n bands that **one** flow fills in reading
  order. Measured at 2, 3, 6, 8 and 12, text intact in every case.
- **does not work:** n **independent** flows, each continuing into the same band of the
  next page. That is what was asked for. It is not what a grid or a `cols` does.

And it is not a matter of finding the right Typst incantation. **Typst 0.15 has no
`Flow` element** — every crate in the dependency set checked; the only `Flow` in the
registry is GTK's `flow_box` and a parser's AST node. A column is a *region you fill in
order*; what is wanted is an *address you send content to*, and nothing in the language
has one.

**So this is the concrete case for #73, and it is the first one that is not a guess.** The
earlier arguments were note-spill and "routing", both of which could be dismissed as
speculative. This one is a rendered page saying no. `meander`'s description in #73 —
*page layout with text threading* — is exactly this feature, and it is still unverified
because it is not bundled.

Vendoring it remains reversible: #67's resolver reads a directory, and deleting the
directory removes the capability with no code change. And the measurement is now
reproducible by anyone:

    cargo run --example render-pages -- doc.typ out/ 3

---

## 2026-09-28 · #76 — a gap in my own work, and a wrong report about it

### I measured a path the application does not have

Filed #76 saying `margin_cm: 11` is "accepted silently" on A4. **It is not.** Through
`from_json` it is clamped to 7.0, a refusal is recorded, and a diagnostic is emitted:

    {"margin_cm": 11.0} → margin_cm = 7.0, refusal "margin_cm: 11→7"

The reason is the fifth instance of one habit: **I set `cfg.margin_cm` in Rust**, so
`from_json` — the thing the issue is about — never ran. I built a probe that bypassed
the code under discussion and reported its result as the code's behaviour.

The finding survived; the evidence was mine, not the code's. Corrected on the issue
before touching it, because a defect filed on invented evidence is worse than no issue.

### Two defects, and one of them is a regression of #15

**The pair.** `margin_inner_cm: 20, margin_outer_cm: 20` is 20 ≤ 20 on *each* edge, so
both are accepted with no refusal, and A4 hands back a text region **19cm wider than the
sheet**. Real, and exactly as filed.

**The constant that survived.** `margin_cm` was `0.0..7.0`, commented *"half of the short
side of A5"*. And 7 is the A5 **instance of a rule that is right on every sheet**: a
uniform margin lands on both edges of each axis, so the bound is `2m ≤ short_side − 1`.
That is 6.9cm on A5, **10.0cm on A4**, 14.35 on A3.

So **#15 replaced the hardcoded 7 with the sheet on the per-edge path and left the
constant standing on the uniform path** — the one almost every document takes, since
four absent edges mean "use `margin_cm`". A4 was still refusing a 9cm margin that it
holds comfortably. The generalisation was right and applied to half the settings, and
it *could not* have been fixed in place: the line ran before the page size was read, so
the sheet was not known yet. **A bound that depends on the sheet must be evaluated after
the sheet is known** — which is the entire lesson of #15, learned by breaking it.

Both fixed. `margin_cm: 9` on A4 is now accepted; `margin_cm: 12` is refused to 10.00
and says so.

### The rule for a pair, and the fence that caught me being wrong about it

**A value the writer did not set is never the one moved.** An absent edge is standing in
for `margin_cm`, which is a default, and reducing a default is the app un-choosing on
the writer's behalf — the sentence `settings.ts` already says and #15 exists to fix.
So with one edge set, that edge gives way; with both set, something has to be chosen.

My first choice was **the second edge**, and it was wrong in a way the *pre-existing*
fence caught immediately. `inner 13, outer 0` on a 10.5cm sheet is over by 3.5cm, so
"the second" clamped `outer` to 0 — where it already was — and left `inner` at 13. The
pair was still 4.5cm too wide and the document laid out anyway. **The invariant held for
every case I had invented and failed for the one I had not.**

**The larger margin gives way.** The other edge is then the smaller by construction, so
`allowance − other` is never negative and the pair sums to exactly the allowance. A tie
goes to the second, so the choice is total.

That test also had to change, and its change is the real content: it had been leaving
the opposite edge absent, which meant the 2.5cm default was silently in the way, and it
was **passing a 13cm top margin that had no room to exist**. Now that a pair is checked,
an absent edge is a real margin — so the comparison has to say what is opposite it.

Six new tests, and one of them states the invariant once, over a sheet per case, so a
later change to the rule cannot pass by making the refusal quieter.

Engine tests 1050 → 1055, binaries 75. Editor assertions 7,849 — and the documentation
fence caught the stale count before I looked for it, which is what it is for.

---

## 2026-09-28 · #75 — the `#` was the character that was right

### The message told a correct character it was wrong

Typst 0.15 dropped the bare hex colour literal, so `#eef3ff` fails with *"the character
`#` is not valid in code"*. The translation answered it with the sentence for a missing
space, an unclosed bracket, or a literal hash in prose. The writer has typed the obvious
thing for twenty years and been told they have mistyped it.

**The line had to be consulted, because the raw error cannot tell the two apart.** A
removed colour and a genuine stray `#` produce byte-identical Typst text. So `rephrase`
now takes the offending line and looks for a `#` followed by 3, 4, 6 or 8 hex digits.
A `#` before Hebrew, a space or a bracket is a real syntax error and still gets the real
sentence — which is the half that keeps the fix honest, and the half that would be
easiest to break by accident.

### Two things I got wrong inside the fix

**The helper never fired.** I wrote it as "try 8, then 6, then 4, then 3, give up after
the first fails". For `#eef3ff` the 8-character window is `eef3ff)[`, which is not all
hex digits, so the helper failed on 8, **broke**, and never tried 6. Taken as the
maximal hex run and then checked against the legal lengths, it is right immediately.
The lesson is the one I keep re-learning and should stop re-discovering: *a loop that
gives up on the first attempt is a loop that only ever tests the first case.*

**A false positive that looked like a success.** `#1234zz` has a hex run of 4, so it
matched, and the message said *"write `rgb("#1234")`"* — advice that **cannot work**,
because `rgb("#1234zz")` is not a colour either. The run is a colour only if the token
is *delimited*: nothing alphanumeric or `_` may follow it. With that, `#eef3ff)` and
`#eef3ff\n` match and `#1234zz` and `#eef3ff_x` do not.

### One mistake is one message

`#block(fill: #eef3ff)` produced **two** errors: the real one, and then *"there is a
comma missing between two arguments"* — the parser recovering from the first and
blaming the punctuation around the hole it left. That second one is advice a writer can
act on and cannot fix, and it arrives *after* the sentence that already explains
everything, so it reads as a second problem where there is one.

Suppressed, tested on Typst's **raw** text rather than our translated message (`expected
comma` is the engine's wording and is not translated), and only for a comma on a line
that already reported a colour — so a genuine missing comma on a line that happens to
contain a colour survives.

### Gates

Six tests. Two of them are about what must **not** fire, which is the honest half: a
stray `#` still gets the syntax sentence, a hex run inside a word is not a colour, and a
colour on line 1 is not blamed for an error on line 2 — that last one needed a helper
that filters diagnostics *by line*, because several tests here are about not blaming the
wrong line.

Engine tests 1055 → 1061, binaries 75. Editor assertions 7,849.

---

## 2026-09-28 · #74 — an unsplittable block, reported rather than obeyed

### The failure was always going to be silence

`breakable: false` on a block taller than the text area is a legitimate request that
cannot be granted. The measured result was the worst kind of failure: 24 lines to
`y=1104.1` on an 841.89pt sheet, the block's own fill ending at 530.1, so **about 18
lines rendered below the bottom of the page**, outside their own background, with the
document compiling and nothing reported at all.

**The content still goes off the sheet.** Nothing was changed about the layout,
deliberately: the honest answer to a request that cannot be granted is to say so, and
moving the content silently would be the same defect one layer down — a page that is
not what the writer asked for, arriving without a sentence. So the fix is a sentence.

### The threshold is the page, and that is the whole design

A layout audit wants to compare content against *somewhere*, and the obvious place is
the text area. **That would have been a defect on every document with a running head or
a folio**, because both live in the margins quite legally. Comparing against the
**page** removes the ambiguity entirely: *a folio cannot be below the bottom of the
page*. Off the sheet means off the sheet, and nothing else means that, so no
header/footer bookkeeping is needed and none can rot.

The second question is whether the writer asked for this, because a document with no
`breakable: false` cannot reach the state. So the audit scans the writer's own text —
not the 75KB of prelude in front of it — and an ordinary document pays one pass over
its lines and nothing else. A scan rather than a parse, and the report names the line,
which is the one thing the writer can change.

Measured: 285pt of a block reported as not printed at all, naming line 1. The same
content splittable: silent. An unsplittable block that comfortably fits: silent. A
document with no unsplittable block: no diagnostics at all.

### The fence changed shape, which is what it asked for

`an_unbreakable_oversized_block_overflows_off_the_sheet_silently` asserted only that the
overflow *happened*, and its own comment said to rewrite it when the fix landed —
because it would have kept passing after the audit was added and proved nothing about
it. It now asserts **both** halves: the content still goes off the sheet, *and* the
document says so. And the report is checked **through `compile`**, not by calling the
audit directly, because the hook into the success path is half of what was fixed.

The other two new tests are about what must **not** fire. A warning on every long
block is a warning nobody reads, and an unsplittable block that fits is a legal request
so silence is the correct answer rather than an omission.

Engine tests 1061 → 1063, binaries 75. Editor assertions 7,849.

---

## 2026-09-28 · #77 — the decision was to build it, and it turns out it is built

### "Lets build the possibility. the user should be able to do it if he wants."

So #77 stopped being a question. The shape is now construction, and the measurements
already settled three things about it: Typst 0.15 has no `Flow` element so this is
Ksav's work; `#grid`/`#cols` are one flow filling regions in order so a compositor over
one flow cannot do it; and Ksav already compiles one source into two documents with the
boundary coming for free.

The construction I had in mind: **each stream is laid out as its own document whose page
*is the band*, and the per-stream pages are zipped onto sheets by index.** The appeal is
that the requirement — *a flow continues into the same position on the next page* — is
not something a page-breaking algorithm has to achieve. Stream A laid out alone produces
A/1, A/2, A/3 as ordinary pages; the zip puts A/2 in A's band on sheet 2. Nothing is
threaded, so nothing can mis-thread.

`examples/streams.rs` does it. Three streams, six band-pages, rendered and looked at:
`מקור` exhausted so its band is nearly empty while `פירוש` and `מערה` both continue, in
the bands they held on the previous sheet. The cost is real and printed rather than
assumed: **N streams is N layouts of the same source**, and this is a 59ms editor.

### And then I read Ksav's own prelude instead of only Typst's

```typst
#הגדרות_זרמים(זרמים: ("תוכן", "מקורות"), פריסה: "צד")
```

**`פריסה: "צד"` is side by side, a column per stream**, and the same command carries
`טורים` — a per-stream column count. Measured, two streams of 60 notes each, across
seven pages:

    p1  תוכן x=509.4   מקורות x=263.4
    p2  תוכן x=507.3   מקורות x=261.2
    p3  תוכן x=506.9   מקורות x=260.9
    ...
    p7  תוכן x=506.8   מקורות x=260.8

**Each stream keeps its column on every page and its content flows continuously through
it.** That is #77's requirement, measured and working, in the product today.

### The same mistake, for the seventh time, and the largest one yet

I measured **Typst** — `#grid`, `#cols`, the absence of a `Flow` element — and concluded
"not possible, this is Ksav's work". **I never opened `הגדרות_זרמים`.** The conclusion
was true of Typst and irrelevant to Ksav, and the gap between the two is the entire
product.

#76 I measured a Rust field instead of `from_json`. This time I measured the language
underneath instead of the product above it. Both times the number was right and the
question was mine. **The two failures are the same failure**: reaching for the thing that
is easy to measure instead of the thing the question is about.

### What the build actually is now

Already there: named streams, side-by-side placement, a column per stream, per-stream
column counts, numbering and headings, and each stream holding its band on every page.

Genuinely open, and small: **arbitrary content** in a stream — `הערה_זרם` is a *note*
command, and the original question said *not just notes* — and **where the streams
live**, since the apparatus is the read-only footer and the question is whether a stream
can occupy the page body.

Both are extensions of an existing apparatus with an existing vocabulary. That is the
difference between a feature and a competitor.

The probe stays as evidence and **must not become a second mechanism**: two ways to do
one thing is how a product grows a setting nobody can find. It also caught its own bug —
the first render clipped every band on the right edge, because `probe::layout_plain`
takes no config and laid each stream out at A4 before cropping. The numbers said three
streams of one page each; the picture said the bands were the wrong shape.

---

## 2026-09-28 · #63 — the exponential is real, and the proposed fix would not have helped

### The mechanism, and why the cycle guard does not catch it

A diamond reduced to its simplest form: the same part included twice. `expand_into` only
guards against a name **already open on the stack**, and the first inclusion is pushed
**and popped** before the second is looked at — so the name is not on the stack either
time, and the guard has nothing to say. What is left is `MAX_DEPTH = 8`.

### Two fixtures that measured the wrong thing, faithfully

    depth 8, leaf 20 lines   → 256 lines   (looked like 2^8 = 256 copies)

**That 256 was the cap, not the growth.** `MAX_DEPTH` refuses before the leaf is
reached, so depth 8 never got there. Only when the leaf was given its own name — and
the chain shortened by one — did the real shape appear:

    depth 4 → 16    depth 5 → 32    depth 6 → 64    depth 7 → 128    depth 8 → capped

And the first fixture was worse: it used `p{depth-1}` for the leaf, which the
construction loop then **overwrote with a self-include**, so the cycle guard fired
correctly and the output was 256 marker lines whatever the leaf's size — which is
exactly why depth 8 "looked" like the growth. The numbers were true. The questions were
mine, for the eighth time, and the second one is a new shape of it: **I used the
recursion's own guard as if it were the thing under test.**

### The cost at the ceiling

One 200KB part included 128 times:

    leaf lines      copies   output lines      time
         20           128           2,560        5ms
        200           128          25,600       22ms
      2,000           128         256,000      355ms
     20,000           128       2,560,000    1,532ms
    200,000           128      25,600,000   15,901ms

**Sixteen seconds and twenty-five million lines, from a document that compiled.** No
error, no warning, nothing refused.

### Memoizing would not have fixed it, and that is the finding

The issue proposes *"memoize per name"*, and it is a genuine inefficiency: 128 inclusions
re-walk the part 128 times. But the cost is not 128× *work*, it is 128× **content**, and
the content has to be there — the writer wrote `#כלול("x")` 128 times and the expanded
document is supposed to contain 128 copies. `Expanded::text` is a flat string. Memoizing
the expansion saves the re-walk, roughly a constant factor, and cannot touch it.

**The exponential is real but it is not the hazard. The hazard is that nothing bounds
the total**, and the bound that exists is a proxy that fell out of the recursion rather
than a budget anybody chose. So the fix is a **total-size budget with a diagnostic**, in
the shape `reserve_overflow: "refuse"` already uses.

The remaining question is **policy, and it is a product call**: proportional or total, and
refuse or warn. The engine has both vocabularies — a refusal from #15 is a warning that
lays the document out, `reserve_overflow: "refuse"` stops the compile — and my
recommendation is **a proportional budget that refuses**, because the failure is not a
wrong page but a document that cannot be laid out at all. Posted on the issue rather than
assumed.

And the second half of the issue, `line_of` ambiguity, is **already documented and is not
a defect**: a file and a line is genuinely ambiguous when a chapter is pulled in twice, and
first-in-reading-order is the only honest answer available. The comment says so.

---

## 2026-09-28 · #63 — a budget in two limits, and one lesson I nearly repeated

### What the measurement said, and what the issue proposed

The exponential is real and the cycle guard cannot see it: the guard refuses a name
**already open on the stack**, and the first inclusion is pushed *and popped* before the
second is looked at. So the same part, included twice, expands twice, and a chain of them
doubles at every level. `MAX_DEPTH = 8` bounds it at 2^8 copies — and that bound is a
*proxy that fell out of the recursion*, not a budget anyone chose.

**Memoizing per name was the wrong fix**, and saying so is most of this entry. The cost is
not 128× the *work*, it is 128× the **content**: the writer asked for 128 copies, so the
flat `Expanded::text` has to hold 128 copies. Memoizing saves the re-walk — a constant
factor. What was missing was that nothing bounded the total: one 200KB part included 128
times measured **25.6M lines in 15.9 seconds**, silently.

### Two limits, because they answer different questions

`max_lines_warn` (100,000) **reports and still lays out** — the copies are correct, so the
document is still the one the writer asked for. `max_lines_refuse` (500,000) **stops the
walk at the limit**, measured at exactly 500,000. Past a point there is nothing left to
warn about: 25.6M lines is not a slow page, it is a document that cannot be laid out.

Both are settings, per Shaul's decision, and both go through `clamped` so an out-of-range
value is *reported* like every other number — a cap nobody was told about is a cap that did
not happen. The pair is made coherent: a document asking to be refused earlier than it is
warned about has asked two contradictory things, and the soft limit is the one anybody
reads.

Defaults from the measured table: a chumash is ~30,000 lines and a Vilna Shas ~500,000,
and 500,000 lays out in roughly a third of a second — which is the number that matters for
a 59ms editor.

### Two things I got wrong inside the fix, both caught by looking

**`out.text.lines().count()` in the walk loop is O(n) per line**, which makes the whole
walk O(n²) — a budget that quadrupled its own cost would be a wonderful joke, and the walk
is the thing the budget exists to keep affordable. `origins.len()` is the same number and
is O(1); the `debug_assert_eq!` in `push_line` already says they agree.

**A depth-9 diamond produced ~300 identical "nested too deeply" messages.** Pre-existing,
not mine, and not small: the refusal was pushed once per inclusion path and nothing
deduplicated it. A writer scrolling a list that says the same thing three hundred times
learns nothing and scrolls past the one that mattered. Now each named refusal is said
once, and the test fences the *count*.

### What I did not land, on purpose

The settings-dialog rows for the two numbers. The keys and the type are in and
`enginefacts` is green — that fence is the one that says *"a document falls back to the
engine's defaults, field for field"*, and it caught the new fields immediately, which is
exactly what it is for. But adding the two `numberRow`s and their labels turned
`browserlang`'s residue fence red, and **I would not land a red suite to save a dialog
row.**

Checked before concluding that: on a **clean tree**, with every one of my changes stashed,
`browserlang` fails the same two assertions. So they are pre-existing — `registriesGaveUp`
and `retrySave` stand in Hebrew without being in the recorded `RESIDUE` list, **and both
have English values in the catalogue**, which means something is rendering them Hebrew
rather than that they are legitimate residue. Not diagnosed, and **not added to the list to
make the fence green** — that would be the exact move #71 was closed for.

Engine tests 1063 → 1069, binaries 75, clippy clean. Editor 7,849, all green — the
`browserlang` fence turned out to be a real bug and is fixed below.

---

## 2026-09-28 · #81 — the red fence was right, and I nearly "fixed" it the wrong way

### A red fence I could not paper over

Adding the two settings rows turned `browserlang` red over `registriesGaveUp` and
`retrySave`. The tempting fix is to add both to the test's `RESIDUE` list — and **that is
the exact move #71 was closed for**, because `RESIDUE` is a *reviewed* list of strings
that are legitimately Hebrew, and these two assertions fail precisely because **neither
of them is**: both keys have English values in `i18n.ts`.

So I went looking instead, and the cause is real and simple. `showChromeNotice` resolved
its strings **at call time** and appended the result; nothing re-renders the banner when
the language changes. A notice born in Hebrew stayed Hebrew for as long as the problem
lasted — and a registry failure lasts the session. Same bug in `reportSaveFailure`'s
button.

### The fix that is right, and what it rules out

I applied the pattern `panels.ts` already uses for headings: pass the **key**, set
`data-i18n`, guard with `hasKey` — which exists for exactly this, *"a call site passed the
answer where the question belonged"*. `NoticeAct` grew a `key`; the call sites now pass
`"registriesGaveUp"` and `key: "retrySave"`.

**It did not turn the fence green**, and that is the finding. The attribute is right, so
the sweep must not reach the notice host — the banner is appended outside whatever
subtree `localise()` walks. So the remaining work is the *scope*, and filed as **#81** with
the two options: widen the sweep, or re-run it over notices appended at runtime — which is
the better one, because a notice can be raised *after* a switch too.

### And the fence is a boot-order hostage, which I proved by accident

The suite came back **7,851/0 failed** and then **7,849/2 failed** on identical code, in
alternating runs. The test's own comment explains it: the registries failing to load is a
boot race, so the visible set changes. **Any single run of `browserlang` is not evidence of
whether it is green**, and I was one step from believing a green run and calling it fixed.
That is now in #81 and in the plan, because the next person will otherwise trust a run.

### And the settings rows went in

With the residue keys understood rather than silenced, the two `numberRow`s and their two
labels went in and the suite is where it was: 7,851 assertions, 0 failed.

---

## 2026-09-30 · #81 — the fix works, and it was never the sweep that was missing

### What I went looking for

Three issues in the plan turned out to be decisions rather than tasks — #72, #80,
#73 — and I deferred each with a note on the issue. #81 was next, and it was
marked `[~]`: half committed, one identified gap, *"the attribute is right and the
language sweep does not reach the notice host"*.

So the first thing to do was check that claim rather than build on it.

### The claim is false, and here is the window

Driven in Chromium against `dist/`, at four points during boot and once after a
switch:

```
boot   #notices inside document.body                        true
  0s   data-i18n="registriesFailed"    Hebrew sentence
  2.5s  data-i18n="registriesGaveUp"    Hebrew sentence
       data-i18n="retrySave"            נסה שוב
switch
       data-i18n="registriesGaveUp"    "The command list did not load — the
                                         toolbar and menus will stay empty.
                                         Reload the page."
       data-i18n="retrySave"            "Try again"
```

The sweep reaches the notice host. `noticeHost()` appends to `#app`, `localise()`
defaults to `document`, and `rerenderChrome()` calls it on the toggle. The fix in
`7e14220` is correct and complete.

### So why was the fence red?

Not a boot-order race, which is what the previous entry concluded after the first
conclusion was wrong. `browserlang.test.mjs` serves `dist/`, and:

- `dist/` is git-ignored;
- `gate.mjs`'s `editor` check runs `node test/run.mjs` and **does not build it**;
- the CI app job runs `node tools/gate.mjs editor` and *then* `npx vite build`.

So in CI the file always skips, the gap is invisible, and on a machine with a
local `dist/` the one test in the repository that opens a real window can be
served **any build from the past** and reports on it in the present tense.

Measured: `dist/` was built 2026-09-28 04:42. Commit `7e14220` landed
2026-09-29 13:22. The fence was red about a fix it had never seen.

Two conclusions were recorded on the strength of it — *"the sweep does not reach
the notice host"*, then *"the fence is a boot-order hostage"*. Both are false,
and the second one is worse than the first: it taught the next reader that a
single run is not evidence, which was a true statement with a false reason, and
therefore no reason at all.

### The fence was real after all

Deleting the two `data-i18n` attributes and rebuilding:

```
FAIL no catalogue key stands in Hebrew that this file has not recorded
  got  ["registriesGaveUp","retrySave"]
FAIL the recorded set is a superset of what is standing (3 of 2)
✗ browserlang.test.mjs     11 passed, 2 FAILED      — four runs out of four
```

Unmutated, against a correct build: **13 passed, six runs out of six.** The fence
was never the problem. It was answering correctly about the wrong build.

### The fix, and what it is not

`assertFreshBuild()` compares newest-of-`src/` against newest-of-`dist/` and
**refuses**. Red, with both timestamps and the one command — not a skip, because
the two are different sentences: *"this machine cannot run this test"* is a
complaint about the machine and the file already says so; *"`dist/` is a day old"*
is the test about to report a confident fictional finding. A skip would have been
the same silence with a friendlier sign.

Newest-of-each on both sides, because `vite` writes many chunks and `src/` is
many files. And `src/` against `dist/`, not against `test/`, so fixing a wrong
test does not make the build stale and does not go red for no reason.

Fenced from both ends in `visibility.test.mjs`, next to the acceptance script's
`assertFresh`, which has fenced this exact class for the server binary since it
was written. Four mutations, all caught:

| mutation | caught by |
|---|---|
| guard renamed away | 3 assertions red |
| refusal downgraded to a skip | 1 |
| call moved **after** `await browser()` | 1 |
| fresh path returns `undefined` again | 1 |

Two of those are worth recording rather than counting.

**The fourth was mine, and it is the oldest bug in this file's genre.** The guard
ended with a bare `return` on the fresh path; the call site read the answer as a
boolean, so a *fresh* `dist/` was indistinguishable from a refusal and the file
skipped itself on every run, printing nothing. `run.mjs`'s "asserted nothing"
check is what caught it — that check earning its keep twice — and the fence now
asserts the `true` is there, because a bare `return` is the spelling that
reproduces it.

**The third is a fence I wrote that could not fail.** I asserted the guard ran
before the browser with `indexOf("assertFreshBuild()") < indexOf("await
browser()")`, and it stayed green when I moved the call to *after* `await
browser()` — because `indexOf` found the **declaration**, `function
assertFreshBuild()` at line 120, which is always before anything. A positional
fence written over source finds the first spelling of a name, and a name has two
spellings. This is the same trap twenty lines above in the same file, about a
fixed lookahead matching whatever happens to be nearby, and I walked into it
while adding a fence twenty lines below it. `!assertFreshBuild()` is only ever
written at the call, so it is the call.

### Also fixed, and it was landing red before I started

The documentation fence was **already failing on a clean tree**: `SESSION_LOG.md`
said "7,851 assertions", the backward sweep read it as a claim about today, and
#81 landed with a red suite. Confirmed by stashing everything of mine.

The two honest-looking fixes are both wrong. Rewriting the number destroys the
record; dropping the sentence does too. **The instrument was wrong, not the
log.** `LOGS` exempted `decisions/` and `lamdan/`, both directories whose files
carry a date **in their name**, and `SESSION_LOG.md` is thirty-two days in one
file with the dates in its **headings** — the same lifecycle, held differently,
which the exemption could not express.

So `logDate` learned to read a body: a dated `## …` heading, newest wins. And
`SESSION_LOG.md` joined `LOGS` with the reason stated. Three mutations, all
caught: dropping it from `LOGS` (the exemption stops excusing anything real),
disabling the body branch (it stops being a dated record), and widening the
exemption to `docs/start-here.md` — which fails three ways, including the
pre-existing *"no exemption reaches a page that is documentation"*.

This is the sweep working as designed, one level up: the same check that caught
`decisions/` being extended to reach a living page is what makes adding a record
here cost something. An exemption that buys nothing is refused.

### Three issues deferred, with the measurement attached

Not "no time" — each one is a decision, and each comment says what was measured.

- **#72**, `app_data_dir()` for `@local`. The cheap half is blocked on a seam that
  does not exist: `packages_root()` is the engine's only root and it is hardcoded,
  and the shell's only two references to the engine are `services::find` and
  `(svc.call)(&input)` — **the compile channel is `(name, String)`**, no path, no
  `AppHandle`. So it needs a new process-global in the place this repository has
  deliberately never had one, and whether that root is set by the app at startup or
  arrives on the request is the difference between a feature and the sandbox
  gone. One measured trap recorded either way: `diagnostics::missing_package()`
  recovers `@ns/name:version` by splitting on the literal `"packages/"`, and a
  user root not so named degrades the message back to *"a file (e.g. an image)
  wasn't found"* — the wart #67 closed.
- **#80**, reledmac/reledpar. The forwarded "Bug C" is **already built** —
  `footnote_streams`, `ksav/engine/src/lib.rs:4650`, two registers side by side
  with independent per-stream numbering, fenced to converge. So the residue is
  exactly two features: line numbers (nothing in the prelude) and lemmata
  (`rg -i lemmat` returns one hit, and it is `PLAN.md`). I would do #73 first.
- **#73**, bundling `meander`. Its own precondition is discharged — #70 measured
  that a breakable Typst block threads cleanly — but reading `meander` means
  vendoring it, which is a licence and a permanent weight with a name on it. I
  offered the reversible half: the resolver reads a directory, so removing the
  directory removes the capability with no code change.

### State at log write

| item | state |
|---|---|
| #81 | fixed — `assertFreshBuild()`, fenced from both ends, 4/4 mutations caught |
| pre-existing red | fixed — `SESSION_LOG.md` exempted as a record, 3/3 mutations caught |
| #72, #80, #73 | deferred, with a measured comment on each |
| #82 | not started |

Editor **7,849 → 7,858** across 112 files, all green. Engine untouched (1,069
tests, 75 binaries). `tsc --noEmit` clean.

### Next move

#82 — `Expanded::lines_of`, with `line_of` fenced as its first element.

---

## 2026-09-30 · #82 — the engine half is built, and the product half has no site at all

### What the issue asked for, in two halves

`Expanded::lines_of`, and a second gesture that offers every place a part appears
instead of only the first. The first is a clear task. The second is not, and
finding out why is the substance of this entry.

### `lines_of`, and the invariant made structural

```rust
fn matching<'a>(&'a self, file: Option<&'a str>, line: usize)
    -> impl Iterator<Item = usize> + 'a
```

Both `line_of` and `lines_of` are built from it. The issue asked for "`line_of`
fenced as its first element so the two cannot drift" — and a fence is a promise
that somebody will keep checking. Making them share one predicate **removes the
possibility** rather than watching for it, which is strictly better, and the
fence is still there in `tests/includes.rs` for the reason the house has
recorded about fences that check what the compiler already guarantees: a thing
true by construction today can be true by accident tomorrow, and what is worth
holding is the *sentence* — **first is reading order** — not the identity.

`line_of` stays lazy (`.next()`, not `lines_of(..).into_iter().next()`). It is on
the reveal path, and it is overwhelmingly the first match that answers, so the
lazy form allocates nothing per keystroke. Measured: it has exactly one caller,
`jump.rs:285`.

### Why the product half cannot be built, and it is not a matter of effort

I went looking for the site and it is not there.

- `BodySpot` is `{line, column}` — **`api.ts:670`, no `file` field.**
- `reveal_request` reads `file` off the request (`jump.rs:283`) — and the app
  never sends it, because there is nowhere to send it from.
- So `lines_of` is reached with `file: None`, and a **main-body line maps to
  exactly one expanded line**. The list is always length one.

There is no ambiguity to offer a list of, because the app cannot address a place
inside a part *at all*. The ambiguity #82 describes needs the writer to be
standing in `perek-3` line 2, and the only document the editor holds is the one
in front of it. This is #72's *"the app has no file tree and a part is not an
addressable thing"*, arriving from the other direction.

Left open, deliberately, and the order is written down: **#83, then #72's
decision, then this.**

### #83, found while looking, and it is the worse half

Click a word on the page that came from an included chapter and the caret lands
at that line number **in the parent**. Not ambiguous — simply wrong, and with no
hint that it is wrong.

The engine is right. `jump.rs:262` returns `{line, column, file}`, and
`tests/includes.rs` fences it for diagnostics (`a_mistake_in_a_chapter_is_
reported_at_that_chapters_line`, asserting `file == "פרק ב"` and `line == 2`,
*"not the assembled line 4"*).

The file is lost **at the wire reader**, `api.ts:1126`:

```ts
function readSpot(v: unknown): BodySpot | null {
  const o = v as { line?: unknown; column?: unknown } | null;
  …
  return { line: o.line, column: … };
}
```

So `rg "spot\." src/main.ts` returns `spot?.line` and `spot?.column` and nothing
else — not because `main.ts` ignores the file, but because it was never in `spot`.

Two things make this worse than a plain omission:

**`Located` (`api.ts:704`) declares `file` and is imported nowhere.** `rg
"Located" app/src` returns the declaration and nothing else, so the type that was
written to say the file *is not decoration* is not decoration and not anything —
it is dead.

**`wire.test.mjs` cannot see it.** That fence reads the engine's `json!` literals
and asks whether *an interface declares* each key. `Located` does declare `file`,
so it passes. The failure is a **reader narrowing a response**, and that is the
direction the fence does not run in. A declared key is not a read key, and the
repository has a fence for the first and not the second.

And the fix is already written, ten lines away, for the sibling case.
`diagview.ts:74` does `const fromPart = !!d.file`;
`diagview.ts:100` refuses to underline a chapter's line in the parent (*"would
mark an innocent line"*); `diagview.ts:276` dispatches

```ts
file ? goToPart(file, line, column) : goToLine(line, column)
```

and `onGoToPart` (`main.ts:14847`) **opens the chapter and jumps to the line**.

So the app knows exactly how to get inside a part, uses it for every diagnostic,
and does not use it for the one gesture the setting is named after
(`settings.clickToSource`). #83 also does not wait for #82: the ambiguity needs a
part included **twice**; this happens the first time one is included **once**.

### Fences

`tests/includes.rs`, four tests. The one that matters is
`line_of_is_the_first_of_lines_of_and_they_cannot_drift`, which sweeps every
`(file, line)` in the document and asserts `line_of == lines_of.first()`, plus
the counts the sweep cannot pin — the part is in twice, the main body once each,
four positions for the part's two lines.

`a_document_with_nothing_included_answers_for_the_whole_body` is the one I would
have forgotten: `origins` is empty on the fast path, `line_of` answered `None`
there before `lines_of` existed, and the new method had to agree rather than
invent an answer for a document nothing was included into.

Two of my own errors, both caught before they landed:

- the first `twice()` fixture had a stray `\בין` where a newline belonged, and an
  assertion that every match has length 2 — **false for the main body**, which is
  once each. The sweep would have gone red on the fixture, not on the code, which
  is the worst place for it to go red;
- the invariant test's original shape asserted `all.len() == 2` whenever
  `line_of` answered, which is a claim about the fixture rather than about the
  property. Replaced with *"an answer implies at least one position"* — a list
  shorter than the single answer is the bug this was opened for.

### State at log write

| item | state |
|---|---|
| #82 | engine half done, product half blocked on #83 and #72 — issue left **open** |
| #83 | filed and placed in Phase 3, with the three-step loss and the existing fix |
| #81, #72, #80, #73 | as logged above |

### Mutations

Two, and they are the two distinct properties rather than two spellings of one.

| mutation | caught by |
|---|---|
| `line_of` answers `.last()` | 1 test, and the panic names it: `line_of Some(5) is not lines_of [2, 5]` |
| `lines_of` given its own, broader predicate | **3** tests |

The second is the one worth having. Giving `lines_of` its own predicate is exactly
the drift the shared iterator exists to prevent, and it broke three separate
assertions — `lines_of [4, 7]` where `line_of` said `None`, and `[1, 4, 7]` where
the main body's line 1 was asked for. Three because the property is asserted from
three directions, which is what I wanted and could not have predicted.

### The one place I did not follow the gate, and why

`gate.mjs`'s `engine` check is `cargo test --release` over **all 75 binaries**.
I did not run all 75. Ten targets, chosen to cover what this change can reach:

```
src/lib.rs (249)        ← jump.rs is `line_of`'s only caller, and services.rs
tests/includes.rs (19)  ← the change
tests/assemble.rs (6)   tests/note_layout.rs (12)
tests/assets.rs (13)    tests/pagetext.rs (12)
tests/channels.rs (29)  tests/docfile_oracle.rs (7)
tests/deep_link.rs (6)  tests/entry_address.rs (7)
```

**all green**, and `--lib` is the one that matters most: `line_of` has exactly one
caller and it lives there.

The reason is measured rather than chosen. This machine has 11 GB of RAM and the
default job count runs ~9 concurrent `rustc`, each statically linking the whole of
Typst; at `-j 9` the box fell to **1 GB available under load 27**, and single
binaries sat at 65% CPU for 29 minutes. Dropping to `-j 3` freed 5 GB and took each
to **~90%**. At that rate 75 binaries is roughly 4½ hours of linking for 65 of
them that cannot reach `include.rs`. Ten targets is thorough where it matters and
is not the same claim as all 75, so it is written down rather than rounded up.

Also recorded: `cargo fmt --check` is **already red on a clean tree** under this
machine's rustfmt 1.9.0 — `src/lib.rs` alone has 27 diffs, `include.rs` 6,
`tests/includes.rs` 12. My change adds **zero** new diffs (same 6 and 12 before and
after), so this is a toolchain-version question I cannot answer from here: CI
installs its own rustfmt and I do not know whether it agrees with 1.9.0.

Engine `#[test]` count 1,069 → **1,073** (`engineTests` is counted live off
`#[test]`, so the README moved with it). Editor **7,858**, all green. `tsc` clean.

### Next move

#83. It is the smaller patch and it unblocks #82's product half.

---

## 2026-09-30 · #83 — the file was dropped at the reader, and the fix is a type

### Three steps, and the loss is in the first

1. `engine/src/jump.rs:262` answers `{line, column, file}`. Fenced for diagnostics
   by `a_mistake_in_a_chapter_is_reported_at_that_chapters_line`, which asserts
   `file == "פרק ב"` and `line == 2`, *"not the assembled line 4"*.
2. `readSpot` returned `BodySpot` — `{line, column}` — and `BodySpot` is **the shape
   a request carries**. So the loss is at the *type*: naming a request shape as a
   response type is something neither compiler nor reader can see.
3. `main.ts` therefore had nothing to use. It is not that `jumpFromClick` ignored
   the file; `rg "spot\."` found only `line` and `column` because the file was
   never in `spot`.

### And the fence is a type, not a test

`readSpot` now returns `Located`. That is the whole fence for this class: a
reader that forgets a field **does not type-check**. Proven, not asserted —

```
src/api.ts(1143,3): error TS2741: Property 'file' is missing in type
  '{ line: number; column: number; }' but required in type 'Located'.
```

which is the old bug, spelled out by the compiler.

### One question, one function

`diagview.show` has asked *"did this line come from another document?"* for
diagnostics all along (`const fromPart = !!d.file`, `diagview.ts:74`), and
`diagview.ts:276` has dispatched `file ? goToPart(...) : goToLine(...)`. The click
path did not ask. So the question is now `clickedChapter(file, openTitle)` in
`jump.ts`, and `gotoPart` — extracted from the inline body of the boot wiring —
is the one thing that opens a chapter. Two paths to a chapter, one function.

`gotoPart` answers **nowhere rather than at the top**: `offsetOf` returns `null`
for a line past the end, and the old `?? 0` would have put the caret on line 1 of
the *right* document — the same class of wrong as the bug, one step further from
the truth.

### Fences, and a second fence that could not have failed

- **`services.test.mjs`** — all three transports, three engine answers: a line
  from a chapter, a line of the sefer, and **no answer at all**. The third is why
  the test says what it means: `{}` must not produce `undefined`, because
  `undefined` is a third answer to a two-way question. Plus the declaration
  itself, so a reader that keeps `file` while the *type* still says two keys is
  also caught.
- **`jump.test.mjs`** — the decision, and that `main.ts` calls it.
- **`tsc`** — the field cannot be dropped.

Mutations, five, all caught:

| mutation | caught by |
|---|---|
| reader keeps the type, discards `file` | every transport |
| `jump`'s declared type reverted to `BodySpot` | the declaration check |
| `clickedChapter` ignores the open document | 2 |
| the click branch removed from `main.ts` | 2 |
| the branch hands over raw `file`, not the decision | 1 |

**The last two exist because the first three did not cover `main.ts` at all**, and
that is the second time today a fence of mine passed while guarding nothing (the
first: an `indexOf` that found a function's *declaration*). `clickedChapter` could
have been correct, tested, and never called — which is **exactly what `Located`
was**. So there is now an assertion that `main.ts` names it twice and hands the
answer to `gotoPart`, with comments stripped on `prohibitions.test.mjs`'s rule
(a block comment must begin its own line, because `i18n.ts` holds a `/*` inside a
Hebrew string and a greedy strip deletes three hundred lines).

### One fence caught me, and it was right

`asyncaction.test.mjs` went red on the new `void gotoPart(…)`:

> *every bare `void f(` is accounted for — add src/main.ts:gotoPart to INVENTORY
> above with its reason, or call voidAction(doing, …)*

Both offered answers were wrong: an inventory entry saying "guarded" when it is
not, and `void`. `gotoPart` awaits `enterDoc`, so the promise can reject — and
`jumpFromClick` is an event handler, so a rejection there is an unhandled one.
`action(...)` on the awaited path and `voidAction(...)` on the diagnostic path,
both reported rather than swallowed. `Doing` is a closed union, so `"general"`,
and the reason is written down rather than left to look like a default.

### What I did not fence, and why that is a decision

**`wire.test.mjs` checks that a shape is *declared*. It cannot check that a shape is
*read*.** Measured across every seam row: **five** more wire interfaces are
declared and named nowhere outside their own declaration — `ClipboardSource`,
`Linkified`, `RefreshResult`, `Revealed`, `ServiceRow`.

So a blanket "a declared wire shape must be named somewhere" rule would be red on
five innocent ones, and I did not add it. All five are single-field or flat shapes
read structurally (`readPoints` returns `PagePoint[]`, not `Revealed`), so the rule
would be *wrong*, not merely noisy. `Located` was the only shape where a reader
returned a **different interface**, and that is now a compile error — which is the
honest fence for it.

### State at log write

Editor **7,858 → 7,878** across 112 files, 0 failed. `tsc` clean. Engine
untouched — this was a client-side fix and the engine was already right, which is
the finding: `jump.rs` has been sending the file correctly all along.

### Next move

#82's product half, now that #83 made a place inside a part addressable at all.

---

## 2026-09-30 · #60 — the loss was a `?`, and base64 has four spellings

### The line

```rust
let bytes = decode_payload(data)?;      // in a fn returning Option<Asset>
if name.is_empty() || bytes.is_empty() { return None; }
```

One `?` on an `Option`, and both failures were **silent**. A payload in any spelling this build did not accept, or one corrupted byte in a megabyte, produced *nothing*: the asset did not exist, the writer's sefer lost an image, and no diagnostic, status line or anything else said a word.

`Refused` was already there — a named entry per refused asset, surfaced as warnings through `lib.rs:3313` — and the unreadable case never used it.

### Four, not one, and the order is an argument

`decode_payload` took `STANDARD`. That is **one of four** ways to write the same bytes: `-`/`_` instead of `+`/`/`, and padding present or absent. A decoder that accepts one and refuses three is not being strict, it is picking one and calling it correct.

All four are now tried, and the ordering is not "whichever succeeds":

- the two **alphabets are disjoint** — `-` and `_` are illegal in `STANDARD`, `+` and `/` illegal in `URL_SAFE` — so a payload can only decode under the one it was written in. Nothing is ranked.
- the **padding pair is not** disjoint: the same string without its `=` decodes identically under `*_NO_PAD`. Trying padded first costs one extra attempt and never changes the answer.

So `STANDARD`, `URL_SAFE`, `STANDARD_NO_PAD`, `URL_SAFE_NO_PAD`.

### Fenced end to end, and the encodings are done by hand

`spelled(alphabet, pad)` writes base64 out itself, and the reason is the comment on it: **a helper that encodes with the crate agrees with the crate's own idea of what is valid**, which is the thing under test. It is also why the fixture is the 1×1 PNG already in this file rather than a round trip through `png().bytes`.

Four tests:

- all four spellings must yield **four identical byte strings** — four encodings of one image must not be four different images;
- **one corrupted byte** in a perfect payload must produce a **warning naming the asset**;
- an asset with a name and **no bytes** is reported separately, because *"unreadable"* and *"empty"* are not the same thing to go and fix;
- **a document with one unreadable image still renders.** That last one is what rules out the tempting wrong fix: a refusal that failed the compile would be a different bug, and #60 is not it.

The pre-existing `assets_are_read_from_a_request_with_or_without_a_data_url_prefix` test asserted `(assets, _)` — **the shape a test has when the second value is not asserted because there was nothing to assert.** Both of its drops went into a `Refused` nobody read. It now holds both sentences, and says what that `_` was.

### Also found, while in there

`name.is_empty()` in that condition was **unreachable**: `diagnose_name` refuses an empty name eight lines earlier, with the better sentence — *"an asset needs a name"*. So the condition had a branch that could not fire. Removed, and the removal is written down rather than left as a silent simplification.

### Why the whole condition is now two sentences

Undecodable bytes and empty bytes are two different mistakes — a broken transfer or a wrong paste, versus a client that sent a name and no content — and one sentence covering both would send a writer to the wrong place. Neither is worth refusing a compile over, which is why this **reports and continues**, exactly as a refused *name* does.

### Also filed: #84, the indent idea — and the argument I made that was wrong

Shaul's proposal, measured against the tree before it was written down — and the finding is that **nesting is already understood and simply not shown**. `spans.ts:scan()` produces `frames` outermost-first, `mode.ts:enclosing` and `structure.ts:structureAt` both read it, and `MAX_LEVEL = 9` already argues the case for a ceiling. So it is a view over existing state rather than new parsing, and `#הגדרות_כותרות`'s `הזחה`/`הזחה_מרבית` is already the step-and-a-cap shape this asks for.

Placed in Phase 5 per the routing rule, with the broader "put IDE features in" half as a second list ordered by what a *Hebrew* sefer writer loses. **Hover scope preview is the top of it, and it is deliberately not a tab bar** — a forty-tab apparatus is worse than one status line answering *"which `#הערה[` am I inside?"*, which `framesAt` can already answer.

### #84, and the three readings I got wrong before the fourth

This one is worth the space because **I got it wrong three times and each time I was
confident**, which is the actual finding.

**1. It is not a guide.** I filed margin rules and argued the source should not be
touched, on the grounds that Typst has no indentation semantics so indenting "lies
about the language". He said: *"of course it is the source doc that would be
indented — it is to make writing easier, no?"* He was right, and my reasoning was
the wrong *shape* — optimising for a failure I could imagine instead of asking what
the feature is for. Reading is not the hard part; knowing where to type next is.

**2. "Percent used" is not a share of levels.** I had relabelled it "depth" and
reached for `MAX_LEVEL = 9` as its precedent. He meant *"nothing should indent more
than 50 percent of the page"* — a share of the **width**. That is a strictly better
rule: it self-adjusts (a narrow pane indents less deep, a wide one more) and there
is **no maximum depth to argue about**, because the width runs out before the depth
does. I had taken the nearest constant in the tree for the idea behind the dial.

**3. It never writes the file.** *"all this is just in source — I proposed no change
in actual file."* I had read "indented source" as *rewriting your file*, and then
spent three paragraphs on idempotence, one-undo-step, caret mapping and `git` noise.
None of it applies to a view.

**And the `#כלול` question was an artefact of reading 3 wrong.** I had asked whether
a chapter's indentation should follow it in and out of a note, and written a careful
recommendation against matching. That question only exists if indenting *writes
files*. It does not — each document is shown on its own, from its own first line, at
zero, always. **I invented a problem this design does not have, and it was three
paragraphs long.**

That is the fourth time in this session that the *instrument* was wrong rather than
the thing measured, after #81's stale `dist/`, #82's unreachable product half, and
`wire.test.mjs` checking declarations rather than reads. The common shape: I found a
nearby thing that shared a name, and answered from it.

### The family, asked for afterwards: *"you see what I mean by IDE features?"*

I did not, and the answer is one line long. **#84 is not the same kind of thing as the
features I had been listing.** It is *presentation* — it re-lays-out your text in front of
you and never touches the document — so **"no change to the real file" is not a caveat on
that feature, it is the definition of the family.**

Hover info, diagnostics and navigation are **analysis**: they tell you something *about*
the text. Real, useful, and a different tool — and it is what I kept answering with when
the question was about this.

The test for belonging is one sentence: **does this re-present the source without changing
it?** And the sharper test for whether an idea is in the family at all is **if it needs a
new scan, it probably isn't.** Every sibling below is a `Decoration` over `scan()`, which
is already paid for on every keystroke by `modeAt`, `legalAt`, `insertionAt` and the
outline — and that is `ruler.ts`'s stated design (*"Nothing here computes a mark; the
producers are unchanged and none of them knows this file exists"*), which is why it could
be added at all.

| | what it does | why it is nearly free |
|---|---|---|
| **dim outside the innermost tag** | the answer to *"which `#הערה[` am I inside?"* with **no hover** | `focus.ts` already dims outside the *paragraph*; one function over `framesAt` |
| **click a bracket, select the tag** | the **reverse** of #84 — legible vs *grabbable* | `bracketMatching` is wired; `Frame` carries `open` and `close` |
| **tag length in the placeholder** | `#הערה[… 480 אותיות]` — is folding worth it? | `close − open`, and `close` is already `text.length` when unclosed |
| **whitespace rendering** | after #84 indentation *is* whitespace | `highlightSpecialChars` already imported, already used for bidi marks |
| **a minimap** | **which I wrongly skipped first time** — the ruler answers *where*, this answers *how much*, and it is the only thing showing a chapter went 3 pages to 40 | CodeMirror's own |

### All five approved, split into their own issues — and the reason #4 moved up the list

#85 dim outside the innermost tag · #86 click a bracket to select the tag · #87 length in
the fold placeholder · #88 show whitespace · #89 a minimap. One per session, which is this
repository's rule, and each a different piece of work with a different risk.

**Then #88 stopped being the odd one out**, and I had it in the wrong place on the list for
a reason I did not think to check. Going to explain #4, I read `main.ts` for what
whitespace *means* here rather than what it looks like, and:

> *"Typst turns a newline into a **space** and a blank line into a **paragraph break**, so
> the writer who breaks a long line for the sake of reading the source pays for it on the
> page."* — `main.ts:5910`

So `first⏎second` prints `first second`. A blank line prints two paragraphs. Runs of
spaces collapse. **Three different things produce different pages and none of them is
visible** — no trailing space before a `]` is seeable, no way to see two spaces where one
was meant.

Two consequences I had not connected before:

- **It is why #84's "paragraph breaks share an indent level" is a rule and not a nicety.** A
  blank line in a note is a *typographic event*, so the indent view is showing blank lines
  that mean something different from the line breaks around them. Any view that treats a
  blank line as just an empty line is wrong.
- **It is the one place where "it is only a view" is doing real work** rather than
  expressing a taste. A line break inside a tag's body *prints as a space*, so if the view
  ever stopped being a view, indenting a note would insert spaces into the output.

And **bidi marks are already a solved instance of #88** — `bidi.ts:467` renders them with
`highlightSpecialChars`, which `main.ts:2` already imports. An invisible character that
changes meaning, solved by rendering the character rather than guessing at it, and scoped
(`ksav-bidi-mark`) so it is not on permanently. That is the working answer for the hardest
case, sitting in the tree.

### Two of them he could not follow — and both were my prose, not his question

He read the list and answered **1 yes · 2 yes (way to turn on and off) · 3 yes · 4 "i dont
get it, but sure" · 5 yes**, and then came back with **"i dont get q on 86. i definitely
dont get q on 89. use ppl words"**.

That is the sharpest possible criticism of both issues and it is the fifth time today, and
the pattern is now unmistakable: **I write in the vocabulary of the mechanism rather than
the vocabulary of the person using it.** `#כלול` was "spliced text"; the indent view was
"margin guides"; and #86's question was *"a selection crossing a tag's own brackets will not
compile"* — which is a sentence about the compiler, to answer a question about a person
wanting to move a note.

So both were rewritten in concrete Hebrew. #86: *you have written
`בסד גמור#הערה[זה הטקסט של ההערה] ועוד משהו`; you click the `[`; does the **words** go
blue or does the **whole note** go blue?** #89: *a minimap is a tiny picture of your whole
document down the side, like a scrollbar that shows your text.*

And **asking him to explain it changed both answers**, which is the part worth keeping:

- **#86 became three ways in rather than one.** A setting for what a bare click means,
  **`Alt`+click for the other**, and two keys. I had treated the body-vs-whole question as
  *the* question when it was one of two axes. And Alt was checked rather than assumed —
  `main.ts:10810` and `:14235` already let modified keys through deliberately (*"Mod-S while
  a hydra is up should still save"*), and **Shift was the wrong pick** because
  `Shift`+click already selects a range in the preview.
- **#89 became something you open**, which removed my width objection entirely — a panel
  that costs nothing when unwanted answers that better than defending a permanent strip. And
  the RTL question I had worried about **needs no work at all**: `main.ts:678` puts
  `docConfig().dir` on the editor and `bidi.ts` resolves **per line**, so a minimap that
  inherits from the editor gets both directions free. My worry was about the wrong layer.

The permanent fence that survived both: `visibility.test.mjs` runs `planFor(PANELS)` and
`tools/surfaces.mjs:36` has **deliberately no default** — *"An unclassified panel throws with
its own name in the message rather than falling back to the cheapest probe, because a
fallback is the silent skip one level up."* A minimap panel must declare the gesture that
opens it.

Checked before listing, so it is not a fifth guess: present and working are
`drawSelection`, `highlightActiveLine`, folding and `foldGutter`, `bracketMatching`, the
highlighter, the ruler, bidi marks, six lints, the change gutter and focus dimming.
**Absent**: whitespace rendering, a minimap, structural selection, any enclosing-chain
view. And **line numbers stay absent on purpose** — in a sefer the address is the
*siman*, which `numbering.ts` maintains; a line number is a code-editor tic and the
gutters are already hidden in page mode.

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

---

## 2026-09-25 · #51 a document that runs code says so (closed)

### The measurement that changed the fix

The report says a shared `.ksav` "ships arbitrary `#let`/loop/package code that
runs on open/compile with no prompt or diagnostic". Two facts in the engine bound
that before I wrote a line of the fix:

- **No network, no disk outside `packages/`.** `typst-as-lib` offers a resolver
  that *downloads*; this one declines it and builds a resolver whose root **is**
  the bundled package directory. `lib.rs` on `packages_root`: *"a document cannot
  reach anything else on the disk through it."*
- **A bounded run.** `server.rs` compiles on its own thread; the pool thread only
  *waits*, with a timeout.

So the honest sentence is the small one — *the document runs the commands it
carries, they can change what the page says, and here they are* — and I pinned the
wording against five overclaims (`arbitrary`, `malicious`, `untrusted`, `attack`,
`exploit`) because "improving" a warning into a scary one is the likely next edit
and it would be wrong in both directions.

### Which clients were actually silent: three different answers

| Client | Before | Now |
|---|---|---|
| browser | **not silent** — the palette lists the document's commands, chipped `fromDocument` | unchanged; `commands.test.mjs` already fences it |
| CLI | silent | one `warning:` line naming them |
| Emacs | silent | one `message`, once per open |

The browser was the informative measurement. `available()` already carries
`from: "document"` and `i18n.ts` has `fromDocument`. What it does *not* do is show
the preamble's **text** — the names, not the code. That is a UI decision rather
than a defect, so it is written up on the issue, not decided here.

### The two halves

`DocFile::advisories()` is one list holding both kinds: the missing-asset warning
that predated it, and the new one. `main.rs` used to format the first itself, and a
second formatter is a second wording.

In Emacs, `ksav--announce-preamble` fires from `ksav--unwrap` — the single door
where a file's container is adopted.

### Two traps in the Emacs half, both recorded in the code

**The first name-scanning regex matched nothing, and the suite was green.**
`\\(?:#\\)?let[ \t]+\\([^ \t\n()\[\]{};,]+\\)` — bisected in a file rather than
through shell-escaped `--eval`, the culprit is Emacs's regex reader taking `}` in
a bracket expression as the start of an interval, so adding `{` to a negated class
made the whole pattern match no preamble at all. `[[:alnum:]_]` is the fix and the
better class anyway: an identifier is a run of word characters, and a negated
class has to escape brackets, braces and commas to say the same thing.

**`with-message-to-string` does not exist** — the name sounds right. And
`message-function` is read by the interactive `message` *command*, not the
function, so binding it captures nothing and the test passes for the wrong reason.
The capture is `cl-letf` over `message`, and the docstring on `ksav--say` says why
both of the others are wrong.

### Fences, each shown to do its job

| Where | Mutation | Result |
|---|---|---|
| `docfile.rs` | the advisory suppressed | three tests red |
| CLI | a `.ksav` carrying a preamble | `warning: … defines its own commands and they are compiled with it: …` — it names both, `דגש, mine`, and their size, two of them over two lines |
| CLI | a plain `.ksav` | nothing; the compile line otherwise identical |
| `ksav.el` | the announcement suppressed | `ksav-the-announcement-names-the-commands-and-their-size` red |

The negative half is asserted as firmly as the positive one in both languages: most
`.ksav` files are plain text, and an announcement on every open is one nobody
reads.

Engine tests 1001 → 1006. Editor assertions 7,638 → 7,639. Emacs 60 → 63. Next in
Phase 2: **#53**, the engine's SVG `innerHTML` and attribute passthrough.

---

## 2026-09-25 · #53 engine SVG innerHTML (closed)

### Measured first, and the measurement changed the verdict

Built the hostile file the issue describes — a `.ksav` carrying an SVG asset with
`<script>`, `onload` and a `foreignObject` — and compiled it:

```
warning: hostile.ksav:3:1: image contains foreign object
<image xlink:href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0i…" width="30" …/>
grep -c script  hostile.page-1.svg  →  0
```

Typst does **not** inline an SVG image; it base64-encodes it into an `href`. And
it escapes text, so a document whose body is `<script>alert(1)</script>` is text.
So both obvious payload routes were already closed, and the finding that survives
is the **absence of a fence** — a path safe today because of an upstream encoder
is one Typst version from not being, and nothing here would notice.

The number that replaces the argument: `alarming: []` over the whole corpus.

### The allow-list is generated, and the reason is one name

`emit-svg-vocabulary.rs` compiles every template plus two documents for shapes
they do not reach, scans every page, and writes `svg-vocabulary.json`;
`emit-svg-vocabulary.mjs` turns it into `svg-vocabulary.gen.ts`. Ten elements,
twenty-two attributes.

And there is a name in that list nobody would have written down: **`<a>`** — Typst
emits an `<a>` with a transparent `<rect>` and no `href` for a link's hit area. A
list written by reading the markup drops **every link in every document**, silently,
and no test in this repository renders a document and asserts anything about links.

The **denied** list is not generated: refusing a name is a judgement, and
`svg_output.rs` asserts the two never disagree about a name the engine actually
emits — the only disagreement with a consequence.

### Three bugs the tests found

1. **Dropping a tag is not dropping the thing.** Dropping `<style>` and passing the
   body through emitted `*{background:url(javascript:…)}` as text. The
   hostile-input list caught it because the string still said `javascript:`. A
   filter that removes a tag and keeps what was between them has reclassified it,
   and "inert text" is a claim about a consumer nobody has checked.
2. **A denied *self-closing* element spun the scanner for ever.**
   `<animate attributeName="href" values="javascript:1"/>` — the branches that
   handle a refused element advanced `i` only when it had content to skip. A
   **crash**; the process dumped core. The two shapes that hang are the two no
   engine output has ever contained.
3. **The measurement itself was wrong first.** Its attribute reader split a tag
   body on whitespace, so every path segment in every `d="M3.15 3.6…"` became an
   attribute name — 30,000 names that were numbers. A measurement that does that
   is worse than none, because it looks like a vocabulary.

### `DOMParser` was the first shape, and the harness decided it

Parse with `DOMParser` and build with `createElementNS` is structurally the best
answer: a name not on the list is never created. It is also untestable here —
`test/harness.mjs` says a `document` on `globalThis` is enough to convince
`@codemirror/view` it is in a browser, so it installs none, and a fence needing a
real DOM is a fence that gets skipped wherever it is inconvenient.

The same constraint answered the wiring. My first attempt built the page panes with
`document.createElement` and **three suites went red with `ReferenceError: document
is not defined`** — the harness's own comment refusing exactly that. The fake
host's `innerHTML` setter parses `<div class="page">` runs because that is the
shape `drawPages` emitted before; the wrapper is our markup and the string inside
it has been through the filter, so composing through the host is both supported
and safe.

### A prohibition, with three claims rather than three skips

`prohibitions.test.mjs` forbids engine SVG reaching `innerHTML` (`= ""` is allowed
— that is a pane being emptied). The three exempt files are claims the harness
checks are *still* true of each: `svgsafe.ts` is the allow-list; `preview.ts`
composes a wrapper around a filtered page; `ksav-lang.ts` is a CodeMirror widget
rendering the **application's own** table markup, and it is listed because it is
the *other* `innerHTML` in `src/`.

### Fences, each shown to do its job

| Where | Mutation | Result |
|---|---|---|
| `svgsafe.ts` | a `<style>` body | the body leaked as text; the test said `javascript:` |
| `svgsafe.ts` | a denied self-closing element | the scanner hung and the process died |
| `preview.ts` | back to `node.innerHTML = …` | the prohibition went red on `preview.ts` |
| the fixture | `<a>` removed | the generator refuses; `svg_output.rs` goes red |
| `skips.test.mjs` | — | rejected the staleness test for no floor; it now asserts ≥14 pages came back |

`skips.test.mjs` has made that same complaint four times today and has been right
every time: a walk that stopped finding pages would measure an empty vocabulary,
write it, and leave everything else green over a measurement of nothing.

Engine tests 1006 → 1009, binaries 69 → 70, editor assertions 7,639 → 7,775 across
109 files. Next in Phase 2: **#52**, asset names unvalidated and `ksav.typ`
shadowing the prelude.

---

## 2026-09-26 · #52 asset names (closed) — and Phase 2 complete

### The issue's impact is wrong, and the real one is worse

`#52` said a `.ksav` with an asset named `ksav.typ` "replaces or confuses the
trusted prelude". Measured, the shadowing is **closed by resolver order** —
`with_static_source_file_resolver([prelude_source()])` comes *before*
`with_static_file_resolver(files)`, so the prelude is consulted first, the
attacker's `#let`s never bind, and `#attack` is reported as unknown. `ksav.TYP` is
inert too: `VirtualPath` is case-sensitive.

The rule is kept anyway, for the honest reason: a name the resolver will never
reach is a name that should not be accepted, and the chain is a two-line change
and a plausible one. `ksav.TYP` is deliberately **not** a rule — a rule I cannot
justify trains people to skip the list.

### What nobody had looked at

I walked a list of hostile names through `compile_with`. Two **killed the
process**:

```
panicked at typst-as-lib-0.16.0/src/conversions.rs:23:44:
valid virtual path: Escapes      ← ".."
valid virtual path: Backslash    ← "C:\"
```

`.expect()` on a `VirtualPath`, and **no `catch_unwind` in this crate or in
`server.rs`**. So one unauthenticated request to `ksav serve` with an asset named
`../x.png` takes the worker thread down. That is a denial of service, not a
compromise — and it is why `diagnose_name` is a gate rather than a check.

### Two gates, and the tests are split to say so

- **the reader's**, so a *writer is told* — and before the payload is decoded, so
  a multi-megabyte blob for a refused name is never decoded to find out.
- **`compile_with`'s**, which is `pub` and is what makes the panic unreachable.

Mutation-tested independently: removing the `compile_with` filter brings the
panic back; removing the reader gate leaves the no-panic test green and turns the
two "a refusal is announced" tests red. Either can be deleted without the other
noticing, which is what a single test would have hidden.

### A refusal is not a missing asset

The existing `Vec<String>` means *"a hash this engine does not hold — send the
bytes again"*, and the client's answer is to re-send. A refusal reported there
would **loop for ever**, so it is a different type rendering as a **warning**
diagnostic. On the `.ksav` path it rides on `advisories()` beside the other two,
because a refused name and a missing one look identical to a writer — an image
that is not on the page — and only one is fixable by sending the file again.

`read_list`/`read_one` were a second reader with the same hole in both; they are
**removed** rather than fixed, so `from_json` goes through the cached reader with
a throwaway `missing`.

### The half a threat-model rule always loses

Eleven ordinary names must survive, and they are in a test: `sub/dir/photo.jpeg`,
`a..b.png`, `my logo.png`, `שם-בעברית.png`, `..hidden.png`. So `..` is checked as
a **segment**, not a substring — `a..b.png` is a legal file name, and a gate that
refuses it is a gate somebody deletes.

### A test bug of my own

`with_asset` took a `&str` into a `json!` array, so it produced an array of
**strings**; the reader finds no object and reads it as nothing, so the test was
asserting an empty list for a reason unrelated to the name it was about. The
helper takes a `serde_json::Value` now, and its docstring says why.

### Phase 2 complete

#50 (chapter name into Typst), #51 (a document that runs code says so), #53 (the
engine's SVG through a measured allow-list), #52 (asset names). Next is Phase 3,
correctness highs, starting with **#2** — note-layout hazards, marked Critical.

Engine tests 1009 → 1019, binaries 70 → 71, editor assertions 7,775 → 7,776.
Emacs 63.

### The two clarifying comments asked for, filed under #64 and #68

- **#64** gained the two things its body did not say: that the ordering key is a
  title that is **set** rather than a header that happens to be there (with the
  case that settles it — a commentary keyed to *"where Rashi and the Tosafot
  differ"* has no header to derive from, so a model that only reads headers cannot
  order it at all), and that the sort needs a **footnote-interweave toggle**: a
  unit of B carrying its own notes, anchored inside a footnote of the base text,
  either interleaves with the base's footnote flow or appends to the end, and those
  are two documents rather than a formatting preference.
- The comment also asks the question that decides how big that toggle is:
  interleaving either **reserves a sequence** for the commentary's notes or
  **renumbers the base text's own footnotes**, and the first re-numbers notes the
  writer has already seen numbered.
- **#68** (the companion that mirrors A's structure into the sorted result) gained
  the parts that reach its own resolving test — and one consequence specific to it:
  if the title used for matching is *not* displayed, a transferred heading must not
  be promoted to a title, or a second sort would read the heading it injected as the
  anchor and re-order against it.

Recorded in the SESSION_LOG so there is a trail in the repository, and in the
issues themselves where the work will be picked up.

---

## 2026-09-27 · #2 note-layout hazards — six of seven were already fixed, and the fence is the deliverable

### The audit is a month old and the code moved

`#2` tracks seven hazards from the 2026-08-23 audit (B1–B5, B10, B11), each
`[render-verified]` or `[code-verified]` with a line number. I checked all seven
before touching anything, and **six no longer reproduce**:

| | finding | measured 2026-09-27 |
|---|---|---|
| B1 | `ערוץ:`+`אזור:` filed under one key, filtered under another | note drawn at y=712.5 — does not reproduce |
| B2 | the reserve scanner was blind to the `אזור:` spelling | reserve 3.25cm, ink 712.5, page number 799.02 on an 841.89pt sheet — does not reproduce |
| B3 | two side apparatuses interleaved at 4–9pt | fixture `12-two-regions-side`: first note's last line 137.75, second's first 151.13 — a full 13.38pt pitch apart, **stacked, not interleaved** |
| B4 | a channel-declared height bypassed the clamp | `_ch_region_height` routes it through `_ap_fit_room` now |
| B5 | a carried note arrived at the floor over a pinned one | the carry path calls `clear` now |
| B10 | `שורות()` resolved against two typographies | both halves go through `_ap_line_of` now |
| B11 | a `)` in a quoted argument derailed the paren scan | the scan is over a real parse, not a depth counter |

The fixes each landed **with a comment quoting the finding**, which is how I found
each one. So the code is in better shape than the issue says.

### And that is exactly why the issue is still open

Seven findings, seven comments, **zero tests**. Nothing in `engine/tests/` mentions
any of the audit's own fixtures. The code was fixed by hand and the property was
never written down, so the next rewrite of the side machinery or the reserve
scanner has nothing to fail. That is the whole of #2's remaining value, and it is
`engine/tests/note_layout.rs` — one render regression per finding, each doc
comment recording what was true when it was written.

### The seventh finding was real: a name nobody declared

B2's audit text has a sibling it flags as still open — "a note into a region name
that was never declared compiles clean ... no diagnostic ever says the name is
unknown". Measured: `ok: true`, **zero diagnostics**, ink at y=712.5, which is
exactly where a correctly-filed note lands. Indistinguishable, to a writer, from
right.

So the note is drawn. Nothing is lost. What is lost is the *destination*, and
silently, which is the quieter half of B1's defect class — B1 lost the text, this
loses the place. `unknown_destinations` is a **warning**, on the reasoning
`italic_warning` already states: the document compiles, the note is on the page,
and a writer part-way through a sefer keeps working. What must not happen is that
they never find out. It names the unknown name, lists the declared ones when the
document declares any, and locates the call (3:6, the `ה` of `#הערה`).

The seven tier channels are exempt because they are Typst's own balanced series —
warning on `#הערה(ערוץ: "הערה_ב")`, which is an ordinary sefer, is the noise that
teaches people to skip the list.

### Three of the four mutations fire, and two fences were vacuous

Mutation-tested, one at a time, restoring by md5 because I destroyed a working
tree restoring a stale backup:

- the warning not collected → `an_undeclared_destination_is_named` fails
- the tier channels not exempt → `a_known_destination_is_not_named` fails, and the
  panic prints the exact false positive a writer would have met
- the declared-name check never skips → the same test fails
- the reserve cap `total.min(page_h_cm * MAX_REGION_SHARE)` deleted →
  `a_declared_height_is_clamped` fails
- the channel-declared height ignored → `a_region_height_and_a_channel_height_agree` fails
- the scanner blind to `REGION_ARG` again → `the_region_spelling_reserves` fails
- the `שורות` unit unrecognised → `a_lines_band_resolves_against_one_typography` fails

**Three tests I wrote passed with the fix deleted, and are labelled accordingly
rather than shipped as fences:**

- **B1** — putting the pre-fix filter back (`_rg_show` re-deriving the region from
  the channel's declarations, which is what the audit named) leaves the note
  drawn. That filter is no longer on this note's path. Two document shapes later
  — a channel declaring no region, then a *named* region the channel never
  mentions — it still does not reproduce. The test asserts the property; it does
  not claim to protect that line.
- **B3** — deleting the cross-stream `sorted` in `_sn_placed` changes nothing for a
  two-region document, because for a **linear** document the sort's key
  `(page, want)` is already the document order. The sort only earns anything where
  the two differ: a note inside a table cell, a figure, a deferred section.
- **B5** — I could not build a document that reaches the carry branch at all. Two
  constructions both place the note by a different line, and the first version of
  that test passed with `clear` deleted, so it is **gone** rather than repaired.
  The branch is documented as unverified; a non-linear fixture is the next thing
  to build for B3, and a bounded-ceiling geometry for B5.

That is three of nine. The other six fire.

### A test bug worth the space it took

`a_carried_note_steps_over_a_pinned_one` asserted `carried.page == pinned.page`
under an `if`, so when the two notes landed on different pages — where the bug is
not reachable — it asserted nothing and passed. The mutation found it. It is now
`assert_eq!((pinned_page, carried_page), (2, 2), "the two notes must carry onto
the same page for this to be the bug")`: if the geometry ever moves them apart, the
test says so instead of skipping.

Engine tests 1019 → 1028, binaries 71 → 72, editor assertions 7,776 → 7,777.
Emacs 63, 0 unexpected.

### #2 closed; the verification gap is its own plan item

Filed the two unverified branches as `#2′` rather than leaving them as a paragraph
inside a test file: a non-linear note fixture is what reaches B3's cross-stream
sort, and a bounded-ceiling geometry is what reaches B5's carry path. A sentence
in a doc comment is a promise with no owner; a plan line is a task.

---

## 2026-09-27 · #6 fire-and-forget — the rule, and 43 call sites that did not have one

### Measured first, and the number is worse than the issue's word "many"

93 `void someAsyncCall()` sites, 59 distinct callees. Of those 59, **30 had no
`try`, no `catch` and no `.catch` anywhere in their body** — 51 of the 93 sites.
A `void p()` on a rejecting promise is an unhandled rejection: the browser logs
it, the writer sees nothing, and whatever the handler was halfway through
changing stays changed.

The issue's word for that state was "without an exhaustive policy, a new failure
*can* silently leave stale UI". Measured, 51 existing sites already could.

### `watch.ts` already knew the answer, which is why there was no rule

`src/watch.ts` is the model: `try`, a `catch` carrying a comment that says why a
`stat` that throws is a file that was unplugged and not a conflict, and `busy`
restored in a `finally`. The problem was never that the call sites were wrong. It
was that whether a call site was safe depended on who wrote it that day, and
nothing recorded the answer.

### One function, and the distinction it draws is cancellation from failure

`src/asyncaction.ts`: `action(doing, body)` returns a promise that never rejects,
and `voidAction(doing, body)` is the approved fire-and-forget form. A failure goes
through `troubleSaid` — the repository's existing answer to a caught error, so the
sentence is the reader's and the machine's string is behind the details
affordance — and lands in the status bar. A **cancellation says nothing at all**,
because a superseded compile is the app working and reporting it would teach
writers to ignore the status line.

**48 call sites converted**, the 26 that change which document is open or what is
on the page (`enterDoc`, `openDoc`, `closeOpenDoc`, `newDocTab`, `openInNewTab`,
`newBlankDoc`, `newNamedDoc`, `duplicateDoc`, `reloadFromDisk`, `loadTemplate`,
`setEditingMode`, `saveArrangementHere`, `restoreSnapshot`, `addFont`,
`importDictionary`) plus the 22 unguarded ones elsewhere (`refreshGit`, `runGit`,
`restoreCommit`, `revertCommit`, `compareWithCommit`, `renderHistory`,
`revealCursor`, `jumpFromClick`, `offerRecovery`, `maybeCheckForUpdate`,
`openSharedIfLinked`, `saveFileAs`, `startFromTemplate`, `healAll`, `renumberAll`).

One of them was **awaited**: `void setEditingMode(value).then(rerenderChrome)`
chains `.then`, so it became `action`, not `voidAction` — which is the distinction
the wrapper exists to make visible at the call site.

### Three of them were never promises

`healAll` returns the number of fixes applied, `renumberAll` the number of fields
renumbered, `startFind` whether a find opened. `void f()` on a number discards
nothing that can reject. The typechecker said `Type 'number' is not assignable to
type 'Promise<unknown>'`, which is the honest answer, and they went back to bare
`void` with a note saying why. A rule that wraps a synchronous call to look
careful is a rule that teaches people the wrapper does not mean what it says.

So the sweep now finds 47 sites, 32 distinct, and **every one either returns no
promise or carries its own error handling**. That is the answer to the issue's
"inventory all user-triggered handlers and classify each", arrived at by
measurement rather than by assertion.

### My first `isCancellation` swallowed real failures

It matched a message merely *containing* "cancelled" — so
`Error("cancelled the subscription")`, a broken subscription, reported nothing.
That is precisely the defect this file exists to remove, and a test case in my own
file caught it. The heuristic is gone: a cancellation is `AbortError`,
`TimeoutError`, or this app's own `cancelled()` marker, which is an object rather
than a string so nothing that merely says the word is mistaken for one.

### The fence, and four mutations

`test/asyncaction.test.mjs` sweeps every `void f(` in `src/`, comments stripped
(several mention `void` in prose, and a fence that fires on its own documentation
is a fence people learn to disable). It requires each to be in an inventory with a
reason, requires the inventory not to name a `void` that is gone, and requires
every reason to contain a justification keyword rather than a shrug.

Wrapper behaviour is asserted through the **real built module** and the **real
status bar** — `installChrome()` and `document.getElementById("status")`, the
harness this repository built for exactly this class of bug. My first version
instead read the source, stripped it with Node's own `stripTypeScriptTypes`, and
evaluated it with two dependencies replaced; that worked and it was the wrong
call, since it tests a copy. The version I kept also has a comment about why the
replacement is *named functions* and not inline arrows: substituting a callee with
an arrow expression in place turns `f(a, b)` into `(x, y) => …(a, b)`, and the
arrow body swallows the call.

Four mutations, each run:

- a new bare `void newNamedDoc()` → the sweep fires and names the exact site
- every failure swallowed as if it were a cancellation → the three reporting
  assertions go red
- no cancellation recognised at all → the same three go red
- the wrapper writing its own failure sentence, bypassing `troubleSaid` → the
  "writes no sentence of its own" check goes red

`runner.test.mjs`'s "every module is imported by at least one test" caught that
`asyncaction.ts` was not, which is how it ended up on the normal build path
instead of in `NOT_IMPORTABLE`.

Editor assertions 7,777 → 7,798, test files 109 → 110.

### #6 closed; the inventory is the deliverable, not the wrapper

The wrapper is 60 lines and could have been written in ten. The 32-entry
inventory with a measured reason beside each is the part that stops the next
`void`, and the "may not name a `void` that is gone" rule is what stops the
inventory itself from becoming the thing it replaced — a list that rots into
permission.

---

## 2026-09-27 · #2′ the two branches #2 could not reach

Both closed by finding the geometry, and in both cases the geometry is the lesson.

### B3: one `place` away

`_sn_placed` sorts the streams together with `items.sorted(key: it => (it.page,
it.want))`. I had deleted that sort and **two documents came out byte-identical**:
two side regions with one note each, and two table cells. The reason is the key —
for a linear document `(page, want)` *is* the document order, and two cells in a row
share a baseline, so a tie keeps the order. A sort that cannot change anything is
not a sort that can be tested.

What it protects is worth more than the audit's interleaving. Anchor one note 300pt
down the page and the next at the top, so the source order is the **reverse** of the
reading order — which is the only situation where the sort does anything:

```
#place(dy: 300pt)[#הערה(אזור: "ר1")[הערה במקום גבוה]]
#place(dy: 0pt)[#הערה(אזור: "ר2")[הערה במקום נמוך]]
```

With the sort: 406.08 and 106.08, each at its own marker. **Without it: 406.08 and
432.66** — the second note drawn 326pt from the word it belongs to, in the other
apparatus's band. A note a reader cannot find from its marker is B1's defect class
arrived at from the other direction: the text is drawn, and it is somewhere else.

### B5: four wrong documents, and the fourth is the whole one

1. **A page with no paper grows.** The carry branch's guard is
   `y + it.h > ceiling`; `ceiling` is `_pg_text_bottom()`, which is `none` unless
   `page.height` is a length. `רציף` (continuous) is off by default, but
   `page.height` is still `auto` unless `#מסמך[…]` is the thing carrying the
   setting — so the document has to be *inside* one.
2. **The note has to be too long for its page.** A 500pt note anchored at the top
   of page 1 fits, and then there is nothing to carry. 200 repetitions of a phrase
   does not.
3. **The pinned note has to hold the top of the page being carried *onto*.**
4. **And `clear` was a no-op while the pinned note was the immediately preceding
   item** — because `cursor` is already `y + it.h + gap`, the same arithmetic
   `clear` performs. My first two attempts died on exactly this, and a test that
   could not fail is worse than no test. Hence a page break: the pinned note is the
   first line of page 2, and the carried note arrives at the top of page 2 having
   been anchored on page 1.

Measured with `clear` deleted: carried at **y=90.24**, pinned at **y=95.63**, same
column, same page — 5.4pt apart, and the two are 40pt and 500pt tall. That is the
audit's sentence, reproduced: *a note printed straight through it*. With the fix,
135.40, which is 39.8pt below the pinned note's top — its height, exactly.

Both mutations confirmed to fail with the fix deleted. `note_layout.rs` is eleven
tests and **nine of them now fire with their fix removed**; B1 and B3's stacking
property test are the two that do not, and both say so in their own doc comments.

### The documentation fence caught me stating a count as prose

The #6 mutation table gave a count. `documentation.test.mjs` refuses a
numeric claim in a living page that no declaration backs — and it is right: I had
written a mutation result in the shape of a suite fact, which is exactly what that
fence exists to stop. Spelled out as "the three reporting assertions go red", which
is what it was.

Engine tests 1028 → 1030.

---

## 2026-09-27 · #5 config setters — sixteen of fifty, and the check was in the wrong place

### What the audit said, and what it was

"Several config setters accept unknown keys while sibling setters reject them;
typos become dead settings." Measured across all fifty `הגדרות_*` commands: **16
of 50 compiled clean on a misspelled knob.** Not a degraded page — an *unchanged*
one, with the writer's control reading back exactly what they typed and nothing
happening.

My first sweep was wrong twice before it was right. A static scan for `_cfg_strict`
reported **45 of 55 loose**, because most of those delegate to `_mk_set` and my
scan only looked at each command's own body. Then a sweep keyed on the string
"unrecognised argument" reported 17, of which two refused in their own words
("אין הגדרה בשם") and one for a missing positional — the *inverse* error, calling
a strict command a gap. The sweep that was right asked one question: does the
document compile?

### The root cause is better than "somebody forgot"

Seventeen of them validated **inside their `update` closure**, and a state's update
closure runs only when something reads the state. So the check was not a check; it
was a rule that fired on the next note. Against the pre-fix prelude, measured:

```
#הגדרות_טקסט_הערות(טיפא: true)   ok: true      …and one #הערה      ok: false
#הגדרות_כותרת1(טיפא: true)        ok: true      …and one = כותרת   ok: false
```

Two failures, and the second is worse. The document compiled when the writer typed
the typo, and stopped compiling later, on an unrelated edit, naming an argument
written a page ago. `#הגדרות_מספור` was already checked outside its closure and
says why in a comment — the difference between the two was which line somebody
happened to edit.

### The helper already existed, and I wrote a second one

`_cfg_validate`'s doc comment claims it is *"at the public boundary of every
settings command"*. Four commands used it. I did not look before writing, so I
wrote `_cfg_knobs`, put it after the commands that needed it — **and broke
`הגדרות_טקסט_הערות`**, because Typst has no forward references. The only thing
that noticed was the container probe, which filed a working command as
*undecidable* because every shape it tried now failed. That is the argument for
the probe existing.

Deleted mine, and strengthened the real one: it takes the named half of the
arguments (so a command handed a dictionary can use it), accepts either a defaults
dictionary or a bare list of keys, accepts extras, and **prints the legal list**
with the refusal. Twelve commands route through it now.

### Three of my own errors, and what caught each

- **Braces.** Wrapping `_hd_set` in a block without closing it broke the whole
  prelude from that line on: 65 tests red, and the first failure was a registry
  test that disagreed with itself about which `#let`s exist.
- **`type array has no method 'keys'`.** `_nt_keys` is a list, and I passed it
  where a dictionary was expected. The *typo sweep* caught this, not the test
  suite — because a panic is a non-compile too, and the sweep was only asking
  "did it fail". It now requires the message to **name the key the writer typed**,
  which is what distinguishes a refusal from any other failure.
- **A static fence that cried wolf.** `no_settings_command_skips_the_key_check`
  first read one line per command and reported seven violations, every one a
  command whose check is on line two. Then, after reading whole bodies, it
  reported 26 — because it took the first `{` after the name, which for
  `#let הגדרות_ציון(..opts) = _mk_set("ציון", …)` is the *next command's* brace. It
  reads balanced-one-line or brace-matched, and it recognises the phrasing
  `הגדרות_מספור` uses, because a sweep that calls a command which checks a
  violation gets deleted rather than amended.

### The other four sub-items, which are not code

- **`purge_ratio`** has no owner anywhere in this repository, and `issue-notes.md`
  already said so: *"adding that setting would invent a contract"*. Not added.
  A safety value with no subsystem that needs it is dead configuration with a
  domain test attached to it.
- **Tool probing is already bounded and machine-readable.** `git_run` has a
  120-second `DEADLINE` with a kill, and `version()` reads
  `"git version 2.54.0.windows.1"` with `rsplit(' ').next()` — no locale, no
  substring match — cached in a `OnceLock` because git does not upgrade itself
  under an open drawer.
- **Installer and Windows archive names**: there is no installer here. `packaging/`
  is a Dockerfile and two shell scripts; no Rust code writes an archive, so
  "reserved-name and traversal handling" has no site to be right or wrong in.
- **Grammar spans**: `line_column` exists in the engine and carries 1-based
  line and character column, and a `DOMException` crossing a worker boundary is
  matched by name for the same reason `isCancellation` matches by name.

### What is fenced

`engine/tests/settings_keys.rs`, six tests. All fifty setters must refuse an
unknown knob **by name**; the refusal must happen in a document with nothing that
reads the state; **every key the refusal offers must itself be accepted** (a list
that offers a key it then refuses is worse than no list); a global knob is still
global; and no settings command may skip the check, read out of the prelude so a
fiftyth command added next year is swept without a line being written here.

Five of the six fail against the actual pre-fix `ksav.typ`, restored from git —
which is the mutation that matters, rather than a reconstruction of it. An earlier
attempt at the "inside the closure" mutation passed all six, and the honest
conclusion is that my reconstruction was not faithful; the real pre-fix file is
what proves the claim.

`skips.test.mjs` then called the static sweep by name for keeping its assertions
inside a loop, and it is right: a sweep that matches nothing passes everything it
has. It now asserts a floor on the number of commands examined.

Engine tests 1030 → 1036, binaries 72 → 73. Editor assertions unchanged at 7,798.
The container fixture is **byte-identical** — `emit-containers` learned to tell
"I refuse this argument" from "I am not a container", so a strict setter stays
`transparent` rather than being reclassified.

### #5 closed, and the four sub-items that were never code

Worth saying plainly, because the shape recurs across this plan: an audit lists
five findings, one is a live defect with a root cause nobody had named, and four
are either already done or describe software this repository does not have. The
useful move was to say which, with the measurement, rather than to invent work to
match the list.

---

## 2026-09-27 · #3 i18n — eleven strings, and the hole is smaller than the issue's framing

### The infrastructure was already there

`setSetting("lang", …)` already called `localise()` and `rebuildOpenPanels()`, and
`localise` already sweeps all four label kinds — `data-i18n`, `-title`, `-label`,
`-placeholder`. A previous fix did the hard part. The issue's framing ("a complete,
testable localization architecture") describes the absence of *evidence*, not of
code.

### What was actually wrong, and it is not "Hebrew left on screen"

`t` falls back to `DICTS.en[key] ?? key`, and the i18n module says why that is right
at a call site — *"a writer sees a word rather than `sc.hiddenBreak`"*. So a key
with no English entry does not look missing. **It looks like a developer name.**
Measured against the built module:

```
setLang("en"); t("refreshTitle")  →  "refreshTitle"
setLang("en"); t("sourcePasted")  →  "sourcePasted"
```

Eleven of them — and not in a corner. `refreshTitle` is a **panel heading** and
`sourcePasted` is a **status line**. An English writer was not seeing Hebrew, which
is the defect everybody looks for; they were seeing a key name, which nobody looks
for. 919 Hebrew keys, 908 English.

This is why a dictionary test is not enough. `hasKey` answers *"is this in either
shelf"*, and a Hebrew-only key answers yes. The question is the other one: **is it
in the one the user is reading?**

### A Latin-script detail that would have shipped wrong

`sourcePasted` in Hebrew interpolates `${GIRSA}`. My first English version did the
same, which produced *"A source was pasted from גִּרְסָא"* — a Hebrew product name
inside an English sentence, which is the exact defect `language.test.mjs` exists
to prevent, in the one file meant to prevent it. Every other English line spells it
`Girsa`. Fixed.

### Two rules in the fence that were wrong, both catching good translations

The check I wanted was "no English value is its own key name". First attempt flagged
`words: "words"`, `chars: "chars"` and `recovered: "recovered"` — all real, all
with a Hebrew entry that differs. Second attempt went after "looks like an
identifier" and flagged `importWord: "Import from Word (.docx)…"`,
`copyFailed: "Copy failed — use \"Word (.doc)\" instead."` and
`git.installGit: "Install git: git-scm.com"` — a file extension and a URL.

What survives both is exact: **the value is the key, and the key is a name** —
camelCase or dotted. `refreshTitle: "refreshTitle"` is that; nothing in a real
translation is. The three cognates are now named in the test with their Hebrew
entries, so the next reader does not re-litigate them.

### The e2e the issue asks for, and the part that cannot be one

`installChrome` gives a `document` whose `querySelectorAll` returns `[]`
unconditionally — so `localise(document)` is a no-op that passes everything asked
of it. A browser test is not available and a test that claimed to open every panel
would open none.

What *is* testable is the real `localise` against the real dictionaries, on a root
implementing exactly the four selectors and the setters the sweep uses. That catches
the realistic regression — a dropped `data-i18n-title` line — and drops one `say(…)`
from `panels.ts` to confirm. Recorded as a gap, not approximated.

### Two vacuous assertions of my own, both in the same line

The per-attribute loop filtered on `n._attr`, which the rewritten node factory no
longer carried, so `mine` was empty and `every` on an empty array is true — and it
only *read*, so it compared Hebrew nodes against an English test. Two bugs pointing
at one assertion that could not fail. Found by the idempotence check immediately
after it, which is the only reason it was found at all.

### Mutations

- a new Hebrew-only key → "every Hebrew key has an English entry" and the size check
- an English value reverted to its own key name → two assertions, naming the key
- the `data-i18n-title` sweep dropped from `localise` → four assertions

Editor assertions 7,798 → 7,836, test files 110 → 111. Engine untouched.

### #3 closed; the browser harness is the honest remainder

The issue's own acceptance criteria are not all met, and the record says which:
"no visible or accessible text left in the old language" is fenced against the
sweep, but "open every panel, switch, read the screen, reload" needs a browser this
suite does not have. The gap is in the issue, not in the work.

---

## 2026-09-27 · #3′, asked for directly: can the language switch be tested for real?

### Yes, and the answer is that the unit test was measuring the wrong thing

A browser was here the whole time — `playwright-core` with a Chromium already in
`~/.cache/ms-playwright`. It would not start, because Nix keeps each shared library
in its own store path and none is on the default search path. About twenty were
missing; resolving them by name and walking the list until `ldd` came back clean
took four passes, and two of them — `libasound`, `libudev` — are present in a
32-bit and a 64-bit build, so the resolver has to check `EI_CLASS` and the failure
otherwise reads `wrong ELF class: ELFCLASS32`, which names nothing.

Then it worked, and the built application booted: **7,845 characters of Hebrew UI,
zero console errors**, the settings drawer open, thirty-one headings.

And the switch works. `dir` flips `rtl`→`ltr`, `lang` becomes `en`, the chrome
turns English, the choice is written to `localStorage` and survives a reload.

### And 114 Hebrew strings were still standing

That is the finding, and it is a whole layer the dictionary fence cannot see.

**Fifty of them are keys that have an English entry already** — `previewSide`,
`closeTab`, `searchScope.source`, `retrySave`, `untitled`, `zoomPane`,
`splitAcross`, the five `*Lede`s. They are written into `aria-label` and `title` at
boot, and `localise()` cannot reach them because nothing tagged them. This is the
defect `i18n.ts` already describes — *"a title that looked right until somebody
changed language, and then stayed in the language it was born in"* — fixed for
`panelHead` and never swept for the other twenty-odd sites. The `*Lede` family is
the systematic case: `panelHead` tags the head, the lede is the panel's own child,
so **every panel with a lede has an untagged one**.

**Sixty-four are composed strings** — `"פתח · Alt+a"`, `"Rename: ללא שם"`,
`"⟳ התצוגה אינה מעודכנת"`. A label, a separator and a shortcut, concatenated. One
attribute holds one `t(key)`, so these need a message *with parts*, which is a new
mechanism rather than a missing tag — and the reason the residue cannot be closed
by sweeping for `[data-i18n]`.

### The shape of the blindness is the lesson

`uilanguage.test.mjs` proves the catalogues hold the same keys in both languages
and that `localise()` sweeps the four attribute kinds it is given. Both true.
Neither says anything about **what the DOM holds**, and the defect lives entirely
in the gap. A catalogue test is a test of the *data*; a language switch is a
property of the *rendering*. I said that gap needed a browser, and it did, and the
browser found on the first run seven keys a hand-written `RESIDUE` list had
missed — which is the argument for measuring rather than listing.

### What ships

`test/browserlang.test.mjs`, twelve assertions against the real window: the toggle
is pressed the way a writer presses it (found by its accessible name *in the old
language*, which is the only way a writer can find it), `dir`/`lang` flip, the
header reads English with a document's own title excluded because a Hebrew
document's title is supposed to be Hebrew, the choice is written down and survives
a reload.

The residue is a **ceiling, not a zero**. A test asserting zero would be red on
arrival, and a red test is a complaint rather than a fence. The direction that
matters is enforced instead — *no catalogue key stands in Hebrew that the file has
not recorded* — and a mutation confirms it fires by name. The recorded set is
allowed to be a superset of what is visible, because which panels are open changes
the visible set and a fence that fails for a reason outside what it watches is a
fence people switch off.

It skips **loudly** where there is no Chromium, naming which of the two it lacked,
rather than failing for a reason that has nothing to do with the application.

### Two fences caught me being lazy

`gate.test.mjs` refused a README note that spelled `npm test` — correctly, since a
second copy of a check command is the drift that fence exists to catch. And the
`Rename: ללא שם` in my header assertion was a false positive: a document's own name
in its own language is correct, and only the verb is this app's text.

Filed as **#71**, with the 31 keys named and the two defects separated, because they
have different sizes: one is a sweep, the other is a mechanism that does not exist
yet.

Editor assertions 7,836 → 7,848, test files 111 → 112.

---

## 2026-09-27 · #71, first slice — the mechanism, and 9 of 50 keys

### Fifty keys with an English entry and no way to be re-localised

The residue was not fifty missing translations. It was fifty strings written into
`aria-label` and `title` at boot, holding keys the catalogue already answers, in
elements nothing had tagged. Three changes to `localise`, each for a shape the
measurement forced:

- **`data-i18n-both`** — `iconBtn` and `glyphBtn` both write `title` *and*
  `aria-label` from one argument, so tagging such a button meant writing the same
  key twice, and at twenty-odd call sites that is twenty-odd chances to write one
  and forget the other. One marker, both attributes.
- **`data-i18n-args`** — for a key whose value is a template. 64 of the strings
  were *composed*: `"פתח · Alt+a"`, `"Rename: ללא שם"`. One attribute holds one
  `t(key)`, so a sentence with a part in it needed something that did not exist.
- **A leading `:` means "this argument is a key".** A chord is a chord in either
  language; the label beside it is `sc.open` and is not. Guessing which is which
  from the catalogue is precisely the trap `hasKey`'s own comment describes, so
  it is spelled in the value instead.
- **Per-attribute arguments**, because the ribbon's button carries *different*
  strings: `title` says `name · shortcut` and `aria-label` says `name` alone,
  since a screen reader has no use for a chord. One shared list would have forced
  the accessible name to gain "· Alt+a".

### One function builds the whole note ribbon

`noteBtn` — a title of `t("sc." + action) + " · " + hint`, passed to `iconBtn`.
One site, thirteen buttons, and the chord is an argument rather than part of the
key. Verified in a real window: `"הערת שוליים · Ctrl+Shift+F"` →
**`"Footnote · Ctrl+Shift+F"`**.

The pane cluster went with it: `splitAcross`, `splitDown`, `zoomPane`/`unzoomPane`
(whose marker is itself a ternary, or the button would re-localise to the state it
was *not* in), `paneMenu`, `closePane`, `scrollLinked`, `previewStaleHow`.

**31 keys → 22. 64 composed → 41.**

### The ceiling could not see its own mechanism, and a mutation said so

With the `:` convention deleted, `tf` receives `":sc.footnote"` untranslated and
produces `":sc.footnote · Ctrl+Shift+F"` — which is **not Hebrew**. The residue
count goes *down*, and the ceiling is satisfied by a window that is worse than
before. A ceiling measures *less bad*; it cannot see *differently* bad.

So the mechanism is asserted directly: after a switch, no attribute value and no
text may be an unsubstituted `{0}` or a `:key`. The same mutation now fails with
`aria-label=":sc.footnote · Ctrl+Shift+F"` named in the message.

### Three of my own errors, each caught by something

- Wrote the new helper in the wrong place and **broke a command** — Typst has no
  forward references — and the only thing that noticed was a container probe.
- Set `data-i18n-both-args` on an element carrying `data-i18n-title`, so the
  marker was inert. Only a DOM dump showed the attributes were missing while the
  isolated unit test passed.
- A codemod matched the **wrong `glyphBtn`**: it produced a duplicate
  `data-i18n-both` on `splitAcross` while aiming at `scrollLinked`. `tsc` caught it
  (`TS1117`), which is the whole argument for a typechecker on a codemod.

And a stale `.tmp-test` bundle made the isolated test report `"{0} · {1}"` as the
translated value, which looked exactly like a mechanism failure.

### What is left, measured

22 catalogue keys: tab and pane furniture, the two view panes' own names, the
nikud toggle, the four search-scope rows, and the ledes — `outlineLede`,
`notesPaneLede`, `marksPaneLede`, `findLede`, `previewFollowsLede`, `welcomeTitle`,
`narrowLede`, `notesPaneEmpty`, `mark.added`. **Every lede is a `panelHead`
sibling**, so the systematic fix is for `panelHead` to tag the panel's lede rather
than twenty panels each doing it.

41 composed, of which about 13 are the file and theme ribbon (`פתח · Alt+a`,
`סגול · Alt+d`, `חטף סגול · Alt+z`) — the same family as `noteBtn`, a different
builder. The rest are legitimate: niqqud letter samples (`אְ אֱ אֲ`), Hebrew
document source in textarea placeholders, and English text *about* Hebrew
("Off by default: in Hebrew the geresh and gershayim"). Those are counted by the
ceiling and should not be chased.

Editor assertions 7,848 → 7,849. Engine untouched.

---

## 2026-09-27 · #71, the rest of the keys — 50 → 2

### The ledes were one missing helper, not five missing attributes

Every drawer's lede was `el("p", { class: "pane-lede" }, [t("someLede")])`. The
head beside it is tagged by `panelHead`; the lede was not. Five were standing in
Hebrew — `outlineLede`, `notesPaneLede`, `marksPaneLede`, `findLede`,
`previewFollowsLede` — and the *class* they all share is not a tag: `localise`
reads attributes, and nothing there had one. So the lede got the helper the head
got (`panelLede`, with `panelHead`'s own contract that the argument is a key), and
`welcomeBody` and `welcomeTitle` came with it.

That is the shape worth keeping: **five attributes versus one helper**, and the
helper is the only version that also stops the sixth drawer doing it wrong.

### A shared class is a naming convention, and `hasKey` is how you check one

`selectRow` takes a `labelKey`, and its options are `[value, label]`. The option
keys are `<labelKey>.<value>` — `searchScope.source` for the `searchScope` row —
and that is a *convention*, not a contract. So the convention is **checked**:
`selectRow` tags an option only when `hasKey(\`${labelKey}.${value}\`)` is true. A
row that does not follow it goes untagged, which is the old behaviour, rather than
being re-localised to a key that means something else. Guessing a key name and
building an attribute from it is the failure mode `hasKey`'s own comment describes,
and a check is the whole difference between a convention and a guess.

The same four `searchScope.*` keys were standing in **two** places — the settings
drawer and the find panel — and one count would not have shown that. Both tagged.

### Two elements that are built by something else

- `head.title = t("swapPaneDrag")` — a **property** assignment on a head built
  earlier. `localise` reads attributes, so the handle also gets
  `setAttribute("data-i18n-title", …)`; a tooltip set after the fact is a tooltip
  that cannot be re-localised.
- `nameMarks({ added: t("mark.added"), … })` — the change-gutter marker is
  **built by CodeMirror**, so it is never handed back to a builder that would know
  to tag it, and by the time the marker existed the key was gone. `nameMarks` now
  takes the keys beside the sentences, and `toDOM` writes both.

### Fifty keys → two

`untitled` and `welcomeTitle` are what is left, and they are the right two:

- **`untitled` is a document's own name.** It reaches the tab, the title bar and
  `<title>`. A document created while the interface was Hebrew is called `ללא שם`,
  and in English it reads `Untitled` — a document named in the language it was
  created in, which is right. Tagging it would **rename a writer's file on a
  language switch**, which is a considerably worse bug than a Hebrew string.
- **`welcomeTitle`** is one untagged `<span>` outside the document editor — a
  second rendering of a string `panelHead` already tags correctly. Not a
  systematic case, and I did not find the site by reading; the browser found it by
  asking which element held the text.

The ceiling in `browserlang.test.mjs` is now `keys: 2, composed: 41`, re-measured
rather than edited by hand, and every recorded key carries why it is still there.

### Two fences caught me being careless, and both were right

- `panelede.test.mjs` asserts `t("marksPaneLede")` appears in `main.ts`. Moving
  the `t()` into a helper **broke a test that was checking the wrong thing** — it
  asks whether the pane says what it lists, not which line renders it. Widened to
  accept either spelling, with the reason written down, rather than reverting the
  helper.
- `readme.test.mjs` refuses a living page that names a shortcut the product does
  not bind. My session log illustrated the point with an invented chord — one this
  product does not bind — written in the backticks the sweep looks for, which is
  the violation reproduced inside the sentence reporting it. Rewritten to say
  that a chord is a chord in either language, which is the same point and survives
  the sweep. The fence is doing exactly what it is for: a plausible sentence about
  chords, in a document that names chords, is a claim about which chords exist —
  including when the sentence is *about* the claim.

### #71: 114 → 43, and the two that must stay

The headline number moved from 114 to 43, and the composition of it matters more
than the total: two catalogue keys (one of which is correct) and 41 composed
strings, of which about thirteen are the file and theme ribbon — the same shape as
`noteBtn`, in a different builder — and the rest are Hebrew that *should* stay
(letter samples in the niqqud bar, Hebrew document source in placeholders, English
text about Hebrew). Chasing the last thirteen is the next piece; the ceiling in the
browser test is what says when it is done.

---

## 2026-09-27 · #71, the niqqud bar — and a misreading worth recording

### I read "פתח · Alt+a" as "Open · Alt+a" and built a plan around it

The residue list had fourteen strings of the shape `<name> · Alt+<letter>`, and I
named them *"the file/theme ribbon"* in the plan and in a comment, and said the next
piece was to find the file and theme builder. `פתח` is **patach**. `קמץ` is
**kamatz**, `סגול` is **segol**, `חולם` is **holam**. They are the fourteen niqqud,
and the builder was `buildNikudBar` — the first place I had already been, where I
had tagged the bar's `aria-label` and its hint and moved on.

The tell was available and I walked past it twice: the strings sat on
`class="nikud-btn"`, and I had *just* edited that file. Reading a Hebrew string and
inferring its English is the exact move this repository keeps refusing to make
programmatically — `hasKey` exists because "the value equals the key" cannot tell a
cognate from a hole — and I made it with my own eyes.

### The table held sentences, which is the same defect twice

`NIKUD` was `[mark, name, chord]` with `name` the **translated** string. So the key
was gone before the button existed, and the bar could say nothing else. That is
`nameMarks` again, in a second file, and the fix is the same shape: the table now
carries a key, and `t(nameKey)` is called at the point of use.

Fourteen keys in each half, and the English is **transliterated** — decided rather
than guessed, because it is a product call and the code cannot answer it. The bar
is a Hebrew learner's instrument, and a learner in an English interface needs the
romanisation they will meet in a grammar book: `patach`, `kamatz`, `segol`, `tsere`,
`hiriq`, `holam`, `kubbutz`, `sheva`, `dagesh`, `shin, right dot`, `shin, left dot`,
`shindot segol`, `shindot patach`, `shindot kamatz`. The mark itself is the glyph
beside the label and stays Hebrew in both; only the *name* changes.

### And specimens are not a missing translation

The count was also charging for `אְ אֱ אֲ` — the `א` with each mark on it, shown
because a learner needs to *see* the mark. A font specimen in its own script is not
a string this application failed to translate, and a ceiling nobody can reach is a
comment. The exclusion is deliberately narrow: one base letter plus marks, nothing
else. `אְ` is a specimen; `הערה` is a sentence somebody has to read.

### 41 → 11 composed, and six of the eleven are right

| | |
|---|---|
| `#let דגש(x) = …`, `בסד = בס"ד` | a Hebrew document's own source, in the placeholders offering a first document |
| "Off by default: in Hebrew the geresh…", "Hebrew numbering (א,ב,ג)", "Keep a one-letter word…" | English sentences *about* Hebrew, correct in English and wrong translated |
| `Rename: ללא שם` | the verb is already English; the name is the document's own |

So the real residue is five: `חלונית 1`/`חלונית 2` (a pane number with no key),
`⟳ התצוגה אינה מעודכנת` (the stale-preview notice), `כתב עברי`, and the status line
that carries **both** languages on purpose — `troubleSaid` emits `"he · en"` so a
writer sees theirs whichever it is, which means an English interface reads it
Hebrew-first. That last one is a decision, not a bug, and it is written down rather
than fixed here.

### The fence caught me committing the violation I had just described

Last round `readme.test.mjs` refused my session log for naming an unbound chord, and
the log entry I wrote *about that* quoted the chord in the backticks the sweep looks
for. A sentence about the violation, containing the violation. It has been rewritten
to describe the chord without naming it, which is the only way to write it down —
and the fence is right for a second reason I had not thought of: it does not care
whether a claim is being made or being reported, and neither should it.

Editor assertions unchanged at 7,849. Engine untouched.

---

## 2026-09-27 · #71, the last five — and a fence that caught the fourth

### Two of the five were the document's own text

`כתב עברי` sits in `DIV.cm-content` and `ברוכים הבאים לכְּתָב` sits inside
`BUTTON.outline-item` in `DIV.outline-list`. The first is the document the writer is
looking at; the second is that document's first heading, listed in the outline. A
Hebrew sefer read in an English interface is still a Hebrew sefer, and a writer types
Hebrew into an English interface **on purpose**. Excluding them is not a
convenience — it is the only correct answer, and the fence now skips anything
inside `.cm-content` or `.outline-list`.

Which also removed `welcomeTitle` from the count without my finding its site: the
span the browser kept reporting was the outline's row, not a second rendering of a
head. The browser had told me the element's parent chain three times and I read it
as a bug instead of as an answer.

### The other two were one-line gaps, and one is a template

- `paneNumbered` is `{0}` — the pane's number in its tooltip — and the span was
  untagged. It is a template, so it wanted the argument list, and the number is a
  bare number in either language, so it is not marked with `:`.
- The stale-preview notice was `"⟳ " + t("previewStale")`, a glyph and a word. A
  glyph is not language-dependent, so `msg.glyphThen` puts it in the template and
  passes it as a literal.

### The new one: an error path, because the registries do not load headless

`registriesFailed` appeared, and the reason it is *here* is that the registries do
not load in a headless run — which is exactly the state it exists for. A writer with
no registry gets a sentence saying so, and in an English interface that sentence was
Hebrew. The issue lists status and error paths among the surfaces a switch has to
reach, and this is the first one that turned out not to be tagged. Recorded rather
than fixed here, because the honest fix belongs with the registries and not with a
language fence.

### And then the prohibition fence caught me writing the mark block by hand

To exclude specimens I wrote `/^[א-ת]{1,3}[marks]*$/` and needed the marks. So I
wrote the range. `prohibitions.test.mjs` has forbidden exactly that since the class
was got wrong three separate times, and its comment says why: **`U+0591–U+05C7` is
not "the marks"**, because four characters in it are punctuation that separates
words — maqaf, paseq, sof pasuq, nun hafukha.

The repository had already solved it and I had read the answer an hour ago:
`markPattern()` in `engine.gen.ts` builds the class from the generated authority with
a **negated lookahead, so there is no range to split**. The fence was not
obstructive; it was pointing at a helper I had quoted from two files above.

And it took three attempts to get right, each an off-by-N in the same direction:

1. `U+0590–U+05AF` — stops one codepoint **before** the niqqud, so all fourteen
   specimens counted.
2. `U+0591–U+05BD` — covers the points and the dagesh, and stops six codepoints
   **short of the shin and sin dots** at U+05C1 and U+05C2, which are two of the
   fourteen marks the bar exists for.
3. `U+0591–U+05C7` — correct, and still hand-written, and therefore still wrong in
   the way the fence means.

Every version of that bound was a hand-split range with a hole in it. Which is the
fence's whole argument, restated by me three times.

### 114 → 9, and the ceiling says what the nine are

Two catalogue keys — `untitled`, which is a document's own name and would rename a
file on a language switch if tagged, and `registriesFailed`, an error path. Seven
composed, all of them Hebrew that should be there: a Hebrew starter's own source in
placeholders, English sentences *about* Hebrew, `Rename: <the document's name>`, and
the status line that carries both languages on purpose.

That last one is the one thing left to argue about rather than fix. `troubleSaid`
emits `"he · en"` so a writer sees theirs whichever language this is, which is a
good rule — and it means an English interface reads it Hebrew-first. A decision, and
it is written down rather than made here.

---

## 2026-09-27 · #15 — the premise, the seam, and the silence

### I mis-described the proposal, and checking it was worth more than the summary

I told the user the glue would "keep all 30 notes in the band on every page", and
asked why we would do that. **They were right to ask, and the answer is that the
issue never proposed it** — it says outright that a flow is a queue and not a
per-page assignment. My phrasing implied repetition and was simply wrong.

But checking before defending turned up something better. The issue measures itself:

> Doc B: **30 entries → 5 pages**; each page's band holds ~7

And the box today, measured here: **30 entries → 4 pages**, 9 per page, lowest ink
787.51 on an 841.89 pt sheet, **nothing clipped, nothing overlapping, nothing off
the page**. So the list under *"why it buys what a box cannot"* — no nine-note cap,
no clip, no overlap, nothing off-paper, spill-is-pagination-for-free — is a list of
properties the thing it would replace **already has**, and in the issue's own
numbers the proposal costs a page.

That does not mean there is no case. A commentary book with a hundred notes might
want a fixed band and a text that keeps filling the page above it, and the current
design cannot give that. But the issue does not show that case, and its numbers
point the other way. It is posted back with the measurement rather than closed on
my say-so.

### The one solid thing in it, and what it actually was

`DocConfig::from_json` clamped every numeric field and **said nothing**. A request
for `margin_top_cm: 21.7` came back laid out at 7 cm, compiled, printed, no
diagnostic: a writer who changed a margin and got the old page back could not tell
that from a setting that does not work.

That is the bug the app already names, one layer up — `settings.ts`: *"a load that
falls back to the defaults is a load that has silently un-chosen everything the
person chose, and it has to be able to say so."* The engine had the same defect and
no sentence, and #15 read it as *"the first compile fell back to default margins"*
and built a compositor around it. **It was a reporting problem, and the compositor
was never the fix.**

So, with the user's agreement:

- **A refusal is recorded and reported.** `clamped` notes what it changed,
  `DocConfig` carries the notes as a `#[serde(skip)]` field, and `compile` turns
  each into a warning naming the field, what was asked for and what is in force. A
  refusal is still **not** an error: the page is the nearest thing the field accepts
  and the document lays out.
- **A margin's limit is the sheet's, not a number chosen in advance.** 7 cm was
  never a limit — A4 is 29.7 cm tall. It is now `sheet − 1 cm`, which is the only
  physical question there is: how much of the page did the writer ask to give away.
  Measured: **21.7 cm now works**; 40 cm on A4 is refused at 28.70 and **says so**;
  a 50 cm sheet admits a 45 cm margin.

The page size has to be read *before* the margins, because a margin bounded by a
sheet the request was never compared against is a bound against a default — and the
first version of this clamped at 7 cm for exactly that reason, which is how the
silent failure survived the fix.

### Three of my own errors, and one that had been hidden all along

- **`ס"מ` inside a format string** closes it. Gershayim — `ס״מ`, U+05F4 — is both
  the correct Hebrew abbreviation and needs no escape.
- **A python write that reported success and did nothing.** Two edits I had
  "applied" and verified by *building* were absent from the file, and I only found
  out because the probe still returned 7.00. Verified by grep from then on.
- **`facts.mjs` counted a struct against a table that does not describe it.** Its
  own comment says it reads the struct "rather than `impl Default`" because
  rustfmt keeps the struct one field per line — and then the first attempt to
  exclude the `#[serde(skip)]` field stripped the *attribute* and left
  `pub refusals: …` to be counted, which is the same 41. It has to be the attribute
  **and** the field it applies to.

The last one is the shape worth remembering: a check written to compare two things
that were once the same, and which a new field made different, is not wrong in its
arithmetic. It is wrong in its question, and it will not say so.

Engine tests 1036 → 1044, binaries 73 → 74. Editor assertions unchanged at 7,849.

---

## 2026-09-28 · #67 — the ecosystem arrived, and then told you the wrong thing

### A decision that had already been made, in writing, for a good reason

The issue is one of the few that says outright that it is not a bug: *"a decision for
Shaul"* — vendor the source, wire offline resolution, or fetch over the network. It
has been sitting here as if it were still open.

It is not. `engine/src/lib.rs` has carried the answer since August, in a doc comment
that names this issue's own import as the reason it exists:

> `#import "@preview/meander:0.4.4"` failed with *file not found* until this existed

`typst-as-lib` offers `with_package_file_resolver` and it wants `ureq` or `reqwest`:
**it downloads.** The comment rejects that twice over — *"a compile that reaches the
network is a compile that can hang, and an editor that is 59ms after a keystroke
cannot have one in the path; and Ksav is meant to work on a plane."* So packages are
bundled in Typst's own `<root>/<ns>/<name>/<version>/` layout, built directly rather
than through `with_file_system_resolver` so that a document cannot reach anything
else on the disk through it.

**Option 2, chosen, with the reasoning attached, and `tests/packages.rs` holding it
in place.** The right thing to do with a decision recorded this well is read it
rather than re-litigate it.

So the remaining gap was not the decision. It was the *sentence*.

### The loader shipped, and left behind the exact wart the issue opened with

`#import "@preview/meander:0.4.4"` today produces:

> **A file (e.g. an image) wasn't found — check the path**

Wrong advice, and specifically wrong: somebody who imported `meander` is sent to hunt
for a missing image. The issue's headline complaint was *"file not found (searched at
typst.toml)"* — **the same misleading message, from the same source.** Building the
loader did not remove the thing the loader was opened for.

And the test that should have caught it asserted `is_err()`. Full stop. A missing
package that reports itself as a missing image, in a diagnostic layer whose entire
purpose is saying the useful thing, was a **passing test.** An error that is correct
and useless is not a passing test.

### Naming it, and the one thing Typst hands you for free

Typst reports the failure with the directory it searched:

```
file not found (searched at …/packages/preview/nothing-here/9.9.9/typst.toml)
```

That path **is** the answer. Three segments after `packages` and a manifest at the
end is a shape, not a wording, so keying on it cannot fire on a missing image and
survives Typst rewording its error. And because the searched path *names* the package
and version, the message can report the spec **as the writer wrote it** —
`@preview/meander:0.4.4` — which is the one string they can go and correct in their
source.

The second half of the sentence matters more than the first. Ksav bundles and never
downloads, deliberately, for the reasons above. So **"not found" must not read as
"try again" or "check your connection"** — it means *this one is not in the box*. The
message therefore lists what **is** in the box, read on the error path only, because
a writer told "`meander` is not here" still has to guess what is, and the answer is
one `read_dir` away.

`bundled_packages` renders specs as `@namespace:name:version` — which is *not* a
Typst spec, and is not pretending to be: it is a list of what is on disk, and the
`@preview:ksavtest:0.1.0` shape cannot be pasted into an import and should not be.

Three tests, all of which fail against the old sentence: the package is named, the
word *image* is **absent**, and a wrong version is reported as a wrong version —
a different sentence with a different fix, since there is no need to add a package
that already exists.

### Two of my own, again

- **An off-by-one in the shape I had just described.** Having written *"three segments
  after `packages` and a `typst.toml` at the end"*, I destructured **three** parts and
  then asked the **third** — the version — whether it ended in `typst.toml`. It never
  did, so `missing_package` returned `None` on every input and the branch was dead.
  The prose was right and the code was the thing I had actually reasoned about.
- **A `let … else` against the wrong type**, twice, on `file_name()` returning
  `OsString` and not `Option`. Guessing an API I had not looked up in the same breath
  as describing it.

The pattern is now familiar enough to be worth naming: I write the *argument* first
and the code second, and the argument is where the care is. When the two disagree the
argument is usually the one that is right — which means the fix is to go read the
type, not to adjust the claim.

Engine tests 1044 → 1047, binaries 74 (72 integration + lib unit + doc-test — and the
README's "74" was right all along; I had recorded a correction that was not needed).
Editor assertions unchanged at 7,849.

---

## 2026-09-28 · #72, #73 — the sandbox nobody wrote down, and the shelf that is empty

### The question I had flagged and never answered, answered by accident

Two questions came back at the end of the #67 work — *"the different blocks thing"* and
*"the ability to take typst libraries"*. While measuring the second I ran the
indentation probe I had flagged much earlier and never got to, and it is worth
recording because the answer is **yes, it works**:

    plain paragraph   x=499.56  w=24.85  right=524.41
    #ציטוט (quote)    x=487.56  w=24.85  right=512.41

Same string, so the 12pt is the inset and nothing else. And it moved the **right**
edge — the reading edge in Hebrew — which is the correct side. A block that indents
from the left under RTL is a real class of bug, and Ksav does not have it.

The first attempt at this probe was `#בלוק(לשון: "משנה", inset: (right: 1cm))`, and
the **typo sweep caught my own invented command** and answered with the legal list.
That is the fence from #5 working on me, unprompted, in a language I invented. Also
learned: the box is `תיבה` and the quote is `ציטוט`, and `#הזחה(2)[…]` is not its
signature.

One loose thread from that probe, **not** claimed as a finding: `#מקור` with the
same text came out at `right=523.69`, barely inside the margin, with a *narrower*
run (21.12 vs 24.85) — so it sets a smaller size, and its inset may be scaled to the
font or may be nearly absent. One data point with a confounded variable is not a
defect. Worth a probe, not worth a claim.

### A sefer cannot read the disk, and that was never a decision anyone made

Four ways a Typst document reaches a file, all measured here:

    #import "helper.typ"   refused
    #import "/etc/hostname" refused
    read("names.txt")      refused
    @preview/ksavtest      works      (#67)

**The document has no file system.** Images and user fonts arrive as bytes on the
request; everything else is `include_bytes!` in the binary.

That was the *right* call, and the reason is in `packages_root()`'s own comment: the
resolver is built directly rather than through `with_file_system_resolver` so that a
document cannot reach anything else on the disk through it. For one pasted snippet, a
total sandbox is correct.

The cost is that **a sefer is one file, forever.** No splitting a 40-chapter sefer,
no shared file for a recurring kuntres used 300 times, no `read()` of a list of
parshiyos, no personal `.typ` of house conventions. For Torah work that ceiling is
higher than the package question, and it had never been written down as a choice.

The proposal is not a new mechanism — it is `packages_root()` **a second time**:
give each sefer a read-only root. Sibling files import by relative path, a `packages/`
subdirectory is `@local` (Typst's own name for this, so nothing is invented), and
confinement survives. Filed as a **decision** rather than a task, because a sefer
stops being a path and becomes a tree, and that has consequences in autosave, in
`engine/src/git.rs`, in the absence of any file-tree UI, and in what happens to the
single-file sefarim that already exist. Not mine to pick. With the cheap half spelled
out too: **`@local` alone**, in the `app_data_dir()` that already holds the
dictionary, answers "can I bring my own library" for most of the value and touches no
editor, no autosave, no git.

### The shelf is empty, and the order matters more than the answer

#70 deferred `meander` and #67 then made it possible. So the blocker is no longer
technical — it is licensing, repository size, and one uncomfortable dependency
question: **page-breaking is the thing a typesetting app most needs to control**, and
delegating it to a package is how a bug becomes unfixable-in-place.

So #73 argues for measuring **#70 first**, and the argument is not caution, it is
that #70 decides whether a third-party threader is addressing our problem or
inheriting it. If Typst's own blocks do not thread cleanly across a page break, a
package built on them inherits that, and we would be importing a workaround for our
own first attempt. Vendoring first and measuring second pays the cost before knowing
the benefit — and #70's own text already says *"report the measurement, then decide."*

**#70 is the next piece of work, and it is one probe.** Two issues filed, both
decisions, neither actioned.

---

## 2026-09-28 · #70 measured — the artifact is not there, and three real things were

### The question was not merely unanswered. It was unanswerable.

#70 asks whether a breakable block draws an **empty border at the foot of page 1**.
To answer that, a probe needs to know where a fill *ends*.

It did not. `Fill` and `Stroke` carried `x` and `y` and no extent, and the reason
that is fatal rather than merely inconvenient is **the direction a box grows in**: a
fill that spans a page break *starts above* the last line of text and *ends below* it.
So the origin is the one property of such a fill that looks entirely correct, and the
empty band — the entire subject of the question — is exactly what the origin cannot
speak about. **An origin is not a shape.** `width`/`height` are now derived from
`Shape::geometry`: `Rect` size, `Line` endpoint difference, `Curve` reported as zero
rather than guessed.

### The result is the opposite of the forwarded claim

    13.9 (above first line) + 169.2 (six lines) + 22.9 (below last line) = 206.0 = the fill height

The background is **re-fitted to each page's own six lines**, not distributed from the
whole block's height. No empty band, no stray border, on any of the four pages. A
breakable block threads correctly across a page break in Typst 0.15.

That removes the strongest reason to vendor `meander` (#73): the argument for measuring
this first was precisely that a threader built on badly-threading blocks would inherit
the problem, and we would be importing a workaround for our own first attempt. They
thread cleanly.

### The control found the actual bug

`breakable: false`, same block, 24 lines: all on one page, `first_y=325.7`,
`last_y=1104.1` — **the sheet is 841.89pt tall.** The block's own fill ends at 530.1.
So about **18 of 24 lines are printed nowhere**, outside their own background, with no
error, no warning, no overflow diagnostic.

Filed as **#74**, and deliberately *not* as a defect Ksav has: `#תיבה` has no
`breakable: false` anywhere, which is exactly why it is worth filing now — **#65**
(berech) and **#43** (top/bottom streams) both *need* atomic blocks by design, and the
failure mode is silent content loss rather than a box that looks wrong. A defect found
before the feature that triggers it is worth much more than one found after.

### Two smaller things, both from the same afternoon

**#75** — Typst 0.15 dropped bare hex colour literals. `#block(fill: #eef3ff)` is
rejected with *"something's off near a #"*, and **the `#` is the one character that was
right**. Ksav's own surface is clean — all 167 `insert` strings use `rgb(...)`, zero
bare hexes — so nobody is handed a broken example; it is a writer's first attempt at
colour that gets confidently wrong advice.

**#76** — and this one is a gap in my own #15 work, four days old. The new clamp bounds
each margin against the sheet and never against *the other margin*, so `margin_cm: 11`
on A4 is accepted: `11 ≤ 28.7` on every edge, and the text area comes back **negative
width** (21.0 − 11 − 11 = −1.0cm). A `width: 100%` block in it laid out 28.3pt wide on
a 595.3pt sheet. It is #15's own sentence arriving by another door — *a load that falls
back to the defaults has silently un-chosen everything the person chose.*

### How the probe went wrong before it went right

`Iterator::max` needs `Ord` and `f64` has only `PartialOrd`, so the first version would
not compile; `probe::PagedDocument` is deliberately unnameable outside its module, so a
test helper would have needed an `unsafe transmute` to a type it cannot spell — spelled
out at each call site instead, with inference doing the work. And the extent came back
as **`w=-28.35`**: a right-to-left `width: 100%` box is emitted by Typst as a rect with
a *negative* `size.x` and the origin already moved to the other edge. An extent is a
magnitude; a negative one is a coordinate that has been asked a question about size.

Then a wrong turn worth recording: I "fixed" the cramped margins to 3cm, and 60 lines
rendered to `y=183.6` — nonsense, and I could not explain it inside a sensible budget.
Rather than keep iterating I reverted to the exact 11cm configuration the #70 numbers
came from, **so the fence and the report on the issue cannot drift apart.** A test that
passes under conditions nobody can reproduce is not a fence, and an unexplicable
measurement is not a measurement.

Engine tests 1047 → 1050, binaries 74 → 75. Clippy clean.

---

## 2026-09-28 · parallel streams already work, and a bug I did not file

### The question, and the answer that made the issue unnecessary

*"Is there a way to have that box without a different background colour, so it is more
like parallel streams?"*

**It already has no background colour.** `#תיבה`'s defaults are

    (מסגרת: 0.75pt + luma(150), מרווח: 12pt, רדיוס: 6pt, רוחב: 100%)

— a border, an inset, a radius and a width, and **no `גוון`**. And `גוון` *is* the fill
key: `_mk_block_knobs` is `("גוון", "קו", "מסגרת", "מרווח", "רדיוס", "רוחב", "יישור")`
and line 1196 is `if "גוון" in c { args.insert("fill", c.גוון) }`. So a `#תיבה` with no
`גוון` is a box with no `fill` argument at all, which is not the same as a box whose
fill was set to nothing — it is a box that never asked.

Measured, `fills` counted from the frame:

    #תיבה[פירוש]                        fills=0  strokes=1   x=424.8
    #תיבה(מסגרת: none)[פירוש]           fills=0  strokes=0   x=424.8
    #תיבה(מסגרת: none, מרווח: 0pt)[פירוש]  fills=0 strokes=0  x=436.8
    פירוש (no box at all)                fills=0  strokes=0   x=436.8

**The last two agree exactly.** A borderless, zero-inset `#תיבה` places its text
**identically to writing no box at all** — so the parallel-stream layout is one global
setting away and needs nothing built:

    #הגדרות_תיבה(מסגרת: none, מרווח: 0pt)

and the whole apparatus reads as a stream beside the source rather than a stack of
coloured cards. It also flows, which is the other half of why streams are the right
shape: a stream has no box to run off the foot of a page.

### A bug I nearly filed, and the reason I nearly filed it

`#אזהרה(גוון: none)` reported `fills=1`, and I read that as *"the tint is still drawn"* —
which is a bug, exactly the bug asked about, in exactly the place it would hurt. It is
not a bug:

    #אזהרה                 fills = ["#fef2f2", "#dc2626"]   tint + accent
    #אזהרה(גוון: none)     fills = ["#dc2626"]               tint gone
    #הצלחה(גוון: none)     fills = ["#16a34a"]               tint gone

The remaining fill is the **accent stripe**, and it is deliberate. I had measured a
count and read it as a background without asking *which* fill.

That is the same failure as #70's `last_text_y`: **a number that answers a different
question than the one being asked, read as though it answered yours.** Twice in one
afternoon, both times about a probe reporting something real that was not the thing
under discussion. The count was never wrong. The question was.

So no issue was filed, which is the correct outcome and would not have been had I
trusted the first reading. `#אזהרה`, `#הצלחה` and `#הערת_צד` all accept `גוון: none`
today, and the tint is the only thing standing between a writer and a stream.

### And the question I was asked twice and did not answer well

*"Why would we ever say not to split?"* — I answered as though #74 were a live hazard,
and the honest answer is **nothing in Ksav does, and the two proposals that might
(#65 berech, #43 top/bottom streams) may not either.** A stream does not need an atomic
block; if anything the wrap work wants the opposite. So #74 is **latent insurance**,
cheap to keep as a known trap and not worth engineering against until something asks
for it. The plan now says so, in those words, rather than dressing it up as a
correctness bug.

---

## 2026-09-28 · "anything, not just notes" — and two of my own corrections

### Columns work. I said they did not, twice, for the same reason.

`#טורים_בלוק(2)` and `#cols(2)` measured **identical** — 35 distinct x-origins, first at
295.2 — and with three columns, 23 origins at 295.2 / 390.8 / … So the page divides
into N columns of arbitrary content, and Ksav's wrapper is byte-identical to Typst's
own.

Before that I reported "nothing changed" and then "everything identical, probably the
sefer machinery". **Both were wrong, and for one reason: columns fill vertically first.**
I handed `#cols(2)` two lines of text, which fit in column 1, so there was nothing to
see. `#grid` *did* split on the same input — A at 459.0, B at 390.5 — because a grid
places by cell rather than by overflow, so it is the one that showed me my probe was
wrong.

That is the **fourth** time in two days that a probe answered faithfully and I read the
wrong thing off it: `last_text_y` that was the notes box, `fills=1` that was the accent
stripe, a `f64: Ord` that would not compile, and now a column that had nothing to
column. The counts were never wrong. **I kept asking the probe a different question from
the one I meant**, and the fix is always the same — work out what the thing *does*
before measuring whether it *works*.

### The user's question, and the real gap

*"This can be infinite, no? Not just for notes, but for anything you want to put inside.
You can break up the page no matter how."*

Mostly **already true**, and it is worth separating two things I had merged:

    divide a page into N columns of arbitrary content      ✅ measured
    content crossing column and page boundaries            ✅ measured
    anything placed BESIDE the source at body size          ✅ measured (#הערת_צד)
    named streams (הערה_זרם, הערות_בסום_צד)                present, unverified by me
    ADDRESSING — send *this* content to *that* stream       ❌ absent

**Typst 0.15 has no `Flow` element.** Every crate in the dependency set checked; the only
`Flow` in the registry is GTK's `flow_box` and a parser's AST node.

And that distinction is the whole answer. A column is a **region you fill in order**,
not an **address you send something to**. Once text is in `cols(2)`, the first thing to
arrive is in the first column. There is no way to say *"this lemma goes beside that
verse"* and have the rest of the page make room.

### The correction that matters, posted to #73

I wrote on #70 that the measurement "removed the strongest reason to vendor `meander`".
**That was too quick.** #70 measured whether a **block** splits across a page boundary
— one block, one boundary. It says nothing about **routing**, which is sending a chosen
piece of content into a chosen channel while everything else reflows around it. I
collapsed two capabilities into one sentence, and #70 only ever spoke to the first.

So the original *note-spill* framing was right that #70 helps — a spilling note is just a
block that breaks, and blocks break cleanly. But **the framing was too narrow, and it
made the case look weaker than it is.** The real capability is: put a lemma, a figure, a
summary, a translation, a proof into a named stream beside the source, and have the page
reflow. For a sefer that is the difference between *notes in a box* and *an apparatus
that is part of the page*.

Caveat stated in the issue rather than glossed: **I cannot verify what `meander` does.**
It is not bundled and I have not read it. Everything above about Ksav and Typst is
measured; the claim that `meander` supplies this routing comes from its description in
#73 and is not verified. Vendoring is also **reversible** — #67's resolver reads a
directory, so removing the directory removes the capability with no code change.

---

## 2026-09-28 · rendered it, looked at it, and the answer is no

### Asking the question by looking instead of by counting

*"…should work for two rows on each page, flowing into that row on the next page, no?"*

I had been answering this with y-coordinates, which is the wrong instrument for a
question about the *shape* of a page. `examples/svgdump.rs` only emits page 1, so it
could not show this at all — the answer lives on page 2. So `examples/render-pages.rs`
now emits every page as SVG, and I converted them with `pdftoppm`/`magick` and **read
the images**.

The document: two 400-line streams, A (`אורייתא`) and B (`פירוש`), in
`#grid(rows: 2, columns: 1, [A], [B])`.

**Page 1:** entirely A.
**Page 2:** A down to line 399, and then **B starts at the bottom of the same page**,
running on into pages 3 and 4.

So it is **one flow**. Cell 1, then cell 2, in reading order, across page boundaries.
`grid(rows: 2)` divides a single stream into two bands; it does not create two streams,
and the second band does not resume in the same band on the next page.

### The distinction, now with a picture behind it

- **works:** `#cols(n)` — divide a page into n bands that **one** flow fills in reading
  order. Measured at 2, 3, 6, 8 and 12, text intact in every case.
- **does not work:** n **independent** flows, each continuing into the same band of the
  next page. That is what was asked for. It is not what a grid or a `cols` does.

And it is not a matter of finding the right Typst incantation. **Typst 0.15 has no
`Flow` element** — every crate in the dependency set checked; the only `Flow` in the
registry is GTK's `flow_box` and a parser's AST node. A column is a *region you fill in
order*; what is wanted is an *address you send content to*, and nothing in the language
has one.

**So this is the concrete case for #73, and it is the first one that is not a guess.** The
earlier arguments were note-spill and "routing", both of which could be dismissed as
speculative. This one is a rendered page saying no. `meander`'s description in #73 —
*page layout with text threading* — is exactly this feature, and it is still unverified
because it is not bundled.

Vendoring it remains reversible: #67's resolver reads a directory, and deleting the
directory removes the capability with no code change. And the measurement is now
reproducible by anyone:

    cargo run --example render-pages -- doc.typ out/ 3

---

## 2026-09-28 · #76 — a gap in my own work, and a wrong report about it

### I measured a path the application does not have

Filed #76 saying `margin_cm: 11` is "accepted silently" on A4. **It is not.** Through
`from_json` it is clamped to 7.0, a refusal is recorded, and a diagnostic is emitted:

    {"margin_cm": 11.0} → margin_cm = 7.0, refusal "margin_cm: 11→7"

The reason is the fifth instance of one habit: **I set `cfg.margin_cm` in Rust**, so
`from_json` — the thing the issue is about — never ran. I built a probe that bypassed
the code under discussion and reported its result as the code's behaviour.

The finding survived; the evidence was mine, not the code's. Corrected on the issue
before touching it, because a defect filed on invented evidence is worse than no issue.

### Two defects, and one of them is a regression of #15

**The pair.** `margin_inner_cm: 20, margin_outer_cm: 20` is 20 ≤ 20 on *each* edge, so
both are accepted with no refusal, and A4 hands back a text region **19cm wider than the
sheet**. Real, and exactly as filed.

**The constant that survived.** `margin_cm` was `0.0..7.0`, commented *"half of the short
side of A5"*. And 7 is the A5 **instance of a rule that is right on every sheet**: a
uniform margin lands on both edges of each axis, so the bound is `2m ≤ short_side − 1`.
That is 6.9cm on A5, **10.0cm on A4**, 14.35 on A3.

So **#15 replaced the hardcoded 7 with the sheet on the per-edge path and left the
constant standing on the uniform path** — the one almost every document takes, since
four absent edges mean "use `margin_cm`". A4 was still refusing a 9cm margin that it
holds comfortably. The generalisation was right and applied to half the settings, and
it *could not* have been fixed in place: the line ran before the page size was read, so
the sheet was not known yet. **A bound that depends on the sheet must be evaluated after
the sheet is known** — which is the entire lesson of #15, learned by breaking it.

Both fixed. `margin_cm: 9` on A4 is now accepted; `margin_cm: 12` is refused to 10.00
and says so.

### The rule for a pair, and the fence that caught me being wrong about it

**A value the writer did not set is never the one moved.** An absent edge is standing in
for `margin_cm`, which is a default, and reducing a default is the app un-choosing on
the writer's behalf — the sentence `settings.ts` already says and #15 exists to fix.
So with one edge set, that edge gives way; with both set, something has to be chosen.

My first choice was **the second edge**, and it was wrong in a way the *pre-existing*
fence caught immediately. `inner 13, outer 0` on a 10.5cm sheet is over by 3.5cm, so
"the second" clamped `outer` to 0 — where it already was — and left `inner` at 13. The
pair was still 4.5cm too wide and the document laid out anyway. **The invariant held for
every case I had invented and failed for the one I had not.**

**The larger margin gives way.** The other edge is then the smaller by construction, so
`allowance − other` is never negative and the pair sums to exactly the allowance. A tie
goes to the second, so the choice is total.

That test also had to change, and its change is the real content: it had been leaving
the opposite edge absent, which meant the 2.5cm default was silently in the way, and it
was **passing a 13cm top margin that had no room to exist**. Now that a pair is checked,
an absent edge is a real margin — so the comparison has to say what is opposite it.

Six new tests, and one of them states the invariant once, over a sheet per case, so a
later change to the rule cannot pass by making the refusal quieter.

Engine tests 1050 → 1055, binaries 75. Editor assertions 7,849 — and the documentation
fence caught the stale count before I looked for it, which is what it is for.

---

## 2026-09-28 · #75 — the `#` was the character that was right

### The message told a correct character it was wrong

Typst 0.15 dropped the bare hex colour literal, so `#eef3ff` fails with *"the character
`#` is not valid in code"*. The translation answered it with the sentence for a missing
space, an unclosed bracket, or a literal hash in prose. The writer has typed the obvious
thing for twenty years and been told they have mistyped it.

**The line had to be consulted, because the raw error cannot tell the two apart.** A
removed colour and a genuine stray `#` produce byte-identical Typst text. So `rephrase`
now takes the offending line and looks for a `#` followed by 3, 4, 6 or 8 hex digits.
A `#` before Hebrew, a space or a bracket is a real syntax error and still gets the real
sentence — which is the half that keeps the fix honest, and the half that would be
easiest to break by accident.

### Two things I got wrong inside the fix

**The helper never fired.** I wrote it as "try 8, then 6, then 4, then 3, give up after
the first fails". For `#eef3ff` the 8-character window is `eef3ff)[`, which is not all
hex digits, so the helper failed on 8, **broke**, and never tried 6. Taken as the
maximal hex run and then checked against the legal lengths, it is right immediately.
The lesson is the one I keep re-learning and should stop re-discovering: *a loop that
gives up on the first attempt is a loop that only ever tests the first case.*

**A false positive that looked like a success.** `#1234zz` has a hex run of 4, so it
matched, and the message said *"write `rgb("#1234")`"* — advice that **cannot work**,
because `rgb("#1234zz")` is not a colour either. The run is a colour only if the token
is *delimited*: nothing alphanumeric or `_` may follow it. With that, `#eef3ff)` and
`#eef3ff\n` match and `#1234zz` and `#eef3ff_x` do not.

### One mistake is one message

`#block(fill: #eef3ff)` produced **two** errors: the real one, and then *"there is a
comma missing between two arguments"* — the parser recovering from the first and
blaming the punctuation around the hole it left. That second one is advice a writer can
act on and cannot fix, and it arrives *after* the sentence that already explains
everything, so it reads as a second problem where there is one.

Suppressed, tested on Typst's **raw** text rather than our translated message (`expected
comma` is the engine's wording and is not translated), and only for a comma on a line
that already reported a colour — so a genuine missing comma on a line that happens to
contain a colour survives.

### Gates

Six tests. Two of them are about what must **not** fire, which is the honest half: a
stray `#` still gets the syntax sentence, a hex run inside a word is not a colour, and a
colour on line 1 is not blamed for an error on line 2 — that last one needed a helper
that filters diagnostics *by line*, because several tests here are about not blaming the
wrong line.

Engine tests 1055 → 1061, binaries 75. Editor assertions 7,849.

---

## 2026-09-28 · #74 — an unsplittable block, reported rather than obeyed

### The failure was always going to be silence

`breakable: false` on a block taller than the text area is a legitimate request that
cannot be granted. The measured result was the worst kind of failure: 24 lines to
`y=1104.1` on an 841.89pt sheet, the block's own fill ending at 530.1, so **about 18
lines rendered below the bottom of the page**, outside their own background, with the
document compiling and nothing reported at all.

**The content still goes off the sheet.** Nothing was changed about the layout,
deliberately: the honest answer to a request that cannot be granted is to say so, and
moving the content silently would be the same defect one layer down — a page that is
not what the writer asked for, arriving without a sentence. So the fix is a sentence.

### The threshold is the page, and that is the whole design

A layout audit wants to compare content against *somewhere*, and the obvious place is
the text area. **That would have been a defect on every document with a running head or
a folio**, because both live in the margins quite legally. Comparing against the
**page** removes the ambiguity entirely: *a folio cannot be below the bottom of the
page*. Off the sheet means off the sheet, and nothing else means that, so no
header/footer bookkeeping is needed and none can rot.

The second question is whether the writer asked for this, because a document with no
`breakable: false` cannot reach the state. So the audit scans the writer's own text —
not the 75KB of prelude in front of it — and an ordinary document pays one pass over
its lines and nothing else. A scan rather than a parse, and the report names the line,
which is the one thing the writer can change.

Measured: 285pt of a block reported as not printed at all, naming line 1. The same
content splittable: silent. An unsplittable block that comfortably fits: silent. A
document with no unsplittable block: no diagnostics at all.

### The fence changed shape, which is what it asked for

`an_unbreakable_oversized_block_overflows_off_the_sheet_silently` asserted only that the
overflow *happened*, and its own comment said to rewrite it when the fix landed —
because it would have kept passing after the audit was added and proved nothing about
it. It now asserts **both** halves: the content still goes off the sheet, *and* the
document says so. And the report is checked **through `compile`**, not by calling the
audit directly, because the hook into the success path is half of what was fixed.

The other two new tests are about what must **not** fire. A warning on every long
block is a warning nobody reads, and an unsplittable block that fits is a legal request
so silence is the correct answer rather than an omission.

Engine tests 1061 → 1063, binaries 75. Editor assertions 7,849.

---

## 2026-09-28 · #77 — the decision was to build it, and it turns out it is built

### "Lets build the possibility. the user should be able to do it if he wants."

So #77 stopped being a question. The shape is now construction, and the measurements
already settled three things about it: Typst 0.15 has no `Flow` element so this is
Ksav's work; `#grid`/`#cols` are one flow filling regions in order so a compositor over
one flow cannot do it; and Ksav already compiles one source into two documents with the
boundary coming for free.

The construction I had in mind: **each stream is laid out as its own document whose page
*is the band*, and the per-stream pages are zipped onto sheets by index.** The appeal is
that the requirement — *a flow continues into the same position on the next page* — is
not something a page-breaking algorithm has to achieve. Stream A laid out alone produces
A/1, A/2, A/3 as ordinary pages; the zip puts A/2 in A's band on sheet 2. Nothing is
threaded, so nothing can mis-thread.

`examples/streams.rs` does it. Three streams, six band-pages, rendered and looked at:
`מקור` exhausted so its band is nearly empty while `פירוש` and `מערה` both continue, in
the bands they held on the previous sheet. The cost is real and printed rather than
assumed: **N streams is N layouts of the same source**, and this is a 59ms editor.

### And then I read Ksav's own prelude instead of only Typst's

```typst
#הגדרות_זרמים(זרמים: ("תוכן", "מקורות"), פריסה: "צד")
```

**`פריסה: "צד"` is side by side, a column per stream**, and the same command carries
`טורים` — a per-stream column count. Measured, two streams of 60 notes each, across
seven pages:

    p1  תוכן x=509.4   מקורות x=263.4
    p2  תוכן x=507.3   מקורות x=261.2
    p3  תוכן x=506.9   מקורות x=260.9
    ...
    p7  תוכן x=506.8   מקורות x=260.8

**Each stream keeps its column on every page and its content flows continuously through
it.** That is #77's requirement, measured and working, in the product today.

### The same mistake, for the seventh time, and the largest one yet

I measured **Typst** — `#grid`, `#cols`, the absence of a `Flow` element — and concluded
"not possible, this is Ksav's work". **I never opened `הגדרות_זרמים`.** The conclusion
was true of Typst and irrelevant to Ksav, and the gap between the two is the entire
product.

#76 I measured a Rust field instead of `from_json`. This time I measured the language
underneath instead of the product above it. Both times the number was right and the
question was mine. **The two failures are the same failure**: reaching for the thing that
is easy to measure instead of the thing the question is about.

### What the build actually is now

Already there: named streams, side-by-side placement, a column per stream, per-stream
column counts, numbering and headings, and each stream holding its band on every page.

Genuinely open, and small: **arbitrary content** in a stream — `הערה_זרם` is a *note*
command, and the original question said *not just notes* — and **where the streams
live**, since the apparatus is the read-only footer and the question is whether a stream
can occupy the page body.

Both are extensions of an existing apparatus with an existing vocabulary. That is the
difference between a feature and a competitor.

The probe stays as evidence and **must not become a second mechanism**: two ways to do
one thing is how a product grows a setting nobody can find. It also caught its own bug —
the first render clipped every band on the right edge, because `probe::layout_plain`
takes no config and laid each stream out at A4 before cropping. The numbers said three
streams of one page each; the picture said the bands were the wrong shape.

---

## 2026-09-28 · #63 — the exponential is real, and the proposed fix would not have helped

### The mechanism, and why the cycle guard does not catch it

A diamond reduced to its simplest form: the same part included twice. `expand_into` only
guards against a name **already open on the stack**, and the first inclusion is pushed
**and popped** before the second is looked at — so the name is not on the stack either
time, and the guard has nothing to say. What is left is `MAX_DEPTH = 8`.

### Two fixtures that measured the wrong thing, faithfully

    depth 8, leaf 20 lines   → 256 lines   (looked like 2^8 = 256 copies)

**That 256 was the cap, not the growth.** `MAX_DEPTH` refuses before the leaf is
reached, so depth 8 never got there. Only when the leaf was given its own name — and
the chain shortened by one — did the real shape appear:

    depth 4 → 16    depth 5 → 32    depth 6 → 64    depth 7 → 128    depth 8 → capped

And the first fixture was worse: it used `p{depth-1}` for the leaf, which the
construction loop then **overwrote with a self-include**, so the cycle guard fired
correctly and the output was 256 marker lines whatever the leaf's size — which is
exactly why depth 8 "looked" like the growth. The numbers were true. The questions were
mine, for the eighth time, and the second one is a new shape of it: **I used the
recursion's own guard as if it were the thing under test.**

### The cost at the ceiling

One 200KB part included 128 times:

    leaf lines      copies   output lines      time
         20           128           2,560        5ms
        200           128          25,600       22ms
      2,000           128         256,000      355ms
     20,000           128       2,560,000    1,532ms
    200,000           128      25,600,000   15,901ms

**Sixteen seconds and twenty-five million lines, from a document that compiled.** No
error, no warning, nothing refused.

### Memoizing would not have fixed it, and that is the finding

The issue proposes *"memoize per name"*, and it is a genuine inefficiency: 128 inclusions
re-walk the part 128 times. But the cost is not 128× *work*, it is 128× **content**, and
the content has to be there — the writer wrote `#כלול("x")` 128 times and the expanded
document is supposed to contain 128 copies. `Expanded::text` is a flat string. Memoizing
the expansion saves the re-walk, roughly a constant factor, and cannot touch it.

**The exponential is real but it is not the hazard. The hazard is that nothing bounds
the total**, and the bound that exists is a proxy that fell out of the recursion rather
than a budget anybody chose. So the fix is a **total-size budget with a diagnostic**, in
the shape `reserve_overflow: "refuse"` already uses.

The remaining question is **policy, and it is a product call**: proportional or total, and
refuse or warn. The engine has both vocabularies — a refusal from #15 is a warning that
lays the document out, `reserve_overflow: "refuse"` stops the compile — and my
recommendation is **a proportional budget that refuses**, because the failure is not a
wrong page but a document that cannot be laid out at all. Posted on the issue rather than
assumed.

And the second half of the issue, `line_of` ambiguity, is **already documented and is not
a defect**: a file and a line is genuinely ambiguous when a chapter is pulled in twice, and
first-in-reading-order is the only honest answer available. The comment says so.

---

## 2026-09-28 · #63 — a budget in two limits, and one lesson I nearly repeated

### What the measurement said, and what the issue proposed

The exponential is real and the cycle guard cannot see it: the guard refuses a name
**already open on the stack**, and the first inclusion is pushed *and popped* before the
second is looked at. So the same part, included twice, expands twice, and a chain of them
doubles at every level. `MAX_DEPTH = 8` bounds it at 2^8 copies — and that bound is a
*proxy that fell out of the recursion*, not a budget anyone chose.

**Memoizing per name was the wrong fix**, and saying so is most of this entry. The cost is
not 128× the *work*, it is 128× the **content**: the writer asked for 128 copies, so the
flat `Expanded::text` has to hold 128 copies. Memoizing saves the re-walk — a constant
factor. What was missing was that nothing bounded the total: one 200KB part included 128
times measured **25.6M lines in 15.9 seconds**, silently.

### Two limits, because they answer different questions

`max_lines_warn` (100,000) **reports and still lays out** — the copies are correct, so the
document is still the one the writer asked for. `max_lines_refuse` (500,000) **stops the
walk at the limit**, measured at exactly 500,000. Past a point there is nothing left to
warn about: 25.6M lines is not a slow page, it is a document that cannot be laid out.

Both are settings, per Shaul's decision, and both go through `clamped` so an out-of-range
value is *reported* like every other number — a cap nobody was told about is a cap that did
not happen. The pair is made coherent: a document asking to be refused earlier than it is
warned about has asked two contradictory things, and the soft limit is the one anybody
reads.

Defaults from the measured table: a chumash is ~30,000 lines and a Vilna Shas ~500,000,
and 500,000 lays out in roughly a third of a second — which is the number that matters for
a 59ms editor.

### Two things I got wrong inside the fix, both caught by looking

**`out.text.lines().count()` in the walk loop is O(n) per line**, which makes the whole
walk O(n²) — a budget that quadrupled its own cost would be a wonderful joke, and the walk
is the thing the budget exists to keep affordable. `origins.len()` is the same number and
is O(1); the `debug_assert_eq!` in `push_line` already says they agree.

**A depth-9 diamond produced ~300 identical "nested too deeply" messages.** Pre-existing,
not mine, and not small: the refusal was pushed once per inclusion path and nothing
deduplicated it. A writer scrolling a list that says the same thing three hundred times
learns nothing and scrolls past the one that mattered. Now each named refusal is said
once, and the test fences the *count*.

### What I did not land, on purpose

The settings-dialog rows for the two numbers. The keys and the type are in and
`enginefacts` is green — that fence is the one that says *"a document falls back to the
engine's defaults, field for field"*, and it caught the new fields immediately, which is
exactly what it is for. But adding the two `numberRow`s and their labels turned
`browserlang`'s residue fence red, and **I would not land a red suite to save a dialog
row.**

Checked before concluding that: on a **clean tree**, with every one of my changes stashed,
`browserlang` fails the same two assertions. So they are pre-existing — `registriesGaveUp`
and `retrySave` stand in Hebrew without being in the recorded `RESIDUE` list, **and both
have English values in the catalogue**, which means something is rendering them Hebrew
rather than that they are legitimate residue. Not diagnosed, and **not added to the list to
make the fence green** — that would be the exact move #71 was closed for.

Engine tests 1063 → 1069, binaries 75, clippy clean. Editor 7,849, all green — the
`browserlang` fence turned out to be a real bug and is fixed below.

---

## 2026-09-28 · #81 — the red fence was right, and I nearly "fixed" it the wrong way

### A red fence I could not paper over

Adding the two settings rows turned `browserlang` red over `registriesGaveUp` and
`retrySave`. The tempting fix is to add both to the test's `RESIDUE` list — and **that is
the exact move #71 was closed for**, because `RESIDUE` is a *reviewed* list of strings
that are legitimately Hebrew, and these two assertions fail precisely because **neither
of them is**: both keys have English values in `i18n.ts`.

So I went looking instead, and the cause is real and simple. `showChromeNotice` resolved
its strings **at call time** and appended the result; nothing re-renders the banner when
the language changes. A notice born in Hebrew stayed Hebrew for as long as the problem
lasted — and a registry failure lasts the session. Same bug in `reportSaveFailure`'s
button.

### The fix that is right, and what it rules out

I applied the pattern `panels.ts` already uses for headings: pass the **key**, set
`data-i18n`, guard with `hasKey` — which exists for exactly this, *"a call site passed the
answer where the question belonged"*. `NoticeAct` grew a `key`; the call sites now pass
`"registriesGaveUp"` and `key: "retrySave"`.

**It did not turn the fence green**, and that is the finding. The attribute is right, so
the sweep must not reach the notice host — the banner is appended outside whatever
subtree `localise()` walks. So the remaining work is the *scope*, and filed as **#81** with
the two options: widen the sweep, or re-run it over notices appended at runtime — which is
the better one, because a notice can be raised *after* a switch too.

### And the fence is a boot-order hostage, which I proved by accident

The suite came back **7,851/0 failed** and then **7,849/2 failed** on identical code, in
alternating runs. The test's own comment explains it: the registries failing to load is a
boot race, so the visible set changes. **Any single run of `browserlang` is not evidence of
whether it is green**, and I was one step from believing a green run and calling it fixed.
That is now in #81 and in the plan, because the next person will otherwise trust a run.

### And the settings rows went in

With the residue keys understood rather than silenced, the two `numberRow`s and their two
labels went in and the suite is where it was: 7,851 assertions, 0 failed.

---

## 2026-09-30 · #81 — the fix works, and it was never the sweep that was missing

### What I went looking for

Three issues in the plan turned out to be decisions rather than tasks — #72, #80,
#73 — and I deferred each with a note on the issue. #81 was next, and it was
marked `[~]`: half committed, one identified gap, *"the attribute is right and the
language sweep does not reach the notice host"*.

So the first thing to do was check that claim rather than build on it.

### The claim is false, and here is the window

Driven in Chromium against `dist/`, at four points during boot and once after a
switch:

```
boot   #notices inside document.body                        true
  0s   data-i18n="registriesFailed"    Hebrew sentence
  2.5s  data-i18n="registriesGaveUp"    Hebrew sentence
       data-i18n="retrySave"            נסה שוב
switch
       data-i18n="registriesGaveUp"    "The command list did not load — the
                                         toolbar and menus will stay empty.
                                         Reload the page."
       data-i18n="retrySave"            "Try again"
```

The sweep reaches the notice host. `noticeHost()` appends to `#app`, `localise()`
defaults to `document`, and `rerenderChrome()` calls it on the toggle. The fix in
`7e14220` is correct and complete.

### So why was the fence red?

Not a boot-order race, which is what the previous entry concluded after the first
conclusion was wrong. `browserlang.test.mjs` serves `dist/`, and:

- `dist/` is git-ignored;
- `gate.mjs`'s `editor` check runs `node test/run.mjs` and **does not build it**;
- the CI app job runs `node tools/gate.mjs editor` and *then* `npx vite build`.

So in CI the file always skips, the gap is invisible, and on a machine with a
local `dist/` the one test in the repository that opens a real window can be
served **any build from the past** and reports on it in the present tense.

Measured: `dist/` was built 2026-09-28 04:42. Commit `7e14220` landed
2026-09-29 13:22. The fence was red about a fix it had never seen.

Two conclusions were recorded on the strength of it — *"the sweep does not reach
the notice host"*, then *"the fence is a boot-order hostage"*. Both are false,
and the second one is worse than the first: it taught the next reader that a
single run is not evidence, which was a true statement with a false reason, and
therefore no reason at all.

### The fence was real after all

Deleting the two `data-i18n` attributes and rebuilding:

```
FAIL no catalogue key stands in Hebrew that this file has not recorded
  got  ["registriesGaveUp","retrySave"]
FAIL the recorded set is a superset of what is standing (3 of 2)
✗ browserlang.test.mjs     11 passed, 2 FAILED      — four runs out of four
```

Unmutated, against a correct build: **13 passed, six runs out of six.** The fence
was never the problem. It was answering correctly about the wrong build.

### The fix, and what it is not

`assertFreshBuild()` compares newest-of-`src/` against newest-of-`dist/` and
**refuses**. Red, with both timestamps and the one command — not a skip, because
the two are different sentences: *"this machine cannot run this test"* is a
complaint about the machine and the file already says so; *"`dist/` is a day old"*
is the test about to report a confident fictional finding. A skip would have been
the same silence with a friendlier sign.

Newest-of-each on both sides, because `vite` writes many chunks and `src/` is
many files. And `src/` against `dist/`, not against `test/`, so fixing a wrong
test does not make the build stale and does not go red for no reason.

Fenced from both ends in `visibility.test.mjs`, next to the acceptance script's
`assertFresh`, which has fenced this exact class for the server binary since it
was written. Four mutations, all caught:

| mutation | caught by |
|---|---|
| guard renamed away | 3 assertions red |
| refusal downgraded to a skip | 1 |
| call moved **after** `await browser()` | 1 |
| fresh path returns `undefined` again | 1 |

Two of those are worth recording rather than counting.

**The fourth was mine, and it is the oldest bug in this file's genre.** The guard
ended with a bare `return` on the fresh path; the call site read the answer as a
boolean, so a *fresh* `dist/` was indistinguishable from a refusal and the file
skipped itself on every run, printing nothing. `run.mjs`'s "asserted nothing"
check is what caught it — that check earning its keep twice — and the fence now
asserts the `true` is there, because a bare `return` is the spelling that
reproduces it.

**The third is a fence I wrote that could not fail.** I asserted the guard ran
before the browser with `indexOf("assertFreshBuild()") < indexOf("await
browser()")`, and it stayed green when I moved the call to *after* `await
browser()` — because `indexOf` found the **declaration**, `function
assertFreshBuild()` at line 120, which is always before anything. A positional
fence written over source finds the first spelling of a name, and a name has two
spellings. This is the same trap twenty lines above in the same file, about a
fixed lookahead matching whatever happens to be nearby, and I walked into it
while adding a fence twenty lines below it. `!assertFreshBuild()` is only ever
written at the call, so it is the call.

### Also fixed, and it was landing red before I started

The documentation fence was **already failing on a clean tree**: `SESSION_LOG.md`
said "7,851 assertions", the backward sweep read it as a claim about today, and
#81 landed with a red suite. Confirmed by stashing everything of mine.

The two honest-looking fixes are both wrong. Rewriting the number destroys the
record; dropping the sentence does too. **The instrument was wrong, not the
log.** `LOGS` exempted `decisions/` and `lamdan/`, both directories whose files
carry a date **in their name**, and `SESSION_LOG.md` is thirty-two days in one
file with the dates in its **headings** — the same lifecycle, held differently,
which the exemption could not express.

So `logDate` learned to read a body: a dated `## …` heading, newest wins. And
`SESSION_LOG.md` joined `LOGS` with the reason stated. Three mutations, all
caught: dropping it from `LOGS` (the exemption stops excusing anything real),
disabling the body branch (it stops being a dated record), and widening the
exemption to `docs/start-here.md` — which fails three ways, including the
pre-existing *"no exemption reaches a page that is documentation"*.

This is the sweep working as designed, one level up: the same check that caught
`decisions/` being extended to reach a living page is what makes adding a record
here cost something. An exemption that buys nothing is refused.

### Three issues deferred, with the measurement attached

Not "no time" — each one is a decision, and each comment says what was measured.

- **#72**, `app_data_dir()` for `@local`. The cheap half is blocked on a seam that
  does not exist: `packages_root()` is the engine's only root and it is hardcoded,
  and the shell's only two references to the engine are `services::find` and
  `(svc.call)(&input)` — **the compile channel is `(name, String)`**, no path, no
  `AppHandle`. So it needs a new process-global in the place this repository has
  deliberately never had one, and whether that root is set by the app at startup or
  arrives on the request is the difference between a feature and the sandbox
  gone. One measured trap recorded either way: `diagnostics::missing_package()`
  recovers `@ns/name:version` by splitting on the literal `"packages/"`, and a
  user root not so named degrades the message back to *"a file (e.g. an image)
  wasn't found"* — the wart #67 closed.
- **#80**, reledmac/reledpar. The forwarded "Bug C" is **already built** —
  `footnote_streams`, `ksav/engine/src/lib.rs:4650`, two registers side by side
  with independent per-stream numbering, fenced to converge. So the residue is
  exactly two features: line numbers (nothing in the prelude) and lemmata
  (`rg -i lemmat` returns one hit, and it is `PLAN.md`). I would do #73 first.
- **#73**, bundling `meander`. Its own precondition is discharged — #70 measured
  that a breakable Typst block threads cleanly — but reading `meander` means
  vendoring it, which is a licence and a permanent weight with a name on it. I
  offered the reversible half: the resolver reads a directory, so removing the
  directory removes the capability with no code change.

### State at log write

| item | state |
|---|---|
| #81 | fixed — `assertFreshBuild()`, fenced from both ends, 4/4 mutations caught |
| pre-existing red | fixed — `SESSION_LOG.md` exempted as a record, 3/3 mutations caught |
| #72, #80, #73 | deferred, with a measured comment on each |
| #82 | not started |

Editor **7,849 → 7,858** across 112 files, all green. Engine untouched (1,069
tests, 75 binaries). `tsc --noEmit` clean.

### Next move

#82 — `Expanded::lines_of`, with `line_of` fenced as its first element.

---

## 2026-09-30 · #82 — the engine half is built, and the product half has no site at all

### What the issue asked for, in two halves

`Expanded::lines_of`, and a second gesture that offers every place a part appears
instead of only the first. The first is a clear task. The second is not, and
finding out why is the substance of this entry.

### `lines_of`, and the invariant made structural

```rust
fn matching<'a>(&'a self, file: Option<&'a str>, line: usize)
    -> impl Iterator<Item = usize> + 'a
```

Both `line_of` and `lines_of` are built from it. The issue asked for "`line_of`
fenced as its first element so the two cannot drift" — and a fence is a promise
that somebody will keep checking. Making them share one predicate **removes the
possibility** rather than watching for it, which is strictly better, and the
fence is still there in `tests/includes.rs` for the reason the house has
recorded about fences that check what the compiler already guarantees: a thing
true by construction today can be true by accident tomorrow, and what is worth
holding is the *sentence* — **first is reading order** — not the identity.

`line_of` stays lazy (`.next()`, not `lines_of(..).into_iter().next()`). It is on
the reveal path, and it is overwhelmingly the first match that answers, so the
lazy form allocates nothing per keystroke. Measured: it has exactly one caller,
`jump.rs:285`.

### Why the product half cannot be built, and it is not a matter of effort

I went looking for the site and it is not there.

- `BodySpot` is `{line, column}` — **`api.ts:670`, no `file` field.**
- `reveal_request` reads `file` off the request (`jump.rs:283`) — and the app
  never sends it, because there is nowhere to send it from.
- So `lines_of` is reached with `file: None`, and a **main-body line maps to
  exactly one expanded line**. The list is always length one.

There is no ambiguity to offer a list of, because the app cannot address a place
inside a part *at all*. The ambiguity #82 describes needs the writer to be
standing in `perek-3` line 2, and the only document the editor holds is the one
in front of it. This is #72's *"the app has no file tree and a part is not an
addressable thing"*, arriving from the other direction.

Left open, deliberately, and the order is written down: **#83, then #72's
decision, then this.**

### #83, found while looking, and it is the worse half

Click a word on the page that came from an included chapter and the caret lands
at that line number **in the parent**. Not ambiguous — simply wrong, and with no
hint that it is wrong.

The engine is right. `jump.rs:262` returns `{line, column, file}`, and
`tests/includes.rs` fences it for diagnostics (`a_mistake_in_a_chapter_is_
reported_at_that_chapters_line`, asserting `file == "פרק ב"` and `line == 2`,
*"not the assembled line 4"*).

The file is lost **at the wire reader**, `api.ts:1126`:

```ts
function readSpot(v: unknown): BodySpot | null {
  const o = v as { line?: unknown; column?: unknown } | null;
  …
  return { line: o.line, column: … };
}
```

So `rg "spot\." src/main.ts` returns `spot?.line` and `spot?.column` and nothing
else — not because `main.ts` ignores the file, but because it was never in `spot`.

Two things make this worse than a plain omission:

**`Located` (`api.ts:704`) declares `file` and is imported nowhere.** `rg
"Located" app/src` returns the declaration and nothing else, so the type that was
written to say the file *is not decoration* is not decoration and not anything —
it is dead.

**`wire.test.mjs` cannot see it.** That fence reads the engine's `json!` literals
and asks whether *an interface declares* each key. `Located` does declare `file`,
so it passes. The failure is a **reader narrowing a response**, and that is the
direction the fence does not run in. A declared key is not a read key, and the
repository has a fence for the first and not the second.

And the fix is already written, ten lines away, for the sibling case.
`diagview.ts:74` does `const fromPart = !!d.file`;
`diagview.ts:100` refuses to underline a chapter's line in the parent (*"would
mark an innocent line"*); `diagview.ts:276` dispatches

```ts
file ? goToPart(file, line, column) : goToLine(line, column)
```

and `onGoToPart` (`main.ts:14847`) **opens the chapter and jumps to the line**.

So the app knows exactly how to get inside a part, uses it for every diagnostic,
and does not use it for the one gesture the setting is named after
(`settings.clickToSource`). #83 also does not wait for #82: the ambiguity needs a
part included **twice**; this happens the first time one is included **once**.

### Fences

`tests/includes.rs`, four tests. The one that matters is
`line_of_is_the_first_of_lines_of_and_they_cannot_drift`, which sweeps every
`(file, line)` in the document and asserts `line_of == lines_of.first()`, plus
the counts the sweep cannot pin — the part is in twice, the main body once each,
four positions for the part's two lines.

`a_document_with_nothing_included_answers_for_the_whole_body` is the one I would
have forgotten: `origins` is empty on the fast path, `line_of` answered `None`
there before `lines_of` existed, and the new method had to agree rather than
invent an answer for a document nothing was included into.

Two of my own errors, both caught before they landed:

- the first `twice()` fixture had a stray `\בין` where a newline belonged, and an
  assertion that every match has length 2 — **false for the main body**, which is
  once each. The sweep would have gone red on the fixture, not on the code, which
  is the worst place for it to go red;
- the invariant test's original shape asserted `all.len() == 2` whenever
  `line_of` answered, which is a claim about the fixture rather than about the
  property. Replaced with *"an answer implies at least one position"* — a list
  shorter than the single answer is the bug this was opened for.

### State at log write

| item | state |
|---|---|
| #82 | engine half done, product half blocked on #83 and #72 — issue left **open** |
| #83 | filed and placed in Phase 3, with the three-step loss and the existing fix |
| #81, #72, #80, #73 | as logged above |

### Mutations

Two, and they are the two distinct properties rather than two spellings of one.

| mutation | caught by |
|---|---|
| `line_of` answers `.last()` | 1 test, and the panic names it: `line_of Some(5) is not lines_of [2, 5]` |
| `lines_of` given its own, broader predicate | **3** tests |

The second is the one worth having. Giving `lines_of` its own predicate is exactly
the drift the shared iterator exists to prevent, and it broke three separate
assertions — `lines_of [4, 7]` where `line_of` said `None`, and `[1, 4, 7]` where
the main body's line 1 was asked for. Three because the property is asserted from
three directions, which is what I wanted and could not have predicted.

### The one place I did not follow the gate, and why

`gate.mjs`'s `engine` check is `cargo test --release` over **all 75 binaries**.
I did not run all 75. Ten targets, chosen to cover what this change can reach:

```
src/lib.rs (249)        ← jump.rs is `line_of`'s only caller, and services.rs
tests/includes.rs (19)  ← the change
tests/assemble.rs (6)   tests/note_layout.rs (12)
tests/assets.rs (13)    tests/pagetext.rs (12)
tests/channels.rs (29)  tests/docfile_oracle.rs (7)
tests/deep_link.rs (6)  tests/entry_address.rs (7)
```

**all green**, and `--lib` is the one that matters most: `line_of` has exactly one
caller and it lives there.

The reason is measured rather than chosen. This machine has 11 GB of RAM and the
default job count runs ~9 concurrent `rustc`, each statically linking the whole of
Typst; at `-j 9` the box fell to **1 GB available under load 27**, and single
binaries sat at 65% CPU for 29 minutes. Dropping to `-j 3` freed 5 GB and took each
to **~90%**. At that rate 75 binaries is roughly 4½ hours of linking for 65 of
them that cannot reach `include.rs`. Ten targets is thorough where it matters and
is not the same claim as all 75, so it is written down rather than rounded up.

Also recorded: `cargo fmt --check` is **already red on a clean tree** under this
machine's rustfmt 1.9.0 — `src/lib.rs` alone has 27 diffs, `include.rs` 6,
`tests/includes.rs` 12. My change adds **zero** new diffs (same 6 and 12 before and
after), so this is a toolchain-version question I cannot answer from here: CI
installs its own rustfmt and I do not know whether it agrees with 1.9.0.

Engine `#[test]` count 1,069 → **1,073** (`engineTests` is counted live off
`#[test]`, so the README moved with it). Editor **7,858**, all green. `tsc` clean.

### Next move

#83. It is the smaller patch and it unblocks #82's product half.

---

## 2026-09-30 · #83 — the file was dropped at the reader, and the fix is a type

### Three steps, and the loss is in the first

1. `engine/src/jump.rs:262` answers `{line, column, file}`. Fenced for diagnostics
   by `a_mistake_in_a_chapter_is_reported_at_that_chapters_line`, which asserts
   `file == "פרק ב"` and `line == 2`, *"not the assembled line 4"*.
2. `readSpot` returned `BodySpot` — `{line, column}` — and `BodySpot` is **the shape
   a request carries**. So the loss is at the *type*: naming a request shape as a
   response type is something neither compiler nor reader can see.
3. `main.ts` therefore had nothing to use. It is not that `jumpFromClick` ignored
   the file; `rg "spot\."` found only `line` and `column` because the file was
   never in `spot`.

### And the fence is a type, not a test

`readSpot` now returns `Located`. That is the whole fence for this class: a
reader that forgets a field **does not type-check**. Proven, not asserted —

```
src/api.ts(1143,3): error TS2741: Property 'file' is missing in type
  '{ line: number; column: number; }' but required in type 'Located'.
```

which is the old bug, spelled out by the compiler.

### One question, one function

`diagview.show` has asked *"did this line come from another document?"* for
diagnostics all along (`const fromPart = !!d.file`, `diagview.ts:74`), and
`diagview.ts:276` has dispatched `file ? goToPart(...) : goToLine(...)`. The click
path did not ask. So the question is now `clickedChapter(file, openTitle)` in
`jump.ts`, and `gotoPart` — extracted from the inline body of the boot wiring —
is the one thing that opens a chapter. Two paths to a chapter, one function.

`gotoPart` answers **nowhere rather than at the top**: `offsetOf` returns `null`
for a line past the end, and the old `?? 0` would have put the caret on line 1 of
the *right* document — the same class of wrong as the bug, one step further from
the truth.

### Fences, and a second fence that could not have failed

- **`services.test.mjs`** — all three transports, three engine answers: a line
  from a chapter, a line of the sefer, and **no answer at all**. The third is why
  the test says what it means: `{}` must not produce `undefined`, because
  `undefined` is a third answer to a two-way question. Plus the declaration
  itself, so a reader that keeps `file` while the *type* still says two keys is
  also caught.
- **`jump.test.mjs`** — the decision, and that `main.ts` calls it.
- **`tsc`** — the field cannot be dropped.

Mutations, five, all caught:

| mutation | caught by |
|---|---|
| reader keeps the type, discards `file` | every transport |
| `jump`'s declared type reverted to `BodySpot` | the declaration check |
| `clickedChapter` ignores the open document | 2 |
| the click branch removed from `main.ts` | 2 |
| the branch hands over raw `file`, not the decision | 1 |

**The last two exist because the first three did not cover `main.ts` at all**, and
that is the second time today a fence of mine passed while guarding nothing (the
first: an `indexOf` that found a function's *declaration*). `clickedChapter` could
have been correct, tested, and never called — which is **exactly what `Located`
was**. So there is now an assertion that `main.ts` names it twice and hands the
answer to `gotoPart`, with comments stripped on `prohibitions.test.mjs`'s rule
(a block comment must begin its own line, because `i18n.ts` holds a `/*` inside a
Hebrew string and a greedy strip deletes three hundred lines).

### One fence caught me, and it was right

`asyncaction.test.mjs` went red on the new `void gotoPart(…)`:

> *every bare `void f(` is accounted for — add src/main.ts:gotoPart to INVENTORY
> above with its reason, or call voidAction(doing, …)*

Both offered answers were wrong: an inventory entry saying "guarded" when it is
not, and `void`. `gotoPart` awaits `enterDoc`, so the promise can reject — and
`jumpFromClick` is an event handler, so a rejection there is an unhandled one.
`action(...)` on the awaited path and `voidAction(...)` on the diagnostic path,
both reported rather than swallowed. `Doing` is a closed union, so `"general"`,
and the reason is written down rather than left to look like a default.

### What I did not fence, and why that is a decision

**`wire.test.mjs` checks that a shape is *declared*. It cannot check that a shape is
*read*.** Measured across every seam row: **five** more wire interfaces are
declared and named nowhere outside their own declaration — `ClipboardSource`,
`Linkified`, `RefreshResult`, `Revealed`, `ServiceRow`.

So a blanket "a declared wire shape must be named somewhere" rule would be red on
five innocent ones, and I did not add it. All five are single-field or flat shapes
read structurally (`readPoints` returns `PagePoint[]`, not `Revealed`), so the rule
would be *wrong*, not merely noisy. `Located` was the only shape where a reader
returned a **different interface**, and that is now a compile error — which is the
honest fence for it.

### State at log write

Editor **7,858 → 7,878** across 112 files, 0 failed. `tsc` clean. Engine
untouched — this was a client-side fix and the engine was already right, which is
the finding: `jump.rs` has been sending the file correctly all along.

### Next move

#82's product half, now that #83 made a place inside a part addressable at all.

---

## 2026-09-30 · #60 — the loss was a `?`, and base64 has four spellings

### The line

```rust
let bytes = decode_payload(data)?;      // in a fn returning Option<Asset>
if name.is_empty() || bytes.is_empty() { return None; }
```

One `?` on an `Option`, and both failures were **silent**. A payload in any spelling this build did not accept, or one corrupted byte in a megabyte, produced *nothing*: the asset did not exist, the writer's sefer lost an image, and no diagnostic, status line or anything else said a word.

`Refused` was already there — a named entry per refused asset, surfaced as warnings through `lib.rs:3313` — and the unreadable case never used it.

### Four, not one, and the order is an argument

`decode_payload` took `STANDARD`. That is **one of four** ways to write the same bytes: `-`/`_` instead of `+`/`/`, and padding present or absent. A decoder that accepts one and refuses three is not being strict, it is picking one and calling it correct.

All four are now tried, and the ordering is not "whichever succeeds":

- the two **alphabets are disjoint** — `-` and `_` are illegal in `STANDARD`, `+` and `/` illegal in `URL_SAFE` — so a payload can only decode under the one it was written in. Nothing is ranked.
- the **padding pair is not** disjoint: the same string without its `=` decodes identically under `*_NO_PAD`. Trying padded first costs one extra attempt and never changes the answer.

So `STANDARD`, `URL_SAFE`, `STANDARD_NO_PAD`, `URL_SAFE_NO_PAD`.

### Fenced end to end, and the encodings are done by hand

`spelled(alphabet, pad)` writes base64 out itself, and the reason is the comment on it: **a helper that encodes with the crate agrees with the crate's own idea of what is valid**, which is the thing under test. It is also why the fixture is the 1×1 PNG already in this file rather than a round trip through `png().bytes`.

Four tests:

- all four spellings must yield **four identical byte strings** — four encodings of one image must not be four different images;
- **one corrupted byte** in a perfect payload must produce a **warning naming the asset**;
- an asset with a name and **no bytes** is reported separately, because *"unreadable"* and *"empty"* are not the same thing to go and fix;
- **a document with one unreadable image still renders.** That last one is what rules out the tempting wrong fix: a refusal that failed the compile would be a different bug, and #60 is not it.

The pre-existing `assets_are_read_from_a_request_with_or_without_a_data_url_prefix` test asserted `(assets, _)` — **the shape a test has when the second value is not asserted because there was nothing to assert.** Both of its drops went into a `Refused` nobody read. It now holds both sentences, and says what that `_` was.

### Also found, while in there

`name.is_empty()` in that condition was **unreachable**: `diagnose_name` refuses an empty name eight lines earlier, with the better sentence — *"an asset needs a name"*. So the condition had a branch that could not fire. Removed, and the removal is written down rather than left as a silent simplification.

### Why the whole condition is now two sentences

Undecodable bytes and empty bytes are two different mistakes — a broken transfer or a wrong paste, versus a client that sent a name and no content — and one sentence covering both would send a writer to the wrong place. Neither is worth refusing a compile over, which is why this **reports and continues**, exactly as a refused *name* does.

### Also filed: #84, the indent idea — and the argument I made that was wrong

Shaul's proposal, measured against the tree before it was written down — and the finding is that **nesting is already understood and simply not shown**. `spans.ts:scan()` produces `frames` outermost-first, `mode.ts:enclosing` and `structure.ts:structureAt` both read it, and `MAX_LEVEL = 9` already argues the case for a ceiling. So it is a view over existing state rather than new parsing, and `#הגדרות_כותרות`'s `הזחה`/`הזחה_מרבית` is already the step-and-a-cap shape this asks for.

Placed in Phase 5 per the routing rule, with the broader "put IDE features in" half as a second list ordered by what a *Hebrew* sefer writer loses. **Hover scope preview is the top of it, and it is deliberately not a tab bar** — a forty-tab apparatus is worse than one status line answering *"which `#הערה[` am I inside?"*, which `framesAt` can already answer.

### The argument I made in #84, and why it was the wrong shape of argument

I filed #84 arguing **against** indenting the source: Typst has no indentation
semantics, so it would "lie about the language and make every saved sefer disagree
with what was typed."

Shaul's reply: *"of course it is the source doc that would be indented — it is to
make writing easier, no?"*

He is right, and the reason I was wrong is the same one that has come up three
times in this session: **I optimised for the failure I could imagine instead of
asking what the feature is for.** A guide at the margin is a *reading* aid. Indenting
the source is a *writing* aid — and finding the place to type next inside a
900-character line you wrote yourself is the hard part of writing a sefer. The
preview already shows you the page; the page was never what was hard.

Two things changed in the design because of the correction, and both are more than
cosmetic:

- **the width is characters, not `em`.** The heading indent can be `1em` because
  it is paint. This is whitespace the writer reads, deletes, and git diffs, so it
  has to be a count. And the *side* question disappears with it — whitespace is not
  directional.

And a third correction when he asked whether I had understood the ask: **I had
mislabelled one of his three dials.** He said *"by percentage used"* and I had been
calling that dial "depth" and reaching for `MAX_LEVEL = 9` as its precedent. Same
control, but the **percentage** is the point — the ceiling is a *share*, so one
setting behaves whether a document nests 2 deep or 20. `MAX_LEVEL` is a fixed count
and is therefore the wrong precedent; I had mistaken a constant for the idea.

So the three are **amount**, **percentage used**, **size from side**, and the fourth
is the one he added: **minimum words**, below which a tag is not touched at all.
- **a minimum word count becomes load-bearing**, because without it every
  `#נטוי[מילה]` in a sefer becomes three lines nobody asked for, and the source
  churns under the caret. Below the threshold a tag is not touched **at all** — no
  indent, no inserted breaks. That knob is the difference between a formatter and
  something that fights you.

Reading the tree for it turned up the three properties a formatter here must hold,
and **the tree names all three without being asked**:

| property | where it is already argued |
|---|---|
| one undo step | `editDoc` (`main.ts:8544`) dispatches once; free, provided nothing dispatches per line |
| idempotence | `deferred.ts:1416` — *"tidy twice leaves one separator and not two"* |
| the caret survives | `Edit { text, caret }` (`headings.ts:170`) |

And the two precedents to read first are **both warnings**: `table.ts:274` is the
only place that pretty-prints, and `spans.ts:92` says so and gives the reason;
`deferred.ts:1520` records a rewriter that **reshaped a writer's own source** by
dropping a pair of quotes, and `deferred.ts:1372` records a tidy losing idempotence
to a single wrong offset. Both are about *re-running* the transform, which a
formatter does constantly.

The one question I genuinely cannot answer is **`#כלול`**, and he asked me to re-explain
it without jargon, which was fair — I had answered it in the language of frames and
splices.

Plainly: a chapter is its own file, read from the top, so it always starts at the far
left. But **on the page** a chapter can land inside a note and print inset. So either
the indenter treats every chapter as starting at zero, or it knows how deep that chapter
ends up and matches.

The cost of matching is the thing to weigh, and it is not a technical cost: **moving
one chapter out of a note would rewrite a different file**, hundreds of lines of
indentation shifting, for a change made somewhere else entirely — and then again when
it moves back. In git that is noise on every rearrangement.

So: **indent each file on its own.** The file is what you write in; the page is what
Ksav draws for you; a formatter that makes one depend on the other is how writers stop
trusting a formatter. Recorded as a recommendation, not a decision — it is his.

### #60's mutation run, and the one that was **not** caught

| mutation | caught |
|---|---|
| the four spellings collapsed to `STANDARD` | 1 test |
| **`URL_SAFE` (and both `*_NO_PAD`) dropped** | **nothing — 17 passed** |
| the refusal removed, silent drop restored | 4 tests |

So two of three mutations were caught and **one was not**, and the reason is the sixth
instance of the failure mode that has run through this whole day.

## The fixture could not distinguish the cases

`every_spelling_of_the_same_bytes_is_the_same_image` encoded the **1×1 PNG** in four ways
and required all four to decode. Measured:

```
png bytes: 70
STANDARD: iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
URL-safe : iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg
identical? false
contains + or / ? false
```

**The PNG contains no `+` and no `/`.** So its URL-safe encoding is byte-for-byte its
standard one — the only difference is the `==`. Four "spellings" of that payload are
therefore **two distinct strings**, and a decoder that had forgotten `URL_SAFE` entirely
would have decoded all four and passed.

**The test was a tautology, and every other assertion in it was true for that reason.**

## The fix is the fence, not the fixture alone

A 256-byte `0x00..=0xFF` payload encodes to `////////////////` under `STANDARD` and
`________________` under `URL_SAFE`, so the alphabets cannot be confused. And the new
assertion is the part that matters:

```rust
assert!(
    four_spellings_can_differ(),
    "the four spellings are not four different strings, so this test cannot fail"
);
```

**A fixture that cannot distinguish the cases under test is not a fixture**, and nothing
else in the file would have noticed. That assertion is the fence, and it runs *before* the
property rather than beside it.

This is the same shape as #81's stale `dist/`, #82's unreachable half, `wire.test.mjs`
checking declarations rather than reads, `Located` being imported by nobody, and #88's
extension list — **and it is the first one that reached an engine test.** Six times in one
day, and the sixth was a fence that had been green for hours.

### Also, and this one is mine

**I committed a mutation.** `375e352` was a `plan:`-only commit that ran `git add -A` while
a background mutation script was mutating `ksav/engine/src/assets.rs`, and it captured the
tree mid-mutation. The four-alphabet fix survived; **the naming of the failure did not**, and
so `main` carried the silent drop for six commits — the exact defect #60 was filed about.

`git add -A` is the wrong tool when anything else is writing to the tree. Caught because
the editor suite and this diff disagreed, and it is recorded rather than quietly fixed,
because the *reason* it happened is the part that would happen again.

### State at log write

Editor **7,858 → 7,878**, 0 failed. Engine `#[test]` **1,073 → 1,077**.

### Next move

Finish #60's mutation run — three mutations queued: the four spellings collapsed to one, `URL_SAFE` dropped, and the refusal removed. Then **#83** (from the #82 work): the file the engine returns from `jump` is dropped at the wire reader.

## #87 — the length on a collapsed fold

The chip said what a fold was ("הערה …") and never how big. Approved, so it says
both now: `⋯ הערה … 480 תווים ⋯`.

**What is counted, and why it was not the body.** The folded range — command,
brackets and prose. That is what disappears when the chip appears, so it is the
number a reader can check by unfolding. Counting the body alone would need a
second scan to answer a question nobody asks.

**The one way to be wrong.** An opener that never closes folds to the end of the
document. The subtraction succeeds, and the chip cheerfully prints the length of
everything after it — a true number and a useless one, on the one fold where it
means nothing.

And the obvious rule for detecting it is wrong: "does the range reach the end of
the document?" cannot tell an unclosed tag from a tag closed by the **file's final
`]`**. `Frame.close` is already `doc.length` for both (`spans.ts:250`), and the
first version of this function asked exactly that question.

So the question goes to the thing that already answers it — `brackets.analyze`,
which reports `{kind: "unclosed", pos}` — and the fold asks *that*. One judgement
of "unclosed" in the repository; a second one next to it would be free to disagree
with the red lint that is already telling the writer the same thing.

**A false claim, caught before it shipped.** The first draft of the comment said
the lint walks strings and comments, so a `[` inside quotes is not an opener. I
believed that and wrote a test for it. The test failed: `analyze("#הערה[\"[\"]")`
reports `unclosed@5`. The lint does not track quotes. The comment and the test
were both wrong, and the comment was the dangerous one — it would have told the
next reader that the lint is smarter than it is, which is how the second opinion
gets written. Both cut.

**Verified:** 9 new assertions, 7,916 across 113 files, `tsc` clean. Four
mutations, all caught:

| # | mutation | caught by |
|---|---|---|
| M1 | drop the unclosed guard, always subtract | 2 assertions |
| M2 | pin the opener to `range.from` | 1 assertion |
| M3 | chip stops printing the number | the wiring fence |
| M4 | none — | — |

M3 is the one worth naming. Everything about `foldLength` is a pure function, and
a chip that computed the right number and never printed it passes all of it —
and looks *right* in a screenshot, because the "…" is still there, only smaller.
No test in this suite builds a `DOM`, so the fence is on the source: the chip's
own interpolation, checked against `src/ksav-lang.ts`. A fence that cannot fail
on "this is not used" is not a fence.

## #86 — click a bracket, select the tag

`#84` makes nesting legible. This makes it grabbable. Click an opening `[` and
the tag selects; `Alt`+click selects the other one; two keys, one per answer.

**The issue's own resolving test, written before the feature existed.** `scan()`
pairs delimiters into `Frame { open, close }`. `delimiters()` walks the same
document independently and reports every bracket with an `opener` flag. Both know
which `]` closes which `[`, and `deferred.ts:1520` records what happens when two
answers to "where does this end?" sit beside each other — a rewriter silently
reshaped the writer's own source.

So `tagselect.ts` reads **one** of them, and `tagselect.test.mjs` pairs the other
with its own stack and its own logic and requires it to land in the same place for
**every frame in every fixture**. The count compared is held against the number of
frames the fixtures actually contain, because an assertion that passes because it
compared nothing reads as agreement forever.

**Three data-shape mistakes, all of them mine, all of them caught by a failing
test rather than by reading the code:**

- `Delimiter.structural`, not `.structure`. I wrote the wrong field, every
  structural opener was skipped, and the agreement test "passed" having compared
  zero pairs — which is why that test now asserts it compared *everything*.
- `Node.bodies` is the **body** range, not the bracket positions: `from` is one
  past the `[` and `to` is the `]`. I looked for `group.from === pos`, which is
  the character *after* the bracket.
- `Node.to` is one past the `]`, while `Frame.close` is the `]` itself. Two
  conventions for one bracket; each range above is only right because each uses
  the one its own source uses.

**And one the tests could not have found: an unclosed tag has no body.**
`#הערה[לא נסגר` scans to `bodies: []` while its frame runs `open 5 → close 13`. A
body range that a half-written note does not have cannot answer "where am I?" —
and `spans.ts:250` is explicit that half of `#רשימה(` is the *normal state of a
document being written*. So the geometry reads `frames`, and the right-hand
boundary is inclusive exactly when `group.to === doc.length`, which puts a caret at
the very end of the document **inside** the note whose words run up against it.

**`Node.to` stops at the `[` for an unclosed tag** — measured, `0…5` — so
`Math.max(owner.to, frame.close)` is not defensive coding. The node cannot know the
end of a tag that does not end yet; the frame can.

**Typing over a whole-tag selection puts the brackets back**, as decided. The test
is not "the brackets are still there", which a string comparison proves while the
selection has quietly become a cursor. It applies the replacement and checks the
result is **still a tag with the same shape** — so undo, re-select and delete all
still work. Body mode deliberately does *not* wrap: wrapping a retyped word would
put a note inside every note the writer ever corrected, which is not a restore, it
is a second edit nobody asked for. And an unclosed tag is not given a `]` it never
had — inventing structure is the mirror of the bug the rule prevents.

**Verified:** 30 assertions, 7,945 across 114 files, `tsc` clean. Six mutations.

| # | mutation | caught by |
|---|---|---|
| M1 | click ignores `Alt` | the `Alt` fence |
| M2 | never restore brackets on type | 1 assertion |
| M3 | body mode wraps too | 1 assertion |
| M4 | extension dropped from `main.ts` — **the feature is dead code** | the wiring fence |
| M5 | unclosed boundary made exclusive | threw |
| M6 | `[`-only filter removed | **survived** |

**M5 was a no-op I reported as a mutation.** My replacement anchor was a line that
a rewrite had already deleted, `str.replace` found nothing, wrote the file
unchanged, and the suite reported green. The second run now asserts the anchor
appears exactly once and prints `NO-OP` and exits 9 otherwise. A mutation harness
that cannot tell "the edit applied" from "nothing happened" is the same instrument
failure as a test that cannot tell "green" from "compared nothing" — and it was
mine, in the harness, on the day I was writing about that exact bug.

**M6 survived, and it was a real gap.** Removing the `[`-only filter changed
nothing because every fixture is square brackets, so the branch had nothing to fail
on. Found by the instrument, not by reading. Fixed by adding a `#let זוג =
("אלף", "בית")` and an `#if true { … }`, and asserting a `(` and a `{` are not
tags — which is the rule the issue states and nothing had checked.

## #84 — the indent view: the rules, without a renderer

Six rules, all settled in the issue. This is rules 1–5, as **pure arithmetic over
the document** — no `Decoration`, no `DOM`, nothing that draws. The split is
deliberate: the rules are where this feature is right or wrong, and this suite
cannot build a `DOM`, so the rules can be held and the rendering cannot yet be.

- **rule 4, minimum words**, is the load-bearing one, and it is why the feature is
  safe rather than a machine the writer fights. Below the threshold the tag is not
  touched — not indented, not broken. `#נטוי[מילה]` is most of the emphasis in a
  sefer. `0` is a real setting meaning "anything, however small", and must stay
  reachable rather than excluded.
- **rule 5, paragraph breaks share a level**, because a blank line has no content
  to hang an indent off. And a blank line is **not an empty line**: `main.ts:5910`
  says Typst turns a newline into a space and a *blank* line into a paragraph
  break, so `blank` and `viewBreak` are separate fields. A view that treats them
  alike looks right on screen and is wrong on the page.
- **rule 3's side**: in RTL the indent grows from the right, so the space that runs
  out is on the **left** — the opposite of `padding-inline-start`, which is what I
  would have written unprompted.

**Dead code I wrote, a persuasive comment attached, and a mutation found.**

Rule 5 was implemented as an explicit `above` clause — take the level of the line
above the blank one. A mutation removing it **passed every test**. The reason is
worth more than the clause: the planner emits a line at *every* depth transition,
including just after each `]`, so the line above a blank line is already at the
depth `depthAt` computes for the blank line itself. They are not merely equal on my
fixtures — a blank line cannot be reached without crossing a planned boundary.

So the clause is gone, rule 5 is held by `depthAt` **and** by a test that fails when
`depthAt` is made to ignore blank lines, and the nested case is in the file: a blank
line after an *inner* note's `]` and still inside an outer one, which must hold the
outer's single step and not the inner's two.

**Two more surviving mutations, both real gaps:**

- **The indent amount was never varied.** Every fixture used `2`, so hardcoding
  `const step = 2` passed. A setting nobody has varied is a setting nobody has
  tested, and a hardcoded default is the one thing a "user-set value" must never be.
- **`(` and `{` were never in a fixture**, so the "only `[`" filter in #86 had
  nothing to fail on.

Both found by the instrument, not by reading. That is now four mutations today that
passed because a fixture was missing rather than because the code was right.

**My mutation harness, again.** `/tmp/ksavv/mut.py` asserts the anchor appears
exactly once and exits 9 on a no-op. It caught one immediately: a stale anchor
silently "passed" a mutation I had already reported.

**Verified:** 46 assertions. Six mutations, five caught first time, two survived
and were fixed by adding the fixtures they had been asking for.

| # | mutation | caught by |
|---|---|---|
| M1 | blank lines pinned at the margin | **survived** → clause removed, test added |
| M2 | minimum-words stops gating | 1 assertion |
| M3 | the clamp is removed | 2 assertions |
| M4 | percent becomes a fixed count | 9 assertions |
| M5 | no break after `]` | 1 assertion |
| M6 | indent amount hardcoded to 2 | **survived** → rule 2 tests added |

**Not done:** the renderer. #84 stays open. What is here is the part that decides
whether the feature is correct; turning a `VisualLine[]` into decorations is a
separate piece of work and should not be claimed until something has looked at it.

## #60 — the fourth alphabet, and the test that was a tautology

`375e352` was a `plan:`-only commit that ran `git add -A` while a background
mutation script was editing `ksav/engine/src/assets.rs`. It captured the tree
mid-mutation. The four-alphabet fix survived; **the naming of the failure did not**,
so `main` carried a silent drop for six commits — which is the exact defect #60
was filed about, committed by the person fixing it.

**And one of #60's mutations was never caught, and that is the real finding.**

The test encoded the 1×1 PNG in four base64 "spellings". **That PNG contains no
`+` and no `/`.** So its URL-safe encoding is byte-for-byte its standard one: four
spellings, **two distinct strings**. Dropping `URL_SAFE` entirely still passed
17/17. The test was a tautology — it asserted that two equal things are equal — and
it was reporting green while measuring nothing.

Fixed two ways: the payload is now `0x00..=0xFF`, which uses both alphabets, and
`four_spellings_can_differ()` asserts the four encodings **are** four different
strings *before* the property it guards. That assertion is the fence. A JS sanity
check confirmed the encodings are distinct and that the URL-safe payload holds 11
`-`/`_` and no `+`/`/`.

**Verification, on the restored fix:**

| run | result |
|---|---|
| V0 baseline | **17 passed, 0 failed** |
| V1 `URL_SAFE` and both `NO_PAD` engines dropped | **caught** — `every_spelling_of_the_same_bytes_is_the_same_image` failed, 16/1 |
| V2 the refusal message removed | queued |
| V3 final confirmation on the restored fix | **17 passed, 0 failed** |

V1 is the one that used to pass silently. It now fails, which is the entire point.

**The seventh instrument of this shape, and the first one I built wrong.** My own
mutation harness ran a `str.replace` against an anchor a rewrite had already
deleted, found nothing, wrote the file unchanged and printed the suite as green.
I had written a paragraph about exactly this failure earlier the same day and then
made it in the tool. `/tmp/ksavv/mut.py` now counts the anchor, prints `NO-OP` and
exits 9 — and it caught a second stale-anchor mutation the moment it existed.

## #60 — verification complete, all four runs

| run | result |
|---|---|
| V0 baseline, restored fix | **17 passed, 0 failed** |
| V1 `URL_SAFE` + both `NO_PAD` dropped | **caught** — `every_spelling_of_the_same_bytes_is_the_same_image` failed, 16/1 |
| V2 the refusal message removed | **caught** — 2 assertions, including `a_corrupt_payload_is_reported_by_name_rather_than_dropped` |
| V3 final confirmation | **17 passed, 0 failed** |

V1 is the one that used to pass **silently**, because the fixture's four spellings were
two identical strings. That is the whole of #60's real content: the bug was real, the
fix was real, and the test that claimed to hold it was a tautology.

## #84 — the renderer does not render, and I stopped rather than keep guessing

**`tools/eyes.mjs` works.** It serves `dist`, drives the Chromium already on this
machine, types a document in and writes a PNG. No Rust server — `ksav serve` embeds
`dist` at *compile* time and takes an hour to link here, and none of that is needed to
look at the editor. It is not a test and asserts nothing, because the thing it is for
is being looked at, and a harness that only reports pass/fail is the harness that
reports green while measuring nothing.

It immediately paid for itself by finding four things no test in the suite could:

1. **`RangeError: Block decorations may not be specified via plugins`.** CodeMirror
   forbids `block: true` from a `ViewPlugin`; they must come from a `StateField`.
   That means the pane width, which only a view can measure, has to travel into the
   state as an effect.
2. **`ReferenceError: Cannot access 'n' before initialization`**, thrown from inside
   `StateField.create`, in a *different* chunk. A `ViewPlugin` constructor may
   dispatch, and with code splitting `main.ts`'s top-level editor construction and
   this module's evaluation interleave — so `indentDecorations`, declared **before**
   the `indentSettings` it reads, saw a `const` still in its temporal dead zone. The
   helpers are now `function` declarations (hoisted) and every field is declared
   after everything it reads.
3. **`charsWide` returned 0 at construction** because a plugin's constructor runs
   before the editor is laid out, and the measurement was discarded by an `if (w)`
   guard. Not a missing re-measure — a measurement taken too early to mean anything.
   Now on `requestAnimationFrame`.
4. **`RangeSetBuilder` requires strictly increasing positions.** Adding every block
   and then every pad walks the document backwards the moment a tag has a body —
   5, 15, then 6 — and CodeMirror swallows the throw and keeps the previous empty
   set. Symptom: no decorations, no error, every setting correct.

**And one thing is still wrong, and I am not going to paper over it.** After all
four fixes the screenshot is unchanged: the settings arrive (`indentView: true` is in
localStorage), `tsc` is clean, the code is in the bundle, `indentView(...)` is in the
editor's extension list, and there are **zero** `.ksav-indent-bracket` and zero
`.ksav-indent-pad` elements in the DOM.

The remaining lead is the plugin's lifecycle: the `ViewPlugin` is constructed once,
then `destroy` fires while the `StateField`s survive, and no second plugin instance
ever appears — so `indentSettings` stays `null`, `cfgOf` hands `build` the default
`on: false`, and it returns `Decoration.none`. Whatever re-creates the view there is
not carrying the plugin across.

**So the renderer is not landed.** The planner is — 46 assertions, committed in
`794fde3` — and the settings, the CSS and the renderer are left **uncommitted** rather
than committed as a feature that does nothing. Shipping "indent view" with a toggle
that visibly does nothing is the same failure as `Located` sitting in the tree
imported by nobody, and I have written three issues this session about exactly that.

The next step is to find what re-creates the editor state, rather than to work around
it with a closure — a closure would make the settings right on the first build and
wrong the moment the writer changed one, which is the quieter version of the same bug.

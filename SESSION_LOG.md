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
  not bind. My session log said *"the chord `Alt+a` is `Alt+a` in Hebrew"* as an
  illustration, and `Alt+a` is not a Ksav binding. Rewritten to say *"a chord is a
  chord in either language"*, which is the same point and survives the sweep. The
  fence is doing exactly what it is for: a plausible sentence about chords in a
  document that names chords is a claim about which chords exist.

### #71: 114 → 43, and the two that must stay

The headline number moved from 114 to 43, and the composition of it matters more
than the total: two catalogue keys (one of which is correct) and 41 composed
strings, of which about thirteen are the file and theme ribbon — the same shape as
`noteBtn`, in a different builder — and the rest are Hebrew that *should* stay
(letter samples in the niqqud bar, Hebrew document source in placeholders, English
text about Hebrew). Chasing the last thirteen is the next piece; the ceiling in the
browser test is what says when it is done.

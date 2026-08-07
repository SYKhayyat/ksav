# Lamdan — the whole repository, 7 August 2026

Thirteen regions, every tracked file assigned to exactly one, read by a fresh context each.
Coverage is itemised at the end; read that section before trusting anything above it.

---

## The commitment, made before any implementation was opened

> The differentiated thing here is `engine/typst/ksav.typ` — a Hebrew command vocabulary that
> are genuine Typst functions, the eleven-layout note apparatus, the fonts, the templates. That
> is a **Typst package**, ~2,300 lines, publishable to Typst Universe. Everything else in this
> repository is a general-purpose text editor, and those already exist: Typst's own web app has
> live preview for free, tinymist gives you an LSP and a preview in VS Code. Instead this repo
> carries its own CodeMirror shell (5,721 lines in one file), a command palette, a hydra, a macro
> recorder, vim *and* emacs emulation, a docx importer, a service worker, and version history.
> I'd have shipped the package, written a Hebrew mode for an existing editor, and — for the
> apparatus — tried to upstream a second footnote series into Typst rather than rebuild one out
> of `place` + `query`.

**That commitment lost, and it lost on evidence I did not have.** Three things kill it, and they
are all specific:

1. **Typst packages cannot register fonts.** A Universe package would typeset Hebrew in whatever
   the reader's machine happens to have — the exact failure the product exists to escape — and
   `#נוסחה` would fail with "no font could be found" on any machine without an OpenType MATH
   table, which is most of them. `lib.rs:56-65` is the strongest single justification for a
   binary in this repository.
2. **`auto_notes_region_cm` (`lib.rs:183-192`) cannot exist inside a package.** The page-foot
   reserve must be decided *before* layout, from a scan of the source. `page(margin:)` set from
   within the flow starts a new page, and `context`/`query` cannot see un-laid-out content. This
   is a genuine out-of-band computation, and it is why the apparatus works out of the box here
   and would not in Universe.
3. **`#תמונה` takes a name, not a path** (`ksav.typ:1719-1733`) and `ציון_מקור` reads a generated
   catalogue the Rust side emits above the prelude (`sefarim.rs:331`). Both need a host that owns
   assets and a catalogue. A package would have to drop them.

So the engine should exist. What I got right is smaller and survives: about a fifth of `lib.rs` —
`DocConfig`'s `clamped()`, `sanitize_paper()`, `sanitize_lang()`, `sanitize_head_align()`,
`typst_str()`, roughly 400 lines — is a lossy hand-rolled re-implementation of argument checking
that `מסמך` already declares with real Typst types. `sanitize_head_align("sideways")` silently
centres a running head nobody asked to centre. That part is a worse copy of Typst wearing a JSON
schema.

I was wrong about the test harness too, and R11 killed it with specifics. See §11.

---

## The claim

**This repository has been developed almost entirely by reading itself, and it shows.**

Nine dated audit waves. A previous lamdan report. A 21,288-line test suite against 37,935 lines of
source. A documentation fence that sweeps the repo's own prose for stale numbers. `cargo clippy
-D warnings`, `cargo fmt --check`, a generated shortcut card byte-compared on every run, five code
generators with `--check` modes, a reachability test, a cross-manifest consistency test, an
insertion grid of 1,035 compiled documents.

Every one of those is a *reading* process.

**Nothing in this repository has ever run the application.** CI has five jobs — `tsc --noEmit`,
node tests against a hand-written fake DOM, `cargo test`, `cargo fmt`, and a wasm smoke test that
exercises the *engine* in Node. No job launches Ksav, clicks a button, and looks at what happened.

The one time a human did, it was 6 August — day 35 of a 36-day project — and it took an hour to
find three bugs, all green in the whole suite, none a gap in coverage:

- Press the § button three times and you get **סימן א׳, סימן א׳, סימן א׳**. The most basic
  operation a sefer has.
- Type `רש״י` — the commonest punctuation in the language — and get Typst's raw English
  `unclosed string`.
- Every citation the editor inserts by itself dropped `place.ref` on the floor, so the source
  index, the PDF link and the entire argument for the Girsa pairing were dead.

That is not bad luck. That is the yield rate of a surface nobody has touched. This sweep found
roughly twenty more of the same species **by reading**, which means the true count is unknown and
larger than either number.

And the yield is not evenly spread. It concentrates, with almost eerie precision, at the boundary
of what the tests can see. Which is the second half of the claim:

**Every mechanism in this repository is good. Almost every surface that composes them is broken.**
The engine renders eleven note layouts correctly and the chooser greys two of them out with
reasons that are false. `macros.ts` is 128 well-designed lines with an exhaustive test suite and
the recorder records nothing. The Hebrew lexicon is a genuine, defensible, hard-won asset and the
suggestion menu built on it is 4% useful. `citation.ts` is a beautifully-argued single producer
that hands its output to the one insertion path the app is forbidden to use.

And the sharpest instance of it is not a missing wire but a *live corruption*, reachable by typing
ordinary Hebrew: type `(רש"י)` inside any command body and the editor's source model eats the rest
of your document. §6. That is the gershayim bug — the one `spans.ts:29` opens by naming as the
worst thing the fourteen old scanners did — alive, in the file written to kill it, narrowed by
exactly one character and fenced by a test that stops one character short.

That pattern has a name in this repo already — the memory calls it *surface vs mechanism*, and
`coverage.test.mjs:7-14` diagnoses it exactly:

> "`#הערתסיום` had been in the engine since the first wave, was documented, rendered correctly,
> and appeared in the product **only inside a chooser card**… Every test in the suite passed.
> **There is no assertion anywhere that a mechanism is *offered*.**"

The diagnosis is right and the cure was aimed one notch too low. `coverage.test.mjs` fences the
*content* registry — the 115 Typst commands. The ~73 *operations* in `main.ts`'s `ACTIONS` have no
equivalent fence, and that is exactly where this sweep found the corpses.

---

# Lens 1 — what was built

## 1. The development process is the artifact, and it is missing its most valuable half

**Verdict: `don't-build` the tenth audit wave. Build the acceptance path.**

Ten waves of reading have produced a codebase whose *mechanisms* are, genuinely, better than most.
The eleventh wave will find what the tenth found, because reading is subject to a fixed point and
this one has been reached: several findings below are the previous report's findings, alive, in
code that was edited afterwards.

**Steelman, and it is strong.** Reading found real things. The insertion grid found **384 of 1,026
UI insertions producing uncompilable Typst** — a bug class no amount of clicking would have
enumerated. `emit-structure-fixtures.mjs:5-8` states the case unanswerably: *"Outdent passed all
65 unit tests and produced `],,`. Balanced brackets are not legal Typst, and a pure-function test
cannot tell the difference. Only the compiler can."* That is reading beating using, decisively, on
its home ground. And a solo project with no users has no acceptance path available except its
author.

**But it has one available and did not build it.** The 6 August kuntres session found three bugs
in an hour and was not institutionalised — there is no script, no CI job, no second session. The
repo already owns a headless-Chromium harness (`.gstack/`, used to *run* that session). The
missing artifact is forty lines of YAML.

**The change.** One CI job that boots `ksav serve`, drives a headless browser through the six
paths a bochur actually walks — new sefer from the ספר template, heading, bulleted list, table
row, footnote, endnote, export PDF — and fails on a console error, a compile diagnostic, or a
missing element. Then one written rule: **a feature is not done until it has been used once, by a
human, in the assembled application.** Every finding in §3, §4, §6 and §12 of this report would
have been caught by that job or that rule.

**The cost.** A day for the job, plus the flake tax every browser test charges — and this repo has
zero tolerance for a suite that cries wolf, correctly. Mitigate by asserting on *console errors
and compile diagnostics*, not on pixels.

---

## 2. `ksav/engine/web/` is a second editor, and it has already drifted into being wrong

**Verdict: `delete`.**

`server.rs:35-36` embeds a complete, separate, RTL Hebrew editor: its own starter document, its
own toolbar of ten commands, its own debounced compile loop, its own PDF download, its own design
system. 232 lines. Touched **twice** in the project's history while `main.ts` took 79 commits.

It is not merely redundant. It is *wrong*:

```
web/index.html:71     data-insert="#טבלה(\n  עמודות: 2,\n  תא[], תא[],\n …)"
commands.rs:102       "#טבלה(עמודות: (1fr, 1fr),\n  כותרת_תא[|], …)"
```

`commands.rs:97-102` documents the first string as the defect it fixed: *"a bare `עמודות: 2` lets
Typst size each column to its contents — so an empty new table rendered as a thumbnail-sized box
shoved against the margin."* The fix landed in the registry and not here, because here is
invisible to `emit-insertion-fixtures.mjs`, which reads the engine registry and the app's insertion
path and has never heard of `data-insert=` attributes inside an `include_str!`ed HTML file. **The
repository's single most expensive lesson — 384 broken insertions — has a blind spot exactly the
shape of this file.**

Meanwhile `server.rs:652` and `:673` are two good tests keeping this dead room's CSP hygiene
correct, asserting nothing about whether its buttons work.

**Steelman.** `embed-ui` is optional, so `cargo run -- serve` on a fresh clone must answer
*something* at `/`, and a bare 404 is a worse first five minutes. And a second implementation
against the same JSON contract is a conformance check on that contract.

**Both halves fail.** A 404 body reading *"build the app first: `cd ksav/app && npm run build`,
then rebuild with `--features embed-ui`"* is strictly more useful to the confused newcomer than a
stripped editor that silently is not the product. And nothing runs the conformance check — there
is no test that loads this page, presses a button, and compiles the result.

**This is not the standing rule's case.** `web/editor.js` is not an unfinished feature awaiting
wiring; it is a *finished, working, superseded* copy of a surface that has since moved 79 commits
without it. "Wire it up" means re-implementing the SPA inside it. The rule protects the abandoned;
this is the obsolete.

**The change.** Delete `ksav/engine/web/`, `INDEX_HTML`/`EDITOR_JS` (`server.rs:35-36`), the
fallback arms of `serve_static` (`:122-137`), and the two tests at `:652`/`:673`. Keep
`every_html_response_carries_the_policy` and `the_policy_goes_only_where_it_governs_something`,
which are about `policy_for` and survive. **Cost:** 232 lines of HTML/JS, ~20 of Rust, two tests.

---

## 3. The templates demonstrate eight of 115 commands, and the apparatus has no template at all

**Verdict: `wrong-but-keep` — unfinished, and this is the 90%.**

| template | features used |
|---|---|
| `article`, `article-en`, `divrei-torah`, `get` | footnote |
| `sefer` | `מראה_מקום` — *without* `מקור:`, so it files nothing, and there is no `#מפתח_מקורות()` in the file |
| `bentcher`, `siddur`, `kesubah`, `letter`, `letter-en` | **none** |

Zero templates use options 2–11. Zero use the indexes, the TOC, math, images, review marks,
sidenotes, cross-references, or any of the six `הגדרות_*` configuration commands. **A bochur who
picks "ספר" gets footnotes and a horizontal rule.**

The one differentiated thing in this product — the apparatus that `spec.md` is about, that
`README-notes.md` is about, that 677 lines of `apparatus.rs` and 501 of `apparatus_golden.rs` hold
— is demonstrated nowhere.

**Steelman.** A template is a starting point, not a gallery. A file pre-stuffed with
`#הגדרות_מדפים(גבהים: (2cm, 1cm))` and three tiers of band notes is hostile to someone writing a
letter, and every line would have to be deleted before they could start. That covers `letter.ksav`
and `kesubah.ksav`. It does not cover `sefer.ksav` (28 lines) and `divrei-torah.ksav` (37), whose
entire reason to exist is to show a Torah writer what this does that Word does not.

**The change.** `sefer.ksav` gets `#הגדרות_מדורגות` + `#מדור_א`/`#מדור_ב` + `#הערות_מדורגות()` in
its first siman, `#ציון_מקור` on its citations, and `#מפתח_מקורות()` at the back. `divrei-torah`
gets `#עם_הערות_צד` + two `#הערת_גיליון` — the arrangement a d'var Torah sheet actually uses. Two
new templates: per-page bands (the Gemara look) and parallel streams (peirush + mareh mekomos).
Each must be **probed, not `ok()`ed** — `README-notes.md:7-17` is unambiguous and correct.

**Cost.** Two entries in `templates.rs:89-99`; the new ones will exercise
`auto_notes_region_cm`, which is the point.

---

## 4. "There are eleven, and nothing else" is a claim about a UI, defended by choosing which artifact to count

**Verdict: `wrong-but-keep`, with the sentence corrected.**

`spec.md:3` states it as a property of the system. `spec.md:157` gives the actual definition — *"the
eleven are the cells of that grid"* — which is a definition of a chooser.

The engine has **five** mechanisms (`README-notes.md:41-107` is honest about this). Options 1 and 7
are the same code. 2 and 3 differ only by where the writer calls the dump. 9 is 1+2 and 11 is 2+1.
**Option 10 is not code at all** — `spec.md:114` says "trivially works (two compiles,
cross-referenced)", a documentation entry claiming a feature slot for the absence of a feature.

And the prelude ships four arrangements that are none of the eleven: `הערה_על_הערה`
(`ksav.typ:1295`), `מראה_מקום` (`:1782`, used in `sefer.ksav`), `הערות_בסוף_צד` (`:1363`), and
`הערת_עורך` (`:2209`).

The count gives itself away. `NOTE_CHOICES` holds **twelve** records, and `docfacts.mjs:101-105` —
the fence that guards this repository's counted claims — explicitly declines to count the code:

> *"`NOTE_CHOICES` is deliberately not the authority: it holds twelve records because one option
> ships as two chooser cards"*

— and counts rows in `spec.md`'s own status table instead. When the fence has to choose which
artifact to count in order to get the answer the prose wants, the prose is wrong.

**Then the greying is wrong too.** The twelve blocked cells are produced by a five-line if-chain
over axis values (`notes.ts:335-343`) that never once mentions the ground rule — because the
ground rule constrains the `page` row, and the `page` row is completely full. Two of the reasons
are false against the shipped engine:

- `document` × `parallel` is greyed with *"parallel streams side by side need the page's width."*
  `#הערות_בסוף_צד(זרמים: (…))` renders exactly that, at the document end, with an English alias,
  already parsed by `apparatus.ts:148`.
- `section` × `split` is greyed with *"needs two places."* `spec.md:117` says option 11 is "back
  matter, **or section-end**."

**Steelman, and it survives for the chooser.** A writer genuinely cannot choose between `#מדור_א`
and `#מדף_א` from their names — `notes.ts:34-40` records that one rendered at y=126 and the other
at y=741 with nothing in the UI saying they were different questions. The two-question chooser is
the right idea, and the **live-compiled card** — the writer's own prose, set in the layout,
rendered at thumbnail size (`main.ts:4557-4585`) — is worth more than the entire grid around it.

**The change.** `spec.md:3` becomes the ground rule stated as a rule: *"every second layer either
spends the one native series or leaves the live page foot."* The blocked cells move from a
fallthrough chain to a `blocked: [{where, how, why}]` table, so an unexplained cell is a compile
error. Add the thirteenth card (`document` × `parallel`) — already built, already tested, currently
unreachable from the only UI that offers layouts. **Cost:** ~40 lines, three i18n keys, one render
proof, and the README/`docfacts` count goes from eleven to thirteen. The count was already a
fiction the test suite routed around; this pays the debt.

---

## 5. Smaller lens-1 verdicts

| What | Verdict | Why |
|---|---|---|
| `Line::logical_text` (`probe.rs:141`) | **delete** | Byte-identical to `Line::text` — `lines()` already sorts by `x`, and this clones and sorts by `x` again. The two doc comments claim *opposite* semantics. Zero call sites. It is in the shipping library, and it is the one whose name invites trust. |
| `probe::page_text` | **delete** | Zero call sites anywhere. |
| `COMMAND_CATEGORY` (`engine.gen.ts:194-310`, 117 lines) | **delete** | Read by exactly one thing: `enginefacts.test.mjs:93`, the test asserting it exists. Every real consumer reads `CommandDef.category` off the fetched registry. Redundant by construction, inside the generator built to abolish redundancy. |
| `bench-structure.mjs` | **delete**, and pay the debt | 113 lines, never executed by any automated path, two references in the whole repo, and `structure.test.mjs:298-316` already asserts the same two quantities on the same table with a *better* justification (a ratio, so hardware cancels). But its want is real and unserved: nothing anywhere measures the **keystroke** path, and its largest document is 18 KB against a sefer's 500 KB. So delete the unrun tool and move a growth-shape assertion into the file that runs — `availableAt` on 600 rows under 4× its cost on 100, at 400 KB. Five lines, hardware-independent, red when it matters. |
| `readme.test.mjs` | **delete** | Its successor's opening paragraph diagnoses it: *"it asserts twelve key names over one of nine prose files, and zero numbers — which is how nineteen false claims survived forty-five green assertions."* Correct diagnosis, predecessor left running. It also hardcodes the word "eleven". |
| `_ap_columns = (1,1,1,…)` (`ksav.typ:295`) | **delete** | Nine-element array of the constant 1, read through a `_ap_pick` that already defaults to 1. |
| `onAfterCompile` (`compile.ts:21`) | **wire it** | Exported hook, zero registrants. Its sibling `onSchedule` is registered. Consequence: the full-screen preview modal draws once on open and never again, so changing paper size while reading shows a document that has stopped agreeing with the settings. Three lines. |
| `share.ts`, `update.ts` | **keep** | `share.ts` puts the document in the URL **fragment**, which is never sent — the "no server" claim survives intact, and this is the best-designed file in its region. `update.ts` reaches `api.github.com` once a day, desktop only, opt-out, no identity. Fine; ask once at first launch rather than defaulting on, since a fresh install's first act currently contradicts the headline promise. |

---

# Lens 2 — architecture

## 6. `spans.ts` models what Ksav documents usually contain, not what Typst does — and a parenthesis in Hebrew prose corrupts the editor

> ### ✅ Fixed — 7 August 2026
>
> Done as prescribed, and the finding below is kept verbatim. What follows is
> what replaced it, plus the two things the finding did not know.
>
> **The rule.** `lex()`'s delimiter branch now opens code mode on `(` and `{`
> only when the `#` is there or when it is already in code. `[` is unchanged. The
> backwards walk that answers "is there a call here" (`headBefore`) reads the
> lexer's own opener map, so skipping back over `#כותרת(רמה: 2)[…]` and
> `#גמרא[ברכות][ב.]` is a map lookup and the whole routine stays bounded by
> identifier length on the hot path.
>
> **The report was right about `(` and understated it by one case.** It proposed
> "a name or a closing `)`/`]` runs up to it", which is `mode.ts`'s rule. Probing
> the compiler for the fix found that rule is *also* wrong, just less so:
> `#הדגשה[ראה(רש"י) כאן]` — no space — lays out as the four words it looks like.
> In content mode a name running up to a `(` is still prose. It is the hash that
> opens an argument list, and `mode.ts` was the better of two wrong answers
> rather than the right one.
>
> **And the fix had a regression in it that the report did not predict.**
> `#let זוג = ("אלף", "בית")` really is code — verified, `#זוג.at(0)` prints
> `אלף` — so a rule keyed only on the hash would have read a writer's own command
> definitions as prose and stopped their quotes being string delimiters. That is
> the one construct Ksav explicitly invites (Settings ▸ "Your commands"). So
> `#let`/`#set`/`#show`/… now open code mode for the rest of the *statement*,
> which ends at the first newline at the bracket depth it started on. Four
> frames, one of which has no closing delimiter.
>
> **`delimiters()` is the same loop.** It was a second copy, and the copy had
> drifted exactly as the finding says: `lex()` ignored a mismatched closer and
> `delimiters()` popped unconditionally. That is a `recover` parameter now — one
> loop, ~70 lines deleted, and the divergence has to be asked for.
>
> **`mode.ts` holds no scanner at all.** `scan()` and `nameBefore()` are gone;
> `modeAt`, `enclosing` and `legalAt` read a frame stack off `spans.scan()`. It
> got faster in passing — the walk was O(characters before the caret) and ran
> again for each of the three. `callNameBefore` is gone too (scanner #4): the
> command name for an unclosed bracket comes off the `Delimiter` the scan already
> produced, so `brackets.ts`'s lint message can no longer be named by a `#`
> inside a string literal.
>
> **Six of the table's rows are now one function.** Rows 1, 2, 3 and 4 were
> `lex`, `delimiters`, `walkArgs` and `callNameBefore`; row 5 was `mode.ts`.
> `walkArgs` had the `(` bug in its own copy, which is why `splitArgs` merged two
> list items when one of them held `(רש"י)` — a consequence the finding did not
> name. Row 6 (`bidi.ts`) stands, and still declares itself the one exemption.
>
> **The fence was checked by mutation, not by going green.** Restoring the one
> line (`c === 0x5b ? "content" : "code"`) turns seven of the new assertions red
> across four surfaces. It also made `spans.test.mjs` *throw*, which took the
> other fifty-nine files down with it and skipped the documentation fence —
> §12's containment hole, reproduced by accident while proving this one.
>
> **`test/names.test.mjs` did not exist and the check it named does.** It is
> `spans.test.mjs` §4, in both directions. The citation was corrected rather than
> the file created.

**This is the worst thing in the repository, and it is six lines.**

```js
// spans.ts:474
if (c === 0x5b /* [ */ || c === 0x28 /* ( */ || c === 0x7b /* { */) {
  stack.push({ pos: i, code: c, ctx });
  ctx = c === 0x5b ? "content" : "code";
```

**Every `(` opens code mode.** In Typst markup a `(` is a character, no more meaningful than `ג`; it
opens code only when a call name runs up to it. `mode.ts:135-144` knows this, does it correctly,
and explains why in a comment whose example is Hebrew:

> *"A `(` opens code mode when it is a call — that is, when a command name runs up to it. A bare
> parenthesis in prose (`"(ועיין שם)"`) is text, and must not put the rest of the sentence into
> code mode."*

So the two context walkers in this app disagree, and the one in the file named for the job is the
wrong one. Here is what it costs, verified against the real compiler rather than inferred —
`cargo run --release --example probe` on `#הדגשה[ראה (רש"י) כאן]\n#כותרת1[פרק ב]`:

```
engine:  y= 78.79  ראה (רש”י) כאן          ← compiles; the gershayim renders as a curly
         y=116.69  פרק ב                     quote, proving content mode throughout

spans.ts nodes:     הדגשה[0,6) role=other    ← body lost, כותרת1 gone entirely
         strings:   ["י) כאן]\n#כותרת1[פרק ב]\n"]   ← rest of document eaten as a string
         contentGroups: []                   ← "the parts that are prose": none
         brackets:  unclosed@11, unclosed@6  ← two false problems in a valid document
         healed:    #הדגשה[ראה (רש"י) כאן])]\n#כותרת1[פרק ב]\n
```

Follow each consequence:

- **The ribbon dies.** `#רשימה(פריט[דברי (רש"י) כאן],)` → `lists.listAt()` returns **null**. The
  same text without the parentheses returns a list. This is verbatim the failure `spans.ts:29`
  opens by naming as the worst of the fourteen old matchers: *"a gershayim (רש״י — the most common
  word in a sefer) silently switched off every list operation in the ribbon."* It was not fixed.
  It was narrowed by one character.
- **The linter lies and the heal corrupts.** Two false `unclosed` problems, and `analyze()` splices
  `)]` into the middle of a valid document — which is exactly the failure `spans.ts:957-963` says
  `delimiters()` was written to end: *"a correct document was marked broken and the repair broke
  it."*
- **The preview shows the corruption.** `brackets.ts:11-28`: `compile.ts` compiles the *healed*
  copy speculatively on every keystroke. The writer sees a page built from text they did not type.
- **Prose mode, the outline, folds, spell-check and the word count all go blind** past that
  character, because `contentGroups` is empty and `plainTextIn` returns nothing.

**The trigger is a parenthetical citation in Hebrew prose.** `(רש"י)`, `(שו"ע סי' ב')`, `(ע"ב)`. In
a sefer that is not an edge case; it is the register.

**And the fence tests one character to the left of it.** `spans.test.mjs:104` is
`#רשימה(\n פריט[דברי רש"י],\n …)`; `:198` is `#רשימה(פריט[רש"י],)`. In both, the only `(` is the
call's own, which correctly opens code. **Not one test in the file puts a parenthesis inside a
content body.** The guard was built, aimed at the right bug, and loaded with the case that already
worked.

**Steelman.** There is none available. Typst's `(` opens an array or dictionary *in code mode
only*; in markup it is a literal. The engine's own output above settles it. The strongest
defensible position is "we knowingly accepted an approximation" — and the approximation costs the
precise bug the file exists to abolish, so that defence is unavailable.

**Verdict: `rewrite`** — of `lex()`'s delimiter branch, not the file.

**The change.** In `lex()` (`spans.ts:474-478`), open code mode on `(` only when a name or a
closing `)`/`]` runs up to it — `mode.ts:170-189` already has the routine, correct including the
skip-back over a preceding argument group. Apply the same rule in `delimiters()`
(`spans.ts:1017-1019`). Then delete `mode.ts`'s `scan()`/`nameBefore()` and have `modeAt`,
`enclosing` and `legalAt` read the frame stack off `spans.scan()` — turning a divergence into a
shared function. Add the four documents above to `spans.test.mjs`: a parenthesis in a body, in a
list item, in a table cell, at top level.

**The cost.** ~40 lines moved, `mode.ts` shrinks by ~90, one backwards name-walk per `(` in the hot
lexer loop — bounded by identifier length and immeasurable beside the 26 ms full scan. The risk is
concentrated in `legalAt`'s frame-mode check for `מיזוג` (`mode.ts:360-362`), which needs the frame
stack to carry names; `spans.ts`'s `Node` tree already does via `parent`.

### There are six context walkers, and four of them are inside `spans.ts`

The premise I opened with — "there are now two parsers of the Ksav language" — was wrong twice.
`ksav-lang.ts` contains **no grammar**: no Lezer, no stream parser, no tokenizer. It is 1,027 lines
of decoration policy over `spans.ts`. `brackets.ts`, `structure.ts`, `table.ts`, `lists.ts`,
`headings.ts` and `numbering.ts` hold zero scanning code between them. **The consolidation
genuinely happened**, and I went looking for the second parser expecting to find it.

The right question is how many implementations of *content-vs-code context* exist, because context
is the only hard part and it is what all fourteen old matchers got wrong. The answer is six:

| # | | starts in | `"` | `\` | `//` | strings |
|---|---|---|---|---|---|---|
| 1 | `lex()` `spans.ts:402` | content | code only | content only | `:`-guarded | recorded |
| 2 | `delimiters()` `spans.ts:965` | content | code only | content only | `:`-guarded | skipped |
| 3 | `walkArgs()` `spans.ts:602` | **code** | code only | content only | `:`-guarded | skipped |
| 4 | `callNameBefore()` `spans.ts:659` | — | **no** | **no** | **no** | **no** |
| 5 | `mode.ts` `scan()` `:91` | content | code only | **both** | **no guard** | recorded |
| 6 | `bidi.ts` `resolveLineDirections()` `:154` | — | **no** | **no** | **no** | **no** |

`spans.ts:12` names the sin: *"Ten private delimiter matchers lived in `src/` … and they disagreed
about all four of the questions a scanner has to answer."* That is the same table, one layer down,
in the file that wrote it. Row 6 at least declares itself the single exemption. Rows 2, 3, 4 and 5
do not.

They diverge in practice, not in theory. `lex()` **ignores** a closer that does not match the stack
top; `delimiters()` **pops unconditionally**. On `#f(] "רש"י ) עוד` the two produce different
context states over the same sixteen characters — breaking the invariant `brackets.ts:26-27` states
outright (*"the two scanners must agree or the lint would contradict the renderer"*) and which
`spans.ts:27` quotes approvingly as the reason the file exists. **Fix:** one loop with a `recover`
parameter; ~60 lines deleted.

> ### ✅ Fixed — 7 August 2026
>
> Both call sites scan the whole document and filter to `visibleRanges` in
> position space, which is what the finding prescribed and which does reduce
> work. The fence is structural — a value taken from `sliceString` and handed to
> `scan`/`scanOf`/`isolateSpans` within a few lines is a failing test — and it
> was checked against both original bugs *and* against the one legitimate
> `sliceString` in `ksav-lang.ts` (the fold service looking for a block comment's
> close), which it correctly leaves alone.
>
> The **memo** half took a different answer than the one proposed. "Compare
> length and a cheap fingerprint before `===`" cannot work: while typing, the
> four cached documents have the *same length* and differ by one character, so
> any fingerprint cheap enough to be worth computing can miss the edit — and a
> memo that returns a stale scan is a far worse bug than a slow one. Instead
> `scanOf(key, () => text)` keys on CodeMirror's `Text`, which is immutable and
> shared between states that did not change it. That is O(1) on a hit *and*
> skips the `doc.toString()` allocation, which was itself a second pass over the
> document that the finding did not count. Two `Text` objects with identical
> content are two misses, never a wrong answer.
>
> `main.ts`'s hot callers are converted with §18.

And `ksav-lang.ts:53-56` and `bidi.ts:275-277` both feed `scan()` a **viewport slice** —
`doc.sliceString(from, to)` — when `spans.ts:926-928` is emphatic that this cannot work: *"a `"` two
lines up decides whether the bracket in hand is structure or prose."* So the highlighter colours
the same character differently depending on scroll position, and `bidi.ts` isolates a different set
of ranges — and an isolate feeds CodeMirror's caret measurement, which `bidi.ts:55-57` correctly
calls *"a worse bug than the one being fixed: the text would look right and the cursor would lie."*
**Fix:** scan the whole document (memo hit — `proseMode` is already doing it in the same frame) and
filter to `visibleRanges` in position space. Six lines across two files, and it *reduces* work.

**And the fence `spans.ts:237` cites for the command-name table — `test/names.test.mjs` — does not
exist.** It has never existed. The line reads as a guarantee and is a reference to nothing.

### What I got wrong about "it cannot ask the engine"

The README says the editor *"cannot ask the engine, because the answer has to be synchronous, pure
and available mid-keystroke."* That is **true of the compiler and false of the parser**, and the
repository conflated them.

Compiles are dead as a synchronous option and I concede it completely: 14–30 ms for one page, ~1 s
at 68 pages, **5.6 s at 170 pages**, hard-capped at 20 s — and the repo *tried* calling
`ksav_call` synchronously from the page thread and backed out for the right stated reason
(`api.ts:715-718`, wasm-bindgen cannot yield mid-compile).

But `spans.ts` does not need a compile. It needs a parse tree, and `typst::syntax` is already a
direct dependency, already used in `diagnostics.rs` and `jump.rs`. `Source::detached(text)` parses
with no world, no fonts, no assets and no layout. `Source::edit()` *is* Typst's incremental
reparse, built for an editor mid-keystroke. **The service registry has twelve entries and none of
them is `parse`.**

**Verdict on `spans.ts` as an artifact: `wrong-but-keep`, boundary redrawn.** Four things it
provides that a Typst tree does not: `Role` (that `#סימן` is a level-1 heading and `#שער` is not is
*prelude semantics*; Typst sees `FuncCall`); `plainTextIn`'s notion of which arguments are prose;
`delimiters()`'s duty to describe an **unbalanced** document, where Typst error-recovers instead of
reporting a bracket stack; and the fact that the 29 MB engine is tree-shaken out of every
non-WASM build, so a parse service is another IPC hop in Tauri and HTTP.

**The change is not "delete `spans.ts`." It is: add a `parse` service (`Cost::Quick`) and use it as
a differential oracle in CI** — sweep the template and insertion corpora, assert `spans.scan()`'s
content/code partition agrees with Typst's own `SyntaxKind` at every offset. ~150 lines of Rust and
one test. **It is the only mechanism that would have caught the `(` bug, because it does not depend
on somebody thinking to type a parenthesis.** The runtime path stays exactly as it is.

**The alternative I rejected:** run the parse through the async backend on a debounce and accept a
frame of lag. It loses, and not for the reason I assumed. It loses because `proseMode` is a
`StateField` whose decorations must be derivable from `EditorState` synchronously — CodeMirror's
contract, not a preference — and because `insertionAt` (`mode.ts:258`) must decide whether to write
a `#` *inside the same click handler that dispatches the edit*. Neither can await.

---

## 7. Every feature is built twice, across a boundary drawn on the wrong axis

**This is the structural claim, and it explains why naming `main.ts`'s size did not work.**

The previous report said `main.ts` was 5,653 lines. It is now **5,721**. Naming a file's size is not
a finding, because it does not say what the file *is*.

`main.ts` carries 26 self-labelled section banners, and their names are module names — *spell
check*, *hydra*, *table editing*, *styles panel*, *review*, *command palette*, *macros*, *notes
chooser*. Those modules exist. Here is the split:

| feature | lines in `main.ts` | its module | % in `main.ts` |
|---|---|---|---|
| styles panel | 273 | `styles.ts` 274 | **50%** |
| hydra | 181 | `hydra.ts` 165 | 52% |
| settings | 429 | `settings.ts` 395 | 52% |
| app chrome | 633 | `panels.ts` 528 | 55% |
| review | 174 | `review.ts` 141 | 55% |
| spell check | 486 | `spell.ts` 365 | 57% |
| notes chooser | 287 | `apparatus.ts` 199 | 59% |
| snippet insertion | 198 | `macros.ts` 127 | 61% |
| templates / exports | 476 | `exports.ts` 289 | 62% |

The extraction wave that produced `panels.ts`, `runtime.ts`, `bindings.ts`, `commands.ts`,
`save.ts` and `compile.ts` stopped at the boundary where extraction was *mechanical*: pure
functions came out, everything that touches `runtime.view` stayed. That split the codebase along
**purity**, not along **feature** — so every feature now lives half in a tested module and half in
the one file no test can see.

`main.ts` is the only module in `src/` with no unit test. `bindings.ts:8-12` already says why:
*"every module that got extracted got tested, and the god module didn't."*

**And that is where the corpses are.** Not by coincidence — by construction:

- **The macro recorder does not record.** `noteAction` has exactly one caller (`main.ts:3869`,
  inside `runStructureAction`). Press F3, Ctrl+B, F4 → *"Nothing was recorded."* Bold, italic,
  footnote, endnote, headings, bullets, tables, alignment, the three review marks, all three
  defer operations — every one a first-class `ACTIONS` entry with a shipped key binding, all
  invisible. The text half doesn't rescue it: the listener filters on `tr.isUserEvent("input")`
  and `insertSnippet` dispatches unannotated. `macros.ts` is 128 lines of correct design with an
  exhaustive test suite; the three lines that make it a feature are in the untested file and they
  are wrong.
- **The command palette contains no commands.** `renderPaletteList` (`main.ts:2902`) reads
  `commands.available(runtime.commandsReg)` — the engine's *content* registry. Neither the 43
  `STRUCTURE_ACTIONS` nor the ~30 shell `ACTIONS` appear. Type "table" into Ctrl+K and you get
  `#טבלה`. You cannot get "insert row below", "save", "record macro", or "export PDF" — the one
  surface labelled **Commands** is a symbol picker.
- **The greyed control is live.** `previewSideToggle` (`main.ts:2076`) passes `"chip disabled"`.
  `iconBtn` (`dom.ts:67-73`) has no notion of a disabled state and never sets the attribute;
  `styles.css:177` is `opacity: .4` with no `pointer-events`. It clicks, it saves, it fires a full
  chrome rebuild, and it announces itself to a screen reader as enabled. The ribbon, the menus and
  the hydra all set `disabled` correctly — two conventions in one file, and the cosmetic one is in
  the constructor every header chip goes through.

**The change.** Extract in order of test value, not size: `actions.ts` first (with the `runAction`
dispatcher §7 needs), then `insert.ts`, `header.ts`, then the panel renderers. Each is mechanical —
they already import `runtime.*` rather than closing over locals.

**The cost, honestly.** ~15 new files and a week of churn against a file that is currently stable
and shipping. That is real, and it is the argument for not doing it. The counter is that the next
feature added to `main.ts` is added to a file no test can see, and this report is what that costs.

---

## 8. One registry, and a hand-written second copy in the file the fence can't reach

The previous report found ten registration sites. The fix — one registry plus a fence — was the
right fix and it worked *where it was applied*. What it could not do is reach `main.ts`, so the
repo now has one source of truth **and** a hand-typed copy beside it.

```
commands.rs:89   cmd!("רשימה", …, "#רשימה(\n  פריט[|],\n  פריט[],\n)")    ← two items
main.ts:427      { id: "bullets", run: () => insertSnippet("#רשימה(\n  פריט[|],\n)") }  ← one
```

**Clicking the toolbar's • gives you a two-item list. Pressing Ctrl+Shift+8 gives you a one-item
list.** Same operation, same product, two documents. `buildToolbar` (`main.ts:1620`) does it the
right way — `byName("הדגשה")` → `c.insert` — so both conventions live in one file, twenty lines
apart. The table snippet is written out three times (`commands.rs:102`, `main.ts:433`,
`main.ts:1852`); those three currently agree, which is luck.

**The same shape, four more times:**

- **`openNoteMenu` bypasses the producer that claims to be the only one.** `applyNoteChoice`
  (`main.ts:4521`) is docstringed *"The only place that does."* `openNoteMenu` (`main.ts:2678`),
  1,800 lines earlier in the same file, hand-lists six note commands out of eighteen and calls
  `convertNote`, which writes `#${command}[${body}]` and nothing else — no `head`, no `tail`, no
  `wrap`. Right-click a footnote, convert it to `#הערתסיום`, and you get an endnote with no
  `#הערות_בסוף()`: the "collected and never printed" failure, performed by the product, then
  reported to the writer by a lint.
- **The Mekoros panel bypasses `insertSnippet` entirely** (`main.ts:1253`, a raw `view.dispatch`).
  So the `deferNoteBodies` preference — honoured by toolbar, palette, keyboard and modal — is not
  honoured by the source-citation panel, which is the most sefer-specific note in the product.
  `citation.ts` is a single producer for the *markup* whose own test sweeps `src/*.ts` to keep it
  the only one; it then hands its output to the one path the app is forbidden to use.
- **The fence's marker list is six Hebrew literals** (`notepaths.test.mjs:95`) — no English
  spellings, no side/stream/margin command, not `#מראה_מקום`. The hole is exactly the shape of
  what was not being fixed the day it was written.
- **Seven readers of `commands.rs`**, four distinct implementations, and they *already disagree
  about how many commands exist.* `coverage.test.mjs:37` and `notecommands.test.mjs:51` are
  **byte-identical** 200-character regexes. `emit-insertion-fixtures.mjs:106` is the same regex
  minus one group. `docfacts.mjs:91` and `card.mjs:83` are both the naive `/^\s*cmd!\(/gmu` — and
  that one counts **`commands.rs:39`, the macro's own recursive expansion**, as a command. So the
  structured parsers see **115** and the counters see **116**, and since `docfacts.mjs` is the
  fence that guards counted claims, the wrong number is the enforced one:
  `ksav/README.md:313`, `ksav/README.md:346` and `docs/start-here.md:44` all say **116 commands**.
  There are 115. *(Correction to an earlier draft of this report: the structured regexes handle
  escaped quotes correctly — all 24 rows containing `\"` match. The divergence runs the other way,
  and it is in the naive counters.)*

**The change.** `ACTIONS` entries that insert a registry command carry `command: "רשימה"` instead
of a snippet string, and `run` becomes `insertSnippet(runtime.commandByName(id)!.insert)` — a
function `runtime.ts:69-71` already exports and nothing calls. Add `runAction(id)` that looks up
`ACTIONS`, calls `noteAction(id)`, then runs — which fixes the macro recorder and the palette in
the same edit. Derive `notepaths.test.mjs`'s markers from `NOTE_BODY_COMMANDS`. **Cost:** ~60
lines, and `ACTIONS` gains a dependency on the registry having loaded, which needs a null guard —
strictly more honest than today's silent fallback to a stale string.

---

## 9. The prelude is a string, and the bill is now measurable

The previous report found this. It is here again because it is now **measured**, and the numbers
are worse than the prose that describes them.

`assemble_source` (`lib.rs:623-694`) emits `{sefer table}\n{prelude}\n#show: מסמך.with(30 args)\n\n{body}`.

**The prelude is 112,810 bytes.** `lib.rs:568-570` says 75 KB. `lib.rs:832` says 83 KB. Both are
quoted in arguments about cost. They are 36% stale.

Measured on this machine, release profile, one-page preview:

| | ms |
|---|---|
| `assemble_source` (113 KB `format!`) | 0.54 |
| `TypstEngine::builder()…build()` | **7.31** |
| `compile_parts`, 1 page | **9.55** |

**76% of a one-page preview is constructing the world, not laying out the document.** 5.66 ms of
that is `typst::Library::builder().build()` — the entire Typst standard library, rebuilt from
scratch on every keystroke, because `typst-as-lib` calls it unconditionally with no setter to
supply one. 1.6 ms is the six bundled fonts being *copied and re-parsed*, because `impl IntoFonts
for &[u8]` is `Font::iter(Bytes::new(self.to_vec()))` and `lib.rs:711-718` hands it 2.04 MB of
`&'static [u8]`.

And the downstream tax: ~260 lines of `diagnostics.rs` (`body_offset`, `line_column`,
`span_range`, `where_it_happened`, `enclosing_let`, `sole_call`) exist solely to undo the
concatenation. `enclosing_let` resolves a prelude span by *scanning backwards through 111 KB of
Typst for the nearest column-0 `#let`*, was silently wrong until anchored to column 0, and needs a
360-binding sweep to stay right. `sole_call` then guesses the writer's line by checking whether
they called the command exactly once, and honourably refuses when they called it twice.

**All of it is a substitute for a `FileId`** — and the engine already resolves virtual files
(`lib.rs:730`, `.with_static_file_resolver`, used today for attached images).

**Steelman.** The sefer catalogue must precede the prelude because Typst closures capture their
defining scope, so the index functions cannot see a table defined after them. `lib.rs:627-632` is
correct about that. But it is a constraint *created by* putting the catalogue in the source instead
of in `sys.inputs`, which `typst-as-lib` supports.

**The change.** Catalogue to `sys.inputs`; prelude as a resolved file; main source becomes
`#import "ksav.typ": *\n#show: מסמך.with(…)\n\n{body}`. `body_offset` and its three consumers die.
Typst stops re-parsing 2,324 lines of prelude per keystroke. **Cost:** a week, touching
`diagnostics.rs`, `jump.rs`, `include.rs`; high risk of an off-by-one *during* and zero after.
This is the change to schedule, not the one to start this afternoon.

---

## 10. Smaller lens-2 verdicts

| What | Verdict | The claim |
|---|---|---|
| `_en_params` (`ksav.typ:31-58`) | **rewrite** | One flat 60-entry table applied to every alias. `align` and `justify` both map to `יישור` — so `#headings_config(justify: center)` silently sets heading *alignment*. `title:` maps to `כותרת` while `מסמך`'s PDF title is `כותרת_מסמך`, so `#document(title: …)` errors. **Twelve `מסמך` parameters have no English spelling at all** — every one of them a two-sided-printing knob, i.e. the entire feature set an English writer reaches for when actually binding a book. And the table has escaped: `diagnostics.rs:490` string-parses it out of the prelude by splitting on `,`. |
| Five definitions of "a document" | **rewrite** | Store record, `.ksav` file, share link, crash rescue, library index. The `.ksav` codec learned that custom commands and page setup must travel (`docs.ts:440-446`). The share link did not: `encodeShare` carries `{title, body, dir}`. A document with a custom `#let` produces "Link copied ✓" at one end and a compile error at the other. |
| `openFile` on a bound file | **rewrite** | Reads the file, finds a library entry bound to that path, **discards the text it just read**, opens the IndexedDB copy, and calls `watch.markInSync` — stamping the current on-disk mtime as agreed. `watch.ts:5-9` names Dropbox, a second window, another editor and `git checkout` as why it exists. The conflict is not missed, it is erased. Ten lines; every piece already exists. |
| `have_pages` sits above `compile_parts` | **rewrite** | Measured on a 28-page document: layout 42 ms, **SVG serialisation of all 28 pages 310 ms**, fingerprinting 33 ms. The cache correctly saves 9.7 MB of bandwidth and costs 343 ms/keystroke to produce bytes it then declines to send. `want_pdf` and `want_source` were pushed *down* into `compile_parts` for exactly this reason, with a good comment. This reframes `Cargo.toml:104-113`: LTO takes 258 ms → 175 ms, a real 32%, off a number a frame-keyed page cache cuts by ~85%. |
| One CSP for three threat models | **rewrite** | The cure for three drifted hand-written policies was to take the **union**, so `connect-src https://api.github.com` now ships to the two builds that never make that request and *do* ingest other people's documents, and `ipc:` ships to the browser. The build now asserts the policies are the same, and they shouldn't be. |
| `policy` module unconditional (`lib.rs:26`) | **rewrite** | Its only runtime caller is `#[cfg(not(wasm32))]`, so the wasm module carries a CSP for a server it does not contain — precisely the finding `lib.rs:29-44` is proud of having made about `girsa-source`, three lines above, uncaught. One `#[cfg]`. |
| `emit-engine.mjs` parses `lib.rs` by byte range | **rewrite** | `src.indexOf("impl Default for DocConfig")` then `.slice`. `services.rs:126-134` got a `#[rustfmt::skip]` and a paragraph warning that its formatting is a build input. `lib.rs:244` got nothing. Reflow it and the client silently ships different defaults. Derive `Serialize` and emit a value. |
| `GET /inbox` destroys state | **rewrite** | `drain()` empties memory and truncates the file, reachable as an untokened `GET` on `ksav serve`. Any page in the writer's browser can `fetch` it; the quotation is gone from disk even though the reply can't be read. `ksav serve [addr]` takes any bind address, so on `0.0.0.0` the reply is readable too. The comment at `server.rs:432` — "it binds to loopback and holds no secrets" — was true before `/inbox` existed. |
| `parts` sent whole per compile | **rewrite** | The docstring says a chapter "changes on the very keystrokes that trigger the compile." It doesn't — the writer is editing exactly one document, and `compile.ts:174` memoises the others on `updated`, a stable content key. A ten-chapter sefer ships ~2 MB of unchanged Hebrew four times a second. |
| Three `api.ts` backends | **rewrite** | 312 of 582 code lines are three transport classes, ten of whose twelve methods differ only in `this.send(name, obj)` vs `JSON.parse(await this.call(name, JSON.stringify(obj)))`. Every layer *below* `api.ts` already collapsed to `(ServiceName, string) → Promise<string>`. The registry unified the dispatch and left the façade triplicated. |
| `compile_html` drops `comemo_evict_max_age` | **rewrite** | Copy-pastes `engine_for`'s body and loses one line. `typst-as-lib` defaults to `Some(0)`, which evicts *everything*, globally. One click on **Export Word** flushes the entire Typst memoisation cache and the next keystroke is a cold compile — defeating a nine-line comment 500 lines above explaining why the cache must survive. **Twenty minutes.** |
| `lib.rs:203-242` is an eleventh scanner | **wrong-but-keep**, fence it | `spans.ts:1-30` is a monument to ten client-side matchers disagreeing about `"`, `\`, `//` and `{}`. That ruling stopped at the wire. `auto_notes_region_cm` is a naive `find` with no string or comment tracking, so a *commented-out* `// #מדף_א[…]` reserves 3 cm at the foot of every page. The test at `lib.rs:1292` checks the prose-mention case and stops one case short. Add the two tests now (twenty minutes, they will fail); share the corpus, not the implementation. |

---

# Lens 3 — implementation

## 11. The Hebrew suggestion menu is 4% useful, and the fix is computed and thrown away

> ### ✅ Fixed — 7 August 2026
>
> Done as prescribed, and the finding below is kept verbatim. Two of its facts
> were wrong and both changed the work.
>
> **The mechanism.** `build_lexicon.py` now bands each kept word by its **rank
> position** within a corpus, and the band travels in the generated lexicon as an
> optional tab-separated field. `add_words` parses it, `ByLength` stores it beside
> the letter mask, and `suggest_scored` adds it under the transposition step so a
> common word can never beat a closer one. English moved onto the same field in
> passing — it was calling `common::band()` inside the scoring loop, a
> `to_lowercase()` allocation and a hash lookup per surviving candidate.
>
> **Measured, and the numbers are better than the projection.** On four hundred
> substitution typos of the six thousand commonest words in the corpus:
>
> | | first | in the five-item menu |
> |---|---|---|
> | bands stripped | 81/400 (20.2%) | 236/400 (59.0%) |
> | as shipped | **221/400 (55.2%)** | **379/400 (94.8%)** |
>
> 304 of 400 rank higher, 7 lower. Of the 21 that still miss the menu, **0 are
> absent from the lexicon** — every remaining failure is ranking, not coverage,
> which is the distinction an `!is_empty()` assertion could never have drawn.
>
> **Correction 1: the corpus cache is not committed.** The finding says *"the raw
> corpus is still sitting in `engine/tools/.corpus-cache/`… committed"* and *"the
> corpus cache is committed, so `--offline` suffices"*. It is in
> `.gitignore:52`, and it is 78 MB for the Ben-Yehuda counts alone. Nobody else
> can reproduce the bands, which is exactly why they had to be **baked into the
> shipped lexicon** rather than computed at load. +140 KB on a 3.45 MB asset,
> against the ~20 KB the finding estimated.
>
> **Correction 2: hand-picked typo pairs are the wrong instrument, and writing
> them first proved it.** Ten pairs were listed by hand in the style of the
> English tests; six failed, and the failures were the *design working*. `הלכח`
> transposes to `הכלח`, a real word, and a transposition outranks a substitution
> at the same distance on purpose. A list of pairs that pass is indistinguishable
> from a list of pairs that flatter. So the fence is a **floor over a
> deterministic sample** — 45% first, 88% in the menu, well under what is
> measured — plus a second test that scores the same sample against the same
> words with the bands stripped and requires that column to be markedly worse.
> The floor alone would still pass if the bands were ignored and the lexicon
> merely got smaller.
>
> **The sampler is in the library, beside `probe`.** `spell::measure` is shared by
> `tests/spell.rs` and by `examples/suggestrate.rs`, for the reason `probe.rs` is
> in the shipping library: a claim about what the product does has to be checkable
> by something that runs. A test whose sample differs from the tool's is a test
> measuring something nobody looked at.
>
> **What the finding got exactly right, and it is the whole thing:** the
> `common.rs` paragraph declining to rank Hebrew was intellectually honest and
> factually wrong about its own repository. That paragraph now says so, quoting
> itself.

**This is the best finding in the report, and it is in the one place the product cannot afford one.**

R3 replicated `hebrew.rs::suggest_scored` exactly against the shipped 269,390-entry lexicon — same
fold, same mask, same OSA distance, same tie-breakers, same sort — and sampled substitution typos
from the 4,000 commonest words of the corpus the lexicon was *built from*:

| | intended word offered **first** | intended word in the **five-item menu** |
|---|---|---|
| Hebrew, as shipped | **7/200 (4%)** | **45/200 (22%)** |
| Hebrew + corpus frequency band | **39/200 (20%)** | **151/200 (76%)** |

`הלכח` → `הלכה` ranks **12th**. `ברכח` → `ברכה` ranks 13th. `שבתת` → `שבת` ranks **16th**. The
default menu is five.

The cause is stated in the codebase, in `common.rs:41-46`:

> *"Hebrew gets nothing here. A frequency order for Hebrew that covered seforim rather than
> newspapers is a real piece of work and **guessing at one would be the invented-evidence
> problem**… in the language this project is actually for."*

That paragraph is intellectually honest and it is **factually wrong about its own repository.**
`build_lexicon.py:225` accumulates `counts[w] += 1` across every Sefaria segment. `load_benyehuda`
returns a `Counter` over 26,000 works. Line 230 then reduces both to sets on a threshold and writes
the result **sorted alphabetically**. The counts are computed, used once as a cutoff, and
discarded — and the raw corpus is still sitting in `engine/tools/.corpus-cache/`, 1,589,065
distinct forms, committed.

Rebuilding the bands from those counts is not invented evidence. It is *strictly better
provenance than the hand-typed 200-word English list the file already ships*.

**And the guard could not have caught it.** `suggestions_are_offered_for_a_near_miss`
(`tests/spell.rs:182-186`) asserts `!suggestions.is_empty()`. Both Hebrew suggestion tests assert
existence. English got five *ordering* tests, a frequency layer, a proper-noun penalty tuned twice,
a supplement-redundancy fence and a lowercase fence. **Hebrew — the product — got none of the
five.** This is `ONLY_AT_TOP` again, in the shape the memory says this repo keeps rebuilding: a
green assertion that cannot fail for the thing that is wrong.

**Steelman.** The invented-evidence worry is real and the discipline behind it is admirable — it is
exactly the instinct that makes the rest of this codebase trustworthy. Ranking Torah Hebrew by
newspaper frequency would be worse than not ranking it. And `rank`'s scale (`spell/mod.rs:423-425`)
already reserves room below the transposition step, so a wrong band costs one place, never a
wrong-word-first.

**The steelman is the argument for using the seforim corpus, which is what was measured.**

**The change.** Builder emits `word\tband`, band ∈ 0..3 from corpus rank (top 500 / 2,000 / 6,000 /
ranked). `add_words` parses the optional field. `suggest_scored` adds `+ band` exactly as
`english.rs:256-259` does. Port the five English ordering tests to Hebrew.

**The cost.** ~15 lines of Rust, ~6 of Python, one regeneration (≈20 KB larger; only ~10k entries
are ranked). The corpus cache is committed, so `--offline` suffices. **This is the highest
value-per-line change in the entire repository.**

---

## 12. What I got wrong about the tests, and what is actually wrong with them

**Conceded.** The hand-rolled fakes are not a worse jsdom. Three of the four are *instruments*
measuring things jsdom cannot express: `FakeElement.writes` counts `innerHTML` assignments (the
entire thesis of the page cache — "an unchanged page must not be rewritten with the same string");
`FakeIntersectionObserver.report()` makes "what is on screen" an input, so a test can scroll a
reader away, change the document, and scroll back; `MemoryStorage.quota` throws
`QuotaExceededError` on demand, which is the only coverage of the bug `docs.test.mjs:1-6` says
"disqualified the product." And `fakeView` is a **real** `EditorState` with a fake screen — the
right thing to fake was the view, not the state. That is a better decision than vitest would have
handed over, and the zero-dependency property is genuinely free because `esbuild` and
`fake-indexeddb` are already in the tree.

**What is actually wrong is the runner, and the region's blindness to itself.**

`run.mjs` is 125 lines with no `process.argv` handling — there is no `npm test -- panels`. The
inner loop is the whole suite: **14.2 s warm, 33.8 s cold**, of which **~7.8 s (55%) is six
sequential `node` process spawns on Windows** from the `&&` chain in `package.json:8`. And
`run.mjs:70` is a bare `await mod.run()`: a *thrown* test — not a failed assertion — unwinds into
an unhandled rejection, kills all 60 files, and skips the runtime-count fence at `:93` because it
sits inside `if (!fail)`. `coverage.test.mjs:102-108` does `ok(…, !!filter)` and then immediately
`filter[1].replace(…)`; rename a local in `main.ts` and the suite dies on a TypeError.

Then the mirror. This region contains the best "one want, satisfied once" enforcement in the
repository — `enginefacts.test.mjs`'s prohibition sweep, `runner.test.mjs`'s *executed* exemptions
(it builds `wasm-worker.ts` and fails if it **succeeds**), `chrome.test.mjs`'s absence-only
regexes. It applies none of them to itself: seven readers of `commands.rs` in four
implementations, two of them byte-identical; four copies of one esbuild helper; three hand-rolled
DOMs; one comment paragraph copy-pasted verbatim into three generators; and **24 copies of a path
expression against 6 correct uses of `fileURLToPath`, sitting beside `SRC_DIR` — an export written
to prevent exactly that, which nothing imports.** The hand-rolled version doesn't decode
percent-escapes, so a checkout under a path with a space breaks all 24.

**And this is not a hygiene complaint — one of those duplications is wrong on a user-facing page
right now.** See §8: the two naive `cmd!` counters include the macro's own recursion, so the
enforced command count is 116 and the registry holds 115.

The sweeps read `src/`. They have never looked in `test/` or `tools/`, which is precisely where
the duplication that survived is living.

**Cheap wins, ranked:** fold the six spawns into one process (~40 lines, halves the inner loop);
`process.argv` filter (~6 lines, makes single-file runs possible at all); `try/catch` around
`mod.run()` (~5 lines); `fileURLToPath` in 24 files (one sed, fixes a real portability bug).

**One more, in the engine suite:** `spell_en.rs` builds the 96,000-entry English lexicon **~88
times** — `bundled()` is a fresh parse on every call, and `check()` calls it. `spell/mod.rs:623-632`
has the `OnceLock` fix, thirty lines away, under the comment *"A quarter of a million entries is
not something to rebuild per keystroke."* Four lines.

---

## 13. The hot paths nobody has walked

**Per arrow key, inside a table**, `updateContextBar` (`main.ts:3446`):

1. `doc.toString()` — a fresh 200 KB string allocation and copy.
2. `heads.headingAt(doc, pos)` called with **two** arguments, so `headings.ts:85`'s default
   parameter fires a **full-document parse** — to set the value of a `<select>`. The
   `StructureContext` built three lines later already caches this and the answer is discarded.
3. `contextAt`'s memo hits, at the cost of a **full string comparison** of the freshly-allocated
   200 KB against the previous one.
4. `keybindings()` called **inside** the per-action loop — 17 times in a table, ~850 property
   copies for a value that cannot change mid-loop. `structureMenuItems` in the same file already
   hoists it correctly.
5. `bar.replaceChildren(…)` — the entire ribbon destroyed and rebuilt, ~17 listeners garbage per
   caret move.

`updateCounts` in the same file is debounced 200 ms with a comment measuring 1.9 ms and 6.4 ms on
64 KB and 192 KB documents. `updateContextBar` does strictly more work and is not debounced at all.

**Per keystroke**, `main.ts:974-985`, undebounced: `renderReviewPanel()` (full scan + rebuild of
the panel *including the focused reviewer-name input*), `renderOutline()` (full scan + rebuild),
`renderNotesPane()` (`notesIn(doc)` full scan, then `plainText()` per note — on a sefer with 200
notes, 200 scanner invocations and ~600 DOM nodes). These are the two panes a writer keeps open
*while writing*.

**Per note insertion**, the whole document is replaced: `applyChoice` returns whole text and
`main.ts:4535` dispatches `{from: 0, to: doc.length}`. On a 500 KB sefer every `†` press throws
away the syntax tree, every decoration, every lint mark, and **every open fold** — including the
`//{` regions the app itself invites you to make. The producer knows its three insertion points;
returning `{changes: […]}` is ~30 lines.

**In the apparatus**, `_ksav_is_real` (`ksav.typ:166`) runs **two** `before()` queries per element,
and `_ksav_rank` calls it per element — Θ(n²) queries per apparatus per layout pass. `_pp_page_bands`
re-derives the document-global real-note set **in the page footer**, which re-runs several times per
page during page breaking: a 300-page sefer with 2,000 band notes is ~3.6M `before()` queries to
compute the same set 900 times. And each sidenote independently queries all sidenotes on its page,
measures every one at column width, and replays the whole stacking loop to find itself — m²
measurements and m²·n queries per page, per pass.

**In the source model**, measured on a synthetic sefer at three sizes (esbuild-bundled from `src/`):

| doc | nodes | full rescan | memo hit | `availableAt` | `headings()` |
|---|---|---|---|---|---|
| 36 KB (~15pp) | 550 | 6.6 ms | 0.08 ms | 2.3 ms | 0.9 ms |
| 144 KB (~59pp) | 2,200 | 4.6 ms | 0.26 ms | 4.5 ms | 2.4 ms |
| **575 KB (~235pp)** | **8,800** | **26.7 ms** | 1.9 ms | **10.7 ms** | 5.0 ms |

Two things in there are worse than they look:

- **The memo's lookup is O(document), and typing is its worst case.** `spans.ts:815-822` linear-probes
  four slots with `CACHE[i].text === text`. While typing, every slot holds a document of *the same
  length* differing by one character — the previous keystroke, the speculative healed copy, the
  current text — so V8's length and pointer fast paths both miss and each probe is a full memcmp.
  Measured on a 420 KB document: **0.002 ms with one entry, 0.435 ms with the editing set. A 200×
  regression on the operation the header calls free.** `spans.ts:810-812` says *"a handful of
  entries covers a keystroke and the speculative healed copy compiled beside it"* — that handful is
  precisely the pathological set. **Three lines:** compare length and a cheap fingerprint before
  `===`, or key on `state.doc` identity in the two hot callers. Cheapest win in the report.
- **The fold service is O(lines × nodes).** `ksav-lang.ts:936` calls `scan(doc.toString())` — a full
  document allocation — **per fold query**, then loops to the end of the document calling
  `sectionLevelAt`, which restarts its walk from node 0 every time. Measured on 420 KB / 10,400
  lines: **4.26 ms for a query on the last heading**, 0.04 ms on the first. Worst near the end of
  the document, which is where someone writing a sefer actually is. `outline()` already computes
  the heading list; cache it on the `Scan`.

And `bench-structure.mjs` cannot see either. Its largest document is **18 KB** against a real
200-page sefer's 500 KB, and every case holds `doc` fixed — so `scan()` is a memo hit in every
iteration and the keystroke path is never exercised. The file whose header says *"the shape to
watch for is the cost growing faster than the table"* watches one path, at one twenty-eighth of
scale. At real scale a caret move is 10.7 ms, not the 1.0 ms it reports.

**Elsewhere:** the document record is re-serialised whole on every 600 ms autosave *including
base64 image bytes* (a 4 MB photo is 5.5 MB per typing pause); `docBoundTo` opens one IndexedDB
transaction per library entry on every Open; `rebuildIndex` loads every document body and every
asset to produce a list of titles, on the recovery path, which is when the library is largest;
`מראה_מקומות` (`ksav.typ:1812`) uses an array as a set, Θ(k²) over every citation in the sefer —
while the index code twenty lines away does the same job correctly in linear time.

---

## 14. The documentation is the same bug, in prose

`docs/start-here.md:67` — the page the root README hands a new user at line 14 — says:

> **`Ctrl+Alt+F`** takes a note you already wrote inline and sends its prose to the end

`bindings.ts:106-107`: `// Moved off Mod-Alt-f, which is Word's footnote key.` /
`deferHere: "Mod-Alt-Shift-f"`. `Ctrl+Alt+F` is bound to **insert footnote**. The generated card,
one directory away, prints `Ctrl+Alt+Shift+F` and is correct.

`git log -S` dates it: commit `7d87498` made the move on 4 August, and the doc still said the old
key **in that same commit**. It then survived `7c90582` — *"Nineteen numbers nobody counted"* —
**the commit that built the documentation fence and swept that exact file for numbers, while a
wrong key name sat one line away.**

That is the fence's shape, exactly. It counts. Every documentation failure this repository has
actually shipped was qualitative: `Ctrl+Alt+D` printed as "Mark as deleted"; `LICENSE` arguing
about a `spell.rs` that stopped existing; this. There are **nineteen keyboard chords written in
prose** across three living pages, of which `readme.test.mjs` checks five names in one file.
`docs/start-here.md` has eight and nothing checks any of them.

**The change.** One more sweep: every `` `Ctrl+…` `` in a living page must appear on the generated
card, on a row whose English label is a substring of the sentence containing it. ~25 lines, and it
will reject two or three legitimate paraphrases the first time — which is the price of a fence
tighter than "the key exists."

Also, from the same region: `README.md:123` says "Nine dated waves"; there are ten. The fence
missed it twice over — `numericClaimsIn` matches `\d` and "Nine" is a word, and "waves" is not in
`NOUNS`. `ksav/README.md:7-8` points at `../src` and `../ksav_flutter_rust`, paths that moved a
fortnight ago, invisible because the prose-path sweep requires a file extension.
`docs/start-here.md:194` ships *"96,184 English / English ones"* **inside a fenced sentence** — the
fence guarantees the number and cannot read the sentence.

And `ksav/README.md` is 903 lines of which ~161 are how-to-use and ~310 have a past defect as their
subject — **2:1 against the reader who came to use it.** The worst is a parenthetical about a
deleted Rust constant, nested inside a paragraph about a documentation test's exemption list, in
the README of a Hebrew word processor. This is the same seam `decisions/` was invented to cut, in
the file that describes `decisions/`. **Verdict: `rewrite` (split, not cut)** — `ksav/DESIGN.md`
takes the ~340 lines whose subject is how this repository stopped being wrong; it is not a dated
log, so it stays a living page under the sweep. Nothing is deleted.

---

## 15. Things I tried to design better and couldn't

Not a compliment quota. Five places where I built the alternative and it lost.

1. **`services.rs` + `emit-services.mjs`.** Four hand-kept copies of one list, three wrong at the
   moment of writing, one of which (`sefarim` missing from the worker table) meant citation
   autocomplete was silently dead in the offline build for a month. The registry turns that class
   into a `tsc` error, and `vite.config.ts:112` derives the dev proxy from it — which used to carry
   5 of 12 routes, so click-to-jump 404'd under `npm run dev` for the whole life of the feature. I
   tried runtime fetch (types nothing), a shared JSON schema (authoritative for nothing, since the
   Rust table holds `fn` pointers), and `ts-rs` (cannot produce `sw-services.gen.js`, which lives
   outside the module graph). All three lose. This is the best decision in the repository.

2. **The three fixture generators.** `emit-structure-fixtures.mjs:5-8` is unanswerable: *"Balanced
   brackets are not legal Typst, and a pure-function test cannot tell the difference. Only the
   compiler can."* 384 of 1,026 insertions broken, found by a mechanism no manual process would
   have enumerated. These are cross-language property tests wearing the word "generator," and they
   are the thing this project should be proudest of.

3. **`_ix_fold` / `_ix_sortkey` / `_ix_gematria` (`ksav.typ:1856-1911`)** with the three-language
   oracle in `one_want.rs` against `fixtures/fold-cases.json`, plus a floor assertion so the corpus
   cannot quietly shrink. The bug it records — one implementation iterating `clusters()` and the
   other `chars()`, so `שַׁבָּת` folded to the empty string and every fully-pointed masechta collided
   with every other — is the kind of thing that takes a week to find and ten seconds to reintroduce.
   Sixty lines, and the best-engineered sixty in the file.

4. **The preview render pipeline.** `applyPreview` reads **no** layout property, and that is
   guaranteed *by construction* rather than by discipline: `previewStyle` takes no pane width, so
   it cannot read one. The finding it replaced — 7,690 ms of forced layout from reading
   `clientWidth` after writing 82,500 SVG nodes, to compute a value that turned out to be
   `min(100%, …)` — is the single best fix in this repository, and splitting `previewStyle` out of
   `previewGeometry` so the tests keep the measured half is the right way to have made it.

5. **The `decisions/` partition, and I checked it empirically.** `git log --follow` over all ten
   dated files: every one has exactly one commit since it entered the directory; one shows `0 0` on
   `--numstat -M`, a byte-identical rename. The append-only contract **holds**. And the exemption is
   checked from both ends, with a recorded mutation test — adding `docs/start-here.md` to `LOGS`
   turned the sweep off for a living page with a green suite. That is a genuinely falsifiable
   design and most repositories get this wrong. (One repair: the split broke "the document
   **above**" in four files, and the verbatim rule forbids the obvious fix. Add one clause — *a
   cross-reference broken by the split is a typo* — and fix the four.)

---

## 16. Appendix: the duplication, sorted by what it actually costs

Added 7 Aug after the question *"is there really duplicated code here?"* — because the answer is
yes, no, and it depends, and the useful axis turns out to be **caller count**, not similarity.

The tempting split is "exact copies have no purpose, delete them; partial copies have a purpose,
compact them." That breaks on the middle case, which is most of the volume: `coverage.test.mjs:37`
and `notecommands.test.mjs:51` hold a **byte-identical** 200-character regex, and both files
genuinely need a parser. The *duplication* has no purpose; both *uses* do. There is nothing to
delete — there is one module to extract.

### Bucket 1 — zero callers. This is the only place "delete" is literally right.

| | callers | out |
|---|---|---|
| `probe.rs:141` `Line::logical_text` | **0**, and behaviourally identical to `Line::text` while its doc comment claims the opposite | ~6 |
| `probe.rs:84` `probe::page_text` | **0** (the `page_text(&runs)` call sites are test-local helpers — bucket 2) | ~6 |
| `engine.gen.ts:194` `COMMAND_CATEGORY` | **0 in `src/`**; only `enginefacts.test.mjs`, the test asserting it exists | 117 |
| `tools/bench-structure.mjs` | **0** — no npm script, no CI job | 113 |

The last one is the standing rule's edge, and it does not survive a bare delete: its *want* —
measuring the keystroke path at sefer scale — is real and unserved by anything. Move the
growth-shape assertion into `structure.test.mjs` first, then remove the tool.

### Bucket 2 — live callers, one idea copied N times. Extract; never delete.

| | copies | into |
|---|---|---|
| Parsers of `commands.rs` | **7 files, 4 implementations**, two byte-identical | `tools/commands.mjs` |
| The esbuild `load()` helper | **10** (5 in `tools/`, 5 in `test/`) | `tools/load.mjs` |
| `dirname(new URL(import.meta.url).pathname…)` | **24**, against 6 correct `fileURLToPath` uses, beside an unused `SRC_DIR` written to prevent it | `node:url`, and `SRC_DIR` finally gets an importer |
| `fn render` in `engine/tests/` | **13** | `engine/tests/common/mod.rs` |
| join-every-run helper | **8, under 4 names** (`page_text` ×4, `all_text` ×2, `flat`, `rendered`) | same |
| Hand-rolled DOM | **3** (`harness.mjs`, `panels.test.mjs`, `exports.test.mjs`) | `harness.mjs` |

### Bucket 3 — live callers that **disagree**. Pick a winner; delete the loser.

Neither deletion nor symmetric compaction. One implementation is correct and the others are bugs:
the `(` rule (`mode.ts` right, `spans.ts` wrong, §6); the bullets snippet (`commands.rs` right,
`main.ts:427` wrong, §8); `web/index.html:71`'s table button (§2); and the `cmd!` counters, where
the naive pair reports 116 against the registry's 115 and three user-facing lines carry the wrong
number (§8).

### The point of the ordering

**Bucket 2 is the mechanism that prevents bucket 3.** If there were one `cmd!` parser there could
not be a 116/115 disagreement, and `ksav/README.md:313`, `:346` and `docs/start-here.md:44` would
be right without anyone editing them. Bucket 1 is ~250 lines of tidying with no behavioural effect;
bucket 3 is what is wrong today; bucket 2 is what stops bucket 3 recurring. Do 3, then 2, and let 1
ride along.

### And the calibration, because it cuts both ways

Five suspected duplications were checked and **cleared**: "twelve parsers of one markup" is
genuinely fixed (`ksav-lang.ts` has no grammar; six consumer modules have no scanning code);
`engine/src/jump.rs` and `app/src/jump.ts` are different things sharing a name; `diff`/`changes`/
`review` is a clean pure/UI split over two different wants; `spell.ts`'s prose mask and
`spell/mod.rs::is_command` are deliberate, documented from both ends, 3 lines against 40 with the
cheap one a strict subset; and the three `fold` implementations are all executed against one
committed corpus with a floor assertion so it cannot shrink.

The duplication that got *named* is gone. What survives lives where no fence looks:
`enginefacts.test.mjs`'s prohibition sweep reads `src/*.ts`, and `engine/tests/` has no
`common/mod.rs`. `src/` is clean; the tooling that polices `src/` is not.

---

## Ranked, by wrongness × cost of leaving it

| # | Finding | § | Lens | Verdict | Effort |
|---|---|---|---|---|---|
| 1 | ✅ **Fixed 7 Aug.** `(רש"י)` in a body corrupted the source model, the lint, the heal and the preview — the gershayim bug, alive. The proposed rule was itself one case short (`ראה(רש"י)` is prose too — the hash opens an argument list, not the name) and needed `#let` statements carved out or it would have read a writer's own definitions as prose. | 6 | 2 | `rewrite` | ~40 lines net; 6 scanners → 1; `mode.ts` and `callNameBefore` hold none; +74 assertions, 7 red under mutation |
| 2 | ✅ **Fixed 7 Aug.** Hebrew suggestions were unranked below the transposition step; the corpus counts were computed and discarded one line later. Now **20.2% → 55.2%** first and **59.0% → 94.8%** in the menu, measured on 400 substitution typos of the 6,000 commonest words. Two of the finding's facts were wrong: the corpus cache is gitignored, not committed (so the bands ship in the asset, +140 KB), and hand-picked typo pairs turned out to test the design rather than the bug. | 11 | 3 | `rewrite` | ~90 lines + a shared sampler in `spell::measure` |
| 3 | **No process ever runs the application.** One CI job + one rule. | 1 | 1 | `don't-build` the next audit | 1 day |
| 4 | The macro recorder records nothing; the palette holds no commands; the greyed chip is live. | 7 | 2 | `rewrite` | ~60 lines |
| 5 | `openFile` erases the conflict `watch.ts` exists to detect. Silent data loss. | 10 | 2 | `rewrite` | **10 lines** |
| 6 | `ACTIONS` hand-copies the registry — the bullet list differs by how you ask for it. | 8 | 2 | `rewrite` | ~40 lines |
| 7 | Every feature is half in a tested module and half in the untested god-file. | 7 | 2 | `rewrite` | 1 week |
| 8 | 310 ms/keystroke re-rendering pages the client already has. | 10 | 3 | `rewrite` | ~80 lines |
| 9 | CI does not run on release tags; `deploy.yml` runs no tests. | 10 | 2 | `rewrite` | ~40 lines YAML |
| 10 | `ksav/engine/web/` — a second, drifted editor invisible to the insertion fence. | 2 | 1 | `delete` | ~250 lines out |
| 11 | ✅ **Fixed 7 Aug.** Viewport slices fed to `scan()`; the caret could lie. Both call sites now scan the whole document and filter to `visibleRanges` in position space. The memo answer is different from the one proposed — there is no safe cheap *string* test, so `scanOf` keys on CodeMirror's immutable `Text` and takes the text as a thunk, which skips the `toString()` allocation too. Fenced structurally: a `sliceString` result reaching `scan`/`isolateSpans` is now a failing test, checked against both original bugs and against the one legitimate slice. `main.ts`'s callers move over with §18. | 6, 13 | 3 | `rewrite` | ~30 lines, and it removes work |
| 12 | The apparatus has no template; ten templates show 8 of 115 commands. | 3 | 1 | `wrong-but-keep` | 2 days |
| 13 | `_en_params` collisions: `justify`→alignment, `title` unreachable, 12 params English-less. | 10 | 2 | `rewrite` | ~1 day |
| 14 | "Eleven, and nothing else" — two greyed cells are false; the fence counts the prose. | 4 | 1 | `wrong-but-keep` | ~40 lines |
| 15 | `GET /inbox` destroys state on an untokened server. | 10 | 2 | `rewrite` | ~5 lines |
| 16 | `compile_html` flushes the global memo cache on every Word export. | 10 | 3 | `rewrite` | **20 min** |
| 17 | `docs/start-here.md:67` names the wrong key; the fence counts and the failures are qualitative. | 14 | 3 | `rewrite` | 6 chars + 25 lines |
| 18 | Undebounced full-document work per arrow key; the fold service is O(lines × nodes). | 13 | 3 | `rewrite` | ~70 lines |
| 19 | Test runner: no filter, no watch, no failure containment, 55% process spawn. | 12 | 3 | `rewrite` | ~50 lines |
| 20 | The prelude is a string; 76% of a compile is world construction. | 9 | 2 | `wrong-but-keep` | 1 week |
| 21 | `logical_text` lies in the shipping library; `COMMAND_CATEGORY`, `bench-structure`, `readme.test` are dead. | 5 | 1 | `delete` | ~250 lines out |

---

## Coverage, honestly

**Thirteen regions. Every tracked file assigned to exactly one.** Excluded and named: three
`Cargo.lock`s, `package-lock.json`, 20 icon PNGs, six font binaries, and the three `.gen`
artefacts (I read their generators instead).

**Read completely:** `ksav.typ` (2,325), `main.ts` (5,721), `lib.rs` (2,078), `diagnostics.rs`
(1,298), `api.ts` (1,086), `spans.ts`, `ksav-lang.ts`, `structure.ts`, all of `spell/`, all of
`notes.ts`/`deferred.ts`, all 903 lines of `ksav/README.md`, `README-notes.md`, all ten
`decisions/` files' openings plus their full git history, all 33 `prototypes/` files, all seven
generators, the whole test infrastructure, and every workflow.

**Deliberately partial, and it matters:**
- `i18n.ts` — 930 of 1,235 lines skipped. It is two-column key/value data; its *structure* was
  confirmed mechanically. Reading 930 more translation strings would not change a verdict about
  whether a table should be a table.
- `styles.css` — audited by pattern (30 logical-property uses vs 2 physical, 10 media queries,
  `data-theme` + custom properties, every `.disabled` rule), not line-read. Nothing in it was worth
  arguing with, and it is the strongest evidence for the counter-argument I held open in §0.
- ~35 of 64 `.test.mjs` files sampled rather than read, chosen for size and for spread across the
  structural/behavioural axis. The 8-12% structural-assertion estimate is from the ten that were
  read plus a mechanical census of all 60.
- Nine engine test files read for header + helper signatures only. I would not stand behind a
  correctness claim about any of them.

**Executed rather than only read:** the source-intelligence region bundled `spans`, `mode`,
`brackets` and `lists` out of `src/` and reproduced every divergence in §6 rather than inferring it,
and compiled two documents through the real engine with `cargo run --release --example probe`. The
engine-core region built and deleted two throwaway benchmarks for the timings in §9 and §13. The
language-services region replicated `suggest_scored` exactly against the shipped 269,390-entry
lexicon and rebuilt the corpus counts from `engine/tools/.corpus-cache/` for §11. Those three sets
of numbers are measurements, not estimates; everything else in Lens 3 is arithmetic off source and
is labelled as such.

**Not done, and it is the gap that matters:** **I did not drive the application through its UI.**
Most of this report is reading — precisely the method §1 says has reached its fixed point. Four
findings would be settled in one session and I am naming them so nobody has to take my word: type
`#הדגשה[ראה (רש"י) כאן]` and watch the ribbon and the preview (§6); press F3 / Ctrl+B / F4 (§7);
click the greyed preview-side chip (§7); type `הלכח` and look at the menu (§11). I also did not run `cargo test` — a full run here needs
tens of GB and this machine has a documented history of rustc writing truncated rlibs near-full, so
the 24 test binaries at ~43 MB each (2.15 GB in `deps/`) are read off the existing directory, not
rebuilt.

**Are these last run's findings?** Partly, and I am saying which — three overlaps, each of which
moved.

The previous report's §1 was *"twelve parsers of one markup."* That was **fixed**, and I want it on
the record because I went looking for the twelve and found one: `ksav-lang.ts` has no grammar,
six consumer modules have no scanning code, the consolidation genuinely happened. §6 is not that
finding recurring. It is the *inverse*: the surviving single scanner disagrees with **Typst**, not
with its siblings, on a rule nobody probed — and the fence built to hold the old finding tests one
character to the left of the new one. A duplication finding became a correctness finding, which is
what happens when you consolidate onto the wrong authority.

§9 is the previous report's "the prelude is concatenated," now *measured*, and the measurement
moves the verdict: `Cargo.toml` argues from 258→175 ms, and the real denominator is 310 ms of SVG
the client already has.

§8 is the previous report's "ten registration sites" wearing the same words and making a different
claim: the fix (one registry, one fence) was correct and worked wherever applied, and the argument
now is that it structurally *cannot* reach the one file no test can see — which is why the bullet
list still comes out two different ways.

§7's `main.ts` finding is explicitly not last run's §11. Naming a file's size did nothing and the
file grew 68 lines; the finding is the 50/50 split that makes shrinking it impossible.

The rest — the Hebrew ranking, the macro recorder, the palette, the second editor, the templates,
the note grid's false tooltips, `openFile`, the CSP union, the tag-skipped CI, `logical_text`,
`compile_html`'s cache flush, the wrong key in `start-here.md` — are new, and eleven of the thirteen
regions produced at least one finding that no previous run reports.

---

## What I'd want to know before any of this is acted on

**What are you building next?** Half of what makes a design wrong is the change it is about to
face, and that is not in the repository. Concretely, three forks change the ranking above:

- **If the next wave is a twelfth note layout**, then §4 and §7 come first — the taxonomy is where a
  twelfth costs nine files, five of them because the layout must be *described* in five places.
- **If the next wave is users**, then §6, §11, §1 and §14 come first, in that order, and §9 and §20
  never happen. Somebody who cannot write `(רש"י)` without the ribbon dying, and cannot get a
  suggestion for `הלכח`, does not care that the prelude is concatenated.
- **If the next wave is Girsa**, then the ownership inversion at `source.rs:39` matters more than
  anything here: Ksav re-exports its own citation writer, for commands defined in its own prelude,
  from a repository it does not own. That is not a seam. That is the pen borrowing its own
  language.

My recommendation, unhedged, in this order:

1. **Fix the `(` rule this afternoon.** Six lines, and `mode.ts:170-189` already contains the
   routine. It is a live corruption reachable by typing the commonest construction in the language,
   and every hour it stays is an hour the speculative heal is rewriting people's documents.
2. **Then the Hebrew bands.** Twenty lines, and it takes the product's headline feature in its
   headline language from 4% to 20% first-hit.
3. **Then build the differential oracle** — a `parse` service and a corpus sweep asserting
   `spans.scan()` agrees with Typst's own `SyntaxKind`. That is the only thing on this list that
   prevents the next `(`, because it does not depend on anybody thinking to type one.
4. **Then do not write another audit until something in CI has opened the application.**

The first three are about a day's work between them. The fourth is the one that decides whether
there is a fourteenth report.

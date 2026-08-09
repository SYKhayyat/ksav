# 2026-08-09 — the three-repository report, worked through

The 9 August report (`lamdan/three-repos-2026-08-09.md`, with
`lamdan/duplication-2026-08-09.md` beside it) reads all three repositories at
once and its finding is not a list of bugs. It is a habit:

> the diagnosis is written down correctly and the sweep never runs

Eighteen instances, each one a class named in prose with a single member fixed
and its siblings left standing. This file records what was done about it, one
entry per item, in the order they were taken.

---

## §8.1 — the insertion grid learns a second language, and what that found

**The finding.** `emit-insertion-fixtures.mjs` builds the best fence in the
repository — every command the UI offers, inserted at every kind of caret
position, compiled by the engine, in *both* directions (offered must compile,
refused must genuinely fail). It asked all 1,035 of its questions in Hebrew.
The comment forty files away in `note-commands.ts` says exactly why that is a
problem: a hand-maintained path only one language ever walks is how the worst
bug in this product got in.

**Why the obvious fix was already refused.** `insertion.rs` carried a comment
saying an English name-swap of the *fixture* was tried and is wrong — it would
assert a path no writer could reach, because every insertion surface wrote the
registry's Hebrew snippet verbatim regardless of the document. That objection is
correct, and it makes this a product change first.

### What changed in the product

`mode.ts` gained `translated(snippet, lang)` and `docLang(doc, pos)`.
`insertionAt` now spells a snippet in the document's own language: command names
through `COMMAND_EN`, and **named arguments** through a new `PARAM_EN` table
read off the prelude's `_en_params`. The language is read from the document at
the caret — the innermost node's name, then the majority of the nodes, then the
prose — rather than from a setting, because the document is the thing that has
to compile.

Then the thirteen contexts exist in both languages, and the grid is 2,990 cases.

**The Hebrew half came out byte-identical to the previous fixture.** All 1,035
of them. The language axis is purely additive, which is the proof that the
change did not quietly move the Hebrew answer — and, read the other way, the
proof that the old grid could not have seen any of what follows.

### What the widened grid caught, in order

**1. `#מעבר_עמוד` was refused inside `#שער`, and compiles there.**
`legalAt`'s page-level rule was `frames.length === 0` — *is the caret inside any
brackets at all*. Typst's actual rule is *"pagebreaks are not allowed inside of
**containers**"*, and `#שער` is `align(center, text(…))`, `#הדגשה` a `strong()`,
`#כותרת_בהערה` a `text()` — all transparent. The page-break button was greyed
inside bold text, inside a title, and inside a note-heading, for nothing.

Which commands are containers is not a thing anybody can write down; it is a
property of each command's definition. So it is **measured**:
`engine/examples/emit-containers.rs` asks Typst, one command at a time, over
every name the prelude binds rather than the 115 the registry advertises.
`engine/tests/containers.rs` re-measures and compares, so the fixture is a cache
and not a claim. 62 containers, 59 transparent, 15 with no content body.

**2. `#סימן` was filed as having no content body, and is a container.** The
first version of the probe tried one shape, `#{N}[…]`. `#סימן("א", [דיני
תפילה])` takes its prose in a *second* argument, so it failed on arity and
landed in an "undecidable" bucket of 36 that silently defaulted to transparent —
an `ONLY_AT_TOP` shape inside the brand-new fence built to prevent one. Fixed by
trying the command's **own registry `insert` shape first** (the shape a writer's
caret is actually standing in) and by writing the undecidable list into the
fixture **by name**, because a bucket nobody reads is where the next one hides.

**3. The test that guarded the refusal encoded the bug.** `insert.test.mjs`
stood inside `#הדגשה[שלום]` and called it a container. The fence and the defect
agreed. It now asserts both directions, with `#כותרת1` for the refusal and
`#הדגשה`/`#שער` for the counter-case.

**4. Twelve English aliases had never had their parameters paired.**
`#page_section`, `#topicindex`, `#sourceref`, `#rashi` and eight others were
plain `#let` bindings rather than `_en(…)` wrappers, so their named arguments
stayed Hebrew: `#sourceref("ב״ב", מקום: "ב.")` is not English and is not
something anybody would type. `_en` forwards an unrecognised argument untouched,
so **half a translation compiles** — the grid would have gone green over all
twelve. Six missing pairs added to `_en_params`, twelve aliases wrapped, and a
generator-level check now refuses to write a fixture containing a Hebrew
parameter key in an English document.

### The heading-role family

`legalAt` carried its own list of heading commands: seven names, no English
half, no level past three, and `#שער` wrongly on it. That was the second of five
copies of *what is a heading*.

- **1st** — `spans.ts`'s derived `Node.role`. The authority; it reads the
  document.
- **2nd** — `mode.ts`'s `HEADINGS`. Deleted; `legalAt` now asks `roleAt`.
- **3rd** — `markdown.ts`'s nine-row table. Reduced to the two rows that are
  genuinely not headings-by-role — `#שער` and `#תת_שער`, which the export maps
  to `<h1>`/`<h2>` deliberately — and the rest deferred to `role`.
- **4th** — `enginefacts.test.mjs` scraped `markdown.ts`'s **source text** with
  a regex and a floor of 50 keys. A test that reads source is a test that goes
  red when the source improves, which is what it did. Replaced by an exported
  `CLASSIFIED_NAMES`.
- **5th** — `girsa-ksav/src/read.rs`, in another repository. See below.

Three positions were added to the grid for the mistakes the first nine could not
see, and a position is only a fence for the rule that decides *it*:
`deep-heading-body` (`#כותרת4`, the level the toolbar stops advertising),
`siman-body` (a heading whose level the prelude fixes, so it would go missing
from any list built by reading the toolbar), `title-body` (the one that is
**not** a heading) and `note-heading-body` (the fourth, and the one that
withdraws a refusal rather than adding one).

### The fifth copy, and the seam it sits on

`girsa-ksav`'s `read()` is what puts a shelved Ksav document's *structure* on
Girsa's shelf — headings become the levels of the address, items and rows become
addressable text. It matched **Hebrew command names only**. An English sefer
came off the shelf as an undifferentiated run of paragraphs: no headings, no
items, no rows, every footnote spliced back into the middle of its sentence.

Nothing errored. `Role::Inline` is the *correct* answer for a name nobody knows
— it is what keeps a new style command in Ksav from losing a word — and that is
exactly what made it silent. The same defect the module was written against, one
language over.

Fixed in `sefer-crates` 0.5.2: `ALIASES` and `PARAM_ALIASES`, both public, with
every name normalised before any decision is made. The settings family needed
its own arm, because it is a **prefix in Hebrew and a suffix in English** —
`#הגדרות_כותרות` is `#headings_config`.

**The check runs in the direction that is possible.** Ksav compiles
`girsa-ksav` and Ksav owns the prelude, so `engine/tests/from_girsa.rs` holds
every pair against `typst/ksav.typ` — the thing that actually binds both
spellings. Girsa cannot run that check; it has no prelude. So the test lives in
the dependent rather than the dependency, which is the shape every cross-repo
check in this product should have and the first one that does.

**It went red on its first run, on a pair nobody had questioned.** `#let
hlevel(body, level: 1) = heading(level: level, body)` was a *second definition*
of `#כותרת` rather than an alias of it — the only English name in the prelude
that was. Two identical one-liners agree until one of them is edited. Now
`#let hlevel = _en(כותרת)`.

### What is now true

- The grid asks 2,990 questions in two languages, across thirteen positions.
- Which commands are containers is measured against the compiler, not asserted.
- Five copies of *what is a heading* are one, and the one is derived.
- A half-translated command cannot reach a fixture.
- Two repositories share one table of Ksav's structural names, and the pairing
  is a build failure rather than a sefer that quietly lost its shape.

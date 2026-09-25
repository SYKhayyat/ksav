# 2026-09-25 · The apparatus is a predicate, and the translations are held to their originals

Closes #28. `PLAN.md` called it *"template coverage gate → one test tying every
template guarantee to a reachable command set"*, and `src/templates.rs` had been
claiming in prose that *"the one thing this product does that Word cannot was
reachable from no starting point at all"*. A claim that can only be checked by
reading is a claim that regresses one command at a time — and it had, three times
over, invisibly.

Two gates, and each found something.

## Gate one: the covered set, and the three things it found

`COVERED` in `engine/tests/templates.rs` is a table of ten capabilities, each with
the commands that demonstrate it. A capability is reachable when **one** template
body contains every command its row names — not when the corpus between them does,
which is the arrangement that let the apparatus go unreachable in the first place
(the audit found ten templates covering eight of 115 commands, five of them using
no apparatus at all).

What is in the set is what `src/templates.rs` claims and what `spec.md` is about:
the arrangements themselves and the two indexes. What is deliberately not in it is
every command — a template is a starting point, not a catalogue, and "every one of
167 commands appears in some template" is a different and much larger project. A
**kind** is an arrangement a writer recognises on sight, not a parameter of one,
so `#הערה_בדרגה(2)` and `(3)` are one row and `#מדור_א`/`#מדור_ב` are one row.

The gate found three capabilities the prose was claiming and nothing demonstrated:

| Capability | Was in | Now in |
|---|---|---|
| a note on a note, at a tier the writer picks | **no template at all** | `sefer.ksav` |
| a note whose text is written at the end of the document | **no template at all** | `article.ksav`, `article-en.ksav` |
| the topic index | **no template at all** | `sefer.ksav` |

The first is the arrangement the product is named for. The third is one of the
two indexes the issue named, and `מפתח_ענינים` has been in the registry, in the
palette and in the toolbar this whole time with nothing on the far side of it.

The prose in `src/templates.rs` now says the paragraph above it is a predicate
rather than a promise, and names the three it was claiming.

### What "present in the body" is not, and what was added for it

This file's header rule is **probed, never `ok()`ed** — every apparatus bug this
project has had compiled cleanly and was wrong on the page. So the three new
capabilities got rendering probes too, and the third one earned its keep
immediately: `#הערה_בשם` answers a missing body by printing a **red `?`** followed
by the name, deliberately, and that is a document which compiles, files, and passes
every "it compiles" test in the repository. So the assertion is the negative one:

```
the_article_template_resolves_its_deferred_note
  !runs.any(|r| r.text.contains("?תחום הדיון"))   // it did not print the red ?
  has(&runs, "הדיון כאן הוא בגדרי חיובו")          // the body reached the page
  has(&runs, "סופרי החידות")                      // and its own text, not just the marker
```

plus, in the sefer's existing test, that the topic index printed **and** has an
entry in it (`#מפתח_ענינים()` over zero marks prints a heading and nothing else),
and that the tier-two note is on the paper *below* the note it hangs off — the
same assertion the bands make, and for the same reason: a tier-2 note that printed
inline is a tier-2 note nobody can tell from tier 1.

## Gate two: the `-en` copies, and the differences that are allowed

`letter-en` and `article-en` are translations kept in step. Nothing notices a
disagreement on its own: the English copy is not compiled by anything that reads
the Hebrew one and the editor does not offer them as a pair, so a command added to
`letter.ksav` leaves `letter-en.ksav` a document that no longer demonstrates what
the Hebrew one does.

So `TRANSLATED_PAIRS` declares the two copies and the differences between them,
and the test asserts the differences are **exactly** those. The comparison is a
longest common subsequence over the command lists — the Hebrew one mapped through
the prelude's own pairing against the English one as written — and the assertion
is on the two remainders. A plain `zip` would not do: one extra command shifts
every position after it and reports twelve differences for one mistake, which is a
message nobody reads and a fence nobody trusts.

The allowed differences are all **direction**, and none is a translation decision:

- the Hebrew letter wraps `ב"ה` and the telephone number in `#משמאל_לימין` — an
  LTR run inside RTL text has to be told or the digits print in the wrong order,
  and the English copy is already LTR. Declared as one-sided, twice.
- the English article writes `#bold[…]` around the label inside its callout where
  the Hebrew one writes nothing — in an RTL column the colon already separates
  the label; in an LTR one the eye has nothing to catch on. Declared as one-sided
  the other way.
- and the one this found, which is a **cross**: the letter's two `#שמאל` against
  the English `#right_`. Same slot in both — *the end of the line*, which is the
  left in a right-to-left document and the right in a left-to-right one — so the
  two copies use opposite alignment commands for one gesture. Reading that as
  drift, or "fixing" it, would have made one of the two letters wrong.

A declaration nobody used is reported too, because a comment that has quietly
stopped describing the files is the first thing to go stale in a pair held
together by its own declarations.

### The gate caught this work's own drift, immediately

The first run of gate two failed on `article-en`, naming the three commands just
added to `article.ksav` and absent from its translation. The deferred note is a
*document feature*, not a Hebrew one, so both copies now have it — translated, and
in the same slot.

## Fences shown red, for the reason each was written

| Mutation | Caught by | Named |
|---|---|---|
| `#הדגשה[…]` added to `letter.ksav` only | the in-step gate | `#הדגשה is in the Hebrew copy and not the English one, and it is not a declared difference` |
| `#מפתח_ענינים()` removed from `sefer.ksav` | the coverage gate | `the topic index` / `#מפתח_ענינים() — in no template at all` |
| `Adret` in the new English article text | `spell.rs::ksavs_own_templates_are_not_underlined` | `templates contain flagged words: ["Adret [en] (article-en)"]` |

That last one is the standing check on the lexicons doing its job: a template
gained a word neither lexicon knew. The fix belongs in the hand-curated supplement
— `adret` is a ruling surname of exactly the same kind as `rashba` and `rambam`,
which are both already there under `# ---- people and places of learning ----` — and
`adrett` alongside it, because the supplement's second rule is that variants are
words. The generated lexicon is **not** regenerated: the supplement is compiled in
separately (`english.rs` `include_str!`s both), and the generated file's own header
says hand additions belong in the supplement.

## Two of the repository's own fences were right again

- `skips.test.mjs` rejected the in-step gate for having no floor under its
  `continue`: two files that stopped parsing to commands at all would compare empty
  against empty, find no leftovers, and pass. It now asserts that at least eight
  commands actually matched and that each copy holds at least twelve.
- `documentation.test.mjs`'s living-page sweep rejected `SESSION_LOG.md` and
  `PLAN.md` for numbers beside a fenced noun, and the README for the engine-test
  tally. All fixed at the source.

Engine tests 995 → 999. Binaries unchanged at 69 (this is new tests in an existing
file). Editor assertions unchanged at 7,633. The two oracle fixtures regenerate,
because the templates are in them, and that is the staleness fence doing its job.

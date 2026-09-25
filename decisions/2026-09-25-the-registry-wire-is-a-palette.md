# 2026-09-25 · The registry wire is a palette, and the essays are in the comments

Closes #29, which asked for the command registry's "long-form *why* essays and
deprecation histories" to be taken out of the wire contract. **The finding is a
false positive**, and the interesting part is not that it was wrong but that it
was wrong in a way a reader could not have told from reading the issue.

## What the issue claimed, and what is there

> commands.rs entries carry long-form *why* essays and deprecation histories
> inside `cmd!` literals that serialize to the client (`commands_json`) —
> prose-as-value crossing the boundary facts.rs was built to stop

The literals are not essays. Measured off `src/commands.rs` as committed — 40,053
bytes, of which 15,181 (38%) are comment and 16,035 (40%) are the `cmd!` literals,
and 4,505 of the comment bytes are `///`:

- the median description is **22 characters**. "טקסט מודגש" / "Bold text".
- the longest is 107, and it belongs to a deprecated command that has to name its
  replacement *and* say what it used to do.
- `commands_json()` is **37,472 bytes for 167 commands, 224 bytes a row**, and
  32% of it is the two description columns.

The essays are real — this repository argues with itself in comments as a matter
of policy — and every one of them is in the 38%. A Rust comment is not a value,
so none of it is in `commands_json`. There is no prose on the wire to remove.

## Why `desc_he`/`desc_en` must stay on it anyway

The issue's refine said to "move prose to the facts artifact or docs". The
descriptions are not prose, they are the palette's own copy: `commands.ts`
displays them and `matches` searches them, because `matches` queries *every field
a writer might recall a command by* and the description is two of those. Taking
them off the wire would move them onto a second wire, which is the disease rather
than the cure. Same for `deprecated`, which the client filters on, and for
`insert`, which is the whole point.

## The half of the finding that was right

Not the wire — the *absence of a fence*. Nothing stopped the failure the issue
described, and the failure is plausible rather than far-fetched: an author
documenting a command properly reaches for the description field, because it is
right there and the comment is twenty lines up. The paragraph compiles, passes
every floor, ships to a browser, and lands in a tooltip. `facts.rs` exists
because a `DocConfig` default reflowed silently; this is the same shape one layer
out, with a value that grows rather than a value that is wrong.

So the finding became four tests in `engine/tests/registry_wire.rs`, all
measured off the artefact that actually crosses:

- `the_wire_carries_exactly_the_columns_the_palette_reads` — the seven columns,
  by name. Not that the values are short but that the *shape* has not grown a
  column nothing consumes. A field added for a Rust consumer's convenience would
  otherwise serialise into every generated artefact and nothing would notice.
- `no_description_on_the_wire_is_longer_than_ui_copy` — 160 characters for a
  description, 200 for an `insert` (the longest real one is 105, a fully-specified
  `#הגדרות_כותרות(…)`). A single unbroken 400-character sentence, which is what a
  machine-translated description looks like, is caught by this and by nothing
  else.
- `a_second_sentence_on_the_wire_is_a_deprecation_notice` — the only descriptions
  with a second sentence are the deprecation notices, and there are exactly four
  of them, on two commands, in two languages. Both directions are pinned: adding
  a second sentence to a live command fails the *first* assertion, and quietly
  dropping a deprecation notice fails the *count*.
- `the_wire_is_a_palette_and_not_a_manual` — 40 KB, three times today's payload,
  and a payload somebody would measure.

## One rule that was wrong on the first attempt

The first version of the second-sentence test treated an em-dash as prose. It
went red on forty descriptions: "Footnote — in a chosen channel, or the default
one", "Band C — notes on band B". That is the house style for a one-line
description, and a rule that banned it would have banned the style rather than
caught the problem. The rule is now a **sentence boundary** — a full stop,
question mark or exclamation mark followed by a space and a letter — which is
why a command name ending in a period does not count (`use #הערה_ב.` is not a
second sentence) and an em-dash never does.

## Every fence shown red, for the reason it was written

| Mutation | Test that caught it | Message named |
|---|---|---|
| a 235-character description pasted into `הדגשה` | the sentence test *and* the length test | `הדגשה.desc_en has a second sentence and is not deprecated`, then `is 235 characters, over the 160` |
| a `rationale: &'static str` field added to `Command` | the column test | `the wire contract changed`, with the eighth column listed |
| a deprecation notice deleted from `הערה_על_הערה` | the count in the sentence test | `expected four deprecation notices … found 3` |

All three reverted; `commands.rs` restored from the backup and `git diff` empty
for that file.

## Also

`commands.rs`'s module comment now states the split and points at the fence, so
the next person to consider putting an essay in a description is told where the
essays go rather than left to infer it from the absence of a prohibition.

Engine tests 991 → 995. `decisions/README.md` and `PLAN.md` updated; #29 added to
`PLAN.md`'s SKIP section as a measured false positive, alongside #36.

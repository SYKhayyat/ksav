# 2026-08-21 · A region you could not say in English

`#let region = _en(אזור)` renames named arguments through one table and passes
through anything not in it — where `#אזור` then refuses a name it has never heard
of. So a region key with no entry in that table is not merely unidiomatic in
English: it **cannot be written in English at all**.

Counted: of sixteen keys, four had an English spelling.

| had one | had none |
|---|---|
| `placement`, `height`, `title`, `layout` | `גלישה`, `חריגה`, `שומר_מקום`, `הקטנה_מזערית`, `ראש`, `מספור_כתובת`, `דף_ראשון`, `עמוד_חדש`, `טורים`, `יחידה` |

Which is to say: an English writer could say where a region goes, how tall it is,
what it is called and how its channels are arranged, and had to switch languages
for how a note too tall for it is continued, what it does when it asks for more
room than the page has, whether it holds its slot on a page it has nothing on,
and what an entry's head is made of. That is most of what a region is for.

It is the same defect this repository has recorded twice already in the same
month — a mechanism that works and a surface that does not reach it — and it
survived a fence built for exactly this class: `every_document_parameter_has_an_
english_name` sweeps `#מסמך`'s parameters and nothing else, so `#אזור`'s were
never asked about.

## What the fix had to include, and nearly did not

**The values, not only the keys.** `גלישה` takes move names, `חריגה` takes a
policy, `ראש` takes ingredients, `יחידה` takes a unit — all compared against
fixed sets rather than used as data. A parameter table alone would have given
English writers `spill: ("הקטנה",)`, and an English name for the *key* whose
value must be Hebrew is worse than no English name: the name exists, so using it
looks supported, and then it errors. Twenty value names went into `_en_values`,
and the three readers that compare against those sets now canonicalise through
`_val` first.

The three always-apply moves — `הזזה`, `מפל`, `הצמדה` — are in the value table
too, though asking for one is still refused. Refused *as that move*, with the
sentence explaining that clamping, shifting and cascading are how a note is kept
on the paper and are an invariant rather than a setting. The alternative was
reporting an English spelling as a move nobody has heard of, which is a worse
answer to the same mistake.

**`columns` is not in the shared table**, and that is deliberate: `columns` is
already `עמודות`, a page's columns, and one English word cannot mean two things a
writer sets on two different commands. It goes through `#region`'s own `extra`,
which is where the banded apparatus has kept `טורים` since it had an English name
at all.

## The bug found on the way

`_rg_over_keys` — the keys a region may override on its channels — has always
listed `הקטנה_צעד` and `כיווץ_מידה`. `_rg_own` — the keys `#אזור` accepts — never
did. So the override read two keys the declaration rejected, and the only way to
reach either was to set it on every channel individually. Found by writing a test
that used them.

## The fence

`every_region_key_has_an_english_name` reads `_rg_own` out of the prelude and
`en_param_pairs` out of the prelude — both directions from the source, so a key
added tomorrow is swept the moment it is added.

Beside it, `a_region_declared_in_english_lays_out_as_the_hebrew_one_does` renders
the same region twice, once with `#אזור` and Hebrew keys and once with `#region`
and English ones, and diffs the text runs. The names existing is not the claim;
the names *arriving* is, and a wrapper that dropped every argument it did not
recognise would pass the sweep and lay out the default document. What makes the
pair meaningful is that `region_settings.rs` has already proved each of those
keys moves the page — two renderings that agree here and are known to differ from
the default are two spellings of one request.

## What is not done

The editor. `channels.ts` writes a region with four keys, so every knob above is
reachable only by typing into the source — in either language now, which is an
improvement and not the whole of it.

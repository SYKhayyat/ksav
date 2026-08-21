# 2026-08-21 · The writer picks what "full" means

`NOTES-PLAN` thing four names ten overflow moves, and decision 15 says **the
writer can pick**: *"all ten are exposed, none is hard-coded."* Spill was built
the night before and hard-coded. This is the knob.

## `גלישה` is a list, and that is the decision

```typst
#אזור("מקורות", מיקום: "רגל", גלישה: ("דחיסה", "עמוד_הבא"))
```

An **ordered array**, not one value, because **the moves are not alternatives**.
A writer wants *compress, then spill*, and the order is the policy. One value per
region would have been a menu of arrangements — the exact shape decision 10 rules
out, and the shape the note chooser was deleted for being.

It sits on the **region** and not only on the channel, because it is a property
of *the space*: two channels sharing one region share its overflow, and letting
each answer separately would be two notes computing their positions from
different answers to the same question, which the plan names as the one real
limit. A channel with a region of its own — the common case — sets it either way
and means the same thing.

## Three moves are accepted, and six are refused by name

| value | what it does | measured, on twenty long notes in one page-foot region |
|---|---|---|
| `("עמוד_הבא",)` | **spill** — the default, and decision 5's strongest move | 9 notes a page, 3 pages |
| `("דחיסה", "עמוד_הבא")` | **compress**, then spill | **12** notes a page, 2 pages |
| `()` | a fixed box that stays fixed, and clips | all 20 on one page |

**Clamp is not a value**, because never printing off the paper is the invariant
(decision 6) rather than a choice.

The other six moves the plan names — the two-directional shift, the cascade,
run-in, character-level tightening, dropping a type size, redistributing inside a
fixed total — are **not accepted**. Asking for one is refused with the list of
those that exist.

That refusal is the decision worth defending. Accepting `"הקטנה"` today would
make the vocabulary look complete and put a word into the engine that compiles
and does nothing — which is *precisely* the defect class the settings fence was
written for the day before, in the same part of this prelude. A knob that lies is
worse than a knob that is missing, because the missing one can be asked for.

## `דחיסה` is a property, not a reaction

The first shape compressed only the entries that happened not to fit. It is the
obvious reading of *"compress toward the minimum gap"* and it is wrong: it gives
two pages of the same sefer different spacing for a reason no reader can see. A
writer who says a region is tight has said something about **the region**.

So the gap goes to nothing throughout, and the walk and the renderer are told the
same thing — `_ap_pick` reads it per group, so it applies to the streams that
asked and to no others. The two disagreeing would put a note where the arithmetic
did not leave room for it, which is the one limit again.

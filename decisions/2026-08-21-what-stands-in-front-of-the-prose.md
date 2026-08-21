# 2026-08-21 · What stands in front of the prose, and pointing at a note

The last two pieces of `NOTES-PLAN` thing five that were not the counters.

## `ראש` — one setting, four ingredients, any combination

The plan's words, and the shape follows from them: a **list**, in the order the
parts print, because they compose. A Mishna Berura entry opens with a dibbur
hamaschil and no number; a Shaar HaTziyun with a number and nothing else; a
nusachos apparatus with a label and a number both.

| ingredient | what it prints |
|---|---|
| `"מספר"` | the number — Typst's own for a native footnote |
| `"תווית"` | the fixed label this tier or stream carries (`תוויות`) |
| `"ציטוט"` | the words the note is **on**, from `#הערה(ציטוט: "שמע ישראל")[…]` |
| `()` | nothing at all |

### Three things worth writing down

**The number is not printed by the head.** Typst draws a footnote entry as
«number» «body» itself, so what this composes is everything *after* the number —
and leaving `"מספר"` out is how a writer says **no number**, which then has to
reach the marker in the sentence as well as the entry at the foot. A numberless
entry with a numbered marker is worse than either. Measured: `ראש: ()` prints
`גוף ההערה` at the foot and leaves the sentence with no superscript at all.

**The label is in the default**, and that is not a taste. `תוויות` has been
printing since it was written, and a default of `("מספר",)` alone would have
taken the labels out of every sefer that had set them, silently, on upgrade —
the one thing a new setting may not do. **The settings fence caught exactly
that**, in the same run, by reporting `תוויות` as a knob that changes nothing;
so asking for `("מספר",)` explicitly is now a real request — *number only, no
label* — and different from saying nothing.

**The quotation is frozen here and tracked elsewhere.** The plan wants it tracked
live, so that editing the sentence does not strand the note, with a frozen copy
as the fallback. The engine only ever has the frozen copy: it is handed `ציטוט:`
and prints it, through `_mk_render` on the `#דיבור_המתחיל` class, because that is
what it *is*. Keeping it current is the editor's — the only side that can see the
writer typing — and the constraint that makes live tracking realistic at all is
the plan's own, that the quotation is one or two words.

### And it makes a markerless stream, which the plan flags

`ראש: ("ציטוט",)` is a whole apparatus addressed by dibbur hamaschil with no
numbers anywhere. That is the arrangement the plan marks `[U]`: *"a markerless
stream needs addressing by line, page, daf or siman instead — a second addressing
system, which seforim use constantly."* It is now reachable, and that second
addressing system is still not built. Worth knowing which of the two arrived.

## `#הפניה_להערה` — "see note 12", and the 12 stays right

The plan resolves the apparent tension itself: **position-based numbering and
automatic cross-references are not in tension**, because a reference asks, at
build time, what number the note turned out to be. So a note given `שם:` records
the number it printed, and the reference reads it.

Measured: with two notes before it, `#הפניה_להערה("פלוני")` prints **2**; insert
a note earlier and the same reference prints **3**. A channel lettered א ב ג
gives **ב** — the *printed* number and not the rank, because a reference saying 2
would name a note the reader cannot find.

**One command does both things the plan asks for**, because they are one thing
wearing two dresses:

```typst
עיין #הפניה_להערה("פלוני")                    → see note 12
…ועיין שם#הפניה_להערה("פלוני", סימון: true)   → a second marker, ¹²
```

The second is *"one note, two markers"*. It prints the first note's number and
creates **no second entry** — and the plan is right to call that out, because the
adjacent mechanism does the opposite: `#הערה_בשם("א")` against `#גוף_הערה("א")`
renders the body **twice**. Different name, different label, different thing.

### The failure the plan asked for by name

> A marker pointing at a label not in the list currently fails unreadably. That
> will happen on every rename.

A rename is exactly the case, so a reference to a name nobody wrote prints
**`?פלוני` in red, in the sentence the writer is reading** — both that it is
broken and which word to fix. Two notes given one name is the writer's mistake
and the reference answers with the first, which is at least the same answer every
time and in every reference to it.

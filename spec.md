# Ksav — The Note Options

**The ground rule: a second layer of notes either spends the one native series or
leaves the live page foot.**

That is the sentence this document is really about, and it used to open with a
count instead — *"These are THE note options. There are eleven, and nothing
else."* A count is not a property of a system; it is a property of a list, and
the list turned out to be a chooser's. The fence that guards every counted claim
in this repository had to decline to count the code in order to reach eleven, and
said so in its own comment. When a fence has to pick which artifact to count, the
prose is what is wrong. See §4 of `lamdan/whole-repo-2026-08-07.md`.

The rule below is checkable, and everything here is an instance of it.

**The chooser's cards are gone**, and with them the sentence that used to stand
here about counting them. They were the cells of a *where* × *how* grid, which
meant an arrangement had to be somebody's card in order to exist — and three
times a card was greyed out with a reason that was false against the shipped
engine. Writing a note is one pick among the destinations now, and the
destination *is* the stream: everything else hangs off it, so three hundred
haaros move to the back by changing one word. See
[The cells were the product](decisions/2026-08-20-the-cells-were-the-product.md).

What is left below is what it should always have been: the **arrangements** this
engine can produce, each with the mechanism behind it and the test that renders
it. They are not a menu and there is no number that is the right number of them.

Every earlier mechanism (tiered footnotes, per-page bands, streams, styled sub-notes,
source-notes, two-sided margins) either duplicates one of these or is a broken attempt at
one of these. This document is the whole surface, grouped by whether an arrangement
gives you **one layer of notes** or **notes on your notes**.

**Legend:** ✅ works today · 🧪 works in principle, needs one confirming render · 🔨 needs a
bounded build · ⚠️ renders but flawed, needs rework

> **Status as of the current build: every arrangement below works.** Each is
> covered by a rendered-output test in `ksav/engine/tests/apparatus.rs`, which
> reads the laid-out document through `ksav_engine::probe` and asserts *where
> things landed on the page* — not merely that the document compiled.

**The one ground rule that shapes all of this.** Typst gives exactly **one** native
page-bottom footnote series — balanced against the text across page breaks. That single
series is the *only* thing that truly floats at the live page foot. A **second**
independent page-foot series is not possible. So every option that wants a second layer
either (a) spends the one series and sends the second layer somewhere else, or (b) puts
both layers somewhere other than the live page foot (section/document end, a fixed region,
a companion document). Nothing here fights that rule, and nothing here is exempt from it.

---

## Group A — one layer of notes

### 1. Footnotes  ✅
One set of notes at the **bottom of the page**, balanced against the text across page
breaks. Numbered 1, 2, 3… The one thing Typst does natively and does well.
*Maps to:* `הערה`.

### 2. Endnotes  ✅
All notes collected at the **very end of the document**, under an optional heading.
*Maps to:* `הערתסיום` + `הערות_בסוף`.

### 3. Section endnotes  ✅
Notes collected at the end of **each section** (e.g. each mishnah), so they land in the
middle of the document, near the text they belong to, instead of all at the back.
*Status:* **works, any number of sections.** Both `מדור`+`הערות_מדורגות` and plain
`הערתסיום`+`הערות_בסוף` used to reprint the first section's notes in every later
section. Both are now scoped: each dump drops a boundary marker after itself, a note
belongs to the section ending at the first boundary after it, and numbering — being the
rank of the note within that section, derived from a query rather than a counter —
restarts on its own.
*Maps to:* `מדור` + `הערות_מדורגות`, or `הערתסיום` + `הערות_בסוף`.

### 4. Fixed regions (bands)  ✅
The page divided into **N stacked regions whose count and heights you choose** (fixed per
document), each note-stream flowing in its own band. Empty space in a band stays empty.
The notes do **not** align to their anchor line — each band just fills in order.
*Status:* **built.** `#הגדרות_מדפים(גבהים: (2cm, 1cm, …))` gives each tier band a fixed
height; a band with nothing on this page keeps its slot empty rather than letting the
bands below drift up. Any number of them, up to the seven tiers `מדף_א…ז` name, and each
height may be an absolute length **or a percentage of the sheet** — `(15%, 10%)` keeps
its proportions when the sefer moves from A4 to A5, which a centimetre does not. The
whole apparatus lives in a region reserved at the foot of the
page (`מסמך(אזור_הערות:)`, set automatically by the engine when the document uses these
commands) — without that reserve the bands grew off the bottom of the sheet and took
the page number with them, which was the real defect here.

### 5. Parallel streams  ✅
Two or more apparatuses **both anchored in the main text**, each with its **own marker
symbols** (e.g. *,†,‡ for one, 1,2,3 for another) landing in its **own region** — the
peirush-plus-mareh-mekomos case. This is option 4 carrying more than one independent
stream; each stream can itself be two-tiered.
*Status:* **built**, same mechanism as #4 — `#הגדרות_זרמים(גבהים: ("מקורות": 2cm, …))`
reserves a fixed slot per stream, stacked or side by side, each stream numbered from its
own sequence, and any number of streams. Heights take a percentage here too. The page
foot is reserved from this dictionary exactly as it is from the bands' array, and a
document carrying both apparatuses pays for both — for a while it was read off the bands
alone, so three declared streams got the flat default and printed the third off the sheet.
Distinct symbols make the lost anchor-alignment far more livable — the reader matches by
symbol, not position.

### 6. Side / margin notes  ✅
Notes in the **outer margin**, beside the text.
*Status:* **reworked — the notes now align to their marker's line.** Each note is
`place`d at the vertical offset of its own marker; where two notes would collide, the
lower one is pushed just below the upper. The stack is computed read-only (every note
queries all of them and measures each at the column width), so it converges without
shared state. A sidenote written outside a side-column wrapper falls back to a real
footnote instead of being laid out off the paper.
*Maps to:* `הערת_גיליון` / `עם_הערות_צד` (and the two-sided `הערת_ימין`/`הערת_שמאל`).

---

## Group B — notes on your notes (two layers)

### 7. Nested footnotes  ✅
A note on a note, but **both fall to the page bottom in one running sequence** (1, 2, 3,
4…). No visual separation between the two kinds — everything is one numbered series at the
foot.
*Maps to:* nesting `הערה` inside `הערה`.

### 8. Two endnote blocks  ✅
Commentary and he'aros-on-the-commentary as **two separately-numbered blocks** (e.g. א,ב,ג
for the commentary; 1, 2, 3 for the he'aros), stacked, at the **section or document end**.
This is the Shaar-HaTziyun *look* — two visually distinct bands, each independently
numbered, the second referencing the first.
*Status:* **works at document end and per section** — fixed together with #3.
*Maps to:* `מדור` (tier-1) + nested `מדור` (tier-2) + `הערות_מדורגות`.

### 9. Footnotes + endnote block  ✅
Commentary as **balanced page-bottom footnotes** (spending the one native series on the
layer you most want on the page), with the he'aros-on-the-commentary collected into their
**own numbered block** at the back.
*Status:* **confirmed by render.** The open question was whether a second-layer marker
registered *from inside a footnote body* survives Typst's introspection — it does: the
sub-notes are collected and the tier-1 footnotes stay balanced at the page foot. This is
the only two-layer option that keeps the *primary* apparatus genuinely balanced on the
page. Compare with #11, which gets the same payoff the safe way.

### 10. Footnotes + companion document  ✅
Commentary as footnotes; he'aros-on-the-commentary as a **separate document / volume**,
numbered to match. How many real he'aros seforim actually ship.
*Status:* trivially works (two compiles, cross-referenced). Not same-page — the reader
uses two volumes.

### 11. Endnotes with footnotes on them  ✅
Commentary rendered as **endnotes** (back matter, or section-end); the
he'aros-on-the-commentary rendered as **real, balanced, page-bottom footnotes on the
endnote pages**. This works because the endnote pages have no main text competing for the
foot — the endnotes *are* the text there, so the one native footnote series is free to
balance the he'aros beneath them.
*Status:* **confirmed by render** — the sub-notes land at the foot of the endnote page,
balanced, exactly as predicted. The **cheapest path to genuinely balanced
notes-on-notes**, and lower-risk than #9 (it calls a footnote from ordinary flow
content, the safe direction, rather than registering from inside a footnote). Tradeoff: the primary
commentary is endnotes, so it is **not beside the main text** — fine for a commentary
volume, not a solution for commentary-alongside-text-with-balanced-subnotes (which remains
the one thing no option here delivers).

---

## Status at a glance

| # | Option | Layers | Where notes land | Status |
|---|--------|--------|------------------|--------|
| 1 | Footnotes | one | page bottom (balanced) | ✅ |
| 2 | Endnotes | one | document end | ✅ |
| 3 | Section endnotes | one | each section's end | ✅ |
| 4 | Fixed regions (bands) | one | fixed page regions | ✅ |
| 5 | Parallel streams | one×N | fixed page regions | ✅ |
| 6 | Side / margin notes | one | outer margin, beside its own line | ✅ |
| 7 | Nested footnotes | two | page bottom, one sequence | ✅ |
| 8 | Two endnote blocks | two | section/doc end, two blocks | ✅ |
| 9 | Footnotes + endnote block | two | tier-1 page foot, tier-2 back | ✅ |
| 10 | Footnotes + companion doc | two | tier-1 page foot, tier-2 separate volume | ✅ |
| 11 | Endnotes with footnotes on them | two | tier-1 endnotes, tier-2 balanced on endnote pages | ✅ |

**~~The one thing none of these do:~~** ~~primary commentary *beside* the main text on
the same page **and** balanced sub-notes below it. That needs either a LaTeX/reledmac
backend (heavy toolchain, opt-in) or a custom paginator (multi-month build).~~

**Measured false**, and by this engine on this toolchain. `NOTES-PLAN.md` Part 3's
design C is that arrangement: the run-in commentary in Typst's own balanced
footnote area with a second apparatus in a box below it, two independent counts,
and — since the page-foot half of spill was built — every note printed across as
many pages as it takes. `compose_long.ksav` is thirty of them. Nothing was forked
and no paginator was written; what it needed was the region knowing which notes
were **assigned** to a page rather than which were registered on it.

The corollary is worth keeping, because it is the part that was right: Typst has
**one** balanced page-foot series and no script can make a second. What design C
shows is that one balanced area plus a fixed box is enough for the page anyway.

**The proofs are run** and held by `tests/apparatus.rs`, and the acceptance
criteria for the note system as a whole by `tests/notes_acceptance.rs`.

The presentation question that used to sit on this line — whether the
arrangements reach a writer as a chooser or as raw command names — is settled,
and **not the way this page used to say.** The grid of cards is gone: an
arrangement had to be somebody's card to exist, and three times a card was greyed
out with a reason that was false against the shipped engine. Writing a note is
one pick among the destinations now, and the destination *is* the stream. See
[The cells were the product](decisions/2026-08-20-the-cells-were-the-product.md).

---

## The other axis: where the note's *prose* lives in the file

Not a twelfth option, and deliberately so. Every option above answers **where the
note prints**. This answers **where its words sit in your source**, which is a
different question with a different right answer, and the two do not interact:
the page comes out byte-identical either way.

Until now the answer was forced. Every note command takes its body inline —
`#הערה[three hundred words of pilpul]` in the middle of a sentence — so in a sefer
where the notes outweigh the text, the body text becomes confetti scattered
between note blocks. The document is readable; the *source* is not.

```
בראשית ברא#הערה_בשם("1") אלקים…
#גוף_הערה("1")[עיין רש״י שם, ובמה שכתב הרמב״ן.]
```

`#הערה_בשם(שם, סוג:)` reaches all of them — `סוג` is the note command itself, and
every note command in the prelude takes its body as the last positional argument,
so a layout's own arguments pass through ahead of it. A layout written tomorrow is
reachable the day it is written.

| | |
|---|---|
| **Equivalence** | `tests/deferred_notes.rs` lays out each of them twice, inline and deferred, and asserts every text run landed on the same page at the same coordinates at the same size. |
| **The editing model** | `Ctrl+Alt+J` jumps marker ⇄ prose and writes the prose when there is none — org-mode's `C-c C-c`. `Ctrl+Alt+Shift+F` exiles an inline note; `Ctrl+Alt+R` recalls it; the chooser moves the whole document at once. Names are generated; nobody types one. |
| **New failure modes** | Exactly two, both silent on the page: a marker with no body (prints a red `?`, an editor error), and a body no marker points at (prints nothing, an editor warning). Both are linted with a one-click fix. |
| **The rest of the editor** | A third failure mode was found later and was not in the source at all: every note surface asked "is this a command that opens a note body", `#הערה_בשם` is not one, and so turning this preference on emptied the notes pane, made `⁑` write tier א inside a note, and blinded the collected-and-never-rendered warning. `notes.notesIn` returns one list over both spellings and `app/test/deferrednotes.test.mjs` is the equivalence oracle for it — the app-side `assert_same_page`. |

This is the org-mode arrangement, and it is worth having for the same reason it is
worth having there: the syntax is not the point, the jump is.

---

## Where the dated record went

This document used to carry four dated waves after this line, and `fixes.md` and
`plan-notes-and-ui.md` carried five more. They are in
[`decisions/`](decisions/README.md) now, one file each, and that directory
explains why: a spec is edited in place and is always current, a record is
written once and is true on its date, and the two had been merged into three
files with every stale number sitting at the seam.

What is above this line is the spec — the ground rule, the arrangements it
produces, and where a note's prose lives. It is a living
document, checked by `app/test/documentation.test.mjs` like the rest of them.

# Writing a kuntres in it — 7 August 2026

The whole-repo audit's ranked list put *"nobody has written a document in it"*
third, above nine `rewrite` verdicts, and said so in as many words:

> *"An hour of use beat three audits by six to nothing. … The single highest-value
> engineering action available is not on this list."*

So: an hour of use. The application was started for real — `ksav serve` on 7878,
Vite on 5173, a headless Chromium driving the actual chrome — a kuntres was
started from the shipped **ספר** template, and it was written the way the
product invites you to write one: the toolbar for structure, the Notes chooser
for the apparatus, the context ribbon for the list and the table, the export
menu at the end. Three bugs. All three had been green in 3,556 assertions and
383 engine tests, and none of them was a gap in coverage.

## 1. A sefer numbered by the toolbar came out unnumbered

Press § three times and you get **סימן א׳, סימן א׳, סימן א׳**.

`commands.rs` spells the snippet `#סימן[א׳][|]`. The `|` is the caret, and it
is in the *title* — past the number — so the writer never visits the field that
is wrong. The outline pane lists all three as `א׳` and says nothing. `#סעיף[א]`
is the same, on every seif of every siman.

It is not a placeholder. `#רשימה(פריט[|],)` inserts an **empty** item, which is
a placeholder. `א׳` is a value, and it was the only value the product could
produce, because `insert` is a static string in a registry that has never seen
the document.

**Fixed at the insertion path.** `app/src/numbering.ts` continues the
document's own series, hooked into `insertSnippet` — which is *the* insertion
path, so the toolbar, the Insert menu, the palette, the hydra, a macro and a
key binding all get it from one place, in the same shape as `noteFor`,
`legalAt` and `insertionAt` beside it. A seif restarts inside each siman. The
document's own punctuation is followed (`א׳` or `א`), and its own language
(`#siman` stays `#siman`).

That needed a gematria **writer**, which did not exist anywhere: the prelude has
`_ix_gematria`, a reader, for sorting the source index. `15` and `16` are `טו`
and `טז` and never `יה`/`יו`.

**And the reader had to be a reader, not a sum.** Written as a sum first, and
the test caught it immediately: `#סימן[פתיחה]` sums to 504, so a heading called
*פתיחה* would have been "continued" to `#סימן[תקד]` — renumbering somebody's
introduction into a scheme they never chose. Every Hebrew word has a gematria;
almost none of them is a numeral. A string is a numeral only if it is *the*
numeral for its own value, checked against the writer, so the two cannot
disagree about what a numeral looks like. `#סימן[1]` and `#סימן[פתיחה]` are both
left alone.

## 2. Typst's own English reached the writer, and a gershayim was how

`diagnostics.rs` states its rule in its own header:

> *"Every user-visible failure names (a) what failed in the writer's words, (b)
> the line or command they can act on, and (c) exactly one place to look."* …
> *"Typst's own words are kept, on `raw`, for the bug report. They are never the
> message."*

Six families reached the writer as `message == raw`:

| what the writer read | how they got it |
|---|---|
| `unclosed string` | **a gershayim.** `"` is the key you press for רש״י, and inside `(…)` Typst reads it as opening a string |
| `missing argument: כותרת` | `#סימן[א׳]` — one bracket where the command takes two |
| `missing argument: body` | the same, on the 89 commands whose positional parameter is still named in English |
| ``label `<x>` does not exist`` | a `@ref` to a marker never written, or spelled differently |
| `array index out of bounds …` | `.at()` past the end |
| `cannot add function and integer` | arithmetic on a command |

**Why nothing caught it.** `every_rephrasing_is_bilingual` walked a hand-written
list of six raw strings, every one of them a string the rephraser already
handled — so it could not go red for a message the rephraser did *not* handle,
because such a message was not in the list. That is `registry.rs`'s
`ONLY_AT_TOP`, rebuilt inside the module whose entire job is the sentence a
writer reads.

**Fixed, and fenced by the failures themselves.**
`engine/tests/diagnostics_corpus.rs` is twenty-five documents that really do not
compile — a gershayim in an argument list, a siman with one bracket, a `//` that
eats a closing bracket, a font nobody has, a mareh makom pointing at a renamed
siman — compiled by the real engine, asserting that what the writer reads is
bilingual and is never Typst's own sentence. Adding a case the rephraser has no
family for is a red test, which is the pressure that was missing. Verified by
mutation: removing the gershayim branch turns three of the six red and names
both offending documents.

The missing-argument message names the parameter in Hebrew, read from
`ksav.typ`'s **own** `_en_params` table rather than a second copy. `body` is
the one addition, and it is the reason that lookup exists at all: it is the only
English parameter name left in the prelude, on 89 commands, all positional — so
it is invisible everywhere except in the one message that says it out loud.
Renaming it in the prelude would mean rewriting the variable through 89 function
bodies that also pass `body:` as a *metadata key* read elsewhere; naming it
properly in the diagnostic costs one line and reaches the same reader.

## 3. The citation that did not keep its place

`spec.md §10.2`, the whole argument for the Girsa pairing:

> *"Because the document keeps `girsa:shulchan-arukh/orach-chayim/1:1` and not
> merely `שו"ע או"ח סימן א' סעיף א'`, a whole sefer can be switched from
> abbreviated to full-form citations, or every quote regenerated against a
> corrected edition, without touching a word of the prose. No paste-based
> workflow can do that."*

The Mekoros panel — *"where is this phrase from?"*, pick a hit, it lands as a
footnote — wrote:

```ts
// The citation goes in as a mekor footnote — the ref travels with it,
// because that is what makes it re-printable later (spec.md §10.2).
const markup = `#מראה_מקום[${place.display}]`;
```

`place.ref` was on the object, typed, arriving from Girsa, and read by nothing.
Everything downstream was already built and already tested: `מראה_מקום(מקור:)`
files the ref in `#metadata`, `#מראה_מקומות()` sorts and prints the source index
from it, and a ref in a compiled PDF is a link to the page it names. All of it
was dead for every citation the editor could insert by itself — and the page
looked exactly right, because the printed string was never the part that was
missing.

The *other* door into the same feature, a packet handed over by Girsa and
rendered to markup in Rust, writes `מקור:` and has an engine test that says so
(`from_girsa.rs`). Two doors, one feature, one of them quietly not.

**Fixed with one producer.** `app/src/citation.ts` is the only thing that writes
a mekor citation, and `citation.test.mjs` sweeps `src/` to keep it that way — a
markup template in a click handler inside a 5,600-line file is exactly where the
first one hid. The ref is written when there is one and omitted when there is
not (`מקור: ""` would file an index entry nobody can follow). And `display` now
goes through `typst-escape.ts` like every other panel's text: it is Girsa's
string, and a `]` in it would have closed the call and taken the sentence with
it.

## What did not turn out to be a bug

Three things were suspected on the evidence and cleared by checking, which is
worth recording because each would have been a plausible finding to file:

- **`#שער` in the outline** is a level-0 title row and not a section, as §1's
  fix claims. Confirmed in the pane.
- **רש״י in a list item** lights the whole ribbon — eleven actions, correctly
  enabled and disabled. That was §1's headline bug and it is genuinely gone.
- **Deferring a mareh makom** writes `#הערה_בשם("1", סוג: מראה_מקום)`, not a
  plain `#הערה_בשם("1")`. Read as the second at first, from the bodies rather
  than the markers; the markers were right. The page is identical either way,
  which is what the panel promises. `סוג:` was in the prelude and the app uses
  it.

And one thing that worked exactly as the previous day's change intended: **export
`.typ` went out over `POST /assemble` in 7 ms**, through a dev proxy generated
from the engine's registry, with no compile behind it.

## The thing that is still true

`ksav/README.md`'s last unchecked box said *"nobody has written a real document
in it yet"* and now somebody has written most of a siman of one. That is not the
same as a sefer. The next hour will find three more.

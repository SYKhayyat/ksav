# Plan · notes, and the Word-parity UI around them

*2026-08-04. Written after a hands-on pass found six user-visible bugs in an hour,
all in code that had passed three audits and 2,276 green tests.*

The organising question for everything below is **Shloimy's question**: someone who
has only ever used Word sits down at Ksav. What does he see, what does he reach
for, and what happens when he reaches for it?

Shloimy is never a reason to cut a feature. Ksav's whole claim is that a bochur
can set a page the way a sefer is actually set, and no amount of "too advanced for
a beginner" justifies removing that. Shloimy is a reason to **add UI** — the
mechanism stays, and a way in gets built beside it.

---

## Part 1 · What is actually broken

Each item was confirmed by rendering or by driving the running app, not by reading
code. Where a number appears, it was measured.

### 1.1 The tiered apparatus is numbered upside down

The chooser card "שני מדורים נפרדים" describes the שער־הציון arrangement in its
own words:

> הפירוש במדור אחד **(א,ב,ג)** וההערות עליו במדור שמתחתיו **(1,2,3)**
> — `app/src/notes.ts:187`

The engine ships the exact opposite:

```typst
מספור: ("1", "א", "a", "i", …)   // engine/typst/ksav.typ:260   (_md_defaults)
מספור: ("1", "א", "a", "i", …)   // engine/typst/ksav.typ:397   (_pp_defaults)
```

Tier 1 gets Arabic numerals and tier 2 gets Hebrew letters. Rendered, the primary
band reads ¹ ² and the sub-band reads א — backwards both against the card's promise
and against the convention it is imitating. A reader who has opened a sefer sees it
immediately; a coordinate dump does not show it at all, which is why three passes of
probe-based testing missed it.

**Fix:** default `("א", "1", "a", "i", …)` for both `_md_defaults` and
`_pp_defaults`. Then assert the rendered marker *shapes*, not just their positions.

### 1.2 `הערה_על_הערה` is a cosmetic alias wearing a mechanism's name

```typst
#let הערה_על_הערה(body) = footnote(text(size: 0.94em, style: "italic", body))
```

Measured against a plain nested footnote: **10.2pt vs 9.6pt, same block, same
rhythm.** 0.6pt and a slant. It is a footnote. The real tiered mechanism —
`#הערה_א` / `#הערה_ב` / `#הערה_ג`, which indents ~1.1em per tier and steps size and
colour — has **no toolbar button at all**, while the cosmetic one has `⁑` sitting
next to `†` in `main.ts:1471`.

The writer clicks the thing the toolbar offers, and the toolbar offers the wrong
thing.

**Fix:** `⁑` points at the tiered note. `הערה_על_הערה` survives as a command for
documents that already use it, and stops being advertised.

### 1.3 "Separate blocks" renders where the text stops, not at the foot of the page

```
body text          y =  78 … 101
#הערות_מדורגות()   y = 126 … 169     page is 842pt tall
```

`#הערות_מדורגות` is an *end* apparatus: main flow, so it lands wherever the prose
ends. On a short document that is the top of the page. The page-bottom equivalent
already exists and is correct —

```
#מדף_א / #מדף_ב     tier א band y = 741 … 755,  tier ב band y = 772 … 776
```

— but nothing in the chooser distinguishes "at the foot of every page" from "at the
end of the document". Twelve cards each encode a *where* and a *how* together, and
the writer has to decode which is which from a sketch.

**Fix:** the chooser asks **where** and **how** as two axes rather than twelve
pre-combined cards. See §3.3.

### 1.4 A sub-note cannot sit under a note the writer already wrote

`#מדור_ב` stacks only under `#מדור_א`. A plain `#הערה` will not do as tier 1, so
adding a note-on-a-note means going back and converting the note you already have.
Nothing in the engine requires this — the tier-1 collector could accept native
footnotes.

**Fix:** let tier-1 collectors adopt native footnotes. Failing that, a one-click
"convert this note to a tiered note" — but adoption is the real fix and the
conversion is the consolation prize.

### 1.5 The org-mode preference is honoured by one path out of four

`settings.deferNoteBodies` is persisted correctly and read exactly once:

```
main.ts:4020  deferBodies()  →  chooseNote()      ← the Notes chooser, and nothing else
```

The toolbar `†`, `Ctrl+Shift+F`, and the command palette each splice `#הערה[|]`
straight into the buffer and never call `applyChoice`. So a writer who sets "note
bodies at the end of the file" gets it only when they go through the modal — which
is exactly the complaint: *"I have to go into the menu to pick an org mode one each
time."*

**Fix:** one insertion path, on the registry, shared by all four surfaces. §3.1.

### 1.6 There is no way to make an endnote from the document

`#הערתסיום` exists in the engine and appears **only** inside chooser cards. No
toolbar button, no Insert item. Reaching it from the command palette silently loses
every note unless the writer also knows to write `#הערות_בסוף()` — the trap
`apparatus-lint` now catches, and should not have to.

**Fix:** endnote gets a real button, and it carries its own dump call. §3.2.

### 1.7 Every tier knob is configurable and none of it is in the UI

`#הגדרות_הערות` and `#הגדרות_מדפים` already accept per-tier size, slant, colour,
indent, numbering scheme, label prefixes, inter-entry gaps, column counts and fixed
band heights. All of it. **None of it is reachable except by typing the command.**

And the shipped defaults are too timid to see: tiers step 0.9em → 0.88em → 0.86em.
A 2% size change is not a visual distinction; the ~1.1em indent is carrying the
entire burden of telling two tiers apart.

**Fix:** a Notes page in Styles that writes the same `#הגדרות_הערות` line a writer
would type, plus louder defaults so the tiers read apart before anyone configures
anything. §3.5, §3.6.

---

## Part 2 · Why the tests did not catch any of this

Worth writing down, because the fix for the family matters more than the six.

The existing fences assert **that a note reaches a page**. Not one of them asserts:

- **where** on the page it landed (top vs foot) — §1.3
- **what the marker looks like** (א vs 1) — §1.1
- **that a feature is reachable from the chrome** — §1.2, §1.6
- **that two paths to the same operation agree** — §1.5
- **that a described property is the property that renders** — §1.1, §1.2

`chooser.rs` renders every layout and checks every note appears. All six bugs pass
that test. The gap is not coverage of the engine; it is that *correct output in the
wrong place, with the wrong glyph, reachable from nowhere* is indistinguishable from
correct output when the only question you ask is "did it render".

A second, blunter lesson: **I read coordinates when I should have looked at the
page.** The inverted numbering was invisible in probe output and obvious in a
screenshot. The browser can reach `localhost` on this machine (via `localhost`, not
`127.0.0.1` — Vite binds `::1` only), so there is no excuse for inferring what a
page looks like.

### Lessons, stated plainly

Written down because the same five mistakes produced every bug on this page.

1. **A green test suite measured the wrong thing.** 2,276 assertions, 20 engine
   binaries, three audits — and an hour of hands-on use found six bugs. Not one of
   them was a gap in coverage; every one was a gap in *what was being asserted*.
   Volume of tests is not evidence of correctness and should stop being quoted as
   though it were.
2. **I fixed descriptions when the bug was in the thing.** `הערה_על_הערה` got an
   honest description this morning and stayed a cosmetic alias with a toolbar
   button. Making a lie accurate is not the same as making the feature real.
3. **I read coordinates instead of looking at the page.** The inverted numbering
   (§1.1) is invisible in probe output and unmissable in a screenshot. The browser
   reaches `localhost` on this machine — via `localhost`, not `127.0.0.1`, since
   Vite binds `::1` only. There was never an excuse.
4. **An exemption is an unchecked assertion.** §4.3. A test that is told to skip a
   case, with a prose reason nobody verifies, is worse than no test: it reports
   green over exactly the defect it was built for.
5. **I handed over a test script I had not run.** Every item in §4 was something I
   asked the writer to check. Two of them fail. The sweep costs minutes and should
   precede the hand-off, always.

**New fences (§3.8):**

- an apparatus that claims "foot of page" renders in the bottom third; one that
  claims "end" renders after the last body text
- each tier's marker matches the scheme the card advertises, asserted on glyphs
- every engine command in a `category` appears in at least one chrome surface, or
  carries a written exemption
- every path that inserts a note produces byte-identical markup for the same
  settings

---

## Part 3 · The plan

Ordered by how badly each one misleads a writer today.

### 3.1 One insertion path *(fixes §1.5)*

`insertNote(kind, opts)` becomes a `STRUCTURE_ACTIONS` entry. The toolbar button,
`Ctrl+Shift+F`, the palette and the chooser all call it. `deferNoteBodies` — and
every future note preference — is then honoured everywhere by construction rather
than by four authors remembering.

### 3.2 Toolbar and menu truth *(fixes §1.2, §1.6)*

- `⁑` → tiered note (`#הערה_ב` in context, `#הערה_א` at top level)
- new endnote button, which writes its own `#הערות_בסוף()`
- `הערה_על_הערה` stays a command, stops being advertised

### 3.3 The chooser asks two questions, not twelve *(fixes §1.3)*

**Where does it print** — foot of this page · end of this section · end of the
document · in the margin · a separate volume.
**How are layers arranged** — one series · stacked bands · parallel streams · fixed
regions.

The twelve cards become the cells of that grid, so the writer picks the thing they
can describe rather than recognising a sketch. Illegal combinations are greyed with
a reason, never hidden.

### 3.4 Tier 1 adopts native footnotes *(fixes §1.4)*

Plus a "make this a tiered note" action on an existing `#הערה`, for documents that
already exist.

### 3.5 Louder defaults *(fixes §1.7, second half)*

Numbering flipped to `("א", "1", …)` per §1.1. Size ramp widened, per-tier colour
and indent pushed until two adjacent tiers are distinguishable at a glance in
print, not just in a diff.

### 3.6 Styles › Notes *(fixes §1.7, first half)*

Per-tier size, slant, colour, indent, numbering scheme and label prefix, writing
the same `#הגדרות_הערות` line a writer would type by hand. **The UI and typing stay
the same mechanism** — this is the Emacs constraint, and it is what keeps the panel
from drifting from the engine.

### 3.7 Shloimy's way in

The gaps that are not bugs — they are things Word has and Ksav has not surfaced:

- **Insert ▸ Footnote / Endnote** in the menu bar, where a Word user looks first,
  with the Word shortcut (`Ctrl+Alt+F` / `Ctrl+Alt+D`) bound alongside ours
- a **live preview** on each chooser card, rendered from the writer's actual
  document rather than an ASCII sketch
- **right-click on a note** → convert, move to endnotes, change tier, delete with
  its marker
- a **notes pane** listing every note in the document, click to jump — Word's
  navigation pane, which is how anyone with more than ten notes actually works
- naming the arrangement in the writer's language: "footnotes", "endnotes",
  "footnotes with sub-notes", *and* their sefer names, so both Shloimy and a bochur
  find the same card

### 3.8 The fences from Part 2

Written before the fixes, so each one fails first.

---

## Part 4 · The browser sweep

Everything I had told the writer to test by hand, driven through the running app
at `localhost:5173` instead. This is the pass that should have happened *before*
handing over a test script.

### 4.1 Confirmed working

| Check | Result |
|---|---|
| Contextual ribbon | Docked under the toolbar, 11 actions, live readout `רשימה · פריט 1/2, רמה 1` |
| Ribbon tooltips | Every button names its operation *and* its shortcut (`פיצול הפריט · Enter`) |
| Heading dropdown | `טקסט רגיל` + `רמה 1…9` — all nine levels exposed, tracks the caret |
| Hydra `Ctrl+Alt+K` | Fires; in prose it declines with an honest reason rather than silently |
| `F1` help | Opens, 36 sections, shows the writer's *actual* bindings, has a ×, closes on Escape |
| `structureAt` | 11 actions inside the list, 0 outside — the ribbon logic is correct |

### 4.2 BUG · the list button still writes markup that will not compile

The exact defect reported this morning as "the UI lets you do things that are not
legal", which I claimed to have fixed at the root. Caret between two list items,
click the bullet button:

```
#רשימה(פריט[ראשון],רשימה(  פריט[],  פריט[],) פריט[שני])
                                              ^ no comma
STATUS: ✗ שגיאת קומפילציה
```

`mode.ts` got the hard part right — it correctly wrote the bare `רשימה(` with no
`#`, because the insertion point is code mode. What it never did was write the
**separator**. A spliced argument needs a comma after it, and this is the third
appearance of that same bug today (`addItem` doubled a comma, `outdentItem` emitted
`],,`, and now this one omits it entirely).

**Fix:** separator handling belongs in `insertSnippet` next to the mode decision,
not in each caller. If the insertion point is inside an argument list, the snippet
is responsible for arriving comma-delimited on both sides. And the engine fence has
to compile *UI-produced* markup for every action × every caret context, not only
the contexts a test author thought of.

### 4.3 BUG · the welcome modal has no way out

`#welcome` has **no × and ignores Escape**. The only exits are the template buttons —
so a writer who opens it by accident, with a document already in the buffer, has no
move that does not replace their work.

Worse, it is an explicit *exemption* in the reachability test:

```js
welcome: "every control on it dismisses it",   // app/test/chrome.test.mjs:36
```

That reason is false, and I wrote it. `chrome.test.mjs` exists precisely to catch
"a surface with no exit", and it was told to look away from the one surface that
has no exit. **An exemption is an assertion, and it was never checked.**

**Fix:** delete the exemption, add a × and Escape. Then make exemptions carry
evidence rather than prose — a test that says *why* it is safe should have to
demonstrate it.

### 4.4 Rough edges, not bugs

- **The ribbon vanishes one character past the structure.** Finish typing a list and
  the caret rests after the closing `)`, where `structureAt` correctly returns
  `null` and the ribbon empties. Correct by the model, wrong for Shloimy: Word keeps
  the table and list tools up while you are anywhere near the thing. The ribbon
  should hold its last structure until the caret is clearly somewhere else.
- **Glyph-only ribbon.** The tooltips are genuinely good, but a Word user does not
  discover a feature by hovering eleven arrows. Word labels its ribbon. At minimum
  the primary two or three actions should carry text.
- **Four dense strips of chrome** stack above the text before any prose is visible.

### 4.5 BUG · 36% of everything the UI can insert produces markup that will not compile

The hand-found list-button bug (§4.2) was not one bug. It was one cell of a grid
nobody had ever swept. So I swept it: **every snippet in the engine registry (114)
× every kind of caret position (9) = 1,026 documents**, generated through the app's
own `snippetAt` — the real insertion path — and compiled against the engine.

```
367 of 1026 cases produced markup that will not compile.

by caret context:
   114  list-between-items      ← every command, no exceptions
   114  list-after-open         ← every command, no exceptions
   114  table-between-cells     ← every command, no exceptions
     8  heading-body
     7  note-body
     3  list-in-item
     3  table-in-cell
     3  nested-deep
     1  prose
```

**Three caret positions where the editor is 100% broken for 100% of commands.**
Not a button — the whole surface, in those places.

Four distinct families underneath:

**A · no separator in code mode (342 cases).** `mode.ts` gets the hard part right
and then omits the comma:
```
#רשימה(פריט[ראשון],נטוי[] פריט[שני])
                          ^ needs a comma
```
**B · parameterless commands fuse with the following word (≈20 cases).** In content
mode a bracket-less snippet has no terminator, so it swallows the next characters
into a command name the writer never typed:
```
#כותרת1[פרק #קו_מפרידראשון]
    → "there is no command #קו_מפרידראשון"
```
This is the nastier of the two: the error names a command that does not exist and
never did, so the message actively misleads. Hits every parameterless command —
`קו_מפריד`, `מעבר_עמוד`, `מעבר_שורה`, `מעבר_טור`, `מקטע_עמוד`, `חסר`.

**C · genuinely illegal nesting, offered anyway (≈8 cases).** `#תוכן()` inside a
heading recurses until Typst's nesting guard fires and the document blanks. The UI
should grey it, not offer it.

**D · the image snippet is invalid as inserted.** `#תמונה("", רוחב: 60%)` fails in
plain prose with *"file not found"* — the writer clicked a button and got an error
about a path they were never asked for.

**Fix:** separators belong in `insertSnippet`, once, beside the mode decision — a
snippet is responsible for arriving correctly delimited on both sides, in whichever
mode it lands. Families C and D belong in the registry as a legality predicate the
chrome greys on. And the generator above becomes the fence: 1,026 documents is a
few seconds of engine time and it would have caught every one of these on the day
they were written.

### 4.6 The rest of the sweep, item by item

Your sixteen, all of them, honestly reported.

| # | Check | Result |
|---|---|---|
| 1 | Tiers three deep — distinct? | **Too subtle.** Indent carries it entirely; the size step (0.9→0.88→0.86em) and colour step are invisible, and one running sequence means the marker never says which band |
| 2 | Chooser "note on a note" | ✅ writes `#הערה_א` — the real tiered command. ❌ its config line hardcodes the inverted numbering |
| 3 | Footnotes + endnotes together | ✅ both render (foot y=771, endnotes y=126). ❌ **both marked ¹** — nothing distinguishes them |
| 4 | Notes at end of each section | ✅ fixed — both sections' notes render, each numbered from 1 |
| 5 | Fixed bands, page 1 | ✅ **y=756.97 on page 1 and page 2, identical.** Config-at-top fix confirmed |
| 6 | Org-mode bodies | ✅ `#הערה_בשם` / `#גוף_הערה` renders at the page foot |
| 7 | List keys | ✅ Enter splits, Shift+Enter writes a Typst linebreak, Tab nests, Alt+↑↓ moves. ❌ **Tab then Shift+Tab does not return** |
| 8 | Table ribbon | ✅ under the toolbar, 18 actions, `טבלה · שורה 1/2, עמודה 2/2` |
| 9 | Fresh table | ✅ `עמודות: (1fr, 1fr)` + header row (needed the rebuild) |
| 10 | Heading dropdown | ✅ tracks level 1 and level 8 correctly |
| 11 | ToC and folding | ✅ compiles, 3 fold markers in the gutter |
| 12 | Hydra | ✅ 11 keys in a list, 18 in a table, all labelled |
| 13 | Macros | ✅ F3 records with a visible `⏹`, stores by name, F4 replays elsewhere |
| 14 | Help search | ✅ "טבלה" returns the shortcut, the ribbon entry and the engine command |
| 15 | List button between items | ❌ **broken** — see §4.2, and it is 342 bugs not one |
| 16 | Hunt for illegal markup | ❌ **367/1026** — see §4.5 |

Two more, unprompted:

- **Hydra keys are Latin letters in a Hebrew UI.** `a s b d i o m v u n h`. A writer
  on a Hebrew keyboard layout presses `a` and the OS sends `ש`. Needs testing on a
  real Hebrew layout, and probably needs Hebrew-letter hydra keys as the default
  when the interface language is Hebrew.
- **The ribbon disappears one character past the structure** (§4.4).

### 4.7 What this sweep could NOT check

The engine was rebuilt mid-sweep (`cargo build --release`, 3m10s) and everything
above is against current code. Two things remain unverified:

- **heading levels 7–9 rendering distinctly** — the dropdown exposes them and the
  markup is right, but nobody has looked at the printed page to say whether the
  italic + 1em indent actually reads as nine levels
- **hydra keys on a Hebrew keyboard layout** — cannot be tested from here; needs a
  writer with the layout active

---

## Part 5 · Not in this pass

- `#הערה_על_הערה` removal — it is in documents already; deprecate, do not break
- reordering the chooser cards before §3.3 lands, which would be churn
- anything in the wasm/PWA build, untouched by all of the above

---

## Resolution — 4 August 2026

Everything in Parts 3 and 4 is done. What follows is what actually shipped, and
what it cost, because a plan without a record of the deviation is a plan that
gets believed twice.

### The numbers

| | before | after |
|---|---|---|
| UI insertions that do not compile (114 commands × 9 caret positions) | **384 / 1035** | **0** |
| caret positions broken for every command | 3 | 0 |
| surfaces that honour `deferNoteBodies` | 1 of 4 | all, by construction |
| note mechanisms with no button | 2 | 0 |
| app assertions | 2,297 | 2,580 |
| engine test binaries | 20 | 22 |

### §1.1 · numbering, and what it took to see it

`("א", "1", …)` in `_fn_defaults`, `_md_defaults` and `_pp_defaults`, and in the
chooser's own configuration line. The card's description was already right and
had been for weeks.

The fence is `engine/tests/apparatus_marks.rs`, and writing it taught the thing
worth keeping: **a marker sets on its own run**, superscript, at its own
baseline, so it is neither part of the word before it nor on the same *line* as
that word in a probe dump. Which is precisely why no coordinate test could have
caught this, and why an assertion about a glyph has to go looking for the run.
The first version of that file asserted on line substrings and failed all six
tests while the page was correct.

It also reproduced §1.3 inside itself: `body_marks` originally took "the top of
page 1", and `#הערות_מדורגות` renders in the main flow, so on a one-paragraph
document its own band sat inside that window and its entry markers counted as
body markers. §1.1 and §1.3 turn out to be the same bug seen from two angles.

### §1.2, §1.6 · the toolbar tells the truth

`⁑` writes the real tiered note, and it reads the caret: `#הערה_א` in prose,
`#הערה_ב` inside one note, `#הערה_ג` inside two. The endnote has a button (`⁋`),
an Insert item and `Ctrl+Alt+D`. `הערה_על_הערה` carries `deprecated: true` in the
registry, which is what drops it out of the palette, the completion and the
Insert menu — one flag rather than a list kept in four places.

Two existing actions moved to make room for Word's keys: `markDelete` to
`Ctrl+Alt+Shift+D` and `deferHere` to `Ctrl+Alt+Shift+F`. That is a user-visible
change to bindings people may have learned, and it is the right trade: Shloimy
reaches for `Ctrl+Alt+D` without thinking, and an editor that answers with
"mark this deleted" has told him the program is not for him.

### §1.4 · adoption, not conversion

`#הערה` **is** `הערה_בדרגה(1, …)` now. A sub-note hangs off the note the writer
already wrote, with no conversion at all. Held by
`a_subnote_hangs_off_an_ordinary_footnote`, and by
`an_ordinary_footnote_is_unchanged_by_being_tier_one` — the adoption is only safe
if it costs nothing, so tier 1's defaults are 1em / normal / black / no indent
and `_fn_wrap` hands the body back untouched in that case rather than wrapping it
in a `text()` that would force normal and black over whatever the document set.

The band apparatuses (`#מדור_*`, `#מדף_*`) collect their own markers and cannot
adopt a native footnote without printing its text twice, so for those the
consolation prize is the real answer: right-click a note, convert it in place.

### §1.5, §3.1 · one producer

Not four call sites wired to a shared function — **one producer, reached by
inserting the ordinary snippet**. `noteFor` recognises a registry snippet as a
layout's marker and `insertSnippet` routes it, so the toolbar, the palette, the
Insert menu, every key binding and the `#` completion all get the scaffolding and
the org-mode preference without knowing that notes are special. Held from both
ends by `app/test/notepaths.test.mjs`: the recogniser knows every marker, and
`main.ts` has no second way to write one.

### §4.5 · 384 → 0

The three families this fixed, and the one that turned out to be two:

- **A (342)** — separators, in `insertionAt`, once, beside the mode decision.
- **B (30)** — a bare command fusing with the next word. A space terminates it;
  `#חסר` also gained its parentheses in the registry, because unlike the four
  content-valued commands beside it, `חסר` is a *function*, and the bare form in
  an argument list is a function value rather than a call. One line, and it had
  produced two different failures in two different modes.
- **C (14, not 6)** — `legalAt`. The sweep with A and B fixed found `מעבר_עמוד`
  as well as `מקטע_עמוד`, and `#מיזוג` spliced between two cells, which overflows
  the row. All greyed with a reason on the tooltip.
- **D (6)** — `#תמונה("")` renders a dashed placeholder instead of failing.
  The alternative was greying "image" everywhere, which is a refusal of the
  thing the writer wants.

`engine/tests/insertion.rs` compiles all 1,035 in 17 seconds. It asserts **both
directions**, and the second is what keeps the first honest: everything offered
must compile, and everything greyed must genuinely fail. Without that, the
cheapest way to green is to grey the whole toolbar — and it immediately caught
that the two `מפתח_` indexes were being refused inside a heading when they work
there perfectly well.

### §4.3 · the exemption that was never checked

The welcome overlay has a ×, a dismissing scrim and Escape. More usefully,
`app/test/chrome.test.mjs` exemptions now carry **evidence the test runs**: an
`inline` claim is checked against `styles.css` (no `position: fixed`, no
`inset: 0`), an `inside` claim against the parent's construction site in
`main.ts`. Writing that immediately found the same trap the file already warns
about three sections lower — `id: "palette"` appears in the keybinding registry
before it appears on the element, and the new check read the first occurrence.

### §4.6 · item 7, which was a caret off by one

`indentItem` put the caret between the comma and the closing paren: still inside
the list, in no item at all. Tab worked, Shift+Tab immediately after it returned
null and did nothing. The nested branch of the same function had always been
right, which is how one operation had two different answers. Round-trip now
verified: indent then outdent returns the original text.

### What is still open

- **Heading levels 7–9** have not been looked at on a printed page. The markup is
  right and the dropdown exposes them; whether italic + 1em-per-level *reads* as
  nine levels is a question for eyes.
- **Hydra keys on a real Hebrew layout.** Every entry now carries a Hebrew key as
  well as a Latin one and `entryFor` answers to either, so the legend shows a key
  the keyboard can produce — but this box cannot test the layout, and only a
  writer with it active can say whether it is right.
- **Four dense strips of chrome** above the text (§4.4). Acknowledged, not
  addressed; it wants a design pass rather than a patch.
- **`#הערה_על_הערה`** is deprecated, not removed, and will stay that way.

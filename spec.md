# Ksav — The Note Options

**These are THE note options. There are eleven, and nothing else.**

Every earlier mechanism (tiered footnotes, per-page bands, streams, styled sub-notes,
source-notes, two-sided margins) either duplicates one of these or is a broken attempt at
one of these. This document is the whole surface: eleven options, grouped by whether they
give you **one layer of notes** or **notes on your notes**.

**Legend:** ✅ works today · 🧪 works in principle, needs one confirming render · 🔨 needs a
bounded build · ⚠️ renders but flawed, needs rework

> **Status as of the current build: all eleven work.** Each is covered by a
> rendered-output test in `ksav/engine/tests/apparatus.rs`, which reads the laid-out
> document through `ksav_engine::probe` and asserts *where things landed on the page*
> — not merely that the document compiled.

**The one ground rule that shapes all of this.** Typst gives exactly **one** native
page-bottom footnote series — balanced against the text across page breaks. That single
series is the *only* thing that truly floats at the live page foot. A **second**
independent page-foot series is not possible. So every option that wants a second layer
either (a) spends the one series and sends the second layer somewhere else, or (b) puts
both layers somewhere other than the live page foot (section/document end, a fixed region,
a companion document). Nothing here fights that rule; that's why these eleven are the whole
set.

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
bands below drift up. The whole apparatus lives in a region reserved at the foot of the
page (`מסמך(אזור_הערות:)`, set automatically by the engine when the document uses these
commands) — without that reserve the bands grew off the bottom of the sheet and took
the page number with them, which was the real defect here.

### 5. Parallel streams  ✅
Two or more apparatuses **both anchored in the main text**, each with its **own marker
symbols** (e.g. *,†,‡ for one, 1,2,3 for another) landing in its **own region** — the
peirush-plus-mareh-mekomos case. This is option 4 carrying more than one independent
stream; each stream can itself be two-tiered.
*Status:* **built**, same mechanism as #4 — `#הגדרות_זרמים(גבהים: (…))` reserves a fixed
slot per stream, stacked or side by side, each stream numbered from its own sequence.
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

**The one thing none of these do:** primary commentary *beside* the main text on the same
page **and** balanced sub-notes below it. That needs either a LaTeX/reledmac backend
(heavy toolchain, opt-in) or a custom paginator (multi-month build). Everything achievable
without that is one of the eleven above.

**All eleven proofs have been run** and are held by `tests/apparatus.rs`. What remains
is presentation, not mechanism: exposing the eleven through one intent-based "Notes"
chooser instead of ~25 raw command names (see audit item C1).

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

`#הערה_בשם(שם, סוג:)` reaches all eleven — `סוג` is the note command itself, and
every note command in the prelude takes its body as the last positional argument,
so a layout's own arguments pass through ahead of it. A layout written tomorrow is
reachable the day it is written.

| | |
|---|---|
| **Equivalence** | `tests/deferred_notes.rs` lays out each of the eleven twice, inline and deferred, and asserts every text run landed on the same page at the same coordinates at the same size. |
| **The editing model** | `Ctrl+Alt+J` jumps marker ⇄ prose and writes the prose when there is none — org-mode's `C-c C-c`. `Ctrl+Alt+F` exiles an inline note; `Ctrl+Alt+R` recalls it; the chooser moves the whole document at once. Names are generated; nobody types one. |
| **New failure modes** | Exactly two, both silent on the page: a marker with no body (prints a red `?`, an editor error), and a body no marker points at (prints nothing, an editor warning). Both are linted with a one-click fix. |

This is the org-mode arrangement, and it is worth having for the same reason it is
worth having there: the syntax is not the point, the jump is.

---
---

# Product Audit — "replace Word, for Hebrew" (2026-07-20)

A full read-through of the shipping code (`ksav/engine`, `ksav/engine/typst/ksav.typ`,
`ksav/app/src`) through one lens: *a bochur or Hebrew writer sits down to replace Word.*
Everything above is about the note apparatus; this section is everything else — bugs,
half-built features, redundancy, things a user wouldn't want or wouldn't understand, and
the Word-features that simply aren't here. Each item cites `file:line` and a fix direction.
Severity: 🔴 blocks real use · 🟠 hurts badly · 🟡 rough edge.
Status: **✅ done** items were fixed after this audit was written; each is a commit
with the reasoning. Everything not marked ✅ is still outstanding — **as of the
current build, nothing is: every item below is done.**

> **Guiding principle for this audit — the objective is to *complete*, not to cut.**
> Where a feature is broken or half-built, the goal is to make it **fully featured and
> working wherever that is possible**, not to delete it or hide it. A non-working feature is
> a to-do, not dead weight. "Hide behind an experimental flag" appears below only as a
> *temporary* stopgap so a writer isn't handed something visibly broken *while it's being
> fixed* — never as the end state. The single case where removal is the honest answer is a
> feature Typst's architecture genuinely cannot support (called out explicitly, e.g. balanced
> page-foot sub-notes beside main text — see the note-options doc); everything else is meant
> to be finished. Read every "hide/remove" suggestion below as "fix to fully working, and
> only shelve it in the interim if it's currently wrong on screen."

## A. Errors — produce wrong output, or can't work at all

- ✅ 🔴 **Images are impossible, not just missing.** The engine builds Typst with
  `TypstEngine::builder().main_file(source).fonts([...])` and *no file resolver*
  (`engine/src/lib.rs:226–235`). So `#תמונה(...)` / `image()` (`ksav.typ:945`) always fails
  "file not found" — there is no channel to hand image bytes to the compiler. And `תמונה`
  isn't even in the command registry, so nothing in the UI offers it. Inserting a picture is
  table-stakes for a Word replacement. **Fixed:** a compile request now carries the document's assets (base64) and the
  engine registers them under the names the document uses, via a `FileResolver`.
  `#תמונה` gained width/alignment/caption, is in the registry, and there is an
  Insert-Image entry. User fonts ride the same channel.
- ✅ 🔴 **Most of the note apparatus renders visibly wrong** (see the eleven-options doc above and
  the `ksav-apparatus-broken` findings). Concretely, and all reachable from the toolbar/palette:
  tiered footnotes orphan the tier number onto its own line (`ksav.typ:58` `pad(..)`);
  side-column notes clump at the top instead of aligning to their marker because
  `עם_הערות_צד` reads `_ksav_sn.get()` mid-grid (`ksav.typ:804–820`); per-page bands (`מדף`)
  drop the deepest tier and leak a stray marker; streams duplicate at the top of the page;
  and calling `הערות_מדורגות` for a **second** section reprints the *first* section's notes
  because `_md_phase` is a global monotone flag with an unscoped query (`ksav.typ:113,168`).
  These aren't labeled experimental anywhere the user can see. **Fix (goal = all working):**
  repair each — the individual defects are bounded and diagnosed (orphaned tier number =
  drop the `pad`/wrap in a `box`; sidenote alignment = collect via `.final()`/query not a
  mid-grid `.get()`; multi-section `מדור` = location-scoped query + per-section counter reset
  + drop the global phase flag; page-band tier drop + stream duplication = the read-only-footer
  fixes in `typst-apparatus-mechanism`). **Fixed — all eleven now render correctly** and are held by rendered-output tests
  (`engine/tests/apparatus.rs`, built on the new `engine/src/probe.rs`). Note that
  the diagnosis above was partly wrong: the page-band/stream defect was not a
  dropped tier or a duplicate, it was the whole apparatus rendering *past the
  bottom edge of the paper*. See `engine/README-notes.md`.
- ✅ 🟠 **The command palette (Ctrl+K) can't be driven by keyboard.** `renderPaletteList` styles the
  first row `.sel` (`main.ts:1118`) but nothing handles ArrowDown / Enter — the only palette
  key wired is global Escape (`main.ts:1470`). You open it, type to filter, then must reach for
  the mouse. A command palette that needs the mouse defeats its purpose. **Fixed:** arrows, PageUp/Down, Home/End and Enter all work, and hovering moves
  the selection so mouse and keyboard never disagree.
- ✅ 🟡 **Word count counts markup as words.** `updateCounts` runs `text.match(/[^\s]+/g)` on the raw
  document string (`main.ts:368–375`), so `#הדגשה[...]`, brackets, `//` comments, and command
  names all inflate the count. The number a writer watches is simply wrong. **Fixed:** it counts the text that will actually print.

## B. Half-implemented / inconsistent

- ✅ 🟠 **Prose ("Word-like") mode leaks raw markup for many commands.** WYSIWYG covers inline
  styles, lists, block tables, footnotes, and a handful of blocks — but endnotes (`הערתסיום`),
  cross-references (`#סמן`/`#הפניה`), `#חסר`, `#קו_מפריד`, images, sidenotes, and the whole
  band/stream family are **not** in `FOOTNOTE_NAMES`/`PROSE_STYLE` (`ksav-lang.ts:116–166,
  211–224`), so in the "looks like Word" view they appear as literal `#command[...]` text in
  the middle of the prose. Table cells render only bold/italic/underline/strike/code
  (`renderInline`, `ksav-lang.ts:253–295`); a cell using `#צבע(...)[…]` shows its raw markup.
  The mode advertises WYSIWYG but is patchy. **Fixed:** the root cause was that the
  command scanner matched only `#name[`, so anything taking a `(…)` argument was
  invisible to prose mode. With that fixed, coverage now extends to endnotes,
  cross-references, images, sidenotes, the band/stream family, colour, size,
  tracking, alternate fonts, small caps, super/subscript, direction runs and the
  Torah layer; body-less commands render as the thing they produce; and table
  cells honour the same inline vocabulary as the body.
- ✅ 🟡 **Prose footnote numbers are fictional.** The chip number is a single running counter
  `fnCount` over *all* note kinds (`ksav-lang.ts:501–512`), but real output numbers streams
  independently and bands with letters (א,ב). The preview's superscripts won't match the PDF. **Fixed:** notes are grouped into
  the apparatus each belongs to and numbered with that apparatus's own scheme, so
  two footnotes and two source-notes show 1,2 and א,ב exactly as they print.
- ✅ 🟡 **Prelude commands with no UI entry.** Defined but absent from `COMMANDS`, so undiscoverable:
  `תמונה`/img, `גודל_גופן`/fsize, `מרווח_אותיות`/track, `רווח_אופקי`/hspace, `מעבר_שורה`,
  `מעבר_טור`, `אות`/osource. **Fixed:** all of them are now in the registry and reachable from the UI.
- ✅ 🟡 **Dead code.** `templates::template_body` and `commands::categories` appeared
  unused. They are not dead but library API for anything embedding the engine;
  they now say so and are covered by tests rather than deleted.

## C. Redundant / over-featured (the biggest product problem)

- ✅ 🔴 **Eleven overlapping note mechanisms.** `הערה`, `הערה_על_הערה`, `הערה_א…ז`, `מדור_א…ז`,
  `מדף_א…ז`, `הערה_זרם`/`הערת_תוכן`/`הערת_מקור`, `הערתסיום`, `הערות_בסוף_צד`, `הערת_גיליון`,
  `הערת_ימין`/`הערת_שמאל` — ~25 registry entries in the "footnote" category alone
  (`commands.rs:77–106,130–134`). Most are broken (Section A). A writer cannot possibly know
  which to pick, and the palette's "Notes" group is a wall of near-duplicates. This is the
  single thing that most makes the app *not* feel like "smooth & easy for a bochur." Note the
  redundancy here is a *presentation* problem, not a reason to drop mechanisms — each of the
  eleven maps to a real sefer layout a writer may want. **Fix (two tracks, both toward "all
  working"):** (1) *finish them* — get every mechanism rendering correctly (Section A) so the
  set is genuinely eleven working tools, not eleven half-tools; (2) *present them well* — a
  single "Notes" chooser that asks the writer's intent ("footnote at page foot" / "collected
  at the end" / "two bands, commentary + he'aros" / "notes down the margin") and picks the
  right mechanism, instead of exposing 25 raw command names. **Fixed, both tracks:** every mechanism now renders correctly, and they are
  presented through one intent-based Notes chooser that asks where the note should
  go and writes the right commands — including the scaffolding (the dump call at
  the end, the wrapper around the section) whose absence is the most common reason
  these layouts appear broken. The raw commands remain in the palette.
- ✅ 🟠 **Three disconnected styling systems that fight each other.** (1) the Settings drawer
  (`DocConfig`: font/size/margins/spacing…), (2) one-click **Skins** which silently
  `Object.assign` over those settings (`main.ts:583–589`), and (3) in-document `#הגדרות_כותרות/
  _רשימות/_טבלאות` commands that have *no* UI surface at all. Change the font in Settings, then
  click a Skin, and your font is gone with no undo affordance; meanwhile the most powerful
  styling (per-level heading config) is only reachable by typing Typst-ish markup. A user has no
  mental model of "where does my formatting live." **Fix:** one Styles panel; make Skins a
  starting point that's clearly a reset, and expose heading/list/table config as controls.
  **Fixed** (priority item 6): one Styles panel holds page setup, presets and the
  document's own heading/list/table design; a preset says what it replaced and can
  be undone; arguments the panel does not understand are preserved verbatim.

## D. UX — bad, non-intuitive, or "why would I want that"

- ✅ 🔴 **There is only one document, ever.** The whole app persists a single `localStorage["ksav.doc"]`
  (`main.ts:157–159, 455`). "Open" *replaces* the current text; there's no library, tabs, recent
  files, or even a title. A writing tool that holds one document at a time is a hard wall for
  anyone with more than one thing to write. **Fixed:** `app/src/docs.ts` owns a library of named documents, each with its own
  assets, with a title in the header and a Documents menu to switch. A document
  nobody renamed takes its title from its own first heading.
- ✅ 🔴 **Data lives only in the browser's localStorage** — documents, version history, user
  templates, settings (`main.ts` throughout). Clear site data, switch browser/machine, or hit
  a quota and it's gone. Even the Tauri desktop build stores in webview localStorage, not real
  files on disk. For a writing app this is a serious loss risk. **Fixed:** `app/src/files.ts` binds a document to a real file — a native dialog and
  a genuine path in Tauri, a File System Access handle in the browser, and an
  honest "Save a copy" fallback where neither exists. Handles persist in IndexedDB
  so a document is still bound to its file after a reload.
- ✅ 🟠 **"Save" can't save — it only downloads.** Every Save writes a fresh `document.ksav` to the
  Downloads folder (`main.ts:1207–1211`); Open doesn't retain a handle (`main.ts:1183–1206`).
  You can't reopen a file and overwrite it — each save spawns another copy. There's no
  Save-vs-Save-As and no "current file." **Fixed** with the above: Save writes back to the bound file, Save As binds a new
  one, and write permission is re-checked before promising a save.
- ✅ 🟠 **Only two fonts.** The Settings font picker offers just Frank Ruhl Hofshi and David Libre
  (`main.ts:900`), which is all the engine bundles (`lib.rs:23–27`). No system fonts, no way to
  add one. Hebrew writers expect Narkisim/Guttman/David/Miriam/etc. and a font menu. **Fixed:** the compile request carries user font bytes on the same channel as
  images, and the font box is free text with the attached families listed.
- ✅ 🟠 **No mobile / narrow-screen layout.** Zero `@media` rules in `styles.css`; the toolbar is one
  long flat row of ~30 buttons that overflows. Unusable on a phone/tablet. **Fixed:** under 900px the header becomes one horizontally scrolling row and the
  panes stack; under 720px targets grow to finger size; under 480px a single pane
  shows at a time. Scrolling rather than an overflow menu, because scrolling hides
  nothing.
- ✅ 🟡 **"Export HTML" and Print emit page-image SVGs, not web content.** `htmlDoc` wraps the
  rendered SVG pages (`main.ts:1229–1240`); the "HTML" is fixed-size page pictures, not
  reflowable, copy-friendly HTML. **Fixed:** HTML export uses Typst's own HTML backend — real headings, emphasis,
  lists and linked footnotes. Print deliberately keeps the page images, since what
  comes out of a printer must match the PDF. Markdown and plain-text export were
  added at the same time (audit item E7).
- ✅ 🟡 **Nikud bar is click-only.** **Fixed:** every vowel has an Alt key, shown on
  its button, bound only while the bar is open. Auto-nikud remains a separate,
  much larger question.
- ✅ 🟡 **Redo is `Mod-y` only** (`main.ts:236`); many users press `Mod-Shift-z`. Several toolbar actions (lists, table, ToC, align, new-doc) ship with no default
  shortcut at all. **Fixed:** Mod-Shift-z is now an alias (dropped if the writer
  binds it themselves), and the unbound actions have defaults.
- ✅ 🟡 **Local server returns `Access-Control-Allow-Origin: *` on `/compile`** (`server.rs:82,99`).
  It binds 127.0.0.1 and carries no secrets, so risk is low, but any website you visit while
  `ksav serve` runs can POST to it. **Fixed:** only the app's own origin is reflected, plus the Vite and Tauri dev
  servers.

## E. Missing — a Word user will look for these and not find them

- ✅ 🔴 **Hebrew spell-check.** **Built, on a lexicon Ksav owns.** The obvious route
  was ruled out on investigation: the only open Hebrew dictionary in existence
  (Hspell, 2017) is AGPLv3 *and* flags ~9.5% of Shulchan Arukh, ~26% of Talmudic
  Aramaic and ~99% of pointed text — the correct words — while rejecting the whole
  citation apparatus. So the lexicon is built from Public Domain corpora (Sefaria
  for Torah Hebrew, Project Ben-Yehuda for general Hebrew) plus a curated
  supplement and the writer's own dictionary. 269k entries, 732 KB gzipped, and —
  with Hebrew prefix stripping and a year rule — **0.7%** missed words on modern
  Torah prose against Hspell's 4.9%, 0% on pointed text, and zero flagged words
  across Ksav's own templates.
- ✅ 🟠 **Image / media insertion** (see A) — with resize, alignment and caption.
- ✅ 🟠 **Table editing UI** — **built**: a bar appears whenever the cursor is inside
  a table, offering insert/delete row and column and a header-row toggle. Cell
  border and fill are set through the Styles panel's table section.
- ✅ 🟠 **A Styles gallery** — **built** as the Styles panel: presets plus real
  controls for the `#הגדרות_*` commands that were previously invisible.
- ✅ 🟡 **Review tools** — **built.** `#הוספה` / `#מחיקה` / `#הערת_עורך` are tracked
  insertions, tracked deletions and editorial comments, and `#הגדרות_סקירה(תצוגה:)`
  reads the document with the marks, as if every change were accepted, or as it
  read before any of them. A comment rides the sidenote engine, so it lands beside
  its own line. Accepting and rejecting is a **rewrite of the source**, not a view
  setting — a decision that only changed the display would be gone the next time
  the file was opened — and the review drawer takes them one at a time or all at
  once, nested marks included.
- ✅ 🟡 **Math / equations** — **built.** `#נוסחה` / `#נוסחה_בשורה` evaluate Typst's
  own maths notation from a string and wrap it in an LTR run, because mathematics
  reads left-to-right in Hebrew too. This is what made it more than a wrapper: math
  layout needs a font with an OpenType MATH table, no Hebrew text font has one, and
  without it every formula failed outright — so the engine now bundles NewCM Math
  (OFL, 1.3 MB). The insert dialog carries a keypad for the notation.
- ✅ 🟡 **Section-level page setup** — **built.** `#מקטע_עמוד(…)[…]` gives one section
  its own header, footer, columns, margins, paper, orientation, page numbering,
  border and watermark; the rest of the document is untouched. It has to override
  the footer as well as `numbering:`, because the document wrapper draws the page
  number itself and would otherwise overrule the section.
- ✅ 🟡 **Interop export** — Markdown and plain-text export added, alongside real
  reflowable HTML. `.docx` remains correctly ruled out.

## Suggested priority order

Items 1–5 below are **done**; each is a commit with its reasoning.

1. ✅ **Make the note apparatus fully working** (A2/C1) — all eleven render correctly,
   held by rendered-output tests, behind one intent-based Notes chooser.
2. ✅ **Real documents + real files** (D) — a library of named documents with genuine
   open/save across Tauri, File System Access and a download fallback.
3. ✅ **Images** (A1) and **more fonts** (D) — both on the new assets channel.
4. ✅ **Spell-check** (E1) — on a lexicon Ksav owns; see the note under E.
5. ✅ **Polish** — palette keyboard nav, honest word count, prose-mode coverage,
   responsive layout, CORS, shortcuts.

6. ✅ **One Styles panel** (C2) — page setup, presets and the document's own
   heading/list/table design in one drawer. Presets are reversible and say so;
   the in-document `#הגדרות_*` commands have real controls; arguments the panel
   does not understand are preserved verbatim.
7. ✅ **Table editing UI** (E3) — a bar appears when the cursor is inside a table,
   with insert/delete row and column and a header-row toggle.
8. ✅ **Nikud typing** (D) — every vowel has an Alt key, printed on its button,
   live only while the nikud bar is open. A vowel now points the end of a
   selection instead of replacing it.

9. ✅ **Review tools** (E5) — tracked changes, editorial comments, and a review
   drawer that accepts or rejects them one at a time by rewriting the source.
10. ✅ **Section-level page setup** (E7) and **math** (E6) — `#מקטע_עמוד` and
   `#נוסחה`, the latter at the cost of a bundled math font.

**Nothing in this audit is outstanding.** All three closing items are held by
rendered-output tests in `engine/tests/review.rs`, on the same standard as the
apparatus: which words survive each review view, that a landscape section is the
only landscape page, that a watermark does not leak into its neighbours, and that
a formula runs left-to-right inside right-to-left text.

---
---

# Adoption Wave — "why a bochur still wouldn't switch" (2026-07-21)

The audit above closed every *capability* gap. This wave closes the reasons a
real yeshiva bochur would still open Word instead, which turned out not to be
capability gaps at all. Assessed honestly, the blockers ranked:

1. **He cannot install it.** No installer exists. If getting Ksav involves cargo,
   npm, or a dev server on a port, then for almost everyone the software does not
   exist. This is the single biggest one and always was.
2. **It cannot hand a document back.** Everything a bochur writes goes *somewhere* —
   to a rebbi, a chavrusa, the kovetz editor, a printer — and all of them want
   Word. PDF-only means he can send a finished thing but nobody can touch it.
   `.docx` from Typst remains infeasible; but that was never the requirement. The
   requirement is "the person I send it to can edit it", and HTML reaches Word.
3. **A dropped bracket feels like programming.** Typst reports an unclosed `[` at
   *end of file*, thousands of characters from the mistake, and the preview goes
   blank. It is the one moment that breaks the illusion of a writing tool.

Not in this wave, and honestly out of reach for now: cloud sync, real-time
collaboration, mobile, and the bus factor. Those need infrastructure and other
people, not a commit.

## 1. Bracket healing  ✅

`app/src/brackets.ts` — one pure, dependency-free scan (text in, findings out)
feeding three layers, so the gutter, the fix and the preview can never disagree
about what is wrong.

- [x] **Live lint** — mark the *opener that never closes*, before any compile,
      naming its command ("#הערה is never closed"). Points at the cause, not at
      EOF. Also catches stray closers and an unterminated `/*`.
- [x] **One-click heal** — insert the closer where it belongs. Inline commands
      (`שלום #הדגשה[עולם`) close at end of line; block commands (`#הערה[` alone on
      its line) close at the end of the block — the first blank line or the next
      `#command` at the same-or-shallower indent.
- [x] **Speculative preview** — when the document is momentarily unbalanced,
      compile the *healed* copy so the page keeps rendering, with a banner saying
      the preview assumes a closer. A stray keystroke must never blank the page.

**Superseded, 6 August 2026.** This used to read: *"The scanner must agree with
`matchGroup` in `ksav-lang.ts` on the gershayim trade-off: `"` is **not** a string
delimiter, because רש"י and שו"ע are everywhere and pairing quotes swallows whole
tables."* Two things were wrong with it. It was a rule asserted in prose between
two scanners that could drift — and they did, in both directions: `lists.ts`
paired quotes and switched every list operation off the moment a writer typed
רש״י, while `brackets.ts` did not and therefore read the `)` inside
`#הערה_זרם("a)b")` as a real closer, reported a valid document broken, and
*deleted the real closing paren* when the writer pressed heal.

And the trade-off was false. Typst has no single rule: `"` is an ordinary
character in content mode (`[…]`) and a string delimiter in code mode (`(…)`,
`{…}`), so tracking context gets both and gives up neither. There is now one
scanner — `app/src/spans.ts` — every consumer reads it, and `test/spans.test.mjs`
fails if a second one appears.

## 2. Word handoff  ✅

- [x] **Export → Word (.doc)** — wrap Typst's own reflowable HTML export in the
      Word-HTML envelope (mso namespaces + `<w:WordDocument>`), RTL-aware, page
      size and margins carried from the document settings. Word opens it and
      converts it to a fully editable document.
- [x] **Copy for Word** — the same HTML onto the clipboard as `text/html`, so a
      paste into an open Word window keeps the formatting.
- [x] Say plainly what does not survive: the multi-stream apparatus, bands and
      side-columns flatten. Prose, headings, bold/italic, lists, tables and plain
      footnotes make it across. That is the honest 80%, and nobody edits an
      eleven-layer apparatus in Word anyway.

## 3. Installers  🟡

`tauri.conf.json` already has `bundle.active` and `targets: "all"`, so the
bundlers are wired; nothing has ever been built.

- [x] **Windows** — `.msi` (WiX, 19 MB) + `.exe` (NSIS, 14 MB), both built and the
      packaged `app.exe` smoke-tested: it launches standalone, spawns WebView2 and
      renders the embedded UI with no dev server.
- [x] **Linux** — `.deb` / `.AppImage` through Docker over WSL
      (`ksav/packaging/build-linux.sh`). Pinned to Ubuntu 22.04 because glibc is
      backward but not forward compatible, so building on a newer distro would
      silently drop everyone on an older one.
- [ ] **macOS** — `.dmg`, both architectures. Cannot be cross-built; only the CI
      job can produce it, so it stays unbuilt until the repo has a remote.
- [x] **CI matrix** — `.github/workflows/release.yml` builds all four targets
      (Windows, Linux, macOS arm64 + x86_64) on tag push and attaches them to a
      draft release. Written but never executed: **the repo still has no git
      remote**, which is now the only thing standing between here and a macOS
      build.

**Signing is unresolved and costs money.** Unsigned, Windows SmartScreen says
"unrecognized app" and macOS says "unidentified developer". A bochur meeting that
dialog is nearly as blocked as one with no installer, so shipping unsigned buys
back less trust than it looks. Apple Developer is $99/yr; a Windows OV
certificate is ~$200–400/yr. Ship unsigned with install instructions as a
stopgap, but treat signing as the real fix.

## What this wave did not fix

Stated plainly, because the honest list is the useful one:

- **Signing.** Every installer above is unsigned. Windows SmartScreen and macOS
  Gatekeeper both warn on first run, and a bochur meeting that dialog is nearly
  as blocked as one with no installer at all. Certificates cost money; there is
  no engineering workaround.
- **No macOS build yet** — needs the CI job, which needs a remote.
- **Still nobody has used it.** Zero bochurim have written a real document in
  Ksav. The installers make that testable for the first time; five people for one
  zman is worth more than the next five features.
- **Cloud sync, collaboration, mobile, bus factor.** Unchanged and out of reach
  without infrastructure and other people. Open-sourcing the repo is the only
  real answer to the last one.

---
---

# Borrowed Wave — what Katvan already knew (2026-08-04)

[Katvan](https://github.com/IgKh/katvan) is a Qt editor for Typst with, in its
author's words, "a strong bias for Right-to-Left editing". Same typesetter, same
language, same reader, arrived at from a different direction — and its author has
been round several corners this project had not turned yet. Reading it produced
three changes and one confirmation.

Katvan is GPL-3.0 and Ksav is MIT/Apache-2.0, so **no code came across**. What
came across is which problems are real and what the shape of a solution is; in
two of the three cases CodeMirror already had the mechanism and nobody had
called it.

## 1. The preview knows where things are, and we were guessing

`main.ts` turned a click on the preview into a cursor position like this:

```ts
const f = (preview.scrollTop + (e.clientY - rect.top)) / preview.scrollHeight;
const line = Math.round(f * view.state.doc.lines);
```

A click 40% down the preview put the cursor 40% down the document. That is right
for one column of uniform text with no page breaks and nothing floated, which is
the precise opposite of what this application exists to typeset: a page with four
stacked note bands is mostly apparatus by area and mostly body text by line
count, so the error was not merely imprecise, it was **biased** — always landing
early, by an amount that grew with how much apparatus the page carried.

Typst has known the answer all along. Every laid-out glyph carries the `Span` of
the source it came from, and `typst-ide` — the crate the Typst CLI's own editor
integrations use, which this project simply had never depended on — walks the
frame tree for it. `engine/src/jump.rs` is now that, in both directions:

| | |
|---|---|
| **Inverse search** | `POST /jump` — a click, as a place in the source. `{}` for a click on a margin, a running head or a note-band rule, all of which the prelude generated and the writer did not type. |
| **Forward search** | `POST /reveal` — the cursor, as a place on the page. A list, because in this document shape text really does print more than once: a note set in both a band and an endnote list, or anything in a running head. |
| **The unit** | Typst points, both ways, because that is what each page's own SVG `viewBox` is written in. The client divides by the drawn element's bounding box, which cancels zoom, fit-to-width and device pixel ratio at once — none of the three appears anywhere in `app/src/jump.ts`, and that is the property its tests assert. |
| **The line** | Counted in the body that was *sent*, exactly as `diagnostics[].line` is, and put through the same `lineInDocument` subtraction. Two conventions for "where in the document" would have been one too many. |
| **Cost** | A full layout per answer — that is what makes it exact — so both go through the compile deadline and concurrency cap, and forward search is a keystroke (`Ctrl+Alt+P`) rather than something that follows the caret. |

Proof that it is not another guess: the tests in `jump.rs` ask where line 3
printed, click there, and require line 3 back. The same round trip over HTTP
against the release server returns `{"line":3,"column":11}` — column 11 being the
*last* character, because the point named is the glyph's left edge and the line
is RTL, which is Typst being right about bidi rather than this being wrong.

## 2. Mixed-direction source, and the two separate reasons it moved

Katvan's roadmap lists "give blank lines the base direction of the previous line"
as a 1.0 blocker, with the reason attached: otherwise the logical cursor gets
stuck between two RTL paragraphs when the system language is LTR. That is a bug
report from someone who has hit it, not a theoretical concern, and Ksav had the
same hole — one `dir` on the content element, inherited by every line.

`app/src/bidi.ts` fixes two things that look like one:

- **A base direction per line.** Any line with a letter in it answers for itself.
  A line with none — blank, or holding only `]` — inherits: from the line that
  opened the group it is inside, then the previous line, then the document. The
  first of those is Katvan's `findMatchingIndentBlock`, and it is why the closing
  bracket of an English block reads the way the block does rather than the way
  its last line happened to.
- **Isolated syntax.** A call like `#צבע(rgb(...))` in a Hebrew sentence used to
  scatter its brackets through the words around it. Katvan solves this by
  building a shadow copy of every line with LRI/RLI/FSI and PDI injected plus an
  offset map to keep cursor positions meaning something
  (`core/katvan_editorlayout.cpp`, and it is as unpleasant as it sounds).
  CodeMirror has it built in: `Decoration.mark({bidiIsolate})` registered through
  `EditorView.bidiIsolatedRanges`. **Both halves are required.** The CSS alone
  would reorder the text on screen while CodeMirror still measured the old order
  — text that looks right with a caret that lies, which is worse than the bug.

`bidiIsolates()` from `@codemirror/language` would have done the second for free,
but it works off Lezer nodes marked as isolating and Ksav's highlighter is a
regex scanner with no grammar behind it. So the ranges come off the same scan the
highlighter uses, which at least means the two cannot disagree about where a
command is.

The blast radius is deliberately small: the inheritance chain is consulted **only**
for lines containing no letter in any script.

## 3. The characters you cannot see

When the heuristics lose — and on a line of one Hebrew word, one English word and
a bracket, eventually they will — the only recourse is a control character placed
by hand, which is invisible and takes a keypress to step over. A file with a
stray RLM in it reads identically to one without and behaves differently.

So `Ctrl+Alt+X` wraps the selection in an isolate (and a second press unwraps
it), and every bidi control character in the document is drawn as a small
labelled tag. Katvan ships a font for this (`assets/KatvanControl.otf`); a chip
costs nothing and says more, since the point is telling RLM from LRM.

The drawing shares a compartment with prose mode, so the two can never both be
installed. Not a rule anybody has to remember: both work by replacing ranges, a
control character can sit inside hidden command syntax, and two replacements over
one range makes CodeMirror reject the whole decoration set and blank the editor.

## And the confirmation: `notes.typ`

[tudborg/notes.typ](https://github.com/tudborg/notes.typ) was read for the same
reason and yielded nothing. It is one file of about a hundred lines: a `state()`
array, a `counter()`, and a render function. `typst/ksav.typ` is 1,701 lines of
regrouped stacked bands, per-tier numbering, per-page `query` footers and
section-scoped dedup. Its one idea Ksav lacks — reusing an index when two notes
share identical text — Ksav had, tried, and **deliberately removed**
(`ksav.typ:152`).

Nor does it have deferred bodies. `#notes()` chooses where notes *render*; the
question of where their prose *sits in your file* is the one "The other axis"
answers above, and notes.typ does not ask it.

## What this wave did not do

- **Nobody has clicked any of this in a browser.** The headless browser on this
  machine cannot reach loopback. What is verified is 1,075 app unit tests, the
  engine suite, a clean production build, and a live HTTP round trip through the
  real compiler on the release binary — which covers the arithmetic and the wire
  and does not cover the pixels.
- **The wasm module must be rebuilt** for the browser backend to have `ksav_jump`
  and `ksav_reveal`. The Rust and the type stubs are in; `wasm-pack build` is not
  part of a normal checkout's build and has not been run here.
- **`typst-ide` brings three more things nobody took**: `autocomplete`, `tooltip`
  and `definition`, all compiler-driven and all better than the hand-rolled
  tables. They are left alone on purpose — raw Typst completions would spill
  English identifiers into a Hebrew surface, so taking them means routing them
  through `commands.rs` first, which is a wave of its own.

---
---

# Borrowed Wave II — typstify, and the fourteen features around it (2026-08-04)

[typstify](https://github.com/typstify/typstify) is a Go/Gio desktop IDE for
Typst — tinymist LSP, a package manager, `publish package`, git diff gutters,
Zotero sync, an embedded coding-agent chat with an MCP server. Its README tells
you to *"place the executables `typst` and `tinymist` in the root folder"*, which
is the whole philosophical difference: it drives external binaries, Ksav embeds
the compiler. Apache-2.0, so code could have come across; none did, and none
needed to. What came across is which problems are real.

Most of typstify's surface is aimed at somebody who wants to write *Typst*, not
somebody who wants to write a *sefer*. The intersection is four things, and this
wave took all four plus the ten features that reading it prompted.

## What was taken from typstify

| | |
|---|---|
| **The overview ruler** (`editor/ruler.go`) | A strip beside the scrollbar with a tick per problem. Ksav already computed every one of them — compile errors, misspellings, unclosed brackets, orphaned deferred notes, changed lines — and threw away the only view that makes them useful at length. In a three-hundred-page sefer "four problems" is not knowledge; "all in perek gimmel" is. |
| **The diff gutter** (`editor/diff.go`) | Theirs is against `git HEAD`. A bochur has no repository, but Ksav takes periodic snapshots, and *"what did I change since Shabbos"* is the question actually being asked — so that is the baseline, and taking a snapshot clears the gutter. |
| **The file watcher** (`service/filewatcher.go`) | Not a feature: a hole. See below. |
| **Crash report + update check** (`ui/crash_report.go`, `ui/settings/update_check.go`) | Both routine, both missing. |

**Explicitly not taken:** the package manager and Zotero sync. Both are the right
idea pointed at the wrong ecosystem — `@preview/*` is English academic packages,
and supporting it means putting a network, a resolver and a cache inside an engine
whose entire design is that it has no filesystem. The needs *underneath* them are
real, and they became the source index and the sefer catalogue.

## The hole worth naming first

`files.ts` binds a document to a real path and `save.ts` writes to it on a
thirty-second timer, and **nothing anywhere asked whether that file still held
what Ksav last put there**. Dropbox pulling an older copy down, a second window,
a text editor open on the same file, `git checkout` — in every one of those the
next autosave silently overwrote somebody's work with no error, no prompt and
nothing in the log. It had been there since the file binding shipped.

The unit is a **stamp** — mtime and size at the moment Ksav last read or wrote —
which polls identically through Tauri, a browser file handle, a focus event and a
timer, and needs no privileged watcher. The decision worth recording is the
*direction of the default*: **"cannot tell" reports as unchanged.** A false
"changed" means a prompt on every save on any platform that cannot stamp, which
teaches the writer to dismiss the prompt without reading it — and a prompt nobody
reads is worse than none, because it also convinces everyone the problem is
handled. Everything else follows: the background autosave never resolves a
conflict, it stands down; a manual Save asks, because the writer is there to
decide; reload-from-disk snapshots first, since the version history is the only
thing that makes it reversible.

## The fourteen

1. **מפתח מקורות** — the generated source index. The flagship, and the one thing
   here Word cannot do at all. It needs three facts a string does not carry: that
   ב״ב and בבא בתרא are one masechta, that בבא בתרא follows בבא מציעא
   (alphabetically it precedes it), and that ג. precedes ג: precedes ד.
   `engine/src/sefarim.rs` is the single catalogue — Tanach, all 63 masechtos in
   seder order, Rambam, Shulchan Aruch — and it generates both the prelude's
   lookup and the editor's autocomplete, so the two cannot become two opinions.
   `every_alias_is_unambiguous` immediately found that מ״ב was claimed by both
   מלכים ב and משנה ברורה.
2. **מפתח ענינים** — the topic index, on the same machinery. Page numbers are
   right by construction: read off the finished layout, never predicted. They
   follow the document's own numbering, so a sefer numbered א,ב,ג gets a Hebrew
   index with nothing configured. Terms sort by their *letters* — the gershayim
   is U+05F4, above every Hebrew letter, so a raw sort exiles every abbreviated
   term past the end of its own letter's run.
3. **A sefer is many files** — `#כלול("פרק ג")`, expanded in the engine with a
   line map so a diagnostic still reads *"פרק ב · שורה 2"* and clicking it opens
   that chapter. Typst's own `include` could not be used: it takes a string
   literal (so `#כלול` could not be a function) and gives the included file its
   own scope (so the prelude would be invisible inside a chapter).
4. **Import .docx** — the easy direction, which had been skipped; Ksav solved the
   hard one first. No dependencies: a zip reader plus `DecompressionStream`.
5. **Two-sided page setup** — inside/outside margins that mirror by page parity,
   a binding gutter, verso/recto running heads, outside-edge page numbers. A
   uniform `margin_cm` was a hard stop for anyone taking a file to a printer.
6. **Real PDF export options** — PDF/A standards, tags, metadata, page ranges.
   `typst_pdf::pdf(..).ok()` had been throwing every export diagnostic away, so a
   failed export came back as `ok: true` with no bytes and no explanation.
7. **PWA** — manifest and service worker. The wasm build was *already* a static
   site running the real compiler in-browser with documents in IndexedDB; this is
   the whole difference between that and an app on a phone that works on the bus.
8. **Share links** — the document in the URL *fragment*, which is never sent to a
   server. The review tools already rewrite the source, so "a link for comments"
   needs nothing installed at the far end and no infrastructure at this one.
9. **Vim and Emacs** — the real implementations, loaded on demand. The mode wins
   over Ksav's own shortcuts, and each gets its native save (`:w`, `C-x C-s`);
   an Emacs mode without C-k and C-y is the costume this was asked not to be.
10. **Focus and typewriter modes** — two settings, because they are two things:
    one is about what you can see, the other about where the line you are on sits.
11. **Orphan letters** — a one-letter preposition is never left at a line end.
    Off by default: it changes where lines break, and turning it on for every
    document ever written would silently repaginate all of them.
12. **Rashi script** — `#כתב_רשי`, with a fallback chain. Ksav bundles no Rashi
    font and will not; every one worth using is commercial or of unclear licence.
13. **Crash recovery** — the text is stashed *synchronously* before anything else
    is attempted, then offered as a download, then the stack. typstify's
    priorities inverted on purpose: for a Go IDE the stack is the point; for a
    writing tool it is a distant second to the words.
14. **In-app update check** — one named CSP origin, no telemetry, no
    auto-download, and nothing on the request but the request.

    > **Corrected, 5 August 2026.** "One named CSP origin" was true of *one of
    > the three copies of the policy*. Vite's had `https://api.github.com`; the
    > engine's and Tauri's did not, and a browser **intersects** the policies
    > delivered to a document rather than letting the last one win — so the
    > feature was dead in both builds that ship an installer, which are the only
    > two that cannot update by pressing reload. The policy is now
    > `ksav/policy/csp.txt`, read by all three, and the desktop build fails if
    > `tauri.conf.json` disagrees with it.

## What this wave did not do

- **Nobody has clicked any of it.** The headless browser on this machine cannot
  reach loopback. What is verified is 301 engine tests, 1313 app tests, `clippy
  -D warnings`, `tsc`, `cargo check` on the Tauri crate, and a production build —
  which covers the arithmetic and the wire and does not cover the pixels. Vim
  mode in particular has never had a key pressed in it.
- **The wasm module must be rebuilt** for `ksav_sefarim` to exist in the browser
  backend. The Rust is in; `wasm-pack build` is not part of a normal checkout.

  > **Overtaken, 5 August 2026.** Worse than this bullet knew. The Rust was in
  > and the *worker's dispatch table* was not, so rebuilding would not have
  > helped: `FNS["sefarim"]` was `undefined`, the call threw, and `sefarim.ts`
  > swallowed it. That is the whole of finding §2 in
  > `lamdan/whole-repo-2026-08-05.md`, and the fix was to delete the four
  > hand-written registries rather than to add a ninth export to one of them.
  > There is now one table — `engine/src/services.rs` — and one wasm export,
  > `ksav_call(name, input)`, so the browser build cannot be missing a service
  > the engine has. See `ksav/README.md` § *The engine's services*.
- **The `#כלול` directive rule is now written twice**, once in Rust and once in
  TypeScript. If the two disagree, the client never sends a chapter the engine
  then reports as missing. Both suites pin the same cases deliberately; that is a
  mitigation, not a fix.
- **Auto-nikud was dropped** from this wave on purpose.
- **Still nobody has written a real sefer in Ksav.** Unchanged, and still worth
  more than the next fourteen features.

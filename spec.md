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

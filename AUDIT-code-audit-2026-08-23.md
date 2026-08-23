# Code audit — 23 August 2026

A full external audit of Ksav across four lenses — **bugs, inefficiencies,
confusing behavior, missing features** — graded at the end. It was conducted by
an agent that wrote no product code: every finding below was reached by
reading source, by driving the assembled application in a real browser over
CDP, or by pushing inputs through the CLI and HTTP API and reading what came
back. Artifacts (probe dumps, fuzz corpus, screenshots, logs) are outside the
repository at `C:\Users\Administrator\Videos\Ksav-audit\`.

Provenance: engine built fresh from HEAD `c9d4f36` (release, 3m15s), the
editor assembled with `embed-ui` (8m32s) and served from that binary. A
shorter render-only pass ran earlier the same day and surfaced three
findings — side apparatuses interleaving in one margin, a region printing
off the paper when no reserve exists, and `#הערת_גיליון` refusing `שם:` —
which are absorbed into the findings below and counted once, so nothing is
double-charged.

---

## Grades

| Lens | Grade | One-line justification |
|---|---|---|
| **Bugs** | **C+ (6/10)** | Two critical silent-text-loss paths in the newest subsystem, thirteen majors — but the hardened core (fuzz, spill, balancing, deferred equivalence) passed everything thrown at it |
| **Efficiency** | **B (7/10)** | Real hot-path waste (font re-parse per keystroke compile, redundant full parses, per-page apparatus re-walks), yet measured impact at honest document sizes is small |
| **Confusing behavior** | **B− (6.5/10)** | The best error messages in any domain tool I have audited — and three of them advertise the wrong vocabulary, plus a family of knobs that compile and do nothing |
| **Missing features** | **B+ (8/10)** | Gaps are mostly named and refused honestly; deductions are unwired helpers, English-key gaps, and naming on only two of four sidenote spellings |
| **Overall** | **B− (6.5/10)** | A-grade engineering discipline around a core that verifies; the grade is dragged down almost entirely by the channels/regions layer, which has outgrown its fences |

The pattern is consistent enough to state plainly: **the older and more
fenced a subsystem is, the cleaner it audited.** Native footnotes, the spill
machinery, deferred bodies, region slot-holding — all passed every render
test this audit could devise. The defects cluster in the channel/region model
and its seams with the auto-reserve scanner, which is exactly the territory
the 20–22 August waves rebuilt fastest.

---

## 1 · Bugs

### Critical

**B1 · `ערוץ:` and `אזור:` on the same note loses the entry silently.**
[render-verified] A note written `#הערה(ערוץ: "C", אזור: "R")[…]` prints its
marker and files its entry under the channel's name — but `_rg_show` decides
membership by `_ch_region(t, group)` (`ksav.typ:5850`), which answers `"R"`
only when the channel itself declares `אזור: "R"` (`ksav.typ:4426`). The
entry is numbered, queryable, and drawn by nothing. Confirmed by render: the
test document's body text ("הביאור שחייב להופיע איפשהו בעולם") appears on no
page. The side-placement variant loses the same way (label `snc-C` has no
stream). Cause: `ksav.typ:8366–8371` files by channel name; the filter at
5850 disagrees. This is the repository's own worst defect class — writer
text, gone, with no diagnostic.

**B2 · The auto-reserve scanner cannot see `#הערה(אזור: …)`.**
[render-verified] `auto_notes_region_cm` scans for stream commands and
`ערוץ:`/`channel:` arguments (`lib.rs:454–468`, `CHANNEL_ARG` at 309); the
`אזור:` spelling — which the notes chooser's fifth destination writes —
reaches the footer apparatus with **no reserve**. Confirmed by render: entry
ink at y=816 and the page number itself pushed to y=848.62 on an 841.89 pt
sheet. The test suite exercises only the `ערוץ:` spelling
(`lib.rs:2868–2910`). Sibling, same family: a note into a region name that
was never declared compiles clean, crams ink at y≈805, and shoves the page
number to 811 — no diagnostic ever says the name is unknown (f13 corpus
doc). And the deliberately-open sibling — a writer explicitly declaring a
region height in a document with no reserve — remains unfixed pending the
refuse-or-grow decision of 21 August, confirmed live and unchanged: ink at
y=816–831, page number at 848.62 on an 841.89 pt sheet
(`09-no-reserve.ksav`).

### Major

**B3 · Independent side apparatuses interleave in one margin.**
[render-verified, cause now cited] The page foreground loops streams and
walks each alone (`ksav.typ:6512–6523` → `_sn_placed` 6457 → `_sn_assign`
6506); collision machinery sees only one stream's list. Two side regions, or
region plus wrapper sidenote, produce interleaved baselines — one grid at
13.1 pt pitch, the second slotted between its lines, adjacent lines of
different notes 4–9 pt apart at 9.4 pt type, so glyphs crowd as well as
interleave. Reproduce with `12-two-regions-side.ksav` and
`04-sn-fallback-ref.ksav` in the artifacts directory. No shared occupancy
exists anywhere in `_sn_assign`'s signature, and every collision fence tests
a single apparatus alone.

**B4 · A channel-declared `גובה` bypasses the clamp and desynchronises the
walk from the slot.** `#ערוץ("x", גובה: 5cm)` reaches the slot renderer raw
(`ksav.typ:4497–4500` → 5535) with no `_ap_fit_room`, so neither `חריגה:
"סירוב"` nor the clamp can fire; meanwhile `_sf_cap` (5339–5361) never
consults the channel record. Walk packs against one number, slot clips at
another, silently.

**B5 · A sidenote carried to the next page skips the pinned-note check.**
The overflow path places at `floor` unconditionally (`ksav.typ:6435–6441`);
the `held`/`clear` machinery (6379–6404) runs only on the normal path. A
`הזזה: false` gloss early on page *n+1* can be overprinted by whatever
carries in from page *n* — breaking decision 6's invariant that the pinned
design exists to keep. All collision fences test within one page.

**B6 · Four channel keys are accepted and read by nothing.**
[code-verified] `_ch_knobs` merges exactly six knobs into render config;
`ראש`, `מספור_כתובת`, `דף_ראשון`, `שומר_מקום` are in `_ch_own` (5636–5638)
but their only readers are region-record paths (`_rg_head_cfg` 4544,
`_rg_rec` 5514). `#ערוץ("פירוש", ראש: ("מספר",))` compiles, passes strict
validation, changes nothing — the exact class the 21 August record says was
found four times before.

**B7 · `סימן` has no English parameter name.** [code-verified] `_en_params`
maps `watermark`, `clip_mark`, `continued_mark`, `refmark` — but not plain
`mark:`. `#counter_config("x", mark: …)` panics "unrecognised argument:
mark"; the three apparatus config commands (no strict check) store it under
`"mark"` while every renderer reads `סימן` — a knob that compiles and turns
nothing, invisible to `settings_live.rs`.

**B8 · Nested dictionary keys cannot be spelled in English.** `siman_config`
and friends validate inner keys against Hebrew literals only (`_mk_set`,
`ksav.typ:959–980`); `_en` renames top-level arguments only. The row-plan
reader got the canonicalisation treatment (4722–4726); the part dictionaries
did not. An English writer cannot rename a siman's prefix or a review mark.

**B9 · Five config setters store unknown keys in silence; four siblings
refuse them.** `הגדרות_הערות` (1216), `הגדרות_מדורגות` (4953),
`הגדרות_מדפים` (5136), `הגדרות_זרמים` (5262), `הגדרות_סימונים` (914) insert
every named argument unchecked; `הגדרות_מספור`, `הגדרות_טקסט_הערות`,
`_mk_set`, `ערוץ`/`אזור` validate. A one-letter typo becomes a dead key.
`גלישה` on `הגדרות_זרמים` is doubly dead — `_sf_spill` (5405) reads moves
only from region/channel records.

**B10 · `שורות()` heights resolve against two typographies.** The walk
resolves via `_ap_fixed_height` with the apparatus line (`_pp_cap` 5164
passes `קו: _ap_line_of`), the drawn slot re-resolves with ambient
`par.leading + text.size` (2934 fallback; channel path 4497→5535). Band
drawn tens of percent off the budgeted room; entries the walk counted
clip behind the `…` mark.

**B11 · `closing_paren`'s premise is false for its channel-path caller.**
[code-verified] The doc comment says strings are pre-blanked (`lib.rs:607`);
`channel_region_cm` is fed `code_only_keeping_strings(body)` (`lib.rs:742`).
A quoted argument containing `)` derails the depth counter, so a channel
usage is missed and the reserve under-counts — off-paper notes, the defect
the scanner exists to stop — or over-counts, shrinking every page.

**B12 · The git drawer erases the commit message the writer is typing.**
Panels rebuild whole on every change (`panelviews.ts:113`) and
`gitMayHaveChanged()` fires from the manual-save path (`main.ts:9381`); the
message and identity fields are bare `textField("")`s recreated empty
(`panelviews.ts:231`). Type a message, press Ctrl+S, watch it vanish.

**B13 · The desktop shell's refusal sentences are unwritten in release.**
Every deep-link/Girsa/scheme refusal is an `eprintln!` (`src-tauri/src/
lib.rs:273, 525, 571`) while release builds detach the console
(`main.rs:2`, `windows_subsystem`) and the log plugin is debug-only. The
"diagnosis written where nobody can read it" anti-pattern, in the flagship
installer.

**B14 · The sefarim catalogue files the midrash as the Tanach book.**
`"שיר השירים רבה"` is an alias of the megillah (`sefarim.rs:118`), so a
citation of Shir HaShirim Rabbah prints as `שיר השירים`, grouped under
Tanach at order 1044 instead of Midrash at 3000. Found independently by two
sweepers. The module exists because "everybody's index is wrong"; this entry
is.

### Minor (selected — full list in artifacts)

- Closing curly quote joins the Hebrew token (`spell/hebrew.rs:357`): `'אמת'`
  flags a correct word. The gershayim arm got a lookahead; the geresh arm
  didn't.
- `sh'ma` — the docstring's own motivating example — is flagged
  (`spell/english.rs:173` vs 165; stem bound ≥3).
- A malformed `/spell` request answers a clean bill
  (`spell/mod.rs:687`) while `/mekoros` refuses loudly — verified live
  against the running server.
- `saved-here` collapses every Girsa outcome into `{"told":false}`
  (`services.rs:465`).
- The inbox handover is three critical sections; concurrent polls can
  duplicate a source, and a crash in a sub-second window loses one
  (`post.rs:359–376`).
- Every inbox poll rewrites the inbox file, unchanged or empty
  (`post.rs:159, 376`).
- The Hebrew-year exemption covers every short ש/ת-initial gershayim
  acronym, so `שו"ס` is never flagged (`spell/hebrew.rs:419`).
- The footnote fallback prints two markers from two unrelated series
  (`ksav.typ:6323` — custom rank plus Typst's own superscript).
- Declared-height regions vanish on pages with no assigned entries
  (`ksav.typ:5434` gates the whole block on `mine.len() > 0`).
- `גרשיים` values are compared against a Hebrew set; `"none"` silently means
  marks-on (`ksav.typ:2808`).
- Row-plan `יישור` bypasses `_doc_align` and dies in Typst (`ksav.typ:4834`).
- Unknown paper names get A4's height for `%` reserve arithmetic
  (`lib.rs:667`), desyncing Rust from the prelude's real `page.height`.
- `dir` is the one config string never sanitised; `"RTL"` silently means rtl
  (`lib.rs:1042`).
- The overflow panic advises `אזור_הערות` even for top-placed regions, where
  it has no effect (`ksav.typ:3623`).
- `copyForWord` pastes the flattening Word handoff with no downgrade
  sentence; the `.doc` export route names its losses (`exports.ts:391`).
- A chrome language flip rebuilds only the header and settings drawer;
  every open panel body stays in the old language until next interaction
  (`main.ts:13663`).
- Org import turns `- term :: definition` into a plain list with literal
  ` :: `, unnamed in the dropped list (`org.ts:398`).

### Nits

Stale counts in prose (services "eleven" vs sixteen rows, `services.rs:316`);
a duplicated arm in the prelude-definition fence (`lib.rs:3813`); dialog
commands parking a tokio worker on `rx.recv()`; `Quick` cost on services
that wait on Girsa or truncate a file (`services.rs:177,200`).

---

## 2 · Inefficiencies

**E1 · Every compile re-copies and re-parses every font.** [code-verified]
`families_with_italic` (`lib.rs:1743`) clones every bundled font byte
(~2 MB) and iterates every face — per compile, on the keystroke path, for
any document using a slanting command (which is most apparatus documents;
tier ≥2 defaults italic). The answer is pure over static inputs;
`slanting_commands` beside it is OnceLock-cached. This sits directly on the
benchmark the repository brags about.

**E2 · Three extra full syntax parses per compile.** `italic_warning` and
`dangling_references` each parse the whole body beyond Typst's own parse
(`lib.rs:1882, 1918`) — ~600 KB of parsing per keystroke on a 200 KB sefer,
for checks that could share one `Source::detached`.

**E3 · The auto-reserve decision costs ~17 whole-document scans per
compile**, recomputed in `show_rule` on every keystroke for a result that
changes only when command text changes (`lib.rs:690–756`).

**E4 · The page-foot assignment walk re-runs per page, per footer
evaluation.** `_ap_on_page` pays the full multi-page `_ap_assign` each time
(`ksav.typ:4205`), from footers laid out several times per page during
breaking — O(pages² × notes) in the footer machinery. The policy array is
re-read and re-validated per entry inside the walk.

**E5 · The side-column foreground re-queries, re-measures and re-assigns
every stream on every page** — Θ(pages × notes × streams), bounded only by
the measure cache (`ksav.typ:6512`).

**E6 · The palette re-derives the entire command model on every keystroke**
— `paletteActions()` plus a fresh registry mapping and preamble regex per
character typed (`main.ts:9083`, `commands.ts:95`).

**E7 · The reviewer-name field JSON-serialises all settings to localStorage
per letter** (`panelviews.ts:446`, `input` not `change`).

**E8 · One `git status` request spawns git eight times**, `--version`
twice (`git.rs:1168, 535, 597`).

**E9 · The CLI reader clones every asset entry — multi-megabyte base64
strings included — to partition fonts from images** (`docfile.rs:151`).

**E10 · Scaling datapoints, measured:** a 2 MB single-word document
compiles in 10 s; a 4.7 MB body over HTTP in 20 s; 240 collected endnotes
in 225 ms wall. The endnote path is flat; giant single words are the
pathological case.

---

## 3 · Confusing behavior

**C1 · Refusal messages advertise vocabularies that are wrong.** Three
instances, all high-traffic touchpoints: placement refusals list 3 of the 10
legal placements, hiding the entire side family and `קובץ` (`ksav.typ:5713,
5749`); the `עודף` refusal suggests `"שורה"`/`"טור"` — values the parser
refuses, so following the advice yields a second panic (`ksav.typ:4816`).
An error whose remediation errors is the worst kind of documentation.

**C2 · Knobs that compile and do nothing.** B6, B7, B9 above; plus
`_sf_page_streams` reading `ריווח_פריט` with a bare `.at` so a per-stream
dictionary arrives whole as the gap (5470) — the exact bug fixed in
`_ap_group` and recorded at 3384, unswept in its sibling.

**C3 · The footnote shortcut is a two-step dialog.** `Ctrl+Shift+F` opens an
insert dialog in a new pane (body field, then הוסף) — observed live — while
README sells it as "a footnote is `Ctrl+Shift+F`". Defensible flow,
undocumented two-step.

**C4 · Two validation philosophies meet at the API seam.** The prelude
refuses unknown keys by name; `/compile` silently ignores unknown request
fields (verified live: `fontX`/`paperX` discarded without comment). Both
choices defensible; the seam between them is not documented anywhere a
client author would look.

**C5 · Dead code dressed as machinery.** `_sn_stack` — thirty lines of
documented collision arithmetic — is called by nothing (`ksav.typ:6075`);
`_sn_active` is maintained by both wrappers and read nowhere (8653/8667);
`_sn_free_share`/`_ap_free_share` constants shadow live state twins;
`git.documentChanged`/`isOp` have zero call sites despite docstrings naming
their intended callers. Under the house rule these are unfinished wiring —
but a reader cannot tell unfinished from load-bearing.

**C6 · Prose counts rot.** "Eleven entries" against sixteen rows in the
registry file itself (`services.rs:316`); the save-route table describing
pre-fix behaviour (`save.ts:109`). In the repository founded on "a number in
a living page is a claim somebody has to keep true."

---

## 4 · Missing features

**F1 · Sidenote naming exists on two of four spellings.** [first surfaced
by the render pass] `#הערה` takes `שם:`; `#הערת_גיליון`, `#הערת_ימין`,
`#הערת_שמאל` do not (8632, 8679, 8684) — though `_sn_note` underneath
accepts it. The referral machinery works through the channel/region doors
(verified live: references print letters, not red `?`); the wrapper
spellings that spec option 6 leads with are locked out. Whether the wrappers
should accept `שם:` or the documentation should stop implying it can is a
product question, not an engine one.

**F2 · English writers cannot reach nested dictionary keys** (B8) or
entry-address words — `עמ' 47`, `דף ב׳ א` are hardcoded Hebrew with no
`טקסט` override (1991–2027), against the file's own rule that invented
words take a `טקסט`.

**F3 · Helpers built and never wired:** `git.documentChanged` (which would
answer "is my sefer among the twelve dirty files?"), `isOp`,
`_sn_stack`, `_sn_active` — each with a docstring describing a caller that
was never written.

**F4 · Org definition lists** pass through as literal ` :: ` prose instead
of being converted or named (A2 above).

Documented-and-deliberate gaps (companion volume producing no second file,
`עמוד_חדש` on index commands, the six refused overflow moves, code signing,
MELPA) are **not counted** — they are refused by name, which is the
correct behavior.

---

## What is genuinely good

The grade above would be dishonest without this section, and it is not a
sop:

- **Fuzz-proof.** Fifteen hostile inputs — empty, BOM, truncated JSON, wrong
  magic, 2 MB lines, 200-deep nesting, binary, NUL bytes, CRLF, unclosed
  brackets — produced zero panics, honest exit codes, and precise bilingual
  diagnostics naming the exact bracket, the exact command, the exact depth
  limit. The diagnostics corpus work shows.
- **The status bar does not lie.** Across the whole CDP session — typing,
  footnote dialog, save, language flip — every status line matched reality,
  and greyed menu rows print their reasons next to themselves.
- **The render core verifies.** Spill cut exact (100 words, each once, four
  pages); slot-holding exact (y=727.78 on both pages); deferred ≡ inline
  coordinate-identical; footnote numbering continuous through nesting and
  page breaks; sidenotes aligned to their markers' lines.
- **Two independent sweepers found the same defects** (sefarim misfile,
  refusal vocabularies, setter inconsistency) without comparing notes — the
  findings are where the code is, not where one reader drifted.

---

## Verification notes

Every finding above carries its evidence class: **render-verified** (reproduced
through the real binary and read back through `probe`), **code-verified**
(quote re-checked against the file by the auditor, not only the sweeper), or
sweeper-reported with exact citations. Three early candidate findings died
under verification and are deliberately absent: a "duplicated token" that was
a substring collision in my own counter, a layout "diff" that was a typo in
my own twin documents, and a "missing footnote" that was my selector clicking
a menu row instead of the dialog's button. The instruments were wrong three
times; the engine was not any of them. That asymmetry is the single most
important thing this audit learned, and it is the repository's own thesis
proved from the outside.

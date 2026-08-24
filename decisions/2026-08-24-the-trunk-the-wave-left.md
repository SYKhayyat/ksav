# 2026-08-24 · The trunk the wave left behind

The 23 August chunks were committed and never run — not one of the nine gate
checks, not a build, nothing, between `ae3db23` and the handover. This is what
the first run found, and it is a record of a specific failure shape: **eight
chunks of work, each individually plausible, sitting on a trunk that could not
compile, could not parse its own prelude, and had never once laid out a page.**
Every defect below was reachable only by running the thing.

## The engine did not compile

`cbd078f` (the hot-path chunk) was committed without `cargo check`. Two breaks:

- Four functions took `&typst::syntax::Syntax`, a type that does not exist;
  Typst's tree node is `SyntaxNode`. `first_italic`, `calls_with_name`,
  `dangling_references` and `italic_warning` — that is, both halves of E2's
  shared-parse fix.
- The reserve-cache key folded the sheet height in with
  `page_h_cm.map(|h| h.to_bits()).to_le_bytes()` — `.to_le_bytes()` on an
  `Option`. A `None` now contributes no bytes at all rather than a stand-in
  value, so it cannot collide with any real height.

The compile break cascaded: clippy, engine tests, and both desktop-shell
checks all fail behind one bad crate, which is why the gate printed six reds
for two mistakes.

## The prelude did not parse

Two breaks in `ksav.typ`, each fatal to every document and visible only as
"unknown command" at the writer's own text:

- `הגדרות_מדפים` lost its closing brace when B9's unknown-key refusal went in,
  so every binding after it nested inside the function body. The tell was a
  fence — `every_top_level_let_names_itself`, which compares the parser's view
  of the prelude against a column-zero line scan and printed the exact binding
  where the two stop agreeing (`_pp_label`). A fence written for naming caught
  a syntax break; that is a luck, not a design, and the honest instrument for
  this class is walking the tree for error nodes, which is how the second break
  was found after the first was fixed.
- `_ap_fit_room`'s refusal advice wrote `let how =` with the `if` starting on
  the next line. Typst ends a `let` at the newline, so the binding had no
  value — "a name and a colon with nothing after them". The if moved onto the
  binding line.

Underneath those, two defects in code the wave wrote and no test had executed,
and each needed the other fixed before it could be seen:

- `_sf_spill`'s per-region cache asked a dictionary for `.contains()` —
  membership is `rg in cache`. Fixing that exposed the real defect under it:
  the cache was a captured variable **modified inside the closure** it is
  handed to, and Typst closures may read what they capture but never write it.
  The E4 memoisation now computes every region's validated answer before the
  closure exists and hands back a reader over a finished dictionary; a group
  outside the table's order is answered fresh rather than not at all.
- `_sn_placed` sorted its items with `.sort(key: …)` — the method is
  `.sorted(key: …)`, and it returns a new array rather than sorting in place.
  The first draft wrote the call bare as a statement, which turned up a rule
  this prelude had never met: **a Typst code block joins its statements'
  values**, so an array-valued line followed by a dictionary literal is an
  attempt to join the two. Bound to `items =` — which is also what makes the
  sorted answer reach the walk instead of falling on the floor.

A sweep for the class (dict `.contains`, array `.sort`, bare non-assignment
statements whose value then joins with the next line's, `.get(` outside
`state.get()`) found nothing else standing.

And one **regression** the suite caught only once it could run at all:
`identical_notes_get_distinct_numbers` passed at `099b5c0` and failed at
HEAD, because B1's filing fix reflowed `_ap_note`'s registration block onto
several lines — and a newline inside `[ … ]` is markup, which is to say a
space on the page. Every note in every apparatus had gained a gap between its
word and its marker (`אלף א`, not `אלףא`). The block is one line again, with
the reasoning in comments above it rather than inside it.

The same run surfaced a stale fence: `the_banded_apparatus_is_written_once`
greps the prelude for the fixed-height band slot's spelling, and B10 had
legitimately changed that call to pass `קו` through. The guard's premise —
written once, in `_ap_slot`, not twice — still holds; only its needle was
out of date. The needle now names the call as it is actually written.

Two more fell out of the first *complete* engine run. Cargo stops at the
first failing target, so every run before this one had been ending early —
`command_look.rs`, sixty-eight tests about the rule that a separate command
has a look of its own, had never executed once. Both of its defects were the
same lesson as `_ap_fit_room`, in the validation `#הגדרות_סימונים` gained:
its `legal` list was written across two lines, the second beginning with
`+`, which is to say a new statement applying unary plus to an array. The
expression is parenthesised now, the way the two existing multi-line
concatenations nearby already were; a sweep of the prelude for the shape
found no third instance, and no `let x =` left with its value on the line
below. And the same list had forgotten `כפה` — the sweep-back switch that
the doors accept and the renderer reads — so the brand-new validation was
refusing the brand-new feature's own documented call. It is in the list.

The next target to run for the first time was `notes_acceptance`, and its
stale-disproof fence named three exemptions that had stopped being true:
`ov_shrink`, `ov_clip` and `ov_runin` no longer print past the page number.
They are not broken — they are **fixed**. B2b grew the page-foot reserve by
default to fit a declared region, the owner ruling recorded in its commit,
so the off-the-paper overflow those documents existed to demonstrate cannot
happen by default any more. The three rows went, per the fence's own
contract; the documents stay in the corpus as ordinary members and now
regression-test the grown path. Measured before concluding: at `c9d4f36`,
the last commit CI ever ran, `ov_shrink` reaches y=853.90; at `ae3db23`,
y=799.02, which is the page-number line every well-behaved document stops
at. The change is B2b's and it is deliberate. The comment above the fence
now tells that story instead of predicting a refusal that did not happen.

The `כפה` refusal, it turned out, was not one door's typo but the class the
audit kept predicting: **a key accepted by the model and refused by one of
its doors**. `overrides` — another target that had never once run — passes
`כפה: true` to four apparatus setters and all four refused it. The switch is
rule 3 of the override model itself, read off every settings dictionary by
`_cfg_with`; the doors for headings, lists and tables never validated their
arguments, so they accepted it without noticing. The notes-family doors,
which B's validation gave legal-key lists, each forgot to name it. One
shared `_cfg_global_keys` now sits beside `_cfg_with`, and the four
validators (`הערות`, `מדורגות`, `מדפים`, `זרמים`) check it beside their own
defaults; the marks list from earlier joins the same ruling rather than
being a special case.

`placements` was the last target that had never run, and it held the same
shape one more time — a test whose premise B2b repealed. `a_region_can_
refuse_to_be_quietly_clamped` expected a 2cm foot region with no reserve and
`חריגה: "סירוב"` to be refused with the old numbers (56.7pt asked against
49.6pt); today that document sets, because the reserve grows to fit it.
The refusal itself is alive and measured: a 30cm ask is still refused,
naming 850.4pt against 505.1pt, and the test now says all three sentences
— fittable asks grow and set, impossible asks are refused with their
numbers, and the default clamps exactly as it always did.

`settings_live` was the last holdout, and it did not merely fail — it
**indicted**. `כתובות` had been added to the three banded apparatuses'
defaults, but the merge table that carries apparatus defaults into entry
configurations (`_ch_knobs`) does not carry it, and two of those three
renderers never draw an address at all. Accepted by the setter, validated,
stored — read by nothing: the exact defect family this repository keeps
paying for, arrived in the very commit that fixed its siblings. The key is
removed from `_md_defaults`, `_pp_defaults` and `_sf_defaults`; it stays
live where addresses actually print, on channels and regions, which
`region_settings` proves by rendering both wordings of one address.
Wiring apparatus-level address words into the tier bands would be new
feature work in a renderer that has no address mechanism, and is nobody's
drive-by.

`spell_en` held one more of the same shape, in data rather than code: the
supplement gained `sh'ma` and, beside it, `Sh'ma` and `SH'MA`. Rule 1 of
the file's own header — a lowercase entry accepts every capitalisation,
a capitalised entry rejects the lowercase form — means the two capitals
did not merely break style, they would have squiggled the plain word
they were added to protect. Lowercase entry kept, capitals gone, comment
now says why.

## The desktop shell did not compile either

`04d5e35` fixed the three dialog commands parking an async worker by writing
`tokio::task::spawn_blocking` into a crate whose Cargo.toml has no tokio.
Tauri ships the same pool under `tauri::async_runtime::spawn_blocking`, and
this file already wraps it in `offload` for engine work — the three dialog
sites call `tauri::async_runtime::spawn_blocking` directly now, keeping their
own error mapping, because their wait is a dialog answer and not CPU-bound
engine work.

## What the fences demanded

The suites, once they ran, held the wave to its own rules:

- **The generated card was hand-edited against its own banner.** `C3`'s
  sentence ("opens the insert dialog") was typed into `docs/shortcuts.md`,
  which `documentation.test.mjs` compares against `card()` output. The fact
  lives in `i18n.ts` under `scDesc.footnote` in both languages now — the file's
  own `presetDesc.`/`destDesc.` convention — and `card.mjs` appends it when an
  action carries one, so any surface can say it and the card is generated
  truth again.
- **`כתובות` arrived on `#אזור` with no knob**, exactly what the region-panel
  fence exists to catch ("a key added tomorrow has to arrive with a control").
  It has one — a bare knob like `טורים`, because the value is a dictionary in
  the prelude's own syntax and three optional words are not three controls —
  plus its English spelling on both sides (`_en_params` and the panel's table),
  which a second fence demanded independently.
- **The seam table described a response that no longer exists.** `saved-here`
  grew a refusal-with-reason literal and the wire fence knew: one row pointed
  at a fragment that was gone and one literal had no row. Three rows now, and
  `Told` declares `why?`.
- **The audit page named paths that resolve nowhere** (`spell/hebrew.rs`
  against a root that expects `engine/src/spell/…`), and the counts moved:
  966 engine tests, 7,554 editor assertions.

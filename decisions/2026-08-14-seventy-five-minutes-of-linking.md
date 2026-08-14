# Seventy-five minutes of linking — 14 August 2026

Three things that ran together: the remote going green and staying there, a CI
job that had quietly become an hour and a quarter, and two features from the
inventory tail. What connects them is that every one turned on a measurement
somebody had assumed instead of taking — including, twice over, me.

## The remote is green

Run `31819121130`, all seven jobs. Two reds got it there, and both were the same
shape: **this machine is more permissive than the runner**, in two independent
ways nobody had written down.

- Node 26 here strips TypeScript types from a `.ts` import; CI pins Node 20 and
  does not. A test importing `../src/services.gen.ts` directly ran locally and
  could not run there. The fix is a prohibition — no test reaches into `src/`
  past the built modules — not a corrected import.
- Emacs 30.2 here has `string-replace`; the package declares 27.1 and CI honours
  it. The elisp byte-compiled locally and failed on the runner. The byte-compile
  step now runs *before* the ERT suite, so the failure names the compile rather
  than arriving as a test error.

Green locally is not evidence. That is now written where it will be read.

## What the engine job was actually doing

The job took **75 minutes**. The breakdown, from its own log:

| | |
|---|---|
| clippy, debug, cache warm | 31 s |
| `cargo test --release`, compiling | 74 m 12 s |
| the tests themselves | ~11 s |

The dependency cache restores in ten seconds and holds — fifteen `Compiling`
lines, then seventy-three and a half minutes in which **nothing is compiled at
all**. It is linking. `ksav/engine/tests/` is forty files, Rust builds each one
as its own binary statically linking the whole Typst compiler, and
`lto = "thin"` makes each of those a whole-program optimisation pass over the
same compiler. Forty of them, every push.

The comment in `Cargo.toml` had already recorded this trap once, one setting
milder: *fat* LTO "turned `cargo test --release` into a quarter of an hour", so
`thin` was chosen instead. The measurement was right when it was taken. Nobody
re-took it as the test count grew.

**The first fix did not work, and that is the part worth keeping.**
`[profile.bench] lto = false` follows the Cargo book's profile table — 
`cargo test --release` builds test targets under `bench`, which inherits
`release` — and it was pushed on that reasoning alone. Measured: 74m55s before,
74m12s after. Thirty-four seconds, which is noise on a shared runner. Whatever
cargo is doing there, that override does not reach the link.

So what CI relies on is an environment variable on the step,
`CARGO_PROFILE_RELEASE_LTO`, naming the profile the log says was used. It is on
all three release-engine steps across `ci.yml` and `release.yml`, and
`gate.test.mjs` sweeps for a fourth arriving without it — because a step that is
merely *slow* fails no check, and nobody reads a green job's duration.

Nothing is weakened. `opt-level = 3` is the whole reason the runner uses
`--release`, and it is untouched. The shipped desktop application is untouched
for a separate reason worth stating, because it was checked rather than assumed:
it is built from `app/src-tauri`, a different package, and cargo honours only the
profile of the package it is building — `src-tauri/Cargo.toml` carries its own
`lto = "thin"` and the variable never reaches it.

## Text objects for a note and a heading's section

`dan`, `din`, `dah`, `dih`, and the same six in visual mode. Registered through
`Vim.defineMotion` and `Vim.mapCommand`, because in `@replit/codemirror-vim` a
text object *is* an ordinary motion returning `[start, end]`; there is no
separate kind of command. The spans come from `notes.noteAt` and
`headings.sectionAt` — the same modules the outline pane and the note register
read, so a second opinion about where a note ends cannot arise.

This was the second attempt. The first was withdrawn with a note saying the
arithmetic in the bridge was "right and is what the next attempt needs; what is
missing is the registration". That sentence was wrong, and it is why the second
attempt nearly failed the same way: the arithmetic called `headingAt`, which
matches only while the caret is **on the heading line**, so `dah` did nothing
from inside the section it is named after — which is where a writer always is.
`headings.ts` has carried `sectionAt` all along with a comment saying it is
exactly what "this section" means from body text.

Calling a thing correct is what stops the next reader looking at it.

## A tab that is not on screen

Answered by the reader: keep the last page and recompile behind it, as the
default, *with the other options available*. All three are built.

The mechanism is per document, which is the whole of it — `preview.ts` had "the
last page set", one of them, which is precisely what made the defect possible.
Pages are filed under the document they belong to, capped, evicting the least
recently *seen*; re-filing counts as seeing, because any other policy throws away
the tab you are switching to.

`keep` draws the incoming document's own pages at once. `idle` lays the other
open documents out two seconds after you stop typing — from the open editor
state rather than from storage, since a document with unsaved edits is the one
case where those differ, and each with its own page setup. `onSwitch` keeps
nothing.

**What none of them may do is leave the previous document's pages standing.**
That was the actual bug: `openDoc` ended at `scheduleCompile()`, and a compile is
0.4–3 seconds away, so for that whole time every preview pane went on showing the
sefer you had just left — under the incoming document's title, beside its
outline, with click-to-jump measuring against pages belonging to neither.

And one found on the way that belongs to Print rather than to tabs.
`drawPagesEverywhere` returned before recording `current` when there was no
preview host — and a source-only layout *has* no preview host, so `current` went
on holding whatever was drawn the last time a preview was open. `currentPages()`
is what the print path and the page-range chooser read. Printing from a
source-only pane printed a document you had since left, at a page count
belonging to neither. The one output that is paper.

## Three faults in the instruments

None of these was in the product, and all three are the same disease as the LTO
comment: a measurement trusted without being taken.

- The text-object probe read `.cm-content`'s `textContent`, which runs the lines
  together — CodeMirror renders each line as its own div with no separator. A
  correct multi-line document failed the probe over one `\n`.
- The new acceptance step read the page count straight after the click. `openDoc`
  awaits storage, the file binding and the baseline before it touches the
  preview, so both readings were one switch stale. It times off the status line
  now: `rendering` appearing brackets the window from both sides — the switch has
  finished, and the layout that will replace those pages has not landed.
- The same step gave the second document a fixed four pages, and the document
  built by the ten steps before it lays out to four as well. The one comparison
  the step exists for was `4 !== 4`. It measures the first document now and makes
  the second deliberately longer.

And one that was not mine. The Emacs step reads the status line before and after
a keypress, but the keypress before it is `Ctrl+K` — kill-line, which *edits*, so
a compile is on its way and the line moves from `rendering` to `✓ N pages · 812ms`
on its own. It failed once locally in a run where the other 476 checks were
green, reporting "Ksav's keymap is still installed" about a keymap that is not
installed. A check that cannot fail for the reason it names is useless; one that
*can* fail for a reason it does not name is worse, because it sends the reader
after the wrong thing. It waits for the edit's compile now.

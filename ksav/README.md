# כְּתָב · Ksav

A Hebrew-first writing system built on **real Typst compilation**. The goal:
there should be no reason for a bochur — or any Hebrew writer — not to use this.
It should be the standard for Hebrew writing.

This is a ground-up rewrite. The two earlier prototypes (`../src` React app and
`../ksav_flutter_rust`) both *mocked* the renderer — neither ever invoked Typst.
This engine runs the genuine Typst compiler.

## Using Ksav

**Press `F1`.** The help panel is *generated* from the application — every
shortcut, every operation, every command, in whichever language the interface is
set to, and showing your own key bindings rather than the shipped ones. This
section is the orientation; `F1` is the reference, and it is the one that cannot
go out of date.

### The first five minutes

Open it and type. Ksav starts in **prose mode**, so what you see is the document
rather than the markup — hold `Alt` to reveal the commands underneath, or press
the `＃` chip to stay in the raw source. The page on the left is real Typst
output, recompiled as you type.

Everything structural works the way a word processor works:

| You want to | Do this |
|---|---|
| a bullet list | the `•` button, then **Enter** for the next bullet |
| a line *inside* a bullet | **Shift+Enter** |
| a sub-bullet | **Tab** (and **Shift+Tab** to come back out) |
| a heading | the paragraph-style dropdown in the toolbar — nine levels |
| to move a whole section | **Alt+Shift+↑/↓**, subsections and all |
| a table | the Table menu, then the ribbon that appears |
| a footnote | the Notes button, or `Ctrl+Shift+F` |

### The context ribbon

Put the caret inside a list, a table or a section and a strip appears **under the
toolbar** with everything you can do to it — add a row, merge cells, widen a
column, promote a heading, move an item. Controls that cannot act here are
greyed rather than hidden, so the strip is the same shape every time.

The same operations are in the **Format** and **Table** menus, each showing its
keyboard shortcut, for when you are looking for a feature rather than already
standing in one.

### Notes

A footnote is `Ctrl+Shift+F` — or `Ctrl+Alt+F`, which is Word's. An endnote is
`Ctrl+Alt+D`, Word's again. A note *on* a note is `Ctrl+Shift+N`, and it reads
the caret: in prose it makes a first-tier note, inside a note a second-tier one,
inside two a third. All three are on the toolbar (`†`, `⁋`, `⁑`) and in
**Insert**, where a Word user looks first. The `†☰` chip opens a **notes pane**
listing every note in the document — click one to jump to it, right-click it (in
the pane or in the text) to convert it, delete it with its marker, or hang
another note off it.

Underneath, Ksav supports eleven note layouts — page-bottom footnotes, endnotes,
notes at the end of each section, sidenotes down one or both margins, fixed bands
at the foot of the page, two separately-numbered blocks, and combinations. The
**Notes** button asks two questions you can answer — *where does it print* (the
foot of the page, the end of a section, the end of the document, the margin, a
second volume) and *how are the layers arranged* (one series, stacked bands,
parallel streams, fixed regions, each layer somewhere else) — and the eleven
layouts are the cells of that grid. A combination that does not exist is greyed
with its reason rather than hidden. Picking a cell renders a real page, set from
your own text, instead of a diagram.

The chooser also writes each layout's *scaffolding*: the dump call that prints
collected notes, the wrapper the margin layouts need, the configuration line that
has to sit at the top of the file. Forgetting it is the commonest way one of
these looks broken — the notes are collected and then never printed.

You can mix them freely: footnotes at the foot of the page and endnotes at the
back, in the same document, exactly as in Word — and they no longer both print
`¹`, since the back matter takes a numbering of its own.

There is a second, independent choice in that panel: whether a note's **text**
lives inline or at the end of the file (the org-mode arrangement). The page comes
out identical either way; only the source changes — and every way of inserting a
note honours it, because the toolbar, the menu, the keyboard and the panel all go
through one producer.

The rest of the editor cannot tell the difference either, which took a second
pass to be true: the notes pane lists a deferred note under the marker where it
prints and jumps to its prose at the end of the file, `⁑` inside a deferred body
writes the next tier down, right-click converts it by rewriting where it prints
and deletes both halves at once, and the "collected and never rendered" warning
sees a deferred `#הערות_בסוף` note as readily as an inline one. In an English
document the pair is written `#note_named` / `#note_body`, because a generated
command follows the document's language rather than the interface's.

**Styles ▸ Notes** exposes what the apparatus can actually do: per-tier size,
slant, colour, indent and numbering scheme. It writes the same `#הגדרות_הערות`
line you would type by hand, which is what keeps the panel and the markup from
drifting apart.

The tiers are numbered א,ב,ג over 1,2,3 — the שער־הציון arrangement, the
commentary lettered and the he'aros on it numbered.

### Going faster

- **`Ctrl+Alt+K`** — a *hydra*: a panel listing every operation available where
  the caret is, one letter each, staying open so five rows is `r r r r r`.
  `Esc` or `q` to leave. While it is open it owns the keyboard, including in Vim
  and Emacs modes — modified keys still pass through, so `Ctrl+S` saves from
  inside it.
- **`F3` / `F4`** — record a macro and replay it. Macros record *actions*, not
  keystrokes and not cursor positions, so they replay correctly from anywhere.
  Save one and it becomes bindable to a key like anything else.
- **`Ctrl+K`** — the command palette, for everything by name.

Every key above is rebindable in Settings, and Settings lists every operation in
the product because that list is generated too.

### Where your settings live

Two different things, deliberately kept apart:

- **The document** — font, paper, margins, direction, headers, two-sided setup.
  These travel with the file, so a sefer opens the same way on someone else's
  machine.
- **You** — theme, layout, spell-check, shortcuts, macros, editing mode. These
  stay on this machine and follow you between documents.

The Settings drawer says which is which, at the line where they divide.

## Core idea

Every Ksav command is a **real Typst function**, defined in
[`engine/typst/ksav.typ`](engine/typst/ksav.typ). Each has a Hebrew name *and* a
collision-free English alias, so the same document can be written in either
language:

```typst
#let הדגשה(body) = strong(body)     ;  #let bold = הדגשה
#let טבלה(עמודות: 2, ..תאים) = table(columns: עמודות, ..תאים)
#let mktable = _en(טבלה)            ;  #mktable(columns: 2, ...)
```

The alias is a wrapper, not a plain binding, because an English name over Hebrew
*parameters* is only half a translation: `#mktable(עמודות: 3)` is not English and
is not something anyone would type. `_en` renames named arguments through one
table in the prelude and still accepts the Hebrew ones, so a document can be
converted a command at a time without hitting a cliff halfway through.

The engine prepends this prelude to the user's document, injects a
`#show: מסמך.with(...)` wrapper driven by editor settings (font / size / margins /
direction / numbering / columns / line-spacing), then compiles with real Typst.

Because **Typst itself parses the document**, we never reimplement a parser — and
arbitrary cross-nesting (a table inside a footnote inside a heading inside a list
item) works for free.

The editor still has to find things in the source — where this heading's section
ends, which cells belong to this table, which run is a comment — and it cannot
ask the engine, because the answer has to be synchronous, pure and available
mid-keystroke. That is **`app/src/spans.ts`**, and the point is that there is
exactly one of it. It is a scanner, not a parser: it locates calls and hands back
ranges, and every structural edit remains a textual splice, so a writer's
whitespace, comments and argument order survive editing untouched.

It tracks Typst's two contexts, because that is the one thing ten separate
matchers could not do and it is the whole reason they disagreed. Inside `[…]`
Typst is in *content* mode, where `"` is an ordinary character — which is how
Hebrew writes gershayim (רש״י, שו״ע) — and `\` escapes. Inside `(…)` and `{…}` it
is in *code* mode, where `"` opens a string literal in which brackets are inert.
Both halves were checked against the compiler rather than assumed; see the head
of the file.

### One registry of surfaces

The chrome has the same shape of problem and the same shape of answer. Seventeen
panels — drawers, modals, the command palette, the contextual ribbon, the
pointer-anchored menus — each used to fetch an element by id, put the class
`open` on it, hand-build its own `×`, and add its own line to a list of close
calls in the global Escape handler. Four hand-maintained pairings per surface,
and each one right on its own is not the same as all of them agreeing: the
settings drawer shipped with an opener and no closer, the welcome overlay with
no way out at all, and the hydra — the one panel that takes over the keyboard —
was never added to the Escape list.

**`app/src/panels.ts`** declares each surface once: what kind it is, whether
Escape closes it, and how a person gets out of it from inside. It is then the
only module in `src/` that spells the `open` class, the only one that builds a
`×`, and the only one that wires a dismissing backdrop — so a surface cannot
appear on screen without being declared, `panelHead(id)` cannot be given the
wrong panel's closer, and the Escape sweep is derived from the list rather than
remembered. `panels.test.mjs` builds every declared surface against a DOM and
clicks its way out of each one; `chrome.test.mjs` sweeps `src/` for anyone
spelling those things by hand.

### One authority per fact

The third instance of the same shape, and the widest. Eight things this
repository knows were written down two or three times, in two or three
languages, with nothing comparing the copies: the document defaults (Rust,
Typst, TypeScript), the Hebrew↔English command pairing (the prelude's `#let`
lines, the registry, and ~200 pairs re-typed by hand across four modules), the
licence notices for the six embedded fonts and four word lists (the Markdown,
`licenses/`, and a fourth copy in the About panel), the `#כלול` directive rule,
the Hebrew name normaliser, the running head's alignment table, and "strip the
markup, leave the words" — asked in six places, answered six ways.

Every one of them had already been corrected by hand in every copy at least
once, which is the tell. There are two answers, and which applies is decided by
whether a language boundary is genuinely in the way:

- **Generate it.** `app/src/engine.gen.ts` is written from `engine/src/lib.rs`,
  `engine/src/commands.rs`, `engine/src/notices.rs` and `engine/typst/ksav.typ`
  by `app/tools/emit-engine.mjs`; `npm test` runs the `--check` form, so a
  default changed in Rust and not regenerated is a red test rather than sliders
  that disagree with the page. The command tables in `markdown.ts`, `spans.ts`
  and `ksav-lang.ts` are now keyed by the Hebrew name alone and expanded through
  the prelude's own pairing — which also gets them the four tiers per note
  family that the palette registry deliberately stops short of.
- **Execute an oracle.** A Typst prelude cannot call Rust and a browser tab
  cannot call either, so `fold` — which spellings of a sefer's name are the same
  name — exists three times of necessity. It is fenced by a corpus every
  implementation is run against (`engine/tests/fixtures/fold-cases.json`,
  `engine/tests/one_want.rs`, `app/test/sefarim.test.mjs`), and the Typst half is
  asserted *inside the compiler*, so a disagreement arrives as a diagnostic
  naming the case. The first run found that the Typst copy iterated grapheme
  **clusters**, so a pointed letter was deleted along with its nikud: `שַׁבָּת`
  folded to the empty string, which does not merely fail to find the masechta —
  it makes every fully-pointed name collide with every other. Two
  implementations read carefully by hand had agreed with each other for as long
  as they had existed.

`app/test/enginefacts.test.mjs` holds the prohibitions: no module but the
generated one may write a Hebrew command name beside its English twin, and no
module but `spans.ts` may strip markup with a regex.

### The documentation, checked the way the application is

The fourth instance, and the one nothing had ever asserted. Prose compiles no
matter what it says, so the pages describing Ksav drifted exactly as the code
copies did and with nothing to notice: nineteen false claims across five pages,
including a command count short by a dozen, a binding count short by twenty-two,
one CI job unaccounted for, and `docs/shortcuts.md` seventeen rows short with
`Ctrl+Alt+D` printed as "Mark as deleted" long after the application had rebound
it to **Endnote**. Every one of those survived a green suite.

`app/test/documentation.test.mjs` and `app/test/docfacts.mjs` close it, and the
shape is two sweeps in opposite directions, because a hand-written list of
claims fails by omission and a regex over prose fails by leaking:

- **Forward** — every counted claim in a living page must equal what measures
  it, at its home: `cmd!(` in the registry, `DEFAULT_KEYS` in the bindings the
  editor installs, `.ksav` files in `engine/templates`, `#[test]` in the engine,
  non-comment lines in each lexicon (checked against the count the generator
  writes into its own header), jobs in `ci.yml`.
- **Backward** — a number standing beside one of those nouns in a living page
  must be a *declared* claim. Inventing a fresh count in `docs/` fails the suite
  until somebody declares it, which is the half that is still true a year from
  now. It caught this section while it was being written, twice.

`docs/shortcuts.md` is diffed against `node tools/card.mjs`, which reads
`bindings.ts` and `i18n.ts` through the same esbuild path the runner uses — the
card was always unable to disagree with the application and was simply never
re-run. Relative links must resolve to tracked paths, and so must file paths
named in prose, which is a separate sweep because the ones that rot mostly are
not links: `LICENSE` argued its whole case on the behaviour of the Hebrew spell
checker and named a path that stopped existing when that module became a
directory — a sentence, not a link, and wrapped across a line break besides.

The append-only record is exempt, because a dated entry was true on its date —
and the record now has an **address** rather than a list. `spec.md`, `fixes.md`
and `plan-notes-and-ui.md` were each two documents with opposite lifecycles
bolted together, a spec edited in place and a log written once, and every stale
number in the repository lived at that seam. The nine dated waves, audits and
resolutions are [`decisions/YYYY-MM-DD-*.md`](../decisions/README.md), one file
each; `spec.md` kept the part that is a specification and is swept like any
other page.

The exemption is the dangerous part and it is checked from every end: the
directory must be excusing something real, every page it covers must carry its
date in its name — which is what makes the lifecycle a fact rather than a claim
— and no exemption may reach a page that is documentation by definition. A new
`.md` is fenced by arriving, since anything not covered is swept. The
load-bearing rule exists because the first version of this fence did not have
it, and adding a living page to the log list with a plausible sentence turned
its sweep off with the suite green — `ONLY_AT_TOP`, rebuilt inside the check
written against it. (That constant is gone: it exempted nine commands from
`registry.rs`'s nesting sweep, six of them were being compiled in those exact
nestings by `insertion.rs` at the same time, and both tests were green. The file
is deleted and `the_grid_exempts_nothing` asserts the grid has no holes instead.)

Two facts live in `test/run.mjs` instead: how many assertions the suite runs and
across how many files. Nothing knows those without running, and a test that
counted itself would never settle.

### Nesting depth

Any structure can contain any other — lists in tables, headings in footnotes,
headings in tables, tables in footnotes, footnotes in footnotes, etc. Verified in
`engine/examples/nesting.ksav` (regression-tested):

- **Headings** — unbounded: any level number (`#כותרת(רמה: 1000)`), unlimited count.
- **Lists** — nest ~30–60 deep.
- **Footnotes** — nest ~40–60 deep.

The list/footnote ceilings are **Typst's own recursion safety limits**
(`MAX_SHOW_RULE_DEPTH = 64`, parser `MAX_DEPTH = 256`), shared by every Typst
document — they exist so pathological input errors cleanly instead of crashing the
process. For comparison, Word caps list nesting at 9 levels; no real document
nests past a handful.

## Features (engine)

- **116 commands**, each bilingual (Hebrew + English), across styles, headings,
  alignment, direction (RTL/LTR runs), lists, definition lists, tables, the whole
  note apparatus, blocks (quote / callout / warning / success / framed box),
  layout, images, cross-references, **review** (`הוספה`, `מחיקה`, `הערת_עורך`),
  **mathematics** (`נוסחה`), per-section page setup (`מקטע_עמוד`), and a
  dedicated **Torah/yeshiva layer**: `סימן`, `סעיף`, `פסוק`, `מראה_מקום`
  (mekoros footnotes), `ציון`, `גמרא`, `דיבור_המתחיל`.
- **10 document templates**: letter, article, sefer, divrei-torah, siddur,
  bentcher, kesubah, get — real Hebrew content with nikud and authentic mekoros —
  plus an English letter and an English article, written as documents of their
  own rather than translations. Each carries its `lang`, so loading one puts the
  document in the direction it was written for. The Torah templates stay Hebrew:
  a siddur, a bentcher, a kesubah and a get are Hebrew because of what they are.
- **Command registry** exposed as JSON (`/commands`) — drives the palette,
  toolbar, and docs. **Template registry** at `/templates`.
- **Bundled fonts** (Frank Ruhl Hofshi, David Libre, Cascadia Mono, and NewCM
  Math for equations) — output is self-contained, with full nikud support. The
  math font is there because Typst's math layout needs an OpenType MATH table and
  no Hebrew text font carries one.
- **Exports**: PDF, per-page SVG (live preview), and plain Typst source. Real
  compiler diagnostics (errors + hints) surfaced back.
- Compiles a page in ~20-30ms.

## The editor (SPA)

`ksav/app/` is a Vite + TypeScript single-page app (CodeMirror 6):

- **Ksav syntax highlighting** for `#command[...]` in the editor.
- **Prose mode** — hides the command syntax and renders content with the real
  style (bold looks bold, headings look like headings). The command under the
  cursor, and everything while **Alt** is held, reveal their raw markup so you
  can always edit.
- **Live preview** — real Typst SVG, ~20-90ms round-trip.
- **Word-like toolbar**, **command palette** (Ctrl+K, searches all 116 commands
  in Hebrew or English), **templates** menu, **export** menu (PDF / **Word** /
  HTML / Markdown / text / Typst / print).
- **Bracket healing** (`app/src/brackets.ts`) — Typst can only report an unclosed
  `[` once it reaches end of file, thousands of characters from the mistake, and
  the preview goes blank. Instead: a live lint marks the opener that never closes
  and names its command, a one-click fix inserts the closer where it belongs, and
  the preview compiles a *healed* copy so a half-typed command never blanks the
  page. One pure scan feeds all three, so they cannot disagree. Held by
  `app/test/brackets.test.mjs` (`npm test`), including the invariant that healed
  text is always balanced and healing is idempotent.
- **Word handoff** — `.docx` from Typst is not feasible, but that was never the
  requirement: what matters is that the rebbi or kovetz editor you send it to can
  *edit* it. Typst's reflowable HTML export wrapped in Word's own HTML envelope
  (mso namespaces, `@page` size and margins, RTL) opens in Word as a real
  editable document, either as a `.doc` file or straight off the clipboard.
  Prose, headings, emphasis, lists, tables and plain footnotes carry across; the
  multi-stream apparatus flattens, and the app says so rather than letting you
  find out.
- **Review panel** — every tracked change and editorial comment in the document,
  accepted or rejected one at a time (which rewrites the source, so the decision
  is in the file), plus a switch between reading the markup, the document as if
  every change were accepted, and the document before any of them.
- **Bilingual UI** (Hebrew ⇄ English) with full RTL/LTR flip of the chrome —
  independent of the document's own direction. Persisted.
- **Settings**: font, size, margins, direction, page numbers, justify, line
  spacing, columns, zoom. **Light/dark theme.** One/two-panel layout.

## Runs in the browser (WASM)

The whole engine compiles to WebAssembly (`ksav/wasm/`), so the app can run the
**real Typst compiler entirely in the browser with no server** — deploy the
built files to any static host. The app picks its backend automatically: it uses
the local server when one is reachable (fast, tiny download), and falls back to
the in-browser wasm engine otherwise. A badge in the status bar shows which is
active (`⬢ server` / `⬡ wasm`).

The wasm is a lazily-loaded ~28 MB chunk (~11 MB gzipped) and is only bundled in
an explicit offline build, so the server/desktop build stays lean.

## Cross-platform

Runs on **Linux, macOS, and Windows**. The engine is pure Rust with **the fonts
embedded in the binary** (`include_bytes!`) — no dependency on system fonts or
any OS-specific code — so a build behaves identically everywhere. The editor is
web tech (browser or Tauri webview), and the wasm build runs in any modern
browser on any OS.

## Status

- [x] Real Typst 0.15 compilation (embedded via `typst-as-lib`)
- [x] Bilingual command layer + Torah/yeshiva commands
- [x] 10 templates (all compile)
- [x] Command + template registries (JSON)
- [x] PDF / SVG / Typst-source export, live diagnostics
- [x] **Full SPA** — CodeMirror 6, command palette, prose mode, bilingual UI,
      settings, themes, templates, exports (M2)
- [x] **WASM** — real Typst in the browser, no server; auto backend selection (M3)
- [x] Cross-platform (Linux / macOS / Windows), fonts embedded
- [x] **Tauri desktop app** — native window, engine in-process via `invoke` (M4)
- [x] **The full note apparatus** — all eleven note layouts in `spec.md` render
      correctly (footnotes, endnotes, per-section endnotes, fixed page-foot
      regions, parallel streams, true sidenotes down either margin, and the four
      two-layer notes-on-notes arrangements). See
      [`engine/README-notes.md`](engine/README-notes.md).
- [x] **Rendered-output tests** — `engine/src/probe.rs` reads the laid-out
      document and `engine/tests/apparatus.rs` asserts where things landed on the
      page, rather than only that the document compiled.
- [x] **A document library and real files** — many named documents, each with its
      own images and fonts; Save writes back to a genuine file (native dialog in
      Tauri, File System Access in the browser, an honest "Save a copy" where
      neither exists).
- [x] **Images and user fonts** — carried with the compile request, since the
      engine has no file system to read from.
- [x] **Spell-check in both languages, dispatched per word.** Hebrew runs on a
      lexicon Ksav owns, built from public-domain corpora so it knows Torah
      Hebrew and the citation apparatus general dictionaries reject. English runs
      on the English Speller Database plus public-domain Judaic English plus a
      hand-written list of transliterated Hebrew, Aramaic and Yiddish — because a
      general dictionary rejects five words in nine of an ordinary sentence about
      a sugya. Each token goes to the lexicon for its own script, so a bilingual
      document is checked in both halves without anyone setting anything.
      Squiggles, suggestions, and a one-click user dictionary.
- [x] **Exports** — PDF, real reflowable HTML (Typst's own HTML backend),
      Markdown, plain text, Typst source.
- [x] **Responsive** down to a phone, and on a laptop.

  It was true on a phone and false on a laptop: at 1366×768 the split gave the
  preview 680 px, an A4 page drew at 860, and the pane scrolled to the *end* of
  every Hebrew line. The page fits the pane by default now and the pane reads in
  the document's own direction — see `app/src/preview.ts`.
- [x] **Review tools** — tracked insertions and deletions, editorial margin
      comments, accept/reject per change, and three ways to read the document
      (markup / as-if-accepted / original).
- [x] **Section-level page setup** — `מקטע_עמוד` gives one section its own
      header, footer, columns, margins, paper, orientation, page numbering,
      border and watermark.
- [x] **Mathematics** — `נוסחה` / `נוסחה_בשורה` evaluate Typst's maths notation,
      laid out left-to-right inside Hebrew text, with a keypad for the notation.
- [x] **Durable storage** — documents, assets and per-document history in
      IndexedDB; saving decoupled from rendering, with a visible, blocking error
      when the store refuses. See [Storage](#storage).
- [x] **Off the UI thread** — the desktop commands are `async` + `spawn_blocking`,
      the wasm engine runs in a Web Worker, and the server serves on a thread
      pool. A 0.4–2.9 s compile no longer freezes the window or the tab.
- [x] **Accessible chrome** — every control has a name, the toolbar is seven
      labelled ribbon groups, the page has landmarks, and the status bar is a
      live region.
- [x] **Licensed** — MIT OR Apache-2.0, with the bundled fonts' OFL/GUST notices
      shipped in the installers *and* rendered in the app. See [Licence](#licence).
- [x] **CI, running and green** — typecheck, 3,566 editor assertions, 383 engine
      tests, `clippy -D warnings`, the desktop shell, and a build-and-run check
      of the browser (wasm) engine, on every push. See [Test](#test).

Done since, and worth stating because these were the longest-standing gaps:

- [x] **A git remote, and CI that actually runs.** `ci.yml` runs on every push and
      is green across all five jobs — editor, engine, formatting and clippy,
      browser (wasm) engine, desktop shell.
- [x] **The release matrix has run, on every platform.** `v0.1.0` drove
      `release.yml` to success on `windows-latest`, `ubuntu-22.04` and *both*
      macOS architectures, so the `.msi`, `.exe`, `.deb`, `.AppImage` and both
      `.dmg`s have all genuinely been produced by a runner.

- [x] **The release is published.** `release.yml` sets `releaseDraft: true`
      deliberately, so a release is reviewed before it is public — and the
      `v0.1.0` draft then sat unpublished, which three consecutive audits called
      the single most consequential open item, because `/releases/latest`
      returned 404 and the Download link in the root README led to an empty
      page. The button has been pressed: nine installers are on it and the tag
      resolves.

Not done:

- [ ] **Code signing.** Unsigned, Windows SmartScreen says "unrecognized app" and
      macOS says "unidentified developer". The fix is a certificate ($99/yr Apple,
      ~$200–400/yr Windows OV), not a workaround; `release.yml` names the secrets.
- [ ] **Nobody has written a real document in it yet.** The most important line
      here. Nothing above substitutes for it.

## Checking how something renders

`compile(..).ok()` only says the document compiled — it cannot see a note in the
wrong column or a number orphaned onto its own line. To see the actual layout:

```sh
cargo run --manifest-path engine/Cargo.toml --example probe -- mydoc.ksav
```

Each output line is one visual line of the document: its y, the x of its leftmost
run, the font sizes on it, and its text.

## Develop

```sh
# 1. Run the engine (HTTP API on :7878)
cargo run --manifest-path engine/Cargo.toml -- serve

# 2. Run the SPA dev server (proxies every engine service to the engine)
cd app && npm install && npm run dev        # http://localhost:5173
```

The dev proxy is built from the engine's service registry, so every route the
engine answers is forwarded. It was a hand-written list of five for a while, and
`/jump`, `/reveal`, `/sefarim`, `/inbox`, `/mekoros` and `/linkify` all 404'd
against Vite itself — features that worked in production and looked broken in the
one place they are developed.

## The shared crates

Every command above works from a plain `git clone`, with nothing set up first.
That sentence is new, and it is the whole point of this section.

Ksav compiles five crates from a second repository,
[`sefer-crates`](https://github.com/SYKhayyat/sefer-crates):

| Crate | What Ksav uses it for |
| --- | --- |
| `girsa-source` | the Source Packet — the wire shape a source arrives in from Girsa |
| `girsa-ksav` | the markup writer, so Girsa's Ksav buffer emits the commands this engine compiles |
| `girsa-post` | the token-gated localhost loopback, and the `ksav://insert` deep link |
| `girsa-ref`, `girsa-hebrew` | transitively, under the three above |

They are not a library Ksav happens to use. Girsa is the library and Ksav is the
pen; the crates are the **seam between two halves of one product**, so that a
change to what a quote block *is* lands on both sides as one edit rather than as
an agreement in prose between two repositories that drifts until a sefer is
printed (spec.md §10.3).

They are pinned by commit:

```toml
girsa-source = { version = "=0.5.0", git = "https://github.com/SYKhayyat/sefer-crates", rev = "5a589af…" }
```

**This used to be `path = "../../../sefer-crates/crates/…"`** — a sibling of the
checkout root, so `git clone ksav && cargo build` failed inside `cargo metadata`,
before any compiler ran, naming a directory the reader had never heard of. No
submodule, no `[patch]`, nothing vendored, and **no page in this repository
mentioned it**, including this one, which handed you a `cargo run` that could not
work. CI worked around it with a second checkout in four of five jobs and in the
release matrix, and `ci.yml`'s first run is the record of what happens without
that. `= 0.5.0` beside a path read as a pin and was not one: with a path
dependency the path always wins and there is no version to fall back to. A commit
SHA is the pin it was pretending to be.

### Working on Ksav and sefer-crates at the same time

That is what the path dependency actually bought, and it is kept. Copy the
example override and a local checkout wins over the pinned commit:

```sh
cp .cargo/config.toml.example .cargo/config.toml     # at the repository root
```

It expects `sefer-crates` beside this repository (`Videos/Ksav`,
`Videos/sefer-crates`, `Videos/Girsa`); edit the paths if yours differ — they
resolve from the repository root, not from `.cargo/`. Cargo finds the file by
walking up from wherever you invoked it, so one copy at the root covers
`engine`, `wasm` and `app/src-tauri` alike, and deleting it puts the pin back.

It is a `paths` override and not `[patch]` on purpose: `[patch]` re-resolves and
rewrites `Cargo.lock`, which erases the pin from it — five entries to zero on
the first `cargo metadata`, measured both ways — and a lock file committed in
that state is the fresh-clone build broken again by the fix for it. `paths`
leaves the lock byte-identical. It does print a warning about an altered
dependency list on every invocation, which is expected while all five crates are
overridden together; the example file says why.

### What the pin costs the other repository

One thing, and it needs fixing there rather than here. `sefer-crates` runs
`tools/check-dependents.sh` — *"a break shows up in this repository's PR, not
weeks later inside an app"* — by building each sibling checkout against its
working tree. That worked because the sibling *was* the dependency. Now Ksav
builds against the pinned commit, so the Ksav half of that check would compile
old code and pass no matter what the change broke. Girsa is unaffected; it still
reaches `sefer-crates` by path.

The check keeps its meaning with one flag on the Ksav build, no state and no
file to clean up:

```sh
cargo build --manifest-path "$siblings/Ksav/ksav/engine/Cargo.toml" --all-targets \
  --config "paths=['$siblings/sefer-crates/crates/girsa-source', …]"
```

Worth being plain about which way this trades. Before, a change next door could
turn this repository red with no commit landing anywhere near it; now it cannot,
and the price is that the other repository has to opt back in to finding out.
The opt-in is one line and it lives where the change is being made, which is the
right end for it.

### Bumping the pin

Push to `sefer-crates`, then edit the `rev` in **both** `engine/Cargo.toml` and
`app/src-tauri/Cargo.toml`, and run `cargo metadata` (or any build) in each of
`engine`, `wasm` and `app/src-tauri` so all three lock files record the new
commit. Both manifests, because the desktop binary links the engine and the
Tauri shell into one
process: two revs would put two `girsa-post`s in it, the loopback desk and the
deep-link parser disagreeing about the wire between them. `engine/tests/manifests.rs`
fails by name if they diverge, if a lock file falls behind, if a path dependency
is ever reintroduced that points outside the repository, or if this section stops
existing.

## Test

```sh
cd app && npm test                          # 3,566 assertions across 58 files
cd app && npx tsc --noEmit                  # typecheck
cargo test --manifest-path engine/Cargo.toml            # 383 tests, 25 binaries
cargo clippy --manifest-path engine/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml
```

`.github/workflows/ci.yml` runs all of these on every push and pull request, plus
one more that cannot run from a plain checkout: it builds the wasm engine and
then *runs* it (`.github/scripts/wasm-smoke.mjs` — every template compiled, both
lexicons answered). The built package is git-ignored and produced locally, so
without that job the entire no-server build could break and every other check
would still be green.

The editor's runner (`app/test/run.mjs`) builds **every module in `app/src`** and
executes every `app/test/*.test.mjs`, so **adding a test is adding a file** — that
friction is how a suite ends up with one file in it, which is where this one
started.

The module list is read off the directory, and that is a fix rather than a
convenience: it used to be a hand-written array, nothing compared it to `src/`, it
had stopped growing at 43 of 62 names, and **no test imported any of the other
nineteen** — `exports.ts`, `compile.ts`, `save.ts`, `files.ts` and `ksav-lang.ts`
among them. `app/test/runner.test.mjs` is what keeps it honest: every module is
built or declared unbuildable in `app/test/modules.mjs` *with a reason that file
executes*, every module is imported by at least one test, and no test may bundle
its own private copy of a module — which was the visible symptom last time. A
module added to `src/` with no test turns the suite red, by name.

`app/test/harness.mjs` installs `localStorage` and IndexedDB shims — its
`localStorage.quota` is settable, because the bug most of these tests exist to
prevent is what happens *at* the quota and waiting for a real 4.5 MB to fill is
not a test, it is a delay — plus `fakeView`, a real `EditorState` behind a fake
screen, and `installChrome`, which is how a test reads the status bar. The status
bar is where most of this product's bugs are visible.

## Rebuild the lexicons

Both generated word lists are committed, so no build ever fetches a corpus —
cargo's own dependency fetch, [the shared crates](#the-shared-crates) among
them, is the only network a build wants, and only until the cache is warm.
Rebuild the lexicons only to change a source or a size:

```sh
cd engine
python tools/build_lexicon.py               # Hebrew: Sefaria + Project Ben-Yehuda
python tools/build_english_lexicon.py       # English: ESDB + Public Domain Judaic English
cargo run --example spellrate -- some.txt   # miss rate, per language
cargo run --example checkdocs               # what the templates trip on
```

The hand-curated supplements (`assets/lexicon-he-supplement.txt`,
`assets/lexicon-en-supplement.txt`) are edited by hand and never regenerated;
`cargo test` fails on any English supplement entry the generated list already
accepts, so it cannot fill up with words carrying no weight.

## Ship a single self-contained binary (server / desktop)

```sh
cd app && npm run build                     # lean -> app/dist (no wasm)
cargo build --release --features embed-ui --manifest-path engine/Cargo.toml
./engine/target/release/ksav serve          # serves the whole SPA + API
```

## Ship an offline, no-server web build (WASM)

```sh
cd wasm && wasm-pack build --target web --release --out-dir pkg
cp pkg/ksav_wasm.js pkg/ksav_wasm.d.ts pkg/ksav_wasm_bg.wasm* ../app/src/wasmpkg/
cd ../app && npm run build:wasm              # app/dist runs with no server
# serve app/dist on any static host
```

### Where it is published

`.github/workflows/deploy.yml` builds exactly the bundle above and publishes it
to GitHub Pages, on a **tag** and on `workflow_dispatch`. Tags rather than every
push to `main`, because a share link carries a document and opens in whatever
app is at the far end: publishing on every push means a link sent on Tuesday
opens in Thursday's half-finished editor.

**Before the first deploy**, GitHub Pages has to be enabled for the repository
with *Source: GitHub Actions* (Settings → Pages). The job does not enable it for
you — turning a repository's contents into a public website is not a build
script's decision — so `actions/configure-pages` fails with a clear message
until somebody has made it.

`VITE_PUBLIC_BASE` is the URL being published to, and it reaches the app twice:

- as Vite's `base`, so the asset URLs in the built HTML carry the `/ksav/`
  prefix a *project* Pages site serves under, and
- as `__PUBLIC_BASE__`, which is the base a **share link** names.

One value for both, so a link can never point at a copy of the app that is not
there. Unset — which is every local build — the assets are rooted at `/` and
"copy a link" refuses in words rather than guessing a host. It used to guess
`https://ksav.app/`, a domain that appears nowhere else in this repository.

## Desktop app (Tauri)

A native window on **Windows, macOS, and Linux** that runs the engine in-process
(no HTTP server, no localhost) — the frontend calls Rust via `invoke`.

```sh
cd app
npm run tauri dev      # dev window + hot reload (starts Vite for you)
npm run tauri build    # standalone app + installers in src-tauri/target/release
```

- **`tauri dev`** connects the window to the Vite dev server — use it while
  developing. A bare `cargo build` debug binary also expects this server (that's
  why running it alone shows "could not connect to localhost").
- **`tauri build`** embeds the frontend, so the produced app is fully
  standalone. Linux needs `webkit2gtk` + `libayatana-appindicator`; macOS and
  Windows (WebView2) need no extra runtime.

### Installers

Not having one of these was the single biggest reason to keep using Word — no
missing feature came close. If installing Ksav requires cargo, npm or a dev
server on a port, then for almost everyone the software does not exist.

| Platform | Artifacts | How |
| --- | --- | --- |
| Windows | `.msi` (WiX), `.exe` (NSIS) | `cd app && npm run tauri build` |
| Linux | `.deb`, `.AppImage` | `ksav/packaging/build-linux.sh` (needs Docker) |
| macOS | `.dmg` (arm64 + x86_64) | CI only — see below |

**Linux builds through Docker** rather than natively, because a `.deb` cannot be
cross-built from Windows and Docker over WSL is a real Linux userland on the same
machine. The image pins **Ubuntu 22.04 on purpose**: glibc is backward but not
forward compatible, so a binary linked there runs on 22.04 and everything newer,
where one built on 24.04 would silently exclude older distros. `node_modules` and
the cargo target directory live in named volumes, so the Linux build never
overwrites the host's Windows-native `node_modules` and never recompiles Typst
from cold twice. Installers are copied out to `ksav/packaging/out/`.

Only this repository is mounted into the container, at `/work`, which is the
right thing and used to be fatal: while the shared crates were reached through a
sibling checkout, the desktop shell's `girsa-post` resolved to `/sefer-crates`,
a directory that was never in the image. This script could not have produced an
installer. The two CI workflows hid the same hole behind a second checkout; here
there was nothing to hide it with, and nothing tried. See
[The shared crates](#the-shared-crates).

**macOS cannot be cross-built at all** — a `.dmg` only comes from a macOS
machine, which is the whole reason `release.yml` exists. It builds all four
targets on tag push and attaches them to a **draft** release. It has run: the
`v0.1.0` tag drove it to success on `windows-latest`, `ubuntu-22.04` and both
macOS architectures, so every installer this project ships has now been produced
by a runner.

`releaseDraft: true` is the right default and the wrong resting place:
`v0.1.0` sat as an unpublished draft for long enough that `/releases/latest`
returned 404 while every installer already existed, which is the same as having
no release at all. It has been published. Cutting the next one means pressing
the button as well as pushing the tag.

> **The installers are unsigned.** Windows SmartScreen will say "unrecognized
> app" and macOS will say "unidentified developer". That is a genuine adoption
> cost — a first-time user meeting that dialog is nearly as stuck as one with no
> installer — and there is no engineering workaround: it needs a certificate
> ($99/yr Apple, ~$200–400/yr Windows OV). The workflow has the signing secrets
> commented in place, so it becomes a signed build with no other change.

## Run

```sh
# Compile a document to PDF + SVG
cargo run --manifest-path engine/Cargo.toml -- engine/examples/sample.ksav out/

# Launch the web editor
cargo run --manifest-path engine/Cargo.toml -- serve      # http://127.0.0.1:7878
```

## The engine's services

Ksav ships four ways — `ksav serve`, the desktop app, the in-browser wasm build,
and the Vite dev server proxying to a running engine. All four reach **one
registry**, `engine/src/services.rs`, and none of them keeps a list of its own:

| Service | HTTP | In / out |
|---|---|---|
| `compile` | `POST /compile` | `{body, font, size_pt, margin_cm, dir, numbering, justify, line_spacing_em, columns}` → `{ok, pages_svg[], pdf_base64, diagnostics[], typst_source}` |
| `assemble` | `POST /assemble` | `{body, parts, …DocConfig}` → `{ok, typst_source, diagnostics[]}` — the same source a compile would carry, without the compile. "Export .typ" used to ask for a full render *with the PDF* and read one field off it |
| `jump` | `POST /jump` | inverse search: `{body, page, x_pt, y_pt, …DocConfig}` → `{line, column}`, or `{}` for a point the writer did not type (a margin, a running head, a note-band rule) |
| `reveal` | `POST /reveal` | forward search: `{body, line, column, …DocConfig}` → `{points: [{page, x_pt, y_pt}]}`, empty when it printed nowhere and several when it printed more than once |
| `spell` | `POST /spell` | `{text, user_words, suggest}` → `{misspellings[], lexicon_sizes}` |
| `suggest` | `POST /suggest` | `{word, user_words}` → `{suggestions[]}` |
| `commands` | `GET /commands` | the command registry (JSON) |
| `templates` | `GET /templates` | the template registry (JSON, includes each body) |
| `sefarim` | `GET /sefarim` | the sefer catalogue, for citation autocomplete |
| `inbox` | `GET /inbox` | sources Girsa handed over, drained not read |
| `mekoros` | `POST /mekoros` | `{phrase, except, search}` → where the phrase is from, or `{opened:true}` when asked to open Girsa's search instead |
| `linkify` | `POST /linkify` | `{text}` → `{text}` with the certain citations made live |

`GET /` and everything else is the built editor, served as static files.

The last three need the loopback to Girsa, so they exist in the browser build as
a stated refusal rather than as a hole — `nativeOnly` in the generated table is
why `WasmBackend` implements `Backend` and not `Sources`.

Both jump directions lay the document out to answer, so they cost what a compile
costs and go through the same deadline and concurrency cap — which is `Cost` on
the service, not a rule each build writes down again. Coordinates are in Typst
points, which is the unit each page's own SVG `viewBox` is written in — so a
client converts with the drawn element's width and nothing else, and no zoom
setting can put the two sides out of step. Lines are counted in the body that was
sent, exactly as `diagnostics[].line` is.

### Adding one

One line in `engine/src/services.rs`, then `node tools/emit-services.mjs` in
`app/`. That is the whole list. The HTTP route, the dev proxy entry, the wasm
dispatch, the desktop command and the TypeScript name union all come from that
table, and `npm test` fails if the generated copy is stale.

It used to be eight files and eleven sites, of which exactly one was visible to a
compiler. Four of the silent ten had already been forgotten by the time anybody
counted: `sefarim` never reached the wasm worker's dispatch table, so citation
autocomplete was dead in the offline build with nothing reporting it; the dev
proxy carried five of twelve routes, so click-to-jump 404'd under `npm run dev`;
and the Content-Security-Policy existed as three copies that had diverged, which
killed the update check in both builds that ship an installer. That policy is now
`policy/csp.txt` — see `policy/README.md` — and the desktop build fails rather
than delivering a different one.

## Library API

```rust
use ksav_engine::{compile, DocConfig};
let result = compile("#הדגשה[שלום עולם]", &DocConfig::default());
// result.pdf, result.pages_svg, result.diagnostics, result.typst_source
```

## Storage

Documents, their images and fonts, and the per-document version history live in
**IndexedDB** (`app/src/store.ts`). Only preferences and a small library index
live in `localStorage`.

That split is not a preference. `localStorage` gives a page roughly 4.5 MB in
total, is synchronous, and signals exhaustion by throwing from the middle of a
setter — and Ksav filled it routinely: a 4 MB image is 5.3 MB once base64-encoded,
and the history was eighty whole copies of the document under one key. The throw
landed inside the compile path where nothing caught it, so the editor said
"rendering…" forever and every keystroke after that was lost. IndexedDB is
asynchronous, is measured in hundreds of megabytes, and reports failure as a
rejected promise the writer can actually be shown.

A write resolves on transaction *commit* rather than request success, so "saved"
means saved. The library index stays in `localStorage` because menus need it
synchronously; it is a cache, and `docs.init()` rebuilds it from the documents
whenever it disagrees, so it can never become the authority on what exists.

Saving is its own module (`app/src/save.ts`) on its own timer, and never depends
on rendering. A save that fails raises a banner that stays until the store works
again, with a **Download a backup** button on it.

## Licence

Dual-licensed **MIT OR Apache-2.0**, at your option — see
[`../LICENSE`](../LICENSE), [`../LICENSE-MIT`](../LICENSE-MIT) and
[`../LICENSE-APACHE`](../LICENSE-APACHE).

The six bundled fonts are **separately licensed** (SIL OFL 1.1 and the GUST Font
License) and their licences require the notice to accompany redistribution — which
includes every installer, the server binary, and the wasm module the browser build
downloads. See [`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) and
[`../licenses/`](../licenses); the same notice is rendered in the app under
Settings → About & licences, because the web build has no installer to put a text
file beside.

The English lexicon is derived from the **English Speller Database**, whose
licence covers word lists created from it and requires its notice in all copies.
That notice travels three ways: `../licenses/ESDB.txt`, the header of
`engine/assets/lexicon-en.txt` itself, and Settings → About.

Nothing under the GNU AGPL is bundled. Hspell — the only other open Hebrew
spelling dictionary in existence — is deliberately not included;
`engine/src/spell/hebrew.rs` gives the licence reasoning and the measurements
that ruled it out on quality grounds as well.

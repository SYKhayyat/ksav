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

**Styles ▸ Notes** exposes what the apparatus can actually do: per-tier size,
slant, colour, indent and numbering scheme. It writes the same `#הגדרות_הערות`
line you would type by hand, which is what keeps the panel and the markup from
drifting apart.

The tiers are numbered א,ב,ג over 1,2,3 — the שער־הציון arrangement, the
commentary lettered and the he'aros on it numbered.

### Going faster

- **`Ctrl+Alt+K`** — a *hydra*: a panel listing every operation available where
  the caret is, one letter each, staying open so five rows is `r r r r r`.
  `Esc` or `q` to leave.
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

- **104 commands**, each bilingual (Hebrew + English), across styles, headings,
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
- **Word-like toolbar**, **command palette** (Ctrl+K, searches all 104 commands
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
- [x] **CI, running and green** — typecheck, 389 editor assertions, 155 engine
      tests, `clippy -D warnings`, the desktop shell, and a build-and-run check
      of the browser (wasm) engine, on every push. See [Test](#test).

Done since, and worth stating because these were the longest-standing gaps:

- [x] **A git remote, and CI that actually runs.** `ci.yml` runs on every push and
      is green across all four jobs — editor, engine, desktop shell, browser
      engine.
- [x] **The release matrix has run, on every platform.** `v0.1.0` drove
      `release.yml` to success on `windows-latest`, `ubuntu-22.04` and *both*
      macOS architectures, so the `.msi`, `.exe`, `.deb`, `.AppImage` and both
      `.dmg`s have all genuinely been produced by a runner.

Not done:

- [ ] **The release is still a draft, so nothing is downloadable.** This is the
      one to fix first, and it is a button rather than a task. `release.yml` sets
      `releaseDraft: true` — deliberately, so a release is reviewed before it is
      public — and the draft from `v0.1.0` was never published. Until it is,
      `/releases/latest` returns 404 and anyone following the Download link in the
      root README finds an empty page. Every installer already exists; no one can
      reach them.
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

# 2. Run the SPA dev server (proxies API to the engine)
cd app && npm install && npm run dev        # http://localhost:5173
```

## Test

```sh
cd app && npm test                          # 389 assertions across 9 files
cd app && npx tsc --noEmit                  # typecheck
cargo test --manifest-path engine/Cargo.toml            # 155 tests
cargo clippy --manifest-path engine/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml
```

`.github/workflows/ci.yml` runs all of these on every push and pull request, plus
one more that cannot run from a plain checkout: it builds the wasm engine and
then *runs* it (`.github/scripts/wasm-smoke.mjs` — every template compiled, both
lexicons answered). The built package is git-ignored and produced locally, so
without that job the entire no-server build could break and every other check
would still be green.

The editor's runner (`app/test/run.mjs`) builds the modules listed in `MODULES`
and executes every `app/test/*.test.mjs`, so **adding a test is adding a file** —
that friction is how a suite ends up with one file in it, which is where this one
started. `app/test/harness.mjs` installs `localStorage` and IndexedDB shims, and
its `localStorage.quota` is settable, because the bug most of these tests exist to
prevent is what happens *at* the quota and waiting for a real 4.5 MB to fill is
not a test, it is a delay.

## Rebuild the lexicons

Both generated word lists are committed, so a normal build never touches the
network. Rebuild them only to change a source or a size:

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

**macOS cannot be cross-built at all** — a `.dmg` only comes from a macOS
machine, which is the whole reason `release.yml` exists. It builds all four
targets on tag push and attaches them to a **draft** release. It has run: the
`v0.1.0` tag drove it to success on `windows-latest`, `ubuntu-22.04` and both
macOS architectures, so every installer this project ships has now been produced
by a runner.

The draft is still a draft, though, and that is the thing to do next. Nothing is
downloadable until someone opens the release and presses publish — `releaseDraft:
true` is the right default, but a draft nobody publishes is the same as no
release at all.

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

## HTTP API (used by the editor)

- `GET  /`          — the web editor
- `POST /compile`   — `{body, font, size_pt, margin_cm, dir, numbering, justify, line_spacing_em, columns}`
                      → `{ok, pages_svg[], pdf_base64, diagnostics[], typst_source}`
- `POST /jump`      — inverse search: `{body, page, x_pt, y_pt, …DocConfig}`
                      → `{line, column}`, or `{}` for a point the writer did not
                      type (a margin, a running head, a note-band rule)
- `POST /reveal`    — forward search: `{body, line, column, …DocConfig}`
                      → `{points: [{page, x_pt, y_pt}]}`, empty when it printed
                      nowhere and several when it printed more than once
- `GET  /commands`  — the command registry (JSON)
- `GET  /templates` — the template registry (JSON, includes each body)

Both jump directions lay the document out to answer, so they cost what a compile
costs and go through the same deadline and concurrency cap. Coordinates are in
Typst points, which is the unit each page's own SVG `viewBox` is written in —
so a client converts with the drawn element's width and nothing else, and no
zoom setting can put the two sides out of step. Lines are counted in the body
that was sent, exactly as `diagnostics[].line` is.

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

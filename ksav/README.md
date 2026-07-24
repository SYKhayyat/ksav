# כְּתָב · Ksav

A Hebrew-first writing system built on **real Typst compilation**. The goal:
there should be no reason for a bochur — or any Hebrew writer — not to use this.
It should be the standard for Hebrew writing.

This is a ground-up rewrite. The two earlier prototypes (`../src` React app and
`../ksav_flutter_rust`) both *mocked* the renderer — neither ever invoked Typst.
This engine runs the genuine Typst compiler.

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
- [x] **Responsive** down to a phone.
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
- [x] **CI** — typecheck, 389 editor assertions, 155 engine tests,
      `clippy -D warnings`, and a build-and-run check of the browser (wasm)
      engine on every push. See [Test](#test).

Not done, and not engineering:

- [ ] **A git remote.** CI and the release matrix are written and have never run
      as workflows, because one machine still holds the only copy of the work.
      The Windows installers themselves are not untested — `npm run tauri build`
      produces the `.msi` and the NSIS `.exe` on this machine and they have been
      built from the current tree. The `.deb` and `.AppImage` can be produced
      locally too, through `packaging/build-linux.sh`. What genuinely has never
      run is macOS: a `.dmg` cannot be cross-built, so both Mac architectures
      wait on a runner.
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
machine. `.github/workflows/release.yml` builds all four targets on tag push and
attaches them to a draft release; it is written but has never run, because the
repo has no git remote yet.

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
- `GET  /commands`  — the command registry (JSON)
- `GET  /templates` — the template registry (JSON, includes each body)

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

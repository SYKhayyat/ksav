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
```

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
- **8 document templates**: letter, article, sefer, divrei-torah, siddur,
  bentcher, kesubah, get — real Hebrew content with nikud and authentic mekoros.
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
- **Word-like toolbar**, **command palette** (Ctrl+K, searches all 53 commands
  in Hebrew or English), **templates** menu, **export** menu (PDF / HTML /
  Markdown / text / Typst / print).
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

The wasm is a lazily-loaded ~23 MB chunk (~9 MB gzipped) and is only bundled in
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
- [x] 8 templates (all compile)
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
- [x] **Hebrew spell-check** on a lexicon Ksav owns, built from public-domain
      corpora so it knows Torah Hebrew and the citation apparatus that general
      dictionaries reject. Squiggles, suggestions, and a one-click user
      dictionary.
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

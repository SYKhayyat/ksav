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
unlimited nesting (a table inside a footnote inside a heading inside a list item)
works for free.

## Features (engine)

- **53 commands**, each bilingual (Hebrew + English), across styles, headings,
  alignment, direction (RTL/LTR runs), lists, definition lists, tables, footnotes,
  blocks (quote / callout / warning / success / framed box), layout, and a
  dedicated **Torah/yeshiva layer**: `סימן`, `סעיף`, `פסוק`, `מראה_מקום`
  (mekoros footnotes), `ציון`, `גמרא`, `דיבור_המתחיל`.
- **8 document templates**: letter, article, sefer, divrei-torah, siddur,
  bentcher, kesubah, get — real Hebrew content with nikud and authentic mekoros.
- **Command registry** exposed as JSON (`/commands`) — drives the palette,
  toolbar, and docs. **Template registry** at `/templates`.
- **Bundled fonts** (Frank Ruhl Hofshi, David Libre, Cascadia Mono) — output is
  self-contained, with full nikud support.
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
  in Hebrew or English), **templates** menu, **export** menu (PDF / HTML / Typst
  / print).
- **Bilingual UI** (Hebrew ⇄ English) with full RTL/LTR flip of the chrome —
  independent of the document's own direction. Persisted.
- **Settings**: font, size, margins, direction, page numbers, justify, line
  spacing, columns, zoom. **Light/dark theme.** One/two-panel layout.

## Status

- [x] Real Typst 0.15 compilation (embedded via `typst-as-lib`)
- [x] Bilingual command layer + Torah/yeshiva commands
- [x] 8 templates (all compile)
- [x] Command + template registries (JSON)
- [x] PDF / SVG / Typst-source export, live diagnostics
- [x] **Full SPA** — CodeMirror 6, command palette, prose mode, bilingual UI,
      settings, themes, templates, exports (M2)
- [ ] WASM build for in-browser operation (M3)
- [ ] Tauri desktop app (M4)

## Develop

```sh
# 1. Run the engine (HTTP API on :7878)
cargo run --manifest-path engine/Cargo.toml -- serve

# 2. Run the SPA dev server (proxies API to the engine)
cd app && npm install && npm run dev        # http://localhost:5173
```

## Ship a single self-contained binary

```sh
cd app && npm run build                     # -> app/dist
cargo build --release --features embed-ui --manifest-path engine/Cargo.toml
./engine/target/release/ksav serve          # serves the whole SPA + API
```

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

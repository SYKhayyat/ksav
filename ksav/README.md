# כְּתָב · Ksav

A Hebrew-first writing system built on **real Typst compilation**.

This is a ground-up rewrite. The two earlier prototypes (`../src` React app and
`../ksav_flutter_rust`) both *mocked* the renderer — neither ever invoked Typst.
This engine runs the genuine Typst compiler.

## Core idea

Every Hebrew command is a **real Typst function**, defined in
[`engine/typst/ksav.typ`](engine/typst/ksav.typ):

```typst
#let הדגשה(body) = strong(body)
#let טבלה(עמודות: 2, ..תאים) = table(columns: עמודות, ..תאים)
```

The engine prepends this prelude to the user's document, injects a
`#show: מסמך.with(...)` wrapper driven by editor settings (font / size / margins /
direction), and compiles with the real Typst engine.

Because **Typst itself parses the document**, we never reimplement a parser — and
unlimited nesting (a table inside a footnote inside a heading inside a list item)
works for free. This is verified in `engine/examples/sample.ksav`, where a full
table renders *inside a footnote*.

## Status

- [x] Real Typst 0.15 compilation (embedded via `typst-as-lib`)
- [x] Hebrew prelude: styles, unlimited headings, lists, tables, footnotes, alignment, custom color/size/font
- [x] Bundled Hebrew fonts (Frank Ruhl Hofshi, David Libre) — self-contained output
- [x] PDF export + per-page SVG previews
- [x] Real compiler diagnostics surfaced (errors + hints)
- [x] CLI (`ksav <input.ksav> [out_dir]`)
- [ ] Editor UI (recommended: Tauri + CodeMirror 6 — decision pending)
- [ ] Templates (letter / article / sefer / siddur / …)
- [ ] Command palette driven by `typst-ide`
- [ ] Flat (stacked) footnote mode

## Run

```sh
cargo run --manifest-path engine/Cargo.toml -- engine/examples/sample.ksav out/
```

Produces `out/sample.pdf` and `out/sample.page-1.svg`. Compiles in ~25ms.

## Library API

```rust
use ksav_engine::{compile, DocConfig};

let result = compile("#הדגשה[שלום עולם]", &DocConfig::default());
// result.pdf: Option<Vec<u8>>, result.pages_svg: Vec<String>, result.diagnostics
```

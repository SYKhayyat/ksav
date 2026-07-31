# כתב · Ksav

**A Hebrew-first typesetting and writing system, built on the real
[Typst](https://typst.app/) engine.** Ksav (כְּתָב, "writing"/"script") gives Hebrew
writers a Word-like editor — a formatting toolbar, a live preview, a command
palette, prose and source modes, spell-check, and ready-made templates — where
every Hebrew command is a genuine Typst function, so documents are laid out by a
real compiler rather than approximated in the browser.

It is aimed at Hebrew writers, with a first-class Torah/yeshiva path (siddur,
bentcher, kesubah, get, footnote apparatus, side-column commentary), and it works
equally for left-to-right English documents.

## Download

Installers for Windows, macOS (Apple Silicon and Intel) and Linux are attached to
the [latest release](https://github.com/SYKhayyat/ksav/releases). You do not need
Rust, Node, or a terminal to use Ksav — those are only for building it yourself.

> **Not published yet.** CI has built every installer — Windows, both Mac
> architectures and Linux — but the `v0.1.0` release is still a *draft*, so that
> link shows an empty page to anyone but the maintainer. Publishing the draft is
> all that stands between the files and the people they are for. Until then,
> build it yourself from the instructions below.

**The installers are not code-signed, so the first launch is blocked on every
system.** The download is not broken; a certificate is a cost Ksav has not paid
yet. Getting past it:

| System | What you will see | What to press |
| --- | --- | --- |
| Windows | "Windows protected your PC" | **More info** → **Run anyway** |
| macOS | "unidentified developer" | **System Settings → Privacy & Security** → **Open Anyway** |
| macOS | "Ksav is damaged" | `xattr -dr com.apple.quarantine /Applications/Ksav.app` |
| Linux (`.AppImage`) | nothing happens | `chmod +x Ksav_*.AppImage` |

Your documents stay on your machine — Ksav has no account, no server, and uploads
nothing.

## Start here → [`ksav/`](ksav)

**The product is [`ksav/`](ksav).** It has its own detailed
[README](ksav/README.md). The same Rust engine runs three ways from one codebase:

- **`ksav serve`** — a local HTTP server that hosts the editor SPA and compiles on
  the machine.
- **In-browser (WebAssembly)** — the engine compiled to WASM, running Typst
  entirely in the tab with no server.
- **Desktop (Tauri)** — a native app (Windows / macOS / Linux) with the engine
  in-process.

```sh
cd ksav/engine
cargo run --release --features embed-ui -- serve   # then open the printed URL
```

See [`ksav/README.md`](ksav/README.md) for the browser, desktop, and development
builds, the command reference, and the architecture.

## What it does

- **Hebrew markup editor** — bracketed Hebrew commands such as `#הדגשה[טקסט]`
  (bold), `#כותרת1[…]` (heading), `#רשימה[…]` (list), `#טבלה[…]` (table),
  `#הערה[…]` (footnote); every command has a collision-free English alias.
- **Real Typst output** — genuine PDF and per-page SVG previews from the actual
  Typst compiler, with real diagnostics.
- **Prose & source modes** — a clean "prose" view that renders styling inline
  (WYSIWYG lists, footnotes, tables), and the raw markup a keystroke away.
- **Live preview** with print / save-as-PDF, plus HTML, Markdown, and Typst export.
- **Bilingual spell-check** — Hebrew and English, each on a lexicon Ksav owns,
  dispatched per word so a bilingual document is checked in both.
- **Command palette, Word-like toolbar, templates, document library, version
  history, custom commands**, and a fully RTL/LTR-aware bilingual UI.

## Repository layout

| Path | Description |
| --- | --- |
| [`ksav/`](ksav) | **The product.** The Rust Typst engine, the CodeMirror SPA (`ksav/app`), the WASM crate (`ksav/wasm`), the Tauri desktop shell (`ksav/app/src-tauri`), and packaging. Start here. |
| [`prototypes/`](prototypes) | The two original Gemini-authored **mocks**, archived for history — a React web app and a Flutter + Rust app. Neither ever invoked Typst. See [`prototypes/README.md`](prototypes/README.md). |
| `assets/` (per-crate), `licenses/`, `THIRD-PARTY-NOTICES.md` | Bundled fonts and lexicons live under `ksav/engine/assets`; third-party license texts and notices are at the repo root. |

> **On the prototypes.** An earlier version of this repository had a React
> prototype at the top level whose `server.ts` was an **open, unauthenticated
> Gemini API-key proxy** bound to `0.0.0.0`. That server has been removed and the
> mocks moved under `prototypes/`; see [`prototypes/README.md`](prototypes/README.md)
> for the full account. If you cloned this expecting the AI proxy at the front
> door, it is intentionally gone.

## License

Dual-licensed under **MIT OR Apache-2.0** (the Rust ecosystem convention); see
[`LICENSE-MIT`](LICENSE-MIT) and [`LICENSE-APACHE`](LICENSE-APACHE). Bundled fonts
and lexicons carry their own permissive licenses, reproduced in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and [`licenses/`](licenses) and
rendered inside the app.

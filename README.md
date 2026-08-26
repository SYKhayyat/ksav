# כתב · Ksav

**A Hebrew-first typesetting and writing system, built on the real [Typst](https://typst.app/) engine.** Ksav gives Hebrew writers a Word-like editor — a formatting toolbar, a live preview, a command palette, prose and source modes, spell-check, and ready-made templates — where every Hebrew command is a genuine Typst function, so documents are laid out by a real compiler rather than approximated in the browser.

It is aimed at Hebrew writers, with a first-class Torah/yeshiva path (siddur, bentcher, kesubah, get, footnote apparatus, side-column commentary), and it works equally for left-to-right English documents.

Your documents stay on your machine. Ksav has no account, no server, and uploads nothing.

> **New here and not a Rust or TypeScript developer?** You do not need either language to use Ksav. Download an installer or open the browser editor, then begin with [`docs/start-here.md`](docs/start-here.md). The Rust engine and TypeScript editor are implementation details for contributors. You can report problems with screenshots and the document text, improve translations and documentation, or add templates without learning the internals. If you are contributing code, [`CONTRIBUTING.md`](CONTRIBUTING.md) gives the toolchain setup and the smallest verification command; [`docs/your-first-change.md`](docs/your-first-change.md) walks through one change from start to finish.

### Where to go

| You are here to… | Go to |
|---|---|
| **use it** | [`docs/start-here.md`](docs/start-here.md) |
| **switch from Word** | [`docs/from-word.md`](docs/from-word.md) |
| **fix something that went wrong** | [`docs/troubleshooting.md`](docs/troubleshooting.md) |
| **learn the keyboard** | [`docs/shortcuts.md`](docs/shortcuts.md) |
| **build or change it** | [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/your-first-change.md`](docs/your-first-change.md) |
| **understand the architecture** | [`ksav/README.md`](ksav/README.md) |
| **work on the seam with Girsa** | [`docs/girsa.md`](docs/girsa.md) |
| **know why something is the way it is** | [`decisions/README.md`](decisions/README.md) |

## Download

Installers for Windows, macOS (Apple Silicon and Intel) and Linux are attached to the [latest release](https://github.com/SYKhayyat/ksav/releases). You do not need Rust, Node, or a terminal to use Ksav — those are only for building it yourself.

**The installers are not code-signed, so the first launch is blocked on every system.** The download is not broken; a certificate is a cost Ksav has not paid yet. Getting past it:

| System | What you will see | What to press |
| --- | --- | --- |
| Windows | "Windows protected your PC" | **More info** → **Run anyway** |
| macOS | "unidentified developer" | **System Settings → Privacy & Security** → **Open Anyway** |
| macOS | "Ksav is damaged" | `xattr -dr com.apple.quarantine /Applications/Ksav.app` |
| Linux (`.AppImage`) | nothing happens | `chmod +x Ksav_*.AppImage` |

## Building it yourself

The same Rust engine runs three ways from one codebase:

- **`ksav serve`** — a local HTTP server that hosts the editor and compiles on the machine.
- **In-browser (WebAssembly)** — the engine compiled to wasm, running Typst entirely in the tab with no server.
- **Desktop (Tauri)** — a native app (Windows / macOS / Linux) with the engine in-process.

```sh
cd ksav/app && npm install && npm run build
cd ../engine
cargo run --release --features embed-ui -- serve
```

The order matters: `embed-ui` bakes `app/dist` into the binary at compile time. On NixOS, `nix develop` provides the versions used by CI.

## What it does

- **Hebrew markup editor** with English aliases
- **Real Typst output** with PDF and per-page SVG previews
- **Prose and source modes**
- **Live preview** with print / save-as-PDF and HTML, Markdown, and Typst export
- **Bilingual spell-check**
- **Command palette, Word-like toolbar, templates, document library, version history, custom commands**, and RTL/LTR-aware bilingual UI

## Contributing without becoming a compiler expert

Start with a user-visible issue: record the operating system, installation method, language direction, a minimal document, expected output, actual output, and a screenshot or diagnostic if available. Documentation, translations, templates, and regression fixtures are valuable contributions and do not require Rust or TypeScript. Contributors changing the engine should read the architecture notes first; contributors changing the UI should run the editor checks and verify both English and Hebrew layouts.

## Girsa, the other half

Ksav has a sibling. **[Girsa](https://github.com/SYKhayyat/girsa) is the library; Ksav is the pen.** They exchange versioned Source Packets through the shared `sefer-crates` project. Ksav remains useful without Girsa installed.

## Repository layout

| Path | Description |
| --- | --- |
| [`ksav/`](ksav) | Rust Typst engine, CodeMirror SPA, WASM crate, Tauri shell, and packaging |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup, verification gate, and contribution rules |
| [`docs/`](docs) | Reader and contributor documentation |
| [`flake.nix`](flake.nix) | Reproducible development shell |
| [`spec.md`](spec.md) | Note options and markup rules |
| [`decisions/`](decisions/README.md) | Dated design and audit record |

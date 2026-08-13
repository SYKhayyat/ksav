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

**If you are here to use it, not to build it:
[`docs/start-here.md`](docs/start-here.md)** — and
[`docs/from-word.md`](docs/from-word.md) if that is what you are leaving.
[`docs/shortcuts.md`](docs/shortcuts.md) is all 62 bindings in both languages,
generated from the source.

## Download

Installers for Windows, macOS (Apple Silicon and Intel) and Linux are attached to
the [latest release](https://github.com/SYKhayyat/ksav/releases). You do not need
Rust, Node, or a terminal to use Ksav — those are only for building it yourself.

`v0.1.0` is **published**, with nine installers on it: `.msi` and `.exe` for
Windows, `.dmg` for both Mac architectures, `.deb`, `.rpm` and `.AppImage` for
Linux, and the two `.app.tar.gz` bundles. `/releases/latest` was a 404 for as long
as the release sat as a draft, which three consecutive audits called the single
most consequential open item — it is a button, and it has been pressed.

**The installers are not code-signed, so the first launch is blocked on every
system.** The download is not broken; a certificate is a cost Ksav has not paid
yet. Getting past it:

| System | What you will see | What to press |
| --- | --- | --- |
| Windows | "Windows protected your PC" | **More info** → **Run anyway** |
| macOS | "unidentified developer" | **System Settings → Privacy & Security** → **Open Anyway** |
| macOS | "Ksav is damaged" | `xattr -dr com.apple.quarantine /Applications/Ksav.app` |
| Linux (`.AppImage`) | nothing happens | `chmod +x Ksav_*.AppImage` |

Every one of those four lines is also in the release body itself, because that is
the page somebody who clicked *Download* is actually looking at — a workaround that
only exists in a README is a workaround nobody reads.

<details>
<summary><b>When a certificate is bought, this becomes a signed build with no other change</b></summary>

Apple is $99/yr and a Windows OV certificate is roughly $200–400/yr. The workflow
already names the secrets; setting them is the whole of it, and nothing in
`release.yml` has to be edited.

| Secret | What it is | Which build |
| --- | --- | --- |
| `APPLE_CERTIFICATE` | the `.p12`, base64-encoded | macOS |
| `APPLE_CERTIFICATE_PASSWORD` | its password | macOS |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: … (TEAMID)` | macOS |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | notarisation | macOS |
| `WINDOWS_CERTIFICATE` | the `.pfx`, base64-encoded | Windows |
| `WINDOWS_CERTIFICATE_PASSWORD` | its password | Windows |
| `TAURI_SIGNING_PRIVATE_KEY` | the updater's key, if the updater is ever turned on | all |

Until then the table above is the honest answer rather than a fix, and it is the
one every unsigned application ships with.

</details>

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
cd ksav/app && npm install && npm run build        # the editor, into app/dist
cd ../engine
cargo run --release --features embed-ui -- serve   # then open the printed URL
```

Those two steps are both of them: a clone builds. That was not true until 6
August 2026 — the shared `girsa-*` crates were reached through a *sibling*
checkout of a second repository, so `cargo build` failed inside `cargo metadata`
before any compiler ran, `--features embed-ui` needed an editor nobody had told
you to build, and no page here mentioned either. See
[**The shared crates**](ksav/README.md#the-shared-crates) for what Ksav borrows
from [`sefer-crates`](https://github.com/SYKhayyat/sefer-crates), how it is
pinned, and how to edit both halves at once.

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
| [`spec.md`](spec.md) | The note options — eleven, and the ground rule that produces exactly eleven. A living document. |
| [`decisions/`](decisions/README.md) | **The record.** Every dated wave, audit and resolution, each true on its date and never edited afterwards. Kept apart from the documentation on purpose: a spec is edited in place, a log is written once, and every stale number in this repository used to live where the two had been merged. |
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

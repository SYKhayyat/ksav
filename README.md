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

Your documents stay on your machine. Ksav has no account, no server, and uploads
nothing.

### Where to go

| You are here to… | Go to |
|---|---|
| **use it** | [`docs/start-here.md`](docs/start-here.md) |
| **switch from Word** | [`docs/from-word.md`](docs/from-word.md) |
| **learn the keyboard** | [`docs/shortcuts.md`](docs/shortcuts.md) — all 88 bindings in both languages, generated from the source |
| **build or change it** | [`CONTRIBUTING.md`](CONTRIBUTING.md) — clone to landed change |
| **understand the architecture** | [`ksav/README.md`](ksav/README.md) |
| **work on the seam with Girsa** | [`docs/girsa.md`](docs/girsa.md) |
| **write in Emacs instead** | [`ksav/editors/emacs/README.md`](ksav/editors/emacs/README.md) |
| **know why something is the way it is** | [`decisions/README.md`](decisions/README.md) |

## Download

Installers for Windows, macOS (Apple Silicon and Intel) and Linux are attached to
the [latest release](https://github.com/SYKhayyat/ksav/releases). You do not need
Rust, Node, or a terminal to use Ksav — those are only for building it yourself.

**The installers are not code-signed, so the first launch is blocked on every
system.** The download is not broken; a certificate is a cost Ksav has not paid
yet. Getting past it:

| System | What you will see | What to press |
| --- | --- | --- |
| Windows | "Windows protected your PC" | **More info** → **Run anyway** |
| macOS | "unidentified developer" | **System Settings → Privacy & Security** → **Open Anyway** |
| macOS | "Ksav is damaged" | `xattr -dr com.apple.quarantine /Applications/Ksav.app` |
| Linux (`.AppImage`) | nothing happens | `chmod +x Ksav_*.AppImage` |

The same four lines are in the release body, which is the page somebody who
clicked *Download* is actually looking at.

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

</details>

### In a browser, with nothing installed

[**sykhayyat.github.io/ksav**](https://sykhayyat.github.io/ksav/) is the same
editor with the engine compiled to WebAssembly: Typst runs in the tab, there is
no server, and it works offline once loaded.

### Without the desktop application

Releases also attach the **engine** on its own — `ksav-engine-<platform>`, one
file, nothing to install. It is not a cut-down piece of Ksav: it carries the
editor inside it, so `ksav serve` opens the whole thing in a browser, and
`ksav sefer.ksav` writes a PDF from a shell. This matters because the desktop
shell links the engine as a *library*, so installing Ksav puts no `ksav` program
on the machine — an Emacs user, a script, a server, or a platform the shell does
not build for needs the standalone binary.

For **Emacs**, `ksav-<version>.tar` on the same release is an installable
package: `M-x package-install-file`, then `M-x ksav-install-engine`. See
[`ksav/editors/emacs`](ksav/editors/emacs/README.md).

> The engine binaries and the Emacs package are attached from **v0.1.1 onward**.
> `v0.1.0` predates the jobs that build them and carries the nine installers
> only, so `M-x ksav-install-engine` cannot find an engine on that tag.

## Building it yourself

The same Rust engine runs three ways from one codebase:

- **`ksav serve`** — a local HTTP server that hosts the editor and compiles on
  the machine.
- **In-browser (WebAssembly)** — the engine compiled to wasm, running Typst
  entirely in the tab with no server.
- **Desktop (Tauri)** — a native app (Windows / macOS / Linux) with the engine
  in-process.

```sh
cd ksav/app && npm install && npm run build        # the editor, into app/dist
cd ../engine
cargo run --release --features embed-ui -- serve   # then open the printed URL
```

The order matters: `embed-ui` bakes `app/dist` into the binary at compile time.

On NixOS, or anywhere else you would rather not install four toolchains by hand,
`nix develop` gives you all of them at the versions CI uses.

Ksav borrows its Hebrew reference parser, citation formatter and normaliser from
[`sefer-crates`](https://github.com/SYKhayyat/sefer-crates), pinned by commit.
See [**The shared crates**](ksav/README.md#the-shared-crates) for how to edit both
halves at once, and [`ksav/README.md`](ksav/README.md) for the browser, desktop
and development builds, the command reference, and the architecture.

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

## Girsa, the other half

Ksav has a sibling. **[Girsa](https://github.com/SYKhayyat/girsa) is the
library; Ksav is the pen.** Girsa holds the corpus — you search it, read it, and
find the מקור you want; Ksav is where the sefer that quotes it gets written.

They are two applications and one product, and they hand things to each other
three ways: over a token-gated loopback while both are open, through the system
clipboard under a real native format, and through a `ksav://` link that starts
Ksav when it is not running. What crosses is a **Source Packet** — a versioned
contract that lives in a third repository,
[`sefer-crates`](https://github.com/SYKhayyat/sefer-crates), alongside the ref
parser, the citation formatter, the Hebrew normaliser and the code that writes
Ksav's own markup. It lives there so that a change to what a quote *is* lands on
both sides as one edit rather than as an agreement in prose between two
codebases.

Ksav is useful on its own and nothing here requires Girsa to be installed. The
services that need it say so rather than failing.
[`docs/girsa.md`](docs/girsa.md) is the map of the seam.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) takes you from a clone to a change that
lands: what to install, how the three builds differ, the one command that is the
gate, and the rules — fix the class rather than the instance, mutation-test
every fence, a broken feature is the finding and the missing message is a
subordinate clause.

The short version of why this repository is shaped the way it is: **the engine
is right and the surface lies about it.** That is the bug Ksav keeps having, and
almost every convention in the codebase exists to make it noticeable by
something other than a person.

## Repository layout

| Path | Description |
| --- | --- |
| [`ksav/`](ksav) | **The product.** The Rust Typst engine, the CodeMirror SPA (`ksav/app`), the WASM crate (`ksav/wasm`), the Tauri desktop shell (`ksav/app/src-tauri`), and packaging. Start here. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Clone to landed change: the setup, the gate, and the rules every change is bound by. |
| [`docs/`](docs) | The pages for readers — [starting out](docs/start-here.md), [coming from Word](docs/from-word.md), [the keyboard](docs/shortcuts.md), and [the seam with Girsa](docs/girsa.md). |
| [`flake.nix`](flake.nix) | A Nix dev shell carrying the engine, editor, wasm and Emacs toolchains at the versions CI pins. |
| [`spec.md`](spec.md) | The note options — eleven, and the ground rule that produces exactly eleven. A living document. |
| [`decisions/`](decisions/README.md) | **The record.** Every dated wave, audit and resolution, each true on its date and never edited afterwards. Kept apart from the documentation on purpose: a spec is edited in place, a log is written once. |
| `assets/` (per-crate), `licenses/`, `THIRD-PARTY-NOTICES.md` | Bundled fonts and lexicons live under `ksav/engine/assets`; third-party license texts and notices are at the repo root. |

## License

Dual-licensed under **MIT OR Apache-2.0** (the Rust ecosystem convention); see
[`LICENSE-MIT`](LICENSE-MIT) and [`LICENSE-APACHE`](LICENSE-APACHE). Bundled fonts
and lexicons carry their own permissive licenses, reproduced in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and [`licenses/`](licenses) and
rendered inside the app.

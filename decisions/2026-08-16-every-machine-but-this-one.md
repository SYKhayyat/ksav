# Every machine but this one

*16 August 2026.*

Asked for after the structural-children work: *"i need this to work on every
os — i have wsl"*, then *"i want this also to work on nixos"*.

Ksav builds out of four toolchains — a Rust engine, a Node editor, a wasm bundle
and a Tauri desktop shell — and the only statement of which versions those are
was `.github/workflows/ci.yml`. That is a description of GitHub's runners, not
something a person can enter. It is enough on a distribution that follows the
FHS, where you install the four by hand and are roughly right. It is not enough
on NixOS, where a prebuilt dynamically-linked binary does not run out of the box
— a stock `node` tarball there answers *"NixOS cannot run dynamically linked
executables intended for generic linux environments"* and stops.

## What was actually checked, rather than reasoned about

Everything below was run, not inferred, and the last four rows are on **NixOS
itself** — NixOS-WSL 2605.7.2, installed for this, because a Nix shell on Fedora
proves the derivations and not the thing that actually distinguishes NixOS.

| claim | how it was settled |
|---|---|
| line endings survive a Linux checkout | `git clone` into WSL; **0 CR bytes** in the prelude, `mode.ts`, `children.rs` |
| the engine passes on Linux | `cargo test` in WSL Ubuntu: **761 tests, 44 binaries, 0 failures** — identical to Windows |
| the dev shell evaluates everywhere | `nix flake check --all-systems` |
| a generic prebuilt binary really does fail there | a stock `node` tarball on NixOS: *"NixOS cannot run dynamically linked executables intended for generic linux environments"* |
| the dev shell builds **on NixOS** | `nix develop` → Node 24.19.0, cargo 1.97.0, wasm-pack 0.15.0, Emacs 30.2 |
| the editor passes **on NixOS** | `npm ci` exit 0, then **6,444 assertions, 0 failed** |
| the engine passes **on NixOS** | **761 tests, 44 binaries, 0 failures** |
| the wasm bundle builds **on NixOS** | `wasm-pack build --release` → a 29 MB artefact |
| the desktop shell resolves **on NixOS** | `nix develop .#desktop` → `pkg-config` finds webkit2gtk-4.1, GTK 3.24.52, and Tauri's `cargo check` is clean |

The `npm ci` row is the one worth pausing on. It downloads prebuilt binaries —
esbuild among them — in a shell where, minutes earlier, a prebuilt `node` had
been refused outright. They run because they are static or because the shell
supplies what they link against; the point is that this was a question with a
real chance of going the other way, and it was answered by running it.

## The flake

`nix develop` for engine + editor + wasm, `nix develop .#desktop` for the Tauri
GTK/WebKit deps on top. Three systems: `x86_64-linux`, `aarch64-linux`,
`aarch64-darwin`.

`x86_64-darwin` — an Intel Mac — is deliberately absent. Not an oversight:
nixpkgs 26.11 has dropped support for it, so listing it produces a shell that
cannot evaluate, and `nix flake check --all-systems` says so in one line. An
absent claim beats a broken one.

wasm-pack comes from nixpkgs rather than from the `curl | sh` installer the
workflows use. That installer is right for a GitHub runner and cannot work on
NixOS, for the reason above. The workflows keep it; the shell does not need it.

**And that was not enough, which is the whole argument for testing on the real
thing.** The first shell shipped wasm-pack and no linker: `wasm-pack build` on
NixOS compiled every dependency and then stopped on

```
error: linker `lld` not found
```

rustc normally carries `rust-lld` in its own sysroot and the nixpkgs build does
not. So this file's stated reason for existing — the wasm build is unreachable
on NixOS — was still true of the file itself, one layer down, and nothing
noticed because the engine's 761 tests passed in the same shell: a native build
uses the stdenv cc and never wants lld at all. `lld` is in the shell now.

## What the flake found on its way in

**Node 20 has been End-of-Life since 2026-04-30.** Current nixpkgs has no
`nodejs_20` — the attribute name is still there and evaluating it throws, which
is how a `nix flake check` surfaced a fact about this repository's CI that
nothing in this repository was in a position to notice. All three workflows
pinned 20, on eleven lines.

[The pins nobody was watching](2026-08-16-the-pins-nobody-was-watching.md),
written this morning, had explicitly left that pin alone: *"CI pins 20 because
that is the floor the editor claims."* Both halves of that turn out to be wrong.
`package.json` declares no `engines`, so nothing claims 20; and the rule the pin
was thought to protect — a test must import from `.tmp-test/`, never `../src/`,
because Node 20 cannot strip TypeScript types and so a direct `.ts` import kills
the job — has had its own sweep in `runner.test.mjs` since the day it was
written. The rule never depended on the runtime.

So `node-version` is 24 across all three workflows, and the flake pins the same.

## The mistake worth recording

I diagnosed that sweep as *missing*, and wrote a second one. It failed on its
first run, on its own comment — the line documenting the pattern contained the
pattern — and the run that told me so also printed
`no test imports out of src/ directly`, which is the fence that already existed,
twenty lines further up the same file, comment-stripping included.

A duplicate fence is not a harmless extra. Two spellings of one rule is the
defect family this repository is named for, and it would have been added by the
person writing a record about not doing that. What survives from the attempt is
one line: the existing sweep matched `from "../src/…"` and not
`import("../src/…")`, so it read the spelling that had gone wrong once rather
than the rule it was written for. Both now.

## Not settled

- **The Emacs client** is in the shell but its live tests were not run there.
  CI runs `emacs-nox` 27.1; the shell gets 30.2, and `HANDOFF.md` already notes
  those two disagree about `image-size`.

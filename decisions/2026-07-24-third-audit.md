# Third audit — 24 July 2026

The first two audits read the code. This one ran it.

That distinction is the whole value of this pass. Both previous lists ended by
naming things they could not check — "the installers and the release workflow:
never run"; "the wasm build end to end … judged from its source rather than from
use" — and those unchecked paths are two of the three ways Ksav actually ships.
A defect there would have reached a writer without anything in this repository
noticing. So the method here was to build every artefact, start the server, and
push real and hostile documents through it.

**Verdict: ready.** No blockers. The engine is correct, bounded, fast at the size
of a real sefer, and safe against the injection its own escaping exists to stop.

What stands between Ksav and its readers is now a single unpressed button: every
installer has been built by CI on every platform, and the release they are
attached to was never published. That is the whole remaining distance.

## What was verified by running it

| Check | Result |
|---|---|
| Both suites, cold | 389 app assertions (9 files) + 154 engine tests, green |
| Typecheck, SPA build | Clean |
| All 10 bundled templates | Compile: 0 errors, 0 warnings |
| All 104 registry commands | 103 compile; the one that does not is `#תמונה`, whose placeholder legitimately needs a real file |
| Injection via `font` / `header` / `paper` / `lang` | Every attempt to close the Typst literal and call `#panic` was neutralised |
| `NaN`, `1e308`, negative margins, `columns: 5000` | Rejected or clamped; no silently-garbage page |
| 170-page sefer (497 KB) | Compiles in 5.6 s |
| Edit loop, 68-page sefer | ~1.0 s per recompile — the memoization fix holds at scale |
| Runaway `#for` (4M iterations) | Cut at 20.1 s; `/commands` answered in 0.00 s immediately after; normal compiles unaffected |
| 8 concurrent compiles | 0.21 s total |
| Bilingual UI | 300 keys per language, symmetric, every static call site resolves (302 after the fixes below) |
| Secrets in tracked files | None |

**The two paths nothing had ever exercised, both now passing.**

*The browser engine.* Built from the README's own instructions, loaded, and put
through the surface a writer touches first: all ten templates compiled, both
lexicons answered, suggestions came back. It works. It had never been shown to.

*The desktop installers.* `npm run tauri build` produced `Ksav_0.1.0_x64_en-US.msi`
and `Ksav_0.1.0_x64-setup.exe` from the current tree, cleanly. The claim that the
installers "have never been run" was true when written and is no longer — and it
turned out to be more thoroughly false than this audit first knew; see *Two of
the oldest items closed themselves mid-audit* below.

## What it found, and what was done

**1. The browser build had no CI job — fixed.** One of three shipping modes, and
the only one nothing checked. `app/src/wasmpkg/` is git-ignored and built
locally, so the entire no-server path could break and every job would still be
green; this audit verified it by hand, which is not a thing that repeats. There
is now a `wasm` job in `ci.yml` that builds the crate for
`wasm32-unknown-unknown`, produces the offline Vite bundle (a different module
graph from the default build, so the default build passing said nothing about
it), and then *runs* the module — `.github/scripts/wasm-smoke.mjs` compiles every
template and checks both lexicons. Building only proves it linked; a wasm binary
that instantiates and panics on first use would pass every other step.

**2. A wrong-typed `body` still rendered a blank page as success — fixed.**
`engine/src/lib.rs`. The commit *"A request that doesn't parse is an error, not a
blank page"* fixed unparseable JSON and stopped there. JSON that parsed and
carried no usable `body` — absent, `null`, a number, an object — still fell
through `unwrap_or("")` and compiled one empty page reported as `ok: true`: the
same wiped preview that looks like a successful render, reached by a different
route. Both routes now answer through one `malformed_request` helper. An *empty
string* stays legitimate, because that is a new document, and a test pins that
distinction so the fix cannot later be over-applied.

**3. A registry failure left an empty toolbar in silence — fixed.**
`app/src/main.ts`. `catch { /* registries optional for first paint */ }` — true
of the paint, false of the app: the writer got an empty ribbon, empty menus, an
empty palette, no completions, nothing said, and nothing that would ever fetch
them again. It now retries once, and if that fails too hands the retry to the
writer. The notice is a banner rather than a status line for a mechanical reason
as much as a design one: boot runs the first compile immediately afterwards and
that compile *writes the status bar*, so a message left there would have flashed
once and vanished — barely better than silence.

That fix exposed a second one. The save-error banner and this new one were both
`position: fixed; bottom: 0`, so they occupied the same pixels and whichever came
last simply hid the other — a writer could be told their toolbar was empty and
never told their work was not being saved. Both now render into one `.notices`
stack (`noticeHost` in `dom.ts`); the container is pinned, the banners inside it
are ordinary blocks, and no notice can bury another.

**4. The README contradicted itself — fixed.** It is the page anyone evaluating
this reads first, and its numbers had drifted: "8 templates" against 10 (and its
own correct "10" eleven lines earlier), "53 commands" against 104 (likewise), 317
assertions and 92 engine tests against 389 and 155, a "~23 MB" wasm chunk that
measures 28.1 MB raw and 10.6 MB gzipped. All corrected against measurement, not
against memory.

**5. A stray tooling log was committed — removed.**
`engine/assets/fonts/.gstack/browse-audit.jsonl`: a browser-automation log,
tracked, sitting inside the directory whose font licences matter. `.gstack/` was
already in `.gitignore`; the file predated the rule.

**6. A file was permanently "modified" with an empty diff — fixed, and it was not
what it looked like.** The audit first read this as line-ending drift. It was
not: index, worktree and HEAD blobs were byte-identical. The cause was a global
`core.autocrlf=true` fighting this repository's own `.gitattributes eol=lf`, so
the stat check never settled. Set `core.autocrlf false` locally and it is gone.
`.gitattributes` now explains this, because the next person to clone on Windows
will hit it and will also assume it is a real change.

## Two of the oldest items closed themselves mid-audit

This section was first written to say "no git remote, so CI and the release
workflows have never executed" and "macOS installers have never been built".
Both were true of the tree being audited and both stopped being true while the
audit was being written: a remote appeared on 23 July, and pushing this work's
own commit was the thing that revealed it. Recorded rather than quietly
corrected, because an audit that silently rewrites its own findings is worth
less than one that shows where it was overtaken.

What is actually true now, checked against the GitHub API rather than assumed:

- **CI runs on every push and is green** — editor, engine, desktop shell and the
  new browser-engine job, all four passing on this commit. The wasm job is the
  slow one at 7.5 minutes cold, nearly all of it the `wasm32-unknown-unknown`
  build; the Rust cache should take most of that back on later runs.
- **The release matrix has run on every platform.** `v0.1.0` drove `release.yml`
  to success on `windows-latest`, `ubuntu-22.04` and *both* macOS architectures.
  The `.dmg` that could not be cross-built here has been built there.

## What still stands

- **The release is a draft, so nothing is downloadable.** Found by asking the
  API rather than by reading the workflow, and it is the most consequential
  thing in this audit: `/releases` returns zero published releases and
  `/releases/latest` is a 404, so the Download link at the top of the root
  README shows a visitor an empty page. Every installer exists. Nobody can
  reach one. `releaseDraft: true` is a deliberate and correct default — a
  release should be looked at before it is public — but the looking never
  happened. This is a button, not a task.
- **No code signing,** so every operating system blocks the first launch. The
  README and the release body both say which button to press, which is the
  honest interim answer, not a fix.
- **A runaway compile is contained but not reclaimed** on the two native builds.
  It can no longer hold anyone up — this audit confirmed that by measurement, not
  by argument — but the abandoned work does finish on its own thread.
- **Page setup is still app-wide.**
- **No bochur has written a real sefer in it.** Three audits have now said this
  is the item that matters most. Nothing above substitutes for it, and now that
  the remote, the CI and the installers have all stopped being excuses, it is
  very nearly the only question left.

## What could not be checked

- **The editor itself, in a browser.** Every claim here about the UI comes from
  the source and from 389 headless assertions, not from clicking. That is the
  largest remaining gap in this audit's own coverage.
- **The macOS and Linux installers.**

## Tests

`app`: **389** assertions across 9 files. `engine`: 154 → **155** (new: a request
whose body is missing or is not text is an error, and an empty body is still a
document). `clippy -D warnings` clean, both suites green, the app and the desktop
bundles build.

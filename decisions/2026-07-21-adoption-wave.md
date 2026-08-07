# Adoption Wave — "why a bochur still wouldn't switch" (2026-07-21)

The audit above closed every *capability* gap. This wave closes the reasons a
real yeshiva bochur would still open Word instead, which turned out not to be
capability gaps at all. Assessed honestly, the blockers ranked:

1. **He cannot install it.** No installer exists. If getting Ksav involves cargo,
   npm, or a dev server on a port, then for almost everyone the software does not
   exist. This is the single biggest one and always was.
2. **It cannot hand a document back.** Everything a bochur writes goes *somewhere* —
   to a rebbi, a chavrusa, the kovetz editor, a printer — and all of them want
   Word. PDF-only means he can send a finished thing but nobody can touch it.
   `.docx` from Typst remains infeasible; but that was never the requirement. The
   requirement is "the person I send it to can edit it", and HTML reaches Word.
3. **A dropped bracket feels like programming.** Typst reports an unclosed `[` at
   *end of file*, thousands of characters from the mistake, and the preview goes
   blank. It is the one moment that breaks the illusion of a writing tool.

Not in this wave, and honestly out of reach for now: cloud sync, real-time
collaboration, mobile, and the bus factor. Those need infrastructure and other
people, not a commit.

## 1. Bracket healing  ✅

`app/src/brackets.ts` — one pure, dependency-free scan (text in, findings out)
feeding three layers, so the gutter, the fix and the preview can never disagree
about what is wrong.

- [x] **Live lint** — mark the *opener that never closes*, before any compile,
      naming its command ("#הערה is never closed"). Points at the cause, not at
      EOF. Also catches stray closers and an unterminated `/*`.
- [x] **One-click heal** — insert the closer where it belongs. Inline commands
      (`שלום #הדגשה[עולם`) close at end of line; block commands (`#הערה[` alone on
      its line) close at the end of the block — the first blank line or the next
      `#command` at the same-or-shallower indent.
- [x] **Speculative preview** — when the document is momentarily unbalanced,
      compile the *healed* copy so the page keeps rendering, with a banner saying
      the preview assumes a closer. A stray keystroke must never blank the page.

**Superseded, 6 August 2026.** This used to read: *"The scanner must agree with
`matchGroup` in `ksav-lang.ts` on the gershayim trade-off: `"` is **not** a string
delimiter, because רש"י and שו"ע are everywhere and pairing quotes swallows whole
tables."* Two things were wrong with it. It was a rule asserted in prose between
two scanners that could drift — and they did, in both directions: `lists.ts`
paired quotes and switched every list operation off the moment a writer typed
רש״י, while `brackets.ts` did not and therefore read the `)` inside
`#הערה_זרם("a)b")` as a real closer, reported a valid document broken, and
*deleted the real closing paren* when the writer pressed heal.

And the trade-off was false. Typst has no single rule: `"` is an ordinary
character in content mode (`[…]`) and a string delimiter in code mode (`(…)`,
`{…}`), so tracking context gets both and gives up neither. There is now one
scanner — `app/src/spans.ts` — every consumer reads it, and `test/spans.test.mjs`
fails if a second one appears.

## 2. Word handoff  ✅

- [x] **Export → Word (.doc)** — wrap Typst's own reflowable HTML export in the
      Word-HTML envelope (mso namespaces + `<w:WordDocument>`), RTL-aware, page
      size and margins carried from the document settings. Word opens it and
      converts it to a fully editable document.
- [x] **Copy for Word** — the same HTML onto the clipboard as `text/html`, so a
      paste into an open Word window keeps the formatting.
- [x] Say plainly what does not survive: the multi-stream apparatus, bands and
      side-columns flatten. Prose, headings, bold/italic, lists, tables and plain
      footnotes make it across. That is the honest 80%, and nobody edits an
      eleven-layer apparatus in Word anyway.

## 3. Installers  🟡

`tauri.conf.json` already has `bundle.active` and `targets: "all"`, so the
bundlers are wired; nothing has ever been built.

- [x] **Windows** — `.msi` (WiX, 19 MB) + `.exe` (NSIS, 14 MB), both built and the
      packaged `app.exe` smoke-tested: it launches standalone, spawns WebView2 and
      renders the embedded UI with no dev server.
- [x] **Linux** — `.deb` / `.AppImage` through Docker over WSL
      (`ksav/packaging/build-linux.sh`). Pinned to Ubuntu 22.04 because glibc is
      backward but not forward compatible, so building on a newer distro would
      silently drop everyone on an older one.
- [ ] **macOS** — `.dmg`, both architectures. Cannot be cross-built; only the CI
      job can produce it, so it stays unbuilt until the repo has a remote.
- [x] **CI matrix** — `.github/workflows/release.yml` builds all four targets
      (Windows, Linux, macOS arm64 + x86_64) on tag push and attaches them to a
      draft release. Written but never executed: **the repo still has no git
      remote**, which is now the only thing standing between here and a macOS
      build.

**Signing is unresolved and costs money.** Unsigned, Windows SmartScreen says
"unrecognized app" and macOS says "unidentified developer". A bochur meeting that
dialog is nearly as blocked as one with no installer, so shipping unsigned buys
back less trust than it looks. Apple Developer is $99/yr; a Windows OV
certificate is ~$200–400/yr. Ship unsigned with install instructions as a
stopgap, but treat signing as the real fix.

## What this wave did not fix

Stated plainly, because the honest list is the useful one:

- **Signing.** Every installer above is unsigned. Windows SmartScreen and macOS
  Gatekeeper both warn on first run, and a bochur meeting that dialog is nearly
  as blocked as one with no installer at all. Certificates cost money; there is
  no engineering workaround.
- **No macOS build yet** — needs the CI job, which needs a remote.
- **Still nobody has used it.** Zero bochurim have written a real document in
  Ksav. The installers make that testable for the first time; five people for one
  zman is worth more than the next five features.
- **Cloud sync, collaboration, mobile, bus factor.** Unchanged and out of reach
  without infrastructure and other people. Open-sourcing the repo is the only
  real answer to the last one.

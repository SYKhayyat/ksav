# PLAN — ksav

Work top to bottom. A milestone is done when every box in it is checked **and**
its exit test is true. Decision gates (◆) are not code work: when the queue
reaches one, stop and ask the owner. Don't decide a gate from inside a worker
session.

Worker loop (see `AI_ISSUE_ROUTING.md`): take the top unchecked item that is
not behind an open gate. **Clearing technical debt always comes first:** the
Debt section sits above every milestone, and new debt is filed there, not
deferred behind a pay condition.
Fix only that issue and its resolving test, commit,
check the box here, and stop. New issues go into the milestone where they
block something, not at the end. The milestones are ordered from foundations
to features, so "insert into the right phase" still applies. Each milestone is
a phase.

History: the plan before this rewrite, including the full record of the
`main.ts` split waves, the audit sweeps and the old per-session notes, is
archived verbatim in `decisions/2026-11-15-the-plan-before-the-milestones.md`.

Targets: NixOS and Windows for the owner, then generic Linux and Windows for
everyone else. Linux packaging stays distro-neutral, with no Nix-only paths.

---

## Debt — always first

Clear these before any milestone work. The older ledger, with the reasons each
item was accepted at the time, is `decisions/2026-10-22-accepted-debts.md`.

- [ ] #163 multi-preview sync.
- [ ] #164 the `e.code` / `e.key` split.
- [x] #32 trim the test and documentation tower. Closed as overtaken: measured on 2026-11-17, `run.mjs`'s sweep is the only fence on the *value* of the two runtime counts (deleting it leaves a wrong README count green; `documentation.test.mjs` says at both sites that it cannot know them), and the `assert_same_page` oracles it wanted to redirect into already exist — `engine/tests/deferred_notes.rs`, eleven note layouts compared run for run.
- [x] #188 `main.ts` size (left over from #22): 3,536 lines against a target of about 1,500. **Done** — 1,457, in nine waves: `editorstate.ts` (`3f192a9`, the extension stack), `appheader.ts` (`3b75967`, the header), `settings.ts` (`9c68270`, the settings value write), `layout.ts` (`32d401d`, the window composition), `boot.ts` (`e70bfaa`, the boot sequence), `editorcommands.ts` (`fecd114`, thirteen structure commands), `settings.ts`+`layout.ts` (`0594358`, the setting reader and the chrome rebuild), `actionsurface.ts` (`50f1d3a`, the action table and dispatcher). Wave 3 bought separation rather than subtraction — the settings change set stayed in main because moving it closed 28 import cycles. `test/runner.test.mjs` now asserts `main.ts` stays at or under 1,500 (`53a296d`). `installHooks` (187 lines) is still in main but no longer holds its size up. Every new module is imported by a test rather than grepped.

## M0 — Green and honest

Exit: CI on `main` is fully green, and every check that CI reports actually ran.

- [ ] #189 desktop shell job is red: the webview never reaches `setup` on the runner. #171's layers 1–2 and its reporting are done (`37cd10f`), which is how this was narrowed to the webview rather than the page.
- [ ] #171 the umbrella #189 was carved out of. Its remaining scope is #189, so it closes when that does.
- [x] #193 the measurement layer assumes Linux three ways: the gate skips `shell-clippy`/`shell-tests` on Windows although both pass there (measured), the render check refuses to start where a display always exists, and it looks for `app` rather than `app.exe`. Together: no shell check at all on the owner's main platform.
- [x] #190 the render check deletes its evidence and the CI job uploads none. Fix this before #189 is chased any further, or every attempt costs a push and returns one warning line.
- [x] #191 `render_probe` writes the boot record only when the measurement path is set, so "did a window ever open" is the one question it cannot answer alone.
- [x] #192 `renderEnv`'s `platform` defaults to the caller's machine, so a test that omits it asserts about the runner and stays green there.
- [x] #187 gate sweeps read workflows as lines, not as a graph. The parser landed in 7ed8d69; it now reads both matrix spellings and reports what it could not understand (`ad52d40`).
- [x] #186 the "Run it" step in `release.yml` is broken on Windows under pwsh. Anchored on `$GITHUB_WORKSPACE`, the Windows leg runs it under `pwsh`, and the gate refuses a bare relative path (`818d4e5`).
- [ ] #198 the assembled app's two export checks still wait for a Playwright download, which #127 removed. Fixed in `.github/scripts/acceptance.mjs`: the export steps install a `ksav_save_export` stand-in (so the *desktop* route runs, which is the one that ships), decode the base64 body and assert a PDF, the filename and the dialog's filter — then remove the stand-in so later steps are a browser again.
- [ ] Check #140 (the audit index) and close it if nothing is left open. As of 2026-11-15 every child was closed except ledger debts #163 and #164, which are in the Debt section above. Ask the owner before closing.
- [ ] Check #22 (the `main.ts` split) and close it if every split wave is done. As of 2026-11-15 they were, but `main.ts` was still about 3,500 lines against a target of about 1,500. That gap is in the Debt section above. Ask the owner before closing.

## ◆ D0 — Do we decide the UI and backend direction now?

Recommendation: **no.** You can't judge a frontend rewrite (#117, #42) or a
second typesetting backend (#184) until you have used the current app
daily for a few weeks. What D0 settles now:

- Freeze large changes to the current UI chrome. M2 fixes only.
- The window model (#138) and the document model (#128) are settled in M2,
  because any future frontend needs the same answers.
- The real decision is D1, after M2.

If the answer is "decide now", jump to D1 and come back.

## M1 — Release v0.2

Exit: a tagged v0.2 with installers that a clean Windows machine and a
non-Nix Linux machine can install and launch, and the UAT fixes confirmed in
the real app.

- [x] #133 Windows: clean build from scratch, plus a smoke test of the packaged app (launch, open, save, export).
  Done for a clean clone on 2026-11-17: `tauri build` → NSIS → silent install → Start-menu shortcut → a window with a bound desk. Two findings filed on the way: #194 (the installer cannot be driven from Git Bash) and #195 (a stale shortcut is silent, which is UAT 28's symptom). The owner's own machine still needs the last acceptance line.
- [ ] #134 verify UAT items 2, 3, 4, 5, 10, 12, 16, 17 in the real app, not only in tests.
- [x] #194 the NSIS installer cannot be driven from Git Bash: `/S` is mangled, the run hangs with no output and installs nothing. Fixed (`67b165e`): `gate.test.mjs` refuses a bare invocation and `docs/troubleshooting.md` says what to run instead.
- [x] #196 the render check calls a single-instance handover "the webview did not start": a clean exit 0 is read as a webview fault, and that is the same sentence #189 is open about.
- [x] #195 a stale shortcut or `ksav://` registration pointing at a deleted binary is silent — the measured shape of UAT 28's "the shortcut did not open Ksav".
- [ ] Generic Linux artifact from `ksav/packaging/build-linux.sh` (AppImage or tarball), tested on a non-Nix distro.
- [ ] Windows NSIS installer built by `release.yml` and attached to the release.
- [ ] Tag v0.2.0. Write short release notes listing what changed since v0.1.1.

## M2 — Reliable for your own notes

Exit: the owner has used ksav as the only tool for real notes, on both NixOS
and Windows, for **two weeks** without losing text, and the second UAT pass
(#14) passes.

- [x] #138 Emacs-like open/window model: `openIn` now defaults to `current` (`C-x b`), the three answers are stated as Emacs commands at the setting, the funnel and `docs/start-here.md`, and `tabs.showing`'s focused-pane rule is written down and asserted. Hands-on confirmation of the felt behaviour rides with #134.
- [ ] #128 document identity: one Documents menu instead of two (Documents and File), and labelled rows instead of icon-only rows. Keep the shape compatible with #117. **Code done** (`84b11be`, `eea216b`): one `docTitle()` for the name line, `docFileState` for its honest suffixes, the Documents taxonomy as data with a persistent `⧉ / ⌄ / ×` legend, and *File ▸ New document* removed rather than marked, on the owner's call. Open for the owner's reading pass — the last acceptance line is a judgement about reading on screen, which no tool here can make.
- [x] #127 native PDF destination picker on export — every export asks `saveExportAs` (#127), desktop dialog + browser fallback, cancel silent.
- [ ] #126 semantic navigation: word and paragraph motion skips Typst markup. **Code done** (`4283990`, `6cb2029`): `motion.ts` (the boundary function, fenced row by row from the spec) and `sourcemotion.ts` (the `sourceMotions` setting, `Ctrl`+arrows, `Alt`+arrows as the raw escape, `Shift` on the same stops). Shipped as `"raw"` on purpose — flipping the default is a felt judgement, and it is one line once the owner has arrowed around a document with it on.
- [x] #183 `assembleScan` allocates on every keystroke. Measured 2026-11-17: 3.3 ms per keystroke at a 235-page sefer and 18 ms at 993 pages, and removing the report's top line (`byStart.set`, 15,390 insertions) moves the scan by less than the noise in either direction — so the cost is allocation across the whole scan and `lexCore`, not the assembly's structures. No lag at any realistic size; not rewritten.
- [ ] Data safety, verified on both platforms: save, autosave, crash recovery, a full disk, a read-only file, and a file changed outside ksav. File an issue for each failure here.
- [ ] #14 second human UAT pass by the owner, on the real installed build.
- [ ] Tag v0.2.x as the "daily driver" release.

## ◆ D1 — Frontend × backend architecture

When: after M2's two weeks of daily use, before anyone else is invited.
Inputs: the M2 usage notes, plus one small spike for each serious option.
Decide together, because the frontend and backend choices constrain each other:

- Frontend: keep the current CodeMirror/Tauri app, LibreOffice-style UX (#8, #9), Wordcraft egui (#117), all-Rust rewrite (#42).
- Workflow and views: Leo-style outline workflow (#11), prose-only view (#118).
- Backend: Typst only, or add LuaLaTeX + reledmac / ConTeXt, and a structured editor (#184).

Output: a dated record in `decisions/`. If the result is a rewrite, insert
the rewrite as its own milestone here, before M3, and re-scope M3 to audit the new
code instead.

## M3 — Audit

Exit: a fresh audit with every finding either fixed or filed in the Debt
section at the top of this plan.

- [ ] Engine (Rust/Typst) audit: correctness, panics on bad input, and export fidelity.
- [x] Tauri shell audit (it was not covered by the #140 sweep): IPC surface, file-system scope, updater. `AUDIT-shell-2026-11-17.md` — capability grant is `core:default` only, every file op keyed on a dialog-picked path (normalized, traversal tested), `ksav_call` reaches the seven Native services but bounded by fixed git args and `protocol.ext.allow=never`, preview SVG sanitized by allow-list, prose tables escape per character, one CSP file fenced by build.rs with `https://api.github.com` as the only egress. Remaining work in it is #131 (signed builds).
- [ ] Security: what an opened document can make the app do (links, includes, paths).
- [ ] Data integrity: round-trip every saved format; check that nothing is silently dropped.
  Started from the export side (`3662bb4`, #199): a comparison of every prose word a
  document prints against the words an export contains, over the engine's own 14
  documents, found two silent-loss defects — `#פסוק[ref][verse]` and
  `#הגדרה[term][definition]` exported only their first body, and a quoted
  `#note_named["…"]` kept its quotes where its `#note_body["…"]` did not, so the note
  was deleted on export and called broken by the lint. Both fixed, fenced in
  `app/test/integrity.test.mjs`. The import half (docx/odt → Ksav → export) is still
  open, and #200 holds the formatting follow-up the fix surfaced.
- [ ] Run `lamdan` across the whole repo once and triage its findings into this plan.

## ◆ D2 — Before others use it

Decide: product identity and name (#39), Girsa interop (#37, #38), who the first
users are, and how they get the app (download page, auto-update, support channel).

## M4a — Closed beta (technical friends), v0.3

Exit: three or more friends have each written a real document, and their reports
are triaged into this plan.

- [ ] Signed or at least checksum-verified builds, with an auto-update path.
- [ ] A way to send feedback from inside the app (or a clear link to it).
- [ ] A one-page "start here" guide for the first document.
- [ ] Tag v0.3.0 and invite the friends.

## M4b — Public release (non-technical Hebrew writers), v1.0

Exit: someone who is not the owner completes #14 alone, from install to export.

- [ ] Code-signed Windows installer (no SmartScreen wall).
- [ ] Onboarding inside the app: an example document and the first steps, in Hebrew.
- [ ] A help system and an error-message pass written for non-technical readers.
- [ ] #14 run by an outside tester.
- [ ] Tag v1.0.0 and publish.

## ◆ D3 / Features — after beta feedback

Order these by what beta users actually asked for. Below is the current guess.
Decide #184 here if D1 deferred it.

- [ ] #43 top/bottom streams
- [ ] #65 Vilna-style wrap layout
- [ ] #64 commentary ordering
- [ ] #68 headings into commentary
- [ ] #69 templated headings
- [ ] #66 smart navigation
- [ ] #44 nikud/shemos handling on export

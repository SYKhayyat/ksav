# Ksav — Production Readiness Assessment & Fix List

> ## Standard of work
>
> **Every item in this document must be finished to the highest standard of perfection.
> Never compromise.**
>
> No shortcuts, no "good enough for now", no hiding a broken feature behind a flag and
> calling it done. Where something is half-built, finish it — completely, correctly, and
> in a way that holds up under a real writer using it for real work. Where a fix reveals a
> deeper problem, fix the deeper problem. Where a test would catch a regression, write the
> test. Where the honest answer is that something cannot be done, say so plainly and in
> full, and do everything else.
>
> The bar is not "the bug no longer reproduces." The bar is that the code, the behaviour,
> and the reasoning behind both are ones you would be glad to have someone read.

---

I read the engine, the SPA, the Typst prelude and the packaging, ran both test suites, and exercised the running app in a browser. Here's the assessment.

## Verdict

**Not ready.** The engine is genuinely production-grade. The application shell around it is not, and there is a reproducible silent-data-loss bug that disqualifies it on its own. Call it 1–2 weeks of focused work to reach "safe for five pilot users."

## What's actually strong

Don't let the list below obscure this. The Rust side is better than most shipping code:

- **The core bet is right.** Every Ksav command is a real Typst function (`engine/typst/ksav.typ`), so Typst parses the document and arbitrary cross-nesting works for free. No hand-rolled parser to maintain, no divergence between what the editor thinks and what renders.
- **The tests assert rendered geometry, not exit codes.** `engine/tests/apparatus.rs` checks *where things landed on the page* — `sidenotes_align_to_their_own_marker_line`, `page_band_apparatus_stays_on_the_paper`, `two_notes_with_identical_text_stay_two_notes`. That is a much higher bar than `assert!(out.ok())`, and it caught real bugs (the content-key dedup that merged two notes reading "עיין שם").
- 0 warnings, 0 TODOs, 0 `unwrap()`, one `expect()` in the whole engine. ~85 tests pass.
- **The lexicon decision is well-reasoned and documented.** `spell.rs` explains why Hspell was rejected (AGPL *and* it flags 26% of Talmudic Aramaic as wrong), and `tools/build_lexicon.py` documents the PD provenance of every corpus, including why Talmud Bavli is absent.
- The file sandbox holds: `#read("C:/Windows/win.ini")` from a document returns "file not found."
- i18n is complete — 207 keys, exact HE/EN parity, every used key defined.

## Blockers

**1. Storage exhaustion silently stops saving and rendering, permanently.** I reproduced this in the running app:

```
status:    "מרנדר…"        ← stuck forever
saved doc: 29,978 chars    ← 400,000 chars typed after this were never saved
rejection: QuotaExceededError
console errors: none
```

`docs.putDoc(currentDoc)` at `app/src/main.ts:749` sits *before* the `try` that starts at line 761. When `localStorage` fills, it throws, `runCompile` never reaches its `catch`, the status line stays on "rendering…", and every subsequent keystroke repeats the failure. The writer sees a slow render, not a failure, and keeps typing into a buffer that is no longer persisted.

Getting there is ordinary, not adversarial. I measured the quota at ~4.5 MB. Meanwhile:
- `MAX_ASSET_BYTES` is 4 MB (`main.ts:2524`) — base64 makes that 5.3 MB, larger than the entire quota. The guard meant to prevent this is set above the ceiling it protects.
- `takeSnapshot` (`main.ts:1590`) stores **80 full copies of the document** under one key, auto-firing every 3 minutes with no size cap. A 200 KB sefer alone is 16 MB of history.

**2. Version history is global, not per document.** `Snapshot` is `{t, body}` (`main.ts:1579`) in a single `ksav.history` key. There is no document id in the record, so history can't even be filtered. Open document A, restore a snapshot that came from document B, and A's text is gone. Confirmed structurally in storage.

**3. The desktop build compiles on the UI thread.** `src-tauri/src/lib.rs:7, 91, 97` declare `ksav_compile`, `ksav_spell` and `ksav_suggest` as synchronous `#[tauri::command] fn` — Tauri runs those on the main thread. The file dialogs at `:39` and `:61` are correctly `async fn`, so the distinction was understood; it just wasn't applied to the expensive calls. Measured compile times were 0.4–2.9 s for 13–43 pages, so the window freezes for that long on every pause in typing. The installers are the flagship distribution. Same problem in `wasm/src/lib.rs:15` — no worker, so the "runs in the browser with no server" build blocks the UI thread too.

**4. No license, anywhere.** No LICENSE or COPYING file, `license = ""` in `src-tauri/Cargo.toml`, no license field in the engine or wasm manifests or either `package.json`. Default is all-rights-reserved — nobody can legally use or fork it, which also forecloses the open-sourcing that spec.md names as the answer to the bus factor. Separately, the six bundled fonts are OFL/GUST; both licences require the notice to accompany redistribution, and `release.yml` exists specifically to publish installers. The lexicon provenance is meticulous by comparison, so this reads as an omission rather than a position.

**5. Still no git remote.** CI has never run, there is no macOS build, and one machine holds the only copy of the work.

## Serious, not blocking

- **The server is strictly serial** (`engine/src/server.rs:73`). Four concurrent compiles returned in 469/868/1255/1667 ms — a perfect staircase. Compile and spell-check block each other; there are no timeouts, no cancellation, and `read_to_string` at `:80` reads request bodies unbounded.
- **Spell-check is 20× slower for anyone who ever used "add to dictionary."** `for_request` (`spell.rs:374`) clones the entire 269,385-entry `HashSet<String>` whenever `user_words` is non-empty. Measured 9 ms → 183 ms, on every check, forever. The `OnceLock` two functions above exists to avoid exactly this.
- **4.5 MB response for a 16-page document**, including 292 KB of base64 PDF that nothing on screen consumes. `lib.rs:342` regenerates the PDF on every preview compile. That's a free win.
- **No cancellation of superseded compiles** (`runCompile`, `main.ts:730`). With 1–2 s compiles behind a 250 ms debounce, two are routinely in flight and results are applied in arrival order — a stale render can overwrite a newer one.
- **Inconsistent Typst string escaping.** `typst_str_or_none` (`lib.rs:205`) escapes backslash then quote correctly and is used for `header`/`footer`. `font` (`:226`) and `paper` (`:232`) use ad-hoc `.replace()` that misses the backslash. Verified: `paper: "a4\"` breaks out of the literal and the whole document fails with "unclosed delimiter / unclosed string" pointing at the prelude, not at the setting.
- **No numeric validation** in `DocConfig::from_json`. `size_pt: 0`, `size_pt: -5`, `columns: 5000`, `line_spacing_em: -3` all return `ok: true` with silently garbage output.
- **No `beforeunload` guard.** Close the tab with unsaved changes to a bound file and they're gone without a prompt.
- `tauri.conf.json` sets `csp: null`, and `ksav_write_file` (`lib.rs:85`) takes an unvalidated path from the webview. Not exploitable today — the invariant is real but enforced by JS convention rather than at the Rust boundary.

## Code quality

Two very different halves.

The engine is clean, well-factored and unusually well-commented — the comments explain *why*, name the bug they fixed, and are honest about tradeoffs. `docs.ts`, `files.ts`, `styles.ts`, `review.ts` and `notes.ts` are all good modules with clear reasoning at the top.

`main.ts` is the weak spot: **3,143 lines / 120 KB** carrying state, DOM construction, menus, exports, review, tables, styles, assets and boot. 13 module-level mutables, 35 `getElementById(...)!` non-null assertions. Test coverage is **1 test file for 15 modules** (`brackets.test.mjs`, 37 assertions). There is no test at all for `docs.ts` — the persistence layer where blocker #1 lives — or for `files.ts`, `review.ts`, `styles.ts`, `markdown.ts`.

One design mistake worth naming on its own: **auto-save is implemented as a side effect of compiling.** Saving should not depend on rendering. That coupling is the direct cause of blocker #1.

## Non-intuitiveness

- **The toolbar is 42 icon-only buttons with zero `aria-label`.** They carry `title` tooltips, but the accessible name of a button reading "†" is "†". A screen reader announces "†, button", "⁑, button", "▤, button". Page-wide: 0 `[aria-label]`, 1 `[role]`, no `nav` landmarks.
- The glyph vocabulary (⁑ ⇥ ⇤ ▣ § א. ‡ ▤ ⋯ ◫ ◧ ⊟ ⊞ ＃) has no labels and no grouping — the opposite of the labeled ribbon groups in the product it's replacing.
- **The editor opens in raw markup, not prose mode.** For something pitched as a Word replacement, the Word-like view should be the default.
- Unmapped compiler errors leak raw internals — `paper: "nonsense"` surfaces a 40-item list of Typst paper names.

## Missing

macOS installer and code signing (both acknowledged in spec.md, both cost money not engineering). No cloud sync, collaboration, or mobile. The user dictionary lives in per-browser-profile `localStorage`, so it's invisible to the desktop app and lost on a browser change. No autosave-to-file — file saving is manual only. And the author's own honest note stands: **nobody has written a real document in it yet.**

## What I'd do

1. Move `putDoc` out of `runCompile` into its own debounced save with a `try/catch` that surfaces a visible, blocking error; cap history size and scope it per document; drop `MAX_ASSET_BYTES` below the quota or move assets to IndexedDB.
2. Make the three Tauri commands `async fn`; put the wasm engine in a worker.
3. Add a LICENSE and ship the font licence notices.
4. Push to a remote so CI can produce the macOS build and the work stops living on one disk.
5. Then hand it to five bochurim for a zman. Everything after that should be driven by what they hit.

The hard part — real Typst, a working eleven-layout note apparatus, a Hebrew lexicon that doesn't insult Torah text — is done and done well. What's missing is the boring reliability layer around it.

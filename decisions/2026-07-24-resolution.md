# Resolution — 24 July 2026

The second audit above is now a record too. Everything it found in code has been
fixed; what stands unchanged is only what was never engineering. Kept next to
each finding, because a fix is only legible beside the thing it fixed.

## Blockers — all three fixed

**1. Merged-cell table edits — `app/src/table.ts`.** The model already parsed
`span`; the geometry did not. `render`, `rowOf`/`colOf`/`rowCount` and every
structural operation now go through one span-aware grid layout (`layout()`),
which places each cell by the columns it actually occupies and wraps exactly as
Typst's own auto-placement does. `render` emits `מיזוג(n)[…]` so a merge survives
the round trip; a column inserted through a merge widens it rather than splitting
the row. Held by twenty new assertions, including the audit's own repro round-
tripped through every operation.

**2. No bound on compile time or memory — `engine/src/server.rs`, the two
clients.** Typst cannot be interrupted mid-compile, so the fix is structural and
per-build. The server runs each compile on its own thread and waits with a
deadline (`KSAV_COMPILE_TIMEOUT_MS`, default 20 s); the pool threads only ever
*wait*, so a runaway never occupies a worker and spell checks and static assets
keep being served. Concurrent compiles are capped, so overran work cannot pile up
threads without bound, and a compile past the cap is refused at once with a plain
message. The browser build genuinely reclaims: the worker is `terminate()`d on
the deadline and the next call boots a fresh one. The desktop build unblocks the
UI on the deadline and says why. A runaway is not truly killed on the two native
builds — that would need a separate process, a heavier machine than a local
single-user editor warrants — but it can no longer hold up anyone else, and the
writer is told. Four tests on the server path.

**3. Quadratic typing latency — `app/src/ksav-lang.ts`.** `proseDecorations`'s
four membership predicates were linear scans called once per command — O(n²), 108
ms per keystroke on a hundred-page sefer. Each span set is now painted once into a
byte mask (native `fill`, O(document)), so every predicate is a single array
read and the pass is O(n). The second, cheaper half: a pure cursor move recomputes
only when a reveal-sensitive span's overlap with the selection actually flips,
so arrow-keying through a long document pays nothing.

## Serious — all eight fixed

**4. Nothing incremental — `engine/src/lib.rs`.** `comemo_evict_max_age` was
`Some(0)` — evict everything after every compile, the opposite of watch mode. Set
to `10`, so Typst's font, shaping and layout memoization survives across compiles.
Measured: a byte-identical recompile drops from 93 ms to ~48 ms.

**5. Crippled fallback boot — `app/src/main.ts`.** The no-durable-store path
returned early, dropping the registries (empty toolbar and menus), the unload
guard, spell-check and the timers. It now loses *persistence and nothing else*:
every capability is wired, and only the store-backed steps (binding recall, the
snapshot timer) are guarded behind a `durable` flag.

**6. Silent spell-check failure — `app/src/main.ts`.** A dropped check was
swallowed while the panel still named two lexicons — the false all-clear this
feature exists to refuse. A failure is now recorded and the coverage note says so.

**7. Panels wrote raw text into markup — `app/src/main.ts`.** One shared escaper
(`typst-escape.ts`, mirroring the engine's `typst_str`): `typstString` for string
literals, `typstContent` for `[…]` bodies. Every panel that emits a call — review
marks, editor comments, section-page setup, formulas — goes through it. A `]` in
a comment no longer closes the call; a trailing `\` no longer escapes a quote.

**8. Open AI proxy — deleted.** `server.ts` (an unauthenticated `0.0.0.0` Gemini
key proxy, on a model id that does not exist) is gone. The two Gemini-authored
mocks moved under `prototypes/`, the server removed from the archived manifest,
and the root README rewritten to make `ksav/` the front door.

**9. Assets re-sent every compile — `app/src/docs.ts`, `engine/src/assets.rs`.**
The client sends a content hash and includes the bytes only when the engine is
not known to hold them; the engine keeps a bounded per-process cache keyed by
that hash and reports any it no longer holds so the client re-sends. An 8 MB image
is now sent once per session, not on every pause in typing.

**10. Quadratic spell offsets — `engine/src/spell/mod.rs`.** The UTF-16 conversion
re-walked the whole prefix for every misspelling. One forward pass with a running
cursor gives the same numbers in linear time.

**11. No CSP outside Tauri — `app/vite.config.ts`, `engine/src/server.rs`.** The
built SPA carries the same policy Tauri enforces, injected at build time only (a
strict CSP would break Vite's dev HMR), and `ksav serve` sends it as a header.

## Worth fixing — all nine done

Firefox downloads revoke on the next tick; a large file open no longer loses its
race with the dismissal timeout; opening a file already open switches to it
instead of cloning; the title bar carries a dirty dot; the preview no longer eats
a text selection; custom commands travel inside a shared `.ksav`; the page-foot
reserve follows a real call, not a prose mention; saving a template can no longer
throw uncaught; and binding a taken chord is refused with an offer to move it.

## What still stands, unchanged

Not engineering, and named plainly: the runaway compile is contained but not
reclaimed on the two native builds; page setup is still app-wide; the installers
and the release workflow have still never run for want of certificates; and no
real bochur has written a real sefer in it. That last line is still the one that
matters most.

## Tests

`app`: 351 → **389** assertions across 9 files (new: merged-table round-trips,
the shared escaper, the custom-command round-trip). `engine`: **153** across nine
binaries (new: the compile deadline, the asset cache, multi-miss UTF-16 offsets,
the page-foot reserve). Both suites green, `clippy -D warnings` clean, the app
builds.

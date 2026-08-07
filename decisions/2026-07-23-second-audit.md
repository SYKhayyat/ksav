# Second audit — 23 July 2026

The document above is a record of the first pass. This is a fresh one, against
the code as it stands at `abc3dc0`, and it is not a re-reading of the same list:
everything below was found by running the thing and measuring it.

**What was run.** `npm test` in `app` (351 assertions, all green) · `cargo test
--release` in `engine` (green) · a benchmark of the work the editor does per
keystroke, on synthetic documents built out of the shapes Ksav documents are
made of · a repeat-compile measurement against a running `ksav serve` · a
compile-bomb repro · a table-editing repro. Every number below is from this
machine, and every finding names the file it lives in.

## Verdict

**Not ready for general release. Ready for a small, supervised pilot on short
documents once the three blockers are fixed.**

The reliability layer this file was written about — storage, saving, escaping,
diagnostics, licences, accessibility — is in good shape, and I could not break
it. What is not ready is the part nobody measured: **the editor gets slower than
a person types as a document grows, the compiler has no bound on time or memory,
and one of the direct-manipulation features silently corrupts the document it
edits.** All three appear only at the size and shape of a real sefer — which is
the document this product exists for, and the one nobody has written yet.

One item from the old list has moved on its own: `git remote -v` now answers
`origin https://github.com/SYKhayyat/ksav.git`, with six commits still unpushed.
CI has a repo to run in.

## Blockers

### 1. Editing a table with a merged cell scrambles the table — `app/src/table.ts`

`render()` (`table.ts:172`) rebuilds every cell as `תא[…]`, and `rowOf` /
`colOf` / `rowCount` (`table.ts:159–169`) divide by the column count as though
every cell occupied one column. A `מיזוג(2)` cell is neither. Pressing "insert
row" inside this table:

```
#טבלה(עמודות: 2, פסים: true,
  מיזוג(2)[כותרת רחבה],
  תא[א], תא[ב],
)
```

produces this:

```
#טבלה(עמודות: 2, פסים: true,
  תא[כותרת רחבה], תא[א],
  תא[], תא[],
  תא[ב], תא[],
)
```

The merge is gone, the header has been pulled into the first data row, `ב` is
orphaned two rows down, and a blank row has appeared between them. No error, no
warning, and the only recourse is undo — if the writer notices.

This is the failure this module's own opening comment names as the reason it
exists ("getting that count wrong silently reflows the whole table"). The model
already parses `span` correctly; only the rendering and the row/column
arithmetic ignore it. Fix both, and hold it with a test that round-trips a
merged table through every operation.

### 2. A compile has no bound on time or memory — `engine/src/lib.rs`, `engine/src/server.rs`

This document is thirty bytes:

```
#for i in range(400000) [א ]
```

It occupied a core for the full sixty seconds I was willing to give it and was
still going when it was killed. There is no deadline anywhere in the engine, the
server, the Tauri commands or the wasm worker.

What that means in each build:

- **`ksav serve`** — the pool is `min(cores, 16)` threads (`server.rs:79`).
  Sixteen such requests and the editor stops answering for everyone, including
  the person who started it. The API is unauthenticated by design, which is fine
  on loopback, but the CORS allow-list stops a stranger *reading* the response,
  not the work being done.
- **The desktop app** — a `spawn_blocking` task that never returns. The window
  survives, which is what that change was for, but the writer cannot stop it and
  nothing says what happened.
- **The browser build** — one engine worker and no cancellation path
  (`api.ts:236`), so every later compile and every spell check queues behind it
  forever. The tab is finished until it is reloaded.

This needs no malice: a `#for` with a wrong bound is an ordinary typing mistake,
and Ksav is a product whose documents get emailed around. Typst has no
mid-compile cancellation, so the fix is structural — run the compile somewhere
that can be killed (two of the three builds already do), give it a deadline,
terminate and restart on expiry, and say so in the status bar.

### 3. Typing latency is quadratic in document size — `app/src/ksav-lang.ts`

Prose mode is the default view, and `proseDecorations` recomputes from scratch on
**every keystroke and every cursor move** (`ksav-lang.ts:932–940`). Inside it,
four membership tests are linear scans over the document's spans, called once per
command: `inComment` (`:587`), `insideFootnote` (`:604`), `insideList` (`:619`),
`insideTable` (`:652`). Commands scale with the document, and so do comments,
footnotes, lists and tables. The cost is O(n²).

| document | prose scan, per keystroke *and* per arrow key |
|---|---|
| 9 KB | 0.3 ms |
| 36 KB | 2.2 ms |
| 107 KB | 17 ms |
| 269 KB | **108 ms** |

`scanCommands` is not the problem — it is 3.4 ms on the largest of those. The
predicates are: strip the comments out of the same document and it drops to
82 ms; strip the footnotes too and it drops to 40 ms.

269 KB is a hundred-page sefer with its apparatus. At that size every arrow key
costs a tenth of a second, and holding a key down leaves the editor permanently
behind the keyboard. Sorting each span list once and binary-searching it — or
one sweep in document order — removes the whole class. Not recomputing on a
selection change that cannot reveal anything is a second, cheaper win.

## Serious

### 4. Nothing about compilation is incremental — `engine/src/lib.rs:400`

Against a running `ksav serve`: the same document compiled four times unchanged,
then once more after appending a single character.

```
sample (1x)   1,269 chars,  1 page  ·  210, 112, 92, 116 ms  ·  after 1 keystroke:   93 ms
sefer  (40x) 50,838 chars, 40 pages ·  2242, 2873, 2622, 2587 ms ·  after 1 keystroke: 2512 ms
```

Recompiling a byte-identical document costs the same every time. Two causes, one
line each:

- `layout_source` builds a **fresh `TypstEngine` per request** (`lib.rs:400`),
  re-parsing the 1,473-line prelude every time.
- `typst-as-lib`'s `comemo_evict_max_age` defaults to `Some(0)` — "evicts after
  each compilation" — so Typst's memoization cache, the thing that makes its
  watch mode fast, is thrown away after every compile. Ksav never sets it.

Reusing one engine and setting the max age to something like 10 is what
`typst-cli --watch` does; it is where the 2.5 s round trip becomes something a
writer would call live. Related and cheap: a superseded compile still runs to
completion — `compile.ts:42`'s generation counter discards the *result*, not the
work — so typing steadily through a long document keeps every core busy
rendering pages nobody will ever see.

### 5. With no durable store, the app boots crippled — `app/src/main.ts:2866`

The fallback for a private window (or storage blocked) renders, reports the
failure and returns early. What that early return skips:

- `backend.commands()` / `templates()`, so `commandsReg` stays empty. The
  toolbar renders as empty `<span>`s (`buildToolbar:791`), the Insert menu is
  empty, the palette finds nothing, completion offers nothing. The writer gets a
  text box.
- `save.wireUnloadGuard()` — closing the tab throws the work away with no
  prompt, in the one situation where nothing else is keeping it either.
- The snapshot and file-autosave timers, and the first spell check.

The banner is honest and everything after it is wrong. This path should lose
*persistence* and nothing else.

### 6. A failed spell check is silent — `app/src/main.ts:473`

`catch { /* A failed check is not worth interrupting the writer over. */ }`. If
the engine is unreachable the squiggles simply stop arriving, while the toggle
still reads on and the settings panel still names two lexicons and their sizes.
That is the state this file argues against by name — "a silence that reads as a
clean bill of health is worse than a missing feature" — and the coverage note in
the panel is the obvious place to say so.

### 7. Two panels write raw user text into markup — `app/src/main.ts:2090`, `:2282`

`addComment` builds `#הערת_עורך[${text}]` out of a `prompt()`, and the
section-page modal quotes header/footer strings by stripping `"` and nothing
else. A comment containing `]` closes the call early and corrupts the document;
a header ending in `\` escapes its own closing quote and fails the compile
inside the prelude. The engine is careful about exactly this (`typst_str`,
`lib.rs:314`, with a test pinning the backslash-before-quote ordering); the
editor, which generates far more markup, is not. One shared escaper, used by
every panel that emits a call.

### 8. The AI prototype ships an open, unmetered API proxy — `server.ts`

`server.ts` binds `0.0.0.0:3000` (`:101`) and exposes `POST
/api/gemini/assistant` with no authentication, no rate limit, no origin check
and no size limit on `editorText`, which is interpolated straight into the
system instruction (`:63`). Anyone who can reach the port spends the owner's
Gemini quota and steers the model; `error.message` goes back to the caller
(`:79`).

It may also be dead in the literal sense: the model id is `gemini-3.5-flash`
(`:67`), which is not a name in Google's published lineup. Worth one minute
against the API to confirm — if it is wrong, every request has been 500ing since
the line was written.

The README calls this repo's front door "the React/Vite web-app prototype" and
`ksav/` the product. A prototype with a live API-key proxy in it, at the top
level, with the quickstart pointing at it, is a trap for whoever clones this
first. Delete it, or move it under `prototypes/` with the server removed and say
why.

### 9. Every asset is re-encoded and re-sent on every compile — `app/src/docs.ts:413`

`requestAssets` puts the document's assets on each compile request, so an 8 MB
image (the ceiling, `main.ts:2451`) is ~11 MB of base64 across the wire or the
worker boundary on every pause in typing, plus a base64 decode in the engine
each time (`assets.rs:63`). Hash the bytes, send the hash, keep a per-session
cache in the engine, and send the payload only when the hash is unknown.

### 10. Spell offsets are computed quadratically — `engine/src/spell/mod.rs:527`

`text[..m.start].encode_utf16().count()` re-walks the document prefix for every
misspelling. On a long document with many unknown words — a sefer full of names
is the normal case — that is O(n·m) on every check, every 700 ms. One forward
pass carrying a running UTF-16 count gives the same numbers in linear time.

### 11. Engine output becomes HTML, with no CSP outside Tauri

`preview.innerHTML = …pages_svg…` (`compile.ts:86`), the same again for the
overlay (`main.ts:2635`), and `TableWidget.toDOM` sets `innerHTML` from
hand-built markup (`ksav-lang.ts:563`). None of it is exploitable today —
`renderInline` escapes and emits a fixed tag set — but the Tauri build has a real
CSP (`tauri.conf.json:25`) and the browser and `ksav serve` builds have none at
all, so this code runs with no second line of defence in the two places where
documents arrive from other people. Add the meta CSP to `app/index.html` and the
header in `server.rs`.

## Worth fixing

- **Downloads may not happen in Firefox.** Both copies of `download()` revoke the
  object URL synchronously after `a.click()` (`dom.ts:84`, `files.ts:183`).
  Revoke on the next tick.
- **Opening a large file can silently do nothing.** The `<input type=file>`
  fallback resolves `null` 800 ms after the window regains focus
  (`files.ts:120`); a `FileReader` still working on a big document loses the race
  and the open is dropped without a word.
- **Opening the same file twice makes two documents.** `openFile` always calls
  `createDoc` (`main.ts:1709`), so the library fills with duplicates of one
  sefer, each bound to the same path. Match on the binding first.
- **Nothing shows unsaved state.** The title bar shows the document and its file;
  neither carries a dirty marker, though `hasUnsavedFileChanges()` already knows.
  The writer first hears of it in the browser's leave-page dialog.
- **You cannot select text in the preview.** Any click jumps the editor cursor
  (`main.ts:672`). Require a modifier, or a double-click.
- **Custom commands do not travel with the document.** `settings.customCommands`
  is app-wide and `serializeDoc` writes only body and assets (`docs.ts:384`), so
  a `.ksav` that uses one compiles for its author and fails for everyone else.
- **`notes_region_cm` is decided by substring search** over the body
  (`lib.rs:96`): a document that merely *mentions* `מדף_` in prose loses 3 cm at
  the foot of every page.
- **Saving a template can throw.** `saveUserTemplates` writes a whole document
  into `localStorage` with no `try` (`main.ts:1685`) — the one storage path
  outside the careful save story.
- **Shortcut capture has no conflict check** (`main.ts:1364`): binding a chord
  that is already taken silently creates two bindings for it.

## Product gaps

Not defects — the things a writer asks for in the first week:

- **Spell-check has one verb.** "Add to dictionary" is permanent and global.
  There is no "ignore once" and no "ignore in this document", so a name that
  appears twice either teaches the checker forever or squiggles forever.
- **User templates cannot leave the browser.** The dictionary got export/import;
  templates did not, and they hold whole documents.
- **Page setup is still app-wide.** Named in the previous section, unchanged, and
  the item most likely to be reported as a bug rather than as a gap.
- **No library-wide search.** Find is per document; with a library, "which sefer
  did I write that in" has no answer.
- **The README sells the prototype.** Its feature list, quickstart and API section
  describe `src/` and Gemini; the product is `ksav/`. Anyone evaluating this
  reads the wrong page first.

## What held up

A list of defects is not a description of the software, so, plainly:

- Storage and saving. I could not find a path that loses text once IndexedDB is
  available, and the failure banner, the backup button and the index rebuild all
  do what they say.
- The engine's escaping and clamping. `typst_str`, `sanitize_paper`,
  `sanitize_lang` and `clamped` are correct, and the tests pin the subtle
  ordering.
- Bracket healing: pure, tested, and the three consumers genuinely share one
  scan.
- The bilingual UI: 296 keys on each side, no gaps in either direction.
- Accessibility and responsiveness — real work, not claimed work.
- Both test suites pass from a cold checkout on this machine.

## What could not be checked

- The installers and the release workflow: never run, no certificates.
- The wasm build end to end (`app/src/wasmpkg/` is git-ignored and built
  locally), so the browser-only path is judged from its source rather than from
  use.
- How any of it feels over a zman, which is still the item that matters most.

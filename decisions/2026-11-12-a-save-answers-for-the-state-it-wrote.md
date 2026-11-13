# A save answers for the state it wrote — #177

**2026-11-12.** The fix for #177: the history panel's *Clear* button confirmed
through the browser's `window.confirm`, and a save that landed behind a newer
keystroke announced *nothing is unsaved* for text that was. The record is the
reasoning; the mechanism is `app/src/save.ts` (the generation counter) and
`app/src/snapshots.ts` (the confirm route). The fences are
`app/test/save.test.mjs`, `app/test/prohibitions.test.mjs` and one clause in
`app/test/retention.test.mjs`.

## The native dialog

`confirm(t("historyClearConfirm"))` was the last native dialog in `app/src`.
Every other destructive question already went through the application's small
modal — `restoreSnapshot`, twenty lines up in the same function, asked through
`snapWiring().confirm`. The native one is wrong three ways, and none of them is
taste:

1. It does not follow the interface language's direction or the theme;
2. it blocks the event loop, so the preview and the compile freeze behind it;
3. in a Tauri WKWebView, `window.confirm` is **not implemented** without the
   dialog plugin — it returns `false`, and the button does nothing, silently,
   on the shipped macOS build.

The same is true of `alert()` and `prompt()`, so the whole class is now an
executable prohibition in `prohibitions.test.mjs`: no bare `confirm(`/`alert(`/
`prompt(` call anywhere in `app/src` (a *declaration* of the wiring-interface
method is a return-type line, and the probe reads that distinction).

## The save that outlived the keystroke it saved

`saveNow` captured the text, awaited `putDoc`, and then unconditionally set
`unsavedChanges = false`. Serialising the writes does not cure it: the two
writes run in order, and it is the **older one's answer** that is wrong. The
sequence is one keystroke at the wrong 600 ms:

1. `scheduleSave` sets the flag and arms the timer;
2. the older `putDoc` resolves and clears it back to false.

For up to 600 ms the newest text is unsaved while the module says otherwise —
and the only readers of the flag are the three *leaving* hooks (`beforeunload`,
`pagehide`, `visibilitychange`), so closing or hiding the tab in that window
skips the flush.

The fix is a generation counter. `markFileDirty` — what an edit does, in this
module and in `assets.attachAsset` — bumps it; `saveNow` reads it at the moment
it captures the body (so it names the state that write actually carried) and
clears the flag only if the number has not moved. The bound-file autosave had
the same race with the title-bar dot (`markFileSaved` after a write the new
keystroke outlived), and it is the same counter.

## The fences, and the mutants

`save.test.mjs` drives both races deterministically. The library one works
because an IndexedDB transaction commits on its own event-loop turn, never in a
microtask: the queued save bod is provably in flight, a `scheduleSave` lands on
top of it, and the flag must *stay* set. The file-dot one writes through a fake
`createWritable` whose `write` holds a gate the test opens after a second
`markFileDirty`. `retention.test.mjs` states that the Clear button asks through
`snapWiring().confirm(…, { danger: true })`. `prohibitions.test.mjs` forbids the
native dialogs, and a test-only mutant — a `confirm(` restored to
`snapshots.ts` — is red and names the file.

Two mutants on the counter: clearing the flag unconditionally, and reading
`moved` as a constant — both red, both naming *"a keystroke during a write
leaves the document unsaved (#177)"* and *"an edit during the write leaves the
dot (#177)"*.
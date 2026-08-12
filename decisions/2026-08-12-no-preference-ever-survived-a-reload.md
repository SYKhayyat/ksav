# No preference ever survived a reload — 12 August 2026

The marked-up UI inventory reported that emacs mode does nothing. Four dated
records chased that through the desktop shell, the bundle, the chunk names and a
keymap precedence tie. This is what it actually was, and it is not a keyboard
bug at all.

## The finding

`app/src/settings.ts` read `PAGE_FIELDS` inside `loadSettings`, and declared
`PAGE_FIELDS` **below** the `settings` binding that calls it. A `const` is in its
temporal dead zone until its own declaration is evaluated, so every boot ran:

```
ReferenceError: Cannot access 'PAGE_FIELDS' before initialization
```

The `catch` around it returned `{ ...DEFAULTS }`. It had been written for a
corrupted JSON blob, and it absorbed a programming error with the same shrug.

**So no preference had ever survived a reload.** Not the theme, not the layout,
not prose mode, not spell-check, not synced scrolling, not the keybindings, not
the editing mode. `settings` is mutated in place, so the drawer stayed honest for
the length of one session and every reload quietly un-chose all of it.

That is the whole of "emacs mode does nothing": `boot` gates on
`settings.editingMode`, found `"default"`, and never called `applyMode`. It is
almost certainly also the margin comment *"I closed this document and reopened
it, and it went into prose mode"*, and the one about the preview coming back
right-to-left.

It was found by probe, not by reading: a `console.log` in `applyMode` never
fired, a second at the gate printed `"default"`, and a third inside the `catch`
printed the ReferenceError.

## The second cause, underneath the first

With the mode applied, the plugin installed — `cm-emacsMode` on the scroller —
and emacs worked in the dev server. In a production build it still did nothing,
which is the split the previous record recorded and could not explain.

`@replit/codemirror-emacs` registers its entire keyboard and every command
implementation at module scope, and annotates both calls as side-effect free:

```js
for (let i in emacsKeys) {
    /*@__PURE__*/EmacsHandler.bindKey(i, emacsKeys[i]);
}
/*@__PURE__*/EmacsHandler.addCommands({ killLine: …, yank: …, … });
```

`@__PURE__` is a promise that a call may be deleted when nobody reads its
result. Nobody does — both exist for their side effect — so Rollup deletes them.
Measured on the built chunk before the fix: the `emacsKeys` table present, the
`bindKey` method present, **zero** calls registering the one with the other, and
**zero** command implementations. The mode loaded without error, added its CSS
class, and could not answer a keystroke. The dev server does not tree-shake,
which is the entire dev-versus-production split.

The previous record's diagnosis — that emacs uses the `keymap` facet and loses a
`Prec.highest` tie to Ksav's own shortcuts — is wrong. `@replit/codemirror-emacs`
handles keys from a `ViewPlugin` event handler, exactly as vim does, and wins the
same way vim wins. There was never a tie.

## What changed

- **`PAGE_FIELDS` moved above the loader**, so the dead zone cannot exist.
- **The `catch` was narrowed to the `JSON.parse` alone.** This matters more than
  the move. A dead-zone error now propagates out of module evaluation, so a
  repeat is a failed import that takes the whole test suite down by name rather
  than a preference that silently reverts. Verified by putting the bug back.
- **`settingsLoadFailure()`** reports what could not be read, and `boot` puts it
  in front of the writer. A fallback that cannot report itself is
  indistinguishable from a feature that does not work.
- **A build rule**, `app/tools/pure-annotations.mjs`, drops `@__PURE__` where it
  introduces a *statement* in the two mode packages, and leaves the honest
  expression-position ones alone. The emacs chunk goes from 11.0 kB to 15.9 kB,
  which is the size of the feature that was missing.
- **`loadError()` has a caller.** `editingModeNote` in `main.ts` now reports what
  the mode is actually doing. It used to be a static string asserting *"Real Vim
  and Emacs. While one is on it gets the keys before Ksav's own shortcuts"* —
  printed regardless, and false for the whole life of the feature.
- **`settings.ts` has a test file**, which it never had. That absence is the tell:
  the module that decides everything a person has chosen was the one nothing
  asserted anything about.

## Verified in the running application

Both builds, driven in a browser. Dev server and `vite preview` over `dist`:
`C-x h` selects the buffer, typing replaces it, `C-k` kills the line, `C-y`
yanks it back, and Ksav's own `Ctrl+K` palette stays shut — which is the proof
that the mode has the key rather than merely being present. Vim installs, the
`-- INSERT --` panel appears, and `x` deletes a character instead of typing one.
A stored `theme: "dark"` now survives a reload, which it could not have done at
any point before this.

## What this says about the four records before it

Every one of them was investigating the right symptom in the wrong place, and
each new piece of evidence was true and led further away: the bundle really does
contain both mode chunks, the extension really does load, `emacsKeys` really
does carry its full table, and nothing really does throw. All of that was
consistent with a mode that was never switched on, and none of it was checked
against the simplest question — *is the setting the application is reading the
one the writer chose?*

The general lesson is the narrow one about the `catch`, not a lesson about
emacs. A fallback that swallows every failure converts a defect into a default,
and a default is invisible.

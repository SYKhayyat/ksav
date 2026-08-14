# The only surface that knew — 14 August 2026

The shortcut list moved out of the settings drawer and into a surface of its
own. Moving it broke an acceptance check, and the broken check was right: it had
been reading the one place in the application that knew a keyboard mode was on.

## Why the list moved

Sixty-odd rows of key capture sat at the bottom of Settings, below the paper
size, the margins, the dictionary and the asset list — one scrolling drawer with
two subjects in it. That is the placement half of inventory item 126: *"what
does each key do"* is a reference question, of the same kind as the command list
and the help page, and it is asked while working rather than while setting the
application up.

It is `keys-drawer` now, on `Shift+F1` — beside the help panel's `F1`, because
`F1` has meant *tell me about this* on this platform since before any of us.
Two things arrived with the move, and they are the reason it is not only a move:

- **A search box**, over the name *and* the key. *"What runs on Ctrl+Alt+V"* is
  half of what anyone brings to a key list, and only the other half was
  answerable before.
- **Unbinding one action.** There was no way to do it. Capture assigns; the only
  removal was the reset that discards every custom chord in the application. The
  row's `×` writes the empty string, which `keybindingsFrom` reads as *this
  action is deliberately unbound* — deleting the entry would put the shipped
  chord back instead.

What stays in Settings is a door: one row, with the key on it, because Settings
is where somebody who has not learned that key will look first.

## What the move exposed

Acceptance step 7c waited for `.sc-key-mode` — the class the settings list put
on every key while Vim or Emacs held the keyboard, printing `M-x name` in place
of a chord. The rows moved, the class moved with them, and the step went red.

The step was not stale. It was pointing at something true that had been true all
along: **`.sc-key-mode` existed in exactly one place in the application.**

`buildShortcutKeymap` returns *nothing at all* while a mode is really installed.
That is how a mode wins the keyboard — not by out-ranking Ksav's keymap but by
leaving it empty, which is itself the fix for an earlier bug where the tie was
broken by array order and broke the other way in the shipped build. But
`keybindings()` goes on returning the whole table, and twenty surfaces printed
it:

| where | what it printed |
|---|---|
| every menu's `<code>` — structure, insert, fold levels, the command grid | the chord |
| the toolbar and context-bar tooltips | `name · chord` |
| the snapshot note in Settings | *"press Ctrl+S to keep a point"* |
| the spelling tooltip | the chord for the suggestion list |
| the switcher's heading in the Documents menu | the chord |
| the help panel — shortcuts, structures, macros | the chord |
| the command palette's rows | the chord |
| the new door into the keys drawer | the chord |

Under a mode every one of them named a key that did nothing. Not a crash, not a
wrong result: a confident sentence about the keyboard that stopped being true
the moment somebody chose Emacs, and no way for the reader to tell.

This is the repository's own named bug family — a working mechanism behind a
lying surface — and it is also, exactly, the sweep failure the prohibitions file
was built for: the fault was diagnosed once, fixed in the one surface where it
was noticed, and the other nineteen were never looked at.

## The decision

**A key display is not a lookup.** `readable()` spells a chord; it cannot know
whether that chord is installed. So nothing in `src/` calls it any more except
the module that defines it, and every surface goes through one rule:

```ts
export function keyHint(key: string, mode: string, name: string): string {
  if (mode === "vim") return ":" + name;
  if (mode === "emacs") return "M-x " + name;
  return key ? readable(key) : "";
}
```

Three things about it were decided rather than fallen into.

**Under a mode the answer is not blank.** Blanking would be honest and useless:
the writer who came looking for a key would learn only that there isn't one,
which is false — every action is registered as a `:` command and under `M-x`,
and that has been true since the modes were built. The hint says how to get
there. An action the writer has *deliberately unbound* prints nothing in default
mode and still prints `M-x foldall` under Emacs, which is the same rule read
twice rather than a special case.

**`commandName` moved to `bindings.ts`.** It belonged to `keymodes.ts`, where
its comment about vim's ex parser still belongs — but `keymodes` imports
CodeMirror, and the panel views that need to spell a command are built in a test
runner that has no editor. `bindings.ts` imports nothing at all, which is what
makes it the one module all of them can reach. `keymodes` re-exports it, so
every existing caller and its test are untouched.

**`commandGroups` takes the mode as a required argument.** Not a default. A
caller that forgot to pass it would print a column of dead keys and no test
would notice, which is the shape of the bug being fixed.

## What holds it

- `prohibitions.test.mjs` — the class as an executable prohibition: *no surface
  spells a chord without going through `keyHint`*. `readable(` is forbidden in
  `ksav/app/src/**.ts`, owned by `bindings.ts` alone. `tools/card.mjs` is
  outside the sweep and stays outside: the card is a printed page, there is no
  mode to ask about, and chords are its whole content.
- `bindings.test.mjs` — the rule itself, in all three modes, including the
  unbound-action case; and that no two shipped actions answer to the same `M-x`
  name, which would make the second unreachable under a name that looks like it
  works.
- `panelrows.test.mjs`, `help.test.mjs`, `panelviews.test.mjs` — the three view
  modules, each under Vim and Emacs.
- Acceptance 7c — the settings door, and then a *menu*, which is the half no
  unit test can reach: `structureMenuItems`, `insertMenuItems` and the toolbar
  tooltips are all built inside `main.ts`.

The keys drawer's search now matches what a row **prints** rather than the chord
it stores. Under Emacs there is no `Ctrl+K` in that list to find, and a search
box that finds what is no longer on screen is the same bug one layer down.

## The smaller one, recorded because it will bite again

`el()` in `dom.ts` set `class` before the `v != null` guard that every other
attribute passes through. A conditional class written the ordinary way —
`class: on ? "x" : null` — put the literal string `null` in the attribute. It
had no instances, because nobody had written a conditional class yet; this
change wanted eight of them.

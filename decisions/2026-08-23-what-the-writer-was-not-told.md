# 2026-08-23 · What the writer was not told, in three doors

Three editor findings about surfaces that did half of their job and stayed
quiet about the other half.

## The Word handoff pasted without naming its cost

`exportWord` says what a sefer loses on the way to Word — decision 15's
*"a stated downgrade beats a silent one"* — and `copyForWord` performed the
same handoff onto the clipboard and said only *copied*. The clipboard is the
same content through a different door, so it now carries the same sentence:
nothing lost, or the named degradations beside the confirmation.

## An Org definition list arrived as punctuation

`- term :: definition` matched the ordinary list-item branch and its ` :: `
travelled into the document as literal prose that means nothing here. Ksav's
lists have no descriptions, so the conversion is not built; the fact is named
instead — the import's `dropped` report exists for exactly this, and the words
survive inside a plain item beside it.

## A language flip rebuilt the chrome and left the panels behind

`rerenderChrome` replaced the header and the settings drawer, swept
`[data-i18n]`, and stopped. Every open panel body — the git drawer, the notes
pane, the styles panel, the history modal — stayed in the old language until
its next interaction.

The mechanism is new and deliberately **not** "run every `open` hook again":
opening is allowed to take focus and start work (`git status`, a compile), and
a language flip must do neither. `PanelHooks` grows a third hook, `rebuild`,
documented as the pure renderer; `rebuildOpenPanels` sweeps what is on screen;
the chrome rerender calls it after `localise`. Wired for the nine surfaces
that have such a renderer — outline, notes, marks, find, styles, review, git,
notes chooser, history. The command, keys, help and palette drawers have none
that would not reset a query or steal focus; their static labels go through
the sweep as before, which is stated here rather than left to be discovered.

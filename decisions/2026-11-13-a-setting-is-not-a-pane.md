# A setting is not a property of the pane you are standing in — #170

**2026-11-13.** The fix for #170, split out of UAT 6: *"it looks like typewriter
mode is on even when unchecked."* The report was right and the reading of the
code was also right, which is why this took a browser: nothing was wrong inside
one pane. The mechanism is `panestate.toEveryPane`; the fences are a source
prohibition and acceptance step 18.

## What the reading could not see

`focus.ts` installs the typewriter plugin only while the setting is on,
`focusExtension` is rebuilt on the toggle, and the CSS is scoped to
`.cm-content[data-typewriter="true"]` — so within one editor the look cannot
outlive the flag. What it can outlive is **a pane**.

Seven settings were written to `runtime.view`, the view that happened to have
focus: theme, prose/raw, direction, focus+typewriter, autocomplete, bracket
pairing, whitespace. In a split window the other pane kept the previous answer.
Measured in the assembled application, before the fix:

| step | pane 0 | pane 1 |
|---|---|---|
| turn typewriter on, standing in pane 0 | `data-typewriter=true`, 360 px | — , 4 px |
| click into pane 1, uncheck it | **`true`, 360 px** | — , 4 px |

The checkbox said off and 360 px of padding — half a viewport — was still above
and below the text in a pane the writer was not standing in. That is the "look
lingering", exactly as reported: it was never a repaint, it was the other half
of the window holding the old answer.

The same shape had already been fixed once, for the editing mode, where its
consequence was worse: a pane without vim *types* the commands into the sefer.
`compartments.setEditingMode` dispatches through `sourceViews()` and has
acceptance step 15 to itself. The settings never got the same treatment.

## The fix

`panestate.toEveryPane(effects)` — one function, `for (const v of sourceViews())
v.dispatch({ effects })`, and every setting that reaches a compartment goes
through it. Eight call sites: seven in `main.ts`'s settings write switch and the
prose toggle in `compartments.setProseHere`.

The drawer's rows also gained `data-setting`, which the `<select>` rows already
had: a row found by its localised label is a row found in Hebrew and not in
English, and step 18 has to find the typewriter switch in both.

## The fences

- **`prohibitions.test.mjs`** refuses `runtime.view.dispatch` anywhere in
  `src/` whose argument names a `Compartment.reconfigure`. Eight sites would
  have to be un-fixed at once to get past it, which is the point: this was never
  one setting.
- **acceptance step 18**, "a setting holds every pane, not the one that had
  focus" — a split, a toggle in one pane, a toggle back in the other, and both
  the flag and the padding read off every source pane. Verified red on the old
  code with the report's own sentence in the failure: *"pane 0 holds 360px, pane
  1 holds 4px"* while the switch read off.

## What this does not cover

A preference that reaches the editor through a view plugin rather than a
compartment — error lines (`onMarkLines`), reveal-all — is still dispatched to
the focused view. Those are per-view decorations of a per-view selection rather
than application settings, so they were left alone; if one of them turns out to
be an application answer, `toEveryPane` is where it goes and step 18 is the shape
to copy.

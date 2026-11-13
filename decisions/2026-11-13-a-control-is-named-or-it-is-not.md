# A control is named, or it is not a control — #178

**2026-11-13.** The fix for #178: six controls were filed as having no
accessible name; measured in the assembled application there were **nine**, and
the three the issue had not found are the reason this is a record and not a
patch. The mechanism is `aria-label` on nine controls and a `named()` helper in
`app/src/stylecontrols.ts`; the fences are a source prohibition, a browser sweep
in `.github/scripts/acceptance.mjs`, and `app/test/controlnames.test.mjs`.

## What was filed, and what was there

| control | what a screen reader said |
|---|---|
| `#find-query` | `edit text` |
| `#commands-search` | `edit text` |
| `#help-search` | `edit text` |
| settings: reserve box | `edit text`, placeholder `ריק = לפי ""` |
| settings: reserve slider | `slider 0`, no name, no unit |
| settings: percent base | `combo box` |
| **`#palette-input`** | `edit text` |
| **settings: custom commands** | `edit text` |
| **settings: snippets** | `edit text` |

The three in bold were not in the issue. They are the finding: this was never a
list of six places, it was *a placeholder used as a name*, and the list of six
was wherever somebody happened to look. The two text areas made it sharper
still — their row is a `<div>` with a `<span>` caption above the box, which
*reads* as labelled to anyone looking at the screen and is not labelled to a
browser at all. The settings drawer's inline rows (`<label>` wrapping a
`<span>` and the control) were correct all along; the two block rows were not,
and nothing in the running product distinguished them.

Nine also was not the end of it. When the browser sweep below was pointed at
every declared surface, the styles panel produced **twelve more**: the per-level
numbering rows, whose only caption is the digit beside each select, and the unit
half of every size control.

## Why a placeholder is not a name

Not taste, and not a WCAG citation:

- it is erased by the first keystroke, so the box loses its identity at exactly
  the moment the writer is lost inside it;
- several screen readers never announce it;
- it is translated by the same pass as everything else, which is why an English
  drawer kept a Hebrew ghost in an empty box — a placeholder is first of all a
  *hint about the value*, and this product also uses it as one
  (`perEdgeHint`: "empty = follow the one margin");
- and it cannot say what the value means. "Empty means the document decides" is
  a rule a row's caption carries; a ghost in an empty box is not where a rule
  belongs.

So the rule taken is not "placeholders are forbidden" — they are useful — but
**a control that shows one carries a name as well**, from the same key, so the
two cannot drift, and with `data-i18n-label` beside it so `panels.ts` rewrites
the name on a language switch instead of leaving yesterday's language
announced.

## One value, two controls

`sizeControl` and `regionHeightControl` render a number and a unit. The number
was named; the unit was not, so a screen reader offered "Size" and then nothing
for one value. The unit box is now named on its own, and naming it *differently*
is not cosmetic: two controls for one value that announce themselves identically
are one control as far as a screen reader is concerned.

`levelsControl` is three selects whose caption is `1`, `2`, `3`. The digit names
nothing, and one shared name would be three controls called "Level". Each is
`Level 2` — the number is the name's distinguishing half.

## Three fences, because there are three shapes of the mistake

1. **A literal control with a placeholder, and no name** — the class that
   produced all nine. Executable as a prohibition in
   `app/test/prohibitions.test.mjs`: it reads each `el("input" | "select" |
   "textarea", { … })` object literal by brace depth and fails when a
   placeholder appears without `aria-label`/`aria-labelledby`. No exemptions.
2. **A control named by the `<label>` around it** — correct HTML, invisible to a
   source scan, and the shape most of this product uses. Measured where it can
   be: `acceptance.mjs` step 8 now asks, of every surface it opens, whether any
   *visible* control on it is nameless, and names the ones that are
   (`<select type=select-one>` ×12 was how the styles panel answered). It asks
   the four questions a browser asks — `aria-label`, a resolvable
   `aria-labelledby`, a `<label>` wrapping or pointing at the control, `title` —
   and never accepts a placeholder. Hidden controls are skipped: the font
   picker's `input[type=file]` is `display:none` behind a button, which is an
   ordinary file picker and not something a reader can land on.
3. **A composite control** — one value as two or three inputs — where the row
   names the value and not the part. `app/test/controlnames.test.mjs` builds the
   three of them in a DOM and fails if a part is silent or if two parts share a
   name.

The first fence is the one that runs in the gate every time; the second needs a
browser and runs in CI; the third is nine assertions in the ordinary suite.

## What this record does not claim

The sweep is not a general accessibility audit. It says a control has *a name*
and nothing about whether the name is good, whether focus order makes sense,
whether the drawer traps focus, or whether anything announces the compile. Those
are separate questions with separate evidence, and #178 asked one of them.

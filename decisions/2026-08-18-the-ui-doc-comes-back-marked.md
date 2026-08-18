# 2026-08-18 · The UI doc comes back marked

`ksav-how-it-works.ksav` went out as a working document — every part of the
system, what it is for, and the mechanism under it, numbered so a comment could
name a line. It came back with the writer's haaros in the margins, written from
actually driving the assembled app rather than reading it. This is that wave. The
writer had not green-lit everything and said so plainly — *"I did not really
understand how to use them so much"* about the notes — so some of the list is a
fix and some is a feature built because the decision was handed back.

Everything below was verified in the running application over `/browse`, not
reasoned about, except where it says otherwise.

## 1 · The crash was the renderer, not us

One log survived: `TypeError: Cannot destructure property 'tile' of 'l.pop(...)'
as it is undefined`, thrown from `IntersectionObserver → onScrollChanged →
measure → DocView.updateInner → forward → advance`. That stack is entirely inside
`@codemirror/view`. `advance()` walks a **tile** tree — the incremental DOM
renderer CodeMirror rewrote in **6.39.0** — and `parents.pop()` returns undefined
when the walk runs off the end of the tree. 6.43.4 (what the installed app was
built against) shipped with a changelog line that reads *"Fix a regression … that
could corrupt the tile tree and cause crashes"*; ours was a case it did not
cover.

The crashing code does not exist before 6.39.0. `6.38.8` is the last release on
the mature `ContentView` renderer that shipped for years, so the whole class is
impossible there. `@codemirror/view` is pinned to `6.38.8`, with an `overrides`
block forcing every copy in the tree to it — `@codemirror/lint@6.9.6` had already
started importing `activateHover`, a tile-era export 6.38 does not have, so lint
is pinned to `6.9.5` alongside it. A writing tool that loses an evening to a
renderer regression is not a trade worth keeping for five minor versions of view
improvements.

Consequence worth recording: the live `EditorView` handle moved. It was
`document.querySelector('.cm-content').cmTile.view`; on the pre-tile renderer it
is `.cmView.view`. Any harness that reads the document out of the editor has to
follow.

## 2 · Italic was never on the page

The writer: *"The italic cannot be seen (maybe because of the font)."* Correct.
`#נטוי` is `emph`, `emph` is a *request* for an italic face, and no Hebrew family
this engine bundles — nor very nearly any that exists — ships one, so Typst
handed back the upright face and said nothing. The old answer was a warning that
told the writer to use bold instead.

The new answer is a synthetic oblique: `#נטוי`/`#italic` shear the laid-out frame
(`skew(ax: -12deg, reflow: true, emph(…))`), which is visible with any font and
is the same faux-italic a word processor falls back to. **On paper only** —
`context { if target() == "html" { emph } else { skew(emph) } }` — because HTML
export is reflowable web content where `<em>` is the right, semantic answer and
the browser renders the italic itself; the skew would have replaced the `<em>`
with a transformed span, which the HTML-export test caught. Because emphasis is
no longer invisible, it no longer warns: `slanting_commands()` stopped keying off
`emph(`, so the "no italic face" warning is now reserved for the `style:
"italic"` marks that genuinely remain upright.

## 3 · The rest of the list

- **Notes reached from the toolbar left the caret homeless.** *"I need to
  reposition my mouse into the brackets."* The caret was landing inside `[]`
  already, but `applyNoteChoice` never returned focus to the editor after the
  toolbar or the chooser modal took it, so the next keystroke went nowhere.
  `runtime.view.focus()`, and a bracketed snippet with no explicit caret marker
  now targets its empty `[]` instead of the end.
- **Enter added an item to the end of the list, not the middle.** `addItem`'s
  fallback used `lastItemEnd` when the caret sat between items; it now walks to
  the item at or before the caret, and the caret-before-the-first-item case
  writes the new item *before* item 0 rather than splicing a leading comma after
  `(`.
- **The first save prompted for a name on a document that already had one.** Ctrl+S
  on a document with no writable file binding now saves to the library it already
  lives in and says so, instead of forcing a file dialog. Binding to a file is
  what `File → Save as…` is for.
- **The compile-error banner could not be dismissed.** A `×` clears it and stays
  quiet while that same set of diagnostics persists, speaking again the moment
  they change.
- **`#מעבר_שורה` had no key.** It has `Mod-Alt-Shift-Enter` now — one Shift off
  `paraBreak`, so the Enter family reads as a ladder: paragraph, line, page.
- **Switching language nudged the source up.** Rebuilding the header reflows
  everything below it; the source scrollers are captured and restored across the
  swap.

## 4 · The design calls that were handed back

- **Scroll alignment is configurable and follows the caret.** The two panes line
  up on the top, middle or bottom of the viewport (`syncMatch`, default middle —
  the writer's own guess), and when the caret is on screen it is the caret's line
  that is matched rather than the line at the viewport edge. A plain click in the
  source now scrolls the preview to where that word — or that footnote marker —
  printed, the mirror of clicking the page to move the caret.
- **Note bodies can be placed per kind.** `noteBodyPlacement` lets footnotes stay
  inline while endnotes collect at the back of the file, keyed by where the note
  prints, falling back to the global preference.
- **Preview refresh has a cadence knob.** `live` keeps a page in step as it is
  typed; `relaxed` lays a big sefer out once the writer has stopped. It trades how
  often the layout runs, never whether it is right — a true speed/correctness
  trade lives in engine caching that does not exist yet, and this does not pretend
  to be it.

## 5 · Deleted, on the writer's word

*"Why do we keep them? This is not a museum."* — `prototypes/` (the React and
Flutter mocks, neither of which ever invoked Typst) is gone. The two superseded
note commands (`#הערה_א`, `#הערה_על_הערה`) were left standing this pass: deleting
a command that still compiles breaks any document that used it, and that is a
larger decision than a directory of dead mocks.

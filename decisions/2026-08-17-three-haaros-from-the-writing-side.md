# Three haaros from the writing side

**17 August 2026.** Three complaints, delivered together, from somebody using the
application rather than reading it:

> There is an annoying popup that says — Prose — not structure here to act on. I
> don't know why it popped up or what it is.
>
> Saving in browser is weird. I keep downloading. There is no way to save it
> without many downloads of one file.
>
> There is no way to swap right and left (swap panes).

Nothing in this record is a mechanism that failed. All three are the shape this
repository keeps producing: a working engine behind an interface that says the
wrong thing about it — the first two — and a mechanism that exists in the model
and has no door at all, which is the third.

## 1. A sentence that was written for a different moment

The context strip carries the operations for whatever structure the caret is in.
In plain prose there are none, so it used to empty itself and vanish, and a
margin note from an earlier wave said what that looked like:

> header was greyed out and no reason was given

Correct on both counts — the controls were greyed correctly, and nobody was told
why. The answer was to stop vanishing and say so: *"Prose — no structure here to
act on"*, with the one operation a writer standing in prose can actually perform
(make a list of what you have written) beside it.

Read from the writing side, that same strip is *"an annoying popup… I don't know
why it popped up or what it is."*

Both notes are right, and they are about two different moments. One writer went
looking for why a control was grey. The other was typing a paragraph. The first
wanted an explanation and the second got a notification about the absence of a
feature — and the one button on it is in the Insert menu and on `Ctrl+Shift+9`
besides, so the strip was not carrying anything unreachable.

**Decided:** keep the sentence, move the default. `Settings.proseStrip`, off.
Asked for in those words — *"it should be off by default"*.

Deleting it was available and was not taken. The first note is still a note, and
the writer who goes looking for why the ribbon is grey still deserves the answer;
what they do not deserve is being told it over every paragraph. `coverage.test.mjs`
asserts both halves — that the sentence is still built, and that nothing builds
it by default — because a deleted strip would pass the second assertion perfectly.

## 2. Three honest halves, composed into a lie

`files.ts` names three tiers and is straight about all of them:

| Tier | Where | Write back? |
|---|---|---|
| `tauri` | the desktop shell | yes, to a real path |
| `handle` | Chrome, Edge | yes, through File System Access |
| `download` | Firefox, Safari | **no** — a copy leaves and is never seen again |

`canWriteBack` is false for the third. `saveAs` falls back to a download where
there is no picker, and says *"Downloaded a copy — this browser can't write back
to a file"* when it does. `saveFile` offers a Save As to a document with nowhere
to go. Every one of those is correct on its own.

Composed, in Firefox, they made this:

1. `Ctrl+S`. No binding, so → Save As.
2. Save As. No picker, so → download. A copy lands in Downloads. A `download`
   binding is recorded.
3. `Ctrl+S` again. The binding cannot be written back to, so → Save As →
   download. `sefer(1).ksav`.
4. For ever. **No number of downloads ever produces a binding that can be
   written to**, so the loop has no exit.

And the copy left a binding behind, so the title bar named a file Ksav could
never write and hung an unsaved-changes dot beside it that no save could clear.

The failure is in the composition, which is why the fix is a named function
rather than a fourth `if` in an 11,000-line file:

```ts
export function saveRoute(binding, realFiles): "writeBack" | "pickAFile" | "libraryOnly"
```

`libraryOnly` is the case that did not exist. In a browser that cannot write
files, the text is already kept — the library copy is flushed on a debounce and
again before every save — so `Ctrl+S` says *saved in this browser*, with the way
to get an actual file on the hover, and downloads nothing. A file is **File ▸
Download a copy**: a thing the writer asks for, not a thing that happens to them.
The menu row is now called that, in both languages, instead of "Save a copy" —
a row that says *save* is a row whose next `Ctrl+S` is expected to update it.

`save.test.mjs` states the whole table, including the row that is the entire
point: `saveRoute(DOWNLOAD, false)` is `libraryOnly`, and no binding whatever
routes to a picker on a platform with no picker.

**Not attempted:** making Firefox write the file. It cannot; there is no API. An
honest sentence about what this browser can do is the whole of what was
available, and the desktop app is the answer for somebody who wants a file on
disk that stays current. Saying so in `docs/start-here.md` is part of the fix,
not a consolation for it.

## 3. A tree that could be rebuilt but not rearranged

`panes.ts` has been a tree since the arrangement wave: splits with a direction, a
fraction and two children. Splitting, closing, resizing, unlinking a scroll,
picking a shipped arrangement — all there. **Moving a pane was not**, in any
form. The only way to get the preview onto the other side was to pick a different
arrangement, which throws away the tree you built.

Asked for with a reference point:

> I think there should be a command to move any window to swap it with another
> window (like in hyprland). A drag would also be nice, but at the very least
> intuitive commands to swap 2 windows would help.

So: both, and `swap(tree, idA, idB)` for any two panes anywhere in the tree — not
a two-pane special case and not a whole-window mirror.

Three things fell out of it that were not obvious from the ask:

**The fractions stay with the place, not with the pane.** Swap a wide pane with a
narrow one and the wide slot stays wide, now holding the other pane. That is what
every tiling manager does, and it is what makes the second press of the same key
land exactly where the first started. Carrying the sizes along would have made
"swap" not an involution.

**Both leaves come through by reference.** The renderer decides which
`EditorView`s it may leave alone by comparing leaves with `===`. A swap that
rebuilt the two panes it moved would have cost the writer the two carets, scrolls
and fold states that are the entire reason to have two panes.

**"Left" is a question about the screen, and the tree cannot answer it.** Two
facts about the rendering decide it and neither is in the tree: a flex row in an
RTL container lays its first child out on the right, and under 900px `styles.css`
turns every split into a column whatever it was built as. So `panes.rects` takes
a `Layout` and `main.ts` reads both values off the live DOM — the computed
`direction` of a real `.pane-split`, and its computed `flex-direction` rather
than a `900` typed into a `matchMedia`. A breakpoint written down twice is a
breakpoint that will be moved once.

As it happens `main` is forced `direction: ltr` today — deliberately, so pane
*positions* are physical while the text inside each pane reads in its own
direction — so `a` is the left pane in Hebrew as well as in English. That is a
fact about a stylesheet, so it is read and not assumed: the day somebody mirrors
the window, the arrow keys follow on their own.

The drag needed one decision of its own. The handle is the pane's **strip**, not
the pane: a source pane is a text editor, and making the editor draggable would
take a writer's ability to select text with the mouse. And the drop target tests
for a private MIME type before it touches the event, so dropping text into a
CodeMirror pane — from another application, or from a selection in the same
document — still works.

## What was not done

- **A whole-window mirror.** Four directional swaps cover the two-pane case in
  one press, and a mirror is a different operation that nobody asked for.
- **Moving a pane to a *new* position** (hyprland's `movewindow` into an edge,
  which re-splits the tree). Swapping is the ask; re-splitting is a bigger
  change to the tree and a separate argument.
- **`focusLeft`/`focusRight`.** Moving the *focus* directionally is the obvious
  neighbour of this and was not requested. `panes.neighbor` is the whole of what
  it needs, so the day it is asked for it is four lines.

## The pattern, again

Two of the three are the family this repository has now named four times: the
mechanism works, and the surface lies about it or hides it. The third is the
other one: a model rich enough to express something the interface never offered a
way to say.

Neither is caught by a green suite, and the suite was green. What catches them is
somebody writing in the thing.

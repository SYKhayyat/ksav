# Marking up the UI inventory: one document at a time, and what the margins said — 11 August 2026

An inventory of every offer the interface makes — 156 of them across sixteen
sections — was written and handed over to be marked up. This is what came back,
what it means, and the one decision large enough to swallow a third of it.

The marked-up file is `ksav-ui-inventory.ksav`, kept outside the repository. Its
comments are `//` lines in the document source.

## How far the reading got, and what that means

Comments run from the header through roughly item 49. They stop there, and the
reason is stated in them: the caret could not be placed on or after a
spell-checked word, and source and preview were scrolled to different places.
The document became unpleasant to write in before it had been fully read.

**Items 50 to 156 are unreviewed, not approved.** Nothing below item 49 has been
seen by a writer, and no silence in this document should be read as consent to
anything in that range. The two defects that stopped the reading are therefore
the first work in the list, because until they are fixed the rest of the
inventory cannot be marked up at all.

---

# Part one — the decision: documents, panes, and tabs

Seven separate complaints in the margins turned out to be one missing concept.
They are worth listing together, because the shape only shows when they are
beside each other:

- A document has a title *and* a filename, and nothing explains the difference.
- There is no way to have two documents open.
- "New document" made the open document disappear.
- Undo after that restored the previous document's text **into the new
  document**.
- Reopening a document brought it back in prose mode.
- Reopening it brought the preview back left-to-right.
- Several views of one document — to read in one place while typing in another —
  is not possible at all.

None of these is a bug in the ordinary sense. **The application has no concept of
an open document distinct from the document**, and every item above is that
single missing idea showing through in a different place.

## What the Ctrl-Z did, exactly

Worth writing down, because it is the clearest possible evidence and because the
code already knows the rule it breaks.

`openDoc` in `app/src/main.ts` switches documents by dispatching a **text edit**
into one long-lived editor:

```
changes: { from: 0, to: view.state.doc.length, insert: next.body }
```

The `history()` extension on that editor is never reset. So a document swap
enters the undo stack as one large replace, and undoing it writes the previous
document's body onto the screen while the current document is the new one — at
which point the change listener persists it there. The writer does not get their
document back; they get its text poured into a different document, and both now
exist with one of them mislabelled.

The comment above `swapUntouchedStarter`, in the same file, states plainly:
*"there is no undo across a document swap."* The prose knows the rule. Nothing
enforces it, because the history extension has no idea a swap happened. This is
the repository's own defect family — a decision stated correctly in one place and
implemented in none — and it is the reason this decision is being taken at the
level of the model rather than as seven fixes.

## The model

Three things are currently one thing. They separate as follows.

**Document.** Content plus identity. Lives in the library. Owns its title, its
page setup, its direction, and its binding to a file on disk when it has one.
Direction is a property of the document, which is why the preview flipping on
reopen was wrong: it was reading a global.

**The open set.** Which documents are open, globally. One text per document, one
undo history per document. A document is never open twice — several views of one
document share its text, and nothing forks.

**Pane.** A view showing a document in a role: source or preview. Panes form a
split tree. Each pane owns its own caret, scroll, zoom, fold state, prose-or-raw
mode, and narrowing, and whether its scroll is linked to a sibling's.

Typing in one pane appears in every pane showing that document. Undo is one stack
per document regardless of how many panes show it.

The reference point is Emacs, and the fidelity is deliberate in one place and
deliberately broken in another. Kept: any number of windows onto one buffer, each
with its own point, mode and narrowing. Not kept: Emacs makes `buffer-undo-list`
buffer-local, so indirect buffers keep separate undo histories over shared text.
One undo history per document, shared by every pane, is the lesson from the bug
above — an undo stack with opinions about text it no longer owns is how a
document gets eaten.

## Tabs are arrangements, not documents

A tab remembers a **whole arrangement**: the pane tree, which document and which
role sits in each pane, and every pane's own view state.

The rule that makes this work, and without which it collapses: **a tab does not
own its documents.** The open set is global; a tab only remembers what was shown
where. Break that and the same document is open in two tabs with two carets and
two dirty flags, which is the forked text this model exists to prevent.

Three consequences.

**Plain document tabs are the degenerate case.** With no splits, one document per
arrangement, a tab is indistinguishable from a document tab. A tab's label
defaults to the title of the document in its focused pane, so until a split is
deliberately built the strip reads and behaves exactly like ordinary tabs.
Renaming a tab — "gemara", "letter" — is the moment it becomes a real
arrangement, and that is also the moment a writer would want to.

**Closing a tab closes the arrangement, not the documents.** They stay in the
open set. This is precisely why the keyboard switcher is not a convenience: with
arrangement tabs, the strip is no longer an inventory of what is open, so the
switcher is the only surface that tells that truth. Tabs for the eye, switcher
for the hand — two different facts, not two doors into one room.

**The `×` on a tab must never read as delete.** The Documents menu's `×` deletes
from the library today. Closing and deleting appearing as the same glyph in two
strips is not survivable.

## What this deletes rather than fixes

The strongest argument for the model is the number of separate complaints that
stop existing rather than getting fixed:

| Marked-up item | What happens to it |
|---|---|
| 29 — Layout cycles three arrangements | Ceases to exist. An arrangement is a pane tree you built or a tab we ship |
| 30 — Preview side cycles four positions | Ceases to exist. Same reason |
| 29 — the Layout chip silently turns prose mode on | Ceases to exist. Mode is per pane |
| 30 — several previews/sources of one document, scroll optionally unlinked | Becomes ordinary: several panes on one document |
| 21 — let the outline shift the panes instead of covering the source | The outline becomes a pane |
| 23 — same, for the notes pane | The same mechanism |
| 2 — document name versus filename | Each layer gets its own name because each layer now exists |
| 41 — new document destroys the open one | Not expressible: "new" adds to the open set |

Three chips, two drawers and a feature request, collapsing into one concept. That
is the evidence that it is the right concept.

## Costs, stated plainly

**Compiles.** A preview pane costs a Typst compile. Several previews of one
document share one; several documents cost several. Policy required: the focused
tab compiles eagerly, everything else on focus or on idle. Not optional — an
arrangement with three preview panes on three documents is three compiles the
moment it is selected.

**Persisted state grows.** Per-pane view state, multiplied by panes and tabs, and
it must survive a restart or arrangements are worthless.

**Everything written against "the document" moves.** Autosave, snapshots, crash
recovery, the outline, the notes pane, the review drawer, the status bar and the
document half of the settings drawer are all written against a singleton. Each
becomes "the focused pane's document's". Conceptually easy, tedious in practice,
and the place the bugs will actually be.

**Chrome budget.** The first observation in the inventory was that sixteen things
compete for the top of the window before a word is typed. The tab strip must
therefore hide itself when only one document is open — a single tab is pure
noise — and must never be the only route in.

## The order of work

- [ ] **1. Reset the undo history on document swap.** Two lines, and it stops the
      application from eating documents today. Independent of everything below.
- [ ] **2. The open set.** Multiple documents open, per-document state
      (mode, direction, caret, dirty flag, undo), the library and the open set
      separated in the Documents menu, and a keyboard switcher.
- [ ] **3. Panes.** The split tree, per-pane role and view state, scroll link as a
      per-pane flag. Shipped arrangements offered as a picker, not a cycle.
- [ ] **4. Tabs.** Arrangements, default-labelled by document, auto-hidden at one.
- [ ] **5. Retire chips 29 and 30**, and move the drawers onto panes.

Two and three are staged so the second does not force a rewrite of the first, and
one comes before all of it because it is small and the damage is live.

---

# Part two — defects reported in the margins

Three were traced to their cause while reading the comments; the rest are as
reported and not yet investigated.

## Traced

- [ ] **Undo across a document swap restores the old text into the new
      document.** `openDoc` swaps by text edit into an editor whose history is
      never reset; the comment above `swapUntouchedStarter` already states the
      rule that is not enforced. See part one.
- [ ] **A red caret in the source gutter, with nothing to say what it is.**
      `.cm-change-removed` in `app/src/styles.css` — a wedge in `--danger`
      marking a deletion since the last snapshot. Additions get a green bar and
      changes a blue one; a deletion has no line of its own, so it is a wedge at
      the boundary. It has no tooltip, no hover, no legend and no entry in help.
      The mark is correct and unlearnable.
- [ ] **A source note looks exactly like a footnote.** `מראה_מקום` in
      `engine/typst/ksav.typ` is `footnote(text(size: 0.92em, body))` — a
      footnote, eight per cent smaller. Its value is the *hidden* half: given
      `מקור:` it stores the canonical ref, which is what the source index
      collects and what allows the document to be reprinted in another citation
      style. Written without a ref it contributes nothing to the index, and
      nothing on screen says so. Two pieces of work: the visual difference
      belongs to the writer to configure (see the override model below), and the
      command must make its own point visible — that it carries a ref, or that it
      does not yet.

## Reported, not yet investigated

- [ ] **The caret cannot be placed on or after a spell-checked word.** Reported
      twice, and one of the two defects that ended the review. Highest priority
      after the undo fix.
- [ ] **Source and preview scroll out of alignment**, leaving the two panes at
      different places in the document. The other defect that ended the review.
      Suspected to be related to a document heavy in comments.
- [ ] **Italic does not apply.**
- [ ] **"Heading, any level" quietly inserts level 4.**
- [ ] **`#סימן` does not renumber** when one is inserted in the middle. A list
      does; this does not.
- [ ] **Reopening a document brings it back in prose mode.** Mode must be
      remembered, and per pane once panes exist.
- [ ] **The Layout chip silently switches prose mode on** — an undeclared side
      effect. Resolved by the model, listed here because it is live today.
- [ ] **A crash notice appears on opening a document**, which then loads
      correctly. Either the failure is real and hidden, or the notice is wrong.
- [ ] **Word import reports missing brackets** and then renders correctly. Same
      question: a wrong warning, or a silent repair that does not say so.
- [ ] **The history modal is in Hebrew regardless of interface language.**
- [ ] **The notes drawer is untitled.** It should read "Footnotes" in English and
      "הערות" in Hebrew.
- [ ] **Settings and other drawers cannot be closed without scrolling back up**
      to reach the close button.

---

# Part three — findings that outrun their own line

## The application knows and does not say

Five separate margin comments are one theme, and it is worth naming because the
fix is never "write more documentation":

- A disabled menu item carries a **reason** in the data — `insertions.json` has
  a `reason` field per command, and the matrix puts its reasons on tooltips. On
  screen the item drops to 38% opacity and says nothing. The comment beside that
  rule in `styles.css` argues explicitly that an item which cannot act "still
  says so, rather than vanishing". The argument was won and never implemented.
- The change gutter's red wedge means something exact and is unlabelled.
- Every command carries a one-line description in both languages in
  `engine/src/commands.rs`. It reaches the help panel and stops. A writer looking
  at `#אזור` in a menu cannot tell what a region is.
- A source note's entire value is invisible, as above.
- 113 commands are advertised across four surfaces — the Insert menu, the
  palette, autocomplete and the help panel — and the reader of the inventory
  could not reach them to test them. Zero of four.

This is the repository's established defect family one storey up. Not a lying
interface this time — a mute one. The information exists, in the right shape, and
does not arrive where a writer stands.

**Work:** a description at the point of use, not only in help; a reason on a
disabled control, visible without hovering; a legend for every gutter mark; and a
route to the command registry that a first-time reader actually finds.

## Global by default, per-instance by override

Stated on the styles drawer and applicable everywhere. The wanted model, in the
writer's own words:

1. A **global** layer sets the default for a kind of thing.
2. An **individual** setting on one instance overrules the global.
3. A checkbox on the global — *overrule* — stomps every individual setting.

It applies to heading styles (which are global today and must be at least per
level), list styles (which must be per list), and by extension tables, notes,
bands and streams. Per-instance heading styles — this heading 1 unlike that
heading 1 — is wanted, acknowledged as harder, and explicitly lower priority.

- [ ] Heading styles per level, then per instance
- [ ] List styles per list
- [ ] The `overrule` checkbox on each global
- [ ] The same treatment for table, note, band and stream styles

## The inventory's own spine is a fake list

The 156 numbered items in the inventory are `#bold[45.]` paragraphs, not
`numbered(item[…])`. This explains a margin comment — *"it looks like it is not a
list"* — and a second one, that "header" was greyed out and no reason was given:
the caret was in prose, so every list and table structure action correctly had
nothing to act on and incorrectly said nothing about why.

Two pieces of work, and one observation.

- [ ] A disabled structure action must say why, where the writer is looking.
- [ ] There is no verb for **"make this a real list"**, and none for "make this
      section its own section" — which is the same missing capability, noticed
      twice in different places.

The observation: the document cataloguing every feature of the product was
authored, by Claude, with bold text and typed numbers instead of the product's
own list. If the tool's own inventory is not written with the tool's list, that
is a finding about the list.

## The register of every note surface

Item 45 — the footnote category, 29 commands and half again the size of the next
largest — was called confusing, and a decomposition was proposed. Recorded as
given, because it is a better decomposition than the current one:

1. **Where note bodies live in the source.** Changeable after notes already
   exist, global with a per-note override, correctly sorted — a separate sort
   command if that is what it takes.
2. **Where a level-one note goes on the page.**
3. **Where level two goes, and level three**, and how each is formatted.
4. **Separately: fixed bands.** How many, what size, and what is allowed to live
   in one — a note, a note on a note, or an independent stream.
5. The remaining decisions, which are to be found rather than assumed.

The fifth point is the actual assignment: the axes above are the ones a writer
could name, and the rest are to be derived and brought back.

Related, from the same margins:

- [ ] Insert should not list a note-on-a-note as a top-level offer.
- [ ] Table is grouped with List in the registry. Nobody has explained why.

---

# Part four — everything else the margins asked for

Recorded as given. None of it is estimated or scheduled here.

**Text and the toolbar**

- [ ] Highlight should offer a colour.
- [ ] The paragraph-style dropdown needs: an "other" route that creates and
      applies a custom style, a numeric entry for a heading level, and a way to
      edit the style being applied without leaving it.
- [ ] Parentheses auto-close and that is liked. Quotes should too, and each
      should be independently switchable.
- [ ] A mark and a shortcut for a paragraph break that is not two newlines.
- [ ] Spell-check inside comments, switchable, off today.

**Folding and structure**

- [ ] Fold and unfold **by heading level**, or to a given depth.
- [ ] A collapsible region whose markers are invisible in the preview and in the
      output: `{abc}` folds in the editor, and what prints is `abc`.
- [ ] Move a whole section with or without its children; promote and demote the
      same way.
- [ ] The Format menu prints shortcuts. They must read the live, configurable
      bindings and never go stale.
- [ ] Contents does not belong in the Format menu.

**Views and drawers**

- [ ] Zoom in the source and in the preview.
- [ ] A float option for drawers, alongside the pane behaviour from part one.
- [ ] The notes drawer should expand to the whole note, and to the line the note
      sits on.

**Lists**

- [ ] Per-level numbering styles — letters at one level, digits at another.
- [ ] First item numbered 0 or 1, by choice.
- [ ] Paragraph breaks **inside** a list item that do not start a new item.

**Snapshots, export, modes**

- [ ] Automatic snapshots, or automatic turned off and taken by hand.
- [ ] An org-mode export, if it can be done.
- [ ] A page range is offered for PDF only. No reason has been given for that.
- [ ] Justify belongs in one control with right, centre and left.
- [ ] The vim and emacs modes are shallow — reportedly little more than save.
      Full implementations are wanted.
- [ ] Help entries should be clickable.
- [ ] Insert holds a great deal that is not insertion — bold, alignment. The menu
      taxonomy needs revisiting.

---

# Open questions

Not decided, and not to be assumed:

1. Which shipped arrangements are worth having as default tabs.
2. Whether narrowing — one pane restricted to a single siman while another shows
   the whole sefer — is wanted now or is a later addition.
3. What the compile policy should be for an unfocused tab: idle, on focus, or
   never until selected.
4. The remaining axes of the note apparatus, per part three.
5. Everything in inventory items 50 to 156, which nobody has read.

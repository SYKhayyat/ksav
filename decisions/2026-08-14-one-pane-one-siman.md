# One pane, one siman — 14 August 2026

Open question 2 from the marked-up inventory: *"whether narrowing — one pane
restricted to a single siman while another shows the whole sefer — is wanted now
or is a later addition."* Wanted now. What follows is the model, because the
obvious reading of "restricted" is the wrong one in a way that would not have
shown up until somebody printed.

## What a narrowed pane is, and what it is not

A property of a **pane**. The document is unchanged, every other pane onto it
still holds all of it, and — the decision the rest follows from — **the compile
is unchanged**.

The tempting implementation is to compile the section on its own. It is wrong,
and not marginally: page numbers, note numbers, running heads and the table of
contents would all belong to a sefer nobody has. A preview that says *page 1*
about the fourth siman of a 300-page sefer is a lie on the one output that is
paper. Narrowing is a smaller opening onto the same document, never a smaller
document.

The reference is Emacs, and the fidelity is exact in the half that matters: the
inaccessible portion cannot be seen and **cannot be edited**. The second half is
not decoration. Hiding text a pane can still write into is not narrowing; it is
a curtain over the part of the sefer you are not watching, and `Ctrl+A` followed
by any letter is one gesture away at every moment.

## Where the span lives, and why it is an anchor

In the pane's own `EditorState`, as a field, and not on the `Leaf` in
`panes.ts`. One reason decides it: the span has to move when the text above it
does. A writer narrowed to siman 3 who types a paragraph into siman 1 — in the
other pane, which is the entire point of narrowing — must still be narrowed to
siman 3 rather than to whatever now sits at those offsets. CodeMirror maps
positions through changes as a matter of course and every change reaches every
pane's state. Anywhere else means writing that mapping again by hand and being
wrong about it the day somebody pastes.

What is stored is an **anchor** — one position, the heading's own start — and the
section is re-derived from it on every read. So a siman written into stays
narrowed to all of itself, which a stored range could not do.

The anchor is the heading's start and not the start of its line, and the two are
different in a document where a heading does not begin its line. Stored snapped,
it resolves to the section *above*, so the pane would jump one siman up the
moment anything moved. `narrowing.test.mjs` holds the round trip; put the snapped
position back and it goes red.

## The refusal, and the one place it can be made

Not in a `transactionFilter` inside the state, which is where it belongs by
shape. Every pane's state receives every change, mirrored from the primary, so a
filter there would refuse *the other panes'* perfectly legal edits and leave this
pane holding a different document from everybody else — the document-eating bug
this whole model was built to prevent, reintroduced by a guard.

It is in the pane's `dispatch`, before the change is forwarded to the primary,
and `mirroring` is what tells a locally-typed change from a mirrored one. After
the primary has recorded it there is nothing left to refuse.

Refused **out loud**, naming the section: an edit that silently does nothing is
the same screen as an editor that has crashed.

## Named, not iconified

The strip shows `⊡ סימן ראשון ×`. A glyph can say *this pane is restricted*; only
the title can say *to what*, and that is the one question a writer looking at
four paragraphs where a sefer used to be actually has. It is the same reason the
fold got a name and the three source constructs got names that say which of them
reaches the page.

The control is there with one pane as well as with four. Working through one
siman without the rest of the sefer under the caret is a reason to narrow that
has nothing to do with splitting the window.

## What is not built, and it is not a gap in this

A **narrowed preview** — the pages of one siman while the pane beside it shows
the whole sefer — is a different piece of work, and it is filed as one rather
than left implied. It needs `reveal`, which is a full layout per question, so it
has a cost question of its own that this feature does not: the source half needs
no engine call at all. Its natural shape is that a linked preview follows its
narrowed source sibling, exactly as scroll-linking already does, which is why
nothing here had to be built to be extended into it.

## Two bugs in the pane model, neither of them this feature's

The two-pane half of the acceptance step — *one pane restricted to a single
siman while another shows the whole sefer* — was written because one pane is
not a test of the sentence the feature is. It failed twice, and neither failure
was narrowing.

**A split opened at the top of the document.** `makeState` built every state
with no selection, so a pane born from a split started at position 0. You split
a 300-page sefer precisely to hold two places at once, and the new pane had
thrown away the place you split in order to keep. A newborn source pane now
takes its caret from the pane it was split from, and is scrolled there after
the tree is attached — a detached view has no height, so a scroll asked for
while the tree is being built is a no-op that looks like a fix.

**And every character typed into a second pane arrived in front of the one
before it.** `ולד` came out `דלו`. A mirrored pane hands its change to the
primary and drops its own transaction; the change returns through
`mirrorChange`, which sends a changeset and nothing else, so this pane's cursor
is *mapped* through the insertion rather than placed after it — and a cursor
sitting exactly where text is inserted maps to before it. The caret never
moved. The originating pane is handed its selection back now.

That second one has been true since panes were introduced, and it is worth
being precise about why nothing saw it. `panes.ts` is a pure tree and is tested
as one: the tree was right. The text was right too — every pane held the same
characters. What was wrong was the *order they arrived in*, which is a fact
about a selection nobody sent, in a window with two editors in it. There is no
level at which that is a unit.

## What was found on the way

`chrome.test.mjs` refused `.cm-line`, correctly: it is not declared anywhere in
`src/`, and it should not be — a CSS rule written to satisfy a fence is the fence
marking its own homework. So the exemption is a claim the file executes. A `cm-`
class has to be findable in the installed `@codemirror/view`, which goes red the
day CodeMirror renames one — the same day the acceptance run would begin failing
for a reason invisible in its own output.

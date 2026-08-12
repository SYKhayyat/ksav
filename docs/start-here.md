# Start here

Ksav is a word processor for writing in Hebrew — a sefer, a shiur, a letter, a
kuntres. It compiles to PDF through Typst, it spell-checks Hebrew and English, and
it has one feature nothing else has: **a citation that opens the source it names.**

If you have five minutes, read
[Girsa's own start-here](https://github.com/SYKhayyat/girsa/blob/main/docs/start-here.md) instead. That page
walks the loop across both applications and it is the actual argument for either of
them. This page is Ksav on its own.

---

## The first document

It opens with one. Type into it.

You are in **prose view**: what you type looks roughly like what you get. Hold
**Alt** to see the markup underneath, let go and it is prose again. The `＃` button
in the header switches permanently if you prefer the markup — and some people do,
which is why it is one keypress away rather than a setting three menus deep.

The toolbar inserts everything. You do not have to learn the markup to use the
application, which is the whole reason prose view is the default: a Word
replacement that opens in raw syntax is asking you to learn a language before you
can write a sentence.

## The markup, if you want it

Every command takes brackets, and every command has an English name as well as a
Hebrew one:

```
#כותרת1[פרק ראשון]
#הדגשה[מודגש] and #נטוי[italic]
#הערה[a footnote, which lands at the bottom of the page]
#רשימה(
  פריט[first],
  פריט[second],
)
#נוסחה[x^2 + y^2 = z^2]
```

There are 115 commands. `#` in the editor offers all of them with what each one
does, so none is worth memorising.

## Notes whose text lives at the end

A note's prose does not have to sit in the middle of your sentence. Write a short
marker where the note belongs and the words at the end of the file:

```
בראשית ברא#הערה_בשם("1") אלקים
…
#גוף_הערה("1")[עיין רש״י שם, ובמה שכתב הרמב״ן.]
```

This is the org-mode arrangement, and it exists because a sefer whose notes
outweigh its text becomes unreadable *as a source* long before it becomes
unreadable as a page. It changes nothing about the printed result — the page
comes out identical, in any of the thirteen note layouts — so it is a choice about
your file, not about your sefer.

**`Ctrl+Alt+J`** is the whole workflow: on a marker it takes you to the words, on
the words it takes you back to the marker, and on a marker whose words you have
not written yet it writes the line and puts you in it. You never type a name.
**`Ctrl+Alt+Shift+F`** takes a note you already wrote inline and sends its prose
to the end; **`Ctrl+Alt+R`** brings it back. The notes chooser has both, and a button
that moves every note in the document at once.

Nothing else in the editor treats these as second-class. The notes pane lists
them where they print and takes you to their words; `⁑` inside one writes a note
*on* it, not beside it; right-click converts one to another layout or deletes
both halves at once; and the warning about notes that were collected and never
printed sees them too. In an English document the pair is written
`#note_named` / `#note_body`.

Hovering a marker shows its text without going anywhere. A marker whose words
were never written is marked in the editor and prints a red `?` — the one thing
worse than an unwritten note is an invisible one.

## Whitespace you can see and the page cannot

Typst has an opinion about the whitespace you type. A newline sets a **space**; a
blank line starts a **paragraph**. So laying the source out to be read — breaking
a long line, standing a nested command on its own — costs you something on the
page.

Most of it costs nothing, in fact: runs of spaces, tabs and indentation all
collapse to one space before they reach the paper, so indent freely. The line
break is the only one that misbehaves, and **`Ctrl+Shift+/`** is the escape from
it: it breaks the line in the editor and prints nothing at all. What it writes is
a comment across the break —

```
ואמר הרב/*
*/בשם רבו
```

— which sets as one unbroken run, because whitespace inside a comment is eaten. A
`//` comment will not do it: that one ends *at* the newline, so the newline is
still there and still prints. `Ctrl+/` is the neighbouring key and the neighbouring
idea — it hides *text* from the page rather than a line break.

In prose view a hidden break is invisible, as it should be; put the cursor in it
(or hold Alt) and it comes back so you can delete it. One caveat: splitting a word
across a hidden break splits it for the spell-checker too, which will then
underline both halves. Between words, which is the usual case, nothing notices.

## Compiling

It compiles as you pause, into the preview beside the editor. A page takes
50–120 ms; a whole document of 13–43 pages takes 0.4–2.9 seconds, and that happens
off the UI thread so the window never freezes while it works.

If something does not compile, the message says **which line** and offers what to
do about it — and if it can be repaired mechanically, there is a button that
repairs it.

## Finding your place, both ways

**Click a word in the preview and the cursor goes to that word.** Not near it —
on it. The editor asks the compiler which piece of your source produced the ink
under your finger, so a page with four stacked note bands answers as exactly as
a page of plain text. A click on a margin, a running head or a band rule moves
nothing, because you did not type those.

**`Ctrl+Alt+P` does the reverse**: it finds where the text under your cursor
printed, scrolls the preview there and rings it. Useful when the note you are
writing is one of several on the page and you want to see which. If your words
printed in more than one place — a note set in both a band and an endnote list —
it says so and marks the first.

Both directions lay the document out to answer, so they take about as long as a
compile. That is why the second one is a key you press rather than something
that follows your cursor around.

## Hebrew and English on one line

Source that mixes scripts used to jump around while you typed in it, and the two
reasons were separate.

**Every line now reads its own way.** A paragraph of English inside a Hebrew
sefer is laid out left-to-right, with its full stop on the correct side. A line
with no letters in it — a blank one, or a line holding only `]` — takes the
direction of whatever it sits inside, rather than the direction of your operating
system. That last one is what used to make the caret behave strangely on the
blank line between two Hebrew paragraphs.

**The commands are held apart from your prose.** `#צבע(rgb("#b91c1c"))` in the
middle of a Hebrew sentence stays in one piece instead of scattering its brackets
through the words around it.

When that is not enough — and on a line of one Hebrew word, one English word and
a bracket, eventually it will not be — select the run and press **`Ctrl+Alt+X`**.
Press it again to undo. And any directional control character already in your
file is now drawn as a small labelled tag (`RLM`, `LRI`, …), so a stray one is
something you can see rather than something you find by deleting characters until
the line settles.

## Saving

`Ctrl+S` saves the file. It also saves itself as you type, into the browser's own
store, and closing the tab asks first if there is anything unsaved.

A `.ksav` is **text**: your words, your markup, and this document's page setup, in
one readable file. It diffs, it goes in git, and somebody can read it with `cat` in
ten years. Export to PDF for reading and `.docx` for somebody who needs Word — with
the caveat that the `.docx` is Typst's HTML in a Word envelope and the footnote
apparatus flattens, which the app tells you when you do it.

## Page setup belongs to the document

Font, paper, margins, direction, columns, spacing, header, footer — all of it is a
property of *this sefer*, not of the application. So opening an English document and
then a Hebrew one does not mean changing the direction by hand.

Theme, zoom, which side the preview sits on and whether spell-check is running are
about **you**, and stay put across documents. The settings drawer says which is
which, with a heading between them.

When you have one looking right: **set as default for new documents**.

The setup goes into the `.ksav`, so the sefer opens laid out the same way on
somebody else's machine — and only what you actually changed goes in, which is why
a document you have not restyled is still a plain text file rather than JSON.
*Set as default* applies to the next document you start, not to one you open: a
file that says nothing about its layout is laid out the shipped way, on every
machine, rather than the way the person opening it likes new documents.

## Spell-check

Hebrew and English, both at once, in one document. It knows which script a word is
in and checks it against the right lexicon — 262,648 Hebrew entries and 96,184 English
ones.

It will underline your rebbe's name. Right-click → add, and it is in your
dictionary — which on the desktop app is **a file you own**, so it survives a
reinstall and you can put it in Dropbox. `KSAV_DICTIONARY` points it wherever you
like.

Suggestions are ordered by how close a word is, then by whether the mistake looks
like a transposition, then by how common the word is. `teh` gives you `the`.

## What this does not do

- **Nobody has written a real sefer in it.** Three separate audits call that the
  most important line in any of them. It is still true.
- **No real-time collaboration**, and none is planned. Review comments are per
  reviewer and a document travels as a file.
- **`.docx` is an exit, not a workflow.** See above.
- **Track changes is thinner than Word's.** Insertions, deletions and comments,
  attributed — not Word's full apparatus.

## Next

- [`shortcuts.md`](shortcuts.md) — all 58 bindings, both languages, generated from
  the source so it cannot drift.
- [`from-word.md`](from-word.md) — what is better and what is worse, in a table.
- [Girsa's own start-here](https://github.com/SYKhayyat/girsa/blob/main/docs/start-here.md) — the loop, which is
  the point.

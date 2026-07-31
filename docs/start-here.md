# Start here

Ksav is a word processor for writing in Hebrew — a sefer, a shiur, a letter, a
kuntres. It compiles to PDF through Typst, it spell-checks Hebrew and English, and
it has one feature nothing else has: **a citation that opens the source it names.**

If you have five minutes, read
[`Girsa/docs/start-here.md`](../../Girsa/docs/start-here.md) instead. That page
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

There are 104 of them. `#` in the editor offers all of them with what each one
does, so none is worth memorising.

## Compiling

It compiles as you pause, into the preview beside the editor. A page takes
50–120 ms; a whole document of 13–43 pages takes 0.4–2.9 seconds, and that happens
off the UI thread so the window never freezes while it works.

If something does not compile, the message says **which line** and offers what to
do about it — and if it can be repaired mechanically, there is a button that
repairs it.

## Saving

`Ctrl+S` writes the file. It also saves itself as you type, into the browser's own
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

## Spell-check

Hebrew and English, both at once, in one document. It knows which script a word is
in and checks it against the right lexicon — 269,385 Hebrew entries and 96,184
English ones.

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

- [`shortcuts.md`](shortcuts.md) — all 29 bindings, both languages, generated from
  the source so it cannot drift.
- [`from-word.md`](from-word.md) — what is better and what is worse, in a table.
- [`Girsa/docs/start-here.md`](../../Girsa/docs/start-here.md) — the loop, which is
  the point.

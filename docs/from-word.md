# Coming from Word

You write in Word. It works, everyone has it, and you have twenty years of muscle
memory in it. This page is about the four things it does badly for a Hebrew sefer,
and the one thing Ksav does that Word cannot do at all.

If none of the four have ever bothered you, keep using Word. That is a real answer
and this page will not pretend otherwise.

---

## The four

### 1 · Hebrew with nikud

Word sets nikud. It does not set it *well*: the points collide with descenders,
the te'amim sit wrong over a final letter, and line spacing that looks correct for
Latin type makes a menukad page unreadable. You have almost certainly fought this
with manual leading.

Ksav typesets through Typst with fonts chosen for pointed Hebrew, and the leading
is generous by default because that is what the language needs rather than what the
template inherited from an English default.

### 2 · Footnotes in a mixed-direction document

A Hebrew document with an English footnote, or the reverse. In Word the footnote
separator flips, the numbering aligns to the wrong margin, and a footnote that runs
over a page break takes the direction of whichever paragraph it lands next to.

`#הערה[...]` and the direction is a property of the document, so it is one answer
and not a per-paragraph fight.

### 3 · Numbering that is not Arabic

`hebrew_numbering` gives you א, ב, ג as page numbers and in lists. Word can be made
to do this. You know how much of an afternoon it costs.

### 4 · The document is not a file you can trust

A `.docx` is a zip of XML that renders differently across three versions of Word.
A `.ksav` is text: your words, your markup, and your document's own settings, in one
readable file that diffs, goes in git, and will still open in ten years because
somebody can read it with `cat`.

---

## The one thing Word cannot do

**A citation that opens the source.**

You are writing about a sugya. In Girsa you find the mekor, press Girsa's copy key,
and it lands in your Ksav document with the mareh makom under it. You compile.
**In the PDF, that citation is a link, and clicking it opens Girsa at that line.**

Not at the sefer. Not at the chapter. At the line. Three weeks later, on another
machine, from a PDF you emailed to somebody — because what was stored was the
reference and not a string that looks like one.

There is nothing in Word, or in anything built on Word, that does this. It is the
entire reason these two applications exist. See
[Girsa's own start-here](https://github.com/SYKhayyat/girsa/blob/main/docs/start-here.md).

---

## What you will miss, honestly

| | Word | Ksav |
|---|---|---|
| Track changes | mature, everyone knows it | review comments, per reviewer, and less than Word's |
| Tables | rich | `#טבלה`, and the toolbar builds one |
| Anybody can open your file | yes | `.ksav` is ours; export to `.docx` and PDF |
| Real-time collaboration | yes | no, and none is planned |
| `.docx` fidelity | it is the format | **Typst's HTML in a Word envelope; the apparatus flattens** |
| Somebody has written a book in it | millions | **nobody, yet** |

That `.docx` row is worth reading twice. Exporting to Word is a compatibility exit,
not a workflow — the footnotes and the multi-stream apparatus flatten, and the app
says so when you do it rather than letting you find out from your printer.

And the last row is the one that should decide it. Ksav compiles, spell-checks
Hebrew and English, has 148 bilingual commands and twelve templates that all build.
Nobody has written a sefer in it. Everything here is a promise that has been tested
by its author and not by its use.

---

## The first ten minutes

1. It opens in **prose view** — what you type looks like what you get. `Alt` reveals
   the markup underneath; the `＃` button in the header switches permanently.
2. `Ctrl+S` saves. It also saves itself as you type, and the unload guard means
   closing the tab asks first.
3. `#` in the editor offers every command, in both languages, with what each does.
4. The toolbar inserts the right form of everything, so you never have to learn that
   `#נוסחה` takes brackets *or* a string. (Both work. That was a bug and it is
   fixed.)
5. **Page setup is per document.** Font, paper, margins and direction are properties
   of the sefer, not of the application — so opening an English document and then a
   Hebrew one does not mean changing the direction by hand. *Set as default for new
   documents* is in the settings when you have one looking right.
6. Spell-check is on, Hebrew and English, and it will underline your rebbe's name
   until you add it. Right-click → add. Your dictionary is a file you own.

See [`shortcuts.md`](shortcuts.md) for the rest.

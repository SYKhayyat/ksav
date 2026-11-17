# Your first document

Five minutes, one page, no markup required. This is the shortest path from an
empty window to a PDF you can send. Everything else is in
[start here](start-here.md).

## 1. Open it

The desktop app from the [latest release](https://github.com/SYKhayyat/ksav/releases),
or the browser build. Either way Ksav opens with a document already in it —
a short one that shows what the commands look like. Type into it.

## 2. Type

You are in **prose view**: what you type looks like what you get, and the page on
the right is the real typeset page, rebuilt as you type. Nothing to press.

- **Enter** makes a paragraph. A blank line is fine; one Enter is enough.
- **Ctrl+Z** undoes. **Ctrl+Y** redoes.
- **Alt** (hold it) shows the markup underneath the prose. Let go and it is prose
  again. You never have to type markup — the toolbar and the shortcuts insert it
  for you — but it is there and it is legible.

Hebrew and English on one line is ordinary: type them, and the bidi direction
follows the text. A number, a quotation in English, a `(parenthesis)` — all of it
lays out the way it should without a setting.

## 3. Save it

**Ctrl+S**. The first time it asks where the file goes; after that it writes back
to the same file.

- A dot in the title bar means *the file on disk is behind what is on screen*.
  No dot means they agree.
- Ksav also writes to the same file by itself every thirty seconds — but only
  when the file has not been changed by something else in the meantime. A file
  that another program touched is never overwritten from a timer; Ksav asks.
- Every document is also kept in Ksav's own library, so closing the tab is not
  the same as deleting the document.

## 4. Get it out

**File ▸ Export PDF** writes a PDF of the whole document. The dialog's filter is
per format and the status line names the file it wrote.

The other formats in that menu are there when the destination needs them: `.typ`
for somebody who will compile it themselves, HTML for the web, Word for an editor
who will mark it up, and plain text, Markdown or Org when the words are wanted
without the layout.

**File ▸ Print** goes to the system print dialog with the pages already laid out.

## 5. What to do when it looks wrong

- **The page did not change**: the compile failed, and the message above the page
  says why. A *warning* is not a failure — the page is still there and still
  complete.
- **The save went somewhere else**: the status line names the file after every
  write and the title bar carries the name. Both are worth a glance, and both are
  the answer to "where did it go".
- **Something is underlined**: that is the spell checker, or a closer the document
  is missing. The underline is not attached to the file — nothing is rewritten
  until you accept a correction.

Nothing is uploaded and nothing is collected. There is no account, no sync and no
telemetry: a document leaves the machine only when you export it or send a link.

## Where next

- [The markup, when you want it](start-here.md#the-markup-if-you-want-it)
- [Notes and where they print](start-here.md#where-a-note-goes-is-a-setting-not-a-command)
- [Shortcuts](shortcuts.md) — or press **F1** in the app
- [When something goes wrong](troubleshooting.md)

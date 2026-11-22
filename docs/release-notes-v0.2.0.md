# Ksav v0.2.0 — what changed since v0.1.1

Sixteen weeks of work, most of it in places a writer only notices when they are
wrong: the page, the notes, the save, and the toolbar that was missing.

## The toolbar is there, and it works

Every build between v0.1.1 and here drew a red "registries failed" line where the
toolbar belongs. The engine was refusing its own command list, and nothing in the
test suite could see it because nothing loaded a built app. Fixed, and the fence
that would have caught it in a second now exists.

The window also fits a 1366×768 screen, its groups no longer overprint each
other, and on a NixOS machine running Wayland it starts on the backend that can
actually draw a page.

## Writing

- **Tags are legible.** Nested tags indent by depth up to a limit you set, every
  line outside the tag your caret is in is dimmed, and clicking an opening
  bracket selects the whole tag rather than moving the caret into it.
- **A folded tag says how much it is hiding** — `#הערה[… 480 אותיות]` — and you
  can fold without opening first.
- **Invisible characters can be shown**, so a doubled space or a stray
  non-breaking space is visible instead of mysterious.
- **A minimap** answers "how much document is left", where the ruler answers
  "where am I".
- **Arrow keys can step over markup** rather than through it. Off by default
  while it is judged; the raw motion is one setting away.
- **Inserting a command writes it in the interface's language**, so an English
  document no longer gets Hebrew command names from the menu.

## Page and notes

- **A footnote that spills onto the next page now says so**, so the reader can
  tell which note the continuation belongs to.
- **Note and citation markers are raised superscripts**, as sefarim set them,
  instead of full-size text in the line.
- **Deep heading levels wrap as phrases** rather than one letter per line, and
  opposing margins can no longer eat the text column between them.
- **Paragraph spacing inside a native footnote entry is settable.**

## Export

- Export no longer preserves the editor's layout markers, and Org, Markdown and
  plain text stop adding breaks that were never in the document.
- **Definition lists and verse citations export as their own shape**, not as one
  space-joined paragraph, and a definition list no longer exports the commas
  that separated its rows.
- Typst export is a document rather than the whole prelude inlined with it.
- Word export says plainly what it produces instead of writing HTML with a
  `.doc` name.
- Reflowable HTML carries the document's direction.
- On the desktop, **PDF export asks where to put the file**, and cancelling is
  silent rather than an error.

## Saving, and the disk

- **A save the disk refused now says so.** Before, a full volume or a read-only
  file was reported as "the dialog was closed", on both the desktop and the
  browser. Both tiers now name the cause, in Hebrew and English, and the words
  for a full disk and a read-only volume exist for the first time.
- A compile that panicked was reported as *a slow compile still running*; it now
  says it failed, and the slot it was using is given back.
- A table asking for 999,999,999 columns no longer takes the process down; the
  prelude refuses it and names the limit. A document of brackets that took two
  minutes of CPU is refused in under two seconds with a sentence naming what it
  found.

## Speed

Measured rather than assumed: at sefer size a compile costs about 3.4 s and the
pane refresh costs 86 ms of main-thread time per 200 ms of typing, down from a
path that bypassed the worker. A 166 KB document full of brackets used to take
two minutes; it is refused, and a 563 KB sefer lays out in 0.22 s.

## Known limits, plainly

- **A full disk cannot be tested on Linux without root**, so that one case is
  unverified here rather than passing quietly.
- **Two previews on screen do not sync**; each follows its own source. The
  shipped two-preview arrangement turns caret-follow off rather than half-work.
- **Arrow-key layout resolution and the editor disagree per keyboard layout** —
  the split is recorded, not fixed.
- **There is no auto-update yet.** Getting a new build means downloading it.
- **No LaTeX backend and no structured editor.** That is the next big decision,
  not a regression, and nothing in this release narrows it.

## Installing

The Linux build ships a `.deb` and an AppImage; Windows ships an NSIS installer.
Neither is code-signed yet, so Windows will show a SmartScreen warning: *More
info → Run anyway*. On NixOS use the flake rather than the AppImage; the AppImage
bundler needs a `/usr/bin` userland that NixOS does not have.

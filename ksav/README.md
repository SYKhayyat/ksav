# כְּתָב · Ksav

A Hebrew-first writing system built on **real Typst compilation**. The goal:
there should be no reason for a bochur — or any Hebrew writer — not to use this.
It should be the standard for Hebrew writing.

This is a ground-up rewrite. The two earlier prototypes
([`prototypes/react-app`](../prototypes/react-app) and
[`prototypes/flutter-app`](../prototypes/flutter-app)) both *mocked* the renderer —
neither ever invoked Typst. This engine runs the genuine Typst compiler.

This page is long because it is the reference. You do not read it front to back.

| | |
|---|---|
| **Writing in it** | [Using Ksav](#using-ksav) — the first five minutes, the menus, notes, styles, the keyboard |
| **Why it is built like this** | [Core idea](#core-idea), [Features](#features-engine), [The editor](#the-editor-spa) |
| **Building it** | [Develop](#develop), [The shared crates](#the-shared-crates), [Test](#test), [Use it](#use-it) |
| **Shipping it** | [a single binary](#ship-a-single-self-contained-binary-server--desktop), [the browser build](#ship-an-offline-no-server-web-build-wasm), [the desktop app](#desktop-app-tauri) |
| **Talking to the engine** | [The engine's services](#the-engines-services), [Library API](#library-api), [Storage](#storage) |
| **Making a change** | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| **The other half of the product** | [`../docs/girsa.md`](../docs/girsa.md) |

## Using Ksav

**Press `F1`.** The help panel is *generated* from the application — every
shortcut, every operation, every command, in whichever language the interface is
set to, and showing your own key bindings rather than the shipped ones. This
section is the orientation; `F1` is the reference, and it is the one that cannot
go out of date.

### The first five minutes

Open it and type. Ksav starts in **prose mode**, so what you see is the document
rather than the markup — hold `Alt` to reveal the commands underneath, or press
the `＃` chip to stay in the raw source. The page on the left is real Typst
output, recompiled as you type.

Everything structural works the way a word processor works:

| You want to | Do this |
|---|---|
| a bullet list | the `•` button, then **Enter** for the next bullet |
| a list out of paragraphs you already typed | select them and press `•` — or **Format ▸ Make this a real list**, which reads the `1.` or `א.` you typed and takes it off |
| a line *inside* a bullet | **Shift+Enter** |
| a second *paragraph* under one number | **Ctrl+Enter** |
| a sub-bullet | **Tab** (and **Shift+Tab** to come back out) |
| a heading | the paragraph-style dropdown in the toolbar — nine levels, or type the number in the box beside it |
| a style of your own | the same dropdown ▸ **New style…** |
| a highlight in a particular colour | the swatch beside the 🖍 button |
| a paragraph break with no blank line | **Ctrl+Alt+Enter** |
| to move a whole section | **Alt+Shift+↑/↓**, subsections and all |
| a table | the Table menu, then the ribbon that appears |
| a footnote | the Notes button, or `Ctrl+Shift+F` |
| a table of contents | **Insert ▸ Table of contents**, or `Ctrl+Shift+O` — it goes at the top, once |
| to find out what else there is | the `#` chip, or `Ctrl+Shift+K`: every command there is, grouped and searchable |

### The context ribbon

Put the caret inside a list, a table or a section and a strip appears **under the
toolbar** with everything you can do to it — add a row, merge cells, widen a
column, promote a heading, move an item. Controls that cannot act here are
greyed rather than hidden, so the strip is the same shape every time.

The same operations are in the **Format** and **Table** menus, each showing its
keyboard shortcut, for when you are looking for a feature rather than already
standing in one.

### Which menu holds what

One rule, and everything follows from it: **Insert puts something new on the
page, Format changes text that is already there.** So notes, images, formulas,
breaks, lists and the table of contents are under Insert; bold, colour,
alignment and the rest of the ways to dress existing text are under Format,
alongside the heading and list operations; and a table has its own menu because
it brings twenty operations with it. Every row that has a keyboard shortcut
prints it, as you have it bound — not as it shipped, and not as a chord a
keyboard mode has taken.

**Sources** is the fourth, and it follows from the same rule by not fitting
either half of it: looking a phrase up in the library, making the citations in
a selection live, and asking the library for every citation in the document
again are all questions *about* words already written. None of them puts
something on the page and none of them changes how text looks.

If you would rather not think about which menu, press `Ctrl+Shift+K` or the `#`
chip: that drawer holds every command the registry offers, grouped, searchable,
with nothing cut off at the bottom. (The two commands that have been superseded
are the exception — they still compile, so nobody's sefer breaks, and they are
no longer pointed at.)

### Notes

A footnote is `Ctrl+Shift+F` — or `Ctrl+Alt+F`, which is Word's. An endnote is
`Ctrl+Alt+D`, Word's again. Both are on the toolbar (`†`, `⁋`) and in **Insert**,
where a Word user looks first.

A note *on* a note is `Ctrl+Shift+N`, and it reads the caret: in prose it makes
an ordinary note, inside a note a second-tier one, inside two a third. **You
never convert the note you already wrote** — `#הערה` *is* the first tier, one
function in the prelude, so a sub-note simply hangs off it. (The band layouts,
`#מדור_` and `#מדף_`, are the exception: those are a different apparatus, not
footnotes, and the outer note has to be one of them. Right-click converts.) It
lives in **Insert** and the Notes chooser rather than on the toolbar — it is a
real sefer apparatus and a rare one, and the toolbar is expensive.

The `†☰` chip opens a **notes pane**
listing every note in the document — click one to jump to it, right-click it (in
the pane or in the text) to convert it, delete it with its marker, or hang
another note off it.

Underneath, Ksav supports fourteen note layouts — page-bottom footnotes, endnotes,
notes at the end of each section, sidenotes down one or both margins, fixed bands
at the foot of the page, any number of parallel streams each in a fixed region,
two separately-numbered blocks, and combinations. The
**Notes** button asks two questions you can answer — *where does it print* (the
foot of the page, the end of a section, the end of the document, the margin, a
second volume) and *how are the layers arranged* (one series, stacked bands,
parallel streams, parallel streams in fixed regions, fixed regions, each layer
somewhere else) — and the fourteen
layouts are the cells of that grid. A combination that does not exist is greyed
with its reason rather than hidden. Picking a cell renders a real page, set from
your own text, instead of a diagram.

**Side notes** answer three things a reader asked for. Their width is
`#הגדרות_הערות_צד(יחס: …)` and the wrapper no longer writes over it — it used to
default its own parameter to a number, so a document that configured the width
got the wrapper's default instead. Their marker follows the document: a Hebrew
sefer numbers them א, ב, ג and an English one 1, 2, 3, read off the document's own
language rather than set a second time. And `#עם_הערות_דו_צד(צדדים: "ימין")`
reserves **one** margin instead of two, so the text can sit beside a peirush
rather than only between a pair of them — which was a layout the apparatus could
not express at all.

The chooser also writes each layout's *scaffolding*: the dump call that prints
collected notes, the wrapper the margin layouts need, the configuration line that
has to sit at the top of the file. Forgetting it is the commonest way one of
these looks broken — the notes are collected and then never printed.

You can mix them freely: footnotes at the foot of the page and endnotes at the
back, in the same document, exactly as in Word — and they no longer both print
`¹`, since the back matter takes a numbering of its own.

### Channels

Those fourteen layouts used to be spelt as eighteen different commands, and they
were never eighteen ideas — they are a cross product of three arrangements by
three tiers, exposed as cells rather than as axes. `#מדף_ב` is not something a
writer would want to say; it is *tier two, printed at the foot of the page*,
which is two settings wearing a command's clothes.

So there is one concept underneath them. A **channel** is a note stream: it owns
its numbering, and **only notes in the same channel number together** — that is
what makes it a channel rather than a style. Two things describe one:

- a **source** — the body text, or *another channel*, which is what makes it a
  note on a note;
- a **placement** — the foot of the page, the end of the section or the end of
  the document, optionally into a named **region**: a fixed area with a size of
  its own that any number of channels can be pointed into.

```typst
#ערוץ("ביאור", מיקום: "רגל", גובה: 3cm)   // a peirush in a fixed band
#ערוץ("שער", מקור: "ביאור", מיקום: "סוף")  // notes on it, collected at the back

בראשית ברא#הערה(ערוץ: "ביאור")[עיין רש״י#הערה(ערוץ: "שער")[ובמה שכתב הרמב״ן]].

#הצג_אזור("שער")
```

The whole point is the line you do not have to touch. Move that peirush from the
foot of the page to the back of the sefer and one word changes — `מיקום: "סוף"` —
and not one of three hundred notes is retyped. That could not be done while the
arrangement was welded to the command that got typed, which is also why *"change
where the note bodies live after the notes exist"* was possible in one direction
only.

**Styles ▸ Note channels** is that model as controls: pick a channel, see what it
hangs off and where it prints, change either. The eighteen commands still work
and still mean what they meant — a document that has them keeps compiling — and
`#הערה_א` and `#הערה_על_הערה`, which were second names for `#הערה` and
`#הערה_ב`, are no longer offered anywhere.

There is a second, independent choice in the Notes panel: whether a note's
**text** lives inline or at the end of the file (the org-mode arrangement). The
page comes out identical either way; only the source changes — and every way of
inserting a note honours it, because the toolbar, the menu, the keyboard and the
panel all go through one producer. It is changeable **after** the notes exist,
in both directions: send every note's prose to the end, bring every one back,
and sort the list at the foot of the file into the order of the text.

The rest of the editor cannot tell the difference either, which took a second
pass to be true: the notes pane lists a deferred note under the marker where it
prints and jumps to its prose at the end of the file, `⁑` inside a deferred body
writes the next tier down, right-click converts it by rewriting where it prints
and deletes both halves at once, and the "collected and never rendered" warning
sees a deferred `#הערות_בסוף` note as readily as an inline one. In an English
document the pair is written `#note_named` / `#note_body`, because a generated
command follows the document's language rather than the interface's.

**Styles ▸ Notes** exposes what the apparatus can actually do: per-tier size,
slant, colour, indent and numbering scheme. It writes the same `#הגדרות_הערות`
line you would type by hand, which is what keeps the panel and the markup from
drifting apart.

**Styles ▸ Fixed regions** does the same for the band heights, and that one moves
the page rather than the ink: the engine reserves exactly the declared total at
the foot of every page, so the text area shortens to match and the page number
stays where a document with no apparatus puts it. Add and remove regions there as
you like — the engine has never had a limit of three — and give each one a height
in centimetres or as a **percentage of the page**, which is the one that survives
the sefer moving from A4 to A5.

**Styles ▸ Parallel streams** is the same panel for the other page-foot
apparatus. A stream is an independent apparatus with its own numbering — a
peirush, a mareh mekomos, a nuschaos band — and any number of them can sit at the
foot of one page, stacked or side by side, each pinned to a region of its own
height. They reserve that page foot exactly as the bands do, and a document that
carries both pays for both.

Writing note bodies at the end of the file keeps them **in the order of the
text** — a new note is filed where its marker belongs, not appended — and
*Sort the bodies into the order of the text* repairs a document written before
that was true, renumbering as it goes and leaving any name you chose yourself
alone.

The tiers are numbered א,ב,ג over 1,2,3 — the שער־הציון arrangement, the
commentary lettered and the he'aros on it numbered.

### Lists

A list numbers itself, so the numbering is a setting rather than something you
type. **Styles ▸ Lists** sets it **per level** — digits for the simanim, letters
for the se'ifim under them, roman numerals under those — which is how Typst has
always read a nested list's pattern and which no control could write until now.
The same section says which number a list starts at, for the people who want 0.

Paragraphs you have already typed become a list by selecting them and pressing
the bullet or number button. **Format ▸ Make this a real list** is the one that
reads what is there: `1.` makes a numbered list, `א.` a Hebrew-lettered one, `-`
bullets — and whichever it picks, the numbering you typed by hand comes off,
because that is the job the list is taking over.

### Styles of your own

The paragraph-style dropdown lists body text, nine heading levels, and — once
you have made any — **your own styles**. **New style…** asks for a name and what
it looks like, makes it, and puts it on the paragraph in one act. The pencil
beside the dropdown opens whatever is applied here for editing: for a heading
that is the Headings section at *this* level, for one of your own it is that
style's own knobs, and a change there shows everywhere the style is used.

A style is kept **in the document**, as one line:

```typst
#let שאלה(תוכן) = עיצוב(תוכן, גודל: 1.15em, משקל: "bold")
```

so it travels with the sefer, it is visible in the source, and somebody you send
the file to gets your styles rather than their own. `#עיצוב` takes the same
knobs a heading has — size, weight, colour, slant, tracking, underline, small
caps, alignment, the space before and after — which is why the editor can read
the line back and rewrite it. A `#let` of any other shape is your own code: it
is never offered as a style and never rewritten.

### Comments, hidden text and folds

Three ways to mark off a span of source, and the only thing worth remembering
about them is what reaches the page:

| | Keys | In the file | On the page |
|---|---|---|---|
| **Hide line** | `Ctrl+/` | `// …` | nothing |
| **Hide passage** | `Ctrl+Shift+/` | `/* … */` | nothing |
| **Fold** | `Ctrl+Shift+G` | `//{ … //}` | **all of it** |

The first two are a toggle — press the same key on the same lines and the text
comes back — and nothing inside them runs, so a footnote hidden this way does
not quietly take a number. The third is the opposite: a **fold** marks a span so
it can be collapsed while writing, and every word of it prints. Name it on the
opening line and the name is what the collapsed line shows. Type `//{` and the
editor writes the closing mark, so it costs three keystrokes once; the marks are
comments, which is why they can never reach the paper.

All three shipped for as long as there has been an editor. The line comment had
no door of any kind, and the fold's one door was a toolbar button labelled
*Region* — a word that says nothing about folding, nothing about printing, and
which `#אזור` now uses for a fixed area on the page.

Folding is not only by hand: a heading folds its section from the gutter,
`Ctrl+Alt+[` and `Ctrl+Alt+]` take everything down and put it back, and
**Format ▸ Fold by heading level** — `Ctrl+Alt+1`, `Ctrl+Alt+2`, `Ctrl+Alt+3` —
collapses the sefer to chapters, or to chapters and simanim.

### Going faster

- **`Ctrl+Alt+K`** — a *hydra*: a panel listing every operation available where
  the caret is, one letter each, staying open so five rows is `r r r r r`.
  `Esc` or `q` to leave. While it is open it owns the keyboard, including in Vim
  and Emacs modes — modified keys still pass through, so `Ctrl+S` saves from
  inside it.
- **`F3` / `F4`** — record a macro and replay it. Macros record *actions*, not
  keystrokes and not cursor positions, so they replay correctly from anywhere.
  Save one and it becomes bindable to a key like anything else.
- **`Ctrl+K`** — the command palette, for everything by name, when you know what
  you are after.
- **`Ctrl+Shift+K`** — every command there is, grouped by what it is for, when
  you do not. It stays open while you use it, and each row shows the shortcut it
  answers to.
- **`F1`** — help, and every line of it is a button: the entry that tells you
  `Ctrl+Shift+F` makes a footnote makes one.
- **`Ctrl+=` / `Ctrl+-` / `Ctrl+0`** — bigger, smaller, back to 100%. They resize
  whichever of the two you are standing in: the text when the caret is in it, the
  page otherwise. Both sizes are also rows in Settings, named for what they zoom.
- **`Ctrl+Alt+S`** — keep this version. Automatic snapshots are on by default and
  switchable off in Settings, which is the point of a key for the manual one: a
  history of *the points you chose* is only useful if you can choose them.

Every key above is rebindable in Settings, and Settings lists every operation in
the product because that list is generated too.

### Version control

The `⑂` chip opens a drawer over **the git you already have**. Ksav does not
bring its own: it drives the `git` on your machine, so the history in this
drawer and the history in a terminal are the same history, your credentials are
the ones you already set up, and nothing about a sefer under version control
stops working outside Ksav.

Everything is there — what has changed, a commit with a message, the history of
this sefer with compare, restore and revert, branches with switch and merge,
remotes with fetch, pull and push. A merge that stops on conflicts is reported
as what it is, with the choice to take one side or walk away, because the
markers are in your document at that point and being told nothing happened
would be worse than useless.

Three things it will tell you rather than sit there greyed:

- **the document has not been saved to a file yet** — there is no folder for a
  repository to be in, so save it and the drawer works;
- **you are in a browser** — a tab is handed a file *handle* and never a path,
  and git needs a path. The installed application has one;
- **git is not installed** — which is the one case Ksav genuinely cannot do
  anything about, and says so instead of doing nothing quietly.

Comparing with an old version marks the change gutter, exactly as comparing with
a snapshot does. That is deliberate: one set of marks in the margin, one thing
to read, whether the version you are comparing against came from `Ctrl+Alt+S` or
from a commit last Tuesday.

The snapshots are not going anywhere and are not the same feature. A snapshot is
*this point, kept, automatically*; a commit is *this much is finished, and here
is what changed and why.* Most writing wants the first and never the second.

### Where your settings live

Two different things, deliberately kept apart:

- **The document** — font, paper, margins, direction, headers, two-sided setup.
  These travel with the file, so a sefer opens the same way on someone else's
  machine.
- **You** — theme, layout, spell-check, shortcuts, macros, editing mode. These
  stay on this machine and follow you between documents.

The Settings drawer says which is which, at the line where they divide.

Two of those switches are worth knowing about before they surprise you.
**Brackets close themselves** as you type and quotes do not — separately
switchable, and quotes ship off because in Hebrew `"` is the gershayim of רש״י
and `'` the geresh of ר', both standing *inside* words several times a line.
And **spell-check skips comments and folds**, on the rule that it never
underlines what does not print; turn it on if you park paragraphs in a comment
while you rework them. Markup inside a comment stays unchecked either way.
There is a third: **menus reopen at the top** rather than wherever you left
them, which is what you want unless you are working through one long stretch of
Insert — in which case turn it off.

**Vim and Emacs are real**, and while one is on it takes the *whole* keyboard:
Ksav's own shortcuts are not installed at all, so there is no contest to lose.
That is the fix for a bug this arrangement replaces — both keymaps used to sit at
the same precedence with the mode placed first, and CodeMirror's tie-break gave
the keys to Emacs on the dev server and to Ksav in the production build, where
Emacs mode consequently did nothing whatsoever.

A full takeover is only affordable because nothing is lost with it: **every
command is a `:` command in Vim and an `M-x` command in Emacs**, generated from
the same registry the palette and the menus read, so a command added to the
registry is reachable from both modes without anyone wiring it up. `M-x` opens
Ksav's own command palette rather than a second minibuffer — it is a prompt over
that same list, with fuzzy matching and a description beside each row. `:w` and
`C-x C-s` save.

And **every surface that shows a key shows that instead**, while a mode is on:
the key list, the menus, the toolbar tooltips, the help page, the command
palette's rows. A key that now does something else is worse than no key at all,
and for a long time only one of those surfaces knew — the rule is
`bindings.keyHint` now, and `prohibitions.test.mjs` holds it as the only way to
spell a key anywhere in `app/src`.

## Core idea

Every Ksav command is a **real Typst function**, defined in
[`engine/typst/ksav.typ`](engine/typst/ksav.typ). Each has a Hebrew name *and* a
collision-free English alias, so the same document can be written in either
language:

```typst
#let הדגשה(body) = strong(body)     ;  #let bold = הדגשה
#let טבלה(עמודות: 2, ..תאים) = table(columns: עמודות, ..תאים)
#let mktable = _en(טבלה)            ;  #mktable(columns: 2, ...)
```

The alias is a wrapper, not a plain binding, because an English name over Hebrew
*parameters* is only half a translation: `#mktable(עמודות: 3)` is not English and
is not something anyone would type. `_en` renames named arguments through one
table in the prelude and still accepts the Hebrew ones, so a document can be
converted a command at a time without hitting a cliff halfway through.

The engine hands Typst a two-line document — `#import "ksav.typ": *`, then a
`#show: מסמך.with(...)` wrapper driven by editor settings (font / size / margins /
direction / numbering / columns / line-spacing) — with the writer's text after
it, and compiles with real Typst. **The prelude is a resolved file**, not a
prefix: it used to be concatenated onto the front of every compile, which meant
Typst re-parsed 111 KB of unchanged Hebrew on every keystroke (3.7 ms of it, see
`cargo run --release --example bench-prelude`) and every diagnostic's line number
was that prefix's length subtracted from a byte offset. Now a span carries which
file it came from.

"Export .typ" still inlines the prelude, because a self-contained file is the
whole point of that button; both arrangements come off the same `prelude_text`
and the same `show_rule`, and `tests/assemble.rs` compiles the exported one
through an engine with no file resolver on it to prove it still stands alone.

Because **Typst itself parses the document**, we never reimplement a parser — and
arbitrary cross-nesting (a table inside a footnote inside a heading inside a list
item) works for free.

The editor still has to find things in the source — where this heading's section
ends, which cells belong to this table, which run is a comment — and it cannot
ask the engine, because the answer has to be synchronous, pure and available
mid-keystroke. That is **`app/src/spans.ts`**, and the point is that there is
exactly one of it. It is a scanner, not a parser: it locates calls and hands back
ranges, and every structural edit remains a textual splice, so a writer's
whitespace, comments and argument order survive editing untouched.

It tracks Typst's two contexts, because that is the one thing ten separate
matchers could not do and it is the whole reason they disagreed. Inside `[…]`
Typst is in *content* mode, where `"` is an ordinary character — which is how
Hebrew writes gershayim (רש״י, שו״ע) — and `\` escapes. Inside `(…)` and `{…}` it
is in *code* mode, where `"` opens a string literal in which brackets are inert.
Both halves were checked against the compiler rather than assumed; see the head
of the file.

"It cannot ask the engine" is true of the **compiler** and false of the
**parser**, and the difference is worth a test. A compile is 14–30 ms for one
page and 5.6 s at 170; `typst::syntax::Source::detached` parses with no world,
no fonts and no layout. So the scanner stays exactly as it is at runtime — and
offline, **`engine/tests/scan_oracle.rs`** sweeps every document in the
repository and asks Typst's own parser whether the scanner was right about it:
the twelve templates, both starter documents, every note layout and structural edit
the app produces, and the whole insertion grid — in both languages, since the
grid learned to ask its questions in English as well. Three thousand documents,
and the point of the grid is that nobody chose them.

It is the only check here that does not depend on somebody thinking of the case.
The scanner's own fourteen unit tests were all green while a bare `(` in prose
opened code mode, because each was written by somebody who held the wrong rule.
On its first sweep the oracle found a second one nobody had asked about: a
`#let` line pushed a frame that was never closed, so every surface reading the
scan believed the prose after the first `#set` in a document was code.
`app/tools/emit-scan-oracle.mjs` writes what the scanner believes and `npm test`
fails if it is stale, which is what makes changing the scanner force the
comparison.

### Why it is built this way

One registry per surface, one authority per fact, a documentation fence that
sweeps in both directions, and a commit pin on the shared crates — with the
defects that produced each of them — are in **[DESIGN.md](DESIGN.md)**. They are
the reasoning, not the reference, and this file is long enough.

## Features (engine)

- **155 commands**, each bilingual (Hebrew + English), across styles, headings,
  alignment, direction (RTL/LTR runs), lists, definition lists, tables, the whole
  note apparatus, blocks (quote / callout / warning / success / framed box),
  layout, images, cross-references, **review** (`הוספה`, `מחיקה`, `הערת_עורך`),
  **mathematics** (`נוסחה`), per-section page setup (`מקטע_עמוד`), and a
  dedicated **Torah/yeshiva layer**: `סימן`, `סעיף`, `פסוק`, `מראה_מקום`
  (mekoros footnotes), `ציון`, `גמרא`, `דיבור_המתחיל`.
- **12 document templates**: letter, article, sefer, divrei-torah, gemara, peirush, siddur,
  bentcher, kesubah, get — real Hebrew content with nikud and authentic mekoros —
  plus an English letter and an English article, written as documents of their
  own rather than translations. Each carries its `lang`, so loading one puts the
  document in the direction it was written for. The Torah templates stay Hebrew:
  a siddur, a bentcher, a kesubah and a get are Hebrew because of what they are.
- **Command registry** exposed as JSON (`/commands`) — drives the palette,
  toolbar, and docs. **Template registry** at `/templates`.
- **Bundled fonts** (Frank Ruhl Hofshi, David Libre, Cascadia Mono, and NewCM
  Math for equations) — output is self-contained, with full nikud support. The
  math font is there because Typst's math layout needs an OpenType MATH table and
  no Hebrew text font carries one.
- **Exports**: PDF, per-page SVG (live preview), and plain Typst source. Real
  compiler diagnostics (errors + hints) surfaced back.
- Compiles a page in ~20-30ms.

## The editor (SPA)

`ksav/app/` is a Vite + TypeScript single-page app (CodeMirror 6):

- **Ksav syntax highlighting** for `#command[...]` in the editor.
- **Prose mode** — hides the command syntax and renders content with the real
  style (bold looks bold, headings look like headings). The command under the
  cursor, and everything while **Alt** is held, reveal their raw markup so you
  can always edit.
- **Live preview** — real Typst SVG, ~20-90ms round-trip.
- **Word-like toolbar**, **command palette** (Ctrl+K, searches all 153 commands
  in Hebrew or English), **templates** menu, **export** menu (PDF / **Word** /
  HTML / Markdown / text / Typst / print).
- **Bracket healing** (`app/src/brackets.ts`) — Typst can only report an unclosed
  `[` once it reaches end of file, thousands of characters from the mistake, and
  the preview goes blank. Instead: a live lint marks the opener that never closes
  and names its command, a one-click fix inserts the closer where it belongs, and
  the preview compiles a *healed* copy so a half-typed command never blanks the
  page. One pure scan feeds all three, so they cannot disagree. Held by
  `app/test/brackets.test.mjs` (`npm test`), including the invariant that healed
  text is always balanced and healing is idempotent.
- **Word handoff** — `.docx` from Typst is not feasible, but that was never the
  requirement: what matters is that the rebbi or kovetz editor you send it to can
  *edit* it. Typst's reflowable HTML export wrapped in Word's own HTML envelope
  (mso namespaces, `@page` size and margins, RTL) opens in Word as a real
  editable document, either as a `.doc` file or straight off the clipboard.
  Prose, headings, emphasis, lists, tables and plain footnotes carry across; the
  multi-stream apparatus flattens, and the app says so rather than letting you
  find out.
- **Review panel** — every tracked change and editorial comment in the document,
  accepted or rejected one at a time (which rewrites the source, so the decision
  is in the file), plus a switch between reading the markup, the document as if
  every change were accepted, and the document before any of them.
- **Bilingual UI** (Hebrew ⇄ English) with full RTL/LTR flip of the chrome —
  independent of the document's own direction. Persisted.
- **Settings**: font, size, margins, direction, page numbers, text alignment,
  line spacing, columns, two zooms. **Light/dark theme.** One/two-panel layout.
  - **The font list** is grouped by where each face comes from — bundled with
    Ksav, attached to this document, or installed on this machine — because that
    is the same question as *will it still resolve when somebody else opens
    this*. Each name is drawn in its own face, and a family none of the three
    knows can still be named by hand.
  - **Text alignment** is one control with four answers: justified, right,
    centred, left. It was a `justify` tick box, which could say *justified or
    not* and had no word for *which edge* — so a centred sheet meant wrapping
    every paragraph by hand.
  - **Running heads** can stay in Settings as plain text, or move into the
    document as `#כותרת_עליונה[…]` / `#כותרת_תחתונה[…]`. In the document they
    take content, so a bold word or a mixed run works — and a document may set
    them more than once, which is how a sefer names the current masechta across
    the top of each chapter. The settings drawer has the button that moves one
    across, text and all.
  - **The table of contents** takes a depth (Insert ▸ the levels box beside it),
    and any single heading can be kept out of it with `בתוכן: false` — offered
    wherever the heading operations are, so a title page's own heading does not
    have to appear in its own contents.
  - **Snapshots** are automatic by default, at a cadence you set, or switched
    off entirely and taken by hand with `Ctrl+Alt+S`.
  - **Exports** share one page range, at the head of the Export menu. Every route
    either reads it or says why it cannot: Word and web HTML reflow, so the
    reader decides the pages; Markdown, Org, plain text and `.typ` are the
    source, which was never laid out. The PDF and the printer read it.
  - **Org mode, both directions** (Export ▸ Org mode, File ▸ Import from Org).
    Of the interchange formats this is the one whose structure is closest to a
    sefer's — a tree of headings with footnotes hanging off it — and it has no
    six-level ceiling, so an outline that Markdown flattens to `######` survives
    as nine stars. Coming back in it reads headings, both list kinds, tables,
    both footnote forms (including a reference that appears pages above its
    definition), quote and source blocks, links and LaTeX fragments. What Ksav
    has no word for — property drawers, TODO keywords, tags, `#+` keywords
    nobody reads — is dropped and **named** in the sentence that follows the
    import, because an import that quietly loses the drawers is the kind of
    thing somebody finds a month later. See `app/src/org.ts`.

## Runs in the browser (WASM)

The whole engine compiles to WebAssembly (`ksav/wasm/`), so the app can run the
**real Typst compiler entirely in the browser with no server** — deploy the
built files to any static host. The app picks its backend automatically: it uses
the local server when one is reachable (fast, tiny download), and falls back to
the in-browser wasm engine otherwise. A badge in the status bar shows which is
active (`⬢ server` / `⬡ wasm`).

The wasm is a lazily-loaded ~28 MB chunk (~11 MB gzipped) and is only bundled in
an explicit offline build, so the server/desktop build stays lean.

## Cross-platform

Runs on **Linux, macOS, and Windows**. The engine is pure Rust with **the fonts
embedded in the binary** (`include_bytes!`) — no dependency on system fonts or
any OS-specific code — so a build behaves identically everywhere. The editor is
web tech (browser or Tauri webview), and the wasm build runs in any modern
browser on any OS.

## In Emacs

[`editors/emacs`](editors/emacs) is an elisp package that opens `.ksav` files in
`ksav-mode` and drives this engine: `C-c C-c` typesets and shows the page,
`C-c C-i` inserts a command by name in either language, `C-c C-e` writes a PDF,
`C-c C-s` runs the Hebrew and English spellers. It starts an engine for you and
stops it when Emacs exits.

Those four are the daily keys and not the extent of it. **Every service this
engine answers has a door in Emacs** — the assembled Typst source, click-to-jump
on the drawn page and its inverse, the speller's suggestions, the templates, the
sefarim catalogue as a `completion-at-point`, all eighteen git operations, and
the six errands to Girsa. That is a claim `app/test/emacs.test.mjs` holds with
an exemption list that is **empty**, because the version before it reached three
of sixteen and a client that quietly cannot do thirteen of the things the
product does cannot tell its reader *Ksav cannot do that* from *something went
wrong*. It reported the first as the second, every time.

It is a client and nothing more — no elisp here parses Ksav markup, decides what
a command means or renders anything. That is the only arrangement in which an
Emacs user gets *Ksav* rather than a mode that approximates it and drifts, and
it is why the service table there is generated from the same registry the other
four builds are generated from.

This is separate from the Emacs *mode* inside the application, which is the real
`@replit/codemirror-emacs` with the whole keyboard and every command on `M-x`.
One is Emacs inside Ksav; this is Ksav inside Emacs.

## Status

- [x] Real Typst 0.15 compilation (embedded via `typst-as-lib`)
- [x] Bilingual command layer + Torah/yeshiva commands
- [x] 12 templates (all compile)
- [x] Command + template registries (JSON)
- [x] PDF / SVG / Typst-source export, live diagnostics
- [x] **Full SPA** — CodeMirror 6, command palette, prose mode, bilingual UI,
      settings, themes, templates, exports (M2)
- [x] **WASM** — real Typst in the browser, no server; auto backend selection (M3)
- [x] Cross-platform (Linux / macOS / Windows), fonts embedded
- [x] **Tauri desktop app** — native window, engine in-process via `invoke` (M4)
- [x] **The full note apparatus** — all fourteen note layouts in `spec.md` render
      correctly (footnotes, endnotes, per-section endnotes, fixed page-foot
      regions in centimetres or in percent of the page, any number of parallel
      streams each in its own region, true sidenotes down either margin, and the
      four two-layer notes-on-notes arrangements). See
      [`engine/README-notes.md`](engine/README-notes.md).
- [x] **Rendered-output tests** — `engine/src/probe.rs` reads the laid-out
      document and `engine/tests/apparatus.rs` asserts where things landed on the
      page, rather than only that the document compiled.
- [x] **A document library and real files** — many named documents, each with its
      own images and fonts; Save writes back to a genuine file (native dialog in
      Tauri, File System Access in the browser, an honest "Save a copy" where
      neither exists).
- [x] **Images and user fonts** — carried with the compile request, since the
      engine has no file system to read from.
- [x] **Spell-check in both languages, dispatched per word.** Hebrew runs on a
      lexicon Ksav owns, built from public-domain corpora so it knows Torah
      Hebrew and the citation apparatus general dictionaries reject. English runs
      on the English Speller Database plus public-domain Judaic English plus a
      hand-written list of transliterated Hebrew, Aramaic and Yiddish — because a
      general dictionary rejects five words in nine of an ordinary sentence about
      a sugya. Each token goes to the lexicon for its own script, so a bilingual
      document is checked in both halves without anyone setting anything.
      Squiggles, suggestions, and a one-click user dictionary.
- [x] **Exports** — PDF, real reflowable HTML (Typst's own HTML backend),
      Markdown, plain text, Typst source.
- [x] **Responsive** down to a phone, and on a laptop.

  It was true on a phone and false on a laptop: at 1366×768 the split gave the
  preview 680 px, an A4 page drew at 860, and the pane scrolled to the *end* of
  every Hebrew line. The page fits the pane by default now and the pane reads in
  the document's own direction — see `app/src/preview.ts`.
- [x] **Review tools** — tracked insertions and deletions, editorial margin
      comments, accept/reject per change, and three ways to read the document
      (markup / as-if-accepted / original).
- [x] **Page geometry, per document and fully custom** — every page field
      belongs to the sefer and travels with the file (B26): the size, the four
      per-edge margins, the binding gutter, two-sided mirroring. The size is a
      named paper *or* a width and a height in centimetres, because a sefer is
      routinely printed at 17×24 or 20×27 and no standard names those. Measured
      off the laid-out page by `engine/tests/page_geometry.rs`, not asserted on
      the request.
- [x] **Section-level page setup** — `מקטע_עמוד` gives one section its own
      header, footer, columns, margins, paper, orientation, page numbering,
      border and watermark.
- [x] **Mathematics** — `נוסחה` / `נוסחה_בשורה` evaluate Typst's maths notation,
      laid out left-to-right inside Hebrew text, with a keypad for the notation.
- [x] **Durable storage** — documents, assets and per-document history in
      IndexedDB; saving decoupled from rendering, with a visible, blocking error
      when the store refuses. See [Storage](#storage).
- [x] **Off the UI thread** — the desktop commands are `async` + `spawn_blocking`,
      the wasm engine runs in a Web Worker, and the server serves on a thread
      pool. A 0.4–2.9 s compile no longer freezes the window or the tab.
- [x] **Accessible chrome** — every control has a name, the toolbar is seven
      labelled ribbon groups, the page has landmarks, and the status bar is a
      live region.
- [x] **Licensed** — MIT OR Apache-2.0, with the bundled fonts' OFL/GUST notices
      shipped in the installers *and* rendered in the app. See [Licence](#licence).
- [x] **CI, running and green** — typecheck, 6,293 editor assertions, 721 engine
      tests, `clippy -D warnings`, the desktop shell, a build-and-run check of
      the browser (wasm) engine, and a run of the assembled application in a real
      browser, on every push. See [Test](#test) and [Use it](#use-it).

Done since, and worth stating because these were the longest-standing gaps:

- [x] **A git remote, and CI that actually runs.** `ci.yml` runs on every push and
      is green across all eight jobs — editor, engine, formatting and clippy,
      the engine again on macOS, browser (wasm) engine, the assembled
      application, the Emacs package, desktop shell.
- [x] **The release matrix has run, on every platform.** `v0.1.0` drove
      `release.yml` to success on `windows-latest`, `ubuntu-22.04` and *both*
      macOS architectures, so the `.msi`, `.exe`, `.deb`, `.AppImage` and both
      `.dmg`s have all genuinely been produced by a runner.

- [x] **The release is published.** `release.yml` sets `releaseDraft: true`
      deliberately, so a release is reviewed before it is public — and the
      `v0.1.0` draft then sat unpublished, which three consecutive audits called
      the single most consequential open item, because `/releases/latest`
      returned 404 and the Download link in the root README led to an empty
      page. The button has been pressed: nine installers are on it and the tag
      resolves.

Not done:

- [ ] **Code signing.** Unsigned, Windows SmartScreen says "unrecognized app" and
      macOS says "unidentified developer". The fix is a certificate ($99/yr Apple,
      ~$200–400/yr Windows OV), not a workaround; `release.yml` names the secrets.
- [ ] **Nobody has written a real *sefer* in it yet.** The most important line
      here. Nothing above substitutes for it, and an hour of it on 7 August
      2026 found three bugs that the whole suite was green over — a sefer
      numbered by the toolbar came out **סימן א׳** three times,
      a gershayim (the key you press for רש״י) produced Typst's raw
      `unclosed string`, and the Mekoros panel dropped the ref that is the
      whole argument for the Girsa pairing. All three fixed; see
      [`decisions/2026-08-07-writing-a-kuntres.md`](../decisions/2026-08-07-writing-a-kuntres.md).

      A second sitting on 16 August wrote a kuntres on lechem mishneh in the
      assembled application — three simanim, a footnote, a source note,
      gershayim inside parentheses, a table, two apparatus bands stacked at the
      foot of the page, an `.org` import and a PDF. The three above are gone,
      and it found a fourth: the status bar read *rendering…* for as long as
      nothing else happened, after the PDF had already been written. See
      [`decisions/2026-08-16-writing-a-kuntres-in-it.md`](../decisions/2026-08-16-writing-a-kuntres-in-it.md).

      Two kuntres-length sittings are not a sefer, so the box stays open.

## Checking how something renders

`compile(..).ok()` only says the document compiled — it cannot see a note in the
wrong column or a number orphaned onto its own line. To see the actual layout:

```sh
cargo run --manifest-path engine/Cargo.toml --example probe -- mydoc.ksav
```

Each output line is one visual line of the document: its y, the x of its leftmost
run, the font sizes on it, and its text.

## Develop

```sh
# 1. Run the engine (HTTP API on :7878)
cargo run --manifest-path engine/Cargo.toml -- serve

# 2. Run the SPA dev server (proxies every engine service to the engine)
cd app && npm install && npm run dev        # http://localhost:5173
```

The dev proxy is built from the engine's service registry, so every route the
engine answers is forwarded. It was a hand-written list of five for a while, and
`/jump`, `/reveal`, `/sefarim`, `/inbox`, `/mekoros` and `/linkify` all 404'd
against Vite itself — features that worked in production and looked broken in the
one place they are developed.

## The shared crates

Ksav compiles `girsa-post`, `girsa-source` and `girsa-ksav` from the
[sefer-crates](https://github.com/SYKhayyat/sefer-crates) repository, pinned by
commit in `engine/Cargo.toml`. Working on both at once, what the pin costs the
other repository, and how to bump it are in [DESIGN.md](DESIGN.md#the-shared-crates).

## Test

```sh
node tools/gate.mjs                         # the whole gate
node tools/gate.mjs engine                  # or one part of it
cd app && npm test -- panels spans          # the inner loop: those files, by substring
```

Nine checks. A name selects them on either of two axes — the **kind** of check,
which is what CI splits jobs on, or the **tree** the check is about:

| name | kind | what it runs |
|---|---|---|
| `fmt` | kind | `rustfmt`, over all three Rust trees |
| `editor` | both | the typechecker, then 6,293 assertions across 96 files |
| `engine` | both | formatting, lints, then 721 tests across 43 binaries |
| `shell` | both | the desktop shell: formatting, lints, the path allowlist and the Girsa desk |
| `wasm` | tree | formatting; the browser engine is built and run in CI, not here |

Two axes because one was not enough, and the shortfall was measured: `fmt` and
`engine` were sibling group names, so `node tools/gate.mjs engine` ran clippy and
the engine tests and skipped a one-second `cargo fmt -- --check` **on the same
crate**. It reported the gate green, and `formatting` was the only red job on
`main` — the same failure this section is about, one level in. A name that reads
as "check the engine" now checks the engine.

**A partial run says so.** Selecting a name is normal — CI does it in five jobs —
but the run ends by naming every check it did not run, because "the gate is green
— 2 checks" is a two-of-nine answer wearing a nine-of-nine sentence.

**One command, deliberately.** This section used to list six and
`.github/workflows/ci.yml` spelled nine steps out again beside them. Nobody runs
six commands, and it showed: for four consecutive pushes the *only* red job on
`main` was `formatting`, failing at its first step in eleven seconds while every
other job went green, with fifty-four unformatted hunks accumulating under it.
`tools/gate.mjs` is now the one place a check command is written — the workflow
selects by name, and `app/test/gate.test.mjs` fails if a check command reappears
as a literal in the workflow or in any living page, if a check the runner
declares is run by no job in the workflow, or if naming a tree leaves a check on
that tree unrun.

A filtered run is the exception, and it is not an oversight: `npm test -- panels`
is what a developer runs forty times an hour, and it says so and skips the two
checks that describe the whole suite — the assertion tally above and the
documentation fence over it. A partial tally checked against the documentation
would fail every single-file run, which is the fastest way to teach everybody to
ignore the one fence that catches a stale count.

The workflow runs the gate on every push and pull request, plus three jobs that
need more than a plain checkout and are therefore not part of it. It builds the
wasm engine and then *runs* it (`.github/scripts/wasm-smoke.mjs` — every template
compiled, both lexicons answered); the built package is git-ignored and produced
locally, so without that job the entire no-server build could break and every
other check would still be green. And it builds the app, embeds it in the server,
and [uses it](#use-it). And it installs an Emacs and runs
`ksav/editors/emacs`'s own suite against a real engine — half of that suite skips
without one, and the job sets `KSAV_EMACS_LIVE` so the skip is an error on the
machine whose job is to run it.

The editor's runner (`app/test/run.mjs`) builds **every module in `app/src`** and
executes every `app/test/*.test.mjs`, so **adding a test is adding a file** — that
friction is how a suite ends up with one file in it, which is where this one
started.

The module list is read off the directory, and that is a fix rather than a
convenience: it used to be a hand-written array, nothing compared it to `src/`, it
had stopped growing at 43 of 62 names, and **no test imported any of the other
nineteen** — `exports.ts`, `compile.ts`, `save.ts`, `files.ts` and `ksav-lang.ts`
among them. `app/test/runner.test.mjs` is what keeps it honest: every module is
built or declared unbuildable in `app/test/modules.mjs` *with a reason that file
executes*, every module is imported by at least one test, and no test may bundle
its own private copy of a module — which was the visible symptom last time. A
module added to `src/` with no test turns the suite red, by name.

`app/test/harness.mjs` installs `localStorage` and IndexedDB shims — its
`localStorage.quota` is settable, because the bug most of these tests exist to
prevent is what happens *at* the quota and waiting for a real 4.5 MB to fill is
not a test, it is a delay — plus `fakeView`, a real `EditorState` behind a fake
screen, and `installChrome`, which is how a test reads the status bar. The status
bar is where most of this product's bugs are visible.

## Use it

Everything above this line reads. It reads extremely well — an insertion grid
that compiles every legal insertion the UI can produce, an oracle that checks the
editor's scanner against Typst's own parser over **4,207**<!--=oracleDocuments--> documents, a fence that
fails when a number in this file stops being true. All of it is *about parts*.

Nothing had ever booted the product and used it. One hour of clicking on 6 August
found three bugs on a day the whole suite was green, because the bugs a reader
cannot find are the ones in the seams — a button wired to nothing, a menu item
that throws, a template that loads into an editor that cannot compile it — and a
seam is only observable when both sides are present.

```sh
cd app && npm run build                     # dist/, which the server embeds
cd engine && cargo build --release --features embed-ui
cd app && npm run accept                    # boot it, use it, export a PDF
```

`.github/scripts/acceptance.mjs` starts `ksav serve`, drives a real Chrome
through the first ten minutes — a sefer from the ספר template, a heading, a
bulleted list, a table and a row inside it, a footnote containing `(רש"י)`, an
endnote, Export → PDF — and holds every step to three things: the compile
finished without an error, pages are on screen, and the page said nothing to the
console. `--headed` watches it; `--keep` leaves the browser open on a failure;
`--url` drives a server you started yourself.

It asserts on **status transitions, never on pixels**. A browser test that
compares rendering cries wolf on a font update, and the tolerance here for that
is zero. But the weaker version — "`#status` says ok afterwards" — is nearly
worthless, because it said ok before too, so a button doing nothing at all would
pass. A recorder installed on boot watches `#status` blank itself at the start of
every compile, and each step insists on a compile that began after it did.

**And it looks at the screen**, which is a different question from the one the
paragraph above declines. Every other guard in this repository reads source, and
the two worst bugs the sibling application ever shipped were a commentary block
at `opacity: 0` and a pane title measured at 0px — facts about a layout, with
both files saying exactly what they should say. The browser was already here and
was never asked. It is now: every declared surface is opened the way a reader
opens it and measured for a non-zero box, an effective opacity above zero
computed **through its ancestors**, no `display: none` or `visibility: hidden`
anywhere in that chain, and a box that intersects the viewport. Nothing is
compared against an expected colour, position or size, so a font update still
changes nothing.

Which surfaces comes from `app/src/panels.ts` rather than from a list here, and
`app/tools/surfaces.mjs` says how each one is opened — a chip, a keystroke, or a
written reason why neither. A twenty-third panel fails `app/test/visibility.test.mjs`
by name until somebody classifies it, and no click in the run may skip the
measurement: Playwright's own visibility check passes an element at `opacity: 0`,
so a bare click proves nothing about the screen and the fence rejects one.

The dependency is `playwright-core`, not `playwright`: the full package downloads
a ~150 MB browser on every install, and this drives the Chrome already on the
machine. 14 MB, no postinstall.

**And the rule, which is the other half and the half no script enforces: a
feature is not done until it has been used once, by a person, in the assembled
application.** Ten waves of reading produced mechanisms better than most
codebases have and a set of surfaces nobody had ever touched. The seven paths
above are the ones that now cannot rot; every other one is still on the honour
system.

## Measure it

```sh
cd app && npm run bench
```

`tools/bench-structure.mjs` types into seforim of 9, 37 and 148 KB and reports
what one keystroke costs: the scan, everything the editor asks after it, the memo
probe, one caret move, and a fold query at the *last* heading in the document.

It used to measure one operation on documents up to 18 KB with `doc` held fixed,
and both of those made it blind. 18 KB is one twenty-eighth of a real sefer. And
a fixed document means `scan()` is a memo *hit* in every iteration after the
first — so the benchmark never once measured typing, which is the only thing the
per-keystroke costs are paid against.

Two things it taught while being rewritten, both general: without a warm-up the
**first row of the table** reported a keystroke at three times its true cost,
because the first measured loop pays for V8 compiling everything under it. And
`a + ch + b` on a long string builds a cons string, flattened later by whoever
walks it — so a benchmark that concatenates charges the flattening to the scan
and overstates a keystroke by 40%. CodeMirror hands the scanner a flat string.

Read down a column, not across a row: the shape to watch for is a number growing
faster than the document does.

## Rebuild the lexicons

Both generated word lists are committed, so no build ever fetches a corpus —
cargo's own dependency fetch, [the shared crates](#the-shared-crates) among
them, is the only network a build wants, and only until the cache is warm.
Rebuild the lexicons only to change a source or a size:

```sh
cd engine
python tools/build_lexicon.py               # Hebrew: Sefaria + Project Ben-Yehuda
python tools/build_english_lexicon.py       # English: ESDB + Public Domain Judaic English
cargo run --example spellrate -- some.txt   # miss rate, per language
cargo run --example checkdocs               # what the templates trip on
```

The hand-curated supplements (`assets/lexicon-he-supplement.txt`,
`assets/lexicon-en-supplement.txt`) are edited by hand and never regenerated;
`cargo test` fails on any English supplement entry the generated list already
accepts, so it cannot fill up with words carrying no weight.

## Ship a single self-contained binary (server / desktop)

```sh
cd app && npm run build                     # lean -> app/dist (no wasm)
cargo build --release --features embed-ui --manifest-path engine/Cargo.toml
./engine/target/release/ksav serve          # serves the whole SPA + API
```

## Ship an offline, no-server web build (WASM)

```sh
cd wasm && wasm-pack build --target web --release --out-dir pkg
cp pkg/ksav_wasm.js pkg/ksav_wasm.d.ts pkg/ksav_wasm_bg.wasm* ../app/src/wasmpkg/
cd ../app && npm run build:wasm              # app/dist runs with no server
# serve app/dist on any static host
```

### Where it is published

`.github/workflows/deploy.yml` builds exactly the bundle above and publishes it
to GitHub Pages, on a **tag** and on `workflow_dispatch`. Tags rather than every
push to `main`, because a share link carries a document and opens in whatever
app is at the far end: publishing on every push means a link sent on Tuesday
opens in Thursday's half-finished editor.

**Before the first deploy**, GitHub Pages has to be enabled for the repository
with *Source: GitHub Actions* (Settings → Pages). The job does not enable it for
you — turning a repository's contents into a public website is not a build
script's decision — so `actions/configure-pages` fails with a clear message
until somebody has made it.

`VITE_PUBLIC_BASE` is the URL being published to, and it reaches the app twice:

- as Vite's `base`, so the asset URLs in the built HTML carry the `/ksav/`
  prefix a *project* Pages site serves under, and
- as `__PUBLIC_BASE__`, which is the base a **share link** names.

One value for both, so a link can never point at a copy of the app that is not
there. Unset — which is every local build — the assets are rooted at `/` and
"copy a link" refuses in words rather than guessing a host. It used to guess
`https://ksav.app/`, a domain that appears nowhere else in this repository.

## Desktop app (Tauri)

A native window on **Windows, macOS, and Linux** that runs the engine in-process
(no HTTP server, no localhost) — the frontend calls Rust via `invoke`.

```sh
cd app
npm run tauri dev      # dev window + hot reload (starts Vite for you)
npm run tauri build    # standalone app + installers in src-tauri/target/release
```

- **`tauri dev`** connects the window to the Vite dev server — use it while
  developing. A bare `cargo build` debug binary also expects this server (that's
  why running it alone shows "could not connect to localhost").
- **`tauri build`** embeds the frontend, so the produced app is fully
  standalone. Linux needs `webkit2gtk` + `libayatana-appindicator`; macOS and
  Windows (WebView2) need no extra runtime.

### Installers

Not having one of these was the single biggest reason to keep using Word — no
missing feature came close. If installing Ksav requires cargo, npm or a dev
server on a port, then for almost everyone the software does not exist.

| Platform | Artifacts | How |
| --- | --- | --- |
| Windows | `.msi` (WiX), `.exe` (NSIS) | `cd app && npm run tauri build` |
| Linux | `.deb`, `.AppImage` | `ksav/packaging/build-linux.sh` (needs Docker) |
| macOS | `.dmg` (arm64 + x86_64) | CI only — see below |

**Linux builds through Docker** rather than natively, because a `.deb` cannot be
cross-built from Windows and Docker over WSL is a real Linux userland on the same
machine. The image pins **Ubuntu 22.04 on purpose**: glibc is backward but not
forward compatible, so a binary linked there runs on 22.04 and everything newer,
where one built on 24.04 would silently exclude older distros. `node_modules` and
the cargo target directory live in named volumes, so the Linux build never
overwrites the host's Windows-native `node_modules` and never recompiles Typst
from cold twice. Installers are copied out to `ksav/packaging/out/`.

Only this repository is mounted into the container, at `/work`, which is the
right thing and used to be fatal: while the shared crates were reached through a
sibling checkout, the desktop shell's `girsa-post` resolved to `/sefer-crates`,
a directory that was never in the image. This script could not have produced an
installer. The two CI workflows hid the same hole behind a second checkout; here
there was nothing to hide it with, and nothing tried. See
[The shared crates](#the-shared-crates).

**macOS cannot be cross-built at all** — a `.dmg` only comes from a macOS
machine, which is the whole reason `release.yml` exists. It builds all four
targets on tag push and attaches them to a **draft** release. It has run: the
`v0.1.0` tag drove it to success on `windows-latest`, `ubuntu-22.04` and both
macOS architectures, so every installer this project ships has now been produced
by a runner.

`releaseDraft: true` is the right default and the wrong resting place:
`v0.1.0` sat as an unpublished draft for long enough that `/releases/latest`
returned 404 while every installer already existed, which is the same as having
no release at all. It has been published. Cutting the next one means pressing
the button as well as pushing the tag.

> **The installers are unsigned.** Windows SmartScreen will say "unrecognized
> app" and macOS will say "unidentified developer". That is a genuine adoption
> cost — a first-time user meeting that dialog is nearly as stuck as one with no
> installer — and there is no engineering workaround: it needs a certificate
> ($99/yr Apple, ~$200–400/yr Windows OV). The workflow has the signing secrets
> commented in place, so it becomes a signed build with no other change.

## Run

```sh
# Compile a document to PDF + SVG
cargo run --manifest-path engine/Cargo.toml -- engine/examples/sample.ksav out/

# Launch the web editor
cargo run --manifest-path engine/Cargo.toml -- serve      # http://127.0.0.1:7878
```

## The engine's services

Ksav ships four ways — `ksav serve`, the desktop app, the in-browser wasm build,
and the Vite dev server proxying to a running engine. All four reach **one
registry**, `engine/src/services.rs`, and none of them keeps a list of its own:

| Service | HTTP | In / out |
|---|---|---|
| `compile` | `POST /compile` | `{body, font, size_pt, margin_cm, dir, numbering, justify, line_spacing_em, columns}` → `{ok, pages_svg[], pdf_base64, diagnostics[], typst_source}` |
| `assemble` | `POST /assemble` | `{body, parts, …DocConfig}` → `{ok, typst_source, diagnostics[]}` — the same source a compile would carry, without the compile. "Export .typ" used to ask for a full render *with the PDF* and read one field off it |
| `jump` | `POST /jump` | inverse search: `{body, page, x_pt, y_pt, …DocConfig}` → `{line, column}`, or `{}` for a point the writer did not type (a margin, a running head, a note-band rule) |
| `reveal` | `POST /reveal` | forward search: `{body, line, column, …DocConfig}` → `{points: [{page, x_pt, y_pt}]}`, empty when it printed nowhere and several when it printed more than once |
| `spell` | `POST /spell` | `{text, user_words, suggest}` → `{misspellings[], lexicon_sizes}` |
| `suggest` | `POST /suggest` | `{word, user_words}` → `{suggestions[]}` |
| `commands` | `GET /commands` | the command registry (JSON) |
| `templates` | `GET /templates` | the template registry (JSON, includes each body) |
| `sefarim` | `GET /sefarim` | the sefer catalogue, for citation autocomplete |
| `inbox` | `POST /inbox` | sources Girsa handed over, drained not read — a POST because draining is a *write*, and as a GET it was reachable from any open page by `<img src>` |
| `mekoros` | `POST /mekoros` | `{phrase, except, search}` → where the phrase is from, or `{opened:true}` when asked to open Girsa's search instead |
| `linkify` | `POST /linkify` | `{text}` → `{text}` with the certain citations made live |
| `refresh` | `POST /refresh` | `{markup, style, nikud}` → one row per citation in the document, as the library has it now |
| `clipboard-source` | `POST /clipboard-source` | `{}` → `{markup}`, the Source Packet Girsa put on the clipboard, already rendered — or `{markup: null}`, which is the ordinary answer and means *paste as text* |
| `saved-here` | `POST /saved-here` | `{path, name, forget}` → `{told}`, telling Girsa where a document is so *where did I use this* can find it. `told: false` means the library is not open, which is not an error |
| `git` | `POST /git` | `{path, op, …}` → version control for the document at `path`, on the git already installed. One service carrying an operation name; the operations are `engine/src/git.rs`'s `OPERATIONS`, generated into the client as `GitOp` |

`GET /` and everything else is the built editor, served as static files.

`clipboard-source` is spec.md §10.2's Ctrl+C from this end, and it is a service
rather than a webview call for the same reason Girsa writes it from Rust: a
`paste` event exposes `text/plain`, `text/html` and files, and a **custom native
clipboard format is not among them** on any platform. Girsa takes eighty-six
lines of care to put the packet down as a real format precisely so a native
application can read it; for a long time nothing did, and that careful
three-flavour copy landed in an editor that only ever took the plain text.

It answers with **markup**, not the packet — rendered by `ksav_engine::source`,
the same renderer the loopback arrivals go through — so a quote that arrives on
the clipboard and one that arrives over the loopback are the same document. A
second renderer on the client is what spec.md §10.3 rules out.

`saved-here` is spec.md §10.4's *"standing on a passage, see which of **your
own documents** cite it"*, from the sending end. Girsa's registry, its query and
its tests were all built and nothing ever sent it a path — so the query walked
Girsa's **own toy editor's** directory, and a `.ksav` written in the real Ksav
answered *nothing cites this*. There is nowhere for Girsa to walk instead: a
reader's documents live wherever they keep documents. A path and a name, never
the text; only for a real file path, since a browser handle is not a place Girsa
can open; and on an autosave as much as on a Ctrl+S, because a registry that
only heard about hand-made saves would miss most documents.

`refresh` is spec.md §10.2's promise about a **document** rather than about a
place, and it is reachable now — *רענון המקורות* in the palette, or bound to a
key like anything else. It had a generated client, a generated table row and no
caller in `src/`: the errand Girsa's own `post.rs` calls *"the clearest of
them"*, and this README calls *"the errand that pays for the loopback"*, had no
way in. forty citations at once, in the order they appear, each re-read against
the corpus as it stands. A citation naming a sefer that shelf does not have
comes back as a row with a reason in it — the other thirty-nine still refresh,
and that decision is made once, in Girsa, rather than forty times here. What
comes back is rows and not a rewritten file: a correction somebody else made
silently changing the words in the sefer you are writing is the one surprise
this arrangement exists to avoid, so the writer sees what moved and says yes.

It is also the errand that pays for the loopback. Everything Girsa *hands* Ksav
could travel on the clipboard — push, one direction, Ctrl+V. A question sized by
the document, whose answer has to come back into the document, cannot.

The last four need the loopback to Girsa, so they exist in the browser build as
a stated refusal rather than as a hole — `nativeOnly` in the generated table is
why `WasmBackend` implements `Backend` and not `Sources`.

Both jump directions lay the document out to answer, so they cost what a compile
costs and go through the same deadline and concurrency cap — which is `Cost` on
the service, not a rule each build writes down again. Coordinates are in Typst
points, which is the unit each page's own SVG `viewBox` is written in — so a
client converts with the drawn element's width and nothing else, and no zoom
setting can put the two sides out of step. Lines are counted in the body that was
sent, exactly as `diagnostics[].line` is.

### Adding one

One line in `engine/src/services.rs`, then `node tools/emit-services.mjs` in
`app/`. That is the whole list. The HTTP route, the dev proxy entry, the wasm
dispatch, the desktop command and the TypeScript name union all come from that
table, and `npm test` fails if the generated copy is stale.

It used to be eight files and eleven sites, of which exactly one was visible to a
compiler. Four of the silent ten had already been forgotten by the time anybody
counted: `sefarim` never reached the wasm worker's dispatch table, so citation
autocomplete was dead in the offline build with nothing reporting it; the dev
proxy carried five of twelve routes, so click-to-jump 404'd under `npm run dev`;
and the Content-Security-Policy existed as three copies that had diverged, which
killed the update check in both builds that ship an installer. That policy is now
`policy/csp.txt` — see `policy/README.md` — and the desktop build fails rather
than delivering a different one.

## Library API

```rust
use ksav_engine::{compile, DocConfig};
let result = compile("#הדגשה[שלום עולם]", &DocConfig::default());
// result.pdf, result.pages_svg, result.diagnostics, result.typst_source
```

## Storage

Documents, their images and fonts, and the per-document version history live in
**IndexedDB** (`app/src/store.ts`). Only preferences and a small library index
live in `localStorage`.

That split is not a preference. `localStorage` gives a page roughly 4.5 MB in
total, is synchronous, and signals exhaustion by throwing from the middle of a
setter — and Ksav filled it routinely: a 4 MB image is 5.3 MB once base64-encoded,
and the history was eighty whole copies of the document under one key. The throw
landed inside the compile path where nothing caught it, so the editor said
"rendering…" forever and every keystroke after that was lost. IndexedDB is
asynchronous, is measured in hundreds of megabytes, and reports failure as a
rejected promise the writer can actually be shown.

**Asset bytes live in their own bucket, keyed by content hash.** IndexedDB
structured-clones a record whole on every write, and autosave runs 600 ms after
a pause in typing — so a sefer with one 4 MB photo in it wrote 5.5 MB of base64
per pause, for a change of one character. The document record carries hashes;
the blobs are written once, shared between documents that use the same image,
and swept when nothing refers to them any more. Blobs are written *before* the
record that names them, so a failed write leaves the previous version intact.
Documents stored before this still carry their bytes inline and are read exactly
as they are — a schema change that has to rewrite everybody's documents to be
correct is a schema change that can lose them.

A write resolves on transaction *commit* rather than request success, so "saved"
means saved. The library index stays in `localStorage` because menus need it
synchronously; it is a cache, and `docs.init()` rebuilds it from the documents
whenever it disagrees, so it can never become the authority on what exists.

Saving is its own module (`app/src/save.ts`) on its own timer, and never depends
on rendering. A save that fails raises a banner that stays until the store works
again, with a **Download a backup** button on it.

## Licence

Dual-licensed **MIT OR Apache-2.0**, at your option — see
[`../COPYRIGHT`](../COPYRIGHT), [`../LICENSE-MIT`](../LICENSE-MIT) and
[`../LICENSE-APACHE`](../LICENSE-APACHE).

The six bundled fonts are **separately licensed** (SIL OFL 1.1 and the GUST Font
License) and their licences require the notice to accompany redistribution — which
includes every installer, the server binary, and the wasm module the browser build
downloads. See [`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) and
[`../licenses/`](../licenses); the same notice is rendered in the app under
Settings → About & licences, because the web build has no installer to put a text
file beside.

The English lexicon is derived from the **English Speller Database**, whose
licence covers word lists created from it and requires its notice in all copies.
That notice travels three ways: `../licenses/ESDB.txt`, the header of
`engine/assets/lexicon-en.txt` itself, and Settings → About.

Nothing under the GNU AGPL is bundled. Hspell — the only other open Hebrew
spelling dictionary in existence — is deliberately not included;
`engine/src/spell/hebrew.rs` gives the licence reasoning and the measurements
that ruled it out on quality grounds as well.

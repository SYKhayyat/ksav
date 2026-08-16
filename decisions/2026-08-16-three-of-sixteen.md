# Three of sixteen

**2026-08-16**

The Emacs package reached three of the engine's sixteen services: `compile`,
`commands`, `spell`. There was no door for `assemble`, `jump`, `reveal`,
`suggest`, `templates`, `sefarim`, `git`, `inbox`, `mekoros`, `linkify`,
`refresh`, `clipboard-source` or `saved-here`.

The suite was green over it, and one check was actively holding the gap open:

```js
// …a call to a Girsa service from Emacs would be a feature nobody has
// designed, and it should show up here as a decision rather than as a surprise.
check("…and none of them is one that needs Girsa or a repository",
      names.filter((n) => native.has(n)), []);
```

Read once, that is a sentence about deliberateness. Read twice, it is a test
asserting that six of the engine's services have no Emacs door — passing, for
months, because nobody had written them. A check whose green means *the feature
is absent* is worse than no check: it is a fence facing the wrong way.

## Why it matters more than a feature count

`ksav-service-native-p` was generated into the package, documented at length,
and had no caller outside its own unit test. Its whole purpose is the difference
between *this cannot be done here* and *something went wrong* — and a client
that cannot tell those apart reports the first as the second. So the reader of
an Emacs with Girsa closed had no way to learn that from Ksav, and neither did
the reader of an Emacs asking for a feature that simply had no elisp behind it.

That column is read now. `ksav-ask` signals a `user-error` when a service that
needs the installed application refuses, and an `error` when anything else does
— which is exactly Emacs' own distinction: one line for a state you are in, a
backtrace for a fault. The engine's own words are never rephrased in either
case.

## The package is six files

`ksav.el` was 618 lines and is now the mode, the keys and nothing else.

| | |
|---|---|
| `ksav-services.el` | the engine's registry, generated from Rust |
| `ksav-release.el` | which build runs on which machine, generated too |
| `ksav-engine.el` | getting, starting and asking an engine; reading a refusal |
| `ksav-preview.el` | compiling, the page, PDF and Typst out, jump and reveal |
| `ksav-write.el` | commands, templates, the sefarim catalogue, the speller |
| `ksav-girsa.el` | the six errands to the library beside Ksav |
| `ksav-git.el` | version control, on the git the writer already has |

The customisation group lives in `ksav-engine.el` rather than in the front door,
because a `defcustom` needs its group defined first and putting the group in
`ksav.el` would make the front door a dependency of every file that has a
setting. Elisp has no way out of a cycle.

## Decisions worth the ink

**Jump is the mouse only.** A jump needs a place *within* a page, and a page in
Emacs is one character with an image hung on it — there is no position between
its corners for a keyboard to be at. The conversion is pixels to the SVG's own
`viewBox`, which Typst writes in the unit both services speak, so neither the
window size nor any scaling can make the two sides disagree about where
something is.

**Reveal draws its mark inside the page.** Emacs can overlay an image and cannot
overlay a place within one, so the mark is a `<rect>` appended before `</svg>`
in the page's own coordinates — which are the coordinates the answer came back
in.

**There is no command to insert a place that `mekoros` found.** A Mekor is a row
from the library, not markup, and the one renderer that turns a source into Ksav
markup is in Rust, reached by the two paths that carry a whole packet: an
arrival over the loopback, and the clipboard. A second renderer in elisp is what
spec.md §10.3 rules out, and it would drift from the first one the week after it
was written. So this package shows what the library said and hands the insertion
back to the two doors that go through Rust.

**Nothing polls, and two errands start no engine.** `inbox` *drains*: two
clients on a timer would each take half the sources and neither would know. And
`saved-here` runs from `after-save-hook`, so going through the ordinary call
path would boot a whole typesetter on the first save of any `.ksav` file to
deliver a courtesy message. Both ask whether an engine is already answering and
say nothing when it is not.

**The sefarim catalogue is a `completion-at-point-function`**, offered inside any
quoted string rather than inside a citation specifically. The narrower claim
would mean this package deciding which of the engine's commands take a sefer
name — a fact about the engine, written down here, stale the day a command is
added. An alias completes to the canonical name, because that is the name the
source index files it under.

**`git` reaches all eighteen operations.** Five have commands of their own;
`ksav-git` offers the rest from `ksav-git-operations`, which is now generated
into `ksav-services.el` from `engine/src/git.rs`. What cannot be generated is
what each operation wants on the request — the engine does not publish that — so
that table is hand-written and held against the generated list by two tests.

## The fences, and what they cost to break

`PACKAGE_FILES` is swept from the directory instead of listed. It was a list of
three, written when there were three, and the package then grew to seven files:
a file left out of the tarball passes the byte-compile, the whole ERT suite and
every check in `emacs.test.mjs`, because all of those run out of the checkout
with `-L .`. It fails on the first machine that installs it.

The exemption lists in `emacs.test.mjs` are **empty** — every service has a call
site, every service is named in the README with the key that reaches it. That is
`settings.test.mjs`'s shape, and the empty list is the whole check.

Each was mutated and watched to fail, naming the instance:

| broken | said |
|---|---|
| `linkify` call renamed | `every service the engine answers has a door in Emacs: ["linkify"]` |
| `branches` row deleted | `every git operation says what it wants: ["branches"]` |
| `refresh` unmarked in the README | `every service is named in the README: ["refresh"]` |
| `ksav-service-native-p` call inlined | `something reads whether a service needs the installed application` |

## Two things the tests found

**A Typst export would have stopped to ask about coding systems.** Emacs picks
one for a new file from the locale, and a buffer of Hebrew is not representable
in a Latin-1 one — so an interactive Emacs on such a machine interrupts an
export to ask, and a batch one fails reading from stdin. `ksav-export-pdf`
already bound `no-conversion` for the same reason one file over.
`ksav-export-typst` binds `utf-8-unix`, and a live test reads the bytes back
rather than the length.

**`reveal` is line-granular, and its point is just outside the glyph run.** It
answers the same point for every column of a line, and handing that answer
straight to `jump` lands outside the text and is correctly told there is nothing
there. That is `typst-ide`'s own resolution and not something this package can
improve on, so the round-trip test asserts what the pair is actually for: a
click within a glyph's width of where `reveal` pointed comes back with the line
`reveal` was asked about. A desynchronisation worth catching moves that answer
much further than a glyph.

## What ran

49 ERT tests, of which 16 drive a real engine, plus the offline half in
`emacs.test.mjs` — and the tarball built, installed into a clean Emacs with
`package-install-file`, and required from the installed copy, because that is
the only way to ask what is in it.

# A door for the library — 14 August 2026

Inventory item 73: the service that justifies a whole process boundary with
Girsa had no caller at all for a long stretch. It has three now. Giving them a
door turned up four other things, and every one of them was a path that nothing
walked.

## The menu

**Sources** — look this phrase up in the library, make the citations in the
selection live, ask the library for every citation in the document again. A
menu of its own rather than rows in Insert or Format, and that follows from the
rule those two already keep: *Insert puts something new on the page, Format
changes text that is already there.* None of these three does either. They ask
the library a question about words already written.

Nothing in it is hidden when Girsa is absent. Each one says `girsaNeedsApp`,
which is a sentence a reader can act on; a menu that quietly loses three items
in the browser build is a product that looks different for no stated reason.

## What having no door had cost

`refreshSources` was in the command palette and nowhere else, which answers
*"I know what I want, get me there"* and cannot answer *"what is there?"*.

The other two were worse, and worth stating precisely. `wireKeys` answered
`Ctrl+Shift+L` and `Ctrl+Shift+M` by comparing `e.key` to a letter, on the
window, outside `DEFAULT_KEYS` entirely. Four consequences, none of them
visible from the code that caused them:

- Neither chord could be rebound. The keys drawer lists `DEFAULT_KEYS`.
- Neither reached `tools/card.mjs`, the key list or `F1`. All three read the
  table.
- Both went on firing while Vim or Emacs held the keyboard. `buildShortcutKeymap`
  returning nothing stands down *that* table, and a window listener is not in it.
- **`Ctrl+Shift+L` is `left`.** It has been since alignment was bound. Both ran:
  the editor aligned the paragraph and the window linkified the selection. Two
  actions on one combination, which is the single rule the table has.

They are `citePhrase` and `linkifyCitations` now. `Ctrl+Shift+M` is kept because
it was free; linkify moves to `Ctrl+Alt+L`, beside the other application-scale
errands. `prohibitions.test.mjs` forbids the shape that hid this: a modifier
flag and a literal letter, together, anywhere in `app/src`. A *bare* key is not
this class and is not forbidden — the hydra reads `q` and `Escape` with no
modifier at all, having deliberately taken the keyboard, and it lets every
modified key through untouched.

## Escape and the dropdowns

Opening a menu in acceptance broke the step after it: the menu stayed open over
the editor and swallowed the click. Escape does not close menus.

`PANELS` deliberately does not hold them — one per menu button, built with the
header, not fetched by id — and the argument for leaving them out of the Escape
sweep was that *"none of them can trap anybody, a click anywhere closes them"*.
That is true of a mouse and only of a mouse. Opened from the keyboard, a menu
stayed open on the one key every other surface here answers to.

The fix is in `closeOnEscape` rather than at the call site, and that is not
taste. `chrome.test.mjs` forbids a second `close…()` in the Escape branch, on
the grounds that a hand-written list of closers is what left the hydra out of
Escape in the first place. It is right, so the sweep grew instead. One door.

## The count that could not be measured

CI went red on a number: the suite reported 6,033 here and 6,034 on the runner,
and the documentation fence demands the README carry the figure.

Not a flake, and not the runner. `documentation.test.mjs` raises one assertion
per page in `decisions/`, and `trackedMarkdown()` read `git ls-files` — the
*index*. A decision entry written and not yet staged was invisible; after
`git add` it was not. So the total was one lower before the commit than after
it, and the number the fence wanted could not be measured until the commit that
would have to contain it already existed.

The link sweep in the same file had already learned this, twelve lines away:
*"Tracked alone is the tighter rule and the wrong one in practice: it fails a
page the moment it names a file added in the same change and not yet staged."*
Learned once, not swept to the sibling. `trackedMarkdown` takes
`--cached --others --exclude-standard` now, which is the same list.

## LICENSE → COPYRIGHT

An unrelated commit renamed `LICENSE` to `COPYRIGHT` so GitHub's licence
detector would stop reporting NOASSERTION, and updated the links in the prose.
Three references did not follow it: `ksav/README.md`'s licence line,
`tauri.conf.json`'s `licenseFile` and one bundled resource, and a literal in
`documentation.test.mjs`. Three CI jobs went red.

The doc sweep caught the first. Nothing caught the other two, and the desktop
one cost three minutes of a bundling job to say a filename was wrong. So
`services.test.mjs` now resolves every path `tauri.conf.json` tells the
installer to carry — `licenseFile`, every `resources` key, every icon — against
the disk. A `*` is checked as its directory holding something, since that is
the whole claim a glob makes.

## 2,187 directories

`tools/load.mjs` builds each module into `app/.tmp-load-XXXXXX` and deleted it
on an **unref'd two-second timer**, in processes that exit in eighty
milliseconds. The timer never fired. Two thousand one hundred and eighty-seven
of those directories had accumulated, each holding an esbuild of part of the
application.

That is not merely untidy here. A full disk on this project does not fail
cleanly: rustc leaves truncated rlibs whose errors read exactly like code
faults, and an afternoon goes into debugging code that is fine.

Deleted on `exit` as well as on the timer — safe there, where the original
`finally` was not, because nothing can still be importing once no further
asynchronous work can run — and a startup sweep takes whatever earlier runs
left. The sweep goes by **age**, an hour, because another test process may be
holding a directory of its own right now; `runner.test.mjs` asserts the rule
from both sides, since getting it wrong in either direction is the whole bug.

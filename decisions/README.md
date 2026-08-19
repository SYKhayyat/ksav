# decisions/ — the record, and why it is kept apart

Every file in this directory was true on its date and is not edited afterwards.
That is the whole contract, and it is the reason the directory exists.

## The seam this fixes

Until now there were three files at the repository root — `spec.md`, `fixes.md`
and `plan-notes-and-ui.md` — and each of them was **two documents with opposite
lifecycles bolted together**: a spec, which is edited in place and is always
current, and a log, which is written once and is a record of a day. Nine dated
wave/audit/resolution units lived inside them.

Every stale number in the repository lived at that seam. `fixes.md` opened with
a status paragraph carrying **three stacked "Superseded" notices** — one per
later audit — because its own rule (findings kept verbatim, so a fix is legible
beside the thing it fixed) is right for a log and makes a file that can only
grow, which is wrong for a status. `spec.md` said `ksav.typ` was 1,701 lines
when it was 2,324, and stated an assertion count that was wrong by 426 one line
above the paragraph explaining that assertion counts are not evidence.

Neither file was wrong to have been written. They were wrong to have been one
file.

So: the record moved here, verbatim, one file per dated unit, named by its date.
`spec.md` kept the part that is a specification — the eleven note options, the
ground rule that produces exactly eleven, and where a note's prose lives — and
is now a living document, swept by `app/test/documentation.test.mjs` like
`README.md` and `docs/` are.

## The rules, both of which a test enforces

1. **A file here is named `YYYY-MM-DD-slug.md`.** The date is the lifecycle
   marker: it is what says *this was true then*, and it is what the partition
   check in `app/test/documentation.test.mjs` reads. A file here without one is
   a red suite.
2. **A file here is not edited to make it current.** Correct a typo; do not
   correct a number. If something in here is now false, the answer is a new
   entry, or an edit to the living document that supersedes it — never a
   rewrite of the record.

The counted-claim sweep does not run over this directory, and the exemption is
checked from both ends: the directory as a whole has to be excusing something
real (at least one file here would fail the sweep), and every tracked `.md` in
the repository has to be either a living page or a declared log. That is
deliberately the same shape as `registry.rs`'s `ONLY_AT_TOP`, inverted — an
exemption is only safe when leaving something out is as loud as putting
something in.

## What is here

| | |
|---|---|
| [2026-07-20 · Product audit](2026-07-20-product-audit.md) | The first full read-through: *"replace Word, for Hebrew."* Errors, half-implementations, redundancy, UX, and what a Word user looks for and does not find |
| [2026-07-21 · Adoption wave](2026-07-21-adoption-wave.md) | *"Why a bochur still wouldn't switch"* — bracket healing, the Word handoff, installers |
| [2026-07-23 · Production readiness](2026-07-23-production-readiness.md) | The first list, and the standard of work the whole project has been built to, which is stated at the top of it |
| [2026-07-23 · Second audit](2026-07-23-second-audit.md) | The one that judged at the size and shape of a real sefer, and said *not ready* |
| [2026-07-24 · Resolution](2026-07-24-resolution.md) | What the second audit's blockers turned out to be |
| [2026-07-24 · Third audit](2026-07-24-third-audit.md) | The first audit that judged by *running* it rather than by reading it |
| [2026-08-04 · Borrowed wave](2026-08-04-borrowed-wave.md) | What Katvan already knew — click-to-jump, mixed-direction source, invisible characters |
| [2026-08-04 · Borrowed wave II](2026-08-04-borrowed-wave-ii.md) | typstify, and the fourteen features around it |
| [2026-08-04 · Notes and the UI around them](2026-08-04-notes-and-ui.md) | The plan, the browser sweep, and the post-mortem on why 2,276 green assertions had not caught any of it |
| [2026-08-07 · Writing a kuntres in it](2026-08-07-writing-a-kuntres.md) | The first hour of actually using it, and the three bugs that were green in 3,556 assertions |
| [2026-08-09 · Values, files, and this directory](2026-08-09-values-files-and-decisions.md) | The engine's tables crossing the seam as values, the prelude as a file, and why the record moved here |
| [2026-08-09 · The three-repository report](2026-08-09-lamdan-three-repos.md) | *The diagnosis is written down correctly and the sweep never runs* — eighteen classes, worked one at a time |
| [2026-08-10 · Fixed regions and peer streams](2026-08-10-regions-and-streams.md) | Percent-of-sheet heights, any number of regions, and regions for peer streams — the engine could already do more than the product could say |
| [2026-08-11 · Marking up the UI inventory](2026-08-11-marking-up-the-ui-inventory.md) | 156 offers handed over for markup: the seven complaints that were one missing concept, and the documents/panes/tabs model that answers them |
| [2026-08-12 · No preference ever survived a reload](2026-08-12-no-preference-ever-survived-a-reload.md) | A temporal-dead-zone ReferenceError in `loadSettings`, swallowed by a catch written for corrupt JSON, discarded every stored preference on every boot — which is why emacs mode did nothing |
| [2026-08-12 · Nothing ever asked what language the interface was](2026-08-12-nothing-ever-asked-what-language-the-interface-was.md) | *"Everything is coming in in Hebrew. I don't know why."* Four faults under one symptom, including a `setLang` that no boot ever called and a prose rule that was a ratchet |
| [2026-08-14 · The Girsa wave and the tail of the inventory](2026-08-14-the-girsa-wave-and-the-inventory-tail.md) | Fifteen chunks: Org both ways, the keyboard modes made real, the command vocabulary, side notes, and eleven findings relayed from Girsa — including the four that changed what the suite can see |
| [2026-08-14 · The two that were held](2026-08-14-the-two-that-were-held.md) | Version control on the git the machine already has, and an Emacs package that drives the engine — plus the three faults that only showed up when the elisp was actually run |
| [2026-08-14 · Seventy-five minutes of linking](2026-08-14-seventy-five-minutes-of-linking.md) | The remote green again, a CI job that was forty LTO passes over the same compiler, sefer text objects, per-document preview pages — and four measurements that were assumed rather than taken |
| [2026-08-14 · The only surface that knew](2026-08-14-the-only-surface-that-knew.md) | The shortcut list moved to a drawer of its own, and moving it exposed that twenty other surfaces printed chords no keyboard mode had left installed |
| [2026-08-14 · A door for the library](2026-08-14-a-door-for-the-library.md) | The three Girsa errands get a menu — and with it: two chords decided outside the bindings table, one of them already `left`; Escape not closing a dropdown; an assertion count that could not be measured before the commit that had to contain it; and 2,187 leaked build directories |
| [2026-08-14 · One pane, one siman](2026-08-14-one-pane-one-siman.md) | Narrowing: why the compile stays whole, why the span is an anchor rather than a range, and why the refusal cannot live where it belongs by shape |
| [2026-08-14 · Every pane is the editor](2026-08-14-every-pane-is-the-editor.md) | Four settings that reached only the focused pane — the document itself among them — and the rule that separates what a pane owns from what the application owns |
| [2026-08-14 · One question at a time](2026-08-14-one-question-at-a-time.md) | The notes chooser showed fifty controls for a decision most writers had already made; what it asks now, what was kept behind a preference, and the two counts that were written in files that could not see them |
| [2026-08-15 · A package that could not be installed](2026-08-15-a-package-that-could-not-be-installed.md) | The Emacs package worked and nobody could install it, and underneath that there was no `ksav` binary on any machine at all: what a release attaches now, why the engine assets are bare binaries, and why the tarball is installed rather than inspected |
| [2026-08-14 · The pages of one siman](2026-08-14-the-pages-of-one-siman.md) | A preview that follows the narrowed pane beside it: why the answer rides on the compile instead of on `reveal`, why a page reports runs rather than a range, and why the pages it drops are hidden rather than removed |
| [2026-08-16 · The pins nobody was watching](2026-08-16-the-pins-nobody-was-watching.md) | Every CI job carried a Node 20 deprecation notice for weeks — a red remote on a date GitHub picks — and the sweep for it cannot live in this repository, because whether a pin is behind is a fact about somebody else's releases |
| [2026-08-16 · Three of sixteen](2026-08-16-three-of-sixteen.md) | The Emacs package reached three of the engine's sixteen services, and one test was holding the gap open by asserting it; what the other thirteen doors are, and the empty exemption list that now says so |
| [2026-08-16 · Three panes, one caret](2026-08-16-three-panes-one-caret.md) | Returning to a sefer put every pane at the focused pane's caret; why the fix is a third table rather than a field on either of the two that exist, and why the preview is the same complaint one pane over |
| [2026-08-16 · Reading the seventy-seven](2026-08-16-reading-the-seventy-seven.md) | Every box of the 11 August inventory read against the code as it is now: seventy-six done, how each verdict was reached, the one that was open, and the four open questions that have answers |
| [2026-08-16 · Writing a kuntres in it](2026-08-16-writing-a-kuntres-in-it.md) | An hour of real writing in the assembled application — simanim, bands, a table, an import, a PDF: the three bugs of 7 August are gone, and the status bar said *rendering…* after the file had landed |
| [2026-08-16 · Two numbers under one noun](2026-08-16-two-numbers-under-one-noun.md) | The five onboarding pages read as the newcomer: the page that says *use it* never said how to get it, and the count fence was enforcing the registry's number onto three sentences about what the editor offers |
| [2026-08-16 · A look of its own](2026-08-16-a-look-of-its-own.md) | Anything that is a separate command has a style the writer can set: why the source note and the siman were refused one twice, why the answer is the register that already exists rather than a channel each, and the twenty-four commands the rule still owes |
| [2026-08-16 · Where the trouble is](2026-08-16-where-the-trouble-is.md) | The engine computes a line, a column, the command and a suggestion for every diagnostic, and two of the three surfaces that show one threw all of it away — found by writing a sefer, along with the reason no `#name[…]` command had ever been named in its own error |
| [2026-08-16 · Arguments, not commands](2026-08-16-arguments-not-commands.md) | Five commands mean nothing outside their parent and two of them were the identity function, so `#רשימה[#פריט[א] #פריט[ב]]` silently laid out one bullet holding both words — the mark that fixes it, the one list both sides read, and the merge rule that offered the command nowhere at all |
| [2026-08-16 · Every machine but this one](2026-08-16-every-machine-but-this-one.md) | A Nix dev shell for Linux and Apple Silicon, checked by building it — and the fact it surfaced on the way in: all three workflows pinned a Node that had been End-of-Life for three months, on a pin this morning's record had deliberately left alone |
| [2026-08-16 · Green here, red there](2026-08-16-green-here-red-there.md) | A locator that read the page twice and disagreed with itself, a warning that only found the commands asking for italics *first*, and the platform the README claims in the present tense that nothing had ever run |
| [2026-08-17 · The version nobody runs](2026-08-17-the-version-nobody-runs.md) | The Emacs suite run on Linux for the first time, where sixteen of fifty failed on one fault: `ksav-running-p` asked whether `url.el` returned a buffer rather than whether a server answered, so the package started no engine on any current Emacs while CI, pinned to the declared floor, stayed green — plus v0.1.1, the badge that named a Hebrew command to an English writer, the MELPA submission drafted, and the last three documentation pages |
| [2026-08-17 · A clamp is not a mapping](2026-08-17-a-clamp-is-not-a-mapping.md) | A long kuntres written in the assembled app: a table of contents that printed above the document's own title, and eighteen table operations that returned the old caret offset clamped into the new text — always legal, almost never right, and one keystroke from destroying the table. The same class swept next door found six more in the lists and three in the headings. Plus a dialog that refused, wiped its own refusal and closed; the deploy workflow that fires only on tags, to an environment that allows only branches; a notes drawer numbering notes in a series that is on no page; a section move that carried the blank line with it past a round-trip test that could not see it; nine English words in the find panel; and a table that could not be filled in from the keyboard, which took loosening "no two actions on one combination" to a rule about effects rather than names |
| [2026-08-17 · The marker is not resolved, it is paired](2026-08-17-the-marker-is-not-resolved-it-is-paired.md) | The notes drawer shows the glyph the page printed, and the mechanism the handoff specified for it could not work: a marker is generated inside the prelude, so its span names a file the writer does not have, and every marker run in every arrangement resolves to nothing. What resolves is the note's prose beside it, so the marker is paired rather than read — three rules in the engine and two in the client, each held by a mutation, two of which first exposed fences that could not fail. Plus a marker from an included chapter dropped rather than translated, and a compile hook that had been defined, exported, called and never registered |
| [2026-08-17 · What a newline does](2026-08-17-what-a-newline-does.md) | A single newline is a space, so the shortest way to any visible break is two lines — and of the five commands that answer that, two had no door of any kind and the two with keys sat in a row that printed neither. The page break takes `Ctrl+Shift+Enter` rather than Word's `Ctrl+Enter`, because the comment claiming that combination was free had asked what Word does with it *inside a list*. The family is a checked list now: every `מעבר_` command in the engine must have a door, with a glyph and a name and a lede in both languages |
| [2026-08-17 · Three haaros from the writing side](2026-08-17-three-haaros-from-the-writing-side.md) | Three complaints from somebody using the application: a strip that announced there was nothing to do, a Save that downloaded a fresh copy every time it was pressed, and no way to move a pane. None was a broken mechanism. The first was a sentence written for a different moment, now behind a preference that is off; the second was three individually honest halves — `canWriteBack` false for the download tier, `saveAs` degrading to a download, `saveFile` offering a Save As — composing into a loop with no exit, since no number of downloads ever produces a writable binding, now one named `saveRoute` with the `libraryOnly` case that did not exist; the third was a pane tree that could be split, closed, resized and replaced but never rearranged, now `swap` for any two panes, four directional keys and a drag, with "left" read off the live layout because neither RTL nor the stacking breakpoint is in the tree |
| [2026-08-17 · The scroll that fought itself](2026-08-17-the-scroll-that-fought-itself.md) | Six complaints from a writer who called the product unusable, and the one marked most important was three defects wearing one coat: a linked-scroll mirror guarded by a boolean, which never guarded once because scroll events are dispatched at frame time rather than synchronously — forty wheel ticks asking for 2,000 px moved 1,086 of them and cost a 591 ms frame; a 358 KB page hydrated with `innerHTML` inside the IntersectionObserver callback, and re-hydrated every time it came back because leaving emptied it; and Typst's glyph tables reaching the browser as 2,254 `<use>` elements per page, whose shadow trees cost 496 ms where the paths themselves cost 20. Plus a caret that rebuilt every prose decoration on every move, invisible at 52 KB and 17.3 ms at 520; a pane strip that was two buttons and is now a number, both splits, a menu and an `×`; a drag that could not have worked in the desktop app because Tauri's `dragDropEnabled` defaults to on and WebView2 eats HTML5 drags; a search panel over the dropdown, because CodeMirror's base theme carries a generated scope class and beats a one-class selector; a ribbon group labelled **Heading** over the control that sets every style; and, found only because the Firefox run was measured against a `git worktree` at HEAD as a control, a caret left sitting inside markup that is still hidden — CodeMirror's tile walker running off the end of its tree, once per keypress, logged from inside the library and green in every test |
| [2026-08-18 · The UI doc comes back marked](2026-08-18-the-ui-doc-comes-back-marked.md) | The walkthrough document returned with the writer's haaros in the margins. The crash from the last wave got its cause: `Cannot destructure property 'tile'` is CodeMirror's tile renderer, new in view 6.39.0, so view is pinned to 6.38.8 (and lint to 6.9.5) where the code does not exist. Italic was never on the page — `emph` requests a face no bundled Hebrew family has — so `#נטוי` now shears into a synthetic oblique on paper while HTML export keeps the semantic `<em>`, and the warning it used to raise is gone. Plus: notes reached from the toolbar returning focus to the editor with the caret inside the brackets, Enter inserting a list item after the current one rather than at the end, a first Ctrl+S that stopped demanding a filename, a dismissable error banner, a key for `#מעבר_שורה`, a language switch that no longer nudges the source; and three handed-back design calls — a scroll alignment point that follows the caret and glides rather than jumping a line at a time, per-note-kind inline/deferred bodies, and a preview cadence for big seforim. The React and Flutter prototypes are deleted; the two apparatus-wired deprecated commands are not |
| [2026-08-19 · The external audit, answered](2026-08-19-the-external-audit-answered.md) | An outside reader audited the engine, the client and the running product and returned forty findings — every one of them in territory a green suite of 6,596 assertions did not cover. All fixed. `/git` and the five other `Reach::Native` services now answer only a loopback peer, with `KSAV_TOKEN` on top for a shared box, and the local-process half is stated as the boundary it still is; `ext::` is off on every git invocation and remote URLs take an allow-list; the asset cache verifies the client's hash instead of trusting it, so bytes cannot be installed under a name they did not earn. Four races: the wasm lane counter went negative after any worker timeout and silently returned the browser build to FIFO, `openDoc` was re-entrant across three awaits, the Girsa poll grew a timer chain per focus, and the losing side of the compile race threw the crash panel over a healthy app. Five hot paths that computed the whole document to produce a paragraph. The inbox is two-phase now, so a lost response costs a repeat rather than the source. And the notes: a command's language was a property of a string literal in four places, so an English document fell out of the note path entirely — no head line, `deferNoteBodies` ignored — while the conversion menu and the apparatus lint wrote Hebrew into it. The fences are the point: the whole note suite runs in both languages, a prohibition sweeps for a Hebrew command literal, a scanner over every rendered button found ten unnamed ones the audit had not, and the note menu — dismissible only because it wore `.spell-menu` for its CSS — has a registry row and is driven in a real browser |
| [2026-08-19 · A .ksav is not always text](2026-08-19-a-ksav-is-not-always-text.md) | Found by trying to compile the tester's map and getting thirty-seven errors on a document that was fine. A `.ksav` is plain text when it can be and JSON when it cannot — `serializeDoc` wraps it the moment it carries an image, its own page setup or its own `#let` commands — and that rule had one implementation, `parseDoc`, in a browser tab. So the CLI compiled the wrapper as prose and printed `compiled (16 page(s))` over a PDF of `{"format": "ksav-document", …}`, under a usage line reading `ksav <input.ksav>`; Emacs showed the writer their own JSON; and even a plain-text file was laid out with `DocConfig::default()`, so a sefer set to A5 came out of the CLI as A4 with nothing said. `engine/src/docfile.rs` reads the format for both clients, the CLI subtracts the custom-command preamble from every diagnostic's line the way `Diagnostic::line` always asked its callers to, and `ksav-mode` unwraps on the way in and wraps on the way out — keeping the container whole, including fields it does not understand, and reading it with `json-parse-string`'s sentinels so a `false` does not come back `null`. Six elisp call sites that sent `((body . ,(buffer-string)))` and nothing else go through one `ksav-request`. The second implementation is held to the first by `engine/tests/docfile_oracle.rs` against a corpus built out of `serializeDoc`, mutation-tested three ways; on its first run the oracle found a second bug, a cast in `parseDoc` that threw on any file whose asset entry had no `data` |

Every file in this directory is in that table, and a test says so: an index
edited by whoever remembers is an index two entries behind, which is what this
one was.

One dated record is deliberately **not** here:
[`lamdan/whole-repo-2026-08-05.md`](../lamdan/whole-repo-2026-08-05.md), the
whole-repository audit, which lives where the tool that produced it writes. It
is a declared log for the same reason everything here is, and it is answered
section by section in place rather than appended to.

## What is not a decision

The design reasoning that is *not* dated and *is* still load-bearing stayed
where it was, because it is not a record of a day:
[`ksav/engine/README-notes.md`](../ksav/engine/README-notes.md) — the note
apparatus, including the two note-identity designs that were tried and
abandoned, and the four ways of separating a note number from its text that
were each measured and rejected. Negative results are the one artifact git
cannot reconstruct. Not a line of it was cut.

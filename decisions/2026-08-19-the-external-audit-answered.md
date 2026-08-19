# 2026-08-19 · The external audit, answered

An outside reader audited `d546811` plus the working tree — the engine's request
path, service registry, server, git driver, asset cache, include expansion and
loopback; on the client, `main.ts` through its editor, pane, document, file,
scroll and boot regions, and eighteen modules read in full; then a second pass
over the notes and apparatus region. Forty findings, tagged by how they were
established: **CONFIRMED** where something was executed and the evidence quoted,
**CODE** where the mechanism was named from reading.

The suite was green the whole time. That is the fact worth recording before any
of the fixes: 96 files and 6,596 assertions passed while `/git` answered any
process on the machine, an English document fell out of the note path entirely,
and the browser build's priority queue switched itself off permanently after any
worker timeout. Every finding below is in territory the suite did not cover, and
the fences at the end are the part that matters more than the fixes.

Everything is fixed. Both suites are green — 6,714 editor assertions across 97
files, 791 engine tests across 44 binaries — the assembled application passes 747
acceptance checks in a real browser, and the two findings the auditor reproduced
against the release binary were re-reproduced here and are now refused.

---

## 1 · The security half, and the boundary that honestly remains

**`/git` was reachable by anything that was not a browser.** `origin_allowed`
lets an absent `Origin` through, deliberately, so `curl` and the Tauri shell
work. That is a reasonable rule for the compile services it was written about.
`git` arrived later, offers seventeen operations including `commit`, `push`,
`restore`, `revert`, `remote-add` and `merge`, and takes an arbitrary absolute
path — so the caller chose the repository. And `serve` takes any bind address,
so the moment somebody runs `ksav serve 0.0.0.0:7878` to read their sefer from a
tablet, which is the obvious reason to type an address at all, every host on the
network could read any file at any revision in any repository on the machine.

`reach` was already the column that separates these from the compile services, so
the gate is one check in `handle()` keyed on it rather than a rule per service.
Two parts:

1. **A `Native` service answers only a loopback peer.** It needs the *installed*
   application — a folder on this disk, a program to run in it, the desk Girsa
   posts into — so a caller that is not on this machine is asking for something
   that is not theirs, whatever address the writer bound to. This closes the
   network half outright. A tablet reading the sefer over `0.0.0.0` still gets
   the whole editor and every compile service; what it does not get is the git
   driver. `serve` now says so on the line where it binds.
2. **`KSAV_TOKEN`, when it is set, makes `X-Ksav-Token` mandatory on those
   services.** That is what a shared or managed box needs, where loopback is not
   the same set of people as "the writer".

**Stated plainly, because the boundary matters:** with no token configured, any
process running as this user can still drive these services. That is the same
trust boundary as the writer's own files, and this gate cannot close it alone —
a per-run secret the embedded bundle cannot be given is a secret the served page
cannot send. The auditor offered the token gate and the loopback refusal as
alternatives; both are here, and the local half is a decision the writer makes by
setting a variable rather than one this file pretends to have made for them.

Verified against the release binary: git over loopback with no token 200, with
`KSAV_TOKEN` set and no header 403, with the header 200, from the machine's LAN
address 403, and `GET /` from that same LAN address still 200.

**`remote-add` accepted a transport that runs a command.** git's `ext::`
transport runs the rest of the URL as a command on the next `fetch`, `pull` or
`push` — all three of which the same service offers — and `protocol.ext.allow`
defaults to `user`, which permits it for a remote the user configured. From git's
point of view a remote added through this service *was* configured by the user.
`plain()` refuses a leading dash, a NUL and a newline and is deliberately not a
character whitelist because Hebrew paths must survive it; `ext::sh -c 'whoami'`
has none of those.

Both halves: `-c protocol.ext.allow=never` joins the four standing `-c`s on every
invocation, which holds even for a remote this service never saw — a clone, a
`.git/config` that arrived with a document — and an allow-list on the URL gives
the writer a sentence instead of a fetch that fails later for a reason the git
panel cannot explain. An allow-list rather than a blocklist, because a blocklist
is a list of the transports somebody had thought of. `https`, `http`, `ssh`,
`git`, `file`, `git+ssh`, `user@host:path`, a Windows drive path, a bare local
path — and `ext::` splits as host `ext` and path `:sh -c …`, which a genuine
`host:path` never does.

**The asset cache trusted a hash it never verified.** It stored bytes under
whatever string arrived in `hash` and later handed them to any request naming
that string — under a name the engine had never seen, carrying no bytes of its
own. The map is process-wide and shared across every document and every window
talking to one `ksav serve`, so a caller could seed hash `H` with an image of
their choosing before the writer's client asked for `H`, and the writer's sefer
printed somebody else's picture.

The engine now recomputes the client's hash over the payload exactly as it
arrived and installs nothing under a key that disagrees. The bytes on the request
are still used — they are right there, and the writer wants their image — and the
next hash-only request for the claimed key is told to re-send. **Verification
means reproducing the caller's arithmetic and checking it, not substituting
arithmetic of our own**: the client asks by that string, so the map has to be
keyed by it. `engine/tests/assets.rs` holds the two functions to each other with
vectors taken from the JavaScript.

It also makes `docs.ts::assetHash`'s own comment true as written. It reasons
about collisions *"for the handful of images a document carries"*, and the domain
was every asset the process had seen across the whole library. Now the key is the
engine's hash of the bytes rather than a claim about them, which is what that
argument needs in order to be an argument.

## 2 · Four races, and the shape they share

**The wasm two-lane queue disabled itself permanently after any worker timeout.**
`failAll` zeroed `foregroundPending` while the outstanding `finally` blocks were
still owed their decrement, so each decremented from zero: the counter went
negative and never returned. `foregroundPending > 0` false forever, so nothing
was ever held; `--this.foregroundPending === 0` false forever, so the lane was
never drained from the foreground side either. One worker death and the browser
build was back to plain FIFO — precisely what `AUDIT-perf-and-blocking.md` §B1
was written to end, *"a background layout or the 1 Hz inbox poll in front of the
compile the writer was waiting for"*. Silently, and at the worst moment: a worker
dies because a document ran away, which is when the next compile matters most.
Clamped, and `services.test.mjs` asserts the counter is never negative through a
forced `failAll` and that a background job still waits behind a foreground
compile afterwards.

**`openDoc` was re-entrant across three awaits.** Its only guard was an early
return for the *same* id, so two switches to different documents — one click in
the switcher, one `Mod-1` — interleaved freely: `refreshBaseline()` dispatching
document A's baseline into a view now holding B, `rememberPages(leaving)` filing
B's pages under A's id, `retargetPanes(leaving, id)` relabelling panes for a
document no longer arriving. `setSwitching` looks like the guard and is not one.
It takes a ticket now, the way `runCompile` does — and the way this very
function's binding recall already did five lines from the end, whose comment
reads *"a newer switch has won"* while the rest of the function did not ask.

**The Girsa poll grew a timer chain per focus that landed mid-poll.** One
`pollTimer`, overwritten by `arm`, so `wake()` could only cancel the newest
timer, and a poll already running was not cancellable and re-armed itself. Six
tab-returns landing during an in-flight poll produced seven independent chains
and nothing could observe or collapse a duplicate. An epoch guards the *chain*
now, so a superseded one retires instead of re-arming. Not reproducible over
loopback, where a poll takes about a millisecond; the trigger is a slow inbox.

**The losing side of the compile race was nobody's.** When the deadline won,
nothing was attached to `run`, so a later rejection was an unhandled promise
rejection — and `crash.install` listens for exactly that and puts the full-screen
crash panel over the application. On the desktop build, a compile that overran
twenty seconds and then failed told the writer "Ksav has crashed", over an
application that had not, in the middle of a document that was fine.

**And the spell menu acted on offsets captured before an await.** The only
staleness check asked whether the *menu* was still on screen, not whether the
document still said what the misspelling described — and the menu is not modal.
It checks the span against `m.word` before dispatching now, which is the guard
the paste handler twenty lines away already had.

## 3 · Whole-document work on paths that run per keystroke

- **The incremental spell check computed the whole sefer to send one paragraph.**
  `checkableText` ran over the entire document and the result was then *sliced* —
  3.2 ms per call on 64 KB, 8.0 ms on 200 KB, on the main thread, on a 700 ms
  timer, while the writer is typing. The regions are still computed over the
  whole text and deliberately: a paragraph is not a safe boundary to *parse*
  from, and `spans.scan` is memoised, so asking the whole document what is prose
  is nearly free. What was not free was this function's own second and third
  passes — an `Array<string>` one entry per code unit, filled and joined — and
  those are now bounded to the window.
- **`includedParts` read the entire library and memoised it forever.** A document
  that includes one chapter caused every document in the library to be read out
  of IndexedDB and held, bodies and all, for the life of the tab. `parts.ts`'s
  header states the opposite intent; the *sending* was fixed and the *reading*
  was not, and the `lookup` callback was already the right shape. `collectAsync`
  resolves names on demand, and the memo is bounded.
- **`include::expand` rebuilt the body and a per-line map on every request.** The
  doc comment said *"a request with no `parts` expands to itself, at no cost"*.
  It was one 200 KB `String` and about five thousand `Origin` structs per
  compile, jump, reveal and assemble. Short-circuited — and the empty map is not
  a new state to teach the readers: it is what they already agreed means "a line
  of the main document that nothing was included into". `Expanded.expanded` says
  it out loud rather than leaving it inferred from a length.
- **`library()` re-sorted on every call** and is called once per item inside
  several loops. Memoised, invalidated by `writeIndex`, which is where every
  mutation of the index already ends up.
- **`flattenGlyphs` re-ran on every hydration of the same page.** Cached by the
  engine's own page hash — **on the window, not the module**. `pagecache.test.mjs`
  caught the module-global version by drawing a document with no names and then
  drawing different pages under the names an earlier draw used, and it was right
  to: a hash is only meaningful inside the draw that produced it.

## 4 · Things that were half-wired, and things the editor did without being asked

The pattern across this section is a mechanism that exists, works, and is not
reached — or is reached and says nothing when it fails.

- **Every pane-strip control was announced as its glyph.** `iconBtn`'s docstring
  says this was found once and closed — *"a screen reader announced the toolbar
  as '†, button' … forty-two of them, page-wide, with zero `aria-label`"* — and
  it hardcoded `tb-btn` on the class list, so every surface whose buttons are not
  ribbon buttons could not use it and built its own. `paneHead` was the bulk: 
  eleven controls per pane, in the surface a writer uses to arrange their window,
  and its own comment said *"the only other thing that could identify them is the
  `title`"* — a statement that they are **not** named, written as though it were
  a fix. `glyphBtn` is the one producer now, and a scanner in `dom.test.mjs`
  found **ten more** across the shell that the audit had not named.
- **Desktop file autosave silently never ran after a restart.** Three correct
  pieces: the shell refuses any path not chosen in a dialog this session,
  `hasWritePermission` returned `true` for every `tauri` binding because it had
  no way to ask, and the background save swallowed the refusal because *"a
  background save that fails must not steal the writer's attention"*. A
  `ksav_path_allowed` command makes the answer a real one.
- **A failed settings write was silent while a failed read had a banner** — and
  that key holds keybindings, macros, snippets, whole pane trees and every tab's
  serialised arrangement. The string was already written; it was wired to one
  half.
- **`watch.forget` had no caller**, `removeAsset` never swept the blob it
  orphaned, and `attachAsset` marked nothing dirty — so a font attached to a
  document reached the library copy and never the bound `.ksav`, silently.
- **Pasting replaced `selection.main` only**, losing every other cursor with no
  indication, and carried no `userEvent` — so the macro recorder never saw it,
  while the comment above its filter says *"an IME, **a paste** and a nikud button
  all record as the text they produced"*.
- **`takeRefreshed` found its citation with `indexOf`**, so a sefer citing the
  same place twice could never update the second — and it ended by replacing the
  whole panel list with the row just accepted, losing the other thirty-nine.
- **Declining a handed-over document inserted it anyway.** The prompt asked
  whether to replace what is open, and **No** spliced the whole document in at
  the caret. Insert-here is genuinely useful, which is why it is now offered as
  the third button rather than hidden behind the refusal.

## 5 · The inbox, which was promising more than it kept

`drain()` emptied the list **and truncated the file** before the answer had
reached the client, and the client's `inbox()` swallows every failure by design.
So a response lost between the engine and the tab — a reload landing between the
POST and the parse, a wasm worker killed by the compile timeout mid-poll — took
the sources with it, from memory and from disk, with Girsa already told
`{"taken":true}`. The module's own standard is the one it missed: *"spec.md §10's
stated target is AirDrop, and AirDrop does not lose the file when you close the
window."*

Two-phase now. An `Arrival` has an id; `drain` moves what it hands out to a
`HANDED` list rather than out of existence, and the *next* poll's `took` is what
finally lets go. A client that never comes back is handed the same source again.
**Re-delivery rather than loss is the right way round**: a duplicate is a
paragraph the writer deletes, and the alternative is a source Girsa was told had
arrived and that nothing on this machine still holds. No second service and no
extra round trip — the poll is the only errand there is. And `remember` writes
beside-and-renames, which is the rule `ksav_dictionary_write` states twenty lines
of comment away and which this file, holding sources somebody has already been
told arrived, was the last to follow.

Also here: `store.forEach`'s visitor throwing escaped into the IndexedDB event
handler, so `cursor.continue()` was never called and the promise never settled —
which could hang boot on a blank page through `rebuildIndex`. And nothing handled
`db.onversionchange`, so two tabs deadlocked on a schema upgrade with no sentence
saying that closing the other window was the fix.

## 6 · Notes: one assumption, four surfaces

`note-commands.ts` opens with a finding it is proud of, and this section is that
finding still open:

> *"Nothing failed, nothing was logged, and 2,580 tests passed: every one of them
> asked the question in Hebrew."*

The list of note commands was centralised. What was not centralised is every
*other* place a note command was written as a Hebrew string literal, and there
were four.

**The root, stated once:** a command's language was a property of a string
literal instead of of the document. `mode.ts` now exports `canonicalName`,
`sameCommand` and `paramIn` — one answer to "are these two names the same
command", derived from the registry — and the four sites ask it.

- **`noteFor` string-matched the cards' Hebrew markers**, so `tieredNoteAt`'s
  deliberate `#fnote` and `#tier2` were not notes at all. `plan` fell through to a
  plain splice, which skipped the two things only the note path does: the
  `nested` card's `head` line — the one that makes a two-layer apparatus's markers
  say which layer they point into — and `settings.deferNoteBodies`. All four
  routes that write a tiered note were affected. The document compiled, the page
  looked finished, and a reader could not tell the layers apart.
- **`openNoteMenu` built its conversion targets from the same literals** and
  `convertNote` writes them verbatim, so an English writer's only offer was to
  rewrite `#fnote` as `#הערה` — a change of language presented as a change of
  layout. Its exclusion filter compared a Hebrew list against an English command,
  so the note's own layout was offered too. `conversionTargets` lives in
  `notes.ts` now; the menu asks rather than scraping.
- **`choiceForCommand` matched Hebrew only**, which is the trap in the obvious
  fix: translating the targets alone would have made `choice` null, skipped
  `scaffold`, and reproduced *"converting a footnote to an endnote produced an
  endnote with no `#הערות_בסוף()`"* — the collected-and-never-printed failure,
  performed by the product and then reported back to the writer as a lint.
- **The "collected and never rendered" lint repaired in Hebrew only.** Detection
  was bilingual from the start; the repair was a Hebrew literal including the
  argument name, and the streamed case wrote a Hebrew command, a Hebrew parameter
  and an English stream name in one call — into the writer's document, from a
  button labelled "render the notes". The rules name a command now and `unrendered`
  decides the language once, so the sentence on the line and the text the button
  writes are the same string. The stream *value* is the writer's and is not
  translated; the parameter beside it is.

**The note menu was dismissible only by a class collision.** It is appended
straight to `document.body`, is not in `PANELS`, and was swept only because it
wears `.spell-menu` for its styling. That worked, for a reason nothing stated —
and `styles.css` already gives `.note-menu` its own rules, so the day somebody
dropped the shared class it would have stopped answering Escape with no test
going red. It has a registry row and a `mountPanel` call now, and the spell
menu's selector excludes it, so each surface is swept by its own entry.

---

## The fences, which are the point

The auditor's own framing: a repository that can name a class and does not sweep
it is missing the step where a named class becomes an executable prohibition.
Every fix above has one.

- **`test/notelangs.test.mjs` — the important one.** Every question the note path
  answers, asked in `he` and `en`, from the same table, in the same assertion:
  `noteFor` over all seven tiers of every family, `plan`'s kind, the `nested`
  card's head line, `conversionTargets` and its exclusion, `choiceForCommand`
  over every offered target, `unrendered`'s fix in both languages, `addDump`'s
  command **and** parameter **and** untranslated stream value, the repair round
  trip, `notesIn`/`noteAt`, and `applyChoice` writing no Hebrew command into an
  English document. §6.1–§6.3 all go red at once.
- **A prohibition on a Hebrew command literal outside the canonical table.**
  Comments stripped first, because fifty-odd `#הערה` in these files' prose are
  documentation and a sweep that cannot tell a docstring from a value is a sweep
  somebody deletes.
- **A scanner over every rendered button** in `dom.test.mjs`: a lone
  string-literal child with no letter or digit in it, and no `aria-label`.
  Scanned rather than pattern-matched, because a regex over the attribute object
  misses an `aria-label` behind a nested brace and flags a button whose child is
  a real word — and a sweep with false positives is a sweep somebody deletes.
- **`foregroundPending` is never negative** after a forced `failAll`, and a
  background job still waits behind a foreground compile afterwards.
- **Every surface in `PANELS` is classified in `surfaces.mjs`** — which is what
  caught the note menu the moment it got its row, and which now drives it in a
  real browser: right-click a note, measure the menu, dismiss it.
- **An unverified hash-only asset comes back in `missing_assets`**, and the
  engine's hash is held to the client's with vectors from the JavaScript.
- **A bind address is known to be loopback or not**, and the gate is keyed on the
  registry's own `Reach` column rather than a list of service names — a fourth
  hand-written copy of that table being exactly what this repository has been
  bitten by three times.
- **An `ext::` URL is refused, and `protocol.ext.allow=never` is asserted off
  git's own config** on a real invocation.
- **A source handed out and not acknowledged survives a restart; an acknowledged
  one does not.** Both halves, because they are the trade being made.

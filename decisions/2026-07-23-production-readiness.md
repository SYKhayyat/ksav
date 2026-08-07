# Ksav — production readiness: what was fixed, and what is left

> ## Standard of work
>
> **Every item in this document must be finished to the highest standard of perfection.
> Never compromise.**
>
> No shortcuts, no "good enough for now", no hiding a broken feature behind a flag and
> calling it done. Where something is half-built, finish it — completely, correctly, and
> in a way that holds up under a real writer using it for real work. Where a fix reveals a
> deeper problem, fix the deeper problem. Where a test would catch a regression, write the
> test. Where the honest answer is that something cannot be done, say so plainly and in
> full, and do everything else.
>
> The bar is not "the bug no longer reproduces." The bar is that the code, the behaviour,
> and the reasoning behind both are ones you would be glad to have someone read.

---

This was an assessment; it is now a record of the work done against it. The
original findings are kept verbatim under each item, because a fix is only
legible next to the thing it fixed.

## Status

**Every engineering item is done.** What remains is not engineering: one item
needs a GitHub account, one needs code-signing certificates, and one needs five
bochurim and a zman.

> **Superseded in part.** A second audit on 23 July 2026 — appended at the end of
> this file — found three blockers this list never looked for, all of them at the
> size and shape of a real sefer: a table edit that corrupts merged cells, a
> compile with no bound on time or memory, and editing latency that is quadratic
> in document length. The verdict there is *not ready for general release*, so
> the sentence above should be read as "every item **on this list**".

> **Superseded again.** A third audit on 24 July 2026 — also appended at the end
> — found no blockers. It is the first one that judged the product by *running*
> it rather than by reading it: every template and every command compiled, the
> engine measured at real sefer scale, and the two shipping modes these lists had
> only ever reasoned about — the browser (wasm) engine and the desktop installers
> — built and exercised for the first time. Its verdict is **ready**, and what it
> found were four documentation defects, one missing CI job, and two small code
> gaps, all since fixed.
>
> It also overtook the top of this file. "One item needs a GitHub account" is
> done: the remote exists, CI runs green, and `v0.1.0` built installers on
> Windows, Linux and both macOS architectures. What is left of that line is a
> certificate, five bochurim and a zman — and one draft release that was never
> published, which is the only thing now standing between the installers and the
> people they were built for.

| | |
|---|---|
| Blockers | 4 of 5 fixed; #5 (git remote) prepared, needs the repo |
| Serious | 8 of 8 fixed |
| Code quality | done |
| Non-intuitiveness | done |
| Missing | 2 of 5 done; 3 are money or people, not code |
| English / LTR | typography, spell-check, starter, templates and parameter names — done |
| Tests | 37 assertions in 1 file → **351 in 8**, plus 145 engine tests |

---

## Blockers

### 1. Storage exhaustion silently stopped saving and rendering — **fixed**

> `docs.putDoc(currentDoc)` at `app/src/main.ts:749` sits *before* the `try` that
> starts at line 761. When `localStorage` fills, it throws, `runCompile` never
> reaches its `catch`, the status line stays on "rendering…", and every subsequent
> keystroke repeats the failure. The writer sees a slow render, not a failure, and
> keeps typing into a buffer that is no longer persisted.

Saving no longer depends on rendering. It is its own module (`app/src/save.ts`)
with its own debounce, its own serialised queue and its own error handling; the
compile path (`app/src/compile.ts`) never touches storage. A failed save raises a
red banner that stays until the store works again, carrying a **Try again** and a
**Download a backup** button — because "your work is not being saved" is only half
an answer without a way to rescue it.

The store underneath moved to **IndexedDB** (`app/src/store.ts`). localStorage
gives a page ~4.5 MB in total and signals exhaustion by throwing from inside a
setter; IndexedDB is measured in hundreds of megabytes and reports failure as a
rejected promise. A write resolves on transaction *commit*, not on request
success, so "saved" means saved. The library index stays in localStorage because
menus need it synchronously — it is a cache, and `init()` rebuilds it from the
documents whenever it disagrees, so it can never become the authority on what
exists.

The two contributing measurements are fixed too:

> `MAX_ASSET_BYTES` is 4 MB (`main.ts:2524`) — base64 makes that 5.3 MB, larger
> than the entire quota. The guard meant to prevent this is set above the ceiling
> it protects.

Now 8 MB against a store measured in hundreds, and an attachment is refused
*before* it is read, using `navigator.storage.estimate()` when the browser will
answer. A failed attachment is also rolled back out of the in-memory document,
rather than leaving it referring to bytes that were never stored.

> `takeSnapshot` (`main.ts:1590`) stores **80 full copies of the document** under
> one key, auto-firing every 3 minutes with no size cap.

Capped at 50 snapshots **and** 2 MB per document, oldest evicted first, and never
down to zero. Both ceilings are needed: fifty snapshots of a 200 KB sefer is ten
megabytes, and a byte cap alone would let a one-line document accumulate forever.

### 2. Version history was global, not per document — **fixed**

> `Snapshot` is `{t, body}` (`main.ts:1579`) in a single `ksav.history` key. There
> is no document id in the record, so history can't even be filtered. Open
> document A, restore a snapshot that came from B, and A's text is gone.

Snapshots live under the document, in IndexedDB. The history modal names whose
history it is showing. The old global key cannot be attributed to any document —
there is nothing in the record to attribute it *by* — so it is dropped on
migration rather than offered under a document it may not belong to.

Asserted in `app/test/docs.test.mjs`: A's history contains nothing of B's.

### 3. The desktop build compiled on the UI thread — **fixed**

> `src-tauri/src/lib.rs:7, 91, 97` declare `ksav_compile`, `ksav_spell` and
> `ksav_suggest` as synchronous `#[tauri::command] fn` — Tauri runs those on the
> main thread. The file dialogs at `:39` and `:61` are correctly `async fn`, so the
> distinction was understood; it just wasn't applied to the expensive calls.

All three are `async fn` and hand off to `spawn_blocking`. `async` alone would not
have been enough: an async command runs on the async runtime, and Typst layout
would occupy a runtime worker for the whole 0.4–2.9 s.

> Same problem in `wasm/src/lib.rs:15` — no worker, so the "runs in the browser
> with no server" build blocks the UI thread too.

The wasm engine runs in a Web Worker (`app/src/wasm-worker.ts`) behind a
request/response protocol matching the other two backends, so all three stay
interchangeable.

Two things turned up while doing it. The checked-in wasm package predated
spell-check, so `ksav_spell` was **not in the module at all** and the offline
build had silently had no checker; it is rebuilt. And moving to a worker put the
28 MB module into the *default* build, because `new Worker(new URL(…))` is a
static construct Vite resolves before any dead-code elimination — fixed by
swapping the module through a build alias rather than guarding the call site.
Both build modes are verified.

### 4. No license, anywhere — **fixed**

> No LICENSE or COPYING file, `license = ""` in `src-tauri/Cargo.toml`, no license
> field in the engine or wasm manifests or either `package.json`. […] Separately,
> the six bundled fonts are OFL/GUST; both licences require the notice to accompany
> redistribution, and `release.yml` exists specifically to publish installers.

**MIT OR Apache-2.0**, the Rust ecosystem convention, with the field filled in on
all five manifests. Permissive is also the consistent choice: `spell/hebrew.rs` rejects
Hspell partly *because* it is AGPL, and refusing a copyleft dependency then
shipping one would be strange.

The fonts are covered properly. `THIRD-PARTY-NOTICES.md` names each one with its
copyright and licence, the verbatim texts are in `licenses/`, the files ship as
Tauri bundle resources, and the notice is **rendered inside the app** — the web
build redistributes the fonts inside the wasm module and has no installer to put
a text file beside. The licence facts were read out of the fonts' own `name`
tables, including Cascadia's, whose ID 13 record disagrees with its ID 14 record;
that disagreement is written down rather than papered over.

### 5. Still no git remote — **prepared; needs the repository**

> CI has never run, there is no macOS build, and one machine holds the only copy
> of the work.

This one cannot be finished from here: it needs a GitHub account. Everything
around it is ready.

- `.github/workflows/ci.yml` is new and runs on every push and pull request:
  editor typecheck, tests and build; engine tests and `clippy -D warnings`;
  desktop-shell tests. Clippy had four warnings against the engine's own stated
  standard of zero — fixed, then enforced rather than trusted.
- `.github/workflows/release.yml` already builds Windows, Linux and **both** macOS
  architectures on a tag. It has never run because there has never been a remote.

To finish it:

```sh
# create an empty repo on GitHub first (no README, no licence — they exist here)
git remote add origin git@github.com:<you>/ksav.git
git push -u origin master
git tag v0.1.0 && git push origin v0.1.0   # cuts a draft release with installers
```

The `repository` fields in the manifests currently read
`https://github.com/SYKhayyat/ksav`; change them if the repo lands elsewhere.

---

## Serious, not blocking — all fixed

**The server was strictly serial** (`engine/src/server.rs:73`) — four concurrent
compiles returned in a perfect 469/868/1255/1667 ms staircase. It now serves on a
thread pool sized to `available_parallelism()` (clamped 2–16, because Typst layout
is CPU-bound and an unbounded pool only trades throughput for context switches).
`read_to_string` had no ceiling; bodies are capped at 64 MB, checked both against
the declared `Content-Length` and while reading, since a chunked body declares no
length and a client's claim is not a fact.

**Spell-check was 20× slower for anyone who ever used "add to dictionary"** —
`for_request` cloned the entire 269,385-entry lexicon on every check. There is now
a `Dict` trait with a `Layered` implementation that *borrows* the shared lexicon
and owns only the writer's handful of words. The `OnceLock` above it exists
precisely so the lexicon is built once; copying it per request threw that away.

**4.5 MB response for a 16-page document**, including 292 KB of base64 PDF nothing
on screen consumed. Previews no longer render a PDF; `want_pdf` is set by export
and print only. `Compiled::ok` became an explicit flag rather than `pdf.is_some()`,
which would otherwise have reported every successful preview as a failure.

**No cancellation of superseded compiles.** Every request takes a ticket; only the
newest may touch the screen.

**Inconsistent Typst string escaping.** `font` and `paper` go through the same
escaping as `header`/`footer`, and paper is additionally reduced to
`[a-z0-9-]`. Tested with hostile values in every one of the four fields.

**No numeric validation** in `DocConfig::from_json`. Every numeric field is now
range-checked, and NaN/infinity are refused rather than clamped — a NaN formatted
into the prelude is not a Typst length and fails inside code the writer never
wrote.

**No `beforeunload` guard.** The library copy is flushed on the way out with no
prompt (there is nothing for the writer to decide); the *file* on disk prompts,
because only they know whether they meant to save it. `pagehide` and
`visibilitychange` are covered too, since `beforeunload` is not guaranteed on
mobile.

**`csp: null` and an unvalidated `ksav_write_file`.** A real CSP is set. The
dialogs record what the user picked and writes are checked against that list at
the Rust boundary — `..` traversal included, since the check canonicalises. A
binding from a previous session falls through to Save-As, exactly as a lapsed
browser handle does. Three tests.

---

## Code quality — done

> `main.ts` is the weak spot: **3,143 lines / 120 KB** carrying state, DOM
> construction, menus, exports, review, tables, styles, assets and boot.

The reason everything had to live there was that the editor view, the backend, the
registries and the open document were module-level mutables *inside* it: a panel
that needed the editor had nowhere else to get one. `app/src/runtime.ts` inverts
that — it holds the singletons and imports almost nothing, so anything may import
it. Two hooks (`rerenderChrome`, `openDoc`) are installed by the shell at boot
rather than imported from it, so the dependency is explicit instead of circular.

Split out: `dom.ts`, `settings.ts`, `diagnostics.ts`, `compile.ts`, `save.ts`,
`exports.ts`, `nikud.ts`, `runtime.ts`, `store.ts`. `main.ts` is 2,754 lines and
is now the shell — editor, chrome, panels, boot. Module-level mutables in it: 3.

> Test coverage is **1 test file for 15 modules** […] There is no test at all for
> `docs.ts` — the persistence layer where blocker #1 lives — or for `files.ts`,
> `review.ts`, `styles.ts`, `markdown.ts`.

**317 assertions across 8 files.** The runner builds whatever is listed and runs
whatever `test/*.test.mjs` exists, so adding a test is adding a file — that
friction is how a suite ends up with one file in it. `docs.ts` and `store.ts` are
tested against the blockers directly; `review.ts` has all four accept/reject cases
written down, because getting any one backwards silently corrupts a manuscript;
`styles.ts` asserts that an argument the panel does not recognise survives a
write; `table.ts` asserts that every structural edit leaves the cell count
agreeing with the declared column count; `markdown.ts` asserts nothing exported
still looks like a Ksav command.

Writing them found two real bugs that had nothing to do with the audit:

1. **Spell-check never looked inside a table cell or a list item.** Inside `(…)`
   Typst is in code context, so nested calls are written bare — `תא[רש"י]`,
   `פריט[א]` — with no `#`; the command scanner matches on `#` and never saw them,
   so blanking a command head from `#` to the closing paren blanked every cell and
   every item with it. The bulleted list in Ksav's own starter document was going
   unchecked. Twelve regression tests.
2. **Documents created in the same millisecond sorted oldest-first**, so "New
   document" could appear below the document it was made from.

> One design mistake worth naming on its own: **auto-save is implemented as a side
> effect of compiling.**

That coupling is gone; see blocker #1.

---

## Non-intuitiveness — done

> **The toolbar is 42 icon-only buttons with zero `aria-label`.** […] A screen
> reader announces "†, button", "⁑, button", "▤, button". Page-wide: 0
> `[aria-label]`, 1 `[role]`, no `nav` landmarks.

`iconBtn` requires a name and sets `aria-label` from it; the glyph is
`aria-hidden`, so a reader says "Footnote" rather than "dagger, Footnote".
Landmarks: banner, a `nav` for the menu bar, labelled panes and drawers, a
`role="separator"` splitter, and a polite live region on the status bar — which is
also where a save failure is announced. Menus report `aria-expanded`. Focus rings
are visible everywhere.

> The glyph vocabulary (⁑ ⇥ ⇤ ▣ § א. ‡ ▤ ⋯ ◫ ◧ ⊟ ⊞ ＃) has no labels and no
> grouping — the opposite of the labeled ribbon groups in the product it's
> replacing.

Seven labelled groups with visible captions — text style, headings, lists, notes,
alignment, Torah, tools. Captions collapse on a phone, where the strip already
scrolls; the accessible names stay, because they live on the group.

> **The editor opens in raw markup, not prose mode.**

Prose is the default. Alt reveals the markup and the `＃` chip switches
permanently — one key away, which is the right distance for the people who want
it.

> Unmapped compiler errors leak raw internals — `paper: "nonsense"` surfaces a
> 40-item list of Typst paper names.

Paper and font errors are mapped to plain bilingual guidance; anything still
unmapped is truncated to 160 characters with the full text kept on hover, because
an unhelpful message beats a swallowed one but should not fill the status bar.

---

## Missing

**Auto-save to file — done.** The bound file is written back on a 30-second timer,
but only to a binding that can be written back to and whose permission is already
granted: prompting for filesystem access out of a background timer would be its
own bug. Switchable in Settings.

**The user dictionary — done, as far as it honestly can be.** It lives in one
browser profile, so it is invisible to the desktop app and gone if that profile is
cleared. Sync would need an account system and inventing one for a word list would
be absurd; instead it exports and imports as a plain commented word list, in the
same shape `Lexicon::add_words` reads. Import **merges** rather than replaces,
because someone loading their dictionary onto a second machine wants both halves.

**macOS installer and code signing — still money, not engineering.** The CI matrix
builds both macOS architectures already. Signing needs an Apple Developer
certificate ($99/yr) and a Windows OV certificate (~$200–400/yr); `release.yml`
documents exactly which secrets to add, and they become signed builds with no
other change.

**No cloud sync, collaboration, or mobile.** Unchanged, and deliberately out of
scope — each is a product, not a fix.

**Nobody has written a real document in it yet.** Still true, and still the most
important line in this document. Nothing above substitutes for it.

---

## English, left-to-right — mostly yes; three things were wrong

Asked directly: does Ksav work for an English left-to-right document, given it is
Hebrew-first? Most of it did. `dir: "ltr"` has always been a real setting, every
command has a collision-free English alias, the interface itself is bilingual and
flips its chrome, and the bundled Hebrew faces carry Latin — an English page
compiles and sets cleanly, left-aligned, in 19 ms.

But the direction was the *only* thing that followed the writer's choice. The
prelude pinned `lang: "he"` on every document ever compiled, and Typst drives
three separate things off `lang`. So an English document came out with:

- **the wrong quotation marks** — `"hello"` set as `”hello”`, the *closing* mark
  on both sides. That is correct Hebrew convention and simply wrong in English;
- **no hyphenation at all**, while still justified by default. Hyphenation is
  pattern-based per language and there are no Hebrew patterns, so English text
  filled the line the only way left to it — by stretching the spaces;
- **a Hebrew heading over its table of contents** — `תוכן העניינים` above a list
  of English chapter titles.

Every one of those documents compiled without a single diagnostic, which is why
none of it had been noticed. They are held now by `engine/tests/ltr.rs`, which
reads the laid-out page rather than the exit code.

`DocConfig` gained a `lang`, and an empty one means *follow the direction* — `ltr`
is English, `rtl` is Hebrew. That is the whole fix at the call site: nobody has to
find a setting. An explicit tag still wins, because direction and language are not
the same choice — Yiddish and Arabic are right-to-left and are not Hebrew.

The tag is sanitised like `paper` and `font`, and then checked for *shape* as
well, which the others do not need. Typst refuses a tag that is not two or three
letters, and refuses it by failing the entire compile — so a bad value would blank
someone's document with an error about code they never wrote. It is dropped at the
boundary instead, the same rule the numeric fields already follow.

`#תוכן()` now takes its heading from the document's language, and an explicit
`כותרת:` still overrides it.

One thing that was already right is worth naming, because it is what made the
engine's version findable: the Word export had been setting `lang="he"` or
`lang="en"` from the direction since it was written.

### English spell-check — **done**

The original entry read:

> **English spell-check is absent, deliberately for now.** The checker skips any
> word containing a Latin letter, so English is never wrong — it is simply never
> checked. […] Stated in full, because it is the uncomfortable half: until then
> an English document is unchecked, **and nothing in the interface says so**. The
> spell-check toggle reads as on, and an English page with three typos in it
> comes back clean.

There are now two lexicons and two checkers, and the interface names both.

**Dispatch is per word, not per document.** `spell::words` tags every token with
the script it is written in and `Checker` sends it to that language's lexicon. A
document-level setting would have been simpler and wrong: Ksav's documents are
routinely bilingual — an English sefer quoting a Gemara, a Hebrew ma'amar citing
an English source — and choosing one language per document leaves the other half
unchecked in exactly the writing this product exists for. It also means nobody
has to tell it anything. A language with no lexicon loaded is `None` rather than
an empty dictionary, because "we do not check this script" and "every word in
this script is wrong" must not be the same state.

**The word list is the mirror image of the Hebrew one.** For Hebrew there is one
open dictionary and it does not know Torah Hebrew, so Ksav builds its own. For
English there is an excellent open word list — Kevin Atkinson's English Speller
Database, the data behind SCOWL, `wamerican` and Aspell — and the one thing it
lacks is the vocabulary these writers use in every paragraph. *"The Rambam
paskens that one may not daven Mincha after shkiah"* is nine words, five of which
a general English dictionary rejects; underline those five and you have
reproduced Hspell's failure from the other end. So `lexicon-en.txt` is ESDB
(size 60, US + British + Canadian + Australian spellings) plus the Public Domain
Judaic English on Sefaria for the biblical proper nouns — that corpus took the
JPS 1917 Torah from 3.1% missed words to 0.6% — and
`lexicon-en-supplement.txt` is a thousand hand-written entries of contemporary
transliteration, which no public-domain corpus can supply because the writing
that uses it is all in copyright. That paragraph above now measures 0%.

**Four rules of morphology, each earned:**

- *Case, asymmetrically.* A lowercase entry accepts every capitalisation of
  itself; a capitalised one accepts only itself and its all-caps form. So
  `Abimelech` passes and `abimelech` does not. The hand supplement is therefore
  written entirely in lowercase — transliterated words have no settled
  capitalisation ("the Gemara", "learning gemara"), and insisting on one would
  underline a correct spelling over a style choice.
- *Possessives.* ESDB lists `X's` only for words it holds, so every proper noun
  the corpus and supplement contribute would be a miss the moment someone wrote
  *about* it. Stripping it in code also let the builder drop 19,000 derivable
  entries from the shipped file.
- *The transliterated prefix.* `l'halacha`, `b'gemara`, `d'oraisa` — Hebrew glues
  its prepositions onto the front of a word and English Torah writing carries
  that over with an apostrophe. Open-ended, so it is a rule and not a list, with
  the same three-letter stem bound the Hebrew side uses.
- *The curly apostrophe.* Every word processor produces U+2019 and every word
  list uses ASCII. Without folding it, every contraction and possessive in a
  pasted paragraph is a miss.

**Two things turned up while doing it.** Suggestions used plain Levenshtein, in
which `teh` is *two* edits from `the` — so the commonest typo in English could
never be offered. Adjacent transposition is now one edit, which helps Hebrew too.
And ranking one edit's worth of candidates alphabetically put every capitalised
entry first, because that is what byte order does: `teh` came back as
`ETH, NEH, Te, Ted, Tet, Tex, Th` with the list cut off before `the`.
Transpositions now rank first — every letter the writer intended is present, in
the right multiset, which is stronger evidence of intent than a substitution.

The standing risk here is the opposite of Hebrew's. Hebrew's danger is
under-acceptance; English's is over-acceptance, since a 96,000-entry list, a hand
supplement and two morphological rules give a typo a lot of places to hide. So
`ordinary_typos_are_still_caught` is as load-bearing as anything else in
`engine/tests/spell_en.rs`, and the supplement has a test that fails on any entry
the generated lexicon already accepts, so it cannot quietly fill up with words
carrying no weight.

ESDB's licence is permissive but explicitly covers word lists derived from it and
requires its notice in all copies. The notice is carried three ways — the full
text in `licenses/ESDB.txt`, a copy in the header of the generated lexicon where
no build step can separate it from the data, and rendered in the app beside the
font notices — and a test fails if the header copy goes missing.

### The first screen — **done**

The original entry read:

> **The starter document and all eight templates are Hebrew.** An English
> writer's first screen is Hebrew text they must delete. […] the honest fix is
> an English starter chosen from the interface language, not a translation of the
> Torah templates, which are Hebrew *because of what they are*.

There are two starters and two more templates, and no translations.

The starter follows the interface language, and — this is the part that decides
whether the English one is ever seen — it **keeps following it**. The interface
opens in Hebrew, because Ksav is Hebrew-first and that is the right default, so
an English writer's actual first move is to switch the language. Choosing a
starter once at boot has already chosen Hebrew by then. Switching the language
now brings the welcome text with it, guarded by exact equality with one of the
two starters: the moment a writer has typed a single character it is their
document and nothing may touch it.

The general templates — a letter, an article — exist in English as documents of
their own. The letter is a letter to a rosh yeshiva; the article is a piece of
Torah writing in English with footnotes, a table of shitos and a source line,
because that is what someone writing English in Ksav is actually writing. The
six Torah templates are untouched: a siddur, a bentcher, a kesubah and a get are
Hebrew because of what they are, and an English kesubah is not a document anyone
wants.

A template now carries its `lang`, which does two things. The templates menu
lists the interface language's own first — not filtered, because a Hebrew speaker
writing an English letter and an English speaker who wants the siddur both exist.
And loading one switches the document's direction, through `setSetting` so the
editor's own text direction moves with it: an English letter dropped into a
right-to-left document sets flush right with its date on the wrong side, which is
nobody's letter, and is confusing enough that a writer would reasonably conclude
English is not supported.

### English parameter names — **done**, and it was not in the plan

Writing those templates found the hole. "Every command has a collision-free
English alias" was only half of what it sounded like: the *parameters* were still
Hebrew, so an English table read `#mktable(עמודות: 3, פסים: true)`. That is not
English and it is not something anyone would type, and a template written half in
one language and half in the other would have been exactly the "good enough for
now" this document opens by refusing.

So an English alias is no longer a plain binding but a wrapper that renames its
named arguments through one table of 60-odd words in the prelude. It still
accepts the Hebrew names, because the point is to accept both rather than to swap
one exclusion for another — somebody converting a document command by command
must not hit a cliff halfway through. Two Hebrew parameters share one English
word (טורים and עמודות are both "columns"), and rather than invent a second
English word for one of them, the three functions that need the other reading say
so at their own alias.

`engine/tests/english_commands.rs` renders every one of these: a wrapper that
silently dropped every named argument would compile perfectly and lay out the
default document. It also checks that every English name in the command registry
is a name the prelude actually defines — the registry is what the palette, the
toolbar and the completions are built from, so a name in it the compiler does not
know is a command the interface offers and then refuses.

### What the toggle says

The plan's cheapest item was to mark the spell-check toggle "Hebrew only", since
it read as a clean bill of health on text it had never looked at. That label
would have been obsolete the same day, so what went in instead is the honest
version of the same idea: the settings panel names the languages being checked
and the size of each lexicon, and says in as many words that text in any other
language is *left alone, not confirmed correct*.

It reads those numbers from what the engine returned on the last check rather
than from a string in the interface. Those two have come apart here before — a
checked-in wasm module that predated spell-check shipped with no checker in it at
all and nothing said so — and if a lexicon ever fails to load, the panel says
which one rather than repeating the claim.

### What running it found

Two things that no test would have caught, because no test was looking at the
first screen.

**The Hebrew starter document had three squiggles on it, and always had.**
`פונקציית`, `קינון`, `מתרנדר` — the templates have had a
"must not be underlined" check since they were written, but the two starters live
in the editor rather than in the template registry and nothing checked them. The
cause is a real gap rather than three missing words: the lexicon is built from
Torah texts and from Project Ben-Yehuda, which is pre-war literature, so it
contains no technical vocabulary at all. The supplement now carries the everyday
part of it and says in its own comment that the gap is wider than the entries
listed. `מתרנדר` was reworded away, because it was jargon and `מוצג` is better
Hebrew.

**`Ctrl` is not a word in any English dictionary**, and the English starter names
it twice. Now in the supplement with the rest of the keyboard.

Both are held by `neither_starter_document_opens_covered_in_squiggles`, which
reads the two literals out of `main.ts`. Reaching into the editor's source from an
engine test is not elegant; it is the only way to hold text that has to exist
before the engine has loaded, and it fails loudly rather than silently if the
literals move.

### Two editors that wrote Hebrew into an English document

Making the parameters bilingual in the prelude was only the compiler's half. Two
panels *generate* those calls, and both wrote Hebrew unconditionally.

**The table toolbar** rebuilds the whole call from its cell list on every
structural edit, and rebuilt it as `#name(עמודות: N, …cells)` — so adding a row
to an English table put a Hebrew argument name in it, and, worse and older,
**dropped every other named argument**. Both article templates are striped, so
the first table most people would ever have edited would have come back
un-striped with no indication why. The column count now keeps the name it was
written with and every other setting is preserved verbatim, which needed a
depth-aware argument splitter: a cell body is full of commas, and at depth 0 a
`"` opens a Typst string while inside a `[…]` body it is the ordinary character
Hebrew writes gershayim with.

**The styles panel** canonicalised to the Hebrew command on every write, so
clicking one control turned `#headings_config(numbering: "1.1")` into
`#הגדרות_כותרות(מספור: "1.1")`. Still correct Typst — both are accepted — and
still the writer's English document turning Hebrew underneath them. It now reads
argument names into its own vocabulary and writes them back in the language the
call was already in; a call that does not exist yet follows the document's
direction. Twelve keys, a documented subset of the prelude's table, and every key
the panel does not recognise still survives untouched, which was already the
module's stated promise.

---

## What I'd do next

Everything on the original list is done. What is left is the item that was always
the important one:

> Then hand it to five bochurim for a zman. Everything after that should be driven
> by what they hit.

Push to a remote, cut `v0.1.0`, and let CI produce the installers. Then hand it
over. The boring reliability layer is in place; what it is missing now is contact
with someone's actual sefer.

Two things are worth naming as *known*, rather than left to be discovered:

- **The English lexicon has no frequency data.** Suggestions are ranked by edit
  type and case, which is enough to put `the` above `tea` for `teh`, but a word
  list carrying counts would rank better still. It is a bigger asset and a
  measurable gain; it is not obviously worth it until someone complains.
- **Page setup is app-wide, not per document.** Direction, font, margins and
  paper live in settings, so opening an English document and then a Hebrew one
  means changing the direction by hand. Loading a template now does that for you,
  which papers over the seam rather than removing it. Making page setup a
  property of the document is the real fix and a larger change than anything in
  this file.

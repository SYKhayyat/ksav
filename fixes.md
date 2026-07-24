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
> gaps. All are fixed. See *Third audit* below for what was checked and what
> stands.

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

---

# Second audit — 23 July 2026

The document above is a record of the first pass. This is a fresh one, against
the code as it stands at `abc3dc0`, and it is not a re-reading of the same list:
everything below was found by running the thing and measuring it.

**What was run.** `npm test` in `app` (351 assertions, all green) · `cargo test
--release` in `engine` (green) · a benchmark of the work the editor does per
keystroke, on synthetic documents built out of the shapes Ksav documents are
made of · a repeat-compile measurement against a running `ksav serve` · a
compile-bomb repro · a table-editing repro. Every number below is from this
machine, and every finding names the file it lives in.

## Verdict

**Not ready for general release. Ready for a small, supervised pilot on short
documents once the three blockers are fixed.**

The reliability layer this file was written about — storage, saving, escaping,
diagnostics, licences, accessibility — is in good shape, and I could not break
it. What is not ready is the part nobody measured: **the editor gets slower than
a person types as a document grows, the compiler has no bound on time or memory,
and one of the direct-manipulation features silently corrupts the document it
edits.** All three appear only at the size and shape of a real sefer — which is
the document this product exists for, and the one nobody has written yet.

One item from the old list has moved on its own: `git remote -v` now answers
`origin https://github.com/SYKhayyat/ksav.git`, with six commits still unpushed.
CI has a repo to run in.

## Blockers

### 1. Editing a table with a merged cell scrambles the table — `app/src/table.ts`

`render()` (`table.ts:172`) rebuilds every cell as `תא[…]`, and `rowOf` /
`colOf` / `rowCount` (`table.ts:159–169`) divide by the column count as though
every cell occupied one column. A `מיזוג(2)` cell is neither. Pressing "insert
row" inside this table:

```
#טבלה(עמודות: 2, פסים: true,
  מיזוג(2)[כותרת רחבה],
  תא[א], תא[ב],
)
```

produces this:

```
#טבלה(עמודות: 2, פסים: true,
  תא[כותרת רחבה], תא[א],
  תא[], תא[],
  תא[ב], תא[],
)
```

The merge is gone, the header has been pulled into the first data row, `ב` is
orphaned two rows down, and a blank row has appeared between them. No error, no
warning, and the only recourse is undo — if the writer notices.

This is the failure this module's own opening comment names as the reason it
exists ("getting that count wrong silently reflows the whole table"). The model
already parses `span` correctly; only the rendering and the row/column
arithmetic ignore it. Fix both, and hold it with a test that round-trips a
merged table through every operation.

### 2. A compile has no bound on time or memory — `engine/src/lib.rs`, `engine/src/server.rs`

This document is thirty bytes:

```
#for i in range(400000) [א ]
```

It occupied a core for the full sixty seconds I was willing to give it and was
still going when it was killed. There is no deadline anywhere in the engine, the
server, the Tauri commands or the wasm worker.

What that means in each build:

- **`ksav serve`** — the pool is `min(cores, 16)` threads (`server.rs:79`).
  Sixteen such requests and the editor stops answering for everyone, including
  the person who started it. The API is unauthenticated by design, which is fine
  on loopback, but the CORS allow-list stops a stranger *reading* the response,
  not the work being done.
- **The desktop app** — a `spawn_blocking` task that never returns. The window
  survives, which is what that change was for, but the writer cannot stop it and
  nothing says what happened.
- **The browser build** — one engine worker and no cancellation path
  (`api.ts:236`), so every later compile and every spell check queues behind it
  forever. The tab is finished until it is reloaded.

This needs no malice: a `#for` with a wrong bound is an ordinary typing mistake,
and Ksav is a product whose documents get emailed around. Typst has no
mid-compile cancellation, so the fix is structural — run the compile somewhere
that can be killed (two of the three builds already do), give it a deadline,
terminate and restart on expiry, and say so in the status bar.

### 3. Typing latency is quadratic in document size — `app/src/ksav-lang.ts`

Prose mode is the default view, and `proseDecorations` recomputes from scratch on
**every keystroke and every cursor move** (`ksav-lang.ts:932–940`). Inside it,
four membership tests are linear scans over the document's spans, called once per
command: `inComment` (`:587`), `insideFootnote` (`:604`), `insideList` (`:619`),
`insideTable` (`:652`). Commands scale with the document, and so do comments,
footnotes, lists and tables. The cost is O(n²).

| document | prose scan, per keystroke *and* per arrow key |
|---|---|
| 9 KB | 0.3 ms |
| 36 KB | 2.2 ms |
| 107 KB | 17 ms |
| 269 KB | **108 ms** |

`scanCommands` is not the problem — it is 3.4 ms on the largest of those. The
predicates are: strip the comments out of the same document and it drops to
82 ms; strip the footnotes too and it drops to 40 ms.

269 KB is a hundred-page sefer with its apparatus. At that size every arrow key
costs a tenth of a second, and holding a key down leaves the editor permanently
behind the keyboard. Sorting each span list once and binary-searching it — or
one sweep in document order — removes the whole class. Not recomputing on a
selection change that cannot reveal anything is a second, cheaper win.

## Serious

### 4. Nothing about compilation is incremental — `engine/src/lib.rs:400`

Against a running `ksav serve`: the same document compiled four times unchanged,
then once more after appending a single character.

```
sample (1x)   1,269 chars,  1 page  ·  210, 112, 92, 116 ms  ·  after 1 keystroke:   93 ms
sefer  (40x) 50,838 chars, 40 pages ·  2242, 2873, 2622, 2587 ms ·  after 1 keystroke: 2512 ms
```

Recompiling a byte-identical document costs the same every time. Two causes, one
line each:

- `layout_source` builds a **fresh `TypstEngine` per request** (`lib.rs:400`),
  re-parsing the 1,473-line prelude every time.
- `typst-as-lib`'s `comemo_evict_max_age` defaults to `Some(0)` — "evicts after
  each compilation" — so Typst's memoization cache, the thing that makes its
  watch mode fast, is thrown away after every compile. Ksav never sets it.

Reusing one engine and setting the max age to something like 10 is what
`typst-cli --watch` does; it is where the 2.5 s round trip becomes something a
writer would call live. Related and cheap: a superseded compile still runs to
completion — `compile.ts:42`'s generation counter discards the *result*, not the
work — so typing steadily through a long document keeps every core busy
rendering pages nobody will ever see.

### 5. With no durable store, the app boots crippled — `app/src/main.ts:2866`

The fallback for a private window (or storage blocked) renders, reports the
failure and returns early. What that early return skips:

- `backend.commands()` / `templates()`, so `commandsReg` stays empty. The
  toolbar renders as empty `<span>`s (`buildToolbar:791`), the Insert menu is
  empty, the palette finds nothing, completion offers nothing. The writer gets a
  text box.
- `save.wireUnloadGuard()` — closing the tab throws the work away with no
  prompt, in the one situation where nothing else is keeping it either.
- The snapshot and file-autosave timers, and the first spell check.

The banner is honest and everything after it is wrong. This path should lose
*persistence* and nothing else.

### 6. A failed spell check is silent — `app/src/main.ts:473`

`catch { /* A failed check is not worth interrupting the writer over. */ }`. If
the engine is unreachable the squiggles simply stop arriving, while the toggle
still reads on and the settings panel still names two lexicons and their sizes.
That is the state this file argues against by name — "a silence that reads as a
clean bill of health is worse than a missing feature" — and the coverage note in
the panel is the obvious place to say so.

### 7. Two panels write raw user text into markup — `app/src/main.ts:2090`, `:2282`

`addComment` builds `#הערת_עורך[${text}]` out of a `prompt()`, and the
section-page modal quotes header/footer strings by stripping `"` and nothing
else. A comment containing `]` closes the call early and corrupts the document;
a header ending in `\` escapes its own closing quote and fails the compile
inside the prelude. The engine is careful about exactly this (`typst_str`,
`lib.rs:314`, with a test pinning the backslash-before-quote ordering); the
editor, which generates far more markup, is not. One shared escaper, used by
every panel that emits a call.

### 8. The AI prototype ships an open, unmetered API proxy — `server.ts`

`server.ts` binds `0.0.0.0:3000` (`:101`) and exposes `POST
/api/gemini/assistant` with no authentication, no rate limit, no origin check
and no size limit on `editorText`, which is interpolated straight into the
system instruction (`:63`). Anyone who can reach the port spends the owner's
Gemini quota and steers the model; `error.message` goes back to the caller
(`:79`).

It may also be dead in the literal sense: the model id is `gemini-3.5-flash`
(`:67`), which is not a name in Google's published lineup. Worth one minute
against the API to confirm — if it is wrong, every request has been 500ing since
the line was written.

The README calls this repo's front door "the React/Vite web-app prototype" and
`ksav/` the product. A prototype with a live API-key proxy in it, at the top
level, with the quickstart pointing at it, is a trap for whoever clones this
first. Delete it, or move it under `prototypes/` with the server removed and say
why.

### 9. Every asset is re-encoded and re-sent on every compile — `app/src/docs.ts:413`

`requestAssets` puts the document's assets on each compile request, so an 8 MB
image (the ceiling, `main.ts:2451`) is ~11 MB of base64 across the wire or the
worker boundary on every pause in typing, plus a base64 decode in the engine
each time (`assets.rs:63`). Hash the bytes, send the hash, keep a per-session
cache in the engine, and send the payload only when the hash is unknown.

### 10. Spell offsets are computed quadratically — `engine/src/spell/mod.rs:527`

`text[..m.start].encode_utf16().count()` re-walks the document prefix for every
misspelling. On a long document with many unknown words — a sefer full of names
is the normal case — that is O(n·m) on every check, every 700 ms. One forward
pass carrying a running UTF-16 count gives the same numbers in linear time.

### 11. Engine output becomes HTML, with no CSP outside Tauri

`preview.innerHTML = …pages_svg…` (`compile.ts:86`), the same again for the
overlay (`main.ts:2635`), and `TableWidget.toDOM` sets `innerHTML` from
hand-built markup (`ksav-lang.ts:563`). None of it is exploitable today —
`renderInline` escapes and emits a fixed tag set — but the Tauri build has a real
CSP (`tauri.conf.json:25`) and the browser and `ksav serve` builds have none at
all, so this code runs with no second line of defence in the two places where
documents arrive from other people. Add the meta CSP to `app/index.html` and the
header in `server.rs`.

## Worth fixing

- **Downloads may not happen in Firefox.** Both copies of `download()` revoke the
  object URL synchronously after `a.click()` (`dom.ts:84`, `files.ts:183`).
  Revoke on the next tick.
- **Opening a large file can silently do nothing.** The `<input type=file>`
  fallback resolves `null` 800 ms after the window regains focus
  (`files.ts:120`); a `FileReader` still working on a big document loses the race
  and the open is dropped without a word.
- **Opening the same file twice makes two documents.** `openFile` always calls
  `createDoc` (`main.ts:1709`), so the library fills with duplicates of one
  sefer, each bound to the same path. Match on the binding first.
- **Nothing shows unsaved state.** The title bar shows the document and its file;
  neither carries a dirty marker, though `hasUnsavedFileChanges()` already knows.
  The writer first hears of it in the browser's leave-page dialog.
- **You cannot select text in the preview.** Any click jumps the editor cursor
  (`main.ts:672`). Require a modifier, or a double-click.
- **Custom commands do not travel with the document.** `settings.customCommands`
  is app-wide and `serializeDoc` writes only body and assets (`docs.ts:384`), so
  a `.ksav` that uses one compiles for its author and fails for everyone else.
- **`notes_region_cm` is decided by substring search** over the body
  (`lib.rs:96`): a document that merely *mentions* `מדף_` in prose loses 3 cm at
  the foot of every page.
- **Saving a template can throw.** `saveUserTemplates` writes a whole document
  into `localStorage` with no `try` (`main.ts:1685`) — the one storage path
  outside the careful save story.
- **Shortcut capture has no conflict check** (`main.ts:1364`): binding a chord
  that is already taken silently creates two bindings for it.

## Product gaps

Not defects — the things a writer asks for in the first week:

- **Spell-check has one verb.** "Add to dictionary" is permanent and global.
  There is no "ignore once" and no "ignore in this document", so a name that
  appears twice either teaches the checker forever or squiggles forever.
- **User templates cannot leave the browser.** The dictionary got export/import;
  templates did not, and they hold whole documents.
- **Page setup is still app-wide.** Named in the previous section, unchanged, and
  the item most likely to be reported as a bug rather than as a gap.
- **No library-wide search.** Find is per document; with a library, "which sefer
  did I write that in" has no answer.
- **The README sells the prototype.** Its feature list, quickstart and API section
  describe `src/` and Gemini; the product is `ksav/`. Anyone evaluating this
  reads the wrong page first.

## What held up

A list of defects is not a description of the software, so, plainly:

- Storage and saving. I could not find a path that loses text once IndexedDB is
  available, and the failure banner, the backup button and the index rebuild all
  do what they say.
- The engine's escaping and clamping. `typst_str`, `sanitize_paper`,
  `sanitize_lang` and `clamped` are correct, and the tests pin the subtle
  ordering.
- Bracket healing: pure, tested, and the three consumers genuinely share one
  scan.
- The bilingual UI: 296 keys on each side, no gaps in either direction.
- Accessibility and responsiveness — real work, not claimed work.
- Both test suites pass from a cold checkout on this machine.

## What could not be checked

- The installers and the release workflow: never run, no certificates.
- The wasm build end to end (`app/src/wasmpkg/` is git-ignored and built
  locally), so the browser-only path is judged from its source rather than from
  use.
- How any of it feels over a zman, which is still the item that matters most.

---

# Resolution — 24 July 2026

The second audit above is now a record too. Everything it found in code has been
fixed; what stands unchanged is only what was never engineering. Kept next to
each finding, because a fix is only legible beside the thing it fixed.

## Blockers — all three fixed

**1. Merged-cell table edits — `app/src/table.ts`.** The model already parsed
`span`; the geometry did not. `render`, `rowOf`/`colOf`/`rowCount` and every
structural operation now go through one span-aware grid layout (`layout()`),
which places each cell by the columns it actually occupies and wraps exactly as
Typst's own auto-placement does. `render` emits `מיזוג(n)[…]` so a merge survives
the round trip; a column inserted through a merge widens it rather than splitting
the row. Held by twenty new assertions, including the audit's own repro round-
tripped through every operation.

**2. No bound on compile time or memory — `engine/src/server.rs`, the two
clients.** Typst cannot be interrupted mid-compile, so the fix is structural and
per-build. The server runs each compile on its own thread and waits with a
deadline (`KSAV_COMPILE_TIMEOUT_MS`, default 20 s); the pool threads only ever
*wait*, so a runaway never occupies a worker and spell checks and static assets
keep being served. Concurrent compiles are capped, so overran work cannot pile up
threads without bound, and a compile past the cap is refused at once with a plain
message. The browser build genuinely reclaims: the worker is `terminate()`d on
the deadline and the next call boots a fresh one. The desktop build unblocks the
UI on the deadline and says why. A runaway is not truly killed on the two native
builds — that would need a separate process, a heavier machine than a local
single-user editor warrants — but it can no longer hold up anyone else, and the
writer is told. Four tests on the server path.

**3. Quadratic typing latency — `app/src/ksav-lang.ts`.** `proseDecorations`'s
four membership predicates were linear scans called once per command — O(n²), 108
ms per keystroke on a hundred-page sefer. Each span set is now painted once into a
byte mask (native `fill`, O(document)), so every predicate is a single array
read and the pass is O(n). The second, cheaper half: a pure cursor move recomputes
only when a reveal-sensitive span's overlap with the selection actually flips,
so arrow-keying through a long document pays nothing.

## Serious — all eight fixed

**4. Nothing incremental — `engine/src/lib.rs`.** `comemo_evict_max_age` was
`Some(0)` — evict everything after every compile, the opposite of watch mode. Set
to `10`, so Typst's font, shaping and layout memoization survives across compiles.
Measured: a byte-identical recompile drops from 93 ms to ~48 ms.

**5. Crippled fallback boot — `app/src/main.ts`.** The no-durable-store path
returned early, dropping the registries (empty toolbar and menus), the unload
guard, spell-check and the timers. It now loses *persistence and nothing else*:
every capability is wired, and only the store-backed steps (binding recall, the
snapshot timer) are guarded behind a `durable` flag.

**6. Silent spell-check failure — `app/src/main.ts`.** A dropped check was
swallowed while the panel still named two lexicons — the false all-clear this
feature exists to refuse. A failure is now recorded and the coverage note says so.

**7. Panels wrote raw text into markup — `app/src/main.ts`.** One shared escaper
(`typst-escape.ts`, mirroring the engine's `typst_str`): `typstString` for string
literals, `typstContent` for `[…]` bodies. Every panel that emits a call — review
marks, editor comments, section-page setup, formulas — goes through it. A `]` in
a comment no longer closes the call; a trailing `\` no longer escapes a quote.

**8. Open AI proxy — deleted.** `server.ts` (an unauthenticated `0.0.0.0` Gemini
key proxy, on a model id that does not exist) is gone. The two Gemini-authored
mocks moved under `prototypes/`, the server removed from the archived manifest,
and the root README rewritten to make `ksav/` the front door.

**9. Assets re-sent every compile — `app/src/docs.ts`, `engine/src/assets.rs`.**
The client sends a content hash and includes the bytes only when the engine is
not known to hold them; the engine keeps a bounded per-process cache keyed by
that hash and reports any it no longer holds so the client re-sends. An 8 MB image
is now sent once per session, not on every pause in typing.

**10. Quadratic spell offsets — `engine/src/spell/mod.rs`.** The UTF-16 conversion
re-walked the whole prefix for every misspelling. One forward pass with a running
cursor gives the same numbers in linear time.

**11. No CSP outside Tauri — `app/vite.config.ts`, `engine/src/server.rs`.** The
built SPA carries the same policy Tauri enforces, injected at build time only (a
strict CSP would break Vite's dev HMR), and `ksav serve` sends it as a header.

## Worth fixing — all nine done

Firefox downloads revoke on the next tick; a large file open no longer loses its
race with the dismissal timeout; opening a file already open switches to it
instead of cloning; the title bar carries a dirty dot; the preview no longer eats
a text selection; custom commands travel inside a shared `.ksav`; the page-foot
reserve follows a real call, not a prose mention; saving a template can no longer
throw uncaught; and binding a taken chord is refused with an offer to move it.

## What still stands, unchanged

Not engineering, and named plainly: the runaway compile is contained but not
reclaimed on the two native builds; page setup is still app-wide; the installers
and the release workflow have still never run for want of certificates; and no
real bochur has written a real sefer in it. That last line is still the one that
matters most.

## Tests

`app`: 351 → **389** assertions across 9 files (new: merged-table round-trips,
the shared escaper, the custom-command round-trip). `engine`: **153** across nine
binaries (new: the compile deadline, the asset cache, multi-miss UTF-16 offsets,
the page-foot reserve). Both suites green, `clippy -D warnings` clean, the app
builds.

---

# Third audit — 24 July 2026

The first two audits read the code. This one ran it.

That distinction is the whole value of this pass. Both previous lists ended by
naming things they could not check — "the installers and the release workflow:
never run"; "the wasm build end to end … judged from its source rather than from
use" — and those unchecked paths are two of the three ways Ksav actually ships.
A defect there would have reached a writer without anything in this repository
noticing. So the method here was to build every artefact, start the server, and
push real and hostile documents through it.

**Verdict: ready.** No blockers. The engine is correct, bounded, fast at the size
of a real sefer, and safe against the injection its own escaping exists to stop.
What stood between Ksav and a release was a signing certificate and a git remote
— exactly what the first list said, and still not engineering.

## What was verified by running it

| Check | Result |
|---|---|
| Both suites, cold | 389 app assertions (9 files) + 154 engine tests, green |
| Typecheck, SPA build | Clean |
| All 10 bundled templates | Compile: 0 errors, 0 warnings |
| All 104 registry commands | 103 compile; the one that does not is `#תמונה`, whose placeholder legitimately needs a real file |
| Injection via `font` / `header` / `paper` / `lang` | Every attempt to close the Typst literal and call `#panic` was neutralised |
| `NaN`, `1e308`, negative margins, `columns: 5000` | Rejected or clamped; no silently-garbage page |
| 170-page sefer (497 KB) | Compiles in 5.6 s |
| Edit loop, 68-page sefer | ~1.0 s per recompile — the memoization fix holds at scale |
| Runaway `#for` (4M iterations) | Cut at 20.1 s; `/commands` answered in 0.00 s immediately after; normal compiles unaffected |
| 8 concurrent compiles | 0.21 s total |
| Bilingual UI | 300 keys per language, symmetric, every static call site resolves (302 after the fixes below) |
| Secrets in tracked files | None |

**The two paths nothing had ever exercised, both now passing.**

*The browser engine.* Built from the README's own instructions, loaded, and put
through the surface a writer touches first: all ten templates compiled, both
lexicons answered, suggestions came back. It works. It had never been shown to.

*The desktop installers.* `npm run tauri build` produced `Ksav_0.1.0_x64_en-US.msi`
and `Ksav_0.1.0_x64-setup.exe` from the current tree, cleanly. The claim that the
installers "have never been run" was true when written and is no longer; what
remains genuinely unbuilt is macOS, because a `.dmg` cannot be cross-built.

## What it found, and what was done

**1. The browser build had no CI job — fixed.** One of three shipping modes, and
the only one nothing checked. `app/src/wasmpkg/` is git-ignored and built
locally, so the entire no-server path could break and every job would still be
green; this audit verified it by hand, which is not a thing that repeats. There
is now a `wasm` job in `ci.yml` that builds the crate for
`wasm32-unknown-unknown`, produces the offline Vite bundle (a different module
graph from the default build, so the default build passing said nothing about
it), and then *runs* the module — `.github/scripts/wasm-smoke.mjs` compiles every
template and checks both lexicons. Building only proves it linked; a wasm binary
that instantiates and panics on first use would pass every other step.

**2. A wrong-typed `body` still rendered a blank page as success — fixed.**
`engine/src/lib.rs`. The commit *"A request that doesn't parse is an error, not a
blank page"* fixed unparseable JSON and stopped there. JSON that parsed and
carried no usable `body` — absent, `null`, a number, an object — still fell
through `unwrap_or("")` and compiled one empty page reported as `ok: true`: the
same wiped preview that looks like a successful render, reached by a different
route. Both routes now answer through one `malformed_request` helper. An *empty
string* stays legitimate, because that is a new document, and a test pins that
distinction so the fix cannot later be over-applied.

**3. A registry failure left an empty toolbar in silence — fixed.**
`app/src/main.ts`. `catch { /* registries optional for first paint */ }` — true
of the paint, false of the app: the writer got an empty ribbon, empty menus, an
empty palette, no completions, nothing said, and nothing that would ever fetch
them again. It now retries once, and if that fails too hands the retry to the
writer. The notice is a banner rather than a status line for a mechanical reason
as much as a design one: boot runs the first compile immediately afterwards and
that compile *writes the status bar*, so a message left there would have flashed
once and vanished — barely better than silence.

That fix exposed a second one. The save-error banner and this new one were both
`position: fixed; bottom: 0`, so they occupied the same pixels and whichever came
last simply hid the other — a writer could be told their toolbar was empty and
never told their work was not being saved. Both now render into one `.notices`
stack (`noticeHost` in `dom.ts`); the container is pinned, the banners inside it
are ordinary blocks, and no notice can bury another.

**4. The README contradicted itself — fixed.** It is the page anyone evaluating
this reads first, and its numbers had drifted: "8 templates" against 10 (and its
own correct "10" eleven lines earlier), "53 commands" against 104 (likewise), 317
assertions and 92 engine tests against 389 and 155, a "~23 MB" wasm chunk that
measures 28.1 MB raw and 10.6 MB gzipped. All corrected against measurement, not
against memory.

**5. A stray tooling log was committed — removed.**
`engine/assets/fonts/.gstack/browse-audit.jsonl`: a browser-automation log,
tracked, sitting inside the directory whose font licences matter. `.gstack/` was
already in `.gitignore`; the file predated the rule.

**6. A file was permanently "modified" with an empty diff — fixed, and it was not
what it looked like.** The audit first read this as line-ending drift. It was
not: index, worktree and HEAD blobs were byte-identical. The cause was a global
`core.autocrlf=true` fighting this repository's own `.gitattributes eol=lf`, so
the stat check never settled. Set `core.autocrlf false` locally and it is gone.
`.gitattributes` now explains this, because the next person to clone on Windows
will hit it and will also assume it is a real change.

## What still stands, unchanged

Named plainly, and none of it is engineering:

- **No git remote,** so the CI and release *workflows* have still never executed.
- **No code signing,** so every operating system blocks the first launch. The
  README and the release body both say which button to press, which is the
  honest interim answer, not a fix.
- **macOS installers have never been built** and cannot be, here. Windows and
  Linux can be produced locally; a `.dmg` needs a Mac.
- **A runaway compile is contained but not reclaimed** on the two native builds.
  It can no longer hold anyone up — this audit confirmed that by measurement, not
  by argument — but the abandoned work does finish on its own thread.
- **Page setup is still app-wide.**
- **No bochur has written a real sefer in it.** Three audits have now said this
  is the item that matters most. Nothing above substitutes for it, and the more
  the engineering holds up, the more conspicuous it becomes that this is the only
  question left.

## What could not be checked

- **The editor itself, in a browser.** Every claim here about the UI comes from
  the source and from 389 headless assertions, not from clicking. That is the
  largest remaining gap in this audit's own coverage.
- **The macOS and Linux installers.**

## Tests

`app`: **389** assertions across 9 files. `engine`: 154 → **155** (new: a request
whose body is missing or is not text is an error, and an empty body is still a
document). `clippy -D warnings` clean, both suites green, the app and the desktop
bundles build.

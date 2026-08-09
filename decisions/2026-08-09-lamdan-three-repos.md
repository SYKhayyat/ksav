# 2026-08-09 — the three-repository report, worked through

The 9 August report (`lamdan/three-repos-2026-08-09.md`, with
`lamdan/duplication-2026-08-09.md` beside it) reads all three repositories at
once and its finding is not a list of bugs. It is a habit:

> the diagnosis is written down correctly and the sweep never runs

Eighteen instances, each one a class named in prose with a single member fixed
and its siblings left standing. This file records what was done about it, one
entry per item, in the order they were taken.

---

## §8.1 — the insertion grid learns a second language, and what that found

**The finding.** `emit-insertion-fixtures.mjs` builds the best fence in the
repository — every command the UI offers, inserted at every kind of caret
position, compiled by the engine, in *both* directions (offered must compile,
refused must genuinely fail). It asked all 1,035 of its questions in Hebrew.
The comment forty files away in `note-commands.ts` says exactly why that is a
problem: a hand-maintained path only one language ever walks is how the worst
bug in this product got in.

**Why the obvious fix was already refused.** `insertion.rs` carried a comment
saying an English name-swap of the *fixture* was tried and is wrong — it would
assert a path no writer could reach, because every insertion surface wrote the
registry's Hebrew snippet verbatim regardless of the document. That objection is
correct, and it makes this a product change first.

### What changed in the product

`mode.ts` gained `translated(snippet, lang)` and `docLang(doc, pos)`.
`insertionAt` now spells a snippet in the document's own language: command names
through `COMMAND_EN`, and **named arguments** through a new `PARAM_EN` table
read off the prelude's `_en_params`. The language is read from the document at
the caret — the innermost node's name, then the majority of the nodes, then the
prose — rather than from a setting, because the document is the thing that has
to compile.

Then the thirteen contexts exist in both languages, and the grid is 2,990 cases.

**The Hebrew half came out byte-identical to the previous fixture.** All 1,035
of them. The language axis is purely additive, which is the proof that the
change did not quietly move the Hebrew answer — and, read the other way, the
proof that the old grid could not have seen any of what follows.

### What the widened grid caught, in order

**1. `#מעבר_עמוד` was refused inside `#שער`, and compiles there.**
`legalAt`'s page-level rule was `frames.length === 0` — *is the caret inside any
brackets at all*. Typst's actual rule is *"pagebreaks are not allowed inside of
**containers**"*, and `#שער` is `align(center, text(…))`, `#הדגשה` a `strong()`,
`#כותרת_בהערה` a `text()` — all transparent. The page-break button was greyed
inside bold text, inside a title, and inside a note-heading, for nothing.

Which commands are containers is not a thing anybody can write down; it is a
property of each command's definition. So it is **measured**:
`engine/examples/emit-containers.rs` asks Typst, one command at a time, over
every name the prelude binds rather than the 115 the registry advertises.
`engine/tests/containers.rs` re-measures and compares, so the fixture is a cache
and not a claim. 62 containers, 59 transparent, 15 with no content body.

**2. `#סימן` was filed as having no content body, and is a container.** The
first version of the probe tried one shape, `#{N}[…]`. `#סימן("א", [דיני
תפילה])` takes its prose in a *second* argument, so it failed on arity and
landed in an "undecidable" bucket of 36 that silently defaulted to transparent —
an `ONLY_AT_TOP` shape inside the brand-new fence built to prevent one. Fixed by
trying the command's **own registry `insert` shape first** (the shape a writer's
caret is actually standing in) and by writing the undecidable list into the
fixture **by name**, because a bucket nobody reads is where the next one hides.

**3. The test that guarded the refusal encoded the bug.** `insert.test.mjs`
stood inside `#הדגשה[שלום]` and called it a container. The fence and the defect
agreed. It now asserts both directions, with `#כותרת1` for the refusal and
`#הדגשה`/`#שער` for the counter-case.

**4. Twelve English aliases had never had their parameters paired.**
`#page_section`, `#topicindex`, `#sourceref`, `#rashi` and eight others were
plain `#let` bindings rather than `_en(…)` wrappers, so their named arguments
stayed Hebrew: `#sourceref("ב״ב", מקום: "ב.")` is not English and is not
something anybody would type. `_en` forwards an unrecognised argument untouched,
so **half a translation compiles** — the grid would have gone green over all
twelve. Six missing pairs added to `_en_params`, twelve aliases wrapped, and a
generator-level check now refuses to write a fixture containing a Hebrew
parameter key in an English document.

### The heading-role family

`legalAt` carried its own list of heading commands: seven names, no English
half, no level past three, and `#שער` wrongly on it. That was the second of five
copies of *what is a heading*.

- **1st** — `spans.ts`'s derived `Node.role`. The authority; it reads the
  document.
- **2nd** — `mode.ts`'s `HEADINGS`. Deleted; `legalAt` now asks `roleAt`.
- **3rd** — `markdown.ts`'s nine-row table. Reduced to the two rows that are
  genuinely not headings-by-role — `#שער` and `#תת_שער`, which the export maps
  to `<h1>`/`<h2>` deliberately — and the rest deferred to `role`.
- **4th** — `enginefacts.test.mjs` scraped `markdown.ts`'s **source text** with
  a regex and a floor of 50 keys. A test that reads source is a test that goes
  red when the source improves, which is what it did. Replaced by an exported
  `CLASSIFIED_NAMES`.
- **5th** — `girsa-ksav/src/read.rs`, in another repository. See below.

Three positions were added to the grid for the mistakes the first nine could not
see, and a position is only a fence for the rule that decides *it*:
`deep-heading-body` (`#כותרת4`, the level the toolbar stops advertising),
`siman-body` (a heading whose level the prelude fixes, so it would go missing
from any list built by reading the toolbar), `title-body` (the one that is
**not** a heading) and `note-heading-body` (the fourth, and the one that
withdraws a refusal rather than adding one).

### The fifth copy, and the seam it sits on

`girsa-ksav`'s `read()` is what puts a shelved Ksav document's *structure* on
Girsa's shelf — headings become the levels of the address, items and rows become
addressable text. It matched **Hebrew command names only**. An English sefer
came off the shelf as an undifferentiated run of paragraphs: no headings, no
items, no rows, every footnote spliced back into the middle of its sentence.

Nothing errored. `Role::Inline` is the *correct* answer for a name nobody knows
— it is what keeps a new style command in Ksav from losing a word — and that is
exactly what made it silent. The same defect the module was written against, one
language over.

Fixed in `sefer-crates` 0.5.2: `ALIASES` and `PARAM_ALIASES`, both public, with
every name normalised before any decision is made. The settings family needed
its own arm, because it is a **prefix in Hebrew and a suffix in English** —
`#הגדרות_כותרות` is `#headings_config`.

**The check runs in the direction that is possible.** Ksav compiles
`girsa-ksav` and Ksav owns the prelude, so `engine/tests/from_girsa.rs` holds
every pair against `typst/ksav.typ` — the thing that actually binds both
spellings. Girsa cannot run that check; it has no prelude. So the test lives in
the dependent rather than the dependency, which is the shape every cross-repo
check in this product should have and the first one that does.

**It went red on its first run, on a pair nobody had questioned.** `#let
hlevel(body, level: 1) = heading(level: level, body)` was a *second definition*
of `#כותרת` rather than an alias of it — the only English name in the prelude
that was. Two identical one-liners agree until one of them is edited. Now
`#let hlevel = _en(כותרת)`.

### What is now true

- The grid asks 2,990 questions in two languages, across thirteen positions.
- Which commands are containers is measured against the compiler, not asserted.
- Five copies of *what is a heading* are one, and the one is derived.
- A half-translated command cannot reach a fixture.
- Two repositories share one table of Ksav's structural names, and the pairing
  is a build failure rather than a sefer that quietly lost its shape.

---

## §8.2 / dup §1.1 — what a Hebrew word boundary is, in five places

**The finding.** `spell/hebrew.rs` said a Hebrew mark is `'\u{0591}'..='\u{05C7}'`
— the whole combining-mark block, nothing excluded. Four characters in that
block are **punctuation that separates words**:

| | | |
|---|---|---|
| `U+05BE` | ־ maqaf | joins two words, like a hyphen |
| `U+05C0` | ׀ paseq | a divider between words |
| `U+05C3` | ׃ sof pasuq | ends a verse, like a full stop |
| `U+05C6` | ׆ nun hafukha | a scribal bracket |

Stripping them glues the words on either side together. Measured on the shipped
release example:

```
כשכשכשכש-זזזזזז   (ASCII hyphen)   → 2 checkable words, 2 flagged
כשכשכשכש־זזזזזז   (maqaf U+05BE)   → 0 checkable words
```

The checker checked the *wrong* spelling and silently refused the correct Hebrew
typography. Sof pasuq ends every verse, so **every unpointed pasuk went
unchecked**.

**Why it was invisible.** `is_part` — the tokenizer's *is this character inside a
word* — was built on the same predicate, so the tokenizer never split at a maqaf
in the first place, and `normalize` then deleted it. What reached the lexicon was
one glued token. And `tools/build_lexicon.py` had the identical omission in
Python (`NIKUD = re.compile(r"[֑-ׇ]")`), so the corpus absorbed the glue as
vocabulary: `lexicon-he.txt` shipped `אתהשמים`, `ואתהארץ`, `יראתהשמים`,
`אלהאלהים`, `אתהאלהים`, `אלההיכל`, `אחריהצהריים` and eighty-odd more.

Both halves agreed, so nothing looked wrong from either side. Two wrong copies
agreeing is not agreement.

**The correct copy was inside the binary.** `girsa-hebrew` was already resolved
in `Cargo.lock` through `girsa-source` → `girsa-ref`, and `grep -r girsa_hebrew
ksav/` returned nothing. Adding it to `engine/Cargo.toml` was one line and no new
supply chain — in the **unconditional** block, unlike the other three, because
the speller runs in the browser build and this crate is pure character tables.

### Five copies, and where each one went

`sefarim.rs:256-260` already named the class: *"This rule exists three times —
here, in `ksav.typ`'s `_ix_fold` and in `app/src/sefarim.ts`… All three are
executed against one corpus by `tests/one_want.rs`."* That comment is right and
its **scope was wrong**: there were five, and the two outside its count were the
two that were broken. Which is this report's whole thesis, stated by the
repository about itself, one function above the bug.

1. **`sefarim.rs`'s `fold`** — the oracle's own first implementation. It
   separated on maqaf and on nothing else, and its geresh arm was missing
   `U+2018`, so a name pasted from a word processor with a left curly quote
   folded differently from the same name with a right one. Now calls the crate.
2. **`ksav.typ`'s `_ix_fold`** — same two faults. A Typst prelude cannot call
   Rust, so its three tables are named constants (`_ix_breaks`, `_ix_geresh`,
   `_ix_gershayim`) and the corpus covers them.
3. **`app/src/sefarim.ts`'s `fold`** — the range was written `[֑-ֽֿ-ׇ]`: the block
   split around **exactly one hole**, U+05BE, because maqaf was the one that had
   been found. Splitting a range by hand is how you get one of four. Now built
   from `HEBREW`/`markPattern()` with a negated lookahead, so there is no range
   to split.
4. **`spell/hebrew.rs`** — gone. `is_hebrew_mark`, `is_hebrew_letter`,
   `is_gershayim`, `is_geresh` and `fold_final` are the crate's. What stayed is
   Ksav's *placement* decisions, which are about spell-checking and not about
   Hebrew: which marks a token keeps (`joins`), and that the final fold applies
   to **scoring only** — folding it into `normalize` would make `שלומ` a word.
5. **`tools/build_lexicon.py`** — gone, and this is the one that needed a new
   mechanism. Python cannot call a Rust crate, so the table crosses the seam
   **as a value**: `src/facts.rs` serialises `girsa-hebrew`'s answer into
   `engine/facts.gen.json` and the script reads it. Exactly the arrangement
   `engine.gen.ts` already has, and for the same reason.

Also fixed while the table was open: `ד` was missing from `is_prefix_letter`,
and this module's own English half already had it — `english.rs` lists `"d"`
and `spell_en.rs` asserts `d'rabbanan` passes. `דרבנן` and `דאורייתא` are on
every page a bochur writes.

### The cache with no provenance, which is where the damage actually was

Fixing `normalize` and re-running `build_lexicon.py` changed the output by
**zero bytes**. The Sefaria half of the corpus contains no word-breaking
punctuation at all; every glued word came from `benyehuda-counts.json`, a 78 MB
derived cache built by the old normalizer, loaded without a word, and not
re-derivable — the 246 MB dump it came from is not kept.

So the cache is stamped. `NORMALIZER_VERSION = 2` is written into it and checked
on load; a cache written by an older rule is **refused**, with a message naming
the dump to re-scan, rather than silently shipping words the current rule would
never have produced. (An unstamped file is by definition older than the first
stamp.) That mirrors `girsa_hebrew::NORMALIZER_VERSION`, which exists for the
same reason one layer down.

**Not yet done, and named rather than glossed:** the lexicon still contains the
eighty-odd glued entries. Removing them needs a re-scan of the Ben-Yehuda dump,
which is a 246 MB download this session could not make. `tests/spell.rs`'s
`word_breaking_punctuation_breaks_words` asserts they are gone and is red until
that scan runs. A fence for work that is finished except for the download is
better than a green suite over a dictionary that still has `אתהשמים` in it.

### The fence

`one_want.rs` gained a fifth section, `hebrew_word_boundaries`:

- every character in `U+0591–U+05C7` is a mark **or** word-breaking and not a
  third thing, and the speller's `is_part_of_a_word` agrees with the crate on
  every one of them;
- `_ix_fold` breaks on all four, asserted inside the compiler, and still deletes
  a nikud point — or "breaks words" would be satisfied by breaking on
  everything;
- `build_lexicon.py` contains no character class of its own (comments stripped
  first, so the file can still *explain* the bug it no longer has);
- `fold-cases.json` contains a case for each of the four, or none of the three
  name-folders is being asked about them.

---

## dup §1.2 — two markup escapers, ten characters against five

**The finding.** Putting somebody else's text into Typst markup is two
questions, and both had been answered several times over.

| | escapes |
|---|---|
| `girsa-ksav`'s `escape` | `# [ ] \ $ * _ < > @` |
| `app/src/typst-escape.ts`'s `typstContent` | `\ [ ] # $` |

Ten against five. The five missing are all live Typst markup: `*` is strong, `_`
is emph, `<…>` is a label, `@` is a ref. Both functions write
`#מראה_מקום(מקור: …)[…]` out of **the same Girsa `display` string**, and Sefaria
titles contain `*` and `_`. One source, two doors, two different documents.

The string-literal escaper was better behaved and had **four** copies:
`lib.rs`'s `typst_str`, `sefarim.rs`'s `typst_string` — byte-identical, same
crate, forty lines from a `use super::*`, under a comment in the first saying
*"nothing else is allowed to build a string literal by hand"* — plus
`typst-escape.ts` and `styles.ts` in TypeScript. Every one of them written after
the rule forbidding them.

### Where the authority went, and why not the obvious place

`girsa-ksav` is the markup writer both applications compile, which makes it the
obvious home and the wrong one — for a reason about the browser rather than
about taste. It is a **native-only** dependency in Ksav (a browser build has no
loopback to Girsa and nothing to be handed a source by), and the escaper is
needed in *every* build: `assemble_source` interpolates a font name and a header
into the prelude on every compile, offline included.

So `engine/src/escape.rs` owns both functions and the ten-character list.
`facts.gen.json` carries the list to the client, `typst-escape.ts` builds its
escaper from it, `styles.ts` re-exports rather than re-implements, and
`girsa-ksav` exposes its own list as `pub const MARKUP` **so it can be checked**.
`from_girsa.rs` holds the two together — and not only the constants: it feeds the
whole character set through both functions, because two lists agreeing about a
value neither of them reads is not agreement.

### And the argument the editor could not write

`girsa-source` 0.5.1 added `range` — *which characters of the place a quote
actually was* — and the Rust door has written `תווים:` since. `citation.ts`
could not express it at all, so the field was **structurally unreachable** from
the editor's own insertion path.

That is the same shape as the bug at the top of `citation.test.mjs`, in the same
function, one release later: the panel wrote the printed string and dropped the
ref, and the fix put one producer in place — and then the next field to arrive
went missing at exactly the same seam, because *one producer* is not the same as
*one producer that can say everything*.

`Mekor.range` is optional and a whole-place citation still writes nothing at all,
which is what every document written before the field existed already says, and
what makes them all still correct.

---

## §8.3 — `check-dependents.sh` was building the pin, not the tree

**The finding.** `sefer-crates/tools/check-dependents.sh` is the whole reason
the three-repository split is affordable, and its own header says so: standalone
repositories mean a breaking change to a shared crate is no longer one atomic
commit that compile-checks both applications, so the check moves into the
shared repository and a break shows up in *its* PR.

Ksav pins those crates by **git rev** — deliberately, because a `path` to a
sibling of the checkout root meant `git clone ksav && cargo build` failed at
`cargo metadata` before a compiler ran. So the script was building Ksav against
the last *pushed* commit. Rename a public item in `girsa-hebrew`, run the
script, and it goes green.

Two of the three dependents' worth of safety net, quietly not there, in the file
that calls itself the safety net.

### What it does now

- Installs the `paths` override itself, **prepended** to whatever
  `.cargo/config.toml` the dependent already has — Girsa's is tracked and
  carries a linker choice and a job count, and eating it for the duration of a
  build would change what is being measured. `paths` is a bare top-level key, so
  prepending is not a style choice: appended below a `[table]` header, TOML reads
  it as a member of that table.
- Restores the original on exit, including on Ctrl-C.
- **Asserts the override took.** `cargo metadata` says where each package came
  from, in its `id`: `path+file:///…` or `git+https://…?rev=…`. Every girsa
  package must be a path under this checkout, and at least one must be found —
  a graph with none in it would otherwise pass by being empty, which is the
  shape this repository keeps rebuilding.
- Checks that the workspace's declared version and its six exact pins agree.
  Seven hand-written strings three lines apart with nothing between them; a bump
  earlier the same day left the six behind and produced *"failed to select a
  version for the requirement `girsa-ref = "=0.5.1"`"* in the repository whose
  own manifest declares it.

Two details that would have made the assertion a no-op, found by running it:
`cargo metadata`'s `manifest_path` cannot be paired with a package name by any
line-splitting scheme (`targets` sits between them), and under Git Bash `$PWD`
is `/c/Users/…` while cargo writes `C:/Users/…` — so the obvious substring
comparison never matches, and the check either fails every run on Windows or,
written the other way round, passes everywhere always. `cygpath -m` when it
exists.

---

## §8.3b — the one genuine cross-repo duplication

**The finding.** `girsa_post::PostError` is the only error type that crosses
between the two applications, and both frontends turned it into a Hebrew
sentence by **regular expression over its English `Display`** — four
character-identical regexes at `Girsa/app/src/trouble.ts:133` and
`Ksav/app/src/diagnostics.ts:44`:

```
/could not reach|timed out|timeout/i
/refused it\b/
/permission denied|access is denied/i
/no such file|os error 2\b/i
```

Every word of those strings was load-bearing API between two repositories, in
the crate that exists so the two sides need not agree in prose.

**And Girsa had already written this exact fix, for its own error type.**
`girsa_app::trouble::Code` prints as `no-index: there is no index here`, its
frontend keys on the name before the colon, and `trouble.test.mjs:96-105`
asserts *"rewording the prose changes nothing a reader sees."* `trouble.ts` even
filed `PostError` under a heading reading *"the refusals this codebase does not
own… whatever a `PostError` says"* — which is the whole mistake in one line.
`PostError` is not somebody else's; it is the shared crate's, which both
applications compile.

### What changed

`PostError::code() -> Option<&'static str>` and `PostError::CODES`, with the
code as the first thing `Display` prints — because what crosses to a frontend is
a *string*, a JSON body or a `title` attribute, and there is nowhere else to put
it.

**`Io` and `Json` return `None` deliberately.** They forward the operating
system's failure and serde's. Naming them `post-io` would claim a vocabulary the
crate does not own, and would *stop* a frontend reading the words that actually
separate `permission denied` from `no such file` — which a reader needs, and
which only the OS's own string carries. Matching somebody else's prose is
honest; doing it to your own, when you could have said the name, is the thing
`code()` ends.

Both sides key on the code, both hold `CODES` against their tables **from Rust**
— `engine/tests/from_girsa.rs` here, `the_rules_this_repository_wrote_down.rs`
there — and both suites assert that rewording the prose after the colon changes
nothing a reader sees.

`girsa-post` became a dev-dependency of `girsa-app` for that one assertion,
which the adjacent test in the same file already licenses: *"A dev-dependency is
a different claim and is allowed."*

### And the site the report named

`Girsa/app/src/main.ts:1214` — the failure path for *send to Ksav* — was
`say(String(e), true)`, under a comment arguing that *"'Ksav is not running' and
'Ksav refused it' are different things to a reader."* The distinction is real,
and printing the English was never how to keep it. That line put `PostError`'s
English on the first screen of a Hebrew application, and it is the bug both
`presence.ts` and `trouble.ts` cite as their reason for existing, in the file
neither of them reached. It goes through `trouble()` now, and `say` gained a
`detail` argument so the transport string lands where every other one does —
behind the details affordance.

---

## §8.4 — Girsa adopts git+rev, and CI stops faking a desk

**The finding.** Girsa depended on the six shared crates by
`path = "../sefer-crates/crates/…"` — a sibling of *its own checkout root*. So
`git clone girsa && cargo build` failed inside `cargo metadata`, before a
compiler ran, with `os error 3` naming a directory the reader had never heard
of. The README's only note on the subject said *"cloning Girsa alone will not
build"*, as though that were a property of the world rather than of one
manifest.

Every CI job carried a second `actions/checkout` to fake the desk layout, and
that checkout needed its own pin — `SEFER_CRATES_REF`, three files away from the
version pins it had to agree with. For a while it had **no `ref:` at all**,
which undid the version pin entirely: CI resolved `=0.5.0` against whatever
sefer-crates `main` happened to be at that second, and **three of eleven runs
died on it** fifteen seconds in. 27% of CI history red because a different
repository's default branch had not caught up.

`ref:` fixed the symptom. The cause was the manifest.

### What changed

- Six `path` dependencies → `git` + `rev`, with the exact version kept beside
  the rev so a commit whose manifests say something else is a resolution error
  rather than a surprise at the first behaviour difference. Ksav made this move
  first; this is the same shape.
- Both `sefer-crates` checkouts and `SEFER_CRATES_REF` are gone from `ci.yml`.
  Cargo fetches the pinned commit itself.
- `crates/girsa-app/tests/manifests.rs` — a port of Ksav's, over this tree: no
  path dependency escapes the repository, all six shared crates are git
  dependencies on one rev at one version, every lock file records that rev, and
  `ci.yml` carries no second pin.
- `.cargo/config.toml` documents the `paths` override for the days somebody is
  moving the seam, and **lost `[build] jobs = 12`**. The reasoning was sound and
  the scope was not: `[build]` is not target-scoped, so every CI runner read a
  number tuned for one 28 W laptop — a two-core runner told to oversubscribe by
  three. It belongs in that laptop's own `~/.cargo/config.toml`, and the file
  says so rather than dropping it silently. The linker choice stays, because it
  *is* target-scoped and a Linux runner never reads it.

### One thing the report asked for that is not done, with the reason

> Add `ref:` to the Ksav checkout while you are in the file.

The Ksav checkout feeds `check-ksav-fixture.sh`, which asks whether the packet
Girsa produces is still the one Ksav asserts on. That is a **drift detector
against the live consumer**; pinning it would make it a drift detector against a
frozen consumer, which is no drift detector at all. The shared crates are pinned
because taking a new version must be a deliberate act; this is the opposite
question, and the workflow now says so where the `ref:` would have gone.

---

## §8.5 — the class becomes an executable prohibition, in all three repositories

**The finding, and it is the report's verdict rather than one of its items.**

> A repo that can name the class and does not sweep it is not out of time; it is
> missing the step where a named class becomes an executable prohibition. Ksav
> *invented* that step — `runner.test.mjs:199-278`'s prohibition sweeps are
> exactly it — and then scoped it to two directories of one app.

So each repository now carries a `prohibitions` suite that is repo-wide, covers
every language in the tree, and is seeded with the class statements from §1.
`Ksav/ksav/app/test/prohibitions.test.mjs`,
`Girsa/app/test/prohibitions.test.mjs`,
`sefer-crates/crates/girsa-ksav/tests/prohibitions.rs`.

A rule states the class, the fragments that spell it, and its owners — and **an
exemption is a claim with a test attached**: an owner that stops containing what
it owns turns the suite red too, because that is how a green sweep comes to
guard nothing.

### What it found on its first run, which is the point

**Ksav.** `editormarks.test.mjs` asserted *"every one is a combining mark in the
Hebrew block"* against a hand-written `/^[֑-ׇ]$/`. Nothing in the nikud bar is
one of the four word-breaking characters, so it passed — and it would also have
passed if one had been added, which is the difference between a check and a
coincidence. It reads `markPattern()` now, and gained the counter-case.

**`i18n.ts:405` — `כסב`.** §1 #14, found by the sweep rather than by the report
being re-read: *"חיפוש מקורות פועל כשגרסא פתוחה לצד **כסב**"*. The banned
transliteration, in the application whose own name it is, in the string that
tells the reader it needs Girsa. Girsa has a test literally named *"nowhere in
src spells the sibling כסב"* and it cannot read this tree.

Fixed with `app/src/names.ts` — the same file Girsa wrote, holding `KSAV`,
`GIRSA` and `withPrefix` — and the sibling's name, which was spelled `גִּרְסָא`
pointed in one module and unpointed seven times in another, is one constant now.

The rule for the unpointed spelling is the interesting one: a blanket ban would
be **wrong**, because `גרסה`/`גרסאות` is the ordinary Hebrew word for *version*
and `i18n.ts` legitimately says it about the document history. So the
prohibition is on the shapes that can only be the application, which is narrower
and true where the obvious rule would have been neither.

**Girsa.** `run.mjs:14` carried `new URL(import.meta.url).pathname` — the exact
expression Ksav forbids by name — in the file whose own header says it has *"the
same shape as `Ksav/ksav/app/test/run.mjs`, for the same reason it has that
shape."* Three more test files had it. All four go through a new
`app/tools/paths.mjs`, which is the file Ksav has and Girsa did not.

**`girsa-desk/src/documents.rs` wrote markup that is not Ksav.** Its test fixture
built `#מקור:("{r}")[]`. `מקור:` is a named *argument* of `#מראה_מקום`; what this
wrote is something Ksav cannot emit and Typst cannot compile. All six tests were
green over it, because `cited_in` scans for the literal substring `מקור:` and
found one — **in the crate whose thesis is *no second markup writer***. The
fixture goes through `girsa_ksav::mekor` now.

**Sixteen `textContent = String(e)` sites** (§1 #16). `trouble.ts:190` claims
*"**Every** `textContent = String(e)` in this application goes through here."*
Eight were `say(String(e), true)` in `main.ts`, each under a comment arguing
that the raw string carried a distinction worth keeping — *"'Ksav is not
running' and 'Ksav refused it' are different things to a reader"*. The
distinctions are real and the English was never how to keep them: they are
`PostError::code()` and `girsa_app::trouble::Code` refusals, and `trouble()`
reads both **by name**, so the distinction survives exactly and the sentence
arrives in Hebrew.

The other seven were in `laneview.ts`, routing `String(e)` into a private
`trouble(why: string)` — so the guard in `sources.test.mjs`, which requires the
`String(e)` and the assignment in **one expression**, could not see them: they
were in different functions. That method takes the caught value now rather than
a string, which is what makes the class unrepeatable there rather than merely
fixed.

`Doing` gained six members. Each of them is a failure that had no name for what
was being attempted, which is why it had no sentence.

---

## §8.6 / §5 — state that can disagree with itself

Four places where one fact was recorded twice and the two records could differ.
None of them is a race or a cache; each is a second variable that nobody
noticed was the same question.

### 1. Print produced a blank sheet

`runtime.lastResult` and `preview.current` are both *the pages on screen*. On a
failed compile the engine returns `pages_svg: []`, `compile.ts` stores it
**unconditionally**, and the redraw is skipped — deliberately, so a writer
mid-keystroke keeps looking at the last good page rather than a blank rectangle.

So after a failed compile the two disagree, and every consumer that wanted *the
pages* and reached for `lastResult` got the empty one. Print is where that is
worst: a blank sheet, silently, on the one output that is paper.

`preview.currentPages()` is the record that is true by construction — `drawPages`
is what put them on the screen, so what it last drew is what is there. Print,
click-to-jump and reveal-the-cursor read it. `lastResult` keeps the consumers
that want the *compile*: diagnostics, the healed count, whether it succeeded.

One thing had to change underneath: `drawPages` recorded `current` only when the
engine sent page hashes. Right for the second pane, which reuses the windowing;
wrong for Print, which would have produced nothing at all on an engine too old
to send names.

### 2. The dirty flag was one boolean for a library

`save.unsavedToFile` was a single global; `watch.known` is a `Map` keyed by
document id, twelve lines away in another module, holding the other half of the
same question. `openDoc` called `markFileSaved()` on **every** switch, so
editing a file, opening a second document and coming back lost the dot in the
title bar *and* skipped the write-back — a file with unsaved changes reporting
itself as saved.

It is a `Set<string>` keyed the same way `watch.known` is, and `openDoc` clears
nothing: opening a document says nothing new about whether its file has caught
up, and pretending otherwise was the bug.

### 3. `Settings extends DocConfig`, so thirty fields existed twice

The reader that chose between them (`now()`) fell through to the app's copy
whenever the document had not said — which for the four per-edge margins and the
note region is their **normal** state, because absent means *"follow the one
margin"* and *"decide from the document"*. So the settings panel could print a
top margin the page was not laid out on, with nothing to tell the writer which
of the two numbers had been used.

`Settings` no longer extends `DocConfig`. The app needs exactly one page setup
of its own — *what a new document starts like*, which is what Word calls **set
as default** — and that is one field, `newDocument?: PageSetup`, instead of
thirty holding a second opinion about the open document. A `Field` union names
the two kinds where they meet, so the type system now knows which of the two a
given row is editing; `now()` returns the document's answer and never falls
back; `SKINS` are typed `PageSetup`, which is what they always were; and an
existing settings blob has its top-level page fields rescued into `newDocument`
once and then dropped.

`enginefacts.test.mjs` used to assert *"settings.ts ships the engine's defaults,
field for field"*. That assertion is gone because the duplication it guarded is
gone, and its replacement is the prohibition: **the app keeps no copy of a page
field at all.**

### 4. `ACTIONS` was frozen before the macros existed

The array was built at module load with `...macros.parseAll(settings.macros)`
spread into it, under a comment saying `reconfigureShortcuts` runs after a macro
is saved. It does — and it rebuilds the keymap from the array that was frozen
before the macro existed. A macro recorded this session was denied by the
palette and by Settings while **Help listed it**, because `help.ts` re-parses at
render time and was the only surface that did. Three views of one list, two of
them looking at a snapshot.

`actions()` is a function now, and the macros are appended rather than spread —
so an ordinary action keeps the position it has always had in the shortcut list.

### And one the wider escaper exposed

`docx.ts` built a run as one string — text *and* the `#מעבר_שורה` it had just
generated — and escaped the whole of it. What came out was `\#מעבר\_שורה`, which
Typst sets as literal words: **a `.docx` with a shift-return in it imported as
visible markup mid-sentence**, and had done since the importer was written.

The test asserted `.includes("#מעבר_שורה")` and passed, because `\#מעבר_שורה`
contains that substring — right up to the day `typstContent` learned to escape
`_` as well, which is what the ten-character list from `girsa-ksav` brought with
it. The bug was there the whole time and the assertion could not see it. Text
and generated commands are kept apart until the end now, and the test checks for
an *unescaped* hash and that the words around it are still escaped — or "stop
escaping" would be the other way to make it pass.

---

## Page geometry, per document and fully custom

Not from the report — asked for directly while it was being worked through, and
it lands on exactly the surface §8.6 had just been opened up:

> make sure page size and margin size (all custom) etc are all changeable per
> document

**What was already true.** B26 made page setup a property of the document, so
the four per-edge margins, the binding gutter, two-sided mirroring and the
uniform margin all live on the sefer and travel with the file. Every one of them
is an arbitrary number in centimetres. `PAGE_FIELDS` is the list, `docConfig()`
lays a document out as its own setup over the shipped defaults, and
`setPageSetup` writes to the document rather than to the application.

**What was not.** The **size** could only be a name Typst already knew — `a4`,
`a5`, `us-letter`. A sefer is routinely printed at a size no standard names —
17×24, 20×27 — and the only answer was the nearest A-size and living with the
margins.

`page_width_cm` / `page_height_cm`, in the engine, the prelude
(`רוחב_עמוד` / `גובה_עמוד`, with `page_width` / `page_height` for the English
side), `PAGE_FIELDS`, and two optional rows in the panel. Absent means *use the
named paper*, which is what every document written before this says — the same
"absent is an instruction" rule the per-edge margins follow, and why the rows
are empty rather than pre-filled with A4's numbers.

**Both or neither, and this is the only care the feature needs.** Typst's
`width`/`height` override `paper:` **entirely**, so a width with no height does
not mean *this wide and as tall as A4 was*; it means a page whose other
dimension the compiler decides. The engine reads the pair or ignores it, the
prelude reads the pair or falls back to `נייר`, and `page_geometry.rs` asserts
the silent direction: half a size must leave the named paper alone.

Measured off the laid-out page rather than asserted on the request — a named
paper is the size it names, a custom size is the size it asks for, a custom size
wins when both are given, half a size changes nothing, an impossible size is
clamped rather than blanking the document, and a per-edge margin actually moves
the text block.

---

## §8.7 — one `Store`, six stores, and the sixth that forgot to compact

**The finding.** Six stores across three crates in Girsa share an identical
shape — `log`, an index, `open() -> (Self, Vec<String>)`, `nowhere()`,
`compact()`, `count()`, `all()`, an add, a `remove` — five with an identical
`From<LogError>` and five with an identical `Log::bloated` call.

**The sixth forgot to compact.** `girsa-desk/src/documents.rs`, written last, in
the crate added most recently. `remember` is called every time Ksav saves a
document and each call appends a line superseding the last one for that path,
and nothing ever rewrote the file — so `personal/documents.jsonl` grew **without
bound**, in the store whose entire job is to be re-saved.

That is not a defect anybody finds by reading it. You find it by noticing that
five files say the same thing and one says nine-tenths of it.

### Why a trait and not a `Store<T>` container

`Store<T>` as a container was the obvious shape and is the wrong one: the six
indexes are genuinely different. `BTreeMap<SegmentId, Vec<Mark>>` keeps several
marks per place and sorts them by where they start; `BTreeMap<String,
Collection>` keeps one folder per name; `girsa-fix`'s suspect queue is a plain
`Vec` in log order, because the order candidates arrived *is* the order they are
looked at. Flattening those into one generic map would move the difference into
six `hold` closures without removing it.

What is the same is the **procedure**: open, replay, hold, count, compact when
bloated, report rather than fail. So `girsa_personal::Store` is a trait saying
what a store must be able to answer, and `girsa_personal::open` is that
procedure, once.

The `From<LogError>` impls cannot be generic — `From` for a type in another
crate is the orphan rule — so `io_from_log_error!` is a macro, which is the
honest form of *"this is the same eleven lines again"* when the language will
not let it be a function.

`documents.rs`'s error type is `LogError` itself rather than a wrapper, so it
takes no macro: the store is thin enough that the log's own failure is the only
one it can have.

### The fence

`the_registry_compacts_instead_of_growing_forever` saves two hundred times,
reopening between each, and asserts the file is bounded. Written as *save,
reopen, save* rather than as a line count on one handle, because compaction
happens **on open** — which is also the only moment it can, since that is when
the whole set is in memory.

The first run of it failed for the right reason and against the wrong number:
sixty saves is below `Log::bloated`'s floor of 64, which exists so a layer with
four rows in it is not rewritten because one was saved twice. The floor is the
log's business; what the test asserts is that the growth is bounded at all.

---

## §8.8 — the four consumers that were never built

§2's shape, ten times over: *the type, the security model, the persistence and
the doc comment all exist; the caller does not.* The inverse of this project's
own bug family — here the engine works, the UI is absent, and the comment is the
lie. Four of them, one commit each.

### a. The clipboard flavour Girsa spent eighty-six lines putting down

`girsa_source::CLIPBOARD_MIME` is a real native clipboard format, with
`clipboard-rs` pulled in specifically because *"a webview cannot do that"* —
`navigator.clipboard.write` will take a custom type and then put it down as a
Chromium **web custom format**, which another tab can read and a native
application cannot — and all three flavours set inside one clipboard open,
because on Windows two libraries taking turns means the second empties what the
first put down.

**Zero references in Ksav.** No paste handler, no clipboard plugin. Girsa's
careful three-flavour Ctrl+C landed in an editor that only ever read
`text/plain`.

`engine/src/clipboard.rs` and a `clipboard-source` service, native-only. A
service and not a webview call for exactly the reason Girsa gives for not
*writing* it from one: a `paste` event exposes `text/plain`, `text/html` and
files, and a custom native format is not among them on any platform.

It answers with **markup**, not the packet, rendered by `ksav_engine::source` —
the same renderer the loopback arrivals go through — so a quote that arrives on
the clipboard and one that arrives over the loopback are the same document.

The paste handler's ordering is its whole difficulty: the ask is asynchronous
and `preventDefault` is not, so the plain text goes in immediately and is
replaced if a packet turns up, and only if that text is still there — a reader
who kept typing has moved on.

### b. The errand that pays for the loopback

`POST /refresh` is named in Girsa's own `post.rs` as *"the clearest of them"* and
in Ksav's README as *"the errand that pays for the loopback"*. It had a generated
client, a generated table row, and **no caller in `src/`**.

A panel, and an action rather than a bare key — findable in the palette,
bindable, listed in Settings, which is how everything else a writer can do is
reachable. Rows and not a rewritten document, which is the design: a correction
somebody else made silently changing the words in the sefer you are writing is
the surprise this arrangement exists to avoid.

Two of Ksav's own fences caught the first draft, both rightly: the panel claimed
a head exit and built its × by hand rather than through `panelHead`, and
`takeRefreshed` counted bracket depth itself — which `spans.ts` owns, and a
second counter is how `brackets.ts` once came to delete a call's real closing
paren over a `)` inside a string.

### c. *Where did I use this* had a receiver, a store and a test, and no sender

`girsa-desk`'s registry, its `who_cites` query and its tests were all built and
**nothing ever sent it a path** — so the query walked `personal/ksav/`, the
documents written in Girsa's *own toy editor*, and a `.ksav` written in the real
Ksav answered *nothing cites this*. The reader's actual work, in the actual
editor, was invisible to the feature it exists for.

There is nowhere for Girsa to walk instead: a reader's documents live wherever
they keep documents, and a library application has no business enumerating a
disk. So the pen tells it — `saved-here`, a path and a name, never the text.

Only for a real file path (a browser handle is not a place Girsa can open), and
on an **autosave** as much as on a Ctrl+S, through a `save.onFileWritten` hook —
a registry that only heard about hand-made saves would miss most documents.
`told: false` means the library is closed, which never fails a save.

### d. `Segment.anchors`, mined at ingest and read by nothing

`girsa_corpus::anchors` mines Sefaria's inline `<i data-commentator="…"></i>`
elements out of the text at ingest — **43,883 in Shulchan Arukh Orach Chayim
alone** — records each one's character offset, rebases them across every segment
split, persists them, and calls them *"spec.md §8.4's span anchoring, already
computed upstream and sitting in the corpus unused"*.

Forty lines away, `girsa-app/src/spans.rs` — the *other* implementation of §8.4 —
opened with *"**Nothing in the shipped data says which words**"* and re-derived
an approximation by string-matching, **only when the far sefer was already
open**. Two files, one spec section, one saying the datum exists and one saying
it does not.

The consequence is not academic: a link to a commentary the reader had not
opened had no span at all — which is exactly when a span is worth most, since
the words are the only thing that would tell them whether to open it.

`anchor_span` takes the **single-resolution case only**. Named once, one answer;
named twice — three notes of Mishnah Berurah on one se'if, which is ordinary —
two candidates and no way to choose, so none. Rule 6, and a highlight on the
wrong half of a line looks exactly like a highlight on the right one.

---

## §4a — the two bugs the browser build's ambiguous status caused

Both are one shape: a check that answers a question about the **build** by
guessing at the object in front of it.

### 1. The service worker installed under `ksav serve`

The gate was `backend?.kind === "desktop"` and `import.meta.env.PROD`, and
neither is the question. `ksav serve` is a production build served over HTTP
with `HttpBackend` behind it — so it installed a **cache-first** service worker
over an editor whose compiler is the server that just went away, and
`index.html` links `rel="manifest"`, so it also offered to *install itself* in
that state. What comes back is a shell that boots, draws the chrome, and cannot
compile a document.

`if (!__WASM__) return;` — one line. The wasm build is the only one where
"offline" means the whole product is there, because the engine is in the tab.

### 2. The browser build claimed a Girsa half it cannot have

`sourcesOf` tested `typeof s.inbox === "function"`, and `inbox` is defined on the
shared `ServiceClient` base — so it was **always** true. Its own comment says it
exists *"so that 'can I reach Girsa' is never four separate `typeof b.mekoros ===
'function'` checks that drift apart"*: it consolidated four drifting checks into
one wrong one, and `t("girsaNeedsApp")` — the sentence that tells a reader why
source-finding is unavailable in a tab — sat unreached.

Keyed on `SERVICE.inbox.nativeOnly` now, which is generated from `services.rs`'s
own `Reach` column. A build that cannot reach the loopback is a fact about the
build, and the one place that knows which services need it is the table that
declares them.

**And the test that should have caught it asserted the opposite.**
`services.test.mjs` wrapped the Girsa rows in a `try/catch` under the comment
*"`WasmBackend` has no `Sources` half — a tab cannot reach the loopback — so the
three Girsa services have no method here. **That is the design.**"* It was false
in three ways at once: the methods are on the shared base, so nothing threw and
the `catch` was dead; nothing anywhere asserted the absence it described; and it
said *three* where the registry has six. A test whose exemption comment states a
mechanism the code does not have is the same failure as a doc comment doing it —
and this one was guarding the seam.

The absence is asserted now, from the generated table, together with its
counter-case: the server build still *has* a Girsa half, or "a browser tab has
none" would be satisfied by nobody having one.

---

## §8.9 — the claims that were false, and the ones that had gone stale

A comment that is wrong is worse than no comment, because it is read as
evidence. Each of these was load-bearing somewhere.

### The load-bearing claim at the seam, which was false in three places

`sefer-crates/README.md` leads with it, `Girsa/spec.md:806` repeats it, and
`girsa-app/src/sending.rs` says it at the exact function where the two
vocabularies meet:

> one citation formatter compiled into both means the app that *produces*
> citations and the app that *prints* them cannot disagree

**Ksav has never compiled `girsa-cite`.** Not at any depth; its manifests name
`girsa-source`, `girsa-ksav`, `girsa-post` and now `girsa-hebrew`.

And the real mechanism is **stronger** than the claimed one. Ksav has no
citation formatter at all: it prints `packet.display`, a string Girsa already
formatted, and asks the loopback for a re-print in another style. A formatter
Ksav cannot reach cannot disagree with Girsa's. What the shared repository
actually prevents is a second implementation *coming into existence*, which is
the thing worth preventing — and `girsa-ksav` is the crate that earns the
arrangement in the claimed way, because `girsa-desk` asserts **equality**
against it rather than merely compiling it.

All three rewritten. The crate stays: moving it now costs a version bump for no
gain, and it is the shared repository's business to hold the definition whether
or not both sides currently link it.

### The flagship §3 test's helper described a path it does not take

`a_reimport_keeps_every_name.rs`'s `as_resolved` said it resolves *"live first,
then ancestry, then the redirect table — what a link, a correction or a Ksav
citation goes through"*. It resolves through explicit redirect rows only; the
ancestry walk the window uses is not in that path at all.

The claim mattered because of where it sat: a *certifying* test appearing to
exercise the reader's own resolution order. What it does certify is real and
worth having — that the rows the importer writes are enough to find every
previous name — and it says that now.

### The stale ones

- **`girsa-corpus/src/lib.rs` named SQLite**, in the header of the crate whose
  subject it is. There is no SQLite in this project and there never was: it was
  in an early plan, the plan changed, and the sentence outlived it.
- **`spec.md` §8.6 said "Later" and "post-v1"** about the transmission chain,
  which is built: `girsa-link/src/chain.rs` — `trace`, `between`, `forks`, with
  `girsa_corpus::era` answering which end of a hop is earlier, and
  `how_it_became_halacha.rs` exercising it. What it lacks is a way in from the
  window, which is §2's shape and is now tracked as that rather than as a plan.
- **"the 104-entry registry"**, in three files across two languages. It is 115,
  and has been for a while.

The presence claim in `spec.md` §10.6 was amended with §3d′, and the `documents`
and `spans` claims with §8.7 and §8.8d — each beside the code that made them
false, rather than in a list here.

---

## §1 #8 and #7 — the mirrored table, and the scraper in the shipping binary

Two findings, one class: `facts.rs` states it — *"a value crossed a language
boundary as source text… so it stops crossing as text"* — and `diagnostics.rs`
states it — *"the prelude is a parsed `Source` now, so the question can be asked
of the syntax tree that Typst itself produced"*. Both were applied to the site
that prompted them.

### `TemplateDef`, the one Rust→TypeScript table with no protection

`facts.rs` was applied to four tables. `TemplateDef` was the fifth and went on
being typed out by hand in `api.ts`: a field added in Rust never reached the
client, a field renamed became `undefined` at every use, silently, because the
Rust value always wins on the wire.

The **field names** cross, not the templates — their bodies are twelve whole
documents and `/templates` sends them at runtime — and they are measured by
serialising a real `Template` rather than listed, so a field that gains
`#[serde(rename)]` crosses under the name it goes on the wire with.

`api.ts` re-exports, and the prohibition is what stops it growing back:
`enginefacts.test.mjs` fails if that file declares a `TemplateDef` of its own. A
second declaration typechecks perfectly and is wrong the moment Rust moves.

### The scraper that runs in the shipping binary

`hebrew_param` — the map that lets a diagnostic say *"`align` is `יישור`"* —
found the prelude's parameter tables by substring, counted parentheses to the
close, and split the region on commas and colons. Its own comment conceded it:

> Still string-parsing a `.typ` file, which is fragile and worth saying out
> loud: reflow the prelude's parameter tables onto one line and this quietly
> gets less useful.

Two hundred and forty lines above it, `enclosing_let` had made the opposite
argument and won it, and listed exactly what a scan cannot see: a binding inside
a string, a binding inside a comment, the difference between a nesting level and
a textual neighbour. **Every one of those applies here.** A `//` note between two
entries — and `_en_params` has several, arguing why a particular pairing is
*absent* — reads as an entry. `rgb("…")` in a default value is a paren the
counter has to be told about. A comma inside a string ends an entry that has not
ended.

`en_param_pairs` asks Typst's parse. A `Named` node under the right dictionary is
a pairing; nothing else is, whatever it looks like. Two containers, because the
vocabulary has two shapes — the flat `#let _en_params = (…)` and the per-command
`extra: (…)`, which exists precisely because two Hebrew words can share one
English one.

And it returns the **pairs**, not the text of each table. `english_commands.rs`
had been handed the raw regions and split them on commas and colons a second
time: the same fragile read, repeated in the test that was meant to be holding
it up.

---

## §6 — fourteen measurements, thirteen of them already in the file

§6 is the one lens where the report starts by conceding the point: *"Somebody has
been measuring, and it shows."* Then it lists fourteen sites, and every one of
them carries the note that damns it — **the fix is in the same file, usually
within twenty lines, with its own measurement in the comment.** `job.rs:98`
rewalks a prefix that `did()` fifteen lines below stopped rewalking, and says so
in a comment that quotes 164 million comparisons. `snippet.rs` walks the segment
twice fifty lines under a module header celebrating the removal of two walks.
`repair.rs:470` is missing the guard `repair.rs:269` has, in the same file, for
the same reason, on a path asked twenty-five times as often.

That is §1's shape with a stopwatch attached, and it means none of the thirteen
needed a design. They needed the sweep to run.

### The thirteen

| What it was | Where | What it is now |
|---|---|---|
| whole-prefix rewalk per batch | `girsa-lane/src/job.rs` | a `from` floor that only advances |
| `format!` of two segment ids per edge, unguarded | `girsa-link/src/repair.rs` | the empty-map guard from `:269` |
| two walks to the first mark | `girsa-search/src/snippet.rs` | one walk with a `lead`-deep ring of byte offsets |
| `beside(a)` inside an O(n²) pair loop | `girsa-link/src/chain.rs` | hoisted: once per `a`, not once per pair |
| the whole personal layer scanned inside the BFS | `girsa-link/src/chain.rs` | `Graph::drawn`, assembled once at `new` |
| every segment's text cloned to be mined | `girsa-corpus/src/anchors.rs` | `Mined::text` is a `Cow`, borrowed on the fast path |
| the catalogue parsed per candidate slug, inside `for n in 2..u32::MAX` | `girsa-corpus/src/import/mine.rs` | one `HashSet` of the taken slugs |
| linear `Queue::get` inside a loop over 28,124 entries | `girsa-fix/src/suspect.rs` | a `HashSet` of the ids already queued |
| `tokenize` allocating a `String` per word, per hit | `girsa-search/src/index.rs` | `girsa_hebrew::for_each_token`, one reused buffer |
| a 3.7 MB lexicon re-normalized per unresolved lookup | `girsa-search/src/citation.rs` | the normalized spelling is a third field, computed at `open` |
| Θ(N²) marker numbering | `ksav/engine/typst/ksav.typ` | the linear form that was already at `:415` |
| `savedMacros()` re-validating every macro per keystroke | `ksav/app/src/main.ts` | validated once, cached, invalidated on write |
| `git ls-files` spawns and 580 KB of prose re-read per call | `ksav/app/test/docfacts.mjs` | the file list and the prose are read once |
| a `node` subprocess inside the suite to reprint a markdown file | `ksav/app/test/documentation.test.mjs` | `card.mjs` exports `card()`; the CLI is a `pathToFileURL` guard |

The fourteenth — `girsa-lane`'s retrieval having no index — is the one the report
calls *"a genuine hole rather than a missed sweep"*, and it is the next section.

### The one that turned into a shared-crate change

*"`tokenize` allocating a `String` per word, per hit"* is aimed at `Hit::marks`,
which tokenizes a hit's text to find **where** the matched words sit and then
throws every string away. The report's note points at the fix — *"the shared
crate has `normalize_into` for exactly this"* — and `normalize_into` is the wrong
end of it: it reuses a buffer for the whole normalized string, and `marks` needs
the words separately with their spans.

So `girsa-hebrew` gained the missing half:

```rust
pub fn for_each_token(input: &str, mut f: impl FnMut(&str, usize, usize))
```

One buffer, cleared per word, handed out by reference. `tokenize` is now that
function plus a `to_string` — which is the part worth having, because the two
walkers had been **two copies of the same if-else ladder**, guarded by a test
named `tokenizing_agrees_with_normalizing`. That test was the right instinct and
the wrong shape: a test that two copies still say the same thing is a worse tool
than one copy. Both now ask `folded(c)`, and the test remains, checking the thing
that is still genuinely two shapes — a joined string against a list of spans.

Four callers in `girsa-search` were filtering a `Vec<Token>` down to
`(start, end)` pairs; they are one `spans_where(text, keep)` now, with the
predicate as the only difference between them — which is all the difference there
ever was. `notarikon_in` keeps a four-field `Word` instead, because it reads a
word's first and last character and its span and nothing else, and holding a
`String` to carry two `char`s across a 1,275,307-character segment is the same
mistake in a costume.

`Vocabulary::add` was swept while it was open: `entry(word.to_string())`
allocates on **every** call, including the millionth sighting of `את`, and a
vocabulary read off the corpus is almost entirely repeat sightings. A `get_mut`
first makes it an allocation per *distinct* word.

### The fence

A prohibition, in the sweep §8.5 built:

> **girsa-search marks spans by walking, not by collecting words** — no
> `girsa_hebrew::tokenize(` under `crates/girsa-search/src/`, exempting
> `tokenizer.rs`.

The exemption is a claim with a test attached, as always here: tantivy's `Token`
owns its `String`, so that one caller genuinely wants the words — they are the
product, they go into the index. Every other caller in the crate wanted integers.

And in `girsa-hebrew`, two tests: one that walking says what collecting says, and
one that the buffer is *one* buffer — the words' pointer stops moving once it has
grown past the longest of them. That second one is the whole change, made
observable, so the next person to optimize the walker finds out rather than
guesses.

### What was not done, and why

Three `tokenize` callers were left alone: `tokenizer.rs` (above),
`girsa-app/src/spans.rs` and `fixing.rs`. All three keep the words. Rewriting
them to walk would trade a clear `Vec` for a closure and buy nothing — the
report's finding is about volume, and those run once per drawn line.

---

## §6 — the fourteenth: the lane had no index

The one §6 finding the report refuses to call a missed sweep:

> One genuine hole rather than a missed sweep: `girsa-lane`'s retrieval has no
> index. `Vectors::open` reads every record's id to build an offset map and
> `nearest` reads the whole file again — two full linear passes per sefer per
> query. At the offered scale (`Chosen::everything()`) that is ~15 GB read twice
> per query, and unlike the 13-day embed cost it is stated nowhere.

Three claims, and they need three different answers.

### The repeated `open` is a cache, and the file's length is the whole validation

`Lane::ask` called `Vectors::open` **per sefer per query**, and an open walks
every record in the file to build the offset map. Four thousand seforim, once a
keystroke.

`Lane` holds its stores now. What makes the cache safe rather than a second
source of truth is that `vectors.bin` is **append-only**: a store that grew is a
store whose length changed, so one `metadata` call per sefer is the entire
correctness argument. A job that embeds four hundred more segments into one sefer
invalidates that sefer and nothing else, without telling anybody it did.

The key carries the model's fingerprint, which is not paranoia — `Lane` is
`Clone`, clones share the map, and `set` can change one clone's model out from
under another. Handing back a store built in another model's space is the exact
mistake the file format's header exists to prevent, and the cache does not get to
reintroduce it one layer up.

### The repeated read of every vector needs something smaller to consult

There was nothing to consult instead of the file, so something had to be small
enough. `girsa-lane/src/signature.rs`: **signed random projection**, 256
hyperplanes, one bit each.

Both sides are unit length, so nearness is a cosine. Two vectors an angle θ apart
fall on opposite sides of a random hyperplane with probability θ/π — so the
fraction of 256 bits that disagree *estimates the angle*, and a `u64` XOR with
four `count_ones` replaces 768 multiplies. Thirty-two bytes where the vector is
three thousand and seventy-two.

The honest comparison is not against the fifteen gigabytes, which were never in
memory. It is against what `Vectors` **already** holds: a `HashMap<SegmentId,
u64>` and a `Vec<SegmentId>` over every embedded segment, where a `SegmentId` is
a good deal more than 32 bytes of heap. The index is smaller than the id map it
sits beside.

The planes are not stored. They are grown from a fixed seed by splitmix64, so
every machine and every rebuild produces the same 256 for a given width — storing
them would be one more file that can disagree with the signatures built from it,
for 786 KB and no benefit.

### The sidecar, and why a second file is allowed here

`vectors.rs`'s own header argues against a second file, and it is right: *"the
work product is the progress record… there is no second file that can survive a
crash while disagreeing with what was actually embedded."*

That argument is about a **progress record**. A signature is a pure function of a
vector, so `signatures.bin` is a *cache* of an answer `vectors.bin` already
contains — and it carries the one number that makes disagreement impossible to
miss: `covers`, the byte length of `vectors.bin` it was built from.

| `covers` vs the file | What happens |
|---|---|
| equal | read it |
| less | sign **only the tail** and append — the ordinary case after a job runs |
| more, or another model, width or version in the header | build it again |

There is no state in which a stale sidecar is used, and none in which one costs
an answer: the worst outcome is `nearest` reading the whole file, which is what
it did before this existed. The torn tail is excluded from `covers`, so a crashed
append does not get signed and does not get counted.

### What it is allowed to get wrong, and who is told

A shortlist can miss a vector the exact score would have ranked. Three things
answer that and none of them is *hope*:

1. A store under 4,096 vectors is **read whole** — below that the shortlist would
   be most of the file and the seeks cost more than the read.
2. The shortlist is oversampled 32× and then every candidate on it is scored
   **exactly**, by reading its record at the offset the id map already knew. The
   scores in the answer are true cosines, never estimates.
3. It is **reported.** `Ranked::whole`, `Asked::whole`, and one wording —
   `girsa_lane::SHORTLISTED` — drawn by the window, the CLI and the MCP surface.

That third one is the whole temperament of the crate. This is the module that
refuses to rank two models' vectors against each other because *"there is no way
for a reader to notice that from the results."* An answer from a shortlist and an
answer from the whole store are equally indistinguishable. So the store says
which it gave.

`Asked` also carries `read` — records pulled off disk — which is the cost the
report says is stated nowhere, now available to every caller that wants to state
it.

### The fences

Eleven, in `signature.rs` and `vectors.rs`. The two that are the change itself:

- **the planes are the same planes every time.** The sidecar rests entirely on
  it: signatures written by one run are compared against a query signed by the
  next.
- **hamming distance tracks the angle** — checked at 15°, 45° and 90° against
  θ/π × 256, with three binomial standard errors of tolerance. A test that
  demanded the exact figure would be testing the seed.

And the ones that hold the shape: a big store answers from the index *and says
so*; the index finds what reading the whole file finds (checked against an
exhaustive dot product over 5,096 vectors); the sidecar grows by exactly four
entries when four vectors are appended; a sidecar from another model is thrown
away rather than believed; a superseded record is not a candidate.

spec.md §9.9 gained the paragraph. It is the section whose own rule is *a partial
lane that looks complete is the §9 defect this whole section exists to avoid* —
and a partial ranking that looks exhaustive is the same defect one layer down.

---

## §5 — the two boundaries in the wrong place, and the cap written four times

§5's verdict on Girsa is *"mostly in the right place, and two are not"*. Both are
real. One of the two is half wrong, and saying so is part of the work: a sweep
that moves things the diagnosis was wrong about is not better than one that never
runs.

### `is_well_formed`, on both sides, with the better one documented as better

`girsa_corpus::segment::SegmentId::is_well_formed` is a character blacklist.
`girsa_ref::Ref::is_well_formed` is the round trip, and says why:

> *defined as the property itself rather than as a list of characters so it
> cannot drift away from what the parser actually does*

The corpus copy **names the ref copy as its counterpart** in its own doc comment,
three paragraphs above the blacklist it kept.

A blacklist is a claim about which characters break the grammar, made once, by
hand, and never rechecked against the parser. The hyphen bug those same
paragraphs document *is* that failure: a character nobody had listed, read as a
separator, `girsa:tur/orach-chayim:240:1` coming back as a range from `orach` to
`chayim:240:1` — a place-shaped thing that is not a place, with no error
anywhere.

So the round trip is the floor here too. The ban sits **on top** of it rather
than instead of it, and both are load-bearing, which is what the new test
demonstrates in one function:

- An id with an **empty ordinal** passes every clause of the ban and prints as
  `girsa:chovot-halevavot/5#`, which does not parse. Not hypothetical:
  `Ordinal` is `Deserialize`, so a `segments.jsonl` with `"ordinal": []` produces
  exactly that, and the blacklist would have called it well-formed and let it
  into the corpus permanently. Ids are permanent from the moment they are
  written.
- A hyphenated section name **round-trips** since girsa-ref 0.2 and is still
  refused, because the character set is deliberately narrower than the grammar —
  every id already minted was minted under the narrow rule.

### The basement, and the two modules the report was wrong about

> `girsa-corpus` has become the workspace basement: 886 lines of
> `argv`/`said`/`roots`/`csv` live in the ingest crate because the ingest crate
> is the one everything can `use`.

*"The one everything can `use`"* is the whole diagnosis, and it is right about
two of the four. `argv.rs` and `said.rs` have no line about a corpus between
them — a `PathBuf`, an `ExitCode` and a `Display` derive is the entire list of
what they name. They are now `girsa-plain`, a crate with one dependency and no
subject, and a test that keeps it that way:

> **the leaf crate stays a leaf** — no dependency of `girsa-plain` may be named
> `girsa-*`.

That test is the actual fix. Moving 612 lines into a new crate buys nothing on
its own; a crate that everything depends on and that *may* depend on anything is
the next basement, and the only thing that stops it is a rule with an assertion
attached.

The other two stay, and the reason is in the new crate's header:

- **`roots.rs`** answers *what makes a directory a corpus*, and the answer is
  `works/index.jsonl`. That is a fact about the corpus format. Its own header
  records that the rule used to live in the Tauri shell, under a README saying
  the shell decides nothing, and was moved **into** `girsa-corpus` for exactly
  this reason. Moving it out to satisfy a line count would undo a fix.
- **`csv.rs`** reads Sefaria's link CSVs, and exists because the fields contain
  the commas. That is ingest, in the ingest crate.

### Four caps of 32, one claim

`girsa_ref::redirect`, `girsa_corpus::store`, `girsa_corpus::standing` and
`girsa_app::shelf` each wrote `MAX_DEPTH = 32`. `standing.rs` named two of the
other three in its own comment — *"the same cap as `SegmentStore` and
`Open::redirected`, for the same reason"* — and then wrote the number out again.
Six lines that are the whole report in miniature.

**Four walks stays right.** They traverse a `Ref` chain, a `SegmentId` table, an
ancestor-and-redirect queue and a position map; one walker forced over all four
would be a worse abstraction than four honest ones. Four *numbers* is not right,
because they are one claim — thirty-two hops is a hand-built loop — and a repo
that changed its mind about that would want to change it once.
`girsa_ref::MAX_REDIRECT_DEPTH`, in the crate that owns redirects.

### And a fence that had never been run

`manifests.rs`'s `one_product_compiles_one_sefer_crates` was **red at HEAD**, and
had been since it was written. Its scan split each line on `=` and asked whether
the left side was a shared crate's name — so `girsa-ref.workspace = true`, which
is how every member crate inherits the pin, fell through silently, while
`app/src-tauri`'s `girsa-ref = { workspace = true }` did not, and the test
asserted that a correctly inherited pin was not a git dependency.

A fence written to answer *"the diagnosis is written down and the sweep never
runs"*, which was itself never run. It reads both spellings now, skips
inheritance in either, and asserts separately that the root's
`[workspace.dependencies]` — the one place a pin can live — has an entry for
every shared crate.

---

## §4 — the wall, and three claims of isolation that were not measured

§4's deletion test came back positive on four crates and the verdicts differ. All
four are answered; two of them are answered by **correcting a comment**, which is
the whole finding.

### The `girsa-fix` / `girsa-note` wall

The wall is right. They are siblings, neither may name the other, and
`since.rs:311` says so. What the report measured is that a wall between two
crates does not stop them needing the same primitive — it only stops them
sharing one:

> a duplicated FNV-1a hash (byte-identical down to a non-standard `0xff`
> separator), a duplicated `"corrections.jsonl"` literal, four
> `now_seconds()`, five identical `From<LogError>`, three identical
> `to_text()`, and one function invented purely to route around the wall

The route around the wall had already been found once, and its own doc comment
carries the rule that made it work — `girsa_note::since`, on why it counts
records rather than naming `Patch`:

> *The answer was never to name `Patch`. **Counting records in a log is a fact
> about the log format**, and the format is `girsa-personal`'s, which both
> crates already depend on — the same argument that already put `is_tombstone`
> there.*

That is the sweep. Everything that passes that test moved to `girsa-personal`,
and `girsa_personal::shared`'s header says nothing else may:

| | where it is now | why it passes the test |
|---|---|---|
| FNV-1a with the `0xff` separator | `girsa_personal::fingerprint` | an id derived from a record's fields |
| `now_seconds`, ×4 | `girsa_personal::now_seconds` | the stamp is part of the log format |
| `"corrections.jsonl"`, ×2 | `girsa_personal::CORRECTIONS` | the name of a file in the personal layer |
| `to_text`, ×3 | a default method on `Store` | *what a jsonl file is* |
| `From<LogError>`, ×5 | `io_from_log_error!` | done in §8.7 |

The hash is the one worth naming. `hash ^= 0xff` between parts is **not** FNV-1a
— it is there so `["ab", "c"]` and `["a", "bc"]` cannot collide, which they must
not, because the parts are a segment id and a span. Two copies agreed on that
non-standard step exactly, which is the tell: two copies of an algorithm agree
until one of them is improved, and these ids are on disk in readers' personal
layers, so an improvement to either would silently stop matching every record
already written. The new test pins the literal digest for that reason.

`girsa_personal::shared` is not a junk drawer and the header is the fence: a
helper that is merely *wanted* by two crates goes where its subject is, or it
stays duplicated, which is the cheaper mistake.

### Two crates whose isolation is zero, and the comments that claimed it

`girsa-export` and `girsa-desk` both come back **`wrong-but-keep`**, and the
correction is the point.

`girsa-export/Cargo.toml` said `zip` was *"the only dependency in the tree that
is here for a file format nobody reads back, **which is the whole argument for
the crate**"*. `girsa-corpus/Cargo.toml` carries the same `zip 7.2.0` — it opens
a .docx you drop on the window, which `girsa-export`'s own header says three
lines further down — and `cargo tree -e normal` puts the crate at one crate over
`girsa-app`: itself.

`girsa-desk`'s header made the same shape of claim about `girsa-ksav` and
`girsa-cite`. `girsa-corpus` pulls `girsa-ksav` anyway, because your own seforim
go on the shelf, and `girsa-cite` is a direct `girsa-app` dependency regardless.

Both crates stay, on the argument that was always the real one: **a boundary can
be worth having without saving a compile.** Writing a file format nobody reads
back is a different subject from reading a shelf. What was wrong was stating a
subject boundary as a build measurement, unmeasured, in a repository whose whole
discipline is that a claim is checked.

### Fifteen documented commands that cannot run

> Thirteen documented commands in `girsa-desk` cannot run — `bin/girsa-notes.rs`
> and `examples/write.rs` all say `cargo run -p girsa-app`, and the targets moved
> crates without their doc comments.

Fifteen, counted. Every one is the first thing a reader would type and every one
fails with *no bin target named `girsa-notes`*. The README had the right crate
in all twenty of its lines — the usual failure runs the other way, and this is
the code's own comments lying while the documentation is right.

The fence reads every `cargo run -p <crate> --bin <name>` and `--example <name>`
in every `.rs` file under `src/` and `examples/` and asserts the target is where
the command says it is. `tests/` is skipped, and that is the same partition the
prohibition suites draw around `lamdan/` and `docs/`: the suite next door exists
to assert that `girsa-link-inbound` has never been a binary in this tree, and it
has to quote the command in order to say so. A rule that forbade naming a defect
would forbid recording it.

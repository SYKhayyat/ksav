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

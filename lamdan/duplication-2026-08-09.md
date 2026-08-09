# One idea, implemented twice — the duplication catalogue

**2026-08-09.** Companion to `three-repos-2026-08-09.md`. Every duplication found in the
whole-repo sweep of `Ksav`, `Girsa` and `sefer-crates`, with both sides quoted, sorted by
what it costs *today* rather than by how ugly it looks.

Three things this document is careful about:

- **A copy is not automatically a fault.** §4 lists five duplications that are *correct*
  and must not be "cleaned up" — including one that is strictly better evidence than the
  generator I would have replaced it with.
- **Every entry names the guard that should have caught it**, because in this project the
  guard usually exists and is scoped one directory too narrowly.
- **The rule was written down first.** This project states the rule against duplication
  more clearly than most codebases ever manage. `Ksav/ksav/engine/src/lib.rs:692` —
  *"nothing else is allowed to build a string literal by hand."*
  `Ksav/ksav/engine/src/facts.rs:20-28` — *"A `#[rustfmt::skip]` is a symptom fence… The
  cause is that a value crossed a language boundary as source text."*
  `Girsa/crates/girsa-search/src/tokenizer.rs:5-13` — *"It contains **no rules about
  Hebrew**… Two implementations of 'what is a word' is the failure mode this arrangement
  exists to make impossible."* The problem is never the rule. It is that the rule is
  enforced at the site that prompted it and nowhere else.

---

## §1 Live divergences — copies that already disagree

Four. Each one is producing different output *right now*, in shipped builds.

### 1.1 What is a Hebrew mark — six copies, two wrong, and the correct one is compiled in and unreachable

`sefer-crates/crates/girsa-hebrew/src/marks.rs:21-36`:

```rust
const MARK_BLOCK: RangeInclusive<char> = '\u{0591}'..='\u{05C7}';
const WORD_BREAKING: [char; 4] = ['\u{05BE}', '\u{05C0}', '\u{05C3}', '\u{05C6}'];
pub fn is_mark(c: char) -> bool { MARK_BLOCK.contains(&c) && !WORD_BREAKING.contains(&c) }
```

with the consequence spelled out at `marks.rs:15-18`: *"Deleting maqaf instead of replacing
it would turn `אֶת־הַשָּׁמַיִם` into the single token `אתהשמים`… That is the exact failure
mode §9.2 exists to prevent."*

`Ksav/ksav/engine/src/spell/hebrew.rs:269-271`:

```rust
fn is_hebrew_mark(c: char) -> bool {
    matches!(c, '\u{0591}'..='\u{05C7}')
}
```

No exclusion. `Ksav/ksav/engine/tools/build_lexicon.py:106` is the same omission in Python
(`NIKUD = re.compile(r"[֑-ׇ]")`, applied before `WORD.findall`), so the two wrong copies
agree with each other and the corpus absorbed the glue as vocabulary.

**What it costs, measured against the shipped release example:**

```
כשכשכשכש-זזזזזז   (ASCII hyphen)   → 2 checkable words, 2 flagged
כשכשכשכש־זזזזזז   (maqaf U+05BE)   → 0 checkable words
```

The speller checks the *wrong* spelling and silently refuses the correct Hebrew typography.
Sof pasuq ends every verse, so **every unpointed pasuk goes unchecked.** And the lexicon
carries the glue as words — `lexicon-he.txt:9625` `אתהשמים`, `:85137` `ואתהארץ`,
`:152595` `יראתהשמים`, plus `אלהאלהים`, `אתהאלהים`, `אלההיכל`, `אחריהצהריים` — 89 entries
match the narrowest signature and the real count is higher. Those are non-words the checker
accepts.

**The correct copy is inside the binary.** `Ksav/ksav/engine/Cargo.lock` resolves
`girsa-hebrew 0.5.1` through `girsa-source` → `girsa-ref` → `girsa-hebrew`; `grep -r
"girsa_hebrew\|girsa_ref" ksav/` returns **zero**. Adding it to `engine/Cargo.toml` is one
line and no new supply chain.

**Copies three, four and five are the same rule again**, and Ksav already wrote the fence
for them — `Ksav/ksav/engine/src/sefarim.rs:256-260`:

> *"This rule exists three times — here, in `ksav.typ`'s `_ix_fold` and in
> `app/src/sefarim.ts`… All three are executed against one corpus by `tests/one_want.rs`;
> edit `tests/fixtures/fold-cases.json`, not one of the three."*

All three test the maqaf **first**, before the points range, each with a comment saying why.
The speller and the lexicon builder are copies four and five, outside that fence, and they
are the two that are wrong.

**Fix:** add `girsa-hebrew`; delete `is_hebrew_mark`, `is_hebrew_letter`, `is_gershayim`,
`is_geresh`, `fold_final` (~40 lines) and re-express them over the shared crate, keeping
Ksav's *placement* decisions (final fold stays scoring-only, or `שלומ` would be accepted);
exclude word-breaking punctuation from `is_part`; add `ד` to `is_prefix_letter` (Ksav's
English side already ships it — `english.rs:174` has `"d"`, and `spell_en.rs:322` asserts
`d'rabbanan` passes); fix `build_lexicon.py` and regenerate; extend `one_want.rs` to cover
the speller, making the oracle cover four implementations instead of three.

### 1.2 Two markup escapers, ten characters against five, both writing the same command

`sefer-crates/crates/girsa-ksav/src/lib.rs:324-336`:

```rust
pub fn escape(s: &str) -> String {
    …
    if matches!(c, '#' | '[' | ']' | '\\' | '$' | '*' | '_' | '<' | '>' | '@') {
```

`Ksav/ksav/app/src/typst-escape.ts:36`:

```ts
export function typstContent(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/([[\]#$])/g, "\\$1");
}
```

Ten characters against five. The five missing ones are all live Typst markup: `*` is strong,
`_` is emph, `<…>` is a label, `@` is a ref. Both functions write
`#מראה_מקום(מקור: …)[…]` from **Girsa's `display` string** — and Sefaria titles contain `*`
and `_`. Same feature, two doors, two documents.

`citation.ts` also cannot write `תווים:` at all, so `girsa-source` 0.5.1's `range` field —
*which characters of the place a quote actually was* — is structurally unreachable from the
editor's own insertion path.

### 1.3 The heading-role table, five copies, two unfenced — and `legalAt` does not know English exists

`spans.ts:312-345` is the authority (`NAMED_HEADINGS`, `GENERIC_HEADINGS`, `FIXED_HEADINGS`,
`NOT_HEADINGS`), and it is fenced against the prelude in **both** directions
(`spans.test.mjs:440-476`). Then:

- `mode.ts:207` — `HEADINGS = ["כותרת","כותרת1","כותרת2","כותרת3","שער","תת_שער","כותרת_בהערה"]`, **unfenced**
- `markdown.ts:32-42` — its own `HEADINGS`, including `שער: 1` where `spans.NOT_HEADINGS` says `שער` is not a heading, with no note saying that is deliberate
- `girsa-ksav/src/read.rs:150-193` — `role()`, a fifth, in another repo
- `ksav-lang.ts:159` — correctly **derived** from `n.role`, and says so at `:161-171`. Not a copy.

`mode.ts:200-204` says these commands *"blank the document rather than reporting anything a
writer could act on."* Run against the built modules:

```
#תוכן inside #כותרת1[…] → refused        #תוכן inside #כותרת4[…] → ALLOWED
#תוכן inside #h1[…]     → ALLOWED        #תוכן inside #hlevel[…] → ALLOWED
#תוכן inside #סימן[…]   → ALLOWED        #תוכן inside #שער[…]    → refused (and שער is NOT a heading)
#toc  inside #h1[…]     → ALLOWED
```

Wrong in both directions: it under-refuses the entire English half of the language, levels
4–6, `#hlevel` and `#סימן`; and it falsely refuses `#שער`.

**And the fence cannot see it.** `emit-insertion-fixtures.mjs:44-53` — all nine caret
contexts are Hebrew documents — and `:95` asks `legalAt(doc, at, c.he)`. The 1,026-document
grid, which caught 384 uncompilable insertions and is the best fence in the repo, **never
asks a single question in English.** That is `note-commands.ts:20-23` verbatim, one layer up:
*"Nothing failed, nothing was logged, and 2,580 tests passed: every one of them asked the
question in Hebrew."*

### 1.4 `to_text()` and `Log::rewrite` disagree on failure, so the export can silently drop a record

`Girsa/crates/girsa-personal/src/log.rs:351` propagates a serialization error.
`girsa-note/src/mark.rs:482` — and identically `query.rs:270`, `collection.rs:327` — is
`if let Ok(line) = serde_json::to_string(mark)`: it **silently drops the record**. So
`girsa_note::export`, the function delivering spec §11's *"everything exportable as plain
files"*, can omit a mark that compaction would have refused to drop — in a codebase that
says *"never a silent gap"* in four separate module notes.

---

## §2 Silent copies — identical today, and the divergence is the next edit

### 2.1 Inside one crate, forty lines from a `use super::*`

`Ksav/ksav/engine/src/lib.rs:692` states the rule and `:695` implements it:

```rust
// nothing else is allowed to build a string literal by hand
format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
```

`Ksav/ksav/engine/src/sefarim.rs:381`:

```rust
format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
```

Byte-identical, same crate, same module tree. Two more copies at `typst-escape.ts:22` and
`girsa-ksav/lib.rs:225`. **Four implementations of "quote a Typst string", one of them
under a comment forbidding itself.**

### 2.2 FNV-1a, twice, agreeing on a separator that is not in the spec

`Girsa/crates/girsa-fix/src/lib.rs:141-152` and `girsa-note/src/mark.rs:77-88` are the same
hash, down to the `hash ^= 0xff` inter-part separator, which FNV does not define. Two
crates independently choosing the same non-standard separator is not convergence; it is a
copy. `mark.rs:52` says so: *"The same rule `girsa-fix` names a patch by, for the same
reason."*

### 2.3 A filename spelled twice, because the crate boundary forbids the call

`girsa-fix/src/lib.rs:336-338`:

```rust
pub fn path_in(personal: &Path) -> PathBuf { personal.join("corrections.jsonl") }
```

`girsa-note/src/since.rs:330`:

```rust
let path = personal.join("corrections.jsonl");
```

`girsa-note` needs to count corrections newer than the index and may not name
`girsa_fix::Patch` — they are siblings. The previous version was worse and both files still
carry it: `since.rs:309-325` and `personal/log.rs:96-108` preserve a `line.split("\"when\"")`
string-surgery parser, with `log.rs:626` as the test proving it was correct *by luck*. The
fix invented `girsa_personal::since` — **a function in a third crate whose only job is to let
the second crate count the first crate's records without naming them.**

### 2.4 One store shape, six times, and the sixth forgot to compact

Six stores across three crates, identical: `log`, an index, `open() -> (Self, Vec<String>)`,
`nowhere()`, `compact()`, `count()`, `all()`, an add, a `remove`. Five write
`impl From<girsa_personal::LogError>` verbatim (`fix/lib.rs:315`, `note/mark.rs:294`,
`note/query.rs:162`, `note/collection.rs:215`, `link/repair.rs:186`). Five call
`Log::bloated`:

```
fix/lib.rs:370          note/query.rs:186
fix/suspect.rs:535      note/collection.rs:239
note/mark.rs:317        link/repair.rs:215
```

`girsa-desk/src/documents.rs:125-134` — written last, in the sixth crate, the one place the
pattern was not already on screen — **does not.** `personal/documents.jsonl` therefore grows
without bound: `remember()` appends on every Ksav save of the same path and `refreshed()`
appends a row per stale document per call, which `citing.rs:80` says runs often. Save one
chaburah two hundred times and two hundred lines hold one document, forever.

That is the argument for `Store<T>`, delivered by the codebase rather than by me. Also
duplicated in the same family: `now_seconds()` four times (`fix/lib.rs:264`,
`note/lib.rs:83`, `desk/documents.rs:234`, `link/repair.rs:681`).

### 2.5 Four redirect walkers, three over the same type

`MAX_DEPTH = 32` and a chain walk at `girsa-corpus/src/store.rs:128`,
`girsa-corpus/src/standing.rs:62`, `girsa-app/src/shelf.rs:1204`, and
`girsa-ref/src/redirect.rs:26`. Three of the four walk `SegmentId`. `standing.rs:59-61`
**names two of the other three** and then declares its own constant. The `girsa-ref` one has
**no caller in any of the three repos** — built early against a real risk, which then
materialised and was answered next door in a different shape.

### 2.6 The better implementation exists, in the other repo, documented as better

`girsa-corpus/src/segment.rs:360-371` — a hand-written character blacklist:

```rust
!work.contains(':') && … !p.contains(['/', ':', '#', '-'])
```

`sefer-crates/crates/girsa-ref/src/reference.rs:126-129`:

```rust
self.to_string().parse::<Self>().as_ref() == Ok(self)
```

and at `:118-125` it names the corpus version as *"the counterpart of Girsa's
`SegmentId::is_well_formed`"* and explains why its own is better: *"defined as the property
itself rather than as a list of characters so it cannot drift away from what the parser
actually does."* The strictly better version exists, is documented as better, and the
blacklist still ships.

### 2.7 The copies that admit themselves in a comment

- **`parse_anchor`, three times** — `girsa-link/src/store.rs:414`, `repair.rs:671` (same six
  lines, renamed), and `examples/why-the-panel-waits.rs:33`, whose comment reads *"Mirrors
  `store::parse_anchor`, which is crate-private."*
- **`Writer`, twice** — `girsa-link/src/store.rs:154-216` and `inbound.rs:189-282`:
  identical fields, identical first-touch-truncate `flush`, identical `buffered_bytes`,
  identical "running it twice" test. `inbound.rs:187-188`: *"The same discipline as
  [`crate::store::Writer`] and for the same reason."*
- **`csv::fields`, verbatim in an example** — `girsa-corpus/examples/measure-resolver.rs:221-258`
  copies `src/csv.rs:16-35` *including its test*, in the same directory as
  `examples/build-lexicon.rs:21-31`, which is a monument to having been caught doing exactly
  this: *"This example carried its own copy — byte-identical, thirty-seven lines — beside a
  doc comment on the original saying not to. The comment was right and the copy was under it."*
- **`disambiguate` / `unique`** — `import/otzaria.rs:196-207` and `import/mine.rs:400-412`,
  the same function ten lines apart in shape, both with the same doc comment about `_` versus
  `-`. The difference is `&[String]` against `&[&str]`.
- **`normalize_into` / `tokenize`** — `girsa-hebrew/src/normalize.rs:56-88` and `:92-142` are
  the same character-classification chain written twice, and `:159`
  (`tokenizing_agrees_with_normalizing`) exists *because* they were duplicated. It works, and
  it is a test standing where a shared function should be.

### 2.8 Ksav's own internal copies

- **`el(tag, className)` twice, byte-identical, both file-private** — `Girsa/app/src/pane.ts:662`
  and `scanview.ts:589`. Ksav exports one from `dom.ts:21` and Girsa's six other views use
  neither.
- **`jump` / `reveal` byte-identical across two backends** — `api.ts:765-779` (`HttpBackend`)
  and `:1036-1050` (`TauriBackend`): same `this.ask`, same `readSpot`/`readPoints`, same
  `catch → null/[]`. In the file whose thesis is that a verbatim copy is how a service dies
  unnoticed, and whose `ServiceClient` already collapsed ten of twelve methods.
- **The Layout cost set, hand-copied** — `COMPILE_TIMEOUT_MS` at `api.ts:912`, `:939`, `:951`,
  `:1028`, exactly `[compile, jump, reveal]`, which `services.rs:473-480` asserts *in Rust*
  is the `Layout` set. Add a fourth and it is bounded on the server, offloaded on the desktop,
  and **unbounded in the browser worker** — one line in Rust, silent on one transport.
- **The Linux apt dependency list, three times** — `linux.Dockerfile:32-45`, `ci.yml:248-252`,
  `release.yml:104-108`. It has already drifted once, and `ci.yml:242-246` records it: *"The
  Docker packaging script already learned this; this file had not."* The CSP got a `build.rs`
  comparator and a test fence for its three copies; the list that decides whether an installer
  builds at all got a comment.
- **Four producers of "the nth Hebrew ordinal", two definitions** — `numbering.ts:91` is
  gematria (with `טו`/`טז`, correctly); `ksav-lang.ts:367` and `read.rs:668` are positional
  22-letter alphabets; `ksav.typ:1966` is a reader. `ksav-lang.ts:376` and `read.rs:662` both
  claim to mirror `enum(numbering: "א.")` and both go positional past the tenth item.
- **`TemplateDef`** — `app/src/api.ts:381-393` is a hand-written field-for-field mirror of
  `templates.rs:26-38`: the fifth table crossing the Rust→TS seam and the only one **not** in
  `facts.gen.json`, so it has none of the protection `facts.rs` was built to give.

### 2.9 Across the two repos — the shell, written twice, incompatibly

| Pair | Duplicated | Evidence |
|---|---|---|
| `Girsa/app/test/harness.mjs` + `run.mjs` **vs** Ksav's | **~90 lines verbatim** | `Girsa/harness.mjs:8-9`: *"It is **deliberately the same four functions** as `Ksav/…/harness.mjs`: two sibling repositories with two different harnesses is one more thing to know than either needs."* The premise is right and the conclusion is backwards — "one too many" concludes *put it in one place*, not *copy it*. And the copy predates four fixes: Ksav reads its module list off disk (Girsa's `run.mjs:26` is a 7-name array, so **7 of 24 modules are testable**); Ksav contains a thrown test (Girsa's bare `await mod.run()` at `:60` kills all files, the bug Ksav hit *twice*); Ksav gates generated artifacts; Ksav uses `fileURLToPath` (Girsa's `run.mjs:14` is the hand-rolled `import.meta.url).pathname` that Ksav's `runner.test.mjs:224` **forbids by name**). |
| `Girsa/app/src/trouble.ts` **vs** `Ksav/…/crash.ts` + `diagnostics.ts` | **~120 lines, four regexes character-identical** | Same type (`export type Doing`), same `DOING: Record<Doing, …>` table, same interface with a near-verbatim doc (*"The developer's string, for the details affordance. Never the message."* / *"The machine's own string, for the details affordance. Never the message."*), same justification with one noun swapped, same `// PostError::NotRunning` comments. Identical: `/could not reach\|timed out\|timeout/i`, `/refused it\b/`, `/permission denied\|access is denied/i`, `/no such file\|os error 2\b/i` at `trouble.ts:133` and `diagnostics.ts:44`. |
| Panel registries | ~300 lines of the same idea | Both are a declarative table plus a derived Escape sweep, both replaced a hand-written `if`-chain, both say so in their headers. Girsa's is a **function** in `main.ts:987`, so two of ten panels (`lanepanel`, `settingsview`) are simply absent from it and Escape does not close them. Ksav's is a module-level frozen array that **throws** when a panel builds a × it did not declare. |
| Readme-number checkers | ~40 lines, three generations | `Girsa/tools/readme-numbers.sh` (markers, `--write`, gated by a Rust test — the better instrument, and **called from nothing**); `Ksav/docfacts.mjs` (declared claims + a regex prose sweep with four documented retreats); `Ksav/run.mjs:177` (a runtime tally, currently red on clean `main`). |
| Key spelling | ~15 lines, incompatibly | `Girsa/keys.ts:37-45` → `"Ctrl+"`/`"Alt+"` + `toUpperCase()`; `Ksav/main.ts:596` → `"Mod-"`/`"Alt-"` + `toLowerCase()`. Same six-line function, two spellings, neither convertible. Girsa's own `keys.ts:15-19` calls its existence *"the shape this project bans everywhere else."* |
| `girsa_post::PostError` | the reason for the above | It is a plain `thiserror` enum with no discriminant exposed, so **both** frontends regex its English `Display`. Girsa already proved the fix on its *own* error type — `trouble.ts:83-92` keys `CODED` on `girsa_app::trouble::Code`, and `trouble.test.mjs:96-105` asserts *"rewording the prose changes nothing a reader sees."* It was never applied to the one error type that crosses the seam. |

---

## §3 The guards, and what each one cannot see

This is the finding under all of the above. There are **three** "one producer" sweeps in this
project. Each is real, each caught something, and each reads only its own repo's `src/`.

| Guard | Forbids | Blind to |
|---|---|---|
| `Girsa/crates/girsa-app/tests/the_rules_this_repository_wrote_down.rs:912-952` — *"The writer both applications compile is `girsa_ksav::to_ksav`. **A second one here would pass a `contains` for years and produce documents that differ.**"* | any `*/src/*` line containing `#ציטוט` or `#מראה_מקום` | `Ksav/ksav/app/src/citation.ts:50`, which is that second writer |
| `Ksav/ksav/app/test/citation.test.mjs:91` — *"there is one producer now, it is this file, and `citation.test.mjs` sweeps `src/` to keep it the only one"* | anyone else in Ksav writing the mekor **call** | that `girsa-ksav` writes the same call with a different escape table; it checks the caller, never the escaping |
| `Ksav/ksav/app/test/notepaths.test.mjs:41` — one producer of note markup | `main.ts` only | `docx.ts:261,304,342,424`, which emits `#הערה[…]`, `#כותרת${level}[…]`, `#רשימה(פריט[…])`, `#טבלה(…)` as string literals, so an imported Word document's footnotes never touch `applyNoteChoice` |

Two more of the same shape:

- `Girsa/app/test/sources.test.mjs:60` — a test literally named *"nowhere in src spells the
  sibling כסב"*, with `names.test.mjs:3-12` explaining that כסב is kaf-samekh-bet, a
  transliteration of the Latin "Ksav" back into Hebrew, and `names.ts:84` existing to hold
  `כְּתָב` because the misspelling had reached six places. It cannot see
  `Ksav/ksav/app/src/i18n.ts:405`: `"חיפוש מקורות פועל כשגרסא פתוחה לצד **כסב** (לא בדפדפן)"`
  — the banned spelling, in the application whose own name it is, in the string that tells
  the reader it needs Girsa. (Ksav also spells the sibling `גִּרְסָא` in `diagnostics.ts` and
  unpointed `גרסא` eight times in `i18n.ts`.)
- `Girsa/app/src/trouble.ts:190` — *"**Every** `textContent = String(e)` in this application
  goes through here."* Sixteen sites do not, because the guard's regex
  (`sources.test.mjs:32`) requires the `String(e)` and the assignment in one expression and
  they are in different functions. One of the sixteen, `main.ts:1214`, is the failure path for
  *send to Ksav* — printing `PostError`'s English into a Hebrew UI, which is the **original
  bug** `presence.ts` and `trouble.ts` both cite as their reason for existing.

**So the rule to adopt is not "don't duplicate."** It is: **a guard that reads `src/` is
scoped to the wrong tree.** Every one of these products has a sibling, and every one of these
guards stops at the repository wall — which is precisely where the two implementations of one
idea live.

---

## §4 Duplications that are correct — do not "fix" these

An anti-duplication sweep that cannot say "this one stays" is a refactor waiting to delete
something load-bearing.

1. **`_ix_fold` in Typst + `sefarim::fold` in Rust.** Forced, not chosen: the Typst copy must
   exist because `#ציון_מקור("ב״ב")` is looked up *inside the document the compiler is
   running*, and the Rust copy must exist because it generates the keys. Two forced
   implementations plus `fixtures/fold-cases.json` and an oracle that asserts **inside the
   compiler** via generated `#assert.eq` (`one_want.rs:96-100`) is the right answer, and
   `one_want.rs:121-149` even guards against a corpus that agrees with a broken
   implementation. I could not improve on it.
2. **`Girsa/app/test/wire.test.mjs` — 59 hand-mirrored interfaces plus a 179-line regex
   comparator.** I wanted to replace this with Ksav's generator and cannot. `wire.test.mjs:26-30`:
   *"a fixture generated from either side would agree with that side by construction and
   prove nothing."* A generated client catches a **stale copy** of a registry, never a
   **wrong** one. Girsa's duplicate is two independent statements that must agree, and it has
   caught real drift. The price is a regex that will break on the first generic.
3. **`keys.test.mjs:73-76`** — *"Both columns are written out by hand on purpose."* Same
   argument, one level down.
4. **`girsa_corpus::store::LineIndexStore`** — a deliberate *wrong* implementation kept as an
   executable counter-example (`store.rs:44-56`, `anchors_survive_editing.rs:207-238`), so
   nobody can "simplify" segment ids back to line numbers with a green suite.
5. **The three tiers of the link graph** — `edges.jsonl`, `inbound.jsonl` (a byte-for-byte
   second copy of every cross-work edge, 575.6 MB) and `touching.bits`. Each is justified by
   a measurement, each is declared rebuildable, and each read path is proven equivalent to
   the slow one — `inbound.rs:697-725`: *"the only thing that licenses a second read path: it
   may be faster and it may not be different."*

Two more that are *proportionate* rather than duplicated, and were checked because they
looked like duplication: `girsa-corpus/src/taxonomy.rs` and `girsa-app/src/taxonomy.rs` share
no table — the app crate imports `shelf_of`/`rank_of` and holds only the personal-layer
overlay, and both module docs state the split. And `girsa-search/src/tokenizer.rs` contains no
Hebrew rules at all; it calls `girsa_hebrew::tokenize`. That is the seam done right, and it is
the model for §1.1.

---

## §5 The fix list

| | Change | Cost |
|---|---|---|
| 1 | **§1.1** — add `girsa-hebrew` (already linked in), delete five tables, fix `is_part`, add `ד`, fix `build_lexicon.py`, regenerate, extend `one_want.rs` to the speller. | Half a day. Removes 89+ non-words and un-blinds the speller on every pasuk. |
| 2 | **§1.3's fence, before its code** — two English contexts in `CONTEXTS`, and `:95` iterates `[c.he, c.en]`. Regenerate; `insertion.rs` names what breaks. Then derive `mode.ts`'s `HEADINGS` from `spans`. | ~20 lines + one regeneration. |
| 3 | **§2.9's `PostError::code()`** — the single best commit in this document if you only do one. It is the only genuine cross-repo duplication, it lives in the only place a shared repo can hold it, and Girsa has already written and tested this exact fix for its own error type. | ~15 lines added, ~60 deleted **on each side**, one rev bump. |
| 4 | **§1.2** — bring `typstContent` up to `girsa_ksav::escape`'s ten characters, and extend `citation.test.mjs` to read the `matches!` line out of `girsa-ksav/src/lib.rs` and assert the two sets are **equal** (the way `enginefacts.test.mjs:60` already reads the prelude). | 2 lines of code, ~20 of fence. |
| 5 | **§2.4's `Store<T>`** in `girsa-personal`, six stores ported. Closes the unbounded `documents.jsonl` as a side effect, and collapses five `From<LogError>`, three `to_text()` (fixing §1.4) and four clocks. | Half a day; ~400 lines out. |
| 6 | **§3** — make the three "one producer" sweeps cross-repo, or accept that they are per-repo and say so in their comments. A guard whose comment says *"every"* and whose scope says *"this directory"* is worse than no guard, because it is read as coverage. | Half a day to seed; will go red immediately. |
| 7 | **The cheap deletions** — `sefarim.rs:381`, `parse_anchor` ×2, one `Writer`, `measure-resolver.rs`'s `fields`, one of `disambiguate`/`unique`, both private `el()`, `jump`/`reveal` onto `ServiceClient`, the apt list generated from one source. | An afternoon, ~400 lines net removed, no format or behaviour change. |
| 8 | **`girsa_ref::RedirectTable`** — 168 lines, zero callers in three repos, superseded by a shipped mechanism. Ask before removing: it is `pub` and cross-repo, and this project's `delete` verdicts have not held before. It is a *finished duplicate*, not an unfinished feature, which is the one case where deletion is not abandonment. | A decision, then an hour. |

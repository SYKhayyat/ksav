# Three repos, one want — a lamdan on Ksav, Girsa, and the seam between them

**2026-08-09.** Scope: `Ksav` (68,335 lines), `Girsa` (92,992), `sefer-crates` (8,754)
— 170,081 lines of `.rs`/`.ts`/`.mjs`/`.typ`/`.css`, swept region by region. Not a bug
hunt. The question is whether these are the right artifacts, in the right shape, with the
right code inside them.

**Coverage.** Fourteen regions, one fresh reader each, every tracked file in exactly one
region. Excluded and named: lockfiles, `prototypes/` (archived mocks), fonts, icons,
lexicon bodies (sampled for size and format), `target/`, `dist/`, and the four generated
artifacts (read as artifacts, not as code). Prose was read only where it makes a claim the
code has to honour — that was the instruction, and it turned out to be where several of
the findings are.

---

## The argument in one paragraph

**This codebase reliably arrives at the correct diagnosis, writes it down better than
almost any repository I have read, fixes the instance in front of it, and then does not
sweep for the siblings.** That is not carelessness and it is not a knowledge problem —
the knowledge is *in the file*, in prose, three lines from the unfixed sibling. It is a
process fact: every fix here is prompted by a report, a report names instances, and
nothing in the three repos turns a named diagnosis into a fence that fails on the next
instance. Six of the fourteen regions found this independently, in code they could not
see each other reading. Everything else in this document is downstream of it, including
every interop finding.

---

## §0 What I committed to before reading, and what killed it

Laddering the want: *"two apps that talk"* → *"I want to quote a sefer in my kuntres"* →
*"I want the sources in what I write to stay alive — clickable, re-printable, re-checkable
against a corrected edition."*

**What I said I would have built:** one Rust workspace, one binary, two windows — Girsa as
a panel inside Ksav. Because every expensive thing in this system exists to cross a
process boundary somebody chose to draw: a schema-versioned wire packet, a token-gated
localhost HTTP listener with its own security model, OS-registered `girsa://`/`ksav://`
schemes, presence detection, exact version pins, a third repository, and cross-repo CI to
make the pins safe. In one binary the packet is a struct, the transport is a function
call, presence is `true`, and the schema version does not exist. The AirDrop metaphor at
`Girsa/spec.md:676` is the tell — AirDrop exists because two devices really *are*
separate. Two windows are not two devices.

**Four things killed it, and I concede them completely. The first is decisive:**

1. **Ksav compiles to WebAssembly and runs in a browser tab. Girsa cannot.** Girsa is a
   3.5 GB corpus, a tantivy index, and a candle model; it will never reach that target.
   `ksav/engine/Cargo.toml:77-79` gates `girsa-post` native-only and `ksav/wasm/` is a
   separate crate with its own lockfile, for exactly this reason. So "one binary, two
   windows" is not on the table: **the packet has to cross a process boundary because on
   the target that matters most, one end of it is not in the address space.** That is not
   a boundary somebody chose for tidiness; it is forced. My central claim is dead.
   *What it does not justify* — and this is the part that matters — is the **third
   repository**, `girsa-cite` living in it, or Ksav compiling a resolver it never calls.
   Those are separate decisions that borrowed this one's argument. See §3 and §4.
2. **The pull errands.** `Girsa/app/src-tauri/src/post.rs:34-46` had already made my
   argument against me and then beaten it: *"Handing a source to Ksav is a push: one
   direction, no reply, and the operating system already owns a channel that does it…
   the reason a loopback port has to earn itself against Ctrl+V. It earns itself on the
   errands above, which are all pulls."* Regenerating forty citations against a corrected
   edition, three of which fail differently, has no clipboard expression. (It is also, as
   §3 shows, not currently being crossed by the errand that justifies it.)
3. **Girsa is not a thin tantivy UI.** I expected the reading half to be a shell over an
   index, on the grounds that Otzaria and Zayit exist. It is corpus alignment across
   re-imports, a 4.18M-edge typed graph, PDF page-to-daf anchoring, a non-mutating
   correction layer, and a measured embedding lane. `girsa-corpus/src/import/continuity.rs`
   alone — patience-diff over unique text anchors, because addresses lie — is not a thing
   a wrapper does.
4. **The semantic lane was measured, not guessed.** I flagged `girsa-lane`'s candle
   dependency as the least-justified thing in the system before reading it. It is the most
   rigorously *reported*: 22 query/target pairs, overlap computed through the literal
   normalizer so the lane cannot take credit for what Torat Emet already does, mean-centring
   tried and rejected *because it made things worse*, and the feature reshaped by the
   numbers (`model.rs:42-126`). It also states its own hole out loud — measured at n=240,
   offered at n=5,000,545 (`model.rs:113-121`). That killed the finding I came for.

What survives of my prior is smaller and sharper, and it is in §4.

---

## §1 The strongest claim — the diagnosis is written down and the sweep never runs

Eighteen instances, from eight regions that could not see each other. Each row is: the
diagnosis, stated in the repo's own prose, and the sibling it was not applied to.

**The one to read first.** `sefer-crates/crates/girsa-hebrew/src/marks.rs:15-36` ships the
correct answer to *what is a Hebrew mark*, and states the consequence of getting it wrong:
*"Deleting maqaf instead of replacing it would turn `אֶת־הַשָּׁמַיִם` into the single token
`אתהשמים`… That is the exact failure mode §9.2 exists to prevent."* That crate is **compiled
into every Ksav binary** — `ksav/engine/Cargo.lock` resolves `girsa-hebrew 0.5.1` through
`girsa-source` → `girsa-ref` → `girsa-hebrew` — and **no line of Ksav references it**
(`grep girsa_hebrew\|girsa_ref` over all of `ksav/`: zero). Meanwhile
`ksav/engine/src/spell/hebrew.rs:269-271` is a wrong copy of that function, and
`tools/build_lexicon.py:106` is the same wrong copy in Python, so
`lexicon-he.txt:85137` ships `ואתהארץ` — the two halves of `ואת־הארץ` glued into a
"word" — and the speller silently refuses to check any word touching maqaf, paseq or sof
pasuq, i.e. **every unpointed pasuk.** The right implementation is linked into the
binary, unreachable, while the wrong copy runs. Nothing in this sweep is a better summary
of the whole document.

| # | The diagnosis, in the repo's words | The sibling it missed |
|---|---|---|
| 1 | `Ksav/ksav/app/src/note-commands.ts:20-23` — *"Nothing failed, nothing was logged, and 2,580 tests passed: **every one of them asked the question in Hebrew**… a hand-maintained array that only one language ever walked."* | `emit-insertion-fixtures.mjs:44-53` — all nine contexts of the 1,026-document grid are Hebrew documents, and `:95` asks `legalAt(doc, at, c.he)`. **The fence for the worst bug this product ever had is blind in the axis the bug came from.** |
| 2 | `Ksav/ksav/engine/src/sefarim.rs:256-260` — *"This rule exists three times… All three are executed against one corpus by `tests/one_want.rs`; edit the fixture, not one of the three."* | Copies **four and five** — `spell/hebrew.rs:269` and `tools/build_lexicon.py:106` — are outside that fence, and both are wrong. Copy **six** is the correct one, in `girsa-hebrew`, compiled in and unreachable (above). |
| 2b | `Girsa/crates/girsa-app/tests/the_rules_this_repository_wrote_down.rs:912-952` — a sweep over every `*/src/*` that fails on any line containing `#מראה_מקום`: *"The writer both applications compile is `girsa_ksav::to_ksav`. **A second one here would pass a `contains` for years and produce documents that differ.**"* | `Ksav/ksav/app/src/citation.ts:50` **is that second writer** — and it is guarded by *its own* one-producer sweep (`citation.ts:25-26`). Two repos, two "one producer" guards, two producers, each sweep blind to the other's tree. And they have already diverged: `girsa_ksav::escape` escapes ten characters (`# [ ] \ $ * _ < > @`), `typst-escape.ts:36` escapes five. A `display` containing `*` or `_` — and Sefaria titles contain both — renders as emphasis through one door and as literal text through the other. |
| 3 | `Girsa/crates/girsa-lane/src/job.rs:113-118` — *"`position` was reading half of it per call… **164 million comparisons** to embed one sefer"* — fixed in `did()` with a binary search. | `job.rs:98-106`, fifteen lines above, `next()` still filters the whole `done` vector, whose unfinished entries are at the back by construction. |
| 4 | `Girsa/crates/girsa-link/src/repair.rs:265-272` — *"building the key first cost 297 ms and 16.3 MB of throwaway string to look up an empty map"* — guarded. | `repair.rs:470`, in the same file, whose own doc says *"`girsa-link-types` asks it two million times"* — no guard. |
| 5 | `Girsa/crates/girsa-search/src/snippet.rs:48-52` congratulates itself for removing *"two walks of the whole segment, per hit, per page of results."* | Two partial walks survive in the same function, `snippet.rs:86` and `:95`. |
| 6 | `Girsa/crates/girsa-corpus/examples/build-lexicon.rs:21-31` — *"This example carried its own copy — byte-identical, thirty-seven lines — beside a doc comment on the original saying not to. The comment was right and the copy was under it."* | `examples/measure-resolver.rs:221-258`, in the same directory, is a verbatim copy of `src/csv.rs:16-35` **including its test**. |
| 7 | `Ksav/ksav/engine/src/diagnostics.rs:296-334` replaced a backwards text scan with a walk of Typst's own syntax tree, and proves the tree gets `#let`-inside-a-string right where no scan can (`:1197-1237`). | **Eight** hand-written source scrapers remain, one of them at runtime in the shipping binary (`diagnostics.rs:555-597`) whose own comment concedes *"Still string-parsing a `.typ` file, which is fragile and worth saying out loud."* The parsed tree is 240 lines away in the same file. |
| 8 | `Ksav/ksav/engine/src/facts.rs:20-28` — *"A `#[rustfmt::skip]` is a symptom fence… The cause is that **a value crossed a language boundary as source text**. So it stops crossing as text."* | Applied to four tables. Nine mirrored sources of truth remain, including `TemplateDef` (`app/src/api.ts:381-393`), the one Rust→TS table with none of `facts.gen.json`'s protection. |
| 9 | `Ksav/ksav/app/test/runner.test.mjs:218-226` — a prohibition, by name: *"nothing hand-rolls a path from `import.meta.url`"*, because `.pathname` percent-encodes and a checkout under `C:\Users\Some One\` dies. | Its scope is `[TEST, TOOLS]` in Ksav only. `Girsa/app/test/run.mjs:14` is that exact expression — in the file that says at `:3-4` *"Same shape as `Ksav/ksav/app/test/run.mjs`, for the same reason it has that shape."* |
| 10 | `Girsa/crates/girsa-personal/src/log.rs:274` + five call sites — `Log::bloated` compaction, with the measured quadratic it replaced (1,000 corrections pushing 500,500 lines). | `girsa-desk/src/documents.rs:125-134`, the sixth store, written last, in the sixth crate, does not compact. `personal/documents.jsonl` grows without bound on every save. |
| 11 | `Girsa/crates/girsa-corpus/src/import/mod.rs:488-517` — `taken`, the set that exists *"so no name is ever handed to different words."* | `mod.rs:383` mints cut children with `id.split(pieces.len())` and never consults it. Change `best_cut`'s boundary preference and `#32.2` silently names different words, no redirect row. |
| 12 | `Ksav/ksav/engine/src/lib.rs:692` — *"nothing else is allowed to build a string literal by hand."* | `sefarim.rs:381`, in the same crate, forty lines from a `use super::*`, is a byte-identical copy. Two more in `typst-escape.ts:22` and `girsa-ksav/lib.rs:225`. |
| 13 | `Girsa/.github/workflows/ci.yml:16-24` — *"The checkout below used to have no `ref:` at all, which undid the pin entirely… **Three of this repository's eleven CI runs died on it**… 27% of CI history red because a different repository's default branch had not caught up."* | **`ci.yml:56-59`, forty lines below, checks out `SYKhayyat/ksav` with no `ref:`.** Same file, same page, same defect, and `check-ksav-fixture.sh` then diffs Girsa's packet against whatever Ksav `main` is at that second — so a Ksav commit turns Girsa's CI red. This is the purest instance in the sweep. |
| 14 | `Girsa/app/test/sources.test.mjs:60` — a test literally named *"nowhere in src spells the sibling כסב"*, with `names.test.mjs:3-12` explaining that כסב is kaf-samekh-bet, a transliteration of the Latin "Ksav" back into Hebrew, i.e. wrong; `names.ts:84` exists to hold `כְּתָב` because the misspelling had reached six places. | `Ksav/ksav/app/src/i18n.ts:405` — `"חיפוש מקורות פועל כשגרסא פתוחה לצד **כסב**"`. The banned transliteration, in the application whose own name it is, in the string that tells the reader it needs Girsa. Girsa also gets spelled two ways in Ksav (`גִּרְסָא` in `diagnostics.ts`, unpointed `גרסא` eight times in `i18n.ts`). Neither repo's guard can read the other's `src/`. |
| 15 | `Girsa/app/src/trouble.ts:83-92` replaced regexes over its *own* prose with a `CODED` table keyed on `girsa_app::trouble::Code`, and `trouble.test.mjs:96-105` asserts *"rewording the prose changes nothing a reader sees."* | It was never applied to `girsa_post::PostError` — the one error type that crosses the seam. **Both** frontends regex its English `Display`, with four character-identical regexes (`/could not reach\|timed out\|timeout/i`, `/refused it\b/`, `/permission denied\|access is denied/i`, `/no such file\|os error 2\b/i`) at `Girsa/trouble.ts:133` and `Ksav/diagnostics.ts:44`. |

| 16 | `Girsa/app/src/trouble.ts:190` — *"**Every** `textContent = String(e)` in this application goes through here."* | Sixteen sites do not: nine in `main.ts` (`:836,:856,:867,:914,:1163,:1214,:1272,:1294,:1311`) and seven in `laneview.ts` routing to a private `this.progress.textContent = why` (`:485`). The guard at `sources.test.mjs:32` requires the `String(e)` and the assignment in one expression; they are in different functions. `main.ts:1214` is the failure path for *send to Ksav*, printing `PostError`'s English into a Hebrew UI — **the original bug that `presence.ts` and `trouble.ts` both cite as their reason for existing.** |
| 17 | `Girsa/crates/girsa-app/tests/the_numbers_in_the_readme_are_measurements.rs:202` — `every_measurement_is_claimed_somewhere`, whose subject is the reverse direction: *"a measurement nobody cites is a check that runs, passes, and guards nothing."* | Forty lines away, `the_documentation_names_things_that_exist.rs:148-165` runs docs→bins only, so a binary no document names passes. `girsa-read` and `girsa-companions` have never been seen by it — and `linksview.ts:134` tells the reader, in Hebrew, *"הרץ girsa-companions"*: a reading application instructing its reader to go run a cargo binary. |

**Steelman.** Every one of these is a fix that was correct, landed under a deadline, and
prompted by a finding that named one site. A sweep costs time that the next feature also
wants, and a repo that stopped to generalise every fix would have shipped a quarter of
this. Further: three of the twelve (#3, #4, #5) are performance, and premature
generalisation of a hot-path fix is its own failure. And **the writing-down is not the
problem — it is the reason this document was possible at all.** Almost every finding here
was handed to me by a comment.

**It does not hold, for one reason.** The prose does not merely explain the fix — in nine
of the twelve it explains the *class*, in general terms, correctly. #1 says "a
hand-maintained array that only one language ever walked." #8 says "a value crossed a
language boundary as source text." Those are class statements. A repo that can name the
class and does not sweep it is not out of time; it is missing the step where a named class
becomes an executable prohibition. Ksav *invented* that step —
`runner.test.mjs:199-278`'s prohibition sweeps are exactly it — and then scoped it to two
directories of one app.

**Verdict: `rewrite` the process, not a module.**

**The change (first commit).** A `prohibitions` suite that is (a) repo-wide, not
directory-wide, (b) present in all three repos, and (c) the mandatory second half of every
future fix: when a finding names a class, the commit adds the sweep. Seed it with the nine
class statements above, each as one assertion. Ksav already has the machinery
(`runner.test.mjs`), Girsa needs 30 lines, sefer-crates needs one file.

**The cost.** Half a day to seed, and roughly one extra hour per future fix. The nine
seeded sweeps will go red immediately — that is the point, and it is the cheapest way to
find instances thirteen through thirty.

---

## §2 The second claim — producers built, consumers absent, and a comment asserting the feature works

The same shape, ten times: the type, the security model, the persistence and the doc
comment all exist; the caller does not. This is the inverse of the failure family this
repo already knows itself for (*working engine, lying UI*): here the engine works, the UI
is absent, and the comment is the lie.

| What was built | What reads it |
|---|---|
| `girsa_source::CLIPBOARD_MIME` — a real native clipboard format, with `clipboard-rs` pulled in specifically because *"a webview cannot do that"* and an 86-line module arguing it (`Girsa/app/src-tauri/src/clipboard.rs:1-22`). spec §10.2's headline UX. | **Nothing.** Zero references in Ksav — no `getData`, no paste handler, no clipboard plugin in `src-tauri/Cargo.toml`. Girsa's careful three-flavour Ctrl+C lands in an application that only ever reads `text/plain`. |
| `POST /refresh` — named at `Girsa/app/src-tauri/src/post.rs:43` as the errand that *"is the clearest of them"*, the one the loopback earns itself on, and at `Ksav/ksav/README.md:719-721` as *"the errand that pays for the loopback."* | `services.gen.ts:12` and `:39` — the generated type union and the generated table. **No caller in `app/src`.** The service that justifies the process boundary has no UI. |
| `POST /cite`, `POST /quote`, `POST /open` on Girsa's desk (`post.rs:121-123`) | Nothing, in either repo. Ksav calls 4 of Girsa's 8 errands (`/where-from`, `/search`, `/linkify`, `/refresh`). |
| `POST /document` on Girsa's desk — *"I have saved a document here — so where did I use this is true (§10.4)"*, with the query implemented and tested (`girsa-desk/src/citing.rs:406`) | Nothing. Ksav never sends it. §10.4's *"where did I use this"* has a receiver, a store and a test, and no sender. |
| `Segment.anchors` — 43,883 span anchors per sefer, mined at ingest, rebased across segment splits, persisted (`girsa-corpus/src/import/mod.rs:143-150`), and described there as spec §8.4's span anchoring | Nothing. Meanwhile `girsa-app/src/spans.rs:6` — the *other* implementation of §8.4 — opens with *"**Nothing in the shipped data says which words**"* and re-derives an approximation by string-matching, only when the far sefer is already open. Two files, one spec section, one saying the datum exists and one saying it does not. |
| `girsa_ref::RedirectTable` — 168 lines and 5 tests, `pub use`d at `girsa-ref/src/lib.rs:52` | Nothing, in any of the three repos. Built early against a real risk; the risk materialised; the answer that shipped was `redirects.jsonl` + `Standing`. |
| `girsa_corpus::store::{SegmentStore, LineIndexStore, Anchors}` (333 lines) | Only `girsa-corpus`'s own tests — **including the flagship §3 test**, whose helper comment (`a_reimport_keeps_every_name.rs:110-113`) claims to resolve *"live first, then ancestry, then the redirect table. What a link, a correction or a Ksav citation goes through."* It resolves through explicit redirect rows only. The certifying test does not exercise the path the window uses. |
| `girsa-lane/src/bring.rs` — 356 lines of resumable-Range HTTP model download | A button a fresh install cannot see. (`bring.rs:1-22` records this verdict and declines to act because the decision isn't the author's — which is the right handling.) |
| `Girsa/tools/readme-numbers.sh` — the `--write` fixer for the marked-number gate, and the better of the three readme-number instruments in this project | Called from nothing. Grep over `*.yml`, `*.sh`, `*.md`, `*.toml` returns only its own usage comment. |
| `girsa-ref` + `girsa-hebrew` — 3,320 lines and a 3.56 MB `sefaria.tsv`, compiled into every Ksav binary | No Ksav line calls either. They are in the graph solely because `girsa-source/src/lib.rs:53` does `pub use girsa_ref::Ref`. See §1's lead — this is not merely waste, it is the *correct* implementation of a function Ksav ships a broken copy of. |
| The WASM build — `ksav/wasm`, `WasmBackend` (~145 lines), `deploy.yml` (155), `wasm-smoke.mjs` (133) | No front door: the root README offers installers only, `docs/start-here.md` names no URL, and `ksav/README.md:278` says *"deploy the built files to any static host"* — i.e. the reader's. |
| `ksav serve` — 833 lines, counted as one of four delivery targets (`README.md:688`) | Zero installers (`release.yml:141` bundles `src-tauri` only). Its spec-level customer is `Girsa/spec.md:718` — *"`ksav serve` already runs as a local HTTP server hosting the editor SPA, so the embedded option is cheap"* — and Girsa never embeds it. `Girsa/app/src-tauri/src/lib.rs:2178` implements *"open the real Ksav editor here"* as a `/document` POST to the separate app. |

Two of these are worse than dead code, because a *test* stands where a consumer should:

- `Ksav/ksav/app/test/services.test.mjs:166-172` wraps the Girsa rows in a `try/catch`
  with a comment saying they throw in the browser build. They do not — `sourcesOf`
  duck-types `typeof s.inbox === "function"` and `inbox` is defined on the shared
  `ServiceClient` base class, so the browser build claims a Girsa half it cannot have,
  the `catch` is dead, and nothing asserts absence.
- `girsa-desk/src/documents.rs:262-269` builds its fixture as
  `#מקור:("{r}")[]` — **not a Ksav command**. It passes only because `cited_in` scans for
  the literal substring `מקור:`. All six of the registry's tests are green over markup
  Ksav cannot emit and Typst cannot compile, in the one crate whose thesis is *no second
  markup writer*.

**Steelman, and it partly holds.** Building the engine half before the panel is correct
order — a panel with no service behind it is worse. `bring.rs` is *correctly* left alone.
`ksav serve` is genuinely the only place CI can drive the assembled product
(`acceptance.mjs`), which is the most valuable test in Ksav. And the standing rule in this
project is *build, don't delete*: a dead feature is unfinished, not unwanted.

**Where it fails:** the docs and the comments state these as *done*. `README.md:688`
counts four delivery targets and there are two. `sending.rs:130` states a compile-time
guarantee that does not exist (§3c). `spans.rs:6` states that data does not exist while
the file that produces it says how much of it there is. The half-built loop is the
project's own choice and it is fine; **the claim that it is whole is the finding.**

**Verdict: `wrong-but-keep` on all ten — build the callers.** `delete` on exactly one
thing: the *claims*.

**The change, ranked by what it unblocks:**
1. Ksav reads `application/x-girsa-source+json` on paste. ~30 lines behind the Tauri
   clipboard plugin, and it makes spec §10.2's stated UX true.
2. A Refresh panel in Ksav calling the `refresh` service. A day, and it makes the process
   boundary earn itself for the first time.
3. Ksav POSTs `/document` on save when Girsa is live. ~20 lines, and it turns on *where
   did I use this*, which is already built on the other side.
4. `girsa-app/src/links.rs:230` reads `Segment.anchors` for the single-resolution case.
   ~80 lines, and §8.4 starts working on the 92% of Shulchan Arukh segments that carry an
   anchor instead of on the subset where the commentary happens to be open.
5. Correct four claims: `README.md:688`, `sending.rs:130`, `spans.rs:6`,
   `a_reimport_keeps_every_name.rs:110`.

---

## §3 The interop — the seam is one-ended in both directions, and its safety net is off

### 3a Three transports, and the cheapest one has no receiver

| Transport | Girsa end | Ksav end |
|---|---|---|
| Layered clipboard, `application/x-girsa-source+json` | built, argued, 86 lines | **absent** |
| HTTP loopback (`girsa-post`, 1,435 lines) | 8 errands | 2 errands answered, 4 called |
| `ksav://insert` / `girsa://open` deep links (`girsa-post/src/link.rs`, 322 lines) | built | built |

The seam is ~3,525 lines across three repos. The push case — which the OS already
solves, and which `post.rs:36-40` concedes belongs to the clipboard — has a producer and
no consumer. The pull case, which genuinely justifies HTTP, has a server on both ends and
no UI caller for the errand that justifies it.

### 3b `girsa-cite`: the load-bearing claim, at the seam, is false

`sefer-crates/README.md` leads with it: *"one citation formatter compiled into both means
the app that produces citations and the app that prints them cannot disagree — precisely
the class of bug that would destroy trust in the pairing."* `Girsa/spec.md:806` repeats it.
And `Girsa/crates/girsa-app/src/sending.rs:129-130`, at the exact function where the two
vocabularies meet, says: *"Everything past here is `girsa_cite`, **compiled into Ksav as
well**, so the app that produces a citation and the app that prints it cannot disagree."*

Ksav's three manifests name `girsa-source`, `girsa-ksav`, `girsa-post`. There is no
`girsa-cite`, anywhere, at any depth. Ksav never formats a citation — it prints
`packet.display`, a string Girsa already formatted, and asks `/cite` for a re-print. Except
nothing calls `/cite` (§2).

Checked exhaustively: `citation.ts:47` interpolates `place.display`; `engine/src/source.rs`
delegates wholly to `girsa_ksav::to_ksav`; and `ksav.typ:1912-1929` — `מראה_מקומות`, the
source-index printer — dedupes by `str(m.ref)` into a dictionary and prints `m.printed`,
**with no sort, no parse of `girsa:`, and no numeral conversion.** There is no third
implementation. Re-styling is a wire errand (`post.rs:415-429` sends `/refresh` with an
optional `style`).

So the guarantee is real, and **its mechanism is better than the one the README claims**:
not *both apps compile one formatter*, but *Ksav has no formatter at all and asks.* That is
strictly stronger — a formatter Ksav cannot reach cannot disagree. And it means the
sentence in three places is describing the wrong thing, while `girsa-cite` sits in the
shared repo with one consumer, paying the full three-repo tax for nothing.

**Verdict: `wrong-but-keep` the crate (moving it now costs a version bump for zero gain);
`rewrite` the three claims.** By contrast `girsa-ksav` genuinely earns the shared repo —
`to_ksav`, `mekor`, `live_citation`, `cited_in`, `refs_in` are all called from both sides,
and `girsa-desk/src/buffer.rs:279-282` asserts *equality* against it rather than
`contains`, with the reason stated at `:266-269`. That is what a shared contract looks like
when it works.

### 3c `check-dependents.sh` does not build Ksav against the working tree

`sefer-crates/README.md` names three things that pay for the three-repo split and says
*"none of them are optional."* Number 2 is `tools/check-dependents.sh`, whose header
reads *"Build every application that compiles these crates, **against the working
tree**"*, and whose CI comment reads *"The dependents resolve `path =
"../sefer-crates/crates/..."`, so the three checkouts must sit side by side exactly as
they do on a desk."*

Ksav does not. Since 2026-08-06 it depends on the shared crates by
`git + rev = c8edeaa…`. `cargo build --manifest-path Ksav/ksav/engine/Cargo.toml` fetches
the pinned commit from GitHub and the sibling checkout has no bearing on it — and the CI
job's cwd is the parent directory, so no `.cargo/config.toml` intervenes.

**The cross-repo safety net is 2/3 live.** Girsa's compile is checked against the proposed
change; the packet-fixture gate is checked (and is the one cross-repo instrument in this
project built properly — `check-ksav-fixture.sh` has a `--write` fixer and fails loudly
rather than skipping when the fixture is missing); **Ksav's compile is checked against the
last published commit and will report green through any breaking change to
`girsa-source`, `girsa-ksav` or `girsa-post`.**

Verified from the lockfile, not inferred: `ksav/engine/Cargo.lock:661-703` resolves all
five girsa crates as `source = "git+…?rev=c8edeaa…"`, `Ksav/.cargo/config.toml` does not
exist (only the `.example`, and the real one is gitignored by construction), and CI checks
Ksav out fresh from GitHub. Rename a public item in `girsa-hebrew`, run the script, and
Ksav goes green — because it is not building your change. The README's own demonstration
(`README.md:316-318`, *"rename a public item in `girsa-hebrew` and run it"*) only ever
proved Girsa.

The script guards **loudly** against a *missing* checkout — `check-dependents.sh:72-76`:
*"a silently skipped dependent is a check that passes by not running — the failure mode
this script exists to prevent."* It has no guard against a checkout that exists and does
not point back. It is that exact failure mode, in that exact shape, named in that exact
file.

And the two repos now hold **test-enforced contradictory policies**:
`Ksav/ksav/engine/tests/manifests.rs:178` fails the build on a `path =` dependency, and
sefer-crates' CI needs the thing Ksav's suite forbids.

**Verdict: `rewrite`.** **The change:** `check-dependents.sh` copies
`Ksav/.cargo/config.toml.example` into `$siblings/Ksav/.cargo/config.toml` before building
Ksav and removes it after — the `paths` override already exists, is documented at length,
and was chosen over `[patch]` for a good measured reason (it leaves `Cargo.lock`
byte-identical). **Then assert via `cargo metadata` that the override took** — that the
girsa crates resolve to a `path` source and not `git+`. Without that assertion the fix is
the same class of claim as the bug. Also delete `check-dependents.sh:25-26`, which still
says *"Ksav is listed but not yet wired: it gains its `girsa-source` dependency in W4"* —
W4 landed five releases ago. **Cost: ~20 lines of shell.** This is the highest-value hour
in the interop half of the system.

### 3d Girsa still has the disease Ksav cured, plus the workaround

`Ksav/ksav/engine/Cargo.toml:47-82` is a 35-line diagnosis of path-dependencies-to-a-sibling:
`git clone ksav && cargo build` failed at `cargo metadata`, before a compiler ran, naming a
directory the reader had never heard of, with no page in the repo saying so; four of five
CI jobs carried a second `actions/checkout` *"which is what a load-bearing workaround looks
like"*; and `packaging/build-linux.sh` could not have produced an installer at all.
`Ksav/ksav/engine/tests/manifests.rs:173-178` now fences it with an assertion message
telling you a path dependency means *"the repository could not build itself. Depend on it
by git and rev instead"*, plus checks that every rev agrees and is a full 40-character SHA.

`Girsa/Cargo.toml:105-110` is six path dependencies to `../sefer-crates`. `Girsa/Cargo.toml:104`
concedes it: *"until then the checkout must be present."* `Girsa/.github/workflows/ci.yml:44-53`
is the load-bearing workaround, and its own comment records the bill: *"**Three of this
repository's eleven CI runs died on it**, fifteen seconds in… 27% of CI history red because
a different repository's default branch had not caught up."* The fix for that was to pin
`SEFER_CRATES_REF` in CI — so Girsa's pin now exists in two unrelated places
(`Cargo.toml`'s `=0.5.1` and CI's SHA), with **nothing tying them together**, and locally
in *no* place at all, because a path dependency always wins over its version. Girsa has no
`manifests.rs`.

Same author, same seam, same fortnight. Ksav diagnosed it, fixed it, documented it in
three files, and fenced it. Girsa carries the disease and the workaround. This is §1,
across a repo boundary.

**Verdict: `rewrite`.** **The change:** Girsa adopts Ksav's arrangement verbatim — git+rev
in `Cargo.toml`, `.cargo/config.toml.example` with a `paths` override for paired work,
`SEFER_CRATES_REF` deleted, and Ksav's `manifests.rs` copied across. **The cost:** one
commit; the CI file gets shorter, not longer; and `git clone girsa && cargo build` starts
working, which it does not today.

### 3d′ Presence: spec §10.6 is false in one direction, and that direction is the healthy one

`Girsa/spec.md:759` — *"each app shows whether its sibling is live, so the affordance is
never offered when it would fail."* Girsa implements it: `presence.ts`, three states, and a
`setInterval` polling `api.ksavPresence()` every 5,000 ms for the life of the window.
**Ksav implements nothing.** No poller, no `girsaPresence`. It does a *capability* check —
`sourcesOf(runtime.backend)` — which only answers "is this the native build", so with Girsa
installed but shut the call goes out, fails, and lands in `troubleSaid(e, "reach_girsa")` →
*"גִּרְסָא אינה פועלת — פתחו אותה ונסו שוב"*. **It works, and nobody noticed the asymmetry.**

So the deletion test on presence has already been run, by the other half of the product.
What survives is exactly one of the three states: `Stale` — the endpoint file outlived the
listener — which is a real fact `girsa-post` computes and no error string can reconstruct.
`presence.ts:19-21` is right that collapsing it away *"throws away the only one of the three
that is actionable."* What does not survive is **polling** to decide whether to draw a
button. **Verdict: `wrong-but-keep` the function, `delete` the interval** — check on demand
at the moment of a send, plus once at boot for the chip. ~15 lines, and it removes an IPC
round-trip every five seconds forever.

### 3e What one new packet field costs

One optional field on `SourcePacket`, today: **19 places spell the version or rev** — 8 in
sefer-crates, 6 path pins plus 1 CI SHA in Girsa, 4 revs in Ksav — plus **5 lockfiles**,
across 3 repositories, with `tests/manifests.rs` fencing 4 of the 19 and nothing fencing
the rest. `girsa-source` 0.5.1 shipped exactly such a field (`SourcePacket::range`) and the
sefer-crates changelog is honest that it needed no schema bump, which is the right design.
The cost is entirely in the repository split, not in the type.

---

## §4 Lens 1 — was this the right software?

**On the two-app split: I lose outright, on WASM.** §0 records it.

**On the third repository: `don't-build`, as three.** This is a separate decision that
borrowed the WASM argument, and it does not survive its own numbers.

- The stated cost of a monorepo is that Ksav would drag Girsa's tree. Measured:
  `Girsa/.git` is **5.0 MB** — *smaller than Ksav's own 10 MB*. Meanwhile Ksav downloads
  sefer-crates' 3.56 MB `sefaria.tsv`, which is `include_str!`'d only in a
  `girsa-ref` test and which no Ksav code path can reach. The argument does not survive `du`.
- Per-crate deletion test: **two of six earn a shared boundary.** `girsa-post` earns it
  outright — both ends must agree byte-for-byte on the token header, the endpoint file and
  the 411/413/405 refusals, and two implementations of a wire protocol drift.
  `girsa-source` earns it weakly (a struct with eight fields and a version check).
  `girsa-cite` has one consumer. `girsa-ref` and `girsa-hebrew` have one *reachable*
  consumer. `girsa-ksav` is 80% a Girsa crate that happens to know Ksav's grammar — of its
  public surface Ksav's production code calls **two** items, while Girsa calls seven, and
  its largest file (`read.rs`, 954 lines) exists so *Girsa* can shelve your own seforim.
- **What should have existed instead:** one repository, one cargo workspace, with
  `sefer-post` and `sefer-source` as crates inside it, and Ksav depending on that repo by
  `git + rev`. Same pin discipline, same fresh-clone property, same standalone
  releasability — and `check-dependents.sh` becomes `cargo test --workspace` for the Girsa
  half plus one rev bump for the Ksav half, which is a thing that can actually run.
- I considered keeping the split and paying the CI cost properly. It loses because **the
  cost has been unpaid for five releases and nobody noticed** (§3c) — which is evidence
  about what this arrangement is like to maintain, not about anybody's diligence.
- **The cost:** this is not a first commit. It is the shape to move toward, and items 3, 4
  and the `girsa-cite`/`girsa-source` moves below are the steps that make it cheap, because
  they leave exactly two shared crates and one of them is 503 lines.

**Deletion tests that came back positive, with the isolation argument measured rather than
asserted** (`cargo tree -e normal`; `girsa-app` = 88 crates):

| Crate | Adds over `girsa-app` | Its stated reason | Verdict |
|---|---|---|---|
| `girsa-export` | **1 — itself** | *"zip… is the only dependency here for a file format nobody reads back, **which is the whole argument for the crate**"* | `girsa-corpus/Cargo.toml:31` already carries the same `zip 7.2.0`. Zero isolation. `wrong-but-keep`, correct the comment. |
| `girsa-desk` | **1 — itself** | *"girsa-app's manifest had girsa-ksav and girsa-cite in it because of these three files"* | `girsa-corpus` already pulls `girsa-ksav`; `girsa-cite` is a direct `girsa-app` dep regardless. The split moved a manifest edge, not a compile. `wrong-but-keep`. |
| `girsa-fix`, `girsa-note` | **0 each** | siblings that may not name each other | The wall costs a duplicated FNV-1a hash (`fix/lib.rs:141` / `note/mark.rs:77`, byte-identical down to a non-standard `0xff` separator), a duplicated `"corrections.jsonl"` literal, four `now_seconds()`, five identical `From<LogError>`, three identical `to_text()`, and one function invented purely to route around the wall. **`rewrite`.** |
| `girsa-mcp` | **168** — tantivy, candle, safetensors, rayon | isolation | Earns it outright. `keep`. |
| `girsa-personal` | 14-crate leaf vs `girsa-corpus`'s 79 | *"knows about jsonl and nothing else"* | Thin, and real. `keep`. |

Thirteen documented commands in `girsa-desk` cannot run — `bin/girsa-notes.rs:6-20` and
`examples/write.rs:4` all say `cargo run -p girsa-app`, and the targets moved crates without
their doc comments. That is what a mechanical split looks like from outside.

**Also positive:** `readme.test.mjs` (77 lines, 45 assertions) — already convicted in prose
by the file that replaced it (`documentation.test.mjs:5-8`: *"which is how nineteen false
claims survived forty-five green assertions"*) and left running. `delete`.

**Lens 1 holds, and here is what I rejected, region by region, rather than asserting it:**
The Typst seam is the strongest artifact decision in the three repos — Hebrew commands as
real `#let`s with the prelude as a resolved `FileId`; I designed a Ksav AST with a Typst
code generator and it loses on unbounded nesting and on owning the markup/code-mode
boundary twice. The corpus's dotted-ordinal segment id beats both content-addressing (moves
when text is corrected, unmooring every note) and SQLite sequential ids (two machines
disagree). The hand-rolled speller beats hunspell/zspell because `.aff`/`.dic` cannot carry
a per-word corpus frequency band, and the bands are worth 20.2% → 55.2% top-1 — measured,
rerunnable, and re-measured during this sweep. `girsa-scan` beats a `page_offset: i32`
column, and proves it with a test that snapshots 80 pages and asserts 1–42 are
byte-identical after an anchor is inserted at 45.

---

## §5 Lens 2 — architecture

**Two apps, three weeks apart, same author, same shell problem — and the solutions are
opposites, not copies.** Girsa's Tauri shell is **3,769 lines and 100 named
`#[tauri::command]`s**, mirrored by ~130 hand-written client wrappers and 59 hand-written
`export interface`s held against Rust by a 179-line regex parser (`wire.test.mjs`). Ksav's
shell is **423 lines and one command** — `ksav_call(name, input)`, dispatched off
`services::find(&name)`, with the client half *generated*. Girsa also owns its key table
and its language in Rust; Ksav owns both in TypeScript, with a 6-line `eventToKey` that
spells modifiers `"Mod-"`/`"Alt-"` where Girsa's spells them `"Ctrl+"`/`"Alt+"` — neither
convertible to the other. Roughly 5% of the frontend is *duplicated* (~600 of ~12,500
lines, of which `trouble.ts` vs `crash.ts`+`diagnostics.ts` is ~120 with four
character-identical regexes). The number that matters is the other one: **~2,000 lines of
divergence**, where the same problem was solved incompatibly. A shared TypeScript package is
the wrong fix — every overlapping part has diverged for a reason that is correct on its own
side, and `@sefer/ui` would have to pick one repo's registry, one repo's key ownership, one
repo's error vocabulary. The right fix is three small moves into the repo that already
exists for this: `PostError::code()`, `App::he()`, and Girsa taking Ksav's `run.mjs`.

**The expensive boundary inside Ksav is not the one I came for.** It is Rust ↔ TypeScript ↔
Typst *inside one product*: three languages, **thirteen** mirrored sources of truth, four
generated artifacts, two code generators, and eight hand-written source scrapers holding
the rest together. `facts.rs` exists solely because a value crossed a language boundary as
text. Collapsing Ksav and Girsa into one binary would remove none of it. That is the
correction to my prior that matters most.

**`main.ts`: the decomposition did not land, and the measurement is in the commit message.**

```
2026-07-02    621     2026-07-21  2,564     2026-08-06  5,644
2026-07-02  1,305     2026-07-28  3,114     HEAD        6,036
```

Monotonic, and it grew 392 lines *after* the decomposition waves began. The two extraction
commits: `8f7962e` added 528 lines of `panels.ts` for **−18** net in `main.ts`, and said so
in its own message — *"−18 lines, not the −250 the finding predicted."* `9b21ba7` added 610
lines of `header.ts` + `panelrows.ts` for **−31**. **1,138 new lines of module bought 49
lines out of the god-file**, because what left were *decisions* and what stayed was every
*effect* plus the tables naming them. The gain is real (`header.chips()` is now testable and
`tsc` catches 2 of the 5 sites a new chip touches). It is not decomposition, and features
of 250+ lines each are still being written into `main.ts` after the waves.

The god-file's own framework is `rerenderChrome` — a diff-free whole-subtree rebuild fired
from **33 call sites**, including adding a dictionary word. I wanted this as a headline and
could not beat it: `panels.ts:438-457` and `main.ts:1901-1912` both record that a
built-once menu freezes the data it was built from, and the Insert menu's greying therefore
*never appeared*. In a chrome where every label is translated and every item is a live
predicate over the caret, rebuild-from-state is the only arrangement in which the surface
cannot lie, and lying surfaces are this project's entire bug family. The honest critique is
three lines: skip the settings-drawer half when the drawer is closed.

**State that can disagree with itself** — the shape my prior expected and found in the
wrong place:

- `runtime.lastResult` and `preview.current` are two records of *the pages on screen*. On a
  failed compile the engine returns `pages_svg: []`, `compile.ts:118` stores it
  unconditionally, and `compile.ts:121` skips the redraw — so the preview shows the last
  good page and **Print produces a blank sheet**, silently, on the one route that is paper.
- `save.unsavedToFile` is one global boolean for a library of documents;
  `watch.known` is a `Map` keyed by id, twelve lines away in another module. `openDoc`
  clears the flag, so switching documents and back loses the dot and skips the autosave.
- `Settings extends DocConfig`, so all 30 page fields exist twice and the reader that
  chooses between them has 26 dead branches and 4 live contradictions — the settings panel
  can print a margin the document is not set on.
- `ACTIONS` is computed at module load and includes saved macros, so a macro recorded this
  session is denied by Settings and the palette while **Help lists it**, because `help.ts`
  re-parses at render time.

**Girsa's boundaries are mostly in the right place, and two are not.** The
`girsa-corpus`/`girsa-ref` split is real (Ksav stores refs and never imports a corpus) —
but `is_well_formed` exists on both sides of it, and `girsa-ref/src/reference.rs:118-125`
names the corpus copy as its counterpart and explains why its own is better (*"defined as
the property itself rather than as a list of characters so it cannot drift away from what
the parser actually does"*). The strictly better implementation exists, in the other repo,
documented as better, and the corpus still ships the blacklist. And `girsa-corpus` has
become the workspace basement: 886 lines of `argv`/`said`/`roots`/`csv` live in the ingest
crate because the ingest crate is the one everything can `use`, so every UI-string helper is
shipped to `girsa-scan` and compiled at `opt-level = 2` as ingest code.

**Four redirect-chain walkers, `MAX_DEPTH = 32`, three of them over the same type**
(`store.rs:128`, `standing.rs:62`, `girsa-app/src/shelf.rs:1204`, `girsa-ref/redirect.rs:26`).
`standing.rs:59-61` names two of the other three and then writes its own constant.

**One `Store<T>` is the highest-leverage single commit in Girsa.** Six stores across three
crates share an identical shape — `log`, an index, `open() -> (Self, Vec<String>)`,
`nowhere()`, `compact()`, `count()`, `all()`, an add, a `remove` — five with an identical
`From<LogError>` and five with an identical `Log::bloated` call. The sixth forgot to
compact. ~400 lines deleted, six call sites, half a day, and it closes §1 #10 as a side
effect.

---

## §6 Lens 3 — implementation

The expensive things have mostly been found already, and the measurements are in the
comments — `preview.ts:107` (a layout read after writing pages: 7,690 ms on a 48-page
document), `spans.ts:1052` (a content-keyed cache that was O(document) to probe: 0.435 ms
per keystroke on 420 KB), `structure.ts:20` (93 ms per arrow key), `ksav-lang.ts:542`
(108 ms per keystroke, cured with `Uint8Array` masks), `oversized.rs:190` (6 GB of
allocate-and-drop), `import/mod.rs:598` (328 million comparisons on one Mishnah Berurah).
Somebody has been measuring, and it shows.

What is left is almost entirely §1's shape — a fix applied on one side of a file and not
the other. Cheap, and each one is a function whose own comment names the class:

| Cost | Site | Note |
|---|---|---|
| whole-prefix rewalk per batch | `girsa-lane/src/job.rs:98` | fixed in `did()` 15 lines below |
| `format!` of two segment ids × 4.1M edges, unguarded | `girsa-link/src/repair.rs:470` | guarded at `:269` in the same file |
| two walks to the first mark | `girsa-search/src/snippet.rs:86,95` | header celebrates removing two walks |
| `beside(a)` inside an O(n²) pair loop | `girsa-link/src/chain.rs:744` | 28 calls where 8 suffice |
| whole personal-layer scan inside the BFS inner loop | `girsa-link/src/chain.rs:394` | same guard as `repair.rs:269` |
| every segment's text cloned to be mined | `girsa-corpus/src/anchors.rs:110` | `Cow::Borrowed` on the fast path; one line |
| full JSON parse of the catalogue per candidate slug, inside `for n in 2..u32::MAX` | `girsa-corpus/src/import/mine.rs:254` | build the set once |
| linear `Queue::get` inside a loop over 28,124 entries | `girsa-fix/src/suspect.rs:576` | the `HashMap` is two lines up |
| `tokenize` allocating a `String` per word, per hit | `girsa-search/src/index.rs:745` | the shared crate has `normalize_into` for exactly this |
| every spelling in a 3.7 MB lexicon re-normalized per unresolved lookup | `girsa-search/src/citation.rs:318` | normalize at `open` |
| Θ(N²) marker numbering | `Ksav/ksav/engine/typst/ksav.typ:396,1549` | the linear form is at `:415` in the same file; `_ksav_real_of` fixed exactly this at `:173-190` |
| `savedMacros()` re-validating every macro per palette keystroke | `Ksav/ksav/app/src/main.ts:3858` | ~50k allocations per keypress |
| 3 `git ls-files` spawns + 580 KB of prose read 4–6× + 8 regexes compiled per call, per test run | `Ksav/ksav/app/test/docfacts.mjs` | `documentation.test.mjs` is ~⅓ of a 2.0 s suite |
| a `node` subprocess inside the suite to reprint a markdown file | `documentation.test.mjs:59-70` | **273 ms of 2,000** — 14% — in the suite whose runner header celebrates removing six spawns for costing 55% of the loop |

One genuine hole rather than a missed sweep: `girsa-lane`'s retrieval has no index.
`Vectors::open` reads every record's id to build an offset map and `nearest` reads the whole
file again — two full linear passes per sefer per query. At the offered scale
(`Chosen::everything()`) that is ~15 GB read twice per query, and unlike the 13-day embed
cost it is stated nowhere.

**And two implementation details that are simply right, named so nobody "cleans" them:**
`run.mjs:95`'s `splitting: true` (without it two `.tmp-test` bundles held two different
`runtime` singletons and every cross-module fact in the application was untestable,
silently), and `load.mjs:79`'s deferred `rmSync`.

---

## §7 Six things I could not beat

(The seventh is in §0: WebAssembly, which killed the thesis I came in with.)

1. **`continuity.rs:306-311`, `same_opening`.** I went in to argue for Jaro-Winkler and
   lost to four lines. *"A whole word rather than a character count, because a character
   count is a threshold somebody has to defend and the first word is a fact about the
   sentence."* Then: two texts with no words in them must not match — because `tur` has 18
   segments whose entire content was one empty `<i>` tag, and refusing to match nothing
   against nothing cost all eighteen their names on every re-import. Found by running a
   measurement over the real shelf. A similarity threshold needs a special case somebody
   has to think of; this one is a fact about how Hebrew is read.
2. **`chain.rs:8-23` — a hop is forward when the far sefer was written later, and the
   graph's arrows are not consulted.** Every instinct says walk a directed graph along its
   direction. It does not work here, and the reason is a property of this corpus I would
   have discovered by shipping: an edge lives in the shard of whichever end the CSV row
   happened to name, so *"following arrows would walk one chain forwards and the next one
   backwards and call them the same thing."* Then 11.3% of edges reach a work with no date
   and the hop is **not taken and is counted**, in a struct whose doc insists it is *"not
   diagnostics — part of the answer."*
3. **`engine/src/parse.rs` — what the scan oracle refuses to assert.** My design was
   per-offset differential testing against Typst's parser. `parse.rs:24-30` kills it before
   I get there: `#הדגשה[…]` puts the name in a Typst `Ident` under `Code` while the scanner
   stays in content, *"and a per-offset assertion would drown in disagreements that are
   correct."* What is there instead is four claims where both sides make the same claim and
   disagreement is always a bug. Then it declines to be a service, and the refusal is the
   better half: *"a service in the registry that only a test dispatches through is precisely
   the half-wired surface the rest of that report is about."*
4. **`index.rs:830-840` and its test.** `rebuild` recursively deletes the directory it is
   given, off a command line, and `girsa-index build corpus index` once pointed
   `remove_dir_all` at the corpus — 2.2 GB refetched. The guard, `looks_like_an_index`, is
   *deliberately generous* about which index, because an index half-written by a killed run
   has tantivy's `meta.json` and not our stamp, and refusing that would refuse the exact
   case rebuilding exists for. I would have written the strict check and broken the reason
   for the function. The test asserts the refusal, asserts the file survives, **and** asserts
   all three things rebuild must still do.
5. **`Girsa/app/test/wire.test.mjs` — a 179-line regex parser of Rust structs, written in
   JavaScript, that I wanted to replace with Ksav's generator and cannot.** `wire.test.mjs:26-30`:
   *"a fixture generated from either side would agree with that side by construction and
   prove nothing."* That is correct, and it cuts at Ksav. A generated client catches a
   **stale copy** of a registry, never a **wrong** registry. Girsa's hand-written duplicate
   plus a comparator is two independent statements that have to agree, and it has caught
   real drift — `scan` missing from a card, `notes`/`fixes` missing from a gap, six keys
   missing from an opening state. The price is a regex over `^pub struct (\w+) \{$` that
   will break on the first generic. I do not have a design that gets independence *and*
   structure, and Girsa bought the more expensive, more truthful mechanism.
6. **The insertion-grid → scan-oracle chain.** 115 commands × 9 caret contexts, both
   directions asserted (*"Without the second, greying everything would turn the suite
   green"*), and the legal subset then becomes the corpus for a differential parser oracle
   — with floors (`checked > 1_000`, every source prefix must still contribute, a growing
   skip list fails) so the apparatus cannot silently degrade into a sweep of nothing while
   staying green. I attacked it three ways and lost each time. Which is exactly why §1 #1
   stings: this is the sharpest fence in the three repos, and it asks all 1,026 of its
   questions in Hebrew.

---

## §8 What I would do, in order

Ranked by wrongness × cost of leaving it.

| | Change | Cost |
|---|---|---|
| 1 | **English contexts in the insertion grid.** Add two English contexts to `CONTEXTS` and iterate `[c.he, c.en]` at `emit-insertion-fixtures.mjs:95`. Regenerate; `insertion.rs` will name what breaks. | ~20 lines, one regeneration. The highest-value hour in the system. |
| 2 | **The maqaf fix.** Add `girsa-hebrew` to `engine/Cargo.toml` — **it is already linked into the binary**, so this is one line and zero new supply chain — delete the five duplicated character tables, exclude word-breaking punctuation from `is_part`, add `ד` to the prefix letters, fix `build_lexicon.py`, regenerate the lexicon, and extend `one_want.rs` to cover the speller. | Half a day. Removes 89+ non-words from the shipped dictionary and un-blinds the checker on every pasuk. |
| 3 | **`check-dependents.sh` installs the `paths` override before building Ksav, and asserts via `cargo metadata` that it took.** | ~20 lines of shell. Restores ⅓ of the cross-repo safety net. |
| 3b | **`PostError::code()`** in `girsa-post`, then both frontends key their error vocabulary on the code instead of regexing English `Display`. If you only do one thing, do this: it is the sole genuine cross-repo duplication, it lives in the only place a shared repo can hold it, and Girsa has already written and tested this exact fix for its *own* error type. | ~15 lines added, ~60 deleted on each side, one rev bump. |
| 4 | **Girsa adopts git+rev + `manifests.rs`.** Deletes `SEFER_CRATES_REF`, shortens CI, and makes `git clone girsa && cargo build` work — which was verified to fail today, at `cargo metadata`, os error 3. Add `ref:` to the Ksav checkout while you are in the file, and drop the tracked `[build] jobs = 12`, which is not target-scoped and hands every 4-core CI runner a value tuned for one 28 W laptop. | One commit; CI gets shorter. |
| 5 | **The repo-wide prohibition suite**, seeded with the class statements in §1. | Half a day; will go red immediately, which is the point. |
| 6 | **Print reads the pages on screen.** `preview.currentPages()`; `exports.ts` and `main.ts` read it instead of `runtime.lastResult`. | ~40 lines. Silent blank print on the paper route. |
| 7 | **`girsa_personal::Store<T>`**, six stores ported. | Half a day; ~400 lines out, and `documents.jsonl` starts compacting. |
| 8 | **Build the four missing consumers** (§2): clipboard paste, a Refresh panel, `/document` on save, `Segment.anchors` in `links.rs`. | 2–3 days total, and it is the first time the seam earns its 3,525 lines. |
| 9 | **Correct the five false claims** (§2, §3b) and the stale ones (`girsa-corpus/src/lib.rs:3-5` names SQLite, which was never built; `spec.md` §8.6 says "Later" about a module two caches were built for). | An afternoon. |
| 10 | **`delete`:** `readme.test.mjs`, `girsa_ref::RedirectTable`, the duplicated `parse_anchor`×3, the duplicated `Writer`, `sefarim.rs:381`'s copy of `typst_str`, `harness.mjs`'s uncalled `summary()`, the card subprocess. | An afternoon, minus the `RedirectTable` conversation — it is `pub` and cross-repo, and this project's `delete` verdicts have not held before. It is a *finished duplicate* of a shipped mechanism, which is the one case where deletion is not abandonment. |

Two things that are red or growing right now and are not in the list because they are
one-liners: `ksav/README.md:357` and `:433` say 4,003 assertions against a suite that
counts 4,004, so the documentation fence fails on a full run (it is skipped on the filtered
run, which is the ordinary loop — `run.mjs:177`, 553 ms filtered against 2,000 ms full).
And `Girsa/app/test/run.mjs:14` carries the `import.meta.url).pathname` bug that Ksav
forbids by name.

---

## §9 Coverage

Fourteen regions: Ksav's Typst seam, delivery/platforms, spell, editor semantics, app
chrome, test machinery; Girsa's corpus, search+lanes, link graph+scans, `girsa-app`, the
seven small crates, frontend+shell; sefer-crates; and the live interop path, which I read
myself. Every tracked file landed in exactly one region.

All fourteen reported. Three claims are reported to me and not personally re-checked, and
are marked as such where they appear: the JS suite's 4,004 assertion count (measured by the
reader who ran it; I verified only that the README says 4,003 on a clean tree),
`girsa-fixture/src/links.rs`'s column ordering, and `girsa-app`'s per-module LOGIC/FORWARD
table. Everything else carries a `file:line` that I or a reader opened, and the claims this
document leads with — the maqaf/`girsa-hebrew` chain, the Hebrew-only insertion grid, the
`check-dependents.sh` gap, the unpinned Ksav checkout, the `כסב` string, `main.ts`'s growth
curve, the dead `Segment.anchors`, and the two dead `delete` candidates — I re-verified
myself before writing them down.

No Rust test suite was run. A full `cargo test` on this box needs tens of gigabytes against
24 GB free, and near-full it leaves truncated rlibs whose errors read as code faults;
runtime claims about the speller come from the pre-built release examples, and are flagged
as such. That is the one confirmation this document owes.

Excluded and named: lockfiles, `prototypes/` (two archived Gemini mocks — the README's
account of the removed unauthenticated Gemini proxy checks out and the archiving is the
right call), fonts, icons, `target/`, `dist/`, lexicon bodies, and `Girsa/README.md`
(171,655 bytes, larger than its spec and nearly twice its BUILDER — that is not a README,
it is a book, and it is where several of Girsa's design decisions actually live; the
instruction was not to spend time on docs, so I am noting the number and moving on).

---

## §10 The question I need answered

**What is the next thing you are building?** Half of what makes a design wrong is the
change it is about to face, and that is not in the repo. Specifically:

- If the next thing is **the Refresh panel** — the errand that pays for the loopback —
  then §3 is the whole document and items 3, 4 and 8 are one wave.
- If it is **a third corpus source**, `Catalogue::build(sefaria_root, otzaria_root)` needs
  to take `&[(Source, &Path)]` first, and `taxonomy.rs`'s `PREFIX`/`COMMENTARY` tables are
  where a rishon goes invisible.
- If it is **a new note arrangement**, that is 12 files and 6 hand-maintained tables across
  two repos, of which `notepaths.test.mjs` fences one.
- If it is **shipping** — a certificate, a release — then almost nothing here is urgent
  except items 1, 2 and 6, which are all things a writer would notice.

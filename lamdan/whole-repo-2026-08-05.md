# Lamdan — the whole repository, 5 August 2026

Not a bug hunt. The question throughout is *should this exist, and is this the way
to build it* — argued against the intent, not against the implementation.

Method: the tree was partitioned into twelve regions, every tracked file landed in
exactly one, and each region was read in full by a reader with no other region in
context. Only then was `git log` consulted, to **rank** what the sweep had already
found — never to select what to look at. Excluded from reading: `Cargo.lock`,
`package-lock.json`, the six font binaries, the sixteen icon PNGs, and the two
generated lexicons (sampled and censused with `grep`, not read line by line).
`prototypes/**` was line-counted and characterised rather than read.

Claims marked **verified** were executed, not inferred. Claims marked *static* were
read from source and are flagged as such.

---

## The commitment, made before any implementation was opened

Laddering the want from the README, the manifests, the route table and the test
names alone:

> *"A Hebrew-first writing system"* → *"a bochur wants to write a kuntres"* →
> *"Word makes Hebrew typography and a multi-tier note apparatus impossible, and
> Typst makes them possible but unlearnable."*
>
> So the apparatus and the typography **are** the product; the editor is a delivery
> mechanism for them. I'd have built `ksav.typ` — a prelude of Hebrew-named Typst
> functions with the eleven note layouts as its centrepiece — one CodeMirror with
> completion over those names, a local server compiling to SVG on a debounce, and
> templates as plain `.ksav` files. Three to four thousand lines, every one of them
> in service of "the page looks right."
>
> I'd have punted spell-check to the browser (and expected to be wrong — Torah
> Hebrew in a general dictionary is a disaster). I'd have flatly refused `.docx`.
>
> Predicted finding: mass out of proportion to want in the app layer, and "Word
> parity" as an organising principle — a want with no edge, so the project can
> never be finished.

**How the sketch scored.** The spell-check guess was wrong and the reason it was
wrong is documented in the code. The `.docx` refusal was wrong twice over: the
*import* direction is 452 well-argued lines and the *export* is 78. The
mass prediction was right, but the mechanism was not the one predicted — the app
layer is not bloated with ceremony, it is duplicated. And "Word parity" turned out
to be only half the unbounded want; the other half is typstify and Katvan parity,
which the repo names in its own prose and then acts against.

---

## 1. Twelve parsers of one markup

**Verdict: `rewrite`.**

> ### ✅ Fixed — 6 August 2026
>
> Done as prescribed: one `spans.ts`, every consumer reading it, the edit
> functions left alone as textual splices. The finding below is kept verbatim;
> what follows is what replaced it, what the finding got wrong, and what it
> missed.
>
> **The disagreement had a right answer, and it was not a compromise.** The
> scanners split over `"` because each had picked a side of a real trade-off:
> treat it as a string delimiter and a gershayim swallows the document, treat it
> as an ordinary character and `#הערה_זרם("a)b")` never closes. Both were wrong,
> because Typst does not have one rule — it has two, chosen by context, and not
> one of the twelve tracked context. Inside `[…]` it is in content mode (`"` is a
> character, `\` escapes); inside `(…)` and `{…}` it is in code mode (`"` opens a
> string in which brackets are inert). Verified against the compiler rather than
> reasoned about — `cargo run --example probe` on four documents:
> `#רשימה(פריט[דברי רש"י],)` lays out two bullets, `#הערה_זרם("a)b")[גוף]` lays
> out a footnote, `#הדגשה[סוגר \] בתוך]` prints a literal `]`, and
> `#הדגשה[אלף // בית]` **fails to compile** because `//` eats the closing bracket
> in content mode too. One context-tracked scanner is therefore strictly better
> than every matcher it replaces.
>
> **What went.** Ten private delimiter matchers, eight command-name alternations,
> `spell.ts`'s recursive bare-call walker, `markdown.ts`'s positional `BARE_RE`,
> and — not counted by this finding — **four more argument scanners in
> `styles.ts`**, every one of which opened a string on any `"` including inside a
> `[…]` body. Fourteen, not twelve.
>
> **All six divergences are fixed at the root and asserted from both sides.**
> `test/spans.test.mjs` is 180 assertions: a prohibition swept over `src/` (no
> module but `spans.ts` may define a delimiter matcher *or* count bracket depth,
> with `bidi.ts`'s viewport approximation named as the one argued exemption), the
> six divergences each checked from both surfaces that disagreed, cross-surface
> agreement over a twelve-document corpus, and the name table checked against
> `ksav.typ` in **both** directions — every name the scanner knows must be a
> command the engine defines, and every `heading()`-producing command in the
> prelude must be one the scanner calls a heading. Verified by mutation: putting
> a `matchBracket` back in `lists.ts`, restoring the old gershayim rule, deleting
> `ממוספרת_עברית` from the table, and calling `#שער` a heading again each turn it
> red.
>
> **Three things this finding got wrong.**
>
> - **The timing is mis-attributed.** *"21 ms per arrow keypress on a 41 KB
>   document"* does not reproduce: `availableAt` on 40 KB of ordinary prose and
>   tables costs 2.1 ms. The 21 ms is real but it is quadratic in **table size**,
>   not document size — 200 rows is 19 ms and 600 rows is 93 ms, because
>   `render()`'s `placementsIn` filters every cell once per row and
>   `availableAt` renders the whole table eighteen times per caret move. The
>   diagnosis (running eighteen operations to compute `enabled`) is right; the
>   axis is wrong, and the argument it was supporting — that a `postMessage` is
>   cheaper than the synchronous path — was not needed. Measured head-to-head in
>   one process, the new scanner is **2.3–2.5× faster** than what it replaced at
>   every size, because one memoised scan replaces the four-to-six each caret
>   move used to pay for.
> - **Divergence 5's repro does not compile.** `#סימן[א]` is `missing argument:
>   כותרת` — the prelude signature is `סימן(מספר, כותרת)`. The finding is real
>   and reproduces on `#סימן("א", [דיני תפילה])`, which is worth saying because
>   an audit that cannot be re-run is a claim, not a finding.
> - **`bidiIsolates()` is still not available.** The closing paragraph claims it
>   comes free once there is "a tree to mark as isolating". It does not:
>   `@codemirror/language`'s version reads a **Lezer** `NodeProp` off a Lezer
>   parse tree, and a hand-rolled node list is not one. `isolateSpans` stays, now
>   reading `spans.ts` — which does buy something real, just not that: a colour
>   literal like `#b91c1c` inside `rgb("…")` is no longer isolated as a command,
>   because the scanner knows it is inside a string.
> - **`#סימן` cannot simply be handed the heading operations.** The prelude
>   writes `heading(level: 1, …)` with the level *in the definition*, so there is
>   no `#סימן` at level 2. Promote, demote and unwrap now refuse (the surfaces
>   grey them); move and delete work, because those are text moves. Rewriting a
>   siman into a `#כותרת2` would have silently dropped its number.
>
> **Four it missed, all of the same family.**
>
> - **`#שער` is in the outline and is not a heading.** It is
>   `align(center, text(size: 2em, weight: "bold", …))` with no `heading()` in
>   it, so it has never entered a compiled `#תוכן` — verified: a document of
>   `#תוכן()`, `#שער[…]` and `#כותרת1[…]` prints exactly one contents entry. The
>   outline pane listed it at level 1, so the two surfaces that display a
>   document's structure disagreed about what the structure was, and folding it
>   collapsed a section the document does not have. Every shipped template opens
>   with one, so it stays in the pane as a level-0 *title* row and is no longer a
>   section anywhere.
> - **`brackets.ts` condemned valid documents and its one-click heal then broke
>   them.** Its scanner skipped comments and nothing else, so on the three
>   documents above that the compiler accepts, it reported a stray `)`, a stray
>   `]` and an unclosed `[` — and the repair *deleted the real closing paren*,
>   *deleted the real closing bracket*, and appended a bogus `]`. Worse than
>   anything in the original six, because `compile.ts` compiles the healed copy
>   speculatively, so the preview was rendering the corrupted text. It now takes
>   its delimiter stream from `spans.delimiters()` and keeps only the balance
>   judgement, which is the part that genuinely cannot come from a node tree.
> - **`styles.ts`'s four scanners**, above.
> - **`apparatus.ts`'s comment test** described itself as *"a crude but adequate
>   check"*: it looked for `//` earlier on the line, so a `//` inside a string
>   argument hid every command after it on that line.
>
> **The steelman held.** Structure editing is still synchronous, pure and
> format-preserving; `table.ts` is still the only place that reprints; nothing
> moved to the worker. What was separable was separated — deriving the spans is
> now one thing, splicing the text is still eleven.
>
> Cost: 14 files, +1 module, −10 delimiter matchers, −8 name alternations,
> −1 recursive walker. `npm test` 2,999 across 46 files (+180), `cargo test` 342,
> `tsc` clean, `vite build` clean.
>
> ### ✅ Follow-up — the shape behind the timing, 6 August 2026
>
> The scan was the wrong fix for the right complaint. One memoised scan made the
> ribbon 2.3–2.5× faster and left the *shape* exactly as the finding described
> it: `availableAt` still decided which of the eighteen table controls were
> enabled by **running all eighteen** on every caret move, and each run laid the
> table out, re-rendered the whole call to a string and built a fresh copy of the
> document — to choose the colour of some arrows. Made 2.5× cheaper is not the
> same as fixed, and the axis the original finding got wrong (table size, not
> document size) is precisely the axis a sefer grows along.
>
> **Asking is now a different operation from doing.** Every action carries
> `enabled(ctx)` beside `run`, answered from a `StructureContext` that resolves
> the caret's list, table geometry and heading list **once** and hands the same
> answers to all eighteen. No rendering, no second copy of the document, no
> string comparison anywhere in the path.
>
> The obvious hazard in splitting a predicate off an operation is that the two
> drift, and then a control is grey over an operation that works — which is this
> repository's own bug family, told from the other end. Two things stop it.
> Every predicate lives beside the operation it guards (`lists.canIndentItem`,
> `table.canMergeRight`, `headings.canMoveSection`) and **the operation calls
> it** before doing anything, so there is one decision with two callers rather
> than two decisions. And `test/structure.test.mjs` sweeps all 44 actions over
> every caret position of a 23-document corpus — 45,144 pairs of answers —
> asserting that `enabled` and `run` agree at every one of them, and that nothing
> enabled leaves the document unchanged, plus a source-level prohibition
> so `run(doc, pos) !== null` cannot come back as an enabled test anywhere in
> `src/`.
>
> **The second half was `render` itself.** It found each row by filtering the
> whole cell list, once per row, so printing a table was quadratic in it —
> 360,000 comparisons at six hundred rows — and that cost sat under *every*
> table edit, not only under the ribbon. The layout now buckets its placements
> by row as it builds them, which is where every one of the six per-row loops in
> `table.ts` was paying for it.
>
> Measured head-to-head in one process, `tools/bench-structure.mjs`, per caret
> move:
>
> | | before | after |
> |---|---|---|
> | table, 20 rows | 0.54 ms | 0.07 ms |
> | table, 100 rows | 2.71 ms | 0.16 ms |
> | table, 200 rows | 6.47 ms | 0.25 ms |
> | **table, 600 rows** | **115.9 ms** | **0.62 ms** |
> | list, 600 items | 0.53 ms | 0.15 ms |
> | 300 sections | 0.79 ms | 0.12 ms |
>
> Two behaviours changed, both deliberately. An operation now applies when it is
> *structurally* possible, not when the re-rendered text happens to differ: "make
> the columns equal" used to grey out on an already-equal table whose source was
> formatted by hand, and light up on one that only needed reformatting — the
> answer depended on the writer's whitespace. And "toggle header row" is greyed
> on a row made only of merges, because `מיזוג` has no header spelling and the
> button provably could not have changed anything. The one case where an applying
> operation leaves the source identical — moving a row past one identical to it —
> is asserted as such, and `runStructureAction` declines to push an empty step
> onto the undo stack for it.
>
> Cost: 6 files, +1 tool. `npm test` 3,013 (+14), `cargo test` 352 — the engine
> is untouched and `structure-edits.json` re-emits byte-identical, which is the
> check that the eighteen operations still produce the same source they did.
> `tsc` clean, `vite build` clean.

`ksav/README.md:142` states the architectural centre of the project:

> *"Because Typst itself parses the document, we never reimplement a parser — and
> arbitrary cross-nesting works for free."*

True of the engine. False of everything in front of it. Twelve independent
delimiter matchers live in `ksav/app/src/`:

| # | Location | `\` escapes | `"` strings | `//` comments | `{}` |
|---|---|---|---|---|---|
| 1 | `ksav-lang.ts:46` `matchGroup` | no | no | no | no |
| 2 | `ksav-lang.ts:449` `matchInText` | no | no | no | no |
| 3 | `ksav-lang.ts:983` `matchDelim` | no | no | no | no |
| 4 | `headings.ts:53` `matchBracket` | **yes** | no | no | no |
| 5 | `lists.ts:64` `matchBracket` | **yes** | **yes** | no | no |
| 6 | `table.ts:98` `matchBracket` | no | no | no | no |
| 7 | `brackets.ts:189` `analyze` | no | no | **yes** | **yes** |
| 8 | `bidi.ts:163` (inline) | no | no | no | yes |
| 9 | `markdown.ts:105` `matchBracket` | no | no | no | no |
| 10 | `spell.ts:186` `matchBracket` | no | **yes** | no | no |
| 11 | `deferred.ts:110` `matchGroup` | no | **deliberately no** | via `brackets` | no |
| 12 | `apparatus.ts:129` `matchParen` | in strings only | yes | own scanner | no |

Plus eleven command scanners of the same syntax — `ksav-lang.ts:19` `CMD_RE`,
`:463`, `:468`, `:472`, `:473`, `:523`, `:953`, `:1000`; `headings.ts:75`;
`lists.ts:90` and `:134`; `table.ts:61` and `:114`; `brackets.ts:105`;
`parts.ts:31`. `CELL_RE` is literally the same regex source in `table.ts:61` and
`ksav-lang.ts:473`.

`brackets.ts:69-71` writes the invariant down explicitly: *"the two scanners must
agree or the lint would contradict the renderer."* There are ten more.

### Six divergences, all reproduced by execution

1. **Gershayim disables the list ribbon.** `lists.ts:77` treats `"` as a string
   opener; `ksav-lang.ts:38-44` deliberately does not, with a comment recording
   that this exact choice once "ate whole tables." **Verified:**
   `#רשימה(\n פריט[דברי רש"י],\n פריט[שני],\n)` → `listAt` returns `null`,
   `availableAt` returns **0 actions**. The identical list without the gershayim
   returns **11**. The identical text in a *table cell* works, because `table.ts:98`
   has the third rule. רש״י is the most common word in a sefer.
2. **A ribbon button ejects your list from prose mode.** `lists.ts:16` knows six
   list names; `LIST_OPEN_RE` (`ksav-lang.ts:463`) knows four — `ממוספרת_עברית`
   and `henum` are missing. Press `list.hebrew` and the list stops rendering as
   bullets.
3. **A ribbon button ejects your heading from the outline.** `heading.demote` on
   `#h6` writes `#hlevel(level: 7)` (`headings.ts:151`); `HEAD_RE`
   (`ksav-lang.ts:953`) does not know `hlevel`. **Verified false.** The section
   disappears from the outline and stops folding.
4. **English headings 4–6 print their own markup in prose mode.** `PROSE_STYLE`
   (`ksav-lang.ts:158-256`) has `כותרת4/5/6` but no `h4/h5/h6`, no bare `כותרת`,
   no `hlevel`. **Verified absent.**
5. **`#סימן` and `#שער` have an outline and no operations.** `HEAD_RE` treats both
   as headings; `headings.ts:16-25` `NAMED` knows neither. **Verified:** a
   two-siman document gives `headings() → 0`, `structureAt → null`,
   `availableAt → 0`. A sefer of simanim folds and outlines perfectly and cannot
   promote, demote, move or delete a single section.
6. **A ribbon button corrupts the prose-mode table.** `table.ts:124-135` parses
   `עמודות: (2fr, 1fr, 1fr)`; `ksav-lang.ts:552` matches only `\d+`. **Verified no
   match** → falls back to `cols = 2`. `table.widerColumn` (`structure.ts:310`) is
   what *produces* that track list. One click turns a 3-column table into a
   2-column one in prose mode — the same class of bug `table.ts:33-43` congratulates
   itself for having fixed, fixed in one scanner and not the other.

### Steelman

Structure editing must be synchronous, pure, and format-preserving. An AST
round-trip that reprints the document would destroy the writer's whitespace,
comments and argument order — `table.ts:260` `render()` is the one place reprinting
was accepted, and it is the one place real work went into preserving `options` and
`widths`. The engine is behind an async worker. Typst has no editor-facing span API
in this build. Textual splicing over regexes is the pragmatic, testable,
offline-capable choice, and the region knows its risks: it built an entire Rust
compile-fixture harness because unit tests could not catch illegal Typst. Given all
that, twelve small matchers is a defensible local optimum.

### Why it still fails

The defensible part is **splicing text**. The indefensible part is **deriving the
spans twelve different ways**. Those are separable, and conflating them produced the
six above. `table.ts:213-287` parses to a model, lays it out on a merge-aware grid,
and pretty-prints back to source. That is a parser, a document model, and a code
generator; naming the variable `model` does not change what it is.

### The change

One `spans.ts`. A single scan producing a typed node list —
`{kind, name, lang, from, to, argsFrom, argsTo, bodyFrom, bodyTo, depth, children}` —
with **one** answer each about `"`, `\`, `//` and `{}`. Every consumer reads it:
highlighter, prose mode, fold, `outline()`, `headings.ts`, `lists.ts`, `table.ts`,
`bidi.isolateSpans`, `markdown.ts`, `spell.proseRegions`, `notes.notesIn`,
`apparatus.ts`. The edit functions stay exactly as they are — textual splices over
ranges — so format preservation is untouched and `engine/tests/structure.rs` keeps
its job. Command names come from the engine registry keyed by kind and language
(the pattern `note-commands.ts` already establishes), not from six hand-written
alternations that disagree about `ממוספרת_עברית`.

Source it from Typst if possible: `typst::syntax::parse` is pure, layout-free,
error-tolerant, and returns spans over unmodified source. `jump.rs:81` already
builds a `Source`; `wasm-worker.ts:20-27` already carries seven call types, and an
eighth is one line in `FNS`. The only real objection is that it is async — and the
current synchronous path already costs **21 ms per arrow keypress on a 41 KB
document** (measured; 11.5 ms at 10 KB), because `structure.ts:504-514` computes
`enabled` by *running* every one of eighteen table operations on every caret move,
each of which re-scans the document and re-renders the whole table call to a string
just to compare it. A `postMessage` to a worker that is already running is faster
than what is there.

**Cost.** Ten call sites. No user-visible change, which is exactly why it will not
happen unless it is scheduled deliberately. Two things collapse at once: the six
divergences become unrepresentable, and `bidi.isolateSpans` (`bidi.ts:194`, which
`bidi.ts:59-63` admits exists only because there is no grammar) can call
`bidiIsolates()` from `@codemirror/language` for free, because there would finally
be a tree to mark as isolating.

---

## 2. Ten registration sites, one of them checked

**Verdict: `rewrite`.**

> ### ✅ Fixed — 5 August 2026
>
> Done as prescribed, from the registry outward rather than by patching the three
> live symptoms. The finding below is kept verbatim; what follows is what
> replaced it.
>
> **One registry.** `engine/src/services.rs` — eleven lines, one per service,
> each carrying `name`, `method`, `path`, `Cost` (does it lay a document out) and
> `Reach` (does it need the loopback to Girsa). `server.rs` routes by iterating
> it; its twelve-arm `match`, its three `*_with_deadline` wrappers and its two
> request parsers are gone. The wasm crate exports **one** function,
> `ksav_call(name, input)`, instead of eight. The Tauri shell registers **one**
> command, `ksav_call`, instead of thirteen — of which `ksav_girsa_presence` had
> never had a caller, and `ksav_search_in_girsa` was a second command for what
> the server had always answered as one flag on `/mekoros`.
>
> **One generated client.** `app/tools/emit-services.mjs` reads that table and
> writes `app/src/services.gen.ts`. The Vite proxy is
> `Object.fromEntries(SERVICES.map(…))`; the worker's `FNS` table is deleted;
> `api.ts` forms no URL and names no Tauri command of its own; and
> `WasmBackend.call(name: string, …)` — *"the ONLY enforced line"* was one line
> away from the bug it could not see — is now `call(name: ServiceName, …)`.
> `npm test` fails if the generated copy is stale.
>
> **The three live failures, at the root:**
> - `sefarim` is reachable in the browser build because there is no table to
>   forget it in. Verified by mutation: pointing `WasmBackend.sefarim` at another
>   service turns three assertions red, one of them named *"citation autocomplete
>   is reachable in the offline build"*.
> - The dev proxy carries every route because it is the registry.
> - The CSP is `ksav/policy/csp.txt`, one line, read by `vite.config.ts` and
>   `include_str!`d by the engine. `app/src-tauri/build.rs` — the three lines
>   that did nothing — now fails the desktop build with a diff when
>   `tauri.conf.json` disagrees. Verified by mutation: removing
>   `https://api.github.com` from Tauri's copy fails `cargo check` with both
>   strings printed. Tauri's copy was also missing `worker-src` outright, which
>   this finding did not catch either.
>
> **Fences, not comments** — the sentence `vite.config.ts:26` asserted is now
> four things that fail: `emit-services.mjs --check` in `npm test`, `build.rs`,
> three tests in `engine/src/policy.rs`, and `app/test/services.test.mjs` (96
> assertions), which drives *every* method of all three backends through a stub
> transport and asserts the name or path each one asks for is a service the
> engine has. The wasm smoke test in CI now asks the module what it holds
> (`ksav_services()`) and drives all of it, instead of calling seven exports it
> had been told about — the same mistake one layer up, and the reason it could
> not have caught `sefarim` by construction.
>
> **Not verified by launching.** The CSP intersection was read statically here
> and is still read statically: what is proven is that the three copies are now
> one string and that two builds fail if they stop being one. Nobody has watched
> an installed Ksav report an update. That is §13's problem, not this one's.
>
> Cost: 11 files, +1 module, −13 Tauri commands, −7 wasm exports, −1 twelve-arm
> `match`. `cargo test` 130 green in the engine lib, `npm test` 2,819 across 46
> files, `tsc` clean, `cargo check` clean on engine and shell.

Adding one engine function so it is reachable from all four delivery targets:

```
engine/src/server.rs      route arm                        ~5 lines
wasm/src/lib.rs           #[wasm_bindgen]                  ~5
src-tauri/src/lib.rs      #[tauri::command]                ~5
src-tauri/src/lib.rs      generate_handler! entry           1   ← forget = silent
app/src/wasm-worker.ts    WorkerCall + FNS                  2   ← forget = silent
app/src/wasmpkg/*.d.ts    regenerate + commit               2   ← forget = silent
app/src/api.ts            Backend interface                 1   ← the ONLY enforced line
app/src/api.ts            HttpBackend                      ~9
app/src/api.ts            WasmBackend                      ~3
app/src/api.ts            TauriBackend                     ~3
app/vite.config.ts        proxy entry                       1   ← forget = silent
```

Eight files, eleven sites, ~36 lines, one line the compiler can see. **All four
silent rows have already failed, and three are failing in HEAD** (*static*):

- **`sefarim` is missing from `wasm-worker.ts`'s `WorkerCall` union and `FNS`
  table.** `wasm_sefarim` exists (`wasm/src/lib.rs:44-47`) and
  `WasmBackend.sefarim()` calls it (`api.ts:858-860`), but `call(name: string, …)`
  (`api.ts:770`) is typed `string`, so `tsc` cannot see it. At runtime
  `FNS["sefarim"]` is `undefined` and the call throws; `sefarim.ts:44-51` swallows
  it. **Citation autocomplete is dead in the offline build and nothing reports it.**
  The committed `ksav_wasm.d.ts` lists 7 of 8 exports and is missing it too, and
  `wasm-smoke.mjs` calls the module directly rather than through the worker, so it
  cannot catch this by construction.
- **The Vite dev proxy carries 5 of 12 routes** (`vite.config.ts:86-94`).
  `/jump`, `/reveal`, `/sefarim`, `/inbox`, `/mekoros`, `/linkify` all 404 under
  `npm run dev`. The comment at `:88-91` congratulates itself for having fixed this
  exact bug for `/spell` and `/suggest` — and left six behind, including
  click-to-jump, the feature that dragged `typst-ide` into the dependency tree.
- **The CSP string has three copies and they have diverged.** Only Vite's allows
  `https://api.github.com` (`vite.config.ts:40`); `tauri.conf.json:25` and
  `server.rs:28` do not. Multiple CSP policies delivered to one document are
  **intersected**, not overridden — so `update.ts:19`, which fetches
  `api.github.com/…/releases/latest`, is blocked in the desktop build and the
  server build, and works only in the browser build, where you update by pressing
  reload. `update.ts:76-78` catches the `TypeError` and returns `null`,
  indistinguishable by design from "no update." `update.ts:3-7` states the feature's
  entire purpose: *"an installed Ksav has no way at all to learn that a newer one
  exists."*

And the sentence that explains why nobody looked, `vite.config.ts:26`:

> *"This is the **same** policy Tauri already enforces (see
> src-tauri/tauri.conf.json), so it is a no-op for the desktop build."*

It differs in two dimensions. **The comment asserted the invariant instead of the
build checking it.**

### The change

One `ksav/policy/csp.txt`, one line, no comments. `vite.config.ts` reads it with
`readFileSync`; `server.rs` reads it with `include_str!`; `build.rs` — currently
three lines that do nothing but call `tauri_build::build()` — asserts the `csp` key
in `tauri.conf.json` equals the file and fails the build otherwise. Nine lines, and
a silently-dead flagship feature becomes a compile error.

Generalise it: one `Vec<(&str, fn(&str) -> String)>` registry in the engine that
`server.rs`, `wasm/lib.rs` and the Tauri handler all iterate, plus one generated TS
union. Four thin adapters over one registry instead of four hand-maintained
registries. The reason four registries drift is that nothing in the build ever
compares them, and `build.rs` is sitting there doing nothing.

---

## 3. One want, satisfied three times, in three languages

**Verdict: `rewrite`, incrementally.**

> ### ✅ Fixed — 6 August 2026
>
> Done, all eight, in one pass rather than incrementally — because the eight are
> not eight problems. The finding below is kept verbatim; what follows is what
> replaced it, what it got wrong, what it missed, and the two bugs that fell out
> of running the copies against each other for the first time.
>
> **The verdict "incrementally, ~1 day each" was wrong, and wrong in a way worth
> naming.** Eight concepts × a day each is the estimate you get from reading the
> table as eight independent duplications. They are one duplication with eight
> instances, and the question that decides every one of them is the same: *is a
> language boundary genuinely in the way?* Answer it once and the eight sort
> themselves into two piles.
>
> - **Six were not blocked by anything** and are fixed by deletion.
>   `app/src/engine.gen.ts` is generated from `lib.rs`, `commands.rs`,
>   `notices.rs` and `ksav.typ` by `app/tools/emit-engine.mjs`, with the
>   `--check` form in `npm test` — which is not a new idea, it is exactly the
>   §2 cure applied to the disease §2 did not know it shared.
> - **Two are genuinely blocked** — a Typst prelude cannot call Rust, a browser
>   tab cannot call either — and get an executed oracle instead: one corpus,
>   every implementation run against it.
>
> **What went.** ~200 hand-written Hebrew/English pairs across four modules:
> `markdown.ts`'s six tables, `ksav-lang.ts`'s `PROSE_STYLE` (44 pairs),
> `SELF_CLOSING`, `INLINE_TAG` and its `addNotes` calls, and — not counted by
> this finding — **`spans.ts`'s eight name tables and four regex alternations**,
> which is the file §1 created to be the one authority and which then stated the
> *names* twice. Plus `settings.ts`'s twenty-odd re-typed defaults, the About
> panel's fourth copy of the licence notices, and five of the six markup-strippers.
>
> **The pairing is read from `ksav.typ`, not from `commands.rs`.** The finding
> says "the engine already ships the registry to the app as JSON", and that is
> true and not sufficient: the registry is deliberately a *subset* — it stops at
> tier ג, on the stated argument that a chooser card with seven tiers is
> unreadable, while the prelude defines all seven per family and an export has to
> meet a document that used one. The hand-written list in `markdown.ts` had all
> twenty-one, which means it knew something neither engine table said out loud
> and the only reason it was right is that somebody typed twenty-one names
> carefully once. The `#let` lines are what *make* the pairing, so they are what
> is read; the registry is unioned in for the four commands defined
> independently rather than aliased (`#let hlevel(body, level: 1)` is `#כותרת`
> under an English parameter name), and the generator fails if the two disagree
> or if the registry advertises an English name the prelude never bound.
>
> **Two real bugs, both found by running copies against each other.**
>
> - **`_ix_fold` deleted pointed letters, not points.** Typst's `.clusters()`
>   yields grapheme clusters, so a pointed letter arrives as one string
>   containing its base letter *and* its nikud; `c.match(regex("[\u{0591}-\u{05C7}]"))`
>   matches anywhere in it, and `continue` threw the letter away with the point.
>   Verified in the compiler: `רֹאשׁ הַשָּׁנָה` folded to `א ה` and `שַׁבָּת` folded to
>   **the empty string**. That is not a failure to find a masechta — it makes
>   every fully-pointed name collide with every other, in the source index, in
>   `_ix_sortkey` (so pointed terms all sorted together under nothing) and in
>   `_ix_gematria` (so a pointed abbreviation scored zero). Rust iterates
>   `chars()` and never had it. Two implementations read carefully by hand had
>   agreed with each other for as long as they existed; three implementations run
>   against one corpus disagreed on the first execution.
> - **`#כלול("")` was a directive in Rust and not in TypeScript.** The finding
>   names this one and is right about it. The engine asked for a document called
>   nothing and reported it missing, on a file the app had seen nothing wrong
>   with. `directive()` now returns `None`, and both readers run
>   `tests/fixtures/include-cases.json`.
>
> **One claim in the finding is false, and it was false in the source too.**
> `fold`'s own doc comment — quoted by the finding's framing — says `ב״ב`, `ב"ב`
> and `ב ״ ב` all find the same masechta. The third does not, in any of the three
> implementations: runs of whitespace collapse to one space, they do not vanish,
> so `ב ״ ב` folds to `ב " ב` and `lookup` returns `None`. Making it vanish is
> the wrong fix — a geresh ending a word is legitimately followed by a space
> (`תוס׳ ד״ה` is two words), so closing the gap would fuse them — so the comment
> was corrected and the case is pinned as its own equivalence class.
>
> **`_en_params` is not a second head-alignment table.** The finding's closing
> line pairs `sanitize_head_align` with `_en_params`; those are different things
> (one translates a value, the other a parameter *name*). The duplication is
> real and is one line further down: `ksav.typ:963-964` states the same
> four-spellings-each table in two `in (…)` tuples. Fenced now.
>
> **The fences, and that they fail.** `engine/src/notices.rs` ties the licence
> facts to the `include_bytes!` lines in both directions and to
> `THIRD-PARTY-NOTICES.md` (which was carrying a differently-worded copyright
> line — the test found it on its first run). `engine/tests/one_want.rs` holds
> the fold, the include rule, the head alignment and `מסמך`'s defaults against
> `DocConfig::default()`. `app/test/enginefacts.test.mjs` holds the generated
> file, the defaults, and two prohibitions: no module but the generated one may
> write a Hebrew command name beside its English twin, and no module but
> `spans.ts` may strip markup with a regex. Verified by mutation — eight of them,
> each turning a test red: a private strip regex restored to `review.ts`, the
> pairing hand-written back into `markdown.ts`, a stale `engine.gen.ts`,
> `_ix_fold` reverted to `.clusters()`, the `#כלול("")` divergence restored, a
> notice detached from its font, `מסמך`'s size default changed, and a head
> alignment spelling dropped from the prelude.
>
> **What was left alone, with reasons.** `note-commands.ts` keeps its own list
> and its header already argues why the registry cannot supply it. The three
> apparatus chips in `SELF_CLOSING` keep both spellings deliberately: they carry
> a *word*, and somebody who typed `#endnotes` should not get a Hebrew label
> handed back. `SPELLING`'s last three entries stay written out — `עמודות` and
> `רמה` are parameter names, and `כותרת`/`h` is a prefix, not a command.
> `ONLY_AT_TOP` is §7's finding, not this one.
>
> Cost: 20 files changed, 7 added (+1 generated module, +1 Rust module,
> +1 generator, +2 corpora, +2 test files). `npm test` 3,528 across 49 files
> (+54), `cargo test` 367 (+10), `tsc` clean, `vite build` clean. No document
> renders differently: the engine's behaviour changes in exactly two places, and
> both are the bugs above.

| Concept | Copies |
|---|---|
| `fold()` — the Hebrew name normaliser | `engine/src/sefarim.rs:247-285` (Rust), `engine/typst/ksav.typ:1796-1815` (`_ix_fold`, Typst), `app/src/sefarim.ts:117-126` (TS). Same maqaf-exclusion, same four gershayim spellings, same doubled-geresh rule, fixed by hand in all three. `sefarim.rs:15-16` claims *"exactly one list and it is this one"* — true of the list, false of the algorithm that indexes it. |
| Document defaults | `lib.rs:218-257` (Rust), `ksav.typ:812-869` (Typst), `app/src/settings.ts:88-115` (TS). All three say Frank Ruhl Hofshi / 12 / 2.5 cm / 0.75 em / 1.2 em / a4. Nothing fences them; drift is silent because the Rust value always wins on the wire. |
| The note taxonomy | `ksav.typ` (seven tiers per family), `commands.rs:123-153` (three per family), `app/src/note-commands.ts` (all seven, regenerated). |
| The `#כלול` whole-line directive rule | `engine/src/include.rs:91-107` (Rust) vs `app/src/parts.ts:28-36` (JS regex). Already disagree: `#כלול("")` yields `Some("")` in Rust and is filtered in TS. `parts.ts:22-26` admits *"the two implementations have to agree."* |
| Bundled-font licence facts | `THIRD-PARTY-NOTICES.md:18-70`, `licenses/*`, and a third hand-maintained copy in `main.ts:2468-2496` with no test tying them together. |
| The command registry | `engine/src/commands.rs` (116 entries with `he`/`en`/`category`) and `markdown.ts:19-97`, which re-encodes ~200 name pairs by hand across `HEADINGS`, `EMPHASIS`, `ATOMS`, `DROPPED`, `NOTES`, `LISTS`. The engine already ships the registry to the app as JSON. |
| The "where may this command go" rule | `mode.ts:305-321` (`PAGE_LEVEL`/`COLLECTORS`/`HEADINGS`/`TABLES`, checked against the compiler 1,035 times) and `registry.rs:55-65` (`ONLY_AT_TOP`, a skip list). See §7. |
| "Strip the markup" | `main.ts:965`, `main.ts:2657`, `main.ts:4548`, `spell.ts:264`. Four readers, four regexes, one question. |

The engine's own `sanitize_head_align` (`lib.rs:466-473`) accepts
`חוץ`/`outside`/`חיצוני`/`outer` in Rust while `_en_params` (`ksav.typ:31-58`)
translates the same knob in Typst — two tables, two languages, one setting.

---

## 4. `ksav.typ` writes the apparatus three times, and corrected one bug twice

**Verdict: `rewrite`.** This is in the product's centre of mass, which is why it
matters more than any of the app-layer duplication.

> ### ✅ Fixed — 6 August 2026
>
> Done as prescribed in substance: one implementation, three thin call sites,
> the numbering convention in one array. The finding below is kept verbatim;
> what follows is what replaced it, what the finding got wrong, and what it
> missed.
>
> **The refactor could not be trusted without an oracle, so the oracle came
> first.** `apparatus.rs` asserts *properties* of the page — this note is below
> that one, this band is on page 2. Properties are the right shape for
> describing intent and the wrong shape for proving a rewrite moved nothing: a
> property test passes when the page is *plausible*, and only a comparison of
> the whole layout passes exactly when the page is *the same*.
> `engine/tests/apparatus_golden.rs` renders 41 documents — every knob of all
> three apparatuses, including the ones nothing else reaches (fixed band
> heights, multi-column bands, side-by-side streams, per-band labels, explicit
> stream order, custom numbering, two sections, two pages, all three at once) —
> and pins every run's page, x, y, size and text. Captured at HEAD before a line
> changed, and **byte-identical after**. Verified by mutation first: putting the
> numbering array back the wrong way round turns it red at `band/one-tier`,
> naming the case and the run.
>
> **Five pieces, five differences.** The pieces: `_ap_pick` (what a knob is
> worth for this group), `_ap_note` (the collector), `_ap_entries` (the
> numbering rule), `_ap_group` (one band: entries, columns, fixed-height slot)
> and `_ap_bands` (the rule, the groups, the dividers, the `_ksav_ap_*`
> bracket). The differences the three apparatuses are now reduced to: which
> state holds the config, which label the notes carry, whether a group is a tier
> integer or a stream name, whether the numbering scope is the section or the
> document, and what is printed around the bands. Nothing else.
>
> **The fence is a count, not a snapshot.** A pinned layout cannot see a *fourth*
> copy being written — a new copy renders a new page and the golden is silent
> about it, which is exactly how there came to be three. So the numbering array,
> the apparatus rule, the divider, the force-registration and the fixed-height
> slot may each appear **once** in `ksav.typ`, and all three collectors must go
> through `_ap_note`. Verified by mutation from both directions: adding a
> longhand fourth apparatus, and rewriting `#הערה_זרם` to collect its own way.
>
> **Three things this finding got wrong.**
>
> - **"three config dicts with identical keys" is false of the third.**
>   `_sf_defaults` does not have the same keys or the same *shapes*:
>   `טורים`/`גבהים`/`מספור` are dictionaries keyed by stream name where the two
>   tiered apparatuses use arrays indexed by tier, and `גודל`/`סגנון`/`צבע` are
>   scalars where the others are per-tier arrays. That is why `_sf_mark` and
>   `_sf_wrap` are *not* "the same line, different `cfg`" — only `_md` and `_pp`
>   are. The unification is therefore not "delete two copies": `_ap_pick`
>   answers one question — what is this knob worth *here* — for all three
>   shapes, dictionary, array and scalar, and that is what makes one renderer
>   serve a named apparatus and two tiered ones.
> - **"~350 lines down to ~135" is wrong, and wrong in a way worth stating
>   plainly.** The 375-line region held 286 lines of code, not 350, and about 90
>   of those are the three configuration dicts, the three config setters and
>   thirty aliases — none of which is duplication and none of which can go. The
>   duplicated *logic* — three mark/wrap pairs, three collectors, three
>   renderers — measured **196 code lines**, and what replaced it is **183**: an
>   80-line shared core and 103 lines of call site. Net across the whole file,
>   **9 code lines.** The region is 91 lines *longer*, all of it the header
>   explaining the five axes.
>
>   So the honest accounting is that this collapse saved essentially nothing in
>   length, and that is fine, because length was never the defect. Three copies
>   of a decision shipped a numbering scheme backwards and then took two edits
>   to correct. One copy takes one. That is the whole return, and it does not
>   show up in a line count — which is why the fence counts *homes for a
>   decision* rather than lines.
> - **`_band_apparatus(cfg_state, lbl, group_of, scope_of, opts)` does not
>   work as a single function.** Three of the five differences are not values,
>   they are *positions in the output* — a section title goes above the rule, a
>   band label goes inside the columns, a stream heading goes outside them. An
>   `opts` dict cannot say that; a callback that builds one group can. So it is
>   `_ap_bands(cfg, groups, block_of, …)` with the caller supplying `block_of`,
>   which is also what lets the side-by-side stream layout replace the stacking
>   loop entirely instead of being a flag threaded through it.
>
> **Two it missed.**
>
> - **`_ap_wrap`'s inputs were written twice too.** `סגנון` and `צבע` are
>   *byte-identical nine-element arrays* in `_md_defaults` and `_pp_defaults`,
>   not just `מספור`. Only `גודל` genuinely differs between them, and for a
>   reason worth keeping (the footer bands sit in the margin and run a shade
>   smaller). Three shared arrays now, not one.
> - **`lib.rs`'s `PAGE_APPARATUS_COMMANDS` was the ninth copy and the finding
>   only asked for it to shrink.** It prescribed collapsing the eight strings
>   and the two scanners into "does the body call anything in the
>   footer-rendered family" — but the two scanners are load-bearing (one refuses
>   a prose mention, the other catches `סוג: מדף_בדרגה`, where the command is a
>   *value* with no bracket after it) and the eight strings are a legitimate
>   prefix table. What was missing was not brevity, it was a check.
>   `the_page_foot_reserve_list_matches_the_prelude` now derives the
>   footer-rendered family **out of `ksav.typ`** — the `_ap_note` call sites
>   carrying a footer label, plus every alias delegating to one, transitively,
>   which finds all 22 — and compares it to the list in both directions. A new
>   alias missing from the list fails; an entry naming nothing fails. Both
>   verified by mutation. The bug it prevents is quiet: the page keeps its full
>   text height and the apparatus runs off the bottom of the sheet.
>
> **The steelman held, entirely.** The query-and-rank design is untouched:
> numbering is still `query(...).before(loc).filter(...).len()`, the footer still
> only reads, `_ksav_real` still tells an original from a re-display by document
> order rather than by content or coordinates. What was separable was separated —
> *deciding* what a band contains is now one thing, and it was always one thing.
>
> Cost: two code files (the prelude and the engine lib), +1 test file, +1
> fixture, four documents. `cargo test` 357 (+5: four in the new golden and
> prohibition file, one in the engine lib), `npm test` 3,013 unchanged across 46
> files — the app never touched a private prelude name, which is the check that
> this was engine-internal. `cargo fmt --check` and
> `cargo clippy --all-targets -D warnings` clean.

`ksav.typ:162-189` already defines exactly the parameterisation needed —
`_ksav_real`, `_ksav_rank(sel, loc, pred)`, `_ksav_between(sel, marker, loc)`.
Scope is already a parameter. Grouping is already a predicate. Then lines 278–658
write the *rendering* out three times anyway:

- `_md_defaults` 278-289 / `_pp_defaults` 416-430 / `_sf_defaults` 543-559 — three
  config dicts with identical keys
- `_md_mark` 296 / `_pp_mark` 437 / `_sf_mark` 567 — same line, different `cfg`
- `_md_wrap` 297-302 / `_pp_wrap` 438-443 / `_sf_wrap` 568-573 — same five lines
- `מדור_בדרגה` 321-335 / `מדף_בדרגה` 447-461 / `הערה_זרם` 576-587 — same five
  statements, differing in a label string and a key name
- `הערות_מדורגות` 339-373 / `_pp_page_bands` 465-511 / `_sf_page_streams` 596-652 —
  the same rule → group → number → block loop, three times
- `גבהים` (fixed-region heights) implemented twice and *differently*: array-indexed
  at 476-501, dict-keyed at 607-626

**The duplication has already bitten, and the file records it.** `ksav.typ:277`
notes that the א,ב,ג-over-1,2,3 numbering *"shipped the other way round for a long
time — backwards against the convention and against the chooser card that described
it."* `ksav.typ:415` is the second copy of the same fix, and its comment reads
*"Same order as the section bands, and for the same reason."* One correction,
applied by hand, twice, months apart.

**The change:** one `_band_apparatus(cfg_state, lbl, group_of, scope_of, opts)` —
about 90 lines — plus three ~15-line call sites differing in the four things that
actually differ: which `state` holds the config, which label the notes carry,
whether the group key is a tier integer or a stream string, and whether the scope
selector comes from `_ksav_between(dump_marker)` or `e.location().page() == pg`.
Same eleven layouts on the page, ~350 lines down to ~135, and the numbering
convention in one dict. Downstream, `lib.rs:138-147`'s eight-string
`PAGE_APPARATUS_COMMANDS` list and its two hand-written scanners
(`apparatus_is_called`, `apparatus_is_named_as_kind`, `lib.rs:177-216`) collapse to
"does the body call anything in the footer-rendered family."

**Steelman that survives and should be recorded:** the query-and-rank design itself
(`ksav.typ:162-189`) is right and hard-won. A page footer that only reads cannot
feed back into layout, which is what makes per-page regrouped bands possible at all;
the comment at 148-161 shows they first tried dedup-by-content-key and discovered it
merged two notes that both said "עיין שם." The cost — numbering is
`query(...).before(loc).filter(...).len()`, quadratic in notes per apparatus — is
paid knowingly. Keep the mechanism. Write it once.

---

## 5. The prelude is concatenated, and a region exists to undo it

**Verdict: `wrong-but-keep`, with one cheap extraction.**

> ### ✅ Fixed — 7 August 2026
>
> The `wrong-but-keep` half is accepted and unchanged: the prelude is still
> concatenated, the coordinate corrections still exist, and no consumer of a
> corrected coordinate was revisited. What is answered is everything this
> section says *should happen regardless* — and the extraction turned out to be
> the smallest of the three things wrong here.
>
> **The extraction, as prescribed.** `assemble` is a twelfth service in
> `engine/src/services.rs`, so it reaches all four builds by being one line in
> Rust: the HTTP route, the dev proxy, the wasm export and the desktop command
> are all generated from that table. `exportTypst` asks for it instead of
> running a full render with the PDF and reading one field off the response.
> Measured head to head in one process, `cargo run --release --example
> bench-export`:
>
> | | compile + PDF | assemble | |
> |---|---|---|---|
> | 1 siman | 12.5 ms | 0.70 ms | 18× |
> | 10 simanim | 17.3 ms | 0.46 ms | 38× |
> | 40 simanim | 45.8 ms | 0.58 ms | 79× |
>
> The ratio grows because only one of the two columns is a function of the
> document; assembling 111 KB of prelude costs the same half-millisecond
> whatever is after it.
>
> **They are one path, not two.** The obvious way to lose here is for export and
> compile to produce different files — a different `#כלול` expansion, a page
> setup read one way in one place. Both services now read the request through
> one `read_document` (body, includes, config) and hand the same two values to
> the same `assemble_source`, and `engine/tests/assemble.rs` asserts the two
> routes are **byte-identical** over nine requests chosen to exercise every
> field that reaches the wrapper — full page setup, per-edge margins, two-sided,
> quotes and backslashes in the strings, English/LTR, an included chapter, and a
> chapter that does not exist.
>
> One behaviour changed on purpose: a `#כלול` naming a document the library no
> longer holds now **stops the export and says which chapter**, where before the
> hole travelled out inside the file. It is the one problem this service can
> still report without laying anything out.
>
> **`body_offset` was the expensive half, and the finding files it as a symptom
> rather than as the cost.** It is quoted here as *"measures the prelude by
> assembling the whole thing again with an empty body and subtracting one, per
> compile and twice per jump"* — which is exactly right, and it is 111 KB of
> `format!` to learn one integer. Every caller already holds both strings it
> needs, and `assemble_source` ends in `{body}\n`, so the answer is
> `assembled.len() - body.len() - 1`: exact, free, and derived from the same
> format string the slow one is. `Located::of` takes the body instead of the
> config now, and `jump.rs` reads it off the assembly `with_layout` had already
> built rather than building a second one twice per click.
> `the_cheap_offset_is_the_same_offset` sweeps the two against each other over
> ten configs × four bodies, the configs chosen for the fields that change the
> wrapper's *length*.
>
> **The `#let` convention is no longer a convention.** The finding is right that
> `enclosing_let` rests on `rfind("#let ")` assuming a flat list, and right that
> the assumption holds today only by a spelling habit — the census is now 360
> column-0 `#let` and 187 indented `let` written without the hash, over 2,324
> lines, with nothing testing it. It is anchored to column 0, so the habit no
> longer has to hold, and `every_top_level_let_names_itself` sweeps all 360 of
> them: a point in the middle of each definition must resolve to that
> definition's own name.
>
> **The sweep found a bug the finding did not, and would not have.** Reading the
> name out of the *truncated* prefix meant a span landing inside the name itself
> returned a truncated one — `#let pageband1` reported as `#pageband`, `#let
> anchor` as `#ancho`, `#let blockquote` as `#blockquot`. Seventeen of the 360.
> That is a wrong command name handed to a writer, which is rule 4's own
> prohibition, in the function written to obey it. The name is read from the
> whole prelude now.
>
> **One more, in the fence rather than the product.** `services.test.mjs` says
> in its own prose *"one row per method of `Backend` and `Sources` — if a method
> is added and not listed here, the count assertion at the end fails."* The
> count assertion was `asked.length === CALLS.length`, which compares a list to
> itself and is true of any list, including one covering half the interface —
> `ONLY_AT_TOP` rebuilt in a second file. The two interface declarations are now
> read out of `api.ts` and compared with the methods the rows actually drive, in
> both directions, so the sentence is checked rather than asserted.
>
> **Not done, and deliberately.** `with_static_file_resolver` is still not used
> for the prelude. The finding's own reason stands — every consumer of a
> corrected coordinate would need revisiting, and the corrections are
> individually tested — and the two costs it was carrying (the export compile
> and the per-call re-assembly) are the ones that are gone.
>
> Cost: 13 files, +2 test files, +1 example, +1 service. `npm test` 3,556 across
> 58 files (+10), `cargo test` 383 across 25 binaries (+8), `tsc` clean,
> `vite build` clean, `cargo clippy -D warnings` clean.

`assemble_source` (`lib.rs:584-655`) prepends the generated sefarim table, the
2,238-line prelude and a `#show` wrapper as **text** into the user's document.

*Buys:* one `Source`, one `FileId` stable across compiles, which is what lets
`Located::of` resolve spans without holding Typst's `World`
(`diagnostics.rs:552-556`) and lets comemo's cache hit across keystrokes. A
self-contained `.typ` export. Genuinely clever.

*Costs:* 111,731 bytes re-serialised and re-parsed on every keystroke — the code
itself measures 4.2 ms of a 14.4 ms one-page compile as span resolution over "83 KB
of prelude" (`lib.rs:784-790`). And it births an entire coordinate-correction
régime: `diagnostics::body_offset` (`:107-109`) measures the prelude by *assembling
the whole thing again with an empty body and subtracting one*, per compile and
twice per jump (`jump.rs:140, 170`); `spot`/`byte_of` (`jump.rs:192-223`); the
`in_body` closure and prelude-span branch (`diagnostics.rs:174-214`);
`enclosing_let` (`:220-229`), which scans backwards through prelude *text* to guess
which command failed; and `sole_call` (`:235-251`), which recovers a line by
counting substring occurrences of a command name in the body and using the answer
only if there is exactly one.

`enclosing_let` rests on `rfind("#let ")` assuming the prelude is a flat list.
`ksav.typ` has 349 column-0 `#let` and 204 *indented* `let` written without the
hash — so the assumption holds today by a spelling convention nothing tests or
lints. One indented `#let` and it starts naming the wrong command.

The alternative was available throughout: `with_static_file_resolver` is already
used for images (`lib.rs:686-689`), so `ksav.typ` and the sefarim table could be
registered files and the main source could be four lines — `#import "ksav.typ": *`
plus wrapper plus body. Writer's line 1 becomes roughly line 4, comemo caches the
parsed prelude by its own `FileId`, and `typst_source` export becomes the document
rather than a 115 KB dump.

**Why `wrong-but-keep`:** every consumer of a corrected coordinate would need
revisiting, and the corrections are individually tested. **The cheap extraction that
should happen regardless:** `assemble_source` is `pub` and pure, but
`app/src/compile.ts:220` triggers a *full Typst compile with PDF* just to obtain the
string it returns for free. Expose it through the wasm binding and "export .typ"
costs a `format!` instead of a compile.

---

## 6. The sibling-repo dependency: this repo does not build from a fresh clone

**Verdict: `rewrite`.**

> ### ✅ Fixed — 6 August 2026
>
> The finding is right in every particular that was checked, and it under-counted
> the damage. Below: what replaced it, why the prescription was not taken, and
> the consumer nobody had noticed was broken.
>
> **A git dependency pinned by SHA, not a submodule.** The finding's two
> separable halves — *share the code* (good) and *a relative path with no
> fallback* (bad) — are the right cut. Its prescription, a submodule at
> `vendor/sefer-crates`, is not, for two reasons that only show up when you try
> to write the instructions:
>
> - **A submodule reproduces the failure it is fixing.** `git clone` without
>   `--recursive` gives you an empty directory and `cargo metadata` fails on a
>   path that does not resolve — the same error, one flag away, and the flag is
>   the single most forgotten in git. A git dependency has no flag: cargo fetches
>   it exactly as it fetches typst and serde, and there is no state a reader can
>   be in where the clone is present and the dependency is not.
> - **It would put a second `sefer-crates` on the desk.** There is one working
>   copy and Girsa reaches the same one (`Girsa/Cargo.toml:51-56`, still by
>   sibling path). A submodule inside Ksav is a *different checkout*, so the
>   paired edit the steelman is built on — change what a quote block is, see it
>   on both sides — would silently stop working, which is trading the good half
>   away to fix the bad one.
>
> So: `{ version = "=0.5.0", git = "…/sefer-crates", rev = "5a589af…" }` in both
> manifests, and `.cargo/config.toml.example` — git-ignored once copied — puts
> the sibling checkout back for the days you are moving the seam. The finding's
> own alternative was half-right: an override needs no crates.io publication,
> `[patch]` works against a git source directly. It is a `paths` override rather
> than `[patch]` for a reason found by trying both — **`[patch]` rewrites
> `Cargo.lock` and erases the pin from it**, five entries to zero on the first
> `cargo metadata`, so a week of paired work ends one `git add -A` away from
> committing a lock file with no pin. `paths` leaves it byte-identical.
>
> **Point 3 of the finding is the one that mattered most and it is now literally
> true.** `= 0.5.0` was a pin that could not fail; the rev is one that can. All
> three lock files record it (five crates each — `girsa-ref` and `girsa-hebrew`
> arrive transitively), which is the first time this repository has recorded
> *which* sefer-crates it was built against.
>
> **Point 4 done as written.** `girsa-source` and `girsa-ksav` moved under
> `cfg(not(target_arch = "wasm32"))` beside `girsa-post`, and `src/source.rs`
> with them — it is their only consumer here and `post.rs` is its only caller, so
> the browser build had been compiling the packet schema and the citation writer
> for an application that cannot be running beside it.
>
> **What the finding missed: a ninth consumer, with no workaround at all.** It
> counted eight `actions/checkout` steps across two workflows as proof the
> workaround was load-bearing, which is right as far as it goes. But
> `packaging/build-linux.sh` bind-mounts **only this repository**, at `/work`, so
> the desktop shell's `girsa-post` resolved to `/sefer-crates` — a directory that
> was never in the image and never could be. The documented way to build the
> Linux `.deb` and `.AppImage` could not have produced one, and unlike CI there
> was nothing there to hide it: no second checkout, no error anyone had seen, and
> not a word in the README. The workflows were the loud half of the finding; this
> was the silent half.
>
> **And the first command in the root README failed for a second, unrelated
> reason.** `cargo run --release --features embed-ui -- serve` embeds
> `app/dist`, which is git-ignored build output, so even with the crates
> resolving a clone died inside `include_dir!`. That is the same finding —
> *this repository does not build from a clone, and nothing says why* — arriving
> through a different door. `engine/build.rs` now turns it into the two-line
> instruction it always was, and the README gives both steps.
>
> **The fence caught itself first.** Seven mutations, one control. Restoring a
> sibling `path` dependency turns two red; bumping the rev in one manifest only,
> one; bumping both and leaving the lock files behind, one; deleting the override
> example, one; adding an uncounted fourth shared crate, one; and dropping the
> git URL out of the README's example, one. The seventh — **renaming the README
> section** — came back **green**, because the assertion matched the phrase *the
> shared crates* and the phrase also occurs in two cross-references elsewhere on
> the same page, both of which this change had written. That is §7's
> `chrome.test.mjs` defect — a fence crediting a surface by a name that is not
> the thing it guards — reproduced inside the test written to keep these findings
> from coming back, on the same day, by the same hand. It matches the heading
> now, and the mutation is red.
>
> **The fence: `engine/tests/manifests.rs`.** Five tests. No path dependency in
> any manifest resolves outside the repository; every `girsa-*` dependency is a
> git dependency on sefer-crates; all four of them name one rev and one exact
> version; every lock file records that rev; and the README still documents the
> arrangement. The middle one is not ceremony — the desktop binary links the
> engine and the Tauri shell into one process, so two revs would put two
> `girsa-post`s in it, the loopback desk and the deep-link parser disagreeing
> about the wire between them. That failure did not exist while the dependency
> was a path, and it is the bill for the pin.
>
> **Cost, against the estimate.** *"~1 hour, −8 CI steps"*: five checkout steps
> removed (four of nine in `ci.yml`, one of two in `release.yml`), and with them
> the `path: Ksav` prefix on every `working-directory`, `workspaces`,
> `cache-dependency-path` and `projectPath` in both files. Twelve files edited
> (`+233 −92`) and three added — `manifests.rs` (352), the override example (70),
> `build.rs` (45). The hour was the four dependency lines. The other 467 are the
> sentence nobody had written, in the three places a reader can hit the wall.
>
> **What the pin costs, said out loud.** The steelman's safety property is that
> *"Girsa's CI already builds Ksav against every proposed change, so the coupling
> is verified from the end that moves."* That is `sefer-crates`'
> `tools/check-dependents.sh`, and it builds each sibling checkout **against its
> working tree** — which worked because the sibling *was* the dependency. Ksav
> now builds against the pin, so the Ksav half of that check would compile old
> code and pass whatever the change broke. Silently: a green check that has
> stopped checking, which is the disease this whole report is about, and it would
> have been introduced by a fix for a different case of it. It needs one flag on
> one line, in the repository where the change is being made
> (`--config "paths=[…]"`, verified); `ksav/README.md` carries it under *What the
> pin costs the other repository*. Girsa is unaffected — it still reaches
> `sefer-crates` by path, and has the fresh-clone problem this finding describes,
> unfixed, at `Girsa/Cargo.toml:51-56`.
>
> **Verified, not inferred.** The tree copied to a directory with no
> `sefer-crates` anywhere above it: `cargo metadata` resolves in all three Rust
> trees, where the same copy would have failed before a compiler ran. The wasm
> build compiled `ksav-engine` and `ksav-wasm` and **not one girsa crate**, which
> is point 4 measured rather than argued. `build.rs` exercised both ways: silent
> without the feature, and with `embed-ui` and no `app/dist` it prints the two
> lines and stops. `paths` versus `[patch]` run head to head against the lock
> file. Engine suite and editor suite green.

`engine/Cargo.toml:35, 38, 53` and `src-tauri/Cargo.toml:30` point at
`../../../sefer-crates/crates/…` — resolved from `ksav/engine/`, a *sibling of the
Ksav checkout root*. No submodules, no `[patch]`, no vendoring, no
`.cargo/config.toml`. `git clone ksav && cargo build` fails at `cargo metadata`,
before a compiler runs.

**Not one `.md` file in the repository contains the string "sefer-crates"** — not
the README, not the Develop section (`ksav/README.md:346-355`), not the wasm section
(`:409-415`), both of which hand you cargo commands that cannot work. CI works
around it with a second `actions/checkout` in **four** of five jobs
(`ci.yml:70-76, 112-118, 139-145, 196-202`) and all four release matrix legs
(`release.yml:51-57`); `ci.yml:11-25` records that the very first CI run failed
this way, and commit `885cae3` is titled *"Ksav's CI could not build Ksav, because
sefer-crates was never checked out."*

### Steelman, and it is good

Ksav and Girsa are one product built by one person, released together, and
`sefer-crates` is not a library — it is the seam between two halves of a pair.
Publishing to crates.io to change what `#ציטוט` looks like would mean cutting a
release, waiting for the index, bumping two manifests, and gaining nothing except
strangers depending on a crate you don't want depended on. A path dep makes a
format change one edit visible to both sides instantly. Girsa's CI already builds
Ksav against every proposed change, so the coupling is verified from the end that
moves. `spec.md §10.3` is right on its own terms: a prose agreement between two
repositories about what a quote block is would drift, and the drift is invisible
until a sefer is printed.

### Where it breaks

All of that argues for **sharing the code**. None of it argues for **a relative path
with no fallback and no documentation**. Those are separable, and the repo pays the
full price of the second for the benefit of the first:

1. Fresh clone fails before any compiler, with a message about a directory the user
   has never heard of.
2. Zero documentation mentions it.
3. `= 0.5.0` reads as a pin and is not one — path always wins, there is no version
   to fall back to. The comment beside it concedes the real check lives in the other
   repo's CI.
4. The coupling is unconditional (`:35, 38`) where `girsa-post` is correctly gated
   (`:48-53`), so the offline browser build compiles the packet schema and citation
   writer for an application that is not there. Ksav uses **three items**
   (`to_ksav`, `CitationPlacement`, `live_citation`) out of `girsa-ksav`'s 1,374
   lines; its `read.rs` (954 lines) is entirely unused here.
5. Eight `actions/checkout` steps across two workflows prove the workaround is
   load-bearing rather than incidental.

**The change:** a git submodule at `ksav/vendor/sefer-crates` with paths pointing
into it. `git clone --recursive` builds; CI drops eight steps; the version becomes a
commit SHA, which is the real pin `= 0.5.0` is pretending to be. Or publish and keep
a `[patch.crates-io]` override in a git-ignored `.cargo/config.toml` —
`girsa-ksav`'s own `#![doc(html_root_url = "https://docs.rs/girsa-ksav/0.5.0")]`
suggests somebody already intended this. Either way, move `girsa-source`/`girsa-ksav`
under the `cfg(not(target_arch = "wasm32"))` block beside `girsa-post`.

---

## 7. The test suites: three genuinely good ideas, and three that measure nothing

**Verdicts: mixed — `delete` for four named blocks, `rewrite` for one, keep the rest.**

> ### ✅ Fixed — 6 August 2026
>
> Done as prescribed for the runner and for `ONLY_AT_TOP`, and in one place
> deliberately not as prescribed, because the prescription would have asserted a
> path no writer can reach. The finding below is kept verbatim; what follows is
> what replaced it, what it got wrong, what it missed, and the mutation for each.
>
> **The headline number is right and the diagnosis under it is wrong.** *"19
> modules / 9,207 lines cannot be built by the test runner at all"* — the count
> is right (19 modules, 9,081 lines today) and "cannot be built" is not. Sixty-one
> of the 62 modules build with the runner's own esbuild settings, and all but
> `main.ts` import cleanly in node; only `wasm-worker.ts` genuinely cannot, because
> its `?url` wasm import is a Vite resolution. The hole was never technical. It was
> that `MODULES` was a hand-written array and **nothing in the repository compared
> it to the directory**, so it stopped growing and nobody could see that it had.
> The honest statement is stronger than the finding's: **not one test file imported
> any of the nineteen.** Not `exports.ts`, not `save.ts`, not `compile.ts`, not
> `files.ts`, not `ksav-lang.ts`.
>
> **"Ten lines of `readdirSync` would close it" closes the symptom.** The list is
> read off `src/` now, and what keeps it honest is `runner.test.mjs`: every module
> is built or declared unbuildable *with a reason that file executes*; every
> buildable module is **imported by at least one test** or declared un-importable
> with a reason; and no test may bundle its own private copy of a module, which is
> the workaround the hole produced last time and the way it would hide again.
> `test/modules.mjs` holds the two exemptions and both are claims, not names —
> `chrome.test.mjs`'s `NO_CLOSE_NEEDED` idea, pointed at the runner.
>
> **Two things the finding could not have seen, both found by acting on it.**
>
> - **The test build gave every entry point its own copy of every module.** No
>   code splitting, so `.tmp-test/exports.mjs` and `.tmp-test/runtime.mjs` held
>   *two different* `runtime` singletons — and `runtime.ts` is the module whose
>   entire purpose is that there is exactly one of each. `setView` in a test landed
>   on a copy the module under test could not see, silently: the call succeeds and
>   changes nothing. **Every cross-module fact in the application was untestable,
>   and would have failed closed**, which is the worst way for a harness to be
>   wrong. `splitting: true`, and the test build agrees with the shipped one.
> - **`brackets.ts` broke an invariant two other modules rest on.** `compile.ts`
>   and `diagview.ts` both state that healing never inserts or removes a newline,
>   which is the only reason an engine line number can be mapped onto the writer's
>   own text — and the unterminated-comment repair appended `\n*/`. One document
>   shape where the invariant was false, silently. Worse, `bracket-lint.ts` spelled
>   the same repair *again* and the two had drifted, so healing one problem and
>   healing all of them produced different documents. One spelling now, taken from
>   `analyze`, and the invariant is asserted rather than commented.
>
> **The two live bugs in §9b were exactly where the hole predicted.** `exports.ts`
> was one of the nineteen. Print never called `warnIfHealed` and put closers the
> writer never typed onto paper; it warns in the status bar *and* in the print
> window itself now, behind `@media print { display: none }`, because the status
> bar is behind whatever the browser just opened over it. `reflowableHtml`
> announced its *caller's* outcome — "exporting page images instead" — which was
> true of `exportHtml` and false of `exportWord` and `copyForWord`, the two that
> produce nothing: the one route where no file appeared was the route that
> announced an export. It reports a reason now and each caller says what it did.
>
> **`ONLY_AT_TOP` is gone, and the finding's arithmetic on it holds exactly.** Six
> of the nine are `legal: true` in `note-body`, `list-in-item` and `table-in-cell`
> in `insertions.json`, verified against the fixture before anything was deleted.
> `registry.rs` is deleted; both survivors moved into `insertion.rs`, where the
> grid they belong to already lives. What replaces the skip list is
> `the_grid_exempts_nothing`: commands × contexts with no holes, every one of the
> nine present in all nine contexts, and every refusal carrying a reason — because
> the way a skip list comes back is not somebody re-adding the constant, it is a
> `continue` inside a sweep.
>
> **One prescription was tried and is wrong: widening the grid to English.** It
> was built. It fails, and the failures are about the fixture rather than the
> product — because **the Insert menu, the toolbar and the palette all write
> `c.insert` verbatim**, so the app never writes an English registry name into
> anything. An English writer who picks Footnote gets `#הערה[]` in their English
> document. A grid of English insertions therefore asserts a path no writer can
> reach, and its failures — a Hebrew parameter name left inside an English call —
> are artefacts of the name swap. The English forms the app *does* write (lists,
> headings, tables, tiered notes) are already compiled, twelve English documents
> of them, in `structure-edits.json`. The name check is what is honestly
> assertable here and it is stated as exactly that, with the reasoning left in the
> source. **The real finding underneath is a product one and is not fixed: the
> Insert menu writes Hebrew markup into English documents**, which is §9a's defect
> family on a surface §9a did not touch.
>
> **The hollow assertions went, and the count went down.** `help.test.mjs` 309 →
> 28: a loop of 285 restating one fact, now three `filter`s that name every
> offender at once instead of stopping at whichever one the loop reached first.
> `coverage.test.mjs` 145 → 47: `inInsertMenu = (c) => !c.deprecated` asked the
> registry a question about the registry and agreed with itself, in a file whose
> stated purpose is "reachable from a surface a pointer can touch" and which
> **never looked at a surface**. It reads `main.ts`'s menu builder now and asserts
> that `!deprecated` is still the only thing dropped — which is what makes the
> claim true rather than a definition of itself. `registry.rs`'s empty `if` went
> with the file.
>
> **The suite is smaller and covers more, which is the point.** 3,482 assertions
> across 58 files, from 3,595 across 50: **+8 files, +16 modules with a test,
> −382 assertions.** What got cut is the finding's own honest split — the 33%
> asserting registry shape and the 11% reading source as text.
>
> **Eight mutations, every one run.** A false unbuildable claim; the genuine
> exemption dropped; the runner given a second hand-written list; the heal
> restored to adding a line (red in two files); a test bundling its own module; a
> test importing `main.ts`; a new module landing in `src/` with no test; and a
> command dropped from the grid. All eight red. The sixth also exposed a defect in
> the guard itself — it fired on a *commented-out* import, which is
> `chrome.test.mjs`'s old failure in the safe direction — so the sweeps read code
> and not prose now, and that mutation was re-run against a real import.
>
> **What was not touched.** `probe.rs`, `assert_same_page`, `apparatus_marks.rs`,
> the generated-fixture pipeline and `sources.test.mjs` are named right in the
> finding and are untouched. The `npm run fixtures` papercut is fixed: it
> regenerates the insertion fixtures now, which was the one command a developer
> runs when `npm test` says "stale".
>
> Cost: 24 files, +9 test files, +1 module, −1 engine test binary. `npm test`
> 3,482 across 58 files, `cargo test` 366 across 23 binaries, `tsc` clean,
> `vite build` clean.


### What is right, and should be named

- **`probe.rs` (155 lines).** Reads the *laid-out* document — y, leftmost x, font
  sizes, text, per visual line. Fifteen of seventeen engine test files depend on it.
  Without it every apparatus assertion is `compile().ok()`, which cannot see a note
  in the wrong column. This is the region's load-bearing wall.
- **`deferred_notes.rs:63-84` `assert_same_page`.** An equivalence oracle: render
  the inline and deferred spellings of the same document, compare every run's
  (page, x, y, size, text) at 1/20 pt, over eleven layouts. It needs no knowledge of
  what a layout *should* look like, only that two spellings agree. Cheap to write,
  impossible to fool. **The strongest test in the repository**, and the shape more
  of them should have taken.
- **`apparatus_marks.rs:3-19`.** The most valuable prose in either suite: three
  audits and 2,276 green assertions missed that the tiered apparatus was numbered
  upside down, because *a numbering scheme changes neither page nor y — it changes
  the glyph, and nothing asserted on glyphs*. Correct diagnosis; the file that fixes
  it is 207 lines.
- **The generated-fixture pipeline** (`emit-*-fixtures.mjs` → JSON → Rust, with
  `--check` in `npm test`). Measured: `structure` runs 168 full Typst compiles in
  5.13 s; `insertion.rs`'s 1,035 is ~30 s single-threaded, honest under parallelism.
  It is the only construct in the repo that can catch "the app writes source the
  engine mis-renders," which is the documented bug family. **Fence, not ritual.**
  One papercut: `package.json`'s `"fixtures"` script regenerates note and structure
  but **not insertion** — the one command a developer runs when `npm test` says
  "stale" cannot fix the biggest fixture.
- **`sources.test.mjs` (7 assertions).** A *prohibition* swept over every file in
  `src/`. A regex can enforce "any line matching this shape is a bug" perfectly.
  Cheapest assertions in the suite.
- **`prose.test.mjs:26-50`.** Bundles `ksav-lang.ts` with the *real*
  `@codemirror/state`, constructs an `EditorState` at every offset of 23 documents,
  and iterates the actual decoration set. A real object graph, not a regex over its
  source. It catches "blank editor at exactly one caret position" — a failure no
  string match could describe. **This file is the refutation of the argument that
  the chrome cannot be tested without a browser.**

### `registry.rs:55-65` — a skip list dressed as documentation

**Verdict: `delete`.** `ONLY_AT_TOP` lists nine commands exempted from the "does it
compile here" sweep. `registry.rs:114` `continue`s past them, so an entry is
**unfalsifiable by construction** — a listed command can never make the test red no
matter what it does. **Six of the nine are provably wrong**: `תוכן`,
`הערות_בסוף`, `הערות_בסוף_צד`, `הערות_מדורגות`, `מפתח_ענינים` and `מפתח_מקורות`
are all `legal: true` in `note-body`, `list-in-item` and `table-in-cell` in
`insertions.json`.

So `insertion.rs:59` asserts they compile nested while `registry.rs:114` skips them
for allegedly not being able to, **and both tests are green.** That is precisely the
shape this repo has spent 2,576 lines of audit prose describing — two surfaces, one
lying, nothing to catch it — *reproduced inside the test suite that exists to detect
it.* The `mode.ts:305-321` version of the same rule is right, because
`insertion.rs:87` `every_refused_insertion_would_really_have_failed` fails if a
refusal was unwarranted. One list is checked; the other is prose that happens to
compile.

**The change:** delete `ONLY_AT_TOP` and `registry.rs`'s first two tests. Move the
two survivors — the both-languages existence check (`:158`) and
`a_command_given_text_shows_that_text` (`:228`) — into `insertion.rs`, and widen the
grid to carry `en` alongside `he` (`emit-insertion-fixtures.mjs:99-110` already
parses both names out of `cmd!` and discards `en` at :106). Then there is exactly
one statement in the repo of "where may this command go," it lives where the UI
reads it, and it is checked in both directions by the compiler. The English half of
the command language gets the coverage the Hebrew half has.

### `chrome.test.mjs` — a fence made of string matches

**Verdict: `rewrite`.**

> ### ✅ Fixed — 6 August 2026
>
> Done as prescribed: one exported array, `openPanel`/`closePanel` in place of
> the hand-written pairs, the Escape handler derived from the list, and the test
> importing the array instead of grepping a 5,653-line string. The finding below
> is kept verbatim; what follows is what replaced it, what the finding got
> wrong, and what it missed.
>
> **The finding's own claim was checked before it was acted on, and it is
> overstated by one.** *"Delete the real Escape handler and all six assertions
> still pass"* — five do. `dismissOnboard` fails, and only by luck: its
> *definition* sits 104 lines past `e.key === "Alt"`, which is where the slice
> happens to end. That is not a defence of the test, it is a worse indictment,
> and the mutation that shows it is one line: with the handler deleted, adding
> a **comment** that merely says the word `dismissOnboard` anywhere inside the
> 3,967-line window turns the sixth assertion green again. So the honest
> statement is that **the application can answer Escape nowhere at all and the
> guard is 59/59**, bought with a comment. Verified, both halves.
>
> **The `overlay` collision is worse than "the guard stays green".** Renaming
> two unrelated locals — `overlay` → `pal` in `openPalette`, `overlay` →
> `chooser` in `openNotesChooser`, a pure refactor touching neither surface —
> makes `welcome` **disappear from the guard entirely**. Assertions drop 59 → 56
> and the welcome overlay's only exit can then be deleted with the suite green.
> A surface the reachability test cannot see is a surface with no reachability
> test, which is the failure this file's own header names.
>
> **Three things this finding got wrong.**
>
> - **`palette-list` is not a surface**, and it was carrying an *exemption* —
>   `NO_CLOSE_NEEDED`, with evidence, checked in both directions — excusing a
>   plain `<div>` from a rule it was never subject to. It never touches the
>   `open` class; `renderPaletteList` binds a local called `list`, and so does
>   `lazyMenu` forty lines away. The best idea in the file was being spent on a
>   phantom. `welcome` is the same error: it is born `class="overlay open"` and
>   dies by `.remove()`, so the class scan never saw it either. Two of the
>   sixteen "surfaces" the guard found were name collisions.
> - **The real dropdown menus were invisible to it.** `.menu-list` elements do
>   take the `open` class — in `lazyMenu` and in `runtime.ts`'s `closeMenus`,
>   both through locals rather than `getElementById`, so neither was ever
>   scanned. The one family of surfaces that opens on every session was outside
>   the guard.
> - **"~250 lines out of `main.ts`" is wrong, and in the same direction as §4's
>   line count.** `main.ts` went 5,662 → 5,644: **eighteen lines**. About 120
>   lines of mechanism left (twelve open/close pairs, ten hand-built heads, five
>   scrims, the twelve-call Escape list) and about 100 came back, because the
>   side effects that used to be one-liners inside twelve close functions —
>   `modalOk = null`, `openHydraState = null`, the persisted-drawer writes,
>   `view.focus()` — have to be *written down* to be shared. That is the whole
>   trade and it is worth stating plainly: this bought no brevity. It bought one
>   home for a decision, and a guard that fails when the decision is broken.
>
> **Two it missed, and one of them was live.**
>
> - **The hydra had no Escape at all once its own buttons had focus.** It is not
>   in the twelve-call list; it answers Escape only through a CodeMirror keymap
>   at `Prec.highest`, which fires while the *editor* has focus. Click a hydra
>   button that does not close it and the keyboard-owning panel is unreachable
>   by the key everyone tries first. §11 predicted this exactly — *"a thirteenth
>   panel silently doesn't get Escape"* — and did not notice it had already
>   happened. It is in the sweep now by being declared, and the registry refuses
>   `escape: false` for anything that is not a saved preference or caret-driven,
>   so it cannot fall back out.
> - **A derived sweep is weaker than the list it replaces unless it carries the
>   side effects.** The twelve calls were not class-strippers: `closeModal`
>   dropped a pending callback, `closeHydra` dropped the operation set it was
>   driving, `closePalette` handed focus back. `closePanel` runs the panel's
>   hooks and — new, and load-bearing — **does nothing at all when the panel was
>   not open**, which is the guard `dismissOnboard` used to carry by hand with
>   its reasoning in a comment. Escape is pressed constantly; without it the
>   sweep marks a reader onboarded every time they dismiss a completion.
>
> **The fence is thirteen mutations, and every one was run.** Eleven must go red
> and two must not: deleting the global Escape call, deleting a panel's `×`,
> opening a surface by hand outside the registry, building a `×` by hand, the
> hydra opting out of Escape, `panelHead` emitting no `×`, `closePanel` skipping
> its hooks, `closePanel` firing hooks for something already closed, the
> backdrop swallowing clicks on the panel's own contents, the two anchored menus
> becoming indistinguishable, a surface dropped from the registry while still in
> use, and the nikud bar's CSS starting to cover the document. The two that must
> stay green: the local-renaming refactor that used to blind the old guard, and
> the suite at rest. 13/13 as expected.
>
> **Verified in a browser, not only in `node`.** Built, served, and driven: the
> settings drawer and the help panel opened together, **one Escape closed both**
> and left the nikud bar and outline pane — the two persisted surfaces — alone;
> the outline drawer's `×` closed it *and* flipped `settings.outline` true →
> false, which is the hook doing the work that a `×` bypassing persistence would
> have silently skipped. The hydra's Escape was not reachable this way (it needs
> a live engine to put a table under the caret) and rests on the unit test and
> its mutation. One unrelated thing turned up: `maybeOnboard()` is called only
> after the command registry resolves, so with no engine reachable the welcome
> overlay never appears at all — defensible in the shipped builds, where the
> registry comes from wasm, and noted rather than changed.
>
> **The steelman held.** `main.ts` is still one file and still the exhaust; no
> framework arrived; the panels' *contents* did not move, because a settings
> drawer is two hundred lines about this application. Only the frame moved —
> which is what `ACTIONS` and `STRUCTURE_ACTIONS` already do in the same file,
> and what `bindings.ts` did for the keys. The bindings escaped; now the panels
> have.
>
> Cost: 5 files, +1 module (`panels.ts`, 528 lines, two thirds of it the
> argument), +1 test file, −4 close wrappers, −12 hand-built heads and scrims,
> −1 twelve-call Escape list. `npm test` 3,183 across 47 files (+170), `tsc`
> clean, `vite build` clean; `cargo test` untouched at 357, the engine having no
> idea any of this happened.

**Steelman, and it is strong.** The target is exactly right: *"a surface gains an
opener and never gains a closer"* is the real failure family, no other test opens a
panel, and the `NO_CLOSE_NEEDED` design (`:25-58`) — where an exemption is a *claim
with a test attached* — is the single best idea in the suite. It visibly learned:
`:70-80` records that a 200-character lookahead missed the hydra; `:145-152` that
`id: "palette"` is also a keybinding action id.

**And it cannot work.** `main.ts` has 39 `classList.*("open")` sites; the regexes
catch the 22 that are inline `getElementById(…)`. The rest go through locals — and
**`overlay` is bound three times**: `main.ts:2852` (palette), `:4471`
(notes-chooser), `:5362` (welcome). `chrome.test.mjs:86-90` tests the *variable
name* against the whole source, so `welcome` is credited with an opener because
`overlay.classList.add("open")` appears inside `openPalette()`. **Move the welcome
overlay's `×` into the palette and the guard stays green.** The same collision waits
for `panel`, `bar`, `list`.

`:178-186` passes a panel if `styles-close` appears within **3,000 characters** of a
`getElementById`. `styles-close` occurs ten times in the file. At that slack,
"within" is not a structural relationship; it will hold or break on where somebody
puts a blank line.

`:190-201` is worse: `esc = SRC.slice(indexOf('e.key === "Escape"'), indexOf('e.key
=== "Alt"'))` is a **3,959-line window — 70% of `main.ts`** — and the five names it
looks for resolve to *function definitions*, not call sites. **Delete the real
Escape handler at `main.ts:5238-5257` and all six assertions still pass.**

And the guard's own premise failed in production: the welcome overlay was exempted
with a written reason that was false, and the bug was found by a person using the
app.

**The change:** extract the surface-building code out of `main.ts` into something
that returns a description — `{ id, modal, closers, escapeHandled }` — in one
exported array, the way `STRUCTURE_ACTIONS` and `ACTIONS` already work *in the same
file*. `openPanel(id)`/`closePanel(id)` replace twenty-four functions; the Escape
handler becomes `for (const p of PANELS) if (p.modal) closePanel(p.id)` — which is
the sentence `chrome.test.mjs:190-193` already writes in English; and the test
imports the array instead of grepping a 5,653-line string. ~250 lines out of
`main.ts`, no framework, no dependency.

The project already proved it believes this. `bindings.ts:3-17` exists for exactly
this reason and says so — *"it is the one module in `src` without a test file, which
the grade calls the tell."* **The bindings escaped. The panels didn't.**

### Assertions that measure nothing

**Verdict: `delete`.**

- `help.test.mjs:31-40` — **285 of the file's 309 assertions (92%)** are one loop
  over 5 sections × 140 entries asserting a string doesn't match
  `/^[a-z]+\.[a-zA-Z]+$/`. One `.filter().length === 0` says the same thing. The 24
  assertions outside the loop are the file's value.
- `coverage.test.mjs:84` — `const inInsertMenu = (c) => !c.deprecated;`, asserted
  ~100 times. The file's stated purpose is "every command is reachable from a
  surface a pointer can touch." **It never looks at a surface.**
- `registry.rs:138-143` — a computed `in_args`, an `if` with an empty body, and a
  comment ending "Nothing to assert."
- Honest split of the app suite: **~1,520 assertions (56%)** are behaviour a writer
  would notice; **~890 (33%)** assert registry/table shape; **~310 (11%)** read
  source as text. It is not a coincidence that the three worst-value-per-assertion
  files — `help`, `coverage`, `chrome` — are exactly the three aimed at the surface
  layer.

### The runner's silent hole

`run.mjs:19-59` hardcodes 39 modules. `src/` has 58 `.ts` files. **Nineteen modules
/ 9,207 lines — 43% of app source — cannot be built by the test runner at all**,
including `save.ts`, `files.ts`, `compile.ts`, `exports.ts`, `deferred-lint.ts`,
`ksav-lang.ts` and `main.ts`. Nothing compares the list to the directory. The
workaround is already visible: `prose.test.mjs:26-50` runs a *second, private*
esbuild because `ksav-lang.ts` isn't on the list. Ten lines of `readdirSync` would
close it.

---

## 8. Features with no user, and the evidence is in the repo's own words

**Verdict: `delete`.**

> ### ✅ Answered — 6 August 2026, and the verdict is refused
>
> Not done as prescribed, and the refusal is the finding. The nine rows were
> taken one at a time and **every diagnosis below held**; what did not hold is
> the conclusion drawn from them. A feature reachable from a menu that does
> nothing is not evidence that nobody wants it. It is evidence that nobody
> finished it, and the distinction decides what you do next.
>
> This section is kept verbatim. What follows is what was built instead, the two
> rows that are factually wrong about what they would delete, and the three bugs
> that came out of taking "make it work" as the instruction.
>
> **The one live bug, and it was worse than the row that names it.** The PWA row
> is right that `sw.js` registers on `ksav serve` and calls it *actively harmful*
> — and then understates it. `HttpBackend.ask` is a plain `fetch` GET;
> `/inbox` is a queue that **drains when it is read**, polled once a second; the
> worker was cache-first for every same-origin GET that was not a navigation. So
> the first poll carrying a source from Girsa was cached and replayed on every
> poll after it, inserting that source into the open document again, once a
> second, until the tab was closed. The row calls this "the first response
> replays forever", which is right and sounds like a stale-bundle annoyance. It
> is a sefer with the same paragraph in it four thousand times.
>
> The fix is not deletion, because the worker's problem was never its policy: it
> could not tell an engine service from a stylesheet, and nothing had ever told
> it. It is told now, from the one registry in `services.rs` —
> `emit-services.mjs` writes a second generated file and `npm test` fails when
> either copy is stale. The rule is closed by default: it says what an asset
> looks like rather than listing what to skip, so a service added tomorrow is
> uncacheable the moment it exists. `sw.js` is a module worker so the rule lives
> where a test can drive it, which is the actual reason this survived — nothing
> in that file could be run outside a browser.
>
> **"No host exists" was the true half of four rows, and it is a thing you can
> build.** There was no `gh-pages`, no Netlify, no deploy job; `.github/workflows`
> was `ci.yml` and `release.yml`. Two features were built against that host and
> could not have worked. `deploy.yml` publishes the wasm bundle to Pages on a
> tag, and `VITE_PUBLIC_BASE` reaches the app twice — as Vite's `base`, so the
> assets carry the `/ksav/` prefix a project site serves under, and as
> `__PUBLIC_BASE__`, which is what a share link names. One value, so a link
> cannot point where the app is not.
>
> **The share row is right and did not go far enough.** *"The link went through
> WhatsApp"* is a fair answer to `share.ts`'s privacy claim. But `share.ts` takes
> its base as an argument precisely so it cannot invent one, and its **caller**
> invented one: `main.ts` read `"https://ksav.app/"` for every desktop and
> `file:` build — a domain with no deploy job, no workflow and no mention
> anywhere else in this repository — and reported "Link copied" over it. That is
> not a feature with no user. That is a button that has never once worked, in the
> build that ships an installer. It reads `__PUBLIC_BASE__` now, and no host
> configured is a refusal in both languages rather than a guess.
>
> **The `engine/web/index.html` row is right about the cost and wrong about what
> to do with it.** *"A dead UI buys a carve-out in the live security policy"* —
> yes, and the carve-out was bought by a `<script>` tag being in the wrong file.
> `script-src 'self'` blocks inline script, so that page was answered with no
> `Content-Security-Policy` header at all, in the one build that receives
> documents written by other people. The script is `web/editor.js` now, external,
> and the page is answered like every other. The two response sites had disagreed
> because each carried its own `if`; there is one `policy_for(content_type)` now
> and both call it. Verified against a running server and then driven in a
> browser: the fallback editor compiles in 17 ms with no console errors and no
> CSP violations, which is the first time anything here has confirmed it runs at
> all.
>
> **The prototypes row is right about the artifacts and wrong that the fix is
> deletion.** `AIAssistant.tsx` still POSTed to `/api/gemini/assistant`, gone on
> 24 July with the proxy behind it — so every send failed, and the failure said
> *"check your API key is configured"*, which sent the reader to `.env.example`,
> which offered them a `GEMINI_API_KEY` slot to fill in for a route that does not
> exist. Three artifacts pointing at each other and at nothing, and the one thing
> they did successfully was ask a stranger to paste a real credential into a
> mock. Restoring the proxy is not the fix; it *is* the vulnerability the README
> documents removing. The panel says so and hands the prompt back, `.env.example`
> asks for nothing, and `metadata.json` no longer declares a capability nothing
> here has.
>
> **Two rows are factually wrong about what they would delete.**
>
> - **Row 8 (version history + Myers diff) would silently kill two features it
>   does not name.** `refreshBaseline` feeds the change gutter from the newest
>   snapshot, and `ruler.ts`'s fourth mark kind is `change`. Delete the history
>   and the gutter has no baseline ever again and one of the overview ruler's
>   four marks goes dark — a feature this section leaves standing and §12 does
>   not defend either. Which is this report's own bug family told from the other
>   end: remove the mechanism, leave the surface. *"`git init` is a better
>   version history"* is also a developer's answer to a bochur's problem; the
>   whole of §13 is that nobody has written a document in this thing, and the
>   person who hasn't is not going to `git init` their kuntres.
> - **Row 9 files `changes.ts` under "tracked changes".** `changes.ts` is the
>   change gutter — a CodeMirror state field over `diff.ts`, 121 lines, whose
>   only inbound relationship is to `ruler.ts`. It has nothing to do with
>   `review.ts`. The row's line count and its "nothing else depends on it" both
>   rest on that mistake, and rows 8 and 9 would each have deleted half of one
>   working feature without either one saying so.
>
> **Three bugs came out of building rather than deleting, and none of them is in
> this section.**
>
> - **`spec.md:804` conceded that "Vim mode in particular has never had a key
>   pressed in it."** A key has now been pressed in it. With vim or emacs on,
>   **none of the hydra's keys did anything**: press the `a` the panel offers for
>   "new item" and vim goes to INSERT; press `b` and the caret moves back a word,
>   leaves the list, and the structure watch closes the panel. Escape did not
>   close it either. Eleven operations on screen with their keys printed beside
>   them, and not one connected — in the surface built specifically so that an
>   operation could not be unreachable. The keys sat in a `Prec.highest` keymap
>   entry under a comment claiming it was ahead of the mode keymaps. Moving it
>   earlier was the obvious fix and it was wrong: `@replit/codemirror-vim`
>   handles keys from a **ViewPlugin event handler**, and a plugin's DOM handlers
>   run ahead of the whole `keymap` facet whatever its precedence. Precedence
>   orders facet inputs against one another; it does not order a facet against a
>   plugin. They are a capture-phase listener on `window` now.
> - **`canBreakInItem()` returned `true` for every caret**, and `breakInItem`
>   spliced a ` \` at the position without asking. A trailing backslash is Typst
>   *content* markup, so between two items it is "the character `\` is not valid
>   in code". Found by driving the hydra once its keys worked — the panel offered
>   it ungreyed at a caret where delete, indent, outdent and both moves were all
>   correctly greyed.
> - **And the reason nothing caught that one is a gap in the shape of §7's
>   argument.** `structure.test.mjs` visits every caret position of 23 documents
>   and checks `enabled` and `run` agree — they did, both saying yes.
>   `emit-structure-fixtures.mjs` compiles what the operations produce, which is
>   the only check that tells legal Typst from merely balanced brackets — and it
>   drove each operation at exactly one caret, always inside an item. One sweep
>   had every position and no compiler; the other had the compiler and one
>   position. The fixture sweeps both now, +81 cases.
>
> **What this says about the section.** Nine features were called dead. Six of
> them were, and in each case the missing piece was small and nameable: a host, a
> base URL, an external `<script>`, a `keydown` listener in the right place, a
> generated list of service paths, an honest error message. None of the six was
> dead because nobody wanted it. They were dead because the last ten per cent was
> never done, and "delete it" and "finish it" are indistinguishable from the
> evidence this section gathers. The evidence supports "nobody has run this",
> which is §13, and §13 is right.
>
> Cost: 5 commits, 21 files, 3 added. `npm test` 3,535 across 58 files (+16),
> `cargo test --lib` 129 (+4), the structure fixture 165 cases (+81), `tsc`
> clean, `vite build` clean at both bases, clippy and `cargo fmt` clean. Eight
> mutations red across the four fences. Two features driven in a real browser
> that had never been opened in one.

| Feature | Lines | Evidence |
|---|---|---|
| **Vim + Emacs modes** (`keymodes.ts` + `main.ts:836, 4937-4939, 5559, 5592-5594` + `settings.ts:59` + 8 i18n keys ×2 + 2 npm deps) | ~124 + wiring | `spec.md:779-780`: *"Vim mode in particular has never had a key pressed in it."* `settings.ts:57-59` argues the mode *"must not put them into vim"* — the file is arguing with the feature. No request in `spec.md`, `fixes.md`, `plan-notes-and-ui.md` or `docs/`. |
| **The hydra** (`hydra.ts` + `main.ts:3702-3819, 3435-3441` + `help.ts:99-112` + a test file) | ~165 + wiring | The **sixth** projection of `STRUCTURE_ACTIONS`. `hydra.ts:60-83` is a whole key-allocation algorithm with an alphabet-wide fallback, written because `table.delete` came out keyless — an operation reachable from four other surfaces. It also taxes unrelated code: `main.ts:3435-3441` exists solely to close a hydra that would otherwise eat every keystroke. |
| **Macros** (`macros.ts` + `main.ts:3597-3700, 427-430, 1740-1796, 932-941, 2071-2076`) | ~127 + wiring | Design is right — actions, not keystrokes. `macros.ts:1-9` justifies it: *"Word and LibreOffice both ship this."* That is the organising principle, stated. It also puts a branch in the hot `update` listener. `#let` custom commands are the better half of "macros" and are unaffected. |
| **Share-by-URL** (`share.ts` + `main.ts:3307-3361` + `share.test.mjs`) | ~290 | The claim (`share.ts:11-14`) — *"A fragment is never sent to a server — not in the request line, not in a log"* — is true of HTTP and irrelevant to the threat: the **link** went through WhatsApp. `.ksav` is already a plain text file. Sending the file does everything this does with no 60 KB ceiling. |
| **The PWA** (`sw.js` 99 + manifest + 3 icons) | ~120 | **No host exists.** No `gh-pages`, no Netlify, no Vercel, no deploy job; `.github/workflows/` is `ci.yml` and `release.yml`. And it is actively harmful: `main.ts:3294-3305` skips registration only for `kind === "desktop"`, so the service worker **registers on `ksav serve`**, where `sw.js:86-97` is cache-first for every same-origin GET — including `/inbox`, a *draining queue* polled every second. Cache-first on a draining queue means the first response replays forever. (*static*) |
| **`engine/web/index.html`** | 217 | A second, complete, single-file editor for `embed-ui`-off builds. **Confirmed:** `embed-ui` is not a default feature and every documented invocation passes it, so no documented flow reaches this file. Its cost is not zero — `server.rs:82-85` says it is *the reason* `serve_static` skips the CSP header. A dead UI buys a carve-out in the live security policy. |
| **`prototypes/**` source** | 6,184 | The 38-line `prototypes/README.md` says everything the 6,184 lines say, and git has the history. Three orphaned Gemini artifacts remain in HEAD — `.env.example` (a `GEMINI_API_KEY` placeholder), `metadata.json:5`, and `AIAssistant.tsx:70` still fetching `/api/gemini/assistant`, an endpoint deleted on 24 July. **No real key material anywhere in HEAD** (checked) — confusion cost, not a leak. |
| **Version history + Myers diff** (`docs.ts:82-90, 108-109, 259-290` + `main.ts:2780-2848` + `diff.ts:123-176`) | ~180 | Fifty snapshots on a 3-minute timer, of a plain text file that is also bound to a real file on disk. `git init` is a better version history and costs zero lines. The exact edit script from Myers is rendered as *one of three colours in a 4 px gutter strip*; `diff.ts:97-105` already gives up and paints the whole region when it's large. |
| **Tracked changes** (`review.ts` + `changes.ts` + `ksav.typ:2055-2140` + `main.ts:4164-4342` + two test suites) | ~760 across two languages | Well built — `review.ts:91-106` handles nested marks by outermost-first multi-pass rewriting, which is correct and not obvious. Built for a review workflow that has no second participant. **Nothing else in the codebase depends on it**; the prelude block's only inbound dep is `_sn_note`. `#הערת_עורך` alone — a comment that renders and never prints — is the 5% a solo writer uses, and it is ~15 lines of prelude. |

`watch.ts` deserves a separate note: **do not delete it.** It exists because the
30-second background file autosave would otherwise clobber a file Dropbox changed.
**Delete the background autosave instead**, and `watch.ts` becomes unnecessary as a
consequence.

---

## 9. Two bugs from the family this project is named for

> ### ✅ (a) Fixed — 6 August 2026
>
> Done as prescribed in substance — one `NoteSpan[]` over both spellings — and
> **not** as prescribed in mechanism, because the edit the diagnosis implies is
> worse than the bug. The finding below is kept verbatim; what follows is what
> replaced it, what the finding got wrong, and what it missed. (b) is not
> touched; it is still open.
>
> **The repro reproduces exactly, and so does every number in it.** Verified
> before anything was changed: the deferred document gives `notesIn: 0 rows`,
> `noteDepthAt: 0`, `tieredNoteAt: #הערה_א[|]`, and the inline one gives one
> row. Nothing in the finding's own evidence needed correcting.
>
> **The finding named the right two lines and the wrong edit.** Its diagnosis
> is that `note-commands.ts:86-88` excludes `#הערה_בשם` and `#גוף_הערה` "with
> reasons that are correct for `noteDepthAt` and correct for `deferSnippet`,
> and simply *not evaluated* for `notesIn`" — which reads as: evaluate them,
> and put the two commands in the list. Done at HEAD-before-the-fix, that
> produces:
>
> - **one pane row, and it is the wrong one.** The marker still contributes
>   nothing (it has no `[…]` for the walker to find), so the note is listed as
>   `#גוף_הערה` at the end of the file rather than as the note where it prints.
> - **a convert action that breaks the document.** Right-clicking that row and
>   choosing endnote rewrites the definition —
>   `#הערה_בשם("1") … #הערתסיום[עיין שם]` — leaving a marker pointing at
>   nothing, which the page renders as a red `?`, and an endnote nobody
>   referred to.
> - **"defer every note" exiling the definitions.** On an already-deferred
>   document it writes `#הערה_בשם("2", סוג: גוף_הערה, "1")` — a marker whose
>   *layout* is the body command.
>
> All three executed, not reasoned about. So the two exclusions stay, exactly
> as they are, and their comments stay right: `NOTE_BODY_COMMANDS` means *takes
> note prose as its last positional argument*, which is a claim about call
> shape that `deferred.ts` depends on. It was never a list of "what is a note".
> The fix is that there is now a list of that, `notes.notesIn`, and it is built
> out of both spellings — the spans for the inline half, `deferred.scan` for
> the pairing.
>
> **Order and depth are the part that needed thinking about.** A note written
> inside a deferred body has its bytes at the end of the file and its place in
> the document beside its parent, so the index sorts by a tree rather than by
> offset (the pane indents by depth; children forty rows from their parents
> would be a tree drawn wrong), and `depth` counts enclosing *notes*, following
> a `#גוף_הערה` back through the marker that names it. Walked over `spans.ts`'s
> containment tree, not compared all-pairs: a sefer has thousands of notes and
> the pane re-renders on every keystroke, which is the quadratic §1's follow-up
> had just finished removing from the ribbon.
>
> **Three it missed, and the first is worse than the finding.**
>
> - **The "collected and never rendered" lint is blind to every deferred
>   note** — the failure `apparatus.ts`'s own header calls *"the quietest
>   failure in the product"*. A deferred endnote names its layout as a
>   **value**, `#הערה_בשם("1", סוג: הערתסיום)`, so a scan for `#`-calls finds
>   nothing to warn about. Verified against the compiler rather than reasoned
>   about: `cargo run --example probe` on the inline and deferred spellings of
>   the same dumpless document prints byte-identical pages, and in both of them
>   the marker is on the page and the prose is not. An empty pane is visible;
>   this one you find in print. The engine had already learned this exact fact
>   once — `apparatus_is_named_as_kind` exists so a deferred page-band still
>   reserves room at the foot of the sheet — and the editor had not.
> - **Deferring in an English document writes Hebrew into it.** Every rewrite
>   in `deferred.ts` emitted `#הערה_בשם` and `#גוף_הערה` whatever it was handed,
>   and dropped `#fnote` to the default kind, so recalling the note brought back
>   `#הערה`. The page is identical — the prelude aliases both — which is what
>   makes it the quiet kind of wrong. A pair is now spelled in the language of
>   the note it stands for; `#note_named("1", kind: endnote)` and
>   `#note_body("1")[…]` compile and lay out, verified.
> - **`notesIn` was one more scanner of this markup**, and §1's own
>   prohibition swept clean over it: the sweep flags a `depth` counter within
>   **fourteen** lines of a bracket literal, and this one had **fifty-five**
>   between them. The window is eighty now, which catches it and still flags
>   nothing else in `src/` — measured, not guessed.
>
> **One found and not taken.** The sweep looks forward only, so the shape it
> still cannot see is a *backwards* walk, and there is one: `mode.ts`'s
> `nameBefore` skips back over balanced groups with no idea what a string is.
> Verified — `enclosing("#הערה(\"א)ב\")[גוף]", …)` answers `[]` where the same
> document without the paren answers `["הערה"]`, so a command inside that body
> is judged to be in no command at all. That is one more scanner and another
> divergence of §1's family, in the 366 lines §12 calls the highest-value
> in the app; it is a finding, not an exemption, and widening the sweep in that
> direction belongs with the fix rather than before it.
>
> **The fence is an oracle, not a list of cases.** `deferrednotes.test.mjs`
> (291 assertions) takes a twenty-one document corpus — every layout, both
> languages, notes in tables, in list items, after comments, inside other
> notes — defers each one in bulk through the product's own
> `deferAllInlineNotes`, and requires every note surface to give the same
> answers for both copies: the same notes in the same order at the same depths
> with the same words, the same apparatus warnings, the same tier for a
> sub-note, the same `noteAt` at each marker, and `resolveDeferred` of the
> deferred copy equal to the document it started as. This is
> `deferred_notes.rs`'s `assert_same_page` on the editor's side, and it is the
> only shape that would have caught the original: a surface that learns one
> spelling and not the other fails it by construction.
>
> Verified by mutation, nine ways, every one run: `notesIn` forgetting the
> markers again, `noteDepthAt` skipping deferred notes, the apparatus lint
> losing the deferred sites, the bulk defer writing Hebrew into English,
> `convertNote` rewriting the body instead of the marker, `deleteNote` leaving
> the prose as an orphan, the sub-note tier stopping at the marker, a private
> bracket walker coming back to `notes.ts`, and prose mode taking its own copy
> of the command names. Nine red. Two controls green: the suite at rest, and
> renaming a local inside `notesIn`. The name prohibition earned its keep
> immediately — it turned red on a two-line duplicate written *during* this fix
> and caught before it was committed.
>
> **The steelman held.** `NOTE_BODY_COMMANDS` is unchanged and its comments are
> still true; `deferred.ts` is still the only module that knows the pairing
> syntax; the engine has no idea any of this happened.
>
> **What the line count was.** *"~1 day, −180 lines"*: it is +98 code lines
> across the three modules (`notes.ts` +34, `deferred.ts` +57, `apparatus.ts`
> +7), which is the same direction §4 and §7's predictions were wrong in and
> for the same reason — a decision with one home has to be *written down* where
> before it was implied by there being no decision at all. Brevity was not the
> defect. Two features that were mutually exclusive were the defect.
>
> Cost: 8 files, +1 test file, +1 i18n key. `npm test` 3,474 across 48 files
> (+291), `cargo test` 357 unchanged, `tsc` clean, `vite build` clean.

Both are *surfaces lying about a working engine*, and both were found by execution.

**a) The notes pane is empty in every deferred document.**
`note-commands.ts:86-88` excludes `#הערה_בשם` and `#גוף_הערה` from
`NOTE_BODY_COMMANDS` with reasons that are correct for `noteDepthAt` and correct for
`deferSnippet`, and simply *not evaluated* for `notesIn`, which is the notes pane.
**Verified:**

```
פתיחה#הערה[עיין שם] סוף.                 → notesIn: 1 row
פתיחה#הערה_בשם("1") סוף.
#גוף_הערה("1")[עיין שם]                   → notesIn: 0 rows
noteDepthAt inside the deferred body       → 0
tieredNoteAt inside the deferred body      → #הערה_א[|]
```

Turn on `deferNoteBodies` — the preference §1.5 of the plan was written to honour
everywhere — and the notes pane, its jump list, and the whole right-click
convert/delete/sub-note menu show nothing. **The two features shipped in that region
are mutually exclusive and no test noticed, because each is tested alone.** Worse:
press `⁑` inside a deferred body and you get tier 1 — a note *beside* the note
instead of under it. That is verbatim the defect commit `69c9531` ("The notes pane
was empty in every English document") fixed, reproduced on the deferred axis **by
the file written to fix it**, whose own header diagnoses the family precisely as
*"a hand-maintained array that only one language ever walked."*

> ### ✅ (b) Fixed — 6 August 2026
>
> Both halves, and both were verified in source before being touched. The finding
> is exactly right and it undersells its own second half: `reflowableHtml` did not
> merely fail to fall back, it had *already set the status line* to "exporting page
> images instead" on its way to returning null — so the two routes that produced
> nothing were the two routes that announced an export. The sentence was true of
> `exportHtml`, the one caller that does fall back, and a shared layer cannot know
> what its callers will do about a refusal. It reports a reason now; each caller
> says what it did.
>
> Print warns in the status bar like every other route, **and** in the print window
> itself, behind `@media print { display: none }` — because the status bar is
> behind whatever the browser just opened over it, which is the same objection
> `warnIfHealed`'s own comment raises about a line that may have scrolled past.
>
> Both are in `exports.ts`, which was one of §7's nineteen unreachable modules.
> That is not a coincidence and it is the reason the two findings were fixed
> together: `test/exports.test.mjs` is 26 assertions and could not have existed
> before the runner could see the module. Mutations: print stops warning (4 red),
> the Word routes go silent again (4 red).

**b) Print puts closers the writer never typed onto paper.**
`doPrint` (`exports.ts:223-233`) renders `runtime.lastResult.pages_svg`, which is
the *preview* result, compiled from the **healed** copy (`compile.ts:105-110`).
Every other export route calls `warnIfHealed` (`exports.ts:28-31`); print does not,
and it is the one that goes to paper. So one menu gives two answers about the same
unbalanced document: Export PDF fails with a compile error, Print silently prints
the healed version.

Related, same layering habit: `compile.ts:245` sets `htmlFellBack` — *"Typst's HTML
export failed — exporting page images instead"* — and returns null.
`exportHtml` does fall back; `exportWord` and `copyForWord` just `return`. Click
Export → Word on a document Typst's HTML backend can't handle: **no file appears,
and the status bar says page images were exported.**

---

## 10. The documentation is the same bug, in prose

**Verdict: `rewrite`.**

> ### ✅ Fixed — 6 August 2026
>
> Done as prescribed in substance — the card is diffed, the counts are measured,
> the links are checked — and in three places deliberately not as prescribed,
> because the prescription would have documented a bug, exempted the wrong
> files, and missed the one link check that mattered. The finding below is kept
> verbatim; what follows is what replaced it, what it got wrong, what it missed,
> and the mutation that caught the fence reproducing the disease.
>
> **Every row was re-verified before anything was changed, and the table holds.**
> `docs/shortcuts.md` really was seventeen rows short and three rows wrong;
> `ksav/README.md` really said 104 commands where `grep -c '^\s*cmd!('` says
> **116**, and four CI jobs where `ci.yml` has **five** (`app`, `engine`, `fmt`,
> `wasm`, `desktop`). The bindings are **52**, not 29 or 30. The Hebrew lexicon
> is **269,357** entries, not 269,385 — and the finding's own correction was
> right. Only the release-status row needed adjudicating rather than counting,
> and it is settled below.
>
> **The claim that was a product bug, not a prose bug.** *"Page setup travels
> with the file"* is listed here as a false claim, which reads as: correct the
> prose. Corrected prose would have been a bug written down. `serializeDoc`
> (`docs.ts:428`) wrote `{format, version, title, body, assets, customCommands}`
> and `config: PageSetup` lived in IndexedDB, so the promise was false on
> **every** route out of the application — Save, Save As, the crash-recovery
> backup — and on one this finding does not mention: **duplicating a document**,
> which copied the body and handed the copy the writer's *new-document* default,
> so duplicating a Letter-sized sefer produced an A4 one.
>
> It is the serializer that is wrong, and the whole UX argues so: `docConfig`
> lays a document out as *its own setup over the shipped defaults*, and
> `ksav/README.md:120` calls page setup a fact about the sefer in as many words.
> So `ownPageSetup` writes only what the shipped defaults do not already say —
> which makes the round trip exact by construction, and keeps the other promise
> the same three pages make, that *"a `.ksav` is text … somebody can read it with
> `cat` in ten years"*: a document laid out the shipped way still leaves as plain
> text rather than JSON. `readPageSetup` reads it back through `PAGE_FIELDS` with
> a type check per key, because this is the one field that goes on to a compile
> request out of a file somebody could have hand-edited.
>
> One behaviour changed on purpose. A `.ksav` carrying no page setup now opens
> under the **shipped** defaults rather than the reader's new-document
> preference, because a file that says nothing has said it is laid out the
> shipped way, and "opens the same way on someone else's machine" is false
> otherwise. *Set as default* still governs documents you start.
>
> **Three things this finding got wrong.**
>
> - **"in any tracked `.md`" is the wrong set, and this section's own closing
>   argument says why.** Three of the fourteen tracked pages are append-only
>   logs, and a dated entry reading "2,276 assertions" was true on its date;
>   asserting over them would demand rewriting the record to satisfy a test. The
>   sweep runs over *living* pages, and the log list is default-deny — the union
>   of logs and living pages must be exactly the tracked set, so a new `.md` is
>   fenced by arriving rather than by somebody remembering it.
> - **Renaming `docs.test.mjs` costs more than the name.** The audit asks for it
>   because that file tests `src/docs.ts` and "squats the obvious name". It does,
>   and the project's one reliable convention is one test file per module;
>   breaking it to free a filename trades a real invariant for a tidy one. The
>   new file is `documentation.test.mjs`.
> - **`LICENSE:24` is not a link, and a link check would never have caught it.**
>   The finding offers it as evidence for item 3. It is a bare path in a
>   sentence, wrapped across a line break (`engine/src/` / `spell.rs`), so the
>   markdown-link sweep passes straight over it. It needs a second sweep over
>   paths in prose — which, run over the living pages with fenced code blocks
>   excluded, flags **exactly one** thing in the entire repository, and it is
>   that one. (The real path is `engine/src/spell/hebrew.rs`, and the sentence's
>   claim about it is true.)
>
> Item 4 of the prescription — the font notices — was already built by §3's fix
> (`engine/src/notices.rs` ties them to the `include_bytes!` lines and to
> `THIRD-PARTY-NOTICES.md` in both directions), so this was three items, not
> four. **And "about eighty lines" is wrong in the same direction as §4, §7 and
> §9's estimates and for the same reason**: it is ~430 across two files, most of
> it the backward sweep and the argument for the partition. Brevity was not the
> defect.
>
> **The release-status contradiction, adjudicated.** The finding says *"One is
> false"* and does not say which. Asked of GitHub rather than reasoned about:
> `v0.1.0` is `"draft": false` with nine assets on it. The root `README.md` was
> right and `ksav/README.md` was carrying the stale half in two places — an open
> checkbox reading *"the release is still a draft, so nothing is downloadable"*
> and a paragraph in the packaging section saying the same. Both corrected.
>
> **Four it missed.**
>
> - **The card printed ten bare action ids**, in both languages —
>   `` `list.indent` ``, `` `heading.promote` ``, eight more. Not a stale number:
>   rows nobody had named. Except they *were* named. `STRUCTURE_ACTIONS` carries
>   the i18n key the ribbon, the palette and the hydra all label them with; the
>   generator simply did not look there, and inventing a second set of names
>   would have been this repository's own bug family in a new place. It reads
>   the actions now.
> - **The Girsa links are fixable, and the finding says they are not.**
>   *"Regenerating the card will not fix it"* is true and stops one question
>   early: `SYKhayyat/girsa` is a **public repository**, so the link was pointing
>   into an untracked sibling directory for no reason at all. All five sites —
>   four pages and the hardcoded one in `card.mjs:109` — are now an absolute URL
>   that resolves for every reader.
> - **The lexicon header is a fourth copy nobody compared.** `lexicon-he.txt`'s
>   generator writes `# 269357 entries` into its own header, and the docs quote
>   the header. Nothing checked the header against the file it heads. It does
>   now, and a stale header fails before it can become the authority.
> - **`ksav/README.md` states the assertion count twice**, in two different
>   sentences, and the finding counts it once.
>
> **The fence reproduced the disease, and the mutation is the reason this
> paragraph exists.** The log-exemption list was written explicitly against
> `registry.rs`'s `ONLY_AT_TOP` — checked for existence, for tracking, for a
> stated reason, and for totality against the tracked set. Then: add
> `docs/start-here.md` to it with a plausible sentence, and the backward sweep
> switches off for a living page **with the suite green**. That is `ONLY_AT_TOP`
> exactly, rebuilt inside the fence written to avoid it, and four honest-looking
> checks did not see it. An exemption must now be *load-bearing* — a page may
> only be a log if the sweep would actually have failed on it — so a clean page
> cannot be excused from nothing.
>
> **Verified by mutation, nine ways, every one run.** A stale command count
> restored; a *new* undeclared number written into `docs/`; the card edited by
> hand; the `Ctrl+Alt+D` row put back to "Mark as deleted"; the Girsa link
> returned to `../../Girsa/`; the `LICENSE` path returned to `spell.rs`; a log
> dropped from the exemption list; a clean living page added to it; and a binding
> label deleted so the card prints a bare id. Nine red. Two controls green: the
> suite at rest, and the whole thing run again after each revert. Plus three on
> the page-setup fix — the serializer dropping `config` again, `ownPageSetup`
> ceasing to subtract, and `readPageSetup` trusting the file — all red.
>
> **Where each check lives, and the one split.** `documentation.test.mjs` owns
> the card diff, the counted claims in both directions, both link sweeps and the
> partition. Two facts are checked in `run.mjs` instead, after the tally: how
> many assertions the suite runs and across how many files. Nothing can know
> those without running, and a test that counted itself would be a number that
> never settles — so the check lives where the answer is. It caught the README on
> its first execution.
>
> Cost: 12 files, +2 test modules, +1 product fix. `npm test` 3,595 across 50
> files (+67), `cargo test` 367 unchanged — the engine has no idea any of this
> happened — `tsc` clean, `vite build` clean, `cargo clippy -D warnings` clean.

`card.mjs:40-46` contains the complete diagnosis, in its own comment:

> *"The card said '104 of them' for as long as there were 104, and then for a while
> after there weren't — which is the exact failure this generator exists to prevent,
> reproduced one paragraph below the table that prevents it."*

The generator is exactly right in design: it reads `bindings.ts` and `i18n.ts`
through the same esbuild path the test runner uses, so the card *cannot* disagree
with the app. It was run once, by hand, on 4 August, and the output pasted into
`docs/shortcuts.md`. **Nothing regenerates or diffs it.**

| Claim | Where | Actual |
|---|---|---|
| "all **29** bindings" | `README.md:17` | **52** bound; the linked file lists **35** |
| "all **30** bindings … so it cannot drift" | `docs/start-here.md:203` | 52 bound, 35 listed, and it drifted |
| `shortcuts.md` is current | `docs/shortcuts.md:3-6` | **17 rows missing, 3 rows wrong.** `Ctrl+Alt+D` is labelled "Mark as deleted"; the app now binds it to **Endnote** |
| "**104 commands**" ×2 | `ksav/README.md:163, 197` | **116** (`grep -c '^\s*cmd!('`) |
| "**108**" / "**107**" ×3 | `shortcuts.md:59`, `start-here.md:44`, `from-word.md:82` | 116 |
| "**389 assertions across 9 files**" ×2 | `ksav/README.md:309, 361` | **2,723 across 44** (`npm test`) |
| "**155 engine tests**" ×2 | `ksav/README.md:309, 363` | **332 across 22 binaries** (`cargo test`) |
| "`ksav.typ` is **1,701 lines**" / "**1,473**" | `spec.md:643`, `fixes.md:778` | **2,238** |
| "114 commands × 9 = **1035**" | `plan-notes-and-ui.md:458` | 114 × 9 = **1,026**, which the same file says at `:342`. The two halves disagree |
| "`(א, 1)` in **`_fn_defaults`**, `_md_defaults` and `_pp_defaults`" | `plan-notes-and-ui.md:467` | **False for `_fn_defaults`** — `ksav.typ:91-104` still carries `מספור: none`, deliberately, with the reason at `:99-103` |
| "**269,385** Hebrew entries" | `start-here.md:180` | 269,357 |
| Six mutually inconsistent test counts | `fixes.md:61, 264, 1042, 1044, 1073, 1209` | all six stale |
| "**v0.1.0 is published** … it is a button, and it has been pressed" | `README.md:26-30` | `ksav/README.md:323-329` in the same repo: *"the release is still a draft, so nothing is downloadable … `/releases/latest` returns 404."* One is false |
| Four links to `Girsa/docs/start-here.md` | `start-here.md:8, 206`, `from-word.md:62`, `shortcuts.md:66`, and **hardcoded at `card.mjs:109`** | 404 for every reader — `Girsa/` is an untracked sibling directory. Regenerating the card will not fix it |
| "page setup **travels with the file**" | `ksav/README.md:110`, `start-here.md:160`, `from-word.md:43` | **False.** `serializeDoc` (`docs.ts:428-446`) writes `{format, version, title, body, assets, customCommands}`. `config: PageSetup` lives in IndexedDB and never leaves the machine |
| "green across all **four** jobs" | `ksav/README.md:314` | `ci.yml` has five |

> **Two rows corrected, 5 August 2026, and that is all.** Fixing §2 changed both
> test counts, so `ksav/README.md`'s *"389 assertions"* and *"155 engine tests"*
> now read 2,819 and 342 — true today, and still hand-written, which is the
> finding. The eighty lines of test prescribed below were not written; they are
> this item's work, not §2's. Three service paths in the same README *are* now
> fenced (`services.test.mjs` asserts every route in the registry appears in the
> API section), because that table was a fourth copy of the list §2 collapsed.

`readme.test.mjs:1-14` argues, correctly, that *"documentation that names a key the
application does not have is the same bug as a menu item that does nothing … and it
is the easiest of all of them to ship, because prose compiles no matter what it
says."* It then asserts twelve key names and two phrases over **one** of nine prose
files, and **zero numbers**. Which is why every row above survived 45 green
assertions.

### The change — about eighty lines

1. Rename the current `docs.test.mjs` (it tests `src/docs.ts` and squats the obvious
   name) and write a real one that shells `card.mjs`, diffs against
   `docs/shortcuts.md`, and fails on any difference. **15 lines, kills four rows.**
2. Export one `FACTS` object from the engine — `{commands, templates, fonts,
   noteLayouts}`, counted the way `card.mjs:40-46` already counts. Assert that every
   integer next to "commands", "bindings", "templates", "assertions" or "engine
   tests" in any tracked `.md` matches. **40 lines, kills eleven rows.**
3. Assert every relative markdown link in a tracked `.md` resolves to a tracked
   path. **10 lines** — kills the four `Girsa/` 404s and would have caught
   `LICENSE:24` (which names `engine/src/spell.rs`; the path is
   `engine/src/spell/hebrew.rs`).
4. Assert `main.ts`'s `BUNDLED_FONT_NOTICES` and `THIRD-PARTY-NOTICES.md` name the
   same fonts. **10 lines** — a licence obligation currently held in three
   hand-synced copies.

### The audit prose itself

> #### ✅ Split — 7 August 2026
>
> Done as prescribed, and the honest accounting above is what made it doable:
> the three files really were a *spec* and a *log* bolted together, and the seam
> is exactly where the split went.
>
> **Nine dated units, nine files, one directory.** `decisions/YYYY-MM-DD-slug.md`
> — the product audit, the adoption wave, the production-readiness list, the
> second audit, its resolution, the third audit, both borrowed waves, and the
> notes/UI plan with its post-mortem. Verbatim: a line-by-line comparison of the
> nine files against `git show HEAD:` of the three originals reports **identical
> content** for all three, ignoring only the `---`/`---` rules that used to
> separate the documents inside a file. `README-notes.md` was not touched, as
> asked. The finding says "ten"; it is nine files, because
> `plan-notes-and-ui.md`'s Resolution is an `##` inside the plan's own outline
> and splitting it out would have fractured a document to hit a number.
>
> **`spec.md` is a living page now**, which is the half of this that has teeth:
> it holds the eleven note options, the ground rule that produces exactly
> eleven, and where a note's prose lives — and it is swept by the same fence
> that keeps `README.md` and `docs/` honest. It had one claim that no longer
> resolved (*"~25 raw command names"*, describing a chooser that has since been
> built) and it is now a sentence about what the panel does, with the audit item
> that argued for it linked rather than cited by letter.
>
> **The exemption is an address, not a list.** This is the part worth arguing
> about. A list of exempted files is a thing somebody maintains, and the
> mutation that broke the last version of this fence was adding one line to it.
> A directory is a thing you have to *move a file into*, and the move is the
> review. So `LOGS` carries `decisions/` and the checks moved with it: the entry
> must be excusing something real (at least one page under it would fail the
> sweep), and **every page it covers must carry its date in its name** — which
> makes the lifecycle a fact about the filename rather than a claim in a
> sentence. The `docs/start-here.md` mutation now fails twice.
>
> One check was deleted for being arithmetic. *"The union of logs and living
> pages is exactly the tracked set"* is true of any partition of a set by a
> predicate — it was asserting subtraction. What can actually go wrong is an
> entry that is too **wide**: `docs/` in that list would switch the sweep off
> for three living pages and every count would still balance. So the pages that
> are documentation by definition are named, and an exemption that reaches one
> of them is red.
>
> **Seven mutations, every one run, every one red.** A living page added to the
> list; `docs/` added as a directory; an undated file put in `decisions/`; the
> index renamed away; `fixes.md` recreated at the root; `spec.md` declared a log
> again; and a stale count written into `spec.md` — which is the one that proves
> the split bought something, because that page was exempt from that sweep an
> hour earlier. Two controls green, before and after.
>
> Not done: `lamdan/whole-repo-2026-08-05.md` stays in `lamdan/`, where the tool
> that produces these writes. It is a declared log for the same reason
> everything in `decisions/` is, and `decisions/README.md` says so rather than
> leaving a reader to notice the exception.
>
> Cost: 14 files, 9 of them moves. `npm test` 3,566 across 58 files (+10), `tsc`
> clean, `vite build` clean; the engine is untouched.

**Verdict: `wrong-but-keep`, then split.** The pre-reading suspicion — that the
audit genre had become a performance — is about **one-third right**, and the honest
accounting matters:

*Against.* Ten dated wave/audit/resolution units across three files, all with the
same skeleton. Roughly **500 of 2,576 lines are work-completed reporting**
(`spec.md:399-431`; the 66 `✅` lines with their `**Fixed:**` tails;
`fixes.md:53-62, 942-1048, 1023-1030, 1207-1212`; `plan:454-463`) — which is what
`git log` is for, at four times the length, and unlike git it can go stale. Another
~250 lines are now actively wrong. `fixes.md:20-22` argues findings must be kept
verbatim so a fix is legible beside the thing it fixed — true, and it also means the
file can only grow, so its top 60 lines are wrong and carry **three stacked
"Superseded" notices** instead of an edit.

*For.* Roughly **1,300 lines are design reasoning, and none of it is recoverable
from git.** The highest-value parts are the *negative* results, which no commit
records: `README-notes.md:88-91` (two note-identity designs tried and abandoned —
keying by content, comparing page coordinates); `spec.md:645-646` (notes.typ's one
idea Ksav had, tried, and deliberately removed); `spec.md:712-716` (why "cannot
tell" must default to *unchanged* — *"a prompt nobody reads is worse than none,
because it also convinces everyone the problem is handled"*); `fixes.md:436-463`
(four rules of English morphology, each with the measurement that earned it);
`README-notes.md:196-199` (*"`block`, `v(weak: true)`, `linebreak` and `parbreak`
all orphan the number… All four were measured"*). And `plan-notes-and-ui.md:138-193`
is a project writing down why its own 2,276 green assertions lied to it, naming five
lessons, converting four into fences, and then reporting at `:522-545` that the
fences caught things the author had not predicted. **That is a tool being used, not
a genre being performed.**

**The change:** the problem is not the prose, it is that three files merged two
documents with opposite lifecycles — a *spec* (edited in place, always current) and
a *log* (append-only, never edited). Every stale number lives at the seam. Split the
ten waves into an append-only `decisions/` directory where staleness is expected and
harmless, and leave `spec.md`, `README.md` and `docs/` as living documents a test
keeps honest. Keep `README-notes.md` entire — I would not cut a line.

---

## 11. `main.ts` at 5,653 lines

**Verdict: `wrong-but-keep` as a file; `rewrite` for the one abstraction inside it.**

> ### ✅ Fixed — 6 August 2026
>
> The abstraction is named: `app/src/panels.ts`, seventeen surfaces, one
> declaration each. The full account is in §7, including the one thing this
> section got right and did not follow through on — *"a thirteenth panel
> silently doesn't get Escape"* had already happened, to the hydra.
>
> The prediction that did not survive is the size of it. `main.ts` is 5,644
> lines, down eighteen. The panel *mechanism* left; the panel *side effects*
> had to be written down to be shared, and that is nearly the same number of
> lines. This section was right that the file is exhaust and right that the
> panel was the one real abstraction in it — and wrong that naming it would take
> 250 lines out. It took eighteen, and made twelve places where a decision lived
> into one.

**Steelman, and it is coherent.** One author, one machine, no second chrome planned,
and a deliberate decision that the boundary worth defending is *pure logic vs. DOM
glue* rather than *feature vs. feature*. Under that reading the file is not a
residue — it is the exhaust. Every reusable, testable idea has already been lifted
out: `notes.ts`, `structure.ts`, `mode.ts`, `styles.ts`, `bindings.ts`,
`commands.ts`, `help.ts` are all pure and all tested. `runtime.ts:1-15` states this
explicitly. Splitting on feature lines would produce twelve files that all import
the same three globals and still cannot be tested — motion without progress. **So
the claim is not "5,653 lines is too many."**

The claim is narrower and survives: **the file contains a real, repeated abstraction
— the panel — twelve times, and refusing to name it is what forced the guard tests
to become regexes.** Settings drawer `:2600`, outline `:2609`, notes pane `:2630`,
history `:2818`, palette `:2851`, help `:3536`, hydra `:3712`, styles `:3859`, modal
`:4139`, review `:4204`, notes chooser `:4469`, preview overlay `:5037`. Each is the
same triple — `getElementById(id).classList.add/remove("open")`, a `render*()`, a
`×` button — with no shared type. Consequences: the Escape handler
(`:5238-5256`) is a hand-written list of twelve close calls that nothing derives; a
thirteenth panel silently doesn't get Escape; and §7 above.

The fix is in §7. It is ~250 lines out of the file, no framework, and the project
has already proved it believes in it, in this same file, twice — `ACTIONS` and
`STRUCTURE_ACTIONS` are exactly this pattern.

`runtime.ts` deserves its own line: it is what let `main.ts` shrink from a god
object to a god *file* without import cycles, and that is a real achievement. Its
cost is that it stops one step short — because the editor is a module-global rather
than a parameter, the remaining boundary is "does this need the DOM", which is every
remaining feature. Two editor instances, a preview-only embed, and a headless test
of any panel are all off the table.

---

## 12. Things I tried to design better and couldn't

Not a compliment quota. A critic who never loses has stopped evaluating.

- **`NOTE_CHOICES` as twelve hand-written records** (`notes.ts`). The engine really
  is six parameterised primitives, so the eleven names really are combinations, and
  I expected the records to fall out as derived data. They don't. `two-bands` needs
  `tail: #הערות_מדורגות()`; `sidenote` needs `wrap`; `footnote-plus-endnotes` needs
  `head: #הגדרות_הערות_סיום(מספור: "א")` for a reason no generator could infer (two
  apparatuses both printing `¹` on one page, `notes.ts:267-271`); `section-endnote`
  and `endnote` are the *same commands* distinguished only by a prose instruction to
  move the dump call. **The scaffolding is where the product knowledge lives and it
  is per-cell by nature.** A generator would need a per-cell exceptions table — i.e.
  `NOTE_CHOICES`. The axes-as-lookup-keys design is right and the rewrite was worse.
- **Owning the Hebrew lexicon.** Measured, not estimated: 4.37 MB of `include_str!`
  in every binary and in the 29.5 MB wasm module; **33.8 MB peak RSS** for both
  lexicons against a ~4 MB baseline; ~0.75 s to build both `OnceLock`s, 2–4× that in
  wasm. Against: Hspell is AGPL and flags ~26% of Talmudic Aramaic
  (`hebrew.rs:4-24`), and there is no other Hebrew dictionary in existence. A
  checker that squiggles a quarter of a Gemara quote is worse than none.
  Proportionate, and the wasm cost is noise next to Typst.
- **`docx.ts` (452 lines, zero dependencies).** A hand-rolled zip reader
  (`:35-77`), an XML parser (`:97-150`), and WordprocessingML → Ksav including
  ordered-vs-bulleted resolution through `numbering.xml` (`:388-405`) and an honest
  `dropped[]` report. I expected ceremony and found format archaeology you only get
  from having been burned: `flagOn` (`:206-212`) refusing to read
  `<w:b w:val="0"/>` as bold; the local-header re-read at `:65-67` because Word
  writes a different extra field. Adoption argument right, tests real (26 cases
  against hand-written WordprocessingML), three gaps named rather than faked.
- **`capabilities/default.json`.** `core:default` only — no `fs:`, no `shell:`, no
  `http:`. Dialogs go through Rust `DialogExt` (`lib.rs:290, 319`) *specifically* so
  no JS filesystem grant is needed, and `AllowedPaths` (`lib.rs:249-275`) is tested
  (`:447-487`). The best permission decision in the repo, in four lines.
- **`assemble_source`'s comemo caching, `save.ts`, `crash.ts`, `api.ts`'s
  `CompileCache`/`PageStore`, `preview.ts`'s virtualisation, `mode.ts`.** Each is
  justified by a measured number in its own comment: 9.7 MB re-serialised per pause;
  1,227 ms of `innerHTML` per keystroke; 384 of 1,035 generated documents that would
  not compile. `mode.ts` in particular is the highest-value 366 lines in the app.
- **The `wasm-worker-host` stub.** Two files, four lines of code, twenty-five of
  correct explanation: Vite's worker plugin resolves `new Worker(new URL(…))` during
  graph-walk, before dead-code elimination, so guarding the call site does not
  tree-shake it. Without the module swap the desktop and server builds carry a 29 MB
  wasm they never load.
- **`README-notes.md`.** Recorded failures are the one artifact git cannot
  reconstruct. Keep entire.

---

## 13. The want with no edge

> ### ✅ Done — 7 August 2026
>
> The verdict is accepted and it was right. A kuntres was written in the
> application: `ksav serve` on 7878, Vite on 5173, a headless Chromium driving
> the real chrome, the shipped **ספר** template, and the product's own
> invitations — the toolbar for structure, the Notes chooser for the apparatus,
> the ribbon for the list and the table, the export menu at the end. The full
> account is [`decisions/2026-08-07-writing-a-kuntres.md`](../decisions/2026-08-07-writing-a-kuntres.md).
>
> **Three bugs, and the section's claim about them holds exactly.** Every one
> was green in 3,556 assertions and 383 engine tests, and not one was a gap in
> coverage.
>
> - **A sefer numbered by the toolbar came out unnumbered.** Press § three
>   times: סימן א׳, סימן א׳, סימן א׳. The registry's snippet is `#סימן[א׳][|]`
>   and the caret is in the *title* — past the number — so the writer never
>   visits the field that is wrong, and the outline pane lists all three as `א׳`
>   without a word. Fixed at `insertSnippet`, which is the one insertion path,
>   which needed a gematria **writer** — the prelude has only a reader, for
>   sorting. Written as a sum first, and the test caught that instantly:
>   `#סימן[פתיחה]` sums to 504 and would have been "continued" to `#סימן[תקד]`.
>   Every Hebrew word has a gematria; almost none is a numeral.
> - **A gershayim got Typst's English.** `"` is the key you press for רש״י, and
>   inside `(…)` it opens a string — so the commonest punctuation mark in the
>   language produced `unclosed string`, verbatim, at a writer who has never
>   heard of one. Six families were reaching the reader as `message == raw`,
>   including `missing argument: כותרת` from `#סימן[א׳]`. The reason nothing
>   caught it is this repository's own bug family in the module whose *whole
>   job* is the sentence a writer reads: `every_rephrasing_is_bilingual` walked
>   a list of six raw strings the rephraser already handled, so it could not go
>   red for one it did not. `tests/diagnostics_corpus.rs` is twenty-five
>   documents that really fail, compiled for real.
> - **The citation did not keep its place.** The Mekoros panel wrote
>   `#מראה_מקום[${place.display}]` — one line under a comment saying *"the ref
>   travels with it, because that is what makes it re-printable later (spec.md
>   §10.2)."* `place.ref` was read by nothing, so the source index, the PDF
>   link and the entire argument for the Girsa pairing were dead for every
>   citation the editor could insert by itself. The *other* door — a packet
>   handed over by Girsa — writes `מקור:` and has an engine test.
>
> **The prediction that did not hold: "shorter and more expensive."** Three
> bugs, not six, and they were cheap — 8 files and two new modules. What made
> them worth the hour is not their cost, it is that no amount of reading was
> going to produce them. Each one is a *surface* that is silent about a
> *mechanism* that already works, which is the shape a reader has to be lucky
> to see and a writer cannot miss.
>
> **Three suspicions were cleared by checking**, and they are recorded because
> each would have been a plausible finding to file: `#שער` really is a level-0
> title row and not a section; רש״י in a list item really does light the whole
> ribbon; and deferring a mareh makom really does write `סוג: מראה_מקום`, which
> was read as a bug from the bodies before the markers were looked at.
>
> This does not close the item. Most of a siman is not a sefer, and the next
> hour will find three more.

Twelve commits landed on 2026-08-04. Fourteen features in one day: vim, emacs, a
hydra, macros, a PWA, share-by-URL, tracked changes, an overview ruler, a file
watcher, a Word importer, two indexes, two-sided page setup.

`spec.md:681` — the project's own assessment of the source it borrowed from — notes
that typstify's surface is *"aimed at somebody who wants to write **Typst**, not
somebody who wants to write a **sefer**."* It took it anyway. `spec.md:779` concedes
*"Vim mode in particular has never had a key pressed in it."* `macros.ts:1-9`
justifies itself with *"Word and LibreOffice both ship this."*

That is not a want. It is a checklist derived from other people's products —
Word parity, then typstify parity, then Katvan parity — and it has no terminating
condition. It is why there are four delivery targets, twelve markup scanners, and
a version-control system inside a text editor whose files are plain text.

Meanwhile `plan-notes-and-ui.md:165-169` has already written the finding:

> *"A green test suite measured the wrong thing. 2,276 assertions, 20 engine
> binaries, three audits — and an hour of hands-on use found six bugs. Not one of
> them was a gap in coverage; every one was a gap in what was being asserted. Volume
> of tests is not evidence of correctness and should stop being quoted as though it
> were."*

An hour of use beat three audits by six to nothing. The response was another
fourteen features, taken from a Go IDE for Typst programmers. And the line
immediately above that paragraph, in the same file, quotes an assertion count that
is itself wrong by 426.

`ksav/README.md:333`, last unchecked box, correct and unchanged:

> **"Nobody has written a real document in it yet."**

That is not a to-do item. It is the diagnosis, and every unbounded wave is
downstream of it. The רש״י bug in §1 survives because nobody has typed רש״י into a
list. The empty notes pane in §9a survives because nobody has turned on deferred
bodies and then opened the pane. The dead citation autocomplete in §2 survives
because nobody has used the offline build. **The single highest-value engineering
action available is not on this list.**

**Verdict: `don't-build` — the next wave.** Write a kuntres in it. The bug list
writes itself, and it will be shorter and more expensive than the fourteen.

---

## Ranked, by wrongness × cost of leaving it

| # | Finding | Verdict | Cost to fix |
|---|---|---|---|
| 1 | ✅ **Fixed 6 Aug.** Fourteen markup scanners (twelve counted, four more in `styles.ts`); six verified one-click contradictions, plus `#שער` outlined as a section it is not and a bracket heal that corrupted valid documents | `rewrite` → one `spans.ts` | ~1 week, 14 files, no visible change except the bugs |
| 2 | ✅ **Fixed 5 Aug.** Ten dispatch sites, one checked; `sefarim` dead in wasm, 6 proxy routes missing, CSP diverged so the update check is dead on both installer builds | `rewrite` → one registry + `build.rs` assertions | ~2 days |
| 3 | ✅ **Done 7 Aug.** Nobody has written a document in it. Somebody has now — the real app, the shipped ספר template, the toolbar and the chooser and the ribbon. Three bugs, all green in 3,556 assertions, none a gap in coverage: a sefer numbered by the toolbar came out **סימן א׳ three times** (the caret is placed past the number, so the writer never sees the field that is wrong); a **gershayim** — the key you press for רש״י — produced `unclosed string` verbatim, one of six families reaching the writer as `message == raw`, under a test that walked a list of strings the rephraser already handled; and the Mekoros panel dropped `place.ref`, killing the source index and the PDF link for every citation the editor inserts, one line under a comment saying the ref travelled | `don't-build` the next wave → **one kuntres, written** | 8 files, +2 modules, +2 test files, +1 engine corpus. "Shorter and more expensive" was half right: three, and cheap. What made it worth the hour is that no amount of reading produces them — each is a silent surface over a mechanism that already works |
| 4 | ✅ **Fixed 6 Aug.** 19 false/stale doc claims; the release-status contradiction was `ksav/README.md`'s half (`v0.1.0` is published, verified against GitHub), and "page setup travels with the file" was a **product** bug — `serializeDoc` dropped `config` on every route out of the app, including duplicating a document. The card printed ten bare action ids; the Girsa links pointed into an untracked sibling of a public repository | `rewrite` → a card diff, a two-way count sweep, two link sweeps, a load-bearing exemption list | ~430 lines, not 80; 12 files, 9 mutations red — one of which caught the exemption list reproducing `ONLY_AT_TOP` |
| 5 | ✅ **Fixed 6 Aug.** `ksav.typ` wrote the apparatus 3× and fixed one bug twice; `PAGE_APPARATUS_COMMANDS` was a ninth unchecked copy | `rewrite` → one `_ap_*` core + a pinned layout + a count | ~half a day, 5 files; 41 documents byte-identical; −13 code lines, and three homes for a decision down to one |
| 6 | ✅ **Fixed 6 Aug.** Notes pane empty in every deferred document and `⁑` gave the wrong tier; the collected-and-never-rendered lint was blind to deferred notes too, and deferring in an English document wrote Hebrew into it | `rewrite` → one `notesIn` over both spellings + an equivalence oracle | ~1 day, 8 files; +98 code lines, not −180; 9 mutations red, 2 controls green |
| 7 | ✅ **Fixed 6 Aug.** Fresh clone does not build; not one doc mentions why. The eight `actions/checkout` steps were the loud half — `packaging/build-linux.sh` mounts only this repository, so the documented Linux installer build resolved `girsa-post` to `/sefer-crates` and could not have produced an installer, with no workaround and no error anyone had seen. `--features embed-ui` was a second fresh-clone failure, through `app/dist` | `rewrite` → a git dependency pinned by SHA, **not** the submodule prescribed: `--recursive` reproduces the bug one forgotten flag away, and a second checkout silently kills the paired edit the steelman rests on. Plus `.cargo/config.toml.example` (a `paths` override — `[patch]` erases the pin from `Cargo.lock`), a `build.rs`, and `engine/tests/manifests.rs` | 5 checkout steps and the `Ksav/` prefix out of both workflows; 12 files, 2 added; the hour was the manifests, the rest was the sentence nobody had written |
| 8 | ✅ **Fixed 6 Aug.** `registry.rs`'s `ONLY_AT_TOP`: 6 of 9 exemptions disproved by a green sibling test — verified against the fixture before deleting | `delete` → the file is gone, both survivors moved into `insertion.rs`, and `the_grid_exempts_nothing` replaces the skip list | ~1 hour; the English widening the finding also asked for was built, is wrong, and is argued down in the source |
| 9 | ✅ **Fixed 6 Aug.** `chrome.test.mjs` credited surfaces to each other by local-variable name and its Escape block survived the handler being deleted; the hydra had no Escape once its own buttons had focus, and two of the sixteen "surfaces" were phantoms | `rewrite` → one `panels.ts` registry + 13 mutations | ~1 day, 5 files; `main.ts` −18 lines, not −250 |
| 10 | ✅ **Fixed 6 Aug.** Print silently printed the healed document; the Word routes produced no file under a status line announcing one. Both live in `exports.ts`, which was one of #13's nineteen — the hole and the bugs were the same finding | fix in place → a non-printing banner in the print window, and `reflowableHtml` reporting a reason instead of its caller's outcome | ~1 hour |
| 11 | ✅ **Fixed 6 Aug.** `fold()`, defaults, the command pairing, font notices, `#כלול`, head alignment, "strip the markup" — each 2–3× in 2–3 languages; `spans.ts` was a ninth site the finding missed. Two real bugs fell out: `_ix_fold` folded `שַׁבָּת` to the empty string (grapheme clusters, so a pointed letter went with its point) and `#כלול("")` was a directive in Rust and not in TS | `rewrite` → one generated `engine.gen.ts` + two executed corpora | ~1 day, not 8: the eight are one question asked eight times. 20 files, 7 added, ~200 hand-written name pairs deleted, 8 mutations red |
| 12 | ✅ **Answered 6 Aug — verdict refused.** Every diagnosis held; the conclusion did not. Six of the nine were dead for a small, nameable reason — no host, no base URL, an inline `<script>`, a `keydown` listener that could never be first, no generated service list, an error message blaming a missing API key — and "delete it" and "finish it" are indistinguishable from the evidence gathered here. The `/inbox` cache poisoning was worse than stated: a drained queue replayed once a second is a document eater, not a stale bundle. Rows 8 and 9 are factually wrong — `refreshBaseline` feeds the change gutter from the newest snapshot and `ruler.ts`'s fourth mark is `change`, so deleting the history darkens a surface this section leaves standing; and `changes.ts` is that gutter, not tracked changes | `delete` → **build**: `deploy.yml`, `__PUBLIC_BASE__`, `sw-cache.js` + a generated `sw-services.gen.js`, `web/editor.js` + one `policy_for`, an honest archived-mock panel | 5 commits, 21 files, +3; 8 mutations red; 3 further bugs found by *using* it — the hydra's eleven keys all dead under vim, `canBreakInItem` constantly true, and the fixture that compiled one caret while the sweep visited every one |
| 13 | ✅ **Fixed 6 Aug.** `run.mjs` listed 43 of 62 modules and **not one test imported the other nineteen**; "cannot build" was wrong (61 of 62 build) — nothing compared the list to the directory. The build also gave every entry its own `runtime` singleton, so every cross-module fact failed closed, and `brackets.ts` broke the no-new-line invariant `compile.ts` rests on | fix + prune → the list read off `src/`, `runner.test.mjs`, 16 modules tested, `help`/`coverage` pruned | not 2 hours: 24 files, +9 test files; 3,482 assertions across 58 files — **+8 files, −382 assertions**, 8 mutations red |
| 14 | `main.ts` at 5,653 lines as such | `wrong-but-keep` | — |
| 15 | ✅ **Fixed 7 Aug.** Concatenated prelude and the coordinate-correction régime. The prelude stays concatenated — that half is accepted. Everything the section says should happen regardless is done, and the extraction was the smallest of the three: `body_offset` was assembling 111 KB with an empty body to learn one integer, once per compile and twice per jump, when every caller already held both strings; and `enclosing_let`'s "flat list of `#let`" was a spelling habit over 2,324 lines with nothing testing it. Sweeping all 360 bindings found seventeen that reported a **truncated command name** — `#let pageband1` as `#pageband` — which is rule 4's own prohibition inside the function written to obey it | `wrong-but-keep`; extract `assemble_source` through wasm → a twelfth service, one `read_document` shared with `compile`, and a byte-identity oracle | not 1 hour: 13 files, +2 test files. Export .typ 18–79× faster and flat in document size; `services.test.mjs`'s "one row per method" was `ONLY_AT_TOP` in a second file and is now checked |

---

## Coverage, honestly

Every tracked file landed in exactly one of twelve regions and every region
reported. Read in full: all Rust under `engine/src`, `wasm/src`, `src-tauri/src`;
all 19 engine test files; all 58 `.ts` under `app/src` including `main.ts` (5,653,
in seven passes) and `styles.css`; all 44 `.test.mjs`, `run.mjs`, `harness.mjs`,
`card.mjs`, the three fixture generators; `ksav.typ` (2,238, four passes); all ten
templates; all build, packaging and CI files; every `.md` in the repository; both
lexicon supplements.

Sampled rather than read: `lexicon-he.txt` (269k lines — header, two windows, four
`grep` censuses), `lexicon-en.txt` (header + ESDB notice), `insertions.json` (1,035
cases characterised programmatically: 9 contexts × 115 commands, 1,017 legal, 18
refused, all sources distinct), `structure-edits.json` (84 cases), `note-layouts.json`
(26).

Line-counted and characterised, not read: `prototypes/**` (6,222 lines) — every file
counted, `rust_ffi.dart` grepped end to end, whole tree grepped for `typst`,
`gemini`, `API_KEY`. Enough to confirm they are UI mocks emitting Typst strings with
no compiler behind them, which is all the deletion test requires.

Excluded and stated: `Cargo.lock` ×3, `package-lock.json`, six font binaries,
sixteen icon PNGs, `LICENSE-MIT`/`LICENSE-APACHE`/`licenses/*` read for length and
cross-reference only (not verified verbatim against upstream), `gen/schemas/*`
(generated, git-ignored).

**Executed rather than asserted:** `npm test` (44 files, 2,723 assertions, 0
failed), `cargo test` (332 tests, 22 binaries), the `structure` fixture binary (168
compiles, 5.13 s), `node tools/card.mjs` diffed against HEAD, `spellrate.exe` ×4
(RSS, cold start, tokenisation, supplement over-acceptance), all six markup-scanner
divergences in §1, `structure.availableAt` timing at 10 KB and 41 KB, both notes-pane
results in §9a, i18n key parity (562/562), and the `MODULES`-vs-`src` diff.

**Read statically and flagged as such:** the CSP intersection (§2), the `/inbox`
service-worker cache poisoning (§8), and `#rashi(font: "Keter")`'s arity failure.
Each is one launch away from confirmation and should be confirmed before acting.

**Where the findings came from.** They are not concentrated in one region. The
ranked list draws on the app document model (#1), delivery/build (#2), documentation
(#4), the Typst prelude (#5), the note apparatus (#6), the engine services (#7), both
test suites (#8, #9, #13), export (#10), and cross-region synthesis (#3, #11, #12).
Findings #1, #2, #3 and #11 are *between* regions and were invisible until every
region had reported — which is the entire payoff for reading all of it, and the
reason the sweep did not start from `git log`.

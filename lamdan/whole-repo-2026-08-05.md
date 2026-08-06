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
| 3 | Nobody has written a document in it | `don't-build` the next wave | one kuntres |
| 4 | 19 false/stale doc claims incl. two contradicting release-status statements and a false "page setup travels with the file" | `rewrite` → 80 lines of test | ~half a day |
| 5 | ✅ **Fixed 6 Aug.** `ksav.typ` wrote the apparatus 3× and fixed one bug twice; `PAGE_APPARATUS_COMMANDS` was a ninth unchecked copy | `rewrite` → one `_ap_*` core + a pinned layout + a count | ~half a day, 5 files; 41 documents byte-identical; −13 code lines, and three homes for a decision down to one |
| 6 | Notes pane empty in every deferred document; `⁑` gives the wrong tier | `rewrite` → `notesIn` returns one `NoteSpan[]` | ~1 day, −180 lines |
| 7 | Fresh clone does not build; not one doc mentions why | `rewrite` → submodule | ~1 hour, −8 CI steps |
| 8 | `registry.rs`'s `ONLY_AT_TOP`: 6 of 9 exemptions disproved by a green sibling test | `delete` | ~1 hour |
| 9 | `chrome.test.mjs` cannot see which surface a closer belongs to; the Escape block asserts nothing | `rewrite` → `PANELS` array | ~1 day, −250 lines from `main.ts` |
| 10 | Print silently prints the healed document; Word export claims a fallback it doesn't do | fix in place | ~1 hour |
| 11 | `fold()`, defaults, note taxonomy, font notices — each 3× in 3 languages | `rewrite`, incrementally | ~1 day each |
| 12 | Vim/emacs, hydra, macros, share, PWA, `engine/web/index.html`, prototypes source, history+Myers, tracked changes | `delete` | ~9,000 lines out |
| 13 | `run.mjs` cannot build 43% of `src/`; ~890 assertions measure table shape | fix + prune | ~2 hours |
| 14 | `main.ts` at 5,653 lines as such | `wrong-but-keep` | — |
| 15 | Concatenated prelude and the coordinate-correction régime | `wrong-but-keep`; extract `assemble_source` through wasm | ~1 hour for the extraction |

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

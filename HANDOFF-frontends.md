# Handoff: frontends (views in boxes)

> **Which handoff is this?** This one is for the *frontends* work: branch
> `frontends`, worktree `/home/shaul/ksav-frontends`, PR #245, written
> 2026-11-24. It is **not** the shell/ribbon handoff (#233, branch
> `shell-office`, in `/home/shaul/ksav`), which is in `HANDOFF.md`.

**Branch `frontends`**, worktree `/home/shaul/ksav-frontends`, **PR #245**
(not merged; the user reviews it). The plan is
`decisions/2026-11-23-frontends-are-views-in-boxes.md`; read §1, §2, §4 and §5
before writing anything. **Never touch `/home/shaul/ksav`.** That tree belongs
to the other Claude, whose branch is `shell-office`. Do all work here.

### What is done (commit by commit)

| Commit | What |
|---|---|
| `e17fe4e` | Step 1: the decision record. |
| `52c17eb` | Step 2: `views.ts`, the registry (parts, modes, link modes, layers, the scope query). `views-builtin.ts` registers the built-ins through it. |
| `42a10e1` | Step 3: `Leaf.view` / `Leaf.link`, the mode line (`modeline.ts`) and the open-box picker. |
| `9263a9f` | #238 option 1: `spans.scan` is incremental (`rescan`). `scanFromScratch` is the oracle, and `test/scanincremental.test.mjs` holds the two equal. |
| `a553897` | Step 4: writer mode. `proseOrRaw("writer")` in `compartments.ts` installs `writerFacet` (never reveal) and `writerAtomic` (`EditorView.atomicRanges`). Test: `test/writer.test.mjs`. |
| `29a3b3e` | §2 `noteDelete` setting (`twoStep` default, or `immediate`), in `notedelete.ts`. It is bound only in the writer. |
| `94db938` | Step 5, **core only**: `subrange.ts`. `follow` maps a range through the primary's changes and returns `gone` if the range was deleted; `forward` sends a box's edit to the primary. Pins: `pinNote`, `pinnedNote`, `freshId`, which write `מזהה: "n…"` into the note's head. `engine/typst/ksav.typ` now accepts `מזהה:` on `#הערה` and `#הערה_בדרגה`. Test: `test/subrange.test.mjs`. |
| `239f0fe` | Writer fix: Backspace/Delete on a hidden formatting edge unwraps the command instead of deleting one bracket (`notedelete.unwrapRange`). |

### What is left, in order. Do one at a time, and commit each.

1. **Step 5, wiring: a box that shows one note.** Take this route, because it
   reuses tested code:
   - Every source pane already holds the *whole* document, with changes
     mirrored between panes (`paneview.ts::mirrorChange`, one history, on the
     primary).
   - `narrowing.ts` already hides everything outside one span and refuses edits
     outside it (`paneview.ts` dispatch, `changeReachesOut`).
   - So a "one note" box is a source pane narrowed to that note's body:
     - Add a second kind of narrowing whose span is a note, found by its pin id
       (`subrange.pinnedNote(doc, id)`), using `bodyFrom`..`bodyTo`.
     - When `pinnedNote` returns null, the box shows "this note is gone" (new
       i18n key, in both `i18n-en.ts` and `i18n-he.ts`). It never guesses.
   - Open it from the scope `{ part: "notes", under: "<id>" }`:
     - Make `panes.rendererOf` return `"source"` for that scope with mode
       `source` or `writer`.
     - Lift the `NOT_YET` for it in `views-builtin.ts`. The test
       `modeline.test.mjs` "allowed iff drawn" forces these two to agree.
   - Pin on open: `freshId` + `pinNote`, dispatched as one change.
   - `subrange.follow` / `forward` are for a box whose document is *only* the
     range. With the narrowing route you may not need them. That is fine; do
     not delete them unless they end up unused (then `modulesurface` will tell
     you).
   - Tests: a note box opened, typed into, and the text visible in the primary.
     The marker deleted in the primary makes the box say "gone" and never throw.
2. **Step 6:** the multi-note view: a list of note editors for a scope (series,
   depth), using `views.notesInScope`, with only the rows near the viewport live,
   plus the `scroll` link.
3. **Step 7:** the `aligned` link (a note box sits beside its marker), chains,
   and `under:"caret"`.
4. **Step 8:** commands, keys and the ribbon resolved through the focused box's
   layers (`views.ts` layers).
5. **Step 9:** the insert-note flow (§2), the derived default layout, and the
   layout file `<name>.ksav-layout.json`. Only *after* the writer and the note
   box can replace them, delete prose mode, `panes.ARRANGEMENTS` /
   `panearrangements.ts`, and the semantic `sourceMotions` (`sourcemotion.ts`,
   setting, drawer row, i18n, test). Update help and the acceptance journeys.
6. **Step 10:** independent flows as linked documents. This waits on #43.
7. **#238 option 2:** the scan moved to Rust, async. The user asked for both
   options; option 1 is done.

### How to work here

- **Gate per commit:** from `ksav/app`, run `npx tsc --noEmit && npm run lint && npm test`.
  `browserlang` and `importui` "asserted nothing" because there is no browser
  here. That is environmental, not yours.
- **Before calling anything green,** run `cd ksav && node tools/gate.mjs`, the
  whole gate. It also checks import cycles and the Hebrew product lexicon,
  which `npm test` does not.
- **Repo rules the tests enforce:**
  - every `src` module must be imported by some test;
  - an export that only its own file reads fails `modulesurface`, so unexport it;
  - only `spans.ts` may strip markup with a regex, so use `spans.plainText`;
  - every new UI string needs keys in **both** `i18n-en.ts` and `i18n-he.ts`.
- **Tests** import compiled modules from `../.tmp-test/<module>.mjs`, using
  `check(name, got, want)`, `ok` and `notOk` from `./harness.mjs`. Copy
  `test/writer.test.mjs` for shape.
- **Commits** end with the `Co-Authored-By:` trailer. Push to `frontends`,
  which updates PR #245. Do not merge, and do not force-push.
- **Another AI shares the repo.** Claim an issue before taking it, and never
  edit `/home/shaul/ksav`.

### Known gaps / risks

- The writer's atomic ranges were checked against CodeMirror commands using a
  fake view (no DOM here). Nobody has typed in the writer in a real browser
  yet. Do that first if you have one (`npm run build`, then the desktop
  shell).
- `noteDelete`'s first-step hint uses `runtime.setStatus`; it was not seen on
  screen.
- `tools/gate.mjs` at handoff: 10 of 13 green. The editor suite passed
  14982 checks with 0 failures. Its ✗ comes only from `browserlang` and
  `importui` asserting nothing, because there is no browser in this shell.
  The engine `product_words` test failed: there were 30 new Hebrew UI words.
  This was fixed by regenerating the lexicon. **Any new Hebrew string needs
  `cd ksav/engine && cargo run --example emit-product-words`.** Not measured
  here: the 3 desktop-shell checks. Run them with
  `nix develop .#desktop --command bash -c "cd ksav && node tools/gate.mjs shell"`.

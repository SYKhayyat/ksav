# The skip that named itself

`docs/ui-architecture.md` §12 steps 9 and 10: the pressed state read from the
caret, and the acceptance run that drives the assembled shell. Both shipped, and
the machine that measured them found two things the plan had not named — one in
the product, one in what CI was measuring.

## Decided

- **The caret's context is read from the scan, never from a walk of its own.**
  `pressed.ts` asks `spans.ts` — first `stackAt`, and after #247 `inBody` — so the
  bracket a toggle believes in is the bracket the rest of the application
  believes in. The private matcher it started with is the finding at the top of
  `spans.ts` earning its keep a twelfth time.

- **An unclosed body is still the caret's body, and still not a mark.** These are
  two different questions about one half-typed `#הדגשה[של` and they have two
  different right answers. `review.ts` keeps its rule — an unclosed mark is not a
  mark, because accepting one would remove text nobody selected — so the model
  stays head-only for such a call. A *reader of state* wants the opposite: the
  writer is inside bold from the moment the `[` is typed. The disagreement is
  resolved in `inBody(scan, n, pos)`, which reads the model and the frame scan
  together, rather than by widening `node.to`, which was tried first and broke
  `review` — as it should have. **A fix that changes what the document model
  *is* to answer what a widget *shows* is the wrong fix.**

- **A test that cannot measure says so, in one sentence, with the command that
  would let it measure.** Two builds are legitimate: `npm run build:wasm` puts the
  engine in the bundle, `npm run build` / `npx vite build` keeps it at the other
  end of a wire. In the second, with no server behind it, there are no commands —
  so no faces, groups, tabs, tips or Org parser. Five browser files were asking
  for those anyway and reporting a thirty-second timeout against a selector
  instead (#248). `openApp({ ribbon: true })` now answers with the reason, and
  `ci.yml`'s `browser engine` job — the one build where an engine is in the
  bundle — runs the same files, so the coverage moved rather than vanished.

- **The full gate is the only place a whole-suite flake shows.** `shrink` passed
  alone and failed in the suite: `openApp` waits a fixed two seconds and the panel
  is drawn when the registry arrives. It waits for the panel now. A fixed wait in
  a browser test is a deadline, and deadlines lose to load.

## Why the acceptance run is code and not a checklist

§12 step 10 asks that the assembled application work, not that its parts do.
`.github/scripts/acceptance.mjs` drives the real SPA inside the real server —
tab row, the Font group's boxes and names, the backstage over the whole window
and out on Escape, the contextual Table tab, the `⌃` fold, the Alt tips, and the
narrow ribbon at 680 and 620 px — and asserts 1,161 checks. Two things it found
are worth keeping in the record because they were *test* faults with the shape of
product faults: a recipe that read `gear-*` where it meant `more-*`, and a
declared-but-never-called `undrive`, whose absent collapse leaked a persisted
setting into every later surface.

- **A window measured before its document arrives measures this machine.** The
  viewport is pinned and `document.fonts.ready` awaited before the first
  measurement; CI's 1280×720 had been reading a 0×0 pane.

## State

Steps 9 and 10 are green locally — 15,196 assertions over 178 files, the gate's
`editor`, `engine` and `formatting` jobs, and the acceptance run. The `editor`
job's five timeouts are the skip above; the ribbon assertions they used to make
now happen in `browser engine`.

Open, and named rather than worked around: the `editor` job still has no ribbon
of its own, which is why five files say so and the ribbon is asserted in
`browser engine` and driven end to end by the acceptance run. Nothing else is
deferred: #247 is closed by this record's change and #248 by the skip.

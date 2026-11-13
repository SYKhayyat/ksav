# A settle is a correction, and a correction is a glide — #137

**2026-11-13.** UAT 32: *"scrolling in the source makes preview scrolling
jerky, and source scrolling never reaches the top of the preview."*

The linked follow is an estimate — a line-height model of what prints — and it
is on-screen a frame after the wheel moves, which is what makes continuous
scrolling smooth. The exact answer (page + baseline from the compiler's own
layout) used to arrive later as **one assignment**: whatever the model was wrong
by, at once, on whichever frame the engine happened to answer. Measured on a
12-page sefer that was a jump of up to 542px landing a second or two after the
hand stopped — and silently *nothing at all* on the way down, which is where the
"never reaches the top" half of the report came from, because the downward
anchor is the top line of the viewport and the top of a viewport between two
paragraphs is a blank line, which prints nowhere.

## Three defects, in the order they were found

1. **The settle arrived late and landed as a jump.** It asked the engine for a
   fresh `reveal` — a whole compile — so it landed whenever the re-layout had
   finished, not at `syncSettleMs`. And it applied its answer as one assignment.
   The jump is what a reader calls "jerky" after the wheel; the lateness is what
   makes the jerk land on a cursor that has already moved on.
2. **The settle was silent in one direction.** A blank anchor line is a question
   with no answer, and "no correction" is what the estimate-wins fallback said.
   Down was always-the-estimate; up was sometimes-corrected.
3. **Neither end was an end.** A proportion of one pane's pixels is not a
   proportion of the other's: the last screenful of a source is lines, and the
   last screenful of a preview is lines plus a page's foot and the pane's
   padding. At the source's very bottom the preview stopped short of its own
   bottom by exactly that difference, so the sefer's last foot sat just off the
   fold — the report's "never reaches" at the other end.

## The three fixes

**The exact answer is already on this client.** Every page the compile drew came
back with its printed lines, their baselines in points, and the source line each
came from (`PrintedLine`) — the same numbers `reveal` would have returned,
because `y` is documented as "the baseline in points from the top of the page,
…what a hit is revealed at". So the settle *reads the layout it has*
(`spotOfLine`) and only falls back to `reveal` when the line printed nowhere.
That is what makes it land at `syncSettleMs`, not whenever a re-layout finishes.

**The settle is a glide, not a jump.** `glideTo` moves from the estimate's
position to the compiler's over 200ms on an ease-in-out curve kept in
`scrollmap.glideEase` so its shape is asserted as arithmetic rather than felt
for: exact at 0 and 1, monotone, and no single frame of a twelve-frame settle
carries more than a third of it. Every frame's write is recorded as ours, so the
pane's own handler reads it as an echo rather than as a person scrolling — and a
person who puts a hand on a pane mid-glide cancels it (`cancelGlide`), because
their gesture is the position now.

**The ends clamp instead of mapping.** `endOfScroller` names the end a pane is
standing at, and both the follow and the settle answer "top of one is top of the
other, bottom is bottom" there. The map (and its error) stops at the ends, which
is where it cannot be right.

**And the blank line is walked past.** `firstInkLine` answers the settle with
the first line below the anchor that can print, so the correction happens in
both directions instead of only coming back up.

## What changed, and what it is held to

- `scrollmap.ts`: `spotOfLine`, `firstInkLine`, `endOfScroller`, `glideEase`.
- `panescroll.ts`: the settle reads the on-screen layout first and falls back to
  `reveal`; `glideTo` replaces the single assignment; `cancelGlide` on a new
  follow and on a person's scroll; `firstInkLine` and the end clamp wired in.
- `test/scrollmap.test.mjs`: spotOfLine (exact hit, no-ink line takes the line
  above, first/last, monotone sweep, running heads skipped, empty table), the
  glide curve, the ends, and firstInkLine (walk, bounded tail, empty doc).
- `acceptance.mjs` step 20, measuring on a real window: the settle corrects the
  estimate *somewhere* in a long sefer (looked for, not assumed), lands while
  the hand is still stopping (≤ 700ms), arrives over ≥ 3 frames, and no frame
  carries more than two fifths of the correction; then, reached by holding the
  wheel: the source's end brings the pages to *their* end with the last page's
  foot on screen, and back at the top the pages are back at theirs.

Before/after on the same 12-page sefer: the old settle arrived as a single 542px
jump ~1.5s after the hand stopped and was silent going down; the new one arrives
as thirteen eased frames in ~350ms, corrects in both directions, and lands both
ends exactly (preview 2969 of 2969, last page's foot on screen — was 2927, two
pixels short of the fold).

Two notes worth keeping. **"Never reaches the top" was not about the top.**
Scrolling up *to* the top already reached 0; the real defect was the silent
downward settle and the short bottom endpoint. Symmetry of instrumentation
matters: measuring both ends and both directions is what surfaced it. And the
source-shape fences in `retention.test.mjs` were windows of "the next N
characters" that a comment moved past — they now read `settleNow` as its own
slice, which is what a fence around a function should have been from the start.
```

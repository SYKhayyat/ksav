// The pane refresh, and the scan it no longer takes (#219).
//
// # The finding
//
// `npm run bench` at the size a sefer actually is (634 KB, ~993 pages) reported a
// keystroke costing ~86 ms of main thread *every 200 ms of typing*: `spans.scan`
// (~55 ms) plus the notes index (~31 ms), paid by the two panes a writer keeps
// open while writing. The panes were debounced, which changed *when* the cost
// landed and not what it was — and the app already had a shared, off-thread scan
// (`scanmemo.ts`) that every other consumer used. The panes were the one place
// that walked the document itself (`ksav-lang.ts`'s `outline`, `notes.ts`'s
// `notesIn`), each calling `spans.scan` on the typing thread.
//
// # What this file holds
//
// Two things, because either one alone can be satisfied while the other rots:
//
// 1. **Shape**: the refresh asks `scanForBackend` for the scan and builds its
//    rows over the answer. A pane that starts scanning locally again is a pane
//    whose cost is back on the typing thread, and no timing assertion here could
//    see it if the document were small.
// 2. **Cost**: with the scan in hand, one refresh stays under one full scan's
//    time — measured in the same process, so a slow machine cancels out. The
//    number to beat is "the walk is the worker's"; a ratio of one means the walk
//    is back here.
//
// The scan itself is not measured as a cost: it belongs to the transport now, and
// `bench-structure.mjs` still prints it so a regression in the engine or the
// worker stays visible.

import { ok } from "./harness.mjs";
import { srcOf } from "./source.mjs";
import { SEFER_810 } from "../tools/seferfixture.mjs";
import { scan } from "../.tmp-test/spans.mjs";
import { notesOf } from "../.tmp-test/notes.mjs";
import { outlineOf } from "../.tmp-test/ksav-lang.mjs";

/** Time `fn`, after one warm-up pass. */
function ms(fn, n) {
  fn(0);
  const t0 = performance.now();
  for (let i = 0; i < n; i += 1) fn(i);
  return (performance.now() - t0) / n;
}

/**
 * The cheapest round, not the average one.
 *
 * This fence compares two costs in the same process, which is the right shape,
 * and it still went red twice while the rest of the suite held four browsers
 * open: a scheduling pause inside one timed loop moves an *average*, and the
 * loop it lands in is the one that decides the ratio. The minimum over several
 * rounds is the CPU's own answer to "how long does this take" — noise only ever
 * adds — and it costs a few milliseconds more.
 *
 * Both sides use it, so the ratio stays a comparison of like with like.
 */
function quickest(fn, n, rounds = 5) {
  let best = Infinity;
  for (let r = 0; r < rounds; r += 1) best = Math.min(best, ms(fn, n));
  return best;
}

export async function run() {
  const doc = SEFER_810;

  // ------------------------------------------------------- the shape of it
  {
    const main = srcOf("main.ts");
    const block = /refreshSidePanes: \(\) => \{[\s\S]*?\n    \},/u.exec(main)?.[0] ?? "";
    ok("the side-pane refresh is a promise, so the scan can be waited for", block !== "");
    ok(
      "…and it asks `scanForBackend` rather than walking the document",
      /scanForBackend\(runtime\.backend, text\)/u.test(block),
    );
    ok(
      "…and hands that answer to the outline",
      /renderOutline\(scanned\)/u.test(block),
      block.slice(0, 0),
    );
    ok("…and to the notes pane", /renderNotesPane\(scanned\)/u.test(block));
    ok("…and to the marks pane", /renderMarksPane\(scanned\)/u.test(block));
    ok("…and to the review panel", /renderReviewPanel\(scanned\)/u.test(block));
    ok(
      "…and drops an answer that arrived after another keystroke",
      /text !== docTextNow\(\)/u.test(block),
    );

    // The renderers must accept the scan, and the pane module must not take one.
    const rows = srcOf("rowlists.ts");
    ok("the outline renderer takes a scan", /export function renderOutline\(scanned\?: Scan\)/u.test(rows));
    ok("the notes renderer takes one too", /export function renderNotesPane\(scanned\?: Scan\)/u.test(rows));
    ok(
      "…and both renderers build over that scan when they are given one",
      /scanned \? notesOf\(doc, scanned\) : notesIn\(doc\)/u.test(rows) &&
        /scanned \? outlineOf\(doc, scanned\) : outline\(doc\)/u.test(rows),
    );
    ok(
      "…and the pane module never scans the document itself",
      !/\bscan\(/u.test(rows) && !/spans\.scan/u.test(rows),
    );

    const lang = srcOf("ksav-lang.ts");
    ok(
      "the outline is built over a scan it was given",
      /export function outlineOf\(text: string, scanned: Scan\)/u.test(lang),
    );
    const notes = srcOf("notes.ts");
    ok(
      "and so is the notes index",
      /export function notesOf\(doc: string, scanned: Scan\)/u.test(notes),
    );
    ok(
      "…and the marks, and the review marks",
      /export function marksOf\(doc: string, scanned: Scan\)/u.test(srcOf("marks.ts")) &&
        /export function scanMarks\(doc: string, scanned\?: Scan\)/u.test(srcOf("review.ts")),
    );
    ok(
      "…passing the scan on to the deferred half rather than letting it scan again",
      /scanDeferred\(doc, scanned\)/u.test(notes),
    );
  }

  // ----------------------------------------------------------- what it costs
  //
  // The document is the one the audit measured, and the four variants are four
  // keystrokes: a scan belongs to its text (`assertScanText`), so they are scanned
  // up front — that is the worker's half and deliberately outside the timer.
  {
    const at = Math.floor(doc.length / 2);
    const variants = Array.from({ length: 4 }, (_, i) =>
      [doc.slice(0, at), String.fromCharCode(0x5d0 + i), doc.slice(at)].join(""),
    );
    const scans = variants.map((text) => scan(text));

    const paneWork = quickest((i) => {
      notesOf(variants[i % 4], scans[i % 4]);
      outlineOf(variants[i % 4], scans[i % 4]);
    }, 4);

    // The whole-document walk, on the same document, in the same process. Eight
    // distinct texts, because `spans.ts` keeps a four-slot memo of scans keyed on
    // the string: measuring the walk over the same four texts would time the
    // memo's hits and report the walk as 0.08 ms, which is the number a fence
    // would happily believe (it did, once).
    const walkTexts = Array.from({ length: 8 }, (_, i) =>
      [doc.slice(0, at), String.fromCharCode(0x5d0 + i), doc.slice(at), " "].join(""),
    );
    const walk = quickest((i) => scan(walkTexts[i % 8]), 8);

    ok(
      "one refresh with the scan in hand costs less than one walk of the document",
      paneWork < walk * 0.75,
      `pane ${paneWork.toFixed(1)} ms, walk ${walk.toFixed(1)} ms`,
    );
    ok(
      "…and the ratio is reported, so a drift towards 1 is visible before it arrives",
      paneWork / walk < 0.75,
      `pane/walk = ${(paneWork / walk).toFixed(2)}`,
    );
  }
}

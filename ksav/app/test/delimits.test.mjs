// The delimiter list is a derived structure, built from what the lex recorded
// (#182).
//
// # Why this file exists
//
// `scan()` used to build `Scan.delims` eagerly: 30,780 `Delimiter` objects per
// keystroke at 1,000 pages, for an array only the pause paths read (the bracket
// lint, compile's heal, the export warning count). Now the lexer records
// numbers — the openers are already in `frames`, the closers are one packed
// integer each — and `delimits.ts` turns them back into objects on first read.
//
// This file tests the builder directly, because the failures worth pinning live
// at its seams and not in `scan()`:
//
//   1. **a `#let`/`#set`/`#show` frame is not a bracket.** `frames` is every
//      mode-bearing region, and the keyword statements push one at the `#`
//      itself, with no `[({` in it. An early version emitted `ch: undefined`
//      for those, the lint reported a valid document as broken, and the heal
//      wrote the word `undefined` into it.
//   2. **the merge is a merge** — openers and closers each arrive sorted, and
//      the output is one list in document order, not two lists concatenated.
//   3. **`structural` survives the rebuild** for both halves: an opener's is
//      "`[` anywhere, or a frame whose context is code", a closer's is the bit
//      the lexer recorded at the moment it saw it.
//   4. **the list is shared, not rebuilt**: `scan.delims` and `delimiters()`
//      answer with one array.

import { check, ok, notOk } from "./harness.mjs";
import { delimsOf } from "../.tmp-test/delimits.mjs";
import { clearScanCache, delimiters, scan } from "../.tmp-test/spans.mjs";

export async function run() {
  const both = (text) => {
    clearScanCache();
    return { fromScan: scan(text).delims, fromDelimiters: delimiters(text).delims };
  };

  // ------------------------------------------------ 1. frames that are not brackets
  const keyword = "#let x = 1\n#הדגשה[א]";
  const kw = both(keyword);
  notOk(
    "a #let frame is not a delimiter",
    kw.fromScan.some((d) => !"[({])}".includes(d.ch)),
  );
  check("…so the list is the one body pair and nothing else", kw.fromScan.map((d) => d.ch).join(""), "[]");

  // ------------------------------------------------------------ 2. the merge order
  // Hand-built, so the two cursors are pinned rather than assumed: two openers
  // and two closers, alternating, with the text holding the characters the
  // positions claim.
  const frames = [
    { open: 2, close: 4, ctx: "content", name: "" },
    { open: 6, close: 8, ctx: "code", name: "f" },
  ];
  const text = "ab(c)e(f)g";
  const merged = delimsOf({ frames, closers: [4 * 2 + 0, 8 * 2 + 1] }, text);
  check("the merge interleaves, it does not concatenate", merged.map((d) => d.pos).join(","), "2,4,6,8");
  check(
    "…and the opener reads the character it opens on",
    merged.filter((d) => d.opener).map((d) => d.ch + d.name).join(","),
    "(,(f",
  );

  // ------------------------------------------------- 3. structural, both directions
  check(
    "a code opener is structural and a content one is not",
    merged.map((d) => (d.structural ? "1" : "0")).join(""),
    "0011",
  );
  check(
    "every closer is a closer and every opener is an opener",
    merged.map((d) => (d.opener ? "o" : "c")).join(""),
    "oc" + "oc",
  );

  // ------------------------------------------------------------ 4. one shared list
  const doc = "#טבלה(עודות: 2,\n  תא[א], תא[ב],\n) #הדגשה[ג]";
  const shared = both(doc);
  check("scan.delims and delimiters() answer with one array", shared.fromScan, shared.fromDelimiters);
  check(
    "…in document order",
    shared.fromScan.every((d, i) => i === 0 || shared.fromScan[i - 1].pos < d.pos),
    true,
  );
  check(
    "…with every opener sitting on its own bracket",
    shared.fromScan.filter((d) => d.opener).every((d) => doc[d.pos] === d.ch),
    true,
  );
  check(
    "…and the frame count agrees, minus the keyword statements (there are none)",
    shared.fromScan.filter((d) => d.opener).length,
    scan(doc).frames.filter((f) => "[({".includes(doc[f.open])).length,
  );

  // A stray closer at top level is punctuation and says so.
  const stray = both("#f] עוד");
  const closers = stray.fromScan.filter((d) => !d.opener);
  ok("a stray closer comes through the rebuild", closers.length > 0, `${stray.fromScan.length} delimiters`);
  notOk("…and a `]` is structure even with nothing open", closers.some((d) => d.ch === "]" && !d.structural));
}

// The editor scanner is the seam for pure source consumers.
//
// Deferred notes and source numbering do not need a second parser. Their
// questions are projections of spans.ts's Scan, including its already-resolved
// closer map. This test keeps that boundary observable without timing a shared
// CI runner: a supplied Scan must be sufficient, and the ordinary path must
// lex one document once.

import { check } from "./harness.mjs";
import {
  clearScanCache,
  scan as scanSpans,
  scanMissCount,
} from "../.tmp-test/spans.mjs";
import { scan as scanDeferred } from "../.tmp-test/deferred.mjs";
import { sequence } from "../.tmp-test/numbering.mjs";

const doc = [
  `פתיחה#הערה_בשם("1") סוף.`,
  `#גוף_הערה("1")[עיין שם]`,
  `#סימן[א׳][ראשון]`,
  `#סימן[ב׳][שני]`,
].join("\n");

export async function run() {
  // ------------------------------------------------------- deferred notes
  {
    clearScanCache();
    const spans = scanSpans(doc);
    const expected = scanDeferred(doc, spans);
    clearScanCache();

    const got = scanDeferred(doc, spans);
    check("deferred scan reuses the supplied spans seam", scanMissCount(), 0);
    check("deferred refs are preserved", got.refs, expected.refs);
    check("deferred defs are preserved", got.defs, expected.defs);
    check("deferred region is preserved", got.region, expected.region);
  }

  // ----------------------------------------------------------- numbering
  {
    clearScanCache();
    const spans = scanSpans(doc);
    const expected = sequence(doc, spans);
    clearScanCache();

    const got = sequence(doc, spans);
    check("numbering reuses the supplied spans seam", scanMissCount(), 0);
    check("numbering members are preserved", got, expected);
  }

  // The default path is still bounded at one whole-document lex. This is a
  // boundary assertion, not a wall-clock promise.
  clearScanCache();
  scanDeferred(doc);
  check("deferred scan lexes the document once", scanMissCount(), 1);
  clearScanCache();
  sequence(doc);
  check("numbering lexes the document once", scanMissCount(), 1);
}

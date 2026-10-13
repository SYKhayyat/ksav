// The editor scanner is the seam for pure source consumers.
//
// Deferred notes and source numbering do not need a second parser. Their
// questions are projections of spans.ts's Scan, including its already-resolved
// closer map. This test keeps that boundary observable without timing a shared
// CI runner: a supplied Scan must be sufficient, and the ordinary path must
// lex one document once.

import { check, ok } from "./harness.mjs";
import {
  clearScanCache,
  resetScanInstrumentation,
  scan as scanSpans,
  scanMissCount,
} from "../.tmp-test/spans.mjs";
import { deferAllInlineNotes, scan as scanDeferred } from "../.tmp-test/deferred.mjs";
import { sequence } from "../.tmp-test/numbering.mjs";
import { isolateSpans } from "../.tmp-test/bidi.mjs";

const doc = [
  `פתיחה#הערה_בשם("1") סוף.`,
  `#גופי_הערות[`,
  `#גוף_הערה("1")[עיין שם]`,
  `]`,
  `#סימן[א׳][ראשון]`,
  `#סימן[ב׳][שני]`,
].join("\n");

const marker = `#הערה_בשם("1")`;
const markerFrom = doc.indexOf(marker);
const definition = `#גוף_הערה("1")[עיין שם]`;
const definitionFrom = doc.indexOf(definition);
const definitionNameFrom = definitionFrom + `#גוף_הערה(`.length;
const definitionBodyFrom = definitionFrom + definition.indexOf("עיין שם");
const regionFrom = doc.indexOf("#גופי_הערות");
const regionClose = doc.indexOf("\n]", definitionFrom) + 1;

// These values describe the fixture, rather than calling the implementation to
// manufacture an oracle for itself.
const expectedDeferred = {
  refs: [{
    name: "1",
    from: markerFrom,
    to: markerFrom + marker.length,
    nameFrom: markerFrom + marker.indexOf(`"1"`),
    nameTo: markerFrom + marker.indexOf(`"1"`) + 3,
    kind: null,
    rest: "",
    lang: "he",
    hash: true,
  }],
  defs: [{
    name: "1",
    from: definitionFrom,
    to: definitionFrom + definition.length,
    nameFrom: definitionNameFrom,
    nameTo: definitionNameFrom + 3,
    bodyFrom: definitionBodyFrom,
    bodyTo: definitionBodyFrom + "עיין שם".length,
    lang: "he",
    hash: true,
  }],
  region: {
    from: regionFrom,
    to: regionClose + 1,
    innerFrom: doc.indexOf("[", regionFrom) + 1,
    innerTo: regionClose,
  },
};

const projectDeferred = (s) => ({
  refs: s.refs,
  defs: s.defs,
  region: s.region,
});

const expectedNumbering = [
  {
    name: "סימן",
    from: doc.indexOf("א׳"),
    to: doc.indexOf("א׳") + "א׳".length,
    written: "א׳",
    wanted: "א׳",
  },
  {
    name: "סימן",
    from: doc.indexOf("ב׳"),
    to: doc.indexOf("ב׳") + "ב׳".length,
    written: "ב׳",
    wanted: "ב׳",
  },
];

export async function run() {
  // ------------------------------------------------------- deferred notes
  {
    clearScanCache();
    const spans = scanSpans(doc);
    resetScanInstrumentation();

    const got = scanDeferred(doc, spans);
    check("deferred scan reuses the supplied spans seam", scanMissCount(), 0);
    check("deferred result matches the independent expected scan", projectDeferred(got), expectedDeferred);
  }

  // ----------------------------------------------------------- numbering
  {
    clearScanCache();
    const spans = scanSpans(doc);
    resetScanInstrumentation();

    const got = sequence(doc, spans);
    check("numbering reuses the supplied spans seam", scanMissCount(), 0);
    check("numbering result matches the independent expected sequence", got, expectedNumbering);
  }

  // The default path is still bounded at one whole-document lex. This is a
  // boundary assertion, not a wall-clock promise.
  clearScanCache();
  scanDeferred(doc);
  check("deferred scan lexes the document once", scanMissCount(), 1);
  clearScanCache();
  sequence(doc);
  check("numbering lexes the document once", scanMissCount(), 1);

  // Bulk filing must not add a whole-document lex for every body it appends.
  clearScanCache();
  deferAllInlineNotes(`א#הערה[ראשונה] ב.`);
  const oneBodyMisses = scanMissCount();
  clearScanCache();
  deferAllInlineNotes(`א#הערה[ראשונה] ב#הערה[שנייה] ג.`);
  check("bulk filing scan count does not grow per body", scanMissCount(), oneBodyMisses);

  // A scan carries offsets, so a scan for another document must not be accepted
  // merely because its shape happens to look usable.
  {
    const wrong = scanSpans(`${doc}\nעוד`);
    let deferredRejected = false;
    try {
      scanDeferred(doc, wrong);
    } catch (error) {
      deferredRejected = /different text/.test(String(error));
    }
    ok("deferred rejects a scan for different text", deferredRejected);

    let numberingRejected = false;
    try {
      sequence(doc, wrong);
    } catch (error) {
      numberingRejected = /different text/.test(String(error));
    }
    ok("numbering rejects a scan for different text", numberingRejected);

    let bidiRejected = false;
    try {
      isolateSpans(doc, wrong);
    } catch (error) {
      bidiRejected = /different text/.test(String(error));
    }
    ok("bidi rejects a scan for different text", bidiRejected);
  }
}

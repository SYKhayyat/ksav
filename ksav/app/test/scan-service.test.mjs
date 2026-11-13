import { check, ok, notOk } from "./harness.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  clearScanCache,
  delimiters,
  hydrateScan,
  lexPassCount,
  scan,
  scanWire,
} from "../.tmp-test/spans.mjs";
import { scanForBackend } from "../.tmp-test/scanmemo.mjs";

export async function run() {
  clearScanCache();
  const balanced = "#f(\"😀[\")[גוף]";
  scan(balanced);
  check("a scan of a balanced document is one lexical pass", lexPassCount(), 1);
  delimiters(balanced);
  check("balanced scan and delimiters share one lexical pass", lexPassCount(), 1);

  clearScanCache();
  const malformed = "#f([😀)";
  scan(malformed);
  delimiters(malformed);
  check("malformed recovery is a second pass only when needed", lexPassCount(), 2);
  const local = delimiters(malformed);
  const wire = scanWire(malformed);
  check("wire recovery matches local recovery", wire.delims, local.delims);
  check("wire recovery comments match local recovery", wire.comments, local.comments);

  // ---------------------------------------------- #182: delimiters on demand
  //
  // The list used to be built eagerly: 30,780 `Delimiter` objects per keystroke
  // at 1,000 pages, for an array only the pause paths read. It is rebuilt from
  // recorded numbers now, and these are the claims that keeps honest — that the
  // rebuild happens on the first read and not before, that it is the same list
  // `delimiters()` gives, that a stray closer survives it, and that a `#let`
  // frame is not mistaken for a bracket (it is a frame with no delimiter in it,
  // and an early version of this rebuild emitted `ch: undefined` for it).
  clearScanCache();
  const bracketDoc = "#טבלה(עמודות: (1fr, 2fr),\n  תא[א], תא[ב],\n)";
  const scanned = scan(bracketDoc);
  check(
    "#182: a scan does not build its delimiter list until it is read",
    typeof Object.getOwnPropertyDescriptor(scanned, "delims").get,
    "function",
  );
  const listed = scanned.delims;
  ok("#182: …and then it has one", listed.length > 0, `${listed.length} delimiters`);
  check("#182: …the same array delimiters() answers with", listed, delimiters(bracketDoc).delims);
  check(
    "#182: …and reading it again does not rebuild it",
    Object.getOwnPropertyDescriptor(scanned, "delims").value,
    listed,
  );
  check(
    "#182: …in document order",
    listed.every((d, i) => i === 0 || listed[i - 1].pos < d.pos),
    true,
  );

  clearScanCache();
  const stray = '#f(] "רש\"י ) עוד';
  const strayList = scan(stray).delims;
  check(
    "#182: a stray closer is in the rebuilt list",
    JSON.stringify(strayList),
    JSON.stringify(delimiters(stray).delims),
  );
  ok("#182: …and it is not structural", strayList.some((d) => !d.opener), `${strayList.length} delimiters`);

  clearScanCache();
  const keyword = "#let x = 1\n#הדגשה[א]";
  const keywordDelims = scan(keyword).delims;
  notOk(
    "#182: a `#let` frame is not a delimiter",
    keywordDelims.some((d) => !"[({])}".includes(d.ch)),
  );
  check(
    "#182: …so the list is the one bracket pair and nothing else",
    keywordDelims.map((d) => d.ch).join(""),
    "[]",
  );

  const altered = scanWire("#f[x]");
  altered.closes = [];
  altered.contentGroups = [];
  const supplied = hydrateScan("#f[x]", altered);
  check("hydration assembles from supplied facts", supplied.nodes[0].bodies.length, 0);
  let rejected = false;
  try {
    hydrateScan("#f[x]", { ...scanWire("#f[x]"), delims: [{ ...scanWire("#f[x]").delims[0], pos: 99 }] });
  } catch {
    rejected = true;
  }
  ok("malformed supplied facts are rejected", rejected);

  let calls = 0;
  const backend = {
    scan: async () => {
      calls++;
      throw new Error("service unavailable");
    },
  };
  const first = await scanForBackend(backend, "#f[x]");
  const second = await scanForBackend(backend, "#f[x]");
  ok("service failure falls back to local scan", first.nodes.length > 0 && second.nodes.length > 0);
  check("failed service result is bounded and reused", calls, 1);

  const missing = await scanForBackend({}, "#f[x]");
  ok("a legacy backend without scan falls back synchronously", missing.nodes.length > 0);
  const malformedBackend = { scan: async () => ({ version: 1, text_length: 5, delims: [] }) };
  const malformedResult = await scanForBackend(malformedBackend, "#f[x]");
  ok("a malformed service response falls back to local facts", malformedResult.nodes.length > 0);

  let resolve;
  let requests = 0;
  const sharedBackend = {
    scan: () => {
      requests++;
      return new Promise((r) => { resolve = r; });
    },
  };
  const controller = new AbortController();
  const cancelled = scanForBackend(sharedBackend, "#f[x]", controller.signal).catch(() => null);
  const survivor = scanForBackend(sharedBackend, "#f[x]");
  await Promise.resolve();
  controller.abort();
  resolve({ ...scanWire("#f[x]"), scan: scan("#f[x]") });
  check("shared service scan is requested once", requests, 1);
  ok("one cancelled consumer does not poison another", (await survivor).nodes.length > 0);
  check("cancelled consumer is isolated", await cancelled, null);

  const corpus = JSON.parse(await readFile(path.resolve("..", "engine", "tests", "fixtures", "scan-oracle.json"), "utf8"));
  let checked = 0;
  for (const row of corpus.docs) {
    const hydrated = hydrateScan(row.text, row.service);
    const local = scan(row.text);
    check(`hydrated node parity: ${row.id}`, hydrated.nodes.map((n) => [n.from, n.to, n.name]), local.nodes.map((n) => [n.from, n.to, n.name]));
    checked++;
  }
  ok("the complete scan corpus was hydrated", checked > 0);
}

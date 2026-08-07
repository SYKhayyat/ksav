// Emit the source produced by every structural edit — list and table — so the
// engine can compile it.
//
// The list operations shipped with 65 passing unit tests, one of which checked
// that the brackets balanced and that no `#` sat in code mode. Outdent passed
// all of them and produced `],,` followed by an item with no separator: a
// document that will not compile. Balanced brackets are not legal Typst, and a
// pure-function test cannot tell the difference. Only the compiler can.
//
//   node tools/emit-structure-fixtures.mjs          # rewrite the fixture
//   node tools/emit-structure-fixtures.mjs --check  # fail if it is stale

// Through esbuild's JS API, not by running `node node_modules/esbuild/bin/esbuild`:
// that path is a JavaScript shim on Windows and the **native executable** on Linux,
// where npm's platform package overwrites it — so handing it to `node` threw
// `SyntaxError: Invalid or unexpected token` and took the editor job in CI down on
// every push, while working perfectly on the machine that wrote it. `card.mjs` and
// `test/run.mjs` had always imported `build` from "esbuild"; this is the same thing.
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runAsScript } from "./generated.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..");
const OUT = join(APP, "..", "engine", "tests", "fixtures", "structure-edits.json");

async function load(name) {
  const dir = mkdtempSync(join(tmpdir(), "ksav-fx-"));
  try {
    const out = join(dir, `${name}.mjs`);
    await build({
      entryPoints: [join(APP, "src", `${name}.ts`)],
      outfile: out,
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
    });
    return await import(pathToFileURL(out).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HE = `#רשימה(
  פריט[ראשון],
  פריט[שני],
  פריט[שלישי],
)

אחרי הרשימה.
`;

const EN = `#bullets(
  item[one],
  item[two],
  item[three],
)

After the list.
`;

const INLINE = `#ממוספרת(פריט[א], פריט[ב],)\n`;

const TABLE = `#טבלה(עמודות: 2, פסים: true,
  כותרת_תא[א], כותרת_תא[ב],
  תא[ג], תא[ד],
)
`;

export async function buildFixture() {
  const L = await load("lists");
  const T = await load("table");
  const H = await load("headings");
  const cases = [];
  // Each case carries the words its document was built from. The engine test
  // used to infer them from the case name, which meant every new family of
  // fixtures silently checked the wrong words until someone noticed the
  // mismatch — three times. The generator knows the answer; it should say it.
  const add = (name, source, words) => cases.push({ name, source, words });

  for (const [tag, doc, at] of [
    ["he", HE, "שני"],
    ["en", EN, "two"],
    ["inline", INLINE, "ב"],
  ]) {
    const pos = doc.indexOf(at);
    const list = L.listAt(doc, pos);
    const W3 = tag === "en" ? ["one", "two", "three"] : tag === "inline" ? ["א", "ב"] : ["ראשון", "שני", "שלישי"];
    const addL = (n, src) => add(n, src, W3);
    addL(`${tag}/add`, L.addItem(doc, list, pos).text);
    addL(`${tag}/split`, L.splitItem(doc, list, pos + 1).text);
    addL(`${tag}/break`, L.breakInItem(doc, list, pos + at.length).text);
    addL(`${tag}/delete`, L.deleteItem(doc, list, pos).text);
    addL(`${tag}/moveUp`, L.moveItem(doc, list, pos, -1).text);
    for (const kind of ["bullets", "numbered", "hebrew"]) {
      addL(`${tag}/kind-${kind}`, L.setKind(doc, list, kind).text);
    }

    // Indent, indent again, then outdent back — the sequence that produced
    // uncompilable source, and the one a writer walks through in five seconds.
    const one = L.indentItem(doc, list, pos);
    if (one) {
      addL(`${tag}/indent`, one.text);
      const third = one.text.indexOf(tag === "en" ? "three" : tag === "inline" ? "ב" : "שלישי");
      if (third > 0) {
        const l2 = L.listAt(one.text, third);
        const two = l2 && L.indentItem(one.text, l2, third);
        if (two) addL(`${tag}/indent-twice`, two.text);
      }
      const back = one.text.indexOf(at);
      const out = L.outdentItem(one.text, L.listAt(one.text, back), back);
      if (out) addL(`${tag}/outdent`, out.text);
      // Add an item while nested: the nested list's own comma rules apply.
      const nested = L.listAt(one.text, back);
      addL(`${tag}/add-nested`, L.addItem(one.text, nested, back).text);
    }

    // ------------------------------------------------ every caret, not one
    //
    // Everything above drives each operation at a single position, always
    // inside an item. That is the hole `list.breakInItem` lived in: it spliced
    // a ` \` at the caret without asking whether the caret was in an item body,
    // so between two items — or on the `#רשימה(` line, or on the closing `)` —
    // it wrote content markup into the list's *argument list*. The compiler
    // answers "Invalid syntax here", the fixture never asked at those
    // positions, and the app-side sweep that does visit every position only
    // checks that `enabled` and `run` agree, never that the result compiles.
    // Balanced brackets are not legal Typst; only the compiler knows.
    //
    // So: every position in the list, every operation, and whatever comes back
    // gets compiled. Deduplicated by resulting source, because most positions
    // inside one item's body produce the same document and there is no value in
    // compiling it eighty times.
    {
      const seen = new Set();
      const ops = [
        ["add", (d, l, p) => L.addItem(d, l, p)],
        ["split", (d, l, p) => L.splitItem(d, l, p)],
        ["break", (d, l, p) => L.breakInItem(d, l, p)],
        ["delete", (d, l, p) => L.deleteItem(d, l, p)],
        ["indent", (d, l, p) => L.indentItem(d, l, p)],
        ["outdent", (d, l, p) => L.outdentItem(d, l, p)],
        ["moveUp", (d, l, p) => L.moveItem(d, l, p, -1)],
        ["moveDown", (d, l, p) => L.moveItem(d, l, p, 1)],
      ];
      const span = L.listAt(doc, pos);
      for (let p = span.from; p <= span.to; p++) {
        const here = L.listAt(doc, p);
        if (!here) continue;
        for (const [op, run] of ops) {
          let edit = null;
          try {
            edit = run(doc, here, p);
          } catch {
            // A throw is itself a finding, but it is the app suite's to report;
            // this generator's job is to hand the compiler what a writer would
            // actually end up with.
            continue;
          }
          if (!edit || seen.has(edit.text)) continue;
          seen.add(edit.text);
          addL(`${tag}/sweep-${op}@${p - span.from}`, edit.text);
        }
      }
    }
  }

  // Tables: the same operations the ribbon offers.
  {
    const t = T.tableAt(TABLE, TABLE.indexOf("ג"));
    const idx = T.cellIndexAt(t, TABLE.indexOf("ג"));
    const row = T.rowOf(t, idx);
    const col = T.colOf(t, idx);
    const addT = (n, src) => add(n, src, ["א", "ב", "ג", "ד"]);
    addT("table/insertRowBelow", T.insertRow(TABLE, t, row));
    addT("table/insertRowAbove", T.insertRow(TABLE, t, row - 1));
    addT("table/deleteRow", T.deleteRow(TABLE, t, row));
    addT("table/insertColAfter", T.insertColumn(TABLE, t, col));
    addT("table/insertColBefore", T.insertColumn(TABLE, t, col - 1));
    addT("table/deleteCol", T.deleteColumn(TABLE, t, col));
    addT("table/toggleHeader", T.toggleHeaderRow(TABLE, t, row));
    addT("table/moveRowUp", T.moveRow(TABLE, t, row, -1));
    addT("table/moveRowDown", T.moveRow(TABLE, t, row, 1));
    addT("table/moveColStart", T.moveColumn(TABLE, t, col, -1));
    addT("table/moveColEnd", T.moveColumn(TABLE, t, col, 1));
  }

  // A merged table: moving rows and columns must carry spans intact, and the
  // one case that has to refuse rather than guess is a column swap that would
  // cut a merge in half.
  {
    const M = `#טבלה(עמודות: 3,
  מיזוג(2)[א], תא[ב],
  תא[ג], תא[ד], תא[ה],
)
`;
    const t = T.tableAt(M, M.indexOf("ג"));
    const idx = T.cellIndexAt(t, M.indexOf("ג"));
    const row = T.rowOf(t, idx);
    const addM = (n, src) => add(n, src, ["א", "ב", "ג", "ד", "ה"]);
    addM("merged/moveRowUp", T.moveRow(M, t, row, -1));
    addM("merged/insertRow", T.insertRow(M, t, row));
    addM("merged/insertCol", T.insertColumn(M, t, 1));
    addM("merged/deleteCol", T.deleteColumn(M, t, 2));
    addM("merged/split", T.splitCell(M, t, 0, 0));
    addM("merged/mergeRight", T.mergeRight(M, t, 1, 0));
  }

  // A table that declares column widths. Every structural edit has to keep the
  // track list matching the column count — the parser used to read only the
  // integer form, so a three-column table with widths was rewritten as a
  // two-column one with its cells reflowed into the wrong rows and the widths
  // silently discarded. It still compiled, which is why nothing caught it.
  {
    const W = `#טבלה(עמודות: (2fr, 1fr, 1fr), פסים: true,
  תא[א], תא[ב], תא[ג],
  תא[ד], תא[ה], תא[ו],
)
`;
    const t = T.tableAt(W, W.indexOf("ה"));
    const idx = T.cellIndexAt(t, W.indexOf("ה"));
    const row = T.rowOf(t, idx);
    const col = T.colOf(t, idx);
    const addW = (n, src) => add(n, src, ["א", "ב", "ג", "ד", "ה", "ו"]);
    addW("widths/insertRow", T.insertRow(W, t, row));
    addW("widths/insertCol", T.insertColumn(W, t, col));
    addW("widths/deleteCol", T.deleteColumn(W, t, col));
    addW("widths/moveCol", T.moveColumn(W, t, col, 1));
    addW("widths/wider", T.setColumnWidth(W, t, col, "3fr"));
    addW("widths/equal", T.equalColumns(W, t));
    addW("widths/auto", T.autoColumns(W, t));
    addW("widths/merge", T.mergeRight(W, t, row, 0));
    // And from a table with no declared widths: sizing one column has to write
    // a full track list, since Typst's `columns:` is all-or-nothing.
    const plain = T.tableAt(TABLE, TABLE.indexOf("ג"));
    add("widths/fromPlain", T.setColumnWidth(TABLE, plain, 0, "2fr"), ["א", "ב", "ג", "ד"]);
    add("widths/equalFromPlain", T.equalColumns(TABLE, plain), ["א", "ב", "ג", "ד"]);
  }

  // Headings: the same discipline. A section move is a cut and a paste across an
  // arbitrary span, which is precisely the operation that loses a paragraph.
  {
    const HD = `#כותרת1[ראשון]

גוף א.

#כותרת2[תת]

גוף ב.

#כותרת1[שני]

גוף ג.
`;
    const words = ["ראשון", "תת", "שני",
                   "גוף א.", "גוף ב.", "גוף ג."];
    const addH = (n, src) => add(n, src, words);
    const first = H.headings(HD)[0];
    const sub = H.headings(HD)[1];
    addH("heading/demote", H.demote(HD, first).text);
    addH("heading/promote", H.promote(HD, sub).text);
    addH("heading/moveDown", H.moveSection(HD, first, 1).text);
    addH("heading/contents", H.addContents(HD).text);
    // Every level from 1 to 9, since past 6 the command form changes entirely.
    for (let lvl = 1; lvl <= H.MAX_LEVEL; lvl++) {
      const r = H.setLevel(HD, sub, lvl);
      if (r) addH(`heading/level${lvl}`, r.text);
    }
    // Turning a body line into a heading, at every level.
    for (let lvl = 1; lvl <= H.MAX_LEVEL; lvl++) {
      const r = H.makeHeading(HD, HD.indexOf("גוף ב."), lvl);
      if (r) addH(`heading/make${lvl}`, r.text);
    }
    // Deleting a section is allowed to lose text; only its neighbour must survive.
    add("heading/delete", H.deleteSection(HD, first).text, ["שני"]);
  }

  return JSON.stringify(
    { note: "generated by app/tools/emit-structure-fixtures.mjs", cases },
    null,
    2,
  );
}

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, await buildFixture(), "structure-edits.json"]];

runAsScript(import.meta.url, OUTPUTS, "structure fixtures", "node tools/emit-structure-fixtures.mjs");

// Table structure editing.
//
// The invariant that makes this module worth having: a structural edit leaves
// the cell count consistent with the declared column count. Getting that wrong
// does not fail loudly — it silently reflows the whole table, which is exactly
// the hand-editing failure the module exists to prevent.

import { check, ok } from "./harness.mjs";
import * as tables from "../.tmp-test/table.mjs";

const T = "#טבלה(עמודות: 2,\n  תא[א], תא[ב],\n  תא[ג], תא[ד],\n)";

/** Re-read a table from the text it now is, so assertions never trust stale offsets. */
function read(doc) {
  const t = tables.tableAt(doc, doc.indexOf("תא"));
  return t;
}

/** Cells and columns agree — the property a hand edit gets wrong. */
function consistent(doc) {
  const t = read(doc);
  if (!t) return false;
  const used = t.cells.reduce((n, c) => n + c.span, 0);
  return used % t.cols === 0;
}

export async function run() {
  // ------------------------------------------------------------ reading
  {
    const t = read(T);
    ok("a table is found around the cursor", !!t);
    check("its column count is read", t.cols, 2);
    check("its cells are read", t.cells.map((c) => c.body), ["א", "ב", "ג", "ד"]);
    check("the range covers the whole call", T.slice(t.from, t.to), T);
    check("rowCount is derived from the cells", tables.rowCount(t), 2);
  }

  {
    check("no table means no table", tables.tableAt("סתם טקסט", 3), null);
    check("outside the call is outside the table", tables.tableAt(T + "\nאחרי", T.length + 3), null);
  }

  {
    // A document with two tables must resolve the one the cursor is in.
    const two = T + "\n\n#טבלה(עמודות: 3,\n  תא[1], תא[2], תא[3],\n)";
    check("the second table is the one at the second cursor", tables.tableAt(two, two.lastIndexOf("תא")).cols, 3);
    check("…and the first at the first", tables.tableAt(two, two.indexOf("תא")).cols, 2);
  }

  {
    const t = read(T);
    check("a cell index is found from a position", tables.cellIndexAt(t, T.indexOf("ג")), 2);
    check("…and maps to a row", tables.rowOf(t, 2), 1);
    check("…and a column", tables.colOf(t, 2), 0);
    check("between cells is no cell", tables.cellIndexAt(t, t.from + 1), null);
  }

  {
    // Gershayim are part of a Hebrew word, not a string delimiter. A table full
    // of citations is the normal case, not an edge case.
    const doc = '#טבלה(עמודות: 2,\n  תא[רש"י], תא[שו"ע],\n)';
    check("gershayim do not break cell parsing", read(doc).cells.map((c) => c.body), ['רש"י', 'שו"ע']);
  }

  // ------------------------------------------------------------ rows
  {
    const out = tables.insertRow(T, read(T), 0);
    check("a new row adds one cell per column", read(out).cells.length, 6);
    check("…and does not change the column count", read(out).cols, 2);
    ok("…and stays consistent", consistent(out));
    check("…and keeps the original cells", read(out).cells.map((c) => c.body).filter(Boolean), ["א", "ב", "ג", "ד"]);
  }

  {
    const out = tables.deleteRow(T, read(T), 0);
    check("deleting a row removes its cells", read(out).cells.map((c) => c.body), ["ג", "ד"]);
    ok("…and stays consistent", consistent(out));
  }

  // ------------------------------------------------------------ columns
  {
    const out = tables.insertColumn(T, read(T), 0);
    check("a new column raises the declared count", read(out).cols, 3);
    check("…and adds one cell per row", read(out).cells.length, 6);
    ok("…and stays consistent", consistent(out));
  }

  {
    const out = tables.deleteColumn(T, read(T), 0);
    check("deleting a column lowers the declared count", read(out).cols, 1);
    check("…and removes that column's cells", read(out).cells.map((c) => c.body), ["ב", "ד"]);
    ok("…and stays consistent", consistent(out));
  }

  // ------------------------------------------------------------ header row
  {
    const on = tables.toggleHeaderRow(T, read(T), 0);
    check("the first row becomes header cells", read(on).cells.slice(0, 2).map((c) => c.header), [true, true]);
    check("…and the rest do not", read(on).cells.slice(2).map((c) => c.header), [false, false]);
    const off = tables.toggleHeaderRow(on, read(on), 0);
    check("toggling again turns them back", read(off).cells.map((c) => c.header), [false, false, false, false]);
    ok("…and the text survives the round trip", read(off).cells.map((c) => c.body).join() === "א,ב,ג,ד");
  }

  // ------------------------------------------------------------ the invariant
  {
    // Every operation, applied in sequence, keeps cells and columns agreeing.
    let doc = T;
    const ops = [
      ["insertRow", (d, t) => tables.insertRow(d, t, 0)],
      ["insertColumn", (d, t) => tables.insertColumn(d, t, 1)],
      ["toggleHeaderRow", (d, t) => tables.toggleHeaderRow(d, t, 0)],
      ["deleteRow", (d, t) => tables.deleteRow(d, t, 1)],
      ["deleteColumn", (d, t) => tables.deleteColumn(d, t, 0)],
      ["insertRow again", (d, t) => tables.insertRow(d, t, 0)],
    ];
    for (const [name, op] of ops) {
      doc = op(doc, read(doc));
      ok(`after ${name}: cells still agree with columns`, consistent(doc));
    }
  }

  {
    // The floor: a table cannot be edited down to nothing and left broken.
    let doc = "#טבלה(עמודות: 1,\n  תא[רק אחד],\n)";
    doc = tables.deleteColumn(doc, read(doc), 0);
    ok("deleting the last column leaves something parseable or nothing at all",
      doc === "" || tables.tableAt(doc, 0) === null || consistent(doc));
  }
}

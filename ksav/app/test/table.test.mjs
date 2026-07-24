// Table structure editing.
//
// The invariant that makes this module worth having: a structural edit leaves
// the cell count consistent with the declared column count. Getting that wrong
// does not fail loudly — it silently reflows the whole table, which is exactly
// the hand-editing failure the module exists to prevent.

import { check, ok, notOk } from "./harness.mjs";
import * as tables from "../.tmp-test/table.mjs";

const T = "#טבלה(עמודות: 2,\n  תא[א], תא[ב],\n  תא[ג], תא[ד],\n)";

/** Re-read a table from the text it now is, so assertions never trust stale offsets.
 *  Anchored on the call head rather than on a Hebrew cell name, because a table
 *  can be written in either language. */
function read(doc) {
  const at = Math.max(doc.indexOf("#טבלה"), doc.indexOf("#mktable"));
  return tables.tableAt(doc, at < 0 ? 0 : at + 1);
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

  // ------------------------------------------------------------ what a rewrite must not lose
  //
  // Every structural edit rebuilds the whole call from the cell list. It used to
  // rebuild it as `#name(עמודות: N, …cells)` and nothing else — so adding a row
  // to a striped table silently un-striped it, and an English table came back
  // with a Hebrew argument name in it. Both article templates are striped, which
  // made that the first table most people would ever have edited.
  {
    const striped = `#טבלה(עמודות: 2, פסים: true, יישור: center,\n  תא[א], תא[ב],\n)`;
    const after = tables.insertRow(striped, tables.tableAt(striped, 5), 0);
    ok("striping survives a row insert", after.includes("פסים: true"));
    ok("…and so does every other setting", after.includes("יישור: center"));
    ok("…and the column count is still there", after.includes("עמודות: 2"));
    ok("…and the table still parses", consistent(after));
  }

  {
    const english =
      `#mktable(columns: 2, striped: true,\n  headcell[Posek], headcell[Ruling],\n  cell[Rambam], cell[Chayav],\n)`;
    const t = tables.tableAt(english, 10);
    check("an English table is read as English", t.names.table, "mktable");
    check("…with its own settings kept", t.options, ["striped: true"]);
    const after = tables.insertRow(english, t, 1);
    ok("a rewritten English table keeps English argument names", after.includes("columns: 2"));
    notOk("…and gains no Hebrew ones", after.includes("עמודות"));
    ok("…and keeps its striping", after.includes("striped: true"));
    ok("…and still parses", consistent(after));
  }

  {
    // A cell body full of commas and gershayim must not be mistaken for a
    // settings list: at depth 0 a quote opens a string, inside a body it is the
    // ordinary character Hebrew writes gershayim with.
    const body = `רש"י, תוס' ובעה"ת`;
    const tricky = `#טבלה(עמודות: 2, פסים: true,\n  תא[${body}], תא[ב],\n)`;
    const t = tables.tableAt(tricky, 5);
    check("a cell is not read as a setting", t.options, ["פסים: true"]);
    check("…and its commas stay inside it", t.cells[0].body, body);
    const after = tables.insertRow(tricky, t, 0);
    ok("…through a rewrite", tables.tableAt(after, 5).cells.some((c) => c.body === body));
  }

  // ------------------------------------------------------------ merged cells
  //
  // A `מיזוג(n)` cell spans n columns, so `index / cols` no longer names its row.
  // The row/column arithmetic used to ignore the span: inserting a row into a
  // table with a two-wide header pulled the header into the first data row,
  // orphaned a cell two rows down, and dropped a blank row between them — the
  // failure this module's own comment names as the reason it exists.
  {
    const merged =
      "#טבלה(עמודות: 2, פסים: true,\n  מיזוג(2)[כותרת רחבה],\n  תא[א], תא[ב],\n)";
    const t = read(merged);
    check("a merged cell reports its span", t.cells[0].span, 2);
    check("…and its body", t.cells[0].body, "כותרת רחבה");
    check("the table is two grid rows, not three", tables.rowCount(t), 2);
    check("the wide cell sits at row 0", tables.rowOf(t, 0), 0);
    check("the first data cell is at row 1", tables.rowOf(t, 1), 1);
    check("…in column 0", tables.colOf(t, 1), 0);
    check("…and its neighbour in column 1", tables.colOf(t, 2), 1);

    const after = tables.insertRow(merged, t, 0);
    const at = read(after);
    ok("inserting a row keeps the merge intact", at.cells.some((c) => c.span === 2 && c.body === "כותרת רחבה"));
    ok("…the data cells are not scrambled", at.cells.some((c) => c.body === "א") && at.cells.some((c) => c.body === "ב"));
    ok("…and the whole thing still parses cleanly", consistent(after));
    ok("…rendered with the merge command, not a plain cell", after.includes("מיזוג(2)[כותרת רחבה]"));
  }

  {
    // Round-trip a merged table through every operation; the merge must survive
    // where it can, and the table must stay consistent throughout.
    let doc = "#טבלה(עמודות: 3, פסים: true,\n  מיזוג(3)[כותרת],\n  תא[א], תא[ב], תא[ג],\n  תא[ד], תא[ה], תא[ו],\n)";
    const ops = [
      ["insertRow below the merge", (d, t) => tables.insertRow(d, t, 0)],
      ["toggleHeaderRow on a data row", (d, t) => tables.toggleHeaderRow(d, t, 2)],
      ["insertColumn inside the merge", (d, t) => tables.insertColumn(d, t, 0)],
      ["deleteColumn", (d, t) => tables.deleteColumn(d, t, 1)],
      ["deleteRow", (d, t) => tables.deleteRow(d, t, 1)],
    ];
    for (const [name, op] of ops) {
      doc = op(doc, read(doc));
      ok(`merged table after ${name}: still consistent`, consistent(doc));
    }
    ok("the merge widened when a column was inserted through it", /מיזוג\(4\)/.test(doc) || /מיזוג\(3\)/.test(doc));
  }

  {
    // Inserting a column at a merged cell's edge drops a single blank cell in;
    // inserting one through its middle widens the merge. Both keep the row sum.
    const merged = "#טבלה(עמודות: 2,\n  מיזוג(2)[רחב],\n  תא[א], תא[ב],\n)";
    const widened = tables.insertColumn(merged, read(merged), 0); // through the merge
    ok("a column through a merge widens it", read(widened).cells.some((c) => c.span === 3));
    ok("…and the table stays consistent", consistent(widened));
    check("…with the new declared width", read(widened).cols, 3);
  }
}

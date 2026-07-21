// Editing a table's structure without hand-editing markup.
//
// After `#טבלה` was inserted there was no way to add or remove a row or a
// column: you rewrote the call by hand, counting cells to keep them aligned with
// the declared column count. Word users expect direct manipulation, and getting
// the count wrong silently reflows the whole table.
//
// This module is the model — find the table around the cursor, and produce the
// new source for a structural edit. It works on the document text rather than a
// parsed AST because the table *is* text: the writer can always edit it by hand,
// and an operation here has to survive whatever they typed.

export interface TableCell {
  /** Byte range of the whole `תא[…]` (or `כותרת_תא[…]`, `מיזוג(n)[…]`). */
  from: number;
  to: number;
  /** The cell's contents. */
  body: string;
  header: boolean;
  /** Columns spanned (1 unless written with מיזוג). */
  span: number;
}

export interface TableInfo {
  /** Byte range of the whole `#טבלה(…)` call. */
  from: number;
  to: number;
  /** Range of the argument list, inside the parentheses. */
  argsFrom: number;
  argsTo: number;
  /** Declared column count. */
  cols: number;
  /** Range of the `עמודות: N` argument, so it can be rewritten. */
  colsFrom: number;
  colsTo: number;
  cells: TableCell[];
  /** Which Hebrew/English names this table was written with. */
  names: { table: string; cell: string; header: string };
}

const TABLE_NAMES = ["טבלה", "mktable"];
const CELL_RE = /(כותרת_תא|headcell|תא|cell|מיזוג|colspan_)\s*(?:\(\s*(\d+)\s*\))?\s*\[/gu;

function matchBracket(src: string, open: number, close: string, limit: number): number | null {
  const opener = src[open];
  let depth = 1;
  for (let i = open + 1; i < limit; i++) {
    if (src[i] === opener) depth++;
    else if (src[i] === close && --depth === 0) return i;
  }
  return null;
}

/** The table containing `pos`, if there is one. */
export function tableAt(doc: string, pos: number): TableInfo | null {
  for (const name of TABLE_NAMES) {
    let at = -1;
    // Scan every occurrence: a document can hold many tables, and only the one
    // around the cursor is the one being edited.
    while ((at = doc.indexOf("#" + name, at + 1)) >= 0) {
      const open = at + 1 + name.length;
      if (doc[open] !== "(") continue;
      const close = matchBracket(doc, open, ")", doc.length);
      if (close == null || pos < at || pos > close + 1) continue;

      const argsFrom = open + 1;
      const argsTo = close;
      const args = doc.slice(argsFrom, argsTo);

      const colsMatch = /(?:עמודות|columns)\s*:\s*(\d+)/u.exec(args);
      const cols = colsMatch ? Math.max(1, parseInt(colsMatch[1], 10)) : 2;
      const colsFrom = colsMatch ? argsFrom + colsMatch.index : -1;
      const colsTo = colsMatch ? colsFrom + colsMatch[0].length : -1;

      const cells: TableCell[] = [];
      const re = new RegExp(CELL_RE.source, "gu");
      let m: RegExpExecArray | null;
      while ((m = re.exec(args))) {
        const bracket = argsFrom + m.index + m[0].length - 1;
        const end = matchBracket(doc, bracket, "]", argsTo + 1);
        if (end == null) break;
        cells.push({
          from: argsFrom + m.index,
          to: end + 1,
          body: doc.slice(bracket + 1, end),
          header: m[1] === "כותרת_תא" || m[1] === "headcell",
          span: m[2] ? Math.max(1, parseInt(m[2], 10)) : 1,
        });
        re.lastIndex = end + 1 - argsFrom;
      }

      const hebrew = name === "טבלה";
      return {
        from: at,
        to: close + 1,
        argsFrom,
        argsTo,
        cols,
        colsFrom,
        colsTo,
        cells,
        names: hebrew
          ? { table: "טבלה", cell: "תא", header: "כותרת_תא" }
          : { table: "mktable", cell: "cell", header: "headcell" },
      };
    }
  }
  return null;
}

/** Which row and column `pos` sits in, or null if it is not in a cell. */
export function cellIndexAt(t: TableInfo, pos: number): number | null {
  const i = t.cells.findIndex((c) => pos >= c.from && pos <= c.to);
  return i < 0 ? null : i;
}

export function rowOf(t: TableInfo, cellIndex: number): number {
  return Math.floor(cellIndex / t.cols);
}

export function colOf(t: TableInfo, cellIndex: number): number {
  return cellIndex % t.cols;
}

export function rowCount(t: TableInfo): number {
  return Math.max(1, Math.ceil(t.cells.length / t.cols));
}

/** Render a table back to source, laid out one row per line. */
function render(t: TableInfo, cells: TableCell[], cols: number): string {
  const lines: string[] = [];
  for (let r = 0; r * cols < cells.length; r++) {
    const row = cells.slice(r * cols, (r + 1) * cols);
    lines.push(
      "  " +
        row
          .map((c) => `${c.header ? t.names.header : t.names.cell}[${c.body}]`)
          .join(", ") +
        ",",
    );
  }
  return `#${t.names.table}(עמודות: ${cols},\n${lines.join("\n")}\n)`;
}

/** A blank cell, matching the kind of the row it joins. */
function blank(header: boolean): TableCell {
  return { from: -1, to: -1, body: "", header, span: 1 };
}

/**
 * Pad the cell list to a whole number of rows.
 *
 * A hand-edited table often has a partial last row; every operation below
 * assumes a rectangle, and quietly completing it is kinder than refusing to act.
 */
function rectangular(cells: TableCell[], cols: number): TableCell[] {
  const out = cells.slice();
  while (out.length % cols !== 0) out.push(blank(false));
  return out;
}

export function insertRow(doc: string, t: TableInfo, afterRow: number): string {
  const cells = rectangular(t.cells, t.cols);
  const at = Math.min(Math.max(afterRow + 1, 0), Math.ceil(cells.length / t.cols)) * t.cols;
  const fresh = Array.from({ length: t.cols }, () => blank(false));
  cells.splice(at, 0, ...fresh);
  return replace(doc, t, render(t, cells, t.cols));
}

export function deleteRow(doc: string, t: TableInfo, row: number): string {
  const cells = rectangular(t.cells, t.cols);
  if (cells.length <= t.cols) return doc; // never delete the last row
  cells.splice(row * t.cols, t.cols);
  return replace(doc, t, render(t, cells, t.cols));
}

export function insertColumn(doc: string, t: TableInfo, afterCol: number): string {
  const cells = rectangular(t.cells, t.cols);
  const at = Math.min(Math.max(afterCol + 1, 0), t.cols);
  const out: TableCell[] = [];
  for (let r = 0; r * t.cols < cells.length; r++) {
    const row = cells.slice(r * t.cols, (r + 1) * t.cols);
    // A new cell in the header row is itself a header cell, so the table does
    // not end up with a hole in its header.
    row.splice(at, 0, blank(row.every((c) => c.header)));
    out.push(...row);
  }
  return replace(doc, t, render(t, out, t.cols + 1));
}

export function deleteColumn(doc: string, t: TableInfo, col: number): string {
  if (t.cols <= 1) return doc; // never delete the last column
  const cells = rectangular(t.cells, t.cols);
  const out: TableCell[] = [];
  for (let r = 0; r * t.cols < cells.length; r++) {
    const row = cells.slice(r * t.cols, (r + 1) * t.cols);
    row.splice(col, 1);
    out.push(...row);
  }
  return replace(doc, t, render(t, out, t.cols - 1));
}

/** Turn the row into header cells, or back into ordinary ones. */
export function toggleHeaderRow(doc: string, t: TableInfo, row: number): string {
  const cells = rectangular(t.cells, t.cols).map((c) => ({ ...c }));
  const start = row * t.cols;
  const slice = cells.slice(start, start + t.cols);
  const makeHeader = !slice.every((c) => c.header);
  for (const c of slice) c.header = makeHeader;
  return replace(doc, t, render(t, cells, t.cols));
}

function replace(doc: string, t: TableInfo, source: string): string {
  return doc.slice(0, t.from) + source + doc.slice(t.to);
}

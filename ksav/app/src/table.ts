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
  cells: TableCell[];
  /**
   * Every other named argument, verbatim and in order — `פסים: true`,
   * `יישור: center`.
   *
   * Rebuilding the call used to write `#טבלה(עמודות: N, …cells)` and nothing
   * else, so adding a row to a striped table silently un-striped it. Both
   * article templates are striped, which made that the first table most people
   * would have edited.
   */
  options: string[];
  /** Which Hebrew/English names this table was written with. */
  names: { table: string; cell: string; header: string; merge: string; cols: string };
}

const TABLE_NAMES = ["טבלה", "mktable"];
const CELL_RE = /(כותרת_תא|headcell|תא|cell|מיזוג|colspan_)\s*(?:\(\s*(\d+)\s*\))?\s*\[/gu;
/** An argument that is a cell rather than a setting. */
const CELL_HEAD = /^(?:כותרת_תא|headcell|תא|cell|מיזוג|colspan_)\s*[([]/u;
const COLS_ARG = /^(?:עמודות|columns)\s*:/u;

/**
 * Split an argument list at its top-level commas.
 *
 * Depth-aware, because an argument's own value can hold commas — `יישור:
 * (left, right)` — and a cell body is full of them. A `"` only opens a string at
 * depth 0, where Typst is in code context; inside a `[…]` body it is an ordinary
 * character, which is how Hebrew writes gershayim.
 */
function topLevelArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"' && depth === 0) inString = true;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  out.push(args.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

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

      const colsMatch = /(עמודות|columns)\s*:\s*(\d+)/u.exec(args);
      const cols = colsMatch ? Math.max(1, parseInt(colsMatch[2], 10)) : 2;
      const options = topLevelArgs(args).filter(
        (a) => !CELL_HEAD.test(a) && !COLS_ARG.test(a),
      );

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
        options,
        cells,
        names: hebrew
          ? { table: "טבלה", cell: "תא", header: "כותרת_תא", merge: "מיזוג", cols: colsMatch?.[1] ?? "עמודות" }
          : { table: "mktable", cell: "cell", header: "headcell", merge: "colspan_", cols: colsMatch?.[1] ?? "columns" },
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

/**
 * Where a cell lands once merges are honoured.
 *
 * A `מיזוג(n)` cell occupies `n` columns, so cell index and grid position are
 * not the same thing the moment a table has one. Everything structural below is
 * expressed against this grid rather than against `index / cols`, which was the
 * arithmetic that silently reflowed a merged table on any edit.
 */
interface Placement {
  cell: TableCell;
  /** Index into the cell list this placement came from. */
  index: number;
  /** Zero-based grid row. */
  row: number;
  /** Zero-based starting column. */
  col: number;
  /** Columns actually occupied (clamped to the table width). */
  span: number;
}

/**
 * Lay the cell list out into a grid of `cols` columns, honouring spans.
 *
 * Cells fill left-to-right, top-to-bottom; a cell that would overflow the
 * current row wraps to the next, exactly as Typst's own auto-placement does. A
 * span wider than the table is clamped, so a stray `מיזוג(9)` in a 2-column
 * table can never make a row that no operation can reason about.
 */
function layout(cells: TableCell[], cols: number): { grid: Placement[]; rows: number } {
  const grid: Placement[] = [];
  let row = 0;
  let col = 0;
  cells.forEach((cell, index) => {
    const span = Math.min(Math.max(1, cell.span), cols);
    if (col > 0 && col + span > cols) {
      row++;
      col = 0;
    }
    grid.push({ cell, index, row, col, span });
    col += span;
    if (col >= cols) {
      row++;
      col = 0;
    }
  });
  const rows = col === 0 ? row : row + 1;
  return { grid, rows };
}

function placementsIn(grid: Placement[], row: number): Placement[] {
  return grid.filter((p) => p.row === row);
}

export function rowOf(t: TableInfo, cellIndex: number): number {
  return layout(t.cells, t.cols).grid[cellIndex]?.row ?? 0;
}

export function colOf(t: TableInfo, cellIndex: number): number {
  return layout(t.cells, t.cols).grid[cellIndex]?.col ?? 0;
}

export function rowCount(t: TableInfo): number {
  return Math.max(1, layout(t.cells, t.cols).rows);
}

/** The source for one cell, preserving whether it is a header or a merge. */
function cellSource(t: TableInfo, c: TableCell): string {
  // Span wins over header: the markup has no spanning-header form (מיזוג is
  // `table.cell(colspan:)`, כותרת_תא is a styled single cell), so a cell that is
  // both keeps its width, which is the property a structural edit must not lose.
  if (c.span > 1) return `${t.names.merge}(${c.span})[${c.body}]`;
  return `${c.header ? t.names.header : t.names.cell}[${c.body}]`;
}

/** Render a table back to source, laid out one grid row per line. */
function render(t: TableInfo, cells: TableCell[], cols: number): string {
  const { grid, rows } = layout(cells, cols);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    lines.push(
      "  " +
        placementsIn(grid, r)
          .map((p) => cellSource(t, p.cell))
          .join(", ") +
        ",",
    );
  }
  // The column count keeps the name it was written with, and every other
  // setting comes back verbatim: an English table must not come out of a row
  // insert with a Hebrew argument name in it, and a striped one must not come
  // out unstriped.
  const head = [`${t.names.cols}: ${cols}`, ...t.options].join(", ");
  return `#${t.names.table}(${head},\n${lines.join("\n")}\n)`;
}

/** A blank cell, matching the kind of the row it joins. */
function blank(header: boolean): TableCell {
  return { from: -1, to: -1, body: "", header, span: 1 };
}

/**
 * Pad the final grid row out to the full width.
 *
 * A hand-edited table often has a partial last row; every operation below
 * assumes each row sums to `cols`, and quietly completing it is kinder than
 * refusing to act. Interior rows left short by an oversized merge are Typst's
 * problem to auto-fill, not ours to reshape.
 */
function rectangular(cells: TableCell[], cols: number): TableCell[] {
  const { grid, rows } = layout(cells, cols);
  const out = cells.slice();
  if (rows === 0) return out;
  const last = placementsIn(grid, rows - 1);
  const filled = last.reduce((n, p) => n + p.span, 0);
  const header = last.length > 0 && last.every((p) => p.cell.header);
  for (let c = filled; c < cols; c++) out.push(blank(header));
  return out;
}

/** Index at which grid row `row` begins, or the cell count if past the end. */
function rowStartIndex(grid: Placement[], row: number, count: number): number {
  const first = grid.find((p) => p.row >= row);
  return first ? first.index : count;
}

export function insertRow(doc: string, t: TableInfo, afterRow: number): string {
  const cells = rectangular(t.cells, t.cols);
  const { grid, rows } = layout(cells, t.cols);
  const target = Math.min(Math.max(afterRow + 1, 0), rows);
  const at = rowStartIndex(grid, target, cells.length);
  const fresh = Array.from({ length: t.cols }, () => blank(false));
  cells.splice(at, 0, ...fresh);
  return replace(doc, t, render(t, cells, t.cols));
}

export function deleteRow(doc: string, t: TableInfo, row: number): string {
  const cells = rectangular(t.cells, t.cols);
  const { grid, rows } = layout(cells, t.cols);
  if (rows <= 1) return doc; // never delete the last row
  const keep = cells.filter((_, i) => grid[i].row !== row);
  return replace(doc, t, render(t, keep, t.cols));
}

export function insertColumn(doc: string, t: TableInfo, afterCol: number): string {
  const cells = rectangular(t.cells, t.cols);
  const { grid, rows } = layout(cells, t.cols);
  const at = Math.min(Math.max(afterCol + 1, 0), t.cols);
  const out: TableCell[] = [];
  for (let r = 0; r < rows; r++) {
    const rowCells = placementsIn(grid, r);
    const header = rowCells.length > 0 && rowCells.every((p) => p.cell.header);
    let placed = false;
    for (const p of rowCells) {
      // The new column falls at this cell's left edge — drop a blank in ahead
      // of it, matching the row's kind so a header row stays a header row.
      if (!placed && p.col === at) {
        out.push(blank(header));
        placed = true;
      }
      const c = { ...p.cell, span: p.span };
      // The new column falls *inside* a merged cell — widen the merge rather
      // than splitting it, which is the only edit that keeps the row summing.
      if (!placed && p.col < at && p.col + p.span > at) {
        c.span += 1;
        placed = true;
      }
      out.push(c);
    }
    // `at` sits at the row's right edge (including a full-width single row).
    if (!placed) out.push(blank(header));
  }
  return replace(doc, t, render(t, out, t.cols + 1));
}

export function deleteColumn(doc: string, t: TableInfo, col: number): string {
  if (t.cols <= 1) return doc; // never delete the last column
  const cells = rectangular(t.cells, t.cols);
  const { grid, rows } = layout(cells, t.cols);
  const out: TableCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (const p of placementsIn(grid, r)) {
      const covers = col >= p.col && col < p.col + p.span;
      if (covers) {
        // A merge over the deleted column narrows by one; a single cell in it
        // disappears. Cells to the right slide left for free, in render order.
        if (p.span > 1) out.push({ ...p.cell, span: p.span - 1 });
      } else {
        out.push({ ...p.cell, span: p.span });
      }
    }
  }
  return replace(doc, t, render(t, out, t.cols - 1));
}

/** Turn the row into header cells, or back into ordinary ones. */
export function toggleHeaderRow(doc: string, t: TableInfo, row: number): string {
  const cells = rectangular(t.cells, t.cols).map((c) => ({ ...c }));
  const { grid } = layout(cells, t.cols);
  const slice = placementsIn(grid, row);
  const makeHeader = !slice.every((p) => p.cell.header);
  for (const p of slice) cells[p.index].header = makeHeader;
  return replace(doc, t, render(t, cells, t.cols));
}

function replace(doc: string, t: TableInfo, source: string): string {
  return doc.slice(0, t.from) + source + doc.slice(t.to);
}

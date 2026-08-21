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

import { SPELLING, scan, type Node } from "./spans";

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
  /**
   * Per-column track sizes, when the table declares them — `("2fr", "1fr")`.
   *
   * Typst's `columns:` takes either a count or a list of track sizes, and the
   * engine passes the argument straight through, so `#טבלה(עמודות: (2fr, 1fr))`
   * has always rendered correctly. The editor only ever read the integer form:
   * a three-column table with widths parsed as *two* columns, and one click on
   * the ribbon rewrote it as `עמודות: 2` with the cells reflowed into the wrong
   * rows and the widths gone. Engine right, editor silently destructive — with
   * no error anywhere, because the result still compiled.
   */
  widths: string[] | null;
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

/**
 * The table containing `pos`, if there is one.
 *
 * The cells, the column count and the track list all come from `spans.ts`, which
 * is the fix for a divergence that had one ribbon button destroying a table:
 * this file understood `עמודות: (2fr, 1fr, 1fr)` and prose mode's own parser
 * matched `\d+` only, fell back to two columns, and drew a three-column table as
 * a two-column grid. `table.widerColumn` is the control that *writes* a track
 * list, so one click moved the two readers into disagreement and the writer saw
 * their table reflow.
 */
export function tableAt(doc: string, pos: number): TableInfo | null {
  let found: Node | null = null;
  for (const n of scan(doc).nodes) {
    if (n.role !== "table" || !n.args) continue;
    if (pos < n.from || pos > n.to) continue;
    // Innermost wins: a table inside a cell is the one being edited.
    if (!found || n.depth > found.depth) found = n;
  }
  if (!found) return null;

  const args = found.args!;
  // Both already computed, once, by the scan — see `Node.cells`.
  const cells: TableCell[] = (found.cells ?? []).map((c) => ({
    from: c.from,
    to: c.to,
    body: c.bodies[0] ? doc.slice(c.bodies[0].from, c.bodies[0].to) : "",
    header: c.header === true,
    span: c.span ?? 1,
  }));
  const options = found.options ?? [];

  const en = found.lang === "en";
  const s = SPELLING;
  const written = found.colsArg ? doc.slice(found.colsArg.from, found.colsArg.to) : "";
  const colsName = /^(עמודות|columns)/u.exec(written)?.[1] ?? (en ? s.cols.en : s.cols.he);

  return {
    from: found.from,
    to: found.to,
    argsFrom: args.from,
    argsTo: args.to,
    cols: found.cols ?? 2,
    widths: found.widths ?? null,
    options,
    cells,
    names: {
      table: en ? s.table.en : s.table.he,
      cell: en ? s.cell.en : s.cell.he,
      header: en ? s.headcell.en : s.headcell.he,
      merge: en ? s.merge.en : s.merge.he,
      cols: colsName,
    },
  };
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
export interface Placement {
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

interface Layout {
  grid: Placement[];
  /** The same placements indexed by row — `byRow[r]` is row `r`, left to right. */
  byRow: Placement[][];
  rows: number;
}

/**
 * Lay the cell list out into a grid of `cols` columns, honouring spans.
 *
 * Cells fill left-to-right, top-to-bottom; a cell that would overflow the
 * current row wraps to the next, exactly as Typst's own auto-placement does. A
 * span wider than the table is clamped, so a stray `מיזוג(9)` in a 2-column
 * table can never make a row that no operation can reason about.
 *
 * The rows are **bucketed here**, once, rather than found by filtering the whole
 * cell list per row. Every loop below walks the table row by row, so a filter
 * per row made each of them quadratic in the table: `render` alone was
 * 360 000 comparisons on a six-hundred-row table, and the ribbon used to pay for
 * eighteen of those per caret move.
 */
function layout(cells: TableCell[], cols: number): Layout {
  const grid: Placement[] = [];
  const byRow: Placement[][] = [];
  let row = 0;
  let col = 0;
  cells.forEach((cell, index) => {
    const span = Math.min(Math.max(1, cell.span), cols);
    if (col > 0 && col + span > cols) {
      row++;
      col = 0;
    }
    const p = { cell, index, row, col, span };
    grid.push(p);
    (byRow[row] ??= []).push(p);
    col += span;
    if (col >= cols) {
      row++;
      col = 0;
    }
  });
  const rows = col === 0 ? row : row + 1;
  return { grid, byRow, rows };
}

function placementsIn(l: Layout, row: number): Placement[] {
  return l.byRow[row] ?? [];
}

/**
 * The table laid out, once: cells padded to a full rectangle, every cell's grid
 * position, and the rows indexed.
 *
 * Every operation below needs exactly this, and so does every question about
 * whether an operation *applies*. `structure.ts` computes it once per caret move
 * and asks all eighteen table controls; asking used to mean **running** all
 * eighteen — eighteen layouts, eighteen re-renders of the table and eighteen
 * copies of the whole document, per arrow key.
 */
export interface TableGeometry {
  /** The cells, padded so the final grid row is full. */
  cells: TableCell[];
  cols: number;
  /** Grid rows after padding; 0 only for a table with no cells at all. */
  rows: number;
  /** One placement per cell, in cell order. */
  grid: Placement[];
  /** The placements indexed by row. */
  byRow: Placement[][];
}

export function geometry(t: TableInfo): TableGeometry {
  const cells = rectangular(t.cells, t.cols);
  const { grid, byRow, rows } = layout(cells, t.cols);
  return { cells, cols: t.cols, rows, grid, byRow };
}

/** The placement covering a grid position — the cell a merge spans over, too. */
function placementAt(g: TableGeometry, row: number, col: number): Placement | undefined {
  return placementsIn(g, row).find((p) => col >= p.col && col < p.col + p.span);
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
function render(
  t: TableInfo,
  cells: TableCell[],
  cols: number,
  widths: string[] | null = t.widths,
): string {
  const l = layout(cells, cols);
  const lines: string[] = [];
  for (let r = 0; r < l.rows; r++) {
    lines.push(
      "  " +
        placementsIn(l, r)
          .map((p) => cellSource(t, p.cell))
          .join(", ") +
        ",",
    );
  }
  // The column count keeps the name it was written with, and every other
  // setting comes back verbatim: an English table must not come out of a row
  // insert with a Hebrew argument name in it, and a striped one must not come
  // out unstriped.
  // A table that declared track sizes keeps declaring them. Writing the count
  // back instead is how one ribbon click used to throw the column widths away.
  const colArg =
    widths && widths.length === cols ? `(${widths.join(", ")})` : String(cols);
  const head = [`${t.names.cols}: ${colArg}`, ...t.options].join(", ");
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
  const l = layout(cells, cols);
  const out = cells.slice();
  if (l.rows === 0) return out;
  const last = placementsIn(l, l.rows - 1);
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

// ---------------------------------------------------------------- can it act?
//
// One question per operation, answered from the geometry alone: no rendering, no
// second copy of the document, no string comparison. These are what the ribbon,
// the menus and the hydra ask eighteen times per caret move, and each operation
// below asks its own before it does anything — so "the control is enabled" and
// "the operation acts" are the same sentence, and cannot drift into disagreeing.
//
// The rule they follow: an operation applies when it is *structurally* possible
// here. That is not always the same as "the resulting text differs" — swapping
// two identical rows applies and produces identical source — and the old test
// (render it, compare it to the document) got the difference wrong in both
// directions. It greyed out "make the columns equal" on a table whose columns
// were already equal but whose source was formatted by hand, and enabled it on
// one that only needed reformatting.

/** A row can always be added; there is always somewhere to put it. */
export function canInsertRow(): boolean {
  return true;
}

/** Never the last one: a table with no rows cannot be edited back into one. */
export function canDeleteRow(g: TableGeometry): boolean {
  return g.rows > 1;
}

export function canMoveRow(g: TableGeometry, row: number, by: -1 | 1): boolean {
  const other = row + by;
  return row >= 0 && row < g.rows && other >= 0 && other < g.rows;
}

export function canInsertColumn(): boolean {
  return true;
}

export function canDeleteColumn(g: TableGeometry): boolean {
  return g.cols > 1;
}

/**
 * Refused when either column is crossed by a merge: there is no honest way to
 * reorder half of a spanning cell, and silently splitting one would lose the
 * writer's layout.
 */
export function canMoveColumn(g: TableGeometry, col: number, by: -1 | 1): boolean {
  const other = col + by;
  if (col < 0 || col >= g.cols || other < 0 || other >= g.cols) return false;
  return !g.grid.some(
    (p) => p.span > 1 && [col, other].some((c) => c > p.col && c < p.col + p.span),
  );
}

export function canMergeRight(g: TableGeometry, row: number, col: number): boolean {
  const here = placementAt(g, row, col);
  if (!here) return false;
  const next = placementsIn(g, row).find((p) => p.col === here.col + here.span);
  return !!next && here.col + here.span + next.span <= g.cols;
}

export function canSplitCell(g: TableGeometry, row: number, col: number): boolean {
  const here = placementAt(g, row, col);
  return !!here && here.span > 1;
}

/**
 * A header row toggles when at least one *single* cell in it would change.
 *
 * Not merely "the row exists": `cellSource` has no spanning-header form, so a
 * row made only of merges renders identically whichever way the flag goes, and
 * offering a button that provably cannot change the document is the exact lie
 * this file is trying to stop telling.
 */
export function canToggleHeaderRow(g: TableGeometry, row: number): boolean {
  const slice = placementsIn(g, row);
  if (slice.length === 0) return false;
  const makeHeader = !slice.every((p) => p.cell.header);
  return slice.some((p) => p.span === 1 && p.cell.header !== makeHeader);
}

export function canDeleteTable(): boolean {
  return true;
}

/**
 * The track list this table *renders* with — null when it renders a bare count.
 *
 * `render` only writes a track list when it has one per column, so a list of the
 * wrong length is already invisible; the width questions below all compare what
 * would be written against what is written now.
 */
function tracksNow(t: TableInfo, g: TableGeometry): string[] | null {
  return t.widths && t.widths.length === g.cols ? t.widths : null;
}

function sameTracks(a: string[] | null, b: string[] | null): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

/** The tracks this table would declare once one column is set to `width`. */
function tracksWith(t: TableInfo, g: TableGeometry, col: number, width: string): string[] | null {
  const widths = tracksNow(t, g)?.slice() ?? Array.from({ length: g.cols }, () => "auto");
  widths[col] = width.trim() || "auto";
  // Every track `auto` says exactly what the bare count says, so drop back to
  // the count rather than leaving noise in the writer's source.
  return widths.every((w) => w === "auto") ? null : widths;
}

export function canSetColumnWidth(
  t: TableInfo,
  g: TableGeometry,
  col: number,
  width: string,
): boolean {
  if (col < 0 || col >= g.cols) return false;
  return !sameTracks(tracksNow(t, g), tracksWith(t, g, col, width));
}

export function canEqualColumns(t: TableInfo, g: TableGeometry): boolean {
  return !sameTracks(tracksNow(t, g), equalTracks(g));
}

export function canAutoColumns(t: TableInfo, g: TableGeometry): boolean {
  return tracksNow(t, g) !== null;
}

function equalTracks(g: TableGeometry): string[] {
  return Array.from({ length: g.cols }, () => "1fr");
}

// ---------------------------------------------------------------- the caret
//
// Every operation below returns a **document**, and for a long time that was
// taken to be the whole answer: `structure.ts` clamped the old caret offset into
// the new text and called it placed. A clamp is not a mapping. It always yields
// a legal position and it is right only when the edit happened after the caret,
// which for a table operation is almost never — inserting a column rewrites the
// call from `עמודות:` onward, so every cell moves and the caret stays put.
//
// What that looked like: put the caret in the first header cell of a new table,
// press "add a column after", type one character, and it goes into the middle of
// the command name — `כותרץת_תא[]`. The table stops being a table. Nothing
// errors, because the offset was in range the whole time.
//
// So the operations keep returning a string, and the caret is answered here,
// once, for all of them: the writer stays in the cell they were in, the same
// distance from its closing bracket. `structure.ts` says where that cell *went*
// (a row that moved up is at `row - 1`); everything else is this function.

/** A grid position, for saying where an operation left the writer. */
export interface CellAt {
  row: number;
  col: number;
}

/**
 * Put the caret back in a cell after the table underneath it was rebuilt.
 *
 * `fromEnd` is the caret's distance from the end of the cell it was in, which
 * survives the rebuild exactly when the cell's own text does — true for every
 * operation here, since they add, remove and reorder cells rather than edit
 * them. A cell that no longer exists (the row was deleted, the table was) falls
 * back to the nearest one, and then to the table itself.
 */
export function caretIn(doc: string, tableFrom: number, at: CellAt, fromEnd: number): number {
  const t = tableAt(doc, tableFrom);
  if (!t) return Math.min(tableFrom, doc.length);
  const g = geometry(t);
  if (g.rows === 0) return Math.min(t.argsTo, doc.length);
  const row = Math.max(0, Math.min(at.row, g.rows - 1));
  const inRow = placementsIn(g, row);
  if (inRow.length === 0) return Math.min(t.argsTo, doc.length);
  const p =
    placementAt(g, row, Math.max(0, at.col)) ??
    inRow[Math.min(Math.max(0, at.col), inRow.length - 1)];
  // Inside the *body*, never merely inside the call. A cell ends `…]`, so its
  // body runs from `to - 1 - body.length` to `to - 1`; anything outside that is
  // the command name or its arguments, where a typed character is markup damage
  // rather than writing. This is the floor the old clamp had no notion of.
  const end = p.cell.to - 1;
  const start = end - p.cell.body.length;
  return Math.max(start, Math.min(p.cell.to - fromEnd, end));
}

// ---------------------------------------------------------------- moving about
//
// The eighteen operations above all *change* the table. None of them moved the
// writer through it, and neither did anything else: lists own `Enter`, `Tab`,
// `Shift+Tab` and `Alt`+arrows, and a table had a ribbon and no keyboard at all.
// `Tab` in a cell fell through to the editor's own indent and put spaces in the
// markup.
//
// `Tab` is how every table in every word processor is filled in. Without it the
// only way into the next cell is a mouse click on the source between two
// brackets, which is not writing.

/** The body of a cell — where a writer types, and where a step lands. */
function bodyOf(c: TableCell): { from: number; to: number } {
  const to = c.to - 1;
  return { from: to - c.body.length, to };
}

/**
 * Where the caret goes on `Tab`, or `null` at the end of the table.
 *
 * The **start** of the next cell's body rather than a selection of it: Word
 * selects the cell and replaces its text on the next keystroke, which is
 * convenient in a spreadsheet and destructive in a sefer. Landing at the start
 * is the same gesture with nothing thrown away.
 *
 * A caret between two cells steps to the one it is on the near side of, so
 * `Tab` from anywhere inside the table means something.
 */
export function stepCell(t: TableInfo, pos: number, by: -1 | 1): number | null {
  const here = cellIndexAt(t, pos);
  const from =
    here ?? (by === 1 ? t.cells.findIndex((c) => c.from > pos) - 1 : t.cells.findIndex((c) => c.from > pos));
  const next = (here === null && from < 0 ? (by === 1 ? -1 : t.cells.length) : from) + by;
  if (next < 0 || next >= t.cells.length) return null;
  return bodyOf(t.cells[next]).from;
}

/** Is there a cell that way? */
export function canStepCell(t: TableInfo, pos: number, by: -1 | 1): boolean {
  return stepCell(t, pos, by) !== null;
}

/**
 * Where the caret goes moving one step through the **grid** rather than through
 * the sequence of cells.
 *
 * `Tab` walks the cells in the order they are written, which is the order you
 * fill a table in. It is not the order you *read* one: a writer checking the
 * third column of every row is moving down a column, and following the sequence
 * to get there is as many keystrokes as there are columns.
 *
 * `drow`/`dcol` are grid steps, and deliberately not named up/down/left/right.
 * Which arrow means `dcol: +1` depends on the direction the table is set in — in
 * a Hebrew table column 0 is the *rightmost* — and that is the shell's question,
 * because the shell is what knows the document's direction. A module that
 * decided it here would be a second opinion about which way Hebrew runs.
 *
 * A merged cell is one placement however many columns it spans, so stepping off
 * its left edge lands in the column after the span rather than inside it. That
 * is `placementAt`'s doing, and it is the reason this walks the geometry rather
 * than arithmetic on cell indices.
 *
 * Returns `null` at the edge of the table — never a wrapped-around position: a
 * writer holding an arrow at the last row means *stop*, and jumping to the first
 * row is the kind of helpfulness that loses somebody their place.
 */
export function stepGrid(
  t: TableInfo,
  pos: number,
  drow: number,
  dcol: number,
): number | null {
  const here = cellIndexAt(t, pos);
  if (here === null) return null;
  const g = geometry(t);
  // The *geometry's* placement, not `layout(t.cells, …)`: a ragged last row is
  // padded to a rectangle by `geometry`, and the two disagree about where the
  // grid ends. Stepping against the unpadded one lands on a placement whose
  // cell was never in the source, and `bodyOf` on that returns a position
  // inside `#טבלה(`'s arguments — which is markup, not a place to type. Caught
  // by `structure.test.mjs`'s "no operation leaves the caret outside the body
  // it was in", which is precisely the fence for this.
  const at = g.grid[here];
  if (!at) return null;
  const row = at.row + drow;
  if (row < 0 || row >= g.rows) return null;
  // **Past the span, not one column along it.** A cell merged across three
  // columns is entered at its start and occupies all three, so `col + 1` is
  // still the same cell — the caret would not move, and a key that does nothing
  // reads as the feature being broken. Endward leaves at the end of the span;
  // startward leaves from its start.
  const col = dcol > 0 ? at.col + at.span : at.col + dcol;
  if (col < 0 || col >= t.cols) return null;
  const p = placementAt(g, row, col);
  // A padded cell has no source of its own; landing in one would put the caret
  // in a cell the document does not contain.
  if (!p || p.index >= t.cells.length) return null;
  return bodyOf(p.cell).from;
}

/** Whether a grid step from here goes anywhere. */
export function canStepGrid(t: TableInfo, pos: number, drow: number, dcol: number): boolean {
  return stepGrid(t, pos, drow, dcol) !== null;
}

// ---------------------------------------------------------------- the operations

export function insertRow(doc: string, t: TableInfo, afterRow: number): string {
  const g = geometry(t);
  const cells = g.cells.slice();
  const target = Math.min(Math.max(afterRow + 1, 0), g.rows);
  const at = rowStartIndex(g.grid, target, cells.length);
  const fresh = Array.from({ length: t.cols }, () => blank(false));
  cells.splice(at, 0, ...fresh);
  return replace(doc, t, render(t, cells, t.cols));
}

export function deleteRow(doc: string, t: TableInfo, row: number): string {
  const g = geometry(t);
  if (!canDeleteRow(g)) return doc; // never delete the last row
  const keep = g.cells.filter((_, i) => g.grid[i].row !== row);
  return replace(doc, t, render(t, keep, t.cols));
}

export function insertColumn(doc: string, t: TableInfo, afterCol: number): string {
  const g = geometry(t);
  const at = Math.min(Math.max(afterCol + 1, 0), t.cols);
  const out: TableCell[] = [];
  for (let r = 0; r < g.rows; r++) {
    const rowCells = placementsIn(g, r);
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
  // The new column needs a track of its own, or the list no longer matches the
  // count and the whole declaration is dropped on the next render.
  const widths = t.widths
    ? [...t.widths.slice(0, at), t.widths[Math.min(at, t.widths.length - 1)] ?? "auto", ...t.widths.slice(at)]
    : null;
  return replace(doc, t, render(t, out, t.cols + 1, widths));
}

export function deleteColumn(doc: string, t: TableInfo, col: number): string {
  const g = geometry(t);
  if (!canDeleteColumn(g)) return doc; // never delete the last column
  const out: TableCell[] = [];
  for (let r = 0; r < g.rows; r++) {
    for (const p of placementsIn(g, r)) {
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
  const widths = t.widths ? t.widths.filter((_, i) => i !== col) : null;
  return replace(doc, t, render(t, out, t.cols - 1, widths));
}

/** Turn the row into header cells, or back into ordinary ones. */
export function toggleHeaderRow(doc: string, t: TableInfo, row: number): string {
  const g = geometry(t);
  if (!canToggleHeaderRow(g, row)) return doc;
  const cells = g.cells.map((c) => ({ ...c }));
  const slice = placementsIn(g, row);
  const makeHeader = !slice.every((p) => p.cell.header);
  for (const p of slice) cells[p.index].header = makeHeader;
  return replace(doc, t, render(t, cells, t.cols));
}

/**
 * Swap a row with the one above or below it.
 *
 * Rows are whole units in the cell list — a grid row's placements are
 * contiguous — so moving one is a splice rather than a rebuild, and merges
 * inside it travel intact.
 */
export function moveRow(doc: string, t: TableInfo, row: number, by: -1 | 1): string {
  const g = geometry(t);
  if (!canMoveRow(g, row, by)) return doc;
  const other = row + by;
  const slice = (r: number) => placementsIn(g, r).map((p) => g.cells[p.index]);
  const a = Math.min(row, other);
  const b = Math.max(row, other);
  const out: TableCell[] = [];
  for (let r = 0; r < g.rows; r++) {
    if (r === a) out.push(...slice(b));
    else if (r === b) out.push(...slice(a));
    else out.push(...slice(r));
  }
  return replace(doc, t, render(t, out, t.cols));
}

/**
 * Swap a column with its neighbour.
 *
 * Refuses when either column is crossed by a merge: there is no honest way to
 * reorder half of a spanning cell, and silently splitting one would lose the
 * writer's layout. Doing nothing is the truthful answer.
 */
export function moveColumn(doc: string, t: TableInfo, col: number, by: -1 | 1): string {
  const g = geometry(t);
  if (!canMoveColumn(g, col, by)) return doc;
  const other = col + by;

  const out: TableCell[] = [];
  for (let r = 0; r < g.rows; r++) {
    const byCol = new Map<number, Placement>();
    for (const p of placementsIn(g, r)) byCol.set(p.col, p);
    for (let c = 0; c < t.cols; ) {
      const want = c === col ? other : c === other ? col : c;
      const p = byCol.get(want);
      if (p) {
        out.push({ ...p.cell, span: p.span });
        // A swapped-in merge occupies its own width at the destination.
        c += want === c ? p.span : 1;
      } else {
        c += 1;
      }
    }
  }
  let widths = t.widths;
  if (widths) {
    widths = widths.slice();
    [widths[col], widths[other]] = [widths[other], widths[col]];
  }
  return replace(doc, t, render(t, out, t.cols, widths));
}

/**
 * Set one column's width — `2fr`, `3cm`, `auto`.
 *
 * A table with no declared tracks gets a full set at once, every column `auto`
 * except this one: Typst's `columns:` is all-or-nothing, so there is no way to
 * size a single column without saying something about the others.
 */
export function setColumnWidth(doc: string, t: TableInfo, col: number, width: string): string {
  const g = geometry(t);
  if (!canSetColumnWidth(t, g, col, width)) return doc;
  return replace(doc, t, render(t, g.cells, t.cols, tracksWith(t, g, col, width)));
}

/** Give every column an equal share of the width. */
export function equalColumns(doc: string, t: TableInfo): string {
  const g = geometry(t);
  if (!canEqualColumns(t, g)) return doc;
  return replace(doc, t, render(t, g.cells, t.cols, equalTracks(g)));
}

/** Let every column size itself to its contents — Typst's default. */
export function autoColumns(doc: string, t: TableInfo): string {
  const g = geometry(t);
  if (!canAutoColumns(t, g)) return doc;
  return replace(doc, t, render(t, g.cells, t.cols, null));
}

/**
 * Merge the cell at (row, col) with the one to its right.
 *
 * The bodies are joined with a space rather than one being dropped: a merge is
 * a layout change, and losing the writer's second sentence to it would be the
 * quiet kind of damage this file exists to avoid.
 */
export function mergeRight(doc: string, t: TableInfo, row: number, col: number): string {
  const g = geometry(t);
  if (!canMergeRight(g, row, col)) return doc;
  const grid = g.grid;
  const here = placementAt(g, row, col)!;
  const next = placementsIn(g, row).find((p) => p.col === here.col + here.span)!;

  const merged: TableCell = {
    ...here.cell,
    body: [here.cell.body, next.cell.body].map((b) => b.trim()).filter(Boolean).join(" "),
    span: here.span + next.span,
  };
  const out = grid
    .filter((p) => p.index !== next.index)
    .map((p) => (p.index === here.index ? merged : { ...p.cell, span: p.span }));
  return replace(doc, t, render(t, out, t.cols));
}

/** Split a merged cell back into single cells, its text staying in the first. */
export function splitCell(doc: string, t: TableInfo, row: number, col: number): string {
  const g = geometry(t);
  if (!canSplitCell(g, row, col)) return doc;
  const here = placementAt(g, row, col)!;
  const out: TableCell[] = [];
  for (const p of g.grid) {
    if (p.index !== here.index) {
      out.push({ ...p.cell, span: p.span });
      continue;
    }
    out.push({ ...p.cell, span: 1 });
    for (let i = 1; i < p.span; i++) out.push(blank(p.cell.header));
  }
  return replace(doc, t, render(t, out, t.cols));
}

/** Remove the whole table, leaving the text around it alone. */
export function deleteTable(doc: string, t: TableInfo): string {
  const before = doc.slice(0, t.from).replace(/[ \t]+$/, "");
  const after = doc.slice(t.to).replace(/^[ \t]*\n?/, "");
  return (before + "\n" + after).replace(/\n{3,}/g, "\n\n");
}

function replace(doc: string, t: TableInfo, source: string): string {
  return doc.slice(0, t.from) + source + doc.slice(t.to);
}

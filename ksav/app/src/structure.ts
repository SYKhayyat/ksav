// What can be done to the thing the caret is inside — as data.
//
// This is deliberately a registry rather than a set of buttons. The product has
// to be configurable the way Emacs is: a person rebinds a key, reorders a
// ribbon, puts an operation in a hydra, records a macro out of three of them.
// None of that is possible if "insert row below" exists only as a `<button>`
// with an `onClick` in the middle of a five-thousand-line file — which is what
// the table bar was, four operations wide, parked at the bottom of the window
// where nobody found it.
//
// So every structural operation is one entry with a stable id, and every
// surface — the contextual ribbon, the menus, the keymap, the palette, the
// hydras, the macro recorder — is a *view* over this list. A new operation
// appears everywhere at once, and nothing can be built and then hidden, which is
// the failure this codebase keeps producing.
//
// Everything here is pure: (document, caret) in, (document, caret) out. The
// tests are real tests, and `engine/tests/structure.rs` compiles the output.

import * as heads from "./headings";
import * as lists from "./lists";
import * as tables from "./table";

export interface Edit {
  text: string;
  caret: number;
}

/** Which structure the caret is inside. */
export type Structure = "list" | "table" | "heading";

export interface StructureAction {
  /** Stable identifier: the key binding, the macro step, the config entry. */
  id: string;
  structure: Structure;
  /** Ribbon grouping, so related operations sit together. */
  group: string;
  /** Compact label for a dense ribbon. */
  glyph: string;
  /** i18n key for the full name. */
  label: string;
  /**
   * Show the name beside the glyph, not only in the tooltip.
   *
   * The ribbon's tooltips are good and a Word user does not discover a feature
   * by hovering eleven arrows — Word labels its ribbon. Labelling all eighteen
   * table operations would be a wall of text, so the two or three each writer
   * actually reaches for carry their name and the rest stay compact.
   */
  primary?: boolean;
  /**
   * Do it. Returns null when the operation does not apply here — the last item
   * cannot move down, the first cannot indent — which is what the surfaces use
   * to disable a control rather than letting it silently do nothing.
   */
  run(doc: string, pos: number): Edit | null;
}

// ---------------------------------------------------------------- lists

/** Wrap a list operation so it finds its own list and reports inapplicability. */
function onList(
  fn: (doc: string, list: lists.ListInfo, pos: number) => Edit | null,
): (doc: string, pos: number) => Edit | null {
  return (doc, pos) => {
    const list = lists.listAt(doc, pos);
    return list ? fn(doc, list, pos) : null;
  };
}

const LIST_ACTIONS: StructureAction[] = [
  {
    id: "list.addItem",
    primary: true,
    structure: "list",
    group: "items",
    glyph: "＋",
    label: "listAddItem",
    run: onList((doc, list, pos) => lists.addItem(doc, list, pos)),
  },
  {
    id: "list.splitItem",
    primary: true,
    structure: "list",
    group: "items",
    glyph: "⤶",
    label: "listSplitItem",
    run: onList((doc, list, pos) => lists.splitItem(doc, list, pos)),
  },
  {
    id: "list.breakInItem",
    structure: "list",
    group: "items",
    glyph: "↵",
    label: "listBreakInItem",
    // The one the writer asked for by name: a newline *inside* a bullet.
    run: (doc, pos) => (lists.listAt(doc, pos) ? lists.breakInItem(doc, pos) : null),
  },
  {
    id: "list.deleteItem",
    structure: "list",
    group: "items",
    glyph: "✕",
    label: "listDeleteItem",
    run: onList((doc, list, pos) => lists.deleteItem(doc, list, pos)),
  },
  {
    id: "list.indent",
    primary: true,
    structure: "list",
    group: "level",
    glyph: "⇥",
    label: "listIndentItem",
    run: onList((doc, list, pos) => lists.indentItem(doc, list, pos)),
  },
  {
    id: "list.outdent",
    structure: "list",
    group: "level",
    glyph: "⇤",
    label: "listOutdentItem",
    run: onList((doc, list, pos) => lists.outdentItem(doc, list, pos)),
  },
  {
    id: "list.moveUp",
    structure: "list",
    group: "order",
    glyph: "▲",
    label: "listMoveUp",
    run: onList((doc, list, pos) => lists.moveItem(doc, list, pos, -1)),
  },
  {
    id: "list.moveDown",
    structure: "list",
    group: "order",
    glyph: "▼",
    label: "listMoveDown",
    run: onList((doc, list, pos) => lists.moveItem(doc, list, pos, 1)),
  },
  {
    id: "list.bullets",
    structure: "list",
    group: "kind",
    glyph: "•",
    label: "listAsBullets",
    run: onList((doc, list) => (list.kind === "bullets" ? null : lists.setKind(doc, list, "bullets"))),
  },
  {
    id: "list.numbered",
    structure: "list",
    group: "kind",
    glyph: "1.",
    label: "listAsNumbered",
    run: onList((doc, list) =>
      list.kind === "numbered" ? null : lists.setKind(doc, list, "numbered"),
    ),
  },
  {
    id: "list.hebrew",
    structure: "list",
    group: "kind",
    glyph: "א.",
    label: "listAsHebrew",
    run: onList((doc, list) => (list.kind === "hebrew" ? null : lists.setKind(doc, list, "hebrew"))),
  },
];

// ---------------------------------------------------------------- tables

/**
 * Wrap a table operation.
 *
 * With the caret between cells rather than in one, the operation acts on the
 * last row and column instead of refusing: "add a row" should always mean
 * something while the caret is inside a table.
 */
function onTable(
  fn: (doc: string, t: tables.TableInfo, row: number, col: number) => string,
): (doc: string, pos: number) => Edit | null {
  return (doc, pos) => {
    const t = tables.tableAt(doc, pos);
    if (!t) return null;
    const idx = tables.cellIndexAt(t, pos);
    const row = idx == null ? tables.rowCount(t) - 1 : tables.rowOf(t, idx);
    const col = idx == null ? t.cols - 1 : tables.colOf(t, idx);
    const text = fn(doc, t, row, col);
    // An operation that changed nothing did not apply — the surfaces grey it out
    // rather than offering a button that does nothing when pressed.
    return text === doc ? null : { text, caret: Math.min(pos, text.length) };
  };
}

/**
 * One notch wider or narrower, in `fr` units.
 *
 * `fr` rather than centimetres because a table should still fit the page after
 * the margins change: a column pinned at 6cm on A4 is a column that overflows
 * the moment the document is printed on Letter. A column with no declared track
 * starts from 1fr, which is what `auto` looks like once its neighbours are
 * sized.
 */
function stepWidth(t: tables.TableInfo, col: number, by: 1 | -1): string {
  const current = t.widths?.[col] ?? "auto";
  const m = /^([\d.]+)fr$/.exec(current);
  const n = m ? parseFloat(m[1]) : 1;
  // Never below a quarter: a zero-width column cannot be clicked back open.
  return `${Math.max(0.25, Math.round((n + by * 0.5) * 100) / 100)}fr`;
}

const TABLE_ACTIONS: StructureAction[] = [
  {
    id: "table.rowAbove",
    structure: "table",
    group: "rows",
    glyph: "↑＋",
    label: "insertRowAbove",
    run: onTable((doc, t, row) => tables.insertRow(doc, t, row - 1)),
  },
  {
    id: "table.rowBelow",
    primary: true,
    structure: "table",
    group: "rows",
    glyph: "↓＋",
    label: "insertRowBelow",
    run: onTable((doc, t, row) => tables.insertRow(doc, t, row)),
  },
  {
    id: "table.rowUp",
    structure: "table",
    group: "rows",
    glyph: "▲",
    label: "moveRowUp",
    run: onTable((doc, t, row) => tables.moveRow(doc, t, row, -1)),
  },
  {
    id: "table.rowDown",
    structure: "table",
    group: "rows",
    glyph: "▼",
    label: "moveRowDown",
    run: onTable((doc, t, row) => tables.moveRow(doc, t, row, 1)),
  },
  {
    id: "table.rowDelete",
    structure: "table",
    group: "rows",
    glyph: "⊖",
    label: "deleteRow",
    run: onTable((doc, t, row) => tables.deleteRow(doc, t, row)),
  },
  {
    id: "table.colBefore",
    structure: "table",
    group: "cols",
    glyph: "＋←",
    label: "insertColBefore",
    run: onTable((doc, t, _row, col) => tables.insertColumn(doc, t, col - 1)),
  },
  {
    id: "table.colAfter",
    primary: true,
    structure: "table",
    group: "cols",
    glyph: "→＋",
    label: "insertColAfter",
    run: onTable((doc, t, _row, col) => tables.insertColumn(doc, t, col)),
  },
  {
    id: "table.colStart",
    structure: "table",
    group: "cols",
    glyph: "◀",
    label: "moveColStart",
    run: onTable((doc, t, _row, col) => tables.moveColumn(doc, t, col, -1)),
  },
  {
    id: "table.colEnd",
    structure: "table",
    group: "cols",
    glyph: "▶",
    label: "moveColEnd",
    run: onTable((doc, t, _row, col) => tables.moveColumn(doc, t, col, 1)),
  },
  {
    id: "table.colDelete",
    structure: "table",
    group: "cols",
    glyph: "⊗",
    label: "deleteCol",
    run: onTable((doc, t, _row, col) => tables.deleteColumn(doc, t, col)),
  },
  {
    id: "table.mergeRight",
    structure: "table",
    group: "cells",
    glyph: "⇥⇤",
    label: "mergeRight",
    run: onTable((doc, t, row, col) => tables.mergeRight(doc, t, row, col)),
  },
  {
    id: "table.splitCell",
    structure: "table",
    group: "cells",
    glyph: "⇤⇥",
    label: "splitCell",
    run: onTable((doc, t, row, col) => tables.splitCell(doc, t, row, col)),
  },
  {
    id: "table.widerColumn",
    structure: "table",
    group: "width",
    glyph: "↔＋",
    label: "widerColumn",
    run: onTable((doc, t, _row, col) => tables.setColumnWidth(doc, t, col, stepWidth(t, col, 1))),
  },
  {
    id: "table.narrowerColumn",
    structure: "table",
    group: "width",
    glyph: "↔－",
    label: "narrowerColumn",
    run: onTable((doc, t, _row, col) => tables.setColumnWidth(doc, t, col, stepWidth(t, col, -1))),
  },
  {
    id: "table.equalColumns",
    structure: "table",
    group: "width",
    glyph: "≡",
    label: "equalColumns",
    run: onTable((doc, t) => tables.equalColumns(doc, t)),
  },
  {
    id: "table.autoColumns",
    structure: "table",
    group: "width",
    glyph: "⤢",
    label: "autoColumns",
    run: onTable((doc, t) => tables.autoColumns(doc, t)),
  },
  {
    id: "table.headerRow",
    primary: true,
    structure: "table",
    group: "whole",
    glyph: "H",
    label: "toggleHeaderRow",
    run: onTable((doc, t, row) => tables.toggleHeaderRow(doc, t, row)),
  },
  {
    id: "table.delete",
    structure: "table",
    group: "whole",
    glyph: "🗑",
    label: "deleteTable",
    run: onTable((doc, t) => tables.deleteTable(doc, t)),
  },
];

// ---------------------------------------------------------------- headings

/**
 * Wrap a heading operation.
 *
 * The caret does not have to be *on* the heading: standing in the body text and
 * saying "move this section up" is the ordinary case, and refusing there would
 * make the operation useless exactly when it is wanted.
 */
function onHeading(
  fn: (doc: string, h: heads.HeadingInfo) => Edit | null,
): (doc: string, pos: number) => Edit | null {
  return (doc, pos) => {
    const h = heads.sectionAt(doc, pos);
    return h ? fn(doc, h) : null;
  };
}

const HEADING_ACTIONS: StructureAction[] = [
  {
    id: "heading.promote",
    primary: true,
    structure: "heading",
    group: "level",
    glyph: "⇤",
    label: "headingPromote",
    run: onHeading((doc, h) => heads.promote(doc, h)),
  },
  {
    id: "heading.demote",
    primary: true,
    structure: "heading",
    group: "level",
    glyph: "⇥",
    label: "headingDemote",
    run: onHeading((doc, h) => heads.demote(doc, h)),
  },
  ...Array.from({ length: heads.MAX_LEVEL }, (_, i) => ({
    // All nine, because the engine has always had all nine and the toolbar
    // showed three. Generated rather than listed: a level that exists in the
    // model should not also need a hand-written entry here to be reachable.
    id: `heading.level${i + 1}`,
    structure: "heading" as const,
    group: "levels",
    glyph: `${i + 1}`,
    label: `headingLevel${i + 1}`,
    // Not `onHeading`: this one applies to the line in hand, exactly as a style
    // button does in a word processor. Wrapped in `sectionAt` it would restyle
    // the heading *above* the caret while the writer looked at their paragraph.
    run: (doc: string, pos: number) => heads.makeHeading(doc, pos, i + 1),
  })),
  {
    id: "heading.moveUp",
    structure: "heading",
    group: "order",
    glyph: "▲",
    label: "headingMoveUp",
    run: onHeading((doc, h) => heads.moveSection(doc, h, -1)),
  },
  {
    id: "heading.moveDown",
    structure: "heading",
    group: "order",
    glyph: "▼",
    label: "headingMoveDown",
    run: onHeading((doc, h) => heads.moveSection(doc, h, 1)),
  },
  {
    id: "heading.delete",
    structure: "heading",
    group: "whole",
    glyph: "🗑",
    label: "headingDelete",
    run: onHeading((doc, h) => heads.deleteSection(doc, h)),
  },
  {
    id: "heading.contents",
    structure: "heading",
    group: "whole",
    glyph: "☰",
    label: "headingContents",
    run: (doc, pos) => (heads.sectionAt(doc, pos) ? heads.addContents(doc) : null),
  },
];

export const STRUCTURE_ACTIONS: StructureAction[] = [
  ...LIST_ACTIONS,
  ...TABLE_ACTIONS,
  ...HEADING_ACTIONS,
];

/** Look one up by id — what a key binding, a macro step or a hydra holds. */
export function actionById(id: string): StructureAction | undefined {
  return STRUCTURE_ACTIONS.find((a) => a.id === id);
}

/**
 * Which structure the caret is in.
 *
 * Innermost wins: a list inside a table cell is a list, because that is what
 * the writer is typing into.
 */
export function structureAt(doc: string, pos: number): Structure | null {
  const list = lists.listAt(doc, pos);
  const table = tables.tableAt(doc, pos);
  if (list && table) return list.from > table.from ? "list" : "table";
  if (list) return "list";
  if (table) return "table";
  // A heading last, and deliberately so: every position after the first heading
  // is inside *some* section, so it would otherwise claim the caret everywhere
  // and no list or table would ever get the ribbon.
  if (heads.sectionAt(doc, pos)) return "heading";
  return null;
}

/**
 * The nearest position that is inside a structure — the caret's own, or one
 * just inside the thing it has just stepped out of.
 *
 * Finish typing a list and the caret rests after the closing `)`, where
 * `structureAt` correctly answers "nowhere" and the ribbon empties. Correct by
 * the model, and wrong for the writer: Word keeps the table and list tools up
 * while you are anywhere near the thing, and a ribbon that vanishes on the
 * character *after* the one you were just editing reads as a bug.
 *
 * So a caret sitting on trailing whitespace after a closer looks one character
 * further in. The **position** is returned rather than only the structure,
 * because a sticky ribbon whose buttons then do nothing would be worse than no
 * ribbon: every surface acts at this position too.
 */
export function structureNear(doc: string, pos: number): { structure: Structure; pos: number } | null {
  const here = structureAt(doc, pos);
  if (here) return { structure: here, pos };
  let i = Math.min(pos, doc.length);
  while (i > 0 && /\s/.test(doc[i - 1])) i--;
  if (i > 0 && (doc[i - 1] === ")" || doc[i - 1] === "]")) {
    const inside = i - 1;
    const s = structureAt(doc, inside);
    if (s) return { structure: s, pos: inside };
  }
  return null;
}

/** The operations offered here, each marked with whether it can act. */
export function availableAt(
  doc: string,
  pos: number,
): { action: StructureAction; enabled: boolean }[] {
  const structure = structureAt(doc, pos);
  if (!structure) return [];
  return STRUCTURE_ACTIONS.filter((a) => a.structure === structure).map((action) => ({
    action,
    enabled: action.run(doc, pos) !== null,
  }));
}

/** A short description of where the caret is, for the ribbon's label. */
export function whereAmI(
  doc: string,
  pos: number,
): { structure: Structure; row: number; rows: number; col: number; cols: number } | null {
  const structure = structureAt(doc, pos);
  if (structure === "list") {
    const list = lists.listAt(doc, pos)!;
    const here = lists.itemAt(list, pos);
    return {
      structure,
      row: (here?.index ?? list.items.length - 1) + 1,
      rows: list.items.length,
      col: list.depth + 1,
      cols: list.depth + 1,
    };
  }
  if (structure === "heading") {
    const h = heads.sectionAt(doc, pos)!;
    const all = heads.headings(doc);
    return {
      structure,
      row: all.findIndex((o) => o.from === h.from) + 1,
      rows: all.length,
      col: h.level,
      cols: heads.MAX_LEVEL,
    };
  }
  if (structure === "table") {
    const t = tables.tableAt(doc, pos)!;
    const idx = tables.cellIndexAt(t, pos);
    return {
      structure,
      row: (idx == null ? tables.rowCount(t) - 1 : tables.rowOf(t, idx)) + 1,
      rows: tables.rowCount(t),
      col: (idx == null ? t.cols - 1 : tables.colOf(t, idx)) + 1,
      cols: t.cols,
    };
  }
  return null;
}

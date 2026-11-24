// Where every action lives — the one table the whole shell is drawn from.
//
// # The finding
//
// Five surfaces (the menu bar, the toolbar, the palette, the keyboard map and
// the contextual strip) and no statement of which one holds what. Each menu in
// `ribbon.ts` was a hand-written list, the toolbar was a second hand-written
// list, and `MENU_OF` sent `torah`, `reference`, `review` and `layout` to
// Insert while a Sources menu stood beside it. The defect was the missing
// statement; this module is the statement. See `docs/ui-architecture.md`, which
// is the spec this is built to, and
// `decisions/2026-11-23-the-shell-is-built-from-placements`.
//
// # The rules, in the type and in `placed()`
//
// 1. **Every action has exactly one menu home.** `Place.menu` is required, so
//    an action reachable only from a tab, the palette or a chord cannot be
//    written down.
// 2. **A tab is a view, never a home.** `Place.tab` is optional and defaults
//    from the menu (`TAB_OF_MENU`), so there is no tab placement without a menu
//    placement.
// 3. **A `*_config` command (`הגדרות_…`) is never a face button.** `placed()`
//    sets `gear` on it; a renderer puts it behind the group's `⚙`.
// 4. **A deprecated command has no place.** It stays in the palette and the
//    completions for old documents and is advertised nowhere else.
//
// # Why this module is pure
//
// It imports no editor, no DOM and no runtime. `placed()` takes its four
// sources as an argument — the built-in actions, the registry, the saved
// macros, the custom styles — and the shell (`shellplaced.ts`) is what reads
// them off the running application. That is what lets every fence over the
// taxonomy run in node against the real registry, and it is what §12 of the
// spec asks for: the placement data is a statement about ksav, and survives any
// frontend.

import type { CommandDef } from "./api";
import { ACTION_COMMAND, BREAK_COMMAND } from "./actions";
import { DEFER_BODY_COMMANDS, DEFER_REF_COMMANDS, DEFER_REGION_COMMANDS } from "./note-commands";
import { ICON_OF, type IconId } from "./icons";

/** The menu bar, in document direction. §5. */
export type MenuId =
  | "file"
  | "docs"
  | "edit"
  | "insert"
  | "format"
  | "table"
  | "notes"
  | "sources"
  | "review"
  | "view"
  | "tools"
  | "help";

/** The tab strip. §5. `table` is contextual: drawn only while the caret is in a table. */
export type TabId = "home" | "insert" | "layout" | "notes" | "sources" | "review" | "view" | "table";

/** How big a face is drawn (§5): `large` is icon over label, `small` icon beside label, `icon` the icon alone. */
export type FaceSize = "large" | "small" | "icon";

/**
 * Where one action lives.
 *
 * `menu` is required — that is the floor, and the type is the fence. The rest
 * are views of it.
 */
export interface Place {
  /** The menu home. Required: the floor. */
  menu: MenuId;
  /** The section in the menu, and the button group on the tab. `grp.<id>` names it. */
  group: string;
  /** Defaults to the tab whose `TAB_GROUPS` row lists `group`. */
  tab?: TabId;
  /** Drawn as a named button on its tab; otherwise behind the group's `⋯`. */
  face?: boolean;
  /** Also on the Home tab. Set by `placed()` from `HOME`. */
  home?: boolean;
  /** Within the group. Otherwise registry / declaration order. */
  order?: number;
  /** From `icons.ts`. Filled by `placed()` from `ICON_OF`; a face without one is drawn as its label. */
  icon?: IconId;
  /** Filled by `placed()` from `SIZE`; absent is `small`. */
  size?: FaceSize;
}

/** The menu bar, in order. */
export const MENUS: readonly MenuId[] = [
  "file",
  "docs",
  "edit",
  "insert",
  "format",
  "table",
  "notes",
  "sources",
  "review",
  "view",
  "tools",
  "help",
];

/** The tab strip, in order. The contextual tabs come last, coloured, and only in context. */
export const TABS: readonly TabId[] = ["home", "insert", "layout", "notes", "sources", "review", "view", "table"];

/** The tabs that appear only while the caret asks for them (§5). */
export const CONTEXTUAL: ReadonlySet<TabId> = new Set<TabId>(["table"]);

/**
 * The sections of each menu, in order. Every `Place.group` is one of these,
 * and a group id is unique across the whole bar, so `grp.<id>` names it once.
 */
export const GROUPS: Readonly<Record<MenuId, readonly string[]>> = {
  file: ["fileOpen", "fileImport", "fileShare", "templates", "export"],
  docs: ["library", "docTabs"],
  edit: ["undo", "clipboard", "find", "entity", "brackets"],
  insert: ["tables", "objects", "headings", "lists", "blocks", "misc", "hidden"],
  format: ["font", "paragraph", "styles", "structure", "page", "breaks", "columns", "spacing"],
  table: ["rowscols", "cells"],
  notes: ["notes", "endnotes", "sidenotes", "systems", "numbering", "refs"],
  sources: ["sefer", "citations", "girsa", "indexes"],
  review: ["proofing", "editorComments", "tracking", "versions"],
  view: ["panes", "folding", "zoom", "ribbon", "interface"],
  tools: ["macros", "commandsGroup", "defer", "compile", "settingsGroup"],
  help: ["helpGroup"],
};

/**
 * What each tab but Home draws, group by group, in order: the §5 tables.
 *
 * The one statement of the tabs. A group is on the tab whose row lists it; a
 * group no row lists — File's, Edit's, Tools', the conceal-and-fold rows, the
 * interface toggles that live in the status bar — is a menu's and no tab's.
 * Format has no tab of its own: its text and paragraph halves are Home, and its
 * page half is Layout. Tools' commands group is drawn on View, where Word keeps
 * its macros.
 */
export const TAB_GROUPS: Readonly<Record<Exclude<TabId, "home">, readonly string[]>> = {
  insert: ["tables", "objects", "headings", "lists", "blocks", "misc"],
  layout: ["page", "breaks", "columns", "spacing"],
  notes: ["notes", "endnotes", "sidenotes", "systems", "numbering", "refs"],
  sources: ["sefer", "citations", "girsa", "indexes"],
  review: ["proofing", "editorComments", "tracking", "versions"],
  view: ["panes", "folding", "zoom", "commandsGroup", "ribbon"],
  table: ["rowscols", "cells"],
};

const TAB_OF_GROUP: ReadonlyMap<string, TabId> = new Map(
  Object.entries(TAB_GROUPS).flatMap(([tab, groups]) => groups.map((g) => [g, tab as TabId] as const)),
);

/** The menu that owns a group, read off `GROUPS`. */
export function menuOfGroup(group: string): MenuId | undefined {
  return MENUS.find((m) => GROUPS[m].includes(group));
}

/** The tab a place is drawn on, if any. */
export function tabOf(place: Place): TabId | undefined {
  return place.tab ?? TAB_OF_GROUP.get(place.group);
}

// ---------------------------------------------------------------- engine commands

/**
 * Category → place. The grown-up `MENU_OF`.
 *
 * The engine still does not decide the menubar: the category is what a command
 * is *about*, and where it is shown is the client's table, as `menus.ts` argued.
 */
export const PLACE_OF_CATEGORY: Readonly<Record<string, { menu: MenuId; group: string }>> = {
  style: { menu: "format", group: "font" },
  heading: { menu: "insert", group: "headings" },
  align: { menu: "format", group: "paragraph" },
  list: { menu: "insert", group: "lists" },
  table: { menu: "table", group: "cells" },
  footnote: { menu: "notes", group: "notes" },
  reference: { menu: "notes", group: "refs" },
  block: { menu: "insert", group: "blocks" },
  layout: { menu: "format", group: "spacing" },
  image: { menu: "insert", group: "objects" },
  torah: { menu: "sources", group: "sefer" },
  review: { menu: "review", group: "tracking" },
  math: { menu: "insert", group: "objects" },
};

/**
 * The exceptions, keyed by the command's Hebrew name.
 *
 * Where a category is mixed: `footnote` holds the endnotes, the margin, the
 * note systems and the counters; `layout` holds "put a thing on the page" and
 * "set up the page"; `torah` holds the sefer's structure, its citations and its
 * indexes. Overridden here rather than the engine growing categories, because
 * the category is what a command is about and this is where it is shown.
 *
 * Only `group` is overridden; the menu is read off the group (`GROUPS`), so an
 * override cannot name a group in one menu and a menu that does not hold it.
 */
export const PLACE_OVERRIDE: Readonly<Record<string, { group: string }>> = Object.fromEntries(
  (
    [
      ["tables", ["טבלה"]],
      ["editorComments", ["הערת_עורך", "הגדרות_הערת_עורך"]],
      ["endnotes", ["הערתסיום", "הגדרות_הערתסיום", "הערות_בסוף", "הגדרות_הערות_סיום", "הערות_בסוף_צד"]],
      ["sidenotes", ["עם_הערות_צד", "הערת_גיליון", "עם_הערות_דו_צד", "הערת_ימין", "הערת_שמאל"]],
      [
        "systems",
        [
          "ערוץ", "אזור", "הצג_אזור", "מדור_א", "מדור_ב", "מדור_ג", "מדור_בדרגה", "הערות_מדורגות",
          "הגדרות_מדורגות", "מדף_א", "מדף_ב", "מדף_ג", "מדף_בדרגה", "הגדרות_מדפים", "הערה_זרם",
          "הערת_תוכן", "הערת_מקור", "הגדרות_זרמים",
          // Named notes and their bodies. Spelled once, in `note-commands.ts`.
          ...[DEFER_REF_COMMANDS, DEFER_BODY_COMMANDS, DEFER_REGION_COMMANDS].map((c) => c[0]),
        ],
      ],
      ["numbering", ["התחל_מספור", "המשך_מספור", "מונה", "הגדרות_מונה", "הגדרות_מספור"]],
      ["indexes", ["תוכן", "מפתח_מקורות", "מפתח_ענינים", "ערך", "הגדרות_ערך", "רשימת_סימונים"]],
      ["misc", ["כלול", "קו_מפריד", "הגדרות_קו_מפריד", "חסר"]],
      ["breaks", ["מעבר_עמוד", "מעבר_שורה", "מעבר_פסקה", "מעבר_טור"]],
      ["columns", ["טורים_בלוק"]],
      ["page", ["מקטע_עמוד", "כותרת_עליונה", "כותרת_תחתונה"]],
      [
        "citations",
        [
          "מראה_מקום", "ציון", "גמרא", "פסוק", "ציון_מקור", "הגדרות_מראה_מקום", "הגדרות_ציון",
          "הגדרות_גמרא", "הגדרות_פסוק", "הגדרות_ציון_מקור",
        ],
      ],
    ] as const
  ).flatMap(([group, names]) => names.map((he) => [he, { group }])),
);

/** Is this a `*_config` command — the "how X is set" kind, which goes behind `⚙`. */
export function isConfig(c: Pick<CommandDef, "he" | "en">): boolean {
  return c.en.endsWith("_config") || c.he.startsWith("הגדרות_");
}

/**
 * The action that is the door to a command, when one is.
 *
 * `ACTION_COMMAND` pairs a key with a command; `BREAK_COMMAND` pairs a break's
 * row with its command. An action that exists (it is in `builtIns`) and is the
 * door to a command is placed *once*, under the action's id — so the Format
 * menu's bold row and the toolbar's bold button are one thing, which prints the
 * key that runs it, rather than an action and a registry row side by side.
 */
function doorOf(he: string, builtIns: ReadonlySet<string>): string | undefined {
  for (const table of [ACTION_COMMAND, BREAK_COMMAND] as Record<string, string>[]) {
    for (const [id, name] of Object.entries(table)) if (name === he && builtIns.has(id)) return id;
  }
  return undefined;
}

/** The placed id of an engine command with no door. */
const commandId = (he: string): string => "cmd:" + he;

// ---------------------------------------------------------------- shell actions

/**
 * The place of every shell action that is not the door to a command.
 *
 * Kept here, keyed by id, rather than as a field written into each `BUILT_IN`
 * literal: `BUILT_IN` is generated in five places (the command doors, the fold
 * levels, the list depths, the structure actions, the pane swaps), and a table
 * beside the taxonomy is the one place a reader can see a whole menu at once.
 * The fence in `placement.test.mjs` is what makes it total — every `BUILT_IN`
 * id has a place here, or is a door that takes its command's.
 */
export const ACTION_PLACE: Readonly<Record<string, Place>> = {
  // File
  newDoc: { menu: "docs", group: "library", order: -3 },
  renameDoc: { menu: "docs", group: "library", order: -2 },
  duplicateDoc: { menu: "docs", group: "library", order: -1 },
  open: { menu: "file", group: "fileOpen" },
  save: { menu: "file", group: "fileOpen" },
  saveAs: { menu: "file", group: "fileOpen" },
  importWord: { menu: "file", group: "fileImport" },
  importOrg: { menu: "file", group: "fileImport" },
  shareRead: { menu: "file", group: "fileShare" },
  shareReview: { menu: "file", group: "fileShare" },
  saveAsTemplate: { menu: "file", group: "fileShare" },
  exportPdf: { menu: "file", group: "export" },
  exportWord: { menu: "file", group: "export" },
  copyForWord: { menu: "file", group: "export" },
  exportHtml: { menu: "file", group: "export" },
  exportMarkdown: { menu: "file", group: "export" },
  exportOrg: { menu: "file", group: "export" },
  exportText: { menu: "file", group: "export" },
  exportTypst: { menu: "file", group: "export" },
  exportTypstCompact: { menu: "file", group: "export" },
  print: { menu: "file", group: "export" },
  // Documents
  lastDoc: { menu: "docs", group: "docTabs" },
  switcher: { menu: "docs", group: "docTabs" },
  closeDoc: { menu: "docs", group: "docTabs" },
  newDocTab: { menu: "docs", group: "docTabs" },
  newTab: { menu: "docs", group: "docTabs" },
  closeTab: { menu: "docs", group: "docTabs" },
  nextTab: { menu: "docs", group: "docTabs" },
  prevTab: { menu: "docs", group: "docTabs" },
  // Edit
  undo: { menu: "edit", group: "undo" },
  redo: { menu: "edit", group: "undo" },
  cut: { menu: "edit", group: "clipboard" },
  copy: { menu: "edit", group: "clipboard" },
  paste: { menu: "edit", group: "clipboard" },
  find: { menu: "edit", group: "find" },
  replace: { menu: "edit", group: "find" },
  entitySelect: { menu: "edit", group: "entity" },
  entityUnwrap: { menu: "edit", group: "entity" },
  entityRemove: { menu: "edit", group: "entity" },
  healBrackets: { menu: "edit", group: "brackets" },
  moveOutOfBracket: { menu: "edit", group: "brackets" },
  moveOutOfBracketToNextLine: { menu: "edit", group: "brackets" },
  moveOutOfAllBrackets: { menu: "edit", group: "brackets" },
  // Insert
  insertImage: { menu: "insert", group: "objects" },
  insertFormula: { menu: "insert", group: "objects" },
  hideLine: { menu: "insert", group: "hidden" },
  hideBlock: { menu: "insert", group: "hidden" },
  fold: { menu: "insert", group: "hidden" },
  // Format
  makeList: { menu: "format", group: "structure", order: -1 },
  stylesPanel: { menu: "format", group: "styles" },
  sectionSetup: { menu: "format", group: "page", order: -1 },
  hiddenBreak: { menu: "format", group: "breaks", order: -1 },
  // Notes
  tieredNote: { menu: "notes", group: "notes" },
  notesChooser: { menu: "notes", group: "notes", order: -1 },
  renumber: { menu: "notes", group: "numbering" },
  renderNotes: { menu: "notes", group: "numbering" },
  // Sources
  citePhrase: { menu: "sources", group: "girsa" },
  linkifyCitations: { menu: "sources", group: "girsa" },
  refreshSources: { menu: "sources", group: "girsa" },
  hydra: { menu: "sources", group: "girsa" },
  // Review
  spellSuggest: { menu: "review", group: "proofing" },
  addComment: { menu: "review", group: "editorComments" },
  reviewPanel: { menu: "review", group: "editorComments" },
  markInsert: { menu: "review", group: "tracking" },
  markDelete: { menu: "review", group: "tracking" },
  snapshot: { menu: "review", group: "versions" },
  history: { menu: "review", group: "versions" },
  gitPanel: { menu: "review", group: "versions" },
  // View
  outline: { menu: "view", group: "panes" },
  notesPane: { menu: "view", group: "panes" },
  marksPane: { menu: "view", group: "panes" },
  arrangement: { menu: "view", group: "panes" },
  "pane.swapLeft": { menu: "view", group: "panes" },
  "pane.swapRight": { menu: "view", group: "panes" },
  "pane.swapUp": { menu: "view", group: "panes" },
  "pane.swapDown": { menu: "view", group: "panes" },
  minimap: { menu: "view", group: "panes" },
  "pane.zoom": { menu: "view", group: "panes" },
  narrow: { menu: "view", group: "panes" },
  widen: { menu: "view", group: "panes" },
  isolate: { menu: "view", group: "panes" },
  foldAll: { menu: "view", group: "folding" },
  unfoldAll: { menu: "view", group: "folding" },
  zoomIn: { menu: "view", group: "zoom" },
  zoomOut: { menu: "view", group: "zoom" },
  zoomReset: { menu: "view", group: "zoom" },
  revealCursor: { menu: "view", group: "zoom" },
  revealPlaces: { menu: "view", group: "zoom" },
  ribbonCustomize: { menu: "view", group: "ribbon" },
  prose: { menu: "view", group: "interface" },
  toggleTheme: { menu: "view", group: "interface" },
  toggleLang: { menu: "view", group: "interface" },
  nikud: { menu: "view", group: "interface" },
  // Tools
  palette: { menu: "tools", group: "commandsGroup" },
  macroRecord: { menu: "tools", group: "commandsGroup" },
  commandsDrawer: { menu: "tools", group: "commandsGroup" },
  macroPlay: { menu: "tools", group: "macros" },
  deferJump: { menu: "tools", group: "defer" },
  deferHere: { menu: "tools", group: "defer" },
  deferRecall: { menu: "tools", group: "defer" },
  deferAll: { menu: "tools", group: "defer" },
  deferRecallAll: { menu: "tools", group: "defer" },
  deferSort: { menu: "tools", group: "defer" },
  compileNow: { menu: "tools", group: "compile" },
  settingsDrawer: { menu: "tools", group: "settingsGroup" },
  // Help
  help: { menu: "help", group: "helpGroup" },
  keysDrawer: { menu: "help", group: "helpGroup" },
};

/**
 * The shell actions that are a group's dialog launcher (§3): the `⚙` in the
 * group's label row, beside the `*_config` commands — Word's *page setup…*.
 */
export const LAUNCHER: ReadonlySet<string> = new Set(["sectionSetup", "notesChooser"]);

/**
 * The place of a generated shell action — the families `BUILT_IN` builds with
 * a `map`, whose ids are not worth writing out one by one.
 */
function familyPlace(id: string): Place | undefined {
  if (/^foldLevel\d+$/.test(id) || /^foldListDepth\d+$/.test(id)) return { menu: "view", group: "folding" };
  if (/^heading\./.test(id) || /^list\./.test(id)) return { menu: "format", group: "structure" };
  if (/^note\./.test(id)) return { menu: "notes", group: "notes" };
  if (/^table\.(row|col)/.test(id) || /^table\.(wider|narrower|equal|auto)/.test(id) || id === "table.headerRow" || id === "table.delete")
    return { menu: "table", group: "rowscols" };
  if (/^table\./.test(id)) return { menu: "table", group: "cells" };
  return undefined;
}

// ---------------------------------------------------------------- the default faces

/**
 * Each tab group's face, in order: the noun forms of the group (§5, rule 2).
 *
 * Written as the keys a writer would read — an action id, or a command's
 * Hebrew name — and resolved by `placed()` to whichever id the thing is placed
 * under. A face of more than `MAX_FACE` is a wall, and a fence says so.
 */
export const FACE: Readonly<Record<string, readonly string[]>> = {
  // Insert
  tables: ["טבלה"],
  objects: ["insertImage", "insertFormula"],
  headings: ["שער", "תת_שער", "כותרת"],
  lists: ["רשימה", "ממוספרת", "ממוספרת_עברית"],
  blocks: ["ציטוט", "תיבה", "מקור"],
  misc: ["קו_מפריד", "חסר", "כלול"],
  // Layout
  page: ["מקטע_עמוד", "כותרת_עליונה", "כותרת_תחתונה"],
  breaks: ["מעבר_עמוד", "מעבר_טור"],
  columns: ["טורים_בלוק"],
  spacing: ["מרווח", "הזחה"],
  // Notes
  notes: ["הערה", "הערה_ב", "הערה_ג", "tieredNote"],
  endnotes: ["הערתסיום", "הערות_בסוף"],
  sidenotes: ["עם_הערות_צד", "הערת_גיליון"],
  systems: ["ערוץ", "אזור", "הצג_אזור"],
  numbering: ["התחל_מספור", "המשך_מספור", "renumber"],
  refs: ["הפניה", "סמן", "הפניה_להערה"],
  // Sources
  sefer: ["סימן", "סעיף", "אות", "דיבור_המתחיל"],
  citations: ["מראה_מקום", "ציון", "גמרא", "פסוק"],
  girsa: ["citePhrase", "linkifyCitations", "refreshSources"],
  indexes: ["תוכן", "מפתח_מקורות", "מפתח_ענינים", "ערך"],
  // Review
  proofing: ["spellSuggest"],
  editorComments: ["addComment", "reviewPanel"],
  tracking: ["markInsert", "markDelete"],
  versions: ["snapshot", "history", "gitPanel"],
  // View
  panes: ["outline", "notesPane", "marksPane", "arrangement", "pane.swapRight", "minimap"],
  folding: ["foldAll", "unfoldAll"],
  zoom: ["zoomIn", "zoomOut"],
  commandsGroup: ["palette", "macroRecord"],
  ribbon: ["ribbonCustomize"],
  // Table (contextual)
  rowscols: ["table.rowAbove", "table.rowBelow", "table.colBefore", "table.colAfter", "table.rowDelete", "table.colDelete"],
  cells: ["מיזוג", "table.splitCell", "כותרת_תא"],
};

/** The most labelled (large or small) faces a group draws: rule 2. */
export const MAX_FACE = 6;
/** The most icon-only faces a group draws: the Font and Paragraph rows are icons, and denser. */
export const MAX_ICON_FACE = 10;
/** The most large faces a group draws. */
export const MAX_LARGE = 2;

/**
 * The faces that are not `small` (§5): the large ones a group leads with, and
 * the icon-only ones whose picture is the name. Keyed like `FACE`.
 */
export const SIZE: Readonly<Record<string, FaceSize>> = {
  ...Object.fromEntries(
    [
      "paste", "טבלה", "insertImage", "מקטע_עמוד", "טורים_בלוק", "הערה", "סימן", "מראה_מקום", "תוכן",
      "spellSuggest", "addComment",
    ].map((k) => [k, "large" as const]),
  ),
  ...Object.fromEntries(
    [
      "גדול", "קטן", "הדגשה", "נטוי", "קו_תחתון", "קו_חוצה", "סימון", "צבע",
      "ימין", "מרכז", "שמאל", "מימין_לשמאל", "משמאל_לימין", "zoomIn", "zoomOut",
    ].map((k) => [k, "icon" as const]),
  ),
};

/**
 * The Home tab: what a writer reaches for every minute (§5).
 *
 * A list of its own rather than a flag on each place: Home's groups are not
 * the items' own groups — the headings sit with siman and seif under *מבנה*,
 * cut and copy under *לוח* while the Edit menu files them with undo — and a footnote is a face on Home
 * while the endnote beside it is behind `⋯`, which is not what the Notes tab
 * says about either. `placed()` still sets `place.home` from this, so a reader
 * of one action can see that it is a Home pick.
 */
export const HOME: readonly { group: string; face: readonly string[]; more: readonly string[] }[] = [
  // Word's Clipboard: paste large, cut and copy stacked beside it.
  { group: "clipboard", face: ["paste", "cut", "copy"], more: [] },
  {
    group: "font",
    face: ["גדול", "קטן", "הדגשה", "נטוי", "קו_תחתון", "קו_חוצה", "סימון", "צבע"],
    more: ["עילי", "תחתי", "רברבתי", "כתב_רשי", "רקע", "מרווח_אותיות", "קוד", "גופן_שונה", "גודל_גופן", "עיצוב"],
  },
  { group: "paragraph", face: ["ימין", "מרכז", "שמאל", "מימין_לשמאל", "משמאל_לימין"], more: [] },
  // The document's custom styles follow the panel's face at render time: they
  // are the document's, and `placed()` puts every style in this group.
  { group: "styles", face: ["stylesPanel"], more: [] },
  { group: "homeStructure", face: ["כותרת1", "כותרת2", "כותרת3", "סימן", "סעיף"], more: ["אות", "דיבור_המתחיל", "שער", "תת_שער"] },
  { group: "homeNotes", face: ["הערה", "הערה_ב"], more: ["הערתסיום"] },
  // Word's Editing, at Home's far end: find and replace.
  { group: "find", face: ["find", "replace"], more: [] },
];

/** Home's own group ids — named like any group, owned by no menu. */
export const HOME_GROUPS: readonly string[] = ["homeStructure", "homeNotes"];

/** Where the generated actions go (§4). */
const MACRO_PLACE: Place = { menu: "tools", group: "macros" };
const STYLE_PLACE: Place = { menu: "format", group: "styles", home: true };

// ---------------------------------------------------------------- placed()

/** One action, where it lives, and how to run it. */
export interface PlacedAction {
  id: string;
  place: Place;
  /** Where it came from — which also says how its label is found. */
  kind: "shell" | "command" | "macro" | "style";
  /** The registry entry this action is, or is the door to. */
  command?: CommandDef;
  /** The name a macro or a style carries; shell and command labels come from i18n and the registry. */
  name?: string;
  /** Behind `⚙`: a `*_config` command. Never a face. */
  gear?: boolean;
}

/** What `placed()` is built from. The shell reads these off the running app. */
export interface PlaceSources {
  builtIns: readonly string[];
  commands: readonly CommandDef[];
  macros: readonly { id: string; name: string }[];
  styles: readonly { id: string; name: string }[];
}

/** The place of a shell action id, or `undefined` for an orphan (which a fence refuses). */
export function shellPlace(id: string): Place | undefined {
  return ACTION_PLACE[id] ?? familyPlace(id);
}

/** The place a command takes from its category and the overrides. */
function commandPlace(c: CommandDef): Place {
  const override = PLACE_OVERRIDE[c.he];
  const cat = PLACE_OF_CATEGORY[c.category] ?? { menu: "insert", group: "misc" };
  if (!override) return { ...cat };
  return { menu: menuOfGroup(override.group) ?? cat.menu, group: override.group };
}

/**
 * Every placed action, in menu order — the one list the shell renders.
 *
 * Merges the four sources: the registry (each command under its door's id when
 * an action is its door), the remaining shell actions, the saved macros and the
 * custom styles. Then applies the rules nobody should have to remember per row:
 * deprecated commands are dropped, `*_config` commands are `gear` and never
 * `face`, `FACE` and `HOME` set `face`, `order` and `home`.
 */
export function placed(src: PlaceSources): PlacedAction[] {
  const builtIns = new Set(src.builtIns);
  const out: PlacedAction[] = [];
  const doors = new Set<string>();
  const byKey = new Map<string, PlacedAction>();

  for (const c of src.commands) {
    if (c.deprecated) continue;
    const door = doorOf(c.he, builtIns);
    const place = commandPlace(c);
    const a: PlacedAction = { id: door ?? commandId(c.he), place, kind: door ? "shell" : "command", command: c };
    if (door) {
      doors.add(door);
      // A door that also has a hand-written place keeps its order, but the
      // menu is the command's, so the two cannot disagree about the floor.
      const own = ACTION_PLACE[door];
      if (own) a.place = { ...place, order: own.order };
    }
    if (isConfig(c)) a.gear = true;
    out.push(a);
    byKey.set(c.he, a);
    byKey.set(a.id, a);
  }
  for (const id of src.builtIns) {
    if (doors.has(id)) continue;
    const place = shellPlace(id);
    // An orphan is not placed here; `placement.test.mjs` names it. Placing it
    // under a fallback would be the habit `menus.ts`'s floor warned against.
    if (!place) continue;
    const a: PlacedAction = { id, place: { ...place }, kind: "shell" };
    if (LAUNCHER.has(id)) a.gear = true;
    out.push(a);
    byKey.set(id, a);
  }
  for (const m of src.macros) out.push({ id: m.id, place: { ...MACRO_PLACE }, kind: "macro", name: m.name });
  src.styles.forEach((s, i) =>
    out.push({ id: s.id, place: { ...STYLE_PLACE, face: true, order: i }, kind: "style", name: s.name }),
  );

  for (const [group, keys] of Object.entries(FACE)) {
    keys.forEach((k, i) => {
      const a = byKey.get(k);
      if (a && a.place.group === group && !a.gear) Object.assign(a.place, { face: true, order: i });
    });
  }
  for (const h of HOME) for (const k of [...h.face, ...h.more]) {
    const a = byKey.get(k);
    if (a) a.place.home = true;
  }
  // The look: an icon and a size, keyed by id or by the command's name.
  for (const a of out) {
    const key = (t: Readonly<Record<string, string>>) => t[a.id] ?? (a.command ? t[a.command.he] : undefined);
    const ic = key(ICON_OF);
    if (ic) a.place.icon = ic;
    const size = key(SIZE) as FaceSize | undefined;
    if (size) a.place.size = size;
  }
  // The rule, applied last so no table above can break it.
  for (const a of out) if (a.gear) a.place.face = false;

  // Menu order, then group order, then `order`, then declaration order — a
  // stable sort, so the registry's own order survives inside a group.
  const menuIx = (m: MenuId) => MENUS.indexOf(m);
  const groupIx = (p: Place) => GROUPS[p.menu].indexOf(p.group);
  // Settings rows sink to the end of their group; a launcher is the group's own
  // dialog — the Notes chooser — and keeps the place it was given.
  const tail = (a: PlacedAction) => Number(!!a.gear && !LAUNCHER.has(a.id));
  return out
    .map((a, i) => ({ a, i }))
    .sort(
      (x, y) =>
        menuIx(x.a.place.menu) - menuIx(y.a.place.menu) ||
        groupIx(x.a.place) - groupIx(y.a.place) ||
        tail(x.a) - tail(y.a) ||
        (x.a.place.order ?? 1e6) - (y.a.place.order ?? 1e6) ||
        x.i - y.i,
    )
    .map(({ a }) => a);
}

/** Resolve a `FACE` / `HOME` key to the id it is placed under. */
export function resolveKey(key: string, list: readonly PlacedAction[]): PlacedAction | undefined {
  return list.find((a) => a.id === key) ?? list.find((a) => a.command?.he === key);
}

/** The i18n key of a short label: `btn.<id>`, with `cmd:` dropped for engine commands. */
export function btnKey(a: Pick<PlacedAction, "id" | "command">): string {
  return "btn." + (a.command && a.id.startsWith("cmd:") ? a.command.he : a.id);
}

// ---------------------------------------------------------------- the menus

/**
 * The rows a menu draws that are not actions — a list, a box, a sentence.
 *
 * Named, so the parity fence can say every row the hand-written menus drew is
 * either a placed action or one of these, and a renderer can say how to draw
 * each. `before` rows open the group; `after` rows close it.
 *
 * - `openDocs`: the session's open documents, each with ⧉ and ⌄.
 * - `docsLegend`: what ⧉, ⌄ and × mean, drawn with the rows (#128).
 * - `library`: every document there is, each with ⧉ and ×.
 * - `templates`: the user's templates and the built-in ones.
 * - `pages`: the export menu's page-range box.
 * - `macroNone`: "no saved macros", when there are none.
 * - `contentsDepth`: how deep the contents goes, beside the row that makes one.
 */
export type MenuExtra = "openDocs" | "docsLegend" | "library" | "templates" | "pages" | "macroNone" | "contentsDepth";

export const MENU_EXTRAS: Readonly<Record<string, { before?: readonly MenuExtra[]; after?: readonly MenuExtra[] }>> = {
  library: { after: ["openDocs", "docsLegend", "library"] },
  templates: { after: ["templates"] },
  export: { before: ["pages"] },
  macros: { after: ["macroNone"] },
  indexes: { after: ["contentsDepth"] },
};

/** One menu: its groups in order, each with its rows. */
export interface MenuNode {
  menu: MenuId;
  groups: { group: string; items: PlacedAction[]; before: readonly MenuExtra[]; after: readonly MenuExtra[] }[];
}

/**
 * The menu bar, as a tree — menu → group → rows.
 *
 * A group with no rows and no extras is dropped (the bar shows no empty
 * heading); a group with only extras stays — Templates is all list.
 */
export function menuTree(list: readonly PlacedAction[]): MenuNode[] {
  return MENUS.map((menu) => ({
    menu,
    groups: GROUPS[menu]
      .map((group) => ({
        group,
        items: list.filter((a) => a.place.menu === menu && a.place.group === group),
        before: MENU_EXTRAS[group]?.before ?? [],
        after: MENU_EXTRAS[group]?.after ?? [],
      }))
      .filter((g) => g.items.length || g.before.length || g.after.length),
  }));
}

// ---------------------------------------------------------------- the tabs

/**
 * One group on a tab: its face buttons, what `⋯` opens, what `⚙` opens.
 *
 * `menu` is the group's menu home — where a writer who turns the tabs off finds
 * the same rows — and it is what `⋯` is: the rest of the section, not a second
 * list of it.
 */
export interface TabGroup {
  group: string;
  face: PlacedAction[];
  more: PlacedAction[];
  gear: PlacedAction[];
  /**
   * Home face keys that resolved to nothing: a command the registry did not
   * send. Drawn as a control that says so (#105), never dropped in silence.
   */
  missing: string[];
  /** The writer's name for the group (§8); absent, `grp.<group>` in the current language. */
  name?: string;
}

export interface TabNode {
  tab: TabId;
  groups: TabGroup[];
}

/**
 * The tab strip, as a tree — tab → group → face, `⋯`, `⚙` (§4 "Building").
 *
 * Every tab but Home is `TAB_GROUPS`, filled from the placed list; a group with
 * nothing on its face and nothing behind `⚙` still draws its `⋯`, so every
 * action a tab claims is one click away on it. Home is `HOME`, resolved against
 * the list — its groups are its own (§13) — and its styles group takes the
 * document's custom styles after the panel's face.
 *
 * Pure, like `menuTree`, and for the same reason: a fence can say what each tab
 * holds without a DOM.
 */
export function tabTree(list: readonly PlacedAction[]): TabNode[] {
  return TABS.map((tab) => ({ tab, groups: tab === "home" ? homeGroups(list) : tabGroups(tab, list) }));
}

/** Can one more face of this size go on a group that already has these. */
function roomFor(face: readonly PlacedAction[], a: PlacedAction): boolean {
  const n = (want: (s: FaceSize) => boolean) => face.filter((f) => want(f.place.size ?? "small")).length;
  const size = a.place.size ?? "small";
  if (size === "icon") return n((s) => s === "icon") < MAX_ICON_FACE;
  if (size === "large" && n((s) => s === "large") >= MAX_LARGE) return false;
  return n((s) => s !== "icon") < MAX_FACE;
}

function tabGroups(tab: Exclude<TabId, "home">, list: readonly PlacedAction[]): TabGroup[] {
  return TAB_GROUPS[tab]
    .map((group) => {
      const g: TabGroup = { group, face: [], more: [], gear: [], missing: [] };
      for (const a of list) {
        if (a.place.group !== group || tabOf(a.place) !== tab) continue;
        if (a.gear) g.gear.push(a);
        else if (a.place.face && roomFor(g.face, a)) g.face.push(a);
        else g.more.push(a);
      }
      g.face.sort((x, y) => (x.place.order ?? 1e6) - (y.place.order ?? 1e6));
      return g;
    })
    .filter((g) => g.face.length || g.more.length || g.gear.length);
}

function homeGroups(list: readonly PlacedAction[]): TabGroup[] {
  const resolve = (keys: readonly string[]) =>
    keys.map((k) => resolveKey(k, list)).filter((a): a is PlacedAction => !!a);
  return HOME.map((h) => ({
    group: h.group,
    face: [...resolve(h.face), ...(h.group === "styles" ? list.filter((a) => a.kind === "style").slice(0, MAX_FACE - 1) : [])],
    more: resolve(h.more),
    gear: [],
    missing: h.face.filter((k) => !resolveKey(k, list)),
  })).filter((g) => g.face.length || g.more.length || g.missing.length);
}

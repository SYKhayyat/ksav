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
  | "view"
  | "tools"
  | "help";

/** The tab strip. §5. */
export type TabId = "home" | "insert" | "layout" | "table" | "notes" | "sources" | "view";

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
  /** Defaults to `TAB_OF_MENU[menu]`, or to `GROUP_TAB[group]` when that says so. */
  tab?: TabId;
  /** Drawn as a named button on its tab; otherwise behind the group's `⋯`. */
  face?: boolean;
  /** Also on the Home tab. Set by `placed()` from `HOME`. */
  home?: boolean;
  /** Within the group. Otherwise registry / declaration order. */
  order?: number;
  /** An optional mark. On a tab the label is always drawn beside it. */
  glyph?: string;
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
  "view",
  "tools",
  "help",
];

/** The tab strip, in order. */
export const TABS: readonly TabId[] = ["home", "insert", "layout", "table", "notes", "sources", "view"];

/**
 * The tab each menu's actions appear on by default.
 *
 * Partial on purpose. File, Documents, Edit, Tools and Help are menus a writer
 * opens, not furniture a writer works from; what of them belongs on a tab is a
 * Home pick (undo, redo, find). Format has no tab of its own either: its text
 * and paragraph halves are Home, and its Page half is the Layout tab — which is
 * `GROUP_TAB`, below.
 */
export const TAB_OF_MENU: Readonly<Partial<Record<MenuId, TabId>>> = {
  insert: "insert",
  table: "table",
  notes: "notes",
  sources: "sources",
  view: "view",
};

/**
 * The sections of each menu, in order. Every `Place.group` is one of these,
 * and a group id is unique across the whole bar, so `grp.<id>` names it once.
 */
export const GROUPS: Readonly<Record<MenuId, readonly string[]>> = {
  file: ["fileOpen", "fileImport", "fileShare", "templates", "export", "fileHistory"],
  docs: ["library", "docTabs"],
  edit: ["undo", "find", "entity", "brackets", "spelling"],
  insert: ["headings", "lists", "blocks", "objects", "misc", "hidden"],
  format: ["font", "paragraph", "styles", "structure", "page", "breaks", "columns", "spacing"],
  table: ["table", "rowscols", "cells"],
  notes: ["notes", "endnotes", "sidenotes", "systems", "numbering", "refs", "review"],
  sources: ["sefer", "citations", "girsa", "indexes"],
  view: ["panes", "folding", "display", "interface"],
  tools: ["macros", "commandsGroup", "defer", "compile", "settingsGroup"],
  help: ["helpGroup"],
};

/**
 * The groups that leave their menu's tab for another.
 *
 * Format ▸ Page is the menu home of the Layout tab (§5): the page, its breaks,
 * its columns and its spacing are formatting, and a writer who turns the tabs
 * off finds them under Format.
 */
export const GROUP_TAB: Readonly<Record<string, TabId>> = {
  page: "layout",
  breaks: "layout",
  columns: "layout",
  spacing: "layout",
};

/** The menu that owns a group, read off `GROUPS`. */
export function menuOfGroup(group: string): MenuId | undefined {
  return MENUS.find((m) => GROUPS[m].includes(group));
}

/** The tab a place is drawn on, if any. */
export function tabOf(place: Place): TabId | undefined {
  return place.tab ?? GROUP_TAB[place.group] ?? TAB_OF_MENU[place.menu];
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
  review: { menu: "notes", group: "review" },
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
      ["table", ["טבלה"]],
      ["headings", []],
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
  newDoc: { menu: "docs", group: "docTabs", glyph: "＋" },
  open: { menu: "file", group: "fileOpen", glyph: "📂" },
  save: { menu: "file", group: "fileOpen", glyph: "💾" },
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
  print: { menu: "file", group: "export", glyph: "🖨" },
  snapshot: { menu: "file", group: "fileHistory", glyph: "📸" },
  history: { menu: "file", group: "fileHistory", glyph: "🕘" },
  gitPanel: { menu: "file", group: "fileHistory", glyph: "⎇" },
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
  undo: { menu: "edit", group: "undo", glyph: "↶" },
  redo: { menu: "edit", group: "undo", glyph: "↷" },
  find: { menu: "edit", group: "find", glyph: "🔍" },
  entitySelect: { menu: "edit", group: "entity", glyph: "⌖" },
  entityUnwrap: { menu: "edit", group: "entity", glyph: "⌫" },
  entityRemove: { menu: "edit", group: "entity", glyph: "✕" },
  healBrackets: { menu: "edit", group: "brackets" },
  moveOutOfBracket: { menu: "edit", group: "brackets" },
  moveOutOfBracketToNextLine: { menu: "edit", group: "brackets" },
  moveOutOfAllBrackets: { menu: "edit", group: "brackets" },
  spellSuggest: { menu: "edit", group: "spelling" },
  // Insert
  insertImage: { menu: "insert", group: "objects", face: true, glyph: "🖼" },
  insertFormula: { menu: "insert", group: "objects", face: true, glyph: "∑" },
  hideLine: { menu: "insert", group: "hidden", glyph: "⌫" },
  hideBlock: { menu: "insert", group: "hidden", glyph: "▨" },
  fold: { menu: "insert", group: "hidden", glyph: "▤" },
  // Format
  makeList: { menu: "format", group: "structure", glyph: "≔", order: -1 },
  stylesPanel: { menu: "format", group: "styles", glyph: "🎨" },
  sectionSetup: { menu: "format", group: "page", face: true, glyph: "▭", order: -1 },
  hiddenBreak: { menu: "format", group: "breaks", glyph: "⏎", order: -1 },
  // Notes
  tieredNote: { menu: "notes", group: "notes", face: true, glyph: "⁑" },
  notesChooser: { menu: "notes", group: "notes", glyph: "✻" },
  renumber: { menu: "notes", group: "numbering", face: true },
  renderNotes: { menu: "notes", group: "numbering" },
  markInsert: { menu: "notes", group: "review", face: true },
  markDelete: { menu: "notes", group: "review", face: true },
  addComment: { menu: "notes", group: "review", face: true },
  reviewPanel: { menu: "notes", group: "review" },
  // Sources
  citePhrase: { menu: "sources", group: "girsa", face: true, glyph: "⌕" },
  linkifyCitations: { menu: "sources", group: "girsa", face: true, glyph: "⚯" },
  refreshSources: { menu: "sources", group: "girsa", face: true, glyph: "↻" },
  hydra: { menu: "sources", group: "girsa" },
  // View
  "pane.swapLeft": { menu: "view", group: "panes" },
  "pane.swapRight": { menu: "view", group: "panes", face: true },
  "pane.swapUp": { menu: "view", group: "panes" },
  "pane.swapDown": { menu: "view", group: "panes" },
  minimap: { menu: "view", group: "panes", face: true },
  "pane.zoom": { menu: "view", group: "panes" },
  narrow: { menu: "view", group: "panes" },
  widen: { menu: "view", group: "panes" },
  isolate: { menu: "view", group: "panes" },
  outline: { menu: "view", group: "panes", glyph: "☰" },
  notesPane: { menu: "view", group: "panes" },
  marksPane: { menu: "view", group: "panes" },
  arrangement: { menu: "view", group: "panes" },
  foldAll: { menu: "view", group: "folding", face: true, glyph: "⊟" },
  unfoldAll: { menu: "view", group: "folding", face: true, glyph: "⊞" },
  prose: { menu: "view", group: "display", face: true },
  zoomIn: { menu: "view", group: "display", face: true },
  zoomOut: { menu: "view", group: "display", face: true },
  zoomReset: { menu: "view", group: "display" },
  revealCursor: { menu: "view", group: "display" },
  revealPlaces: { menu: "view", group: "display" },
  toggleTheme: { menu: "view", group: "interface", face: true, glyph: "◐" },
  toggleLang: { menu: "view", group: "interface", face: true },
  nikud: { menu: "view", group: "interface" },
  // Tools
  macroRecord: { menu: "tools", group: "macros", glyph: "⏺" },
  macroPlay: { menu: "tools", group: "macros", glyph: "▶" },
  palette: { menu: "tools", group: "commandsGroup", glyph: "⌘" },
  commandsDrawer: { menu: "tools", group: "commandsGroup" },
  deferJump: { menu: "tools", group: "defer" },
  deferHere: { menu: "tools", group: "defer" },
  deferRecall: { menu: "tools", group: "defer" },
  deferAll: { menu: "tools", group: "defer" },
  deferRecallAll: { menu: "tools", group: "defer" },
  deferSort: { menu: "tools", group: "defer" },
  compileNow: { menu: "tools", group: "compile" },
  settingsDrawer: { menu: "tools", group: "settingsGroup", glyph: "⚙" },
  // Help
  help: { menu: "help", group: "helpGroup", glyph: "?" },
  keysDrawer: { menu: "help", group: "helpGroup", glyph: "⌨" },
};

/**
 * The place of a generated shell action — the families `BUILT_IN` builds with
 * a `map`, whose ids are not worth writing out one by one.
 */
function familyPlace(id: string): Place | undefined {
  if (/^foldLevel\d+$/.test(id) || /^foldListDepth\d+$/.test(id)) return { menu: "view", group: "folding" };
  if (/^heading\./.test(id) || /^list\./.test(id)) return { menu: "format", group: "structure" };
  if (/^note\./.test(id)) return { menu: "notes", group: "notes" };
  if (id === "table.delete") return { menu: "table", group: "table" };
  if (/^table\.(row|col)/.test(id) || /^table\.(wider|narrower|equal|auto)/.test(id) || id === "table.headerRow")
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
  headings: ["שער", "תת_שער", "כותרת"],
  lists: ["רשימה", "ממוספרת", "ממוספרת_עברית"],
  blocks: ["ציטוט", "תיבה", "מקור"],
  misc: ["קו_מפריד", "חסר"],
  page: ["מקטע_עמוד", "כותרת_עליונה", "כותרת_תחתונה"],
  breaks: ["מעבר_עמוד", "מעבר_טור"],
  columns: ["טורים_בלוק"],
  spacing: ["מרווח", "הזחה"],
  table: ["טבלה"],
  rowscols: ["table.rowAbove", "table.rowBelow", "table.colBefore", "table.colAfter", "table.rowDelete", "table.colDelete"],
  cells: ["מיזוג", "כותרת_תא", "תא"],
  notes: ["הערה", "הערה_ב", "הערה_ג"],
  endnotes: ["הערתסיום", "הערות_בסוף"],
  sidenotes: ["עם_הערות_צד", "הערת_גיליון"],
  systems: ["ערוץ", "אזור", "הצג_אזור"],
  numbering: ["התחל_מספור", "המשך_מספור"],
  refs: ["הפניה", "סמן", "הפניה_להערה"],
  sefer: ["סימן", "סעיף", "אות", "דיבור_המתחיל"],
  citations: ["מראה_מקום", "ציון", "גמרא", "פסוק", "ציון_מקור"],
  indexes: ["תוכן", "מפתח_מקורות", "מפתח_ענינים", "ערך"],
};

/** The most face buttons a default group draws. */
export const MAX_FACE = 6;

/**
 * The Home tab: what a writer reaches for every minute (§5).
 *
 * A list of its own rather than a flag on each place, and this is the one
 * place the spec's record and the build differ (§13): Home's groups are not
 * the items' own groups — the headings sit with siman and seif under *מבנה*,
 * undo and redo are a group with no tab of their own — and a footnote is a face
 * button on Home while the endnote beside it is behind `⋯`, which is not what
 * the Notes tab says about either. `placed()` still sets `place.home` from this,
 * so a reader of one action can see that it is a Home pick.
 */
export const HOME: readonly { group: string; face: readonly string[]; more: readonly string[] }[] = [
  { group: "homeEdit", face: ["undo", "redo"], more: ["find"] },
  {
    group: "font",
    face: ["הדגשה", "נטוי", "קו_תחתון", "סימון", "גדול", "קטן"],
    more: [
      "קו_חוצה", "עילי", "תחתי", "רברבתי", "כתב_רשי", "צבע", "רקע", "גופן_שונה", "גודל_גופן",
      "מרווח_אותיות", "קוד", "עיצוב",
    ],
  },
  { group: "paragraph", face: ["ימין", "מרכז", "שמאל"], more: ["מימין_לשמאל", "משמאל_לימין"] },
  // The first custom styles are added at render time: they are the document's,
  // and `placed()` puts every style in this group (see `STYLE_PLACE`).
  { group: "styles", face: [], more: ["stylesPanel"] },
  { group: "homeStructure", face: ["כותרת1", "כותרת2", "כותרת3", "סימן", "סעיף"], more: ["אות", "דיבור_המתחיל", "שער", "תת_שער"] },
  { group: "homeNotes", face: ["הערה", "הערה_ב"], more: ["הערתסיום"] },
];

/** Home's own group ids — named like any group, owned by no menu. */
export const HOME_GROUPS: readonly string[] = ["homeEdit", "homeStructure", "homeNotes"];

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
      // A door that also has a hand-written place keeps it (its glyph, its order),
      // but the menu is the command's, so the two cannot disagree about the floor.
      const own = ACTION_PLACE[door];
      if (own) a.place = { ...place, glyph: own.glyph, order: own.order };
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
  // The rule, applied last so no table above can break it.
  for (const a of out) if (a.gear) a.place.face = false;

  // Menu order, then group order, then `order`, then declaration order — a
  // stable sort, so the registry's own order survives inside a group.
  const menuIx = (m: MenuId) => MENUS.indexOf(m);
  const groupIx = (p: Place) => GROUPS[p.menu].indexOf(p.group);
  return out
    .map((a, i) => ({ a, i }))
    .sort(
      (x, y) =>
        menuIx(x.a.place.menu) - menuIx(y.a.place.menu) ||
        groupIx(x.a.place) - groupIx(y.a.place) ||
        Number(!!x.a.gear) - Number(!!y.a.gear) ||
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

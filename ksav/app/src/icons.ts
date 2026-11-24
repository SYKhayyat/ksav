// The shell's icons (`docs/ui-architecture.md` §10).
//
// Tabler Icons (MIT), outline, 24-unit grid, 2-unit stroke, drawn with
// `stroke: currentColor` so they follow the theme. Only the ones named below are
// copied into `icons.gen.ts` by `tools/icons.mjs`; the Torah terms Tabler does
// not have are drawn on the same grid in `icons-ksav.ts`.
//
// `ICON_OF` is keyed the way `FACE` and `HOME` are — an action id or a command's
// Hebrew name — so the registry never has to know about icons, and `placed()`
// fills `Place.icon` from it.

import { TABLER } from "./icons.gen";
import { KSAV_ICONS } from "./icons-ksav";

/** A Tabler name, or `ksav:<name>` for one of ours. */
export type IconId = string;

// icons:begin — `tools/icons.mjs` reads every quoted Tabler name in this block.
export const ICON_OF: Readonly<Record<string, IconId>> = {
  // File
  newDoc: "file-plus",
  open: "folder-open",
  save: "device-floppy",
  saveAs: "file-export",
  print: "printer",
  exportPdf: "file-type-pdf",
  exportWord: "file-type-docx",
  exportHtml: "file-type-html",
  exportMarkdown: "markdown",
  exportText: "file-text",
  shareRead: "share",
  snapshot: "camera",
  history: "history",
  gitPanel: "git-branch",
  // Edit
  undo: "arrow-back-up",
  redo: "arrow-forward-up",
  paste: "clipboard",
  cut: "scissors",
  copy: "copy",
  find: "search",
  replace: "replace",
  // Font
  הדגשה: "bold",
  נטוי: "italic",
  קו_תחתון: "underline",
  קו_חוצה: "strikethrough",
  סימון: "highlight",
  צבע: "text-color",
  עילי: "superscript",
  תחתי: "subscript",
  גדול: "text-increase",
  קטן: "text-decrease",
  קוד: "code",
  // Paragraph
  ימין: "align-right",
  מרכז: "align-center",
  שמאל: "align-left",
  מימין_לשמאל: "text-direction-rtl",
  משמאל_לימין: "text-direction-ltr",
  // Styles and structure
  stylesPanel: "typography",
  כותרת1: "h-1",
  כותרת2: "h-2",
  כותרת3: "h-3",
  כותרת: "heading",
  שער: "book-2",
  תת_שער: "book",
  סימן: "ksav:siman",
  סעיף: "ksav:seif",
  אות: "ksav:ot",
  דיבור_המתחיל: "ksav:dibur",
  // Insert
  טבלה: "table",
  insertImage: "photo",
  insertFormula: "math-function",
  רשימה: "list",
  ממוספרת: "list-numbers",
  ממוספרת_עברית: "list-letters",
  ציטוט: "blockquote",
  תיבה: "square",
  מקור: "quote",
  קו_מפריד: "separator-horizontal",
  חסר: "dots",
  כלול: "file-import",
  // Layout
  sectionSetup: "file",
  מקטע_עמוד: "file",
  כותרת_עליונה: "layout-navbar",
  כותרת_תחתונה: "layout-bottombar",
  מעבר_עמוד: "page-break",
  מעבר_טור: "columns",
  טורים_בלוק: "columns-2",
  מרווח: "line-height",
  הזחה: "indent-increase",
  // Notes
  הערה: "ksav:note",
  הערה_ב: "ksav:note",
  הערה_ג: "ksav:note",
  tieredNote: "ksav:tiered",
  הערתסיום: "file-dots",
  הערות_בסוף: "file-dots",
  עם_הערות_צד: "layout-sidebar-right",
  הערת_גיליון: "sticker",
  התחל_מספור: "list-numbers",
  המשך_מספור: "list-check",
  renumber: "rotate-clockwise",
  הפניה: "link",
  סמן: "bookmark",
  הפניה_להערה: "link",
  // Sources
  מראה_מקום: "ksav:mareh",
  ציון: "ksav:mareh",
  גמרא: "ksav:gemara",
  פסוק: "ksav:pasuk",
  citePhrase: "zoom-question",
  linkifyCitations: "link",
  refreshSources: "refresh",
  תוכן: "list-tree",
  מפתח_מקורות: "list-search",
  מפתח_ענינים: "list-search",
  ערך: "keyframes",
  // Review
  spellSuggest: "text-spellcheck",
  addComment: "message",
  reviewPanel: "messages",
  markInsert: "pencil-plus",
  markDelete: "pencil-minus",
  compare: "git-compare",
  // View
  outline: "list-tree",
  notesPane: "notes",
  marksPane: "bookmarks",
  notesChooser: "ksav:note",
  arrangement: "layout-columns",
  "pane.swapRight": "arrows-exchange",
  minimap: "map",
  foldAll: "fold-up",
  unfoldAll: "fold-down",
  zoomIn: "zoom-in",
  zoomOut: "zoom-out",
  palette: "command",
  commandsDrawer: "command",
  macroRecord: "player-record",
  macroPlay: "player-play",
  ribbonCustomize: "adjustments",
  ribbonCollapse: "chevron-up",
  // Settings and help
  settingsDrawer: "settings",
  help: "help-circle",
  keysDrawer: "keyboard",
  toggleTheme: "sun",
  toggleLang: "language",
  prose: "article",
  nikud: "ksav:nikud",
};

/** Icons the shell draws that are not an action's. */
export const UI_ICONS = {
  menu: "menu-2",
  collapse: "chevron-up",
  expand: "chevron-down",
  dropdown: "chevron-down",
  more: "dots",
  launcher: "arrow-down-right",
  back: "arrow-left",
  info: "info-circle",
  settings: "settings",
  moon: "moon",
  sun: "sun",
  stop: "player-stop",
  record: "player-record",
  code: "code",
  prose: "article",
  files: "files",
  template: "template",
  palette: "paint",
  // The backstage's column (§6), one per section.
  fileNew: "file-plus",
  fileOpen: "folder-open",
  fileSave: "device-floppy",
  fileShare: "share",
  fileExport: "file-export",
  filePrint: "printer",
  fileVersions: "history",
} as const;
// icons:end

const SVG = "http://www.w3.org/2000/svg";

/** The drawing of an icon: Tabler's node list, or ours. */
export function iconNodes(id: IconId): readonly (readonly [string, Readonly<Record<string, string>>])[] | undefined {
  return id.startsWith("ksav:") ? KSAV_ICONS[id.slice(5)] : TABLER[id];
}

/** Is there a drawing for this id. A fence asserts every id in `ICON_OF` has one. */
export function hasIcon(id: IconId): boolean {
  return !!iconNodes(id);
}

/**
 * An `<svg>` for an icon, `px` square, decorative (`aria-hidden`): the button it
 * sits in carries the name.
 */
export function icon(id: IconId, px = 16): Element {
  const svg = document.createElementNS(SVG, "svg");
  const attrs: Record<string, string> = {
    class: "ico",
    width: String(px),
    height: String(px),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
    "data-icon": id,
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const [tag, a] of iconNodes(id) ?? []) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
    svg.append(n);
  }
  return svg;
}

// The writer's preferences, and the presets that overwrite them.
//
// These are app settings, not document settings — everything that describes how
// *this person* likes to work, plus the page setup that goes on the compile
// request. They are small, they must be readable synchronously while the chrome
// is being built, and losing them costs nothing but a re-tick, so localStorage
// is exactly right for them. (Documents are another matter entirely; see
// `store.ts` for why they are not here.)

import type { DocConfig } from "./api";
import type { Lang } from "./i18n";

export type Layout = "two" | "page" | "source";
export type PreviewSide = "left" | "right" | "top" | "bottom";

export interface Settings extends DocConfig {
  lang: Lang;
  theme: "light" | "dark";
  layout: Layout;
  previewSide?: PreviewSide; // which side the preview sits on in split view
  previewFrac?: number; // fraction of the split given to the preview (0–1)
  prose: boolean;
  zoom: number;
  outline?: boolean;
  nikud?: boolean;
  autocomplete?: boolean;
  spellcheck?: boolean;
  syncScroll?: boolean;
  autosaveFile?: boolean; // write back to the bound file on a timer, not only on Ctrl+S
  customCommands?: string; // user #let definitions, prepended at compile
  snippets?: string; // "abbrev = expansion" per line, expanded on Tab
  keybindings?: Record<string, string>; // action id -> key combo override
  reviewer?: string; // the name that goes on this person's review comments
}

/** The font families the engine bundles. Anything else must be attached to the
 *  document (see `addFont`) — there is no system font access from wasm. */
export const BUNDLED_FONTS = ["Frank Ruhl Hofshi", "David Libre", "Cascadia Mono"];

export const DEFAULTS: Settings = {
  lang: "he",
  theme: "light",
  layout: "two",
  previewSide: "left",
  previewFrac: 0.5,
  // Prose is the default view. Ksav is pitched as a replacement for Word, and
  // opening a Word replacement in raw markup asks the writer to learn a syntax
  // before they can type a sentence. Alt still reveals the markup, and the
  // ＃ toggle in the header switches permanently — the markup is one key away,
  // which is the right distance for the people who want it.
  prose: true,
  zoom: 1,
  font: "Frank Ruhl Hofshi",
  size_pt: 12,
  margin_cm: 2.5,
  dir: "rtl",
  numbering: true,
  justify: true,
  line_spacing_em: 0.75,
  para_spacing_em: 1.2,
  first_line_indent_em: 0,
  columns: 1,
  paper: "a4",
  hebrew_numbering: false,
  header: "",
  footer: "",
  autocomplete: true,
  spellcheck: true,
  syncScroll: true,
  autosaveFile: true,
};

const KEY = "ksav.settings";

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    if ((s.layout as string) === "one") s.layout = "source"; // migrate old value
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

/** The live settings object. Mutated in place; call `saveSettings` after. */
export const settings: Settings = loadSettings();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Preferences are worth a lot less than text. If storage is full the save
    // path says so far more usefully than a silently-reverted toggle would.
  }
}

/** The page-setup subset that goes on a compile request. */
export function docConfig(): DocConfig {
  return {
    font: settings.font,
    size_pt: settings.size_pt,
    margin_cm: settings.margin_cm,
    dir: settings.dir,
    numbering: settings.numbering,
    justify: settings.justify,
    line_spacing_em: settings.line_spacing_em,
    para_spacing_em: settings.para_spacing_em,
    first_line_indent_em: settings.first_line_indent_em,
    columns: settings.columns,
    paper: settings.paper,
    hebrew_numbering: settings.hebrew_numbering,
    header: settings.header,
    footer: settings.footer,
  };
}

// ---------------------------------------------------------------- presets
//
// Document skins: one-click presets that restyle the document (font, size,
// margins, spacing, numbering).

export const SKINS: Record<string, Partial<Settings>> = {
  sefer: { font: "Frank Ruhl Hofshi", size_pt: 13, margin_cm: 3, line_spacing_em: 0.7, justify: true, hebrew_numbering: true, numbering: true, paper: "a4" },
  modern: { font: "David Libre", size_pt: 12, margin_cm: 2.5, line_spacing_em: 0.95, justify: false, hebrew_numbering: false, numbering: true },
  letter: { font: "Frank Ruhl Hofshi", size_pt: 12, margin_cm: 3, line_spacing_em: 0.85, justify: true, hebrew_numbering: false, numbering: false },
  plain: { font: "Frank Ruhl Hofshi", size_pt: 12, margin_cm: 2.5, line_spacing_em: 0.75, justify: true, hebrew_numbering: false, numbering: true, header: "", footer: "" },
};

/**
 * The settings a preset replaced, so it can be undone.
 *
 * A skin used to `Object.assign` straight over your settings: choose one and
 * your font was gone, with nothing to say it had happened and no way back. A
 * preset is a starting point, not a one-way door.
 */
export interface StyleUndo {
  name: string;
  before: Partial<Settings>;
}

let styleUndo: StyleUndo | null = null;

export function pendingUndo(): StyleUndo | null {
  return styleUndo;
}

/** Apply a preset, remembering exactly what it displaced. */
export function applyPreset(name: string) {
  const preset = SKINS[name];
  const before: Partial<Settings> = {};
  for (const k of Object.keys(preset) as (keyof Settings)[]) {
    (before as Record<string, unknown>)[k] = settings[k];
  }
  styleUndo = { name, before };
  Object.assign(settings, preset);
  saveSettings();
}

/** Put back whatever the last preset displaced. */
export function undoPreset(): boolean {
  if (!styleUndo) return false;
  Object.assign(settings, styleUndo.before);
  styleUndo = null;
  saveSettings();
  return true;
}

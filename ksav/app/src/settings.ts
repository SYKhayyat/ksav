// The writer's preferences, and the presets that overwrite them.
//
// These are app settings, not document settings — everything that describes how
// *this person* likes to work, plus the page setup that goes on the compile
// request. They are small, they must be readable synchronously while the chrome
// is being built, and losing them costs nothing but a re-tick, so localStorage
// is exactly right for them. (Documents are another matter entirely; see
// `store.ts` for why they are not here.)

import type { DocConfig } from "./api";
import { DOC_DEFAULTS } from "./engine.gen";
import * as runtime from "./runtime";
import type { Lang } from "./i18n";

export type Layout = "two" | "page" | "source";
export type PreviewSide = "left" | "right" | "top" | "bottom";

// `DocConfig` also has a `lang` — the language the *document* is written in —
// and it is deliberately not inherited here. `settings.lang` is the language of
// the interface, which is a different choice: a Hebrew speaker may well write an
// English document, and conflating the two would silently typeset it wrong. The
// document language is left to the engine, which reads it off the direction.
export interface Settings extends Omit<DocConfig, "lang"> {
  lang: Lang;
  theme: "light" | "dark";
  layout: Layout;
  previewSide?: PreviewSide; // which side the preview sits on in split view
  previewFrac?: number; // fraction of the split given to the preview (0–1)
  prose: boolean;
  zoom: number;
  // Fit the page to the preview pane, which is what Word does and the reason
  // nobody meets the 1366×768 overflow there. When on, `zoom` is not consulted.
  fitWidth?: boolean;
  outline?: boolean;
  /** The notes pane — Word's navigation pane, for the document's notes. */
  notesPane?: boolean;
  nikud?: boolean;
  autocomplete?: boolean;
  spellcheck?: boolean;
  syncScroll?: boolean;
  autosaveFile?: boolean; // write back to the bound file on a timer, not only on Ctrl+S
  customCommands?: string; // user #let definitions, prepended at compile
  snippets?: string; // "abbrev = expansion" per line, expanded on Tab
  keybindings?: Record<string, string>; // action id -> key combo override
  reviewer?: string; // the name that goes on this person's review comments
  // Write note bodies at the end of the file (the org-mode arrangement) instead
  // of inline. A habit, not a document property — the page is identical either
  // way — so it belongs to the person and has to outlive the tab.
  deferNoteBodies?: boolean;
  // Per-operation hydra key overrides, `{"table.rowDelete": "r"}`. Generated
  // keys are deterministic; this is how a writer overrules one, the same way
  // `keybindings` overrules a shortcut.
  hydraKeys?: Record<string, string>;
  // Recorded macros. A property of the person: they travel with the writer, not
  // with any one sefer.
  macros?: unknown;
  // Modal editing, for the people who cannot type without it. A property of the
  // person, not of the sefer — a document opened on someone else's machine must
  // not put them into vim.
  editingMode?: "default" | "vim" | "emacs";
  // Dim everything but the paragraph being written, and keep the caret line
  // vertically centred.
  focusMode?: boolean;
  typewriter?: boolean;
  // Ask GitHub once a day whether there is a newer release. Desktop only, and
  // the request carries nothing — no identity, no version, no document.
  checkUpdates?: boolean;
}

/** The font families the engine bundles. Anything else must be attached to the
 *  document (see `addFont`) — there is no system font access from wasm.
 *
 *  Re-exported from the generated table rather than listed: the font menu and
 *  the licence notice are the same set of embedded files seen from two ends, and
 *  the engine is the end that actually embeds them. */
export { BUNDLED_FONTS } from "./engine.gen";

export const DEFAULTS: Settings = {
  // Everything that goes on the compile request, exactly as the engine's own
  // `DocConfig::default()` states it.
  //
  // This used to be twenty-odd values typed out a second time, and the way that
  // fails is quiet rather than loud: the Rust value always wins on the wire, so
  // a default changed in one place leaves the app's sliders reading one number
  // while the page is laid out to another. The four per-edge margins and the
  // note region stay absent — absent means "follow margin_cm" and "decide from
  // the document", which is a different instruction from any number, so moving
  // the one margin slider still moves all four.
  ...DOC_DEFAULTS,
  // Copied, not aliased: `DOC_DEFAULTS` is frozen-by-convention and shared, and
  // one document adding a PDF keyword must not add it to the defaults every
  // other document is built from.
  keywords: [...DOC_DEFAULTS.keywords],
  // Two-sided is off, so a document that nobody binds is laid out symmetrically
  // and every existing file opens exactly as it did.
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
  fitWidth: true,
  editingMode: "default",
  focusMode: false,
  typewriter: false,
  checkUpdates: true,
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
/**
 * The page-setup fields, as opposed to the fields about the application (B26).
 *
 * The split this list *is*: font, paper, margins and direction are facts about a
 * document. Theme, zoom, which side the preview sits on and whether spell-check is
 * on are facts about the person sitting in front of it. They lived in one object,
 * so opening an English document and then a Hebrew one meant changing the
 * direction by hand — and `fixes.md` had already called this *"the real fix and a
 * larger change than anything in this file."*
 */
export const PAGE_FIELDS = [
  "font",
  "size_pt",
  "margin_cm",
  "dir",
  "numbering",
  "justify",
  "line_spacing_em",
  "para_spacing_em",
  "first_line_indent_em",
  "columns",
  "paper",
  "hebrew_numbering",
  "header",
  "footer",
  // Two-sided page setup. Every one of these describes the *sefer* — how it will
  // be bound, what runs across the top of a left-hand page — so they belong to
  // the document exactly as the margin does, and travel with the file.
  "margin_top_cm",
  "margin_bottom_cm",
  "margin_inner_cm",
  "margin_outer_cm",
  "gutter_cm",
  "two_sided",
  "header_even",
  "header_odd",
  "footer_even",
  "footer_odd",
  "head_align",
  // Metadata and the export standard: also facts about the document, not about
  // the machine it is being written on. `pdf_pages` is deliberately absent —
  // "just pages 4 to 9" is a property of one export, not of the sefer.
  "title",
  "author",
  "keywords",
  "pdf_standard",
  "pdf_tagged",
  "prevent_orphans",
] as const;

/** A document's own page setup, where it has said anything (B26). */
export type PageSetup = Partial<Pick<DocConfig, (typeof PAGE_FIELDS)[number]>>;

/**
 * How a document is actually laid out: what it says about itself, over a default
 * for everything it does not (B26).
 *
 * Field by field and not all-or-nothing, so a document that only ever said
 * *ltr* keeps following the app's font — and so a field added to `DocConfig` next
 * year does not make every document saved this year unopenable.
 *
 * A pure function of its two arguments, which is the point: the migration
 * question — *what happens to a document saved before page setup was a property of
 * documents* — is answered by what the caller passes as `fallback`, and it is
 * answered in one place.
 */
export function pageSetup(own: PageSetup | undefined, fallback: DocConfig): DocConfig {
  const out = { ...fallback };
  if (!own) return out;
  for (const key of PAGE_FIELDS) {
    const value = own[key];
    // `undefined` means *this document has not said*; `""` for a header and `0`
    // for an indent are things it said, and must not fall through to a default.
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/**
 * The page-setup fields of any object that carries them.
 *
 * Written as one pick over `PAGE_FIELDS` rather than as two hand-listed object
 * literals, because those literals were a third place a new field had to be
 * remembered — and the failure of forgetting is silent: the field simply never
 * reaches a new document, and the writer's setting appears not to stick.
 */
function pickPageFields(src: Partial<DocConfig>): DocConfig {
  const out: Record<string, unknown> = {};
  for (const key of PAGE_FIELDS) {
    const value = (src as Record<string, unknown>)[key];
    // An absent optional field stays absent: `pageSetup` reads `undefined` as
    // "this document has not said", and writing the key with an undefined value
    // would say it in a way that JSON then drops anyway.
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as DocConfig;
}

/** What a fresh document is laid out like, before anybody edits it (B26). */
export function defaultPageSetup(): DocConfig {
  return pickPageFields(DEFAULTS);
}

/** The page setup the app is set to hand a **new** document (B26). */
export function settingsPageSetup(): DocConfig {
  return pickPageFields(settings);
}

/**
 * Which page setup a document is compiled with.
 *
 * Its own, over the **shipped defaults** — not over whatever the app's settings
 * happen to say now. A document saved before B26 has no page setup of its own, and
 * laying it out by the current global settings would mean the same file rendering
 * differently on two machines, which is the bug this order is fixing rather than a
 * gentler version of it. Everything in a page setup is one panel away from being
 * changed.
 */
export function docConfig(): DocConfig {
  return pageSetup(runtime.currentDoc?.config, defaultPageSetup());
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
  /** What **this document** said before the skin, so the undo puts it back on the
   * document and not on the application (B26). */
  before: PageSetup;
}

let styleUndo: StyleUndo | null = null;

export function pendingUndo(): StyleUndo | null {
  return styleUndo;
}

/** Apply a preset, remembering exactly what it displaced. */
/**
 * A skin restyles the **document** (B26).
 *
 * Every field a skin sets is page setup — font, size, margins, spacing,
 * numbering, paper — so after B26 they all belong to the sefer in front of the
 * writer rather than to the application. Applying `sefer` to one document used to
 * restyle every document they owned, which is the seam B26 is about, in the one
 * feature whose whole purpose is restyling a document.
 *
 * The undo keeps what **this** document said, for the same reason.
 */
export function applyPreset(name: string, onto: (change: PageSetup) => void) {
  const preset = SKINS[name];
  const live = docConfig() as unknown as Record<string, unknown>;
  const before: PageSetup = {};
  const change: PageSetup = {};
  for (const key of Object.keys(preset) as (keyof Settings)[]) {
    if (!(PAGE_FIELDS as readonly string[]).includes(key as string)) continue;
    (before as Record<string, unknown>)[key] = live[key as string];
    (change as Record<string, unknown>)[key] = (preset as Record<string, unknown>)[key];
  }
  styleUndo = { name, before };
  onto(change);
}

/** Put back whatever the last preset displaced, on the document it displaced it in. */
export function undoPreset(onto: (change: PageSetup) => void): boolean {
  if (!styleUndo) return false;
  onto(styleUndo.before as PageSetup);
  styleUndo = null;
  return true;
}

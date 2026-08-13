// What the header says about the state of the application — decided here,
// drawn by the shell.
//
// # Why this module exists
//
// `buildHeader` was two hundred lines of `main.ts` and every one of the twenty
// chips in it made the same three decisions inline: which glyph to show for the
// state, what to call it, and whether it is on, off or unavailable. Twenty
// times, in a file no test can import.
//
// That is the exact shape this repository's bug family takes — a working engine
// behind a surface that reports on it wrongly — and the chipbar is where it does
// the most damage, because a chip *is* the report. A toggle showing the sun
// while the theme is dark is not a cosmetic fault; it is the interface lying
// about the setting it exists to display. `previewSideToggle` is the case that
// proves the family: it passed `"chip disabled"`, the stylesheet greyed it, and
// the button clicked, saved a setting and rebuilt the chrome anyway. That was
// fixed in `dom.ts` — `iconBtn` reads the class and sets the real attribute —
// but nothing could say *when* a chip should be disabled, because the answer
// lived in the god-file.
//
// # The split
//
// [`chips`] is a pure function of the state the header displays. It returns
// twenty descriptions: an id, a glyph, a resolved title, and two booleans. The
// shell maps each to `iconBtn` and wires the click. Same for the three menus,
// which had their own inline decisions — whether "Save as…" or "Save a copy…",
// whether the templates menu needs a separator, and the nine export items whose
// `data-export` keys are what `acceptance.mjs` clicks.
//
// Titles are resolved here rather than returned as keys, because half of them
// are *compositions* — `${t("layout")}: ${t("mode.two")}` — and a composition
// left to the caller is a decision left in the god-file. `i18n.ts` is a pure
// module; a test sets the language and reads the string a writer would see.

import { t, getLang } from "./i18n";
import type { Settings } from "./settings";

/**
 * Every chip, by name.
 *
 * A union and not a `string`, so that the shell's table of what each one *does*
 * is checked against this list by the compiler. The two halves are the decision
 * and the effect, they are deliberately in different files, and a chip described
 * here with nothing to run — or a handler for a chip that no longer exists — is
 * a `tsc` error rather than an `onClick` of `undefined` that throws on the first
 * press and nowhere before it.
 */
export type ChipId =
  | "undo"
  | "redo"
  | "styles"
  | "find"
  | "outline"
  | "notesChooser"
  | "notesPane"
  | "marksPane"
  | "review"
  | "commands"
  | "language"
  | "foldAll"
  | "unfoldAll"
  | "prose"
  | "arrangement"
  | "theme"
  | "nikud"
  | "history"
  | "record"
  | "help"
  | "settings";

/** One control in the chipbar. */
export interface Chip {
  /**
   * A stable name, across languages and themes.
   *
   * Every control in this chrome is a glyph with a localised tooltip, so
   * without this the only way to find one from outside is `title*="…"` — a
   * selector that works in Hebrew and silently matches nothing in English.
   */
  id: ChipId;
  glyph: string;
  /** The tooltip and the accessible name, resolved in the current language. */
  title: string;
  /** The setting this chip shows is on. */
  active?: boolean;
  /** Not available in this state. `iconBtn` turns this into the real attribute. */
  disabled?: boolean;
}

/**
 * Everything the header displays.
 *
 * The fields it needs off `Settings`, plus the two pieces of live state that are
 * not settings. Named rather than taking `Settings` whole so that a test states
 * the world in one line and so that adding a setting cannot silently change what
 * the header shows.
 */
export interface HeaderState {
  theme: Settings["theme"];
  prose: boolean;
  /** Which shipped arrangement the pane tree is, if it is one of them. */
  arrangement: string | null;
  outline: boolean;
  nikud: boolean;
  notesPane: boolean;
  marksPane: boolean;
  /** Recording a macro. A mode with no indicator is a mode people leave on. */
  recording: boolean;
}


/**
 * The chipbar, in order.
 *
 * The order is the one a writer's hand learns, so it is data rather than twenty
 * variables and a list of their names at the bottom of a function — which is
 * what it was, and which is how `previewSideToggle` came to be declared
 * eighteen lines from where it was used.
 */
export function chips(s: HeaderState): Chip[] {
  const lang = getLang();
  const dark = s.theme !== "light";
  return [
    { id: "undo", glyph: "↶", title: t("sc.undo") },
    { id: "redo", glyph: "↷", title: t("sc.redo") },
    { id: "styles", glyph: "🎨", title: t("stylesTitle") },
    { id: "find", glyph: "🔍", title: t("find") },
    { id: "outline", glyph: "☰", title: t("outline"), active: s.outline },
    { id: "notesChooser", glyph: "✻", title: t("notesChooser") },
    { id: "notesPane", glyph: "†☰", title: t("sc.notesPane"), active: s.notesPane },
    // The third list. Its glyph is a mark and a list, the way the notes pane's is
    // a dagger and a list: the chipbar says which list, not that there is one.
    { id: "marksPane", glyph: "◆☰", title: t("sc.marksPane"), active: s.marksPane },
    { id: "review", glyph: "✎", title: t("reviewTitle") },
    // Every command there is, grouped and searchable. The glyph is `#`, which is
    // the character a writer types to start one — the four surfaces that already
    // advertised the registry were a menu, a modal, a completion popup and a
    // help page, and none of them was a door labelled with the thing itself.
    { id: "commands", glyph: "#", title: t("commandsTitle") },
    // The glyph is the language you would switch *to*, which is the one thing a
    // reader who cannot read the current one can still act on.
    { id: "language", glyph: lang === "he" ? "EN" : "עב", title: t("language") },
    { id: "foldAll", glyph: "⊟", title: t("foldAll") },
    { id: "unfoldAll", glyph: "⊞", title: t("unfoldAll") },
    // Prose mode hides the markup. The glyph and the tooltip both name the mode
    // the button switches *to*, and they have to agree: `🅐` with "prose" would
    // be a button that says it does the thing it undoes.
    {
      id: "prose",
      glyph: s.prose ? "🅐" : "＃",
      title: s.prose ? t("raw") : t("prose"),
      active: s.prose,
    },
    // **One chip, and it opens a picker.**
    //
    // There were two here, and both *cycled*: `layout` through three fixed
    // arrangements and `previewSide` through four positions. The margin comment
    // was the same on each — *"I don't like cycles, I like that people can pick
    // which they want"* — and it is right for a reason worth writing down: a
    // cycle is a picker with the choices hidden and the wrong ones on the way to
    // the right one. Seven presses to see four options and get back where you
    // started is not a control, it is a puzzle.
    //
    // Both are gone. The window is a tree of panes, so an arrangement is
    // something you built or something this application ships, and either way it
    // is chosen rather than arrived at. Which side the preview sits on stopped
    // being a setting at all: it is which child of a split it is, and dragging a
    // splitter or splitting a pane says it directly.
    { id: "arrangement", glyph: "▥", title: t("arrangement") },
    // The sun and the moon name the theme you would switch to, like the language
    // chip. Anything is defensible here as long as it is one rule.
    { id: "theme", glyph: dark ? "☀" : "🌙", title: t("theme") },
    { id: "nikud", glyph: "אָ", title: t("nikud"), active: s.nikud },
    { id: "history", glyph: "🕐", title: t("history") },
    {
      id: "record",
      glyph: s.recording ? "⏹" : "⏺",
      title: s.recording ? t("macroStop") : t("macroRecord"),
      active: s.recording,
    },
    { id: "help", glyph: "?", title: t("help") },
    { id: "settings", glyph: "⚙", title: t("settings") },
  ];
}

/** One row of a header menu. */
export interface MenuRow {
  /**
   * What this row is, stable across languages.
   *
   * For the export menu it is also the `data-export` attribute, which is what
   * `.github/scripts/acceptance.mjs` clicks — a menu of nine localised strings
   * is otherwise unaddressable from outside.
   */
  id: string;
  label: string;
  /** The quieter second line, for a template's description. */
  desc?: string;
  /** This row can be deleted, and carries a × that does it. */
  removable?: boolean;
}

/** A separator between two blocks of a menu. */
export type MenuEntry = MenuRow | { sep: true };

/** Is a row a row, or the line between two of them? */
export function isSep(e: MenuEntry): e is { sep: true } {
  return "sep" in e;
}

/**
 * The File menu.
 *
 * `realFiles` is `files.supportsRealFiles()`: with the File System Access API
 * the last item saves *to a file the writer keeps*, and without it the browser
 * can only push a copy into the downloads folder. Calling both of those "Save
 * as…" would promise a binding that is not going to exist.
 */
export function fileItems(realFiles: boolean): MenuEntry[] {
  return [
    { id: "newDoc", label: t("newDoc") },
    { id: "open", label: t("open") },
    { id: "save", label: t("save") },
    { id: "saveAs", label: realFiles ? t("saveAs") : t("saveCopy") },
    { id: "importWord", label: t("importWord") },
    { id: "shareRead", label: t("shareRead") },
    { id: "shareReview", label: t("shareReview") },
    { id: "saveAsTemplate", label: t("saveAsTemplate") },
  ];
}

/**
 * The Export menu — nine items, every one addressable.
 *
 * Nine, not one. A menu where only the item under test can be found is a menu
 * that will grow a tenth item nothing can reach; the ids are the i18n keys,
 * which are already each item's identifier, so no second vocabulary was invented
 * for this.
 */
export const EXPORTS = [
  "exportPdf",
  "exportPdfPages",
  "exportWord",
  "copyForWord",
  "exportHtml",
  "exportMarkdown",
  "exportText",
  "exportTypst",
  "print",
] as const;

export function exportItems(): MenuRow[] {
  return EXPORTS.map((id) => ({ id, label: t(id) }));
}

/** A template as the menu needs it, whichever of the two kinds it is. */
export interface TemplateChoice {
  id: string;
  he: string;
  en: string;
  desc_he?: string;
  desc_en?: string;
}

/**
 * The Templates menu: the shipped starters, then the writer's own.
 *
 * The separator exists only when there is something on both sides of it. A menu
 * that draws a divider under its last item looks like a menu that failed to
 * load the rest.
 */
export function templateItems(
  builtin: readonly TemplateChoice[],
  yours: readonly { id: string; name: string }[],
): MenuEntry[] {
  const lang = getLang();
  const out: MenuEntry[] = builtin.map((tpl) => ({
    id: tpl.id,
    label: lang === "he" ? tpl.he : tpl.en,
    desc: (lang === "he" ? tpl.desc_he : tpl.desc_en) ?? "",
  }));
  if (builtin.length && yours.length) out.push({ sep: true });
  for (const ut of yours) out.push({ id: ut.id, label: "★ " + ut.name, removable: true });
  return out;
}

/**
 * The open document's name, and what a screen reader is told the button does.
 *
 * A writing tool with a library has to say, at all times, which document you are
 * in — and the button renames it, so its accessible name has to be the action
 * *and* the subject. `aria-label` of "rename" alone announces twenty controls
 * that all say "rename".
 */
export function docTitle(
  title: string | undefined,
  file: string | undefined,
): { title: string; file: string; label: string } {
  const name = title ?? "";
  return { title: name, file: file ?? "", label: `${t("rename")}: ${name}` };
}

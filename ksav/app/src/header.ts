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
// behind a surface that reports on it wrongly — and the frame's toggles are where
// it does the most damage, because a toggle *is* the report. A toggle showing the sun
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
// [`chips`] is a pure function of the state the frame displays. It returns the
// controls of the title row and the status bar: an id, where it lives, an
// icon, a resolved title, and two booleans. The shell maps each to `iconBtn`
// and wires the click. Same for the menus, which had their own inline
// decisions — whether "Save as…" or "Save a copy…", whether the templates menu
// needs a separator, and the export items whose `data-export` keys are what
// `acceptance.mjs` clicks.
//
// Titles are resolved here rather than returned as keys, because half of them
// are *compositions* — `${t("layout")}: ${t("mode.two")}` — and a composition
// left to the caller is a decision left in the god-file. `i18n.ts` is a pure
// module; a test sets the language and reads the string a writer would see.

import { t, getLang } from "./i18n";
import type { Settings } from "./settings";
import type { IconId } from "./icons";

/**
 * Every verb the header runs, by name.
 *
 * A union and not a `string`, so that the shell's table of what each one *does*
 * (`CHIP_RUN`) is checked against this list by the compiler. Ten of them are
 * drawn as controls in the window ([`chips`]); the rest are the panels the
 * ribbon opens by action id, run through the same table because the action
 * table cannot import the panels without closing a cycle through the shell.
 */
export type ChipId =
  | "save"
  | "undo"
  | "redo"
  | "styles"
  | "outline"
  | "notesPane"
  | "marksPane"
  | "review"
  | "git"
  | "language"
  | "prose"
  | "arrangement"
  | "theme"
  | "nikud"
  | "history"
  | "record"
  | "help"
  | "settings";

/**
 * Where a control lives in the window (`docs/ui-architecture.md` §4).
 *
 * - `quick`: the Quick Access bar at the head of the title row.
 * - `title`: ⓘ and ⚙ at the end of the title row.
 * - `status`: the status bar's right half, the controls that *show state*.
 */
export type ChipPlace = "quick" | "title" | "status";

/** One control in the window's frame: the title row or the status bar. */
export interface Chip {
  /**
   * A stable name, across languages and themes, drawn as `data-chip`.
   *
   * Every control here is an icon with a localised tooltip, so without this
   * the only way to find one from outside is `title*="…"` — a selector that
   * works in Hebrew and silently matches nothing in English.
   */
  id: ChipId;
  place: ChipPlace;
  /** A Tabler or ksav icon id; when absent the control is its `glyph`. */
  icon?: IconId;
  /** The control's text face: what it shows when it has no icon. */
  glyph: string;
  /** The tooltip and the accessible name, resolved in the current language. */
  title: string;
  /** The setting this control shows is on. */
  active?: boolean;
  /**
   * This control is a **toggle**, so `active` is its pressed state (UAT 3, #134).
   *
   * `active` alone was visible only in the stylesheet, which means the button
   * looked pressed and told a screen reader nothing at all. The distinction is
   * not academic — `git` also uses `active`, to mean "there are conflicts",
   * and announcing that as a pressed toggle would be a button that claims to be
   * a setting and does not toggle. So the state is declared where the control
   * is defined, not inferred from the word `active`.
   */
  toggle?: boolean;
  /** Not available in this state. `iconBtn` turns this into the real attribute. */
  disabled?: boolean;
}

/**
 * Everything the frame displays.
 *
 * The fields it needs off `Settings`, plus the live state that is not a
 * setting. Named rather than taking `Settings` whole so that a test states the
 * world in one line and so that adding a setting cannot silently change what
 * the frame shows.
 */
export interface HeaderState {
  theme: Settings["theme"];
  prose: boolean;
  nikud: boolean;
  /** Recording a macro. A mode with no indicator is a mode people leave on. */
  recording: boolean;
  /**
   * What version control says about this document, or absent when nothing has
   * asked yet.
   *
   * Optional because "not asked" is a real and common state — the drawer has
   * never been opened, or the document has no file — and it is a different
   * thing from "clean". A control that reads clean before anybody has run a
   * `git status` is the interface lying about the state it exists to display,
   * which is the fault this module was written to make impossible.
   */
  vcs?: { health: VcsHealth; branch: string; changes: number };
}

/**
 * The one word a repository is in, as far as the status bar is concerned.
 *
 * Structurally the same union as `git.ts`'s `Health` and deliberately not
 * imported from it: this module is pure and imports `i18n` and `Settings`
 * only, and `git.ts` reaches the wire types. The compiler holds the two
 * together at the one call site that produces the value.
 */
export type VcsHealth = "no-git" | "no-repo" | "conflicted" | "changed" | "ahead" | "behind" | "clean";

/** The glyph for each state. A branch when there is nothing to report, and
 *  something specific when there is. */
const VCS_GLYPH: Record<VcsHealth, string> = {
  "no-git": "⑂",
  "no-repo": "⑂",
  conflicted: "⚠",
  changed: "●",
  ahead: "↑",
  behind: "↓",
  clean: "⑂",
};

/**
 * The version-control control's tooltip: the drawer's name, and then what it
 * would tell you.
 *
 * Composed here rather than returned as a key, for the reason at the top of
 * this file — a composition left to the caller is a decision left in the
 * god-file. The branch name is included because on a sefer with two lines of
 * work in parallel it is the single most useful thing to be able to read
 * without opening anything.
 */
function vcsTitle(vcs: HeaderState["vcs"]): string {
  const name = t("git.title");
  if (!vcs) return name;
  const what = t("git.h." + vcs.health);
  const count = vcs.health === "changed" && vcs.changes > 0 ? ` (${vcs.changes})` : "";
  return vcs.branch ? `${name} · ${vcs.branch} — ${what}${count}` : `${name} — ${what}${count}`;
}

/**
 * The frame's controls, in the order each place draws them (#233, §4).
 *
 * The 22-icon chip row is gone: a control that *does* a thing to the document
 * is a ribbon button, and what is left here is what belongs to the window
 * itself — Quick Access, help and settings, and the status bar's toggles that
 * report a state. A state the writer cannot see is a mode they leave on, which
 * is why version control, the recorder and the surface are in the status bar
 * and not behind a tab.
 */
export function chips(s: HeaderState): Chip[] {
  const lang = getLang();
  const dark = s.theme !== "light";
  return [
    { id: "save", place: "quick", icon: "device-floppy", glyph: "💾", title: t("sc.save") },
    { id: "undo", place: "quick", icon: "arrow-back-up", glyph: "↶", title: t("sc.undo") },
    { id: "redo", place: "quick", icon: "arrow-forward-up", glyph: "↷", title: t("sc.redo") },
    { id: "help", place: "title", icon: "info-circle", glyph: "ⓘ", title: t("help") },
    { id: "settings", place: "title", icon: "settings", glyph: "⚙", title: t("settings") },
    // Version control. Never disabled, however unavailable it is: each of the
    // three ways it can be unavailable has a different answer for the reader —
    // save the document, use the installed application, install git — and a
    // greyed control with no way in delivers none of them. The drawer says which.
    // Its face is the state's glyph, not an icon: `●` and `⚠` are the report.
    {
      id: "git",
      place: "status",
      glyph: VCS_GLYPH[s.vcs?.health ?? "clean"],
      title: vcsTitle(s.vcs),
      active: s.vcs?.health === "conflicted",
    },
    // The face is the language you would switch *to*, which is the one thing a
    // reader who cannot read the current one can still act on.
    { id: "language", place: "status", glyph: lang === "he" ? "EN" : "עב", title: t("language") },
    // Prose mode hides the markup. The icon and the tooltip both name the mode
    // the button switches *to*, and they have to agree.
    {
      id: "prose",
      place: "status",
      icon: s.prose ? "code" : "article",
      glyph: s.prose ? "🅐" : "＃",
      title: s.prose ? t("raw") : t("prose"),
      active: s.prose,
      toggle: true,
    },
    {
      id: "record",
      place: "status",
      icon: s.recording ? "player-stop" : "player-record",
      glyph: s.recording ? "⏹" : "⏺",
      title: s.recording ? t("macroStop") : t("macroRecord"),
      active: s.recording,
      toggle: true,
    },
    { id: "nikud", place: "status", icon: "ksav:nikud", glyph: "אָ", title: t("nikud"), active: s.nikud, toggle: true },
    // The sun and the moon name the theme you would switch to, like the language.
    { id: "theme", place: "status", icon: dark ? "sun" : "moon", glyph: dark ? "☀" : "🌙", title: t("theme") },
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
 * The File menu's own verbs, as a union so `FILE_RUN` is checked against it.
 * Where each one is drawn is `placement.ts`'s business now (#233).
 */
export type FileItemId =
  | "open"
  | "save"
  | "saveAs"
  | "importWord"
  | "importOrg"
  | "shareRead"
  | "shareReview"
  | "saveAsTemplate";

/**
 * Save-as's label. With the File System Access API it saves *to a file the
 * writer keeps*, and without it the browser can only push a copy into the
 * downloads folder. Calling both of those "Save as…" would promise a binding
 * that is not going to exist.
 */
export function saveAsLabel(realFiles: boolean): string {
  return realFiles ? t("saveAs") : t("saveCopy");
}

/**
 * The Export menu — every route, and every one addressable.
 *
 * All of them, not one. A menu where only the item under test can be found is a
 * menu that will grow an item nothing can reach; the ids are the i18n keys,
 * which are already each item's identifier, so no second vocabulary was invented
 * for this.
 *
 * It was nine, and the ninth was `exportPdfPages` — "PDF — selected pages…",
 * which was the PDF route with a `window.prompt` in front of it. That is not a
 * route, it is an argument, and holding it as a route is what made a page range
 * a property of one format:
 *
 * > *"A page range is offered for PDF only. No reason has been given for that."*
 *
 * The range is one box at the head of this menu now, read by every route that
 * has pages — see `pagerange.ts`, which also says why the others do not. Nothing
 * was lost with the row: it had no key, no palette entry and no caller outside
 * this list, so the box is strictly more reachable than the item it replaces.
 */
export const EXPORTS = [
  "exportPdf",
  "exportWord",
  "copyForWord",
  "exportHtml",
  "exportMarkdown",
  // Beside Markdown, because it answers the same question — "get this out as
  // text another tool reads" — and differs in the one way that matters here:
  // Org has no six-level ceiling on headings, so a sefer's outline survives it
  // whole. See `org.ts`.
  "exportOrg",
  "exportText",
  // Two arrangements of the same document, side by side in the menu, because
  // which one is right depends on what the writer is going to do with it: the
  // self-contained file compiles anywhere and is 550 KB whatever the document is
  // (#130), and the compact pair is small and needs both its files kept
  // together. Before this there was one option and no sentence anywhere saying
  // which of those it was — the UAT report's *"outrageously large"*.
  "exportTypst",
  "exportTypstCompact",
  "print",
] as const;

/**
 * Every export route, as a union.
 *
 * So that `main.ts`'s table of what each one *does* is checked against this list
 * by the compiler, exactly as `ChipId` holds `CHIP_RUN`. Without it the table was
 * a `Record<string, …>`, a route added here got `EXPORT_RUN[id]` of `undefined`,
 * and `menuItem` wired the button to nothing — a menu entry that looks right,
 * does nothing when pressed, and says nothing about why. That is the failure
 * this whole repository is named after, and it was one keystroke away in two
 * menus. Found by adding a ninth route.
 */
export type ExportId = (typeof EXPORTS)[number];

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
 * The open document's name: **what it is called**, and what it is bound to.
 *
 * UAT 19 read the header and could not say which of the two values was the
 * document and which the file — they sat side by side, unlabeled, one above the
 * other, and only the button's tooltip ("Rename") spoke. UAT 25 found the same
 * seam from the other end: nothing said whether a document was bound to a file
 * at all, or whether the file was behind the editor.
 *
 * So the second line is a **sentence, in the interface's language**, and this
 * function is its one home: `buildHeader` draws it at build time and
 * `docswitch.updateTitleBar` re-draws it after a rename or a save, and both ask
 * here rather than composing their own version (which is what they used to do —
 * one of them said `● kuntres.ksav`, the other the bare name).
 *
 * The state is passed in rather than read here, because half of it lives in the
 * save layer and a header that imported the save layer would be the second
 * opinion about *unsaved* this project keeps having to delete.
 */
export type DocFileState = "saved" | "unsaved" | "copy" | "none";

export interface DocName {
  title: string;
  /** The bound filename, or `""`. Kept for callers that want the value alone. */
  file: string;
  /** The visible second line — the label, the name, and the state, in words. */
  line: string;
  /** The accessible name of the button: the action and its subject. */
  label: string;
}

/**
 * @param title the library title
 * @param file the bound filename, if any
 * @param state `none` for an unbound document, `copy` for a download-tier
 *   binding (a name with nothing behind it), and otherwise whether the file on
 *   disk is current
 */
export function docTitle(
  title: string | undefined,
  file: string | undefined,
  state: DocFileState = file ? "saved" : "none",
): DocName {
  const name = title ?? "";
  const fileName = file ?? "";
  // A state that names a file when there is none is a caller bug, and drawing a
  // label around an empty value is the "two unlabeled values" complaint again.
  // So it degrades to `none` rather than rendering `File: `.
  const kind: DocFileState = fileName ? state : "none";
  const line =
    kind === "none"
      ? t("stateNoFile")
      : `${t("fileNameLabel")}: ${fileName}` +
        (kind === "saved" ? "" : ` · ${kind === "copy" ? t("stateCopy") : t("stateUnsaved")}`);
  return { title: name, file: fileName, line, label: `${t("rename")}: ${name}` };
}

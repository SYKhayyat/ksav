// The header, drawn: the `<header>` element of the application.
//
// `header.ts` is where the header *decides* — which chips exist, what a chip
// is called and when it is on, off or unavailable. This file is where the
// header *is drawn*: `buildHeader` composes the toolbar and the menus that
// `ribbon.ts` builds, then hangs the chrome and the chipbar over them. That
// composition was `main.ts`'s fourth-largest function, and the reason it can
// live here is that it is a shell: every verb it names belongs to a module
// that exports it, except the three `main.ts` still owns. Those arrive as one
// registered object, `headerWiring`, exactly like `wireChrome` and `wirePanes`.
//
// The chipbar is the interface's *report on itself* — a toggle showing the sun
// while the theme is dark is not a cosmetic fault, it is the interface lying
// about the setting it exists to display — so the decisions moved out first
// (`header.ts`), the verbs move out next (here), and what remains for `main.ts`
// is wiring the three of them that it owns.

import { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";
import { foldAll, unfoldAll } from "@codemirror/language";

import * as header from "./header";
import * as exports from "./exports";
import * as pagerange from "./pagerange";
import * as panes from "./panes";
import * as runtime from "./runtime";
import { el, iconBtn } from "./dom";
import { getLang, t, tf } from "./i18n";
import { settings } from "./settings";
import {
  templatesForMenu,
  deleteUserTemplate,
  startFromTemplate,
  loadTemplate,
  userTemplates,
  saveAsTemplate,
} from "./templates";
import { isRecording, toggleRecording } from "./macros";
import { setProseHere, proseHere } from "./compartments";
import { gitForHeader } from "./gitui";
import {
  openFile,
  saveFile,
  saveFileAs,
  importWord,
  importOrg,
  copyShareLink,
} from "./fileui";
import { renameDoc, newDoc } from "./docswitch";
import * as files from "./files";
import { voidAction } from "./asyncaction";
import { currentPages } from "./preview";
import { openStyles } from "./stylespanel";
import { toggleOutline, toggleNotesPane, toggleMarksPane } from "./rowlists";
import { openNotesChooser } from "./noteschooser";
import { openReview } from "./reviewpanel";
import { openGit } from "./gitui";
import { openCommands } from "./commandsdrawer";
import { openArrangements } from "./panearrangements";
import { openHistory } from "./snapshots";
import { openHelp } from "./help";
import { toggleSettings } from "./settingsdrawer";
import { paneTree } from "./panestate";
import {
  buildToolbar,
  buildDocsMenu,
  buildMacroMenu,
  buildFormatMenu,
  buildSourcesMenu,
  buildTableMenu,
  buildInsertMenu,
  lazyMenu,
  menu,
} from "./ribbon";
import { makeWiring } from "./wiring";

// ------------------------------------------------------------------- wiring
//
// Three verbs are still `main.ts`'s own. `setSetting` writes a setting and
// reconfigures what reads it; `startFind` opens the find UI; `toggleNikud`
// flips the nikud button. They arrive as one registered object.

export interface HeaderWiring {
  setSetting<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]): void;
  startFind(view: EditorView): boolean;
  toggleNikud(): void;
}

const headerWire = makeWiring<HeaderWiring>("wireHeader");

/** Register the header's shell verbs. Called once, from main.ts's boot. */
export function wireHeader(w: HeaderWiring): void {
  headerWire.wire(w);
}

/** The wiring, for this module. */
const headerWiring = (): HeaderWiring => headerWire.get();

const CHIP_RUN: Record<header.ChipId, () => void> = {
  undo: () => void undo(runtime.view),
  redo: () => void redo(runtime.view),
  styles: openStyles,
  find: () => headerWiring().startFind(runtime.view),
  outline: toggleOutline,
  notesChooser: openNotesChooser,
  notesPane: toggleNotesPane,
  marksPane: toggleMarksPane,
  review: openReview,
  git: openGit,
  commands: openCommands,
  language: () => headerWiring().setSetting("lang", getLang() === "he" ? "en" : "he"),
  foldAll: () => void foldAll(runtime.view),
  unfoldAll: () => void unfoldAll(runtime.view),
  prose: () => setProseHere(!proseHere()),
  arrangement: openArrangements,
  theme: () => headerWiring().setSetting("theme", settings.theme === "light" ? "dark" : "light"),
  nikud: () => headerWiring().toggleNikud(),
  history: openHistory,
  record: toggleRecording,
  help: openHelp,
  settings: toggleSettings,
};

/** The header's view of the world, gathered in one place. */
function headerState(): header.HeaderState {
  return {
    theme: settings.theme,
    prose: proseHere(),
    arrangement: panes.arrangementOf(paneTree),
    // Three of these are optional settings and one is the recorder's own
    // buffer. `header.ts` takes booleans, because "is this chip on" is a
    // question with two answers and `undefined` is not one of them.
    outline: !!settings.outline,
    nikud: !!settings.nikud,
    notesPane: !!settings.notesPane,
    marksPane: !!settings.marksPane,
    recording: isRecording(),
    // Absent until something has actually asked git. See `gitForHeader`: "not
    // asked" and "clean" are different states, and only one of them is a claim.
    vcs: gitForHeader(),
  };
}

/**
 * The pages box at the head of the Export menu.
 *
 * One control for the whole menu rather than one route with a prompt in front of
 * it. The hint under it is the part that makes it usable: an empty box has to
 * say what empty *means* — and it means every page, which is not something a
 * blank field communicates — and a spec with a piece in it that names nothing
 * has to say so here, before a file goes out that is quietly not the one that
 * was asked for.
 */
function pagesRow(): HTMLElement {
  const hint = el("div", { class: "menu-desc", id: "export-pages-hint" }, [pagesHint()]);
  const input = el("input", {
    type: "text",
    id: "export-pages",
    class: "menu-input",
    value: exports.pagesText(),
    placeholder: t("pagesAll"),
    "aria-label": t("pagesLabel"),
    onInput: (e: Event) => {
      exports.setPages((e.target as HTMLInputElement).value);
      hint.textContent = pagesHint();
    },
  });
  return el("div", { class: "menu-input-row" }, [
    el("span", { class: "menu-cat" }, [t("pagesLabel")]),
    input,
    hint,
  ]);
}

/** What the pages box is currently asking for, in words. */
function pagesHint(): string {
  const spec = exports.pagesSpec();
  const total = currentPages().length;
  if (spec.bad.length) return tf("pagesUnreadable", spec.bad.join(", "));
  // A one-page document gets its own sentence rather than "all 1 pages", which
  // is the kind of thing that reads as a program talking to itself. Hebrew is
  // worse about it than English, which is why it is a separate string and not a
  // clever plural rule.
  if (!spec.spans) return total === 1 ? t("pagesAllOne") : tf("pagesAllOf", total);
  if (pagerange.beyond(spec, total)) {
    return total === 1 ? t("pagesBeyondOne") : tf("pagesBeyond", total);
  }
  return tf("pagesChosen", pagerange.select(spec, currentPages()).length, total);
}

/**
 * One export route, and — when a range is set — whether it can honour it.
 *
 * The reason the finding says was never given. It is said at the point of use
 * and only when it is relevant: six rows permanently captioned "this format has
 * no pages" is noise, and the same six rows silently ignoring a range the writer
 * just typed is the bug.
 */
function exportItem(row: header.MenuRow, run: () => void): HTMLElement {
  const btn = el("button", { class: "menu-item", "data-export": row.id, onClick: run }, [row.label]);
  const why = pagerange.whyNoRange(row.id);
  if (!why || !exports.pagesSpec().spans) return btn;
  btn.append(el("span", { class: "menu-why" }, [t(why)]));
  return btn;
}

export function buildHeader(): HTMLElement {
  const menuItem = (row: header.MenuRow, run: () => void, extra: Record<string, string> = {}) =>
    el("button", { class: "menu-item", ...extra, onClick: run }, [row.label]);

  const templatesByMenu = new Map(templatesForMenu().map((tpl) => [tpl.he, tpl]));
  const users = userTemplates();
  const usersById = new Map(users.map((u) => [u.id, u]));
  const templatesMenu = menu(
    "templates",
    "📄 " + t("templates"),
    header
      .templateItems(
        templatesForMenu().map((tpl) => ({ ...tpl, id: tpl.he })),
        users,
      )
      .map((entry) => {
        if (header.isSep(entry)) return el("div", { class: "menu-sep" });
        const ut = usersById.get(entry.id);
        if (ut) {
          return el("div", { class: "menu-item-row" }, [
            el("button", {
              class: "menu-item menu-item-main",
              onClick: () => voidAction("save_file", () => startFromTemplate(ut.body, ut.name)),
            }, [
              el("b", {}, [entry.label]),
            ]),
            el("button", {
              class: "menu-del",
              title: t("delete"),
              "aria-label": t("delete"),
              onClick: (e: Event) => {
                e.stopPropagation();
                deleteUserTemplate(ut.id);
              },
            }, ["×"]),
          ]);
        }
        const tpl = templatesByMenu.get(entry.id)!;
        return el("button", { class: "menu-item", onClick: () => voidAction("save_file", () => loadTemplate(tpl)) }, [
          el("b", {}, [entry.label]),
          el("span", { class: "menu-desc" }, [entry.desc ?? ""]),
        ]);
      }),
  );

  // Keyed by the union, not by `string`. See `header.ExportId` for what that
  // buys and what it was one keystroke away from costing.
  // **Every entry here goes through `voidAction`** (#125).
  //
  // Four of them were wired as bare function references — `open: openFile`,
  // `saveAs: saveFileAs` — which reads as tidy and is not: `menuItem` installs
  // the value as a click handler, `openFile` awaits a native picker, a file read,
  // an IndexedDB write and a binding comparison, and any of those rejecting is an
  // unhandled promise rejection, which this app's crash handler treats as a
  // crash. So File ▸ Open *could* take the writer to the crash panel — the UAT
  // report's items 13 and 15 — while the two import routes beside it, which had
  // just been given internal catches, could not.
  //
  // `voidAction` is the approved form (`asyncaction.ts`): it starts the promise,
  // does not wait, and reports a failure as a status line. A cancelled picker
  // throws `CANCELLED` and says nothing, which is why cancelling is quiet.
  //
  // The four that are not wrapped do not return promises: `newDoc`,
  // `save`→`saveFile`, and `saveAsTemplate` are `async` and therefore *are*
  // wrapped; what is left is nothing — every entry below is a `voidAction` call,
  // and `asyncaction.test.mjs` reads this table and fails if one is not.
  const FILE_RUN: Record<header.FileItemId, () => void> = {
    newDoc,
    open: () => voidAction("save_file", () => openFile()),
    save: () => voidAction("save_file", () => saveFile()),
    saveAs: () => voidAction("save_file", () => saveFileAs()),
    importWord: () => voidAction("save_file", () => importWord()),
    importOrg: () => voidAction("save_file", () => importOrg()),
    shareRead: () => voidAction("general", () => copyShareLink(false)),
    shareReview: () => voidAction("general", () => copyShareLink(true)),
    saveAsTemplate: () => voidAction("save_file", () => saveAsTemplate()),
  };
  const fileMenu = menu(
    "file",
    "📁 " + t("file"),
    header
      .fileItems(files.supportsRealFiles())
      // A type guard rather than a cast, so the id that reaches `FILE_RUN` is
      // the union and not `string` — which is the whole point of the union.
      .filter((e): e is { id: header.FileItemId } & header.MenuRow => !header.isSep(e))
      .map((e) => menuItem(e, FILE_RUN[e.id])),
  );

  // The Skins menu is gone: presets now live inside the Styles panel, next to
  // the settings they overwrite, where the relationship is visible.

  // Every asynchronous route, through `voidAction` for the same reason as the
  // File menu above (#125): `exportPdf` awaits a compile and a decode, and
  // `void exports.exportPdf()` on a rejection is a crash panel rather than a
  // sentence. All seven are asynchronous now — Markdown, Org and text used to
  // return a string and a file with nothing to reject, and since #127 each one
  // awaits the writer's answer to *where should this go*, which can reject. The
  // fence in `asyncaction.test.mjs` caught them the moment they changed.
  const EXPORT_RUN: Record<header.ExportId, () => void> = {
    exportPdf: () => voidAction("general", () => exports.exportPdf()),
    exportWord: () => voidAction("general", () => exports.exportWord()),
    copyForWord: () => voidAction("general", () => exports.copyForWord()),
    exportHtml: () => voidAction("general", () => exports.exportHtml()),
    exportMarkdown: () => voidAction("general", () => exports.exportMarkdown()),
    exportOrg: () => voidAction("general", () => exports.exportOrg()),
    exportText: () => voidAction("general", () => exports.exportText()),
    exportTypst: () => voidAction("general", () => exports.exportTypst()),
    exportTypstCompact: () => voidAction("general", () => exports.exportTypstCompact()),
    print: exports.doPrint,
  };
  // Rebuilt on every open, because the page count in the hint is the count of
  // the document as it stands and the range is whatever the writer last typed.
  const exportMenu = lazyMenu("export", "⬇ " + t("export"), () => [
    pagesRow(),
    ...header.exportItems().map((row) =>
      exportItem(row, EXPORT_RUN[row.id]),
    ),
  ]);

  const name = header.docTitle(runtime.currentDoc?.title, runtime.currentBinding?.name);

  return el("header", { role: "banner" }, [
    el("div", { class: "brand" }, [
      el("span", { class: "brand-name" }, [t("appName")]),
      el("small", {}, [t("tagline")]),
    ]),
    // The open document's name, clickable to rename — a writing tool with a
    // library needs to say, at all times, which document you are in.
    el(
      "button",
      {
        class: "doc-title-btn",
        type: "button",
        title: t("rename"),
        "aria-label": name.label,
        onClick: renameDoc,
      },
      [
        el("span", { class: "doc-title", id: "doc-title" }, [name.title]),
        el("small", { class: "doc-file", id: "doc-file" }, [name.file]),
      ],
    ),
    buildToolbar(),
    // The menu bar and the runtime.view chips are navigation, and saying so is what
    // gives a screen-reader user a way to skip past forty-odd controls to the
    // editor. The page had no landmarks at all.
    el("nav", { class: "menubar", "aria-label": t("menubar") }, [
      buildInsertMenu(),
      buildFormatMenu(),
      buildTableMenu(),
      buildSourcesMenu(),
      buildMacroMenu(),
      buildDocsMenu(),
      fileMenu,
      templatesMenu,
      exportMenu,
    ]),
    el("div", { class: "spacer" }),
    el(
      "div",
      { class: "chipbar", role: "group", "aria-label": t("viewControls") },
      // `disabled` in the class list is what `iconBtn` reads to set the real
      // attribute, and `recording` is a class the stylesheet pulses.
      header.chips(headerState()).map((c) =>
        iconBtn(
          c.glyph,
          c.title,
          CHIP_RUN[c.id],
          ["chip", c.active ? "active" : "", c.disabled ? "disabled" : "", c.id === "record" && c.active ? "recording" : ""]
            .filter(Boolean)
            .join(" "),
          { "data-chip": c.id },
        ),
      ),
    ),
  ]);
}
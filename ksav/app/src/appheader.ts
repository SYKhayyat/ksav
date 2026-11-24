// The window's frame, drawn: the title row, the ribbon, and the status bar's
// toggles (#233, `docs/ui-architecture.md` §4).
//
// `header.ts` is where the frame *decides* — which controls exist, where each
// lives, what it is called and when it is on. This file is where it *is
// drawn*: `buildHeader` composes the title row (brand, Quick Access, the
// document's name, ⓘ ⚙) over the ribbon, whose tab row ends in `☰`, the menu
// bar folded; `buildStatusTools` draws the controls that report a state.
// Every verb it names belongs to a module that exports it, except the two
// `main.ts` still owns. Those arrive as one registered object,
// `headerWiring`, exactly like `wireChrome` and `wirePanes`.
//
// A toggle showing the sun while the theme is dark is not a cosmetic fault, it
// is the interface lying about the setting it exists to display — so the
// decisions live in `header.ts`, pure and tested, and this file only draws.

import { undo, redo } from "@codemirror/commands";

import * as header from "./header";
import * as exports from "./exports";
import * as pagerange from "./pagerange";
import * as runtime from "./runtime";
import { el, iconBtn } from "./dom";
import { icon } from "./icons";
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
import { renameDoc } from "./docswitch";
import * as files from "./files";
import { voidAction } from "./asyncaction";
import { hasUnsavedFileChanges } from "./save";
import { currentPages } from "./preview";
import { openStyles } from "./stylespanel";
import { toggleOutline, toggleNotesPane, toggleMarksPane } from "./rowlists";
import { openReview } from "./reviewpanel";
import { openGit } from "./gitui";
import { openArrangements } from "./panearrangements";
import { openHistory } from "./snapshots";
import { openHelp } from "./help";
import { toggleSettings } from "./settingsdrawer";
import { buildMenus } from "./shellmenu";
import { buildRibbon, menuToggle } from "./shelltabs";
import { makeWiring } from "./wiring";

// ------------------------------------------------------------------- wiring
//
// Two verbs are still `main.ts`'s own. `setSetting` writes a setting and
// reconfigures what reads it; `toggleNikud` flips the nikud bar. They arrive
// as one registered object.

export interface HeaderWiring {
  setSetting<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]): void;
  toggleNikud(): void;
}

const headerWire = makeWiring<HeaderWiring>("wireHeader");

/** Register the header's shell verbs. Called once, from main.ts's boot. */
export function wireHeader(w: HeaderWiring): void {
  headerWire.wire(w);
}

/** The wiring, for this module. */
const headerWiring = (): HeaderWiring => headerWire.get();

export const CHIP_RUN: Record<header.ChipId, () => void> = {
  save: () => FILE_RUN.save(),
  undo: () => void undo(runtime.view),
  redo: () => void redo(runtime.view),
  styles: openStyles,
  outline: toggleOutline,
  notesPane: toggleNotesPane,
  marksPane: toggleMarksPane,
  review: openReview,
  git: openGit,
  language: () => headerWiring().setSetting("lang", getLang() === "he" ? "en" : "he"),
  prose: () => setProseHere(!proseHere()),
  arrangement: openArrangements,
  theme: () => headerWiring().setSetting("theme", settings.theme === "light" ? "dark" : "light"),
  nikud: () => headerWiring().toggleNikud(),
  history: openHistory,
  record: toggleRecording,
  help: openHelp,
  settings: toggleSettings,
};

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
// Nothing here is a bare function reference: every entry is a `voidAction`
// call, and `asyncaction.test.mjs` reads this table and fails if one is not.
// `newDoc` is no longer among them — *File ▸ New document* was removed in
// #128, and Documents is its one home.
export const FILE_RUN: Record<header.FileItemId, () => void> = {
  open: () => voidAction("save_file", () => openFile()),
  save: () => voidAction("save_file", () => saveFile()),
  saveAs: () => voidAction("save_file", () => saveFileAs()),
  importWord: () => voidAction("save_file", () => importWord()),
  importOrg: () => voidAction("save_file", () => importOrg()),
  shareRead: () => voidAction("general", () => copyShareLink(false)),
  shareReview: () => voidAction("general", () => copyShareLink(true)),
  saveAsTemplate: () => voidAction("save_file", () => saveAsTemplate()),
};

// Every asynchronous route, through `voidAction` for the same reason as the
// File menu's table above (#125): `exportPdf` awaits a compile and a decode, and
// `void exports.exportPdf()` on a rejection is a crash panel rather than a
// sentence. All seven are asynchronous now — Markdown, Org and text used to
// return a string and a file with nothing to reject, and since #127 each one
// awaits the writer's answer to *where should this go*, which can reject. The
// fence in `asyncaction.test.mjs` caught them the moment they changed.
export const EXPORT_RUN: Record<header.ExportId, () => void> = {
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

// The action table runs these too, by id, through `runtime` (#233: a direct
// import from `actionsurface.ts` closed a cycle through the shell's menu).
runtime.onHeaderRuns({ chip: CHIP_RUN, file: FILE_RUN, export: EXPORT_RUN });

/** The header's view of the world, gathered in one place. */
function headerState(): header.HeaderState {
  return {
    theme: settings.theme,
    prose: proseHere(),
    // `header.ts` takes booleans, because "is this toggle on" is a question
    // with two answers and `undefined` is not one of them.
    nikud: !!settings.nikud,
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

export function buildHeader(): HTMLElement {
  const templatesByMenu = new Map(templatesForMenu().map((tpl) => [tpl.he, tpl]));
  const users = userTemplates();
  const usersById = new Map(users.map((u) => [u.id, u]));
  // The templates are rows in File ▸ Templates, drawn here because the list is
  // this module's to read.
  const templateRows = () =>
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
      });
  // The state comes from the save layer, not from a guess here: `hasUnsavedFileChanges`
  // answers *is the file behind the editor*, and `canWriteBack` answers *is there a
  // file behind the editor at all* — the copy tier is a name with nothing behind
  // it, which is why it gets its own words rather than the unsaved one.
  const binding = runtime.currentBinding;
  const name = header.docTitle(
    runtime.currentDoc?.title,
    binding?.name,
    !binding
      ? "none"
      : files.canWriteBack(binding)
        ? hasUnsavedFileChanges()
          ? "unsaved"
          : "saved"
        : "copy",
  );

  // One shell (#233, §4): the title row, then the ribbon. The menu bar is
  // folded behind `☰`, which the ribbon puts at the end of its tab row.
  const menubar = el(
    "nav",
    { class: "menubar", id: "shell-menubar", "aria-label": t("menubar"), "data-folded": "folded" },
    buildMenus({ pages: () => [pagesRow()], templates: templateRows }),
  );
  const frame = header.chips(headerState());
  const at = (place: header.ChipPlace) => frame.filter((c) => c.place === place).map(chipButton);
  return el("header", { role: "banner" }, [
    el("div", { class: "title-row" }, [
      el("span", { class: "brand", title: t("tagline") }, [t("appName")]),
      // Quick Access: save, undo, redo — the verbs a hand reaches for whatever
      // tab is open, which is why they are not on one.
      el("div", { class: "quick-access", role: "toolbar", "aria-label": t("quickAccess") }, at("quick")),
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
          el("small", { class: "doc-file", id: "doc-file" }, [name.line]),
        ],
      ),
      el("div", { class: "title-tools" }, at("title")),
    ]),
    // Every menu, from the placements (#233): which menu holds a thing is
    // `placement.ts`'s statement, not the order somebody wrote builders in.
    menubar,
    buildRibbon([menuToggle(menubar)]),
  ]);
}

/**
 * The status bar's right half: the controls that show a state (§4).
 *
 * Rebuilt with the header, by id, because every one of them reports a setting
 * and a report drawn once is a report that goes stale.
 */
export function buildStatusTools(): HTMLElement {
  const frame = header.chips(headerState()).filter((c) => c.place === "status");
  return el("div", { class: "status-tools", id: "status-tools", role: "group", "aria-label": t("viewControls") }, frame.map(chipButton));
}

/** One frame control: its icon (or its text face), its name, its state. */
function chipButton(c: header.Chip): HTMLElement {
  const b = iconBtn(
    c.icon ? "" : c.glyph,
    c.title,
    CHIP_RUN[c.id],
    // `disabled` in the class list is what `iconBtn` reads to set the real
    // attribute, and `recording` is a class the stylesheet pulses.
    ["chip", c.active ? "active" : "", c.disabled ? "disabled" : "", c.id === "record" && c.active ? "recording" : ""]
      .filter(Boolean)
      .join(" "),
    // A toggle says whether it is pressed; anything else says nothing (UAT 3,
    // #134: the state lived only in `.chip.active`, so the button looked
    // pressed and announced no state at all).
    { "data-chip": c.id, ...(c.toggle ? { "aria-pressed": c.active ? "true" : "false" } : {}) },
  );
  if (c.icon) b.append(icon(c.icon));
  return b;
}

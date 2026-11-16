// The application's layout, and the repaints that hold it together.
//
// `render()` was 273 lines of `main.ts` — the composition of everything the
// window is made of, in one place, in a file no test can import. It is a shell
// function like `buildHeader` was: it names surfaces that modules build and
// decides the order they appear in, and unlike `makeState`'s extension list there
// is nothing in it that is a paragraph of prose.
//
// The six paint helpers came with it because they are the same decision seen
// from the other side: `applyTheme`, `applySourceZoom`, `applyUiDir`,
// `nameGutterMarks`, `openPreviewOverlay` and `updateCounts` are what a *change*
// to the layout looks like. They were thin wrappers over module exports — the
// whole set is 39 lines — and splitting `render` from them would have left the
// same drift the panes' `render-salvage` prologue kept producing.
//
// Nothing here needs anything from `main.ts`: every name below is a module
// export, which is why this move required no wiring seam at all.

import { buildHeader } from "./appheader";
import { rootDir } from "./direction";
import { onAttachRef } from "./sourcenote-lint";
import { getLang, isRtlUi, t } from "./i18n";
import * as opendocs from "./opendocs";
import * as panes from "./panes";
import * as tabs from "./tabs";
import { el, glyphBtn } from "./dom";
import * as runtime from "./runtime";
import { jumpTo } from "./runtime";
import { contextBar } from "./contextbar";
import { openPanel, togglePanel, panelHead, panelLede, overlayPanel } from "./panels";
import { docTextOf, plainText } from "./spans";
import { settings, saveSettings } from "./settings";
import * as save from "./save";
import { scheduleCompile, compileNow } from "./compile";
import { applyPreview } from "./preview";
import { setPaneTree, setFocusedPane } from "./panestate";
import { renderPanes } from "./panehost";
import { retargetPanes, buildTabStrip, refreshTabStrip } from "./tabstrip";
import { applyPageView } from "./panearrangements";
import { nameMarks } from "./changes";
import { offsetOf, setErrorLines } from "./errorlines";
import { onGoToLine, onMarkLines } from "./diagview";
import { buildNikudBar } from "./nikud";
import * as zoom from "./zoom";
import { buildHelpPanel } from "./help";
import { renderFindPane } from "./rowlists";
import { buildSettingsDrawer } from "./settingsdrawer";
import { takeSnapshot } from "./snapshots";
import { buildCommandsDrawer } from "./commandsdrawer";
import { tellGirsaWhereItIs, attachRefToNote } from "./girsa";
import { paletteKey, renderPaletteList } from "./palette";
import type { Settings } from "./settings";

function countNow() {
  const el = document.getElementById("wordcount");
  if (!el || !runtime.view) return;
  const text = plainText(docTextOf(runtime.view.state.doc));
  const words = (text.match(/[^\s]+/g) || []).length;
  const chars = text.replace(/\s+/g, " ").trim().length;
  el.textContent = `${words} ${t("words")} · ${chars} ${t("chars")}`;
}

let countTimer: number | undefined;
const COUNT_DEBOUNCE_MS = 200;
/**
 * The count, on a short beat rather than on every keystroke.
 *
 * `plainText` runs the whole document through five regular expressions, and
 * this was called synchronously from the update listener: 1.9 ms per keystroke on
 * a 64 KB document, 6.4 ms on a 192 KB one, inside a frame budget of 16 ms that
 * prose mode and CodeMirror are also spending from. Nobody reads a word count at
 * sixty frames a second; a fifth of a second late it is still the same number,
 * and the keystroke it is late for is the one being typed.
 */
export function updateCounts() {
  clearTimeout(countTimer);
  countTimer = window.setTimeout(countNow, COUNT_DEBOUNCE_MS);
}

export function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

export function applySourceZoom() {
  document.documentElement.style.setProperty(
    "--source-zoom",
    String(zoom.clamp(settings.sourceZoom ?? zoom.DEFAULT)),
  );
}

export function openPreviewOverlay() {
  openPanel("preview-modal");
}

export function nameGutterMarks() {
  // The keys as well as the sentences, so a language switch can re-render a
  // marker CodeMirror built itself.
  const keys = { added: "mark.added", changed: "mark.changed", removed: "mark.removed" };
  nameMarks({ added: t(keys.added), changed: t(keys.changed), removed: t(keys.removed) }, keys);
}

export function applyUiDir() {
  document.documentElement.lang = getLang();
  // The **interface's** direction, which is the interface language's (#122).
  //
  // This used to be `docConfig().dir` — the document's — added to fix the caret
  // in a Hebrew document under an English interface. It fixed the caret and
  // mirrored the product: an English UI with a Hebrew sefer opened right to
  // left, drawers and menus flipped, and the pane tree (which `styles.css` keeps
  // physical so "preview on the right" is the right of the screen) started
  // laying itself out backwards.
  //
  // The editor was never relying on this. It is told the document's direction on
  // its own content element (`dirCompartment`) and again by `bidiSupport`, and
  // the preview sets each pane's direction in `applyPreview`. Text surfaces take
  // the document; the page takes the interface. See `direction.ts`.
  document.documentElement.dir = rootDir(isRtlUi());
}

export function render() {
  const app = document.getElementById("app")!;
  app.append(
    buildHeader(),
    // Directly under the toolbar, where Word and LibreOffice put their
    // contextual tabs. It used to be a four-button strip pinned to the bottom
    // of the window, which the writer reasonably reported as "no UI at all".
    contextBar(),
    buildNikudBar(scheduleCompile),
    // Arrangements, when there is more than one. Above the panes because that
    // is what it selects between, and invisible at one because a strip of one
    // tab is a row of chrome saying nothing.
    buildTabStrip(),
    // Empty. `renderPanes` fills it from the pane tree, which is the one
    // statement of what the window looks like — a fixed preview/splitter/source
    // triple here would be a second one, and the two would drift the first time
    // somebody split a pane.
    el("main", {}),
    // The problems region, in the layout rather than over it (#124).
    //
    // Diagnostics lived in the status bar until a UAT report: a compile error is
    // a *sentence*, the bar is one 32px line with `overflow: hidden`, and the
    // message came back cut in half at exactly the moment the writer needed it.
    // An overlay would have been the other repair, and a worse one — the thing
    // that cannot be covered is the thing that is not overlapped, so this takes
    // the space it needs and the panes get the rest. `:empty` hides it, and
    // `drawDiagnostics` empties it when there is nothing to say.
    el("section", {
      id: "diagnostics",
      class: "diagnostics",
      role: "status",
      "aria-live": "polite",
      "aria-label": t("problems"),
      "data-i18n-label": "problems",
    }),
    // Announced as it changes: "rendering…", "3 pages", a compile error and —
    // the reason this matters — a save failure are all reported here, and a
    // status nobody is told about is the failure mode this whole pass exists to
    // remove. `polite` rather than `assertive`: it must not interrupt typing.
    el("div", { class: "statusbar", role: "status", "aria-live": "polite" }, [
      el("span", { id: "status", class: "ok" }, [t("ready")]),
      el("span", { id: "wordcount", class: "wordcount" }),
      el("span", { id: "engine-badge", class: "engine-badge", title: "compute engine" }),
    ]),
    buildSettingsDrawer(),
    el("aside", { id: "outline-drawer", class: "drawer drawer-start", "aria-label": t("outline"), "data-i18n-label": "outline" }, [
      // Its own close control, for the same reason the settings drawer needed
      // one: below 720px a drawer is the full viewport, so the chip that opened
      // it is underneath it and cannot be the only way back out.
      panelHead("outline-drawer", "outline", { level: "h3" }),
      panelLede("outlineLede"),
      el("div", { id: "outline-list", class: "outline-list" }),
    ]),
    // The notes pane, beside the outline: the two halves of a sefer's structure.
    el("aside", { id: "notes-drawer", class: "drawer drawer-start", "aria-label": t("notesPane"), "data-i18n-label": "notesPane" }, [
      panelHead("notes-drawer", "notesPane", { level: "h3" }),
      panelLede("notesPaneLede"),
      el("div", { id: "notes-list", class: "notes-list" }),
    ]),
    // The marks pane, beside the other two: what the document *says things are*,
    // where the outline is what it is built from and the notes pane is what hangs
    // off it.
    el("aside", { id: "marks-drawer", class: "drawer drawer-start", "aria-label": t("marksPane"), "data-i18n-label": "marksPane" }, [
      panelHead("marks-drawer", "marksPane", { level: "h3" }),
      // **The report, and it is one sentence long:** *"the marks pane reads as
      // a second siman/seif outline and gives no indication of what it actually
      // lists"*. It did read that way — three drawers on the same edge, each a
      // list of Hebrew phrases with a chip, and only the heading to tell them
      // apart. A heading names a pane; it does not say what a pane is *for*,
      // and "Marks" is not a word that explains itself.
      //
      // All three get one, and that is the fix rather than an extra: labelling
      // only the one that was reported would leave the two it is confused with
      // still unlabelled, and the confusion is between them.
      panelLede("marksPaneLede"),
      el("div", { id: "marks-list", class: "marks-list" }),
    ]),
    // Find. A drawer on the same edge as the three list panes, because the
    // answer is a list of places in the document and that is what that edge is
    // for — but transient, because it answers a question rather than showing a
    // view of the sefer.
    el("aside", { id: "find-drawer", class: "drawer drawer-start", "aria-label": t("findTitle"), "data-i18n-label": "findTitle" }, [
      panelHead("find-drawer", "findTitle", { level: "h3" }),
      panelLede("findLede"),
      el("input", {
        id: "find-query",
        type: "search",
        placeholder: t("findPlaceholder"),
        "data-i18n-placeholder": "findPlaceholder",
        // The name as well as the prompt (#178): a placeholder disappears the
        // moment the writer types and is not what a screen reader announces.
        "aria-label": t("findPlaceholder"),
        "data-i18n-label": "findPlaceholder",
        class: "help-search",
        onInput: () => renderFindPane(),
      }),
      // The scope, on the surface it governs and not only in the settings
      // drawer. A search that is quietly looking somewhere else is the whole
      // complaint; a writer has to be able to see which sefer is being read and
      // change it without leaving the answer.
      el("label", { class: "find-scope" }, [
        el("span", { "data-i18n": "searchScope" }, [t("searchScope")]),
        el(
          "select",
          {
            id: "find-scope",
            onChange: (e: Event) => {
              settings.searchScope = (e.target as HTMLSelectElement).value as Settings["searchScope"];
              saveSettings();
              // The printed text is only fetched while a scope that reads it is
              // on screen, so switching to one has to ask for a compile — or
              // the drawer would say the preview is unavailable until the next
              // keystroke happened to trigger one.
              if (settings.searchScope !== "source") compileNow();
              renderFindPane();
            },
          },
          [
            el("option", { value: "source", "data-i18n": "searchScope.source" }, [t("searchScope.source")]),
            el("option", { value: "preview", "data-i18n": "searchScope.preview" }, [t("searchScope.preview")]),
            el("option", { value: "both", "data-i18n": "searchScope.both" }, [t("searchScope.both")]),
          ],
        ),
      ]),
      el("div", { id: "find-list", class: "marks-list" }),
    ]),
    // styles panel (a drawer, so the document stays visible while you tune it)
    el("aside", { id: "styles-panel", class: "drawer drawer-styles", "aria-label": t("stylesTitle"), "data-i18n-label": "stylesTitle" }, [
      el("div", { id: "styles-body" }),
    ]),
    // review panel (a drawer, so the document stays visible while you go
    // through the changes — the whole point is comparing them with the text)
    el("aside", { id: "review-panel", class: "drawer drawer-styles", "aria-label": t("reviewTitle"), "data-i18n-label": "reviewTitle" }, [
      el("div", { id: "review-body" }),
    ]),
    // version control (a drawer for the review panel's reason: deciding what to
    // commit means reading the document while you decide)
    el("aside", { id: "git-panel", class: "drawer drawer-styles", "aria-label": t("git.title"), "data-i18n-label": "git.title" }, [
      el("div", { id: "git-body" }),
    ]),
    // The keyboard. A drawer for the reason the command list is one: it is read
    // while working — "what is the key for this" is asked mid-sentence — and a
    // window over the document would hide the thing the question is about.
    el("aside", { id: "keys-drawer", class: "drawer drawer-styles", "aria-label": t("keysTitle"), "data-i18n-label": "keysTitle" }, [
      panelHead("keys-drawer", "keysTitle", { level: "h3" }),
      el("div", { id: "keys-body" }),
    ]),
    // a shared form modal (section page setup, formulas)
    overlayPanel("form-modal", "palette-box form-modal-box", [el("div", { id: "form-modal-body" })]),
    buildCommandsDrawer(),
    buildHelpPanel(),
    // the hydra panel — a strip, not an overlay: the document must stay visible
    // and the caret must stay where it is while operations fire against it
    el("div", { id: "hydra", class: "hydra" }),
    // notes chooser overlay
    overlayPanel("notes-chooser", "notes-chooser-box", [el("div", { id: "notes-chooser-body" })]),
    // command palette overlay
    overlayPanel("palette", "palette-box", [
        el("input", {
          id: "palette-input",
          placeholder: t("searchCommands"),
          "data-i18n-placeholder": "searchCommands",
          "aria-label": t("searchCommands"),
          "data-i18n-label": "searchCommands",
          oninput: (e: Event) => renderPaletteList((e.target as HTMLInputElement).value),
          onKeyDown: (e: Event) => {
            if (paletteKey(e as KeyboardEvent)) {
              e.preventDefault();
              e.stopPropagation();
            }
          },
        }),
      el("div", { id: "palette-list" }),
    ]),
    // The open-document switcher. Deliberately its own surface and not a row in
    // the palette: with several documents open, a strip of chrome cannot be an
    // inventory of what is open and also stay out of the way, so this is the
    // surface that tells that truth. Tabs for the eye, switcher for the hand.
    overlayPanel("switcher", "palette-box", [el("div", { id: "switcher-list" })]),
    overlayPanel("arrangement", "palette-box", [el("div", { id: "arrangement-list" })]),
    // floating preview (page mode): a button + a modal showing the rendered pages
    glyphBtn("📄", t("preview"), openPreviewOverlay, "float-preview-btn", {
      "data-i18n-both": "preview",
      id: "float-preview-btn",
      "data-i18n-title": "preview",
    }),
    overlayPanel("preview-modal", "preview-modal-box", [el("div", { id: "preview-modal-body" })]),
    // version history modal
    overlayPanel("history-modal", "palette-box", [
      el("div", { class: "history-head" }, [
        el("b", { "data-i18n": "history" }, [t("history")]),
        el("button", { class: "sc-key", "data-i18n": "snapshotNow", onClick: () => void takeSnapshot(true) }, [
          t("snapshotNow"),
        ]),
      ]),
      el("div", { id: "history-list" }),
    ]),
    // Every place a line printed (#82). The head names the line and the file it
    // is in, so a list of numbers is answerable rather than merely shown.
    overlayPanel("places-chooser", "palette-box", [
      el("div", { class: "history-head" }, [
        el("b", { "data-i18n": "revealPlaces" }, [t("revealPlaces")]),
        el("span", { id: "places-subject" }),
      ]),
      el("div", { id: "places-list" }),
    ]),
    // Every citation in the document, as the library has it now (spec.md
    // §10.2). See `refreshSources` for what the errand is and why the rows come
    // back instead of a rewritten file.
    overlayPanel("refresh-panel", "palette-box", [
      // `panelHead` and not a hand-built ×. The panel *claims* a head exit, and
      // `chrome.test.mjs` checks that the claim is kept by the one function
      // that builds one — which is how an exit comes to be a promise rather
      // than a note in a registry.
      panelHead("refresh-panel", "refreshTitle", { level: "h3" }),
      el("div", { id: "refresh-list" }),
    ]),
  );

  // The window, from the pane tree. Builds the editors, so it comes before
  // anything that reaches for one.
  // The strip, or a single tab holding whatever arrangement was stored. A
  // restart has to come back to the window the writer left, or an arrangement
  // they built is worth less than no arrangement at all.
  if (!tabs.restore(settings.tabs)) {
    tabs.reset();
    tabs.add((settings.panes as panes.PaneNode | undefined) ?? panes.defaultTree());
  }
  setPaneTree(tabs.current()!.tree);
  setFocusedPane(tabs.current()!.focusedPane);
  renderPanes();
  // The document boot built the editor around is open, and is the focused one.
  // Said here rather than inside `makeEditor` because the open set is a fact
  // about the application, and the editor is one view onto it.
  opendocs.put({
    id: runtime.currentDoc.id,
    state: runtime.view.state,
    scrollTop: 0,
    prose: !!settings.prose,
  });
  opendocs.focus(runtime.currentDoc.id);
  // And the panes say which document they are showing, so the tab strip can
  // name itself the moment there is more than one tab.
  retargetPanes(null, runtime.currentDoc.id);
  refreshTabStrip();
  // A diagnostic that names a line has to be able to go there, and the line has
  // to be visible in the editor. `diagview` knows nothing about CodeMirror and
  // does not need to; it asks.
  // The source-note lint knows which notes want a ref; it does not know how to
  // go and get one, because that is a network errand to Girsa.
  onAttachRef(attachRefToNote);
  onGoToLine((line, column) => {
    const at = offsetOf(runtime.view, line, column);
    if (at != null) jumpTo(at);
  });
  onMarkLines((lines) => runtime.view.dispatch({ effects: setErrorLines.of(lines) }));
  save.onFileWritten(() => tellGirsaWhereItIs());
  applyTheme();
  applySourceZoom();
  applyPageView();
  applyUiDir();
  nameGutterMarks();
  applyPreview();
  updateCounts();
  // The three surfaces whose open state is a saved preference rather than a
  // thing the writer just did. `togglePanel(id, false)` on a panel that is
  // already closed does nothing at all — including running its close hook — so
  // this restores what was on without announcing anything about what was off.
  togglePanel("nikud-bar", settings.nikud);
  togglePanel("outline-drawer", settings.outline);
  togglePanel("notes-drawer", !!settings.notesPane);
  togglePanel("marks-drawer", !!settings.marksPane);
}

import "./styles.css";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { Compartment, EditorSelection, EditorState, Prec } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { historyKeymap, defaultKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
import { searchKeymap, search, openSearchPanel } from "@codemirror/search";
import {
  foldGutter,
  foldKeymap,
  foldAll,
  unfoldAll,
  foldEffect,
  foldService,
  bracketMatching,
} from "@codemirror/language";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import {
  ksavHighlighter,
  ksavFold,
  ksavFolding,
  proseMode,
  proseReveal,
  revealAll,
  setRevealAll,
  } from "./ksav-lang";
import { tagSelectExtension, tagContaining, selectTag, type TagSelection } from "./tagselect";
import { indentView, DEFAULT_INDENT } from "./indent";
import { tagDim } from "./tagdim";
import { minimapExtension, type Placement } from "./minimap";
import { openMinimap, closeMinimap, minimapIsOpen, wireMinimapPanel } from "./minimapstrip";
import { bracketLint, healAll } from "./bracket-lint";
import { pairedDelimiters, findNextCloser } from "./brackets";
import { apparatusLint, renderAllNotes } from "./apparatus-lint";
import { onAttachRef, sourceNoteMarks } from "./sourcenote-lint";
import { numberingMarks, renumberAll, scheduleRenumber } from "./numbering-lint";
import {
  deferredNotes,
  jumpDeferred,
  deferHere,
  recallHere,
  deferAll,
  inlineAll,
  sortDeferredBodies,
} from "./deferred-editor";
import { createBackend, sourcesOf } from "./api";
import * as panelviews from "./panelviews";
import { getLang, setLang, t, tf } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import * as opendocs from "./opendocs";
import * as panes from "./panes";
import * as tabs from "./tabs";
import {
  ACTION_COMMAND,
  BREAK_COMMAND,
  PLACED_COMMANDS,
  runRegisteredAction,
} from "./actions";
import * as files from "./files";
import {
  noteAt,
} from "./notes";
import { aliasesInForce } from "./bindings";
import * as sefarim from "./sefarim";
import * as spell from "./spell";
import {
  clearSpellCheck,
  forceFullSpellCheck,
  markSpellDirty,
  openSpellMenu,
  scheduleSpellCheck,
} from "./spellcheck";
import { hintFor, keybindings } from "./keyhint";

import * as entity from "./entity";
import * as styles from "./styles";
import { narrowing } from "./narrowing";

// The modules `main.ts` was split into, wave by wave, and what each one took —
// the map the refactor's end-state acceptance promised would live here:
//
//   store/save/compile/api — the bottom shelf: bytes, writes, the engine pipe.
//   runtime.ts — the seam: state and verbs every module shares (the open
//     document, the view, the status line, rerenderChrome). Nothing below
//     imports upwards past it.
//   settings + settingsdrawer — the app's own record, and its drawer.
//   rowlists/panelviews/snapshots/gitui/commandsdrawer/help — the list-dressed
//     panels and drawers (wave 6/7): rows, version control, help.
//   macros/hydra — the recorder and the structure keyboard (wave 5/7), the
//     engine vocabulary each in one file.
//   stylespanel/customstyles/stylecontrols — the formatting panel, the
//     writer's own styles (wave 8), and the knob family the borrowings share
//     (the audit's #152).
//   formmodal/destinations/reviewpanel/sectionsetup/formulas/noteschooser/
//     assets — the form's doors and the document's tenants (wave 9).
//   templates/fileui — the template doors and the bound file's UI half
//     (wave 11); applifecycle — the app's own life: crash, recovery, updates,
//     the service worker (the audit's #154).
//   starter/docswitch — the first screen, the welcome overlay and the switch
//     machine (wave 10, and the audit's #147 for the overlay's move),
//     borrowing makeState and syncGlobals through their wirings.
//   girsa — the panel feature (linkify, sources, mekoros) and now the handoff
//     poll beside it (spec.md §10.6; the audit's #147 for the move).
//   reveal — the source-says-here direction (wave 12 part 1, the audit's #147).
//   wiring/lintkit — the registration container every borrowing shares
//     (#145) and the lint glue three lints re-derived (#150).
//   What stayed: makeState and its extension composition, the compartments,
//   buildShortcutKeymap + reconfigureShortcuts, syncGlobals/setEditingMode,
//   boot(), and the header bar (its three main-locals are the settings
//     machinery wave 6 held — see #147's record) — the recipe for how the
//     whole app is assembled.
import {
  el,
  glyphBtn,
  iconBtn,
} from "./dom";
import * as runtime from "./runtime";
import { setStatus, closeMenus, jumpTo, editDoc } from "./runtime";
import {
  buildToolbar,
  buildDocsMenu,
  buildMacroMenu,
  buildFormatMenu,
  buildSourcesMenu,
  buildTableMenu,
  buildInsertMenu,
  lazyMenu,
  docTextNow,
  menu,
  wireChrome,
} from "./ribbon";
import { contextBar, updateContextBar } from "./contextbar";
import {
  openPanel,
  closePanel,
  togglePanel,
  isPanelOpen,
  wirePanel,
  closeOnEscape,
  handleEscape,
  closeOnOutsideClick,
  panelHead,
  panelLede,
  overlayPanel,
  localise,
  rebuildOpenPanels,
} from "./panels";
import { docTextOf, plainText, scanDoc } from "./spans";
import {
  settings,
  saveSettings,
  applyPreset,
  undoPreset,
  isPageField,
  docConfig,
  ownPageSetup,
  settingsLoadFailure,
  reportSettingsWriteFailures,
} from "./settings";
import type { Field, Settings, PageSetup, ValueOf } from "./settings";
// The alignment pair is read and written as a unit rather than field by field —
// see `alignRow` — so it comes in under a namespace instead of as four more
// names in the list above.
import { action, voidAction } from "./asyncaction";
import { actionName } from "./actions";
import { savedNameMap } from "./macros";
import * as save from "./save";
import { scheduleSave, reportSaveFailure } from "./save";
import { scheduleCompile, runCompile, compileNow, onStale, onAfterCompile, onSchedule } from "./compile";
import * as whitespace from "./whitespace";
import * as commands from "./commands";
import {
  applyPreview,
  currentPages,
  drawCurrentInto,
} from "./preview";
import {
  setPaneTree,
  setFocusedPane,
  paneTree,
  sourceViews,
  wirePanes,
} from "./panestate";
import { renderPanes, refreshPaneHeads, cyclePaneZoom, gotoPart } from "./panehost";
import { narrowHere, widenHere } from "./paneview";
import { swapPaneToward } from "./panedrag";
import { invalidateScrollMap, followCaretInPreview } from "./panescroll";
import {
  refreshPanes,
  selectTab,
  closeTab,
  newTab,
  newDocTab,
  retargetPanes,
  buildTabStrip,
  refreshTabStrip,
} from "./tabstrip";
import { openArrangements, applyPageView } from "./panearrangements";
import { isPlainClick } from "./jump";
import { BIDI_MARKS, bidiSupport, toggleIsolate, visibleBidiMarks } from "./bidi";
import { changeGutter, changeHighlight, changes, nameMarks } from "./changes";
import { focusCompartment, focusExtension } from "./focus";
import * as keymodes from "./keymodes";
import * as crash from "./crash";
import * as watch from "./watch";
import { overviewRuler } from "./ruler";
import { errorLineDecorations, errorLines, offsetOf, setErrorLines } from "./errorlines";
import { onGoToLine, onGoToPart, onMarkLines } from "./diagview";
import { nikudKeymap, buildNikudBar } from "./nikud";
import * as exports from "./exports";
import * as zoom from "./zoom";
import * as pagerange from "./pagerange";
import { troubleSaid } from "./diagnostics";
import { insertionAt } from "./mode";
import * as structure from "./structure";
import * as heads from "./headings";
import * as macros from "./macros";
import { openHelp, renderHelp, buildHelpPanel } from "./help";
import {
  toggleOutline,
  toggleNotesPane,
  toggleMarksPane,
  renderOutline,
  renderNotesPane,
  renderMarksPane,
  renderFindPane,
  openNoteMenu,
  drawList,
  LOOKS,
  wireRows,
} from "./rowlists";
import { buildSettingsDrawer, toggleSettings, captureShortcut, resetShortcuts, wireSettings } from "./settingsdrawer";
import { applyCustomStyle, unwrapCustomStyle, openNewStyle, openStyleEditor } from "./customstyles";
import { openStyles, openStylesFor, renderStylesPanel, wireStyles } from "./stylespanel";
import { destinationRows, wireDestinations } from "./destinations";
import { settlePendingModals, ask, askText } from "./formmodal";
import { markReview, addComment, isReviewOpen, openReview, renderReviewPanel } from "./reviewpanel";
import { openNotesChooser, applyNotePick, bodyHome, renderNotesChooser } from "./noteschooser";
import { addFont, removeAsset } from "./assets";
import { starterDoc, swapUntouchedStarter, searchPhrases, wireStarter, maybeOnboard } from "./starter";
import {
  startFromTemplate,
  loadTemplate,
  templatesForMenu,
  userTemplates,
  saveAsTemplate,
  deleteUserTemplate,
  wireTemplates,
} from "./templates";
import {
  openFile,
  saveFile,
  saveFileAs,
  reloadFromDisk,
  importWord,
  importOrg,
  copyShareLink,

  openSharedIfLinked,
  autosaveToFile,
} from "./fileui";
import { offerRecovery, maybeCheckForUpdate, registerServiceWorker, showCrashPanel } from "./applifecycle";
import { FILE_AUTOSAVE_MS } from "./save";
import { showChromeNotice, clearChromeNotice } from "./ribbon";
import {
  openDoc,
  openSwitcher,
  goToLastDoc,
  closeOpenDoc,
  refreshBaseline,
  renameDoc,
  updateTitleBar,
  loadBody,
  newDoc,
  wireDocswitch,
} from "./docswitch";
import { takeSnapshot, restoreSnapshot, openHistory, renderHistory, wireSnapshots } from "./snapshots";
import { refreshGit, openGit, gitForHeader, renderGitPanel, wireGit } from "./gitui";
import { openCommands, openKeys, buildCommandsDrawer, renderCommands } from "./commandsdrawer";
import {
  noteAction,
  noteTyped,
  noteSnippet,
  toggleRecording,
  savedMacros,
  playMacro,
  isRecording,
  wireMacros,
} from "./macros";
import { openHydra, resetHydra, wireHydra } from "./hydra";
import { revealCursor, revealPlaces, revealFromSourceClick, renderPlaces } from "./reveal";
import { insertSnippet, insertCommand, tieredNoteHere, snippetTab, docLang, wireInsert } from "./insert";
import * as hiding from "./hiding";
import { LIST_DEPTHS } from "./lists";
import * as lists from "./lists";
import {
  linkifySelection,
  refreshSources,
  askForMekor,
  tellGirsaWhereItIs,
  attachRefToNote,
  installGirsaPoll,
} from "./girsa";
import { openPalette, paletteKey, renderPaletteList, wirePalette } from "./palette";
import * as header from "./header";


/**
 * Reconfigure the compartments that belong to the *application* rather than to
 * the document, after a state swap.
 *
 * A state carries the compartment values it was built with, which is right for
 * the document's own — its prose mode, its direction — and wrong for everything
 * else: a state created before the writer switched to the dark theme would come
 * back light, and one created before they rebound a key would come back with
 * the old binding. Cheaper and far more reliable than trying to reach into every
 * stored state whenever a setting changes, and it runs once per switch.
 */
const proseCompartment = new Compartment();
const dirCompartment = new Compartment();
const themeCompartment = new Compartment();
const phraseCompartment = new Compartment();

const editorTheme = (dark: boolean) =>
  EditorView.theme(
    {
      // The source's own zoom, which is the half of *"zoom in the source and in
      // the preview"* that did not exist: this was a flat `15px`, so the one
      // surface a writing tool is for was the one surface whose size could not
      // be changed. `--source-zoom` is set on the root by `applySourceZoom`, and
      // the fallback keeps this rule correct before the first paint and in any
      // test that mounts an editor without the application around it.
      "&": { height: "100%", fontSize: "calc(15px * var(--source-zoom, 1))" },
      ".cm-content": {
        fontFamily: '"Frank Ruhl Libre","David Libre",serif',
        lineHeight: "1.7",
        caretColor: dark ? "#fff" : "#000",
      },
      ".cm-scroller": { overflow: "auto" },
      "&.cm-focused": { outline: "none" },
    },
    { dark },
  );

// ---------------------------------------------------------------- the application compartments
//
// The state carries the document's own compartments (prose, direction) and the
// shell re-reads the application's own after every swap: theme, focus, the
// shortcut keymap, the auto-complete, the structure keys. This is the notebook
// assembly the plan keeps in main — the recipe, not a feature.

function syncGlobals() {
  const effects = [
    themeCompartment.reconfigure(editorTheme(settings.theme === "dark")),
    focusCompartment.reconfigure(
      focusExtension(
        !!settings.focusMode,
        !!settings.typewriter,
        settings.typewriterAnchor ?? "center",
      ),
    ),
    shortcutCompartment.reconfigure(Prec.highest(keymap.of(buildShortcutKeymap()))),
    autoCompartment.reconfigure(autoExtension()),
    structureCompartment.reconfigure(Prec.high(keymap.of(structureKeymap()))),
    // The document's own, and it has to be re-read rather than inherited:
    // this is the incoming document's direction, not the outgoing one's.
    dirCompartment.reconfigure(EditorView.contentAttributes.of({ dir: docConfig().dir })),
  ];
  // Every source pane, because every source pane was just handed the incoming
  // document's state and a state carries the compartment values it was built
  // with. Reconfiguring only the focused one left the pane beside it on the
  // outgoing document's direction — a Hebrew sefer's panes rendering an English
  // one right-to-left, in the half of the window nobody was looking at.
  for (const v of sourceViews()) v.dispatch({ effects });
  // The editing mode is loaded asynchronously, so it is applied rather than
  // reconfigured inline — `applyMode` awaits the import and dispatches itself.
  voidAction("save_file", () => setEditingMode(settings.editingMode));
}

/**
 * Switch the editing mode, and rebuild Ksav's own keymap around the answer.
 *
 * The second half is not bookkeeping. `buildShortcutKeymap` returns nothing at
 * all while a mode is really installed — that is how the mode wins, instead of
 * by out-ranking anything — so the keymap has to be rebuilt *after* the import
 * resolves, and after a failed one too. Three call sites used to invoke
 * `applyMode` directly, and a fourth would have been added without this.
 */
async function setEditingMode(mode: unknown): Promise<void> {
  const want = keymodes.isMode(mode) ? mode : "default";
  // Every source pane, and this one is not a tidiness argument.
  //
  // A mode was installed into `runtime.view` alone, so a writer in vim who
  // split the window got a second pane with no vim in it — and a pane with no
  // vim does not lack a feature, it **writes your commands into the sefer**.
  // `i` was typed as the letter `i`, `dd` as the letters `dd`. Measured, not
  // reasoned about: `iCHET` in the new pane produced `iCHET` on the line while
  // the same keys in the pane beside it produced `CHET`.
  const views = sourceViews();
  // All panes together, not one behind the next: `applyMode` awaits a dynamic
  // import, and a serial loop reaches pane 1 before pane 4 — a window in which
  // half the panes have the mode and half do not, which for vim means half of
  // them are writing the writer's commands into the sefer (see above).
  await Promise.all((views.length ? views : [runtime.view]).map((v) => keymodes.applyMode(v, want)));
  reconfigureShortcuts();
}


// ---- configurable keyboard shortcuts ----
// Each action has an id (localized in Settings) and a runner. Keys are CM key
// strings ("Mod-b" etc.; Mod = Ctrl on Win/Linux, Cmd on macOS) and are user-
// overridable, persisted in settings.keybindings.
/**
 * Everything the writer can do, minus the macros.
 *
 * The macros are **not** in here, and that is the fix. They were —
 * `...macros.parseAll(settings.macros).map(…)`, spread into this array at
 * *module load*, under a comment saying `reconfigureShortcuts` runs after a
 * macro is saved. It does, and it rebuilds the keymap from this array, which by
 * then is the one that was frozen before the macro existed.
 *
 * So a macro recorded this session was denied by the palette and by Settings
 * while **Help listed it** — because `help.ts` re-parses `settings.macros` at
 * render time and is the only surface that did. Three views of one list, two of
 * them looking at a snapshot.
 */
/**
 * How deep a list-depth chooser goes.
 *
 * Three, and unlike the heading levels this one is a genuine judgement rather
 * than a leak: a list nested past three is rare and a chooser offering nine
 * depths of it would be nine rows nobody reads. The commands themselves have no
 * such limit — `foldAll` still takes everything.
 */

const BUILT_IN: { id: string; run: (v: EditorView) => boolean }[] = [
  // Every action that inserts a registry command, generated from the one table
  // that says which. Hand-listing them here is what let the bullet list come out
  // two different ways depending on how you asked for it — see `actions.ts`.
  ...Object.entries(ACTION_COMMAND)
    .filter(([id]) => !(PLACED_COMMANDS as readonly string[]).includes(id))
    .map(([id, he]) => ({
      id,
      run: () => insertCommand(he),
    })),
  // The one door in that table that places its command rather than splicing it
  // in. See `addContentsHere`.
  { id: "toc", run: () => addContentsHere() },
  // #89 — the minimap strip. In `BUILT_IN` so the binding in `DEFAULT_KEYS`, the
  // palette and the Settings list all resolve it: a chord in `DEFAULT_KEYS` with
  // **no action behind it** is a chord that silently does nothing, which is how
  // `Ctrl-Alt-Shift-M` appeared to be a dead key rather than a missing one.
  { id: "minimap", run: () => (toggleMinimap(), true) },
  {
    id: "tieredNote",
    run: () => {
      const st = runtime.view.state;
      insertSnippet(tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
      return true;
    },
  },
  {
    // Put every series back in sequence, on demand. The lint offers this on the
    // line it marks; an action makes it bindable, findable in the palette and
    // recordable in a macro — which is how everything a writer can do is
    // reachable here, and what a repair that only exists inside a lint is not.
    id: "renumber",
    run: (v) => {
      const n = renumberAll(v);
      setStatus(n ? tf("renumbered", n) : t("renumberedNothing"), n ? "ok" : "");
      return true;
    },
  },
  // The verb the product had no word for: take what is written and make it a
  // list, reading the numbers the writer typed by hand and throwing them away.
  { id: "makeList", run: () => makeListHere() },
  // Selecting a whole construct, and taking one off. See `entity.ts` for why
  // all three are generic over `Node` rather than a list of command names.
  //
  // `entitySelect` widens on every press, which is why it is the one bound
  // nearest to hand: *see the extent before you act on it* is the whole answer
  // to "hand-deleting a command name, its parentheses, its brackets and its
  // arguments", and the two that follow are then unmissable.
  { id: "entitySelect", run: () => entityAct("select") },
  { id: "entityUnwrap", run: () => entityAct("unwrap") },
  { id: "entityRemove", run: () => entityAct("remove") },
  // One question — does this reach the page? — asked three ways. See `hiding.ts`.
  { id: "fold", run: () => (insertFold(), true) },
  { id: "hideBlock", run: () => (hideBlockHere(), true) },
  { id: "hideLine", run: () => (hideLineHere(), true) },
  { id: "hiddenBreak", run: () => (hiddenBreak(), true) },
  // The visible line break, given a key of its own. Not in `ACTION_COMMAND`
  // because it lives in `BREAK_COMMAND` with the family — the same reason
  // `hiddenBreak` is hand-listed here rather than generated.
  { id: "lineBreak", run: () => insertCommand(BREAK_COMMAND.lineBreak) },
  // `paraBreak` and `pageBreak` used to be hand-written here. They are in
  // `ACTION_COMMAND` now, so their doors are generated with every other command
  // action above — which is what makes the registry row for each print the key
  // that also runs it. See `actions.BREAKS`.
  { id: "undo", run: (v) => undo(v) },
  { id: "redo", run: (v) => redo(v) },
  // Lay the sefer out now. Bound and in the palette under every setting, not
  // only `manual`: "compile now" in the middle of a relaxed wait is a thing
  // writers press, and a control that exists only under one setting is one
  // nobody learns.
  { id: "compileNow", run: () => (compileNow(), true) },
  { id: "palette", run: () => (openPalette(), true) },
  { id: "commandsDrawer", run: () => (openCommands(), true) },
  { id: "gitPanel", run: () => (openGit(), true) },
  { id: "keysDrawer", run: () => (openKeys(), true) },
  // Which sefer a search reads is a setting, so which surface opens is too.
  // `source` is the default and is what this has always done — the editor's own
  // find panel over the buffer. The other two open the find drawer, which is
  // the only surface that can show a hit on a page.
  { id: "find", run: (v) => startFind(v) },
  { id: "foldAll", run: (v) => foldAll(v) },
  { id: "unfoldAll", run: (v) => unfoldAll(v) },
  // Lock this pane to the section the caret is in, and let it out again. On the
  // focused pane and nowhere else — `v` is `runtime.view`, which is the pane the
  // writer is typing in, and narrowing every pane at once would destroy the one
  // arrangement the feature exists for.
  { id: "narrow", run: (v) => (narrowHere(v), true) },
  { id: "widen", run: (v) => (widenHere(v), true) },
  // Move the caret past the closing bracket of the current bracket pair.
  { id: "moveOutOfBracket", run: (v) => moveOutOfBracket(v, false) },
  { id: "moveOutOfBracketToNextLine", run: (v) => moveOutOfBracket(v, true) },
  // Fold *to a depth*: chapters only, or chapters and simanim. `foldAll` takes
  // every collapsible thing in the document down at once, which is a different
  // question and the only one this editor could answer.
  // Every level the editor can write, not the three that had chords. Three was
  // the count of *keys somebody had bound*, and it had become the count of
  // depths the product could fold to — the same six-versus-nine leak the
  // heading styling had. An action exists for each, so the palette and the menu
  // reach all of them and the keyboard keeps the three that are worth a chord.
  ...Array.from({ length: heads.MAX_LEVEL }, (_, i) => i + 1).map((level) => ({
    id: `foldLevel${level}`,
    run: (v: EditorView) => (foldToLevel(v, level), true),
  })),
  // The other nesting in this product, and the half of the report that had
  // nothing at all: *"the same for the siman/seif hierarchy and for lists, each
  // of which has its own nesting"*. Simanim are headings — `#סימן` is
  // `heading(level: 1, …)`, which is why the levels above already reach them —
  // but a list's depth is its own, and no surface could ask about it.
  ...LIST_DEPTHS.map((depth) => ({
    id: `foldListDepth${depth}`,
    run: (v: EditorView) => (foldListsToDepth(v, depth), true),
  })),
  { id: "save", run: () => (saveFile(), true) },
  { id: "open", run: () => (openFile(), true) },
  { id: "newDoc", run: () => (newDoc(), true) },
  { id: "markInsert", run: () => (markReview("insert"), true) },
  { id: "markDelete", run: () => (markReview("delete"), true) },
  { id: "addComment", run: () => (addComment(), true) },
  // Every structural operation, generated. Hand-listing them here would be the
  // same mistake the ribbon used to make: a second place to forget one.
  ...structure.STRUCTURE_ACTIONS.map((a) => ({
    id: a.id,
    run: () => runStructureAction(a),
  })),
  {
    id: "help",
    run: () => (openHelp(), true),
  },
  {
    // Record / stop. One action rather than two, because "am I recording?" is a
    // state the writer can see in the chip and the status line.
    id: "macroRecord",
    run: () => (toggleRecording(), true),
  },
  {
    // Replay the most recently recorded macro — the one people want immediately
    // after recording, without naming or binding anything.
    id: "macroPlay",
    run: () => {
      const all = savedMacros();
      if (!all.length) {
        setStatus(t("macroNone"), "");
        return true;
      }
      playMacro(all[all.length - 1]);
      return true;
    },
  },
  {
    // Every citation in the document, as the library has it now (spec.md
    // §10.2). An action rather than a bare key, so it is findable in the
    // palette, bindable, and listed in Settings — which is how everything else
    // a writer can do is reachable, and the reason this one had no way in was
    // that it had no entry anywhere at all.
    id: "refreshSources",
    run: () => (void refreshSources(), true),
  },
  {
    // Look this phrase up in the library (spec.md §10.4). It answered to
    // `Ctrl+Shift+M` from a literal `e.key` test on the window, which is the
    // same "no entry anywhere" the comment above describes — one rung further
    // down, because a key that is not in `DEFAULT_KEYS` is not merely
    // unlisted: it cannot be rebound, it survives a keyboard mode that has
    // taken the whole keyboard, and no test can see it.
    id: "citePhrase",
    run: () => (void askForMekor(), true),
  },
  {
    // The citations in the selection, made live (spec.md §10.5). Same story,
    // and worse: its chord was `left`'s. Both ran.
    id: "linkifyCitations",
    run: () => (void linkifySelection(), true),
  },
  {
    // The hydra for whatever the caret is in.
    id: "hydra",
    run: () => (openHydra(), true),
  },
  {
    // Notes that were collected and never rendered. Reachable as a command and
    // as a key, not only as a lint action: a writer who has already exported
    // the PDF needs to find this without a squiggle to click.
    id: "renderNotes",
    run: (v) => {
      const n = renderAllNotes(v);
      setStatus(n ? tf("renderedNotesCount", n) : t("renderedNotesNone"), n ? "ok" : "");
      return true;
    },
  },
  {
    id: "healBrackets",
    run: (v) => {
      const n = healAll(v);
      setStatus(n ? tf("healedCount", n) : t("healedNothing"), n ? "ok" : "");
      return true;
    },
  },
  // Deferred note bodies. `deferJump` is the one that gets used: it is org-mode's
  // C-c C-c — marker to prose, prose to marker, and it writes the prose when
  // there is none rather than complaining that there is none.
  // Forward search: where did what I am typing print? The pair to clicking the
  // preview, which needs no key because it has a mouse.
  { id: "revealCursor", run: () => (voidAction("general", () => revealCursor()), true) },
  // The same question asked a second way (#82). `revealCursor` goes to the first
  // place a line printed, because a cursor has one place to be and reading order
  // is the right default; this opens **every** place, so a part that is included
  // twice can be pointed at deliberately. The list is the answer to a question
  // the first-place answer cannot express.
  { id: "revealPlaces", run: () => (voidAction("general", () => revealPlaces()), true) },
  // The manual override for when the automatic isolation does not reach.
  { id: "isolate", run: (v) => toggleIsolateSelection(v) },
  {
    // Suggestions for the word the caret is in. The pointer route is a
    // right-click; this is the one that does not need a pointer at all, and it
    // is also what the hover tooltip names — a signpost pointing at a key that
    // does not exist is worse than no signpost.
    id: "spellSuggest",
    run: (v) => {
      if (!settings.spellcheck) {
        setStatus(t("spellOff"), "warn");
        return true;
      }
      const m = spell.misspellingAt(v, v.state.selection.main.head);
      if (!m) {
        setStatus(t("spellNothingHere"), "");
        return true;
      }
      // Anchored to the word rather than to a pointer that was never here.
      const at = v.coordsAtPos(m.start);
      void openSpellMenu(m, at ? at.left : 0, at ? at.bottom : 0);
      return true;
    },
  },
  // The open set, from the keyboard. Both of them, because they answer different
  // questions: `lastDoc` is "back to the one I was in" and needs no reading,
  // `switcher` is "show me what I am holding" and does.
  { id: "lastDoc", run: () => (goToLastDoc(), true) },
  { id: "switcher", run: () => (openSwitcher(), true) },
  { id: "closeDoc", run: () => (voidAction("save_file", () => closeOpenDoc(runtime.currentDoc.id)), true) },
  { id: "newTab", run: () => (newTab(), true) },
  { id: "pane.zoom", run: () => (cyclePaneZoom(), true) },
  { id: "newDocTab", run: () => (voidAction("save_file", () => newDocTab()), true) },
  { id: "closeTab", run: () => (closeTab(tabs.activeIndex()), true) },
  // Round, in both directions. Round because a key that stops at the end is a
  // key you have to look at the screen to use; **both** directions because
  // round motion in one direction is only an answer for a writer who knows how
  // many arrangements there are, which is the counting the report *"or to move
  // from tab to tab"* was complaining about.
  //
  // Generated from the pair, so the two cannot drift into disagreeing about
  // what the strip's order is.
  ...([["nextTab", 1], ["prevTab", -1]] as const).map(([id, step]) => ({
    id,
    run: () => {
      const n = tabs.count();
      if (n > 1) selectTab((tabs.activeIndex() + step + n) % n);
      return true;
    },
  })),
  // Move this pane to where its neighbour is. Four actions rather than one
  // toggle, because a window is a tree and not a pair — see `panes.swap` for
  // what the operation is and `panes.neighbor` for how the side is decided.
  // Generated, so the four cannot drift apart from each other.
  ...(["left", "right", "up", "down"] as panes.Side[]).map((side) => ({
    id: `pane.swap${side[0].toUpperCase()}${side.slice(1)}`,
    run: () => swapPaneToward(side),
  })),
  { id: "deferJump", run: (v) => (jumpDeferred(v), true) },
  { id: "deferHere", run: (v) => (deferHere(v, docLang()), true) },
  { id: "deferRecall", run: (v) => (recallHere(v), true) },
  // Both directions, both bindable, both findable in the palette. The bulk moves
  // lived only on two buttons inside the notes chooser, which meant "change where
  // the bodies live" was a thing you could do only if you first opened a modal
  // about note *layouts* — a different question.
  { id: "deferAll", run: (v) => (deferAll(v), true) },
  { id: "deferRecallAll", run: (v) => (inlineAll(v), true) },
  { id: "deferSort", run: (v) => (sortDeferredBodies(v), true) },
  // Zoom, on the surface the writer is standing in. `zoom.surfaceOf` is where
  // that rule is written down; this is the three doors to it.
  { id: "zoomIn", run: () => stepZoom(1) },
  { id: "zoomOut", run: () => stepZoom(-1) },
  { id: "zoomReset", run: () => stepZoom(0) },
  // Keep this point in the history, now. It existed only as a button inside the
  // history panel — a door you have to already be behind — which is half of what
  // *"or automatic turned off and taken by hand"* was asking for: turning the
  // clock off is no use if the hand has nowhere to press.
  { id: "snapshot", run: () => (void takeSnapshot(true), true) },
];

/**
 * Every action, including the macros saved since the page loaded.
 *
 * A function and not an array: a macro recorded this session has to be
 * bindable, findable in the palette and listed in Settings *now*, and the only
 * way an array can promise that is by being rebuilt — which is what the module
 * comment above `BUILT_IN` says was assumed and was not happening.
 *
 * Macros last, so an ordinary action keeps the position it has always had in
 * the shortcut list.
 */
function actions(): { id: string; run: (v: EditorView) => boolean }[] {
  return [
    ...BUILT_IN,
    // Every saved macro, as an action — which is what makes a macro bindable to
    // a key, findable in the palette and listed in Settings with no extra
    // wiring.
    ...savedMacros().map((m) => ({
      id: macros.actionIdOf(m),
      run: () => (playMacro(m), true),
    })),
    // **Every style this document defines, as an action.** Which is the whole
    // of *"each style should be assignable a key combination, and that binding
    // must appear wherever the style appears and in the shortcut list"*: being
    // in this list is what makes something bindable, and everything that shows
    // a chord — the keys drawer, the palette, the style dropdown, the vim and
    // Emacs command names — reads from here. A styles-only binding table would
    // have been a second answer to a question already answered once, and it
    // would have been the one that went stale.
    //
    // Per *document*, because a style is: the keymap is reconfigured whenever
    // the set of names changes, which is the same moment the dropdown is
    // refilled.
    ...styleActions(),
  ];
}

/**
 * The open document's own styles, as bindable actions.
 *
 * Guarded on the view existing: `actions()` is reachable before the editor is
 * built (the palette and the keymap are both assembled early), and reading the
 * document then is a crash on the first keystroke of the session.
 */
function styleActions(): { id: string; run: (v: EditorView) => boolean }[] {
  if (!runtime.view) return [];
  return styles.findCustomStyles(docTextNow()).map((st) => ({
    id: styles.styleActionId(st.name),
    run: () => applyCustomStyle(st.name),
  }));
}



function buildShortcutKeymap(): KeyBinding[] {
  // A mode that is really here takes the whole keyboard.
  //
  // Not a precedence, and that is the fix. The mode's keymap and this one were
  // both `Prec.highest` with the mode placed first, and the promise that the
  // mode wins rested on CodeMirror breaking that tie by array order. It broke
  // the other way in the production build and Emacs mode did nothing at all —
  // `C-k` killed nothing, `Ctrl+K` opened Ksav's palette — while the same page
  // in Vim mode worked, because vim bypasses the keymap facet entirely. Nothing
  // that returns no bindings can lose a tie.
  //
  // `activeMode`, not the setting: a failed fetch leaves the writer with plain
  // editing, and standing these down for a mode that never arrived would be an
  // editor with no keys at all. Every action is still reachable as `:name` and
  // under `M-x` — see `keymodes.registerCommands`.
  if (keymodes.activeMode() !== "default") return [];
  const kb = keybindings();
  const bindings: KeyBinding[] = [...nikudKeymap(scheduleCompile)];
  // Which aliases survive is `bindings.aliasesInForce`, not a `claimed` set built
  // here: it is the same rule the settings panel needs when it warns about a
  // conflict, and two copies of it is how one of them stops matching.
  const aliases = aliasesInForce(kb);
  for (const a of actions()) {
    // Structural operations are bound in `structureKeymap` instead. This keymap
    // sets `preventDefault`, which swallows the key whether or not the command
    // ran — fine for Mod-Alt-b, fatal for Enter and Tab, which must reach the
    // editor untouched the moment the caret leaves a list.
    if (structure.actionById(a.id)) continue;
    // Through `runAction`, not `a.run`. This binding is the path the macro
    // recorder is *for* — "I just did this fiddly thing eleven times" is done
    // with the keyboard — and calling `run` directly is what made every one of
    // these operations invisible to it.
    const press = (v: EditorView) => runAction(a.id, v);
    if (kb[a.id]) bindings.push({ key: kb[a.id], run: press, preventDefault: true });
    for (const alias of aliases[a.id] ?? []) {
      bindings.push({ key: alias, run: press, preventDefault: true });
    }
  }
  return bindings;
}
const shortcutCompartment = new Compartment();
function reconfigureShortcuts() {
  const effects = [
    shortcutCompartment.reconfigure(Prec.highest(keymap.of(buildShortcutKeymap()))),
    // Both, or rebinding Tab in Settings would change the shortcut list and
    // leave the editor still doing the old thing.
    structureCompartment.reconfigure(Prec.high(keymap.of(structureKeymap()))),
  ];
  // Every source pane. A binding is a property of the application, not of the
  // pane that happened to have focus when it was changed — rebinding a key with
  // the window split used to leave the other pane on the old one, which is a
  // shortcut list that is true of half the screen.
  for (const v of sourceViews()) v.dispatch({ effects });
}

/** Convert a keydown event to a CodeMirror key string ("Mod-Shift-k").
 *
 * **From `e.code`, deliberately, and the cost is on record.** `e.code` is the
 * physical key, so a chord means the same keycap on every layout — a Hebrew
 * writer pressing the key printed `B` gets the binding printed beside the menu
 * item. CodeMirror's own keymaps match `e.key`, which *is* layout-dependent:
 * on the same layout CM reads that press as its Hebrew letter. So the two
 * resolvers in this application disagree about what a press *is* — this one
 * names keycaps, CM names characters — and a binding whose `DEFAULT_KEYS`
 * value is a character with no keycap identity (`"-"`, `"?"`) resolves only
 * on the layout that produced it. The table in `bindings.ts` is written in
 * letters and digits, which is what keeps the two honest; a character-key
 * binding added there will work in the editor and not outside it, and
 * `runShortcutOutsideEditor`'s comment is where the mode rule lives.
 */
function eventToKey(e: KeyboardEvent): string | null {
  const code = e.code;
  if (["ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight"].includes(code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(codeToKey(code));
  return parts.join("-");
}

/** Convert a physical key code to the logical key name CodeMirror expects. */
function codeToKey(code: string): string {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("F") && /^F\d+$/.test(code)) return code;
  if (code.startsWith("Arrow")) return code;
  const special: Record<string, string> = {
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    CapsLock: "CapsLock",
    ContextMenu: "ContextMenu",
  };
  return special[code] ?? code;
}

/** What to call a command that is not the registry's. */
function whose(from: "registry" | "document" | "yours"): string {
  if (from === "document") return t("fromDocument");
  if (from === "yours") return t("fromYou");
  return "";
}

// What commands this document has is `commands.ts`'s question, and the compiler,
// the completions and the palette all ask it there. `userCommandNames` used to live
// here, read `settings.customCommands` only — disagreeing with `compile.ts` about a
// shared sefer's own commands — and had exactly one caller (B27).

// Command autocomplete: typing `#` offers Ksav commands from the registry plus
// any user-defined commands. Not a dictionary — only triggers on `#`.
function ksavCompletions(context: CompletionContext): CompletionResult | null {
  // A sefer name where a sefer name goes. Checked first, because inside
  // `#ציון_מקור("…` the `#` match below would still fire on the command itself
  // and offer commands in the middle of an argument.
  const cite = sefarimCompletions(context);
  if (cite) return cite;
  const word = context.matchBefore(/#[A-Za-z֐-׿_]*/u);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;
  const q = word.text.slice(1).toLowerCase();
  const insertApply =
    (raw: string) => (v: EditorView, _c: unknown, from: number, to: number) => {
      // The completion fired because a `#` was typed — but inside an argument
      // list that `#` is itself the error, so the completion replaces it with
      // the bare call rather than completing a mistake into a longer mistake.
      const snip = insertionAt(docTextOf(v.state.doc), from, raw, to);
      const pipe = snip.indexOf("|");
      const text = pipe >= 0 ? snip.slice(0, pipe) + snip.slice(pipe + 1) : snip;
      const cursor = pipe >= 0 ? from + pipe : from + text.length;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: cursor } });
    };
  // One list, from `commands.ts`. It carries the *document's* own commands when the
  // document has any, so a shared sefer's `#` completion offers what its compiler
  // will actually run.
  // The name in the language this document is written in, because that is the
  // name that will be in the source a moment later — and the *other* spelling
  // in the detail column, because a bilingual registry's second name is worth
  // knowing and this is the one surface with room to show it.
  const writing = docLang();
  const options = commands
    .available(runtime.commandsReg)
    .filter((c) => commands.matches(c, q))
    .map((c) => {
      const here = writing === "he" ? c.name : (c.en ?? c.name);
      const other = writing === "he" ? c.en : c.name;
      return {
        label: "#" + here,
        detail: (c.from === "registry" ? other : undefined) ?? whose(c.from),
        info: c.from === "registry" ? (getLang() === "he" ? c.desc_he : c.desc_en) : whose(c.from),
        apply: insertApply(c.insert),
      };
    });
  return { from: word.from, options, filter: false };
}

/**
 * Sefer names, offered inside a citation's first argument.
 *
 * What it inserts is the **canonical** name, not the abbreviation that was
 * typed: the index files a citation under the canonical name anyway, so
 * completing to it means the page and the index agree about what the sefer is
 * called without anyone doing a copy-editing pass.
 */
function sefarimCompletions(context: CompletionContext): CompletionResult | null {
  const arg = sefarim.seferArgAt(docTextOf(context.state.doc), context.pos);
  if (!arg) return null;
  if (arg.query === "" && !context.explicit) return null;
  const hits = sefarim.suggest(arg.query);
  if (!hits.length) return null;
  return {
    from: arg.from,
    to: arg.to,
    filter: false,
    options: hits.map((s) => ({
      label: s.canonical,
      // The abbreviations, so a writer can see that ב״ב is a thing they may type
      // and that it will come out as בבא בתרא.
      detail: s.aliases.join(" · "),
      apply: s.canonical,
    })),
  };
}
const autoCompartment = new Compartment();

// ---------------------------------------------------------------- pairing
//
// Which delimiters close themselves, as two switches rather than one.
//
// They are two questions and were one hard-coded answer. Brackets pairing is
// liked and stays on. Quotes are the ones that cannot be assumed: in a Hebrew
// document `"` is the gershayim of רש״י and שו״ע and `'` is the geresh of ר'
// — both sit *inside* words, several times a line, and pairing them turns
// ordinary typing into a fight. That is why they ship off. It is not a reason to
// withhold them from a writer setting an English sefer, or from anyone who wants
// them; it is a reason for the default and for the note under the switch.
const pairCompartment = new Compartment();

function pairExtension() {
  // `closeBrackets` takes its list from language data, and Ksav's highlighter is
  // a regex scanner with no grammar behind it, so the data is provided directly
  // rather than by a language.
  const brackets = pairedDelimiters(
    settings.autoPairBrackets !== false,
    !!settings.autoPairQuotes,
  );
  return EditorState.languageData.of(() => [{ closeBrackets: { brackets } }]);
}

/** Draw the whitespace that is not prose, or nothing at all. */
function whitespaceExtension() {
  return settings.showWhitespace ? whitespace.whitespaceMarks() : [];
}

/**
 * A compartment for the above, and not a flag read inside the plugin.
 *
 * The plugin is a `ViewPlugin`, so a setting read inside it would be read once at
 * construction and then never again — the marks would keep showing, or keep not
 * showing, until the document was swapped. `pairExtension` above has the same
 * requirement and the same answer, which is why this sits beside it rather than
 * inventing a second arrangement.
 *
 * **Its own compartment, and not one shared with the pairing switches** — which is
 * the whole point of `whitespace.ts`. Those two replace ranges and this one does
 * not, so all three are free together. `bidi.ts:452` is why that is worth writing
 * down: two replacements over one range blanks the editor rather than merely
 * looking wrong.
 */
const whitespaceCompartment = new Compartment();

function autoExtension() {
  return settings.autocomplete === false
    ? []
    : autocompletion({ override: [ksavCompletions], icons: false });
}

/**
 * What goes in the prose compartment: the "looks like Word" view, or the raw
 * view's own extras.
 *
 * One compartment holds both because they must never both be installed. Prose
 * mode hides command syntax with replace decorations and the bidi-mark chips
 * replace single characters; a control character inside hidden syntax would be
 * replaced twice, which CodeMirror does not merely draw oddly — it rejects the
 * whole decoration set and the editor goes blank. Putting them in one slot makes
 * that impossible instead of forbidden.
 */
function proseOrRaw(prose = proseHere()) {
  // The field and the plugin that drives its deferred reveal go in together:
  // `proseReveal` is the only thing that draws what a cursor move owes, so a
  // prose view installed without it would hide a command under the caret and
  // never take it back. They are one extension for the same reason the two
  // halves of this compartment are one slot — the pairing is enforced by there
  // being nowhere to install one of them alone.
  return prose ? [proseMode, proseReveal] : visibleBidiMarks(bidiMarkName);
}

/**
 * Prose or raw, for the document on screen.
 *
 * `settings.prose` is now the default a *newly opened* document starts from,
 * not the answer for the one in front of you. That is the fix for *"I closed
 * this document and reopened it, and it went into prose mode"*: the mode was an
 * application-wide flag, so it could not be remembered per document because
 * there was nowhere for it to be remembered.
 *
 * Falls back to the setting before anything is open, which is the state `boot`
 * is in when it builds the first editor.
 */
function proseHere(): boolean {
  const id = opendocs.focusedId();
  const doc = id ? opendocs.opened(id) : undefined;
  return doc ? doc.prose : !!settings.prose;
}

/** Set prose or raw for the document on screen, and remember it there. */
function setProseHere(prose: boolean) {
  const id = opendocs.focusedId();
  const doc = id ? opendocs.opened(id) : undefined;
  if (doc) doc.prose = prose;
  // Still written to settings, because it is the default the *next* document
  // opens with, and a writer who works in raw should not have to say so again
  // for every document they open.
  settings.prose = prose;
  saveSettings();
  runtime.view.dispatch({ effects: proseCompartment.reconfigure(proseOrRaw(prose)) });
  rerenderChrome();
}

/** What to call a bidi control character, in the interface's language. */
function bidiMarkName(code: number): string {
  const mark = BIDI_MARKS[code];
  if (!mark) return "";
  return `${mark.tag} — ${getLang() === "en" ? mark.en : mark.he}`;
}

/**
 * Wrap the selection in a directional isolate, or take one off.
 *
 * The escape hatch for when the automatic isolation in `bidi.ts` does not cover
 * a case — an inline raw run, a citation with brackets in it — which is a real
 * category rather than a hypothetical one, and until now had no answer but
 * pasting an invisible character in from somewhere else.
 *
 * With nothing selected there is nothing to isolate, and saying so is better
 * than dropping an empty pair into the document where it will never be found.
 */
function toggleIsolateSelection(v: EditorView): boolean {
  const range = v.state.selection.main;
  if (range.empty) {
    setStatus(t("isolateNeedsSelection"), "warn");
    return true;
  }
  const text = v.state.sliceDoc(range.from, range.to);
  const next = toggleIsolate(text);
  v.dispatch({
    changes: { from: range.from, to: range.to, insert: next },
    // Keep the writer's own text selected, not the marks around it — the
    // selection is what they chose, and a second press must undo the first.
    selection: { anchor: range.from, head: range.from + next.length },
  });
  setStatus(next.length < text.length ? t("isolateRemoved") : t("isolateAdded"), "ok");
  return true;
}

/**
 * A fresh editor state for one document.
 *
 * The extensions used to be spelled inline in `new EditorView({…})`, which meant
 * there was exactly one state for the life of the tab and therefore exactly one
 * text, one caret and one undo history — the whole of the "no concept of an open
 * document" finding, expressed as a constructor call. A state per open document
 * is CodeMirror's own answer, and `opendocs.ts` is where they are kept.
 *
 * `prose` is a parameter rather than a read of `settings.prose` because it is a
 * property of the document now: a writer marking up somebody else's source and
 * one composing a sefer want opposite answers and may hold both open at once.
 * The setting remains the default a newly opened document starts from.
 *
 * `at` is where the caret starts, and it is optional because most callers are
 * opening a document rather than opening a second window onto one somebody is
 * already reading. A split is the case that needs it: see `renderLeaf`.
 */
function makeState(body: string, prose: boolean, at?: number): EditorState {
  return EditorState.create({
    doc: body,
    ...(at === undefined ? {} : { selection: { anchor: Math.max(0, Math.min(at, body.length)) } }),
    extensions: [
      // In a compartment, and owned by `runtime.ts`, because a document swap
      // has to be able to throw the stack away. See `swapDocument` there.
      runtime.historyExtension(),
      drawSelection(),
      highlightActiveLine(),
      ksavFolding,
      foldGutter(),
      bracketMatching(),
      // #86 — click an opening `[` and the tag selects. `Alt`+click gives the other
      // answer, so the setting below is about what a bare click means and not about
      // which of the two is reachable.
      tagSelectExtension(() => settings.clickSelectsTag ?? "whole"),
      // #85 — dim every line outside the tag the caret is in, with the fade
      // graded by nesting. `0` means off, and off is free.
      tagDim(() => (settings.dimOutsideTag ?? 0) / 100),
      // #89 — the minimap. It lives in *this* editor and draws on a canvas, so
      // there is no second copy of the document; `null` is a closed panel.
      minimapExtension(() => ({
        on: !!settings.minimap,
        colors: !!settings.minimapColors,
      })),
      // #84 — the indent view. Every dial is the writer's own number, read per
      // rebuild so the toggle and the settings reconfigure rather than being
      // captured once at construction.
      indentView(() => ({
        ...DEFAULT_INDENT,
        on: !!settings.indentView,
        amount: settings.indentAmount ?? DEFAULT_INDENT.amount,
        minWords: settings.indentMinWords ?? DEFAULT_INDENT.minWords,
        percent: settings.indentPercent ?? DEFAULT_INDENT.percent,
      })),
      // The answer to "three characters is too many to type all day". A fold's
      // marks have to be comments or the page would print them, Typst's comment
      // is `//`, and one brace after it is the shortest brace-like thing that
      // can follow — so `//{` is the floor, not a choice. What can be bought is
      // the rest: finish the opener and the editor writes the closer, the line
      // between them and the caret. Above `closeBrackets`, which would otherwise
      // answer the same `{` with a `}` that prints.
      EditorView.inputHandler.of((view, from, to, text) => {
        if (text !== "{") return false;
        const sel = view.state.selection.main;
        if (!sel.empty || from !== sel.from || to !== sel.to) return false;
        const doc = docTextOf(view.state.doc);
        const closer = hiding.foldCloser(doc, from);
        if (!closer) return false;
        view.dispatch({
          changes: { from, to, insert: "{" + closer.insert },
          selection: { anchor: closer.caret },
          userEvent: "input.type",
        });
        return true;
      }),
      closeBrackets(),
      // What it is allowed to close: two switches, in a compartment because they
      // are settings. Typst's `$…$` pairs with the brackets — typstify's
      // `editor/typst.go` does the same, and `$…$` works in a Ksav body because
      // the body *is* Typst. The gershayim ships **off**, for the reason
      // `brackets.ts` gives at length: `"` is not a delimiter in a Hebrew
      // document, because רש״י and שו״ע are everywhere and pairing quotes
      // swallows whole tables. Off is a default, not a refusal — see
      // `pairExtension`.
      pairCompartment.of(pairExtension()),
      whitespaceCompartment.of(whitespaceExtension()),
      search({ top: true }),
      phraseCompartment.of(EditorState.phrases.of(searchPhrases())),
      // The hydra is *not* here, and that is the fix rather than an omission.
      // It was `Prec.highest(keymap.of(hydraKeymap()))` a dozen lines below,
      // under a comment claiming it was "ahead of everything, including the
      // mode keymaps". It was not, and no position in this array could have
      // made it so: `@replit/codemirror-vim` handles keys from a **ViewPlugin
      // event handler** (`vimPlugin`, `keydown`), and a plugin's DOM handlers
      // run before the `keymap` facet regardless of precedence. See
      // `captureHydraKeys`, which owns the keyboard by actually being first.
      //
      // Vim / Emacs, when one is chosen. Deliberately *before* the shortcut
      // keymap: both are Prec.highest and CodeMirror breaks that tie by array
      // order, so the mode gets first refusal on every key. See `keymodes.ts`
      // for why the mode wins rather than Ksav's own bindings.
      keymodes.modeCompartment.of([]),
      // Dim everything but the paragraph in hand, and keep the caret line
      // centred. Two settings, in one compartment because they are reconfigured
      // together and never independently.
      focusCompartment.of(
        focusExtension(
          !!settings.focusMode,
          !!settings.typewriter,
          settings.typewriterAnchor ?? "center",
        ),
      ),
      shortcutCompartment.of(Prec.highest(keymap.of(buildShortcutKeymap()))),
      autoCompartment.of(autoExtension()),
      // Structural keys, above the defaults: inside a list, Enter makes the next
      // bullet and Tab indents it, exactly as in Word and every outliner. They
      // fall through untouched everywhere else, so Enter is still Enter in
      // ordinary prose.
      structureCompartment.of(Prec.high(keymap.of(structureKeymap()))),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...foldKeymap,
        snippetTab,
        indentWithTab,
      ]),
      EditorView.lineWrapping,
      ksavHighlighter,
      ksavFold,
      bracketLint,
      // Notes collected and never rendered: valid source, finished-looking page,
      // and the prose missing from it.
      apparatusLint,
      // A source note that is not in the source index says so, on its own line.
      // See `sourcenote-lint.ts`: the whole value of the command is the half
      // that does not print, and nothing on screen said which kind you had.
      sourceNoteMarks,
      // A siman or a se'if whose number no longer says where it is. The
      // insertion path resequences on insert; this is the half that catches a
      // delete and a move, neither of which asks this application anything.
      numberingMarks,
      deferredNotes,
      revealAll,
      // A pane locked to one section. Per state and therefore per pane, which is
      // the whole feature: the point of narrowing is that the pane beside it is
      // still showing the whole sefer. See `narrowing.ts` for why the anchor
      // lives here rather than on the `Leaf` in `panes.ts`.
      narrowing,
      dirCompartment.of(EditorView.contentAttributes.of({ dir: docConfig().dir })),
      // The document's direction above is the *fallback*; every line that has a
      // letter in it answers for itself, and the syntax is held apart from the
      // prose so a command stops migrating through the sentence it is in.
      bidiSupport(() => (docConfig().dir === "ltr" ? "ltr" : "rtl")),
      // The parameter, not `proseHere()`: a state may be built for a document
      // that is not the focused one, and asking "what mode is the screen in"
      // would give it somebody else's answer.
      proseCompartment.of(proseOrRaw(prose)),
      themeCompartment.of(editorTheme(settings.theme === "dark")),
      spell.misspellings,
      spell.spellDecorations,
      // What the squiggle means, and both ways to act on it. The left button
      // used to be the only route to the suggestions, and it cost the caret;
      // this is the route that costs nothing. The key it names is read live off
      // the bindings, so rebinding `spellSuggest` moves the sentence with it.
      spell.spellTooltip((m) => {
        const which = m.lang === "en" ? t("spellLexEn") : t("spellLexHe");
        return tf("spellTip", which, hintFor("spellSuggest"));
      }),
      errorLines,
      errorLineDecorations,
      // What has moved since the last snapshot: the gutter, the faint line
      // highlight, and the ticks the overview ruler reads off the same field.
      changes,
      changeGutter,
      changeHighlight,
      // Everything wrong with the document, on one strip beside the scrollbar.
      // Purely a view over the four fields above it — it computes no marks of
      // its own, which is why it can be added last and removed with one line.
      overviewRuler,
      // A squiggle answers to a plain click, not only a right-click: on a
      // touchscreen there is no right-click at all.
      EditorView.domEventHandlers({
        /**
         * A paste that might be a source Girsa put down (spec.md §10.2).
         *
         * Girsa's Ctrl+C writes three flavours: `text/plain`, `text/html`, and
         * a **real native clipboard format** carrying the Source Packet — eighty
         * -six careful lines to do it, because a webview can only write
         * Chromium's *web custom format*, which no native application can read.
         * Nothing here read the third one, so that copy landed in an editor
         * that only ever took the first.
         *
         * The packet cannot be read off this event — a `paste` exposes
         * `text/plain`, `text/html` and files, and a custom native format is
         * not among them on any platform — so the engine is asked, in the
         * process that can open the real clipboard.
         *
         * Which makes the ordering the whole of the care needed here. The ask
         * is asynchronous and `preventDefault` is not, so the plain text is
         * taken *now*, the default is stopped, and the text is put in
         * immediately; if a packet turns up, the same text is replaced by the
         * markup. A reader pasting from anywhere else sees an ordinary paste
         * and never waits for a clipboard round-trip.
         */
        paste(e, v) {
          const plain = e.clipboardData?.getData("text/plain") ?? "";
          const sources = sourcesOf(runtime.backend);
          if (!sources || !plain) return false;
          e.preventDefault();
          const at = v.state.selection.main;
          // Every range, not just the main one.
          //
          // CodeMirror's own paste inserts into all of them; this replaced
          // `selection.main` and left every other cursor untouched with no
          // indication at all. A writer holding four carets pasted into one of
          // them and had to find out by looking.
          //
          // And `userEvent`, because without it the macro recorder never sees
          // this transaction: its filter is `if (!tr.isUserEvent("input"))
          // continue`, and the comment directly above that filter says the
          // opposite — *"so an IME, **a paste** and a nikud button all record as
          // the text they produced"*. A macro recorded with a paste in it
          // replayed without it.
          v.dispatch(
            v.state.changeByRange((r) => ({
              changes: { from: r.from, to: r.to, insert: plain },
              range: EditorSelection.cursor(r.from + plain.length),
            })),
            { userEvent: "input.paste" },
          );
          const from = at.from;
          void sources
            .clipboardSource()
            .then((markup) => {
              if (!markup) return;
              // Only if the text this put in is still there. A reader who kept
              // typing while the clipboard was being read has moved on, and
              // rewriting what is under their caret now would be worse than
              // the plain paste they already have.
              const here = docTextOf(v.state.doc).slice(from, from + plain.length);
              if (here !== plain) return;
              v.dispatch({
                changes: { from, to: from + plain.length, insert: markup },
                selection: { anchor: from + markup.length },
                userEvent: "input.paste",
              });
              setStatus(t("sourcePasted"), "ok");
              scheduleCompile();
            })
            .catch((err) => {
              // A packet that arrived and could not be read — a schema
              // mismatch carries both version numbers. The plain text is
              // already in, so this is a line and not a failure.
              const bad = troubleSaid(err, "reach_girsa");
              setStatus(bad.said, "warn", bad.detail);
            });
          return true;
        },
        // **There is no `mousedown` here, and that is the fix.**
        //
        // It used to open the suggestion menu on any press over a squiggle,
        // with `preventDefault()` in front of it — so the left button, whose
        // one job in a text editor is to put the caret somewhere, could not
        // put the caret on a misspelled word. `misspellingAt` counted the
        // boundary *after* the word as a hit too, which is why the report was
        // "on or after". A writer with a page of unrecognised Torah
        // terminology could not click into their own sentences.
        //
        // Suggestions are a right-click and a key now — which is what they are
        // in Word, in the browser and in every code editor — and the squiggle
        // says so on hover, so nothing is lost with the gesture. See
        // `spellTooltip` in `spell.ts`.
        contextmenu(e, v) {
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos == null) return false;
          if (settings.spellcheck) {
            // `misspellingUnder`, not `misspellingAt`: a pointer landed on a
            // character, and the boundary after the last one is the next word.
            const m = spell.misspellingUnder(v, pos);
            if (m) {
              e.preventDefault();
              void openSpellMenu(m, e.clientX, e.clientY);
              return true;
            }
          }
          // Right-click on a note: convert it, delete it with its marker, or
          // hang another note off it. The operations existed as commands and
          // nowhere a pointer could reach them.
          if (noteAt(docTextOf(v.state.doc), pos)) {
            e.preventDefault();
            openNoteMenu(e, pos);
            return true;
          }
          return false;
        },
        // The mirror of clicking a rendered page to move the caret: a plain
        // left-click in the source scrolls the preview to where that word — or
        // that footnote marker — printed. CodeMirror has already placed the
        // caret by the time `mouseup` fires, so the deferred reveal reads the
        // caret the click set. A drag is a selection, not a click, and is left
        // alone; the reveal is quiet and only fires when `clickToPreview` is on.
        //
        // The event is handed on rather than dropped because `clickTarget: keep`
        // needs the one fact only the click carries: how far down its own pane
        // it was made. Read here, at the moment it happens, since the reveal
        // runs 120 ms later and the pane may have scrolled by then.
        mouseup(e) {
          if (e.button !== 0) return false;
          if (!isPlainClick(window.getSelection())) return false;
          revealFromSourceClick(e);
          return false;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged || u.selectionSet) updateContextBar();
        // The caret moved and the text did not — an arrow key, a click, a jump.
        // Bring the preview to it. Not on `docChanged`: typing moves the caret
        // every keystroke, and the compile-and-follow already handles that; doing
        // it here too would fight the writer's own scroll.
        if (u.selectionSet && !u.docChanged) followCaretInPreview();
        // The recorder's other half: what the writer typed. Read off the
        // transaction rather than off keydown, so an IME, a paste and a nikud
        // button all record as the text they produced rather than as the keys
        // that produced them — which is the difference between a macro that
        // replays Hebrew and one that replays a keyboard layout.
        if (u.docChanged && isRecording()) {
          for (const tr of u.transactions) {
            if (!tr.isUserEvent("input")) continue;
            let typed = "";
            tr.changes.iterChanges((_fa, _ta, _fb, _tb, ins) => {
              typed += ins.toString();
            });
            noteTyped(typed);
          }
        }
        if (u.docChanged) {
          // Remember which paragraph moved, so the next spell check re-tokenises
          // only that region rather than the whole sefer.
          markSpellDirty(u.changes);
          // What prints has moved, so the scroll map is stale. Dropped rather
          // than rebuilt: a scroll event will rebuild it if one comes, and most
          // keystrokes are never followed by a scroll.
          invalidateScrollMap();
          // Saving and rendering are scheduled independently. One must never be
          // able to stop the other — that coupling is what silently lost text.
          scheduleSave();
          scheduleCompile();
          updateCounts();
          refreshPanes();
          // Delete and move, which are the two the insertion path cannot see:
          // a writer deletes a siman by selecting it and pressing a key, and
          // drags one by cut and paste, and this application is asked no
          // question at either moment. So the *document* is watched instead of
          // the gesture — which is also the honest shape for a sefer opened
          // from a file, or edited by somebody else, or merged.
          scheduleRenumber();
        }
      }),
    ],
  });
}

/**
 * #89 — open or close the minimap strip.
 *
 * One function owns both directions and the placement memory, because three callers
 * want them (the settings toggle, the key, and Escape) and the placement has to be
 * remembered by whichever of them opened it. "Was it open before the toggle?" is the
 * whole of a toggle's behaviour, and it cannot live in three places.
 */
function toggleMinimap(): void {
  if (minimapIsOpen()) {
    closeMinimap();
    settings.minimap = false;
  } else {
    openMinimap(minimapDeps());
    settings.minimap = true;
  }
  saveSettings();
}

/**
 * Move the caret past the closing bracket of the current bracket pair.
 * If `toNextLine` is true, also move to the start of the next line.
 */
function moveOutOfBracket(v: EditorView, toNextLine: boolean): boolean {
  const doc = docTextOf(v.state.doc);
  const pos = v.state.selection.main.head;
  const nextPos = findNextCloser(doc, pos);
  if (nextPos === null) return false;
  let target = nextPos;
  if (toNextLine) {
    const line = v.state.doc.lineAt(nextPos);
    if (line.number < v.state.doc.lines) {
      target = v.state.doc.line(line.number + 1).from;
    }
  }
  v.dispatch({ selection: { anchor: target } });
  return true;
}
// Hebrew-aware word + character count — of the TEXT, not the markup.
//
// This used to count the raw document string, so `#הדגשה[...]`, `//` comments and
// every command name inflated the number the writer watches. Strip the markup
// first with four regexes of its own — and `\([^()]*\)` stops at the first inner
// `)`, so `#צבע(rgb("#b91c1c"))[…]` left a stray paren in the number a writer
// watches. One question, asked of the scanner that already knows the answer:
// `spans.ts` tells a string from a bracket, which is what all six askers lacked.
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
function updateCounts() {
  clearTimeout(countTimer);
  countTimer = window.setTimeout(countNow, COUNT_DEBOUNCE_MS);
}


/**
 * The three constructs, through one door each.
 *
 * `hiding.ts` decides what the text becomes; this decides nothing at all, which
 * is the point — the padding rules, the toggle-back and the "the mark must
 * start its own line" rule are testable there and were not testable here.
 */
function applyHiding(edit: hiding.Edit) {
  runtime.view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.text },
    selection: { anchor: edit.select[0], head: edit.select[1] },
  });
  runtime.view.focus();
  scheduleCompile();
}

/**
 * Make what is written here a real list.
 *
 * The bullet and number buttons do this too, for the kind they name; this is
 * the one that *reads* — `1.` makes a numbered list, `א.` a Hebrew-lettered
 * one, `-` bullets — and it is the answer to a document whose 156 numbered
 * items are typed numbers in bold. Refuses out loud rather than doing nothing,
 * because "nothing happened" is what the greyed controls were already saying.
 */
function makeListHere(): boolean {
  if (!runtime.view) return false;
  const sel = runtime.view.state.selection.main;
  const doc = docTextOf(runtime.view.state.doc);
  const made = lists.makeList(doc, sel.from, sel.to, "auto", docLang());
  if (!made) {
    setStatus(t(lists.listAt(doc, sel.from) ? "why.alreadyAList" : "why.nothingToList"), "warn");
    return true;
  }
  editDoc(made.text, made.caret);
  runtime.view.focus();
  return true;
}

/**
 * A table of contents, after the title block, once.
 *
 * The one door, and there used to be two. `heading.contents` was a structural
 * operation on headings — so it refused unless the caret was inside a section,
 * which is nowhere near where a table of contents goes — and the `toc` action
 * spliced `#תוכן()` in wherever the caret happened to be, mid-word included.
 * Now both are this: `headings.addContents` places it and refuses a second one,
 * and the refusal is a sentence rather than a button that does nothing.
 *
 * *Where* it places it is its own decision and was wrong until 17 August: at
 * character zero, which put the contents above the document's own title. See
 * `headings.afterTitleBlock`.
 */
function addContentsHere(): boolean {
  if (!runtime.view) return false;
  const doc = docTextNow();
  const made = heads.addContents(doc, docLang());
  if (!made) {
    setStatus(t("why.contentsAlready"), "warn");
    return true;
  }
  editDoc(made.text, made.caret);
  runtime.view.focus();
  return true;
}

/**
 * Take a running head out of the settings drawer and put it in the document.
 *
 * The one-way door the finding asks for, and it is one-way on purpose: the
 * command can express things the field cannot — bold, a mixed run, a different
 * line per chapter — so there is no honest way to read one back into a text box
 * afterwards. It carries the text across, clears the field so the two cannot
 * disagree, and puts the caret in the new call.
 *
 * The insertion goes at the **top** of the document rather than at the caret: a
 * running head set halfway down governs from there on, which is a real and
 * useful thing to do deliberately and never what somebody means by pressing a
 * button in Settings.
 */
function moveRunningIntoDoc(which: "header" | "footer") {
  if (!runtime.view) return;
  const he = which === "header" ? "כותרת_עליונה" : "כותרת_תחתונה";
  const en = which === "header" ? "running_head" : "running_foot";
  const name = docLang() === "en" ? en : he;
  const text = String(docConfig()[which] ?? "");
  const call = `#${name}[${text}]`;
  const doc = docTextNow();
  editDoc(`${call}\n\n${doc.replace(/^\s*/, "")}`, call.length - 1);
  // Cleared, so the document and the panel cannot give two answers about one
  // running head. The command wins in the prelude either way; leaving the field
  // filled would make that precedence something a writer has to discover.
  setSetting(which, "" as never);
  // Redrawn, or the box goes on showing the text it no longer holds. The drawer
  // is built once and toggled — it is not a `lazyMenu` — so clearing the model
  // leaves the input exactly as the writer typed it, and the next time they open
  // Settings the field and the document each claim the running head. Found by
  // pressing the button and opening the drawer again.
  rerenderChrome();
  closePanel("settings-drawer");
  runtime.view.focus();
}



/** A fold: collapsible while writing, and every word of it prints. */
function insertFold() {
  const sel = runtime.view.state.selection.main;
  applyHiding(hiding.foldAround(docTextOf(runtime.view.state.doc), sel.from, sel.to, t("foldName")));
}

/** Hide a passage from the page with `/* … *\/`, or reveal the one we are in. */
function hideBlockHere() {
  const sel = runtime.view.state.selection.main;
  applyHiding(hiding.hideBlock(docTextOf(runtime.view.state.doc), sel.from, sel.to, t("hiddenName")));
}

/** Hide these lines from the page with `//`, or bring them back. */
function hideLineHere() {
  const sel = runtime.view.state.selection.main;
  applyHiding(hiding.hideLines(docTextOf(runtime.view.state.doc), sel.from, sel.to));
}

/**
 * Collapse the outline to a depth: chapters only, or chapters and simanim.
 *
 * The ranges come from the fold service rather than from a second reckoning of
 * where a section ends, so this collapses exactly what a click on the gutter
 * arrow would — one authority for "what does this heading fold", asked twice.
 */
/**
 * Fold every list item nested at least `depth` deep.
 *
 * The same shape as `foldToLevel` and deliberately so: ask the fold service for
 * the range, so this collapses exactly what a click on the gutter arrow would.
 * A second reckoning of where a list item ends is the thing that eventually
 * disagrees with the arrow beside it.
 */
function foldListsToDepth(view: EditorView, depth: number) {
  unfoldAll(view);
  const sc = scanDoc(view.state.doc);
  const effects = [];
  const seen = new Set<number>();
  for (const n of sc.nodes) {
    if (n.role !== "item" && n.role !== "list") continue;
    // Depth among *lists*, not among all calls: a list inside a footnote inside
    // a heading is still a top-level list to the reader, and counting the
    // wrappers would fold it as though it were three deep.
    let d = 0;
    for (let p = n.parent; p; p = p.parent) if (p.role === "list") d += 1;
    if (d < depth) continue;
    const line = view.state.doc.lineAt(n.from);
    if (seen.has(line.from)) continue;
    seen.add(line.from);
    for (const service of view.state.facet(foldService)) {
      const range = service(view.state, line.from, line.to);
      if (range) {
        effects.push(foldEffect.of(range));
        break;
      }
    }
  }
  if (effects.length) view.dispatch({ effects });
  setStatus(
    effects.length ? tf("foldListDepth", String(depth)) : t("noListsToFold"),
    effects.length ? "ok" : "",
  );
}

function foldToLevel(view: EditorView, level: number) {
  unfoldAll(view);
  const doc = docTextOf(view.state.doc);
  const effects = [];
  for (const h of heads.sectionsToFold(doc, level)) {
    const line = view.state.doc.lineAt(h.from);
    for (const service of view.state.facet(foldService)) {
      const range = service(view.state, line.from, line.to);
      if (range) {
        effects.push(foldEffect.of(range));
        break;
      }
    }
  }
  if (effects.length) view.dispatch({ effects });
  setStatus(effects.length ? tf("foldLevel", String(level)) : t("noHeadings"), effects.length ? "ok" : "");
}

/**
 * A line break in the source that prints nothing.
 *
 * Typst turns a newline into a **space** and a blank line into a **paragraph
 * break**, so the writer who breaks a long line for the sake of reading the
 * source pays for it on the page. The escape exists — whitespace *inside* a
 * block comment is consumed, so a comment opened at the end of one line and
 * closed at the start of the next glues the two together with nothing between
 * them — but it is Typst's, not Ksav's, and it appears in no menu, no palette
 * and no document. A feature nobody can find is not a feature.
 *
 * A `//` comment will not do this: it ends *at* the newline, so the newline is
 * still outside it and still prints a space. Only the block form spans the break.
 *
 * The other whitespace needs no escape at all — runs of spaces, tabs and leading
 * indentation already collapse to one space before they reach the page. The line
 * break is the only one that misbehaves, which is why this is one action and not
 * a family of them.
 *
 * With a selection this *is* [`hideBlockHere`] — "make this not print" is one
 * idea, and two implementations of it would eventually disagree about the padding.
 */
function hiddenBreak() {
  const sel = runtime.view.state.selection.main;
  if (!sel.empty) return hideBlockHere();
  const text = "/*\n*/";
  runtime.view.dispatch({
    changes: { from: sel.from, insert: text },
    // After the closer, on the new line: the caret is where the writing
    // continues, and what is typed there joins the word before the break.
    selection: { anchor: sel.from + text.length },
  });
  runtime.view.focus();
  scheduleCompile();
}

function applySkin(name: string) {
  applyPreset(name, setPageSetup);
  closeMenus();
  scheduleCompile();
  // rerenderChrome rebuilds the whole chrome, which drops the panel's contents
  // and its open state — so restore both, or applying a preset from inside the
  // panel closes the panel and hides the undo it just made available.
  const wasOpen = isPanelOpen("styles-panel");
  rerenderChrome();
  if (wasOpen) openPanel("styles-panel");
  setStatus(tf("presetApplied", t("skin." + name)), "ok");
}

function undoSkin() {
  if (!undoPreset(setPageSetup)) return;
  scheduleCompile();
  const wasOpen = isPanelOpen("styles-panel");
  rerenderChrome();
  if (wasOpen) openPanel("styles-panel");
}

function toggleNikud() {
  settings.nikud = !settings.nikud;
  saveSettings();
  togglePanel("nikud-bar", settings.nikud);
  reconfigureShortcuts();
  rerenderChrome();
}

/**
 * What each chip does when it is pressed.
 *
 * The other half of `header.chips`, which says what each one *is*. Separate
 * because one half is a decision about state — glyph, name, on, unavailable —
 * and this half is an effect, and the decision is the part that was
 * untestable. A chip named here with no description there (or the reverse) is a
 * `tsc` error, because both are keyed by the same union.
 */
/**
 * Open whichever search the writer asked for.
 *
 * One action and two surfaces, rather than two actions: *"find"* is one thing a
 * writer wants, and a second binding for "find, but in the preview" would be a
 * chord to remember for a question they have already answered in the settings.
 */
function startFind(view: EditorView): boolean {
  if ((settings.searchScope ?? "source") === "source") return openSearchPanel(view);
  openPanel("find-drawer");
  return true;
}

const CHIP_RUN: Record<header.ChipId, () => void> = {
  undo: () => void undo(runtime.view),
  redo: () => void redo(runtime.view),
  styles: openStyles,
  find: () => void startFind(runtime.view),
  outline: toggleOutline,
  notesChooser: openNotesChooser,
  notesPane: toggleNotesPane,
  marksPane: toggleMarksPane,
  review: openReview,
  git: openGit,
  commands: openCommands,
  language: () => setSetting("lang", getLang() === "he" ? "en" : "he"),
  foldAll: () => void foldAll(runtime.view),
  unfoldAll: () => void unfoldAll(runtime.view),
  prose: () => setProseHere(!proseHere()),
  arrangement: openArrangements,
  theme: () => setSetting("theme", settings.theme === "light" ? "dark" : "light"),
  nikud: toggleNikud,
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

function buildHeader(): HTMLElement {
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
  const FILE_RUN: Record<header.FileItemId, () => void> = {
    newDoc,
    open: openFile,
    save: saveFile,
    saveAs: saveFileAs,
    importWord: () => importWord(),
    importOrg: () => importOrg(),
    shareRead: () => void copyShareLink(false),
    shareReview: () => void copyShareLink(true),
    saveAsTemplate,
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

  const EXPORT_RUN: Record<header.ExportId, () => void> = {
    exportPdf: () => void exports.exportPdf(),
    exportWord: () => void exports.exportWord(),
    copyForWord: () => void exports.copyForWord(),
    exportHtml: () => void exports.exportHtml(),
    exportMarkdown: exports.exportMarkdown,
    exportOrg: exports.exportOrg,
    exportText: exports.exportText,
    exportTypst: () => void exports.exportTypst(),
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


/** Swap the whole document and put the caret somewhere sensible. */
function replaceAll(text: string, caret: number) {
  editDoc(text, caret);
  scheduleCompile();
  runtime.view.focus();
}

/** What the keys drawer's search box holds. Lives here because the view is a
 *  pure function of it and the drawer is rebuilt on every keystroke. */
let keysQuery = "";

/**
 * Every rebindable action, drawn into the keys drawer.
 *
 * The rows come from `actions()` — the same function the keymap is built from
 * and the palette is filled from — so a macro recorded a minute ago is in this
 * list without any further wiring, and an action that cannot be bound cannot
 * appear here.
 *
 * `macroName` covers all three kinds of name: a structural operation names
 * itself from `STRUCTURE_ACTIONS`, a macro from its own title, and everything
 * else from its `sc.` string. Without it a bound macro appeared as the raw text
 * `sc.macro.m1a2b3` — a row nobody could identify, which is the same "shipped
 * unnamed" failure `bindings.test.mjs` exists to catch. Resolved here rather
 * than in the view, because all three registries are the shell's.
 */
function renderKeysPanel(): void {
  const box = document.getElementById("keys-body");
  if (!box) return;
  const kb = keybindings();
  const mode = keymodes.activeMode();
  box.replaceChildren(
    ...panelviews.keysPanel(
      {
        rows: actions().map((a) => ({
          id: a.id,
          name: actionName(a.id, savedNameMap()),
          key: kb[a.id] ?? "",
          // What this action answers to under a mode. Carried on the row rather
          // than resolved in the view, so the view spells a key exactly one way:
          // `bindings.keyHint`, the same call every menu makes.
          command: keymodes.commandName(a.id),
        })),
        query: keysQuery,
        mode: mode === "default" ? null : { kind: mode },
      },
      {
        search: (q) => {
          keysQuery = q;
          renderKeysPanel();
          // The box is rebuilt with the rows, so the caret has to be put back —
          // and at the end, or typing a second character moves it to the front.
          const input = document.getElementById("keys-search") as HTMLInputElement | null;
          input?.focus();
          input?.setSelectionRange(q.length, q.length);
        },
        capture: (id, button) => captureShortcut(id, button as HTMLButtonElement),
        clear: (id) => {
          // The empty string, not a delete: `keybindingsFrom` reads an empty
          // value as *this action is deliberately unbound* and a missing key as
          // *use the default*, and deleting it would put the shipped chord back
          // rather than take it off.
          settings.keybindings = { ...(settings.keybindings || {}), [id]: "" };
          saveSettings();
          reconfigureShortcuts();
          renderKeysPanel();
        },
        reset: () => {
          resetShortcuts();
          renderKeysPanel();
        },
      },
    ),
  );
}


function columnStepFor(id: string): string {
  const rtl = docConfig().dir !== "ltr";
  if (id === "table.cellStartward") return rtl ? "table.cellStartward" : "table.cellEndward";
  if (id === "table.cellEndward") return rtl ? "table.cellEndward" : "table.cellStartward";
  return id;
}

function structureKeymap() {
  const kb = keybindings();
  const out: KeyBinding[] = [];
  for (const a of structure.STRUCTURE_ACTIONS) {
    const key = kb[a.id];
    // No `preventDefault`: returning false has to let the key through, which is
    // exactly how Enter stays Enter in ordinary prose.
    //
    // The two column arrows are handed to the action the *document's* direction
    // says they mean. Resolved when the keymap is built and again whenever
    // direction changes, which is what `reconfigureShortcuts` is already for.
    if (!key) continue;
    const want = columnStepFor(a.id);
    const act = want === a.id ? a : structure.actionById(want);
    if (act) out.push({ key, run: () => runStructureAction(act) });
  }
  // #86 — the two tag selections. Not in `STRUCTURE_ACTIONS`: a tag is not the
  // kind of structure the registry's ribbon view is for. They read the same
  // `keybindings()` registry, so a
  // rebind in Settings moves the click's keyboard twin with it.
  //
  // Returning `false` when the caret is not in a tag is the arrangement
  // `structureKeymap` already uses, and the reason `Mod-Shift-]` stays unbound in
  // ordinary prose rather than eating a bracket.
  for (const mode of ["whole", "body"] as const) {
    const key = kb[mode === "whole" ? "selectTagWhole" : "selectTagBody"];
    if (!key) continue;
    out.push({
      key,
      run: (view) => {
        const tag = tagContaining(view.state.doc.toString(), view.state.selection.main.head);
        if (!tag) return false;
        selectTag(view, tag, mode as TagSelection);
        return true;
      },
    });
  }
  return out;
}
const structureCompartment = new Compartment();


/** Any action by id — built-in, structural, or a saved macro. */
function actionById(id: string): { id: string; run: (v: EditorView) => boolean } | undefined {
  return actions().find((a) => a.id === id);
}

/**
 * Run an action by id. **The only way an action should be invoked.**
 *
 * This did not exist, and its absence was the macro recorder's whole bug.
 * `noteAction` had exactly one caller — inside `runStructureAction` — so the
 * recorder saw the forty-three structural operations and nothing else. Press
 * F3, Ctrl+B, F4 and the answer was *"Nothing was recorded."* Bold, italic,
 * footnote, endnote, the headings, bullets, tables, alignment, the three review
 * marks and all three defer operations are first-class `ACTIONS` entries with
 * shipped key bindings, and every one of them was invisible — because the keymap
 * called `a.run` directly and there was no one place in between.
 *
 * It also gives the palette something to run: a surface labelled **Commands**
 * that could not reach "insert row below", "save" or "record macro" was a symbol
 * picker with the wrong sign on it.
 */
function runAction(id: string, v: EditorView = runtime.view): boolean {
  // Once: `actionById` re-derives the whole action array (the per-document
  // style scan included), and this used to pay that twice — the guard and
  // the argument — on every invocation.
  const action = actionById(id);
  if (!action) return false;
  inAction++;
  try {
    return runRegisteredAction(
      id,
      v,
      () => action,
      (actionId) => !!structure.actionById(actionId),
      noteAction,
    );
  } finally {
    inAction--;
  }
}

/**
 * Depth of `runAction`, so `insertSnippet` can tell a command arriving from the
 * toolbar apart from one an action is inserting on its own account.
 *
 * The toolbar, the Insert menu and the palette all call `insertSnippet`
 * directly with a registry command — there is no action id to record — so the
 * snippet itself is the step. An action that inserts a snippet must not be
 * recorded twice, and replaying the action is the better of the two: it is the
 * one that survives the registry snippet changing under it.
 */
let inAction = 0;

/**
 * Run one structural operation, wherever the caret is.
 *
 * `sticky` is the ribbon's and the menus' reading of the caret: one character
 * further in, so an operation offered while the caret rests just past a list's
 * closing `)` actually acts (see `structureNear`). It is deliberately **off**
 * for the keyboard. Bare Enter and Tab are bound to `list.splitItem` and
 * `list.indent`, and a sticky Enter would split a list item while the writer
 * was typing the paragraph after the list — the ribbon lingering is a
 * convenience, a key that acts on something the caret has left is a bug.
 */
function runStructureAction(action: structure.StructureAction, sticky = false): boolean {
  if (!runtime.view) return false;
  noteAction(action.id);
  const doc = docTextOf(runtime.view.state.doc);
  const caret = runtime.view.state.selection.main.head;
  const pos = sticky ? (structure.structureNear(doc, caret)?.pos ?? caret) : caret;
  const edit = action.run(doc, pos);
  if (!edit) return false;
  // An operation can apply and still produce the same source — swapping two
  // identical rows is a real edit with no visible result. Dispatching the
  // document over itself would push an empty step onto the undo stack and
  // recompile for nothing, so only the caret moves.
  const changed = edit.text !== doc;
  editDoc(edit.text, edit.caret, { scrollIntoView: true });
  if (changed) scheduleCompile();
  requestAnimationFrame(updateContextBar);
  return true;
}


/**
 * Select, unwrap or remove the construct the caret is in.
 *
 * One door for the three, because they are one act at three depths and because
 * the refusals are shared: there may be no construct here at all, and the
 * construct there is may be one whose words do not all live in its body.
 *
 * A refusal says which of those it was. *"Deleting a construct is confusing and
 * easy to get wrong"* is a report about silence as much as about typing — a key
 * that does nothing and says nothing is why a writer goes back to deleting
 * brackets by hand.
 */
function entityAct(what: "select" | "unwrap" | "remove"): boolean {
  const view = runtime.view;
  const doc = docTextOf(view.state.doc);
  const sel = view.state.selection.main;
  const node = entity.entityAt(doc, sel.from, sel.to);
  if (!node) {
    setStatus(t("noEntityHere"), "warn");
    return true;
  }
  if (what === "select") {
    view.dispatch({ selection: { anchor: node.from, head: node.to }, scrollIntoView: true });
    setStatus(tf("entitySelected", node.name), "");
    return true;
  }
  const edit = what === "unwrap" ? entity.unwrap(doc, node) : entity.remove(doc, node);
  if (!edit) {
    // The construct whose text is not all in its body — `#סימן("א", […])`
    // carries the siman number as an argument. Unwrapping to the body alone
    // would drop it, which is the writer's text going missing quietly, so the
    // offer is the one that says what it does.
    setStatus(tf("entityKeepsNothing", node.name), "warn");
    return true;
  }
  editDoc(edit.text, edit.caret);
  if (edit.to !== undefined) {
    runtime.view.dispatch({ selection: { anchor: edit.caret, head: edit.to } });
  }
  scheduleCompile();
  setStatus(tf(what === "unwrap" ? "entityUnwrapped" : "entityRemoved", node.name), "ok");
  runtime.view.focus();
  return true;
}


// ---------------------------------------------------------------- setting mutations
/**
 * What a setting reads as **now** (B26).
 *
 * Page setup comes from the open document; everything else from the application.
 * One reader, because a panel that writes to the document and reads from the app
 * is a panel whose numbers jump back the moment you reopen it.
 */
function now<K extends Field>(key: K): ValueOf<K> {
  // A page field is the **document's**, full stop. There is no fallback to an
  // app preference and there must not be: `docConfig()` already lays the
  // document out over the shipped defaults, so `undefined` here means the
  // document has genuinely not said — which for the four per-edge margins and
  // the note region is their ordinary state and a real instruction ("follow the
  // one margin", "decide from the document").
  //
  // It used to fall through to `settings[key]` in exactly that case, so the
  // panel could print a top margin the page was not laid out on, with nothing
  // to tell the writer which of the two numbers had been used.
  if (isPageField(key)) {
    return (docConfig() as unknown as Record<string, unknown>)[key] as ValueOf<K>;
  }
  return settings[key as keyof Settings] as ValueOf<K>;
}

/**
 * Change a setting — of the document, or of the application (B26).
 *
 * > *"opening an English document and then a Hebrew one means changing direction
 * > by hand."*
 *
 * Page setup is a property of the document now, so the fourteen fields in
 * `PAGE_FIELDS` are written **to the open document** and travel with it. The rest —
 * theme, layout, zoom, spell-check — are about the person and stay where they were.
 *
 * The side effects below are unchanged and run either way: flipping the direction
 * has to re-point the editor and the preview whether the flip was saved in a
 * document or in a preference file.
 */
/**
 * Write page setup onto the open document (B26).
 *
 * Merged into whatever it already said rather than replacing it, so setting the
 * margin does not silently reset the paper. Saved through `docs.update`, which is
 * where every other change to a document goes.
 */
function setPageSetup(change: PageSetup): void {
  const doc = runtime.currentDoc;
  if (!doc) return;
  const config = { ...(doc.config ?? {}), ...change };
  runtime.setCurrentDoc({ ...doc, config });
  void docs.rememberConfig(doc.id, config).catch(reportSaveFailure);
}

/**
 * Make the open document's layout what a **new** document starts with (B26).
 *
 * The affordance page setup being per-document takes away and has to give back:
 * a writer who has got their sefer looking right wants the next one to start
 * there, and without this they would have to set fourteen fields again. Word
 * calls it *set as default*; so does this.
 */
function adoptPageSetupAsDefault(): void {
  // One field, holding the same subtraction a document stores: only what
  // differs from the shipped defaults. This used to copy all thirty page fields
  // onto `settings` itself — which is how the app came to hold a second opinion
  // about every one of them, and how the panel came to print a margin the open
  // document was not laid out on.
  settings.newDocument = ownPageSetup(docConfig() as unknown as PageSetup);
  saveSettings();
  showChromeNotice("setupIsDefault");
}

function setSetting<K extends Field>(key: K, value: ValueOf<K>) {
  if (isPageField(key)) {
    setPageSetup({ [key as string]: value } as PageSetup);
  } else {
    (settings as unknown as Record<string, unknown>)[key as string] = value;
    saveSettings();
  }
  if (key === "lang") {
    setLang(value as Lang);
    swapUntouchedStarter();
    // Replacing the header and flipping the root direction reflows everything
    // below, and CodeMirror keeps its pixel offset against a layout that just
    // moved — so the source visibly jumps. Capture each scroller's position and
    // put it back after the chrome is rebuilt.
    const wasAt = new Map<EditorView, number>();
    for (const v of sourceViews()) wasAt.set(v, v.scrollDOM.scrollTop);
    // Every source pane, and the search panel with them: `rerenderChrome`
    // rebuilds our own DOM and cannot reach a panel CodeMirror owns.
    for (const v of sourceViews()) {
      v.dispatch({ effects: phraseCompartment.reconfigure(EditorState.phrases.of(searchPhrases())) });
    }
    rerenderChrome();
    for (const [v, at] of wasAt) v.scrollDOM.scrollTop = at;
  } else if (key === "theme") {
    applyTheme();
    runtime.view.dispatch({ effects: themeCompartment.reconfigure(editorTheme(settings.theme === "dark")) });
    // …and the chip that reports the theme, which is the one thing this branch
    // did not do. Found by pressing it: the page went dark, the editor went
    // dark, and the chip went on saying 🌙 — "switch to dark" — for as long as
    // the session lasted, because nothing rebuilt the header. Its four siblings
    // (`lang`, `prose`, `layout`, `editingMode`) all rerender; this one was the
    // odd one out, and it is the toggle a writer presses first.
    rerenderChrome();
  } else if (key === "prose") {
    runtime.view.dispatch({ effects: proseCompartment.reconfigure(proseOrRaw()) });
    rerenderChrome();
  } else if (key === "dir") {
    runtime.view.dispatch({ effects: dirCompartment.reconfigure(EditorView.contentAttributes.of({ dir: docConfig().dir })) });
    // The preview pane reads in the document's direction, so flipping the
    // document has to re-point the pane in the same act.
    applyPreview();
    scheduleCompile();
  } else if (key === "editingMode") {
    // **After**, not beside. The mode is fetched over the network, so a
    // `rerenderChrome()` on the next line runs while `activeMode()` is still
    // "default" and the chrome is rebuilt describing the mode that is on its way
    // out — the shortcut list goes on printing keys the mode is about to take.
    // Caught by driving it: the settings list never showed a single `M-x` row.
    action("save_file", () => setEditingMode(value)).then(rerenderChrome);
  } else if (key === "focusMode" || key === "typewriter" || key === "typewriterAnchor") {
    runtime.view.dispatch({
      effects: focusCompartment.reconfigure(
        focusExtension(
          !!settings.focusMode,
          !!settings.typewriter,
          settings.typewriterAnchor ?? "center",
        ),
      ),
    });
  } else if (key === "zoom" || key === "fitWidth") {
    applyPreview();
  } else if (key === "sourceZoom") {
    applySourceZoom();
  } else if (key === "autoSnapshot" || key === "autoSnapshotMinutes") {
    // The timer is rebuilt rather than left to the next reload, which is the
    // whole difference between a setting and a constant.
    scheduleAutoSnapshots();
    // …and so is the sentence under the switch. `snapshotNote` says which of the
    // two states the history is in and how to keep a version by hand; without
    // this, turning the clock off left it reading *"a version is kept by itself
    // whenever the text has changed"* — the switch moved and the line under it
    // went on describing the state before. Found by pressing it.
    if (isPanelOpen("settings-drawer")) rerenderChrome();
  } else if (key === "autocomplete") {
    runtime.view.dispatch({ effects: autoCompartment.reconfigure(autoExtension()) });
  } else if (key === "spellcheck") {
    // Turning it off must take the existing squiggles with it, not just stop
    // adding new ones.
    if (settings.spellcheck) scheduleSpellCheck();
    else clearSpellCheck();
  } else if (key === "spellcheckComments") {
    // A wider or narrower checkable text, so the answer on screen is stale
    // either way — and turning it *off* has to clear the squiggles it put in
    // comments rather than leave them there until the next keystroke.
    clearSpellCheck();
    forceFullSpellCheck();
  } else if (key === "autoPairBrackets" || key === "autoPairQuotes") {
    runtime.view.dispatch({ effects: pairCompartment.reconfigure(pairExtension()) });
  } else if (key === "minimap") {
    // The strip is a **surface**, so the setting is a request to open or close it
    // rather than something reconfigured in place. Two directions because a setting
    // can be loaded as `true` at startup and must come up with the strip, not with a
    // canvas nobody asked for.
    if (settings.minimap && !minimapIsOpen()) toggleMinimap();
    else if (!settings.minimap && minimapIsOpen()) toggleMinimap();
  } else if (key === "showWhitespace") {
    // `[]` rather than the plugin emptied: reconfigure **is** the toggle, so there
    // is no state to clear and nothing to leave behind.
    runtime.view.dispatch({
      effects: whitespaceCompartment.reconfigure(whitespaceExtension()),
    });
  } else {
    scheduleCompile();
  }
}

// ---------------------------------------------------------------- layout / theme / chrome
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

/**
 * The source's zoom, as a number the stylesheet multiplies by.
 *
 * One custom property rather than a rule per view: the editor theme's `15px` and
 * page view's `17px` are two different base sizes for two different ways of
 * reading the same text, and both are correct. Multiplying is the only shape
 * that leaves that difference intact — a zoom that set a font size outright
 * would have flattened page view back to a code pane.
 */
function applySourceZoom() {
  document.documentElement.style.setProperty(
    "--source-zoom",
    String(zoom.clamp(settings.sourceZoom ?? zoom.DEFAULT)),
  );
}

/**
 * Zoom the surface the writer is in. `by` is +1, -1, or 0 for "back to 100%".
 *
 * The caret test is `runtime.view.hasFocus`, which is the honest reading of
 * *"which of these two am I working in"*: a writer who has clicked into the page
 * to read it is not typing, and the thing under their eyes is the preview.
 */
function stepZoom(by: number): boolean {
  const surface = zoom.surfaceOf(!!runtime.view?.hasFocus);
  const field = zoom.FIELD_OF[surface];
  const now = (settings[field] ?? zoom.DEFAULT) as number;
  const next = by === 0 ? zoom.DEFAULT : zoom.step(now, by);
  setSetting(field, next as never);
  // Say what happened and to which of the two, because the difference between
  // "the text got bigger" and "the page got bigger" is invisible in a window
  // where only one of them is on screen.
  setStatus(`${t(surface === "source" ? "zoomSource" : "zoom")} ${zoom.percent(next)}`, "");
  // The panel is where the number lives; if it is open it must not go on showing
  // the old one.
  if (isPanelOpen("settings-drawer")) rerenderChrome();
  return true;
}

/**
 * Start, restart or stop the automatic snapshot timer.
 *
 * Called at boot and again whenever either of the two settings changes, which is
 * the part a `setInterval` at the bottom of `boot` could not do: the cadence was
 * fixed at load and the only way to change it was to reload the application.
 */
let autoSnapshotTimer: number | null = null;
function scheduleAutoSnapshots() {
  if (autoSnapshotTimer !== null) {
    window.clearInterval(autoSnapshotTimer);
    autoSnapshotTimer = null;
  }
  const every = docs.autoInterval(settings.autoSnapshot, settings.autoSnapshotMinutes);
  if (every === null) return;
  autoSnapshotTimer = window.setInterval(() => void takeSnapshot(), every);
}

// Preview placement is not a setting any more, and the two cycling chips it fed
// are gone with it. Which side the preview sits on is *which child of a split it
// is*, which the tree says directly and a splitter drag changes; how much of the
// split it takes is that split's own fraction. Both used to be application-wide
// values, which is the shape a window with exactly one divider has.
//
// The page view survived, because it is a different question wearing the same
// word: how one pane is *drawn*, not how the window is divided. It is
// `settings.pageView` and `applyPageView` now, and it sits in the arrangement
// picker beside the arrangements because from a writer's side it is the same
// kind of choice.
//
// The layout chip also switched **prose mode on** as a side effect of reaching
// page view. The margin comment was *"this seems to turn on prose mode — a side
// effect, which it should advertise, and probably not do"*, right on both
// counts, and it is gone rather than announced: whether the source is prose or
// raw is a separate question with a separate control, and the writer had already
// answered it.

// The splitter is per split now, and built by `splitterFor` beside the tree it
// resizes. The old one was a single element with an id, which is the shape a
// window with exactly one divider has — and the reason `settings.previewFrac`
// was a global: there was only ever one fraction to store. A tree keeps its
// fractions on its splits, where a second divider has somewhere to put its own.

function openPreviewOverlay() {
  openPanel("preview-modal");
}
/**
 * Tell the change gutter what its three marks mean.
 *
 * From `help.MARKS`, which is the legend the help panel prints, so the wedge in
 * the margin and the line in the help say the same sentence — a legend and a
 * tooltip that are two hand-written lists are two lists that disagree.
 */
function nameGutterMarks() {
  // The keys as well as the sentences, so a language switch can re-render a
  // marker CodeMirror built itself.
  const keys = { added: "mark.added", changed: "mark.changed", removed: "mark.removed" };
  nameMarks({ added: t(keys.added), changed: t(keys.changed), removed: t(keys.removed) }, keys);
}

function applyUiDir() {
  document.documentElement.lang = getLang();
  // Use the document's direction for the HTML element so the editor's cursor
  // positioning works correctly in RTL documents even when the UI is LTR.
  document.documentElement.dir = docConfig().dir;
}

function rerenderChrome() {
  applyUiDir();
  nameGutterMarks();
  const app = document.getElementById("app")!;
  app.querySelector("header")?.replaceWith(buildHeader());
  // settings drawer keeps open state
  const drawerOpen = isPanelOpen("settings-drawer");
  document.getElementById("settings-drawer")!.replaceWith(buildSettingsDrawer());
  if (drawerOpen) openPanel("settings-drawer");
  // Every label built once at boot and marked with its key — the panel heads,
  // the drawer names, the palette's placeholder. `panels.localise` is the one
  // that knows how each kind of label is set; this used to be four lines here
  // that swept for `[data-i18n]` and found nothing, because nothing produced
  // one. See `panelHead`.
  localise();
  // …and every open surface with a pure renderer re-renders. The flip used to
  // stop here, and a git drawer or a notes pane stayed in the old language
  // until its next interaction.
  rebuildOpenPanels();
}

// ---------------------------------------------------------------- boot
function render() {
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
    // Announced as it changes: "rendering…", "3 pages", a compile error and —
    // the reason this matters — a save failure are all reported here, and a
    // status nobody is told about is the failure mode this whole pass exists to
    // remove. `polite` rather than `assertive`: it must not interrupt typing.
    el("div", { class: "statusbar", role: "status", "aria-live": "polite" }, [
      el("span", { id: "status", class: "ok" }, [t("ready")]),
      el("span", { id: "diagnostics" }),
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

// global keys: Ctrl/Cmd+K palette; Alt reveals raw markup in prose mode
/**
 * Is this keystroke somebody typing into a field?
 *
 * `.cm-content` is `contenteditable`, so the editor is covered by the same
 * test: when the caret is in a document, CodeMirror's own keymaps have already
 * had the event and the fallback below must keep its hands off it.
 */
function typingIntoSomething(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable='true']");
}

/**
 * Run a shortcut that arrived while the editor did not have focus.
 *
 * # The finding
 *
 * Every shortcut in this application lived in a CodeMirror keymap, which means
 * every shortcut required the caret to be in a document. Click a chip, a panel,
 * the outline, a tab — anything at all — and `Mod-k` stopped opening the
 * command palette, `Mod-f` stopped finding, help stopped opening. Nothing said
 * so; the key simply did nothing, which reads as the shortcut not existing.
 *
 * That is most of what the inventory means by *113 commands are advertised
 * across four surfaces and the reader could not reach them: zero of four*. The
 * palette is the route to the registry, and the route was conditional on
 * standing somewhere the reader had just left in order to look at a panel.
 *
 * # Modifier keys only
 *
 * A binding with no modifier — Enter, Tab, an arrow — belongs to whatever has
 * focus. Swallowing Enter here would break every button in the chrome, which is
 * a far worse bug than the one being fixed. So this handles the combinations
 * that are unambiguously application shortcuts and leaves the rest alone.
 *
 * The action runs against `runtime.view`, the primary editor, which is what the
 * writer means: they are looking at a document and pressing a key about it.
 */
function runShortcutOutsideEditor(e: KeyboardEvent): boolean {
  if (!runtime.view) return false;
  // The mode's takeover is not editor-scoped. Inside the editor the takeover
  // works by standing `buildShortcutKeymap` down (main, `buildShortcutKeymap`:
  // "a mode that is really here takes the whole keyboard"); if this window
  // listener kept resolving chords while vim held the keyboard, `dd` outside
  // the editor would still open a document — the rule would hold only where
  // nobody was typing. A mode here means this resolver stands down too.
  if (keymodes.activeMode() !== "default") return false;
  if (typingIntoSomething(e.target)) return false;
  // A handler that already answered owns the keystroke: this sweep runs on the
  // window *bubble* phase, so anything that preventDefault'ed below us has said
  // so. Without this, two resolvers (the editor's and this one) can answer the
  // same chord once each.
  if (e.defaultPrevented) return false;
  if (!e.ctrlKey && !e.metaKey && !e.altKey) return false;
  const key = eventToKey(e);
  if (!key) return false;
  const kb = keybindings();
  const aliases = aliasesInForce(kb);
  let id = Object.keys(kb).find((k) => kb[k] === key);
  if (!id) id = Object.keys(aliases).find((k) => aliases[k].includes(key));
  if (!id || !actionById(id)) return false;
  e.preventDefault();
  runAction(id, runtime.view);
  return true;
}

function wireKeys() {
  window.addEventListener("keydown", (e) => {
    // The two Girsa errands used to be answered here, by comparing `e.key` to a
    // letter. They are `citePhrase` and `linkifyCitations` in `DEFAULT_KEYS`
    // now, which is the only place a combination is allowed to be decided —
    // `prohibitions.test.mjs` holds that. What that arrangement cost: neither
    // was rebindable, neither reached the card, the key list or `F1`, both
    // fired straight through a keyboard mode that had taken the keyboard, and
    // `Ctrl+Shift+L` ran `left` *as well*, because that is what it is bound to.
    if (e.key === "Escape") {
      // Every surface that says Escape closes it, and nothing else. This used to
      // be twelve close calls written out by hand, which meant the answer to
      // "does Escape reach this panel?" was "did somebody remember" — and for
      // the hydra, the one surface here that takes over the keyboard, the answer
      // was no. `closeOnEscape` reads `PANELS`, so a new modal is covered by
      // being declared.
      handleEscape(closeOnEscape, () => runtime.view?.focus());
    } else if (e.key === "Alt" && proseHere()) {
      runtime.view.dispatch({ effects: setRevealAll.of(true) });
    } else {
      // Last, so nothing above it changes, and only when the editor did not get
      // the event itself. See `runShortcutOutsideEditor`.
      runShortcutOutsideEditor(e);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && proseHere()) runtime.view.dispatch({ effects: setRevealAll.of(false) });
  });
  window.addEventListener("click", (e) => {
    closeMenus();
    closeOnOutsideClick(e.target as Element | null);
  });
}


/**
 * Hand the shell's own operations to the modules that need them.
 *
 * `runtime.ts` and `save.ts` are imported *by* the panels, so they cannot import
 * the shell back without a cycle. Installing the three things they need as hooks
 * says the dependency is deliberate and one-directional, where a circular import
 * would only hide it. Registered before anything is drawn, so no code path can
 * fire one of them while it is still the default no-op.
 */
/**
 * What each surface does beyond appearing and disappearing.
 *
 * This is the half of the panel registry that makes it safe to derive the Escape
 * sweep. `PANELS` says a surface exists and how a person gets out of it; this
 * says what opening it has to fill in and what closing it has to put back — the
 * pending callback the form modal is holding, the operation set the hydra is
 * driving, the preference the outline pane's visibility *is*. A sweep that only
 * stripped a class would leave the application holding all three, so it would
 * have been a weaker Escape than the twelve hand-written calls it replaced.
 *
 * Focus is the exception and is handled at the keydown site: Escape means "put
 * me back in the text" whether or not anything was open, and a close hook by
 * definition only runs when something was.
 */
function wirePanels() {
  // Drawers whose open state *is* a saved preference. The × closes them through
  // `closePanel` like every other ×, so persisting has to happen here — a close
  // control that hid the pane and left the setting saying "shown" would put it
  // back on the next launch, which is the same class of lie as a menu item that
  // does nothing.
  wirePanel("outline-drawer", {
    rebuild: renderOutline,
    open: () => {
      settings.outline = true;
      saveSettings();
      renderOutline();
      rerenderChrome();
    },
    close: () => {
      settings.outline = false;
      saveSettings();
      rerenderChrome();
      runtime.view?.focus();
    },
  });
  wirePanel("notes-drawer", {
    rebuild: renderNotesPane,
    open: () => {
      settings.notesPane = true;
      saveSettings();
      renderNotesPane();
      rerenderChrome();
    },
    close: () => {
      settings.notesPane = false;
      saveSettings();
      rerenderChrome();
      runtime.view?.focus();
    },
  });

  wirePanel("marks-drawer", {
    rebuild: renderMarksPane,
    open: () => {
      settings.marksPane = true;
      saveSettings();
      renderMarksPane();
      rerenderChrome();
    },
    close: () => {
      settings.marksPane = false;
      saveSettings();
      rerenderChrome();
      runtime.view?.focus();
    },
  });

  wirePanel("find-drawer", {
    rebuild: renderFindPane,
    open: () => {
      const scope = document.getElementById("find-scope") as HTMLSelectElement | null;
      if (scope) scope.value = settings.searchScope ?? "source";
      // The scope decides whether the engine is asked for the printed text at
      // all, and it is asked *while the drawer is open* — so opening one that
      // reads the page has to trigger the compile that fills it in.
      if ((settings.searchScope ?? "source") !== "source") compileNow();
      renderFindPane();
      (document.getElementById("find-query") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });

  wirePanel("settings-drawer", { close: () => runtime.view?.focus() });
  wirePanel("commands-drawer", {
    open: () => {
      renderCommands("");
      (document.getElementById("commands-search") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });
  wirePanel("help-panel", {
    open: () => {
      renderHelp("");
      (document.getElementById("help-search") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });
  wirePanel("styles-panel", { open: renderStylesPanel, rebuild: renderStylesPanel });
  wirePanel("review-panel", { open: renderReviewPanel, rebuild: renderReviewPanel });
  // Opening it is what asks git. Nothing polls: `git status` is a subprocess,
  // and a drawer nobody has opened must not be starting one every second.
  wirePanel("git-panel", { open: () => voidAction("general", () => refreshGit()), rebuild: () => renderGitPanel() });
  wirePanel("keys-drawer", {
    open: () => {
      // A fresh search every time. A drawer that reopens holding the last query
      // is a drawer that looks empty for a reason nobody can see.
      keysQuery = "";
      renderKeysPanel();
      (document.getElementById("keys-search") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });

  wirePanel("palette", {
    open: () => {
      const input = document.getElementById("palette-input") as HTMLInputElement;
      input.value = "";
      renderPaletteList("");
      // Which is why the class goes on before this runs: `focus()` on a
      // `display: none` input does nothing, and a command palette that opens
      // with the caret still in the document is a command palette nobody uses.
      input.focus();
    },
    close: () => runtime.view.focus(),
  });
  wirePanel("notes-chooser", {
    rebuild: renderNotesChooser,
    open: renderNotesChooser,
    close: () => runtime.view.focus(),
  });
  wirePanel("history-modal", { open: () => voidAction("general", () => renderHistory()), rebuild: () => voidAction("general", () => renderHistory()) });
  wirePanel("places-chooser", {
    // `renderPlaces` is **synchronous** — it draws an answer that already arrived,
    // so wrapping it in `voidAction` (which takes a promise) would be wrapping a
    // value in the wrong shape rather than adding anything.
    open: renderPlaces,
    rebuild: renderPlaces,
    close: () => runtime.view.focus(),
  });
  wirePanel("preview-modal", {
    open: () => {
      // Drawn from the pages themselves, not copied out of the other pane. It
      // used to be `body.innerHTML = preview.innerHTML`, which serialises ten
      // megabytes of SVG the browser has already parsed and then parses all of
      // it again — and it would now copy the *windowing* too, so every page the
      // reader had not scrolled past would arrive in the full-screen view as an
      // empty box.
      drawCurrentInto(document.getElementById("preview-modal-body")!);
      // The modal is a second pane over the same pages, so it needs the same
      // direction and the same page width. One call, both panes.
      applyPreview();
    },
  });
  // The pending callback is the reason this hook exists: a form modal dismissed
  // by Escape must not leave an "insert" waiting to fire at whatever opens next.
  wirePanel("form-modal", { close: settlePendingModals });
  // Likewise the operation set. The hydra reads the caret's structure once and
  // drives keys against it; outliving that structure is how it came to eat
  // keystrokes aimed at ordinary prose.
  wirePanel("hydra", {
    // The reset is hydra's own state and machine; the hook is the one path
    // every way of closing runs through, so it calls out rather than deletes.
    close: () => resetHydra(),
  });
  wirePanel("welcome", { close: () => localStorage.setItem("ksav.onboarded", "1") });
}

function installHooks() {
  wirePanels();
  runtime.onRerenderChrome(rerenderChrome);
  runtime.onOpenDoc(openDoc);
  // The pane system's wiring: the callbacks that stay in main.ts, registered
  // once, so the pane modules read nothing more of this file than this list.
  wirePanes({
    rebuildPanes: () => renderPanes(),
    refreshHeads: () => refreshPaneHeads(),
    makePaneState: (body, prose, at) => makeState(body, prose, at),
    proseHere: () => proseHere(),
    applyEditingModes: () => voidAction("save_file", () => setEditingMode(settings.editingMode)),
    fillSidePanes: () => {
      renderOutline();
      renderNotesPane();
    },
    refreshSidePanes: () => {
      if (isReviewOpen()) renderReviewPanel();
      if (settings.outline) renderOutline();
      if (settings.notesPane) renderNotesPane();
      if (settings.marksPane) renderMarksPane();
      // The find drawer is a view of the document too — of two of them. The
      // source half moves on every keystroke and the printed half moves when
      // the compile lands, and a list of hits into a document that has since
      // been edited is the stale surface this application is repeatedly
      // reported for.
      if (isPanelOpen("find-drawer")) renderFindPane();
    },
    openDocHanded: (id) => openDoc(id, { handedOver: true }),
    askText: (message, initial) => askText(message, initial),
  });
  // The chrome wiring: the verbs the ribbon and the context strip name that
  // their own waves have not moved yet, registered once, read through
  // `chromeWiring()` — the same shape `wirePanes` gives the pane modules.
  // Thirteen members, the ones that are genuinely main-held: the editor verbs
  // wave 12 has not claimed (entityAct, the folds, the hidden break,
  // runStructureAction, makeListHere, addContentsHere), the compartment
  // machinery (reconfigureShortcuts), and the three refreshers whose subjects
  // import this file's docTextNow and cannot take a reverse edge
  // (refreshContextBar via contextbar, refreshStylesPanel via stylespanel,
  // saveFileAs via fileui's ribbon import). The other twenty-five were direct
  // imports in their own modules all along — see ribbon.ts.
  wireChrome({
    entityAct,
    insertFold,
    hideBlockHere,
    hideLineHere,
    foldToLevel,
    foldListsToDepth,
    hiddenBreak,
    runStructureAction,
    makeListHere,
    applyCustomStyle,
    unwrapCustomStyle,
    openNewStyle,
    openStyleEditor,
    openStylesFor,
    addContentsHere,
    saveFileAs,
    refreshContextBar: updateContextBar,
    reconfigureShortcuts,
    refreshStylesPanel: () => {
      if (isPanelOpen("styles-panel")) renderStylesPanel();
    },
  });
  // The palette's wiring: what the rows beyond the content registry can be.
  wirePalette({
    macroName: (id) => actionName(id, savedNameMap()),
    shellActions: actions,
      render: (list) => drawList(document.getElementById("palette-list")!, list, LOOKS.palette),
  });
  // The insertion path's wiring: the macro recorder and the chooser's apply
  // stay main-held until the macros' and the chooser's own waves.
  wireInsert({
    noteSnippet: (raw) => {
      if (!inAction) noteSnippet(raw);
    },
    applyNotePick,
  });
  // The macros' modal, rebind and action door; the recorder is macros.ts's.
  wireMacros({
    actionById: (id) => actionById(id) as { id: string; run: (v: unknown) => boolean } | undefined,
    askText,
    reconfigureShortcuts,
  });
  // The hydra: a structural operation performed where the caret is.
  wireHydra({ runStructure: (action, sticky) => runStructureAction(action, sticky) });
  // The git drawer's modal and the body swap of a commit restore.
  wireGit({ loadBody });
  wireStyles({
    destinationRows: () => destinationRows(),
    applySkin: (name) => applySkin(name),
    undoSkin: () => undoSkin(),
    reconfigureShortcuts,
    openStyleEditor: (name) => openStyleEditor(name),
  });
  // The destinations' editor write-back.
  wireDestinations({ replaceAll: (text, caret) => replaceAll(text, caret) });
  // The starter follows a language switch with a body swap and a setting write.
  wireStarter({ setSetting });
  // A template's direction arrives through the shell's setting write.
  wireTemplates({ setSetting });
  // The switch machine borrows the state factory and the compartment sweep.
  wireDocswitch({ makeState, syncGlobals });
  // The rows' wiring: the dispatch verbs the list-shaped surfaces share.
  wireRows({
    runAction: (id) => {
      runAction(id);
    },
    restore: (snapshot) => {
      voidAction("save_file", () => restoreSnapshot(snapshot));
    },
    swapDoc: replaceAll,
    revealCaret: () => {
      revealCursor({ quiet: true, anchor: 0 });
    },
  });
  // The settings drawer's wiring: what a row can ask the shell for.
  wireSettings({
    runList: actions,
    openKeys,
    eventToKey,
    whose,
    reconfigure: reconfigureShortcuts,
    swapRunningHead: moveRunningIntoDoc,
    confirm: ask,
    noteHome: bodyHome,
    attachFont: () => {
      voidAction("save_file", () => addFont());
    },
    dropAsset: (name) => {
      voidAction("save_file", () => removeAsset(name));
    },
    live: now,
    pageSet: setPageSetup,
    adoptDefault: adoptPageSetupAsDefault,
    write: setSetting,
  });
  // Snapshots reach the shell through the same register-once contract.
  wireSnapshots({
    confirm: ask,
    refreshBaseline,
    loadBody,
  });
  save.onUpdateTitleBar(updateTitleBar);
  // Spell-check rides the compile timer: one pause in typing, both schedules.
  onSchedule(scheduleSpellCheck);
  // Every preview pane on screen, told at once. Not a re-render: a banner
  // appearing must not scroll the page the writer is reading, which is the
  // whole reason to look at a stale preview in the first place.
  onStale((v) => {
    for (const b of document.querySelectorAll<HTMLElement>(".preview-stale")) b.hidden = !v;
  });
  // A compile is the only thing that can say what a note's marker printed as,
  // and it lands seconds after the edit that caused it — long after the drawer
  // last redrew. Without this the markers appear on the next keystroke and not
  // on the compile that fetched them, which reads as a drawer that lags a word
  // behind the page.
  onAfterCompile(() => {
    if (settings.notesPane) renderNotesPane();
  });
}

const REGISTRY_RETRY_MS = 2000;

/**
 * Load the command and template registries, retrying before giving up.
 *
 * These drive the toolbar, the menus, the palette and the completions, so
 * without them the editor still takes text but has no visible way to format it.
 * The failure used to be swallowed with a comment calling the registries
 * "optional for first paint" — which is true of the *paint* and false of the
 * app: the writer got an empty ribbon, empty menus and an empty palette, with
 * nothing said and nothing that would ever fetch them again.
 *
 * The notice is a banner and not a status-bar line for a mechanical reason as
 * much as a design one: boot runs the first compile straight after this, and
 * that compile writes the status bar — so a message left there would flash once
 * and vanish, which is barely better than silence.
 *
 * Only the *first* attempt is worth awaiting. Boot waits for it so the chrome
 * can be drawn with the registries in hand, but the retry happens on a timer
 * with nobody waiting: holding the editor's first render behind a second
 * network attempt would make a failed fetch cost the writer two seconds of
 * blank screen, which is a worse bug than the one being fixed.
 */
async function loadRegistries(): Promise<void> {
  if (await fetchRegistries()) return;
  showChromeNotice("registriesFailed");
  window.setTimeout(async () => {
    if (await fetchRegistries()) return;
    // Out of automatic attempts: hand the retry over rather than leaving a
    // "retrying…" that will never resolve.
    showChromeNotice("registriesGaveUp", { key: "retrySave", press: () => void loadRegistries() });
  }, REGISTRY_RETRY_MS);
}

/** One attempt. Returns whether the chrome now has what it needs. */
async function fetchRegistries(): Promise<boolean> {
  try {
    const [commands, templates] = await Promise.all([
      runtime.backend!.commands(),
      runtime.backend!.templates(),
    ]);
    runtime.setRegistries(commands, templates);
    // Not awaited and not in the `Promise.all`: the chrome does not need the
    // sefer catalogue to be built, and a catalogue that never arrives must not
    // be able to hold the toolbar hostage.
    void sefarim.load(runtime.backend);
    clearChromeNotice();
    rerenderChrome();
    maybeOnboard();
    return true;
  } catch {
    return false;
  }
}
/**
 * Move the dictionary into a file, where there is a filesystem to put it in (B29).
 *
 * > *"The user dictionary lives in one browser profile — invisible to the desktop
 * > app, gone if the profile is cleared."*
 *
 * Silent when it works and silent when there is no file to use. It says something
 * in exactly one case: words that were in this browser's `localStorage` have just
 * been folded into the file — because a writer who taught the checker a hundred
 * words in the browser build is entitled to be told they came across.
 *
 * A failure costs the *file*, not the dictionary: `localStorage` is still there
 * behind it, so the worst case is the behaviour Ksav has always had.
 */
async function adoptDictionary(): Promise<void> {
  const backend = runtime.backend;
  if (!backend || typeof (backend as { dictionary?: unknown }).dictionary !== "function") return;
  try {
    const kept = await (
      backend as unknown as {
        dictionary: () => Promise<{ text: string; write: (t: string) => Promise<void>; where: string }>;
      }
    ).dictionary();
    const moved = spell.keepDictionaryIn(kept.text, (next) =>
      kept.write(next).catch((e: unknown) => {
        const bad = troubleSaid(e, "save_file");
        setStatus(bad.said, "err", bad.detail);
      }),
    );
    if (moved > 0) {
      showChromeNotice(`${moved} · ${kept.where}`);
    }
  } catch (e) {
    // The dictionary still works out of localStorage; nothing a writer needs to
    // act on, and a modal at startup over a word list would be absurd.
    console.error("could not open the dictionary file:", e);
  }
}

async function boot() {
  installHooks();
  // The interface language, before anything reads it — and this line did not
  // exist. `setLang` was called from exactly one place, `setSetting("lang", …)`,
  // which is the chip; nothing ever handed it what was stored. So the
  // application booted Hebrew every time however many times a writer had chosen
  // English, and only the chip put it right, for that session.
  //
  // That is what the help panel's Hebrew title was really about. The interface
  // was not "in English with one Hebrew string in it" — it was in Hebrew, and
  // the chip's rerender reached the header and the settings drawer and left the
  // panels where they were. Two faults, one symptom, and this is the first.
  //
  // Before `starterDoc()`, which asks `getLang()` to decide whether a new
  // document opens in English and left-to-right.
  if (settings.lang === "en" || settings.lang === "he") setLang(settings.lang);
  // The store opens before anything is drawn: the editor is constructed with
  // the document's text in it, so there is never a frame in which the writer
  // could type into a buffer that has no document behind it.
  const starter = starterDoc();
  // An English starter is a left-to-right document, and it is the only moment
  // where flipping the direction is unambiguously right: nothing else exists yet
  // to be disturbed by it.
  if (getLang() === "en" && !localStorage.getItem("ksav.onboarded")) {
    // `dir` is page setup, so it belongs to the document rather than to the
    // application — and at this moment there is exactly one, the starter, which
    // is what makes flipping it unambiguously right here.
    setPageSetup({ dir: "ltr" });
  }
  // Whether a durable store is available. When it is not — a private window, or
  // storage blocked — the fix is to lose *persistence* and nothing else. The old
  // fallback returned early here, and in doing so skipped the command/template
  // registries (leaving an empty toolbar, empty menus, no completions), the
  // unload guard (so closing the tab discarded the work with no prompt, in the
  // one case where nothing else was keeping it either), spell-check and the
  // timers. Everything below still runs; only the store-backed steps are guarded.
  let durable = true;
  try {
    runtime.setCurrentDoc(await docs.init(starter, t("untitled")));
  } catch (e) {
    durable = false;
    runtime.setCurrentDoc({ id: docs.newId(), title: t("untitled"), body: starter, assets: [], updated: Date.now() });
    reportSaveFailure(e); // the banner is honest; everything after it now works
  }
  if (durable) {
    // A binding lives in the store, so there is nothing to recall without one.
    void files.recallBinding(runtime.currentDoc.id).then((b) => {
      runtime.setCurrentBinding(b);
      updateTitleBar();
    });
  }
  // Preferences that could not be read are preferences the writer has silently
  // lost. This banner exists because that failure had nowhere to go for the
  // whole life of the application: `loadSettings` threw on every boot and the
  // catch handed back the defaults, so every choice anybody ever made was
  // discarded on reload and nothing anywhere said a word about it. A fallback
  // that cannot report itself is indistinguishable from a feature that does not
  // work, which is what "emacs mode does nothing" turned out to be.
  const lostSettings = settingsLoadFailure();
  if (lostSettings) showChromeNotice(tf("settingsLost", lostSettings));
  // And the other half. A failed *read* has had a banner since it was written;
  // a failed *write* was swallowed, so a writer whose localStorage had filled
  // set preferences that the UI accepted, applied for the session, and lost on
  // reload — with no sentence anywhere. The string was already written.
  reportSettingsWriteFailures((why: string) => showChromeNotice(tf("settingsNotKept", why)));
  render();
  wireKeys();
  save.wireUnloadGuard();
  const status = document.getElementById("status")!;
  status.textContent = t("rendering");
  runtime.setBackend(await createBackend());
  const badge = document.getElementById("engine-badge");
  if (badge) {
    const labels: Record<string, string> = {
      server: "⬢ server",
      wasm: "⬡ wasm",
      desktop: "🖥 native",
    };
    badge.textContent = labels[runtime.backend!.kind] ?? runtime.backend!.kind;
  }
  // The dictionary as a file (B29) and the command/template registries are
  // independent of each other and both only need the backend, so they resolve
  // together rather than one behind the other in front of the first compile.
  // `adoptDictionary` still lands after the backend and before anything
  // spell-checks, so the first check already has the writer's own words. A
  // browser has no `dictionary()` and keeps using `localStorage`.
  await Promise.all([adoptDictionary(), loadRegistries()]);
  // The change gutter needs the document's newest snapshot, and boot does not
  // go through `openDoc`.
  void refreshBaseline();
  // What the modes are lent. Every route is the one the rest of the application
  // already uses: `:w` and C-x C-s reach the same save as the toolbar, `:name`
  // and M-x reach the same `runAction` the keyboard and the palette reach — so
  // the macro recorder sees a command run from `:` exactly as it sees one run
  // from a key — and `M-x` opens the palette this application already has rather
  // than a second, worse minibuffer built to be spelled the same way.
  keymodes.setBridge({
    save: () => void saveFile(),
    commands: () => actions().map((a) => a.id),
    run: (id) => void runAction(id),
    prompt: () => openPalette(),
    // The units a sefer is made of, from the same modules the outline pane, the
    // ribbon and the note register read. A second opinion about where a note
    // ends would disagree first with the pane sitting beside the text.
    units: (at) => {
      const doc = docTextNow();
      const out: Partial<Record<keymodes.SeferUnit, keymodes.Span>> = {};

      // A note. `a` is the marker with its body; `i` is the prose. A marker with
      // no body yet has no inside, and `hasBody` is how the register says so.
      const note = noteAt(doc, at);
      if (note) {
        out.note = {
          from: note.from,
          to: note.deferred ? note.deferred.defTo : note.to,
          inner: note.hasBody ? { from: note.bodyFrom, to: note.bodyTo } : undefined,
        };
      }

      // A heading, and *its section*: everything under it until the next heading
      // at the same level or above. `i` is the section without the heading line,
      // which is what a writer means by "this heading" when they say `dih`.
      // `sectionAt`, not `headingAt`. The difference is the whole feature:
      // `headingAt` matches only while the caret is *on the heading line*, so
      // `dah` did nothing from inside the section it is named after — which is
      // where a writer always is. `headings.ts` has carried the right function
      // all along, with a comment saying it is what "move this section" and
      // "fold this section" mean when the caret is in the body text.
      //
      // Recorded because the previous attempt at these text objects was
      // withdrawn with a note saying the arithmetic here was "right and is what
      // the next attempt needs". It was not; it was one function call wrong,
      // and calling the registration the only missing piece is what stopped
      // anybody looking.
      const all = heads.headings(doc);
      const here = heads.sectionAt(doc, at, all);
      if (here) {
        const after = all.find((h) => h.from > here.from && h.level <= here.level);
        const sectionTo = after ? after.from : doc.length;
        out.heading = {
          from: here.from,
          to: sectionTo,
          inner: { from: here.to, to: sectionTo },
        };
      }
      return out;
    },
    heading: (at, forward) => {
      const all = heads.headings(docTextNow());
      const next = forward
        ? all.find((h) => h.from > at)
        : [...all].reverse().find((h) => h.from < at);
      return next ? next.from : null;
    },
  });
  // An error in an included chapter opens *that* chapter and goes to the line.
  // `voidAction` and not `void`: opening a chapter awaits the document it is
  // switching to, and a failure there is a real one that the writer would
  // otherwise meet as a silent no-op. The fence in `asyncaction.test.mjs`
  // asked for exactly this answer rather than an inventory entry.
  // `voidAction` and not `void`: opening a chapter awaits the document it is
  // switching to, and a failure there is a real one the writer would otherwise
  // meet as a silent no-op. The fence in `asyncaction.test.mjs` asked for
  // exactly this answer rather than an inventory entry.
  //
  // `general` and not a new `Doing`: switching documents is not a compile, a
  // save, Girsa or a linkify, and `Doing` is a closed union on purpose — every
  // variant costs a sentence in both catalogues and earns its place by naming a
  // failure the writer could confuse with another kind.
  onGoToPart((file, line, column) => voidAction("general", () => gotoPart(file, line, column)));
  registerServiceWorker();
  voidAction("save_file", () => openSharedIfLinked());
  // Rescue the text before anything else, then say what happened.
  crash.install(
    () => ({
      title: runtime.currentDoc?.title ?? "",
      body: runtime.docText(),
      id: runtime.currentDoc?.id,
    }),
    (_e, detail) => showCrashPanel(detail),
  );
  voidAction("save_file", () => offerRecovery());
  voidAction("general", () => maybeCheckForUpdate());
  // A filesystem stat that nothing before the first compile reads, so it does
  // not gate the first page — void-fired like the other watch bookkeeping.
  void watch.markInSync(runtime.currentDoc.id, runtime.currentBinding);
  // Notice when the file changes underneath us — Dropbox pulling an older copy
  // down, a second window, a `git checkout`. On focus above all, because
  // alt-tabbing back from whatever touched it is the overwhelmingly common case.
  watch.watchForChanges(
    () => ({ docId: runtime.currentDoc?.id ?? "", binding: runtime.currentBinding }),
    () => {
      const name = runtime.currentBinding?.name ?? "";
      // A notice and not a modal. The conflict costs nothing until the next
      // save, and a dialog thrown up mid-sentence over something that can wait
      // is how writers learn to dismiss dialogs without reading them.
      showChromeNotice(tf("fileChangedNotice", name), {
        label: t("reloadFromDisk"),
        press: () => voidAction("save_file", () => reloadFromDisk()),
      });
    },
  );
  if (settings.editingMode && settings.editingMode !== "default") {
    voidAction("save_file", () => setEditingMode(settings.editingMode));
  }
  runCompile();
  // The first check has to be scheduled explicitly: boot compiles directly
  // rather than through scheduleCompile, so nothing would be checked until the
  // writer's first keystroke.
  scheduleSpellCheck();
  // Periodic auto-snapshot, when the writer has left it on (only stores when the
  // text changed). Snapshots live in the store, so this is the one timer with
  // nothing to do without one — and the cadence is `scheduleAutoSnapshots`,
  // which reads the settings and can be called again when they change.
  if (durable) scheduleAutoSnapshots();
  // periodic write-back to the bound file, when there is one to write to. Kept
  // even with no store: a file binding made this session writes to disk, not to
  // the store, so it is exactly the escape hatch a private window still has.
  // This used to be a bare `setInterval` that ran forever — on a backgrounded
  // tab, a laptop on battery — with no guard against a slow call overlapping
  // itself. See `installBackgroundTimers`.
  installBackgroundTimers();
  // The Girsa handoff poll is girsa.ts's now (spec.md §10.6); same install
  // moment, its own file.
  installGirsaPoll();
}
/** True when this session's autosave should be quiet. */


function tabHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * The recurring write-back job, gated and guarded.
 *
 * It suspends while the tab is hidden (the writer is not looking, and `save.ts`
 * already flushes on the way out), and holds a `busy` flag so a slow call
 * cannot pile up behind itself — the shape `watch.ts` uses. The other
 * background job, the Girsa inbox poll, lives beside this one in `girsa.ts`.
 */
function installBackgroundTimers(): void {
  let autosaveBusy = false;
  window.setInterval(() => {
    if (tabHidden() || autosaveBusy) return;
    autosaveBusy = true;
    void Promise.resolve(autosaveToFile()).finally(() => {
      autosaveBusy = false;
    });
  }, FILE_AUTOSAVE_MS);
}

/**
 * #89 — open the strip if it was left open.
 *
 * `setSetting` is the only thing that drives the per-key chain above, and it runs on a
 * **change**. A `minimap: true` restored from `localStorage` at startup therefore never
 * reaches the `key === "minimap"` branch, so the setting says the minimap is on, the
 * canvas draws in the gutter, and **no strip appears** — a screenshot of which is
 * indistinguishable from the feature being broken.
 *
 * Which is the third time in this project that a saved preference is read by a handler
 * that only runs on change. The setting is honoured here, once, after boot.
 */
function openMinimapIfSaved(): void {
  // Wired before the strip is ever opened, because the registry's own close — the
  // `×` and Escape both go through it — is what has to run this teardown.
  wireMinimapPanel(minimapDeps());
  if (settings.minimap && !minimapIsOpen()) toggleMinimap();
}

/**
 * The strip's one set of dependencies.
 *
 * A function and not a literal so the hook and the opener cannot disagree about what
 * closing means — which is exactly how it went wrong before, when the `×` closed
 * through the registry and the opener closed through a closure.
 */
function minimapDeps() {
  return {
    dir: (): "rtl" | "ltr" => (docConfig().dir === "rtl" ? "rtl" : "ltr"),
    saved: () => settings.minimapAt,
    remember: (p: Placement) => {
      settings.minimapAt = p;
      saveSettings();
    },
    close: () => {
      closeMinimap();
      settings.minimap = false;
      saveSettings();
    },
  };
}

boot().then(openMinimapIfSaved);

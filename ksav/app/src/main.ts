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
} from "./deferred-lint";
import { printingAnchor } from "./deferred";
import { createBackend, sourcesOf } from "./api";
/** How often the editor asks Girsa's desk whether anything arrived. A second
 *  is under the threshold at which a hand-off feels like a hand-off, and it is
 *  one lock and an empty vector when there is nothing waiting. */
const GIRSA_POLL_MS = 1000;
const GIRSA_POLL_MAX_MS = 30_000;
import type { TemplateDef } from "./api";
import type * as api from "./api";
import * as panelviews from "./panelviews";
import { getLang, hasKey, setLang, t, tf } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import * as opendocs from "./opendocs";
import * as panes from "./panes";
import * as paneplaces from "./paneplaces";
import * as tabs from "./tabs";
import type { DocAsset } from "./docs";
import {
  ACTION_COMMAND,
  BREAK_COMMAND,
  PLACED_COMMANDS,
  runRegisteredAction,
} from "./actions";
import * as store from "./store";
import * as files from "./files";
import {
  applyPick,
  noteAt,
  regionShown,
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
  spellCheckFromScratch,
} from "./spellcheck";
import { hintFor, keybindings } from "./keyhint";

import { viewportFraction } from "./scrollmap";
import * as entity from "./entity";
import * as styles from "./styles";
import * as review from "./review";
import { typstString, typstContent } from "./typst-escape";
import { BODY_HOMES, defersBody, type BodyHome, type Errand } from "./deferred";
import {
  DESTINATIONS,
  PRESETS,
  caveatsFor,
  presetOf,
  regionsIn,
  setDeclaredArgs,
  samePick,
  type DestinationId,
  type NotePick,
} from "./channels";
import * as channels from "./channels";
import * as apparatus from "./apparatus";
import { narrowing } from "./narrowing";

// The modules `main.ts` was split into. What is left here is the shell: the
// editor itself, the chrome around it, the panels, and boot. Everything with a
// life of its own — the store, saving, compiling, exporting, the diagnostics
// vocabulary, the settings — now lives beside this file rather than inside it.
import {
  el,
  noticeHost,
  glyphBtn,
  iconBtn,
  fieldRow,
  textField,
  numberField,
  checkField,
  pickFile,
  readAsDataUrl,
  humanSize,
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
import { setSafeSvg } from "./svgsafe";
import {
  openPanel,
  closePanel,
  togglePanel,
  isPanelOpen,
  mountPanel,
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
import * as save from "./save";
import { scheduleSave, saveNow, flushSaves, reportSaveFailure } from "./save";
import { scheduleCompile, runCompile, compileNow, onStale, onAfterCompile, onSchedule, bodyOnScreen } from "./compile";
import * as whitespace from "./whitespace";
import * as commands from "./commands";
import {
  applyPreview,
  currentPages,
  drawCurrentInto,
  forgetPages,
  showPagesFor,
  pageBox,
  rememberPages,
} from "./preview";
import {
  setPaneTree,
  setFocusedPane,
  paneTree,
  showInEveryPane,
  rememberPlaces,
  restorePlaces,
  restorePreviewPlaces,
  sourceViews,
  rememberPanes,
  wirePanes,
} from "./panestate";
import { renderPanes, refreshPaneHeads, cyclePaneZoom, gotoPart } from "./panehost";
import { narrowHere, widenHere } from "./paneview";
import { swapPaneToward } from "./panedrag";
import { invalidateScrollMap, matchFraction, followCaretInPreview, clamp01, clampScroll, cancelCaretFollow } from "./panescroll";
import {
  refreshPanes,
  selectTab,
  closeTab,
  newTab,
  newDocTab,
  enterDoc,
  retargetPanes,
  buildTabStrip,
  refreshTabStrip,
} from "./tabstrip";
import { openArrangements, applyPageView } from "./panearrangements";
import { drawMark, isPlainClick, pixelInPage } from "./jump";
import { BIDI_MARKS, bidiSupport, toggleIsolate, visibleBidiMarks } from "./bidi";
import { changeGutter, changeHighlight, changes, nameMarks, setBaseline } from "./changes";
import { focusCompartment, focusExtension } from "./focus";
import * as keymodes from "./keymodes";
import * as crash from "./crash";
import * as share from "./share";
import * as docx from "./docx";
import * as interchange from "./interchange";
import * as org from "./org";
import * as update from "./update";
import * as watch from "./watch";
import { overviewRuler } from "./ruler";
import { errorLineDecorations, errorLines, offsetOf, setErrorLines } from "./errorlines";
import { forgetDismissed, onGoToLine, onGoToPart, onMarkLines } from "./diagview";
import { nikudKeymap, buildNikudBar } from "./nikud";
import * as exports from "./exports";
import * as zoom from "./zoom";
import * as pagerange from "./pagerange";
import { troubleSaid } from "./diagnostics";
import { insertionAt } from "./mode";
import * as structure from "./structure";
import * as heads from "./headings";
import * as macros from "./macros";
import { openHelp, renderHelp, wireHelp, buildHelpPanel } from "./help";
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
  runRow,
  LOOKS,
  wireRows,
} from "./rowlists";
import { buildSettingsDrawer, toggleSettings, captureShortcut, resetShortcuts, wireSettings } from "./settingsdrawer";
import { applyCustomStyle, unwrapCustomStyle, openNewStyle, openStyleEditor, wireCustomStyles } from "./customstyles";
import { openStyles, openStylesFor, renderStylesPanel, styleRow, selectControl, textControl, wireStyles } from "./stylespanel";
import { takeSnapshot, restoreSnapshot, openHistory, renderHistory, wireSnapshots } from "./snapshots";
import { refreshGit, openGit, forgetGit, gitMayHaveChanged, gitForHeader, renderGitPanel, wireGit } from "./gitui";
import { openCommands, openKeys, buildCommandsDrawer, renderCommands } from "./commandsdrawer";
import {
  noteAction,
  noteTyped,
  noteSnippet,
  toggleRecording,
  savedMacros,
  playMacro,
  deleteMacro,
  macroName,
  isRecording,
  currentRecording,
  wireMacros,
} from "./macros";
import { openHydra, resetHydra, dismissForeignHydra, wireHydra } from "./hydra";
import { insertSnippet, insertCommand, tieredNoteHere, snippetTab, docLang, dirLang, wireInsert } from "./insert";
import * as hiding from "./hiding";
import { LIST_DEPTHS } from "./lists";
import * as lists from "./lists";
import {
  linkifySelection,
  refreshSources,
  askForMekor,
  tellGirsaWhereItIs,
  attachRefToNote,
} from "./girsa";
import { openPalette, paletteKey, renderPaletteList, wirePalette } from "./palette";
import * as header from "./header";

// ---------------------------------------------------------------- editor
//
// The first screen. There are two of them, because there was only ever one and
// it was Hebrew: an English writer opened Ksav to a page of Hebrew they had to
// delete before they could type a word. That is the right default for a
// Hebrew-first tool and the wrong first impression for the other half of what it
// claims. The English one is its own document, not a translation — the two say
// the same three things about the product in the idiom of their own language.
const STARTER_HE = `#שער[ברוכים הבאים לכְּתָב]
#תת_שער[מערכת הכתיבה העברית · על גבי Typst אמיתי]

#קו_מפריד

#כותרת1[מבוא]

זהו עורך #הדגשה[כְּתָב]. כל פקודה כאן היא פונקציית Typst אמיתית, ולכן #נטוי[הקינון בלתי מוגבל] עובד מאליו — טבלה בתוך הערה בתוך כותרת בתוך רשימה, הכול מוצג נכון.

#רשימה(
  פריט[בחרו תבנית מתפריט #הדגשה[תבניות].],
  פריט[פתחו את #הדגשה[פקודות] עם Ctrl+K.],
  פריט[החליפו בין עברית לאנגלית, ומצב פרוזה, מלמעלה.],
)
`;

const STARTER_EN = `#title[Welcome to Ksav]
#subtitle[A Hebrew writing system, on real Typst]

#hrule

#h1[Getting started]

This is the #bold[Ksav] editor. Every command here is a real Typst function, so
#italic[nesting has no limit] — a table inside a footnote inside a heading inside
a list all typesets correctly, without anything special being done about it.

#bullets(
  item[Pick a starting point from the #bold[Templates] menu.],
  item[Open #bold[Commands] with Ctrl+K to see everything there is.],
  item[Switch between English and Hebrew, and prose mode, from the top bar.],
)

Hebrew and English can share a page: #rtl_[כתב עברי] sets right to left in the
middle of this sentence, and the spelling of both is checked.
`;

/** The first document, in the language of the interface it was opened in. */
function starterDoc(): string {
  return getLang() === "en" ? STARTER_EN : STARTER_HE;
}

/**
 * Follow the interface language with the starter, while it is still the starter.
 *
 * The interface opens in Hebrew, because Ksav is Hebrew-first and that is the
 * right default. So an English writer's actual first move is to switch the
 * language — at which point choosing the starter "by interface language" at boot
 * has already happened and chosen Hebrew, and they are back to deleting a page
 * of Hebrew. Switching the language a second later has to bring the welcome text
 * with it or the English starter is a document almost nobody would ever see.
 *
 * The guard is exact equality with one of the two starters. The moment a writer
 * has typed a single character it is their document, and nothing here may touch
 * it — a "helpful" replacement of real text would be unforgivable, and there is
 * no undo across a document swap.
 */
function swapUntouchedStarter() {
  const body = docTextOf(runtime.view.state.doc);
  const want = starterDoc();
  if (body === want || (body !== STARTER_HE && body !== STARTER_EN)) return;
  const dir = getLang() === "en" ? "ltr" : "rtl";
  if (docConfig().dir !== dir) setSetting("dir", dir);
  loadBody(want);
}

const proseCompartment = new Compartment();
const dirCompartment = new Compartment();
const themeCompartment = new Compartment();
const phraseCompartment = new Compartment();

/**
 * CodeMirror's own words, in the language the rest of the window is in.
 *
 * The find/replace panel is the library's, and it shipped as the library wrote
 * it: `Find`, `Replace`, `next`, `previous`, `all`, `match case`, `regexp`,
 * `by word`, `replace all` — nine English labels in a right-to-left Hebrew
 * product, in the one panel a writer opens to look for a word in their sefer.
 * Every other surface here is translated; this one was never asked.
 *
 * `EditorState.phrases` is keyed on the library's own literals, which is why
 * `i18n.ts` carries them under a `find.` prefix rather than under names of our
 * own: a phrase table is a translation of somebody else's strings.
 */
function searchPhrases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const word of SEARCH_WORDS) out[word] = t(`find.${word}`);
  return out;
}

/** Every label CodeMirror's search panel puts on the screen. */
const SEARCH_WORDS = [
  "Find",
  "Replace",
  "next",
  "previous",
  "all",
  "match case",
  "regexp",
  "by word",
  "replace",
  "replace all",
  "close",
  "Go to line",
  "go",
] as const;

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

// ---------------------------------------------------------------- the open document
//
// The app used to hold one nameless document in one localStorage key. It now
// holds a library; `runtime.currentDoc` is whichever one is open, and `runtime.currentBinding` is
// the real file it saves to, when it has one.
/** Set while runtime.switching documents, so the editor's own change events don't write
 *  the outgoing document's text over the incoming one. */

/**
 * Show a document, opening it if it was not already open.
 *
 * This used to be a **text edit** into one long-lived editor, which is the
 * single line of code the whole "no concept of an open document" finding was
 * hiding behind: one text, one caret, one undo history, for every document a
 * writer would ever hold. `runtime.swapDocument` made that swap survivable by
 * resetting the history; it is not called from here any more, because there is
 * no longer one history to reset.
 *
 * A document is a state now (see `opendocs.ts`). Switching stashes what the view
 * holds for the outgoing document — its text, its caret, its undo stack, where
 * it was scrolled to — and hands the view the incoming one. Nothing is
 * reconstructed, so nothing can come back subtly different from how it was left.
 *
 * The document being *already open* is the ordinary case now rather than the
 * only case, and it costs one `setState`.
 */
/**
 * How many document switches have been asked for.
 *
 * `openDoc` awaits three times and mutates global state after each of them, and
 * its only guard was an early return for *the same* id — so two switches to
 * **different** documents, which is one click in the switcher panel or one
 * `Mod-1` tab key, interleaved freely. What that produced: `refreshBaseline()`
 * dispatching document A's snapshot baseline into a view now holding B,
 * `rememberPages(leaving)` filing B's on-screen pages under A's id, and
 * `retargetPanes(leaving, id)` relabelling panes for a document that is no
 * longer the one arriving.
 *
 * `setSwitching` looks like the guard and is not one: it is a flag the change
 * listener reads, it is cleared in the middle of the function, and it does not
 * stop a second entry.
 *
 * A ticket, the way `runCompile` and `runSpellCheck` take one — and the way this
 * very function's binding recall already does five lines from the end, which is
 * where the shape was read off. Its comment says *"a newer switch has won"*; the
 * rest of the function did not ask.
 */
let switchGeneration = 0;

async function openDoc(id: string, opts: { handedOver?: boolean } = {}) {
  const mine = ++switchGeneration;
  const stale = () => mine !== switchGeneration;
  const next = await docs.getDoc(id);
  if (!next || stale()) return;
  // Already on screen — and *fully* so. Both halves are checked because closing
  // a document moves the open set's focus before this runs, so the set can name
  // a document the view is not yet showing.
  if (opendocs.focusedId() === id && runtime.currentDoc?.id === id) return;
  await flushSaves();
  // The last await before the synchronous run of mutations below. Everything
  // from here to `refreshBaseline` happens in one turn, so a newer switch can
  // only overtake at this line and at the one after it.
  if (stale()) return;
  runtime.setSwitching(true);
  stashFocused();
  const leaving = runtime.currentDoc?.id ?? null;
  // Where each pane is standing, before the document is taken out from under
  // them. The open set has one caret per document; a window has one per pane.
  // **Unless the caller has already done it**, which is not an optimisation:
  // this function yields twice before it reaches here, and a caller that has
  // rebuilt the panes cannot wait that long — see `handOverPages`. By the time
  // this line runs for such a caller, the pages on screen are the *arriving*
  // document's, and filing them under the departing one would put one sefer's
  // layout under another sefer's name, which is the defect this whole mechanism
  // exists to close.
  if (!opts.handedOver) {
    rememberPlaces(leaving);
    // Keep this document's pages before anything points somewhere else, so
    // coming back to it shows it rather than a blank pane and a wait. See
    // `showPagesFor` for the other half, and `preview.ts` for why the pages are
    // kept at all.
    if (leaving) rememberPages(leaving);
  }
  runtime.setCurrentDoc(next);
  docs.setCurrentId(next.id);
  // The incoming document is a different text; its first spell check must be a
  // full one, and the outgoing document's dirty region has no meaning here.
  spellCheckFromScratch();
  // Same rule, for the same reason, one line further out: a warning the writer
  // waved away is a fact they accepted about *that* sefer — its fonts, its
  // apparatus — and carrying it here would hide a true thing about this one.
  forgetDismissed();
  if (!opendocs.isOpen(id)) {
    opendocs.put({ id, state: makeState(next.body, !!settings.prose), scrollTop: 0, prose: !!settings.prose });
  }
  const entry = opendocs.focus(id)!;
  showInEveryPane(entry.state);
  syncGlobals();
  runtime.view.scrollDOM.scrollTop = entry.scrollTop;
  // …and then each pane that has been in this document before goes back to
  // where it was, which the line above can only answer for the focused one.
  restorePlaces(id);
  runtime.setSwitching(false);
  // The binding and the "as we found it" mtime stamp have no bearing on what is
  // drawn — `markInSync` in particular is a real filesystem stat, over IPC on
  // the desktop, on a path that may be a synced or network drive. Resolve them
  // after the text is on screen and let the title bar catch up when they land,
  // exactly as `boot()` does. Clear the outgoing binding first so nothing reads
  // the *previous* document's while the recall is in flight.
  runtime.setCurrentBinding(null);
  void files.recallBinding(next.id).then((b) => {
    // A newer switch may already have won; only stamp if this is still the doc.
    if (runtime.currentDoc?.id !== next.id) return;
    runtime.setCurrentBinding(b);
    return watch.markInSync(next.id, b);
  });
  // **Not** `save.markFileSaved()`. That used to be here, and with one global
  // flag for a library of documents it cleared the mark on the document being
  // *left* as well: switch away from an edited file and back, and the dot in
  // the title bar was gone and the write-back was skipped — a file with unsaved
  // changes reporting itself as saved.
  //
  // The flag is per document now, so there is nothing to clear: whatever was
  // true of this one is still true of it. Opening it says nothing new about
  // whether the file on disk has caught up, and pretending otherwise is what
  // the bug was.
  // The panes in this arrangement now show the incoming document, so the tab
  // can say what it is holding. See `retargetPanes` for why this is a mutation.
  retargetPanes(leaving, id);
  refreshTabStrip();
  rememberPanes();
  await refreshBaseline();
  // `refreshBaseline` reads the document out of the store and dispatches a
  // snapshot baseline into the view. A switch that started while it was in
  // flight has already put a different document there, and everything below —
  // `forgetGit`, `updateTitleBar`, `rerenderChrome`, `refreshPaneHeads`,
  // `showPagesFor`, `restorePreviewPlaces` — describes whichever document that
  // turn believes is current. Let the newer switch finish the job.
  if (stale()) return;
  // A different document is a different folder and possibly a different
  // repository. Anything version control learned about the last one is now a
  // claim about the wrong file, and a chip reporting three uncommitted changes
  // that belong to a sefer you closed is precisely the class of lie this
  // application is being audited for.
  forgetGit();
  updateTitleBar();
  rerenderChrome();
  // Narrowing rides with the document, because it is stored in the document's
  // state and `stashFocused` above put that state away with the anchor still in
  // it. Coming back to a sefer you were working through one siman at a time
  // finds you where you were. The strip has to be told, or it goes on naming the
  // section of the document you just left.
  refreshPaneHeads();
  runtime.view.focus();
  showPagesFor(id);
  // After the pages are drawn, for the reason `restorePreviewPlaces` gives:
  // there is nothing to scroll through until they are.
  restorePreviewPlaces(id);
  scheduleCompile();
}

/**
 * The open documents, as a list a person can look at and choose from.
 *
 * Most recently used first, which makes the *second* row the answer to "the one
 * I was just in" — the same order `lastDoc` jumps by, so the key and the panel
 * cannot disagree about what "last" means.
 */
function openSwitcher() {
  if (opendocs.count() < 2) {
    setStatus(t("onlyOneOpen"), "");
    return;
  }
  const list = document.getElementById("switcher-list")!;
  list.replaceChildren(
    el("div", { class: "menu-cat" }, [t("openDocs")]),
    ...opendocs.openDocs().map((entry, i) => {
      const meta = docs.library().find((e) => e.id === entry.id);
      return el(
        "button",
        {
          class: "pal-item" + (i === 0 ? " active" : ""),
          onClick: () => {
            closePanel("switcher");
            voidAction("save_file", () => enterDoc(entry.id));
          },
        },
        [
          el("b", {}, [(i === 0 ? "● " : "") + (meta?.title ?? entry.id)]),
          el("span", { class: "menu-desc" }, [meta?.fileName ?? ""]),
        ],
      );
    }),
  );
  openPanel("switcher");
}

/** Straight to the document before this one. Nothing to do with one open. */
function goToLastDoc() {
  const to = opendocs.previous();
  if (!to) {
    setStatus(t("onlyOneOpen"), "");
    return;
  }
  voidAction("save_file", () => openDoc(to));
}

/** Put what the view currently holds back into the open set, before leaving it. */
function stashFocused() {
  const id = opendocs.focusedId();
  if (!id || !runtime.view) return;
  opendocs.stash(id, runtime.view.state, runtime.view.scrollDOM.scrollTop);
}

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

/**
 * Close a document — put it away, do not destroy it.
 *
 * The distinction the inventory insists on, and the reason the control that does
 * this must never wear the `×` the Documents menu uses to delete: *"closing and
 * deleting appearing as the same glyph in two strips is not survivable"*. The
 * document stays in the library, with its text, its history and its file
 * binding; what goes is the open state — the caret, the undo stack, the scroll.
 *
 * Saved first, unconditionally. Closing something is exactly the moment a writer
 * assumes their work has been dealt with.
 */
async function closeOpenDoc(id: string) {
  await flushSaves();
  if (opendocs.focusedId() === id) stashFocused();
  // No pane is standing in a document that is not open, and one that is
  // reopened is opened at its own caret. Keeping the rows would put a pane back
  // at a place in a sefer measured against a text edited since.
  paneplaces.forgetDoc(id);
  // And the file stamp — one of the two callers `watch.forget`'s comment names,
  // the other being the delete path below.
  //
  // **This comment used to say "Nothing called it", and it was wrong by the time
  // anyone read it** — the call is the next line. It described the state before
  // the fix, in the present tense, which is how #36 came to be filed: an audit
  // read `watch.forget`, found the call sites in the same file, and filed the
  // claim a second time against a comment that agreed with it. A note recording
  // what used to be true is worse than no note, because it is the kind that gets
  // believed.
  watch.forget(id);
  const next = opendocs.close(id);
  if (next) {
    // `openDoc` does the whole switch, and it proceeds because `runtime.currentDoc`
    // is still the document just closed. One path in, so a document arriving on
    // screen always arrives the same way.
    await openDoc(next);
    // *After* the switch, not before: leaving a document is what files its
    // pages, so releasing them first would be undone one line later. They are
    // megabytes of SVG for a tab that is no longer there.
    forgetPages(id);
    return;
  }
  // The last one. An editor with no document is not a state this application
  // has, so closing the only open document opens a new empty one rather than
  // leaving a writer looking at nothing.
  await newNamedDoc();
  forgetPages(id);
}

/**
 * Point the change gutter at this document's newest snapshot.
 *
 * Called whenever the comparison could have moved: on opening a document, and
 * after a snapshot is taken — at which point everything is unchanged again,
 * which is the honest reading and the reason the gutter clears itself rather
 * than accumulating a session's worth of green.
 *
 * A document with no history yet has no baseline, and the gutter shows nothing.
 * That is right: against nothing, every line is new, and a solid stripe down the
 * whole document says less than an empty gutter does.
 */
async function refreshBaseline() {
  if (!runtime.currentDoc) return;
  let baseline: string | null = null;
  try {
    baseline = (await docs.latestSnapshot(runtime.currentDoc.id))?.body ?? null;
  } catch {
    // The history store being unreachable is reported by the code that writes
    // to it; a gutter is not the place to raise it a second time.
    baseline = null;
  }
  runtime.view.dispatch({ effects: setBaseline.of(baseline) });
}

async function newNamedDoc() {
  closeMenus();
  await flushSaves();
  const doc = await docs.createDoc(t("untitled"), "");
  await openDoc(doc.id);
}

async function duplicateDoc(id: string) {
  const src = await docs.getDoc(id);
  if (!src) return;
  // A duplicate is the same sefer, which includes how it is laid out. Copying
  // the body and leaving the page setup behind gave the copy this writer's
  // *new-document* default, so duplicating a Letter-sized document produced an
  // A4 one — the same fact going missing that `serializeDoc` used to drop.
  const copy = await docs.createDoc(
    src.title + " ‏(2)",
    src.body,
    src.assets,
    src.customCommands,
    src.config ?? {},
  );
  await enterDoc(copy.id);
}

/**
 * Delete a document from the library.
 *
 * Distinct from [`closeOpenDoc`], and the distinction is the point: this
 * destroys the sefer, that one puts it away. A deleted document also has to
 * leave the open set — an entry pointing at a record that no longer exists is a
 * switcher row that opens nothing.
 */
async function removeDoc(id: string) {
  const entry = docs.library().find((e) => e.id === id);
  if (!entry) return;
  if (!(await ask(tf("confirmDeleteDoc", entry.title), { danger: true, okLabel: t("delete") }))) return;
  const wasFocused = opendocs.focusedId() === id;
  await docs.deleteDoc(id);
  await files.rememberBinding(id, null);
  paneplaces.forgetDoc(id);
  // The other half of what `watch.forget`'s comment describes: the binding is
  // gone, so the stamp is a claim about a file this document no longer has.
  watch.forget(id);
  const next = opendocs.close(id);
  if (wasFocused) {
    // Whatever was next in the open set, or the library's newest, or a new one.
    // Three fallbacks because all three are reachable: closing the last open
    // document of several, deleting the only open one, and deleting the last
    // document there is.
    const to = next ?? docs.library().find((e) => e.id !== id)?.id;
    if (to) await openDoc(to);
    else await newNamedDoc();
  } else {
    rerenderChrome();
  }
  // A deleted document's kept pages are a layout of text that no longer exists.
  // After the switch, for the reason `closeOpenDoc` gives.
  forgetPages(id);
}

async function renameDoc() {
  const name = await askText(t("renamePrompt"), runtime.currentDoc.title);
  if (name === null) return;
  runtime.currentDoc.title = name.trim() || t("untitled");
  void saveNow();
  updateTitleBar();
  rerenderChrome();
}

/** The document title shown in the header, with the bound file beside it. */
function updateTitleBar() {
  const el0 = document.getElementById("doc-title");
  if (!el0 || !runtime.currentDoc) return;
  el0.textContent = runtime.currentDoc.title;
  const sub0 = document.getElementById("doc-file");
  if (sub0) {
    // A dot when the bound file on disk is behind the editor. The writer used to
    // first hear of unsaved changes only in the browser's leave-page dialog,
    // though the save layer already knew — this surfaces it where the file is
    // named. Only shown when there is a file to be behind.
    //
    // **And only when there is a file at all.** A download-tier binding is the
    // *name* of a copy that left the browser once; there is nothing on the
    // other end of it to be behind, nothing any Save can bring up to date, and
    // a dot that can never be cleared is a warning the writer learns to ignore.
    // So the name still shows — it is how they know which copy they downloaded
    // — and the hover says what kind of thing it is.
    const real = files.canWriteBack(runtime.currentBinding);
    const dirty = real && save.hasUnsavedFileChanges();
    sub0.textContent = runtime.currentBinding ? (dirty ? "● " : "") + runtime.currentBinding.name : "";
    sub0.classList.toggle("dirty", dirty);
    sub0.title = runtime.currentBinding
      ? real
        ? (dirty ? t("unsavedChanges") + " · " : "") +
          (runtime.currentBinding.path || runtime.currentBinding.name)
        : t("copyOnly")
      : t("noFileBound");
  }
  document.title =
    (files.canWriteBack(runtime.currentBinding) && save.hasUnsavedFileChanges() ? "● " : "") +
    runtime.currentDoc.title +
    " · Ksav";
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

/** Convert a keydown event to a CodeMirror key string ("Mod-Shift-k"). */
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
export function countableText(src: string): string {
  return plainText(src);
}
function countNow() {
  const el = document.getElementById("wordcount");
  if (!el || !runtime.view) return;
  const text = countableText(docTextOf(runtime.view.state.doc));
  const words = (text.match(/[^\s]+/g) || []).length;
  const chars = text.replace(/\s+/g, " ").trim().length;
  el.textContent = `${words} ${t("words")} · ${chars} ${t("chars")}`;
}
let countTimer: number | undefined;
const COUNT_DEBOUNCE_MS = 200;
function updateCounts() {
  clearTimeout(countTimer);
  countTimer = window.setTimeout(countNow, COUNT_DEBOUNCE_MS);
}

/**
 * The other direction: show where the cursor's text printed.
 *
 * A command rather than something that follows the caret, and the reason is
 * cost: answering means laying the whole document out, the same work a compile
 * does. Running that on every cursor movement would turn arrow keys into
 * compiles. Asked for, once, it is worth the wait — and this is the direction
 * that has no substitute, because a reader can at least *find* a word in the
 * source by eye, and cannot find a coordinate on a page at all.
 */
async function revealCursor(opts: { quiet?: boolean; from?: number; anchor?: number } = {}): Promise<boolean> {
  const quiet = opts.quiet ?? false;
  if (!runtime.backend) return true;
  const pages = currentPages();
  if (!pages.length) {
    if (!quiet) setStatus(t("revealNoPages"), "warn");
    return true;
  }
  const { body, offset } = bodyOnScreen();
  const raw = runtime.view.state.selection.main.head;
  // A caret on a deferred note is a caret on a command, and a command prints
  // nothing — so the most obvious thing in the document to click, the footnote
  // marker, was the one thing this could not answer about. `printingAnchor`
  // hands back the prose that marker puts on the page; everywhere else it says
  // nothing and the caret speaks for itself.
  const head = printingAnchor(runtime.view.state.doc.toString(), raw) ?? raw;
  const line = runtime.view.state.doc.lineAt(head);
  if (!quiet) setStatus(t("revealWorking"));
  const points = await runtime.backend.reveal(
    body,
    docConfig(),
    // Back the other way through the same offset: the engine wants a line in the
    // body it is being sent, and this is a line in the writer's document.
    { line: line.number + offset, column: [...line.text.slice(0, head - line.from)].length + 1 },
    docs.requestAssets(runtime.currentDoc?.assets ?? []),
  );
  const at = points[0];
  const box = at ? pageBox(pages[at.page]) : null;
  if (!at || !box) {
    // Genuinely nothing to show: the cursor is in a comment, in a command's
    // arguments, or on text the layout dropped. Saying so beats a silent no-op,
    // because the writer pressed a key and is owed an answer — unless this was a
    // quiet reveal fired by a click, where a warning on every stray click is the
    // noise, not the help.
    if (!quiet) setStatus(t("revealNowhere"), "warn");
    return true;
  }
  const node = document.querySelector<HTMLElement>(`#preview .page[data-page="${at.page}"]`);
  if (!node) return true;
  // Land **the spot**, not the page it is on.
  //
  // This was `node.scrollIntoView({ block })`, where `node` is the whole `.page`
  // element — so having asked the compiler which glyph the caret printed as, and
  // having got back a point in Typst points, it centred a sheet of A4 and threw
  // the point away. On a full page the answer is wrong by up to a page height,
  // and it is wrong in a way that looks like it works: the right page arrives,
  // the mark is drawn on the right word, and the word is off-screen or halfway
  // up the pane depending on where it happened to sit on the sheet.
  //
  // `pixelInPage` is the inverse of the arithmetic that produced `at` in the
  // first place (`jump.ts`), and it goes through the drawn element's own
  // bounding box — which carries the zoom, the fit-to-width setting and the
  // device pixel ratio, so dividing by it cancels all three. The same reason
  // `drawMark` positions in percentages.
  const host = node.closest<HTMLElement>(".preview-host");
  if (host) {
    const spot = pixelInPage(at, node.getBoundingClientRect(), box);
    // Where in the *viewport* the writer wants it.
    //
    // Two answers, and which one is right depends on what asked. `match` is the
    // same top/middle/bottom the panes line up on everywhere else, so a writer
    // who set the match point to the middle gets the middle here too rather
    // than a second opinion — and it is what a *command* wants, since somebody
    // who pressed a key to be shown a thing wants it framed.
    //
    // `keep` is for a click, and only a click: it lands the answer at the same
    // height in this pane that the question was asked at in the other one, so
    // the eye does not have to travel. `from` is that height, and it is absent
    // for everything that is not a click — which is why `clickTarget` cannot
    // silently change what the reveal *command* does.
    const mp = opts.anchor !== undefined
      ? opts.anchor
      : settings.clickTarget === "keep" && opts.from !== undefined
        ? clamp01(opts.from)
        : matchFraction();
    // The page's offset inside the scroller, plus the point's offset inside the
    // page, minus where in the viewport it should sit.
    const pageTop = node.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
    host.scrollTo({
      top: clampScroll(pageTop + spot.y - mp * host.clientHeight, host),
      behavior: "smooth",
    });
  } else {
    // No scroller found — an arrangement this code does not know about. The page
    // is still the right page, so the old behaviour is the right fallback rather
    // than doing nothing.
    const block = settings.syncMatch === "top" ? "start" : settings.syncMatch === "bottom" ? "end" : "center";
    node.scrollIntoView({ block, behavior: "smooth" });
  }
  drawMark(node, at, box);
  if (!quiet)
    setStatus(
      points.length > 1 ? tf("revealFoundMany", points.length) : tf("revealFound", at.page + 1),
      "ok",
    );
  return true;
}

/**
 * Every place a line printed, as a list the writer picks from (#82).
 *
 * **The list beside the answer, not instead of it.** [`revealCursor`] goes to the
 * first place, because a cursor has one place to be and reading order is the
 * honest default; this is the gesture for the question the first-place answer
 * cannot express — *where else does this appear?* A part pulled in at two places
 * is not an exotic document, and until now there was no way to ask.
 *
 * The engine returns both the list and its own `first` (which is `line_of`, the
 * same one `reveal` uses), and the list is what is shown. Clicking a row moves the
 * caret there and closes, which is the whole of the interaction: no second
 * dialog, no mode.
 */
async function revealPlaces(): Promise<boolean> {
  if (!runtime.backend) return true;
  const pages = currentPages();
  if (!pages.length) {
    setStatus(t("revealNoPages"), "warn");
    return true;
  }
  const { body, offset } = bodyOnScreen();
  const doc = runtime.view.state.doc;
  const head = runtime.view.state.selection.main.head;
  const line = doc.lineAt(head);
  setStatus(t("revealWorking"));
  // No `file:` sent, and that is deliberate. `reveal` does not send one either —
  // the engine resolves which part a line is in from the document, and a client
  // that decided for itself would be a second implementation of that question.
  // The answer echoes back the file it resolved, which is also what the chooser's
  // heading shows.
  const found = await runtime.backend.places(
    body,
    docConfig(),
    { line: line.number + offset, column: [...line.text.slice(0, head - line.from)].length + 1 },
    docs.requestAssets(runtime.currentDoc?.assets ?? []),
  );
  placesAnswer = found;
  openPanel("places-chooser");
  renderPlaces();
  return true;
}

/** The last answer, kept so the panel can re-render on a rebuild or a resize. */
let placesAnswer: api.Places | null = null;

function closePlaces() {
  closePanel("places-chooser");
}

/** What the chooser is showing, as data — separated from the DOM so it can be
 *  asserted, and so "is there anything to choose" is one line rather than a walk
 *  over buttons. */
function placesRows(answer: api.Places | null): { lines: number[]; one: boolean } {
  const lines = answer?.places ?? [];
  return { lines, one: lines.length <= 1 };
}

function renderPlaces() {
  const list = document.getElementById("places-list");
  if (!list) return;
  const answer = placesAnswer;
  const subject = document.getElementById("places-subject");
  if (subject) {
    const where = answer?.file ?? t("mainBody");
    subject.textContent = answer ? `${where} · ${answer.line}` : "";
  }
  const { lines, one } = placesRows(answer);
  if (lines.length === 0) {
    // Nothing to choose is a **sentence**, not an empty list. The writer pressed
    // a key and is owed an answer, and "this line is not in a part" is a real
    // one — it means the line is the main body, which prints exactly once.
    setStatus(t("placesOnlyHere"), "");
    list.replaceChildren();
    return;
  }
  if (one) {
    // One place is not a choice, so the panel says so and does not offer a
    // single row to click — `revealCursor` already went there.
    setStatus(t("placesOnlyHere"), "");
  }
  list.replaceChildren(
    ...lines.map((line) =>
      el("button", {
        class: "row",
        type: "button",
        onClick: () => {
          closePlaces();
          revealToExpandedLine(line);
        },
      }, [el("span", { class: "row-main" }, [tf("placesRow", line)])]),
    ),
  );
}

/** Put the caret on a line of the **expanded** body and reveal it there.
 *
 * The engine's `places` are lines of the body it is sent, so the caret goes there
 * and `revealCursor`'s own machinery takes it the rest of the way — which is why
 * this is a call and not a copy: the translation from an expanded line back to the
 * writer's document is arithmetic with an offset in it, and a second copy of that
 * arithmetic is a second thing to be wrong.
 */
function revealToExpandedLine(expandedLine: number) {
  const { offset } = bodyOnScreen();
  const doc = runtime.view.state.doc;
  const target = Math.max(1, expandedLine - offset);
  const line = doc.line(Math.min(target, doc.lines));
  runtime.view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
  });
  runtime.view.focus();
  voidAction("general", () => revealCursor({ quiet: true }));
}

/**
 * Follow a click in the source into the preview.
 *
 * The reader clicks a word — or a footnote marker — and the page scrolls to
 * where it printed, the mirror of clicking the page to move the caret. It reuses
 * `revealCursor` (the caret is already where the click put it) but quietly: no
 * status line, no warning on a click that lands on a comment, because a click is
 * cheap to make by accident and a reveal that narrates every one is noise.
 *
 * Gated on synced scrolling being on and a preview being present, and debounced
 * so a double-click does not fire the layout twice.
 */
/**
 * How far down its own pane a click was made.
 *
 * Measured against the editor's scroller rather than the window, because in a
 * split the pane is not the screen — a click at the top of the lower of two
 * stacked sources is most of the way down the window and at the top of its pane,
 * and it is the pane the answer is about.
 */
function clickFraction(e: MouseEvent): number | undefined {
  const pane = (e.target as HTMLElement | null)?.closest<HTMLElement>(".cm-scroller");
  if (!pane) return undefined;
  const box = pane.getBoundingClientRect();
  return viewportFraction(box.top, box.height, e.clientY);
}

let revealClickTimer = 0;
function revealFromSourceClick(e?: MouseEvent) {
  if (settings.clickToPreview === false) return;
  if (!currentPages().length) return;
  // How far down its own pane the click was made, for `clickTarget: keep`.
  // Measured now and passed as a number rather than kept as an event, because
  // by the time the reveal fires the pane may have scrolled and the event's
  // coordinates would be about a viewport that has moved.
  const from = e ? clickFraction(e) : undefined;
  // A click also moves the caret, which schedules the cheap line-level follow.
  // The click gets the exact, glyph-level reveal instead — it asked for it — so
  // cancel the approximate one rather than let the preview jump twice.
  cancelCaretFollow();
  clearTimeout(revealClickTimer);
  revealClickTimer = window.setTimeout(() => voidAction("general", () => revealCursor({ quiet: true, from })), 120);
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
          name: macroName(a.id),
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

// ---------------------------------------------------------------- templates / exports
function loadBody(body: string) {
  runtime.view.dispatch({
    changes: { from: 0, to: runtime.view.state.doc.length, insert: body },
    selection: { anchor: 0 },
  });
  closeMenus();
  runtime.view.focus();
  scheduleCompile();
}

/**
 * A template, into a document rather than over one.
 *
 * The sharpest member of *"opening a document replaces the one I had open"*,
 * and it was not an `openDoc` call at all: picking a template dispatched the
 * whole template body over the open document's text. On an empty new document
 * that is exactly right and is what the menu is for; on a sefer in progress it
 * is the text replaced, undoable and not obviously so.
 *
 * So the emptiness of what is on screen decides. An empty document takes the
 * template in place — no new tab, no second untitled document in the library
 * for a writer who opened the application and picked a template, which is the
 * first thing a new writer does. Anything else gets a document of its own,
 * placed by `openIn` like every other way in.
 */
async function startFromTemplate(body: string, title?: string) {
  closeMenus();
  if (runtime.docText().trim() === "") {
    loadBody(body);
    return;
  }
  await flushSaves();
  const doc = await docs.createDoc(title?.trim() || t("untitled"), body);
  await enterDoc(doc.id);
}
/**
 * Load a template, and put the document in the direction it was written for.
 *
 * The direction is not decoration here. An English letter loaded into a
 * right-to-left document sets flush right with its date on the wrong side —
 * correct for the setting, wrong for the letter, and confusing enough that a
 * writer would reasonably conclude English is not supported. Picking a template
 * is a deliberate act, and the direction control in the toolbar visibly moves
 * with it, so this is a change the writer can see and undo rather than a hidden
 * one.
 *
 * `lang` is absent on templates coming from an older engine build, in which case
 * the direction is left alone: guessing would be worse than doing nothing.
 */
async function loadTemplate(tpl: TemplateDef) {
  // The document first, the direction after: `setSetting` writes the page setup
  // of the document *on screen*, so setting it before a template that starts a
  // new document would flip the direction of the sefer being left behind and
  // leave the arriving one with whatever the new-document default is.
  await startFromTemplate(tpl.body, getLang() === "he" ? tpl.he : tpl.en);
  const wanted = tpl.lang === "en" ? "ltr" : tpl.lang === "he" ? "rtl" : null;
  if (wanted && docConfig().dir !== wanted) {
    // Through `setSetting`, not by assignment: the direction also reconfigures
    // the editor's own text direction, and setting the field alone would leave
    // the preview and the source pane disagreeing about which way the page runs.
    setSetting("dir", wanted);
    rerenderChrome();
  }
}

/**
 * The templates, with the ones in the interface's own language first.
 *
 * Not filtered — a Hebrew speaker writing an English letter, and an English
 * speaker who wants the siddur, both exist and neither should have to go
 * looking. Ordered, because the first thing in a menu is what a menu is telling
 * you to use.
 */
function templatesForMenu(): TemplateDef[] {
  const lang = getLang();
  return [...runtime.templatesReg].sort((a, b) => {
    const mine = (t: TemplateDef) => (t.lang === lang ? 0 : 1);
    return mine(a) - mine(b);
  });
}

interface UserTemplate {
  id: string;
  name: string;
  body: string;
}
function userTemplates(): UserTemplate[] {
  try {
    return JSON.parse(localStorage.getItem("ksav.userTemplates") || "[]");
  } catch {
    return [];
  }
}
function saveUserTemplates(list: UserTemplate[]): boolean {
  // A template holds a whole document, so this is the one storage write outside
  // the careful save story that can plausibly hit the localStorage quota. It used
  // to throw straight through the caller; now it reports the failure instead of
  // letting an uncaught exception abandon a half-updated menu.
  try {
    localStorage.setItem("ksav.userTemplates", JSON.stringify(list));
    return true;
  } catch (e) {
    console.warn("saving templates failed:", e);
    setStatus(t("templateSaveFailed"), "error");
    return false;
  }
}
async function saveAsTemplate() {
  closeMenus();
  const name = await askText(t("templateName"));
  if (!name) return;
  const list = userTemplates();
  list.push({ id: "u" + performance.now().toString(36), name, body: docTextOf(runtime.view.state.doc) });
  if (saveUserTemplates(list)) rerenderChrome();
}
function deleteUserTemplate(id: string) {
  if (saveUserTemplates(userTemplates().filter((u) => u.id !== id))) rerenderChrome();
}

/**
 * A document already bound to this exact file, if there is one.
 *
 * Only when the identity is certain — a Tauri path, or a File System Access
 * handle that reports itself the same entry. A "download"-tier binding has no
 * durable file identity, so it is always treated as new rather than guessed at.
 */
async function docBoundTo(binding: files.FileBinding): Promise<string | null> {
  if (binding.kind === "download") return null;
  // Every binding in one transaction rather than one transaction per library
  // entry — this runs on every Open, and the loop below used to wait for a
  // separate IndexedDB round trip per document in the library.
  const bindings = await files.recallBindings(docs.library().map((e) => e.id));
  for (const entry of docs.library()) {
    const other = bindings.get(entry.id);
    if (!other || other.kind !== binding.kind) continue;
    if (binding.kind === "tauri" && binding.path && other.path === binding.path) return entry.id;
    if (binding.kind === "handle" && binding.handle && other.handle) {
      try {
        if (await binding.handle.isSameEntry(other.handle)) return entry.id;
      } catch {
        /* an unusable handle simply isn't a match */
      }
    }
  }
  return null;
}

async function openFile() {
  closeMenus();
  const opened = await files.openFile();
  if (!opened) return;
  await flushSaves();
  // Opening the same file twice used to make a second document bound to the same
  // path, filling the library with duplicates of one sefer. If one is already
  // open, switch to it instead of cloning it.
  const existing = await docBoundTo(opened.binding);
  if (existing) {
    await openBound(existing, opened);
    return;
  }
  const stripExt = opened.binding.name.replace(/\.[^.]+$/, "");
  const parsed = docs.parseDoc(opened.text, stripExt || t("untitled"));
  // `?? {}` and not `?? undefined`: a `.ksav` that carries no page setup has
  // *said* it is laid out the shipped way, and a file has to open the same way
  // on every machine. Leaving it absent would hand it the reader's own
  // new-document default, which is the thing B26 exists to stop.
  const doc = await docs.createDoc(
    parsed.title,
    parsed.body,
    parsed.assets,
    parsed.customCommands,
    parsed.config ?? {},
  );
  await docs.setFileName(doc.id, opened.binding.name);
  await files.rememberBinding(doc.id, opened.binding);
  await enterDoc(doc.id);
}

/**
 * Open a document already bound to the file the writer just picked.
 *
 * **This is where the conflict was not missed but *erased*.** The old path read
 * the file, found the library entry bound to that path, **discarded the text it
 * had just read**, opened the IndexedDB copy, and — inside `openDoc` — called
 * `watch.markInSync`, stamping the file's *current* mtime as agreed. So the one
 * moment Ksav was holding both versions in its hands was the moment it threw
 * one away and recorded that they matched.
 *
 * `watch.ts:5-9` names Dropbox syncing an older copy down, a second Ksav window,
 * a text editor open on the same file and `git checkout` as the reason it
 * exists. Every one of them reaches the writer through Open, and after Open the
 * thirty-second autosave overwrote the file with no error, no prompt and
 * nothing in the log.
 *
 * The stamp cannot answer this question, and that is why the comparison is on
 * content: `known` is a per-session map, so on a fresh launch there is no stamp
 * to compare against and `checkFile` correctly says `unknown`. Here there is
 * something better than a stamp — both texts.
 */
async function openBound(id: string, opened: { text: string; binding: files.FileBinding }) {
  const stored = await docs.getDoc(id);
  const onDisk = docs.parseDoc(opened.text, "");
  if (stored && stored.body !== onDisk.body) {
    if (await ask(tf("fileChangedSinceOpen", opened.binding.name))) {
      // Take the file. The library entry keeps its identity, its history and its
      // binding — this is the same document, with what is actually on disk in it.
      await docs.putDoc({
        ...stored,
        body: onDisk.body,
        assets: onDisk.assets,
        customCommands: onDisk.customCommands,
        ...(onDisk.config ? { config: onDisk.config } : {}),
      });
      await enterDoc(id);
      setStatus(t("loadedFromDisk"), "ok");
      return;
    }
    // Keep Ksav's copy — but the two are known to differ, and the next save has
    // to say so rather than silently winning.
    await enterDoc(id);
    watch.markConflicted(id);
    setStatus(t("keptEditorCopy"), "warn");
    return;
  }
  await enterDoc(id);
}

async function fileText(): Promise<string> {
  await flushSaves();
  // Pass the app-wide custom commands as the fallback so a local document that
  // uses one is written to disk self-contained, compiling for whoever opens it.
  return docs.serializeDoc(runtime.currentDoc, settings.customCommands);
}

/**
 * Save: to the bound file, or to a file the writer picks, or to the library.
 *
 * Which of the three is `save.saveRoute`, where the rule is written down and
 * tested. This is the shell's half — the dialogs, the conflict question and the
 * status line — and it deliberately does not re-derive the decision.
 */
async function saveFile() {
  closeMenus();
  await takeSnapshot(true);
  const text = await fileText();
  const route = save.saveRoute(runtime.currentBinding, files.supportsRealFiles());
  if (route === "writeBack" && runtime.currentBinding) {
    if (!(await files.ensureWritable(runtime.currentBinding, confirmWriteWords()))) {
      // Refused, and *now* it is a refusal: `ensureWritable` asked, natively,
      // and the writer said no. Before, this line reported a permission the
      // system had never been asked for.
      //
      // And it routes rather than stopping, which is what `files.ts:359` has
      // always claimed happens — *"a `false` here is what routes it to
      // `saveFileAs`, which is the dialog that re-admits the path"* — while this
      // printed the error and returned. Two statements about one path, in two
      // files, and the one in the comment was the better design. A writer who
      // declines the confirmation and is then shown Save-As can still put the
      // document somewhere; a writer who is shown an error can do nothing.
      setStatus(t("permissionDenied"), "warn");
      await saveFileAs();
      return;
    }
    // Somebody else changed the file since Ksav last agreed with it. A manual
    // Save *may* resolve that — the writer is here and can decide — but it has
    // to be their decision and not a silent overwrite.
    if ((await watch.checkFile(runtime.currentDoc.id, runtime.currentBinding)) === "changed") {
      if (!(await ask(tf("fileChangedOnDisk", runtime.currentBinding.name)))) {
        setStatus(t("saveCancelled"), "warn");
        return;
      }
    }
    let written = false;
    try {
      written = await files.saveTo(runtime.currentBinding, text);
    } catch (e) {
      const bad = troubleSaid(e, "save_file");
      setStatus(`${t("saveFailed")} — ${bad.said}`, "err", bad.detail);
      return;
    }
    if (written) {
      save.markFileSaved();
      save.clearConflict();
      await watch.markInSync(runtime.currentDoc.id, runtime.currentBinding);
      tellGirsaWhereItIs();
      // The document on disk just moved out from under `git status`. Re-read
      // it, if anybody is looking.
      gitMayHaveChanged();
      setStatus(tf("savedTo", runtime.currentBinding.name), "ok");
      return;
    }
    // The binding no longer authorises a write — a desktop path from a previous
    // session, or a handle whose permission lapsed. Ask where to put it, which
    // is what `pickAFile` would have said had the route been computed after the
    // attempt rather than before it.
    await saveFileAs();
    return;
  }
  // A platform that has files, and a document not bound to one. It is already
  // kept — `fileText` above flushed it to the library, which is the document's
  // home inside the app — so a plain Save acknowledges that rather than forcing
  // a file dialog. Popping "choose a name" on a document the writer opened from
  // the library, that already has a title and a home, is the reported nuisance:
  // *"the first save prompts for a name even though the doc exists."* Binding the
  // document to a file on disk is a deliberate act with its own door — File →
  // Save as… — and is not what Ctrl+S is for.
  if (route === "pickAFile") {
    setStatus(t("savedToLibrary"), "ok", t("savedToLibraryWhy"));
    return;
  }
  // And where there are no writable files, Ctrl+S is **not** a download. The
  // text is already kept — `fileText` above flushed it to the library, which is
  // where a document in this browser lives — so Save says so, with the route to
  // an actual file on the hover instead of in the downloads folder. See
  // `save.saveRoute` for the whole of why.
  setStatus(t("savedInBrowser"), "ok", t("savedInBrowserWhy"));
}

/**
 * Take the file's version, losing what is in the editor.
 *
 * Offered when the file has changed underneath, and it snapshots first —
 * "reload" is a destructive act and the version history is the only thing that
 * makes it a reversible one.
 */
async function reloadFromDisk() {
  const binding = runtime.currentBinding;
  if (!binding) return;
  if (!(await ask(t("confirmReloadFromDisk"), { danger: true }))) return;
  await takeSnapshot(true);
  const opened = await files.reread(binding);
  if (opened === null) {
    setStatus(t("rereadFailed"), "err");
    return;
  }
  loadBody(opened);
  await watch.markInSync(runtime.currentDoc.id, binding);
  save.markFileSaved();
  save.clearConflict();
  clearChromeNotice();
  setStatus(tf("reloadedFrom", binding.name), "ok");
}

/**
 * The panel that appears when something threw that nobody caught.
 *
 * The download button comes first and is the only one that matters: the writer's
 * text is already stashed, and this hands it to them as a file without asking
 * them to trust that the stash worked. The stack is underneath, collapsed,
 * because it is for the bug report and not for them.
 */
function showCrashPanel(detail: string) {
  const body = runtime.docText();
  // Said in the panel rather than in the status bar. Every other file that
  // leaves says so on the status line, and this is the one moment that is
  // wrong: the writer is looking at a dialog covering the application, which
  // has just crashed, and the one thing they need to know is whether their
  // words reached the disk. The button answers itself.
  const rescue = el("button", { class: "primary", type: "button" }, [t("crashDownload")]);
  rescue.addEventListener("click", () => {
    const name = (runtime.currentDoc?.title || "ksav") + ".ksav";
    files.download(name, body);
    rescue.textContent = tf("exported", name);
  });
  const panel = el("div", { id: "crash-panel", role: "alertdialog" }, [
    el("h3", {}, [t("crashTitle")]),
    el("p", {}, [t("crashLede")]),
    el("div", { class: "crash-acts" }, [
      rescue,
      el("button", { type: "button", onClick: () => location.reload() }, [t("crashReload")]),
    ]),
    el("details", {}, [el("summary", {}, [t("crashDetails")]), el("pre", {}, [detail])]),
  ]);
  document.body.append(panel);
}

/**
 * Offer back a document rescued from a crash — if there is anything to offer.
 *
 * As a *new* document, never over the top of the open one. The rescued text is
 * from a session that ended badly, and the surest way to turn one lost evening
 * into two is to let it overwrite whatever is there now.
 *
 * # Why this was appearing over nothing
 *
 * Reported as *"a crash notice appears on opening a document, which then loads
 * correctly"* — and both halves were true. A crash really had happened, in some
 * earlier session; the document really was fine, because autosave had already
 * written it. The rescue was a duplicate of text the library already held, and
 * the offer had no way to find that out: it compared the rescued body against
 * the *open* document only, and the open document is usually not the one that
 * crashed. Then, having offered, it cleared the stash only when the writer said
 * yes — so a rescue nobody wanted was offered again on every launch, for ever.
 *
 * So the stash carries its document's id, this asks that document whether it
 * already has the text, and the offer a writer does get carries a way to say no.
 */
async function offerRecovery() {
  const rescued = crash.recovery();
  if (!rescued) return;
  // The document it came from — a rescue with no id is from a build before the
  // id was stashed, and there is nothing to ask. The open document is checked
  // as well, and is what this used to check alone.
  const home = rescued.id ? await docs.getDoc(rescued.id) : null;
  if (!crash.worthOffering(rescued, [runtime.docText(), home?.body])) {
    crash.clearRecovery();
    return;
  }
  showChromeNotice(
    tf("recoveryOffer", rescued.title || t("untitled")),
    {
      label: t("recoveryOpen"),
      press: () =>
        void (async () => {
          const doc = await docs.createDoc(
            (rescued.title || t("untitled")) + " ‏(" + t("recovered") + ")",
            rescued.body,
          );
          crash.clearRecovery();
          clearChromeNotice();
          await enterDoc(doc.id);
        })(),
    },
    {
      // The other answer, which did not exist. Without it the only way to stop
      // being asked was to accept a document you did not want.
      label: t("recoveryDiscard"),
      press: () => {
        crash.clearRecovery();
        clearChromeNotice();
      },
    },
  );
}

/**
 * Ask GitHub whether there is a newer Ksav, at most once a day.
 *
 * Only where it can matter. A browser build updates itself the moment the page
 * is reloaded, so telling somebody there to go and download an installer would
 * be advice about a thing they do not have.
 */
async function maybeCheckForUpdate() {
  if (runtime.backend?.kind !== "desktop") return;
  if (settings.checkUpdates === false) return;
  if (!update.dueForCheck()) return;
  update.markChecked();
  const release = await update.checkForUpdate();
  if (!release) return;
  showChromeNotice(tf("updateAvailable", release.version), {
    // Composed with a version, so it is text rather than a key.

    label: t("updateDownload"),
    press: () => window.open(release.url, "_blank", "noopener"),
  });
}

/**
 * Read a file in, as a new document.
 *
 * Always a *new* document, never over the open one — importing is not a thing
 * anybody does to the sefer they are in the middle of writing, and getting that
 * wrong once costs somebody an evening.
 *
 * One function for every way in rather than one per format. This was
 * `importWord`, and the shape of it — pick a file, say "importing", convert,
 * name the document after the file, write the direction onto its page setup,
 * open it, and say in one sentence what did not come across — is not about Word
 * at all. Org arriving as the second route is what made that visible, and the
 * half that would have been copied is the last step: an import that quietly
 * loses the pictures, or the property drawers, is the kind of thing somebody
 * discovers at the printer.
 */
async function importAs(
  extension: string,
  convert: (file: File) => Promise<interchange.ImportResult>,
) {
  closeMenus();
  const picked = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extension;
    input.style.display = "none";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    // A dismissed picker fires no event in most browsers.
    window.addEventListener("focus", () => setTimeout(() => resolve(null), 800), { once: true });
    document.body.append(input);
    input.click();
  });
  if (!picked) return;
  setStatus(t("importing"), "");
  let result;
  try {
    result = await convert(picked);
  } catch (e) {
    const bad = troubleSaid(e, "general");
    setStatus(`${t("importFailed")} — ${bad.said}`, "err", bad.detail);
    return;
  }
  const title = picked.name.replace(new RegExp(`\\${extension}$`, "i"), "") || t("untitled");
  const created = await docs.createDoc(title, result.body);
  // The direction is read off the text rather than guessed, and written onto the
  // document's own page setup — where it belongs since B26.
  await docs.rememberConfig(created.id, { dir: result.dir });
  await enterDoc(created.id);
  setStatus(
    result.dropped.length ? tf("importedWithGaps", title, result.dropped.join(", ")) : tf("imported", title),
    result.dropped.length ? "warn" : "ok",
  );
}

const importWord = async () => {
  try {
    await importAs(".docx", async (f) => docx.importDocx(new Uint8Array(await f.arrayBuffer())));
  } catch (e) {
    const bad = troubleSaid(e, "general");
    setStatus(`${t("importFailed")} — ${bad.said}`, "err", bad.detail);
  }
};

const importOrg = async () => {
  try {
    await importAs(".org", async (f) => org.fromOrg(await f.text()));
  } catch (e) {
    const bad = troubleSaid(e, "general");
    setStatus(`${t("importFailed")} — ${bad.said}`, "err", bad.detail);
  }
};

/**
 * Install the service worker, where there is any point in one.
 *
 * Not in the desktop build, which is already installed and has no network to be
 * offline from; not on the dev server, where a cache-first worker would serve
 * yesterday's bundle and cost an hour before anyone worked out why. The version
 * rides on the URL because a *changed URL* is what makes a browser treat this as
 * a new worker at all — and the worker takes its cache name from the same place,
 * so a release can never reuse the previous release's cache.
 *
 * `type: "module"` because the worker imports its caching rule and the engine's
 * generated service paths. That import is the fix for the worst bug this file
 * ever had: the worker was cache-first for every same-origin GET, `/inbox` is a
 * queue that drains when it is read, and the first arrival it cached was the
 * same arrival inserted into the document once a second thereafter. A worker
 * that cannot tell an engine service from a stylesheet should not be deciding
 * what to keep, so now it is told, from the one registry in `services.rs`.
 */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (runtime.backend?.kind === "desktop") return;
  if (!import.meta.env.PROD) return;
  // …and **only the wasm build**, which is the one that can actually run
  // offline.
  //
  // The gate was `kind === "desktop"` and `PROD`, and neither is the question.
  // `ksav serve` is a production build served over HTTP with `HttpBackend`
  // behind it, so it installed a cache-first worker over an editor whose
  // *compiler is the server that just went away* — and `index.html` links
  // `rel="manifest"`, so it also offered to **install itself** in that state.
  // What comes back is a shell that boots, draws the chrome, and cannot
  // compile a document.
  //
  // `__WASM__` is the only build where "offline" means the whole product is
  // there, because the engine is in the tab. One line, and it is the line the
  // ambiguous status of the browser build cost.
  if (!__WASM__) return;
  void navigator.serviceWorker
    // `BASE_URL`, not `/`: on a project Pages site the app is served from
    // `/ksav/`, and a worker registered at the origin root would be refused —
    // a worker's scope cannot be broader than its own URL's directory.
    // `.` and not `+` between them: `URLSearchParams.get("v")` decodes `+` as a
    // space, so a `+` here names the cache `ksav-0.1.1 1955…` rather than the one
    // this line appears to write. It worked — a cache name is any string — and it
    // was wrong in the way only the DevTools cache list can show you.
    //
    // `?v=` carries the **version and this build's fingerprint**, because a
    // rebuild with no release does not move the version — and the worker's URL
    // is its identity. Same URL and same bytes means the browser installs
    // nothing, so a reader who came back after a push kept the worker, and the
    // cache, they already had: no `skipWaiting`, no `clients.claim`, and no
    // `activate`, which is the only thing that discards the `ksav-*` caches of
    // earlier builds. Both halves are here because each answers a different
    // question: the version says which release this is, the fingerprint says
    // whether anything under it changed.
    .register(`${import.meta.env.BASE_URL}sw.js?v=${update.CURRENT_VERSION}.${__BUILD_ID__}`, { type: "module" })
    .catch(() => {
      // Offline support is a bonus; failing to install it is not something to
      // interrupt a writer over, and every other consequence of a broken
      // network is already reported by whatever needed it.
    });
}

/**
 * Open a document that arrived in the link.
 *
 * Always as a *new* document, never over whatever is open — a link is something
 * somebody else sent, and it must not be able to replace this person's work. The
 * fragment is cleared afterwards so a reload does not create it a second time.
 */
async function openSharedIfLinked() {
  const shared = await share.decodeShare(location.hash);
  if (!shared) return;
  // `window.history`, not `history`: CodeMirror's undo extension is imported
  // under that name and shadows the global here.
  window.history.replaceState(null, "", location.pathname + location.search);
  // The writer's own commands travel with the document, or the link produces a
  // compile error at the far end for a document that compiles perfectly at this
  // one. Same for the page it was set on: `docs.createDoc` takes both, and this
  // was the one of the five definitions of "a document" that had not learned it.
  const doc = await docs.createDoc(
    shared.title || t("untitled"),
    shared.body,
    [],
    shared.customCommands,
    shared.config as never,
  );
  const setup = { ...(shared.config ?? {}), ...(shared.dir ? { dir: shared.dir } : {}) };
  if (Object.keys(setup).length) await docs.rememberConfig(doc.id, setup as never);
  await enterDoc(doc.id);
  setStatus(shared.review ? t("openedForReview") : t("openedFromLink"), "ok");
}

/**
 * Copy a link that carries this document.
 *
 * The document travels in the URL *fragment*, which is never sent to a server —
 * so nobody's unpublished chiddushim pass through whoever happens to be hosting
 * the static files. The cost is a length limit, and it is stated up front rather
 * than discovered: a link that nearly works decodes to garbage at the far end,
 * which is worse than being told to send the file.
 */
async function copyShareLink(forReview: boolean) {
  closeMenus();
  await flushSaves();
  // A desktop build has no useful URL of its own — `tauri://localhost` works on
  // precisely one machine — so the link has to name the hosted copy. Which
  // means there has to *be* one. This read `"https://ksav.app/"`, a literal
  // that appeared nowhere else in the repository: no deploy job, no workflow,
  // no DNS, nothing. Every reviewer link a desktop build ever produced pointed
  // at a host that has never existed, under a status line saying "Link copied".
  //
  // `__PUBLIC_BASE__` is what `deploy.yml` actually published to, or empty.
  // Empty is a refusal, not a fallback: a link that nearly works is the failure
  // mode this whole feature was written to avoid (see `share.TOO_LONG`), and a
  // link to a dead host does not even nearly work.
  const hosted = __PUBLIC_BASE__;
  const local = runtime.backend?.kind === "desktop" || location.protocol === "file:";
  if (local && !hosted) {
    setStatus(t("shareNoHost"), "err");
    return;
  }
  const base = local ? hosted : location.href;
  const link = await share.shareLink(base, {
    title: runtime.currentDoc?.title ?? "",
    body: runtime.docText(),
    dir: docConfig().dir,
    review: forReview,
    // Everything a `.ksav` file carries, because a link is a document and the
    // two had drifted: a `#let` of the writer's own, and the page setup this
    // document was written on rather than whatever the reader's settings say.
    customCommands: runtime.currentDoc?.customCommands ?? settings.customCommands,
    config: ownPageSetup(runtime.currentDoc?.config) as unknown as Record<string, unknown>,
  });
  if (link.tooLong) {
    setStatus(tf("shareTooLong", Math.round(link.length / 1000)), "err");
    return;
  }
  try {
    await navigator.clipboard.writeText(link.url);
    setStatus(t("shareCopied"), "ok");
  } catch {
    // Clipboard permission, or an insecure context. Falling back to a prompt is
    // ugly and it is also the only thing that still works there.
    await askText(t("shareCopyManually"), link.url);
  }
}

/**
 * What the shell's native "may Ksav save here?" dialog says.
 *
 * Here rather than in `files.ts` because this is where the writer's language is
 * known — `files.ts` reads and writes files and has never held a word of either
 * language. See `files.ConfirmWords`.
 */
function confirmWriteWords(): files.ConfirmWords {
  return {
    title: t("confirmWriteTitle"),
    message: t("confirmWriteMessage"),
    ok: t("confirmWriteOk"),
    cancel: t("cancel"),
  };
}

async function saveFileAs() {
  closeMenus();
  const text = await fileText();
  const binding = await files.saveAs(runtime.currentDoc.title || "document", text);
  if (!binding) return;
  runtime.setCurrentBinding(binding);
  await docs.setFileName(runtime.currentDoc.id, binding.name);
  await files.rememberBinding(runtime.currentDoc.id, binding);
  save.markFileSaved();
  save.clearConflict();
  await watch.markInSync(runtime.currentDoc.id, binding);
  tellGirsaWhereItIs();
  updateTitleBar();
  // A Save-As binds the document to a *different* place on disk, which may be a
  // different repository or none at all.
  forgetGit();
  setStatus(
    files.canWriteBack(binding) ? tf("savedTo", binding.name) : tf("savedCopy", binding.name),
    "ok",
  );
}

/**
 * Keep the bound file up to date on its own, the way the library copy is.
 *
 * Manual-only file saving means the .ksav on disk drifts behind the document
 * every session, and the writer discovers it at the worst moment — when they
 * open the file somewhere else. Only ever writes to a binding that can actually
 * be written back to and whose permission is already granted: prompting for
 * filesystem access out of a background timer would be its own bug.
 */
const FILE_AUTOSAVE_MS = 30_000;

async function autosaveToFile() {
  const name = runtime.currentBinding?.name ?? "";
  if (await save.autosaveToFile(settings.autosaveFile !== false, fileText)) {
    setStatus(tf("autosavedTo", name), "ok");
  }
}

/**
 * A blank document, opened the way the writer asked documents to open.
 *
 * Separate from `newNamedDoc`, which is the *fallback* after closing or
 * deleting the last open document — that one has to land in the arrangement
 * that is already on screen, because an editor with no document is not a state
 * this application has and a new tab for it is a tab nobody asked for.
 */
async function newBlankDoc() {
  closeMenus();
  await flushSaves();
  const doc = await docs.createDoc(t("untitled"), "");
  await enterDoc(doc.id);
}

function newDoc() {
  voidAction("save_file", () => newBlankDoc());
}


/**
 * The keys that make a list behave like a list.
 *
 * Each one is the same registry entry the ribbon renders, so a rebind in
 * Settings changes both, and a macro that records "new item" replays the
 * operation rather than a keystroke.
 *
 * They only fire when the caret is *inside* a list and the operation applies:
 * `runStructureAction` returns false otherwise, and CodeMirror moves on to the
 * next handler. Enter at the end of a paragraph must stay Enter.
 */
/**
 * Which of the two column steps each arrow means, in this document.
 *
 * In a Hebrew table column 0 is the **rightmost**, so the left arrow moves to
 * the next column; in an English one it moves to the previous. `structure.ts`
 * holds no opinion about that — its two actions are *startward* and *endward* —
 * because the direction is a property of the document and the registry has
 * never seen one.
 *
 * Getting this the wrong way round is not a preference: it is a table that
 * navigates backwards for half the seforim in the product, and it would look
 * exactly like working software to whoever wrote it in the other language.
 */
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
  if (!actionById(id)) return false;
  inAction++;
  try {
    return runRegisteredAction(
      id,
      v,
      actionById,
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

/** Perform one structural operation, wherever the caret is. */
/**
 * Run a structural operation.
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

// ------------------------------------------------------------- destinations
//
// The one section of this panel that edits the *document's own* declarations
// rather than a `#הגדרות_*` call, because that is what a destination is: a note
// stream, declared once and read wherever a note is written.
//
// It is here rather than in the Notes chooser on purpose, and the split is the
// whole model. The chooser asks *"where should this note go?"* once, at the
// moment a note is written. This asks *"what does that place look like"* about
// a destination that already exists, with the notes already written — so
// lettering three hundred haaros א,ב,ג is one control and not three hundred
// edits, which is exactly what the eighteen commands could not offer.
//
// **The word "channel" is not on this surface.** A writer picks a place and sets
// what a place looks like; `channels.ts` is the machinery underneath, and the
// prelude's `#ערוץ` line is what gets written.

/** The destination this section is editing. */
let stylePick: NotePick = { dest: "foot", region: null };

/** A pick as one string, for a `<select>` value. */
function pickKey(pick: NotePick): string {
  return pick.region ? `region:${pick.region}` : pick.dest;
}

function pickFromKey(key: string): NotePick {
  if (key.startsWith("region:")) return { dest: "region", region: key.slice(7) };
  return { dest: key as DestinationId, region: null };
}

/**
 * Every destination this document could be setting: the five singular ones and
 * one entry per region it has.
 *
 * A region a writer named without declaring it is in the list too, because
 * naming one is not an error — it is an apparatus of its own, which is what
 * `#הערה_זרם("מקורות")` has always been — and a panel that hid it would be
 * hiding a block that is on the page.
 */
function styleDestinations(): NotePick[] {
  const doc = runtime.view ? docTextOf(runtime.view.state.doc) : "";
  const named = new Set<string>();
  for (const r of regionsIn(doc)) named.add(r.name);
  for (const c of channels.usedChannels(doc)) {
    if (!channels.destinationForChannel(c)) named.add(c);
  }
  return [
    ...DESTINATIONS.filter((d) => d.id !== "region").map(
      (d) => ({ dest: d.id, region: null }) as NotePick,
    ),
    ...[...named].map((name) => ({ dest: "region", region: name }) as NotePick),
  ];
}

/** What to call a destination on this panel: its place, or the writer's own name. */
function destinationLabel(pick: NotePick): string {
  return pick.region ?? t("dest." + pick.dest);
}

/** Rewrite one destination's declaration and put the caret on it. */
function setDestination(fields: channels.DestinationSettings) {
  if (!runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const { text, at } = channels.writeDestination(doc, stylePick, fields, docLang());
  replaceAll(text, at);
  renderStylesPanel();
}

/** Rewrite one region's declaration and put the caret on it. */
function setRegion(name: string, fields: channels.RegionSettings) {
  if (!runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const { text, at } = channels.writeRegion(doc, name, fields, docLang());
  replaceAll(text, at);
  renderStylesPanel();
}

/**
 * The region's own settings, when the destination is one.
 *
 * The rows themselves are `panelviews.regionPanel`, where a test can build them
 * and press them; this is the half that only the shell can do — reading the
 * document, and writing the edit back through the editor.
 */
function regionRows(doc: string, name: string): Node[] {
  return panelviews.regionPanel(
    { name, held: channels.regionSettingsOf(doc, name) },
    { set: (fields) => setRegion(name, fields) },
  );
}

function destinationRows(): Node[] {
  const doc = runtime.view ? docTextOf(runtime.view.state.doc) : "";
  const list = styleDestinations();
  // A region the document has since lost is a stale answer, and showing its
  // settings would be the panel describing a document that is not there.
  if (!list.some((p) => samePick(p, stylePick))) stylePick = { dest: "foot", region: null };

  const rows: Node[] = [
    styleRow(
      t("destPick"),
      selectControl(
        list.map((p) => [pickKey(p), destinationLabel(p)] as [string, string]),
        pickKey(stylePick),
        (v) => {
          stylePick = pickFromKey(v);
          renderStylesPanel();
        },
      ),
    ),
  ];

  // What is wrong with this destination against this document, in the same words
  // the chooser uses. A writer who reaches the settings without going through the
  // chooser gets the same sentence — one answer to "what does this cost", not two.
  for (const c of caveatsFor(doc, stylePick)) {
    rows.push(el("p", { class: "styles-note" }, [t(c.why)]));
  }

  const held = channels.settingsOf(doc, stylePick);
  // The knobs, from the one table that pairs each with the prelude's own
  // argument name **and its label**. A row per knob and no second list: a knob
  // that exists in the model and not on this panel is not expressible, which is
  // stronger than a test looking for the table's name in this file — a check
  // that reads source as text passes on a mention of the thing it wants.
  for (const knob of channels.DESTINATION_KNOBS) {
    rows.push(
      styleRow(
        t(knob.label),
        textControl(
          held[knob.key] ?? "",
          (v) => setDestination({ [knob.key]: v.trim() || null }),
          knob.hint,
        ),
      ),
    );
  }

  // The place on the page, when the destination has one. A region is the only
  // destination that is a place rather than only a stream, so this is the only
  // one that has a second half.
  if (stylePick.dest === "region" && stylePick.region) {
    rows.push(...regionRows(doc, stylePick.region));
  }

  // What this destination *is*, said plainly: the same three kinds `_ch_kind`
  // answers, because a writer should not have to hold the rules in their head to
  // know whether the block they have just described grows with its notes.
  const name = channels.destinationChannelName(stylePick);
  const kind = channels.channelsIn(doc).find((c) => c.name === name)?.kind;
  if (kind) rows.push(el("p", { class: "styles-note" }, [t("channelKind." + kind)]));

  rows.push(
    styleRow(
      "",
      el("span", { class: "chan-actions" }, [
        el(
          "button",
          {
            class: "note-use",
            onClick: () => insertSnippet(channels.pickLine(stylePick, docLang())),
          },
          ["+ " + t("channelInsertNote")],
        ),
        // A collected destination prints nowhere until its block is shown. This
        // is the "collected and then never rendered" failure that every one of
        // the eighteen commands could produce, offered as a button instead of as
        // a lint after the fact.
        //
        // Filed at the **end of the document**, through the same rule the lint's
        // own repair uses. Splicing it at the caret is what this button did
        // first, and a call renders what was written before it — so on a
        // document whose caret is on line one it rendered nothing and left the
        // warning standing, which is the button producing the defect it exists
        // to cure.
        ...(kind === "collected" && name && !regionShown(doc, name)
          ? [
              el(
                "button",
                {
                  class: "note-use",
                  onClick: () => {
                    if (!runtime.view) return;
                    const filed = apparatus.fileAtEnd(
                      docTextOf(runtime.view.state.doc),
                      channels.showRegionLine(name, docLang()),
                    );
                    replaceAll(filed.text, filed.caret);
                  },
                },
                ["+ " + t("channelInsertDump")],
              ),
            ]
          : []),
      ]),
    ),
  );
  return rows;
}

// ---------------------------------------------------------------- a small form modal
//
// Two features below (section page setup, formulas) need the same thing: a few
// fields, then insert. `prompt()` can ask for one string and nothing more, and a
// second bespoke overlay for each would be two copies of the same fifty lines.

let modalOk: (() => void) | null = null;

function openModal(
  title: string,
  lede: string,
  rows: (Node | string)[],
  onOk: () => void,
  // What the button says. It said *Insert* for every caller, which was true of
  // the two there were and false the moment a form *created* something.
  okLabel = t("insertAction"),
) {
  modalOk = onOk;
  const box = document.getElementById("form-modal-body")!;
  box.replaceChildren(
    panelHead("form-modal", { text: title }),
    el("p", { class: "styles-lede" }, [lede]),
    ...rows,
    el("div", { class: "modal-actions" }, [
      el("button", { class: "note-use", onClick: () => { const f = modalOk; closeModal(); f?.(); } }, [
        okLabel,
      ]),
      el("button", { class: "sc-key", onClick: closeModal }, [t("cancel")]),
    ]),
  );
  openPanel("form-modal");
}

function closeModal() {
  closePanel("form-modal");
}

// A dismissal from *outside* the buttons — Escape, the backdrop, the ×. Held so
// the promise a pending `ask`/`askText` handed out still settles (to "no")
// when the writer leaves by one of those routes rather than by clicking a
// button. Cleared the moment either resolves, so a stale one never fires.
let modalDismiss: (() => void) | null = null;

/**
 * A confirmation, without freezing the renderer.
 *
 * The replacement for `window.confirm`, which blocks the whole renderer process
 * — timers stop, a compile result cannot be applied, the caret stops blinking —
 * and, on the desktop webviews, is not reliably implemented at all. This is the
 * app's own modal (`form-modal`, which already owns focus, a backdrop and the
 * Escape sweep through `panels.ts`), returning a promise instead. Escape, the
 * backdrop and the × all resolve to `false`.
 */
function ask(message: string, opts: { title?: string; okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      modalDismiss = null;
      closeModal();
      resolve(v);
    };
    modalDismiss = () => done(false);
    const okBtn = el(
      "button",
      { class: opts.danger ? "note-use danger" : "note-use", onClick: () => done(true) },
      [opts.okLabel ?? t("ok")],
    );
    const box = document.getElementById("form-modal-body")!;
    box.replaceChildren(
      panelHead("form-modal", { text: opts.title ?? t("confirmTitle") }),
      el("p", { class: "styles-lede" }, [message]),
      el("div", { class: "modal-actions" }, [
        okBtn,
        el("button", { class: "sc-key", onClick: () => done(false) }, [t("cancel")]),
      ]),
    );
    openPanel("form-modal");
    okBtn.focus();
  });
}

/**
 * What to do with a whole document Girsa handed over.
 *
 * Three buttons, because there were always three outcomes and the modal had two
 * buttons. The old prompt asked *replace what is open?* and, on **No**, spliced
 * the entire handed-over document into the middle of the sefer at the caret —
 * which is a real and useful thing to want, and is not what No means anywhere
 * else in this application or in any other.
 *
 * Dismissing — Escape, the backdrop, the × — discards, because a reader who
 * leaves without choosing has not asked for their document to be edited. The
 * source is not lost by discarding it: the engine holds an arrival until the
 * poll that carries its id back, and `takeArrivals` acknowledges a discard
 * deliberately, so *discard* means discard rather than *ask me again in a
 * second*.
 */
function askArrival(display: string): Promise<"replace" | "insert" | "discard"> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: "replace" | "insert" | "discard") => {
      if (settled) return;
      settled = true;
      modalDismiss = null;
      closeModal();
      resolve(v);
    };
    modalDismiss = () => done("discard");
    const replaceBtn = el(
      "button",
      { class: "note-use", onClick: () => done("replace") },
      [t("arrivalReplace")],
    );
    const box = document.getElementById("form-modal-body")!;
    box.replaceChildren(
      panelHead("form-modal", { text: t("confirmTitle") }),
      el("p", { class: "styles-lede" }, [tf("documentArrived", display)]),
      el("div", { class: "modal-actions" }, [
        replaceBtn,
        el("button", { class: "sc-key", onClick: () => done("insert") }, [t("arrivalInsert")]),
        el("button", { class: "sc-key", onClick: () => done("discard") }, [t("arrivalDiscard")]),
      ]),
    );
    openPanel("form-modal");
    replaceBtn.focus();
  });
}

/**
 * Ask for one line of text, without freezing the renderer — the replacement for
 * `window.prompt`. Resolves to the string on OK or Enter, and to `null` on any
 * dismissal, which is exactly `prompt`'s cancel contract.
 */
function askText(
  message: string,
  initial = "",
  opts: { title?: string; okLabel?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      modalDismiss = null;
      closeModal();
      resolve(v);
    };
    modalDismiss = () => done(null);
    const input = el("input", { class: "set-input", type: "text" }) as HTMLInputElement;
    input.value = initial;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        done(input.value);
      }
    });
    const box = document.getElementById("form-modal-body")!;
    box.replaceChildren(
      panelHead("form-modal", { text: opts.title ?? t("confirmTitle") }),
      el("p", { class: "styles-lede" }, [message]),
      el("div", { class: "set-row" }, [input]),
      el("div", { class: "modal-actions" }, [
        el("button", { class: "note-use", onClick: () => done(input.value) }, [opts.okLabel ?? t("ok")]),
        el("button", { class: "sc-key", onClick: () => done(null) }, [t("cancel")]),
      ]),
    );
    openPanel("form-modal");
    input.focus();
    input.select();
  });
}

// ---------------------------------------------------------------- review
//
// Tracked changes and editorial comments — the one thing anyone editing someone
// else's kisvei yad cannot do without. The marks are ordinary commands in the
// document (see review.ts); this is the panel that walks them and takes the
// decisions, plus the three buttons that make a mark in the first place.

/** Wrap the selection in a review mark. */
function markReview(kind: "insert" | "delete") {
  const cmd = kind === "insert" ? "הוספה" : "מחיקה";
  const by = settings.reviewer?.trim();
  if (insertSnippet(by ? `#${cmd}(מאת: ${typstString(by)})[|]` : `#${cmd}[|]`)) scheduleCompile();
  if (isReviewOpen()) renderReviewPanel();
}

/**
 * Comment on the selection.
 *
 * The comment goes *after* the selected text rather than around it: a comment is
 * about the text, not a change to it, so wrapping would put the reader's words
 * inside the reviewer's mark.
 */
async function addComment() {
  const text = await askText(t("commentPrompt"));
  if (!text) return;
  const by = settings.reviewer?.trim();
  const args = by ? `(מאת: ${typstString(by)})` : "";
  const at = runtime.view.state.selection.main.to;
  const call = `#הערת_עורך${args}[${typstContent(text)}]`;
  runtime.view.dispatch({ changes: { from: at, to: at, insert: call }, selection: { anchor: at + call.length } });
  runtime.view.focus();
  scheduleCompile();
  if (isReviewOpen()) renderReviewPanel();
}

function isReviewOpen(): boolean {
  return isPanelOpen("review-panel");
}

function openReview() {
  closeMenus();
  openPanel("review-panel");
}

/** Replace the whole document text (a decision rewrites the source). */
function replaceDoc(next: string) {
  const doc = docTextOf(runtime.view.state.doc);
  if (next === doc) return;
  editDoc(next);
  scheduleCompile();
  renderReviewPanel();
}

function decideMark(mark: review.ReviewMark, decision: review.Decision) {
  replaceDoc(review.decide(docTextOf(runtime.view.state.doc), mark, decision));
}

async function decideEverything(decision: review.Decision) {
  if (!(await ask(t(decision === "accept" ? "confirmAcceptAll" : "confirmRejectAll")))) return;
  replaceDoc(review.decideAll(docTextOf(runtime.view.state.doc), decision));
}

/** Which review runtime.view the document currently reads in. */
function reviewView(): review.ReviewView {
  const raw = styles.findStyleCall(docTextOf(runtime.view.state.doc), "review")?.args.get("תצוגה");
  return review.viewFromValue(styles.readString(raw));
}

function setReviewView(v: review.ReviewView) {
  const doc = docTextOf(runtime.view.state.doc);
  // The markup runtime.view is the default, so it is written as *no* command at all
  // rather than as a redundant one sitting at the top of every reviewed file.
  const next = styles.setStyleArgs(doc, "review", {
    "תצוגה": v === "markup" ? null : styles.typstString(review.VIEW_VALUE[v]),
  });
  replaceDoc(next);
}

function renderReviewPanel() {
  const box = document.getElementById("review-body");
  if (!box || !runtime.view) return;
  box.replaceChildren(
    ...panelviews.reviewPanel(
      {
        marks: review.scanMarks(docTextOf(runtime.view.state.doc)),
        reading: reviewView(),
        reviewer: settings.reviewer ?? "",
      },
      {
        setReading: setReviewView,
        mark: markReview,
        comment: addComment,
        setReviewer: (name) => {
          settings.reviewer = name;
          saveSettings();
        },
        goTo: (m) => jumpTo(m.from),
        decide: decideMark,
        decideAll: decideEverything,
      },
    ),
  );
}

// ---------------------------------------------------------------- section page setup
//
// Header, footer, columns, margins, orientation, numbering, a border and a
// watermark — for one section rather than the whole document. Writing
// `#מקטע_עמוד(…)` by hand means knowing eight argument names; this asks.

function openSectionSetup() {
  closeMenus();
  const cols = numberField("1", 1, 4);
  const landscape = checkField();
  const margin = numberField("", 0.5, 8, 0.5);
  margin.placeholder = "—";
  const header = textField();
  const footer = textField();
  const border = checkField();
  const watermark = textField();
  const numbering = el(
    "select",
    {},
    [["", "num.keep"], ["1", "num.arabic"], ["א", "num.hebrew"], ["i", "num.roman"]].map(([v, k]) =>
      el("option", { value: v }, [t(k)]),
    ),
  ) as HTMLSelectElement;

  openModal(t("sectionSetupTitle"), t("sectionSetupLede"), [
    fieldRow(t("secColumns"), cols),
    fieldRow(t("secLandscape"), landscape),
    fieldRow(t("secMargin"), margin),
    fieldRow(t("secHeader"), header),
    fieldRow(t("secFooter"), footer),
    fieldRow(t("secNumbering"), numbering),
    fieldRow(t("secBorder"), border),
    fieldRow(t("secWatermark"), watermark),
  ], () => {
    const q = typstString;
    const args: string[] = [];
    if (Number(cols.value) > 1) args.push(`טורים: ${Number(cols.value)}`);
    if (landscape.checked) args.push("לרוחב: true");
    if (margin.value.trim()) args.push(`שוליים: ${parseFloat(margin.value)}cm`);
    if (header.value.trim()) args.push(`כותרת_עליונה: ${q(header.value.trim())}`);
    if (footer.value.trim()) args.push(`כותרת_תחתונה: ${q(footer.value.trim())}`);
    if (numbering.value) args.push(`מספור: ${q(numbering.value)}`);
    if (border.checked) args.push("מסגרת: true");
    if (watermark.value.trim()) args.push(`סימן_מים: ${q(watermark.value.trim())}`);
    if (insertSnippet(`#מקטע_עמוד(${args.join(", ")})[\n|\n]`)) scheduleCompile();
  });
}

// ---------------------------------------------------------------- formulas
//
// Typst's own maths notation, which is compact and readable but which nobody
// knows on their first day. The buttons write the constructs; the box is plain
// text, so anyone who does know the notation can simply type.

const MATH_BITS: [string, string][] = [
  ["a/b", "(a)/(b)"],
  ["xⁿ", "^( )"],
  ["xₙ", "_( )"],
  ["√", "sqrt( )"],
  ["∑", "sum_(i=1)^n "],
  ["∏", "product_(i=1)^n "],
  ["∫", "integral_a^b "],
  ["≤", " <= "],
  ["≥", " >= "],
  ["≠", " != "],
  ["±", " plus.minus "],
  ["→", " arrow.r "],
  ["∞", "infinity"],
  ["α", "alpha"],
  ["π", "pi"],
  ["( )", "lr(( ))"],
  ["מטריצה", "mat(1, 2; 3, 4)"],
  ["מקרים", "cases(a &\"if\" x > 0, b &\"else\")"],
];

function openFormula() {
  closeMenus();
  const src = el("textarea", { class: "set-textarea", rows: 3, placeholder: "x^2 + y^2 = z^2" }, [
  ]) as HTMLTextAreaElement;
  const display = checkField(true);
  const numbered = checkField();

  const insertAt = (snippet: string) => {
    const s = src.selectionStart ?? src.value.length;
    const e = src.selectionEnd ?? s;
    src.value = src.value.slice(0, s) + snippet + src.value.slice(e);
    src.focus();
    src.setSelectionRange(s + snippet.length, s + snippet.length);
  };

  openModal(t("formulaTitle"), t("formulaLede"), [
    src,
    el(
      "div",
      { class: "math-bits" },
      MATH_BITS.map(([label, snip]) =>
        el("button", { class: "math-bit", title: snip, onClick: () => insertAt(snip) }, [label]),
      ),
    ),
    fieldRow(t("formulaDisplay"), display),
    fieldRow(t("formulaNumbered"), numbered),
  ], () => {
    const body = src.value.trim();
    if (!body) return;
    const q = typstString(body);
    insertSnippet(
      display.checked
        ? `#נוסחה(${q}${numbered.checked ? ", ממוספרת: true" : ""})`
        : `#נוסחה_בשורה(${q})`,
    );
    scheduleCompile();
  });
}

// ---------------------------------------------------------------- notes chooser
//
// One pick: where should the note print. `channels.ts` holds the six
// destinations and what each writes; `panelviews.notesPanel` asks the question;
// this connects the two and performs the answer.

function openNotesChooser() {
  closeMenus();
  openPanel("notes-chooser");
}

function closeNotesChooser() {
  closePanel("notes-chooser");
}

/**
 * Where the prose of a new note is written in the *file*.
 *
 * A separate question from where it prints, and deliberately not asked in the
 * chooser: the page is byte-identical whichever answer it gets, so it is a
 * preference about reading the source and it lives with the other document
 * preferences. See `deferred.BODY_HOMES`.
 *
 * Persisted, not session-scoped: somebody who writes their note bodies at the
 * end of the file writes *every* note that way, and having to re-answer after
 * each reload is how an answer stops being believed.
 */
function bodyHome(): BodyHome {
  const held = settings.noteBodyHome;
  if (held && (BODY_HOMES as readonly string[]).includes(held)) return held as BodyHome;
  // The old boolean, still honoured. `deferNoteBodies` was this preference when
  // it had two answers, and a writer who set it does not have to set it again.
  return settings.deferNoteBodies === true ? "file" : "inline";
}

/**
 * Where *this* note's prose goes — the per-destination override, falling back to
 * the document-wide answer.
 *
 * This is what lets footnotes stay in the sentence while the haaros at the back
 * collect into a block at the end of the source: each kind reads the way the
 * writer thinks of it.
 */
function bodyHomeFor(pick: NotePick): BodyHome {
  const per = settings.noteBodyPlacement?.[pick.dest];
  if (per && (BODY_HOMES as readonly string[]).includes(per)) return per as BodyHome;
  return bodyHome();
}

/**
 * Write a note into the document. The only place that does.
 *
 * Reached from the chooser, from `insertSnippet` (and therefore from the
 * toolbar, the palette, the Insert menu and every key binding), and from the
 * right-click menu on an existing note. One producer means the scaffolding and
 * the source-position preference cannot be honoured in one surface and forgotten
 * in three — which is exactly what happened, and what `channels.test.mjs` and
 * `notecommands.test.mjs` now hold between them.
 */
function applyNotePick(
  pick: NotePick,
  sel: { to?: number; text?: string; marker?: string } = {},
  preset: string | null = null,
) {
  const from = runtime.view.state.selection.main.from;
  const home = bodyHomeFor(pick);
  const { text, caret, errand } = applyPick(
    docTextOf(runtime.view.state.doc),
    from,
    pick,
    defersBody(home),
    sel,
    dirLang(),
    // The filing has to know about the blocks, or the option is true only until
    // the writer adds a note. See `neighbours` in `deferred.ts`.
    settings.deferGrouped === true,
    preset ? presetOf(preset) : null,
    home,
  );
  editDoc(text, caret);
  // A body filed in a companion document. `applyPick` is one string in and one
  // string out by design, so it hands the write back rather than reaching into
  // the library itself — and this is the only place that runs it.
  if (errand) void runErrand(errand);
  scheduleCompile();
  // The caret lands inside the note's brackets, but a note reached from the
  // toolbar (†) or the chooser modal leaves focus on the button that was
  // clicked, so the writer's next keystroke goes nowhere until they click back
  // in. Return the focus to where the caret already is.
  runtime.view.focus();
}

/**
 * Append a note body to the document it was filed in, making that document if
 * the sefer has not got one yet.
 *
 * The fourth of thing one's homes, and the half that could not live in
 * `deferred.ts`: writing into another document is a library operation and that
 * module is pure. The marker and the `#כלול` line went into this file already;
 * this is the prose arriving where the line points.
 *
 * Reported either way. A body that quietly failed to be written is the marker
 * with no note behind it that this whole home was held back to avoid.
 */
async function runErrand(errand: Errand): Promise<void> {
  try {
    const found = docs.library().find((e) => e.title === errand.file);
    if (found) {
      const doc = await docs.getDoc(found.id);
      if (!doc) throw new Error("the companion is in the index and not in the store");
      const body = doc.body.replace(/\s*$/u, "") + "\n" + errand.entry + "\n";
      await docs.putDoc({ ...doc, body });
    } else {
      await docs.createDoc(errand.file, errand.entry + "\n");
    }
    setStatus(tf("noteBodyFiledIn", errand.file), "ok");
  } catch (e) {
    setStatus(tf("noteBodyNotFiled", errand.file, String(e)), "warn");
  }
}

/**
 * A real page, set from the writer's own text, in place of an ASCII sketch.
 *
 * Four rows of `▤` cannot say whether the block lands at the foot of the page or
 * where the prose happens to stop — which is precisely the distinction the
 * writer is being asked to make. So the pick compiles: the opening of the
 * document in hand, with two notes sent to that destination, and the first page
 * shown at thumbnail size. Only the picked one, because six compiles to open a
 * modal is not a preview, it is a stall.
 */
async function fillNotePreview(host: HTMLElement, pick: NotePick) {
  const backend = runtime.backend;
  if (!backend) return;
  // The writer's own words, with the markup taken out. Slicing raw source at 700
  // characters lands in the middle of a bracket about as often as not, and a
  // preview that silently never appears because the excerpt would not compile is
  // worse than an honest sketch. So: strip the commands, keep the prose.
  const own = plainText(docTextOf(runtime.view.state.doc)).slice(0, 700);
  const filler = Array.from({ length: 18 }, (_, i) => t("notePreviewLine") + " " + (i + 1)).join(
    "\n\n",
  );
  const base = own.length > 120 ? own : filler;
  let src = base;
  // Two notes, back to front so that an earlier insertion cannot move a later
  // one's offset — enough to show the block growing rather than a single entry.
  const bodies = [t("notePreviewNoteA"), t("notePreviewNoteB")];
  for (let i = bodies.length - 1; i >= 0; i--) {
    const at = Math.floor((base.length * (i + 1)) / (bodies.length + 1));
    const r = applyPick(src, at, pick, false, {}, dirLang(), false, presetOf(notesPreset ?? ""));
    src = r.text.slice(0, r.caret) + bodies[i] + r.text.slice(r.caret);
  }
  const res = await backend.compile(src, { ...docConfig(), paper: "a5" }).catch(() => null);
  const svg = res?.pages_svg?.[0];
  if (!svg) return;
  // Through the allow-list, not `innerHTML`: this panel renders engine output in
  // the serve origin, and a string assigned to `innerHTML` is parsed as markup
  // there. See `svgsafe.ts` — and the measurement in it, which is why this is
  // hardening rather than the close of a live hole.
  setSafeSvg(host, svg);
  host.classList.add("ready");
}

/**
 * The pick in hand, held here because the panel is redrawn whole.
 *
 * One object and not two answers, because there is one question now: a
 * destination, and for one of the six the region under it. `pickAfterDestination`
 * decides what a change of destination does to the region, so the panel and the
 * state cannot disagree about it.
 */
let notesPick: NotePick = { dest: "foot", region: null };
/** The preset the pick came from, until the writer takes it apart. */
let notesPreset: string | null = null;

/** The presets whose pick this is — a preset is a value, so this is equality. */
function presetForPick(pick: NotePick): string | null {
  return PRESETS.find((p) => samePick(p.pick, pick))?.id ?? null;
}

function renderNotesChooser() {
  const box = document.getElementById("notes-chooser-body")!;
  const doc = docTextOf(runtime.view.state.doc);
  const regions = regionsIn(doc).map((r) => r.name);
  // A pick naming a region the document has since lost is a stale answer, and
  // showing it would be the panel describing a document that is not there.
  if (notesPick.dest === "region" && notesPick.region && !regions.includes(notesPick.region)) {
    notesPick = panelviews.pickAfterDestination("region", regions, null);
    notesPreset = presetForPick(notesPick);
  }
  box.replaceChildren(
    ...panelviews.notesPanel(
      {
        pick: notesPick,
        regions,
        caveats: caveatsFor(doc, notesPick),
        preset: notesPreset,
      },
      {
        pick: (pick) => {
          notesPick = pick;
          // Taking a preset apart stops it being that preset — which is the
          // whole property decision 11 asks for, said in one line.
          notesPreset = presetForPick(pick);
          renderNotesChooser();
        },
        usePreset: (id) => {
          const p = presetOf(id);
          if (!p) return;
          notesPick = { ...p.pick };
          notesPreset = id;
          renderNotesChooser();
        },
        use: () => {
          applyNotePick(notesPick, {}, notesPreset);
          closeNotesChooser();
        },
        preview: (host, pick) => void fillNotePreview(host, pick),
      },
    ),
  );
  // Per-region heights, under the chooser: one row per declared region, each
  // writing its גובה back into the declaration itself — the same real edit
  // dragging the strip would make, and absent stays absent (the engine
  // decides).
  const declared = regionsIn(doc);
  if (declared.length > 0) {
    const rows = declared.map((d) => {
      const input = el("input", {
        type: "text",
        value: d.args["גובה"] ?? "",
        onchange: () => {
          const v = (input as HTMLInputElement).value.trim();
          const next = setDeclaredArgs(docTextOf(runtime.view.state.doc), d, {
            "גובה": v === "" ? null : v,
          });
          if (next === doc) return;
          editDoc(next);
          scheduleCompile();
        },
      });
      return el("label", { class: "set-row" }, [el("span", {}, [d.name]), input]);
    });
    box.append(
      el("h3", { style: "margin-top:14px" }, [t("regionHeightsTitle")]),
      el("div", { class: "set-note" }, [t("regionHeightsNote")]),
      ...rows,
    );
  }

  // The answer, brought to where the question was asked.
  //
  // Measured in the assembled run, which is the only place a viewport exists: at
  // 1280×720 the picked card and the button that writes it landed at y=835 —
  // below the bottom of the screen — so a writer who had just answered was
  // looking at the space where their answer was not. The run clicked it anyway,
  // because a driver scrolls and a person does not know there is anything to
  // scroll to.
  //
  // `nearest` rather than `center`: a card that is already on screen must not
  // jump, and the bottom edge is the one that carries the button.
  box.querySelector<HTMLElement>("[data-note-card]")?.scrollIntoView?.({ block: "nearest" });
}

// ---------------------------------------------------------------- assets
//
// An image belongs to the document, not to a path on someone's disk: the engine
// has no file system, so the bytes travel with every compile request. Attaching
// one therefore means storing it on the document and referring to it by name.

/**
 * Refuse enormous attachments.
 *
 * The old ceiling was 4 MB, which base64 turns into 5.3 MB — larger than the
 * entire ~4.5 MB localStorage quota it existed to protect. A guard set above the
 * limit it guards is not a guard. Documents live in IndexedDB now, which is
 * measured in hundreds of megabytes, so the real constraints are different ones:
 * every asset is re-sent on every compile, and every asset is carried inside the
 * .ksav file. 8 MB is generous for a scan or a font and still keeps a compile
 * request something a browser can hand across in one piece.
 */
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/**
 * Refuse an attachment that would not fit, *before* reading it.
 *
 * `navigator.storage.estimate()` is advisory and absent in some browsers, so a
 * `null` answer means "go ahead and find out" rather than "refuse" — but when it
 * does answer, telling the writer now beats failing after the read.
 */
async function roomFor(bytes: number): Promise<boolean> {
  const e = await store.estimate();
  if (!e) return true;
  // base64 costs a third on top, and the store wants headroom to work in.
  const needed = Math.ceil(bytes * 1.4);
  return e.usage + needed < e.quota;
}

async function attachAsset(f: File, kind: DocAsset["kind"]): Promise<string | null> {
  if (f.size > MAX_ASSET_BYTES) {
    setStatus(tf("assetTooBig", humanSize(f.size), humanSize(MAX_ASSET_BYTES)), "err");
    return null;
  }
  if (!(await roomFor(f.size))) {
    setStatus(t("storageFull"), "err");
    return null;
  }
  const name = docs.uniqueAssetName(runtime.currentDoc.assets, f.name);
  const added: DocAsset = { name, data: await readAsDataUrl(f), kind };
  runtime.currentDoc.assets.push(added);
  try {
    await docs.putDoc(runtime.currentDoc);
  } catch (e) {
    // Take the attachment back out rather than leaving the in-memory document
    // referring to bytes that were never stored.
    runtime.currentDoc.assets = runtime.currentDoc.assets.filter((a) => a !== added);
    reportSaveFailure(e);
    return null;
  }
  // The bound file has changed too, and only `insertImage` used to say so.
  //
  // It says it by accident: it attaches and then inserts `#תמונה(…)`, which is a
  // document edit and therefore schedules a save and marks the file dirty.
  // `addFont` attaches and inserts **nothing** — the writer types the family
  // name into the font box themselves, which is documented and correct — so the
  // font was written to the library copy (`putDoc` above) and never to the bound
  // `.ksav` on disk. Send that file to somebody and the font is not in it,
  // silently, with the document still referring to it by family name.
  //
  // Here rather than in `addFont`, because attaching is the fact: whatever the
  // caller does next, this document's bytes are not the file's bytes any more.
  save.markFileDirty();
  return name;
}

async function insertImage() {
  closeMenus();
  const f = await pickFile("image/*");
  if (!f) return;
  const name = await attachAsset(f, "image");
  if (!name) return;
  if (insertSnippet(`#תמונה("${name}", רוחב: 60%)`)) scheduleCompile();
}

async function addFont() {
  const f = await pickFile(".ttf,.otf,.ttc,font/*");
  if (!f) return;
  const name = await attachAsset(f, "font");
  if (!name) return;
  // The document must ask for the font by its FAMILY name, which lives inside
  // the file and which we cannot read here — so say what happened and let the
  // writer type the family into the font box.
  setStatus(`${name} ✓`, "ok");
  scheduleCompile();
  rerenderChrome();
}

async function removeAsset(name: string) {
  runtime.currentDoc.assets = runtime.currentDoc.assets.filter((a) => a.name !== name);
  await saveNow();
  // And reclaim the blob, which nothing did.
  //
  // `collectAssets()` — the sweep that drops unreferenced blobs — had exactly
  // one caller, `deleteDoc`. Removing an asset wrote a document record with one
  // fewer hash in it and left the bytes in the `ASSETS` store forever. A writer
  // who attaches a scan, changes their mind, attaches another, and repeats
  // accumulated every rejected 8 MB image in IndexedDB with nothing that would
  // ever free it; the store's own quota banner is what they eventually met.
  //
  // Safe to call at any time by construction: it sweeps rather than
  // reference-counts, which is precisely so that this is true. Awaited but not
  // fatal — a sweep that fails costs space, and the removal itself has already
  // been written.
  try {
    await docs.collectAssets();
  } catch {
    /* the asset is off the document either way; the bytes can be swept later */
  }
  scheduleCompile();
  rerenderChrome();
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
  if (typingIntoSomething(e.target)) return false;
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

// First-run welcome: shown once, offers a template or a blank start.
//
// Two things were wrong here and both were on the reader's very first screen.
//
// The template list was `.slice(0, 6)`. `templatesForMenu` sorts the interface's
// own language first, so in a Hebrew interface those six were all Hebrew and the
// four cut were `letter-en`, `article-en`, `kesubah` and `get` — an English
// writer's first screen, in a program whose README opens *"it works equally for
// left-to-right English documents"*, offered six Hebrew templates and no way to
// see there were others. All ten now show, in two labelled groups with the
// interface's language first, so the other language is visibly present rather
// than cut off the end of a list nobody knew was a list.
//
// And the button labelled *"start blank"* only closed the overlay. It set the
// onboarded flag and removed the dialog and never touched the document, so the
// reader's first act in the program was a button that lied: 323 characters of
// welcome document before the click and 323 after. The template buttons two lines
// up had always done `loadTemplate(tpl); dismissOnboard()`; this one was missing
// its half of that pair.
function maybeOnboard() {
  if (localStorage.getItem("ksav.onboarded")) return;
  const lang = getLang();
  const all = templatesForMenu();
  const groups = [lang, lang === "he" ? "en" : "he"]
    .map((l) => ({ lang: l, items: all.filter((tpl) => tpl.lang === l) }))
    .filter((g) => g.items.length);
  // A template whose `lang` is neither is still a template; it goes in a last
  // group rather than off the screen.
  const rest = all.filter((tpl) => tpl.lang !== "he" && tpl.lang !== "en");
  if (rest.length) groups.push({ lang: "", items: rest });

  // Built through the same two constructors as every other modal, which is what
  // gives it the × and the dismissing backdrop it shipped without. It is
  // `mounted` rather than class-toggled — there is no welcome element in the
  // document until there is a reader to welcome — and `mountPanel` is what puts
  // the `open` class on it.
  const overlay = overlayPanel("welcome", "palette-box welcome-box", [
      panelHead("welcome", "welcomeTitle"),
      panelLede("welcomeBody"),
      ...groups.flatMap((g) => [
        el("div", { class: "welcome-group" }, [g.lang ? t("lang." + g.lang) : t("templates")]),
        el(
          "div",
          { class: "welcome-templates" },
          g.items.map((tpl) =>
            el(
              "button",
              {
                class: "welcome-tpl",
                lang: tpl.lang,
                // The label is the template's name in whichever language the
                // interface is in; the id is what it *is*. The acceptance run
                // starts from `sefer` and has to find it in either.
                "data-template": tpl.id,
                onClick: () => {
                  dismissOnboard();
                  voidAction("save_file", () => loadTemplate(tpl));
                },
              },
              [lang === "he" ? tpl.he : tpl.en],
            ),
          ),
        ),
      ]),
      el(
        "button",
        {
          class: "welcome-start",
          onClick: () => {
            dismissOnboard();
            newDoc();
          },
        },
        [t("welcomeStart")],
      ),
  ]);
  mountPanel("welcome", overlay, document.getElementById("app")!);
}

/**
 * Close the welcome overlay, however the writer chose to leave it.
 *
 * The "was it actually on screen" check that used to guard this by hand is now
 * `closePanel`'s, for every surface: Escape reaches all of them and Escape is
 * pressed constantly, so marking someone onboarded because they dismissed a
 * completion popup would be a lie told by a keystroke.
 */
function dismissOnboard() {
  closePanel("welcome");
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
  wirePanel("form-modal", {
    close: () => {
      modalOk = null;
      // A pending ask()/askText() left by Escape, the scrim or the × settles to
      // its cancel value rather than hanging forever.
      const d = modalDismiss;
      modalDismiss = null;
      d?.();
    },
  });
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
  wireChrome({
    askText,
    docLang,
    insertSnippet,
    insertCommand,
    tieredNoteHere,
    linkifySelection,
    askForMekor,
    entityAct,
    insertFold,
    hideBlockHere,
    hideLineHere,
    openPalette,
    renameDoc,
    openNotesChooser,
    openSectionSetup,
    openFormula,
    insertImage,
    foldToLevel,
    foldListsToDepth,
    hiddenBreak,
    runStructureAction,
    makeListHere,
    applyCustomStyle,
    unwrapCustomStyle,
    openNewStyle,
    openStyleEditor,
    openStylesFor: openStylesFor,
    addContentsHere,
    closeOpenDoc,
    duplicateDoc,
    removeDoc,
    newNamedDoc,
    saveFileAs,
    refreshSources,
    recording: currentRecording,
    toggleRecording,
    savedMacros,
    playMacro,
    deleteMacro,
    macroName,
    refreshContextBar: updateContextBar,
    reconfigureShortcuts,
    refreshStylesPanel: () => {
      if (isPanelOpen("styles-panel")) renderStylesPanel();
    },
    dismissForeignHydra: (s) => {
      dismissForeignHydra(s);
    },
  });
  // The palette's wiring: what the rows beyond the content registry can be.
  wirePalette({
    shellActions: actions,
    macroName,
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
  // Help runs its entries through the shell's row runner.
  wireHelp({ runRow: (does) => runRow(does) });
  // The macros' modal, rebind and action door; the recorder is macros.ts's.
  wireMacros({
    actionById: (id) => actionById(id) as { id: string; run: (v: unknown) => boolean } | undefined,
    askText,
    reconfigureShortcuts,
  });
  // The hydra: a structural operation performed where the caret is.
  wireHydra({ runStructure: (action, sticky) => runStructureAction(action, sticky) });
  // The git drawer's modal and the body swap of a commit restore.
  wireGit({ ask, loadBody });
  wireCustomStyles({
    openModal: (title, lede, rows, onOk, okLabel) => openModal(title, lede, rows, onOk, okLabel),
  });
  wireStyles({
    destinationRows: () => destinationRows(),
    applySkin: (name) => applySkin(name),
    undoSkin: () => undoSkin(),
    reconfigureShortcuts,
    openStyleEditor: (name) => openStyleEditor(name),
  });
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
 * A banner for something durably wrong with the chrome, as opposed to with the
 * writer's work.
 *
 * The lighter sibling of the save-error banner: that one is red because text is
 * at risk, this one is amber because only the toolbar is. Both live in the same
 * `.notices` stack, so neither can hide the other.
 */
/**
 * A button on a notice, which must say what it does.
 *
 * `press` rather than `run`: this is a button on a banner and not an `Action`
 * from the command registry, and `chrome.test.mjs` fences `.run` to keep every
 * command going through `runAction` so the macro recorder sees it. One name for
 * two unrelated things is how that fence starts reporting the wrong offence.
 */
interface NoticeAct {
  /** An i18n **key**, or `label` for text that is not one. */
  key?: string;
  label?: string;
  press: () => void;
}

/**
 * The banner across the top, and the buttons on it.
 *
 * Every action names itself, and that is the whole change from the version
 * that took a bare callback. The label used to be `t("retrySave")` for all of
 * them, so a banner offering a document rescued from a crash, and a banner
 * announcing a new release, and a banner saying the file had changed on disk,
 * all carried one button reading "Try again" — which answers none of those
 * three questions and actively misdescribes two of them. The type is the fix:
 * an action cannot be attached without a label for it.
 */
function showChromeNotice(message: string, ...acts: NoticeAct[]) {
  document.getElementById("chrome-error")?.remove();
  const banner = el("div", { id: "chrome-error", class: "chrome-error", role: "alert" }, [
    // **A key, not the string it resolves to.** The banner used to be built with
    // `t("…")` at the moment of failure and then sat in the DOM for as long as
    // the problem lasted, so a writer who changed language kept reading a
    // notice in the language it was born in. `browserlang`'s residue fence
    // caught exactly two of these — `registriesGaveUp` and `retrySave` — and it
    // was right to: both have English values, so nothing about them is
    // legitimately Hebrew. The fix is the same one `panels.ts` already uses for
    // headings, and `hasKey` is the guard that turns "a call site passed the
    // answer where the question belonged" into a boot-time error.
    el("span", { class: "save-error-text", ...(hasKey(message) ? { "data-i18n": message } : {}) }, [
      hasKey(message) ? t(message) : message,
    ]),
    ...acts.map((a) =>
      el(
        "button",
        {
          class: "save-error-act",
          type: "button",
          onClick: a.press,
          ...(a.key ? { "data-i18n": a.key } : {}),
        },
        [a.key ? t(a.key) : (a.label ?? "")],
      ),
    ),
  ]);
  noticeHost().append(banner);
}

function clearChromeNotice() {
  document.getElementById("chrome-error")?.remove();
}

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
  // The file write-back and the Girsa inbox poll, both of which used to be bare
  // `setInterval`s that ran forever — on a backgrounded tab, a laptop on
  // battery, a build with no Girsa half — with no guard against a slow call
  // overlapping itself. See `installBackgroundTimers`.
  installBackgroundTimers();
}

/** True when this session's polls and autosave should be quiet. */
function tabHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * The two recurring background jobs, gated and guarded.
 *
 * Both suspend while the tab is hidden (the writer is not looking, and `save.ts`
 * already flushes on the way out), each holds a `busy` flag so a slow call
 * cannot pile up behind itself — the shape `watch.ts` uses — and the inbox poll
 * backs off (1 s → 5 s → 30 s) through a run of empty polls, resetting to 1 s on
 * any arrival and on focus. A hidden tab that comes back runs one catch-up tick.
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

  // Sources handed over by Girsa while this window is open (spec.md §10.6).
  let pollDelay = GIRSA_POLL_MS;
  let pollTimer = 0;
  let pollBusy = false;
  // Which chain is the live one.
  //
  // There is one `pollTimer` and `arm` overwrites it, so `wake()` can only
  // cancel the *most recent* timer — and a `runPoll` that has already fired is
  // not cancellable at all, and ends by arming itself again. So a `wake()`
  // landing while a poll was awaiting the inbox produced a second chain, and the
  // two were thereafter independent and unaware of each other. Six tab-returns
  // each landing mid-poll: seven live chains where the design has one, and
  // nothing in the loop could observe or collapse a duplicate.
  //
  // Not reproducible over loopback, where a poll finishes in about a
  // millisecond and `wake` essentially never lands inside one. The trigger is a
  // slow inbox — the desktop build, where the service goes through
  // `spawn_blocking` behind a compile, or Girsa itself being slow.
  //
  // So the epoch guards the *chain* rather than the timer: a superseded chain
  // retires at its next re-arm instead of running forever beside the new one.
  let pollEpoch = 0;
  const arm = (ms: number, epoch: number) => {
    if (epoch !== pollEpoch) return;
    pollTimer = window.setTimeout(() => void runPoll(epoch), ms);
  };
  const runPoll = async (epoch: number) => {
    if (epoch !== pollEpoch) return;
    if (tabHidden()) {
      arm(GIRSA_POLL_MAX_MS, epoch); // idle heartbeat, so a return to view is noticed soon
      return;
    }
    // A focus `wake()` can fire while a poll is already awaiting the inbox; do
    // not let a second run insert on top of the first.
    if (pollBusy) {
      arm(pollDelay, epoch);
      return;
    }
    pollBusy = true;
    let arrived = false;
    try {
      arrived = await takeArrivals();
    } catch {
      // A poll that throws is the same as an empty one; do not stop the loop.
    } finally {
      pollBusy = false;
    }
    // Back off while nothing is arriving; snap back to the floor the moment
    // something does, so a handover is still felt within a second.
    pollDelay = arrived ? GIRSA_POLL_MS : pollDelay <= GIRSA_POLL_MS ? 5_000 : GIRSA_POLL_MAX_MS;
    arm(pollDelay, epoch);
  };
  const wake = () => {
    pollDelay = GIRSA_POLL_MS;
    clearTimeout(pollTimer);
    pollEpoch++;
    arm(0, pollEpoch);
  };
  window.addEventListener("focus", wake);
  window.addEventListener("visibilitychange", () => {
    if (!tabHidden()) wake();
  });
  arm(pollDelay, pollEpoch);
}

/**
 * A source Girsa handed over, inserted where the cursor is.
 *
 * Polled rather than pushed, because the same code has to serve `ksav serve`
 * in a browser tab and the desktop shell — and because the cursor is the only
 * place a quote can go without landing somewhere nobody asked for.
 *
 * What arrives is already real Ksav markup: the packet is rendered in Rust by
 * `ksav_engine::source` the moment it lands, so there is no second renderer
 * here to drift from it (spec.md §10.3 — *lightweight means the UI, not the
 * format*).
 */
async function takeArrivals(): Promise<boolean> {
  // Silent when this build has no Girsa half: the inbox is polled, and a poll
  // that says "you cannot" once a second is a nuisance, not information.
  // The ids this window put in the document since it last asked. The engine
  // holds each arrival until it hears one of these back, so a poll whose answer
  // never reached the tab costs a repeat rather than the source — which is what
  // `{"taken":true}` promised Girsa. See `post.rs::drain`.
  const waiting = await sourcesOf(runtime.backend)
    ?.inbox(arrivalsTaken)
    .catch(() => []);
  // Only once the engine has answered a poll carrying them: an answer means it
  // has let go of them, and clearing them before that is the same bug one level
  // up.
  arrivalsTaken = [];
  if (!waiting || waiting.length === 0) return false;
  const took: string[] = [];
  for (const arrival of waiting) {
    if (arrival.whole) {
      // A whole document, handed over from Girsa's buffer. Never replaces
      // what is open without being asked — and a snapshot is taken first, so
      // "yes" is recoverable even when it was the wrong answer.
      // Three outcomes, and the modal used to have two buttons: replace what is
      // open, or — on **No** — splice the whole handed-over document into the
      // middle of the sefer at the caret. The comment above read *"Never
      // replaces what is open without being asked"*, which is true and is not
      // the whole of what a reader hears when they press No.
      //
      // So the third option is offered as one rather than hidden behind the
      // refusal. Insert-here is genuinely useful — it is how a chapter arrives
      // into a sefer — which is why this is a choice and not simply a No that
      // does nothing.
      const hasText = runtime.view.state.doc.length > 0;
      if (hasText) {
        const what = await askArrival(arrival.display);
        if (what === "discard") {
          took.push(arrival.id);
          continue;
        }
        if (what === "insert") {
          insertSnippet(arrival.markup);
          took.push(arrival.id);
          continue;
        }
      }
      if (hasText) await takeSnapshot();
      runtime.view.dispatch({
        changes: { from: 0, to: runtime.view.state.doc.length, insert: arrival.markup },
        selection: { anchor: 0 },
      });
      took.push(arrival.id);
      continue;
    }
    insertSnippet(arrival.markup);
    took.push(arrival.id);
  }
  arrivalsTaken = took;
  if (!took.length) return waiting.length > 0;
  const last = waiting[waiting.length - 1];
  setStatus(tf(last.whole ? "documentOpened" : "sourceArrived", last.display), "ok");
  scheduleCompile();
  return true;
}

/**
 * Ids handed to this window and not yet acknowledged to the engine.
 *
 * Carried to the next poll rather than sent immediately, because the poll is the
 * only errand there is and a second round trip to say "thank you" would be a
 * service that exists for one sentence.
 */
let arrivalsTaken: string[] = [];

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

import "./styles.css";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { Compartment, EditorSelection, EditorState, Prec, Transaction } from "@codemirror/state";
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
  outline,
} from "./ksav-lang";
import { bracketLint, healAll } from "./bracket-lint";
import { pairedDelimiters } from "./brackets";
import { apparatusLint, renderAllNotes } from "./apparatus-lint";
import { onAttachRef, sourceNoteMarks } from "./sourcenote-lint";
import { numberingMarks, renumberAll } from "./numbering-lint";
import { inSeries, outOfSequence, resequenceAt } from "./numbering";
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
import type { Mekor, Mekoros, Refreshed, Refreshing, TemplateDef } from "./api";
import type * as api from "./api";
import * as git from "./git";
import * as panelviews from "./panelviews";
import { t, tf, setLang, getLang, isRtlUi } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import * as opendocs from "./opendocs";
import * as panes from "./panes";
import * as paneplaces from "./paneplaces";
import * as tabs from "./tabs";
import type { DocAsset } from "./docs";
import {
  ACTION_COMMAND,
  BREAKS,
  BREAK_COMMAND,
  BREAK_GLYPH,
  PLACED_COMMANDS,
  actionForCommand,
} from "./actions";
import * as store from "./store";
import * as files from "./files";
import {
  applyPick,
  deleteNote,
  destinationTargets,
  markersFor,
  noteAt,
  noteDepthAt,
  noteDestination,
  notesIn,
  regionShown,
  retargetNote,
  scaffold,
  tieredNoteAt,
} from "./notes";
import { aliasesInForce, keyHint, keybindingsFrom, whoHolds } from "./bindings";
import * as sefarim from "./sefarim";
import * as spell from "./spell";
import { printedPrefix, fractionAtLine, lineAtFraction, viewportFraction, anchorFor, worthFollowing } from "./scrollmap";
import * as entity from "./entity";
import * as styles from "./styles";
import * as review from "./review";
import { typstString, typstContent } from "./typst-escape";
import { citationMarkup } from "./citation";
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
import * as marks from "./marks";
import * as menus from "./menus";
import { marksIn } from "./marks";
import * as channels from "./channels";
import * as apparatus from "./apparatus";
import {
  changeReachesOut,
  insideSpan,
  lineWindowOf,
  narrowedTo,
  narrowing,
  setNarrow,
  spanAt,
  type Span,
} from "./narrowing";

// The modules `main.ts` was split into. What is left here is the shell: the
// editor itself, the chrome around it, the panels, and boot. Everything with a
// life of its own — the store, saving, compiling, exporting, the diagnostics
// vocabulary, the settings — now lives beside this file rather than inside it.
import {
  el,
  noticeHost,
  glyphBtn,
  iconBtn,
  tbGroup,
  fieldRow,
  textField,
  numberField,
  checkField,
  pickFile,
  readAsDataUrl,
  humanSize,
} from "./dom";
import * as runtime from "./runtime";
import { setStatus, closeMenus, jumpTo } from "./runtime";
import {
  openPanel,
  closePanel,
  togglePanel,
  isPanelOpen,
  mountPanel,
  wirePanel,
  closeOnEscape,
  closeOnOutsideClick,
  toggleMenu,
  panelHead,
  overlayPanel,
  localise,
  rebuildOpenPanels,
} from "./panels";
import { BUNDLED_NOTICES, COMMAND_EN } from "./engine.gen";
import { bodyAt, docTextOf, plainText, scanDoc } from "./spans";
import { minimalChange } from "./diff";
import {
  settings,
  saveSettings,
  BUNDLED_FONTS,
  SKINS,
  applyPreset,
  undoPreset,
  pendingUndo,
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
import * as settings_ from "./settings";
import * as save from "./save";
import { scheduleSave, saveNow, flushSaves, reportSaveFailure } from "./save";
import { scheduleCompile, runCompile, compileNow, supersedeCompiles, onStale, onAfterCompile, onSchedule, bodyOnScreen, preambleOffset } from "./compile";
import * as commands from "./commands";
import * as find from "./find";
import {
  applyPreview,
  clearPages,
  currentPages,
  currentPageText,
  drawCurrentInto,
  drawRemembered,
  forgetPages,
  hasPageLines,
  narrowPreview,
  pageBox,
  rememberPages,
  type LineWindow,
} from "./preview";
import { drawMark, isPlainClick, pageUnder, pixelInPage, pointInPage } from "./jump";
import { BIDI_MARKS, bidiSupport, toggleIsolate, visibleBidiMarks } from "./bidi";
import { changeGutter, changeHighlight, changes, nameMarks, setBaseline } from "./changes";
import { focusCompartment, focusExtension, paragraphAt } from "./focus";
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
import { forgetDismissed, lineInDocument, onGoToLine, onGoToPart, onMarkLines } from "./diagview";
import { nikudKeymap, buildNikudBar } from "./nikud";
import * as exports from "./exports";
import * as zoom from "./zoom";
import * as pagerange from "./pagerange";
import * as fonts from "./fonts";
import { troubleSaid } from "./diagnostics";
import { docLang as modeDocLang, insertionAt, legalAt } from "./mode";
import * as structure from "./structure";
import * as heads from "./headings";
import * as hydra from "./hydra";
import * as macros from "./macros";
import * as help from "./help";
import { plan as planInsertion } from "./insert";
import * as hiding from "./hiding";
import * as lists from "./lists";
import * as header from "./header";
import * as panelrows from "./panelrows";
import type { PanelList, PanelRow } from "./panelrows";

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
  spellDirtyFrom = Infinity;
  spellDirtyTo = -1;
  spellFullPending = true;
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
 * What the preview shows in the second before the incoming document's compile
 * lands.
 *
 * There used to be no answer to this: `openDoc` ended at `scheduleCompile`, and
 * a compile is 0.4–3 s away, so for that whole time every preview pane went on
 * showing **the sefer you just left** — under the new document's title, with the
 * new document's outline beside it, and click-to-jump measuring against pages
 * belonging to neither. A pane stating one document while the editor holds
 * another is the exact family this application is audited for.
 *
 * The three answers are the writer's to choose (`tabCompile`); what none of them
 * may do is leave the last document's pages standing.
 */
function showPagesFor(id: string) {
  // `onSwitch`: the writer has asked for nothing kept, so there is nothing to
  // draw and the empty pane is the honest report.
  if (settings.tabCompile === "onSwitch") {
    clearPages();
    return;
  }
  // Otherwise: this document's own last pages if we have them — under `idle`
  // they are a current layout, under `keep` they are as of when it was last on
  // screen — and an empty pane if we do not, which is a document being opened
  // for the first time this session.
  if (!drawRemembered(id)) clearPages();
}

/**
 * Give the preview to the document arriving, synchronously, right now.
 *
 * **Why this cannot wait for `openDoc`.** Three routes rebuild the panes before
 * the document changes — selecting a tab, closing one, and opening a sefer into
 * a new tab. `openDoc` is the one that swaps the document, and it `await`s
 * twice before it touches the preview, so between the render and those awaits
 * the pane shows **the sefer you just left, under the tab you just arrived in**.
 * Long enough for the departing document's own compile to land in it and report
 * its page count, which is how the acceptance run found this: the pane answered
 * "1 page" for a sefer that had four.
 *
 * A pane stating one document while the editor holds another is the exact
 * family this application is audited for, so the hand-over is done here, in one
 * turn, and `openDoc` is told not to do it again — doing it twice would file
 * the *arriving* document's pages under the departing one's name.
 */
function handOverPages(leaving: string | null, arriving: string) {
  if (leaving && leaving !== arriving) {
    rememberPlaces(leaving);
    rememberPages(leaving);
  }
  // Before the pages are drawn, not after: a layout of the document being left
  // is still in flight, and `runtime.currentDoc` still names it — truthfully,
  // for the few awaits it takes `openDoc` to reach the store — so nothing else
  // in the application has grounds to refuse it. It would land on the pages
  // drawn below and repaint them with the wrong sefer's.
  supersedeCompiles();
  showPagesFor(arriving);
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
            void enterDoc(entry.id);
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
  void openDoc(to);
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
  void setEditingMode(settings.editingMode);
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
  // And the file stamp, whose comment has always said this is when it happens:
  // *"Forget a document — on close, or when its binding is replaced."* Nothing
  // called it. The leak is small — one stamp per document ever opened, keyed by
  // an id that is never reused — but a comment that describes a call nobody
  // makes is the defect, not the bytes.
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

function snippetMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of (settings.snippets || "").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) {
      const k = line.slice(0, i).trim();
      if (k) map[k] = line.slice(i + 1).trim();
    }
  }
  return map;
}
const snippetTab = {
  key: "Tab",
  run: (v: EditorView) => {
    const sel = v.state.selection.main;
    if (!sel.empty) return false;
    const line = v.state.doc.lineAt(sel.head);
    const before = line.text.slice(0, sel.head - line.from);
    const m = before.match(/(\S+)$/);
    if (!m) return false;
    const map = snippetMap();
    const exp = map[m[1]];
    if (exp == null) return false;
    const from = sel.head - m[1].length;
    const raw = exp.replace(/\\n/g, "\n");
    const pipe = raw.indexOf("|");
    const text = pipe >= 0 ? raw.slice(0, pipe) + raw.slice(pipe + 1) : raw;
    const cursor = pipe >= 0 ? from + pipe : from + text.length;
    v.dispatch({ changes: { from, to: sel.head, insert: text }, selection: { anchor: cursor } });
    return true;
  },
};

// ---- configurable keyboard shortcuts ----
// Each action has an id (localized in Settings) and a runner. Keys are CM key
// strings ("Mod-b" etc.; Mod = Ctrl on Win/Linux, Cmd on macOS) and are user-
// overridable, persisted in settings.keybindings.
/**
 * Insert a registry command by name — never by a snippet typed out here.
 *
 * **The registry was the single source of truth and `ACTIONS` held a
 * hand-written second copy beside it.** They had already drifted:
 *
 *     commands.rs:89   cmd!("רשימה", …, "#רשימה(\n  פריט[|],\n  פריט[],\n)")
 *     main.ts:427      { id: "bullets", run: () => insertSnippet("#רשימה(\n  פריט[|],\n)") }
 *
 * Clicking the toolbar's • gave you a two-item list. Pressing Ctrl+Shift+8 gave
 * you a one-item list. Same operation, same product, two documents — and
 * `buildToolbar` twenty lines away was already doing it the right way
 * (`byName("הדגשה")` → `c.insert`), so both conventions lived in one file.
 *
 * The table snippet was written out three times and the three happened to agree,
 * which is luck rather than a property.
 *
 * `runtime.commandByName` was exported for exactly this and had no callers.
 *
 * The null guard is the cost the report named, and it is strictly more honest
 * than the silent fallback to a stale string it replaces: if the registry has
 * not loaded, the writer is told, rather than being given a snippet nobody has
 * checked against the engine since it was typed.
 */
function insertCommand(he: string): boolean {
  const c = runtime.commandByName(he);
  if (!c) {
    setStatus(t("registryMissing"), "warn");
    return true;
  }
  insertSnippet(c.insert);
  return true;
}

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
const LIST_DEPTHS = [1, 2, 3] as const;

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
  { id: "revealCursor", run: () => (void revealCursor(), true) },
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
  { id: "closeDoc", run: () => (void closeOpenDoc(runtime.currentDoc.id), true) },
  { id: "newTab", run: () => (newTab(), true) },
  { id: "pane.zoom", run: () => (cyclePaneZoom(), true) },
  { id: "newDocTab", run: () => (void newDocTab(), true) },
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
/**
 * The bindings, and the aliases, now live in `bindings.ts` (B31, B36).
 *
 * Out of this file for two reasons: it is the one module in `src` without a test
 * file, which the grade calls *the tell*; and `tools/card.mjs` reads them to
 * generate the shortcut card B36 asks for, so the card cannot drift from the keys.
 */
function keybindings(): Record<string, string> {
  return keybindingsFrom(settings.keybindings);
}

/**
 * The key to print beside an action — or, under a mode, the way to reach it.
 *
 * Every surface that shows a chord goes through here, and `prohibitions.test.mjs`
 * holds it that way: `readable(keybindings()…)` at a twenty-first call site
 * would print a chord that `buildShortcutKeymap` has just refused to install.
 * The rule itself is `bindings.keyHint`, where it is pure and testable; this is
 * the shell's half — which mode is on, and what this action is called in it.
 */
function hintFor(id: string, kb: Record<string, string> = keybindings()): string {
  return keyHint(kb[id] ?? "", keymodes.activeMode(), keymodes.commandName(id));
}

/** Whether what `hintFor` returns is a mode's name rather than a chord. */
function hintIsMode(): boolean {
  return keymodes.activeMode() !== "default";
}

/**
 * The `<code>` that goes beside a menu item, or an empty slot.
 *
 * The empty `<span>` is not decoration: the rows are a grid, and a missing cell
 * shifts everything after it left. It survives because an action can still be
 * deliberately unbound — under a mode there is always something to say.
 *
 * `kb` is taken rather than read, so the callers that hoist it out of a loop go
 * on hoisting it: `keybindings()` rebuilds the whole map from settings on every
 * call, and the context bar asks seventeen times for one table.
 */
function keyCode(id: string, kb?: Record<string, string>, cls?: string): HTMLElement {
  const hint = hintFor(id, kb);
  if (!hint) return el("span");
  const classes = [cls, hintIsMode() ? "sc-key-mode" : ""].filter(Boolean).join(" ");
  return classes ? el("code", { class: classes }, [hint]) : el("code", {}, [hint]);
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
  const k = e.key;
  if (["Control", "Meta", "Alt", "Shift"].includes(k)) return null; // modifier only
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(k.length === 1 ? k.toLowerCase() : k);
  return parts.join("-");
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

// ---------------------------------------------------------------- spell check
//
// The engine holds the lexicons and does the checking (see engine/src/spell/);
// this schedules the checks and turns a click on a squiggle into something
// useful. Checking is debounced separately from compiling, and longer: a
// misspelling that appears half a second late costs nothing, whereas checking on
// every keystroke would squiggle words the writer is still in the middle of.

let spellTimer: number | undefined;
/** Set when the last check could not reach the engine, so the coverage note can
 *  say so instead of continuing to read as a clean bill of health — the exact
 *  silence this feature was built to avoid. */
let spellFailed = false;

function scheduleSpellCheck() {
  clearTimeout(spellTimer);
  if (!settings.spellcheck) return;
  spellTimer = window.setTimeout(runSpellCheck, 700);
}

// Incremental spell-check bookkeeping.
//
// A full-document check re-tokenises and re-looks-up the whole sefer on every
// pause in typing, and ships ~420 KB of offset-preserving text to the one engine
// worker to do it — behind the compile, on a shorter timer. But a pause almost
// always follows a change in *one* paragraph. So the typing path checks only the
// changed region (widened to paragraph boundaries) and splices the answer into
// the field, while explicit triggers with no document change — a spellcheck
// toggle, learning a word — leave the dirty range empty and fall through to a
// full check, which is exactly what those need.
let spellDirtyFrom = Infinity;
let spellDirtyTo = -1;
// Set by the two changes that make *every* paragraph's answer potentially
// different without touching the document: the comment setting and the word list.
let spellFullPending = false;
// A generation ticket, the same shape `runCompile` uses. A stale response must
// not overwrite the field — its offsets describe text that no longer exists, and
// `setMisspellings` replaces wholesale, discarding the positions the field
// mapped through the intervening edits. Squiggles landing on the wrong words.
let spellGeneration = 0;

/** Widen the changed region back and forward to the nearest blank line. */
function paragraphAround(text: string, from: number, to: number): { from: number; to: number } {
  const prevBlank = text.lastIndexOf("\n\n", Math.max(0, from - 1));
  const nextBlank = text.indexOf("\n\n", to);
  return { from: prevBlank < 0 ? 0 : prevBlank + 2, to: nextBlank < 0 ? text.length : nextBlank };
}

/** Grow the dirty region by the ranges this update touched, in current coords. */
function markSpellDirty(changes: import("@codemirror/state").ChangeDesc): void {
  // Map the accumulated region forward — but only when it is addressable by this
  // changeset. A document switch (or any wholesale replace) leaves a region from
  // the *previous* document behind, and `mapPos` on a position past the incoming
  // changeset's start length throws. When that happens the old region is
  // meaningless anyway, so drop it and re-seed from this transaction's ranges.
  const startLen = changes.length;
  if (spellDirtyTo >= 0 && spellDirtyFrom <= startLen && spellDirtyTo <= startLen) {
    spellDirtyFrom = changes.mapPos(spellDirtyFrom, -1);
    spellDirtyTo = changes.mapPos(spellDirtyTo, 1);
  } else {
    spellDirtyFrom = Infinity;
    spellDirtyTo = -1;
  }
  changes.iterChangedRanges((_fa, _ta, fromB, toB) => {
    spellDirtyFrom = Math.min(spellDirtyFrom, fromB);
    spellDirtyTo = Math.max(spellDirtyTo, toB);
  });
}

/** Ask for a full re-check on the next beat — a word list or comment-mode change. */
function forceFullSpellCheck(): void {
  spellFullPending = true;
  scheduleSpellCheck();
}

async function runSpellCheck() {
  if (!runtime.backend || !settings.spellcheck || !runtime.view) return;
  const doc = runtime.view.state.doc;
  const realText = docTextOf(doc);
  // Full when something changed the answer everywhere (or nothing has told us
  // where the change was); otherwise the one paragraph that moved.
  const full = spellFullPending || spellDirtyTo < 0 || spellDirtyFrom > spellDirtyTo;
  const region = full
    ? { from: 0, to: realText.length }
    : paragraphAround(
        realText,
        Math.max(0, Math.min(spellDirtyFrom, realText.length)),
        Math.max(0, Math.min(spellDirtyTo, realText.length)),
      );
  // Only the text that will actually print: command names are not misspellings,
  // and underlining them would make the feature useless on its first document.
  //
  // The region **first**, and only then the text for it. This used to build the
  // whole document's checkable text and slice a paragraph out of it, which is
  // the one part of the incremental check that never became incremental —
  // `AUDIT-perf-and-blocking.md` §A6 fixed the transfer and the engine's work
  // and left the client's. See `checkableText`'s `window` parameter.
  const payload = spell.checkableText(
    realText,
    { comments: !!settings.spellcheckComments },
    region,
  );
  const mine = ++spellGeneration;
  try {
    const res = await runtime.backend.spell(payload, spell.userWordsText(), false);
    // Superseded, or the document moved under the request: its offsets are now
    // fiction, so drop it and let the next scheduled check answer the real text.
    if (mine !== spellGeneration || runtime.view.state.doc !== doc) return;
    spellFailed = false;
    spell.noteLexiconSizes(res.lexicon_sizes);
    // The panel is built before the first check answers, so the note starts as
    // the general statement and becomes the measured one here. Updating the node
    // rather than rebuilding the chrome, because this runs on every pause in
    // typing.
    const note = document.getElementById("spell-coverage");
    if (note) note.textContent = spellCoverageNote();
    const fresh = res.misspellings.map((m) => ({ ...m, start: m.start + region.from }));
    const next = full
      ? fresh
      : [
          // Keep every existing mark that lies wholly outside the re-checked
          // paragraph; replace the ones inside it with the fresh answer.
          ...(runtime.view.state.field(spell.misspellings, false) ?? []).filter(
            (m) => m.start + m.len <= region.from || m.start >= region.to,
          ),
          ...fresh,
        ];
    runtime.view.dispatch({ effects: spell.setMisspellings.of(next) });
    // Checked cleanly: this region (or the whole document) is no longer dirty.
    spellFullPending = false;
    spellDirtyFrom = Infinity;
    spellDirtyTo = -1;
  } catch (e) {
    // A single dropped check is not worth a modal, but it must not read as a
    // clean page either: the toggle still says "on" and the panel still names
    // two lexicons, so a silence here is exactly the false all-clear this feature
    // exists to refuse. Mark it, and let the coverage note tell the truth.
    spellFailed = true;
    const note = document.getElementById("spell-coverage");
    if (note) note.textContent = spellCoverageNote();
    console.warn("spell check failed:", e);
  }
}

/**
 * What the editing mode is actually doing, said out loud.
 *
 * This was `t("editingModeNote")` — a static string reading *"Real Vim and
 * Emacs. While one is on it gets the keys before Ksav's own shortcuts"* —
 * printed regardless of whether anything had loaded. For the whole life of the
 * feature it was false: the mode was never applied at all, because
 * `loadSettings` was throwing and `settings.editingMode` was `"default"` by the
 * time boot looked at it. A sentence asserting that a thing works is not a
 * substitute for the thing working, and it is actively worse than silence when
 * the writer is trying to work out why their keys do nothing.
 *
 * So it reports. `keymodes.loadError()` has existed since the modes were
 * written, with a comment promising "a note saying why the mode did not
 * arrive", and **had no caller anywhere in the application** — its only
 * reference was a test asserting it was null. This is the caller.
 */
function editingModeNote(): string {
  const mode = settings.editingMode ?? "default";
  if (mode === "default") return t("editingModeNoteOff");
  const failed = keymodes.loadError();
  if (failed) return tf("editingModeFailed", failed);
  return t("editingModeNote");
}

/**
 * Which of the two the history is on, and how to take one by hand.
 *
 * A checkbox reading "automatic snapshots" answers half the question and leaves
 * the important half — *then what?* — to be worked out. Off, the writer needs to
 * know there is a key; on, they need to know the number underneath is minutes
 * and that the key still works. Both sentences name the binding in force rather
 * than the shipped one, so a rebound `Mod-Alt-s` reads as whatever the writer
 * made it.
 */
function snapshotNote(): string {
  // Unbound is a state a writer can put this in from the Shortcuts list below,
  // and "press  to keep a point" is the sort of sentence that gets shipped. The
  // fallback names the button, which is always there.
  const key = hintFor("snapshot") || t("snapshotNow");
  return settings.autoSnapshot === false
    ? tf("autoSnapshotOffNote", key)
    : tf("autoSnapshotOnNote", key);
}

/**
 * What the checker is actually checking, said out loud.
 *
 * This is the other half of adding English. The toggle used to read as on over a
 * page it had never looked at, and a silence that reads as a clean bill of
 * health is worse than a missing feature. So the panel names the languages —
 * and names them from what the *engine reported*, not from what this file
 * believes, because those came apart once before: a checked-in wasm module that
 * predated spell-check shipped with no checker in it and nothing said so.
 */
function spellCoverageNote(): string {
  if (spellFailed) return t("spellFailed"); // the check could not reach the engine
  const s = spell.lexiconSizes();
  if (!s) return t("spellLanguages"); // before the first check, what the engine ships with
  const n = (v: number) => v.toLocaleString(getLang() === "he" ? "he-IL" : "en-US");
  if (s.he > 0 && s.en > 0) return tf("spellLanguagesCount", n(s.he), n(s.en));
  if (s.he > 0) return tf("spellLanguagesPartial", t("langHebrew"));
  if (s.en > 0) return tf("spellLanguagesPartial", t("langEnglish"));
  return t("spellLanguagesNone");
}

function clearSpellCheck() {
  if (runtime.view) runtime.view.dispatch({ effects: spell.setMisspellings.of([]) });
}

/** The suggestion menu for the squiggle at `pos`, anchored at the pointer. */
async function openSpellMenu(m: spell.Misspelling, x: number, y: number) {
  const box = el("div", { class: "spell-menu", style: `left:${x}px; top:${y}px` }, [
    el("div", { class: "spell-word" }, [m.word]),
    el("div", { class: "spell-loading" }, ["…"]),
  ]);
  mountPanel("spell-menu", box, document.body);

  let suggestions: string[] = [];
  try {
    suggestions = await runtime.backend!.suggest(m.word, spell.userWordsText());
  } catch {
    suggestions = [];
  }
  if (!box.isConnected) return; // dismissed while we were asking

  const replace = (word: string) => {
    // Only if the span still says what `m` said it said.
    //
    // `m` was measured before `suggest` was awaited, and `box.isConnected` above
    // asks whether the *menu* is still on screen — not whether the document
    // still reads that way. This menu is not modal: the document keeps taking
    // edits from a mirrored pane, from `takeArrivals`, from a background
    // `linkify`. Accepting a suggestion after any of those replaced whatever had
    // moved into those offsets, which on a fast writer's document is somebody
    // else's word.
    //
    // The paste handler in `makeState` already does exactly this check for
    // exactly this reason; it is the same guard, and it reaches the keyboard
    // route (`spellSuggest`) too, which is the route a fast writer uses.
    const doc = docTextOf(runtime.view.state.doc);
    if (doc.slice(m.start, m.start + m.len) !== m.word) {
      closeSpellMenu();
      runtime.view.focus();
      // Re-check, because the document under the squiggle has changed and the
      // mark that was there is describing text that has gone.
      scheduleSpellCheck();
      return;
    }
    runtime.view.dispatch({
      changes: { from: m.start, to: m.start + m.len, insert: word },
      selection: { anchor: m.start + word.length },
    });
    closeSpellMenu();
    runtime.view.focus();
    scheduleSpellCheck();
  };

  box.replaceChildren(
    el("div", { class: "spell-word" }, [m.word]),
    ...(suggestions.length
      ? suggestions.map((w) => el("button", { class: "spell-item", onClick: () => replace(w) }, [w]))
      : [el("div", { class: "spell-none" }, [t("noSuggestions")])]),
    el("div", { class: "menu-sep" }),
    // Teaching it a word has to be one click: no lexicon holds every chaburah's
    // terminology or every rebbe's name, and a checker that cannot be taught is
    // one people switch off.
    el("button", { class: "spell-item spell-add", onClick: () => {
      spell.addUserWord(m.word);
      closeSpellMenu();
      // A learned word can appear anywhere, so re-check the whole document, not
      // just the paragraph the squiggle was in.
      spellFullPending = true;
      runSpellCheck();
      runtime.view.focus();
    } }, ["＋ " + t("addToDictionary")]),
  );
}

function closeSpellMenu() {
  closePanel("spell-menu");
}

/**
 * Dismiss the note menu.
 *
 * Its own — it used to borrow `closeSpellMenu`, which worked only because the
 * spell menu's selector caught it through the `.spell-menu` class it wears for
 * its styling. Now that each has a registry row, each closes itself.
 */
function closeNoteMenu() {
  closePanel("note-menu");
}

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
        if (u.docChanged && recording) {
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

// ---------------------------------------------------------------- panes
//
// The window is a tree of panes now (`panes.ts`), and this is the part that
// turns that tree into DOM and into editors. Three rules carry all of it:
//
//   **One document, many views.** Every source pane showing a document is a
//   separate `EditorView` with its own caret, its own scroll and its own fold
//   state. They are views of one text, not copies of it, so a change made in any
//   of them appears in all of them.
//
//   **One undo history per document.** Exactly one view per document is the
//   *primary*: it holds the document's state, with the history in it. Every
//   other view is a mirror, and a mirror that is typed into routes the change to
//   the primary rather than applying it locally. So there is one place edits are
//   recorded, which is what makes undo mean the same thing in every pane — and
//   is the lesson from the bug that poured one document's text into another.
//
//   **The focused pane is `runtime.view`.** Every command in the application
//   acts on it, unchanged, because "the editor" was always meant to be "the one
//   the writer is typing in".

/** The window's arrangement. */
let paneTree: panes.PaneNode = panes.defaultTree();
/** The live editor for each source pane. */
const paneViews = new Map<string, EditorView>();
/** Which pane the writer is in. */
let focusedPane: string | null = null;
/**
 * The region shown alone, or null for the whole window.
 *
 * Not a change to the tree, and that is the design rather than an
 * implementation note. Zooming is a way of *looking* at an arrangement, so a
 * writer who zooms, reads, and zooms back out must get the arrangement they
 * built — the same splits at the same fractions, and the same editors with the
 * same scroll, undo history and folds. Rebuilding the tree would give them
 * something that looks the same and is not, and rebuilding the DOM would throw
 * away every view in the window to change what is on screen.
 *
 * So this is one id, and `applyPaneZoom` hides the rest with a class. Everything
 * stays alive behind it, including the previews, which keep compiling.
 */
let zoomedNode: string | null = null;
/**
 * Which pane the writer last touched — of **any** role.
 *
 * `focusedPane` is a source pane and cannot be anything else: it is set from
 * `focusin` on an editor host and reset to the first source pane whenever the
 * arrangement is rebuilt, because everything that reads it wants an
 * `EditorView`. That is right for what it is for and one pane short of right
 * for the swap commands, which operate on a *place in the window*: a writer who
 * has just clicked into the preview and presses "swap left" means the preview.
 *
 * So a second, wider answer, set on a pointer landing anywhere in a pane. It
 * falls back to `focusedPane` — a fresh window has been clicked in nowhere —
 * and, like it, has to be checked against the tree before use, since the pane it
 * names can have been closed since.
 */
let activePane: string | null = null;

/** The pane a pane command acts on: the last one touched, whatever its role. */
function currentPane(): string | null {
  const live = (id: string | null) => (id && panes.find(paneTree, id) ? id : null);
  return live(activePane) ?? live(focusedPane);
}
/** Set while a change is being mirrored, so mirroring does not recurse. */
let mirroring = false;
/**
 * Set while one pane's edit is being handed to the primary.
 *
 * The primary's `dispatch` runs for that hand-off exactly as it does for a
 * keystroke, and nothing in the transaction says which it was. That is only a
 * distinction worth drawing since narrowing: without this flag a narrowed
 * primary refuses the *other* pane's edits, so narrowing one pane would quietly
 * restrict every pane in the window to the same section.
 */
let forwarding = false;

/** Every source pane's editor, in tree order, the focused one included. */
function sourceViews(): EditorView[] {
  const out: EditorView[] = [];
  for (const l of panes.leaves(paneTree)) {
    if (l.role !== "source") continue;
    const v = paneViews.get(l.id);
    if (v) out.push(v);
  }
  return out;
}

/**
 * Show a document in every source pane at once.
 *
 * Switching documents used to re-state `runtime.view` — **the focused pane, and
 * only it**. Every other source pane went on holding the sefer you had just
 * left, while `retargetPanes` relabelled its tab with the name of the one you
 * had switched to, so the window showed two documents and claimed to show one.
 *
 * Typing into the pane that was left behind was worse than reading it. The edit
 * is forwarded to the primary and mirrored back by changesets carrying the
 * primary's positions, so the moment the two documents were different lengths
 * every keystroke threw `Applying change set to a document with the wrong
 * length` — uncaught, once per character, with nothing on screen changing and
 * nothing said. A writer typing into a pane that has silently stopped being an
 * editor is the exact shape this application is being audited for.
 *
 * The panes share one `EditorState`, which is what they are: mirrors onto one
 * text with one undo history. They diverge from the first keystroke, and
 * `mirrorChange` is what keeps the text from diverging with them.
 *
 * Where each pane was *standing* in the document being returned to is restored
 * afterwards, by `restorePlaces`. One state per document is still the right
 * shape — there is one text and one undo history — and a caret per pane per
 * document is the part that is not a property of the document at all. See
 * `paneplaces.ts`.
 */
function showInEveryPane(state: EditorState): void {
  const views = sourceViews();
  if (!views.length) {
    // Before the first render there are no panes, only the boot view.
    runtime.view.setState(state);
    return;
  }
  for (const v of views) v.setState(state);
}

/**
 * Remember where every source pane is standing in the document it is showing.
 *
 * Called before a switch takes the document away. `stashFocused` above does the
 * same thing for the *document* — its text, its history, and the focused
 * pane's caret — and this is the half that is per pane: three panes onto one
 * sefer are three places in it, and the open set has one slot.
 */
function rememberPlaces(docId: string | null): void {
  if (!docId) return;
  for (const l of panes.leaves(paneTree)) {
    const v = l.role === "source" ? paneViews.get(l.id) : undefined;
    if (l.role === "source" && !v) continue;
    const sel = v?.state.selection.main;
    paneplaces.remember(l.id, docId, {
      anchor: sel?.anchor ?? 0,
      head: sel?.head ?? 0,
      // A preview has no caret, and `l.scrollTop` is what `wirePaneScroll`
      // keeps for it. Every pane role is remembered, not only the two that can
      // be typed in: coming back to a sefer with the source at siman fifty and
      // the printed page at page one is the same complaint one pane over.
      scrollTop: v ? v.scrollDOM.scrollTop : l.scrollTop,
    });
  }
}

/**
 * Put every source pane back where it was in this document, if it has been here.
 *
 * A pane with nothing remembered is left alone, holding the document's own
 * caret — which is where the writer last was in it. That is deliberately not
 * "the top": a pane opening a sefer for the first time this session should land
 * where the document says, and only a pane that has genuinely stood somewhere
 * else in *this* document has a better answer than that.
 *
 * The scroll is set from the same record rather than left to
 * `scrollIntoView`, because the two are different facts: a caret three lines
 * above the fold and a caret centred are the same selection and not the same
 * screen, and the writer arranged one of them.
 */
function restorePlaces(docId: string): void {
  for (const l of panes.leaves(paneTree)) {
    if (l.role !== "source") continue;
    const v = paneViews.get(l.id);
    const place = v && paneplaces.recall(l.id, docId);
    if (!v || !place) continue;
    const { anchor, head, scrollTop } = paneplaces.within(place, v.state.doc.length);
    v.dispatch({ selection: { anchor, head } });
    v.scrollDOM.scrollTop = scrollTop;
  }
}

/**
 * Put every preview pane back to the page it was showing in this document.
 *
 * Separate from the source panes above, and later, because a preview cannot be
 * scrolled to somewhere it has no pages: `showPagesFor` is what draws them, and
 * a scroll set before that is a scroll into an empty element, silently clamped
 * to zero. So this runs after the pages are up, and does nothing when there are
 * none — a document being opened for the first time this session has no page to
 * return to, and the top of a blank pane is the honest answer.
 */
function restorePreviewPlaces(docId: string): void {
  for (const l of panes.leaves(paneTree)) {
    if (l.role === "source") continue;
    const place = paneplaces.recall(l.id, docId);
    const host = paneHostOf(l.id);
    if (!place || !host || !host.scrollHeight) continue;
    l.scrollTop = place.scrollTop;
    host.scrollTop = place.scrollTop;
  }
}

/** The view that owns a document's history: the first source pane showing it. */
function primaryView(): EditorView | undefined {
  for (const l of panes.leaves(paneTree)) {
    if (l.role !== "source") continue;
    const v = paneViews.get(l.id);
    if (v) return v;
  }
  return undefined;
}

/**
 * Put a change into every other source pane, without recording it again.
 *
 * `addToHistory.of(false)`, and that is the whole of "one undo history per
 * document": the primary has already recorded this edit, and a mirror that
 * recorded it too would build a second stack that diverges the moment anybody
 * undoes anything.
 */
function mirrorChange(from: EditorView, tr: Transaction) {
  if (!tr.docChanged || mirroring) return;
  mirroring = true;
  try {
    for (const v of paneViews.values()) {
      if (v === from) continue;
      v.dispatch({ changes: tr.changes, annotations: Transaction.addToHistory.of(false) });
    }
  } finally {
    mirroring = false;
  }
}

/** One source pane's editor. */
function makePaneView(host: HTMLElement, state: EditorState): EditorView {
  const view: EditorView = new EditorView({
    state,
    parent: host,
    dispatch: (tr) => {
      // A narrowed pane cannot edit outside its section, and **here** is the
      // only place that can be enforced.
      //
      // Not in a `transactionFilter` inside the state, which is where it
      // belongs by shape: every pane's state receives every change, mirrored
      // from the primary (see `mirrorChange`), so a filter there would refuse
      // the *other* panes' perfectly legal edits and leave this pane holding a
      // different document from everybody else. That is the document-eating bug
      // this whole model was built to prevent, reintroduced by a guard.
      //
      // `mirroring` and `forwarding` are what tell the three cases apart, and
      // all three arrive here as the same kind of transaction. Only a change
      // that is neither — one that started in *this* pane, under this writer's
      // hands — is this pane's to refuse. Refused before the forward below,
      // because once the primary has recorded it there is nothing left to
      // refuse; and skipped for a forward, or a narrowed primary would refuse
      // the edits of every other pane in the window.
      if (tr.docChanged && !mirroring && !forwarding) {
        const span = narrowedTo(view.state);
        if (span && changeReachesOut(span, tr.changes)) {
          setStatus(tf("narrowedRefused", titleOfSpan(span)), "warn");
          return;
        }
      }
      // A mirror that is typed into hands the change to the primary, so the
      // edit is recorded once. Everything that is not a document change —
      // moving the caret, folding, scrolling into view — stays local, because
      // those are exactly the things a pane owns.
      const primary = primaryView();
      if (tr.docChanged && !mirroring && !forwarding && primary && primary !== view) {
        const was = tr.annotation(Transaction.userEvent);
        forwarding = true;
        try {
          primary.dispatch({
            changes: tr.changes,
            selection: tr.selection,
            ...(was ? { userEvent: was } : {}),
          });
        } finally {
          forwarding = false;
        }
        // The caret comes back, and it has to be given back by hand.
        //
        // The change reaches this pane again through `mirrorChange`, which
        // sends a changeset and nothing else — so this pane's selection is
        // *mapped* through the insertion rather than placed after it, and a
        // cursor sitting exactly where text is inserted maps to before it. The
        // caret therefore did not move, and the next keystroke landed in front
        // of the last one: typing `ולד` into a second pane produced `דלו`.
        //
        // Every character, in reverse, in any pane but the first — since panes
        // were introduced. It survived because a mirrored pane is the one thing
        // a unit test on `panes.ts` cannot hold: the tree was right, the text
        // was right, and the order was decided by a selection nobody sent.
        if (tr.selection) {
          view.dispatch({ selection: tr.selection, annotations: Transaction.addToHistory.of(false) });
        }
        return;
      }
      view.update([tr]);
      mirrorChange(view, tr);
    },
  });
  return view;
}

/**
 * Lock the focused pane to the section the caret is in.
 *
 * The anchor and the caret move in one transaction. Two dispatches would put a
 * state on screen — narrowed, with the caret outside the accessible portion —
 * that this feature exists to make impossible, and it would be visible for a
 * frame every single time.
 */
function narrowHere(v: EditorView): void {
  const at = v.state.selection.main.head;
  const span = spanAt(docTextOf(v.state.doc), at);
  // Above the first heading there is no section, and saying so is the answer.
  // "Narrow to the whole document" would be a narrowing that narrows nothing,
  // reported as success.
  if (!span) {
    setStatus(t("narrowNoSection"), "warn");
    return;
  }
  v.dispatch({ effects: setNarrow.of(span.anchor), selection: { anchor: insideSpan(span, at) } });
  setStatus(tf("narrowedTo", titleOfSpan(span)), "ok");
  refreshPaneHeads();
  applyPreviewWindows();
}

/** Let it out again. */
function widenHere(v: EditorView): void {
  if (!narrowedTo(v.state)) {
    setStatus(t("notNarrowed"));
    return;
  }
  v.dispatch({ effects: setNarrow.of(null) });
  setStatus(t("widened"), "ok");
  refreshPaneHeads();
  applyPreviewWindows();
}

/** A heading with no title still has to be nameable in a sentence. */
function titleOfSpan(span: Span): string {
  return span.title || t("narrowedNoTitle");
}

/**
 * Every pane's strip, rebuilt.
 *
 * Narrowing is the only thing in the strip that changes without the arrangement
 * changing, and `renderPanes` is far too big a hammer for it: it destroys every
 * `EditorView` in the window and builds them again, which a writer would see as
 * their scroll position jumping in a pane they did not touch.
 */
function refreshPaneHeads(): void {
  for (const pane of panes.leaves(paneTree)) {
    const head = document.querySelector<HTMLElement>(`[data-pane="${pane.id}"] > .pane-head`);
    if (head) head.replaceWith(paneHead(pane));
  }
}

/**
 * The stretch of the document a preview pane is following, or `null` for all of
 * it.
 *
 * A preview follows the pane it was split from, which is what `linked` has
 * always meant for scrolling — *"we also should make that you can optionally
 * unlink the scrolling"* — and narrowing is the same relationship asked a second
 * question. Unlinking a preview widens it, which is the escape hatch: a reader
 * who wants the sefer beside a narrowed source presses the same button they
 * already press to stop the scroll following.
 *
 * The offset is the custom-command preamble. The pane counts in the writer's own
 * lines and the engine answers in the body it was sent, and the two differ by
 * exactly that — the same correction `diagview` makes to a diagnostic, made
 * here for the same reason and read from the same place.
 */
function previewWindowOf(pane: panes.Leaf): { win: LineWindow; title: string } | null {
  if (pane.role !== "preview" || !pane.linked) return null;
  const beside = panes.sibling(paneTree, pane.id);
  if (!beside || beside.role !== "source") return null;
  const v = paneViews.get(beside.id);
  const span = v ? narrowedTo(v.state) : null;
  if (!v || !span) return null;
  const win = lineWindowOf(docTextOf(v.state.doc), span);
  const shift = preambleOffset();
  return {
    win: { file: win.file, from: win.from + shift, to: win.to + shift },
    title: titleOfSpan(span),
  };
}

/**
 * Tell every preview pane which siman it is following, if any.
 *
 * Called wherever the answer can change: the arrangement, the narrowing, and the
 * scroll link. Not on a compile — the *window* does not move when the document
 * is laid out again, only which pages it lands on, and `drawPagesEverywhere`
 * redraws for that.
 */
function applyPreviewWindows(): void {
  let narrowed = false;
  for (const pane of panes.leaves(paneTree)) {
    if (pane.role !== "preview") continue;
    const host = document.getElementById(`pane-host-${pane.id}`);
    if (!host) continue;
    const on = previewWindowOf(pane);
    narrowed ||= !!on;
    narrowPreview(host, on?.win ?? null, on?.title);
  }
  // A preview that has just been narrowed has no runs to narrow *by*: the
  // compile that drew what is on screen was never asked for them. So ask, once,
  // rather than leaving a pane claiming to hold one siman while showing forty
  // pages until the writer's next keystroke.
  //
  // Asked of the pages on screen, not of `runtime.lastResult`. The two disagree
  // exactly when a compile has failed — `lastResult` is stored unconditionally
  // and the redraw is skipped — and the first spelling of this read the wrong
  // one of them.
  if (narrowed && !hasPageLines()) scheduleCompile();
}

/**
 * Build `<main>` from the pane tree.
 *
 * Rebuilt wholesale rather than diffed, and the cost is bounded because it only
 * runs when the *arrangement* changes — not on a keystroke, not on a scroll, and
 * not when a document is switched. Each source pane's state is carried across so
 * an arrangement change does not cost a writer their carets.
 */
/**
 * The words that were on the screen when the panes were last torn down.
 *
 * Set by `renderPanes` before it destroys the views and read by `renderLeaf`
 * while it builds their replacements — which is the only window in which it is
 * true, hence a variable rather than an argument threaded through `renderNode`.
 *
 * Why it cannot be `runtime.currentDoc.body`: that is the copy in the store,
 * and autosave writes it 600 ms after a pause in typing. A pane seeded from it
 * comes up holding a document as it was up to six hundred milliseconds ago.
 */
let liveTextAtRender: string | null = null;

function renderPanes() {
  const main = document.querySelector("main");
  if (!main) return;
  liveTextAtRender = runtime.view ? docTextOf(runtime.view.state.doc) : null;
  // What each pane was holding, so rebuilding does not reset it.
  const held = new Map<string, EditorState>();
  for (const [id, v] of paneViews) held.set(id, v.state);
  // And **where each pane was looking**, which the state does not carry.
  //
  // An `EditorState` holds the text and the caret and no scroll at all, so
  // every pane that survived a rebuild came back at the top of the document.
  // That made every arrangement change — closing a pane, splitting one, even
  // toggling the scroll-link chip — throw a reader on page 40 of a sefer back
  // to page 1. Read here, before the views are destroyed, and asked for again
  // once the new tree is on screen.
  const wasAt = new Map<string, number>();
  for (const [id, v] of paneViews) wasAt.set(id, v.scrollDOM.scrollTop);
  for (const pane of panes.leaves(paneTree)) {
    if (pane.role === "source") continue;
    const host = paneHostOf(pane.id);
    if (host) wasAt.set(pane.id, host.scrollTop);
  }
  for (const v of paneViews.values()) v.destroy();
  paneViews.clear();

  main.replaceChildren(renderNode(paneTree, held));
  main.setAttribute("data-panes", String(panes.leaves(paneTree).length));
  // Reapplied on every rebuild, and it is what keeps a zoom from surviving the
  // thing it was a zoom *of*. Splitting or closing a pane rebuilds the window;
  // if the zoomed region went with it, `applyPaneZoom` finds nothing and drops
  // the zoom, which is the only honest answer.
  applyPaneZoom();

  // Put every surviving source pane back where it was looking. A pane that is
  // new has no entry and is left alone — `renderLeaf` opens it where the pane it
  // was split from is looking, which is a different and deliberate answer.
  //
  // The previews cannot be restored here: their pages are not drawn until
  // `drawCurrentIntoAll` at the end of this function, and a scroll into a pane
  // with no content in it yet is clamped to zero. They are done there.
  for (const pane of panes.leaves(paneTree)) {
    const at = wasAt.get(pane.id);
    if (at === undefined || pane.role !== "source") continue;
    const view = paneViews.get(pane.id);
    if (view) view.scrollDOM.scrollTop = at;
  }

  // A caret is not a view. A pane born with its caret at the place you were
  // reading still *renders* from the top of the document, so the scroll has to
  // be asked for — and it has to be asked for here rather than in `renderLeaf`,
  // because the tree is detached while it is being built and a view with no
  // height on screen has nothing to scroll.
  for (const leaf of panes.leaves(paneTree)) {
    if (leaf.role !== "source" || held.has(leaf.id)) continue;
    const born = paneViews.get(leaf.id);
    if (born) born.dispatch({ effects: EditorView.scrollIntoView(born.state.selection.main.head, { y: "center" }) });
  }

  // And the editing mode, which a newborn pane has none of: `makeState` builds
  // the mode compartment empty, so a pane made by splitting a window that is in
  // vim starts in plain editing. Applied to the whole arrangement rather than to
  // the new pane alone because the call is per view anyway and the import is
  // cached, so there is nothing to be gained by being clever about which panes
  // already have it.
  void setEditingMode(settings.editingMode);

  // The focused pane has to be one that still exists.
  const live = panes.leaves(paneTree).filter((l) => l.role === "source");
  if (!focusedPane || !paneViews.has(focusedPane)) focusedPane = live[0]?.id ?? null;
  const v = focusedPane ? paneViews.get(focusedPane) : undefined;
  if (v) runtime.setView(v);
  applyPreview();
  // Before the draw, not after: a preview that is following a narrowed siman
  // must not show the whole sefer for the frame between the two.
  applyPreviewWindows();
  drawCurrentIntoAll();
  // Now the previews have pages, so now they can be put back where they were.
  // Written straight rather than through the link, because this is not a follow:
  // the pane is being restored to the place it was already at, and routing it
  // through `syncLinkedScroll` would move it to wherever the source happens to
  // be instead.
  for (const pane of panes.leaves(paneTree)) {
    const at = wasAt.get(pane.id);
    if (at === undefined || pane.role === "source") continue;
    const host = paneHostOf(pane.id);
    if (!host) continue;
    host.scrollTop = at;
    // And it must not read as a person scrolling, or the pane it is linked to
    // will follow it and both will end up somewhere neither was.
    scrollWritten.set(pane.id, host.scrollTop);
  }
  // The side panels, now that their hosts are in the document. Both are cheap
  // and both are wrong to leave blank: an outline pane that fills in on the
  // next keystroke is an outline pane that looks broken until you type.
  renderOutline();
  renderNotesPane();
}

function renderNode(node: panes.PaneNode, held: Map<string, EditorState>): HTMLElement {
  if (node.kind === "leaf") return renderLeaf(node, held);
  const box = el("div", { class: "pane-split", "data-dir": node.dir, "data-node": node.id });
  const a = renderNode(node.a, held);
  const b = renderNode(node.b, held);
  a.style.flex = `${node.frac} 1 0`;
  b.style.flex = `${1 - node.frac} 1 0`;
  box.append(a, splitterFor(node), b);
  return box;
}

function renderLeaf(pane: panes.Leaf, held: Map<string, EditorState>): HTMLElement {
  const host = el("div", { class: "pane-host", id: `pane-host-${pane.id}` });
  const section = el(
    "section",
    {
      class: `pane ${pane.role}-pane`,
      "data-pane": pane.id,
      // The same id again under the name the zoom uses, so one walk up the DOM
      // can treat a pane and a split alike — which is the whole point of zooming
      // a *region* rather than a pane.
      "data-node": pane.id,
      "aria-label": t(pane.role),
    },
    [host],
  );
  if (pane.role === "source") {
    // A pane with no held state is a pane that did not exist a moment ago — a
    // split. It opens **where the pane it was split from is looking**, not at
    // the head of the document: you split a 300-page sefer to hold two places
    // at once, and a new pane that starts at page 1 has thrown away the place
    // you were standing in to get it. `held` still has the focused pane's
    // state here because it is captured before the views are destroyed.
    const seed = focusedPane ? held.get(focusedPane) : undefined;
    // **The text comes from `held`, not from the stored body.**
    //
    // `primaryView()` reads `paneViews`, and the loop above has already
    // destroyed every view and cleared that map — so it was *always* undefined
    // here and every new pane was seeded from `runtime.currentDoc.body`, which
    // is the copy in the store. Autosave writes it 600 ms after a pause in
    // typing, so anything written since is not in it.
    //
    // Harmless-looking for a split, and not harmless at all for a tab switch,
    // where every pane of the arriving arrangement is new: the pane came up
    // holding a stale copy of the document being left, and `stashFocused` —
    // which runs next, and files `runtime.view.state` under the document still
    // focused — wrote that stale copy back over the live one. A sefer typed and
    // switched away from inside the autosave window lost what had been typed.
    // The acceptance run reported it as four pages coming back as one.
    //
    // `held` is captured before the views are destroyed, which the comment
    // above already says, and `seed` is that state. It was being asked for the
    // caret and not for the words.
    // `seed` is the focused pane's own held state, which is the right answer
    // for a **split** — the new pane opens where the one it was split from is
    // looking. It is absent for a **tab switch**, because `selectTab` points
    // `focusedPane` at the arriving tab's pane before the rebuild and that id
    // was never in `held`; the words then come from what was on the screen a
    // moment ago, and only failing both from the store.
    const state =
      held.get(pane.id) ??
      makeState(
        seed ? docTextOf(seed.doc) : (liveTextAtRender ?? runtime.currentDoc.body),
        proseHere(),
        seed?.selection.main.head,
      );
    const view = makePaneView(host, state);
    paneViews.set(pane.id, view);
    host.addEventListener("focusin", () => {
      focusedPane = pane.id;
      activePane = pane.id;
      runtime.setView(view);
    });
  } else if (pane.role === "preview") {
    host.classList.add("preview-host");
    // **What makes `manual` safe to offer.** A preview that stopped updating
    // and did not say so is not a setting — it is a way to read an old page and
    // believe it is current, which is a worse failure than a slow preview
    // because nothing on the screen contradicts it. So the banner is part of
    // the mode rather than an addition to it, it names the way out, and it sits
    // on the page it is about rather than in the status bar with everything
    // else.
    host.append(
      el("button", { class: "preview-stale", onClick: () => compileNow(), hidden: "hidden" }, [
        el("b", {}, ["⟳ " + t("previewStale")]),
        el("span", {}, [t("previewStaleHow")]),
      ]),
    );
    wirePreviewClicks(host);
  } else {
    // The outline and the notes list, as panes rather than as drawers over the
    // document. The list itself is the same list, drawn into every home it has.
    //
    // **Not filled here.** `renderNode` builds a detached tree and `renderPanes`
    // attaches it afterwards, so a `querySelectorAll` at this moment searches a
    // document this host is not in yet and finds nothing. Filled once the tree
    // is on screen; see the end of `renderPanes`.
    const LIST_CLASS: Record<string, string> = {
      outline: "outline-list",
      notes: "notes-list",
      marks: "marks-list",
    };
    host.classList.add(LIST_CLASS[pane.role] ?? "notes-list", "panel-pane");
  }
  // Prepended, not passed in above, and that is the narrowing chip's doing: the
  // strip reports what this pane is narrowed to, which it can only read off the
  // `EditorView` that the branch above has just built. Built first, it reported
  // "not narrowed" for every pane — so carrying a narrowed pane through an
  // arrangement change lost the one label saying the pane was not showing the
  // whole document.
  section.prepend(paneHead(pane));
  wirePaneScroll(pane, host);
  // Which pane a pane command acts on. `focusin` answers this for a source pane
  // and for nothing else: a preview host holds no focusable element, so clicking
  // into the page and pressing a swap key would have moved whichever source pane
  // was focused a minute ago. `pointerdown` on the section catches every pane and
  // every role, and it is passive — it decides nothing and cancels nothing.
  section.addEventListener("pointerdown", () => { activePane = pane.id; }, { passive: true });
  return section;
}

/**
 * A pane's own strip: what it is showing, and the controls that belong to it.
 *
 * The scroll-link toggle lives here rather than in Settings because it is a
 * property of *this* pane — *"we also should make that you can optionally unlink
 * the scrolling"* — and a per-pane property in an application-wide drawer is a
 * setting nobody can find and nobody can tell which pane it applies to.
 */
function paneHead(pane: panes.Leaf): HTMLElement {
  // `source` and `preview` are already keys; the two panel roles have their own
  // names because "outline" is also the name of a *function* in this file and a
  // key called `notes` would collide with the notes chooser.
  const NAME: Record<string, string> = {
    source: "source",
    preview: "preview",
    outline: "outlinePane",
    notes: "notesPaneRole",
    marks: "marksPane",
  };
  // The pane's number, and it is on screen rather than implied.
  //
  // *"I don't know if I can switch other than top bottom and left right — what
  // if it gets more complicated?"* — which is the right question, because the
  // directional commands genuinely run out: in a tree three levels deep "the one
  // on the left" stops picking out a pane a person can point at. A number does,
  // at any depth, and it is the same answer Emacs' `ace-window` and every tiling
  // manager reached. It has to be *visible* to be usable: a picker offering
  // "pane 3" is worth nothing if nothing on screen says which pane is 3.
  const kids: Node[] = [
    el("span", { class: "pane-no", title: tf("paneNumbered", String(paneNumberOf(pane.id))) }, [
      String(paneNumberOf(pane.id)),
    ]),
    el("span", { class: "pane-name" }, [t(NAME[pane.role])]),
  ];
  // Narrowing, and it is **named rather than iconified**. A glyph can say *this
  // pane is restricted*; only the title can say *to what*, and that is the one
  // question a writer looking at a pane showing four paragraphs of a 300-page
  // sefer actually has. The control is present with one pane as well as with
  // four: working on one siman without the rest of the sefer under the caret is
  // a reason to narrow that has nothing to do with splitting the window.
  if (pane.role === "source") {
    const span = paneNarrow(pane.id);
    kids.push(
      glyphBtn(
        span ? `⊡ ${titleOfSpan(span)} ×` : "⊡",
        span ? t("widenLede") : t("narrowLede"),
        () => {
          const v = paneViews.get(pane.id);
          if (!v) return;
          if (span) widenHere(v);
          else narrowHere(v);
        },
        "pane-btn" + (span ? " pane-narrowed" : ""),
        // The state, on the element, because it is the one thing about a pane
        // that cannot be read off its contents: a pane showing four paragraphs
        // is either a short document or a narrowed one, and nothing on screen
        // told the two apart. `.github/scripts/acceptance.mjs` drives by this.
        { "data-narrow": span ? "on" : "off" },
      ),
    );
  }
  // A preview following a narrowed pane shows four pages where a sefer was, and
  // until this element nothing on screen admitted to it. Left empty here and
  // written by `preview.ts` after each draw: the siman's name does not change
  // between draws but the number of pages it printed on does, and one writer of
  // one element is the rule this repository keeps having to re-learn.
  if (pane.role === "preview") {
    kids.push(
      el("span", {
        class: "pane-window",
        "data-preview-window": "",
        title: t("previewFollowsLede"),
      }),
    );
  }
  // Each control names itself. The strip is the one place in the application
  // whose buttons are pure glyph, so the only other thing that could identify
  // them is the `title`, which is translated — and a fence that reads a Hebrew
  // title is a fence that goes quiet the day the run is driven in English.
  if (panes.leaves(paneTree).length > 1) {
    kids.push(
      glyphBtn(
        pane.linked ? "⇅" : "⇵",
        pane.linked ? t("scrollLinked") : t("scrollUnlinked"),
        // **Not `setTree`.** Linking changes one field on one leaf and nothing
        // about the shape, and `setTree` rebuilds every `EditorView` in the
        // window — which used to throw a reader on page 40 back to page 1 for
        // pressing a chip that has nothing to do with where they are.
        () => {
          paneTree = panes.update(paneTree, pane.id, { linked: !pane.linked });
          rememberPanes();
          refreshPaneHeads();
          applyPreviewWindows();
        },
        "pane-btn",
        { "data-pane-act": "link" },
      ),
    );
  }
  // **Both splits, always.**
  //
  // There used to be one button, it was only offered once the window already had
  // two panes, and it only ever made one of the two splits. All three of those
  // were reported at once: *"I can't see how to split it vertically, only
  // horizontally"*. The tree has handled both directions since it was written
  // (`panes.split` takes a `dir`); nothing in the window ever asked for the
  // other one. A single pane can be split too, which is the case a writer is
  // most likely to want it in.
  kids.push(
    glyphBtn("◫", t("splitAcross"), () => splitHere(pane, "row"), "pane-btn", {
      "data-pane-act": "split-across",
    }),
    glyphBtn("⊟", t("splitDown"), () => splitHere(pane, "col"), "pane-btn", {
      "data-pane-act": "split-down",
    }),
    // Zoom, beside the splits, because it is the same question answered the
    // other way: those two make the window smaller pieces, this one shows one
    // piece at a time. The glyph changes to say which state pressing it leaves,
    // so a zoomed window is legible from the pane it zoomed rather than only
    // from the fact that the others are missing.
    glyphBtn(
      zoomedNode ? "⤡" : "⛶",
      zoomedNode ? t("unzoomPane") : t("zoomPane"),
      () => {
        activePane = pane.id;
        cyclePaneZoom();
      },
      "pane-btn" + (zoomedNode ? " pane-zoom-on" : ""),
      { "data-pane-act": "zoom" },
    ),
    glyphBtn(
      "⋯",
      t("paneMenu"),
      (e: Event) => {
        // **Stopped here.** `window`'s click listener calls
        // `closeOnOutsideClick`, and the click that opens this menu is, to that
        // listener, a click on a button that is not inside `.pane-menu` — so
        // without this the menu is dismissed by the very gesture that opened it
        // and the button does nothing at all. The header's dropdowns are closed
        // by hand for the same reason: that sweep rides on the same listener.
        e.stopPropagation();
        closeMenus();
        openPaneMenu(pane, e.currentTarget as HTMLElement);
      },
      "pane-btn",
      { "data-pane-act": "menu" },
    ),
  );
  if (panes.leaves(paneTree).length > 1) {
    kids.push(
      // Closing a *pane* is not closing a document and not deleting one. It was
      // spelled `–` to keep the three apart, and the writer read the strip
      // exactly as the glyph was drawn: *"i dont see how to close one, only
      // minimise"*. A dash means minimise in every window manager there has ever
      // been. The three meanings are told apart by the `title` and by which
      // surface the control is on — never by making the commonest one unreadable.
      glyphBtn(
        "×",
        t("closePane"),
        () => setTree(panes.closePane(paneTree, pane.id)),
        "pane-btn pane-close",
        { "data-pane-act": "close" },
      ),
    );
  }
  const head = el("div", { class: "pane-head" }, kids);
  // Drag the strip onto another pane and the two trade places — *"a drag would
  // also be nice, but at the very least intuitive commands to swap 2 windows
  // would help"*. Both, then: this, and `pane.swap*` on the keyboard.
  //
  // The **strip** is the handle, not the pane. A source pane is a text editor,
  // and making the editor itself draggable would take a writer's ability to
  // select text with the mouse — which is the gesture this one is spelled with.
  // A one-pane window has nothing to trade with, so the handle is not offered.
  if (panes.leaves(paneTree).length > 1) {
    head.title = t("swapPaneDrag");
    head.classList.add("pane-grab");
    wirePaneDrag(pane, head);
  }
  return head;
}

/** This pane's number, as the strip prints it and the pickers ask for it. */
function paneNumberOf(id: string): number {
  return panes.leaves(paneTree).findIndex((l) => l.id === id) + 1;
}

/**
 * Split this pane, in the direction asked for.
 *
 * The new pane shows the same thing the old one does, unlinked — splitting is
 * how you get a second place in one document, and a second view that follows the
 * first is the first view again. Both directions come through here so there is
 * one answer to what a split *is* and only the axis differs.
 */
function splitHere(pane: panes.Leaf, dir: "row" | "col") {
  setTree(panes.split(paneTree, pane.id, dir, panes.leaf(pane.role, pane.docId, { linked: false })));
}

// ------------------------------------------------------------ dragging a pane
//
// # Why this is pointer events and not HTML5 drag-and-drop
//
// It was drag-and-drop: `head.draggable = true`, a private MIME type, and
// `dragover`/`drop` on each pane. It was reported as simply not working —
// *"I would like to use the mouse to switch, but that does not work, I cannot
// drag it"* — and it does not, for a reason that is structural rather than a
// bug to find:
//
//   • **The drop target is a text editor.** A source pane's section contains a
//     CodeMirror view, which registers its own `drop` handling for dragging text
//     about, and it is the innermost handler. Dropping a pane onto the *text* —
//     which is nearly all of the target a person aims at — never reached the
//     section's listener at all. Only the strip and the margins worked, which
//     from the outside is a feature that does nothing.
//   • **Nothing said it was draggable.** No cursor change, no ghost, no lit
//     drop target until the pointer happened to cross a working strip. A gesture
//     whose whole discoverability is "try dragging and see" has to answer on the
//     first pixel of movement.
//
// Pointer events have none of that: one capture, no negotiation with any other
// handler, and every pane is a drop target whatever is inside it. It also
// unlocks the thing a swap cannot express — dropping onto an *edge* of a pane
// moves the pane there instead of trading places, which is the second half of
// what the margin asked for.

/** How far the pointer must travel before this is a drag and not a click. */
const DRAG_SLOP = 4;

/**
 * What a drop at this point over this pane would do.
 *
 * The geometry is `panes.dropIntentAt`, which is where it can be tested; this
 * is the two things that need a DOM.
 *
 * **A drop on the target's own strip is always a swap.** The gesture is carried
 * *by* a strip, so strip-to-strip is the motion a writer makes without being
 * taught it — and a strip sits at the top of its pane, which is to say squarely
 * inside the "up" band. The most natural aim in the whole gesture was the one
 * that reliably split the window instead of swapping it, which is most of what
 * *"it tends to split in half the other way, not switch"* is describing.
 */
function dropIntent(section: HTMLElement, x: number, y: number): panes.Side | "swap" {
  const head = section.querySelector<HTMLElement>(":scope > .pane-head");
  if (head) {
    const hb = head.getBoundingClientRect();
    if (y >= hb.top && y <= hb.bottom && x >= hb.left && x <= hb.right) return "swap";
  }
  const box = section.getBoundingClientRect();
  return panes.dropIntentAt(box.width, box.height, x - box.left, y - box.top);
}

/** The pane the pointer is over, if it is over one. */
function paneUnderPointer(x: number, y: number): { id: string; section: HTMLElement } | null {
  for (const node of document.elementsFromPoint(x, y)) {
    const section = (node as HTMLElement).closest?.<HTMLElement>("[data-pane]");
    if (section) return { id: section.dataset.pane!, section };
  }
  return null;
}

/**
 * Carry this pane by its strip.
 *
 * The pointer is captured on the strip, so every move and the release come back
 * here whatever they pass over — including the middle of another pane's editor,
 * which is the target that drag-and-drop could never be given.
 */
function wirePaneDrag(pane: panes.Leaf, head: HTMLElement) {
  head.addEventListener("pointerdown", (e: PointerEvent) => {
    // Left button only, and never from a control: the strip is full of buttons
    // and a press on one of them is a press on it.
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let lit: HTMLElement | null = null;
    activePane = pane.id;

    const clear = () => {
      lit?.classList.remove("pane-drop");
      lit?.removeAttribute("data-drop");
      lit?.removeAttribute("data-drop-label");
      lit = null;
    };

    const move = (m: PointerEvent) => {
      if (!dragging) {
        if (Math.abs(m.clientX - startX) < DRAG_SLOP && Math.abs(m.clientY - startY) < DRAG_SLOP) return;
        dragging = true;
        // Capture so the move and the release come back here whatever they pass
        // over — including the middle of another pane's editor, which is the
        // target the old drag-and-drop could never be given. Guarded because a
        // pointer that has already been released or cancelled makes this throw,
        // and a throw here would leave the drag half-started with no way out.
        try {
          head.setPointerCapture(m.pointerId);
        } catch {
          /* the pointer is gone; the window listeners still finish the drag */
        }
        document.body.classList.add("dragging-pane");
      }
      const over = paneUnderPointer(m.clientX, m.clientY);
      if (!over || over.id === pane.id) {
        clear();
        return;
      }
      if (lit !== over.section) clear();
      lit = over.section;
      lit.classList.add("pane-drop");
      // Which of the two things a release would do, said on the target itself
      // so the reader is never guessing. `styles.css` draws the edge bands.
      const intent = dropIntent(over.section, m.clientX, m.clientY);
      lit.dataset.drop = intent;
      // In words as well as in the picture. The wash says *where* the carried
      // pane would land and the band draws it, but "the whole pane is lit" and
      // "the top third is lit" are only distinguishable if you already know the
      // rule — and a writer who has just been surprised by a split is the one
      // person who does not.
      lit.dataset.dropLabel = intent === "swap" ? t("dropSwap") : t("dropMove");
    };

    const up = (u: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("dragging-pane");
      if (head.hasPointerCapture?.(u.pointerId)) head.releasePointerCapture(u.pointerId);
      const intent = lit?.dataset.drop as panes.Side | "swap" | undefined;
      const target = lit?.dataset.pane;
      clear();
      if (!dragging || !target || target === pane.id) return;
      if (intent === "swap") swapPanes(pane.id, target);
      else if (intent) movePaneBeside(pane.id, target, intent);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}

/**
 * Put one pane on a given side of another, rather than trading them.
 *
 * The drop-on-an-edge gesture, and the operation `swap` cannot express: the
 * carried pane leaves its split — which collapses behind it — and takes its
 * place in a new split beside the target. `panes.moveToEdge` does the same thing
 * against the whole window; this does it against one pane, which is what a
 * pointer over that pane means.
 */
function movePaneBeside(id: string, targetId: string, side: panes.Side) {
  const moved = panes.find(paneTree, id);
  if (!moved || id === targetId) return;
  const without = panes.closePane(paneTree, id);
  // The only pane there is: nothing to move it beside.
  if (without === paneTree) return;
  // The target may have been the sibling that took the collapsed split's space,
  // so it is looked for in the tree the move actually starts from.
  if (!panes.find(without, targetId)) return;
  const vertical = side === "up" || side === "down";
  const layout = paneLayout();
  const first = vertical ? side === "up" : layout.rtl ? side === "right" : side === "left";
  const next = panes.replaceLeaf(without, targetId, (target) => ({
    kind: "split" as const,
    id: panes.paneId(),
    dir: vertical ? ("col" as const) : ("row" as const),
    frac: 0.5,
    a: first ? moved : target,
    b: first ? target : moved,
  }));
  setTree(next);
  activePane = id;
  paneViews.get(id)?.focus();
  setStatus(t("paneMoved"), "ok");
}

/**
 * How the tree is being laid out at this moment, for the directional commands.
 *
 * Both answers are read off the rendering rather than assumed, and both have
 * bitten something before:
 *
 *   • **Direction.** A flex row lays its first child out on the right when the
 *     container is right-to-left. `main` is forced `direction: ltr` today —
 *     deliberately, so that pane *positions* are physical while the text inside
 *     each pane reads in its own direction — which makes `a` the left pane in
 *     Hebrew as well as in English. That is a fact about a stylesheet and not
 *     about this module, so it is read rather than assumed: the day somebody
 *     mirrors the window, the arrow keys follow it on their own.
 *   • **Stacking.** Under 900px `styles.css` turns every split into a column
 *     whatever it was built as. Asked of a real `.pane-split` instead of a
 *     `matchMedia` with `900` typed into it, because a breakpoint written down
 *     twice is a breakpoint that will be moved once.
 */
function paneLayout(): panes.Layout {
  const row = document.querySelector<HTMLElement>('.pane-split[data-dir="row"]');
  const box = row ?? document.querySelector<HTMLElement>("main");
  return {
    rtl: !!box && getComputedStyle(box).direction === "rtl",
    stacked: !!row && getComputedStyle(row).flexDirection.startsWith("column"),
  };
}

/** Trade two panes' places, and say so. */
function swapPanes(a: string, b: string) {
  const next = panes.swap(paneTree, a, b);
  if (next === paneTree) return;
  setTree(next);
  // The pane the writer was in went somewhere; keeping it active means a second
  // press of the same key brings it back rather than picking up its new
  // neighbour. `setTree` rebuilds the DOM, so the focus has to be asked for
  // again — a swap that lands the caret in another pane would be a swap that
  // moved the writer as well as the window.
  activePane = a;
  paneViews.get(a)?.focus();
  setStatus(t("swapped"), "ok");
}

/** Swap the pane the writer is in with the one on a given side of it. */
function swapPaneToward(side: panes.Side): boolean {
  const here = currentPane();
  if (!here) return true;
  const there = panes.neighbor(paneTree, here, side, paneLayout());
  // Nothing on that side. Said out loud rather than swallowed: a key that does
  // nothing in silence is indistinguishable from one that is broken, which is
  // how the whole of this session's list of complaints started.
  if (!there) {
    setStatus(t("noPaneThatWay"), "");
    return true;
  }
  swapPanes(here, there);
  return true;
}

function splitterFor(node: panes.Split): HTMLElement {
  const bar = el("div", {
    class: "splitter",
    role: "separator",
    tabindex: "0",
    "aria-label": t("previewSide"),
  });
  let dragging = false;
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const box = bar.parentElement!.getBoundingClientRect();
    const frac =
      node.dir === "row" ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height;
    // The tree is the authority, and the DOM follows it — so a drag survives a
    // rebuild rather than being a style somebody set once.
    paneTree = panes.resize(paneTree, node.id, frac);
    const live = panes.splits(paneTree).find((s) => s.id === node.id)!;
    (bar.previousElementSibling as HTMLElement).style.flex = `${live.frac} 1 0`;
    (bar.nextElementSibling as HTMLElement).style.flex = `${1 - live.frac} 1 0`;
  };
  const onUp = () => {
    dragging = false;
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    rememberPanes();
  };
  bar.addEventListener("pointerdown", (e) => {
    dragging = true;
    (e as PointerEvent).preventDefault();
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
  return bar;
}

/**
 * Scroll, remembered per pane and optionally tied to a sibling's.
 *
 * The link is per pane and off by default on a pane a writer opened deliberately
 * to look somewhere else, which is the only default that makes the feature worth
 * having: a second view whose scroll follows the first is the first view again.
 */
// ---------------------------------------------------------------- linked scroll
//
// # The defect this shape exists to close
//
// Linked scrolling used to be guarded by a boolean: set `mirroring`, write the
// other pane's `scrollTop`, clear `mirroring` in a `finally`. **That guard never
// guarded anything**, and the writer reported the result as the worst thing in
// the application: *"the scroll is terrible and it stutters on the preview. This
// makes the source also stutter."*
//
// A scroll event is not dispatched when `scrollTop` is assigned. It is queued
// and delivered later, at frame time — so by the time the other pane's handler
// ran, the `finally` had already put `mirroring` back to `false`. Every write
// therefore came back as an event indistinguishable from a person scrolling,
// and the two panes spent the whole scroll answering each other. Measured on a
// real document, forty wheel notches of 50px each:
//
//   • **67 scroll events for 40 notches**, and the two panes converging on each
//     other in between.
//   • The source travelled **1086px of the 2000px asked for** — the sync ate
//     nearly half of every scroll, because each echo dragged the reader back
//     toward where the *preview* thought they should be.
//   • Worst frame **591 ms**, against 38 ms with the link switched off. The
//     echoes were forcing CodeMirror to re-measure and the preview to re-draw
//     pages several times per frame.
//
// # The shape now: somebody is driving
//
// A boolean cannot express this because the question is not *are we inside a
// mirror* — it is *whose scroll is this*. So:
//
//   • The pane a person is actually scrolling **takes the floor**, and holds it
//     for `SCROLL_FLOOR_MS` past its last event. While it is held, every other
//     pane's scroll events are echoes by definition and are ignored.
//   • A write is also **remembered exactly**, and an event arriving at that
//     value is an echo whoever holds the floor. This is what makes the floor
//     short: the timer is a backstop for rounding, not the mechanism.
//   • The follow itself is **batched into one animation frame**. Scroll events
//     can outpace frames, and syncing per event meant several `lineBlockAtHeight`
//     measurements — each of which can force layout — for one frame of movement.
//
// The two together mean a linked pane follows and never talks back, which is
// what "linked" was always supposed to mean.

/**
 * How long the pane being scrolled keeps the floor after its last event.
 *
 * Long enough to cover the gap between a scroll event and the echo it provokes,
 * which is a frame or two; short enough that moving the mouse to the other pane
 * and scrolling it does not feel refused. Renewed on every event of the pane
 * that holds it, so a continuous scroll holds the floor for as long as it lasts.
 */
const SCROLL_FLOOR_MS = 150;

/** The pane whose scroll everything else is currently following. */
let scrollFloor: { pane: string; until: number } | null = null;

/**
 * What was last written into each pane's scroller, by us and not by a person.
 *
 * Read back after the assignment rather than stored as the value asked for: the
 * browser clamps a scroll to the scrollable range, so asking for 90,000 and
 * remembering 90,000 would leave the echo at 16,000 looking like a person.
 */
const scrollWritten = new Map<string, number>();

/** The follow booked for the next frame, if one is booked. */
let scrollBooked: {
  from: panes.Leaf;
  to: panes.Leaf;
  top: number;
  /** Which way the pane that is leading moved: `+1` down, `-1` up. */
  dir: -1 | 0 | 1;
} | null = null;
let scrollFrame = 0;

function wirePaneScroll(pane: panes.Leaf, host: HTMLElement) {
  const scroller = () =>
    pane.role === "source" ? (paneViews.get(pane.id)?.scrollDOM ?? host) : host;
  host.addEventListener(
    "scroll",
    () => {
      const top = scroller().scrollTop;
      const now = performance.now();

      // Our own write coming back. Recorded — this pane really is at that
      // position — but it claims no floor and starts no follow, because the
      // only reason it moved is that some other pane moved first.
      const echo = scrollWritten.get(pane.id);
      if (echo !== undefined && Math.abs(top - echo) <= 1) {
        scrollWritten.delete(pane.id);
        pane.scrollTop = top;
        return;
      }
      // Somebody else is driving and this is not the value we wrote — a
      // rounding-off echo, or a follow that overshot into another follow.
      // Either way it is not a person, and treating it as one is the loop.
      if (scrollFloor && scrollFloor.pane !== pane.id && now < scrollFloor.until) return;

      // **The dead zone.** A trackpad emits an event for a two-pixel drift and
      // following one is a preview that shivers while a hand rests on the pad.
      // Read before the floor is claimed, so a shiver does not make this pane
      // the leader either — otherwise the drift would lock the *other* pane out
      // for the length of the floor while doing nothing itself.
      const was = pane.scrollTop ?? top;
      const moved = top - was;
      if (!worthFollowing(moved, settings.syncDeadZone)) return;

      scrollWritten.delete(pane.id);
      scrollFloor = { pane: pane.id, until: now + SCROLL_FLOOR_MS };
      pane.scrollTop = top;
      // Down or up, which is what the anchor is chosen from. Zero only if the
      // pane genuinely has not moved, which the dead zone has already excluded.
      const dir: -1 | 0 | 1 = moved > 0 ? 1 : moved < 0 ? -1 : 0;
      // Both halves, and they are not the same claim. `linked` says these two
      // panes are a pair — an arrangement, remembered with the tab. The setting
      // says pairs follow each other at all, and until now it said nothing:
      // "synced scrolling" was the one checkbox in the application that could
      // not turn synced scrolling off.
      if (settings.syncScroll === false) return;
      if (!pane.linked) return;
      const other = panes.sibling(paneTree, pane.id);
      if (!other || !other.linked) return;
      bookLinkedScroll(pane, other, top, dir);
    },
    true,
  );
}

/**
 * Follow, once, on the next frame.
 *
 * Overwritten rather than queued: two scroll events in one frame mean the reader
 * is somewhere newer, and following the older position first would be work done
 * to be immediately undone.
 */
function bookLinkedScroll(from: panes.Leaf, to: panes.Leaf, top: number, dir: -1 | 0 | 1 = 0) {
  scrollBooked = { from, to, top, dir };
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const job = scrollBooked;
    scrollBooked = null;
    if (!job) return;
    // Re-read the panes: an arrangement can change between the event and the
    // frame, and writing into a pane that has been closed is a null dereference
    // in the middle of a scroll.
    const live = panes.find(paneTree, job.to.id);
    if (!live || !live.linked || !panes.find(paneTree, job.from.id)) return;
    const target = live.role === "source" ? paneViews.get(live.id)?.scrollDOM : paneHostOf(live.id);
    if (!target) return;
    syncLinkedScroll(job.from, live, job.top, target, job.dir ?? 0);
    // Estimate now, exact when the hand stops. See `settleExactly`.
    settleExactly(job.from, live, job.dir ?? 0);
    // What we wrote, as the browser actually clamped it, so the echo is
    // recognised. See `scrollWritten`.
    scrollWritten.set(live.id, target.scrollTop);
  });
}

/**
 * Once the hand stops, put the preview where the sefer actually printed.
 *
 * **Estimate while moving, exact when it settles.** The follow above reads
 * `scrollmap.ts`'s printed map, which is a line-height model: it costs nothing,
 * it is continuous, and it is an estimate — a page break, a note band, a figure
 * or a fold all move the real answer away from it, and on a long sefer the
 * error accumulates down the page. The exact answer is the compiler's, and
 * asking it per scroll event would be a layout per frame.
 *
 * So the estimate lands immediately and this settles afterwards, at
 * `syncSettleMs` after the last movement — one layout per gesture rather than
 * one per frame.
 *
 * Only source → preview: the map's error is the *printed* position of a source
 * line, and the other direction has no compiler question to ask. And only while
 * nothing else has taken the floor, so a settle that arrives after the writer
 * has started scrolling something else is dropped rather than yanking the pane
 * out from under them.
 */
let settleTimer = 0;
function settleExactly(from: panes.Leaf, to: panes.Leaf, dir: -1 | 0 | 1) {
  clearTimeout(settleTimer);
  if (settings.syncExact === false) return;
  if (from.role !== "source" || to.role !== "preview") return;
  const delay = Math.max(0, settings.syncSettleMs ?? 150);
  settleTimer = window.setTimeout(() => {
    void settleNow(from, to, dir);
  }, delay);
}

async function settleNow(from: panes.Leaf, to: panes.Leaf, dir: -1 | 0 | 1) {
  const view = paneViews.get(from.id);
  const host = paneHostOf(to.id);
  // The arrangement can change between the gesture and the settle.
  if (!view || !host || !runtime.backend) return;
  if (!panes.find(paneTree, from.id) || !panes.find(paneTree, to.id)) return;
  const pages = currentPages();
  if (!pages.length) return;
  const mp = matchFraction(dir);
  // The line at the pane's own match point — the same anchor the estimate used,
  // so the settle is a correction to it rather than a different question.
  const anchorY = view.scrollDOM.scrollTop + mp * view.scrollDOM.clientHeight;
  const block = view.lineBlockAtHeight(anchorY);
  const line = view.state.doc.lineAt(block.from);
  const { body, offset } = bodyOnScreen();
  const points = await runtime.backend
    .reveal(
      body,
      docConfig(),
      { line: line.number + offset, column: 1 },
      docs.requestAssets(runtime.currentDoc?.assets ?? []),
    )
    // A line that prints nothing — a comment, a `#הגדרות_*` line, a fold's
    // marker — is not an error and not worth a word in the status bar. The
    // estimate stands, which is what it is for.
    .catch(() => []);
  const at = points[0];
  const box = at ? pageBox(pages[at.page]) : null;
  if (!at || !box) return;
  // Somebody started scrolling while the compiler was thinking. Their gesture
  // wins: a preview that jumps a second after you have moved on is worse than
  // one that is a few pixels out.
  if (scrollFloor && scrollFloor.pane !== from.id && performance.now() < scrollFloor.until) return;
  const node = host.querySelector<HTMLElement>(`.page[data-page="${at.page}"]`);
  if (!node) return;
  const spot = pixelInPage(at, node.getBoundingClientRect(), box);
  const y = node.offsetTop + spot.y - mp * host.clientHeight;
  const want = clampScroll(y, host);
  if (Math.abs(want - host.scrollTop) < 1) return;
  host.scrollTop = want;
  // Our own write, so the pane's own handler recognises the echo rather than
  // treating the settle as a person scrolling and following it back.
  scrollWritten.set(to.id, host.scrollTop);
}

function paneHostOf(id: string): HTMLElement | null {
  return document.getElementById(`pane-host-${id}`);
}

/** What a pane is narrowed to, asked of the pane rather than of the editor. */
function paneNarrow(id: string): Span | null {
  const v = paneViews.get(id);
  return v ? narrowedTo(v.state) : null;
}

/**
 * Move a linked pane to where its partner is, in the currency each understands.
 *
 * Two source panes, or two previews, are the same kind of thing and follow each
 * other by fraction. A source and a preview are not, and go through the printed
 * map in `scrollmap.ts` for the reason that module exists: a fraction of the
 * source's pixels is not a fraction of the printed pixels in any document with
 * comments or folds in it.
 */
function syncLinkedScroll(
  from: panes.Leaf,
  to: panes.Leaf,
  top: number,
  target: HTMLElement,
  dir: -1 | 0 | 1 = 0,
) {
  if (from.role === to.role) {
    const src = from.role === "source" ? paneViews.get(from.id)!.scrollDOM : paneHostOf(from.id)!;
    target.scrollTop = (top / Math.max(1, src.scrollHeight)) * target.scrollHeight;
    return;
  }
  // Where the two panes line up — the top, middle or bottom of the viewport.
  // The line at this point of one side is put at the same point of the other,
  // so a writer who sets it to the middle watches the line they are on stay put
  // in both panes rather than at the very top edge.
  const mp = matchFraction(dir);
  if (from.role === "source") {
    const view = paneViews.get(from.id)!;
    // The point `mp` down the source viewport, in document pixels.
    const anchorY = top + mp * view.scrollDOM.clientHeight;
    // The printed fraction of *that pixel* — not of the line it lands in. The
    // map answers per line, so a raw `fractionAtLine` moves the preview only when
    // the anchor crosses a line boundary and holds it still in between, which is
    // the "does not scroll smoothly at all" the report was about: the preview
    // jumps a line's worth at a time. Interpolating between this line's fraction
    // and the next by how far the anchor is *through* the line's height makes the
    // follow continuous.
    const block = view.lineBlockAtHeight(anchorY);
    const lineNo = view.state.doc.lineAt(block.from).number - 1;
    const within = block.height > 0 ? clamp01((anchorY - block.top) / block.height) : 0;
    const map = printedMap();
    const frac = lerp(fractionAtLine(map, lineNo), fractionAtLine(map, lineNo + 1), within);
    target.scrollTop = clampScroll(frac * target.scrollHeight - mp * target.clientHeight, target);
  } else {
    const host = paneHostOf(from.id)!;
    const view = paneViews.get(to.id)!;
    const map = printedMap();
    const frac = (top + mp * host.clientHeight) / Math.max(1, host.scrollHeight);
    // The line the fraction reaches, and how far past that line's own printed
    // fraction it is — the same interpolation the other way, so scrolling the
    // preview glides the source rather than snapping it one line at a time.
    const lineNo = lineAtFraction(map, frac);
    const g0 = fractionAtLine(map, lineNo);
    const g1 = fractionAtLine(map, lineNo + 1);
    const within = g1 > g0 ? clamp01((frac - g0) / (g1 - g0)) : 0;
    const doc = view.state.doc;
    const block = view.lineBlockAt(doc.line(Math.max(1, Math.min(lineNo + 1, doc.lines))).from);
    const sourceY = block.top + within * block.height;
    target.scrollTop = clampScroll(sourceY - mp * target.clientHeight, target);
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clampScroll = (y: number, el: HTMLElement) =>
  Math.max(0, Math.min(y, el.scrollHeight - el.clientHeight));

/**
 * Move the preview to where the caret is — *"if the cursor is somewhere, that is
 * what should match."*
 *
 * Fired when the caret moves and nothing else, so it never fights a scroll: a
 * held arrow key or a click brings the preview to the caret's line, but dragging
 * the scrollbar does not, because dragging does not move the caret. Cheap on
 * purpose — it reads the printed map, not the compiler, so it costs nothing and
 * is safe to run on every cursor move. The exact, glyph-level answer is the
 * click-to-reveal, which is worth the layout because a click asks for it.
 *
 * Only the plain one-source-one-preview arrangement; a split window has more than
 * one of each and the scroll-floor follow already keeps those in step.
 */
let caretFollowTimer = 0;
function followCaretInPreview() {
  if (settings.followCaret === false) return;
  clearTimeout(caretFollowTimer);
  caretFollowTimer = window.setTimeout(() => {
    // Not while a pane is being scrolled by hand: that is the writer reading
    // somewhere the caret is not, and yanking the preview back is the opposite
    // of help.
    if (scrollFloor && performance.now() < scrollFloor.until) return;
    const hosts = document.querySelectorAll<HTMLElement>(".preview-host");
    if (hosts.length !== 1) return;
    const host = hosts[0];
    const view = runtime.view;
    if (!view) return;
    const head = view.state.selection.main.head;
    const lineNo = view.state.doc.lineAt(head).number - 1;
    const frac = fractionAtLine(printedMap(), lineNo);
    const mp = matchFraction();
    const at = clampScroll(frac * host.scrollHeight - mp * host.clientHeight, host);
    // Claim the floor and record the write so the preview's own scroll event —
    // which this assignment provokes — is recognised as an echo rather than a
    // person, the same way `bookLinkedScroll` does. `wirePaneScroll` keys on the
    // pane id, which is the host's element id with its prefix removed.
    const paneId = host.id.replace("pane-host-", "");
    scrollFloor = { pane: "caret", until: performance.now() + SCROLL_FLOOR_MS };
    scrollWritten.set(paneId, at);
    host.scrollTop = at;
  }, 100);
}

/** The viewport fraction the two panes line up on: 0 top, 0.5 middle, 1 bottom. */
/**
 * Where two linked panes line up, for a movement in this direction.
 *
 * `direction` — the default — is the report: *"scrolling down should match
 * top-to-top, scrolling up should match bottom-to-bottom"*. Going down, the
 * line the reader wants is the one arriving at the top of the pane; coming
 * back, it is the one arriving at the bottom. A fixed anchor is wrong in one of
 * the two directions by half a viewport, every time.
 *
 * `dir` is `+1` down, `-1` up, `0` when nobody is moving — a caret follow or a
 * click, which have no direction and take the middle.
 */
function matchFraction(dir: -1 | 0 | 1 = 0): number {
  return anchorFor(settings.syncMatch, dir);
}

// ------------------------------------------------------------ the pane menu
//
// Everything a pane can do that is not worth a glyph in its strip. The strip
// carries what a writer reaches for while writing — split, close, link — and
// this carries what they reach for while *arranging*, which is a rarer and more
// deliberate act.
//
// The reason it exists at all is the question the window could not answer:
// *"what if it gets more complicated?"*. The directional commands are fine for
// two panes and meaningless for six, so the operations here are all named by
// **number** instead of by side. A number works at any depth, and the strip
// prints each pane's own so the list can be read against the window.

/**
 * Open the ⋯ menu for a pane, under its button.
 *
 * Rebuilt on every open rather than kept: every row in it is a statement about
 * the arrangement as it stands right now, and a menu built once would offer to
 * swap with panes that have since been closed.
 */
function openPaneMenu(pane: panes.Leaf, at: HTMLElement) {
  const others = panes.leaves(paneTree).filter((l) => l.id !== pane.id);
  const layout = paneLayout();
  // The edge forms, not the list forms: these land inside a sentence.
  const SIDES: [panes.Side, string][] = [
    ["left", "edge.left"],
    ["right", "edge.right"],
    ["up", "edge.top"],
    ["down", "edge.bottom"],
  ];
  const rows: Node[] = [];

  // Swap with any pane, by number.
  if (others.length) {
    rows.push(el("div", { class: "menu-cat" }, [t("swapWithWhich")]));
    rows.push(el("div", { class: "menu-desc" }, [t("swapWithWhichDesc")]));
    for (const other of others) {
      rows.push(
        el("button", {
          class: "pal-item",
          "data-swap-with": String(paneNumberOf(other.id)),
          onClick: () => {
            closeFloating();
            swapPanes(pane.id, other.id);
          },
        }, [
          el("b", {}, [tf("swapWithPane", String(paneNumberOf(other.id)))]),
          el("span", { class: "menu-desc" }, [t(PANE_ROLE_NAME[other.role])]),
        ]),
      );
    }
    rows.push(el("div", { class: "menu-sep" }));

    // Move to an edge of the whole window — the operation a swap cannot express.
    rows.push(el("div", { class: "menu-cat" }, [t("movePaneTo")]));
    rows.push(el("div", { class: "menu-desc" }, [t("movePaneToDesc")]));
    for (const [side, label] of SIDES) {
      rows.push(
        el("button", {
          class: "pal-item",
          "data-move-edge": side,
          onClick: () => {
            closeFloating();
            const next = panes.moveToEdge(paneTree, pane.id, side, layout);
            if (next === paneTree) return;
            setTree(next);
            activePane = pane.id;
            setStatus(t("paneMoved"), "ok");
          },
        }, [el("b", {}, [tf("movePaneEdge", t(label))])]),
      );
    }
    rows.push(el("div", { class: "menu-sep" }));
  }

  // Move the pane out of this arrangement altogether.
  rows.push(el("div", { class: "menu-cat" }, [t("movePaneToTab")]));
  rows.push(el("div", { class: "menu-desc" }, [t("movePaneToTabDesc")]));
  const titleOf = (id: string) => docs.library().find((e) => e.id === id)?.title;
  tabs.all().forEach((tab, i) => {
    if (i === tabs.activeIndex()) return;
    rows.push(
      el("button", {
        class: "pal-item",
        "data-move-tab": String(i),
        onClick: () => {
          closeFloating();
          movePaneToTab(pane, i);
        },
      }, [el("b", {}, [tabs.label(tab, titleOf, t("untitled"))])]),
    );
  });
  rows.push(
    el("button", {
      class: "pal-item",
      "data-move-tab": "new",
      onClick: () => {
        closeFloating();
        movePaneToTab(pane, -1);
      },
    }, [el("b", {}, [t("movePaneToNewTab")])]),
    el("div", { class: "menu-sep" }),
    el("button", {
      class: "pal-item",
      "data-save-arrangement": "",
      onClick: () => {
        closeFloating();
        void saveArrangementHere();
      },
    }, [
      el("b", {}, [t("saveArrangement")]),
      el("span", { class: "menu-desc" }, [t("saveArrangementDesc")]),
    ]),
  );

  // Anchored under the button, and clamped to the window: the strip of the
  // bottom-right pane is a few pixels from two edges, and a menu that opened
  // off-screen there would be a menu that pane never has.
  const box = el("div", { class: "spell-menu pane-menu" }, rows) as HTMLElement;
  const anchor = at.getBoundingClientRect();
  box.style.visibility = "hidden";
  mountPanel("pane-menu", box, document.body);
  const size = box.getBoundingClientRect();
  const pad = 8;
  const left = Math.max(pad, Math.min(anchor.left, window.innerWidth - size.width - pad));
  const top =
    anchor.bottom + size.height + pad < window.innerHeight
      ? anchor.bottom + 4
      : Math.max(pad, anchor.top - size.height - 4);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.visibility = "";
}

/** Shut the pane menu, from a row that has just done something. */
function closeFloating() {
  closePanel("pane-menu");
}

/** The pane roles, named for a list rather than for a strip. */
const PANE_ROLE_NAME: Record<string, string> = {
  source: "source",
  preview: "preview",
  outline: "outlinePane",
  notes: "notesPaneRole",
  marks: "marksPane",
};

/**
 * Move a pane into another arrangement — an existing tab, or a new one.
 *
 * **The document is not touched.** A tab holds a pane tree and nothing else that
 * matters (see `tabs.ts`), and the open set is global, so a pane arriving in
 * another tab arrives showing a document that was already open. That is what
 * makes this a window operation rather than a document one, and why the pane
 * keeps its id: `paneplaces` remembers where it was standing in each document,
 * and a pane that changed identity on the way would forget.
 *
 * Refused for the last pane in an arrangement. A tab with no panes is not a
 * state this application has — the same rule `closePane` holds — and saying so
 * is more useful than silently leaving the pane where it is.
 */
function movePaneToTab(pane: panes.Leaf, index: number) {
  const without = panes.closePane(paneTree, pane.id);
  if (without === paneTree) {
    setStatus(t("cannotMoveLastPane"), "warn");
    return;
  }
  const carried = panes.find(paneTree, pane.id);
  if (!carried) return;
  // This arrangement first, so the tab being left is stored without the pane
  // before anything switches. `stash` writes into the active tab, which is still
  // this one.
  paneTree = without;
  tabs.stash(paneTree, focusedPane);

  const named = (tab: tabs.Tab) =>
    tabs.label(tab, (id) => docs.library().find((e) => e.id === id)?.title, t("untitled"));
  const all = tabs.all();
  if (index < 0 || index >= all.length) {
    // A new tab holding just this pane. `add` puts it after the current one and
    // makes it active, which is what "move it there" means — you go with it, so
    // there is no `selectTab` to call and the window is drawn from here.
    const made = tabs.add(carried, carried.id);
    paneTree = made.tree;
    focusedPane = made.focusedPane;
    renderPanes();
    refreshTabStrip();
    rememberPanes();
    scheduleCompile();
    setStatus(tf("movedToTab", named(made)), "ok");
    return;
  }
  const target = all[index];
  // Down the side of whatever is already there, which is the one answer that
  // needs no question asked: it is where a new pane goes when the window is
  // split, and it never displaces what the tab was arranged to show.
  target.tree = {
    kind: "split",
    id: panes.paneId(),
    dir: "row",
    frac: 1 - panes.EDGE_SHARE,
    a: target.tree,
    b: carried,
  };
  target.focusedPane = carried.id;
  selectTab(index);
  setStatus(tf("movedToTab", named(target)), "ok");
}

// ------------------------------------------------- arrangements of one's own
//
// The shipped six are the common shapes. What they cannot be is *the one this
// writer built* — gemara in one pane, their kuntres in another, the printed page
// underneath — and an arrangement that takes four gestures to build and is gone
// at the next restart is one nobody builds twice.
//
// Stored as the tree itself, with fresh ids minted on the way back in. Two tabs
// opened from one saved arrangement must not share pane ids: `paneplaces` is
// keyed by pane id, and two panes claiming to be the same one would each be
// standing where the other left off.

interface SavedArrangement {
  id: string;
  name: string;
  tree: panes.PaneNode;
}

/** The writer's own arrangements, as storage has them. */
function savedArrangements(): SavedArrangement[] {
  const raw = settings.savedArrangements;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is SavedArrangement =>
      !!a && typeof a === "object" && typeof (a as SavedArrangement).name === "string" && !!(a as SavedArrangement).tree?.kind,
  );
}

/**
 * Every pane id in a tree replaced with a new one.
 *
 * Not an optimisation and not tidiness: pane ids key `paneplaces`, the table of
 * where each pane was standing in each document, and the renderer decides which
 * editors it may leave alone by comparing leaves. A saved tree used twice with
 * its stored ids would give two live panes one identity, and they would fight
 * over one remembered place.
 */
function withFreshIds(node: panes.PaneNode): panes.PaneNode {
  if (node.kind === "leaf") return { ...node, id: panes.paneId() };
  return { ...node, id: panes.paneId(), a: withFreshIds(node.a), b: withFreshIds(node.b) };
}

/** Keep the window as it stands now, under a name. */
async function saveArrangementHere() {
  const name = (await askText(t("arrangementName"), ""))?.trim();
  if (!name) return;
  const list = savedArrangements();
  // A name used twice replaces, rather than making two rows a writer cannot
  // tell apart. Saving over one is what somebody typing the same name means.
  const kept: SavedArrangement = { id: `sa${Date.now().toString(36)}`, name, tree: withFreshIds(paneTree) };
  const at = list.findIndex((a) => a.name === name);
  if (at >= 0) list[at] = { ...kept, id: list[at].id };
  else list.push(kept);
  settings.savedArrangements = list;
  saveSettings();
  setStatus(tf("arrangementSaved", name), "ok");
}

/** The writer's own arrangements, as rows in the picker. */
function savedArrangementRows(): Node[] {
  const mine = savedArrangements();
  if (!mine.length) return [];
  return [
    el("div", { class: "menu-cat" }, [t("myArrangements")]),
    ...mine.map((a) =>
      el("div", { class: "pal-row" }, [
        el("button", {
          class: "pal-item",
          "data-saved-arrangement": a.name,
          onClick: () => {
            closePanel("arrangement");
            settings.pageView = false;
            applyPageView();
            setTree(withFreshIds(a.tree));
            rerenderChrome();
          },
        }, [el("b", {}, [a.name])]),
        glyphBtn(
          "×",
          t("forgetArrangement"),
          () => {
            settings.savedArrangements = savedArrangements().filter((x) => x.id !== a.id);
            saveSettings();
            openArrangements();
          },
          "pal-x",
        ),
      ]),
    ),
    el("div", { class: "menu-sep" }),
  ];
}

/**
 * The arrangements this application ships, as a list to choose from.
 *
 * A **picker**, and that is the whole of what replaced the two chips that used
 * to cycle. Every option is on screen at once with the one you are in marked, so
 * choosing costs one press and choosing wrong costs one more — where a cycle of
 * four cost up to seven and never showed you what you were choosing between.
 *
 * The page view sits in the same list, because from a writer's side it is the
 * same kind of choice: what the window looks like. It is not an arrangement
 * underneath — it is a source pane dressed as a sheet of paper — and keeping
 * that distinction in the code while hiding it in the interface is the right way
 * round.
 */
function openArrangements() {
  const here = panes.arrangementOf(paneTree);
  const list = document.getElementById("arrangement-list")!;
  list.replaceChildren(
    el("div", { class: "menu-cat" }, [t("arrangement")]),
    ...panes.ARRANGEMENTS.map((a) =>
      el(
        "button",
        {
          class: "pal-item" + (a.id === here && !settings.pageView ? " active" : ""),
          onClick: () => {
            closePanel("arrangement");
            settings.pageView = false;
            applyPageView();
            setTree(a.build());
            rerenderChrome();
          },
        },
        [
          el("b", {}, [(a.id === here && !settings.pageView ? "● " : "") + t("arr." + a.id)]),
          el("span", { class: "menu-desc" }, [t("arrDesc." + a.id)]),
        ],
      ),
    ),
    el("div", { class: "menu-sep" }),
    ...savedArrangementRows(),
    // Keeping the window as it stands, beside the list it will appear in.
    el(
      "button",
      {
        class: "pal-item",
        "data-save-arrangement": "",
        onClick: () => {
          closePanel("arrangement");
          saveArrangementHere();
        },
      },
      [
        el("b", {}, [t("saveArrangement")]),
        el("span", { class: "menu-desc" }, [t("saveArrangementDesc")]),
      ],
    ),
    el("div", { class: "menu-sep" }),
    // Swapping, where the arrangements are — because "which pane is on which
    // side" is the same question as "what does the window look like", and a
    // writer who wants the preview on the other side comes here to look for it.
    //
    // The rows are the four commands themselves, each printing its own key, so
    // this is a place to *discover* the keyboard rather than a second interface
    // that has to be kept in step with it. Only with something to swap: at one
    // pane the whole section would be four rows that do nothing.
    ...(panes.leaves(paneTree).length > 1 ? swapRows() : []),
    // **The route to a second arrangement that is not inside the tab strip.**
    //
    // The strip hides itself at one tab, which is right — a row of chrome
    // showing a single tab says nothing — but the `+` lives in the strip, so
    // with the strip hidden there would be no way to make a second arrangement
    // at all. The record is explicit that the strip "must never be the only
    // route in"; this is the other one, and `newTab` is bound to a key besides.
    el(
      "button",
      {
        class: "pal-item",
        onClick: () => {
          closePanel("arrangement");
          newTab();
        },
      },
      [el("b", {}, [t("newTab")]), el("span", { class: "menu-desc" }, [t("newTabDesc")])],
    ),
    el("div", { class: "menu-sep" }),
    el(
      "button",
      {
        class: "pal-item" + (settings.pageView ? " active" : ""),
        onClick: () => {
          closePanel("arrangement");
          settings.pageView = true;
          applyPageView();
          setTree(panes.ARRANGEMENTS.find((a) => a.id === "sourceOnly")!.build());
          rerenderChrome();
        },
      },
      [
        el("b", {}, [(settings.pageView ? "● " : "") + t("arr.page")]),
        el("span", { class: "menu-desc" }, [t("arrDesc.page")]),
      ],
    ),
  );
  openPanel("arrangement");
}

/**
 * The four swap commands, as rows in the arrangement panel.
 *
 * A row is greyed when there is no pane on that side, and it is greyed rather
 * than dropped: a list whose length changes as the caret moves between panes is
 * a list nobody can learn. Which side is which is read through `paneLayout`, so
 * in Hebrew "left" is the pane on the left of the screen.
 */
function swapRows(): Node[] {
  const here = currentPane();
  const layout = paneLayout();
  const SIDES: [panes.Side, string][] = [
    ["left", "side.left"],
    ["right", "side.right"],
    ["up", "side.top"],
    ["down", "side.bottom"],
  ];
  return [
    el("div", { class: "menu-cat" }, [t("swapPanes")]),
    el("div", { class: "menu-desc" }, [t("swapPanesDesc")]),
    ...SIDES.map(([side, label]) => {
      const there = here ? panes.neighbor(paneTree, here, side, layout) : undefined;
      return el(
        "button",
        {
          class: "pal-item",
          disabled: there ? undefined : "",
          "data-swap": side,
          onClick: () => {
            closePanel("arrangement");
            swapPaneToward(side);
          },
        },
        [
          el("b", {}, [t(label)]),
          el("span", { class: "menu-desc" }, [hintFor(`pane.swap${side[0].toUpperCase()}${side.slice(1)}`)]),
        ],
      );
    }),
    el("div", { class: "menu-sep" }),
  ];
}

/** Dress the source pane as a sheet of paper, or stop. */
function applyPageView() {
  const app = document.getElementById("app")!;
  if (settings.pageView) app.dataset.page = "1";
  else delete app.dataset.page;
  saveSettings();
}

/** Change the arrangement, redraw, and remember it. */
/**
 * Show one region of the window and hide the rest, with classes only.
 *
 * The walk is up the DOM from the zoomed node to `<main>`: at every split on
 * the way, the child that is *not* on the path is hidden, and the splitter with
 * it — a drag handle for a pane nobody can see is a way to resize the window to
 * something the writer cannot check.
 *
 * Everything hidden is still there, still holding its editor and still being
 * drawn into. That costs a little work per compile and buys the property that
 * makes zoom worth having: coming back out is free and exact.
 *
 * A stale id — the pane was closed, or the arrangement changed under it — is
 * simply no zoom. It cannot be an error state: the alternative is a window
 * showing a region that no longer exists, which is a blank frame.
 */
function applyPaneZoom() {
  const main = document.querySelector("main");
  if (!main) return;
  for (const el of main.querySelectorAll(".pane-hidden")) el.classList.remove("pane-hidden");
  for (const el of main.querySelectorAll(".pane-zoomed")) el.classList.remove("pane-zoomed");
  main.classList.toggle("has-zoom", zoomedNode !== null);
  if (!zoomedNode) return;
  const node = main.querySelector<HTMLElement>(`[data-node="${zoomedNode}"]`);
  if (!node) {
    // The zoom outlived its region. Say so in the state as well as on screen,
    // or the next press of the key walks a chain from a node that is gone.
    zoomedNode = null;
    main.classList.remove("has-zoom");
    return;
  }
  node.classList.add("pane-zoomed");
  for (let el: HTMLElement | null = node; el && el !== main; el = el.parentElement) {
    for (const kid of Array.from(el.parentElement?.children ?? [])) {
      if (kid !== el) kid.classList.add("pane-hidden");
    }
  }
}

/**
 * One key, widening by one region each press.
 *
 * *"There should be an easier way to zoom in on a window — it should be with
 * its split etc"*, and the second clause is the part that decides the shape.
 * Zoom-one-pane is the obvious feature and it is not what was asked for: a
 * writer reading a sefer in two columns wants both columns big. So the thing
 * being zoomed is a **region** — the pane, then the pane with what it is split
 * against, and so on out to the window, which is the way back to normal.
 *
 * `panes.nextZoom` decides; this only draws. Which is why the walk is testable
 * without a DOM, and why the arithmetic of "what does the next press mean" is
 * not spread across a key handler and a button.
 */
function cyclePaneZoom() {
  zoomedNode = panes.nextZoom(paneTree, activePane ?? focusedPane, zoomedNode);
  applyPaneZoom();
  // The glyph on every head, not just this one: the button says which state the
  // *window* is in, and a zoomed window whose other heads still offer "zoom"
  // is the mute-surface failure this repository keeps rebuilding.
  //
  // Nothing is persisted. A zoom is a way of looking at an arrangement rather
  // than part of one, and a session that came back zoomed would be a session
  // that came back with panes missing.
  refreshPaneHeads();
}

function setTree(next: panes.PaneNode) {
  paneTree = next;
  renderPanes();
  rememberPanes();
  forgetClosedPanes();
  scheduleCompile();
}

/**
 * Drop the remembered places of panes that no longer exist.
 *
 * Swept from the tabs rather than wired into `closePane`, because closing a
 * pane is not the only way one goes: picking a different arrangement replaces
 * the whole tree, and a hand-wired forget at the one obvious call site is the
 * shape this repository keeps paying for. Every tab's tree, not this one's —
 * the other tabs' panes are alive and merely not on screen, and forgetting
 * them here would make switching tabs lose exactly what this whole item is
 * about.
 *
 * Run after `rememberPanes`, which stashes the current tree into the active
 * tab: before it, the tab still holds the arrangement that has just been
 * replaced and every new pane would look like a stranger.
 */
function forgetClosedPanes(): void {
  const live = new Set<string>();
  for (const tab of tabs.all()) for (const l of panes.leaves(tab.tree)) live.add(l.id);
  for (const pane of paneplaces.panesKnown()) if (!live.has(pane)) paneplaces.forgetPane(pane);
}

/** Persist the arrangement, so a restart comes back to the same window. */
function rememberPanes() {
  tabs.stash(paneTree, focusedPane);
  settings.tabs = tabs.serialise();
  saveSettings();
}

// ---------------------------------------------------------------- the tab strip
//
// A tab is an **arrangement**, not a document. See `tabs.ts` for the rule that
// makes that work and the three consequences that follow from it; what is here
// is the strip, which is deliberately small.
//
// It is not on screen with one tab. The very first observation in the marked-up
// inventory was that sixteen things compete for the top of the window before a
// word is typed, and a strip showing a single tab spends a row of chrome telling
// a writer something they can already see.

/** The strip, or nothing. */
function buildTabStrip(): HTMLElement {
  const strip = el("div", { class: "tabstrip", id: "tabstrip" });
  if (!tabs.stripVisible(settings.tabStrip ?? "always")) return strip;
  const titleOf = (id: string) => docs.library().find((e) => e.id === id)?.title;
  tabs.all().forEach((tab, i) => {
    const here = i === tabs.activeIndex();
    strip.append(
      el("div", { class: "tab" + (here ? " active" : "") }, [
        el(
          "button",
          {
            class: "tab-main",
            // Double-click to rename, which is where every tab strip ever built
            // puts it — and the moment an arrangement stops being a document
            // tab is the moment somebody wants to name it.
            onDblClick: () => renameTab(i),
            onClick: () => selectTab(i),
          },
          [tabs.label(tab, titleOf, t("untitled"))],
        ),
        // A `×`, and this is the one place in the application that keeps it for
        // closing. Closing a tab destroys nothing at all — every document it
        // showed is still open — which is why it can afford the glyph that
        // closing a *document* and deleting one both had to give up.
        glyphBtn(
          "×",
          t("closeTab"),
          (e: Event) => {
            e.stopPropagation();
            closeTab(i);
          },
          "tab-close",
        ),
      ]),
    );
  });
  strip.append(
    glyphBtn("+", t("newTab"), () => newTab(), "tab-new"),
  );
  return strip;
}

function refreshTabStrip() {
  document.getElementById("tabstrip")?.replaceWith(buildTabStrip());
}

/**
 * Point this arrangement's panes at a document.
 *
 * A pane's `docId` is what lets a tab name itself, and it is the difference
 * between two tabs that are genuinely two things and two tabs that are the same
 * view twice. Panes that named *no* document follow the focus, which is what
 * `null` means; a pane that named the document being left follows too, because a
 * writer switching document inside an arrangement means "show me this here".
 *
 * Mutated in place rather than rebuilt, deliberately: this runs on every
 * document switch, and going through `panes.update` would hand `renderPanes` a
 * new tree, which would destroy and rebuild every editor in the window — the
 * carets, the scroll and the folds of panes nobody touched — to change a label.
 */
function retargetPanes(from: string | null, to: string) {
  for (const l of panes.leaves(paneTree)) {
    if (l.docId === null || l.docId === from) l.docId = to;
  }
}

/**
 * A second arrangement, starting from the shipped one, showing `docId`.
 *
 * Every panel of it is pinned to that document, so the new tab is *a thing*
 * rather than a second window onto whatever happens to be focused — which is
 * what makes an arrangement worth naming and worth coming back to.
 *
 * It does not open the document; the three callers differ in exactly that, and
 * conflating them is how "new arrangement" would come to mean "and lose my
 * place". `newTab` shows what is already open, `openInNewTab` opens something
 * else into it, and `newDocTab` makes the document first.
 */
function newTabShowing(docId: string) {
  tabs.stash(paneTree, focusedPane);
  const tab = tabs.add(panes.defaultTree());
  paneTree = tab.tree;
  retargetPanes(null, docId);
  focusedPane = null;
  renderPanes();
  refreshTabStrip();
  rememberPanes();
}

/** A second arrangement onto the document already on screen. */
function newTab() {
  newTabShowing(runtime.currentDoc.id);
  scheduleCompile();
}

/**
 * That document, in an arrangement of its own.
 *
 * The second half of *"both an empty new tab and to open a doc in a new tab"*,
 * and it had no door at all: every route into a document — the Documents menu,
 * the switcher, the library — opened it **here**, over the arrangement the
 * writer was standing in. Which is the right default and was the only
 * behaviour, so comparing two seforim side by side in two tabs was a thing the
 * data model supported and the interface could not express.
 *
 * The arrangement is made first and the document opened into it, rather than
 * the other way round: opening first would put the second sefer over the first
 * one for as long as the compile takes, which is the flicker that makes a
 * writer think they lost their place.
 */
async function openInNewTab(docId: string) {
  closeMenus();
  const leaving = runtime.currentDoc?.id ?? null;
  newTabShowing(docId);
  // The same window as `selectTab`'s, and it is why this is not simply awaited:
  // `newTabShowing` has already drawn the new arrangement, and until `openDoc`
  // gets past its awaits that arrangement is showing the sefer being left.
  handOverPages(leaving, docId);
  await openDoc(docId, { handedOver: true });
}

/**
 * Open a document, the way the writer asked documents to open.
 *
 * **The one door.** Every route into a document used to call `openDoc`
 * directly, which puts the arriving sefer into the panes the writer was
 * standing in — the report *"opening a document replaces the one I had open"*,
 * true of the switcher, the Documents menu, the library, a file, an import, a
 * share link and a rescued draft alike. `openInNewTab` existed and was reachable
 * only from a `⧉` on two rows, so the capability was there and the default was
 * the wrong way round.
 *
 * `openIn` is the setting; see `Settings.openIn` for what the three answers
 * mean. This function is the only place that reads it, so a nineteenth route
 * into a document joins by calling this rather than by being remembered.
 *
 * What deliberately does **not** come through here: closing a document,
 * deleting one, `goToLastDoc`, and the session restore. Those pick a document
 * to show in an arrangement that already exists; a new tab for any of them is a
 * tab nobody asked for.
 */
async function enterDoc(docId: string) {
  const how = settings.openIn ?? "reuse";
  // Already the document on screen: nothing to open, whatever the setting says.
  // Without this, `newTab` makes a second arrangement onto the sefer you are
  // already reading every time you click its own row in the switcher.
  if (how !== "newTab" && runtime.currentDoc?.id === docId) return;
  if (how === "current") {
    await openDoc(docId);
    return;
  }
  if (how === "reuse") {
    // The active tab's tree lives in `paneTree` until it is stashed, so ask
    // about the arrangement as it *is*, not as it was when last left.
    tabs.stash(paneTree, focusedPane);
    const found = tabs.showing(docId);
    // `selectTab` no-ops on the tab already active, which is right for a tab
    // switch and wrong here: this arrangement can name a document the view is
    // not showing — a tab restored from the session before its document
    // arrived. So the active tab means "open it here", not "do nothing".
    if (found >= 0 && found !== tabs.activeIndex()) {
      selectTab(found);
      return;
    }
    if (found >= 0) {
      await openDoc(docId);
      return;
    }
  }
  await openInNewTab(docId);
}

/** A blank document, in an arrangement of its own. */
async function newDocTab() {
  closeMenus();
  await flushSaves();
  const doc = await docs.createDoc(t("untitled"), "");
  await openInNewTab(doc.id);
}

function selectTab(i: number) {
  if (i === tabs.activeIndex()) return;
  tabs.stash(paneTree, focusedPane);
  const tab = tabs.select(i);
  if (!tab) return;
  paneTree = tab.tree;
  focusedPane = tab.focusedPane;
  renderPanes();
  refreshTabStrip();
  rememberPanes();
  // **And the document it was showing.** A tab remembers the arrangement *and*
  // which document sat in each pane; restoring only the geometry gives a writer
  // back the shape of the window they left with somebody else's text in it,
  // which is worse than not restoring it at all. `openDoc` does nothing when the
  // document is already on screen, so switching between two tabs on one document
  // costs nothing.
  const want = tabs.focusedDoc(tab);
  if (want && want !== runtime.currentDoc?.id) {
    handOverPages(runtime.currentDoc?.id ?? null, want);
    void openDoc(want, { handedOver: true });
  } else scheduleCompile();
}

function closeTab(i: number) {
  // Stash first, or closing a tab that is not the active one writes the closed
  // tab's index over the active tab's arrangement.
  tabs.stash(paneTree, focusedPane);
  const next = tabs.close(i);
  if (!next) return;
  paneTree = next.tree;
  focusedPane = next.focusedPane;
  renderPanes();
  refreshTabStrip();
  rememberPanes();
  const want = tabs.focusedDoc(next);
  if (want && want !== runtime.currentDoc?.id) {
    handOverPages(runtime.currentDoc?.id ?? null, want);
    void openDoc(want, { handedOver: true });
  } else scheduleCompile();
}

async function renameTab(i: number) {
  const tab = tabs.all()[i];
  if (!tab) return;
  const name = await askText(t("renameTabPrompt"), tab.name ?? "");
  if (name === null) return;
  tabs.rename(i, name);
  refreshTabStrip();
  rememberPanes();
}

/** Draw the current pages into every preview pane there is. */
function drawCurrentIntoAll() {
  for (const host of document.querySelectorAll<HTMLElement>(".preview-host")) drawCurrentInto(host);
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

/**
 * The count, on a short beat rather than on every keystroke.
 *
 * `countableText` runs the whole document through five regular expressions, and
 * this was called synchronously from the update listener: 1.9 ms per keystroke on
 * a 64 KB document, 6.4 ms on a 192 KB one, inside a frame budget of 16 ms that
 * prose mode and CodeMirror are also spending from. Nobody reads a word count at
 * sixty frames a second; a fifth of a second late it is still the same number,
 * and the keystroke it is late for is the one being typed.
 */
/**
 * The three side panes, on the same beat as the word count.
 *
 * These were called synchronously from the update listener, on **every
 * keystroke**, and they are not cheap:
 *
 *   - `renderOutline()` scans the document and rebuilds the list.
 *   - `renderNotesPane()` scans it, then calls `plainText()` once per note — on
 *     a sefer with 200 notes that is 200 more scanner invocations and ~600 DOM
 *     nodes, per character typed.
 *   - `renderReviewPanel()` scans, rebuilds, and in doing so **destroys the
 *     reviewer-name input** — including while somebody is typing into it. That
 *     one is not a performance bug at all; it is why the field could not be
 *     filled in on a document that was also being edited.
 *
 * And these are precisely the two panes a writer keeps open *while writing*, so
 * the cost lands on the person the feature is for.
 *
 * The same 200 ms as the count, and for the same reason: nobody reads an outline
 * at sixty frames a second, and a fifth of a second later it is the same list.
 * The panes still refresh immediately when they are *opened* — `renderOutline`
 * and friends are called directly there — so only the typing path is delayed.
 */
let paneTimer: number | undefined;
function refreshPanes() {
  clearTimeout(paneTimer);
  paneTimer = window.setTimeout(() => {
    // The review list is a view of the document's own marks, so an edit
    // anywhere — not only a decision taken in the panel — must refresh it.
    if (isReviewOpen()) renderReviewPanel();
    if (settings.outline) renderOutline();
    if (settings.notesPane) renderNotesPane();
    if (settings.marksPane) renderMarksPane();
    // The find drawer is a view of the document too — of two of them. The
    // source half moves on every keystroke and the printed half moves when the
    // compile lands, and a list of hits into a document that has since been
    // edited is the stale surface this application is repeatedly reported for.
    if (isPanelOpen("find-drawer")) renderFindPane();
  }, PANE_DEBOUNCE_MS);
}
const PANE_DEBOUNCE_MS = 200;

// ------------------------------------------------------- keeping a series in order
//
// A siman's number is written into the source by hand, because that is what a
// siman *is*. Insert one in the middle and `insertSnippet` renumbers the rest;
// delete one, or move one, and nothing did — there was a warning on the line
// and a click to take it.
//
// The wait is deliberately long. This rewrites the writer's own characters, and
// doing it between two keystrokes of a numeral they are in the middle of typing
// would be a fight rather than a help; a second of quiet is the difference
// between "I finished an edit" and "I am mid-word".
let renumberTimer: number | undefined;
const RENUMBER_DEBOUNCE_MS = 1000;

function scheduleRenumber() {
  clearTimeout(renumberTimer);
  if (settings.renumberAuto === false) return;
  renumberTimer = window.setTimeout(renumberNow, RENUMBER_DEBOUNCE_MS);
}

/**
 * Put every series back in order, if any of it is out.
 *
 * Two refusals, and both are about not fighting the writer. A selection that
 * covers a number being rewritten is an edit in progress — leave it. And a
 * caret **inside** one of the numerals about to change is somebody typing that
 * numeral, which is the one case where the document is out of order *on
 * purpose*, for as long as it takes to finish the word.
 */
function renumberNow() {
  const view = runtime.view;
  if (!view || settings.renumberAuto === false) return;
  const text = docTextOf(view.state.doc);
  const wrong = outOfSequence(text);
  if (!wrong.length) return;
  const sel = view.state.selection.main;
  if (wrong.some((n) => sel.from <= n.to && sel.to >= n.from)) return;
  const changed = renumberAll(view);
  // Said out loud, and configurably so — the item asks for it in those words.
  // Software that rewrites the writer's own characters and says nothing is
  // software the writer cannot trust, however right it is.
  if (changed && settings.renumberReport !== false) {
    setStatus(tf("renumbered", changed), "ok");
  }
}

let countTimer: number | undefined;
const COUNT_DEBOUNCE_MS = 200;
function updateCounts() {
  clearTimeout(countTimer);
  countTimer = window.setTimeout(countNow, COUNT_DEBOUNCE_MS);
}


/**
 * The printed-character prefix sum for the document as it stands.
 *
 * Rebuilt lazily and cached against the document's length and its first
 * changed-marker, because it is a full pass over the text and the thing that
 * asks for it is a scroll event. Invalidated by `invalidateScrollMap`, which
 * the update listener calls on every document change — one comparison per
 * keystroke, one rebuild per scroll after a change.
 */
let scrollPrefix: number[] | null = null;
function invalidateScrollMap() {
  scrollPrefix = null;
}
function printedMap(): number[] {
  if (!scrollPrefix) scrollPrefix = printedPrefix(docTextOf(runtime.view.state.doc));
  return scrollPrefix;
}

// Scrolling, between panes.
//
// **Not by the scrollbars.** It used to be `scrollTop / scrollHeight` on each
// side, under a comment claiming a percentage was "all a scrollbar can honestly
// be". A fraction of the source's pixels equals a fraction of the printed pixels
// only if every line of source prints, and in a Ksav document a great deal does
// not — comments, command heads, closing brackets, and everything inside a fold.
// The writer who found this said so in the same sentence they reported it:
// *"this might be because I have so many comments"*. A marked-up document is
// precisely the case where the old arithmetic is furthest off, which is to say
// the harder somebody works, the more wrong it got.
//
// The proportion survives; the currency changes. `scrollmap.ts` counts the
// characters that will actually print. The arithmetic now lives in
// `syncLinkedScroll`, because *which* pane follows which is a property of the
// pane tree rather than a fact about the one split this application used to have.
//
// What is left here is the other direction, which is not a proportion at all:
// clicking a rendered page puts the caret on the word that was clicked, by
// asking the compiler.
function wirePreviewClicks(host: HTMLElement) {
  host.addEventListener("click", (e) => {
    // A drag that ended here is a selection, not a click: the reader is copying
    // a rendered line, and moving the caret would take the selection with it.
    if (!isPlainClick(window.getSelection())) return;
    void jumpFromClick(e as MouseEvent);
  });
}

/**
 * Put the cursor on whatever was clicked in the preview.
 *
 * Nothing happens when there is no answer, and there are several honest ways to
 * have none: the click was on a margin, on a running head, on a note-band rule,
 * or the document does not currently compile. All of them mean "the writer did
 * not type this", and in a document whose whole apparatus is generated they are
 * common rather than exotic — so a miss says nothing rather than putting up a
 * message about every click on white space.
 */
async function jumpFromClick(e: MouseEvent) {
  // The direction that had no switch. Every other piece of the sync could be
  // turned off and this one could not, which is why the request named it.
  if (settings.clickToSource === false) return;
  const found = pageUnder(e.target);
  if (!found || !runtime.backend) return;
  // The page the reader actually clicked, which after a failed compile is not
  // the last compile's. Measuring a click against a page nobody is looking at
  // is the same defect as printing one.
  const svg = currentPages()[found.index];
  const box = pageBox(svg);
  if (!box) return;
  const at = pointInPage(found.index, found.node.getBoundingClientRect(), box, e.clientX, e.clientY);
  if (!at) return;

  const { body, offset } = bodyOnScreen();
  const spot = await runtime.backend.jump(body, docConfig(), at, docs.requestAssets(runtime.currentDoc?.assets ?? []));
  // The engine counts lines in the body it was sent, which carries the preamble
  // this client put in front. Same subtraction as a diagnostic's, same function.
  const line = lineInDocument(spot?.line ?? null, offset);
  if (line == null || line > runtime.view.state.doc.lines) return;
  const at_ = runtime.view.state.doc.line(line);
  // The column is counted in characters and CodeMirror counts in UTF-16 units,
  // which differ for anything outside the BMP. Walking the line's own text keeps
  // the two in step without either side having to know about the other.
  const col = Math.max(0, (spot?.column ?? 1) - 1);
  const chars = [...at_.text].slice(0, col).join("").length;
  // Claim the floor before the caret moves, or the preview shoves the reader.
  //
  // *"Clicking in preview brings you to the right place in the source, but moves
  // the actual preview, which it should not do."* Exactly so, and it is a loop
  // this function closes on itself: the dispatch below sets the selection, the
  // editor's update listener sees `selectionSet && !docChanged`, and
  // `followCaretInPreview` scrolls the preview to the caret. So a reader clicks
  // a word they are *looking at* and the page moves out from under them, to
  // land that same word wherever the sync setting says lines belong.
  //
  // `scrollFloor` is the mechanism that already exists for this and its meaning
  // is exactly right here — *somebody is driving this pane; do not steer* — it
  // was simply only ever claimed by scroll events. A click is not a scroll, so
  // nothing claimed it, so nothing declined to follow. Set before the dispatch
  // rather than after: `followCaretInPreview` schedules on a 100 ms timer and
  // reads the floor when it fires, but the transaction is synchronous and there
  // is no reason to leave a window at all.
  //
  // The source-side mirror of this has always been handled, differently and
  // correctly: a click in the source cancels the cheap line-level follow in
  // favour of the exact reveal it asked for. See `revealFromSourceClick`.
  scrollFloor = { pane: "preview-click", until: performance.now() + SCROLL_FLOOR_MS };
  runtime.view.dispatch({
    selection: { anchor: Math.min(at_.from + chars, at_.to) },
    scrollIntoView: true,
  });
  runtime.view.focus();
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
async function revealCursor(opts: { quiet?: boolean; from?: number } = {}): Promise<boolean> {
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
    const mp = settings.clickTarget === "keep" && opts.from !== undefined
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
  clearTimeout(caretFollowTimer);
  clearTimeout(revealClickTimer);
  revealClickTimer = window.setTimeout(() => void revealCursor({ quiet: true, from }), 120);
}

// ------------------------------------------------------------------- cite on selection
//
// spec.md §10.4: highlight a phrase, the first mekor appears, Tab cycles the
// rest, and **if none fits you drop into full Girsa search**. The last part is
// not a fallback, it is the point: a citation nobody could settle is not a
// citation to guess at.
//
// Everything about *which* places these are is the library's answer, printed
// citation and all. This file chooses which one is highlighted and where the
// mekor is inserted, and nothing else.

/**
 * Turn the citations in the selection into live refs (spec.md §10.5).
 *
 * Girsa finds them and `girsa-ksav` writes them — nothing here decides what a
 * citation is. **High-confidence only**: what comes back is the same prose
 * with the certain ones wrapped, and everything else untouched.
 */
async function linkifySelection(): Promise<void> {
  const sel = runtime.view.state.selection.main;
  const prose = runtime.view.state.sliceDoc(sel.from, sel.to);
  if (!prose.trim()) {
    setStatus(t("selectAPhrase"), "");
    return;
  }
  const girsa = sourcesOf(runtime.backend);
  if (!girsa) {
    // Not a failure: this build has no way to reach Girsa. The prose is left
    // exactly as written, which is what spec.md §10.5 asks for anyway.
    setStatus(t("girsaNeedsApp"), "");
    return;
  }
  setStatus(t("askingGirsa"), "");
  try {
    const linked = await girsa.linkify(prose);
    if (linked === prose) {
      setStatus(t("nothingCertain"), "");
      return;
    }
    runtime.view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: linked },
      selection: { anchor: sel.from + linked.length },
    });
    setStatus(t("citationsLinked"), "ok");
    scheduleCompile();
  } catch (e) {
    const bad = troubleSaid(e, "linkify");
    setStatus(bad.said, "err", bad.detail);
  }
}

/**
 * Ask the library for every citation in this document again (spec.md §10.2).
 *
 * *"A whole sefer can be switched from abbreviated to full-form citations, or
 * every quote regenerated against a corrected edition, without touching a word
 * of the prose. No paste-based workflow can do that, which is the whole
 * argument for the pairing."*
 *
 * The errand behind that sentence — `POST /refresh` — is named in Girsa's own
 * `post.rs` as **the clearest of them**, the one the loopback earns itself on,
 * and in this repository's README as *"the errand that pays for the loopback"*.
 * It had a generated client, a generated table row, and **no caller in
 * `src/`**. The service that justifies the process boundary had no way in.
 *
 * # Rows, and the writer says yes
 *
 * What comes back is one row per citation and not a rewritten document, and
 * that is the design rather than an unfinished half of it: a correction
 * somebody else made silently changing the words in the sefer you are writing
 * is the one surprise this arrangement exists to avoid. A correction is a claim
 * somebody made, not a fact about the sefer.
 *
 * So each row shows what the library says now, and each row that **differs from
 * what is in the document** offers to put it in. A row that could not be looked
 * up says why and offers nothing — the other thirty-nine still refresh, and
 * that decision was made once, in Girsa.
 */
async function refreshSources(): Promise<void> {
  const girsa = sourcesOf(runtime.backend);
  if (!girsa) {
    setStatus(t("girsaNeedsApp"), "");
    return;
  }
  const markup = docTextOf(runtime.view.state.doc);
  setStatus(t("askingGirsa"), "");
  let got: Refreshing;
  try {
    got = await girsa.refresh(markup);
  } catch (e) {
    const bad = troubleSaid(e, "reach_girsa");
    setStatus(bad.said, "err", bad.detail);
    return;
  }
  const rows = got.quotes;
  if (!rows.length) {
    setStatus(t("refreshNone"), "");
    return;
  }
  showRefreshed(rows, got);
  const moved = rows.filter((r) => !r.trouble && !markup.includes(r.text)).length;
  setStatus(tf("refreshedCount", rows.length, moved), moved ? "warn" : "ok");
}

/**
 * The marei mekomos the library re-segmented, and the one button that fixes
 * them.
 *
 * Not a row per citation, deliberately: this is one fact about the document —
 * *N of your names are stale* — and offering it N times would make a writer
 * click N times to accept a change they either want or do not. The rows below
 * are about **words** and are one decision each; this is about **names** and is
 * one decision total.
 *
 * The rewritten document comes from the engine (`girsa_ksav::retargeted`), so
 * the scanner that finds a citation is the one both applications compile and
 * nothing here matches a ref by string.
 */
function movedRow(got: Refreshing): HTMLElement | null {
  if (!got.moved.length || !got.retargeted) return null;
  const line = el("div", { class: "refresh-row refresh-moved" }, [
    el("b", {}, [tf("refreshMoved", got.moved.length)]),
    el(
      "div",
      { class: "refresh-text" },
      got.moved.map((m) => el("div", {}, [`${m.from} → ${m.to.join(", ")}`])),
    ),
  ]);
  line.append(
    el(
      "button",
      {
        class: "sc-key",
        onClick: () => {
          const doc = runtime.view.state.doc;
          runtime.view.dispatch({
            changes: { from: 0, to: doc.length, insert: got.retargeted ?? "" },
          });
          setStatus(t("refreshRetargeted"), "ok");
        },
      },
      [t("refreshRetarget")],
    ),
  );
  return line;
}

/** The rows, each with what to do about it. */
/**
 * The rows the panel is currently showing, and the header row's source.
 *
 * Kept so that accepting one row can re-render *the list*, rather than
 * replacing it. `takeRefreshed` used to end with `showRefreshed([row])`, which
 * threw away every other row: a reader working down forty refreshed citations
 * lost the other thirty-nine the moment they accepted one.
 */
let refreshShowing: { rows: Refreshed[]; got?: Refreshing } = { rows: [] };

function showRefreshed(rows: Refreshed[], got?: Refreshing): void {
  refreshShowing = { rows, got: got ?? refreshShowing.got };
  const list = document.getElementById("refresh-list");
  if (!list) return;
  const doc = docTextOf(runtime.view.state.doc);
  const moved = got ? movedRow(got) : null;
  // How many earlier rows name the same place.
  //
  // A sefer that cites the same place twice — routine — produces two rows with
  // one `ref` between them, and `takeRefreshed` located its citation with
  // `doc.indexOf(row.ref)`, which finds the first one always. So the second
  // citation was never reachable: the panel offered the row again, with the same
  // button, which now edited the already-corrected first one.
  const seen = new Map<string, number>();
  list.replaceChildren(
    ...(moved ? [moved] : []),
    ...rows.map((row) => {
      const nth = seen.get(row.ref) ?? 0;
      seen.set(row.ref, nth + 1);
      // A row is "moved" when the words the library has now are not in the
      // document. Compared against the whole buffer rather than against a
      // parsed citation, deliberately: the writer may have edited the quote,
      // and a diff of *their* words against the library's is exactly what they
      // want to see rather than something this file guessed at.
      const here = !row.trouble && doc.includes(row.text);
      const line = el("div", { class: "refresh-row" }, [
        el("b", {}, [row.display || row.ref]),
        el("div", { class: "refresh-text" }, [row.text || ""]),
      ]);
      if (row.trouble) {
        line.append(el("div", { class: "is-trouble" }, [row.trouble]));
      } else if (!here) {
        line.append(
          el(
            "button",
            {
              class: "sc-key",
              onClick: () => takeRefreshed(row, nth),
            },
            [t("refreshTake")],
          ),
        );
      } else {
        line.append(el("div", { class: "refresh-same" }, [t("refreshSame")]));
      }
      return line;
    }),
  );
  openPanel("refresh-panel");
}

/**
 * Put one refreshed quote into the document.
 *
 * The mekor is found by its **ref**, which is the whole reason the ref is
 * stored: `#מראה_מקום(מקור: "girsa:…")[…]` names the place, so the citation to
 * update can be found without parsing prose or trusting a position that the
 * writer may have moved since the rows were asked for.
 */
function takeRefreshed(row: Refreshed, nth = 0): void {
  const doc = docTextOf(runtime.view.state.doc);
  // The `nth` occurrence, not the first. See the counter in `showRefreshed`.
  let at = -1;
  for (let i = 0; i <= nth; i++) {
    at = doc.indexOf(row.ref, at + 1);
    if (at < 0) break;
  }
  if (at < 0) {
    setStatus(t("refreshGone"), "warn");
    return;
  }
  // The citation's **body**, found through the scanner rather than by counting
  // brackets here. A first version of this walked the string itself and
  // `spans.test.mjs` refused it by name — bracket depth is one question with
  // one answer, and a second counter is how `brackets.ts` came to delete a
  // call's real closing paren over a `)` inside a string.
  //
  // The ref is what locates it, which is the whole reason the ref is stored:
  // `#מראה_מקום(מקור: "girsa:…")[…]` names the place, so the citation to update
  // is found without parsing prose or trusting a position the writer may have
  // moved since the rows were asked for.
  const body = bodyAt(scanDoc(runtime.view.state.doc), at);
  if (!body) {
    setStatus(t("refreshGone"), "warn");
    return;
  }
  runtime.view.dispatch({
    changes: { from: body.from, to: body.to, insert: row.display || row.text },
  });
  setStatus(t("refreshTook"), "ok");
  scheduleCompile();
  // The whole list again, recomputed against the document as it now stands —
  // which is what marks the accepted row as matching, and leaves every other row
  // exactly where the reader left it.
  showRefreshed(refreshShowing.rows, refreshShowing.got);
}

/**
 * Tell Girsa where a document now lives (spec.md §10.4).
 *
 * *Standing on a passage, see which of **your own documents** cite it.* Girsa's
 * registry, its `who_cites` query and its tests were all built and **nothing
 * ever sent it a path** — so the query walked `personal/ksav/`, the documents
 * written in Girsa's own toy editor, and a `.ksav` written in the real Ksav
 * answered *nothing cites this*. The reader's actual work, in the actual
 * editor, was invisible to the feature it exists for.
 *
 * There is nowhere for Girsa to walk instead: a reader's documents live
 * wherever they keep documents, and a library application has no business
 * enumerating a disk.
 *
 * Only a **real path** is worth telling it about. The browser's handle tier has
 * no path Girsa could open, and a download is not a place at all — those are
 * the two tiers `files.canWriteBack` already distinguishes.
 *
 * Never awaited by a save and never able to fail one: the library being closed
 * is the ordinary case, and this is a courtesy to it rather than a step in
 * saving.
 */
function tellGirsaWhereItIs(forget = false): void {
  const binding = runtime.currentBinding;
  const girsa = sourcesOf(runtime.backend);
  if (!girsa || binding?.kind !== "tauri" || !binding.path) return;
  void girsa.savedHere(binding.path, runtime.currentDoc?.title || binding.name, forget).catch(() => {
    // Deliberately silent. Girsa not being open is the ordinary case, and a
    // line about it on every save would be noise about a courtesy the writer
    // never asked for.
  });
}

function closeMekoros(): void {
  closePanel("mekoros");
}

/**
 * Attach a ref to the source note at `at` — the lint's own way in.
 *
 * `askForMekor` works on the selection, which is the right shape for the
 * gesture a writer makes (highlight a phrase, ask where it is from). The lint
 * has a *note* rather than a selection, so it selects the note's printed text
 * and asks about that: the printed text is precisely the phrase whose place is
 * wanted, and it is already in the document.
 */
function attachRefToNote(view: EditorView, at: number): void {
  const body = bodyAt(scanDoc(view.state), at);
  if (!body) {
    setStatus(t("selectAPhrase"), "");
    return;
  }
  view.dispatch({ selection: { anchor: body.from, head: body.to } });
  view.focus();
  void askForMekor();
}

async function askForMekor(): Promise<void> {
  const sel = runtime.view.state.selection.main;
  const phrase = runtime.view.state.sliceDoc(sel.from, sel.to).trim();
  if (!phrase) {
    setStatus(t("selectAPhrase"), "");
    return;
  }
  const girsa = sourcesOf(runtime.backend);
  if (!girsa) {
    setStatus(t("girsaNeedsApp"), "");
    return;
  }
  setStatus(t("askingGirsa"), "");
  const answer = await girsa.mekoros(phrase).catch((e: unknown) => ({
    phrase,
    total: 0,
    is_a_quotation: false,
    said: "",
    places: [],
    // The shape `mekoros` returns carries a message a reader will see, so it
    // gets the reader's sentence and not the transport's.
    error: troubleSaid(e, "reach_girsa").said,
  }));
  if (answer.error) {
    // The engine's `error` field carries whatever `girsa-post` said, in English,
    // so it goes through the same rephrasing as a thrown one. A resolved response
    // that reports a failure is still a failure being reported.
    const bad = troubleSaid(answer.error, "reach_girsa");
    setStatus(bad.said, "err", bad.detail);
    return;
  }
  setStatus(answer.said, "");
  showMekoros(sel.to, phrase, answer);
}

function showMekoros(at: number, phrase: string, answer: Mekoros): void {
  const box = el("div", { class: "spell-menu mekoros" }, []);
  mountPanel("mekoros", box, document.body);

  // Placed under the caret, which is where the reader is looking.
  const where = runtime.view.coordsAtPos(at);
  if (where) {
    box.style.left = `${Math.min(where.left, window.innerWidth - 320)}px`;
    box.style.top = `${where.bottom + 6}px`;
  }

  let chosen = 0;
  const rows: HTMLElement[] = [];

  const take = (place: Mekor): void => {
    // The citation goes in as a mekor footnote — the ref travels with it,
    // because that is what makes it re-printable later (spec.md §10.2). The
    // markup is `citation.ts`'s, which is also where the account lives of how
    // long that sentence was false: this was `#מראה_מקום[${place.display}]`,
    // and `place.ref` was read by nothing.
    //
    // **Through `insertSnippet`, not a raw dispatch.** `citation.ts` is a single
    // producer for the *markup* — its own test sweeps `src/*.ts` to keep it the
    // only one — and it then handed its output to the one insertion path the app
    // is forbidden to use. So `deferNoteBodies`, honoured by the toolbar, the
    // palette, the keyboard and the modal, was not honoured by the source
    // citation panel: the most sefer-specific note in the product was the one
    // that ignored the preference.
    runtime.view.dispatch({ selection: { anchor: at } });
    insertSnippet(citationMarkup(place));
    closeMekoros();
    runtime.view.focus();
    setStatus(place.display, "ok");
    scheduleCompile();
  };

  const said = el("div", { class: "spell-word" }, [answer.said]);
  box.append(said);

  if (!answer.is_a_quotation && answer.total > 0) {
    // Counted, and **not** offered as a source. The list is still shown,
    // because the reader may recognise one; nothing is preselected.
    box.append(el("div", { class: "spell-none" }, [t("phraseNotQuotation")]));
  }

  for (const [i, place] of answer.places.entries()) {
    const row = el("button", { class: "spell-item mekor-item", onClick: () => take(place) }, [
      el("b", {}, [place.display || place.he_title]),
      // Already windowed on the match by the library, with its elisions marked;
      // slicing it here from the start is what put the wrong 90 characters on
      // screen (B16).
      el("span", { class: "mekor-text", title: `${place.characters} תווים` }, [place.shown]),
    ]);
    rows.push(row);
    box.append(row);
    if (i === 0 && answer.is_a_quotation) row.classList.add("sel");
  }

  box.append(el("div", { class: "menu-sep" }, []));
  box.append(
    el("button", { class: "spell-item spell-add", onClick: () => void dropIntoGirsa(phrase) }, [
      t("noneFitSearch"),
    ]),
  );

  const move = (by: number): void => {
    if (rows.length === 0) return;
    rows[chosen]?.classList.remove("sel");
    chosen = (chosen + by + rows.length) % rows.length;
    rows[chosen]?.classList.add("sel");
    rows[chosen]?.scrollIntoView({ block: "nearest" });
  };

  box.addEventListener("keydown", (e) => onMekorosKey(e, move, () => rows[chosen]?.click()));
  window.addEventListener("keydown", mekorosKeys, true);
  function mekorosKeys(e: KeyboardEvent): void {
    // Asking the registry rather than a module-level handle to the node: the
    // list can now be dismissed by Escape, by a click outside it, or by another
    // popup opening over it, and a stale local would keep this listener alive
    // through all three.
    if (!isPanelOpen("mekoros")) {
      window.removeEventListener("keydown", mekorosKeys, true);
      return;
    }
    onMekorosKey(e, move, () => rows[chosen]?.click());
  }
}

/** Tab cycles, Enter takes, Escape gives up — and giving up is a real answer. */
function onMekorosKey(e: KeyboardEvent, move: (by: number) => void, take: () => void): void {
  if (e.key === "Tab") {
    e.preventDefault();
    move(e.shiftKey ? -1 : 1);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    move(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    take();
  } else if (e.key === "Escape") {
    closeMekoros();
  }
}

async function dropIntoGirsa(phrase: string): Promise<void> {
  closeMekoros();
  const girsa = sourcesOf(runtime.backend);
  if (!girsa) {
    setStatus(t("girsaNeedsApp"), "");
    return;
  }
  await girsa.searchInGirsa(phrase).catch(() => {});
  setStatus(t("openedInGirsa"), "");
}

// ---------------------------------------------------------------- snippet insertion

/**
 * The tiered note to write at `pos`, in the document's own language.
 *
 * Four surfaces write this — `Ctrl+Shift+N`, the toolbar's `⁑`, the Insert menu
 * and "hang another note off this one" in the notes pane — and all four had the
 * same line of code in them, which is exactly the arrangement that let the
 * generated command drift out of English in the first place. The direction test
 * is the same one `setStyleArgs` uses, for the same reason: a generated command
 * follows the document, not the interface.
 */
function tieredNoteHere(doc: string, pos: number): string {
  return tieredNoteAt(doc, pos, docLang());
}

/**
 * The language a generated command is written in: the document's, never the
 * interface's. Three surfaces asked this the same way and a fourth arrived with
 * the deferred markers, so it is a function now.
 *
 * # It used to be a second opinion
 *
 * This read the page direction and nothing else, while `mode.docLang` — the
 * function the insertion path actually consults — reads what the document is
 * *written in*: the call the caret sits inside, then the majority of its
 * commands, then the majority of its letters. Two answers to one question,
 * disagreeing on any document whose direction and content point different ways,
 * and each one authoritative over a different set of surfaces.
 *
 * So there is one answer now, and the direction has the job it is actually good
 * for: saying what a document that has said nothing yet is going to be. That
 * matters more than it sounds. A blank left-to-right document took a Hebrew
 * first command, and the *next* insertion then found one Hebrew command and no
 * English ones, which is a majority.
 */
function docLang(): "he" | "en" {
  const v = runtime.view;
  if (!v) return dirLang();
  return modeDocLang(docTextOf(v.state.doc), v.state.selection.main.from, dirLang());
}

/**
 * What the page direction says the document is.
 *
 * Not an answer to "what language is this document" — that is `docLang`, and it
 * asks the text. This is the *tiebreak* the text cannot supply: a document with
 * no letters in it has said nothing, and the direction is then the only thing
 * the writer has stated. Passed into the pure modules, which know about text
 * and deliberately nothing about page setup.
 */
function dirLang(): "he" | "en" {
  return docConfig().dir === "ltr" ? "en" : "he";
}

/**
 * Write a snippet at the caret. **The** insertion path — every toolbar button,
 * menu entry, palette row, key binding and snippet expansion ends up here.
 *
 * That is what makes three separate rules enforceable at all:
 *
 *  - **mode and delimiters** (`insertionAt`): a command needs its `#` in markup,
 *    must not have one inside an argument list, and must arrive comma-delimited
 *    on both sides when it lands in one. 372 of 1,026 generated documents used
 *    to fail on those two rules alone.
 *  - **legality** (`legalAt`): a page break inside a list item, a table of
 *    contents inside a heading. Refused with a reason, rather than written and
 *    then blamed on Typst in English from the middle of a blank preview.
 *  - **notes** (`noteFor`): a note snippet is not spliced at all. It is handed to
 *    the chooser's own producer, so the scaffolding a layout needs is written
 *    and `deferNoteBodies` is honoured — from the toolbar, the palette, the
 *    keyboard and the modal alike, because there is one producer and not four.
 *  - **numbering** (`continueSeries`): a siman's number is a *value* in the
 *    snippet, not a placeholder, and the registry's copy is `א׳` forever. A
 *    sefer written the way the toolbar invites you to write one came out
 *    numbered א׳, א׳, א׳ — the caret is placed past the number, in the title,
 *    so the writer never visits the field that is wrong.
 *
 * **Returns whether anything went in**, and the three callers that follow it
 * with `scheduleCompile()` must ask. A refusal is a `setStatus(…, "warn")` — the
 * sentence the writer needs — and a compile that had nothing to compile
 * overwrites it with `✓ 3 עמ׳` a few milliseconds later. So the page-section
 * dialog refused correctly, wiped its own refusal, and closed: the writer got a
 * form, filled it in, pressed *Add*, and the document did not change and nothing
 * said why. A control that is offered, enabled, pressed and silent is the exact
 * failure this codebase keeps producing, and here it was one unconditional line
 * after a function that had already done the right thing.
 */
function insertSnippet(rawSnippet: string): boolean {
  // Recorded here rather than at each of the toolbar's, the Insert menu's and
  // the palette's call sites, because "a command reached the document" is one
  // event and three places to remember it is how it came to be recorded in
  // none. An action inserting a snippet is already recorded as the action.
  if (!inAction) noteSnippet(rawSnippet);
  const sel = runtime.view.state.selection.main;
  const selText = runtime.view.state.sliceDoc(sel.from, sel.to);
  const doc = docTextOf(runtime.view.state.doc);

  // Every decision is `insert.plan`, which is a pure function and therefore
  // testable; what is left here is performing it. See `insert.ts`.
  const plan = planInsertion(doc, sel.from, sel.to, selText, rawSnippet, dirLang());
  if (plan.kind === "refuse") {
    setStatus(t(plan.reason), "warn");
    return false;
  }
  if (plan.kind === "note") {
    applyNotePick(plan.pick, { to: sel.to, text: selText, marker: plan.marker });
    return true;
  }
  // "Make this a real list" — the bullet button pressed over paragraphs. A
  // whole-document rewrite because it reaches past the selection to the ends of
  // the lines it touches, which a splice into `[from, to]` cannot do.
  if (plan.kind === "rewrite") {
    editDoc(plan.text, plan.caret);
    runtime.view.focus();
    return true;
  }
  // A siman or a se'if added in the middle leaves every one after it holding
  // the wrong number, because a siman's number is written in the source by hand
  // — that is what a siman *is* — where a list's numbers are Typst's and
  // renumber for free. `continueSeries` gave the new one the number of the one
  // it now precedes, which is right; the rest of the run is what nothing ever
  // fixed. One transaction, so it is one undo.
  if (inSeries(rawSnippet)) {
    const inserted = doc.slice(0, sel.from) + plan.text + doc.slice(sel.to);
    const done = resequenceAt(inserted, sel.from + plan.cursor);
    if (done.changed) {
      editDoc(done.text, done.caret);
      if (done.changed > 1) setStatus(tf("renumbered", done.changed), "ok");
      runtime.view.focus();
      return true;
    }
  }
  runtime.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: plan.text },
    selection: { anchor: sel.from + plan.cursor },
  });
  runtime.view.focus();
  return true;
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

/**
 * How many heading levels the table of contents shows.
 *
 * One control that means two things depending on what the document already
 * says, and that is the point rather than a shortcut: before there is a
 * contents it decides what the next one will be, and after there is one it
 * rewrites that call. A separate "edit the contents" door would have been a
 * second implementation of one choice, which is the shape this repository keeps
 * having to collapse.
 */
function contentsDepthRow(): HTMLElement {
  const doc = docTextNow();
  const live = heads.contentsDepth(doc);
  const has = !heads.canAddContents(doc);
  const sel = el(
    "select",
    {
      id: "contents-depth",
      onChange: (e: Event) => {
        const raw = (e.target as HTMLSelectElement).value;
        const depth = raw === "" ? null : Number(raw);
        const made = has
          ? heads.setContentsDepth(doc, depth)
          : heads.addContents(doc, docLang(), depth);
        closeMenus();
        if (!made) return;
        editDoc(made.text, made.caret);
        runtime.view?.focus();
      },
    },
    [
      el("option", { value: "", ...(live === null ? { selected: "selected" } : {}) }, [
        t("contentsDepthAll"),
      ]),
      ...[1, 2, 3, 4, 5].map((n) =>
        el("option", { value: String(n), ...(live === n ? { selected: "selected" } : {}) }, [
          tf("contentsDepthN", n),
        ]),
      ),
    ],
  );
  return el("div", { class: "menu-input-row" }, [
    el("span", { class: "menu-cat" }, [t("contentsDepth")]),
    sel,
    el("div", { class: "menu-desc" }, [t(has ? "contentsDepthEdits" : "contentsDepthMakes")]),
  ]);
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

// ---------------------------------------------------------------- app chrome
//
// Every button in this app is a glyph. That is defensible for a dense editing
// toolbar and indefensible without names: a `title` tooltip is not an accessible
// name, so a screen reader announced the toolbar as "†, button", "⁑, button",
// "▤, button" — forty-two of them, page-wide, with zero `aria-label` and no
// landmarks. Worse for everyone, sighted users included: ⁑ ⇥ ⇤ ▣ § א. ‡ ▤ ⋯ ◫
// ◧ ⊟ ⊞ ＃ is a private vocabulary with nothing to learn it from, in a product
// whose competition is Word's labelled ribbon groups.
//
// So `iconBtn` requires a name and sets `aria-label` from it, and the toolbar is
// a set of *labelled* groups — visible captions for sighted users, `role=group`
// with `aria-label` for assistive technology.

/**
 * The open document's text, or `""` when there is no editor yet.
 *
 * The obvious spelling is a nullish coalesce straight into `docTextOf`, with an
 * empty string as the fallback — and it **throws**. `docTextOf` memoises on a
 * `WeakMap` keyed by the `Text` object, and a `WeakMap` refuses a primitive key,
 * so the branch that looks like the safe default is the one that cannot work.
 * The chrome is built once before the editor exists, which is that branch, on
 * every boot: it took the whole application down with a blank page and nothing
 * in the console, because an unhandled rejection in `boot()` is not a console
 * message.
 */
function docTextNow(): string {
  return runtime.view ? docTextOf(runtime.view.state.doc) : "";
}

/**
 * The paragraph-style control: what this paragraph *is*, and the two doors out.
 *
 * The dropdown is the readout — rebuilt on every selection change by
 * `updateContextBar`, so it says where the caret actually is rather than what
 * was last pressed — and it is bound to the same registry operations as
 * everything else: a level runs `heading.levelN`, "body text" unwraps.
 *
 * Three things the margin asked for and it did not have:
 *
 *   - **A number.** Nine levels in a dropdown means levels 4 to 9 are a scroll,
 *     and a writer working at depth knows the number they want. Typing it is one
 *     gesture where picking it is three.
 *   - **Other.** The tenth entry every word processor has — a style of the
 *     writer's own, named, created and applied in one act. See `styles.ts`.
 *   - **Edit this one.** The formatting behind whatever is applied here, without
 *     first working out which of the styles panel's nine sections owns it. For a
 *     heading that is the Headings section at *this* level; for a custom style it
 *     is that style's own knobs.
 */
function paragraphStyleControl(): HTMLElement {
  const sel = el("select", {
    id: "heading-level",
    class: "heading-select",
    title: t("paragraphStyle"),
    "aria-label": t("paragraphStyle"),
  }) as HTMLSelectElement;
  fillParagraphStyles(sel);
  sel.addEventListener("change", () => applyParagraphStyle(sel.value));

  // 1 to `MAX_LEVEL`, and no zero: "not a heading" is a different answer and it
  // is the dropdown's, where it can be named. A blank box means *this paragraph
  // is not one*, which is also what it shows when the caret is in body text.
  const level = el("input", {
    type: "number",
    class: "heading-number",
    min: 1,
    max: heads.MAX_LEVEL,
    step: 1,
    id: "heading-level-number",
    title: t("headingLevel"),
    "aria-label": t("headingLevel"),
  }) as HTMLInputElement;
  level.addEventListener("change", () => {
    const want = parseInt(level.value, 10);
    if (!Number.isFinite(want) || want < 1 || want > heads.MAX_LEVEL) {
      setStatus(tf("headingLevelRange", String(heads.MAX_LEVEL)), "warn");
      updateContextBar();
      return;
    }
    applyParagraphStyle(String(want));
  });

  return el("span", { class: "tb-split" }, [
    sel,
    level,
    iconBtn("✎", t("editThisStyle"), () => editParagraphStyle(sel.value)),
  ]);
}

/** The dropdown's options: body text, the levels, this document's own styles, other. */
function fillParagraphStyles(sel: HTMLSelectElement) {
  const doc = docTextNow();
  sel.replaceChildren(el("option", { value: "0" }, [t("bodyText")]));
  for (let i = 1; i <= heads.MAX_LEVEL; i++) {
    sel.append(el("option", { value: String(i) }, [t("headingLevel" + i)]));
  }
  const own = styles.findCustomStyles(doc);
  if (own.length) {
    sel.append(
      el(
        "optgroup",
        { label: t("customStyles") },
        // The chord beside the name, which is the other half of *"that binding
        // must appear wherever the style appears"*. An `<option>` holds text
        // and nothing else, so it is spelled into the label — and through
        // `hintFor`, so under a mode it prints what to type instead.
        own.map((s) => {
          const hint = hintFor(styles.styleActionId(s.name));
          return el("option", { value: `custom:${s.name}` }, [
            hint ? `${s.name} · ${hint}` : s.name,
          ]);
        }),
      ),
    );
  }
  sel.append(el("option", { value: "new" }, [t("newStyle")]));
}

/** What the dropdown should be showing, given where the caret is. */
function paragraphStyleAt(doc: string, pos: number): string {
  const own = styles.customStyleAt(doc, pos);
  if (own) return `custom:${own.name}`;
  const heading = heads.headingAt(doc, pos);
  return String(heading ? heading.level : 0);
}

function applyParagraphStyle(value: string) {
  const doc = docTextOf(runtime.view.state.doc);
  const pos = runtime.view.state.selection.main.head;
  if (value === "new") {
    openNewStyle();
    return;
  }
  if (value.startsWith("custom:")) {
    applyCustomStyle(value.slice("custom:".length));
    return;
  }
  const want = parseInt(value, 10);
  if (want === 0) {
    // Body text unwraps whichever of the two this paragraph is. The custom style
    // first, because a styled heading is a heading with a wrapper inside it and
    // taking the outer one off would take the heading with it.
    const own = styles.customStyleAt(doc, pos);
    if (own) {
      unwrapCustomStyle(own.name);
      return;
    }
    const h = heads.headingAt(doc, pos);
    if (!h) return;
    // Null for a heading whose level the prelude fixes (`#סימן`): unwrapping
    // one would drop its number, which is the writer's text.
    const e = heads.unwrapHeading(doc, h);
    if (!e) return;
    editDoc(e.text, e.caret);
    scheduleCompile();
    runtime.view.focus();
    return;
  }
  const action = structure.actionById(`heading.level${want}`);
  if (action) runStructureAction(action);
  runtime.view.focus();
}

/** The pencil: open whatever is applied here for editing, and say when nothing is. */
function editParagraphStyle(value: string) {
  if (value.startsWith("custom:")) {
    openStyleEditor(value.slice("custom:".length));
    return;
  }
  const level = parseInt(value, 10);
  if (!level) {
    // Body text has no style of its own to open — the document's own text
    // settings are page setup, which is a different drawer, so say that rather
    // than opening the wrong one.
    setStatus(t("noStyleToEdit"), "warn");
    return;
  }
  // The Headings section already edits per-level design; this points it at the
  // level in hand, which is the step a writer otherwise has to work out.
  headingLevel = level;
  openStyles();
}

/**
 * The colour the highlighter is about to use.
 *
 * Session state and not a setting: it is the *last colour picked*, which is what
 * every word processor's highlighter remembers and what nobody wants to find in
 * a settings drawer. It starts on Typst's own default so the button, the palette
 * and `#סימון[…]` typed by hand all put the same thing on the page.
 */
let highlightColour = styles.DEFAULT_HIGHLIGHT;

/**
 * The highlighter, and the colour it will use.
 *
 * *"Highlight should offer a colour"* — and the engine had offered one all
 * along, under a second name (`#רקע`) that the toolbar was not wired to. The
 * colour is an argument on `#סימון` now, so this is one control: press the pen
 * to highlight, press the swatch to change what colour it highlights in. The
 * swatch is a real `input[type=color]` rather than a palette of five, because
 * the argument takes any colour and a fixed palette would be the product being
 * narrower than the document format again.
 */
function highlightControl(writing: Lang): HTMLElement {
  const cmd = runtime.commandsReg.find((c) => c.he === "סימון");
  if (!cmd) return el("span");
  const name = writing === "he" ? cmd.he : cmd.en;
  const desc = getLang() === "he" ? cmd.desc_he : cmd.desc_en;
  const swatch = el("input", {
    type: "color",
    class: "tb-swatch",
    value: highlightColour,
    title: t("highlightColour"),
    "aria-label": t("highlightColour"),
  }) as HTMLInputElement;
  const apply = () => {
    highlightColour = swatch.value;
    // The default colour is written as the bare command, so the common case
    // leaves the source exactly as it was before there was a swatch — and a
    // document-wide restyle of highlights stays possible for the writer who
    // never asked for a particular one.
    // Written in Hebrew and translated by `insert.plan`, like every other
    // snippet: an English document gets `#mark(color: …)`.
    insertSnippet(
      highlightColour.toLowerCase() === styles.DEFAULT_HIGHLIGHT
        ? "#סימון[|]"
        : `#סימון(צבע: rgb(${typstString(highlightColour)}))[|]`,
    );
  };
  // Picking a colour highlights with it. A swatch that only *records* a choice
  // would make every use two gestures, and the second one invisible.
  swatch.addEventListener("change", apply);
  return el("span", { class: "tb-split" }, [
    iconBtn("🖍", `${desc} · #${name}`, apply, "", { "data-command": cmd.he }),
    swatch,
  ]);
}

/**
 * A note button, labelled with its name *and* its shortcut.
 *
 * `snippet: null` means "read the caret" — the tiered note is `#הערה_א` in
 * prose, `#הערה_ב` inside a note and `#הערה_ג` inside two, which is the only
 * way one button can mean "a note on this".
 */
function noteBtn(action: string, glyph: string, snippet: string | null): HTMLElement {
  const hint = hintFor(action);
  const title = t("sc." + action) + (hint ? ` · ${hint}` : "");
  return iconBtn(
    glyph,
    title,
    () => {
      const st = runtime.view.state;
      insertSnippet(snippet ?? tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
    },
    "",
    { "data-action": action },
  );
}

function buildToolbar(): HTMLElement {
  const lang = getLang();
  // Two languages in one tooltip, and they are not the same question. The
  // *description* is the interface's, because it is being read; the **command
  // name** is the document's, because it is what the button is about to write.
  // An English toolbar reading "Bold text · #הדגשה" over a button that inserts
  // `#bold` is naming something that will not be in the document.
  const writing = docLang();
  const byName = (he: string) => runtime.commandsReg.find((c) => c.he === he);
  /**
   * A button in a group its category does not name, with the reason why.
   *
   * The ribbon groups by *what a writer reaches for*; the registry groups by
   * *what a command is*. Those two agree almost everywhere, and where they do
   * not, the disagreement is a product decision worth writing down rather than
   * a mistake worth hiding. `toolbar.test.mjs` checks membership against the
   * registry and lets a `guest` through — so the check stays total, and every
   * exception to it is one line away from the button it excuses.
   *
   * `why` is never read at runtime. It is there to be read by a person, and to
   * make declaring a guest cost a sentence of justification rather than nothing.
   */
  const guest = (he: string, label: string, _why: string) => b(he, label);
  const b = (he: string, label: string) => {
    const c = byName(he);
    if (!c) return el("span");
    const title = lang === "he" ? c.desc_he : c.desc_en;
    return iconBtn(label, `${title} · #${writing === "he" ? c.he : c.en}`, () => insertSnippet(c.insert), "", {
      "data-command": c.he,
    });
  };

  return el("div", { class: "toolbar", role: "toolbar", "aria-label": t("toolbar") }, [
    tbGroup(t("cat.style"), [
      b("הדגשה", "B"),
      b("נטוי", "I"),
      b("קו_תחתון", "U"),
      b("קו_חוצה", "S"),
      highlightControl(writing),
    ]),
    // The paragraph-style control, which is a word processor's single most-used
    // widget and which Ksav did not have. Three fixed buttons could only reach
    // three of nine levels, and could not tell the writer which one they were
    // standing in — a dropdown does both, and is where a Word user looks first.
    // **"Styles", not "Headings".** Reported from the writing side: *"it says
    // Heading, when it should be styles"*, and they were right about what the
    // group holds. The dropdown under this label offers body text, the nine
    // heading levels, **every style the writer has defined in this document**,
    // and "new style…" — so a label naming one of those four was telling a
    // writer their own styles were somewhere else. It is the Styles group in
    // every word processor there is, for the same reason.
    //
    // Its own key rather than a changed one: `cat.heading` is the *command
    // registry's* category, and the Insert menu's Headings section is correctly
    // named by it.
    tbGroup(t("styleGroup"), [paragraphStyleControl()]),
    tbGroup(t("cat.list"), [b("רשימה", "•"), b("ממוספרת", "1.")]),
    // Its own group, because a table is not a list.
    //
    // `#טבלה` sat in the group captioned "Lists" until a writer said so:
    // *"Table is still under lists. That is not at all accurate."* — and
    // "still" is the word that matters. `menus.ts` had already given tables
    // their own menu, and `commands.rs` had already categorised every table
    // command as `table`; the ribbon is hand-assembled and had never heard of
    // either. So the taxonomy was fixed in the two places that publish it and
    // wrong in the one place a writer actually looks.
    //
    // The captions here **are** registry category keys, which is what makes
    // `toolbar.test.mjs` able to check membership against the registry rather
    // than against a second list. That check is the point of this change: one
    // misfiled button is a nuisance, and the mechanism that let it stay misfiled
    // through a taxonomy rewrite is the defect.
    tbGroup(t("cat.table"), [b("טבלה", "▦")]),
    // The toolbar told the truth about one of these three.
    //
    // `†` was right. `⁑` inserted `#הערה_על_הערה`, which sounds like the tiered
    // mechanism and is a cosmetic alias — 0.6pt smaller and slanted, in the same
    // block and the same running sequence — while the real tiered note had no
    // button at all. And the endnote, which the engine has always had, was
    // reachable from nowhere: no button, no Insert item, and picking it out of
    // the palette silently lost every note because nothing wrote the dump call.
    // A writer clicks what the toolbar offers, so the toolbar has to offer the
    // thing it names.
    // Three, not four. `⁑` — a note *on* a note, which renders as a slightly
    // smaller, indented, separately-lettered entry in the same block — is a real
    // sefer apparatus and a rare one, and the toolbar is the most expensive
    // surface in the product. It keeps its Insert-menu item, its place in the
    // Notes chooser and `Ctrl+Shift+N`; it does not keep a button beside the
    // footnote that nearly everybody actually wants.
    tbGroup(t("cat.footnote"), [
      noteBtn("footnote", "†", "#הערה[|]"),
      noteBtn("endnote", "⁋", "#הערתסיום[|]"),
      // And the third one was a blue box.
      //
      // This was `b("הערת_צד", "▣")` — `#הערת_צד`, which the registry calls
      // `callout` and describes as *תיבת הדגשה (כחול)*. Its Hebrew name reads
      // "side note", it sat between the footnote and the endnote, and a writer
      // who wanted a note down the margin pressed it and got a blue box. The
      // real margin note, `#הערת_גיליון`, had no button at all — only the Notes
      // chooser, under "margin", for whoever thought to look.
      //
      // Which is the same sentence as the paragraph above about `⁑`, written
      // about a different button in the same group. A note button that inserts
      // something other than a note is this group's recurring failure, and
      // `toolbar.test.mjs` now checks the group against the registry so the
      // third instance is caught by a test rather than by a writer.
      noteBtn("sidenote", "▣", "#הערת_גיליון[|]"),
    ]),
    tbGroup(t("cat.align"), [b("ימין", "⇥"), b("מרכז", "≡"), b("שמאל", "⇤")]),
    tbGroup(t("cat.torah"), [
      // A guest, declared rather than smuggled.
      //
      // `#ציטוט` is a block quote and the registry is right to categorise it
      // `block`. It is here because of what a writer setting a sefer is doing
      // when they reach for the toolbar: quoting is the gesture that sits
      // beside siman, se'if and mareh makom, and the block-quote category holds
      // nothing else anyone reaches for at that moment.
      //
      // `guest` exists so that this is a *statement* with a reason attached to
      // the button, and not an exception list inside `toolbar.test.mjs`. An
      // exception list in the test would be a second opinion about the taxonomy
      // kept in the one file whose job is to have no opinions — which is the
      // exact shape of the problem that put the table under Lists.
      guest("ציטוט", "❝", "a sefer quotes where it cites; block holds nothing else a writer reaches for here"),
      b("סימן", "§"),
      b("סעיף", "א."),
      b("מראה_מקום", "‡"),
    ]),
    tbGroup(t("tools"), [
      // "Region" until this button got a name that says what it does. It makes
      // a fold — the text prints in full — and `#אזור` is now a real command
      // for a fixed area on the page, so the old label named the wrong one of
      // the two things it could have meant.
      iconBtn("▤", t("fold"), insertFold),
      iconBtn("⋯", t("palette"), openPalette),
    ]),
  ]);
}

// A Word-like Insert menu: every command from the registry, grouped by
// category, so nothing requires knowing the markup.
/** The Documents menu: every document in the library, newest first. */
function buildDocsMenu(): HTMLElement {
  return lazyMenu("documents", "🗂 " + t("documents"), docsMenuItems);
}

/**
 * Rebuilt on every open, so it never shows a stale library.
 *
 * **Two lists, and they are two different facts.** *Open* is what this session
 * is holding — with a caret, an undo history and a scroll position each. *All
 * documents* is what exists. Before the open set they were the same list with a
 * dot on one row, which is exactly the conflation that made "new document" look
 * like it had destroyed the open one.
 *
 * The controls on each row are deliberately unlike each other. Closing puts a
 * document away and destroys nothing; deleting destroys it. The inventory is
 * blunt about this — *"closing and deleting appearing as the same glyph in two
 * strips is not survivable"* — so the close control is a `⌄` labelled "close",
 * and `×` continues to mean delete and only delete.
 */
function docsMenuItems(): (Node | string)[] {
  const items: (Node | string)[] = [
    el("button", {
      class: "menu-item",
      // Named for the same reason the rows below carry `data-doc`: the label is
      // translated, and the acceptance run has to be able to say *this* item.
      "data-doc-action": "new",
      onClick: () => void newNamedDoc(),
    }, [t("newDoc")]),
    // **Here**, and not in the arrangement panel, because this is where a writer
    // asks for a new anything. The arrangement panel is where somebody who
    // already knows what an arrangement is goes to change one; the report
    // *"I don't see how to make a new tab"* came from a writer who did not, and
    // who had — correctly — looked under Documents first.
    el("button", {
      class: "menu-item",
      "data-doc-action": "new-tab",
      onClick: () => void newDocTab(),
    }, [`${t("newDocTab")} · ${hintFor("newDocTab")}`]),
    el("button", { class: "menu-item", onClick: renameDoc }, [t("rename")]),
    // "Save as" already existed, in the File menu. The margin comment asking
    // *"do we have a save as something else.ksav option?"* was written by
    // somebody looking at the document's name and its filename side by side and
    // wondering how to change the second — which is here, not under File. The
    // command is the same one; this is a second door onto it, at the place the
    // question gets asked.
    el("button", { class: "menu-item", onClick: () => void saveFileAs() }, [t("saveAs")]),
    el("button", { class: "menu-item", onClick: () => void duplicateDoc(runtime.currentDoc.id) }, [
      t("duplicate"),
    ]),
  ];

  // The open set, most recently focused first — the order the switcher uses, so
  // the two surfaces agree about what "the last document" means.
  const open = opendocs.openDocs();
  if (open.length > 1) {
    items.push(el("div", { class: "menu-sep" }));
    items.push(el("div", { class: "menu-cat" }, [`${t("openDocs")} · ${hintFor("switcher")}`]));
    for (const entry of open) {
      const meta = docs.library().find((e) => e.id === entry.id);
      if (!meta) continue;
      const here = entry.id === opendocs.focusedId();
      items.push(
        el("div", { class: "menu-item-row" }, [
          el(
            "button",
            {
              class: "menu-item menu-item-main" + (here ? " active" : ""),
              // Which document this row switches to, for anything outside this
              // file that has to say *that* one — the acceptance run's tab
              // switch, today. The title is not an identity: two documents may
              // share one, and it is translated besides.
              "data-doc": entry.id,
              onClick: () => {
                closeMenus();
                void enterDoc(entry.id);
              },
            },
            [
              el("b", {}, [(here ? "● " : "") + meta.title]),
              el("span", { class: "menu-desc" }, [meta.fileName ?? ""]),
            ],
          ),
          // Three controls on a row and three different amounts of destruction,
          // which is the whole reason none of them share a glyph: `⧉` opens a
          // second window onto this document and destroys nothing, `⌄` puts it
          // away and destroys nothing, and in the library below `×` destroys the
          // sefer. The inventory is blunt that two of those appearing as one
          // glyph "is not survivable"; a third had to keep clear of both.
          glyphBtn(
            "⧉",
            t("openInNewTab"),
            (e: Event) => {
              e.stopPropagation();
              void openInNewTab(entry.id);
            },
            "menu-newtab",
          ),
          glyphBtn(
            "⌄",
            t("closeDoc"),
            (e: Event) => {
              e.stopPropagation();
              void closeOpenDoc(entry.id);
            },
            "menu-close",
          ),
        ]),
      );
    }
  }

  items.push(el("div", { class: "menu-sep" }));
  items.push(el("div", { class: "menu-cat" }, [t("library")]));
  for (const entry of docs.library()) {
    const here = entry.id === opendocs.focusedId();
    const isOpen = opendocs.isOpen(entry.id);
    items.push(
      el("div", { class: "menu-item-row" }, [
        el(
          "button",
          {
            class: "menu-item menu-item-main" + (here ? " active" : ""),
            "data-doc": entry.id,
            onClick: () => {
              closeMenus();
              void enterDoc(entry.id);
            },
          },
          [
            // A document already open is marked as such, so a writer can see
            // that choosing it will switch to what they left rather than
            // reopening it from disk.
            el("b", {}, [(here ? "● " : isOpen ? "◦ " : "") + entry.title]),
            el("span", { class: "menu-desc" }, [
              [entry.fileName, new Date(entry.updated).toLocaleString()].filter(Boolean).join(" · "),
            ]),
          ],
        ),
        glyphBtn(
          "⧉",
          t("openInNewTab"),
          (e: Event) => {
            e.stopPropagation();
            void openInNewTab(entry.id);
          },
          "menu-newtab",
        ),
        el("button", {
          class: "menu-del",
          title: t("delete"),
          "aria-label": t("delete"),
          onClick: (e: Event) => {
            e.stopPropagation();
            void removeDoc(entry.id);
          },
        }, ["×"]),
      ]),
    );
  }
  return items;
}

/**
 * A Word-style menu over the structural registry.
 *
 * Same operations as the contextual ribbon, same enabled/disabled rule, same
 * keys — because they are the same list. The ribbon is for the writer who is
 * already in a table; a menu is for the one who is looking for the feature and
 * does not yet know that standing in a table is what reveals it. Word has both
 * for exactly that reason, and an item that greys out is itself information:
 * "this exists, and not here".
 *
 * The key is printed beside each item. A shortcut nobody can find is the same as
 * no shortcut.
 */
function structureMenuItems(structures: structure.Structure[]): (Node | string)[] {
  const doc = runtime.view ? docTextOf(runtime.view.state.doc) : "";
  const caret = runtime.view?.state.selection.main.head ?? 0;
  const pos = structure.structureNear(doc, caret)?.pos ?? caret;
  const kb = keybindings();
  const items: (Node | string)[] = [];

  for (const kind of structures) {
    const actions = structure.STRUCTURE_ACTIONS.filter((a) => a.structure === kind);
    if (actions.length === 0) continue;
    items.push(el("div", { class: "menu-cat" }, [t("structure." + kind)]));
    let group = "";
    for (const action of actions) {
      if (group && action.group !== group) items.push(el("div", { class: "menu-sep" }));
      group = action.group;
      // Computed against the live document, so the menu tells the truth about
      // this caret rather than about tables in general — and *asked*, not found
      // out by running the operation and looking at the wreckage.
      const why = structure.whyNot(action, doc, pos);
      const enabled = why === null;
      items.push(
        el(
          "button",
          {
            class: "menu-item menu-cmd" + (enabled ? "" : " disabled"),
            disabled: enabled ? null : "true",
            title: why ? t(why) : "",
            onClick: () => {
              closeMenus();
              runStructureAction(action, true);
            },
          },
          [
            el("b", {}, [`${action.glyph}  ${t(action.label)}`]),
            keyCode(action.id, kb),
            // On screen, not on a tooltip. A greyed item says "this exists, and
            // not here"; without the second half the writer is left to guess
            // which of eighteen greyed arrows is greyed for its own reason and
            // which because the caret is nowhere near a table. A tooltip does
            // not answer that — it answers one item at a time, to whoever
            // thinks to hover, and never on a touchscreen.
            ...(why ? [el("span", { class: "menu-why" }, [t(why)])] : []),
          ],
        ),
      );
    }
  }
  return items;
}

/**
 * The Macros menu.
 *
 * Rebuilt on every open (`lazyMenu`), so a macro recorded thirty seconds ago is
 * in it, and one deleted is not. Each saved macro shows what it actually does
 * rather than only its name — a list of names is a list of things nobody
 * remembers the contents of, and a macro you cannot remember is a macro you
 * will not run.
 */
function buildMacroMenu(): HTMLElement {
  return lazyMenu("macros", "⏺ " + t("macros"), () => {
    const kb = keybindings();
    const items: (Node | string)[] = [
      el("button", { class: "menu-item", onClick: () => (closeMenus(), toggleRecording()) }, [
        el("b", {}, [recording ? "⏹  " + t("macroStop") : "⏺  " + t("macroRecord")]),
        el("span", { class: "menu-desc" }, [t("macroRecordLede")]),
      ]),
      el("div", { class: "menu-sep" }),
      el("div", { class: "menu-cat" }, [t("macroSaved2")]),
    ];
    const all = savedMacros();
    if (!all.length) {
      items.push(el("div", { class: "menu-desc", style: "padding: 6px 9px" }, [t("macroNone")]));
      return items;
    }
    for (const m of all) {
      const hint = hintFor(macros.actionIdOf(m), kb);
      items.push(
        el("div", { class: "menu-item-row" }, [
          el("button", {
            class: "menu-item menu-item-main",
            onClick: () => (closeMenus(), playMacro(m)),
          }, [
            el("b", {}, [m.name]),
            el("span", { class: "menu-desc" }, [
              macros.describe(m, macroName) + (hint ? "  ·  " + hint : ""),
            ]),
          ]),
          // Repeat, which is the reason a macro exists: the writer did the thing
          // once and has eleven more to go.
          el("button", {
            class: "menu-del",
            title: t("macroRepeat"),
            onClick: async (e: Event) => {
              e.stopPropagation();
              const n = parseInt((await askText(t("macroRepeatPrompt"), "10")) ?? "", 10);
              if (Number.isFinite(n) && n > 0) {
                closeMenus();
                playMacro(m, Math.min(n, 500));
              }
            },
          }, ["×n"]),
          el("button", {
            class: "menu-del",
            title: t("delete"),
            "aria-label": t("delete"),
            onClick: (e: Event) => {
              e.stopPropagation();
              deleteMacro(m.id);
            },
          }, ["×"]),
        ]),
      );
    }
    return items;
  });
}

/** The categories the registry publishes, in the order it declares them. */
function registryCategories(): string[] {
  const cats: string[] = [];
  for (const c of runtime.commandsReg) if (!cats.includes(c.category)) cats.push(c.category);
  return cats;
}

function buildFormatMenu(): HTMLElement {
  return lazyMenu("format", "¶ " + t("format"), () => [
    // First, because it is the one thing a writer standing in prose can do to a
    // list — every operation below it needs a list to already exist, and the
    // margin note *"it looks like it is not a list"* was written by somebody
    // who had none and no way to make one out of what they had typed.
    el("button", { class: "menu-item", onClick: () => (closeMenus(), makeListHere()) }, [
      el("b", {}, ["≔ " + t("makeList")]),
      keyCode("makeList"),
      el("span", { class: "menu-desc" }, [t("makeListLede")]),
    ]),
    el("div", { class: "menu-sep" }),
    // The three acts on the construct in hand. Named for what they do to the
    // *writer's words* rather than for the markup, because that is the
    // distinction the report is about: one of these keeps them and one does
    // not, and hand-deleting brackets is what a writer does when neither is
    // offered. See `entity.ts`.
    el("div", { class: "menu-cat" }, [t("entityActs")]),
    ...([
      ["select", "⌖", "sc.entitySelect", "entitySelect"],
      ["unwrap", "⌫", "sc.entityUnwrap", "entityUnwrap"],
      ["remove", "✕", "sc.entityRemove", "entityRemove"],
    ] as const).map(([what, glyph, label, id]) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), entityAct(what)) }, [
        el("b", {}, [`${glyph} ${t(label)}`]),
        keyCode(id),
      ]),
    ),
    el("div", { class: "menu-sep" }),
    ...structureMenuItems(["heading", "list"]),
    el("div", { class: "menu-cat" }, [t("foldLevels")]),
    // Fold *to* a depth. The chips beside the toolbar take everything down or
    // put everything back, which is the only folding this product could do from
    // a door — and not the one somebody with a 300-page sefer wants.
    ...Array.from({ length: heads.MAX_LEVEL }, (_, i) => i + 1).map((level) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), foldToLevel(runtime.view, level)) }, [
        el("b", {}, [`⊟ ${tf("foldLevel", String(level))}`]),
        keyCode(`foldLevel${level}`),
      ]),
    ),
    // The other nesting. A list's depth is not a heading level and no surface
    // could ask about it — *"the same for the siman/seif hierarchy and for
    // lists, each of which has its own nesting"*. Simanim are headings, so the
    // levels above already reach them; lists needed their own row.
    el("div", { class: "menu-cat" }, [t("foldListDepths")]),
    ...LIST_DEPTHS.map((depth) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), foldListsToDepth(runtime.view, depth)) }, [
        el("b", {}, [`⊟ ${tf("foldListDepth", String(depth))}`]),
        keyCode(`foldListDepth${depth}`),
      ]),
    ),
    el("button", { class: "menu-item", onClick: () => (closeMenus(), void unfoldAll(runtime.view)) }, [
      el("b", {}, ["⊞ " + t("unfoldAll")]),
      keyCode("unfoldAll"),
    ]),
    el("div", { class: "menu-sep" }),
    // Bold, italic, the colours and the three alignments. They were in Insert,
    // which is a menu for putting something on the page, and not one of them
    // does that: every one of them needs text to already be there. See
    // `menus.ts` for the rule and for what it costs to have had none.
    ...commandRows(menus.categoriesIn("format", registryCategories())),
  ]);
}

/**
 * The three errands that go to the library, given a door.
 *
 * Inventory item 73: the service that justifies a whole process boundary with
 * Girsa had no caller at all for a long stretch, and when it got one, the one
 * it got was the command palette — which answers *"I know what I want, get me
 * there"* and cannot answer *"what is there?"*. Two of the three were worse
 * than palette-only: they were a literal `e.key` comparison in `wireKeys`,
 * which is a shortcut with no name, no entry and no way to find out it exists.
 *
 * A menu of their own rather than rows added to Insert or Format, because the
 * rule those two menus follow is about the *page* — Insert puts something new
 * on it, Format changes what is there — and not one of these does either. They
 * all ask the library a question about the words already written.
 *
 * Nothing here is hidden when Girsa is absent. Every one of them says
 * `girsaNeedsApp` when it is, which is a sentence a writer can act on; a menu
 * that quietly loses three items in the browser build is a product that looks
 * different for no stated reason.
 */
function buildSourcesMenu(): HTMLElement {
  return lazyMenu("sources", "⚯ " + t("sourcesMenu"), () => {
    const kb = keybindings();
    const item = (id: string, glyph: string, run: () => void) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), run()) }, [
        el("b", {}, [`${glyph} ${t("sc." + id)}`]),
        keyCode(id, kb),
        el("span", { class: "menu-desc" }, [t(id + "Lede")]),
      ]);
    return [
      item("citePhrase", "⌕", () => void askForMekor()),
      item("linkifyCitations", "⚯", () => void linkifySelection()),
      el("div", { class: "menu-sep" }),
      item("refreshSources", "↻", () => void refreshSources()),
    ];
  });
}

function buildTableMenu(): HTMLElement {
  return lazyMenu("table", "▦ " + t("tableMenu"), () => [
    el("button", {
      class: "menu-item",
      onClick: () => {
        closeMenus();
        // The third hand-written copy of this snippet. The three agreed, which
        // was luck: `commands.rs:97-102` records that a bare `עמודות: 2` lets
        // Typst size each column to its contents, so an empty new table renders
        // as a thumbnail shoved against the margin — a fix that landed in the
        // registry and would have had to be remembered here twice more.
        insertCommand(ACTION_COMMAND.table);
      },
    }, [el("b", {}, ["▦  " + t("insertTable")])]),
    el("div", { class: "menu-sep" }),
    ...structureMenuItems(["table"]),
    // The cell commands and the table configuration line, beside the operations
    // that act on a table. They were under Insert, three menus away from every
    // other thing about a table.
    ...commandRows(menus.categoriesIn("table", registryCategories())),
  ]);
}

/**
 * The Insert menu.
 *
 * `lazyMenu`, and not by accident: the items are rebuilt every time the menu
 * opens, because whether a command is legal *here* depends on where the caret
 * is. Built once at startup — which is what it used to do, through `menu()`,
 * which takes an already-constructed array — every entry was evaluated against
 * an empty document at position 0, where everything is legal, and the greying
 * this menu exists to show never appeared. Caught by driving the running app,
 * not by any test: a menu that is wrong only after the caret moves looks
 * perfectly correct in a screenshot of the source.
 */
function buildInsertMenu(): HTMLElement {
  return lazyMenu("insert", "➕ " + t("insert"), insertMenuItems);
}

function insertMenuItems(): (Node | string)[] {
  const kb = keybindings();
  // Read once for the whole menu, and read here rather than per row, because
  // every row in it is being built against the same caret.
  const doc = docTextNow();
  const pos = runtime.view?.state.selection.main.from ?? 0;
  /** Insert ▸ Footnote / Endnote, where a Word user looks first. */
  const noteItem = (action: string, glyph: string, snippet: string | null, why?: string) =>
    el(
      "button",
      {
        class: "menu-item" + (why ? " disabled" : ""),
        disabled: why ? "true" : null,
        title: why ? t(why) : "",
        onClick: () => {
          closeMenus();
          const st = runtime.view.state;
          insertSnippet(snippet ?? tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
        },
      },
      [
        el("b", {}, [`${glyph} ${t("sc." + action)}`]),
        keyCode(action, kb),
        ...(why ? [el("span", { class: "menu-why" }, [t(why)])] : []),
      ],
    );
  const items: (Node | string)[] = [
    // Two plain items, at the top, named the way Word names them. The chooser
    // below is the right tool for picking a sefer's apparatus; it is the wrong
    // answer to "I want a footnote", which is what somebody who has only ever
    // used Word is asking, and which had no menu entry at all. The endnote had
    // none anywhere in the product.
    noteItem("footnote", "†", "#הערה[|]"),
    noteItem("endnote", "⁋", "#הערתסיום[|]"),
    el("button", { class: "menu-item", onClick: openNotesChooser }, [
      el("b", {}, ["✻ " + t("notesChooser")]),
      el("span", { class: "menu-desc" }, [t("notesChooserLede")]),
    ]),
    // A note on a note is **not** a top-level offer, and that was the margin
    // note: it sat third in this menu, above the chooser, as though it were one
    // of the two things a person opens Insert to do. It is not — it is a second
    // note hung off one that already exists, so in ordinary prose there is
    // nothing for it to hang off and the command writes a note *beside* the
    // sentence rather than under a note.
    //
    // Below the chooser, and greyed with its reason where it cannot act, which
    // is this menu's own rule two dozen lines down: an item that silently
    // vanishes when the caret moves is a product that looks broken.
    noteItem(
      "tieredNote",
      "⁑",
      null,
      noteDepthAt(docTextNow(), runtime.view?.state.selection.main.from ?? 0) > 0
        ? undefined
        : "whyNoteOnNoteNeedsANote",
    ),
    el("button", { class: "menu-item", onClick: insertImage }, [
      el("b", {}, ["🖼 " + t("insertImage")]),
    ]),
    el("button", { class: "menu-item", onClick: openFormula }, [
      el("b", {}, ["∑ " + t("insertFormula")]),
    ]),
    el("button", { class: "menu-item", onClick: openSectionSetup }, [
      el("b", {}, ["▭ " + t("sectionSetup")]),
      el("span", { class: "menu-desc" }, [t("sectionSetupLede")]),
    ]),
    // Contents, which used to be in Format under Headings. It is neither: it
    // does not change a heading, it puts a generated page at the top of the
    // document — so it is an insertion, and this is Insert. Greyed with its
    // reason once the document has one, the same rule every other item here
    // follows. See `menus.ts` and `addContentsHere`.
    (() => {
      const already = !heads.canAddContents(docTextNow());
      return el(
        "button",
        {
          class: "menu-item" + (already ? " disabled" : ""),
          disabled: already ? "true" : null,
          onClick: () => (closeMenus(), addContentsHere()),
        },
        [
          el("b", {}, ["☰ " + t("sc.toc")]),
          keyCode("toc", kb),
          ...(already ? [el("span", { class: "menu-why" }, [t("why.contentsAlready")])] : []),
        ],
      );
    })(),
    // How deep it goes — the other half of *"choose exactly what enters the
    // table of contents"*. Beside the row that makes one, because it is the same
    // decision: before there is a contents it chooses what will be made, and
    // after there is one it edits the call in place rather than being greyed.
    // The per-heading half is `heading.inContents`, which is where a heading is.
    contentsDepthRow(),
    // The breaks, from the one list that says what they are — see
    // `actions.BREAKS` for the family and the fence that keeps it complete. In
    // order of how much of the page each one moves, and each printing the key it
    // answers to, which is what neither of the two that *had* keys used to do.
    ...BREAKS.map((id) => {
      // Greyed with its reason where the caret cannot take it, on exactly the
      // rule the registry rows below use — `#מעבר_עמוד` inside a table cell or a
      // note body does not break the page, it fails to compile, and
      // `engine/tests/containers.rs` is where that is asserted. A named row that
      // skipped this check would be a second, laxer opinion about legality
      // sitting twenty lines above the strict one, which is how a menu comes to
      // offer an insertion the grid already knows is broken.
      const command = BREAK_COMMAND[id];
      const legality = command ? legalAt(doc, pos, command) : { ok: true as const };
      return el(
        "button",
        {
          class: "menu-item" + (legality.ok ? "" : " disabled"),
          disabled: legality.ok ? null : "true",
          title: legality.ok ? "" : t(legality.reason!),
          onClick: () => (
            closeMenus(),
            // The one that is not a registry command: a comment pair the editor
            // writes, so the break is in the source and never on the page.
            command ? insertCommand(command) : hiddenBreak()
          ),
        },
        [
          el("b", {}, [`${BREAK_GLYPH[id]} ${t(id)}`]),
          keyCode(id, kb),
          el("span", { class: "menu-desc" }, [t(id + "Lede")]),
          ...(legality.ok ? [] : [el("span", { class: "menu-why" }, [t(legality.reason!)])]),
        ],
      );
    }),
    el("div", { class: "menu-sep" }),
    // The three constructs, together and in the order that makes the difference
    // between them readable: two that the page never sees, then one it sees all
    // of. Every one of them already existed; the line comment had no door of any
    // kind, and the fold's door was a button labelled "Region".
    ...[
      { name: "hideLine", glyph: "⌫", run: hideLineHere },
      { name: "hideBlock", glyph: "▨", run: hideBlockHere },
      { name: "fold", glyph: "▤", run: insertFold },
    ].map((c) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), c.run()) }, [
        el("b", {}, [`${c.glyph} ${t(c.name)}`]),
        keyCode(c.name, kb),
        el("span", { class: "menu-desc" }, [t(c.name + "Lede")]),
      ]),
    ),
    el("div", { class: "menu-sep" }),
  ];
  items.push(...commandRows(menus.categoriesIn("insert", registryCategories())));
  return items;
}

/**
 * The registry's own commands, as menu rows, for one menu's categories.
 *
 * Written once and called three times. It was the tail of the Insert menu and
 * nowhere else, which is how Insert came to hold every category the engine
 * publishes — including the eighteen that change text already written. Which
 * categories a menu shows is `menus.ts`'s answer; what a row looks like is this.
 */
function commandRows(cats: readonly string[]): (Node | string)[] {
  const lang = getLang();
  // The interface's language names the *description*; the document's names the
  // command, because the command is what lands in the source. See `buildToolbar`.
  const writing = docLang();
  const kb = keybindings();
  const doc = docTextNow();
  const pos = runtime.view?.state.selection.main.from ?? 0;
  const items: (Node | string)[] = [];
  for (const cat of cats) {
    const inCat = runtime.commandsReg.filter((x) => x.category === cat && !x.deprecated);
    if (!inCat.length) continue;
    items.push(el("div", { class: "menu-cat" }, [t("cat." + cat)]));
    for (const c of inCat) {
      // Greyed rather than hidden, with the reason on the tooltip. "This exists,
      // and not here" is information; a command that silently vanishes from the
      // menu when the caret moves is a product that looks broken.
      const legality = legalAt(doc, pos, c.he);
      // The live binding, when an action is the door to this command. Read
      // through `keybindings()` and never `DEFAULT_KEYS`, so a writer who
      // rebound `Ctrl+B` is shown the key they chose. See `actions.ts`.
      const action = actionForCommand(c.he);
      items.push(
        el(
          "button",
          {
            class: "menu-item menu-cmd" + (legality.ok ? "" : " disabled"),
            disabled: legality.ok ? null : "true",
            title: legality.ok ? "" : t(legality.reason!),
            onClick: () => insertSnippet(c.insert),
          },
          [
            el("b", {}, [lang === "he" ? c.desc_he : c.desc_en]),
            // The name the writer will find in their own source, which is the
            // document's language and not the menu's. See `buildToolbar`.
            el("code", {}, ["#" + (writing === "he" ? c.he : c.en)]),
            ...(action && hintFor(action, kb) ? [keyCode(action, kb, "menu-key")] : []),
            // The reason, where it can be read. `insertions.json` has carried a
            // `reason` per command for as long as the grid has existed and it
            // reached a tooltip; the item dropped to 38% opacity and said
            // nothing. The comment beside that rule in `styles.css` argues that
            // an item which cannot act "still says so, rather than vanishing" —
            // an argument won and then not implemented.
            ...(legality.ok ? [] : [el("span", { class: "menu-why" }, [t(legality.reason!)])]),
          ],
        ),
      );
    }
  }
  return items;
}

function menu(name: string, label: string, items: (Node | string)[]): HTMLElement {
  return lazyMenu(name, label, () => items);
}

/**
 * A menu whose contents are rebuilt every time it opens.
 *
 * The header is rendered once, so a menu built there freezes whatever the data
 * looked like at boot — the document library would still say "Untitled" long
 * after the document had been titled. Building on open keeps it honest.
 */
/**
 * A menubar menu.
 *
 * `name` is required for the same reason `iconBtn` requires an accessible name:
 * every label here is an emoji plus a translated word, so the menubar had no
 * identity that survived switching the interface to English. `data-menu` is that
 * identity, and it is the only way anything outside this file — the acceptance
 * run in `.github/scripts/acceptance.mjs`, today — can say *which* menu it means.
 *
 * The items are built on open, so the menu has to be opened before its contents
 * exist in the document at all. That is deliberate and worth knowing about: a
 * selector for a menu item that never clicks the button first finds nothing, and
 * will report it as a missing feature.
 */
function lazyMenu(name: string, label: string, build: () => (Node | string)[]): HTMLElement {
  const list = el("div", { class: "menu-list", role: "menu", "aria-label": label });
  const btn = el("button", {
    class: "menu-btn",
    type: "button",
    "aria-haspopup": "true",
    "aria-expanded": "false",
    onClick: (e: Event) => {
      e.stopPropagation();
      const opened = toggleMenu(list, btn, () => {
        list.replaceChildren();
        list.append(...build().map((n) => (typeof n === "string" ? document.createTextNode(n) : n)));
      });
      // **Back to the top.** Replacing the children does not reset the scroll
      // position, so Insert — the tallest menu in the product by a long way —
      // reopened halfway down wherever it was left, which reads as a menu that
      // has lost its first twenty items. Wanted at the top, and configurable,
      // because somebody working through one long stretch of it wants the
      // opposite and is entitled to say so.
      //
      // **After `toggleMenu`, not inside its `fill`.** The fill runs before the
      // `open` class goes on, and a hidden element has no scroll to set: written
      // there it was a line that read correctly, ran on every open, and did
      // nothing at all. Found by driving it.
      if (opened && !settings.keepMenuPosition) list.scrollTop = 0;
    },
  }, [label]);
  return el("div", { class: "menu", "data-menu": name }, [btn, list]);
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
    recording: !!recording,
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
              onClick: () => void startFromTemplate(ut.body, ut.name),
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
        return el("button", { class: "menu-item", onClick: () => void loadTemplate(tpl) }, [
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
    importWord: () => void importWord(),
    importOrg: () => void importOrg(),
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

// ---------------------------------------------------------------- settings drawer
function numberRow(labelKey: string, key: Field, min: number, max: number, step: number) {
  const input = el("input", {
    type: "number",
    min,
    max,
    step,
    // The live value, which for page setup is the open document's (B26).
    value: String(now(key)),
    onChange: (e: Event) => setSetting(key, Number((e.target as HTMLInputElement).value) as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
/**
 * A number the writer may leave unset.
 *
 * `numberRow` renders `String(now(key))`, which for an absent optional prints
 * the word "undefined" into the box. That matters here beyond looking wrong: the
 * four per-edge margins mean *"follow the one margin"* when unset, so an empty
 * box is a real and useful state, and clearing one has to write `undefined`
 * back rather than zero — a zero margin and an unset margin are different pages.
 */
function optNumberRow(labelKey: string, key: Field, min: number, max: number, step: number) {
  const live = now(key);
  const input = el("input", {
    type: "number",
    min,
    max,
    step,
    placeholder: t("perEdgeHint"),
    value: live === undefined || live === null ? "" : String(live),
    onChange: (e: Event) => {
      const raw = (e.target as HTMLInputElement).value.trim();
      setSetting(key, (raw === "" ? undefined : Number(raw)) as never);
    },
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}

/** Remove an optional page field entirely: absent means "decide from the
 * document", which merging cannot say. Same write path as `setPageSetup`. */
function clearPageField(key: Field): void {
  const doc = runtime.currentDoc;
  if (!doc) return;
  const config: Record<string, unknown> = { ...(doc.config ?? {}) };
  delete config[key];
  runtime.setCurrentDoc({ ...doc, config });
  void docs.rememberConfig(doc.id, config).catch(reportSaveFailure);
}

/**
 * The page-foot reserve row: a length (`2cm`, `40pt`) or a percent of a
 * chosen base, blank meaning the engine decides. The percent is converted
 * to centimetres here — the engine's knob is centimetres — using the open
 * document's own sheet and margins, so the number the writer sees is the
 * number the layout gets.
 */
function reserveRow() {
  const input = el("input", {
    type: "text",
    placeholder: t("perEdgeHint").replace(/שוליים/g, "").trim() || "2cm",
    value: (() => {
      const cm = now("notes_region_cm");
      return cm === undefined || cm === null ? "" : `${cm}cm`;
    })(),
  });
  const base = el(
    "select",
    {},
    [
      ["sheet", t("baseSheet")],
      ["text", t("baseText")],
    ].map(([v, label]) => {
      const o = el("option", {}, [label]);
      (o as HTMLOptionElement).value = v;
      return o;
    }),
  );
  const apply = (raw: string) => {
    if (raw === "") return clearPageField("notes_region_cm");
    if (raw.endsWith("%")) {
      const frac = Number(raw.slice(0, -1)) / 100;
      if (!Number.isFinite(frac)) return;
      const pageH = Number(now("page_height_cm")) || 29.7;
      const mTop = Number(now("margin_top_cm") ?? now("margin_cm") ?? 2.5);
      const mBot = Number(now("margin_bottom_cm") ?? now("margin_cm") ?? 2.5);
      const baseH = (base as HTMLSelectElement).value === "text" ? pageH - mTop - mBot : pageH;
      setSetting("notes_region_cm", Math.round(frac * baseH * 1000) / 1000 as never);
    } else {
      const cm = raw.endsWith("pt")
        ? (Number(raw.slice(0, -2)) * 2.54) / 72
        : raw.endsWith("mm")
          ? Number(raw.slice(0, -2)) / 10
          : raw.endsWith("in")
            ? Number(raw.slice(0, -2)) * 2.54
            : Number(raw);
      if (Number.isFinite(cm)) setSetting("notes_region_cm", Math.round(cm * 1000) / 1000 as never);
    }
  };
  input.onchange = (e: Event) => apply((e.target as HTMLInputElement).value.trim());
  base.onchange = () => apply(input.value.trim());
  // The same write path under the writer's hand: dragging is typing, one
  // value at a time, through `setSetting`.
  const slider = el("input", { type: "range", min: "0", max: "12", step: "0.1" });
  const sync = () => {
    const cm = now("notes_region_cm");
    (slider as HTMLInputElement).value = String(cm ?? 0);
  };
  sync();
  (slider as HTMLInputElement).oninput = () => {
    const cm = Number((slider as HTMLInputElement).value);
    setSetting("notes_region_cm", Math.round(cm * 1000) / 1000 as never);
    input.value = `${cm}cm`;
  };
  const originalApply = apply;
  const applyAndUpdateSlider = (raw: string) => {
    originalApply(raw);
    sync();
  };
  input.onchange = (e: Event) => applyAndUpdateSlider((e.target as HTMLInputElement).value.trim());
  base.onchange = () => applyAndUpdateSlider(input.value.trim());
  return el("div", { class: "set-row" }, [el("span", {}, [t("notesReserve")]), input, slider, base]);
}


/** A fixed choice, labelled through the dictionary like every other row. */
function selectRow(labelKey: string, key: Field, options: [string, string][]) {
  const live = String(now(key) ?? "");
  const sel = el(
    "select",
    {
      // A stable name, across languages and themes — the same rule `header.ts`
      // states for the chips, applied where it was equally missing. Every row in
      // this drawer was a `<select>` with a localised `<option>` list and nothing
      // else, so the only way to find one from outside was by its label text: a
      // selector that works in Hebrew and silently matches nothing in English.
      // The acceptance run drives the editing-mode row through this.
      "data-setting": key,
      onChange: (e: Event) => setSetting(key, (e.target as HTMLSelectElement).value as never),
    },
    options.map(([value, label]) =>
      el("option", { value, ...(live === value ? { selected: "selected" } : {}) }, [label]),
    ),
  );
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), sel]);
}

/**
 * Where a note's prose sits in the source — the document-level preference, and
 * one override per destination.
 *
 * **Thing one of the note model, and it is not a note-layout question.** Where
 * the prose sits changes the *file* and never the page: the engine's own
 * `every_note_layout_lays_out_identically_with_deferred_bodies` renders each
 * layout twice, inline and deferred, and asserts every run landed on the same
 * page at the same coordinates at the same size. So it does not belong in the
 * chooser that asks where a note prints, and it is here, with the other
 * preferences about reading and writing the source.
 *
 * It had no home at all before this. The global answer existed only as two
 * buttons *inside* the notes chooser — the one surface it is not allowed to be
 * in — so a writer who wanted their bodies at the end of the file had to open a
 * panel about note layouts to say so, and a writer who never opened that panel
 * had no way to discover the preference existed.
 *
 * Its own builder rather than a stack of `selectRow`s because the per-
 * destination answers are keys of the `noteBodyPlacement` record, not scalar
 * `Field`s that `setSetting` knows how to write. An empty value clears the key,
 * which is what "default" means: fall back to the global answer above.
 */
function noteBodyRows(): HTMLElement[] {
  const homes: [string, string][] = BODY_HOMES.map((h) => [h, t("bodyHome." + h)]);
  const global = el(
    "select",
    {
      "data-setting": "noteBodyHome",
      onChange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value as BodyHome;
        settings.noteBodyHome = v;
        // The boolean this replaced, kept in step rather than left to rot: it is
        // still what an older build reads, and two answers to one question that
        // can disagree is the defect family this repository is named for.
        settings.deferNoteBodies = defersBody(v);
        saveSettings();
      },
    },
    homes.map(([value, label]) =>
      el("option", { value, ...(value === bodyHome() ? { selected: "selected" } : {}) }, [label]),
    ),
  );
  const rows = [
    el("label", { class: "set-row" }, [el("span", {}, [t("noteBodyHomeLabel")]), global]),
    el("p", { class: "set-hint" }, [t("noteBodyHomeNote")]),
  ];
  // One override per destination, keyed by the destination's own id — so a
  // writer keeps their footnotes in the sentence and sends the haaros at the
  // back to a block at the end of the source.
  for (const d of DESTINATIONS) {
    const live = settings.noteBodyPlacement?.[d.id] ?? "";
    const options: [string, string][] = [["", t("bodyHome.default")], ...homes];
    const sel = el(
      "select",
      {
        "data-setting": `noteBodyPlacement.${d.id}`,
        onChange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          const map = { ...(settings.noteBodyPlacement ?? {}) };
          if ((BODY_HOMES as readonly string[]).includes(v)) map[d.id] = v as BodyHome;
          else delete map[d.id];
          settings.noteBodyPlacement = map;
          saveSettings();
        },
      },
      options.map(([value, label]) =>
        el("option", { value, ...(value === live ? { selected: "selected" } : {}) }, [label]),
      ),
    );
    rows.push(el("label", { class: "set-row" }, [el("span", {}, [t("dest." + d.id)]), sel]));
  }
  // The two sweeps and the tidy, beside the preference rather than behind a
  // panel about note layouts. Changing the answer above decides where the *next*
  // note's prose goes; these are how the notes already written follow it, and a
  // preference with no way to apply it to the document in hand is half a
  // feature.
  rows.push(
    el("div", { class: "set-row set-actions" }, [
      el("button", { type: "button", "data-defer-sweep": "end", onClick: () => deferAll(runtime.view) }, [
        t("deferAllAction"),
      ]),
      el("button", { type: "button", "data-defer-sweep": "inline", onClick: () => inlineAll(runtime.view) }, [
        t("deferRecallAllAction"),
      ]),
      el("button", { type: "button", "data-defer-sweep": "sort", onClick: () => sortDeferredBodies(runtime.view) }, [
        t("deferSortAction"),
      ]),
    ]),
  );
  return rows;
}

/**
 * Where the text sits: justified, right, centre or left — one row.
 *
 * Its own function rather than a `selectRow`, because the answer is written to
 * *two* page fields at once and `setSetting` writes one. Writing them
 * separately would put the document through a state holding both an edge and
 * `justify: true` — briefly, and then compiled, because each write schedules a
 * compile. `setPageSetup` takes the pair in one act.
 */
function alignRow() {
  const cfg = docConfig();
  const live = settings_.alignChoice(cfg);
  const sel = el(
    "select",
    {
      onChange: (e: Event) => {
        const choice = (e.target as HTMLSelectElement).value as settings_.AlignChoice;
        setPageSetup(settings_.alignSetup(choice));
        scheduleCompile();
      },
    },
    settings_.ALIGN_CHOICES.map((value) =>
      el("option", { value, ...(live === value ? { selected: "selected" } : {}) }, [
        t(`align.${value}`),
      ]),
    ),
  );
  return el("label", { class: "set-row" }, [el("span", {}, [t("textAlign")]), sel]);
}

/**
 * A comma-separated list, edited as text and stored as an array.
 *
 * The split is deliberately forgiving about spaces and empty entries — a
 * keyword list is the kind of field where a trailing comma is a keystroke, not
 * an intention.
 */
function listRow(labelKey: string, key: Field) {
  const live = now(key);
  const input = el("input", {
    type: "text",
    value: Array.isArray(live) ? live.join(", ") : "",
    onChange: (e: Event) => {
      const parts = (e.target as HTMLInputElement).value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      setSetting(key, parts as never);
    },
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}

function checkRow(labelKey: string, key: Field) {
  const input = el("input", {
    type: "checkbox",
    ...(now(key) ? { checked: "checked" } : {}),
    onChange: (e: Event) => setSetting(key, (e.target as HTMLInputElement).checked as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
function textRow(labelKey: string, key: Field, placeholder = "") {
  const input = el("input", {
    type: "text",
    placeholder,
    // `now`, not `settings`: header and footer are page setup and belong to the
    // open document (B26), so reading the app preference here showed one value
    // in the box and typeset another on the page.
    value: String(now(key) ?? ""),
    onInput: (e: Event) => setSetting(key, (e.target as HTMLInputElement).value as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
function textAreaRow(labelKey: string, key: keyof Settings, placeholder = "") {
  const ta = el(
    "textarea",
    {
      class: "set-textarea",
      rows: 4,
      placeholder,
      onInput: (e: Event) => setSetting(key, (e.target as HTMLTextAreaElement).value as never),
    },
    [String(settings[key] ?? "")],
  );
  return el("div", { class: "set-block" }, [el("span", {}, [t(labelKey)]), ta]);
}

/**
 * The font control: a real list, grouped by where each face comes from.
 *
 * > *"The font dropdown is ugly. Named plainly, recorded plainly."*
 *
 * It was not a dropdown. It was a text box with a `datalist` hint, so choosing a
 * font meant typing a family name exactly right — and typed wrong, nothing said
 * so: Typst falls back to whatever it can find and the sefer comes out in a face
 * nobody chose. Each option is drawn **in its own face**, which is the plainest
 * naming there is; the group it sits in says whether it will still resolve on
 * somebody else's machine.
 *
 * The typed route survives as the last option rather than as the only one. A
 * font installed on this machine is real and no list the application can build
 * knows its name, so refusing the text box would have taken a working thing
 * away — see `fonts.ts`.
 */
function buildFontPicker(): HTMLElement {
  const assets = runtime.currentDoc?.assets ?? [];
  const current = docConfig().font;
  const options = fonts.fontOptions(BUNDLED_FONTS, assets, current);
  const box = el("span", { class: "font-pick" }, []);

  const typeIt = () => {
    const input = el("input", {
      type: "text",
      class: "font-typed",
      value: current,
      "aria-label": t("font"),
      onChange: (e: Event) => {
        setSetting("font", (e.target as HTMLInputElement).value as never);
        rerenderChrome();
      },
    });
    box.replaceChildren(input, addFontButton());
    input.focus();
  };

  const sel = el(
    "select",
    {
      id: "font-family",
      onChange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === OTHER_FONT) return typeIt();
        setSetting("font", v as never);
        rerenderChrome();
      },
    },
    [
      ...fonts.fontGroups(options).map((g) =>
        el(
          "optgroup",
          { label: t(`fontFrom.${g.source}`) },
          g.fonts.map((f) =>
            el(
              "option",
              {
                value: f.name,
                // Drawn in its own face. A list of font names set in one face is
                // a list of strings; the whole question a writer is asking here
                // is what the letters look like.
                style: `font-family:"${f.name}"`,
                ...(f.name === current ? { selected: "selected" } : {}),
              },
              [f.name],
            ),
          ),
        ),
      ),
      el("option", { value: OTHER_FONT }, [t("fontOther")]),
    ],
  );
  box.replaceChildren(sel, addFontButton());
  return box;
}

/** The `+` that attaches a font file to this document — labelled, not a bare glyph. */
function addFontButton(): HTMLElement {
  return glyphBtn("+", t("addFont"), () => void addFont(), "mini");
}

/** The sentinel value of the "name it yourself" row. Not a family anybody has. */
const OTHER_FONT = "__ksav-other-font__";

function buildSettingsDrawer(): HTMLElement {
  const fontSel = buildFontPicker();
  const dirSel = el(
    "select",
    { onChange: (e: Event) => setSetting("dir", (e.target as HTMLSelectElement).value as never) },
    [
      el("option", { value: "rtl", ...(docConfig().dir === "rtl" ? { selected: "selected" } : {}) }, [t("rtl")]),
      el("option", { value: "ltr", ...(docConfig().dir === "ltr" ? { selected: "selected" } : {}) }, [t("ltr")]),
    ],
  );
  const paperSel = el(
    "select",
    { onChange: (e: Event) => setSetting("paper", (e.target as HTMLSelectElement).value as never) },
    [
      ["a4", "A4"],
      ["us-letter", "Letter"],
      ["a5", "A5"],
      ["a3", "A3"],
    ].map(([v, lbl]) =>
      el("option", { value: v, ...(docConfig().paper === v ? { selected: "selected" } : {}) }, [lbl]),
    ),
  );
  // The writer's own words, listed so a mistaken "add to dictionary" can be
  // undone — otherwise a typo taught by accident is permanent and invisible.
  const dictWords = spell.userWords();
  const dictRows = dictWords.length
    ? dictWords.map((w) =>
        el("div", { class: "set-row asset-row" }, [
          el("span", { class: "asset-name" }, [w]),
          glyphBtn(
            "×",
            t("delete"),
            () => {
              spell.removeUserWord(w);
              spellFullPending = true;
              runSpellCheck();
              rerenderChrome();
            },
            "mini",
          ),
        ]),
      )
    : [el("div", { class: "set-note" }, [t("emptyDictionary")])];

  const assets = runtime.currentDoc?.assets ?? [];
  const assetRows = assets.length
    ? assets.map((a) =>
        el("div", { class: "set-row asset-row" }, [
          el("span", { class: "asset-name" }, [(a.kind === "font" ? "🅵 " : "🖼 ") + a.name]),
          glyphBtn("×", t("removeAsset"), () => void removeAsset(a.name), "mini"),
        ]),
      )
    : [el("div", { class: "set-note" }, [t("noAssets")])];

  return el("aside", { id: "settings-drawer", class: "drawer", "aria-label": t("settings") }, [
    // Every other panel in the app closes with × and with Escape; this one used
    // to close only by finding the ⚙ chip again — and below 720px the drawer is
    // the full viewport width, so that chip is *underneath it*. There was
    // literally no way out of Settings on a phone.
    panelHead("settings-drawer", "settings", { level: "h3" }),
    // B26. The fourteen fields below this line belong to the **open document** and
    // travel with it; everything under `fitWidthLabel` is about the person at the
    // desk. Saying which is which is the whole point — a writer who does not know
    // whether a margin follows the sefer or the machine cannot use either.
    el("div", { class: "set-note" }, [t("setupIsPerDoc")]),
    el("label", { class: "set-row" }, [el("span", {}, [t("font")]), fontSel]),
    numberRow("fontSize", "size_pt", 8, 36, 1),
    numberRow("margin", "margin_cm", 1, 6, 0.5),
    el("label", { class: "set-row" }, [el("span", {}, [t("direction")]), dirSel]),
    el("label", { class: "set-row" }, [el("span", {}, [t("paper")]), paperSel]),
    // A custom page size, which overrides the named paper when **both** are
    // given. Empty is the ordinary state and means "use the paper above" — the
    // same "absent is an instruction" rule the four per-edge margins follow, and
    // the reason both rows are optional rather than pre-filled with A4's
    // numbers.
    optNumberRow("pageWidth", "page_width_cm", 1, 200, 0.5),
    optNumberRow("pageHeight", "page_height_cm", 1, 200, 0.5),
    checkRow("pageNumbers", "numbering"),
    checkRow("hebrewNumbering", "hebrew_numbering"),
    // One row, four answers. Was a `justify` tick box with nothing beside it,
    // which is why a centred sheet had to be done paragraph by paragraph.
    alignRow(),
    numberRow("lineSpacing", "line_spacing_em", 0.4, 1.5, 0.05),
    numberRow("paraSpacing", "para_spacing_em", 0, 3, 0.1),
    numberRow("firstIndent", "first_line_indent_em", 0, 4, 0.25),
    numberRow("columns", "columns", 1, 3, 1),
    textRow("headerText", "header", ""),
    textRow("footerText", "footer", ""),
    // > *"Header and footer content lives in the settings drawer, which makes
    // > anything beyond plain text — bold, mixed runs — hard to express. They
    // > are document content in a settings control."*
    //
    // Both halves are answered by moving them into the document: `#כותרת_עליונה`
    // takes content, so everything the writer can type works, and a document may
    // set it more than once — the masechta over one chapter and a different one
    // over the next, which no settings field could ever have said.
    //
    // The boxes above stay. Plain text is still the common case and typing it
    // into a field is still the shortest way to get it; this is the door out of
    // that field for the moment it is not enough, and it carries what is already
    // written across rather than making the writer type it twice.
    el("div", { class: "set-note" }, [t("runningHeadNote")]),
    el("div", { class: "set-row" }, [
      el("button", { class: "sc-key", type: "button", onClick: () => moveRunningIntoDoc("header") }, [
        t("headerToDocument"),
      ]),
      el("button", { class: "sc-key", type: "button", onClick: () => moveRunningIntoDoc("footer") }, [
        t("footerToDocument"),
      ]),
    ]),
    // Everything a sefer that will be *printed and bound* needs and a document
    // read on a screen does not. Kept in its own group and off by default, so
    // the ordinary page setup above stays five fields rather than eighteen.
    el("h3", { style: "margin-top:18px" }, [t("bindingTitle")]),
    el("div", { class: "set-note" }, [t("bindingNote")]),
    checkRow("twoSided", "two_sided"),
    optNumberRow("marginTop", "margin_top_cm", 0, 7, 0.25),
    optNumberRow("marginBottom", "margin_bottom_cm", 0, 7, 0.25),
    optNumberRow("marginInner", "margin_inner_cm", 0, 7, 0.25),
    optNumberRow("marginOuter", "margin_outer_cm", 0, 7, 0.25),
    numberRow("gutter", "gutter_cm", 0, 5, 0.25),
    reserveRow(),
    selectRow("reserveOverflow", "reserve_overflow", [
      ["grow", t("overflowGrow")],
      ["refuse", t("overflowRefuse")],
      ["flow", t("overflowFlow")],
    ]),
    selectRow("headAlign", "head_align", [
      ["center", t("headAlign.center")],
      ["outside", t("headAlign.outside")],
      ["inside", t("headAlign.inside")],
    ]),
    textRow("headerOdd", "header_odd", ""),
    textRow("headerEven", "header_even", ""),
    textRow("footerOdd", "footer_odd", ""),
    textRow("footerEven", "footer_even", ""),
    el("h3", { style: "margin-top:18px" }, [t("pdfTitle")]),
    textRow("docTitle", "title", ""),
    textRow("docAuthor", "author", ""),
    listRow("docKeywords", "keywords"),
    selectRow("pdfStandard", "pdf_standard", [
      ["", t("pdfStandard.none")],
      ["a-2b", "PDF/A-2b"],
      ["a-3b", "PDF/A-3b"],
      ["a-4", "PDF/A-4"],
      ["ua-1", "PDF/UA-1"],
      ["1.7", "PDF 1.7"],
      ["2.0", "PDF 2.0"],
    ]),
    checkRow("pdfTagged", "pdf_tagged"),
    checkRow("preventOrphans", "prevent_orphans"),
    checkRow("continuous", "continuous"),
    el("div", { class: "set-note" }, [t("pdfStandardNote")]),
    // The affordance per-document setup takes away and has to give back: a
    // writer who has got their sefer looking right wants the next one to start
    // there, rather than setting fourteen fields again.
    el("div", { class: "set-row" }, [
      el("button", { class: "sc-key", type: "button", onClick: adoptPageSetupAsDefault }, [
        t("setAsDefault"),
      ]),
    ]),
    el("h3", { style: "margin-top:18px" }, [t("thisMachine")]),
    checkRow("fitWidthLabel", "fitWidth"),
    // Where the outline and the notes list go. Asked for twice in the margins,
    // about two different drawers, in the same words: a panel that covers the
    // source is a panel you have to close to read what it is telling you about.
    selectRow("panelPlacementLabel", "panelPlacement", [
      ["float", t("placement.float")],
      ["pane", t("placement.pane")],
    ]),
    // Two zooms, named for the two things they zoom. The bounds and the step are
    // `zoom.ts`'s, not four numbers typed into two calls: they are a fact about
    // what a zoom is, and the keyboard has to agree with the panel about them.
    numberRow("zoomSource", "sourceZoom", zoom.MIN, zoom.MAX, zoom.STEP),
    numberRow("zoom", "zoom", zoom.MIN, zoom.MAX, zoom.STEP),
    // Which of the two a Ctrl+= lands on is not guessable from the rows above,
    // and it is the whole reason there is one pair of keys rather than two.
    el("div", { class: "set-note" }, [t("zoomNote")]),
    checkRow("autoSnapshotLabel", "autoSnapshot"),
    numberRow(
      "autoSnapshotMinutes",
      "autoSnapshotMinutes",
      docs.MIN_SNAPSHOT_MINUTES,
      docs.MAX_SNAPSHOT_MINUTES,
      1,
    ),
    el("div", { class: "set-note" }, [snapshotNote()]),
    selectRow("editingModeLabel", "editingMode", [
      ["default", t("mode.default")],
      ["vim", t("mode.vim")],
      ["emacs", t("mode.emacs")],
    ]),
    el("div", { class: "set-note" }, [editingModeNote()]),
    selectRow("tabCompileLabel", "tabCompile", [
      ["keep", t("tabCompile.keep")],
      ["idle", t("tabCompile.idle")],
      ["onSwitch", t("tabCompile.onSwitch")],
    ]),
    el("div", { class: "set-note" }, [t("tabCompileNote")]),
    checkRow("focusModeLabel", "focusMode"),
    checkRow("typewriterLabel", "typewriter"),
    // The note, because this is the one setting here whose effect a writer
    // cannot see by looking: at rest it is a document that scrolls slightly
    // differently, and nothing on screen says so.
    el("div", { class: "set-note" }, [t("typewriterNote")]),
    selectRow("typewriterAnchorLabel", "typewriterAnchor", [
      ["upper", t("typewriterAnchor.upper")],
      ["center", t("typewriterAnchor.center")],
      ["lower", t("typewriterAnchor.lower")],
    ]),
    checkRow("autocompleteLabel", "autocomplete"),
    checkRow("autoPairBracketsLabel", "autoPairBrackets"),
    checkRow("autoPairQuotesLabel", "autoPairQuotes"),
    // Off by default, and the note says why rather than leaving a writer to
    // discover it by fighting their own gershayim for an hour.
    el("div", { class: "set-note" }, [t("autoPairQuotesNote")]),
    checkRow("keepMenuPositionLabel", "keepMenuPosition"),
    // Off by default, and the note says what the strip is — because a writer
    // who has never seen it cannot decide about a control they cannot picture,
    // and the one who turned it off wants to know what they turned off.
    checkRow("proseStripLabel", "proseStrip"),
    el("div", { class: "set-note" }, [t("proseStripNote")]),
    checkRow("spellcheckLabel", "spellcheck"),
    checkRow("spellcheckCommentsLabel", "spellcheckComments"),
    el("div", { id: "spell-coverage", class: "set-note" }, [spellCoverageNote()]),
    // The strip's own visibility, beside the rest of "what is on screen". It
    // defaults to `always` now: it used to appear only at two arrangements, and
    // the `+` that makes the second one lives *in* it, so the only visible door
    // to the feature opened once you had already used it.
    selectRow("tabStripLabel", "tabStrip", [
      ["always", t("tabStrip.always")],
      ["auto", t("tabStrip.auto")],
      ["never", t("tabStrip.never")],
    ]),
    // Four switches where there was one, and the one did not do what it said.
    // "Synced scrolling" used to gate the caret follow and the source click and
    // leave the actual pane-to-pane scrolling alone; each of these now gates
    // exactly the behaviour it is named after, which is what *"each
    // independently"* asks for and also the only way the labels stop lying.
    checkRow("syncScrollLabel", "syncScroll"),
    checkRow("followCaretLabel", "followCaret"),
    checkRow("clickToPreviewLabel", "clickToPreview"),
    checkRow("clickToSourceLabel", "clickToSource"),
    selectRow("clickTargetLabel", "clickTarget", [
      ["match", t("clickTarget.match")],
      ["keep", t("clickTarget.keep")],
    ]),
    el("div", { class: "set-note" }, [t("clickTargetNote")]),
    selectRow("outlineJumpLabel", "outlineJump", [
      ["source", t("outlineJump.source")],
      ["preview", t("outlineJump.preview")],
      ["both", t("outlineJump.both")],
    ]),
    el("div", { class: "set-note" }, [t("outlineJumpNote")]),
    selectRow("openInLabel", "openIn", [
      ["reuse", t("openIn.reuse")],
      ["newTab", t("openIn.newTab")],
      ["current", t("openIn.current")],
    ]),
    el("div", { class: "set-note" }, [t("openInNote")]),
    // One section for all of it, which the report asks for by name. The four
    // rows are one question — *how does the other pane follow this one* — and
    // they were spread between a checkbox here and two constants in the source.
    selectRow("syncMatchLabel", "syncMatch", [
      ["direction", t("syncMatch.direction")],
      ["top", t("syncMatch.top")],
      ["middle", t("syncMatch.middle")],
      ["bottom", t("syncMatch.bottom")],
    ]),
    numberRow("syncDeadZoneLabel", "syncDeadZone", 0, 60, 1),
    checkRow("syncExactLabel", "syncExact"),
    numberRow("syncSettleMsLabel", "syncSettleMs", 0, 2000, 50),
    el("p", { class: "set-hint" }, [t("syncSettleNote")]),
    selectRow("previewDelayLabel", "previewDelay", [
      ["live", t("previewDelay.live")],
      ["relaxed", t("previewDelay.relaxed")],
      ["manual", t("previewDelay.manual")],
    ]),
    // Which sefer a search reads. Here as well as on the find drawer itself:
    // this is where a writer sets the application up, and that is where they
    // meet the consequence — a control that lives in only one of the two is a
    // control somebody has to already know about.
    selectRow("searchScope", "searchScope", [
      ["source", t("searchScope.source")],
      ["preview", t("searchScope.preview")],
      ["both", t("searchScope.both")],
    ]),
    checkRow("searchCaseSensitive", "searchCaseSensitive"),
    el("p", { class: "set-hint" }, [t("searchCaseSensitiveNote")]),
    // Keeping a hand-numbered series in order. Beside the search rows rather
    // than in a corner of its own is arbitrary; what is not arbitrary is that
    // the *report* has a row of its own — a rewrite of the writer's own
    // characters that says nothing is the thing to be able to turn off, and it
    // is not the same question as whether to rewrite at all.
    checkRow("renumberAuto", "renumberAuto"),
    checkRow("renumberReport", "renumberReport"),
    el("p", { class: "set-hint" }, [t("renumberNote")]),
    // How the deferred bodies at the foot of the file are arranged. Beside the
    // renumbering rows because both are about the *source* staying legible
    // rather than about the page.
    checkRow("deferGrouped", "deferGrouped"),
    el("p", { class: "set-hint" }, [t("deferGroupedNote")]),
    // The two history ceilings. Beside the snapshot cadence rather than in a
    // corner of their own, because *how often* and *how many are kept* are one
    // question asked twice, and a writer changing one wants to see the other.
    numberRow("maxSnapshotsLabel", "maxSnapshots", 1, 500, 5),
    numberRow("maxHistoryMBLabel", "maxHistoryMB", 0.25, 200, 0.5),
    el("p", { class: "set-hint" }, [t("historyLimitsNote")]),
    el("h3", { style: "margin-top:18px" }, [t("notePlacementLabel")]),
    ...noteBodyRows(),
    checkRow("autosaveFileLabel", "autosaveFile"),
    checkRow("checkUpdatesLabel", "checkUpdates"),
    el("div", { class: "set-note" }, [t("checkUpdatesNote")]),
    el("div", { class: "set-note" }, [`${t("version")} ${update.CURRENT_VERSION}`]),
    el("h3", { style: "margin-top:18px" }, [t("userDictionary")]),
    // The dictionary is per browser profile, so it is invisible to the desktop
    // app and gone if that profile is cleared. Until there is somewhere to sync
    // it to, the writer at least owns it as a file.
    el("div", { class: "set-row" }, [
      el("button", { class: "sc-key", type: "button", onClick: exportDictionary }, [
        t("exportDictionary"),
      ]),
      el("button", { class: "sc-key", type: "button", onClick: () => void importDictionary() }, [
        t("importDictionary"),
      ]),
    ]),
    ...dictRows,
    el("h3", { style: "margin-top:18px" }, [t("assetsTitle")]),
    ...assetRows,
    el("h3", { style: "margin-top:18px" }, [t("customization")]),
    textAreaRow("customCommandsLabel", "customCommands", "#let דגש(x) = text(fill: red, strong(x))"),
    textAreaRow("snippetsLabel", "snippets", "בסד = בס\"ד\nסי = #סימן[|][]"),
    // A door, not the room.
    //
    // Sixty-odd rows of key capture used to be printed here, below the paper
    // size, the margins, the dictionary and the asset list — one scrolling
    // drawer with two subjects in it, which is the first half of inventory item
    // 126. They live in `keys-drawer` now, searchable, with a key of their own.
    // What stays is this line, because Settings is where somebody who has not
    // learned the key will look first.
    el("h3", { style: "margin-top:18px" }, [t("shortcuts")]),
    el("label", { class: "set-row" }, [
      el("span", {}, [t("keysOpen")]),
      el("button", {
        // The mode class here too, and for the same reason it is on every menu's
        // `<code>`: under Vim or Emacs this button goes on working — it is a
        // click — but the chord it used to print stopped, so what it prints now
        // is `M-x keysdrawer`, which is how the keyboard actually reaches it.
        class: "sc-key" + (hintIsMode() ? " sc-key-mode" : ""),
        type: "button",
        id: "keys-open",
        onClick: () => {
          closePanel("settings-drawer");
          openKeys();
        },
      }, [hintFor("keysDrawer") || t("keysTitle")]),
    ]),
    ...buildAboutSection(),
  ]);
}

/**
 * The licence notice, in the app.
 *
 * Not decoration and not a nicety. Six font files are compiled into the engine,
 * so every way Ksav is distributed — the installers, the server binary, and the
 * ~23 MB wasm module the browser build downloads — is a redistribution of them.
 * Both the SIL OFL and the GUST licence require their notice to accompany a
 * redistribution, and a web build has no installer to put a text file beside.
 * So the notice lives where the software is.
 *
 * The facts themselves come from `engine/src/notices.rs`, which sits beside the
 * `include_bytes!` lines that create the obligation and is tied to them by a
 * test in both directions. This was the fourth hand-kept copy of them — after
 * the Markdown, the licence texts and the font list — and the failure mode of a
 * fourth copy of a licence notice is a licence violation on every download,
 * arriving quietly, with a green test suite.
 */
const BUNDLED_FONT_NOTICES = BUNDLED_NOTICES.filter((n) => n.kind === "font");

/**
 * The lexicon notices, for the same reason as the fonts.
 *
 * `lexicon-en.txt` is a word list derived from the English Speller Database, and
 * ESDB's licence covers derived word lists explicitly: the copyright and
 * permission notice must appear in all copies. The list is compiled into the
 * engine with `include_str!`, so every binary and the wasm module are copies.
 * The Hebrew lexicon needs no notice — it is built from Public Domain text — and
 * it is named here anyway, because "which dictionaries is this thing using" is a
 * fair question and the answer should not be half an answer.
 */
const BUNDLED_LEXICON_NOTICES = BUNDLED_NOTICES.filter((n) => n.kind === "lexicon");

function buildAboutSection(): Node[] {
  return [
    el("h3", { style: "margin-top:18px" }, [t("aboutTitle")]),
    el("div", { class: "set-note" }, [t("aboutLicence")]),
    el("div", { class: "set-note" }, [t("aboutFonts")]),
    ...BUNDLED_FONT_NOTICES.map(noticeRow),
    el("div", { class: "set-note" }, [t("aboutLexicons")]),
    ...BUNDLED_LEXICON_NOTICES.map(noticeRow),
  ];
}

function noticeRow(n: { name: string; copyright: string; licence: string; url: string }): HTMLElement {
  return el("div", { class: "font-notice" }, [
    el("b", {}, [n.name]),
    el("span", {}, [n.copyright]),
    el("a", { href: n.url, target: "_blank", rel: "noopener noreferrer" }, [n.licence]),
  ]);
}

let capturing = false;
function captureShortcut(actionId: string, btn: HTMLButtonElement) {
  if (capturing) return;
  capturing = true;
  const original = btn.textContent || "—";
  btn.textContent = t("pressKey");
  btn.classList.add("capturing");
  const done = (text: string) => {
    capturing = false;
    btn.classList.remove("capturing");
    btn.textContent = text;
    window.removeEventListener("keydown", handler, true);
  };
  const handler = async (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return done(original);
    const key = eventToKey(e);
    if (!key) return; // still waiting for a non-modifier key
    // Refuse to bind a chord that another action already holds without saying so.
    // Silently assigning it left two actions on one key, one of them shadowed with
    // no way to tell which won. Offer to move it; if declined, keep what was there.
    const kb = keybindings();
    const conflict = whoHolds(kb, key, actionId);
    let reassigned = false;
    if (conflict) {
      if (!(await ask(tf("shortcutConflict", key)))) return done(original);
      // Unbind the other so the chord is held by exactly one action.
      settings.keybindings = { ...(settings.keybindings || {}), [conflict]: "", [actionId]: key };
      reassigned = true;
    } else {
      settings.keybindings = { ...(settings.keybindings || {}), [actionId]: key };
    }
    saveSettings();
    reconfigureShortcuts();
    done(key);
    // Redraw so the action that lost the chord shows as unbound, not stale.
    if (reassigned) rerenderChrome();
  };
  window.addEventListener("keydown", handler, true);
}
function exportDictionary() {
  const name = "ksav-dictionary.txt";
  files.download(name, spell.exportUserWords());
  // Said, like every other file that leaves. This one is outside `exports.ts`
  // and was therefore outside the fence there, which is the whole reason the
  // rule now lives in `prohibitions.test.mjs` instead.
  setStatus(`✓ ${tf("exported", name)}`, "ok");
}

async function importDictionary() {
  const f = await pickFile(".txt,text/plain");
  if (!f) return;
  const added = spell.importUserWords(await f.text());
  spellFullPending = true;
  runSpellCheck();
  rerenderChrome();
  setStatus(added ? tf("dictionaryImported", added) : t("dictionaryNothingNew"), added ? "ok" : "");
}

function resetShortcuts() {
  delete settings.keybindings;
  saveSettings();
  reconfigureShortcuts();
  rerenderChrome();
}
function toggleSettings() {
  togglePanel("settings-drawer");
}

// ---- outline / document map ----
//
// Two ways to show it, and the writer picks which. *"Maybe there should be a
// toggle to have this shift the other panes open, because now it covers
// source"* — a panel that covers the source is a panel you have to close to read
// what it is telling you about, which is the opposite of what an outline is for.
//
// Once the window is a tree, "shift the other panes open" is not a mode to
// build; it is what a pane already is. `settings.panelPlacement` decides, and
// it decides for the notes list too, because the second margin comment about
// this said "maybe also for all of them".
function toggleOutline() {
  settings.outline = !settings.outline;
  saveSettings();
  if (settings.panelPlacement === "pane") togglePanelPane("outline", settings.outline);
  else togglePanel("outline-drawer", settings.outline);
  rerenderChrome();
}

/**
 * Put a side panel in the pane tree, or take it out.
 *
 * Docked at the inline start of the whole window rather than beside whatever
 * pane happens to be focused: an outline is about the *document*, not about one
 * view of it, and a writer who splits the source twice does not want a third
 * outline. It is the one pane whose position is decided rather than chosen.
 */
function togglePanelPane(role: "outline" | "notes" | "marks", on: boolean) {
  const existing = panes.leaves(paneTree).find((l) => l.role === role);
  if (on && !existing) {
    setTree(panes.split(paneTree, paneTree.id, "row", panes.leaf(role, null, { linked: false }), true));
  } else if (!on && existing) {
    setTree(panes.closePane(paneTree, existing.id));
  }
}

// ---- the notes pane ----
//
// Word's navigation pane, for notes. Anyone with more than ten notes works by
// scanning a list and jumping, not by scrolling the source hunting for the one
// that began "ועיין" — and the notes are the text a writer most often needs to
// get back to. Ksav had an outline of the headings and nothing for the notes,
// which in a sefer is the larger half of the document.

function toggleNotesPane() {
  settings.notesPane = !settings.notesPane;
  saveSettings();
  if (settings.panelPlacement === "pane") togglePanelPane("notes", !!settings.notesPane);
  else togglePanel("notes-drawer", !!settings.notesPane);
  rerenderChrome();
}

// ---- the marks pane ----
//
// The third list surface, and the one the mark register was asked for by name:
// *"you should be able to … see just these in some list somewhere."* A collection
// that only exists once the document is printed is a collection a writer has to
// take on trust while they are writing it.
//
// Grouped by class rather than in reading order, because the question is always
// about one class — every lemma, every siman, every place in Shas. What a row
// shows and how the groups are ordered is `panelrows.markList`; what a mark *is*
// is `marks.ts`; this is the two of them drawn into every home the list has.

function toggleMarksPane() {
  settings.marksPane = !settings.marksPane;
  saveSettings();
  if (settings.panelPlacement === "pane") togglePanelPane("marks", !!settings.marksPane);
  else togglePanel("marks-drawer", !!settings.marksPane);
  rerenderChrome();
}

function renderMarksPane() {
  if (!runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const rows = panelrows.markList(marksIn(doc), marks.MARK_CLASSES);
  // The class rows carry their Hebrew class name; `panelrows` does not resolve
  // language, so the translation happens here, once, where every other string in
  // this file is translated.
  for (const r of rows.rows) {
    if (r.id?.startsWith("markclass:")) r.label = t("markClass." + r.label);
  }
  for (const host of document.querySelectorAll<HTMLElement>(".marks-list")) {
    drawList(host, rows, LOOKS.marks);
  }
}

/**
 * The find drawer: every place a phrase appears, in whichever sefer was asked
 * for.
 *
 * The source half is read off the buffer that is on screen. The printed half is
 * read off `pages_text`, which the engine filled in on the last compile because
 * `compile.searchingThePage` asked it to — never off the source under a second
 * name, which is the fake the item warns about and the only way this feature
 * can be got wrong while looking right.
 */
function renderFindPane() {
  const host = document.getElementById("find-list");
  if (!host || !runtime.view) return;
  const query = (document.getElementById("find-query") as HTMLInputElement | null)?.value ?? "";
  const scope = settings.searchScope ?? "source";
  // The chooser on the drawer follows the setting, wherever the setting was
  // changed. The same question is asked in two places by design — here and in
  // the settings drawer — and a control that shows one answer while the search
  // uses another is worse than having only one of them.
  const chooser = document.getElementById("find-scope") as HTMLSelectElement | null;
  if (chooser && chooser.value !== scope) chooser.value = scope;
  const result = find.findIn(
    docTextOf(runtime.view.state.doc),
    currentPageText(),
    query,
    { scope, caseSensitive: !!settings.searchCaseSensitive },
  );
  const rows = panelrows.findList(result, query, scope);
  // The group headings and the two empty states carry i18n keys rather than
  // words: `panelrows` does not resolve language. The same arrangement as the
  // marks pane's class rows, and translated in the same place — here, once.
  for (const r of rows.rows) {
    if (r.id?.startsWith("findgroup:") || r.id?.startsWith("findempty:")) r.label = t(r.label);
  }
  drawList(host, rows, LOOKS.find);
}

function renderNotesPane() {
  if (!runtime.view) return;
  // A row jumps to wherever the prose actually is. For a deferred note that is
  // the `#גוף_הערה` at the end of the file, which is the whole point of the row:
  // the marker is easy to find and the prose is not.
  const doc = docTextOf(runtime.view.state.doc);
  const notes = notesIn(doc);
  // The markers the last compile printed, where it printed any. The drawer is
  // redrawn on a keystroke and a compile is seconds behind it, so an offset that
  // no longer names the same note simply matches nothing and that row counts
  // instead — which is why the marker is matched against the *current* scan
  // rather than cached against the one the compile saw.
  const rows = panelrows.noteList(notes, doc, markersFor(notes, runtime.lastResult?.note_markers ?? []));
  for (const host of document.querySelectorAll<HTMLElement>(".notes-list")) {
    drawList(host, rows, LOOKS.notes);
  }
}

/**
 * Right-click on a note: convert it, delete it, or hang another note off it.
 *
 * The consolation prize from §1.4 and rather more. `#הערה` is now genuinely
 * tier 1, so a sub-note hangs off it with no conversion at all — but the band
 * apparatuses collect their own markers and cannot adopt a native footnote
 * without printing its text twice, so for those, converting in place beats
 * retyping the note.
 */
function openNoteMenu(e: MouseEvent, at: number) {
  closeSpellMenu();
  const doc = docTextOf(runtime.view.state.doc);
  const note = noteAt(doc, at);
  if (!note) return;
  // Where it prints, not what it is called. A note does not change *command* to
  // move any more, it changes **argument** — so the menu offers the five
  // destinations plus whatever regions this document declared, and the note the
  // writer right-clicked keeps its prose, its name and its tier through the
  // change.
  //
  // Derived from the document rather than hand-listed. This was six Hebrew
  // literals out of eighteen note commands, so twelve layouts were unreachable
  // from the menu and the English spellings were unreachable from anywhere.
  const here = noteDestination(doc, note);
  const targets = destinationTargets(doc, note);
  const menu = el("div", { class: "spell-menu note-menu" }, [
    el("div", { class: "menu-cat" }, [t("dest." + here.dest) + (here.region ? " · " + here.region : "")]),
    el(
      "button",
      {
        class: "menu-item",
        onClick: () => {
          closeNoteMenu();
          // At the end of the note's prose, which for a deferred note is not
          // `to - 1` — the marker has no body to sit inside, and a sub-note
          // written after it would have hung off the sentence, not the note.
          runtime.view.dispatch({ selection: { anchor: note.bodyTo } });
          insertSnippet(tieredNoteHere(doc, note.bodyTo));
        },
      },
      [el("b", {}, ["⁑ " + t("sc.tieredNote")])],
    ),
    el("div", { class: "menu-cat" }, [t("noteConvert")]),
    ...targets.map((pick) =>
      el(
        "button",
        {
          class: "menu-item menu-cmd",
          "data-note-to": pick.region ?? pick.dest,
          onClick: () => {
            closeNoteMenu();
            const e2 = retargetNote(docTextOf(runtime.view.state.doc), note, pick, dirLang());
            // …and then whatever the destination needs in order to print, which
            // is what `applyNotePick` — docstringed *"The only place that
            // does"* — has always done for an inserted note. Without it,
            // sending a footnote to the back produced a stream nothing printed:
            // the "collected and never rendered" failure, performed by the
            // product and then reported back to the writer as a lint.
            const done = scaffold(e2.text, e2.caret, pick, dirLang());
            replaceAll(done.text, done.caret ?? e2.caret);
            setStatus(tf("noteConverted", t("dest." + pick.dest)), "ok");
          },
        },
        [el("span", {}, [pick.region ?? t("dest." + pick.dest)])],
      ),
    ),
    el("div", { class: "menu-sep" }),
    el(
      "button",
      {
        class: "menu-item",
        onClick: () => {
          closeNoteMenu();
          const e2 = deleteNote(docTextOf(runtime.view.state.doc), note);
          replaceAll(e2.text, e2.caret);
          setStatus(t("noteDeleted"), "ok");
        },
      },
      [el("b", {}, ["✕ " + t("noteDelete")])],
    ),
  ]);
  menu.style.position = "fixed";
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  // Through the registry, not `document.body.append`. It was dismissible all
  // along — but only because `.spell-menu`, which it wears for its styling, is
  // what the spell menu's sweep selects on. See the `note-menu` row in
  // `panels.ts` for why that is a fragility rather than a fix.
  mountPanel("note-menu", menu, document.body);
}

/**
 * Apply a rewritten document as the smallest change that produces it.
 *
 * Every producer here returns whole text, which is the right shape for a pure
 * function and the wrong thing to dispatch. `{from: 0, to: doc.length}` tells
 * CodeMirror that every character was replaced, so it discards the syntax tree,
 * the decorations, the lint marks and **every open fold** — including the
 * `//{ … //}` regions this app invites the writer to make. On a 500 KB sefer
 * that happened on every `†`: the document came out identical and the screen
 * did not, because everything the writer had collapsed was open again.
 *
 * `minimalChange` finds the span that actually differs, so the state either side
 * of it stays addressed by positions that did not move. See `diff.ts`.
 *
 * Not for *loading* a document — `openDoc`, `loadBody` and an arriving source
 * really do replace everything, and resetting the folds is correct there. This
 * is for the operations that edit the document the writer is already in.
 */
function editDoc(next: string, caret?: number, extra: { scrollIntoView?: boolean } = {}) {
  const change = minimalChange(docTextOf(runtime.view.state.doc), next);
  const unchanged = change.from === change.to && change.insert === "";
  runtime.view.dispatch({
    // An operation can apply and still produce the same source — swapping two
    // identical rows is a real edit with no visible result. Dispatching the
    // document over itself would push an empty step onto the undo stack and
    // recompile for nothing, so only the caret moves.
    changes: unchanged ? undefined : change,
    ...(caret == null ? {} : { selection: { anchor: Math.min(caret, next.length) } }),
    ...extra,
  });
}

/** Swap the whole document and put the caret somewhere sensible. */
function replaceAll(text: string, caret: number) {
  editDoc(text, caret);
  scheduleCompile();
  runtime.view.focus();
}
function renderOutline() {
  if (!runtime.view) return;
  const rows = panelrows.outlineList(outline(docTextOf(runtime.view.state.doc)));
  // Every home the list has: the drawer, and a pane if the writer docked it.
  // A class rather than an id, for the same reason the preview stopped being
  // `#preview` — "the outline" is however many of them are on screen.
  for (const host of document.querySelectorAll<HTMLElement>(".outline-list")) {
    drawList(host, rows, LOOKS.outline);
  }
}

/**
 * How a panel's rows are dressed.
 *
 * Four panels, four sets of classes, and they are genuinely different: the
 * outline is one line of text with an ellipsis on the button, a note row is a
 * flex row with an ordinal, and the palette and history are `.pal-item`. What
 * they share is the *row model*, which is now in `panelrows.ts` and testable;
 * what differs is the stylesheet, and that stays here.
 */
interface Look {
  row: string;
  /** The leading chip's class — an ordinal in the notes pane, a category badge elsewhere. */
  chip: string;
  /** The words: `b` where the row is a flex line of parts, `span` where it is a line of text. */
  label: "b" | "span";
  /** This panel has a keyboard selection, so row 0 opens selected and the mouse moves it. */
  selectable?: boolean;
}

const LOOKS: Record<string, Look> = {
  outline: { row: "outline-item", chip: "pal-cat", label: "span" },
  notes: { row: "outline-item note-item", chip: "note-item-n", label: "span" },
  // The same dress as the notes pane: a leading count where that has an ordinal,
  // and one line of words. A third stylesheet for a third list of clickable lines
  // would be the copy this module exists to stop.
  marks: { row: "outline-item note-item", chip: "note-item-n", label: "span" },
  history: { row: "pal-item", chip: "pal-cat", label: "b" },
  palette: { row: "pal-item", chip: "pal-cat", label: "b", selectable: true },
  // The commands drawer wears the palette's row, because a row that inserts a
  // command should look the same wherever it is offered. It is not selectable:
  // the drawer is browsed with the mouse and the search field, and a keyboard
  // selection that Enter runs belongs to the modal that closes afterwards.
  commands: { row: "pal-item", chip: "pal-cat", label: "b" },
  // The notes pane's row again: a chip carrying a page or a line, and one line
  // of words. A fourth stylesheet for a fourth list of clickable lines is the
  // copy `panelrows` exists to stop.
  find: { row: "outline-item note-item", chip: "note-item-n", label: "span" },
};

/**
 * Draw a [`PanelList`] — the one place the four list panels turn rows into DOM.
 *
 * What a row *is* is `panelrows.ts`'s question and is answered without a
 * browser. What is left here is the effect: the empty state, the indent, the
 * click, and the sentence about what a cap left out.
 */
function drawList(host: HTMLElement, list: PanelList, look: Look, snaps: docs.Snapshot[] = []) {
  // `refreshPanes` fires this for every docked pane and drawer five times a
  // second while typing, and the row model is identical on almost all of them.
  // A rebuild that changes nothing is pure waste — hundreds of element and
  // closure allocations discarded on the next beat — and it is not free of
  // consequence: `innerHTML = ""` resets `host.scrollTop`, so a writer who
  // scrolled the outline to a later chapter is snapped back to the top on their
  // next keystroke, and any row hover or keyboard selection is destroyed on the
  // same beat. So: draw only when the serialized model actually changed, and
  // preserve the scroll position across the rebuild when it did.
  const sig = look.row + "|" + JSON.stringify(list);
  // `childElementCount` guards the case where something else emptied the host
  // since we last drew (a panel closing, say): the signature would still match
  // but the DOM would be gone, so redraw rather than trust the stamp alone.
  if (host.dataset.listSig === sig && host.childElementCount > 0) return;
  const keepScroll = host.scrollTop;
  host.dataset.listSig = sig;
  host.innerHTML = "";
  if (list.empty) {
    host.append(el("div", { class: "outline-empty" }, [t(list.empty)]));
    return;
  }
  list.rows.forEach((r, i) => host.append(drawRow(r, look, i === 0, snaps)));
  // A cap that says nothing reads as completeness. This is the sentence that
  // was missing from a palette showing 60 of the registry's 115 commands.
  if (list.hidden) {
    host.append(el("div", { class: "outline-empty" }, [tf("moreHidden", String(list.hidden))]));
  }
  host.scrollTop = keepScroll;
}

/**
 * Take the writer to a place in the document, in whichever panes they asked for.
 *
 * The outline's whole job is *"take me to that chapter"*, and it moved the caret
 * in the source and left the preview showing whatever it had been showing — so
 * on a screen where the preview is the pane being read, the one control for
 * getting around answered in the pane that was not. `outlineJump` makes it a
 * choice, because which pane you want to land in depends on how the panes are
 * arranged and nothing here can work that out.
 *
 * The caret moves in all three cases, including `preview`, and that is not a
 * compromise: the preview half is `revealCursor`, which asks the compiler where
 * the *caret* printed, so there is no way to move the preview that does not go
 * through the caret first. What the three answers really choose is which pane
 * **scrolls** — and `preview` deliberately leaves the source where it was, so a
 * writer reading the laid-out sefer is not also dragged down their own file.
 *
 * `revealCursor` is quiet here. A jump that lands nowhere on the page is
 * ordinary rather than exceptional — a heading inside a folded region, a mark in
 * a part of the sefer this compile did not reach — and the source half has
 * already done something the writer can see.
 */
function goToOffset(at: number) {
  const where = settings.outlineJump ?? "source";
  jumpTo(at, where !== "preview");
  if (where !== "source") void revealCursor({ quiet: true });
}

/**
 * Perform a [`panelrows.RowAction`] — the six lines every list-shaped surface
 * shares.
 *
 * Out of `drawRow` because help now speaks the same vocabulary: a help entry
 * that names an operation can run it, and a second copy of this `switch` beside
 * the help panel is how one of them would come to disagree with the other.
 */
function runRow(does: panelrows.RowAction, snaps: docs.Snapshot[] = []) {
  switch (does.kind) {
    case "jump":
    case "note":
      goToOffset(does.at);
      return;
    case "action":
      closePalette();
      runAction(does.id);
      return;
    case "insert":
      insertSnippet(does.snippet);
      closePalette();
      return;
    case "restore":
      void restoreSnapshot(snaps[does.index]);
      return;
    case "hit":
      // Both, when both are known, and in this order: the caret first, because
      // that is where the writer will type, and the page second so the eye can
      // follow. A printed hit that no source line answers for — a running head,
      // a note's marker, an auto-numbered siman — shows the page and leaves the
      // caret alone rather than putting it somewhere plausible.
      if (does.at !== undefined) goToOffset(does.at);
      if (does.page !== undefined && does.y !== undefined) revealPrinted(does.page, does.y);
  }
}

/**
 * Scroll every preview to a point on a page, given in Typst points.
 *
 * The tail of `revealCursor`, and it is the tail rather than a copy of it: what
 * `revealCursor` does that this does not is *ask the engine where the caret
 * printed*, which a find hit already knows. Everything from there down — the
 * page element, the box, the inverse of `jump.ts`'s arithmetic, the match point
 * — is the same problem and would have been the same code written twice.
 */
function revealPrinted(page: number, y: number) {
  const pages = currentPages();
  const index = page - 1;
  const box = pageBox(pages[index]);
  if (!box) return;
  for (const host of document.querySelectorAll<HTMLElement>(".preview-host")) {
    const node = host.querySelector<HTMLElement>(`.page[data-page="${index}"]`);
    if (!node) continue;
    const spot = pixelInPage({ page: index, x_pt: 0, y_pt: y }, node.getBoundingClientRect(), box);
    const pageTop = node.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
    host.scrollTo({
      top: clampScroll(pageTop + spot.y - matchFraction() * host.clientHeight, host),
      behavior: "smooth",
    });
  }
}

function drawRow(r: PanelRow, look: Look, first: boolean, snaps: docs.Snapshot[]): HTMLElement {
  const run = () => runRow(r.does, snaps);
  const attrs: Record<string, unknown> = {
    class: look.row + (look.selectable && first ? " sel" : ""),
    onClick: run,
    ...(r.indent ? { style: `padding-inline-start:${panelrows.indentPx(r.indent)}px` } : {}),
    ...(r.title ? { title: t(r.title) } : {}),
    ...(r.does.kind === "action" ? { "data-action": r.does.id } : {}),
  };
  if (look.selectable) {
    // Hover moves the selection so the mouse and the keyboard never disagree
    // about which row Enter would run.
    attrs.onMouseEnter = (e: Event) => {
      const row = e.currentTarget as HTMLElement;
      row.parentElement?.querySelectorAll(".pal-item.sel").forEach((x) => x.classList.remove("sel"));
      row.classList.add("sel");
    };
  }
  if (r.does.kind === "note") {
    const marker = r.does.marker;
    attrs.onContextMenu = (e: Event) => {
      e.preventDefault();
      openNoteMenu(e as MouseEvent, marker);
    };
  }
  const when = r.when !== undefined ? new Date(r.when) : null;
  const button = el("button", attrs, [
    ...(r.chip ? [el("span", { class: look.chip }, [t(r.chip)])] : []),
    ...(when ? [el("span", { class: look.chip }, [when.toLocaleDateString()])] : []),
    ...(r.note ? [el("span", { class: "note-item-def" }, [r.note])] : []),
    el(look.label, {}, [r.label]),
    ...(r.trailing ? [el("code", {}, [r.trailing])] : []),
    ...(when ? [el("code", {}, [when.toLocaleTimeString()])] : []),
  ]);
  return r.full || r.context ? expandable(button, r) : button;
}

/**
 * A row that can be opened where it stands.
 *
 * Asked for the notes pane — *"it should expand to the whole note, and to the
 * line the note sits on"*. A row shows a gist, which is enough to recognise a
 * note and never enough to read one, and the only way to read it was to leave
 * the list and go to the text. The jump is still what the row itself does; this
 * is the other question a writer has about a note, which is what it says.
 */
function expandable(button: HTMLElement, r: PanelRow): HTMLElement {
  const body = el("div", { class: "row-more" }, [
    ...(r.full ? [el("div", { class: "row-full" }, [r.full])] : []),
    ...(r.context ? [el("div", { class: "row-context" }, [r.context])] : []),
  ]);
  const toggle = el("button", {
    class: "row-expand",
    type: "button",
    title: t("expandRow"),
    "aria-label": t("expandRow"),
    "aria-expanded": "false",
    onClick: (e: Event) => {
      const wrap = (e.currentTarget as HTMLElement).parentElement!;
      // `expanded`, not `open`: `open` belongs to the panel registry, which
      // owns every panel's visibility and has a guard saying so. A row that
      // opens in place is not a panel and must not borrow the word.
      const shown = wrap.classList.toggle("expanded");
      (e.currentTarget as HTMLElement).setAttribute("aria-expanded", String(shown));
    },
  }, ["⌄"]);
  return el("div", { class: "row-wrap" }, [button, toggle, body]);
}
// ---- version history (local snapshots) ----
//
// Scoped to a document. History used to be one `ksav.history` key holding
// `{t, body}` records with no document id in them, so the list shown while you
// were in document A was every snapshot ever taken of every document — and
// restoring one silently replaced A's text with B's, with no way back. There is
// nothing to filter on in a record that does not say what it belongs to, so the
// records now live under the document itself (see `docs.ts`).

async function takeSnapshot(force = false): Promise<boolean> {
  if (!runtime.view || !runtime.currentDoc) return false;
  const body = docTextOf(runtime.view.state.doc);
  try {
    const stored = await docs.pushSnapshot(runtime.currentDoc.id, body);
    if (!stored && force) {
      // Nothing changed since the last snapshot: the point is already kept.
      setStatus(t("snapshotUnchanged"), "");
    }
    if (isPanelOpen("history-modal")) await renderHistory();
    if (stored) await refreshBaseline();
    return stored;
  } catch (e) {
    // History is a convenience, but a *failed* history write means the store is
    // in trouble, and the writer needs to know that before their text is next.
    reportSaveFailure(e);
    return false;
  }
}

async function restoreSnapshot(s: docs.Snapshot) {
  if (!(await ask(t("confirmRestore")))) return;
  await takeSnapshot(true); // snapshot current before restoring, so it's not lost
  loadBody(s.body);
  closeHistory();
}

function openHistory() {
  openPanel("history-modal");
}
function closeHistory() {
  closePanel("history-modal");
}

async function renderHistory() {
  const host = document.getElementById("history-list");
  if (!host || !runtime.currentDoc) return;
  const snaps = await docs.snapshots(runtime.currentDoc.id);
  const scope = el("div", { class: "history-scope" }, [tf("historyOf", runtime.currentDoc.title)]);
  drawList(host, panelrows.historyList(snaps), LOOKS.history, snaps);
  // Say whose history this is: with one list per document, the title is the
  // thing that makes "restore" a safe button to press. Prepended after the fact
  // because `drawList` owns the list and this is not part of it.
  host.prepend(scope);
  // **What the history costs, and the way to stop paying it.**
  //
  // Nothing anywhere said. Snapshots hold whole document bodies rather than
  // diffs, so the biggest seforim — the ones whose history matters most — hit
  // the byte ceiling first and end up with the *fewest* restore points, and the
  // only evidence of that was restore points quietly not being there. The
  // number is measured off the same list the rows are drawn from, so it cannot
  // disagree with what is on screen.
  const cost = docs.historyCost(snaps);
  const limit = docs.historyLimits(settings);
  const clear = el("button", { class: "sc-key" }, [t("historyClear")]);
  clear.addEventListener("click", () => {
    if (!runtime.currentDoc) return;
    if (!confirm(t("historyClearConfirm"))) return;
    void docs.clearHistory(runtime.currentDoc.id).then(() => {
      setStatus(t("historyCleared"), "ok");
      void renderHistory();
    });
  });
  host.append(
    el("p", { class: "styles-note history-cost" }, [
      tf(
        "historyCost",
        String(cost.count),
        String(limit.count),
        (cost.bytes / (1024 * 1024)).toFixed(1),
        (limit.bytes / (1024 * 1024)).toFixed(1),
      ),
    ]),
    el("p", { class: "styles-note" }, [t("historyWholeBodies")]),
    clear,
  );
}

// ---------------------------------------------------------------- version control
//
// The drawer over `engine/src/git.rs`. Three rules run through all of it:
//
//   * **Every unavailable state says which one it is.** `git.standing` returns
//     one of three reasons and each has its own sentence — save the document,
//     use the installed application, install git. A drawer that greys out with
//     no explanation is the fault this repository is named after.
//   * **git's own words are shown, never rephrased.** "Permission denied
//     (publickey)" is the one string a reader can search for.
//   * **The comparison is the change gutter.** "Compare with now" sets the same
//     baseline the snapshot history sets, so a git commit and a snapshot are
//     read the same way, by one diff, in the margin the writer already knows.
//     A second diff view over `git diff`'s unified text would be a second
//     opinion about what changed in one document, in one application.

/** What the drawer last learned, so a redraw does not restart a subprocess. */
let gitState: api.GitStatus | null = null;
/** The last thing git said, shown until the next operation replaces it. */
let gitSaid = "";
/** An operation is in flight; the buttons are disabled and say so. */
let gitBusy = false;
/** `true` while the history list is showing the whole repository. */
let gitWholeRepo = false;
let gitCommits: api.GitCommit[] = [];
let gitBranches: api.GitBranch[] = [];
let gitRemotes: api.GitRemote[] = [];

/** Where version control stands for the document that is open now. */
function gitStanding(): git.Standing {
  return git.standing(runtime.currentBinding, runtime.backend?.kind ?? "");
}

/**
 * Ask git one thing.
 *
 * Returns `null` when this document cannot be asked about at all, which the
 * callers treat as "the drawer already says why" rather than as a failure —
 * every one of them is reached from a button that only exists once `standing`
 * is `ready`.
 */
async function askGit(op: git.GitOp, extra: Record<string, unknown> = {}): Promise<api.GitAnswer | null> {
  const where = gitStanding();
  if (where.kind !== "ready" || !runtime.backend) return null;
  gitBusy = true;
  renderGitPanel();
  try {
    return await runtime.backend.git(op, where.path, extra);
  } catch (e) {
    // A transport that threw is not git refusing: the engine went away, or the
    // desktop command failed. Shown as it arrived, for the same reason git's
    // own sentences are.
    return { ok: false, git: null, root: null, error: String((e as Error)?.message ?? e) };
  } finally {
    gitBusy = false;
  }
}

/**
 * Re-read the whole state and redraw.
 *
 * One `status` and, when there is a repository, the three lists beside it.
 * Asked together rather than lazily per section: they are four short
 * subprocesses on a local directory, and a drawer that fills in section by
 * section as each returns is a drawer that is wrong three times on the way to
 * being right.
 */
async function refreshGit(): Promise<void> {
  const where = gitStanding();
  if (where.kind !== "ready") {
    gitState = null;
    renderGitPanel();
    rerenderChrome();
    return;
  }
  const status = (await askGit("status")) as api.GitStatus | null;
  gitState = status;
  if (status?.root) {
    const [log, branches, remotes] = await Promise.all([
      askGit("log", { scope: gitWholeRepo ? "repo" : "file", limit: 50 }),
      askGit("branches"),
      askGit("remotes"),
    ]);
    gitCommits = log?.commits ?? [];
    gitBranches = branches?.branches ?? [];
    gitRemotes = remotes?.remotes ?? [];
  } else {
    gitCommits = [];
    gitBranches = [];
    gitRemotes = [];
  }
  renderGitPanel();
  // The chip reports what the drawer found. Without this the state is only
  // visible while the drawer is open, which is the opposite of what a chip is
  // for.
  rerenderChrome();
}

/** Run an operation, show what git said, and re-read everything. */
async function runGit(op: git.GitOp, extra: Record<string, unknown> = {}): Promise<api.GitAnswer | null> {
  const answer = await askGit(op, extra);
  const said = git.outcome(answer);
  gitSaid = said.said;
  await refreshGit();
  return answer;
}

function openGit() {
  closeMenus();
  openPanel("git-panel");
}

function isGitOpen(): boolean {
  return isPanelOpen("git-panel");
}

/**
 * Throw away what git said about the *previous* document.
 *
 * Called when the open document changes and when it is saved to a new file.
 * The state here is about one path on disk, and keeping it across a switch
 * would leave the chip reporting a branch and a change count belonging to a
 * sefer that is no longer on screen. Re-asked immediately when the drawer is
 * open, because a drawer that empties and waits for a click is its own small
 * lie.
 */
function forgetGit(): void {
  gitState = null;
  gitSaid = "";
  gitCommits = [];
  gitBranches = [];
  gitRemotes = [];
  if (isGitOpen()) void refreshGit();
}

/** The file on disk changed under version control's feet: re-read, if open. */
function gitMayHaveChanged(): void {
  if (isGitOpen()) void refreshGit();
}

/**
 * What the chipbar is told.
 *
 * `undefined` until something has actually asked git, because "not asked" and
 * "clean" are different states and a chip that reads clean before a `git
 * status` has run is the interface lying about what it displays.
 */
function gitForHeader(): header.HeaderState["vcs"] {
  if (!gitState) return undefined;
  const h = git.health(gitState);
  return {
    health: h,
    branch: gitState.root ? git.position(gitState).branch : "",
    changes: git.changed(gitState).length,
  };
}

/**
 * The drawer.
 *
 * Rebuilt whole on every change rather than patched, like every other panel
 * here: the alternative is a set of update paths that each have to remember
 * which of six sections a `git merge` can change, and the answer is all of
 * them.
 *
 * **Which sections there are is `git.face`'s decision, not this function's.**
 * That split is not tidiness. The assembled run drives a browser against
 * `ksav serve`, where a document is bound through a file handle and therefore
 * has no path — so everything below the first `switch` is unreachable by the
 * one test in this product that looks at the screen. Every state a writer
 * actually uses this drawer in could have been wrong and the suite would have
 * been green. `git.face` can be driven with a status nothing had to produce,
 * and `git.test.mjs` does.
 */
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

function renderGitPanel(): void {
  const box = document.getElementById("git-body");
  if (!box) return;
  box.replaceChildren(
    ...panelviews.gitPanel(
      {
        face: git.face(gitStanding(), gitState, gitCommits, gitBranches, gitRemotes),
        status: gitState,
        commits: gitCommits,
        branches: gitBranches,
        remotes: gitRemotes,
        said: gitSaid,
        busy: gitBusy,
        wholeRepo: gitWholeRepo,
      },
      {
        run: (op, extra) => void runGit(op, extra),
        compare: (c) => void compareWithCommit(c),
        restore: (c) => void restoreCommit(c),
        revert: (c) => void revertCommit(c),
        setScope: (whole) => {
          gitWholeRepo = whole;
          void refreshGit();
        },
      },
    ),
  );
}
/**
 * Compare the document with how it was at a commit.
 *
 * The change gutter's baseline, which is the same mechanism the snapshot
 * history uses — one diff, one set of marks in the margin, one thing to learn.
 * It holds until the next snapshot resets it, which is what `refreshBaseline`
 * already does and is worth saying rather than leaving to be discovered.
 */
async function compareWithCommit(c: api.GitCommit): Promise<void> {
  const answer = await askGit("show", { rev: c.hash });
  if (!answer || answer.ok === false || typeof answer.text !== "string") {
    gitSaid = git.outcome(answer).said;
    renderGitPanel();
    return;
  }
  runtime.view.dispatch({ effects: setBaseline.of(answer.text) });
  setStatus(`${t("git.compare")} · ${c.short}`, "ok");
}

async function restoreCommit(c: api.GitCommit): Promise<void> {
  const stamp = git.when(c.when, getLang());
  if (!(await ask(tf("git.confirmRestore", stamp), { danger: true }))) return;
  // A snapshot first, exactly as restoring a snapshot takes one: whatever is in
  // the editor now must survive being replaced.
  await takeSnapshot(true);
  const answer = await askGit("show", { rev: c.hash });
  if (!answer || answer.ok === false || typeof answer.text !== "string") {
    gitSaid = git.outcome(answer).said;
    renderGitPanel();
    return;
  }
  loadBody(answer.text);
  setStatus(tf("git.restored", stamp), "ok");
  await refreshGit();
}

async function revertCommit(c: api.GitCommit): Promise<void> {
  if (!(await ask(tf("git.confirmRevert", c.subject || c.short), { danger: true }))) return;
  await runGit("revert", { rev: c.hash });
}
// ---------------------------------------------------------------- command palette
function openPalette() {
  openPanel("palette");
}
function closePalette() {
  closePanel("palette");
}
/**
 * Move the palette selection, and run the selected command.
 *
 * The palette styled its first row `.sel` but nothing ever moved it: you opened
 * it, typed to filter, and then had to reach for the mouse. A command palette
 * that needs the mouse defeats its own purpose.
 */
function movePaletteSelection(delta: number) {
  const rows = [...document.querySelectorAll<HTMLElement>("#palette-list .pal-item")];
  if (!rows.length) return;
  const cur = rows.findIndex((r) => r.classList.contains("sel"));
  const next = Math.min(rows.length - 1, Math.max(0, (cur < 0 ? 0 : cur) + delta));
  rows.forEach((r) => r.classList.remove("sel"));
  rows[next].classList.add("sel");
  rows[next].scrollIntoView({ block: "nearest" });
}

function runPaletteSelection() {
  const sel = document.querySelector<HTMLElement>("#palette-list .pal-item.sel");
  // With nothing selected (an empty result set) do nothing, rather than firing
  // whatever happens to be first.
  sel?.click();
}

/** Arrow keys / Enter for the palette input. Returns true if it handled the key. */
function paletteKey(e: KeyboardEvent): boolean {
  switch (e.key) {
    case "ArrowDown":
      movePaletteSelection(1);
      return true;
    case "ArrowUp":
      movePaletteSelection(-1);
      return true;
    case "PageDown":
      movePaletteSelection(8);
      return true;
    case "PageUp":
      movePaletteSelection(-8);
      return true;
    case "Home":
      movePaletteSelection(-9999);
      return true;
    case "End":
      movePaletteSelection(9999);
      return true;
    case "Enter":
      runPaletteSelection();
      return true;
    case "Escape":
      closePalette();
      return true;
    default:
      return false;
  }
}

/**
 * The operations the palette offers, with the key that also runs them.
 *
 * **The palette used to contain no commands.** It read
 * `commands.available(runtime.commandsReg)` — the engine's *content* registry —
 * so typing "table" into Ctrl+K offered `#טבלה` and nothing else. Not "insert
 * row below", not "save", not "export PDF", not "record macro": none of the ~30
 * shell actions and none of the 43 structural operations appeared. The one
 * surface in the product labelled **Commands** was a symbol picker.
 *
 * Structural operations are filtered to the ones that apply where the caret is,
 * the same rule the ribbon and the hydra use. Offering "delete row" outside a
 * table and having it silently do nothing is how a palette teaches people not to
 * trust it.
 */
function paletteActions(): { id: string; label: string; key: string }[] {
  const kb = keybindings();
  const doc = docTextOf(runtime.view.state.doc);
  const here = new Set(
    structure
      .availableAt(doc, runtime.view.state.selection.main.head)
      .filter((a) => a.enabled)
      .map((a) => a.action.id),
  );
  return actions().filter((a) => !structure.actionById(a.id) || here.has(a.id)).map((a) => ({
    id: a.id,
    label: macroName(a.id),
    key: kb[a.id] ?? "",
  }));
}

function renderPaletteList(q: string) {
  // Operations first, then the same command list the completions use — and both
  // caps reported rather than applied in silence. See `panelrows.paletteList`.
  drawList(
    document.getElementById("palette-list")!,
    panelrows.paletteList(paletteActions(), commands.available(runtime.commandsReg), q, getLang()),
    LOOKS.palette,
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

const importWord = () =>
  importAs(".docx", async (f) => docx.importDocx(new Uint8Array(await f.arrayBuffer())));

const importOrg = () => importAs(".org", async (f) => org.fromOrg(await f.text()));

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
    .register(`${import.meta.env.BASE_URL}sw.js?v=${update.CURRENT_VERSION}`, { type: "module" })
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
  void newBlankDoc();
}

// ---------------------------------------------------------------- table editing
//
// Inserting #טבלה used to be the end of the help you got: adding a row or a
// column meant rewriting the call by hand and counting cells to keep them
// aligned with the declared column count. Getting that count wrong silently
// reflows the whole table.
//
// So: when the cursor is inside a table, a small bar appears with the structural
// operations. It is driven off the cursor rather than a click on the rendered
// preview, because the preview is an SVG picture of a page and has no idea which
// cell you pointed at.

function contextBar(): HTMLElement {
  return el("div", { id: "context-bar", class: "context-bar", role: "toolbar" });
}

/**
 * Rebuild the contextual ribbon for wherever the caret is.
 *
 * Every control is generated from `STRUCTURE_ACTIONS`, so an operation added to
 * that registry appears here, in the palette, and in the shortcut list without
 * anything being wired up twice — and so a person can reorder or rebind it. The
 * previous version hard-coded four table buttons and their glyphs inline, which
 * is why lists had none: there was no list of operations to render, only a
 * paragraph of DOM.
 */
function updateContextBar() {
  const bar = document.getElementById("context-bar");
  if (!bar || !runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const pos = runtime.view.state.selection.main.head;
  // A hydra owns the keyboard, so it must not outlive the thing it operates on.
  // Clicking into ordinary prose and then typing would otherwise have every
  // letter swallowed by a panel the writer had stopped thinking about — the
  // keyboard equivalent of a drawer with no close button.
  if (openHydraState && structure.structureNear(doc, pos)?.structure !== openHydraState.structure) {
    closeHydra();
  }

  // The paragraph-style readout follows the caret whether or not the ribbon has
  // anything to show, so it is updated before the early return below.
  //
  // `headingAt(doc, pos)` with two arguments fires its default third — the whole
  // heading list — to set the value of a `<select>`, on every arrow key. It is
  // memoised per scan now (`headings.ts`), so this is a lookup rather than a
  // filter-and-map over every node in the document, and it is the same array the
  // `StructureContext` below shares.
  const levelSel = document.getElementById("heading-level") as HTMLSelectElement | null;
  if (levelSel) {
    // The document's own styles are options in this list, so the list itself can
    // go stale — a style defined a keystroke ago has to be offerable now. Rebuilt
    // only when the set of names has actually changed, for the same reason the
    // value below is only assigned when it differs.
    const names = styles.findCustomStyles(doc).map((s) => s.name).join("\u0000");
    if (levelSel.dataset.styles !== names) {
      levelSel.dataset.styles = names;
      fillParagraphStyles(levelSel);
      // A style is an action, so the set of actions has changed. Without this a
      // style defined a keystroke ago is in the dropdown, in the palette and in
      // the keys drawer, and its chord does nothing — which is the worst of the
      // three states a shortcut can be in.
      reconfigureShortcuts();
      if (isPanelOpen("styles-panel")) renderStylesPanel();
    }
    const want = paragraphStyleAt(doc, pos);
    // Assigning `value` on a `<select>` is not free and fires no change event,
    // but it does invalidate style and can close a native dropdown the writer
    // has open. Most caret moves do not change the answer.
    if (levelSel.value !== want) levelSel.value = want;
    const num = document.getElementById("heading-level-number") as HTMLInputElement | null;
    // Blank for anything that is not a heading — body text and a custom style
    // alike. A number box showing 0, or showing the level of the last heading
    // you were in, would be saying something untrue about where the caret is.
    if (num) {
      const level = /^\d+$/.test(want) && want !== "0" ? want : "";
      if (num.value !== level) num.value = level;
    }
  }

  // Sticky by one character: see `structureNear`. Finishing a list left the
  // caret after the closing `)`, where the ribbon correctly emptied — and a
  // ribbon that disappears on the character after the one you just typed reads
  // as the feature breaking, not as the model being precise.
  const near = structure.structureNear(doc, pos)?.pos ?? pos;
  const here = structure.availableAt(doc, near);
  if (here.length === 0) {
    // In prose, and that is worth saying rather than showing nothing.
    //
    // This is the other half of a margin note: *"header was greyed out and no
    // reason was given"*. It was greyed correctly — the caret was in prose, so
    // every list and table operation had nothing to act on — and the strip then
    // vanished entirely, which is a product that looks broken rather than one
    // that is being precise. What a writer standing in prose can actually do to
    // a list is *make* one, so that is what the strip offers.
    //
    // **And behind a preference that is off**, because the same strip read from
    // the writing side is *"an annoying popup… I don't know why it popped up or
    // what it is"*. Both readings are correct and they are about two different
    // moments — one writer went looking for why a control was grey, the other
    // was typing a paragraph — so the strip is kept and the default is quiet.
    // See `Settings.proseStrip`.
    const sel = runtime.view.state.selection.main;
    if (settings.proseStrip && lists.canMakeList(doc, sel.from, sel.to)) {
      const signature = `prose|${getLang()}`;
      if (bar.dataset.signature !== signature || !bar.childElementCount) {
        bar.dataset.signature = signature;
        bar.replaceChildren(
          el("span", { class: "context-bar-label" }, [t("inProse")]),
          el(
            "button",
            {
              class: "tb-btn",
              title: `${t("makeList")} — ${t("makeListLede")}`,
              "aria-label": t("makeList"),
              onClick: () => makeListHere(),
            },
            ["≔ ", el("span", { class: "tb-name" }, [t("makeList")])],
          ),
        );
      }
      openPanel("context-bar");
      return;
    }
    closePanel("context-bar");
    bar.replaceChildren();
    delete bar.dataset.signature;
    return;
  }
  const at = structure.whereAmI(doc, near)!;

  // Rebuild only when the ribbon would come out different.
  //
  // `replaceChildren` destroys and rebuilds the whole strip — up to eighteen
  // buttons and their listeners — and this function runs on **every arrow key**.
  // Moving the caret within one table cell produced identical markup and threw
  // the previous copy away anyway, so a writer holding the down arrow generated
  // a few hundred buttons a second for the collector, and any native tooltip or
  // focus on a ribbon button died under them.
  //
  // The signature is everything the render reads: which structure, the position
  // readout, and each action's id and enabled state in order. Not a hash — a
  // string, compared once, of a few hundred characters. Language and keybindings
  // are in it because the strip is rebuilt from scratch when either changes and
  // this must not out-vote that.
  const signature = [
    getLang(),
    at.structure,
    at.row,
    at.col,
    at.rows,
    at.cols,
    here.map(({ action, enabled }) => `${action.id}${enabled ? "+" : "-"}`).join(","),
  ].join("|");
  if (bar.dataset.signature === signature && bar.childElementCount) {
    openPanel("context-bar");
    return;
  }
  bar.dataset.signature = signature;

  // Hoisted. It was read inside the loop below — seventeen times in a table,
  // and `keybindings()` rebuilds the whole map from settings on each call, so a
  // caret move in a table cost ~850 property copies for a value that cannot
  // change mid-loop. `structureMenuItems` in this same file already hoists it.
  const keys = keybindings();

  const children: Node[] = [
    el("span", { class: "context-bar-label" }, [
      at.structure === "table"
        ? tf("tableAt", String(at.row), String(at.col), String(at.rows), String(at.cols))
        : at.structure === "heading"
          ? tf("headingAt", String(at.row), String(at.rows), String(at.col))
          : tf("listAt", String(at.row), String(at.rows), String(at.col)),
    ]),
  ];

  let group = "";
  for (const { action, enabled } of here) {
    // A separator between groups, so rows, columns and whole-table operations
    // read as three things rather than one wall of glyphs.
    if (group && action.group !== group) children.push(el("span", { class: "tb-sep" }));
    group = action.group;
    const hint = hintFor(action.id, keys);
    const name = t(action.label);
    // Why this one is greyed, when it is. On the ribbon the caret is always
    // inside the structure already, so this is never "you are not in a table" —
    // it is the useful half: *this is the top row*.
    const why = enabled ? null : structure.whyNot(action, doc, near);
    children.push(
      el(
        "button",
        {
          class: "tb-btn" + (enabled ? "" : " disabled"),
          // The key is in the tooltip because a shortcut nobody can find is the
          // same as no shortcut — the same rule the nikud bar follows. When the
          // button cannot act, the reason takes the tooltip's place: the key is
          // no use to somebody who has just been refused.
          title: why ? `${name} — ${t(why)}` : hint ? `${name} · ${hint}` : name,
          "aria-label": name,
          // `aria-disabled`, not `disabled`. A `disabled` button cannot be
          // clicked, cannot be focused and — with `pointer-events: none` on top
          // of it — cannot even be hovered on a touchscreen, so the one control
          // that knows why it is refusing is the one control that cannot say
          // so. Eighteen greyed arrows and no way to ask any of them a question.
          // Pressed, it now answers.
          "aria-disabled": enabled ? null : "true",
          onClick: () => {
            if (why) {
              setStatus(t(why), "warn");
              return;
            }
            runStructureAction(action, true);
          },
        },
        // The two or three a writer reaches for carry their name. A Word user
        // does not discover a feature by hovering eleven arrows, and Word
        // labels its ribbon; labelling all eighteen table operations would be a
        // wall of text, so `primary` picks the ones worth the width.
        action.primary ? [action.glyph + " ", el("span", { class: "tb-name" }, [name])] : [action.glyph],
      ),
    );
  }
  bar.replaceChildren(...children);
  openPanel("context-bar");
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
  return out;
}
const structureCompartment = new Compartment();

// ---------------------------------------------------------------- help
//
// Generated, in full, from the same registries everything else is a view over.
// Nothing here is written by hand, which is the only way a help page stays true:
// the alternative is a document that was correct on the day somebody typed it.

function openHelp() {
  closeMenus();
  openPanel("help-panel");
}


function renderHelp(query: string) {
  const box = document.getElementById("help-body")!;
  const sections = help.search(
    help.helpSections({
      t,
      keys: keybindings(),
      mode: keymodes.activeMode(),
      macros: settings.macros,
      commands: runtime.commandsReg,
      lang: getLang(),
      hydraKeys: settings.hydraKeys,
    }),
    query,
  );

  const body: Node[] = sections.length
    ? sections.map((s) =>
        el("section", { class: "help-section" }, [
          el("h3", {}, [t(s.title)]),
          ...(s.lede ? [el("p", { class: "help-lede" }, [t(s.lede)])] : []),
          el("dl", { class: "help-list" }, s.entries.flatMap((e) => [
            // A button where the entry has something to run, plain text where it
            // has not — the marks legend, which names a wedge in the gutter and
            // has nothing to do. See `HelpEntry.does`.
            el("dt", {}, [
              e.does
                ? el(
                    "button",
                    {
                      class: "help-run",
                      type: "button",
                      title: t("helpRun"),
                      ...(e.does.kind === "action" ? { "data-action": e.does.id } : {}),
                      onClick: () => {
                        // The panel stays open. Help is where somebody goes to
                        // try three things in a row, and a drawer that shuts on
                        // the first one makes them find their place again twice.
                        runRow(e.does!);
                      },
                    },
                    [e.what],
                  )
                : e.what,
            ]),
            el("dd", {}, [el("code", {}, [e.how])]),
          ])),
        ]),
      )
    : [el("p", { class: "help-lede" }, [t("helpNothing")])];

  box.replaceChildren(...body);
}

// ---------------------------------------------------------------- the commands drawer
//
// The 122 commands, grouped by the registry's own categories, searchable, with
// nothing left out and nothing capped. The inventory's reader could not reach
// them from any of the four surfaces that advertise them and asked for this
// instead; `panelrows.commandGroups` carries the argument for why it is not the
// palette again.

function openCommands() {
  closeMenus();
  openPanel("commands-drawer");
}

function openKeys() {
  closeMenus();
  openPanel("keys-drawer");
}

function renderCommands(query: string) {
  const box = document.getElementById("commands-body");
  if (!box) return;
  const { groups, empty } = panelrows.commandGroups(
    commands.available(runtime.commandsReg),
    keybindings(),
    query,
    getLang(),
    keymodes.activeMode(),
  );
  if (empty) {
    box.replaceChildren(el("div", { class: "outline-empty" }, [t(empty)]));
    return;
  }
  box.replaceChildren(
    ...groups.map((g) =>
      el("section", { class: "help-section" }, [
        el("h3", {}, [t(g.title)]),
        ...g.rows.map((r) => drawRow(r, LOOKS.commands, false, [])),
      ]),
    ),
  );
}

function buildCommandsDrawer(): HTMLElement {
  const input = el("input", {
    id: "commands-search",
    type: "search",
    placeholder: t("commandsSearch"),
    "data-i18n-placeholder": "commandsSearch",
    class: "help-search",
  }) as HTMLInputElement;
  input.addEventListener("input", () => renderCommands(input.value));
  return el(
    "aside",
    {
      id: "commands-drawer",
      class: "drawer drawer-help",
      "aria-label": t("commandsTitle"),
      "data-i18n-label": "commandsTitle",
    },
    [
      panelHead("commands-drawer", "commandsTitle"),
      el("p", { class: "help-lede", "data-i18n": "commandsLede" }, [t("commandsLede")]),
      input,
      el("div", { id: "commands-body" }),
    ],
  );
}

function buildHelpPanel(): HTMLElement {
  const input = el("input", {
    id: "help-search",
    type: "search",
    placeholder: t("helpSearch"),
    "data-i18n-placeholder": "helpSearch",
    class: "help-search",
  }) as HTMLInputElement;
  input.addEventListener("input", () => renderHelp(input.value));
  return el("aside", { id: "help-panel", class: "drawer drawer-help", "aria-label": t("help"), "data-i18n-label": "help" }, [
    panelHead("help-panel", "helpTitle"),
    el("p", { class: "help-lede", "data-i18n": "helpLede" }, [t("helpLede")]),
    input,
    el("div", { id: "help-body" }),
  ]);
}

// ---------------------------------------------------------------- macros
//
// Record what you did, do it again. The recorder logs *actions* and typed text —
// never keystrokes, never document positions — so a macro replays correctly from
// wherever the caret happens to be, which is the property that makes it worth
// having. Recording the positions would produce a macro that works exactly once.

let recording: macros.Step[] | null = null;

/**
 * The saved macros, read defensively — a bad preference must not stop the app.
 *
 * **Cached on the raw value.** `parseAll` re-validates every step of every macro
 * and allocates a fresh object per step, and this is called from `actions()`,
 * which the palette calls **per keystroke** while somebody is typing a command
 * name. A writer with thirty macros of a dozen steps each was paying tens of
 * thousands of allocations per keypress to produce a list that had not changed
 * since the session started.
 *
 * Keyed on `settings.macros` by identity rather than by a dirty flag: the only
 * thing that replaces it is `settings.macros = …`, which every writer here does
 * (`macroSave`, `macroDelete`), so a stale cache is not reachable without
 * mutating the array in place — which nothing does and which the assignment
 * makes awkward.
 */
let macroCache: { raw: unknown; parsed: macros.Macro[] } | null = null;
function savedMacros(): macros.Macro[] {
  const held = macroCache;
  if (held && held.raw === settings.macros) return held.parsed;
  const parsed = macros.parseAll(settings.macros);
  macroCache = { raw: settings.macros, parsed };
  return parsed;
}

function macroName(id: string): string {
  const structural = structure.actionById(id);
  if (structural) return t(structural.label);
  // A style names itself. `t("sc.style.PIRUSH")` would print the raw key, which
  // is the "shipped unnamed" row `bindings.test.mjs` exists to refuse.
  const style = styles.styleOfAction(id);
  if (style) return tf("styleActionName", style);
  const mac = savedMacros().find((m) => macros.actionIdOf(m) === id);
  return mac ? mac.name : t("sc." + id);
}

/**
 * Set while a macro is replaying, so its steps are not recorded again.
 *
 * A macro can play another macro — `macroPlay` is an action like any other — and
 * recording a replay would turn one step into all of the inner macro's, which
 * then diverge the moment the inner one is edited. The outer action is the step.
 */
let replaying = false;

/** Note an action for the recorder. Called by `runAction`, and by nothing else. */
function noteAction(id: string) {
  if (recording && !replaying) recording.push({ kind: "action", id });
}

/** Note typed text for the recorder. */
function noteTyped(text: string) {
  if (recording && !replaying && text) recording.push({ kind: "text", text });
}

/** Note a command inserted with no action behind it — the toolbar, the palette. */
function noteSnippet(snippet: string) {
  if (recording && !replaying && snippet) recording.push({ kind: "snippet", snippet });
}

function toggleRecording() {
  if (recording) {
    finishRecording();
    return;
  }
  recording = [];
  setStatus(t("macroRecording"), "");
  rerenderChrome();
}

async function finishRecording() {
  const steps = macros.compact(recording ?? []);
  recording = null;
  const macro: macros.Macro = { id: macros.newId(), name: "", steps };
  if (macros.isEmpty(macro)) {
    setStatus(t("macroEmpty"), "");
    rerenderChrome();
    return;
  }
  const suggested = macros.describe(macro, macroName).slice(0, 40);
  const name = await askText(t("macroNamePrompt"), suggested);
  if (name === null) {
    setStatus(t("macroDiscarded"), "");
    rerenderChrome();
    return;
  }
  macro.name = name.trim() || suggested;
  settings.macros = [...savedMacros(), macro];
  saveSettings();
  // A saved macro is an action like any other from this point on: it appears in
  // the shortcut list and can be bound to a key without another line of code.
  reconfigureShortcuts();
  rerenderChrome();
  setStatus(tf("macroSaved", macro.name), "ok");
}

/** Run a macro's steps, in order, from wherever the caret is. */
function playMacro(macro: macros.Macro, times = 1) {
  const valid = macros.validate(macro, (id) => !!actionById(id));
  if (valid.steps.length < macro.steps.length) {
    // Said out loud rather than silently: a macro doing four of its five things
    // is a macro whose next result will surprise somebody.
    setStatus(tf("macroStepsDropped", macro.name), "");
  }
  const wasReplaying = replaying;
  replaying = true;
  try {
  for (let i = 0; i < times; i++) {
    for (const step of valid.steps) {
      if (step.kind === "text") {
        const sel = runtime.view.state.selection.main;
        runtime.view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: step.text },
          selection: { anchor: sel.from + step.text.length },
        });
      } else if (step.kind === "snippet") {
        insertSnippet(step.snippet);
      } else {
        // `run` rather than `runAction`: replaying a macro must not record its
        // own steps if the writer is recording a macro that plays another one.
        // The outer `macroPlay` is the step, and it is already noted.
        actionById(step.id)?.run(runtime.view);
      }
    }
  }
  } finally {
    replaying = wasReplaying;
  }
  scheduleCompile();
  runtime.view.focus();
}

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
  const action = actionById(id);
  if (!action) return false;
  // Structural operations note themselves inside `runStructureAction`, which
  // the ribbon and the hydra also reach directly with `sticky` on. Noting here
  // as well would record every one of them twice.
  if (!structure.actionById(id)) noteAction(id);
  inAction++;
  try {
    return action.run(v);
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

function deleteMacro(id: string) {
  settings.macros = savedMacros().filter((m) => m.id !== id);
  saveSettings();
  reconfigureShortcuts();
  rerenderChrome();
}

// ---------------------------------------------------------------- hydra
//
// One key opens a panel listing every operation available where the caret is,
// each on a single letter, and the panel stays up so repeating is one keystroke.
// Escape or `q` leaves. It is a third view over `STRUCTURE_ACTIONS` — not a
// third list — so an operation added to the registry appears here the same day.

let openHydraState: hydra.Hydra | null = null;

/** Whatever the caret is in, opened as a hydra. */
function openHydra() {
  if (!runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const pos = runtime.view.state.selection.main.head;
  const kind = structure.structureAt(doc, pos);
  if (!kind) {
    setStatus(t("hydraNothingHere"), "");
    return;
  }
  openHydraState = hydra.hydraFor(kind, settings.hydraKeys ?? {});
  // Capture phase, on `window`, so the hydra genuinely gets the key before the
  // vim and emacs plugins do. See `captureHydraKeys` for why no arrangement of
  // the editor's extensions could achieve that. Removed by the panel's own
  // `close` hook, which is the one path every way of closing goes through —
  // the ×, the backdrop, Escape, and `closePanel` alike.
  window.addEventListener("keydown", captureHydraKeys, true);
  renderHydra();
}

function closeHydra() {
  closePanel("hydra");
}

function renderHydra() {
  const panel = document.getElementById("hydra")!;
  const h = openHydraState;
  if (!h) return;
  const doc = docTextOf(runtime.view.state.doc);
  const pos = runtime.view.state.selection.main.head;

  let group = "";
  const cells: Node[] = [];
  for (const entry of h.entries) {
    if (group && entry.action.group !== group) cells.push(el("span", { class: "hydra-break" }));
    group = entry.action.group;
    // Greyed rather than hidden, for the same reason the menus grey: a hydra
    // whose contents shuffle between openings is one nobody memorises.
    const enabled = structure.isEnabled(entry.action, doc, pos);
    cells.push(
      el("button", {
        class: "hydra-key" + (enabled ? "" : " disabled"),
        disabled: enabled ? null : "true",
        onClick: () => runHydraEntry(entry),
      }, [
        // The key the writer's own keyboard can actually produce. On a Hebrew
        // layout the physical `a` sends `ש`, so a Hebrew-interface hydra
        // labelled `a s b d i o m v u n h` was showing eleven keys none of which
        // existed. Both alphabets are accepted either way (see `entryFor`); this
        // only decides which one to print.
        el("kbd", {}, [getLang() === "he" && entry.he ? entry.he : entry.key]),
        el("span", {}, [t(entry.action.label)]),
      ]),
    );
  }
  // A visible exit as well as Escape and `q`. The rule this codebase learned the
  // hard way: a surface that takes over the keyboard and can only be dismissed
  // by a key you have to already know is a surface people get stuck in. The head
  // is built by `panelHead` like every other, which is also what put the hydra
  // into the Escape sweep it had been missing from.
  const head = panelHead("hydra", "structure." + h.structure, {
    level: "h3",
    cls: "hydra-head",
    extra: [el("span", {}, [t("hydraHint")]), el("div", { class: "spacer" })],
  });
  panel.replaceChildren(head, el("div", { class: "hydra-keys" }, cells));
  openPanel("hydra");
}

function runHydraEntry(entry: hydra.HydraEntry) {
  // The hydra is opened by a chord and driven by a pointer-free keyboard, but
  // it is offered from the same sticky reading the ribbon uses, so it acts on
  // the same structure the writer can see listed.
  const ran = runStructureAction(entry.action, true);
  if (!ran) return;
  if (hydra.closesAfter(entry.action)) {
    closeHydra();
    return;
  }
  // Still open, and redrawn: what is possible changes as the document does —
  // after deleting the second-to-last row, "delete row" has to grey out.
  requestAnimationFrame(renderHydra);
}

/**
 * The hydra's keys, while it is open — on `window`, in the capture phase.
 *
 * Swallowing every plain letter, because a transient keymap that let `r`
 * through to the document would type an `r` into the table it was meant to add
 * a row to. That much was always true. What was not true was *where* it sat.
 *
 * This was a `Prec.highest(keymap.of(…))` entry in the editor's extensions,
 * under a comment saying it was ahead of the vim and emacs keymaps. Driven in a
 * browser with vim mode on, it was not: open a list hydra, press the `a` its own
 * legend offers for "new item", and vim goes to INSERT instead. Press `b` and
 * the caret moves back a word, leaves the list, and the structure watch closes
 * the panel — eleven operations on screen with their keys beside them, and not
 * one of them doing what it said. Escape did not close it either; vim took that
 * to leave visual mode.
 *
 * No place in that array would have fixed it. `@replit/codemirror-vim` handles
 * keys from a **ViewPlugin event handler** (`vimPlugin`'s `keydown`), and a
 * plugin's DOM handlers run ahead of the whole `keymap` facet whatever its
 * precedence. Precedence orders facet inputs against each other; it does not
 * order a facet against a plugin.
 *
 * So the listener goes where being first is a property of the DOM rather than a
 * hope about a library: `window`, capture phase, above the content element every
 * one of those handlers is attached to. Installed when a hydra opens and removed
 * when it closes, so there is nothing listening the rest of the time — which
 * also means a mode gets every key exactly as it did before, because this is not
 * there to be got past.
 */
function captureHydraKeys(event: KeyboardEvent) {
  if (!openHydraState) return;
  const stop = () => {
    event.preventDefault();
    event.stopPropagation();
    // `stopImmediatePropagation` as well: the point is that nothing else on the
    // way down or back up sees this key, and vim's handler is on a descendant.
    event.stopImmediatePropagation();
  };
  if (event.key === "Escape" || event.key === "q") {
    stop();
    closeHydra();
    return;
  }
  // Let modified keys through: Mod-S while a hydra is up should still save.
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Tab, Enter, the arrows: not hydra keys, and swallowing them would trap the
  // keyboard in a panel whose own × is reachable by Tab.
  if (event.key.length !== 1) return;
  const entry = hydra.entryFor(openHydraState, event.key);
  stop(); // swallowed either way: an unbound letter must not be typed
  if (entry) runHydraEntry(entry);
}

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

// ---------------------------------------------------------------- styles panel
//
// One place for formatting, because there were three and they fought:
// app settings, presets that silently overwrote them, and the in-document
// #הגדרות_* commands — the most powerful styling in the product, with no UI at
// all. This panel puts page setup, presets and the document's own heading / list
// / table design side by side, so "where does my formatting live" has an answer.

function openStyles() {
  closeMenus();
  openPanel("styles-panel");
}

// ---------------------------------------------------------------- custom styles
//
// The writer's own paragraph styles. `styles.ts` owns what one *is* and how it
// is read and rewritten; this is the three gestures — apply, remove, edit — and
// the small form that makes one.

/**
 * Put a custom style on the paragraph, or on the selection if there is one.
 *
 * With nothing selected it takes the whole paragraph, which is what a paragraph
 * style means and what pressing one in Word does. Written directly rather than
 * through `insertSnippet`: a custom style's name is the writer's own word and
 * there is no second language to translate it into.
 */
function applyCustomStyle(name: string): boolean {
  const view = runtime.view;
  const span = styleTarget();
  if (!span) {
    setStatus(t("noParagraphHere"), "warn");
    updateContextBar();
    return false;
  }
  const body = view.state.sliceDoc(span.from, span.to);
  const head = span.from + name.length + 2; // `#` + name + `[`
  view.dispatch({
    changes: { from: span.from, to: span.to, insert: `#${name}[${body}]` },
    selection: { anchor: head, head: head + body.length },
  });
  scheduleCompile();
  view.focus();
  return true;
}

/** What a paragraph style would go on: the selection, or the paragraph in hand. */
function styleTarget(): { from: number; to: number } | null {
  const view = runtime.view;
  const sel = view.state.selection.main;
  if (!sel.empty) return { from: sel.from, to: sel.to };
  const lines = paragraphAt(view.state, sel.head);
  const from = view.state.doc.line(lines.from).from;
  const to = view.state.doc.line(lines.to).to;
  return from === to ? null : { from, to };
}

/** Take the style off again — what "body text" means when one is applied. */
function unwrapCustomStyle(name: string) {
  const view = runtime.view;
  const doc = docTextOf(view.state.doc);
  const pos = view.state.selection.main.head;
  // Innermost first, the same rule `customStyleAt` uses to decide which style the
  // dropdown is showing — so the pair always act on the same one.
  const node = scanDoc(view.state.doc)
    .nodes.filter((n) => n.hash && n.name === name && pos >= n.from && pos <= n.to && n.bodies.length)
    .sort((a, b) => b.depth - a.depth)[0];
  if (!node) return;
  const body = node.bodies[node.bodies.length - 1];
  const inner = doc.slice(body.from, body.to);
  view.dispatch({
    changes: { from: node.from, to: node.to, insert: inner },
    selection: { anchor: node.from + inner.length },
  });
  scheduleCompile();
  view.focus();
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

/** Every name a new style may not take: the registry's, and the ones already made. */
function takenStyleNames(): string[] {
  const doc = docTextNow();
  return [
    ...runtime.commandsReg.flatMap((c) => [c.he, c.en]),
    ...styles.findCustomStyles(doc).map((s) => s.name),
  ];
}

/**
 * The knob rows a style is made of, over whatever reads and writes them.
 *
 * In two groups, because three of the ten are not the same kind of question.
 * Alignment and the two spacings make `#עיצוב` a block, so a style carrying one
 * of them breaks any sentence it is applied inside — the writer's report was
 * *"when I make a word be in a style, it makes that word be in its own
 * paragraph"*, and the engine was doing exactly what the knob asked for. The
 * knob was the thing that said nothing. `PARAGRAPH_KNOBS` names the three, in
 * one place, and the note under the heading says what choosing one costs.
 */
function styleKnobRows(
  read: (key: string) => string | undefined,
  write: (key: string, value: string | null) => void,
): Node[] {
  const row = ([key, field]: [string, styles.Field]) =>
    styleRow(t(field.label), fieldControl(field, read(key), (v) => write(key, v)));
  const all = Object.entries(styles.STYLE_FIELDS);
  const inline = all.filter(([k]) => !styles.PARAGRAPH_KNOBS.includes(k));
  const paragraph = all.filter(([k]) => styles.PARAGRAPH_KNOBS.includes(k));
  return [
    ...inline.map(row),
    el("div", { class: "set-head" }, [t("paragraphKnobsHead")]),
    el("div", { class: "set-note" }, [t("paragraphKnobsNote")]),
    ...paragraph.map(row),
  ];
}

/** *Other…* — name a style, give it a look, and put it on this paragraph. */
function openNewStyle() {
  const pending: Record<string, string> = {};
  const nameInput = textField();
  openModal(
    t("newStyleTitle"),
    t("newStyleLede"),
    [
      fieldRow(t("styleName"), nameInput),
      ...styleKnobRows(
        (k) => pending[k],
        (k, v) => {
          if (v === null) delete pending[k];
          else pending[k] = v;
        },
      ),
    ],
    () => {
      const name = nameInput.value.trim();
      const bad = styles.styleNameError(name, takenStyleNames());
      if (bad) {
        setStatus(t(bad), "warn");
        updateContextBar();
        return;
      }
      // **The use first, then the definition**, and the order is the whole of
      // it. `defineCustomStyle` writes at the top of the document, so doing it
      // first moves every offset underneath — including the paragraph the style
      // is being made *for*. Driven the other way round once, and it wrapped the
      // `#let` it had just written together with the rest of the page, into a
      // document that did not compile. Applying first leaves the second dispatch
      // a plain insertion above the caret, which CodeMirror maps for us.
      if (!applyCustomStyle(name)) return;
      editDoc(styles.defineCustomStyle(docTextNow(), name, pending, docLang()));
      scheduleCompile();
      setStatus(tf("styleCreated", name), "ok");
    },
    t("createAction"),
  );
  nameInput.focus();
}

/** The formatting behind a style that already exists, live. */
function openStyleEditor(name: string) {
  const style = styles.findCustomStyle(docTextOf(runtime.view.state.doc), name);
  if (!style) {
    setStatus(t("noStyleToEdit"), "warn");
    return;
  }
  openModal(
    tf("editStyleTitle", name),
    t("editStyleLede"),
    styleKnobRows(
      (k) => style.args.get(k),
      (k, v) => {
        // Re-found on every change: the previous write moved the offsets this
        // one is about to use, and holding the stale range is how a panel
        // corrupts the very line it is editing.
        const doc = docTextOf(runtime.view.state.doc);
        const now = styles.findCustomStyle(doc, name);
        if (!now) return;
        editDoc(styles.setCustomStyleArgs(doc, now, { [k]: v }));
        scheduleCompile();
      },
    ),
    () => {},
    t("done"),
  );
}


/** Read the document's current value for one styling argument. */
function styleArg(target: styles.StyleTarget, key: string): string | undefined {
  const call = styles.findStyleCall(docTextOf(runtime.view.state.doc), target);
  return call?.args.get(key);
}

/**
 * The command a section is reading and writing right now.
 *
 * Every section but Marks has one, fixed. Marks has one **per class** — a door
 * named for the command, `#הגדרות_סימן` — so which command the section is about
 * depends on what the class chooser says.
 */
function styleTargetOf(kind: styles.StyleCommand): styles.StyleTarget {
  return kind === "marks" ? styles.markDoor(markClass) : kind;
}

/** Write styling arguments into the document, replacing the existing call.
 *
 *  A styling command the document does not have yet is written in the language
 *  the document is being set in, so clicking a control in an English document
 *  does not drop a Hebrew command into it. An existing call keeps whatever
 *  language it was already written in. */
function setStyleArgs(target: styles.StyleTarget, changes: Record<string, string | null>) {
  const doc = docTextOf(runtime.view.state.doc);
  const next = styles.setStyleArgs(doc, target, changes, docLang());
  if (next === doc) return;
  editDoc(next);
  scheduleCompile();
  renderStylesPanel();
}

/** A labelled row in the styles panel. */
function styleRow(label: string, control: Node): HTMLElement {
  return el("label", { class: "set-row" }, [el("span", {}, [label]), control]);
}

/**
 * A free-text control for a value that is not a string literal.
 *
 * A region's name and a channel's height are both written bare in the source —
 * one is an identifier the writer chose, the other a length — so neither goes
 * through `fieldControl`'s `"text"` case, which quotes what it is given.
 */
function textControl(
  current: string,
  onSet: (v: string) => void,
  placeholder = "",
): HTMLElement {
  const input = el("input", {
    type: "text",
    value: current,
    ...(placeholder ? { placeholder } : {}),
  }) as HTMLInputElement;
  input.addEventListener("change", () => onSet(input.value));
  return input;
}

/**
 * A numbering scheme **per level** — digits at the top, letters underneath.
 *
 * Typst has read a nested list's pattern one symbol per level for as long as it
 * has had lists: `"1.א.i."` numbers the top level `1.`, the one inside it `א.`
 * and the one inside that `i.`. Nothing said so, and the one control that wrote
 * the field offered five whole-pattern schemes, so *"letters at one level and
 * digits at another"* was a setting the engine had and the product did not.
 *
 * Three rows, or more when the document already asks for more — a pattern with
 * four levels in it must not lose its fourth by being looked at.
 */
function levelsControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
  const levels = styles.readLevels(raw);
  const rows = Math.max(3, levels.length);
  const options: [string, string][] = [
    ["", t("notSet")],
    ["1.", "1. 2. 3."],
    ["1)", "1) 2) 3)"],
    ["א.", "א. ב. ג."],
    ["א)", "א) ב) ג)"],
    ["a.", "a. b. c."],
    ["A.", "A. B. C."],
    ["i.", "i. ii. iii."],
    ["I.", "I. II. III."],
  ];
  const picked = Array.from({ length: rows }, (_, i) => levels[i] ?? "");
  const write = () => set(styles.typstLevels(picked.map((p) => p || null)));
  return el(
    "span",
    { class: "level-rows" },
    picked.map((current, i) =>
      el("span", { class: "level-row" }, [
        el("span", { class: "level-tag" }, [String(i + 1)]),
        selectControl(options, current, (v) => {
          picked[i] = v;
          write();
        }),
      ]),
    ),
  );
}

function selectControl(
  options: [string, string, boolean?][],
  current: string,
  onPick: (v: string) => void,
): HTMLElement {
  return el(
    "select",
    { onChange: (e: Event) => onPick((e.target as HTMLSelectElement).value) },
    options.map(([v, lbl, off]) =>
      el(
        "option",
        {
          value: v,
          ...(current === v ? { selected: "selected" } : {}),
          // An option that cannot be chosen says so where the writer is looking,
          // rather than snapping back after they choose it and explaining nothing.
          ...(off ? { disabled: "disabled" } : {}),
        },
        [lbl],
      ),
    ),
  );
}

// -------------------------------------------- global by default, per instance
//
// The writer's model has three layers and the panel could reach one:
//
//   1. the document's default for a kind of thing — every `#הגדרות_*` command;
//   2. one element's own settings, which overrule the default for that element;
//   3. `כפה` on the default, which overrules every element back.
//
// Layers 2 and 3 are `engine/typst/ksav.typ`'s, resolved there by one shared merge
// for all of headings, lists, tables, notes, bands and streams. What follows is
// how a control reaches them: which layer a section of the panel is writing, and a
// row per knob that the element may answer for itself.

/**
 * Which sections are writing the element the caret is in rather than the default.
 *
 * Panel state and not document state: it is a question about what the writer is
 * looking at, so it resets with the panel and never appears in the file.
 */
const styleScopes = new Set<styles.StyleCommand>();

/** Which heading level the *default* layer is being edited for; 0 = all of them. */
let headingLevel = 0;

/** The innermost element of this kind the caret is inside, if any. */
function styleInstance(kind: styles.StyleCommand): styles.InstanceCall | null {
  const view = runtime.view;
  if (!view) return null;
  return styles.findInstance(
    docTextOf(view.state.doc),
    kind,
    view.state.selection.main.head,
  );
}

/** The element this section is writing on, or null when it is writing the default. */
function scopedInstance(kind: styles.StyleCommand): styles.InstanceCall | null {
  return styleScopes.has(kind) ? styleInstance(kind) : null;
}

/** Write to whichever layer this section is writing. */
function setStyleArgsIn(kind: styles.StyleCommand, changes: Record<string, string | null>) {
  const inst = scopedInstance(kind);
  if (!inst) {
    setStyleArgs(styleTargetOf(kind), changes);
    return;
  }
  const doc = docTextOf(runtime.view.state.doc);
  const next = styles.setInstanceArgs(doc, inst, changes);
  if (next === doc) return;
  editDoc(next);
  scheduleCompile();
  renderStylesPanel();
}

/**
 * The scope switch and the overrule checkbox, for one section.
 *
 * Both belong at the top of a section because both change what every control
 * under them means. And the overrule state is said out loud in whichever scope
 * the writer is in: on the default, that individual settings are not applying; on
 * an element, that what they are about to change will not show. A control that
 * silently does nothing is the failure this whole change exists to end, and
 * turning the switch on is the one legitimate way to produce one.
 */
function scopeRows(kind: styles.StyleCommand, many: string, one: string): Node[] {
  const inst = styleInstance(kind);
  const here = !!scopedInstance(kind);
  // Through the target rather than the kind, so `כפה` on the Marks section is
  // *this class's* overrule — `#הגדרות_סימן(כפה: true)` means every siman and
  // says nothing about the gemara references.
  const target = styleTargetOf(kind);
  const forced = styles.isOverruled(docTextOf(runtime.view.state.doc), target);
  const rows: Node[] = [
    styleRow(
      t("styleScope"),
      selectControl(
        [
          ["all", tf("scopeAll", t(many))],
          ["this", inst ? tf("scopeThis", t(one)) : tf("scopeNoneHere", t(one)), !inst],
        ],
        here ? "this" : "all",
        (v) => {
          if (v === "this") styleScopes.add(kind);
          else styleScopes.delete(kind);
          renderStylesPanel();
        },
      ),
    ),
  ];
  if (here) {
    if (forced) rows.push(el("p", { class: "styles-note" }, [t("overruledHere")]));
    return rows;
  }
  rows.push(
    styleRow(
      t("overrule"),
      toggleControl(forced, (v) =>
        setStyleArgs(target, { [styles.OVERRULE]: v ? "true" : null }),
      ),
    ),
  );
  if (forced) rows.push(el("p", { class: "styles-note" }, [t("overruleOn")]));
  return rows;
}

/** A number input that writes `12pt` / `1.5em`, and clears when emptied. */
function unitControl(
  raw: string | undefined,
  unit: "em" | "pt",
  step: number,
  set: (v: string | null) => void,
): HTMLElement {
  const n = styles.readLength(raw, unit);
  const input = el("input", {
    type: "number",
    step: String(step),
    value: n === null ? "" : String(n),
  }) as HTMLInputElement;
  input.addEventListener("change", () => {
    const v = parseFloat(input.value);
    set(input.value.trim() === "" || !Number.isFinite(v) ? null : `${v}${unit}`);
  });
  return input;
}

/**
 * A text size: a number the writer types, and which of the two units it is in.
 *
 * This was a dropdown of seven percentages — 80, 90, 100, 115, 135, 160, 200 —
 * and a writer wanting 105% could not have it. The report is one sentence,
 * *"the knobs are too coarse"*, and a preset list is the coarsest a control
 * gets: it is not a shortage of options, it is a control that decides for you.
 *
 * The unit is the other half of it, and the half a preset list cannot express
 * at all. `em` is a proportion of whatever the text sits inside and `pt` is a
 * measurement; a style set to 115% is right in a heading and in a footnote,
 * and a title set to 24pt is 24pt wherever it lands. Both are things a writer
 * means, so both are sayable, and switching the unit keeps the *number* rather
 * than silently converting — the same rule `regionHeightControl` follows, for
 * the same reason.
 */
function sizeControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
  const read = styles.readTextSize(raw);
  const unit = read?.unit ?? "%";
  const input = el("input", {
    type: "number",
    min: 0,
    step: unit === "%" ? 5 : 0.5,
    value: read == null ? "" : String(read.n),
    placeholder: "—",
    "aria-label": t("knobSize"),
  }) as HTMLInputElement;
  // Emptying the box is how a knob is unset, exactly as `unitControl` does it:
  // absent means *this layer says nothing*, which is not the same as any number.
  input.addEventListener("change", () => {
    const v = parseFloat(input.value);
    set(input.value.trim() === "" || !Number.isFinite(v) ? null : styles.writeTextSize(v, unit));
  });
  const units = selectControl(
    [["%", t("unitEm")], ["pt", t("unitPt")]],
    unit,
    (u) => {
      const n = read?.n ?? (u === "%" ? 100 : 12);
      set(styles.writeTextSize(n, u as "%" | "pt"));
    },
  );
  return el("span", { class: "knob-size" }, [input, units]);
}

/**
 * A typographic family, by name — the families this machine has, and any other.
 *
 * A `<datalist>` and not a `<select>`, because both halves are true: almost
 * everybody wants one of the fonts they have, and a sefer typeset here and
 * printed elsewhere may legitimately name a family this machine has never
 * heard of. A dropdown would make the second impossible; a bare text box would
 * make the first a spelling test.
 */
function fontControl(raw: string | undefined, set: (v: string | null) => void): HTMLElement {
  const id = `font-list-${(fontListSeq += 1)}`;
  const input = el("input", {
    type: "text",
    list: id,
    value: styles.readString(raw) ?? "",
    placeholder: t("notSet"),
    "aria-label": t("knobFont"),
  }) as HTMLInputElement;
  input.addEventListener("change", () =>
    set(input.value.trim() === "" ? null : styles.typstString(input.value.trim())),
  );
  return el("span", { class: "knob-font" }, [
    input,
    el(
      "datalist",
      { id },
      fonts
        .fontOptions(BUNDLED_FONTS, runtime.currentDoc?.assets ?? [], docConfig().font)
        .map((o) => el("option", { value: o.name })),
    ),
  ]);
}

/** One id per datalist on the page: two size rows must not share one list. */
let fontListSeq = 0;

/** A colour, with the means to unset it — a colour picker alone has no "none". */
function clearableColour(
  raw: string | undefined,
  set: (v: string | null) => void,
): HTMLElement {
  const kids: Node[] = [colorControl(styles.readColor(raw) ?? "#000000", (v) => set(styles.typstColor(v)))];
  if (raw !== undefined) {
    kids.push(
      glyphBtn("×", t("none"), () => set(null), "knob-clear"),
    );
  }
  return el("span", { class: "knob-colour" }, kids);
}

/**
 * One knob, as a control.
 *
 * Every one of these has a blank option meaning *not set here*, and that is the
 * whole point of the layer: an element that says nothing about a knob inherits the
 * document's answer, and an element that says `false` overrules a document that
 * said `true`. A checkbox cannot tell those two apart, which is why the booleans
 * are three-way selects and not tick boxes.
 */
function fieldControl(
  field: styles.Field,
  raw: string | undefined,
  set: (v: string | null) => void,
): HTMLElement {
  // "Not set", and deliberately not "inherit" or "default": the same control
  // appears at three scopes, and the blank means the same thing at each of them —
  // *this layer says nothing, so the one under it answers*.
  const blank = ["", t("notSet")] as [string, string];
  const pick = (options: [string, string][], current: string) =>
    selectControl([blank, ...options], current, (v) => set(v || null));
  switch (field.kind) {
    case "font":
      return fontControl(raw, set);
    case "size-em":
      return sizeControl(raw, set);
    case "size-pt":
    case "length-pt":
      return unitControl(raw, "pt", 1, set);
    case "length-em":
      return unitControl(raw, "em", 0.25, set);
    case "colour":
      return clearableColour(raw, set);
    case "slant":
      return pick([['"normal"', t("slantUpright")], ['"italic"', t("slantItalic")]], (raw ?? "").trim());
    case "weight":
      return pick([['"bold"', t("weightBold")], ['"regular"', t("weightRegular")]], (raw ?? "").trim());
    case "bool":
      return pick([["true", t("valueOn")], ["false", t("valueOff")]], (raw ?? "").trim());
    case "rule":
      // `none` is a value and absence is not: absent means "whatever the document
      // says", and `none` means "no border on this one, whatever the document says".
      return pick([["none", t("valueOff")], ["0.5pt + luma(160)", t("valueOn")]], (raw ?? "").trim());
    case "marker":
      return pick([["[•]", "•"], ["[–]", "–"], ["[◆]", "◆"], ["[▪]", "▪"], ["[✦]", "✦"]], (raw ?? "").trim());
    case "align":
      return pick([["right", t("right")], ["center", t("center")], ["left", t("left")]], (raw ?? "").trim());
    case "numbering":
      return pick(
        [['"1."', "1. 2. 3."], ['"1.1"', "1.1 1.2"], ['"א."', "א. ב. ג."], ['"I."', "I. II."], ['"a."', "a. b. c."]],
        (raw ?? "").trim(),
      );
    case "numbering-levels":
      return levelsControl(raw, set);
    case "count": {
      const input = el("input", { type: "number", step: 1, value: (raw ?? "").trim() }) as HTMLInputElement;
      input.addEventListener("change", () => {
        const v = parseInt(input.value, 10);
        set(Number.isFinite(v) ? String(v) : null);
      });
      return input;
    }
    case "text": {
      const input = el("input", { type: "text", value: styles.readString(raw) ?? "" }) as HTMLInputElement;
      input.addEventListener("change", () =>
        set(input.value.trim() === "" ? null : styles.typstString(input.value)),
      );
      return input;
    }
  }
}

/** Every knob one element of this kind may answer for itself. */
function instanceRows(kind: styles.InstanceCommand, inst: styles.InstanceCall): Node[] {
  return Object.entries(styles.INSTANCE_FIELDS[kind]).map(([key, field]) =>
    styleRow(
      t(field.label),
      fieldControl(field, inst.args.get(key), (v) => setStyleArgsIn(kind, { [key]: v })),
    ),
  );
}

// ------------------------------------------------------ headings, per level
//
// `#הגדרות_כותרות` has taken a per-level array for every knob since it was
// written — `גודל: (1.6em, 1.35em, …)` — and the panel wrote scalars only, so
// every control in the Headings section was "all six levels at once" and the
// layer the inventory asked for first (*"heading styles per level, then per
// instance"*) was reachable only by typing the tuple.

/** The engine's own per-level ramps, so writing level 3 cannot restyle level 2. */
const HEADING_RAMP: Record<string, string[]> = {
  גודל: ["1.6em", "1.35em", "1.18em", "1.06em", "1em", "0.95em"],
  ריווח_לפני: ["1.2em", "1.1em", "1em", "0.9em", "0.8em", "0.8em"],
  ריווח_אחרי: ["0.6em", "0.55em", "0.5em", "0.45em", "0.4em", "0.4em"],
};

/**
 * A ramp as long as there are levels, grown by repeating its last entry.
 *
 * The shipped ramps are six long because the engine's are, and `_cfg_pick`
 * clamps — level 9 has always been drawn at level 6's size. Writing level 9
 * needs a tuple with a ninth slot in it, and padding with the last value is
 * what the engine's own `_hd_set` does, so a tuple written here and one written
 * by hand in Typst say the same thing about levels nobody touched.
 */
function rampFor(key: string): string[] {
  const base = HEADING_RAMP[key] ?? [HEADING_FLAT[key] ?? "none"];
  return Array.from({ length: heads.MAX_LEVEL }, (_, i) => base[Math.min(i, base.length - 1)]);
}

/** And its scalar defaults, for the knobs whose default is one value for all six. */
const HEADING_FLAT: Record<string, string> = {
  משקל: '"bold"',
  צבע: "luma(0)",
  סגנון: '"normal"',
  יישור: "none",
  קו_תחתון: "false",
  קו: "false",
  מספור: "none",
  רברבתי: "false",
  מרווח_אותיות: "0pt",
};

/** The value the Headings section is showing for one knob, at the chosen level. */
function headingArg(key: string): string | undefined {
  const raw = styleArg("headings", key);
  if (headingLevel === 0) return raw;
  const per = styles.readTuple(raw);
  // A scalar applies to every level, so it is what this level shows.
  return per ? per[headingLevel - 1] : raw;
}

/** Write one knob, at the chosen level or at all of them. */
function setHeadingArg(key: string, value: string | null) {
  if (headingLevel === 0) {
    setStyleArgs("headings", { [key]: value });
    return;
  }
  const now = styleArg("headings", key);
  // What the levels this write does not mention should keep. A tuple already says;
  // a scalar the writer set says so for every level and must not be thrown away
  // when one level is changed; and absent means the engine's own ramp.
  const fill =
    now !== undefined && styles.readTuple(now) === null
      ? Array<string>(heads.MAX_LEVEL).fill(now)
      : rampFor(key);
  const v = value ?? fill[headingLevel - 1] ?? "none";
  setStyleArgs("headings", { [key]: styles.withTier(now, headingLevel, v, fill) });
}

/** Which level the Headings section is editing. */
function headingLevelRow(): Node {
  return styleRow(
    t("headingLevel"),
    selectControl(
      [
        ["0", t("everyLevel")],
        // Every level the editor can write, which is nine. Six was the count of
        // *named* heading commands and it had leaked into the styling: levels 7
        // to 9 were real in the outline, in the numbering, in `#תוכן` and in the
        // indent ramp on the page, and this dropdown was the surface saying they
        // did not exist. The engine's `_hd_levels` moved with it, so each of the
        // three now has a door of its own rather than inheriting level 6's.
        ...(Array.from({ length: heads.MAX_LEVEL }, (_, i) => [
          String(i + 1),
          tf("oneLevel", String(i + 1)),
        ]) as [string, string][]),
      ],
      String(headingLevel),
      (v) => {
        headingLevel = parseInt(v, 10) || 0;
        renderStylesPanel();
      },
    ),
  );
}

function toggleControl(current: boolean, onPick: (v: boolean) => void): HTMLElement {
  const input = el("input", { type: "checkbox", ...(current ? { checked: "checked" } : {}) });
  input.addEventListener("change", () => onPick(input.checked));
  return input;
}

function colorControl(current: string, onPick: (v: string) => void): HTMLElement {
  const input = el("input", { type: "color", value: current });
  input.addEventListener("change", () => onPick(input.value));
  return input;
}

/**
 * Styles › Notes — the tiered apparatus, per tier.
 *
 * `#הגדרות_הערות` has always accepted per-tier size, slant, colour, indent,
 * numbering scheme and label prefix, plus the gap between entries. All of it,
 * and **none of it reachable except by typing the command**. This writes the
 * same line a writer would type by hand, which is the constraint that keeps the
 * panel from drifting away from the engine: there is no second representation
 * of a note style anywhere, only this call in the document.
 *
 * Three tiers, because a fourth is rarer than the width it would cost, and any
 * tier is still reachable by typing — the panel preserves every argument it does
 * not understand, including entries past the third.
 */
function noteStyleRows(): Node[] {
  const rows: Node[] = [];
  // Engine defaults, so filling in a gap in a short tuple restyles nothing.
  const D = {
    גודל: ["1em", "0.9em", "0.82em"],
    סגנון: ['"normal"', '"italic"', '"italic"'],
    צבע: ["luma(0)", "luma(55)", "luma(85)"],
    הזחה: ["0em", "1.4em", "2.8em"],
    מספור: ['"א"', '"1"', '"a"'],
  };
  const tierOf = (key: keyof typeof D, tier: number): string | undefined =>
    styles.readTuple(styleArg("notes", key))?.[tier - 1];
  const set = (key: keyof typeof D, tier: number, value: string) =>
    setStyleArgs("notes", { [key]: styles.withTier(styleArg("notes", key), tier, value, D[key]) });

  for (const tier of [1, 2, 3]) {
    rows.push(el("h4", { class: "style-tier" }, [tf("noteTier", String(tier))]));
    rows.push(
      styleRow(
        t("noteTierNumbering"),
        selectControl(
          [
            ["", t("noteNumberingRunning")],
            ['"א"', "א ב ג"],
            ['"1"', "1 2 3"],
            ['"a"', "a b c"],
            ['"i"', "i ii iii"],
            ['"*"', "* † ‡"],
          ],
          tierOf("מספור", tier) ?? "",
          (v) =>
            v
              ? set("מספור", tier, v)
              : setStyleArgs("notes", { מספור: null }),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierSize"),
        selectControl(
          [["1em", "100%"], ["0.9em", "90%"], ["0.82em", "82%"], ["0.75em", "75%"]],
          tierOf("גודל", tier) ?? D["גודל"][tier - 1],
          (v) => set("גודל", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierStyle"),
        selectControl(
          [['"normal"', t("styleNormal")], ['"italic"', t("styleItalic")]],
          tierOf("סגנון", tier) ?? D["סגנון"][tier - 1],
          (v) => set("סגנון", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierIndent"),
        selectControl(
          [["0em", "0"], ["0.7em", "0.7em"], ["1.4em", "1.4em"], ["2.1em", "2.1em"]],
          tierOf("הזחה", tier) ?? D["הזחה"][tier - 1],
          (v) => set("הזחה", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierColor"),
        colorControl(styles.readColor(tierOf("צבע", tier)) ?? "#000000", (v) =>
          set("צבע", tier, styles.typstColor(v)),
        ),
      ),
    );
  }
  return rows;
}

/**
 * Styles › One look for every note — the layer the six apparatuses share.
 *
 * The report is *"footnotes and endnotes should share a default style, and
 * either should be easy to change on its own"*, and the half that was actually
 * missing is the sharing: each apparatus shipped its own size, slant, colour
 * and gap, so the two apparatuses a sefer most often has looked different from
 * each other by default and "make the notes smaller" was six edits. Endnotes
 * were worse than that — they had no ink knobs at all, so there was no *own*
 * to change either.
 *
 * Writes `#הגדרות_טקסט_הערות`, which the engine consults **under** each
 * apparatus's own config: a knob the writer set on the apparatus wins, and one
 * they did not is answered here. Which is what makes "shared, and still
 * changeable" mean something rather than being an order of precedence nobody
 * can see.
 */
/**
 * Styles › Endnotes — the back matter's numbering, and its ink.
 *
 * The five shared knobs plus the one thing that is only an endnote's: the
 * numbering scheme. That scheme is why the section matters even beyond the
 * report — a sefer with footnotes at the foot *and* endnotes at the back marked
 * every note in both apparatuses `1`, so a reader met two different `1` on one
 * page with nothing to tell them apart.
 */
function endnoteStyleRows(): Node[] {
  return [
    styleRow(
      t("noteTierNumbering"),
      selectControl(
        [
          ["", t("default")],
          ['"1"', "1 2 3"],
          ['"א"', "א ב ג"],
          ['"a"', "a b c"],
          ['"i"', "i ii iii"],
          ['"*"', "* † ‡"],
        ],
        (styleArg("endnotes", "מספור") ?? "").trim(),
        (v) => setStyleArgs("endnotes", { מספור: v || null }),
      ),
    ),
    // The word above the section — the writer's own, or none at all.
    //
    // *"It should be the writer's choice: their own word, or nothing at all,
    // with no leftover gap where it was."* Both halves are here: an empty box
    // is `none`, and the engine keeps the heading, the rule above it and the
    // space below it inside one condition so that nothing is left behind.
    styleRow(
      t("endnoteHeading"),
      fieldControl(
        { kind: "text", label: "endnoteHeading" },
        styleArg("endnotes", "כותרת"),
        (v) => setStyleArgs("endnotes", { כותרת: v ?? "none" }),
      ),
    ),
    // On its own page, or running on from the end of the body.
    styleRow(
      t("endnoteFreshPage"),
      fieldControl(
        { kind: "bool", label: "endnoteFreshPage" },
        styleArg("endnotes", "עמוד_חדש"),
        (v) => setStyleArgs("endnotes", { עמוד_חדש: v }),
      ),
    ),
    ...Object.entries(styles.SHARED_NOTE_FIELDS).map(([key, field]) =>
      styleRow(
        t(field.label),
        fieldControl(field, styleArg("endnotes", key), (v) =>
          setStyleArgs("endnotes", { [key]: v }),
        ),
      ),
    ),
  ];
}

function sharedNoteRows(): Node[] {
  return Object.entries(styles.SHARED_NOTE_FIELDS).map(([key, field]) =>
    styleRow(
      t(field.label),
      fieldControl(field, styleArg("noteText", key), (v) =>
        setStyleArgs("noteText", { [key]: v }),
      ),
    ),
  );
}

/**
 * Which of the shared knobs this apparatus is answering for itself.
 *
 * The visible half of the same rule. An apparatus section that has written one
 * of the five says so, by name — otherwise the shared control appears to do
 * nothing for that apparatus and there is nothing on the screen to say why.
 */
function overridingShared(kind: styles.SectionCommand): Node[] {
  const mine = Object.keys(styles.SHARED_NOTE_FIELDS).filter(
    (key) => styleArg(kind, key) !== undefined,
  );
  if (!mine.length) return [];
  const named = mine.map((k) => t(styles.SHARED_NOTE_FIELDS[k].label)).join(", ");
  return [el("p", { class: "styles-note style-overriding" }, [`${t("styleOverriding")}: ${named}`])];
}

/**
 * Styles › My styles — one row per style the document defines.
 *
 * The complaint was *"there is one edit-styles button that opens an editor for
 * every style at once"*, and the fix is not a smaller dialog: it is that a
 * style is edited **from where you see it**. So each row carries the three
 * things a style has — its name, the chord that applies it, and the way into
 * its formatting — and the chord is captured through exactly the same
 * `captureShortcut` the keys drawer uses, because a style is an action and
 * there is one way to bind an action.
 */
function myStyleRows(): Node[] {
  const own = styles.findCustomStyles(docTextNow());
  if (!own.length) return [el("p", { class: "styles-note" }, [t("styleNoneYet")])];
  const kb = keybindings();
  return own.map((st) => {
    const id = styles.styleActionId(st.name);
    const chord = kb[id] ?? "";
    // `hintFor` and not `readable`: under vim or Emacs none of these chords is
    // live, and a row printing `Ctrl+Alt+1` there would be naming a key that
    // does something else. `prohibitions.test.mjs` holds the whole application
    // to this, and a new surface is exactly what it is holding it for.
    const key = el("button", { class: "sc-key", title: t("styleKeyLabel") }, [
      hintFor(id, kb) || "—",
    ]) as HTMLButtonElement;
    key.addEventListener("click", () => captureShortcut(id, key));
    const kids: Node[] = [key];
    if (chord) {
      // The same `×` the keys drawer has, and for the same reason: capture can
      // only assign, so without this the only way off a chord is the reset that
      // discards every custom binding in the application.
      kids.push(
        glyphBtn("×", t("none"), () => {
          settings.keybindings = { ...(settings.keybindings || {}), [id]: "" };
          saveSettings();
          reconfigureShortcuts();
          renderStylesPanel();
        }, "knob-clear"),
      );
    }
    kids.push(iconBtn("✎", tf("editStyleTitle", st.name), () => openStyleEditor(st.name)));
    return styleRow(st.name, el("span", { class: "style-mine-row" }, kids));
  });
}

/**
 * A height and the unit it is written in, as one control.
 *
 * `cm` and `%` are not two spellings of one number. A centimetre is a
 * measurement somebody took off a printed page; a percentage is a proportion
 * that survives the sefer moving from A4 to A5, which is the only reason the
 * engine learned to resolve one. Offering the unit beside the number is what
 * makes that a choice rather than a fact about which was implemented first.
 */
function regionHeightControl(
  current: string | undefined,
  onChange: (value: string) => void,
): HTMLElement {
  const read = styles.readRegionHeight(current);
  const unit = read?.unit ?? "cm";
  const input = el("input", {
    type: "number",
    min: 0,
    // A percentage and a centimetre live on different scales, and a `max` of 12
    // on a percentage would cap the apparatus at a tenth of the page.
    max: unit === "%" ? 60 : 12,
    step: unit === "%" ? 1 : 0.1,
    value: read == null ? "" : String(read.n),
    placeholder: "—",
  }) as HTMLInputElement;
  const commit = (n: number, u: string) => {
    if (!Number.isFinite(n) || n < 0) return;
    onChange(`${n}${u}`);
  };
  input.addEventListener("change", () => commit(parseFloat(input.value), unit));
  const units = selectControl(
    [["cm", t("unitCm")], ["%", t("unitPercent")]],
    unit,
    // Switching the unit keeps the number, not the size: 2cm becoming 2% is a
    // different region and the writer can see that it is. Converting silently
    // would move page geometry from a control that says it changes a unit.
    (u) => commit(read?.n ?? (u === "%" ? 10 : 1.5), u),
  );
  return el("span", { class: "region-height" }, [input, units]);
}

/**
 * Styles › Fixed regions — the heights of the page-foot bands.
 *
 * The one styling control that moves page geometry rather than ink: the engine
 * reserves the foot of every page from exactly this tuple, so a number typed
 * here shortens the text area by the same amount. That is why it is a number and
 * not a slider — a sefer's apparatus is 1.5cm because somebody measured a page,
 * not because they dragged something until it looked right.
 *
 * Off (`גבהים` absent) is the honest default and stays reachable: each band then
 * takes the height its notes need, which is what you want until you are
 * type-setting facing pages that have to line up.
 *
 * **Any number of regions**, which is what the engine has always offered:
 * `#מדף_א…ז` is seven tiers and the prelude reserves a slot for every entry of
 * the tuple. This panel showed three, hard-coded, with a comment explaining that
 * a document with more would keep them — true, and no help at all to the writer
 * who wanted a fourth and had no way to ask for one. The cap was never in the
 * engine; it was in the loop.
 */
function bandStyleRows(): Node[] {
  const heights = styles.readTuple(styleArg("bands", "גבהים"));
  const on = heights !== null;
  const rows: Node[] = [
    styleRow(
      t("bandsFixed"),
      toggleControl(on, (v) =>
        setStyleArgs("bands", { גבהים: v ? styles.typstTuple(["1.5cm", "1cm"]) : null }),
      ),
    ),
  ];
  if (!on || !heights) return rows;
  heights.forEach((h, i) => {
    const tier = i + 1;
    rows.push(
      styleRow(
        tf("bandHeight", String(tier)),
        el("span", { class: "region-row" }, [
          regionHeightControl(h, (value) =>
            setStyleArgs("bands", {
              גבהים: styles.withTier(styleArg("bands", "גבהים"), tier, value, [
                "1.5cm",
                "1cm",
                "1cm",
              ]),
            }),
          ),
          el(
            "button",
            {
              class: "region-drop",
              title: t("regionRemove"),
              "aria-label": t("regionRemove"),
              onClick: () =>
                setStyleArgs("bands", {
                  גבהים: styles.withoutTier(styleArg("bands", "גבהים"), tier),
                }),
            },
            ["×"],
          ),
        ]),
      ),
    );
  });
  // Seven, because `מדף_א…ז` is seven commands: past that a region would exist
  // with no marker able to put a note in it, which is a control that does
  // nothing dressed as one that does something.
  if (heights.length < 7) {
    rows.push(
      styleRow(
        "",
        el(
          "button",
          {
            class: "region-add",
            onClick: () =>
              setStyleArgs("bands", {
                גבהים: styles.typstTuple([...heights, "1cm"]),
              }),
          },
          ["+ " + t("regionAdd")],
        ),
      ),
    );
  }
  rows.push(...markerRows("bands"));
  return rows;
}

/**
 * Styles › Parallel streams — the named peer apparatuses at the page foot.
 *
 * `#הערה_זרם("מקורות")` is a whole second page-foot apparatus that the product
 * has shipped for as long as the bands and never once offered a control for.
 * Where the bands are *tiers* — ordered layers, ב a note on א — these are
 * *peers*: a peirush, a mareh mekomos and a nuschaos band, each numbered on its
 * own, stacked or set side by side, and each pinned to a region of its own
 * height if you want the page geometry fixed.
 *
 * Keyed by name rather than by position, because that is what a stream is. Which
 * also means adding one here is adding a name, and the marker that fills it is
 * `#הערה_זרם` with that same name — written for the writer by the chooser's
 * "several parallel streams" card.
 */
function streamStyleRows(): Node[] {
  const heights = styles.readDict(styleArg("streams", "גבהים"));
  const layout = styles.readString(styleArg("streams", "פריסה")) ?? "מוערם";
  const rows: Node[] = [
    styleRow(
      t("streamLayout"),
      selectControl(
        [["מוערם", t("streamStacked")], ["צד", t("streamSideBySide")]],
        layout,
        (v) => setStyleArgs("streams", { פריסה: v === "מוערם" ? null : styles.typstString(v) }),
      ),
    ),
    styleRow(
      t("streamsFixed"),
      toggleControl(!!heights && heights.length > 0, (v) =>
        setStyleArgs("streams", {
          גבהים: v
            ? styles.typstDict([
                ["ביאור", "10%"],
                ["מקורות", "6%"],
              ])
            : null,
        }),
      ),
    ),
  ];
  if (!heights) return rows;
  for (const [name, value] of heights) {
    const rename = el("input", { type: "text", value: name, class: "stream-name" }) as HTMLInputElement;
    rename.addEventListener("change", () => {
      const to = rename.value.trim();
      // An empty name is not a stream, and two streams with one name are one
      // stream with its notes silently merged. Neither is worth writing to the
      // document, so the control snaps back rather than pretending it took.
      if (!to || to === name || heights.some(([k]) => k === to)) {
        rename.value = name;
        return;
      }
      setStyleArgs("streams", {
        גבהים: styles.renameDictKey(styleArg("streams", "גבהים"), name, to),
        // The order list and the titles are keyed by the same name. Renaming in
        // one and not the others leaves a stream that is ordered and titled
        // under a name nothing writes into any more — the region prints empty
        // and nothing says why.
        זרמים: renamedInTuple(styleArg("streams", "זרמים"), name, to),
        כותרות: styles.renameDictKey(styleArg("streams", "כותרות"), name, to),
        מספור: styles.renameDictKey(styleArg("streams", "מספור"), name, to),
      });
    });
    rows.push(
      styleRow(
        "",
        el("span", { class: "region-row" }, [
          rename,
          regionHeightControl(value, (v) =>
            setStyleArgs("streams", {
              גבהים: styles.withDictKey(styleArg("streams", "גבהים"), name, v),
            }),
          ),
          el(
            "button",
            {
              class: "region-drop",
              title: t("regionRemove"),
              "aria-label": t("regionRemove"),
              onClick: () =>
                setStyleArgs("streams", {
                  גבהים: styles.withDictKey(styleArg("streams", "גבהים"), name, null),
                }),
            },
            ["×"],
          ),
        ]),
      ),
    );
  }
  rows.push(
    styleRow(
      "",
      el(
        "button",
        {
          class: "region-add",
          onClick: () => {
            // A name nobody has used yet. `זרם 3` beside `זרם 3` would be one
            // stream, so it counts up until it is free.
            let n = heights.length + 1;
            while (heights.some(([k]) => k === tf("streamDefaultName", String(n)))) n++;
            setStyleArgs("streams", {
              גבהים: styles.withDictKey(
                styleArg("streams", "גבהים"),
                tf("streamDefaultName", String(n)),
                "6%",
              ),
            });
          },
        },
        ["+ " + t("streamAdd")],
      ),
    ),
  );
  rows.push(...markerRows("streams"));
  return rows;
}

// ------------------------------------------------------------ Styles › marks
//
// The mark register — the styling and collection layer behind `#ציון`, `#סימן`,
// `#פסוק` and the rest of them.
//
// This section used to write one command with the class keyed inside it:
// `#הגדרות_סימונים(גודל: ("סימן": 1.6em))`. Every styled command has a door
// named for it now, and this writes that instead — `#הגדרות_סימן(גודל: 1.6em)`,
// which is what a writer setting how simanim look would type, and reads in the
// document as a sentence about simanim rather than a class name buried in a
// call about marks in general.
//
// Two things follow from the door, and both are the point of it:
//
//   · **The knobs are the class's.** `_mk_set` stops the compile on a knob its
//     class has no answer for. The old spelling did not — it stored a fill on a
//     gemara reference and never read it — so this section offered fourteen
//     controls whatever the class was, half of them doing nothing for most of
//     them. `marks.knobsOf` is the split, held against the prelude.
//   · **The parts are reachable.** A siman prints four things and a pasuk two,
//     and `#הגדרות_פסוק(מקור: (גודל: 1.2em))` could be reached only by typing
//     it. The part chooser sits under the class chooser and the same knob rows
//     sit under that.
//
// `כפה` goes through `scopeRows`, which reads the same door, so the overrule is
// this class's rather than every class's — which is what a writer pressing it
// inside a section headed *siman* means by it.

/** Which mark class the *default* layer is being edited for. */
let markClass: string = marks.STYLED_CLASSES[0];

/** Which piece of it; "" = the command as a whole. */
let markPart = "";

/** The door this section is reading and writing: `#הגדרות_<class>`. */
function markTarget(): styles.StyleTarget {
  return styles.markDoor(markClass);
}

/** The knob rows to offer, which depend on the class and on the part. */
function markKnobs(): readonly string[] {
  if (markPart === "") return marks.knobsOf(markClass);
  // A part is drawn inside its command's own look, so what it can carry is a
  // text look and nothing else — a part of a callout does not draw a second
  // box. Plus the invented words, where the part has any.
  const text = (marks.PART_TEXT[markClass] ?? []).includes(markPart) ? ["טקסט"] : [];
  return [...marks.TEXT_KNOBS, ...text];
}

/** The value the Marks section is showing for one knob. */
function markArg(key: string): string | undefined {
  if (markPart === "") return styleArg(markTarget(), key);
  const dict = styles.readDict(styleArg(markTarget(), markPart));
  return dict?.find(([k]) => k === key)?.[1];
}

/** Write one knob, on the class or on the part of it. */
function setMarkArg(key: string, value: string | null) {
  if (markPart === "") {
    setStyleArgs(markTarget(), { [key]: value });
    return;
  }
  setStyleArgs(markTarget(), {
    [markPart]: styles.withDictKey(styleArg(markTarget(), markPart), key, value),
  });
}

function markClassRow(): Node {
  return styleRow(
    t("markClass"),
    selectControl(
      marks.STYLED_CLASSES.map((c) => [c, t("markClass." + c)] as [string, string]),
      markClass,
      (v) => {
        markClass = v;
        // A part belongs to the class that draws it, so it cannot survive the
        // class changing: `מקור` under `#פסוק` is not `מקור` under anything else.
        markPart = "";
        renderStylesPanel();
      },
    ),
  );
}

/** The part chooser, for the classes that draw more than one thing. */
function markPartRow(): Node | null {
  const parts = marks.CLASS_PARTS[markClass];
  if (!parts || parts.length === 0) return null;
  return styleRow(
    t("markPart"),
    selectControl(
      [
        ["", t("wholeCommand")],
        ...(parts.map((p) => [p, t("markPart." + markClass + "." + p)]) as [string, string][]),
      ],
      markPart,
      (v) => {
        markPart = v;
        renderStylesPanel();
      },
    ),
  );
}

/**
 * The class's own styling, plus the one button that prints the collection.
 *
 * The button is the point of the whole mechanism being reachable: *"there should
 * be a way to gather all of these, to make a list at the end"*. Without it the
 * collection exists and the only way to see it is to know the command's name.
 * It is offered per class, because a list of everything is not a list.
 */
/**
 * Styles › Tiers in the flow — `#הגדרות_מדורגות`.
 *
 * The in-flow apparatus: `#מדור_א` under the text, `#מדור_ב` under that, printed
 * where they are written rather than at the foot of the page. Every knob it has
 * — per-tier numbering, size, slant, weight, colour, and the rules and gaps
 * between the bands — has been in the engine since the apparatus was, and none
 * of it was reachable except by typing the command.
 *
 * This is the same complaint that produced the fixed regions and the streams
 * sections, and this file said so about this very command in a comment in
 * `styles.ts` — *a fourth configuration with no panel section of its own* —
 * which is a finding written down and left where it was found.
 */
/**
 * The rows for one apparatus's marker — its number, wherever that prints.
 *
 * A separate decision from the note's own look, and it had none at all: the
 * note sits at the foot of the page in its band and the number sits in the
 * middle of a sentence somebody is reading. A peirush set small and grey wants
 * its markers legible, and until this there was no way to ask.
 *
 * Written as a dictionary under one key, so an apparatus that gains a knob
 * gains it here and in the prelude and nowhere else.
 */
function markerRows(kind: styles.SectionCommand): Node[] {
  const read = (key: string) =>
    styles.readDict(styleArg(kind, "סימן"))?.find(([k]) => k === key)?.[1];
  const set = (key: string, v: string | null) =>
    setStyleArgs(kind, { סימן: styles.withDictKey(styleArg(kind, "סימן"), key, v) });
  return [
    el("h4", { class: "style-tier" }, [t("apparatusMarker")]),
    styleRow(
      t("noteTierSize"),
      selectControl(
        [["0.8em", "80%"], ["0.9em", "90%"], ["1em", "100%"], ["1.2em", "120%"]],
        read("גודל") ?? "1em",
        (v) => set("גודל", v),
      ),
    ),
    styleRow(
      t("noteTierStyle"),
      selectControl(
        [['"normal"', t("styleNormal")], ['"italic"', t("styleItalic")]],
        read("סגנון") ?? '"normal"',
        (v) => set("סגנון", v),
      ),
    ),
    styleRow(
      t("knobWeight"),
      selectControl(
        [['"regular"', t("weightRegular")], ['"bold"', t("weightBold")]],
        read("משקל") ?? '"regular"',
        (v) => set("משקל", v),
      ),
    ),
    styleRow(
      t("noteTierColor"),
      colorControl(styles.readColor(read("צבע")) ?? "#000000", (v) =>
        set("צבע", styles.typstColor(v)),
      ),
    ),
  ];
}
function tierStyleRows(): Node[] {
  const rows: Node[] = [];
  // Engine defaults, so filling in a gap in a short tuple restyles nothing.
  const D = {
    גודל: ["1em", "0.9em", "0.82em"],
    סגנון: ['"normal"', '"italic"', '"italic"'],
    משקל: ['"regular"', '"regular"', '"regular"'],
    צבע: ["luma(0)", "luma(55)", "luma(85)"],
    מספור: ['"א"', '"1"', '"a"'],
  };
  const tierOf = (key: keyof typeof D, tier: number): string | undefined =>
    styles.readTuple(styleArg("tiers", key))?.[tier - 1];
  const set = (key: keyof typeof D, tier: number, value: string) =>
    setStyleArgs("tiers", { [key]: styles.withTier(styleArg("tiers", key), tier, value, D[key]) });

  for (const tier of [1, 2, 3]) {
    rows.push(el("h4", { class: "style-tier" }, [tf("tierTier", String(tier))]));
    rows.push(
      styleRow(
        t("noteTierNumbering"),
        selectControl(
          [
            ['"א"', "א ב ג"],
            ['"1"', "1 2 3"],
            ['"a"', "a b c"],
            ['"i"', "i ii iii"],
            ['"*"', "* † ‡"],
          ],
          tierOf("מספור", tier) ?? D["מספור"][tier - 1],
          (v) => set("מספור", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierSize"),
        selectControl(
          [["1em", "100%"], ["0.9em", "90%"], ["0.82em", "82%"], ["0.75em", "75%"]],
          tierOf("גודל", tier) ?? D["גודל"][tier - 1],
          (v) => set("גודל", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierStyle"),
        selectControl(
          [['"normal"', t("styleNormal")], ['"italic"', t("styleItalic")]],
          tierOf("סגנון", tier) ?? D["סגנון"][tier - 1],
          (v) => set("סגנון", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("knobWeight"),
        selectControl(
          [['"regular"', t("weightRegular")], ['"bold"', t("weightBold")]],
          tierOf("משקל", tier) ?? D["משקל"][tier - 1],
          (v) => set("משקל", tier, v),
        ),
      ),
    );
    rows.push(
      styleRow(
        t("noteTierColor"),
        colorControl(styles.readColor(tierOf("צבע", tier)) ?? "#000000", (v) =>
          set("צבע", tier, styles.typstColor(v)),
        ),
      ),
    );
  }
  rows.push(...markerRows("tiers"));
  return rows;
}

/**
 * Styles › The side column — `#הגדרות_הערות_צד`.
 *
 * Flat rather than per tier: a side column is one apparatus, and `#הערת_ימין`
 * and `#הערת_שמאל` are two sides of it rather than two depths.
 *
 * The first two rows move page geometry and the rest move ink. The ratio is the
 * main column's width against the note column's, so lowering it narrows the
 * text the reader is reading — the same kind of control as the bands' heights,
 * and offered on the same terms rather than hidden because it is consequential.
 */
function sidenoteStyleRows(): Node[] {
  const em = (key: string, fallback: string, label: string) =>
    styleRow(
      t(label),
      selectControl(
        [["0.4em", "0.4em"], ["0.6em", "0.6em"], ["1em", "1em"], ["1.2em", "1.2em"], ["1.6em", "1.6em"]],
        styleArg("sidenotes", key) ?? fallback,
        (v) => setStyleArgs("sidenotes", { [key]: v }),
      ),
    );
  return [
    styleRow(
      t("sidenoteRatio"),
      selectControl(
        [["1", "1 : 1"], ["1.5", "3 : 2"], ["2", "2 : 1"], ["3", "3 : 1"], ["4", "4 : 1"]],
        styleArg("sidenotes", "יחס") ?? "2",
        (v) => setStyleArgs("sidenotes", { יחס: v }),
      ),
    ),
    em("מרווח", "1.2em", "sidenoteGutter"),
    em("ריווח", "0.6em", "sidenoteGap"),
    styleRow(
      t("noteTierSize"),
      selectControl(
        [["0.7em", "70%"], ["0.78em", "78%"], ["0.85em", "85%"], ["1em", "100%"]],
        styleArg("sidenotes", "גודל") ?? "0.78em",
        (v) => setStyleArgs("sidenotes", { גודל: v }),
      ),
    ),
    styleRow(
      t("noteTierStyle"),
      selectControl(
        [['"normal"', t("styleNormal")], ['"italic"', t("styleItalic")]],
        styleArg("sidenotes", "סגנון") ?? '"normal"',
        (v) => setStyleArgs("sidenotes", { סגנון: v }),
      ),
    ),
    styleRow(
      t("knobWeight"),
      selectControl(
        [['"regular"', t("weightRegular")], ['"bold"', t("weightBold")]],
        styleArg("sidenotes", "משקל") ?? '"regular"',
        (v) => setStyleArgs("sidenotes", { משקל: v }),
      ),
    ),
    styleRow(
      t("noteTierColor"),
      colorControl(styles.readColor(styleArg("sidenotes", "צבע")) ?? "#414141", (v) =>
        setStyleArgs("sidenotes", { צבע: styles.typstColor(v) }),
      ),
    ),
    ...markerRows("sidenotes"),
  ];
}

/**
 * The control for each knob this section can offer.
 *
 * `styles.INSTANCE_FIELDS.marks` is the authority for everything a *mark* takes,
 * and it is fenced against `_mk_own_keys` — so `טקסט` cannot live there: it is a
 * part's key and no mark carries it.
 */
const MARK_FIELDS: Readonly<Record<string, styles.Field>> = {
  ...styles.INSTANCE_FIELDS.marks,
  טקסט: { kind: "text", label: "knobText" },
  // A rule's thickness, which no *mark* carries either: `#קו_מפריד` takes no
  // arguments at all, so it has a class and no per-instance layer.
  עובי: { kind: "length-pt", label: "knobThickness" },
};

function markStyleRows(): Node[] {
  const rows: Node[] = [markClassRow()];
  const part = markPartRow();
  if (part) rows.push(part);
  const offered = markKnobs();
  for (const key of offered) {
    // `פטור` and `ברשימה` belong to one mark and to nothing else: a class that
    // exempts itself from its own styling is a class with no styling, and one
    // that leaves itself out of its own list is a list of nothing. They are not
    // in `knobsOf` for that reason, and this says so rather than relying on it.
    if (key === "פטור" || key === "ברשימה") continue;
    const field = MARK_FIELDS[key];
    if (!field) continue;
    rows.push(
      styleRow(t(field.label), fieldControl(field, markArg(key), (v) => setMarkArg(key, v))),
    );
  }
  // The list button is about the *class*, not about a piece of it, and only the
  // classes the register collects have a list to print.
  if (markPart === "" && marks.MARK_CLASSES.includes(markClass)) {
    rows.push(
      styleRow(
        "",
        el(
          "button",
          {
            class: "note-use",
            // The command name is translated on the way in by `insertionAt`; the
            // *class* is an argument value and is not, so it is written in the
            // document's own language here. The engine reads either spelling —
            // this is about what the writer finds in their file afterwards.
            onClick: () =>
              insertSnippet(
                `#רשימת_סימונים(${typstString(
                  docLang() === "en" ? (COMMAND_EN[markClass] ?? markClass) : markClass,
                )})\n`,
              ),
          },
          ["+ " + t("markInsertList")],
        ),
      ),
    );
  }
  return rows;
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

/** Rename one entry of a `("א", "ב")` order tuple, leaving the order alone. */
function renamedInTuple(src: string | undefined, from: string, to: string): string | null {
  const items = styles.readTuple(src);
  if (!items || !items.length) return null;
  return styles.typstTuple(
    items.map((s) => (styles.readString(s) === from ? styles.typstString(to) : s)),
  );
}

function renderStylesPanel() {
  const box = document.getElementById("styles-body");
  if (!box) return;

  // --- presets ---
  const presets = el("div", { class: "style-presets" },
    Object.keys(SKINS).map((name) =>
      el("button", { class: "style-preset", onClick: () => applySkin(name) }, [t("skin." + name)]),
    ),
  );

  // --- headings (in-document) ---
  const headInstance = scopedInstance("headings");
  const hNumbering = styles.readString(headingArg("מספור")) ?? "";
  const hRule = styles.readBool(headingArg("קו")) ?? false;
  const hUnderline = styles.readBool(headingArg("קו_תחתון")) ?? false;
  const hSmallcaps = styles.readBool(headingArg("רברבתי")) ?? false;
  const hColor = styles.readColor(headingArg("צבע")) ?? "#000000";
  const hAlign = (headingArg("יישור") ?? "none").trim();
  const hSize = (headingArg("גודל") ?? "").trim();

  const headings = headInstance
    ? instanceRows("headings", headInstance)
    : [
        headingLevelRow(),
        // The knob the per-level model exists for, and the one the panel never
        // offered: a six-level ramp is a ramp of sizes before it is anything else.
        styleRow(
          t("knobSize"),
          fieldControl({ kind: "size-em", label: "knobSize" }, hSize || undefined, (v) =>
            setHeadingArg("גודל", v),
          ),
        ),
        styleRow(t("headingNumbering"), selectControl(
          [["", t("none")], ["1.", "1. 2. 3."], ["1.1", "1.1 1.2"], ["א.", "א. ב. ג."], ["I.", "I. II."]],
          hNumbering,
          (v) => setHeadingArg("מספור", v ? styles.typstString(v) : null),
        )),
        styleRow(t("headingAlign"), selectControl(
          [["none", t("inherit")], ["right", t("right")], ["center", t("center")], ["left", t("left")]],
          hAlign,
          (v) => setHeadingArg("יישור", v === "none" ? null : v),
        )),
        styleRow(t("headingColor"), colorControl(hColor, (v) =>
          setHeadingArg("צבע", v === "#000000" ? null : styles.typstColor(v)))),
        styleRow(t("headingRule"), toggleControl(hRule, (v) =>
          setHeadingArg("קו", v ? "true" : null))),
        styleRow(t("headingUnderline"), toggleControl(hUnderline, (v) =>
          setHeadingArg("קו_תחתון", v ? "true" : null))),
        styleRow(t("headingSmallcaps"), toggleControl(hSmallcaps, (v) =>
          setHeadingArg("רברבתי", v ? "true" : null))),
      ];

  // --- lists (in-document) ---
  const lMarker = styleArg("lists", "סמן") ?? "";
  const lTight = styles.readBool(styleArg("lists", "הידוק")) ?? false;
  const lIndent = styles.readLength(styleArg("lists", "הזחה"), "em") ?? 1;

  const indentInput = el("input", { type: "number", min: 0, max: 5, step: 0.25, value: String(lIndent) });
  indentInput.addEventListener("change", () => {
    const v = parseFloat(indentInput.value);
    setStyleArgs("lists", { "הזחה": Number.isFinite(v) && v !== 1 ? `${v}em` : null });
  });

  const listInstance = scopedInstance("lists");
  const lists = listInstance
    ? instanceRows("lists", listInstance)
    : [
        styleRow(t("listMarker"), selectControl(
          [["", t("default")], ["[•]", "•"], ["[–]", "–"], ["[◆]", "◆"], ["[▪]", "▪"], ["[✦]", "✦"]],
          lMarker,
          (v) => setStyleArgs("lists", { "סמן": v || null }),
        )),
        styleRow(t("listIndent"), indentInput),
        styleRow(t("listTight"), toggleControl(lTight, (v) =>
          setStyleArgs("lists", { "הידוק": v ? "true" : null }))),
        // Per level, because that is how Typst has always read the pattern and
        // how a sefer is actually numbered: digits for the simanim, letters for
        // the se'ifim under them. Written on the document's config rather than
        // on one list, which is where "what does level two look like" belongs.
        styleRow(t("listNumbering"), levelsControl(styleArg("lists", "מספור"), (v) =>
          setStyleArgs("lists", { "מספור": v }))),
        styleRow(t("listStart"), fieldControl(
          { kind: "count", label: "knobStart" },
          styleArg("lists", "התחלה"),
          (v) => setStyleArgs("lists", { "התחלה": v }),
        )),
      ];

  // --- tables (in-document) ---
  const tStripe = styles.readBool(styleArg("tables", "פסים")) ?? false;
  const tHeaderFill = styles.readColor(styleArg("tables", "צבע_כותרת")) ?? "#ebebeb";
  const tInset = styles.readLength(styleArg("tables", "מרווח"), "pt") ?? 8;

  const insetInput = el("input", { type: "number", min: 0, max: 30, step: 1, value: String(tInset) });
  insetInput.addEventListener("change", () => {
    const v = parseFloat(insetInput.value);
    setStyleArgs("tables", { "מרווח": Number.isFinite(v) && v !== 8 ? `${v}pt` : null });
  });

  const tableInstance = scopedInstance("tables");
  const tables = tableInstance
    ? instanceRows("tables", tableInstance)
    : [
        styleRow(t("tableStripes"), toggleControl(tStripe, (v) =>
          setStyleArgs("tables", { "פסים": v ? "true" : null }))),
        styleRow(t("tableHeaderFill"), colorControl(tHeaderFill, (v) =>
          setStyleArgs("tables", { "צבע_כותרת": styles.typstColor(v) }))),
        styleRow(t("tableInset"), insetInput),
        styleRow(t("tableBorder"), toggleControl(
          (styleArg("tables", "קו") ?? "x") !== "none",
          (v) => setStyleArgs("tables", { "קו": v ? null : "none" }),
        )),
      ];

  // The three apparatus sections keep their per-tier and per-stream controls for
  // the document's default, and swap to the one note's own when the writer scopes
  // them there: a note has no tiers of its own and a tier selector on one note is
  // a control for a distinction that does not exist at that scope.
  const DEFAULT_STYLE_ROWS: Record<string, () => Node[]> = {
    notes: noteStyleRows,
    bands: bandStyleRows,
    streams: streamStyleRows,
    tiers: tierStyleRows,
    sidenotes: sidenoteStyleRows,
    marks: markStyleRows,
  };

  box.replaceChildren(
    panelHead("styles-panel", "stylesTitle"),
    el("p", { class: "styles-lede" }, [t("stylesLede")]),

    el("h3", {}, [t("stylePresets")]),
    el("p", { class: "styles-note" }, [t("presetWarning")]),
    presets,
    ...(pendingUndo()
      ? [el("button", { class: "style-undo", onClick: () => { undoSkin(); renderStylesPanel(); } }, [
          "↶ " + tf("undoPreset", t("skin." + pendingUndo()!.name)),
        ])]
      : []),

    el("h3", {}, [t("stylePage")]),
    el("p", { class: "styles-note" }, [t("pageStyleNote")]),

    // Ten sections, from the table in `panelviews.ts` rather than written out
    // here. The rows are still built here — see `styleSection` for what moving
    // them would cost and why it has not been paid — but *which* sections there
    // are, in what order, with which note and which scope selector, is data a
    // test can hold.
    ...panelviews.STYLE_SECTIONS.map((section) => {
      const inst = scopedInstance(section.kind as styles.StyleCommand);
      const scope = section.scope
        ? scopeRows(section.kind as styles.StyleCommand, section.scope[0], section.scope[1])
        : [];
      const rows =
        section.kind === "noteText"
          ? sharedNoteRows()
          : section.kind === "endnotes"
          ? endnoteStyleRows()
          : section.kind === "mine"
          ? myStyleRows()
          : section.kind === "headings"
          ? headings
          : section.kind === "lists"
            ? lists
            : section.kind === "tables"
              ? tables
              : section.kind === "destinations"
                ? destinationRows()
                : inst
                  ? instanceRows(section.kind as styles.InstanceCommand, inst)
                  : DEFAULT_STYLE_ROWS[section.kind]();
      // Every apparatus that reads the shared note style says so when it is
      // not: `NOTE_KINDS` is the six the engine's `_nt_under` covers.
      const overriding = (styles.NOTE_KINDS as readonly string[]).includes(section.kind)
        ? overridingShared(section.kind as styles.SectionCommand)
        : [];
      return panelviews.styleSection(section, scope, [...overriding, ...rows]);
    }),
    el("p", { class: "styles-note" }, [t("documentStyleNote")]),
  );
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
  host.innerHTML = svg;
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
  showChromeNotice(t("setupIsDefault"));
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
    void setEditingMode(value).then(rerenderChrome);
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
  nameMarks({
    added: t("mark.added"),
    changed: t("mark.changed"),
    removed: t("mark.removed"),
  });
}

function applyUiDir() {
  document.documentElement.lang = getLang();
  document.documentElement.dir = isRtlUi() ? "rtl" : "ltr";
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
      el("p", { class: "pane-lede" }, [t("outlineLede")]),
      el("div", { id: "outline-list", class: "outline-list" }),
    ]),
    // The notes pane, beside the outline: the two halves of a sefer's structure.
    el("aside", { id: "notes-drawer", class: "drawer drawer-start", "aria-label": t("notesPane"), "data-i18n-label": "notesPane" }, [
      panelHead("notes-drawer", "notesPane", { level: "h3" }),
      el("p", { class: "pane-lede" }, [t("notesPaneLede")]),
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
      el("p", { class: "pane-lede" }, [t("marksPaneLede")]),
      el("div", { id: "marks-list", class: "marks-list" }),
    ]),
    // Find. A drawer on the same edge as the three list panes, because the
    // answer is a list of places in the document and that is what that edge is
    // for — but transient, because it answers a question rather than showing a
    // view of the sefer.
    el("aside", { id: "find-drawer", class: "drawer drawer-start", "aria-label": t("findTitle"), "data-i18n-label": "findTitle" }, [
      panelHead("find-drawer", "findTitle", { level: "h3" }),
      el("p", { class: "pane-lede" }, [t("findLede")]),
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
        el("span", {}, [t("searchScope")]),
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
            el("option", { value: "source" }, [t("searchScope.source")]),
            el("option", { value: "preview" }, [t("searchScope.preview")]),
            el("option", { value: "both" }, [t("searchScope.both")]),
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
  paneTree = tabs.current()!.tree;
  focusedPane = tabs.current()!.focusedPane;
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
      closeOnEscape();
      // Escape has always also meant "put me back in the text", whether or not
      // anything was open — the close functions each ended with a `focus()` and
      // so did this. Said once now, and unconditionally, because the panels
      // themselves no longer run their side effects when they were not open.
      runtime.view?.focus();
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
      el("p", {}, [t("welcomeBody")]),
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
                  void loadTemplate(tpl);
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
  wirePanel("git-panel", { open: () => void refreshGit(), rebuild: renderGitPanel });
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
  wirePanel("history-modal", { open: () => void renderHistory(), rebuild: () => void renderHistory() });
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
    close: () => {
      openHydraState = null;
      // Paired with `openHydra`'s `addEventListener`, and deliberately here
      // rather than in `closeHydra`: this hook is what *every* way of closing
      // the panel runs through — the ×, the backdrop, the Escape sweep and
      // `closePanel` — so a capture listener on `window` cannot outlive the
      // panel that installed it down some path nobody thought about.
      window.removeEventListener("keydown", captureHydraKeys, true);
      runtime.view?.focus();
    },
  });
  wirePanel("welcome", { close: () => localStorage.setItem("ksav.onboarded", "1") });
}

function installHooks() {
  wirePanels();
  runtime.onRerenderChrome(rerenderChrome);
  runtime.onOpenDoc(openDoc);
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
  label: string;
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
    el("span", { class: "save-error-text" }, [message]),
    ...acts.map((a) =>
      el("button", { class: "save-error-act", type: "button", onClick: a.press }, [a.label]),
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
  showChromeNotice(t("registriesFailed"));
  window.setTimeout(async () => {
    if (await fetchRegistries()) return;
    // Out of automatic attempts: hand the retry over rather than leaving a
    // "retrying…" that will never resolve.
    showChromeNotice(t("registriesGaveUp"), { label: t("retrySave"), press: () => void loadRegistries() });
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
  onGoToPart((file, line, column) => {
    const entry = docs.library().find((e) => e.title === file);
    if (!entry) return;
    void (async () => {
      await enterDoc(entry.id);
      runtime.jumpTo(offsetOf(runtime.view, line, column) ?? 0);
    })();
  });
  registerServiceWorker();
  void openSharedIfLinked();
  // Rescue the text before anything else, then say what happened.
  crash.install(
    () => ({
      title: runtime.currentDoc?.title ?? "",
      body: runtime.docText(),
      id: runtime.currentDoc?.id,
    }),
    (_e, detail) => showCrashPanel(detail),
  );
  void offerRecovery();
  void maybeCheckForUpdate();
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
        press: () => void reloadFromDisk(),
      });
    },
  );
  if (settings.editingMode && settings.editingMode !== "default") {
    void setEditingMode(settings.editingMode);
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


boot();

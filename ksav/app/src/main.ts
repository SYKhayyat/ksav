import "./styles.css";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { Compartment, EditorState, Prec, Transaction } from "@codemirror/state";
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
  revealAll,
  setRevealAll,
  outline,
} from "./ksav-lang";
import { bracketLint, healAll } from "./bracket-lint";
import { pairedDelimiters } from "./brackets";
import { apparatusLint, renderAllNotes } from "./apparatus-lint";
import { onAttachRef, sourceNoteMarks } from "./sourcenote-lint";
import { numberingMarks, renumberAll } from "./numbering-lint";
import { inSeries, resequenceAt } from "./numbering";
import {
  deferredNotes,
  jumpDeferred,
  deferHere,
  recallHere,
  deferAll,
  inlineAll,
  sortDeferredBodies,
} from "./deferred-lint";
import { createBackend, sourcesOf } from "./api";
/** How often the editor asks Girsa's desk whether anything arrived. A second
 *  is under the threshold at which a hand-off feels like a hand-off, and it is
 *  one lock and an empty vector when there is nothing waiting. */
const GIRSA_POLL_MS = 1000;
import type { Mekor, Mekoros, Refreshed, Refreshing, TemplateDef } from "./api";
import type * as api from "./api";
import * as git from "./git";
import * as panelviews from "./panelviews";
import { t, tf, setLang, getLang, isRtlUi } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import * as opendocs from "./opendocs";
import * as panes from "./panes";
import * as tabs from "./tabs";
import type { DocAsset } from "./docs";
import { ACTION_COMMAND, PLACED_COMMANDS, actionForCommand } from "./actions";
import * as store from "./store";
import * as files from "./files";
import {
  NOTE_CHOICES,
  NOTE_HOW,
  NOTE_WHERE,
  applyChoice,
  choiceAt,
  choiceForCommand,
  convertNote,
  deleteNote,
  markersOf,
  noteAt,
  noteDepthAt,
  scaffold,
  notesIn,
  tieredNoteAt,
  whyNot,
  type NoteHow,
  type NoteWhere,
} from "./notes";
import { aliasesInForce, keyHint, keybindingsFrom, whoHolds } from "./bindings";
import * as sefarim from "./sefarim";
import * as spell from "./spell";
import { printedPrefix, fractionAtLine, lineAtFraction } from "./scrollmap";
import * as styles from "./styles";
import * as review from "./review";
import { typstString, typstContent } from "./typst-escape";
import { citationMarkup } from "./citation";
import type { NoteChoice } from "./notes";
import * as marks from "./marks";
import * as menus from "./menus";
import { marksIn } from "./marks";
import * as channels from "./channels";
import * as apparatus from "./apparatus";

// The modules `main.ts` was split into. What is left here is the shell: the
// editor itself, the chrome around it, the panels, and boot. Everything with a
// life of its own — the store, saving, compiling, exporting, the diagnostics
// vocabulary, the settings — now lives beside this file rather than inside it.
import {
  el,
  noticeHost,
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
} from "./settings";
import type { Field, Settings, PageSetup, ValueOf } from "./settings";
// The alignment pair is read and written as a unit rather than field by field —
// see `alignRow` — so it comes in under a namespace instead of as four more
// names in the list above.
import * as settings_ from "./settings";
import * as save from "./save";
import { scheduleSave, saveNow, flushSaves, reportSaveFailure } from "./save";
import { scheduleCompile, runCompile, onSchedule, bodyOnScreen } from "./compile";
import * as commands from "./commands";
import {
  applyPreview,
  clearPages,
  currentPages,
  drawCurrentInto,
  drawRemembered,
  forgetPages,
  pageBox,
  rememberPages,
} from "./preview";
import { drawMark, isPlainClick, pageUnder, pointInPage } from "./jump";
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
import { lineInDocument, onGoToLine, onGoToPart, onMarkLines } from "./diagview";
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
async function openDoc(id: string) {
  const next = await docs.getDoc(id);
  if (!next) return;
  // Already on screen — and *fully* so. Both halves are checked because closing
  // a document moves the open set's focus before this runs, so the set can name
  // a document the view is not yet showing.
  if (opendocs.focusedId() === id && runtime.currentDoc?.id === id) return;
  await flushSaves();
  runtime.setSwitching(true);
  stashFocused();
  const leaving = runtime.currentDoc?.id ?? null;
  // Keep this document's pages before anything points somewhere else, so coming
  // back to it shows it rather than a blank pane and a wait. See `showPagesFor`
  // for the other half, and `preview.ts` for why the pages are kept at all.
  if (leaving) rememberPages(leaving);
  runtime.setCurrentDoc(next);
  docs.setCurrentId(next.id);
  runtime.setCurrentBinding(await files.recallBinding(next.id));
  // Stamp the file as we found it, so "has it changed" has something to mean.
  await watch.markInSync(next.id, runtime.currentBinding);
  if (!opendocs.isOpen(id)) {
    opendocs.put({ id, state: makeState(next.body, !!settings.prose), scrollTop: 0, prose: !!settings.prose });
  }
  const entry = opendocs.focus(id)!;
  runtime.view.setState(entry.state);
  syncGlobals();
  runtime.view.scrollDOM.scrollTop = entry.scrollTop;
  runtime.setSwitching(false);
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
  // A different document is a different folder and possibly a different
  // repository. Anything version control learned about the last one is now a
  // claim about the wrong file, and a chip reporting three uncommitted changes
  // that belong to a sefer you closed is precisely the class of lie this
  // application is being audited for.
  forgetGit();
  updateTitleBar();
  rerenderChrome();
  runtime.view.focus();
  showPagesFor(id);
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
            void openDoc(entry.id);
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
  runtime.view.dispatch({
    effects: [
      themeCompartment.reconfigure(editorTheme(settings.theme === "dark")),
      focusCompartment.reconfigure(focusExtension(!!settings.focusMode, !!settings.typewriter)),
      shortcutCompartment.reconfigure(Prec.highest(keymap.of(buildShortcutKeymap()))),
      autoCompartment.reconfigure(autoExtension()),
      structureCompartment.reconfigure(Prec.high(keymap.of(structureKeymap()))),
      // The document's own, and it has to be re-read rather than inherited:
      // this is the incoming document's direction, not the outgoing one's.
      dirCompartment.reconfigure(EditorView.contentAttributes.of({ dir: docConfig().dir })),
    ],
  });
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
  await keymodes.applyMode(runtime.view, keymodes.isMode(mode) ? mode : "default");
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
    const list = await docs.snapshots(runtime.currentDoc.id);
    baseline = list.length ? list[list.length - 1].body : null;
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
  await openDoc(copy.id);
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
  if (!confirm(tf("confirmDeleteDoc", entry.title))) return;
  const wasFocused = opendocs.focusedId() === id;
  await docs.deleteDoc(id);
  await files.rememberBinding(id, null);
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

function renameDoc() {
  const name = prompt(t("renamePrompt"), runtime.currentDoc.title);
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
    const dirty = !!runtime.currentBinding && save.hasUnsavedFileChanges();
    sub0.textContent = runtime.currentBinding ? (dirty ? "● " : "") + runtime.currentBinding.name : "";
    sub0.classList.toggle("dirty", dirty);
    sub0.title = runtime.currentBinding
      ? (dirty ? t("unsavedChanges") + " · " : "") +
        (runtime.currentBinding.path || runtime.currentBinding.name)
      : t("noFileBound");
  }
  document.title =
    (runtime.currentBinding && save.hasUnsavedFileChanges() ? "● " : "") +
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
  // One question — does this reach the page? — asked three ways. See `hiding.ts`.
  { id: "fold", run: () => (insertFold(), true) },
  { id: "hideBlock", run: () => (hideBlockHere(), true) },
  { id: "hideLine", run: () => (hideLineHere(), true) },
  { id: "hiddenBreak", run: () => (hiddenBreak(), true) },
  // The fourth thing Enter can mean, and the one the product had no way to say:
  // end the paragraph *here*, without the blank line that a list item reads as
  // the end of the item and a note body swallows.
  // Written in Hebrew and translated by `insert.plan`, like every other snippet
  // in this table — an English document gets `#parabreak`.
  { id: "paraBreak", run: () => (insertSnippet("#מעבר_פסקה"), true) },
  { id: "undo", run: (v) => undo(v) },
  { id: "redo", run: (v) => redo(v) },
  { id: "palette", run: () => (openPalette(), true) },
  { id: "commandsDrawer", run: () => (openCommands(), true) },
  { id: "gitPanel", run: () => (openGit(), true) },
  { id: "keysDrawer", run: () => (openKeys(), true) },
  { id: "find", run: (v) => openSearchPanel(v) },
  { id: "foldAll", run: (v) => foldAll(v) },
  { id: "unfoldAll", run: (v) => unfoldAll(v) },
  // Fold *to a depth*: chapters only, or chapters and simanim. `foldAll` takes
  // every collapsible thing in the document down at once, which is a different
  // question and the only one this editor could answer.
  ...[1, 2, 3].map((level) => ({
    id: `foldLevel${level}`,
    run: (v: EditorView) => (foldToLevel(v, level), true),
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
  {
    // Round, because with two or three arrangements "next" is the only motion
    // anybody needs and a key that stops at the end is a key you have to look at
    // the screen to use.
    id: "nextTab",
    run: () => {
      if (tabs.count() > 1) selectTab((tabs.activeIndex() + 1) % tabs.count());
      return true;
    },
  },
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
  ];
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
  runtime.view.dispatch({
    effects: [
      shortcutCompartment.reconfigure(Prec.highest(keymap.of(buildShortcutKeymap()))),
      // Both, or rebinding Tab in Settings would change the shortcut list and
      // leave the editor still doing the old thing.
      structureCompartment.reconfigure(Prec.high(keymap.of(structureKeymap()))),
    ],
  });
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

async function runSpellCheck() {
  if (!runtime.backend || !settings.spellcheck || !runtime.view) return;
  // Only the text that will actually print: command names are not misspellings,
  // and underlining them would make the feature useless on its first document.
  const text = spell.checkableText(docTextOf(runtime.view.state.doc), {
    comments: !!settings.spellcheckComments,
  });
  try {
    const res = await runtime.backend.spell(text, spell.userWordsText(), false);
    spellFailed = false;
    spell.noteLexiconSizes(res.lexicon_sizes);
    // The panel is built before the first check answers, so the note starts as
    // the general statement and becomes the measured one here. Updating the node
    // rather than rebuilding the chrome, because this runs on every pause in
    // typing.
    const note = document.getElementById("spell-coverage");
    if (note) note.textContent = spellCoverageNote();
    runtime.view.dispatch({ effects: spell.setMisspellings.of(res.misspellings) });
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
      runSpellCheck();
      runtime.view.focus();
    } }, ["＋ " + t("addToDictionary")]),
  );
}

function closeSpellMenu() {
  closePanel("spell-menu");
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
  return prose ? proseMode : visibleBidiMarks(bidiMarkName);
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
 */
function makeState(body: string, prose: boolean): EditorState {
  return EditorState.create({
    doc: body,
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
        const closer = hiding.foldCloser(doc.slice(0, from) + "{" + doc.slice(to), from + 1);
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
      focusCompartment.of(focusExtension(!!settings.focusMode, !!settings.typewriter)),
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
          v.dispatch({
            changes: { from: at.from, to: at.to, insert: plain },
            selection: { anchor: at.from + plain.length },
          });
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
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged || u.selectionSet) updateContextBar();
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
/** Set while a change is being mirrored, so mirroring does not recurse. */
let mirroring = false;

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
      // A mirror that is typed into hands the change to the primary, so the
      // edit is recorded once. Everything that is not a document change —
      // moving the caret, folding, scrolling into view — stays local, because
      // those are exactly the things a pane owns.
      const primary = primaryView();
      if (tr.docChanged && !mirroring && primary && primary !== view) {
        const was = tr.annotation(Transaction.userEvent);
        primary.dispatch({
          changes: tr.changes,
          selection: tr.selection,
          ...(was ? { userEvent: was } : {}),
        });
        return;
      }
      view.update([tr]);
      mirrorChange(view, tr);
    },
  });
  return view;
}

/**
 * Build `<main>` from the pane tree.
 *
 * Rebuilt wholesale rather than diffed, and the cost is bounded because it only
 * runs when the *arrangement* changes — not on a keystroke, not on a scroll, and
 * not when a document is switched. Each source pane's state is carried across so
 * an arrangement change does not cost a writer their carets.
 */
function renderPanes() {
  const main = document.querySelector("main");
  if (!main) return;
  // What each pane was holding, so rebuilding does not reset it.
  const held = new Map<string, EditorState>();
  for (const [id, v] of paneViews) held.set(id, v.state);
  for (const v of paneViews.values()) v.destroy();
  paneViews.clear();

  main.replaceChildren(renderNode(paneTree, held));
  main.setAttribute("data-panes", String(panes.leaves(paneTree).length));

  // The focused pane has to be one that still exists.
  const live = panes.leaves(paneTree).filter((l) => l.role === "source");
  if (!focusedPane || !paneViews.has(focusedPane)) focusedPane = live[0]?.id ?? null;
  const v = focusedPane ? paneViews.get(focusedPane) : undefined;
  if (v) runtime.setView(v);
  applyPreview();
  drawCurrentIntoAll();
  // The side panels, now that their hosts are in the document. Both are cheap
  // and both are wrong to leave blank: an outline pane that fills in on the
  // next keystroke is an outline pane that looks broken until you type.
  renderOutline();
  renderNotesPane();
}

function renderNode(node: panes.PaneNode, held: Map<string, EditorState>): HTMLElement {
  if (node.kind === "leaf") return renderLeaf(node, held);
  const box = el("div", { class: "pane-split", "data-dir": node.dir });
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
    { class: `pane ${pane.role}-pane`, "data-pane": pane.id, "aria-label": t(pane.role) },
    [paneHead(pane), host],
  );
  if (pane.role === "source") {
    const state =
      held.get(pane.id) ??
      makeState(primaryView() ? docTextOf(primaryView()!.state.doc) : runtime.currentDoc.body, proseHere());
    const view = makePaneView(host, state);
    paneViews.set(pane.id, view);
    host.addEventListener("focusin", () => {
      focusedPane = pane.id;
      runtime.setView(view);
    });
  } else if (pane.role === "preview") {
    host.classList.add("preview-host");
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
  wirePaneScroll(pane, host);
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
  const kids: Node[] = [el("span", { class: "pane-name" }, [t(NAME[pane.role])])];
  if (panes.leaves(paneTree).length > 1) {
    kids.push(
      el("button", {
        class: "pane-btn",
        title: pane.linked ? t("scrollLinked") : t("scrollUnlinked"),
        onClick: () => setTree(panes.update(paneTree, pane.id, { linked: !pane.linked })),
      }, [pane.linked ? "⇅" : "⇵"]),
      el("button", {
        class: "pane-btn",
        title: t("splitBeside"),
        onClick: () => setTree(panes.split(paneTree, pane.id, "col", panes.leaf(pane.role, pane.docId, { linked: false }))),
      }, ["⊟"]),
      // Closing a *pane* is not closing a document and not deleting one. Third
      // meaning, third glyph — see the Documents menu for the other two.
      el("button", {
        class: "pane-btn pane-close",
        title: t("closePane"),
        onClick: () => setTree(panes.closePane(paneTree, pane.id)),
      }, ["–"]),
    );
  }
  return el("div", { class: "pane-head" }, kids);
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
function wirePaneScroll(pane: panes.Leaf, host: HTMLElement) {
  const scroller = () =>
    pane.role === "source" ? (paneViews.get(pane.id)?.scrollDOM ?? host) : host;
  host.addEventListener(
    "scroll",
    () => {
      if (mirroring) return;
      const top = scroller().scrollTop;
      pane.scrollTop = top;
      if (!pane.linked) return;
      const other = panes.sibling(paneTree, pane.id);
      if (!other || !other.linked) return;
      const target = other.role === "source" ? paneViews.get(other.id)?.scrollDOM : paneHostOf(other.id);
      if (!target) return;
      mirroring = true;
      try {
        syncLinkedScroll(pane, other, top, target);
      } finally {
        mirroring = false;
      }
    },
    true,
  );
}

function paneHostOf(id: string): HTMLElement | null {
  return document.getElementById(`pane-host-${id}`);
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
function syncLinkedScroll(from: panes.Leaf, to: panes.Leaf, top: number, target: HTMLElement) {
  if (from.role === to.role) {
    const src = from.role === "source" ? paneViews.get(from.id)!.scrollDOM : paneHostOf(from.id)!;
    target.scrollTop = (top / Math.max(1, src.scrollHeight)) * target.scrollHeight;
    return;
  }
  if (from.role === "source") {
    const view = paneViews.get(from.id)!;
    const line = view.state.doc.lineAt(view.lineBlockAtHeight(top).from).number - 1;
    target.scrollTop = Math.min(
      fractionAtLine(printedMap(), line) * target.scrollHeight,
      target.scrollHeight - target.clientHeight,
    );
  } else {
    const host = paneHostOf(from.id)!;
    const view = paneViews.get(to.id)!;
    const line = lineAtFraction(printedMap(), top / Math.max(1, host.scrollHeight));
    const doc = view.state.doc;
    const at = doc.line(Math.max(1, Math.min(line + 1, doc.lines)));
    target.scrollTop = view.lineBlockAt(at.from).top;
  }
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

/** Dress the source pane as a sheet of paper, or stop. */
function applyPageView() {
  const app = document.getElementById("app")!;
  if (settings.pageView) app.dataset.page = "1";
  else delete app.dataset.page;
  saveSettings();
}

/** Change the arrangement, redraw, and remember it. */
function setTree(next: panes.PaneNode) {
  paneTree = next;
  renderPanes();
  rememberPanes();
  scheduleCompile();
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
  if (!tabs.stripVisible()) return strip;
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
        el("button", {
          class: "tab-close",
          title: t("closeTab"),
          onClick: (e: Event) => {
            e.stopPropagation();
            closeTab(i);
          },
        }, ["×"]),
      ]),
    );
  });
  strip.append(
    el("button", { class: "tab-new", title: t("newTab"), onClick: () => newTab() }, ["+"]),
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

/** A second arrangement, starting from the shipped one. */
function newTab() {
  tabs.stash(paneTree, focusedPane);
  const tab = tabs.add(panes.defaultTree());
  paneTree = tab.tree;
  // Pinned to whatever is on screen, so the new tab is a thing rather than a
  // second window onto whatever happens to be focused.
  retargetPanes(null, runtime.currentDoc.id);
  focusedPane = null;
  renderPanes();
  refreshTabStrip();
  rememberPanes();
  scheduleCompile();
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
  if (want && want !== runtime.currentDoc?.id) void openDoc(want);
  else scheduleCompile();
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
  if (want && want !== runtime.currentDoc?.id) void openDoc(want);
  else scheduleCompile();
}

function renameTab(i: number) {
  const tab = tabs.all()[i];
  if (!tab) return;
  const name = prompt(t("renameTabPrompt"), tab.name ?? "");
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
  }, PANE_DEBOUNCE_MS);
}
const PANE_DEBOUNCE_MS = 200;

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
async function revealCursor(): Promise<boolean> {
  if (!runtime.backend) return true;
  const pages = currentPages();
  if (!pages.length) {
    setStatus(t("revealNoPages"), "warn");
    return true;
  }
  const { body, offset } = bodyOnScreen();
  const head = runtime.view.state.selection.main.head;
  const line = runtime.view.state.doc.lineAt(head);
  setStatus(t("revealWorking"));
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
    // because the writer pressed a key and is owed an answer.
    setStatus(t("revealNowhere"), "warn");
    return true;
  }
  const node = document.querySelector<HTMLElement>(`#preview .page[data-page="${at.page}"]`);
  if (!node) return true;
  node.scrollIntoView({ block: "center", behavior: "smooth" });
  drawMark(node, at, box);
  setStatus(
    points.length > 1 ? tf("revealFoundMany", points.length) : tf("revealFound", at.page + 1),
    "ok",
  );
  return true;
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
function showRefreshed(rows: Refreshed[], got?: Refreshing): void {
  const list = document.getElementById("refresh-list");
  if (!list) return;
  const doc = docTextOf(runtime.view.state.doc);
  const moved = got ? movedRow(got) : null;
  list.replaceChildren(
    ...(moved ? [moved] : []),
    ...rows.map((row) => {
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
              onClick: () => takeRefreshed(row),
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
function takeRefreshed(row: Refreshed): void {
  const doc = docTextOf(runtime.view.state.doc);
  const at = doc.indexOf(row.ref);
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
  showRefreshed([row]);
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
 */
function insertSnippet(rawSnippet: string) {
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
    return;
  }
  if (plan.kind === "note") {
    applyNoteChoice(plan.choice, plan.layer, { to: sel.to, text: selText, marker: plan.marker });
    return;
  }
  // "Make this a real list" — the bullet button pressed over paragraphs. A
  // whole-document rewrite because it reaches past the selection to the ends of
  // the lines it touches, which a splice into `[from, to]` cannot do.
  if (plan.kind === "rewrite") {
    editDoc(plan.text, plan.caret);
    runtime.view.focus();
    return;
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
      return;
    }
  }
  runtime.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: plan.text },
    selection: { anchor: sel.from + plan.cursor },
  });
  runtime.view.focus();
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
 * A table of contents, at the top of the document, once.
 *
 * The one door, and there used to be two. `heading.contents` was a structural
 * operation on headings — so it refused unless the caret was inside a section,
 * which is nowhere near where a table of contents goes — and the `toc` action
 * spliced `#תוכן()` in wherever the caret happened to be, mid-word included.
 * Now both are this: `headings.addContents` puts it at the top and refuses a
 * second one, and the refusal is a sentence rather than a button that does
 * nothing.
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
        own.map((s) => el("option", { value: `custom:${s.name}` }, [s.name])),
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
    tbGroup(t("cat.heading"), [paragraphStyleControl()]),
    tbGroup(t("cat.list"), [b("רשימה", "•"), b("ממוספרת", "1."), b("טבלה", "▦")]),
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
      b("הערת_צד", "▣"),
    ]),
    tbGroup(t("cat.align"), [b("ימין", "⇥"), b("מרכז", "≡"), b("שמאל", "⇤")]),
    tbGroup(t("cat.torah"), [b("ציטוט", "❝"), b("סימן", "§"), b("סעיף", "א."), b("מראה_מקום", "‡")]),
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
                void openDoc(entry.id);
              },
            },
            [
              el("b", {}, [(here ? "● " : "") + meta.title]),
              el("span", { class: "menu-desc" }, [meta.fileName ?? ""]),
            ],
          ),
          el("button", {
            class: "menu-close",
            title: t("closeDoc"),
            onClick: (e: Event) => {
              e.stopPropagation();
              void closeOpenDoc(entry.id);
            },
          }, ["⌄"]),
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
              void openDoc(entry.id);
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
        el("button", {
          class: "menu-del",
          title: t("delete"),
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
            onClick: (e: Event) => {
              e.stopPropagation();
              const n = parseInt(prompt(t("macroRepeatPrompt"), "10") ?? "", 10);
              if (Number.isFinite(n) && n > 0) {
                closeMenus();
                playMacro(m, Math.min(n, 500));
              }
            },
          }, ["×n"]),
          el("button", {
            class: "menu-del",
            title: t("delete"),
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
    ...structureMenuItems(["heading", "list"]),
    el("div", { class: "menu-cat" }, [t("foldLevels")]),
    // Fold *to* a depth. The chips beside the toolbar take everything down or
    // put everything back, which is the only folding this product could do from
    // a door — and not the one somebody with a 300-page sefer wants.
    ...[1, 2, 3].map((level) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), foldToLevel(runtime.view, level)) }, [
        el("b", {}, [`⊟ ${tf("foldLevel", String(level))}`]),
        keyCode(`foldLevel${level}`),
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
    el("button", { class: "menu-item", onClick: () => (closeMenus(), hiddenBreak()) }, [
      el("b", {}, ["⏎ " + t("hiddenBreak")]),
      el("span", { class: "menu-desc" }, [t("hiddenBreakLede")]),
    ]),
    // Beside it, because the two are the same shape of thing — a break in the
    // source whose effect on the page is not the one a blank line has.
    el(
      "button",
      { class: "menu-item", onClick: () => (closeMenus(), insertSnippet("#מעבר_פסקה")) },
      [
        el("b", {}, ["¶ " + t("paraBreak")]),
        el("span", { class: "menu-desc" }, [t("paraBreakLede")]),
      ],
    ),
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
const CHIP_RUN: Record<header.ChipId, () => void> = {
  undo: () => void undo(runtime.view),
  redo: () => void redo(runtime.view),
  styles: openStyles,
  find: () => void openSearchPanel(runtime.view),
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
            el("button", { class: "menu-item menu-item-main", onClick: () => loadBody(ut.body) }, [
              el("b", {}, [entry.label]),
            ]),
            el("button", {
              class: "menu-del",
              title: t("delete"),
              onClick: (e: Event) => {
                e.stopPropagation();
                deleteUserTemplate(ut.id);
              },
            }, ["×"]),
          ]);
        }
        const tpl = templatesByMenu.get(entry.id)!;
        return el("button", { class: "menu-item", onClick: () => loadTemplate(tpl) }, [
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
  return el("button", { type: "button", class: "mini", title: t("addFont"), onClick: addFont }, ["+"]);
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
          el("button", {
            type: "button",
            class: "mini",
            title: t("delete"),
            onClick: () => {
              spell.removeUserWord(w);
              runSpellCheck();
              rerenderChrome();
            },
          }, ["×"]),
        ]),
      )
    : [el("div", { class: "set-note" }, [t("emptyDictionary")])];

  const assets = runtime.currentDoc?.assets ?? [];
  const assetRows = assets.length
    ? assets.map((a) =>
        el("div", { class: "set-row asset-row" }, [
          el("span", { class: "asset-name" }, [(a.kind === "font" ? "🅵 " : "🖼 ") + a.name]),
          el("button", {
            type: "button",
            class: "mini",
            title: t("removeAsset"),
            onClick: () => void removeAsset(a.name),
          }, ["×"]),
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
    checkRow("autocompleteLabel", "autocomplete"),
    checkRow("autoPairBracketsLabel", "autoPairBrackets"),
    checkRow("autoPairQuotesLabel", "autoPairQuotes"),
    // Off by default, and the note says why rather than leaving a writer to
    // discover it by fighting their own gershayim for an hour.
    el("div", { class: "set-note" }, [t("autoPairQuotesNote")]),
    checkRow("keepMenuPositionLabel", "keepMenuPosition"),
    checkRow("spellcheckLabel", "spellcheck"),
    checkRow("spellcheckCommentsLabel", "spellcheckComments"),
    el("div", { id: "spell-coverage", class: "set-note" }, [spellCoverageNote()]),
    checkRow("syncScrollLabel", "syncScroll"),
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
  const handler = (e: KeyboardEvent) => {
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
      if (!confirm(tf("shortcutConflict", key))) return done(original);
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
  files.download("ksav-dictionary.txt", spell.exportUserWords());
}

async function importDictionary() {
  const f = await pickFile(".txt,text/plain");
  if (!f) return;
  const added = spell.importUserWords(await f.text());
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

function renderNotesPane() {
  if (!runtime.view) return;
  // A row jumps to wherever the prose actually is. For a deferred note that is
  // the `#גוף_הערה` at the end of the file, which is the whole point of the row:
  // the marker is easy to find and the prose is not.
  const doc = docTextOf(runtime.view.state.doc);
  const rows = panelrows.noteList(notesIn(doc), doc);
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
  // Derived from the chooser, not hand-listed. This was six Hebrew literals out
  // of eighteen note commands — so twelve layouts were unreachable from the
  // menu, and the English spellings were unreachable from anywhere.
  const targets = NOTE_CHOICES.flatMap(markersOf)
    .map((s) => /^#([A-Za-z0-9֐-׿_]+)/u.exec(s ?? "")?.[1])
    .filter((c): c is string => !!c && c !== note.command)
    .filter((c, i, all) => all.indexOf(c) === i);
  const menu = el("div", { class: "spell-menu note-menu" }, [
    el("div", { class: "menu-cat" }, ["#" + note.command]),
    el(
      "button",
      {
        class: "menu-item",
        onClick: () => {
          closeSpellMenu();
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
    ...targets.map((command) =>
      el(
        "button",
        {
          class: "menu-item menu-cmd",
          onClick: () => {
            closeSpellMenu();
            const e2 = convertNote(docTextOf(runtime.view.state.doc), note, command);
            // …and then the scaffolding the new layout needs, which is what
            // `applyNoteChoice` — docstringed *"The only place that does"* —
            // has always done for an inserted note. `convertNote` writes
            // `#${command}[${body}]` and nothing else, so converting a footnote
            // to an endnote produced an endnote with no `#הערות_בסוף()`: the
            // "collected and never printed" failure, performed by the product
            // and then reported back to the writer as a lint.
            const choice = choiceForCommand(command);
            const done = choice ? scaffold(e2.text, e2.caret, choice, dirLang()) : e2;
            replaceAll(done.text, done.caret ?? e2.caret);
            setStatus(tf("noteConverted", command), "ok");
          },
        },
        [el("code", {}, ["#" + command])],
      ),
    ),
    el("div", { class: "menu-sep" }),
    el(
      "button",
      {
        class: "menu-item",
        onClick: () => {
          closeSpellMenu();
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
  document.body.append(menu);
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
};

/**
 * Draw a [`PanelList`] — the one place the four list panels turn rows into DOM.
 *
 * What a row *is* is `panelrows.ts`'s question and is answered without a
 * browser. What is left here is the effect: the empty state, the indent, the
 * click, and the sentence about what a cap left out.
 */
function drawList(host: HTMLElement, list: PanelList, look: Look, snaps: docs.Snapshot[] = []) {
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
      jumpTo(does.at);
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
  if (!confirm(t("confirmRestore"))) return;
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
  if (!confirm(tf("git.confirmRestore", stamp))) return;
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
  if (!confirm(tf("git.confirmRevert", c.subject || c.short))) return;
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
function loadTemplate(tpl: TemplateDef) {
  const wanted = tpl.lang === "en" ? "ltr" : tpl.lang === "he" ? "rtl" : null;
  if (wanted && docConfig().dir !== wanted) {
    // Through `setSetting`, not by assignment: the direction also reconfigures
    // the editor's own text direction, and setting the field alone would leave
    // the preview and the source pane disagreeing about which way the page runs.
    setSetting("dir", wanted);
    rerenderChrome();
  }
  loadBody(tpl.body);
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
function saveAsTemplate() {
  closeMenus();
  const name = prompt(t("templateName"));
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
  await openDoc(doc.id);
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
    if (confirm(tf("fileChangedSinceOpen", opened.binding.name))) {
      // Take the file. The library entry keeps its identity, its history and its
      // binding — this is the same document, with what is actually on disk in it.
      await docs.putDoc({
        ...stored,
        body: onDisk.body,
        assets: onDisk.assets,
        customCommands: onDisk.customCommands,
        ...(onDisk.config ? { config: onDisk.config } : {}),
      });
      await openDoc(id);
      setStatus(t("loadedFromDisk"), "ok");
      return;
    }
    // Keep Ksav's copy — but the two are known to differ, and the next save has
    // to say so rather than silently winning.
    await openDoc(id);
    watch.markConflicted(id);
    setStatus(t("keptEditorCopy"), "warn");
    return;
  }
  await openDoc(id);
}

async function fileText(): Promise<string> {
  await flushSaves();
  // Pass the app-wide custom commands as the fallback so a local document that
  // uses one is written to disk self-contained, compiling for whoever opens it.
  return docs.serializeDoc(runtime.currentDoc, settings.customCommands);
}

/** Save to the bound file; if there is none, fall through to Save As. */
async function saveFile() {
  closeMenus();
  await takeSnapshot(true);
  const text = await fileText();
  if (runtime.currentBinding && files.canWriteBack(runtime.currentBinding)) {
    if (!(await files.ensureWritable(runtime.currentBinding))) {
      setStatus(t("permissionDenied"), "err");
      return;
    }
    // Somebody else changed the file since Ksav last agreed with it. A manual
    // Save *may* resolve that — the writer is here and can decide — but it has
    // to be their decision and not a silent overwrite.
    if ((await watch.checkFile(runtime.currentDoc.id, runtime.currentBinding)) === "changed") {
      if (!confirm(tf("fileChangedOnDisk", runtime.currentBinding.name))) {
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
    // session, or a handle whose permission lapsed. Ask where to put it.
  }
  await saveFileAs();
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
  if (!confirm(t("confirmReloadFromDisk"))) return;
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
  const panel = el("div", { id: "crash-panel", role: "alertdialog" }, [
    el("h3", {}, [t("crashTitle")]),
    el("p", {}, [t("crashLede")]),
    el("div", { class: "crash-acts" }, [
      el("button", {
        class: "primary", type: "button",
        onClick: () => files.download((runtime.currentDoc?.title || "ksav") + ".ksav", body),
      }, [t("crashDownload")]),
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
          await openDoc(doc.id);
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
  await openDoc(created.id);
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
  await openDoc(doc.id);
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
    window.prompt(t("shareCopyManually"), link.url);
  }
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

function newDoc() {
  void newNamedDoc();
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
    const sel = runtime.view.state.selection.main;
    if (lists.canMakeList(doc, sel.from, sel.to)) {
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
function structureKeymap() {
  const kb = keybindings();
  const out: KeyBinding[] = [];
  for (const a of structure.STRUCTURE_ACTIONS) {
    const key = kb[a.id];
    // No `preventDefault`: returning false has to let the key through, which is
    // exactly how Enter stays Enter in ordinary prose.
    if (key) out.push({ key, run: () => runStructureAction(a) });
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

function finishRecording() {
  const steps = macros.compact(recording ?? []);
  recording = null;
  const macro: macros.Macro = { id: macros.newId(), name: "", steps };
  if (macros.isEmpty(macro)) {
    setStatus(t("macroEmpty"), "");
    rerenderChrome();
    return;
  }
  const suggested = macros.describe(macro, macroName).slice(0, 40);
  const name = prompt(t("macroNamePrompt"), suggested);
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

/** Every name a new style may not take: the registry's, and the ones already made. */
function takenStyleNames(): string[] {
  const doc = docTextNow();
  return [
    ...runtime.commandsReg.flatMap((c) => [c.he, c.en]),
    ...styles.findCustomStyles(doc).map((s) => s.name),
  ];
}

/** The knob rows a style is made of, over whatever reads and writes them. */
function styleKnobRows(
  read: (key: string) => string | undefined,
  write: (key: string, value: string | null) => void,
): Node[] {
  return Object.entries(styles.STYLE_FIELDS).map(([key, field]) =>
    styleRow(t(field.label), fieldControl(field, read(key), (v) => write(key, v))),
  );
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
function styleArg(kind: styles.StyleCommand, key: string): string | undefined {
  const call = styles.findStyleCall(docTextOf(runtime.view.state.doc), kind);
  return call?.args.get(key);
}

/** Write styling arguments into the document, replacing the existing call.
 *
 *  A styling command the document does not have yet is written in the language
 *  the document is being set in, so clicking a control in an English document
 *  does not drop a Hebrew command into it. An existing call keeps whatever
 *  language it was already written in. */
function setStyleArgs(kind: styles.StyleCommand, changes: Record<string, string | null>) {
  const doc = docTextOf(runtime.view.state.doc);
  const next = styles.setStyleArgs(doc, kind, changes, docLang());
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
    setStyleArgs(kind, changes);
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
  const forced = styles.isOverruled(docTextOf(runtime.view.state.doc), kind);
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
        setStyleArgs(kind, { [styles.OVERRULE]: v ? "true" : null }),
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

/** A colour, with the means to unset it — a colour picker alone has no "none". */
function clearableColour(
  raw: string | undefined,
  set: (v: string | null) => void,
): HTMLElement {
  const kids: Node[] = [colorControl(styles.readColor(raw) ?? "#000000", (v) => set(styles.typstColor(v)))];
  if (raw !== undefined) {
    kids.push(
      el("button", { class: "knob-clear", title: t("none"), onClick: () => set(null) }, ["×"]),
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
    case "size-em":
      return pick(
        [["0.8em", "80%"], ["0.9em", "90%"], ["1em", "100%"], ["1.15em", "115%"], ["1.35em", "135%"], ["1.6em", "160%"], ["2em", "200%"]],
        (raw ?? "").trim(),
      );
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
function instanceRows(kind: styles.StyleCommand, inst: styles.InstanceCall): Node[] {
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
      ? Array<string>(6).fill(now)
      : (HEADING_RAMP[key] ?? Array<string>(6).fill(HEADING_FLAT[key] ?? "none"));
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
        ...([1, 2, 3, 4, 5, 6].map((n) => [String(n), tf("oneLevel", String(n))]) as [
          string,
          string,
        ][]),
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
  return rows;
}

// ------------------------------------------------------------ Styles › marks
//
// The mark register, which is the collection layer for `#ציון`, `#גמרא`,
// `#דיבור_המתחיל`, `#פסוק`, `#ציון_מקור` and `#ערך`. Its globals are keyed by
// *class* rather than by tier or by stream — `גודל: ("ציון": 0.8em)` — so this
// section has a class chooser where the Headings section has a level one, and
// "every kind" writes the plain value that the engine reads as the answer for all
// of them.

/** Which mark class the *default* layer is being edited for; "" = all of them. */
let markClass = "";

/** The value the Marks section is showing for one knob, at the chosen class. */
function markArg(key: string): string | undefined {
  const raw = styleArg("marks", key);
  if (markClass === "") {
    // A dictionary is not one answer for every class, so "every kind" shows
    // nothing set rather than picking one of six and calling it the document's.
    return styles.readDict(raw) ? undefined : raw;
  }
  return styles.classValue(raw, markClass);
}

/** Write one knob, for the chosen class or for all of them. */
function setMarkArg(key: string, value: string | null) {
  if (markClass === "") {
    setStyleArgs("marks", { [key]: value });
    return;
  }
  setStyleArgs("marks", {
    [key]: styles.withClassKey(styleArg("marks", key), markClass, value, styles.MARK_CLASSES),
  });
}

function markClassRow(): Node {
  return styleRow(
    t("markClass"),
    selectControl(
      [
        ["", t("everyClass")],
        ...(styles.MARK_CLASSES.map((c) => [c, t("markClass." + c)]) as [string, string][]),
      ],
      markClass,
      (v) => {
        markClass = v;
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
function markStyleRows(): Node[] {
  const rows: Node[] = [markClassRow()];
  for (const [key, field] of Object.entries(styles.INSTANCE_FIELDS.marks)) {
    // `פטור` and `ברשימה` belong to one mark and to nothing else: a class that
    // exempts itself from its own styling is a class with no styling, and one
    // that leaves itself out of its own list is a list of nothing.
    if (key === "פטור" || key === "ברשימה") continue;
    rows.push(
      styleRow(t(field.label), fieldControl(field, markArg(key), (v) => setMarkArg(key, v))),
    );
  }
  if (markClass !== "") {
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

// ----------------------------------------------------------------- channels
//
// The one section of this panel that edits the *document's own* declarations
// rather than a `#הגדרות_*` call, because that is what a channel is: a note
// stream with a source and a placement, declared once and read wherever a note
// is written.
//
// It is here rather than in the Notes chooser on purpose. The chooser asks
// "where should this note go?" once, at the moment a note is written, and then
// the answer is welded into the command that got typed — which is the whole
// complaint the channel model answers. This asks the same question about a
// channel that already exists, with the notes already written, and moving the
// apparatus from the foot of the page to the back of the sefer is one select.

/** Which channel the section is editing; "" until the writer picks one. */
let channelName = "";

/** The document's channels, or an empty list when there is no editor yet. */
function documentChannels(): channels.Channel[] {
  if (!runtime.view) return [];
  return channels.channelsIn(docTextOf(runtime.view.state.doc));
}

/** The channel being edited, if it is still in the document. */
function currentChannel(): channels.Channel | null {
  return documentChannels().find((c) => c.name === channelName) ?? null;
}

/** Rewrite one channel's declaration and put the caret on it. */
function setChannel(fields: channels.ChannelFields) {
  if (!runtime.view || !channelName) return;
  const doc = docTextOf(runtime.view.state.doc);
  const { text, at } = channels.writeChannel(doc, channelName, fields, docLang());
  replaceAll(text, at);
  renderStylesPanel();
}

/**
 * A channel's name for a chooser: what it *is*, not only what it is called.
 *
 * The seven built-in tiers are the native apparatus and a writer does not think
 * of them as "הערה_ג" — they are the third layer of notes — so they say so, and
 * a channel the writer named says its own name.
 */
function channelLabel(c: channels.Channel): string {
  const tier = channels.TIER_CHANNELS.indexOf(c.name);
  if (tier === 0) return t("channelDefault");
  if (tier > 0) return tf("channelTier", tier + 1);
  return c.name;
}

function channelRows(): Node[] {
  const list = documentChannels();
  const rows: Node[] = [
    styleRow(
      t("channelPick"),
      selectControl(
        [["", t("channelPickNone")], ...list.map((c) => [c.name, channelLabel(c)] as [string, string])],
        channelName,
        (v) => {
          channelName = v;
          renderStylesPanel();
        },
      ),
    ),
  ];
  const c = currentChannel();
  if (!c) {
    rows.push(el("p", { class: "styles-note" }, [t("channelPickLede")]));
    rows.push(channelAddRow());
    return rows;
  }

  // What this channel is a note *on*. A channel cannot be its own source, and
  // offering it would let a writer write the cycle the engine has to defend
  // against — better not to offer it than to bound it twice.
  rows.push(
    styleRow(
      t("channelSource"),
      selectControl(
        [
          ["", t("channelSourceBody")],
          ...list
            .filter((o) => o.name !== c.name)
            .map((o) => [o.name, channelLabel(o)] as [string, string]),
        ],
        c.source ?? "",
        (v) => setChannel({ source: v || null }),
      ),
    ),
  );
  rows.push(
    styleRow(
      t("channelPlacement"),
      selectControl(
        channels.PLACEMENTS.map((p) => [p, t("placement." + p)] as [string, string]),
        c.placement,
        (v) => setChannel({ placement: v as channels.Placement }),
      ),
    ),
  );
  // A height is what turns a page-foot channel into a fixed region of its own,
  // and it is meaningless anywhere else — a collected region takes the height it
  // needs. Offered only where it does something.
  if (c.placement === "רגל") {
    rows.push(
      styleRow(
        t("channelHeight"),
        textControl(c.height ?? "", (v) => setChannel({ height: v.trim() || null }), "3cm"),
      ),
    );
  }
  rows.push(
    styleRow(
      t("channelRegion"),
      textControl(
        c.region === c.name ? "" : c.region,
        (v) => setChannel({ region: v.trim() || null }),
        c.name,
      ),
    ),
  );

  // What this channel *is*, said plainly, because the three settings above
  // combine into an arrangement and a writer should not have to hold the rules
  // in their head to know which one they have just described.
  rows.push(el("p", { class: "styles-note" }, [t("channelKind." + c.kind)]));

  rows.push(
    styleRow(
      "",
      el("span", { class: "chan-actions" }, [
        el(
          "button",
          { class: "note-use", onClick: () => insertSnippet(channels.noteLine(c.name, docLang())) },
          ["+ " + t("channelInsertNote")],
        ),
        // A collected channel prints nowhere until its region is shown. This is
        // the "collected and then never rendered" failure that every one of the
        // eighteen commands could produce, offered as a button instead of as a
        // lint after the fact.
        //
        // Filed at the **end of the document**, through the same rule the lint's
        // own repair uses. Splicing it at the caret is what this button did
        // first, and a call renders what was written before it — so on a
        // document whose caret is on line one it rendered nothing and left the
        // warning standing, which is the button producing the defect it exists
        // to cure.
        ...(c.kind === "collected"
          ? [
              el(
                "button",
                {
                  class: "note-use",
                  onClick: () => {
                    if (!runtime.view) return;
                    const filed = apparatus.fileAtEnd(
                      docTextOf(runtime.view.state.doc),
                      channels.showRegionLine(c.region, docLang()),
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

function channelAddRow(): Node {
  return styleRow(
    "",
    el(
      "button",
      {
        class: "note-use",
        onClick: () => {
          const name = prompt(t("channelNewPrompt"))?.trim();
          if (!name || !runtime.view) return;
          const doc = docTextOf(runtime.view.state.doc);
          const { text, at } = channels.writeChannel(doc, name, { placement: "רגל" }, docLang());
          replaceAll(text, at);
          channelName = name;
          renderStylesPanel();
        },
      },
      ["+ " + t("channelNew")],
    ),
  );
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

    // Eight sections, from the table in `panelviews.ts` rather than written out
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
        section.kind === "headings"
          ? headings
          : section.kind === "lists"
            ? lists
            : section.kind === "tables"
              ? tables
              : section.kind === "channels"
                ? channelRows()
                : inst
                  ? instanceRows(section.kind as styles.StyleCommand, inst)
                  : DEFAULT_STYLE_ROWS[section.kind]();
      return panelviews.styleSection(section, scope, rows);
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
  insertSnippet(by ? `#${cmd}(מאת: ${typstString(by)})[|]` : `#${cmd}[|]`);
  scheduleCompile();
  if (isReviewOpen()) renderReviewPanel();
}

/**
 * Comment on the selection.
 *
 * The comment goes *after* the selected text rather than around it: a comment is
 * about the text, not a change to it, so wrapping would put the reader's words
 * inside the reviewer's mark.
 */
function addComment() {
  const text = prompt(t("commentPrompt"));
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

function decideEverything(decision: review.Decision) {
  if (!confirm(t(decision === "accept" ? "confirmAcceptAll" : "confirmRejectAll"))) return;
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
    insertSnippet(`#מקטע_עמוד(${args.join(", ")})[\n|\n]`);
    scheduleCompile();
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
// The eleven note layouts used to be ~25 raw command names in one palette group.
// This asks the writer the question they can actually answer — where should the
// note go? — and emits the right commands plus whatever scaffolding the layout
// needs (the dump call at the end, the wrapper around the section). Forgetting
// that scaffolding is the most common way these layouts appear "broken": the
// notes are collected and then never rendered.

function openNotesChooser() {
  closeMenus();
  openPanel("notes-chooser");
}

function closeNotesChooser() {
  closePanel("notes-chooser");
}

/**
 * Where the note's prose goes in the *file* — which is a separate question from
 * where it prints, and the one the chooser could not previously ask.
 *
 * Persisted, not session-scoped: someone who writes their notes at the end of
 * the file writes *every* note that way, and having to re-answer after each
 * reload is how the answer stops being believed.
 */
function deferBodies(): boolean {
  return settings.deferNoteBodies === true;
}

/**
 * Write a note layout into the document. The only place that does.
 *
 * Reached from the chooser, from `insertSnippet` (and therefore from the
 * toolbar, the palette, the Insert menu and every key binding), and from the
 * right-click menu on an existing note. One producer means the scaffolding and
 * the org-mode preference cannot be honoured in one surface and forgotten in
 * three — which is exactly what happened, and what `app/test/notepaths.test.mjs`
 * now holds.
 */
function applyNoteChoice(
  choice: NoteChoice,
  layer: number,
  sel: { to?: number; text?: string; marker?: string } = {},
) {
  const from = runtime.view.state.selection.main.from;
  const { text, caret } = applyChoice(
    docTextOf(runtime.view.state.doc),
    from,
    choice,
    layer,
    deferBodies(),
    sel,
    dirLang(),
  );
  editDoc(text, caret);
  scheduleCompile();
}

function chooseNote(choice: NoteChoice, layer: number) {
  applyNoteChoice(choice, layer);
  closeNotesChooser();
}

/**
 * A real page, set from the writer's own text, in place of an ASCII sketch.
 *
 * Four rows of `▤` and `¹` cannot say whether the band lands at the foot of the
 * page or where the prose happens to stop — which is precisely the distinction
 * the writer is being asked to make. So the selected card compiles: the opening
 * of the document in hand, with the layout applied and two notes in it, and the
 * first page shown at thumbnail size. Only the selected one, because twelve
 * compiles to open a modal is not a preview, it is a stall.
 */
async function fillNotePreview(host: HTMLElement, c: NoteChoice) {
  const backend = runtime.backend;
  if (!backend) return;
  // Enough prose to fill a page, so "at the foot" and "where the text stops" are
  // visibly different. The writer's own opening if they have one, filler if not.
  // The writer's own words, with the markup taken out. Slicing raw source at
  // 700 characters lands in the middle of a bracket about as often as not, and
  // a preview that silently never appears because the excerpt would not compile
  // is worse than an honest sketch. So: strip the commands, keep the prose.
  const own = plainText(docTextOf(runtime.view.state.doc)).slice(0, 700);
  const filler = Array.from({ length: 18 }, (_, i) => t("notePreviewLine") + " " + (i + 1)).join(
    "\n\n",
  );
  const base = own.length > 120 ? own : filler;
  let src = base;
  // One note per layer the layout actually has, back to front so that an earlier
  // insertion cannot move a later one's offset. Two of these were hard-coded,
  // which is why a card with three streams previewed as a card with two — the
  // preview would have shown the third region empty and the writer would have
  // read that as the third stream not working.
  const layers = markersOf(c).length;
  const bodies = [t("notePreviewNoteA"), t("notePreviewNoteB")];
  for (let layer = layers - 1; layer >= 0; layer--) {
    const at = Math.floor((base.length * (layer + 1)) / (layers + 1));
    const r = applyChoice(src, at, c, layer, false);
    const body = bodies[layer] ?? tf("notePreviewNoteN", String(layer + 1));
    src = r.text.slice(0, r.caret) + body + r.text.slice(r.caret);
  }
  const res = await backend.compile(src, { ...docConfig(), paper: "a5" }).catch(() => null);
  const svg = res?.pages_svg?.[0];
  if (!svg) return;
  host.innerHTML = svg;
  host.classList.add("ready");
}

/**
 * What to call a marker on its own button.
 *
 * A stream marker names its stream — `#הערה_זרם("מקורות")[|]` — and that name is
 * the only thing about it a writer cares to read. Anything else falls back to
 * the command, which is still shorter and truer than "the second layer".
 */
function noteMarkerLabel(marker: string): string {
  const named = /"([^"]+)"/.exec(marker)?.[1];
  return named ?? /^#([A-Za-z0-9֐-׿_]+)/u.exec(marker)?.[1] ?? marker;
}

function noteCard(c: NoteChoice, live = false): HTMLElement {
  const he = getLang() === "he";
  const note = he ? c.noteHe : c.noteEn;
  // The sketch until the page arrives, and the page after it — so the card is
  // never empty and never waiting.
  const preview = el("div", { class: "note-preview" }, [c.sketch.join("\n")]);
  if (live) void fillNotePreview(preview, c);
  return el("div", { class: "note-card" + (live ? " picked" : "") }, [
    preview,
    el("div", { class: "note-body" }, [
      el("b", {}, [he ? c.he : c.en]),
      // Word's name for the same arrangement, beside the sefer's. Someone who
      // has only ever used Word searches for "footnote"; someone setting a sefer
      // searches for שער־הציון. Neither should have to learn the other's
      // vocabulary to find the card they are already looking at.
      ...(c.word ? [el("span", { class: "note-alias" }, [t("word." + c.word)])] : []),
      el("p", {}, [he ? c.descHe : c.descEn]),
      ...(note ? [el("p", { class: "note-caveat" }, [note])] : []),
      // One button per marker the layout has, not one plus an optional second.
      // A layout with three streams offered two of them, and the third was
      // reachable only by typing `#הערה_זרם("נוסחאות")` — which is precisely the
      // knowledge this chooser exists so nobody needs.
      el("div", { class: "note-actions" }, [
        el("button", { class: "note-use", onClick: () => chooseNote(c, 0) }, [t("useThis")]),
        ...markersOf(c)
          .slice(1)
          .map((marker, i) =>
            el(
              "button",
              { class: "note-use secondary", onClick: () => chooseNote(c, i + 1) },
              // Two layers is "the note on it"; more than two are peers and want
              // their own names, which the marker itself carries — a stream is
              // called `#הערה_זרם("מקורות")` and that string is the label.
              [markersOf(c).length > 2 ? noteMarkerLabel(marker) : t("useSecond")],
            ),
          ),
      ]),
    ]),
  ]);
}

/**
 * The second question the chooser asks: where does the *text* of the note get
 * written?
 *
 * Deliberately not a twelfth card. It is orthogonal to all eleven — the page
 * comes out identical either way — and folding it into the grid would suggest
 * a writer has to give up a layout to get a readable source.
 */
function bodyPlacementRow(): HTMLElement {
  const option = (on: boolean, label: string, desc: string) =>
    el(
      "button",
      {
        class: `defer-option${deferBodies() === on ? " on" : ""}`,
        onClick: () => {
          settings.deferNoteBodies = on;
          saveSettings();
          renderNotesChooser();
        },
      },
      [el("b", {}, [label]), el("span", {}, [desc])],
    );
  return el("div", { class: "defer-row" }, [
    el("h3", {}, [t("deferBodiesTitle")]),
    el("div", { class: "defer-options" }, [
      option(false, t("deferInlineLabel"), t("deferInlineDesc")),
      option(true, t("deferEndLabel"), t("deferEndDesc")),
    ]),
    el(
      "button",
      {
        class: "defer-all",
        onClick: () => {
          closeNotesChooser();
          deferAll(runtime.view);
          scheduleCompile();
        },
      },
      [t("deferAllAction")],
    ),
    // The other direction, and the one that was missing. "Where the note bodies
    // live" is only *changeable after the notes exist* if it is changeable both
    // ways: a document could be swept to the org-mode arrangement with one press
    // and could not be swept back, which is a switch that goes one way.
    el(
      "button",
      {
        class: "defer-all",
        onClick: () => {
          closeNotesChooser();
          inlineAll(runtime.view);
          scheduleCompile();
        },
      },
      [t("deferRecallAllAction")],
    ),
    // The other half of writing bodies at the end: keeping that list readable.
    // Filed one at a time, it comes out in the order the notes were *written*,
    // and a note added to page 1 of a finished chapter lands under the note from
    // page 40. New bodies are now filed in reading order by construction; this is
    // for the document that was written before they were.
    el(
      "button",
      {
        class: "defer-all",
        onClick: () => {
          closeNotesChooser();
          sortDeferredBodies(runtime.view);
        },
      },
      [t("deferSortAction")],
    ),
  ]);
}

/**
 * The two everyday kinds, as one click each.
 *
 * Twelve cards of equal visual weight said "choose your document's note system",
 * and a writer who wanted an ordinary footnote read that as a decision they were
 * not qualified to make. They are the same two cards as in the grid below — this
 * row only says which two a person reaches for ninety-five times out of a
 * hundred, and that reaching for one does not spend the other.
 */
function quickNotesRow(): HTMLElement {
  const quick = (id: string, label: string, desc: string, glyph: string) => {
    const choice = NOTE_CHOICES.find((c) => c.id === id)!;
    return el("button", { class: "note-quick", onClick: () => chooseNote(choice, 0) }, [
      el("span", { class: "note-quick-glyph" }, [glyph]),
      el("span", {}, [el("b", {}, [label]), el("span", {}, [desc])]),
    ]);
  };
  return el("div", { class: "note-quick-row" }, [
    quick("footnote", t("notesQuickFootnote"), t("notesQuickFootnoteDesc"), "†"),
    quick("endnote", t("notesQuickEndnote"), t("notesQuickEndnoteDesc"), "⁋"),
  ]);
}

/**
 * Which cell of the where × how grid is open. Null until something is picked.
 */
let notesCell: { where: NoteWhere; how: NoteHow } | null = null;

/**
 * The chooser's two questions, as a matrix.
 *
 * Twelve cards, each encoding a *where* and a *how* at once, and the writer had
 * to work out which was which from a four-line sketch. Nothing said that
 * `#הערות_מדורגות` prints where the prose ends and `#מדף_א`/`#מדף_ב` prints at
 * the foot of every page — a difference that is invisible in a short document,
 * where the "separate blocks" apparatus rendered near the top of the page and
 * looked plainly broken.
 *
 * Rows are where it prints; columns are how the layers are arranged. Cells with
 * no arrangement are greyed **with a reason**, never hidden: a writer who cannot
 * see that "fixed regions at the end of the document" was considered has no way
 * to tell a wrong question from a missing feature.
 */
function notesMatrix(): HTMLElement {
  const head = el("div", { class: "nm-row nm-head" }, [
    el("div", { class: "nm-corner" }, [t("notesAxisHow")]),
    ...NOTE_HOW.map((how) => el("div", { class: "nm-col-head" }, [t("how." + how)])),
  ]);
  const rows = NOTE_WHERE.map((where) =>
    el("div", { class: "nm-row" }, [
      el("div", { class: "nm-row-head" }, [t("where." + where)]),
      ...NOTE_HOW.map((how) => {
        const choice = choiceAt(where, how);
        if (!choice) {
          return el(
            "div",
            { class: "nm-cell empty", title: t(whyNot(where, how)) },
            ["—"],
          );
        }
        const on = notesCell?.where === where && notesCell?.how === how;
        return el(
          "button",
          {
            class: "nm-cell" + (on ? " on" : ""),
            title: getLang() === "he" ? choice.descHe : choice.descEn,
            onClick: () => {
              notesCell = { where, how };
              renderNotesChooser();
            },
          },
          [getLang() === "he" ? choice.he : choice.en],
        );
      }),
    ]),
  );
  return el("div", { class: "notes-matrix" }, [head, ...rows]);
}

function renderNotesChooser() {
  const box = document.getElementById("notes-chooser-body")!;
  const picked = notesCell ? choiceAt(notesCell.where, notesCell.how) : null;
  box.replaceChildren(
    panelHead("notes-chooser", "notesChooserTitle"),
    el("p", { class: "notes-lede" }, [t("notesChooserLede")]),
    el("p", { class: "notes-mix" }, [t("notesMix")]),
    el("h3", {}, [t("notesCommon")]),
    quickNotesRow(),
    // Above the grid, not below it: where the prose lives in the *file* applies
    // to all twelve arrangements equally, and it is the one question here whose
    // answer a writer already knows. Below the fold it was never found.
    bodyPlacementRow(),
    el("h3", {}, [t("notesAxisWhere")]),
    notesMatrix(),
    ...(picked ? [noteCard(picked, true)] : [el("p", { class: "notes-mix" }, [t("notesPickCell")])]),
    el("h3", {}, [t("notesMore")]),
    el("div", { class: "note-grid" }, NOTE_CHOICES.filter((c) => c.layers === "one").map((c) => noteCard(c))),
    el("h3", {}, [t("notesTwoLayers")]),
    el("div", { class: "note-grid" }, NOTE_CHOICES.filter((c) => c.layers === "two").map((c) => noteCard(c))),
  );
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
  return name;
}

async function insertImage() {
  closeMenus();
  const f = await pickFile("image/*");
  if (!f) return;
  const name = await attachAsset(f, "image");
  if (!name) return;
  insertSnippet(`#תמונה("${name}", רוחב: 60%)`);
  scheduleCompile();
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
    rerenderChrome();
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
  } else if (key === "focusMode" || key === "typewriter") {
    runtime.view.dispatch({
      effects: focusCompartment.reconfigure(
        focusExtension(!!settings.focusMode, !!settings.typewriter),
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
    scheduleSpellCheck();
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
      el("div", { id: "outline-list", class: "outline-list" }),
    ]),
    // The notes pane, beside the outline: the two halves of a sefer's structure.
    el("aside", { id: "notes-drawer", class: "drawer drawer-start", "aria-label": t("notesPane"), "data-i18n-label": "notesPane" }, [
      panelHead("notes-drawer", "notesPane", { level: "h3" }),
      el("div", { id: "notes-list", class: "notes-list" }),
    ]),
    // The marks pane, beside the other two: what the document *says things are*,
    // where the outline is what it is built from and the notes pane is what hangs
    // off it.
    el("aside", { id: "marks-drawer", class: "drawer drawer-start", "aria-label": t("marksPane"), "data-i18n-label": "marksPane" }, [
      panelHead("marks-drawer", "marksPane", { level: "h3" }),
      el("div", { id: "marks-list", class: "marks-list" }),
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
    el("button", {
      id: "float-preview-btn",
      class: "float-preview-btn",
      title: t("preview"),
      "data-i18n-title": "preview",
      onClick: openPreviewOverlay,
    }, ["📄"]),
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
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
      // Linkify the selection (spec.md §10.5).
      e.preventDefault();
      void linkifySelection();
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") {
      // Cite on selection (spec.md §10.4).
      e.preventDefault();
      void askForMekor();
    } else if (e.key === "Escape") {
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
                  loadTemplate(tpl);
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
  wirePanel("styles-panel", { open: renderStylesPanel });
  wirePanel("review-panel", { open: renderReviewPanel });
  // Opening it is what asks git. Nothing polls: `git status` is a subprocess,
  // and a drawer nobody has opened must not be starting one every second.
  wirePanel("git-panel", { open: () => void refreshGit() });
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
    open: renderNotesChooser,
    close: () => runtime.view.focus(),
  });
  wirePanel("history-modal", { open: () => void renderHistory() });
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
  wirePanel("form-modal", { close: () => (modalOk = null) });
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
        dictionary: () => Promise<{ text: string; write: (t: string) => void; where: string }>;
      }
    ).dictionary();
    const moved = spell.keepDictionaryIn(kept.text, kept.write);
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
  render();
  wireKeys();
  save.wireUnloadGuard();
  const status = document.getElementById("status")!;
  status.textContent = t("rendering");
  runtime.setBackend(await createBackend());
  // The dictionary as a file, where the desktop app can keep one (B29).
  //
  // After the backend and before anything spell-checks, so the first check
  // already has the writer's own words. A browser has no `dictionary()` and
  // keeps using `localStorage`, which is the only thing a sandbox allows.
  await adoptDictionary();
  const badge = document.getElementById("engine-badge");
  if (badge) {
    const labels: Record<string, string> = {
      server: "⬢ server",
      wasm: "⬡ wasm",
      desktop: "🖥 native",
    };
    badge.textContent = labels[runtime.backend!.kind] ?? runtime.backend!.kind;
  }
  await loadRegistries();
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
      await openDoc(entry.id);
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
  await watch.markInSync(runtime.currentDoc.id, runtime.currentBinding);
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
  window.setInterval(() => void autosaveToFile(), FILE_AUTOSAVE_MS);
  // Sources handed over by Girsa while this window is open (spec.md §10.6).
  window.setInterval(() => void takeArrivals(), GIRSA_POLL_MS);
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
async function takeArrivals(): Promise<void> {
  // Silent when this build has no Girsa half: the inbox is polled, and a poll
  // that says "you cannot" once a second is a nuisance, not information.
  const waiting = await sourcesOf(runtime.backend)?.inbox().catch(() => []);
  if (!waiting || waiting.length === 0) return;
  for (const arrival of waiting) {
    if (arrival.whole) {
      // A whole document, handed over from Girsa's buffer. Never replaces
      // what is open without being asked — and a snapshot is taken first, so
      // "yes" is recoverable even when it was the wrong answer.
      const hasText = runtime.view.state.doc.length > 0;
      if (hasText && !window.confirm(tf("documentArrived", arrival.display))) {
        insertSnippet(arrival.markup);
        continue;
      }
      if (hasText) await takeSnapshot();
      runtime.view.dispatch({
        changes: { from: 0, to: runtime.view.state.doc.length, insert: arrival.markup },
        selection: { anchor: 0 },
      });
      continue;
    }
    insertSnippet(arrival.markup);
  }
  const last = waiting[waiting.length - 1];
  setStatus(tf(last.whole ? "documentOpened" : "sourceArrived", last.display), "ok");
  scheduleCompile();
}


boot();

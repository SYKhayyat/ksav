import "./styles.css";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
import { searchKeymap, search, openSearchPanel } from "@codemirror/search";
import { foldGutter, foldKeymap, foldAll, unfoldAll, bracketMatching } from "@codemirror/language";
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
import { apparatusLint, renderAllNotes } from "./apparatus-lint";
import { deferredNotes, jumpDeferred, deferHere, recallHere, deferAll } from "./deferred-lint";
import { createBackend, sourcesOf } from "./api";
/** How often the editor asks Girsa's desk whether anything arrived. A second
 *  is under the threshold at which a hand-off feels like a hand-off, and it is
 *  one lock and an empty vector when there is nothing waiting. */
const GIRSA_POLL_MS = 1000;
import type { Mekor, Mekoros, Refreshed, TemplateDef } from "./api";
import { t, tf, setLang, getLang, isRtlUi } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import type { DocAsset } from "./docs";
import { ACTION_COMMAND } from "./actions";
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
  noteAt,
  scaffold,
  notesIn,
  tieredNoteAt,
  whyNot,
  type NoteHow,
  type NoteWhere,
} from "./notes";
import { aliasesInForce, keybindingsFrom, readable, whoHolds } from "./bindings";
import * as sefarim from "./sefarim";
import * as spell from "./spell";
import * as styles from "./styles";
import * as review from "./review";
import { typstString, typstContent } from "./typst-escape";
import { citationMarkup } from "./citation";
import type { NoteChoice } from "./notes";

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
} from "./panels";
import { BUNDLED_NOTICES } from "./engine.gen";
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
} from "./settings";
import type { Field, Settings, Layout, PreviewSide, PageSetup, ValueOf } from "./settings";
import * as save from "./save";
import { scheduleSave, saveNow, flushSaves, reportSaveFailure } from "./save";
import { scheduleCompile, runCompile, onSchedule, bodyOnScreen } from "./compile";
import * as commands from "./commands";
import { applyPreview, currentPages, drawCurrentInto, pageBox } from "./preview";
import { drawMark, isPlainClick, pageUnder, pointInPage } from "./jump";
import { BIDI_MARKS, bidiSupport, toggleIsolate, visibleBidiMarks } from "./bidi";
import { changeGutter, changeHighlight, changes, setBaseline } from "./changes";
import { focusCompartment, focusExtension } from "./focus";
import * as keymodes from "./keymodes";
import * as crash from "./crash";
import * as share from "./share";
import * as docx from "./docx";
import * as update from "./update";
import * as watch from "./watch";
import { overviewRuler } from "./ruler";
import { errorLineDecorations, errorLines, offsetOf, setErrorLines } from "./errorlines";
import { lineInDocument, onGoToLine, onGoToPart, onMarkLines } from "./diagview";
import { nikudKeymap, buildNikudBar } from "./nikud";
import * as exports from "./exports";
import { troubleSaid } from "./diagnostics";
import { insertionAt, legalAt } from "./mode";
import * as structure from "./structure";
import * as heads from "./headings";
import * as hydra from "./hydra";
import * as macros from "./macros";
import * as help from "./help";
import { plan as planInsertion, regionAround } from "./insert";
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
      "&": { height: "100%", fontSize: "15px" },
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

/** Switch the editor to another document in the library. */
async function openDoc(id: string) {
  const next = await docs.getDoc(id);
  if (!next) return;
  await flushSaves();
  runtime.setSwitching(true);
  runtime.setCurrentDoc(next);
  docs.setCurrentId(next.id);
  runtime.setCurrentBinding(await files.recallBinding(next.id));
  // Stamp the file as we found it, so "has it changed" has something to mean.
  await watch.markInSync(next.id, runtime.currentBinding);
  runtime.view.dispatch({
    changes: { from: 0, to: runtime.view.state.doc.length, insert: next.body },
    selection: { anchor: 0 },
  });
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
  await refreshBaseline();
  updateTitleBar();
  rerenderChrome();
  runtime.view.focus();
  scheduleCompile();
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

async function removeDoc(id: string) {
  const entry = docs.library().find((e) => e.id === id);
  if (!entry) return;
  if (!confirm(tf("confirmDeleteDoc", entry.title))) return;
  await docs.deleteDoc(id);
  await files.rememberBinding(id, null);
  if (runtime.currentDoc.id === id) {
    const next = docs.library()[0];
    if (next) await openDoc(next.id);
    else await newNamedDoc();
  } else {
    rerenderChrome();
  }
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
  ...Object.entries(ACTION_COMMAND).map(([id, he]) => ({
    id,
    run: () => insertCommand(he),
  })),
  {
    id: "tieredNote",
    run: () => {
      const st = runtime.view.state;
      insertSnippet(tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
      return true;
    },
  },
  { id: "region", run: () => (insertRegion(), true) },
  { id: "comment", run: () => (commentOut(), true) },
  { id: "hiddenBreak", run: () => (hiddenBreak(), true) },
  { id: "undo", run: (v) => undo(v) },
  { id: "redo", run: (v) => redo(v) },
  { id: "palette", run: () => (openPalette(), true) },
  { id: "find", run: (v) => openSearchPanel(v) },
  { id: "foldAll", run: (v) => foldAll(v) },
  { id: "unfoldAll", run: (v) => unfoldAll(v) },
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
  { id: "deferJump", run: (v) => (jumpDeferred(v), true) },
  { id: "deferHere", run: (v) => (deferHere(v, docLang()), true) },
  { id: "deferRecall", run: (v) => (recallHere(v), true) },
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
function buildShortcutKeymap(): KeyBinding[] {
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
  const options = commands
    .available(runtime.commandsReg)
    .filter((c) => commands.matches(c, q))
    .map((c) => ({
      label: "#" + c.name,
      detail: c.en ?? whose(c.from),
      info: c.from === "registry" ? (getLang() === "he" ? c.desc_he : c.desc_en) : whose(c.from),
      apply: insertApply(c.insert),
    }));
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
  const text = spell.checkableText(docTextOf(runtime.view.state.doc));
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
function proseOrRaw() {
  return settings.prose ? proseMode : visibleBidiMarks(bidiMarkName);
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

function makeEditor(): EditorView {
  return new EditorView({
    doc: runtime.currentDoc.body,
    parent: document.getElementById("editor-host")!,
    extensions: [
      history(),
      drawSelection(),
      highlightActiveLine(),
      ksavFolding,
      foldGutter(),
      bracketMatching(),
      closeBrackets(),
      // Pair the maths delimiter the way brackets pair — typstify's
      // `editor/typst.go` does the same, and Typst's `$…$` works in a Ksav body
      // because the body *is* Typst. `closeBrackets` takes its list from
      // language data, and Ksav's highlighter is a regex scanner with no grammar
      // behind it, so the data is provided directly rather than by a language.
      //
      // The gershayim is deliberately absent from that list, for the reason
      // `brackets.ts` gives at length: `"` is not a delimiter in a Hebrew
      // document, because רש״י and שו״ע are everywhere and pairing quotes
      // swallows whole tables.
      EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["(", "[", "{", "$"] } }]),
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
      deferredNotes,
      revealAll,
      dirCompartment.of(EditorView.contentAttributes.of({ dir: docConfig().dir })),
      // The document's direction above is the *fallback*; every line that has a
      // letter in it answers for itself, and the syntax is held apart from the
      // prose so a command stops migrating through the sentence it is in.
      bidiSupport(() => (docConfig().dir === "ltr" ? "ltr" : "rtl")),
      proseCompartment.of(proseOrRaw()),
      themeCompartment.of(editorTheme(settings.theme === "dark")),
      spell.misspellings,
      spell.spellDecorations,
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
        mousedown(e, v) {
          if (!settings.spellcheck) return false;
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos == null) return false;
          const m = spell.misspellingAt(v, pos);
          if (!m) return false;
          e.preventDefault();
          void openSpellMenu(m, e.clientX, e.clientY);
          return true;
        },
        contextmenu(e, v) {
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos == null) return false;
          if (settings.spellcheck) {
            const m = spell.misspellingAt(v, pos);
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
  }, PANE_DEBOUNCE_MS);
}
const PANE_DEBOUNCE_MS = 200;

let countTimer: number | undefined;
const COUNT_DEBOUNCE_MS = 200;
function updateCounts() {
  clearTimeout(countTimer);
  countTimer = window.setTimeout(countNow, COUNT_DEBOUNCE_MS);
}


// Sync scrolling: scrolling the editor drives the preview and vice-versa
// (percentage-based, which is all a scrollbar can honestly be). Clicking the
// preview puts the cursor on the word that was clicked — exactly, by asking the
// compiler, not by proportion. Two-panel mode only.
function wireSyncScroll() {
  const preview = document.getElementById("preview")!;
  const scroller = runtime.view.scrollDOM;
  let lock = false;
  const frac = (e: HTMLElement) => e.scrollTop / Math.max(1, e.scrollHeight - e.clientHeight);
  const apply = (src: HTMLElement, dst: HTMLElement) => {
    if (lock || settings.syncScroll === false || settings.layout !== "two") return;
    lock = true;
    dst.scrollTop = frac(src) * (dst.scrollHeight - dst.clientHeight);
    requestAnimationFrame(() => (lock = false));
  };
  scroller.addEventListener("scroll", () => apply(scroller, preview));
  preview.addEventListener("scroll", () => apply(preview, scroller));
  preview.addEventListener("click", (e) => {
    if (settings.layout !== "two") return;
    // A drag that ended here is a selection, not a click: the reader is copying a
    // rendered line, and moving the caret would take the selection with it.
    if (!isPlainClick(window.getSelection())) return;
    void jumpFromClick(e);
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
  let rows: Refreshed[];
  try {
    rows = await girsa.refresh(markup);
  } catch (e) {
    const bad = troubleSaid(e, "reach_girsa");
    setStatus(bad.said, "err", bad.detail);
    return;
  }
  if (!rows.length) {
    setStatus(t("refreshNone"), "");
    return;
  }
  showRefreshed(rows);
  const moved = rows.filter((r) => !r.trouble && !markup.includes(r.text)).length;
  setStatus(tf("refreshedCount", rows.length, moved), moved ? "warn" : "ok");
}

/** The rows, each with what to do about it. */
function showRefreshed(rows: Refreshed[]): void {
  const list = document.getElementById("refresh-list");
  if (!list) return;
  const doc = docTextOf(runtime.view.state.doc);
  list.replaceChildren(
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
 */
function docLang(): "he" | "en" {
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
  const plan = planInsertion(doc, sel.from, sel.to, selText, rawSnippet);
  if (plan.kind === "refuse") {
    setStatus(t(plan.reason), "warn");
    return;
  }
  if (plan.kind === "note") {
    applyNoteChoice(plan.choice, plan.which, { to: sel.to, text: selText, marker: plan.marker });
    return;
  }
  runtime.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: plan.text },
    selection: { anchor: sel.from + plan.cursor },
  });
  runtime.view.focus();
}

function insertRegion() {
  const sel = runtime.view.state.selection.main;
  const doc = docTextOf(runtime.view.state.doc);
  const r = regionAround(doc, sel.from, sel.to, t("region"));
  runtime.view.dispatch({
    changes: { from: r.from, to: r.to, insert: r.text },
    selection: { anchor: r.select[0], head: r.select[1] },
  });
  runtime.view.focus();
  scheduleCompile();
}


// Wrap the selection in a block comment (/* … */): foldable, styled, and NOT
// rendered — a collapsible editor comment.
function commentOut() {
  const sel = runtime.view.state.selection.main;
  const selText = runtime.view.state.sliceDoc(sel.from, sel.to) || t("region");
  runtime.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: `/* ${selText} */` },
    selection: { anchor: sel.from + 3, head: sel.from + 3 + selText.length },
  });
  runtime.view.focus();
  scheduleCompile();
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
 * With a selection this *is* [`commentOut`] — "make this not print" is one idea,
 * and two implementations of it would eventually disagree about the padding.
 */
function hiddenBreak() {
  const sel = runtime.view.state.selection.main;
  if (!sel.empty) return commentOut();
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
 * The current paragraph's level, as a control and as a readout.
 *
 * Bound to the same registry operations as everything else: picking a level
 * runs `heading.levelN`, and "body text" unwraps. It is rebuilt on every
 * selection change by `updateContextBar`, so it always shows where the caret
 * actually is rather than what was last pressed.
 */
function headingLevelSelect(): HTMLElement {
  const sel = el("select", {
    id: "heading-level",
    class: "heading-select",
    title: t("paragraphStyle"),
    "aria-label": t("paragraphStyle"),
  }) as HTMLSelectElement;
  sel.append(el("option", { value: "0" }, [t("bodyText")]));
  for (let i = 1; i <= heads.MAX_LEVEL; i++) {
    sel.append(el("option", { value: String(i) }, [t("headingLevel" + i)]));
  }
  sel.addEventListener("change", () => {
    const want = parseInt(sel.value, 10);
    const doc = docTextOf(runtime.view.state.doc);
    const pos = runtime.view.state.selection.main.head;
    if (want === 0) {
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
  });
  return sel;
}

/**
 * A note button, labelled with its name *and* its shortcut.
 *
 * `snippet: null` means "read the caret" — the tiered note is `#הערה_א` in
 * prose, `#הערה_ב` inside a note and `#הערה_ג` inside two, which is the only
 * way one button can mean "a note on this".
 */
function noteBtn(action: string, glyph: string, snippet: string | null): HTMLElement {
  const key = keybindings()[action];
  const title = t("sc." + action) + (key ? ` · ${readable(key)}` : "");
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
  const byName = (he: string) => runtime.commandsReg.find((c) => c.he === he);
  const b = (he: string, label: string) => {
    const c = byName(he);
    if (!c) return el("span");
    const title = lang === "he" ? c.desc_he : c.desc_en;
    return iconBtn(label, `${title} · #${c.he}`, () => insertSnippet(c.insert), "", {
      "data-command": c.he,
    });
  };

  return el("div", { class: "toolbar", role: "toolbar", "aria-label": t("toolbar") }, [
    tbGroup(t("cat.style"), [
      b("הדגשה", "B"),
      b("נטוי", "I"),
      b("קו_תחתון", "U"),
      b("קו_חוצה", "S"),
      b("סימון", "🖍"),
    ]),
    // The paragraph-style control, which is a word processor's single most-used
    // widget and which Ksav did not have. Three fixed buttons could only reach
    // three of nine levels, and could not tell the writer which one they were
    // standing in — a dropdown does both, and is where a Word user looks first.
    tbGroup(t("cat.heading"), [headingLevelSelect()]),
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
    tbGroup(t("cat.footnote"), [
      noteBtn("footnote", "†", "#הערה[|]"),
      noteBtn("tieredNote", "⁑", null),
      noteBtn("endnote", "⁋", "#הערתסיום[|]"),
      b("הערת_צד", "▣"),
    ]),
    tbGroup(t("cat.align"), [b("ימין", "⇥"), b("מרכז", "≡"), b("שמאל", "⇤")]),
    tbGroup(t("cat.torah"), [b("ציטוט", "❝"), b("סימן", "§"), b("סעיף", "א."), b("מראה_מקום", "‡")]),
    tbGroup(t("tools"), [
      iconBtn("▤", t("region"), insertRegion),
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

/** Rebuilt on every open, so it never shows a stale library. */
function docsMenuItems(): (Node | string)[] {
  const items: (Node | string)[] = [
    el("button", { class: "menu-item", onClick: () => void newNamedDoc() }, [t("newDoc")]),
    el("button", { class: "menu-item", onClick: renameDoc }, [t("rename")]),
    el("button", { class: "menu-item", onClick: () => void duplicateDoc(runtime.currentDoc.id) }, [
      t("duplicate"),
    ]),
    el("div", { class: "menu-sep" }),
    el("div", { class: "menu-cat" }, [t("library")]),
  ];
  for (const entry of docs.library()) {
    const open = entry.id === runtime.currentDoc?.id;
    items.push(
      el("div", { class: "menu-item-row" }, [
        el(
          "button",
          {
            class: "menu-item menu-item-main" + (open ? " active" : ""),
            onClick: () => {
              closeMenus();
              void openDoc(entry.id);
            },
          },
          [
            el("b", {}, [(open ? "● " : "") + entry.title]),
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
      const enabled = structure.isEnabled(action, doc, pos);
      const key = kb[action.id];
      items.push(
        el(
          "button",
          {
            class: "menu-item menu-cmd" + (enabled ? "" : " disabled"),
            disabled: enabled ? null : "true",
            onClick: () => {
              closeMenus();
              runStructureAction(action, true);
            },
          },
          [
            el("b", {}, [`${action.glyph}  ${t(action.label)}`]),
            key ? el("code", {}, [readable(key)]) : el("span"),
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
      const key = kb[macros.actionIdOf(m)];
      items.push(
        el("div", { class: "menu-item-row" }, [
          el("button", {
            class: "menu-item menu-item-main",
            onClick: () => (closeMenus(), playMacro(m)),
          }, [
            el("b", {}, [m.name]),
            el("span", { class: "menu-desc" }, [
              macros.describe(m, macroName) + (key ? "  ·  " + readable(key) : ""),
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

function buildFormatMenu(): HTMLElement {
  return lazyMenu("format", "¶ " + t("format"), () => structureMenuItems(["heading", "list"]));
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
  const lang = getLang();
  const cats: string[] = [];
  for (const c of runtime.commandsReg) if (!cats.includes(c.category)) cats.push(c.category);
  const kb = keybindings();
  /** Insert ▸ Footnote / Endnote, where a Word user looks first. */
  const noteItem = (action: string, glyph: string, snippet: string | null) =>
    el(
      "button",
      {
        class: "menu-item",
        onClick: () => {
          closeMenus();
          const st = runtime.view.state;
          insertSnippet(snippet ?? tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
        },
      },
      [
        el("b", {}, [`${glyph} ${t("sc." + action)}`]),
        kb[action] ? el("code", {}, [readable(kb[action])]) : el("span"),
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
    noteItem("tieredNote", "⁑", null),
    el("button", { class: "menu-item", onClick: openNotesChooser }, [
      el("b", {}, ["✻ " + t("notesChooser")]),
      el("span", { class: "menu-desc" }, [t("notesChooserLede")]),
    ]),
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
    el("button", { class: "menu-item", onClick: () => (closeMenus(), hiddenBreak()) }, [
      el("b", {}, ["⏎ " + t("hiddenBreak")]),
      el("span", { class: "menu-desc" }, [t("hiddenBreakLede")]),
    ]),
    el("div", { class: "menu-sep" }),
  ];
  const doc = runtime.view ? docTextOf(runtime.view.state.doc) : "";
  const pos = runtime.view?.state.selection.main.from ?? 0;
  for (const cat of cats) {
    items.push(el("div", { class: "menu-cat" }, [t("cat." + cat)]));
    for (const c of runtime.commandsReg.filter((x) => x.category === cat && !x.deprecated)) {
      // Greyed rather than hidden, with the reason on the tooltip. "This exists,
      // and not here" is information; a command that silently vanishes from the
      // menu when the caret moves is a product that looks broken.
      const legality = legalAt(doc, pos, c.he);
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
            el("code", {}, ["#" + c.he]),
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
      toggleMenu(list, btn, () => {
        list.replaceChildren();
        list.append(...build().map((n) => (typeof n === "string" ? document.createTextNode(n) : n)));
      });
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
  review: openReview,
  language: () => setSetting("lang", getLang() === "he" ? "en" : "he"),
  foldAll: () => void foldAll(runtime.view),
  unfoldAll: () => void unfoldAll(runtime.view),
  prose: () => setSetting("prose", !settings.prose),
  layout: cycleLayout,
  previewSide: cyclePreviewSide,
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
    prose: settings.prose,
    layout: settings.layout,
    previewSide: settings.previewSide || "left",
    // Three of these are optional settings and one is the recorder's own
    // buffer. `header.ts` takes booleans, because "is this chip on" is a
    // question with two answers and `undefined` is not one of them.
    outline: !!settings.outline,
    nikud: !!settings.nikud,
    notesPane: !!settings.notesPane,
    recording: !!recording,
  };
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

  const FILE_RUN: Record<string, () => void> = {
    newDoc,
    open: openFile,
    save: saveFile,
    saveAs: saveFileAs,
    importWord: () => void importWord(),
    shareRead: () => void copyShareLink(false),
    shareReview: () => void copyShareLink(true),
    saveAsTemplate,
  };
  const fileMenu = menu(
    "file",
    "📁 " + t("file"),
    header
      .fileItems(files.supportsRealFiles())
      .filter((e) => !header.isSep(e))
      .map((e) => menuItem(e as header.MenuRow, FILE_RUN[(e as header.MenuRow).id])),
  );

  // The Skins menu is gone: presets now live inside the Styles panel, next to
  // the settings they overwrite, where the relationship is visible.

  const EXPORT_RUN: Record<string, () => void> = {
    exportPdf: () => void exports.exportPdf(),
    exportPdfPages: () => void exports.exportPdfPages(),
    exportWord: () => void exports.exportWord(),
    copyForWord: () => void exports.copyForWord(),
    exportHtml: () => void exports.exportHtml(),
    exportMarkdown: exports.exportMarkdown,
    exportText: exports.exportText,
    exportTypst: () => void exports.exportTypst(),
    print: exports.doPrint,
  };
  const exportMenu = menu(
    "export",
    "⬇ " + t("export"),
    header.exportItems().map((row) =>
      menuItem(row, EXPORT_RUN[row.id], { "data-export": row.id }),
    ),
  );

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
    { onChange: (e: Event) => setSetting(key, (e.target as HTMLSelectElement).value as never) },
    options.map(([value, label]) =>
      el("option", { value, ...(live === value ? { selected: "selected" } : {}) }, [label]),
    ),
  );
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), sel]);
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

function buildSettingsDrawer(): HTMLElement {
  // Bundled families, plus anything the writer has attached to this document.
  // The box is free text rather than a fixed list, because a font file carries
  // its own family name and only the file knows it.
  const fontList = el("datalist", { id: "font-families" }, [
    ...BUNDLED_FONTS,
    ...(runtime.currentDoc?.assets ?? [])
      .filter((a) => a.kind === "font")
      .map((a) => a.name.replace(/\.[^.]+$/, "")),
  ].map((f) => el("option", { value: f })));
  const fontSel = el("span", { class: "font-pick" }, [
    el("input", {
      type: "text",
      list: "font-families",
      value: docConfig().font,
      onChange: (e: Event) => setSetting("font", (e.target as HTMLInputElement).value as never),
    }),
    fontList,
    el("button", { type: "button", class: "mini", title: t("addFont"), onClick: addFont }, ["+"]),
  ]);
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

  const kb = keybindings();
  const shortcutRows = actions().map((a) => {
    const btn = el("button", { class: "sc-key", type: "button" }, [kb[a.id] || "—"]);
    btn.addEventListener("click", () => captureShortcut(a.id, btn));
    // A structural operation names itself from the registry, so adding one to
    // `STRUCTURE_ACTIONS` puts it in this list with a real name instead of a
    // raw id — no second string to remember to write.
    // `macroName` covers all three kinds: a structural operation names itself
    // from the registry, a macro from its own title, and everything else from
    // its `sc.` string. Without this a bound macro appeared in Settings as the
    // raw text `sc.macro.m1a2b3` — a row nobody could identify, which is the
    // same "shipped unnamed" failure the bindings test exists to catch.
    const name = macroName(a.id);
    return el("label", { class: "set-row" }, [el("span", {}, [name]), btn]);
  });

  return el("aside", { id: "settings-drawer", class: "drawer", "aria-label": t("settings") }, [
    // Every other panel in the app closes with × and with Escape; this one used
    // to close only by finding the ⚙ chip again — and below 720px the drawer is
    // the full viewport width, so that chip is *underneath it*. There was
    // literally no way out of Settings on a phone.
    panelHead("settings-drawer", t("settings"), { level: "h3" }),
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
    checkRow("justify", "justify"),
    numberRow("lineSpacing", "line_spacing_em", 0.4, 1.5, 0.05),
    numberRow("paraSpacing", "para_spacing_em", 0, 3, 0.1),
    numberRow("firstIndent", "first_line_indent_em", 0, 4, 0.25),
    numberRow("columns", "columns", 1, 3, 1),
    textRow("headerText", "header", ""),
    textRow("footerText", "footer", ""),
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
    numberRow("zoom", "zoom", 0.5, 2, 0.1),
    selectRow("editingModeLabel", "editingMode", [
      ["default", t("mode.default")],
      ["vim", t("mode.vim")],
      ["emacs", t("mode.emacs")],
    ]),
    el("div", { class: "set-note" }, [t("editingModeNote")]),
    checkRow("focusModeLabel", "focusMode"),
    checkRow("typewriterLabel", "typewriter"),
    checkRow("autocompleteLabel", "autocomplete"),
    checkRow("spellcheckLabel", "spellcheck"),
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
    el("h3", { style: "margin-top:18px" }, [t("shortcuts")]),
    ...shortcutRows,
    el("button", { class: "sc-reset", type: "button", onClick: resetShortcuts }, [t("resetShortcuts")]),
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
function toggleOutline() {
  settings.outline = !settings.outline;
  saveSettings();
  togglePanel("outline-drawer", settings.outline);
  rerenderChrome();
}

// ---- the notes pane ----
//
// Word's navigation pane, for notes. Anyone with more than ten notes works by
// scanning a list and jumping, not by scrolling the source hunting for the one
// that began "ועיין" — and the notes are the text a writer most often needs to
// get back to. Ksav had an outline of the headings and nothing for the notes,
// which in a sefer is the larger half of the document.

function toggleNotesPane() {
  togglePanel("notes-drawer");
}

function renderNotesPane() {
  const host = document.getElementById("notes-list");
  if (!host || !runtime.view) return;
  // A row jumps to wherever the prose actually is. For a deferred note that is
  // the `#גוף_הערה` at the end of the file, which is the whole point of the row:
  // the marker is easy to find and the prose is not.
  drawList(host, panelrows.noteList(notesIn(docTextOf(runtime.view.state.doc))), LOOKS.notes);
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
  const targets = NOTE_CHOICES.flatMap((c) => [c.insert, c.insert2])
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
            const done = choice ? scaffold(e2.text, e2.caret, choice) : e2;
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
  const host = document.getElementById("outline-list");
  if (!host || !runtime.view) return;
  drawList(host, panelrows.outlineList(outline(docTextOf(runtime.view.state.doc))), LOOKS.outline);
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
  history: { row: "pal-item", chip: "pal-cat", label: "b" },
  palette: { row: "pal-item", chip: "pal-cat", label: "b", selectable: true },
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

function drawRow(r: PanelRow, look: Look, first: boolean, snaps: docs.Snapshot[]): HTMLElement {
  const run = () => {
    switch (r.does.kind) {
      case "jump":
      case "note":
        jumpTo(r.does.at);
        return;
      case "action":
        closePalette();
        runAction(r.does.id);
        return;
      case "insert":
        insertSnippet(r.does.snippet);
        closePalette();
        return;
      case "restore":
        void restoreSnapshot(snaps[r.does.index]);
    }
  };
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
  return el("button", attrs, [
    ...(r.chip ? [el("span", { class: look.chip }, [t(r.chip)])] : []),
    ...(when ? [el("span", { class: look.chip }, [when.toLocaleDateString()])] : []),
    ...(r.note ? [el("span", { class: "note-item-def" }, [r.note])] : []),
    el(look.label, {}, [r.label]),
    ...(r.trailing ? [el("code", {}, [r.trailing])] : []),
    ...(when ? [el("code", {}, [when.toLocaleTimeString()])] : []),
  ]);
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
 * Offer back a document rescued from a crash.
 *
 * As a *new* document, never over the top of the open one. The rescued text is
 * from a session that ended badly, and the surest way to turn one lost evening
 * into two is to let it overwrite whatever is there now.
 */
function offerRecovery() {
  const rescued = crash.recovery();
  if (!rescued) return;
  if (rescued.body.trim() === runtime.docText().trim()) {
    // Already have it — the crash happened after the library copy was written.
    crash.clearRecovery();
    return;
  }
  showChromeNotice(tf("recoveryOffer", rescued.title || t("untitled")), () => {
    void (async () => {
      const doc = await docs.createDoc(
        (rescued.title || t("untitled")) + " ‏(" + t("recovered") + ")",
        rescued.body,
      );
      crash.clearRecovery();
      clearChromeNotice();
      await openDoc(doc.id);
    })();
  });
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
  showChromeNotice(tf("updateAvailable", release.version), () => {
    window.open(release.url, "_blank", "noopener");
  });
}

/**
 * Read a `.docx` in, as a new document.
 *
 * Always a *new* document, never over the open one — importing is not a thing
 * anybody does to the sefer they are in the middle of writing, and getting that
 * wrong once costs somebody an evening.
 */
async function importWord() {
  closeMenus();
  const picked = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".docx";
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
    result = await docx.importDocx(new Uint8Array(await picked.arrayBuffer()));
  } catch (e) {
    const bad = troubleSaid(e, "general");
    setStatus(`${t("importFailed")} — ${bad.said}`, "err", bad.detail);
    return;
  }
  const title = picked.name.replace(/\.docx$/i, "") || t("untitled");
  const created = await docs.createDoc(title, result.body);
  // The direction is read off the text rather than guessed, and written onto the
  // document's own page setup — where it belongs since B26.
  await docs.rememberConfig(created.id, { dir: result.dir });
  await openDoc(created.id);
  // Say what did not come across. An import that quietly loses the pictures is
  // the kind of thing somebody discovers at the printer.
  setStatus(
    result.dropped.length ? tf("importedWithGaps", title, result.dropped.join(", ")) : tf("imported", title),
    result.dropped.length ? "warn" : "ok",
  );
}

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
    const on = heads.headingAt(doc, pos);
    const want = String(on ? on.level : 0);
    // Assigning `value` on a `<select>` is not free and fires no change event,
    // but it does invalidate style and can close a native dropdown the writer
    // has open. Most caret moves do not change the answer.
    if (levelSel.value !== want) levelSel.value = want;
  }

  // Sticky by one character: see `structureNear`. Finishing a list left the
  // caret after the closing `)`, where the ribbon correctly emptied — and a
  // ribbon that disappears on the character after the one you just typed reads
  // as the feature breaking, not as the model being precise.
  const near = structure.structureNear(doc, pos)?.pos ?? pos;
  const here = structure.availableAt(doc, near);
  if (here.length === 0) {
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
    const key = keys[action.id];
    const name = t(action.label);
    children.push(
      el(
        "button",
        {
          class: "tb-btn" + (enabled ? "" : " disabled"),
          // The key is in the tooltip because a shortcut nobody can find is the
          // same as no shortcut — the same rule the nikud bar follows.
          title: key ? `${name} · ${readable(key)}` : name,
          "aria-label": name,
          disabled: enabled ? null : "true",
          onClick: () => runStructureAction(action, true),
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
            el("dt", {}, [e.what]),
            el("dd", {}, [el("code", {}, [e.how])]),
          ])),
        ]),
      )
    : [el("p", { class: "help-lede" }, [t("helpNothing")])];

  box.replaceChildren(...body);
}

function buildHelpPanel(): HTMLElement {
  const input = el("input", {
    id: "help-search",
    type: "search",
    placeholder: t("helpSearch"),
    class: "help-search",
  }) as HTMLInputElement;
  input.addEventListener("input", () => renderHelp(input.value));
  return el("aside", { id: "help-panel", class: "drawer drawer-help", "aria-label": t("help") }, [
    panelHead("help-panel", t("helpTitle")),
    el("p", { class: "help-lede" }, [t("helpLede")]),
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

/** The saved macros, read defensively — a bad preference must not stop the app. */
function savedMacros(): macros.Macro[] {
  return macros.parseAll(settings.macros);
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
  const head = panelHead("hydra", t("structure." + h.structure), {
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

function selectControl(
  options: [string, string][],
  current: string,
  onPick: (v: string) => void,
): HTMLElement {
  return el(
    "select",
    { onChange: (e: Event) => onPick((e.target as HTMLSelectElement).value) },
    options.map(([v, lbl]) =>
      el("option", { value: v, ...(current === v ? { selected: "selected" } : {}) }, [lbl]),
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
  const hNumbering = styles.readString(styleArg("headings", "מספור")) ?? "";
  const hRule = styles.readBool(styleArg("headings", "קו")) ?? false;
  const hUnderline = styles.readBool(styleArg("headings", "קו_תחתון")) ?? false;
  const hSmallcaps = styles.readBool(styleArg("headings", "רברבתי")) ?? false;
  const hColor = styles.readColor(styleArg("headings", "צבע")) ?? "#000000";
  const hAlign = (styleArg("headings", "יישור") ?? "none").trim();

  const headings = [
    styleRow(t("headingNumbering"), selectControl(
      [["", t("none")], ["1.", "1. 2. 3."], ["1.1", "1.1 1.2"], ["א.", "א. ב. ג."], ["I.", "I. II."]],
      hNumbering,
      (v) => setStyleArgs("headings", { "מספור": v ? styles.typstString(v) : null }),
    )),
    styleRow(t("headingAlign"), selectControl(
      [["none", t("inherit")], ["right", t("right")], ["center", t("center")], ["left", t("left")]],
      hAlign,
      (v) => setStyleArgs("headings", { "יישור": v === "none" ? null : v }),
    )),
    styleRow(t("headingColor"), colorControl(hColor, (v) =>
      setStyleArgs("headings", { "צבע": v === "#000000" ? null : styles.typstColor(v) }))),
    styleRow(t("headingRule"), toggleControl(hRule, (v) =>
      setStyleArgs("headings", { "קו": v ? "true" : null }))),
    styleRow(t("headingUnderline"), toggleControl(hUnderline, (v) =>
      setStyleArgs("headings", { "קו_תחתון": v ? "true" : null }))),
    styleRow(t("headingSmallcaps"), toggleControl(hSmallcaps, (v) =>
      setStyleArgs("headings", { "רברבתי": v ? "true" : null }))),
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

  const lists = [
    styleRow(t("listMarker"), selectControl(
      [["", t("default")], ["[•]", "•"], ["[–]", "–"], ["[◆]", "◆"], ["[▪]", "▪"], ["[✦]", "✦"]],
      lMarker,
      (v) => setStyleArgs("lists", { "סמן": v || null }),
    )),
    styleRow(t("listIndent"), indentInput),
    styleRow(t("listTight"), toggleControl(lTight, (v) =>
      setStyleArgs("lists", { "הידוק": v ? "true" : null }))),
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

  const tables = [
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

  box.replaceChildren(
    panelHead("styles-panel", t("stylesTitle")),
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

    el("h3", {}, [t("styleHeadings")]),
    ...headings,
    el("h3", {}, [t("styleLists")]),
    ...lists,
    el("h3", {}, [t("styleTables")]),
    ...tables,
    el("h3", {}, [t("styleNotes")]),
    el("p", { class: "styles-note" }, [t("styleNotesNote")]),
    ...noteStyleRows(),
    el("p", { class: "styles-note" }, [t("documentStyleNote")]),
  );
}

// ---------------------------------------------------------------- a small form modal
//
// Two features below (section page setup, formulas) need the same thing: a few
// fields, then insert. `prompt()` can ask for one string and nothing more, and a
// second bespoke overlay for each would be two copies of the same fifty lines.

let modalOk: (() => void) | null = null;

function openModal(title: string, lede: string, rows: (Node | string)[], onOk: () => void) {
  modalOk = onOk;
  const box = document.getElementById("form-modal-body")!;
  box.replaceChildren(
    panelHead("form-modal", title),
    el("p", { class: "styles-lede" }, [lede]),
    ...rows,
    el("div", { class: "modal-actions" }, [
      el("button", { class: "note-use", onClick: () => { const f = modalOk; closeModal(); f?.(); } }, [
        t("insertAction"),
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

const MARK_ICON: Record<review.MarkKind, string> = { insert: "＋", delete: "－", comment: "✎" };

function renderReviewPanel() {
  const box = document.getElementById("review-body");
  if (!box || !runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const marks = review.scanMarks(doc);
  const changes = marks.filter((m) => m.kind !== "comment").length;
  const view0 = reviewView();

  const viewButtons = el(
    "div",
    { class: "style-presets" },
    (["markup", "final", "original"] as review.ReviewView[]).map((v) =>
      el(
        "button",
        {
          class: "style-preset" + (v === view0 ? " active" : ""),
          onClick: () => setReviewView(v),
        },
        [t("rv." + v)],
      ),
    ),
  );

  const markRow = (m: review.ReviewMark) =>
    el("div", { class: `rv-item rv-${m.kind}` }, [
      el(
        "button",
        {
          class: "rv-main",
          title: m.body,
          // Clicking the entry puts the cursor on the mark, so "which one is
          // this?" is answered by looking at the document, not by guessing.
          onClick: () => jumpTo(m.from),
        },
        [
          el("span", { class: "rv-kind" }, [MARK_ICON[m.kind] + " " + t("rv." + m.kind)]),
          el("span", { class: "rv-text" }, [review.excerpt(m.body) || "—"]),
          ...(m.author ? [el("span", { class: "rv-author" }, [m.author])] : []),
        ],
      ),
      el("div", { class: "rv-actions" }, [
        el("button", { class: "rv-yes", title: t("accept"), onClick: () => decideMark(m, "accept") }, [
          m.kind === "comment" ? t("resolve") : t("accept"),
        ]),
        ...(m.kind === "comment"
          ? []
          : [
              el("button", { class: "rv-no", title: t("reject"), onClick: () => decideMark(m, "reject") }, [
                t("reject"),
              ]),
            ]),
      ]),
    ]);

  box.replaceChildren(
    panelHead("review-panel", t("reviewTitle")),
    el("p", { class: "styles-lede" }, [t("reviewLede")]),

    el("h3", {}, [t("reviewView")]),
    viewButtons,

    el("h3", {}, [t("review")]),
    el("div", { class: "rv-tools" }, [
      el("button", { class: "sc-key", onClick: () => markReview("insert") }, ["＋ " + t("markInsert")]),
      el("button", { class: "sc-key", onClick: () => markReview("delete") }, ["－ " + t("markDelete")]),
      el("button", { class: "sc-key", onClick: addComment }, ["✎ " + t("addComment")]),
    ]),
    fieldRow(
      t("reviewerName"),
      (() => {
        const input = textField(settings.reviewer ?? "");
        input.addEventListener("input", () => {
          settings.reviewer = input.value;
          saveSettings();
        });
        return input;
      })(),
    ),

    el("h3", {}, [tf("reviewCount", String(changes), String(marks.length - changes))]),
    ...(marks.length
      ? [
          el("div", { class: "rv-tools" }, [
            el("button", { class: "sc-key", onClick: () => decideEverything("accept") }, [t("acceptAll")]),
            el("button", { class: "sc-key", onClick: () => decideEverything("reject") }, [t("rejectAll")]),
          ]),
          ...marks.map(markRow),
        ]
      : [el("div", { class: "set-note" }, [t("reviewEmpty")])]),
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
  which: "primary" | "secondary",
  sel: { to?: number; text?: string; marker?: string } = {},
) {
  const from = runtime.view.state.selection.main.from;
  const { text, caret } = applyChoice(
    docTextOf(runtime.view.state.doc),
    from,
    choice,
    which,
    deferBodies(),
    sel,
  );
  editDoc(text, caret);
  scheduleCompile();
}

function chooseNote(choice: NoteChoice, which: "primary" | "secondary") {
  applyNoteChoice(choice, which);
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
  for (const [at, body, which] of [
    [Math.floor(base.length * 0.6), t("notePreviewNoteB"), "secondary"],
    [Math.floor(base.length * 0.2), t("notePreviewNoteA"), "primary"],
  ] as [number, string, "primary" | "secondary"][]) {
    if (which === "secondary" && !c.insert2) continue;
    const r = applyChoice(src, at, c, which, false);
    src = r.text.slice(0, r.caret) + body + r.text.slice(r.caret);
  }
  const res = await backend.compile(src, { ...docConfig(), paper: "a5" }).catch(() => null);
  const svg = res?.pages_svg?.[0];
  if (!svg) return;
  host.innerHTML = svg;
  host.classList.add("ready");
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
      el("div", { class: "note-actions" }, [
        el("button", { class: "note-use", onClick: () => chooseNote(c, "primary") }, [
          t("useThis"),
        ]),
        // A two-layer layout needs both markers; offer the upper one directly so
        // the writer never has to work out which command pairs with which.
        ...(c.insert2
          ? [
              el("button", { class: "note-use secondary", onClick: () => chooseNote(c, "secondary") }, [
                t("useSecond"),
              ]),
            ]
          : []),
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
    return el("button", { class: "note-quick", onClick: () => chooseNote(choice, "primary") }, [
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
    panelHead("notes-chooser", t("notesChooserTitle")),
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
  } else if (key === "layout") {
    applyLayout();
    rerenderChrome();
  } else if (key === "dir") {
    runtime.view.dispatch({ effects: dirCompartment.reconfigure(EditorView.contentAttributes.of({ dir: docConfig().dir })) });
    // The preview pane reads in the document's direction, so flipping the
    // document has to re-point the pane in the same act.
    applyPreview();
    scheduleCompile();
  } else if (key === "editingMode") {
    void keymodes.applyMode(runtime.view, keymodes.isMode(value) ? value : "default");
    rerenderChrome();
  } else if (key === "focusMode" || key === "typewriter") {
    runtime.view.dispatch({
      effects: focusCompartment.reconfigure(
        focusExtension(!!settings.focusMode, !!settings.typewriter),
      ),
    });
  } else if (key === "zoom" || key === "fitWidth") {
    applyPreview();
  } else if (key === "autocomplete") {
    runtime.view.dispatch({ effects: autoCompartment.reconfigure(autoExtension()) });
  } else if (key === "spellcheck") {
    // Turning it off must take the existing squiggles with it, not just stop
    // adding new ones.
    if (settings.spellcheck) scheduleSpellCheck();
    else clearSpellCheck();
  } else {
    scheduleCompile();
  }
}

// ---------------------------------------------------------------- layout / theme / chrome
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}
function applyLayout() {
  document.getElementById("app")!.dataset.layout = settings.layout;
}

// Preview placement: which side of the split the preview sits on, and how much
// of the split it takes. Applied to <main> so CSS can flip orientation/order.
function applyPreviewSide() {
  const main = document.querySelector("main");
  if (main) (main as HTMLElement).dataset.side = settings.previewSide || "left";
  document.documentElement.style.setProperty("--preview-frac", String(settings.previewFrac ?? 0.5));
}
function cyclePreviewSide() {
  const order: PreviewSide[] = ["left", "right", "bottom", "top"];
  const cur = settings.previewSide || "left";
  settings.previewSide = order[(order.indexOf(cur) + 1) % order.length];
  saveSettings();
  applyPreviewSide();
  rerenderChrome();
}

// Drag the divider between the two panes to resize the split (not fixed 50/50).
// Works for both horizontal (left/right) and vertical (top/bottom) placements.
function wireSplitter() {
  const splitter = document.getElementById("splitter");
  const main = document.querySelector("main") as HTMLElement | null;
  if (!splitter || !main) return;
  let dragging = false;
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    const side = settings.previewSide || "left";
    const vertical = side === "top" || side === "bottom";
    const total = vertical ? rect.height : rect.width;
    const pos = vertical ? e.clientY - rect.top : e.clientX - rect.left;
    // <main> is forced LTR, so pos maps left→right / top→bottom physically.
    const leadFrac = Math.min(1, Math.max(0, pos / Math.max(1, total)));
    const previewLeads = side === "left" || side === "top";
    let pf = previewLeads ? leadFrac : 1 - leadFrac;
    pf = Math.min(0.85, Math.max(0.15, pf));
    settings.previewFrac = pf;
    document.documentElement.style.setProperty("--preview-frac", String(pf));
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    saveSettings();
  };
  splitter.addEventListener("pointerdown", (e) => {
    if (settings.layout !== "two") return; // splitter only active in split runtime.view
    dragging = true;
    (e as PointerEvent).preventDefault();
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

// Cycle split → page (Word-like) → source. Entering page mode turns on prose so
// you see formatting, not markup.
function cycleLayout() {
  const order: Layout[] = ["two", "page", "source"];
  const next = order[(order.indexOf(settings.layout) + 1) % order.length];
  if (next === "page" && !settings.prose) {
    settings.prose = true;
    saveSettings();
    runtime.view.dispatch({ effects: proseCompartment.reconfigure(proseMode) });
  }
  setSetting("layout", next);
}

function openPreviewOverlay() {
  openPanel("preview-modal");
}
function applyUiDir() {
  document.documentElement.lang = getLang();
  document.documentElement.dir = isRtlUi() ? "rtl" : "ltr";
}

function rerenderChrome() {
  applyUiDir();
  const app = document.getElementById("app")!;
  app.querySelector("header")?.replaceWith(buildHeader());
  // settings drawer keeps open state
  const drawerOpen = isPanelOpen("settings-drawer");
  document.getElementById("settings-drawer")!.replaceWith(buildSettingsDrawer());
  if (drawerOpen) openPanel("settings-drawer");
  // localize any remaining static labels (pane heads, etc.)
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((e) => {
    e.textContent = t(e.dataset.i18n!);
  });
  // palette placeholder
  (document.getElementById("palette-input") as HTMLInputElement).placeholder = t("searchCommands");
}

// ---------------------------------------------------------------- boot
function render() {
  const app = document.getElementById("app")!;
  app.dataset.layout = settings.layout;
  app.append(
    buildHeader(),
    // Directly under the toolbar, where Word and LibreOffice put their
    // contextual tabs. It used to be a four-button strip pinned to the bottom
    // of the window, which the writer reasonably reported as "no UI at all".
    contextBar(),
    buildNikudBar(scheduleCompile),
    el("main", {}, [
      el("section", { class: "pane preview-pane", "aria-label": t("preview") }, [
        el("div", { class: "pane-head", "data-i18n": "preview" }, [t("preview")]),
        el("div", { id: "preview" }),
      ]),
      el("div", {
        class: "splitter",
        id: "splitter",
        title: t("previewSide"),
        role: "separator",
        tabindex: "0",
        "aria-label": t("previewSide"),
      }),
      el("section", { class: "pane source-pane", "aria-label": t("source") }, [
        el("div", { class: "pane-head", "data-i18n": "source" }, [t("source")]),
        el("div", { id: "editor-host", "aria-label": t("source") }),
      ]),
    ]),
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
    el("aside", { id: "outline-drawer", class: "drawer drawer-start", "aria-label": t("outline") }, [
      // Its own close control, for the same reason the settings drawer needed
      // one: below 720px a drawer is the full viewport, so the chip that opened
      // it is underneath it and cannot be the only way back out.
      panelHead("outline-drawer", t("outline"), { level: "h3" }),
      el("div", { id: "outline-list" }),
    ]),
    // The notes pane, beside the outline: the two halves of a sefer's structure.
    el("aside", { id: "notes-drawer", class: "drawer drawer-start", "aria-label": t("notesPane") }, [
      panelHead("notes-drawer", t("notesPane"), { level: "h3" }),
      el("div", { id: "notes-list" }),
    ]),
    // styles panel (a drawer, so the document stays visible while you tune it)
    el("aside", { id: "styles-panel", class: "drawer drawer-styles", "aria-label": t("stylesTitle") }, [
      el("div", { id: "styles-body" }),
    ]),
    // review panel (a drawer, so the document stays visible while you go
    // through the changes — the whole point is comparing them with the text)
    el("aside", { id: "review-panel", class: "drawer drawer-styles", "aria-label": t("reviewTitle") }, [
      el("div", { id: "review-body" }),
    ]),
    // a shared form modal (section page setup, formulas)
    overlayPanel("form-modal", "palette-box form-modal-box", [el("div", { id: "form-modal-body" })]),
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
    // floating preview (page mode): a button + a modal showing the rendered pages
    el("button", {
      id: "float-preview-btn",
      class: "float-preview-btn",
      title: t("preview"),
      onClick: openPreviewOverlay,
    }, ["📄"]),
    overlayPanel("preview-modal", "preview-modal-box", [el("div", { id: "preview-modal-body" })]),
    // version history modal
    overlayPanel("history-modal", "palette-box", [
      el("div", { class: "history-head" }, [
        el("b", {}, [t("history")]),
        el("button", { class: "sc-key", onClick: () => void takeSnapshot(true) }, [
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
      panelHead("refresh-panel", t("refreshTitle"), { level: "h3" }),
      el("div", { id: "refresh-list" }),
    ]),
  );

  runtime.setView(makeEditor());
  // A diagnostic that names a line has to be able to go there, and the line has
  // to be visible in the editor. `diagview` knows nothing about CodeMirror and
  // does not need to; it asks.
  onGoToLine((line, column) => {
    const at = offsetOf(runtime.view, line, column);
    if (at != null) jumpTo(at);
  });
  onMarkLines((lines) => runtime.view.dispatch({ effects: setErrorLines.of(lines) }));
  save.onFileWritten(() => tellGirsaWhereItIs());
  wireSyncScroll();
  wireSplitter();
  applyTheme();
  applyLayout();
  applyPreviewSide();
  applyUiDir();
  applyPreview();
  updateCounts();
  // The three surfaces whose open state is a saved preference rather than a
  // thing the writer just did. `togglePanel(id, false)` on a panel that is
  // already closed does nothing at all — including running its close hook — so
  // this restores what was on without announcing anything about what was off.
  togglePanel("nikud-bar", settings.nikud);
  togglePanel("outline-drawer", settings.outline);
  togglePanel("notes-drawer", !!settings.notesPane);
}

// global keys: Ctrl/Cmd+K palette; Alt reveals raw markup in prose mode
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
    } else if (e.key === "Alt" && settings.prose) {
      runtime.view.dispatch({ effects: setRevealAll.of(true) });
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && settings.prose) runtime.view.dispatch({ effects: setRevealAll.of(false) });
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
      panelHead("welcome", t("welcomeTitle")),
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

  wirePanel("settings-drawer", { close: () => runtime.view?.focus() });
  wirePanel("help-panel", {
    open: () => {
      renderHelp("");
      (document.getElementById("help-search") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });
  wirePanel("styles-panel", { open: renderStylesPanel });
  wirePanel("review-panel", { open: renderReviewPanel });

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
function showChromeNotice(message: string, retry?: () => void) {
  document.getElementById("chrome-error")?.remove();
  const banner = el("div", { id: "chrome-error", class: "chrome-error", role: "alert" }, [
    el("span", { class: "save-error-text" }, [message]),
    ...(retry
      ? [el("button", { class: "save-error-act", type: "button", onClick: retry }, [t("retrySave")])]
      : []),
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
    showChromeNotice(t("registriesGaveUp"), () => void loadRegistries());
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
  // `:w` in vim and C-x C-s in emacs go through the same save the toolbar uses,
  // rather than a second path that would one day forget to flush something.
  keymodes.setSaveCommand(() => void saveFile());
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
    () => ({ title: runtime.currentDoc?.title ?? "", body: runtime.docText() }),
    (_e, detail) => showCrashPanel(detail),
  );
  offerRecovery();
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
      showChromeNotice(tf("fileChangedNotice", name), () => void reloadFromDisk());
    },
  );
  if (settings.editingMode && settings.editingMode !== "default") {
    void keymodes.applyMode(runtime.view, settings.editingMode);
  }
  runCompile();
  // The first check has to be scheduled explicitly: boot compiles directly
  // rather than through scheduleCompile, so nothing would be checked until the
  // writer's first keystroke.
  scheduleSpellCheck();
  // periodic auto-snapshot (only stores when the text changed) — snapshots live
  // in the store, so this is the one timer with nothing to do without one.
  if (durable) window.setInterval(() => void takeSnapshot(), 180000);
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

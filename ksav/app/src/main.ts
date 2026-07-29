import "./styles.css";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { Compartment, Prec } from "@codemirror/state";
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
import { createBackend } from "./api";
/** How often the editor asks Girsa's desk whether anything arrived. A second
 *  is under the threshold at which a hand-off feels like a hand-off, and it is
 *  one lock and an empty vector when there is nothing waiting. */
const GIRSA_POLL_MS = 1000;
import type { Mekor, Mekoros, TemplateDef } from "./api";
import { t, tf, setLang, getLang, isRtlUi } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import type { DocAsset } from "./docs";
import * as store from "./store";
import * as files from "./files";
import { NOTE_CHOICES, applyChoice } from "./notes";
import * as spell from "./spell";
import * as styles from "./styles";
import * as tables from "./table";
import * as review from "./review";
import { typstString, typstContent } from "./typst-escape";
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
  settings,
  saveSettings,
  BUNDLED_FONTS,
  SKINS,
  applyPreset,
  undoPreset,
  pendingUndo,
} from "./settings";
import type { Settings, Layout, PreviewSide } from "./settings";
import * as save from "./save";
import { scheduleSave, saveNow, flushSaves, reportSaveFailure } from "./save";
import { scheduleCompile, runCompile, applyZoom, onSchedule } from "./compile";
import { nikudKeymap, buildNikudBar } from "./nikud";
import * as exports from "./exports";

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
  const body = runtime.view.state.doc.toString();
  const want = starterDoc();
  if (body === want || (body !== STARTER_HE && body !== STARTER_EN)) return;
  const dir = getLang() === "en" ? "ltr" : "rtl";
  if (settings.dir !== dir) setSetting("dir", dir);
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
  runtime.view.dispatch({
    changes: { from: 0, to: runtime.view.state.doc.length, insert: next.body },
    selection: { anchor: 0 },
  });
  runtime.setSwitching(false);
  save.markFileSaved();
  updateTitleBar();
  rerenderChrome();
  runtime.view.focus();
  scheduleCompile();
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
  const copy = await docs.createDoc(src.title + " ‏(2)", src.body, src.assets);
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
const ACTIONS: { id: string; run: (v: EditorView) => boolean }[] = [
  { id: "bold", run: () => (insertSnippet("#הדגשה[|]"), true) },
  { id: "italic", run: () => (insertSnippet("#נטוי[|]"), true) },
  { id: "underline", run: () => (insertSnippet("#קו_תחתון[|]"), true) },
  { id: "footnote", run: () => (insertSnippet("#הערה[|]"), true) },
  { id: "region", run: () => (insertRegion(), true) },
  { id: "comment", run: () => (commentOut(), true) },
  { id: "undo", run: (v) => undo(v) },
  { id: "redo", run: (v) => redo(v) },
  { id: "h1", run: () => (insertSnippet("#כותרת1[|]"), true) },
  { id: "h2", run: () => (insertSnippet("#כותרת2[|]"), true) },
  { id: "h3", run: () => (insertSnippet("#כותרת3[|]"), true) },
  { id: "bullets", run: () => (insertSnippet("#רשימה(\n  פריט[|],\n)"), true) },
  { id: "numbered", run: () => (insertSnippet("#ממוספרת(\n  פריט[|],\n)"), true) },
  { id: "table", run: () => (insertSnippet("#טבלה(עמודות: 2,\n  תא[|], תא[],\n)"), true) },
  { id: "toc", run: () => (insertSnippet("#תוכן()"), true) },
  { id: "center", run: () => (insertSnippet("#מרכז[|]"), true) },
  { id: "right", run: () => (insertSnippet("#ימין[|]"), true) },
  { id: "left", run: () => (insertSnippet("#שמאל[|]"), true) },
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
  {
    id: "healBrackets",
    run: (v) => {
      const n = healAll(v);
      setStatus(n ? tf("healedCount", n) : t("healedNothing"), n ? "ok" : "");
      return true;
    },
  },
];
const DEFAULT_KEYS: Record<string, string> = {
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  footnote: "Mod-Shift-f",
  region: "Mod-Shift-g",
  comment: "Mod-/",
  undo: "Mod-z",
  redo: "Mod-y",
  h1: "Mod-1",
  h2: "Mod-2",
  h3: "Mod-3",
  bullets: "Mod-Shift-8",
  numbered: "Mod-Shift-7",
  table: "Mod-Shift-t",
  toc: "Mod-Shift-o",
  center: "Mod-e",
  right: "Mod-Shift-r",
  left: "Mod-Shift-l",
  palette: "Mod-k",
  find: "Mod-f",
  foldAll: "Mod-Alt-[",
  unfoldAll: "Mod-Alt-]",
  save: "Mod-s",
  open: "Mod-o",
  newDoc: "Mod-Alt-n",
  markInsert: "Mod-Alt-i",
  markDelete: "Mod-Alt-d",
  addComment: "Mod-Alt-m",
  healBrackets: "Mod-Alt-b",
};

/**
 * Extra keys for an action beyond its configured one.
 *
 * Redo answered only to Mod-y, but a great many people press Mod-Shift-z and
 * simply conclude that redo is broken. An alias is not a second setting: it is
 * dropped as soon as the writer binds that combination to something themselves.
 */
const KEY_ALIASES: Record<string, string[]> = {
  redo: ["Mod-Shift-z"],
};
function keybindings(): Record<string, string> {
  return { ...DEFAULT_KEYS, ...(settings.keybindings || {}) };
}
function buildShortcutKeymap(): KeyBinding[] {
  const kb = keybindings();
  const claimed = new Set(Object.values(kb));
  const bindings: KeyBinding[] = [...nikudKeymap(scheduleCompile)];
  for (const a of ACTIONS) {
    if (kb[a.id]) bindings.push({ key: kb[a.id], run: a.run, preventDefault: true });
    for (const alias of KEY_ALIASES[a.id] ?? []) {
      // Never let an alias shadow a key the writer has deliberately assigned.
      if (!claimed.has(alias)) bindings.push({ key: alias, run: a.run, preventDefault: true });
    }
  }
  return bindings;
}
const shortcutCompartment = new Compartment();
function reconfigureShortcuts() {
  runtime.view.dispatch({
    effects: shortcutCompartment.reconfigure(Prec.highest(keymap.of(buildShortcutKeymap()))),
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

// Names of user-defined commands, parsed from the custom-commands preamble.
function userCommandNames(): string[] {
  const src = settings.customCommands || "";
  return [...src.matchAll(/#?let\s+([A-Za-z֐-׿_][\w֐-׿]*)/gu)].map((m) => m[1]);
}

// Command autocomplete: typing `#` offers Ksav commands from the registry plus
// any user-defined commands. Not a dictionary — only triggers on `#`.
function ksavCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/#[A-Za-z֐-׿_]*/u);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;
  const q = word.text.slice(1).toLowerCase();
  const insertApply =
    (snip: string) => (v: EditorView, _c: unknown, from: number, to: number) => {
      const pipe = snip.indexOf("|");
      const text = pipe >= 0 ? snip.slice(0, pipe) + snip.slice(pipe + 1) : snip;
      const cursor = pipe >= 0 ? from + pipe : from + text.length;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: cursor } });
    };
  const options = runtime.commandsReg
    .filter((c) => !q || c.he.includes(q) || c.en.toLowerCase().includes(q))
    .map((c) => ({
      label: "#" + c.he,
      detail: c.en,
      info: getLang() === "he" ? c.desc_he : c.desc_en,
      apply: insertApply(c.insert),
    }));
  for (const name of userCommandNames()) {
    if (!q || name.toLowerCase().includes(q)) {
      options.push({
        label: "#" + name,
        detail: getLang() === "he" ? "פקודה שלי" : "your command",
        info: "",
        apply: insertApply("#" + name + "[|]"),
      });
    }
  }
  return { from: word.from, options, filter: false };
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
  const text = spell.checkableText(runtime.view.state.doc.toString());
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
  closeSpellMenu();
  const box = el("div", { class: "spell-menu", style: `left:${x}px; top:${y}px` }, [
    el("div", { class: "spell-word" }, [m.word]),
    el("div", { class: "spell-loading" }, ["…"]),
  ]);
  document.body.append(box);

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
  document.querySelectorAll(".spell-menu").forEach((n) => n.remove());
}

function autoExtension() {
  return settings.autocomplete === false
    ? []
    : autocompletion({ override: [ksavCompletions], icons: false });
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
      search({ top: true }),
      shortcutCompartment.of(Prec.highest(keymap.of(buildShortcutKeymap()))),
      autoCompartment.of(autoExtension()),
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
      revealAll,
      dirCompartment.of(EditorView.contentAttributes.of({ dir: settings.dir })),
      proseCompartment.of(settings.prose ? proseMode : []),
      themeCompartment.of(editorTheme(settings.theme === "dark")),
      spell.misspellings,
      spell.spellDecorations,
      // A squiggle answers to a plain click, not only a right-click: on a
      // touchscreen there is no right-click at all.
      EditorView.domEventHandlers({
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
          if (!settings.spellcheck) return false;
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos == null) return false;
          const m = spell.misspellingAt(v, pos);
          if (!m) return false;
          e.preventDefault();
          void openSpellMenu(m, e.clientX, e.clientY);
          return true;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged || u.selectionSet) updateTableBar();
        if (u.docChanged) {
          // Saving and rendering are scheduled independently. One must never be
          // able to stop the other — that coupling is what silently lost text.
          scheduleSave();
          scheduleCompile();
          updateCounts();
          // The review list is a runtime.view of the document's own marks, so an edit
          // anywhere — not only a decision taken in the panel — must refresh it.
          if (isReviewOpen()) renderReviewPanel();
          if (settings.outline) renderOutline();
        }
      }),
    ],
  });
}

// Hebrew-aware word + character count — of the TEXT, not the markup.
//
// This used to count the raw document string, so `#הדגשה[...]`, `//` comments and
// every command name inflated the number the writer watches. Strip the markup
// first: comments, then command heads (`#צבע(rgb("#..."))` and the like), then the
// brackets that wrapped their content, leaving the words that will actually print.
export function countableText(src: string): string {
  return src
    .replace(/\/\/[^\n]*/g, " ") // line comments
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/#[A-Za-z_\u0590-\u05FF][\w\u0590-\u05FF]*(\s*\([^()]*\))?/g, " ") // #command(args)
    .replace(/[[\]]/g, " ") // the brackets around command bodies
    .replace(/^\s*=+\s/gm, " "); // heading markers
}
function updateCounts() {
  const el = document.getElementById("wordcount");
  if (!el || !runtime.view) return;
  const text = countableText(runtime.view.state.doc.toString());
  const words = (text.match(/[^\s]+/g) || []).length;
  const chars = text.replace(/\s+/g, " ").trim().length;
  el.textContent = `${words} ${t("words")} · ${chars} ${t("chars")}`;
}


// Sync scrolling: scrolling the editor drives the preview and vice-versa
// (percentage-based). Clicking the preview jumps the editor cursor to the
// matching spot (best-effort by line fraction). Two-panel mode only.
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
    // Don't hijack a text selection: click-to-jump was firing on every click, so
    // selecting text in the preview (to copy a rendered line) was impossible — the
    // caret jumped away the instant the mouse went up. A plain click leaves the
    // selection collapsed and still jumps; a drag-select leaves text selected, and
    // is left alone.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const rect = preview.getBoundingClientRect();
    const f = (preview.scrollTop + (e.clientY - rect.top)) / Math.max(1, preview.scrollHeight);
    const line = Math.min(runtime.view.state.doc.lines, Math.max(1, Math.round(f * runtime.view.state.doc.lines)));
    runtime.view.dispatch({ selection: { anchor: runtime.view.state.doc.line(line).from }, scrollIntoView: true });
    runtime.view.focus();
  });
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

/** The open list, so Tab can move through it and Escape can close it. */
let mekorosBox: HTMLElement | null = null;

function closeMekoros(): void {
  mekorosBox?.remove();
  mekorosBox = null;
}

async function askForMekor(): Promise<void> {
  const sel = runtime.view.state.selection.main;
  const phrase = runtime.view.state.sliceDoc(sel.from, sel.to).trim();
  if (!phrase) {
    setStatus(t("selectAPhrase"), "");
    return;
  }
  setStatus(t("askingGirsa"), "");
  const answer = await runtime.backend!.mekoros(phrase).catch((e) => ({
    phrase,
    total: 0,
    is_a_quotation: false,
    said: "",
    places: [],
    error: String(e),
  }));
  if (answer.error) {
    setStatus(answer.error, "err");
    return;
  }
  setStatus(answer.said, "");
  showMekoros(sel.to, phrase, answer);
}

function showMekoros(at: number, phrase: string, answer: Mekoros): void {
  closeMekoros();
  const box = el("div", { class: "spell-menu mekoros" }, []);
  document.body.append(box);
  mekorosBox = box;

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
    // because that is what makes it re-printable later (spec.md §10.2).
    const markup = `#מראה_מקום[${place.display}]`;
    runtime.view.dispatch({
      changes: { from: at, insert: markup },
      selection: { anchor: at + markup.length },
    });
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
      el("span", { class: "mekor-text" }, [place.text.slice(0, 90)]),
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
    if (!mekorosBox) {
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
  await runtime.backend!.searchInGirsa(phrase).catch(() => {});
  setStatus(t("openedInGirsa"), "");
}

// ---------------------------------------------------------------- snippet insertion
function insertSnippet(snippet: string) {
  const sel = runtime.view.state.selection.main;
  const selText = runtime.view.state.sliceDoc(sel.from, sel.to);
  const pipe = snippet.indexOf("|");
  let text = snippet;
  let cursor = snippet.length;
  if (pipe >= 0) {
    if (selText) {
      text = snippet.slice(0, pipe) + selText + snippet.slice(pipe + 1);
      cursor = pipe + selText.length;
    } else {
      text = snippet.slice(0, pipe) + snippet.slice(pipe + 1);
      cursor = pipe;
    }
  }
  runtime.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + cursor },
  });
  runtime.view.focus();
}

// Wrap the selection in a foldable comment region (//{ … //}). The markers are
// comments, so they never render — they just create a collapsible, labelled block.
function insertRegion() {
  const sel = runtime.view.state.selection.main;
  const selText = runtime.view.state.sliceDoc(sel.from, sel.to);
  const label = t("region");
  // The `//{` marker must start its own line, or the fold service (which keys on
  // a line beginning with `//{`) won't recognize the region. Prepend a newline
  // when the selection doesn't already start at the beginning of a line.
  const atLineStart = sel.from === 0 || runtime.view.state.sliceDoc(sel.from - 1, sel.from) === "\n";
  const lead = atLineStart ? "" : "\n";
  const text = `${lead}//{ ${label}\n${selText}\n//}\n`;
  const cursor = sel.from + lead.length + 4; // start of the label, so it can be renamed
  runtime.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: cursor, head: cursor + label.length },
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

function applySkin(name: string) {
  applyPreset(name);
  closeMenus();
  scheduleCompile();
  // rerenderChrome rebuilds the whole chrome, which drops the panel's contents
  // and its open state — so restore both, or applying a preset from inside the
  // panel closes the panel and hides the undo it just made available.
  const wasOpen = document.getElementById("styles-panel")?.classList.contains("open");
  rerenderChrome();
  if (wasOpen) {
    renderStylesPanel();
    document.getElementById("styles-panel")?.classList.add("open");
  }
  setStatus(tf("presetApplied", t("skin." + name)), "ok");
}

function undoSkin() {
  if (!undoPreset()) return;
  scheduleCompile();
  const wasOpen = document.getElementById("styles-panel")?.classList.contains("open");
  rerenderChrome();
  if (wasOpen) {
    renderStylesPanel();
    document.getElementById("styles-panel")?.classList.add("open");
  }
}

function toggleNikud() {
  settings.nikud = !settings.nikud;
  saveSettings();
  document.getElementById("nikud-bar")!.classList.toggle("open", settings.nikud);
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

function buildToolbar(): HTMLElement {
  const lang = getLang();
  const byName = (he: string) => runtime.commandsReg.find((c) => c.he === he);
  const b = (he: string, label: string) => {
    const c = byName(he);
    if (!c) return el("span");
    const title = lang === "he" ? c.desc_he : c.desc_en;
    return iconBtn(label, `${title} · #${c.he}`, () => insertSnippet(c.insert));
  };

  return el("div", { class: "toolbar", role: "toolbar", "aria-label": t("toolbar") }, [
    tbGroup(t("cat.style"), [
      b("הדגשה", "B"),
      b("נטוי", "I"),
      b("קו_תחתון", "U"),
      b("קו_חוצה", "S"),
      b("סימון", "🖍"),
    ]),
    tbGroup(t("cat.heading"), [b("כותרת1", "H1"), b("כותרת2", "H2"), b("כותרת3", "H3")]),
    tbGroup(t("cat.list"), [b("רשימה", "•"), b("ממוספרת", "1."), b("טבלה", "▦")]),
    tbGroup(t("cat.footnote"), [b("הערה", "†"), b("הערה_על_הערה", "⁑"), b("הערת_צד", "▣")]),
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
  return lazyMenu("🗂 " + t("documents"), docsMenuItems);
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

function buildInsertMenu(): HTMLElement {
  const lang = getLang();
  const cats: string[] = [];
  for (const c of runtime.commandsReg) if (!cats.includes(c.category)) cats.push(c.category);
  const items: (Node | string)[] = [
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
    el("div", { class: "menu-sep" }),
  ];
  for (const cat of cats) {
    items.push(el("div", { class: "menu-cat" }, [t("cat." + cat)]));
    for (const c of runtime.commandsReg.filter((x) => x.category === cat)) {
      items.push(
        el("button", { class: "menu-item menu-cmd", onClick: () => insertSnippet(c.insert) }, [
          el("b", {}, [lang === "he" ? c.desc_he : c.desc_en]),
          el("code", {}, ["#" + c.he]),
        ]),
      );
    }
  }
  return menu("➕ " + t("insert"), items);
}

function menu(label: string, items: (Node | string)[]): HTMLElement {
  return lazyMenu(label, () => items);
}

/**
 * A menu whose contents are rebuilt every time it opens.
 *
 * The header is rendered once, so a menu built there freezes whatever the data
 * looked like at boot — the document library would still say "Untitled" long
 * after the document had been titled. Building on open keeps it honest.
 */
function lazyMenu(label: string, build: () => (Node | string)[]): HTMLElement {
  const list = el("div", { class: "menu-list", role: "menu", "aria-label": label });
  const btn = el("button", {
    class: "menu-btn",
    type: "button",
    "aria-haspopup": "true",
    "aria-expanded": "false",
    onClick: (e: Event) => {
      e.stopPropagation();
      document.querySelectorAll(".menu-list.open").forEach((m) => {
        if (m !== list) {
          m.classList.remove("open");
          m.previousElementSibling?.setAttribute("aria-expanded", "false");
        }
      });
      if (!list.classList.contains("open")) {
        list.replaceChildren();
        list.append(...build().map((n) => (typeof n === "string" ? document.createTextNode(n) : n)));
      }
      const open = list.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    },
  }, [label]);
  return el("div", { class: "menu" }, [btn, list]);
}

function buildHeader(): HTMLElement {
  const lang = getLang();

  const builtinItems = templatesForMenu().map((tpl) =>
    el("button", { class: "menu-item", onClick: () => loadTemplate(tpl) }, [
      el("b", {}, [lang === "he" ? tpl.he : tpl.en]),
      el("span", { class: "menu-desc" }, [lang === "he" ? tpl.desc_he : tpl.desc_en]),
    ]),
  );
  const users = userTemplates();
  const userItems = users.map((ut) =>
    el("div", { class: "menu-item-row" }, [
      el("button", { class: "menu-item menu-item-main", onClick: () => loadBody(ut.body) }, [
        el("b", {}, ["★ " + ut.name]),
      ]),
      el("button", {
        class: "menu-del",
        title: t("delete"),
        onClick: (e: Event) => {
          e.stopPropagation();
          deleteUserTemplate(ut.id);
        },
      }, ["×"]),
    ]),
  );
  const templatesMenu = menu("📄 " + t("templates"), [
    ...builtinItems,
    ...(users.length ? [el("div", { class: "menu-sep" })] : []),
    ...userItems,
  ]);

  const fileMenu = menu("📁 " + t("file"), [
    el("button", { class: "menu-item", onClick: newDoc }, [t("newDoc")]),
    el("button", { class: "menu-item", onClick: openFile }, [t("open")]),
    el("button", { class: "menu-item", onClick: saveFile }, [t("save")]),
    el("button", { class: "menu-item", onClick: saveFileAs }, [
      files.supportsRealFiles() ? t("saveAs") : t("saveCopy"),
    ]),
    el("button", { class: "menu-item", onClick: saveAsTemplate }, [t("saveAsTemplate")]),
  ]);

  // The Skins menu is gone: presets now live inside the Styles panel, next to
  // the settings they overwrite, where the relationship is visible.

  const exportMenu = menu("⬇ " + t("export"), [
    el("button", { class: "menu-item", onClick: () => void exports.exportPdf() }, [t("exportPdf")]),
    el("button", { class: "menu-item", onClick: () => void exports.exportWord() }, [t("exportWord")]),
    el("button", { class: "menu-item", onClick: () => void exports.copyForWord() }, [t("copyForWord")]),
    el("button", { class: "menu-item", onClick: () => void exports.exportHtml() }, [t("exportHtml")]),
    el("button", { class: "menu-item", onClick: exports.exportMarkdown }, [t("exportMarkdown")]),
    el("button", { class: "menu-item", onClick: exports.exportText }, [t("exportText")]),
    el("button", { class: "menu-item", onClick: () => void exports.exportTypst() }, [t("exportTypst")]),
    el("button", { class: "menu-item", onClick: exports.doPrint }, [t("print")]),
  ]);

  const langToggle = iconBtn(
    lang === "he" ? "EN" : "עב",
    t("language"),
    () => setSetting("lang", lang === "he" ? "en" : "he"),
    "chip",
  );
  const themeToggle = iconBtn(
    settings.theme === "light" ? "🌙" : "☀",
    t("theme"),
    () => setSetting("theme", settings.theme === "light" ? "dark" : "light"),
    "chip",
  );
  const undoBtn = iconBtn("↶", t("sc.undo"), () => undo(runtime.view), "chip");
  const redoBtn = iconBtn("↷", t("sc.redo"), () => redo(runtime.view), "chip");
  const findBtn = iconBtn("🔍", t("find"), () => openSearchPanel(runtime.view), "chip");
  const foldAllBtn = iconBtn("⊟", t("foldAll"), () => foldAll(runtime.view), "chip");
  const unfoldAllBtn = iconBtn("⊞", t("unfoldAll"), () => unfoldAll(runtime.view), "chip");
  const proseToggle = iconBtn(
    settings.prose ? "🅐" : "＃",
    settings.prose ? t("raw") : t("prose"),
    () => setSetting("prose", !settings.prose),
    settings.prose ? "chip active" : "chip",
  );
  const layoutIcons: Record<Layout, string> = { two: "◫", page: "📄", source: "⟨⟩" };
  const layoutToggle = iconBtn(
    layoutIcons[settings.layout],
    `${t("layout")}: ${t("mode." + settings.layout)}`,
    cycleLayout,
    "chip",
  );
  const sideIcons: Record<PreviewSide, string> = { left: "◧", right: "◨", top: "⬒", bottom: "⬓" };
  const side = settings.previewSide || "left";
  const previewSideToggle = iconBtn(
    sideIcons[side],
    `${t("previewSide")}: ${t("side." + side)}`,
    cyclePreviewSide,
    settings.layout === "two" ? "chip" : "chip disabled",
  );
  const outlineBtn = iconBtn(
    "☰",
    t("outline"),
    toggleOutline,
    settings.outline ? "chip active" : "chip",
  );
  const nikudBtn = iconBtn(
    "אָ",
    t("nikud"),
    toggleNikud,
    settings.nikud ? "chip active" : "chip",
  );
  const stylesBtn = iconBtn("🎨", t("stylesTitle"), openStyles, "chip");
  const notesBtn = iconBtn("✻", t("notesChooser"), openNotesChooser, "chip");
  const reviewBtn = iconBtn("✎", t("reviewTitle"), openReview, "chip");
  const historyBtn = iconBtn("🕐", t("history"), openHistory, "chip");
  const settingsBtn = iconBtn("⚙", t("settings"), toggleSettings, "chip");

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
        "aria-label": `${t("rename")}: ${runtime.currentDoc?.title ?? ""}`,
        onClick: renameDoc,
      },
      [
        el("span", { class: "doc-title", id: "doc-title" }, [runtime.currentDoc?.title ?? ""]),
        el("small", { class: "doc-file", id: "doc-file" }, [runtime.currentBinding?.name ?? ""]),
      ],
    ),
    buildToolbar(),
    // The menu bar and the runtime.view chips are navigation, and saying so is what
    // gives a screen-reader user a way to skip past forty-odd controls to the
    // editor. The page had no landmarks at all.
    el("nav", { class: "menubar", "aria-label": t("menubar") }, [
      buildInsertMenu(),
      buildDocsMenu(),
      fileMenu,
      templatesMenu,
      exportMenu,
    ]),
    el("div", { class: "spacer" }),
    el("div", { class: "chipbar", role: "group", "aria-label": t("viewControls") }, [
      undoBtn,
      redoBtn,
      stylesBtn,
      findBtn,
      outlineBtn,
      notesBtn,
      reviewBtn,
      langToggle,
      foldAllBtn,
      unfoldAllBtn,
      proseToggle,
      layoutToggle,
      previewSideToggle,
      themeToggle,
      nikudBtn,
      historyBtn,
      settingsBtn,
    ]),
  ]);
}

// ---------------------------------------------------------------- settings drawer
function numberRow(labelKey: string, key: keyof Settings, min: number, max: number, step: number) {
  const input = el("input", {
    type: "number",
    min,
    max,
    step,
    value: String(settings[key]),
    onChange: (e: Event) => setSetting(key, Number((e.target as HTMLInputElement).value) as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
function checkRow(labelKey: string, key: keyof Settings) {
  const input = el("input", {
    type: "checkbox",
    ...(settings[key] ? { checked: "checked" } : {}),
    onChange: (e: Event) => setSetting(key, (e.target as HTMLInputElement).checked as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
function textRow(labelKey: string, key: keyof Settings, placeholder = "") {
  const input = el("input", {
    type: "text",
    placeholder,
    value: String(settings[key] ?? ""),
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
      value: settings.font,
      onChange: (e: Event) => setSetting("font", (e.target as HTMLInputElement).value as never),
    }),
    fontList,
    el("button", { type: "button", class: "mini", title: t("addFont"), onClick: addFont }, ["+"]),
  ]);
  const dirSel = el(
    "select",
    { onChange: (e: Event) => setSetting("dir", (e.target as HTMLSelectElement).value as never) },
    [
      el("option", { value: "rtl", ...(settings.dir === "rtl" ? { selected: "selected" } : {}) }, [t("rtl")]),
      el("option", { value: "ltr", ...(settings.dir === "ltr" ? { selected: "selected" } : {}) }, [t("ltr")]),
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
      el("option", { value: v, ...(settings.paper === v ? { selected: "selected" } : {}) }, [lbl]),
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
  const shortcutRows = ACTIONS.map((a) => {
    const btn = el("button", { class: "sc-key", type: "button" }, [kb[a.id] || "—"]);
    btn.addEventListener("click", () => captureShortcut(a.id, btn));
    return el("label", { class: "set-row" }, [el("span", {}, [t("sc." + a.id)]), btn]);
  });

  return el("aside", { id: "settings-drawer", class: "drawer", "aria-label": t("settings") }, [
    el("h3", {}, [t("settings")]),
    el("label", { class: "set-row" }, [el("span", {}, [t("font")]), fontSel]),
    numberRow("fontSize", "size_pt", 8, 36, 1),
    numberRow("margin", "margin_cm", 1, 6, 0.5),
    el("label", { class: "set-row" }, [el("span", {}, [t("direction")]), dirSel]),
    el("label", { class: "set-row" }, [el("span", {}, [t("paper")]), paperSel]),
    checkRow("pageNumbers", "numbering"),
    checkRow("hebrewNumbering", "hebrew_numbering"),
    checkRow("justify", "justify"),
    numberRow("lineSpacing", "line_spacing_em", 0.4, 1.5, 0.05),
    numberRow("paraSpacing", "para_spacing_em", 0, 3, 0.1),
    numberRow("firstIndent", "first_line_indent_em", 0, 4, 0.25),
    numberRow("columns", "columns", 1, 3, 1),
    textRow("headerText", "header", ""),
    textRow("footerText", "footer", ""),
    numberRow("zoom", "zoom", 0.5, 2, 0.1),
    checkRow("autocompleteLabel", "autocomplete"),
    checkRow("spellcheckLabel", "spellcheck"),
    el("div", { id: "spell-coverage", class: "set-note" }, [spellCoverageNote()]),
    checkRow("syncScrollLabel", "syncScroll"),
    checkRow("autosaveFileLabel", "autosaveFile"),
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
 * Not decoration and not a nicety. Six fonts are compiled into the engine, so
 * every way Ksav is distributed — the installers, the server binary, and the
 * ~23 MB wasm module the browser build downloads — is a redistribution of them.
 * Both the SIL OFL and the GUST licence require their notice to accompany a
 * redistribution, and a web build has no installer to put a text file beside.
 * So the notice lives where the software is.
 */
const BUNDLED_FONT_NOTICES: { name: string; copyright: string; licence: string; url: string }[] = [
  {
    name: "Frank Ruhl Hofshi",
    copyright: "Copyright 2015 The Frank Ruhl Hofshi Project Authors",
    licence: "SIL Open Font License 1.1",
    url: "https://openfontlicense.org",
  },
  {
    name: "David Libre",
    copyright: "Copyright (c) 2003–2016 The David Libre Project Authors",
    licence: "SIL Open Font License 1.1",
    url: "https://openfontlicense.org",
  },
  {
    name: "Cascadia Mono",
    copyright: "Copyright (c) 2020 Microsoft Corporation",
    licence: "SIL Open Font License 1.1",
    url: "https://github.com/microsoft/cascadia-code",
  },
  {
    name: "New Computer Modern Math",
    copyright: "Copyright (C) 2019–2026 Antonis Tsolomitis",
    licence: "GUST Font License 1.0 (LPPL 1.3c)",
    url: "https://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt",
  },
];

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
const BUNDLED_LEXICON_NOTICES: { name: string; copyright: string; licence: string; url: string }[] = [
  {
    name: "English Speller Database (SCOWL)",
    copyright: "Copyright 2000–2026 Kevin Atkinson; Australian data © 2016 Benjamin Titze",
    licence: "ESDB licence",
    url: "https://wordlist.aspell.net",
  },
  {
    name: "Ksav Hebrew lexicon",
    copyright: "Built from Public Domain texts (Sefaria, Project Ben-Yehuda)",
    licence: "MIT OR Apache-2.0",
    url: "https://github.com/SYKhayyat/ksav",
  },
];

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
    const conflict = ACTIONS.find((a) => a.id !== actionId && kb[a.id] === key);
    let reassigned = false;
    if (conflict) {
      if (!confirm(tf("shortcutConflict", key))) return done(original);
      // Unbind the other so the chord is held by exactly one action.
      settings.keybindings = { ...(settings.keybindings || {}), [conflict.id]: "", [actionId]: key };
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
  document.getElementById("settings-drawer")!.classList.toggle("open");
}

// ---- outline / document map ----
function toggleOutline() {
  settings.outline = !settings.outline;
  saveSettings();
  document.getElementById("outline-drawer")!.classList.toggle("open", settings.outline);
  if (settings.outline) renderOutline();
  rerenderChrome();
}
function renderOutline() {
  const host = document.getElementById("outline-list");
  if (!host || !runtime.view) return;
  const items = outline(runtime.view.state.doc.toString());
  host.innerHTML = "";
  if (!items.length) {
    host.append(el("div", { class: "outline-empty" }, [t("noHeadings")]));
    return;
  }
  const minLevel = Math.min(...items.map((i) => i.level));
  for (const it of items) {
    const row = el(
      "button",
      {
        class: "outline-item",
        style: `padding-inline-start:${8 + (it.level - minLevel) * 14}px`,
        onClick: () => jumpTo(it.from),
      },
      [it.title],
    );
    host.append(row);
  }
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
  const body = runtime.view.state.doc.toString();
  try {
    const stored = await docs.pushSnapshot(runtime.currentDoc.id, body);
    if (!stored && force) {
      // Nothing changed since the last snapshot: the point is already kept.
      setStatus(t("snapshotUnchanged"), "");
    }
    if (document.getElementById("history-modal")?.classList.contains("open")) {
      await renderHistory();
    }
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
  document.getElementById("history-modal")!.classList.add("open");
  void renderHistory();
}
function closeHistory() {
  document.getElementById("history-modal")!.classList.remove("open");
}

async function renderHistory() {
  const host = document.getElementById("history-list");
  if (!host || !runtime.currentDoc) return;
  const list = (await docs.snapshots(runtime.currentDoc.id)).slice().reverse();
  host.innerHTML = "";
  // Say whose history this is: with one list per document, the title is the
  // thing that makes "restore" a safe button to press.
  host.append(el("div", { class: "history-scope" }, [tf("historyOf", runtime.currentDoc.title)]));
  if (!list.length) {
    host.append(el("div", { class: "outline-empty" }, [t("noHistory")]));
    return;
  }
  for (const s of list) {
    const first = (s.body.split("\n").find((l) => l.trim()) || "—").slice(0, 42);
    host.append(
      el("button", { class: "pal-item", onClick: () => void restoreSnapshot(s) }, [
        el("span", { class: "pal-cat" }, [new Date(s.t).toLocaleDateString()]),
        el("b", {}, [first]),
        el("code", {}, [new Date(s.t).toLocaleTimeString()]),
      ]),
    );
  }
}

// ---------------------------------------------------------------- command palette
function openPalette() {
  const overlay = document.getElementById("palette")!;
  overlay.classList.add("open");
  const input = document.getElementById("palette-input") as HTMLInputElement;
  input.value = "";
  renderPaletteList("");
  input.focus();
}
function closePalette() {
  document.getElementById("palette")!.classList.remove("open");
  runtime.view.focus();
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

function renderPaletteList(q: string) {
  const list = document.getElementById("palette-list")!;
  const lang = getLang();
  const query = q.trim().toLowerCase();
  const items = runtime.commandsReg.filter((c) => {
    if (!query) return true;
    return (
      c.he.includes(query) ||
      c.en.toLowerCase().includes(query) ||
      c.desc_he.includes(query) ||
      c.desc_en.toLowerCase().includes(query)
    );
  });
  list.innerHTML = "";
  items.slice(0, 60).forEach((c, i) => {
    const row = el(
      "button",
      {
        class: "pal-item" + (i === 0 ? " sel" : ""),
        // Hover moves the selection so the mouse and the keyboard never
        // disagree about which row Enter would run.
        onMouseEnter: (e: Event) => {
          list.querySelectorAll(".pal-item.sel").forEach((r) => r.classList.remove("sel"));
          (e.currentTarget as HTMLElement).classList.add("sel");
        },
        onClick: () => {
          insertSnippet(c.insert);
          closePalette();
        },
      },
      [
        el("span", { class: "pal-cat" }, [t("cat." + c.category)]),
        el("b", {}, [lang === "he" ? c.desc_he : c.desc_en]),
        el("code", {}, ["#" + c.he + " · " + c.en]),
      ],
    );
    list.append(row);
  });
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
  if (wanted && settings.dir !== wanted) {
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
  list.push({ id: "u" + performance.now().toString(36), name, body: runtime.view.state.doc.toString() });
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
  for (const entry of docs.library()) {
    const other = await files.recallBinding(entry.id);
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
    await openDoc(existing);
    return;
  }
  const stripExt = opened.binding.name.replace(/\.[^.]+$/, "");
  const parsed = docs.parseDoc(opened.text, stripExt || t("untitled"));
  const doc = await docs.createDoc(parsed.title, parsed.body, parsed.assets, parsed.customCommands);
  await docs.setFileName(doc.id, opened.binding.name);
  await files.rememberBinding(doc.id, opened.binding);
  await openDoc(doc.id);
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
    let written = false;
    try {
      written = await files.saveTo(runtime.currentBinding, text);
    } catch (e) {
      setStatus(`${t("saveFailed")} — ${String(e)}`, "err");
      return;
    }
    if (written) {
      save.markFileSaved();
      setStatus(tf("savedTo", runtime.currentBinding.name), "ok");
      return;
    }
    // The binding no longer authorises a write — a desktop path from a previous
    // session, or a handle whose permission lapsed. Ask where to put it.
  }
  await saveFileAs();
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

function tableToolbar(): HTMLElement {
  return el("div", { id: "table-bar", class: "table-bar" });
}

/** Show or hide the table bar for wherever the cursor currently is. */
function updateTableBar() {
  const bar = document.getElementById("table-bar");
  if (!bar || !runtime.view) return;
  const doc = runtime.view.state.doc.toString();
  const pos = runtime.view.state.selection.main.head;
  // Named `tbl`, not `t`: `t` is the translation function, and shadowing it here
  // makes every label in this toolbar a compile error.
  const tbl = tables.tableAt(doc, pos);
  if (!tbl) {
    bar.classList.remove("open");
    bar.replaceChildren();
    return;
  }
  const idx = tables.cellIndexAt(tbl, pos);
  // With the cursor between cells, act on the last row/column rather than
  // refusing: "add a row" should always mean something inside a table.
  const row = idx == null ? tables.rowCount(tbl) - 1 : tables.rowOf(tbl, idx);
  const col = idx == null ? tbl.cols - 1 : tables.colOf(tbl, idx);

  const apply = (next: string) => {
    if (next === doc) return;
    runtime.view.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
    scheduleCompile();
    // The bar is rebuilt from the new document on the next selection update.
    requestAnimationFrame(updateTableBar);
  };

  const act = (label: string, title: string, run: () => string) =>
    el("button", { class: "tb-btn", title, onClick: () => apply(run()) }, [label]);

  bar.replaceChildren(
    el("span", { class: "table-bar-label" }, [
      tf("tableAt", String(row + 1), String(col + 1), String(tables.rowCount(tbl)), String(tbl.cols)),
    ]),
    act("↑+", t("insertRowAbove"), () => tables.insertRow(doc, tbl, row - 1)),
    act("↓+", t("insertRowBelow"), () => tables.insertRow(doc, tbl, row)),
    act("⊖", t("deleteRow"), () => tables.deleteRow(doc, tbl, row)),
    el("span", { class: "tb-sep" }),
    act("→+", t("insertColAfter"), () => tables.insertColumn(doc, tbl, col)),
    act("+←", t("insertColBefore"), () => tables.insertColumn(doc, tbl, col - 1)),
    act("⊗", t("deleteCol"), () => tables.deleteColumn(doc, tbl, col)),
    el("span", { class: "tb-sep" }),
    act("H", t("toggleHeaderRow"), () => tables.toggleHeaderRow(doc, tbl, row)),
  );
  bar.classList.add("open");
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
  renderStylesPanel();
  document.getElementById("styles-panel")!.classList.add("open");
}

function closeStyles() {
  document.getElementById("styles-panel")!.classList.remove("open");
}

/** Read the document's current value for one styling argument. */
function styleArg(kind: styles.StyleCommand, key: string): string | undefined {
  const call = styles.findStyleCall(runtime.view.state.doc.toString(), kind);
  return call?.args.get(key);
}

/** Write styling arguments into the document, replacing the existing call.
 *
 *  A styling command the document does not have yet is written in the language
 *  the document is being set in, so clicking a control in an English document
 *  does not drop a Hebrew command into it. An existing call keeps whatever
 *  language it was already written in. */
function setStyleArgs(kind: styles.StyleCommand, changes: Record<string, string | null>) {
  const doc = runtime.view.state.doc.toString();
  const next = styles.setStyleArgs(doc, kind, changes, settings.dir === "ltr" ? "en" : "he");
  if (next === doc) return;
  runtime.view.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
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
    el("div", { class: "styles-head" }, [
      el("h2", {}, [t("stylesTitle")]),
      el("button", { class: "styles-close", title: t("close"), onClick: closeStyles }, ["×"]),
    ]),
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
    el("div", { class: "styles-head" }, [
      el("h2", {}, [title]),
      el("button", { class: "styles-close", title: t("close"), onClick: closeModal }, ["×"]),
    ]),
    el("p", { class: "styles-lede" }, [lede]),
    ...rows,
    el("div", { class: "modal-actions" }, [
      el("button", { class: "note-use", onClick: () => { const f = modalOk; closeModal(); f?.(); } }, [
        t("insertAction"),
      ]),
      el("button", { class: "sc-key", onClick: closeModal }, [t("cancel")]),
    ]),
  );
  document.getElementById("form-modal")!.classList.add("open");
}

function closeModal() {
  modalOk = null;
  document.getElementById("form-modal")!.classList.remove("open");
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
  return document.getElementById("review-panel")?.classList.contains("open") ?? false;
}

function openReview() {
  closeMenus();
  renderReviewPanel();
  document.getElementById("review-panel")!.classList.add("open");
}

function closeReview() {
  document.getElementById("review-panel")!.classList.remove("open");
}

/** Replace the whole document text (a decision rewrites the source). */
function replaceDoc(next: string) {
  const doc = runtime.view.state.doc.toString();
  if (next === doc) return;
  runtime.view.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
  scheduleCompile();
  renderReviewPanel();
}

function decideMark(mark: review.ReviewMark, decision: review.Decision) {
  replaceDoc(review.decide(runtime.view.state.doc.toString(), mark, decision));
}

function decideEverything(decision: review.Decision) {
  if (!confirm(t(decision === "accept" ? "confirmAcceptAll" : "confirmRejectAll"))) return;
  replaceDoc(review.decideAll(runtime.view.state.doc.toString(), decision));
}

/** Which review runtime.view the document currently reads in. */
function reviewView(): review.ReviewView {
  const raw = styles.findStyleCall(runtime.view.state.doc.toString(), "review")?.args.get("תצוגה");
  return review.viewFromValue(styles.readString(raw));
}

function setReviewView(v: review.ReviewView) {
  const doc = runtime.view.state.doc.toString();
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
  const doc = runtime.view.state.doc.toString();
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
    el("div", { class: "styles-head" }, [
      el("h2", {}, [t("reviewTitle")]),
      el("button", { class: "styles-close", title: t("close"), onClick: closeReview }, ["×"]),
    ]),
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
  const overlay = document.getElementById("notes-chooser")!;
  renderNotesChooser();
  overlay.classList.add("open");
}

function closeNotesChooser() {
  document.getElementById("notes-chooser")!.classList.remove("open");
  runtime.view.focus();
}

function chooseNote(choice: NoteChoice, which: "primary" | "secondary") {
  const from = runtime.view.state.selection.main.from;
  const { text, caret } = applyChoice(runtime.view.state.doc.toString(), from, choice, which);
  runtime.view.dispatch({
    changes: { from: 0, to: runtime.view.state.doc.length, insert: text },
    selection: { anchor: caret },
  });
  closeNotesChooser();
  scheduleCompile();
}

function noteCard(c: NoteChoice): HTMLElement {
  const he = getLang() === "he";
  const note = he ? c.noteHe : c.noteEn;
  return el("div", { class: "note-card" }, [
    el("div", { class: "note-sketch" }, [c.sketch.join("\n")]),
    el("div", { class: "note-body" }, [
      el("b", {}, [he ? c.he : c.en]),
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

function renderNotesChooser() {
  const box = document.getElementById("notes-chooser-body")!;
  box.replaceChildren(
    el("h2", {}, [t("notesChooserTitle")]),
    el("p", { class: "notes-lede" }, [t("notesChooserLede")]),
    el("h3", {}, [t("notesOneLayer")]),
    el("div", { class: "note-grid" }, NOTE_CHOICES.filter((c) => c.layers === "one").map(noteCard)),
    el("h3", {}, [t("notesTwoLayers")]),
    el("div", { class: "note-grid" }, NOTE_CHOICES.filter((c) => c.layers === "two").map(noteCard)),
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
function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings[key] = value;
  saveSettings();
  if (key === "lang") {
    setLang(value as Lang);
    swapUntouchedStarter();
    rerenderChrome();
  } else if (key === "theme") {
    applyTheme();
    runtime.view.dispatch({ effects: themeCompartment.reconfigure(editorTheme(settings.theme === "dark")) });
  } else if (key === "prose") {
    runtime.view.dispatch({ effects: proseCompartment.reconfigure(settings.prose ? proseMode : []) });
    rerenderChrome();
  } else if (key === "layout") {
    applyLayout();
    rerenderChrome();
  } else if (key === "dir") {
    runtime.view.dispatch({ effects: dirCompartment.reconfigure(EditorView.contentAttributes.of({ dir: settings.dir })) });
    scheduleCompile();
  } else if (key === "zoom") {
    applyZoom();
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
  const body = document.getElementById("preview-modal-body")!;
  body.innerHTML = document.getElementById("preview")!.innerHTML;
  document.getElementById("preview-modal")!.classList.add("open");
}
function closePreviewOverlay() {
  document.getElementById("preview-modal")!.classList.remove("open");
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
  const drawerOpen = document.getElementById("settings-drawer")?.classList.contains("open");
  const newDrawer = buildSettingsDrawer();
  if (drawerOpen) newDrawer.classList.add("open");
  document.getElementById("settings-drawer")!.replaceWith(newDrawer);
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
      el("h3", {}, [t("outline")]),
      el("div", { id: "outline-list" }),
    ]),
    tableToolbar(),
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
    el("div", { id: "form-modal", class: "overlay", onClick: (e: Event) => {
      if ((e.target as HTMLElement).id === "form-modal") closeModal();
    } }, [el("div", { class: "palette-box form-modal-box" }, [el("div", { id: "form-modal-body" })])]),
    // notes chooser overlay
    el("div", { id: "notes-chooser", class: "overlay", onClick: (e: Event) => {
      if ((e.target as HTMLElement).id === "notes-chooser") closeNotesChooser();
    } }, [el("div", { class: "notes-chooser-box" }, [el("div", { id: "notes-chooser-body" })])]),
    // command palette overlay
    el("div", { id: "palette", class: "overlay", onClick: (e: Event) => {
      if ((e.target as HTMLElement).id === "palette") closePalette();
    } }, [
      el("div", { class: "palette-box" }, [
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
    ]),
    // floating preview (page mode): a button + a modal showing the rendered pages
    el("button", {
      id: "float-preview-btn",
      class: "float-preview-btn",
      title: t("preview"),
      onClick: openPreviewOverlay,
    }, ["📄"]),
    el("div", { id: "preview-modal", class: "overlay", onClick: (e: Event) => {
      if ((e.target as HTMLElement).id === "preview-modal") closePreviewOverlay();
    } }, [el("div", { class: "preview-modal-box" }, [el("div", { id: "preview-modal-body" })])]),
    // version history modal
    el("div", { id: "history-modal", class: "overlay", onClick: (e: Event) => {
      if ((e.target as HTMLElement).id === "history-modal") closeHistory();
    } }, [
      el("div", { class: "palette-box" }, [
        el("div", { class: "history-head" }, [
          el("b", {}, [t("history")]),
          el("button", { class: "sc-key", onClick: () => void takeSnapshot(true) }, [
            t("snapshotNow"),
          ]),
        ]),
        el("div", { id: "history-list" }),
      ]),
    ]),
  );

  runtime.setView(makeEditor());
  wireSyncScroll();
  wireSplitter();
  applyTheme();
  applyLayout();
  applyPreviewSide();
  applyUiDir();
  applyZoom();
  updateCounts();
  if (settings.nikud) document.getElementById("nikud-bar")!.classList.add("open");
  if (settings.outline) {
    document.getElementById("outline-drawer")!.classList.add("open");
    renderOutline();
  }
}

// global keys: Ctrl/Cmd+K palette; Alt reveals raw markup in prose mode
function wireKeys() {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") {
      // Cite on selection (spec.md §10.4).
      e.preventDefault();
      void askForMekor();
    } else if (e.key === "Escape") {
      closeMekoros();
      closePalette();
      closePreviewOverlay();
      closeHistory();
      closeNotesChooser();
      closeSpellMenu();
      closeStyles();
      closeReview();
      closeModal();
    } else if (e.key === "Alt" && settings.prose) {
      runtime.view.dispatch({ effects: setRevealAll.of(true) });
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && settings.prose) runtime.view.dispatch({ effects: setRevealAll.of(false) });
  });
  window.addEventListener("click", (e) => {
    closeMenus();
    if (!(e.target as HTMLElement).closest(".spell-menu")) closeSpellMenu();
  });
}

// First-run welcome: shown once, offers a template or a blank start.
function maybeOnboard() {
  if (localStorage.getItem("ksav.onboarded")) return;
  const lang = getLang();
  const overlay = el("div", { id: "welcome", class: "overlay open" }, [
    el("div", { class: "palette-box welcome-box" }, [
      el("h2", {}, [t("welcomeTitle")]),
      el("p", {}, [t("welcomeBody")]),
      el(
        "div",
        { class: "welcome-templates" },
        templatesForMenu()
          .slice(0, 6)
          .map((tpl) =>
            el("button", { class: "welcome-tpl", onClick: () => { loadTemplate(tpl); dismissOnboard(); } }, [
              lang === "he" ? tpl.he : tpl.en,
            ]),
          ),
      ),
      el("button", { class: "welcome-start", onClick: dismissOnboard }, [t("welcomeStart")]),
    ]),
  ]);
  document.getElementById("app")!.append(overlay);
}
function dismissOnboard() {
  localStorage.setItem("ksav.onboarded", "1");
  document.getElementById("welcome")?.remove();
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
function installHooks() {
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
    clearChromeNotice();
    rerenderChrome();
    maybeOnboard();
    return true;
  } catch {
    return false;
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
    settings.dir = "ltr";
    saveSettings();
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
  const waiting = await runtime.backend?.inbox().catch(() => []);
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

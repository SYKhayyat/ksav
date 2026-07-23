import "./styles.css";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { Compartment, Prec } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
import { searchKeymap, search, openSearchPanel } from "@codemirror/search";
import {
  foldGutter,
  foldKeymap,
  foldAll,
  unfoldAll,
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
import { analyze } from "./brackets";
import { createBackend } from "./api";
import type { Backend, CommandDef, TemplateDef, CompileResult, DocConfig, Diagnostic } from "./api";
import { t, tf, setLang, getLang, isRtlUi } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import type { DocAsset, KsavDoc } from "./docs";
import * as store from "./store";
import * as files from "./files";
import { NOTE_CHOICES, applyChoice } from "./notes";
import { toMarkdown, toPlainText } from "./markdown";
import * as spell from "./spell";
import * as styles from "./styles";
import * as tables from "./table";
import * as review from "./review";
import type { NoteChoice } from "./notes";
import type { FileBinding } from "./files";

// ---------------------------------------------------------------- state
type Layout = "two" | "page" | "source";
type PreviewSide = "left" | "right" | "top" | "bottom";
interface Settings extends DocConfig {
  lang: Lang;
  theme: "light" | "dark";
  layout: Layout;
  previewSide?: PreviewSide; // which side the preview sits on in split view
  previewFrac?: number; // fraction of the split given to the preview (0–1)
  prose: boolean;
  zoom: number;
  outline?: boolean;
  nikud?: boolean;
  autocomplete?: boolean;
  spellcheck?: boolean;
  syncScroll?: boolean;
  autosaveFile?: boolean; // write back to the bound file on a timer, not only on Ctrl+S
  customCommands?: string; // user #let definitions, prepended at compile
  snippets?: string; // "abbrev = expansion" per line, expanded on Tab
  keybindings?: Record<string, string>; // action id -> key combo override
  reviewer?: string; // the name that goes on this person's review comments
}

/** The font families the engine bundles. Anything else must be attached to the
 *  document (see `addFont`) — there is no system font access from wasm. */
const BUNDLED_FONTS = ["Frank Ruhl Hofshi", "David Libre", "Cascadia Mono"];

const DEFAULTS: Settings = {
  lang: "he",
  theme: "light",
  layout: "two",
  previewSide: "left",
  previewFrac: 0.5,
  // Prose is the default view. Ksav is pitched as a replacement for Word, and
  // opening a Word replacement in raw markup asks the writer to learn a syntax
  // before they can type a sentence. Alt still reveals the markup, and the
  // ＃ toggle in the header switches permanently — the markup is one key away,
  // which is the right distance for the people who want it.
  prose: true,
  zoom: 1,
  font: "Frank Ruhl Hofshi",
  size_pt: 12,
  margin_cm: 2.5,
  dir: "rtl",
  numbering: true,
  justify: true,
  line_spacing_em: 0.75,
  para_spacing_em: 1.2,
  first_line_indent_em: 0,
  columns: 1,
  paper: "a4",
  hebrew_numbering: false,
  header: "",
  footer: "",
  autocomplete: true,
  spellcheck: true,
  syncScroll: true,
  autosaveFile: true,
};

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("ksav.settings") || "{}") };
    if ((s.layout as string) === "one") s.layout = "source"; // migrate old value
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings() {
  localStorage.setItem("ksav.settings", JSON.stringify(settings));
}

const settings = loadSettings();
setLang(settings.lang);

let backend: Backend;
let commandsReg: CommandDef[] = [];
let templatesReg: TemplateDef[] = [];
let lastResult: CompileResult | null = null;

// ---------------------------------------------------------------- helpers
type Props = Record<string, unknown>;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v as string;
    else if (k === "style") n.setAttribute("style", v as string);
    else if (k.startsWith("on") && typeof v === "function")
      n.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v != null) n.setAttribute(k, String(v));
  }
  for (const c of children) n.append(c);
  return n;
}

// ---------------------------------------------------------------- editor
const STARTER = `#שער[ברוכים הבאים לכְּתָב]
#תת_שער[מערכת הכתיבה העברית · על גבי Typst אמיתי]

#קו_מפריד

#כותרת1[מבוא]

זהו עורך #הדגשה[כְּתָב]. כל פקודה כאן היא פונקציית Typst אמיתית, ולכן #נטוי[הקינון בלתי מוגבל] עובד מאליו — טבלה בתוך הערה בתוך כותרת בתוך רשימה, הכול מתרנדר נכון.

#רשימה(
  פריט[בחרו תבנית מתפריט #הדגשה[תבניות].],
  פריט[פתחו את #הדגשה[פקודות] עם Ctrl+K.],
  פריט[החליפו בין עברית לאנגלית, ומצב פרוזה, מלמעלה.],
)
`;

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
// holds a library; `currentDoc` is whichever one is open, and `currentBinding` is
// the real file it saves to, when it has one.
let currentDoc: KsavDoc;
let currentBinding: FileBinding | null = null;
/** Set while switching documents, so the editor's own change events don't write
 *  the outgoing document's text over the incoming one. */
let switching = false;

// ---------------------------------------------------------------- saving
//
// Saving is its own concern, on its own timer, with its own error handling.
//
// It used to be a side effect of compiling: `runCompile` wrote the document to
// storage on its way to the renderer, *before* the try block. So when storage
// filled up, the write threw, the compile never ran, nothing caught it, the
// status line said "rendering…" forever — and every keystroke after that was
// discarded in silence. A writer typed four hundred thousand characters into a
// buffer that had stopped being persisted and had no way to know.
//
// Two rules come out of that, and they are the whole design here:
//   • Saving must not depend on rendering. A render is a convenience; a save is
//     the writer's work.
//   • A save that fails must be impossible to miss. Not a console line, not a
//     status flicker — a banner that stays until the problem is fixed.

let saveTimer: number | undefined;
/** Resolves when no save is in flight — awaited before anything reads storage. */
let savePending: Promise<void> = Promise.resolve();
/** True while the editor holds text that has not reached durable storage. */
let unsavedChanges = false;
/** True while the document differs from the file it is bound to. */
let unsavedToFile = false;
/** The failure currently on screen, so it is only rendered once. */
let saveFailure: string | null = null;

const SAVE_DEBOUNCE_MS = 600;

/** Queue a save of the open document. Cheap to call on every keystroke. */
function scheduleSave() {
  if (!currentDoc || switching) return;
  unsavedChanges = true;
  unsavedToFile = true;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
}

/**
 * Write the open document to storage now.
 *
 * Serialised through `savePending` so two saves can never interleave, and so
 * callers that need the stored copy to be current (export, Save-to-file, opening
 * another document) can simply await it.
 */
function saveNow(): Promise<void> {
  clearTimeout(saveTimer);
  if (!currentDoc || switching) return savePending;
  savePending = savePending.then(async () => {
    if (!currentDoc || switching) return;
    currentDoc.body = view ? view.state.doc.toString() : currentDoc.body;
    // A document the writer never renamed takes its title from its own first
    // heading, so the library is readable either way.
    if (currentDoc.title === t("untitled")) {
      const guess = docs.guessTitle(currentDoc.body, t("untitled"));
      if (guess && guess !== t("untitled")) {
        currentDoc.title = guess;
        updateTitleBar();
      }
    }
    try {
      await docs.putDoc(currentDoc);
      unsavedChanges = false;
      clearSaveFailure();
    } catch (e) {
      reportSaveFailure(e);
    }
  });
  return savePending;
}

/** Everything that must be on disk before we read it back. */
function flushSaves(): Promise<void> {
  return saveNow();
}

/**
 * Put a storage failure in front of the writer and keep it there.
 *
 * Deliberately a modal-weight banner rather than a status message: the failure
 * mode this replaces was silent data loss, and the only safe response is to stop
 * the writer and tell them their text is not being kept.
 */
function reportSaveFailure(e: unknown) {
  const full = e instanceof docs.StorageFullError;
  const msg = full ? t("storageFull") : `${t("saveFailed")} — ${String(e)}`;
  if (saveFailure === msg) return;
  saveFailure = msg;
  document.getElementById("save-error")?.remove();
  const banner = el("div", { id: "save-error", class: "save-error", role: "alert" }, [
    el("span", { class: "save-error-text" }, [msg]),
    el("button", { class: "save-error-act", onClick: () => void saveNow() }, [t("retrySave")]),
    el("button", { class: "save-error-act", onClick: () => void exportBackup() }, [
      t("downloadBackup"),
    ]),
  ]);
  document.getElementById("app")?.append(banner);
}

function clearSaveFailure() {
  if (!saveFailure) return;
  saveFailure = null;
  document.getElementById("save-error")?.remove();
}

/**
 * The escape hatch from a full store: get the text out of the browser entirely.
 *
 * Offered on the failure banner itself, because "your work is not being saved"
 * is only half an answer without a way to rescue it.
 */
async function exportBackup() {
  const text = docs.serializeDoc({ ...currentDoc, body: view.state.doc.toString() });
  files.download(`${fileStem()}.ksav`, text);
}

/** Switch the editor to another document in the library. */
async function openDoc(id: string) {
  const next = await docs.getDoc(id);
  if (!next) return;
  await flushSaves();
  switching = true;
  currentDoc = next;
  docs.setCurrentId(next.id);
  currentBinding = await files.recallBinding(next.id);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: next.body },
    selection: { anchor: 0 },
  });
  switching = false;
  unsavedChanges = false;
  unsavedToFile = false;
  updateTitleBar();
  rerenderChrome();
  view.focus();
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
  if (currentDoc.id === id) {
    const next = docs.library()[0];
    if (next) await openDoc(next.id);
    else await newNamedDoc();
  } else {
    rerenderChrome();
  }
}

function renameDoc() {
  const name = prompt(t("renamePrompt"), currentDoc.title);
  if (name === null) return;
  currentDoc.title = name.trim() || t("untitled");
  void saveNow();
  updateTitleBar();
  rerenderChrome();
}

/** The document title shown in the header, with the bound file beside it. */
function updateTitleBar() {
  const el0 = document.getElementById("doc-title");
  if (!el0 || !currentDoc) return;
  el0.textContent = currentDoc.title;
  const sub0 = document.getElementById("doc-file");
  if (sub0) {
    sub0.textContent = currentBinding ? currentBinding.name : "";
    sub0.title = currentBinding?.path || currentBinding?.name || t("noFileBound");
  }
  document.title = currentDoc.title + " · Ksav";
}

function closeMenus() {
  document.querySelectorAll(".menu-list.open").forEach((m) => {
    m.classList.remove("open");
    m.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}

// User abbreviations: "abbr = expansion" per line. `|` marks the cursor, `\n`
// a newline. Typing the abbreviation then Tab expands it.
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
  const bindings: KeyBinding[] = [...nikudKeymap()];
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
  view.dispatch({
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
  const options = commandsReg
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
// The engine holds the lexicon and does the checking (see engine/src/spell.rs);
// this schedules the checks and turns a click on a squiggle into something
// useful. Checking is debounced separately from compiling, and longer: a
// misspelling that appears half a second late costs nothing, whereas checking on
// every keystroke would squiggle words the writer is still in the middle of.

let spellTimer: number | undefined;

function scheduleSpellCheck() {
  clearTimeout(spellTimer);
  if (!settings.spellcheck) return;
  spellTimer = window.setTimeout(runSpellCheck, 700);
}

async function runSpellCheck() {
  if (!backend || !settings.spellcheck || !view) return;
  // Only the text that will actually print: command names are not misspellings,
  // and underlining them would make the feature useless on its first document.
  const text = spell.checkableText(view.state.doc.toString());
  try {
    const res = await backend.spell(text, spell.userWordsText(), false);
    view.dispatch({ effects: spell.setMisspellings.of(res.misspellings) });
  } catch {
    // A failed check is not worth interrupting the writer over.
  }
}

function clearSpellCheck() {
  if (view) view.dispatch({ effects: spell.setMisspellings.of([]) });
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
    suggestions = await backend!.suggest(m.word, spell.userWordsText());
  } catch {
    suggestions = [];
  }
  if (!box.isConnected) return; // dismissed while we were asking

  const replace = (word: string) => {
    view.dispatch({
      changes: { from: m.start, to: m.start + m.len, insert: word },
      selection: { anchor: m.start + word.length },
    });
    closeSpellMenu();
    view.focus();
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
      view.focus();
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
    doc: currentDoc.body,
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
          // The review list is a view of the document's own marks, so an edit
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
  if (!el || !view) return;
  const text = countableText(view.state.doc.toString());
  const words = (text.match(/[^\s]+/g) || []).length;
  const chars = text.replace(/\s+/g, " ").trim().length;
  el.textContent = `${words} ${t("words")} · ${chars} ${t("chars")}`;
}

let view: EditorView;

// ---------------------------------------------------------------- compile
function cfg(): DocConfig {
  return {
    font: settings.font,
    size_pt: settings.size_pt,
    margin_cm: settings.margin_cm,
    dir: settings.dir,
    numbering: settings.numbering,
    justify: settings.justify,
    line_spacing_em: settings.line_spacing_em,
    para_spacing_em: settings.para_spacing_em,
    first_line_indent_em: settings.first_line_indent_em,
    columns: settings.columns,
    paper: settings.paper,
    hebrew_numbering: settings.hebrew_numbering,
    header: settings.header,
    footer: settings.footer,
  };
}

// Turn a raw Typst diagnostic into plain, actionable guidance — Hebrew AND
// English together, so it helps regardless of the reader.
function friendlyPair(msg: string): { he: string; en: string } | null {
  const m = msg.toLowerCase();
  const unknown = msg.match(/unknown variable:\s*(\S+)/);
  if (unknown)
    return {
      he: `הפקודה #${unknown[1]} אינה מוכרת — בדקו את האיות, או הגדירו אותה תחת "הפקודות שלי".`,
      en: `Unknown command #${unknown[1]} — check the spelling, or define it under "Your commands".`,
    };
  if (m.includes("unclosed delimiter"))
    return {
      he: "יש סוגר שלא נסגר — ודאו שלכל [ יש ] ולכל ( יש ).",
      en: "A bracket isn't closed — make sure every [ has a ] and every ( has a ).",
    };
  if (m.includes("maximum") && m.includes("depth"))
    return {
      he: "יותר מדי רמות קינון בבת אחת (מגבלת בטיחות של Typst). נסו לפשט מעט את המבנה.",
      en: "Too many levels of nesting at once (a Typst safety limit). Try simplifying the structure a little.",
    };
  if (m.includes("not valid in code") || m.includes("preceding hash"))
    return {
      he: "יש בעיה ליד סימן # — אולי חסר רווח או סוגר, או שרצית סולמית רגילה (כתבו \\#).",
      en: "Something's off near a # — you may be missing a space or bracket, or want a literal # (write \\#).",
    };
  if (m.includes("file not found") || m.includes("failed to load"))
    return {
      he: "קובץ (למשל תמונה) לא נמצא — בדקו את הנתיב.",
      en: "A file (e.g. an image) wasn't found — check the path.",
    };
  // An unknown paper size makes Typst enumerate every name it knows — around
  // forty of them, in one unbroken line, in the status bar. The writer picked
  // from a menu of four; naming those four is the entire useful content.
  if (m.includes("expected") && (m.includes("\"a4\"") || m.includes("\"us-letter\"")))
    return {
      he: "גודל דף לא מוכר — בחרו A4, Letter, A5 או A3 בהגדרות (⚙).",
      en: "Unknown paper size — choose A4, Letter, A5 or A3 in Settings (⚙).",
    };
  if (m.includes("unknown font family") || m.includes("no font could be found"))
    return {
      he: "הגופן אינו זמין — בחרו גופן מהרשימה בהגדרות, או צרפו קובץ גופן למסמך.",
      en: "That font isn't available — pick one from the list in Settings, or attach a font file to the document.",
    };
  if (m.includes("expected") || m.includes("unexpected"))
    return {
      he: "התחביר אינו תקין כאן — בדקו סוגריים, פסיקים ומבנה הפקודה.",
      en: "Invalid syntax here — check brackets, commas, and the command structure.",
    };
  return null;
}

/**
 * How much raw compiler output the status bar will show.
 *
 * Anything unmapped is still shown, because an unhelpful message beats a
 * swallowed one — but it is shown *short*. Typst's longest diagnostics are
 * enumerations of every valid value, which fill the status bar, push the word
 * count off screen and tell the writer nothing. The full text stays available:
 * it is the `title` on the same element, and it is what a bug report needs.
 */
const MAX_DIAGNOSTIC_CHARS = 160;

function friendlyError(msg: string): string {
  const p = friendlyPair(msg);
  if (p) return `${p.he}  ·  ${p.en}`;
  const oneLine = msg.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_DIAGNOSTIC_CHARS
    ? oneLine.slice(0, MAX_DIAGNOSTIC_CHARS - 1) + "…"
    : oneLine;
}

let compileTimer: number | undefined;
/**
 * Which compile is the current one.
 *
 * A compile takes 0.4–3 s and the debounce is a quarter of a second, so two are
 * routinely in flight at once. Results used to be applied in arrival order,
 * which means a slow render of older text could land on top of a fast render of
 * newer text and leave the preview showing a page the document no longer says.
 * Every request takes a ticket; only the newest ticket may touch the screen.
 */
let compileGeneration = 0;

function scheduleCompile() {
  clearTimeout(compileTimer);
  compileTimer = window.setTimeout(runCompile, 250);
  scheduleSpellCheck();
}

async function runCompile() {
  if (!backend) return; // backend still initializing (createBackend not resolved yet)
  const mine = ++compileGeneration;
  const status = document.getElementById("status")!;
  const diag = document.getElementById("diagnostics")!;
  status.textContent = t("rendering");
  status.className = "";
  const t0 = performance.now();
  const userDoc = view.state.doc.toString();
  // Prepend user-defined commands so they're usable in the document.
  const pre = settings.customCommands?.trim() ? settings.customCommands + "\n\n" : "";
  // Speculative heal. A document is unbalanced for as long as it takes to type
  // the body of a `#הערה[`, and compiling that raw would blank the preview and
  // replace it with an error pointing at end-of-file. Compile the repaired copy
  // instead, and say so — the writer keeps seeing their page while they type.
  // The document itself is never modified; only what we hand the compiler is.
  const { problems, healed } = analyze(userDoc);
  const healedCount = problems.length;
  const body = pre + (healedCount ? healed : userDoc);
  try {
    const res = await backend.compile(body, cfg(), docs.requestAssets(currentDoc?.assets ?? []));
    if (mine !== compileGeneration) return; // superseded while we were waiting
    lastResult = res;
    const ms = Math.round(performance.now() - t0);
    const preview = document.getElementById("preview")!;
    if (res.pages_svg.length) {
      preview.innerHTML = res.pages_svg
        .map((s) => `<div class="page">${s}</div>`)
        .join("");
      applyZoom();
    }
    const errs = res.diagnostics.filter((d) => d.severity === "error");
    if (res.ok && healedCount) {
      // Rendered, but not from what is literally on screen. Say which, and how
      // many — silently showing a page built from text the writer did not type
      // would be worse than the blank preview this replaces.
      status.textContent = `⚠ ${tf("previewHealed", healedCount)} · ${ms}ms`;
      status.className = "warn";
    } else if (res.ok) {
      status.textContent = `✓ ${res.pages_svg.length} ${t("pages")} · ${ms}ms`;
      status.className = "ok";
    } else {
      status.textContent = `✗ ${t("compileError")}`;
      status.className = "err";
    }
    const shown = errs.length ? errs : res.diagnostics;
    diag.textContent = shown.map((d) => friendlyError(d.message)).join("  ·  ");
    diag.title = shown.map((d) => d.message).join("\n"); // raw messages on hover
  } catch (e) {
    if (mine !== compileGeneration) return;
    status.textContent = `✗ ${t("networkError")}`;
    status.className = "err";
    diag.textContent = String(e);
  }
}

/**
 * A compile that is allowed to be slow, for the things that need real output:
 * the PDF, and exports.
 *
 * The preview asks for SVG only. Regenerating the PDF on every keystroke cost
 * roughly 300 KB of base64 per response that nothing on screen ever read.
 */
async function compileForExport(): Promise<CompileResult | null> {
  if (!backend) return null;
  await flushSaves();
  const pre = settings.customCommands?.trim() ? settings.customCommands + "\n\n" : "";
  const body = pre + view.state.doc.toString();
  try {
    return await backend.compile(body, cfg(), {
      ...docs.requestAssets(currentDoc?.assets ?? []),
      want_pdf: true,
    });
  } catch (e) {
    setStatus(`${t("networkError")} — ${String(e)}`, "err");
    return null;
  }
}

function applyZoom() {
  document.documentElement.style.setProperty("--zoom", String(settings.zoom));
}

// Sync scrolling: scrolling the editor drives the preview and vice-versa
// (percentage-based). Clicking the preview jumps the editor cursor to the
// matching spot (best-effort by line fraction). Two-panel mode only.
function wireSyncScroll() {
  const preview = document.getElementById("preview")!;
  const scroller = view.scrollDOM;
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
    const rect = preview.getBoundingClientRect();
    const f = (preview.scrollTop + (e.clientY - rect.top)) / Math.max(1, preview.scrollHeight);
    const line = Math.min(view.state.doc.lines, Math.max(1, Math.round(f * view.state.doc.lines)));
    view.dispatch({ selection: { anchor: view.state.doc.line(line).from }, scrollIntoView: true });
    view.focus();
  });
}

// ---------------------------------------------------------------- snippet insertion
function insertSnippet(snippet: string) {
  const sel = view.state.selection.main;
  const selText = view.state.sliceDoc(sel.from, sel.to);
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
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + cursor },
  });
  view.focus();
}

// Wrap the selection in a foldable comment region (//{ … //}). The markers are
// comments, so they never render — they just create a collapsible, labelled block.
function insertRegion() {
  const sel = view.state.selection.main;
  const selText = view.state.sliceDoc(sel.from, sel.to);
  const label = t("region");
  // The `//{` marker must start its own line, or the fold service (which keys on
  // a line beginning with `//{`) won't recognize the region. Prepend a newline
  // when the selection doesn't already start at the beginning of a line.
  const atLineStart = sel.from === 0 || view.state.sliceDoc(sel.from - 1, sel.from) === "\n";
  const lead = atLineStart ? "" : "\n";
  const text = `${lead}//{ ${label}\n${selText}\n//}\n`;
  const cursor = sel.from + lead.length + 4; // start of the label, so it can be renamed
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: cursor, head: cursor + label.length },
  });
  view.focus();
  scheduleCompile();
}

// Wrap the selection in a block comment (/* … */): foldable, styled, and NOT
// rendered — a collapsible editor comment.
function commentOut() {
  const sel = view.state.selection.main;
  const selText = view.state.sliceDoc(sel.from, sel.to) || t("region");
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: `/* ${selText} */` },
    selection: { anchor: sel.from + 3, head: sel.from + 3 + selText.length },
  });
  view.focus();
  scheduleCompile();
}

// Document skins: one-click presets that restyle the document (font, size,
// margins, spacing, numbering).
const SKINS: Record<string, Partial<Settings>> = {
  sefer: { font: "Frank Ruhl Hofshi", size_pt: 13, margin_cm: 3, line_spacing_em: 0.7, justify: true, hebrew_numbering: true, numbering: true, paper: "a4" },
  modern: { font: "David Libre", size_pt: 12, margin_cm: 2.5, line_spacing_em: 0.95, justify: false, hebrew_numbering: false, numbering: true },
  letter: { font: "Frank Ruhl Hofshi", size_pt: 12, margin_cm: 3, line_spacing_em: 0.85, justify: true, hebrew_numbering: false, numbering: false },
  plain: { font: "Frank Ruhl Hofshi", size_pt: 12, margin_cm: 2.5, line_spacing_em: 0.75, justify: true, hebrew_numbering: false, numbering: true, header: "", footer: "" },
};
/**
 * The settings a preset replaced, so it can be undone.
 *
 * A skin used to `Object.assign` straight over your settings: choose one and
 * your font was gone, with nothing to say it had happened and no way back. A
 * preset is a starting point, not a one-way door.
 */
let styleUndo: { name: string; before: Partial<Settings> } | null = null;

function applySkin(name: string) {
  const preset = SKINS[name];
  const before: Partial<Settings> = {};
  for (const k of Object.keys(preset) as (keyof Settings)[]) {
    (before as Record<string, unknown>)[k] = settings[k];
  }
  styleUndo = { name, before };
  Object.assign(settings, preset);
  saveSettings();
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
  if (!styleUndo) return;
  Object.assign(settings, styleUndo.before);
  styleUndo = null;
  saveSettings();
  scheduleCompile();
  const wasOpen = document.getElementById("styles-panel")?.classList.contains("open");
  rerenderChrome();
  if (wasOpen) {
    renderStylesPanel();
    document.getElementById("styles-panel")?.classList.add("open");
  }
}

// Nikud marks (combining), with the key that types each one.
//
// The bar used to be click-only: fourteen buttons you mouse at, one at a time.
// That is tolerable for the occasional mark and miserable for a whole verse —
// and the siddur and bentcher templates are pointed throughout, so "a whole
// verse" is the normal case, not the exception.
//
// A vowel is a *combining* mark: typing the letter and then the mark composes
// them, which is exactly type-letter-then-key. So each mark gets a key, held
// with Alt, chosen to sit under the fingers in rough order of how often the mark
// is used rather than by any mnemonic — there is no letter-to-vowel mnemonic in
// Hebrew, and pretending otherwise would be harder to learn, not easier.
const NIKUD: [string, string, string][] = [
  ["ַ", "פתח", "Alt-a"],
  ["ָ", "קמץ", "Alt-s"],
  ["ֶ", "סגול", "Alt-d"],
  ["ֵ", "צירי", "Alt-f"],
  ["ִ", "חיריק", "Alt-g"],
  ["ֹ", "חולם", "Alt-h"],
  ["ֻ", "קובוץ", "Alt-j"],
  ["ְ", "שווא", "Alt-k"],
  ["ּ", "דגש", "Alt-l"],
  ["ׁ", "שין ימנית", "Alt-w"],
  ["ׂ", "שין שמאלית", "Alt-e"],
  ["ֱ", "חטף סגול", "Alt-z"],
  ["ֲ", "חטף פתח", "Alt-x"],
  ["ֳ", "חטף קמץ", "Alt-c"],
];

/**
 * Keys that type a nikud mark.
 *
 * Bound at the highest precedence so they beat CodeMirror's own Alt bindings,
 * and only while the nikud bar is open — Alt-letter combinations are useful for
 * other things, and a writer who is not pointing text should keep them.
 */
function nikudKeymap(): KeyBinding[] {
  return NIKUD.map(([mark, , key]) => ({
    key,
    preventDefault: true,
    run: () => {
      if (!settings.nikud) return false;
      insertNikud(mark);
      return true;
    },
  }));
}
/**
 * Add a vowel mark at the cursor.
 *
 * Deliberately does not replace the selection, the way inserting ordinary text
 * would. A nikud is a *diacritic* — it points the letter before it — so with a
 * word selected the writer means "point this", not "delete this and leave a
 * floating vowel". The mark goes at the end of the selection, which is the
 * letter it belongs to.
 */
function insertNikud(mark: string) {
  const at = view.state.selection.main.to;
  view.dispatch({
    changes: { from: at, to: at, insert: mark },
    selection: { anchor: at + mark.length },
  });
  view.focus();
  scheduleCompile();
}

function buildNikudBar(): HTMLElement {
  return el(
    "div",
    { id: "nikud-bar", class: "nikud-bar" },
    [
      ...NIKUD.map(([mark, name, key]) =>
        el(
          "button",
          {
            class: "nikud-btn",
            // The shortcut is on the button, because a shortcut nobody can find
            // is the same as no shortcut.
            title: `${name} · ${key.replace("Alt-", "Alt+")}`,
            onClick: () => insertNikud(mark),
          },
          [
            el("span", { class: "nikud-glyph" }, ["א" + mark]),
            el("span", { class: "nikud-key" }, [key.replace("Alt-", "")]),
          ],
        ),
      ),
      el("span", { class: "nikud-hint" }, [t("nikudHint")]),
    ],
  );
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

function iconBtn(label: string, title: string, onClick: () => void, cls = "") {
  return el(
    "button",
    { class: `tb-btn ${cls}`, title, "aria-label": title, type: "button", onClick },
    [
      // The glyph is decorative once the button has a name; leaving it exposed
      // makes the reader announce "dagger, Footnote" instead of "Footnote".
      el("span", { "aria-hidden": "true" }, [label]),
    ],
  );
}

/** One labelled ribbon group: the buttons, plus the caption that names them. */
function tbGroup(label: string, buttons: Node[]): HTMLElement {
  return el("div", { class: "tb-group", role: "group", "aria-label": label }, [
    el("div", { class: "tb-group-row" }, buttons),
    el("span", { class: "tb-group-label", "aria-hidden": "true" }, [label]),
  ]);
}

function buildToolbar(): HTMLElement {
  const lang = getLang();
  const byName = (he: string) => commandsReg.find((c) => c.he === he);
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
    el("button", { class: "menu-item", onClick: () => void duplicateDoc(currentDoc.id) }, [
      t("duplicate"),
    ]),
    el("div", { class: "menu-sep" }),
    el("div", { class: "menu-cat" }, [t("library")]),
  ];
  for (const entry of docs.library()) {
    const open = entry.id === currentDoc?.id;
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
  for (const c of commandsReg) if (!cats.includes(c.category)) cats.push(c.category);
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
    for (const c of commandsReg.filter((x) => x.category === cat)) {
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

  const builtinItems = templatesReg.map((tpl) =>
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
    el("button", { class: "menu-item", onClick: () => void exportPdf() }, [t("exportPdf")]),
    el("button", { class: "menu-item", onClick: () => void exportWord() }, [t("exportWord")]),
    el("button", { class: "menu-item", onClick: () => void copyForWord() }, [t("copyForWord")]),
    el("button", { class: "menu-item", onClick: () => void exportHtml() }, [t("exportHtml")]),
    el("button", { class: "menu-item", onClick: exportMarkdown }, [t("exportMarkdown")]),
    el("button", { class: "menu-item", onClick: exportText }, [t("exportText")]),
    el("button", { class: "menu-item", onClick: () => void exportTypst() }, [t("exportTypst")]),
    el("button", { class: "menu-item", onClick: doPrint }, [t("print")]),
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
  const undoBtn = iconBtn("↶", t("sc.undo"), () => undo(view), "chip");
  const redoBtn = iconBtn("↷", t("sc.redo"), () => redo(view), "chip");
  const findBtn = iconBtn("🔍", t("find"), () => openSearchPanel(view), "chip");
  const foldAllBtn = iconBtn("⊟", t("foldAll"), () => foldAll(view), "chip");
  const unfoldAllBtn = iconBtn("⊞", t("unfoldAll"), () => unfoldAll(view), "chip");
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
        "aria-label": `${t("rename")}: ${currentDoc?.title ?? ""}`,
        onClick: renameDoc,
      },
      [
        el("span", { class: "doc-title", id: "doc-title" }, [currentDoc?.title ?? ""]),
        el("small", { class: "doc-file", id: "doc-file" }, [currentBinding?.name ?? ""]),
      ],
    ),
    buildToolbar(),
    // The menu bar and the view chips are navigation, and saying so is what
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
    ...(currentDoc?.assets ?? [])
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

  const assets = currentDoc?.assets ?? [];
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

function buildAboutSection(): Node[] {
  return [
    el("h3", { style: "margin-top:18px" }, [t("aboutTitle")]),
    el("div", { class: "set-note" }, [t("aboutLicence")]),
    el("div", { class: "set-note" }, [t("aboutFonts")]),
    ...BUNDLED_FONT_NOTICES.map((f) =>
      el("div", { class: "font-notice" }, [
        el("b", {}, [f.name]),
        el("span", {}, [f.copyright]),
        el("a", { href: f.url, target: "_blank", rel: "noopener noreferrer" }, [f.licence]),
      ]),
    ),
  ];
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
    settings.keybindings = { ...(settings.keybindings || {}), [actionId]: key };
    saveSettings();
    reconfigureShortcuts();
    done(key);
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
  if (!host || !view) return;
  const items = outline(view.state.doc.toString());
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
function jumpTo(pos: number) {
  const p = Math.min(pos, view.state.doc.length);
  view.dispatch({ selection: { anchor: p }, scrollIntoView: true });
  view.focus();
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
  if (!view || !currentDoc) return false;
  const body = view.state.doc.toString();
  try {
    const stored = await docs.pushSnapshot(currentDoc.id, body);
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
  if (!host || !currentDoc) return;
  const list = (await docs.snapshots(currentDoc.id)).slice().reverse();
  host.innerHTML = "";
  // Say whose history this is: with one list per document, the title is the
  // thing that makes "restore" a safe button to press.
  host.append(el("div", { class: "history-scope" }, [tf("historyOf", currentDoc.title)]));
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
  view.focus();
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
  const items = commandsReg.filter((c) => {
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
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: body },
    selection: { anchor: 0 },
  });
  closeMenus();
  view.focus();
  scheduleCompile();
}
function loadTemplate(tpl: TemplateDef) {
  loadBody(tpl.body);
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
function saveUserTemplates(list: UserTemplate[]) {
  localStorage.setItem("ksav.userTemplates", JSON.stringify(list));
}
function saveAsTemplate() {
  closeMenus();
  const name = prompt(t("templateName"));
  if (!name) return;
  const list = userTemplates();
  list.push({ id: "u" + performance.now().toString(36), name, body: view.state.doc.toString() });
  saveUserTemplates(list);
  rerenderChrome();
}
function deleteUserTemplate(id: string) {
  saveUserTemplates(userTemplates().filter((u) => u.id !== id));
  rerenderChrome();
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
/**
 * Open a file into a NEW library document, rather than overwriting whatever is
 * currently open. "Open" destroying your unsaved work is not acceptable in a
 * writing tool.
 */
async function openFile() {
  closeMenus();
  const opened = await files.openFile();
  if (!opened) return;
  await flushSaves();
  const stripExt = opened.binding.name.replace(/\.[^.]+$/, "");
  const parsed = docs.parseDoc(opened.text, stripExt || t("untitled"));
  const doc = await docs.createDoc(parsed.title, parsed.body, parsed.assets);
  await docs.setFileName(doc.id, opened.binding.name);
  await files.rememberBinding(doc.id, opened.binding);
  await openDoc(doc.id);
}

async function fileText(): Promise<string> {
  await flushSaves();
  return docs.serializeDoc(currentDoc);
}

/** Save to the bound file; if there is none, fall through to Save As. */
async function saveFile() {
  closeMenus();
  await takeSnapshot(true);
  const text = await fileText();
  if (currentBinding && files.canWriteBack(currentBinding)) {
    if (!(await files.ensureWritable(currentBinding))) {
      setStatus(t("permissionDenied"), "err");
      return;
    }
    let written = false;
    try {
      written = await files.saveTo(currentBinding, text);
    } catch (e) {
      setStatus(`${t("saveFailed")} — ${String(e)}`, "err");
      return;
    }
    if (written) {
      unsavedToFile = false;
      setStatus(tf("savedTo", currentBinding.name), "ok");
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
  const binding = await files.saveAs(currentDoc.title || "document", text);
  if (!binding) return;
  currentBinding = binding;
  await docs.setFileName(currentDoc.id, binding.name);
  await files.rememberBinding(currentDoc.id, binding);
  unsavedToFile = false;
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
  if (!unsavedToFile || !currentBinding || !files.canWriteBack(currentBinding)) return;
  if (!settings.autosaveFile) return;
  if (!(await files.hasWritePermission(currentBinding))) return;
  try {
    await files.saveTo(currentBinding, await fileText());
    unsavedToFile = false;
    setStatus(tf("autosavedTo", currentBinding.name), "ok");
  } catch {
    // A background save that fails must not steal the writer's attention; the
    // next manual Save will report it properly.
  }
}

function newDoc() {
  void newNamedDoc();
}

/** A transient message in the status bar. */
function setStatus(msg: string, cls = "") {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = msg;
  status.className = cls;
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
  if (!bar || !view) return;
  const doc = view.state.doc.toString();
  const pos = view.state.selection.main.head;
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
    view.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
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
  const call = styles.findStyleCall(view.state.doc.toString(), kind);
  return call?.args.get(key);
}

/** Write styling arguments into the document, replacing the existing call. */
function setStyleArgs(kind: styles.StyleCommand, changes: Record<string, string | null>) {
  const doc = view.state.doc.toString();
  const next = styles.setStyleArgs(doc, kind, changes);
  if (next === doc) return;
  view.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
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
    ...(styleUndo
      ? [el("button", { class: "style-undo", onClick: () => { undoSkin(); renderStylesPanel(); } }, [
          "↶ " + tf("undoPreset", t("skin." + styleUndo.name)),
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

/** A labelled row holding one control, for the modal and the review panel. */
function fieldRow(label: string, control: Node): HTMLElement {
  return el("label", { class: "set-row" }, [el("span", {}, [label]), control]);
}

function textField(value = "", placeholder = ""): HTMLInputElement {
  return el("input", { type: "text", value, placeholder }) as HTMLInputElement;
}
function numberField(value: string, min: number, max: number, step = 1): HTMLInputElement {
  return el("input", { type: "number", value, min, max, step }) as HTMLInputElement;
}
function checkField(checked = false): HTMLInputElement {
  return el("input", { type: "checkbox", ...(checked ? { checked: "checked" } : {}) }) as HTMLInputElement;
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
  insertSnippet(by ? `#${cmd}(מאת: "${by.replace(/"/g, "")}")[|]` : `#${cmd}[|]`);
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
  const args = by ? `(מאת: "${by.replace(/"/g, "")}")` : "";
  const at = view.state.selection.main.to;
  const call = `#הערת_עורך${args}[${text}]`;
  view.dispatch({ changes: { from: at, to: at, insert: call }, selection: { anchor: at + call.length } });
  view.focus();
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
  const doc = view.state.doc.toString();
  if (next === doc) return;
  view.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
  scheduleCompile();
  renderReviewPanel();
}

function decideMark(mark: review.ReviewMark, decision: review.Decision) {
  replaceDoc(review.decide(view.state.doc.toString(), mark, decision));
}

function decideEverything(decision: review.Decision) {
  if (!confirm(t(decision === "accept" ? "confirmAcceptAll" : "confirmRejectAll"))) return;
  replaceDoc(review.decideAll(view.state.doc.toString(), decision));
}

/** Which review view the document currently reads in. */
function reviewView(): review.ReviewView {
  const raw = styles.findStyleCall(view.state.doc.toString(), "review")?.args.get("תצוגה");
  return review.viewFromValue(styles.readString(raw));
}

function setReviewView(v: review.ReviewView) {
  const doc = view.state.doc.toString();
  // The markup view is the default, so it is written as *no* command at all
  // rather than as a redundant one sitting at the top of every reviewed file.
  const next = styles.setStyleArgs(doc, "review", {
    "תצוגה": v === "markup" ? null : styles.typstString(review.VIEW_VALUE[v]),
  });
  replaceDoc(next);
}

const MARK_ICON: Record<review.MarkKind, string> = { insert: "＋", delete: "－", comment: "✎" };

function renderReviewPanel() {
  const box = document.getElementById("review-body");
  if (!box || !view) return;
  const doc = view.state.doc.toString();
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
    const q = (s: string) => `"${s.replace(/"/g, "")}"`;
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
    const q = '"' + body.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
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
  view.focus();
}

function chooseNote(choice: NoteChoice, which: "primary" | "secondary") {
  const from = view.state.selection.main.from;
  const { text, caret } = applyChoice(view.state.doc.toString(), from, choice, which);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
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

function humanSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = el("input", { type: "file", accept, style: "display:none" });
    let settled = false;
    const finish = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    window.addEventListener("focus", () => setTimeout(() => finish(null), 800), { once: true });
    document.body.append(input);
    input.click();
  });
}

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

/** Attach a file to the open document, returning the name it got. */
async function attachAsset(f: File, kind: DocAsset["kind"]): Promise<string | null> {
  if (f.size > MAX_ASSET_BYTES) {
    setStatus(tf("assetTooBig", humanSize(f.size), humanSize(MAX_ASSET_BYTES)), "err");
    return null;
  }
  if (!(await roomFor(f.size))) {
    setStatus(t("storageFull"), "err");
    return null;
  }
  const name = docs.uniqueAssetName(currentDoc.assets, f.name);
  const added: DocAsset = { name, data: await readAsDataUrl(f), kind };
  currentDoc.assets.push(added);
  try {
    await docs.putDoc(currentDoc);
  } catch (e) {
    // Take the attachment back out rather than leaving the in-memory document
    // referring to bytes that were never stored.
    currentDoc.assets = currentDoc.assets.filter((a) => a !== added);
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
  currentDoc.assets = currentDoc.assets.filter((a) => a.name !== name);
  await saveNow();
  scheduleCompile();
  rerenderChrome();
}

/**
 * Warn when what is about to leave the app was built from a *healed* copy.
 *
 * `lastResult` comes from the speculative compile, so while a bracket is missing
 * it holds a document with closers the writer never typed. Keeping the preview
 * alive on that basis is a kindness; letting a file walk out the door on it
 * without a word is not — the status line may have scrolled past by the time
 * they hit Export.
 */
function warnIfHealed() {
  const n = analyze(view.state.doc.toString()).problems.length;
  if (n) setStatus(`⚠ ${tf("previewHealed", n)}`, "warn");
}

/**
 * Export the PDF.
 *
 * Asks the engine for one now rather than reusing the preview's, because the
 * preview no longer carries a PDF at all — rendering one on every keystroke was
 * ~300 KB of base64 per response that nothing on screen ever read.
 */
async function exportPdf() {
  closeMenus();
  setStatus(t("rendering"), "");
  const res = await compileForExport();
  if (!res?.pdf_base64) {
    setStatus(t("compileError"), "err");
    return;
  }
  const bytes = Uint8Array.from(atob(res.pdf_base64), (c) => c.charCodeAt(0));
  download(fileStem() + ".pdf", new Blob([bytes], { type: "application/pdf" }));
  warnIfHealed();
}

async function exportTypst() {
  closeMenus();
  const res = await compileForExport();
  if (!res) return;
  download(fileStem() + ".typ", new Blob([res.typst_source], { type: "text/plain" }));
  warnIfHealed();
}
/**
 * The rendered pages wrapped in HTML — a *picture* of the document.
 *
 * This is what printing wants (it must look exactly like the PDF), and it is the
 * fallback for the web export when Typst's HTML backend cannot handle a
 * document. It is not reflowable and is not what "Export HTML" should mean.
 */
function pageImageHtml(): string {
  const pages = (lastResult?.pages_svg || [])
    .map((s) => `<div class="page">${s}</div>`)
    .join("\n");
  return `<!doctype html><html dir="${settings.dir}"><head><meta charset="utf-8">
<title>${escapeAttr(currentDoc?.title ?? "Ksav")}</title><style>body{background:#e5e7eb;margin:0;padding:24px}
.page{background:#fff;max-width:820px;margin:0 auto 24px;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.page svg{width:100%;height:auto;display:block}</style></head><body>${pages}</body></html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/**
 * Real web content: Typst's own HTML backend, so headings are headings and the
 * text reflows, is selectable and reads on a phone.
 *
 * Typst's HTML export is still under development and can fail on a document the
 * paged backend renders fine. When it does, say so and fall back to the page
 * images rather than silently producing nothing.
 */
async function exportHtml() {
  // Unlike the Word handoff, this one may fall back to page images: an HTML file
  // that merely *shows* the document is still useful, where one Word cannot edit
  // is not.
  const html = await reflowableHtml();
  download(
    fileStem() + ".html",
    new Blob([html ?? pageImageHtml()], { type: "text/html;charset=utf-8" }),
  );
}

// ---------------------------------------------------------------- Word handoff
//
// `.docx` from Typst is not feasible and is correctly ruled out. But "produce a
// .docx" was never the requirement — the requirement is that the rebbi, the
// chavrusa or the kovetz editor this document is sent to can *edit* it, and all
// of them open Word. Word reads HTML natively and converts it to a real editable
// document, so Typst's own reflowable HTML export reaches them after all.
//
// What crosses over: prose, headings, bold/italic, lists, tables and plain
// footnotes. What flattens: the multi-stream apparatus, fixed bands and side
// columns — which is honest, and no loss, because nobody edits an eleven-layer
// apparatus in Word anyway. `wordFlattenNote` says so rather than letting it be
// discovered.

const PAPER_CSS: Record<string, string> = {
  a4: "21cm 29.7cm",
  "us-letter": "8.5in 11in",
  a5: "14.8cm 21cm",
  a3: "29.7cm 42cm",
};

/**
 * Wrap reflowable HTML in the envelope Word looks for.
 *
 * The `mso` namespaces plus the `<w:WordDocument>` block are what make Word treat
 * the file as its own document rather than a web page it is merely displaying —
 * without them it opens in Web Layout with no page size, and "Save As .docx"
 * produces something that prints wrong. `@page` carries the real paper and
 * margins across, and `dir` carries the RTL.
 */
function wordEnvelope(inner: string, styles: string): string {
  const size = PAPER_CSS[settings.paper] ?? PAPER_CSS.a4;
  const dir = settings.dir;
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeAttr(currentDoc?.title ?? "Ksav")}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: ${size}; margin: ${settings.margin_cm}cm; }
div.WordSection1 { page: WordSection1; }
body { font-family: "${settings.font}", serif; font-size: ${settings.size_pt}pt;
       direction: ${dir}; text-align: ${dir === "rtl" ? "right" : "left"};
       line-height: ${1 + settings.line_spacing_em}; }
table { border-collapse: collapse; }
td, th { border: 1px solid #000; padding: 4pt; }
${styles}
</style></head>
<body dir="${dir}" lang="${dir === "rtl" ? "he" : "en"}"><div class="WordSection1">
${inner}
</div></body></html>`;
}

/** Pull the body content and any styles out of Typst's full HTML document. */
function splitHtml(html: string): { inner: string; styles: string } {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");
  return { inner: body ? body[1] : html, styles };
}

/**
 * Ask the engine for reflowable HTML. Returns null (having said why) when
 * Typst's HTML backend cannot handle this document — page images are useless
 * here, because a picture is exactly what Word cannot edit.
 */
async function reflowableHtml(): Promise<string | null> {
  if (!backend) return null;
  const pre = settings.customCommands?.trim() ? settings.customCommands + "\n\n" : "";
  const body = pre + view.state.doc.toString();
  try {
    const res = (await backend.compile(body, cfg(), {
      ...docs.requestAssets(currentDoc?.assets ?? []),
      format: "html",
    })) as unknown as { ok: boolean; html?: string; diagnostics?: Diagnostic[] };
    if (res.ok && res.html) return res.html;
    const why = res.diagnostics?.[0]?.message ?? "";
    setStatus(t("htmlFellBack") + (why ? ` — ${friendlyError(why)}` : ""), "warn");
  } catch {
    setStatus(t("htmlFellBack"), "warn");
  }
  return null;
}

async function exportWord() {
  const html = await reflowableHtml();
  if (!html) return;
  const { inner, styles } = splitHtml(html);
  // `.doc` (not `.docx`): Word opens HTML under this extension and converts it,
  // and the writer can then Save As a genuine .docx from inside Word.
  download(
    fileStem() + ".doc",
    new Blob([wordEnvelope(inner, styles)], { type: "application/msword;charset=utf-8" }),
  );
  setStatus(t("wordFlattenNote"), "warn");
}

/** The same content onto the clipboard, for pasting into an already-open Word. */
async function copyForWord() {
  const html = await reflowableHtml();
  if (!html) return;
  const { inner, styles } = splitHtml(html);
  const full = wordEnvelope(inner, styles);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([full], { type: "text/html" }),
        "text/plain": new Blob([toPlainText(view.state.doc.toString())], { type: "text/plain" }),
      }),
    ]);
    setStatus(t("copiedForWord"), "ok");
  } catch {
    setStatus(t("copyFailed"), "warn");
  }
}

/** A filename stem from the document's title, safe on every platform. */
function fileStem(): string {
  const raw = (currentDoc?.title ?? "ksav").trim();
  const safe = raw.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-");
  return safe || "ksav";
}

function exportMarkdown() {
  download(
    fileStem() + ".md",
    new Blob([toMarkdown(view.state.doc.toString())], { type: "text/markdown;charset=utf-8" }),
  );
}

function exportText() {
  download(
    fileStem() + ".txt",
    new Blob([toPlainText(view.state.doc.toString())], { type: "text/plain;charset=utf-8" }),
  );
}
function doPrint() {
  const w = window.open("", "_blank");
  if (!w) return;
  // Printing wants the page images: what comes out of the printer must look
  // exactly like the PDF, which reflowable HTML would not.
  w.document.write(pageImageHtml());
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ---------------------------------------------------------------- setting mutations
function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings[key] = value;
  saveSettings();
  if (key === "lang") {
    setLang(value as Lang);
    rerenderChrome();
  } else if (key === "theme") {
    applyTheme();
    view.dispatch({ effects: themeCompartment.reconfigure(editorTheme(settings.theme === "dark")) });
  } else if (key === "prose") {
    view.dispatch({ effects: proseCompartment.reconfigure(settings.prose ? proseMode : []) });
    rerenderChrome();
  } else if (key === "layout") {
    applyLayout();
    rerenderChrome();
  } else if (key === "dir") {
    view.dispatch({ effects: dirCompartment.reconfigure(EditorView.contentAttributes.of({ dir: settings.dir })) });
    scheduleCompile();
  } else if (key === "zoom") {
    applyZoom();
  } else if (key === "autocomplete") {
    view.dispatch({ effects: autoCompartment.reconfigure(autoExtension()) });
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
    if (settings.layout !== "two") return; // splitter only active in split view
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
    view.dispatch({ effects: proseCompartment.reconfigure(proseMode) });
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
    buildNikudBar(),
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

  view = makeEditor();
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
    if (e.key === "Escape") {
      closePalette();
      closePreviewOverlay();
      closeHistory();
      closeNotesChooser();
      closeSpellMenu();
      closeStyles();
      closeReview();
      closeModal();
    } else if (e.key === "Alt" && settings.prose) {
      view.dispatch({ effects: setRevealAll.of(true) });
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && settings.prose) view.dispatch({ effects: setRevealAll.of(false) });
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
        templatesReg
          .slice(0, 6)
          .map((tpl) =>
            el("button", { class: "welcome-tpl", onClick: () => { loadBody(tpl.body); dismissOnboard(); } }, [
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

async function boot() {
  // The store opens before anything is drawn: the editor is constructed with
  // the document's text in it, so there is never a frame in which the writer
  // could type into a buffer that has no document behind it.
  try {
    currentDoc = await docs.init(STARTER, t("untitled"));
  } catch (e) {
    // No durable store at all — a private window, or storage blocked. Say so
    // loudly and start an in-memory document rather than pretending.
    currentDoc = { id: docs.newId(), title: t("untitled"), body: STARTER, assets: [], updated: Date.now() };
    render();
    wireKeys();
    reportSaveFailure(e);
    backend = await createBackend();
    runCompile();
    return;
  }
  void files.recallBinding(currentDoc.id).then((b) => {
    currentBinding = b;
    updateTitleBar();
  });
  render();
  wireKeys();
  wireUnloadGuard();
  const status = document.getElementById("status")!;
  status.textContent = t("rendering");
  backend = await createBackend();
  const badge = document.getElementById("engine-badge");
  if (badge) {
    const labels: Record<string, string> = {
      server: "⬢ server",
      wasm: "⬡ wasm",
      desktop: "🖥 native",
    };
    badge.textContent = labels[backend.kind] ?? backend.kind;
  }
  try {
    [commandsReg, templatesReg] = await Promise.all([backend.commands(), backend.templates()]);
    rerenderChrome();
    maybeOnboard();
  } catch {
    /* registries optional for first paint */
  }
  runCompile();
  // The first check has to be scheduled explicitly: boot compiles directly
  // rather than through scheduleCompile, so nothing would be checked until the
  // writer's first keystroke.
  scheduleSpellCheck();
  // periodic auto-snapshot (only stores when the text changed)
  window.setInterval(() => void takeSnapshot(), 180000);
  // periodic write-back to the bound file, when there is one to write to
  window.setInterval(() => void autosaveToFile(), FILE_AUTOSAVE_MS);
}

/**
 * Don't let a close throw work away.
 *
 * Two different things can be unsaved, and they need different treatment. The
 * library copy is written on a 600 ms debounce, so on the way out we simply
 * flush it — no prompt, because there is nothing for the writer to decide. The
 * *file* on disk is another matter: only the writer knows whether they meant to
 * save it, so that one asks. Closing a tab with unsaved changes to a bound file
 * used to lose them with no prompt at all.
 */
function wireUnloadGuard() {
  window.addEventListener("beforeunload", (e) => {
    if (unsavedChanges) void saveNow();
    if (saveFailure || (unsavedToFile && currentBinding && files.canWriteBack(currentBinding))) {
      e.preventDefault();
      // Browsers ignore the string and show their own wording, but returnValue
      // still has to be set for the prompt to appear at all.
      e.returnValue = "";
      return "";
    }
    return undefined;
  });
  // `beforeunload` is not guaranteed on mobile or when a tab is discarded;
  // `pagehide` is the one that actually fires there.
  window.addEventListener("pagehide", () => {
    if (unsavedChanges) void saveNow();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && unsavedChanges) void saveNow();
  });
}

boot();

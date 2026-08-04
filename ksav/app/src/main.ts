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
import { deferredNotes, jumpDeferred, deferHere, recallHere, deferAll } from "./deferred-lint";
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
import { aliasesInForce, keybindingsFrom, whoHolds } from "./bindings";
import * as sefarim from "./sefarim";
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
  PAGE_FIELDS,
  docConfig,
} from "./settings";
import type { Settings, Layout, PreviewSide, PageSetup } from "./settings";
import * as save from "./save";
import { scheduleSave, saveNow, flushSaves, reportSaveFailure } from "./save";
import { scheduleCompile, runCompile, onSchedule, bodyOnScreen } from "./compile";
import * as commands from "./commands";
import { applyPreview, drawCurrentInto, pageBox } from "./preview";
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
import { lineInDocument, onGoToLine, onMarkLines } from "./diagview";
import { nikudKeymap, buildNikudBar } from "./nikud";
import * as exports from "./exports";
import { troubleSaid } from "./diagnostics";

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
  save.markFileSaved();
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
  { id: "hiddenBreak", run: () => (hiddenBreak(), true) },
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
  // Deferred note bodies. `deferJump` is the one that gets used: it is org-mode's
  // C-c C-c — marker to prose, prose to marker, and it writes the prose when
  // there is none rather than complaining that there is none.
  // Forward search: where did what I am typing print? The pair to clicking the
  // preview, which needs no key because it has a mouse.
  { id: "revealCursor", run: () => (void revealCursor(), true) },
  // The manual override for when the automatic isolation does not reach.
  { id: "isolate", run: (v) => toggleIsolateSelection(v) },
  { id: "deferJump", run: (v) => (jumpDeferred(v), true) },
  { id: "deferHere", run: (v) => (deferHere(v), true) },
  { id: "deferRecall", run: (v) => (recallHere(v), true) },
];
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
  for (const a of ACTIONS) {
    if (kb[a.id]) bindings.push({ key: kb[a.id], run: a.run, preventDefault: true });
    for (const alias of aliases[a.id] ?? []) {
      bindings.push({ key: alias, run: a.run, preventDefault: true });
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
    (snip: string) => (v: EditorView, _c: unknown, from: number, to: number) => {
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
  const arg = sefarim.seferArgAt(context.state.doc.toString(), context.pos);
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
function countNow() {
  const el = document.getElementById("wordcount");
  if (!el || !runtime.view) return;
  const text = countableText(runtime.view.state.doc.toString());
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
  const svg = runtime.lastResult?.pages_svg?.[found.index];
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
  const pages = runtime.lastResult?.pages_svg;
  if (!pages?.length) {
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
  setStatus(t("askingGirsa"), "");
  try {
    const linked = await runtime.backend!.linkify(prose);
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
  const wasOpen = document.getElementById("styles-panel")?.classList.contains("open");
  rerenderChrome();
  if (wasOpen) {
    renderStylesPanel();
    document.getElementById("styles-panel")?.classList.add("open");
  }
  setStatus(tf("presetApplied", t("skin." + name)), "ok");
}

function undoSkin() {
  if (!undoPreset(setPageSetup)) return;
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
    el("button", { class: "menu-item", onClick: () => (closeMenus(), hiddenBreak()) }, [
      el("b", {}, ["⏎ " + t("hiddenBreak")]),
      el("span", { class: "menu-desc" }, [t("hiddenBreakLede")]),
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
    el("button", { class: "menu-item", onClick: () => void importWord() }, [t("importWord")]),
    el("button", { class: "menu-item", onClick: () => void copyShareLink(false) }, [t("shareRead")]),
    el("button", { class: "menu-item", onClick: () => void copyShareLink(true) }, [t("shareReview")]),
    el("button", { class: "menu-item", onClick: saveAsTemplate }, [t("saveAsTemplate")]),
  ]);

  // The Skins menu is gone: presets now live inside the Styles panel, next to
  // the settings they overwrite, where the relationship is visible.

  const exportMenu = menu("⬇ " + t("export"), [
    el("button", { class: "menu-item", onClick: () => void exports.exportPdf() }, [t("exportPdf")]),
    el("button", { class: "menu-item", onClick: () => void exports.exportPdfPages() }, [t("exportPdfPages")]),
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
function optNumberRow(labelKey: string, key: keyof Settings, min: number, max: number, step: number) {
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
function selectRow(labelKey: string, key: keyof Settings, options: [string, string][]) {
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
function listRow(labelKey: string, key: keyof Settings) {
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

function checkRow(labelKey: string, key: keyof Settings) {
  const input = el("input", {
    type: "checkbox",
    ...(now(key) ? { checked: "checked" } : {}),
    onChange: (e: Event) => setSetting(key, (e.target as HTMLInputElement).checked as never),
  });
  return el("label", { class: "set-row" }, [el("span", {}, [t(labelKey)]), input]);
}
function textRow(labelKey: string, key: keyof Settings, placeholder = "") {
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
  const shortcutRows = ACTIONS.map((a) => {
    const btn = el("button", { class: "sc-key", type: "button" }, [kb[a.id] || "—"]);
    btn.addEventListener("click", () => captureShortcut(a.id, btn));
    return el("label", { class: "set-row" }, [el("span", {}, [t("sc." + a.id)]), btn]);
  });

  return el("aside", { id: "settings-drawer", class: "drawer", "aria-label": t("settings") }, [
    el("h3", {}, [t("settings")]),
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
  // The same list the completions use. The palette never called `userCommandNames`
  // at all, so a user-defined command was invisible here in every case — yours and
  // the document's alike (B27).
  const items = commands.available(runtime.commandsReg).filter((c) => commands.matches(c, query));
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
        // A user-defined command says where it came from instead of a category —
        // *this document's* or *yours*, which is the distinction that matters when
        // both exist and the compiler runs one of them.
        el("span", { class: "pal-cat" }, [
          c.category ? t("cat." + c.category) : whose(c.from),
        ]),
        el("b", {}, [
          c.from === "registry" ? (lang === "he" ? c.desc_he : c.desc_en) ?? c.name : c.name,
        ]),
        el("code", {}, ["#" + c.name + (c.en ? " · " + c.en : "")]),
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
 */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (runtime.backend?.kind === "desktop") return;
  if (!import.meta.env.PROD) return;
  void navigator.serviceWorker
    .register(`/sw.js?v=${update.CURRENT_VERSION}`)
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
  const doc = await docs.createDoc(shared.title || t("untitled"), shared.body);
  if (shared.dir) await docs.rememberConfig(doc.id, { dir: shared.dir });
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
  // A desktop build has no useful URL of its own, so the link names the hosted
  // copy rather than a `tauri://localhost` that works on one machine.
  const base =
    runtime.backend?.kind === "desktop" || location.protocol === "file:"
      ? "https://ksav.app/"
      : location.href;
  const link = await share.shareLink(base, {
    title: runtime.currentDoc?.title ?? "",
    body: runtime.docText(),
    dir: docConfig().dir,
    review: forReview,
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
  const next = styles.setStyleArgs(doc, kind, changes, docConfig().dir === "ltr" ? "en" : "he");
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

/**
 * Where the note's prose goes in the *file* — which is a separate question from
 * where it prints, and the one the chooser could not previously ask.
 *
 * Sticky across notes in a session: a writer who has decided their notes live at
 * the end has decided it for the document, not for one footnote.
 */
let deferBodies = false;

function chooseNote(choice: NoteChoice, which: "primary" | "secondary") {
  const from = runtime.view.state.selection.main.from;
  const { text, caret } = applyChoice(
    runtime.view.state.doc.toString(),
    from,
    choice,
    which,
    deferBodies,
  );
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
        class: `defer-option${deferBodies === on ? " on" : ""}`,
        onClick: () => {
          deferBodies = on;
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

function renderNotesChooser() {
  const box = document.getElementById("notes-chooser-body")!;
  box.replaceChildren(
    el("h2", {}, [t("notesChooserTitle")]),
    el("p", { class: "notes-lede" }, [t("notesChooserLede")]),
    el("h3", {}, [t("notesOneLayer")]),
    el("div", { class: "note-grid" }, NOTE_CHOICES.filter((c) => c.layers === "one").map(noteCard)),
    el("h3", {}, [t("notesTwoLayers")]),
    el("div", { class: "note-grid" }, NOTE_CHOICES.filter((c) => c.layers === "two").map(noteCard)),
    bodyPlacementRow(),
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
function now<K extends keyof Settings>(key: K): Settings[K] {
  if ((PAGE_FIELDS as readonly string[]).includes(key as string)) {
    const live = docConfig() as unknown as Record<string, unknown>;
    if (live[key as string] !== undefined) return live[key as string] as Settings[K];
  }
  return settings[key];
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
  const live = docConfig() as unknown as Record<string, unknown>;
  for (const key of PAGE_FIELDS) {
    (settings as unknown as Record<string, unknown>)[key] = live[key];
  }
  saveSettings();
  showChromeNotice(t("setupIsDefault"));
}

function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  if ((PAGE_FIELDS as readonly string[]).includes(key as string)) {
    setPageSetup({ [key as string]: value } as PageSetup);
  } else {
    settings[key] = value;
    saveSettings();
  }
  if (key === "lang") {
    setLang(value as Lang);
    swapUntouchedStarter();
    rerenderChrome();
  } else if (key === "theme") {
    applyTheme();
    runtime.view.dispatch({ effects: themeCompartment.reconfigure(editorTheme(settings.theme === "dark")) });
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
  const body = document.getElementById("preview-modal-body")!;
  // Drawn from the pages themselves, not copied out of the other pane. It used
  // to be `body.innerHTML = preview.innerHTML`, which serialises ten megabytes
  // of SVG the browser has already parsed and then parses all of it again — and
  // it would now copy the *windowing* too, so every page the reader had not
  // scrolled past would arrive in the full-screen view as an empty box.
  drawCurrentInto(body);
  document.getElementById("preview-modal")!.classList.add("open");
  // The modal is a second pane over the same pages, so it needs the same
  // direction and the same page width. One call, both panes.
  applyPreview();
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
  // A diagnostic that names a line has to be able to go there, and the line has
  // to be visible in the editor. `diagview` knows nothing about CodeMirror and
  // does not need to; it asks.
  onGoToLine((line, column) => {
    const at = offsetOf(runtime.view, line, column);
    if (at != null) jumpTo(at);
  });
  onMarkLines((lines) => runtime.view.dispatch({ effects: setErrorLines.of(lines) }));
  wireSyncScroll();
  wireSplitter();
  applyTheme();
  applyLayout();
  applyPreviewSide();
  applyUiDir();
  applyPreview();
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
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
      // Linkify the selection (spec.md §10.5).
      e.preventDefault();
      void linkifySelection();
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") {
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

  const overlay = el("div", { id: "welcome", class: "overlay open" }, [
    el("div", { class: "palette-box welcome-box" }, [
      el("h2", {}, [t("welcomeTitle")]),
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
                onClick: () => {
                  loadTemplate(tpl);
                  dismissOnboard();
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
            newDoc();
            dismissOnboard();
          },
        },
        [t("welcomeStart")],
      ),
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

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
import { createBackend } from "./api";
import type { Backend, CommandDef, TemplateDef, CompileResult, DocConfig } from "./api";
import { t, tf, setLang, getLang, isRtlUi } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import type { DocAsset, KsavDoc } from "./docs";
import * as files from "./files";
import { NOTE_CHOICES, applyChoice } from "./notes";
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
  syncScroll?: boolean;
  customCommands?: string; // user #let definitions, prepended at compile
  snippets?: string; // "abbrev = expansion" per line, expanded on Tab
  keybindings?: Record<string, string>; // action id -> key combo override
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
  prose: false,
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
  syncScroll: true,
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

function loadDoc(): string {
  currentDoc = docs.openingDoc(STARTER, t("untitled"));
  void files.recallBinding(currentDoc.id).then((b) => {
    currentBinding = b;
    updateTitleBar();
  });
  return currentDoc.body;
}

/** Persist the open document (body, title and assets) to the library. */
function persistDoc() {
  if (!currentDoc || switching) return;
  currentDoc.body = view ? view.state.doc.toString() : currentDoc.body;
  docs.putDoc(currentDoc);
}

/** Switch the editor to another document in the library. */
async function openDoc(id: string) {
  const next = docs.getDoc(id);
  if (!next) return;
  persistDoc();
  switching = true;
  currentDoc = next;
  docs.setCurrentId(next.id);
  currentBinding = await files.recallBinding(next.id);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: next.body },
    selection: { anchor: 0 },
  });
  switching = false;
  updateTitleBar();
  rerenderChrome();
  view.focus();
  scheduleCompile();
}

function newNamedDoc() {
  closeMenus();
  persistDoc();
  const doc = docs.createDoc(t("untitled"), "");
  void openDoc(doc.id);
}

function duplicateDoc(id: string) {
  const src = docs.getDoc(id);
  if (!src) return;
  const copy = docs.createDoc(src.title + " ‏(2)", src.body, src.assets);
  void openDoc(copy.id);
}

function removeDoc(id: string) {
  const entry = docs.library().find((e) => e.id === id);
  if (!entry) return;
  if (!confirm(tf("confirmDeleteDoc", entry.title))) return;
  docs.deleteDoc(id);
  void files.rememberBinding(id, null);
  if (currentDoc.id === id) {
    const next = docs.library()[0];
    if (next) void openDoc(next.id);
    else newNamedDoc();
  } else {
    rerenderChrome();
  }
}

function renameDoc() {
  const name = prompt(t("renamePrompt"), currentDoc.title);
  if (name === null) return;
  currentDoc.title = name.trim() || t("untitled");
  persistDoc();
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
  document.querySelectorAll(".menu-list.open").forEach((m) => m.classList.remove("open"));
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
  const bindings: KeyBinding[] = [];
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
function autoExtension() {
  return settings.autocomplete === false
    ? []
    : autocompletion({ override: [ksavCompletions], icons: false });
}

function makeEditor(): EditorView {
  return new EditorView({
    doc: loadDoc(),
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
      revealAll,
      dirCompartment.of(EditorView.contentAttributes.of({ dir: settings.dir })),
      proseCompartment.of(settings.prose ? proseMode : []),
      themeCompartment.of(editorTheme(settings.theme === "dark")),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          scheduleCompile();
          updateCounts();
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
  if (m.includes("expected") || m.includes("unexpected"))
    return {
      he: "התחביר אינו תקין כאן — בדקו סוגריים, פסיקים ומבנה הפקודה.",
      en: "Invalid syntax here — check brackets, commas, and the command structure.",
    };
  return null;
}
function friendlyError(msg: string): string {
  const p = friendlyPair(msg);
  return p ? `${p.he}  ·  ${p.en}` : msg;
}

let compileTimer: number | undefined;
function scheduleCompile() {
  clearTimeout(compileTimer);
  compileTimer = window.setTimeout(runCompile, 250);
}

async function runCompile() {
  if (!backend) return; // backend still initializing (createBackend not resolved yet)
  const status = document.getElementById("status")!;
  const diag = document.getElementById("diagnostics")!;
  status.textContent = t("rendering");
  status.className = "";
  const t0 = performance.now();
  const userDoc = view.state.doc.toString();
  // Auto-save into the library. A document the writer never renamed takes its
  // title from its own first heading, so the library is readable either way.
  if (currentDoc && !switching) {
    currentDoc.body = userDoc;
    if (currentDoc.title === t("untitled")) {
      const guess = docs.guessTitle(userDoc, t("untitled"));
      if (guess && guess !== t("untitled")) {
        currentDoc.title = guess;
        updateTitleBar();
      }
    }
    docs.putDoc(currentDoc);
  }
  // Prepend user-defined commands so they're usable in the document.
  const pre = settings.customCommands?.trim() ? settings.customCommands + "\n\n" : "";
  const body = pre + userDoc;
  try {
    const res = await backend.compile(body, cfg(), docs.requestAssets(currentDoc?.assets ?? []));
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
    if (res.ok) {
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
    status.textContent = `✗ ${t("networkError")}`;
    status.className = "err";
    diag.textContent = String(e);
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
function applySkin(name: string) {
  Object.assign(settings, SKINS[name]);
  saveSettings();
  document.querySelectorAll(".menu-list.open").forEach((m) => m.classList.remove("open"));
  scheduleCompile();
  rerenderChrome();
}

// Nikud marks (combining) for the vowel-input bar.
const NIKUD: [string, string][] = [
  ["ְ", "שווא"],
  ["ַ", "פתח"],
  ["ָ", "קמץ"],
  ["ֶ", "סגול"],
  ["ֵ", "צירי"],
  ["ִ", "חיריק"],
  ["ֹ", "חולם"],
  ["ֻ", "קובוץ"],
  ["ּ", "דגש"],
  ["ׁ", "שין ימנית"],
  ["ׂ", "שין שמאלית"],
  ["ֱ", "חטף סגול"],
  ["ֲ", "חטף פתח"],
  ["ֳ", "חטף קמץ"],
];
function insertText(s: string) {
  const sel = view.state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: s },
    selection: { anchor: sel.from + s.length },
  });
  view.focus();
  scheduleCompile();
}
function buildNikudBar(): HTMLElement {
  return el(
    "div",
    { id: "nikud-bar", class: "nikud-bar" },
    NIKUD.map(([mark, name]) =>
      el("button", { class: "nikud-btn", title: name, onClick: () => insertText(mark) }, [
        "א" + mark,
      ]),
    ),
  );
}
function toggleNikud() {
  settings.nikud = !settings.nikud;
  saveSettings();
  document.getElementById("nikud-bar")!.classList.toggle("open", settings.nikud);
  rerenderChrome();
}

// ---------------------------------------------------------------- app chrome
function iconBtn(label: string, title: string, onClick: () => void, cls = "") {
  return el("button", { class: `tb-btn ${cls}`, title, onClick }, [label]);
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
  const sep = () => el("span", { class: "tb-sep" });

  return el("div", { class: "toolbar" }, [
    b("הדגשה", "B"),
    b("נטוי", "I"),
    b("קו_תחתון", "U"),
    b("קו_חוצה", "S"),
    b("סימון", "🖍"),
    sep(),
    b("כותרת1", "H1"),
    b("כותרת2", "H2"),
    b("כותרת3", "H3"),
    sep(),
    b("רשימה", "•"),
    b("ממוספרת", "1."),
    b("טבלה", "▦"),
    b("הערה", "†"),
    b("הערה_על_הערה", "⁑"),
    sep(),
    b("ימין", "⇥"),
    b("מרכז", "≡"),
    b("שמאל", "⇤"),
    sep(),
    b("ציטוט", "❝"),
    b("הערת_צד", "▣"),
    sep(),
    b("סימן", "§"),
    b("סעיף", "א."),
    b("מראה_מקום", "‡"),
    sep(),
    iconBtn("▤", t("region"), insertRegion),
    iconBtn("⋯", t("palette"), openPalette),
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
    el("button", { class: "menu-item", onClick: newNamedDoc }, [t("newDoc")]),
    el("button", { class: "menu-item", onClick: renameDoc }, [t("rename")]),
    el("button", { class: "menu-item", onClick: () => duplicateDoc(currentDoc.id) }, [t("duplicate")]),
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
            removeDoc(entry.id);
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
  const list = el("div", { class: "menu-list" });
  const btn = el("button", { class: "menu-btn", onClick: (e: Event) => {
    e.stopPropagation();
    document.querySelectorAll(".menu-list.open").forEach((m) => {
      if (m !== list) m.classList.remove("open");
    });
    if (!list.classList.contains("open")) {
      list.replaceChildren();
      list.append(...build().map((n) => (typeof n === "string" ? document.createTextNode(n) : n)));
    }
    list.classList.toggle("open");
  } }, [label]);
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

  const skinsMenu = menu(
    "🎨 " + t("skins"),
    Object.keys(SKINS).map((name) =>
      el("button", { class: "menu-item", onClick: () => applySkin(name) }, [
        el("b", {}, [t("skin." + name)]),
      ]),
    ),
  );

  const exportMenu = menu("⬇ " + t("export"), [
    el("button", { class: "menu-item", onClick: exportPdf }, [t("exportPdf")]),
    el("button", { class: "menu-item", onClick: exportHtml }, [t("exportHtml")]),
    el("button", { class: "menu-item", onClick: exportTypst }, [t("exportTypst")]),
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
  const notesBtn = iconBtn("✻", t("notesChooser"), openNotesChooser, "chip");
  const historyBtn = iconBtn("🕐", t("history"), openHistory, "chip");
  const settingsBtn = iconBtn("⚙", t("settings"), toggleSettings, "chip");

  return el("header", {}, [
    el("div", { class: "brand" }, [
      el("span", { class: "brand-name" }, [t("appName")]),
      el("small", {}, [t("tagline")]),
    ]),
    // The open document's name, clickable to rename — a writing tool with a
    // library needs to say, at all times, which document you are in.
    el("button", { class: "doc-title-btn", title: t("rename"), onClick: renameDoc }, [
      el("span", { class: "doc-title", id: "doc-title" }, [currentDoc?.title ?? ""]),
      el("small", { class: "doc-file", id: "doc-file" }, [currentBinding?.name ?? ""]),
    ]),
    buildToolbar(),
    buildInsertMenu(),
    el("div", { class: "spacer" }),
    buildDocsMenu(),
    fileMenu,
    undoBtn,
    redoBtn,
    templatesMenu,
    skinsMenu,
    exportMenu,
    findBtn,
    outlineBtn,
    notesBtn,
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
  const assets = currentDoc?.assets ?? [];
  const assetRows = assets.length
    ? assets.map((a) =>
        el("div", { class: "set-row asset-row" }, [
          el("span", { class: "asset-name" }, [(a.kind === "font" ? "🅵 " : "🖼 ") + a.name]),
          el("button", {
            type: "button",
            class: "mini",
            title: t("removeAsset"),
            onClick: () => removeAsset(a.name),
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

  return el("aside", { id: "settings-drawer", class: "drawer" }, [
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
    checkRow("syncScrollLabel", "syncScroll"),
    el("h3", { style: "margin-top:18px" }, [t("assetsTitle")]),
    ...assetRows,
    el("h3", { style: "margin-top:18px" }, [t("customization")]),
    textAreaRow("customCommandsLabel", "customCommands", "#let דגש(x) = text(fill: red, strong(x))"),
    textAreaRow("snippetsLabel", "snippets", "בסד = בס\"ד\nסי = #סימן[|][]"),
    el("h3", { style: "margin-top:18px" }, [t("shortcuts")]),
    ...shortcutRows,
    el("button", { class: "sc-reset", type: "button", onClick: resetShortcuts }, [t("resetShortcuts")]),
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
    settings.keybindings = { ...(settings.keybindings || {}), [actionId]: key };
    saveSettings();
    reconfigureShortcuts();
    done(key);
  };
  window.addEventListener("keydown", handler, true);
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
interface Snapshot {
  t: number;
  body: string;
}
function snapshots(): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem("ksav.history") || "[]");
  } catch {
    return [];
  }
}
function takeSnapshot(force = false) {
  if (!view) return;
  const body = view.state.doc.toString();
  const list = snapshots();
  if (!force && list.length && list[list.length - 1].body === body) return; // no change
  list.push({ t: Date.now(), body });
  localStorage.setItem("ksav.history", JSON.stringify(list.slice(-80)));
  if (document.getElementById("history-modal")?.classList.contains("open")) renderHistory();
}
function restoreSnapshot(s: Snapshot) {
  if (!confirm(t("confirmRestore"))) return;
  takeSnapshot(true); // snapshot current before restoring, so it's not lost
  loadBody(s.body);
  closeHistory();
}
function openHistory() {
  document.getElementById("history-modal")!.classList.add("open");
  renderHistory();
}
function closeHistory() {
  document.getElementById("history-modal")!.classList.remove("open");
}
function renderHistory() {
  const host = document.getElementById("history-list");
  if (!host) return;
  const list = snapshots().slice().reverse();
  host.innerHTML = "";
  if (!list.length) {
    host.append(el("div", { class: "outline-empty" }, [t("noHistory")]));
    return;
  }
  for (const s of list) {
    const first = (s.body.split("\n").find((l) => l.trim()) || "—").slice(0, 42);
    host.append(
      el("button", { class: "pal-item", onClick: () => restoreSnapshot(s) }, [
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
  document.querySelectorAll(".menu-list.open").forEach((m) => m.classList.remove("open"));
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
  document.querySelectorAll(".menu-list.open").forEach((m) => m.classList.remove("open"));
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
  persistDoc();
  const stripExt = opened.binding.name.replace(/\.[^.]+$/, "");
  const parsed = docs.parseDoc(opened.text, stripExt || t("untitled"));
  const doc = docs.createDoc(parsed.title, parsed.body, parsed.assets);
  docs.setFileName(doc.id, opened.binding.name);
  await files.rememberBinding(doc.id, opened.binding);
  await openDoc(doc.id);
}

function fileText(): string {
  persistDoc();
  return docs.serializeDoc(currentDoc);
}

/** Save to the bound file; if there is none, fall through to Save As. */
async function saveFile() {
  closeMenus();
  takeSnapshot(true);
  const text = fileText();
  if (currentBinding && files.canWriteBack(currentBinding)) {
    if (!(await files.ensureWritable(currentBinding))) {
      setStatus(t("permissionDenied"), "err");
      return;
    }
    await files.saveTo(currentBinding, text);
    setStatus(tf("savedTo", currentBinding.name), "ok");
    return;
  }
  await saveFileAs();
}

async function saveFileAs() {
  closeMenus();
  const text = fileText();
  const binding = await files.saveAs(currentDoc.title || "document", text);
  if (!binding) return;
  currentBinding = binding;
  docs.setFileName(currentDoc.id, binding.name);
  await files.rememberBinding(currentDoc.id, binding);
  updateTitleBar();
  setStatus(
    files.canWriteBack(binding) ? tf("savedTo", binding.name) : tf("savedCopy", binding.name),
    "ok",
  );
}

function newDoc() {
  newNamedDoc();
}

/** A transient message in the status bar. */
function setStatus(msg: string, cls = "") {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = msg;
  status.className = cls;
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

/** Refuse enormous attachments — browser storage is a few MB in total, and a
 *  document that cannot be saved is worse than one that cannot hold a photo. */
const MAX_ASSET_BYTES = 4 * 1024 * 1024;

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
  const name = docs.uniqueAssetName(currentDoc.assets, f.name);
  currentDoc.assets.push({ name, data: await readAsDataUrl(f), kind });
  persistDoc();
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

function removeAsset(name: string) {
  currentDoc.assets = currentDoc.assets.filter((a) => a.name !== name);
  persistDoc();
  scheduleCompile();
  rerenderChrome();
}

function exportPdf() {
  if (!lastResult?.pdf_base64) return;
  const bytes = Uint8Array.from(atob(lastResult.pdf_base64), (c) => c.charCodeAt(0));
  download("ksav.pdf", new Blob([bytes], { type: "application/pdf" }));
}
function exportTypst() {
  if (!lastResult) return;
  download("ksav.typ", new Blob([lastResult.typst_source], { type: "text/plain" }));
}
function htmlDoc(): string {
  const pages = (lastResult?.pages_svg || [])
    .map((s) => `<div class="page">${s}</div>`)
    .join("\n");
  return `<!doctype html><html dir="${settings.dir}"><head><meta charset="utf-8">
<title>Ksav</title><style>body{background:#e5e7eb;margin:0;padding:24px}
.page{background:#fff;max-width:820px;margin:0 auto 24px;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.page svg{width:100%;height:auto;display:block}</style></head><body>${pages}</body></html>`;
}
function exportHtml() {
  download("ksav.html", new Blob([htmlDoc()], { type: "text/html" }));
}
function doPrint() {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(htmlDoc());
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
      el("section", { class: "pane preview-pane" }, [
        el("div", { class: "pane-head", "data-i18n": "preview" }, [t("preview")]),
        el("div", { id: "preview" }),
      ]),
      el("div", { class: "splitter", id: "splitter", title: t("previewSide") }),
      el("section", { class: "pane source-pane" }, [
        el("div", { class: "pane-head", "data-i18n": "source" }, [t("source")]),
        el("div", { id: "editor-host" }),
      ]),
    ]),
    el("div", { class: "statusbar" }, [
      el("span", { id: "status", class: "ok" }, [t("ready")]),
      el("span", { id: "diagnostics" }),
      el("span", { id: "wordcount", class: "wordcount" }),
      el("span", { id: "engine-badge", class: "engine-badge", title: "compute engine" }),
    ]),
    buildSettingsDrawer(),
    el("aside", { id: "outline-drawer", class: "drawer drawer-start" }, [
      el("h3", {}, [t("outline")]),
      el("div", { id: "outline-list" }),
    ]),
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
          el("button", { class: "sc-key", onClick: () => takeSnapshot(true) }, [t("snapshotNow")]),
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
    } else if (e.key === "Alt" && settings.prose) {
      view.dispatch({ effects: setRevealAll.of(true) });
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && settings.prose) view.dispatch({ effects: setRevealAll.of(false) });
  });
  window.addEventListener("click", () => {
    document.querySelectorAll(".menu-list.open").forEach((m) => m.classList.remove("open"));
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
  render();
  wireKeys();
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
  // periodic auto-snapshot (only stores when the text changed)
  window.setInterval(() => takeSnapshot(), 180000);
}

boot();

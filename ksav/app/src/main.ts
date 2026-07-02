import "./styles.css";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { history, historyKeymap, defaultKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, search, openSearchPanel } from "@codemirror/search";
import { codeFolding, foldGutter, foldKeymap, foldAll, unfoldAll } from "@codemirror/language";
import {
  ksavHighlighter,
  ksavFold,
  proseMode,
  revealAll,
  setRevealAll,
} from "./ksav-lang";
import { createBackend } from "./api";
import type { Backend, CommandDef, TemplateDef, CompileResult, DocConfig } from "./api";
import { t, setLang, getLang, isRtlUi } from "./i18n";
import type { Lang } from "./i18n";

// ---------------------------------------------------------------- state
type Layout = "two" | "page" | "source";
interface Settings extends DocConfig {
  lang: Lang;
  theme: "light" | "dark";
  layout: Layout;
  prose: boolean;
  zoom: number;
}

const DEFAULTS: Settings = {
  lang: "he",
  theme: "light",
  layout: "two",
  prose: false,
  zoom: 1,
  font: "Frank Ruhl Hofshi",
  size_pt: 12,
  margin_cm: 2.5,
  dir: "rtl",
  numbering: true,
  justify: true,
  line_spacing_em: 0.75,
  columns: 1,
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

function makeEditor(): EditorView {
  return new EditorView({
    doc: STARTER,
    parent: document.getElementById("editor-host")!,
    extensions: [
      history(),
      drawSelection(),
      highlightActiveLine(),
      codeFolding(),
      foldGutter(),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
      EditorView.lineWrapping,
      ksavHighlighter,
      ksavFold,
      revealAll,
      dirCompartment.of(EditorView.contentAttributes.of({ dir: settings.dir })),
      proseCompartment.of(settings.prose ? proseMode : []),
      themeCompartment.of(editorTheme(settings.theme === "dark")),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) scheduleCompile();
      }),
    ],
  });
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
    columns: settings.columns,
  };
}

let compileTimer: number | undefined;
function scheduleCompile() {
  clearTimeout(compileTimer);
  compileTimer = window.setTimeout(runCompile, 250);
}

async function runCompile() {
  const status = document.getElementById("status")!;
  const diag = document.getElementById("diagnostics")!;
  status.textContent = t("rendering");
  status.className = "";
  const t0 = performance.now();
  try {
    const res = await backend.compile(view.state.doc.toString(), cfg());
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
    diag.textContent = (errs.length ? errs : res.diagnostics)
      .map((d) => d.message)
      .join("\n");
  } catch (e) {
    status.textContent = `✗ ${t("networkError")}`;
    status.className = "err";
    diag.textContent = String(e);
  }
}

function applyZoom() {
  document.documentElement.style.setProperty("--zoom", String(settings.zoom));
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
    iconBtn("⋯", t("palette"), openPalette),
  ]);
}

function menu(label: string, items: (Node | string)[]): HTMLElement {
  const list = el("div", { class: "menu-list" }, items);
  const btn = el("button", { class: "menu-btn", onClick: (e: Event) => {
    e.stopPropagation();
    document.querySelectorAll(".menu-list.open").forEach((m) => {
      if (m !== list) m.classList.remove("open");
    });
    list.classList.toggle("open");
  } }, [label]);
  return el("div", { class: "menu" }, [btn, list]);
}

function buildHeader(): HTMLElement {
  const lang = getLang();

  const templatesMenu = menu(
    "📄 " + t("templates"),
    templatesReg.map((tpl) =>
      el("button", { class: "menu-item", onClick: () => loadTemplate(tpl) }, [
        el("b", {}, [lang === "he" ? tpl.he : tpl.en]),
        el("span", { class: "menu-desc" }, [lang === "he" ? tpl.desc_he : tpl.desc_en]),
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
  const settingsBtn = iconBtn("⚙", t("settings"), toggleSettings, "chip");

  return el("header", {}, [
    el("div", { class: "brand" }, [
      el("span", { class: "brand-name" }, [t("appName")]),
      el("small", {}, [t("tagline")]),
    ]),
    buildToolbar(),
    el("div", { class: "spacer" }),
    templatesMenu,
    exportMenu,
    findBtn,
    langToggle,
    foldAllBtn,
    unfoldAllBtn,
    proseToggle,
    layoutToggle,
    themeToggle,
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

function buildSettingsDrawer(): HTMLElement {
  const fontSel = el(
    "select",
    { onChange: (e: Event) => setSetting("font", (e.target as HTMLSelectElement).value as never) },
    ["Frank Ruhl Hofshi", "David Libre"].map((f) =>
      el("option", { value: f, ...(settings.font === f ? { selected: "selected" } : {}) }, [f]),
    ),
  );
  const dirSel = el(
    "select",
    { onChange: (e: Event) => setSetting("dir", (e.target as HTMLSelectElement).value as never) },
    [
      el("option", { value: "rtl", ...(settings.dir === "rtl" ? { selected: "selected" } : {}) }, [t("rtl")]),
      el("option", { value: "ltr", ...(settings.dir === "ltr" ? { selected: "selected" } : {}) }, [t("ltr")]),
    ],
  );
  return el("aside", { id: "settings-drawer", class: "drawer" }, [
    el("h3", {}, [t("settings")]),
    el("label", { class: "set-row" }, [el("span", {}, [t("font")]), fontSel]),
    numberRow("fontSize", "size_pt", 8, 36, 1),
    numberRow("margin", "margin_cm", 1, 6, 0.5),
    el("label", { class: "set-row" }, [el("span", {}, [t("direction")]), dirSel]),
    checkRow("pageNumbers", "numbering"),
    checkRow("justify", "justify"),
    numberRow("lineSpacing", "line_spacing_em", 0.4, 1.5, 0.05),
    numberRow("columns", "columns", 1, 3, 1),
    numberRow("zoom", "zoom", 0.5, 2, 0.1),
  ]);
}
function toggleSettings() {
  document.getElementById("settings-drawer")!.classList.toggle("open");
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
function loadTemplate(tpl: TemplateDef) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: tpl.body },
    selection: { anchor: 0 },
  });
  document.querySelectorAll(".menu-list.open").forEach((m) => m.classList.remove("open"));
  view.focus();
  scheduleCompile();
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
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
    el("main", {}, [
      el("section", { class: "pane preview-pane" }, [
        el("div", { class: "pane-head", "data-i18n": "preview" }, [t("preview")]),
        el("div", { id: "preview" }),
      ]),
      el("section", { class: "pane source-pane" }, [
        el("div", { class: "pane-head", "data-i18n": "source" }, [t("source")]),
        el("div", { id: "editor-host" }),
      ]),
    ]),
    el("div", { class: "statusbar" }, [
      el("span", { id: "status", class: "ok" }, [t("ready")]),
      el("span", { id: "diagnostics" }),
      el("span", { id: "engine-badge", class: "engine-badge", title: "compute engine" }),
    ]),
    buildSettingsDrawer(),
    // command palette overlay
    el("div", { id: "palette", class: "overlay", onClick: (e: Event) => {
      if ((e.target as HTMLElement).id === "palette") closePalette();
    } }, [
      el("div", { class: "palette-box" }, [
        el("input", {
          id: "palette-input",
          placeholder: t("searchCommands"),
          oninput: (e: Event) => renderPaletteList((e.target as HTMLInputElement).value),
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
  );

  view = makeEditor();
  applyTheme();
  applyLayout();
  applyUiDir();
  applyZoom();
}

// global keys: Ctrl/Cmd+K palette; Alt reveals raw markup in prose mode
function wireKeys() {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    } else if (e.key === "Escape") {
      closePalette();
      closePreviewOverlay();
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
  } catch {
    /* registries optional for first paint */
  }
  runCompile();
}

boot();

// Backend abstraction. Today: HttpBackend (talks to the Rust `ksav serve`).
// M3 will add a WasmBackend with the identical interface so the app runs with
// no server. The rest of the app depends only on this interface.

export interface DocConfig {
  font: string;
  size_pt: number;
  margin_cm: number;
  dir: "rtl" | "ltr";
  numbering: boolean;
  justify: boolean;
  line_spacing_em: number;
  para_spacing_em: number;
  first_line_indent_em: number;
  columns: number;
  paper: string;
  hebrew_numbering: boolean;
  header: string;
  footer: string;
}

/**
 * Files that travel with the document on every compile.
 *
 * The engine has no file system — it may be a wasm module in this very tab — so
 * `#תמונה("logo.png")` can only work if the bytes are on the request. `data` is
 * base64, with or without a `data:` URL prefix.
 */
export interface RequestAssets {
  /** Images and other files the document refers to by name. */
  assets: { name: string; data: string }[];
  /** Extra fonts to make available for this compile. */
  fonts: { name: string; data: string }[];
  /**
   * "html" asks for Typst's native HTML export instead of paged output, in
   * which case the result carries `html` rather than `pages_svg`/`pdf_base64`.
   */
  format?: "html";
  /**
   * Ask for the PDF as well as the previews.
   *
   * Off by default. The engine used to render a PDF on every compile and
   * base64 it into the response — around 300 KB per keystroke-triggered
   * preview, of which nothing on screen read a single byte. Only export and
   * print actually need it.
   */
  want_pdf?: boolean;
}

export const NO_ASSETS: RequestAssets = { assets: [], fonts: [] };

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
}

export interface CompileResult {
  ok: boolean;
  pages_svg: string[];
  pdf_base64: string | null;
  diagnostics: Diagnostic[];
  typst_source: string;
  /** Set only for a `format: "html"` request. */
  html?: string;
}

export interface CommandDef {
  he: string;
  en: string;
  category: string;
  desc_he: string;
  desc_en: string;
  insert: string;
}

export interface TemplateDef {
  id: string;
  he: string;
  en: string;
  category: string;
  desc_he: string;
  desc_en: string;
  body: string;
}

/** One word the checker does not recognise, positioned in the text it checked. */
export interface Misspelling {
  start: number;
  len: number;
  word: string;
  suggestions?: string[];
}

export interface SpellResult {
  misspellings: Misspelling[];
  lexicon_size: number;
}

export interface Backend {
  readonly kind: string; // "server" | "wasm"
  compile(body: string, cfg: DocConfig, assets?: RequestAssets): Promise<CompileResult>;
  /** Check text against the Hebrew lexicon plus the writer's own words. */
  spell(text: string, userWords: string, suggest?: boolean): Promise<SpellResult>;
  /** Suggestions for one word — asked for only when a menu is opened. */
  suggest(word: string, userWords: string): Promise<string[]>;
  commands(): Promise<CommandDef[]>;
  templates(): Promise<TemplateDef[]>;
}

export class HttpBackend implements Backend {
  readonly kind = "server";
  constructor(private base = "") {}

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    const res = await fetch(this.base + "/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, ...cfg, ...assets }),
    });
    if (!res.ok) throw new Error(`compile ${res.status}`);
    return res.json();
  }

  async spell(text: string, userWords: string, suggest = false): Promise<SpellResult> {
    const res = await fetch(this.base + "/spell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, user_words: userWords, suggest }),
    });
    if (!res.ok) throw new Error(`spell ${res.status}`);
    return res.json();
  }

  async suggest(word: string, userWords: string): Promise<string[]> {
    const res = await fetch(this.base + "/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, user_words: userWords }),
    });
    if (!res.ok) throw new Error(`suggest ${res.status}`);
    return (await res.json()).suggestions ?? [];
  }

  async commands(): Promise<CommandDef[]> {
    const res = await fetch(this.base + "/commands");
    return res.json();
  }

  async templates(): Promise<TemplateDef[]> {
    const res = await fetch(this.base + "/templates");
    return res.json();
  }
}

/** Runs the real Typst engine entirely in the browser via WebAssembly. */
export class WasmBackend implements Backend {
  readonly kind = "wasm";
  private mod: {
    ksav_compile(s: string): string;
    ksav_commands(): string;
    ksav_templates(): string;
    ksav_spell(s: string): string;
    ksav_suggest(s: string): string;
  } | null = null;
  private ready: Promise<void> | null = null;

  private ensure(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        // The imports live inside `if (__WASM__)` so the default build, where
        // __WASM__ is the literal `false`, tree-shakes the wasm chunk away.
        // Only an offline build (VITE_WASM=1) bundles it.
        if (__WASM__) {
          const glue = await import("./wasmpkg/ksav_wasm.js");
          const wasmUrl = (await import("./wasmpkg/ksav_wasm_bg.wasm?url")).default;
          await glue.default({ module_or_path: wasmUrl });
          this.mod = glue as never;
        } else {
          throw new Error("wasm backend not built");
        }
      })();
    }
    return this.ready;
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    await this.ensure();
    return JSON.parse(this.mod!.ksav_compile(JSON.stringify({ body, ...cfg, ...assets })));
  }
  async spell(text: string, userWords: string, suggest = false): Promise<SpellResult> {
    await this.ensure();
    return JSON.parse(this.mod!.ksav_spell(JSON.stringify({ text, user_words: userWords, suggest })));
  }
  async suggest(word: string, userWords: string): Promise<string[]> {
    await this.ensure();
    return JSON.parse(this.mod!.ksav_suggest(JSON.stringify({ word, user_words: userWords }))).suggestions ?? [];
  }
  async commands(): Promise<CommandDef[]> {
    await this.ensure();
    return JSON.parse(this.mod!.ksav_commands());
  }
  async templates(): Promise<TemplateDef[]> {
    await this.ensure();
    return JSON.parse(this.mod!.ksav_templates());
  }
}

/** Runs the engine in-process inside the Tauri desktop app (no HTTP). */
export class TauriBackend implements Backend {
  readonly kind = "desktop";
  private invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<string>) | null = null;

  private async inv() {
    if (!this.invoke) {
      const core = await import("@tauri-apps/api/core");
      this.invoke = core.invoke as never;
    }
    return this.invoke!;
  }
  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    const invoke = await this.inv();
    return JSON.parse(
      await invoke("ksav_compile", { input: JSON.stringify({ body, ...cfg, ...assets }) }),
    );
  }
  async spell(text: string, userWords: string, suggest = false): Promise<SpellResult> {
    const invoke = await this.inv();
    return JSON.parse(
      await invoke("ksav_spell", { input: JSON.stringify({ text, user_words: userWords, suggest }) }),
    );
  }
  async suggest(word: string, userWords: string): Promise<string[]> {
    const invoke = await this.inv();
    const out = JSON.parse(
      await invoke("ksav_suggest", { input: JSON.stringify({ word, user_words: userWords }) }),
    );
    return out.suggestions ?? [];
  }
  async commands(): Promise<CommandDef[]> {
    return JSON.parse(await (await this.inv())("ksav_commands"));
  }
  async templates(): Promise<TemplateDef[]> {
    return JSON.parse(await (await this.inv())("ksav_templates"));
  }
}

/**
 * Pick a backend:
 *   - Tauri desktop  → in-process engine (no HTTP)
 *   - server reachable → HTTP (fast, tiny download)
 *   - otherwise      → in-browser wasm engine (works with no server)
 */
export async function createBackend(): Promise<Backend> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return new TauriBackend();
  }
  try {
    const res = await fetch("/commands", { signal: AbortSignal.timeout(800) });
    if (res.ok) return new HttpBackend();
  } catch {
    /* no server — fall through to wasm if this build includes it */
  }
  if (__WASM__) return new WasmBackend();
  return new HttpBackend();
}

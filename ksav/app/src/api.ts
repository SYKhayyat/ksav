// Backend abstraction. Today: HttpBackend (talks to the Rust `ksav serve`).
// M3 will add a WasmBackend with the identical interface so the app runs with
// no server. The rest of the app depends only on this interface.

export interface DocConfig {
  font: string;
  size_pt: number;
  margin_cm: number;
  dir: "rtl" | "ltr";
  /**
   * The language the document is written in, as a BCP-47 tag.
   *
   * Empty means "follow the direction" — the engine reads `ltr` as English and
   * `rtl` as Hebrew. It matters because Typst hyphenates, shapes quotation marks
   * and names its own generated headings by language, so an English document
   * typeset as Hebrew gets no hyphenation and the wrong quotes.
   */
  lang?: string;
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
/**
 * One asset on a compile request.
 *
 * `hash` identifies the bytes; `data` (base64) is sent only when the engine is
 * not known to hold that hash already. An 8 MB image is ~11 MB of base64, and it
 * used to ride along on every keystroke-driven compile — so a hash-only entry,
 * resolved from the engine's content cache, is the difference between a tiny
 * request and an 11 MB one on every pause in typing.
 */
export interface RequestAsset {
  name: string;
  hash: string;
  /** base64; present only the first time the engine needs to see these bytes. */
  data?: string;
}

export interface RequestAssets {
  /** Images and other files the document refers to by name. */
  assets: RequestAsset[];
  /** Extra fonts to make available for this compile. */
  fonts: RequestAsset[];
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
  /** Hashes the client omitted bytes for but the engine did not hold; the client
   *  re-sends them. Absent from older engines, which is treated as "none". */
  missing_assets?: string[];
}

/**
 * Tracks which asset hashes an engine session already holds, so their bytes can
 * be omitted from a request and resolved from the engine's cache instead.
 *
 * One per backend instance — the cache lives in that engine's process/worker, so
 * a fresh backend (or a respawned worker) starts with nothing confirmed. When the
 * engine reports a hash it no longer has, that hash is forgotten and its bytes go
 * out again, which keeps the two sides honest without either trusting the other's
 * memory across a restart.
 */
class AssetDeduper {
  private confirmed = new Set<string>();

  reset() {
    this.confirmed.clear();
  }

  /** The wire form of `assets`, with bytes dropped for anything already cached,
   *  plus the hashes whose bytes this request does carry (to confirm on success). */
  private prepare(assets: RequestAssets): { wire: RequestAssets; sent: string[] } {
    const sent: string[] = [];
    const strip = (list: RequestAsset[]): RequestAsset[] =>
      list.map((a) => {
        if (a.hash && this.confirmed.has(a.hash)) return { name: a.name, hash: a.hash };
        if (a.hash) sent.push(a.hash);
        return a; // carries data
      });
    return { wire: { ...assets, assets: strip(assets.assets), fonts: strip(assets.fonts) }, sent };
  }

  /** Run a compile with byte-deduplicated assets, re-sending on a cache miss. */
  async compile(
    raw: (a: RequestAssets) => Promise<CompileResult>,
    assets: RequestAssets,
  ): Promise<CompileResult> {
    const first = this.prepare(assets);
    let res = await raw(first.wire);
    if (res.missing_assets && res.missing_assets.length) {
      // The engine dropped these — send the bytes and try once more.
      for (const h of res.missing_assets) this.confirmed.delete(h);
      const retry = this.prepare(assets);
      res = await raw(retry.wire);
      for (const h of retry.sent) this.confirmed.add(h);
    } else {
      for (const h of first.sent) this.confirmed.add(h);
    }
    return res;
  }
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
  /** The language the body is written in: "he" or "en". Loading a template
   *  switches the document to the direction that goes with it — an English
   *  letter set flush right is nobody's letter. */
  lang: string;
  desc_he: string;
  desc_en: string;
  body: string;
}

/** One word the checker does not recognise, positioned in the text it checked. */
export interface Misspelling {
  start: number;
  len: number;
  word: string;
  /** Which lexicon flagged it: "he" or "en". */
  lang?: string;
  suggestions?: string[];
}

export interface SpellResult {
  misspellings: Misspelling[];
  /** Both lexicons together. */
  lexicon_size: number;
  /** Per language, so the interface can name what it is actually checking
   *  rather than repeat a claim the engine might not be able to keep. */
  lexicon_sizes?: { he: number; en: number };
}

/** A source that arrived from Girsa and is waiting for the cursor
 *  (spec.md §10.6). Already real Ksav markup: the packet is rendered in Rust
 *  the moment it lands, so there is no second renderer here to drift from it. */
export interface Arrival {
  markup: string;
  display: string;
  reference: string;
  /** A whole document handed over from Girsa's buffer, rather than a quote to
   *  drop in at the caret. The editor asks before replacing what is open. */
  whole: boolean;
}

/** One place a phrase turns up, as the library answered (spec.md §10.4). */
export interface Mekor {
  id: string;
  ref: string;
  /** The citation, printed by the library — the pen does not know what a
   *  siman is, and does not have to. */
  display: string;
  he_title: string;
  text: string;
}

/** What Girsa says about a phrase. `total` first, because a phrase in four
 *  thousand places has no source — it has a language, and offering the first
 *  as "the mekor" would be an invention. */
export interface Mekoros {
  phrase: string;
  total: number;
  is_a_quotation: boolean;
  /** The one-line answer, in the library's own words. */
  said: string;
  places: Mekor[];
  error?: string;
}

export interface Backend {
  readonly kind: string; // "server" | "wasm"
  compile(body: string, cfg: DocConfig, assets?: RequestAssets): Promise<CompileResult>;
  /** Check text against both lexicons plus the writer's own words. */
  spell(text: string, userWords: string, suggest?: boolean): Promise<SpellResult>;
  /** Suggestions for one word — asked for only when a menu is opened. */
  suggest(word: string, userWords: string): Promise<string[]>;
  commands(): Promise<CommandDef[]>;
  templates(): Promise<TemplateDef[]>;
  /** Sources handed over by Girsa since the last ask. Drained, so asking twice
   *  does not insert the same quote twice. Empty in a plain browser, which has
   *  no listener for Girsa to hand anything to. */
  inbox(): Promise<Arrival[]>;
  /** Where is this phrase from? Asked of Girsa, which has the corpus. */
  mekoros(phrase: string, except?: string): Promise<Mekoros>;
  /** Nothing fitted: put the phrase in Girsa's search and bring it up. */
  searchInGirsa(phrase: string): Promise<void>;
  /** Turn the citations in a piece of prose into live refs — the certain ones
   *  only (spec.md §10.5). Comes back rewritten, or unchanged. */
  linkify(text: string): Promise<string>;
}

export class HttpBackend implements Backend {
  readonly kind = "server";
  private deduper = new AssetDeduper();
  constructor(private base = "") {}

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    return this.deduper.compile(async (a) => {
      const res = await fetch(this.base + "/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, ...cfg, ...a }),
      });
      if (!res.ok) throw new Error(`compile ${res.status}`);
      return res.json();
    }, assets);
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

  async inbox(): Promise<Arrival[]> {
    try {
      const res = await fetch(this.base + "/inbox");
      return res.ok ? await res.json() : [];
    } catch {
      // The editor polls this every second; a server that went away is a
      // thing to stop asking about quietly, not to shout in the console.
      return [];
    }
  }

  async mekoros(phrase: string, except?: string): Promise<Mekoros> {
    const res = await fetch(this.base + "/mekoros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase, except: except ?? null }),
    });
    return res.json();
  }

  async searchInGirsa(phrase: string): Promise<void> {
    await fetch(this.base + "/mekoros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase, search: true }),
    });
  }

  async linkify(text: string): Promise<string> {
    const res = await fetch(this.base + "/linkify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const out = await res.json();
    if (out.error) throw new Error(out.error);
    return out.text ?? text;
  }
}

/**
 * Runs the real Typst engine entirely in the browser via WebAssembly — in a
 * worker, so a compile does not freeze the tab.
 *
 * This used to call `ksav_compile` straight from the page. A compile is 0.4–2.9
 * s of CPU-bound layout and the editor fires one on every pause in typing, so
 * the "no server needed" build spent those seconds with no scrolling, no
 * typing and no caret. wasm-bindgen cannot yield mid-compile; the work has to
 * happen on another thread.
 */
/** Wall-clock ceiling for a client-side compile, mirroring the server's. */
const COMPILE_TIMEOUT_MS = 20_000;

const COMPILE_TIMEOUT_MESSAGE =
  "ההידור ארך יותר מדי והופסק — לולאה או חזרה עם מספר גדול מאוד עלולה לגרום לכך; " +
  "בדקו את הגבולות של #עבור/#כלעוד · compilation timed out and was stopped — a loop or " +
  "repetition with a very large count can cause this; check any #for/#while bounds";

/** A compile result carrying a single error diagnostic — the shape the engine
 *  returns on failure, so a client-side timeout reads identically to a real one. */
function errorResult(message: string): CompileResult {
  return { ok: false, pages_svg: [], pdf_base64: null, typst_source: "", diagnostics: [{ severity: "error", message }] };
}

interface Pending {
  resolve: (s: string) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class WasmBackend implements Backend {
  readonly kind = "wasm";
  private worker: Worker | null = null;
  private booting: Promise<Worker> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private deduper = new AssetDeduper();

  private ensure(): Promise<Worker> {
    if (this.worker) return Promise.resolve(this.worker);
    if (!this.booting) {
      this.booting = this.spawn();
      // A failed spawn must not be remembered as a permanent verdict.
      this.booting.catch(() => {
        this.booting = null;
      });
    }
    return this.booting;
  }

  private async spawn(): Promise<Worker> {
    // `__WASM__` is the literal `false` in the default build, so this throw is
    // unconditional there and everything after it is dead code the bundler
    // removes — taking the worker chunk and the 28 MB module with it. That only
    // works because the `new Worker(new URL(…))` lives behind a dynamic import:
    // written inline it is a *static* construct the bundler resolves before it
    // ever evaluates this branch. See `wasm-worker-host.ts`.
    if (!__WASM__) throw new Error("wasm backend not built");
    const { createEngineWorker } = await import("@wasm-worker-host");
    const w = createEngineWorker();
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; output?: string; error?: string }>) => {
      const { id, ok, output, error } = e.data;
      const slot = this.pending.get(id);
      if (!slot) return;
      this.pending.delete(id);
      if (slot.timer) clearTimeout(slot.timer);
      if (ok) slot.resolve(output ?? "");
      else slot.reject(new Error(error ?? "engine error"));
    };
    // A worker that dies takes every call in flight with it; failing them is the
    // only way the editor learns that rather than waiting forever.
    w.onerror = (e) => this.failAll(new Error(e.message || "engine worker failed"));
    this.worker = w;
    return w;
  }

  private failAll(err: Error) {
    for (const slot of this.pending.values()) {
      if (slot.timer) clearTimeout(slot.timer);
      slot.reject(err);
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.booting = null;
    // The terminated worker took its asset cache with it, so nothing is confirmed
    // cached anymore — the next compile must send bytes, not just hashes.
    this.deduper.reset();
  }

  private async call(name: string, input: string, timeoutMs?: number): Promise<string> {
    const w = await this.ensure();
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      const slot: Pending = { resolve, reject };
      if (timeoutMs) {
        slot.timer = setTimeout(() => {
          if (!this.pending.has(id)) return;
          // Typst cannot be interrupted mid-compile, but a Worker can be killed
          // outright. A runaway (a `#for` with a wrong bound) would otherwise pin
          // the one engine worker and queue every later compile and spell check
          // behind it forever, finishing the tab until reload. Terminating the
          // worker ends the runaway and lets the next call boot a fresh one.
          this.failAll(new Error("timeout"));
        }, timeoutMs);
      }
      this.pending.set(id, slot);
      w.postMessage({ id, call: name, input });
    });
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    try {
      return await this.deduper.compile(
        async (a) =>
          JSON.parse(
            await this.call("compile", JSON.stringify({ body, ...cfg, ...a }), COMPILE_TIMEOUT_MS),
          ) as CompileResult,
        assets,
      );
    } catch (e) {
      // A killed or crashed worker surfaces as an ordinary compile result with a
      // diagnostic — the same shape the server returns — so the status bar shows
      // it rather than the editor hanging on an unresolved promise. The throw
      // reaches here without the deduper confirming any hashes, and failAll has
      // already reset it, so the respawned worker starts from a clean slate.
      return errorResult(
        e instanceof Error && e.message === "timeout"
          ? COMPILE_TIMEOUT_MESSAGE
          : `מנוע ההידור נעצר · the compile engine stopped${e instanceof Error ? `: ${e.message}` : ""}`,
      );
    }
  }
  async spell(text: string, userWords: string, suggest = false): Promise<SpellResult> {
    return JSON.parse(
      await this.call("spell", JSON.stringify({ text, user_words: userWords, suggest })),
    );
  }
  async suggest(word: string, userWords: string): Promise<string[]> {
    const out = JSON.parse(
      await this.call("suggest", JSON.stringify({ word, user_words: userWords })),
    );
    return out.suggestions ?? [];
  }
  async commands(): Promise<CommandDef[]> {
    return JSON.parse(await this.call("commands", ""));
  }
  async templates(): Promise<TemplateDef[]> {
    return JSON.parse(await this.call("templates", ""));
  }

  /** A tab has no listener on it, so Girsa has nowhere to hand a source. The
   *  clipboard still works: one Ctrl+C in Girsa puts the packet down and this
   *  build reads the plain and HTML flavours like anything else would. */
  async inbox(): Promise<Arrival[]> {
    return [];
  }

  /** A tab cannot reach Girsa's loopback: the token lives in a file only the
   *  two applications can read. Saying so beats a silent empty answer. */
  async mekoros(phrase: string): Promise<Mekoros> {
    return {
      phrase,
      total: 0,
      is_a_quotation: false,
      said: "",
      places: [],
      error: "חיפוש מקורות פועל כשגרסא פתוחה לצד כסב (לא בדפדפן)",
    };
  }

  async searchInGirsa(): Promise<void> {
    /* nothing to reach */
  }

  /** Unchanged: with no Girsa to ask, the honest answer is the prose as it
   *  was written. Linking a citation this build cannot resolve is the one
   *  thing spec.md §10.5 forbids. */
  async linkify(text: string): Promise<string> {
    return text;
  }
}

/** Runs the engine in-process inside the Tauri desktop app (no HTTP). */
export class TauriBackend implements Backend {
  readonly kind = "desktop";
  private deduper = new AssetDeduper();
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
    const run = this.deduper.compile(
      async (a) =>
        JSON.parse(await invoke("ksav_compile", { input: JSON.stringify({ body, ...cfg, ...a }) })) as CompileResult,
      assets,
    );
    // Typst cannot be interrupted, and the in-process compile runs off the UI
    // thread, so a runaway `#for` leaves the window alive but the writer waiting
    // with nothing said. A deadline on this side unblocks the editor and shows
    // why; the abandoned compile finishes on tokio's blocking pool, which is
    // large enough that one lost thread does not wedge a single-user desktop app.
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<CompileResult>((resolve) => {
      timer = setTimeout(() => resolve(errorResult(COMPILE_TIMEOUT_MESSAGE)), COMPILE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([run, deadline]);
    } finally {
      clearTimeout(timer!);
    }
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
  async inbox(): Promise<Arrival[]> {
    return JSON.parse(await (await this.inv())("ksav_inbox"));
  }
  async mekoros(phrase: string, except?: string): Promise<Mekoros> {
    return JSON.parse(
      await (await this.inv())("ksav_mekoros", { phrase, except: except ?? null }),
    );
  }
  async searchInGirsa(phrase: string): Promise<void> {
    await (await this.inv())("ksav_search_in_girsa", { phrase });
  }
  async linkify(text: string): Promise<string> {
    const out = JSON.parse(await (await this.inv())("ksav_linkify", { text }));
    if (out.error) throw new Error(out.error);
    return out.text ?? text;
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

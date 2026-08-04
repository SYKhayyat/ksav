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
  /**
   * Per-edge margins, in cm. Absent means "use `margin_cm`" — which is not the
   * same as zero, and is why these are optional rather than defaulted.
   *
   * `inner`/`outer` are relative to the **binding**, not to the paper: on a
   * two-sided document they swap sides every page, so the text block keeps the
   * same distance from the fold on both leaves. That is the whole reason they
   * are not called left and right.
   */
  margin_top_cm?: number;
  margin_bottom_cm?: number;
  margin_inner_cm?: number;
  margin_outer_cm?: number;
  /** Extra width on the inner margin alone — the strip the binding swallows. */
  gutter_cm?: number;
  /** Print on both sides: mirror the margins, allow verso/recto heads to differ. */
  two_sided?: boolean;
  /** Running heads for even (verso) and odd (recto) pages. Empty = use header/footer. */
  header_even?: string;
  header_odd?: string;
  footer_even?: string;
  footer_odd?: string;
  /** Where the running head sits. Only means anything once `two_sided` is on. */
  head_align?: "center" | "outside" | "inside";
  /** PDF metadata. Without a title the file opens nameless in every reader. */
  title?: string;
  author?: string;
  keywords?: string[];
  /** A PDF standard to enforce, spelled as Typst spells it: `a-2b`, `ua-1`, … */
  pdf_standard?: string;
  /** Emit the PDF accessibility tree. On by default, as in Typst. */
  pdf_tagged?: boolean;
  /**
   * Which pages to export, `1,3,5-9`. A property of one export rather than of
   * the document, so it is set at the moment of exporting and never persisted.
   */
  pdf_pages?: string;
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
  /**
   * Ask for the assembled Typst source as well as the previews.
   *
   * Off by default, and for the same reason as `want_pdf`. The source is the 75 KB
   * prelude plus the document: of an 84 KB response for a one-page preview, 75 KB
   * was this, and the only thing that reads it is "export .typ", which compiles
   * for itself.
   */
  want_source?: boolean;
}

export const NO_ASSETS: RequestAssets = { assets: [], fonts: [] };

export interface Diagnostic {
  severity: "error" | "warning";
  /** What the writer reads. Bilingual, and about their command rather than
   *  Typst's type names — the engine rephrases it (`engine/src/diagnostics.rs`),
   *  so every backend and anything else talking to `/compile` gets the same
   *  sentence rather than depending on this front end to make it legible. */
  message: string;
  /** Typst's own words, for the details affordance. Never the message. */
  raw?: string;
  /** 1-based line **in the body that was sent**, which carries the custom-command
   *  preamble in front of the writer's document. `diagview.ts` subtracts it. */
  line?: number | null;
  /** 1-based column, counted in characters. */
  column?: number | null;
  /** The command this is about, when one can be named. */
  about?: string | null;
  /** The nearest real command name, when the one written does not exist. */
  did_you_mean?: string | null;
}

export interface CompileResult {
  ok: boolean;
  /** Every page of the document, in order — filled in by `CompileCache` for any
   *  the engine left out because this client already had it. */
  pages_svg: string[];
  /** One fingerprint per page, naming what is at each position. The client keeps
   *  its pages under these names and sends them back on the next compile, and the
   *  preview compares them to decide which page nodes to touch. */
  pages_hash?: string[];
  pdf_base64: string | null;
  diagnostics: Diagnostic[];
  /** The assembled Typst source — empty unless `want_source` asked for it. */
  typst_source: string;
  /** Set only for a `format: "html"` request. */
  html?: string;
  /** Hashes the client omitted bytes for but the engine did not hold; the client
   *  re-sends them. Absent from older engines, which is treated as "none". */
  missing_assets?: string[];
}

/**
 * What the engine actually puts on the wire: a page is `null` when the client
 * said it already holds the page with that fingerprint.
 *
 * Deliberately not the shape the rest of the app sees. Everything downstream of
 * [`CompileCache`] gets a complete `pages_svg`, because a preview that has to
 * remember which of its pages are real is a preview that will one day draw a
 * `null`.
 */
type WirePages = (string | null)[];

/**
 * The rendered pages this client is holding, by fingerprint.
 *
 * A one-character edit in a 48-page document leaves 47 pages byte-identical: 9.7
 * MB was serialised, sent, parsed and written into the DOM on every pause in
 * typing to deliver 40 KB of actual change. So the client tells the engine which
 * pages it still has, and gets back `null` for those.
 *
 * The engine keeps no matching state — it answers only against the list on the
 * request — so this cache can never desynchronise it. The worst it can do to
 * itself is forget a page it claimed, which is caught and costs one extra
 * round trip.
 */
class PageStore {
  private held = new Map<string, string>();
  private bytes = 0;
  /** Roughly three copies of a very long document. Enough that a session's own
   *  pages stay resident; bounded so a long editing session cannot grow without
   *  end. */
  private static readonly CAP = 32 * 1024 * 1024;

  /** The fingerprints to tell the engine about. */
  have(): string[] {
    return [...this.held.keys()];
  }

  /** Remember the pages of a response that landed. */
  keep(pages: string[], hashes: string[] | undefined) {
    if (!hashes) return;
    for (let i = 0; i < pages.length && i < hashes.length; i++) {
      const h = hashes[i];
      if (!h || this.held.has(h)) continue;
      this.held.set(h, pages[i]);
      this.bytes += pages[i].length;
    }
    // A Map iterates in insertion order, and the document on screen was inserted
    // last, so evicting from the front drops the oldest pages first.
    for (const [h, svg] of this.held) {
      if (this.bytes <= PageStore.CAP) break;
      this.held.delete(h);
      this.bytes -= svg.length;
    }
  }

  /**
   * Put back the pages the engine left out.
   *
   * `null` — not a half-filled result — when a page we claimed to hold is not
   * actually here. The caller asks again for the whole document rather than
   * showing a gap, which is the one thing this must never do.
   */
  expand(res: CompileResult): CompileResult | null {
    if (!Array.isArray(res.pages_svg)) return res; // an html export carries none
    const wire = res.pages_svg as unknown as WirePages;
    if (!res.pages_hash) return res; // an engine that does not name its pages
    const pages: string[] = [];
    for (let i = 0; i < wire.length; i++) {
      const own = wire[i];
      if (typeof own === "string") {
        pages.push(own);
        continue;
      }
      const kept = this.held.get(res.pages_hash[i]);
      if (kept === undefined) return null;
      pages.push(kept);
    }
    return { ...res, pages_svg: pages };
  }
}

/**
 * What this engine session already has, so a request can leave it out: asset
 * bytes it holds, and rendered pages this client is still showing.
 *
 * One per backend instance — the asset cache lives in that engine's
 * process/worker, so a fresh backend (or a respawned worker) starts with nothing
 * confirmed. When the engine reports a hash it no longer has, that hash is
 * forgotten and its bytes go out again, which keeps the two sides honest without
 * either trusting the other's memory across a restart.
 */
export class CompileCache {
  private confirmed = new Set<string>();
  private pages = new PageStore();

  /** The engine lost its asset cache (a worker died). Pages are unaffected: the
   *  engine holds no page state to lose. */
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

  /**
   * Run a compile with the bytes and the pages the engine already has left out,
   * asking again for whatever turns out not to be there.
   *
   * At most one retry, and it asks for everything: a second guess after a wrong
   * one is how a cache turns a saving into a hang.
   */
  async compile(
    send: (payload: Record<string, unknown>) => Promise<CompileResult>,
    assets: RequestAssets,
  ): Promise<CompileResult> {
    const first = this.prepare(assets);
    let res = await send({ ...first.wire, have_pages: this.pages.have() });
    let sent = first.sent;
    let full = this.pages.expand(res);
    const lostAssets = res.missing_assets?.length ? res.missing_assets : null;

    if (lostAssets || !full) {
      if (lostAssets) for (const h of lostAssets) this.confirmed.delete(h);
      const retry = this.prepare(assets);
      // Nothing claimed on the retry when a page went missing: get the document
      // whole rather than guess a second time.
      res = await send({ ...retry.wire, have_pages: full ? this.pages.have() : [] });
      sent = retry.sent;
      // Still short is not possible with an empty claim, but if it ever were, no
      // pages beats wrong pages — `runCompile` leaves the last good preview up.
      full = this.pages.expand(res) ?? { ...res, pages_svg: [] };
    }

    for (const h of sent) this.confirmed.add(h);
    this.pages.keep(full.pages_svg, res.pages_hash);
    return full;
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

/**
 * One sefer in the catalogue the source index sorts by.
 *
 * `order` is its place in the traditional sequence — Tanach, then Shas in seder
 * order, then the poskim — and is the reason the index can put בבא בתרא after
 * בבא מציעא rather than before it.
 */
export interface SeferDef {
  canonical: string;
  kind: string;
  order: number;
  aliases: string[];
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
  /** The words around the match, with the match in `[brackets]` and any elision
   *  shown as `…`. **Not the whole segment** — the largest in the corpus is
   *  1,275,307 characters, and this used to be all of it, cut to 90 characters
   *  from the start on arrival. See `girsa_search::snippet`. */
  shown: string;
  /** How long the whole segment is, so a window into it does not read as all of
   *  it. */
  characters: number;
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

/**
 * A point on a rendered page, in Typst points.
 *
 * Points rather than pixels, because that is the unit the page's own SVG
 * `viewBox` is written in — so the client converts with the drawn element's
 * width and nothing else, and neither zoom nor the fit-to-width setting can
 * make the two sides disagree about where something is.
 */
export interface PagePoint {
  /** 0-based, matching `pages_svg`. */
  page: number;
  x_pt: number;
  y_pt: number;
}

/** A place in the body that was sent: 1-based line, 1-based character column.
 *  The same convention as [`Diagnostic`], so the same preamble subtraction
 *  applies (`diagview.lineInDocument`). */
export interface BodySpot {
  line: number;
  column: number;
}

export interface Backend {
  readonly kind: string; // "server" | "wasm"
  compile(body: string, cfg: DocConfig, assets?: RequestAssets): Promise<CompileResult>;
  /**
   * Inverse search: what did the writer type, that printed here?
   *
   * `null` for a click that landed on something the writer did not type — a
   * margin, a running head, a note-band rule — and for a document that does not
   * currently compile. The caller leaves the cursor alone in every one of those
   * cases, which is why they need not be told apart.
   */
  jump(body: string, cfg: DocConfig, at: PagePoint, assets?: RequestAssets): Promise<BodySpot | null>;
  /**
   * Forward search: where on the page did this land?
   *
   * Several places, in page order: a note whose body is set in both a band and
   * an endnote list prints twice, and text in a running head prints on every
   * page. Empty when it printed nowhere.
   */
  reveal(body: string, cfg: DocConfig, at: BodySpot, assets?: RequestAssets): Promise<PagePoint[]>;
  /** Check text against both lexicons plus the writer's own words. */
  spell(text: string, userWords: string, suggest?: boolean): Promise<SpellResult>;
  /** Suggestions for one word — asked for only when a menu is opened. */
  suggest(word: string, userWords: string): Promise<string[]>;
  commands(): Promise<CommandDef[]>;
  /** The sefer catalogue, for citation autocomplete. The same list the source
   *  index sorts by, so what the editor offers and where the index files it
   *  can never be two different opinions. */
  sefarim(): Promise<SeferDef[]>;
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

/**
 * A jump answer, from whatever the engine actually said.
 *
 * Deliberately paranoid about its input, because there are two ways to get a
 * reply with no answer in it and they look nothing alike: `{}` from a click that
 * landed on a margin, and the compile-shaped `{ok: false, diagnostics: […]}` a
 * busy or timed-out server returns. Both mean "leave the cursor alone", so both
 * are read as `null` here rather than being told apart by three call sites.
 */
function readSpot(v: unknown): BodySpot | null {
  const o = v as { line?: unknown; column?: unknown } | null;
  if (!o || typeof o.line !== "number" || o.line < 1) return null;
  return { line: o.line, column: typeof o.column === "number" ? o.column : 1 };
}

function readPoints(v: unknown): PagePoint[] {
  const list = (v as { points?: unknown } | null)?.points;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (p): p is PagePoint =>
      !!p && typeof p.page === "number" && typeof p.x_pt === "number" && typeof p.y_pt === "number",
  );
}

export class HttpBackend implements Backend {
  readonly kind = "server";
  private cache = new CompileCache();
  constructor(private base = "") {}

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    return this.cache.compile(async (extra) => {
      const res = await fetch(this.base + "/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, ...cfg, ...extra }),
      });
      if (!res.ok) throw new Error(`compile ${res.status}`);
      return res.json();
    }, assets);
  }

  async jump(body: string, cfg: DocConfig, at: PagePoint, assets = NO_ASSETS): Promise<BodySpot | null> {
    const res = await fetch(this.base + "/jump", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, ...cfg, ...assets, ...at }),
    });
    if (!res.ok) return null;
    return readSpot(await res.json());
  }

  async reveal(body: string, cfg: DocConfig, at: BodySpot, assets = NO_ASSETS): Promise<PagePoint[]> {
    const res = await fetch(this.base + "/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, ...cfg, ...assets, ...at }),
    });
    if (!res.ok) return [];
    return readPoints(await res.json());
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

  async sefarim(): Promise<SeferDef[]> {
    const res = await fetch(this.base + "/sefarim");
    return (await res.json()).sefarim ?? [];
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
  private cache = new CompileCache();

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
    this.cache.reset();
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
      return await this.cache.compile(
        async (extra) =>
          JSON.parse(
            await this.call(
              "compile",
              JSON.stringify({ body, ...cfg, ...extra }),
              COMPILE_TIMEOUT_MS,
            ),
          ) as CompileResult,
        assets,
      );
    } catch (e) {
      // A killed or crashed worker surfaces as an ordinary compile result with a
      // diagnostic — the same shape the server returns — so the status bar shows
      // it rather than the editor hanging on an unresolved promise. The throw
      // reaches here without the cache confirming any hashes, and failAll has
      // already reset it, so the respawned worker starts from a clean slate.
      return errorResult(
        e instanceof Error && e.message === "timeout"
          ? COMPILE_TIMEOUT_MESSAGE
          : `מנוע ההידור נעצר · the compile engine stopped${e instanceof Error ? `: ${e.message}` : ""}`,
      );
    }
  }
  /** Bounded by the same timeout a compile gets, because it *is* a compile: a
   *  runaway document must not pin the one engine worker just because somebody
   *  clicked on it. A killed worker surfaces here as "no answer". */
  async jump(body: string, cfg: DocConfig, at: PagePoint, assets = NO_ASSETS): Promise<BodySpot | null> {
    try {
      return readSpot(
        JSON.parse(
          await this.call("jump", JSON.stringify({ body, ...cfg, ...assets, ...at }), COMPILE_TIMEOUT_MS),
        ),
      );
    } catch {
      return null;
    }
  }

  async reveal(body: string, cfg: DocConfig, at: BodySpot, assets = NO_ASSETS): Promise<PagePoint[]> {
    try {
      return readPoints(
        JSON.parse(
          await this.call("reveal", JSON.stringify({ body, ...cfg, ...assets, ...at }), COMPILE_TIMEOUT_MS),
        ),
      );
    } catch {
      return [];
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
  async sefarim(): Promise<SeferDef[]> {
    return JSON.parse(await this.call("sefarim", "")).sefarim ?? [];
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
  private cache = new CompileCache();
  private invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<string>) | null = null;

  private async inv() {
    if (!this.invoke) {
      const core = await import("@tauri-apps/api/core");
      this.invoke = core.invoke as never;
    }
    return this.invoke!;
  }
  /**
   * The writer's dictionary as a file, and how to write it back (B29).
   *
   * The desktop app is the half of B29 that could be fixed: a browser cannot read
   * a path, so *one file both read* is not a thing a sandbox permits. What it can
   * do is stop the list living inside one browser profile — where it was invisible
   * to this app and gone the day that profile was cleared.
   */
  async dictionary(): Promise<{ text: string; write: (text: string) => void; where: string }> {
    const invoke = await this.inv();
    const [text, where] = await Promise.all([
      invoke("ksav_dictionary_read"),
      invoke("ksav_dictionary_where"),
    ]);
    return {
      text,
      where,
      // Fire and forget, and that is deliberate: adding a word from the squiggle
      // menu must not wait on a disk, and a write that fails has already been
      // kept in memory — so the cost is this session's additions, reported once
      // on the terminal, rather than a modal in the middle of writing.
      write: (next: string) => {
        void invoke("ksav_dictionary_write", { contents: next }).catch((e: unknown) => {
          console.error("could not write the dictionary:", e);
        });
      },
    };
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    const invoke = await this.inv();
    const run = this.cache.compile(
      async (extra) =>
        JSON.parse(
          await invoke("ksav_compile", { input: JSON.stringify({ body, ...cfg, ...extra }) }),
        ) as CompileResult,
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
  /**
   * Both directions carry their assets' bytes rather than only their hashes.
   *
   * A compile negotiates that down through [`CompileCache`] because it happens on
   * every pause in typing; a jump happens when somebody clicks. Paying for the
   * bytes buys the guarantee that matters here — the layout being asked about is
   * the layout on screen. An image whose bytes the engine turned out not to hold
   * would lay the page out at a different height, and the answer would be off by
   * exactly the amount nobody could see.
   */
  async jump(body: string, cfg: DocConfig, at: PagePoint, assets = NO_ASSETS): Promise<BodySpot | null> {
    try {
      const invoke = await this.inv();
      return readSpot(
        JSON.parse(await invoke("ksav_jump", { input: JSON.stringify({ body, ...cfg, ...assets, ...at }) })),
      );
    } catch {
      return null;
    }
  }

  async reveal(body: string, cfg: DocConfig, at: BodySpot, assets = NO_ASSETS): Promise<PagePoint[]> {
    try {
      const invoke = await this.inv();
      return readPoints(
        JSON.parse(await invoke("ksav_reveal", { input: JSON.stringify({ body, ...cfg, ...assets, ...at }) })),
      );
    } catch {
      return [];
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
  async sefarim(): Promise<SeferDef[]> {
    return JSON.parse(await (await this.inv())("ksav_sefarim")).sefarim ?? [];
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

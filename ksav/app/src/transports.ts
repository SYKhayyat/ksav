// ---------------------------------------------------------------- the transports
//
// The three ways the same contract is honoured: HTTP for `ksav serve`, a worker
// for the no-server web build, Tauri for the desktop shell.
//
// They came out of `api.ts` together with the shared parse helpers they all
// trust (`readSpot`, `readPoints`, `readPlaces`, `assembleRequest`) and the
// `ServiceClient` base under them. The file this split from is now the wire
// vocabulary and the two contracts — the thing that was always true, that four
// files meant one contract instead of four.
//
// # What stays per-transport
//
// `call`, and `compile`. The transports genuinely differ about *failure*: HTTP
// has a status code, the wasm worker can be killed mid-compile and has to answer
// with a diagnostic rather than leave a promise hanging, and the desktop shell
// has neither problem. Nothing else does — a spell check is a spell check.
//
// This file refuses to answer for: the wire shapes themselves (api.ts), the two
// caches (compilecache.ts), or the scan memo (scanmemo.ts).

import { SERVICE, SERVICE_PATH, type GitOp, type ServiceName } from "./services.gen";
import { isOp } from "./git";
import type {
  AssembledSource,
  Arrival,
  Backend,
  BodySpot,
  ClipboardSource,
  CommandDef,
  CompileOpts,
  CompileResult,
  DocConfig,
  GitAnswer,
  Linkified,
  Located,
  Mekoros,
  PagePoint,
  Places,
  Refreshing,
  RefreshResult,
  Refusable,
  ScanResult,
  Sources,
  SpellResult,
  SeferDef,
  TemplateDef,
  Told,
} from "./api";
import { NO_ASSETS, type RequestAssets } from "./api";
import { hydrateScan, type ScanWire } from "./spans";
import { CompileCache } from "./compilecache";

/**
 * A jump answer, from whatever the engine actually said.
 *
 * Deliberately paranoid about its input, because there are two ways to get a
 * reply with no answer in it and they look nothing alike: `{}` from a click that
 * landed on a margin, and the compile-shaped `{ok: false, diagnostics: […]}` a
 * busy or timed-out server returns. Both mean "leave the cursor alone", so both
 * are read as `null` here rather than being told apart by three call sites.
 *
 * # It returns `Located`, and that is the fix rather than a type
 *
 * This used to return `BodySpot`, which is `{line, column}` — and the engine
 * sends three keys. **`BodySpot` is the shape a *request* carries**, so naming it
 * here was wrong in a way the compiler could not see: the field was dropped at
 * the type, and every caller downstream had no way to know it existed. A click on
 * a word that came from an included chapter therefore put the caret at that line
 * number **in the parent document** — a different sentence, placed without
 * hesitation. `jump.rs` returns `file` and `tests/includes.rs` fences it.
 *
 * Returning `Located` makes the omission a **compile error** rather than a habit:
 * a reader that forgets a field will not type-check against a shape that has it.
 * That is the whole fence for this class, and it costs one interface.
 */
function readSpot(v: unknown): Located | null {
  const o = v as { line?: unknown; column?: unknown; file?: unknown } | null;
  if (!o || typeof o.line !== "number" || o.line < 1) return null;
  return {
    line: o.line,
    column: typeof o.column === "number" ? o.column : 1,
    // `null` and not `undefined`: the engine sends `null` for the main document,
    // and a caller asking "which file is this from" wants one falsy answer rather
    // than two that mean the same thing and are not the same thing to `===`.
    file: typeof o.file === "string" && o.file.length > 0 ? o.file : null,
  };
}

/**
 * What `assemble` is sent, in one place for all three backends.
 *
 * The chapters and nothing else. Images and fonts never appear in the source
 * text — the document refers to them by name — so sending their bytes would be
 * paying a megabyte to be ignored, and this is the one request in the app whose
 * whole reason to exist is that it is cheap. `parts` has to go: `#כלול` is
 * expanded *before* assembly, and an export that dropped a chapter would be a
 * hole in a file somebody sent to a printer.
 */
function assembleRequest(body: string, cfg: DocConfig, assets: RequestAssets) {
  return { body, ...cfg, parts: assets.parts };
}

function readPoints(v: unknown): PagePoint[] {
  const list = (v as { points?: unknown } | null)?.points;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (p): p is PagePoint =>
      !!p && typeof p.page === "number" && typeof p.x_pt === "number" && typeof p.y_pt === "number",
  );
}

/**
 * Read a `places` answer, keeping the engine's `first` and **not** deriving it.
 *
 * There is a real temptation here to write `first: list[0] ?? null`, and it is
 * wrong for one case: the engine answers `first: null` when the line is in **no**
 * part, and in that case the list is empty too, so the two agree — but only by
 * coincidence of shape. The reason to read the field is the other direction: the
 * engine's `first` is `line_of`, which is what `reveal` already uses, and a client
 * that recomputed it would be a second implementation of *"first is reading
 * order"*. So it is read, and the tests hold that the two agree.
 */
function readPlaces(v: unknown): Places {
  const o = v as Partial<Places> | null;
  const list = Array.isArray(o?.places)
    ? o.places.filter((n): n is number => typeof n === "number" && n >= 1)
    : [];
  return {
    places: list,
    first: typeof o?.first === "number" && o.first >= 1 ? o.first : null,
    file: typeof o?.file === "string" && o.file.length > 0 ? o.file : null,
    line: typeof o?.line === "number" && o.line >= 1 ? o.line : 0,
  };
}

/** What `call` may be told about a single request. */
interface CallOpts {
  timeoutMs?: number;
  background?: boolean;
  signal?: AbortSignal;
}

/**
 * Every service a backend answers the same way, over one door.
 *
 * # The finding
 *
 * Three transport classes held 312 of this file's 582 code lines between them,
 * and **ten of their twelve methods differed only in how they spelled one
 * call**: `(await this.send(name, obj)).json()` against
 * `JSON.parse(await this.call(name, JSON.stringify(obj)))`. Every layer *below*
 * this file had already collapsed to `(ServiceName, string) => Promise<string>`
 * — the engine routes HTTP from the registry, the wasm module dispatches its
 * single `ksav_call` export from it, and the desktop shell has one Tauri command
 * that looks names up in it. The registry unified the dispatch and left the
 * façade triplicated.
 *
 * That is not only length. It is three places to add a service and three places
 * to forget one — and the last time this file was triplicated, the wasm backend
 * spelled `sefarim` in a way the worker had never heard of, which nothing but a
 * writer noticing could have found.
 *
 * # What stays per-transport
 *
 * `call`, and `compile`. The transports genuinely differ about *failure*: HTTP
 * has a status code, the wasm worker can be killed mid-compile and has to answer
 * with a diagnostic rather than leave a promise hanging, and the desktop shell
 * has neither problem. Nothing else does — a spell check is a spell check.
 */
abstract class ServiceClient {
  /**
   * The one door. `input` is the JSON request body, or `""` for a service that
   * takes none; the answer is the JSON response as text.
   */
  protected abstract call(service: ServiceName, input?: string, opts?: CallOpts): Promise<string>;

  /** A service, its request, and its answer parsed. */
  protected async ask<T>(service: ServiceName, req?: unknown, opts?: CallOpts): Promise<T> {
    return JSON.parse(await this.call(service, req === undefined ? "" : JSON.stringify(req), opts)) as T;
  }

  // --- the three locate-shaped services, written once (the audit's #149) ---
  //
  // These were copy-pasted into all three backends, byte-identical between
  // HTTP and Tauri. The transport is the only thing that differs, and `ask`
  // already abstracts it: one body here, `{ timeoutMs }` is honoured by the
  // worker transport and ignored by the other two, and the failure answers —
  // null, [], the empty Places — are the same contract everywhere.

  /** Where the caret in the source landed on the page (the preview's click target). */
  async jump(body: string, cfg: DocConfig, at: PagePoint, assets = NO_ASSETS): Promise<Located | null> {
    try {
      return readSpot(
        await this.ask("jump", { body, ...cfg, ...assets, ...at }, { timeoutMs: COMPILE_TIMEOUT_MS }),
      );
    } catch {
      return null;
    }
  }

  /** Every page position a body spot printed (the preview's highlight). */
  async reveal(body: string, cfg: DocConfig, at: BodySpot, assets = NO_ASSETS): Promise<PagePoint[]> {
    try {
      return readPoints(
        await this.ask("reveal", { body, ...cfg, ...assets, ...at }, { timeoutMs: COMPILE_TIMEOUT_MS }),
      );
    } catch {
      return [];
    }
  }

  /** #82 — every place a line of a part landed, and the first of them.
   *
   *  Bounded by the same timeout as `reveal`, because it *is* a compile: it lays
   *  the document out to know where anything went. A killed worker is "no places"
   *  rather than a throw, which is `reveal`'s answer and for the same reason. */
  async places(body: string, cfg: DocConfig, at: BodySpot, assets = NO_ASSETS): Promise<Places> {
    try {
      return readPlaces(
        await this.ask("places", { body, ...cfg, ...assets, ...at }, { timeoutMs: COMPILE_TIMEOUT_MS }),
      );
    } catch {
      return { places: [], first: null, file: null, line: at.line };
    }
  }

  /** No timeout anywhere below: none of these lays a document out. */
  async assemble(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<AssembledSource> {
    return this.ask("assemble", assembleRequest(body, cfg, assets));
  }

  async spell(text: string, userWords: string, suggest = false): Promise<SpellResult> {
    // Background: on the wasm build a spell check shares the one worker with the
    // compile, and the writer is waiting on the compile, not the squiggles.
    return this.ask("spell", { text, user_words: userWords, suggest }, { background: true });
  }

  async suggest(word: string, userWords: string): Promise<string[]> {
    const out = await this.ask<{ suggestions?: string[] }>("suggest", {
      word,
      user_words: userWords,
    });
    return out.suggestions ?? [];
  }

  async scan(text: string, opts: { signal?: AbortSignal } = {}): Promise<ScanResult> {
    const result = await this.ask<ScanWire>("scan", { text }, opts);
    const scan = hydrateScan(text, result);
    return { ...result, scan };
  }

  async commands(): Promise<CommandDef[]> {
    return this.ask("commands");
  }

  async sefarim(): Promise<SeferDef[]> {
    return (await this.ask<{ sefarim?: SeferDef[] }>("sefarim")).sefarim ?? [];
  }

  async templates(): Promise<TemplateDef[]> {
    return this.ask("templates");
  }

  /**
   * One service, eighteen operations, one method.
   *
   * No `throw` on a refusal, unlike `linkify` and `refresh`: half of what git
   * says is a refusal a writer is *meant to read* — nothing to commit, the
   * branch already exists, the host wants a password — and turning those into
   * exceptions would mean catching them all again to get the sentence back
   * out. The answer carries `ok` and the drawer shows what it says.
   */
  async git(op: GitOp, path: string, extra: Record<string, unknown> = {}): Promise<GitAnswer> {
    // The wire does not read TypeScript. `isOp` turns the type into a checked
    // claim at the last door before the request leaves, for the embedder whose
    // JavaScript never met a `.d.ts`.
    if (!isOp(op)) {
      return { ok: false, error: `unknown git operation: ${op}` } as GitAnswer;
    }
    return this.ask("git", { op, path, ...extra });
  }

  async inbox(took: string[] = []): Promise<Arrival[]> {
    try {
      // Background: the 1 Hz poll must never sit in front of a compile.
      //
      // `took` is the ids this client actually put in the document since it last
      // asked. The engine keeps an arrival until it is named here, so a response
      // lost between the two — a reload landing between the POST and the parse,
      // a wasm worker killed by the compile timeout mid-poll — costs a repeat
      // rather than the source. See `post.rs::drain`.
      return await this.ask("inbox", { took }, { background: true });
    } catch {
      // The editor polls this every second; a build with no Girsa half, or a
      // server that went away, is a thing to stop asking about quietly rather
      // than to shout about in the console.
      return [];
    }
  }

  // The request bodies are the HTTP contract's, because there is one contract:
  // these used to be Tauri-shaped argument lists, which is how the desktop build
  // came to have a `ksav_search_in_girsa` command that the server answers as one
  // flag on `/mekoros`.
  async mekoros(phrase: string, except?: string): Promise<Mekoros> {
    return this.ask("mekoros", { phrase, except: except ?? null });
  }

  /** The same service, asked to open Girsa's search instead of answering. */
  async searchInGirsa(phrase: string): Promise<void> {
    await this.ask("mekoros", { phrase, search: true });
  }

  async linkify(text: string): Promise<string> {
    const out = await this.ask<Linkified & Refusable>("linkify", { text });
    if (out.error) throw new Error(out.error);
    return out.text ?? text;
  }

  async refresh(markup: string, style?: string, nikud?: boolean): Promise<Refreshing> {
    const out = await this.ask<Partial<RefreshResult> & Refusable>("refresh", {
      markup,
      // Absent, not null: Girsa reads absence as *the reader's own setting*,
      // and a `null` that deserialized to `Some(None)` on the other side would
      // be this application overriding a preference it never asked about.
      ...(style === undefined ? {} : { style }),
      ...(nikud === undefined ? {} : { nikud }),
    });
    if (out.error) throw new Error(out.error);
    // `moved` absent is *this Girsa does not report it*, which is not the same
    // as *nothing moved* — both come out as an empty list here and neither
    // rewrites anything, which is the safe reading of the two.
    return {
      quotes: out.quotes ?? [],
      moved: out.moved ?? [],
      retargeted: out.retargeted ?? null,
    };
  }

  async savedHere(path: string, name?: string, forget?: boolean): Promise<boolean> {
    const out = await this.ask<Partial<Told> & Refusable>("saved-here", {
      path,
      ...(name === undefined ? {} : { name }),
      ...(forget ? { forget: true } : {}),
    });
    if (out.error) throw new Error(out.error);
    return out.told ?? false;
  }

  async clipboardSource(): Promise<string | null> {
    // No `error` branch, deliberately: every way this can go wrong — no
    // clipboard on the machine, bytes that are not UTF-8, a build without the
    // loopback — has the same right answer, which is *there is no packet, paste
    // as text*. Turning any of them into a thrown error would make a perfectly
    // ordinary paste report a failure.
    const out = await this.ask<Partial<ClipboardSource> & Refusable>("clipboard-source", {});
    // A packet that arrived and could not be read is **not** silence. A schema
    // mismatch carries both version numbers, and turning it into a plain-text
    // paste is exactly what the schema version exists to prevent.
    if (out.error) throw new Error(out.error);
    return out.markup ?? null;
  }
}


export class HttpBackend extends ServiceClient implements Backend, Sources {
  readonly kind = "server";
  private cache = new CompileCache();
  constructor(private base = "") {
    super();
  }

  /**
   * Reach a service. The path **and the method** are the registry's.
   *
   * They were not. The path came from `SERVICE_PATH` and the verb came from
   * which of two private helpers a call site picked — `ask` was hard-coded GET,
   * `send` was hard-coded POST — so half of one fact lived in the registry and
   * the other half lived in a naming convention.
   *
   * `/inbox` is what that cost. It moved to POST in the engine for a stated
   * reason (`services.rs:148` — as a GET it was drainable by
   * `<img src="http://localhost:7878/inbox">`, which sends no `Origin`, so no
   * CORS check could have caught it), this file went on GETting it, the server
   * answered 404, and `inbox()` catches a failed poll on purpose because a
   * server that went away should not shout. So the Girsa handoff was dead, on
   * both sides working, and nothing said a word. Found by the first run of
   * `.github/scripts/acceptance.mjs`, in the console, where it had been printing
   * once a second the whole time.
   */
  private fetchService(service: ServiceName, input: string, signal?: AbortSignal): Promise<Response> {
    const def = SERVICE[service];
    const url = this.base + def.path;
    if (def.method === "GET") return fetch(url, { signal });
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: input || "{}",
      signal,
    });
  }

  protected async call(service: ServiceName, input = "", opts: CallOpts = {}): Promise<string> {
    const res = await this.fetchService(service, input, opts.signal);
    // A refusal is an error here rather than a parsed empty answer, which is
    // what lets `inbox()` above swallow one deliberately and everything else
    // report it.
    if (!res.ok) throw new Error(`${service} ${res.status}`);
    return res.text();
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS, opts: CompileOpts = {}): Promise<CompileResult> {
    return this.cache.compile(async (extra) => {
      const res = await this.fetchService("compile", JSON.stringify({ body, ...cfg, ...extra }), opts.signal);
      if (!res.ok) throw new Error(`compile ${res.status}`);
      return res.json();
    }, assets);
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

/** What a compile timeout says, in the build that actually killed it.
 *
 *  The server's sentence for the same event is *"ran longer than Ns and was
 *  abandoned — it will finish in the background"*, and that is **not** what
 *  happens here: the browser has no thread to detach, so terminating the worker
 *  discards the work. Claiming the compile will finish in the background would be
 *  a promise nothing in this build keeps, and a writer who watched for the page
 *  to appear would wait for ever.
 *
 *  So the two builds say different true things. What they must **not** do is
 *  contradict each other, which is why this says *stopped* and the server says
 *  *abandoned*, rather than one message being reused for both. #54 opened on the
 *  two sentences disagreeing.
 *
 *  The advice half is identical in both and is the part that helps: a runaway is
 *  a `#for`/`#while` with a wrong bound, and both say so.
 */
const COMPILE_TIMEOUT_MESSAGE =
  "ההידור ארך יותר מדי והופסק — לולאה או חזרה עם מספר גדול מאוד עלולה לגרום לכך; " +
  "בדקו את הגבולות של #עבור/#כלעוד · compilation timed out and was stopped — a loop or " +
  "repetition with a very large count can cause this; check any #for/#while bounds";

/** What a compile timeout says in the builds that **abandon** rather than stop.
 *
 *  This is the desktop's, and it is the server's own wording on purpose:
 *  `server.rs` races the layout against a deadline and lets the overran
 *  computation finish on a detached thread (*"abandoned — it will finish in the
 *  background and holds one of N slots until it does"*). The desktop does the
 *  same over tokio's blocking pool, which is what the comment above this call
 *  says it is relying on.
 *
 *  **So the desktop was reporting "was stopped" for a compile that is still
 *  running** — and a writer who took it at its word would sit waiting for a page
 *  that was never coming, having been told the work was cancelled. That is #54's
 *  "the message contradicts the engine", and it was the desktop half, not the
 *  browser half.
 *
 *  The two builds now say different true things: the browser kills the worker and
 *  the compute dies with it (**stopped**); the desktop and the server detach the
 *  thread and let it land (**abandoned**). The advice — a `#for`/`#while` with a
 *  wrong bound — is the same in both, because it is the part that helps.
 */
const COMPILE_ABANDONED_MESSAGE =
  "ההידור ארך יותר מדי ולכן ננטש — הוא ימשיך ברקע עד שיסתיים. לולאה או חזרה עם מספר גדול " +
  "מאוד עלולה לגרום לכך; בדקו את הגבולות של #עבור/#כלעוד · the compile ran longer than " +
  "expected and was abandoned — it will finish in the background. A loop or repetition " +
  "with a very large count can cause this; check any #for/#while bounds";

/** A compile result carrying a single error diagnostic — the shape the engine
 *  returns on failure, so a client-side timeout reads identically to a real one. */
function errorResult(message: string): CompileResult {
  return { ok: false, pages_svg: [], pdf_base64: null, typst_source: "", diagnostics: [{ severity: "error", message }] };
}

interface Pending {
  resolve: (s: string) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  /** The service this call is for, so a worker death can say which call caused
   *  it and which ones were only along for the ride (#54). */
  service?: ServiceName;
}

/** The error a killed worker rejects with.
 *
 *  **One error, many calls, and it has to say which is which.** `failAll`
 *  terminates the worker, so every call in flight on it genuinely cannot
 *  finish — rejecting them is correct and not negotiable. What was wrong was the
 *  *sentence*: a bare `new Error("timeout")` on each, which reads as though each
 *  of those calls had itself timed out. A spell check that was 4 ms from done and
 *  a `jump` click died because a compile ran away, and both were told "timeout".
 *
 *  So the error names the call that caused it and marks the rest as collateral,
 *  which is what lets `compile` report an abandoned compile while `jump`
 *  reports — accurately — that the worker went away underneath it.
 */
class WorkerGoneError extends Error {
  constructor(
    /** The service whose timeout killed the worker, if it was a timeout. */
    readonly cause_: ServiceName | null,
    /** Whether a runaway compile was abandoned rather than stopped. */
    readonly abandoned: boolean,
    message: string,
  ) {
    super(message);
    this.name = "WorkerGoneError";
  }
}

export class WasmBackend extends ServiceClient implements Backend {
  readonly kind = "wasm";
  private worker: Worker | null = null;
  private booting: Promise<Worker> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private cache = new CompileCache();
  // The two-lane queue. `ksav_call` is synchronous wasm, so the worker's message
  // queue *is* the serialization point for every service — compile, spell, jump,
  // reveal, inbox. FIFO alone put a background layout or the 1 Hz inbox poll in
  // front of the compile the writer was waiting for. So a background job is held
  // here whenever any foreground job is outstanding, and released only when the
  // foreground lane drains.
  private foregroundPending = 0;
  private bgQueue: Array<() => void> = [];

  private drainBackground() {
    const waiting = this.bgQueue;
    this.bgQueue = [];
    for (const go of waiting) go();
  }

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
    // Release anything held in the background lane. A rejected foreground call
    // unwinds its own `finally` and would normally drain this, but a worker
    // death clears the lane's bookkeeping out from under it, so do it here too —
    // otherwise a queued background call awaits a `go()` that never comes.
    this.foregroundPending = 0;
    this.drainBackground();
    this.worker?.terminate();
    this.worker = null;
    this.booting = null;
    // The terminated worker took its asset cache with it, so nothing is confirmed
    // cached anymore — the next compile must send bytes, not just hashes.
    this.cache.reset();
  }

  /**
   * One call to the engine worker, by service name.
   *
   * `name` was a `string`, which is how `sefarim` came to be called on a worker
   * that had never been told about it: the lookup on the other side produced
   * `undefined`, the call threw, the caller swallowed it, and citation
   * autocomplete was dead in this build with nothing anywhere reporting it.
   * `ServiceName` is generated from the engine's registry, so the same mistake
   * is now a compile error on this line.
   */
  protected async call(name: ServiceName, input = "", opts: CallOpts = {}): Promise<string> {
    const { timeoutMs, background } = opts;
    // Hold a background job while any foreground job is in flight, and let the
    // foreground lane release it when it drains. A foreground job never waits.
    if (background && this.foregroundPending > 0) {
      await new Promise<void>((go) => this.bgQueue.push(go));
    }
    if (!background) this.foregroundPending++;
    try {
      return await this.post(name, input, timeoutMs);
    } finally {
      // Clamped, because `failAll` may have reset this counter while this
      // `finally` was still owed a decrement.
      //
      // It did, and permanently: the compile timeout and `w.onerror` both zero
      // `foregroundPending` while the outstanding calls are still unwinding, so
      // each of them then decremented from zero. The counter went negative and
      // never came back — `foregroundPending > 0` false forever, so nothing was
      // ever held; `--this.foregroundPending === 0` false forever, so the lane
      // was never drained from this side either. One worker death and the
      // browser build was back to plain FIFO, which is precisely what
      // `AUDIT-perf-and-blocking.md` §B1 was written to fix: *"a background
      // layout or the 1 Hz inbox poll in front of the compile the writer was
      // waiting for"*.
      //
      // It came back silently, and at the worst moment — a worker dies because a
      // document ran away, which is when the next compile matters most.
      if (!background) {
        this.foregroundPending = Math.max(0, this.foregroundPending - 1);
        if (this.foregroundPending === 0) this.drainBackground();
      }
    }
  }

  private async post(name: ServiceName, input: string, timeoutMs?: number): Promise<string> {
    const w = await this.ensure();
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      const slot: Pending = { resolve, reject, service: name };
      if (timeoutMs) {
        slot.timer = setTimeout(() => {
          if (!this.pending.has(id)) return;
          // Typst cannot be interrupted mid-compile, but a Worker can be killed
          // outright. A runaway (a `#for` with a wrong bound) would otherwise pin
          // the one engine worker and queue every later compile and spell check
          // behind it forever, finishing the tab until reload. Terminating the
          // worker ends the runaway and lets the next call boot a fresh one.
          //
          // **Killing the worker is not stopping the compile**, and the two
          // sentences the user could have been given must not both be true. The
          // desktop and server builds abandon an overran compile and let it
          // finish in the background on a detached thread (`server.rs`: *"the
          // timeout message says the compile was abandoned and will finish in
          // the background"*), because there the thread survives. Here it does
          // not: the compute died with the worker, so the honest word is
          // *stopped* — and `abandoned: false` is what stops this error being
          // read as the server's. What is kept from the server's wording is the
          // useful half, which is that the document is at fault.
          this.failAll(new WorkerGoneError(name, false, `timeout:${name}`));
        }, timeoutMs);
      }
      this.pending.set(id, slot);
      w.postMessage({ id, call: name, input });
    });
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS, opts: CompileOpts = {}): Promise<CompileResult> {
    try {
      return await this.cache.compile(
        async (extra) =>
          JSON.parse(
            await this.call("compile", JSON.stringify({ body, ...cfg, ...extra }), {
              timeoutMs: COMPILE_TIMEOUT_MS,
              background: opts.background,
            }),
          ) as CompileResult,
        assets,
      );
    } catch (e) {
      // A killed or crashed worker surfaces as an ordinary compile result with a
      // diagnostic — the same shape the server returns — so the status bar shows
      // it rather than the editor hanging on an unresolved promise. The throw
      // reaches here without the cache confirming any hashes, and failAll has
      // already reset it, so the respawned worker starts from a clean slate.
      //
      // **A timeout is recognised by type, not by string.** It used to be
      // `e.message === "timeout"`, which is one rename away from silently
      // turning every runaway into *"the compile engine stopped: timeout"* — a
      // message that blames the engine for a document at fault and drops the
      // advice, which is the only part that helps.
      return errorResult(
        e instanceof WorkerGoneError
          ? COMPILE_TIMEOUT_MESSAGE
          : `מנוע ההידור נעצר · the compile engine stopped${e instanceof Error ? `: ${e.message}` : ""}`,
      );
    }
  }
}

/** Runs the engine in-process inside the Tauri desktop app (no HTTP). */
export class TauriBackend extends ServiceClient implements Backend, Sources {
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
   * One call to the engine, by service name — the same name the HTTP build puts
   * in a URL and the browser build passes to the wasm module.
   *
   * There were thirteen `ksav_*` commands here, each of which also had to be
   * listed a second time in the shell's `generate_handler!`, where forgetting it
   * is a runtime rejection rather than a compile error. There is one now, and
   * `ServiceName` is generated from the registry it dispatches through.
   */
  protected async call(service: ServiceName, input = ""): Promise<string> {
    return (await this.inv())("ksav_call", { name: service, input });
  }
  /**
   * The writer's dictionary as a file, and how to write it back (B29).
   *
   * The desktop app is the half of B29 that could be fixed: a browser cannot read
   * a path, so *one file both read* is not a thing a sandbox permits. What it can
   * do is stop the list living inside one browser profile — where it was invisible
   * to this app and gone the day that profile was cleared.
   */
  async dictionary(): Promise<{ text: string; write: (text: string) => Promise<void>; where: string }> {
    const invoke = await this.inv();
    const [text, where] = await Promise.all([
      invoke("ksav_dictionary_read"),
      invoke("ksav_dictionary_where"),
    ]);
    return {
      text,
      where,
      // The UI does not need to block while the dictionary is written, but a
      // rejected write must reach the localized failure path rather than the
      // console. The returned promise lets callers await it when they need a
      // durable result, while existing callers may still intentionally schedule
      // it without blocking their click handler.
      write: (next: string) => {
        return invoke("ksav_dictionary_write", { contents: next }).then(() => undefined);
      },
    };
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    const run = this.cache.compile(
      async (extra) =>
        JSON.parse(await this.call("compile", JSON.stringify({ body, ...cfg, ...extra }))) as CompileResult,
      assets,
    );
    // Typst cannot be interrupted, and the in-process compile runs off the UI
    // thread, so a runaway `#for` leaves the window alive but the writer waiting
    // with nothing said. A deadline on this side unblocks the editor and shows
    // why; the abandoned compile finishes on tokio's blocking pool, which is
    // large enough that one lost thread does not wedge a single-user desktop app.
    // And when the deadline wins, the abandoned compile is *nobody's*. Nothing
    // is attached to `run`, so a later rejection — a Tauri `invoke` that fails,
    // a JSON parse of a truncated answer — is an unhandled promise rejection.
    // `crash.install` listens for exactly that and puts the **full-screen crash
    // panel** over the application: on the desktop build, a compile that
    // overruns twenty seconds and then fails told the writer "Ksav has crashed",
    // over an application that had not, in the middle of a document that was
    // fine. Abandoning a promise means saying so.
    void run.catch(() => {});
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<CompileResult>((resolve) => {
      timer = setTimeout(() => resolve(errorResult(COMPILE_ABANDONED_MESSAGE)), COMPILE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([run, deadline]);
    } finally {
      clearTimeout(timer!);
    }
  }

}

/**
 * Pick a backend:
 *   - Tauri desktop  → in-process engine (no HTTP)
 *   - server reachable → HTTP (fast, tiny download)
 *   - otherwise      → in-browser wasm engine (works with no server)
 */
export async function createBackend(): Promise<Backend & Partial<Sources>> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return new TauriBackend();
  }
  try {
    // Any service would do as a knock; the command registry is the cheapest.
    const res = await fetch(SERVICE_PATH.commands, { signal: AbortSignal.timeout(800) });
    if (res.ok) return new HttpBackend();
  } catch {
    /* no server — fall through to wasm if this build includes it */
  }
  if (__WASM__) return new WasmBackend();
  return new HttpBackend();
}

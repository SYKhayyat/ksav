// Rendering the document.
//
// This is one of the two halves of what used to be a single tangled function.
// `runCompile` wrote the document to storage on its way to the renderer, before
// its own try block, so a storage failure stopped the render, was never caught,
// and silently stopped every save after it. Saving lives in `save.ts` now and
// the two never touch. A render is a convenience; a save is the writer's work.

import { analyze } from "./brackets";
import * as commands from "./commands";
import { troubleSaid } from "./diagnostics";
import { drawDiagnostics, preambleLines, shown } from "./diagview";
import * as docs from "./docs";
import * as parts from "./parts";
import { t, tf } from "./i18n";
import * as opendocs from "./opendocs";
import { anyPreviewNarrowed, applyPreview, drawPagesEverywhere, filePages } from "./preview";
import { docConfig, docConfigFor, settings } from "./settings";
import * as runtime from "./runtime";
import type { AssembledSource, CompileResult, DocConfig } from "./api";

/** Called after a compile lands, so the shell can refresh what depends on it. */
let afterCompile: () => void = () => {};
export function onAfterCompile(fn: () => void) {
  afterCompile = fn;
}

/** Called when the compile timer fires, so spell-check can ride the same beat. */
let alsoSchedule: () => void = () => {};
export function onSchedule(fn: () => void) {
  alsoSchedule = fn;
}

/**
 * Which compile is the current one.
 *
 * A compile takes 0.4–3 s and the debounce is a quarter of a second, so two are
 * routinely in flight at once. Results used to be applied in arrival order,
 * which means a slow render of older text could land on top of a fast render of
 * newer text and leave the preview showing a page the document no longer says.
 * Every request takes a ticket; only the newest ticket may touch the screen.
 */
let generation = 0;
let timer: number | undefined;
// The compile currently on the wire, so a superseded one can be aborted rather
// than left to hold a server thread and one of the browser's six connections
// until it finishes and its result is thrown away. Only the HTTP backend can act
// on the signal; the wasm worker answers B1 with its queue instead.
let compileAbort: AbortController | null = null;

export function scheduleCompile() {
  clearTimeout(timer);
  clearTimeout(quietTimer);
  // `relaxed` lays a big sefer out once the writer has stopped rather than
  // between every sentence; `live` (the default) keeps a page in step as it is
  // typed. See `previewDelay` in `settings.ts`.
  const delay = settings.previewDelay === "relaxed" ? 1200 : 250;
  timer = window.setTimeout(runCompile, delay);
  alsoSchedule();
}

// ------------------------------------------------------- the unfocused tabs
//
// A document that is not on screen compiles nothing, which is the right answer
// for a laptop with six seforim open and the wrong one for the moment you switch
// back: the pane is a blank rectangle for however long a layout takes.
//
// `preview.ts` holds the pages each document was last seen with, so `keep` — the
// default — needs no compiling at all. `idle` is for the writer who would rather
// spend the CPU and never see a stale page: it lays the other open documents out
// quietly, once the typing has stopped, and files the result where a switch will
// find it. Nothing here touches the status bar, the diagnostics, `lastResult` or
// the compile generation. The writer did not ask for this work and must not be
// shown it.

let quietTimer: number | undefined;
let quietRunning = false;

/** Two seconds after a compile lands — long enough that it is not a pause in
 *  typing, short enough to be done before anybody switches tabs. */
const QUIET_DELAY = 2000;

function scheduleQuiet() {
  clearTimeout(quietTimer);
  if (settings.tabCompile !== "idle") return;
  quietTimer = window.setTimeout(() => void compileUnfocused(), QUIET_DELAY);
}

/**
 * Lay out every open document that is not the focused one. Returns how many
 * produced pages, for the test and for nobody else.
 *
 * The body comes from the **open editor state**, not from storage: a document
 * with unsaved edits is the one case where the two differ, and laying out the
 * saved copy would file pages that do not match what switching back will show.
 * Everything else — page setup, images, fonts — comes from the stored record,
 * because that is where it lives.
 */
export async function compileUnfocused(): Promise<number> {
  const backend = runtime.backend;
  if (!backend || quietRunning || settings.tabCompile !== "idle") return 0;
  const focused = opendocs.focusedId();
  const others = opendocs.openDocs().filter((d) => d.id !== focused);
  if (!others.length) return 0;
  quietRunning = true;
  const startedAt = generation;
  let laid = 0;
  try {
    for (const entry of others) {
      // The writer came back. Everything still queued is work nobody is waiting
      // for, and the foreground compile is waiting behind it.
      if (generation !== startedAt || opendocs.focusedId() !== focused) break;
      const stored = await docs.getDoc(entry.id);
      if (!stored) continue;
      const text = entry.state.doc.toString();
      const { problems, healed } = analyze(text);
      const { body } = withPreamble(problems.length ? healed : text);
      const res = await backend.compile(
        body,
        docConfigFor(stored.config),
        { ...docs.requestAssets(stored.assets ?? []), parts: await includedParts(body) },
        // Background: this lays out a document nobody is looking at, and on the
        // wasm build it must never sit in front of the foreground compile.
        { background: true },
      );
      if (res.pages_svg.length) {
        filePages(entry.id, res.pages_svg, res.pages_hash);
        laid++;
      }
    }
  } catch {
    // A background layout that fails is a background layout that fails. Nobody
    // asked for it, so nobody is told; switching to that document falls back to
    // its kept pages, exactly as `keep` does.
  } finally {
    quietRunning = false;
  }
  return laid;
}

/** The user's document with their own `#let` preamble in front of it.
 *
 *  A document that carries its own custom commands (opened from a file that
 *  embedded them) uses those, so a shared sefer compiles for its reader; an
 *  ordinary local document falls back to the app-wide set.
 *
 *  Returns the line offset as well as the text, because the engine reports
 *  diagnostic lines in the body it was *sent*, and this is the only place that
 *  knows how many lines were put in front of the writer's first one. Working it
 *  out anywhere else would be a second reader of one value. */
function withPreamble(body: string): { body: string; offset: number } {
  // `commands.preambleInForce`, not the expression that used to be inlined here:
  // `main.ts` had a second reader of the same value that consulted only the
  // app-wide set, so a shared sefer compiled with its own commands and
  // autocompleted with yours (B27).
  const { text } = commands.preambleInForce();
  const pre = text.trim() ? text + "\n\n" : "";
  return { body: pre + body, offset: preambleLines(text) };
}

/**
 * How many lines sit in front of the writer's first one in what the engine is
 * sent.
 *
 * A narrowed preview asks: it holds line numbers in the writer's document and
 * the engine answers in the body it was handed, and the two differ by exactly
 * the custom-command preamble. Asked through `withPreamble` rather than computed
 * again, because the preamble in force depends on which document is open — the
 * distinction B27 was about — and a second reader of that is how the two came to
 * disagree the last time.
 */
export function preambleOffset(): number {
  return withPreamble("").offset;
}

/**
 * The exact text the pages on screen were rendered from, and its line offset.
 *
 * Both directions of jump (`jump.ts`) ask about a *layout*, so they have to ask
 * about the same text the layout came from — including the speculative heal.
 * A document mid-`#הערה[` is compiled healed and shown healed; asking where a
 * click landed in the unhealed text would be asking about a page that was never
 * drawn, and on a document with an unbalanced bracket that is every page.
 *
 * Healing never inserts or removes a newline, which is what lets the offset be a
 * line count at all — the same invariant `diagview` rests on, and the same test
 * holds it.
 */
export function bodyOnScreen(): { body: string; offset: number } {
  const doc = runtime.docText();
  const { problems, healed } = analyze(doc);
  return withPreamble(problems.length ? healed : doc);
}

export async function runCompile() {
  const backend = runtime.backend;
  if (!backend) return; // still initializing (createBackend not resolved yet)
  const mine = ++generation;
  // Abort the compile the last generation left in flight — its result is already
  // destined for the discard pile (`mine !== generation`), so there is no reason
  // to keep paying for it on the wire.
  compileAbort?.abort();
  const abort = new AbortController();
  compileAbort = abort;
  const status = document.getElementById("status")!;
  const diag = document.getElementById("diagnostics")!;
  status.textContent = t("rendering");
  status.className = "";
  const t0 = performance.now();
  const userDoc = runtime.docText();
  // Speculative heal. A document is unbalanced for as long as it takes to type
  // the body of a `#הערה[`, and compiling that raw would blank the preview and
  // replace it with an error pointing at end-of-file. Compile the repaired copy
  // instead, and say so — the writer keeps seeing their page while they type.
  // The document itself is never modified; only what we hand the compiler is.
  const { problems, healed } = analyze(userDoc);
  const healedCount = problems.length;
  // Healing never inserts or removes a newline, so a line the engine reports
  // about the healed copy is the same line in what the writer typed. `diagview`
  // has the test that keeps that true.
  const { body, offset } = withPreamble(healedCount ? healed : userDoc);
  try {
    const res = await backend.compile(body, docConfig(), {
      ...docs.requestAssets(runtime.currentDoc?.assets ?? []),
      parts: await includedParts(body),
      // Only when a preview on screen is following a narrowed source pane. The
      // runs cost a walk over every laid-out frame and a re-parse of the source,
      // and nothing else in the application reads them.
      want_lines: anyPreviewNarrowed(),
      // Only while the notes drawer is on screen. Same bargain, same walk: the
      // markers are read off the layout that has just happened, and a document
      // whose drawer is shut has nothing that would read them.
      want_markers: !!settings.notesPane,
    }, { signal: abort.signal });
    if (mine !== generation) return; // superseded while we were waiting
    runtime.setLastResult(res);
    const ms = Math.round(performance.now() - t0);
    if (res.pages_svg.length) {
      // Every preview pane, from one compile. See `previewHosts`.
      drawPagesEverywhere(res.pages_svg, res.pages_hash, res.pages_lines);
      applyPreview();
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
    const worst = errs.length ? errs : res.diagnostics;
    // The location goes in front of the message, the raw compiler text goes on
    // the hover, and the whole thing is clickable so it can put the cursor on the
    // line it names. Nothing here rephrases anything: the engine already did,
    // once, for every backend (`engine/src/diagnostics.rs`).
    drawDiagnostics(diag, shown(worst, offset));
    afterCompile();
    scheduleQuiet();
  } catch (e) {
    if (mine !== generation) return;
    const bad = troubleSaid(e, "compile");
    status.textContent = `✗ ${t("networkError")}`;
    status.className = "err";
    diag.textContent = bad.said;
    diag.title = bad.detail; // the machine's own string, one hover away
  }
}

/**
 * A compile that is allowed to be slow, for the things that need real output:
 * the PDF, the assembled Typst source, and exports.
 *
 * The preview asks for SVG only. Regenerating the PDF on every keystroke cost
 * roughly 300 KB of base64 per response that nothing on screen ever read, and
 * the assembled source — the 75 KB prelude plus the document — cost more than
 * the page did. Both are asked for here, where they are actually wanted.
 */
/**
 * A document's body, remembered until the document changes.
 *
 * Included chapters are read on the compile path, which runs on a 250 ms
 * debounce, and reading four chapters out of IndexedDB on every pause in typing
 * is four reads too many. `updated` is the document's own modification stamp, so
 * the memo cannot go stale: a chapter edited in another tab bumps it and the
 * next compile re-reads.
 */
const partMemo = new Map<string, { updated: number; body: string }>();

/**
 * The other documents this one includes, ready for the request.
 *
 * Resolved by *title*, because that is what the writer types — a document's id
 * is a thing nobody has ever seen. Two documents sharing a title is therefore
 * possible, and the newest wins: `library()` is ordered newest first, so the one
 * being worked on is the one that gets included, which is the only answer that
 * is not surprising.
 */
async function includedParts(body: string): Promise<{ name: string; body: string }[]> {
  // The overwhelmingly common case, and worth not paying for: a document with no
  // inclusions resolves nothing, reads nothing and sends nothing.
  if (!parts.referenced(body).length) return [];
  // Titles to ids, off the in-memory index. This is not a read of anything: the
  // library index is already resident, and it is the *bodies* that live in
  // IndexedDB. Built once per call because a title can be renamed between two.
  const idOf = new Map<string, string>();
  for (const entry of docs.library()) {
    if (!idOf.has(entry.title)) idOf.set(entry.title, entry.id);
  }
  const updatedOf = new Map(docs.library().map((e) => [e.id, e.updated]));
  // One read per name the document actually asks for, transitively. The loop
  // this replaced read *every* document in the library — see `collectAsync`.
  return parts.collectAsync(body, async (name) => {
    const id = idOf.get(name);
    if (!id) return null;
    const updated = updatedOf.get(id) ?? 0;
    const had = partMemo.get(id);
    if (had && had.updated === updated) return had.body;
    const doc = await docs.getDoc(id);
    if (!doc) return null;
    rememberPart(id, updated, doc.body);
    return doc.body;
  });
}

/**
 * How many chapter bodies to keep.
 *
 * `partMemo` was unbounded and never swept, so it grew to the whole library and
 * stayed there for the life of the tab. Sixteen is more than any real sefer's
 * chapter count reached in one compile and is a cap rather than a policy: the
 * memo exists to make the *next* keystroke cheap, not to be a second copy of the
 * library.
 */
const PART_MEMO_MAX = 16;

function rememberPart(id: string, updated: number, body: string): void {
  // Re-inserting moves it to the back of the insertion order, which is what
  // makes the eviction below least-recently-used rather than arbitrary.
  partMemo.delete(id);
  partMemo.set(id, { updated, body });
  while (partMemo.size > PART_MEMO_MAX) {
    const oldest = partMemo.keys().next();
    if (oldest.done) break;
    partMemo.delete(oldest.value);
  }
}

/**
 * The document as Typst source, for "export .typ" — with no compile behind it.
 *
 * This used to be `compileForExport()` called with `want_pdf` and
 * `want_source`, whose PDF was decoded by nobody and whose layout was the only
 * thing the writer waited for. `assemble_source` runs *before* Typst is
 * invoked; asking for it directly is the difference between a `format!` and a
 * render of a whole sefer. The custom-command preamble and the chapters are
 * resolved exactly as `compileForExport` resolves them, because a `.typ` that
 * opens differently from the document it came out of is not an export.
 */
export async function sourceForExport(): Promise<AssembledSource | null> {
  const backend = runtime.backend;
  if (!backend) return null;
  const body = withPreamble(runtime.docText()).body;
  try {
    return await backend.assemble(body, docConfig(), {
      ...docs.requestAssets(runtime.currentDoc?.assets ?? []),
      parts: await includedParts(body),
    });
  } catch (e) {
    const bad = troubleSaid(e, "compile");
    runtime.setStatus(`${t("networkError")} — ${bad.said}`, "err", bad.detail);
    return null;
  }
}

export async function compileForExport(
  /**
   * Fields that belong to *this* export rather than to the document — today
   * only `pdf_pages`, because "just pages 4 to 9" is a thing you decide at the
   * moment of exporting and would be wrong to save into the sefer.
   */
  override?: Partial<DocConfig>,
): Promise<CompileResult | null> {
  const backend = runtime.backend;
  if (!backend) return null;
  try {
    // Assembled once: two document-sized concatenations here where one does,
    // and `includedParts` scans this copy rather than a second one.
    const body = withPreamble(runtime.docText()).body;
    return await backend.compile(body, { ...docConfig(), ...override }, {
      ...docs.requestAssets(runtime.currentDoc?.assets ?? []),
      parts: await includedParts(body),
      want_pdf: true,
      want_source: true,
    });
  } catch (e) {
    const bad = troubleSaid(e, "compile");
    runtime.setStatus(`${t("networkError")} — ${bad.said}`, "err", bad.detail);
    return null;
  }
}

/**
 * Ask the engine for reflowable HTML. Returns null when Typst's HTML backend
 * cannot handle this document — page images are useless for the Word handoff,
 * because a picture is exactly what Word cannot edit.
 *
 * It reports the *reason* and not the outcome, which is the correction. It used
 * to set the status line itself, to "Typst's HTML export failed — exporting page
 * images instead" — a sentence describing what its caller was going to do next.
 * That was true of `exportHtml`, which does fall back, and false of `exportWord`
 * and `copyForWord`, which return without producing anything. So the one route
 * where nothing at all happened was the route that announced a successful export
 * of page images. A layer that knows how a document failed does not know what
 * its caller will do about it; each caller says what it did.
 */
export async function reflowableHtml(): Promise<{ html: string | null; why: string }> {
  const backend = runtime.backend;
  if (!backend) return { html: null, why: "" };
  try {
    const body = withPreamble(runtime.docText()).body;
    const res = (await backend.compile(body, docConfig(), {
      ...docs.requestAssets(runtime.currentDoc?.assets ?? []),
      parts: await includedParts(body),
      format: "html",
    })) as unknown as { ok: boolean; html?: string; diagnostics?: { message: string }[] };
    if (res.ok && res.html) return { html: res.html, why: "" };
    return { html: null, why: res.diagnostics?.[0]?.message ?? "" };
  } catch (e) {
    return { html: null, why: troubleSaid(e, "compile").said };
  }
}

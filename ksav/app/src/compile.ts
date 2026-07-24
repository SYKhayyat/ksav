// Rendering the document.
//
// This is one of the two halves of what used to be a single tangled function.
// `runCompile` wrote the document to storage on its way to the renderer, before
// its own try block, so a storage failure stopped the render, was never caught,
// and silently stopped every save after it. Saving lives in `save.ts` now and
// the two never touch. A render is a convenience; a save is the writer's work.

import { analyze } from "./brackets";
import { friendlyError } from "./diagnostics";
import * as docs from "./docs";
import { t, tf } from "./i18n";
import { docConfig, settings } from "./settings";
import * as runtime from "./runtime";
import type { CompileResult } from "./api";

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

export function applyZoom() {
  document.documentElement.style.setProperty("--zoom", String(settings.zoom));
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

export function scheduleCompile() {
  clearTimeout(timer);
  timer = window.setTimeout(runCompile, 250);
  alsoSchedule();
}

/** The user's document with their own `#let` preamble in front of it.
 *
 *  A document that carries its own custom commands (opened from a file that
 *  embedded them) uses those, so a shared sefer compiles for its reader; an
 *  ordinary local document falls back to the app-wide set. */
function withPreamble(body: string): string {
  const custom = runtime.currentDoc?.customCommands ?? settings.customCommands;
  const pre = custom?.trim() ? custom + "\n\n" : "";
  return pre + body;
}

export async function runCompile() {
  const backend = runtime.backend;
  if (!backend) return; // still initializing (createBackend not resolved yet)
  const mine = ++generation;
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
  const body = withPreamble(healedCount ? healed : userDoc);
  try {
    const res = await backend.compile(
      body,
      docConfig(),
      docs.requestAssets(runtime.currentDoc?.assets ?? []),
    );
    if (mine !== generation) return; // superseded while we were waiting
    runtime.setLastResult(res);
    const ms = Math.round(performance.now() - t0);
    const preview = document.getElementById("preview")!;
    if (res.pages_svg.length) {
      preview.innerHTML = res.pages_svg.map((s) => `<div class="page">${s}</div>`).join("");
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
    afterCompile();
  } catch (e) {
    if (mine !== generation) return;
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
export async function compileForExport(): Promise<CompileResult | null> {
  const backend = runtime.backend;
  if (!backend) return null;
  try {
    return await backend.compile(withPreamble(runtime.docText()), docConfig(), {
      ...docs.requestAssets(runtime.currentDoc?.assets ?? []),
      want_pdf: true,
    });
  } catch (e) {
    runtime.setStatus(`${t("networkError")} — ${String(e)}`, "err");
    return null;
  }
}

/**
 * Ask the engine for reflowable HTML. Returns null (having said why) when
 * Typst's HTML backend cannot handle this document — page images are useless
 * for the Word handoff, because a picture is exactly what Word cannot edit.
 */
export async function reflowableHtml(): Promise<string | null> {
  const backend = runtime.backend;
  if (!backend) return null;
  try {
    const res = (await backend.compile(withPreamble(runtime.docText()), docConfig(), {
      ...docs.requestAssets(runtime.currentDoc?.assets ?? []),
      format: "html",
    })) as unknown as { ok: boolean; html?: string; diagnostics?: { message: string }[] };
    if (res.ok && res.html) return res.html;
    const why = res.diagnostics?.[0]?.message ?? "";
    runtime.setStatus(t("htmlFellBack") + (why ? ` — ${friendlyError(why)}` : ""), "warn");
  } catch {
    runtime.setStatus(t("htmlFellBack"), "warn");
  }
  return null;
}

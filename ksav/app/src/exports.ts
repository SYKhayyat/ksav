// Getting a document out of Ksav.
//
// Seven routes, and the interesting thing about them is that they are not
// interchangeable. Print and the HTML fallback want *pictures* of pages, because
// what comes out of a printer must look exactly like the PDF. The Word handoff
// wants reflowable HTML and must refuse to fall back to pictures, because a
// picture is precisely what Word cannot edit. Markdown and plain text want
// neither and go straight from the source.

import { analyze } from "./brackets";
import { compileForExport, reflowableHtml, sourceForExport } from "./compile";
import { download, escapeAttr } from "./dom";
import { t, tf } from "./i18n";
import { toMarkdown, toPlainText } from "./markdown";
import { toOrg } from "./org";
import * as pagerange from "./pagerange";
import { currentPages, flattenGlyphs } from "./preview";
import * as runtime from "./runtime";
import { docConfig } from "./settings";
import { flushSaves } from "./save";

// ---------------------------------------------------------------- which pages
//
// > *"A page range is offered for PDF only. No reason has been given for that."*
//
// It was one menu item that put up a `window.prompt`, handed the answer to the
// engine and forgot it. Print — the route where "pages 4 to 9" is the entire
// reason anybody asks the question — sent the whole sefer to the printer.
//
// It is one range now, held here, read by every route that has pages at all.
// `pagerange.ts` says which those are and, for the rest, why not.
//
// **Deliberately not persisted.** A page range is a fact about one export, not a
// preference: a `1-4` that survived a reload would be a document quietly
// exporting its first four pages next week, with the reason four settings
// drawers away. It lives for as long as the tab does, which is about as long as
// the intention behind it.
let range: pagerange.PageSpec = pagerange.ALL;
let rangeText = "";

/** What the writer typed into the pages box, verbatim. */
export function pagesText(): string {
  return rangeText;
}

/** The range in force, parsed. */
export function pagesSpec(): pagerange.PageSpec {
  return range;
}

/** Set the range from what the writer typed. Returns it parsed, offcuts and all. */
export function setPages(text: string): pagerange.PageSpec {
  rangeText = text;
  range = pagerange.parsePages(text);
  return range;
}

/**
 * Warn when what is about to leave the app was built from a *healed* copy.
 *
 * The preview compiles a speculatively repaired document, so while a bracket is
 * missing it holds closers the writer never typed. Keeping the preview alive on
 * that basis is a kindness; letting a file walk out the door on it without a
 * word is not — the status line may have scrolled past by the time they hit
 * Export.
 */
function warnIfHealed() {
  const n = healedCount();
  if (n) runtime.setStatus(`⚠ ${tf("previewHealed", n)}`, "warn");
}

/**
 * Hand a file to the writer, and say so.
 *
 * # Found by exporting a PDF
 *
 * `exportPdf` sets the status to *rendering…*, compiles, downloads, and then
 * says something **only if something was wrong**: a warning diagnostic, or a
 * healed bracket. On the ordinary path — the document is fine, the file is in
 * the writer's downloads — nothing cleared it. The status bar read *rendering…*
 * indefinitely, until the next keystroke happened to trigger a compile. Measured
 * at eleven seconds after the file had already landed, and it would have been
 * ten minutes.
 *
 * Three more routes were worse: Markdown, Org and plain text produce a file and
 * say **nothing at all**, so they left whatever the last operation had put
 * there — which, right after a PDF export, was *rendering…* about a PDF.
 *
 * # Why it is here rather than at each call site
 *
 * Because there were seven call sites and two of them remembered. Announcing
 * belongs to the act of handing a file over, not to each route's memory of
 * doing so, and `exports.test.mjs` fails on a route that reaches for the bare
 * `download` — which is the only way a new export can go quiet again.
 *
 * A warning after this one wins, deliberately: both sentences are true, and *a
 * file went out but read this first* is the more useful of the two.
 */
function handOver(name: string, blob: Blob) {
  download(name, blob);
  runtime.setStatus(`✓ ${tf("exported", name)}`, "ok");
}

export async function exportPdf() {
  runtime.closeMenus();
  await flushSaves();
  // A range with a piece in it that names nothing is refused rather than
  // silently trimmed. The engine's parser drops what it cannot read, so `1,x,5`
  // exported pages 1 and 5 and said nothing at all — a file that is quietly not
  // the one that was asked for, which is the worst of the three possible
  // behaviours.
  if (range.bad.length) {
    runtime.setStatus(`✗ ${tf("pagesUnreadable", range.bad.join(", "))}`, "err");
    return;
  }
  runtime.setStatus(t("rendering"), "");
  const res = await compileForExport(rangeText ? { pdf_pages: rangeText } : undefined);
  if (!res?.pdf_base64) {
    // A PDF/A export can be refused for a real, nameable reason — an
    // unembeddable font, a missing title — and "compile error" over the top of
    // that reason is the least useful thing this could say. The engine already
    // sends the reason down; the only work here is not throwing it away.
    const why = res?.diagnostics?.find((d) => d.severity === "error")?.message;
    runtime.setStatus(why ? `${t("compileError")} — ${why}` : t("compileError"), "err");
    return;
  }
  const bytes = Uint8Array.from(atob(res.pdf_base64), (c) => c.charCodeAt(0));
  handOver(runtime.fileStem() + ".pdf", new Blob([bytes], { type: "application/pdf" }));
  // Dropped tags on a page-range export, and anything else the export chose to
  // do rather than fail over — worth a line, since the file is already on disk.
  const note = res.diagnostics?.find((d) => d.severity === "warning")?.message;
  if (note) runtime.setStatus(`⚠ ${note}`, "warn");
  else warnIfHealed();
}

// `exportPdfPages` used to live here: a second export route whose only
// difference from the first was a `window.prompt` in front of it. It is the
// pages box at the top of the Export menu now — one control, read by every route
// that has pages, rather than a range that existed only if you chose the item
// with the ellipsis. It had no key and no palette entry, so the box is strictly
// more reachable than the item it replaces.

export async function exportTypst() {
  runtime.closeMenus();
  await flushSaves();
  // No compile. The .typ *is* what a compile is handed, so asking for the
  // render to read one field off the response was paying for the layout of the
  // whole sefer — plus a base64 PDF — to obtain a string the engine builds in
  // microseconds before Typst is invoked at all.
  const res = await sourceForExport();
  if (!res) return;
  // A chapter that could not be resolved is a hole in the file. It is the one
  // thing that can go wrong here, so it is said before the file lands rather
  // than discovered by whoever opens it.
  const why = res.diagnostics?.find((d) => d.severity === "error")?.message;
  if (why) {
    runtime.setStatus(`${t("compileError")} — ${why}`, "err");
    return;
  }
  handOver(runtime.fileStem() + ".typ", new Blob([res.typst_source], { type: "text/plain" }));
  warnIfHealed();
}

/**
 * The rendered pages wrapped in HTML — a *picture* of the document.
 *
 * This is what printing wants (it must look exactly like the PDF), and it is the
 * fallback for the web export when Typst's HTML backend cannot handle a
 * document. It is not reflowable and is not what "Export HTML" should mean.
 */
function pageImageHtml(banner = ""): string {
  // `currentPages()`, not `runtime.lastResult`. They are two records of the
  // pages on screen and they disagree exactly when it matters: a failed compile
  // returns `pages_svg: []`, `compile.ts` stores it unconditionally and skips
  // the redraw — so the preview keeps showing the last good page and this
  // produced **a blank sheet**, silently, on the one route that is paper.
  //
  // The range applies here, and this is the honest place for it: these *are*
  // pages, one SVG each, so "pages 4 to 9" is a filter and nothing more. It
  // covers print — which is where the question is actually asked — and the HTML
  // fallback, which is the same pictures under a different extension.
  // Flattened, for the same reason the preview flattens: a page as the engine
  // writes it is 2,254 `<use>` elements and half a second of layout, and this
  // path lays out *every* page at once with a `print()` waiting on it. See
  // `flattenGlyphs`. A fifty-page document was twenty-five seconds of frozen
  // window between pressing Print and the dialog appearing.
  const pages = pagerange
    .select(range, currentPages())
    .map((s) => `<div class="page">${flattenGlyphs(s)}</div>`)
    .join("\n");
  return `<!doctype html><html dir="${docConfig().dir}"><head><meta charset="utf-8">
<title>${escapeAttr(runtime.currentDoc?.title ?? "Ksav")}</title><style>body{background:#e5e7eb;margin:0;padding:24px}
.page{background:#fff;max-width:820px;margin:0 auto 24px;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.page svg{width:100%;height:auto;display:block}
.healed{background:#fef3c7;border:1px solid #d97706;color:#78350f;max-width:820px;
  margin:0 auto 24px;padding:10px 14px;border-radius:6px;font:14px system-ui,sans-serif}
@media print{.healed{display:none}}</style></head><body>${banner}${pages}</body></html>`;
}

/** How many closers the preview is holding that the writer never typed. */
function healedCount(): number {
  return analyze(runtime.docText()).problems.length;
}

/**
 * Real web content: Typst's own HTML backend, so headings are headings and the
 * text reflows, is selectable and reads on a phone.
 *
 * Unlike the Word handoff, this one may fall back to page images: an HTML file
 * that merely *shows* the document is still useful, where one Word cannot edit
 * is not.
 */
export async function exportHtml() {
  runtime.closeMenus();
  const { html, why } = await reflowableHtml();
  handOver(
    runtime.fileStem() + ".html",
    new Blob([html ?? pageImageHtml()], { type: "text/html;charset=utf-8" }),
  );
  // This is the one route the fallback sentence is true of, so this is where it
  // is said. A file *was* produced; it is pictures rather than text, and that is
  // worth a line because it is not what "Export HTML" implies.
  if (!html) runtime.setStatus(t("htmlFellBack") + (why ? ` — ${why}` : ""), "warn");
  else warnIfHealed();
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
  // The document's own page setup (B26): an export is of a sefer, and which
  // paper and direction that sefer is on is a fact about it.
  const page = docConfig();
  const size = PAPER_CSS[page.paper] ?? PAPER_CSS.a4;
  const dir = page.dir;
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeAttr(runtime.currentDoc?.title ?? "Ksav")}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: ${size}; margin: ${page.margin_cm}cm; }
div.WordSection1 { page: WordSection1; }
body { font-family: "${page.font}", serif; font-size: ${page.size_pt}pt;
       direction: ${dir}; text-align: ${dir === "rtl" ? "right" : "left"};
       line-height: ${1 + page.line_spacing_em}; }
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
 * Say that the Word handoff produced nothing, and why.
 *
 * Both Word routes used to `return` here in silence, on top of a status line
 * `reflowableHtml` had already set to "exporting page images instead" — so the
 * writer was told an export had happened, in a shape they did not ask for, when
 * in fact no file existed and nothing was on the clipboard. Refusing is correct;
 * refusing quietly under somebody else's announcement is not.
 */
function wordUnavailable(why: string) {
  runtime.setStatus(`✗ ${t("wordNoHtml")}${why ? ` — ${why}` : ""}`, "err", why);
}

export async function exportWord() {
  runtime.closeMenus();
  const { html, why } = await reflowableHtml();
  if (!html) return wordUnavailable(why);
  const { inner, styles } = splitHtml(html);
  // `.doc` (not `.docx`): Word opens HTML under this extension and converts it,
  // and the writer can then Save As a genuine .docx from inside Word.
  handOver(
    runtime.fileStem() + ".doc",
    new Blob([wordEnvelope(inner, styles)], { type: "application/msword;charset=utf-8" }),
  );
  runtime.setStatus(t("wordFlattenNote"), "warn");
}

/** The same content onto the clipboard, for pasting into an already-open Word. */
export async function copyForWord() {
  runtime.closeMenus();
  const { html, why } = await reflowableHtml();
  if (!html) return wordUnavailable(why);
  const { inner, styles } = splitHtml(html);
  const full = wordEnvelope(inner, styles);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([full], { type: "text/html" }),
        "text/plain": new Blob([toPlainText(runtime.docText())], { type: "text/plain" }),
      }),
    ]);
    runtime.setStatus(t("copiedForWord"), "ok");
  } catch {
    runtime.setStatus(t("copyFailed"), "warn");
  }
}

// ---------------------------------------------------------------- plain formats

export function exportMarkdown() {
  runtime.closeMenus();
  handOver(
    runtime.fileStem() + ".md",
    new Blob([toMarkdown(runtime.docText())], { type: "text/markdown;charset=utf-8" }),
  );
}

/**
 * Org, which is Markdown's twin here and differs where it counts.
 *
 * `text/org` is not a registered media type and `text/plain` is what every tool
 * that opens one actually wants; the extension is what Emacs reads.
 */
export function exportOrg() {
  runtime.closeMenus();
  handOver(
    runtime.fileStem() + ".org",
    new Blob([toOrg(runtime.docText())], { type: "text/plain;charset=utf-8" }),
  );
}

export function exportText() {
  runtime.closeMenus();
  handOver(
    runtime.fileStem() + ".txt",
    new Blob([toPlainText(runtime.docText())], { type: "text/plain;charset=utf-8" }),
  );
}

export function doPrint() {
  runtime.closeMenus();
  // Same refusal as the PDF, and for a stronger reason: paper is the one route
  // that cannot be undone by deleting a file.
  if (range.bad.length) {
    runtime.setStatus(`✗ ${tf("pagesUnreadable", range.bad.join(", "))}`, "err");
    return;
  }
  // Asking for pages the document does not have is not an error — Typst drops
  // them and so does `select` — but it produces an empty print window, and a
  // printer that emits nothing looks exactly like a printer that is broken.
  if (pagerange.beyond(range, currentPages().length)) {
    runtime.setStatus(`⚠ ${tf("pagesBeyond", currentPages().length)}`, "warn");
  }
  const w = window.open("", "_blank");
  if (!w) return;
  // Printing wants the page images: what comes out of the printer must look
  // exactly like the PDF, which reflowable HTML would not.
  //
  // Those images come from `lastResult`, which is the *preview* compile — and
  // the preview is compiled from the speculatively healed copy. So on a document
  // with an unbalanced bracket this is the one route that puts closers the
  // writer never typed onto paper, and it was the one route that said nothing:
  // Export PDF refuses with a compile error and every other route calls
  // `warnIfHealed`. Two answers about one document, and the silent one was the
  // irreversible one.
  //
  // The warning goes in the print window as well as the status bar, because the
  // status bar is behind whatever the browser just opened over it — and the
  // banner carries `@media print { display: none }`, so it is on the screen the
  // writer is looking at and never on the paper.
  const healed = healedCount();
  const banner = healed
    ? `<div class="healed">⚠ ${escapeAttr(tf("previewHealed", healed))}</div>`
    : "";
  w.document.write(pageImageHtml(banner));
  w.document.close();
  w.focus();
  warnIfHealed();
  setTimeout(() => w.print(), 300);
}

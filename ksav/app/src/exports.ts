// Getting a document out of Ksav.
//
// Seven routes, and the interesting thing about them is that they are not
// interchangeable. Print and the HTML fallback want *pictures* of pages, because
// what comes out of a printer must look exactly like the PDF. The Word handoff
// wants reflowable HTML and must refuse to fall back to pictures, because a
// picture is precisely what Word cannot edit. Markdown and plain text want
// neither and go straight from the source.

import { analyze } from "./brackets";
import { compileForExport, reflowableHtml } from "./compile";
import { download, escapeAttr } from "./dom";
import { t, tf } from "./i18n";
import { toMarkdown, toPlainText } from "./markdown";
import * as runtime from "./runtime";
import { docConfig } from "./settings";
import { flushSaves } from "./save";

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
  const n = analyze(runtime.docText()).problems.length;
  if (n) runtime.setStatus(`⚠ ${tf("previewHealed", n)}`, "warn");
}

export async function exportPdf() {
  runtime.closeMenus();
  await flushSaves();
  runtime.setStatus(t("rendering"), "");
  const res = await compileForExport();
  if (!res?.pdf_base64) {
    runtime.setStatus(t("compileError"), "err");
    return;
  }
  const bytes = Uint8Array.from(atob(res.pdf_base64), (c) => c.charCodeAt(0));
  download(runtime.fileStem() + ".pdf", new Blob([bytes], { type: "application/pdf" }));
  warnIfHealed();
}

export async function exportTypst() {
  runtime.closeMenus();
  await flushSaves();
  const res = await compileForExport();
  if (!res) return;
  download(runtime.fileStem() + ".typ", new Blob([res.typst_source], { type: "text/plain" }));
  warnIfHealed();
}

/**
 * The rendered pages wrapped in HTML — a *picture* of the document.
 *
 * This is what printing wants (it must look exactly like the PDF), and it is the
 * fallback for the web export when Typst's HTML backend cannot handle a
 * document. It is not reflowable and is not what "Export HTML" should mean.
 */
function pageImageHtml(): string {
  const pages = (runtime.lastResult?.pages_svg || [])
    .map((s) => `<div class="page">${s}</div>`)
    .join("\n");
  return `<!doctype html><html dir="${docConfig().dir}"><head><meta charset="utf-8">
<title>${escapeAttr(runtime.currentDoc?.title ?? "Ksav")}</title><style>body{background:#e5e7eb;margin:0;padding:24px}
.page{background:#fff;max-width:820px;margin:0 auto 24px;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.page svg{width:100%;height:auto;display:block}</style></head><body>${pages}</body></html>`;
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
  const html = await reflowableHtml();
  download(
    runtime.fileStem() + ".html",
    new Blob([html ?? pageImageHtml()], { type: "text/html;charset=utf-8" }),
  );
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

export async function exportWord() {
  runtime.closeMenus();
  const html = await reflowableHtml();
  if (!html) return;
  const { inner, styles } = splitHtml(html);
  // `.doc` (not `.docx`): Word opens HTML under this extension and converts it,
  // and the writer can then Save As a genuine .docx from inside Word.
  download(
    runtime.fileStem() + ".doc",
    new Blob([wordEnvelope(inner, styles)], { type: "application/msword;charset=utf-8" }),
  );
  runtime.setStatus(t("wordFlattenNote"), "warn");
}

/** The same content onto the clipboard, for pasting into an already-open Word. */
export async function copyForWord() {
  runtime.closeMenus();
  const html = await reflowableHtml();
  if (!html) return;
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
  download(
    runtime.fileStem() + ".md",
    new Blob([toMarkdown(runtime.docText())], { type: "text/markdown;charset=utf-8" }),
  );
}

export function exportText() {
  runtime.closeMenus();
  download(
    runtime.fileStem() + ".txt",
    new Blob([toPlainText(runtime.docText())], { type: "text/plain;charset=utf-8" }),
  );
}

export function doPrint() {
  runtime.closeMenus();
  const w = window.open("", "_blank");
  if (!w) return;
  // Printing wants the page images: what comes out of the printer must look
  // exactly like the PDF, which reflowable HTML would not.
  w.document.write(pageImageHtml());
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

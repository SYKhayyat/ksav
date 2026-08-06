// Ksav → Markdown / plain text.
//
// There was no way to get a document out of Ksav in a form another tool could
// read. `.docx` is correctly ruled out (Typst cannot produce it), but that left
// PDF and page-image HTML — both terminal formats. Someone who wants to paste a
// dvar Torah into an email, a WhatsApp message, a blog or a git repo had no
// route at all, which is a bad reason to keep Word around.
//
// This is a lossy, deliberate conversion: Markdown has no notion of a note
// apparatus, columns or fixed page regions. Structure and emphasis survive;
// notes become Markdown footnotes where the flavour supports them, and the rest
// degrades to plain text rather than leaking `#command[…]`.

import { resolveDeferred } from "./deferred";
import { scan, type Node } from "./spans";

/** Heading level per command name. */
const HEADINGS: Record<string, number> = {
  שער: 1, title: 1,
  תת_שער: 2, subtitle: 2,
  כותרת1: 1, h1: 1,
  כותרת2: 2, h2: 2,
  כותרת3: 3, h3: 3,
  כותרת4: 4, h4: 4,
  כותרת5: 5, h5: 5,
  כותרת6: 6, h6: 6,
  סימן: 1, siman: 1,
};

/** Inline emphasis: the Markdown that wraps the command's content. */
const EMPHASIS: Record<string, [string, string]> = {
  הדגשה: ["**", "**"], bold: ["**", "**"],
  דיבור_המתחיל: ["**", "**"], dh: ["**", "**"],
  אות: ["**", "**"], osource: ["**", "**"],
  נטוי: ["*", "*"], italic: ["*", "*"],
  פסוק: ["*", "*"], verse: ["*", "*"],
  גמרא: ["*", "*"], gemara: ["*", "*"],
  קו_חוצה: ["~~", "~~"], sthrough: ["~~", "~~"],
  קוד: ["`", "`"], mono: ["`", "`"],
  סימון: ["==", "=="], mark: ["==", "=="],
};

/** Body-less commands and what they become. */
const ATOMS: Record<string, string> = {
  קו_מפריד: "\n\n---\n\n", hrule: "\n\n---\n\n",
  מעבר_עמוד: "\n\n---\n\n", pbreak: "\n\n---\n\n",
  מעבר_שורה: "  \n", lbreak: "  \n",
  מעבר_טור: "\n\n", cbreak: "\n\n",
  חסר: "______", blank: "______",
  מרווח: "\n\n", vspace: "\n\n",
  רווח_אופקי: " ", hspace: " ",
};

/** Commands whose entire call is dropped (apparatus plumbing, config, layout). */
const DROPPED = new Set([
  "הערות_בסוף", "endnotes", "הערות_בסוף_צד", "endnotes_side",
  "הערות_מדורגות", "banded_notes", "תוכן", "toc", "סמן", "anchor",
  "הגדרות_הערות", "footnote_config", "הגדרות_מדורגות", "banded_config",
  "הגדרות_מדפים", "pagebands_config", "הגדרות_זרמים", "streams_config",
  "הגדרות_כותרות", "headings_config", "הגדרות_רשימות", "lists_config",
  "הגדרות_טבלאות", "tables_config", "הגדרות_הערות_צד", "sidenotes_config",
  // Review: an export is the document, not the review of it, so it reads as if
  // every change were accepted — the deleted text and the comments are gone,
  // the inserted text (which falls through below) stays.
  "הגדרות_סקירה", "review_config", "מחיקה", "deleted", "הערת_עורך", "comment_",
]);

/** Note commands: their body becomes a footnote, their site a marker. */
const NOTES = new Set([
  "הערה", "fnote", "הערה_על_הערה", "subnote", "מראה_מקום", "sourcenote",
  "הערתסיום", "endnote", "הערת_גיליון", "sidenote", "הערת_ימין", "noteright",
  "הערת_שמאל", "noteleft", "הערת_תוכן", "contentnote", "הערת_מקור",
  "sourcenote_stream", "הערה_זרם", "stream_note",
  "הערה_א", "הערה_ב", "הערה_ג", "הערה_ד", "הערה_ה", "הערה_ו", "הערה_ז",
  "tier1", "tier2", "tier3", "tier4", "tier5", "tier6", "tier7",
  "מדור_א", "מדור_ב", "מדור_ג", "מדור_ד", "מדור_ה", "מדור_ו", "מדור_ז",
  "band1", "band2", "band3", "band4", "band5", "band6", "band7",
  "מדף_א", "מדף_ב", "מדף_ג", "מדף_ד", "מדף_ה", "מדף_ו", "מדף_ז",
  "pageband1", "pageband2", "pageband3", "pageband4", "pageband5", "pageband6", "pageband7",
]);

// Items and cells are written without a leading `#` — `פריט[אלף]`, `תא[1]` —
// because inside an argument list Typst is already in code context. This file
// carried a positional regex and a bracket matcher of its own to find them;
// `spans.ts` reports them as ordinary calls, so both are gone and the walker
// below meets an item the same way it meets any other command.

const LISTS: Record<string, "bullet" | "number"> = {
  רשימה: "bullet", bullets: "bullet",
  ממוספרת: "number", numbered: "number",
  ממוספרת_עברית: "number", henum: "number",
};

export interface MarkdownOptions {
  /** false → plain text: no `#`, `**`, `[^1]`; notes become parentheticals. */
  markup?: boolean;
}

/**
 * A Ksav table as a Markdown table.
 *
 * Markdown tables have no colspan and no per-cell styling, so a merged cell
 * degrades to its text in the first column it occupies. That is a real loss, and
 * the reason the PDF stays the authority for anything that matters visually.
 */
function tableToMarkdown(
  node: Node,
  markup: boolean,
  walk: (a: number, b: number) => string,
): string {
  // The column count comes from the node, so a table declaring
  // `עמודות: (2fr, 1fr, 1fr)` exports three columns. Matching `\d+` here gave
  // two, and the cells were reflowed into the wrong rows in the export as well
  // as in the preview.
  const cols = node.cols ?? 2;

  const cells: { text: string; header: boolean }[] = [];
  for (const c of node.children) {
    if (c.role !== "cell" || !c.bodies[0]) continue;
    cells.push({
      text: walk(c.bodies[0].from, c.bodies[0].to).trim().replace(/\|/g, "\\|").replace(/\n+/g, " "),
      header: c.header === true,
    });
  }
  if (!cells.length) return "";

  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(cells.slice(i, i + cols).map((c) => c.text));
  }
  if (!markup) return rows.map((r) => r.join("\t")).join("\n");

  // Markdown needs a header row; if the table did not declare one, the first row
  // stands in — a headerless Markdown table simply does not render.
  const header = rows.shift()!;
  while (header.length < cols) header.push("");
  const line = (r: string[]) => "| " + r.concat(Array(cols).fill("")).slice(0, cols).join(" | ") + " |";
  return [line(header), "|" + " --- |".repeat(cols), ...rows.map(line)].join("\n");
}

/**
 * Convert a Ksav document to Markdown (or, with `markup: false`, to plain text).
 */
export function toMarkdown(source: string, opts: MarkdownOptions = {}): string {
  const markup = opts.markup !== false;
  // A note whose prose lives at the end of the file is still a note. This walker
  // turns a note command's *body* into a footnote, so a deferred marker would
  // convert to nothing and its prose would arrive as loose paragraphs after the
  // document — every note in the export silently detached from its sentence.
  const src = resolveDeferred(source);
  const { byStart } = scan(src);
  const notes: string[] = [];

  const walk = (from: number, to: number, listKind?: "bullet" | "number"): string => {
    let out = "";
    let i = from;
    let itemIndex = 0;
    while (i < to) {
      // Comments never print, so they never survive the conversion either.
      if (src.startsWith("//", i) && !src.startsWith("://", i - 1)) {
        const nl = src.indexOf("\n", i);
        i = nl < 0 || nl > to ? to : nl;
        continue;
      }
      if (src.startsWith("/*", i)) {
        const end = src.indexOf("*/", i);
        i = end < 0 || end > to ? to : end + 2;
        continue;
      }
      // A bare `פריט[…]` is a node like any other, so the branch that used to
      // re-match it positionally here is gone: `byStart` already holds it.
      const s = byStart.get(i);
      if (!s || s.to > to) {
        out += src[i];
        i++;
        continue;
      }
      const end = s.to;
      // A command's content is its `[body]` when it has one — but the container
      // commands put theirs in the argument list instead: `#רשימה(פריט[…], …)`.
      // Descending only into brackets silently dropped every list.
      const hasBody = s.bodies.length > 0;
      const bodyFrom = hasBody ? s.bodies[0].from : s.args ? s.args.from : -1;
      const bodyTo = hasBody ? s.bodies[0].to : s.args ? s.args.to : -1;
      const inner = () => (bodyFrom >= 0 ? walk(bodyFrom, bodyTo) : "");

      if (DROPPED.has(s.name)) {
        // drop the whole call
      } else if (ATOMS[s.name] != null && !hasBody) {
        out += ATOMS[s.name];
      } else if (s.name === "הפניה" || s.name === "xref") {
        out += "(§)";
      } else if (s.name === "נוסחה" || s.name === "formula" || s.name === "נוסחה_בשורה" || s.name === "iformula") {
        // A formula's source is a string argument, not a `[body]`: emitted as
        // TeX-ish `$…$` maths, which is what every Markdown flavour that renders
        // maths at all expects. Falling through would have printed the quotes.
        const args = s.args ? src.slice(s.args.from, s.args.to) : "";
        const math = (/"((?:[^"\\]|\\.)*)"/.exec(args)?.[1] ?? "").replace(/\\(.)/g, "$1");
        const display = s.name === "נוסחה" || s.name === "formula";
        out += markup ? (display ? `\n\n$$${math}$$\n\n` : `$${math}$`) : math;
      } else if (s.name === "תמונה" || s.name === "img") {
        const args = s.args ? src.slice(s.args.from, s.args.to) : "";
        const name = /"([^"]*)"/.exec(args)?.[1] ?? "";
        out += markup ? `![](${name})` : name;
      } else if (HEADINGS[s.name] != null) {
        const level = HEADINGS[s.name];
        const text = inner().trim();
        out += markup ? `\n\n${"#".repeat(level)} ${text}\n\n` : `\n\n${text}\n\n`;
      } else if (s.role === "table") {
        out += "\n\n" + tableToMarkdown(s, markup, walk) + "\n\n";
      } else if (LISTS[s.name] != null) {
        out += "\n" + walk(bodyFrom, bodyTo, LISTS[s.name]) + "\n";
      } else if ((s.name === "פריט" || s.name === "item") && listKind) {
        itemIndex++;
        const bullet = listKind === "number" ? `${itemIndex}. ` : "- ";
        out += (markup ? bullet : "• ") + inner().trim() + "\n";
      } else if (NOTES.has(s.name)) {
        const text = inner().trim();
        if (markup) {
          notes.push(text);
          out += `[^${notes.length}]`;
        } else {
          out += ` (${text})`;
        }
      } else if (EMPHASIS[s.name] && markup) {
        const [a, b] = EMPHASIS[s.name];
        const text = inner();
        // Emphasis around nothing is just noise.
        out += text.trim() ? a + text + b : text;
      } else if (s.name === "ציטוט" || s.name === "blockquote") {
        const text = inner().trim().split("\n").map((l) => (markup ? "> " + l : l)).join("\n");
        out += `\n\n${text}\n\n`;
      } else {
        // Everything else contributes its content and nothing else: styling
        // Markdown cannot carry (colour, size, alignment, boxes), structural
        // wrappers, and — importantly — commands this converter has never heard
        // of, including ones the writer defined themselves. The rule is that no
        // `#name[` ever reaches the output.
        out += inner();
      }
      i = end;
    }
    return out;
  };

  let text = walk(0, src.length);
  if (markup && notes.length) {
    text += "\n\n" + notes.map((n, k) => `[^${k + 1}]: ${n}`).join("\n") + "\n";
  }
  // Tidy: collapse runs of blank lines, trim trailing spaces on each line.
  return text
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

/** Plain text: the words that would print, with no markup at all. */
export function toPlainText(src: string): string {
  return toMarkdown(src, { markup: false });
}

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
import { withAliases } from "./engine.gen";
import { scan, type Node } from "./spans";

// Every table below is keyed by the **Hebrew** name alone and expanded through
// `withAliases`, which reads the pairing out of the prelude's own `#let` lines.
//
// They used to carry both spellings by hand — about a hundred pairs of them —
// and that is a copy of something the engine already states, with the failure
// mode all such copies have: rename a command in `ksav.typ` and the export
// silently stopped recognising it under its new name, while every test here went
// on passing because every test here was written in Hebrew. The tiers are the
// sharper case: the prelude defines seven per family and the palette registry
// advertises three, so the hand-written list had to know something *neither*
// engine table said out loud, and the only reason it was right is that somebody
// typed twenty-one names carefully once.

/**
 * The two commands that print as a Markdown heading and are **not** headings.
 *
 * This table used to be nine rows — every heading command and these two — and
 * it was the fourth copy of a classification `spans.ts` owns and fences against
 * the prelude in both directions. It had the failure a copy always has: no
 * `#כותרת`, no `#hlevel`, and therefore no heading past level six survived an
 * export at all, because the generic form is the only spelling that goes there.
 *
 * The seven real ones come off the node's own `role`/`level` below. These two do
 * not, and that is a decision rather than an omission: `#שער` is `align(center,
 * text(size: 2em, weight: "bold", …))` with no `heading()` in it, which is
 * exactly why `spans.NOT_HEADINGS` refuses to call it one — but a document's
 * title is a `#` in Markdown, where there is no such thing as centred large
 * text. The two questions genuinely differ, so the divergence is written down
 * with its reason instead of being a nine-row table nobody could tell was
 * disagreeing.
 */
const TITLES_AS_HEADINGS: Record<string, number> = withAliases({
  שער: 1,
  תת_שער: 2,
});

/** Inline emphasis: the Markdown that wraps the command's content. */
const EMPHASIS: Record<string, [string, string]> = withAliases<[string, string]>({
  הדגשה: ["**", "**"],
  דיבור_המתחיל: ["**", "**"],
  אות: ["**", "**"],
  נטוי: ["*", "*"],
  פסוק: ["*", "*"],
  גמרא: ["*", "*"],
  קו_חוצה: ["~~", "~~"],
  קוד: ["`", "`"],
  סימון: ["==", "=="],
});

/** Body-less commands and what they become. */
const ATOMS: Record<string, string> = withAliases({
  קו_מפריד: "\n\n---\n\n",
  מעבר_עמוד: "\n\n---\n\n",
  מעבר_שורה: "  \n",
  מעבר_טור: "\n\n",
  חסר: "______",
  מרווח: "\n\n",
  רווח_אופקי: " ",
});

/** Commands whose entire call is dropped (apparatus plumbing, config, layout). */
const DROPPED = new Set(
  Object.keys(
    withAliases({
      הערות_בסוף: 0, הערות_בסוף_צד: 0, הערות_מדורגות: 0, תוכן: 0, סמן: 0,
      הגדרות_הערות: 0, הגדרות_מדורגות: 0, הגדרות_מדפים: 0, הגדרות_זרמים: 0,
      הגדרות_כותרות: 0, הגדרות_רשימות: 0, הגדרות_טבלאות: 0, הגדרות_הערות_צד: 0,
      // Review: an export is the document, not the review of it, so it reads as
      // if every change were accepted — the deleted text and the comments are
      // gone, the inserted text (which falls through below) stays.
      הגדרות_סקירה: 0, מחיקה: 0, הערת_עורך: 0,
    }),
  ),
);

/** The three tiered-note families, א through ז, as the prelude defines them. */
const TIERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז"];
const tiered = (stem: string) => Object.fromEntries(TIERS.map((t) => [`${stem}_${t}`, 0]));

/** Note commands: their body becomes a footnote, their site a marker. */
const NOTES = new Set(
  Object.keys(
    withAliases({
      הערה: 0, הערה_על_הערה: 0, מראה_מקום: 0, הערתסיום: 0, הערת_גיליון: 0,
      הערת_ימין: 0, הערת_שמאל: 0, הערת_תוכן: 0, הערת_מקור: 0, הערה_זרם: 0,
      ...tiered("הערה"),
      ...tiered("מדור"),
      ...tiered("מדף"),
    }),
  ),
);

// Items and cells are written without a leading `#` — `פריט[אלף]`, `תא[1]` —
// because inside an argument list Typst is already in code context. This file
// carried a positional regex and a bracket matcher of its own to find them;
// `spans.ts` reports them as ordinary calls, so both are gone and the walker
// below meets an item the same way it meets any other command.

const LISTS: Record<string, "bullet" | "number"> = withAliases<"bullet" | "number">({
  רשימה: "bullet",
  ממוספרת: "number",
  ממוספרת_עברית: "number",
});

/**
 * Every command name the tables above classify, for the fence that checks them.
 *
 * `withAliases` keeps an unrecognised key rather than throwing — which is right,
 * because some prelude spellings are not in the pairing — so a mistyped Hebrew
 * name makes a table entry that simply never matches, silently. The check that
 * every one of these is a command the prelude defines is real and lives in
 * `enginefacts.test.mjs`; what it used to be given was a **regex over this
 * file's source text**, matching any Hebrew word at two spaces of indent, with a
 * floor of fifty to prove it had found something.
 *
 * That is the failure this repository has a name for. It could not tell a table
 * key from a Hebrew word in a comment, it counted the tier stems by re-deriving
 * the seven suffixes on its own side, and it went red the moment seven rows
 * moved out of a table for a good reason — which is a fence failing for a
 * reason it was not written under. The tables state their own contents here, and
 * the floor is gone with them: an empty export is an empty list and the `every
 * name is a command` check has nothing to be vacuously true over.
 */
export const CLASSIFIED_NAMES: readonly string[] = [
  ...Object.keys(TITLES_AS_HEADINGS),
  ...Object.keys(EMPHASIS),
  ...Object.keys(ATOMS),
  ...DROPPED,
  ...NOTES,
  ...Object.keys(LISTS),
];

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
      } else if (s.role === "heading" || TITLES_AS_HEADINGS[s.name] != null) {
        // Markdown stops at six, and the outline does not: `#כותרת(רמה: 9)` is
        // a real level nine, and `#########` is not a heading in any flavour.
        const level = Math.min(s.level ?? TITLES_AS_HEADINGS[s.name] ?? 1, 6);
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

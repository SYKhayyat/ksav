// Ksav → Markdown / plain text.
//
// There was no way to get a document out of Ksav in a form another tool could
// read. `.docx` is correctly ruled out (Typst cannot produce it), but that left
// PDF and page-image HTML — both terminal formats. Someone who wants to paste a
// dvar Torah into an email, a WhatsApp message, a blog or a git repo had no
// route at all, which is a bad reason to keep Word around.
//
// What each Ksav construct *is* lives in `interchange.ts`, along with the walk
// over the document. What is here is the two dialects: how Markdown writes those
// things, and how plain text writes them, which is mostly by not writing them.
// The split arrived with `org.ts` — see that file's header for why the previous
// arrangement, where `נטוי: ["*", "*"]` said both what the command meant and how
// Markdown spells it, could not have a second format added to it.

import type { AtomKind, Dialect, EmphasisKind } from "./interchange";
import { render } from "./interchange";

/** The delimiters, which is nearly all Markdown is. */
const WRAP: Record<EmphasisKind, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  code: "`",
  mark: "==",
};

// What each layout atom becomes, in each dialect (#129).
//
// The rule the three tables follow: **an atom becomes syntax only where the
// target format has that syntax.** Everything else becomes the paragraph break a
// reader of that format already understands, because a marker the format does
// not use is not information — it is the converter leaking its own source.
//
// | atom | Markdown | Org | plain text |
// |---|---|---|---|
// | rule | `---` (a thematic break) | `-----` (Org's rule) | a paragraph break |
// | page break | `---` | `-----` | a paragraph break |
// | line break | two spaces + newline | `\\` + newline | a newline |
// | column break | a paragraph break | a paragraph break | a paragraph break |
// | `חסר` (fill) | a paragraph break | a paragraph break | nothing |
// | `מרווח` (vertical space) | a paragraph break | a paragraph break | a paragraph break |
// | `רווח` (horizontal space) | one space | one space | one space |
//
// Before this, plain text reused Markdown's table wholesale, so a `#קו_מפריד`
// left a `---` line and a `#חסר` left `______` in a file that is supposed to be
// the words and nothing else — the UAT report's *"preserves layout markers"*.
const BREAKS: Record<AtomKind, string> = {
  rule: "\n\n---\n\n",
  // A page break and a rule are the same mark here. Markdown has no pages, and
  // a horizontal rule is what a reader meets a page break as.
  pagebreak: "\n\n---\n\n",
  linebreak: "  \n",
  colbreak: "\n\n",
  // `______` was a second thematic break spelled with underscores: a gap is
  // vertical space, Markdown cannot say vertical space, and a rule says something
  // else entirely.
  gap: "\n\n",
  vspace: "\n\n",
  hspace: " ",
};

export const MARKDOWN: Dialect = {
  atom: (kind) => BREAKS[kind],
  // Markdown stops at six, and the outline does not: `#כותרת(רמה: 9)` is a real
  // level nine, and `#########` is not a heading in any flavour.
  heading: (level, text) => `\n\n${"#".repeat(Math.min(level, 6))} ${text}\n\n`,
  emphasis: (kind, text) => WRAP[kind] + text + WRAP[kind],
  listItem: (i, kind, text) => (kind === "number" ? `${i}. ` : "- ") + text + "\n",
  note: (text, collect) => `[^${collect(text)}]`,
  notes: (all) => "\n\n" + all.map((n, k) => `[^${k + 1}]: ${n}`).join("\n") + "\n",
  /**
   * Markdown tables have no colspan and no per-cell styling, so a merged cell
   * degrades to its text in the first column it occupies. That is a real loss,
   * and the reason the PDF stays the authority for anything that matters
   * visually.
   */
  table: (rows, cols) => {
    // Markdown needs a header row; if the table did not declare one, the first
    // row stands in — a headerless Markdown table simply does not render. The
    // `header` argument is therefore ignored here and used only by Org, which
    // can leave the rule out.
    const head = rows.shift();
    if (!head) return "";
    while (head.length < cols) head.push("");
    const line = (r: string[]) => "| " + r.concat(Array(cols).fill("")).slice(0, cols).join(" | ") + " |";
    return [line(head), "|" + " --- |".repeat(cols), ...rows.map(line)].join("\n");
  },
  quote: (text) => `\n\n${text.split("\n").map((l) => "> " + l).join("\n")}\n\n`,
  // TeX-ish maths, which is what every Markdown flavour that renders maths at
  // all expects.
  formula: (math, display) => (display ? `\n\n$$${math}$$\n\n` : `$${math}$`),
  image: (name) => `![](${name})`,
  xref: () => "(§)",
};

/**
 * Plain text: the words that would print, and no marks at all.
 *
 * Not "Markdown with the syntax stripped". A note becomes a parenthetical
 * *where it stood*, because a plain-text file has no way to point at a block at
 * the end — and a reader who meets `[^3]` in an email has been handed a
 * reference to nothing.
 */
/**
 * The break table for plain text, which is **not** Markdown's.
 *
 * Plain text is the words a reader would meet on the page: it has paragraphs and
 * lines, and no other structure. So a rule and a page break are a paragraph
 * break (a divider with no words is a paragraph break), a forced line break is a
 * newline, and the two spacing atoms that Ksav uses to *position* something —
 * `חסר`'s fill and a column break — leave nothing at all, because neither has an
 * effect a reader of the words could name.
 */
const PLAIN_BREAKS: Record<AtomKind, string> = {
  rule: "\n\n",
  pagebreak: "\n\n",
  linebreak: "\n",
  colbreak: "\n\n",
  gap: "",
  vspace: "\n\n",
  hspace: " ",
};

export const PLAIN: Dialect = {
  atom: (kind) => PLAIN_BREAKS[kind],
  heading: (_level, text) => `\n\n${text}\n\n`,
  emphasis: (_kind, text) => text,
  listItem: (_i, _kind, text) => "• " + text + "\n",
  note: (text) => ` (${text})`,
  notes: () => "",
  table: (rows) => rows.map((r) => r.join("\t")).join("\n"),
  quote: (text) => `\n\n${text}\n\n`,
  formula: (math) => math,
  image: (name) => name,
  xref: () => "(§)",
};

/** Convert a Ksav document to Markdown. */
export function toMarkdown(source: string, opts: MarkdownOptions = {}): string {
  return render(source, opts.markup === false ? PLAIN : MARKDOWN);
}

export interface MarkdownOptions {
  /** false → plain text: no `#`, `**`, `[^1]`; notes become parentheticals. */
  markup?: boolean;
}

/** Plain text: the words that would print, with no markup at all. */
export function toPlainText(src: string): string {
  return render(src, PLAIN);
}

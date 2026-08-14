// Org mode, in and out.
//
// # Why this one, and why both directions
//
// Asked for explicitly, and separately from the export list it first appeared
// in. Of every interchange format on that list it is the one whose structure is
// closest to this application's own: headings with levels, folded subtrees,
// footnotes with named labels, `#+` keyword lines, and inline markup with paired
// delimiters. A sefer is a tree of headings with notes hanging off it, and so is
// an Org file.
//
// The risk was never the parsing. Org is a plain-text tree and the grammar fits
// on a page. The risk is the two decisions this file exists to make, once each:
//
//   **going out**, what happens to the things Org has no word for — a note
//   apparatus with eleven surfaces, columns, page regions, tiered notes;
//   **coming in**, what happens to the things Ksav has no word for — property
//   drawers, TODO keywords, tags, scheduling, `#+` keywords nobody reads.
//
// Both answers are the same shape and it is the one `docx.ts` already argued
// for: a bad conversion is worse than an honest gap. Something that cannot come
// across is dropped and *named* in `dropped`, which `main.ts` puts in front of
// the writer in one sentence. An import that quietly loses the drawers is the
// kind of thing somebody discovers a month later.
//
// # What is shared, and what is not
//
// Going out is a `Dialect` over `interchange.ts`'s walk, so what a construct
// *means* is stated once for Markdown, plain text and Org alike, and only the
// spelling is here. Coming in has no such sibling — `docx.ts` reads a zip of XML
// and this reads lines — so the two importers share their result shape and their
// direction heuristic and nothing else, which is all they actually have in
// common.

import type { AtomKind, Dialect, EmphasisKind, ImportResult } from "./interchange";
import { mostlyHebrew, render } from "./interchange";
import { typstContent } from "./typst-escape";

// ---------------------------------------------------------------- going out

/**
 * Org's paired delimiters, and the one place it has nothing.
 *
 * `mark` is highlighting, which Org does not have in any form its exporters
 * agree on. Underline is the nearest thing that survives to HTML, PDF and a
 * terminal alike, and losing the colour is the smaller loss — the alternative
 * is dropping the emphasis and with it the fact that the writer marked the words
 * at all.
 */
const WRAP: Record<EmphasisKind, string> = {
  bold: "*",
  italic: "/",
  strike: "+",
  code: "~",
  mark: "_",
};

const BREAKS: Record<AtomKind, string> = {
  // Five dashes on a line of their own, which is Org's rule.
  rule: "\n\n-----\n\n",
  // Org has no pages, so a page break has nothing to be. It becomes the rule for
  // the same reason Markdown's does: a sefer whose chapters were divided by page
  // breaks arrives as one undivided wall of text otherwise, and the reader has
  // lost something they could see.
  pagebreak: "\n\n-----\n\n",
  // `\\` at the end of a line is Org's forced break, and it is the whole reason
  // this is not just "\n" — a bare newline in Org continues the paragraph.
  linebreak: "\\\\\n",
  colbreak: "\n\n",
  gap: "______",
  vspace: "\n\n",
  hspace: " ",
};

export const ORG: Dialect = {
  atom: (kind) => BREAKS[kind],
  // No ceiling, unlike Markdown's six. Org counts stars, so `#כותרת(רמה: 9)`
  // survives as nine of them and the outline comes across whole — which is the
  // single strongest reason this format was worth having.
  heading: (level, text) => `\n\n${"*".repeat(Math.max(level, 1))} ${text}\n\n`,
  emphasis: (kind, text) => WRAP[kind] + text + WRAP[kind],
  listItem: (i, kind, text) => (kind === "number" ? `${i}. ` : "- ") + text + "\n",
  note: (text, collect) => `[fn:${collect(text)}]`,
  notes: (all) => "\n\n" + all.map((n, k) => `[fn:${k + 1}] ${n}`).join("\n") + "\n",
  /**
   * An Org table, with a rule under the head only if there was a head.
   *
   * The opposite of Markdown, which has to invent one because a headerless
   * Markdown table does not render at all. Org renders either, so a rule under a
   * row that is not a header would be this converter asserting something the
   * document never said.
   */
  table: (rows, cols, header) => {
    const line = (r: string[]) => "| " + r.concat(Array(cols).fill("")).slice(0, cols).join(" | ") + " |";
    const out = rows.map(line);
    if (header && out.length > 1) out.splice(1, 0, "|" + "---+".repeat(cols - 1) + "---|");
    return out.join("\n");
  },
  quote: (text) => `\n\n#+begin_quote\n${text}\n#+end_quote\n\n`,
  // `\[…\]` and `$…$` are Org's LaTeX fragments, which is what its exporters and
  // its own preview both read.
  formula: (math, display) => (display ? `\n\n\\[${math}\\]\n\n` : `$${math}$`),
  image: (name) => `[[file:${name}]]`,
  xref: () => "(§)",
};

/**
 * Convert a Ksav document to Org.
 *
 * The one thing done after the walk: `\\` is a forced line break in Org only
 * when it ends a line that another line follows. `#מעבר_שורה` at the end of a
 * source line produces the marker and then meets the source's own newline, and
 * the pair reads as a paragraph break with a stray `\\` above it — which is a
 * blank line where the writer asked for none. Markdown has no equivalent
 * problem because its marker is two spaces, which a blank line simply absorbs.
 */
export function toOrg(source: string): string {
  return render(source, ORG).replace(/\\\\\n\n+/g, "\\\\\n");
}

// ---------------------------------------------------------------- coming in

/** Inline markup, resolved after the block structure is known. */
const INLINE: [RegExp, string][] = [
  // Order matters only in that `=verbatim=` and `~code~` must be taken before
  // anything can be found inside them; each pattern requires the delimiters to
  // hug their content, which is Org's own rule and what keeps `a * b` from
  // being read as an unterminated bold.
  [/=([^\s=](?:[^=]*[^\s=])?)=/g, "קוד"],
  [/~([^\s~](?:[^~]*[^\s~])?)~/g, "קוד"],
  [/\*([^\s*](?:[^*]*[^\s*])?)\*/g, "הדגשה"],
  [/\/([^\s/](?:[^/]*[^\s/])?)\//g, "נטוי"],
  [/\+([^\s+](?:[^+]*[^\s+])?)\+/g, "קו_חוצה"],
  [/_([^\s_](?:[^_]*[^\s_])?)_/g, "קו_תחתון"],
];

/**
 * The one marker that separates generated markup from the writer's words.
 *
 * Everything below inserts `\0…\0` around markup it produces, always in balanced
 * pairs, and the final pass escapes only the parts that fall outside them. That
 * is not a flourish: `docx.ts` records the bug this prevents, where a generated
 * `#מעבר_שורה` was escaped along with the prose and set as the literal words in
 * the middle of a sentence — and the test that was supposed to catch it asserted
 * `.includes("#מעבר_שורה")`, which `\#מעבר_שורה` satisfies.
 *
 * Balanced pairs are what makes it work: every insertion adds an even number of
 * markers, so the parity of everything after it is unchanged and one `split` at
 * the end can tell the two kinds apart no matter how deeply they nest.
 */
const M = "\u0000";
const markup = (s: string) => M + s + M;

/**
 * One run of Org text as Ksav markup, footnotes and all.
 *
 * Ordered, and the order is the argument: footnote *bodies* are spliced in
 * before the inline passes run, so a note containing `*bold*` gets its bold —
 * splicing them afterwards was the first version and it produced notes whose
 * text was neither converted nor escaped.
 *
 * The emphasis rules are approximate, deliberately. Org's real ones turn on the
 * characters either side of the delimiters and on a five-line variable nobody
 * has ever set; reimplementing that would be a parser for a dialect of a
 * dialect. What is here takes the common case and refuses the ambiguous one,
 * which is why each pattern insists on a non-space at both ends.
 */
function textToKsav(line: string, footnotes: Map<string, string>, dropped: Set<string>): string {
  // Footnotes first, and unmarked in the middle, so the body travels through
  // every pass below exactly as the sentence around it does.
  let out = line
    .replace(/\[fn::([^\]]+)\]/g, (_m, t: string) => `${markup("#הערה[")}${t}${markup("]")}`)
    .replace(/\[fn:([^\]:]+)\]/g, (_m, label: string) => {
      const body = footnotes.get(label);
      if (body == null) {
        // A reference with no definition: Org allows it and prints the label.
        // Dropping it silently would take away a sentence's only sign that
        // something was meant to be said here.
        dropped.add("footnote references with no definition");
        return "";
      }
      return `${markup("#הערה[")}${body}${markup("]")}`;
    });

  // Links next: their `[[…][…]]` brackets would otherwise be escaped.
  out = out.replace(/\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g, (_m, target: string, label?: string) => {
    if (/^file:/i.test(target) && /\.(png|jpe?g|gif|svg|webp)$/i.test(target)) {
      return markup(`#תמונה("${target.replace(/^file:/i, "")}")`);
    }
    // Ksav has no hyperlink command, so a link becomes what it said. Losing the
    // address is real and is reported; losing the sentence would not be.
    dropped.add("links");
    return label ?? target;
  });

  // Maths, before the emphasis patterns can find a `/` inside `\frac`.
  out = out
    .replace(/\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$/g, (_m, a: string, b: string) =>
      markup(`#נוסחה("${(a ?? b).trim().replace(/["\\]/g, "\\$&")}")`))
    .replace(/\$([^$\n]+)\$/g, (_m, m1: string) =>
      markup(`#נוסחה_בשורה("${m1.trim().replace(/["\\]/g, "\\$&")}")`));

  for (const [re, command] of INLINE) {
    out = out.replace(re, (_m, inner: string) => `${markup(`#${command}[`)}${inner}${markup("]")}`);
  }

  return out
    .split(M)
    .map((part, i) => (i % 2 === 1 ? part : typstContent(part)))
    .join("");
}

/** A `#+begin_x` … `#+end_x` block, once its lines are in hand. */
function blockToKsav(
  kind: string,
  lines: string[],
  convert: (line: string) => string,
  dropped: Set<string>,
): string {
  const body = lines.map(convert);
  if (kind === "quote") return `#ציטוט[\n${body.join("\n")}\n]`;
  if (kind === "center") return `#מרכז[${body.join("#מעבר_שורה\n")}]`;
  if (kind === "verse") return body.join("#מעבר_שורה\n");
  if (kind === "src" || kind === "example") {
    // The lines are code and their breaks are load-bearing, so they are kept
    // rather than reflowed into a paragraph — and they are escaped as prose
    // without any inline pass, because a `/` in a path is not italics.
    return `#קוד[${lines.map((l) => typstContent(l)).join("#מעבר_שורה\n")}]`;
  }
  dropped.add(`#+begin_${kind} blocks`);
  return body.join("\n");
}

/**
 * Read an Org file into Ksav markup.
 *
 * Line-based, because Org is. The one piece of state that outlives a line is the
 * list being accumulated: Org writes a list as consecutive lines and Ksav writes
 * it as one call with the items inside, so the items are gathered and flushed
 * when something that is not an item arrives.
 */
export function fromOrg(text: string): ImportResult {
  const dropped = new Set<string>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];

  // Footnote definitions, by label, gathered in a first pass.
  //
  // Before anything else, because Org lets a note be *referenced* pages above
  // where it is defined — the reference is a label, not a position — and a
  // one-pass reader would resolve the early ones to nothing.
  const footnotes = new Map<string, string>();
  for (const line of lines) {
    const m = /^\[fn:([^\]:]+)\]\s*(.*)$/.exec(line);
    if (m) footnotes.set(m[1], m[2]);
  }
  const say = (line: string) => textToKsav(line, footnotes, dropped);

  let list: { items: string[]; ordered: boolean; indent: number } =
    { items: [], ordered: false, indent: 0 };
  const flushList = () => {
    if (!list.items.length) return;
    const command = list.ordered ? "ממוספרת" : "רשימה";
    out.push(`#${command}(\n${list.items.map((i) => `  פריט[${i}],`).join("\n")}\n)`);
    list = { items: [], ordered: false, indent: 0 };
  };

  /** A table's rows, gathered the same way and for the same reason. */
  let table: { rows: string[][]; header: boolean } = { rows: [], header: false };
  const flushTable = () => {
    if (!table.rows.length) return;
    const cols = Math.max(...table.rows.map((r) => r.length));
    const cells: string[] = [];
    for (const row of table.rows) {
      for (let i = 0; i < cols; i++) cells.push(`תא[${row[i] ?? ""}]`);
    }
    const grid: string[] = [];
    for (let i = 0; i < cells.length; i += cols) grid.push("  " + cells.slice(i, i + cols).join(", ") + ",");
    out.push(`#טבלה(עמודות: ${cols},\n${grid.join("\n")}\n)`);
    table = { rows: [], header: false };
  };

  const flush = () => {
    flushList();
    flushTable();
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // `#+begin_x` … `#+end_x`, taken whole.
    const begin = /^\s*#\+begin_(\w+)/i.exec(line);
    if (begin) {
      flush();
      const kind = begin[1].toLowerCase();
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length && !new RegExp(`^\\s*#\\+end_${kind}`, "i").test(lines[j]); j++) {
        body.push(lines[j]);
      }
      out.push(blockToKsav(kind, body, say, dropped));
      i = j;
      continue;
    }

    // `:PROPERTIES:` … `:END:`. Emacs bookkeeping, and there is nothing in Ksav
    // it could become.
    if (/^\s*:PROPERTIES:\s*$/i.test(line)) {
      flush();
      dropped.add("property drawers");
      while (i < lines.length && !/^\s*:END:\s*$/i.test(lines[i])) i++;
      continue;
    }

    // A footnote *definition* line. Already collected above; it must not also
    // arrive as a paragraph.
    if (/^\[fn:([^\]:]+)\]/.test(line)) {
      flush();
      continue;
    }

    // `#+TITLE:` and its dozen relatives.
    const keyword = /^\s*#\+(\w[\w-]*):\s*(.*)$/.exec(line);
    if (keyword) {
      flush();
      const key = keyword[1].toUpperCase();
      if (key === "TITLE" && keyword[2].trim()) {
        out.push(`#שער[${say(keyword[2].trim())}]`);
      } else if (key === "SUBTITLE" && keyword[2].trim()) {
        out.push(`#תת_שער[${say(keyword[2].trim())}]`);
      } else {
        dropped.add("#+keyword lines");
      }
      continue;
    }

    // An Org comment.
    if (/^\s*#(\s|$)/.test(line)) {
      flush();
      continue;
    }

    // A rule: five dashes or more, alone.
    if (/^\s*-{5,}\s*$/.test(line)) {
      flush();
      out.push("#קו_מפריד");
      continue;
    }

    // A heading. The stars are the level, and Org counts as high as you like.
    const head = /^(\*+)\s+(.*)$/.exec(line);
    if (head) {
      flush();
      let text = head[2];
      // TODO keywords and `:tags:`, which are Emacs's way of running a life and
      // not a sefer's. Taken off the heading so they do not print, and named.
      const todo = /^(TODO|DONE|NEXT|WAITING|CANCELLED)\s+/.exec(text);
      if (todo) {
        dropped.add("TODO keywords");
        text = text.slice(todo[0].length);
      }
      const tags = /\s+(:[\w@#%:]+:)\s*$/.exec(text);
      if (tags) {
        dropped.add("heading tags");
        text = text.slice(0, tags.index);
      }
      const level = head[1].length;
      const body = say(text.trim());
      // Six named commands, then the generic one, which is the only spelling
      // that carries a level past six — and Org routinely goes past six.
      out.push(level <= 6 ? `#כותרת${level}[${body}]` : `#כותרת(רמה: ${level})[${body}]`);
      continue;
    }

    // A table row, or the rule under its head.
    const row = /^\s*\|(.*)\|\s*$/.exec(line);
    if (row) {
      flushList();
      if (/^[\s|+-]*$/.test(row[1])) {
        // The rule. It says the rows above it were the head — which is exactly
        // what Ksav's `תא` cannot say, so the fact is kept for the `dropped`
        // report rather than pretended away.
        table.header = true;
        dropped.add("table header rules");
        continue;
      }
      table.rows.push(
        row[1].split("|").map((c) => say(c.trim())),
      );
      continue;
    }

    // A list item. Org's three bullets and its two numbered forms.
    const item = /^(\s*)(?:([-+*])|(\d+)[.)])\s+(.*)$/.exec(line);
    // `*` is the one that needs care, because it is both a bullet and a heading:
    // at column 0 it is a headline and the branch above has already taken it, and
    // indented it is an ordinary bullet. Refusing indented `*` outright — which
    // the first version did — silently deleted every starred sub-list.
    if (item && (item[3] || item[2] !== "*" || item[1].length > 0)) {
      flushTable();
      const ordered = !!item[3];
      // A numbered list following a bulleted one is a different list.
      if (list.items.length && list.ordered !== ordered) flushList();
      // Nesting. Ksav's `#רשימה` is one level, so a sub-list flattens into its
      // parent — the items all survive and their depth does not, which is worth
      // a line in the report rather than a shrug.
      if (list.items.length && item[1].length > list.indent) dropped.add("nested list levels");
      if (!list.items.length) list.indent = item[1].length;
      list.ordered = ordered;
      list.items.push(say(item[4]));
      continue;
    }

    // A `#+` line that is neither a block nor a keyword — a stray `#+end_x`, or
    // one of the dozens Org has that carry no content. It is not prose, and
    // letting it fall through would set it as prose.
    if (/^\s*#\+/.test(line)) {
      flush();
      dropped.add("#+keyword lines");
      continue;
    }

    if (!line.trim()) {
      flush();
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    flush();
    out.push(say(line));
  }
  flush();

  const body = out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return { body: body + "\n", dir: mostlyHebrew(body) ? "rtl" : "ltr", dropped: [...dropped] };
}

// What a Ksav construct *is*, separately from how any one format writes it.
//
// # Why this file exists
//
// `markdown.ts` held both halves at once. Its tables said `נטוי: ["*", "*"]` —
// which is two claims welded together: that `#נטוי` is italic, and that italic
// is written with asterisks. The first is a fact about this application and the
// prelude it compiles against. The second is a fact about Markdown, and it is
// wrong in every other plain-text format there is: Org writes italic with
// slashes, bold with one asterisk rather than two, and code with tildes.
//
// So the moment a second interchange format arrived — Org, asked for in both
// directions — the choice was to copy a hundred rows and a hundred-line walker,
// or to separate the two claims. The copy is what this repository has a name
// for: a classification stated twice, drifting the first time a command is
// renamed, with every test on both sides still passing because both were written
// against the same half.
//
// What lives here is the classification and the walk. What lives in `markdown.ts`
// and `org.ts` is a `Dialect`: eleven small functions that say how *that* format
// writes a heading, a note, a list item, a rule.
//
// # The conversions are lossy on purpose
//
// None of these formats has a note apparatus, columns, or fixed page regions.
// Structure and emphasis survive; notes become whatever the format's own
// footnotes are; and everything else degrades to its text rather than leaking
// `#command[…]` into a file somebody is about to paste into an email. The rule
// the walker enforces at the bottom is the whole contract: **no `#name[` ever
// reaches the output.**

import { resolveDeferred } from "./deferred";
import { withAliases } from "./engine.gen";
import { scan, type Node } from "./spans";

// Every table below is keyed by the **Hebrew** name alone and expanded through
// `withAliases`, which reads the pairing out of the prelude's own `#let` lines.
//
// They used to carry both spellings by hand — about a hundred pairs of them —
// and that is a copy of something the engine already states, with the failure
// mode all such copies have: rename a command in `ksav.typ` and the export
// silently stopped recognising it under its new name, while every test went on
// passing because every test was written in Hebrew. The tiers are the sharper
// case: the prelude defines seven per family and the palette registry advertises
// three, so the hand-written list had to know something *neither* engine table
// said out loud, and the only reason it was right is that somebody typed
// twenty-one names carefully once.

/**
 * The two commands that print as a heading and are **not** headings.
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
 * title is a first-level heading in every format here, none of which has such a
 * thing as centred large text. The two questions genuinely differ, so the
 * divergence is written down with its reason instead of being a nine-row table
 * nobody could tell was disagreeing.
 */
export const TITLES_AS_HEADINGS: Record<string, number> = withAliases({
  שער: 1,
  תת_שער: 2,
});

/**
 * What a piece of inline emphasis *means*.
 *
 * Not what it is written with. `mark` is the odd one and is the reason this is a
 * kind rather than a pair of delimiters: Markdown has `==highlight==`, Org has
 * no highlight at all, and a table of delimiters gives a format no way to say
 * "I do not have this — here is the nearest thing I do have."
 */
export type EmphasisKind = "bold" | "italic" | "strike" | "code" | "mark";

export const EMPHASIS: Record<string, EmphasisKind> = withAliases<EmphasisKind>({
  הדגשה: "bold",
  דיבור_המתחיל: "bold",
  אות: "bold",
  נטוי: "italic",
  פסוק: "italic",
  גמרא: "italic",
  קו_חוצה: "strike",
  קוד: "code",
  סימון: "mark",
});

/**
 * Body-less commands, by what they do to the flow of the text.
 *
 * `pagebreak` and `colbreak` are the interesting pair. Neither has any meaning
 * in a plain-text file, and the honest options are to drop them or to render the
 * break they cause. Both dialects render *something*, because a sefer whose
 * chapters were separated by page breaks arrives as one undivided wall of text
 * otherwise, and a reader meeting that has lost information they can see.
 */
export type AtomKind = "rule" | "pagebreak" | "linebreak" | "colbreak" | "gap" | "vspace" | "hspace";

export const ATOMS: Record<string, AtomKind> = withAliases<AtomKind>({
  קו_מפריד: "rule",
  מעבר_עמוד: "pagebreak",
  מעבר_שורה: "linebreak",
  מעבר_טור: "colbreak",
  חסר: "gap",
  מרווח: "vspace",
  רווח_אופקי: "hspace",
});

/** Commands whose entire call is dropped (apparatus plumbing, config, layout). */
export const DROPPED = new Set(
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
export const NOTES = new Set(
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
// because inside an argument list Typst is already in code context. This used to
// carry a positional regex and a bracket matcher of its own; `spans.ts` reports
// them as ordinary calls, so both are gone and the walker below meets an item
// the same way it meets any other command.

export const LISTS: Record<string, "bullet" | "number"> = withAliases<"bullet" | "number">({
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
 * `enginefacts.test.mjs`; what it used to be given was a **regex over the source
 * text** of the file the tables happened to live in, matching any Hebrew word at
 * two spaces of indent, with a floor of fifty to prove it had found something.
 *
 * That is the failure this repository has a name for. It could not tell a table
 * key from a Hebrew word in a comment, it counted the tier stems by re-deriving
 * the seven suffixes on its own side, and it went red the moment seven rows
 * moved out of a table for a good reason — which is a fence failing for a reason
 * it was not written under. The tables state their own contents here, and the
 * floor is gone with them: an empty export is an empty list and the `every name
 * is a command` check has nothing to be vacuously true over.
 */
export const CLASSIFIED_NAMES: readonly string[] = [
  ...Object.keys(TITLES_AS_HEADINGS),
  ...Object.keys(EMPHASIS),
  ...Object.keys(ATOMS),
  ...DROPPED,
  ...NOTES,
  ...Object.keys(LISTS),
];

// ---------------------------------------------------------------- coming back

/**
 * What an importer hands back, whatever it read.
 *
 * Shared rather than per-format, and that is not tidiness: `main.ts` says what
 * did not come across in one sentence for every import route there is, and two
 * shapes would mean two sentences and, eventually, one of them missing. It lived
 * in `docx.ts` while Word was the only way in.
 */
export interface ImportResult {
  body: string;
  /** `rtl` when the document is mostly Hebrew — a suggestion for the page setup. */
  dir: "rtl" | "ltr";
  /** What was in the file and did not come across, for the writer to be told. */
  dropped: string[];
}

/** Is this mostly Hebrew? Decides an imported document's direction. */
export function mostlyHebrew(text: string): boolean {
  let hebrew = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0590 && c <= 0x05ff) hebrew++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
  }
  // Ties go to Hebrew: this is a Hebrew-first application, and the command names
  // in the converted markup are themselves Hebrew letters — so a document with
  // no prose at all should not be declared English by its own markup.
  return hebrew >= latin;
}

// ---------------------------------------------------------------- the dialect

/**
 * How one plain-text format writes each thing the classification above names.
 *
 * Every method returns the finished text. None of them may emit a `#name[` — the
 * walker cannot check that for you, but `interchange.test.mjs` checks the output
 * of every dialect over a document that uses every construct, which is the same
 * claim made where it can be measured.
 */
export interface Dialect {
  atom(kind: AtomKind): string;
  heading(level: number, text: string): string;
  emphasis(kind: EmphasisKind, text: string): string;
  /** `index` is 1-based within its own list. */
  listItem(index: number, kind: "bullet" | "number", text: string): string;
  /**
   * The marker left where the note was.
   *
   * `collect` files the note's prose for the end of the document and answers
   * with its number; a format that puts notes inline simply never calls it, and
   * then `notes` below is empty and no section is written.
   */
  note(text: string, collect: (prose: string) => number): string;
  /** Everything collected, as the block that goes at the end. */
  notes(collected: string[]): string;
  /** `header` is whether any cell in the table declared itself one. */
  table(rows: string[][], cols: number, header: boolean): string;
  quote(text: string): string;
  formula(math: string, display: boolean): string;
  image(name: string): string;
  /** A cross-reference, whose target is a label this format cannot carry. */
  xref(): string;
}

// ---------------------------------------------------------------- the walk

/**
 * Convert a Ksav document to one plain-text format.
 *
 * The walk is over `spans.ts`'s nodes rather than over the characters, which is
 * what lets a command this converter has never heard of — including one the
 * writer defined themselves — contribute its content and nothing else.
 */
export function render(source: string, d: Dialect): string {
  // A note whose prose lives at the end of the file is still a note. This walker
  // turns a note command's *body* into a footnote, so a deferred marker would
  // convert to nothing and its prose would arrive as loose paragraphs after the
  // document — every note in the export silently detached from its sentence.
  const src = resolveDeferred(source);
  const { byStart } = scan(src);
  const collected: string[] = [];
  const collect = (prose: string) => collected.push(prose);

  /**
   * A Ksav table as this format's table.
   *
   * The column count comes from the node, so a table declaring
   * `עמודות: (2fr, 1fr, 1fr)` exports three columns. Matching `\d+` here gave
   * two, and the cells were reflowed into the wrong rows in the export as well
   * as in the preview.
   */
  const tableOf = (node: Node, walk: (a: number, b: number) => string): string => {
    const cols = node.cols ?? 2;
    const clean = (a: number, b: number) =>
      walk(a, b).trim().replace(/\|/g, "\\|").replace(/\n+/g, " ");
    const cells: { text: string; header: boolean }[] = [];
    for (const c of node.children) {
      if (c.role !== "cell" || !c.bodies[0]) continue;
      cells.push({ text: clean(c.bodies[0].from, c.bodies[0].to), header: c.header === true });
    }
    // A table whose cells are bodies rather than `#תא` calls —
    // `#טבלה(עמודות: 2)[א][ב]`, which lays out as a two-cell table. With no cell
    // node to find, this returned "" and the table vanished from the export
    // entirely: the same silent loss as the list above, from the same cause.
    if (cells.length === 0) {
      for (const b of node.bodies) {
        const text = clean(b.from, b.to);
        if (text !== "") cells.push({ text, header: false });
      }
    }
    if (!cells.length) return "";
    const rows: string[][] = [];
    for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols).map((c) => c.text));
    // Whether the *table* declared a header, which the per-cell flag has always
    // known and nothing has ever read: Markdown must invent one because a
    // headerless table does not render at all, and Org must not, because an Org
    // table with a rule under a row that is not a header is simply wrong.
    return d.table(rows, cols, cells.some((c) => c.header));
  };

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
        // Inside a list, what is between the items is punctuation of the *source*
        // — the commas separating `פריט[…]` calls, the newlines and the indent —
        // and none of it is anything the reader wrote.
        //
        // This was copied through, and had been since the Markdown export was
        // written. `#רשימה(פריט[א], פריט[ב])` came out as `- א` and then a line
        // beginning `, - ב`. Nothing caught it because the only assertion over a
        // list was the no-markup-leaks invariant, and a comma is not markup: the
        // export was checked for the thing it must never do and never once for
        // what it actually produces. Found by writing the same assertion for a
        // second format.
        if (!listKind) out += src[i];
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
        out += d.atom(ATOMS[s.name]);
      } else if (s.name === "הפניה" || s.name === "xref") {
        out += d.xref();
      } else if (s.name === "נוסחה" || s.name === "formula" || s.name === "נוסחה_בשורה" || s.name === "iformula") {
        // A formula's source is a string argument, not a `[body]`. Falling
        // through would have printed the quotes.
        const args = s.args ? src.slice(s.args.from, s.args.to) : "";
        const math = (/"((?:[^"\\]|\\.)*)"/.exec(args)?.[1] ?? "").replace(/\\(.)/g, "$1");
        out += d.formula(math, s.name === "נוסחה" || s.name === "formula");
      } else if (s.name === "תמונה" || s.name === "img") {
        const args = s.args ? src.slice(s.args.from, s.args.to) : "";
        out += d.image(/"([^"]*)"/.exec(args)?.[1] ?? "");
      } else if (s.role === "heading" || TITLES_AS_HEADINGS[s.name] != null) {
        out += d.heading(s.level ?? TITLES_AS_HEADINGS[s.name] ?? 1, inner().trim());
      } else if (s.role === "table") {
        out += "\n\n" + tableOf(s, walk) + "\n\n";
      } else if (LISTS[s.name] != null) {
        // Every group, and a group with no `#פריט` in it is one item.
        //
        // This walked `bodies[0]` alone, with `listKind` set — which suppresses
        // every character that is not inside an item, on the correct argument
        // that the commas and indentation between `פריט[…]` calls are punctuation
        // of the source and not of the document. Put together, a list written
        // `#רשימה[א][ב]` — two bodies, no item command, which the engine lays out
        // as two perfectly good bullets — exported as **nothing at all**: the
        // second body was never visited and the first had its text suppressed for
        // not being in an item.
        //
        // Silent loss of the writer's words on export, in the one direction where
        // it cannot be noticed by looking at the page.
        const kind = LISTS[s.name];
        const groups = hasBody ? s.bodies : s.args ? [s.args] : [];
        const items: string[] = [];
        for (const g of groups) {
          const kids = s.children.filter((c) => c.role === "item" && c.from >= g.from && c.to <= g.to);
          if (kids.length > 0) {
            for (const k of kids) {
              const kb = k.bodies[0];
              items.push(kb ? walk(kb.from, kb.to).trim() : "");
            }
          } else {
            const text = walk(g.from, g.to).trim();
            if (text !== "") items.push(text);
          }
        }
        // Numbered one to n across the whole list rather than per group, which a
        // walk per body could not do — its counter is local to the call.
        out += "\n" + items.map((text, n) => d.listItem(n + 1, kind, text)).join("") + "\n";
      } else if ((s.name === "פריט" || s.name === "item") && listKind) {
        itemIndex++;
        out += d.listItem(itemIndex, listKind, inner().trim());
      } else if (NOTES.has(s.name)) {
        out += d.note(inner().trim(), collect);
      } else if (EMPHASIS[s.name]) {
        const text = inner();
        // Emphasis around nothing is just noise.
        out += text.trim() ? d.emphasis(EMPHASIS[s.name], text) : text;
      } else if (s.name === "ציטוט" || s.name === "blockquote") {
        out += d.quote(inner().trim());
      } else {
        // Everything else contributes its content and nothing else: styling no
        // plain-text format can carry (colour, size, alignment, boxes),
        // structural wrappers, and — importantly — commands this converter has
        // never heard of, including ones the writer defined themselves.
        out += inner();
      }
      i = end;
    }
    return out;
  };

  let text = walk(0, src.length);
  if (collected.length) text += d.notes(collected);
  // Tidy: collapse runs of blank lines, trim trailing spaces on each line.
  return text
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

// One scan of the markup, for everybody.
//
// # The finding this file answers
//
// `README.md` states the architectural centre of the project:
//
// > *"Because Typst itself parses the document, we never reimplement a parser —
// > and arbitrary cross-nesting works for free."*
//
// True of the engine, and it was false of everything in front of it. Ten private
// delimiter matchers lived in `src/`, plus a bracket walk in `bidi.ts` and the
// balance scanner in `brackets.ts`, and they disagreed about all four of the
// questions a scanner has to answer:
//
// | | `"` | `\` | `//` | `{}` |
// |---|---|---|---|---|
// | `ksav-lang` ×3 | no | no | no | no |
// | `headings` | no | **yes** | no | no |
// | `lists` | **yes** | **yes** | no | no |
// | `table` | at depth 0 | no | no | no |
// | `markdown` | no | no | no | no |
// | `spell` | no | no | no | no |
// | `deferred` | at value start | no | via `brackets` | no |
// | `apparatus` | yes | no | no | no |
//
// `brackets.ts` had already written the invariant down — *"the two scanners must
// agree or the lint would contradict the renderer"* — and there were ten more.
// Six one-click contradictions were reproduced from those disagreements, the
// worst of which is that a gershayim (רש״י — the most common word in a sefer)
// silently switched off every list operation in the ribbon.
//
// # There is a right answer, and it is not a compromise
//
// The scanners split over `"` because each had picked a side of a real trade-off:
// treat it as a string delimiter and a Hebrew abbreviation swallows the document;
// treat it as an ordinary character and `#הערה_זרם("a)b")` never closes. Both
// were wrong, because **Typst does not have one rule** — it has two, chosen by
// context, and neither scanner tracked context:
//
//   - inside `[…]` Typst is in *content* mode: `"` is an ordinary character
//     (rendered as a curly quote), and `\` escapes the character after it;
//   - inside `(…)` and `{…}` it is in *code* mode: `"` opens a string literal, in
//     which `\` escapes and every bracket is inert.
//
// Both halves were checked against the real compiler rather than reasoned about
// (`cargo run --example probe`):
//
//   - `#רשימה(פריט[דברי רש"י],)` lays out two bullets — so the gershayim rule
//     `lists.ts` enforced was not merely inconvenient, it disagreed with the
//     engine;
//   - `#הערה_זרם("a)b")[גוף]` lays out a footnote — so the `)` inside the string
//     really is inert, which `ksav-lang.ts` could not see;
//   - `#הדגשה[סוגר \] בתוך גוף]` prints a literal `]` — so the escape is real;
//   - `#הדגשה[אלף // בית]` **fails to compile**, because `//` runs to end of line
//     in content mode too and eats the closing bracket.
//
// So one context-tracked scanner is strictly better than every matcher it
// replaces: it keeps gershayim safe *and* reads strings correctly, which no
// single-rule scanner could do. The disagreements are not arbitrated, they are
// made unrepresentable.
//
// # What it does not do
//
// It does not reprint anything. Every structural edit in the app is still a
// textual splice over ranges — `table.ts` is still the one place that
// pretty-prints, for the reason its own comment gives — so a writer's
// whitespace, comments and argument order survive an edit exactly as before.
// This file only answers *where things are*, which is the half that was
// duplicated.
//
// It is also deliberately dependency-free and pure (text in, spans out), so it
// tests without a browser, a CodeMirror instance or a compiler.

// ---------------------------------------------------------------- characters

const NAME_START = /[A-Za-z֐-׿_]/;
const NAME_CH = /[A-Za-z0-9֐-׿_]/;

function isNameStart(c: number): boolean {
  return (
    (c >= 0x41 && c <= 0x5a) || // A-Z
    (c >= 0x61 && c <= 0x7a) || // a-z
    (c >= 0x0590 && c <= 0x05ff) || // Hebrew
    c === 0x5f // _
  );
}

function isNameCh(c: number): boolean {
  return isNameStart(c) || (c >= 0x30 && c <= 0x39);
}

// ---------------------------------------------------------------- the model

/**
 * Which of Typst's two worlds a position sits in.
 *
 * The distinction the ten matchers were missing. A document starts in content;
 * `(` and `{` open code, `[` opens content, and the two nest arbitrarily.
 */
export type Ctx = "content" | "code";

/** A range inside a pair of delimiters — the text, not the brackets. */
export interface Group {
  from: number;
  to: number;
}

/**
 * What a call *is*, as far as the surfaces are concerned.
 *
 * This is the second half of the finding. Six alternations of command names
 * disagreed about which names exist — `ממוספרת_עברית` was a list to the ribbon
 * and not to prose mode, `hlevel` was a heading to the demote button and not to
 * the outline — so a role lives on the node and is derived from one table below.
 * `other` is not a failure: most commands are styling and need no role.
 */
export type Role = "heading" | "list" | "item" | "table" | "cell" | "other";

/** How a list numbers itself. */
export type ListKind = "bullets" | "numbered" | "hebrew";

export interface Node {
  /** The `#`, or the first letter of a call written bare inside an argument list. */
  from: number;
  /** One past the end of the whole call, bodies included. */
  to: number;
  name: string;
  /** Written with a leading `#`. Bare calls are how Typst writes them in code. */
  hash: boolean;
  /** Which spelling of the command this is, so a rewrite keeps the document's language. */
  lang: "he" | "en";
  nameFrom: number;
  nameTo: number;
  /** Inside the `(…)`, or null when the call takes no argument list. */
  args: Group | null;
  /**
   * Every trailing `[…]` group, in order.
   *
   * More than one is real and not a curiosity: `#גוף_הערה[א][…]` names a
   * deferred note in the first and carries its prose in the second, and every
   * scanner that captured only one group had to special-case it by hand.
   */
  bodies: Group[];
  /** The context the call itself sits in — content for `#`-calls, code for bare ones. */
  ctx: Ctx;
  /** Nesting depth among calls, 0 for a call inside no other. */
  depth: number;
  parent: Node | null;
  children: Node[];

  role: Role;
  /** `heading`: the outline level it produces. */
  level?: number;
  /**
   * `heading`: the prelude pins this level and a rewrite cannot change it.
   *
   * `#סימן` is `heading(level: 1, …)` with the level written into the
   * definition, so "demote" has no spelling that keeps the command. Saying so
   * is what lets the surfaces grey the control out instead of rewriting a siman
   * into a `#כותרת2` and losing its numbering.
   */
  levelFixed?: boolean;
  /** `heading`: where the words are, which is not always a body. */
  titleGroups?: Group[];
  /** `list`: how it numbers. */
  listKind?: ListKind;
  /** `table`: the declared column count, track list resolved. */
  cols?: number;
  /** `table`: per-column track sizes when it declares them — `("2fr", "1fr")`. */
  widths?: string[] | null;
  /** `table`: the range of the whole `עמודות: …` argument, for a rewrite. */
  colsArg?: Group;
  /**
   * `table`: this table's own cells, and every argument that is not one.
   *
   * Computed once per scan rather than per question, and that is not
   * micro-optimisation — `structure.availableAt` decides which of the eighteen
   * table controls are enabled by *running* all eighteen on every caret move,
   * so anything a single `tableAt` does gets done eighteen times per keypress.
   * Splitting the argument list there cost 1.5 ms on a six-hundred-row table;
   * splitting it here costs it once and the memo hands it back.
   */
  cells?: Node[];
  /** `table`: every named argument that is not a cell and not `עמודות`. */
  options?: string[];
  /** `cell`: written as a header cell. */
  header?: boolean;
  /** `cell`: columns spanned; 1 unless written with `מיזוג`. */
  span?: number;
}

export interface Comment {
  from: number;
  to: number;
  /** A `/*` that never terminates: it silently eats the rest of the document. */
  unterminated?: boolean;
}

export interface Scan {
  /** Every call, in document order — which is outermost-first. */
  nodes: Node[];
  /** The calls that sit inside no other call. */
  roots: Node[];
  comments: Comment[];
  /** Code-mode string literals, contents only. Brackets in here are inert. */
  strings: Group[];
  /**
   * Every `[…]` group that closes, contents only, in document order.
   *
   * A superset of the calls' bodies, and the difference matters: `#סימן("א",
   * [דיני תפילה])` puts its words in a content argument that belongs to no
   * nested call at all. This is the honest definition of "the parts of the
   * document that are prose", which is the question the spell checker is really
   * asking and had been answering with a private recursive walker.
   */
  contentGroups: Group[];
  /** By `from`, for a walker that has a position and wants the call starting there. */
  byStart: Map<number, Node>;
  /** Opener index → closer index, for every delimiter that closes. */
  closes: Map<number, number>;
  /** The text that was scanned, so a consumer can slice without carrying it. */
  text: string;
}

// ------------------------------------------------------------ the name table
//
// One table, read by every surface. The alternations it replaces disagreed six
// ways; the fence for it is `spans.test.mjs`, which asserts every name here is a
// command the engine actually defines, and `test/names.test.mjs`, which asserts
// the engine defines no structural command this table has forgotten.

/** `#כותרתN` / `#hN` — the level is in the name. */
const NAMED_HEADINGS: Record<string, number> = {
  "כותרת1": 1, h1: 1,
  "כותרת2": 2, h2: 2,
  "כותרת3": 3, h3: 3,
  "כותרת4": 4, h4: 4,
  "כותרת5": 5, h5: 5,
  "כותרת6": 6, h6: 6,
};

/** The generic form, which is the only way past level 6. */
const GENERIC_HEADINGS = new Set(["כותרת", "hlevel"]);

/**
 * Headings whose level the prelude fixes.
 *
 * `#סימן(מספר, כותרת)` is `heading(level: 1, [סימן #מספר — #כותרת])`. It really
 * is a heading — it numbers, it folds, and it enters `#תוכן` — so leaving it out
 * of the outline would be wrong, and so would offering to demote it.
 */
const FIXED_HEADINGS: Record<string, number> = { "סימן": 1, siman: 1 };

/**
 * Commands that look like headings and are not.
 *
 * `#שער` is `align(center, text(size: 2em, weight: "bold", body))` — big centred
 * words with no `heading()` anywhere in it. It does not number, and it does not
 * appear in a compiled `#תוכן`; the editor's outline listed it at level 1
 * anyway, so the outline pane and the printed table of contents disagreed about
 * what the document's sections were. Verified against the compiler: a document
 * of `#תוכן()`, `#שער[…]` and `#כותרת1[…]` prints exactly one contents entry.
 *
 * Named rather than merely omitted, because "not a heading" is the finding.
 */
export const NOT_HEADINGS = new Set(["שער", "title", "תת_שער", "subtitle"]);

/** The argument that carries a generic heading's level. */
const LEVEL_ARG = /(?:^|,)\s*(?:רמה|level)\s*:\s*(\d+)/u;

const LIST_KINDS: Record<string, ListKind> = {
  "רשימה": "bullets", bullets: "bullets",
  "ממוספרת": "numbered", numbered: "numbered",
  "ממוספרת_עברית": "hebrew", henum: "hebrew",
};

const ITEM_NAMES = new Set(["פריט", "item"]);
const TABLE_NAMES = new Set(["טבלה", "mktable"]);

/** Cell commands, and what each one means. */
const CELL_KINDS: Record<string, { header: boolean; merge: boolean }> = {
  "תא": { header: false, merge: false },
  cell: { header: false, merge: false },
  "כותרת_תא": { header: true, merge: false },
  headcell: { header: true, merge: false },
  "מיזוג": { header: false, merge: true },
  colspan_: { header: false, merge: true },
};

/** The declared column count or track list. */
const COLS_ARG = /(?:^|,)\s*(?:עמודות|columns)\s*:\s*/u;
/** An argument that is a cell rather than a setting. */
const CELL_ARG = /^(?:כותרת_תא|headcell|תא|cell|מיזוג|colspan_)\s*[([]/u;
const COLS_ARG_HEAD = /^(?:עמודות|columns)\s*:/u;

/**
 * The command each concept is written as, in each language.
 *
 * The write side of the same table: `lists.ts` and `headings.ts` rebuild calls
 * and must not turn an English document Hebrew on a ribbon click.
 */
export const SPELLING = {
  list: {
    bullets: { he: "רשימה", en: "bullets" },
    numbered: { he: "ממוספרת", en: "numbered" },
    hebrew: { he: "ממוספרת_עברית", en: "henum" },
  },
  item: { he: "פריט", en: "item" },
  table: { he: "טבלה", en: "mktable" },
  cell: { he: "תא", en: "cell" },
  headcell: { he: "כותרת_תא", en: "headcell" },
  merge: { he: "מיזוג", en: "colspan_" },
  cols: { he: "עמודות", en: "columns" },
  headingLevel: { he: "רמה", en: "level" },
  headingGeneric: { he: "כותרת", en: "hlevel" },
  headingNamed: { he: "כותרת", en: "h" },
} as const;

/** Every name the table knows, for the fence that checks it against the engine. */
export const STRUCTURAL_NAMES: string[] = [
  ...Object.keys(NAMED_HEADINGS),
  ...GENERIC_HEADINGS,
  ...Object.keys(FIXED_HEADINGS),
  ...NOT_HEADINGS,
  ...Object.keys(LIST_KINDS),
  ...ITEM_NAMES,
  ...TABLE_NAMES,
  ...Object.keys(CELL_KINDS),
];

/** Ksav writes levels 1–6 as `#כותרתN`, and anything deeper generically. */
export const MAX_NAMED_LEVEL = 6;

/**
 * Nine, matching what the page can now show.
 *
 * Typst itself has no ceiling, and neither does the outline — but past nine the
 * indent ramp runs into the text and one more level of nesting stops being a
 * thing a reader can see. A limit the page can honour beats a promise it cannot.
 */
export const MAX_LEVEL = 9;

/** Which spelling of a command this is. Latin first letter means the English one. */
export function langOf(name: string): "he" | "en" {
  const c = name.charCodeAt(0);
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) ? "en" : "he";
}

// -------------------------------------------------------------------- lexing

interface Head {
  from: number;
  nameFrom: number;
  nameTo: number;
  hash: boolean;
  ctx: Ctx;
}

/**
 * One left-to-right pass: comments, strings, matched delimiters, and the
 * positions where a call begins.
 *
 * Everything downstream is assembly over what this produces, so there is exactly
 * one place in the app that decides what a `"` means.
 */
function lex(text: string): {
  comments: Comment[];
  strings: Group[];
  contentGroups: Group[];
  /** Opener index → closer index, for every delimiter that closes. */
  closes: Map<number, number>;
  heads: Head[];
} {
  const comments: Comment[] = [];
  const strings: Group[] = [];
  const contentGroups: Group[] = [];
  const closes = new Map<number, number>();
  const heads: Head[] = [];
  const stack: { pos: number; code: number; ctx: Ctx }[] = [];
  let ctx: Ctx = "content";

  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);

    // ---- comments, in both contexts ----
    // Verified: `#הדגשה[אלף // בית]` does not compile, because the `//` eats the
    // closing bracket. A scanner that treated `//` as prose inside a body would
    // report that document as balanced and the compiler would not.
    if (c === 0x2f /* / */) {
      const next = text.charCodeAt(i + 1);
      if (next === 0x2f /* / */ && text.charCodeAt(i - 1) !== 0x3a /* : */) {
        const nl = text.indexOf("\n", i);
        const to = nl < 0 ? n : nl;
        comments.push({ from: i, to });
        i = to - 1;
        continue;
      }
      if (next === 0x2a /* * */) {
        const end = text.indexOf("*/", i + 2);
        if (end < 0) {
          comments.push({ from: i, to: n, unterminated: true });
          break;
        }
        comments.push({ from: i, to: end + 2 });
        i = end + 1;
        continue;
      }
    }

    if (ctx === "content") {
      // A backslash escapes the character after it, so `\]` is a literal `]` and
      // not a closer. `headings.ts` and `lists.ts` knew this; the other eight did
      // not, which is why the same document had two different shapes.
      if (c === 0x5c /* \ */) {
        i++;
        continue;
      }
      // `"` is an ordinary character here. This is the gershayim rule, and it is
      // Typst's rule rather than a concession: רש"י, שו"ע, ע"ב.
    } else {
      // ---- code: `"` opens a string, in which nothing else counts ----
      if (c === 0x22 /* " */) {
        let j = i + 1;
        while (j < n) {
          const s = text.charCodeAt(j);
          if (s === 0x5c) j += 2;
          else if (s === 0x22) break;
          else j++;
        }
        strings.push({ from: i + 1, to: Math.min(j, n) });
        i = Math.min(j, n);
        continue;
      }
    }

    // ---- delimiters ----
    if (c === 0x5b /* [ */ || c === 0x28 /* ( */ || c === 0x7b /* { */) {
      stack.push({ pos: i, code: c, ctx });
      ctx = c === 0x5b ? "content" : "code";
      continue;
    }
    if (c === 0x5d /* ] */ || c === 0x29 /* ) */ || c === 0x7d /* } */) {
      const want = c === 0x5d ? 0x5b : c === 0x29 ? 0x28 : 0x7b;
      const top = stack[stack.length - 1];
      if (top && top.code === want) {
        closes.set(top.pos, i);
        if (want === 0x5b) contentGroups.push({ from: top.pos + 1, to: i });
        stack.pop();
        ctx = top.ctx;
      }
      // A closer with nothing open, or the wrong kind, is left alone: this scan
      // describes a document, and `brackets.ts` is the one that judges it.
      continue;
    }

    // ---- call heads ----
    if (c === 0x23 /* # */) {
      const s = i + 1;
      if (s < n && isNameStart(text.charCodeAt(s))) {
        let e = s + 1;
        while (e < n && isNameCh(text.charCodeAt(e))) e++;
        heads.push({ from: i, nameFrom: s, nameTo: e, hash: true, ctx });
        i = e - 1;
        continue;
      }
      continue;
    }
    if (ctx === "code" && isNameStart(c)) {
      // A bare call — how Typst writes one inside an argument list, and the
      // reason `#רשימה(פריט[…])` has no hash on the item. Four modules had a
      // private regex for this and `spell.ts` had a recursive walker.
      if (i > 0 && isNameCh(text.charCodeAt(i - 1))) continue;
      let e = i;
      while (e < n && isNameCh(text.charCodeAt(e))) e++;
      let j = e;
      while (j < n && (text.charCodeAt(j) === 0x20 || text.charCodeAt(j) === 0x09)) j++;
      const after = text.charCodeAt(j);
      // Only a name that is actually *called*. `עמודות: 2` is a setting, not a
      // call, and counting it as one is how a scanner ends up with a node per
      // argument name.
      if (after === 0x28 /* ( */ || after === 0x5b /* [ */) {
        heads.push({ from: i, nameFrom: i, nameTo: e, hash: false, ctx });
      }
      i = e - 1;
      continue;
    }
  }

  // Pushed as each group closes, so the list arrives innermost-first; document
  // order is what every consumer wants, and it is what makes "blank the head,
  // then expose the content inside it" come out right by iteration alone.
  contentGroups.sort((a, b) => a.from - b.from);
  return { comments, strings, contentGroups, closes, heads };
}

// ----------------------------------------------------------------- assembly

function skipSpaceTab(text: string, i: number): number {
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c !== 0x20 && c !== 0x09) break;
    i++;
  }
  return i;
}

/**
 * Split an argument list at its top-level commas.
 *
 * Depth- and string-aware through the same rules as the scan, so a cell body
 * full of commas and a `יישור: (left, right)` both survive.
 */
export function splitArgs(text: string, from: number, to: number): Group[] {
  return splitArgsRaw(text, from, to).filter((g) => text.slice(g.from, g.to).trim() !== "");
}

/**
 * The same split, keeping empty segments.
 *
 * A trailing comma is idiomatic Typst (`#רשימה(פריט[א],)`), so an empty final
 * segment is normal and most callers want it dropped. `deferred.ts` does not:
 * it rewrites one argument of a call in place and needs every segment's real
 * position, including the blank ones it is going to write into.
 */
export function splitArgsRaw(text: string, from: number, to: number): Group[] {
  const out: Group[] = [];
  let start = from;
  walkArgs(text, from, to, (i, c) => {
    if (c !== ",") return false;
    out.push({ from: start, to: i });
    start = i + 1;
    return false;
  });
  out.push({ from: start, to });
  return out;
}

/**
 * The index of the `:` that makes this argument a named one, or -1.
 *
 * Top level only: `יישור: (left, right)` names one argument, and the colon
 * inside a nested group names nothing.
 */
export function topLevelColon(text: string, from: number, to: number): number {
  let found = -1;
  walkArgs(text, from, to, (i, c) => {
    if (c !== ":") return false;
    found = i;
    return true; // stop
  });
  return found;
}

/**
 * Walk `[from, to)` at argument-list top level, calling `visit` on each
 * character that is neither nested, quoted, escaped nor commented.
 *
 * The shared body of every "split this argument list" routine in `src/`. There
 * were four of them in `styles.ts` alone — none of which the survey that
 * started this work counted — plus one in `table.ts`, one in `deferred.ts` and
 * one here, and all four of the `styles.ts` ones opened a string on any `"`
 * including inside a `[…]` body, where Typst does not.
 */
function walkArgs(
  text: string,
  from: number,
  to: number,
  visit: (i: number, ch: string) => boolean,
): void {
  let depth = 0;
  let ctx: Ctx = "code";
  const stack: Ctx[] = [];
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) {
      if (text[i + 1] === "/" && text[i - 1] !== ":") {
        const nl = text.indexOf("\n", i);
        i = (nl < 0 || nl > to ? to : nl) - 1;
        continue;
      }
      if (text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        i = (end < 0 || end + 2 > to ? to : end + 2) - 1;
        continue;
      }
    }
    if (ctx === "content" && c === "\\") {
      i++;
      continue;
    }
    if (ctx === "code" && c === '"') {
      let j = i + 1;
      while (j < to && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      i = j;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      stack.push(ctx);
      ctx = c === "[" ? "content" : "code";
      depth++;
    } else if (c === ")" || c === "]" || c === "}") {
      if (depth > 0) {
        depth--;
        ctx = stack.pop() ?? "code";
      }
    } else if (depth === 0) {
      if (visit(i, c)) return;
    }
  }
}

/**
 * The `#command` an opener belongs to, or null.
 *
 * Lives here rather than in `brackets.ts` because it is a question about the
 * markup, and answering it means skipping back over a complete `(…)` argument
 * group so that the body bracket of `#כותרת(רמה: 2)[…]` still knows whose it
 * is. `brackets.ts` needs it for a lint message on a document that does not
 * balance, which is why it is a backwards walk rather than a node lookup.
 */
export function callNameBefore(text: string, pos: number): string | null {
  let i = pos - 1;
  if (text[i] === ")") {
    let open = -1;
    let level = 0;
    for (let j = i; j >= 0; j--) {
      const c = text[j];
      if (c === ")") level++;
      else if (c === "(") {
        level--;
        if (level === 0) {
          open = j;
          break;
        }
      }
    }
    if (open < 0) return null;
    i = open - 1;
  }
  const end = i + 1;
  while (i >= 0 && NAME_CH.test(text[i])) i--;
  if (i < 0 || text[i] !== "#" || i + 1 === end) return null;
  return text.slice(i + 1, end);
}

/** Trim a range down to the text inside it, whitespace excluded. */
function trimmed(text: string, g: Group): Group {
  let { from, to } = g;
  while (from < to && /\s/.test(text[from])) from++;
  while (to > from && /\s/.test(text[to - 1])) to--;
  return { from, to };
}

function classify(text: string, node: Node, closes: Map<number, number>): void {
  const { name } = node;

  if (NOT_HEADINGS.has(name)) return; // named so this stays a decision, not an omission

  const fixed = FIXED_HEADINGS[name];
  if (fixed != null) {
    node.role = "heading";
    node.level = fixed;
    node.levelFixed = true;
    // `#סימן("א", [דיני תפילה])` — the words are in the content argument, not in
    // a body, which is why an outline built from `[…]` groups on the line found
    // the title and an editing model built from `#name[…]` found nothing at all.
    node.titleGroups = node.args
      ? splitArgs(text, node.args.from, node.args.to)
          .map((g) => trimmed(text, g))
          .filter((g) => text[g.from] === "[")
          .map((g) => ({ from: g.from + 1, to: g.to - 1 }))
      : [];
    if (node.titleGroups.length === 0 && node.bodies.length) node.titleGroups = node.bodies;
    return;
  }

  const named = NAMED_HEADINGS[name];
  if (named != null) {
    node.role = "heading";
    node.level = named;
    node.levelFixed = false;
    node.titleGroups = node.bodies.slice(0, 1);
    return;
  }

  if (GENERIC_HEADINGS.has(name)) {
    node.role = "heading";
    const m = node.args ? LEVEL_ARG.exec(text.slice(node.args.from, node.args.to)) : null;
    node.level = m ? Math.max(1, parseInt(m[1], 10)) : 1;
    node.levelFixed = false;
    node.titleGroups = node.bodies.slice(0, 1);
    return;
  }

  const kind = LIST_KINDS[name];
  if (kind) {
    node.role = "list";
    node.listKind = kind;
    return;
  }

  if (ITEM_NAMES.has(name)) {
    node.role = "item";
    return;
  }

  if (TABLE_NAMES.has(name)) {
    node.role = "table";
    readColumns(text, node, closes);
    return;
  }

  const cell = CELL_KINDS[name];
  if (cell) {
    node.role = "cell";
    node.header = cell.header;
    // `#מיזוג(2)[…]` — the span is the one positional argument.
    let span = 1;
    if (cell.merge && node.args) {
      const m = /^\s*(\d+)\s*$/.exec(text.slice(node.args.from, node.args.to));
      if (m) span = Math.max(1, parseInt(m[1], 10));
    }
    node.span = span;
    return;
  }
}

/**
 * A table's declared width, in either of the two forms Typst accepts.
 *
 * `columns:` takes a count *or* a list of track sizes, and the engine passes the
 * argument straight through — so `#טבלה(עמודות: (2fr, 1fr, 1fr))` has always
 * rendered as three columns. Two readers only understood `\d+`: prose mode drew
 * it as a two-column grid, and one ribbon click on `table.widerColumn` — which
 * is the control that *produces* a track list — rewrote a three-column table as
 * `עמודות: 2` with the cells reflowed into the wrong rows.
 */
function readColumns(text: string, node: Node, closes: Map<number, number>): void {
  node.cols = 2;
  node.widths = null;
  if (!node.args) return;
  const args = text.slice(node.args.from, node.args.to);
  const m = COLS_ARG.exec(args);
  if (!m) return;
  const valueAt = node.args.from + m.index + m[0].length;
  node.colsArg = { from: node.args.from + m.index + (m[0].length - m[0].trimStart().length), to: valueAt };
  if (text[valueAt] === "(") {
    const shut = closes.get(valueAt);
    if (shut == null) return;
    const widths = splitArgs(text, valueAt + 1, shut).map((g) => text.slice(g.from, g.to).trim());
    if (widths.length) {
      node.widths = widths;
      node.cols = widths.length;
    }
    return;
  }
  const digits = /^\d+/.exec(text.slice(valueAt));
  if (digits) node.cols = Math.max(1, parseInt(digits[0], 10));
}

/**
 * Scan a document once.
 *
 * The result is a flat list in document order (outermost first), a root list,
 * and the comment and string regions the scan resolved on the way. Every
 * consumer in `src/` reads this and nothing else.
 *
 * Memoised, and that is not an optimisation detail — it is what makes "one
 * scan" true at runtime rather than only in the source. Prose mode, the notes
 * pane, the ribbon's eighteen table operations and the spell checker all answer
 * questions about the same document within one keystroke; each calling `scan`
 * for itself would be the old duplication with a nicer spelling and a bigger
 * bill. A handful of entries covers a keystroke and the speculative healed copy
 * compiled beside it.
 */
export function scan(text: string): Scan {
  for (let i = 0; i < CACHE.length; i++) {
    if (CACHE[i].text === text) {
      // Most-recent last, so the eviction below drops the coldest entry.
      const hit = CACHE.splice(i, 1)[0];
      CACHE.push(hit);
      return hit;
    }
  }
  const fresh = scanUncached(text);
  CACHE.push(fresh);
  if (CACHE.length > CACHE_SIZE) CACHE.shift();
  return fresh;
}

const CACHE_SIZE = 4;
const CACHE: Scan[] = [];

/** Drop the memo. Only tests need this — a scan is a pure function of its text. */
export function clearScanCache(): void {
  CACHE.length = 0;
}

function scanUncached(text: string): Scan {
  const { comments, strings, contentGroups, closes, heads } = lex(text);
  const nodes: Node[] = [];
  const byStart = new Map<number, Node>();

  for (const h of heads) {
    const name = text.slice(h.nameFrom, h.nameTo);
    let at = skipSpaceTab(text, h.nameTo);
    let args: Group | null = null;
    if (text[at] === "(") {
      const close = closes.get(at);
      // An argument list that never closes leaves the call head-only rather than
      // swallowing the document — the same choice every matcher here made, kept.
      if (close != null) {
        args = { from: at + 1, to: close };
        at = skipSpaceTab(text, close + 1);
      }
    }
    const bodies: Group[] = [];
    while (text[at] === "[") {
      const close = closes.get(at);
      if (close == null) break;
      bodies.push({ from: at + 1, to: close });
      at = skipSpaceTab(text, close + 1);
    }
    const to =
      bodies.length > 0
        ? bodies[bodies.length - 1].to + 1
        : args != null
          ? args.to + 1
          : h.nameTo;

    const node: Node = {
      from: h.from,
      to,
      name,
      hash: h.hash,
      lang: langOf(name),
      nameFrom: h.nameFrom,
      nameTo: h.nameTo,
      args,
      bodies,
      ctx: h.ctx,
      depth: 0,
      parent: null,
      children: [],
      role: "other",
    };
    classify(text, node, closes);
    nodes.push(node);
    byStart.set(node.from, node);
  }

  // Containment, from the flat list. `heads` is already in document order, so a
  // stack of still-open ancestors is enough and no sorting is needed.
  const roots: Node[] = [];
  const open: Node[] = [];
  for (const node of nodes) {
    while (open.length && open[open.length - 1].to <= node.from) open.pop();
    const parent = open[open.length - 1] ?? null;
    node.parent = parent;
    node.depth = parent ? parent.depth + 1 : 0;
    if (parent) parent.children.push(node);
    else roots.push(node);
    open.push(node);
  }

  // A table's cells and its non-cell arguments, once per scan. This needs the
  // containment tree, so it cannot happen in `classify`.
  for (const node of nodes) {
    if (node.role !== "table" || !node.args) continue;
    node.cells = node.children.filter((c) => c.role === "cell");
    node.options = splitArgs(text, node.args.from, node.args.to)
      .map((g) => text.slice(g.from, g.to).trim())
      .filter((a) => !CELL_ARG.test(a) && !COLS_ARG_HEAD.test(a));
  }

  return { nodes, roots, comments, strings, contentGroups, byStart, closes, text };
}

// ------------------------------------------------------------------ helpers

/**
 * The index of the delimiter matching the one at `at`, or null.
 *
 * The replacement for all ten private matchers. It costs a scan of the text
 * before `at` as well as after, because a `"` two lines up decides whether the
 * bracket in hand is structure or prose — which is exactly the context the
 * matchers that took only `(text, at)` could not have.
 */
export function matchGroup(text: string, at: number): number | null {
  return scan(text).closes.get(at) ?? null;
}

/** A structural bracket: one that Typst would read as a delimiter. */
export interface Delimiter {
  pos: number;
  ch: "[" | "(" | "{" | "]" | ")" | "}";
  opener: boolean;
}

const DELIM_CH: Record<number, Delimiter["ch"]> = {
  0x5b: "[", 0x28: "(", 0x7b: "{",
  0x5d: "]", 0x29: ")", 0x7d: "}",
};

/**
 * Every bracket in `text` that is structure rather than prose, in order.
 *
 * The one thing `brackets.ts` needs and cannot get from the node tree: a node
 * tree is a description of a *balanced* document, and the whole job over there
 * is to describe an unbalanced one. So the balance judgement stays in that file
 * and the question of what counts as a bracket comes from here — which is the
 * split that had been missing, and it was not free. Its own scanner skipped
 * comments and nothing else, so on three documents the compiler accepts:
 *
 *   - `#הערה_זרם("a)b")[גוף]` — the `)` inside the string was read as a real
 *     closer, the lint reported a stray `)`, and the one-click heal **deleted
 *     the call's actual closing paren**;
 *   - `#הדגשה[סוגר \] בתוך]` — the escaped `]` was read as a closer and the heal
 *     deleted the real one;
 *   - `#f("x[y")[ok]` — a `[` inside a string was reported unclosed and a `]`
 *     appended at end of file.
 *
 * In each case a correct document was marked broken and the repair broke it,
 * and because `compile.ts` compiles the *healed* copy speculatively, the
 * preview was rendering the corrupted text.
 */
export function delimiters(text: string): { delims: Delimiter[]; comments: Comment[] } {
  const comments: Comment[] = [];
  const delims: Delimiter[] = [];
  const stack: { code: number; ctx: Ctx }[] = [];
  let ctx: Ctx = "content";
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);

    if (c === 0x2f /* / */) {
      const next = text.charCodeAt(i + 1);
      if (next === 0x2f && text.charCodeAt(i - 1) !== 0x3a) {
        const nl = text.indexOf("\n", i);
        const to = nl < 0 ? n : nl;
        comments.push({ from: i, to });
        i = to - 1;
        continue;
      }
      if (next === 0x2a /* * */) {
        const end = text.indexOf("*/", i + 2);
        if (end < 0) {
          comments.push({ from: i, to: n, unterminated: true });
          break;
        }
        comments.push({ from: i, to: end + 2 });
        i = end + 1;
        continue;
      }
    }

    if (ctx === "content") {
      if (c === 0x5c /* \ */) {
        i++;
        continue;
      }
    } else if (c === 0x22 /* " */) {
      let j = i + 1;
      while (j < n) {
        const s = text.charCodeAt(j);
        if (s === 0x5c) j += 2;
        else if (s === 0x22) break;
        else j++;
      }
      i = Math.min(j, n);
      continue;
    }

    const ch = DELIM_CH[c];
    if (!ch) continue;
    const opener = c === 0x5b || c === 0x28 || c === 0x7b;
    delims.push({ pos: i, ch, opener });
    if (opener) {
      stack.push({ code: c, ctx });
      ctx = c === 0x5b ? "content" : "code";
    } else {
      // Unwind one level whatever the closer was. On a balanced document this
      // is exactly the lexer's own bookkeeping; on an unbalanced one it keeps
      // the rest of the text being read in a plausible context instead of in
      // the one an unclosed group left behind — which is the only honest thing
      // available, and it is what `brackets.ts` is about to report on.
      ctx = stack.pop()?.ctx ?? "content";
    }
  }
  return { delims, comments };
}

/** Every call containing `pos`, outermost first. */
export function stackAt(scan: Scan, pos: number): Node[] {
  return scan.nodes.filter((n) => pos >= n.from && pos <= n.to);
}

/** The innermost call containing `pos`. */
export function nodeAt(scan: Scan, pos: number): Node | null {
  let best: Node | null = null;
  for (const n of scan.nodes) {
    if (pos >= n.from && pos <= n.to && (!best || n.depth > best.depth)) best = n;
  }
  return best;
}

/** The innermost call with this role containing `pos`. */
export function roleAt(scan: Scan, pos: number, role: Role): Node | null {
  let best: Node | null = null;
  for (const n of scan.nodes) {
    if (n.role !== role) continue;
    if (pos >= n.from && pos <= n.to && (!best || n.depth > best.depth)) best = n;
  }
  return best;
}

/** Is `pos` inside a comment? */
export function inComment(scan: Scan, pos: number): boolean {
  return scan.comments.some((c) => pos >= c.from && pos < c.to);
}

/**
 * The calls of a role that belong *directly* to this one — its own items or
 * cells, not those of a list nested inside it.
 */
export function childrenOfRole(node: Node, role: Role): Node[] {
  return node.children.filter((c) => c.role === role);
}

/** The whole `[…]` body a position sits in, if any. */
export function bodyAt(scan: Scan, pos: number): Group | null {
  let best: Group | null = null;
  for (const n of scan.nodes) {
    for (const b of n.bodies) {
      if (pos >= b.from && pos <= b.to && (!best || b.from > best.from)) best = b;
    }
  }
  return best;
}

export { NAME_CH, NAME_START };

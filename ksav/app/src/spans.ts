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
// # The correction, and it is the same bug one level down
//
// The paragraph above was right about `"` and wrong about `(`. This file used to
// open code mode on **every** `(`, which meant the gershayim rule it was written
// to enforce switched itself back off the moment a writer put a parenthesis in
// front of one — and `(רש"י)`, `(שו"ע סי' ב')`, `(ע"ב)` are not an edge case in a
// sefer, they are the register. `#הדגשה[ראה (רש"י) כאן]` lost its body, ate the
// rest of the document as a string literal, reported two `unclosed` problems in a
// document the compiler accepts, and `analyze()` spliced `)]` into it — which
// `compile.ts` then compiled speculatively, so the preview showed a page built
// from text nobody typed.
//
// Typst's rule, checked against the compiler rather than reasoned about:
//
//   - `#הדגשה[ראה (רש"י) כאן]`  lays out `ראה (רש”י) כאן` — a bare `(` in markup
//     is a character, no more meaningful than `ג`;
//   - `#הדגשה[ראה(רש"י) כאן]`  lays out `ראה(רש”י) כאן` **too**, so not even a
//     name running up to a `(` makes a call in content mode. The `#` does;
//   - `#let זוג = ("אלף", "בית")` … `#זוג.at(0)` prints `אלף`, so a `#let`
//     statement really is code and its quotes really are string delimiters.
//
// Hence the two rules `lex()` now applies: `(` and `{` open code when the `#` is
// there or when we are already in code, and `#let`/`#set`/`#show`/… put the rest
// of their line in code mode. `mode.ts` had the first half right and this file
// did not, which is how the app ended up with two context walkers disagreeing
// about the commonest construction in the language. There is one now, here, and
// `mode.ts` reads its frame stack off this scan.
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
// It is also deliberately pure (text in, spans out), so it tests without a
// browser, a CodeMirror instance or a compiler. Its one import is
// `engine.gen.ts` — a generated table of literals with no imports of its own,
// carrying the Hebrew↔English pairing that the *engine's* prelude makes. That is
// a dependency on data rather than on machinery, and it is the difference
// between this file knowing what the engine defines and this file having a
// second opinion about it.

import { COMMAND_EN, bothSpellings, withAliases } from "./engine.gen";

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
   * micro-optimisation — `tableAt` is on the path of every caret move, and
   * splitting the argument list there cost 1.5 ms on a six-hundred-row table.
   * Splitting it here costs it once and the memo hands it back. (It used to be
   * eighteen times worse still: `structure.availableAt` decided which of the
   * eighteen table controls were enabled by *running* all eighteen. It asks
   * them now — see the note at the top of `structure.ts`.)
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

/**
 * A region with a mode of its own, and the command that opened it.
 *
 * The frame stack `mode.ts` used to walk the document character-by-character to
 * rebuild. Three of them are brackets — `[…]`, `(…)`, `{…}` — and the fourth is
 * a `#let`/`#set`/`#show` statement, which has no closing delimiter and ends at
 * the newline it started on.
 *
 * `close` is `text.length` for a group that never closes, which is not a
 * degenerate case to be tolerated: half of `#רשימה(` is the normal state of a
 * document being written, and the insertion path has to answer *while* it is.
 */
export interface Frame {
  /** The opening delimiter, or the `#` of a statement. */
  open: number;
  /** The closing delimiter, or `text.length` when nothing closes it. */
  close: number;
  /** The mode **inside** this frame. */
  ctx: Ctx;
  /** The command whose argument list or body this is; `""` for a bare group. */
  name: string;
}

export interface Scan {
  /** Every call, in document order — which is outermost-first. */
  nodes: Node[];
  /** The calls that sit inside no other call. */
  roots: Node[];
  comments: Comment[];
  /**
   * Raw regions — `` `…` `` and ```` ```…``` ```` — backticks included.
   *
   * Literal text to Typst, and now to this scanner: a command written inside a
   * code sample is not a call. Kept apart from `comments` because a code sample
   * **prints**, so `plainText` must keep it and colouring it as a comment would
   * grey out the one thing the writer put there to be read.
   */
  raws: Comment[];
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
  /**
   * Every mode-bearing region, in document order — which is outermost-first.
   *
   * This is what makes "one scanner" true of *context* and not only of
   * delimiters. `mode.ts` had its own walker for exactly this, the two
   * disagreed about `(`, and the disagreement was the worst bug in the app.
   */
  frames: Frame[];
  /** The text that was scanned, so a consumer can slice without carrying it. */
  text: string;
}

// ------------------------------------------------------------ the name table
//
// One table, read by every surface. The alternations it replaces disagreed six
// ways; the fence for it is `spans.test.mjs` §4, which checks it in **both**
// directions — every name here is a command the engine defines, and every
// `heading()`-producing command in the prelude is one this table classifies as a
// heading, which is the direction that actually rots.
//
// (This paragraph used to name a second fence, `test/names.test.mjs`, for the
// second direction. That file has never existed. The check it described is real
// and is the one above; the citation was a guarantee pointing at nothing, which
// is a worse failure than a missing test because it stops anybody looking.)

// Every table below is keyed by the **Hebrew** name and paired through
// `engine.gen.ts`, which reads the prelude's own `#let` lines. The English half
// used to be typed beside each entry, and it is the same duplication this file
// was written to end, one level up: §1 replaced fourteen scanners of the markup
// with one, and left the *names* the one scanner recognises stated twice.

/** `#כותרתN` / `#hN` — the level is in the name. */
const NAMED_HEADINGS: Record<string, number> = withAliases({
  "כותרת1": 1,
  "כותרת2": 2,
  "כותרת3": 3,
  "כותרת4": 4,
  "כותרת5": 5,
  "כותרת6": 6,
});

/** The generic form, which is the only way past level 6. */
const GENERIC_HEADINGS = new Set(bothSpellings("כותרת"));

/**
 * Headings whose level the prelude fixes.
 *
 * `#סימן(מספר, כותרת)` is `heading(level: 1, [סימן #מספר — #כותרת])`. It really
 * is a heading — it numbers, it folds, and it enters `#תוכן` — so leaving it out
 * of the outline would be wrong, and so would offering to demote it.
 */
const FIXED_HEADINGS: Record<string, number> = withAliases({ "סימן": 1 });

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
export const NOT_HEADINGS = new Set([...bothSpellings("שער"), ...bothSpellings("תת_שער")]);

/** Every command the scanner will call a heading — the fence reads this table
 * rather than re-deriving "produces a heading" from prelude text. */
export const HEADINGS: string[] = [
  ...Object.keys(NAMED_HEADINGS),
  ...GENERIC_HEADINGS,
  ...Object.keys(FIXED_HEADINGS),
];

/**
 * A `(a|b|…)` alternation over names, longest first.
 *
 * Longest first because `תא` is a prefix of nothing but `cell` is a suffix of
 * `headcell`: an alternation that offered `cell` before `headcell` would match
 * the tail of the wrong command. Building these from the tables rather than
 * writing them out is the whole point — the four regexes below used to spell
 * both languages by hand, which is the same list a fourth and fifth time.
 */
const alt = (names: Iterable<string>) =>
  [...names].sort((a, b) => b.length - a.length).join("|");

/** Parameter names, which the prelude translates through `_en` rather than `#let`. */
const PARAM = { level: "רמה|level", cols: "עמודות|columns" };

/** The argument that carries a generic heading's level. */
const LEVEL_ARG = new RegExp(`(?:^|,)\\s*(?:${PARAM.level})\\s*:\\s*(\\d+)`, "u");

const LIST_KINDS: Record<string, ListKind> = withAliases<ListKind>({
  "רשימה": "bullets",
  "ממוספרת": "numbered",
  "ממוספרת_עברית": "hebrew",
});

const ITEM_NAMES = new Set(bothSpellings("פריט"));
const TABLE_NAMES = new Set(bothSpellings("טבלה"));

/** Cell commands, and what each one means. */
const CELL_KINDS: Record<string, { header: boolean; merge: boolean }> = withAliases<{
  header: boolean;
  merge: boolean;
}>({
  "תא": { header: false, merge: false },
  "כותרת_תא": { header: true, merge: false },
  "מיזוג": { header: false, merge: true },
});

/** The declared column count or track list. */
const COLS_ARG = new RegExp(`(?:^|,)\\s*(?:${PARAM.cols})\\s*:\\s*`, "u");
/** An argument that is a cell rather than a setting. */
const CELL_ARG = new RegExp(`^(?:${alt(Object.keys(CELL_KINDS))})\\s*[([]`, "u");
const COLS_ARG_HEAD = new RegExp(`^(?:${PARAM.cols})\\s*:`, "u");

/**
 * The command each concept is written as, in each language.
 *
 * The write side of the same table: `lists.ts` and `headings.ts` rebuild calls
 * and must not turn an English document Hebrew on a ribbon click.
 */
const spelt = (he: string) => ({ he, en: COMMAND_EN[he] ?? he }) as const;

export const SPELLING = {
  list: {
    bullets: spelt("רשימה"),
    numbered: spelt("ממוספרת"),
    hebrew: spelt("ממוספרת_עברית"),
  },
  item: spelt("פריט"),
  table: spelt("טבלה"),
  cell: spelt("תא"),
  headcell: spelt("כותרת_תא"),
  merge: spelt("מיזוג"),
  headingGeneric: spelt("כותרת"),
  // The last three are not commands, so the prelude's `#let` table has nothing
  // to say about them and they stay written out. `עמודות`/`רמה` are *parameter*
  // names, translated by the prelude's `_en` wrapper rather than aliased; and
  // `כותרת`/`h` is a **prefix** — the command is `#כותרת3`, and there is no
  // `#h` to pair with anything.
  cols: { he: "עמודות", en: "columns" },
  headingLevel: { he: "רמה", en: "level" },
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

/** A structural bracket: one that Typst would read as a delimiter. */
export interface Delimiter {
  pos: number;
  ch: "[" | "(" | "{" | "]" | ")" | "}";
  opener: boolean;
  /**
   * The command this opener belongs to, `""` for a bare group and for closers.
   *
   * Carried out of the scan because `brackets.ts` wants it for a lint message —
   * *"#הערה נפתח כאן ואינו נסגר"* reads as an instruction and *"unclosed [ at
   * offset 8412"* does not — and answering it separately is what made
   * `callNameBefore` a fourth context walker that knew nothing about strings,
   * escapes or comments.
   */
  name: string;
  /**
   * Whether this delimiter is structure, or a character in somebody's prose.
   *
   * `[` and `]` are always structure. `(`, `)`, `{` and `}` are structure only
   * in code — after a `#name`, or inside an argument list, an array or a block.
   * **A bare `(` in markup is a parenthesis**, which the scan above has always
   * known (see the frame it opens: the context inside it is the context
   * outside) and reported anyway.
   *
   * The cost of not saying so was a real complaint about the Word import:
   * *"reports missing brackets and then renders correctly"*. It renders because
   * the document is fine. Hebrew typed in visual order — the way a good deal of
   * older Word material was — stores a parenthetical as `)טקסט(`, which reads
   * as a stray closer and an unclosed opener, twice per parenthetical, in a
   * document Typst has no complaint about. And the lint offered to repair it,
   * which would have inserted brackets into the writer's sentences.
   */
  structural: boolean;
}

const DELIM_CH: Record<number, Delimiter["ch"]> = {
  0x5b: "[", 0x28: "(", 0x7b: "{",
  0x5d: "]", 0x29: ")", 0x7d: "}",
};

/**
 * Keywords after which Typst is in code mode for the rest of the statement.
 *
 * `#let זוג = ("אלף", "בית")` is code, so its parentheses are an array and its
 * quotes are string delimiters — verified by compiling it and reading `אלף` off
 * the page. Without this the `(` rule below would read a writer's own command
 * definitions as prose, which is the one construct Ksav explicitly invites them
 * to write (Settings ▸ "Your commands").
 *
 * All lower-case ASCII and at most seven characters, which is what lets the hot
 * loop reject every Hebrew command on its first character without slicing.
 */
const CODE_KEYWORDS = new Set([
  "let", "set", "show", "import", "include", "context",
  "return", "if", "else", "for", "while",
]);

/** Nothing runs up to this bracket. */
const NO_HEAD = { name: "", hash: false } as const;

/**
 * The command whose argument list or body opens at `i`, and whether it was
 * written with the hash.
 *
 * Skips back over complete groups already written, so the second bracket of
 * `#כותרת(רמה: 2)[…]` and of `#גמרא[ברכות][ב.]` still knows whose it is.
 * `openerOf` makes that a map lookup rather than a backwards bracket walk, so
 * the whole routine stays bounded by identifier length on the hot path.
 *
 * The hash is the half `mode.ts` did not have and needs. In **content** mode a
 * name running up to a `(` is still prose — `#הדגשה[ראה(רש"י) כאן]` lays out as
 * the four words it looks like — so it is the `#`, not the name, that opens an
 * argument list. `#(1, 2)` and `#{ … }` have no name at all and are code.
 */
function headBefore(
  text: string,
  i: number,
  openerOf: Map<number, number>,
): { name: string; hash: boolean } {
  let j = i - 1;
  for (;;) {
    if (j < 0) return NO_HEAD;
    const c = text.charCodeAt(j);
    if (c !== 0x29 /* ) */ && c !== 0x5d /* ] */) break;
    const open = openerOf.get(j);
    if (open == null) return NO_HEAD;
    j = open - 1;
  }
  if (!isNameCh(text.charCodeAt(j))) {
    return text.charCodeAt(j) === 0x23 /* # */ ? { name: "", hash: true } : NO_HEAD;
  }
  const end = j + 1;
  while (j >= 0 && isNameCh(text.charCodeAt(j))) j--;
  const start = j + 1;
  // `רמה: 2(x)` is a number, not a call. A name has to start like one.
  if (!isNameStart(text.charCodeAt(start))) return NO_HEAD;
  return { name: text.slice(start, end), hash: j >= 0 && text.charCodeAt(j) === 0x23 };
}

interface LexOpts {
  /**
   * Pop on any closer, matching or not.
   *
   * The one place `lex()` and `delimiters()` genuinely differed, and they
   * differed silently: on `#f(] "רש"י ) עוד` the two produced different context
   * states over the same sixteen characters, breaking the invariant this file
   * quotes `brackets.ts` for — *"the two scanners must agree or the lint would
   * contradict the renderer"*. It is a parameter now, so the divergence has to
   * be asked for.
   *
   * `false` describes a document; `true` keeps the rest of an **unbalanced** one
   * being read in a plausible context instead of the one an unclosed group left
   * behind, which is the only honest thing available to a lint.
   */
  recover: boolean;
  /** Collect every structural bracket. Only `delimiters()` wants the array. */
  delims: boolean;
}

/**
 * One left-to-right pass: comments, strings, matched delimiters, the mode of
 * every region, and the positions where a call begins.
 *
 * Everything downstream is assembly over what this produces, so there is exactly
 * one place in the app that decides what a `"` means — and, since the correction
 * at the top of this file, exactly one that decides what a `(` means.
 */
function lexCore(
  text: string,
  opts: LexOpts,
): {
  comments: Comment[];
  raws: Comment[];
  strings: Group[];
  contentGroups: Group[];
  /** Opener index → closer index, for every delimiter that closes. */
  closes: Map<number, number>;
  heads: Head[];
  frames: Frame[];
  delims: Delimiter[];
} {
  const comments: Comment[] = [];
  /** Raw regions — literal text, and not commands. See the backtick branch. */
  const raws: Comment[] = [];
  const strings: Group[] = [];
  const contentGroups: Group[] = [];
  const closes = new Map<number, number>();
  const openerOf = new Map<number, number>();
  const heads: Head[] = [];
  const frames: Frame[] = [];
  const delims: Delimiter[] = [];
  const stack: { pos: number; code: number; ctx: Ctx; frame: Frame; structural: boolean }[] = [];
  let ctx: Ctx = "content";
  // An open `#let`/`#set`/`#show` statement: code mode until the first newline
  // at the bracket depth it started on, so a definition whose value spans a
  // `{…}` or a `(…)` still ends where the statement does.
  //
  // The frame is carried along so it can be *closed*. It used to be pushed with
  // `close: n` and left there, and the running `ctx` was restored at the newline
  // while the frame it belonged to still claimed the rest of the document. That
  // is not an internal detail: `frames` is what `ctxAt`, `framesAt`, `modeAt`,
  // `legalAt` and `insertionAt` read, so in any document with a `#set` or a
  // `#let` in it — which is any document that configures anything — every
  // surface downstream of the scan believed the prose after that line was code
  // mode. Found by `engine/tests/scan_oracle.rs` on its first sweep, in
  // `#let ר = [רבי]` followed by an ordinary Hebrew sentence.
  let codeLine: { depth: number; restore: Ctx; frame: Frame } | null = null;

  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);

    if (c === 0x0a /* \n */) {
      if (codeLine && stack.length === codeLine.depth) {
        ctx = codeLine.restore;
        codeLine.frame.close = i;
        codeLine = null;
      }
      continue;
    }

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
      // ---- raw, where nothing is a command ----
      //
      // A run of backticks opens a raw block and the next run of the same length
      // closes it, and everything between is *literal text* — that is Typst's
      // rule, and this scanner did not have it. So `` `#הדגשה[x]` `` was read as
      // a call: coloured as one, folded as one, offered completions as one,
      // counted by the notes pane when the sample happened to contain `#הערה`,
      // and converted by the Markdown and Org exporters into emphasis a reader
      // never asked for. Every one of those is a document that shows its own
      // documentation wrong.
      //
      // Skipped the way a comment is skipped — by moving `i` past it — so no
      // head, delimiter or group inside it exists to be filtered out later. The
      // region is recorded separately rather than added to `comments`, because a
      // code sample **prints**: `plainText` must keep it, and colouring it as a
      // comment would grey out the one thing the writer put there to be read.
      if (c === 0x60 /* ` */) {
        let run = 1;
        while (text.charCodeAt(i + run) === 0x60) run++;
        const fence = "`".repeat(run);
        // The closer is a run of *exactly* this length: in ```` ```…``` ```` a
        // stray double backtick inside is not the end.
        let end = -1;
        for (let at = text.indexOf(fence, i + run); at >= 0; at = text.indexOf(fence, at + 1)) {
          if (text.charCodeAt(at + run) === 0x60) continue;
          end = at + run;
          break;
        }
        if (end < 0) {
          // Unterminated, and it runs to the end of the document — which is what
          // Typst does with it too, so the editor and the compiler agree about
          // where the writer's mistake begins.
          raws.push({ from: i, to: n, unterminated: true });
          break;
        }
        raws.push({ from: i, to: end });
        i = end - 1;
        continue;
      }
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
      const head = headBefore(text, i, openerOf);
      // `[` is always content. `(` and `{` open code when the `#` is there, or
      // when we are already in code and they are an array, a block or a nested
      // argument list. **A bare `(` in markup is a character** — see the
      // correction at the top of this file, and the three compiled documents
      // that settle it.
      const inner: Ctx =
        c === 0x5b ? "content" : ctx === "code" || head.hash ? "code" : ctx;
      const frame: Frame = { open: i, close: n, ctx: inner, name: head.name };
      frames.push(frame);
      // `[` is structure wherever it appears; the other two only in code.
      const structural = c === 0x5b || inner === "code";
      stack.push({ pos: i, code: c, ctx, frame, structural });
      if (opts.delims) {
        delims.push({ pos: i, ch: DELIM_CH[c], opener: true, name: head.name, structural });
      }
      ctx = inner;
      continue;
    }
    if (c === 0x5d /* ] */ || c === 0x29 /* ) */ || c === 0x7d /* } */) {
      const want = c === 0x5d ? 0x5b : c === 0x29 ? 0x28 : 0x7b;
      const top = stack[stack.length - 1];
      if (opts.delims) {
        // A closer is structure if the opener it answers was. With nothing open
        // to answer, the context it stands in decides: a `)` in code is a
        // mistake, and a `)` in a sentence is punctuation.
        const structural =
          c === 0x5d || (top && top.code === want ? top.structural : ctx === "code");
        delims.push({ pos: i, ch: DELIM_CH[c], opener: false, name: "", structural });
      }
      if (top && top.code === want) {
        closes.set(top.pos, i);
        openerOf.set(i, top.pos);
        top.frame.close = i;
        if (want === 0x5b) contentGroups.push({ from: top.pos + 1, to: i });
        stack.pop();
        ctx = top.ctx;
      } else if (opts.recover) {
        // Whatever the closer was, unwind one level. On a balanced document this
        // is exactly the branch above; on an unbalanced one it is what keeps the
        // lint reading the rest of the text the way the renderer will.
        if (top) {
          top.frame.close = i;
          stack.pop();
          ctx = top.ctx;
        } else {
          ctx = "content";
        }
      }
      // Without `recover`, a closer with nothing open or of the wrong kind is
      // left alone: this scan describes a document, and `brackets.ts` is the one
      // that judges it.
      // `#הדגשה[#let x = 1]` — the group the statement was written inside
      // closed before its newline arrived, so the statement ends here, and its
      // frame has to end here too.
      if (codeLine && stack.length < codeLine.depth) {
        codeLine.frame.close = i;
        codeLine = null;
      }
      continue;
    }

    // ---- call heads ----
    if (c === 0x23 /* # */) {
      const s = i + 1;
      if (s < n && isNameStart(text.charCodeAt(s))) {
        let e = s + 1;
        while (e < n && isNameCh(text.charCodeAt(e))) e++;
        heads.push({ from: i, nameFrom: s, nameTo: e, hash: true, ctx });
        // A keyword puts the rest of the line in code mode. The two cheap tests
        // in front of the slice reject every Hebrew command — and every command
        // longer than `include` — without allocating.
        const k = text.charCodeAt(s);
        if (
          !codeLine &&
          ctx === "content" &&
          e - s <= 7 &&
          k >= 0x61 /* a */ &&
          k <= 0x7a /* z */ &&
          CODE_KEYWORDS.has(text.slice(s, e))
        ) {
          const frame: Frame = { open: i, close: n, ctx: "code", name: "" };
          codeLine = { depth: stack.length, restore: ctx, frame };
          ctx = "code";
          frames.push(frame);
        }
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

  // A statement that runs to the end of the text closes there; `close` is
  // already `n` for every frame that never closed, so nothing to do.

  // Pushed as each group closes, so the list arrives innermost-first; document
  // order is what every consumer wants, and it is what makes "blank the head,
  // then expose the content inside it" come out right by iteration alone.
  contentGroups.sort((a, b) => a.from - b.from);
  // `frames` is already in document order: a frame is pushed at its opener, and
  // openers arrive left to right. Nested frames therefore run outermost-first,
  // which is the order `framesAt` hands back.
  return { comments, raws, strings, contentGroups, closes, heads, frames, delims };
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
  // Local, because this walk starts mid-document: a `)` here may close a group
  // that opened before `from`, and then there is no opener to skip back over.
  // `headBefore` answers `NO_HEAD` for that, which in code mode changes nothing.
  const openerOf = new Map<number, number>();
  const opens: number[] = [];
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
      // The same `(` rule the lexer applies, for the same reason: an argument
      // list holding `פריט[דברי (רש"י) כאן]` used to put everything after the
      // parenthesis into code mode, where the gershayim opened a string and the
      // commas inside it stopped separating arguments — so `splitArgs` merged
      // two list items into one.
      ctx =
        c === "["
          ? "content"
          : ctx === "code" || headBefore(text, i, openerOf).hash
            ? "code"
            : ctx;
      opens.push(i);
      depth++;
    } else if (c === ")" || c === "]" || c === "}") {
      if (depth > 0) {
        depth--;
        ctx = stack.pop() ?? "code";
        const open = opens.pop();
        if (open != null) openerOf.set(i, open);
      }
    } else if (depth === 0) {
      if (visit(i, c)) return;
    }
  }
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
 * pane, the ribbon's eighteen table controls and the spell checker all answer
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

/**
 * The same answer, for a document identified by a stable object.
 *
 * **The memo above is O(document) to *look in*, and typing is its worst case.**
 * It linear-probes four slots with `CACHE[i].text === text`, and while somebody
 * is writing, every slot holds a document of the *same length* differing by one
 * character — the previous keystroke, the speculative healed copy, the current
 * text. V8's length and pointer fast paths both miss, so each probe is a full
 * comparison. Measured on a 420 KB document: **0.002 ms with one entry, 0.435 ms
 * with the editing set.** The comment above calls a handful of entries free, and
 * that handful is precisely the pathological one.
 *
 * There is no cheaper *string* test — a fingerprint that could miss a one-
 * character edit would return a stale scan, which is a far worse bug than a slow
 * one. So the hot callers stop asking by value. CodeMirror's `Text` is immutable
 * and shared between states that did not change it, which makes it a key: same
 * object, same content, always.
 *
 * `text` is a thunk because `doc.toString()` is itself an O(document) allocation
 * and a hit must not pay it. Two different `Text` objects holding identical
 * content are simply two misses — never a wrong answer.
 */
const KEYED = new WeakMap<object, Scan>();

export function scanOf(key: object, text: () => string): Scan {
  const hit = KEYED.get(key);
  if (hit) return hit;
  const fresh = scan(text());
  KEYED.set(key, fresh);
  return fresh;
}

/**
 * The document as a string — **once per version of it**.
 *
 * `doc.toString()` walks a rope and allocates. Thirty-five call sites in `src/`
 * each did their own, so one keystroke in a 200 KB sefer allocated and copied it
 * a dozen times over: the context bar, the three lints, the notes pane, the
 * outline, the review panel, the compile, the save. That is the obvious half of
 * the cost.
 *
 * The half that is not obvious is what it does to every *memo* downstream. Both
 * `scan`'s four-slot cache and `structure.contextAt`'s single slot decide a hit
 * with `===` on the text. Two strings with identical content and different
 * identities are `===` — after a full character-by-character comparison, because
 * a length check cannot separate them and there is no pointer to match. So a
 * dozen independent `toString()`s per keystroke turned every cache probe in the
 * application into a 200 KB `memcmp`. Hand every caller the *same* string and
 * each of those probes is a pointer compare that succeeds immediately.
 *
 * Keyed on the `Text` itself, which CodeMirror shares between states that did
 * not change it, so same object always means same content. Two `Text` objects
 * holding identical text are simply two entries — never a wrong answer.
 *
 * Duck-typed rather than importing `Text`, for the same reason `scanOf` takes a
 * bare `object`: this module is the one every other module depends on, and it
 * depends on nothing.
 */
const TEXTS = new WeakMap<object, string>();

export function docTextOf(doc: { toString(): string } | string): string {
  // A string is already the answer, and it is not a legal `WeakMap` key.
  //
  // Not defensiveness: the declared parameter is *anything with a `toString`*,
  // which a string satisfies, and `WeakMap.set` throws on one. So the signature
  // invited a call that the body could not survive — and `docTextOf(view?.state
  // .doc ?? "")`, which reads as the careful spelling, is exactly that call. It
  // took the whole application down at boot, with a blank page and an empty
  // console, because the throw landed in an unawaited `boot()`.
  //
  // A string caller gets no memo, which is the honest cost of not having a
  // `Text` to key on.
  if (typeof doc === "string") return doc;
  const hit = TEXTS.get(doc);
  if (hit !== undefined) return hit;
  const fresh = doc.toString();
  TEXTS.set(doc, fresh);
  return fresh;
}

/** The scan of a CodeMirror document, paying for its text at most once. */
export function scanDoc(doc: { toString(): string }): Scan {
  return scanOf(doc, () => docTextOf(doc));
}

/** Drop the memo. Only tests need this — a scan is a pure function of its text. */
export function clearScanCache(): void {
  CACHE.length = 0;
  DELIM_CACHE.length = 0;
}

function scanUncached(text: string): Scan {
  const { comments, raws, strings, contentGroups, closes, heads, frames } = lexCore(text, {
    recover: false,
    delims: false,
  });
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

  return { nodes, roots, comments, raws, strings, contentGroups, byStart, closes, frames, text };
}

// ------------------------------------------------------------------- context
//
// `mode.ts` used to answer these by walking the document from character zero on
// every call — its own scanner, its own `(` rule, and the two disagreed. They
// are lookups over the frame list now, so the answer costs O(frames before pos)
// on a memo hit rather than O(characters before pos) on a fresh walk, and there
// is no second opinion left to diverge.

/**
 * The frames containing `pos`, outermost first.
 *
 * Half-open the way an editor needs it: a caret *at* a closer is still inside
 * the group, and a caret one past it is not.
 */
export function framesAt(scan: Scan, pos: number): Frame[] {
  const out: Frame[] = [];
  for (const f of scan.frames) {
    if (f.open >= pos) break; // opens ascend, so nothing later can contain `pos`
    if (f.close >= pos) out.push(f);
  }
  return out;
}

/** Which of Typst's two worlds `pos` sits in. Top level is content. */
export function ctxAt(scan: Scan, pos: number): Ctx {
  let ctx: Ctx = "content";
  for (const f of scan.frames) {
    if (f.open >= pos) break;
    if (f.close >= pos) ctx = f.ctx; // the last one that contains `pos` is the innermost
  }
  return ctx;
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
 *
 * It is the same loop as the scan, with `recover` on — see `LexOpts`. It used to
 * be a second copy of it, and the copy had drifted: this one popped on any
 * closer and the scan ignored a mismatched one, so on `#f(] "רש"י ) עוד` the
 * lint and the renderer read the same sixteen characters in different modes.
 */
export type Delimiters = { delims: Delimiter[]; comments: Comment[] };

/**
 * The second full lex of the document, and — until this memo — the one with no
 * cache at all. `scan` sits a few hundred lines up with a four-slot value cache
 * and a `WeakMap` keyed on `Text`; `delimiters` is the *other* whole-document
 * lex (same loop, `recover`/`delims` on) and every caller re-ran it: a single
 * pause in typing lexed the document at least twice — compile's `analyze`, then
 * the bracket linter — plus once per fold or export. The same two layers apply
 * verbatim, and because every caller hands in the shared `docTextOf` string the
 * value probe below is a pointer compare that hits immediately.
 */
const DELIM_CACHE: { text: string; value: Delimiters }[] = [];

export function delimiters(text: string): Delimiters {
  for (let i = 0; i < DELIM_CACHE.length; i++) {
    if (DELIM_CACHE[i].text === text) {
      const hit = DELIM_CACHE.splice(i, 1)[0];
      DELIM_CACHE.push(hit);
      return hit.value;
    }
  }
  const { delims, comments } = lexCore(text, { recover: true, delims: true });
  const value: Delimiters = { delims, comments };
  DELIM_CACHE.push({ text, value });
  if (DELIM_CACHE.length > CACHE_SIZE) DELIM_CACHE.shift();
  return value;
}

/** The delimiters of a CodeMirror document, paying for its text at most once. */
const DELIM_KEYED = new WeakMap<object, Delimiters>();

export function delimitersOf(doc: { toString(): string }): Delimiters {
  const hit = DELIM_KEYED.get(doc);
  if (hit) return hit;
  const fresh = delimiters(docTextOf(doc));
  DELIM_KEYED.set(doc, fresh);
  return fresh;
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

// ------------------------------------------------------------------ prose
//
// "Strip the markup, leave the words" was asked in four places and answered
// four different ways: `countableText` (the word count), the notes pane's gist,
// the note-chooser's live preview, `review.ts`'s excerpt, and two more inside
// the highlighter's footnote widgets. Six regexes, one question — and each was
// wrong in its own direction. Two never removed comments, so `// עוד מעט` was
// counted as three words a writer had not written. Three used `\([^()]*\)` to
// eat an argument list, which stops at the first inner `)` — so
// `#צבע(rgb("#b91c1c"))[…]` left a stray `)` in the count and in the preview.
// One removed `|` from the document because a *snippet* format uses it. And
// none of them knew a string from a bracket, which is the whole finding of §1
// arriving one level up: the scanner was unified and the questions asked *of*
// the scanner were not.

/** Ranges of `text` that are markup rather than words, merged and sorted. */
function markupRanges(scan: Scan, from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  const add = (a: number, b: number) => {
    const lo = Math.max(a, from);
    const hi = Math.min(b, to);
    if (hi > lo) out.push([lo, hi]);
  };
  for (const c of scan.comments) add(c.from, c.to);
  for (const n of scan.nodes) {
    // The `#` and the name. A bare call inside an argument list has no `#`,
    // and `from` is already its first letter.
    add(n.from, n.nameTo);
    // The argument list, brackets and all: it carries settings, colours, stream
    // names and daf numbers, none of which are the document's prose. A `[…]`
    // *inside* it is content and is left alone — `#סימן("א", [דיני תפילה])`
    // prints those words — so the argument list is masked from its opening
    // paren up to the first content group inside it, and the rest is left to
    // the loop below.
    if (n.args) {
      const inner = scan.contentGroups
        .filter((g) => g.from > n.args!.from && g.to <= n.args!.to)
        .sort((a, b) => a.from - b.from);
      let at = n.args.from - 1;
      for (const g of inner) {
        add(at, g.from);
        at = g.to;
      }
      add(at, n.args.to + 1);
    }
  }
  // The brackets around every content group, but not what is inside them.
  for (const g of scan.contentGroups) {
    add(g.from - 1, g.from);
    add(g.to, g.to + 1);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/**
 * The words a range of the document would print, with the markup taken out.
 *
 * Everything that is not prose becomes a single space — never nothing — because
 * `#הדגשה[א]#הדגשה[ב]` is two words and deleting the markup outright would
 * make it one. Runs of whitespace then collapse, which is what Typst does to
 * them on the page anyway.
 *
 * `scan` is taken rather than made so a caller that already has one does not pay
 * for a second: the highlighter asks this of every visible footnote body on
 * every viewport change.
 */
export function plainTextIn(scan: Scan, from: number, to: number): string {
  let out = "";
  let at = from;
  for (const [a, b] of markupRanges(scan, from, to)) {
    out += scan.text.slice(at, a) + " ";
    at = Math.max(at, b);
  }
  out += scan.text.slice(at, to);
  return (
    out
      // Typst's own native heading markers, which are markup in every sense a
      // reader cares about even though they are not calls.
      .replace(/^\s*=+\s/gm, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** The words a document would print, with the markup taken out. */
export function plainText(text: string): string {
  return plainTextIn(scan(text), 0, text.length);
}

export { NAME_CH, NAME_START };

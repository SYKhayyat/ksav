// Code or content: the one thing every insertion has to know, and none of them did.
//
// Typst alternates between two modes, and Ksav inherits it whole:
//
//   content mode — inside `[…]`, and at the top level of a document. A command
//                  is written `#הדגשה[…]`, with the hash.
//   code mode    — inside `(…)`, the argument list of a command. A command is
//                  written `רשימה(…)`, and the hash is a syntax error.
//
// The UI ignored this. Every toolbar button, menu entry, palette command and
// snippet inserted the registry's `insert` string verbatim, and every one of
// those begins with `#`. So clicking "list" with the cursor between two items of
// a list — inside `#רשימה(…)`, therefore in code mode — wrote
//
//   #רשימה(
//     פריט[ראשון],
//     #רשימה(          ← illegal, and the document goes blank
//
// The writer did nothing wrong. They pressed the list button while inside a
// list. Nothing in the product could have told them that the same button means
// two different strings depending on where the caret is, because nothing in the
// product knew.
//
// This module is that knowledge, as a pure function over the text. Everything
// that inserts goes through `insertionAt`.
//
// ---------------------------------------------------------------------------
//
// The mode was only half of it, and the half that was easy to see. Sweeping
// every registry snippet (114) against every kind of caret position (9) — 1,026
// documents, generated through this module and compiled by the engine — 384 of
// them produced markup that will not compile, in **three positions where the
// editor was broken for every command without exception**. Four families:
//
//   A · 342 — no separator. `withMode` correctly wrote the bare `רשימה(` for
//       code mode and then left it welded to its neighbour:
//         #רשימה(פריט[ראשון],נטוי[] פריט[שני])
//                              ^ an argument list wants a comma
//   B ·  30 — a parameterless command fuses with the next word. Content mode
//       has no terminator, so `#קו_מפריד` written before `ראשון` becomes
//       `#קו_מפרידראשון` — and the error *names a command the writer never
//       typed*, which is worse than useless.
//   C ·   6 — genuinely illegal here, offered anyway. `#תוכן()` inside a
//       heading recurses until Typst's nesting guard fires and the page blanks;
//       `#מקטע_עמוד` sets up a page and cannot do that inside a container.
//   D ·   6 — `#תמונה("")`, an image command with no image.
//
// A and B are this module's job and are fixed here: **a snippet is responsible
// for arriving correctly delimited on both sides, in whichever mode it lands.**
// That responsibility sits next to the mode decision, once, rather than in each
// of the callers — which is how the same missing comma appeared three separate
// times in one day.
//
// C is `legalAt` below, which the chrome greys on rather than offering. D is the
// image picker's job (a command that needs a file asks for the file) plus an
// engine-side placeholder, so a path nobody supplied is a visible box and not a
// blanked document.

export type Mode = "code" | "content";

const NAME_CH = /[A-Za-z0-9֐-׿_]/;

/**
 * Which mode the position `pos` is in.
 *
 * Walks the document once, keeping the bracket stack. A `(` entered from a
 * command name opens code mode; a `[` always opens content mode. Strings,
 * comments and escapes are skipped, because a bracket inside them opens
 * nothing.
 *
 * Top level is content: a `.ksav` document is markup, the same as the body of
 * a `[…]`.
 */
export function modeAt(doc: string, pos: number): Mode {
  return mode(scan(doc, pos).map((f) => f.mode));
}

/**
 * The bracket the caret is inside, and the command that opened it.
 *
 * `modeAt` needed only the mode; a legality rule needs the *name*, because
 * "a table of contents inside a heading" is a fact about which commands are
 * open, not about which bracket. One walker answers both.
 */
interface Frame {
  mode: Mode;
  /** The command whose argument list or body this is, `""` for a bare group. */
  name: string;
}

function scan(doc: string, pos: number): Frame[] {
  const stack: Frame[] = [];
  let i = 0;
  const end = Math.min(pos, doc.length);
  while (i < end) {
    const c = doc[i];

    // `\x` escapes the next character, whatever it is.
    if (c === "\\") {
      i += 2;
      continue;
    }

    // A string literal, but only in code mode — in content, `"` is just a quote
    // mark, and treating it as a string swallows half the sentence.
    if (c === '"' && stack[stack.length - 1]?.mode === "code") {
      i++;
      while (i < end && doc[i] !== '"') i += doc[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }

    if (c === "/" && doc[i + 1] === "/") {
      while (i < end && doc[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && doc[i + 1] === "*") {
      const close = doc.indexOf("*/", i + 2);
      i = close < 0 ? end : close + 2;
      continue;
    }

    if (c === "[") {
      // The body of the command whose name (or whose argument list) ends here:
      // `#הערה[` and `#כותרת(רמה: 2)[` are both "inside הערה / כותרת".
      stack.push({ mode: "content", name: nameBefore(doc, i) });
      i++;
      continue;
    }
    if (c === "]") {
      if (stack[stack.length - 1]?.mode === "content") stack.pop();
      i++;
      continue;
    }
    if (c === "(") {
      // A `(` opens code mode when it is a call — that is, when a command name
      // runs up to it. A bare parenthesis in prose ("(ועיין שם)") is text, and
      // must not put the rest of the sentence into code mode.
      const name = nameBefore(doc, i);
      stack.push(
        name ? { mode: "code", name } : { mode: mode(stack.map((f) => f.mode)), name: "" },
      );
      i++;
      continue;
    }
    if (c === ")") {
      if (stack.length > 0) stack.pop();
      i++;
      continue;
    }
    i++;
  }
  return stack;
}

function mode(stack: Mode[]): Mode {
  return stack.length === 0 ? "content" : stack[stack.length - 1];
}

/**
 * The command name running up to the bracket at `i`, or `""`.
 *
 * A `(` with no name before it is a bare group — "(ועיין שם)" in prose — and a
 * `[` with no name before it is a plain content block. Either way there is no
 * command, so nothing is enclosing.
 *
 * A closing `)` counts as a name for a `[`: the body of `#כותרת(רמה: 2)[…]`
 * belongs to כותרת, and the argument list is only in the way.
 */
function nameBefore(doc: string, i: number): string {
  let j = i - 1;
  // Skip back over any balanced groups already written — an argument list, or
  // the earlier bodies of a two-bracket command like `#גמרא[ברכות][ב.]`, whose
  // second bracket still belongs to גמרא.
  while (doc[j] === ")" || doc[j] === "]") {
    const close = doc[j];
    const open = close === ")" ? "(" : "[";
    let depth = 0;
    while (j >= 0) {
      if (doc[j] === close) depth++;
      else if (doc[j] === open && --depth === 0) break;
      j--;
    }
    j--;
  }
  const to = j;
  while (j >= 0 && NAME_CH.test(doc[j])) j--;
  return j === to ? "" : doc.slice(j + 1, to + 1);
}

/**
 * The commands enclosing `pos`, outermost first.
 *
 * What `legalAt` asks: not "which bracket am I in" but "am I anywhere inside a
 * heading", which is the question `#תוכן` has to answer before it recurses the
 * document into a blank page.
 */
export function enclosing(doc: string, pos: number): string[] {
  return scan(doc, pos)
    .map((f) => f.name)
    .filter(Boolean);
}

/**
 * Rewrite a snippet for the mode it is being inserted into.
 *
 * Content mode wants the hash, code mode refuses it. This is the whole of the
 * fix: one place that knows, and every insertion path routed through it.
 *
 * A snippet that is already bare (`תא[|]`, `פריט[|]` — the ones only ever used
 * inside an argument list) gains a hash in content mode, so that inserting a
 * cell outside a table is legal markup instead of stray text.
 */
export function withMode(snippet: string, m: Mode): string {
  const bare = snippet.startsWith("#") ? snippet.slice(1) : snippet;
  // Only commands take a hash. A snippet that does not start with a name — a
  // comment region, a bare `[`, plain text — is passed through untouched.
  if (!NAME_CH.test(bare[0] ?? "")) return snippet;
  return m === "content" ? "#" + bare : bare;
}

/** Convenience: the snippet as it should be written at `pos` in `doc`. */
export function snippetAt(doc: string, pos: number, snippet: string): string {
  return withMode(snippet, modeAt(doc, pos));
}

// ---------------------------------------------------------------- delimiters

/** Everything that may sit between two arguments without separating them. */
const WS = /\s/;

/** The last non-space character before `pos`, or `""`. */
function prevCh(doc: string, pos: number): string {
  let i = pos - 1;
  while (i >= 0 && WS.test(doc[i])) i--;
  return i >= 0 ? doc[i] : "";
}

/** The first non-space character at or after `pos`, or `""`. */
function nextCh(doc: string, pos: number): string {
  let i = pos;
  while (i < doc.length && WS.test(doc[i])) i++;
  return i < doc.length ? doc[i] : "";
}

/**
 * The snippet as it should be written at `pos` — mode **and** separators.
 *
 * This is the one every insertion path calls. `snippetAt` remains for the code
 * that only wants the hash rule, but a snippet spliced into a document without
 * going through here is a snippet that will eventually weld itself to its
 * neighbour: that was 372 of the 384 failures in the sweep.
 *
 * The caret marker `|` survives untouched, so the caller's own splice still
 * works; any separator added after the end of the snippet lands after it, which
 * is what leaves the caret in front of the comma rather than behind it.
 */
export function insertionAt(doc: string, pos: number, snippet: string, to = pos): string {
  const m = modeAt(doc, pos);
  let s = withMode(snippet, m);
  // The mode rule passes non-commands (a comment region, plain text) through
  // untouched, and so does this: a separator around them would be markup the
  // writer did not ask for.
  const bare = s.startsWith("#") ? s.slice(1) : s;
  if (!NAME_CH.test(bare[0] ?? "")) return s;

  // `to` differs from `pos` only when the snippet replaces something — the `#`
  // and the half-typed name an autocompletion is finishing. The neighbour on the
  // right is then the one past *that*, not the text about to be overwritten.
  const before = prevCh(doc, pos);
  const after = nextCh(doc, Math.max(pos, to));

  if (m === "code") {
    // An argument list. Every element is comma-delimited, and the writer is
    // splicing an element into the middle of one.
    //
    // Nothing is needed after an opener, after an existing comma, or after the
    // colon of a named argument — those already separate. Anything else (`]`
    // closing the previous argument, most of all) does not.
    if (before && !"(,:".includes(before)) s = ", " + s;
    if (after && !"),".includes(after)) s = s + ",";
    return s;
  }

  // Markup. A command written with brackets terminates itself; one written bare
  // — `#קו_מפריד`, `#מעבר_עמוד`, `#חסר` — ends at the first character that
  // cannot continue an identifier, so the word the writer was standing in front
  // of gets swallowed into a command name that does not exist. A space is the
  // terminator, and Typst collapses runs of spaces, so it costs nothing on the
  // page.
  const last = s.replace("|", "").slice(-1);
  if (NAME_CH.test(last) && (NAME_CH.test(after) || after === "[" || after === "(")) s += " ";
  return s;
}

// ---------------------------------------------------------------- legality
//
// Some commands are illegal in some places, and the editor offered them anyway.
// The two that a sweep of every command against every caret position actually
// found are below; both blank the document rather than reporting anything a
// writer could act on, which is why they are worth greying rather than
// explaining after the fact.

/** Commands whose body Typst re-renders when building a table of contents. */
const HEADINGS = ["כותרת", "כותרת1", "כותרת2", "כותרת3", "שער", "תת_שער", "כותרת_בהערה"];

/**
 * Commands that print the headings of the document, so cannot sit inside one.
 *
 * Only the outline. The two indexes print what `#ציון_מקור` and `#ערך` marked,
 * never a heading, so they do not recurse and greying them would be a refusal
 * of something that works — which `every_refused_insertion_would_really_have_failed`
 * catches, and did.
 */
const COLLECTORS = ["תוכן", "toc"];

/** Commands that set up or end a page, which Typst allows only in the flow. */
const PAGE_LEVEL = ["מקטע_עמוד", "page_section", "מעבר_עמוד", "pbreak"];

/** The table command, in both languages — a merge has to be inside one. */
const TABLES = ["טבלה", "mktable"];

export interface Legality {
  ok: boolean;
  /** An i18n key naming what is wrong, for the tooltip on the greyed control. */
  reason?: string;
}

const LEGAL = { ok: true } as const;

/**
 * May this command be written at `pos`?
 *
 * Named by its command (`c.he`), not by its snippet, because the rule is about
 * the command and the same command reaches the document through five surfaces.
 */
export function legalAt(doc: string, pos: number, command: string): Legality {
  const frames = scan(doc, pos);
  const enc = frames.map((f) => f.name).filter(Boolean);
  if (PAGE_LEVEL.includes(command)) {
    // `#מקטע_עמוד` sets up a page — margins, columns, its own header — and
    // `#מעבר_עמוד` ends one. Typst refuses both inside any container, and says
    // so in English from the middle of a blanked preview.
    return frames.length === 0 ? LEGAL : { ok: false, reason: "illegalPageLevel" };
  }
  if (COLLECTORS.includes(command)) {
    // A table of contents inside a heading renders the heading, which renders
    // the contents, until Typst's nesting guard fires and the page goes blank.
    return enc.some((n) => HEADINGS.includes(n))
      ? { ok: false, reason: "illegalInHeading" }
      : LEGAL;
  }
  if (command === "מיזוג" || command === "colspan_") {
    // A merged cell spliced between two existing cells overflows the row — the
    // table has as many columns as it has, and a cell claiming two of them is
    // one cell too wide. The span-aware operation on the table ribbon does this
    // properly (it consumes the neighbour it merges with); the raw command is
    // for writing a merge into a cell you are composing, so that is where it
    // stays offered.
    const inner = frames[frames.length - 1];
    return inner && inner.mode === "code" && TABLES.includes(inner.name)
      ? { ok: false, reason: "illegalMergeBetweenCells" }
      : LEGAL;
  }
  return LEGAL;
}

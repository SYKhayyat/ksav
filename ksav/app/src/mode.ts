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

// ---------------------------------------------------------------------------
//
// **This module used to contain the second half of the answer, and the two
// halves disagreed.** It had its own document walker with its own bracket stack,
// and it was the one that got `(` right: *"a bare parenthesis in prose
// (`"(ועיין שם)"`) is text, and must not put the rest of the sentence into code
// mode."* `spans.ts` — the file named for the job, the one every other surface
// reads — opened code mode on every `(`, so `(רש"י)` inside a body made the
// source model eat the rest of the document while this file, twelve hundred
// lines away, quietly knew better.
//
// Two walkers cannot disagree if there is one walker. The rule moved into
// `spans.ts`'s lexer, which is where the string, comment and escape handling
// already lived, and this module reads the frame stack off the same memoised
// scan every other surface reads. It also got faster in passing: the walk here
// was O(characters before the caret) and ran again for each of `modeAt`,
// `enclosing` and `legalAt`.

// ---------------------------------------------------------------------------
//
// **The third thing every insertion has to know, and the one that was missing.**
//
// A registry snippet is a Hebrew string — `#הדגשה[|]`, `#טבלה(עמודות: …)` — and
// every surface wrote it verbatim. So an English writer who pressed Bold got
// `#הדגשה[|]` in the middle of an English document, and `#mktable` was a name the
// product advertised and never once produced.
//
// `insertion.rs` argued this out and got the diagnosis exactly right while
// declining the wrong cure: widening the *grid* to English by swapping names in
// the fixture would assert a path no writer can reach, so its failures would be
// artefacts of the swap. The cure it named instead is the one below —
// *"translate the insertion by the document's language, the way `lists.ts`,
// `headings.ts`, `table.ts` and `note-commands.ts` already do"* — and with it in
// place the English half of the grid asserts a path a writer really is on.
//
// The pairing is not retyped here. `COMMAND_EN` and `PARAM_EN` are generated
// from the prelude's own `#let` lines and `_en_params`, which are what *make*
// both halves of the translation: an English alias is a wrapper that renames its
// named arguments, so a command whose name is English and whose parameters are
// Hebrew is not English and is not what anybody would type.

import { COMMAND_EN, CONTAINERS, bothSpellings, paramsOf, withAliases } from "./engine.gen";
import { ctxAt, framesAt, langOf, scan, splitArgs, topLevelColon } from "./spans";

export type Mode = "code" | "content";

/** Which language a command name is written in, per `spans.langOf`. */
export type Lang = "he" | "en";

const NAME_CH = /[A-Za-z0-9֐-׿_]/;

/**
 * Which mode the position `pos` is in.
 *
 * Top level is content: a `.ksav` document is markup, the same as the body of
 * a `[…]`.
 */
export function modeAt(doc: string, pos: number): Mode {
  return ctxAt(scan(doc), pos);
}

/**
 * The commands enclosing `pos`, outermost first.
 *
 * What `legalAt` asks: not "which bracket am I in" but "am I anywhere inside a
 * heading", which is the question `#תוכן` has to answer before it recurses the
 * document into a blank page.
 */
export function enclosing(doc: string, pos: number): string[] {
  return framesAt(scan(doc), pos)
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

// ---------------------------------------------------------------- language

/** The English→Hebrew direction, derived rather than written a second time. */
const COMMAND_HE: Record<string, string> = Object.fromEntries(
  Object.entries(COMMAND_EN).map(([he, en]) => [en, he]),
);

/** The English→Hebrew parameter direction, per command, built the same way. */
function paramsInto(heCommand: string, lang: Lang): Record<string, string> {
  const pairs = Object.entries(paramsOf(heCommand));
  return Object.fromEntries(
    lang === "en" ? pairs : pairs.map(([he, en]) => [en, he]),
  );
}

/**
 * The same command, spelt in `lang`.
 *
 * A name with no pair keeps its own spelling. That is not a gap being tolerated:
 * the prelude binds names the registry never advertises, and the honest answer
 * for one of those is the name the writer would have to type anyway.
 */
function nameIn(name: string, lang: Lang): string {
  if (langOf(name) === lang) return name;
  return (lang === "en" ? COMMAND_EN[name] : COMMAND_HE[name]) ?? name;
}

/**
 * Words a template ships **as content**, in both languages.
 *
 * Command names and parameter names are the prelude's, and `translated` gets
 * them from the registry. These are not that. They are the words the templates
 * put inside `[…]` and `"…"` — an apparatus title, a stream's name, a sample
 * tractate, the word standing in for what the writer is about to type — and
 * they have no registry to come from, because they are ordinary words rather
 * than vocabulary the engine defines.
 *
 * Every entry here is a **default** — a title a block needs, a stream's name.
 * There are no placeholders in it, because there are no placeholders left in
 * the templates: a slot the writer has to fill arrives empty. See
 * `Command::insert` in the engine for why.
 *
 * Left untranslated they were the visible half of *"everything is coming in in
 * Hebrew"*: an English document that pressed "endnotes" got
 * `#endnotes(title: [הערות])`, which is an English command titling its block in
 * Hebrew. `translated` renamed everything the writer could not see and nothing
 * they could.
 *
 * Applied only to whole values — a complete string literal or a complete
 * bracketed run — so this can never chew a word out of the middle of prose. It
 * is safe to run over a snippet because a snippet is *ours*; the writer's own
 * text is spliced in afterwards by `plan`, never passed through here.
 *
 * What is deliberately absent:
 *
 *   - **Numbering schemes.** `מספור: "א"` says *number these with Hebrew
 *     letters*, and an English work on Hebrew sources does that as often as
 *     not. It is a typographic choice, not a language.
 *   - **`#siman[א׳]`, `#seif[א]`.** The same: a sample ordinal in the alphabet
 *     the construct is usually numbered in.
 * The enum values **are** here — `פריסה: "צד"`, `תצוגה: "סופי"` — and they were
 * the one thing this table could not fix on its own, because the prelude
 * compared them against Hebrew literals and nothing else, so an English
 * spelling would have been a document that does not compile. `_en_values` in
 * `ksav.typ` now understands both, so writing them in English is a real answer
 * rather than a plausible one. `english_commands.rs` holds it.
 */
const CONTENT: readonly (readonly [string, string])[] = [
  ["הערות", "Notes"],
  ["הערות על הפירוש", "Notes on the commentary"],
  ["הפירוש", "The commentary"],
  ["ביאורים", "Explanations"],
  ["ביאור", "Explanation"],
  ["מקורות", "Sources"],
  ["מראי מקומות", "References"],
  ["נוסחאות", "Variants"],
  ["שינויי נוסחאות", "Textual variants"],
  ["תוכן", "Text"],
  // The enum values. `_en_values` in the prelude accepts either spelling, so
  // these translate the same way a command name does.
  ["מוערם", "stacked"],
  ["צד", "side"],
  // A channel's placement — the one axis of the note model that is compared
  // against a fixed set of names rather than used as data.
  ["רגל", "foot"],
  ["סוף_מדור", "section"],
  ["סוף", "document"],
  ["סימון", "marks"],
  ["סופי", "final"],
  ["מקורי", "original"],
];

const CONTENT_EN: Record<string, string> = Object.fromEntries(CONTENT);
const CONTENT_HE: Record<string, string> = Object.fromEntries(
  CONTENT.map(([he, en]) => [en, he]),
);

/** Every whole `"…"` and `[…]` value in a snippet, said in `lang`. */
function localised(snippet: string, lang: Lang): string {
  const table = lang === "en" ? CONTENT_EN : CONTENT_HE;
  return snippet.replace(/"([^"\n]*)"|\[([^[\]\n]*)\]/gu, (whole, str, content) => {
    const value = str ?? content;
    const into = table[value];
    if (into === undefined) return whole;
    return str === undefined ? `[${into}]` : `"${into}"`;
  });
}

/**
 * A snippet rewritten into `lang` — command names, parameter names **and** the
 * words the template ships as content.
 *
 * The first two are needed and the second is the one that gets forgotten:
 * `#mktable(עמודות: (1fr, 1fr), cell[])` compiles, because `_en` passes an
 * unrecognised name through to the Hebrew function underneath, and it is not
 * English. The grid compiles every one of these in both languages, so a pairing
 * that goes missing is a red test rather than a document that reads as half a
 * translation.
 *
 * Rewritten through `scan` rather than by regex, for the reason `spans.ts`
 * exists: a name inside a string literal (`#תמונה("|", …)`) and a name that is
 * really prose are both things a regex over `#\w+` gets wrong, and the caret
 * marker `|` is untouched because it is neither.
 *
 * A snippet with **no `#`** is translated too, and that is not a detail:
 * `פריט[|]`, `תא[|]` and `כותרת_תא[|]` are the list item, the table cell and
 * the header cell — three of the most-pressed buttons in the application — and
 * they are bare names because they are written inside an argument list. `scan`
 * reads a bare name in a bare snippet as prose, quite correctly, so all three
 * went in in Hebrew no matter what language the document was. Asking the same
 * question with a `#` in front of it is the whole fix.
 */
export function translated(snippet: string, lang: Lang): string {
  // The bare nested helpers. `#` is what tells `scan` this is a command rather
  // than a word, and `withMode` puts the right one back afterwards.
  if (snippet && !snippet.startsWith("#") && NAME_CH.test(snippet[0])) {
    const asCall = translated("#" + snippet, lang);
    return asCall.startsWith("#") ? asCall.slice(1) : asCall;
  }
  snippet = localised(snippet, lang);
  const sc = scan(snippet);
  if (!sc.nodes.length) return snippet;
  // Right to left, so an earlier edit cannot move a later one's offsets.
  const edits: { from: number; to: number; text: string }[] = [];
  for (const n of sc.nodes) {
    const he = langOf(n.name) === "he" ? n.name : (COMMAND_HE[n.name] ?? n.name);
    const spelt = nameIn(n.name, lang);
    if (spelt !== n.name) edits.push({ from: n.nameFrom, to: n.nameTo, text: spelt });
    if (!n.args) continue;
    const names = paramsInto(he, lang);
    for (const g of splitArgs(snippet, n.args.from, n.args.to)) {
      const colon = topLevelColon(snippet, g.from, g.to);
      if (colon < 0) continue;
      const raw = snippet.slice(g.from, colon);
      const key = raw.trim();
      const into = names[key];
      if (!into || into === key) continue;
      const at = g.from + raw.indexOf(key);
      edits.push({ from: at, to: at + key.length, text: into });
    }
  }
  edits.sort((a, b) => b.from - a.from);
  let out = snippet;
  for (const e of edits) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}

/**
 * The language a command written at `pos` should be spelt in.
 *
 * Three questions, narrowest first, and each one is a thing the writer has
 * actually done rather than a setting they might not know about:
 *
 *   1. **The call it lands inside.** Splicing a cell into `#mktable(…)` in
 *      Hebrew would be a document that reads as neither language, and it is the
 *      same answer `lists.ts` and `headings.ts` already give from the node they
 *      are rewriting.
 *   2. **What the rest of the document is written in**, by majority of its
 *      commands — because the second command in a document should match the
 *      first without the writer being asked.
 *   3. **The prose**, when there are no commands yet — by which script most of
 *      the letters are in.
 *
 * A document with no letters in it has said nothing, so `whenSilent` answers —
 * the page direction, which the writer or the template *did* set. It defaults
 * to Hebrew, which is this product's default, and the shell passes the real
 * one. Without it a blank left-to-right document got a Hebrew first command,
 * and that one command was then the majority in (2) — the ratchet below,
 * re-armed on a document the writer had explicitly set to English.
 *
 * # Why (3) counts rather than tests
 *
 * It used to read `/\p{Script=Hebrew}/.test(doc) ? "he" : "en"` — *any* Hebrew
 * letter anywhere made the whole document Hebrew. The writer's own words, on an
 * English document: *"Wait! now, everything is coming in in Hebrew. I don't know
 * why. this is puzzling."*
 *
 * Nothing was intermittent. An English sefer quotes Hebrew — a posuk, a tractate
 * name, a word in a translation — and one such word flipped every subsequent
 * insertion to Hebrew, which put more Hebrew in the document, which made the
 * next test even less likely to come out the other way. A one-way test on a
 * bilingual document is a ratchet, and the writer feels it as the application
 * changing its mind for no reason.
 *
 * A majority is not a ratchet: a page of English with a posuk in it is English,
 * and it stays English as it grows. Hebrew wins a tie, which is this product's
 * default and matters only for the handful of documents that are exactly half.
 */
export function docLang(doc: string, pos: number, whenSilent: Lang = "he"): Lang {
  const sc = scan(doc);
  let inner: { lang: Lang; depth: number } | null = null;
  let he = 0;
  let en = 0;
  for (const n of sc.nodes) {
    if (n.lang === "en") en++;
    else he++;
    if (pos > n.from && pos < n.to && (!inner || n.depth > inner.depth)) {
      inner = { lang: n.lang, depth: n.depth };
    }
  }
  if (inner) return inner.lang;
  if (en || he) return en > he ? "en" : "he";
  return prosePart(doc) ?? whenSilent;
}

/**
 * Which script most of a document's letters are in, or null if it has none.
 *
 * Latin rather than "not Hebrew": a Greek word or a Cyrillic name is neither
 * language's evidence, and counting it as English would put the same ratchet
 * back in facing the other way.
 */
function prosePart(doc: string): Lang | null {
  const hebrew = doc.match(/\p{Script=Hebrew}/gu)?.length ?? 0;
  const latin = doc.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (!hebrew && !latin) return null;
  return latin > hebrew ? "en" : "he";
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
export function insertionAt(
  doc: string,
  pos: number,
  snippet: string,
  to = pos,
  /** What the page direction says, for a document that has said nothing. */
  whenSilent: Lang = "he",
): string {
  const m = modeAt(doc, pos);
  // The language decision lives here rather than in the two callers, for the
  // same reason the mode decision does: the callers forgot the mode three
  // separate times in one day, and there is no version of "each surface
  // remembers" that survives a fourth surface.
  let s = withMode(translated(snippet, docLang(doc, pos, whenSilent)), m);
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

// Which commands are headings is **not** a list here. It was, and the list was
// a fifth copy of a table `spans.ts` owns and fences against the prelude in both
// directions — with the failures a copy always has, in both directions at once:
// it had no `#h1`, no `#hlevel` and no `#כותרת4`, so `#תוכן` was offered inside
// the entire English half of the heading commands and inside levels four to six,
// where it recurses until Typst's nesting guard fires and the page blanks; and
// it *did* have `#שער`, which `spans.ts:333-345` establishes — against the
// compiler — is not a heading at all, so a legal `#תוכן` was refused there.
//
// The scan already answers the question. `role === "heading"` is derived from
// the one table, in both languages, at every level, and `#שער` is excluded by
// name with the reason written beside it.

/**
 * Commands that print the headings of the document, so cannot sit inside one.
 *
 * Only the outline. The two indexes print what `#ציון_מקור` and `#ערך` marked,
 * never a heading, so they do not recurse and greying them would be a refusal
 * of something that works — which `every_refused_insertion_would_really_have_failed`
 * catches, and did.
 */
const COLLECTORS = [...bothSpellings("תוכן")];

/** Commands that set up or end a page, which Typst allows only in the flow. */
const PAGE_LEVEL = [...bothSpellings("מקטע_עמוד"), ...bothSpellings("מעבר_עמוד")];

/**
 * The commands a page break may not sit inside, in both languages.
 *
 * Typst's own words are *"pagebreaks are not allowed inside of **containers**"*,
 * and a container is a property of what a command expands to rather than of what
 * it looks like: `#כותרת1` is a `heading()` and `#הערה` a `footnote()`, both
 * containers; `#שער` is `align(center, text(…))` and `#הדגשה` a `strong()`, both
 * transparent. Fifty-three of the prelude's bindings are containers, and no rule
 * over their names would separate the two lists.
 *
 * So the list is not here. `CONTAINERS` is measured by the engine against the
 * real compiler (`engine/examples/emit-containers.rs`, re-measured by
 * `cargo test --test containers`) and this is that measurement with the English
 * aliases folded in.
 */
const IN_CONTAINER = withAliases(Object.fromEntries(CONTAINERS.map((n) => [n, true])));

/** The table command, in both languages — a merge has to be inside one. */
const TABLES = [...bothSpellings("טבלה")];

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
  const sc = scan(doc);
  const frames = framesAt(sc, pos);
  if (PAGE_LEVEL.includes(command)) {
    // `#מקטע_עמוד` sets up a page — margins, columns, its own header — and
    // `#מעבר_עמוד` ends one. Typst refuses both inside a *container*, and says
    // so in English from the middle of a blanked preview.
    //
    // This used to be `frames.length === 0`: legal at the top level and nowhere
    // else. That is right for a heading, a note and a list and wrong for every
    // inline command in the language — a page break was greyed inside bold text,
    // inside `#שער`, and inside `#כותרת_בהערה`, none of which is a container.
    // The grid found it on the day it learned to ask in two languages, because
    // asking in two languages is what put a `#שער` position in it.
    const inside = sc.nodes.some(
      (n) => IN_CONTAINER[n.name] && pos > n.from && pos < n.to,
    );
    return inside ? { ok: false, reason: "illegalPageLevel" } : LEGAL;
  }
  if (COLLECTORS.includes(command)) {
    // A table of contents inside a heading renders the heading, which renders
    // the contents, until Typst's nesting guard fires and the page goes blank.
    //
    // Strictly inside: a caret one past the closing bracket of a heading is
    // after it, and `#תוכן` there is the ordinary thing a writer does.
    const inHeading = sc.nodes.some((n) => n.role === "heading" && pos > n.from && pos < n.to);
    return inHeading ? { ok: false, reason: "illegalInHeading" } : LEGAL;
  }
  if (command === "מיזוג" || command === "colspan_") {
    // A merged cell spliced between two existing cells overflows the row — the
    // table has as many columns as it has, and a cell claiming two of them is
    // one cell too wide. The span-aware operation on the table ribbon does this
    // properly (it consumes the neighbour it merges with); the raw command is
    // for writing a merge into a cell you are composing, so that is where it
    // stays offered.
    const inner = frames[frames.length - 1];
    return inner && inner.ctx === "code" && TABLES.includes(inner.name)
      ? { ok: false, reason: "illegalMergeBetweenCells" }
      : LEGAL;
  }
  return LEGAL;
}

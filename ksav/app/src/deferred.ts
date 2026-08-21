// Deferred note bodies: the marker inline, the prose gathered at the end.
//
// The engine half is thirty lines (#הערה_בשם / #גוף_הערה in ksav.typ). This is
// the half that makes it worth having. org-mode's footnotes are pleasant not
// because `[fn:1]` is a nice syntax — it isn't — but because Emacs will jump
// between the marker and the prose, create the one from the other, and never
// make you name anything. Without that, deferring a body just means scrolling.
//
// So this module is the editing model:
//
//   - **jump**, bidirectional. On a marker, go to its prose. On the prose, go
//     back to the marker. One key, and it knows which way it is going.
//   - **create**, from either end. A marker with no body, or a body with no
//     marker, becomes the pair — with a name generated for you.
//   - **exile and recall**. Take an inline `#הערה[…]` you already wrote and
//     send its prose to the end, leaving a marker; or pull it back. This is the
//     migration path for every document that already exists, and probably the
//     thing anyone reaches for daily.
//   - **lint**. Deferring introduces exactly two new ways to be wrong — a
//     marker with no body, a body no marker points at — and both are silent on
//     the page. They are not silent here.
//
// Pure and dependency-free (text in, findings and edits out), like `brackets.ts`
// and for the same reason: it can be tested without a browser. The CodeMirror
// wiring is in `deferred-lint.ts`.

import { langOf, matchGroup, scan as scanSpans, splitArgsRaw } from "./spans";
import {
  DEFAULT_NOTE_KIND,
  DEFER_BODY_COMMANDS,
  DEFER_REF_COMMANDS,
  DEFER_REGION_COMMANDS,
  NOTE_BODY_COMMANDS,
} from "./note-commands";

// ---------------------------------------------------------------- the commands
//
// The three name lists live in `note-commands.ts` with every other answer to
// "which commands are what", because prose mode kept a second copy of these
// two and the notes pane kept none at all.

/** `#הערה_בשם(…)` — a marker whose body is defined elsewhere. */
const REF_NAMES = DEFER_REF_COMMANDS;
/** `#גוף_הערה(שם)[…]` — the body of a deferred note. */
const DEF_NAMES = DEFER_BODY_COMMANDS;
/** `#גופי_הערות[…]` — the optional region the bodies are filed in. */
const REGION_NAMES = DEFER_REGION_COMMANDS;

/**
 * The note commands an inline body can be exiled *from*.
 *
 * Every one of these takes its body as the last positional argument, which is
 * what lets `#הערה_בשם` stand in for any of them. A command not on this list is
 * not one this module will rewrite — it would be guessing about the shape of
 * something it does not understand.
 *
 * That shape claim *is* the membership rule of `NOTE_BODY_COMMANDS`, so this is
 * an alias rather than a second list. It was the second list until the copy in
 * `notes.ts` drifted out of the English wave and took the notes pane with it;
 * see the head of `note-commands.ts`.
 */
export const NOTE_COMMANDS: readonly string[] = NOTE_BODY_COMMANDS;

/** The command a bare `#הערה_בשם("א")` stands for — its `סוג` default. */
const DEFAULT_KIND = DEFAULT_NOTE_KIND;

/**
 * A deferred pair is written in the language of the note it stands for.
 *
 * Every rewrite here used to emit `#הערה_בשם` and `#גוף_הערה` whatever it was
 * handed, so exiling a `#fnote` out of an English document wrote two Hebrew
 * commands into it and recalling it brought back `#הערה`. The page is
 * identical — the prelude aliases both — and that is exactly what makes it the
 * quiet kind of wrong: the document the writer reads stops being the language
 * they chose. Same rule as `tierCommand` and `setStyleArgs`, for the same
 * reason.
 */
type Lang = "he" | "en";

/**
 * The two spellings of one command, from the list rather than typed again.
 *
 * Written out here first, and `deferrednotes.test.mjs` turned red on the spot —
 * which is the whole argument for a prohibition that sweeps source rather than
 * a comment asking nicely.
 */
function byLang(names: readonly string[]): Record<Lang, string> {
  return {
    he: names.find((n) => langOf(n) === "he") ?? names[0],
    en: names.find((n) => langOf(n) === "en") ?? names[0],
  };
}

const REF_WORD = byLang(DEFER_REF_COMMANDS);
const DEF_WORD = byLang(DEFER_BODY_COMMANDS);
/** `סוג:` / `kind:` — the app's half of the prelude's `_en_params` table. */
const KIND_ARG: Record<Lang, string> = { he: "סוג", en: "kind" };

const NAME_CH = /[A-Za-z0-9֐-׿_]/;

// ---------------------------------------------------------------- scanning

/** A `#הערה_בשם(…)` marker. */
export interface Ref {
  name: string;
  /** The whole call, `#` included. */
  from: number;
  to: number;
  /** The name argument's text, for a precise squiggle. */
  nameFrom: number;
  nameTo: number;
  /** The `סוג:` argument, or null when the note takes the default layout. */
  kind: string | null;
  /** Everything in the argument list except the name and `סוג:`, verbatim. */
  rest: string;
  /** Which spelling the marker was written in, so a rewrite keeps it. */
  lang: Lang;
}

/** A `#גוף_הערה(שם)[…]` definition. */
export interface Def {
  name: string;
  from: number;
  to: number;
  nameFrom: number;
  nameTo: number;
  /** The body group's contents (excluding its brackets). */
  bodyFrom: number;
  bodyTo: number;
  /** Which spelling the definition was written in. */
  lang: Lang;
}

export interface Scan {
  refs: Ref[];
  defs: Def[];
  /** The `#גופי_הערות[…]` region, when the document has one. */
  region: { from: number; to: number; innerFrom: number; innerTo: number } | null;
}

/** Positions inside a comment, so a scanner can skip them in one pass. */
function inComment(text: string): (pos: number) => boolean {
  const regions = scanSpans(text).comments;
  return (pos) => regions.some((r) => pos >= r.from && pos < r.to);
}

// `matchGroup` comes from `spans.ts`, which is context-aware: a gershayim
// inside a `[…]` body is an ordinary character (רש"י, שו"ע) and a `"` inside
// `(…)` opens a real string. The private matcher it replaces had to pick one
// rule for both and picked the first, so `#הערה_בשם("א)ב")` could not be read.

/** Skip spaces and tabs (not newlines: a call's groups sit on its own line). */
function skipSpace(text: string, i: number): number {
  while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
  return i;
}

/**
 * Split an argument list at top-level commas, segments kept verbatim.
 *
 * This used to carry its own walk with a "quotes count only where a value
 * starts" rule — a *third* answer about `"`, invented so that a gershayim in
 * prose (`עיין רש"י`) could not swallow the rest of the list while
 * `#הערה_בשם("א, ב")` still read as one argument. `spans.ts` gets both without
 * the heuristic, because it knows whether it is in code or in content.
 *
 * The empty final segment a trailing comma produces is kept — the callers below
 * index into these positions — except when it is the only one, which is what
 * `#הערה_בשם()` looks like.
 */
function splitArgs(inner: string): string[] {
  const groups = splitArgsRaw(inner, 0, inner.length);
  if (groups.length === 1 && inner.slice(groups[0].from, groups[0].to).trim() === "") return [];
  return groups.map((g) => inner.slice(g.from, g.to));
}

/** `"א"` → `א`; `[א]` → `א`; anything else → itself, trimmed. */
function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1);
  if (s.length >= 2 && s[0] === "[" && s[s.length - 1] === "]") return s.slice(1, -1).trim();
  return s;
}

/** Is `arg` a named argument, and if so which name? */
function argName(arg: string): string | null {
  const m = /^\s*([A-Za-z0-9֐-׿_]+)\s*:/.exec(arg);
  return m ? m[1] : null;
}

/** Find `#name` occurrences that are real calls, outside comments. */
function callsOf(
  text: string,
  names: readonly string[],
  isComment: (p: number) => boolean,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "#" || isComment(i)) continue;
    let j = i + 1;
    while (j < text.length && NAME_CH.test(text[j])) j++;
    if (names.includes(text.slice(i + 1, j))) out.push(i);
    i = j - 1;
  }
  return out;
}

/** Every deferred-note marker, body and region in a document. */
export function scan(text: string): Scan {
  const isComment = inComment(text);
  const refs: Ref[] = [];
  const defs: Def[] = [];
  let region: Scan["region"] = null;

  for (const start of callsOf(text, REF_NAMES, isComment)) {
    let j = start + 1;
    while (j < text.length && NAME_CH.test(text[j])) j++;
    const lang = langOf(text.slice(start + 1, j));
    const open = skipSpace(text, j);
    const ch = text[open];
    if (ch !== "(" && ch !== "[") continue;
    const close = matchGroup(text, open);
    if (close == null) continue;
    const inner = text.slice(open + 1, close);

    if (ch === "[") {
      // The bracket form: `#הערה_בשם[א]` — the whole group is the name.
      refs.push({
        name: inner.trim(),
        from: start,
        to: close + 1,
        nameFrom: open + 1,
        nameTo: close,
        kind: null,
        rest: "",
        lang,
      });
      continue;
    }

    // The paren form: the first *positional* argument is the name; `סוג:` (or
    // `kind:`) is the layout; everything else passes through untouched.
    const args = splitArgs(inner);
    let nameArg: { text: string; at: number } | null = null;
    let kind: string | null = null;
    const rest: string[] = [];
    let cursor = open + 1;
    for (const a of args) {
      const at = cursor;
      cursor += a.length + 1;
      const named = argName(a);
      if (named === "סוג" || named === "kind") {
        kind = a.slice(a.indexOf(":") + 1).trim();
      } else if (named === "שם" || named === "name") {
        nameArg = { text: a.slice(a.indexOf(":") + 1), at: at + a.indexOf(":") + 1 };
      } else if (!named && !nameArg) {
        nameArg = { text: a, at };
      } else {
        rest.push(a.trim());
      }
    }
    if (!nameArg) continue;
    const lead = nameArg.text.length - nameArg.text.trimStart().length;
    const bare = nameArg.text.trim();
    refs.push({
      name: unquote(bare),
      from: start,
      to: close + 1,
      nameFrom: nameArg.at + lead,
      nameTo: nameArg.at + lead + bare.length,
      kind,
      rest: rest.join(", "),
      lang,
    });
  }

  for (const start of callsOf(text, DEF_NAMES, isComment)) {
    let j = start + 1;
    while (j < text.length && NAME_CH.test(text[j])) j++;
    const lang = langOf(text.slice(start + 1, j));
    const open = skipSpace(text, j);
    if (text[open] !== "(" && text[open] !== "[") continue;
    const close = matchGroup(text, open);
    if (close == null) continue;
    // The body follows the name group; a definition without one is half-typed.
    const bodyOpen = skipSpace(text, close + 1);
    if (text[bodyOpen] !== "[") continue;
    const bodyClose = matchGroup(text, bodyOpen);
    if (bodyClose == null) continue;
    const raw = text.slice(open + 1, close);
    const lead = raw.length - raw.trimStart().length;
    const bare = raw.trim();
    defs.push({
      name: unquote(bare),
      from: start,
      to: bodyClose + 1,
      nameFrom: open + 1 + lead,
      nameTo: open + 1 + lead + bare.length,
      bodyFrom: bodyOpen + 1,
      bodyTo: bodyClose,
      lang,
    });
  }

  const regionStarts = callsOf(text, REGION_NAMES, isComment);
  if (regionStarts.length) {
    const start = regionStarts[regionStarts.length - 1];
    let j = start + 1;
    while (j < text.length && NAME_CH.test(text[j])) j++;
    const open = skipSpace(text, j);
    const close = text[open] === "[" ? matchGroup(text, open) : null;
    if (close != null) {
      region = { from: start, to: close + 1, innerFrom: open + 1, innerTo: close };
    }
  }

  return { refs, defs, region };
}

// ---------------------------------------------------------------- the lint

export type Problem =
  /** A marker whose body was never written — a note nobody will ever read. */
  | { kind: "dangling"; name: string; from: number; to: number }
  /** A body no marker points at — a note nobody will ever see. */
  | { kind: "orphan"; name: string; from: number; to: number }
  /** A second body for a name already defined; the engine takes the first. */
  | { kind: "duplicate"; name: string; from: number; to: number };

export function problems(text: string): Problem[] {
  const { refs, defs } = scan(text);
  const defined = new Set(defs.map((d) => d.name));
  const referenced = new Set(refs.map((r) => r.name));
  const out: Problem[] = [];

  for (const r of refs) {
    if (!defined.has(r.name)) {
      out.push({ kind: "dangling", name: r.name, from: r.nameFrom, to: r.nameTo });
    }
  }
  const seen = new Set<string>();
  for (const d of defs) {
    if (seen.has(d.name)) {
      out.push({ kind: "duplicate", name: d.name, from: d.nameFrom, to: d.nameTo });
    } else {
      seen.add(d.name);
      if (!referenced.has(d.name)) {
        out.push({ kind: "orphan", name: d.name, from: d.nameFrom, to: d.nameTo });
      }
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

// ---------------------------------------------------------------- naming

/**
 * The next free name.
 *
 * Numbers, because the writer should never have to invent one — and because a
 * name is an implementation detail of the pairing, not something the reader
 * ever sees. org-mode's `[fn:1]` counters are a wart; the difference here is
 * that nobody types these.
 */
export function nextName(text: string): string {
  const taken = new Set<string>();
  const s = scan(text);
  for (const r of s.refs) taken.add(r.name);
  for (const d of s.defs) taken.add(d.name);
  for (let n = 1; ; n++) {
    if (!taken.has(String(n))) return String(n);
  }
}

// ---------------------------------------------------------------- jumping

export type Jump =
  | { kind: "toBody"; pos: number; name: string }
  | { kind: "toMarker"; pos: number; name: string }
  /** On a marker with no body — the caller offers to write one. */
  | { kind: "bodyMissing"; name: string; ref: Ref }
  /** On a body with no marker — the caller offers to place one. */
  | { kind: "markerMissing"; name: string; def: Def };

function within(pos: number, from: number, to: number): boolean {
  return pos >= from && pos <= to;
}

/**
 * Where this position's other half is.
 *
 * One key does all of it, like `C-c C-c`: the direction follows from where the
 * caret already is, so there is nothing to remember and nothing to choose.
 * Innermost wins, so a marker written *inside* a body jumps to its own body
 * rather than back out to the enclosing one.
 */
export function jump(text: string, pos: number): Jump | null {
  const { refs, defs } = scan(text);

  const ref = refs
    .filter((r) => within(pos, r.from, r.to))
    .sort((a, b) => b.from - a.from)[0];
  if (ref) {
    const def = defs.find((d) => d.name === ref.name);
    return def
      ? { kind: "toBody", pos: def.bodyFrom, name: ref.name }
      : { kind: "bodyMissing", name: ref.name, ref };
  }

  const def = defs
    .filter((d) => within(pos, d.from, d.to))
    .sort((a, b) => b.from - a.from)[0];
  if (def) {
    const marker = refs.find((r) => r.name === def.name);
    return marker
      ? { kind: "toMarker", pos: marker.from, name: def.name }
      : { kind: "markerMissing", name: def.name, def };
  }
  return null;
}

/**
 * A position the engine can actually show, for a caret that is on a deferred note.
 *
 * `revealCursor` asks the compiler where the caret's text printed. For most of a
 * document that question answers itself, and on a deferred note it does not:
 *
 *   - A marker, `#הערה_בשם("א")`, is a call. Not one character of it reaches the
 *     page — what reaches the page is a superscript the prelude draws and the
 *     body's prose at the foot of the sheet — so the reveal comes back empty and
 *     clicking a footnote marker, the single most obvious thing to click, does
 *     nothing at all.
 *   - A body's head, `#גוף_הערה("א")[`, is the same story with the prose sitting
 *     right beside it. The caret has to be *inside the brackets* for the reveal
 *     to work, which is a rule about bracket positions that no reader knows.
 *
 * So answer with a position that does print and lands where the reader means:
 * the body's prose, which the engine sets at the foot of the marker's page. From
 * a marker that is the note the marker summons; from a body's head it is that
 * body's own first character, a few columns away.
 *
 * `null` when the caret is on neither, when the marker has no body yet, or when
 * the body is empty — all of which mean "nothing printed for this", and the
 * caller already knows how to say that.
 */
export function printingAnchor(text: string, pos: number): number | null {
  const { refs, defs } = scan(text);

  // Innermost first, for the same reason `jump` sorts this way: a marker written
  // inside another note's body belongs to its own note.
  const ref = refs.filter((r) => within(pos, r.from, r.to)).sort((a, b) => b.from - a.from)[0];
  const def = defs.filter((d) => within(pos, d.from, d.to)).sort((a, b) => b.from - a.from)[0];

  // Already inside a body's prose: that text prints, and the engine's own answer
  // about it beats a guess. Only the head is remapped.
  if (def && !ref && pos >= def.bodyFrom && pos <= def.bodyTo) return null;

  const target = ref ? defs.find((d) => d.name === ref.name) : def;
  if (!target || target.bodyTo <= target.bodyFrom) return null;
  return target.bodyFrom;
}

/** The body defined for `name`, as text — for a hover preview. */
export function bodyOf(text: string, name: string): string | null {
  const d = scan(text).defs.find((x) => x.name === name);
  return d ? text.slice(d.bodyFrom, d.bodyTo) : null;
}

// ---------------------------------------------------------------- editing

export interface Change {
  text: string;
  /** Where the caret belongs afterwards. */
  caret: number;
}

/**
 * Where this note's marker sits, for the two bodies it has to be filed between.
 *
 * `Infinity` for a body whose marker does not exist: an orphan has no place in
 * reading order, so it sorts to the end rather than to an arbitrary middle.
 */
function markerOf(s: Scan, name: string): number {
  return s.refs.find((r) => r.name === name)?.from ?? Infinity;
}

/**
 * The bodies this one belongs between, by the order their markers appear.
 *
 * Filed by *appending*, the list at the foot of the file came out in the order
 * the writer happened to write the notes, which is not the order a reader meets
 * them: add a note to the first paragraph of a finished chapter and its prose
 * lands last, under the note from the final page. org-mode has the same defect
 * and the same answer — a footnote's definition belongs where its reference
 * does.
 *
 * With no name to go on (or a marker not yet in the text) this answers "after
 * the last one", which is what it always did.
 *
 * **`grouped` is not a refinement, it is the setting being true tomorrow.** A
 * document tidied into one block per apparatus and then written in stays tidy
 * only if the *filing* knows about the blocks; otherwise the option is true
 * until the writer adds a note, which is a setting that lies about itself. So
 * the comparison takes the block as its first key and reading order as its
 * second — the same two keys, in the same order, as `permuteBodies`.
 */
function neighbours(
  s: Scan,
  name?: string,
  grouped = false,
): { after: Def | null; before: Def | null } {
  const last = s.defs.length ? s.defs[s.defs.length - 1] : null;
  if (name == null) return { after: last, before: null };
  const mine = s.refs.find((r) => r.name === name)?.from;
  if (mine == null) return { after: last, before: null };
  const order = apparatusOrder(s);
  const rank = (n: string) => {
    if (!grouped) return 0;
    const kind = apparatusOf(s, n);
    return kind === null ? Infinity : order.indexOf(kind);
  };
  // Where this note sits, on both keys.
  const myRank = rank(name);
  let after: Def | null = null;
  let before: Def | null = null;
  for (const d of s.defs) {
    if (d.name === name) continue;
    const r = rank(d.name);
    const earlier = r < myRank || (r === myRank && markerOf(s, d.name) < mine);
    if (earlier) after = d;
    else if (!before) before = d;
  }
  return { after, before };
}

/**
 * Where a new body belongs, and what has to be typed around it.
 *
 * In reading order among the bodies already filed (see `neighbours`), and
 * failing that in the order a document is likely to be in: a `#גופי_הערות[…]`
 * region if the writer made one, otherwise straight after the last body, and
 * otherwise a fresh block at the end of the document.
 */
export function fileNewBody(
  text: string,
  entry: string,
  name?: string,
  grouped = false,
): { text: string; at: number } {
  const s = scan(text);
  const { after, before } = neighbours(s, name, grouped);
  if (after) {
    const at = after.to;
    return { text: text.slice(0, at) + "\n" + entry + text.slice(at), at: at + 1 };
  }
  // Every body already filed belongs after this one — so this is the first, and
  // it goes above them rather than under the whole list.
  if (before) {
    // The **start of `before`'s own line**, so the new body lands on a line of
    // its own directly above it. `lineStartIfAlone` hands back the *preceding
    // newline* instead, which appends the entry to whatever is on the line
    // above — harmless while that line was always blank, and not harmless at
    // all once a block separator can be there: the body ends up inside a
    // comment, where the scanner rightly cannot see it, and the note simply has
    // no prose. Found by the grouping tests, and it was latent before them.
    const at = text.lastIndexOf("\n", before.from - 1) + 1;
    return { text: text.slice(0, at) + entry + "\n" + text.slice(at), at };
  }
  if (s.region) {
    const inner = text.slice(s.region.innerFrom, s.region.innerTo);
    const pad = inner.trim() === "" ? "\n" : "";
    const at = s.region.innerTo;
    const insert = `${pad}${entry}\n`;
    return { text: text.slice(0, at) + insert + text.slice(at), at: at + pad.length };
  }
  if (s.defs.length) {
    const last = s.defs[s.defs.length - 1];
    const at = last.to;
    return { text: text.slice(0, at) + "\n" + entry + text.slice(at), at: at + 1 };
  }
  const trimmed = text.replace(/\s*$/, "");
  const insert = `\n\n${entry}\n`;
  return { text: trimmed + insert, at: trimmed.length + 2 };
}

/** `#גוף_הערה("name")[body]` / `#note_body("name")[body]` */
function definitionText(name: string, body: string, lang: Lang): string {
  return `#${DEF_WORD[lang]}("${name}")[${body}]`;
}

/** `#הערה_בשם("name", סוג: kind, rest)` / `#note_named("name", kind: …)` */
function referenceText(name: string, kind: string | null, rest: string, lang: Lang): string {
  const args = [`"${name}"`];
  if (kind && kind !== DEFAULT_KIND[lang]) args.push(`${KIND_ARG[lang]}: ${kind}`);
  if (rest) args.push(rest);
  return `#${REF_WORD[lang]}(${args.join(", ")})`;
}

/**
 * Write the missing body for a marker, and put the caret in it.
 *
 * This is the create half of the jump: pressing the key on a marker that has no
 * prose yet does not report an error, it writes the line and takes you there.
 * The body is spelled the way its marker is — the pair is one note.
 */
export function createBody(text: string, name: string, grouped = false): Change {
  const lang = scan(text).refs.find((r) => r.name === name)?.lang ?? "he";
  const entry = definitionText(name, "", lang);
  const { text: out, at } = fileNewBody(text, entry, name, grouped);
  // Inside the body brackets: `#גוף_הערה("name")[` is the prefix.
  return { text: out, caret: at + entry.length - 1 };
}

/**
 * Insert a fresh deferred note at `pos`: a marker here, its body at the end.
 *
 * `lang` is the document's, not the interface's: there is no note here to take
 * a spelling from, so this is the one case that has to be told.
 */
export function insertDeferred(
  text: string,
  pos: number,
  kind: string | null = null,
  lang: Lang = "he",
  grouped = false,
): Change {
  const name = nextName(text);
  const marker = referenceText(name, kind, "", lang);
  const withMarker = text.slice(0, pos) + marker + text.slice(pos);
  const entry = definitionText(name, "", lang);
  const { text: out, at } = fileNewBody(withMarker, entry, name, grouped);
  return { text: out, caret: at + entry.length - 1 };
}

/**
 * Turn a chooser snippet into its deferred pair.
 *
 * The notes chooser knows the layout the writer picked and emits it as a
 * snippet (`#מדף_א[|]`, `#הערתסיום[|]`). Deferring is orthogonal to that
 * choice — it is where the prose lives in the file, not where the note prints —
 * so rather than doubling the eleven layouts into twenty-two, the snippet is
 * rewritten. `|` marks the caret and moves to the body, which is where the
 * writer is about to type.
 *
 * Returns null for a snippet that is not a note command, so a caller cannot
 * quietly turn something else into a note.
 */
export function deferSnippet(insert: string, name: string): { marker: string; body: string } | null {
  const m = /^#([A-Za-z0-9֐-׿_]+)/.exec(insert.trim());
  if (!m || !NOTE_COMMANDS.includes(m[1])) return null;
  const cmd = m[1];
  const lang = langOf(cmd);
  let i = m[0].length;
  let args = "";
  const s = insert.trim();
  if (s[i] === "(") {
    const close = matchGroup(s, i);
    if (close == null) return null;
    args = s.slice(i + 1, close).trim();
    i = close + 1;
  }
  if (s[i] !== "[") return null;
  const close = matchGroup(s, i);
  if (close == null) return null;
  const inner = s.slice(i + 1, close).replace("|", "");
  const kind = isDefaultKind(cmd) ? null : cmd;
  return {
    marker: referenceText(name, kind, args, lang),
    body: definitionText(name, `${inner}|`, lang),
  };
}

/** Either spelling of the layout a marker gets for free. */
function isDefaultKind(cmd: string): boolean {
  return cmd === DEFAULT_KIND.he || cmd === DEFAULT_KIND.en;
}

/**
 * The innermost note command whose body contains `pos`.
 *
 * `#הערה[א #הערה[ב]]` with the caret in ב must exile ב, not the note that
 * contains it — the writer is pointing at the one they are looking at.
 */
export function inlineNoteAt(
  text: string,
  pos: number,
): { cmd: string; from: number; to: number; args: string; bodyFrom: number; bodyTo: number } | null {
  const isComment = inComment(text);
  let best: ReturnType<typeof inlineNoteAt> = null;
  for (const start of callsOf(text, NOTE_COMMANDS, isComment)) {
    let j = start + 1;
    while (j < text.length && NAME_CH.test(text[j])) j++;
    const cmd = text.slice(start + 1, j);
    let args = "";
    let k = skipSpace(text, j);
    if (text[k] === "(") {
      const close = matchGroup(text, k);
      if (close == null) continue;
      args = text.slice(k + 1, close).trim();
      k = skipSpace(text, close + 1);
    }
    if (text[k] !== "[") continue;
    const bodyClose = matchGroup(text, k);
    if (bodyClose == null) continue;
    if (!within(pos, start, bodyClose + 1)) continue;
    const found = {
      cmd,
      from: start,
      to: bodyClose + 1,
      args,
      bodyFrom: k + 1,
      bodyTo: bodyClose,
    };
    if (!best || found.from > best.from) best = found;
  }
  return best;
}

/**
 * Send the prose of the inline note at `pos` to the end, leaving a marker.
 *
 * The layout is preserved exactly — `#מדף_בדרגה(2)[…]` becomes
 * `#הערה_בשם("n", סוג: מדף_בדרגה, 2)` — because this rewrites *where the words
 * live in the file* and nothing else. Any other extra arguments ride along
 * verbatim rather than being interpreted.
 */
export function deferInlineNote(text: string, pos: number, grouped = false): Change | null {
  const note = inlineNoteAt(text, pos);
  if (!note) return null;
  const name = nextName(text);
  const body = text.slice(note.bodyFrom, note.bodyTo);
  const lang = langOf(note.cmd);
  const kind = isDefaultKind(note.cmd) ? null : note.cmd;
  const marker = referenceText(name, kind, note.args, lang);
  const withMarker = text.slice(0, note.from) + marker + text.slice(note.to);
  const { text: out } = fileNewBody(withMarker, definitionText(name, body, lang), name, grouped);
  // The caret stays where the note was — the writer is still writing the
  // sentence, not the note.
  return { text: out, caret: note.from + marker.length };
}

/**
 * The inverse: bring a deferred body back inline, and delete its definition.
 *
 * Returns null when the marker has no body to bring back, or when the name has
 * more than one marker — inlining then would have to duplicate the prose, and
 * silently doubling a note is worse than declining.
 */
export function inlineDeferredNote(text: string, pos: number): Change | null {
  const { refs, defs } = scan(text);
  const ref = refs
    .filter((r) => within(pos, r.from, r.to))
    .sort((a, b) => b.from - a.from)[0];
  if (!ref) return null;
  if (refs.filter((r) => r.name === ref.name).length > 1) return null;
  const def = defs.find((d) => d.name === ref.name);
  if (!def) return null;

  const body = text.slice(def.bodyFrom, def.bodyTo);
  const cmd = ref.kind ?? DEFAULT_KIND[ref.lang];
  const call = `#${cmd}${ref.rest ? `(${ref.rest})` : ""}[${body}]`;

  // Two edits at known offsets; apply the later one first so the earlier keeps
  // its position. The definition's own line goes with it, so removing a body
  // does not leave a blank line behind in the region.
  const defFrom = lineStartIfAlone(text, def.from, def.to);
  const defTo = lineEndIfAlone(text, def.from, def.to);
  const edits = [
    { from: ref.from, to: ref.to, insert: call },
    { from: defFrom, to: defTo, insert: "" },
  ].sort((a, b) => b.from - a.from);

  let out = text;
  for (const e of edits) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  // Recalling the last body leaves the blank line that separated the region from
  // the text. Tidy it, so defer-then-recall gives the document back rather than
  // slowly growing a tail of empty lines.
  if (!scan(out).defs.length) out = out.replace(/\s*$/, "\n");
  const caret = ref.from < defFrom ? ref.from + call.length : ref.from + call.length - (defTo - defFrom);
  return { text: out, caret: Math.min(caret, out.length) };
}

/** The start of the line, if nothing but whitespace precedes the span on it. */
function lineStartIfAlone(text: string, from: number, to: number): number {
  const ls = text.lastIndexOf("\n", from - 1) + 1;
  if (text.slice(ls, from).trim() !== "") return from;
  const le = text.indexOf("\n", to);
  if (text.slice(to, le < 0 ? text.length : le).trim() !== "") return from;
  return ls === 0 ? 0 : ls - 1; // take the preceding newline too
}
/** The end of the line, under the same condition. */
function lineEndIfAlone(text: string, from: number, to: number): number {
  const ls = text.lastIndexOf("\n", from - 1) + 1;
  if (text.slice(ls, from).trim() !== "") return to;
  const le = text.indexOf("\n", to);
  const end = le < 0 ? text.length : le;
  if (text.slice(to, end).trim() !== "") return to;
  return end;
}

/**
 * Point a marker at a different layout, leaving the prose where it is.
 *
 * The deferred spelling of "convert this note to an endnote". `סוג` is the
 * whole of where a deferred note prints, so that argument is the entire edit —
 * the name and any extra positional arguments ride along, which is what keeps a
 * tier or a stream through the change.
 */
export function retargetRef(text: string, ref: Ref, command: string): Change {
  const marker = referenceText(ref.name, command, ref.rest, ref.lang);
  return {
    text: text.slice(0, ref.from) + marker + text.slice(ref.to),
    caret: ref.from + marker.length,
  };
}

/**
 * Delete a marker and the prose it points at, in one edit.
 *
 * Deleting the marker alone would leave a body nothing points at — the orphan
 * the lint exists to report — so "delete this note" has to mean both halves, or
 * it means "trade a note for a warning".
 */
export function removePair(text: string, ref: Ref, def: Def | null): Change {
  const cut = def
    ? { from: lineStartIfAlone(text, def.from, def.to), to: lineEndIfAlone(text, def.from, def.to) }
    : null;
  const edits = [{ from: ref.from, to: ref.to }];
  if (cut) edits.push(cut);
  // Later edit first, so the earlier one keeps its offsets.
  edits.sort((a, b) => b.from - a.from);
  let out = text;
  for (const e of edits) out = out.slice(0, e.from) + out.slice(e.to);
  // The last body taken away leaves the blank line that separated the region
  // from the text; tidy it, as recalling one does.
  if (cut && !scan(out).defs.length) out = out.replace(/\s*$/, "\n");
  const caret = cut && cut.from < ref.from ? ref.from - (cut.to - cut.from) : ref.from;
  return { text: out, caret: Math.min(Math.max(caret, 0), out.length) };
}

/**
 * Every deferred note put back inline, with the definitions removed.
 *
 * For anything downstream that has to *see* a note's body where the note is —
 * the Markdown and Word exports both walk the source and turn a note command's
 * body into a footnote, so without this a converted document loses every
 * deferred marker and gains a block of loose paragraphs at the end.
 *
 * Unlike `inlineDeferredNote` this is not an edit a writer would make: a body
 * referenced twice is duplicated (which is what the page does), and a marker
 * with no body simply disappears (there is nothing to say in a Word file).
 *
 * A body may reference another body, so substitution recurses into what it
 * pastes rather than running the whole document again: a second document pass
 * would already have deleted the definitions the first pass's output still
 * needs. `MAX_DEPTH` is the guard for the pathological document whose note
 * refers to itself, which Typst also declines to expand.
 */
const MAX_DEPTH = 8;

export function resolveDeferred(text: string): string {
  const { refs, defs } = scan(text);
  if (!refs.length && !defs.length) return text;

  const bodies = new Map<string, string>();
  for (const d of defs) {
    if (!bodies.has(d.name)) bodies.set(d.name, text.slice(d.bodyFrom, d.bodyTo));
  }

  /** A marker as the note it stands for, with its own body already expanded. */
  const render = (r: Ref, depth: number): string => {
    const body = bodies.get(r.name);
    // A dangling marker and a cycle both come out as nothing: there is no note
    // to print, and an export has no way to say "this one is broken".
    if (body == null || depth >= MAX_DEPTH) return "";
    const cmd = r.kind ?? DEFAULT_KIND[r.lang];
    return `#${cmd}${r.rest ? `(${r.rest})` : ""}[${expand(body, depth + 1)}]`;
  };

  /** Every marker in a fragment replaced. Markers cannot nest, so this is flat. */
  const expand = (s: string, depth: number): string => {
    const rs = scan(s).refs;
    if (!rs.length) return s;
    let out = "";
    let cursor = 0;
    for (const r of rs) {
      out += s.slice(cursor, r.from) + render(r, depth);
      cursor = r.to;
    }
    return out + s.slice(cursor);
  };

  // Only the outermost definitions are removed, and a marker *inside* one is
  // left to `expand`: both would be an edit nested inside another edit.
  const top = defs.filter((d) => !defs.some((o) => o !== d && o.from <= d.from && o.to >= d.to));
  const buried = (r: Ref) => top.some((d) => r.from >= d.from && r.to <= d.to);

  const edits: { from: number; to: number; insert: string }[] = [];
  for (const r of refs) {
    if (!buried(r)) edits.push({ from: r.from, to: r.to, insert: render(r, 0) });
  }
  // The definitions go with their own line, so the export does not end in a run
  // of blank lines where the region used to be.
  for (const d of top) {
    edits.push({
      from: lineStartIfAlone(text, d.from, d.to),
      to: lineEndIfAlone(text, d.from, d.to),
      insert: "",
    });
  }
  edits.sort((a, b) => b.from - a.from);

  let out = text;
  for (const e of edits) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  if (top.length) out = out.replace(/\s*$/, "\n");
  return out;
}

/**
 * Send *every* inline note in the document to the end, in one pass.
 *
 * The bulk form of `deferInlineNote`, for the document that already exists.
 * Notes nested inside other notes are left where they are: their prose is
 * already travelling with the body that contains them, and hoisting both would
 * put a marker inside a body that is itself about to move.
 */
export function deferAllInlineNotes(text: string, grouped = false): { text: string; moved: number } {
  const isComment = inComment(text);
  const spans: { from: number; to: number; cmd: string; args: string; body: string }[] = [];
  for (const start of callsOf(text, NOTE_COMMANDS, isComment)) {
    let j = start + 1;
    while (j < text.length && NAME_CH.test(text[j])) j++;
    const cmd = text.slice(start + 1, j);
    let args = "";
    let k = skipSpace(text, j);
    if (text[k] === "(") {
      const close = matchGroup(text, k);
      if (close == null) continue;
      args = text.slice(k + 1, close).trim();
      k = skipSpace(text, close + 1);
    }
    if (text[k] !== "[") continue;
    const bodyClose = matchGroup(text, k);
    if (bodyClose == null) continue;
    spans.push({ from: start, to: bodyClose + 1, cmd, args, body: text.slice(k + 1, bodyClose) });
  }
  // Outermost only: a span contained in another is a note inside a note.
  const top = spans.filter((s) => !spans.some((o) => o !== s && o.from <= s.from && o.to >= s.to));
  if (!top.length) return { text, moved: 0 };

  // Names must not collide with each other or with anything already deferred,
  // so they are drawn once, up front, against the original document.
  const taken = new Set<string>();
  const existing = scan(text);
  for (const r of existing.refs) taken.add(r.name);
  for (const d of existing.defs) taken.add(d.name);
  let next = 1;
  const nameFor = () => {
    while (taken.has(String(next))) next++;
    taken.add(String(next));
    return String(next);
  };

  // Named, not just spelled: these are filed one at a time, and a document that
  // already had deferred bodies has to interleave the new ones among them rather
  // than pile them all on the end. Without the name `fileNewBody` can only
  // append, which is exactly the disorder this pass is supposed not to create.
  const bodies: { name: string; entry: string }[] = [];
  let out = "";
  let cursor = 0;
  for (const s of top.sort((a, b) => a.from - b.from)) {
    const name = nameFor();
    const lang = langOf(s.cmd);
    const kind = isDefaultKind(s.cmd) ? null : s.cmd;
    out += text.slice(cursor, s.from) + referenceText(name, kind, s.args, lang);
    cursor = s.to;
    bodies.push({ name, entry: definitionText(name, s.body, lang) });
  }
  out += text.slice(cursor);

  for (const b of bodies) out = fileNewBody(out, b.entry, b.name, grouped).text;
  return { text: out, moved: top.length };
}

/**
 * The inverse in bulk: bring *every* deferred note back into its sentence.
 *
 * The bulk form of `inlineDeferredNote`, and the half that was missing. The
 * decision record asks that where note bodies live be *"changeable after notes
 * already exist"*, and it was changeable in one direction only: a document could
 * be swept to the org-mode arrangement with one press and could not be swept
 * back. A switch that goes one way is not a switch, and a writer who tried it on
 * a finished sefer and disliked it had three hundred notes to move by hand.
 *
 * Conservative in the two places it can be:
 *
 * - **A name with more than one marker is left alone.** Inlining would have to
 *   put the same prose in two places, and silently doubling a note is worse than
 *   declining to move it — the same rule `inlineDeferredNote` applies one note
 *   at a time.
 * - **A marker with no body is left alone**, and the lint keeps reporting it.
 *   That is a note the writer has not finished writing, not a note to delete.
 *
 * Both leave a document that is *partly* deferred, which is a legal document —
 * the per-note override is exactly that — so the count says how many moved and
 * the ones that did not stay where they are.
 */
export function inlineAllDeferredNotes(text: string): { text: string; moved: number } {
  const { refs, defs } = scan(text);
  if (!refs.length) return { text, moved: 0 };

  const seen = new Map<string, number>();
  for (const r of refs) seen.set(r.name, (seen.get(r.name) ?? 0) + 1);
  const bodyOfName = new Map<string, Def>();
  for (const d of defs) if (!bodyOfName.has(d.name)) bodyOfName.set(d.name, d);

  /** Every edit this makes, as (from, to, insert) over the *original* offsets. */
  const edits: { from: number; to: number; insert: string }[] = [];
  let moved = 0;
  for (const r of refs) {
    if ((seen.get(r.name) ?? 0) > 1) continue;
    const def = bodyOfName.get(r.name);
    if (!def) continue;
    const body = text.slice(def.bodyFrom, def.bodyTo);
    const cmd = r.kind ?? DEFAULT_KIND[r.lang];
    edits.push({
      from: r.from,
      to: r.to,
      insert: `#${cmd}${r.rest ? `(${r.rest})` : ""}[${body}]`,
    });
    edits.push({
      from: lineStartIfAlone(text, def.from, def.to),
      to: lineEndIfAlone(text, def.from, def.to),
      insert: "",
    });
    moved++;
  }
  if (!moved) return { text, moved: 0 };

  // Applied back to front, so an earlier edit keeps the offsets a later one was
  // measured against. A body nested inside another body cannot be reached from
  // here — its definition is inside a span this loop may also be replacing — so
  // overlapping edits are dropped rather than allowed to interleave and produce
  // a document neither half of the pair meant.
  edits.sort((a, b) => b.from - a.from);
  let out = text;
  let last = Infinity;
  for (const e of edits) {
    if (e.to > last) continue;
    out = out.slice(0, e.from) + e.insert + out.slice(e.to);
    last = e.from;
  }
  // The last body taken away leaves the blank line that separated the region
  // from the text, as recalling one note does.
  if (!scan(out).defs.length) out = out.replace(/\s*$/, "\n");
  return { text: out, moved };
}

// ---------------------------------------------------------------- normalising

/**
 * Put the filed bodies back into reading order, and renumber them.
 *
 * The repair half of `fileNewBody`'s ordering: a document written before that
 * knew about order — or edited by hand, or assembled from two files — has its
 * bodies in whatever sequence they were typed, and a list of thirty notes that
 * does not follow the text is a list nobody can proofread against it. org-mode
 * calls this normalising and it is the only reason its footnotes are usable.
 *
 * Two things happen, and both are conservative:
 *
 * - **The bodies are permuted between the slots they already occupy.** Each
 *   definition's own text moves; the whitespace, the blank lines and anything
 *   the writer put between them stay exactly where they are. A body whose marker
 *   was deleted has no place in reading order and keeps the end of the list.
 * - **Only machine-made names are renumbered.** `nextName` hands out `1`, `2`,
 *   `3`, and after a few deletions they read `4, 1, 7`. A name the *writer*
 *   chose — `#הערה_בשם("רש״י")` — is theirs and is left alone, which also means
 *   this can be run on a document that mixes the two.
 */
export function sortBodies(text: string, grouped = false): { text: string; moved: number } {
  // Old separators go first, always — including when the grouping is being
  // turned *off*, which is the case that would otherwise leave the headings
  // standing over a list they no longer describe.
  const bare = withoutSeparators(text);
  const ordered = permuteBodies(bare, grouped);
  const renamed = renumberNotes(ordered.text);
  const final = grouped ? withSeparators(renamed) : renamed;
  // Counted against what the writer had, not against the stripped copy: a
  // document whose separators were removed and put back unchanged has moved
  // nothing, and saying otherwise would report work that did not happen.
  return { text: final, moved: final === text ? 0 : Math.max(ordered.moved, 1) };
}

/** Each block's separator, written above the first body of that apparatus. */
function withSeparators(text: string): string {
  const s = scan(text);
  if (!s.defs.length) return text;
  const edits: { at: number; insert: string }[] = [];
  let last: string | null | undefined;
  for (const d of s.defs) {
    const mine = apparatusOf(s, d.name);
    // Orphans get no heading of their own. They are not an apparatus, they are
    // bodies nothing points at, and the lint already says so on the line.
    if (mine === null) break;
    if (mine !== last) {
      // The **start of the line**, not `lineStartIfAlone`, which hands back the
      // preceding newline so that a caller can insert `"\n" + entry` after it.
      // Used here that puts the separator at the end of the line above, where
      // it is no longer a comment on a line of its own — so `withoutSeparators`
      // cannot find it again, the tidy stops being idempotent, and turning the
      // option off leaves the headings behind. All three, from one offset.
      const at = text.lastIndexOf("\n", d.from - 1) + 1;
      edits.push({ at, insert: separatorFor(mine) + "\n" });
      last = mine;
    }
  }
  let out = text;
  for (const e of [...edits].sort((a, b) => b.at - a.at)) {
    out = out.slice(0, e.at) + e.insert + out.slice(e.at);
  }
  return out;
}

// ------------------------------------------------- one block per apparatus
//
// # The report
//
// > *"At the end of the source, deferred bodies for footnotes and endnotes are
// > interleaved in one run, which is confusing to read and to edit. Add an
// > option to keep each apparatus's bodies in its own block, with a heading or
// > separator."*
//
// And the constraint the item states in the same breath, which is what makes it
// a design rather than a sort: the bodies are filed in **reading order**, and
// that rule does not get abandoned. So the answer is grouping by apparatus
// first and reading order *within* each group — two keys on one sort, not a
// second scheme replacing the first.
//
// The groups themselves are in reading order too: the apparatus whose first
// marker appears first comes first. Any other order would be a decision this
// module is not entitled to make — there is no natural precedence between a
// footnote and an endnote, and putting them in a fixed order would shuffle
// somebody's file for a reason nobody can see on the page.
//
// # Why the separator is a comment
//
// It has to name the block, print nothing, and survive being written again.
// A `#גופי_הערות` region is an engine construct with meaning, and a heading
// would print. A comment is the only thing in this language that is addressed
// to the person reading the source and to nobody else — which is exactly what
// this is.
//
// Recognised by its own shape and stripped before a re-sort, so running the
// tidy twice leaves one separator and not two.

/** The apparatus a marker names, defaulted to the ordinary footnote. */
export function kindOf(ref: Ref): string {
  return ref.kind ?? DEFAULT_NOTE_KIND[ref.lang];
}

/** The apparatus a body belongs to, via its marker. `null` for an orphan. */
export function apparatusOf(s: Scan, name: string): string | null {
  const ref = s.refs.find((r) => r.name === name);
  return ref ? kindOf(ref) : null;
}

/**
 * The apparatuses of this document, in the order a reader first meets them.
 *
 * Orphans — bodies whose marker is gone — are not in here and sort last, which
 * is where `permuteBodies` already puts them and for the same reason: a body
 * nothing points at has no place in the reading order, and inventing one for it
 * would move somebody's text on the strength of a guess.
 */
function apparatusOrder(s: Scan): string[] {
  const seen: string[] = [];
  for (const r of s.refs) {
    const k = kindOf(r);
    if (!seen.includes(k)) seen.push(k);
  }
  return seen;
}

/** The separator line written above each block, and the shape that finds it. */
const SEPARATOR = /^[ \t]*\/\/[ \t]*—— .+ ——[ \t]*\n?/gmu;
function separatorFor(apparatus: string): string {
  return `// —— ${apparatus} ——`;
}

/**
 * The document with every generated separator taken out again.
 *
 * Its own line goes with it, newline included, or turning the grouping off
 * would leave a run of blank lines where the headings had been — a tidy-up
 * that leaves litter is one nobody trusts twice.
 */
function withoutSeparators(text: string): string {
  return text.replace(SEPARATOR, "");
}

/**
 * The bodies, permuted into the order their markers appear.
 *
 * `grouped` adds a *first* key — which apparatus the body belongs to — and
 * leaves the reading order as the second. That is the whole of the item's
 * constraint: the rule that bodies are filed in reading order is not abandoned,
 * it is applied within each block.
 */
function permuteBodies(text: string, grouped = false): { text: string; moved: number } {
  const s = scan(text);
  if (s.defs.length < 2) return { text, moved: 0 };
  const order = apparatusOrder(s);
  // An orphan sorts last in both keys, which is where the reading-order sort
  // already put it: a body nothing points at has no place in the reading order,
  // and inventing a block for it would move somebody's text on a guess.
  const block = (name: string) => {
    const mine = apparatusOf(s, name);
    return mine === null ? Infinity : order.indexOf(mine);
  };
  // A stable sort, so orphans — all keyed `Infinity` — keep the order they were
  // written in rather than being shuffled among themselves for no reason.
  const want = [...s.defs].sort(
    (a, b) =>
      (grouped ? block(a.name) - block(b.name) : 0) ||
      markerOf(s, a.name) - markerOf(s, b.name),
  );
  let moved = 0;
  let out = "";
  let cursor = 0;
  s.defs.forEach((slot, i) => {
    if (slot.name !== want[i].name) moved++;
    out += text.slice(cursor, slot.from) + text.slice(want[i].from, want[i].to);
    cursor = slot.to;
  });
  return { text: out + text.slice(cursor), moved };
}

/** Renumber the machine-named notes 1, 2, 3 down the document. */
function renumberNotes(text: string): string {
  const s = scan(text);
  const numeric = (n: string) => /^[0-9]+$/.test(n);
  // Names that are spoken for: everything the writer named, and every body whose
  // marker is gone (which is not renumbered and must not be renumbered *onto*).
  const reserved = new Set<string>();
  for (const d of s.defs) if (markerOf(s, d.name) === Infinity) reserved.add(d.name);
  for (const r of s.refs) if (!numeric(r.name)) reserved.add(r.name);

  const map = new Map<string, string>();
  let next = 1;
  for (const r of s.refs) {
    if (!numeric(r.name) || map.has(r.name)) continue;
    while (reserved.has(String(next))) next++;
    map.set(r.name, String(next));
    next++;
  }
  // Every occurrence is rewritten from positions taken before any of it moved,
  // applied last-first, so a name that swaps with another cannot collide with
  // the half-rewritten document.
  // `nameFrom..nameTo` spans the *literal*, quotes included, so the replacement
  // has to put them back: written bare, `#הערה_בשם("3")` became
  // `#הערה_בשם(1)` — an integer argument where the prelude expects a string, and
  // the writer's own source silently reshaped by a tidy-up.
  const quoted = (x: { nameFrom: number; nameTo: number }, n: string) =>
    text[x.nameFrom] === '"' ? `"${n}"` : n;
  const edits = [...s.refs, ...s.defs]
    .filter((x) => map.get(x.name) !== undefined && map.get(x.name) !== x.name)
    .map((x) => ({
      from: x.nameFrom,
      to: x.nameTo,
      insert: quoted(x, map.get(x.name) as string),
    }))
    .sort((a, b) => b.from - a.from);
  let out = text;
  for (const e of edits) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  return out;
}

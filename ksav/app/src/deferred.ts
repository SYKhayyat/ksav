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

import { commentRegions } from "./brackets";
import { NOTE_BODY_COMMANDS } from "./note-commands";

// ---------------------------------------------------------------- the commands

/** `#הערה_בשם(…)` — a marker whose body is defined elsewhere. */
const REF_NAMES = ["הערה_בשם", "note_named"];
/** `#גוף_הערה(שם)[…]` — the body of a deferred note. */
const DEF_NAMES = ["גוף_הערה", "note_body"];
/** `#גופי_הערות[…]` — the optional region the bodies are filed in. */
const REGION_NAMES = ["גופי_הערות", "note_bodies"];

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
const DEFAULT_KIND = "הערה";

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
}

export interface Scan {
  refs: Ref[];
  defs: Def[];
  /** The `#גופי_הערות[…]` region, when the document has one. */
  region: { from: number; to: number; innerFrom: number; innerTo: number } | null;
}

/** Positions inside a comment, so a scanner can skip them in one pass. */
function inComment(text: string): (pos: number) => boolean {
  const regions = commentRegions(text);
  return (pos) => regions.some((r) => pos >= r.from && pos < r.to);
}

/**
 * The end of the group opened at `at` (the index of the opener), or null.
 *
 * Deliberately blind to string literals, matching `brackets.ts` and the
 * highlighter: Hebrew abbreviations are written with gershayim — רש"י, שו"ע —
 * so treating `"` as a delimiter here would swallow everything between two
 * unrelated abbreviations. The cost is an unbalanced bracket inside a genuine
 * Typst string, which is far rarer than an abbreviation.
 */
function matchGroup(text: string, at: number): number | null {
  const open = text[at];
  const close = open === "(" ? ")" : open === "[" ? "]" : "}";
  let depth = 1;
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

/** Skip spaces and tabs (not newlines: a call's groups sit on its own line). */
function skipSpace(text: string, i: number): number {
  while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
  return i;
}

/**
 * Split an argument list at top-level commas.
 *
 * Quotes count only where a *value* starts — right after `(`, `,` or `:` — so a
 * gershayim in prose (`עיין רש"י`) cannot swallow the rest of the list, while
 * `#הערה_בשם("א, ב")` still reads as one argument.
 */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let valueStart = true;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"' && valueStart) {
      let j = i + 1;
      while (j < inner.length && inner[j] !== '"') j += inner[j] === "\\" ? 2 : 1;
      i = j;
      valueStart = false;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(inner.slice(start, i));
      start = i + 1;
      valueStart = true;
      continue;
    }
    if (!/\s/.test(c)) valueStart = c === ":";
  }
  const last = inner.slice(start);
  if (last.trim() !== "" || out.length) out.push(last);
  return out;
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
    });
  }

  for (const start of callsOf(text, DEF_NAMES, isComment)) {
    let j = start + 1;
    while (j < text.length && NAME_CH.test(text[j])) j++;
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
 * Where a new body belongs, and what has to be typed around it.
 *
 * Three cases, in the order a document is likely to be in: a `#גופי_הערות[…]`
 * region if the writer made one, otherwise straight after the last body, and
 * otherwise a fresh block at the end of the document.
 */
export function fileNewBody(text: string, entry: string): { text: string; at: number } {
  const s = scan(text);
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

/** `#גוף_הערה("name")[body]` */
function definitionText(name: string, body: string): string {
  return `#גוף_הערה("${name}")[${body}]`;
}

/** `#הערה_בשם("name", סוג: kind, rest)` */
function referenceText(name: string, kind: string | null, rest: string): string {
  const args = [`"${name}"`];
  if (kind && kind !== DEFAULT_KIND) args.push(`סוג: ${kind}`);
  if (rest) args.push(rest);
  return `#הערה_בשם(${args.join(", ")})`;
}

/**
 * Write the missing body for a marker, and put the caret in it.
 *
 * This is the create half of the jump: pressing the key on a marker that has no
 * prose yet does not report an error, it writes the line and takes you there.
 */
export function createBody(text: string, name: string): Change {
  const { text: out, at } = fileNewBody(text, definitionText(name, ""));
  // Inside the body brackets: `#גוף_הערה("name")[` is the prefix.
  return { text: out, caret: at + definitionText(name, "").length - 1 };
}

/** Insert a fresh deferred note at `pos`: a marker here, its body at the end. */
export function insertDeferred(text: string, pos: number, kind: string | null = null): Change {
  const name = nextName(text);
  const marker = referenceText(name, kind, "");
  const withMarker = text.slice(0, pos) + marker + text.slice(pos);
  const { text: out, at } = fileNewBody(withMarker, definitionText(name, ""));
  return { text: out, caret: at + definitionText(name, "").length - 1 };
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
  const kind = cmd === DEFAULT_KIND || cmd === "fnote" ? null : cmd;
  return {
    marker: referenceText(name, kind, args),
    body: `#גוף_הערה("${name}")[${inner}|]`,
  };
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
export function deferInlineNote(text: string, pos: number): Change | null {
  const note = inlineNoteAt(text, pos);
  if (!note) return null;
  const name = nextName(text);
  const body = text.slice(note.bodyFrom, note.bodyTo);
  const kind = note.cmd === DEFAULT_KIND || note.cmd === "fnote" ? null : note.cmd;
  const marker = referenceText(name, kind, note.args);
  const withMarker = text.slice(0, note.from) + marker + text.slice(note.to);
  const { text: out } = fileNewBody(withMarker, definitionText(name, body));
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
  const cmd = ref.kind ?? DEFAULT_KIND;
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
    const cmd = r.kind ?? DEFAULT_KIND;
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
export function deferAllInlineNotes(text: string): { text: string; moved: number } {
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

  const bodies: string[] = [];
  let out = "";
  let cursor = 0;
  for (const s of top.sort((a, b) => a.from - b.from)) {
    const name = nameFor();
    const kind = s.cmd === DEFAULT_KIND || s.cmd === "fnote" ? null : s.cmd;
    out += text.slice(cursor, s.from) + referenceText(name, kind, s.args);
    cursor = s.to;
    bodies.push(definitionText(name, s.body));
  }
  out += text.slice(cursor);

  for (const b of bodies) out = fileNewBody(out, b).text;
  return { text: out, moved: top.length };
}

// Review tools: tracked changes and editorial comments.
//
// Anyone editing someone else's kisvei yad has the same problem — they need to
// show what they changed rather than change it silently, and the author needs to
// go through those changes one at a time and say yes or no. Word calls this
// tracked changes; a manuscript editor calls it the whole job.
//
// The marks are ordinary Ksav commands (`#הוספה`, `#מחיקה`, `#הערת_עורך`), so
// they travel in the file, render through the engine, and survive every export.
// What lives here is the other half: reading them back out of the source, and
// **accepting or rejecting one** — which is an edit to the document, not a
// rendering option. A decision that only changed the view would be lost the
// moment the file was reopened.
//
//   accept an insertion  → unwrap it   (the text stays, the mark goes)
//   reject an insertion  → delete it   (it was never the author's text)
//   accept a deletion    → delete it   (the author agreed it should go)
//   reject a deletion    → unwrap it   (the text stays after all)
//   resolve a comment    → delete it   (a comment is never part of the text)

import { scanCommands } from "./ksav-lang";

export type MarkKind = "insert" | "delete" | "comment";
export type Decision = "accept" | "reject";

const KIND_OF: Record<string, MarkKind> = {
  הוספה: "insert",
  inserted: "insert",
  מחיקה: "delete",
  deleted: "delete",
  הערת_עורך: "comment",
  comment_: "comment",
};

export interface ReviewMark {
  kind: MarkKind;
  /** Byte range of the whole `#command(…)[…]` call. */
  from: number;
  to: number;
  /** The marked-up text itself (the `[…]` body). */
  body: string;
  /** Who made the mark, from `מאת: "…"`, if they said. */
  author: string | null;
}

/** Every review mark in the document, in document order (nested ones included). */
export function scanMarks(doc: string): ReviewMark[] {
  const out: ReviewMark[] = [];
  for (const s of scanCommands(doc)) {
    const kind = KIND_OF[s.name];
    if (!kind || s.open == null || s.close == null) continue;
    const args = s.argOpen != null && s.argClose != null ? doc.slice(s.argOpen, s.argClose + 1) : "";
    const author = /(?:מאת|by)\s*:\s*"((?:[^"\\]|\\.)*)"/u.exec(args)?.[1] ?? null;
    out.push({
      kind,
      from: s.cmdStart,
      to: s.close + 1,
      body: doc.slice(s.open + 1, s.close),
      author: author ? author.replace(/\\(.)/g, "$1") : null,
    });
  }
  return out;
}

/** Does deciding `decision` on a mark of this kind keep the text or remove it? */
function keepsText(kind: MarkKind, decision: Decision): boolean {
  if (kind === "comment") return false; // a comment is never part of the text
  return (kind === "insert") === (decision === "accept");
}

/** Apply one decision, returning the new document text. */
export function decide(doc: string, mark: ReviewMark, decision: Decision): string {
  const replacement = keepsText(mark.kind, decision) ? mark.body : "";
  return doc.slice(0, mark.from) + replacement + doc.slice(mark.to);
}

/** Marks that no other mark encloses — the ones it is safe to rewrite at once. */
function outermost(marks: ReviewMark[]): ReviewMark[] {
  return marks.filter((m) => !marks.some((o) => o !== m && o.from <= m.from && o.to >= m.to));
}

/**
 * Decide every mark in the document.
 *
 * Marks nest (a comment on a deleted phrase, an insertion inside a deletion), so
 * this rewrites only the outermost ones — whose ranges cannot overlap — from the
 * end backwards, then goes round again for whatever a kept body brought back to
 * the surface. Rewriting a nested pair in one pass would apply one edit to
 * offsets the other had already moved.
 */
export function decideAll(doc: string, decision: Decision, kinds?: MarkKind[]): string {
  let text = doc;
  for (let pass = 0; pass < 64; pass++) {
    const all = scanMarks(text).filter((m) => !kinds || kinds.includes(m.kind));
    if (!all.length) return text;
    // Only the outermost of the *matching* marks, but nesting is judged against
    // every mark: an insertion inside a deletion must wait for the deletion.
    const everything = scanMarks(text);
    const ready = outermost(everything).filter((m) => all.some((a) => a.from === m.from && a.to === m.to));
    if (!ready.length) return text; // all remaining are nested in unmatched marks
    for (const m of [...ready].sort((a, b) => b.from - a.from)) {
      text = decide(text, m, decision);
    }
  }
  return text;
}

/** A one-line preview of a mark's text for the review list. */
export function excerpt(body: string, max = 60): string {
  const flat = body.replace(/#[A-Za-z֐-׿_][\w֐-׿]*(\([^()]*\))?/gu, " ")
    .replace(/[[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

// ---------------------------------------------------------------- the view
//
// How the document *reads* — markup, as-if-accepted, as-it-was — is a rendering
// option and belongs in the document, so it survives a reload and travels with
// the file. It is written as the `#הגדרות_סקירה` command the engine already
// reads; `styles.ts` does the reading and writing of such commands.

export type ReviewView = "markup" | "final" | "original";

/** The Typst string each view is written as. */
export const VIEW_VALUE: Record<ReviewView, string> = {
  markup: "סימון",
  final: "סופי",
  original: "מקורי",
};

export function viewFromValue(v: string | null): ReviewView {
  for (const [k, val] of Object.entries(VIEW_VALUE)) if (val === v) return k as ReviewView;
  return "markup";
}

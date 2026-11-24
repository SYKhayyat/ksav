// ---------------------------------------------------------- a range as a document
// The single-range box's core: an editor whose document is one range of the
// primary — a note's body, the body, the file — and the two translations that
// keep them one text.
// Owns: mapping the range through the primary's changes, forwarding the box's
// own edits to the primary, and saying when the range is gone.
// Defers: drawing, keys and history. `decisions/2026-11-23-frontends-are-
// views-in-boxes.md` §4: a box carries no history of its own — its edits are
// the primary's, so one Ctrl+Z serves every box.
// Refuses: guessing. A range deleted from outside (the writer deletes a marker
// whose note is open in a box) is reported `gone`, and the box closes; it never
// tries to apply a change of the wrong length, which is the `wrong length`
// throw the record names.
//
// The range follows the primary the way a selection does: a change wholly
// outside it moves it, a change wholly inside it is the box's change too,
// shifted by the range's start. A change at an edge is inside (typing at the
// start of a note's body belongs to the note). A change that straddles an edge
// without swallowing the range resets the box's text to the new slice — rare,
// and right rather than clever.

import { ChangeSet, type ChangeSpec, type Text } from "@codemirror/state";
import { notesIn, type NoteSpan } from "./notes";

export interface Range {
  readonly from: number;
  readonly to: number;
}

/** What the box must do after a primary change. */
export type Follow =
  | { kind: "moved"; range: Range; changes: ChangeSet }
  | { kind: "reset"; range: Range; text: string }
  | { kind: "gone" };

/**
 * Carry `range` of a primary document through `changes` (made to it), and give
 * the box's own changes, in the box's coordinates.
 */
export function follow(range: Range, changes: ChangeSet, after: Text): Follow {
  const { from, to } = range;
  const local: { from: number; to: number; insert: Text }[] = [];
  let gone = false;
  let straddles = false;
  changes.iterChanges((fA, tA, _fB, _tB, inserted) => {
    // Outside, including a change that only touches an edge from outside.
    if (tA < from || fA > to || (tA === from && fA < from) || (fA === to && tA > to)) return;
    if (fA >= from && tA <= to) {
      local.push({ from: fA - from, to: tA - from, insert: inserted });
      return;
    }
    // The change covers an edge. Swallowing both edges is the range deleted.
    if (fA <= from && tA >= to) gone = true;
    else straddles = true;
  });
  if (gone) return { kind: "gone" };
  const next = { from: changes.mapPos(from, -1), to: changes.mapPos(to, 1) };
  if (straddles) return { kind: "reset", range: next, text: after.sliceString(next.from, next.to) };
  return { kind: "moved", range: next, changes: ChangeSet.of(local, to - from) };
}

/** The box's own change, as a change to the primary. */
export function forward(range: Range, changes: ChangeSet): ChangeSpec[] {
  const out: ChangeSpec[] = [];
  changes.iterChanges((fA, tA, _fB, _tB, inserted) => {
    out.push({ from: fA + range.from, to: tA + range.from, insert: inserted });
  });
  return out;
}

// ---------------------------------------------------------- pins
// §1, note identity: a box pinned to one note writes a stable id into *that
// note's* source, as a hidden argument the template takes and ignores
// (`מזהה:` on `#הערה` and `#הערה_בדרגה`). Unpinned notes carry none. A pin
// whose id is gone finds nothing, and the box says "this note is gone".

/** The source with `id` written into the note's head, or null if it cannot carry one. */
export function pinNote(doc: string, note: NoteSpan, id: string): string | null {
  if (!note.hasBody || note.bodyFrom <= note.from) return null;
  const head = doc.slice(note.from, note.bodyFrom);
  const arg = `מזהה: "${id}"`;
  if (head.endsWith("()[")) return doc.slice(0, note.bodyFrom - 2) + arg + doc.slice(note.bodyFrom - 2);
  if (head.endsWith(")[")) return doc.slice(0, note.bodyFrom - 2) + `, ${arg}` + doc.slice(note.bodyFrom - 2);
  if (head.endsWith("[") && !head.includes("(")) return doc.slice(0, note.bodyFrom - 1) + `(${arg})` + doc.slice(note.bodyFrom - 1);
  return null;
}

/** The note pinned with `id`, or null: never a guess. */
export function pinnedNote(doc: string, id: string): NoteSpan | null {
  const arg = `מזהה: "${id}"`;
  return notesIn(doc).find((n) => n.hasBody && doc.slice(n.from, n.bodyFrom).includes(arg)) ?? null;
}

/** A fresh id: short, and not already in the document. */
export function freshId(doc: string, rand: () => number = Math.random): string {
  for (;;) {
    const id = "n" + Math.floor(rand() * 0xfffff).toString(16).padStart(5, "0");
    if (!doc.includes(`"${id}"`)) return id;
  }
}

// ---------------------------------------------------------- deleting a note
// Backspace and Delete onto a note's marker, in the writer.
// Owns: the `noteDelete` setting's two behaviours.
// Defers: what a note is, and how one is taken out whole, to `notes`.
// Refuses: deleting half a note. `decisions/2026-11-23-frontends-are-views-in-
// boxes.md` §2 — in the writer a marker is atomic, and the owner left what a
// keystroke onto one does to the writer:
//
// - `twoStep` (default): the first Backspace/Delete *selects* the marker and
//   says the note's first words; the second deletes marker and body together.
// - `immediate`: one keystroke removes both.
//
// Either way it is one change, so one undo brings the note back whole.

import type { EditorView, KeyBinding } from "@codemirror/view";
import { deleteNote, notesIn, type NoteSpan } from "./notes";
import { docTextOf, plainText, scan } from "./spans";

type NoteDelete = "twoStep" | "immediate";

/** The note whose marker the caret would delete into, or the selected marker. */
function noteAt(doc: string, from: number, to: number, forward: boolean): NoteSpan | null {
  const notes = notesIn(doc);
  if (from !== to) return notes.find((n) => n.from === from && n.to === to) ?? null;
  return notes.find((n) => (forward ? n.from === from : n.to === from)) ?? null;
}

/** The one change that turns `a` into `b`: their common ends kept. */
export function changeBetween(a: string, b: string): { from: number; to: number; insert: string } {
  let p = 0;
  const room = Math.min(a.length, b.length);
  while (p < room && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let q = 0;
  while (q < room - p && a.charCodeAt(a.length - 1 - q) === b.charCodeAt(b.length - 1 - q)) q++;
  return { from: p, to: a.length - q, insert: b.slice(p, b.length - q) };
}

/** The first words of a note, for the hint a first keystroke shows. */
function firstWords(note: NoteSpan, n = 5): string {
  const words = plainText(note.text).split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
}

/**
 * Backspace (`forward` false) or Delete onto a marker. False when the caret
 * is not at one, so the ordinary key runs.
 */
export function deleteIntoNote(view: EditorView, forward: boolean, mode: NoteDelete, hint: (words: string) => void): boolean {
  const sel = view.state.selection.main;
  const doc = docTextOf(view.state.doc);
  const note = noteAt(doc, sel.from, sel.to, forward);
  if (!note) return sel.empty ? unwrapAt(view, doc, sel.head, forward) : false;
  if (mode === "twoStep" && sel.empty) {
    view.dispatch({ selection: { anchor: note.from, head: note.to }, scrollIntoView: true });
    hint(firstWords(note));
    return true;
  }
  const { text, caret } = deleteNote(doc, note);
  view.dispatch({ changes: changeBetween(doc, text), selection: { anchor: caret }, userEvent: "delete.note" });
  return true;
}

/**
 * The edge of a formatting command, as one key in the writer meets it.
 *
 * The writer hides `#הדגשה[` and `]` and keeps the words between them as
 * text, so the next character a Backspace after `]` would take is markup the
 * writer cannot see. Taking that one character leaves `#הדגשה[חשוב סוף…`, a
 * command that now swallows the rest of the paragraph. So a key on an edge
 * takes off *both* edges and keeps the words: the formatting is unwrapped,
 * which is what Backspace over the end of bold text means in a word processor.
 * A note's edge is never unwrapped, because its body is a different flow. The
 * key is held there and does nothing.
 */
export function unwrapRange(doc: string, pos: number, forward: boolean): { text: string; caret: number } | "hold" | null {
  let best: { from: number; to: number; body: { from: number; to: number } } | null = null;
  for (const n of scan(doc).nodes) {
    if (!n.hash || n.bodies?.length !== 1) continue;
    const b = n.bodies[0];
    const onHead = forward ? n.from <= pos && pos < b.from : n.from < pos && pos <= b.from;
    const onTail = forward ? b.to <= pos && pos < n.to : b.to < pos && pos <= n.to;
    if ((onHead || onTail) && (!best || n.from >= best.from)) best = { from: n.from, to: n.to, body: b };
  }
  if (!best) return null;
  if (notesIn(doc).some((n) => n.from === best.from)) return "hold";
  const { from, to, body } = best;
  const head = body.from - from;
  const atTail = forward ? body.to <= pos : body.to < pos;
  return {
    text: doc.slice(0, from) + doc.slice(body.from, body.to) + doc.slice(to),
    caret: atTail ? body.to - head : from,
  };
}

function unwrapAt(view: EditorView, doc: string, pos: number, forward: boolean): boolean {
  const r = unwrapRange(doc, pos, forward);
  if (r === null) return false;
  if (r === "hold") return true;
  view.dispatch({ changes: changeBetween(doc, r.text), selection: { anchor: r.caret }, userEvent: "delete.unwrap" });
  return true;
}

/** The writer's two keys, reading the setting when pressed. */
export function noteDeleteKeys(mode: () => NoteDelete, hint: (words: string) => void): KeyBinding[] {
  return [
    { key: "Backspace", run: (v) => deleteIntoNote(v, false, mode(), hint) },
    { key: "Delete", run: (v) => deleteIntoNote(v, true, mode(), hint) },
  ];
}

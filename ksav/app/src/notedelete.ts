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
import { docTextOf, plainText } from "./spans";

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
  if (!note) return false;
  if (mode === "twoStep" && sel.empty) {
    view.dispatch({ selection: { anchor: note.from, head: note.to }, scrollIntoView: true });
    hint(firstWords(note));
    return true;
  }
  const { text, caret } = deleteNote(doc, note);
  view.dispatch({ changes: changeBetween(doc, text), selection: { anchor: caret }, userEvent: "delete.note" });
  return true;
}

/** The writer's two keys, reading the setting when pressed. */
export function noteDeleteKeys(mode: () => NoteDelete, hint: (words: string) => void): KeyBinding[] {
  return [
    { key: "Backspace", run: (v) => deleteIntoNote(v, false, mode(), hint) },
    { key: "Delete", run: (v) => deleteIntoNote(v, true, mode(), hint) },
  ];
}

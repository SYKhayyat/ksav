// Which documents are open, as distinct from which documents exist.
//
// # The missing concept
//
// Seven separate complaints in the marked-up UI inventory turned out to be one
// idea that was not in the program:
//
//   - a document has a title *and* a filename and nothing explains the difference
//   - there is no way to have two documents open
//   - "new document" made the open document disappear
//   - undo after that restored the previous document's text into the new one
//   - reopening a document brought it back in prose mode
//   - reopening it brought the preview back left-to-right
//   - several views of one document is not possible at all
//
// None of those is a bug in the ordinary sense. **The application had no concept
// of an open document distinct from the document**, and each item is that one
// absence showing through somewhere different.
//
// Three things were one thing. They separate as:
//
//   **Document** — content and identity. Lives in the library (`docs.ts`). Owns
//   its title, its page setup, its direction, and its binding to a file on disk.
//
//   **The open set** — this module. Which documents are open, globally. One text
//   per document, one undo history per document, one caret per document. A
//   document is never open twice, so nothing can fork.
//
//   **Pane** — a view showing a document in a role. Later work; the open set is
//   staged first so that building panes does not require rewriting it.
//
// # Why an `EditorState` and not a string
//
// The application has one `EditorView`, and used to switch documents by
// dispatching a text edit into it — which is what let Ctrl+Z pour one document's
// body into another (see `runtime.swapDocument`, and the record of 12 August).
//
// CodeMirror's own answer is that a document *is* an `EditorState`: text,
// selection and undo history in one immutable value. Keeping one per open
// document and calling `view.setState` on a switch gets all three of those
// per-document for free, and gets them right rather than approximately — there
// is no stack to reset because there was never one stack.
//
// What a state does **not** carry is anything the *view* owns: scroll position,
// and which of the two view modes the pane is in. Those are here beside it,
// which is also where a pane will want them.
//
// # Order
//
// Most recently focused first. That is the order the switcher wants — the
// keyboard route to "the document I was just in" is the one thing a strip of
// tabs cannot express — and it is the order this module keeps, rather than a
// creation order somebody else has to re-sort.

import type { EditorState } from "@codemirror/state";

/** One document, open. */
export interface OpenDoc {
  id: string;
  /**
   * Its text, its caret and its undo history.
   *
   * Replaced wholesale on every switch away, because the live state is the
   * view's and this is the copy that survives while another document is on
   * screen.
   */
  state: EditorState;
  /** Where the source was scrolled to. Not in the state; the view owns it. */
  scrollTop: number;
  /**
   * Prose or raw, for this document.
   *
   * Per document rather than per application, which is the fix for *"I closed
   * this document and reopened it, and it went into prose mode"*. A writer
   * marking up somebody else's source and a writer composing a sefer want
   * opposite answers, and they may well be holding both at once.
   */
  prose: boolean;
}

/**
 * The open documents, most recently focused first.
 *
 * An array and not a `Map`, because order is a property this collection has and
 * a `Map`'s insertion order is not the order anybody wants: focusing a document
 * has to move it, and re-inserting into a `Map` to reorder is a worse spelling
 * of `unshift`.
 */
let open: OpenDoc[] = [];

/** The document on screen, or null before anything has been opened. */
let focused: string | null = null;

/** Every open document, most recently focused first. */
export function openDocs(): OpenDoc[] {
  return open;
}

/** The id of the document on screen. */
export function focusedId(): string | null {
  return focused;
}

/** Whether this document is open — as opposed to merely existing. */
export function isOpen(id: string): boolean {
  return open.some((d) => d.id === id);
}

/** The open record for a document, if it is open. */
export function opened(id: string): OpenDoc | undefined {
  return open.find((d) => d.id === id);
}

/** How many documents are open. */
export function count(): number {
  return open.length;
}

/**
 * Put a document in the open set, or replace what is held for one already in it.
 *
 * Does **not** focus it: opening in the background is a real thing to want (the
 * switcher, a link into another chapter) and conflating the two would make
 * "open" and "look at" the same verb, which is the conflation this module
 * exists to undo.
 */
export function put(doc: OpenDoc): void {
  const at = open.findIndex((d) => d.id === doc.id);
  if (at >= 0) open[at] = doc;
  else open.push(doc);
}

/**
 * Record what the view currently holds for the focused document.
 *
 * Called just before switching away. Split from [`focus`] rather than folded
 * into it because the caller is the only thing that can read the view, and a
 * module that reached for the view would be a module that could not be tested
 * without one.
 */
export function stash(id: string, state: EditorState, scrollTop: number): void {
  const doc = opened(id);
  if (!doc) return;
  doc.state = state;
  doc.scrollTop = scrollTop;
}

/**
 * Make a document the focused one, and move it to the front.
 *
 * Returns what the caller should put in the view, or undefined if the document
 * is not open — which is a caller's mistake and not something to paper over by
 * opening it silently.
 */
export function focus(id: string): OpenDoc | undefined {
  const at = open.findIndex((d) => d.id === id);
  if (at < 0) return undefined;
  const [doc] = open.splice(at, 1);
  open.unshift(doc);
  focused = id;
  return doc;
}

/**
 * Close a document — the arrangement, never the document itself.
 *
 * Returns the id that should be focused next, or null when nothing is left. The
 * *next* is the one after it in most-recently-used order, which is the document
 * the writer was in before this one: closing a document and landing in the one
 * you came from is what every editor does and the only choice that does not feel
 * arbitrary.
 *
 * **This deletes nothing.** The document stays in the library, and the control
 * that closes must never wear the same glyph as the control that deletes — the
 * Documents menu's `×` deletes, and two strips with the same mark meaning
 * "forget this for now" and "destroy this forever" is not a survivable interface.
 */
export function close(id: string): string | null {
  const at = open.findIndex((d) => d.id === id);
  if (at < 0) return focused;
  open.splice(at, 1);
  if (focused !== id) return focused;
  focused = open.length ? open[0].id : null;
  return focused;
}

/**
 * The document to switch to for a "previous document" key.
 *
 * The second entry, not the first: the first is the one already on screen. With
 * one document open there is nowhere to go and the answer is null rather than
 * the document you are looking at, so the key does nothing visible instead of
 * flashing the chrome.
 */
export function previous(): string | null {
  return open.length > 1 ? open[1].id : null;
}

/** Forget everything. For tests, and for a store that had to be rebuilt. */
export function reset(): void {
  open = [];
  focused = null;
}

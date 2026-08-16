// Where each pane was standing in each document.
//
// # The gap this fills
//
// The open set holds one `EditorState` per document — its text, its undo
// history, and one caret. That is right for the first two and one short of
// right for the third: a window with three source panes onto one sefer has
// three places in it, and switching to another document and back put all three
// at the same one. `showInEveryPane` said so in a comment, because the fix did
// not belong in that function:
//
//   > What is *not* preserved is where each pane was standing in the document
//   > being returned to — every pane comes back to the focused pane's caret.
//
// A pane holding the sugya you were comparing against is the entire reason to
// open a second pane, and losing it on every document switch makes the second
// pane something you rebuild by hand each time.
//
// # Why a third table, and not a field on either of the two that exist
//
// **Not on `Leaf`.** The pane tree is rebuilt by structural sharing, and the
// renderer decides which editors it may leave alone by comparing leaves with
// `===` (see `panes.ts`). Hanging a growing per-document map on a leaf would
// mean every caret move rebuilds that leaf — and a rebuilt leaf is a rebuilt
// `EditorView`, which throws away the caret, the scroll and the folds of the
// pane whose caret moved. The cure would be the disease.
//
// **Not on `OpenDoc`.** The open set is deliberately pane-free: it is which
// documents are open *globally*, and a document that knew about panes would
// have to be told when one is closed, when a tab is switched, and when an
// arrangement is replaced.
//
// So: a table keyed by both, owned by neither, pure and testable. It holds no
// text — a place is three numbers — and it is a cache in the strict sense that
// losing it is a worse experience and never a wrong document.
//
// # What is *not* here
//
// The fold state, and the narrowing anchor. Folds are the view's and are lost
// on a rebuild already; narrowing is stored in the document's state, so it
// rides with the document by design and every pane showing that document is
// narrowed together. Both are deliberate omissions rather than oversights, and
// both would be a bigger change than a caret.

/** Where a pane was in a document: a selection, and how far it was scrolled. */
export interface Place {
  anchor: number;
  head: number;
  scrollTop: number;
}

/**
 * pane id → document id → place.
 *
 * A `Map` of `Map`s rather than a composite `"pane\0doc"` key, because both
 * halves have to be forgettable on their own: a pane closes, a document closes,
 * and each has to take exactly its own rows with it.
 */
const places = new Map<string, Map<string, Place>>();

/** Remember where PANE is standing in DOC. */
export function remember(pane: string, doc: string, place: Place): void {
  let byDoc = places.get(pane);
  if (!byDoc) places.set(pane, (byDoc = new Map()));
  byDoc.set(doc, place);
}

/**
 * Where PANE was standing in DOC, if it has ever been there.
 *
 * `undefined` is a real answer and the caller must not invent one: a pane that
 * has never shown this document should open at the document's own caret — where
 * the writer last was in it — and not at the top, and not at wherever some
 * other pane happens to be.
 */
export function recall(pane: string, doc: string): Place | undefined {
  return places.get(pane)?.get(doc);
}

/**
 * A place, with its positions brought inside a document of LENGTH.
 *
 * The document can have been edited from another pane, another tab, or by an
 * import, while this pane was showing something else — so a remembered offset
 * is a claim about a text that may no longer be that long. Clamped rather than
 * discarded: the top of a document is a worse answer than the end of it, and
 * both are better than a range CodeMirror refuses.
 */
export function within(place: Place, length: number): Place {
  const clamp = (n: number) => Math.max(0, Math.min(length, n));
  return { anchor: clamp(place.anchor), head: clamp(place.head), scrollTop: Math.max(0, place.scrollTop) };
}

/** Forget a pane — it has been closed, or its arrangement replaced. */
export function forgetPane(pane: string): void {
  places.delete(pane);
}

/**
 * Forget a document, everywhere.
 *
 * Called when a document is closed rather than when it is deleted, and those
 * are the same answer here: a document that is not open has no pane standing in
 * it, and one that is reopened is opened fresh at its own caret. Keeping the
 * rows would mean a pane returning to a place in a sefer it was last in three
 * sessions ago, measured against a text that has been edited since.
 */
export function forgetDoc(doc: string): void {
  for (const byDoc of places.values()) byDoc.delete(doc);
}

/**
 * Every pane this table has a place for.
 *
 * So that closed panes can be swept rather than each way of closing one having
 * to remember to say so: a pane goes when it is closed, when the arrangement is
 * replaced, and when a tab is closed, and only the first of those looks like
 * closing a pane.
 */
export function panesKnown(): string[] {
  return [...places.keys()];
}

/** Every pane that remembers a place in DOC. For tests, and for counting. */
export function panesRemembering(doc: string): string[] {
  const out: string[] = [];
  for (const [pane, byDoc] of places) if (byDoc.has(doc)) out.push(pane);
  return out;
}

/** Forget everything. For tests, and for a window rebuilt from nothing. */
export function reset(): void {
  places.clear();
}

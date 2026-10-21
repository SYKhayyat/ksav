// The pane's editing lane: how a pane becomes a live editor, and how a change
// made in one pane reaches the others.
// Owns: the pane `EditorView` factory and its dispatch policy — the narrowed
// pushback, the primary hand-off, the caret carried back — the mirrored-change
// engine, and the narrow/widen commands on the focused pane.
// Defers: the tree, the focus flags and the views map to `panestate`; the
// head strips that hold the narrow chip to `panehost`.
// Refuses: reaching around `panestate`. It reads the flags and the views map
// only through the functions this module owns relationships with, and it
// hands nothing back — narrowing answers through the wiring object.

import { EditorView } from "@codemirror/view";
import { EditorState, Transaction } from "@codemirror/state";
import * as panestate from "./panestate";
import { narrowedTo, changeReachesOut, spanAt, insideSpan, setNarrow } from "./narrowing";
import { docTextOf } from "./spans";
import { t, tf } from "./i18n";
import { setStatus } from "./runtime";

/**
 * Put a change into every other source pane, without recording it again.
 *
 * `addToHistory.of(false)`, and that is the whole of "one undo history per
 * document": the primary has already recorded this edit, and a mirror that
 * recorded it too would build a second stack that diverges the moment anybody
 * undoes anything.
 */
function mirrorChange(from: EditorView, tr: Transaction) {
  if (!tr.docChanged || panestate.mirroring) return;
  panestate.setMirroring(true);
  try {
    for (const v of panestate.paneViewsAll()) {
      if (v === from) continue;
      v.dispatch({ changes: tr.changes, annotations: Transaction.addToHistory.of(false) });
    }
  } finally {
    panestate.setMirroring(false);
  }
}

/** One source pane's editor. */
export function makePaneView(host: HTMLElement, state: EditorState): EditorView {
  const view: EditorView = new EditorView({
    state,
    parent: host,
    dispatch: (tr) => {
      // A narrowed pane cannot edit outside its section, and **here** is the
      // only place that can be enforced.
      //
      // Not in a `transactionFilter` inside the state, which is where it
      // belongs by shape: every pane's state receives every change, mirrored
      // from the primary (see `mirrorChange`), so a filter there would refuse
      // the *other* panes' perfectly legal edits and leave this pane holding a
      // different document from everybody else. That is the document-eating bug
      // this whole model was built to prevent, reintroduced by a guard.
      //
      // `mirroring` and `forwarding` are what tell the three cases apart, and
      // all three arrive here as the same kind of transaction. Only a change
      // that is neither — one that started in *this* pane, under this writer's
      // hands — is this pane's to refuse. Refused before the forward below,
      // because once the primary has recorded it there is nothing left to
      // refuse; and skipped for a forward, or a narrowed primary would refuse
      // the edits of every other pane in the window.
      if (tr.docChanged && !panestate.mirroring && !panestate.forwarding) {
        const span = narrowedTo(view.state);
        if (span && changeReachesOut(span, tr.changes)) {
          setStatus(tf("narrowedRefused", panestate.titleOfSpan(span)), "warn");
          return;
        }
      }
      // A mirror that is typed into hands the change to the primary, so the
      // edit is recorded once. Everything that is not a document change —
      // moving the caret, folding, scrolling into view — stays local, because
      // those are exactly the things a pane owns.
      const primary = panestate.primaryView();
      if (tr.docChanged && !panestate.mirroring && !panestate.forwarding && primary && primary !== view) {
        const was = tr.annotation(Transaction.userEvent);
        panestate.setForwarding(true);
        try {
          primary.dispatch({
            changes: tr.changes,
            selection: tr.selection,
            ...(was ? { userEvent: was } : {}),
          });
        } finally {
          panestate.setForwarding(false);
        }
        // The caret comes back, and it has to be given back by hand.
        //
        // The change reaches this pane again through `mirrorChange`, which
        // sends a changeset and nothing else — so this pane's selection is
        // *mapped* through the insertion rather than placed after it, and a
        // cursor sitting exactly where text is inserted maps to before it. The
        // caret therefore did not move, and the next keystroke landed in front
        // of the last one: typing `ולד` into a second pane produced `דלו`.
        //
        // Every character, in reverse, in any pane but the first — since panes
        // were introduced. It survived because a mirrored pane is the one thing
        // a unit test on `panes.ts` cannot hold: the tree was right, the text
        // was right, and the order was decided by a selection nobody sent.
        if (tr.selection) {
          view.dispatch({ selection: tr.selection, annotations: Transaction.addToHistory.of(false) });
        }
        return;
      }
      view.update([tr]);
      mirrorChange(view, tr);
    },
  });
  return view;
}

/**
 * Lock the focused pane to the section the caret is in.
 *
 * The anchor and the caret move in one transaction. Two dispatches would put a
 * state on screen — narrowed, with the caret outside the accessible portion —
 * that this feature exists to make impossible, and it would be visible for a
 * frame every single time.
 */
export function narrowHere(v: EditorView): void {
  const at = v.state.selection.main.head;
  const span = spanAt(docTextOf(v.state.doc), at);
  // Above the first heading there is no section, and saying so is the answer.
  // "Narrow to the whole document" would be a narrowing that narrows nothing,
  // reported as success.
  if (!span) {
    setStatus(t("narrowNoSection"), "warn");
    return;
  }
  v.dispatch({ effects: setNarrow.of(span.anchor), selection: { anchor: insideSpan(span, at) } });
  setStatus(tf("narrowedTo", panestate.titleOfSpan(span)), "ok");
  panestate.paneWiring().refreshHeads();
  panestate.applyPreviewWindows();
}

/** Let it out again. */
export function widenHere(v: EditorView): void {
  if (!narrowedTo(v.state)) {
    setStatus(t("notNarrowed"));
    return;
  }
  v.dispatch({ effects: setNarrow.of(null) });
  setStatus(t("widened"), "ok");
  panestate.paneWiring().refreshHeads();
  panestate.applyPreviewWindows();
}

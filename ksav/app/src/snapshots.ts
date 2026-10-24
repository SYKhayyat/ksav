// Version history, scoped to a document: snapshots under the doc's own key.
//
// Owns: `takeSnapshot`, `restoreSnapshot`, the history modal's render
// (`renderHistory`), the list's scope label and its cost lines, and the
// history doors (`openHistory`, `closeHistory`).
// Defers: where the records are stored is `docs.ts`'s question and answered
// there; the small modal, the baseline refresh and the body swap arrive as
// the wiring object registered at boot.
// Refuses: a manifest of its own. The cost lines are measured off the same
// list the rows draw from, so the page cannot disagree with the store.

import { el } from "./dom";
import { makeWiring } from "./wiring";
import { t, tf } from "./i18n";
import * as runtime from "./runtime";
import * as docs from "./docs";
import { docTextOf } from "./spans";
import { setStatus } from "./runtime";
import { reportSaveFailure } from "./save";
import { settings } from "./settings";
import { voidAction } from "./asyncaction";
import { openPanel, closePanel, isPanelOpen } from "./panels";
import { drawList, LOOKS } from "./rowlists";
import { historyList } from "./panelrows";

// # The wiring
//
// Snapshotting reaches the document and history asks for two shell-held
// answers: the small modal, the baseline refresh, and the body swap. They
// arrive as one registered object, as the other wirings do — and like them,
// they answer for nothing before boot has registered it.

export interface SnapshotsWiring {
  /** The small modal's promise question. */
  confirm(message: string, opts?: { title?: string; okLabel?: string; danger?: boolean }): Promise<boolean>;
  /** Refresh the undo baseline after a snapshot lands. */
  refreshBaseline(): Promise<void>;
  /** Swap the editor's whole body (the restore). */
  loadBody(body: string): void;
}

const W = makeWiring<SnapshotsWiring>("wireSnapshots");
export const wireSnapshots = W.wire;
export const snapWiring = W.get;

// ---- version history (local snapshots) ----
//
// Scoped to a document. History used to be one `ksav.history` key holding
// `{t, body}` records with no document id in them, so the list shown while you
// were in document A was every snapshot ever taken of every document — and
// restoring one silently replaced A's text with B's, with no way back. There is
// nothing to filter on in a record that does not say what it belongs to, so the
// records now live under the document itself (see `docs.ts`).

export async function takeSnapshot(force = false): Promise<boolean> {
  if (!runtime.view || !runtime.currentDoc) return false;
  const body = docTextOf(runtime.view.state.doc);
  try {
    const stored = await docs.pushSnapshot(runtime.currentDoc.id, body);
    if (!stored && force) {
      // Nothing changed since the last snapshot: the point is already kept.
      setStatus(t("snapshotUnchanged"), "");
    }
    if (isPanelOpen("history-modal")) await renderHistory();
    if (stored) await snapWiring().refreshBaseline();
    return stored;
  } catch (e) {
    // History is a convenience, but a *failed* history write means the store is
    // in trouble, and the writer needs to know that before their text is next.
    reportSaveFailure(e);
    return false;
  }
}

export async function restoreSnapshot(s: docs.Snapshot) {
  if (!(await snapWiring().confirm(t("confirmRestore")))) return;
  await takeSnapshot(true); // snapshot current before restoring, so it's not lost
  snapWiring().loadBody(s.body);
  closeHistory();
}

export function openHistory() {
  openPanel("history-modal");
}
export function closeHistory() {
  closePanel("history-modal");
}

export async function renderHistory() {
  const host = document.getElementById("history-list");
  if (!host || !runtime.currentDoc) return;
  const snaps = await docs.snapshots(runtime.currentDoc.id);
  const scope = el("div", { class: "history-scope" }, [tf("historyOf", runtime.currentDoc.title)]);
  // The scope label and the cost/clear controls are owned by this caller, while
  // rows are owned by drawList. Remove the *whole* unmanaged footer before
  // reconciling; deleting only the first empty marker left old cost notes and
  // clear buttons behind on every refresh.
  host.querySelectorAll<HTMLElement>(".history-scope, .history-footer").forEach((node) => node.remove());
  drawList(host, historyList(snaps), LOOKS.history, snaps);
  // Say whose history this is: with one list per document, the title is the
  // thing that makes "restore" a safe button to press. Prepended after the fact
  // because `drawList` owns the list and this is not part of it.
  host.prepend(scope);
  // **What the history costs, and the way to stop paying it.**
  //
  // Nothing anywhere said. Snapshots hold whole document bodies rather than
  // diffs, so the biggest seforim — the ones whose history matters most — hit
  // the byte ceiling first and end up with the *fewest* restore points, and the
  // only evidence of that was restore points quietly not being there. The
  // number is measured off the same list the rows are drawn from, so it cannot
  // disagree with what is on screen.
  const cost = docs.historyCost(snaps);
  const limit = docs.historyLimits(settings);
  const clear = el("button", { class: "sc-key" }, [t("historyClear")]);
  clear.addEventListener("click", () => {
    if (!runtime.currentDoc) return;
    if (!confirm(t("historyClearConfirm"))) return;
    void docs.clearHistory(runtime.currentDoc.id).then(() => {
      setStatus(t("historyCleared"), "ok");
      voidAction("general", () => renderHistory());
    });
  });
  host.append(el("div", { class: "history-footer" }, [
    el("p", { class: "styles-note history-cost" }, [
      tf(
        "historyCost",
        String(cost.count),
        String(limit.count),
        (cost.bytes / (1024 * 1024)).toFixed(1),
        (limit.bytes / (1024 * 1024)).toFixed(1),
      ),
    ]),
    el("p", { class: "styles-note" }, [t("historyWholeBodies")]),
    clear,
  ]));
}

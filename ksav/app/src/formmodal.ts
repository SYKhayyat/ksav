// ---------------------------------------------------------------- a small form modal
//
// Two features below (section page setup, formulas) need the same thing: a few
// fields, then insert. `prompt()` can ask for one string and nothing more, and a
// second bespoke overlay for each would be two copies of the same fifty lines.
//
// This file refuses to answer for: what any one form puts in the modal (the
// feature's own module); which surfaces may close a panel and what escaping a
// modal means (`panels.ts` — the registry's close hook calls
// `settlePendingModals` from boot).

import { el } from "./dom";
import { t, tf } from "./i18n";
import { openPanel, closePanel, panelHead } from "./panels";

let modalOk: (() => void) | null = null;

export function openModal(
  title: string,
  lede: string,
  rows: (Node | string)[],
  onOk: () => void,
  // What the button says. It said *Insert* for every caller, which was true of
  // the two there were and false the moment a form *created* something.
  okLabel = t("insertAction"),
) {
  modalOk = onOk;
  const box = document.getElementById("form-modal-body")!;
  box.replaceChildren(
    panelHead("form-modal", { text: title }),
    el("p", { class: "styles-lede" }, [lede]),
    ...rows,
    el("div", { class: "modal-actions" }, [
      el("button", { class: "note-use", onClick: () => { const f = modalOk; closeModal(); f?.(); } }, [
        okLabel,
      ]),
      el("button", { class: "sc-key", onClick: closeModal }, [t("cancel")]),
    ]),
  );
  openPanel("form-modal");
}

export function closeModal() {
  closePanel("form-modal");
}

// A dismissal from *outside* the buttons — Escape, the backdrop, the ×. Held so
// the promise a pending `ask`/`askText` handed out still settles (to "no")
// when the writer leaves by one of those routes rather than by clicking a
// button. Cleared the moment either resolves, so a stale one never fires.
let modalDismiss: (() => void) | null = null;

/**
 * A confirmation, without freezing the renderer.
 *
 * The replacement for `window.confirm`, which blocks the whole renderer process
 * — timers stop, a compile result cannot be applied, the caret stops blinking —
 * and, on the desktop webviews, is not reliably implemented at all. This is the
 * app's own modal (`form-modal`, which already owns focus, a backdrop and the
 * Escape sweep through `panels.ts`), returning a promise instead. Escape, the
 * backdrop and the × all resolve to `false`.
 */
export function ask(message: string, opts: { title?: string; okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      modalDismiss = null;
      closeModal();
      resolve(v);
    };
    modalDismiss = () => done(false);
    const okBtn = el(
      "button",
      { class: opts.danger ? "note-use danger" : "note-use", onClick: () => done(true) },
      [opts.okLabel ?? t("ok")],
    );
    const box = document.getElementById("form-modal-body")!;
    box.replaceChildren(
      panelHead("form-modal", { text: opts.title ?? t("confirmTitle") }),
      el("p", { class: "styles-lede" }, [message]),
      el("div", { class: "modal-actions" }, [
        okBtn,
        el("button", { class: "sc-key", onClick: () => done(false) }, [t("cancel")]),
      ]),
    );
    openPanel("form-modal");
    okBtn.focus();
  });
}

/**
 * What to do with a whole document Girsa handed over.
 *
 * Three buttons, because there were always three outcomes and the modal had two
 * buttons. The old prompt asked *replace what is open?* and, on **No**, spliced
 * the entire handed-over document into the middle of the sefer at the caret —
 * which is a real and useful thing to want, and is not what No means anywhere
 * else in this application or in any other.
 *
 * Dismissing — Escape, the backdrop, the × — discards, because a reader who
 * leaves without choosing has not asked for their document to be edited. The
 * source is not lost by discarding it: the engine holds an arrival until the
 * poll that carries its id back, and `takeArrivals` acknowledges a discard
 * deliberately, so *discard* means discard rather than *ask me again in a
 * second*.
 */
export function askArrival(display: string): Promise<"replace" | "insert" | "discard"> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: "replace" | "insert" | "discard") => {
      if (settled) return;
      settled = true;
      modalDismiss = null;
      closeModal();
      resolve(v);
    };
    modalDismiss = () => done("discard");
    const replaceBtn = el(
      "button",
      { class: "note-use", onClick: () => done("replace") },
      [t("arrivalReplace")],
    );
    const box = document.getElementById("form-modal-body")!;
    box.replaceChildren(
      panelHead("form-modal", { text: t("confirmTitle") }),
      el("p", { class: "styles-lede" }, [tf("documentArrived", display)]),
      el("div", { class: "modal-actions" }, [
        replaceBtn,
        el("button", { class: "sc-key", onClick: () => done("insert") }, [t("arrivalInsert")]),
        el("button", { class: "sc-key", onClick: () => done("discard") }, [t("arrivalDiscard")]),
      ]),
    );
    openPanel("form-modal");
    replaceBtn.focus();
  });
}

/**
 * Ask for one line of text, without freezing the renderer — the replacement for
 * `window.prompt`. Resolves to the string on OK or Enter, and to `null` on any
 * dismissal, which is exactly `prompt`'s cancel contract.
 */
export function askText(
  message: string,
  initial = "",
  opts: { title?: string; okLabel?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      modalDismiss = null;
      closeModal();
      resolve(v);
    };
    modalDismiss = () => done(null);
    const input = el("input", { class: "set-input", type: "text" }) as HTMLInputElement;
    input.value = initial;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        done(input.value);
      }
    });
    const box = document.getElementById("form-modal-body")!;
    box.replaceChildren(
      panelHead("form-modal", { text: opts.title ?? t("confirmTitle") }),
      el("p", { class: "styles-lede" }, [message]),
      el("div", { class: "set-row" }, [input]),
      el("div", { class: "modal-actions" }, [
        el("button", { class: "note-use", onClick: () => done(input.value) }, [opts.okLabel ?? t("ok")]),
        el("button", { class: "sc-key", onClick: () => done(null) }, [t("cancel")]),
      ]),
    );
    openPanel("form-modal");
    input.focus();
    input.select();
  });
}
/** The panel registry's close hook: a pending `onOk` must never outlive the
 *  modal that showed it, and a promise a cancelled prompt handed out must
 *  settle to "no" rather than hang forever. */
export function settlePendingModals(): void {
  modalOk = null;
  const dismiss = modalDismiss;
  modalDismiss = null;
  dismiss?.();
}

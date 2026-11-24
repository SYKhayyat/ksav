// ------------------------------------------------------------- the mode line
// A box's header names what it shows: `scope · mode · link → leader`.
// Owns: the three clickable parts of a box's head, their menus, and the
// open-box picker (scope, then mode) — the window's `switch-to-buffer`.
// Defers: what may be combined to `views` (every refusal comes from there, with
// its reason); the tree and its links to `panes`; state to `panestate`; the
// floating menu to `panels`.
// Refuses: hiding a combination. `decisions/2026-11-23-frontends-are-views-in-
// boxes.md`: any scope with any mode, and what cannot work is **refused with a
// reason** — so a picker row that cannot be chosen is drawn disabled with the
// sentence that says why, never left out. Leaving it out is how a writer comes
// to believe a feature does not exist when it is one click from being built.

import * as panestate from "./panestate";
import * as panes from "./panes";
import * as views from "./views";
import type { Refusal, Scope, View } from "./views";
import { t, tf } from "./i18n";
import { el } from "./dom";
import { mountPanel, closePanel } from "./panels";
import { setStatus } from "./runtime";

/** What the head needs of the window that draws it. */
export interface ModeLineWiring {
  /** The link changed and nothing else did: redraw the heads, not the boxes. */
  relinked(): void;
}

/**
 * The scopes a picker offers, before the document's own series and saved
 * views join them (steps 5–9).
 *
 * The narrowed note scopes are listed although they are refused today: the
 * picker shows the whole grid, and each one is enabled where its step lands.
 */
export const SCOPES: readonly Scope[] = [
  { part: "file" },
  { part: "body" },
  { part: "notes" },
  { part: "notes", depth: 2 },
  { part: "notes", under: "caret" },
];

/** A refusal as a sentence. */
export const reason = (r: Refusal): string => tf(r.key, ...(r.args ?? []));

/** The pieces of a scope's name, each one re-localising on its own. */
function scopeParts(scope: Scope): HTMLElement[] {
  return views.scopeLabel(scope).map((p) =>
    el("span", {
      class: "ml-piece",
      "data-i18n": p.key,
      ...(p.args?.length ? { "data-i18n-args": JSON.stringify(p.args) } : {}),
    }, [reason(p)]),
  );
}

const modeName = (id: string) => views.modeOf(id)?.name ?? id;
const linkName = (id: string) => views.linkModeOf(id)?.name ?? id;

/**
 * The mode line of one box.
 *
 * Three buttons, and each opens the menu that changes its own part: the scope
 * and the mode re-draw the box (it now shows something else), the link only
 * re-draws the heads — **not `setTree`**, which rebuilds every editor in the
 * window and threw a reader on page 40 back to page 1 for touching a chip that
 * has nothing to do with where they are.
 */
export function modeLine(pane: panes.Leaf, wire: ModeLineWiring): HTMLElement {
  const v = pane.view;
  const lead = panes.leaderOf(panestate.paneTree, pane.id);
  const many = panes.leaves(panestate.paneTree).length > 1;
  const kids: Node[] = [
    el("button", {
      class: "ml-part ml-scope",
      "data-ml": "scope",
      onClick: (e: MouseEvent) => openScopeMenu(pane, e.currentTarget as HTMLElement),
    }, scopeParts(v.scope)),
    el("span", { class: "ml-sep" }, ["·"]),
    el("button", {
      class: "ml-part ml-mode",
      "data-ml": "mode",
      "data-i18n": modeName(v.mode),
      onClick: (e: MouseEvent) => openModeMenu(pane, e.currentTarget as HTMLElement),
    }, [t(modeName(v.mode))]),
  ];
  // The link is only offered when there is another box to link to: a link part
  // that can only ever say "unlinked" is a control with no other state.
  if (many) {
    kids.push(
      el("span", { class: "ml-sep" }, ["·"]),
      el("button", {
        class: "ml-part ml-link" + (lead ? " ml-linked" : ""),
        "data-ml": "link",
        "data-link": pane.link.mode,
        onClick: (e: MouseEvent) => openLinkMenu(pane, e.currentTarget as HTMLElement, wire),
      }, [
        el("span", { "data-i18n": linkName(lead ? pane.link.mode : "unlinked") }, [t(linkName(lead ? pane.link.mode : "unlinked"))]),
        ...(lead ? [el("span", { class: "ml-leader" }, [` → ${panestate.paneNumberOf(lead.id)}`])] : []),
      ]),
    );
  }
  return el("span", { class: "pane-name mode-line" }, kids);
}

// ---------------------------------------------------------------- the menus

/** One row of a menu: a choice, or a refusal drawn disabled with its reason. */
function row(label: (Node | string)[], refused: Refusal | null, attrs: Record<string, string>, pick: () => void, current = false): HTMLElement {
  return el("button", {
    class: "pal-item" + (current ? " is-current" : ""),
    ...attrs,
    ...(refused ? { disabled: "", "aria-disabled": "true", title: reason(refused) } : {}),
    onClick: () => {
      if (refused) return;
      closePanel("pane-menu");
      pick();
    },
  }, [el("b", {}, label), ...(refused ? [el("span", { class: "menu-desc" }, [reason(refused)])] : [])]);
}

/** A floating menu under `at`, clamped to the window. */
function float(rows: Node[], at: HTMLElement): void {
  const box = el("div", { class: "spell-menu pane-menu" }, rows);
  const anchor = at.getBoundingClientRect();
  box.style.visibility = "hidden";
  mountPanel("pane-menu", box, document.body);
  const size = box.getBoundingClientRect();
  const pad = 8;
  box.style.left = `${Math.max(pad, Math.min(anchor.left, window.innerWidth - size.width - pad))}px`;
  box.style.top = `${anchor.bottom + size.height + pad < window.innerHeight ? anchor.bottom + 4 : Math.max(pad, anchor.top - size.height - 4)}px`;
  box.style.visibility = "";
}

/**
 * Why this box cannot show `view` — the registry's reason, or that nothing
 * draws it yet. Both are refusals: a view the registry allows and no renderer
 * draws is, to the writer, exactly as unavailable.
 */
export function boxRefusal(view: View): Refusal | null {
  return views.viewRefusal(view) ?? (panes.rendererOf(view) ? null : { key: "view.notYet" });
}

/** The box shows another view: its renderer changes, so the window re-draws. */
function show(pane: panes.Leaf, view: View) {
  panestate.setTree(panes.update(panestate.paneTree, pane.id, { view: { ...view, scope: { ...view.scope, doc: pane.view.scope.doc } } }));
  panestate.setActivePane(pane.id);
}

/** The first mode `scope` can be shown in, preferring the one it is in. */
function modeFor(scope: Scope, prefer: string): string | null {
  const order = [prefer, ...views.modes().map((m) => m.id).filter((m) => m !== prefer)];
  return order.find((mode) => !boxRefusal({ scope, mode })) ?? null;
}

function openScopeMenu(pane: panes.Leaf, at: HTMLElement) {
  const rows: Node[] = [el("div", { class: "menu-cat", "data-i18n": "ml.scopeTitle" }, [t("ml.scopeTitle")])];
  for (const scope of SCOPES) {
    const mode = modeFor(scope, pane.view.mode);
    const refused = mode ? null : boxRefusal({ scope, mode: pane.view.mode });
    rows.push(row(scopeParts(scope), refused, { "data-ml-scope": JSON.stringify(scope) }, () => show(pane, { scope, mode: mode! }),
      views.sameScope(scope, { ...pane.view.scope, doc: undefined })));
  }
  float(rows, at);
}

function openModeMenu(pane: panes.Leaf, at: HTMLElement) {
  const rows: Node[] = [el("div", { class: "menu-cat", "data-i18n": "ml.modeTitle" }, [t("ml.modeTitle")])];
  for (const m of views.modes()) {
    const view = { scope: pane.view.scope, mode: m.id };
    rows.push(row([t(m.name)], boxRefusal(view), { "data-ml-mode": m.id }, () => show(pane, view), m.id === pane.view.mode));
  }
  float(rows, at);
}

function openLinkMenu(pane: panes.Leaf, at: HTMLElement, wire: ModeLineWiring) {
  const tree = panestate.paneTree;
  const apply = (leader: string | null, mode: string) => {
    const r = panes.follow(panestate.paneTree, pane.id, leader, mode);
    if (r.refused) {
      setStatus(reason(r.refused), "warn");
      return;
    }
    panestate.setPaneTree(r.tree);
    panestate.rememberPanes();
    wire.relinked();
    panestate.applyPreviewWindows();
  };
  const rows: Node[] = [
    el("div", { class: "menu-cat", "data-i18n": "ml.linkTitle" }, [t("ml.linkTitle")]),
    row([t("link.unlinked")], null, { "data-ml-link": "unlinked" }, () => apply(null, "unlinked"), pane.link.mode === "unlinked"),
  ];
  for (const lm of views.linkModes()) {
    if (lm.id === "unlinked") continue;
    for (const other of panes.leaves(tree)) {
      if (other.id === pane.id) continue;
      const n = String(panestate.paneNumberOf(other.id));
      const r = panes.follow(tree, pane.id, other.id, lm.id);
      rows.push(row([`${t(lm.name)} ${n}`], r.refused, { "data-ml-link": `${lm.id}:${n}` }, () => apply(other.id, lm.id),
        pane.link.mode === lm.id && pane.link.leader === other.id));
    }
  }
  float(rows, at);
}

// ---------------------------------------------------------------- open a box

/**
 * Open a box: pick a scope, then a mode, and it opens beside `from`,
 * following it — the leader is *"by default the box this one was opened from"*.
 *
 * Two stages rather than one grid because the scopes will grow (the document's
 * series, saved views) and a grid of every scope by every mode is a page, not
 * a menu. The second stage still shows every mode, with the refused ones
 * saying why: *"a preview of one note"* is a question the picker answers
 * rather than one it pretends was never asked.
 */
export function openBoxPicker(from: panes.Leaf, at: HTMLElement): void {
  const rows: Node[] = [el("div", { class: "menu-cat", "data-i18n": "ml.openTitle" }, [t("ml.openTitle")])];
  for (const scope of SCOPES) {
    const any = modeFor(scope, from.view.mode);
    rows.push(
      el("button", {
        class: "pal-item",
        "data-open-scope": JSON.stringify(scope),
        // A scope with no mode at all is still listed, and still opens its
        // second stage: that is where the reasons are.
        onClick: () => openModeStage(from, scope, at),
      }, [el("b", {}, scopeParts(scope)), ...(any ? [] : [el("span", { class: "menu-desc", "data-i18n": "view.notYet" }, [t("view.notYet")])])]),
    );
  }
  float(rows, at);
}

function openModeStage(from: panes.Leaf, scope: Scope, at: HTMLElement) {
  const rows: Node[] = [el("div", { class: "menu-cat" }, scopeParts(scope))];
  for (const m of views.modes()) {
    const view: View = { scope: { ...scope, doc: from.view.scope.doc }, mode: m.id };
    rows.push(row([t(m.name)], boxRefusal(view), { "data-open-mode": m.id }, () => openBox(from, view)));
  }
  float(rows, at);
}

/** The new box: split beside `from`, following it by scroll where it may. */
function openBox(from: panes.Leaf, view: View, dir: "row" | "col" = "row"): void {
  const box = panes.leaf(view);
  let tree = panes.split(panestate.paneTree, from.id, dir, box);
  const linked = panes.follow(tree, box.id, from.id, "scroll");
  if (!linked.refused) tree = linked.tree;
  panestate.setTree(tree);
  panestate.setActivePane(box.id);
}

// The pane state and the commands over it.
// Owns: the pane tree and its views, the focused/active/zoomed pane, the
// mirroring and forwarding flags, the places hooks (remember/restore) and the
// persistence commands (setTree, rememberPanes, forgetClosedPanes).
// Defers: the DOM — heads, hosts, splitters and menus live in the modules the
// wiring object names. Nothing here touches the DOM but `paneHostOf`, and that
// by id convention only.
// Refuses: knowing who renders. `renderPanes` reaches this module as a wiring
// callback, not as an import: every pane module reads this one and nothing
// imports from it but back through the wiring, which is why the graph stays a
// tree with this at the leaf.

import * as panes from "./panes";
import * as paneplaces from "./paneplaces";
import * as tabs from "./tabs";
import * as runtime from "./runtime";
import { t } from "./i18n";
import { narrowedTo, lineWindowOf, type Span } from "./narrowing";
import { narrowPreview, hasPageLines } from "./preview";
import { settings, saveSettings } from "./settings";
import { preambleOffset, scheduleCompile } from "./compile";
import { docTextOf } from "./spans";
import type { LineWindow } from "./preview";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// ------------------------------------------------------------------- wiring
//
// The pane system talks to things built elsewhere: the renderer that rebuilds
// hosts (`renderPanes`), the state factory (`makeState`), the document
// switcher's page hand-over, and the side drawers. Each is a function main.ts
// registers once at boot; nothing here may import another pane module, or the
// leaf grows back into a knot.

export interface PaneWiring {
  /** Rebuild the window's hosts from the current tree: panehost.renderPanes. */
  rebuildPanes(): void;
  /** Rebuild every pane's head strip: panehost.refreshPaneHeads. */
  refreshHeads(): void;
  /** The state factory: main.ts's `makeState`. */
  makePaneState(body: string, prose: boolean, at?: number): EditorState;
  /** Whether the caret is in prose or raw markup: main.ts's `proseHere`. */
  proseHere(): boolean;
  /** Re-apply the editing mode to every pane, through the save action. */
  applyEditingModes(): void;
  /** The open set's immediate side refills (outline, notes). */
  fillSidePanes(): void;
  /** The debounced side refills (review, outline, notes, marks, find). */
  refreshSidePanes(): void;
  /** Open a document into a tab that already shows it — `openDoc(_, {handedOver})`. */
  openDocHanded(id: string): Promise<void>;
  /** The form-modal prompt: main.ts's `askText`. */
  askText(message: string, initial?: string): Promise<string | null>;
}

let wired: PaneWiring | undefined;

/** Register the wiring. Called once, from main.ts's boot. */
export function wirePanes(w: PaneWiring): void {
  wired = w;
}

/** The wiring, for the modules that need a registered callback. */
export const paneWiring = (): PaneWiring => {
  if (!wired) throw new Error("wirePanes was never called: the pane wiring is missing");
  return wired;
};

// ---------------------------------------------------------------- panes
//
// The window is a tree of panes now (`panes.ts`), and this is the part that
// turns that tree into DOM and into editors. Three rules carry all of it:
//
//   **One document, many views.** Every source pane showing a document is a
//   separate `EditorView` with its own caret, its own scroll and its own fold
//   state. They are views of one text, not copies of it, so a change made in any
//   of them appears in all of them.
//
//   **One undo history per document.** Exactly one view per document is the
//   *primary*: it holds the document's state, with the history in it. Every
//   other view is a mirror, and a mirror that is typed into routes the change to
//   the primary rather than applying it locally. So there is one place edits are
//   recorded, which is what makes undo mean the same thing in every pane — and
//   is the lesson from the bug that poured one document's text into another.
//
//   **The focused pane is `runtime.view`.** Every command in the application
//   acts on it, unchanged, because "the editor" was always meant to be "the one
//   the writer is typing in".

/** The window's arrangement. */
export let paneTree: panes.PaneNode = panes.defaultTree();
/** Which pane the writer is in. */
export let focusedPane: string | null = null;
/**
 * The region shown alone, or null for the whole window.
 *
 * Not a change to the tree, and that is the design rather than an
 * implementation note. Zooming is a way of *looking* at an arrangement, so a
 * writer who zooms, reads, and zooms back out must get the arrangement they
 * built — the same splits at the same fractions, and the same editors with the
 * same scroll, undo history and folds. Rebuilding the tree would give them
 * something that looks the same and is not, and rebuilding the DOM would throw
 * away every view in the window to change what is on screen.
 *
 * So this is one id, and `applyPaneZoom` hides the rest with a class. Everything
 * stays alive behind it, including the previews, which keep compiling.
 */
export let zoomedNode: string | null = null;
/**
 * Which pane the writer last touched — of **any** role.
 *
 * `focusedPane` is a source pane and cannot be anything else: it is set from
 * `focusin` on an editor host and reset to the first source pane whenever the
 * arrangement is rebuilt, because everything that reads it wants an
 * `EditorView`. That is right for what it is for and one pane short of right
 * for the swap commands, which operate on a *place in the window*: a writer who
 * has just clicked into the preview and presses "swap left" means the preview.
 *
 * So a second, wider answer, set on a pointer landing anywhere in a pane. It
 * falls back to `focusedPane` — a fresh window has been clicked in nowhere —
 * and, like it, has to be checked against the tree before use, since the pane it
 * names can have been closed since.
 */
export let activePane: string | null = null;

/** Set while a change is being mirrored, so mirroring does not recurse. */
export let mirroring = false;
/**
 * Set while one pane's edit is being handed to the primary.
 *
 * The primary's `dispatch` runs for that hand-off exactly as it does for a
 * keystroke, and nothing in the transaction says which it was. That is only a
 * distinction worth drawing since narrowing: without this flag a narrowed
 * primary refuses the *other* pane's edits, so narrowing one pane would quietly
 * restrict every pane in the window to the same section.
 */
export let forwarding = false;

/** Set the window's arrangement. */
export function setPaneTree(next: panes.PaneNode) {
  paneTree = next;
}
/** Say which source pane the writer is in. */
export function setFocusedPane(id: string | null) {
  focusedPane = id;
}
/** Say which pane the writer last touched, of any role. */
export function setActivePane(id: string | null) {
  activePane = id;
}
/** Say which region is zoomed, or none. */
export function setZoomedNode(id: string | null) {
  zoomedNode = id;
}
/** Turn the mirroring guard on or off. */
export function setMirroring(v: boolean) {
  mirroring = v;
}
/** Turn the forwarding guard on or off. */
export function setForwarding(v: boolean) {
  forwarding = v;
}

// The live editors, keyed by pane id. State, so they are read and written only
// through the functions below.
const paneViews = new Map<string, EditorView>();

/** The live editor of one pane, if it has one. */
export const paneViewOf = (id: string): EditorView | undefined => paneViews.get(id);
/** Whether a pane has a live editor. */
export const hasPaneView = (id: string): boolean => paneViews.has(id);
/** Every pane id paired with its editor. */
export const paneViewEntries = (): IterableIterator<[string, EditorView]> => paneViews.entries();
/** Every live editor, pane id not carried. */
export const paneViewsAll = (): EditorView[] => [...paneViews.values()];
/** Give a pane its editor. */
export const registerPaneView = (id: string, v: EditorView) => paneViews.set(id, v);
/** Forget every editor: the tree is being rebuilt. */
export const forgetPaneViews = () => paneViews.clear();

/** The pane a pane command acts on: the last one touched, whatever its role. */
export function currentPane(): string | null {
  const live = (id: string | null) => (id && panes.find(paneTree, id) ? id : null);
  return live(activePane) ?? live(focusedPane);
}

/** Every source pane's editor, in tree order, the focused one included. */
export function sourceViews(): EditorView[] {
  const out: EditorView[] = [];
  for (const l of panes.leaves(paneTree)) {
    if (l.role !== "source") continue;
    const v = paneViews.get(l.id);
    if (v) out.push(v);
  }
  return out;
}

/**
 * Show a document in every source pane at once.
 *
 * Switching documents used to re-state `runtime.view` — **the focused pane, and
 * only it**. Every other source pane went on holding the sefer you had just
 * left, while `retargetPanes` relabelled its tab with the name of the one you
 * had switched to, so the window showed two documents and claimed to show one.
 *
 * Typing into the pane that was left behind was worse than reading it. The edit
 * is forwarded to the primary and mirrored back by changesets carrying the
 * primary's positions, so the moment the two documents were different lengths
 * every keystroke threw `Applying change set to a document with the wrong
 * length` — uncaught, once per character, with nothing on screen changing and
 * nothing said. A writer typing into a pane that has silently stopped being an
 * editor is the exact shape this application is being audited for.
 *
 * The panes share one `EditorState`, which is what they are: mirrors onto one
 * text with one undo history. They diverge from the first keystroke, and
 * `mirrorChange` is what keeps the text from diverging with them.
 *
 * Where each pane was *standing* in the document being returned to is restored
 * afterwards, by `restorePlaces`. One state per document is still the right
 * shape — there is one text and one undo history — and a caret per pane per
 * document is the part that is not a property of the document at all. See
 * `paneplaces.ts`.
 */
export function showInEveryPane(state: EditorState): void {
  const views = sourceViews();
  if (!views.length) {
    // Before the first render there are no panes, only the boot view.
    runtime.view.setState(state);
    return;
  }
  for (const v of views) v.setState(state);
}

/**
 * Remember where every source pane is standing in the document it is showing.
 *
 * Called before a switch takes the document away. `stashFocused` above does the
 * same thing for the *document* — its text, its history, and the focused
 * pane's caret — and this is the half that is per pane: three panes onto one
 * sefer are three places in it, and the open set has one slot.
 */
export function rememberPlaces(docId: string | null): void {
  if (!docId) return;
  for (const l of panes.leaves(paneTree)) {
    const v = l.role === "source" ? paneViews.get(l.id) : undefined;
    if (l.role === "source" && !v) continue;
    const sel = v?.state.selection.main;
    paneplaces.remember(l.id, docId, {
      anchor: sel?.anchor ?? 0,
      head: sel?.head ?? 0,
      // A preview has no caret, and `l.scrollTop` is what `wirePaneScroll`
      // keeps for it. Every pane role is remembered, not only the two that can
      // be typed in: coming back to a sefer with the source at siman fifty and
      // the printed page at page one is the same complaint one pane over.
      scrollTop: v ? v.scrollDOM.scrollTop : l.scrollTop,
    });
  }
}

/**
 * Put every source pane back where it was in this document, if it has been here.
 *
 * A pane with nothing remembered is left alone, holding the document's own
 * caret — which is where the writer last was in it. That is deliberately not
 * "the top": a pane opening a sefer for the first time this session should land
 * where the document says, and only a pane that has genuinely stood somewhere
 * else in *this* document has a better answer than that.
 *
 * The scroll is set from the same record rather than left to
 * `scrollIntoView`, because the two are different facts: a caret three lines
 * above the fold and a caret centred are the same selection and not the same
 * screen, and the writer arranged one of them.
 */
export function restorePlaces(docId: string): void {
  for (const l of panes.leaves(paneTree)) {
    if (l.role !== "source") continue;
    const v = paneViews.get(l.id);
    const place = v && paneplaces.recall(l.id, docId);
    if (!v || !place) continue;
    const { anchor, head, scrollTop } = paneplaces.within(place, v.state.doc.length);
    v.dispatch({ selection: { anchor, head } });
    v.scrollDOM.scrollTop = scrollTop;
  }
}

/**
 * Put every preview pane back to the page it was showing in this document.
 *
 * Separate from the source panes above, and later, because a preview cannot be
 * scrolled to somewhere it has no pages: `showPagesFor` is what draws them, and
 * a scroll set before that is a scroll into an empty element, silently clamped
 * to zero. So this runs after the pages are up, and does nothing when there are
 * none — a document being opened for the first time this session has no page to
 * return to, and the top of a blank pane is the honest answer.
 */
export function restorePreviewPlaces(docId: string): void {
  for (const l of panes.leaves(paneTree)) {
    if (l.role === "source") continue;
    const place = paneplaces.recall(l.id, docId);
    const host = paneHostOf(l.id);
    if (!place || !host || !host.scrollHeight) continue;
    l.scrollTop = place.scrollTop;
    host.scrollTop = place.scrollTop;
  }
}

/** The view that owns a document's history: the first source pane showing it. */
export function primaryView(): EditorView | undefined {
  for (const l of panes.leaves(paneTree)) {
    if (l.role !== "source") continue;
    const v = paneViews.get(l.id);
    if (v) return v;
  }
  return undefined;
}

/** A heading with no title still has to be nameable in a sentence. */
export function titleOfSpan(span: Span): string {
  return span.title || t("narrowedNoTitle");
}

/** This pane's number, as the strip prints it and the pickers ask for it. */
export function paneNumberOf(id: string): number {
  return panes.leaves(paneTree).findIndex((l) => l.id === id) + 1;
}

/**
 * How the tree is being laid out at this moment, for the directional commands.
 *
 * Both answers are read off the rendering rather than assumed, and both have
 * bitten something before:
 *
 *   • **Direction.** A flex row lays its first child out on the right when the
 *     container is right-to-left. `main` is forced `direction: ltr` today —
 *     deliberately, so that pane *positions* are physical while the text inside
 *     each pane reads in its own direction — which makes `a` the left pane in
 *     Hebrew as well as in English. That is a fact about a stylesheet and not
 *     about this module, so it is read rather than assumed: the day somebody
 *     mirrors the window, the arrow keys follow it on their own.
 *   • **Stacking.** Under 900px `styles.css` turns every split into a column
 *     whatever it was built as. Asked of a real `.pane-split` instead of a
 *     `matchMedia` with `900` typed into it, because a breakpoint written down
 *     twice is a breakpoint that will be moved once.
 */
export function paneLayout(): panes.Layout {
  const row = document.querySelector<HTMLElement>('.pane-split[data-dir="row"]');
  const box = row ?? document.querySelector<HTMLElement>("main");
  return {
    rtl: !!box && getComputedStyle(box).direction === "rtl",
    stacked: !!row && getComputedStyle(row).flexDirection.startsWith("column"),
  };
}

export function paneHostOf(id: string): HTMLElement | null {
  return document.getElementById(`pane-host-${id}`);
}

/** What a pane is narrowed to, asked of the pane rather than of the editor. */
export function paneNarrow(id: string): Span | null {
  const v = paneViews.get(id);
  return v ? narrowedTo(v.state) : null;
}

/**
 * The stretch of the document a preview pane is following, or `null` for all of
 * it.
 *
 * A preview follows the pane it was split from, which is what `linked` has
 * always meant for scrolling — *"we also should make that you can optionally
 * unlink the scrolling"* — and narrowing is the same relationship asked a second
 * question. Unlinking a preview widens it, which is the escape hatch: a reader
 * who wants the sefer beside a narrowed source presses the same button they
 * already press to stop the scroll following.
 *
 * The offset is the custom-command preamble. The pane counts in the writer's own
 * lines and the engine answers in the body it was sent, and the two differ by
 * exactly that — the same correction `diagview` makes to a diagnostic, made
 * here for the same reason and read from the same place.
 */
export function previewWindowOf(pane: panes.Leaf): { win: LineWindow; title: string } | null {
  if (pane.role !== "preview" || !pane.linked) return null;
  const beside = panes.sibling(paneTree, pane.id);
  if (!beside || beside.role !== "source") return null;
  const v = paneViews.get(beside.id);
  const span = v ? narrowedTo(v.state) : null;
  if (!v || !span) return null;
  const win = lineWindowOf(docTextOf(v.state.doc), span);
  const shift = preambleOffset();
  return {
    win: { file: win.file, from: win.from + shift, to: win.to + shift },
    title: titleOfSpan(span),
  };
}

/**
 * Tell every preview pane which siman it is following, if any.
 *
 * Called wherever the answer can change: the arrangement, the narrowing, and the
 * scroll link. Not on a compile — the *window* does not move when the document
 * is laid out again, only which pages it lands on, and `drawPagesEverywhere`
 * redraws for that.
 */
export function applyPreviewWindows(): void {
  let narrowed = false;
  for (const pane of panes.leaves(paneTree)) {
    if (pane.role !== "preview") continue;
    const host = document.getElementById(`pane-host-${pane.id}`);
    if (!host) continue;
    const on = previewWindowOf(pane);
    narrowed ||= !!on;
    narrowPreview(host, on?.win ?? null, on?.title);
  }
  // A preview that has just been narrowed has no runs to narrow *by*: the
  // compile that drew what is on screen was never asked for them. So ask, once,
  // rather than leaving a pane claiming to hold one siman while showing forty
  // pages until the writer's next keystroke.
  //
  // Asked of the pages on screen, not of `runtime.lastResult`. The two disagree
  // exactly when a compile has failed — `lastResult` is stored unconditionally
  // and the redraw is skipped — and the first spelling of this read the wrong
  // one of them.
  if (narrowed && !hasPageLines()) scheduleCompile();
}

/** Change the arrangement, redraw, and remember it. */
export function setTree(next: panes.PaneNode) {
  paneTree = next;
  paneWiring().rebuildPanes();
  rememberPanes();
  forgetClosedPanes();
  scheduleCompile();
}

/**
 * Drop the remembered places of panes that no longer exist.
 *
 * Swept from the tabs rather than wired into `closePane`, because closing a
 * pane is not the only way one goes: picking a different arrangement replaces
 * the whole tree, and a hand-wired forget at the one obvious call site is the
 * shape this repository keeps paying for. Every tab's tree, not this one's —
 * the other tabs' panes are alive and merely not on screen, and forgetting
 * them here would make switching tabs lose exactly what this whole item is
 * about.
 *
 * Run after `rememberPanes`, which stashes the current tree into the active
 * tab: before it, the tab still holds the arrangement that has just been
 * replaced and every new pane would look like a stranger.
 */
export function forgetClosedPanes(): void {
  const live = new Set<string>();
  for (const tab of tabs.all()) for (const l of panes.leaves(tab.tree)) live.add(l.id);
  for (const pane of paneplaces.panesKnown()) if (!live.has(pane)) paneplaces.forgetPane(pane);
}

/** Persist the arrangement, so a restart comes back to the same window. */
export function rememberPanes() {
  tabs.stash(paneTree, focusedPane);
  settings.tabs = tabs.serialise();
  saveSettings();
}

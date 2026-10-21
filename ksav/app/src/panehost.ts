// The window built from the pane tree: hosts, strips, splitters, and how the
// writer moves between the panes' two halves.
// Owns: `renderPanes` and the DOM it builds (split boxes, leaf hosts, the head
// strips and their controls), the zoom draw, and the click-to-reveal handlers
// a preview host answers.
// Defers: state and its persistence to `panestate`; the editing lane to
// `paneview`; drag gestures to `panedrag`; the scroll link and the printed-map
// follow to `panescroll`; the `⋯` menu to `panemenu`; arrangements and the
// page view to `panearrangements`; tabs to `tabstrip`.
// Refuses: remembering anything but its render helpers. State is read and
// written through panestate's exported functions, and everything the window
// needs of main.ts arrives as wiring callbacks rather than imports.

import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import * as panestate from "./panestate";
import * as paneview from "./paneview";
import * as panedrag from "./panedrag";
import * as panescroll from "./panescroll";
import * as panemenu from "./panemenu";
import * as tabstrip from "./tabstrip";
import * as runtime from "./runtime";
import * as docs from "./docs";
import * as panes from "./panes";
import { settings, docConfig } from "./settings";
import { t, tf } from "./i18n";
import { el, glyphBtn } from "./dom";
import { docTextOf } from "./spans";
import { closeMenus } from "./panels";
import { splitterFor } from "./panedrag";
import { applyPreview, drawCurrentInto, currentPages, pageBox } from "./preview";
import { isPlainClick, pageUnder, pointInPage, clickedChapter } from "./jump";
import { lineInDocument } from "./diagview";
import { offsetOf } from "./errorlines";
import { compileNow, bodyOnScreen } from "./compile";
import { voidAction, action } from "./asyncaction";

/**
 * Every pane's strip, rebuilt.
 *
 * Narrowing is the only thing in the strip that changes without the arrangement
 * changing, and `renderPanes` is far too big a hammer for it: it destroys every
 * `EditorView` in the window and builds them again, which a writer would see as
 * their scroll position jumping in a pane they did not touch.
 */
export function refreshPaneHeads(): void {
  for (const pane of panes.leaves(panestate.paneTree)) {
    const head = document.querySelector<HTMLElement>(`[data-pane="${pane.id}"] > .pane-head`);
    if (head) head.replaceWith(paneHead(pane));
  }
}

/**
 * Build `<main>` from the pane tree.
 *
 * Rebuilt wholesale rather than diffed, and the cost is bounded because it only
 * runs when the *arrangement* changes — not on a keystroke, not on a scroll, and
 * not when a document is switched. Each source pane's state is carried across so
 * an arrangement change does not cost a writer their carets.
 */
/**
 * The words that were on the screen when the panes were last torn down.
 *
 * Set by `renderPanes` before it destroys the views and read by `renderLeaf`
 * while it builds their replacements — which is the only window in which it is
 * true, hence a variable rather than an argument threaded through `renderNode`.
 *
 * Why it cannot be `runtime.currentDoc.body`: that is the copy in the store,
 * and autosave writes it 600 ms after a pause in typing. A pane seeded from it
 * comes up holding a document as it was up to six hundred milliseconds ago.
 */
let liveTextAtRender: string | null = null;

export function renderPanes() {
  const main = document.querySelector("main");
  if (!main) return;
  liveTextAtRender = runtime.view ? docTextOf(runtime.view.state.doc) : null;
  // What each pane was holding, so rebuilding does not reset it.
  const held = new Map<string, EditorState>();
  for (const [id, v] of panestate.paneViewEntries()) held.set(id, v.state);
  // And **where each pane was looking**, which the state does not carry.
  //
  // An `EditorState` holds the text and the caret and no scroll at all, so
  // every pane that survived a rebuild came back at the top of the document.
  // That made every arrangement change — closing a pane, splitting one, even
  // toggling the scroll-link chip — throw a reader on page 40 of a sefer back
  // to page 1. Read here, before the views are destroyed, and asked for again
  // once the new tree is on screen.
  const wasAt = new Map<string, number>();
  for (const [id, v] of panestate.paneViewEntries()) wasAt.set(id, v.scrollDOM.scrollTop);
  for (const pane of panes.leaves(panestate.paneTree)) {
    if (pane.role === "source") continue;
    const host = panestate.paneHostOf(pane.id);
    if (host) wasAt.set(pane.id, host.scrollTop);
  }
  for (const v of panestate.paneViewsAll()) v.destroy();
  panestate.forgetPaneViews();

  main.replaceChildren(renderNode(panestate.paneTree, held));
  main.setAttribute("data-panes", String(panes.leaves(panestate.paneTree).length));
  // Reapplied on every rebuild, and it is what keeps a zoom from surviving the
  // thing it was a zoom *of*. Splitting or closing a pane rebuilds the window;
  // if the zoomed region went with it, `applyPaneZoom` finds nothing and drops
  // the zoom, which is the only honest answer.
  applyPaneZoom();

  // Put every surviving source pane back where it was looking. A pane that is
  // new has no entry and is left alone — `renderLeaf` opens it where the pane it
  // was split from is looking, which is a different and deliberate answer.
  //
  // The previews cannot be restored here: their pages are not drawn until
  // `drawCurrentIntoAll` at the end of this function, and a scroll into a pane
  // with no content in it yet is clamped to zero. They are done there.
  for (const pane of panes.leaves(panestate.paneTree)) {
    const at = wasAt.get(pane.id);
    if (at === undefined || pane.role !== "source") continue;
    const view = panestate.paneViewOf(pane.id);
    if (view) view.scrollDOM.scrollTop = at;
  }

  // A caret is not a view. A pane born with its caret at the place you were
  // reading still *renders* from the top of the document, so the scroll has to
  // be asked for — and it has to be asked for here rather than in `renderLeaf`,
  // because the tree is detached while it is being built and a view with no
  // height on screen has nothing to scroll.
  for (const leaf of panes.leaves(panestate.paneTree)) {
    if (leaf.role !== "source" || held.has(leaf.id)) continue;
    const born = panestate.paneViewOf(leaf.id);
    if (born) born.dispatch({ effects: EditorView.scrollIntoView(born.state.selection.main.head, { y: "center" }) });
  }

  // And the editing mode, which a newborn pane has none of: `makeState` builds
  // the mode compartment empty, so a pane made by splitting a window that is in
  // vim starts in plain editing. Applied to the whole arrangement rather than to
  // the new pane alone because the call is per view anyway and the import is
  // cached, so there is nothing to be gained by being clever about which panes
  // already have it.
  panestate.paneWiring().applyEditingModes();

  // The focused pane has to be one that still exists.
  const live = panes.leaves(panestate.paneTree).filter((l) => l.role === "source");
  if (!panestate.focusedPane || !panestate.hasPaneView(panestate.focusedPane)) panestate.setFocusedPane(live[0]?.id ?? null);
  const v = panestate.focusedPane ? panestate.paneViewOf(panestate.focusedPane) : undefined;
  if (v) runtime.setView(v);
  applyPreview();
  // Before the draw, not after: a preview that is following a narrowed siman
  // must not show the whole sefer for the frame between the two.
  panestate.applyPreviewWindows();
  drawCurrentIntoAll();
  // Now the previews have pages, so now they can be put back where they were.
  // Written straight rather than through the link, because this is not a follow:
  // the pane is being restored to the place it was already at, and routing it
  // through `syncLinkedScroll` would move it to wherever the source happens to
  // be instead.
  for (const pane of panes.leaves(panestate.paneTree)) {
    const at = wasAt.get(pane.id);
    if (at === undefined || pane.role === "source") continue;
    const host = panestate.paneHostOf(pane.id);
    if (!host) continue;
    host.scrollTop = at;
    // And it must not read as a person scrolling, or the pane it is linked to
    // will follow it and both will end up somewhere neither was.
    panescroll.noteScrollWrite(pane.id, host.scrollTop);
  }
  // The side panels, now that their hosts are in the document. Both are cheap
  // and both are wrong to leave blank: an outline pane that fills in on the
  // next keystroke is an outline pane that looks broken until you type.
  panestate.paneWiring().fillSidePanes();
}

function renderNode(node: panes.PaneNode, held: Map<string, EditorState>): HTMLElement {
  if (node.kind === "leaf") return renderLeaf(node, held);
  const box = el("div", { class: "pane-split", "data-dir": node.dir, "data-node": node.id });
  const a = renderNode(node.a, held);
  const b = renderNode(node.b, held);
  a.style.flex = `${node.frac} 1 0`;
  b.style.flex = `${1 - node.frac} 1 0`;
  box.append(a, splitterFor(node), b);
  return box;
}

function renderLeaf(pane: panes.Leaf, held: Map<string, EditorState>): HTMLElement {
  const host = el("div", { class: "pane-host", id: `pane-host-${pane.id}` });
  const section = el(
    "section",
    {
      class: `pane ${pane.role}-pane`,
      "data-pane": pane.id,
      // The same id again under the name the zoom uses, so one walk up the DOM
      // can treat a pane and a split alike — which is the whole point of zooming
      // a *region* rather than a pane.
      "data-node": pane.id,
      "aria-label": t(pane.role),
      // The pane's own name, and `NAME` above maps a role onto a key for the
      // same reason: both are the *role*'s name, and both were Hebrew after a
      // switch. `pane.role` is already a key, so nothing has to be derived.
      "data-i18n-label": pane.role,
    },
    [host],
  );
  if (pane.role === "source") {
    // A pane with no held state is a pane that did not exist a moment ago — a
    // split. It opens **where the pane it was split from is looking**, not at
    // the head of the document: you split a 300-page sefer to hold two places
    // at once, and a new pane that starts at page 1 has thrown away the place
    // you were standing in to get it. `held` still has the focused pane's
    // state here because it is captured before the views are destroyed.
    const seed = panestate.focusedPane ? held.get(panestate.focusedPane) : undefined;
    // **The text comes from `held`, not from the stored body.**
    //
    // `primaryView()` reads `paneViews`, and the loop above has already
    // destroyed every view and cleared that map — so it was *always* undefined
    // here and every new pane was seeded from `runtime.currentDoc.body`, which
    // is the copy in the store. Autosave writes it 600 ms after a pause in
    // typing, so anything written since is not in it.
    //
    // Harmless-looking for a split, and not harmless at all for a tab switch,
    // where every pane of the arriving arrangement is new: the pane came up
    // holding a stale copy of the document being left, and `stashFocused` —
    // which runs next, and files `runtime.view.state` under the document still
    // focused — wrote that stale copy back over the live one. A sefer typed and
    // switched away from inside the autosave window lost what had been typed.
    // The acceptance run reported it as four pages coming back as one.
    //
    // `held` is captured before the views are destroyed, which the comment
    // above already says, and `seed` is that state. It was being asked for the
    // caret and not for the words.
    // `seed` is the focused pane's own held state, which is the right answer
    // for a **split** — the new pane opens where the one it was split from is
    // looking. It is absent for a **tab switch**, because `selectTab` points
    // `focusedPane` at the arriving tab's pane before the rebuild and that id
    // was never in `held`; the words then come from what was on the screen a
    // moment ago, and only failing both from the store.
    const state =
      held.get(pane.id) ??
      panestate.paneWiring().makePaneState(
        seed ? docTextOf(seed.doc) : (liveTextAtRender ?? runtime.currentDoc.body),
        panestate.paneWiring().proseHere(),
        seed?.selection.main.head,
      );
    const view = paneview.makePaneView(host, state);
    panestate.registerPaneView(pane.id, view);
    host.addEventListener("focusin", () => {
      panestate.setFocusedPane(pane.id);
      panestate.setActivePane(pane.id);
      runtime.setView(view);
    });
  } else if (pane.role === "preview") {
    host.classList.add("preview-host");
    // **What makes `manual` safe to offer.** A preview that stopped updating
    // and did not say so is not a setting — it is a way to read an old page and
    // believe it is current, which is a worse failure than a slow preview
    // because nothing on the screen contradicts it. So the banner is part of
    // the mode rather than an addition to it, it names the way out, and it sits
    // on the page it is about rather than in the status bar with everything
    // else.
    host.append(
      el("button", { class: "preview-stale", onClick: () => compileNow(), hidden: "hidden" }, [
        el(
          "b",
          {
            // `⟳` is a glyph, not a word, and does not change with the language;
            // the word beside it does.
            "data-i18n": "msg.glyphThen",
            "data-i18n-args": JSON.stringify(["⟳", ":previewStale"]),
          },
          [tf("msg.glyphThen", "⟳", t("previewStale"))],
        ),
        el("span", { "data-i18n": "previewStaleHow" }, [t("previewStaleHow")]),
      ]),
    );
    wirePreviewClicks(host);
  } else {
    // The outline and the notes list, as panes rather than as drawers over the
    // document. The list itself is the same list, drawn into every home it has.
    //
    // **Not filled here.** `renderNode` builds a detached tree and `renderPanes`
    // attaches it afterwards, so a `querySelectorAll` at this moment searches a
    // document this host is not in yet and finds nothing. Filled once the tree
    // is on screen; see the end of `renderPanes`.
    const LIST_CLASS: Record<string, string> = {
      outline: "outline-list",
      notes: "notes-list",
      marks: "marks-list",
    };
    host.classList.add(LIST_CLASS[pane.role] ?? "notes-list", "panel-pane");
  }
  // Prepended, not passed in above, and that is the narrowing chip's doing: the
  // strip reports what this pane is narrowed to, which it can only read off the
  // `EditorView` that the branch above has just built. Built first, it reported
  // "not narrowed" for every pane — so carrying a narrowed pane through an
  // arrangement change lost the one label saying the pane was not showing the
  // whole document.
  section.prepend(paneHead(pane));
  panescroll.wirePaneScroll(pane, host);
  // Which pane a pane command acts on. `focusin` answers this for a source pane
  // and for nothing else: a preview host holds no focusable element, so clicking
  // into the page and pressing a swap key would have moved whichever source pane
  // was focused a minute ago. `pointerdown` on the section catches every pane and
  // every role, and it is passive — it decides nothing and cancels nothing.
  section.addEventListener("pointerdown", () => { panestate.setActivePane(pane.id); }, { passive: true });
  return section;
}

/**
 * A pane's own strip: what it is showing, and the controls that belong to it.
 *
 * The scroll-link toggle lives here rather than in Settings because it is a
 * property of *this* pane — *"we also should make that you can optionally unlink
 * the scrolling"* — and a per-pane property in an application-wide drawer is a
 * setting nobody can find and nobody can tell which pane it applies to.
 */
function paneHead(pane: panes.Leaf): HTMLElement {
  // `source` and `preview` are already keys; the two panel roles have their own
  // names because "outline" is also the name of a *function* in this file and a
  // key called `notes` would collide with the notes chooser.
  const NAME: Record<string, string> = {
    source: "source",
    preview: "preview",
    outline: "outlinePane",
    notes: "notesPaneRole",
    marks: "marksPane",
  };
  // The pane's number, and it is on screen rather than implied.
  //
  // *"I don't know if I can switch other than top bottom and left right — what
  // if it gets more complicated?"* — which is the right question, because the
  // directional commands genuinely run out: in a tree three levels deep "the one
  // on the left" stops picking out a pane a person can point at. A number does,
  // at any depth, and it is the same answer Emacs' `ace-window` and every tiling
  // manager reached. It has to be *visible* to be usable: a picker offering
  // "pane 3" is worth nothing if nothing on screen says which pane is 3.
  const kids: Node[] = [
    el("span", {
      class: "pane-no",
      title: tf("paneNumbered", String(panestate.paneNumberOf(pane.id))),
      // `paneNumbered` is a template, so the number is an argument — and a bare
      // number is a bare number in either language, so it is not marked with `:`.
      "data-i18n-title": "paneNumbered",
      "data-i18n-title-args": JSON.stringify([String(panestate.paneNumberOf(pane.id))]),
    }, [
      String(panestate.paneNumberOf(pane.id)),
    ]),
    el("span", { class: "pane-name", "data-i18n": NAME[pane.role] }, [t(NAME[pane.role])]),
  ];
  // Narrowing, and it is **named rather than iconified**. A glyph can say *this
  // pane is restricted*; only the title can say *to what*, and that is the one
  // question a writer looking at a pane showing four paragraphs of a 300-page
  // sefer actually has. The control is present with one pane as well as with
  // four: working on one siman without the rest of the sefer under the caret is
  // a reason to narrow that has nothing to do with splitting the window.
  if (pane.role === "source") {
    const span = panestate.paneNarrow(pane.id);
    kids.push(
      glyphBtn(
        span ? `⊡ ${panestate.titleOfSpan(span)} ×` : "⊡",
        span ? t("widenLede") : t("narrowLede"),
        () => {
          const v = panestate.paneViewOf(pane.id);
          if (!v) return;
          if (span) paneview.widenHere(v);
          else paneview.narrowHere(v);
        },
        "pane-btn" + (span ? " pane-narrowed" : ""),
        // The state, on the element, because it is the one thing about a pane
        // that cannot be read off its contents: a pane showing four paragraphs
        // is either a short document or a narrowed one, and nothing on screen
        // told the two apart. `.github/scripts/acceptance.mjs` drives by this.
        { "data-i18n-both": span ? "widenLede" : "narrowLede", "data-narrow": span ? "on" : "off" },
      ),
    );
  }
  // A preview following a narrowed pane shows four pages where a sefer was, and
  // until this element nothing on screen admitted to it. Left empty here and
  // written by `preview.ts` after each draw: the siman's name does not change
  // between draws but the number of pages it printed on does, and one writer of
  // one element is the rule this repository keeps having to re-learn.
  if (pane.role === "preview") {
    kids.push(
      el("span", {
        class: "pane-window",
        "data-preview-window": "",
        title: t("previewFollowsLede"),
        "data-i18n-title": "previewFollowsLede",
      }),
    );
  }
  // Each control names itself. The strip is the one place in the application
  // whose buttons are pure glyph, so the only other thing that could identify
  // them is the `title`, which is translated — and a fence that reads a Hebrew
  // title is a fence that goes quiet the day the run is driven in English.
  if (panes.leaves(panestate.paneTree).length > 1) {
    kids.push(
      glyphBtn(
        pane.linked ? "⇅" : "⇵",
        // The glyph and the name are both a function of `linked`, and so is the
        // marker — a static one would re-localise the button to the state it was
        // *not* in when the language changed.
        pane.linked ? t("scrollLinked") : t("scrollUnlinked"),
        // **Not `setTree`.** Linking changes one field on one leaf and nothing
        // about the shape, and `setTree` rebuilds every `EditorView` in the
        // window — which used to throw a reader on page 40 back to page 1 for
        // pressing a chip that has nothing to do with where they are.
        () => {
          panestate.setPaneTree(panes.update(panestate.paneTree, pane.id, { linked: !pane.linked }));
          panestate.rememberPanes();
          refreshPaneHeads();
          panestate.applyPreviewWindows();
        },
        "pane-btn",
        { "data-i18n-both": pane.linked ? "scrollLinked" : "scrollUnlinked", "data-pane-act": "link" },
      ),
    );
  }
  // **Both splits, always.**
  //
  // There used to be one button, it was only offered once the window already had
  // two panes, and it only ever made one of the two splits. All three of those
  // were reported at once: *"I can't see how to split it vertically, only
  // horizontally"*. The tree has handled both directions since it was written
  // (`panes.split` takes a `dir`); nothing in the window ever asked for the
  // other one. A single pane can be split too, which is the case a writer is
  // most likely to want it in.
  kids.push(
    glyphBtn("◫", t("splitAcross"), () => splitHere(pane, "row"), "pane-btn", { "data-i18n-both": "splitAcross",
      "data-pane-act": "split-across",
    }),
    glyphBtn("⊟", t("splitDown"), () => splitHere(pane, "col"), "pane-btn", { "data-i18n-both": "splitDown",
      "data-pane-act": "split-down",
    }),
    // Zoom, beside the splits, because it is the same question answered the
    // other way: those two make the window smaller pieces, this one shows one
    // piece at a time. The glyph changes to say which state pressing it leaves,
    // so a zoomed window is legible from the pane it zoomed rather than only
    // from the fact that the others are missing.
    glyphBtn(
      panestate.zoomedNode ? "⤡" : "⛶",
      panestate.zoomedNode ? t("unzoomPane") : t("zoomPane"),
      () => {
        panestate.setActivePane(pane.id);
        cyclePaneZoom();
      },
      "pane-btn" + (panestate.zoomedNode ? " pane-zoom-on" : ""),
      { "data-i18n-both": "zoomPane", "data-pane-act": "zoom" },
    ),
    glyphBtn(
      "⋯",
      t("paneMenu"),
      (e: Event) => {
        // **Stopped here.** `window`'s click listener calls
        // `closeOnOutsideClick`, and the click that opens this menu is, to that
        // listener, a click on a button that is not inside `.pane-menu` — so
        // without this the menu is dismissed by the very gesture that opened it
        // and the button does nothing at all. The header's dropdowns are closed
        // by hand for the same reason: that sweep rides on the same listener.
        e.stopPropagation();
        closeMenus();
        panemenu.openPaneMenu(pane, e.currentTarget as HTMLElement);
      },
      "pane-btn",
      { "data-i18n-both": "paneMenu", "data-pane-act": "menu" },
    ),
  );
  if (panes.leaves(panestate.paneTree).length > 1) {
    kids.push(
      // Closing a *pane* is not closing a document and not deleting one. It was
      // spelled `–` to keep the three apart, and the writer read the strip
      // exactly as the glyph was drawn: *"i dont see how to close one, only
      // minimise"*. A dash means minimise in every window manager there has ever
      // been. The three meanings are told apart by the `title` and by which
      // surface the control is on — never by making the commonest one unreadable.
      glyphBtn(
        "×",
        t("closePane"),
        () => panestate.setTree(panes.closePane(panestate.paneTree, pane.id)),
        "pane-btn pane-close",
        { "data-i18n-both": "closePane", "data-pane-act": "close" },
      ),
    );
  }
  const head = el("div", { class: "pane-head" }, kids);
  // Drag the strip onto another pane and the two trade places — *"a drag would
  // also be nice, but at the very least intuitive commands to swap 2 windows
  // would help"*. Both, then: this, and `pane.swap*` on the keyboard.
  //
  // The **strip** is the handle, not the pane. A source pane is a text editor,
  // and making the editor itself draggable would take a writer's ability to
  // select text with the mouse — which is the gesture this one is spelled with.
  // A one-pane window has nothing to trade with, so the handle is not offered.
  if (panes.leaves(panestate.paneTree).length > 1) {
    head.title = t("swapPaneDrag");
    // The attribute as well as the property: `localise` reads attributes, and a
    // handle whose tooltip was set after the fact is a handle that cannot be
    // re-localised.
    head.setAttribute("data-i18n-title", "swapPaneDrag");
    head.classList.add("pane-grab");
    panedrag.wirePaneDrag(pane, head);
  }
  return head;
}

/**
 * Split this pane, in the direction asked for.
 *
 * The new pane shows the same thing the old one does, unlinked — splitting is
 * how you get a second place in one document, and a second view that follows the
 * first is the first view again. Both directions come through here so there is
 * one answer to what a split *is* and only the axis differs.
 */
function splitHere(pane: panes.Leaf, dir: "row" | "col") {
  panestate.setTree(panes.split(panestate.paneTree, pane.id, dir, panes.leaf(pane.role, pane.docId, { linked: false })));
}
/**
 * Show one region of the window and hide the rest, with classes only.
 *
 * The walk is up the DOM from the zoomed node to `<main>`: at every split on
 * the way, the child that is *not* on the path is hidden, and the splitter with
 * it — a drag handle for a pane nobody can see is a way to resize the window to
 * something the writer cannot check.
 *
 * Everything hidden is still there, still holding its editor and still being
 * drawn into. That costs a little work per compile and buys the property that
 * makes zoom worth having: coming back out is free and exact.
 *
 * A stale id — the pane was closed, or the arrangement changed under it — is
 * simply no zoom. It cannot be an error state: the alternative is a window
 * showing a region that no longer exists, which is a blank frame.
 */
function applyPaneZoom() {
  const main = document.querySelector("main");
  if (!main) return;
  for (const el of main.querySelectorAll(".pane-hidden")) el.classList.remove("pane-hidden");
  for (const el of main.querySelectorAll(".pane-zoomed")) el.classList.remove("pane-zoomed");
  main.classList.toggle("has-zoom", panestate.zoomedNode !== null);
  if (!panestate.zoomedNode) return;
  const node = main.querySelector<HTMLElement>(`[data-node="${panestate.zoomedNode}"]`);
  if (!node) {
    // The zoom outlived its region. Say so in the state as well as on screen,
    // or the next press of the key walks a chain from a node that is gone.
    panestate.setZoomedNode(null);
    main.classList.remove("has-zoom");
    return;
  }
  node.classList.add("pane-zoomed");
  for (let el: HTMLElement | null = node; el && el !== main; el = el.parentElement) {
    for (const kid of Array.from(el.parentElement?.children ?? [])) {
      if (kid !== el) kid.classList.add("pane-hidden");
    }
  }
}

/**
 * One key, widening by one region each press.
 *
 * *"There should be an easier way to zoom in on a window — it should be with
 * its split etc"*, and the second clause is the part that decides the shape.
 * Zoom-one-pane is the obvious feature and it is not what was asked for: a
 * writer reading a sefer in two columns wants both columns big. So the thing
 * being zoomed is a **region** — the pane, then the pane with what it is split
 * against, and so on out to the window, which is the way back to normal.
 *
 * `panes.nextZoom` decides; this only draws. Which is why the walk is testable
 * without a DOM, and why the arithmetic of "what does the next press mean" is
 * not spread across a key handler and a button.
 */
export function cyclePaneZoom() {
  panestate.setZoomedNode(panes.nextZoom(panestate.paneTree, panestate.activePane ?? panestate.focusedPane, panestate.zoomedNode));
  applyPaneZoom();
  // The glyph on every head, not just this one: the button says which state the
  // *window* is in, and a zoomed window whose other heads still offer "zoom"
  // is the mute-surface failure this repository keeps rebuilding.
  //
  // Nothing is persisted. A zoom is a way of looking at an arrangement rather
  // than part of one, and a session that came back zoomed would be a session
  // that came back with panes missing.
  refreshPaneHeads();
}

/** Draw the current pages into every preview pane there is. */
function drawCurrentIntoAll() {
  for (const host of document.querySelectorAll<HTMLElement>(".preview-host")) drawCurrentInto(host);
}

// Scrolling, between panes.
//
// **Not by the scrollbars.** It used to be `scrollTop / scrollHeight` on each
// side, under a comment claiming a percentage was "all a scrollbar can honestly
// be". A fraction of the source's pixels equals a fraction of the printed pixels
// only if every line of source prints, and in a Ksav document a great deal does
// not — comments, command heads, closing brackets, and everything inside a fold.
// The writer who found this said so in the same sentence they reported it:
// *"this might be because I have so many comments"*. A marked-up document is
// precisely the case where the old arithmetic is furthest off, which is to say
// the harder somebody works, the more wrong it got.
//
// The proportion survives; the currency changes. `scrollmap.ts` counts the
// characters that will actually print. The arithmetic now lives in
// `syncLinkedScroll`, because *which* pane follows which is a property of the
// pane tree rather than a fact about the one split this application used to have.
//
// What is left here is the other direction, which is not a proportion at all:
// clicking a rendered page puts the caret on the word that was clicked, by
// asking the compiler.
function wirePreviewClicks(host: HTMLElement) {
  host.addEventListener("click", (e) => {
    // A drag that ended here is a selection, not a click: the reader is copying
    // a rendered line, and moving the caret would take the selection with it.
    if (!isPlainClick(window.getSelection())) return;
    voidAction("general", () => jumpFromClick(e as MouseEvent));
  });
}

/**
 * Put the cursor on whatever was clicked in the preview.
 *
 * Nothing happens when there is no answer, and there are several honest ways to
 * have none: the click was on a margin, on a running head, on a note-band rule,
 * or the document does not currently compile. All of them mean "the writer did
 * not type this", and in a document whose whole apparatus is generated they are
 * common rather than exotic — so a miss says nothing rather than putting up a
 * message about every click on white space.
 */
/**
 * Open an included chapter and put the cursor on one of its lines.
 *
 * **One function, because there is one way to go to a place inside a part**, and
 * the app already had it: a diagnostic reported against a chapter has always
 * offered *"פרק ב · שורה 12"* and jumped there. It lived inline in the boot
 * wiring for `onGoToPart`, which made it reachable only from a diagnostic — and
 * so left a *click* in the preview, the gesture `settings.clickToSource` exists
 * for, landing on the same line number in the wrong document. Extracted rather
 * than duplicated, because a second way to open a chapter is how the two would
 * come to disagree about what happens when the chapter is not in the library.
 *
 * Says nothing when the name resolves to nothing. That is not a shrug: an engine
 * answer naming a document this library does not hold is a real possibility (a
 * `#כלול` of a part the writer then deleted), and the alternative to silence is
 * the thing this replaced — a caret at a line number that means nothing here.
 */
export async function gotoPart(file: string, line: number | null, column: number | null): Promise<boolean> {
  const entry = docs.library().find((e) => e.title === file);
  if (!entry || line == null) return false;
  await tabstrip.enterDoc(entry.id);
  const at = offsetOf(runtime.view, line, column);
  // **And nowhere rather than at the top.** `offsetOf` answers `null` for a line
  // past the end, and `?? 0` would have put the caret on line 1 of the *right*
  // document, which is the same class of wrong as the bug above and one step
  // further from the truth.
  if (at != null) runtime.jumpTo(at);
  return true;
}

async function jumpFromClick(e: MouseEvent) {
  // The direction that had no switch. Every other piece of the sync could be
  // turned off and this one could not, which is why the request named it.
  if (settings.clickToSource === false) return;
  const found = pageUnder(e.target);
  if (!found || !runtime.backend) return;
  // The page the reader actually clicked, which after a failed compile is not
  // the last compile's. Measuring a click against a page nobody is looking at
  // is the same defect as printing one.
  const svg = currentPages()[found.index];
  const box = pageBox(svg);
  if (!box) return;
  const at = pointInPage(found.index, found.node.getBoundingClientRect(), box, e.clientX, e.clientY);
  if (!at) return;

  const { body, offset } = bodyOnScreen();
  const spot = await runtime.backend.jump(body, docConfig(), at, docs.requestAssets(runtime.currentDoc?.assets ?? []));

  // # The line belongs to a chapter, so the caret belongs in the chapter
  //
  // This branch is the whole of #83 and it is three lines, because everything
  // needed was already here. The engine answered `file`, because a word printed
  // from `#כלול("פרק ב")` came out of **פרק ב** and not out of the sefer that
  // included it — and the line number it sent is that chapter's own line, which
  // is why subtracting this document's preamble offset from it below was not
  // merely unnecessary but wrong: it moved the number by exactly the amount the
  // chapter never had.
  //
  // What happened without this: click a word in a chapter, and the caret went to
  // that line number **in the parent**. A different sentence, no message, and a
  // reader who has just been told *"you are here"* by a click.
  //
  // `clickedChapter` is the same question `diagview.show` already asks for a
  // diagnostic, and it is one function because the two answering it differently
  // is what let this sit unnoticed.
  const chapter = clickedChapter(spot?.file, runtime.currentDoc?.title);
  if (chapter) {
    // `action` rather than a bare `await`, and the reason is the same one in
    // `asyncaction.ts`: this is an event handler, so a rejection from
    // `enterDoc` would become an unhandled rejection with nothing to show. A
    // chapter that will not open is reported, and the caret stays where it was.
    await action("general", () => gotoPart(chapter, spot!.line, spot!.column));
    return;
  }

  // The engine counts lines in the body it was sent, which carries the preamble
  // this client put in front. Same subtraction as a diagnostic's, same function.
  const line = lineInDocument(spot?.line ?? null, offset);
  if (line == null || line > runtime.view.state.doc.lines) return;
  const at_ = runtime.view.state.doc.line(line);
  // The column is counted in characters and CodeMirror counts in UTF-16 units,
  // which differ for anything outside the BMP. Walking the line's own text keeps
  // the two in step without either side having to know about the other.
  const col = Math.max(0, (spot?.column ?? 1) - 1);
  const chars = [...at_.text].slice(0, col).join("").length;
  // Claim the floor before the caret moves, or the preview shoves the reader.
  //
  // *"Clicking in preview brings you to the right place in the source, but moves
  // the actual preview, which it should not do."* Exactly so, and it is a loop
  // this function closes on itself: the dispatch below sets the selection, the
  // editor's update listener sees `selectionSet && !docChanged`, and
  // `followCaretInPreview` scrolls the preview to the caret. So a reader clicks
  // a word they are *looking at* and the page moves out from under them, to
  // land that same word wherever the sync setting says lines belong.
  //
  // `scrollFloor` is the mechanism that already exists for this and its meaning
  // is exactly right here — *somebody is driving this pane; do not steer* — it
  // was simply only ever claimed by scroll events. A click is not a scroll, so
  // nothing claimed it, so nothing declined to follow. Set before the dispatch
  // rather than after: `followCaretInPreview` schedules on a 100 ms timer and
  // reads the floor when it fires, but the transaction is synchronous and there
  // is no reason to leave a window at all.
  //
  // The source-side mirror of this has always been handled, differently and
  // correctly: a click in the source cancels the cheap line-level follow in
  // favour of the exact reveal it asked for. See `revealFromSourceClick`.
  panescroll.claimFloor("preview-click");
  runtime.view.dispatch({
    selection: { anchor: Math.min(at_.from + chars, at_.to) },
    scrollIntoView: true,
  });
  runtime.view.focus();
}

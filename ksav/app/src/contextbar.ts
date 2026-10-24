// The context bar: the strip that follows the caret and names what it is in.
// Owns: `contextBar` (the empty host), `updateContextBar` (the signature-based
// rebuild that answers every arrow key), and the heading-level readout's
// refresh — the half of the paragraph-style control that is caret-driven.
// Defers: the controls it shows to the registry (`structure.STRUCTURE_ACTIONS`)
// and the toolbar's paragraph-style block to `ribbon.ts`; the hydra, the
// shortcuts and the styles panel to the wiring object main.ts registers.
// Refuses: rebuilding when the answer would be identical — the signature is
// the whole of the performance story, and it is asserted in the fence.

import * as runtime from "./runtime";
import { dismissForeignHydra } from "./hydra";
import * as chrome from "./ribbon";
import * as structure from "./structure";
import * as styles from "./styles";
import * as lists from "./lists";
import { settings } from "./settings";
import { getLang, t, tf } from "./i18n";
import { el } from "./dom";
import { openPanel, closePanel } from "./panels";
import { keybindings, hintFor } from "./keyhint";
import { docTextOf } from "./spans";

const { chromeWiring } = chrome;

// ---------------------------------------------------------------- table editing
//
// Inserting #טבלה used to be the end of the help you got: adding a row or a
// column meant rewriting the call by hand and counting cells to keep them
// aligned with the declared column count. Getting that count wrong silently
// reflows the whole table.
//
// So: when the cursor is inside a table, a small bar appears with the structural
// operations. It is driven off the cursor rather than a click on the rendered
// preview, because the preview is an SVG picture of a page and has no idea which
// cell you pointed at.

export function contextBar(): HTMLElement {
  return el("div", { id: "context-bar", class: "context-bar", role: "toolbar" });
}

/**
 * Rebuild the contextual ribbon for wherever the caret is.
 *
 * Every control is generated from `STRUCTURE_ACTIONS`, so an operation added to
 * that registry appears here, in the palette, and in the shortcut list without
 * anything being wired up twice — and so a person can reorder or rebind it. The
 * previous version hard-coded four table buttons and their glyphs inline, which
 * is why lists had none: there was no list of operations to render, only a
 * paragraph of DOM.
 */
export function updateContextBar() {
  const bar = document.getElementById("context-bar");
  if (!bar || !runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const pos = runtime.view.state.selection.main.head;
  // A hydra owns the keyboard, so it must not outlive the thing it operates on.
  // Clicking into ordinary prose and then typing would otherwise have every
  // letter swallowed by a panel the writer had stopped thinking about — the
  // keyboard equivalent of a drawer with no close button.
  dismissForeignHydra(structure.structureNear(doc, pos)?.structure ?? null);

  // The paragraph-style readout follows the caret whether or not the ribbon has
  // anything to show, so it is updated before the early return below.
  //
  // `headingAt(doc, pos)` with two arguments fires its default third — the whole
  // heading list — to set the value of a `<select>`, on every arrow key. It is
  // memoised per scan now (`headings.ts`), so this is a lookup rather than a
  // filter-and-map over every node in the document, and it is the same array the
  // `StructureContext` below shares.
  const levelSel = document.getElementById("heading-level") as HTMLSelectElement | null;
  if (levelSel) {
    // The document's own styles are options in this list, so the list itself can
    // go stale — a style defined a keystroke ago has to be offerable now. Rebuilt
    // only when the set of names has actually changed, for the same reason the
    // value below is only assigned when it differs.
    const names = styles.findCustomStyles(doc).map((s) => s.name).join("\u0000");
    if (levelSel.dataset.styles !== names) {
      levelSel.dataset.styles = names;
      chrome.fillParagraphStyles(levelSel);
      // A style is an action, so the set of actions has changed. Without this a
      // style defined a keystroke ago is in the dropdown, in the palette and in
      // the keys drawer, and its chord does nothing — which is the worst of the
      // three states a shortcut can be in.
      chromeWiring().reconfigureShortcuts();
      chromeWiring().refreshStylesPanel();
    }
    const want = chrome.paragraphStyleAt(doc, pos);
    // Assigning `value` on a `<select>` is not free and fires no change event,
    // but it does invalidate style and can close a native dropdown the writer
    // has open. Most caret moves do not change the answer.
    if (levelSel.value !== want) levelSel.value = want;
    const num = document.getElementById("heading-level-number") as HTMLInputElement | null;
    // Blank for anything that is not a heading — body text and a custom style
    // alike. A number box showing 0, or showing the level of the last heading
    // you were in, would be saying something untrue about where the caret is.
    if (num) {
      const level = /^\d+$/.test(want) && want !== "0" ? want : "";
      if (num.value !== level) num.value = level;
    }
  }

  // Sticky by one character: see `structureNear`. Finishing a list left the
  // caret after the closing `)`, where the ribbon correctly emptied — and a
  // ribbon that disappears on the character after the one you just typed reads
  // as the feature breaking, not as the model being precise.
  const near = structure.structureNear(doc, pos)?.pos ?? pos;
  const here = structure.availableAt(doc, near);
  if (here.length === 0) {
    // In prose, and that is worth saying rather than showing nothing.
    //
    // This is the other half of a margin note: *"header was greyed out and no
    // reason was given"*. It was greyed correctly — the caret was in prose, so
    // every list and table operation had nothing to act on — and the strip then
    // vanished entirely, which is a product that looks broken rather than one
    // that is being precise. What a writer standing in prose can actually do to
    // a list is *make* one, so that is what the strip offers.
    //
    // **And behind a preference that is off**, because the same strip read from
    // the writing side is *"an annoying popup… I don't know why it popped up or
    // what it is"*. Both readings are correct and they are about two different
    // moments — one writer went looking for why a control was grey, the other
    // was typing a paragraph — so the strip is kept and the default is quiet.
    // See `Settings.proseStrip`.
    const sel = runtime.view.state.selection.main;
    if (settings.proseStrip && lists.canMakeList(doc, sel.from, sel.to)) {
      const signature = `prose|${getLang()}`;
      if (bar.dataset.signature !== signature || !bar.childElementCount) {
        bar.dataset.signature = signature;
        bar.replaceChildren(
          el("span", { class: "context-bar-label" }, [t("inProse")]),
          el(
            "button",
            {
              class: "tb-btn",
              title: `${t("makeList")} — ${t("makeListLede")}`,
              "aria-label": t("makeList"),
              onClick: () => chromeWiring().makeListHere(),
            },
            ["≔ ", el("span", { class: "tb-name" }, [t("makeList")])],
          ),
        );
      }
      openPanel("context-bar");
      return;
    }
    closePanel("context-bar");
    bar.replaceChildren();
    delete bar.dataset.signature;
    return;
  }
  const at = structure.whereAmI(doc, near)!;

  // Rebuild only when the ribbon would come out different.
  //
  // `replaceChildren` destroys and rebuilds the whole strip — up to eighteen
  // buttons and their listeners — and this function runs on **every arrow key**.
  // Moving the caret within one table cell produced identical markup and threw
  // the previous copy away anyway, so a writer holding the down arrow generated
  // a few hundred buttons a second for the collector, and any native tooltip or
  // focus on a ribbon button died under them.
  //
  // The signature is everything the render reads: which structure, the position
  // readout, and each action's id and enabled state in order. Not a hash — a
  // string, compared once, of a few hundred characters. Language and keybindings
  // are in it because the strip is rebuilt from scratch when either changes and
  // this must not out-vote that.
  const signature = [
    getLang(),
    at.structure,
    at.row,
    at.col,
    at.rows,
    at.cols,
    here.map(({ action, enabled }) => `${action.id}${enabled ? "+" : "-"}`).join(","),
  ].join("|");
  if (bar.dataset.signature === signature && bar.childElementCount) {
    openPanel("context-bar");
    return;
  }
  bar.dataset.signature = signature;

  // Hoisted. It was read inside the loop below — seventeen times in a table,
  // and `keybindings()` rebuilds the whole map from settings on each call, so a
  // caret move in a table cost ~850 property copies for a value that cannot
  // change mid-loop. `structureMenuItems` (ribbon.ts, where the menus moved) hoists it the same way.
  const keys = keybindings();

  const children: Node[] = [
    el("span", { class: "context-bar-label" }, [
      at.structure === "table"
        ? tf("tableAt", String(at.row), String(at.col), String(at.rows), String(at.cols))
        : at.structure === "heading"
          ? tf("headingAt", String(at.row), String(at.rows), String(at.col))
          : tf("listAt", String(at.row), String(at.rows), String(at.col)),
    ]),
  ];

  let group = "";
  for (const { action, enabled } of here) {
    // A separator between groups, so rows, columns and whole-table operations
    // read as three things rather than one wall of glyphs.
    if (group && action.group !== group) children.push(el("span", { class: "tb-sep" }));
    group = action.group;
    const hint = hintFor(action.id, keys);
    const name = t(action.label);
    // Why this one is greyed, when it is. On the ribbon the caret is always
    // inside the structure already, so this is never "you are not in a table" —
    // it is the useful half: *this is the top row*.
    const why = enabled ? null : structure.whyNot(action, doc, near);
    children.push(
      el(
        "button",
        {
          class: "tb-btn" + (enabled ? "" : " disabled"),
          // The key is in the tooltip because a shortcut nobody can find is the
          // same as no shortcut — the same rule the nikud bar follows. When the
          // button cannot act, the reason takes the tooltip's place: the key is
          // no use to somebody who has just been refused.
          title: why ? `${name} — ${t(why)}` : hint ? `${name} · ${hint}` : name,
          "aria-label": name,
          // The whole ribbon, and the only place these three shapes are built.
          //
          // Tagged so a switch rebuilds them: measured 2026-09-27 in a real
          // browser, this one line left every ribbon button in Hebrew after a
          // switch to English. The accessible name stays the bare label — a
          // screen reader has no use for "· Alt+a" — so `title` and `aria-label`
          // take different argument lists, and a leading `:` in one of them means
          // "this is a key". The chord is a literal: `Alt+a` is `Alt+a` in Hebrew.
          "data-i18n-label": action.label,
          "data-i18n-title-args": JSON.stringify([`:${action.label}`, why ?? hint ?? ""]),
          "data-i18n-title": why ? "msg.reason" : hint ? "msg.shortcut" : action.label,
          // `aria-disabled`, not `disabled`. A `disabled` button cannot be
          // clicked, cannot be focused and — with `pointer-events: none` on top
          // of it — cannot even be hovered on a touchscreen, so the one control
          // that knows why it is refusing is the one control that cannot say
          // so. Eighteen greyed arrows and no way to ask any of them a question.
          // Pressed, it now answers.
          "aria-disabled": enabled ? null : "true",
          onClick: () => {
            if (why) {
              runtime.setStatus(t(why), "warn");
              return;
            }
            chromeWiring().runStructureAction(action, true);
          },
        },
        // The two or three a writer reaches for carry their name. A Word user
        // does not discover a feature by hovering eleven arrows, and Word
        // labels its ribbon; labelling all eighteen table operations would be a
        // wall of text, so `primary` picks the ones worth the width.
        action.primary ? [action.glyph + " ", el("span", { class: "tb-name" }, [name])] : [action.glyph],
      ),
    );
  }
  bar.replaceChildren(...children);
  openPanel("context-bar");
}

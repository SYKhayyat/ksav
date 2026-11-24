// The ribbon: the toolbar, the menus hung under it, and the wiring through
// which they reach the subsystems whose verbs they name.
// Owns: `buildToolbar` and every `build*Menu`, the paragraph-style control,
// the lazy-menu mechanism, the key-cap and command-row builders, and the
// `ChromeWiring` registration point the context strip shares.
// Defers: the verbs to their subsystems — snippets and insertion rules to
// main.ts until wave 5, the styles drawer until wave 8, macros and hydra until
// wave 7 — arriving here as one registered object, never as imports of main.
// Refuses: implementing a verb. A menu row is a name, a glyph, a legality
// answer and a callback; the callback belongs to the subsystem that owns it.

import { EditorView } from "@codemirror/view";
import * as runtime from "./runtime";
import * as structure from "./structure";
import * as heads from "./headings";
import * as styles from "./styles";
import { ALIGN_ORDER, settings } from "./settings";
import { edgeAt } from "./alignment";
import { getLang, t, tf, hasKey } from "./i18n";
import { el, iconBtn, noticeHost } from "./dom";
import { closeMenus, toggleMenu } from "./panels";
import { hintFor, hintIsMode } from "./keyhint";
import { docLang, insertSnippet } from "./insert";
import { docTextOf } from "./spans";
import { typstString } from "./typst-escape";
import { scheduleCompile } from "./compile";

// ------------------------------------------------------------------- wiring
//
// The ribbon names verbs from half a dozen subsystems that main.ts still owns
// (their own waves move them), and the context strip needs the same few shell
// behaviours. Rule 4 of the split: those arrive here as one registered object
// and never as a backwards import. The registration itself is main.ts's boot,
// exactly as `wirePanes` is for the pane modules.

export interface ChromeWiring {
  /** The editor verbs wave 12 has not claimed — main's own, by the plan's holding. */
  entityAct(what: "select" | "unwrap" | "remove"): boolean;
  foldToLevel(view: EditorView, level: number): void;
  foldListsToDepth(view: EditorView, depth: number): void;
  hiddenBreak(): void;
  hideBlockHere(): void;
  hideLineHere(): void;
  insertFold(): void;
  runStructureAction(action: structure.StructureAction, sticky?: boolean): boolean;
  makeListHere(): boolean;
  /** The styles drawer's verbs — stylespanel imports this file's `docTextNow`,
   *  so a direct import would cycle; they stay borrowed. */
  applyCustomStyle(name: string): boolean;
  unwrapCustomStyle(name: string): void;
  openNewStyle(): void;
  openStyleEditor(name: string): void;
  openStylesFor(level: number): void;
  addContentsHere(): boolean;
  /** Save-as lives in fileui, which imports this file's `clearChromeNotice`. */
  saveFileAs(): Promise<void>;
  /** The context strip: contextbar.ts owns it, the ribbon refreshes it. */
  refreshContextBar(): void;
  reconfigureShortcuts(): void;
  refreshStylesPanel(): void;
}


let chromeWired: ChromeWiring | undefined;

/** Register the chrome wiring. Called once, from main.ts's boot. */
export function wireChrome(w: ChromeWiring): void {
  chromeWired = w;
}

/** The wiring, for this module and the context strip. */
export const chromeWiring = (): ChromeWiring => {
  if (!chromeWired) throw new Error("wireChrome was never called: the chrome wiring is missing");
  return chromeWired;
};

/**
 * How many heading levels the table of contents shows.
 *
 * One control that means two things depending on what the document already
 * says, and that is the point rather than a shortcut: before there is a
 * contents it decides what the next one will be, and after there is one it
 * rewrites that call. A separate "edit the contents" door would have been a
 * second implementation of one choice, which is the shape this repository keeps
 * having to collapse.
 */
export function contentsDepthRow(): HTMLElement {
  const doc = docTextNow();
  const live = heads.contentsDepth(doc);
  const has = !heads.canAddContents(doc);
  const sel = el(
    "select",
    {
      id: "contents-depth",
      onChange: (e: Event) => {
        const raw = (e.target as HTMLSelectElement).value;
        const depth = raw === "" ? null : Number(raw);
        const made = has
          ? heads.setContentsDepth(doc, depth)
          : heads.addContents(doc, docLang(), depth);
        closeMenus();
        if (!made) return;
        runtime.editDoc(made.text, made.caret);
        runtime.view?.focus();
      },
    },
    [
      el("option", { value: "", ...(live === null ? { selected: "selected" } : {}) }, [
        t("contentsDepthAll"),
      ]),
      ...[1, 2, 3, 4, 5].map((n) =>
        el("option", { value: String(n), ...(live === n ? { selected: "selected" } : {}) }, [
          tf("contentsDepthN", n),
        ]),
      ),
    ],
  );
  return el("div", { class: "menu-input-row" }, [
    el("span", { class: "menu-cat" }, [t("contentsDepth")]),
    sel,
    el("div", { class: "menu-desc" }, [t(has ? "contentsDepthEdits" : "contentsDepthMakes")]),
  ]);
}

/**
 * The `<code>` that goes beside a menu item, or an empty slot.
 *
 * The empty `<span>` is not decoration: the rows are a grid, and a missing cell
 * shifts everything after it left. It survives because an action can still be
 * deliberately unbound — under a mode there is always something to say.
 *
 * `kb` is taken rather than read, so the callers that hoist it out of a loop go
 * on hoisting it: `keybindings()` rebuilds the whole map from settings on every
 * call, and the context bar asks seventeen times for one table.
 */
export function keyCode(id: string, kb?: Record<string, string>, cls?: string): HTMLElement {
  const hint = hintFor(id, kb);
  if (!hint) return el("span");
  const classes = [cls, hintIsMode() ? "sc-key-mode" : ""].filter(Boolean).join(" ");
  return classes ? el("code", { class: classes }, [hint]) : el("code", {}, [hint]);
}

// ---------------------------------------------------------------- app chrome
//
// Every button in this app is a glyph. That is defensible for a dense editing
// toolbar and indefensible without names: a `title` tooltip is not an accessible
// name, so a screen reader announced the toolbar as "†, button", "⁑, button",
// "▤, button" — forty-two of them, page-wide, with zero `aria-label` and no
// landmarks. Worse for everyone, sighted users included: ⁑ ⇥ ⇤ ▣ § א. ‡ ▤ ⋯ ◫
// ◧ ⊟ ⊞ ＃ is a private vocabulary with nothing to learn it from, in a product
// whose competition is Word's labelled ribbon groups.
//
// So `iconBtn` requires a name and sets `aria-label` from it, and the toolbar is
// a set of *labelled* groups — visible captions for sighted users, `role=group`
// with `aria-label` for assistive technology.

/**
 * The open document's text, or `""` when there is no editor yet.
 *
 * The obvious spelling is a nullish coalesce straight into `docTextOf`, with an
 * empty string as the fallback — and it **throws**. `docTextOf` memoises on a
 * `WeakMap` keyed by the `Text` object, and a `WeakMap` refuses a primitive key,
 * so the branch that looks like the safe default is the one that cannot work.
 * The chrome is built once before the editor exists, which is that branch, on
 * every boot: it took the whole application down with a blank page and nothing
 * in the console, because an unhandled rejection in `boot()` is not a console
 * message.
 */
export function docTextNow(): string {
  return runtime.view ? docTextOf(runtime.view.state.doc) : "";
}

/**
 * The paragraph-style control: what this paragraph *is*, and the two doors out.
 *
 * The dropdown is the readout — rebuilt on every selection change by
 * `updateContextBar`, so it says where the caret actually is rather than what
 * was last pressed — and it is bound to the same registry operations as
 * everything else: a level runs `heading.levelN`, "body text" unwraps.
 *
 * Three things the margin asked for and it did not have:
 *
 *   - **A number.** Nine levels in a dropdown means levels 4 to 9 are a scroll,
 *     and a writer working at depth knows the number they want. Typing it is one
 *     gesture where picking it is three.
 *   - **Other.** The tenth entry every word processor has — a style of the
 *     writer's own, named, created and applied in one act. See `styles.ts`.
 *   - **Edit this one.** The formatting behind whatever is applied here, without
 *     first working out which of the styles panel's nine sections owns it. For a
 *     heading that is the Headings section at *this* level; for a custom style it
 *     is that style's own knobs.
 */
export function paragraphStyleControl(): HTMLElement {
  const sel = el("select", {
    id: "heading-level",
    class: "heading-select",
    title: t("paragraphStyle"),
    "aria-label": t("paragraphStyle"),
  });
  fillParagraphStyles(sel);
  sel.addEventListener("change", () => applyParagraphStyle(sel.value));

  // 1 to `MAX_LEVEL`, and no zero: "not a heading" is a different answer and it
  // is the dropdown's, where it can be named. A blank box means *this paragraph
  // is not one*, which is also what it shows when the caret is in body text.
  const level = el("input", {
    type: "number",
    class: "heading-number",
    min: 1,
    max: heads.MAX_LEVEL,
    step: 1,
    id: "heading-level-number",
    title: t("headingLevel"),
    "aria-label": t("headingLevel"),
  });
  level.addEventListener("change", () => {
    const want = parseInt(level.value, 10);
    if (!Number.isFinite(want) || want < 1 || want > heads.MAX_LEVEL) {
      runtime.setStatus(tf("headingLevelRange", String(heads.MAX_LEVEL)), "warn");
      chromeWiring().refreshContextBar();
      return;
    }
    applyParagraphStyle(String(want));
  });

  return el("span", { class: "tb-split" }, [
    sel,
    level,
    iconBtn("✎", t("editThisStyle"), () => editParagraphStyle(sel.value)),
  ]);
}

/** The dropdown's options: body text, the levels, this document's own styles, other. */
export function fillParagraphStyles(sel: HTMLSelectElement) {
  const doc = docTextNow();
  sel.replaceChildren(el("option", { value: "0" }, [t("bodyText")]));
  for (let i = 1; i <= heads.MAX_LEVEL; i++) {
    sel.append(el("option", { value: String(i) }, [t("headingLevel" + i)]));
  }
  const own = styles.findCustomStyles(doc);
  if (own.length) {
    sel.append(
      el(
        "optgroup",
        { label: t("customStyles") },
        // The chord beside the name, which is the other half of *"that binding
        // must appear wherever the style appears"*. An `<option>` holds text
        // and nothing else, so it is spelled into the label — and through
        // `hintFor`, so under a mode it prints what to type instead.
        own.map((s) => {
          const hint = hintFor(styles.styleActionId(s.name));
          return el("option", { value: `custom:${s.name}` }, [
            hint ? `${s.name} · ${hint}` : s.name,
          ]);
        }),
      ),
    );
  }
  sel.append(el("option", { value: "new" }, [t("newStyle")]));
}

/** What the dropdown should be showing, given where the caret is. */
export function paragraphStyleAt(doc: string, pos: number): string {
  const own = styles.customStyleAt(doc, pos);
  if (own) return `custom:${own.name}`;
  const heading = heads.headingAt(doc, pos);
  return String(heading ? heading.level : 0);
}

/**
 * Light the alignment button the caret's paragraph is already on.
 *
 * A word processor shows the current alignment the way it shows bold — pressed —
 * and without it the three buttons were a guess: pressing the one already in
 * force did something (it wrapped another call) and nothing on screen said which
 * edge the paragraph was on. `insert.alignment` answers *what* the paragraph is
 * already aligned to; this is where the answer becomes visible.
 *
 * Read off the document rather than kept as state, because the truth is in the
 * text: the writer can also change it by editing `#ימין[…]` by hand, and a
 * remembered value would then be a control lying about the file.
 */
export function refreshAlignState(): void {
  if (typeof document === "undefined" || !document.querySelectorAll) return;
  const buttons = document.querySelectorAll(".tb-align-btn[data-align]");
  if (!buttons.length) return;
  const v = runtime.view;
  const edge = v ? edgeAt(docTextOf(v.state.doc), v.state.selection.main.head) : null;
  for (const btn of buttons) {
    const on = btn.getAttribute("data-align") === edge;
    if ((btn.getAttribute("aria-pressed") === "true") !== on) {
      btn.setAttribute("aria-pressed", String(on));
    }
  }
}

function applyParagraphStyle(value: string) {
  const doc = docTextOf(runtime.view.state.doc);
  const pos = runtime.view.state.selection.main.head;
  if (value === "new") {
    chromeWiring().openNewStyle();
    return;
  }
  if (value.startsWith("custom:")) {
    chromeWiring().applyCustomStyle(value.slice("custom:".length));
    return;
  }
  const want = parseInt(value, 10);
  if (want === 0) {
    // Body text unwraps whichever of the two this paragraph is. The custom style
    // first, because a styled heading is a heading with a wrapper inside it and
    // taking the outer one off would take the heading with it.
    const own = styles.customStyleAt(doc, pos);
    if (own) {
      chromeWiring().unwrapCustomStyle(own.name);
      return;
    }
    const h = heads.headingAt(doc, pos);
    if (!h) return;
    // Null for a heading whose level the prelude fixes (`#סימן`): unwrapping
    // one would drop its number, which is the writer's text.
    const e = heads.unwrapHeading(doc, h);
    if (!e) return;
    runtime.editDoc(e.text, e.caret);
    scheduleCompile();
    runtime.view.focus();
    return;
  }
  const action = structure.actionById(`heading.level${want}`);
  if (action) chromeWiring().runStructureAction(action);
  runtime.view.focus();
}

/** The pencil: open whatever is applied here for editing, and say when nothing is. */
function editParagraphStyle(value: string) {
  if (value.startsWith("custom:")) {
    chromeWiring().openStyleEditor(value.slice("custom:".length));
    return;
  }
  const level = parseInt(value, 10);
  if (!level) {
    // Body text has no style of its own to open — the document's own text
    // settings are page setup, which is a different drawer, so say that rather
    // than opening the wrong one.
    runtime.setStatus(t("noStyleToEdit"), "warn");
    return;
  }
  // The Headings section already edits per-level design; this points it at the
  // level in hand, which is the step a writer otherwise has to work out.
  chromeWiring().openStylesFor(level);
}

/**
 * The colour the highlighter is about to use.
 *
 * Session state and not a setting: it is the *last colour picked*, which is what
 * every word processor's highlighter remembers and what nobody wants to find in
 * a settings drawer. It starts on Typst's own default so the button, the palette
 * and `#סימון[…]` typed by hand all put the same thing on the page.
 */
let highlightColour = styles.DEFAULT_HIGHLIGHT;

/**
 * A control whose command did not arrive, drawn as a control that says so.
 *
 * # The finding (#105)
 *
 * `b()` returned `el("span")` for a command the registry did not contain — an
 * element with no glyph, no name and no tooltip. So a registry that resolved
 * empty deleted the ribbon **silently**: the writer saw a shorter toolbar and
 * nothing anywhere said why, which is indistinguishable from a product that
 * simply has fewer buttons.
 *
 * A missing command now renders with its glyph, a visible strike through it, and
 * a title that says what happened and what to do. The writer can see that
 * something belongs there, and pressing it re-runs the registry load rather than
 * doing nothing.
 */
export function missingControl(glyph: string, command: string): HTMLElement {
  return iconBtn(
    glyph,
    t("registryMissing"),
    () => showChromeNotice("registriesFailed"),
    "tb-btn tb-btn-missing",
    { "data-missing": command },
  );
}

/**
 * The highlighter, and the colour it will use.
 *
 * *"Highlight should offer a colour"* — and the engine had offered one all
 * along, under a second name (`#רקע`) that the toolbar was not wired to. The
 * colour is an argument on `#סימון` now, so this is one control: press the pen
 * to highlight, press the swatch to change what colour it highlights in. The
 * swatch is a real `input[type=color]` rather than a palette of five, because
 * the argument takes any colour and a fixed palette would be the product being
 * narrower than the document format again.
 */
export function highlightControl(label: string, lead: Node[] = [], size = "small"): HTMLElement {
  const writing = docLang();
  const cmd = runtime.commandsReg.find((c) => c.he === "סימון");
  if (!cmd) return missingControl(label, "סימון");
  const name = writing === "he" ? cmd.he : cmd.en;
  const desc = getLang() === "he" ? cmd.desc_he : cmd.desc_en;
  const swatch = el("input", {
    type: "color",
    class: "tb-swatch",
    value: highlightColour,
    title: t("highlightColour"),
    "aria-label": t("highlightColour"),
  });
  const apply = () => {
    highlightColour = swatch.value;
    // The default colour is written as the bare command, so the common case
    // leaves the source exactly as it was before there was a swatch — and a
    // document-wide restyle of highlights stays possible for the writer who
    // never asked for a particular one.
    // Written in Hebrew and translated by `insert.plan`, like every other
    // snippet: an English document gets `#mark(color: …)`.
    insertSnippet(
      highlightColour.toLowerCase() === styles.DEFAULT_HIGHLIGHT
        ? "#סימון[|]"
        : `#סימון(צבע: rgb(${typstString(highlightColour)}))[|]`,
    );
  };
  // Picking a colour highlights with it. A swatch that only *records* a choice
  // would make every use two gestures, and the second one invisible.
  swatch.addEventListener("change", apply);
  return el("span", { class: "tb-split" }, [
    el(
      "button",
      {
        class: "tb-btn ribbon-btn",
        type: "button",
        title: `${desc} · #${name}`,
        "data-command": cmd.he,
        "data-size": size,
        ...(size === "icon" && lead.length ? { "aria-label": label } : {}),
        onClick: apply,
      },
      [...lead, el("span", { class: "ribbon-lbl" }, [label])],
    ),
    swatch,
  ]);
}

/**
 * The three edges, in the order `settings.ALIGN_ORDER` offers them (#136), by
 * the command each one runs.
 *
 * The paragraph group draws its alignment faces in this order, not the order
 * `HOME` lists them in, so the ribbon and the settings control cannot come to
 * different opinions about the order. In an English interface the old
 * hand-written row showed the right-align button on the left of its group. The
 * glyphs name edges (`⇤` left, `≡` centre, `⇥` right) and do not mirror, so
 * neither does the order: the row is pinned left-to-right in `styles.css`.
 */
const ALIGN_BUTTON: Record<(typeof ALIGN_ORDER)[number], { he: string; glyph: string }> = {
  left: { he: "שמאל", glyph: "⇤" },
  center: { he: "מרכז", glyph: "≡" },
  right: { he: "ימין", glyph: "⇥" },
};

/** Which edge a command aligns to, if it is one of the three. */
export function alignEdgeOf(he: string | undefined): (typeof ALIGN_ORDER)[number] | undefined {
  return ALIGN_ORDER.find((edge) => ALIGN_BUTTON[edge].he === he);
}

/**
 * A menubar menu.
 *
 * The header is rendered once, so a menu built there freezes whatever the data
 * looked like at boot — the document library would still say "Untitled" long
 * after the document had been titled. Building on open keeps it honest.
 *
 * `name` is required for the same reason `iconBtn` requires an accessible name:
 * every label here is an emoji plus a translated word, so the menubar had no
 * identity that survived switching the interface to English. `data-menu` is that
 * identity, and it is the only way anything outside this file — the acceptance
 * run in `.github/scripts/acceptance.mjs`, today — can say *which* menu it means.
 *
 * The items are built on open, so the menu has to be opened before its contents
 * exist in the document at all. That is deliberate and worth knowing about: a
 * selector for a menu item that never clicks the button first finds nothing, and
 * will report it as a missing feature.
 */
export function lazyMenu(
  name: string,
  // Words, or a drawing with words (a folded ribbon group's icon and name).
  label: string | readonly (Node | string)[],
  build: () => (Node | string)[],
  // The accessible name, when the label is a glyph (`⋯`, `⚙`) or a drawing rather than a word.
  ariaLabel?: string,
): HTMLElement {
  const words = typeof label === "string" ? label : undefined;
  const list = el("div", { class: "menu-list", role: "menu", "aria-label": ariaLabel ?? words ?? null });
  const btn = el("button", {
    class: "menu-btn",
    type: "button",
    "aria-haspopup": "true",
    "aria-expanded": "false",
    "aria-label": ariaLabel ?? null,
    onClick: (e: Event) => {
      e.stopPropagation();
      const opened = toggleMenu(list, btn, () => {
        list.replaceChildren();
        list.append(...build().map((n) => (typeof n === "string" ? document.createTextNode(n) : n)));
      });
      // **Back to the top.** Replacing the children does not reset the scroll
      // position, so Insert — the tallest menu in the product by a long way —
      // reopened halfway down wherever it was left, which reads as a menu that
      // has lost its first twenty items. Wanted at the top, and configurable,
      // because somebody working through one long stretch of it wants the
      // opposite and is entitled to say so.
      //
      // **After `toggleMenu`, not inside its `fill`.** The fill runs before the
      // `open` class goes on, and a hidden element has no scroll to set: written
      // there it was a line that read correctly, ran on every open, and did
      // nothing at all. Found by driving it.
      if (opened && !settings.keepMenuPosition) list.scrollTop = 0;
    },
  }, typeof label === "string" ? [label] : [...label]);
  return el("div", { class: "menu", "data-menu": name }, [btn, list]);
}

// ---------------------------------------------------------------- the chrome banner
//
// The one banner across the top, and the buttons on it. It was main's glue
// until wave 11; the ribbon is the chrome module, and this is chrome.

/**
 * One labelled action on the chrome banner.
 *
 * `press` rather than `run`: this is a button on a banner and not an `Action`
 * from the command registry, and `chrome.test.mjs` fences `.run` to keep every
 * command going through `runAction` so the macro recorder sees it. One name for
 * two unrelated things is how that fence starts reporting the wrong offence.
 */
export interface NoticeAct {
  /** An i18n **key**, or `label` for text that is not one. */
  key?: string;
  label?: string;
  press: () => void;
}

/**
 * The banner across the top, and the buttons on it.
 *
 * The lighter sibling of the save-error banner: that one is red because text is
 * at risk, this one is amber because only the toolbar is. Both live in the same
 * `.notices` stack, so neither can hide the other.
 *
 * Every action names itself, and that is the whole change from the version
 * that took a bare callback. The label used to be `t("retrySave")` for all of
 * them, so a banner offering a document rescued from a crash, and a banner
 * announcing a new release, and a banner saying the file had changed on disk,
 * all carried one button reading "Try again" — which answers none of those
 * three questions and actively misdescribes two of them. The type is the fix:
 * an action cannot be attached without a label for it.
 */
export function showChromeNotice(message: string, ...acts: NoticeAct[]) {
  document.getElementById("chrome-error")?.remove();
  const banner = el("div", { id: "chrome-error", class: "chrome-error", role: "alert" }, [
    // **A key, not the string it resolves to.** The banner used to be built with
    // `t("…")` at the moment of failure and then sat in the DOM for as long as
    // the problem lasted, so a writer who changed language kept reading a
    // notice in the language it was born in. `browserlang`'s residue fence
    // caught exactly two of these — `registriesGaveUp` and `retrySave` — and it
    // was right to: both have English values, so nothing about them is
    // legitimately Hebrew. The fix is the same one `panels.ts` already uses for
    // headings, and `hasKey` is the guard that turns "a call site passed the
    // answer where the question belonged" into a boot-time error.
    el("span", { class: "save-error-text", ...(hasKey(message) ? { "data-i18n": message } : {}) }, [
      hasKey(message) ? t(message) : message,
    ]),
    ...acts.map((a) =>
      el(
        "button",
        {
          class: "save-error-act",
          type: "button",
          onClick: a.press,
          ...(a.key ? { "data-i18n": a.key } : {}),
        },
        [a.key ? t(a.key) : (a.label ?? "")],
      ),
    ),
  ]);
  noticeHost().append(banner);
}

export function clearChromeNotice() {
  document.getElementById("chrome-error")?.remove();
}

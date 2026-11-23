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
import { getLang, t, tf, hasKey, type Lang } from "./i18n";
import { el, iconBtn, tbGroup, noticeHost } from "./dom";
import { closeMenus, toggleMenu } from "./panels";
import { hintFor, hintIsMode } from "./keyhint";
import { docLang, insertSnippet, tieredNoteHere } from "./insert";
import { openPalette } from "./palette";

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
function paragraphStyleControl(): HTMLElement {
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
function missingControl(glyph: string, command: string): HTMLElement {
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
function highlightControl(writing: Lang): HTMLElement {
  const cmd = runtime.commandsReg.find((c) => c.he === "סימון");
  if (!cmd) return missingControl("▨", "סימון");
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
    iconBtn("🖍", `${desc} · #${name}`, apply, "", { "data-command": cmd.he }),
    swatch,
  ]);
}

/**
 * A note button, labelled with its name *and* its shortcut.
 *
 * `snippet: null` means "read the caret" — the tiered note is `#הערה_א` in
 * prose, `#הערה_ב` inside a note and `#הערה_ג` inside two, which is the only
 * way one button can mean "a note on this".
 */
function noteBtn(action: string, glyph: string, snippet: string | null): HTMLElement {
  const hint = hintFor(action);
  const title = t("sc." + action) + (hint ? ` · ${hint}` : "");
  // `iconBtn` writes `title` **and** `aria-label` from the one string above, so
  // one `data-i18n-both` covers both — and the chord is an argument rather than
  // part of the key, because `Ctrl+Shift+F` is `Ctrl+Shift+F` in Hebrew and the
  // sentence around it is not. Measured 2026-09-27: this one function left every
  // note button in Hebrew after a switch to English.
  const i18n: Record<string, string> = hint
    ? { "data-i18n-both": "msg.shortcut", "data-i18n-both-args": JSON.stringify([`:sc.${action}`, hint]) }
    : { "data-i18n-both": `sc.${action}` };
  return iconBtn(
    glyph,
    title,
    () => {
      const st = runtime.view.state;
      insertSnippet(snippet ?? tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
    },
    "",
    { "data-action": action, ...i18n },
  );
}

export function buildToolbar(): HTMLElement {
  const lang = getLang();
  // No commands at all is not a state this product can be in, and drawing an
  // empty toolbar would present it as one. Said in words, in the surface the
  // writer is looking at, with the retry the notice already carries.
  if (runtime.commandsReg.length === 0) {
    return el("div", { class: "toolbar toolbar-empty", role: "toolbar", "aria-label": t("toolbar") }, [
      el("span", { class: "toolbar-failed", role: "status" }, [t("registriesFailed")]),
    ]);
  }
  // Two languages in one tooltip, and they are not the same question. The
  // *description* is the interface's, because it is being read; the **command
  // name** is the document's, because it is what the button is about to write.
  // An English toolbar reading "Bold text · #הדגשה" over a button that inserts
  // `#bold` is naming something that will not be in the document.
  const writing = docLang();
  const byName = (he: string) => runtime.commandsReg.find((c) => c.he === he);
  /**
   * A button in a group its category does not name, with the reason why.
   *
   * The ribbon groups by *what a writer reaches for*; the registry groups by
   * *what a command is*. Those two agree almost everywhere, and where they do
   * not, the disagreement is a product decision worth writing down rather than
   * a mistake worth hiding. `toolbar.test.mjs` checks membership against the
   * registry and lets a `guest` through — so the check stays total, and every
   * exception to it is one line away from the button it excuses.
   *
   * `why` is never read at runtime. It is there to be read by a person, and to
   * make declaring a guest cost a sentence of justification rather than nothing.
   */
  const guest = (he: string, label: string, _why: string) => b(he, label);
  const b = (he: string, label: string) => {
    const c = byName(he);
    if (!c) return missingControl(label, he);
    const title = lang === "he" ? c.desc_he : c.desc_en;
    return iconBtn(label, `${title} · #${writing === "he" ? c.he : c.en}`, () => insertSnippet(c.insert), "", {
      "data-command": c.he,
    });
  };

  /**
   * The three edges, in the order `settings.ALIGN_CHOICES` offers them (#136).
   *
   * Built from that list rather than typed out here, so the ribbon and the
   * settings control cannot come to different opinions about the order — which
   * is exactly what they had, and what a writer saw as the right-align button
   * sitting on the left of its group in an English interface. The glyphs name
   * edges (`⇤` left, `≡` centre, `⇥` right) and do not mirror, so neither does
   * the order: the row is pinned left-to-right in `styles.css` and reads the
   * same in Hebrew and in English.
   */
  const ALIGN_BUTTON: Record<(typeof ALIGN_ORDER)[number], { he: string; glyph: string }> = {
    left: { he: "שמאל", glyph: "⇤" },
    center: { he: "מרכז", glyph: "≡" },
    right: { he: "ימין", glyph: "⇥" },
  };
  /**
   * One alignment button, which knows which edge it is and whether that edge is
   * the paragraph's already.
   *
   * `data-align` is the vocabulary the state is written and read in — `data-command`
   * names the command, and the Hebrew spelling of a command is not the answer to
   * "which of these three is on". `refreshAlignState` fills `aria-pressed` from
   * the paragraph the caret is in, the way B/I would if the ribbon showed their
   * state; until it runs, every one of them says `false`, which is what a ribbon
   * built before the editor exists actually knows.
   */
  const alignBtn = (edge: (typeof ALIGN_ORDER)[number]) => {
    const c = byName(ALIGN_BUTTON[edge].he);
    if (!c) return missingControl(ALIGN_BUTTON[edge].glyph, ALIGN_BUTTON[edge].he);
    const title = lang === "he" ? c.desc_he : c.desc_en;
    return iconBtn(
      ALIGN_BUTTON[edge].glyph,
      `${title} · #${writing === "he" ? c.he : c.en}`,
      () => insertSnippet(c.insert),
      "tb-align-btn",
      { "data-command": c.he, "data-align": edge, "aria-pressed": "false" },
    );
  };
  const alignGroup = tbGroup(
    t("cat.align"),
    ALIGN_ORDER.map((edge) => alignBtn(edge)),
    "tb-align",
  );

  return el("div", { class: "toolbar", role: "toolbar", "aria-label": t("toolbar") }, [
    tbGroup(t("cat.style"), [
      b("הדגשה", "B"),
      b("נטוי", "I"),
      b("קו_תחתון", "U"),
      b("קו_חוצה", "S"),
      highlightControl(writing),
    ]),
    // The paragraph-style control, which is a word processor's single most-used
    // widget and which Ksav did not have. Three fixed buttons could only reach
    // three of nine levels, and could not tell the writer which one they were
    // standing in — a dropdown does both, and is where a Word user looks first.
    // **"Styles", not "Headings".** Reported from the writing side: *"it says
    // Heading, when it should be styles"*, and they were right about what the
    // group holds. The dropdown under this label offers body text, the nine
    // heading levels, **every style the writer has defined in this document**,
    // and "new style…" — so a label naming one of those four was telling a
    // writer their own styles were somewhere else. It is the Styles group in
    // every word processor there is, for the same reason.
    //
    // Its own key rather than a changed one: `cat.heading` is the *command
    // registry's* category, and the Insert menu's Headings section is correctly
    // named by it.
    tbGroup(t("styleGroup"), [paragraphStyleControl()]),
    tbGroup(t("cat.list"), [b("רשימה", "•"), b("ממוספרת", "1.")]),
    // Its own group, because a table is not a list.
    //
    // `#טבלה` sat in the group captioned "Lists" until a writer said so:
    // *"Table is still under lists. That is not at all accurate."* — and
    // "still" is the word that matters. `menus.ts` had already given tables
    // their own menu, and `commands.rs` had already categorised every table
    // command as `table`; the ribbon is hand-assembled and had never heard of
    // either. So the taxonomy was fixed in the two places that publish it and
    // wrong in the one place a writer actually looks.
    //
    // The captions here **are** registry category keys, which is what makes
    // `toolbar.test.mjs` able to check membership against the registry rather
    // than against a second list. That check is the point of this change: one
    // misfiled button is a nuisance, and the mechanism that let it stay misfiled
    // through a taxonomy rewrite is the defect.
    tbGroup(t("cat.table"), [b("טבלה", "▦")]),
    // The toolbar told the truth about one of these three.
    //
    // `†` was right. `⁑` inserted `#הערה_על_הערה`, which sounds like the tiered
    // mechanism and is a cosmetic alias — 0.6pt smaller and slanted, in the same
    // block and the same running sequence — while the real tiered note had no
    // button at all. And the endnote, which the engine has always had, was
    // reachable from nowhere: no button, no Insert item, and picking it out of
    // the palette silently lost every note because nothing wrote the dump call.
    // A writer clicks what the toolbar offers, so the toolbar has to offer the
    // thing it names.
    // Three, not four. `⁑` — a note *on* a note, which renders as a slightly
    // smaller, indented, separately-lettered entry in the same block — is a real
    // sefer apparatus and a rare one, and the toolbar is the most expensive
    // surface in the product. It keeps its Insert-menu item, its place in the
    // Notes chooser and `Ctrl+Shift+N`; it does not keep a button beside the
    // footnote that nearly everybody actually wants.
    tbGroup(t("cat.footnote"), [
      noteBtn("footnote", "†", "#הערה[|]"),
      noteBtn("endnote", "⁋", "#הערתסיום[|]"),
      // And the third one was a blue box.
      //
      // This was `b("הערת_צד", "▣")` — `#הערת_צד`, which the registry calls
      // `callout` and describes as *תיבת הדגשה (כחול)*. Its Hebrew name reads
      // "side note", it sat between the footnote and the endnote, and a writer
      // who wanted a note down the margin pressed it and got a blue box. The
      // real margin note, `#הערת_גיליון`, had no button at all — only the Notes
      // chooser, under "margin", for whoever thought to look.
      //
      // Which is the same sentence as the paragraph above about `⁑`, written
      // about a different button in the same group. A note button that inserts
      // something other than a note is this group's recurring failure, and
      // `toolbar.test.mjs` now checks the group against the registry so the
      // third instance is caught by a test rather than by a writer.
      noteBtn("sidenote", "▣", "#הערת_גיליון[|]"),
    ]),
    alignGroup,
    tbGroup(t("cat.torah"), [
      // A guest, declared rather than smuggled.
      //
      // `#ציטוט` is a block quote and the registry is right to categorise it
      // `block`. It is here because of what a writer setting a sefer is doing
      // when they reach for the toolbar: quoting is the gesture that sits
      // beside siman, se'if and mareh makom, and the block-quote category holds
      // nothing else anyone reaches for at that moment.
      //
      // `guest` exists so that this is a *statement* with a reason attached to
      // the button, and not an exception list inside `toolbar.test.mjs`. An
      // exception list in the test would be a second opinion about the taxonomy
      // kept in the one file whose job is to have no opinions — which is the
      // exact shape of the problem that put the table under Lists.
      guest("ציטוט", "❝", "a sefer quotes where it cites; block holds nothing else a writer reaches for here"),
      b("סימן", "§"),
      b("סעיף", "א."),
      b("מראה_מקום", "‡"),
    ]),
    tbGroup(t("tools"), [
      // "Region" until this button got a name that says what it does. It makes
      // a fold — the text prints in full — and `#אזור` is now a real command
      // for a fixed area on the page, so the old label named the wrong one of
      // the two things it could have meant.
      iconBtn("▤", t("fold"), () => chromeWiring().insertFold()),
      iconBtn("⋯", t("palette"), () => openPalette()),
    ]),
  ]);
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
  label: string,
  build: () => (Node | string)[],
  // The accessible name, when the label is a glyph (`⋯`, `⚙`) rather than a word.
  ariaLabel?: string,
): HTMLElement {
  const list = el("div", { class: "menu-list", role: "menu", "aria-label": ariaLabel ?? label });
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
  }, [label]);
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

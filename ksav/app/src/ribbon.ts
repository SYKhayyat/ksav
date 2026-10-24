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
import { unfoldAll } from "@codemirror/language";
import * as runtime from "./runtime";
import * as tabstrip from "./tabstrip";
import * as notes from "./notes";
import * as structure from "./structure";
import * as heads from "./headings";
import * as styles from "./styles";
import * as menus from "./menus";
import * as macros from "./macros";
import { settings } from "./settings";
import { getLang, t, tf, hasKey, type Lang } from "./i18n";
import { el, iconBtn, tbGroup, glyphBtn, noticeHost } from "./dom";
import { closeMenus, toggleMenu } from "./panels";
import { keybindings, hintFor, hintIsMode } from "./keyhint";
import { BREAKS, BREAK_COMMAND, BREAK_GLYPH, ACTION_COMMAND, actionForCommand } from "./actions";
import { legalAt } from "./mode";
import { docTextOf } from "./spans";
import { typstString } from "./typst-escape";
import * as docs from "./docs";
import * as opendocs from "./opendocs";
import { LIST_DEPTHS } from "./lists";
import { scheduleCompile } from "./compile";
import { voidAction } from "./asyncaction";

// ------------------------------------------------------------------- wiring
//
// The ribbon names verbs from half a dozen subsystems that main.ts still owns
// (their own waves move them), and the context strip needs the same few shell
// behaviours. Rule 4 of the split: those arrive here as one registered object
// and never as a backwards import. The registration itself is main.ts's boot,
// exactly as `wirePanes` is for the pane modules.

export interface ChromeWiring {
  /** The form-modal prompt (main.ts's `askText`). */
  askText(message: string, initial?: string): Promise<string | null>;
  /** What the document's language says the next command is written in. */
  docLang(): "he" | "en";
  /** The insertion path: every toolbar button and menu entry ends at it. */
  insertSnippet(raw: string): boolean;
  /** A command by name, with its delimiters applied (`insertionAt`). */
  insertCommand(he: string): boolean;
  /** The selection-side verbs: notes, links, mekoros, entity surgery. */
  tieredNoteHere(doc: string, pos: number): string;
  linkifySelection(): Promise<void>;
  askForMekor(): Promise<void>;
  entityAct(what: "select" | "unwrap" | "remove"): boolean;
  /** Folding and the hidden break, assembled in main.ts for now. */
  foldToLevel(view: EditorView, level: number): void;
  foldListsToDepth(view: EditorView, depth: number): void;
  hiddenBreak(): void;
  /** Hide, or reveal, the block or line the caret is in. */
  hideBlockHere(): void;
  hideLineHere(): void;
  /** The hidden fold: `/* … *\/` around the selection. */
  insertFold(): void;
  /** The command palette (its own wave moves it home to its module). */
  openPalette(): void;
  /** Rename the document in hand. */
  renameDoc(): Promise<void>;
  /** Choose which kind of note `†` and `⁋` make. */
  openNotesChooser(): void;
  /** The further insert-menu doors: section setup, formula, image. */
  openSectionSetup(): void;
  openFormula(): void;
  insertImage(): Promise<void>;
  /** Structure dispatch — the one verb both the menus and the strip fire. */
  runStructureAction(action: structure.StructureAction, sticky?: boolean): boolean;
  makeListHere(): boolean;
  /** The styles drawer's verbs; their wave (8) moves these home. */
  applyCustomStyle(name: string): boolean;
  unwrapCustomStyle(name: string): void;
  openNewStyle(): void;
  openStyleEditor(name: string): void;
  /** The level the styles drawer opens on: `headingLevel = level; openStyles()`. */
  openStylesFor(level: number): void;
  /** The document verbs the Documents menu names. */
  addContentsHere(): boolean;
  closeOpenDoc(id: string): Promise<void>;
  duplicateDoc(id: string): Promise<void>;
  removeDoc(id: string): Promise<void>;
  newNamedDoc(): Promise<void>;
  saveFileAs(): Promise<void>;
  refreshSources(): Promise<void>;
  /** Macros, with the recorder's own state (wave 7 moves these home). */
  recording(): macros.Step[] | null;
  toggleRecording(): void;
  savedMacros(): macros.Macro[];
  playMacro(macro: macros.Macro, times?: number): void;
  deleteMacro(id: string): void;
  macroName(id: string): string;
  /** The context strip: contextbar.ts owns it, the ribbon refreshes it. */
  refreshContextBar(): void;
  /** The shell behaviours the caret strip asks for as it follows. */
  reconfigureShortcuts(): void;
  refreshStylesPanel(): void;
  dismissForeignHydra(structure: string | null): void;
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
function contentsDepthRow(): HTMLElement {
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
          : heads.addContents(doc, chromeWiring().docLang(), depth);
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
function keyCode(id: string, kb?: Record<string, string>, cls?: string): HTMLElement {
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
  }) as HTMLSelectElement;
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
  }) as HTMLInputElement;
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
  if (!cmd) return el("span");
  const name = writing === "he" ? cmd.he : cmd.en;
  const desc = getLang() === "he" ? cmd.desc_he : cmd.desc_en;
  const swatch = el("input", {
    type: "color",
    class: "tb-swatch",
    value: highlightColour,
    title: t("highlightColour"),
    "aria-label": t("highlightColour"),
  }) as HTMLInputElement;
  const apply = () => {
    highlightColour = swatch.value;
    // The default colour is written as the bare command, so the common case
    // leaves the source exactly as it was before there was a swatch — and a
    // document-wide restyle of highlights stays possible for the writer who
    // never asked for a particular one.
    // Written in Hebrew and translated by `insert.plan`, like every other
    // snippet: an English document gets `#mark(color: …)`.
    chromeWiring().insertSnippet(
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
      chromeWiring().insertSnippet(snippet ?? chromeWiring().tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
    },
    "",
    { "data-action": action, ...i18n },
  );
}

export function buildToolbar(): HTMLElement {
  const lang = getLang();
  // Two languages in one tooltip, and they are not the same question. The
  // *description* is the interface's, because it is being read; the **command
  // name** is the document's, because it is what the button is about to write.
  // An English toolbar reading "Bold text · #הדגשה" over a button that inserts
  // `#bold` is naming something that will not be in the document.
  const writing = chromeWiring().docLang();
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
    if (!c) return el("span");
    const title = lang === "he" ? c.desc_he : c.desc_en;
    return iconBtn(label, `${title} · #${writing === "he" ? c.he : c.en}`, () => chromeWiring().insertSnippet(c.insert), "", {
      "data-command": c.he,
    });
  };

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
    tbGroup(t("cat.align"), [b("ימין", "⇥"), b("מרכז", "≡"), b("שמאל", "⇤")]),
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
      iconBtn("⋯", t("palette"), () => chromeWiring().openPalette()),
    ]),
  ]);
}

/** The Documents menu: every document in the library, newest first. */
export function buildDocsMenu(): HTMLElement {
  return lazyMenu("documents", "🗂 " + t("documents"), docsMenuItems);
}

/**
 * Rebuilt on every open, so it never shows a stale library.
 *
 * **Two lists, and they are two different facts.** *Open* is what this session
 * is holding — with a caret, an undo history and a scroll position each. *All
 * documents* is what exists. Before the open set they were the same list with a
 * dot on one row, which is exactly the conflation that made "new document" look
 * like it had destroyed the open one.
 *
 * The controls on each row are deliberately unlike each other. Closing puts a
 * document away and destroys nothing; deleting destroys it. The inventory is
 * blunt about this — *"closing and deleting appearing as the same glyph in two
 * strips is not survivable"* — so the close control is a `⌄` labelled "close",
 * and `×` continues to mean delete and only delete.
 */
function docsMenuItems(): (Node | string)[] {
  const items: (Node | string)[] = [
    el("button", {
      class: "menu-item",
      // Named for the same reason the rows below carry `data-doc`: the label is
      // translated, and the acceptance run has to be able to say *this* item.
      "data-doc-action": "new",
      onClick: () => voidAction("save_file", () => chromeWiring().newNamedDoc()),
    }, [t("newDoc")]),
    // **Here**, and not in the arrangement panel, because this is where a writer
    // asks for a new anything. The arrangement panel is where somebody who
    // already knows what an arrangement is goes to change one; the report
    // *"I don't see how to make a new tab"* came from a writer who did not, and
    // who had — correctly — looked under Documents first.
    el("button", {
      class: "menu-item",
      "data-doc-action": "new-tab",
      onClick: () => voidAction("save_file", () => tabstrip.newDocTab()),
    }, [`${t("newDocTab")} · ${hintFor("newDocTab")}`]),
    el("button", { class: "menu-item", onClick: () => chromeWiring().renameDoc() }, [t("rename")]),
    // "Save as" already existed, in the File menu. The margin comment asking
    // *"do we have a save as something else.ksav option?"* was written by
    // somebody looking at the document's name and its filename side by side and
    // wondering how to change the second — which is here, not under File. The
    // command is the same one; this is a second door onto it, at the place the
    // question gets asked.
    el("button", { class: "menu-item", onClick: () => voidAction("save_file", () => chromeWiring().saveFileAs()) }, [t("saveAs")]),
    el("button", { class: "menu-item", onClick: () => voidAction("save_file", () => chromeWiring().duplicateDoc(runtime.currentDoc.id)) }, [
      t("duplicate"),
    ]),
  ];

  // The open set, most recently focused first — the order the switcher uses, so
  // the two surfaces agree about what "the last document" means.
  const open = opendocs.openDocs();
  if (open.length > 1) {
    items.push(el("div", { class: "menu-sep" }));
    items.push(el("div", { class: "menu-cat" }, [`${t("openDocs")} · ${hintFor("switcher")}`]));
    for (const entry of open) {
      const meta = docs.library().find((e) => e.id === entry.id);
      if (!meta) continue;
      const here = entry.id === opendocs.focusedId();
      items.push(
        el("div", { class: "menu-item-row" }, [
          el(
            "button",
            {
              class: "menu-item menu-item-main" + (here ? " active" : ""),
              // Which document this row switches to, for anything outside this
              // file that has to say *that* one — the acceptance run's tab
              // switch, today. The title is not an identity: two documents may
              // share one, and it is translated besides.
              "data-doc": entry.id,
              onClick: () => {
                closeMenus();
                voidAction("save_file", () => tabstrip.enterDoc(entry.id));
              },
            },
            [
              el("b", {}, [(here ? "● " : "") + meta.title]),
              el("span", { class: "menu-desc" }, [meta.fileName ?? ""]),
            ],
          ),
          // Three controls on a row and three different amounts of destruction,
          // which is the whole reason none of them share a glyph: `⧉` opens a
          // second window onto this document and destroys nothing, `⌄` puts it
          // away and destroys nothing, and in the library below `×` destroys the
          // sefer. The inventory is blunt that two of those appearing as one
          // glyph "is not survivable"; a third had to keep clear of both.
          glyphBtn(
            "⧉",
            t("openInNewTab"),
            (e: Event) => {
              e.stopPropagation();
              voidAction("save_file", () => tabstrip.openInNewTab(entry.id));
            },
            "menu-newtab",
          ),
          glyphBtn(
            "⌄",
            t("closeDoc"),
            (e: Event) => {
              e.stopPropagation();
              voidAction("save_file", () => chromeWiring().closeOpenDoc(entry.id));
            },
            "menu-close",
          ),
        ]),
      );
    }
  }

  items.push(el("div", { class: "menu-sep" }));
  items.push(el("div", { class: "menu-cat" }, [t("library")]));
  for (const entry of docs.library()) {
    const here = entry.id === opendocs.focusedId();
    const isOpen = opendocs.isOpen(entry.id);
    items.push(
      el("div", { class: "menu-item-row" }, [
        el(
          "button",
          {
            class: "menu-item menu-item-main" + (here ? " active" : ""),
            "data-doc": entry.id,
            onClick: () => {
              closeMenus();
              voidAction("save_file", () => tabstrip.enterDoc(entry.id));
            },
          },
          [
            // A document already open is marked as such, so a writer can see
            // that choosing it will switch to what they left rather than
            // reopening it from disk.
            el("b", {}, [(here ? "● " : isOpen ? "◦ " : "") + entry.title]),
            el("span", { class: "menu-desc" }, [
              [entry.fileName, new Date(entry.updated).toLocaleString()].filter(Boolean).join(" · "),
            ]),
          ],
        ),
        glyphBtn(
          "⧉",
          t("openInNewTab"),
          (e: Event) => {
            e.stopPropagation();
            voidAction("save_file", () => tabstrip.openInNewTab(entry.id));
          },
          "menu-newtab",
        ),
        el("button", {
          class: "menu-del",
          title: t("delete"),
          "aria-label": t("delete"),
          onClick: (e: Event) => {
            e.stopPropagation();
            void chromeWiring().removeDoc(entry.id);
          },
        }, ["×"]),
      ]),
    );
  }
  return items;
}

/**
 * A Word-style menu over the structural registry.
 *
 * Same operations as the contextual ribbon, same enabled/disabled rule, same
 * keys — because they are the same list. The ribbon is for the writer who is
 * already in a table; a menu is for the one who is looking for the feature and
 * does not yet know that standing in a table is what reveals it. Word has both
 * for exactly that reason, and an item that greys out is itself information:
 * "this exists, and not here".
 *
 * The key is printed beside each item. A shortcut nobody can find is the same as
 * no shortcut.
 */
function structureMenuItems(structures: structure.Structure[]): (Node | string)[] {
  const doc = runtime.view ? docTextOf(runtime.view.state.doc) : "";
  const caret = runtime.view?.state.selection.main.head ?? 0;
  const pos = structure.structureNear(doc, caret)?.pos ?? caret;
  const kb = keybindings();
  const items: (Node | string)[] = [];

  for (const kind of structures) {
    const actions = structure.STRUCTURE_ACTIONS.filter((a) => a.structure === kind);
    if (actions.length === 0) continue;
    items.push(el("div", { class: "menu-cat" }, [t("structure." + kind)]));
    let group = "";
    for (const action of actions) {
      if (group && action.group !== group) items.push(el("div", { class: "menu-sep" }));
      group = action.group;
      // Computed against the live document, so the menu tells the truth about
      // this caret rather than about tables in general — and *asked*, not found
      // out by running the operation and looking at the wreckage.
      const why = structure.whyNot(action, doc, pos);
      const enabled = why === null;
      items.push(
        el(
          "button",
          {
            class: "menu-item menu-cmd" + (enabled ? "" : " disabled"),
            disabled: enabled ? null : "true",
            title: why ? t(why) : "",
            onClick: () => {
              closeMenus();
              chromeWiring().runStructureAction(action, true);
            },
          },
          [
            el("b", {}, [`${action.glyph}  ${t(action.label)}`]),
            keyCode(action.id, kb),
            // On screen, not on a tooltip. A greyed item says "this exists, and
            // not here"; without the second half the writer is left to guess
            // which of eighteen greyed arrows is greyed for its own reason and
            // which because the caret is nowhere near a table. A tooltip does
            // not answer that — it answers one item at a time, to whoever
            // thinks to hover, and never on a touchscreen.
            ...(why ? [el("span", { class: "menu-why" }, [t(why)])] : []),
          ],
        ),
      );
    }
  }
  return items;
}

/**
 * The Macros menu.
 *
 * Rebuilt on every open (`lazyMenu`), so a macro recorded thirty seconds ago is
 * in it, and one deleted is not. Each saved macro shows what it actually does
 * rather than only its name — a list of names is a list of things nobody
 * remembers the contents of, and a macro you cannot remember is a macro you
 * will not run.
 */
export function buildMacroMenu(): HTMLElement {
  return lazyMenu("macros", "⏺ " + t("macros"), () => {
    const kb = keybindings();
    const items: (Node | string)[] = [
      el("button", { class: "menu-item", onClick: () => (closeMenus(), chromeWiring().toggleRecording()) }, [
        el("b", {}, [chromeWiring().recording() ? "⏹  " + t("macroStop") : "⏺  " + t("macroRecord")]),
        el("span", { class: "menu-desc" }, [t("macroRecordLede")]),
      ]),
      el("div", { class: "menu-sep" }),
      el("div", { class: "menu-cat" }, [t("macroSaved2")]),
    ];
    const all = chromeWiring().savedMacros();
    if (!all.length) {
      items.push(el("div", { class: "menu-desc", style: "padding: 6px 9px" }, [t("macroNone")]));
      return items;
    }
    for (const m of all) {
      const hint = hintFor(macros.actionIdOf(m), kb);
      items.push(
        el("div", { class: "menu-item-row" }, [
          el("button", {
            class: "menu-item menu-item-main",
            onClick: () => (closeMenus(), chromeWiring().playMacro(m)),
          }, [
            el("b", {}, [m.name]),
            el("span", { class: "menu-desc" }, [
              macros.describe(m, chromeWiring().macroName) + (hint ? "  ·  " + hint : ""),
            ]),
          ]),
          // Repeat, which is the reason a macro exists: the writer did the thing
          // once and has eleven more to go.
          el("button", {
            class: "menu-del",
            title: t("macroRepeat"),
            onClick: async (e: Event) => {
              e.stopPropagation();
              const n = parseInt((await chromeWiring().askText(t("macroRepeatPrompt"), "10")) ?? "", 10);
              if (Number.isFinite(n) && n > 0) {
                closeMenus();
                chromeWiring().playMacro(m, Math.min(n, 500));
              }
            },
          }, ["×n"]),
          el("button", {
            class: "menu-del",
            title: t("delete"),
            "aria-label": t("delete"),
            onClick: (e: Event) => {
              e.stopPropagation();
              chromeWiring().deleteMacro(m.id);
            },
          }, ["×"]),
        ]),
      );
    }
    return items;
  });
}

/** The categories the registry publishes, in the order it declares them. */
function registryCategories(): string[] {
  const cats: string[] = [];
  for (const c of runtime.commandsReg) if (!cats.includes(c.category)) cats.push(c.category);
  return cats;
}

export function buildFormatMenu(): HTMLElement {
  return lazyMenu("format", "¶ " + t("format"), () => [
    // First, because it is the one thing a writer standing in prose can do to a
    // list — every operation below it needs a list to already exist, and the
    // margin note *"it looks like it is not a list"* was written by somebody
    // who had none and no way to make one out of what they had typed.
    el("button", { class: "menu-item", onClick: () => (closeMenus(), chromeWiring().makeListHere()) }, [
      el("b", {}, ["≔ " + t("makeList")]),
      keyCode("makeList"),
      el("span", { class: "menu-desc" }, [t("makeListLede")]),
    ]),
    el("div", { class: "menu-sep" }),
    // The three acts on the construct in hand. Named for what they do to the
    // *writer's words* rather than for the markup, because that is the
    // distinction the report is about: one of these keeps them and one does
    // not, and hand-deleting brackets is what a writer does when neither is
    // offered. See `entity.ts`.
    el("div", { class: "menu-cat" }, [t("entityActs")]),
    ...([
      ["select", "⌖", "sc.entitySelect", "entitySelect"],
      ["unwrap", "⌫", "sc.entityUnwrap", "entityUnwrap"],
      ["remove", "✕", "sc.entityRemove", "entityRemove"],
    ] as const).map(([what, glyph, label, id]) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), chromeWiring().entityAct(what)) }, [
        el("b", {}, [`${glyph} ${t(label)}`]),
        keyCode(id),
      ]),
    ),
    el("div", { class: "menu-sep" }),
    ...structureMenuItems(["heading", "list"]),
    el("div", { class: "menu-cat" }, [t("foldLevels")]),
    // Fold *to* a depth. The chips beside the toolbar take everything down or
    // put everything back, which is the only folding this product could do from
    // a door — and not the one somebody with a 300-page sefer wants.
    ...Array.from({ length: heads.MAX_LEVEL }, (_, i) => i + 1).map((level) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), chromeWiring().foldToLevel(runtime.view, level)) }, [
        el("b", {}, [`⊟ ${tf("foldLevel", String(level))}`]),
        keyCode(`foldLevel${level}`),
      ]),
    ),
    // The other nesting. A list's depth is not a heading level and no surface
    // could ask about it — *"the same for the siman/seif hierarchy and for
    // lists, each of which has its own nesting"*. Simanim are headings, so the
    // levels above already reach them; lists needed their own row.
    el("div", { class: "menu-cat" }, [t("foldListDepths")]),
    ...LIST_DEPTHS.map((depth) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), chromeWiring().foldListsToDepth(runtime.view, depth)) }, [
        el("b", {}, [`⊟ ${tf("foldListDepth", String(depth))}`]),
        keyCode(`foldListDepth${depth}`),
      ]),
    ),
    el("button", { class: "menu-item", onClick: () => (closeMenus(), void unfoldAll(runtime.view)) }, [
      el("b", {}, ["⊞ " + t("unfoldAll")]),
      keyCode("unfoldAll"),
    ]),
    el("div", { class: "menu-sep" }),
    // Bold, italic, the colours and the three alignments. They were in Insert,
    // which is a menu for putting something on the page, and not one of them
    // does that: every one of them needs text to already be there. See
    // `menus.ts` for the rule and for what it costs to have had none.
    ...commandRows(menus.categoriesIn("format", registryCategories())),
  ]);
}

/**
 * The three errands that go to the library, given a door.
 *
 * Inventory item 73: the service that justifies a whole process boundary with
 * Girsa had no caller at all for a long stretch, and when it got one, the one
 * it got was the command palette — which answers *"I know what I want, get me
 * there"* and cannot answer *"what is there?"*. Two of the three were worse
 * than palette-only: they were a literal `e.key` comparison in `wireKeys`,
 * which is a shortcut with no name, no entry and no way to find out it exists.
 *
 * A menu of their own rather than rows added to Insert or Format, because the
 * rule those two menus follow is about the *page* — Insert puts something new
 * on it, Format changes what is there — and not one of these does either. They
 * all ask the library a question about the words already written.
 *
 * Nothing here is hidden when Girsa is absent. Every one of them says
 * `girsaNeedsApp` when it is, which is a sentence a writer can act on; a menu
 * that quietly loses three items in the browser build is a product that looks
 * different for no stated reason.
 */
export function buildSourcesMenu(): HTMLElement {
  return lazyMenu("sources", "⚯ " + t("sourcesMenu"), () => {
    const kb = keybindings();
    const item = (id: string, glyph: string, run: () => void) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), run()) }, [
        el("b", {}, [`${glyph} ${t("sc." + id)}`]),
        keyCode(id, kb),
        el("span", { class: "menu-desc" }, [t(id + "Lede")]),
      ]);
    return [
      item("citePhrase", "⌕", () => void chromeWiring().askForMekor()),
      item("linkifyCitations", "⚯", () => void chromeWiring().linkifySelection()),
      el("div", { class: "menu-sep" }),
      item("refreshSources", "↻", () => void chromeWiring().refreshSources()),
    ];
  });
}

export function buildTableMenu(): HTMLElement {
  return lazyMenu("table", "▦ " + t("tableMenu"), () => [
    el("button", {
      class: "menu-item",
      onClick: () => {
        closeMenus();
        // The third hand-written copy of this snippet. The three agreed, which
        // was luck: `commands.rs:97-102` records that a bare `עמודות: 2` lets
        // Typst size each column to its contents, so an empty new table renders
        // as a thumbnail shoved against the margin — a fix that landed in the
        // registry and would have had to be remembered here twice more.
        chromeWiring().insertCommand(ACTION_COMMAND.table);
      },
    }, [el("b", {}, ["▦  " + t("insertTable")])]),
    el("div", { class: "menu-sep" }),
    ...structureMenuItems(["table"]),
    // The cell commands and the table configuration line, beside the operations
    // that act on a table. They were under Insert, three menus away from every
    // other thing about a table.
    ...commandRows(menus.categoriesIn("table", registryCategories())),
  ]);
}

/**
 * The Insert menu.
 *
 * `lazyMenu`, and not by accident: the items are rebuilt every time the menu
 * opens, because whether a command is legal *here* depends on where the caret
 * is. Built once at startup — which is what it used to do, through `menu()`,
 * which takes an already-constructed array — every entry was evaluated against
 * an empty document at position 0, where everything is legal, and the greying
 * this menu exists to show never appeared. Caught by driving the running app,
 * not by any test: a menu that is wrong only after the caret moves looks
 * perfectly correct in a screenshot of the source.
 */
export function buildInsertMenu(): HTMLElement {
  return lazyMenu("insert", "➕ " + t("insert"), insertMenuItems);
}

function insertMenuItems(): (Node | string)[] {
  const kb = keybindings();
  // Read once for the whole menu, and read here rather than per row, because
  // every row in it is being built against the same caret.
  const doc = docTextNow();
  const pos = runtime.view?.state.selection.main.from ?? 0;
  /** Insert ▸ Footnote / Endnote, where a Word user looks first. */
  const noteItem = (action: string, glyph: string, snippet: string | null, why?: string) =>
    el(
      "button",
      {
        class: "menu-item" + (why ? " disabled" : ""),
        disabled: why ? "true" : null,
        title: why ? t(why) : "",
        onClick: () => {
          closeMenus();
          const st = runtime.view.state;
          chromeWiring().insertSnippet(snippet ?? chromeWiring().tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
        },
      },
      [
        el("b", {}, [`${glyph} ${t("sc." + action)}`]),
        keyCode(action, kb),
        ...(why ? [el("span", { class: "menu-why" }, [t(why)])] : []),
      ],
    );
  const items: (Node | string)[] = [
    // Two plain items, at the top, named the way Word names them. The chooser
    // below is the right tool for picking a sefer's apparatus; it is the wrong
    // answer to "I want a footnote", which is what somebody who has only ever
    // used Word is asking, and which had no menu entry at all. The endnote had
    // none anywhere in the product.
    noteItem("footnote", "†", "#הערה[|]"),
    noteItem("endnote", "⁋", "#הערתסיום[|]"),
    el("button", { class: "menu-item", onClick: () => chromeWiring().openNotesChooser() }, [
      el("b", {}, ["✻ " + t("notesChooser")]),
      el("span", { class: "menu-desc" }, [t("notesChooserLede")]),
    ]),
    // A note on a note is **not** a top-level offer, and that was the margin
    // note: it sat third in this menu, above the chooser, as though it were one
    // of the two things a person opens Insert to do. It is not — it is a second
    // note hung off one that already exists, so in ordinary prose there is
    // nothing for it to hang off and the command writes a note *beside* the
    // sentence rather than under a note.
    //
    // Below the chooser, and greyed with its reason where it cannot act, which
    // is this menu's own rule two dozen lines down: an item that silently
    // vanishes when the caret moves is a product that looks broken.
    noteItem(
      "tieredNote",
      "⁑",
      null,
      notes.noteDepthAt(docTextNow(), runtime.view?.state.selection.main.from ?? 0) > 0
        ? undefined
        : "whyNoteOnNoteNeedsANote",
    ),
    el("button", { class: "menu-item", onClick: () => chromeWiring().insertImage() }, [
      el("b", {}, ["🖼 " + t("insertImage")]),
    ]),
    el("button", { class: "menu-item", onClick: () => chromeWiring().openFormula() }, [
      el("b", {}, ["∑ " + t("insertFormula")]),
    ]),
    el("button", { class: "menu-item", onClick: () => chromeWiring().openSectionSetup() }, [
      el("b", {}, ["▭ " + t("sectionSetup")]),
      el("span", { class: "menu-desc" }, [t("sectionSetupLede")]),
    ]),
    // Contents, which used to be in Format under Headings. It is neither: it
    // does not change a heading, it puts a generated page at the top of the
    // document — so it is an insertion, and this is Insert. Greyed with its
    // reason once the document has one, the same rule every other item here
    // follows. See `menus.ts` and `addContentsHere`.
    (() => {
      const already = !heads.canAddContents(docTextNow());
      return el(
        "button",
        {
          class: "menu-item" + (already ? " disabled" : ""),
          disabled: already ? "true" : null,
          onClick: () => (closeMenus(), chromeWiring().addContentsHere()),
        },
        [
          el("b", {}, ["☰ " + t("sc.toc")]),
          keyCode("toc", kb),
          ...(already ? [el("span", { class: "menu-why" }, [t("why.contentsAlready")])] : []),
        ],
      );
    })(),
    // How deep it goes — the other half of *"choose exactly what enters the
    // table of contents"*. Beside the row that makes one, because it is the same
    // decision: before there is a contents it chooses what will be made, and
    // after there is one it edits the call in place rather than being greyed.
    // The per-heading half is `heading.inContents`, which is where a heading is.
    contentsDepthRow(),
    // The breaks, from the one list that says what they are — see
    // `actions.BREAKS` for the family and the fence that keeps it complete. In
    // order of how much of the page each one moves, and each printing the key it
    // answers to, which is what neither of the two that *had* keys used to do.
    ...BREAKS.map((id) => {
      // Greyed with its reason where the caret cannot take it, on exactly the
      // rule the registry rows below use — `#מעבר_עמוד` inside a table cell or a
      // note body does not break the page, it fails to compile, and
      // `engine/tests/containers.rs` is where that is asserted. A named row that
      // skipped this check would be a second, laxer opinion about legality
      // sitting twenty lines above the strict one, which is how a menu comes to
      // offer an insertion the grid already knows is broken.
      const command = BREAK_COMMAND[id];
      const legality = command ? legalAt(doc, pos, command) : { ok: true as const };
      return el(
        "button",
        {
          class: "menu-item" + (legality.ok ? "" : " disabled"),
          disabled: legality.ok ? null : "true",
          title: legality.ok ? "" : t(legality.reason!),
          onClick: () => (
            closeMenus(),
            // The one that is not a registry command: a comment pair the editor
            // writes, so the break is in the source and never on the page.
            command ? chromeWiring().insertCommand(command) : chromeWiring().hiddenBreak()
          ),
        },
        [
          el("b", {}, [`${BREAK_GLYPH[id]} ${t(id)}`]),
          keyCode(id, kb),
          el("span", { class: "menu-desc" }, [t(id + "Lede")]),
          ...(legality.ok ? [] : [el("span", { class: "menu-why" }, [t(legality.reason!)])]),
        ],
      );
    }),
    el("div", { class: "menu-sep" }),
    // The three constructs, together and in the order that makes the difference
    // between them readable: two that the page never sees, then one it sees all
    // of. Every one of them already existed; the line comment had no door of any
    // kind, and the fold's door was a button labelled "Region".
    ...[
      { name: "hideLine", glyph: "⌫", run: chromeWiring().hideLineHere },
      { name: "hideBlock", glyph: "▨", run: chromeWiring().hideBlockHere },
      { name: "fold", glyph: "▤", run: chromeWiring().insertFold },
    ].map((c) =>
      el("button", { class: "menu-item", onClick: () => (closeMenus(), c.run()) }, [
        el("b", {}, [`${c.glyph} ${t(c.name)}`]),
        keyCode(c.name, kb),
        el("span", { class: "menu-desc" }, [t(c.name + "Lede")]),
      ]),
    ),
    el("div", { class: "menu-sep" }),
  ];
  items.push(...commandRows(menus.categoriesIn("insert", registryCategories())));
  return items;
}

/**
 * The registry's own commands, as menu rows, for one menu's categories.
 *
 * Written once and called three times. It was the tail of the Insert menu and
 * nowhere else, which is how Insert came to hold every category the engine
 * publishes — including the eighteen that change text already written. Which
 * categories a menu shows is `menus.ts`'s answer; what a row looks like is this.
 */
function commandRows(cats: readonly string[]): (Node | string)[] {
  const lang = getLang();
  // The interface's language names the *description*; the document's names the
  // command, because the command is what lands in the source. See `buildToolbar`.
  const writing = chromeWiring().docLang();
  const kb = keybindings();
  const doc = docTextNow();
  const pos = runtime.view?.state.selection.main.from ?? 0;
  const items: (Node | string)[] = [];
  for (const cat of cats) {
    const inCat = runtime.commandsReg.filter((x) => x.category === cat && !x.deprecated);
    if (!inCat.length) continue;
    items.push(el("div", { class: "menu-cat" }, [t("cat." + cat)]));
    for (const c of inCat) {
      // Greyed rather than hidden, with the reason on the tooltip. "This exists,
      // and not here" is information; a command that silently vanishes from the
      // menu when the caret moves is a product that looks broken.
      const legality = legalAt(doc, pos, c.he);
      // The live binding, when an action is the door to this command. Read
      // through `keybindings()` and never `DEFAULT_KEYS`, so a writer who
      // rebound `Ctrl+B` is shown the key they chose. See `actions.ts`.
      const action = actionForCommand(c.he);
      items.push(
        el(
          "button",
          {
            class: "menu-item menu-cmd" + (legality.ok ? "" : " disabled"),
            disabled: legality.ok ? null : "true",
            title: legality.ok ? "" : t(legality.reason!),
            onClick: () => chromeWiring().insertSnippet(c.insert),
          },
          [
            el("b", {}, [lang === "he" ? c.desc_he : c.desc_en]),
            // The name the writer will find in their own source, which is the
            // document's language and not the menu's. See `buildToolbar`.
            el("code", {}, ["#" + (writing === "he" ? c.he : c.en)]),
            ...(action && hintFor(action, kb) ? [keyCode(action, kb, "menu-key")] : []),
            // The reason, where it can be read. `insertions.json` has carried a
            // `reason` per command for as long as the grid has existed and it
            // reached a tooltip; the item dropped to 38% opacity and said
            // nothing. The comment beside that rule in `styles.css` argues that
            // an item which cannot act "still says so, rather than vanishing" —
            // an argument won and then not implemented.
            ...(legality.ok ? [] : [el("span", { class: "menu-why" }, [t(legality.reason!)])]),
          ],
        ),
      );
    }
  }
  return items;
}

export function menu(name: string, label: string, items: (Node | string)[]): HTMLElement {
  return lazyMenu(name, label, () => items);
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
export function lazyMenu(name: string, label: string, build: () => (Node | string)[]): HTMLElement {
  const list = el("div", { class: "menu-list", role: "menu", "aria-label": label });
  const btn = el("button", {
    class: "menu-btn",
    type: "button",
    "aria-haspopup": "true",
    "aria-expanded": "false",
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

// The writer's preferences, and the presets that overwrite them.
//
// These are app settings, not document settings — everything that describes how
// *this person* likes to work, plus the page setup that goes on the compile
// request. They are small, they must be readable synchronously while the chrome
// is being built, and losing them costs nothing but a re-tick, so localStorage
// is exactly right for them. (Documents are another matter entirely; see
// `store.ts` for why they are not here.)

import type { DocConfig } from "./api";
import { DOC_DEFAULTS } from "./engine.gen";
import * as runtime from "./runtime";
import type { Lang } from "./i18n";

export type Layout = "two" | "page" | "source";
export type PreviewSide = "left" | "right" | "top" | "bottom";

// **This no longer extends `DocConfig`,** and that is the fix rather than a
// tidy-up.
//
// It did — `Settings extends Omit<DocConfig, "lang">` — so every one of the
// thirty page-setup fields existed twice: once on the document, where B26 put
// it, and once here. Thirty duplicated fields, and the reader that chose
// between them (`now()` in `main.ts`) fell through to this copy whenever the
// document had not said, which for the four per-edge margins and the note
// region is their **normal** state: absent means *"follow the one margin"* and
// *"decide from the document"*. So the settings panel could print a top margin
// the document was not laid out on, and the writer had no way to tell which of
// the two numbers the page had used.
//
// The app does need one page setup of its own — *what a new document starts
// like*, which is what Word calls **set as default** — and that is `newDocument`
// below. One field, holding a `PageSetup`, instead of thirty fields holding a
// second opinion about the open document.
//
// `settings.lang` was already the exception that proved it: it is the language
// of the *interface*, a different choice from the language of the document, and
// conflating the two would silently typeset a document wrong. Every other page
// field had exactly the same problem and no `Omit` to say so.
export interface Settings {
  lang: Lang;
  /**
   * The page setup a **new** document starts with (B26).
   *
   * Only what differs from the shipped defaults, the same subtraction
   * `ownPageSetup` makes for a document — so a writer who has never pressed
   * *set as default* stores nothing at all, and a field added to `DocConfig`
   * next year reaches them.
   */
  newDocument?: PageSetup;
  theme: "light" | "dark";
  layout: Layout;
  previewSide?: PreviewSide; // which side the preview sits on in split view
  previewFrac?: number; // fraction of the split given to the preview (0–1)
  /**
   * The window's arrangement: a tree of panes (`panes.ts`).
   *
   * `unknown` here on purpose. This module is loaded before anything that knows
   * what a pane is, and importing the type would put a dependency on the shape
   * of the window into the module that decides whether spell-check is on. The
   * one reader casts it, and `panes.ts` owns the shape.
   *
   * Persisted because an arrangement a writer built and lost on restart is
   * worth less than no arrangement at all.
   */
  panes?: unknown;
  /**
   * The tab strip: every arrangement, and which one is showing.
   *
   * `unknown` for the same reason `panes` is — this module is loaded before
   * anything that knows what a tab is, and `tabs.restore` refuses a shape it
   * does not recognise rather than trusting what came out of storage.
   *
   * Documents are deliberately **not** in here. A tab does not own its
   * documents; the open set does. Persisting them per tab is how the same
   * document ends up open twice with two carets.
   */
  tabs?: unknown;
  /**
   * Whether the outline and the notes list **float over** the document or take
   * a pane of their own.
   *
   * Asked for twice in the margins, about two different drawers, in the same
   * words: a panel that covers the source is a panel you have to close to read
   * what it is telling you about. `float` is what this application always did
   * and stays the default, because it is what a narrow window wants; `pane`
   * shifts the others open, which is what a wide one does.
   */
  panelPlacement?: "float" | "pane";
  /**
   * The source pane, dressed as a sheet of paper — what Word calls print layout.
   *
   * Was one of three values of `layout`, which conflated it with *how the
   * window is divided*. It is not that: it is how one pane is drawn, and it
   * survived the move to a pane tree because a writer who wants to see a page
   * while typing is asking a real question. See `applyPageView` in `main.ts`.
   */
  pageView?: boolean;
  prose: boolean;
  /**
   * The **preview's** zoom, despite the name.
   *
   * `previewStyle` is its only reader and always was, so this has never been an
   * application zoom — it is one of the two the writer asked for, and the name
   * stays because settings are stored by key and renaming it would throw away
   * the zoom of everybody who has ever set one. `zoom.ts` holds the bounds, the
   * step, and which of the two a zoom command means; `FIELD_OF` there is how the
   * rest of the app refers to this field without having to know its history.
   */
  zoom: number;
  /**
   * The **source's** zoom — the size of the text being typed.
   *
   * The half that did not exist. The editor was a fixed 15px with no control
   * anywhere, which is the whole of *"zoom in the source and in the preview"*.
   * Applied as `--source-zoom` on the root element, which both the ordinary
   * editor rule and the page-view one multiply their own base size by.
   */
  sourceZoom?: number;
  // Fit the page to the preview pane, which is what Word does and the reason
  // nobody meets the 1366×768 overflow there. When on, `zoom` is not consulted.
  fitWidth?: boolean;
  outline?: boolean;
  /** The notes pane — Word's navigation pane, for the document's notes. */
  notesPane?: boolean;
  /**
   * The marks pane — every semantic mark in the document, grouped by class.
   *
   * The third of the three list surfaces, and the one the mark register needed:
   * a collection nothing shows you is a collection you have to take on trust.
   */
  marksPane?: boolean;
  nikud?: boolean;
  autocomplete?: boolean;
  /**
   * Close a bracket when one is opened. On, and asked for by name.
   *
   * Separate from `autoPairQuotes` because they are separate questions with
   * opposite answers in Hebrew, and a single "auto-close" switch would have made
   * turning quotes on cost you the brackets.
   */
  autoPairBrackets?: boolean;
  /** The same for `"` and `'`. Off: see `pairedDelimiters` in `main.ts`. */
  autoPairQuotes?: boolean;
  /**
   * Reopen a menubar menu scrolled where it was left, rather than at the top.
   *
   * Off, so menus open at the top — which is what was asked for and what a menu
   * does everywhere else. Kept as a switch because somebody working through one
   * long stretch of the Insert menu wants the other behaviour, and that is a
   * preference rather than a mistake. See `lazyMenu`.
   */
  keepMenuPosition?: boolean;
  /**
   * Let the context strip appear in plain prose as well as in structure.
   *
   * **Off**, and the story of why it was ever on is worth keeping, because both
   * halves of it were right.
   *
   * The strip carries the operations for whatever the caret is standing in — a
   * list, a table, a heading. In plain prose there is nothing to carry, so it
   * used to empty itself and vanish, and a margin note said what that looked
   * like: *"header was greyed out and no reason was given"*. The answer was to
   * say so rather than disappear, and the strip in prose became a sentence —
   * *"Prose — no structure here to act on"* — with the one operation a writer
   * standing in prose can actually perform beside it.
   *
   * Read as a bug report from the other side: *"there is an annoying popup that
   * says 'Prose — not structure here to act on'. I don't know why it popped up
   * or what it is."* A strip that appears while you type, to tell you that
   * nothing is available, is a notification about the absence of a feature —
   * and the one button on it is in the Insert menu and on `makeList`'s own key
   * besides. So the honest strip stays available and stops being the default:
   * it is worth something to the writer who wanted an explanation, and it is
   * worth nothing to the writer who is typing a paragraph.
   */
  proseStrip?: boolean;
  spellcheck?: boolean;
  /**
   * Check the words inside comments and folds as well.
   *
   * Off, because the checker's own rule is *never underline what does not
   * print* and a comment does not print. But a comment is still prose somebody
   * typed — a note to a chavrusa, a paragraph parked while it is reworked, the
   * label on a fold — and for a writer who uses them that way an unchecked one
   * is the only unchecked text in the sefer.
   */
  spellcheckComments?: boolean;
  syncScroll?: boolean;
  autosaveFile?: boolean; // write back to the bound file on a timer, not only on Ctrl+S
  /**
   * Take a snapshot on a timer, or leave the history to the writer's own hand.
   *
   * > *"Automatic snapshots, or automatic turned off and taken by hand."*
   *
   * Both halves of that were missing. The cadence was a bare `180000` in a
   * `setInterval` at the bottom of `main.ts` — not a setting, not a number
   * anybody could see, and not switchable off — and "by hand" existed only as a
   * button inside the history panel, which is a door you have to already be
   * behind. The rule for what the pair means is `docs.autoInterval`; this is
   * only where the answer is kept.
   */
  autoSnapshot?: boolean;
  /** Minutes between automatic snapshots. Ignored when `autoSnapshot` is off. */
  autoSnapshotMinutes?: number;
  customCommands?: string; // user #let definitions, prepended at compile
  snippets?: string; // "abbrev = expansion" per line, expanded on Tab
  keybindings?: Record<string, string>; // action id -> key combo override
  reviewer?: string; // the name that goes on this person's review comments
  // Write note bodies at the end of the file (the org-mode arrangement) instead
  // of inline. A habit, not a document property — the page is identical either
  // way — so it belongs to the person and has to outlive the tab.
  deferNoteBodies?: boolean;
  /**
   * How the notes chooser asks its question.
   *
   *   `guided` — one question at a time. Where should it print, and then, of the
   *              arrangements that can print there, how are the layers
   *              arranged. Six buttons on screen instead of fifty.
   *   `matrix` — the whole where x how grid at once, refusals included. The view
   *              for someone comparing arrangements rather than choosing one.
   *   `cards`  — every arrangement as a card, in two groups by layer count.
   *
   * All three reach the same arrangements and write the same commands; this is
   * only which of them is on screen. Kept as a preference rather than a mode
   * switch inside the panel alone, because it is a fact about how a person
   * prefers to be asked and it has to outlive the tab.
   */
  notesChooserView?: "guided" | "matrix" | "cards";
  // Per-operation hydra key overrides, `{"table.rowDelete": "r"}`. Generated
  // keys are deterministic; this is how a writer overrules one, the same way
  // `keybindings` overrules a shortcut.
  hydraKeys?: Record<string, string>;
  // Recorded macros. A property of the person: they travel with the writer, not
  // with any one sefer.
  macros?: unknown;
  // Modal editing, for the people who cannot type without it. A property of the
  // person, not of the sefer — a document opened on someone else's machine must
  // not put them into vim.
  editingMode?: "default" | "vim" | "emacs";
  /**
   * What a tab that is not on screen does about its page.
   *
   *   `keep`     — nothing compiles while you are elsewhere, and coming back
   *                shows the page this document had when you left it while the
   *                fresh one is computed. No wait, no background work, and
   *                never a blank pane.
   *   `idle`     — unfocused documents recompile quietly whenever you stop
   *                typing, so every tab is always current. Real background CPU:
   *                six open seforim are six layouts nobody asked for.
   *   `onSwitch` — nothing is kept and nothing runs unseen. Switching blanks
   *                the pane until the compile lands.
   */
  tabCompile?: "keep" | "idle" | "onSwitch";
  // Dim everything but the paragraph being written, and keep the caret line
  // vertically centred.
  focusMode?: boolean;
  typewriter?: boolean;
  // Ask GitHub once a day whether there is a newer release. Desktop only, and
  // the request carries nothing — no identity, no version, no document.
  checkUpdates?: boolean;
}

/** The font families the engine bundles. Anything else must be attached to the
 *  document (see `addFont`) — there is no system font access from wasm.
 *
 *  Re-exported from the generated table rather than listed: the font menu and
 *  the licence notice are the same set of embedded files seen from two ends, and
 *  the engine is the end that actually embeds them. */
export { BUNDLED_FONTS } from "./engine.gen";

export const DEFAULTS: Settings = {
  // No page setup here any more. It used to spread `DOC_DEFAULTS` — the
  // engine's own `DocConfig::default()`, generated so the two sides could not
  // disagree — into this object, which put a second copy of every page field
  // beside the document's own. The generated defaults are still the one source;
  // they are read by `defaultPageSetup()`, which is what a document falls back
  // to, and by nothing else.
  //
  // `newDocument` is absent, which is the honest starting state: a writer who
  // has never pressed *set as default* has expressed no opinion about what a new
  // document looks like, and the shipped defaults answer for them.
  lang: "he",
  theme: "light",
  layout: "two",
  previewSide: "left",
  previewFrac: 0.5,
  // Prose is the default view. Ksav is pitched as a replacement for Word, and
  // opening a Word replacement in raw markup asks the writer to learn a syntax
  // before they can type a sentence. Alt still reveals the markup, and the
  // ＃ toggle in the header switches permanently — the markup is one key away,
  // which is the right distance for the people who want it.
  prose: true,
  zoom: 1,
  sourceZoom: 1,
  fitWidth: true,
  autoSnapshot: true,
  autoSnapshotMinutes: 3,
  editingMode: "default",
  tabCompile: "keep",
  // One question at a time by default. The grid and the card wall are both real
  // views and both stay, but neither is what to hand somebody who has opened
  // this panel because they want a footnote.
  notesChooserView: "guided",
  focusMode: false,
  typewriter: false,
  checkUpdates: true,
  autocomplete: true,
  autoPairBrackets: true,
  autoPairQuotes: false,
  keepMenuPosition: false,
  proseStrip: false,
  spellcheck: true,
  spellcheckComments: false,
  syncScroll: true,
  autosaveFile: true,
};

/** The page-setup subset that goes on a compile request. */
/**
 * The page-setup fields, as opposed to the fields about the application (B26).
 *
 * The split this list *is*: font, paper, margins and direction are facts about a
 * document. Theme, zoom, which side the preview sits on and whether spell-check is
 * on are facts about the person sitting in front of it. They lived in one object,
 * so opening an English document and then a Hebrew one meant changing the
 * direction by hand — and `fixes.md` had already called this *"the real fix and a
 * larger change than anything in this file."*
 */
export const PAGE_FIELDS = [
  "font",
  "size_pt",
  "margin_cm",
  "dir",
  "numbering",
  // Two fields, one control. `justify` is the boolean this has always had;
  // `text_align` is the edge, and it wins when it is set. `alignChoice` /
  // `alignSetup` below are the only two places that know the pair exists — see
  // them for why it is a pair rather than a fourth value of a single field.
  "justify",
  "text_align",
  "line_spacing_em",
  "para_spacing_em",
  "first_line_indent_em",
  "columns",
  "paper",
  // A page size in centimetres, for the sizes no standard names — a sefer is
  // routinely printed at 17×24 or 20×27, and the only answer used to be the
  // nearest A-size. Both or neither: Typst's width/height override `paper`
  // entirely, so half a size is a shape nobody asked for.
  "page_width_cm",
  "page_height_cm",
  "hebrew_numbering",
  "header",
  "footer",
  // Two-sided page setup. Every one of these describes the *sefer* — how it will
  // be bound, what runs across the top of a left-hand page — so they belong to
  // the document exactly as the margin does, and travel with the file.
  "margin_top_cm",
  "margin_bottom_cm",
  "margin_inner_cm",
  "margin_outer_cm",
  "gutter_cm",
  "two_sided",
  "header_even",
  "header_odd",
  "footer_even",
  "footer_odd",
  "head_align",
  // Metadata and the export standard: also facts about the document, not about
  // the machine it is being written on. `pdf_pages` is deliberately absent —
  // "just pages 4 to 9" is a property of one export, not of the sefer.
  "title",
  "author",
  "keywords",
  "pdf_standard",
  "pdf_tagged",
  "prevent_orphans",
] as const;

const KEY = "ksav.settings";

/**
 * What the last load could not read, if anything.
 *
 * Not decoration. Every preference a writer had ever set was being thrown away
 * on every single boot — see [`loadSettings`] — and the reason it survived for
 * as long as it did is that the failure had nowhere to go. A load that falls
 * back to the defaults is a load that has silently un-chosen everything the
 * person chose, and it has to be able to say so.
 */
let loadFailure: string | null = null;

/** Why the stored preferences could not be read, or null if they were. */
export function settingsLoadFailure(): string | null {
  return loadFailure;
}

/**
 * The preferences as stored, with the shipped defaults underneath.
 *
 * # The bug this function was
 *
 * `PAGE_FIELDS` is declared with `const`, **below** this function, and this
 * function is called at module scope by the `settings` binding below. A `const`
 * is in its temporal dead zone until its own declaration is evaluated, so
 * `for (const key of PAGE_FIELDS)` threw `ReferenceError: Cannot access
 * 'PAGE_FIELDS' before initialization` — on every boot, in every build, since
 * the day page setup was split out of this object.
 *
 * The `catch` then did what it says: returned the defaults. It was written for
 * a corrupted or hand-edited JSON blob, and it absorbed a *programming error*
 * with exactly the same shrug. So **no preference has ever survived a reload**:
 * not the theme, not the layout, not prose mode, not spell-check, not the
 * keybindings, not the editing mode. The settings drawer was honest for the
 * length of one session — `settings` is mutated in place and the drawer reads
 * it — and every reload quietly un-chose all of it.
 *
 * That is why "emacs mode does nothing" was reported. The mode was never
 * applied, because `settings.editingMode` was `"default"` by the time `boot`
 * looked at it. It is also, almost certainly, why a reopened document "went
 * into prose mode" and why the preview came back left-to-right.
 *
 * Two things changed, and the second matters more than the first:
 *
 *   - `PAGE_FIELDS` moved above this function, so there is no dead zone.
 *   - The `catch` no longer treats every failure as a bad blob. Unreadable JSON
 *     is expected and recoverable; anything else is a defect, and it is
 *     recorded so [`settingsLoadFailure`] can put it in front of a person
 *     rather than leaving them to notice their preferences evaporating.
 */
export function loadSettings(): Settings {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, unknown>;
  } catch (e) {
    // The one failure this fallback was written for: a blob that is not JSON.
    // Nothing can be rescued from it, and the defaults are the right answer.
    loadFailure = e instanceof Error ? e.message : String(e);
    return { ...DEFAULTS };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    loadFailure = "stored preferences are not an object";
    return { ...DEFAULTS };
  }

  loadFailure = null;
  const s = { ...DEFAULTS, ...raw } as Settings & Record<string, unknown>;
  if ((s.layout as string) === "one") s.layout = "source"; // migrate old value

  // A settings blob written before page setup stopped living here has the
  // thirty page fields at its top level. They meant *what a new document
  // starts like* — that is what `set as default` wrote — so that is where
  // they go, and the top-level copies are dropped rather than left to be read
  // by something that no longer should.
  //
  // `readPageSetup` does the same validation it does for a document, so a
  // hand-edited or corrupted blob cannot put a string where a number belongs
  // on the next compile request.
  if (!s.newDocument) {
    const rescued = readPageSetup(raw);
    if (rescued) s.newDocument = rescued;
  }
  for (const key of PAGE_FIELDS) delete s[key];
  return s as Settings;
}

/** The live settings object. Mutated in place; call `saveSettings` after. */
export const settings: Settings = loadSettings();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Preferences are worth a lot less than text. If storage is full the save
    // path says so far more usefully than a silently-reverted toggle would.
  }
}


/** A document's own page setup, where it has said anything (B26). */
export type PageSetup = Partial<Pick<DocConfig, (typeof PAGE_FIELDS)[number]>>;

/**
 * Anything the settings panel can edit.
 *
 * Two kinds of thing, and the union is where the difference is *stated* rather
 * than lost: a page field belongs to the open document, an app field belongs to
 * the person. They used to be one type, `Settings`, because `Settings` extended
 * `DocConfig` — so `keyof Settings` accepted both and nothing in the type system
 * knew which of the two a given row was editing.
 */
export type Field = keyof Settings | PageField;

/** The name of a page-setup field. */
export type PageField = (typeof PAGE_FIELDS)[number];

/** What a given field's value is, on whichever side of the split it lives. */
export type ValueOf<K extends Field> = K extends keyof Settings
  ? Settings[K]
  : K extends PageField
    ? DocConfig[K]
    : never;

/** Is this the name of a page-setup field? */
export function isPageField(key: Field): key is PageField {
  return (PAGE_FIELDS as readonly string[]).includes(key as string);
}

// ---------------------------------------------------------------- one control
//
// > *"Justify belongs in one control with right, centre and left."*
//
// It did not: `justify` is a boolean, so the panel had a tick box whose two
// states were *justified* and *not justified*, and there was no document-level
// way to say which edge unjustified text should sit at. Turning it off left the
// text ranged at the reading edge and that was the end of the writer's choice —
// a centred sheet meant wrapping every paragraph in `#מרכז`.
//
// The four answers are one question, so the panel asks it once. Underneath there
// are still two fields, and that is deliberate rather than a compromise: every
// document ever saved holds `justify: true|false` and nothing else, so a single
// four-valued field would have had to guess what those documents meant on the
// first read of every one of them. The pair keeps the old answer readable and
// lets the new one win, which is the same shape the per-edge margins use.

/** The four answers, in the order the panel offers them. */
export const ALIGN_CHOICES = ["justify", "right", "center", "left"] as const;
export type AlignChoice = (typeof ALIGN_CHOICES)[number];

/**
 * Which of the four a document is on.
 *
 * `text_align` wins when it says anything. Otherwise `justify: true` is
 * *justified* and `justify: false` is the reading edge — which is a real edge and
 * has to be named as one, or the control would show nothing selected for every
 * document written before it existed.
 */
export function alignChoice(cfg: Pick<DocConfig, "justify" | "text_align" | "dir">): AlignChoice {
  const edge = cfg.text_align;
  if (edge === "right" || edge === "center" || edge === "left") return edge;
  if (cfg.justify) return "justify";
  return cfg.dir === "ltr" ? "left" : "right";
}

/** The pair of fields that puts a document on one of the four. */
export function alignSetup(choice: AlignChoice): Pick<DocConfig, "justify" | "text_align"> {
  return choice === "justify"
    ? { justify: true, text_align: "" }
    : { justify: false, text_align: choice };
}

/**
 * How a document is actually laid out: what it says about itself, over a default
 * for everything it does not (B26).
 *
 * Field by field and not all-or-nothing, so a document that only ever said
 * *ltr* keeps following the app's font — and so a field added to `DocConfig` next
 * year does not make every document saved this year unopenable.
 *
 * A pure function of its two arguments, which is the point: the migration
 * question — *what happens to a document saved before page setup was a property of
 * documents* — is answered by what the caller passes as `fallback`, and it is
 * answered in one place.
 */
export function pageSetup(own: PageSetup | undefined, fallback: DocConfig): DocConfig {
  const out = { ...fallback };
  if (!own) return out;
  for (const key of PAGE_FIELDS) {
    const value = own[key];
    // `undefined` means *this document has not said*; `""` for a header and `0`
    // for an indent are things it said, and must not fall through to a default.
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/**
 * The page-setup fields of any object that carries them.
 *
 * Written as one pick over `PAGE_FIELDS` rather than as two hand-listed object
 * literals, because those literals were a third place a new field had to be
 * remembered — and the failure of forgetting is silent: the field simply never
 * reaches a new document, and the writer's setting appears not to stick.
 */
function pickPageFields(src: Partial<DocConfig>): DocConfig {
  const out: Record<string, unknown> = {};
  for (const key of PAGE_FIELDS) {
    const value = (src as Record<string, unknown>)[key];
    // An absent optional field stays absent: `pageSetup` reads `undefined` as
    // "this document has not said", and writing the key with an undefined value
    // would say it in a way that JSON then drops anyway.
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as DocConfig;
}

/**
 * What a fresh document is laid out like, before anybody edits it (B26).
 *
 * `DOC_DEFAULTS` — the engine's own `DocConfig::default()`, generated so the
 * two sides cannot disagree. This read `DEFAULTS`, which *spread* those in and
 * therefore carried a second copy of every page field beside the app's own
 * preferences; now the generated table is read directly and there is no copy to
 * fall out of step.
 */
export function defaultPageSetup(): DocConfig {
  return pickPageFields({ ...DOC_DEFAULTS, keywords: [...DOC_DEFAULTS.keywords] });
}

/**
 * The page setup the app is set to hand a **new** document (B26).
 *
 * The writer's *set as default*, over the shipped defaults for everything they
 * have not chosen — the same layering `docConfig` does for a document, because
 * it is the same question asked about a document that does not exist yet.
 */
export function settingsPageSetup(): DocConfig {
  return pageSetup(settings.newDocument, defaultPageSetup());
}

/**
 * What a document says about itself that the shipped defaults do not already say.
 *
 * This is the half of a page setup that has to be **written to the file**, and it
 * is a subtraction rather than a copy for one reason: `docConfig` lays a document
 * out as its own setup *over the shipped defaults*, so a field equal to the
 * default carries no information — writing it changes nothing on the page and
 * costs the file its plain-text form. A sefer laid out the shipped way therefore
 * comes back as `{}`, and `serializeDoc` keeps it as text somebody can `cat`.
 *
 * The subtraction is exact, which is what makes it safe: `pageSetup(own, d)` and
 * `pageSetup(ownPageSetup(own), d)` are the same object for every `own`, because
 * every key this drops was about to be overwritten with the value it already had.
 */
export function ownPageSetup(own: PageSetup | undefined): PageSetup {
  const out: Record<string, unknown> = {};
  if (!own) return out as PageSetup;
  const shipped = defaultPageSetup() as unknown as Record<string, unknown>;
  for (const key of PAGE_FIELDS) {
    const value = (own as Record<string, unknown>)[key];
    if (value === undefined) continue;
    // Compared through JSON so `keywords: []` — the one array in the set — is
    // judged by its contents rather than by being a different array object.
    if (JSON.stringify(value) === JSON.stringify(shipped[key])) continue;
    out[key] = value;
  }
  return out as PageSetup;
}

/**
 * A page setup read back out of a `.ksav` file, which is to say out of somebody
 * else's JSON.
 *
 * Keys are taken only if `PAGE_FIELDS` names them and the value is of the type
 * the shipped default is, so a hand-edited file cannot put `paper: {}` into a
 * compile request or add a key `pageSetup` would carry forward without anything
 * ever having validated it. A field that fails is dropped rather than defaulting
 * the whole document: one bad key must not cost a writer the other twenty.
 *
 * The four per-edge margins and the note region are **absent** from the shipped
 * defaults — absent means "follow the uniform margin", which is a different
 * instruction from any number — so there is no default to compare their type
 * against and they are checked against what JSON can carry instead.
 */
export function readPageSetup(raw: unknown): PageSetup | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const shipped = defaultPageSetup() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PAGE_FIELDS) {
    const value = src[key];
    if (value === undefined) continue;
    const want = shipped[key];
    const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
    const ok =
      want === undefined
        ? typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        : Array.isArray(want)
          ? strings(value)
          : typeof value === typeof want && !Array.isArray(value) && value !== null;
    if (ok) out[key] = value;
  }
  return Object.keys(out).length ? (out as PageSetup) : undefined;
}

/**
 * Which page setup a document is compiled with.
 *
 * Its own, over the **shipped defaults** — not over whatever the app's settings
 * happen to say now. A document saved before B26 has no page setup of its own, and
 * laying it out by the current global settings would mean the same file rendering
 * differently on two machines, which is the bug this order is fixing rather than a
 * gentler version of it. Everything in a page setup is one panel away from being
 * changed.
 */
export function docConfig(): DocConfig {
  return docConfigFor(runtime.currentDoc?.config);
}

/**
 * The same question about a document that is **not** the one on screen.
 *
 * The background compiles that keep unfocused tabs current lay out documents
 * `runtime.currentDoc` is not pointing at, and laying those out with the focused
 * document's page setup would put one sefer's margins on another's pages.
 */
export function docConfigFor(own: PageSetup | undefined): DocConfig {
  return pageSetup(own, defaultPageSetup());
}

// ---------------------------------------------------------------- presets
//
// Document skins: one-click presets that restyle the document (font, size,
// margins, spacing, numbering).

/**
 * Document skins, as **page setup** — which is what every field in them is.
 *
 * Typed `Partial<Settings>` while `Settings` extended `DocConfig`, which said
 * nothing at all: a skin has never contained a theme or a zoom, and could not
 * usefully. `PageSetup` is what they are, and now the type says so — so a skin
 * that tried to set `spellcheck` would not compile.
 */
export const SKINS: Record<string, PageSetup> = {
  sefer: { font: "Frank Ruhl Hofshi", size_pt: 13, margin_cm: 3, line_spacing_em: 0.7, justify: true, hebrew_numbering: true, numbering: true, paper: "a4" },
  modern: { font: "David Libre", size_pt: 12, margin_cm: 2.5, line_spacing_em: 0.95, justify: false, hebrew_numbering: false, numbering: true },
  letter: { font: "Frank Ruhl Hofshi", size_pt: 12, margin_cm: 3, line_spacing_em: 0.85, justify: true, hebrew_numbering: false, numbering: false },
  plain: { font: "Frank Ruhl Hofshi", size_pt: 12, margin_cm: 2.5, line_spacing_em: 0.75, justify: true, hebrew_numbering: false, numbering: true, header: "", footer: "" },
};

/**
 * The settings a preset replaced, so it can be undone.
 *
 * A skin used to `Object.assign` straight over your settings: choose one and
 * your font was gone, with nothing to say it had happened and no way back. A
 * preset is a starting point, not a one-way door.
 */
export interface StyleUndo {
  name: string;
  /** What **this document** said before the skin, so the undo puts it back on the
   * document and not on the application (B26). */
  before: PageSetup;
}

let styleUndo: StyleUndo | null = null;

export function pendingUndo(): StyleUndo | null {
  return styleUndo;
}

/** Apply a preset, remembering exactly what it displaced. */
/**
 * A skin restyles the **document** (B26).
 *
 * Every field a skin sets is page setup — font, size, margins, spacing,
 * numbering, paper — so after B26 they all belong to the sefer in front of the
 * writer rather than to the application. Applying `sefer` to one document used to
 * restyle every document they owned, which is the seam B26 is about, in the one
 * feature whose whole purpose is restyling a document.
 *
 * The undo keeps what **this** document said, for the same reason.
 */
export function applyPreset(name: string, onto: (change: PageSetup) => void) {
  const preset = SKINS[name];
  const live = docConfig() as unknown as Record<string, unknown>;
  const before: PageSetup = {};
  const change: PageSetup = {};
  for (const key of Object.keys(preset) as (keyof Settings)[]) {
    if (!(PAGE_FIELDS as readonly string[]).includes(key as string)) continue;
    (before as Record<string, unknown>)[key] = live[key as string];
    (change as Record<string, unknown>)[key] = (preset as Record<string, unknown>)[key];
  }
  styleUndo = { name, before };
  onto(change);
}

/** Put back whatever the last preset displaced, on the document it displaced it in. */
export function undoPreset(onto: (change: PageSetup) => void): boolean {
  if (!styleUndo) return false;
  onto(styleUndo.before as PageSetup);
  styleUndo = null;
  return true;
}

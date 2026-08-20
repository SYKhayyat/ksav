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
   * Arrangements the writer built and named, beside the ones Ksav ships.
   *
   * `unknown` for the same reason `panes` and `tabs` are: this module is loaded
   * before anything that knows what a pane tree is, and the reader checks the
   * shape rather than trusting storage.
   *
   * Kept because an arrangement is *work*. Six shipped shapes cover the common
   * cases and nothing covers "the one I built for learning a sugya — gemara left,
   * my notes right, the printed page underneath". Rebuilding that by hand every
   * session is the sort of tax that makes a writer stop using the feature.
   */
  savedArrangements?: unknown;
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
  /**
   * When the tab strip is on screen: always, only with more than one
   * arrangement, or never.
   *
   * `always` by default, and that is a reversal. The strip used to appear only
   * at two tabs, on the argument that a row of chrome showing a single tab tells
   * a writer nothing — which is true, and which hid the `+` that makes the
   * second arrangement, so the feature's only visible door opened once you had
   * already used it. The report was *"I don't see how to make a new tab"*.
   *
   * `auto` is that old behaviour, kept for the writer who has learned the
   * feature and wants the row back; `never` for the one who works a single
   * arrangement and would rather have the keys. See `tabs.stripVisible`.
   */
  tabStrip?: "always" | "auto" | "never";
  /**
   * Whether two linked panes scroll together.
   *
   * This is a correction, and it is worth stating what it used to be. The
   * setting was labelled *"synced scrolling"* and gated two things: the preview
   * following the caret, and a click in the source revealing its place in the
   * preview. It did **not** gate scrolling one pane and having the other
   * follow — that was, and still is, the pane strip's own link toggle — so the
   * one checkbox named after synced scrolling was the one control in the
   * application that could not turn synced scrolling off.
   *
   * It now means what it says. The three behaviours it used to stand in for
   * have their own switches below, because the report was *"there should be a
   * way to disable that clicking on src brings to preview and the opposite —
   * each independently"*, and that is only answerable once each of them is a
   * separate thing to disable.
   *
   * Both this and a pane's own `linked` flag have to be on. They are not
   * duplicates: the flag says *these two panes are a pair*, which is an
   * arrangement, and this says *pairs follow each other*, which is a habit.
   */
  syncScroll?: boolean;
  /**
   * Whether moving the caret scrolls the preview to the caret's line.
   *
   * On, because *"if the cursor is somewhere, that is what should match"*. Off
   * for the writer who reads one part of the page while editing another, where
   * every arrow key drags the preview back.
   */
  followCaret?: boolean;
  /** Whether clicking in the source reveals that spot in the preview. */
  clickToPreview?: boolean;
  /**
   * Whether clicking the preview puts the caret on the word clicked.
   *
   * The only one of the four that had no gate at all — not off by default, but
   * genuinely unswitchable, which is why the request named this direction
   * explicitly.
   */
  clickToSource?: boolean;
  /**
   * Where a revealed spot lands in the pane it is revealed in.
   *
   * `match` puts it at `syncMatch`'s alignment point — the middle by default —
   * which is what a jump wants: the thing asked for, centred, with its
   * surroundings visible on both sides.
   *
   * `keep` puts it at the same height in the target pane that it was clicked at
   * in the source one. Nothing moves further than it has to, so the eye does not
   * have to re-find the line; the cost is that a click near the foot of a pane
   * reveals its answer near the foot, with nothing after it on screen.
   */
  clickTarget?: "match" | "keep";
  /**
   * Which panes a panel row takes you to.
   *
   * Clicking a heading in the outline moved the caret in the source and left the
   * preview where it was — so the one surface whose whole job is *"take me to
   * that chapter"* took you there in the pane you were not necessarily reading.
   *
   * The three answers are the three a writer can want, and which is right
   * depends on how the panes are arranged rather than on anything the product
   * can work out: reading the preview full-width, `preview`; writing with the
   * source in front, `source`; two panes side by side, `both`.
   *
   * It governs every panel row that goes somewhere — the outline, the notes
   * pane, the marks pane — because they are one act (`runtime.jumpTo`) reached
   * through three lists, and a per-panel setting would be three names for one
   * question. The label says "a panel row" for that reason.
   */
  outlineJump?: "source" | "preview" | "both";
  /**
   * What happens to the arrangement you are standing in when you open a
   * document.
   *
   * The report was *"opening a document replaces the one I had open"*, and it
   * was true of every route into a document — the switcher, the Documents menu,
   * the library, opening a file, an import, a share link, a rescued draft. Each
   * one called `openDoc`, which puts the arriving sefer into the panes the
   * writer was already using. Nothing was lost from disk; what was lost was the
   * arrangement, which for somebody comparing two seforim side by side is the
   * work.
   *
   * The `⧉` control existed on two rows and opened a second arrangement, so the
   * capability was there and the default was the other way round. This makes the
   * default the choice:
   *
   * · `reuse` — go to the arrangement already showing that document, and make a
   *   new one only if there is none. What an editor does, and the default.
   * · `newTab` — always a new arrangement, even onto a sefer already on screen.
   * · `current` — open it here, over what you were reading. The old behaviour,
   *   kept because a writer working in one document at a time wants exactly it.
   *
   * It governs *opening*, never *switching*: closing a document, deleting one,
   * `goToLastDoc` and the session restore all pick a document to show in the
   * arrangement that is already there, and a new tab for any of them would be a
   * tab nobody asked for.
   */
  openIn?: "reuse" | "newTab" | "current";
  /**
   * Where the two panes line up: the top, middle or bottom of the viewport. The
   * line at that point of the source is put at the same point of the preview —
   * and when the caret is on screen it is the caret's line that is matched, so
   * "where I am looking" and "where I am typing" agree. Defaults to the middle,
   * which is what a writer watching their own line wants; the top is right for
   * reading straight down.
   */
  syncMatch?: "top" | "middle" | "bottom";
  /**
   * How quickly the preview chases the writing. One page compiles in tens of
   * milliseconds, but a whole sefer takes seconds, and recompiling that on every
   * pause in a long chapter is the lag the report was about. `live` recompiles a
   * quarter-second after the last keystroke; `relaxed` waits longer, so a big
   * sefer is laid out once the writer has actually stopped rather than between
   * every sentence. Both are exact — this trades how often the layout runs,
   * never whether it is right.
   */
  previewDelay?: "live" | "relaxed";
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
   * Per note kind, whether its body is written inline where the marker sits or
   * collected into a section at the end of the source (in order). Keyed by the
   * note's `where` — foot-of-page, section, document, margin, volume — so a
   * writer can keep footnotes inline while sending endnotes to the back. A kind
   * with no entry falls back to the global `deferNoteBodies`.
   */
  noteBodyPlacement?: Partial<Record<string, "inline" | "deferred">>;
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
  /** Where typewriter scrolling parks the caret line, as a share of the pane
   *  from its top: a third down, halfway, or two thirds. */
  typewriterAnchor?: "upper" | "center" | "lower";
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
  typewriterAnchor: "center",
  checkUpdates: true,
  autocomplete: true,
  autoPairBrackets: true,
  autoPairQuotes: false,
  keepMenuPosition: false,
  proseStrip: false,
  spellcheck: true,
  spellcheckComments: false,
  tabStrip: "always",
  syncScroll: true,
  followCaret: true,
  clickToPreview: true,
  // On, which is what it has always effectively been: this direction had no gate
  // at all, so turning it into a setting must not turn it into a setting that
  // starts off.
  clickToSource: true,
  clickTarget: "match",
  // What it did before it was a choice, so an existing writer notices nothing
  // until they ask for more.
  outlineJump: "source",
  // Not the old behaviour, and deliberately: the old behaviour is the reported
  // bug. `reuse` costs a writer who works in one document nothing — the sefer
  // they open is not already in a tab, so they get the one tab they had — and
  // gives the writer with two seforim their arrangement back.
  openIn: "reuse",
  syncMatch: "middle",
  previewDelay: "live",
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

/**
 * Why the preferences could not be written, or null if they were.
 *
 * The symmetric case to [`settingsLoadFailure`], and it had no reporting at all.
 * A failed *read* raised a banner; a failed *write* was swallowed here on the
 * argument that *"the save path says so far more usefully than a silently
 * reverted toggle would"* — which is about saving a **document**, and is not
 * what this key holds.
 *
 * What is in it: keybindings, macros, custom commands, snippets,
 * `savedArrangements` (whole pane trees), and `settings.tabs` — every tab's
 * serialised tree, rewritten by `rememberPanes()` on every splitter drag, link
 * toggle and document switch. localStorage is about five megabytes for the whole
 * origin and it is shared with `ksav.library`, `ksav.recovery` (a full document
 * body) and `ksav.userWords`.
 *
 * When it fills, every preference the writer sets from then on is accepted by
 * the UI, applied for the session, and gone on reload. That is
 * `no-preference-ever-survived-a-reload` reintroduced by another route, with the
 * difference that the machinery to report it already existed and was wired to
 * one half.
 */
let writeFailure: string | null = null;

/** Why the preferences could not be written, or null if they were. */
export function settingsWriteFailure(): string | null {
  return writeFailure;
}

/**
 * Told the first time a write fails, and not again until one succeeds.
 *
 * A callback rather than a direct call, because the banner lives in the shell
 * and this module is imported by it — and because *once* is the right number:
 * `saveSettings` runs on every splitter drag, and a notice per drag is a notice
 * nobody reads.
 */
let onWriteFailure: ((why: string) => void) | null = null;

/** Register the shell's banner. See `boot()`. */
export function reportSettingsWriteFailures(tell: (why: string) => void): void {
  onWriteFailure = tell;
  if (writeFailure) tell(writeFailure);
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    writeFailure = null;
  } catch (e) {
    const why = String((e as Error)?.message ?? e);
    const first = writeFailure === null;
    writeFailure = why;
    if (first) onWriteFailure?.(why);
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

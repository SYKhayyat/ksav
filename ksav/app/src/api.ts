// The backend contract, and the wire vocabulary it speaks.
//
// This file is the *what*: every shape one of the engine's answers arrives in
// (the audit's wire vocabulary), the two capability contracts (`Backend` for
// the engine, `Sources` for Girsa), and the two questions every module asks
// about them (`scanForBackend`'s caller-facing half and `sourcesOf`). The *how* —
// the three transports — is `transports.ts`; the two caches they share are
// `compilecache.ts`; the shared scan memo is `scanmemo.ts`.
//
// What none of them name anymore is the engine's services themselves. Routes
// and command names come from `services.gen.ts`, generated from the engine's own
// registry — because when they were spelled out here, the wasm one spelled
// `sefarim` in a way the worker had never heard of and nothing but a writer
// noticing could have found it.
//
// This file refuses to answer for: how any transport honours the contract
// (`transports.ts`), or the per-backend caches (`compilecache.ts`).

import { SERVICE, type GitOp } from "./services.gen";
import { type Scan, type ScanWire } from "./spans";

export interface DocConfig {
  font: string;
  size_pt: number;
  margin_cm: number;
  dir: "rtl" | "ltr";
  /**
   * The language the document is written in, as a BCP-47 tag.
   *
   * Empty means "follow the direction" — the engine reads `ltr` as English and
   * `rtl` as Hebrew. It matters because Typst hyphenates, shapes quotation marks
   * and names its own generated headings by language, so an English document
   * typeset as Hebrew gets no hyphenation and the wrong quotes.
   */
  lang?: string;
  numbering: boolean;
  /**
   * Justify paragraphs — half of one control.
   *
   * The other half is `text_align`, which holds the three edges and wins when it
   * says anything. `settings.alignChoice` / `alignSetup` are the only two places
   * that know the pair exists; everything else asks them.
   */
  justify: boolean;
  /** Where unjustified text sits: `right`, `center`, `left`, or `""` for "take `justify`". */
  text_align: string;
  line_spacing_em: number;
  para_spacing_em: number;
  first_line_indent_em: number;
  columns: number;
  paper: string;
  /**
   * A page size in centimetres, when a named paper is not what is wanted.
   *
   * **Both or neither.** Typst's `width`/`height` override `paper` entirely, so
   * a width with no height would keep the named paper's height and produce a
   * shape nobody asked for — the engine reads them as a pair or ignores them.
   * Absent means *use `paper`*, which is what every document written before
   * these existed says.
   *
   * A sefer is routinely printed at a size no standard names — 17×24, 20×27 —
   * and until now the only answer was the nearest A-size and living with the
   * margins.
   */
  page_width_cm?: number;
  page_height_cm?: number;
  hebrew_numbering: boolean;
  header: string;
  footer: string;
  /**
   * Per-edge margins, in cm. Absent means "use `margin_cm`" — which is not the
   * same as zero, and is why these are optional rather than defaulted.
   *
   * `inner`/`outer` are relative to the **binding**, not to the paper: on a
   * two-sided document they swap sides every page, so the text block keeps the
   * same distance from the fold on both leaves. That is the whole reason they
   * are not called left and right.
   */
  margin_top_cm?: number;
  margin_bottom_cm?: number;
  margin_inner_cm?: number;
  margin_outer_cm?: number;
  /** Extra width on the inner margin alone — the strip the binding swallows. */
  gutter_cm?: number;
  /** Print on both sides: mirror the margins, allow verso/recto heads to differ. */
  two_sided?: boolean;
  /** Running heads for even (verso) and odd (recto) pages. Empty = use header/footer. */
  header_even?: string;
  header_odd?: string;
  footer_even?: string;
  footer_odd?: string;
  /** Where the running head sits. Only means anything once `two_sided` is on. */
  head_align?: "center" | "outside" | "inside";
  /**
   * Height in cm reserved at the foot of every page for the page-foot
   * apparatus. Absent = the engine decides from the document.
   */
  notes_region_cm?: number;
  /**
   * What happens when that reserve (or the document's own inline one) is
   * smaller than its foot regions declare: `"grow"` raises it, `"refuse"`
   * stops with both numbers, `"flow"` keeps it and lets entries continue.
   */
  reserve_overflow: string;
  /** The two ceilings on a `#כלול` expansion (#63). Below the soft one nothing is
   * said; above it the document is reported and still produced; above the hard
   * one the walk stops. The engine default applies until the editor offers a row
   * for it — see the plan. */
  max_lines_warn: number;
  max_lines_refuse: number;
  /** PDF metadata. Without a title the file opens nameless in every reader. */
  title?: string;
  author?: string;
  keywords?: string[];
  /** A PDF standard to enforce, spelled as Typst spells it: `a-2b`, `ua-1`, … */
  pdf_standard?: string;
  /** Emit the PDF accessibility tree. On by default, as in Typst. */
  pdf_tagged?: boolean;
  /**
   * Keep a one-letter Hebrew word off the end of a line.
   *
   * Off by default, and that is a decision rather than an oversight: it changes
   * where lines break, so turning it on for every document ever written would
   * silently repaginate all of them.
   */
  prevent_orphans?: boolean;
  /**
   * One page, as tall as the sefer is — the digital output mode.
   *
   * **Overflow is impossible by definition** when the page grows: a note that
   * will not fit is a sentence about a page bottom, and this has none. Off by
   * default, because a sefer is a printed object and this is the other thing it
   * can be.
   */
  continuous?: boolean;
  /**
   * A companion volume — a channel at `מיקום: "קובץ"` — written as its own
   * file rather than bound behind the body.
   *
   * The same content either way, which is the point: the choice is made after
   * the sefer is written and changing it does not touch a note.
   */
  separate_volume?: boolean;
  /**
   * Which pages to export, `1,3,5-9`. A property of one export rather than of
   * the document, so it is set at the moment of exporting and never persisted.
   */
  pdf_pages?: string;
}

/**
 * Files that travel with the document on every compile.
 *
 * The engine has no file system — it may be a wasm module in this very tab — so
 * `#תמונה("logo.png")` can only work if the bytes are on the request. `data` is
 * base64, with or without a `data:` URL prefix.
 */
/**
 * One asset on a compile request.
 *
 * `hash` identifies the bytes; `data` (base64) is sent only when the engine is
 * not known to hold that hash already. An 8 MB image is ~11 MB of base64, and it
 * used to ride along on every keystroke-driven compile — so a hash-only entry,
 * resolved from the engine's content cache, is the difference between a tiny
 * request and an 11 MB one on every pause in typing.
 */
export interface RequestAsset {
  name: string;
  hash: string;
  /** base64; present only the first time the engine needs to see these bytes. */
  data?: string;
}

export interface RequestAssets {
  /** Images and other files the document refers to by name. */
  assets: RequestAsset[];
  /**
   * The other documents this one includes (`#כלול`), by title.
   *
   * Sent whole rather than by hash, unlike an image: a chapter is text the
   * writer is editing right now, so it changes on the very keystrokes that
   * trigger the compile and a content cache would miss every time.
   */
  parts?: { name: string; body: string }[];
  /** Extra fonts to make available for this compile. */
  fonts: RequestAsset[];
  /**
   * "html" asks for Typst's native HTML export instead of paged output, in
   * which case the result carries `html` rather than `pages_svg`/`pdf_base64`.
   */
  format?: "html";
  /**
   * Ask for the PDF as well as the previews.
   *
   * Off by default. The engine used to render a PDF on every compile and
   * base64 it into the response — around 300 KB per keystroke-triggered
   * preview, of which nothing on screen read a single byte. Only export and
   * print actually need it.
   */
  want_pdf?: boolean;
  /**
   * Ask for the assembled Typst source as well as the previews.
   *
   * Off by default, and for the same reason as `want_pdf`. The source is the 75 KB
   * prelude plus the document: of an 84 KB response for a one-page preview, 75 KB
   * was this, and the only thing that reads it is "export .typ", which compiles
   * for itself.
   */
  want_source?: boolean;
  /**
   * Ask which of the writer's lines printed on each page.
   *
   * Off by default, and the third flag with this shape. One preview asks for it:
   * the one following a source pane narrowed to a siman, which has to know which
   * pages that siman reached. The alternative was two `reveal` calls — a full
   * layout each, restated on every keystroke — so this rides on the layout that
   * has already happened. See `engine/src/pagelines.rs`.
   */
  want_lines?: boolean;
  /**
   * Ask what each note's marker printed as.
   *
   * Off by default, and the fourth flag with this shape. One surface asks for
   * it: the notes drawer, while it is open. It shares `want_lines`'s walk over
   * the laid-out frames and its re-parse of the source, so a document with both
   * on pays for the parse once. See `engine/src/notemarks.rs`.
   */
  want_markers?: boolean;
  /**
   * Ask what each page actually *says*.
   *
   * Off by default, and the fifth flag with this shape. One surface asks for
   * it: the find drawer, while it is searching the preview. It shares the walk
   * over the laid-out frames and the re-parse of the source with the two flags
   * above.
   *
   * The reason it is an engine answer at all rather than a client one is the
   * whole of the feature it serves: the printed page has words nobody typed — a
   * note's marker, a running head, an auto-numbered siman, an included chapter
   * — and searching the source string under the label "search the preview"
   * would be a different answer wearing the name of the one that was asked for.
   * See `engine/src/pagetext.rs`.
   */
  want_text?: boolean;
}

export const NO_ASSETS: RequestAssets = { assets: [], fonts: [] };

export interface Diagnostic {
  severity: "error" | "warning";
  /** What the writer reads. Bilingual, and about their command rather than
   *  Typst's type names — the engine rephrases it (`engine/src/diagnostics.rs`),
   *  so every backend and anything else talking to `/compile` gets the same
   *  sentence rather than depending on this front end to make it legible. */
  message: string;
  /** Typst's own words, for the details affordance. Never the message. */
  raw?: string;
  /** 1-based line **in the body that was sent**, which carries the custom-command
   *  preamble in front of the writer's document. `diagview.ts` subtracts it. */
  line?: number | null;
  /** 1-based column, counted in characters. */
  column?: number | null;
  /** The command this is about, when one can be named. */
  about?: string | null;
  /** The nearest real command name, when the one written does not exist. */
  did_you_mean?: string | null;
  /**
   * The included document this line came from, when the sefer is many files.
   *
   * `null` for the document the writer has open. Without it every error in a
   * twelve-chapter sefer reports a line number in a concatenation that exists
   * nowhere.
   */
  file?: string | null;
}

/**
 * A stretch of one file that printed on a page: 1-based lines, inclusive.
 *
 * `file` is the included document (`#כלול`) the lines belong to, or `null` for
 * the writer's own open document. It is not decoration: a page can hold the end
 * of one chapter and the head of the next, and without the name, lines 10–20 of
 * a chapter would be indistinguishable from lines 10–20 of the sefer that
 * included it.
 */
export interface LineRun {
  file: string | null;
  from: number;
  to: number;
}

/**
 * One printed line of one page: what it says, and where it came from.
 *
 * `y` is the baseline in points from the top of the page, which is what a hit
 * is revealed at. `file` and `line` are the source it can be traced back to,
 * and both are absent when it cannot be — a running head, a note's marker and
 * an auto-numbered siman are ink the writer never typed, and naming a nearby
 * line for them would put the caret in the wrong sentence with total
 * confidence.
 */
export interface PrintedLine {
  y: number;
  text: string;
  file?: string | null;
  line?: number | null;
}

/**
 * One marker the page printed, and where the prose it introduces begins.
 *
 * `marker` is the string as it was set — `1`, `א`, `1.` — so a numbering scheme
 * the prelude gains tomorrow arrives here with no work on this side. `at` is a
 * byte offset into the writer's own text; markers whose prose lives in an
 * included chapter are dropped by the engine, because that offset would mean
 * something else entirely in the document this client has open.
 */
export interface NoteMarker {
  marker: string;
  at: number;
}

export interface CompileResult {
  ok: boolean;
  /** Every page of the document, in order — filled in by `CompileCache` for any
   *  the engine left out because this client already had it. */
  pages_svg: string[];
  /** One fingerprint per page, naming what is at each position. The client keeps
   *  its pages under these names and sends them back on the next compile, and the
   *  preview compares them to decide which page nodes to touch. */
  pages_hash?: string[];
  pdf_base64: string | null;
  diagnostics: Diagnostic[];
  /** The assembled Typst source — empty unless `want_source` asked for it. */
  typst_source: string;
  /** Set only for a `format: "html"` request. */
  html?: string;
  /**
   * Which of the writer's lines printed on each page, one entry per page.
   *
   * Empty unless `want_lines` asked. A page reports *runs* rather than one
   * range because a running head repeats a heading from far above it, and a
   * page collapsed to a minimum and a maximum would claim to hold everything in
   * between. See `engine/src/pagelines.rs`.
   */
  pages_lines?: LineRun[][];
  /**
   * Every marker the layout printed, paired with the prose beside it.
   *
   * Empty unless `want_markers` asked. **Not a list of notes**: the engine has
   * no idea what a note is, and the pairs that belong to no note — the marker
   * printed in the prose, followed by the sentence it interrupts — are in here
   * too. `notes.markerFor` intersects them with the note bodies this client
   * already scanned. See `engine/src/notemarks.rs`.
   */
  note_markers?: NoteMarker[];
  /**
   * What each page says, in reading order, one entry per page.
   *
   * Empty unless `want_text` asked. Each line carries the source line it can be
   * traced back to, or nothing at all where the ink was not the writer's own
   * text — which is why a find drawer can offer to *edit* some printed hits and
   * only reveal the others. See `engine/src/pagetext.rs`.
   */
  pages_text?: PrintedLine[][];
  /** Hashes the client omitted bytes for but the engine did not hold; the client
   *  re-sends them. Absent from older engines, which is treated as "none". */
  missing_assets?: string[];
  /** The asset-cache protocol this engine supports. Absent on pre-SHA engines. */
  asset_cache?: "sha256";
}

/**
 * What the engine actually puts on the wire: a page is `null` when the client
 * said it already holds the page with that fingerprint.
 *
 * Deliberately not the shape the rest of the app sees. Everything downstream of
 * [`CompileCache`] gets a complete `pages_svg`, because a preview that has to
 * remember which of its pages are real is a preview that will one day draw a
 * `null`.
 */
/** The rendered pages and confirmed assets this client holds —
 * `compilecache.ts`. */


export interface CommandDef {
  he: string;
  en: string;
  category: string;
  desc_he: string;
  desc_en: string;
  insert: string;
  /**
   * Still compiles, no longer offered.
   *
   * A command in documents cannot be deleted; a command that misleads cannot
   * keep a toolbar button. `הערה_על_הערה` is the case — it names the tiered
   * mechanism and is a cosmetic alias for a slightly smaller, slanted footnote.
   * Deprecated commands stay out of the toolbar, the Insert menu and the
   * palette, and keep working wherever they are already written.
   *
   * Optional because an older engine build does not send it.
   */
  deprecated?: boolean;
}

/**
 * One sefer in the catalogue the source index sorts by.
 *
 * `order` is its place in the traditional sequence — Tanach, then Shas in seder
 * order, then the poskim — and is the reason the index can put בבא בתרא after
 * בבא מציעא rather than before it.
 */
export interface SeferDef {
  canonical: string;
  kind: string;
  order: number;
  aliases: string[];
}

/**
 * One template, as `engine/src/templates.rs` shapes it.
 *
 * **Re-exported, not re-declared.** This was a hand-written mirror of that
 * struct — the one Rust→TypeScript table with none of `facts.gen.json`'s
 * protection, which is §1 #8's finding: `facts.rs` says *"a value crossed a
 * language boundary as source text… so it stops crossing as text"*, and was
 * applied to four tables while this one went on being typed out.
 *
 * A field added in Rust never reached the client; a field renamed became
 * `undefined` at every use, silently, because the Rust value always wins on the
 * wire. `engine.gen.ts` generates it from the field names `facts.rs` measures by
 * serialising a real `Template`.
 *
 * `lang` is the language the body is written in: `"he"` or `"en"`. Loading a
 * template switches the document to the direction that goes with it — an English
 * letter set flush right is nobody's letter.
 */
import type { TemplateDef } from "./engine.gen";
export type { TemplateDef };

/** One word the checker does not recognise, positioned in the text it checked. */
export interface Misspelling {
  start: number;
  len: number;
  word: string;
  /** Which lexicon flagged it: "he" or "en". */
  lang?: string;
  suggestions?: string[];
}

export interface SpellResult {
  misspellings: Misspelling[];
  /** Both lexicons together. */
  lexicon_size: number;
  /** Per language, so the interface can name what it is actually checking
   *  rather than repeat a claim the engine might not be able to keep. */
  lexicon_sizes?: { he: number; en: number };
}

/** A source that arrived from Girsa and is waiting for the cursor
 *  (spec.md §10.6). Already real Ksav markup: the packet is rendered in Rust
 *  the moment it lands, so there is no second renderer here to drift from it. */
export interface Arrival {
  /** Names this arrival while it is in flight, so a poll can acknowledge it. */
  id: string;
  markup: string;
  display: string;
  reference: string;
  /** A whole document handed over from Girsa's buffer, rather than a quote to
   *  drop in at the caret. The editor asks before replacing what is open. */
  whole: boolean;
}

/** One place a phrase turns up, as the library answered (spec.md §10.4). */
export interface Mekor {
  id: string;
  ref: string;
  /** The citation, printed by the library — the pen does not know what a
   *  siman is, and does not have to. */
  display: string;
  he_title: string;
  /** The words around the match, with the match in `[brackets]` and any elision
   *  shown as `…`. **Not the whole segment** — the largest in the corpus is
   *  1,275,307 characters, and this used to be all of it, cut to 90 characters
   *  from the start on arrival. See `girsa_search::snippet`. */
  shown: string;
  /** How long the whole segment is, so a window into it does not read as all of
   *  it. */
  characters: number;
  /**
   * Which characters of the place this citation actually is, if the library
   * said. Half-open, counted in the text as the reader was shown it; `to: null`
   * is *from there to the end*, which is what a highlight running off the last
   * word means.
   *
   * Optional because a Girsa older than `girsa-source` 0.5.1 does not send one,
   * and because a whole-se'if citation says so by saying nothing — `{from: 0,
   * to: null}` is the whole place and is written as no `תווים:` at all, which
   * is what every document written before the field existed already says.
   *
   * It is here because it was **structurally unreachable**: the field shipped in
   * the shared crate, the Rust door (`ksav_engine::source`) wrote it, and
   * `citation.ts` — the editor's own insertion path, and the *only* producer of
   * a citation on this side — had no way to express it. One feature, two doors,
   * one of them missing an argument.
   */
  range?: { from: number; to: number | null };
}

/** What Girsa says about a phrase. `total` first, because a phrase in four
 *  thousand places has no source — it has a language, and offering the first
 *  as "the mekor" would be an invention. */
export interface Mekoros {
  phrase: string;
  total: number;
  is_a_quotation: boolean;
  /** The one-line answer, in the library's own words. */
  said: string;
  places: Mekor[];
  error?: string;
}

/**
 * A point on a rendered page, in Typst points.
 *
 * Points rather than pixels, because that is the unit the page's own SVG
 * `viewBox` is written in — so the client converts with the drawn element's
 * width and nothing else, and neither zoom nor the fit-to-width setting can
 * make the two sides disagree about where something is.
 */
export interface PagePoint {
  /** 0-based, matching `pages_svg`. */
  page: number;
  x_pt: number;
  y_pt: number;
}

/** A place in the body that was sent: 1-based line, 1-based character column.
 *  The same convention as [`Diagnostic`], so the same preamble subtraction
 *  applies (`diagview.lineInDocument`). */
export interface BodySpot {
  line: number;
  column: number;
}

/** What `assemble` answers: the document as Typst, and anything `#כלול` could
 *  not resolve. No pages, because nothing was laid out. */
export interface AssembledSource {
  ok: boolean;
  typst_source: string;
  diagnostics: Diagnostic[];
}

/* ── The seven shapes that crossed the wire undeclared ──────────────────────
 *
 * Each of these was an inline `{ text?: string; error?: string }` written at
 * one call site, or nothing at all. The 9 August report gave Girsa the wire row
 * — *"a generator catches a stale copy of a registry, never a wrong one"* — and
 * `test/wire.test.mjs` is the comparator this repository took from it: it reads
 * every `serde_json::json!` response literal in the engine and asks whether an
 * interface here declares its keys.
 *
 * A shape declared at one call site is a shape nothing can be compared against.
 * These are the declarations, and the fence covers all seventeen literals. */

/** Every response can be a refusal: `error_json` is a superset of the compile
 *  shape with an `error` on it, so *"a refusal never has to be told apart from
 *  the failure of the thing refused"* (`services.rs`). */
export interface Refusable {
  error?: string;
}

/** `jump`: where in the body a point on a page came from, and which file — the
 *  answer is `{}` when the point is not over any of the writer's own text. */
export interface Located {
  line: number;
  column: number;
  /** The included file the line came from, or null for the main document. */
  file: string | null;
}

/** What `places` answers: where a line of a part landed, and the first of them.
 *
 *  `places` is 1-based lines of the **expanded** body, ascending, so they read as
 *  a writer would read the document. `first` is always `places[0]` when the line
 *  is in a part at all, and `null` when it is in none — which is why it is a
 *  field and not something the caller derives. */
export interface Places {
  places: number[];
  /** `null` for a line that is in no part, which is a different answer from a
   *  line that is the main body. */
  first: number | null;
  file: string | null;
  line: number;
}

/** `reveal`: everywhere on the rendered pages one place in the body ended up. */
export interface Revealed {
  points: PagePoint[];
}

/** `linkify`: the same markup with the mareh mekomos turned into links. */
export interface Linkified {
  text: string;
}

/** `refresh`: every citation in a document as the library has it now
 *  (spec.md §10.2), with the two counts the panel draws its line from. */
export interface RefreshResult {
  quotes: Refreshed[];
  total: number;
  /** How many of them could not be refreshed. */
  trouble: number;
  /**
   * The citations whose place upstream re-segmented, and where each points now.
   *
   * A refresh already returned the *right words* for these — Girsa's `Open::at`
   * walks the corpus's redirect rows — and said nothing about the document
   * holding a name that only resolves because those rows exist on that machine,
   * against that shelf. A document is a file somebody emails.
   */
  moved: Moved[];
  /**
   * The document with those citations rewritten, or null when there is nothing
   * to offer.
   *
   * Offered, never applied: a mareh makom is the writer's sentence, and a
   * correction in somebody else's library silently changing what a document
   * *says* is the surprise spec.md §7.1 exists to avoid. A place that became
   * several is reported in `moved` and deliberately not rewritten — there is no
   * single new name to put, and inventing one would cite words nobody quoted.
   */
  retargeted: string | null;
}

/** What a refresh came back with: the rows, and what moved. */
export interface Refreshing {
  quotes: Refreshed[];
  moved: Moved[];
  retargeted: string | null;
}

/** One row of `girsa_ref::RedirectTable`: an old ref, and where it went. */
export interface Moved {
  from: string;
  to: string[];
}

/** `saved-here`: whether Girsa took the errand. False is an answer — Girsa not
 *  running is the ordinary case, not a failure. When it is false and the build
 *  has a loopback, `why` is what Girsa said. */
export interface Told {
  told: boolean;
  why?: string;
}

/** `clipboard-source`: a Girsa source packet on the clipboard, rendered to Ksav
 *  markup in Rust, or null for *there is no packet, paste as text*. */
export interface ClipboardSource {
  markup: string | null;
}

/** One row of `services`: the registry describing itself, so a caller can ask
 *  rather than keep a copy. Generated into `services.gen.ts` as well — this is
 *  the shape of what the engine puts on the wire, and that is the shape the
 *  build reads at compile time. Both, deliberately: the generator cannot tell
 *  you the original is wrong. */
// ---------------------------------------------------------------- version control
//
// The wire shapes of the one `git` service. They live here with `Mekoros` and
// `RefreshResult` because this file is where what-the-engine-puts-on-the-wire
// is written down; what to *do* about them — whether this build can ask at all,
// what a status amounts to — is `git.ts`.

/** One path git has something to say about. */
export interface GitFile {
  path: string;
  /** The index against HEAD: `M`, `A`, `D`, `R`, `?`, or `.` for unchanged. */
  staged: string;
  /** The working tree against the index, same alphabet. */
  worktree: string;
  kind: "ordinary" | "renamed" | "unmerged" | "untracked";
  /** Where a rename came from. */
  from?: string;
}

/** The document itself, which is what the drawer is actually about. */
export interface GitThis {
  path: string;
  /** Has this document ever been committed. Absent from `files` means either
   *  *unchanged and tracked* or *not in the repository at all*, and those are
   *  the opposite answer for a reader — so the engine asks separately. */
  tracked: boolean;
  staged: string;
  worktree: string;
  kind: GitFile["kind"];
}

export interface GitStatus {
  ok: boolean;
  /** The installed git's version. `null` is answered when there is none, and
   *  is the first thing the drawer says rather than the last thing it fails on. */
  git: string | null;
  /** The repository root, or `null` when the document is not inside one. */
  root: string | null;
  branch?: string | null;
  head?: string | null;
  upstream?: string | null;
  ahead?: number;
  behind?: number;
  detached?: boolean;
  /** Mid-merge: there is a `MERGE_HEAD`, and the writer has work to do. */
  merging?: boolean;
  files?: GitFile[];
  this?: GitThis | null;
  /** Who git will record as the author, or `null` when it has not been told —
   *  which is worth asking, because the alternative is a first commit failing
   *  with git's own nine-line lecture about `user.email`. */
  who?: { name: string; email: string } | null;
  error?: string;
}

export interface GitCommit {
  hash: string;
  short: string;
  author: string;
  email: string;
  /** Unix seconds. */
  when: number;
  /** `HEAD -> main, origin/main`, as git formats it. */
  refs: string;
  subject: string;
}

export interface GitBranch {
  name: string;
  upstream: string | null;
  current: boolean;
  short: string;
  subject: string;
}

export interface GitRemote {
  name: string;
  url: string;
}

/**
 * Any answer from the `git` service.
 *
 * One shape for eighteen operations, because every one of them can also be a
 * refusal and the refusal shape is shared. `merged: false` with a `conflicts`
 * list is **not** a failure — see `engine/src/git.rs`.
 */
export interface GitAnswer extends GitStatus {
  commits?: GitCommit[];
  branches?: GitBranch[];
  remotes?: GitRemote[];
  /** The document at some commit, for `show`. */
  text?: string;
  /** git's own words. Never rephrased: "Permission denied (publickey)" is the
   *  one string a reader can search for. */
  said?: string;
  hash?: string | null;
  merged?: boolean;
  conflicts?: string[];
}

export interface ServiceRow {
  name: string;
  method: string;
  path: string;
  cost: string;
  nativeOnly: boolean;
}

/** The editor-facing portion of the Rust lexical scan service. */
export interface ScanResult extends ScanWire {
  /** Normal node assembly/classification over validated Rust lexical facts. */
  scan: Scan;
}

/**
 * Per-compile hints the two transports need for different reasons.
 *
 * `background` is the wasm build's answer to one worker, one queue: a background
 * layout or spell check marked this way is never posted while a foreground
 * compile is outstanding, so the writer's compile is not stuck behind work
 * nobody asked for. `signal` is the HTTP build's: a superseded compile is
 * aborted rather than left to occupy a server thread and one of the browser's
 * six connections until it finishes and its result is discarded. Each backend
 * uses the one it can act on and ignores the other — wasm-bindgen cannot yield
 * to abort mid-compile, and a browser tab has no worker queue to jump.
 */
export interface CompileOpts {
  background?: boolean;
  signal?: AbortSignal;
}

export interface Backend {
  readonly kind: string; // "server" | "wasm"
  compile(body: string, cfg: DocConfig, assets?: RequestAssets, opts?: CompileOpts): Promise<CompileResult>;
  /**
   * The document as Typst source — prelude, page setup, chapters expanded —
   * without compiling it.
   *
   * "Export .typ" used to call `compile` with `want_pdf` **and** `want_source`
   * and throw everything away but the string: a full layout and a base64 PDF,
   * seconds of it on a sefer, to obtain a `format!` the engine does before it
   * lays anything out. Same bytes: the engine's two services read the request
   * through one reader and assemble through one function, and
   * `engine/tests/assemble.rs` asserts the two agree byte for byte.
   */
  assemble(body: string, cfg: DocConfig, assets?: RequestAssets): Promise<AssembledSource>;
  /**
   * Inverse search: what did the writer type, that printed here?
   *
   * `null` for a click that landed on something the writer did not type — a
   * margin, a running head, a note-band rule — and for a document that does not
   * currently compile. The caller leaves the cursor alone in every one of those
   * cases, which is why they need not be told apart.
   */
  jump(body: string, cfg: DocConfig, at: PagePoint, assets?: RequestAssets): Promise<Located | null>;
  /**
   * Forward search: where on the page did this land?
   *
   * Several places, in page order: a note whose body is set in both a band and
   * an endnote list prints twice, and text in a running head prints on every
   * page. Empty when it printed nowhere.
   */
  reveal(body: string, cfg: DocConfig, at: BodySpot, assets?: RequestAssets): Promise<PagePoint[]>;
  /**
   * Every place a line of a part landed, in reading order (#82).
   *
   * The other direction again, and the question `reveal` cannot answer: a part
   * included twice prints twice, and a writer who wants to know *where* it
   * appears has one number from the engine and no way to ask for the others.
   *
   * **`first` is carried rather than left to the client to compute.** It is
   * `places[0]` by construction in the engine — the two share one predicate — and
   * a client that picked "the first of the list" would be reimplementing
   * *"first is reading order"* across a JSON boundary, which is where that rule
   * would drift. `first: null` means *"this line is in no part"*, which is a
   * different answer from a line that is the main body.
   */
  places(body: string, cfg: DocConfig, at: BodySpot, assets?: RequestAssets): Promise<Places>;
  /** Structural facts from the Rust scanner, for consumers that can await. */
  scan(text: string, opts?: { signal?: AbortSignal }): Promise<ScanResult>;
  /** Check text against both lexicons plus the writer's own words. */
  spell(text: string, userWords: string, suggest?: boolean): Promise<SpellResult>;
  /** Suggestions for one word — asked for only when a menu is opened. */
  suggest(word: string, userWords: string): Promise<string[]>;
  commands(): Promise<CommandDef[]>;
  /** The sefer catalogue, for citation autocomplete. The same list the source
   *  index sorts by, so what the editor offers and where the index files it
   *  can never be two different opinions. */
  sefarim(): Promise<SeferDef[]>;
  templates(): Promise<TemplateDef[]>;
  /**
   * Version control for the document at `path`.
   *
   * On `Backend` rather than beside `Sources`, and the difference is where the
   * capability actually lives. A build has a Girsa half or it does not, and
   * `sourcesOf` answers that once. Git is not a property of the build: the
   * question is whether *this document* has a place on disk, which a browser
   * tab never does and a desktop document only does once it has been saved.
   * `git.ts`'s `standing()` is that decision, it is made per document, and it
   * has three different answers to give a reader.
   */
  git(op: GitOp, path: string, extra?: Record<string, unknown>): Promise<GitAnswer>;
}

/** One shared scan for lints, preview and export warnings —
 * `scanmemo.ts`. */


/**
 * Talking to Girsa — the sibling application, not the engine.
 *
 * These four were on `Backend` for as long as there was one implementation of
 * it. They do not compile anything: they are IPC with another program that may
 * simply not be running, or not exist on this platform. A browser tab has no
 * listener for Girsa to hand a source to, and cannot reach its loopback token,
 * which lives in a file only the two installed applications can read.
 *
 * `WasmBackend` therefore does not implement this at all, and that is the whole
 * point of the split. It used to implement it with four stubs — one of which
 * returned a sentence for a *reader* ("this works when Girsa is open beside
 * Ksav") from inside a transport, in Hebrew, to a caller that then ran it
 * through the error rephraser and showed a generic "failed" instead. Nothing
 * had failed. The build simply does not have the capability, and now it says so
 * by not claiming it: callers ask `sourcesOf(backend)` and get `null`.
 */
export interface Sources {
  /** Sources handed over by Girsa since the last ask. Drained, so asking twice
   *  does not insert the same quote twice. */
  /** @param took ids from the previous answer that are now in the document. */
  inbox(took?: string[]): Promise<Arrival[]>;
  /** Where is this phrase from? Asked of Girsa, which has the corpus. */
  mekoros(phrase: string, except?: string): Promise<Mekoros>;
  /** Nothing fitted: put the phrase in Girsa's search and bring it up. */
  searchInGirsa(phrase: string): Promise<void>;
  /** Turn the citations in a piece of prose into live refs — the certain ones
   *  only (spec.md §10.5). Comes back rewritten, or unchanged. */
  linkify(text: string): Promise<string>;
  /**
   * The Source Packet on the clipboard, if Girsa put one there.
   *
   * spec.md §10.2's Ctrl+C, from this end. Girsa writes the packet under a real
   * native clipboard format — taking eighty-six careful lines to do it, because
   * a webview can only write Chromium's *web custom format*, which no native
   * application can read — and nothing here read it, so that copy landed in an
   * editor that only ever took `text/plain`.
   *
   * It has to be asked of the engine rather than read off the `paste` event: a
   * paste exposes `text/plain`, `text/html` and files, and a custom native
   * format is not among them on any platform.
   *
   * `null` is the ordinary answer — the reader copied from a text editor — and
   * is not a failure. The caller pastes as text.
   *
   * What comes back is **markup**, not the packet: it is rendered in Rust by
   * `ksav_engine::source`, the same renderer the loopback arrivals go through,
   * so a quote that arrives on the clipboard and one that arrives over the
   * loopback are the same document. A second renderer here is what spec.md
   * §10.3 rules out.
   */
  clipboardSource(): Promise<string | null>;
  /**
   * Every citation in this document, as the library has it **now**
   * (spec.md §10.2).
   *
   * *Regenerate every quote against a corrected edition* is a promise about a
   * document rather than about a place, and this is the errand that performs
   * it: one call, one row per citation, in the order they appear.
   *
   * What comes back is **rows and not a rewritten file**, and that is the whole
   * design. A correction somebody else made silently changing the words in the
   * sefer you are writing is the one surprise this arrangement exists to avoid
   * — a correction is a claim somebody made, not a fact about the sefer. So the
   * writer sees what moved and says yes.
   *
   * A citation Girsa cannot look up comes back as a row with a reason in it;
   * the other thirty-nine still refresh, and that decision is made once, in the
   * library, rather than forty times here.
   */
  refresh(markup: string, style?: string, nikud?: boolean): Promise<Refreshing>;
  /**
   * Tell Girsa this document was saved here (spec.md §10.4).
   *
   * The other half of *standing on a passage, see which of your own documents
   * cite it*. Girsa's registry, its query and its tests were all built and
   * nothing ever sent it a path — so the query walked `personal/ksav/`, the
   * documents written in Girsa's **own toy editor**, and a `.ksav` written in
   * the real Ksav answered *nothing cites this*.
   *
   * There is nowhere for Girsa to walk instead: a reader's documents live
   * wherever they keep documents, and a library application has no business
   * enumerating a disk. So the pen tells it.
   *
   * A path and a name — never the text. Girsa reads the file itself and caches
   * the refs against its modification time; sending the body would be a second
   * copy of one document with no owner between them.
   *
   * `false` means the library is not open, which is **not** an error: a save
   * must never fail because the sibling application is closed.
   */
  savedHere(path: string, name?: string, forget?: boolean): Promise<boolean>;
}

/** One citation, as the library has it now. */
export interface Refreshed {
  /** The place. */
  ref: string;
  /** The citation as it prints today. */
  display: string;
  /** The words today. */
  text: string;
  /** Why this one could not be refreshed, if it could not. */
  trouble?: string | null;
}

/**
 * The Girsa half of a backend, or `null` if this one has no such half.
 *
 * One test, in one place, so that "can I reach Girsa" is never four separate
 * `typeof b.mekoros === "function"` checks that drift apart.
 *
 * # It consolidated four drifting checks into one wrong one
 *
 * The test was `typeof s.inbox === "function"`, and `inbox` is defined on the
 * shared `ServiceClient` base — so it was **always** true. Every browser build
 * claimed a Girsa half it cannot have, and `t("girsaNeedsApp")` — the sentence
 * that tells a reader why source-finding is not available in a tab — sat
 * unreached.
 *
 * The test that should have caught it asserted the opposite. `services.test.mjs`
 * wrapped the Girsa rows in a `try/catch` under the comment *"`WasmBackend` has
 * no `Sources` half — a tab cannot reach the loopback — so the three Girsa
 * services have no method here. **That is the design.**"* It is not: the methods
 * are on the shared base, nothing throws, the `catch` was dead, and nothing
 * anywhere asserted absence. The comment was stale on the count as well — it
 * said *three* where the registry has six.
 *
 * # Keyed on the registry, which already knew
 *
 * `SERVICE.inbox.nativeOnly` is generated from `services.rs`'s own `Reach`
 * column. A build that cannot reach the loopback is a fact about the *build*,
 * and the one place that knows which services need it is the table that
 * declares them.
 *
 * A method check is still made beside it, because a backend could legitimately
 * be missing the half for a second reason — and a `typeof` that is redundant is
 * cheaper than a `typeof` that is missing.
 */
export function sourcesOf(b: Backend | undefined): Sources | null {
  const s = b as (Backend & Partial<Sources>) | undefined;
  if (!s || typeof s.inbox !== "function") return null;
  // A browser tab has no loopback, and no amount of duck-typing changes that.
  if (SERVICE.inbox.nativeOnly && s.kind === "wasm") return null;
  return s as Sources;
}

/** The three transports and the shared parse helpers under them —
 * `transports.ts`. */



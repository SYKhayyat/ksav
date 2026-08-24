// Backend abstraction: three transports, one contract.
//
// `HttpBackend` talks to the Rust `ksav serve` over HTTP, `WasmBackend` runs the
// engine in the browser through a worker, `TauriBackend` calls it in-process in
// the desktop app. The rest of the app depends only on the interface.
//
// What none of them do anymore is name the engine's services themselves. Routes
// and command names come from `services.gen.ts`, which is generated from the
// engine's own registry — because when they were spelled out here, the wasm one
// spelled `sefarim` in a way the worker had never heard of and nothing but a
// writer noticing could have found it.

import { SERVICE, SERVICE_PATH, type GitOp, type ServiceName } from "./services.gen";
import { isOp } from "./git";

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
type WirePages = (string | null)[];

/**
 * The rendered pages this client is holding, by fingerprint.
 *
 * A one-character edit in a 48-page document leaves 47 pages byte-identical: 9.7
 * MB was serialised, sent, parsed and written into the DOM on every pause in
 * typing to deliver 40 KB of actual change. So the client tells the engine which
 * pages it still has, and gets back `null` for those.
 *
 * The engine keeps no matching state — it answers only against the list on the
 * request — so this cache can never desynchronise it. The worst it can do to
 * itself is forget a page it claimed, which is caught and costs one extra
 * round trip.
 */
class PageStore {
  private held = new Map<string, string>();
  private bytes = 0;
  /** Roughly three copies of a very long document. Enough that a session's own
   *  pages stay resident; bounded so a long editing session cannot grow without
   *  end. */
  private static readonly CAP = 32 * 1024 * 1024;

  /** The fingerprints to tell the engine about. */
  have(): string[] {
    return [...this.held.keys()];
  }

  /** Remember the pages of a response that landed. */
  keep(pages: string[], hashes: string[] | undefined) {
    if (!hashes) return;
    for (let i = 0; i < pages.length && i < hashes.length; i++) {
      const h = hashes[i];
      if (!h || this.held.has(h)) continue;
      this.held.set(h, pages[i]);
      this.bytes += pages[i].length;
    }
    // A Map iterates in insertion order, and the document on screen was inserted
    // last, so evicting from the front drops the oldest pages first.
    for (const [h, svg] of this.held) {
      if (this.bytes <= PageStore.CAP) break;
      this.held.delete(h);
      this.bytes -= svg.length;
    }
  }

  /**
   * Put back the pages the engine left out.
   *
   * `null` — not a half-filled result — when a page we claimed to hold is not
   * actually here. The caller asks again for the whole document rather than
   * showing a gap, which is the one thing this must never do.
   */
  expand(res: CompileResult): CompileResult | null {
    if (!Array.isArray(res.pages_svg)) return res; // an html export carries none
    const wire = res.pages_svg as unknown as WirePages;
    if (!res.pages_hash) return res; // an engine that does not name its pages
    const pages: string[] = [];
    for (let i = 0; i < wire.length; i++) {
      const own = wire[i];
      if (typeof own === "string") {
        pages.push(own);
        continue;
      }
      const kept = this.held.get(res.pages_hash[i]);
      if (kept === undefined) return null;
      pages.push(kept);
    }
    return { ...res, pages_svg: pages };
  }
}

/**
 * What this engine session already has, so a request can leave it out: asset
 * bytes it holds, and rendered pages this client is still showing.
 *
 * One per backend instance — the asset cache lives in that engine's
 * process/worker, so a fresh backend (or a respawned worker) starts with nothing
 * confirmed. When the engine reports a hash it no longer has, that hash is
 * forgotten and its bytes go out again, which keeps the two sides honest without
 * either trusting the other's memory across a restart.
 */
export class CompileCache {
  private confirmed = new Set<string>();
  private pages = new PageStore();

  /** The engine lost its asset cache (a worker died). Pages are unaffected: the
   *  engine holds no page state to lose. */
  reset() {
    this.confirmed.clear();
  }

  /** The wire form of `assets`, with bytes dropped for anything already cached,
   *  plus the hashes whose bytes this request does carry (to confirm on success). */
  private prepare(assets: RequestAssets): { wire: RequestAssets; sent: string[] } {
    const sent: string[] = [];
    const strip = (list: RequestAsset[]): RequestAsset[] =>
      list.map((a) => {
        if (a.hash && this.confirmed.has(a.hash)) return { name: a.name, hash: a.hash };
        if (a.hash) sent.push(a.hash);
        return a; // carries data
      });
    return { wire: { ...assets, assets: strip(assets.assets), fonts: strip(assets.fonts) }, sent };
  }

  /**
   * Run a compile with the bytes and the pages the engine already has left out,
   * asking again for whatever turns out not to be there.
   *
   * At most one retry, and it asks for everything: a second guess after a wrong
   * one is how a cache turns a saving into a hang.
   */
  async compile(
    send: (payload: Record<string, unknown>) => Promise<CompileResult>,
    assets: RequestAssets,
  ): Promise<CompileResult> {
    const first = this.prepare(assets);
    let res = await send({ ...first.wire, have_pages: this.pages.have() });
    let sent = first.sent;
    let full = this.pages.expand(res);
    const lostAssets = res.missing_assets?.length ? res.missing_assets : null;

    if (lostAssets || !full) {
      if (lostAssets) for (const h of lostAssets) this.confirmed.delete(h);
      const retry = this.prepare(assets);
      // Nothing claimed on the retry when a page went missing: get the document
      // whole rather than guess a second time.
      res = await send({ ...retry.wire, have_pages: full ? this.pages.have() : [] });
      sent = retry.sent;
      // Still short is not possible with an empty claim, but if it ever were, no
      // pages beats wrong pages — `runCompile` leaves the last good preview up.
      full = this.pages.expand(res) ?? { ...res, pages_svg: [] };
    }

    for (const h of sent) this.confirmed.add(h);
    this.pages.keep(full.pages_svg, res.pages_hash);
    return full;
  }
}

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
 *  running is the ordinary case, not a failure. */
export interface Told {
  told: boolean;
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

/** What `call` may be told about a single request. */
interface CallOpts {
  timeoutMs?: number;
  background?: boolean;
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
  jump(body: string, cfg: DocConfig, at: PagePoint, assets?: RequestAssets): Promise<BodySpot | null>;
  /**
   * Forward search: where on the page did this land?
   *
   * Several places, in page order: a note whose body is set in both a band and
   * an endnote list prints twice, and text in a running head prints on every
   * page. Empty when it printed nowhere.
   */
  reveal(body: string, cfg: DocConfig, at: BodySpot, assets?: RequestAssets): Promise<PagePoint[]>;
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

/**
 * A jump answer, from whatever the engine actually said.
 *
 * Deliberately paranoid about its input, because there are two ways to get a
 * reply with no answer in it and they look nothing alike: `{}` from a click that
 * landed on a margin, and the compile-shaped `{ok: false, diagnostics: […]}` a
 * busy or timed-out server returns. Both mean "leave the cursor alone", so both
 * are read as `null` here rather than being told apart by three call sites.
 */
function readSpot(v: unknown): BodySpot | null {
  const o = v as { line?: unknown; column?: unknown } | null;
  if (!o || typeof o.line !== "number" || o.line < 1) return null;
  return { line: o.line, column: typeof o.column === "number" ? o.column : 1 };
}

/**
 * What `assemble` is sent, in one place for all three backends.
 *
 * The chapters and nothing else. Images and fonts never appear in the source
 * text — the document refers to them by name — so sending their bytes would be
 * paying a megabyte to be ignored, and this is the one request in the app whose
 * whole reason to exist is that it is cheap. `parts` has to go: `#כלול` is
 * expanded *before* assembly, and an export that dropped a chapter would be a
 * hole in a file somebody sent to a printer.
 */
function assembleRequest(body: string, cfg: DocConfig, assets: RequestAssets) {
  return { body, ...cfg, parts: assets.parts };
}

function readPoints(v: unknown): PagePoint[] {
  const list = (v as { points?: unknown } | null)?.points;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (p): p is PagePoint =>
      !!p && typeof p.page === "number" && typeof p.x_pt === "number" && typeof p.y_pt === "number",
  );
}

/**
 * Every service a backend answers the same way, over one door.
 *
 * # The finding
 *
 * Three transport classes held 312 of this file's 582 code lines between them,
 * and **ten of their twelve methods differed only in how they spelled one
 * call**: `(await this.send(name, obj)).json()` against
 * `JSON.parse(await this.call(name, JSON.stringify(obj)))`. Every layer *below*
 * this file had already collapsed to `(ServiceName, string) => Promise<string>`
 * — the engine routes HTTP from the registry, the wasm module dispatches its
 * single `ksav_call` export from it, and the desktop shell has one Tauri command
 * that looks names up in it. The registry unified the dispatch and left the
 * façade triplicated.
 *
 * That is not only length. It is three places to add a service and three places
 * to forget one — and the last time this file was triplicated, the wasm backend
 * spelled `sefarim` in a way the worker had never heard of, which nothing but a
 * writer noticing could have found.
 *
 * # What stays per-transport
 *
 * `call`, and `compile`. The transports genuinely differ about *failure*: HTTP
 * has a status code, the wasm worker can be killed mid-compile and has to answer
 * with a diagnostic rather than leave a promise hanging, and the desktop shell
 * has neither problem. Nothing else does — a spell check is a spell check.
 */
abstract class ServiceClient {
  /**
   * The one door. `input` is the JSON request body, or `""` for a service that
   * takes none; the answer is the JSON response as text.
   */
  protected abstract call(service: ServiceName, input?: string, opts?: CallOpts): Promise<string>;

  /** A service, its request, and its answer parsed. */
  protected async ask<T>(service: ServiceName, req?: unknown, opts?: CallOpts): Promise<T> {
    return JSON.parse(await this.call(service, req === undefined ? "" : JSON.stringify(req), opts)) as T;
  }

  /** No timeout anywhere below: none of these lays a document out. */
  async assemble(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<AssembledSource> {
    return this.ask("assemble", assembleRequest(body, cfg, assets));
  }

  async spell(text: string, userWords: string, suggest = false): Promise<SpellResult> {
    // Background: on the wasm build a spell check shares the one worker with the
    // compile, and the writer is waiting on the compile, not the squiggles.
    return this.ask("spell", { text, user_words: userWords, suggest }, { background: true });
  }

  async suggest(word: string, userWords: string): Promise<string[]> {
    const out = await this.ask<{ suggestions?: string[] }>("suggest", {
      word,
      user_words: userWords,
    });
    return out.suggestions ?? [];
  }

  async commands(): Promise<CommandDef[]> {
    return this.ask("commands");
  }

  async sefarim(): Promise<SeferDef[]> {
    return (await this.ask<{ sefarim?: SeferDef[] }>("sefarim")).sefarim ?? [];
  }

  async templates(): Promise<TemplateDef[]> {
    return this.ask("templates");
  }

  /**
   * One service, eighteen operations, one method.
   *
   * No `throw` on a refusal, unlike `linkify` and `refresh`: half of what git
   * says is a refusal a writer is *meant to read* — nothing to commit, the
   * branch already exists, the host wants a password — and turning those into
   * exceptions would mean catching them all again to get the sentence back
   * out. The answer carries `ok` and the drawer shows what it says.
   */
  async git(op: GitOp, path: string, extra: Record<string, unknown> = {}): Promise<GitAnswer> {
    // The wire does not read TypeScript. `isOp` turns the type into a checked
    // claim at the last door before the request leaves, for the embedder whose
    // JavaScript never met a `.d.ts`.
    if (!isOp(op)) {
      return { ok: false, error: `unknown git operation: ${op}` } as GitAnswer;
    }
    return this.ask("git", { op, path, ...extra });
  }

  async inbox(took: string[] = []): Promise<Arrival[]> {
    try {
      // Background: the 1 Hz poll must never sit in front of a compile.
      //
      // `took` is the ids this client actually put in the document since it last
      // asked. The engine keeps an arrival until it is named here, so a response
      // lost between the two — a reload landing between the POST and the parse,
      // a wasm worker killed by the compile timeout mid-poll — costs a repeat
      // rather than the source. See `post.rs::drain`.
      return await this.ask("inbox", { took }, { background: true });
    } catch {
      // The editor polls this every second; a build with no Girsa half, or a
      // server that went away, is a thing to stop asking about quietly rather
      // than to shout about in the console.
      return [];
    }
  }

  // The request bodies are the HTTP contract's, because there is one contract:
  // these used to be Tauri-shaped argument lists, which is how the desktop build
  // came to have a `ksav_search_in_girsa` command that the server answers as one
  // flag on `/mekoros`.
  async mekoros(phrase: string, except?: string): Promise<Mekoros> {
    return this.ask("mekoros", { phrase, except: except ?? null });
  }

  /** The same service, asked to open Girsa's search instead of answering. */
  async searchInGirsa(phrase: string): Promise<void> {
    await this.ask("mekoros", { phrase, search: true });
  }

  async linkify(text: string): Promise<string> {
    const out = await this.ask<Linkified & Refusable>("linkify", { text });
    if (out.error) throw new Error(out.error);
    return out.text ?? text;
  }

  async refresh(markup: string, style?: string, nikud?: boolean): Promise<Refreshing> {
    const out = await this.ask<Partial<RefreshResult> & Refusable>("refresh", {
      markup,
      // Absent, not null: Girsa reads absence as *the reader's own setting*,
      // and a `null` that deserialized to `Some(None)` on the other side would
      // be this application overriding a preference it never asked about.
      ...(style === undefined ? {} : { style }),
      ...(nikud === undefined ? {} : { nikud }),
    });
    if (out.error) throw new Error(out.error);
    // `moved` absent is *this Girsa does not report it*, which is not the same
    // as *nothing moved* — both come out as an empty list here and neither
    // rewrites anything, which is the safe reading of the two.
    return {
      quotes: out.quotes ?? [],
      moved: out.moved ?? [],
      retargeted: out.retargeted ?? null,
    };
  }

  async savedHere(path: string, name?: string, forget?: boolean): Promise<boolean> {
    const out = await this.ask<Partial<Told> & Refusable>("saved-here", {
      path,
      ...(name === undefined ? {} : { name }),
      ...(forget ? { forget: true } : {}),
    });
    if (out.error) throw new Error(out.error);
    return out.told ?? false;
  }

  async clipboardSource(): Promise<string | null> {
    // No `error` branch, deliberately: every way this can go wrong — no
    // clipboard on the machine, bytes that are not UTF-8, a build without the
    // loopback — has the same right answer, which is *there is no packet, paste
    // as text*. Turning any of them into a thrown error would make a perfectly
    // ordinary paste report a failure.
    const out = await this.ask<Partial<ClipboardSource> & Refusable>("clipboard-source", {});
    // A packet that arrived and could not be read is **not** silence. A schema
    // mismatch carries both version numbers, and turning it into a plain-text
    // paste is exactly what the schema version exists to prevent.
    if (out.error) throw new Error(out.error);
    return out.markup ?? null;
  }
}


export class HttpBackend extends ServiceClient implements Backend, Sources {
  readonly kind = "server";
  private cache = new CompileCache();
  constructor(private base = "") {
    super();
  }

  /**
   * Reach a service. The path **and the method** are the registry's.
   *
   * They were not. The path came from `SERVICE_PATH` and the verb came from
   * which of two private helpers a call site picked — `ask` was hard-coded GET,
   * `send` was hard-coded POST — so half of one fact lived in the registry and
   * the other half lived in a naming convention.
   *
   * `/inbox` is what that cost. It moved to POST in the engine for a stated
   * reason (`services.rs:148` — as a GET it was drainable by
   * `<img src="http://localhost:7878/inbox">`, which sends no `Origin`, so no
   * CORS check could have caught it), this file went on GETting it, the server
   * answered 404, and `inbox()` catches a failed poll on purpose because a
   * server that went away should not shout. So the Girsa handoff was dead, on
   * both sides working, and nothing said a word. Found by the first run of
   * `.github/scripts/acceptance.mjs`, in the console, where it had been printing
   * once a second the whole time.
   */
  private fetchService(service: ServiceName, input: string, signal?: AbortSignal): Promise<Response> {
    const def = SERVICE[service];
    const url = this.base + def.path;
    if (def.method === "GET") return fetch(url, { signal });
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: input || "{}",
      signal,
    });
  }

  protected async call(service: ServiceName, input = ""): Promise<string> {
    const res = await this.fetchService(service, input);
    // A refusal is an error here rather than a parsed empty answer, which is
    // what lets `inbox()` above swallow one deliberately and everything else
    // report it.
    if (!res.ok) throw new Error(`${service} ${res.status}`);
    return res.text();
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS, opts: CompileOpts = {}): Promise<CompileResult> {
    return this.cache.compile(async (extra) => {
      const res = await this.fetchService("compile", JSON.stringify({ body, ...cfg, ...extra }), opts.signal);
      if (!res.ok) throw new Error(`compile ${res.status}`);
      return res.json();
    }, assets);
  }

  async jump(body: string, cfg: DocConfig, at: PagePoint, assets = NO_ASSETS): Promise<BodySpot | null> {
    try {
      return readSpot(await this.ask("jump", { body, ...cfg, ...assets, ...at }));
    } catch {
      return null;
    }
  }

  async reveal(body: string, cfg: DocConfig, at: BodySpot, assets = NO_ASSETS): Promise<PagePoint[]> {
    try {
      return readPoints(await this.ask("reveal", { body, ...cfg, ...assets, ...at }));
    } catch {
      return [];
    }
  }
}


/**
 * Runs the real Typst engine entirely in the browser via WebAssembly — in a
 * worker, so a compile does not freeze the tab.
 *
 * This used to call `ksav_compile` straight from the page. A compile is 0.4–2.9
 * s of CPU-bound layout and the editor fires one on every pause in typing, so
 * the "no server needed" build spent those seconds with no scrolling, no
 * typing and no caret. wasm-bindgen cannot yield mid-compile; the work has to
 * happen on another thread.
 */
/** Wall-clock ceiling for a client-side compile, mirroring the server's. */
const COMPILE_TIMEOUT_MS = 20_000;

const COMPILE_TIMEOUT_MESSAGE =
  "ההידור ארך יותר מדי והופסק — לולאה או חזרה עם מספר גדול מאוד עלולה לגרום לכך; " +
  "בדקו את הגבולות של #עבור/#כלעוד · compilation timed out and was stopped — a loop or " +
  "repetition with a very large count can cause this; check any #for/#while bounds";

/** A compile result carrying a single error diagnostic — the shape the engine
 *  returns on failure, so a client-side timeout reads identically to a real one. */
function errorResult(message: string): CompileResult {
  return { ok: false, pages_svg: [], pdf_base64: null, typst_source: "", diagnostics: [{ severity: "error", message }] };
}

interface Pending {
  resolve: (s: string) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class WasmBackend extends ServiceClient implements Backend {
  readonly kind = "wasm";
  private worker: Worker | null = null;
  private booting: Promise<Worker> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private cache = new CompileCache();
  // The two-lane queue. `ksav_call` is synchronous wasm, so the worker's message
  // queue *is* the serialization point for every service — compile, spell, jump,
  // reveal, inbox. FIFO alone put a background layout or the 1 Hz inbox poll in
  // front of the compile the writer was waiting for. So a background job is held
  // here whenever any foreground job is outstanding, and released only when the
  // foreground lane drains.
  private foregroundPending = 0;
  private bgQueue: Array<() => void> = [];

  private drainBackground() {
    const waiting = this.bgQueue;
    this.bgQueue = [];
    for (const go of waiting) go();
  }

  private ensure(): Promise<Worker> {
    if (this.worker) return Promise.resolve(this.worker);
    if (!this.booting) {
      this.booting = this.spawn();
      // A failed spawn must not be remembered as a permanent verdict.
      this.booting.catch(() => {
        this.booting = null;
      });
    }
    return this.booting;
  }

  private async spawn(): Promise<Worker> {
    // `__WASM__` is the literal `false` in the default build, so this throw is
    // unconditional there and everything after it is dead code the bundler
    // removes — taking the worker chunk and the 28 MB module with it. That only
    // works because the `new Worker(new URL(…))` lives behind a dynamic import:
    // written inline it is a *static* construct the bundler resolves before it
    // ever evaluates this branch. See `wasm-worker-host.ts`.
    if (!__WASM__) throw new Error("wasm backend not built");
    const { createEngineWorker } = await import("@wasm-worker-host");
    const w = createEngineWorker();
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; output?: string; error?: string }>) => {
      const { id, ok, output, error } = e.data;
      const slot = this.pending.get(id);
      if (!slot) return;
      this.pending.delete(id);
      if (slot.timer) clearTimeout(slot.timer);
      if (ok) slot.resolve(output ?? "");
      else slot.reject(new Error(error ?? "engine error"));
    };
    // A worker that dies takes every call in flight with it; failing them is the
    // only way the editor learns that rather than waiting forever.
    w.onerror = (e) => this.failAll(new Error(e.message || "engine worker failed"));
    this.worker = w;
    return w;
  }

  private failAll(err: Error) {
    for (const slot of this.pending.values()) {
      if (slot.timer) clearTimeout(slot.timer);
      slot.reject(err);
    }
    this.pending.clear();
    // Release anything held in the background lane. A rejected foreground call
    // unwinds its own `finally` and would normally drain this, but a worker
    // death clears the lane's bookkeeping out from under it, so do it here too —
    // otherwise a queued background call awaits a `go()` that never comes.
    this.foregroundPending = 0;
    this.drainBackground();
    this.worker?.terminate();
    this.worker = null;
    this.booting = null;
    // The terminated worker took its asset cache with it, so nothing is confirmed
    // cached anymore — the next compile must send bytes, not just hashes.
    this.cache.reset();
  }

  /**
   * One call to the engine worker, by service name.
   *
   * `name` was a `string`, which is how `sefarim` came to be called on a worker
   * that had never been told about it: the lookup on the other side produced
   * `undefined`, the call threw, the caller swallowed it, and citation
   * autocomplete was dead in this build with nothing anywhere reporting it.
   * `ServiceName` is generated from the engine's registry, so the same mistake
   * is now a compile error on this line.
   */
  protected async call(name: ServiceName, input = "", opts: CallOpts = {}): Promise<string> {
    const { timeoutMs, background } = opts;
    // Hold a background job while any foreground job is in flight, and let the
    // foreground lane release it when it drains. A foreground job never waits.
    if (background && this.foregroundPending > 0) {
      await new Promise<void>((go) => this.bgQueue.push(go));
    }
    if (!background) this.foregroundPending++;
    try {
      return await this.post(name, input, timeoutMs);
    } finally {
      // Clamped, because `failAll` may have reset this counter while this
      // `finally` was still owed a decrement.
      //
      // It did, and permanently: the compile timeout and `w.onerror` both zero
      // `foregroundPending` while the outstanding calls are still unwinding, so
      // each of them then decremented from zero. The counter went negative and
      // never came back — `foregroundPending > 0` false forever, so nothing was
      // ever held; `--this.foregroundPending === 0` false forever, so the lane
      // was never drained from this side either. One worker death and the
      // browser build was back to plain FIFO, which is precisely what
      // `AUDIT-perf-and-blocking.md` §B1 was written to fix: *"a background
      // layout or the 1 Hz inbox poll in front of the compile the writer was
      // waiting for"*.
      //
      // It came back silently, and at the worst moment — a worker dies because a
      // document ran away, which is when the next compile matters most.
      if (!background) {
        this.foregroundPending = Math.max(0, this.foregroundPending - 1);
        if (this.foregroundPending === 0) this.drainBackground();
      }
    }
  }

  private async post(name: ServiceName, input: string, timeoutMs?: number): Promise<string> {
    const w = await this.ensure();
    const id = this.nextId++;
    return new Promise<string>((resolve, reject) => {
      const slot: Pending = { resolve, reject };
      if (timeoutMs) {
        slot.timer = setTimeout(() => {
          if (!this.pending.has(id)) return;
          // Typst cannot be interrupted mid-compile, but a Worker can be killed
          // outright. A runaway (a `#for` with a wrong bound) would otherwise pin
          // the one engine worker and queue every later compile and spell check
          // behind it forever, finishing the tab until reload. Terminating the
          // worker ends the runaway and lets the next call boot a fresh one.
          this.failAll(new Error("timeout"));
        }, timeoutMs);
      }
      this.pending.set(id, slot);
      w.postMessage({ id, call: name, input });
    });
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS, opts: CompileOpts = {}): Promise<CompileResult> {
    try {
      return await this.cache.compile(
        async (extra) =>
          JSON.parse(
            await this.call("compile", JSON.stringify({ body, ...cfg, ...extra }), {
              timeoutMs: COMPILE_TIMEOUT_MS,
              background: opts.background,
            }),
          ) as CompileResult,
        assets,
      );
    } catch (e) {
      // A killed or crashed worker surfaces as an ordinary compile result with a
      // diagnostic — the same shape the server returns — so the status bar shows
      // it rather than the editor hanging on an unresolved promise. The throw
      // reaches here without the cache confirming any hashes, and failAll has
      // already reset it, so the respawned worker starts from a clean slate.
      return errorResult(
        e instanceof Error && e.message === "timeout"
          ? COMPILE_TIMEOUT_MESSAGE
          : `מנוע ההידור נעצר · the compile engine stopped${e instanceof Error ? `: ${e.message}` : ""}`,
      );
    }
  }
  /** No timeout: this one cannot run away. It lays nothing out — it is the
   *  `format!` a compile does before the layout starts. */
  /** Bounded by the same timeout a compile gets, because it *is* a compile: a
   *  runaway document must not pin the one engine worker just because somebody
   *  clicked on it. A killed worker surfaces here as "no answer". */
  async jump(body: string, cfg: DocConfig, at: PagePoint, assets = NO_ASSETS): Promise<BodySpot | null> {
    try {
      return readSpot(
        JSON.parse(
          await this.call("jump", JSON.stringify({ body, ...cfg, ...assets, ...at }), { timeoutMs: COMPILE_TIMEOUT_MS }),
        ),
      );
    } catch {
      return null;
    }
  }

  async reveal(body: string, cfg: DocConfig, at: BodySpot, assets = NO_ASSETS): Promise<PagePoint[]> {
    try {
      return readPoints(
        JSON.parse(
          await this.call("reveal", JSON.stringify({ body, ...cfg, ...assets, ...at }), { timeoutMs: COMPILE_TIMEOUT_MS }),
        ),
      );
    } catch {
      return [];
    }
  }
}

/** Runs the engine in-process inside the Tauri desktop app (no HTTP). */
export class TauriBackend extends ServiceClient implements Backend, Sources {
  readonly kind = "desktop";
  private cache = new CompileCache();
  private invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<string>) | null = null;

  private async inv() {
    if (!this.invoke) {
      const core = await import("@tauri-apps/api/core");
      this.invoke = core.invoke as never;
    }
    return this.invoke!;
  }

  /**
   * One call to the engine, by service name — the same name the HTTP build puts
   * in a URL and the browser build passes to the wasm module.
   *
   * There were thirteen `ksav_*` commands here, each of which also had to be
   * listed a second time in the shell's `generate_handler!`, where forgetting it
   * is a runtime rejection rather than a compile error. There is one now, and
   * `ServiceName` is generated from the registry it dispatches through.
   */
  protected async call(service: ServiceName, input = ""): Promise<string> {
    return (await this.inv())("ksav_call", { name: service, input });
  }
  /**
   * The writer's dictionary as a file, and how to write it back (B29).
   *
   * The desktop app is the half of B29 that could be fixed: a browser cannot read
   * a path, so *one file both read* is not a thing a sandbox permits. What it can
   * do is stop the list living inside one browser profile — where it was invisible
   * to this app and gone the day that profile was cleared.
   */
  async dictionary(): Promise<{ text: string; write: (text: string) => void; where: string }> {
    const invoke = await this.inv();
    const [text, where] = await Promise.all([
      invoke("ksav_dictionary_read"),
      invoke("ksav_dictionary_where"),
    ]);
    return {
      text,
      where,
      // Fire and forget, and that is deliberate: adding a word from the squiggle
      // menu must not wait on a disk, and a write that fails has already been
      // kept in memory — so the cost is this session's additions, reported once
      // on the terminal, rather than a modal in the middle of writing.
      write: (next: string) => {
        void invoke("ksav_dictionary_write", { contents: next }).catch((e: unknown) => {
          console.error("could not write the dictionary:", e);
        });
      },
    };
  }

  async compile(body: string, cfg: DocConfig, assets = NO_ASSETS): Promise<CompileResult> {
    const run = this.cache.compile(
      async (extra) =>
        JSON.parse(await this.call("compile", JSON.stringify({ body, ...cfg, ...extra }))) as CompileResult,
      assets,
    );
    // Typst cannot be interrupted, and the in-process compile runs off the UI
    // thread, so a runaway `#for` leaves the window alive but the writer waiting
    // with nothing said. A deadline on this side unblocks the editor and shows
    // why; the abandoned compile finishes on tokio's blocking pool, which is
    // large enough that one lost thread does not wedge a single-user desktop app.
    // And when the deadline wins, the abandoned compile is *nobody's*. Nothing
    // is attached to `run`, so a later rejection — a Tauri `invoke` that fails,
    // a JSON parse of a truncated answer — is an unhandled promise rejection.
    // `crash.install` listens for exactly that and puts the **full-screen crash
    // panel** over the application: on the desktop build, a compile that
    // overruns twenty seconds and then fails told the writer "Ksav has crashed",
    // over an application that had not, in the middle of a document that was
    // fine. Abandoning a promise means saying so.
    void run.catch(() => {});
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<CompileResult>((resolve) => {
      timer = setTimeout(() => resolve(errorResult(COMPILE_TIMEOUT_MESSAGE)), COMPILE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([run, deadline]);
    } finally {
      clearTimeout(timer!);
    }
  }
  async jump(body: string, cfg: DocConfig, at: PagePoint, assets = NO_ASSETS): Promise<BodySpot | null> {
    try {
      return readSpot(await this.ask("jump", { body, ...cfg, ...assets, ...at }));
    } catch {
      return null;
    }
  }

  async reveal(body: string, cfg: DocConfig, at: BodySpot, assets = NO_ASSETS): Promise<PagePoint[]> {
    try {
      return readPoints(await this.ask("reveal", { body, ...cfg, ...assets, ...at }));
    } catch {
      return [];
    }
  }
}

/**
 * Pick a backend:
 *   - Tauri desktop  → in-process engine (no HTTP)
 *   - server reachable → HTTP (fast, tiny download)
 *   - otherwise      → in-browser wasm engine (works with no server)
 */
export async function createBackend(): Promise<Backend & Partial<Sources>> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return new TauriBackend();
  }
  try {
    // Any service would do as a knock; the command registry is the cheapest.
    const res = await fetch(SERVICE_PATH.commands, { signal: AbortSignal.timeout(800) });
    if (res.ok) return new HttpBackend();
  } catch {
    /* no server — fall through to wasm if this build includes it */
  }
  if (__WASM__) return new WasmBackend();
  return new HttpBackend();
}

// Which commands open a note body — asked once, answered once.
//
// # Why this file exists
//
// Four modules kept their own copy of this list: `notes.ts` (how deep am I),
// `deferred.ts` (may I exile this body), `ksav-lang.ts` (how do I paint this),
// `apparatus.ts` (does this collector need a dump call). Three of them listed
// the English aliases and all seven tiers. `notes.ts` — the only one on the
// **write** path — listed neither, and had not since before the English wave.
//
// What that cost, in an English document:
//
//   - `notesIn` found **no notes at all**, so the notes pane, its jump list and
//     its "hang another note off this one" action were empty on a document full
//     of `#fnote[…]`.
//   - `noteDepthAt` answered 0 inside a note, so `⁑` (the toolbar, Ctrl+Shift+N,
//     the Insert item) wrote tier א where tier ב was meant — a note *beside* the
//     note the writer was standing in, not under it.
//
// Nothing failed, nothing was logged, and 2,580 tests passed: every one of them
// asked the question in Hebrew. This is the same family as commit abc3dc0 (the
// two panels that wrote Hebrew into English documents) arriving through a
// different door — a hand-maintained array that only one language ever walked.
//
// # Why it is not derived from the command registry
//
// The obvious move is to delete the list and read `category: "footnote"` off the
// registry the app already fetches at boot. It does not survive contact:
//
//   - The category **over**-includes. Nine of its 29 members open nothing —
//     `#הגדרות_הערות`, `#הערות_מדורגות`, `#הערות_בסוף`, `#גופי_הערות` and the
//     other config/render/region calls. Counting a caret inside
//     `#גופי_הערות[…]` as note depth would make every deferred body tier ב.
//   - It **under**-includes. `#מראה_מקום`, `#הערת_גיליון`, `#הערת_ימין` and
//     `#הערת_שמאל` all open note bodies and are filed under `"torah"`, because
//     the category is what the palette groups by, not what the parser needs.
//   - It is **missing tiers ד–ז** outright. The prelude defines `#הערה_ד` …
//     `#הערה_ז` and both band families to the same depth; the registry stops at
//     ג on purpose, because a chooser card with seven tiers on it is unreadable.
//     Deriving from the registry would silently drop four tiers per family.
//
// `category` is a grouping for a pointer, not a classification for a parser.
// So the list stays hand-written — but there is now exactly one of it, it is
// generated from the family tables rather than typed out seven times, and
// `notecommands.test.mjs` fences it against the prelude and the registry in
// both directions.

/** The tier letters, in order. The prelude defines all seven for each family. */
export const TIERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז"] as const;

/**
 * One tiered family, in both languages: the seven numbered commands and the
 * explicit-tier form (`#מדור_בדרגה(4)[…]` / `#band(4)[…]`).
 *
 * Written as a function so that adding tier ח is one edit to `TIERS` and not
 * twenty-four string literals in four files, which is how ד–ז came to exist in
 * three lists and not the fourth.
 */
function family(he: string, en: string, heAny: string, enAny: string): string[] {
  return [
    ...TIERS.map((t) => `${he}_${t}`),
    ...TIERS.map((_, i) => `${en}${i + 1}`),
    heAny,
    enAny,
  ];
}

/** `#הערה_א…ז`, `#tier1…7`, `#הערה_בדרגה`, `#tier` — one page-foot block. */
export const TIER_FAMILY = family("הערה", "tier", "הערה_בדרגה", "tier");
/** `#מדור_א…ז`, `#band1…7` — collected and dumped by `#הערות_מדורגות`. */
export const BAND_FAMILY = family("מדור", "band", "מדור_בדרגה", "band");
/** `#מדף_א…ז`, `#pageband1…7` — the same, at the foot of each page. */
export const PAGEBAND_FAMILY = family("מדף", "pageband", "מדף_בדרגה", "pageband");

/**
 * Every command whose body is note prose.
 *
 * The membership test is narrow and worth stating, because three of the four
 * callers depend on exactly it: **the call takes a note's text as its last
 * positional argument**. That is what lets `deferred.ts` swap any of them for a
 * `#הערה_בשם` marker, what lets `notes.ts` count a caret as being inside a note,
 * and what makes each one a row in the notes pane.
 *
 * Deliberately absent, each for its own reason:
 *
 *   - `#הערה_בשם` — a *marker*; its prose is elsewhere. `deferred.ts` handles it.
 *   - `#גוף_הערה` — a body, but keyed by name and never at the caret's depth.
 *   - `#גופי_הערות` — the region the bodies are filed in, not a note.
 *   - `#הערת_עורך` — an editorial comment. It paints like a note (`ksav-lang`
 *     lists it for that reason) but it is not part of the apparatus, and a note
 *     written inside one is still a tier-א note.
 */
export const NOTE_BODY_COMMANDS: readonly string[] = [
  "הערה", "fnote",
  "הערה_על_הערה", "subnote",
  ...TIER_FAMILY,
  ...BAND_FAMILY,
  ...PAGEBAND_FAMILY,
  "הערתסיום", "endnote",
  "הערה_זרם", "stream_note",
  "הערת_תוכן", "contentnote",
  "הערת_מקור", "sourcenote_stream",
  "הערת_גיליון", "sidenote",
  "הערת_ימין", "noteright",
  "הערת_שמאל", "noteleft",
  "מראה_מקום", "sourcenote",
];

/** The same set, for the hot paths — `notesIn` asks this per call. */
export const NOTE_BODY_SET: ReadonlySet<string> = new Set(NOTE_BODY_COMMANDS);

/** Is this command's body note prose? */
export function opensNoteBody(command: string): boolean {
  return NOTE_BODY_SET.has(command);
}

// ------------------------------------------------- the deferred spelling
//
// The three commands above are absent from `NOTE_BODY_COMMANDS` for reasons
// that are correct — none of them takes note prose as its last positional
// argument — and that absence is not the same thing as "not a note". A
// deferred note is one note written in two places, and every surface that
// asks "what notes are in this document" has to know both halves or it
// answers zero on a document full of them.
//
// The names lived in `deferred.ts` (the editing model) and again in
// `ksav-lang.ts` (prose mode), which is the third copy of a list and exactly
// the arrangement the head of this file was written about. There is one now,
// and `notecommands.test.mjs` checks it against the prelude.

/** `#הערה_בשם(…)` — a marker whose prose is defined elsewhere. */
export const DEFER_REF_COMMANDS: readonly string[] = ["הערה_בשם", "note_named"];
/** `#גוף_הערה(שם)[…]` — the prose of a deferred note. */
export const DEFER_BODY_COMMANDS: readonly string[] = ["גוף_הערה", "note_body"];
/** `#גופי_הערות[…]` — the optional region the bodies are filed in. */
export const DEFER_REGION_COMMANDS: readonly string[] = ["גופי_הערות", "note_bodies"];

/**
 * The layout a bare `#הערה_בשם("א")` prints as — the prelude's `סוג` default.
 *
 * A deferred note with no `סוג` is an ordinary page-foot footnote, which is
 * what makes `#הערה` the one command a marker never has to name. Per language,
 * because `#note_named("1")` is a `#fnote` and writing `#הערה` back into an
 * English document when it is recalled is the editor overruling the writer.
 */
export const DEFAULT_NOTE_KIND = { he: "הערה", en: "fnote" } as const;

/**
 * The tiered-note command for a tier, in the language the document is written
 * in.
 *
 * An English document gets `#tier2`, not `#הערה_ב`. Both compile — the prelude
 * aliases them — but a writer who chose an English document and then found
 * Hebrew appearing in it from a toolbar button is watching the editor overrule
 * them, which is the complaint commit abc3dc0 answered for the table and styles
 * panels. `tier` is clamped to the family's depth by the caller.
 *
 * **Tier 1 is `#הערה`,** not `#הערה_א`, and that is the fix for the thing that
 * made this whole mechanism feel wrong to use. `ksav.typ` defines
 * `#let הערה(body) = הערה_בדרגה(1, body)` — the two are one function — and it
 * does so *precisely* so that a sub-note hangs off the note the writer already
 * wrote. Writing the alias anyway put a second name for the footnote into the
 * document, and a second entry for it in the Insert menu, which together say the
 * opposite: that a note has to be converted to tier א before anything can hang
 * off it. Nothing has required that since the engine adopted the plain note.
 */
export function tierCommand(tier: number, lang: "he" | "en" = "he"): string {
  const i = Math.min(Math.max(tier, 1), TIERS.length) - 1;
  if (i === 0) return DEFAULT_NOTE_KIND[lang];
  return lang === "en" ? `tier${i + 1}` : `הערה_${TIERS[i]}`;
}

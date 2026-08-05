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

/** The same set, for the hot paths — `notesIn` asks this per bracket. */
export const NOTE_BODY_SET: ReadonlySet<string> = new Set(NOTE_BODY_COMMANDS);

/** Is this command's body note prose? */
export function opensNoteBody(command: string): boolean {
  return NOTE_BODY_SET.has(command);
}

/**
 * The tiered-note command for a tier, in the language the document is written
 * in.
 *
 * An English document gets `#tier2`, not `#הערה_ב`. Both compile — the prelude
 * aliases them — but a writer who chose an English document and then found
 * Hebrew appearing in it from a toolbar button is watching the editor overrule
 * them, which is the complaint commit abc3dc0 answered for the table and styles
 * panels. `tier` is clamped to the family's depth by the caller.
 */
export function tierCommand(tier: number, lang: "he" | "en" = "he"): string {
  const i = Math.min(Math.max(tier, 1), TIERS.length) - 1;
  return lang === "en" ? `tier${i + 1}` : `הערה_${TIERS[i]}`;
}

// What the two applications are called, in Hebrew, in one place.
//
// The sibling repository wrote this file first, and its header is the argument:
//
// > Girsa called its sibling **כסב** in six places, one of them the toolbar of
// > the first screen. `כסב` is kaf-samekh-bet: a letter-by-letter
// > transliteration of the Latin "Ksav" back into Hebrew. It is not a word. The
// > application is **כְּתָב** — kaf-tav-bet, the Hebrew word for *writing*.
//
// Girsa then wrote a test named *"nowhere in src spells the sibling כסב"*, and
// that test cannot read this tree. So `i18n.ts:405` said
//
//     "חיפוש מקורות פועל כשגרסא פתוחה לצד כסב (לא בדפדפן)"
//
// — the banned transliteration, **in the application whose own name it is**, in
// the string that tells the reader it needs Girsa. Neither repository's guard
// could see the other's `src/`, which is the whole shape of the 9 August report
// in one word.
//
// The sibling's name was spelled two ways here as well: `גִּרְסָא` pointed in
// `diagnostics.ts`, unpointed `גרסא` a dozen times in `i18n.ts`. Both are
// readable; one product should pick one, and the pointed spelling is the one
// Girsa's own wordmark uses.
//
// So: constants, not typed-out strings, so that a thirteenth site cannot spell
// either name a third way — and `test/prohibitions.test.mjs` sweeps the whole
// repository for both misspellings.

/** This application, as it spells its own name. */
export const KSAV = "כְּתָב";

/** The sibling library application, as it spells its own name. */
export const GIRSA = "גִּרְסָא";

/**
 * A name with a one-letter prefix — *to* it, *from* it, *in* it, *beside* it.
 *
 * Both names carry points on the first letter (`כְּתָב` a dagesh and a sheva,
 * `גִּרְסָא` a dagesh and a hiriq), and gluing a prefix straight onto that reads as
 * one long word rather than as a preposition and a name. A maqaf keeps the name
 * legible as a name, which is the whole reason either is pointed at all.
 *
 * The same function, spelled the same way, in `Girsa/app/src/names.ts`. Two
 * copies of four characters is the right trade here and the report says so:
 * a shared TypeScript package would have to pick one repository's registry, one
 * repository's key ownership and one repository's error vocabulary, and this is
 * the one thing in the overlap that has *not* diverged for a reason.
 */
export function withPrefix(prefix: string, name: string): string {
  return `${prefix}־${name}`;
}

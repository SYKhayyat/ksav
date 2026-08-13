// Which faces a writer can choose, and where each one came from.
//
// # The finding
//
// > *"The font dropdown is ugly. Named plainly, recorded plainly."*
//
// It was not a dropdown. It was a free-text box with a `datalist` hint and an
// unlabelled `+` beside it, which means the way to choose a font was to **type a
// family name exactly right** — and a family name is a string only the font file
// knows. Typed wrong, nothing says so: Typst falls back to a face it can find
// and the sefer is typeset in something nobody chose.
//
// The other half of the complaint is the list itself. Three names in a flat
// hint, with no way to tell that two of them ship with the application, that one
// is a monospace face for code rather than a body face for a sefer, or that the
// font the writer attached to this document last week is in there at all.
//
// # What this module is for
//
// The list, and one fact about each entry that the flat list threw away: **where
// it came from**. That is the difference between a face that will resolve on
// every machine this sefer is opened on, one that travels inside the document,
// and one that happens to be installed here — which is exactly the question a
// writer sending a kovetz to a printer needs answered, and the one the text box
// could not even be asked.
//
// The free-text route stays, because it has to: a font installed on this machine
// is real, Typst will find it, and no list the application can build knows its
// name. It is one option among the others now rather than the only way in.

/** Where a family comes from, which is what decides whether it will resolve elsewhere. */
export type FontSource =
  /** Compiled into the engine. Resolves on every machine, in every build. */
  | "bundled"
  /** Attached to this document, and travels with it. */
  | "document"
  /** Installed on this machine, named by hand. Resolves here and nowhere promised. */
  | "elsewhere";

export interface FontOption {
  name: string;
  source: FontSource;
}

/** The order the groups are offered in: surest first. */
export const SOURCES: readonly FontSource[] = ["bundled", "document", "elsewhere"];

/** A font attached to a document, as `docs.Asset` has it. */
interface Asset {
  name: string;
  kind: string;
}

/**
 * A document's font assets, named as Typst will name them.
 *
 * The family is the file's stem, which is what the engine registers it under —
 * so `FrankRuhlHofshi-Bold.otf` is offered as `FrankRuhlHofshi-Bold` and not as
 * a filename. Stated here rather than at the call site because it is the one
 * place the two spellings of one font have to agree.
 */
export function documentFonts(assets: readonly Asset[] = []): string[] {
  return assets.filter((a) => a.kind === "font").map((a) => a.name.replace(/\.[^.]+$/, ""));
}

/** Where this family comes from, as far as the application can tell. */
export function sourceOf(
  name: string,
  bundled: readonly string[],
  assets: readonly Asset[] = [],
): FontSource {
  if (bundled.includes(name)) return "bundled";
  if (documentFonts(assets).includes(name)) return "document";
  return "elsewhere";
}

/**
 * Every face the panel offers, in group order, with no duplicates.
 *
 * `current` is in the list whatever it is, which is the property that makes this
 * a `<select>` at all: a control that cannot show what is already chosen is a
 * control that silently changes it the moment somebody opens the panel. A family
 * typed by hand last week appears under *elsewhere*, named plainly, and stays
 * chosen.
 */
export function fontOptions(
  bundled: readonly string[],
  assets: readonly Asset[] = [],
  current = "",
): FontOption[] {
  const seen = new Set<string>();
  const out: FontOption[] = [];
  const add = (name: string, source: FontSource) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, source });
  };
  for (const name of bundled) add(name, "bundled");
  for (const name of documentFonts(assets)) add(name, "document");
  add(current, sourceOf(current, bundled, assets));
  return out;
}

/** The same list, split into the groups the panel draws as `<optgroup>`s. */
export function fontGroups(options: readonly FontOption[]): { source: FontSource; fonts: FontOption[] }[] {
  return SOURCES.map((source) => ({
    source,
    fonts: options.filter((f) => f.source === source),
  })).filter((g) => g.fonts.length > 0);
}

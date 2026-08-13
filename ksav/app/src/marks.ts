// The mark register, from the editor's side.
//
// A semantic mark is a command that says what a piece of text *is* rather than
// only how it looks: `#ציון` is a reference, `#דיבור_המתחיל` a lemma, `#גמרא` a
// place in Shas. The complaint that produced the whole mechanism was made about
// the second of those: *"these should be able to be collected. If not, it is just
// bold. You should be able to apply styles to the collection (and maybe exempt
// some), as well as see just these in some list somewhere."*
//
// `engine/typst/ksav.typ` answers the first two — `#רשימת_סימונים` prints a class
// with its page numbers, `#הגדרות_סימונים` styles one. This module is the third:
// *see just these in some list somewhere*, which is a question about the source
// and therefore the editor's to answer rather than the engine's. The page numbers
// belong to the print; the words and where they are belong to the file.

import { bothSpellings } from "./engine.gen";
import { scan, splitArgs } from "./spans";
import type { Group } from "./spans";

/**
 * The classes whose look a control may set.
 *
 * These are the class names the document itself uses — a class is named by its
 * own command — which is why they are Hebrew here and translated only for
 * display. `#סימן` and `#מראה_מקום` are deliberately not among them: they
 * register for the collecting and take their look from what they already are, a
 * heading and a footnote, so a second styling channel over the same text would be
 * two authorities for one fact. The prelude's `_mk_defaults` is the authority and
 * `test/enginefacts.test.mjs` reads it.
 */
export const STYLED_CLASSES = [
  "ציון",
  "גמרא",
  "דיבור_המתחיל",
  "פסוק",
  "ציון_מקור",
  "ערך",
] as const;

/**
 * Every class the register collects, in the order the marks list offers them.
 *
 * The two extra ones are the collect-only classes. They are in *this* list and
 * not the styling one because a writer looking for "every siman" or "every mareh
 * makom" is asking the question this list answers, and being unstyleable has
 * nothing to do with it.
 */
export const MARK_CLASSES: readonly string[] = [
  ...STYLED_CLASSES,
  "סימן",
  "מראה_מקום",
];

/** One mark in the document. */
export interface MarkSpan {
  /** The class, canonicalised to the Hebrew name whichever spelling was used. */
  cls: string;
  /** The command as the document spells it. */
  command: string;
  /** The `#`. */
  from: number;
  /** Past the end of the call. */
  to: number;
  /**
   * The mark's own words, as written.
   *
   * Its positional arguments, flattened — and deliberately **not** a
   * reconstruction of what `#רשימת_סימונים` prints. The printed entry is derived
   * per class in the prelude (a citation prints its sefer's canonical spelling, a
   * pasuk files under its source), and a second implementation of those rules
   * here would be a table that agrees with the prelude until one of them is
   * edited. A reader scanning this list is looking for the words they typed.
   */
  text: string;
}

/** Which Hebrew class a command name belongs to, in either spelling. */
const CLASS_OF: Record<string, string> = Object.fromEntries(
  MARK_CLASSES.flatMap((cls) => bothSpellings(cls).map((name) => [name, cls])),
);

/**
 * Every mark in the document, in reading order.
 *
 * Off the one scanner, like every other survey of the source in this app: a
 * regular expression over `#name[…]` cannot tell a command from the same letters
 * inside a string, a comment or a raw block, and this file would have been the
 * eleventh place to find that out.
 */
export function marksIn(doc: string): MarkSpan[] {
  const out: MarkSpan[] = [];
  for (const n of scan(doc).nodes) {
    if (!n.hash) continue;
    const cls = CLASS_OF[n.name];
    if (!cls) continue;
    out.push({
      cls,
      command: n.name,
      from: n.from,
      to: n.to,
      text: ownWords(doc, n),
    });
  }
  return out;
}

/**
 * A mark's own words: its positional arguments and its bracketed bodies.
 *
 * Both halves, because the same mark is written either way — `#גמרא("ברכות",
 * "ב.")` from the palette and `#גמרא[ברכות][ב.]` from a writer's hand are one
 * reference, and a list that showed the words for one spelling and a blank row
 * for the other would look broken on exactly the documents people type.
 *
 * Named arguments are left out on purpose: `#ציון(צבע: red)[רמב״ם]` is one mark
 * whose words are רמב״ם, and a row reading `red רמב״ם` would be showing the
 * writer their own styling instead of their own text. `מקום:` on a citation is
 * the one that costs something — the daf is worth seeing — and it is still one
 * click away in the document, which is what the row is for.
 */
function ownWords(doc: string, n: { args: Group | null; bodies: Group[] }): string {
  const parts: string[] = [];
  if (n.args) {
    for (const g of splitArgs(doc, n.args.from, n.args.to)) {
      const raw = doc.slice(g.from, g.to).trim();
      if (!raw) continue;
      if (/^[\p{L}\p{N}_]+\s*:/u.test(raw)) continue;
      parts.push(unquote(raw));
    }
  }
  for (const b of n.bodies) parts.push(doc.slice(b.from, b.to));
  return parts.join(" ").replace(/\s+/gu, " ").trim();
}

/** A string literal down to what is inside it; anything else as written. */
function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return raw;
}

/** Every class present in the document, in `MARK_CLASSES` order. */
export function classesIn(doc: string): string[] {
  const seen = new Set(marksIn(doc).map((m) => m.cls));
  return MARK_CLASSES.filter((c) => seen.has(c));
}

/**
 * Which toggles are on where the caret stands (#233, step 9; §8).
 *
 * B/I/U and every other wrapping toggle carry `aria-pressed` from the caret's
 * context, and the font and size boxes show the caret's values. Until the
 * engine reports the styles in force (#118), that context is read from the
 * markup: the `#name(args)[ … ]` bodies the caret sits inside.
 *
 * The scan is `spans.ts`'s and not another one. This module started with a
 * private bracket walk of its own, which is the eleventh private matcher the
 * finding at the top of `spans.ts` exists to make unrepresentable — and it was
 * the one that paid for it twice: it walked back to the top of the document on
 * every caret move, and it could not tell `#סימון(x: "…")[א]` from a caret
 * sitting *inside the argument list*, where nothing is wrapped at all.
 * `stackAt` answers both, from the scan every other surface is already reading,
 * and a call counts only when the caret is inside one of its bodies.
 */

import { type Scan, stackAt } from "./spans";

/** One wrapper the caret is inside: its name as written, and its argument text. */
export interface Wrapper {
  name: string;
  args: string;
}

/**
 * The `#name(args)[…]` bodies holding `pos`, innermost first.
 *
 * A caret inside the argument list is not inside the body: `#הדגשה[…]` pressed
 * while the writer is choosing a colour is a state the document does not have.
 */
export function wrappersIn(scan: Scan, pos: number): Wrapper[] {
  const out: Wrapper[] = [];
  for (const n of stackAt(scan, pos)) {
    if (!n.bodies.some((b) => pos >= b.from && pos <= b.to)) continue;
    out.push({ name: n.name, args: n.args ? scan.text.slice(n.args.from, n.args.to) : "" });
  }
  // `stackAt` is outermost first; the surfaces want the innermost answer, and
  // the boxes below want the nearest `#גופן_שונה`, which is the innermost one.
  return out.reverse();
}

/** The first quoted string in an argument list: `"David Libre"` → `David Libre`. */
export function quotedArg(args: string): string | null {
  const m = /"((?:[^"\\]|\\.)*)"/.exec(args);
  return m ? m[1].replace(/\\(.)/g, "$1") : null;
}

/** A length in points from an argument list: `14pt` → 14. Other units are not a size box's to show. */
export function pointsArg(args: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*pt\b/.exec(args);
  return m ? Number(m[1]) : null;
}

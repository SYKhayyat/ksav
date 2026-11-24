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
 * sitting *inside the argument list*, where nothing is wrapped at all. The
 * frames answer both, from the scan every other surface is already reading: a
 * caret counts as inside a call only when it is inside one of its bodies, and a
 * half-typed `#הדגשה[של` — the state a document spends half its life in — is a
 * body already.
 */

import { type Scan, framesAt, nodeAt } from "./spans";

/** One wrapper the caret is inside: its name as written, and its argument text. */
export interface Wrapper {
  name: string;
  args: string;
}

/**
 * The `#name(args)[…]` bodies holding `pos`, innermost first.
 *
 * `(` and `{` are code — a caret choosing a highlight colour is not wrapped in
 * anything — and a bare `[…]` belongs to no command, so both are skipped.
 */
export function wrappersIn(scan: Scan, pos: number): Wrapper[] {
  const out: Wrapper[] = [];
  for (const f of framesAt(scan, pos)) {
    if (f.ctx !== "content" || !f.name) continue;
    // The call that opened this bracket is the innermost one at the character
    // before it, which is its last name character or its `)`.
    const owner = nodeAt(scan, f.open - 1);
    const args = owner && owner.name === f.name && owner.args ? scan.text.slice(owner.args.from, owner.args.to) : "";
    out.push({ name: f.name, args });
  }
  // `framesAt` is outermost first; the surfaces want the innermost answer, and
  // the boxes below want the nearest `גופן_שונה`, which is the innermost one.
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

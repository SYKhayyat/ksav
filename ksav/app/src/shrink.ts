// How a ribbon too wide for its window gets narrower (#233, `docs/ui-architecture.md` §7).
//
// Pure: what a group can give up, and in which order the groups give it. The
// DOM loop in `shelltabs.ts` applies one step at a time while the panel
// overflows and measures between steps, never inside one; this file never
// measures anything, which is what lets a test hold the order.
//
// Each group has four levels:
//
//   0  full: as §5 draws it
//   1  every large face is small
//   2  every face with an icon is the icon alone
//   3  the whole group is one button, its icon and name, that opens the group
//
// A level that would change nothing in a group is not a step for it — a group
// with no large face has no level 1 to go through — so every step the loop
// takes makes the row narrower.
//
// The order: the groups that shrink last are the ones that hold B/I/U, the
// footnote, siman and seif — the buttons a writer of sefarim presses every
// minute. The rest go first, the last in the row first, every one of them
// through level 1 before any goes to level 2: a row of slightly smaller groups
// reads better than one group folded to a button beside a row of full ones.

import type { TabGroup } from "./placement";

/** The commands whose groups shrink last: what a writer of sefarim presses every minute. */
export const SHRINK_LAST: readonly string[] = ["הדגשה", "נטוי", "קו_תחתון", "הערה", "סימן", "סעיף"];

/** How far a group has shrunk. */
export type ShrinkLevel = 0 | 1 | 2 | 3;

/** What the planner needs to know about a group. */
export interface ShrinkGroup {
  /** It has a large face, so level 1 changes it. */
  large: boolean;
  /** It has a face with an icon still drawn with its words, so level 2 changes it. */
  labelled: boolean;
  /** It holds what shrinks last. */
  last: boolean;
}

/** What a group can give up: read off its face, never measured. */
export function shrinkInfo(g: TabGroup): ShrinkGroup {
  const faces = g.face.filter((a) => a.kind !== "style");
  return {
    large: faces.some((a) => a.place.size === "large"),
    labelled: faces.some((a) => a.place.icon !== undefined && a.place.size !== "icon"),
    last: g.face.some((a) => a.command !== undefined && SHRINK_LAST.includes(a.command.he)),
  };
}

/** Every step in order: which group (by index in the row) goes to which level. */
export function shrinkSteps(groups: readonly ShrinkGroup[], from: ShrinkLevel = 0): (readonly [number, ShrinkLevel])[] {
  const rowEndFirst = groups.map((_, i) => i).reverse();
  const steps: (readonly [number, ShrinkLevel])[] = [];
  for (const last of [false, true]) {
    for (const level of [1, 2, 3] as const) {
      if (level <= from) continue;
      for (const i of rowEndFirst) {
        const g = groups[i];
        if (g.last !== last) continue;
        if (level === 1 && !g.large) continue;
        if (level === 2 && !g.labelled) continue;
        steps.push([i, level]);
      }
    }
  }
  return steps;
}

/** Each group's level after `step` steps, starting every group at `from`. */
export function shrinkPlan(groups: readonly ShrinkGroup[], step: number, from: ShrinkLevel = 0): ShrinkLevel[] {
  const levels = groups.map(() => from);
  for (const [i, level] of shrinkSteps(groups, from).slice(0, step)) levels[i] = level;
  return levels;
}

/**
 * Which groups the simplified ribbon sends into `⋯` when its icons do not fit,
 * in order: the same order as the shrinking — the rest before what shrinks
 * last, the row's end first.
 */
export function spillOrder(groups: readonly ShrinkGroup[]): number[] {
  const rowEndFirst = groups.map((_, i) => i).reverse();
  return [...rowEndFirst.filter((i) => !groups[i].last), ...rowEndFirst.filter((i) => groups[i].last)];
}

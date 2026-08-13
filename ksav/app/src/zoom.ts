// What a zoom is, and which surface a zoom command lands on.
//
// # The finding
//
// > *"Zoom in the source and in the preview."*
//
// Two zooms were asked for and there has only ever been one in the code.
// `settings.zoom` is read by `previewStyle` and by nothing else, so it has
// always been the *preview's* zoom wearing a name that claims the whole
// application — while the text the writer is actually typing into sat at a
// fixed 15px with no control anywhere, not in Settings, not on a key, not on a
// chip. The one surface a writing tool exists to show you was the one surface
// whose size could not be changed.
//
// # Why a module rather than two more fields
//
// Because "zoom" is three separate claims that were never written down: what
// the bounds are, what one step is, and *which surface a zoom command means*.
// Held as two numbers in `settings.ts` and a `calc()` in a stylesheet, the
// bounds live in the settings panel's `numberRow` call, the step lives nowhere
// at all, and the third question has no answer — which is how you end up with a
// Ctrl+= that always zooms the preview no matter where the writer is looking.
//
// The rule for the third one, stated once here and read by `main.ts`: **a zoom
// command belongs to the surface the writer is in.** Caret in the text → the
// source zooms. Anywhere else — a click on the page, a panel, the chrome — the
// preview does, because the preview is what a reader who is not typing is
// looking at. Both are still settable by name in the panel, so nobody has to
// know the rule to get the size they want.

/** The two things that can be zoomed. */
export type Surface = "source" | "preview";

export const SURFACES: readonly Surface[] = ["source", "preview"];

/**
 * The bounds, and one step.
 *
 * Half size to double, in tenths. The ceiling is not arbitrary: `previewStyle`
 * fits the page to the pane at up to `MAX_FIT`, and a zoom above that ceiling
 * would be a control that scrolls the page out of its own pane. The floor is
 * where Hebrew nikud stops being legible, which is the point below which a
 * smaller number is not a smaller view but a blank one.
 */
export const MIN = 0.5;
export const MAX = 2;
export const STEP = 0.1;
export const DEFAULT = 1;

/** Keep a zoom inside the bounds, and off the floating-point fuzz. */
export function clamp(z: number): number {
  if (!Number.isFinite(z)) return DEFAULT;
  return round(Math.min(MAX, Math.max(MIN, z)));
}

/**
 * One step in or out.
 *
 * Rounded to a hundredth on the way out, because 0.7 + 0.1 is 0.7999999999999999
 * in every JavaScript engine there is — and that number reaches a stylesheet as
 * `calc(15px * 0.7999999999999999)` and the settings panel as a spinner the
 * writer cannot get back to a round figure with.
 */
export function step(z: number, by: number): number {
  return clamp(round(z) + by * STEP);
}

/** How a zoom reads to a person: `120%`. */
export function percent(z: number): string {
  return `${Math.round(clamp(z) * 100)}%`;
}

function round(z: number): number {
  return Math.round(z * 100) / 100;
}

/**
 * Which settings field holds each surface's zoom.
 *
 * `preview` is the pre-existing `zoom` and stays under that name: renaming it
 * would throw away the zoom of every writer who has ever set one, since settings
 * are stored by key. The comment on the field says what it is; this table is how
 * the rest of the application never has to remember.
 */
export const FIELD_OF: Readonly<Record<Surface, "sourceZoom" | "zoom">> = {
  source: "sourceZoom",
  preview: "zoom",
};

/**
 * Which surface a zoom command means, given whether the caret is in the text.
 *
 * The one line of policy this module exists for. See the header.
 */
export function surfaceOf(caretInText: boolean): Surface {
  return caretInText ? "source" : "preview";
}

// The app's scroll policy for its own floating surfaces.
//
// The drawers, menus and lists the application floats over the document used to
// hand every wheel event straight to the WebView scroller, which answers with
// whatever delta scale the platform happened to have that day — and on the
// touchpad whose report is #120, a small gesture travelled a third of the
// Settings drawer at a time. Nothing in a 300px drawer says where a 400px
// delta came from, and the document behind scrolled along at the edges,
// because scroll chaining is the WebView's default.
//
// The cure is the industry's, both halves:
//
//   1. **Native deltas, one honest conversion.** Every delta mode is turned
//      into pixels the browser would have used — pixel deltas pass unchanged,
//      line deltas take the surface's own line height, page deltas take the
//      surface's own height — and then a *speed* the writer owns, defaulting
//      to 1: what every other desktop app does. The setting is there because
//      the platform scale is real and differs per OS (the report's whole
//      complaint), and a knob is the accepted answer to it — a hard cap is
//      not.
//   2. **`overscroll-behavior: contain` in `styles.css`** on the same
//      surfaces — the platform's own boundary for "this gesture stops here",
//      which is what keeps a drawer's over-scroll from scrolling the sefer
//      behind it.
//
import { settings } from "./settings";

// Defers: where the surfaces live and how they scroll to `styles.css` and the
// panels themselves. Refuses: touching the editor and preview panes — their
// scrolling is `panescroll`'s, `wheel` events inside them are CodeMirror's, and
// the selector list below names none of them.

/** Surfaces the policy answers for. Held as one const so the fence reads it
 * out of the same sentence the wiring uses. */
export const POLICY_SURFACES = ".drawer, .menu-list, #palette-list, #history-list, .preview-modal-box, #crash-panel";

/** The bounds of the writer's own speed, and its step: typed in the drawer,
 * so granularity is the point — a touchpad runs 1.3× fast on one machine and
 * fine on the next, and 0.75 is a real answer. Rounds the salary-office two
 * decimal places the math of pixels cannot use. */
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
export const SPEED_STEP = 0.05;

const DEFAULT_LINE_HEIGHT = 16;

/**
 * How fast one wheel event moves a surface, in surface pixels.
 *
 * `deltaMode`: 0 deltas are already pixels (a touchpad, where precision is the
 * point and nothing needs answering); 1 deltas are lines of text, and the line
 * is the surface's own (`styles.css`'s row), never the document's; 2 deltas are
 * pages, and a page of a 300px drawer is itself.
 *
 * `speed` is the writer's multiplier, 1 = native. A fraction runs slower than
 * the platform delivered, a number above it faster; that is all the complaint
 * needed and all it gets. A speed that is not usable — mistyped, empty, zero,
 * negative — is treated as the native 1 rather than as a scroll of nothing or
 * of *up*, which is the only self-healing answer a guard on a per-event hot
 * path can give.
 */
export function wheelDistance(
  deltaMode: number,
  dy: number,
  lineHeight: number,
  clientHeight: number,
  speed: number,
): number {
  const fast = Number.isFinite(speed) && speed > 0 ? speed : 1;
  let px: number;
  if (deltaMode === 1) px = dy * (lineHeight > 0 ? lineHeight : DEFAULT_LINE_HEIGHT);
  else if (deltaMode === 2) px = dy * clientHeight;
  else px = dy;
  return px * fast;
}

/**
 * Wire the policy once: one listener on the document, in the bubble phase
 * *after* any inner scroller (a list's own scroll-to) has had its say. A wheel
 * over the document itself finds no surface, does not call `preventDefault`,
 * and scrolls the document as it always did. The speed is read per event from
 * the settings, so tuning the number applies to the very next gesture, not
 * after a rebuild.
 */
export function installScrollPolicy(root: Document | HTMLElement = document): void {
  root.addEventListener(
    "wheel",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const surface = target.closest<HTMLElement>(POLICY_SURFACES);
      if (!surface) return;
      e.preventDefault();
      const computed = parseFloat(getComputedStyle(surface).lineHeight);
      surface.scrollTop = surface.scrollTop + wheelDistance(
        (e as WheelEvent).deltaMode,
        (e as WheelEvent).deltaY,
        computed > 0 ? computed : 0,
        surface.clientHeight,
        settings.scrollSpeed ?? 1,
      );
    },
    { passive: false, capture: false },
  );
}

// A link in a document, followed — out of the application, not through it.
//
// # The half of #202 this is
//
// `svgsafe.ts` decides *which* links survive into the preview: `http`, `https`,
// `mailto`, `tel`, or no scheme at all. What it cannot decide is what a click on
// one of them *does*, because that happens in the webview. Measured, before this
// existed: an `<a>` inside the rendered page was a **navigation** — the app's own
// window loaded somebody's website, and in the desktop build a `file:` link would
// have loaded a local file into a webview that carries the application's IPC
// bridge. The sanitizer's scheme list closed the dangerous half; a surviving
// `https:` link still replaced the editor with a web page, which is safer and
// still wrong.
//
// So a click is intercepted and the URL is handed to a door:
//
//   - the desktop app asks the shell to open it with the system's own browser,
//     which is what a link in a document should have done all along — the
//     writer keeps their document;
//   - the browser build opens a tab, which it was already able to do, and does
//     it deliberately here rather than by letting the webview decide.
//
// # Why `linkable` is imported rather than restated
//
// The sanitizer keeps an `href` only if its scheme is one of four, and this
// module refuses to act on anything else. Two lists would be two answers to
// *which links may exist*, and the day they disagreed the difference would be a
// link visible in the page and dead under the cursor — or, worse, the opposite.
// One rule, in `svgsafe.ts`, used by both sides.

import { linkable } from "./svgsafe";

/**
 * The `href` of the link the reader just clicked on, or `null`.
 *
 * `target` is whatever was under the pointer, which for a laid-out page is
 * usually the transparent hit-area `<rect>` beside the text rather than the
 * `<text>` itself — so the walk goes *up*, and it is bounded: it stops at the
 * page's own `<svg>`, because an `<a>` outside the clicked page is a link in a
 * different document on screen and not the one under this click.
 *
 * Structural, not `instanceof Element`: the walk is the whole of the decision
 * and `test/openlink.test.mjs` has to be able to make one out of plain objects.
 * A DOM node satisfies the shape exactly, so this costs the page nothing, and
 * it does not care which realm the event came from — an `<iframe>`'s node is not
 * `instanceof` this window's `Element` and is still a node.
 */
export interface AnchorNode {
  readonly tagName?: unknown;
  readonly parentElement?: AnchorNode | null;
  getAttribute?(name: string): string | null;
}

export function linkAt(target: unknown, root: AnchorNode | null = null): string | null {
  if (!target || typeof target !== "object") return null;
  let at = target as AnchorNode | null | undefined;
  while (at) {
    const tag = String(at.tagName ?? "").toLowerCase();
    if (tag === "a") {
      const href = at.getAttribute?.("href") ?? at.getAttribute?.("xlink:href") ?? null;
      // A link with no destination, or one the sanitizer would not have kept if
      // it had seen it, is not followed. The sanitizer has already removed those
      // attributes, so this is the belt: a page built by an older engine, or by
      // an export path that does not run `sanitizeSvg`, still cannot steer the
      // application.
      if (!href || !linkable(href)) return null;
      return href.trim();
    }
    if (at === root || tag === "svg") return null;
    at = at.parentElement;
  }
  return null;
}

/** Where a followed link goes when the application cannot open a browser. */
type Opener = (url: string) => void | Promise<void>;

/**
 * Follow a link: the system browser on the desktop, a new tab in the browser.
 *
 * **A new tab and never the same one**, in the browser build: navigating the
 * editor away loses every open document, and there is no back button in a tab
 * the application has replaced (`svgsafe.ts` sets `target="_blank"` for the same
 * reason; this is what makes that mean something).
 *
 * `window.open` is called with `noopener` so the opened page cannot reach back
 * into the editor through `window.opener`, and the returned handle is
 * deliberately not kept.
 */
export async function followLink(
  url: string,
  open: Opener = defaultOpener,
): Promise<void> {
  if (!linkable(url)) return;
  await open(url);
}

/**
 * The door, chosen by whether this build has a shell behind it.
 *
 * `__TAURI_INTERNALS__` is how `files.ts` asks the same question, and the reason
 * it is asked rather than passed in: the alternative is a `Backend` method every
 * transport has to implement, including the two that have no browser to open.
 */
async function defaultOpener(url: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const core = await import("@tauri-apps/api/core");
    await core.invoke("ksav_open_external", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

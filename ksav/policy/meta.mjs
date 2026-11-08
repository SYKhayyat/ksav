// The same policy, minus what a `<meta>` element is not allowed to say.
//
// `csp.txt` is one policy with three deliveries: a header from `ksav serve`
// (`engine/src/policy.rs`), `app.security.csp` in the desktop app
// (`src-tauri/tauri.conf.json`), and a `<meta http-equiv>` in the built HTML for
// a static host that sets no headers of its own (`vite.config.ts`).
//
// The third delivery cannot carry everything the other two can. `frame-ancestors`
// is header-only by specification — a document is not trusted to describe who may
// frame it — so a browser reading it out of a meta element ignores the directive
// and says so in the console, once per page load:
//
//     The Content Security Policy directive 'frame-ancestors' is ignored when
//     delivered via a <meta> element.
//
// It shipped that way for the whole life of the meta tag. Nothing was watching a
// console until `.github/scripts/acceptance.mjs` started reading one.
//
// This is not the file drifting into three policies again — that bug is what
// `csp.txt` and `policy.rs` exist to prevent, and the fence in
// `app/test/services.test.mjs` still holds all three to the same text. It is one
// policy, and one delivery mechanism that is documented to drop a directive. The
// dropping is done here, in the open, once, rather than by the browser, silently.
//
// `report-uri` and `sandbox` are in the same header-only class. They are not in
// the policy today; they are listed so that adding one is a decision rather than
// a surprise.

import feed from "./feed.json" with { type: "json" };

/**
 * The origin the update check calls, as data.
 *
 * #113: `app/src/update.ts` and `csp.txt`'s `connect-src` each held this origin,
 * in different files with different fences — the CSP ones prove the three copies
 * agree *with each other* and nothing proved the client's origin was among them.
 * Moving the feed therefore required editing a machine-enforced file, and moving
 * only the client killed the check silently in every packaged build.
 */
export const FEED_ORIGIN = feed.origin;

/**
 * Refuse a policy that would block the update check.
 *
 * Called by `vite.config.ts` while it builds the `<meta>` CSP, so an origin
 * changed in `feed.json` without `csp.txt` fails the **build** — the earliest
 * place this can be caught, and the one that cannot be skipped by a release.
 */
export function checkFeedInCsp(csp) {
  const connect = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("connect-src"));
  const tokens = (connect ?? "").split(/\s+/u);
  if (!tokens.includes(FEED_ORIGIN)) {
    throw new Error(
      `policy/csp.txt connect-src does not allow ${FEED_ORIGIN} (policy/feed.json), ` +
        `so the update check is blocked in every packaged build.`,
    );
  }
  return csp;
}

/** Directives a `<meta>` CSP cannot deliver, and that browsers discard. */
export const HEADER_ONLY = ["frame-ancestors", "report-uri", "sandbox"];

/**
 * The meta-deliverable part of a policy.
 *
 * Everything a header can say, minus {@link HEADER_ONLY}. A static host that
 * wants `frame-ancestors 'none'` has to send it as a header (or `X-Frame-Options`);
 * there is no way to say it from inside the document, and pretending otherwise
 * is what produced the warning.
 */
export function metaPolicy(csp) {
  return csp
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && !HEADER_ONLY.some((name) => new RegExp(`^${name}\\b`, "u").test(d)))
    .join("; ");
}

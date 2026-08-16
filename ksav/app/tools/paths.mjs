// Where things are, worked out once.
//
// # The finding
//
// `dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))`
// appeared **22 times** across `test/` and `tools/`, against 7 correct uses of
// `fileURLToPath` — and beside an unused `SRC_DIR` export written to prevent
// exactly that.
//
// It is not only untidy, it is wrong. A `file://` URL percent-encodes its path,
// and `.pathname` hands it back still encoded. So a checkout under a directory
// with a space in it — `C:\Users\Some One\Ksav` — resolves to `Some%20One`,
// every one of those 22 files fails to find `src/`, and the whole suite dies at
// import time with a path nobody can read. `fileURLToPath` decodes; the
// hand-rolled version was a partial reimplementation of it that got the drive
// letter right and the escapes wrong.
//
// The sweeps in `spans.test.mjs` and `enginefacts.test.mjs` read `src/`. They
// have never looked in `test/` or `tools/`, which is precisely where the
// duplication that survived is living.

import path from "node:path";
import { fileURLToPath } from "node:url";

/** The directory a module lives in, given its `import.meta.url`. */
export const dirOf = (url) => path.dirname(fileURLToPath(url));

/** `ksav/app` — everything below is relative to it. */
export const APP = path.resolve(dirOf(import.meta.url), "..");

/** The repository root. */
export const ROOT = path.resolve(APP, "..", "..");

/** `ksav/app/src` — the application. */
export const SRC = path.join(APP, "src");

/** `ksav/app/test` */
export const TEST = path.join(APP, "test");

/** `ksav/app/tools` */
export const TOOLS = path.join(APP, "tools");

/** `ksav/engine` */
export const ENGINE = path.resolve(APP, "..", "engine");

/** Where the test build puts the bundled modules. */
export const TMP_TEST = path.join(APP, ".tmp-test");

/**
 * The path a hosted build is served under, always ending in a slash.
 *
 * `deploy.yml` passes `VITE_PUBLIC_BASE` from `actions/configure-pages`, and
 * that output has **no trailing slash** — `https://user.github.io/ksav`. Taking
 * `new URL(...).pathname` off it gives `/ksav`, and Vite hands that back
 * unchanged as `import.meta.env.BASE_URL`.
 *
 * Which was fine for every asset URL, because Vite joins those itself, and
 * wrong for the one place the application joins one by hand:
 *
 *     `${import.meta.env.BASE_URL}sw.js`   ->   /ksavsw.js
 *
 * The service worker 404'd on every load of the published site, silently — its
 * registration deliberately swallows failures, on the argument that offline
 * support is a bonus and not worth interrupting a writer over. So the whole
 * offline-and-installable half of the browser build was dead on the host, and
 * the only way to find out was to publish it and look, which is what the first
 * run of `deploy.yml` was for.
 *
 * Normalised here rather than at the one call site, because the call site is
 * not the bug: any future reader of `BASE_URL` would have inherited it.
 */
export const assetBaseOf = (publicBase) => {
  const trimmed = (publicBase ?? "").trim();
  if (!trimmed) return "/";
  return new URL(trimmed).pathname.replace(/\/*$/, "/");
};

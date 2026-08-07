// What the service worker may keep, and what it must always ask for.
//
// This module exists because of a bug that had nothing to do with caching
// policy and everything to do with the worker not knowing what it was looking
// at. `sw.js` was cache-first for *every* same-origin GET that was not a
// navigation. `HttpBackend.ask` is a plain `fetch` GET. And `/inbox` is a
// **draining** queue — Girsa hands a source over, the editor polls once a
// second, and the poll that reads it is the poll that empties it.
//
// Put those three together on `ksav serve` and the first response carrying an
// arrival is cached, replayed on every subsequent poll, and inserted into the
// open document once a second for as long as the tab is open. Not a stale
// bundle: a sefer with the same paragraph in it four thousand times.
//
// The rule below is deliberately *closed by default*. It does not enumerate
// what to skip — a list of exclusions is a list to forget to update, which is
// this repository's own recurring failure — it enumerates what an asset looks
// like, and a service is not one:
//
//   - a static asset has a filename extension (`/assets/index-a1b2c3.js`,
//     `/icons/icon-128.png`, `/manifest.webmanifest`)
//   - every service path in the engine's registry is a bare word (`/inbox`,
//     `/compile`, `/spell`)
//
// So a service added to `engine/src/services.rs` tomorrow is uncacheable the
// moment it exists, with nothing here edited and nobody remembering to.
//
// The generated registry is still imported and still checked, as the second of
// two locks: if a service is ever given a path that *does* look like a file,
// the shape rule would say yes and this says no anyway.

import { SERVICE_PATHS } from "./sw-services.gen.js";

/** The engine's service paths, as a set, for an exact match on the pathname. */
const SERVICES = new Set(SERVICE_PATHS);

/**
 * A request's path relative to the worker's own scope, always leading-slashed.
 *
 * The registry's paths are rooted (`/inbox`), because on `ksav serve` the
 * engine is the origin. On GitHub Pages the app lives under `/ksav/`, so the
 * same asset arrives as `/ksav/assets/…` and a rooted comparison would answer
 * about the wrong string. Scope is what makes both cases one case: it is `/`
 * under `ksav serve` and `/ksav/` on Pages, and stripping it leaves the path
 * the registry is written in.
 *
 * A request outside the scope cannot reach this worker at all, so the fallback
 * is only reached by a caller passing something it never sees in a browser.
 */
export function withinScope(pathname, scopePath = "/") {
  if (!scopePath.endsWith("/")) scopePath += "/";
  if (!pathname.startsWith(scopePath)) return pathname;
  return "/" + pathname.slice(scopePath.length);
}

/**
 * May a response for this path be served from, and put into, the cache?
 *
 * Takes a pathname rather than a Request so it is a pure function of a string
 * and can be driven a hundred times from a test without a browser. The caller
 * has already established that this is a same-origin GET that is not a
 * navigation, and has put the path through `withinScope`; this answers the only
 * question left.
 *
 * `services` is a parameter, defaulted, for one reason: it is the only way the
 * second lock can be *tested*. Every path in the registry today is a bare word,
 * so the shape rule below already refuses all of them and the registry check
 * never fires — which was discovered by disabling it and watching the suite
 * stay green. A lock nothing can trip is not a lock, so the test supplies its
 * own registry containing a path that looks like a file, and checks this
 * refuses it anyway. Production passes nothing and gets the real one.
 */
export function isCacheable(pathname, services = SERVICES) {
  // An engine service, whatever it happens to be spelled like. Exact match:
  // `/inboxes` is not `/inbox`, and a prefix test would refuse it wrongly.
  if (services.has(pathname)) return false;
  // Everything else must look like a file. `lastIndexOf` on the final segment,
  // not on the whole path, so `/v1.2/inbox` is still a service and not an
  // asset because of a dot in a directory name.
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last.includes(".");
}

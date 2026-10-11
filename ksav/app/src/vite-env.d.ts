/// <reference types="vite/client" />

/** Inlined at build time: true only when built with VITE_WASM=1. */
declare const __WASM__: boolean;
declare const __APP_VERSION__: string;
/**
 * A fingerprint of the sources **this build** was made from — see `buildId` in
 * `vite.config.ts`.
 *
 * It exists because the version does not move when the site is rebuilt without a
 * release, and the service worker's identity — its URL, and from it its cache
 * name — has to move when the app does. A reader who opens the site after a push
 * has to get the site that was pushed.
 */
declare const __BUILD_ID__: string;
/**
 * The absolute URL this build is published at, or `""` when nothing hosts it.
 *
 * Set by `deploy.yml` through `VITE_PUBLIC_BASE`. Empty is the ordinary case —
 * a desk build, a `ksav serve` on loopback — and the code that reads it has to
 * mean it: there is no fallback host to guess at, and guessing at one is
 * precisely what put `https://ksav.app/` into share links for a domain that
 * does not exist.
 */
declare const __PUBLIC_BASE__: string;

// wasm-pack asset import
declare module "*.wasm?url" {
  const url: string;
  export default url;
}

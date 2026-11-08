// The one rule both bundlers have to agree on: a root-absolute asset is a
// `public/` asset.
//
// # The finding (#116)
//
// `src/styles.css` points at four Hebrew faces as `/fonts/…`, because that is
// how `public/` works: Vite copies the directory to the site root and leaves the
// URL alone. `vite build` therefore succeeded.
//
// The test suite is bundled by esbuild, which resolves a root-absolute URL
// against the filesystem — so `/fonts/…` meant `/fonts/…` on the root of the
// machine, and the bundle step failed before a single test ran. The shipped
// product built, the fence that is supposed to catch a broken product did not,
// and the error read like a broken checkout rather than a broken commit.
//
// This is Vite's public-dir rule, expressed once for esbuild. It lives in its own
// file rather than inside `test/run.mjs` so that `test/publicroot.test.mjs` can
// bundle through it — a resolver tested only by the fact that the suite still
// starts is a resolver nothing observes.

import path from "node:path";

/**
 * Resolve `/fonts/…`, `/icons/…` and friends against `app/public`, and load the
 * binaries as empty strands.
 *
 * A unit test does not exercise glyph data, so there is nothing to gain from
 * reading a font through esbuild; an empty `empty` loader keeps the build cheap
 * and the assertions about layout unaffected.
 *
 * @param {string} appDir the `app/` directory, whose `public/` this serves
 */
export function publicRoot(appDir) {
  return {
    name: "public-root",
    setup(build) {
      build.onResolve({ filter: /^\/(fonts|icons)\// }, (args) => ({
        path: path.join(appDir, "public", args.path.slice(1)),
      }));
      build.onLoad({ filter: /\.(otf|ttf|woff2?)$/ }, () => ({ contents: "", loader: "empty" }));
    },
  };
}

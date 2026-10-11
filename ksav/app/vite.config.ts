import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const pkgVersion: string = createRequire(import.meta.url)("./package.json").version;
import { fileURLToPath } from "node:url";

import { SERVICES } from "./src/services.gen";
// @ts-expect-error — plain JS beside the test that exercises it. See the header
// of that file for why the rule is not written inline here.
import { MODE_PACKAGES, stripStatementPure } from "./tools/pure-annotations.mjs";
// @ts-expect-error — plain JS beside `csp.txt`, which is where the rule about
// how that file may be delivered belongs. No types, and nothing to type.
import { metaPolicy } from "../policy/meta.mjs";
import { assetBaseOf } from "./tools/paths.mjs";

// The Ksav engine (cargo run -- serve) runs on :7878 and exposes the compile +
// registry endpoints. In dev we proxy to it; in production the Rust binary
// serves the built SPA from the same origin, so these same paths just work.
const engine = "http://127.0.0.1:7878";

// __WASM__ is inlined as a literal boolean so the wasm import is tree-shaken
// out of the default (server/desktop) build, and only bundled when VITE_WASM=1.
const wasm = process.env.VITE_WASM === "1";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/**
 * A short fingerprint of **this build** — the sources the bundle is made of.
 *
 * # Why there is a second id at all
 *
 * The service worker is registered as `sw.js?v=…` and takes its cache name from
 * that same string. `?v=` carried the package version, and that is exactly right
 * for a release and exactly wrong for a rebuild without one: `deploy.yml` runs on
 * tags **and** on `workflow_dispatch`, so pushing a fixed site is an ordinary
 * thing to do, and the version does not move.
 *
 * With no movement there, the browser fetches a worker whose **bytes are
 * identical**, finds nothing changed, and installs nothing — so no `install`, no
 * `skipWaiting`, no `activate`, and `activate` is the only code that deletes the
 * `ksav-*` caches belonging to earlier builds. A returning writer keeps the worker
 * they had. `sw.js` says as much in its own header — *"a changed URL is what makes
 * the browser treat this as a new worker at all"* — and that sentence was true of
 * a tag and false of a push, which is the case that now happens most.
 *
 * # What it hashes, and what it deliberately does not
 *
 * The files under `src/`, plus `index.html` and this file. **Not** a timestamp:
 * two builds of one tree have to produce the same id, or every rebuild would
 * orphan every reader's cache and hand them a fresh download of the same app.
 * An id that moves only when the app moves is what makes the cache name worth
 * having, and what makes "did the site change?" a question with an answer.
 *
 * Sorted paths, and the path itself hashed alongside the contents, so a rename
 * and an edit are both visible and neither can be masked by another file moving.
 */
const buildId: string = (() => {
  const srcDir = here("./src");
  const files: string[] = [];
  const walk = (dir: string, rel = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`, r);
      else if (/\.(ts|tsx|css|html|json|svg|webmanifest)$/.test(entry.name)) files.push(r);
    }
  };
  walk(srcDir);
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(rel).update("\0");
    hash.update(readFileSync(`${srcDir}/${rel}`)).update("\0");
  }
  // Outside `src/`, and outside the walk on purpose: these two change the output
  // without being sources of it.
  for (const rel of ["./index.html", "./vite.config.ts"]) {
    hash.update(rel).update("\0");
    hash.update(readFileSync(here(rel))).update("\0");
  }
  return hash.digest("hex").slice(0, 12);
})();

// Content-Security-Policy for the built app.
//
// The engine's output becomes HTML — the preview and the review overlay set
// `innerHTML` from per-page SVG, and the prose-mode table widget builds its own
// markup — so the two builds that receive documents from other people (the
// browser build and `ksav serve`) had no second line of defence, while only the
// Tauri build carried a real CSP.
//
// This was a string here, and the comment beside it asserted that it was the
// *same* policy Tauri already enforced. It was not: this copy was the only one
// that allowed `https://api.github.com`, Tauri's was missing `worker-src`, and
// because policies delivered to one document are **intersected** rather than
// overridden, the narrowest copy silently won. See ksav/policy/README.md.
//
// It is injected only into the *built* HTML, never the dev server's: a strict
// policy there would block Vite's inline HMR client and its eval, breaking
// `npm run dev`. In production the bundle is external, same-origin scripts.
const CSP = readFileSync(here("../policy/csp.txt"), "utf8").trim();

// What a `<meta>` element is allowed to say — see `ksav/policy/meta.mjs`, which
// is the one statement of that rule and is what the fence in
// `app/test/services.test.mjs` reads. In short: `frame-ancestors` is header-only
// by specification, a browser discards it here and prints a console warning per
// page load, and it had been doing so for the whole life of this tag.
const META_ONLY_CSP = metaPolicy(CSP);

// Where the built app will actually be reachable from, if anywhere.
//
// Empty by default, and that is the honest default: for most of this project's
// life there was no host at all — no `gh-pages`, no Netlify, no deploy job —
// while `main.ts` handed out share links naming `https://ksav.app/`, a domain
// that appears nowhere else in this repository. A "link copied" toast over a
// link to nothing is worse than a refusal, so an unset base now *is* a refusal,
// in words, in both languages.
//
// `deploy.yml` sets it to the Pages URL it is publishing to, which is also
// where `base` below has to point: a project Pages site lives under `/ksav/`,
// so every asset URL in the built HTML needs that prefix or the page loads a
// blank body and a fistful of 404s.
const publicBase = (process.env.VITE_PUBLIC_BASE ?? "").trim();
// Through `assetBaseOf`, which is where the trailing slash is put back on.
// `configure-pages` hands out `https://user.github.io/ksav` with no slash, so
// this used to resolve to `/ksav` — harmless for every asset URL, because Vite
// joins those itself, and fatal for the one the application joins by hand:
// `${import.meta.env.BASE_URL}sw.js` became `/ksavsw.js`. See the note there.
const assetBase = assetBaseOf(publicBase);

export default defineConfig({
  base: assetBase,
  define: {
    __WASM__: JSON.stringify(wasm),
    // Baked from package.json so there is one version number in the repository
    // and the running app can compare itself against a release.
    __APP_VERSION__: JSON.stringify(pkgVersion),
    // The build's own fingerprint, for the service worker's identity — see
    // `buildId`. Beside the version, not instead of it: the version still says
    // which *release* a reader is on, and only the fingerprint knows whether the
    // app under them changed since.
    __BUILD_ID__: JSON.stringify(buildId),
    // The absolute URL a share link should name, or "" when nothing hosts this
    // build. See `copyShareLink`.
    __PUBLIC_BASE__: JSON.stringify(publicBase),
  },
  plugins: [
    {
      // Keep the editing modes' key tables out of the minifier's teeth.
      //
      // `@replit/codemirror-emacs` registers its entire keyboard at module
      // scope, and annotates both calls as side-effect free:
      //
      //     for (let i in emacsKeys) {
      //         /*@__PURE__*/EmacsHandler.bindKey(i, emacsKeys[i]);
      //     }
      //     /*@__PURE__*/EmacsHandler.addCommands({ … });
      //
      // `@__PURE__` is a promise to the bundler that a call may be deleted when
      // its result is unused. Both of these exist *only* for their side effect,
      // so the promise is false, and Rollup does what it was told: the built
      // chunk carries the `emacsKeys` table and the `bindKey` method and **not
      // one call registering the one with the other**, nor any of the command
      // implementations. The mode then loads cleanly, adds its CSS class, and
      // has no bindings and no commands. That is the whole of "emacs mode does
      // nothing": in the dev server, which does not tree-shake, it works.
      //
      // The rule lives in `tools/pure-annotations.mjs` so a test can run it
      // against the real dependency on disk: it drops the annotation only where
      // it introduces a statement, and leaves the honest expression-position
      // ones alone. Scoped to the two mode packages, because this is a claim
      // about their source and not a general opinion about pure annotations.
      name: "ksav-mode-side-effects",
      apply: "build",
      enforce: "pre",
      transform(code: string, id: string) {
        if (!MODE_PACKAGES.test(id)) return null;
        const fixed = stripStatementPure(code);
        return fixed === code ? null : { code: fixed, map: null };
      },
    },
    {
      name: "ksav-csp",
      apply: "build",
      transformIndexHtml(html) {
        return {
          html,
          tags: [
            {
              tag: "meta",
              attrs: { "http-equiv": "Content-Security-Policy", content: META_ONLY_CSP },
              injectTo: "head-prepend",
            },
          ],
        };
      },
    },
  ],
  resolve: {
    alias: {
      // Swapping the module, not guarding the call site.
      //
      // Vite's worker plugin resolves `new Worker(new URL(…))` while it walks
      // the module graph — eagerly, before any dead-code elimination — so
      // wrapping the call in `if (__WASM__)` still emitted the worker chunk and
      // the 28 MB wasm module into the server/desktop build, which is exactly
      // the download that build exists to avoid. The stub contains no
      // `new Worker` for the plugin to find.
      "@wasm-worker-host": here(
        wasm ? "./src/wasm-worker-host.ts" : "./src/wasm-worker-host.stub.ts",
      ),
    },
  },
  server: {
    port: 5173,
    // Cargo writes into src-tauri/target while tauri dev is up, and the
    // watcher — which sees every path under app/, including that one — died
    // on the locked dll with EBUSY, taking beforeDevCommand and the whole
    // launch with it. Nothing under src-tauri is frontend source; nothing
    // there wants hot reload.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    // Every route the engine answers, from the engine's own registry.
    //
    // This was a hand-written list, and it carried five of the twelve routes:
    // `/jump`, `/reveal`, `/sefarim`, `/inbox`, `/mekoros` and `/linkify` all
    // 404'd against Vite itself, so click-to-jump and citation autocomplete
    // looked dead in the one place they are developed. A comment here used to
    // congratulate itself for having fixed exactly that for `/spell` and
    // `/suggest`, and left the other six behind. Production was never affected,
    // which is why nobody noticed: there the Rust binary serves the SPA from its
    // own origin, so the paths just work.
    proxy: Object.fromEntries(SERVICES.map((s) => [s.path, engine])),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

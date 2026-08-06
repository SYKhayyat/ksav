import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const pkgVersion: string = createRequire(import.meta.url)("./package.json").version;
import { fileURLToPath } from "node:url";

import { SERVICES } from "./src/services.gen";

// The Ksav engine (cargo run -- serve) runs on :7878 and exposes the compile +
// registry endpoints. In dev we proxy to it; in production the Rust binary
// serves the built SPA from the same origin, so these same paths just work.
const engine = "http://127.0.0.1:7878";

// __WASM__ is inlined as a literal boolean so the wasm import is tree-shaken
// out of the default (server/desktop) build, and only bundled when VITE_WASM=1.
const wasm = process.env.VITE_WASM === "1";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

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

export default defineConfig({
  define: {
    __WASM__: JSON.stringify(wasm),
    // Baked from package.json so there is one version number in the repository
    // and the running app can compare itself against a release.
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  plugins: [
    {
      name: "ksav-csp",
      apply: "build",
      transformIndexHtml(html) {
        return {
          html,
          tags: [
            {
              tag: "meta",
              attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
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

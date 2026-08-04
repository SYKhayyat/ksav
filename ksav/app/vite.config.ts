import { defineConfig } from "vite";
import { createRequire } from "node:module";

const pkgVersion: string = createRequire(import.meta.url)("./package.json").version;
import { fileURLToPath } from "node:url";

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
// Tauri build carried a real CSP. This is the *same* policy Tauri already
// enforces (see src-tauri/tauri.conf.json), so it is a no-op for the desktop
// build and closes the gap for the other two: `wasm-unsafe-eval` lets the WASM
// engine instantiate, `connect-src 'self'` lets the server build reach its own
// API, and everything else is denied.
//
// It is injected only into the *built* HTML, never the dev server's: a strict
// policy there would block Vite's inline HMR client and its eval, breaking
// `npm run dev`. In production the bundle is external, same-origin scripts.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; " +
  // `api.github.com` is the update check and nothing else. One named origin
  // rather than a wildcard, and it is worth writing down what it buys: an
  // installed Ksav has no other way to learn that a release exists, because the
  // installers are downloaded from GitHub and nothing calls home.
  "connect-src 'self' ipc: http://ipc.localhost https://api.github.com; " +
  "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

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
    proxy: {
      "/compile": engine,
      // The checker and its suggestions were missing here, so every spell check
      // in `npm run dev` 404'd against Vite itself — the feature looked dead in
      // the one place it is developed. Production is unaffected: there the Rust
      // binary serves the SPA from its own origin.
      "/spell": engine,
      "/suggest": engine,
      "/commands": engine,
      "/templates": engine,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

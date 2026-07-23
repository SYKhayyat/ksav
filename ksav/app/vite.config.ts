import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// The Ksav engine (cargo run -- serve) runs on :7878 and exposes the compile +
// registry endpoints. In dev we proxy to it; in production the Rust binary
// serves the built SPA from the same origin, so these same paths just work.
const engine = "http://127.0.0.1:7878";

// __WASM__ is inlined as a literal boolean so the wasm import is tree-shaken
// out of the default (server/desktop) build, and only bundled when VITE_WASM=1.
const wasm = process.env.VITE_WASM === "1";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  define: {
    __WASM__: JSON.stringify(wasm),
  },
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

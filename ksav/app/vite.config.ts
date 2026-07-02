import { defineConfig } from "vite";

// The Ksav engine (cargo run -- serve) runs on :7878 and exposes the compile +
// registry endpoints. In dev we proxy to it; in production the Rust binary
// serves the built SPA from the same origin, so these same paths just work.
const engine = "http://127.0.0.1:7878";

// __WASM__ is inlined as a literal boolean so the wasm import is tree-shaken
// out of the default (server/desktop) build, and only bundled when VITE_WASM=1.
export default defineConfig({
  define: {
    __WASM__: JSON.stringify(process.env.VITE_WASM === "1"),
  },
  server: {
    port: 5173,
    proxy: {
      "/compile": engine,
      "/commands": engine,
      "/templates": engine,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

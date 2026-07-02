import { defineConfig } from "vite";

// The Ksav engine (cargo run -- serve) runs on :7878 and exposes the compile +
// registry endpoints. In dev we proxy to it; in production the Rust binary
// serves the built SPA from the same origin, so these same paths just work.
const engine = "http://127.0.0.1:7878";

export default defineConfig({
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

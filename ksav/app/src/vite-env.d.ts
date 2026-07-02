/// <reference types="vite/client" />

/** Inlined at build time: true only when built with VITE_WASM=1. */
declare const __WASM__: boolean;

// wasm-pack asset import
declare module "*.wasm?url" {
  const url: string;
  export default url;
}

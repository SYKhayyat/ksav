/// <reference types="vite/client" />

/** Inlined at build time: true only when built with VITE_WASM=1. */
declare const __WASM__: boolean;
declare const __APP_VERSION__: string;

// wasm-pack asset import
declare module "*.wasm?url" {
  const url: string;
  export default url;
}

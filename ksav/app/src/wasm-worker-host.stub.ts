// The no-wasm build's stand-in for the engine-worker spawner.
//
// Vite's worker plugin resolves `new Worker(new URL(…))` while it walks the
// module graph — eagerly, before any dead-code elimination — so a guard around
// the call site does not stop the worker chunk and its 28 MB wasm module from
// being emitted. The server and desktop builds do not use the wasm engine at
// all, and shipping that download to them would be absurd.
//
// So the *module* is swapped instead of the call guarded: `vite.config.ts`
// aliases `@wasm-worker-host` to this file unless `VITE_WASM=1`, and this file
// contains no `new Worker` for the plugin to find.

export function createEngineWorker(): Worker {
  throw new Error("wasm backend not built — build with VITE_WASM=1 for the offline engine");
}

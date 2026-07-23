// Spawning the engine worker.
//
// One line of real code, in a file of its own, for a build reason.
//
// `new Worker(new URL("./wasm-worker.ts", import.meta.url))` is a *static*
// construct: the bundler resolves it while walking the module graph, long before
// it evaluates any `if`. Putting it directly behind `if (__WASM__)` therefore did
// not tree-shake — it pulled the worker, its glue, and the 28 MB wasm module
// into the default server/desktop build, which is precisely the download that
// build exists to avoid.
//
// Behind a dynamic `import()` that follows an unconditional throw, the branch is
// dead code the bundler can see is dead, and the chunk goes with it. The only
// build that ships the module is the offline one (`VITE_WASM=1`).

export function createEngineWorker(): Worker {
  return new Worker(new URL("./wasm-worker.ts", import.meta.url), { type: "module" });
}

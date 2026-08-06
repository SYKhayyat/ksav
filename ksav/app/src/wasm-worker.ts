/// <reference lib="webworker" />
//
// The Typst engine, off the UI thread.
//
// The wasm build is the one that makes "runs in the browser with no server"
// true, and it used to call straight into `ksav_compile` from the page: the same
// 0.4–2.9 s of layout the desktop build was freezing its window for, freezing
// the tab instead — no scrolling, no typing, no caret, on every pause in typing.
// wasm-bindgen offers no way to yield mid-compile, so the only real fix is
// another thread.
//
// The protocol is deliberately the thinnest thing that works: one message per
// call, correlated by id, JSON strings in and out — the same contract the HTTP
// server and the desktop shell already speak, so the three backends stay
// interchangeable.

import initWasm, * as engine from "./wasmpkg/ksav_wasm.js";
import wasmUrl from "./wasmpkg/ksav_wasm_bg.wasm?url";
import type { ServiceName } from "./services.gen";

// There is no table here anymore, and that is the point.
//
// This file used to carry a `WorkerCall` union and an `FNS` record mapping each
// name to a `ksav_*` export, written by hand beside the wasm crate's list of
// exports, written by hand beside the server's routes. `sefarim` was added to
// the engine, to the wasm binding and to `WasmBackend.sefarim()` — and not to
// the two lines here. `FNS["sefarim"]` was `undefined`, the call threw,
// `sefarim.ts` caught it, and citation autocomplete was dead in the offline
// build with nothing anywhere reporting it. `tsc` could not see it either,
// because the caller's `call(name: string, …)` took a string.
//
// The module now has one export and the name is data. `ServiceName` comes from
// `services.gen.ts`, which is generated from the engine's registry, so a service
// the engine has is a service this worker can already answer, and a name the
// engine does not have will not compile on the calling side.
export type WorkerCall = ServiceName;

export interface WorkerRequest {
  id: number;
  call: WorkerCall;
  input: string;
}

export type WorkerResponse =
  | { id: number; ok: true; output: string }
  | { id: number; ok: false; error: string };

// The module is ~23 MB, so instantiation is started at load and awaited per
// call rather than repeated: the first compile pays for it, the rest do not.
const ready = initWasm({ module_or_path: wasmUrl });

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, call, input } = e.data;
  const reply = (r: WorkerResponse) => (self as unknown as Worker).postMessage(r);
  try {
    await ready;
    reply({ id, ok: true, output: engine.ksav_call(call, input) });
  } catch (err) {
    // A panic inside the engine must come back as a rejected call, not as an
    // unhandled worker error that leaves the page waiting forever.
    reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

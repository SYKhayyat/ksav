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

export type WorkerCall =
  | "compile"
  | "jump"
  | "reveal"
  | "spell"
  | "suggest"
  | "commands"
  | "templates";

export interface WorkerRequest {
  id: number;
  call: WorkerCall;
  input: string;
}

export type WorkerResponse =
  | { id: number; ok: true; output: string }
  | { id: number; ok: false; error: string };

const FNS: Record<WorkerCall, (input: string) => string> = {
  compile: (i) => engine.ksav_compile(i),
  jump: (i) => engine.ksav_jump(i),
  reveal: (i) => engine.ksav_reveal(i),
  spell: (i) => engine.ksav_spell(i),
  suggest: (i) => engine.ksav_suggest(i),
  commands: () => engine.ksav_commands(),
  templates: () => engine.ksav_templates(),
};

// The module is ~23 MB, so instantiation is started at load and awaited per
// call rather than repeated: the first compile pays for it, the rest do not.
const ready = initWasm({ module_or_path: wasmUrl });

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, call, input } = e.data;
  const reply = (r: WorkerResponse) => (self as unknown as Worker).postMessage(r);
  try {
    await ready;
    reply({ id, ok: true, output: FNS[call](input) });
  } catch (err) {
    // A panic inside the engine must come back as a rejected call, not as an
    // unhandled worker error that leaves the page waiting forever.
    reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

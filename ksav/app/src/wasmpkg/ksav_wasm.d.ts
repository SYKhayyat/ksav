/* tslint:disable */
/* eslint-disable */

export function init(): void;

/**
 * Call an engine service by name. JSON in, JSON out — the same contract as the
 * server's route of the same name.
 *
 * An unknown name comes back as a failed-call JSON object rather than a panic:
 * a panic in wasm poisons the module for the rest of the session, and the
 * editor would lose its compiler over a typo in a call it should not have been
 * able to make.
 */
export function ksav_call(name: string, input_json: string): string;

/**
 * Every service this build can answer, as JSON — name, method, path, cost and
 * whether it needs the installed application beside Girsa.
 *
 * Not used by the editor, which reads the generated TypeScript table at build
 * time. It is here so the module can be *asked* what it holds: the smoke test
 * in CI drives every service the engine claims rather than a list of names
 * somebody typed into the test, which is the same mistake one layer up.
 */
export function ksav_services(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly init: () => void;
    readonly ksav_call: (a: number, b: number, c: number, d: number) => [number, number];
    readonly ksav_services: () => [number, number];
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
